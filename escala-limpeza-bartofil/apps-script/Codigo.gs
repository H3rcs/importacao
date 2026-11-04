/**
 * Escala de Limpeza – Loja Bartofil
 * Google Apps Script vinculado a uma planilha.
 *
 * Arquivos do projeto:
 *   Codigo.gs       (este arquivo)
 *   Index.html      (o app)
 *   appsscript.json (manifesto)
 *
 * Primeira vez: selecione a função "instalar" no editor e clique em Executar.
 */

const APP_TITULO = 'Escala de Limpeza – Loja Bartofil';
const ABA_DADOS = '_dados';
const PASTA_NOME = 'Escala de Limpeza – Loja Bartofil';
const TAM_PARTE = 45000;           // limite seguro por célula (máx. do Sheets: 50.000)
const COR = { azul:'#0B4EA2', azulClaro:'#E4EDF9', verde:'#169C46', amarelo:'#FFC72C', tinta:'#14243D', cinza:'#EEF2F7', linha:'#C9D3E0' };

/* ======================= App da Web ======================= */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_TITULO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ======================= Menu da planilha ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Escala de limpeza')
    .addItem('Abrir o app', 'abrirApp')
    .addItem('Abrir a pasta de exportações no Drive', 'abrirPasta')
    .addSeparator()
    .addItem('Instalar ou reparar', 'instalar')
    .addToUi();
}

function abrirApp() {
  const url = ScriptApp.getService().getUrl();
  const html = url
    ? '<div style="font-family:Arial;font-size:14px">Abra o app neste link:<br><br><a href="' + url + '" target="_blank">' + url + '</a></div>'
    : '<div style="font-family:Arial;font-size:14px">O app ainda não foi implantado. No editor do Apps Script: Implantar &gt; Nova implantação &gt; App da Web.</div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(140), 'Escala de limpeza');
}

function abrirPasta() {
  const url = pasta_().getUrl();
  const html = '<div style="font-family:Arial;font-size:14px"><a href="' + url + '" target="_blank">Abrir a pasta no Drive</a></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(360).setHeight(90), 'Exportações');
}

/** Rode uma vez pelo editor: liga o script à planilha, cria a aba de dados e a pasta no Drive. */
function instalar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abra o Apps Script a partir da planilha (Extensões > Apps Script) e rode instalar de lá.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PLANILHA_ID', ss.getId());
  if (!props.getProperty('REV')) props.setProperty('REV', '0');
  abaDados_(ss);
  pasta_();
  return 'Instalação concluída';
}

/* ======================= Dados do app ======================= */
function planilha_() {
  const id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Rode a função instalar uma vez no editor do Apps Script.');
  PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', ss.getId());
  return ss;
}

function abaDados_(ss) {
  let sh = ss.getSheetByName(ABA_DADOS);
  if (!sh) {
    sh = ss.insertSheet(ABA_DADOS);
    sh.getRange('A1').setValue('Não edite esta aba: são os dados do app Escala de Limpeza.');
    sh.setColumnWidth(1, 600);
    sh.hideSheet();
  }
  return sh;
}

function versaoDados() {
  return Number(PropertiesService.getScriptProperties().getProperty('REV') || 0);
}

function obterDados() {
  const sh = abaDados_(planilha_());
  const n = sh.getLastRow();
  const rev = versaoDados();
  if (n < 2) return { json: null, rev: rev };
  const partes = sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0] || '').slice(1); });
  const json = partes.join('');
  return { json: json || null, rev: rev };
}

function salvarDados(json, rev) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const atual = versaoDados();
    if (rev !== null && rev !== undefined && Number(rev) !== atual) {
      const d = obterDados();
      if (d.json) return { conflito: true, json: d.json, rev: atual };
    }
    const sh = abaDados_(planilha_());
    const linhas = [];
    // Prefixo "x" impede que o Sheets interprete o texto como fórmula.
    for (let i = 0; i < json.length; i += TAM_PARTE) linhas.push(['x' + json.slice(i, i + TAM_PARTE)]);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).clearContent();
    sh.getRange(2, 1, linhas.length, 1).setNumberFormat('@').setValues(linhas);
    sh.getRange('A1').setValue('Não edite esta aba: são os dados do app Escala de Limpeza. Atualizado em ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
    const nova = atual + 1;
    props.setProperty('REV', String(nova));
    return { ok: true, rev: nova };
  } finally {
    lock.releaseLock();
  }
}

/* ======================= Drive ======================= */
function pasta_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const it = DriveApp.getFoldersByName(PASTA_NOME);
  const pasta = it.hasNext() ? it.next() : DriveApp.createFolder(PASTA_NOME);
  props.setProperty('PASTA_ID', pasta.getId());
  return pasta;
}

