/*******************************************************************************
 * GSL BARTOFIL · SISTEMA DE GESTÃO OPERACIONAL — AUTOMAÇÕES (v6)
 * -----------------------------------------------------------------------------
 * PRÉ-REQUISITO: salvar como Planilhas Google (em .xlsx o script NÃO roda).
 *
 * O QUE MUDOU NA v6 (além de tudo da v4/v5):
 *   • MOTOR DE INSIGHTS — o script analisa OCORRÊNCIAS + abas mensais e escreve
 *     diagnósticos em português na aba INSIGHTS (tendência por setor,
 *     recorrências, absenteísmo fora da curva, concentração por dia da semana,
 *     colaborador recorrente, atrasos ativos e melhorias). Roda às quintas,
 *     entra no briefing do gerente e no relatório mensal.
 *   • RELATÓRIO EXECUTIVO MENSAL (PDF) — todo dia 1º às 6h o script fecha o
 *     mês anterior em PDF (KPIs, score, top setores, insights e gráficos do
 *     PAINEL), salva na pasta Relatórios do Drive e envia à gestão e à
 *     diretoria (CONFIG!D16).
 *   • SCORE DE TURNOS — a aba SCORE calcula nota 0–100 por turno/mês (pesos
 *     ajustáveis); o digesto carimba a marca interna de atraso (coluna U) que
 *     alimenta a pontualidade.
 *   • GOVERNANÇA — aba LOG com trilha de auditoria automática (quem, quando,
 *     de/para em campos críticos) + BACKUP mensal da planilha no Drive
 *     (mantém 12) + menu Diagnóstico do sistema.
 *   • Meses infinitos (dia 20), registro de ocorrências, digesto matinal
 *     único e briefing do gerente — tudo da v5 mantido.
 *
 * Ativação: CONFIG (B5:C9 e D12:D16) > colar este arquivo > executar
 * instalarGatilhos 1 vez > autorizar. NUNCA exclua a aba MODELO_MES.
 ******************************************************************************/

// ------------------------------------------------------------------ layout v4
// v5: as abas mensais são detectadas pelo NOME (padrão "SIG AAAA") — o sistema
// não tem mais lista fixa: qualquer mês gerado passa a ser monitorado sozinho.
var SIGLAS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
var MESES_EXT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO',
                 'AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
var RE_MES = /^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ) (\d{4})$/;
var ABA_MODELO = 'MODELO_MES';

function ehAbaMes_(nome) { return RE_MES.test(String(nome || '')); }

function abasMes_() {                       // ordenadas cronologicamente
  return SpreadsheetApp.getActive().getSheets()
    .map(function (s) { return s.getName(); })
    .filter(ehAbaMes_)
    .sort(function (a, b) { return chaveMes_(a) - chaveMes_(b); });
}

function chaveMes_(nome) {                  // "AGO 2026" -> 2026*12+7
  var m = RE_MES.exec(nome);
  return Number(m[2]) * 12 + SIGLAS.indexOf(m[1]);
}

var LINHA_INI = 22;
var COL = { ID:1, SEMANA:2, PRAZO:3, ATIVIDADE:4, TURNO:7, COORD:8, SETOR:10,
            FALTAS:11, ATEST:12, ANEXO:13, ENTREGUE:16, VALIDACAO:17,
            MOTIVO:18, STATUS:19, F_LEMBRETE:20, F_ATRASO:21, F_ENTREGA:22 };
var CEL_PASTA = 'D15';               // CONFIG!D15 — ID da pasta do Drive
var MAX_MB    = 25;

var COR_AZUL = '#111785', COR_VERDE = '#01973A', COR_AMAR = '#FFEE03',
    COR_VERM = '#D71920', COR_CINZA = '#F3F4F6';

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
    janelaDias:  Number(c.getRange('D12').getValue()) || 7,   // "próximos prazos"
    ccAposDias:  Number(c.getRange('D13').getValue()) || 2,   // cc gestão no atraso
    cc: String(c.getRange('D14').getValue() || '').trim(),
    diretoria: String(c.getRange('D16').getValue() || '').trim()
  };
}

function gestores_(conf) {
  return [conf.gerente.email, conf.adm.email]
    .filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
}

// ------------------------------------------------------------------ datas (fuso da planilha)
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }

function diaNum_(d) {              // nº do dia no fuso da planilha (corrige o bug do D-1)
  var s = Utilities.formatDate(new Date(d), tz_(), 'yyyy,MM,dd').split(',');
  return Math.round(Date.UTC(+s[0], +s[1] - 1, +s[2]) / 86400000);
}

function fmt_(d) { return Utilities.formatDate(new Date(d), tz_(), 'dd/MM/yyyy'); }

// ------------------------------------------------------------------ e-mail
function enviar_(para, assunto, corpoHtml, conf, ccExtra) {
  para = (para || []).filter(Boolean);
  if (para.length === 0) return;
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:680px;border:1px solid #d8dee9">' +
    '<div style="background:' + COR_AZUL + ';color:#fff;padding:14px 18px;font-size:16px;font-weight:bold">' +
    'GSL BARTOFIL <span style="background:' + COR_AMAR + ';color:' + COR_AZUL + ';padding:2px 8px;margin-left:8px;font-size:11px;border-radius:3px">GESTÃO OPERACIONAL</span></div>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
    '<td style="background:' + COR_VERDE + ';height:5px;font-size:1px">&nbsp;</td>' +
    '<td style="background:' + COR_AMAR + ';height:5px;font-size:1px">&nbsp;</td></tr></table>' +
    '<div style="padding:18px;font-size:14px;color:#222">' + corpoHtml + '</div>' +
    '<div style="background:' + COR_CINZA + ';padding:10px 18px;font-size:11px;color:#6b7280">' +
    'Mensagem automática da planilha GSL · <a href="' + SpreadsheetApp.getActive().getUrl() + '">abrir planilha</a></div></div>';
  var opts = { htmlBody: html };
  var ccs = [];
  if (conf && conf.cc) ccs.push(conf.cc);
  if (ccExtra && ccExtra.length) ccs = ccs.concat(ccExtra);
  if (ccs.length) opts.cc = ccs.join(',');
  MailApp.sendEmail(para.join(','), '[GSL Bartofil] ' + assunto, '', opts);
}

