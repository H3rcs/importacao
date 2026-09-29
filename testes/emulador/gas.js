/*
 * EMULADOR DO GOOGLE APPS SCRIPT — so para testes locais do GSL.
 *
 * Carrega os .gs num contexto novo a CADA execucao (como o Apps Script faz:
 * variaveis globais nao sobrevivem entre chamadas) e liga esse contexto a
 * um "mundo" persistente em memoria: planilhas, propriedades, cache,
 * Drive, e-mails enviados e gatilhos.
 *
 * O que ele imita de proposito, porque ja derrubou o GSL de verdade:
 *   - a planilha CONVERTE texto: "00123" vira 123, "2025-07-01" e
 *     "01/07/2025" viram Date — a nao ser que a celula esteja como texto (@);
 *   - celula com mais de 50.000 caracteres da erro;
 *   - CacheService recusa valor acima de 100 KB;
 *   - google.script.run devolve null quando a resposta tem Date;
 *   - funcoes terminadas em "_" nao sao chamaveis pelo navegador;
 *   - o HtmlService apaga o que parece comentario dentro de <script>
 *     (opcao apagarComentarios: 'simples' reproduz o erro da 4.2.1).
 */
'use strict';
process.env.TZ = 'America/Bahia';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const TZ_PADRAO = 'America/Bahia';

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

function erroGAS(msg) { const e = new Error(msg); e.name = 'Exception'; return e; }

/* Date de qualquer realm (o script roda num contexto vm separado). */
function ehData(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function bytesAssinados(buf) { return Array.from(buf, (b) => (b > 127 ? b - 256 : b)); }
function paraBuffer(v) {
  if (Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return Buffer.from(v.map((b) => b & 255));
  return Buffer.from(String(v == null ? '' : v), 'utf8');
}

/* Partes da data num fuso (sem depender do TZ do processo). */
function partesNoFuso(data, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || TZ_PADRAO, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
  });
  const p = {};
  f.formatToParts(data).forEach((x) => { p[x.type] = x.value; });
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { a: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, dow: dias[p.weekday], ms: data.getMilliseconds() };
}
function deslocamentoMin(data, tz) {
  const p = partesNoFuso(data, tz);
  const comoUTC = Date.UTC(p.a, p.m - 1, p.d, p.h, p.mi, p.s, p.ms);
  return Math.round((comoUTC - data.getTime()) / 60000);
}

const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DIAS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Utilities.formatDate — padrao do Java SimpleDateFormat (o que o GSL usa). */
function formatarData(data, tz, padrao) {
  if (!ehData(data) || isNaN(data.getTime())) throw erroGAS('Invalid argument: date');
  data = new Date(data.getTime());
  const p = partesNoFuso(data, tz);
  const z = (n, t) => String(n).padStart(t, '0');
  let saida = '';
  for (let i = 0; i < padrao.length;) {
    const c = padrao[i];
    if (c === "'") {
      const fim = padrao.indexOf("'", i + 1);
      if (fim === i + 1) { saida += "'"; i += 2; continue; }
      saida += padrao.slice(i + 1, fim === -1 ? padrao.length : fim);
      i = fim === -1 ? padrao.length : fim + 1; continue;
    }
    if (!/[a-zA-Z]/.test(c)) { saida += c; i++; continue; }
    let n = 1; while (padrao[i + n] === c) n++;
    const off = deslocamentoMin(data, tz);
    switch (c) {
      case 'y': saida += n === 2 ? z(p.a % 100, 2) : z(p.a, n); break;
      case 'Y': saida += n === 2 ? z(p.a % 100, 2) : z(p.a, n); break;
      case 'M': saida += n >= 4 ? MESES_EN[p.m - 1] : n === 3 ? MESES_EN[p.m - 1].slice(0, 3) : z(p.m, n); break;
      case 'd': saida += z(p.d, n); break;
      case 'H': saida += z(p.h, n); break;
      case 'k': saida += z(p.h || 24, n); break;
      case 'h': saida += z((p.h % 12) || 12, n); break;
      case 'm': saida += z(p.mi, n); break;
      case 's': saida += z(p.s, n); break;
      case 'S': saida += z(p.ms, 3).slice(0, n); break;
      case 'E': saida += n >= 4 ? DIAS_EN[p.dow] : DIAS_EN[p.dow].slice(0, 3); break;
      case 'u': saida += String(p.dow || 7); break;
      case 'a': saida += p.h < 12 ? 'AM' : 'PM'; break;
      case 'Z': { const s = off < 0 ? '-' : '+'; const a = Math.abs(off); saida += s + z(Math.floor(a / 60), 2) + z(a % 60, 2); break; }
      case 'X': { const s = off < 0 ? '-' : '+'; const a = Math.abs(off); saida += off === 0 ? 'Z' : s + z(Math.floor(a / 60), 2) + (n >= 3 ? ':' : '') + (n >= 2 ? z(a % 60, 2) : ''); break; }
      case 'z': saida += 'BRT'; break;
      case 'D': { const ini = Date.UTC(p.a, 0, 1); saida += z(Math.round((Date.UTC(p.a, p.m - 1, p.d) - ini) / 864e5) + 1, n); break; }
      case 'w': { const d = new Date(Date.UTC(p.a, p.m - 1, p.d)); const dia = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dia); const a1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); saida += z(Math.ceil(((d - a1) / 864e5 + 1) / 7), n); break; }
      default: throw erroGAS('formatDate: letra de padrao nao suportada pelo emulador: ' + c);
    }
    i += n;
  }
  return saida;
}

/* Data local (fuso da planilha) a meia-noite. */
function dataLocal(a, m, d, h, mi, s) {
  return new Date(a, m - 1, d, h || 0, mi || 0, s || 0);
}

