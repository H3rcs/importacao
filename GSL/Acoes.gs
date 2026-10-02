/**
 * PLANO DE ACAO
 *
 * As acoes definidas nas reunioes de turno. Nasceu do papel do gerente:
 *
 *   Acao: Iluminacao do Flow - Verificar e acompanhar a iluminacao para
 *   garantir que todas as lampadas foram trocadas
 *   Responsavel Hercules - Entregar ate dia 25/09
 *
 * Tres campos e um prazo. E isso que a tela pede, nessa ordem.
 *
 * REGRAS COMBINADAS
 *   - a acao e SOLTA: nao pertence a nenhuma reuniao cadastrada. O campo
 *     ORIGEM guarda de onde ela veio ("Reuniao turno A - 05/09") como
 *     texto livre, so para consulta;
 *   - quem CRIA e o gerente (capacidade GERIR_ACOES). O coordenador ve e
 *     conclui as que sao dele — o plano e feito PARA ele;
 *   - nao ha validacao. Concluiu, acabou. Nao existe o ciclo
 *     entregar/validar das atividades aqui.
 */

const ACOES_SITUACAO = { PENDENTE: 'PENDENTE', CONCLUIDA: 'CONCLUIDA', CANCELADA: 'CANCELADA' };

/* Turnos que uma acao aceita. Mais largo que o TURNOS do calendario: a
 * reuniao gera acao para o administrativo e para o Jovem Aprendiz tambem. */
const ACOES_TURNOS = ['A', 'B', 'C', 'J', 'BC', 'ADM', 'Todos'];

/* ------------------------------------------------------------------ */
/* LEITURA                                                             */
/* ------------------------------------------------------------------ */

/**
 * Uma acao crua vira o objeto que a tela entende.
 * O STATUS nao e digitado nunca: e derivado da situacao e do prazo,
 * exatamente como o status da atividade.
 */
function hidratarAcao(r) {
  const prazo = paraData(r.PRAZO);
  const prazoISO = prazo ? paraISO(prazo) : '';
  const situacao = String(r.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();

  let status = 'Pendente';
  if (situacao === ACOES_SITUACAO.CANCELADA) status = 'Cancelada';
  else if (situacao === ACOES_SITUACAO.CONCLUIDA) status = 'Concluída';
  else if (prazoISO && diaNumISO(prazoISO) < hojeNum()) status = 'Atrasada';

  // Quantos dias faltam (ou passaram). A tela usa para o "vence em 3 dias".
  let dias = null;
  if (prazoISO) dias = diaNumISO(prazoISO) - hojeNum();

  return {
    id: String(r.ID || ''),
    acao: String(r.ACAO || '').trim(),
    descricao: String(r.DESCRICAO || '').trim(),
    responsavel: String(r.RESPONSAVEL || '').trim(),
    // Acao conjunta: RESPONSAVEL_EMAIL guarda um ou mais e-mails separados por virgula.
    responsaveisEmails: emailsDaAcao_(r.RESPONSAVEL_EMAIL),
    responsavelEmail: emailsDaAcao_(r.RESPONSAVEL_EMAIL)[0] || '',
    turno: String(r.TURNO || '').trim(),
    origem: String(r.ORIGEM || '').trim(),
    prazo: formatarData(prazo),
    prazoISO: prazoISO,
    dias: dias,
    situacao: situacao,
    status: status,
    concluidoEm: String(r.CONCLUIDO_EM || '').trim(),
    concluidoPor: String(r.CONCLUIDO_POR || '').trim(),
    observacao: String(r.OBSERVACAO || '').trim(),
    andamento: String(r.ANDAMENTO || '').trim(),
    depende: String(r.DEPENDE || '').trim(),
    criadoEm: String(r.CRIADO_EM || '').trim(),
    criadoPor: String(r.CRIADO_POR || '').trim()
  };
}

function emailsDaAcao_(valor) {
  return String(valor || '').toLowerCase().split(/[,;\s]+/)
    .map(function (e) { return e.trim(); })
    .filter(function (e, i, l) { return e && e.indexOf('@') !== -1 && l.indexOf(e) === i; });
}

function ehDonoDaAcao_(acao, email) {
  return acao.responsaveisEmails.indexOf(String(email || '').toLowerCase().trim()) !== -1;
}

function listarAcoes() {
  const coment = comentariosPorAcao_('ACOES');
  const pessoas = pessoasPorEmail_();
  return listar('ACOES').map(function (r) {
    const a = hidratarAcao(r);
    a.comentarios = coment[a.id] || [];
    a.criadoPorNome = nomeDoEmail_(pessoas, a.criadoPor);
    return a;
  });
}

/* { email: {nome, papel} } de quem tem cadastro em ACESSOS. */
function pessoasPorEmail_() {
  const m = {};
  try {
    listar('ACESSOS').forEach(function (l) {
      const e = String(l.EMAIL || '').toLowerCase().trim();
      if (!e) return;
      const turno = String(l.TURNO || '').toUpperCase().trim();
      m[e] = { nome: String(l.NOME || '').trim(),
               papel: [String(l.PAPEL || '').trim(), turno ? 'turno ' + turno : ''].filter(Boolean).join(' · ') };
    });
  } catch (e) { /* sem a tabela: fica so o e-mail */ }
  return m;
}
function nomeDoEmail_(pessoas, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) return '';
  return (pessoas[e] && pessoas[e].nome) || nomeDaPessoa(e, '');
}

