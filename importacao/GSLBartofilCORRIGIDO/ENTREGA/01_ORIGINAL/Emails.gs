/**
 * E-MAILS E GATILHOS
 *
 * Portado do GSL_Bartofil_v10: digesto matinal, avisos de entrega,
 * validacao, setor, remarcacao e treinamento.
 *
 * A regra que vinha da planilha e que continua valendo: UM unico e-mail
 * por coordenador por dia, com tudo que ele deve. Nao um por atividade.
 */

const COR_AZUL = '#111785', COR_VERDE = '#01973A', COR_AMAR = '#FFEE03', COR_ALERTA = '#D71920';

/* ------------------------------------------------------------------ */
/* GATILHOS                                                            */
/* ------------------------------------------------------------------ */

function instalarGatilhos() {
  const usuario = usuarioAtual();
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  removerGatilhos();

  ScriptApp.newTrigger('rotinaDiaria').timeBased().atHour(5).everyDays(1).create();
  ScriptApp.newTrigger('rotinaMensal').timeBased().onMonthDay(1).atHour(6).create();
  // Faltava esta: gera o mes seguinte a partir do dia configurado (padrao 20).
  // Sem ela, o selo ficava "3 de 4" e o proximo mes nao nascia sozinho.
  ScriptApp.newTrigger('gerarMesSeNecessario').timeBased().atHour(5).everyDays(1).create();
  // Aquecimento: mantem as telas montadas no cache para quem chegar.
  ScriptApp.newTrigger('aquecerCache').timeBased().everyMinutes(15).create();

  registrarLog(usuario.email, 'GATILHOS', 'SISTEMA', '', 'Rotinas diaria, mensal, geracao do mes e aquecimento ligadas');
  return { ok: true, gatilhos: ScriptApp.getProjectTriggers().length };
}

function removerGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (g) { ScriptApp.deleteTrigger(g); });
  return { ok: true };
}

/** Roda de madrugada: digesto, geracao do mes e limpeza. */
function rotinaDiaria() {
  try { gerarMesSeNecessario(); } catch (e) { registrarLog('sistema', 'ERRO', 'MES', '', String(e)); }
  try { if (marcado(parametro('ENVIAR_DIGESTO', 'SIM'))) digestoMatinal(); } catch (e) {
    registrarLog('sistema', 'ERRO', 'DIGESTO', '', String(e));
  }
  try { briefingGerente(); } catch (e) {}
  // Esvazia o que sobrou do LOG em lote, para o balde nunca dormir cheio.
  try { descarregarLog(); } catch (e) {}
  try { limparTemporariosEntrega(); } catch (e) {}
}

function rotinaMensal() {
  try { gerarMesSeNecessario(); } catch (e) {}
}

/* ------------------------------------------------------------------ */
/* DIGESTO MATINAL — um e-mail por coordenador                         */
/* ------------------------------------------------------------------ */

function digestoMatinal() {
  const janela = Number(parametro('JANELA_PRAZOS_DIAS', 1));
  const ccApos = Number(parametro('COPIAR_GESTAO_APOS_DIAS', 1));
  const hojeN = diaNum(hoje());

  const pendentes = atividadesVigentes().filter(function (a) {
    return a.prazoISO && !a.entregue &&
           a.status !== STATUS.APROVADA && a.status !== STATUS.CANCELADA;
  });

  const equipe = coordenadoresPorTurno();

  TURNOS.forEach(function (turno) {
    const pessoa = equipe[turno];
    if (!pessoa || !pessoa.email) return;

    const meus = pendentes.filter(function (a) { return a.turno === turno || a.turno === 'Todos'; });
    const atrasadas = [], hojeVence = [], amanha = [], proximos = [];

    meus.forEach(function (a) {
      const dif = diaNum(paraData(a.prazoISO)) - hojeN;
      if (dif < 0) atrasadas.push(a);
      else if (dif === 0) hojeVence.push(a);
      else if (dif === 1) amanha.push(a);
      else if (dif <= janela) proximos.push(a);
    });

    if (!atrasadas.length && !hojeVence.length && !amanha.length && !proximos.length) return;

    const corpo = '<p>Bom dia' + (pessoa.nome ? ', <b>' + pessoa.nome + '</b>' : '') +
      '! Este e o seu resumo unico do dia — tudo que o Turno ' + turno + ' deve ou precisa enviar:</p>' +
      secao('ATRASADAS — regularizar hoje', COR_ALERTA, atrasadas, hojeN) +
      secao('VENCE HOJE', '#B45309', hojeVence, hojeN) +
      secao('VENCE AMANHA', COR_AZUL, amanha, hojeN) +
      secao('PROXIMOS ' + janela + ' DIA(S)', COR_VERDE, proximos, hojeN) +
      '<p style="margin-top:14px">Para entregar, abra o sistema, clique na atividade e anexe o arquivo. ' +
      'O status muda sozinho assim que o anexo entra.</p>' + rodapeLink();

    // cc a gestao so quando o atraso persiste
    const ccGestao = atrasadas.some(function (a) {
      return hojeN - diaNum(paraData(a.prazoISO)) >= ccApos;
    }) ? emailsDaGestao() : null;

    const assunto = atrasadas.length ? 'Pendencias do Turno ' + turno + ' — ' + atrasadas.length + ' em atraso'
                  : hojeVence.length ? 'Turno ' + turno + ' — prazos de hoje'
                  : amanha.length    ? 'Turno ' + turno + ' — vence amanha'
                  :                    'Turno ' + turno + ' — proximos prazos';

    enviar([pessoa.email], assunto, corpo, ccGestao);
  });
}

