/*******************************************************************************
 * GSL BARTOFIL · CALENDÁRIO DE GESTÃO OPERACIONAL — AUTOMAÇÕES (v3)
 * -----------------------------------------------------------------------------
 * PRÉ-REQUISITO OBRIGATÓRIO:
 *   O arquivo precisa estar em formato Planilhas Google. Se aparecer "XLSX" ao
 *   lado do nome, use Arquivo > Salvar como Planilhas Google. Em modo .xlsx o
 *   Apps Script NÃO roda (sem menu, sem anexo, sem e-mails).
 *
 * Ativação (uma única vez, com a conta do GERENTE ou do ADMINISTRADOR):
 *   1. Extensões > Apps Script > cole este arquivo > salvar.
 *   2. Preencha a aba CONFIG (equipe em B5:C9 e parâmetros em D12:D14).
 *   3. No editor, selecione a função "instalarGatilhos" > Executar > autorize
 *      (Google avisa "app não verificado": Avançado > Acessar... > Permitir).
 *   4. Recarregue a planilha: o menu GSL Bartofil aparece na barra.
 *   5. Cada coordenador autoriza uma única vez no 1o uso do Anexar entrega.
 *
 * Automação de e-mails:
 *   • Lembrete X dias antes e no dia do prazo (CONFIG!D12).
 *   • Alerta de ATRASO reenviado a cada CONFIG!D13 dias (+ cópia à gestão).
 *   • Entrega anexada > e-mail ao gerente/adm + carimbo em "ENTREGUE EM".
 *   • Aprovado / Reprovado (com MOTIVO) > e-mail ao coordenador.
 *   • Prazo alterado, setor da vistoria definido, treinamento marcado > e-mail.
 *   • Atividade CANCELADA (gerente/adm) > sai do mostrador e avisa o turno.
 ******************************************************************************/

// ------------------------------------------------------------------ layout v3
var ABAS_MES   = ['JUL 2026','AGO 2026','SET 2026','OUT 2026','NOV 2026','DEZ 2026'];
var LINHA_INI  = 22;                 // primeira linha de dados nas abas mensais
// Colunas-âncora da grade fluida (células mescladas reportam a 1ª coluna):
var COL = { ID:1, SEMANA:2, PRAZO:3, ATIVIDADE:4, TURNO:7, COORD:8, SETOR:10,
            ANEXO:12, ENTREGUE:14, VALIDACAO:15, MOTIVO:16, STATUS:18,
            F_LEMBRETE:19, F_ATRASO:20, F_ENTREGA:21 };
var CEL_PASTA = 'D15';               // CONFIG!D15 guarda o ID da pasta do Drive
var MAX_MB    = 25;                  // limite de upload pelo diálogo

var COR_AZUL = '#111785', COR_VERDE = '#01973A', COR_AMAR = '#FFEE03',
    COR_VERM = '#D71920', COR_CINZA = '#F3F4F6';   // vermelho: apenas status

// ------------------------------------------------------------------ config
function cfg_() {
  var c = SpreadsheetApp.getActive().getSheetByName('CONFIG');
  var eq = c.getRange('B5:C9').getValues();
  return {
    coord: { A: {nome: eq[0][0], email: eq[0][1]},
             B: {nome: eq[1][0], email: eq[1][1]},
             C: {nome: eq[2][0], email: eq[2][1]} },
    gerente: {nome: eq[3][0], email: eq[3][1]},
    adm:     {nome: eq[4][0], email: eq[4][1]},
    diasLembrete: Number(c.getRange('D12').getValue()) || 2,
    diasReenvioAtraso: Number(c.getRange('D13').getValue()) || 3,
    cc: String(c.getRange('D14').getValue() || '').trim()
  };
}

function gestores_(conf) {           // quem valida, cancela e recebe entregas
  return [conf.gerente.email, conf.adm.email]
    .filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
}

function emailsDoTurno_(turno, conf) {
  turno = String(turno || '').trim();
  if (turno === 'A' || turno === 'B' || turno === 'C') {
    return [conf.coord[turno].email].filter(Boolean);
  }
  return [conf.coord.A.email, conf.coord.B.email, conf.coord.C.email].filter(Boolean);
}