/* ------------------------------------------------------------------ */
/* COMENTARIOS — o historico de andamento de uma acao (4.2.2)          */
/* ------------------------------------------------------------------ */

const ANDAMENTOS_ACAO = ['Em andamento', 'Aguardando', 'Concluída'];

/* { idDaAcao: [ {em, autor, nome, texto, situacao, depende}, ... mais antigo primeiro ] } */
function comentariosPorAcao_(origem) {
  const mapa = {};
  let linhas = [];
  try { linhas = listar('COMENTARIOS'); } catch (e) { return mapa; }   // banco ainda sem a tabela
  linhas.forEach(function (c) {
    if (String(c.ORIGEM || '') !== origem) return;
    const id = String(c.ACAO_ID || '');
    (mapa[id] = mapa[id] || []).push({
      id: String(c.ID || ''), em: String(c.CRIADO_EM || ''),
      // Quem comentou: e-mail da SESSAO (nunca vem da tela), nome e funcao do cadastro.
      autor: String(c.AUTOR || c.CRIADO_POR || ''),
      nome: String(c.AUTOR_NOME || '') || nomeDaPessoa(String(c.AUTOR || c.CRIADO_POR || ''), ''),
      papel: String(c.AUTOR_PAPEL || ''),
      tipo: String(c.TIPO || 'COMENTARIO').toUpperCase(),
      texto: String(c.TEXTO || ''), situacao: String(c.SITUACAO || ''), depende: String(c.DEPENDE || '')
    });
  });
  Object.keys(mapa).forEach(function (k) {
    mapa[k].sort(function (a, b) { return ordemCriado_(a.em).localeCompare(ordemCriado_(b.em)); });
  });
  return mapa;
}
/* 'dd/MM/yyyy HH:mm:ss' -> 'yyyyMMddHHmmss' para ordenar. */
function ordemCriado_(t) {
  const m = String(t || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2})?:?(\d{2})?:?(\d{2})?/);
  return m ? m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00') + (m[6] || '00') : String(t || '');
}

/*
 * Quem esta comentando — sempre a pessoa da SESSAO (e-mail + PIN), nunca
 * um nome que venha da tela. Nome e funcao vem do cadastro (ACESSOS): o
 * administrador simulando outro perfil fica registrado com o nome dele.
 */
function autorDoComentario_(usuario) {
  const email = String(usuario.email || '').toLowerCase().trim();
  const r = registroDeAcesso_(email);
  const nome = (r && String(r.NOME || '').trim()) || nomeDaPessoa(email, usuario.simulado ? '' : usuario.nome);
  const turno = r ? String(r.TURNO || '').toUpperCase().trim() : '';
  let papel = r ? [String(r.PAPEL || '').trim(), turno ? 'turno ' + turno : ''].filter(Boolean).join(' · ')
                : String((usuario.simulado ? '' : usuario.papel) || (String(usuario.perfil || '').toUpperCase() === 'ADMIN' ? 'Administrador' : ''));
  if (usuario.simulado) papel = [papel || 'Administrador', 'simulando ' + usuario.perfil].join(' · ');
  return { email: email, nome: nome, papel: papel };
}