function secao(titulo, cor, itens, hojeN) {
  if (!itens.length) return '';
  return '<p style="background:' + cor + ';color:#fff;padding:6px 10px;margin:14px 0 6px;' +
         'font-weight:bold;font-size:13px">' + titulo + ' (' + itens.length + ')</p><ul style="margin:0;padding-left:20px">' +
    itens.map(function (a) {
      const dif = diaNum(paraData(a.prazoISO)) - hojeN;
      const atraso = dif < 0 ? ' · <b>' + (-dif) + ' dia(s) de atraso</b>' : '';
      const reprovada = a.status === STATUS.REPROVADA
        ? ' · <b style="color:' + COR_ALERTA + '">REPROVADA — corrigir e reanexar</b>' : '';
      return '<li style="margin:4px 0">' + a.atividade +
             ' <span style="color:#6b7280">(' + a.competencia + ' · ' + a.semana + ')</span>' +
             ' — prazo <b>' + a.prazo + '</b>' + atraso + reprovada + '</li>';
    }).join('') + '</ul>';
}

/*
 * Atividades do mes atual em diante. Sem isso, o digesto e a fila de
 * validacao cobravam atividades de meses ja encerrados (julho aparecendo
 * nos indicadores e nos e-mails).
 */
function atividadesVigentes() {
  const agora = hoje();
  const ord = agora.getFullYear() * 12 + agora.getMonth();
  return listar('ATIVIDADES').map(hidratar).filter(function (a) {
    const d = competenciaParaData(a.competencia);
    return d ? (d.getFullYear() * 12 + d.getMonth()) >= ord : true;
  });
}

/** Visao da gestao: o que esta parado na fila de validacao. */
function briefingGerente() {
  const aguardando = atividadesVigentes().filter(function (a) {
    return a.status === STATUS.AGUARDANDO;
  });
  if (!aguardando.length) return;

  const corpo = '<p>Entregas anexadas aguardando sua validacao:</p><ul>' +
    aguardando.map(function (a) {
      return '<li>' + a.atividade + ' — Turno ' + a.turno + ' · ' + a.coordenador +
             ' · entregue em ' + a.entregueEm + '</li>';
    }).join('') + '</ul>' + rodapeLink();

  enviar(emailsDaGestao(), 'Fila de validacao — ' + aguardando.length + ' entrega(s)', corpo);
}

/* ------------------------------------------------------------------ */
/* AVISOS PONTUAIS                                                     */
/* ------------------------------------------------------------------ */

function avisarEntregaRecebida(a, usuario) {
  enviar(emailsDaGestao(), 'Entrega recebida — ' + a.atividade + ' (' + a.semana + ' · Turno ' + a.turno + ')',
    '<p>O coordenador <b>' + (a.coordenador || 'do turno ' + a.turno) + '</b> anexou a entrega:</p>' +
    bloco(a) + '<p>Valide no sistema: Aprovado ou Reprovado.</p>' + rodapeLink());
}

