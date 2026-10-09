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

/*
 * DOIS PLANOS, O MESMO MODELO (4.2.2).
 *
 * A Limpeza CD ganhou um Plano de Acao igual ao do Calendario: mesmas
 * etapas, mesmos comentarios com historico, mesmo "depende de", mesmas
 * fotos. As acoes dos dois moram na tabela ACOES e a coluna PLANO diz de
 * quem e cada uma (vazio ou CALENDARIO = o do Calendario; LIMPEZA = o da
 * Limpeza). Cada porta so le e grava acao do PROPRIO plano: quem gere a
 * limpeza nao mexe no plano do calendario pela porta da limpeza, e
 * vice-versa — para a porta errada, a acao "nao existe".
 */
const PLANOS = {
  CALENDARIO: { id: 'CALENDARIO', cap: 'GERIR_ACOES', modulo: 'calendario', tela: 'acoes',
                nome: 'Plano de Ação' },
  LIMPEZA:    { id: 'LIMPEZA', cap: 'GERIR_LIMPEZA', modulo: 'limpeza', tela: 'limpeza',
                nome: 'Plano de Ação da Limpeza' }
};

const ACOES_SITUACAO = { PENDENTE: 'PENDENTE', CONCLUIDA: 'CONCLUIDA', CANCELADA: 'CANCELADA' };

const BUILD_ACOES = '2026.10.09';   // carimbo da entrega — ver APP.build no Codigo.gs

/* De que plano e a linha. Linha antiga (sem PLANO) e do Calendario. */
function planoDe_(r) {
  return String((r && r.PLANO) || '').toUpperCase().trim() === 'LIMPEZA' ? 'LIMPEZA' : 'CALENDARIO';
}

/* A linha da acao, conferindo que ela e DESTE plano. */
function acaoDoPlano_(plano, id) {
  const r = obter('ACOES', String(id || '').trim());
  if (!r || planoDe_(r) !== plano.id) throw new Error('Ação não encontrada. Atualize a tela.');
  return r;
}

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
    criadoPor: String(r.CRIADO_POR || '').trim(),
    plano: planoDe_(r),
    // Da limpeza: onde foi encontrado, criticidade e o dia em que a acao foi aberta.
    zona: String(r.ZONA || '').trim(),
    local: String(r.LOCAL || '').trim(),
    criticidade: String(r.CRITICIDADE || '').trim(),
    abertaEm: isoDe_(r.ABERTA_EM) || isoDoCarimbo_(r.CRIADO_EM),
    fotos: fotosDaCelula_(r.ANEXOS)
  };
}

/* 'dd/MM/yyyy HH:mm:ss' -> 'yyyy-MM-dd' ('' se nao der para ler). */
function isoDoCarimbo_(valor) {
  const p = partesDoCarimbo_(valor);
  return p ? p.a + '-' + dd_(p.m) + '-' + dd_(p.d) : '';
}

function emailsDaAcao_(valor) {
  return String(valor || '').toLowerCase().split(/[,;\s]+/)
    .map(function (e) { return e.trim(); })
    .filter(function (e, i, l) { return e && e.indexOf('@') !== -1 && l.indexOf(e) === i; });
}

function ehDonoDaAcao_(acao, email) {
  return acao.responsaveisEmails.indexOf(String(email || '').toLowerCase().trim()) !== -1;
}

