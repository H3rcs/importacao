/*******************************************************************************
 * GSL BARTOFIL · SISTEMA DE GESTÃO OPERACIONAL — AUTOMAÇÕES (v8)
 * -----------------------------------------------------------------------------
 * Ativação: CONFIG (B5:C9 e D12:D16) > colar este arquivo > executar
 * instalarGatilhos 1 vez > autorizar. NUNCA exclua a aba MODELO_MES.
 * v8: entrega de várias fotos em 1 PDF (JPG/PNG/HEIC/HEIF/WEBP/TIFF/BMP/GIF)
 *     e remarcação de atividade por janela, sem digitar data na célula.
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
// K(11) e L(12) eram FALTAS/ATESTADOS — removidas do calendário na v7.
var COL = { ID:1, SEMANA:2, PRAZO:3, ATIVIDADE:4, TURNO:7, COORD:8, SETOR:10,
            ANEXO:13, ENTREGUE:16, VALIDACAO:17,
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
var FUSO_PADRAO = 'America/Bahia';

// O getSpreadsheetTimeZone() às vezes volta vazio (Drive compartilhado, planilha
// recém-criada, chamada vinda de janela/gatilho). Sem string válida, TODO
// Utilities.formatDate quebra. Aqui ele tem três redes de segurança e guarda o
// último fuso bom nas propriedades do script.
function tz_() {
  var t = '';
  try { t = SpreadsheetApp.getActive().getSpreadsheetTimeZone(); } catch (e) {}
  if (t && typeof t === 'string') {
    try { PropertiesService.getScriptProperties().setProperty('TZ_OK', t); } catch (e) {}
    return t;
  }
  try { t = PropertiesService.getScriptProperties().getProperty('TZ_OK'); } catch (e) {}
  if (t && typeof t === 'string') return t;
  try { t = Session.getScriptTimeZone(); } catch (e) {}
  return (t && typeof t === 'string') ? t : FUSO_PADRAO;
}

/**
 * Instante atual como número de série do Sheets, com a hora de FUSO_PADRAO.
 * Gravar `new Date()` deixa o Google converter usando o fuso DA PLANILHA — se ele
 * estiver errado (UTC, por exemplo), a entrega das 22h35 vira 01h35 do dia seguinte.
 * Aqui a hora é montada na mão, então o registro sai certo mesmo com a planilha
 * mal configurada.
 */
function _serieAgora_() {
  var p = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd-HH-mm-ss').split('-');
  var dias = Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000) + 25569;
  var seg = Number(p[3]) * 3600 + Number(p[4]) * 60 + Number(p[5]);
  return dias + seg / 86400;
}

var FMT_DATA = 'dd/MM/yyyy';
var FMT_DATA_HORA = 'dd/MM/yyyy HH:mm';

/** Põe PRAZO e ENTREGUE EM no padrão brasileiro em uma aba. */
function _padronizarDatas_(sh) {
  var ult = Math.max(sh.getLastRow(), LINHA_INI);
  var n = ult - LINHA_INI + 1;
  if (n < 1) return 0;
  var rg = sh.getRange(LINHA_INI, COL.PRAZO, n, 1);
  rg.setNumberFormat(FMT_DATA);
  sh.getRange(LINHA_INI, COL.ENTREGUE, n, 1).setNumberFormat(FMT_DATA_HORA);

  // Conserta prazos gravados com hora (ex.: 12:00). O mostrador do topo compara
  // por igualdade exata com o dia, então qualquer hora apaga o marcador.
  var vals = rg.getValues(), fs = rg.getFormulas(), arrumados = 0;
  for (var k = 0; k < vals.length; k++) {
    var v = vals[k][0];
    if (fs[k][0] || !(v instanceof Date)) continue;
    if (v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0) continue;
    var iso = Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
    rg.getCell(k + 1, 1).setValue(_serieDia_(iso)).setNumberFormat(FMT_DATA);
    arrumados++;
  }
  return arrumados;
}

/** Ajusta fuso + formato de data de todas as abas de uma vez (menu). */
function corrigirFuso() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  var atual = '';
  try { atual = ss.getSpreadsheetTimeZone(); } catch (e) {}
  try { ss.setSpreadsheetTimeZone(FUSO_PADRAO); } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty('TZ_OK', FUSO_PADRAO); } catch (e) {}

  var abas = abasMes_(), tratadas = 0, arrumados = 0;
  abas.forEach(function (n) {
    try { arrumados += (_padronizarDatas_(ss.getSheetByName(n)) || 0); tratadas++; } catch (e) {}
  });
  var modelo = ss.getSheetByName(ABA_MODELO);      // a origem: sem isso volta todo mês
  if (modelo) { try { _padronizarDatas_(modelo); } catch (e) {} }
  SpreadsheetApp.flush();

  var agora = new Date();
  var tzProjeto = '';
  try { tzProjeto = Session.getScriptTimeZone(); } catch (e) {}
  var horaPlan = '';
  try { horaPlan = Utilities.formatDate(agora, ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm'); } catch (e) { horaPlan = '(não respondeu)'; }
  var horaProj = tzProjeto ? Utilities.formatDate(agora, tzProjeto, 'dd/MM/yyyy HH:mm') : '(não respondeu)';
  var horaCerta = Utilities.formatDate(agora, FUSO_PADRAO, 'dd/MM/yyyy HH:mm');

  ui.alert('FUSO E FORMATO DE DATA\n\n' +
    '1) FUSO DA PLANILHA (manda no TODAY, no NOW e no que o script grava)\n' +
    '   antes: ' + (atual || '(vazio — era esse o problema)') + '\n' +
    '   agora: ' + FUSO_PADRAO + '\n\n' +
    '2) FUSO DO PROJETO APPS SCRIPT: ' + (tzProjeto || '(não respondeu)') +
    (tzProjeto && tzProjeto !== FUSO_PADRAO
      ? '\n   >>> DESENCONTRADO. Só dá para arrumar na mão: no editor,\n' +
        '   Configurações do projeto > marque "Mostrar appsscript.json" >\n' +
        '   abra o arquivo e troque a linha do timeZone por "' + FUSO_PADRAO + '".'
      : '\n   OK, bate com a planilha.') + '\n\n' +
    '3) QUE HORAS CADA UM ACHA QUE SÃO AGORA\n' +
    '   planilha: ' + horaPlan + '\n' +
    '   projeto:  ' + horaProj + '\n' +
    '   correto:  ' + horaCerta + '\n\n' +
    '4) DATAS EM dd/mm/aaaa: ' + tratadas + ' aba(s) mensal(is)' +
    (modelo ? ' + MODELO_MES' : ' (MODELO_MES não encontrada!)') +
    (arrumados ? '\n   Prazos com hora corrigidos (voltam ao calendário): ' + arrumados : '') + '\n\n' +
    'Os registros de ENTREGUE EM que já estão errados não mudam sozinhos — use\n' +
    'o menu "Acertar horários já registrados".');
}

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

/** Caixa colorida de recado dentro do e-mail. */
function _caixa_(titulo, texto, corBarra, fundo) {
  return '<p style="background:' + fundo + ';border-left:4px solid ' + corBarra +
         ';padding:8px 12px;margin:12px 0"><b>' + titulo + '</b><br>' +
         String(texto).replace(/\n/g, '<br>') + '</p>';
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
    .addItem('📎 Anexar entrega — fotos viram 1 PDF', 'abrirEntrega')
    .addItem('📅 Remarcar atividade (gerente/adm)', 'remarcarAtividade')
    .addItem('↩ Voltar à data original do modelo', 'restaurarDataOriginal')
    .addSeparator()
    .addItem('Gerar aba do próximo mês', 'gerarProximoMes')
    .addItem('Gerar insights agora', 'gerarInsights')
    .addItem('Gerar relatório mensal (PDF) agora', 'relatorioMensalPDF')
    .addSeparator()
    .addItem('Cancelar atividade (gerente/adm)', 'cancelarAtividade')
    .addItem('Anexar um arquivo só (modo antigo)', 'abrirAnexo')
    .addItem('Enviar digestos matinais agora', 'digestoMatinal')
    .addItem('Enviar briefing do gerente agora', 'briefingForcado')
    .addItem('Reaplicar lista de setores', 'reaplicarListaSetores')
    .addItem('Renomear coluna R para FEEDBACK / MOTIVO', 'renomearColunaFeedback')
    .addSeparator()
    .addItem('Diagnóstico do sistema', 'diagnosticoSistema')
    .addItem('Corrigir fuso e formato de data (dd/mm/aaaa)', 'corrigirFuso')
    .addItem('Acertar horários já registrados', 'acertarHorariosRegistrados')
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
    '• Monitoramento de edições (avisos em tempo real de entrega e validação)\n' +
    '• Pasta "GSL Bartofil — Entregas" criada no Drive (ID na CONFIG!D15)');
}

function emailTeste() {
  var conf = cfg_();
  enviar_([conf.gerente.email, conf.adm.email], 'Teste de configuração',
    '<p>Se você recebeu este e-mail, o script está instalado e a aba CONFIG está correta.</p>', conf);
  SpreadsheetApp.getUi().alert('E-mail de teste enviado para gerente e administrador.');
}

