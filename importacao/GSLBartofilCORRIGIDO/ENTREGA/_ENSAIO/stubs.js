/* Ambiente de ensaio: implementa o suficiente dos servicos do Google para
   rodar o codigo .gs do GSL fora do Apps Script. Nao faz parte da entrega. */

const OFF = -3 * 60; // America/Bahia, minutos

function shift(d) { return new Date(d.getTime() + OFF * 60000); }
function p2(n) { return (n < 10 ? '0' : '') + n; }

const Utilities = {
  formatDate(d, tz, fmt) {
    const x = shift(d);
    const Y = x.getUTCFullYear(), M = x.getUTCMonth() + 1, D = x.getUTCDate();
    const h = x.getUTCHours(), m = x.getUTCMinutes(), s = x.getUTCSeconds();
    return fmt
      .replace(/yyyy/g, Y).replace(/MM/g, p2(M)).replace(/dd/g, p2(D))
      .replace(/HH/g, p2(h)).replace(/mm/g, p2(m)).replace(/ss/g, p2(s))
      .replace(/\bH\b/g, String(h));
  },
  getUuid() { return 'uuid-' + Math.random().toString(36).slice(2, 12); },
  base64Encode(b) { return Buffer.from(b).toString('base64'); },
  base64Decode(t) { return Array.from(Buffer.from(t, 'base64')); },
  newBlob(b, tipo, nome) { return { b, tipo, nome, getBytes: () => b, getName: () => nome,
                                    getContentType: () => tipo, setName(n){this.nome=n;return this;} }; },
  formatString(f, ...a) { let i = 0; return f.replace(/%-?\d*s/g, () => String(a[i++])); },
  sleep() {}
};