/* O que a planilha faz com um texto digitado numa celula que NAO e texto (@). */
function converterComoPlanilha(v, formato) {
  if (v === null || v === undefined) return '';
  if (ehData(v)) return new Date(v.getTime());
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v !== 'string') return String(v);
  if (formato === '@') return v;
  if (v.charAt(0) === "'") return v.slice(1);
  const t = v.trim();
  if (t === '') return v === '' ? '' : v;
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return Number(t);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return dataLocal(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return dataLocal(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);           // pt_BR: dd/mm/aaaa
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return dataLocal(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return dataLocal(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
  if (/^(TRUE|FALSE)$/i.test(t)) return /^TRUE$/i.test(t);
  return v;
}

function textoExibido(v) {
  if (ehData(v)) return formatarData(v, TZ_PADRAO, 'dd/MM/yyyy');
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/* ------------------------------------------------------------------ */
/* MUNDO — o que persiste entre execucoes                              */
/* ------------------------------------------------------------------ */

class Mundo {
  constructor(opcoes) {
    this.opcoes = Object.assign({ dono: 'dono@bartofil.com.br', urlApp: 'http://localhost:0/exec' }, opcoes || {});
    this.seq = 1000;
    this.planilhas = new Map();   // id -> Planilha
    this.arquivos = new Map();    // id -> {id,nome,mime,bytes,pais:Set,lixo,criado,descricao}
    this.pastas = new Map();      // id -> {id,nome,pais:Set,lixo}
    this.props = { script: {}, user: {}, document: {} };
    this.cache = new Map();       // chave -> {v, expira}
    this.emails = [];
    this.gatilhos = [];
    this.logs = [];
    this.chamadasPlanilha = 0;
    const raiz = this.novaPasta('Meu Drive', null);
    this.raiz = raiz.id;
  }
  novoId(prefixo) { return (prefixo || 'id') + '_' + (++this.seq).toString(36) + crypto.randomBytes(6).toString('hex'); }
  novaPasta(nome, pai) {
    const p = { id: this.novoId('pasta'), nome: nome, pais: new Set(pai ? [pai] : []), lixo: false };
    this.pastas.set(p.id, p); return p;
  }
  novoArquivo(nome, mime, bytes, pai) {
    const a = { id: this.novoId('arq'), nome: nome, mime: mime || 'application/octet-stream', bytes: bytes || Buffer.alloc(0),
      pais: new Set([pai || this.raiz]), lixo: false, criado: new Date(), descricao: '' };
    this.arquivos.set(a.id, a); return a;
  }
  novaPlanilha(nome, linhas, colunas) {
    const arq = this.novoArquivo(nome, 'application/vnd.google-apps.spreadsheet', Buffer.alloc(0));
    const p = new Planilha(this, arq.id, nome);
    p.abas.push(new Aba(p, 'Página1', linhas || 1000, colunas || this.opcoes.colunasPadrao || 26));
    this.planilhas.set(arq.id, p);
    return p;
  }
}

class Planilha {
  constructor(mundo, id, nome) { this.mundo = mundo; this.id = id; this.nome = nome; this.abas = []; this.tz = TZ_PADRAO; this.seqAba = 0; }
  get arquivo() { return this.mundo.arquivos.get(this.id); }
}

class Aba {
  constructor(planilha, nome, linhas, colunas) {
    this.planilha = planilha; this.nome = nome; this.id = planilha.seqAba++;
    this.maxL = linhas; this.maxC = colunas;
    this.dados = [];                 // linhas esparsas: dados[l][c] (0-based)
    this.formatos = new Map();       // 'l,c' -> formato
    this.formatoColuna = new Map();  // c -> formato
    this.congeladas = 0;
  }
  formato(l, c) {
    const k = l + ',' + c;
    if (this.formatos.has(k)) return this.formatos.get(k);
    return this.formatoColuna.get(c) || '';
  }
  ler(l, c) { const linha = this.dados[l]; if (!linha) return ''; const v = linha[c]; return v === undefined ? '' : v; }
  gravar(l, c, v) {
    if (typeof v === 'string' && v.length > 50000) {
      throw erroGAS('Your input contains more than the maximum of 50000 characters in a single cell.');
    }
    if (!this.dados[l]) this.dados[l] = [];
    this.dados[l][c] = converterComoPlanilha(v, this.formato(l, c));
  }
  ultimaLinha() {
    for (let l = this.dados.length - 1; l >= 0; l--) {
      const linha = this.dados[l];
      if (linha && linha.some((v) => v !== '' && v !== undefined && v !== null)) return l + 1;
    }
    return 0;
  }
  ultimaColuna() {
    let max = 0;
    this.dados.forEach((linha) => { if (!linha) return; for (let c = linha.length - 1; c >= 0; c--) { const v = linha[c]; if (v !== '' && v !== undefined && v !== null) { if (c + 1 > max) max = c + 1; break; } } });
    return max;
  }
}

/* ------------------------------------------------------------------ */
/* Objetos expostos ao script                                          */
/* ------------------------------------------------------------------ */

/* Metodo que o emulador nao conhece vira erro visivel — nao silencio. */
function estrito(nome, alvo) {
  return new Proxy(alvo, {
    get(o, k) {
      if (k in o || typeof k === 'symbol' || k === 'then' || k === 'toJSON' || k === 'inspect') return o[k];
      throw erroGAS('[emulador] ' + nome + '.' + String(k) + ' nao implementado');
    }
  });
}

/* Qualquer metodo devolve o proprio objeto (formatacao, DocumentApp...). */
function encadeavel(nome, extras) {
  const alvo = function () {};
  const p = new Proxy(alvo, {
    get(o, k) {
      if (extras && k in extras) return extras[k];
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (k === 'toString') return () => '[' + nome + ']';
      return function () { return p; };
    },
    apply() { return p; }
  });
  return p;
}

function a1ParaCoords(a1) {
  const m = String(a1).replace(/\$/g, '').split('!').pop().match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/i);
  if (!m) throw erroGAS('Range not found');
  const col = (s) => s.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { c1: m[1] ? col(m[1]) : 1, l1: m[2] ? +m[2] : 1, c2: m[3] !== undefined ? (m[3] ? col(m[3]) : null) : (m[1] ? col(m[1]) : null),
    l2: m[4] !== undefined ? (m[4] ? +m[4] : null) : (m[2] ? +m[2] : null), c1Vazio: !m[1], l1Vazio: !m[2] };
}
function colunaA1(c) { let s = ''; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; }

function fazerIntervalo(aba, l, c, nl, nc) {
  const m = aba.planilha.mundo;
  if (!(l >= 1) || !(c >= 1) || !(nl >= 1) || !(nc >= 1) || [l, c, nl, nc].some((x) => Math.floor(x) !== x)) {
    throw erroGAS('The starting row/column of the range is too small or the number of rows/columns is not valid.');
  }
  if (l + nl - 1 > aba.maxL || c + nc - 1 > aba.maxC) {
    throw erroGAS('The coordinates of the range are outside the dimensions of the sheet.');
  }
  const conferir = (vals, oque) => {
    if (!Array.isArray(vals) || vals.length !== nl) throw erroGAS('The number of rows in the data does not match the number of rows in the range. The data has ' + (vals && vals.length) + ' but the range has ' + nl + '.');
    vals.forEach((r) => { if (!Array.isArray(r) || r.length !== nc) throw erroGAS('The number of columns in the data does not match the number of columns in the range. The data has ' + (r && r.length) + ' but the range has ' + nc + '.'); });
  };
  const self = {
    getValues() { m.chamadasPlanilha++; const out = []; for (let i = 0; i < nl; i++) { const r = []; for (let j = 0; j < nc; j++) { const v = aba.ler(l - 1 + i, c - 1 + j); r.push(ehData(v) ? new m.DataDoScript(v.getTime()) : v); } out.push(r); } return out; },
    getDisplayValues() { return self.getValues().map((r) => r.map(textoExibido)); },
    getValue() { return self.getValues()[0][0]; },
    getDisplayValue() { return textoExibido(self.getValue()); },
    setValues(vals) { m.chamadasPlanilha++; conferir(vals); for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) aba.gravar(l - 1 + i, c - 1 + j, vals[i][j]); return self; },
    setValue(v) { m.chamadasPlanilha++; for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) aba.gravar(l - 1 + i, c - 1 + j, v); return self; },
    setNumberFormat(f) { for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) aba.formatos.set((l - 1 + i) + ',' + (c - 1 + j), f); if (nl >= aba.maxL - l + 1) for (let j = 0; j < nc; j++) aba.formatoColuna.set(c - 1 + j, f); return self; },
    setNumberFormats(fs) { for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) aba.formatos.set((l - 1 + i) + ',' + (c - 1 + j), fs[i][j]); return self; },
    getNumberFormat() { return aba.formato(l - 1, c - 1) || 'General'; },
    getNumberFormats() { const o = []; for (let i = 0; i < nl; i++) { const r = []; for (let j = 0; j < nc; j++) r.push(aba.formato(l - 1 + i, c - 1 + j) || 'General'); o.push(r); } return o; },
    clearContent() { for (let i = 0; i < nl; i++) for (let j = 0; j < nc; j++) { const linha = aba.dados[l - 1 + i]; if (linha) linha[c - 1 + j] = ''; } return self; },
    clear() { return self.clearContent(); },
    getRow() { return l; }, getColumn() { return c; }, getNumRows() { return nl; }, getNumColumns() { return nc; },
    getLastRow() { return l + nl - 1; }, getLastColumn() { return c + nc - 1; },
    getSheet() { return fazerAba(aba); },
    getA1Notation() { return colunaA1(c) + l + (nl > 1 || nc > 1 ? ':' + colunaA1(c + nc - 1) + (l + nl - 1) : ''); },
    offset(dl, dc, nnl, nnc) { return fazerIntervalo(aba, l + dl, c + dc, nnl || nl, nnc || nc); },
    activate() { return self; }
  };
  ['setFontWeight', 'setFontWeights', 'setBackground', 'setBackgrounds', 'setFontColor', 'setFontColors', 'setHorizontalAlignment', 'setVerticalAlignment',
   'setWrap', 'setWrapStrategy', 'setBorder', 'setFontSize', 'setFontFamily', 'setNote', 'clearFormat', 'setDataValidation', 'setDataValidations',
   'clearDataValidations', 'protect', 'setFontStyle', 'setFontLine', 'setTextStyle', 'merge', 'breakApart', 'setBackgroundRGB', 'setShowHyperlink'].forEach((k) => {
    self[k] = function () { return self; };
  });
  return estrito('Range', self);
}