/* As acoes de UM plano (o do Calendario, se nada for dito). */
function listarAcoes(idPlano) {
  const plano = PLANOS[idPlano] ? idPlano : 'CALENDARIO';
  const coment = comentariosPorAcao_(origensDoPlano_(plano));
  const pessoas = pessoasPorEmail_();
  return listar('ACOES').filter(function (r) { return planoDe_(r) === plano; }).map(function (r) {
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

/*
 * Os comentarios das acoes da limpeza que vieram da tabela antiga (LP_ACOES)
 * continuam gravados com aquela ORIGEM — a acao manteve o mesmo ID ao passar
 * para o Plano de Acao, entao basta ler as duas origens.
 */
function origensDoPlano_(idPlano) { return idPlano === 'LIMPEZA' ? ['ACOES', 'LP_ACOES'] : ['ACOES']; }

/* { idDaAcao: [ {em, autor, nome, texto, situacao, depende, fotos}, ... mais antigo primeiro ] } */
function comentariosPorAcao_(origens) {
  const aceitas = [].concat(origens || 'ACOES');
  const mapa = {};
  let linhas = [];
  try { linhas = listar('COMENTARIOS'); } catch (e) { return mapa; }   // banco ainda sem a tabela
  linhas.forEach(function (c) {
    if (aceitas.indexOf(String(c.ORIGEM || '')) === -1) return;
    const id = String(c.ACAO_ID || '');
    (mapa[id] = mapa[id] || []).push({
      id: String(c.ID || ''), em: String(c.CRIADO_EM || ''),
      // Quem comentou: e-mail da SESSAO (nunca vem da tela), nome e funcao do cadastro.
      autor: String(c.AUTOR || c.CRIADO_POR || ''),
      nome: String(c.AUTOR_NOME || '') || nomeDaPessoa(String(c.AUTOR || c.CRIADO_POR || ''), ''),
      papel: String(c.AUTOR_PAPEL || ''),
      tipo: String(c.TIPO || 'COMENTARIO').toUpperCase(),
      texto: String(c.TEXTO || ''), situacao: String(c.SITUACAO || ''), depende: String(c.DEPENDE || ''),
      fotos: fotosDaCelula_(c.ANEXOS)
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

/* tipo: COMENTARIO · CONCLUSAO · REABERTURA · CANCELAMENTO · STATUS. fotos: metadados ja gravados no Drive. */
function gravarComentario_(usuario, origem, idAcao, texto, situacao, depende, tipo, fotos) {
  const autor = autorDoComentario_(usuario);
  inserir('COMENTARIOS', {
    ORIGEM: origem, ACAO_ID: idAcao, TEXTO: texto, SITUACAO: situacao || '', DEPENDE: depende || '',
    AUTOR: autor.email, AUTOR_NOME: autor.nome, AUTOR_PAPEL: autor.papel, TIPO: tipo || 'COMENTARIO',
    ANEXOS: fotos && fotos.length ? JSON.stringify(fotos) : ''
  }, autor.email);
}

/* So os responsaveis pela acao ou quem gere o plano. */
function exigirResponsavelOuGestor_(plano, usuario, registro, mensagem) {
  const eu = String(usuario.email || '').toLowerCase().trim();
  if (emailsDaAcao_(registro.RESPONSAVEL_EMAIL).indexOf(eu) === -1 && !podeFazer(usuario, plano.cap)) {
    throw new Error(mensagem);
  }
}

/*
 * Comentar uma acao do Plano: quem avancou registra o que fez, em que
 * situacao a acao ficou e do que ela depende para concluir — com foto, se
 * quiser. Pode comentar quem e responsavel por ela ou quem gere o plano.
 * "Concluída" conclui a acao (mesma regra do botao Concluir).
 */
function comentarAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const texto = String(params.texto || '').trim();
  const situacao = String(params.situacao || '').trim();
  const depende = String(params.depende || '').trim();
  if (!texto) throw new Error('Escreva o comentário: o que avançou, o que foi feito.');
  if (situacao && ANDAMENTOS_ACAO.indexOf(situacao) === -1) throw new Error('Situação inválida: ' + situacao);
  const fotos = fotosDoPedido_(params);

  // Confere ANTES de subir as fotos (o Drive e lento e fica fora da trava)...
  const antes = acaoDoPlano_(plano, id);
  exigirResponsavelOuGestor_(plano, usuario, antes, 'Só os responsáveis pela ação (ou a gestão) podem comentar nela.');
  if (String(antes.SITUACAO || '').toUpperCase().trim() === ACOES_SITUACAO.CANCELADA) throw new Error('Esta ação foi cancelada. Atualize a tela.');
  const gravadas = gravarFotos_(usuario, id, fotos);

  // ...e de novo na trava, que e onde vale: a tela pode estar velha.
  try {
    return comTrava(function () {
      const registro = acaoDoPlano_(plano, id);
      exigirResponsavelOuGestor_(plano, usuario, registro, 'Só os responsáveis pela ação (ou a gestão) podem comentar nela.');
      const atual = String(registro.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
      if (atual === ACOES_SITUACAO.CANCELADA) throw new Error('Esta ação foi cancelada. Atualize a tela.');
      gravarComentario_(usuario, 'ACOES', id, texto, situacao, situacao === 'Concluída' ? '' : depende,
        situacao === 'Concluída' && atual !== ACOES_SITUACAO.CONCLUIDA ? 'CONCLUSAO' : 'COMENTARIO', gravadas);
      const campos = {};
      if (situacao && situacao !== 'Concluída') campos.ANDAMENTO = situacao;
      if (situacao !== 'Concluída') campos.DEPENDE = situacao === 'Em andamento' && !depende ? '' : depende;
      if (situacao === 'Concluída' && atual !== ACOES_SITUACAO.CONCLUIDA) {
        campos.SITUACAO = ACOES_SITUACAO.CONCLUIDA; campos.CONCLUIDO_EM = agoraTexto(); campos.CONCLUIDO_POR = usuario.email;
        campos.OBSERVACAO = texto; campos.ANDAMENTO = 'Concluída'; campos.DEPENDE = '';
      }
      if (Object.keys(campos).length) atualizar('ACOES', id, campos, usuario.email);
      return { recado: (situacao === 'Concluída' ? 'Comentário registrado e ação concluída.' : 'Comentário registrado.') +
        (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') };
    });
  } catch (e) { jogarFotosFora_(gravadas); throw e; }
}

/**
 * O que cada pessoa enxerga.
 *
 * Quem gere o plano (GERIR_ACOES) ou tem escopo TODOS (gerencia, consulta)
 * ve tudo. Os demais — o coordenador — veem SO as acoes em que sao
 * responsaveis (sozinhos ou junto com outros): cada um cuida das suas.
 */
function acoesNoAlcance(usuario, todas, plano) {
  plano = plano || PLANOS.CALENDARIO;
  if (podeFazer(usuario, plano.cap) || escopoDe(usuario).tipo === 'TODOS') return todas;
  const email = String(usuario.email || '').toLowerCase().trim();
  return todas.filter(function (a) { return ehDonoDaAcao_(a, email); });
}

/* A mesma regra, para UMA acao (foto pedida pela tela). */
function podeVerAcao_(plano, usuario, acao) {
  return acoesNoAlcance(usuario, [acao], plano).length === 1;
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

/** Dados da tela Plano de Acao (o do Calendario). */
function dadosAcoes(usuario, params) { return dadosPlano_(PLANOS.CALENDARIO, usuario, params); }

/* Os dados de um plano — a tela do Calendario e a aba Plano de Acao da Limpeza usam o mesmo. */
function dadosPlano_(plano, usuario, params) {
  const filtroTurno = String((params && params.turno) || '').toUpperCase().trim();
  const filtroSituacao = String((params && params.situacao) || 'ABERTAS').toUpperCase().trim();
  const busca = String((params && params.busca) || '').toLowerCase().trim();

  const minhas = acoesNoAlcance(usuario, listarAcoes(plano.id), plano);

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
      return (a.acao + ' ' + a.descricao + ' ' + a.responsavel + ' ' + a.origem + ' ' + a.zona + ' ' + a.local)
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
    pessoas: pessoasParaAcao(plano),
    filtro: { turno: filtroTurno, situacao: filtroSituacao, busca: busca },
    plano: plano.id,
    fotos: { porVez: FOTOS_POR_VEZ, porAcao: FOTOS_POR_ACAO },
    permissoes: {
      gerir: podeFazer(usuario, plano.cap),
      email: email
    }
  };
}

/*
 * Quem pode ser responsavel: gente ativa no cadastro de acessos que
 * ENXERGA o modulo do plano. Acao da limpeza dada a quem nao ve a Limpeza
 * chegava por e-mail e a pessoa nao tinha onde abrir.
 */
function pessoasParaAcao(plano) {
  const modulo = plano ? plano.modulo : '';
  return pessoasDaFilial()
    .filter(function (p) {
      return marcado(p.ATIVO) &&
             String(p.SITUACAO || '').toUpperCase().trim() !== 'RECUSADO';
    })
    .filter(function (p) {
      if (!modulo) return true;
      const perfil = String(p.PERFIL || '').toUpperCase().trim();
      if (!perfil || perfil === PERFIL_PADRAO_NOVO_USUARIO) return false;
      const u = montarUsuario({ perfil: perfil, modulos: String(p.MODULOS || '').trim() });
      return modoEfetivo(u.permissoes, modulo) !== 'NAO';
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

/*
 * Cria ou edita. So quem gere o plano (GERIR_ACOES no Calendario,
 * GERIR_LIMPEZA na Limpeza) — combinado: o gerente cria.
 */
function salvarAcaoDoPlano_(plano, usuario, params) {
  exigirCapacidade(usuario, plano.cap);

  const titulo = String(params.acao || '').trim();
  if (!titulo) throw new Error('Informe a ação.');

  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data de entrega.');

  const turno = String(params.turno || 'Todos').trim();
  if (ACOES_TURNOS.indexOf(turno) === -1) throw new Error('Turno inválido: ' + turno);

  let id = String(params.id || '').trim();
  const nova = !id;
  // Existe e e deste plano? Confere antes de tudo (e antes de subir foto para o Drive).
  const antes = nova ? null : acaoDoPlano_(plano, id);

  // Um ou mais responsaveis (acao conjunta) — gente que enxerga o plano.
  // Quem ja era responsavel continua valendo (pode ter perdido o acesso depois).
  const emails = emailsDaAcao_([].concat(params.responsaveisEmails || [], params.responsavelEmail || []).join(','));
  const pessoas = pessoasParaAcao(plano);
  const jaEram = antes ? emailsDaAcao_(antes.RESPONSAVEL_EMAIL) : [];
  const fora = emails.filter(function (e) {
    return jaEram.indexOf(e) === -1 && !pessoas.some(function (p) { return p.email === e; });
  });
  if (fora.length) throw new Error('Sem acesso ao ' + plano.nome + ' nesta filial: ' + fora.join(', ') + '. Escolha alguém da lista.');
  const conhecidos = pessoasPorEmail_();
  const nomes = emails.map(function (e) {
    const achado = pessoas.filter(function (p) { return p.email === e; })[0];
    return achado ? achado.nome : nomeDoEmail_(conhecidos, e);
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
  // Da limpeza: onde foi encontrado, criticidade e quando a acao foi aberta.
  if (plano.id === 'LIMPEZA') {
    campos.ZONA = String(params.zona || '').toUpperCase().trim();
    campos.LOCAL = String(params.local || '').trim();
    campos.CRITICIDADE = critLimpeza_(params.criticidade);
    campos.ABERTA_EM = isoDe_(params.abertaEm) ||
      (antes ? isoDe_(antes.ABERTA_EM) || isoDoCarimbo_(antes.CRIADO_EM) : '') || paraISO(hoje());
  }

  const fotos = fotosDoPedido_(params);
  if (nova) id = gerarId('ACOES');
  else if (lerAnexos_(antes.ANEXOS).length + fotos.length > FOTOS_POR_ACAO) throw new Error(muitasFotos_());
  const gravadas = gravarFotos_(usuario, id, fotos);

  try {
    comTrava(function () {
      if (nova) {
        campos.ID = id;
        campos.PLANO = plano.id;
        campos.SITUACAO = ACOES_SITUACAO.PENDENTE;
        campos.CONCLUIDO_EM = '';
        campos.CONCLUIDO_POR = '';
        campos.OBSERVACAO = '';
        campos.ANEXOS = gravadas.length ? JSON.stringify(gravadas) : '';
        inserir('ACOES', campos, usuario.email);
        return;
      }
      const atual = acaoDoPlano_(plano, id);
      if (gravadas.length) {
        const lista = lerAnexos_(atual.ANEXOS);
        if (lista.length + gravadas.length > FOTOS_POR_ACAO) throw new Error(muitasFotos_());
        campos.ANEXOS = JSON.stringify(lista.map(metadadosDoAnexo_).concat(gravadas));
      }
      atualizar('ACOES', id, campos, usuario.email);
    });
  } catch (e) { jogarFotosFora_(gravadas); throw e; }

  /*
   * O aviso por e-mail nao pode derrubar a acao ja gravada — mas tambem
   * nao pode sumir calado. Mesma regra da criacao de atividade.
   */
  let avisoEmail = '';
  const falhas = [];
  emails.forEach(function (email) {
    try { avisarAcaoNova(campos, email, nova, id, plano); }
    catch (e) { falhas.push(email + ' (' + (e.message || e) + ')'); }
  });
  if (falhas.length) avisoEmail = 'Ação salva, mas o aviso por e-mail não saiu para: ' + falhas.join('; ');

  const r = { id: id, recado: (nova ? 'Ação criada.' : 'Ação atualizada.') +
    (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') };
  if (avisoEmail) r.avisoEmail = avisoEmail;
  return r;
}

/**
 * Concluir. Sem validacao de ninguem — foi o combinado.
 * Pode concluir: o responsavel pela acao, ou quem gere o plano.
 * A foto (opcional) vai junto do registro da conclusao no historico.
 */
function concluirAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const fotos = fotosDoPedido_(params);
  const naoEDele = function (r) { return 'Esta ação é de ' + (r.RESPONSAVEL || 'outra pessoa') + '. Só o responsável a conclui.'; };

  const antes = acaoDoPlano_(plano, id);
  exigirResponsavelOuGestor_(plano, usuario, antes, naoEDele(antes));
  const situacaoAntes = String(antes.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
  if (situacaoAntes === ACOES_SITUACAO.CONCLUIDA) return { recado: 'Esta ação já estava concluída.' };
  const gravadas = situacaoAntes === ACOES_SITUACAO.CANCELADA ? [] : gravarFotos_(usuario, id, fotos);

  /*
   * Ler, conferir e gravar na mesma trava — e conferir a SITUACAO. A tela
   * do coordenador pode estar velha: o gerente cancelou a acao ha pouco e
   * ela ainda aparece "em aberto" com o botao Concluir. Antes o clique
   * concluia a acao cancelada e apagava o motivo do cancelamento
   * (OBSERVACAO). Concluir de novo uma ja concluida tambem nao regrava.
   */
  try {
    return comTrava(function () {
      const registro = acaoDoPlano_(plano, id);
      exigirResponsavelOuGestor_(plano, usuario, registro, naoEDele(registro));

      const situacao = String(registro.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
      if (situacao === ACOES_SITUACAO.CANCELADA) {
        throw new Error('Esta ação foi cancelada pela gestão e não pode ser concluída.' +
          (String(registro.OBSERVACAO || '').trim() ? ' Motivo: ' + String(registro.OBSERVACAO).trim() + '.' : '') +
          ' Atualize a tela.');
      }
      if (situacao === ACOES_SITUACAO.CONCLUIDA) {
        jogarFotosFora_(gravadas);
        return { recado: 'Esta ação já estava concluída.' };
      }

      const obs = String(params.observacao || '').trim();
      atualizar('ACOES', id, {
        SITUACAO: ACOES_SITUACAO.CONCLUIDA,
        CONCLUIDO_EM: agoraTexto(),
        CONCLUIDO_POR: usuario.email,
        OBSERVACAO: obs,
        ANDAMENTO: 'Concluída', DEPENDE: ''
      }, usuario.email);
      // A conclusao entra no historico, com quem concluiu (e a foto, se veio).
      gravarComentario_(usuario, 'ACOES', id, obs || 'Ação concluída.', 'Concluída', '', 'CONCLUSAO', gravadas);

      return { recado: 'Ação concluída.' + (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') };
    });
  } catch (e) { jogarFotosFora_(gravadas); throw e; }
}

/** Voltar atras: a acao volta para a fila. */
function reabrirAcaoDoPlano_(plano, usuario, params) {
  exigirCapacidade(usuario, plano.cap);
  const id = String(params.id || '').trim();
  return comTrava(function () {
    acaoDoPlano_(plano, id);
    atualizar('ACOES', id, {
      SITUACAO: ACOES_SITUACAO.PENDENTE,
      CONCLUIDO_EM: '', CONCLUIDO_POR: '', ANDAMENTO: 'Em andamento'
    }, usuario.email);
    gravarComentario_(usuario, 'ACOES', id, String(params.motivo || '').trim() || 'Ação reaberta.', 'Em andamento', '', 'REABERTURA');
    return { recado: 'Ação reaberta.' };
  });
}

/** Cancelar: sai da conta do turno, mas fica no historico. */
function cancelarAcaoDoPlano_(plano, usuario, params) {
  exigirCapacidade(usuario, plano.cap);
  const id = String(params.id || '').trim();
  const motivo = String(params.motivo || '').trim();
  return comTrava(function () {
    acaoDoPlano_(plano, id);
    atualizar('ACOES', id, {
      SITUACAO: ACOES_SITUACAO.CANCELADA,
      OBSERVACAO: motivo, DEPENDE: ''
    }, usuario.email);
    gravarComentario_(usuario, 'ACOES', id, motivo ? 'Cancelada: ' + motivo : 'Ação cancelada.', 'Cancelada', '', 'CANCELAMENTO');
    return { recado: 'Ação cancelada.' };
  });
}

function excluirAcaoDoPlano_(plano, usuario, params) {
  exigirCapacidade(usuario, plano.cap);
  const id = String(params.id || '').trim();
  return comTrava(function () {
    acaoDoPlano_(plano, id);
    excluir('ACOES', id, usuario.email);
    return { recado: 'Ação excluída.' };
  });
}

/* ------------------------------------------------------------------ */
/* FOTOS — na acao ou no comentario (4.2.2)                            */
/*                                                                     */
/* Ficam no Drive como os outros anexos do GSL: Anexos/ACOES/<ID da    */
/* acao>/ — as da propria acao e as dos comentarios dela, juntas. Na   */
/* planilha vai so a lista (id, nome, tamanho, tipo) na coluna ANEXOS. */
/* A tela comprime antes de enviar; aqui confere tipo, tamanho e       */
/* quantidade. Ver a foto passa pela porta do plano: so quem enxerga a */
/* acao, e so foto que e dela ou de um comentario dela.                */
/* ------------------------------------------------------------------ */

const FOTOS_POR_VEZ = 5;        // por acao salva, comentario ou conclusao
const FOTOS_POR_ACAO = 20;      // na propria acao (as dos comentarios contam a parte)
const TIPOS_DE_FOTO = /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/;

function muitasFotos_() { return 'A ação já tem fotos demais (máximo ' + FOTOS_POR_ACAO + '). Remova alguma antes ou anexe num comentário.'; }

/* As fotos que vieram da tela, conferidas e prontas para gravar (nada e gravado aqui). */
function fotosDoPedido_(params) {
  const lista = [].concat((params && params.fotos) || []).filter(function (f) { return f && f.dados; });
  if (lista.length > FOTOS_POR_VEZ) throw new Error('Envie no máximo ' + FOTOS_POR_VEZ + ' fotos de cada vez.');
  return lista.map(function (f, i) {
    const nome = higienizarNome(String(f.nome || '').trim() || ('foto-' + (i + 1) + '.jpg'));
    const tipo = String(f.tipo || '').toLowerCase().trim();
    if (!TIPOS_DE_FOTO.test(tipo)) throw new Error('"' + nome + '" não é uma foto (envie JPG, PNG, WEBP ou HEIC).');
    const dados = String(f.dados).replace(/^data:[^,]*,/, '');
    // base64: 4 caracteres para cada 3 bytes. Confere antes de decodificar.
    if (dados.length * 3 / 4 > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      throw new Error('A foto "' + nome + '" passa de ' + TAMANHO_MAXIMO_MB + ' MB.');
    }
    return { nome: nome, tipo: tipo === 'image/jpg' ? 'image/jpeg' : tipo, dados: dados };
  });
}

/*
 * Grava no Drive (Anexos/ACOES/<id>/) e devolve os metadados. FORA da
 * trava: o Drive e lento. Se uma falhar, as que ja subiram vao para a
 * lixeira — nada fica orfao.
 */
function gravarFotos_(usuario, idAcao, fotos) {
  const gravadas = [];
  if (!fotos || !fotos.length) return gravadas;
  try {
    fotos.forEach(function (f) {
      gravadas.push(metadadosDoAnexo_(gravarArquivoNoDrive_(usuario, 'ACOES', idAcao, f)));
    });
  } catch (e) {
    jogarFotosFora_(gravadas);
    throw e;
  }
  registrarLog(usuario.email, 'ANEXAR FOTO', 'ACOES', idAcao, gravadas.length + ' foto(s)');
  return gravadas;
}

/* A gravacao na planilha nao andou: as fotos que subiram vao para a lixeira. */
function jogarFotosFora_(lista) {
  (lista || []).forEach(function (a) { try { DriveApp.getFileById(a.id).setTrashed(true); } catch (e) { /* ja sumiu */ } });
}

/* O que a tela precisa saber de cada foto (sem ir ao Drive). */
function fotosDaCelula_(valor) {
  return lerAnexos_(valor).map(function (a) { return { id: a.id, nome: a.nome || 'foto', tamanho: a.tamanho || '', tipo: a.tipo || '' }; });
}

/*
 * Ver uma foto. So quem enxerga a acao (a mesma regra da lista), e so foto
 * que e da acao ou de um comentario dela — o ID de um arquivo qualquer do
 * Drive nao passa por aqui.
 */
function fotoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const arquivo = String(params.arquivo || '').trim();
  const registro = acaoDoPlano_(plano, id);
  if (!podeVerAcao_(plano, usuario, hidratarAcao(registro))) throw new Error('Ação não encontrada. Atualize a tela.');
  const daAcao = lerAnexos_(registro.ANEXOS).some(function (a) { return a.id === arquivo; });
  const deComentario = !daAcao && (comentariosPorAcao_(origensDoPlano_(plano.id))[id] || []).some(function (c) {
    return c.fotos.some(function (a) { return a.id === arquivo; });
  });
  if (!arquivo || (!daAcao && !deComentario)) throw new Error('Esta foto não é desta ação.');
  let b;
  try { b = baixarAnexo(arquivo); }
  catch (e) { throw new Error('A foto não está mais no Drive (foi apagada ou movida).'); }
  return { ok: true, nome: b.nome, tipo: b.tipo, dados: b.dados };
}

/* Tirar uma foto da acao (as dos comentarios ficam: o historico nao se apaga). */
function removerFotoDoPlano_(plano, usuario, params) {
  exigirCapacidade(usuario, plano.cap);
  const id = String(params.id || '').trim();
  return comTrava(function () {
    acaoDoPlano_(plano, id);
    removerAnexo(usuario, 'ACOES', id, params.arquivo);
    return { ok: true, recado: 'Foto removida.' };
  });
}

/* ------------------------------------------------------------------ */
/* AS PORTAS DE CADA PLANO (o catalogo ACOES do Codigo.gs aponta aqui) */
/* ------------------------------------------------------------------ */

function acaoSalvarAcao(usuario, params) { return salvarAcaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoConcluirAcao(usuario, params) { return concluirAcaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoComentarAcao(usuario, params) { return comentarAcaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoReabrirAcao(usuario, params) { return reabrirAcaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoCancelarAcao(usuario, params) { return cancelarAcaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoExcluirAcao(usuario, params) { return excluirAcaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoFotoAcao(usuario, params) { return fotoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoRemoverFotoAcao(usuario, params) { return removerFotoDoPlano_(PLANOS.CALENDARIO, usuario, params); }

function acaoSalvarAcaoLimpeza(usuario, params) { return salvarAcaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoConcluirAcaoLimpeza(usuario, params) { return concluirAcaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoComentarAcaoLimpeza(usuario, params) { return comentarAcaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoReabrirAcaoLimpeza(usuario, params) { return reabrirAcaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoCancelarAcaoLimpeza(usuario, params) { return cancelarAcaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoExcluirAcaoLimpeza(usuario, params) { return excluirAcaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoFotoAcaoLimpeza(usuario, params) { return fotoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoRemoverFotoAcaoLimpeza(usuario, params) { return removerFotoDoPlano_(PLANOS.LIMPEZA, usuario, params); }

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
function avisarAcaoNova(campos, email, nova, id, plano) {
  if (!email) return;
  plano = plano || PLANOS.CALENDARIO;
  const limpeza = plano.id === 'LIMPEZA';
  const prazo = formatarData(paraData(campos.PRAZO));
  const assunto = (nova ? (limpeza ? 'Nova ação da limpeza: ' : 'Nova ação: ')
                        : (limpeza ? 'Ação da limpeza atualizada: ' : 'Ação atualizada: ')) + campos.ACAO;
  const onde = [campos.ZONA, campos.LOCAL].filter(Boolean).join(' · ');

  const corpo =
    '<p>Você é ' + (emailsDaAcao_(campos.RESPONSAVEL_EMAIL).length > 1 ? 'um dos responsáveis (' + htmlSeguro(campos.RESPONSAVEL) + ')' : 'o responsável') +
    ' por esta ação do ' + (limpeza ? 'plano de ação da Limpeza CD' : 'plano de ação do GSL') + '.</p>' +
    '<p style="font-size:16px"><strong>' + htmlSeguro(campos.ACAO) + '</strong></p>' +
    (campos.DESCRICAO ? '<p>' + htmlSeguro(campos.DESCRICAO) + '</p>' : '') +
    (limpeza && onde ? '<p>Local: <strong>' + htmlSeguro(onde) + '</strong>' +
      (campos.CRITICIDADE ? ' · criticidade ' + htmlSeguro(campos.CRITICIDADE) : '') + '</p>' : '') +
    '<p>Turno: <strong>' + htmlSeguro(campos.TURNO) + '</strong><br>' +
    'Entregar até: <strong>' + htmlSeguro(prazo) + '</strong></p>' +
    (campos.ORIGEM ? '<p style="color:#666">Origem: ' + htmlSeguro(campos.ORIGEM) + '</p>' : '') +
    rodapeLink(plano.tela);

  enviar([email], assunto, corpo);
}