function linhaInfo_(sh, r) {
  var v = sh.getRange(r, 1, 1, COL.STATUS).getValues()[0];
  return { id: v[COL.ID-1], semana: v[COL.SEMANA-1], prazo: v[COL.PRAZO-1],
           atividade: v[COL.ATIVIDADE-1], turno: v[COL.TURNO-1], coord: v[COL.COORD-1],
           setor: v[COL.SETOR-1], anexo: v[COL.ANEXO-1], validacao: v[COL.VALIDACAO-1],
           motivo: v[COL.MOTIVO-1], mes: sh.getName(), linha: r };
}

// links dos modelos Word (INÍCIO C12:C13)
function modeloDe_(atividade) {
  var links = SpreadsheetApp.getActive().getSheetByName('INÍCIO')
    .getRange('C12:C13').getValues();
  var idx = -1;
  if (String(atividade).indexOf('Relatório') > -1) idx = 0;
  if (String(atividade).indexOf('Vistoria') > -1)  idx = 1;
  if (idx < 0) return '';
  var u = String(links[idx][0] || '').trim();
  if (u.indexOf('http') !== 0) return '';
  return ' — <a href="' + u + '">modelo</a>';
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
    .addItem('Registrar ocorrência (erro/falta/atestado)', 'registrarOcorrencia')
    .addSeparator()
    .addItem('Gerar aba do próximo mês', 'gerarProximoMes')
    .addItem('Gerar insights agora', 'gerarInsights')
    .addItem('Gerar relatório mensal (PDF) agora', 'relatorioMensalPDF')
    .addSeparator()
    .addItem('Cancelar atividade (gerente/adm)', 'cancelarAtividade')
    .addItem('Enviar digestos matinais agora', 'digestoMatinal')
    .addItem('Enviar briefing do gerente agora', 'briefingForcado')
    .addItem('Reaplicar lista de setores', 'reaplicarListaSetores')
    .addSeparator()
    .addItem('Diagnóstico do sistema', 'diagnosticoSistema')
    .addItem('Instalar gatilhos (1ª vez)', 'instalarGatilhos')
    .addItem('Enviar e-mail de teste', 'emailTeste')
    .addToUi();
}

function instalarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('rotinaDiaria').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('gerarMesSeNecessario').timeBased().onMonthDay(20).atHour(6).create();
  ScriptApp.newTrigger('rotinaMensal').timeBased().onMonthDay(1).atHour(6).create();
  pastaRaiz_();
  SpreadsheetApp.getUi().alert('Gatilhos instalados!\n\n' +
    '• 7h — digesto matinal por coordenador + briefing do gerente (véspera e dia da reunião; insights às quintas)\n' +
    '• Dia 20, 6h — gera sozinho a aba do mês seguinte (meses infinitos)\n' +
    '• Dia 1º, 6h — BACKUP da planilha no Drive + RELATÓRIO MENSAL em PDF para gestão/diretoria\n' +
    '• Monitoramento de edições com trilha de auditoria na aba LOG\n' +
    '• Pasta "GSL Bartofil — Entregas" criada no Drive (ID na CONFIG!D15)');
}

function emailTeste() {
  var conf = cfg_();
  enviar_([conf.gerente.email, conf.adm.email], 'Teste de configuração',
    '<p>Se você recebeu este e-mail, o script está instalado e a aba CONFIG está correta.</p>', conf);
  SpreadsheetApp.getUi().alert('E-mail de teste enviado para gerente e administrador.');
}

// ------------------------------------------------------------------ rotina diária (7h)
function rotinaDiaria() {
  digestoMatinal();
  var dow = Number(Utilities.formatDate(new Date(), tz_(), 'u'));  // 1=SEG..7=DOM
  if (dow === 4) { try { atualizarInsights_(); } catch (err) {} }  // quinta
  briefingGerente_(false);
}

// varre todas as abas e devolve as linhas ativas (não canceladas/aprovadas)
function pendencias_() {
  var ss = SpreadsheetApp.getActive();
  var itens = [];
  abasMes_().forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last < LINHA_INI) return;
    var dados = sh.getRange(LINHA_INI, 1, last - LINHA_INI + 1, COL.STATUS).getValues();
    dados.forEach(function (v, k) {
      var prazo = v[COL.PRAZO-1], atividade = v[COL.ATIVIDADE-1];
      if (!(prazo instanceof Date) || !atividade) return;
      var val = String(v[COL.VALIDACAO-1] || '');
      if (val === 'Cancelada' || val === 'Aprovado') return;
      itens.push({ mes: nome, linha: LINHA_INI + k, id: v[COL.ID-1],
                   semana: v[COL.SEMANA-1], prazo: prazo, atividade: atividade,
                   turno: String(v[COL.TURNO-1] || ''), setor: v[COL.SETOR-1],
                   entregue: String(v[COL.ANEXO-1] || '') !== '',
                   reprovada: val === 'Reprovado' });
    });
  });
  return itens;
}

function itemLinha_(it, hoje) {
  var dif = diaNum_(it.prazo) - hoje;
  var extra = it.reprovada ? ' · <b style="color:' + COR_VERM + '">REPROVADA — corrigir e reanexar</b>' : '';
  var atraso = dif < 0 ? ' · <b>' + (-dif) + ' dia(s) de atraso</b>' : '';
  return '<li style="margin:4px 0">' + it.atividade + ' <span style="color:#6b7280">(' +
         it.mes + ' · ' + it.semana + ')</span> — prazo <b>' + fmt_(it.prazo) + '</b>' +
         atraso + extra + modeloDe_(it.atividade) + '</li>';
}

function secaoDigesto_(titulo, cor, itens, hoje) {
  if (!itens.length) return '';
  return '<p style="background:' + cor + ';color:#fff;padding:6px 10px;margin:14px 0 6px;' +
         'font-weight:bold;font-size:13px">' + titulo + ' (' + itens.length + ')</p>' +
         '<ul style="margin:0;padding-left:20px">' +
         itens.map(function (i) { return itemLinha_(i, hoje); }).join('') + '</ul>';
}