function subpasta_(nome) {
  const pai = pasta_();
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

function salvarArquivo_(pasta, blob, nome) {
  const iguais = pasta.getFilesByName(nome);
  while (iguais.hasNext()) iguais.next().setTrashed(true);
  return pasta.createFile(blob.setName(nome)).getUrl();
}

function salvarBackup(json) {
  const pasta = subpasta_('Backups');
  const nome = 'escala-limpeza-backup-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm') + '.json';
  const url = pasta.createFile(Utilities.newBlob(json, 'application/json', nome)).getUrl();
  return { pdfs: [{ nome: nome, url: url }], pasta: pasta.getUrl() };
}

/* ======================= Exportar escalas da semana ======================= */
/**
 * Recebe do app a semana já montada e:
 *  1) escreve uma aba por pessoa ("Escala Lu", "Escala Agnaldo") com caixas de seleção;
 *  2) atualiza as abas "Rodízio" e "Carga";
 *  3) gera um PDF de cada escala na pasta do Drive (subpasta Escalas).
 */
function exportarSemana(p) {
  const ss = planilha_();
  p.pessoas.forEach(function (pe) { escreverEscala_(aba_(ss, 'Escala ' + pe.nome), p, pe); });
  escreverRodizio_(aba_(ss, 'Rodízio'), p);
  escreverCarga_(aba_(ss, 'Carga'), p);
  SpreadsheetApp.flush();

  const pasta = subpasta_('Escalas');
  const pdfs = p.pessoas.map(function (pe) {
    const sh = ss.getSheetByName('Escala ' + pe.nome);
    const nome = 'Escala ' + pe.nome + ' – semana ' + p.rotulo + '.pdf';
    return { nome: nome, url: salvarArquivo_(pasta, pdfDaAba_(ss, sh), nome) };
  });
  return { planilha: ss.getUrl(), pdfs: pdfs, pasta: pasta.getUrl() };
}

function aba_(ss, nome) {
  let sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.setFrozenRows(0);
  return sh;
}

function escreverEscala_(sh, p, pe) {
  const nd = p.dias.length;
  const nc = 4 + nd;                         // Horário, Tarefa, Observação, POP + dias
  const cab = ['Horário', 'Tarefa', 'Observação', 'POP'].concat(p.dias);
  sh.getRange(1, 1, 1, nc).merge().setValue('Bartofil   |   Checklist semanal de limpeza da loja')
    .setBackground(COR.azul).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(15).setVerticalAlignment('middle');
  sh.setRowHeight(1, 40);
  sh.getRange(2, 1, 1, nc).setBackground(COR.verde); sh.setRowHeight(2, 5);
  sh.getRange(3, 1, 1, nc).setBackground(COR.amarelo); sh.setRowHeight(3, 5);
  sh.getRange(4, 1, 1, nc).merge().setValue(pe.nome + '   |   ' + pe.turnos + '   |   ' + p.periodo)
    .setFontWeight('bold').setFontSize(12).setFontColor(COR.tinta);
  sh.setRowHeight(4, 28);

  const r0 = 6;
  sh.getRange(r0, 1, 1, nc).setValues([cab]).setBackground(COR.cinza).setFontWeight('bold').setHorizontalAlignment('center');
  const linhas = pe.linhas.map(function (l) {
    return [l.hora + ' – ' + l.fim, l.tarefa + (l.altura ? '  [ALTURA]' : ''), l.obs, l.pop]
      .concat(l.marcas.map(function (m) { return m === null ? '' : m; }));
  });
  if (linhas.length) {
    const rg = sh.getRange(r0 + 1, 1, linhas.length, nc);
    rg.setValues(linhas).setVerticalAlignment('middle').setFontSize(10);
    sh.getRange(r0 + 1, 3, linhas.length, 1).setWrap(true).setFontColor('#5A6A80').setFontSize(9);
    sh.getRange(r0 + 1, 1, linhas.length, 1).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(r0 + 1, 4, linhas.length, 1).setHorizontalAlignment('center').setFontSize(9);
    if (nd) {
      const bloco = sh.getRange(r0 + 1, 5, linhas.length, nd);
      bloco.insertCheckboxes().setHorizontalAlignment('center');
      bloco.setValues(pe.linhas.map(function (l) { return l.marcas.map(function (m) { return m === true; }); }));
      const vazias = [];
      pe.linhas.forEach(function (l, i) {
        l.marcas.forEach(function (m, j) { if (m === null) vazias.push(sh.getRange(r0 + 1 + i, 5 + j).getA1Notation()); });
      });
      if (vazias.length) {
        const rl = sh.getRangeList(vazias);
        rl.clearDataValidations();
        rl.setValue('');
        rl.setBackground('#F1F4F8');
      }
    }
  }
  const rv = r0 + 1 + linhas.length;
  sh.getRange(rv, 1, 1, nc).setValues([['Visto', 'Rubrica de quem conferiu', '', ''].concat(p.dias.map(function () { return ''; }))])
    .setFontWeight('bold').setBackground(COR.azulClaro);
  sh.setRowHeight(rv, 30);
  sh.getRange(r0, 1, rv - r0 + 1, nc).setBorder(true, true, true, true, true, true, COR.linha, SpreadsheetApp.BorderStyle.SOLID);

  const ra = rv + 2;
  sh.getRange(ra, 1, 1, 2).merge().setValue('Assinatura: ' + pe.nome).setBorder(true, null, null, null, null, null);
  sh.getRange(ra, 3, 1, 1).setValue('Conferido por').setBorder(true, null, null, null, null, null);
  sh.getRange(ra, 5, 1, Math.max(1, nd)).merge().setValue('Observações').setBorder(true, null, null, null, null, null);
  sh.getRange(ra + 2, 1, 1, nc).merge().setValue('Gerado pelo app Escala de Limpeza em ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '. Os POPs indicados estão afixados em cada ambiente.')
    .setFontSize(8).setFontColor('#8796AA');

  sh.setColumnWidth(1, 100); sh.setColumnWidth(2, 280); sh.setColumnWidth(3, 260); sh.setColumnWidth(4, 82);
  for (let j = 0; j < nd; j++) sh.setColumnWidth(5 + j, 74);
  sh.setFrozenRows(r0);
  sh.setHiddenGridlines(true);
}

function escreverRodizio_(sh, p) {
  sh.getRange(1, 1, 1, 3).merge().setValue('Rodízio dos turnos – próximas 12 semanas')
    .setBackground(COR.azul).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13);
  sh.getRange(3, 1, 1, 3).setValues([['Semana',
    p.turnos.T1.nome + ' (' + p.turnos.T1.ini + ' às ' + p.turnos.T1.fim + ')',
    p.turnos.T2.nome + ' (' + p.turnos.T2.ini + ' às ' + p.turnos.T2.fim + ')']])
    .setBackground(COR.cinza).setFontWeight('bold');
  sh.getRange(4, 1, p.rodizio.length, 3).setValues(p.rodizio);
  sh.getRange(3, 1, p.rodizio.length + 1, 3).setBorder(true, true, true, true, true, true, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, 3, 220);
  sh.setHiddenGridlines(true);
}