// ------------------------------------------------------------------ e-mail
function enviar_(para, assunto, corpoHtml, conf) {
  para = (para || []).filter(Boolean);
  if (para.length === 0) return;
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:640px;border:1px solid #d8dee9">' +
    '<div style="background:' + COR_AZUL + ';color:#fff;padding:14px 18px;font-size:16px;font-weight:bold">' +
    'GSL BARTOFIL <span style="background:' + COR_AMAR + ';color:' + COR_AZUL + ';padding:2px 8px;margin-left:8px;font-size:11px;border-radius:3px">GESTÃO OPERACIONAL</span></div>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
    '<td style="background:' + COR_VERDE + ';height:5px;font-size:1px">&nbsp;</td>' +
    '<td style="background:' + COR_AMAR + ';height:5px;font-size:1px">&nbsp;</td></tr></table>' +
    '<div style="padding:18px;font-size:14px;color:#222">' + corpoHtml + '</div>' +
    '<div style="background:' + COR_CINZA + ';padding:10px 18px;font-size:11px;color:#6b7280">' +
    'Mensagem automática da planilha GSL · <a href="' + SpreadsheetApp.getActive().getUrl() + '">abrir planilha</a></div></div>';
  var opts = { htmlBody: html };
  if (conf && conf.cc) opts.cc = conf.cc;
  MailApp.sendEmail(para.join(','), '[GSL Bartofil] ' + assunto, '', opts);
}

function fmt_(d) { return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'dd/MM/yyyy'); }

function linhaInfo_(sh, r) {
  var v = sh.getRange(r, 1, 1, COL.STATUS).getValues()[0];
  return { id: v[COL.ID-1], semana: v[COL.SEMANA-1], prazo: v[COL.PRAZO-1],
           atividade: v[COL.ATIVIDADE-1], turno: v[COL.TURNO-1], coord: v[COL.COORD-1],
           setor: v[COL.SETOR-1], anexo: v[COL.ANEXO-1], validacao: v[COL.VALIDACAO-1],
           motivo: v[COL.MOTIVO-1], mes: sh.getName(), linha: r };
}

// link do modelo Word da atividade (CONFIG!D18:D23), incluído nos e-mails
function modeloDe_(atividade) {
  var links = SpreadsheetApp.getActive().getSheetByName('INÍCIO')
    .getRange('C6:C11').getValues();
  var mapa = [['Erros', 0], ['Suporte', 1], ['Metas', 2], ['Faltas', 3],
              ['Semanal c/', 4], ['Vistoria', 5]];
  for (var k = 0; k < mapa.length; k++) {
    if (String(atividade).indexOf(mapa[k][0]) > -1) {
      var u = String(links[mapa[k][1]][0] || '').trim();
      if (u.indexOf('http') !== 0) return '';   // ainda é o texto-guia, não um link
      return '<p>Modelo padrão: <a href="' + u + '">baixar / abrir modelo</a></p>';
    }
  }
  return '';
}

function bloco_(i) {
  return '<table style="font-size:13px;border-collapse:collapse;margin:10px 0">' +
    '<tr><td style="padding:2px 10px 2px 0;color:#6b7280">Atividade</td><td><b>' + i.atividade + '</b></td></tr>' +
    '<tr><td style="padding:2px 10px 2px 0;color:#6b7280">Mês / Semana</td><td>' + i.mes + (i.semana ? ' · ' + i.semana : '') + '</td></tr>' +
    '<tr><td style="padding:2px 10px 2px 0;color:#6b7280">Turno</td><td>' + i.turno + '</td></tr>' +
    (i.prazo instanceof Date ? '<tr><td style="padding:2px 10px 2px 0;color:#6b7280">Prazo</td><td><b>' + fmt_(i.prazo) + '</b></td></tr>' : '') +
    (i.setor && i.setor !== '—' ? '<tr><td style="padding:2px 10px 2px 0;color:#6b7280">Setor</td><td>' + i.setor + '</td></tr>' : '') +
    '</table>';
}