function avisarValidacao(a, validacao, usuario) {
  const destino = emailsDoTurno(a);
  if (validacao === 'Aprovado') {
    enviar(destino, 'Aprovada — ' + a.atividade + ' (' + a.semana + ')',
      '<p>Boa noticia! O gerente <b>aprovou</b> a sua entrega:</p>' + bloco(a) +
      (a.motivo ? caixa('Feedback do gerente:', a.motivo, COR_VERDE, '#E8F5E9')
                : '<p style="color:#6b7280">Sem observacoes registradas.</p>') + rodapeLink());
  } else if (validacao === 'Reprovado') {
    enviar(destino, 'Reprovada — ' + a.atividade + ' (' + a.semana + ')',
      '<p>O gerente <b>reprovou</b> a entrega abaixo.</p>' + bloco(a) +
      caixa('Motivo informado:', a.motivo, COR_ALERTA, '#FDE8E8') +
      '<p>Corrija e anexe novamente pelo sistema.</p>' + rodapeLink());
  } else {
    enviar(destino, 'Atividade cancelada — ' + a.atividade + ' (' + a.semana + ')',
      '<p>A atividade abaixo foi <b>cancelada</b> e nao precisa mais ser entregue:</p>' + bloco(a) +
      caixa('Motivo:', a.motivo || 'Cancelada pela gestao.', '#6b7280', '#E5E7EB') + rodapeLink());
  }
}

function avisarSetorDefinido(a) {
  if (!a.setor) return;
  enviar(emailsDoTurno(a), 'Setor definido para a vistoria da ' + a.semana + ': ' + a.setor,
    '<p>O gerente definiu o setor da sua vistoria semanal:</p>' + bloco(a) +
    '<p>Imprima o checklist, faca a inspecao no setor <b>' + a.setor +
    '</b>, escaneie o checklist preenchido e anexe pelo sistema.</p>' + rodapeLink());
}

function avisarRemarcacao(a, prazoAntigo, motivo) {
  enviar(emailsDoTurno(a).concat(emailsDaGestao()), 'Prazo remarcado — ' + a.atividade,
    '<p>O prazo da atividade abaixo mudou de <b>' + prazoAntigo + '</b> para <b>' + a.prazo + '</b>.</p>' +
    bloco(a) + caixa('Motivo:', motivo, COR_AMAR, '#FFFBE0') + rodapeLink());
}

function avisarEntregaEmPdf(a, qtdArquivos, url, usuario) {
  const destino = emailsDaGestao();
  if (!destino.length) return;
  enviar(destino, 'Entrega recebida — ' + a.atividade + ' (' + a.semana + ' · Turno ' + a.turno + ')',
    '<p>O coordenador <b>' + (a.coordenador || 'do turno ' + a.turno) + '</b> anexou a entrega (' +
    qtdArquivos + ' arquivo(s) em um PDF unico):</p>' + bloco(a) +
    '<p><a href="' + url + '" style="color:' + COR_AZUL + '">Abrir o PDF da entrega</a></p>' +
    '<p>Valide no sistema: Aprovado ou Reprovado.</p>' + rodapeLink());
}

function avisarNovaAtividade(a) {
  const destino = emailsDoTurno(a);
  if (!destino.length) return;
  enviar(destino, 'Nova atividade — ' + a.atividade + ' (' + a.semana + ')',
    '<p>O gerente adicionou uma atividade para voce:</p>' + bloco(a) +
    '<p>Prazo: <b>' + a.prazo + '</b>. Entregue pelo sistema quando concluir.</p>' + rodapeLink());
}

function avisarTreinamento(a) {
  enviar(emailsDoTurno(a).concat(emailsDaGestao()), 'Treinamento marcado para ' + a.prazo,
    '<p>O gerente programou um <b>treinamento com colaboradores</b>:</p>' + bloco(a) +
    '<p>Programe com os supervisores o dia e a hora da equipe e registre a lista de presenca pelo sistema.</p>' +
    rodapeLink());
}

/* ------------------------------------------------------------------ */
/* MONTAGEM                                                            */
/* ------------------------------------------------------------------ */