/** A coluna R agora serve para elogio e para crítica: ajusta o cabeçalho (menu). */
function renomearColunaFeedback() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  var rotulo = 'FEEDBACK / MOTIVO';
  var alvos = abasMes_(), n = 0;
  var modelo = ss.getSheetByName(ABA_MODELO);
  if (modelo) alvos.push(ABA_MODELO);
  alvos.forEach(function (nome) {
    try { ss.getSheetByName(nome).getRange(LINHA_INI - 1, COL.MOTIVO).setValue(rotulo); n++; } catch (e) {}
  });
  SpreadsheetApp.flush();
  ui.alert('Cabeçalho da coluna R atualizado para "' + rotulo + '" em ' + n + ' aba(s)' +
    (modelo ? ', MODELO_MES incluída.' : '.\n\nMODELO_MES não encontrada — os meses novos vão nascer com o rótulo antigo.'));
}

/** Desloca em N horas os carimbos de ENTREGUE EM já gravados errados (menu). */
function acertarHorariosRegistrados() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  var agora = new Date();
  var sugestao = '';
  try {
    var offPlan = Number(Utilities.formatDate(agora, ss.getSpreadsheetTimeZone(), 'Z'));
    var offCerto = Number(Utilities.formatDate(agora, FUSO_PADRAO, 'Z'));
    sugestao = String((offCerto - offPlan) / 100);
  } catch (e) {}

  var resp = ui.prompt('Acertar horários já registrados',
    'Isso desloca a coluna ENTREGUE EM de TODAS as abas mensais.\n\n' +
    'Se a entrega das 22h35 aparece como 01h35, digite -3.\n' +
    'Para desfazer, rode de novo com o valor oposto.\n\n' +
    'Horas a somar' + (sugestao && sugestao !== '0' ? ' (sugestão: ' + sugestao + ')' : '') + ':',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var h = parseFloat(String(resp.getResponseText()).replace(',', '.'));
  if (!h || isNaN(h)) { ui.alert('Valor inválido. Digite algo como -3 ou 3.'); return; }

  var mexidos = 0, abas = abasMes_();
  abas.forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    var n = Math.max(sh.getLastRow(), LINHA_INI) - LINHA_INI + 1;
    if (n < 1) return;
    var rg = sh.getRange(LINHA_INI, COL.ENTREGUE, n, 1);
    var vals = rg.getValues(), fs = rg.getFormulas(), saida = [], mudou = false;
    for (var k = 0; k < vals.length; k++) {
      var v = vals[k][0];
      if (fs[k][0] || !(v instanceof Date)) { saida.push([v]); continue; }
      saida.push([new Date(v.getTime() + h * 3600000)]);
      mudou = true; mexidos++;
    }
    if (mudou) { rg.setValues(saida); rg.setNumberFormat(FMT_DATA_HORA); }
  });
  SpreadsheetApp.flush();
  ui.alert('Pronto: ' + mexidos + ' registro(s) de ENTREGUE EM deslocado(s) em ' + h + ' hora(s).\n\n' +
    'As entregas novas já saem certas sozinhas — o script monta a hora de ' + FUSO_PADRAO +
    ' por conta própria, sem depender do fuso da planilha.');
}

// ------------------------------------------------------------------ rotina diária (7h)
function rotinaDiaria() {
  digestoMatinal();
  var dow = Number(Utilities.formatDate(new Date(), tz_(), 'u'));  // 1=SEG..7=DOM
  if (dow === 4) { try { atualizarInsights_(); } catch (err) {} }  // quinta
  briefingGerente_(false);
  try { limparTemporarios(); } catch (err) {}
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
      '<b>GSL Bartofil &gt; Anexar entrega</b>. O status da linha e o andamento na aba CENTRAL ' +
      'se atualizam sozinhos assim que o anexo entra.</p>';

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

  // v7: a tabela do briefing sai do próprio calendário (mês corrente), não da aba GERÊNCIA
  var mesAtual = SIGLAS[new Date().getMonth()] + ' ' + new Date().getFullYear();
  var semana = mesAtual;
  var linhas = linhasDoMes_(mesAtual);
  var tabela = '<table style="font-size:13px;border-collapse:collapse;width:100%">' +
    '<tr style="background:' + COR_AZUL + ';color:#fff">' +
    ['Turno','Programadas','Entregues','Aguard. validação','Atrasadas','Reprovadas','% conclusão']
      .map(function (h) { return '<th style="padding:5px 8px;text-align:left">' + h + '</th>'; }).join('') + '</tr>' +
    ['A','B','C'].map(function (tn, k) {
      var m = resumoTurno_(linhas, tn, hoje);
      return '<tr style="background:' + (k % 2 ? '#f8f9fc' : '#fff') + '">' +
        ['Turno ' + tn, m.total, m.entregues, m.aguardando, m.atrasadas, m.reprovadas, m.pct + '%']
          .map(function (v) { return '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">' + v + '</td>'; }).join('') + '</tr>';
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
    '<p style="margin-top:10px">Andamento mês a mês: aba <b>CENTRAL</b> · leitura automática do calendário: aba <b>INSIGHTS</b>. ' +
    'Faltas, erros e metas: painel do <b>BI</b> (base GSL-DADOS). ' +
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
    sh.getRange(linha, COL.ENTREGUE).setValue(_serieAgora_()).setNumberFormat(FMT_DATA_HORA);
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
    sh.getRange(r, COL.ENTREGUE).setValue(_serieAgora_()).setNumberFormat(FMT_DATA_HORA);
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
      var fbA = String(i.motivo || '').trim();
      enviar_(dest, 'Aprovada — ' + i.atividade + ' (' + i.semana + ')',
        '<p>Boa notícia! O gerente <b>aprovou</b> a sua entrega:</p>' + bloco_(i) +
        (fbA
          ? _caixa_('Feedback do gerente:', fbA, COR_VERDE, '#E8F5E9')
          : '<p style="color:#6b7280">Sem observações registradas nesta entrega.</p>'), conf);
    } else if (val === 'Reprovado') {
      var motivo = String(i.motivo || '').trim();
      enviar_(dest, 'Reprovada — ' + i.atividade + ' (' + i.semana + ')',
        '<p>O gerente <b>reprovou</b> a entrega abaixo.</p>' + bloco_(i) +
        (motivo
          ? _caixa_('Motivo informado:', motivo, COR_VERM, '#FDE8E8')
          : '<p style="color:#6b7280">Nenhum motivo foi escrito na coluna R. Procure o gerente antes de refazer.</p>') +
        '<p>Corrija e anexe novamente pelo menu Anexar entrega.</p>', conf);
    } else if (val === 'Cancelada') {
      var mot = String(i.motivo || '').trim() || 'Cancelada pela gestão.';
      enviar_(dest, 'Atividade cancelada — ' + i.atividade + ' (' + i.semana + ')',
        '<p>A atividade abaixo foi <b>cancelada</b> e não precisa mais ser entregue:</p>' + bloco_(i) +
        _caixa_('Motivo:', mot, '#6b7280', '#E5E7EB'), conf);
    }
  }

  // (O comentário da coluna R é escrito ANTES de mudar o status, então ele já
  //  viaja no e-mail da validação. Por isso não existe aviso separado aqui.)

  // 3) prazo alterado — ou treinamento marcado
  if (c === COL.PRAZO && i.prazo instanceof Date) {
    if (ehTreinamento) {
      enviar_(dest, 'Treinamento marcado para ' + fmt_(i.prazo),
        '<p>O gerente programou um <b>treinamento com colaboradores</b>:</p>' + bloco_(i) +
        '<p>Programe com os supervisores o dia e a hora da equipe e registre a lista de presença pelo menu Anexar entrega.</p>', conf);
    } else {
      // Digitar a data na célula apaga a fórmula do PRAZO e recalcula o ID da
      // linha (a semana muda). Registramos o ocorrido, avisamos uma única vez
      // e empurramos o usuário para o caminho certo: menu > Remarcar atividade.
      var celP = sh.getRange(r, COL.PRAZO);
      var nt = String(celP.getNote() || '');
      celP.setNote((nt + '\n' + Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm') +
        ' — data digitada direto na célula' + (e.oldValue ? ' (antes: ' + e.oldValue + ')' : '') +
        ' por ' + (Session.getActiveUser().getEmail() || 'usuário')).trim().substring(0, 4000));
      try {
        SpreadsheetApp.getActive().toast(
          'Data alterada na mão: a fórmula do prazo foi apagada e o ID da linha mudou. ' +
          'Prefira GSL Bartofil ▸ Remarcar atividade — registra o motivo e dá para desfazer.',
          'GSL Bartofil', 10);
      } catch (errT) {}
      _avisarPrazo_(sh, r, i, conf, e.oldValue);
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
  if (criado) ui.alert('Aba "' + criado + '" criada!\n\nCalendário, atividades, IDs e prazos já estão calculados. A aba CENTRAL passa a enxergar o mês automaticamente.');
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
  // dia inteiro, sem hora: o mostrador compara o PRAZO com o dia por igualdade exata
  nova.getRange('X1').setValue(_serieDia_(ano + '-' + ('0' + mes).slice(-2) + '-01'));
  nova.getRange('X1').setNumberFormat(FMT_DATA);
  try { _padronizarDatas_(nova); } catch (e) {}
  nova.getRange('X2').setValue(SIGLAS[mes - 1]);
  nova.getRange('A1').setValue(
    ('0' + mes).slice(-2) + ' · ' + MESES_EXT[mes - 1] + ' ' + ano + ' — CALENDÁRIO OPERACIONAL');
  nova.showSheet();
  ss.setActiveSheet(nova);
  ss.moveActiveSheet(ss.getNumSheets());     // manda para o fim da fila de abas
  return nome;
}

// ================================================================ v7 · LEITURA DO CALENDÁRIO
/** Todas as linhas de uma aba mensal, inclusive aprovadas e canceladas. */
function linhasDoMes_(nome) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nome);
  var out = [];
  if (!sh) return out;
  var last = sh.getLastRow();
  if (last < LINHA_INI) return out;
  var dados = sh.getRange(LINHA_INI, 1, last - LINHA_INI + 1, COL.F_ATRASO).getValues();
  dados.forEach(function (v, k) {
    var prazo = v[COL.PRAZO-1], atividade = v[COL.ATIVIDADE-1];
    if (!(prazo instanceof Date) || !atividade) return;
    var val = String(v[COL.VALIDACAO-1] || '');
    out.push({ mes: nome, linha: LINHA_INI + k, id: String(v[COL.ID-1] || ''),
               semana: v[COL.SEMANA-1], prazo: prazo, atividade: String(atividade),
               turno: String(v[COL.TURNO-1] || ''), setor: String(v[COL.SETOR-1] || ''),
               entregue: String(v[COL.ANEXO-1] || '') !== '',
               validacao: val, aprovada: val === 'Aprovado',
               reprovada: val === 'Reprovado', cancelada: val === 'Cancelada',
               carimboAtraso: v[COL.F_ATRASO-1] });
  });
  return out;
}