/* tipo: COMENTARIO · CONCLUSAO · REABERTURA · CANCELAMENTO · STATUS */
function gravarComentario_(usuario, origem, idAcao, texto, situacao, depende, tipo) {
  const autor = autorDoComentario_(usuario);
  inserir('COMENTARIOS', {
    ORIGEM: origem, ACAO_ID: idAcao, TEXTO: texto, SITUACAO: situacao || '', DEPENDE: depende || '',
    AUTOR: autor.email, AUTOR_NOME: autor.nome, AUTOR_PAPEL: autor.papel, TIPO: tipo || 'COMENTARIO'
  }, autor.email);
}

/*
 * Comentar uma acao do Plano: quem avancou registra o que fez, em que
 * situacao a acao ficou e do que ela depende para concluir. Pode comentar
 * quem e responsavel por ela ou quem gere o plano. "Concluída" conclui a
 * acao (mesma regra do botao Concluir).
 */
function acaoComentarAcao(usuario, params) {
  const id = String(params.id || '').trim();
  const texto = String(params.texto || '').trim();
  const situacao = String(params.situacao || '').trim();
  const depende = String(params.depende || '').trim();
  if (!texto) throw new Error('Escreva o comentário: o que avançou, o que foi feito.');
  if (situacao && ANDAMENTOS_ACAO.indexOf(situacao) === -1) throw new Error('Situação inválida: ' + situacao);
  return comTrava(function () {
    const registro = obter('ACOES', id);
    if (!registro) throw new Error('Ação não encontrada.');
    const eu = String(usuario.email || '').toLowerCase().trim();
    if (emailsDaAcao_(registro.RESPONSAVEL_EMAIL).indexOf(eu) === -1 && !podeFazer(usuario, 'GERIR_ACOES')) {
      throw new Error('Só os responsáveis pela ação (ou a gestão) podem comentar nela.');
    }
    const atual = String(registro.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
    if (atual === ACOES_SITUACAO.CANCELADA) throw new Error('Esta ação foi cancelada. Atualize a tela.');
    gravarComentario_(usuario, 'ACOES', id, texto, situacao, situacao === 'Concluída' ? '' : depende,
      situacao === 'Concluída' && atual !== ACOES_SITUACAO.CONCLUIDA ? 'CONCLUSAO' : 'COMENTARIO');
    const campos = {};
    if (situacao && situacao !== 'Concluída') campos.ANDAMENTO = situacao;
    if (situacao !== 'Concluída') campos.DEPENDE = situacao === 'Em andamento' && !depende ? '' : depende;
    if (situacao === 'Concluída' && atual !== ACOES_SITUACAO.CONCLUIDA) {
      campos.SITUACAO = ACOES_SITUACAO.CONCLUIDA; campos.CONCLUIDO_EM = agoraTexto(); campos.CONCLUIDO_POR = usuario.email;
      campos.OBSERVACAO = texto; campos.ANDAMENTO = 'Concluída'; campos.DEPENDE = '';
    }
    if (Object.keys(campos).length) atualizar('ACOES', id, campos, usuario.email);
    return { recado: situacao === 'Concluída' ? 'Comentário registrado e ação concluída.' : 'Comentário registrado.' };
  });
}

/**
 * O que cada pessoa enxerga.
 *
 * Quem gere o plano (GERIR_ACOES) ou tem escopo TODOS (gerencia, consulta)
 * ve tudo. Os demais — o coordenador — veem SO as acoes em que sao
 * responsaveis (sozinhos ou junto com outros): cada um cuida das suas.
 */
function acoesNoAlcance(usuario, todas) {
  if (podeFazer(usuario, 'GERIR_ACOES') || escopoDe(usuario).tipo === 'TODOS') return todas;
  const email = String(usuario.email || '').toLowerCase().trim();
  return todas.filter(function (a) { return ehDonoDaAcao_(a, email); });
}

/**
 * RANKING POR TURNO — pedido para as auditorias.
 *
 * Quantas acoes cada turno propos e quantas fechou. O percentual e de
 * CONCLUSAO, nao de proposta: propor muito e concluir pouco nao e
 * desempenho, e fila.
 */
function rankingAcoesPorTurno(acoes) {
  const mapa = {};
  ACOES_TURNOS.forEach(function (t) {
    mapa[t] = { turno: t, total: 0, concluidas: 0, pendentes: 0, atrasadas: 0, canceladas: 0 };
  });

  acoes.forEach(function (a) {
    const t = a.turno && mapa[a.turno] ? a.turno : 'Todos';
    const linha = mapa[t];
    linha.total++;
    if (a.situacao === ACOES_SITUACAO.CANCELADA) { linha.canceladas++; return; }
    if (a.situacao === ACOES_SITUACAO.CONCLUIDA) { linha.concluidas++; return; }
    linha.pendentes++;
    if (a.status === 'Atrasada') linha.atrasadas++;
  });

  return Object.keys(mapa).map(function (t) { return mapa[t]; })
    .filter(function (l) { return l.total > 0; })
    .map(function (l) {
      // Canceladas saem da conta: nao contam contra nem a favor de ninguem.
      const valem = l.total - l.canceladas;
      l.percentual = valem ? Math.round((l.concluidas / valem) * 100) : 0;
      return l;
    })
    .sort(function (a, b) { return b.total - a.total || b.percentual - a.percentual; });
}

/** Dados da tela Plano de Acao. */
function dadosAcoes(usuario, params) {
  const filtroTurno = String((params && params.turno) || '').toUpperCase().trim();
  const filtroSituacao = String((params && params.situacao) || 'ABERTAS').toUpperCase().trim();
  const busca = String((params && params.busca) || '').toLowerCase().trim();

  const minhas = acoesNoAlcance(usuario, listarAcoes());

  let lista = minhas.slice();
  // Sem filtro e '' (4.2.2). Antes 'Todos' era ao mesmo tempo "sem filtro" e
  // o turno das acoes do CD inteiro: essas nunca podiam ser separadas.
  if (filtroTurno) {
    lista = lista.filter(function (a) { return String(a.turno).toUpperCase() === filtroTurno; });
  }
  if (filtroSituacao === 'ABERTAS') {
    lista = lista.filter(function (a) { return a.situacao === ACOES_SITUACAO.PENDENTE; });
  } else if (filtroSituacao === 'CONCLUIDAS') {
    lista = lista.filter(function (a) { return a.situacao === ACOES_SITUACAO.CONCLUIDA; });
  } else if (filtroSituacao === 'ATRASADAS') {
    lista = lista.filter(function (a) { return a.status === 'Atrasada'; });
  }
  if (busca) {
    lista = lista.filter(function (a) {
      return (a.acao + ' ' + a.descricao + ' ' + a.responsavel + ' ' + a.origem)
        .toLowerCase().indexOf(busca) !== -1;
    });
  }

  // Atrasada primeiro, depois por prazo. Sem prazo vai para o fim.
  lista.sort(function (a, b) {
    const pesoA = a.status === 'Atrasada' ? 0 : (a.situacao === ACOES_SITUACAO.CONCLUIDA ? 2 : 1);
    const pesoB = b.status === 'Atrasada' ? 0 : (b.situacao === ACOES_SITUACAO.CONCLUIDA ? 2 : 1);
    if (pesoA !== pesoB) return pesoA - pesoB;
    if (!a.prazoISO) return 1;
    if (!b.prazoISO) return -1;
    return a.prazoISO < b.prazoISO ? -1 : (a.prazoISO > b.prazoISO ? 1 : 0);
  });

  const email = String(usuario.email || '').toLowerCase().trim();
  const abertas = minhas.filter(function (a) { return a.situacao === ACOES_SITUACAO.PENDENTE; });

  return {
    lista: lista,
    contagens: {
      abertas: abertas.length,
      atrasadas: abertas.filter(function (a) { return a.status === 'Atrasada'; }).length,
      minhas: abertas.filter(function (a) { return ehDonoDaAcao_(a, email); }).length,
      concluidas: minhas.filter(function (a) { return a.situacao === ACOES_SITUACAO.CONCLUIDA; }).length
    },
    ranking: rankingAcoesPorTurno(minhas),
    turnos: ACOES_TURNOS,
    pessoas: pessoasParaAcao(),
    filtro: { turno: filtroTurno, situacao: filtroSituacao, busca: busca },
    permissoes: {
      gerir: podeFazer(usuario, 'GERIR_ACOES'),
      email: email
    }
  };
}

/** Quem pode ser responsavel: gente ativa no cadastro de acessos. */
function pessoasParaAcao() {
  return pessoasDaFilial()
    .filter(function (p) {
      return marcado(p.ATIVO) &&
             String(p.SITUACAO || '').toUpperCase().trim() !== 'RECUSADO';
    })
    .map(function (p) {
      return {
        email: String(p.EMAIL || '').toLowerCase().trim(),
        nome: String(p.NOME || '').trim() || String(p.EMAIL || '').split('@')[0],
        turno: String(p.TURNO || '').toUpperCase().trim(),
        papel: String(p.PAPEL || '').trim()
      };
    })
    .filter(function (p) { return !!p.email; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/* ------------------------------------------------------------------ */
/* ESCRITA                                                             */
/* ------------------------------------------------------------------ */

/** Cria ou edita. So quem tem GERIR_ACOES — combinado: o gerente cria. */
function acaoSalvarAcao(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACOES');

  const titulo = String(params.acao || '').trim();
  if (!titulo) throw new Error('Informe a ação.');

  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data de entrega.');

  const turno = String(params.turno || 'Todos').trim();
  if (ACOES_TURNOS.indexOf(turno) === -1) throw new Error('Turno inválido: ' + turno);

  // Um ou mais responsaveis (acao conjunta).
  const emails = emailsDaAcao_([].concat(params.responsaveisEmails || [], params.responsavelEmail || []).join(','));
  const pessoas = pessoasParaAcao();
  const nomes = emails.map(function (e) {
    const achado = pessoas.filter(function (p) { return p.email === e; })[0];
    return achado ? achado.nome : e.split('@')[0];
  });
  let nome = nomes.join(', ') || String(params.responsavel || '').trim();
  if (!nome) throw new Error('Escolha pelo menos um responsável.');

  const campos = {
    ACAO: titulo,
    DESCRICAO: String(params.descricao || '').trim(),
    RESPONSAVEL: nome,
    RESPONSAVEL_EMAIL: emails.join(','),
    TURNO: turno,
    ORIGEM: String(params.origem || '').trim(),
    PRAZO: paraISO(data)
  };

  let id = String(params.id || '').trim();
  let nova = false;
  if (id) {
    const atual = obter('ACOES', id);
    if (!atual) throw new Error('Ação não encontrada.');
    atualizar('ACOES', id, campos, usuario.email);
  } else {
    nova = true;
    campos.SITUACAO = ACOES_SITUACAO.PENDENTE;
    campos.CONCLUIDO_EM = '';
    campos.CONCLUIDO_POR = '';
    campos.OBSERVACAO = '';
    id = inserir('ACOES', campos, usuario.email);
  }

  /*
   * O aviso por e-mail nao pode derrubar a acao ja gravada — mas tambem
   * nao pode sumir calado. Mesma regra da criacao de atividade.
   */
  let avisoEmail = '';
  const falhas = [];
  emails.forEach(function (email) {
    try { avisarAcaoNova(campos, email, nova, id); }
    catch (e) { falhas.push(email + ' (' + (e.message || e) + ')'); }
  });
  if (falhas.length) avisoEmail = 'Ação salva, mas o aviso por e-mail não saiu para: ' + falhas.join('; ');

  const r = { id: id, recado: nova ? 'Ação criada.' : 'Ação atualizada.' };
  if (avisoEmail) r.avisoEmail = avisoEmail;
  return r;
}

/**
 * Concluir. Sem validacao de ninguem — foi o combinado.
 * Pode concluir: o responsavel pela acao, ou quem tem GERIR_ACOES.
 */
function acaoConcluirAcao(usuario, params) {
  const id = String(params.id || '').trim();

  /*
   * Ler, conferir e gravar na mesma trava — e conferir a SITUACAO. A tela
   * do coordenador pode estar velha: o gerente cancelou a acao ha pouco e
   * ela ainda aparece "em aberto" com o botao Concluir. Antes o clique
   * concluia a acao cancelada e apagava o motivo do cancelamento
   * (OBSERVACAO). Concluir de novo uma ja concluida tambem nao regrava.
   */
  return comTrava(function () {
    const registro = obter('ACOES', id);
    if (!registro) throw new Error('Ação não encontrada.');

    const eu = String(usuario.email || '').toLowerCase().trim();
    if (emailsDaAcao_(registro.RESPONSAVEL_EMAIL).indexOf(eu) === -1 && !podeFazer(usuario, 'GERIR_ACOES')) {
      throw new Error('Esta ação é de ' + (registro.RESPONSAVEL || 'outra pessoa') + '. Só o responsável a conclui.');
    }

    const situacao = String(registro.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
    if (situacao === ACOES_SITUACAO.CANCELADA) {
      throw new Error('Esta ação foi cancelada pela gestão e não pode ser concluída.' +
        (String(registro.OBSERVACAO || '').trim() ? ' Motivo: ' + String(registro.OBSERVACAO).trim() + '.' : '') +
        ' Atualize a tela.');
    }
    if (situacao === ACOES_SITUACAO.CONCLUIDA) return { recado: 'Esta ação já estava concluída.' };

    const obs = String(params.observacao || '').trim();
    atualizar('ACOES', id, {
      SITUACAO: ACOES_SITUACAO.CONCLUIDA,
      CONCLUIDO_EM: agoraTexto(),
      CONCLUIDO_POR: usuario.email,
      OBSERVACAO: obs,
      ANDAMENTO: 'Concluída', DEPENDE: ''
    }, usuario.email);
    // A conclusao entra no historico, com quem concluiu.
    gravarComentario_(usuario, 'ACOES', id, obs || 'Ação concluída.', 'Concluída', '', 'CONCLUSAO');

    return { recado: 'Ação concluída.' };
  });
}

/** Voltar atras: a acao volta para a fila. */
function acaoReabrirAcao(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACOES');
  const id = String(params.id || '').trim();
  if (!obter('ACOES', id)) throw new Error('Ação não encontrada.');

  atualizar('ACOES', id, {
    SITUACAO: ACOES_SITUACAO.PENDENTE,
    CONCLUIDO_EM: '', CONCLUIDO_POR: '', ANDAMENTO: 'Em andamento'
  }, usuario.email);
  gravarComentario_(usuario, 'ACOES', id, String(params.motivo || '').trim() || 'Ação reaberta.', 'Em andamento', '', 'REABERTURA');

  return { recado: 'Ação reaberta.' };
}

/** Cancelar: sai da conta do turno, mas fica no historico. */
function acaoCancelarAcao(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACOES');
  const id = String(params.id || '').trim();
  if (!obter('ACOES', id)) throw new Error('Ação não encontrada.');

  const motivo = String(params.motivo || '').trim();
  atualizar('ACOES', id, {
    SITUACAO: ACOES_SITUACAO.CANCELADA,
    OBSERVACAO: motivo, DEPENDE: ''
  }, usuario.email);
  gravarComentario_(usuario, 'ACOES', id, motivo ? 'Cancelada: ' + motivo : 'Ação cancelada.', 'Cancelada', '', 'CANCELAMENTO');

  return { recado: 'Ação cancelada.' };
}

function acaoExcluirAcao(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACOES');
  const id = String(params.id || '').trim();
  if (!obter('ACOES', id)) throw new Error('Ação não encontrada.');
  excluir('ACOES', id, usuario.email);
  return { recado: 'Ação excluída.' };
}

/* ------------------------------------------------------------------ */
/* AVISO                                                               */
/* ------------------------------------------------------------------ */

/*
 * Texto de pessoa dentro de HTML de e-mail. O sistema nao tinha nenhuma
 * funcao para isso — os avisos antigos montavam HTML com o texto cru.
 * Um nome de atividade com "&" ou "<" quebrava o corpo do e-mail.
 */
function htmlSeguro(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Quem recebeu uma acao precisa saber sem depender de abrir o sistema.
 * Usa o mesmo enviador do resto do sistema (Emails.gs).
 */
function avisarAcaoNova(campos, email, nova, id) {
  if (!email) return;
  const prazo = formatarData(paraData(campos.PRAZO));
  const assunto = (nova ? 'Nova ação: ' : 'Ação atualizada: ') + campos.ACAO;

  const corpo =
    '<p>Você é ' + (emailsDaAcao_(campos.RESPONSAVEL_EMAIL).length > 1 ? 'um dos responsáveis (' + htmlSeguro(campos.RESPONSAVEL) + ')' : 'o responsável') +
    ' por esta ação do plano de ação do GSL.</p>' +
    '<p style="font-size:16px"><strong>' + htmlSeguro(campos.ACAO) + '</strong></p>' +
    (campos.DESCRICAO ? '<p>' + htmlSeguro(campos.DESCRICAO) + '</p>' : '') +
    '<p>Turno: <strong>' + htmlSeguro(campos.TURNO) + '</strong><br>' +
    'Entregar até: <strong>' + htmlSeguro(prazo) + '</strong></p>' +
    (campos.ORIGEM ? '<p style="color:#666">Origem: ' + htmlSeguro(campos.ORIGEM) + '</p>' : '') +
    rodapeLink('acoes');

  enviar([email], assunto, corpo);
}