/** UM único e-mail por coordenador com tudo que ele deve / vai vencer. */
function digestoMatinal() {
  var conf = cfg_();
  var hoje = diaNum_(new Date());
  var itens = pendencias_();

  ['A', 'B', 'C'].forEach(function (turno) {
    var email = conf.coord[turno].email;
    if (!email) return;
    var meus = itens.filter(function (i) {
      return (i.turno === turno || i.turno === 'Todos') && !i.entregue;
    });
    var atrasadas = [], hojeV = [], amanha = [], proximos = [];
    meus.forEach(function (i) {
      var dif = diaNum_(i.prazo) - hoje;
      if (dif < 0) { atrasadas.push(i); carimbarAtraso_(i); }
      else if (dif === 0) hojeV.push(i);
      else if (dif === 1) amanha.push(i);
      else if (dif <= conf.janelaDias) proximos.push(i);
    });
    if (!atrasadas.length && !hojeV.length && !amanha.length && !proximos.length) return;

    var corpo = '<p>Bom dia' + (conf.coord[turno].nome ? ', <b>' + conf.coord[turno].nome + '</b>' : '') +
      '! Este é o seu resumo único do dia — tudo que o Turno ' + turno + ' deve ou precisa enviar:</p>' +
      secaoDigesto_('ATRASADAS — regularizar hoje', COR_VERM, atrasadas, hoje) +
      secaoDigesto_('VENCE HOJE', '#B45309', hojeV, hoje) +
      secaoDigesto_('VENCE AMANHÃ', COR_AZUL, amanha, hoje) +
      secaoDigesto_('PRÓXIMOS ' + conf.janelaDias + ' DIAS', COR_VERDE, proximos, hoje) +
      '<p style="margin-top:14px">Para entregar: abra a aba do mês, selecione a linha e use ' +
      '<b>GSL Bartofil &gt; Anexar entrega</b>. Erros, faltas e atestados: registre pelo menu ' +
      '<b>GSL Bartofil &gt; Registrar ocorrência</b> — as colunas FALTAS/ATESTADOS e o PAINEL somam sozinhos.</p>';

    // cc à gestão só quando há atraso persistente
    var ccGestao = atrasadas.some(function (i) {
      return hoje - diaNum_(i.prazo) >= conf.ccAposDias;
    }) ? gestores_(conf) : null;

    var assunto = atrasadas.length ? 'Pendências do Turno ' + turno + ' — ' + atrasadas.length + ' em atraso'
                : hojeV.length     ? 'Turno ' + turno + ' — prazos de hoje'
                : amanha.length    ? 'Turno ' + turno + ' — vence amanhã'
                :                    'Turno ' + turno + ' — próximos prazos';
    enviar_([email], assunto, corpo, conf, ccGestao);
  });
}

// ------------------------------------------------------------------ briefing do gerente
function briefingForcado() { briefingGerente_(true); }

function briefingGerente_(forcado) {
  var conf = cfg_();
  var hoje = diaNum_(new Date());
  var itens = pendencias_();

  // é véspera ou dia de reunião?
  var reunioes = itens.filter(function (i) { return String(i.id).indexOf('-REU-') > -1; });
  var alvo = null;
  reunioes.forEach(function (i) {
    var dif = diaNum_(i.prazo) - hoje;
    if (dif === 0 || dif === 1) alvo = { it: i, dif: dif };
  });
  if (!alvo && !forcado) return;

  var ss = SpreadsheetApp.getActive();
  var ger = ss.getSheetByName('GERÊNCIA');
  var semana = ger ? String(ger.getRange('C4').getValue()) : '';
  var t = ger ? ger.getRange('A8:H10').getValues() : [];

  var tabela = '<table style="font-size:13px;border-collapse:collapse;width:100%">' +
    '<tr style="background:' + COR_AZUL + ';color:#fff">' +
    ['Turno','Relatório (QUI)','Vistoria (QUA)','Faltas','Atest.','Atrasadas','Aguard. validação','Reprovadas']
      .map(function (h) { return '<th style="padding:5px 8px;text-align:left">' + h + '</th>'; }).join('') + '</tr>' +
    t.map(function (l, k) {
      return '<tr style="background:' + (k % 2 ? '#f8f9fc' : '#fff') + '">' +
        l.map(function (v) { return '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">' + v + '</td>'; }).join('') + '</tr>';
    }).join('') + '</table>';

  var atrasadas = itens.filter(function (i) {
    return diaNum_(i.prazo) < hoje && !i.entregue && String(i.id).indexOf('-REU-') === -1;
  });
  var validar = itens.filter(function (i) { return i.entregue; });

  var lista = function (arr) {
    if (!arr.length) return '<p style="color:#6b7280;margin:4px 0 12px">Nada por aqui. ✔</p>';
    return '<ul style="margin:4px 0 12px;padding-left:20px">' + arr.slice(0, 15).map(function (i) {
      return '<li style="margin:3px 0">' + i.atividade + ' — Turno ' + i.turno +
             ' <span style="color:#6b7280">(' + i.mes + ' · ' + i.semana + ' · prazo ' + fmt_(i.prazo) + ')</span></li>';
    }).join('') + (arr.length > 15 ? '<li>… e mais ' + (arr.length - 15) + '</li>' : '') + '</ul>';
  };

  var quando = alvo ? (alvo.dif === 0 ? 'A reunião semanal é <b>HOJE</b>' :
                       'A reunião semanal é <b>AMANHÃ, ' + fmt_(alvo.it.prazo) + '</b>')
                    : 'Resumo sob demanda';
  var corpo = '<p>' + quando + '. Você já chega pronto — este é o retrato de agora (' + semana + '):</p>' +
    tabela +
    '<p style="margin:16px 0 4px;font-weight:bold;color:' + COR_VERM + '">Atrasos a cobrar (' + atrasadas.length + ')</p>' + lista(atrasadas) +
    '<p style="margin:8px 0 4px;font-weight:bold;color:' + COR_AZUL + '">Entregas aguardando sua validação (' + validar.length + ')</p>' + lista(validar) +
    (function () {
      try {
        var ins = insightsMotor_().slice(0, 3);
        if (!ins.length) return '';
        return '<p style="margin:16px 0 4px;font-weight:bold;color:' + COR_VERDE + '">O que os dados estão dizendo</p>' +
          '<ul style="margin:4px 0 12px;padding-left:20px">' + ins.map(function (x) {
            return '<li style="margin:3px 0">' + x.nivel + ' ' + x.texto + '</li>';
          }).join('') + '</ul>';
      } catch (err) { return ''; }
    })() +
    '<p style="margin-top:10px">Pauta sugerida e absenteísmo mês a mês: aba <b>GERÊNCIA</b> · análises completas: abas <b>PAINEL</b>, <b>SCORE</b> e <b>INSIGHTS</b>. ' +
    'Após a reunião, marque <b>Aprovado</b> na linha da reunião (coluna VALIDAÇÃO) — ata opcional no anexo.</p>';

  enviar_(gestores_(conf), 'Briefing da reunião — ' + (semana || 'semana atual'), corpo, conf);
  if (forcado) SpreadsheetApp.getUi().alert('Briefing enviado ao gerente e ao administrador.');
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
  if (!ehAbaMes_(sh.getName())) {
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
  if (!ehAbaMes_(sh.getName())) { ui.alert('Selecione a linha da atividade na aba do mês.'); return; }
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
  ui.alert('Atividade cancelada. Ela saiu do mostrador do calendário e das contagens.');
}

function emailsDoTurno_(turno, conf) {
  turno = String(turno || '').trim();
  if (turno === 'A' || turno === 'B' || turno === 'C') {
    return [conf.coord[turno].email].filter(Boolean);
  }
  return [conf.coord.A.email, conf.coord.B.email, conf.coord.C.email].filter(Boolean);
}

// --- reconserta o menu suspenso de setores nas 6 abas (fonte: CONFIG!A12:A40)
function reaplicarListaSetores() {
  var ss = SpreadsheetApp.getActive();
  var origem = ss.getSheetByName('CONFIG').getRange('A12:A40');
  var regra = SpreadsheetApp.newDataValidation()
    .requireValueInRange(origem, true)
    .setAllowInvalid(true)
    .build();
  abasMes_().forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last >= LINHA_INI) {
      sh.getRange(LINHA_INI, COL.SETOR, last - LINHA_INI + 1, 1).setDataValidation(regra);
    }
  });
  SpreadsheetApp.getUi().alert('Menu suspenso de setores reaplicado em todas as abas mensais.\nFonte: CONFIG!A12:A40 (para editar setores, sobrescreva ou limpe células; não exclua linhas).');
}

