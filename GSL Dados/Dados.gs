/*******************************************************************************
 * GSL-DADOS · CONSULTA À FOLHA DE PONTO DO RH + PAINEL BI (v3)
 * -----------------------------------------------------------------------------
 * O QUE MUDOU DA v2 PARA A v3
 *
 *  1. CORREÇÃO DO NOME REPETIDO (o "todo mundo é FAGNO MOREIRA SANTOS")
 *     A v2 buscava o nome com INDEX(...;MATCH(...)) dentro de ARRAYFORMULA.
 *     MATCH não se propaga em array: ele resolve UMA vez, com o primeiro
 *     valor, e o Sheets repete esse resultado na coluna inteira. Por isso o
 *     nome do primeiro colaborador aparecia em todas as linhas. Trocado por
 *     VLOOKUP, que se propaga de verdade. Afetava PERIODO (duas tabelas) e
 *     COLABORADOR (descrição do código).
 *
 *  2. A tabela "COLABORADORES COM AUSÊNCIA NO PERÍODO" agora mostra AS DATAS:
 *     primeira ausência, última ausência e a lista dia a dia (21/07, 25/07...),
 *     além dos tipos de ausência de cada pessoa.
 *
 *  3. Contagem de pessoas no período passou a ser por MATRÍCULA (a v2 agrupava
 *     por matrícula + turno; quem mudou de turno no mês contava duas vezes).
 *
 *  4. PAINEL redesenhado como BI: cartões com comparação contra o mês anterior,
 *     semáforo contra meta, termômetro por turno, MAPA DE CALOR dia × turno,
 *     evolução mês a mês, Pareto de códigos, top ofensores e leitura automática
 *     escrita pelo script. Barras dentro das células (SPARKLINE) e escalas de
 *     cor no lugar de tabela crua.
 *
 *  5. Botões de verdade: Central de Comando (barra lateral) e caixas de seleção
 *     que disparam ação na própria planilha.
 *
 * OBSERVAÇÃO DE LOCALIDADE
 *   Nenhuma fórmula usa TEXT(data;"aaaa-mm-dd"). O código de formato do TEXT
 *   muda com o idioma da planilha e quebra em silêncio. Toda data virada em
 *   texto aqui é montada com YEAR/MONTH/DAY, que é igual em qualquer idioma.
 *
 * ORDEM DE USO
 *   ARQUIVOS_RH (colar link) > menu 1 (pré-visualizar) > menu 2 (importar) >
 *   menu 3 (montar painel) > menu 4 (ligar consulta diária) > menu 5 (botões)
 ******************************************************************************/

var A_ARQ = 'ARQUIVOS_RH', A_CFG = 'CONFIG', A_DP = 'DE-PARA', A_FATO = 'FATO_ASSIDUIDADE',
    A_COL = 'COLABORADORES', A_AGR = 'AGREGADO', A_AGRC = 'AGR_COLAB',
    A_PAI = 'PAINEL', A_FICHA = 'COLABORADOR', A_RANK = 'RANKING', A_PER = 'PERIODO';
var DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
var DOW3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
var L_ARQ = 8, L_DP = 8, L_FATO = 8, L_COL = 8, L_AGR = 8;
var CAT_FALTAS = ['Falta injustificada', 'Falta justificada', 'Falta disciplinar'];
var CATEGORIAS = ['Presença', 'Falta injustificada', 'Falta justificada', 'Falta disciplinar',
                  'Atestado', 'Férias', 'Folga', 'Licença legal', 'Ajuste de horas', 'Abono',
                  'Outros', 'A CONFIRMAR'];
var TIPOS_AUS = ['Todas as ausências', 'Falta injustificada', 'Falta justificada',
                 'Falta disciplinar', 'Atestado', 'Licença legal', 'Outros'];

/* paleta — bandeira da Bartofil */
var AZUL = '#111785', AZUL_ESC = '#0A0E52', VERDE = '#01973A', VERM = '#D71920',
    AMAR = '#E8B10A', CINZA = '#6B7280', BORDA = '#DCE0EA', CLARO = '#F5F7FB',
    BRANCO = '#FFFFFF', CREME = '#FFFDF0';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GSL Dados')
    .addItem('⌘  Central de comando', 'abrirCentral')
    .addSeparator()
    .addItem('1 · Pré-visualizar (não grava nada)', 'previewImportacao')
    .addItem('2 · Importar agora', 'importarAgora')
    .addItem('3 · Montar / atualizar o painel', 'montarPainel')
    .addSeparator()
    .addItem('4 · Ligar a consulta diária', 'instalarGatilhoDiario')
    .addItem('Desligar a consulta diária', 'removerGatilhoDiario')
    .addItem('5 · Ligar os botões da planilha', 'instalarGatilhoBotoes')
    .addSeparator()
    .addItem('Reclassificar códigos (após mexer no DE-PARA)', 'reclassificarCodigos')
    .addItem('Códigos sem tradução', 'codigosPendentes')
    .addItem('Conferir fuso horário das planilhas', 'conferirFuso')
    .addItem('Diagnóstico de leitura', 'diagnosticoLeitura')
    .addToUi();
}

// ------------------------------------------------------------------ utilidades
function ss_() {
  var a = SpreadsheetApp.getActive();
  if (!a) {
    throw new Error('Este código precisa estar VINCULADO à planilha GSL-DADOS. ' +
      'Abra a GSL-DADOS > Extensões > Apps Script e cole o código lá — ' +
      'um projeto avulso criado em script.google.com não enxerga a planilha.');
  }
  return a;
}

/**
 * Descobre empiricamente se as fórmulas desta planilha usam vírgula ou
 * ponto-e-vírgula. Em planilha pt-BR o separador é ";" e toda fórmula
 * gravada pelo script com vírgula vira #ERROR!. Testa uma vez e guarda.
 */
function sepArg_() {
  var props = PropertiesService.getDocumentProperties();
  var s = props.getProperty('sepArg');
  if (s === ',' || s === ';') return s;
  var sh = ss_().getSheetByName(A_AGR);
  var c = sh.getRange(1, 26);
  var antes = c.getFormula();
  c.setFormula('=SUM(1,1)');
  SpreadsheetApp.flush();
  s = (c.getValue() === 2) ? ',' : ';';
  c.clearContent();
  if (antes) c.setFormula(antes);
  props.setProperty('sepArg', s);
  return s;
}

/**
 * Converte uma fórmula escrita com vírgula para o separador da planilha.
 * Só troca vírgulas FORA de texto entre aspas — as vírgulas de dentro do
 * QUERY ("select A, B, C") têm de continuar como estão.
 */
function loc_(f) {
  var sep = sepArg_();
  if (sep === ',') return f;
  var out = '', dentro = false;
  for (var i = 0; i < f.length; i++) {
    var ch = f.charAt(i), ant = f.charAt(i - 1), prox = f.charAt(i + 1);
    if (ch === '"') dentro = !dentro;
    if (!dentro && ch === ',') { out += sep; continue; }
    // Ponto entre dois dígitos e fora de texto é separador DECIMAL: em planilha
    // pt-BR precisa virar vírgula. Sem isto, "$F$7*1.3" entra como #ERROR! e
    // volta a quebrar toda vez que o script reescreve a aba.
    if (!dentro && ch === '.' && /[0-9]/.test(ant) && /[0-9]/.test(prox)) { out += ','; continue; }
    out += ch;
  }
  return out;
}

/** setFormula respeitando o separador da planilha. */
function formula_(sh, cel, f) { sh.getRange(cel).setFormula(loc_(f)); }

/** Grava um bloco de fórmulas de uma vez — muito mais rápido que célula a célula. */
function formulas_(sh, linha, col, matriz) {
  if (!matriz.length) return;
  var m = matriz.map(function (l) {
    return l.map(function (f) { return f ? loc_(f) : ''; });
  });
  sh.getRange(linha, col, m.length, m[0].length).setFormulas(m);
}

function tz_() { return ss_().getSpreadsheetTimeZone(); }
function ymd_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function ym_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM'); }
function br_(d) { return Utilities.formatDate(d, tz_(), 'dd/MM/yyyy'); }
function eData_(v) { return (v instanceof Date) && !isNaN(v.getTime()); }
function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

function norm_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[àáâãä]/gi, 'A').replace(/[èéêë]/gi, 'E').replace(/[ìíîï]/gi, 'I')
    .replace(/[òóôõö]/gi, 'O').replace(/[ùúûü]/gi, 'U').replace(/ç/gi, 'C')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Forma do código como ele é guardado. NÃO remove zeros à esquerda: na legenda
 * do RH "3" (folga a compensar) e "003" (saiu mais cedo) são códigos DIFERENTES,
 * e colapsar os dois seria erro de classificação. Só tira o ".0" que o Sheets
 * acrescenta em número inteiro.
 */
function codigo_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return (v === Math.floor(v)) ? String(Math.floor(v)) : String(v);
  var s = String(v).trim().toUpperCase();
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

/**
 * Competência sempre no formato aaaa-mm, venha ela como for.
 * O Google Sheets converte "2026-08" em DATA sozinho — ao ler a célula, ao
 * escrever com setValues, e na importação do arquivo. Sem esta normalização
 * a competência gravada na FATO deixa de bater com a da aba ARQUIVOS_RH e o
 * AGREGADO fica zerado, mesmo com a FATO cheia.
 */
function comp_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (eData_(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-\/](\d{1,2})$/);                 // 2026-08
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})[-\/](\d{4})$/);                     // 08/2026
  if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  m = s.match(/^(\d{4})-(\d{2})-\d{2}/);                      // 2026-08-01
  if (m) return m[1] + '-' + m[2];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz_(), 'yyyy-MM');
  return s;
}