function fazerAba(aba) {
  const m = aba.planilha.mundo;
  const self = {
    getName() { return aba.nome; },
    setName(n) {
      if (aba.planilha.abas.some((a) => a !== aba && a.nome === n)) throw erroGAS('A sheet with the name "' + n + '" already exists. Please enter another name.');
      aba.nome = String(n); return self;
    },
    getSheetId() { return aba.id; },
    getParent() { return fazerPlanilha(aba.planilha); },
    getRange(a, b, cn, d) {
      if (typeof a === 'string') {
        const k = a1ParaCoords(a);
        const l1 = k.l1Vazio ? 1 : k.l1, c1 = k.c1Vazio ? 1 : k.c1;
        const l2 = k.l2 === null ? (k.l1Vazio ? aba.maxL : l1) : k.l2;
        const c2 = k.c2 === null ? (k.c1Vazio ? aba.maxC : c1) : k.c2;
        return fazerIntervalo(aba, l1, c1, l2 - l1 + 1, c2 - c1 + 1);
      }
      return fazerIntervalo(aba, a, b, cn === undefined ? 1 : cn, d === undefined ? 1 : d);
    },
    getDataRange() { return fazerIntervalo(aba, 1, 1, Math.max(1, aba.ultimaLinha()), Math.max(1, aba.ultimaColuna())); },
    getLastRow() { m.chamadasPlanilha++; return aba.ultimaLinha(); },
    getLastColumn() { m.chamadasPlanilha++; return aba.ultimaColuna(); },
    getMaxRows() { return aba.maxL; },
    getMaxColumns() { return aba.maxC; },
    insertRowsAfter(depois, n) {
      aba.dados.splice(depois, 0, ...Array.from({ length: n }, () => undefined)); aba.maxL += n;
      // formato das celulas: as linhas de baixo descem; as novas herdam o da linha de cima
      const novo = new Map();
      aba.formatos.forEach((f, k) => {
        const [l, c] = k.split(',').map(Number);
        novo.set((l >= depois ? l + n : l) + ',' + c, f);
        if (l === depois - 1) for (let i = 0; i < n; i++) novo.set((depois + i) + ',' + c, f);
      });
      aba.formatos = novo;
      return self;
    },
    insertRowsBefore(antes, n) { return self.insertRowsAfter(antes - 1, n); },
    insertRows(antes, n) { return self.insertRowsAfter(antes - 1, n || 1); },
    insertColumnsAfter(depois, n) { aba.dados.forEach((r) => { if (r) r.splice(depois, 0, ...Array(n).fill('')); }); aba.maxC += n; return self; },
    deleteRows(ini, n) {
      if (ini < 1 || ini + n - 1 > aba.maxL) throw erroGAS('Those rows are out of bounds.');
      if (n >= aba.maxL - aba.congeladas && aba.maxL - n < 1) throw erroGAS('Sorry, it is not possible to delete all non-frozen rows.');
      aba.dados.splice(ini - 1, n); aba.maxL -= n;
      const novo = new Map();
      aba.formatos.forEach((f, k) => {
        const [l, c] = k.split(',').map(Number);
        if (l < ini - 1) novo.set(k, f); else if (l >= ini - 1 + n) novo.set((l - n) + ',' + c, f);
      });
      aba.formatos = novo;
      return self;
    },
    deleteRow(l) { return self.deleteRows(l, 1); },
    deleteColumns(ini, n) { aba.dados.forEach((r) => { if (r) r.splice(ini - 1, n); }); aba.maxC -= n; return self; },
    appendRow(vals) {
      m.chamadasPlanilha++;
      const l = aba.ultimaLinha() + 1;
      if (l > aba.maxL) aba.maxL = l;
      if (vals.length > aba.maxC) aba.maxC = vals.length;
      vals.forEach((v, j) => aba.gravar(l - 1, j, v));
      return self;
    },
    setFrozenRows(n) { aba.congeladas = n; return self; },
    getFrozenRows() { return aba.congeladas; },
    setFrozenColumns() { return self; },
    clear() { aba.dados = []; return self; },
    clearContents() { aba.dados = []; return self; },
    hideSheet() { return self; }, showSheet() { return self; }, isSheetHidden() { return false; },
    setTabColor() { return self; }, autoResizeColumns() { return self; }, autoResizeColumn() { return self; },
    setColumnWidth() { return self; }, setColumnWidths() { return self; }, setRowHeight() { return self; },
    activate() { return self; }, protect() { return encadeavel('Protection'); },
    getIndex() { return aba.planilha.abas.indexOf(aba) + 1; },
    getType() { return 'GRID'; }
  };
  return estrito('Sheet', self);
}