// ------------------------------------------------------------------ menu
function onOpen() {
  SpreadsheetApp.getUi().createMenu('GSL Bartofil')
    .addItem('Anexar entrega (linha selecionada)', 'abrirAnexo')
    .addSeparator()
    .addItem('Cancelar atividade (gerente/adm)', 'cancelarAtividade')
    .addItem('Verificar prazos agora', 'verificarPrazos')
    .addItem('Reaplicar lista de setores', 'reaplicarListaSetores')
    .addSeparator()
    .addItem('Instalar gatilhos (1a vez)', 'instalarGatilhos')
    .addItem('Enviar e-mail de teste', 'emailTeste')
    .addToUi();
}

function instalarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('verificarPrazos').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  pastaRaiz_();   // cria a pasta do Drive e grava o ID na CONFIG!D15
  SpreadsheetApp.getUi().alert('Gatilhos instalados!\n\n• Verificação diária às 7h (lembretes e atrasos)\n• Monitoramento de edições\n• Pasta "GSL Bartofil — Entregas" criada no Drive (ID na CONFIG!D15)');
}

function emailTeste() {
  var conf = cfg_();
  enviar_([conf.gerente.email, conf.adm.email], 'Teste de configuração',
    '<p>Se você recebeu este e-mail, o script está instalado e a aba CONFIG está correta.</p>', conf);
  SpreadsheetApp.getUi().alert('E-mail de teste enviado para gerente e administrador.');
}