/** Competência anterior a "2026-08" -> "2026-07". */
function compAnterior_(c) {
  var m = String(c || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  var ano = Number(m[1]), mes = Number(m[2]) - 1;
  if (mes < 1) { mes = 12; ano--; }
  return ano + '-' + ('0' + mes).slice(-2);
}

/** Marca um intervalo como TEXTO para o Sheets não reinterpretar a competência. */
function comoTexto_(sh, col, linha, n) {
  if (n > 0) sh.getRange(linha, col, n, 1).setNumberFormat('@');
}

function letraNum_(l) {
  var s = norm_(l).replace(/[^A-Z]/g, ''), n = 0;
  if (!s) return 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function colLetra_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ------------------------------------------------------------------ CONFIG
function cfgD_() {
  var c = ss_().getSheetByName(A_CFG);
  if (!c) throw new Error('Aba CONFIG não encontrada.');
  // Os parâmetros vivem em C8:C27 — a aba CONFIG ganhou faixa de topo na v3.
  // Ler a faixa errada faz o script achar que os turnos se chamam "NOME" e
  // descartar TODOS os lançamentos sem erro nenhum.
  var v = c.getRange('C8:C27').getValues();
  function g(l) { return v[l - 8][0]; }
  return {
    aba: String(g(8) || '').trim(),
    cabMat: norm_(g(9) || 'MATRICULA'),
    cabNome: norm_(g(10) || 'NOME'),
    cabTurno: norm_(g(11) || 'T.'),
    turnos: String(g(12) || 'ADM,A,B,C,J,BC').split(',').map(norm_).filter(String),
    digitos: Number(g(13)) || 6,
    corta: String(g(14) || 'HORAS TRABALHADAS').split(',').map(norm_).filter(String),
    gravarNome: norm_(g(15)) !== 'NAO',
    hora: Math.min(23, Math.max(0, Number(g(17)) || 4)),
    manual: norm_(g(20)) === 'MANUAL',
    mLinCab: Number(g(21)) || 0,
    mColMat: letraNum_(g(22)),
    mColNome: letraNum_(g(23)),
    mColTurno: letraNum_(g(24)),
    mColIni: letraNum_(g(25)),
    mColFim: letraNum_(g(26)),
    mLinIni: Number(g(27)) || 0
  };
}

// ------------------------------------------------------------------ ARQUIVOS_RH
function arquivos_() {
  var sh = ss_().getSheetByName(A_ARQ), out = [], last = sh.getLastRow();
  if (last < L_ARQ) return out;
  sh.getRange(L_ARQ, 1, last - L_ARQ + 1, 7).getValues().forEach(function (l, k) {
    var comp = comp_(l[0]), link = String(l[1] || '').trim();
    if (!comp || !link || link.indexOf('COLE_O_LINK') > -1) return;
    out.push({ linha: L_ARQ + k, comp: comp, link: link,
               aba: String(l[2] || '').trim(), aberta: norm_(l[3]) !== 'FECHADA' });
  });
  return out;
}

// ------------------------------------------------------------------ leitura
function abrirFolha_(reg, cfg) {
  var arq;
  try { arq = SpreadsheetApp.openByUrl(reg.link); }
  catch (e) {
    throw new Error('Não consegui abrir a planilha da competência ' + reg.comp +
      '. Verifique se você tem acesso a ela e se o link é de uma Planilha Google.');
  }
  var nome = reg.aba || cfg.aba;
  var sh = nome ? arq.getSheetByName(nome) : arq.getSheets()[0];
  if (!sh) throw new Error('A aba "' + nome + '" não existe no arquivo de ' + reg.comp +
    '. Abas disponíveis: ' + arq.getSheets().map(function (s) { return s.getName(); }).join(', '));
  return { arq: arq, sh: sh, m: sh.getDataRange().getValues(),
           tz: arq.getSpreadsheetTimeZone() };
}

function ymTz_(d, tz) { return Utilities.formatDate(d, tz || tz_(), 'yyyy-MM'); }

/**
 * Data como NÚMERO DE SÉRIE da planilha (dias desde 30/12/1899).
 * Gravar objeto Date faz o Sheets converter usando o fuso do PROJETO do script,
 * que nem sempre é o da planilha — foi assim que 21/07 virou "20/07 20:00".
 * Número de série não tem fuso: o dia gravado é exatamente o dia lido.
 */
function serialData_(d, tzOrigem) {
  if (!eData_(d)) return d;
  var p = Utilities.formatDate(d, tzOrigem || tz_(), 'yyyy-MM-dd').split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000 + 25569;
}

function conferirFuso() {
  var regs = arquivos_(), meu = tz_(), msg = ['Fuso da GSL-DADOS: ' + meu, ''];
  var difere = null;
  regs.forEach(function (reg) {
    try {
      var a = SpreadsheetApp.openByUrl(reg.link);
      var t = a.getSpreadsheetTimeZone();
      msg.push(reg.comp + ' (' + a.getName() + '): ' + t + (t === meu ? '  ✔' : '  ✖ DIFERENTE'));
      if (t !== meu) difere = t;
    } catch (e) { msg.push(reg.comp + ': não consegui abrir — ' + e.message); }
  });
  if (difere) {
    msg.push('', 'Fusos diferentes fazem a data virar o dia na importação.');
    var r = SpreadsheetApp.getUi().alert(msg.join('\n') + '\n\nAlinhar a GSL-DADOS para ' + difere + '?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (r === SpreadsheetApp.getUi().Button.YES) {
      ss_().setSpreadsheetTimeZone(difere);
      SpreadsheetApp.getUi().alert('Fuso alinhado para ' + difere + '. Reimporte para regravar as datas.');
    }
    return;
  }
  SpreadsheetApp.getUi().alert(msg.join('\n') + '\n\nTudo alinhado.');
}

function detectar_(m, cfg) {
  var erros = [], avisos = [], nLin = m.length, nCol = 0;
  var suspeito = cfg.turnos.filter(function (t) { return t.length > 4; });
  if (suspeito.length) {
    erros.push('A lista de turnos em CONFIG!C12 está com "' + suspeito.join(', ') +
      '" — isso não parece sigla de turno. O esperado é algo como ADM,A,B,C,J,BC.');
  }
  for (var i = 0; i < nLin; i++) nCol = Math.max(nCol, m[i].length);

  var linCab = cfg.manual && cfg.mLinCab ? cfg.mLinCab - 1 : -1;
  if (linCab < 0) {
    for (var r = 0; r < nLin && linCab < 0; r++) {
      for (var c = 0; c < nCol; c++) {
        if (norm_(m[r][c]).indexOf(cfg.cabMat) > -1) { linCab = r; break; }
      }
    }
  }
  if (linCab < 0) {
    erros.push('Não achei a linha de cabeçalho (procurei "' + cfg.cabMat +
      '"). Ajuste CONFIG!C9 ou preencha CONFIG!C21.');
    return { erros: erros, avisos: avisos, nLin: nLin, nCol: nCol, linCab: -1, cols: [] };
  }

  var colMat = cfg.manual && cfg.mColMat ? cfg.mColMat - 1 : -1;
  var colNome = cfg.manual && cfg.mColNome ? cfg.mColNome - 1 : -1;
  var colTurno = cfg.manual && cfg.mColTurno ? cfg.mColTurno - 1 : -1;
  for (var c2 = 0; c2 < nCol; c2++) {
    var t = norm_(m[linCab][c2]);
    if (colMat < 0 && t.indexOf(cfg.cabMat) > -1) colMat = c2;
    if (colNome < 0 && t === cfg.cabNome) colNome = c2;
    if (colTurno < 0 && t === cfg.cabTurno) colTurno = c2;
  }
  if (colMat < 0) erros.push('Não achei a coluna de matrícula. Preencha CONFIG!C22.');
  if (colNome < 0) avisos.push('Não achei a coluna de nome — só a matrícula será guardada.');
  if (colTurno < 0) avisos.push('Não achei a coluna do turno ("' + cfg.cabTurno +
    '"). Preencha CONFIG!C24.');

  var cols = [];
  var ini = cfg.manual && cfg.mColIni ? cfg.mColIni - 1 : 0;
  var fim = cfg.manual && cfg.mColFim ? cfg.mColFim - 1 : nCol - 1;
  for (var c3 = ini; c3 <= fim && c3 < nCol; c3++) {
    if (eData_(m[linCab][c3])) cols.push({ col: c3, data: m[linCab][c3] });
  }
  if (cols.length < 7) {
    erros.push('Achei só ' + cols.length + ' coluna(s) de data na linha ' + (linCab + 1) +
      '. Preencha CONFIG!C25 e C26 com a primeira e a última letra de coluna.');
  }

  var linIni = cfg.manual && cfg.mLinIni ? cfg.mLinIni - 1 : linCab + 1;
  return { erros: erros, avisos: avisos, nLin: nLin, nCol: nCol, linCab: linCab,
           colMat: colMat, colNome: colNome, colTurno: colTurno, cols: cols, linIni: linIni };
}

function extrair_(m, det, cfg, comp) {
  var regs = [], nomes = {}, codigos = {}, porTurno = {}, turnosFora = {};
  var reMat = new RegExp('^\\d{' + cfg.digitos + ',}$');

  for (var r = det.linIni; r < det.nLin; r++) {
    var linha = m[r], txt = norm_(linha.join(' ')), pular = false;
    cfg.corta.forEach(function (x) { if (x && txt.indexOf(x) > -1) pular = true; });
    if (pular) continue;

    var mat = codigo_(linha[det.colMat]);
    if (!reMat.test(mat)) continue;

    var turno = det.colTurno >= 0 ? norm_(linha[det.colTurno]) : '';
    if (turno && cfg.turnos.indexOf(turno) < 0) {
      turnosFora[turno] = (turnosFora[turno] || 0) + 1;
      continue;
    }
    porTurno[turno] = porTurno[turno] || { pessoas: 0, celulas: 0 };
    porTurno[turno].pessoas++;

    if (cfg.gravarNome && det.colNome >= 0) {
      var nm = String(linha[det.colNome] || '').trim();
      if (nm) nomes[mat] = { nome: nm, turno: turno };
    }

    for (var k = 0; k < det.cols.length; k++) {
      var cod = codigo_(linha[det.cols[k].col]);
      if (!cod) continue;
      codigos[cod] = (codigos[cod] || 0) + 1;
      porTurno[turno].celulas++;
      regs.push({ data: det.cols[k].data, mat: mat, turno: turno, cod: cod, comp: comp });
    }
  }
  return { regs: regs, nomes: nomes, codigos: codigos, porTurno: porTurno, turnosFora: turnosFora };
}

// ------------------------------------------------------------------ DE-PARA
function dePara_() {
  var sh = ss_().getSheetByName(A_DP), mapa = {}, last = sh.getLastRow();
  if (last < L_DP) return mapa;
  sh.getRange(L_DP, 1, last - L_DP + 1, 5).getValues().forEach(function (l) {
    var c = codigo_(l[0]);
    if (!c) return;
    mapa[c] = { desc: String(l[1] || ''), cat: String(l[2] || 'A CONFIRMAR'),
                aus: norm_(l[3]) === 'SIM', ignorar: norm_(l[2]) === 'IGNORAR' };
  });
  return mapa;
}

function traduz_(mapa, cod) {
  if (mapa[cod]) return mapa[cod];
  var alt = cod.replace(/^0+(?=\d)/, '');
  if (alt !== cod && mapa[alt]) return mapa[alt];
  return { desc: '', cat: 'A CONFIRMAR', aus: false, ignorar: false };
}

// ------------------------------------------------------------------ 1 · PRÉVIA
function previewImportacao() {
  var ui = SpreadsheetApp.getUi(), cfg, regs;
  try { cfg = cfgD_(); regs = arquivos_(); }
  catch (e) { ui.alert('Erro: ' + e.message); return; }
  if (!regs.length) { ui.alert('Nenhum link cadastrado em ARQUIVOS_RH.'); return; }

  var mapa = dePara_(), podeImportar = true;
  var h = '<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">' +
    '<div style="background:' + AZUL + ';color:#fff;padding:12px 16px;font-size:15px;font-weight:bold">' +
    'PRÉ-VISUALIZAÇÃO — nada foi gravado</div><div style="padding:14px 16px">';

  regs.forEach(function (reg) {
    h += '<h3 style="margin:14px 0 6px;color:' + AZUL + '">Competência ' + reg.comp +
         ' <span style="font-weight:normal;color:#6b7280">(' + (reg.aberta ? 'Aberta' : 'Fechada') + ')</span></h3>';
    var f, det, ext;
    try {
      f = abrirFolha_(reg, cfg);
      det = detectar_(f.m, cfg);
      ext = extrair_(f.m, det, cfg, reg.comp);
    } catch (e) {
      h += '<p style="color:' + VERM + '"><b>' + e.message + '</b></p>';
      podeImportar = false;
      return;
    }
    h += '<p>Arquivo: <b>' + f.arq.getName() + '</b> · aba <b>' + f.sh.getName() + '</b> · ' +
         det.nLin + ' linhas × ' + det.nCol + ' colunas</p>';
    if (det.erros.length) {
      podeImportar = false;
      h += '<ul>' + det.erros.map(function (e) {
        return '<li style="color:' + VERM + '">' + e + '</li>'; }).join('') + '</ul>';
      return;
    }
    h += '<p>Cabeçalho na linha <b>' + (det.linCab + 1) + '</b> · matrícula em <b>' +
         colLetra_(det.colMat + 1) + '</b> · turno em <b>' +
         (det.colTurno < 0 ? '—' : colLetra_(det.colTurno + 1)) + '</b> · <b>' +
         det.cols.length + '</b> colunas de data (' + br_(det.cols[0].data) + ' a ' +
         br_(det.cols[det.cols.length - 1].data) + ')</p>';

    h += '<table style="border-collapse:collapse;font-size:12.5px;margin:6px 0">' +
      '<tr style="background:' + AZUL + ';color:#fff">' +
      ['Turno', 'Colaboradores', 'Lançamentos'].map(function (x) {
        return '<th style="padding:4px 14px;text-align:left">' + x + '</th>'; }).join('') + '</tr>';
    Object.keys(ext.porTurno).sort().forEach(function (t) {
      h += '<tr><td style="padding:4px 14px;border-bottom:1px solid #e5e7eb">' + (t || '(sem turno)') +
        '</td><td style="padding:4px 14px;border-bottom:1px solid #e5e7eb">' + ext.porTurno[t].pessoas +
        '</td><td style="padding:4px 14px;border-bottom:1px solid #e5e7eb">' + ext.porTurno[t].celulas +
        '</td></tr>';
    });
    h += '</table><p><b>' + ext.regs.length + '</b> linha(s) seriam gravadas.</p>';

    var fora = Object.keys(ext.turnosFora);
    if (fora.length) h += '<p style="color:#B45309">Turnos ignorados (fora de CONFIG!C12): ' +
      fora.map(function (t) { return t + '×' + ext.turnosFora[t]; }).join(' · ') + '</p>';

    var cods = Object.keys(ext.codigos).sort(), semTrad = [];
    cods.forEach(function (c) { if (traduz_(mapa, c).cat === 'A CONFIRMAR') semTrad.push(c); });
    h += '<p><b>Códigos na grade (' + cods.length + '):</b> ' + cods.map(function (c) {
      var t = traduz_(mapa, c);
      return t.cat === 'A CONFIRMAR'
        ? '<b style="color:' + VERM + '">' + c + '×' + ext.codigos[c] + '</b>'
        : c + '<span style="color:#6b7280">×' + ext.codigos[c] + '</span>';
    }).join(' · ') + '</p>';
    if (semTrad.length) h += '<p style="color:' + VERM + '">Sem tradução no DE-PARA: <b>' +
      semTrad.join(', ') + '</b></p>';
  });

  h += '<p style="margin-top:14px;padding:10px;background:' + (podeImportar ? '#F0FDF4' : '#FEF2F2') +
       ';border-left:4px solid ' + (podeImportar ? VERDE : VERM) + '">' +
       (podeImportar ? 'Está pronto. Se os números batem com a planilha do RH, use <b>2 · Importar agora</b>.'
                     : 'Corrija os pontos acima (aba CONFIG) e rode a pré-visualização de novo.') +
       '</p></div></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(h).setWidth(900).setHeight(660), 'Pré-visualização');
}

// ------------------------------------------------------------------ 2 · IMPORTAR
function importarAgora() { SpreadsheetApp.getUi().alert(importar_(false).msg); }

/** Chamada pelo gatilho diário: só as competências Abertas, sem diálogo. */
function consultaDiaria() { importar_(true); }

function importar_(somenteAbertas) {
  var cfg = cfgD_();
  var regs = arquivos_().filter(function (r) { return somenteAbertas ? r.aberta : true; });
  if (!regs.length) return { comps: [], msg: 'Nenhuma competência a importar.' };

  var mapa = dePara_(), agora = new Date();
  var fato = ss_().getSheetByName(A_FATO), shArq = ss_().getSheetByName(A_ARQ);
  var resumo = [], comps = [], todosNomes = {}, pend = {};

  if (fato.getLastRow() >= L_FATO &&
      String(fato.getRange(L_FATO, 9).getValue()).indexOf('(exemplo)') === 0) {
    fato.getRange(L_FATO, 1, 1, 10).clearContent();
  }

  regs.forEach(function (reg) {
    var f, det, ext;
    try {
      f = abrirFolha_(reg, cfg);
      det = detectar_(f.m, cfg);
    } catch (e) { resumo.push(reg.comp + ': ' + e.message); return; }
    if (det.erros.length) { resumo.push(reg.comp + ': ' + det.erros[0]); return; }
    ext = extrair_(f.m, det, cfg, reg.comp);
    if (!ext.regs.length) {
      resumo.push(reg.comp + ': a folha foi lida mas nenhum lançamento saiu. ' +
                  'Rode o Diagnóstico de leitura.');
      return;
    }

    var linhas = [];
    ext.regs.forEach(function (g) {
      var t = traduz_(mapa, g.cod);
      if (t.ignorar) return;
      if (t.cat === 'A CONFIRMAR') pend[g.cod] = true;
      linhas.push([serialData_(g.data, f.tz), g.comp, ymTz_(g.data, f.tz), g.mat, g.turno, g.cod,
                   t.cat, t.aus ? 'Sim' : 'Não', agora, reg.link]);
    });
    linhas.sort(function (a, b) { return (a[0] - b[0]) || (a[4] < b[4] ? -1 : 1); });

    apagarCompetencia_(fato, 2, reg.comp, 10);
    var ini = Math.max(fato.getLastRow() + 1, L_FATO);
    comoTexto_(fato, 2, ini, linhas.length);
    comoTexto_(fato, 3, ini, linhas.length);
    comoTexto_(fato, 4, ini, linhas.length);   // matrícula: sem isto vira 21000834,0 e o VLOOKUP falha
    comoTexto_(fato, 6, ini, linhas.length);   // 6.1 (férias) vira data se não for texto
    for (var i = 0; i < linhas.length; i += 4000) {
      var p = linhas.slice(i, i + 4000);
      fato.getRange(ini + i, 1, p.length, 10).setValues(p);
    }
    if (linhas.length) {
      fato.getRange(ini, 1, linhas.length, 1).setNumberFormat('dd/mm/yyyy');
      fato.getRange(ini, 9, linhas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      fato.getRange(ini, 1, linhas.length, 10).setFontFamily('Arial').setFontSize(9);
    }

    Object.keys(ext.nomes).forEach(function (k) { todosNomes[k] = ext.nomes[k]; });
    shArq.getRange(reg.linha, 5, 1, 2).setValues([[agora, linhas.length]]);
    shArq.getRange(reg.linha, 5).setNumberFormat('dd/mm/yyyy hh:mm');
    comps.push(reg.comp);
    resumo.push(reg.comp + ': ' + ext.regs.length + ' lido(s) na folha → ' + linhas.length +
                ' gravado(s) · ' + (ext.regs.length - linhas.length) + ' ignorado(s) pelo DE-PARA · ' +
                Object.keys(ext.nomes).length + ' colaborador(es)');
    if (!linhas.length) {
      resumo.push('   >>> TUDO foi ignorado. Confira a coluna CATEGORIA do DE-PARA: ' +
                  'algo está marcado como "Ignorar" que não deveria.');
    }
  });

  if (cfg.gravarNome) gravarColaboradores_(todosNomes, agora);
  comps.forEach(agregar_);

  comps.forEach(function (c) {
    var agr = ss_().getSheetByName(A_AGR), last = agr.getLastRow(), achou = 0;
    if (last >= L_AGR) {
      agr.getRange(L_AGR, 1, last - L_AGR + 1, 5).getValues().forEach(function (l) {
        if (comp_(l[0]) === c && String(l[1]) === 'TURNO_CAT') achou++;
      });
    }
    if (!achou) resumo.push('   >>> ' + c + ': a FATO recebeu linhas mas o AGREGADO ficou vazio. ' +
      'Rode o Diagnóstico de leitura.');
  });

  var lp = Object.keys(pend);
  return { comps: comps, msg: 'Importação concluída\n\n' + resumo.join('\n') +
    (lp.length ? '\n\nATENÇÃO: códigos sem tradução — ' + lp.join(', ') +
                 '.\nAcrescente no DE-PARA e rode "Reclassificar códigos".'
               : '\n\nTodos os códigos foram traduzidos.') +
    '\n\nUse "3 · Montar / atualizar o painel" para ver os gráficos.' };
}

/**
 * Remove as linhas de uma competência REESCREVENDO o bloco, sem deleteRows.
 * O Google Sheets recusa apagar todas as linhas não congeladas de uma aba
 * ("Não é possível excluir todas as linhas não congeladas") — e era isso que
 * acontecia sempre que a FATO tinha só uma competência.
 */
function apagarCompetencia_(sh, colComp, comp, nCols) {
  var last = sh.getLastRow();
  if (last < L_FATO) return 0;
  var n = last - L_FATO + 1;
  var faixa = sh.getRange(L_FATO, 1, n, nCols);
  var v = faixa.getValues();
  var manter = v.filter(function (l) { return comp_(l[colComp - 1]) !== comp; });
  var apagadas = n - manter.length;
  if (!apagadas) return 0;
  faixa.clearContent();
  if (manter.length) sh.getRange(L_FATO, 1, manter.length, nCols).setValues(manter);
  return apagadas;
}

/**
 * COLABORADORES é a ponte matrícula -> nome usada por PERIODO e pela ficha.
 * A coluna A é forçada a TEXTO: se o Sheets guardar 21000834 como número e a
 * FATO guardar "21000834" como texto, o VLOOKUP não casa e a coluna NOME
 * inteira volta "—".
 */
function gravarColaboradores_(nomes, agora) {
  var sh = ss_().getSheetByName(A_COL), last = sh.getLastRow();
  if (last >= L_COL && String(sh.getRange(L_COL, 2).getValue()).indexOf('(preenchida') === 0) {
    sh.getRange(L_COL, 1, 1, 6).clearContent();
    last = sh.getLastRow();
  }
  var idx = {};
  if (last >= L_COL) {
    sh.getRange(L_COL, 1, last - L_COL + 1, 1).getValues()
      .forEach(function (l, k) { idx[codigo_(l[0])] = L_COL + k; });
  }
  var novos = [];
  Object.keys(nomes).forEach(function (mat) {
    var d = nomes[mat];
    if (idx[mat]) sh.getRange(idx[mat], 2, 1, 3).setValues([[d.nome, d.turno, agora]]);
    else novos.push([mat, d.nome, d.turno, agora, '', mat + ' — ' + d.nome]);
  });
  if (novos.length) {
    var li = Math.max(sh.getLastRow() + 1, L_COL);
    comoTexto_(sh, 1, li, novos.length);
    sh.getRange(li, 1, novos.length, 6).setValues(novos);
    sh.getRange(li, 4, novos.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    sh.getRange(li, 1, novos.length, 6).setFontFamily('Arial').setFontSize(9);
  }
  normalizarMatriculas_();
}

/** Reescreve COLABORADORES!A como texto puro — garante o casamento do VLOOKUP. */
function normalizarMatriculas_() {
  var sh = ss_().getSheetByName(A_COL), ult = sh.getLastRow();
  if (ult < L_COL) return;
  var n = ult - L_COL + 1;
  var v = sh.getRange(L_COL, 1, n, 2).getValues();
  var mats = v.map(function (l) { return [l[0] === '' ? '' : codigo_(l[0])]; });
  comoTexto_(sh, 1, L_COL, n);
  sh.getRange(L_COL, 1, n, 1).setValues(mats);
  sh.getRange(L_COL, 6, n, 1).setValues(v.map(function (l, k) {
    return [mats[k][0] ? mats[k][0] + ' — ' + String(l[1]) : ''];
  }));
}

/** matrícula -> {nome, turno} */
function nomes_() {
  var sh = ss_().getSheetByName(A_COL), out = {}, last = sh.getLastRow();
  if (last < L_COL) return out;
  sh.getRange(L_COL, 1, last - L_COL + 1, 3).getValues().forEach(function (l) {
    var m = codigo_(l[0]);
    if (m) out[m] = { nome: String(l[1] || ''), turno: String(l[2] || '') };
  });
  return out;
}

// ------------------------------------------------------------------ agregação
function agregar_(comp) {
  var fato = ss_().getSheetByName(A_FATO), agr = ss_().getSheetByName(A_AGR),
      agc = ss_().getSheetByName(A_AGRC);
  var last = fato.getLastRow();
  if (last < L_FATO) return;
  var v = fato.getRange(L_FATO, 1, last - L_FATO + 1, 8).getValues();
  var mapa = dePara_(), nomes = nomes_();

  var turnoCat = {}, turnoAus = {}, porCat = {}, porCod = {}, porDia = {}, porDow = {}, colab = {};
  var turnoTot = {}, turnoTrab = {}, turnoInj = {}, turnoAtest = {}, turnoPessoas = {};
  var diaTurnoTot = {}, diaTurnoAus = {};
  var lanc = 0, aus = 0, fInj = 0, fJust = 0, fDisc = 0, atest = 0, ferias = 0;

  v.forEach(function (l) {
    if (comp_(l[1]) !== comp) return;
    var turno = String(l[4]), cat = String(l[6]), cod = codigo_(l[5]), mat = String(l[3]);
    var ausencia = String(l[7]) === 'Sim';
    lanc++;

    turnoCat[turno + '\u0001' + cat] = (turnoCat[turno + '\u0001' + cat] || 0) + 1;
    porCat[cat] = (porCat[cat] || 0) + 1;
    porCod[cod] = (porCod[cod] || 0) + 1;

    var dt = l[0];
    var d = eData_(dt) ? ymd_(dt) : comp_(dt);
    porDia[d] = porDia[d] || { t: 0, a: 0 };
    porDia[d].t++;
    var chaveDT = d + '\u0001' + turno;
    diaTurnoTot[chaveDT] = (diaTurnoTot[chaveDT] || 0) + 1;

    var c = colab[mat];
    if (!c) {
      c = colab[mat] = { turno: turno, dias: 0, trab: 0, aus: 0, fInj: 0, fJust: 0,
                         fDisc: 0, atest: 0, ferias: 0, folga: 0, lic: 0,
                         ultFalta: null, ultAus: null };
      turnoPessoas[turno] = (turnoPessoas[turno] || 0) + 1;
    }
    c.dias++;
    turnoTot[turno] = (turnoTot[turno] || 0) + 1;
    if (c.turno === '' && turno) c.turno = turno;
    if (cat === 'Presença') { c.trab++; turnoTrab[turno] = (turnoTrab[turno] || 0) + 1; }
    if (cat === 'Férias') { c.ferias++; ferias++; }
    if (cat === 'Folga') c.folga++;
    if (cat === 'Licença legal') c.lic++;

    if (ausencia) {
      aus++; c.aus++;
      turnoAus[turno] = (turnoAus[turno] || 0) + 1;
      porDia[d].a++;
      diaTurnoAus[chaveDT] = (diaTurnoAus[chaveDT] || 0) + 1;
      if (eData_(dt)) {
        var nd = DOW[dt.getDay()];
        porDow[nd] = (porDow[nd] || 0) + 1;
      }
      if (cat === 'Falta injustificada') {
        fInj++; c.fInj++;
        turnoInj[turno] = (turnoInj[turno] || 0) + 1;
        if (eData_(dt) && (!c.ultFalta || dt > c.ultFalta)) c.ultFalta = dt;
      }
      if (eData_(dt) && (!c.ultAus || dt > c.ultAus)) c.ultAus = dt;
      if (cat === 'Falta justificada') { fJust++; c.fJust++; }
      if (cat === 'Falta disciplinar') { fDisc++; c.fDisc++; }
      if (cat === 'Atestado') { atest++; c.atest++; turnoAtest[turno] = (turnoAtest[turno] || 0) + 1; }
    }
  });

  var mats = Object.keys(colab);
  var comAus = 0, comFerias = 0;
  mats.forEach(function (m) {
    if (colab[m].aus > 0) comAus++;
    if (colab[m].ferias > 0) comFerias++;
  });

  var linhas = [];
  linhas.push([comp, 'KPI', 'colaboradores', '', mats.length]);
  linhas.push([comp, 'KPI', 'lancamentos', '', lanc]);
  linhas.push([comp, 'KPI', 'ausencias', '', aus]);
  linhas.push([comp, 'KPI', 'taxa', '', lanc ? aus / lanc : 0]);
  linhas.push([comp, 'KPI', 'falta_inj', '', fInj]);
  linhas.push([comp, 'KPI', 'falta_just', '', fJust]);
  linhas.push([comp, 'KPI', 'falta_disc', '', fDisc]);
  linhas.push([comp, 'KPI', 'faltas', '', fInj + fJust + fDisc]);
  linhas.push([comp, 'KPI', 'atestados', '', atest]);
  linhas.push([comp, 'KPI', 'ferias', '', ferias]);
  linhas.push([comp, 'KPI', 'pessoas_ferias', '', comFerias]);
  linhas.push([comp, 'KPI', 'com_ausencia', '', comAus]);
  Object.keys(turnoCat).forEach(function (k) {
    var p = k.split('\u0001');
    linhas.push([comp, 'TURNO_CAT', p[0], p[1], turnoCat[k]]);
  });
  Object.keys(turnoAus).forEach(function (t) { linhas.push([comp, 'TURNO_AUS', t, '', turnoAus[t]]); });
  [['TURNO_PESSOAS', turnoPessoas], ['TURNO_TOT', turnoTot], ['TURNO_TRAB', turnoTrab],
   ['TURNO_INJ', turnoInj], ['TURNO_ATEST', turnoAtest]].forEach(function (par) {
    Object.keys(par[1]).forEach(function (t) { linhas.push([comp, par[0], t, '', par[1][t]]); });
  });
  Object.keys(porCat).forEach(function (c2) { linhas.push([comp, 'CATEGORIA', c2, '', porCat[c2]]); });
  Object.keys(porCod).forEach(function (c3) {
    linhas.push([comp, 'CODIGO', c3, traduz_(mapa, c3).cat, porCod[c3]]);
  });
  DOW.forEach(function (d2) { if (porDow[d2]) linhas.push([comp, 'DOW', d2, '', porDow[d2]]); });
  Object.keys(porDia).sort().forEach(function (d3) {
    linhas.push([comp, 'DIA', d3, 'TOTAL', porDia[d3].t]);
    linhas.push([comp, 'DIA', d3, 'AUS', porDia[d3].a]);
  });
  // novo na v3: alimenta o mapa de calor dia × turno
  Object.keys(diaTurnoTot).sort().forEach(function (k) {
    var p = k.split('\u0001');
    linhas.push([comp, 'DIA_TURNO', p[0], p[1], diaTurnoTot[k]]);
  });
  Object.keys(diaTurnoAus).sort().forEach(function (k) {
    var p = k.split('\u0001');
    linhas.push([comp, 'DIA_TURNO_AUS', p[0], p[1], diaTurnoAus[k]]);
  });

  apagarCompetencia_(agr, 1, comp, 5);
  var ini2 = Math.max(agr.getLastRow() + 1, L_AGR);
  comoTexto_(agr, 1, ini2, linhas.length);
  comoTexto_(agr, 3, ini2, linhas.length);
  agr.getRange(ini2, 1, linhas.length, 5).setValues(linhas).setFontFamily('Arial').setFontSize(9);

  // ---- uma linha por colaborador
  var lc = mats.sort().map(function (m) {
    var c4 = colab[m], base = c4.trab + c4.aus;
    var n = nomes[m] || { nome: '', turno: c4.turno };
    return [comp, m, n.nome, c4.turno || n.turno, c4.dias, c4.trab, c4.aus,
            c4.fInj, c4.atest, c4.ferias, c4.folga, c4.lic,
            base ? c4.trab / base : '', c4.fJust, c4.fDisc,
            c4.ultFalta ? serialData_(c4.ultFalta) : '',
            c4.ultAus ? serialData_(c4.ultAus) : ''];
  });
  apagarCompetencia_(agc, 1, comp, 17);
  var ini3 = Math.max(agc.getLastRow() + 1, L_AGR);
  if (lc.length) {
    comoTexto_(agc, 1, ini3, lc.length);
    comoTexto_(agc, 2, ini3, lc.length);
    agc.getRange(ini3, 1, lc.length, 17).setValues(lc).setFontFamily('Arial').setFontSize(9);
    agc.getRange(ini3, 13, lc.length, 1).setNumberFormat('0.0%');
    agc.getRange(ini3, 16, lc.length, 2).setNumberFormat('dd/mm/yyyy');
  }
}

/** Lê o AGREGADO de uma competência para dentro de um objeto — usado nos insights. */
function mapaAgregado_(comp) {
  var agr = ss_().getSheetByName(A_AGR), last = agr.getLastRow();
  var o = { kpi: {}, turnoAus: {}, turnoTot: {}, cat: {}, cod: {}, dow: {}, diaTot: {}, diaAus: {} };
  if (last < L_AGR) return o;
  agr.getRange(L_AGR, 1, last - L_AGR + 1, 5).getValues().forEach(function (l) {
    if (comp_(l[0]) !== comp) return;
    var t = String(l[1]), c = String(l[2]), d = String(l[3]), v = num_(l[4]);
    if (t === 'KPI') o.kpi[c] = v;
    else if (t === 'TURNO_AUS') o.turnoAus[c] = v;
    else if (t === 'TURNO_TOT') o.turnoTot[c] = v;
    else if (t === 'CATEGORIA') o.cat[c] = v;
    else if (t === 'CODIGO') o.cod[c] = v;
    else if (t === 'DOW') o.dow[c] = v;
    else if (t === 'DIA' && d === 'TOTAL') o.diaTot[c] = v;
    else if (t === 'DIA' && d === 'AUS') o.diaAus[c] = v;
  });
  return o;
}

/*==============================================================================
 * 3 · PAINEL — construção visual
 *============================================================================*/

function montarPainel() { SpreadsheetApp.getUi().alert(atualizarTudo_()); }

/** Reconstrói as quatro telas. Devolve texto (serve para o menu e para a barra lateral). */
function atualizarTudo_() {
  var agr = ss_().getSheetByName(A_AGR);
  if (agr.getLastRow() < L_AGR) return 'A base ainda está vazia — importe antes de montar o painel.';
  normalizarMatriculas_();
  var lista = competencias_();
  montarPainelGeral_(lista);
  montarFicha_();
  montarRanking_(lista);
  montarPeriodo_();
  SpreadsheetApp.flush();
  return 'Painel atualizado\n\nCompetências: ' + lista.join(', ') +
    '\n\nPAINEL — visão do CD (competência em B7, meta em F7)\n' +
    'PERIODO — ausências num intervalo livre, com as datas de cada pessoa\n' +
    'COLABORADOR — ficha individual\n' +
    'RANKING — melhores e piores';
}

/** Só aceita competências no formato aaaa-mm — evita que texto solto da aba entre na lista. */
function competencias_() {
  var agr = ss_().getSheetByName(A_AGR), comps = {};
  var last = agr.getLastRow();
  if (last < L_AGR) return [];
  agr.getRange(L_AGR, 1, last - L_AGR + 1, 1).getValues().forEach(function (l) {
    var c = comp_(l[0]);
    if (/^\d{4}-\d{2}$/.test(c)) comps[c] = 1;
  });
  return Object.keys(comps).sort();
}

function seletor_(sh, cel, lista) {
  sh.getRange(cel).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(lista, true).build());
  if (lista.length && lista.indexOf(String(sh.getRange(cel).getValue())) < 0) {
    sh.getRange(cel).setValue(lista[lista.length - 1]);
  }
}

function graf_(sh, tipo, faixas, linha, coluna, titulo, cor, opts) {
  var b = sh.newChart().setChartType(tipo);
  faixas.forEach(function (f) { b.addRange(sh.getRange(f)); });
  b.setPosition(linha, coluna, 0, 0)
   .setOption('title', titulo)
   .setOption('titleTextStyle', { fontName: 'Arial', fontSize: 12, color: AZUL_ESC, bold: true })
   .setOption('legend', { position: 'none' })
   .setOption('backgroundColor', BRANCO)
   .setOption('fontName', 'Arial');
  if (cor) b.setOption('colors', [cor]);
  Object.keys(opts || {}).forEach(function (k) { b.setOption(k, opts[k]); });
  sh.insertChart(b.build());
}

// ------------------------------------------------------- peças de layout
function garantir_(sh, linhas, colunas) {
  if (sh.getMaxRows() < linhas) sh.insertRowsAfter(sh.getMaxRows(), linhas - sh.getMaxRows());
  if (sh.getMaxColumns() < colunas) sh.insertColumnsAfter(sh.getMaxColumns(), colunas - sh.getMaxColumns());
}

/** Zera a aba inteira: gráficos, mesclagens, conteúdo, formatos e regras de cor. */
function limparAba_(sh) {
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.showRows(1, sh.getMaxRows());
  sh.showColumns(1, sh.getMaxColumns());
  var r = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  r.breakApart();
  r.clearContent();
  r.clearNote();
  r.clearDataValidations();
  r.clearFormat();
  sh.clearConditionalFormatRules();
  sh.setFrozenRows(0);
}

function tituloAba_(sh, texto, nCols) {
  sh.getRange(2, 2, 1, nCols).merge().setValue(texto)
    .setBackground(AZUL).setFontColor(BRANCO).setFontWeight('bold').setFontSize(15)
    .setFontFamily('Arial').setVerticalAlignment('middle');
  sh.setRowHeight(2, 40);
  var a = Math.round(nCols * 0.45), b = Math.round(nCols * 0.2);
  sh.getRange(3, 2, 1, a).setBackground(VERDE);
  sh.getRange(3, 2 + a, 1, b).setBackground(AMAR);
  sh.getRange(3, 2 + a + b, 1, nCols - a - b).setBackground(VERM);
  sh.setRowHeight(3, 6);
  sh.setRowHeight(1, 8);
}

function secao_(sh, linha, num, texto, nCols) {
  sh.getRange(linha, 2, 1, nCols).merge().setValue('   ' + num + '     ' + texto)
    .setBackground(AZUL_ESC).setFontColor(BRANCO).setFontWeight('bold').setFontSize(9.5)
    .setFontFamily('Arial').setVerticalAlignment('middle');
  sh.setRowHeight(linha, 24);
}

function rotulo_(sh, linha, col, texto) {
  sh.getRange(linha, col).setValue(texto)
    .setFontSize(8).setFontWeight('bold').setFontColor(CINZA).setFontFamily('Arial');
}

function nota_(sh, linha, col, larg, texto) {
  sh.getRange(linha, col, 1, larg).merge().setValue(texto)
    .setFontSize(8.5).setFontColor(CINZA).setFontStyle('italic').setFontFamily('Arial')
    .setBackground(CLARO).setVerticalAlignment('middle').setWrap(true);
}

function campo_(sh, cel, cor) {
  sh.getRange(cel).setBackground(cor || CREME).setFontFamily('Arial').setFontSize(11)
    .setFontWeight('bold').setFontColor(AZUL_ESC).setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, BORDA, SpreadsheetApp.BorderStyle.SOLID);
}

/** Cartão de indicador: rótulo, número grande, comparação e nota. Ocupa 4 linhas. */
function cartao_(sh, linha, col, larg, rot, fValor, formato, fDelta, nt) {
  sh.getRange(linha, col, 4, larg)
    .setBackground(BRANCO)
    .setBorder(true, true, true, true, false, false, BORDA, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(linha, col, 1, larg).merge().setValue(rot)
    .setFontSize(8).setFontWeight('bold').setFontColor(CINZA).setFontFamily('Arial')
    .setVerticalAlignment('middle');
  var v = sh.getRange(linha + 1, col, 1, larg).merge();
  v.setFormula(loc_(fValor)).setNumberFormat(formato)
   .setFontSize(20).setFontWeight('bold').setFontColor(AZUL).setFontFamily('Arial')
   .setVerticalAlignment('middle').setHorizontalAlignment('left');
  var d = sh.getRange(linha + 2, col, 1, larg).merge();
  if (fDelta) d.setFormula(loc_(fDelta));
  d.setFontSize(8).setFontColor(CINZA).setFontFamily('Arial').setVerticalAlignment('middle');
  sh.getRange(linha + 3, col, 1, larg).merge().setValue(nt)
    .setFontSize(8).setFontColor('#9AA1AE').setFontStyle('italic').setFontFamily('Arial')
    .setVerticalAlignment('top').setWrap(true);
  sh.setRowHeight(linha, 16);
  sh.setRowHeight(linha + 1, 30);
  sh.setRowHeight(linha + 2, 14);
  sh.setRowHeight(linha + 3, 16);
}

function cabTabela_(sh, linha, col, titulos) {
  sh.getRange(linha, col, 1, titulos.length).setValues([titulos])
    .setBackground(AZUL).setFontColor(BRANCO).setFontWeight('bold').setFontSize(8.5)
    .setFontFamily('Arial').setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setWrap(true);
  sh.setRowHeight(linha, 30);
}

function corpo_(sh, linha, col, nLin, nCol) {
  var r = sh.getRange(linha, col, nLin, nCol);
  r.setFontFamily('Arial').setFontSize(9.5).setVerticalAlignment('middle')
   .setBorder(true, true, true, true, true, true, BORDA, SpreadsheetApp.BorderStyle.SOLID);
  return r;
}

/** Escala branco → vermelho, para mapa de calor e colunas de ausência. */
function escalaVermelha_(faixa) {
  return SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue(BRANCO, SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMidpointWithValue('#FFE2A8', SpreadsheetApp.InterpolationType.PERCENTILE, '60')
    .setGradientMaxpointWithValue('#F0A0A0', SpreadsheetApp.InterpolationType.PERCENTILE, '95')
    .setRanges([faixa]).build();
}

function escalaVerde_(faixa) {
  return SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#F6B8B8', SpreadsheetApp.InterpolationType.PERCENTILE, '5')
    .setGradientMidpointWithValue('#FFF2C4', SpreadsheetApp.InterpolationType.PERCENTILE, '50')
    .setGradientMaxpointWithValue('#BDE5C8', SpreadsheetApp.InterpolationType.PERCENTILE, '95')
    .setRanges([faixa]).build();
}

// ------------------------------------------------------- fórmulas reutilizadas
function kpiF_(chave, celComp) {
  return '=IFERROR(SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,' + celComp +
    ',AGREGADO!$B:$B,"KPI",AGREGADO!$C:$C,"' + chave + '"),0)';
}

function tipoF_(tipo, celComp, celChave) {
  return '=IFERROR(SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,' + celComp +
    ',AGREGADO!$B:$B,"' + tipo + '",AGREGADO!$C:$C,' + celChave + '),0)';
}

function deltaF_(lin) {
  return '=IF($U$' + lin + '=0,"sem base no mês anterior",' +
    'IF($T$' + lin + '=$U$' + lin + ',"igual ao mês anterior",' +
    'IF($T$' + lin + '>$U$' + lin + ',"▲ +","▼ -")&' +
    'ROUND(ABS($T$' + lin + '-$U$' + lin + ')/$U$' + lin + '*100,1)&"% vs "&$S$2))';
}

// ------------------------------------------------------------------- PAINEL
function montarPainelGeral_(lista) {
  var p = ss_().getSheetByName(A_PAI), cfg = cfgD_();
  var NC = 16;                                   // colunas B..Q
  var compAntes = String(p.getRange('B7').getValue() || '');
  var metaAntes = Number(p.getRange('F7').getValue());
  if (!metaAntes || metaAntes <= 0 || metaAntes >= 1) metaAntes = 0.05;

  garantir_(p, 200, 30);
  limparAba_(p);
  p.setColumnWidth(1, 24);
  for (var c = 2; c <= 17; c++) p.setColumnWidth(c, c === 2 ? 130 : 92);
  for (var c2 = 19; c2 <= 30; c2++) p.setColumnWidth(c2, 90);

  tituloAba_(p, 'PAINEL DE ASSIDUIDADE  ·  CD FEIRA DE SANTANA', NC);

  // ---- linha de controles
  rotulo_(p, 6, 2, 'COMPETÊNCIA');
  rotulo_(p, 6, 4, 'MÊS ANTERIOR');
  rotulo_(p, 6, 6, 'META DE ABSENTEÍSMO');
  rotulo_(p, 6, 8, 'SITUAÇÃO');
  rotulo_(p, 6, 11, 'ÚLTIMA IMPORTAÇÃO');
  rotulo_(p, 6, 14, 'ATUALIZAR PAINEL');
  rotulo_(p, 6, 16, 'IMPORTAR AGORA');
  seletor_(p, 'B7', lista);
  if (lista.indexOf(compAntes) > -1) p.getRange('B7').setValue(compAntes);
  campo_(p, 'B7');
  formula_(p, 'D7', '=$S$2');
  p.getRange('D7').setBackground(CLARO).setFontFamily('Arial').setFontWeight('bold')
   .setFontColor(CINZA).setHorizontalAlignment('center');
  p.getRange('F7').setValue(metaAntes).setNumberFormat('0.0%');
  campo_(p, 'F7');
  formula_(p, 'H7',
    '=IF($T$12=0,"— sem dados",IF($T$12<=$F$7,"🟢  dentro da meta",' +
    'IF($T$12<=$F$7*13/10,"🟡  atenção","🔴  fora da meta")))');
  p.getRange('H7:I7').merge().setFontFamily('Arial').setFontSize(11).setFontWeight('bold')
   .setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground(CLARO);
  formula_(p, 'K7', '=IFERROR(MAX(ARQUIVOS_RH!$E:$E),"—")');
  p.getRange('K7:L7').merge().setNumberFormat('dd/mm/yyyy hh:mm').setFontFamily('Arial')
   .setFontSize(10).setHorizontalAlignment('center').setBackground(CLARO);
  p.getRange('N7').insertCheckboxes().setValue(false)
   .setNote('Marque para reconstruir todas as telas com a competência escolhida em B7.');
  p.getRange('P7').insertCheckboxes().setValue(false)
   .setNote('Marque para reabrir a planilha do RH e reimportar a competência aberta.');
  p.getRange('N7:Q7').setHorizontalAlignment('center');
  p.setRowHeight(7, 26);

  nota_(p, 9, 2, NC, 'Um REGISTRO é uma célula da folha do RH: um colaborador em um dia — não é dia de calendário. ' +
    'Troque a competência em B7 e marque a caixa ATUALIZAR PAINEL para recalcular tudo, inclusive a leitura automática do fim da página.');
  p.setRowHeight(9, 30);

  // ---- área de apoio (colunas S..AC, ocultas)
  formula_(p, 'S2',
    '=IF($B$7="","",IF(VALUE(RIGHT($B$7,2))=1,(VALUE(LEFT($B$7,4))-1)&"-12",' +
    'VALUE(LEFT($B$7,4))&"-"&RIGHT("0"&(VALUE(RIGHT($B$7,2))-1),2)))');
  p.getRange('S2').setNumberFormat('@');

  var chaves = ['colaboradores', 'lancamentos', 'taxa', 'com_ausencia', 'falta_inj',
                'falta_just', 'atestados', 'pessoas_ferias', 'ausencias', 'faltas',
                'ferias', 'falta_disc'];
  p.getRange(10, 19, chaves.length, 1).setValues(chaves.map(function (k) { return [k]; }));
  formulas_(p, 10, 20, chaves.map(function (k) { return [kpiF_(k, '$B$7'), kpiF_(k, '$S$2')]; }));

  // Barras: em vez de confiar na opção "max" do SPARKLINE — que o Sheets ignora
  // quando os dados são uma célula só, e a barra sai sempre cheia —, cada barra
  // recebe DUAS células: o valor e o que falta até o maior da coluna. A proporção
  // fica correta sempre, e a segunda cor pinta o fundo da barra.
  p.getRange(25, 19, 3, 2).setValues([['charttype', 'bar'], ['color1', VERM], ['color2', '#EDEFF7']]);
  p.getRange(30, 19, 3, 2).setValues([['charttype', 'bar'], ['color1', AZUL], ['color2', '#EDEFF7']]);
  p.getRange(34, 19, 3, 2).setValues([['charttype', 'bar'], ['color1', '#C2620A'], ['color2', '#EDEFF7']]);
  // Y/Z = pares (valor, resto) das barras do termômetro, da série diária e do mapa
  formulas_(p, 23, 25, [0, 1, 2, 3, 4, 5].map(function (i) {
    return ['=IF($D$' + (23 + i) + '=0,"",$I$' + (23 + i) + ')',
            '=IF($D$' + (23 + i) + '=0,"",MAX($I$23:$I$28)-$I$' + (23 + i) + ')'];
  }));
  formulas_(p, 96, 25, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]
    .map(function (i) {
      return ['=IF($B$' + (96 + i) + '="","",$D$' + (96 + i) + ')',
              '=IF($B$' + (96 + i) + '="","",MAX($D$96:$D$126)-$D$' + (96 + i) + ')'];
    }));
  formulas_(p, 62, 27, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]
    .map(function (i) {
      return ['=IF($L$' + (62 + i) + '="","",$L$' + (62 + i) + ')',
              '=IF($L$' + (62 + i) + '="","",MAX($L$62:$L$92)-$L$' + (62 + i) + ')'];
    }));

  p.getRange(38, 19, CATEGORIAS.length, 1).setValues(CATEGORIAS.map(function (x) { return [x]; }));
  formulas_(p, 38, 20, CATEGORIAS.map(function (x, i) {
    return [tipoF_('CATEGORIA', '$B$7', '$S$' + (38 + i))];
  }));
  p.getRange(52, 19, 7, 1).setValues(DOW.slice(1).concat([DOW[0]]).map(function (x) { return [x]; }));
  formulas_(p, 52, 20, [0, 1, 2, 3, 4, 5, 6].map(function (i) {
    return [tipoF_('DOW', '$B$7', '$S$' + (52 + i))];
  }));

  formula_(p, 'W10',
    '=IFERROR(QUERY(AGREGADO!$A:$E,"select C where A = \'"&$B$7&"\' and B = \'DIA\' ' +
    'and D = \'TOTAL\' order by C limit 31",0),"")');
  p.getRange('W10:W40').setNumberFormat('@');
  formula_(p, 'X10',
    '=ARRAYFORMULA(IF($W$10:$W$40="","",DATE(VALUE(LEFT($W$10:$W$40,4)),' +
    'VALUE(MID($W$10:$W$40,6,2)),VALUE(RIGHT($W$10:$W$40,2)))))');
  p.getRange('X10:X40').setNumberFormat('dd/mm/yyyy');

  // ---- cartões
  cartao_(p, 11, 2, 4, 'COLABORADORES', '=$T$10', '#,##0', deltaF_(10), 'pessoas com registro na competência');
  cartao_(p, 11, 6, 4, 'REGISTROS (pessoa × dia)', '=$T$11', '#,##0', deltaF_(11), 'células preenchidas na folha do RH');
  cartao_(p, 11, 10, 4, 'TAXA DE ABSENTEÍSMO', '=$T$12', '0.00%', deltaF_(12), 'ausências ÷ dias lançados');
  cartao_(p, 11, 14, 4, 'PESSOAS COM AUSÊNCIA', '=$T$13', '#,##0', deltaF_(13), 'ao menos um dia de ausência');
  cartao_(p, 16, 2, 4, 'FALTAS INJUSTIFICADAS', '=$T$14', '#,##0', deltaF_(14), 'código 16 — sem justificativa');
  cartao_(p, 16, 6, 4, 'FALTAS JUSTIFICADAS', '=$T$15', '#,##0', deltaF_(15), 'código 28 — com justificativa aceita');
  cartao_(p, 16, 10, 4, 'ATESTADOS', '=$T$16', '#,##0', deltaF_(16), 'códigos 1, 21 e 130');
  cartao_(p, 16, 14, 4, 'PESSOAS DE FÉRIAS', '=$T$17', '#,##0', deltaF_(17), 'gente, não dias');

  // ---- 1 · termômetro por turno
  secao_(p, 21, '1', 'TERMÔMETRO POR TURNO', NC);
  cabTabela_(p, 22, 2, ['TURNO', 'PESSOAS', 'REGISTROS', 'PRESENÇAS', 'AUSÊNCIAS',
                        'FALTA INJ.', 'ATESTADOS', '% AUSÊNCIA', 'BARRA', 'SITUAÇÃO']);
  var turnos = cfg.turnos.slice(0, 6);
  while (turnos.length < 6) turnos.push('');
  p.getRange(23, 2, 6, 1).setValues(turnos.map(function (t) { return [t]; }));
  var mTurno = turnos.map(function (t, i) {
    var r = 23 + i, cel = '$B' + r;
    return [
      tipoF_('TURNO_PESSOAS', '$B$7', cel), tipoF_('TURNO_TOT', '$B$7', cel),
      tipoF_('TURNO_TRAB', '$B$7', cel), tipoF_('TURNO_AUS', '$B$7', cel),
      tipoF_('TURNO_INJ', '$B$7', cel), tipoF_('TURNO_ATEST', '$B$7', cel),
      '=IFERROR($F' + r + '/$D' + r + ',0)',
      '=IF($D' + r + '=0,"",SPARKLINE($Y' + r + ':$Z' + r + ',$S$25:$T$27))',
      '=IF($D' + r + '=0,"",IF($I' + r + '<=$F$7,"🟢",IF($I' + r + '<=$F$7*13/10,"🟡","🔴")))'
    ];
  });
  formulas_(p, 23, 3, mTurno);
  formulas_(p, 29, 2, [['="TOTAL CD"', '=SUM($C$23:$C$28)', '=SUM($D$23:$D$28)', '=SUM($E$23:$E$28)',
                        '=SUM($F$23:$F$28)', '=SUM($G$23:$G$28)', '=SUM($H$23:$H$28)',
                        '=IFERROR($F$29/$D$29,0)', '', '']]);
  corpo_(p, 23, 2, 7, 10);
  p.getRange(23, 3, 7, 6).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(23, 9, 7, 1).setNumberFormat('0.0%').setHorizontalAlignment('center');
  p.getRange(23, 11, 7, 1).setHorizontalAlignment('center').setFontSize(12);
  p.getRange(29, 2, 1, 10).setFontWeight('bold').setBackground('#EDEFF7');

  // ---- 2 · registros por turno e categoria
  secao_(p, 31, '2', 'REGISTROS POR TURNO E CATEGORIA', NC);
  cabTabela_(p, 32, 2, ['TURNO'].concat(CATEGORIAS).concat(['TOTAL']));
  p.getRange(33, 2, 6, 1).setValues(turnos.map(function (t) { return [t]; }));
  var mCat = turnos.map(function (t, i) {
    var r = 33 + i;
    var linha = CATEGORIAS.map(function (cat, j) {
      return '=IFERROR(SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,$B$7,AGREGADO!$B:$B,"TURNO_CAT",' +
             'AGREGADO!$C:$C,$B' + r + ',AGREGADO!$D:$D,' + colLetra_(3 + j) + '$32),0)';
    });
    linha.push('=SUM($C' + r + ':$N' + r + ')');
    return linha;
  });
  formulas_(p, 33, 3, mCat);
  var somaCat = [];
  for (var j2 = 0; j2 < CATEGORIAS.length + 1; j2++) {
    var L = colLetra_(3 + j2);
    somaCat.push('=SUM($' + L + '$33:$' + L + '$38)');
  }
  p.getRange(39, 2).setValue('TOTAL CD');
  formulas_(p, 39, 3, [somaCat]);
  corpo_(p, 33, 2, 7, 14);
  p.getRange(33, 3, 7, 13).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(39, 2, 1, 14).setFontWeight('bold').setBackground('#EDEFF7');

  // ---- 3 · leitura visual (banda de gráficos)
  secao_(p, 41, '3', 'LEITURA VISUAL DA COMPETÊNCIA', NC);

  // ---- 4 · mapa de calor dia × turno
  secao_(p, 60, '4', 'MAPA DE CALOR  ·  % DE AUSÊNCIA POR DIA E TURNO', NC);
  cabTabela_(p, 61, 2, ['DATA', 'DIA'].concat(turnos)
    .concat(['REGISTROS', 'AUSÊNCIAS', '% AUSÊNCIA', 'BARRA']));
  var mHeat = [];
  for (var d = 0; d < 31; d++) {
    var r2 = 62 + d, w = '$W$' + (10 + d), x = '$X$' + (10 + d);
    var lin = ['=IF(' + x + '="","",' + x + ')',
               '=IF($B' + r2 + '="","",CHOOSE(WEEKDAY($B' + r2 + '),"dom","seg","ter","qua","qui","sex","sáb"))'];
    for (var t2 = 0; t2 < 6; t2++) {
      var colCab = colLetra_(4 + t2);
      lin.push('=IF(OR(' + w + '="",' + colCab + '$61=""),"",IFERROR(' +
        'SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,$B$7,AGREGADO!$B:$B,"DIA_TURNO_AUS",' +
        'AGREGADO!$C:$C,' + w + ',AGREGADO!$D:$D,' + colCab + '$61)/' +
        'SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,$B$7,AGREGADO!$B:$B,"DIA_TURNO",' +
        'AGREGADO!$C:$C,' + w + ',AGREGADO!$D:$D,' + colCab + '$61),""))');
    }
    lin.push('=IF(' + w + '="","",IFERROR(SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,$B$7,' +
      'AGREGADO!$B:$B,"DIA",AGREGADO!$C:$C,' + w + ',AGREGADO!$D:$D,"TOTAL"),0))');
    lin.push('=IF(' + w + '="","",IFERROR(SUMIFS(AGREGADO!$E:$E,AGREGADO!$A:$A,$B$7,' +
      'AGREGADO!$B:$B,"DIA",AGREGADO!$C:$C,' + w + ',AGREGADO!$D:$D,"AUS"),0))');
    lin.push('=IF($J' + r2 + '="","",IFERROR($K' + r2 + '/$J' + r2 + ',0))');
    lin.push('=IF($L' + r2 + '="","",SPARKLINE($AA' + r2 + ':$AB' + r2 + ',$S$34:$T$36))');
    mHeat.push(lin);
  }
  formulas_(p, 62, 2, mHeat);
  corpo_(p, 62, 2, 31, 12);
  p.getRange(62, 2, 31, 1).setNumberFormat('dd/mm').setHorizontalAlignment('center');
  p.getRange(62, 3, 31, 1).setHorizontalAlignment('center').setFontColor(CINZA);
  p.getRange(62, 4, 31, 6).setNumberFormat('0.0%').setHorizontalAlignment('center');
  p.getRange(62, 10, 31, 2).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(62, 12, 31, 1).setNumberFormat('0.0%').setHorizontalAlignment('center');

  // ---- 5 · série diária
  secao_(p, 94, '5', 'SÉRIE DIÁRIA DA COMPETÊNCIA', NC);
  cabTabela_(p, 95, 2, ['DATA', 'PESSOAS COM REGISTRO', 'AUSÊNCIAS', '% AUSÊNCIA', 'BARRA']);
  var mDia = [];
  for (var d2 = 0; d2 < 31; d2++) {
    var r3 = 96 + d2, x2 = '$X$' + (10 + d2);
    mDia.push([
      '=IF(' + x2 + '="","",' + x2 + ')',
      '=IF($B' + r3 + '="","",$J$' + (62 + d2) + ')',
      '=IF($B' + r3 + '="","",$K$' + (62 + d2) + ')',
      '=IF($B' + r3 + '="","",IFERROR($D' + r3 + '/$C' + r3 + ',0))',
      '=IF($B' + r3 + '="","",SPARKLINE($Y' + r3 + ':$Z' + r3 + ',$S$30:$T$32))'
    ]);
  }
  formulas_(p, 96, 2, mDia);
  corpo_(p, 96, 2, 31, 5);
  p.getRange(96, 2, 31, 1).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center');
  p.getRange(96, 3, 31, 2).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(96, 5, 31, 1).setNumberFormat('0.0%').setHorizontalAlignment('center');

  // ---- 6 · evolução mês a mês
  secao_(p, 128, '6', 'EVOLUÇÃO MÊS A MÊS', NC);
  cabTabela_(p, 129, 2, ['COMPETÊNCIA', 'REGISTROS', 'AUSÊNCIAS', '% AUSÊNCIA',
                         'FALTAS INJ.', 'ATESTADOS', 'COLABORADORES']);
  var ultimas = lista.slice(-12);
  var mEvo = [];
  for (var e = 0; e < 12; e++) {
    var r4 = 130 + e, comp = ultimas[e] || '';
    if (!comp) { mEvo.push(['', '', '', '', '', '', '']); continue; }
    mEvo.push([
      '="' + comp + '"',
      kpiF_('lancamentos', '$B' + r4), kpiF_('ausencias', '$B' + r4),
      kpiF_('taxa', '$B' + r4), kpiF_('falta_inj', '$B' + r4),
      kpiF_('atestados', '$B' + r4), kpiF_('colaboradores', '$B' + r4)
    ]);
  }
  formulas_(p, 130, 2, mEvo);
  corpo_(p, 130, 2, 12, 7);
  p.getRange(130, 2, 12, 1).setNumberFormat('@').setHorizontalAlignment('center');
  p.getRange(130, 3, 12, 2).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(130, 5, 12, 1).setNumberFormat('0.00%').setHorizontalAlignment('center');
  p.getRange(130, 6, 12, 3).setNumberFormat('#,##0').setHorizontalAlignment('center');

  // ---- 7 · códigos mais lançados (Pareto)
  secao_(p, 147, '7', 'CÓDIGOS MAIS LANÇADOS  ·  PARETO', NC);
  cabTabela_(p, 148, 2, ['CÓDIGO', 'CATEGORIA', 'REGISTROS', '% DO TOTAL',
                         '% ACUMULADO', 'DESCRIÇÃO NA LEGENDA DO RH']);
  formula_(p, 'B149',
    '=IFERROR(QUERY(AGREGADO!$A:$E,"select C, D, E where A = \'"&$B$7&"\' and B = \'CODIGO\' ' +
    'order by E desc limit 12 label C \'\', D \'\', E \'\'",0),"")');
  var mPar = [];
  for (var q = 0; q < 12; q++) {
    var r5 = 149 + q;
    mPar.push([
      '=IF($B' + r5 + '="","",IFERROR($D' + r5 + '/SUM($D$149:$D$160),0))',
      '=IF($B' + r5 + '="","",IFERROR(SUM($D$149:$D' + r5 + ')/SUM($D$149:$D$160),0))'
    ]);
  }
  formulas_(p, 149, 5, mPar);
  formula_(p, 'G149',
    '=ARRAYFORMULA(IF($B$149:$B$160="","",IFERROR(VLOOKUP($B$149:$B$160,\'DE-PARA\'!$A:$B,2,FALSE),"—")))');
  corpo_(p, 149, 2, 12, 6);
  p.getRange(149, 4, 12, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(149, 5, 12, 2).setNumberFormat('0.0%').setHorizontalAlignment('center');

  // ---- 8 · top ofensores
  secao_(p, 166, '8', 'QUEM MAIS FALTOU NA COMPETÊNCIA', NC);
  cabTabela_(p, 167, 2, ['MATRÍCULA', 'NOME', 'TURNO', 'AUSÊNCIAS', 'FALTAS INJ.',
                         'ATESTADOS', '% ASSIDUIDADE', 'ÚLTIMA FALTA INJ.']);
  formula_(p, 'B168',
    '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select B, C, D, G, H, I, M, P where A = \'"&$B$7&"\' ' +
    'and G > 0 order by G desc, H desc limit 15 label B \'\', C \'\', D \'\', G \'\', ' +
    'H \'\', I \'\', M \'\', P \'\'",0),"")');
  corpo_(p, 168, 2, 15, 8);
  p.getRange(168, 5, 15, 3).setNumberFormat('#,##0').setHorizontalAlignment('center');
  p.getRange(168, 8, 15, 1).setNumberFormat('0.0%').setHorizontalAlignment('center');
  p.getRange(168, 9, 15, 1).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center');

  // ---- 9 · leitura automática
  secao_(p, 184, '9', 'LEITURA AUTOMÁTICA DA COMPETÊNCIA', NC);
  escreverInsights_(p, String(p.getRange('B7').getValue() || ''));

  p.getRange(195, 2, 1, NC).merge()
    .setValue('GSL-DADOS v3 · gerado em ' + br_(new Date()) + ' ' +
      Utilities.formatDate(new Date(), tz_(), 'HH:mm') +
      ' · a leitura automática acima vale para a competência que estava em B7 quando o painel foi montado')
    .setFontSize(8).setFontColor('#9AA1AE').setFontFamily('Arial').setFontStyle('italic');

  // ---- formatação condicional
  p.setConditionalFormatRules([
    escalaVermelha_(p.getRange('D62:I92')),
    escalaVermelha_(p.getRange('L62:L92')),
    escalaVermelha_(p.getRange('E96:E126')),
    escalaVermelha_(p.getRange('I23:I28')),
    escalaVermelha_(p.getRange('E168:E182')),
    escalaVerde_(p.getRange('H168:H182')),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0).setFontColor(VERM).setBold(true)
      .setRanges([p.getRange('D33:D38'), p.getRange('F33:F38')]).build()
  ]);

  p.hideColumns(19, 12);
  p.setFrozenRows(3);

  // ---- gráficos
  SpreadsheetApp.flush();
  graf_(p, Charts.ChartType.PIE, ['S38:S49', 'T38:T49'], 42, 2,
        'Distribuição dos registros por categoria', null,
        { width: 430, height: 300, pieHole: 0.5,
          legend: { position: 'right', textStyle: { fontSize: 9 } } });
  graf_(p, Charts.ChartType.COLUMN, ['B23:B28', 'I23:I28'], 42, 8,
        '% de ausência por turno', VERM,
        { width: 400, height: 300,
          vAxis: { format: 'percent', gridlines: { color: '#EEF0F6' } } });
  graf_(p, Charts.ChartType.COLUMN, ['S52:S58', 'T52:T58'], 42, 13,
        'Ausências por dia da semana', AZUL,
        { width: 400, height: 300, vAxis: { gridlines: { color: '#EEF0F6' } } });
  graf_(p, Charts.ChartType.LINE, ['B96:B126', 'E96:E126'], 96, 8,
        '% de ausência dia a dia', VERDE,
        { width: 700, height: 320, curveType: 'function', pointSize: 5,
          vAxis: { format: 'percent', gridlines: { color: '#EEF0F6' } } });
  graf_(p, Charts.ChartType.COLUMN, ['B130:B141', 'E130:E141'], 130, 9,
        '% de ausência mês a mês', AZUL,
        { width: 640, height: 300,
          vAxis: { format: 'percent', gridlines: { color: '#EEF0F6' } } });
  graf_(p, Charts.ChartType.BAR, ['B149:B160', 'D149:D160'], 149, 9,
        'Códigos mais lançados', AZUL, { width: 640, height: 300 });
}

/** Escreve, em português, o que os números da competência estão dizendo. */
function escreverInsights_(p, comp) {
  var linhas = insights_(comp);
  var bloco = [];
  for (var i = 0; i < 9; i++) bloco.push([linhas[i] || '']);
  p.getRange(185, 2, 9, 1).setValues(bloco);
  for (var r = 185; r <= 193; r++) {
    p.getRange(r, 2, 1, 16).merge().setFontFamily('Arial').setFontSize(10)
     .setVerticalAlignment('middle').setWrap(true).setBackground(r % 2 ? BRANCO : CLARO);
    p.setRowHeight(r, 20);
  }
  p.getRange(185, 2, 9, 16)
   .setBorder(true, true, true, true, false, false, BORDA, SpreadsheetApp.BorderStyle.SOLID);
}

function insights_(comp) {
  if (!comp) return ['Escolha uma competência em B7 e marque ATUALIZAR PAINEL.'];
  var a = mapaAgregado_(comp), ant = mapaAgregado_(compAnterior_(comp));
  var out = [];
  var taxa = a.kpi.taxa || 0, lanc = a.kpi.lancamentos || 0;
  if (!lanc) return ['Não há dados importados para a competência ' + comp + '.'];

  out.push('▪  Competência ' + comp + ': ' + (a.kpi.colaboradores || 0) + ' colaboradores, ' +
    (a.kpi.lancamentos || 0) + ' registros e ' + (a.kpi.ausencias || 0) + ' ausências — ' +
    'taxa de ' + (taxa * 100).toFixed(2).replace('.', ',') + '%.');

  if (ant.kpi.taxa) {
    var dif = (taxa - ant.kpi.taxa) / ant.kpi.taxa * 100;
    out.push('▪  Contra ' + compAnterior_(comp) + ', o absenteísmo ' +
      (dif > 0 ? 'subiu ' : dif < 0 ? 'caiu ' : 'ficou igual (') +
      Math.abs(dif).toFixed(1).replace('.', ',') + '%' + (dif === 0 ? ')' : '') + '.');
  } else {
    out.push('▪  Não há competência anterior importada para comparar.');
  }

  var pior = null, piorTaxa = -1;
  Object.keys(a.turnoTot).forEach(function (t) {
    var tx = a.turnoTot[t] ? (a.turnoAus[t] || 0) / a.turnoTot[t] : 0;
    if (tx > piorTaxa) { piorTaxa = tx; pior = t; }
  });
  if (pior) out.push('▪  Turno com maior ausência: ' + pior + ', com ' +
    (piorTaxa * 100).toFixed(2).replace('.', ',') + '% dos registros — ' +
    (a.turnoAus[pior] || 0) + ' ausências em ' + a.turnoTot[pior] + ' lançamentos.');

  var melhor = null, melhorTaxa = 9;
  Object.keys(a.turnoTot).forEach(function (t) {
    var tx = a.turnoTot[t] ? (a.turnoAus[t] || 0) / a.turnoTot[t] : 0;
    if (a.turnoTot[t] > 0 && tx < melhorTaxa) { melhorTaxa = tx; melhor = t; }
  });
  if (melhor && melhor !== pior) out.push('▪  Turno mais assíduo: ' + melhor + ', com ' +
    (melhorTaxa * 100).toFixed(2).replace('.', ',') + '%.');

  var dowPior = null, dowMax = 0;
  Object.keys(a.dow).forEach(function (d) { if (a.dow[d] > dowMax) { dowMax = a.dow[d]; dowPior = d; } });
  if (dowPior) out.push('▪  Dia da semana que mais concentra ausência: ' + dowPior +
    ' (' + dowMax + ' registros no mês).');

  var diaPior = null, diaMax = 0;
  Object.keys(a.diaAus).forEach(function (d) { if (a.diaAus[d] > diaMax) { diaMax = a.diaAus[d]; diaPior = d; } });
  if (diaPior) {
    var pd = diaPior.split('-');
    out.push('▪  Pico do mês: ' + pd[2] + '/' + pd[1] + ', com ' + diaMax + ' ausências num único dia.');
  }

  var inj = a.kpi.falta_inj || 0, at = a.kpi.atestados || 0;
  out.push('▪  Das ausências, ' + at + ' são atestado e ' + inj + ' são falta injustificada' +
    (a.kpi.ausencias ? ' (' + Math.round(inj / a.kpi.ausencias * 100) + '% do total sem justificativa)' : '') + '.');

  var top = topOfensores_(comp, 3);
  if (top.length) {
    out.push('▪  Concentração: ' + top.map(function (x) {
      return x.nome.split(' ')[0] + ' (' + x.aus + ')'; }).join(', ') +
      ' respondem por ' + top.reduce(function (s, x) { return s + x.aus; }, 0) + ' ausências.');
  }

  if ((a.cat['A CONFIRMAR'] || 0) > 0) {
    out.push('▪  Atenção: ' + a.cat['A CONFIRMAR'] + ' registros estão como "A CONFIRMAR" — ' +
      'há código do RH sem tradução no DE-PARA.');
  }
  return out;
}

function topOfensores_(comp, n) {
  var agc = ss_().getSheetByName(A_AGRC), last = agc.getLastRow(), out = [];
  if (last < L_AGR) return out;
  agc.getRange(L_AGR, 1, last - L_AGR + 1, 7).getValues().forEach(function (l) {
    if (comp_(l[0]) !== comp) return;
    var aus = num_(l[6]);
    if (aus > 0) out.push({ mat: String(l[1]), nome: String(l[2] || l[1]), aus: aus });
  });
  out.sort(function (x, y) { return y.aus - x.aus; });
  return out.slice(0, n);
}

/*==============================================================================
 * PERIODO — ausências num intervalo livre, com as DATAS de cada pessoa
 *============================================================================*/

function montarPeriodo_() {
  var w = ss_().getSheetByName(A_PER), cfg = cfgD_();
  if (!w) return;
  var NC = 15;                                   // colunas B..P
  var L1 = 19, N1 = 150;                         // tabela 1: linhas 19..168
  var L2 = 173, N2 = 1000;                       // tabela 2: linhas 173..1172
  var F1 = L1 + N1 - 1, F2 = L2 + N2 - 1;

  // guarda o que o usuário já tinha escolhido
  var ant = {
    rapido: String(w.getRange('B7').getValue() || 'Competência aberta'),
    de: w.getRange('D7').getValue(),
    ate: w.getRange('F7').getValue(),
    tipo: String(w.getRange('H7').getValue() || TIPOS_AUS[0]),
    turno: String(w.getRange('J7').getValue() || 'Todos')
  };

  garantir_(w, F2 + 6, 26);
  limparAba_(w);
  w.setColumnWidth(1, 24);
  var larguras = [110, 220, 60, 80, 70, 90, 90, 300, 190, 90, 90, 90, 90, 90, 90];
  for (var i = 0; i < larguras.length; i++) w.setColumnWidth(2 + i, larguras[i]);
  for (var c = 18; c <= 26; c++) w.setColumnWidth(c, 90);

  tituloAba_(w, 'FALTAS E AUSÊNCIAS POR PERÍODO', NC);

  // ---- controles
  rotulo_(w, 6, 2, 'PERÍODO RÁPIDO');
  rotulo_(w, 6, 4, 'DE');
  rotulo_(w, 6, 6, 'ATÉ');
  rotulo_(w, 6, 8, 'TIPO');
  rotulo_(w, 6, 10, 'TURNO');
  rotulo_(w, 6, 12, 'ATUALIZAR');
  seletor_(w, 'B7', ['Hoje', 'Ontem', 'Últimos 7 dias', 'Esta semana', 'Semana passada',
                     'Este mês', 'Mês passado', 'Competência aberta', 'Todo o histórico',
                     'Personalizado']);
  w.getRange('B7').setValue(ant.rapido);
  seletor_(w, 'H7', TIPOS_AUS);
  w.getRange('H7').setValue(TIPOS_AUS.indexOf(ant.tipo) > -1 ? ant.tipo : TIPOS_AUS[0]);
  var listaTurno = ['Todos'].concat(cfg.turnos);
  seletor_(w, 'J7', listaTurno);
  w.getRange('J7').setValue(listaTurno.indexOf(ant.turno) > -1 ? ant.turno : 'Todos');
  if (eData_(ant.de)) w.getRange('D7').setValue(ant.de);
  if (eData_(ant.ate)) w.getRange('F7').setValue(ant.ate);
  ['B7', 'D7', 'F7', 'H7', 'J7'].forEach(function (cel) { campo_(w, cel); });
  w.getRange('D7:G7').setNumberFormat('dd/mm/yyyy');
  w.getRange('L7').insertCheckboxes().setValue(false)
   .setNote('Marque para refazer esta aba. Trocar período, tipo ou turno já recalcula sozinho — ' +
            'a caixa serve para forçar a reconstrução.');
  w.getRange('L7').setHorizontalAlignment('center');
  w.setRowHeight(7, 26);

  if (!eData_(w.getRange('D7').getValue()) || !eData_(w.getRange('F7').getValue())) {
    aplicarPeriodo_(w, String(w.getRange('B7').getValue() || 'Competência aberta'));
  }

  nota_(w, 9, 2, NC, 'Escolha um período rápido e as datas se preenchem sozinhas. ' +
    'Para um intervalo próprio, ponha "Personalizado" e digite DE e ATÉ. ' +
    'A tabela 1 resume por pessoa e mostra os dias em que ela faltou; a tabela 2 traz cada ausência isolada.');
  w.setRowHeight(9, 30);

  // ---- filtros do QUERY (datas montadas sem TEXT, para não depender do idioma)
  var dDe = 'YEAR($D$7)&"-"&RIGHT("0"&MONTH($D$7),2)&"-"&RIGHT("0"&DAY($D$7),2)';
  var dAte = 'YEAR($F$7)&"-"&RIGHT("0"&MONTH($F$7),2)&"-"&RIGHT("0"&DAY($F$7),2)';
  var filtros =
    '"&IF($H$7="Todas as ausências","","and G = \'"&$H$7&"\' ")&' +
    'IF($J$7="Todos","","and E = \'"&$J$7&"\' ")&' +
    '"and A >= date \'"&' + dDe + '&"\' and A <= date \'"&' + dAte + '&"\' ';

  // ---- área de apoio (colunas R..X, ocultas)
  w.getRange(4, 23, 3, 2).setValues([['charttype', 'bar'], ['color1', VERM], ['color2', '#EDEFF7']]);

  formula_(w, 'R' + L1,
    '=IFERROR(QUERY(FATO_ASSIDUIDADE!$A:$H,"select D, count(A), min(A), max(A) where H = \'Sim\' ' +
    filtros + 'group by D order by count(A) desc, D limit ' + N1 +
    ' label D \'\', count(A) \'\', min(A) \'\', max(A) \'\'",0),"")');

  formula_(w, 'R' + L2,
    '=IFERROR(QUERY(FATO_ASSIDUIDADE!$A:$H,"select A, D, E, F, G where H = \'Sim\' ' +
    filtros + 'order by A desc, D limit ' + N2 +
    ' label A \'\', D \'\', E \'\', F \'\', G \'\'",0),"")');

  formula_(w, 'W12',
    '=IFERROR(QUERY(FATO_ASSIDUIDADE!$A:$H,"select A, count(D) where H = \'Sim\' ' +
    filtros + 'group by A order by count(D) desc, A desc limit 1 ' +
    'label A \'\', count(D) \'\'",0),"")');
  w.getRange('W12').setNumberFormat('dd/mm/yyyy');

  // ---- cartões
  cartao_(w, 11, 2, 3, 'COLABORADORES NO PERÍODO', '=COUNTA($B$' + L1 + ':$B$' + F1 + ')',
          '#,##0', '', 'pessoas com ao menos uma ausência');
  cartao_(w, 11, 5, 3, 'REGISTROS DE AUSÊNCIA', '=SUM($E$' + L1 + ':$E$' + F1 + ')',
          '#,##0', '', 'total no intervalo');
  cartao_(w, 11, 8, 3, 'DIAS NO PERÍODO', '=IFERROR(MAX(0,$F$7-$D$7+1),0)',
          '#,##0', '', 'de ponta a ponta');
  cartao_(w, 11, 11, 3, 'MÉDIA POR PESSOA', '=IFERROR($E$12/$B$12,0)',
          '0.0', '', 'ausências por colaborador');
  cartao_(w, 11, 14, 3, 'DIA MAIS CRÍTICO',
          '=IF($W$12="","—",DAY($W$12)&"/"&RIGHT("0"&MONTH($W$12),2))', '@',
          '="pico de "&IFERROR($X$12,0)&" ausências num dia só"', 'maior concentração do intervalo');

  // ---- 1 · por colaborador, com as datas
  secao_(w, 16, '1', 'COLABORADORES COM AUSÊNCIA NO PERÍODO', NC);
  formula_(w, 'B17',
    '=IF(COUNTA($R$' + L2 + ':$R$' + F2 + ')>=' + N2 +
    ',"⚠  O intervalo tem mais de ' + N2 + ' ausências: a coluna DATAS mostra só as ' + N2 +
    ' mais recentes. Reduza o período ou filtre por turno.",' +
    '"Ordenado do maior para o menor. Mude o período, o tipo ou o turno acima e a lista se refaz sozinha — ' +
    'a coluna DATAS traz o dia exato de cada ausência.")');
  w.getRange(17, 2, 1, NC).merge().setFontSize(8.5).setFontColor(CINZA).setFontStyle('italic')
   .setFontFamily('Arial').setBackground(CLARO).setVerticalAlignment('middle').setWrap(true);
  w.setRowHeight(17, 26);

  cabTabela_(w, 18, 2, ['MATRÍCULA', 'NOME', 'TURNO', 'REGISTROS', 'BARRA',
                        'PRIMEIRA', 'ÚLTIMA', 'DATAS DAS AUSÊNCIAS', 'TIPOS']);

  var rr = '$R$' + L1 + ':$R$' + F1;
  formula_(w, 'B' + L1, '=ARRAYFORMULA(IF(' + rr + '="","",' + rr + '))');
  formula_(w, 'C' + L1, '=ARRAYFORMULA(IF(' + rr + '="","",IFERROR(' +
    'VLOOKUP(' + rr + '&"",COLABORADORES!$A:$B,2,FALSE),"—")))');
  formula_(w, 'D' + L1, '=ARRAYFORMULA(IF(' + rr + '="","",IFERROR(' +
    'VLOOKUP(' + rr + '&"",COLABORADORES!$A:$C,3,FALSE),"—")))');
  formula_(w, 'E' + L1, '=ARRAYFORMULA(IF(' + rr + '="","",$S$' + L1 + ':$S$' + F1 + '))');
  formula_(w, 'G' + L1, '=ARRAYFORMULA(IF(' + rr + '="","",$T$' + L1 + ':$T$' + F1 + '))');
  formula_(w, 'H' + L1, '=ARRAYFORMULA(IF(' + rr + '="","",$U$' + L1 + ':$U$' + F1 + '))');

  var dataTxt = 'RIGHT("0"&DAY($R$' + L2 + ':$R$' + F2 + '),2)&"/"&' +
                'RIGHT("0"&MONTH($R$' + L2 + ':$R$' + F2 + '),2)';
  var mLinhas = [];
  for (var k = 0; k < N1; k++) {
    var r = L1 + k;
    mLinhas.push([
      '=IF($E' + r + '="","",SPARKLINE($Y' + r + ':$Z' + r + ',$W$4:$X$6))',           // F · barra
      '',                                                                              // G · vem do ARRAYFORMULA
      '',                                                                              // H · idem
      '=IF($B' + r + '="","",TEXTJOIN(", ",1,IFERROR(FILTER(' + dataTxt +
        ',$S$' + L2 + ':$S$' + F2 + '=$B' + r + '&""),"")))',                          // I · datas
      '=IF($B' + r + '="","",TEXTJOIN(" · ",1,IFERROR(UNIQUE(FILTER($V$' + L2 + ':$V$' + F2 +
        ',$S$' + L2 + ':$S$' + F2 + '=$B' + r + '&"")),"")))'                          // J · tipos
    ]);
  }
  // pares (valor, resto) que dão a escala das barras — ver comentário no PAINEL
  formulas_(w, L1, 25, mLinhas.map(function (l, k) {
    var rr2 = L1 + k;
    return ['=IF($E' + rr2 + '="","",$E' + rr2 + ')',
            '=IF($E' + rr2 + '="","",MAX($E$' + L1 + ':$E$' + F1 + ')-$E' + rr2 + ')'];
  }));
  // grava só as colunas F, I e J (G e H já são array das colunas de apoio)
  formulas_(w, L1, 6, mLinhas.map(function (l) { return [l[0]]; }));
  formulas_(w, L1, 9, mLinhas.map(function (l) { return [l[3], l[4]]; }));

  corpo_(w, L1, 2, N1, 9);
  w.getRange(L1, 2, N1, 1).setNumberFormat('@').setHorizontalAlignment('center');
  w.getRange(L1, 4, N1, 1).setHorizontalAlignment('center');
  w.getRange(L1, 5, N1, 1).setNumberFormat('#,##0').setHorizontalAlignment('center').setFontWeight('bold');
  w.getRange(L1, 7, N1, 2).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center');
  w.getRange(L1, 9, N1, 1).setFontSize(9).setFontColor(AZUL_ESC);
  w.getRange(L1, 10, N1, 1).setFontSize(9).setFontColor(CINZA);

  // ---- 2 · cada ausência, uma a uma
  secao_(w, 171, '2', 'CADA AUSÊNCIA DO PERÍODO, UMA A UMA', NC);
  cabTabela_(w, 172, 2, ['DATA', 'DIA', 'MATRÍCULA', 'NOME', 'TURNO', 'CÓDIGO', 'CATEGORIA']);
  var r2 = '$R$' + L2 + ':$R$' + F2, s2 = '$S$' + L2 + ':$S$' + F2;
  formula_(w, 'B' + L2, '=ARRAYFORMULA(IF(' + r2 + '="","",' + r2 + '))');
  formula_(w, 'C' + L2, '=ARRAYFORMULA(IF(' + r2 + '="","",' +
    'MID("domsegterquaquisexsáb",(WEEKDAY(' + r2 + ')-1)*3+1,3)))');
  formula_(w, 'D' + L2, '=ARRAYFORMULA(IF(' + s2 + '="","",' + s2 + '))');
  formula_(w, 'E' + L2, '=ARRAYFORMULA(IF(' + s2 + '="","",IFERROR(' +
    'VLOOKUP(' + s2 + '&"",COLABORADORES!$A:$B,2,FALSE),"—")))');
  formula_(w, 'F' + L2, '=ARRAYFORMULA(IF(' + s2 + '="","",$T$' + L2 + ':$T$' + F2 + '))');
  formula_(w, 'G' + L2, '=ARRAYFORMULA(IF(' + s2 + '="","",$U$' + L2 + ':$U$' + F2 + '))');
  formula_(w, 'H' + L2, '=ARRAYFORMULA(IF(' + s2 + '="","",$V$' + L2 + ':$V$' + F2 + '))');

  corpo_(w, L2, 2, N2, 7);
  w.getRange(L2, 2, N2, 1).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center');
  w.getRange(L2, 3, N2, 1).setHorizontalAlignment('center').setFontColor(CINZA);
  w.getRange(L2, 4, N2, 1).setNumberFormat('@').setHorizontalAlignment('center');
  w.getRange(L2, 6, N2, 2).setHorizontalAlignment('center');

  w.setConditionalFormatRules([
    escalaVermelha_(w.getRange(L1, 5, N1, 1)),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Falta injustificada').setFontColor(VERM).setBold(true)
      .setRanges([w.getRange(L2, 8, N2, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Atestado').setFontColor('#C2620A')
      .setRanges([w.getRange(L2, 8, N2, 1)]).build()
  ]);

  w.hideColumns(18, 9);
  w.setFrozenRows(7);
}

/** Preenche DE e ATÉ conforme o período rápido escolhido. */
function aplicarPeriodo_(w, escolha) {
  var hoje = new Date();
  hoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  var de = null, ate = null;

  function maisDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function inicioSemana(d) { return maisDias(d, -((d.getDay() + 6) % 7)); }   // segunda

  switch (escolha) {
    case 'Hoje':            de = hoje; ate = hoje; break;
    case 'Ontem':           de = maisDias(hoje, -1); ate = de; break;
    case 'Últimos 7 dias':  de = maisDias(hoje, -6); ate = hoje; break;
    case 'Esta semana':     de = inicioSemana(hoje); ate = maisDias(de, 6); break;
    case 'Semana passada':  de = maisDias(inicioSemana(hoje), -7); ate = maisDias(de, 6); break;
    case 'Este mês':
      de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      break;
    case 'Mês passado':
      de = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      ate = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      break;
    case 'Todo o histórico':
      var lim = limitesFato_(null);
      de = lim.de; ate = lim.ate;
      break;
    case 'Personalizado':
      return;
    default:
      var abertas = arquivos_().filter(function (x) { return x.aberta; });
      var lim2 = limitesFato_(abertas.length ? abertas[0].comp : null);
      de = lim2.de; ate = lim2.ate;
  }
  if (de) w.getRange('D7').setValue(de);
  if (ate) w.getRange('F7').setValue(ate);
}

/** Menor e maior data da FATO, opcionalmente restrito a uma competência. */
function limitesFato_(comp) {
  var fato = ss_().getSheetByName(A_FATO), last = fato.getLastRow();
  var hoje = new Date();
  if (last < L_FATO) return { de: hoje, ate: hoje };
  var v = fato.getRange(L_FATO, 1, last - L_FATO + 1, 2).getValues();
  var min = null, max = null;
  v.forEach(function (l) {
    if (!eData_(l[0])) return;
    if (comp && comp_(l[1]) !== comp) return;
    if (!min || l[0] < min) min = l[0];
    if (!max || l[0] > max) max = l[0];
  });
  return { de: min || hoje, ate: max || hoje };
}

/*==============================================================================
 * COLABORADOR (ficha) e RANKING
 *============================================================================*/

function montarFicha_() {
  var f = ss_().getSheetByName(A_FICHA), col = ss_().getSheetByName(A_COL);
  var last = col.getLastRow(), rot = [];
  if (last >= L_COL) {
    col.getRange(L_COL, 6, last - L_COL + 1, 1).getValues()
       .forEach(function (l) { if (l[0]) rot.push(String(l[0])); });
  }
  if (rot.length) seletor_(f, 'B7', rot);

  formula_(f, 'H7', '=IFERROR(VLOOKUP($F$7&"",COLABORADORES!$A:$C,3,FALSE),"")');

  f.getRange('B19:L31').clearContent();
  formula_(f, 'B19',
    '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select A, D, E, F, G, H, I, J, K, L, M ' +
    'where B = \'"&$F$7&"\' order by A",0),"")');
  f.getRange('L19:L31').setNumberFormat('0.0%');

  f.getRange('B53:F102').clearContent();
  formula_(f, 'B53',
    '=IFERROR(QUERY(FATO_ASSIDUIDADE!$A:$H,"select A, B, F, G ' +
    'where D = \'"&$F$7&"\' and H = \'Sim\' order by A desc limit 50",0),"")');
  // VLOOKUP no lugar de INDEX/MATCH: dentro de ARRAYFORMULA o MATCH não se
  // propaga e repetia a mesma descrição em todas as linhas.
  formula_(f, 'F53',
    '=ARRAYFORMULA(IF($D$53:$D$102="","",IFERROR(VLOOKUP($D$53:$D$102,\'DE-PARA\'!$A:$B,2,FALSE),"—")))');
  f.getRange('B53:B102').setNumberFormat('dd/mm/yyyy');

  f.setConditionalFormatRules([
    escalaVermelha_(f.getRange('G19:G31')),
    escalaVerde_(f.getRange('L19:L31')),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Falta injustificada').setFontColor(VERM).setBold(true)
      .setRanges([f.getRange('E53:E102')]).build()
  ]);

  SpreadsheetApp.flush();
  f.getCharts().forEach(function (c) { f.removeChart(c); });

  graf_(f, Charts.ChartType.LINE, ['B107:B119', 'C107:C119'], 34, 2,
        '% de assiduidade mês a mês', VERDE,
        { width: 580, height: 290, curveType: 'function', pointSize: 6,
          vAxis: { format: 'percent', gridlines: { color: '#EEF0F6' } } });
  graf_(f, Charts.ChartType.COLUMN, ['B107:B119', 'D107:E119'], 34, 9,
        'Faltas injustificadas e atestados mês a mês', null,
        { width: 580, height: 290, colors: [VERM, '#C2620A'],
          legend: { position: 'top', textStyle: { fontSize: 9 } },
          vAxis: { gridlines: { color: '#EEF0F6' } } });
}

function montarRanking_(lista) {
  var r = ss_().getSheetByName(A_RANK);
  seletor_(r, 'B7', lista);
  if (!Number(r.getRange('D7').getValue())) r.getRange('D7').setValue(10);

  // o WHERE fica DENTRO das aspas do select — fora delas quebra a fórmula inteira
  var cond = ' where A = \'"&$B$7&"\' and F + G >= "&$D$7&"';

  r.getRange('B23:G37').clearContent();
  formula_(r, 'B23', '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select B, C, D, F, G, M' + cond +
    ' order by M desc, G asc limit 15",0),"")');
  r.getRange('G23:G37').setNumberFormat('0.0%');

  r.getRange('I23:N37').clearContent();
  formula_(r, 'I23', '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select B, C, D, F, G, M' + cond +
    ' order by M asc, G desc limit 15",0),"")');
  r.getRange('N23:N37').setNumberFormat('0.0%');

  r.getRange('B42:H56').clearContent();
  formula_(r, 'B42', '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select B, C, D, H, G, M, P' +
    ' where A = \'"&$B$7&"\' and H > 0 order by H desc limit 15",0),"")');
  r.getRange('G42:G56').setNumberFormat('0.0%');
  r.getRange('H42:H56').setNumberFormat('dd/mm/yyyy');

  r.getRange('J42:O56').clearContent();
  formula_(r, 'J42', '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select B, C, D, I, G, M' +
    ' where A = \'"&$B$7&"\' and I > 0 order by I desc limit 15",0),"")');
  r.getRange('O42:O56').setNumberFormat('0.0%');

  r.getRange('B61:G80').clearContent();
  formula_(r, 'B61',
    '=IFERROR(QUERY(AGR_COLAB!$A:$Q,"select B, C, D, count(A), sum(G), sum(H) ' +
    'where G > 0 group by B, C, D order by count(A) desc, sum(G) desc limit 20 ' +
    'label B \'\', C \'\', D \'\', count(A) \'\', sum(G) \'\', sum(H) \'\'",0),"")');

  r.setConditionalFormatRules([
    escalaVerde_(r.getRange('I12:I17')),
    escalaVerde_(r.getRange('G23:G37')),
    escalaVerde_(r.getRange('N23:N37')),
    escalaVermelha_(r.getRange('E42:E56')),
    escalaVermelha_(r.getRange('M42:M56')),
    escalaVermelha_(r.getRange('F61:F80'))
  ]);

  SpreadsheetApp.flush();
  r.getCharts().forEach(function (c) { r.removeChart(c); });
  graf_(r, Charts.ChartType.COLUMN, ['B12:B17', 'I12:I17'], 10, 12,
        '% de assiduidade por turno', VERDE,
        { width: 420, height: 260,
          vAxis: { format: 'percent', gridlines: { color: '#EEF0F6' } } });
}

/*==============================================================================
 * CENTRAL DE COMANDO — os botões
 *============================================================================*/

function abrirCentral() {
  var h = HtmlService.createHtmlOutput(htmlCentral_()).setTitle('GSL Dados · Central de comando');
  SpreadsheetApp.getUi().showSidebar(h);
}

function htmlCentral_() {
  return '' +
'<style>' +
' body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2430;margin:0;padding:0 12px 24px}' +
' .topo{margin:0 -12px 14px;padding:14px 12px 10px;background:' + AZUL + ';color:#fff}' +
' .topo b{font-size:13px;letter-spacing:.4px}' +
' .topo span{display:block;font-size:10.5px;opacity:.75;margin-top:2px}' +
' .regua{display:flex;height:4px;margin:10px -12px 0}' +
' .regua i{flex:1}.regua i:nth-child(1){background:' + VERDE + '}' +
' .regua i:nth-child(2){background:' + AMAR + '}.regua i:nth-child(3){background:' + VERM + '}' +
' h4{margin:16px 0 6px;font-size:10px;letter-spacing:.9px;color:' + CINZA + ';text-transform:uppercase}' +
' button{display:block;width:100%;margin:0 0 6px;padding:9px 10px;text-align:left;cursor:pointer;' +
'  border:1px solid ' + BORDA + ';border-radius:3px;background:#fff;font-size:12px;color:#1f2430}' +
' button:hover{background:' + CLARO + ';border-color:' + AZUL + '}' +
' button:disabled{opacity:.5;cursor:wait}' +
' button.forte{background:' + AZUL + ';color:#fff;border-color:' + AZUL + ';font-weight:bold}' +
' button.forte:hover{background:' + AZUL_ESC + '}' +
' .abas{display:flex;flex-wrap:wrap;gap:4px}' +
' .abas button{width:auto;flex:0 0 auto;padding:5px 9px;font-size:11px}' +
' #status{background:' + CLARO + ';border:1px solid ' + BORDA + ';border-radius:3px;padding:8px 10px;' +
'  font-size:11px;line-height:1.55;white-space:pre-wrap}' +
' #log{margin-top:10px;padding:8px 10px;border-left:3px solid ' + VERDE + ';background:#F6FBF7;' +
'  font-size:11px;line-height:1.5;white-space:pre-wrap;display:none}' +
' #log.erro{border-left-color:' + VERM + ';background:#FEF4F4}' +
'</style>' +
'<div class="topo"><b>GSL DADOS</b><span>base analítica · CD Feira de Santana</span>' +
'<div class="regua"><i></i><i></i><i></i></div></div>' +
'<div id="status">carregando…</div>' +
'<h4>Dados</h4>' +
'<button class="forte" onclick="ir(\'apiAtualizar\',this)">Atualizar o painel</button>' +
'<button onclick="ir(\'apiImportar\',this)">Importar do RH agora</button>' +
'<button onclick="ir(\'apiPreview\',this)">Pré-visualizar a importação</button>' +
'<h4>Manutenção</h4>' +
'<button onclick="ir(\'apiReclassificar\',this)">Reclassificar códigos</button>' +
'<button onclick="ir(\'apiPendentes\',this)">Ver códigos sem tradução</button>' +
'<button onclick="ir(\'apiDiagnostico\',this)">Rodar diagnóstico de leitura</button>' +
'<h4>Automação</h4>' +
'<button onclick="ir(\'apiLigarDiaria\',this)">Ligar a consulta diária</button>' +
'<button onclick="ir(\'apiDesligarDiaria\',this)">Desligar a consulta diária</button>' +
'<button onclick="ir(\'apiLigarBotoes\',this)">Ligar as caixas de ação da planilha</button>' +
'<h4>Ir para</h4>' +
'<div class="abas">' +
['PAINEL', 'PERIODO', 'COLABORADOR', 'RANKING', 'ARQUIVOS_RH', 'DE-PARA', 'CONFIG']
  .map(function (a) { return '<button onclick="abrir(\'' + a + '\')">' + a + '</button>'; }).join('') +
'</div>' +
'<div id="log"></div>' +
'<script>' +
' function pinta(t,erro){var l=document.getElementById("log");l.textContent=t;' +
'  l.className=erro?"erro":"";l.style.display="block";}' +
' function ir(fn,btn){var t=btn.textContent;btn.disabled=true;btn.textContent="processando…";' +
'  google.script.run.withSuccessHandler(function(r){btn.disabled=false;btn.textContent=t;' +
'   pinta(r,false);carregar();}).withFailureHandler(function(e){btn.disabled=false;' +
'   btn.textContent=t;pinta(String(e.message||e),true);})[fn]();}' +
' function abrir(a){google.script.run.apiIrPara(a);}' +
' function carregar(){google.script.run.withSuccessHandler(function(r){' +
'  document.getElementById("status").textContent=r;}).apiStatus();}' +
' carregar();' +
'</script>';
}

function apiStatus() {
  try {
    var lista = competencias_();
    var regs = arquivos_();
    var ultima = null, abertas = [];
    regs.forEach(function (r) {
      if (r.aberta) abertas.push(r.comp);
    });
    var shArq = ss_().getSheetByName(A_ARQ), last = shArq.getLastRow();
    if (last >= L_ARQ) {
      shArq.getRange(L_ARQ, 5, last - L_ARQ + 1, 1).getValues().forEach(function (l) {
        if (eData_(l[0]) && (!ultima || l[0] > ultima)) ultima = l[0];
      });
    }
    var fato = ss_().getSheetByName(A_FATO);
    var linhas = Math.max(0, fato.getLastRow() - L_FATO + 1);
    return 'Competências na base: ' + (lista.length ? lista.join(', ') : 'nenhuma') +
      '\nAbertas (reimportadas todo dia): ' + (abertas.length ? abertas.join(', ') : 'nenhuma') +
      '\nLinhas na FATO: ' + linhas.toLocaleString('pt-BR') +
      '\nÚltima importação: ' + (ultima ? br_(ultima) + ' ' +
        Utilities.formatDate(ultima, tz_(), 'HH:mm') : 'nunca');
  } catch (e) { return 'Não consegui ler o status: ' + e.message; }
}

function apiAtualizar()      { return atualizarTudo_(); }
function apiImportar()       { var r = importar_(false); atualizarTudo_(); return r.msg; }
function apiPreview()        { previewImportacao(); return 'Pré-visualização aberta na janela.'; }
function apiReclassificar()  { return reclassificar_(); }
function apiPendentes()      { return pendentes_(); }
function apiDiagnostico()    { diagnosticoLeitura(); return 'Diagnóstico pronto na aba DIAGNÓSTICO.'; }
function apiLigarDiaria()    { return ligarDiaria_(); }
function apiDesligarDiaria() { return (removerGatilhoDiario_() ? 'Consulta diária desligada.'
                                                               : 'Não havia consulta diária ligada.'); }
function apiLigarBotoes()    { return ligarBotoes_(); }

function apiIrPara(aba) {
  var sh = ss_().getSheetByName(aba);
  if (sh) ss_().setActiveSheet(sh);
}

/*==============================================================================
 * Gatilhos
 *============================================================================*/

function instalarGatilhoDiario() { SpreadsheetApp.getUi().alert(ligarDiaria_()); }

function ligarDiaria_() {
  var cfg = cfgD_();
  removerGatilhoDiario_();
  ScriptApp.newTrigger('consultaDiaria').timeBased().atHour(cfg.hora).everyDays(1).create();
  return 'Consulta diária ligada.\n\nTodo dia, por volta das ' + cfg.hora +
    'h, o script reabre a planilha do RH da competência marcada como Aberta e regrava as linhas dela. ' +
    'Meses Fechados não são tocados.';
}

function removerGatilhoDiario() {
  SpreadsheetApp.getUi().alert(removerGatilhoDiario_()
    ? 'Consulta diária desligada.' : 'Não havia consulta diária ligada.');
}

function removerGatilhoDiario_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'consultaDiaria') { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

function instalarGatilhoBotoes() { SpreadsheetApp.getUi().alert(ligarBotoes_()); }

/**
 * As caixas de ação (PAINEL!N7, PAINEL!P7, PERIODO!L7) precisam de gatilho
 * INSTALÁVEL: o gatilho simples onEdit não tem permissão para abrir a planilha
 * do RH nem para criar gráficos. Basta ligar uma vez por conta de usuário.
 */
function ligarBotoes_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'aoEditar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(ss_()).onEdit().create();
  return 'Caixas de ação ligadas.\n\nA partir de agora:\n' +
    '• PAINEL · marcar ATUALIZAR PAINEL reconstrói as telas\n' +
    '• PAINEL · marcar IMPORTAR AGORA reimporta o RH e reconstrói\n' +
    '• PERIODO · marcar ATUALIZAR refaz a aba\n\n' +
    'A caixa se desmarca sozinha quando a ação termina.';
}

/** Gatilho instalável: caixas de ação + período rápido. */
function aoEditar(e) {
  var r = e.range, sh = r.getSheet(), nome = sh.getName();
  var lin = r.getRow(), col = r.getColumn();

  if (nome === A_PER && lin === 7 && col === 2) {
    aplicarPeriodo_(sh, String(r.getValue() || ''));
    return;
  }
  if (r.getValue() !== true) return;

  if (nome === A_PAI && lin === 7 && col === 14) {
    r.setValue(false);
    ss_().toast('Reconstruindo as telas…', 'GSL Dados', 8);
    atualizarTudo_();
    ss_().toast('Painel atualizado.', 'GSL Dados', 5);
  } else if (nome === A_PAI && lin === 7 && col === 16) {
    r.setValue(false);
    ss_().toast('Consultando a folha de ponto do RH…', 'GSL Dados', 20);
    importar_(true);
    atualizarTudo_();
    ss_().toast('Importado e atualizado.', 'GSL Dados', 5);
  } else if (nome === A_PER && lin === 7 && col === 12) {
    r.setValue(false);
    ss_().toast('Refazendo a aba PERIODO…', 'GSL Dados', 8);
    montarPeriodo_();
    ss_().toast('PERIODO atualizado.', 'GSL Dados', 5);
  }
}

/** Gatilho simples: só o período rápido, que não exige autorização. */
function onEdit(e) {
  try {
    var r = e.range, sh = r.getSheet();
    if (sh.getName() !== A_PER) return;
    if (r.getRow() !== 7 || r.getColumn() !== 2) return;
    aplicarPeriodo_(sh, String(r.getValue() || ''));
  } catch (err) { /* gatilho simples nunca deve travar a edição do usuário */ }
}

/*==============================================================================
 * Manutenção
 *============================================================================*/

function reclassificarCodigos() { SpreadsheetApp.getUi().alert(reclassificar_()); }

function reclassificar_() {
  var fato = ss_().getSheetByName(A_FATO), last = fato.getLastRow();
  if (last < L_FATO) return 'A base está vazia.';
  var mapa = dePara_(), n = last - L_FATO + 1;
  var cods = fato.getRange(L_FATO, 6, n, 1).getValues();
  var comps = fato.getRange(L_FATO, 2, n, 1).getValues();
  var atual = fato.getRange(L_FATO, 7, n, 2).getValues();
  var saida = [], mudou = 0, pend = {}, tocadas = {};
  for (var i = 0; i < n; i++) {
    var cod = codigo_(cods[i][0]);
    var t = traduz_(mapa, cod);
    var novo = [t.cat, t.aus ? 'Sim' : 'Não'];
    if (t.cat === 'A CONFIRMAR') pend[cod] = true;
    if (String(atual[i][0]) !== novo[0] || String(atual[i][1]) !== novo[1]) {
      mudou++; tocadas[comp_(comps[i][0])] = 1;
    }
    saida.push(novo);
  }
  fato.getRange(L_FATO, 7, n, 2).setValues(saida);
  Object.keys(tocadas).forEach(agregar_);
  var lp = Object.keys(pend);
  return 'Reclassificação concluída.\n\n' + n + ' linha(s) revistas · ' + mudou + ' alterada(s).' +
    (lp.length ? '\n\nAinda sem tradução: ' + lp.join(', ')
               : '\n\nTodos os códigos estão traduzidos.') +
    (mudou ? '\n\nO AGREGADO foi refeito — atualize o painel.' : '');
}

function codigosPendentes() { SpreadsheetApp.getUi().alert(pendentes_()); }

function pendentes_() {
  var fato = ss_().getSheetByName(A_FATO), last = fato.getLastRow();
  if (last < L_FATO) return 'A base está vazia.';
  var mapa = dePara_(), pend = {};
  fato.getRange(L_FATO, 6, last - L_FATO + 1, 1).getValues().forEach(function (l) {
    var c = codigo_(l[0]);
    if (c && traduz_(mapa, c).cat === 'A CONFIRMAR') pend[c] = (pend[c] || 0) + 1;
  });
  var ks = Object.keys(pend).sort();
  return ks.length
    ? 'CÓDIGOS SEM TRADUÇÃO\n\n' + ks.map(function (k) {
        return '  ' + k + ' — ' + pend[k] + ' lançamento(s)'; }).join('\n') +
      '\n\nAcrescente no DE-PARA e rode "Reclassificar códigos".'
    : 'Nenhum código pendente.';
}

/*==============================================================================
 * Diagnóstico
 *============================================================================*/

function diagnosticoLeitura() {
  var out = [], cfg = null;
  function L(a, b) { out.push([a, b === undefined ? '' : String(b)]); }
  function T(t) { out.push(['', '']); out.push([t, '']); }

  T('1 · CONFIG');
  try {
    cfg = cfgD_();
    L('Aba da folha de ponto', cfg.aba || '(primeira aba)');
    L('Cabeçalho de matrícula', cfg.cabMat);
    L('Cabeçalho de turno', cfg.cabTurno);
    L('Turnos aceitos', cfg.turnos.join(' | '));
    L('Textos que cortam a linha', cfg.corta.join(' | '));
    L('Modo', cfg.manual ? 'MANUAL' : 'Automático');
  } catch (e) { L('>>> ERRO', e.message); }

  var regs = arquivos_();
  L('Competências cadastradas', regs.length);

  regs.forEach(function (reg) {
    T('2 · ' + reg.comp + ' (' + (reg.aberta ? 'Aberta' : 'Fechada') + ')');
    var f, det;
    try { f = abrirFolha_(reg, cfg); }
    catch (e) { L('>>> ERRO ao abrir', e.message); return; }
    L('Arquivo', f.arq.getName());
    L('Abas do arquivo', f.arq.getSheets().map(function (s) { return s.getName(); }).join(' · '));
    L('Aba usada', f.sh.getName());
    L('Dimensão lida', f.m.length + ' linhas × ' + (f.m[0] ? f.m[0].length : 0) + ' colunas');

    det = detectar_(f.m, cfg);
    L('Linha do cabeçalho', det.linCab < 0 ? '>>> NÃO ACHADA' : det.linCab + 1);
    L('Coluna da matrícula', det.colMat >= 0 ? colLetra_(det.colMat + 1) : '>>> NÃO ACHADA');
    L('Coluna do turno', det.colTurno >= 0 ? colLetra_(det.colTurno + 1) : '>>> NÃO ACHADA');
    L('Colunas de data', det.cols.length + (det.cols.length ?
      ' (' + br_(det.cols[0].data) + ' a ' + br_(det.cols[det.cols.length - 1].data) + ')' : ''));
    det.erros.forEach(function (e) { L('>>> ERRO', e); });
    det.avisos.forEach(function (e) { L('>>> aviso', e); });

    T('3 · AMOSTRA — 18 linhas × 12 colunas como o script enxerga');
    for (var r = 0; r < Math.min(f.m.length, 18); r++) {
      var cs = [];
      for (var c = 0; c < Math.min(f.m[r].length, 12); c++) {
        var v = f.m[r][c];
        if (eData_(v)) v = br_(v);
        cs.push(String(v === null ? '' : v).substring(0, 16));
      }
      L('linha ' + (r + 1), cs.join(' ¦ '));
    }

    if (det.linCab >= 0 && det.cols.length) {
      T('4 · EXTRAÇÃO ' + reg.comp);
      var ext = extrair_(f.m, det, cfg, reg.comp);
      L('Registros que seriam gravados', ext.regs.length);
      Object.keys(ext.porTurno).sort().forEach(function (t) {
        L('  Turno ' + (t || '(vazio)'), ext.porTurno[t].pessoas + ' colaborador(es) · ' +
                                          ext.porTurno[t].celulas + ' lançamento(s)');
      });
      var fora = Object.keys(ext.turnosFora);
      if (fora.length) L('  Turnos ignorados', fora.join(', '));
      var mapa = dePara_(), cods = Object.keys(ext.codigos).sort();
      L('Códigos distintos', cods.length);
      L('  Contagem', cods.map(function (c) { return c + '×' + ext.codigos[c]; })
        .join(' · ').substring(0, 500));
      var sem = cods.filter(function (c) { return traduz_(mapa, c).cat === 'A CONFIRMAR'; });
      L('  Sem tradução', sem.length ? sem.join(', ') : 'nenhum');
    }
  });

  T('5 · CONFERÊNCIA DAS TELAS');
  var lc = ss_().getSheetByName(A_COL).getLastRow();
  L('Colaboradores cadastrados', Math.max(0, lc - L_COL + 1));
  L('Competências no AGREGADO', competencias_().join(', ') || 'nenhuma');

  var d = ss_().getSheetByName('DIAGNÓSTICO');
  if (d) ss_().deleteSheet(d);
  d = ss_().insertSheet('DIAGNÓSTICO');
  d.getRange(1, 1, out.length, 2).setValues(out);
  d.setColumnWidth(1, 250);
  d.setColumnWidth(2, 780);
  d.getRange(1, 1, out.length, 2).setFontFamily('Consolas').setFontSize(9).setVerticalAlignment('top');
  d.getRange(1, 1, out.length, 1).setFontWeight('bold');
  ss_().setActiveSheet(d);
}