// ------------------------------------------- reações a edições
function aoEditar(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  registrarLog_(e, sh);                       // trilha de auditoria (aba LOG)
  if (!ehAbaMes_(sh.getName())) return;
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
    }
  }

  // 4) setor da vistoria definido
  if (c === COL.SETOR && String(e.value || '') !== '' && String(i.atividade).indexOf('Vistoria') > -1) {
    enviar_(dest, 'Setor definido para a vistoria da ' + i.semana + ': ' + e.value,
      '<p>O gerente definiu o setor da sua vistoria semanal:</p>' + bloco_(i) +
      '<p>Imprima o <b>Checklist de Vistoria</b>, faça a inspeção no setor <b>' + e.value +
      '</b>, escaneie o checklist preenchido e anexe pelo menu Anexar entrega' +
      modeloDe_(i.atividade) + '.</p>', conf);
  }

  // 5) tema do treinamento atualizado com data já marcada
  if (c === COL.ATIVIDADE && ehTreinamento && i.prazo instanceof Date) {
    enviar_(dest, 'Treinamento atualizado — ' + fmt_(i.prazo),
      '<p>O gerente atualizou as informações do treinamento:</p>' + bloco_(i), conf);
  }
}

// ================================================================ v5 · MESES INFINITOS
/** Cria a aba do mês seguinte ao último existente (menu). */
function gerarProximoMes() {
  var criado = criarProximoMes_();
  var ui = SpreadsheetApp.getUi();
  if (criado) ui.alert('Aba "' + criado + '" criada!\n\nCalendário, atividades, IDs e prazos já estão calculados. CENTRAL, GERÊNCIA e PAINEL passam a enxergar o mês automaticamente.');
  else ui.alert('Nada a criar — verifique se a aba oculta MODELO_MES existe.');
}

/** Gatilho mensal (dia 20): garante que o mês seguinte já exista. */
function gerarMesSeNecessario() {
  var hoje = new Date();
  var prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  var nome = SIGLAS[prox.getMonth()] + ' ' + prox.getFullYear();
  if (SpreadsheetApp.getActive().getSheetByName(nome)) return;   // já existe
  // cria meses até alcançar o próximo (cobre planilha parada por um tempo)
  var criado = null, guarda = 0;
  while (!SpreadsheetApp.getActive().getSheetByName(nome) && guarda < 24) {
    criado = criarProximoMes_();
    if (!criado) break;
    guarda++;
  }
  if (criado) {
    var conf = cfg_();
    enviar_(gestores_(conf), 'Nova aba de mês criada — ' + criado,
      '<p>O sistema gerou automaticamente a aba <b>' + criado + '</b> com todas as ' +
      'atividades, prazos e fórmulas.</p><p>Nada a fazer — é só continuar usando. ' +
      'Treinamentos do mês podem ser marcados na seção verde da aba.</p>', conf);
  }
}

/** Duplica MODELO_MES, renomeia e grava as âncoras. Devolve o nome criado. */
function criarProximoMes_() {
  var ss = SpreadsheetApp.getActive();
  var modelo = ss.getSheetByName(ABA_MODELO);
  if (!modelo) return null;
  var abas = abasMes_();
  var ano, mes;                              // mês seguinte ao último existente
  if (abas.length) {
    var m = RE_MES.exec(abas[abas.length - 1]);
    ano = Number(m[2]); mes = SIGLAS.indexOf(m[1]) + 1;   // 1-12
    mes++; if (mes > 12) { mes = 1; ano++; }
  } else {
    var hoje = new Date(); ano = hoje.getFullYear(); mes = hoje.getMonth() + 1;
  }
  var nome = SIGLAS[mes - 1] + ' ' + ano;
  if (ss.getSheetByName(nome)) return null;
  var nova = modelo.copyTo(ss).setName(nome);
  nova.getRange('X1').setValue(new Date(ano, mes - 1, 1));
  nova.getRange('X2').setValue(SIGLAS[mes - 1]);
  nova.getRange('A1').setValue(
    ('0' + mes).slice(-2) + ' · ' + MESES_EXT[mes - 1] + ' ' + ano + ' — CALENDÁRIO OPERACIONAL');
  nova.showSheet();
  ss.setActiveSheet(nova);
  ss.moveActiveSheet(ss.getNumSheets());     // manda para o fim da fila de abas
  return nome;
}

