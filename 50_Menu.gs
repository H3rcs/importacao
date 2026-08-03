/*******************************************************************************
 * 50_Menu.gs — menu, gatilhos, diagnóstico, LOG e avisos por e-mail
 ******************************************************************************/

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GSL-DADOS')
    .addItem('Importar agora', 'importarAgora')
    .addItem('Publicar agregados no GSL', 'publicarAgregadosAgora')
    .addSeparator()
    .addItem('Resolver pendências', 'resolverPendencias')
    .addItem('Enviar resumo de pendências', 'emailPendencias')
    .addSeparator()
    .addItem('Diagnóstico do sistema', 'diagnostico')
    .addItem('Reprocessar histórico completo', 'confirmarReprocesso')
    .addSeparator()
    .addItem('Instalar gatilhos', 'instalarGatilhos')
    .addToUi();
}

function ui_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); }
  catch (e) { Logger.log(msg); }        // rodando por gatilho, sem interface
}

function confirmarReprocesso() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Reprocessar histórico completo',
    'Isso relê as três planilhas por inteiro e reconstrói a aba FATOS. ' +
    'Use depois de mexer no de-para. Pode levar alguns minutos. Continuar?',
    ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) reprocessarTudo();
}

/* ------------------------------------------------------------------ gatilhos */

function instalarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('etlHorario').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('rotinaDiariaDados').timeBased().atHour(5).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('emailPendencias').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7).create();

  ui_('Gatilhos instalados:\n· ETL de hora em hora (6h–20h)\n· Publicação diária 5h30\n' +
      '· Resumo de pendências toda segunda, 7h');
}

/** O gatilho horário roda o dia todo; aqui limitamos ao horário útil do CD. */
function etlHorario() {
  var h = parseInt(Utilities.formatDate(agora_(), tz_(), 'H'), 10);
  if (h < 6 || h > 20) return;
  etlIncremental();
}

function rotinaDiariaDados() {
  etlIncremental();
  publicarAgregados_(false);
}

/* ----------------------------------------------------------------------- LOG */

function log_(acao, alvo, anterior, novo, detalhe) {
  try {
    var sh = ss_().getSheetByName('LOG');
    if (!sh) return;
    var quem = '';
    try { quem = Session.getActiveUser().getEmail() || 'gatilho'; } catch (e) { quem = 'gatilho'; }
    sh.appendRow([agora_(), quem, acao, alvo, anterior, novo, detalhe]);
    // mantém o LOG em tamanho gerenciável
    var max = 5000;
    if (sh.getLastRow() > max + 1) sh.deleteRows(2, sh.getLastRow() - max - 1);
  } catch (e) { /* log nunca derruba o ETL */ }
}

/* -------------------------------------------------------------------- avisos */

function avisarFalha_(falhas) {
  var para = emailsAviso_();
  if (!para) return;
  MailApp.sendEmail({
    to: para,
    subject: '[GSL-DADOS] Falha na importação — ' + fmtData_(agora_()),
    htmlBody: '<p style="font-family:Arial">A importação abortou as fontes abaixo. ' +
      'Os dados que já estavam na planilha foram preservados.</p><ul style="font-family:Arial">' +
      falhas.map(function (f) { return '<li>' + f + '</li>'; }).join('') +
      '</ul><p style="font-family:Arial">Confira o de-para de cabeçalhos na aba FONTES.</p>'
  });
}

function emailPendencias() {
  var sh = aba_('PENDENCIAS');
  if (sh.getLastRow() < 2) return;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues()
    .filter(function (l) { return String(l[6] || '').trim() === ''; });
  if (!vals.length) return;

  var linhas = vals.slice(0, 40).map(function (l) {
    return '<tr><td>' + l[0] + '</td><td>' + l[2] + '</td><td>' + l[3] +
           '</td><td>' + (l[4] || '—') + '</td></tr>';
  }).join('');

  MailApp.sendEmail({
    to: emailsAviso_(),
    subject: '[GSL-DADOS] ' + vals.length + ' pendência(s) aguardando tradução',
    htmlBody:
      '<div style="font-family:Arial;font-size:13px">' +
      '<p>Estas linhas das planilhas de origem não entraram nos números porque o sistema ' +
      'não soube traduzi-las. Enquanto ficarem aqui, os indicadores estão incompletos.</p>' +
      '<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:12px">' +
      '<tr style="background:#111785;color:#fff"><th>Fonte</th><th>Tipo</th>' +
      '<th>Valor</th><th>Sugestão</th></tr>' + linhas + '</table>' +
      (vals.length > 40 ? '<p>… e mais ' + (vals.length - 40) + '.</p>' : '') +
      '<p>Resolva na aba PENDENCIAS: preencha a coluna AÇÃO e use o menu ' +
      '<b>GSL-DADOS → Resolver pendências</b>.</p></div>'
  });
}

/* ---------------------------------------------------------------- diagnóstico */

function diagnostico() {
  var out = [];
  var ok = function (b) { return b ? '✔' : '✖'; };

  ['PARAM', 'FONTES', 'DIM_PESSOAS', 'DIM_TURNO_HIST', 'DIM_CODIGOS', 'DIM_SETORES',
   'STG_RH', 'STG_ERROS', 'STG_METAS', 'FATOS', 'FATOS_METAS', 'PENDENCIAS', 'SYNC', 'LOG']
    .forEach(function (n) {
      if (!ss_().getSheetByName(n)) out.push('✖ Aba ' + n + ' não existe');
    });

  var cfgs = fontes_();
  FONTES_VALIDAS.forEach(function (n) {
    var c = cfgs[n];
    if (!c) { out.push('✖ ' + n + ': não configurada na aba FONTES'); return; }
    if (!c.ativa) { out.push('— ' + n + ': pausada'); return; }
    try {
      var s = SpreadsheetApp.openById(c.id);
      var sh = c.aba ? s.getSheetByName(c.aba) : s.getSheets()[0];
      out.push(ok(!!sh) + ' ' + n + ': ' + s.getName() +
               (sh ? ' · aba "' + sh.getName() + '" · ' + sh.getLastRow() + ' linhas'
                   : ' · ABA NÃO ENCONTRADA'));
    } catch (e) {
      out.push('✖ ' + n + ': sem acesso à planilha (' + e.message + ')');
    }
  });

  try {
    var g = SpreadsheetApp.openById(idGSL_());
    var aba = String(param_('Aba de destino no GSL') || 'OCORRÊNCIAS');
    out.push(ok(!!g.getSheetByName(aba)) + ' GSL: ' + g.getName() + ' · aba ' + aba);
  } catch (e) {
    out.push('✖ GSL: sem acesso — confira o ID no PARAM');
  }

  var d = dims_();
  out.push('— Pessoas cadastradas: ' + Object.keys(d.pessoasPorMat).length);
  out.push('— Códigos traduzidos: ' + Object.keys(d.codigos).length);
  var pend = Math.max(aba_('PENDENCIAS').getLastRow() - 1, 0);
  out.push((pend ? '! ' : '✔ ') + 'Pendências na fila: ' + pend);
  out.push('— Fatos armazenados: ' + Math.max(aba_('FATOS').getLastRow() - 1, 0));
  out.push('— Gatilhos ativos: ' + ScriptApp.getProjectTriggers().length);

  ui_(out.join('\n'));
}