/* ---------- planilha em memoria ---------- */
class Faixa {
  constructor(aba, l, c, nl, nc) { Object.assign(this, { aba, l, c, nl, nc }); }
  getValues() {
    CHAMADAS.leitura++;
    const out = [];
    for (let i = 0; i < this.nl; i++) {
      const linha = [];
      for (let j = 0; j < this.nc; j++) {
        const r = this.aba.dados[this.l - 1 + i] || [];
        linha.push(r[this.c - 1 + j] === undefined ? '' : r[this.c - 1 + j]);
      }
      out.push(linha);
    }
    return out;
  }
  setValues(v) {
    CHAMADAS.escrita++;
    for (let i = 0; i < v.length; i++) {
      const li = this.l - 1 + i;
      while (this.aba.dados.length <= li) this.aba.dados.push([]);
      for (let j = 0; j < v[i].length; j++) this.aba.dados[li][this.c - 1 + j] = v[i][j];
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() {
    for (let i = 0; i < this.nl; i++) {
      const li = this.l - 1 + i;
      if (!this.aba.dados[li]) continue;
      for (let j = 0; j < this.nc; j++) this.aba.dados[li][this.c - 1 + j] = '';
    }
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}
class Aba {
  constructor(nome) { this.nome = nome; this.dados = []; this.maxLin = 1000; }
  getName() { return this.nome; }
  setName(n) { this.nome = n; return this; }
  getLastRow() { let u = 0; this.dados.forEach((l, i) => { if (l && l.some(c => c !== '' && c != null)) u = i + 1; }); return u; }
  getLastColumn() { let u = 0; this.dados.forEach(l => { if (l) u = Math.max(u, l.length); }); return u; }
  getMaxRows() { return Math.max(this.maxLin, this.dados.length); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 1); }
  insertRowsAfter(dep, n) { this.maxLin = Math.max(this.maxLin, dep + n); return this; }
  deleteRows(ini, n) {
    /* O Google Sheets RECUSA apagar todas as linhas nao congeladas de uma
       aba: "Nao e possivel excluir todas as linhas nao congeladas".
       Sem isto aqui, o ensaio passava e a producao quebrava. */
    const congeladas = this.frozen || 0;
    const naoCongeladas = this.getMaxRows() - congeladas;
    if (ini > congeladas && n >= naoCongeladas) {
      throw new Error('Não é possível excluir todas as linhas não congeladas.');
    }
    this.dados.splice(ini - 1, n);
    this.maxLin = Math.max(1, this.maxLin - n);
    return this;
  }
  clearContent() { return this; }
  deleteColumns() { return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
  getRange(l, c, nl, nc) { return new Faixa(this, l, c, nl === undefined ? 1 : nl, nc === undefined ? 1 : nc); }
  
  getDataRange() { return new Faixa(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(v) { CHAMADAS.escrita++; this.dados[this.getLastRow()] = v.slice(); return this; }
}
class Planilha {
  constructor(nome) { this.nome = nome; this.abas = [new Aba('Página1')]; this.id = 'pl-' + Math.random().toString(36).slice(2, 8); this.tz = 'America/Bahia'; }
  getId() { return this.id; }
  getName() { return this.nome; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.abas; }
  getSheetByName(n) { return this.abas.find(a => a.nome === n) || null; }
  insertSheet(n) { const a = new Aba(n || ('Aba' + this.abas.length)); this.abas.push(a); return a; }
  getSpreadsheetTimeZone() { return this.tz; }
  setSpreadsheetTimeZone(t) { this.tz = t; return this; }
}
const PLANILHAS = {};
const SpreadsheetApp = {
  create(nome) { const p = new Planilha(nome); PLANILHAS[p.getId()] = p; return p; },
  openById(id) { CHAMADAS.abrir++; if (!PLANILHAS[id]) throw new Error('sem planilha ' + id); return PLANILHAS[id]; },
  openByUrl(u) { const m = String(u).match(/\/d\/([^/]+)/); return SpreadsheetApp.openById(m ? m[1] : u); }
};

/* ---------- propriedades, cache, trava ---------- */
function mkProps() {
  const m = {};
  return { getProperty: k => { CHAMADAS.props++; return (k in m ? m[k] : null); },
           setProperty(k, v) { CHAMADAS.props++; m[k] = String(v); return this; },
           setProperties(o) { CHAMADAS.props++; Object.keys(o).forEach(k => m[k] = String(o[k])); return this; },
           deleteProperty(k) { CHAMADAS.props++; delete m[k]; return this; },
           getProperties: () => { CHAMADAS.props++; return Object.assign({}, m); } };
}
const _sp = mkProps(), _up = mkProps();
const PropertiesService = { getScriptProperties: () => _sp, getUserProperties: () => _up };

let CHAMADAS = { leitura: 0, escrita: 0, abrir: 0, props: 0, cache: 0, trava: 0, drive: 0, gatilhos: 0 };
function zerar() { Object.keys(CHAMADAS).forEach(k => CHAMADAS[k] = 0); }
function mkCache() {
  const m = {};
  return { get: k => { CHAMADAS.cache++; return (k in m ? m[k] : null); },
           put(k, v) { CHAMADAS.cache++; m[k] = String(v); }, putAll(o) { CHAMADAS.cache++; Object.assign(m, o); },
           getAll(ks) { const o = {}; ks.forEach(k => { if (k in m) o[k] = m[k]; }); return o; },
           remove(k) { delete m[k]; }, removeAll(ks) { ks.forEach(k => delete m[k]); }, _m: m };
}
const _cache = mkCache();
const CacheService = { getScriptCache: () => _cache };
const LockService = { getScriptLock: () => ({ tryLock: () => { CHAMADAS.trava++; return true; }, waitLock() { CHAMADAS.trava++; }, releaseLock() {} }) };
const Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => '' }),
                  getScriptTimeZone: () => 'America/Bahia' };
const Logger = { log: (...a) => console.log('  LOG', ...a) };
const PASTAS = {};
function mkPasta(nome) {
  const f = { nome, id: 'fld-' + Math.random().toString(36).slice(2, 8), filhas: [], arquivos: [] };
  f.getId = () => f.id; f.getName = () => f.nome; f.getUrl = () => 'https://drive/' + f.id;
  f.createFolder = n => { const x = mkPasta(n); f.filhas.push(x); PASTAS[x.id] = x; return x; };
  f.getFoldersByName = n => { const r = f.filhas.filter(x => x.nome === n); let i = 0;
    return { hasNext: () => i < r.length, next: () => r[i++] }; };
  f.getFolders = () => { let i = 0; return { hasNext: () => i < f.filhas.length, next: () => f.filhas[i++] }; };
  f.getFiles = () => { let i = 0; return { hasNext: () => i < f.arquivos.length, next: () => f.arquivos[i++] }; };
  f.createFile = b => { const a = { id: 'arq-' + Math.random().toString(36).slice(2, 8), nome: b.nome || 'x' };
    a.getId = () => a.id; a.getName = () => a.nome; a.getSize = () => 10; a.getUrl = () => 'https://drive/file/' + a.id;
    a.getMimeType = () => 'application/pdf'; a.setDescription = () => a; a.setSharing = () => a;
    a.getBlob = () => b; f.arquivos.push(a); return a; };
  f.getParents = () => { let i = 0; const pais = f.pai ? [f.pai] : []; return { hasNext: () => i < pais.length, next: () => pais[i++] }; };
  PASTAS[f.id] = f; return f;
}
const DriveApp = {
  createFolder: n => mkPasta(n),
  getFolderById: id => { if (!PASTAS[id]) throw new Error('sem pasta ' + id); return PASTAS[id]; },
  getFileById: id => ({ getId: () => id, getName: () => 'arq', getSize: () => 1024,
                        getUrl: () => 'https://drive/file/' + id, getMimeType: () => 'application/pdf',
                        moveTo() { return this; }, setTrashed() { return this; }, getThumbnail: () => null }),
  Access: { ANYONE_WITH_LINK: 1, DOMAIN_WITH_LINK: 2 }, Permission: { VIEW: 1 }
};
const ScriptApp = {
  getProjectTriggers: () => { CHAMADAS.gatilhos++; return []; }, newTrigger: () => ({ timeBased: () => ({ atHour: () => ({ everyDays: () => ({ create() {} }) }),
    onMonthDay: () => ({ atHour: () => ({ create() {} }) }), everyMinutes: () => ({ create() {} }) }) }),
  deleteTrigger() {}, getService: () => ({ getUrl: () => 'https://script/exec' }), getOAuthToken: () => 'tok'
};
const MAILS = [];
const MailApp = { sendEmail: o => MAILS.push(o), getRemainingDailyQuota: () => 100 };
const HtmlService = { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; } }) }),
                      createHtmlOutputFromFile: () => ({ getContent: () => '' }), XFrameOptionsMode: { ALLOWALL: 1 } };
const DocumentApp = { create: () => ({ getId: () => 'doc', getBody: () => ({}) }), ElementType: {} };
const UrlFetchApp = { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '{}' }) };

module.exports = { zerar, Utilities, SpreadsheetApp, PropertiesService, CacheService, LockService, Session,
  Logger, DriveApp, ScriptApp, MailApp, HtmlService, DocumentApp, UrlFetchApp, PLANILHAS, MAILS, _sp, _cache, CHAMADAS };