// ================================================================ v5 · REGISTRO DE OCORRÊNCIAS
/** Diálogo para lançar erro operacional, falta ou atestado na aba OCORRÊNCIAS. */
function registrarOcorrencia() {
  var setores = SpreadsheetApp.getActive().getSheetByName('CONFIG')
    .getRange('A12:A40').getValues()
    .map(function (v) { return String(v[0] || '').trim(); })
    .filter(Boolean);
  var t = HtmlService.createTemplate(
    '<div style="font-family:Arial;font-size:13px">' +
    '<style>label{display:block;margin:8px 0 2px;color:#374151;font-weight:bold;font-size:12px}' +
    'input,select,textarea{width:100%;box-sizing:border-box;padding:6px;border:1px solid #d1d5db;border-radius:3px;font-size:13px}</style>' +
    '<label>Tipo</label><select id="tipo">' +
    '<option>Erro operacional</option><option>Falta</option><option>Atestado</option></select>' +
    '<div style="display:flex;gap:10px"><div style="flex:1"><label>Turno</label>' +
    '<select id="turno"><option>A</option><option>B</option><option>C</option></select></div>' +
    '<div style="flex:1"><label>Data</label><input type="date" id="data" value="<?= hoje ?>"></div>' +
    '<div style="flex:1"><label>Qtde / dias</label><input type="number" id="qtde" min="0" value="1"></div></div>' +
    '<label>Setor</label><select id="setor"><? for (var k = 0; k < setores.length; k++) { ?>' +
    '<option><?= setores[k] ?></option><? } ?></select>' +
    '<label>Colaborador (opcional)</label><input id="colab">' +
    '<label>Descrição / causa</label><textarea id="desc" rows="2"></textarea>' +
    '<button id="btn" onclick="gv()" style="margin-top:12px;background:' + COR_AZUL +
    ';color:#fff;border:0;padding:9px 18px;border-radius:3px;cursor:pointer;font-size:13px">Registrar</button>' +
    '<p id="st" style="color:#6b7280;min-height:16px"></p>' +
    '<script>\n' +
    'function msg(t, c) { var s = document.getElementById("st"); s.textContent = t; s.style.color = c || "#6b7280"; }\n' +
    'function gv() {\n' +
    '  var d = document.getElementById("data").value;\n' +
    '  if (!d) { msg("Informe a data.", "#D71920"); return; }\n' +
    '  document.getElementById("btn").disabled = true;\n' +
    '  msg("Gravando...");\n' +
    '  google.script.run\n' +
    '    .withSuccessHandler(function () { msg("Registrado! Pode lançar outro ou fechar.", "#1E8E3E"); document.getElementById("btn").disabled = false; })\n' +
    '    .withFailureHandler(function (e) { msg("Erro: " + e.message, "#D71920"); document.getElementById("btn").disabled = false; })\n' +
    '    .gravarOcorrencia(d, document.getElementById("tipo").value, document.getElementById("turno").value,\n' +
    '      document.getElementById("setor").value, document.getElementById("qtde").value,\n' +
    '      document.getElementById("colab").value, document.getElementById("desc").value);\n' +
    '}\n' +
    '</script></div>');
  t.setores = setores;
  t.hoje = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  SpreadsheetApp.getUi().showModalDialog(
    t.evaluate().setWidth(420).setHeight(430), 'Registrar ocorrência — GSL Bartofil');
}

function gravarOcorrencia(dataISO, tipo, turno, setor, qtde, colab, desc) {
  var sh = SpreadsheetApp.getActive().getSheetByName('OCORRÊNCIAS');
  if (!sh) throw new Error('Aba OCORRÊNCIAS não encontrada.');
  var col = sh.getRange('A6:A605').getValues();
  var linha = -1;
  for (var k = 0; k < col.length; k++) {
    if (String(col[k][0] || '') === '') { linha = 6 + k; break; }
  }
  if (linha < 0) throw new Error('A aba OCORRÊNCIAS está cheia (600 registros). Avise o administrador.');
  var p = String(dataISO).split('-');                 // yyyy-mm-dd sem sofrer com fuso
  var data = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  sh.getRange(linha, 1, 1, 7).setValues([[
    data, String(tipo), String(turno), String(setor),
    Number(qtde) || 0, String(colab || ''), String(desc || '')
  ]]);
  return linha;
}

// ================================================================ v6 · TRILHA DE AUDITORIA
var LOG_COLS_MES = { 3:'PRAZO', 4:'ATIVIDADE', 10:'SETOR', 13:'LINK DO ANEXO',
                     17:'VALIDAÇÃO', 18:'MOTIVO' };

function registrarLog_(e, sh) {
  try {
    var nome = sh.getName();
    if (nome === 'LOG' || nome === 'INSIGHTS') return;
    var r = e.range.getRow(), c = e.range.getColumn();
    var campo = null, ref = '';
    if (ehAbaMes_(nome)) {
      if (r < LINHA_INI || !LOG_COLS_MES[c]) return;
      campo = LOG_COLS_MES[c];
      ref = String(sh.getRange(r, COL.ID).getValue() || '');
    } else if (nome === 'OCORRÊNCIAS') {
      if (r < 6 || c > 7) return;
      campo = ['DATA','TIPO','TURNO','SETOR','QTDE','COLABORADOR','DESCRIÇÃO'][c - 1];
      ref = 'OC-' + r;
    } else if (nome === 'CONFIG') {
      if (r < 4) return;
      campo = 'CONFIG';
    } else return;

    var log = SpreadsheetApp.getActive().getSheetByName('LOG');
    if (!log) return;
    var quem = String(Session.getActiveUser().getEmail() || '') || 'não identificado';
    var multi = e.range.getNumRows() > 1 || e.range.getNumColumns() > 1;
    log.appendRow([
      new Date(), quem, nome, e.range.getA1Notation(),
      multi ? campo + ' (intervalo)' : campo,
      multi ? '—' : String(e.oldValue !== undefined ? e.oldValue : ''),
      multi ? '(vários)' : String(e.value !== undefined ? e.value : ''),
      ref
    ]);
    var ult = log.getLastRow();
    log.getRange(ult, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    log.getRange(ult, 1, 1, 8).setFontSize(9).setFontFamily('Arial');
  } catch (err) { /* o log nunca pode travar a edição */ }
}

// carimbo interno de pontualidade (SCORE lê a coluna U)
function carimbarAtraso_(item) {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(item.mes);
    if (!sh) return;
    var cel = sh.getRange(item.linha, COL.F_ATRASO);
    if (String(cel.getValue()) === '') cel.setValue(new Date());
  } catch (err) {}
}

// ================================================================ v6 · MOTOR DE INSIGHTS
function gerarInsights() {
  var n = atualizarInsights_();
  SpreadsheetApp.getUi().alert('Análise concluída: ' + n + ' insight(s) na aba INSIGHTS.');
}