// ------------------------------------------------------------------ Drive
function pastaRaiz_() {
  var c = SpreadsheetApp.getActive().getSheetByName('CONFIG');
  var id = String(c.getRange(CEL_PASTA).getValue() || '').trim();
  if (id) {
    try { return DriveApp.getFolderById(id.replace(/.*folders\//, '').replace(/[?].*/, '')); }
    catch (err) { /* id inválido > recria abaixo */ }
  }
  var f = DriveApp.createFolder('GSL Bartofil — Entregas');
  c.getRange(CEL_PASTA).setValue(f.getId());
  return f;
}

function subpasta_(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

// --- diálogo de anexo (1 clique)
function abrirAnexo() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getActiveSheet();
  if (ABAS_MES.indexOf(sh.getName()) === -1) {
    SpreadsheetApp.getUi().alert('Abra a aba do mês e clique em qualquer célula da LINHA da atividade que deseja entregar.');
    return;
  }
  var r = sh.getActiveRange().getRow();
  var i = linhaInfo_(sh, r);
  if (r < LINHA_INI || !i.atividade || !(i.prazo instanceof Date)) {
    SpreadsheetApp.getUi().alert('Selecione uma linha válida de atividade (com prazo preenchido) na tabela GESTÃO DE ATIVIDADES.');
    return;
  }
  var t = HtmlService.createTemplate(
    '<div style="font-family:Arial;font-size:13px">' +
    '<p style="margin:0 0 4px"><b><?= atv ?></b></p>' +
    '<p style="margin:0 0 12px;color:#6b7280"><?= det ?></p>' +
    '<input type="file" id="f" style="margin-bottom:12px"><br>' +
    '<button id="btn" onclick="up()" style="background:' + COR_AZUL + ';color:#fff;border:0;padding:9px 18px;border-radius:3px;cursor:pointer;font-size:13px">Enviar entrega</button>' +
    '<p id="st" style="color:#6b7280;min-height:18px"></p>' +
    '<script>\n' +
    'var MAX = <?= maxMB ?> * 1024 * 1024;\n' +
    'function msg(t, cor) { var s = document.getElementById("st"); s.textContent = t; s.style.color = cor || "#6b7280"; }\n' +
    'function up() {\n' +
    '  var f = document.getElementById("f").files[0];\n' +
    '  if (!f) { msg("Escolha um arquivo antes de enviar."); return; }\n' +
    '  if (f.size > MAX) { msg("Arquivo acima de <?= maxMB ?> MB. Salve no Drive e cole o link na coluna LINK DO ANEXO.", "#D71920"); return; }\n' +
    '  document.getElementById("btn").disabled = true;\n' +
    '  msg("Enviando \\u2014 aguarde, n\\u00e3o feche a janela...");\n' +
    '  var rd = new FileReader();\n' +
    '  rd.onerror = function () { msg("Falha ao ler o arquivo.", "#D71920"); document.getElementById("btn").disabled = false; };\n' +
    '  rd.onload = function (e) {\n' +
    '    google.script.run\n' +
    '      .withSuccessHandler(function (u) { msg("Entrega anexada e gerente avisado! Pode fechar.", "#1E8E3E"); })\n' +
    '      .withFailureHandler(function (err) { msg("Erro: " + err.message + " \\u2014 se persistir, cole o link do Drive na coluna LINK DO ANEXO.", "#D71920"); document.getElementById("btn").disabled = false; })\n' +
    '      .receberArquivo(e.target.result.split(",")[1], f.name, f.type, "<?= aba ?>", <?= lin ?>);\n' +
    '  };\n' +
    '  rd.readAsDataURL(f);\n' +
    '}\n' +
    '</script></div>');
  t.atv = i.atividade;
  t.det = i.mes + ' · ' + i.semana + ' · Turno ' + i.turno + ' · prazo ' + fmt_(i.prazo);
  t.maxMB = MAX_MB;
  t.aba = sh.getName();
  t.lin = r;
  SpreadsheetApp.getUi().showModalDialog(
    t.evaluate().setWidth(430).setHeight(250), 'Anexar entrega — GSL Bartofil');
}

function receberArquivo(b64, nome, tipo, nomeAba, linha) {
  try {
    var ss = SpreadsheetApp.getActive(), conf = cfg_();
    var sh = ss.getSheetByName(String(nomeAba));
    if (!sh) throw new Error('Aba "' + nomeAba + '" não encontrada.');
    linha = Number(linha);
    if (!linha || linha < LINHA_INI) throw new Error('Linha inválida (' + linha + ').');
    var i = linhaInfo_(sh, linha);
    if (!i.atividade) throw new Error('Linha da atividade não encontrada.');
    var pasta = subpasta_(subpasta_(pastaRaiz_(), i.mes), 'Turno ' + i.turno);
    var blob = Utilities.newBlob(Utilities.base64Decode(b64),
      tipo || 'application/octet-stream', i.id + ' — ' + nome);
    var file = pasta.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e1) {
      try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }
      catch (e2) { /* mantém permissão padrão da pasta */ }
    }
    var url = file.getUrl();
    sh.getRange(linha, COL.ANEXO).setValue(url);
    sh.getRange(linha, COL.ENTREGUE).setValue(new Date());
    sh.getRange(linha, COL.F_ENTREGA).setValue('x');
    i.anexo = url;
    enviar_(gestores_(conf), 'Entrega recebida — ' + i.atividade + ' (' + i.semana + ' · Turno ' + i.turno + ')',
      '<p>O coordenador <b>' + (i.coord || 'do turno ' + i.turno) + '</b> anexou a entrega:</p>' + bloco_(i) +
      '<p><a href="' + url + '">Abrir anexo</a></p>' +
      '<p>Valide na coluna VALIDAÇÃO da aba <b>' + i.mes + '</b> (Aprovado / Reprovado).</p>', conf);
    return url;
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

// --- cancelamento (gerente ou administrador)
function cancelarAtividade() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi(), conf = cfg_();
  var usuario = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (gestores_(conf).indexOf(usuario) === -1) {
    ui.alert('Apenas o gerente ou o administrador (CONFIG!B8:B9) podem cancelar atividades.\nSeu usuário: ' + (usuario || 'não identificado'));
    return;
  }
  var sh = ss.getActiveSheet();
  if (ABAS_MES.indexOf(sh.getName()) === -1) { ui.alert('Selecione a linha da atividade na aba do mês.'); return; }
  var r = sh.getActiveRange().getRow();
  var i = linhaInfo_(sh, r);
  if (r < LINHA_INI || !i.atividade || !(i.prazo instanceof Date)) { ui.alert('Linha inválida.'); return; }
  var resp = ui.prompt('Cancelar atividade',
    'Cancelar "' + i.atividade + '" (' + i.semana + ' · Turno ' + i.turno + ')?\n\nInforme o motivo do cancelamento:',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var motivo = resp.getResponseText() || 'Cancelada pela gestão.';
  sh.getRange(r, COL.VALIDACAO).setValue('Cancelada');
  sh.getRange(r, COL.MOTIVO).setValue(motivo);
  enviar_(emailsDoTurno_(i.turno, conf), 'Atividade cancelada — ' + i.atividade + ' (' + i.semana + ')',
    '<p>A atividade abaixo foi <b>cancelada</b> pela gestão e não precisa mais ser entregue:</p>' + bloco_(i) +
    '<p style="background:#E5E7EB;border-left:4px solid #6b7280;padding:8px 12px"><b>Motivo:</b><br>' + motivo + '</p>', conf);
  ui.alert('Atividade cancelada. Ela saiu do mostrador do calendário e das contagens da CENTRAL.');
}

// --- reconserta o menu suspenso de setores nas 6 abas (fonte: CONFIG!A12:A40)
function reaplicarListaSetores() {
  var ss = SpreadsheetApp.getActive();
  var origem = ss.getSheetByName('CONFIG').getRange('A12:A40');
  var regra = SpreadsheetApp.newDataValidation()
    .requireValueInRange(origem, true)
    .setAllowInvalid(true)
    .build();
  ABAS_MES.forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last >= LINHA_INI) {
      sh.getRange(LINHA_INI, COL.SETOR, last - LINHA_INI + 1, 1).setDataValidation(regra);
    }
  });
  SpreadsheetApp.getUi().alert('Menu suspenso de setores reaplicado nas 6 abas mensais.\nFonte: CONFIG!A12:A40 (para editar setores, sobrescreva ou limpe células; não exclua linhas).');
}