function enviar(para, assunto, corpoHtml, ccExtra) {
  const destinatarios = (para || []).filter(Boolean);
  if (!destinatarios.length) return;

  const copia = [];
  const ccParametro = String(parametro('EMAIL_COPIA', '')).trim();
  if (ccParametro) copia.push(ccParametro);
  (ccExtra || []).forEach(function (e) { if (e) copia.push(e); });

  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14152B;max-width:640px">' +
    '<div style="background:' + COR_AZUL + ';color:#fff;padding:14px 18px;font-weight:bold;font-size:15px;letter-spacing:.5px">GSL BARTOFIL &nbsp;<span style="background:' + COR_AMAR + ';color:' + COR_AZUL + ';font-size:10px;padding:2px 7px;border-radius:3px;vertical-align:middle">GESTAO OPERACIONAL</span></div>' +
    '<div style="height:6px;font-size:0;line-height:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
    '<td width="50%" style="background:' + COR_VERDE + ';height:6px">&nbsp;</td>' +
    '<td width="50%" style="background:' + COR_AMAR + ';height:6px">&nbsp;</td></tr></table></div>' +
    '<div style="padding:16px">' + corpoHtml + '</div></div>';

  const opcoes = { to: destinatarios.join(','), subject: assunto, htmlBody: html };
  if (copia.length) opcoes.cc = copia.join(',');

  try {
    MailApp.sendEmail(opcoes);
    registrarLog('sistema', 'EMAIL', 'ENVIO', destinatarios.join(','), assunto);
    return { enviados: destinatarios.length };
  } catch (e) {
    registrarLog('sistema', 'ERRO', 'EMAIL', destinatarios.join(','), String(e));
    // Antes o erro morria no log e o usuario achava que tinha enviado.
    // Agora ele sobe: quem disparou a acao ve a falha na tela.
    throw new Error('O aviso por e-mail nao saiu: ' + (e.message || e) +
      '. Verifique se voce autorizou o envio de e-mail (reautorize pelo botao de acesso).');
  }
}

/**
 * Diagnostico de e-mail, para rodar pelo editor do Apps Script.
 * Executar -> testarEmail. Diz quantos e-mails restam na cota do dia e
 * dispara um teste para o proprio administrador. Se falhar aqui, o
 * problema e de autorizacao, nao do sistema.
 */
function testarEmail() {
  const restam = MailApp.getRemainingDailyQuota();
  const admin = String(prop('EMAIL_ADMIN', emailDeQuemAbriu())).trim();
  MailApp.sendEmail({
    to: admin,
    subject: 'GSL Bartofil — teste de e-mail',
    htmlBody: '<p>Se voce recebeu este e-mail, o envio esta autorizado e funcionando.</p>' +
      '<p>Cota restante hoje: <b>' + restam + '</b> e-mails.</p>'
  });
  Logger.log('Teste enviado para ' + admin + '. Cota restante: ' + restam);
  return { destino: admin, cotaRestante: restam };
}

function bloco(a) {
  return '<table style="border-collapse:collapse;margin:10px 0;font-size:13px">' +
    linha('Atividade', a.atividade) + linha('Competencia', a.competencia + ' · ' + a.semana) +
    linha('Prazo', a.prazo) + linha('Turno', a.turno) +
    (a.setor ? linha('Setor', a.setor) : '') +
    (a.coordenador ? linha('Responsavel', a.coordenador) : '') +
    linha('Status', a.status) + '</table>';
}

function linha(rotulo, valor) {
  return '<tr><td style="padding:3px 12px 3px 0;color:#6b7280">' + rotulo +
         '</td><td style="padding:3px 0"><b>' + valor + '</b></td></tr>';
}

function caixa(titulo, texto, corBarra, fundo) {
  return '<div style="border-left:4px solid ' + corBarra + ';background:' + fundo +
    ';padding:10px 14px;margin:12px 0"><b>' + titulo + '</b><br>' + texto + '</div>';
}

function rodapeLink() {
  const url = ScriptApp.getService().getUrl();
  return '<p style="margin-top:18px"><a href="' + url +
    '" style="background:' + COR_AZUL + ';color:#fff;padding:9px 16px;text-decoration:none;' +
    'border-radius:6px;display:inline-block">Abrir o GSL Bartofil</a></p>';
}

function emailsDoTurno(a) {
  const equipe = coordenadoresPorTurno();
  if (a.turno === 'Todos') {
    return TURNOS.map(function (t) { return equipe[t] && equipe[t].email; }).filter(Boolean);
  }
  // A EQUIPE cadastrada agora manda: se o coordenador do turno mudou de
  // e-mail depois que a atividade foi gerada, o aviso vai para o e-mail
  // atual, nao para o que estava congelado na linha.
  const atual = equipe[a.turno] && equipe[a.turno].email;
  return [atual || a.coordenadorEmail].filter(Boolean);
}

function emailsDaGestao() {
  return listar('EQUIPE').filter(function (p) {
    const papel = String(p.PAPEL || '').toUpperCase();
    return marcado(p.ATIVO) && (papel.indexOf('GERENTE') !== -1 || papel.indexOf('ADMINISTRADOR') !== -1);
  }).map(function (p) { return String(p.EMAIL || '').toLowerCase().trim(); }).filter(Boolean);
}