/** Varre TODAS as abas mensais existentes. */
function linhasTodas_() {
  var out = [];
  abasMes_().forEach(function (n) { out = out.concat(linhasDoMes_(n)); });
  return out;
}

/** Resumo de um turno num conjunto de linhas (o turno "Todos" conta para os três). */
function resumoTurno_(linhas, turno, hojeN) {
  var m = { total: 0, entregues: 0, aguardando: 0, atrasadas: 0, reprovadas: 0, aprovadas: 0, pct: 0 };
  linhas.forEach(function (i) {
    if (i.cancelada) return;
    if (i.turno !== turno && i.turno !== 'Todos') return;
    m.total++;
    if (i.aprovada) { m.aprovadas++; return; }
    if (i.reprovada) m.reprovadas++;
    if (i.entregue) { m.entregues++; m.aguardando++; }
    else if (diaNum_(i.prazo) < hojeN) m.atrasadas++;
  });
  m.pct = m.total ? Math.round(m.aprovadas / m.total * 100) : 0;
  return m;
}

// carimbo interno de pontualidade — a coluna U guarda a 1ª data em que a
// atividade foi vista em atraso; o motor de insights usa isso para pontualidade.
function carimbarAtraso_(item) {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(item.mes);
    if (!sh) return;
    var cel = sh.getRange(item.linha, COL.F_ATRASO);
    if (String(cel.getValue()) === '') cel.setValue(new Date());
  } catch (err) {}
}

// ================================================================ v7 · MOTOR DE INSIGHTS
function gerarInsights() {
  var n = atualizarInsights_();
  SpreadsheetApp.getUi().alert('Análise concluída: ' + n + ' insight(s) na aba INSIGHTS.');
}

/** Lê as abas mensais, escreve a aba INSIGHTS e devolve a lista. */
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

/**
 * v7 — analisa SOMENTE o calendário. Nenhum dado de pessoa entra aqui:
 * as unidades de análise são turno, atividade, setor de vistoria e prazo.
 */