// ------------------------------------------- verificação diária (7h)
function verificarPrazos() {
  var ss = SpreadsheetApp.getActive(), conf = cfg_();
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  ABAS_MES.forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last < LINHA_INI) return;
    var dados = sh.getRange(LINHA_INI, 1, last - LINHA_INI + 1, COL.F_ENTREGA).getValues();

    dados.forEach(function (v, k) {
      var r = LINHA_INI + k;
      var prazo = v[COL.PRAZO-1], atividade = v[COL.ATIVIDADE-1];
      if (!(prazo instanceof Date) || !atividade) return;            // vazia/banda
      var entregue = String(v[COL.ANEXO-1] || '') !== '';
      var validado = String(v[COL.VALIDACAO-1] || '') !== '';        // inclui Cancelada
      if (entregue || validado) return;
      var p = new Date(prazo); p.setHours(0, 0, 0, 0);
      var difDias = Math.round((p - hoje) / 86400000);
      var i = linhaInfo_(sh, r);
      var dest = emailsDoTurno_(i.turno, conf);

      var ehReuniao = String(i.atividade).indexOf('Reunião') > -1;

      if (difDias === conf.diasLembrete || difDias === 0) {
        var flag = String(v[COL.F_LEMBRETE-1] || '');
        var marca = difDias === 0 ? 'D0' : 'D' + difDias;
        if (flag.indexOf(marca) === -1) {
          var rodape = ehReuniao
            ? '<p>Após a reunião, o gerente marca <b>Aprovado</b> na coluna VALIDAÇÃO (ata opcional no LINK DO ANEXO).</p>'
            : modeloDe_(i.atividade) +
              '<p>Para entregar: abra a aba <b>' + i.mes + '</b>, selecione a linha e use ' +
              '<b>GSL Bartofil > Anexar entrega</b>.</p>';
          enviar_(dest,
            (difDias === 0 ? (ehReuniao ? 'HOJE: ' : 'VENCE HOJE: ') : 'Lembrete: ') + i.atividade + ' (' + i.semana + ')',
            '<p>Olá! ' + (difDias === 0 ?
              (ehReuniao ? 'A reunião abaixo está marcada para <b>hoje</b>.' : 'O prazo da atividade abaixo <b>vence hoje</b>.') :
              (ehReuniao ? 'A reunião abaixo acontece em <b>' + difDias + ' dia(s)</b>.' :
                'A atividade abaixo vence em <b>' + difDias + ' dia(s)</b>.')) + '</p>' + bloco_(i) +
            rodape, conf);
          sh.getRange(r, COL.F_LEMBRETE).setValue(flag + marca + ';');
        }
      }

      if (difDias < 0) {
        var ult = v[COL.F_ATRASO-1];
        var reenviar = true;
        if (ult instanceof Date) {
          reenviar = Math.round((hoje - ult) / 86400000) >= conf.diasReenvioAtraso;
        }
        if (reenviar) {
          if (ehReuniao) {
            enviar_(gestores_(conf), 'Reunião da ' + i.semana + ' sem registro (' + i.mes + ')',
              '<p>A reunião abaixo passou da data e <b>não foi marcada como realizada</b>:</p>' + bloco_(i) +
              '<p>Se aconteceu, marque <b>Aprovado</b> na coluna VALIDAÇÃO; se foi adiada, edite o PRAZO; ' +
              'se não vai ocorrer, use <b>Cancelar atividade</b>.</p>', conf);
          } else {
            enviar_(dest, 'ATRASADA: ' + i.atividade + ' (' + i.semana + ' · ' + i.mes + ')',
              '<p style="color:' + COR_VERM + '"><b>A atividade abaixo está atrasada há ' + (-difDias) +
              ' dia(s).</b></p>' + bloco_(i) + modeloDe_(i.atividade) +
              '<p>Regularize pelo menu <b>GSL Bartofil > Anexar entrega</b> na aba <b>' + i.mes + '</b>.</p>', conf);
            enviar_(gestores_(conf), 'Atraso no turno ' + i.turno + ': ' + i.atividade + ' (' + i.semana + ')',
              '<p>A atividade abaixo segue <b>sem entrega</b> após o prazo:</p>' + bloco_(i) +
              '<p>Se ela não for mais necessária, cancele pelo menu <b>Cancelar atividade</b>.</p>', conf);
          }
          sh.getRange(r, COL.F_ATRASO).setValue(hoje);
        }
      }
    });
  });
}