/** Lê OCORRÊNCIAS + abas mensais, escreve a aba INSIGHTS e devolve a lista. */
function atualizarInsights_() {
  var lista = insightsMotor_();
  var sh = SpreadsheetApp.getActive().getSheetByName('INSIGHTS');
  if (sh) {
    sh.getRange('A6:D80').clearContent();
    var agora = new Date();
    var linhas = lista.map(function (i) {
      return [agora, i.nivel, i.texto, i.rec];
    });
    if (linhas.length) {
      sh.getRange(6, 1, linhas.length, 4).setValues(linhas)
        .setFontSize(9.5).setFontFamily('Arial').setVerticalAlignment('middle').setWrap(true);
      sh.getRange(6, 1, linhas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      for (var k = 0; k < linhas.length; k++) sh.setRowHeight(6 + k, 34);
    }
  }
  return lista.length;
}

function insightsMotor_() {
  var ss = SpreadsheetApp.getActive();
  var oc = ss.getSheetByName('OCORRÊNCIAS');
  var out = [];
  var hoje = new Date();
  var hojeN = diaNum_(hoje);
  var dowHoje = Number(Utilities.formatDate(hoje, tz_(), 'u'));   // 1=SEG
  var segAtual = hojeN - (dowHoje - 1);                            // segunda desta semana

  var regs = [];
  if (oc) {
    oc.getRange('A6:F605').getValues().forEach(function (v) {
      if (!(v[0] instanceof Date)) return;
      var n = diaNum_(v[0]);
      regs.push({ n: n, seg: n - ((Number(Utilities.formatDate(v[0], tz_(), 'u')) - 1)),
                  dow: Number(Utilities.formatDate(v[0], tz_(), 'u')),
                  tipo: String(v[1] || ''), turno: String(v[2] || ''),
                  setor: String(v[3] || ''), q: Number(v[4]) || 0,
                  colab: String(v[5] || '').trim(),
                  am: Utilities.formatDate(v[0], tz_(), 'yyyy-MM') });
    });
  }
  var erros = regs.filter(function (r) { return r.tipo === 'Erro operacional'; });
  var absen = regs.filter(function (r) { return r.tipo === 'Falta' || r.tipo === 'Atestado'; });

  function somaPor(arr, chave, filtro) {
    var m = {};
    arr.forEach(function (r) { if (!filtro || filtro(r)) m[r[chave]] = (m[r[chave]] || 0) + r.q; });
    return m;
  }

  // 1) tendência de alta por setor: últimas 4 semanas vs 4 anteriores
  var rec = somaPor(erros, 'setor', function (r) { return r.seg > segAtual - 28; });
  var ant = somaPor(erros, 'setor', function (r) { return r.seg > segAtual - 56 && r.seg <= segAtual - 28; });
  Object.keys(rec).forEach(function (st) {
    if (!st) return;
    var a = ant[st] || 0;
    if (rec[st] >= 3 && rec[st] >= 1.5 * Math.max(a, 1)) {
      out.push({ nivel: '🔴', texto: 'Setor ' + st + ': ' + rec[st] + ' erro(s) nas últimas 4 semanas, contra ' +
        a + ' nas 4 anteriores — tendência de ALTA.',
        rec: 'Priorizar o setor na próxima Vistoria Setorial e tratar a causa raiz na reunião de sexta.' });
    }
  });

  // 2) recorrência: setor com erro em 3+ semanas distintas nas últimas 6
  var semanasPorSetor = {};
  erros.forEach(function (r) {
    if (r.seg <= segAtual - 42 || !r.setor) return;
    (semanasPorSetor[r.setor] = semanasPorSetor[r.setor] || {})[r.seg] = true;
  });
  Object.keys(semanasPorSetor).forEach(function (st) {
    var n = Object.keys(semanasPorSetor[st]).length;
    if (n >= 3) out.push({ nivel: '🟡', texto: 'Setor ' + st + ' registrou erros em ' + n +
      ' semanas diferentes nas últimas 6 — problema recorrente, não pontual.',
      rec: 'Investigar processo/treinamento do setor em vez de tratar caso a caso.' });
  });

  // 3) absenteísmo fora da curva por turno (mês atual vs média dos 3 anteriores)
  var amAtual = Utilities.formatDate(hoje, tz_(), 'yyyy-MM');
  ['A', 'B', 'C'].forEach(function (t) {
    var atual = 0, hist = {};
    absen.forEach(function (r) {
      if (r.turno !== t) return;
      if (r.am === amAtual) atual += r.q; else hist[r.am] = (hist[r.am] || 0) + r.q;
    });
    var meses = Object.keys(hist).sort().slice(-3);
    if (!meses.length) return;
    var media = meses.reduce(function (s, k) { return s + hist[k]; }, 0) / meses.length;
    if (atual >= 3 && atual >= media * 1.3) {
      out.push({ nivel: '🔴', texto: 'Turno ' + t + ': absenteísmo do mês já em ' + atual +
        ' (média dos últimos meses: ' + media.toFixed(1) + ') — alta de ' +
        Math.round((atual / Math.max(media, 0.1) - 1) * 100) + '%.',
        rec: 'Conversar com o coordenador do turno e checar escala/sobreaviso antes que afete o CD.' });
    }
  });

  // 4) concentração por dia da semana (últimas 8 semanas)
  var porDow = [0, 0, 0, 0, 0, 0, 0, 0], totDow = 0;
  erros.forEach(function (r) { if (r.n > hojeN - 56) { porDow[r.dow] += r.q; totDow += r.q; } });
  if (totDow >= 5) {
    var nomes = ['', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];
    for (var d = 1; d <= 7; d++) {
      if (porDow[d] / totDow >= 0.4) {
        out.push({ nivel: '🟡', texto: 'As ' + nomes[d] + ' concentram ' +
          Math.round(porDow[d] / totDow * 100) + '% dos erros das últimas 8 semanas.',
          rec: 'Revisar volume, quadro e rotina desse dia — pode ser pico de demanda ou lacuna de cobertura.' });
      }
    }
  }

  // 5) colaborador com faltas/atestados recorrentes (8 semanas)
  var porColab = {};
  absen.forEach(function (r) {
    if (r.n > hojeN - 56 && r.colab) porColab[r.colab] = (porColab[r.colab] || 0) + 1;
  });
  Object.keys(porColab).forEach(function (nm) {
    if (porColab[nm] >= 3) out.push({ nivel: '🟡', texto: 'Colaborador "' + nm + '" acumula ' +
      porColab[nm] + ' registros de falta/atestado nas últimas 8 semanas.',
      rec: 'Encaminhar ao RH/gestor direto para acompanhamento — pode haver questão de saúde ou de escala.' });
  });

  // 6) atrasos ativos por turno
  var pend = pendencias_();
  ['A', 'B', 'C'].forEach(function (t) {
    var n = pend.filter(function (i) {
      return i.turno === t && !i.entregue && diaNum_(i.prazo) < hojeN;
    }).length;
    if (n >= 3) out.push({ nivel: '🔴', texto: 'Turno ' + t + ' está com ' + n +
      ' atividades atrasadas AGORA.',
      rec: 'Cobrança direta na reunião; se houver sobrecarga real, redistribuir ou renegociar prazos.' });
  });

  // 7) melhoria: setor que zerou
  Object.keys(ant).forEach(function (st) {
    if (!st) return;
    var duasSem = erros.some(function (r) { return r.setor === st && r.seg > segAtual - 14; });
    if (ant[st] >= 3 && !rec[st] && !duasSem) {
      out.push({ nivel: '🟢', texto: 'Setor ' + st + ' zerou os erros nas últimas semanas (tinha ' +
        ant[st] + ' no período anterior) — a correção funcionou.',
        rec: 'Reconhecer o time na reunião e documentar o que mudou para replicar nos demais setores.' });
    }
  });

  var peso = { '🔴': 0, '🟡': 1, '🟢': 2 };
  out.sort(function (a, b) { return peso[a.nivel] - peso[b.nivel]; });
  if (!out.length) out.push({ nivel: '🟢',
    texto: 'Nenhum padrão preocupante detectado nos registros atuais.',
    rec: 'Continue lançando as ocorrências — quanto mais dados, mais cedo os desvios aparecem.' });
  return out.slice(0, 25);
}

// ================================================================ v6 · ROTINA MENSAL (dia 1º)
function rotinaMensal() {
  try { backupMensal_(); } catch (err) {}
  try { relatorioMensalPDF(); } catch (err) {}
}

function backupMensal_() {
  var ss = SpreadsheetApp.getActive();
  var pasta = subpasta_(pastaRaiz_(), 'Backups');
  var nome = 'GSL Bartofil — Backup ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM');
  DriveApp.getFileById(ss.getId()).makeCopy(nome, pasta);
  // mantém só os 12 mais recentes
  var arqs = [];
  var it = pasta.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf('Backup') > -1) arqs.push(f); }
  arqs.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  while (arqs.length > 12) arqs.shift().setTrashed(true);
}