function insightsMotor_() {
  var out = [];
  var hoje = new Date();
  var hojeN = diaNum_(hoje);
  var linhas = linhasTodas_().filter(function (i) { return !i.cancelada; });
  var jan56 = linhas.filter(function (i) { return diaNum_(i.prazo) > hojeN - 56; });

  // 1) atrasos ativos por turno
  ['A', 'B', 'C'].forEach(function (t) {
    var n = linhas.filter(function (i) {
      return (i.turno === t || i.turno === 'Todos') && !i.entregue && !i.aprovada &&
             diaNum_(i.prazo) < hojeN;
    }).length;
    if (n >= 3) out.push({ nivel: '🔴', texto: 'Turno ' + t + ' está com ' + n +
      ' atividade(s) atrasada(s) AGORA.',
      rec: 'Cobrança direta na reunião de sexta; se houver sobrecarga real, redistribuir ou renegociar prazos.' });
  });

  // 2) reprovações por turno nas últimas 8 semanas
  ['A', 'B', 'C'].forEach(function (t) {
    var n = jan56.filter(function (i) {
      return (i.turno === t || i.turno === 'Todos') && i.reprovada;
    }).length;
    if (n >= 2) out.push({ nivel: '🟡', texto: 'Turno ' + t + ' teve ' + n +
      ' entrega(s) reprovada(s) nas últimas 8 semanas — o problema é qualidade, não prazo.',
      rec: 'Revisar o modelo do documento com o coordenador antes de cobrar nova entrega.' });
  });

  // 3) atividade que mais atrasa (independente de turno)
  var atrPorAtiv = {};
  jan56.forEach(function (i) {
    var atrasou = (i.carimboAtraso instanceof Date) ||
                  (!i.entregue && !i.aprovada && diaNum_(i.prazo) < hojeN);
    if (!atrasou) return;
    var chave = String(i.atividade).split('(')[0].trim();
    atrPorAtiv[chave] = (atrPorAtiv[chave] || 0) + 1;
  });
  Object.keys(atrPorAtiv).forEach(function (a) {
    if (atrPorAtiv[a] >= 3) out.push({ nivel: '🔴', texto: '"' + a + '" atrasou ' +
      atrPorAtiv[a] + ' vez(es) nas últimas 8 semanas — é a atividade mais problemática do período.',
      rec: 'Checar se o prazo é realista ou se falta insumo/informação para o coordenador conseguir entregar.' });
  });

  // 4) gargalo de validação: entregue há mais de 5 dias sem resposta do gerente
  var parados = linhas.filter(function (i) {
    return i.entregue && !i.aprovada && !i.reprovada && diaNum_(i.prazo) < hojeN - 5;
  });
  if (parados.length >= 3) out.push({ nivel: '🟡', texto: parados.length +
    ' entrega(s) estão anexadas há mais de 5 dias aguardando validação da gerência.',
    rec: 'A fila de validação virou o gargalo — reservar um horário fixo na semana para aprovar/reprovar.' });

  // 5) concentração de atraso por dia da semana do prazo
  var porDow = [0, 0, 0, 0, 0, 0, 0, 0], tot = 0;
  jan56.forEach(function (i) {
    if (!(i.carimboAtraso instanceof Date)) return;
    var d = Number(Utilities.formatDate(i.prazo, tz_(), 'u'));
    porDow[d]++; tot++;
  });
  if (tot >= 5) {
    var nomes = ['', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];
    for (var d = 1; d <= 7; d++) {
      if (porDow[d] / tot >= 0.4) out.push({ nivel: '🟡', texto: 'Atividades com prazo nas ' +
        nomes[d] + ' concentram ' + Math.round(porDow[d] / tot * 100) +
        '% dos atrasos das últimas 8 semanas.',
        rec: 'Rever a carga desse dia — pode ser pico de operação no CD ou prazo mal posicionado na semana.' });
    }
  }

  // 6) pontualidade por turno (últimas 12 semanas, atividades já encerradas)
  ['A', 'B', 'C'].forEach(function (t) {
    var base = linhas.filter(function (i) {
      return (i.turno === t || i.turno === 'Todos') && diaNum_(i.prazo) > hojeN - 84 &&
             diaNum_(i.prazo) <= hojeN && (i.entregue || i.aprovada);
    });
    if (base.length < 5) return;
    var noPrazo = base.filter(function (i) { return !(i.carimboAtraso instanceof Date); }).length;
    var pct = Math.round(noPrazo / base.length * 100);
    if (pct < 70) out.push({ nivel: '🔴', texto: 'Turno ' + t + ' entregou no prazo apenas ' +
      pct + '% das ' + base.length + ' atividades das últimas 12 semanas.',
      rec: 'Pontualidade abaixo do aceitável — tratar como ponto de acompanhamento semanal, não pontual.' });
    else if (pct >= 95) out.push({ nivel: '🟢', texto: 'Turno ' + t + ' está com ' + pct +
      '% de entregas no prazo nas últimas 12 semanas.',
      rec: 'Reconhecer o coordenador na reunião e mapear o que ele faz de diferente para replicar nos outros turnos.' });
  });

  // 7) setor de vistoria com reincidência de reprovação
  var porSetor = {};
  jan56.forEach(function (i) {
    if (!i.reprovada || !i.setor || i.setor === '—') return;
    porSetor[i.setor] = (porSetor[i.setor] || 0) + 1;
  });
  Object.keys(porSetor).forEach(function (st) {
    if (porSetor[st] >= 2) out.push({ nivel: '🟡', texto: 'Vistorias do setor ' + st +
      ' foram reprovadas ' + porSetor[st] + ' vez(es) nas últimas 8 semanas.',
      rec: 'Acompanhar o setor de perto na próxima vistoria e verificar se o checklist está sendo aplicado por inteiro.' });
  });

  // 8) melhoria: turno que zerou os atrasos nas últimas 3 semanas
  ['A', 'B', 'C'].forEach(function (t) {
    var antes = jan56.filter(function (i) {
      return (i.turno === t || i.turno === 'Todos') && diaNum_(i.prazo) <= hojeN - 21 &&
             (i.carimboAtraso instanceof Date);
    }).length;
    var agora = linhas.filter(function (i) {
      return (i.turno === t || i.turno === 'Todos') && diaNum_(i.prazo) > hojeN - 21 &&
             diaNum_(i.prazo) <= hojeN && (i.carimboAtraso instanceof Date);
    }).length;
    if (antes >= 3 && agora === 0) out.push({ nivel: '🟢', texto: 'Turno ' + t +
      ' zerou os atrasos nas últimas 3 semanas (tinha ' + antes + ' no período anterior).',
      rec: 'Registrar o que mudou na rotina do turno e levar como referência para os demais.' });
  });

  var peso = { '🔴': 0, '🟡': 1, '🟢': 2 };
  out.sort(function (a, b) { return peso[a.nivel] - peso[b.nivel]; });
  if (!out.length) out.push({ nivel: '🟢',
    texto: 'Nenhum padrão preocupante no calendário — prazos, entregas e validações em dia.',
    rec: 'Manter o ritmo. Faltas, erros e metas são analisados no BI, sobre a base GSL-DADOS.' });
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

  // --- números do mês, direto da aba mensal
  var linhas = linhasDoMes_(nomeMes);
  var hojeN = diaNum_(hoje);
  var porTurno = { A: resumoTurno_(linhas, 'A', hojeN),
                   B: resumoTurno_(linhas, 'B', hojeN),
                   C: resumoTurno_(linhas, 'C', hojeN) };
  var reprovadas = linhas.filter(function (i) { return i.reprovada; });
  var atrasadas = linhas.filter(function (i) {
    return !i.cancelada && !i.aprovada && !i.entregue && diaNum_(i.prazo) < hojeN;
  });

  // --- andamento (CENTRAL) da linha do mês fechado
  var cen = ss.getSheetByName('CENTRAL');
  var linCen = null;
  if (cen) cen.getRange('A8:H25').getValues().forEach(function (v) {
    if (String(v[0]) === nomeMes) linCen = v;
  });

  // --- insights atuais
  var insights = [];
  try { insights = insightsMotor_().slice(0, 6); } catch (err) {}

  function linhaTab(rot, a, b, c) {
    return '<tr><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">' + rot +
      '</td><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">' + a +
      '</td><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">' + b +
      '</td><td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">' + c + '</td></tr>';
  }
  function listaAtiv(arr) {
    if (!arr.length) return '<p style="color:#6b7280">Nenhuma. ✔</p>';
    return '<ul>' + arr.slice(0, 12).map(function (i) {
      return '<li style="margin:4px 0">' + i.atividade + ' — Turno ' + i.turno +
        ' <span style="color:#6b7280">(' + i.semana + ' · prazo ' + fmt_(i.prazo) + ')</span></li>';
    }).join('') + (arr.length > 12 ? '<li>… e mais ' + (arr.length - 12) + '</li>' : '') + '</ul>';
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
    (linCen ? '<p>Atividades programadas: <b>' + linCen[1] + '</b> · aprovadas: <b>' + linCen[2] +
      '</b> · em atraso: <b>' + linCen[5] + '</b> · reprovadas: <b>' + linCen[6] +
      '</b> · conclusão: <b>' + Math.round(Number(linCen[7]) * 100) + '%</b></p>'
      : '<p>Total de atividades no mês: <b>' + linhas.length + '</b></p>') +
    '<h3 style="color:' + COR_AZUL + '">2 · Desempenho por turno</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-size:12.5px">' +
    '<tr style="background:' + COR_AZUL + ';color:#fff"><th style="padding:5px 8px;text-align:left"></th>' +
    '<th style="padding:5px 8px">Turno A</th><th style="padding:5px 8px">Turno B</th><th style="padding:5px 8px">Turno C</th></tr>' +
    linhaTab('Programadas', porTurno.A.total, porTurno.B.total, porTurno.C.total) +
    linhaTab('Aprovadas', porTurno.A.aprovadas, porTurno.B.aprovadas, porTurno.C.aprovadas) +
    linhaTab('Atrasadas', porTurno.A.atrasadas, porTurno.B.atrasadas, porTurno.C.atrasadas) +
    linhaTab('Reprovadas', porTurno.A.reprovadas, porTurno.B.reprovadas, porTurno.C.reprovadas) +
    linhaTab('% conclusão', porTurno.A.pct + '%', porTurno.B.pct + '%', porTurno.C.pct + '%') + '</table>' +
    '<h3 style="color:' + COR_AZUL + '">3 · Atividades encerradas com pendência</h3>' +
    '<p style="margin:6px 0 2px;font-weight:bold;color:' + COR_VERM + '">Não entregues (' + atrasadas.length + ')</p>' +
    listaAtiv(atrasadas) +
    '<p style="margin:10px 0 2px;font-weight:bold;color:#B45309">Reprovadas (' + reprovadas.length + ')</p>' +
    listaAtiv(reprovadas) +
    (insights.length ? '<h3 style="color:' + COR_AZUL + '">4 · Leitura do calendário (insights)</h3><ul>' +
      insights.map(function (i) {
        return '<li style="margin:5px 0">' + i.nivel + ' ' + i.texto +
               '<br><span style="color:#6b7280;font-size:12px">→ ' + i.rec + '</span></li>';
      }).join('') + '</ul>' : '') +
    '<p style="color:#6b7280;font-size:11px;margin-top:18px">Gerado automaticamente pelo sistema GSL Bartofil ' +
    '(escopo: atividades do calendário). Indicadores de RH, erros e metas: painel do BI, base GSL-DADOS. ' +
    'Backup mensal no Drive.</p></body></html>';

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
  ['INÍCIO','INSIGHTS','CENTRAL','CONFIG'].forEach(function (n) {
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
  var vaz = linhasTodas_().filter(function (i) { return !i.turno; }).length;
  chk(vaz === 0, 'Todas as atividades têm turno definido' + (vaz ? ' — ' + vaz + ' sem turno' : ''));
  var links = ss.getSheetByName('INÍCIO').getRange('C12:C13').getValues();
  chk(links.every(function (v) { return String(v[0]).indexOf('http') === 0; }),
      'Links dos modelos Word colados na aba INÍCIO');
  try { pastaRaiz_(); chk(true, 'Pasta do Drive acessível'); }
  catch (err) { chk(false, 'Pasta do Drive acessível'); }
  var tzBruto = '';
  try { tzBruto = ss.getSpreadsheetTimeZone(); } catch (err) {}
  chk(!!tzBruto, 'Fuso da planilha respondendo direto: ' + (tzBruto || 'VAZIO — usando ' + tz_()));
  chk(typeof abrirEntrega === 'function' && typeof _imagensParaPdf_ === 'function',
      'Módulo v8 de entrega em PDF carregado');
  chk(typeof remarcarAtividade === 'function', 'Módulo v8 de remarcação carregado');
  var remarcadas = 0;
  abasMes_().forEach(function (n) {
    var sh2 = ss.getSheetByName(n);
    sh2.getRange(LINHA_INI, COL.PRAZO, Math.max(1, sh2.getLastRow() - LINHA_INI + 1), 1)
       .getNotes().forEach(function (l) { if (String(l[0]).indexOf('FORMULA_ORIGINAL:') > -1) remarcadas++; });
  });
  chk(true, 'Atividades remarcadas manualmente: ' + remarcadas);

  SpreadsheetApp.getUi().alert('DIAGNÓSTICO DO SISTEMA — ' + abas.length +
    ' abas mensais ativas\n\n' + itens.join('\n'));
}
// ============================================================================
// v8 · ENTREGA EM PDF  (várias fotos -> 1 PDF · JPG PNG HEIC HEIF WEBP TIFF BMP GIF)
// ============================================================================
var LARGURA_MAX  = 1600;                 // px do lado maior enviado ao PDF
var NATIVOS_     = ['jpg','jpeg','png','gif','bmp','webp'];   // navegador decodifica
var DOCUMENTOS_  = ['docx','doc','odt','rtf','txt','html','htm'];  // texto: viram Google Docs
var PASTA_TMP    = '_TEMPORARIO';

function _ext_(nome) {
  var m = String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function _pad4_(n) { return ('000' + n).slice(-4); }

function _limpaNome_(s) {
  return String(s || '').replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

// --- 1) abre o diálogo -------------------------------------------------------
function abrirEntrega() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getActiveSheet(), ui = SpreadsheetApp.getUi();
  if (!ehAbaMes_(sh.getName())) {
    ui.alert('Abra a aba do mês e clique em qualquer célula da LINHA da atividade que deseja entregar.');
    return;
  }
  var r = sh.getActiveRange().getRow();
  var i = linhaInfo_(sh, r);
  if (r < LINHA_INI || !i.atividade || !(i.prazo instanceof Date)) {
    ui.alert('Selecione uma linha válida de atividade (com prazo preenchido) na tabela GESTÃO DE ATIVIDADES.');
    return;
  }
  // pasta temporária criada ANTES do diálogo: os envios não refazem busca no Drive
  var token = Utilities.getUuid().replace(/-/g, '').substring(0, 10);
  var tmp = subpasta_(subpasta_(pastaRaiz_(), PASTA_TMP), token);

  var html = _htmlEntrega_()
    .replace(/__PASTA__/g, tmp.getId())
    .replace(/__ABA__/g,   sh.getName())
    .replace(/__LIN__/g,   String(r))
    .replace(/__MAXMB__/g, String(MAX_MB))
    .replace(/__LARG__/g,  String(LARGURA_MAX))
    .replace(/__ATV__/g,   _esc_(String(i.atividade)))
    .replace(/__DET__/g,   _esc_(i.mes + ' · ' + i.semana + ' · Turno ' + i.turno + ' · prazo ' + fmt_(i.prazo)))
    .replace(/__AZUL__/g,  COR_AZUL)
    .replace(/__VERDE__/g, COR_VERDE)
    .replace(/__AMAR__/g,  COR_AMAR)
    .replace(/__VERM__/g,  COR_VERM);

  ui.showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(560).setHeight(640),
    'Entrega da atividade — GSL Bartofil');
}

function _esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- 2) recebe cada arquivo (chamado em paralelo pelo diálogo) ---------------
function receberParte(idPasta, indice, nome, mime, b64) {
  var pasta = DriveApp.getFolderById(idPasta);
  var blob = Utilities.newBlob(Utilities.base64Decode(b64),
    mime || 'application/octet-stream', _pad4_(Number(indice)) + '_' + _limpaNome_(nome));
  pasta.createFile(blob);
  return true;
}

// --- 3) monta o PDF, arquiva e avisa a gestão --------------------------------
function finalizarEntrega(idPasta, nomeAba, linha) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { throw new Error('Outro envio está em andamento. Tente de novo em alguns segundos.'); }
  var tmp = null;
  try {
    var ss = SpreadsheetApp.getActive(), conf = cfg_();
    var sh = ss.getSheetByName(String(nomeAba));
    if (!sh) throw new Error('Aba "' + nomeAba + '" não encontrada.');
    linha = Number(linha);
    var i = linhaInfo_(sh, linha);
    if (!i.atividade) throw new Error('Linha da atividade não encontrada.');

    tmp = DriveApp.getFolderById(idPasta);
    var arquivos = [], it = tmp.getFiles();
    while (it.hasNext()) arquivos.push(it.next());
    if (arquivos.length === 0) throw new Error('Nenhum arquivo chegou ao Drive. Tente enviar de novo.');
    arquivos.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });

    var pdfs = [], docs = [], imgs = [];
    arquivos.forEach(function (f) {
      var e = _ext_(f.getName());
      if (e === 'pdf') pdfs.push(f);
      else if (DOCUMENTOS_.indexOf(e) > -1) docs.push(f);
      else imgs.push(f);
    });

    var final;
    var nomeBase = _limpaNome_(i.id + ' - ' + String(i.atividade).substring(0, 45) + ' - ' +
                   Utilities.formatDate(new Date(), tz_(), 'dd-MM-yyyy'));

    if (pdfs.length && (docs.length || imgs.length || pdfs.length > 1)) {
      throw new Error('PDF pronto não pode ser juntado com outros arquivos (o Apps Script não faz merge de PDF). ' +
        'Envie um PDF sozinho, ou mande tudo como fotos/documentos.');
    }

    if (pdfs.length === 1) {
      // PDF já pronto: arquiva como está
      final = pdfs[0].getBlob().setName(nomeBase + '.pdf');

    } else if (docs.length === 1 && !imgs.length) {
      // caso mais comum do coordenador: um DOCX sozinho.
      // Converte para Google Docs e exporta — TODAS as páginas, formatação preservada.
      var gdoc = _paraGoogleDoc_(docs[0].getBlob(), '__TMP_' + nomeBase.substring(0, 40));
      try {
        final = DriveApp.getFileById(gdoc).getAs('application/pdf').setName(nomeBase + '.pdf');
      } finally {
        try { DriveApp.getFileById(gdoc).setTrashed(true); } catch (e4) {}
      }

    } else if (docs.length) {
      // mistura (vários documentos, ou documento + fotos): monta um só, em A4
      final = _montarMisto_(arquivos, nomeBase);

    } else {
      // só fotos: PDF sangrado, uma foto por página cheia
      var blobs = imgs.map(function (f) {
        var e = _ext_(f.getName());
        return (NATIVOS_.indexOf(e) > -1) ? f.getBlob() : _viaMiniaturaDrive_(f, LARGURA_MAX);
      });
      final = _imagensParaPdf_(blobs, nomeBase);
    }

    var pasta = subpasta_(subpasta_(pastaRaiz_(), i.mes), 'Turno ' + i.turno);
    var file = pasta.createFile(final);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e1) {
      try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }
      catch (e2) { /* mantém a permissão da pasta */ }
    }
    var url = file.getUrl();
    sh.getRange(linha, COL.ANEXO).setValue(url);
    sh.getRange(linha, COL.ENTREGUE).setValue(_serieAgora_()).setNumberFormat(FMT_DATA_HORA);
    sh.getRange(linha, COL.F_ENTREGA).setValue('x');
    i.anexo = url;

    enviar_(gestores_(conf), 'Entrega recebida — ' + i.atividade + ' (' + i.semana + ' · Turno ' + i.turno + ')',
      '<p>O coordenador <b>' + (i.coord || 'do turno ' + i.turno) + '</b> anexou a entrega (' +
      arquivos.length + ' arquivo(s) em um PDF único):</p>' + bloco_(i) +
      '<p><a href="' + url + '">Abrir anexo</a></p>' +
      '<p>Valide na coluna VALIDAÇÃO da aba <b>' + i.mes + '</b> (Aprovado / Reprovado).</p>', conf);

    try { tmp.setTrashed(true); } catch (e3) { /* limpeza diária pega depois */ }
    return url;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// --- 4) HEIC / HEIF / TIFF / AVIF -> JPEG, pelo próprio Google ---------------
