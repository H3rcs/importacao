/**
 * Escala de Limpeza – Loja
 * Google Apps Script vinculado a uma planilha.
 *
 * Arquivos do projeto:
 *   Codigo.gs       (este arquivo)
 *   Index.html      (o app)
 *   appsscript.json (manifesto SEM lista de oauthScopes: o Google detecta as
 *                    permissões sozinho. Mesma lição do GSL: com a lista,
 *                    o Google pede autorização de novo a toda hora.)
 *
 * Primeira vez: no editor, selecione a função "instalar" e clique em Executar.
 * A autorização feita pelo editor vale para o app publicado.
 */

var APP_TITULO = 'Escala de Limpeza';
var ABA_DADOS = '_dados';
var PASTA_NOME = 'Escala de Limpeza – Loja';
var TAM_PARTE = 45000;              // por célula (limite do Sheets: 50.000)
var COR = { azul: '#0B4EA2', azulClaro: '#E4EDF9', verde: '#169C46', amarelo: '#FFC72C', tinta: '#14243D', cinza: '#EEF2F7', linha: '#C9D3E0', vazio: '#F1F4F8' };

/* ======================= App da Web ======================= */
function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  // Os dados vão embutidos na página: abre mesmo se google.script.run falhar no primeiro acesso.
  var d;
  try { d = obterDados(); d.ok = true; }
  catch (e) { d = { ok: false, erro: String(e && e.message || e) }; }
  t.dadosIniciais = JSON.stringify(d).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(APP_TITULO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ======================= Menu da planilha ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Escala de limpeza')
    .addItem('Abrir o app', 'abrirApp')
    .addItem('Abrir a pasta de exportações no Drive', 'abrirPasta')
    .addItem('Diagnóstico do salvamento', 'mostrarDiagnostico')
    .addSeparator()
    .addItem('Instalar ou reparar', 'instalar')
    .addToUi();
}

function abrirApp() {
  var url = ScriptApp.getService().getUrl();
  var html = url
    ? '<div style="font-family:Arial;font-size:14px">Link do app:<br><br><a href="' + url + '" target="_blank">' + url + '</a></div>'
    : '<div style="font-family:Arial;font-size:14px">O app ainda não foi implantado. No editor do Apps Script: Implantar &gt; Nova implantação &gt; App da Web.</div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(140), 'Escala de limpeza');
}

function abrirPasta() {
  var url = pasta_().getUrl();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput('<div style="font-family:Arial;font-size:14px"><a href="' + url + '" target="_blank">Abrir a pasta no Drive</a></div>').setWidth(360).setHeight(90),
    'Exportações');
}

function mostrarDiagnostico() {
  var d = diagnostico();
  var linhas = d.itens.map(function (x) {
    return '<tr><td style="padding:6px;border-bottom:1px solid #ddd"><b>' + x.nome + '</b></td><td style="padding:6px;border-bottom:1px solid #ddd">' +
      (x.ok === false ? '<b style="color:#B42318">' : '') + x.valor + (x.ok === false ? '</b>' : '') + '</td></tr>';
  }).join('');
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput('<table style="font-family:Arial;font-size:13px;border-collapse:collapse">' + linhas + '</table>').setWidth(640).setHeight(360),
    'Diagnóstico do salvamento');
}

/**
 * Rode uma vez pelo EDITOR (seletor de função > instalar > Executar).
 * Liga o script à planilha, cria a aba de dados e a pasta no Drive e,
 * principalmente, faz a autorização valer para o app publicado.
 */
function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  if (ss) props.setProperty('PLANILHA_ID', ss.getId());
  if (!props.getProperty('REV')) props.setProperty('REV', '0');
  var p = planilha_();
  abaDados_(p);
  pasta_();
  // Toca no UrlFetch para incluir essa permissão na mesma autorização (usada no PDF).
  try { UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true, method: 'get' }); } catch (e) {}
  Logger.log('Instalação concluída. Planilha: ' + p.getUrl());
  return 'Instalação concluída';
}

/* ======================= Dados do app ======================= */
var _ss = null;
function planilha_() {
  if (_ss) return _ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PLANILHA_ID');
  if (id) { _ss = SpreadsheetApp.openById(id); return _ss; }
  var ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (ativa) { props.setProperty('PLANILHA_ID', ativa.getId()); _ss = ativa; return _ss; }
  // Projeto avulso (sem planilha): cria a planilha de dados para não ficar sem salvar.
  var nova = SpreadsheetApp.create('Escala de Limpeza – Dados');
  props.setProperty('PLANILHA_ID', nova.getId());
  _ss = nova;
  return _ss;
}