/** Fecha o mês anterior em um PDF executivo e envia à gestão/diretoria. */
function relatorioMensalPDF() {
  var ss = SpreadsheetApp.getActive();
  var conf = cfg_();
  var hoje = new Date();
  var alvo = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);   // mês fechado
  var nomeMes = SIGLAS[alvo.getMonth()] + ' ' + alvo.getFullYear();
  var amAlvo = Utilities.formatDate(alvo, tz_(), 'yyyy-MM');

  // --- números do mês (OCORRÊNCIAS)
  var oc = ss.getSheetByName('OCORRÊNCIAS');
  var eT = { A: 0, B: 0, C: 0 }, aT = { A: 0, B: 0, C: 0 }, porSetor = {};
  var totE = 0, totA = 0;
  if (oc) {
    oc.getRange('A6:F605').getValues().forEach(function (v) {
      if (!(v[0] instanceof Date)) return;
      if (Utilities.formatDate(v[0], tz_(), 'yyyy-MM') !== amAlvo) return;
      var tipo = String(v[1] || ''), t = String(v[2] || ''), q = Number(v[4]) || 0;
      if (tipo === 'Erro operacional') {
        totE += q; if (eT[t] !== undefined) eT[t] += q;
        var st = String(v[3] || '');
        if (st) porSetor[st] = (porSetor[st] || 0) + q;
      } else if (tipo === 'Falta' || tipo === 'Atestado') {
        totA += q; if (aT[t] !== undefined) aT[t] += q;
      }
    });
  }
  var topSet = Object.keys(porSetor).map(function (k) { return [k, porSetor[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);

  // --- andamento (CENTRAL) e score (SCORE) da linha do mês fechado
  var cen = ss.getSheetByName('CENTRAL');
  var linCen = null;
  if (cen) cen.getRange('A8:H25').getValues().forEach(function (v) {
    if (String(v[0]) === nomeMes) linCen = v;
  });
  var scoreTxt = '';
  var sc = ss.getSheetByName('SCORE');
  if (sc) {
    var datas = sc.getRange('P10:P27').getValues();
    var vals = sc.getRange('K10:N27').getValues();
    for (var k = 0; k < datas.length; k++) {
      var d = datas[k][0];
      if (d instanceof Date && Utilities.formatDate(d, tz_(), 'yyyy-MM') === amAlvo) {
        scoreTxt = 'Turno A: <b>' + vals[k][0] + '</b> · Turno B: <b>' + vals[k][1] +
                   '</b> · Turno C: <b>' + vals[k][2] + '</b> — líder do mês: <b>' + vals[k][3] + '</b>';
      }
    }
  }

  // --- insights atuais
  var insights = [];
  try { insights = insightsMotor_().slice(0, 6); } catch (err) {}

  // --- gráficos do PAINEL como imagens
  var imgs = '';
  try {
    var pan = ss.getSheetByName('PAINEL');
    if (pan) pan.getCharts().forEach(function (ch) {
      try {
        var b64 = Utilities.base64Encode(ch.getAs('image/png').getBytes());
        imgs += '<img src="data:image/png;base64,' + b64 +
                '" style="width:100%;max-width:640px;margin:8px 0;display:block"/>';
      } catch (e2) {}
    });
  } catch (err) {}

  function linhaTab(rot, a, b, c) {
    return '<tr><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">' + rot +
      '</td><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">' + a +
      '</td><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">' + b +
      '</td><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">' + c + '</td></tr>';
  }
  var html =
    '<html><body style="font-family:Arial,sans-serif;color:#222;font-size:13px">' +
    '<div style="background:' + COR_AZUL + ';color:#fff;padding:16px 20px;font-size:19px;font-weight:bold">' +
    'GSL BARTOFIL — RELATÓRIO EXECUTIVO MENSAL<br><span style="font-size:13px;font-weight:normal">CD Feira de Santana · ' +
    nomeMes + ' · emitido em ' + fmt_(hoje) + '</span></div>' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:' + COR_VERDE + ';height:6px"></td>' +
    '<td style="background:' + COR_AMAR + ';height:6px"></td></tr></table>' +
    '<h3 style="color:' + COR_AZUL + '">1 · Resumo do mês</h3>' +
    '<p>Erros operacionais: <b>' + totE + '</b> · Faltas + atestados: <b>' + totA + '</b>' +
    (linCen ? ' · Atividades programadas: <b>' + linCen[1] + '</b> · aprovadas: <b>' + linCen[2] +
      '</b> · em atraso: <b>' + linCen[5] + '</b> · conclusão: <b>' +
      Math.round(Number(linCen[7]) * 100) + '%</b>' : '') + '</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:12.5px">' +
    '<tr style="background:' + COR_AZUL + ';color:#fff"><th style="padding:5px 8px;text-align:left"></th>' +
    '<th style="padding:5px 8px">Turno A</th><th style="padding:5px 8px">Turno B</th><th style="padding:5px 8px">Turno C</th></tr>' +
    linhaTab('Erros operacionais', eT.A, eT.B, eT.C) +
    linhaTab('Faltas + atestados', aT.A, aT.B, aT.C) + '</table>' +
    (scoreTxt ? '<h3 style="color:' + COR_AZUL + '">2 · Score dos turnos</h3><p>' + scoreTxt + '</p>' : '') +
    (topSet.length ? '<h3 style="color:' + COR_AZUL + '">3 · Onde o CD mais errou</h3><ol>' +
      topSet.map(function (x) { return '<li>' + x[0] + ' — <b>' + x[1] + '</b></li>'; }).join('') + '</ol>' : '') +
    (insights.length ? '<h3 style="color:' + COR_AZUL + '">4 · Leitura dos dados (insights)</h3><ul>' +
      insights.map(function (i) {
        return '<li style="margin:5px 0">' + i.nivel + ' ' + i.texto +
               '<br><span style="color:#6b7280;font-size:12px">→ ' + i.rec + '</span></li>';
      }).join('') + '</ul>' : '') +
    (imgs ? '<h3 style="color:' + COR_AZUL + '">5 · Gráficos</h3>' + imgs : '') +
    '<p style="color:#6b7280;font-size:11px;margin-top:18px">Gerado automaticamente pelo sistema GSL Bartofil. ' +
    'Trilha de auditoria na aba LOG · backup mensal no Drive.</p></body></html>';

  var pdf = Utilities.newBlob(html, 'text/html', 'rel.html')
    .getAs('application/pdf')
    .setName('GSL Relatório Mensal — ' + nomeMes + '.pdf');
  var pasta = subpasta_(pastaRaiz_(), 'Relatórios');
  pasta.createFile(pdf);

  var dest = gestores_(conf);
  if (conf.diretoria) dest = dest.concat(conf.diretoria.split(',').map(function (x) { return x.trim(); }));
  MailApp.sendEmail(dest.filter(Boolean).join(','),
    '[GSL Bartofil] Relatório executivo — ' + nomeMes, '',
    { htmlBody: '<p>Segue em anexo o relatório executivo de <b>' + nomeMes +
      '</b> do CD Feira de Santana, gerado automaticamente pelo GSL Bartofil.</p>' +
      '<p>O arquivo também está salvo na pasta <b>Relatórios</b> do Drive do sistema.</p>',
      attachments: [pdf] });
  try { SpreadsheetApp.getUi().alert('Relatório de ' + nomeMes + ' gerado, salvo no Drive e enviado.'); }
  catch (err) { /* execução por gatilho, sem UI */ }
}

// ================================================================ v6 · DIAGNÓSTICO
function diagnosticoSistema() {
  var ss = SpreadsheetApp.getActive();
  var conf = cfg_();
  var itens = [];
  function chk(ok, txt) { itens.push((ok ? '✔ ' : '✖ ') + txt); }

  var emailsOk = ['A','B','C'].every(function (t) { return /@/.test(conf.coord[t].email); }) &&
                 /@/.test(conf.gerente.email) && /@/.test(conf.adm.email);
  chk(emailsOk, 'CONFIG: e-mails da equipe preenchidos');
  chk(!!ss.getSheetByName(ABA_MODELO), 'Aba MODELO_MES presente (motor de meses)');
  ['OCORRÊNCIAS','PAINEL','SCORE','INSIGHTS','LOG','CENTRAL','GERÊNCIA'].forEach(function (n) {
    chk(!!ss.getSheetByName(n), 'Aba ' + n + ' presente');
  });
  var fns = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  chk(fns.indexOf('rotinaDiaria') > -1, 'Gatilho diário (7h) instalado');
  chk(fns.indexOf('gerarMesSeNecessario') > -1, 'Gatilho do dia 20 (novo mês) instalado');
  chk(fns.indexOf('rotinaMensal') > -1, 'Gatilho do dia 1º (backup + relatório) instalado');
  chk(fns.indexOf('aoEditar') > -1, 'Monitor de edições (auditoria) instalado');
  var abas = abasMes_();
  var prox = new Date(); prox = SIGLAS[(prox.getMonth() + 1) % 12] + ' ' +
    (prox.getMonth() === 11 ? prox.getFullYear() + 1 : prox.getFullYear());
  chk(!!ss.getSheetByName(prox), 'Aba do próximo mês (' + prox + ') já existe');
  var ocx = ss.getSheetByName('OCORRÊNCIAS');
  if (ocx) {
    var usados = ocx.getRange('A6:A605').getValues().filter(function (v) { return v[0] !== ''; }).length;
    chk(usados < 540, 'OCORRÊNCIAS: ' + usados + '/600 registros usados' +
        (usados >= 540 ? ' — AMPLIE a aba (arraste as fórmulas H:J)' : ''));
  }
  var links = ss.getSheetByName('INÍCIO').getRange('C12:C13').getValues();
  chk(links.every(function (v) { return String(v[0]).indexOf('http') === 0; }),
      'Links dos modelos Word colados na aba INÍCIO');
  try { pastaRaiz_(); chk(true, 'Pasta do Drive acessível'); }
  catch (err) { chk(false, 'Pasta do Drive acessível'); }

  SpreadsheetApp.getUi().alert('DIAGNÓSTICO DO SISTEMA — ' + abas.length +
    ' abas mensais ativas\n\n' + itens.join('\n'));
}