// O Drive gera a pré-visualização de formatos que o navegador não abre.
// Buscamos essa pré-visualização em alta resolução e usamos como imagem do PDF.
function _viaMiniaturaDrive_(file, largura) {
  var token = ScriptApp.getOAuthToken();
  var api = 'https://www.googleapis.com/drive/v3/files/' + file.getId() +
            '?fields=thumbnailLink&supportsAllDrives=true';
  var link = '';
  for (var t = 0; t < 8 && !link; t++) {
    var r = UrlFetchApp.fetch(api, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var j = JSON.parse(r.getContentText());
      link = j.thumbnailLink || '';
    }
    if (!link) Utilities.sleep(1500);
  }
  if (!link) {
    throw new Error('O Google ainda não gerou a pré-visualização de "' + file.getName() +
      '". Aguarde alguns segundos e envie de novo, ou converta a foto para JPEG.');
  }
  link = link.replace(/=s\d+.*$/, '=s' + largura).replace(/=w\d+-h\d+.*$/, '=s' + largura);
  var img = UrlFetchApp.fetch(link, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (img.getResponseCode() !== 200) img = UrlFetchApp.fetch(link, { muteHttpExceptions: true });
  if (img.getResponseCode() !== 200) {
    throw new Error('Não consegui converter "' + file.getName() + '" (HTTP ' + img.getResponseCode() + ').');
  }
  return img.getBlob()
            .setContentType('image/jpeg')
            .setName(file.getName().replace(/\.[^.]+$/, '') + '.jpg');
}

// --- 4b) DOCX / DOC / ODT / RTF / TXT / HTML -> Google Docs (converte no Drive) --
// Sem serviço avançado ligado: usamos a API do Drive via UrlFetchApp, do mesmo
// jeito que a conversão de HEIC. Devolve o ID do documento criado.
function _paraGoogleDoc_(blob, nome) {
  var token = ScriptApp.getOAuthToken();
  var meta = { name: nome, mimeType: 'application/vnd.google-apps.document' };
  var lim = 'gslbartofil' + Date.now();
  var cabeca = '--' + lim + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
               JSON.stringify(meta) + '\r\n--' + lim + '\r\nContent-Type: ' +
               (blob.getContentType() || 'application/octet-stream') + '\r\n\r\n';
  var corpo = Utilities.newBlob(cabeca).getBytes()
                .concat(blob.getBytes())
                .concat(Utilities.newBlob('\r\n--' + lim + '--').getBytes());
  var r = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'post',
      contentType: 'multipart/related; boundary=' + lim,
      payload: corpo,
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
  if (r.getResponseCode() !== 200) {
    throw new Error('Não consegui converter "' + blob.getName() + '" (HTTP ' + r.getResponseCode() +
      '). Se for .doc antigo, salve como .docx e envie de novo.');
  }
  return JSON.parse(r.getContentText()).id;
}

/** Copia o conteúdo de um documento para dentro de outro, elemento por elemento. */
function _copiarCorpo_(origem, destino) {
  var n = origem.getNumChildren();
  for (var k = 0; k < n; k++) {
    var el;
    try { el = origem.getChild(k).copy(); } catch (e) { continue; }
    var t = el.getType();
    try {
      if (t === DocumentApp.ElementType.PARAGRAPH)            destino.appendParagraph(el.asParagraph());
      else if (t === DocumentApp.ElementType.LIST_ITEM)       destino.appendListItem(el.asListItem());
      else if (t === DocumentApp.ElementType.TABLE)           destino.appendTable(el.asTable());
      else if (t === DocumentApp.ElementType.INLINE_IMAGE)    destino.appendImage(el.asInlineImage());
      else if (t === DocumentApp.ElementType.PAGE_BREAK)      destino.appendPageBreak();
      else if (t === DocumentApp.ElementType.HORIZONTAL_RULE) destino.appendHorizontalRule();
    } catch (e) { /* elemento sem equivalente: segue o baile */ }
  }
}

// --- 5b) entrega mista: documentos + fotos em um PDF só, folha A4 -------------
function _montarMisto_(arquivos, nomeBase) {
  var LARG = 595, ALT = 842, MARG = 42;              // A4 em pontos, margem ~1,5 cm
  var doc = DocumentApp.create('__TMP_' + nomeBase.substring(0, 40) + '_' + Date.now());
  var body = doc.getBody();
  body.setPageWidth(LARG).setPageHeight(ALT);
  body.setMarginTop(MARG).setMarginBottom(MARG).setMarginLeft(MARG).setMarginRight(MARG);
  var util = { w: LARG - 2 * MARG, h: ALT - 2 * MARG };
  var lixo = [], primeiro = true;

  arquivos.forEach(function (f) {
    var e = _ext_(f.getName());
    if (!primeiro) body.appendPageBreak();
    primeiro = false;

    if (DOCUMENTOS_.indexOf(e) > -1) {
      var id = _paraGoogleDoc_(f.getBlob(), '__TMP_PARTE_' + Date.now());
      lixo.push(id);
      _copiarCorpo_(DocumentApp.openById(id).getBody(), body);
    } else {
      var blob = (NATIVOS_.indexOf(e) > -1) ? f.getBlob() : _viaMiniaturaDrive_(f, LARGURA_MAX);
      var par = body.appendParagraph('');
      par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      par.setSpacingBefore(0).setSpacingAfter(0);
      try {
        var img = par.appendInlineImage(blob);
        var esc = Math.min(util.w / img.getWidth(), util.h / img.getHeight(), 1);
        img.setWidth(Math.floor(img.getWidth() * esc)).setHeight(Math.floor(img.getHeight() * esc));
      } catch (e2) {
        par.appendText('[Arquivo não suportado: ' + f.getName() + ']');
      }
    }
  });

  try {
    var c0 = body.getChild(0);
    if (c0.getType() === DocumentApp.ElementType.PARAGRAPH &&
        c0.asParagraph().getNumChildren() === 0) c0.removeFromParent();
  } catch (e) {}

  doc.saveAndClose();
  var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(nomeBase + '.pdf');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  lixo.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  return pdf;
}

// --- 5) uma imagem por página, ocupando a folha inteira ---------------------
function _imagensParaPdf_(blobs, nomeBase) {
  var doc = DocumentApp.create('__TMP_' + nomeBase.substring(0, 40) + '_' + Date.now());
  var body = doc.getBody();
  body.setMarginTop(0).setMarginBottom(0).setMarginLeft(0).setMarginRight(0);

  var imgs = [];
  blobs.forEach(function (b, k) {
    var par = body.appendParagraph('');
    par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    par.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    try {
      var img = par.appendInlineImage(b);
      imgs.push({ img: img, w: img.getWidth(), h: img.getHeight() });
    } catch (e) {
      par.appendText('[Arquivo não suportado: ' + b.getName() + ']');
    }
    if (k < blobs.length - 1) body.appendPageBreak();
  });
  // remove o parágrafo vazio que todo documento novo já traz
  try {
    var c0 = body.getChild(0);
    if (c0.getType() === DocumentApp.ElementType.PARAGRAPH &&
        c0.asParagraph().getNumChildren() === 0) c0.removeFromParent();
  } catch (e) {}

  if (!imgs.length) { DriveApp.getFileById(doc.getId()).setTrashed(true); throw new Error('Nenhuma imagem pôde ser lida.'); }

  // a página assume a proporção da 1ª imagem: sem faixa branca e sem distorcer
  var base = imgs[0], largPag = 612, altPag = Math.round(largPag * base.h / base.w);
  if (altPag > 1500) { altPag = 1500; largPag = Math.round(altPag * base.w / base.h); }
  if (altPag < 200)  { altPag = 200;  largPag = Math.round(altPag * base.w / base.h); }
  body.setPageWidth(largPag).setPageHeight(altPag);
  imgs.forEach(function (o) {
    var esc = Math.min(largPag / o.w, altPag / o.h);
    o.img.setWidth(Math.floor(o.w * esc)).setHeight(Math.floor(o.h * esc));
  });

  doc.saveAndClose();
  var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(nomeBase + '.pdf');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return pdf;
}

// --- 6) faxina das pastas temporárias (roda junto com a rotina diária) ------
function limparTemporarios() {
  try {
    var pai = subpasta_(pastaRaiz_(), PASTA_TMP), it = pai.getFolders();
    var limite = new Date().getTime() - 24 * 3600 * 1000;
    while (it.hasNext()) {
      var f = it.next();
      if (f.getDateCreated().getTime() < limite) f.setTrashed(true);
    }
  } catch (e) { /* sem pasta ainda */ }
}

// ============================================================================
// v8 · REMARCAÇÃO DE ATIVIDADE  (a data deixa de ser digitada na mão)
// ============================================================================
function _podeGerir_(conf) {
  var u = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  return gestores_(conf).indexOf(u) > -1;
}

function remarcarAtividade() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi(), conf = cfg_();
  if (!_podeGerir_(conf)) {
    ui.alert('Apenas o gerente ou o administrador (CONFIG!B8:B9) podem remarcar atividades.');
    return;
  }
  var sh = ss.getActiveSheet();
  if (!ehAbaMes_(sh.getName())) { ui.alert('Abra a aba do mês e clique na LINHA da atividade.'); return; }
  var r = sh.getActiveRange().getRow();
  var i = linhaInfo_(sh, r);
  if (r < LINHA_INI || !i.atividade || !(i.prazo instanceof Date)) { ui.alert('Selecione uma linha válida de atividade.'); return; }

  var m = RE_MES.exec(sh.getName());
  var ano = Number(m[2]), mesN = SIGLAS.indexOf(m[1]) + 1;          // 1..12
  var mm = ('0' + mesN).slice(-2);
  var ultDia = new Date(ano, mesN, 0).getDate();                    // aritmética local, sem fuso
  var mesIni = ano + '-' + mm + '-01';
  var mesFim = ano + '-' + mm + '-' + ('0' + ultDia).slice(-2);

  var html = _htmlRemarcar_()
    .replace(/__ABA__/g, sh.getName())
    .replace(/__LIN__/g, String(r))
    .replace(/__ATV__/g, _esc_(String(i.atividade)))
    .replace(/__DET__/g, _esc_(i.mes + ' · ' + i.semana + ' · Turno ' + i.turno))
    .replace(/__ATUAL__/g, Utilities.formatDate(i.prazo, tz_(), 'yyyy-MM-dd'))
    .replace(/__ATUALBR__/g, fmt_(i.prazo))
    .replace(/__MESINI__/g, mesIni)
    .replace(/__MESFIM__/g, mesFim)
    .replace(/__AZUL__/g, COR_AZUL)
    .replace(/__VERDE__/g, COR_VERDE)
    .replace(/__AMAR__/g, COR_AMAR)
    .replace(/__VERM__/g, COR_VERM);

  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(470).setHeight(430),
    'Remarcar atividade — GSL Bartofil');
}