function escreverCarga_(sh, p) {
  const nc = 1 + p.nomes.length;
  sh.getRange(1, 1, 1, nc).merge().setValue('Carga de trabalho – ' + p.periodo)
    .setBackground(COR.azul).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1, 1, nc).merge().setValue('Pontos = minutos de tarefa x esforço (leve 1, médio 2, pesado 3) ÷ 10')
    .setFontColor('#5A6A80').setFontSize(9);
  sh.getRange(4, 1, 1, nc).setValues([['Dia'].concat(p.nomes)]).setBackground(COR.cinza).setFontWeight('bold');
  sh.getRange(5, 1, p.carga.length, nc).setValues(p.carga);
  const rt = 5 + p.carga.length;
  const tot = ['Total'];
  for (let j = 0; j < p.nomes.length; j++) {
    const col = String.fromCharCode(66 + j);
    tot.push('=SUM(' + col + '5:' + col + (rt - 1) + ')');
  }
  sh.getRange(rt, 1, 1, nc).setValues([tot]).setFontWeight('bold').setBackground(COR.azulClaro);
  sh.getRange(4, 1, p.carga.length + 2, nc).setBorder(true, true, true, true, true, true, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, nc, 140);
  sh.setHiddenGridlines(true);
}

function pdfDaAba_(ss, sh) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf' +
    '&gid=' + sh.getSheetId() +
    '&size=A4&portrait=false&fitw=true&gridlines=false&printtitle=false&sheetnames=false' +
    '&pagenum=UNDEFINED&fzr=false&horizontal_alignment=CENTER' +
    '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('O Google não gerou o PDF da aba ' + sh.getName() + ' (código ' + resp.getResponseCode() + ').');
  return resp.getBlob();
}

/* ======================= Exportar POPs ======================= */
/** Recebe [{codigo, titulo, html}] e salva um PDF por POP na subpasta POPs. */
function exportarPops(lista) {
  const pasta = subpasta_('POPs');
  const pdfs = lista.map(function (p) {
    const nome = p.codigo + ' – ' + p.titulo.replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
    const blob = Utilities.newBlob(p.html, 'text/html', p.codigo + '.html').getAs('application/pdf');
    return { nome: nome, url: salvarArquivo_(pasta, blob, nome) };
  });
  return { pdfs: pdfs, pasta: pasta.getUrl() };
}