function fazerPlanilha(p) {
  const m = p.mundo;
  const self = {
    getId() { return p.id; },
    getName() { return p.nome; },
    rename(n) { p.nome = n; const a = p.arquivo; if (a) a.nome = n; return self; },
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit'; },
    getSheets() { return p.abas.map(fazerAba); },
    getSheetByName(n) { m.chamadasPlanilha++; const a = p.abas.find((x) => x.nome === n); return a ? fazerAba(a) : null; },
    getSheetById(id) { const a = p.abas.find((x) => x.id === id); return a ? fazerAba(a) : null; },
    insertSheet(nome, indice) {
      let n = typeof nome === 'string' ? nome : null;
      if (typeof nome === 'number') { indice = nome; n = null; }
      if (!n) { let k = p.abas.length + 1; while (p.abas.some((a) => a.nome === 'Página' + k)) k++; n = 'Página' + k; }
      if (p.abas.some((a) => a.nome === n)) throw erroGAS('A sheet with the name "' + n + '" already exists. Please enter another name.');
      const a = new Aba(p, n, 1000, m.opcoes.colunasPadrao || 26);
      if (typeof indice === 'number') p.abas.splice(indice, 0, a); else p.abas.push(a);
      return fazerAba(a);
    },
    deleteSheet(aba) { const i = p.abas.findIndex((a) => a.nome === aba.getName()); if (p.abas.length <= 1) throw erroGAS('You can\'t remove all the sheets in a document.'); if (i >= 0) p.abas.splice(i, 1); },
    setSpreadsheetTimeZone(tz) { p.tz = tz; }, getSpreadsheetTimeZone() { return p.tz; },
    getSpreadsheetLocale() { return 'pt_BR'; }, setSpreadsheetLocale() {},
    toast() {}, getActiveSheet() { return fazerAba(p.abas[0]); }, setActiveSheet(a) { return a; },
    getOwner() { return { getEmail: () => m.opcoes.dono }; },
    addEditor() { return self; }, addViewer() { return self; },
    getBlob() { return fazerBlob(Buffer.from('xlsx-falso'), 'application/pdf', p.nome); },
    getAs(mime) { return fazerBlob(Buffer.from('export-falso'), mime, p.nome); }
  };
  return estrito('Spreadsheet', self);
}

function fazerBlob(bytes, tipo, nome) {
  let dados = paraBuffer(bytes), mime = tipo || 'application/octet-stream', n = nome || null;
  const self = {
    getBytes() { return bytesAssinados(dados); },
    getDataAsString(cs) { return dados.toString('utf8'); },
    setDataFromString(s) { dados = Buffer.from(String(s), 'utf8'); return self; },
    setBytes(b) { dados = paraBuffer(b); return self; },
    getContentType() { return mime; },
    setContentType(t) { mime = t; return self; },
    getName() { return n; },
    setName(x) { n = x; return self; },
    copyBlob() { return fazerBlob(Buffer.from(dados), mime, n); },
    getAs(t) { return fazerBlob(Buffer.from(dados), t, n); },
    getBlob() { return self; },
    isGoogleType() { return false; },
    _buffer() { return dados; }
  };
  return estrito('Blob', self);
}