/** Grava a nova data sem quebrar o ID, guarda a fórmula original e avisa o turno. */
function aplicarRemarcacao(nomeAba, linha, dataISO, motivo, avisar) {
  var ss = SpreadsheetApp.getActive(), conf = cfg_();
  if (!_podeGerir_(conf)) throw new Error('Sem permissão para remarcar.');
  var sh = ss.getSheetByName(String(nomeAba));
  if (!sh) throw new Error('Aba não encontrada.');
  linha = Number(linha);
  motivo = String(motivo || '').trim();
  if (motivo.length < 3) throw new Error('Informe o motivo da remarcação.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataISO))) throw new Error('Data inválida.');

  var i = linhaInfo_(sh, linha);
  if (!i.atividade) throw new Error('Linha sem atividade.');
  var antiga = (i.prazo instanceof Date) ? fmt_(i.prazo) : '(sem data)';

  // O mostrador do topo compara com COUNTIFS($C$22:$C$136; dia): igualdade EXATA
  // contra o número do dia. Data com hora (46264,5) nunca bate com o dia (46264),
  // e o marcador some do calendário. Por isso gravamos o dia como número inteiro
  // — sem hora, sem fuso e sem D-1.
  var serie = _serieDia_(dataISO);
  var novaBR = _brDeISO_(dataISO);

  var celPrazo = sh.getRange(linha, COL.PRAZO);
  var celId    = sh.getRange(linha, COL.ID);
  var nota     = String(celPrazo.getNote() || '');
  var formula  = celPrazo.getFormula();

  // guarda a fórmula original UMA vez (permite desfazer depois)
  if (formula && nota.indexOf('FORMULA_ORIGINAL:') === -1) {
    nota = 'FORMULA_ORIGINAL: ' + formula + '\n' + nota;
  }
  // congela o ID: o nome do arquivo já gravado no Drive continua batendo
  var idAtual = String(i.id || '');
  if (idAtual && celId.getFormula()) celId.setValue(idAtual);

  celPrazo.setValue(serie);
  celPrazo.setNumberFormat(FMT_DATA);
  SpreadsheetApp.flush();                       // mostrador recalcula na hora
  var quem = String(Session.getActiveUser().getEmail() || 'gestão');
  nota += '\n' + Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm') +
          ' — remarcada de ' + antiga + ' para ' + novaBR + ' por ' + quem + ': ' + motivo;
  celPrazo.setNote(nota.substring(0, 4000));

  // evita o e-mail duplicado do gatilho de edição
  try { CacheService.getScriptCache().put('prazo_' + nomeAba + '_' + linha, novaBR, 300); } catch (e) {}

  var forado = _foraDoMes_(nomeAba, dataISO);
  if (avisar) {
    var dest = emailsDoTurno_(i.turno, conf);
    i.prazo = sh.getRange(linha, COL.PRAZO).getValue();     // já como data da planilha
    enviar_(dest, 'Data alterada — ' + i.atividade + ' (' + i.semana + ')',
      '<p>O gerente <b>remarcou</b> esta atividade:</p>' +
      '<p style="font-size:15px"><s style="color:#6b7280">' + antiga + '</s> &nbsp;&rarr;&nbsp; <b style="color:' +
      COR_VERDE + '">' + novaBR + '</b></p>' + bloco_(i) +
      '<p style="background:#FFF9C4;border-left:4px solid ' + COR_AMAR + ';padding:8px 12px"><b>Motivo:</b><br>' +
      motivo + '</p>' +
      (forado ? '<p style="color:' + COR_VERM + '"><b>Atenção:</b> a nova data cai fora do mês desta aba.</p>' : '') +
      '<p>O calendário e o mostrador da aba <b>' + i.mes + '</b> já refletem a nova data.</p>', conf, gestores_(conf));
  }
  return { data: novaBR, antiga: antiga, foraDoMes: forado };
}

/** 'aaaa-mm-dd' -> número de série do Sheets (dia inteiro, sem hora nem fuso). */
function _serieDia_(iso) {
  var p = String(iso).split('-');
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000) + 25569;
}