function abaDados_(ss) {
  var sh = ss.getSheetByName(ABA_DADOS);
  if (!sh) {
    sh = ss.insertSheet(ABA_DADOS);
    sh.getRange('A1').setValue('Não edite esta aba: são os dados do app Escala de Limpeza.');
    sh.setColumnWidth(1, 600);
    if (ss.getSheets().length > 1) sh.hideSheet();
  }
  return sh;
}

function versaoDados() {
  return Number(PropertiesService.getScriptProperties().getProperty('REV') || 0);
}

function obterDados() {
  var sh = abaDados_(planilha_());
  var n = sh.getLastRow();
  var rev = versaoDados();
  if (n < 2) return { json: null, rev: rev };
  var partes = sh.getRange(2, 1, n - 1, 1).getDisplayValues().map(function (r) { return String(r[0] || '').slice(1); });
  return { json: partes.join('') || null, rev: rev };
}

function salvarDados(json, rev) {
  if (typeof json !== 'string' || json.charAt(0) !== '{') throw new Error('Dados inválidos recebidos do app.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('A planilha está ocupada salvando outra alteração. Tente de novo em alguns segundos.');
  try {
    var props = PropertiesService.getScriptProperties();
    var atual = versaoDados();
    if (rev !== null && rev !== undefined && Number(rev) !== atual) {
      var d = obterDados();
      if (d.json) return { conflito: true, json: d.json, rev: atual };
    }
    var sh = abaDados_(planilha_());
    var linhas = [];
    // Prefixo "x" impede que o Sheets leia o texto como fórmula ou número.
    for (var i = 0; i < json.length; i += TAM_PARTE) linhas.push(['x' + json.slice(i, i + TAM_PARTE)]);
    var ultima = sh.getLastRow();
    if (ultima > 1) sh.getRange(2, 1, ultima - 1, 1).clearContent();
    var rg = sh.getRange(2, 1, linhas.length, 1);
    rg.setNumberFormat('@');
    rg.setValues(linhas);
    sh.getRange('A1').setValue('Não edite esta aba: são os dados do app Escala de Limpeza. Atualizado em ' +
      Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm'));
    SpreadsheetApp.flush();
    var nova = atual + 1;
    props.setProperty('REV', String(nova));
    return { ok: true, rev: nova };
  } finally {
    lock.releaseLock();
  }
}

function tz_() {
  try { return planilha_().getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'America/Bahia'; }
  catch (e) { return 'America/Bahia'; }
}

/** Testa cada etapa e devolve o resultado para o app mostrar. */
function diagnostico() {
  var itens = [];
  var add = function (nome, valor, ok) { itens.push({ nome: nome, valor: String(valor), ok: ok }); };
  try { add('Executando como', Session.getEffectiveUser().getEmail() || '(sem e-mail visível)', true); } catch (e) { add('Executando como', e.message, false); }
  try { add('Quem está acessando', Session.getActiveUser().getEmail() || '(o Google não informa para contas de fora)', null); } catch (e) {}
  var ss = null;
  try { ss = planilha_(); add('Planilha de dados', ss.getName() + ' – ' + ss.getUrl(), true); } catch (e) { add('Planilha de dados', e.message, false); }
  if (ss) {
    try { var sh = abaDados_(ss); add('Aba _dados', sh.getLastRow() > 1 ? (sh.getLastRow() - 1) + ' parte(s) de dados' : 'vazia (ainda não salvou)', true); } catch (e) { add('Aba _dados', e.message, false); }
    try {
      var c = abaDados_(ss).getRange('B1');
      c.setValue('teste ' + new Date().getTime()); SpreadsheetApp.flush(); c.clearContent();
      add('Gravar na planilha', 'funcionando', true);
    } catch (e) { add('Gravar na planilha', e.message, false); }
  }
  try { add('Versão dos dados', versaoDados(), true); } catch (e) {}
  try { add('Pasta no Drive', pasta_().getUrl(), true); } catch (e) { add('Pasta no Drive', e.message, false); }
  return { itens: itens };
}

/* ======================= Drive ======================= */
function pasta_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PASTA_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  var it = DriveApp.getFoldersByName(PASTA_NOME);
  var pasta = it.hasNext() ? it.next() : DriveApp.createFolder(PASTA_NOME);
  props.setProperty('PASTA_ID', pasta.getId());
  return pasta;
}

function subpasta_(nome) {
  var pai = pasta_();
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

function salvarArquivo_(pasta, blob, nome) {
  var iguais = pasta.getFilesByName(nome);
  while (iguais.hasNext()) iguais.next().setTrashed(true);
  return pasta.createFile(blob.setName(nome)).getUrl();
}

function salvarBackup(json) {
  var pasta = subpasta_('Backups');
  var nome = 'escala-limpeza-backup-' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd_HHmm') + '.json';
  var url = pasta.createFile(Utilities.newBlob(json, 'application/json', nome)).getUrl();
  return { pdfs: [{ nome: nome, url: url }], pasta: pasta.getUrl() };
}

/* ======================= Exportar escalas (semana ou mês) ======================= */
/**
 * Recebe do app o período já montado e:
 *  1) escreve uma aba por pessoa ("Escala <nome>");
 *  2) atualiza as abas "Alternância" e "Carga";
 *  3) salva um PDF da escala de cada um na subpasta Escalas do Drive.
 */
function exportarEscala(p) {
  var ss = planilha_();
  p.pessoas.forEach(function (pe) { escreverEscala_(aba_(ss, 'Escala ' + pe.nome), p, pe); });
  escreverAlternancia_(aba_(ss, 'Alternância'), p);
  escreverCarga_(aba_(ss, 'Carga'), p);
  SpreadsheetApp.flush();
  var pasta = subpasta_('Escalas');
  var pdfs = p.pessoas.map(function (pe) {
    var sh = ss.getSheetByName('Escala ' + pe.nome);
    var nome = 'Escala ' + pe.nome + ' – ' + (p.tipo === 'mes' ? 'mês ' : 'semana ') + p.rotulo + '.pdf';
    return { nome: nome, url: salvarArquivo_(pasta, pdfDaAba_(ss, sh), nome) };
  });
  return { planilha: ss.getUrl(), pdfs: pdfs, pasta: pasta.getUrl() };
}

function aba_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  var tudo = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  tudo.breakApart();
  sh.clear();
  tudo.clearDataValidations();
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  return sh;
}

function escreverEscala_(sh, p, pe) {
  var nd = p.dias.length, mes = p.tipo === 'mes';
  var fixas = mes ? 2 : 4;                              // mês: Horário, Tarefa | semana: + Observação, POP
  var nc = fixas + nd;
  if (sh.getMaxColumns() < nc) sh.insertColumnsAfter(sh.getMaxColumns(), nc - sh.getMaxColumns());
  var cab = (mes ? ['Horário', 'Tarefa'] : ['Horário', 'Tarefa', 'Observação', 'POP']).concat(p.dias);
  sh.getRange(1, 1, 1, nc).merge().setValue((p.marca ? p.marca + '   |   ' : '') + p.titulo)
    .setBackground(COR.azul).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(15).setVerticalAlignment('middle');
  sh.setRowHeight(1, 40);
  sh.getRange(2, 1, 1, nc).setBackground(COR.verde); sh.setRowHeight(2, 5);
  sh.getRange(3, 1, 1, nc).setBackground(COR.amarelo); sh.setRowHeight(3, 5);
  sh.getRange(4, 1, 1, nc).merge().setValue(pe.nome + '   |   ' + pe.horario + '   |   ' + p.periodo)
    .setFontWeight('bold').setFontSize(12).setFontColor(COR.tinta);
  sh.setRowHeight(4, 28);

  var r0 = 6;
  sh.getRange(r0, 1, 1, nc).setValues([cab]).setBackground(COR.cinza).setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  var linhas = pe.linhas.map(function (l) {
    var base = [l.hora + ' – ' + l.fim, l.tarefa + (l.altura ? '  [ALTURA]' : '') + (l.alterna ? '  (alterna)' : '')];
    if (!mes) base = base.concat([l.obs, l.pop]);
    return base.concat(l.marcas.map(function () { return false; }));
  });
  if (linhas.length) {
    sh.getRange(r0 + 1, 1, linhas.length, nc).setValues(linhas).setVerticalAlignment('middle').setFontSize(mes ? 9 : 10);
    sh.getRange(r0 + 1, 1, linhas.length, 1).setFontWeight('bold').setHorizontalAlignment('center');
    if (!mes) {
      sh.getRange(r0 + 1, 3, linhas.length, 1).setWrap(true).setFontColor('#5A6A80').setFontSize(9);
      sh.getRange(r0 + 1, 4, linhas.length, 1).setHorizontalAlignment('center').setFontSize(9);
    }
    if (nd) {
      var bloco = sh.getRange(r0 + 1, fixas + 1, linhas.length, nd);
      bloco.insertCheckboxes().setHorizontalAlignment('center');
      var vazias = [];
      pe.linhas.forEach(function (l, i) {
        l.marcas.forEach(function (m, j) { if (!m) vazias.push(sh.getRange(r0 + 1 + i, fixas + 1 + j).getA1Notation()); });
      });
      if (vazias.length) {
        var rl = sh.getRangeList(vazias);
        rl.clearDataValidations();
        rl.setValue('');
        rl.setBackground(COR.vazio);
      }
    }
  }
  var rv = r0 + 1 + linhas.length;
  var visto = ['Visto', 'Rubrica de quem conferiu'];
  if (!mes) visto = visto.concat(['', '']);
  sh.getRange(rv, 1, 1, nc).setValues([visto.concat(p.dias.map(function () { return ''; }))]).setFontWeight('bold').setBackground(COR.azulClaro);
  sh.setRowHeight(rv, 28);
  sh.getRange(r0, 1, rv - r0 + 1, nc).setBorder(true, true, true, true, true, true, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(rv + 2, 1, 1, nc).merge().setValue('Gerado pelo app Escala de Limpeza em ' +
    Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm') + '. Os POPs indicados ficam afixados em cada ambiente.')
    .setFontSize(8).setFontColor('#8796AA');

  sh.setColumnWidth(1, mes ? 86 : 100);
  sh.setColumnWidth(2, mes ? 230 : 280);
  if (!mes) { sh.setColumnWidth(3, 240); sh.setColumnWidth(4, 82); }
  for (var j = 0; j < nd; j++) sh.setColumnWidth(fixas + 1 + j, mes ? 28 : 74);
  sh.setFrozenRows(r0);
  sh.setHiddenGridlines(true);
}

function escreverAlternancia_(sh, p) {
  var nc = 1 + p.nomes.length;
  sh.getRange(1, 1, 1, nc).merge().setValue('Tarefas que alternam – próximas 12 semanas')
    .setBackground(COR.azul).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13);
  sh.getRange(3, 1, 1, nc).setValues([['Semana'].concat(p.nomes)]).setBackground(COR.cinza).setFontWeight('bold');
  sh.getRange(4, 1, p.rodizio.length, nc).setValues(p.rodizio).setWrap(true).setVerticalAlignment('top');
  sh.getRange(3, 1, p.rodizio.length + 1, nc).setBorder(true, true, true, true, true, true, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 120);
  for (var j = 2; j <= nc; j++) sh.setColumnWidth(j, 360);
  sh.setHiddenGridlines(true);
}

function escreverCarga_(sh, p) {
  var nc = 1 + p.nomes.length;
  sh.getRange(1, 1, 1, nc).merge().setValue('Carga de trabalho – ' + p.periodo)
    .setBackground(COR.azul).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1, 1, nc).merge().setValue('Pontos = minutos de tarefa x esforço (leve 1, médio 2, pesado 3) ÷ 10')
    .setFontColor('#5A6A80').setFontSize(9);
  sh.getRange(4, 1, 1, nc).setValues([['Dia'].concat(p.nomes)]).setBackground(COR.cinza).setFontWeight('bold');
  sh.getRange(5, 1, p.carga.length, nc).setValues(p.carga);
  var rt = 5 + p.carga.length, tot = ['Total'];
  for (var j = 0; j < p.nomes.length; j++) {
    var col = String.fromCharCode(66 + j);
    tot.push('=SUM(' + col + '5:' + col + (rt - 1) + ')');
  }
  sh.getRange(rt, 1, 1, nc).setValues([tot]).setFontWeight('bold').setBackground(COR.azulClaro);
  sh.getRange(4, 1, p.carga.length + 2, nc).setBorder(true, true, true, true, true, true, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, nc, 140);
  sh.setHiddenGridlines(true);
}

function pdfDaAba_(ss, sh) {
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf' +
    '&gid=' + sh.getSheetId() +
    '&size=A4&portrait=false&fitw=true&gridlines=false&printtitle=false&sheetnames=false' +
    '&pagenum=UNDEFINED&fzr=false&horizontal_alignment=CENTER' +
    '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';
  var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('O Google não gerou o PDF da aba ' + sh.getName() + ' (código ' + resp.getResponseCode() + '). Rode a função instalar pelo editor e autorize.');
  return resp.getBlob();
}

/* ======================= Exportar POPs ======================= */
/** Recebe { marca, lista: [{codigo, titulo, html}] } e salva um PDF por POP na subpasta POPs. */
function exportarPops(dados) {
  var lista = dados.lista || dados;
  var pasta = subpasta_('POPs');
  var pdfs = lista.map(function (p) {
    var nome = p.codigo + ' – ' + p.titulo.replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
    var blob = Utilities.newBlob(p.html, 'text/html', p.codigo + '.html').getAs('application/pdf');
    return { nome: nome, url: salvarArquivo_(pasta, blob, nome) };
  });
  return { pdfs: pdfs, pasta: pasta.getUrl() };
}