// ------------------------------------------- reações a edições
function aoEditar(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (ABAS_MES.indexOf(sh.getName()) === -1) return;
  var r = e.range.getRow(), c = e.range.getColumn();
  if (r < LINHA_INI || e.range.getNumRows() > 1) return;
  var conf = cfg_();
  var i = linhaInfo_(sh, r);
  if (!i.atividade) return;
  var dest = emailsDoTurno_(i.turno, conf);
  var ehTreinamento = String(i.id).indexOf('-TRE-') > -1;

  // 1) link colado manualmente na coluna LINK DO ANEXO
  if (c === COL.ANEXO && String(e.value || '') !== '') {
    sh.getRange(r, COL.ENTREGUE).setValue(new Date());
    if (String(sh.getRange(r, COL.F_ENTREGA).getValue()) === '') {
      enviar_(gestores_(conf), 'Entrega recebida — ' + i.atividade + ' (' + i.semana + ' · Turno ' + i.turno + ')',
        '<p>O coordenador <b>' + (i.coord || 'do turno ' + i.turno) + '</b> anexou a entrega:</p>' + bloco_(i) +
        '<p><a href="' + i.anexo + '">Abrir anexo</a></p>' +
        '<p>Valide na coluna VALIDAÇÃO da aba <b>' + i.mes + '</b> (Aprovado / Reprovado).</p>', conf);
      sh.getRange(r, COL.F_ENTREGA).setValue('x');
    }
  }

  // 2) validação
  if (c === COL.VALIDACAO) {
    var val = String(e.value || '');
    if (val === 'Aprovado') {
      enviar_(dest, 'Aprovada — ' + i.atividade + ' (' + i.semana + ')',
        '<p>Boa notícia! O gerente <b>aprovou</b> a sua entrega:</p>' + bloco_(i), conf);
    } else if (val === 'Reprovado') {
      var motivo = String(i.motivo || '').trim();
      enviar_(dest, 'Reprovada — ' + i.atividade + ' (' + i.semana + ')',
        '<p>O gerente <b>reprovou</b> a entrega abaixo.</p>' + bloco_(i) +
        '<p style="background:#FDE8E8;border-left:4px solid ' + COR_VERM + ';padding:8px 12px"><b>Motivo informado:</b><br>' +
        (motivo || 'O gerente ainda vai detalhar o motivo na coluna MOTIVO.') + '</p>' +
        '<p>Corrija e anexe novamente pelo menu Anexar entrega.</p>', conf);
    } else if (val === 'Cancelada') {
      var mot = String(i.motivo || '').trim() || 'Cancelada pela gestão.';
      enviar_(dest, 'Atividade cancelada — ' + i.atividade + ' (' + i.semana + ')',
        '<p>A atividade abaixo foi <b>cancelada</b> e não precisa mais ser entregue:</p>' + bloco_(i) +
        '<p style="background:#E5E7EB;border-left:4px solid #6b7280;padding:8px 12px"><b>Motivo:</b><br>' + mot + '</p>', conf);
    }
  }

  // 2b) motivo preenchido depois da reprovação
  if (c === COL.MOTIVO && String(i.validacao) === 'Reprovado' && String(e.value || '').trim() !== '') {
    enviar_(dest, 'Motivo da reprovação — ' + i.atividade + ' (' + i.semana + ')',
      '<p>O gerente detalhou o motivo da reprovação:</p>' + bloco_(i) +
      '<p style="background:#FDE8E8;border-left:4px solid ' + COR_VERM + ';padding:8px 12px">' + e.value + '</p>', conf);
  }

  // 3) prazo alterado — ou treinamento marcado
  if (c === COL.PRAZO && i.prazo instanceof Date) {
    if (ehTreinamento) {
      enviar_(dest, 'Treinamento marcado para ' + fmt_(i.prazo),
        '<p>O gerente programou um <b>treinamento com colaboradores</b>:</p>' + bloco_(i) +
        '<p>Programe com os supervisores o dia e a hora da equipe e registre a lista de presença pelo menu Anexar entrega.</p>', conf);
    } else {
      var antiga = e.oldValue ? ' (antes: <s>' + e.oldValue + '</s>)' : '';
      enviar_(dest, 'Prazo alterado — ' + i.atividade + ' (' + i.semana + ')',
        '<p>O gerente alterou a data desta atividade/reunião' + antiga + ':</p>' + bloco_(i) +
        '<p>O calendário e o mostrador da aba <b>' + i.mes + '</b> já refletem a nova data.</p>', conf);
      sh.getRange(r, COL.F_LEMBRETE).clearContent();
      sh.getRange(r, COL.F_ATRASO).clearContent();
    }
  }

  // 4) setor da vistoria definido
  if (c === COL.SETOR && String(e.value || '') !== '' && String(i.atividade).indexOf('Vistoria') > -1) {
    enviar_(dest, 'Setor definido para a vistoria da ' + i.semana + ': ' + e.value,
      '<p>O gerente definiu o setor da sua vistoria semanal:</p>' + bloco_(i) +
      '<p>Imprima o <b>Checklist de Vistoria</b> (modelo Word), faça a inspeção no setor <b>' + e.value +
      '</b>, escaneie o checklist preenchido e anexe pelo menu Anexar entrega.</p>' +
      modeloDe_(i.atividade), conf);
  }

  // 5) tema do treinamento atualizado com data já marcada
  if (c === COL.ATIVIDADE && ehTreinamento && i.prazo instanceof Date) {
    enviar_(dest, 'Treinamento atualizado — ' + fmt_(i.prazo),
      '<p>O gerente atualizou as informações do treinamento:</p>' + bloco_(i), conf);
  }
}