function _brDeISO_(iso) {
  var p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function _foraDoMes_(nomeAba, iso) {
  var m = RE_MES.exec(nomeAba);
  if (!m) return false;
  var alvo = m[2] + '-' + ('0' + (SIGLAS.indexOf(m[1]) + 1)).slice(-2);
  return String(iso).substring(0, 7) !== alvo;
}

/** Devolve a linha à data calculada pelo modelo (desfaz a remarcação). */
function restaurarDataOriginal() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi(), conf = cfg_();
  if (!_podeGerir_(conf)) { ui.alert('Apenas o gerente ou o administrador podem restaurar a data.'); return; }
  var sh = ss.getActiveSheet();
  if (!ehAbaMes_(sh.getName())) { ui.alert('Abra a aba do mês e clique na LINHA da atividade.'); return; }
  var r = sh.getActiveRange().getRow();
  if (r < LINHA_INI) { ui.alert('Selecione uma linha da tabela de atividades.'); return; }

  var celPrazo = sh.getRange(r, COL.PRAZO);
  var nota = String(celPrazo.getNote() || '');
  var mt = nota.match(/FORMULA_ORIGINAL:\s*(=[^\n]+)/);
  var modelo = ss.getSheetByName(ABA_MODELO);
  var fPrazo = mt ? mt[1] : (modelo ? modelo.getRange(r, COL.PRAZO).getFormula() : '');
  var fId    = modelo ? modelo.getRange(r, COL.ID).getFormula() : '';
  if (!fPrazo) { ui.alert('Esta linha não tem data original guardada (nunca foi remarcada).'); return; }

  var resp = ui.alert('Restaurar data original',
    'A data volta a ser calculada pelo modelo do mês e o ID volta a ser automático.\n\nConfirma?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  celPrazo.setFormula(fPrazo);
  if (fId) sh.getRange(r, COL.ID).setFormula(fId);
  celPrazo.clearNote();
  SpreadsheetApp.flush();
  ss.toast('Data e ID restaurados pelo modelo do mês.', 'GSL Bartofil', 6);
}

/** Aviso único de prazo alterado (usado pelo gatilho de edição, com trava anti-repetição). */
function _avisarPrazo_(sh, r, i, conf, valorAntigo) {
  var chave = 'prazo_' + sh.getName() + '_' + r;
  var novo = fmt_(i.prazo);
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache && cache.get(chave) === novo) return;      // já avisado há pouco
  if (cache) cache.put(chave, novo, 300);
  var antes = valorAntigo ? ' (antes: <s>' + valorAntigo + '</s>)' : '';
  enviar_(emailsDoTurno_(i.turno, conf), 'Prazo alterado — ' + i.atividade + ' (' + i.semana + ')',
    '<p>O gerente alterou a data desta atividade/reunião' + antes + ':</p>' + bloco_(i) +
    '<p>O calendário e o mostrador da aba <b>' + i.mes + '</b> já refletem a nova data.</p>', conf);
}
// ============================================================================
// v8 · TELAS (HtmlService — janela interna da planilha, sem web app)
// ============================================================================
function _htmlEntrega_() {
  return [
'<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">',
'<style>',
'  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;margin:0;padding:14px}',
'  .atv{font-weight:bold;font-size:14px;color:__AZUL__;margin:0 0 2px}',
'  .det{color:#6b7280;margin:0 0 12px;font-size:12px}',
'  .drop{border:2px dashed #c7ccd9;border-radius:6px;padding:18px;text-align:center;background:#fbfbfd;cursor:pointer}',
'  .drop.on{border-color:__VERDE__;background:#f1fbf4}',
'  .drop b{color:__AZUL__}',
'  .fmt{color:#8a90a0;font-size:11px;margin-top:6px}',
'  .lista{max-height:210px;overflow:auto;margin:12px 0 6px}',
'  .it{display:flex;align-items:center;gap:8px;padding:5px 6px;border-bottom:1px solid #eef0f4}',
'  .it img,.it .ph{width:40px;height:40px;object-fit:cover;border-radius:3px;background:#e8eaf0;flex:0 0 auto}',
'  .ph{display:flex;align-items:center;justify-content:center;font-size:9px;color:#5a6072;font-weight:bold}',
'  .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}',
'  .pg{color:#8a90a0;font-size:11px;flex:0 0 auto}',
'  .bt{border:1px solid #d3d7e0;background:#fff;border-radius:3px;cursor:pointer;width:24px;height:24px;font-size:12px;line-height:1}',
'  .bt:hover{background:#eef1f7}',
'  .barra{height:6px;background:#e8eaf0;border-radius:3px;overflow:hidden;display:none}',
'  .barra i{display:block;height:100%;width:0;background:__VERDE__;transition:width .2s}',
'  #st{min-height:18px;color:#6b7280;margin:8px 0}',
'  .ok{color:__VERDE__;font-weight:bold}.err{color:__VERM__;font-weight:bold}',
'  .acao{background:__AZUL__;color:#fff;border:0;padding:11px 20px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:bold;width:100%}',
'  .acao:disabled{background:#9aa0b4;cursor:default}',
'</style></head><body>',
'<p class="atv">__ATV__</p>',
'<p class="det">__DET__</p>',
'<div class="drop" id="drop">Arraste as fotos aqui ou <b>clique para escolher no computador</b>',
'  <div class="fmt">Fotos: JPG · PNG · HEIC · HEIF · WEBP · TIFF · BMP · GIF<br>Documentos: DOCX · DOC · ODT · RTF · TXT · PDF &nbsp;|&nbsp; limite __MAXMB__ MB por arquivo</div>',
'  <input type="file" id="fi" multiple accept="image/*,.heic,.heif,.hif,.tif,.tiff,.avif,.dng,.pdf,.docx,.doc,.odt,.rtf,.txt" style="display:none">',
'</div>',
'<div class="lista" id="lista"></div>',
'<div class="barra" id="barra"><i id="pg"></i></div>',
'<p id="st">Cada foto vira uma pagina do PDF, na ordem abaixo.</p>',
'<button class="acao" id="btn" disabled>GERAR PDF E ENVIAR</button>',
'<script>',
'var IDPASTA="__PASTA__", ABA="__ABA__", LIN=__LIN__, MAXB=__MAXMB__*1024*1024, LARG=__LARG__;',
'var MONTAGEM=45*1024*1024;',
'var NATIVOS=["jpg","jpeg","png","gif","bmp","webp"], PARALELO=4;',
'var DOCS=["docx","doc","odt","rtf","txt","html","htm"];',
'var itens=[], enviando=false;',
'function $(id){return document.getElementById(id);}',
'function ext(n){var m=String(n).toLowerCase().match(/\\.([a-z0-9]+)$/);return m?m[1]:"";}',
'function msg(t,c){var s=$("st");s.innerHTML=t;s.className=c||"";}',
'function add(fs){',
'  for(var k=0;k<fs.length;k++){itens.push({f:fs[k],ext:ext(fs[k].name)});}',
'  desenhar();',
'}',
'function desenhar(){',
'  var L=$("lista");L.innerHTML="";var total=0;',
'  itens.forEach(function(it,idx){',
'    total+=it.f.size;',
'    var d=document.createElement("div");d.className="it";',
'      var thumb;',
'      if(NATIVOS.indexOf(it.ext)>-1){thumb=document.createElement("img");thumb.src=URL.createObjectURL(it.f);}',
'      else{thumb=document.createElement("div");thumb.className="ph";thumb.textContent=it.ext.toUpperCase();}',
'      d.appendChild(thumb);',
'      var n=document.createElement("div");n.className="nm";n.textContent=it.f.name;d.appendChild(n);',
'      var p=document.createElement("div");p.className="pg";p.textContent="pag "+(idx+1);d.appendChild(p);',
'      var bs=[["\\u2191",-1],["\\u2193",1],["\\u2715",0]];',
'      bs.forEach(function(b){',
'        var x=document.createElement("button");x.className="bt";x.textContent=b[0];',
'        x.onclick=(function(i,dir){return function(){ if(enviando)return; if(dir===0){itens.splice(i,1);} else {var j=i+dir; if(j<0||j>=itens.length)return; var t=itens[i];itens[i]=itens[j];itens[j]=t;} desenhar(); };})(idx,b[1]);',
'        d.appendChild(x);',
'      });',
'    L.appendChild(d);',
'  });',
'  $("btn").disabled = itens.length===0 || enviando;',
'  var grande=null;itens.forEach(function(x){if(x.f.size>MAXB)grande=x.f.name;});',
'  if(grande){msg("O arquivo "+grande+" passa de __MAXMB__ MB. Tire da lista ou reduza a foto.","err");$("btn").disabled=true;}',
'  else if(total>MONTAGEM){msg("Total de "+(total/1048576).toFixed(1)+" MB — acima de 45 MB o Google nao monta o PDF. Divida em duas entregas.","err");$("btn").disabled=true;}',
'  else if(itens.length){',
'    var docs=0,fotos=0;',
'    itens.forEach(function(x){ if(DOCS.indexOf(x.ext)>-1) docs++; else if(x.ext!=="pdf") fotos++; });',
'    var extra = (docs&&fotos) ? " Documento + foto na mesma entrega: o PDF sai em A4, entao a foto nao ocupa a folha inteira." : "";',
'    msg(itens.length+" arquivo(s) — "+(total/1048576).toFixed(1)+" MB. Use as setas para ordenar as paginas."+extra);',
'  }',
'  else {msg("Cada foto vira uma pagina do PDF, na ordem abaixo.");}',
'}',
'$("drop").onclick=function(){ if(!enviando) $("fi").click(); };',
'$("fi").onchange=function(e){ add(e.target.files); e.target.value=""; };',
'$("drop").ondragover=function(e){e.preventDefault();this.className="drop on";};',
'$("drop").ondragleave=function(){this.className="drop";};',
'$("drop").ondrop=function(e){e.preventDefault();this.className="drop";if(!enviando)add(e.dataTransfer.files);};',
'function cru(it,cb){',
'  var fr=new FileReader();',
'  fr.onload=function(e){cb(null,{nome:it.f.name,mime:it.f.type||"application/octet-stream",b64:e.target.result.split(",")[1]});};',
'  fr.onerror=function(){cb("Falha ao ler "+it.f.name);};',
'  fr.readAsDataURL(it.f);',
'}',
'function preparar(it,cb){',
'  if(NATIVOS.indexOf(it.ext)<0) return cru(it,cb);',
'  var url=URL.createObjectURL(it.f), img=new Image();',
'  img.onload=function(){',
'    var esc=Math.min(1,LARG/Math.max(img.width,img.height));',
'    var c=document.createElement("canvas");',
'    c.width=Math.max(1,Math.round(img.width*esc));c.height=Math.max(1,Math.round(img.height*esc));',
'    c.getContext("2d").drawImage(img,0,0,c.width,c.height);',
'    URL.revokeObjectURL(url);',
'    var d=c.toDataURL("image/jpeg",0.82);',
'    cb(null,{nome:it.f.name.replace(/\\.[^.]+$/,"")+".jpg",mime:"image/jpeg",b64:d.split(",")[1]});',
'  };',
'  img.onerror=function(){URL.revokeObjectURL(url);cru(it,cb);};',
'  img.src=url;',
'}',
'$("btn").onclick=function(){',
'  if(!itens.length||enviando)return;',
'  enviando=true;$("btn").disabled=true;$("barra").style.display="block";',
'  var total=itens.length,feitos=0,fila=0,erro=null,ativos=0;',
'  msg("Preparando os arquivos...");',
'  function passo(){',
'    if(erro) return;',
'    if(feitos===total){ativos=0;return montar();}',
'    while(ativos<PARALELO && fila<total){ trabalhar(fila++); }',
'  }',
'  function trabalhar(idx){',
'    ativos++;',
'    preparar(itens[idx],function(e,p){',
'      if(e){erro=e;ativos--;return falhar(e);}',
'      google.script.run',
'        .withSuccessHandler(function(){ativos--;feitos++;',
'          $("pg").style.width=Math.round(feitos*90/total)+"%";',
'          msg("Enviando "+feitos+" de "+total+"...");passo();})',
'        .withFailureHandler(function(err){ativos--;erro=err;falhar(err.message||err);})',
'        .receberParte(IDPASTA,idx,p.nome,p.mime,p.b64);',
'    });',
'  }',
'  function montar(){',
'    msg("Montando o PDF — isso leva alguns segundos, nao feche a janela...");',
'    $("pg").style.width="95%";',
'    google.script.run',
'      .withSuccessHandler(function(){$("pg").style.width="100%";',
'        msg("\\u2714 Entrega anexada e gerente avisado! Pode fechar.","ok");',
'        setTimeout(function(){google.script.host.close();},1400);})',
'      .withFailureHandler(function(err){falhar((err&&err.message)||err);})',
'      .finalizarEntrega(IDPASTA,ABA,LIN);',
'  }',
'  function falhar(t){enviando=false;$("btn").disabled=false;$("barra").style.display="none";msg("\\u2716 "+t,"err");}',
'  passo();',
'};',
'<\/script></body></html>'
  ].join('\n');
}