function iterador(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => { if (i >= lista.length) throw erroGAS('Cannot retrieve the next object: iterator has reached the end.'); return lista[i++]; } };
}

function fazerPasta(m, p) {
  const self = {
    getId() { return p.id; }, getName() { return p.nome; }, setName(n) { p.nome = n; return self; },
    getUrl() { return 'https://drive.google.com/drive/folders/' + p.id; },
    createFolder(nome) { return fazerPasta(m, m.novaPasta(nome, p.id)); },
    createFile(a, b, c) {
      let arq;
      if (typeof a === 'string') arq = m.novoArquivo(a, c || 'text/plain', Buffer.from(String(b || ''), 'utf8'), p.id);
      else arq = m.novoArquivo(a.getName() || 'Sem título', a.getContentType(), Buffer.from(a._buffer ? a._buffer() : paraBuffer(a.getBytes())), p.id);
      return fazerArquivo(m, arq);
    },
    getFiles() { return iterador([...m.arquivos.values()].filter((a) => a.pais.has(p.id) && !a.lixo).map((a) => fazerArquivo(m, a))); },
    getFolders() { return iterador([...m.pastas.values()].filter((x) => x.pais.has(p.id) && !x.lixo).map((x) => fazerPasta(m, x))); },
    getFilesByName(n) { return iterador([...m.arquivos.values()].filter((a) => a.pais.has(p.id) && !a.lixo && a.nome === n).map((a) => fazerArquivo(m, a))); },
    getFoldersByName(n) { return iterador([...m.pastas.values()].filter((x) => x.pais.has(p.id) && !x.lixo && x.nome === n).map((x) => fazerPasta(m, x))); },
    addFile(f) { const a = m.arquivos.get(f.getId()); if (a) a.pais.add(p.id); return self; },
    removeFile(f) { const a = m.arquivos.get(f.getId()); if (a) a.pais.delete(p.id); return self; },
    getParents() { return iterador([...p.pais].map((id) => fazerPasta(m, m.pastas.get(id)))); },
    setSharing() { return self; }, setTrashed(v) { p.lixo = !!v; return self; }, isTrashed() { return p.lixo; },
    moveTo(dest) { p.pais = new Set([dest.getId()]); return self; },
    setDescription() { return self; }, getSharingAccess() { return 'PRIVATE'; }, getSharingPermission() { return 'NONE'; },
    addEditor() { return self; }, addViewer() { return self; }
  };
  return estrito('Folder', self);
}

function fazerArquivo(m, a) {
  const self = {
    getId() { return a.id; }, getName() { return a.nome; }, setName(n) { a.nome = n; return self; },
    getUrl() { return 'https://drive.google.com/file/d/' + a.id + '/view'; },
    getDownloadUrl() { return 'https://drive.google.com/uc?id=' + a.id + '&export=download'; },
    getBlob() { return fazerBlob(Buffer.from(a.bytes), a.mime, a.nome); },
    getAs(t) { return fazerBlob(Buffer.from(a.bytes), t, a.nome); },
    getMimeType() { return a.mime; }, getSize() { return a.bytes.length; },
    getDateCreated() { return new m.DataDoScript(a.criado.getTime()); }, getLastUpdated() { return new m.DataDoScript(a.criado.getTime()); },
    setTrashed(v) { a.lixo = !!v; return self; }, isTrashed() { return a.lixo; },
    getParents() { return iterador([...a.pais].map((id) => fazerPasta(m, m.pastas.get(id)))); },
    moveTo(dest) { a.pais = new Set([dest.getId()]); return self; },
    setSharing() { return self; }, setDescription(d) { a.descricao = d; return self; }, getDescription() { return a.descricao; },
    getThumbnail() { return fazerBlob(Buffer.from([137, 80, 78, 71]), 'image/png', 'thumb.png'); },
    makeCopy(n, pasta) { const c = m.novoArquivo(n || a.nome, a.mime, Buffer.from(a.bytes), pasta ? pasta.getId() : [...a.pais][0]); return fazerArquivo(m, c); },
    getSharingAccess() { return 'PRIVATE'; }, getSharingPermission() { return 'NONE'; },
    getOwner() { return { getEmail: () => m.opcoes.dono }; },
    addEditor() { return self; }, addViewer() { return self; }
  };
  return estrito('File', self);
}

/* ------------------------------------------------------------------ */
/* Servicos                                                            */
/* ------------------------------------------------------------------ */