function _htmlRemarcar_() {
  return [
'<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">',
'<style>',
'  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;margin:0;padding:16px}',
'  .atv{font-weight:bold;font-size:14px;color:__AZUL__;margin:0 0 2px}',
'  .det{color:#6b7280;margin:0 0 14px;font-size:12px}',
'  .cx{background:#f4f6fb;border-left:4px solid __AZUL__;padding:10px 12px;margin-bottom:14px}',
'  label{display:block;font-weight:bold;margin:0 0 4px;font-size:12px}',
'  input[type=date],textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccd1dc;border-radius:3px;font-size:13px;font-family:inherit}',
'  textarea{height:64px;resize:none}',
'  .lin{margin-bottom:12px}',
'  .av{font-size:12px;color:#444}',
'  #alerta{color:__VERM__;font-size:12px;min-height:16px;margin:2px 0 8px}',
'  #st{min-height:18px;color:#6b7280;margin:8px 0 10px}',
'  .ok{color:__VERDE__;font-weight:bold}.err{color:__VERM__;font-weight:bold}',
'  .acao{background:__AZUL__;color:#fff;border:0;padding:11px 20px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:bold;width:100%}',
'  .acao:disabled{background:#9aa0b4;cursor:default}',
'</style></head><body>',
'<p class="atv">__ATV__</p>',
'<p class="det">__DET__</p>',
'<div class="cx">Data atual: <b>__ATUALBR__</b></div>',
'<div class="lin"><label>NOVA DATA</label><input type="date" id="d" value="__ATUAL__" min="2020-01-01" max="2035-12-31"></div>',
'<div id="alerta"></div>',
'<div class="lin"><label>MOTIVO (vai no e-mail e fica registrado na celula)</label><textarea id="m" placeholder="Ex.: feriado municipal, inventario no CD, gerente em viagem..."></textarea></div>',
'<div class="lin av"><input type="checkbox" id="av" checked> Avisar o coordenador do turno por e-mail</div>',
'<p id="st"></p>',
'<button class="acao" id="btn">CONFIRMAR NOVA DATA</button>',
'<script>',
'var ABA="__ABA__", LIN=__LIN__, INI="__MESINI__", FIM="__MESFIM__", ATUAL="__ATUAL__";',
'function $(id){return document.getElementById(id);}',
'function checar(){',
'  var v=$("d").value, a=$("alerta");',
'  if(!v){a.textContent="";return;}',
'  var p=v.split("-"), br=p[2]+"/"+p[1]+"/"+p[0];',
'  if(v<INI||v>FIM){a.style.color="";a.innerHTML="\\u26a0 "+br+" cai fora do mes desta aba. O calendario do topo so marca dias do proprio mes.";}',
'  else {a.style.color="#6b7280";a.innerHTML="Nova data: <b>"+br+"</b>";}',
'}',
'$("d").onchange=checar;',
'$("btn").onclick=function(){',
'  var d=$("d").value, m=$("m").value.trim(), av=$("av").checked;',
'  if(!d){$("st").innerHTML="Escolha a nova data.";$("st").className="err";return;}',
'  if(d===ATUAL){$("st").innerHTML="A data escolhida e a mesma de hoje na planilha.";$("st").className="err";return;}',
'  if(m.length<3){$("st").innerHTML="Escreva o motivo da remarcacao.";$("st").className="err";return;}',
'  $("btn").disabled=true;$("st").className="";$("st").innerHTML="Gravando...";',
'  google.script.run',
'    .withSuccessHandler(function(r){',
'      $("st").className="ok";',
'      $("st").innerHTML="\\u2714 Remarcada de "+r.antiga+" para "+r.data+". Pode fechar.";',
'      setTimeout(function(){google.script.host.close();},1500);})',
'    .withFailureHandler(function(e){$("btn").disabled=false;$("st").className="err";$("st").innerHTML="\\u2716 "+((e&&e.message)||e);})',
'    .aplicarRemarcacao(ABA,LIN,d,m,av);',
'};',
'<\/script></body></html>'
  ].join('\n');
}