function servicos(m, execucao) {
  const Enum = (nome, chaves) => { const o = {}; chaves.forEach((k) => { o[k] = nome + '.' + k; }); return o; };

  const SpreadsheetApp = estrito('SpreadsheetApp', {
    openById(id) {
      const p = m.planilhas.get(String(id));
      if (!p || (p.arquivo && p.arquivo.lixo)) throw erroGAS('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
      return fazerPlanilha(p);
    },
    openByUrl(url) {
      const k = String(url).match(/\/d\/([^/?#]+)/);
      if (!k || !m.planilhas.get(k[1])) throw erroGAS('Unexpected error while getting the method or property openByUrl on object SpreadsheetApp.');
      return fazerPlanilha(m.planilhas.get(k[1]));
    },
    create(nome, l, c) { return fazerPlanilha(m.novaPlanilha(nome, l, c)); },
    flush() {},
    getActiveSpreadsheet() { return null; },
    getActive() { return null; },
    newDataValidation() { return encadeavel('DataValidationBuilder'); },
    newTextStyle() { return encadeavel('TextStyleBuilder'); },
    BorderStyle: Enum('BorderStyle', ['SOLID', 'DOTTED', 'DASHED', 'SOLID_MEDIUM', 'SOLID_THICK', 'DOUBLE']),
    WrapStrategy: Enum('WrapStrategy', ['WRAP', 'OVERFLOW', 'CLIP']),
    DataValidationCriteria: Enum('DataValidationCriteria', ['VALUE_IN_LIST']),
    ProtectionType: Enum('ProtectionType', ['RANGE', 'SHEET'])
  });

  const DriveApp = estrito('DriveApp', {
    createFolder(n) { return fazerPasta(m, m.novaPasta(n, m.raiz)); },
    getFolderById(id) { const p = m.pastas.get(String(id)); if (!p) throw erroGAS('No item with the given ID could be found, or you do not have permission to access it.'); return fazerPasta(m, p); },
    getFileById(id) { const a = m.arquivos.get(String(id)); if (!a) throw erroGAS('No item with the given ID could be found, or you do not have permission to access it.'); return fazerArquivo(m, a); },
    getRootFolder() { return fazerPasta(m, m.pastas.get(m.raiz)); },
    getFoldersByName(n) { return iterador([...m.pastas.values()].filter((p) => p.nome === n && !p.lixo).map((p) => fazerPasta(m, p))); },
    getFilesByName(n) { return iterador([...m.arquivos.values()].filter((a) => a.nome === n && !a.lixo).map((a) => fazerArquivo(m, a))); },
    createFile(a, b, c) { return fazerPasta(m, m.pastas.get(m.raiz)).createFile(a, b, c); },
    Access: Enum('Access', ['ANYONE', 'ANYONE_WITH_LINK', 'DOMAIN', 'DOMAIN_WITH_LINK', 'PRIVATE']),
    Permission: Enum('Permission', ['VIEW', 'EDIT', 'COMMENT', 'OWNER', 'ORGANIZER', 'NONE'])
  });

  const loja = (tipo) => estrito('Properties', {
    getProperty(k) { const v = m.props[tipo][k]; return v === undefined ? null : v; },
    setProperty(k, v) { m.props[tipo][k] = String(v); return this; },
    setProperties(o, apagarOutras) { if (apagarOutras) m.props[tipo] = {}; Object.keys(o).forEach((k) => { m.props[tipo][k] = String(o[k]); }); return this; },
    getProperties() { return Object.assign({}, m.props[tipo]); },
    getKeys() { return Object.keys(m.props[tipo]); },
    deleteProperty(k) { delete m.props[tipo][k]; return this; },
    deleteAllProperties() { m.props[tipo] = {}; return this; }
  });
  const PropertiesService = estrito('PropertiesService', {
    getScriptProperties: () => loja('script'), getUserProperties: () => loja('user'), getDocumentProperties: () => loja('document')
  });

  const agora = () => Date.now();
  const cache = estrito('Cache', {
    get(k) { const e = m.cache.get(String(k)); if (!e) return null; if (e.expira < agora()) { m.cache.delete(String(k)); return null; } return e.v; },
    getAll(ks) { const o = {}; ks.forEach((k) => { const v = cache.get(k); if (v !== null) o[k] = v; }); return o; },
    put(k, v, s) {
      k = String(k); v = String(v);
      if (k.length > 250) throw erroGAS('Argument too large: key');
      if (Buffer.byteLength(v, 'utf8') > 100 * 1024) throw erroGAS('Argument too large: value');
      m.cache.set(k, { v: v, expira: agora() + Math.min(Number(s || 600), 21600) * 1000 });
    },
    putAll(o, s) { Object.keys(o).forEach((k) => cache.put(k, o[k], s)); },
    remove(k) { m.cache.delete(String(k)); },
    removeAll(ks) { ks.forEach((k) => m.cache.delete(String(k))); }
  });
  const CacheService = estrito('CacheService', { getScriptCache: () => cache, getUserCache: () => cache, getDocumentCache: () => null });

  const trava = () => estrito('Lock', { waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } });
  const LockService = estrito('LockService', { getScriptLock: trava, getUserLock: trava, getDocumentLock: trava });

  const Session = estrito('Session', {
    getActiveUser: () => ({ getEmail: () => execucao.contaGoogle || '', getUserLoginId: () => execucao.contaGoogle || '' }),
    getEffectiveUser: () => ({ getEmail: () => m.opcoes.dono }),
    getScriptTimeZone: () => TZ_PADRAO,
    getActiveUserLocale: () => 'pt',
    getTemporaryActiveUserKey: () => 'chave-' + (execucao.contaGoogle || 'anonimo')
  });

  const Utilities = estrito('Utilities', {
    formatDate: (d, tz, f) => formatarData(d, tz, f),
    getUuid: () => crypto.randomUUID(),
    sleep: () => {},
    computeDigest(alg, valor, charset) {
      const nomes = { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256', SHA_384: 'sha384', SHA_512: 'sha512' };
      const a = nomes[String(alg).split('.').pop()] || 'sha256';
      return bytesAssinados(crypto.createHash(a).update(paraBuffer(valor)).digest());
    },
    computeHmacSha256Signature(v, k) { return bytesAssinados(crypto.createHmac('sha256', paraBuffer(k)).update(paraBuffer(v)).digest()); },
    base64Encode: (v) => paraBuffer(v).toString('base64'),
    base64EncodeWebSafe: (v) => paraBuffer(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64Decode: (s) => bytesAssinados(Buffer.from(String(s), 'base64')),
    base64DecodeWebSafe: (s) => bytesAssinados(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (d, t, n) => fazerBlob(d, t, n),
    formatString: (f, ...a) => { let i = 0; return String(f).replace(/%(\d*\.?\d*)([sdif%])/g, (x, w, t) => t === '%' ? '%' : String(a[i++])); },
    parseCsv: (s) => String(s).split(/\r?\n/).filter(Boolean).map((l) => l.split(',')),
    zip: (blobs, n) => fazerBlob(Buffer.from('zip'), 'application/zip', n),
    DigestAlgorithm: Enum('DigestAlgorithm', ['MD5', 'SHA_1', 'SHA_256', 'SHA_384', 'SHA_512']),
    Charset: Enum('Charset', ['UTF_8', 'US_ASCII'])
  });

  const ScriptApp = estrito('ScriptApp', {
    getService: () => ({ getUrl: () => m.opcoes.urlApp, isEnabled: () => true }),
    getOAuthToken: () => 'token-oauth-falso',
    getScriptId: () => 'script-falso',
    getProjectTriggers: () => m.gatilhos.map((g) => g.obj),
    deleteTrigger(t) { const i = m.gatilhos.findIndex((g) => g.obj === t || g.id === t.getUniqueId()); if (i >= 0) m.gatilhos.splice(i, 1); },
    newTrigger(fn) {
      const g = { id: 'gat_' + (++m.seq), fn: fn, desc: [] };
      const b = new Proxy({}, { get(o, k) {
        if (k === 'create') return () => {
          g.obj = { getHandlerFunction: () => fn, getUniqueId: () => g.id, getEventType: () => 'CLOCK', getTriggerSource: () => 'CLOCK' };
          m.gatilhos.push(g); return g.obj;
        };
        return (...a) => { g.desc.push(k + '(' + a.join(',') + ')'); return b; };
      } });
      return b;
    },
    invalidateAuth() {},
    AuthMode: Enum('AuthMode', ['NONE', 'LIMITED', 'FULL', 'CUSTOM_FUNCTION']),
    WeekDay: Enum('WeekDay', ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
    EventType: Enum('EventType', ['CLOCK', 'ON_OPEN', 'ON_EDIT', 'ON_FORM_SUBMIT', 'ON_CHANGE']),
    TriggerSource: Enum('TriggerSource', ['CLOCK', 'SPREADSHEETS'])
  });

  const enviar = (a, b, c, d) => {
    const msg = typeof a === 'object' ? Object.assign({}, a) : Object.assign({ to: a, subject: b, body: c }, d || {});
    if (!msg.to) throw erroGAS('Invalid argument: recipient');
    // endereco com "invalido" e recusado, como o Gmail recusa um e-mail com erro de digitacao
    const ruim = String(msg.to).split(',').filter((x) => /invalido/i.test(x))[0];
    if (ruim) throw erroGAS('Invalid email: ' + ruim.trim());
    m.emails.push(msg);
  };
  const MailApp = estrito('MailApp', { sendEmail: enviar, getRemainingDailyQuota: () => 100 });
  const GmailApp = estrito('GmailApp', { sendEmail: enviar, getAliases: () => [] });

  const UrlFetchApp = estrito('UrlFetchApp', {
    fetch(url, op) {
      m.logs.push('[UrlFetch] ' + url);
      const r = (m.opcoes.urlFetch && m.opcoes.urlFetch(url, op)) || { codigo: 404, texto: '' };
      return estrito('HTTPResponse', {
        getResponseCode: () => r.codigo, getContentText: () => r.texto || '',
        getBlob: () => fazerBlob(Buffer.from(r.texto || ''), r.tipo || 'application/octet-stream', 'download'),
        getHeaders: () => ({}), getContent: () => bytesAssinados(Buffer.from(r.texto || ''))
      });
    },
    fetchAll(reqs) { return reqs.map((q) => UrlFetchApp.fetch(q.url || q, q)); }
  });

  const documento = () => encadeavel('Document', { getId: () => 'doc_falso', getUrl: () => 'https://docs.google.com/document/d/doc_falso/edit', getName: () => 'doc',
    getAs: (t) => fazerBlob(Buffer.from('%PDF-falso'), t, 'doc.pdf'), getBlob: () => fazerBlob(Buffer.from('%PDF-falso'), 'application/pdf', 'doc.pdf') });
  const DocumentApp = {
    create: () => documento(), openById: () => documento(),
    ElementType: new Proxy({}, { get: (o, k) => 'ElementType.' + String(k) }),
    HorizontalAlignment: new Proxy({}, { get: (o, k) => 'HorizontalAlignment.' + String(k) }),
    ParagraphHeading: new Proxy({}, { get: (o, k) => 'ParagraphHeading.' + String(k) }),
    Attribute: new Proxy({}, { get: (o, k) => 'Attribute.' + String(k) })
  };

  const Logger = { log: (...a) => { m.logs.push(a.map(String).join(' ')); return Logger; }, getLog: () => m.logs.join('\n'), clear: () => { m.logs = []; } };

  return { SpreadsheetApp, DriveApp, PropertiesService, CacheService, LockService, Session, Utilities, ScriptApp,
    MailApp, GmailApp, UrlFetchApp, DocumentApp, Logger };
}

/* ------------------------------------------------------------------ */
/* HtmlService — com o "apagador de comentario" do Google              */
/* ------------------------------------------------------------------ */

/*
 * modo 'simples': so entende aspas simples (reproduz o
 * "Unexpected token 'class'" da 4.2.1); 'ambas': aspas simples e duplas;
 * 'nenhum': nao apaga nada.
 */
function apagarComentarios(codigo, modo) {
  if (!modo || modo === 'nenhum') return codigo;
  const simples = true, duplas = modo === 'ambas';
  let out = '', st = 'c', i = 0;
  while (i < codigo.length) {
    const ch = codigo[i], nx = codigo[i + 1];
    if (st === 'c') {
      if (ch === '/' && nx === '/') { st = 'l'; i += 2; continue; }
      if (ch === '/' && nx === '*') { st = 'b'; i += 2; continue; }
      if (simples && ch === "'") st = 's'; else if (duplas && ch === '"') st = 'd';
      out += ch; i++; continue;
    }
    if (st === 'l') { if (ch === '\n') { st = 'c'; out += ch; } i++; continue; }
    if (st === 'b') { if (ch === '*' && nx === '/') { st = 'c'; i += 2; continue; } if (ch === '\n') out += ch; i++; continue; }
    if (ch === '\\') { out += ch + (nx || ''); i += 2; continue; }
    if ((st === 's' && ch === "'") || (st === 'd' && ch === '"')) st = 'c';
    out += ch; i++;
  }
  return out;
}
function processarArquivoHtml(texto, modo) {
  return texto.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (x, a, b, c) => a + apagarComentarios(b, modo) + c);
}

function fazerHtmlOutput(conteudo) {
  const st = { conteudo: conteudo, titulo: '', metas: [], xframe: null };
  const self = {
    getContent: () => st.conteudo, setContent: (c) => { st.conteudo = c; return self; }, append: (c) => { st.conteudo += c; return self; },
    appendUntrusted: (c) => { st.conteudo += String(c).replace(/</g, '&lt;'); return self; },
    setTitle: (t) => { st.titulo = t; return self; }, getTitle: () => st.titulo,
    addMetaTag: (n, c) => { st.metas.push([n, c]); return self; },
    setXFrameOptionsMode: (x) => { st.xframe = x; return self; },
    setSandboxMode: () => self, setFaviconUrl: () => self, setWidth: () => self, setHeight: () => self,
    getAs: (t) => fazerBlob(Buffer.from(st.conteudo), t, 'pagina'), getBlob: () => fazerBlob(Buffer.from(st.conteudo), 'text/html', 'pagina'),
    _estado: st
  };
  return estrito('HtmlOutput', self);
}

/* Motor dos scriptlets: <?= ?> escapa, <?!= ?> nao escapa, <? ?> codigo. */
function compilarModelo(texto) {
  let js = 'var __s = "";\n';
  let i = 0;
  const re = /<\?(!=|=)?([\s\S]*?)\?>/g;
  let m;
  while ((m = re.exec(texto))) {
    js += '__s += ' + JSON.stringify(texto.slice(i, m.index)) + ';\n';
    const corpo = m[2].trim().replace(/;\s*$/, '');
    if (m[1] === '!=') js += '__s += String(' + corpo + ');\n';
    else if (m[1] === '=') js += '__s += __esc(' + corpo + ');\n';
    else js += m[2] + '\n';
    i = re.lastIndex;
  }
  js += '__s += ' + JSON.stringify(texto.slice(i)) + ';\nreturn __s;';
  return js;
}

function htmlService(pasta, contexto, opcoes) {
  const ler = (nome) => {
    const arq = path.join(pasta, nome + '.html');
    if (!fs.existsSync(arq)) throw erroGAS('No HTML file named ' + nome + ' was found.');
    return processarArquivoHtml(fs.readFileSync(arq, 'utf8'), opcoes.apagarComentarios);
  };
  return estrito('HtmlService', {
    createHtmlOutputFromFile: (nome) => fazerHtmlOutput(ler(nome)),
    createHtmlOutput: (html) => fazerHtmlOutput(html === undefined ? '' : String(html)),
    createTemplateFromFile(nome) {
      const fonte = ler(nome);
      const t = {
        evaluate() {
          const corpo = compilarModelo(fonte);
          const fn = vm.runInContext('(function(__t, __esc){ with(__t){ ' + corpo + ' } })', contexto);
          const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          const escopo = new Proxy(t, { has: (o, k) => k in o, get: (o, k) => o[k] });
          return fazerHtmlOutput(fn(escopo, esc));
        },
        getRawContent: () => fonte
      };
      return t;
    },
    createTemplate(html) { return this.createTemplateFromFile === undefined ? null : null; },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    SandboxMode: { IFRAME: 'IFRAME', NATIVE: 'NATIVE', EMULATED: 'EMULATED' }
  });
}

/* ------------------------------------------------------------------ */
/* Execucao                                                            */
/* ------------------------------------------------------------------ */

/* Ordem de carga: a do projeto no editor (criacao). Padrao: alfabetica. */
function arquivosGs(pasta, ordem) {
  const todos = fs.readdirSync(pasta).filter((f) => f.endsWith('.gs'));
  if (ordem === 'reversa') return todos.sort().reverse();
  if (Array.isArray(ordem)) return ordem;
  return todos.sort();
}

/**
 * Cria uma execucao nova (contexto limpo) e devolve o contexto.
 * execucao = { contaGoogle: 'quem@abriu' }
 */
function novaExecucao(mundo, pasta, execucao, opcoes) {
  opcoes = Object.assign({ apagarComentarios: 'simples', ordem: 'alfabetica' }, opcoes || {});
  const s = servicos(mundo, execucao || {});
  const ctx = vm.createContext({
    console: { log: (...a) => mundo.logs.push(a.map(String).join(' ')), warn: (...a) => mundo.logs.push('[warn] ' + a.join(' ')), error: (...a) => mundo.logs.push('[error] ' + a.join(' ')), info: (...a) => mundo.logs.push(a.join(' ')) },
    ...s
  });
  mundo.DataDoScript = vm.runInContext('Date', ctx);
  ctx.HtmlService = htmlService(pasta, ctx, opcoes);
  ctx.ContentService = { createTextOutput: (t) => ({ getContent: () => t, setMimeType() { return this; } }), MimeType: { JSON: 'JSON', TEXT: 'TEXT' } };
  arquivosGs(pasta, opcoes.ordem).forEach((f) => {
    const codigo = fs.readFileSync(path.join(pasta, f), 'utf8');
    new vm.Script(codigo, { filename: f }).runInContext(ctx);
  });
  return ctx;
}

/* google.script.run: a resposta passa pelo mesmo filtro do Google. */
function serializarRetorno(v) {
  let temData = false;
  const visitar = (x) => {
    if (ehData(x)) { temData = true; return; }
    if (x && typeof x === 'object') Object.keys(x).forEach((k) => visitar(x[k]));
  };
  visitar(v);
  if (temData) return null;          // o Google devolve null inteiro
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}

function chamarPeloNavegador(mundo, pasta, execucao, nome, args, opcoes) {
  if (/_$/.test(nome)) return { ok: false, erro: { name: 'ScriptError', message: 'Script function not found: ' + nome } };
  const ctx = novaExecucao(mundo, pasta, execucao, opcoes);
  if (typeof ctx[nome] !== 'function') return { ok: false, erro: { name: 'ScriptError', message: 'Script function not found: ' + nome } };
  try {
    const r = ctx[nome].apply(null, JSON.parse(JSON.stringify(args || [])));
    return { ok: true, valor: serializarRetorno(r) };
  } catch (e) {
    return { ok: false, erro: { name: 'ScriptError', message: String(e && e.message || e), stack: String(e && e.stack || '') } };
  }
}

module.exports = { Mundo, novaExecucao, chamarPeloNavegador, formatarData, converterComoPlanilha, apagarComentarios, processarArquivoHtml, serializarRetorno };
