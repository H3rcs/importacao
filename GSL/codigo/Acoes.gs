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
 *   - quem CRIA e quem tem "Ver e editar" no Plano de Acao (o gerente). O coordenador ve e
 *     conclui as que sao dele — o plano e feito PARA ele;
 *   - nao ha validacao. Concluiu, acabou. Nao existe o ciclo
 *     entregar/validar das atividades aqui;
 *   - (21/10) cada acao so aparece para quem esta CITADO nela: os
 *     responsaveis e quem foi marcado num comentario. Nem quem cria, nem a
 *     gerencia, nem o administrador veem as outras — ver acoesNoAlcance.
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
  CALENDARIO: { id: 'CALENDARIO', modulo: 'calendario', tela: 'acoes',
                nome: 'Plano de Ação' },
  LIMPEZA:    { id: 'LIMPEZA', modulo: 'limpeza', tela: 'limpeza',
                nome: 'Plano de Ação da Limpeza' }
};

const ACOES_SITUACAO = { PENDENTE: 'PENDENTE', CONCLUIDA: 'CONCLUIDA', CANCELADA: 'CANCELADA' };

const BUILD_ACOES = '2026.11.26';   // carimbo da entrega — ver APP.build no Codigo.gs

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
  const parecer = parecerDe_(r);
  let situacao = String(r.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();

  let status = 'Pendente';
  if (situacao === ACOES_SITUACAO.CANCELADA) status = 'Cancelada';
  // Situacao que ainda nao virou acao (8.13): nao conta como "em aberto", nao atrasa, nao entra no ranking.
  else if (parecer !== PARECERES.TRATAR) { situacao = SITUACAO_DO_PARECER[parecer]; status = STATUS_DO_PARECER[parecer]; }
  else if (situacao === ACOES_SITUACAO.CONCLUIDA) status = 'Concluída';
  else if (prazoISO && diaNumISO(prazoISO) < hojeNum()) status = 'Atrasada';

  // Quantos dias faltam (ou passaram). A tela usa para o "vence em 3 dias".
  let dias = null;
  if (prazoISO && parecer === PARECERES.TRATAR) dias = diaNumISO(prazoISO) - hojeNum();
  const autor = emailsDaAcao_(r.AUTOR)[0] || '', destinatario = emailsDaAcao_(r.DESTINATARIO)[0] || '';
  const tratativa = htmlGuardado_(r.TRATATIVA);

  // Acao conjunta: RESPONSAVEL_EMAIL guarda um ou mais e-mails separados por virgula.
  const responsaveis = emailsDaAcao_(r.RESPONSAVEL_EMAIL);

  return {
    id: String(r.ID || ''),
    acao: String(r.ACAO || '').trim(),
    descricao: htmlGuardado_(r.DESCRICAO),
    responsavel: String(r.RESPONSAVEL || '').trim(),
    responsaveisEmails: responsaveis,
    responsavelEmail: responsaveis[0] || '',
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
    fotos: fotosComLegenda_(r.ANEXOS, r.LEGENDAS),
    // Marcados num comentario (19/10): veem e respondem esta acao. Quem virou responsavel depois sai daqui.
    marcadosEmails: emailsDaAcao_(r.MARCADOS).filter(function (e) { return responsaveis.indexOf(e) === -1; }),
    // SITUACAO E PARECER (8.13). descricao: texto rico (HTML limpo, comeca com "<") ou o texto simples de antes.
    prioridade: prioridadeDe_(r),
    parecer: parecer,
    parecerEm: String(r.PARECER_EM || '').trim(),
    parecerPor: String(r.PARECER_POR || '').toLowerCase().trim(),
    parecerObs: String(r.PARECER_OBS || '').trim(),
    reverEm: isoDe_(r.REVER_EM),
    tratativa: tratativa,
    // Acao de antes da 8.13 (ou criada direto pela tela antiga): o "o que precisa ser feito" esta na DESCRICAO.
    tratativaNaDescricao: !tratativa && parecer === PARECERES.TRATAR && !autor && !destinatario && !!String(r.DESCRICAO || '').trim(),
    autorEmail: autor,
    destinatarioEmail: destinatario,
    relatorio: String(r.RELATORIO || '').trim()
  };
}

/* ------------------------------------------------------------------ */
/* SITUACAO E PARECER DO GERENTE (8.13)                                */
/*                                                                     */
/* O modelo do "Relatorio de Ocorrencias e Acoes" que o gerente mandou: */
/* quem tem "Ver e editar" no plano registra uma SITUACAO (titulo,      */
/* prioridade, descricao em texto rico, fotos com legenda) para um      */
/* gerente (DESTINATARIO). O gerente da o PARECER:                     */
/*   TRATAR  "Tratar / Incluir acao": como sera tratado + responsaveis  */
/*           + prazo — a situacao vira acao, com tudo o que a acao ja   */
/*           tinha (situacoes, comentarios, conclusao com foto);        */
/*   DEPOIS  "Outro momento": postergada (data opcional para rever);    */
/*   NADA    "Nada a fazer": encerrada;                                 */
/*   ''      "Sem definicao": esperando o parecer.                      */
/* QUEM VE continua sendo so quem esta citado — agora tambem o AUTOR    */
/* (quem registrou acompanha o proprio registro) e o DESTINATARIO.     */
/* ------------------------------------------------------------------ */

const PARECERES = { TRATAR: 'TRATAR', DEPOIS: 'DEPOIS', NADA: 'NADA' };
const NOMES_PARECER = { TRATAR: 'Tratar / Incluir ação', DEPOIS: 'Outro momento', NADA: 'Nada a fazer', '': 'Sem definição' };
const SITUACAO_DO_PARECER = { '': 'AGUARDANDO_PARECER', DEPOIS: 'POSTERGADA', NADA: 'SEM_ACAO' };
const STATUS_DO_PARECER = { '': 'Aguardando parecer', DEPOIS: 'Outro momento', NADA: 'Nada a fazer' };
const PRIORIDADES = ['ALTA', 'MEDIA', 'NORMAL'];
const NOMES_PRIORIDADE = { ALTA: 'Alta', MEDIA: 'Média', NORMAL: 'Normal' };
// A criticidade da Limpeza (Alta, Média, Baixa) e a prioridade com outro nome: Baixa = Normal.
const CRITICIDADE_DA_PRIORIDADE = { ALTA: 'Alta', MEDIA: 'Média', NORMAL: 'Baixa' };
const TEXTO_RICO_MAXIMO = 20000;       // caracteres do HTML limpo (descricao ou "como sera tratado")
const LEGENDA_MAXIMA = 140;
const RELATORIO_MAXIMO = 80;

/*
 * O parecer da linha. Linha sem PARECER, sem AUTOR e sem DESTINATARIO e
 * acao de antes da 8.13 (ou de uma tela/Instalacao.gs antigos, ou da
 * importacao da limpeza): e TRATAR — ela ja tinha responsavel e prazo.
 */
function parecerDe_(r) {
  const p = String((r && r.PARECER) || '').toUpperCase().trim();
  if (PARECERES[p]) return p;
  return String((r && r.AUTOR) || '').trim() || String((r && r.DESTINATARIO) || '').trim() ? '' : PARECERES.TRATAR;
}

/* ALTA · MEDIA · NORMAL. Sem PRIORIDADE: a criticidade da limpeza (Baixa = Normal), senao Normal. */
function prioridadeDe_(r) {
  const p = normalizarPrioridade_(r && r.PRIORIDADE);
  if (p) return p;
  if (planoDe_(r) === 'LIMPEZA' && String((r && r.CRITICIDADE) || '').trim()) {
    return normalizarPrioridade_(critLimpeza_(r.CRITICIDADE)) || 'NORMAL';
  }
  return 'NORMAL';
}
function normalizarPrioridade_(v) {
  const t = String(v == null ? '' : v).toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t === 'ALTA' || t === 'URGENTE') return 'ALTA';
  if (t === 'MEDIA' || t === 'ATENCAO') return 'MEDIA';
  if (t === 'NORMAL' || t === 'BAIXA') return 'NORMAL';
  return '';
}

/*
 * TEXTO RICO SEGURO. O editor da tela (negrito, italico, sublinhado,
 * marca-texto e listas) manda HTML; aqui so passa o que formata: b, strong,
 * i, em, u, mark, br, div, p, ul, ol, li — SEM atributo nenhum (nem style,
 * nem on..., nem href). script, style, iframe, svg e companhia saem com o
 * conteudo; qualquer outra etiqueta sai e o texto dela fica (o link vira so
 * o texto). Todo "<" que nao e uma dessas etiquetas vira &lt;. O resultado
 * sempre comeca com "<" (vai dentro de um <div>): e assim que a tela sabe
 * que e HTML — o texto simples das acoes antigas nao comeca com "<".
 * A tela limpa de novo antes de mostrar (quem mexer direto na planilha
 * tambem nao injeta nada).
 */
const TAGS_RICAS_ = { b: 1, strong: 1, i: 1, em: 1, u: 1, mark: 1, br: 1, div: 1, p: 1, ul: 1, ol: 1, li: 1 };
const BLOCOS_PERIGOSOS_ = /<(script|style|iframe|object|embed|noscript|template|textarea|select|svg|math|head|title|xmp|frame|frameset|applet|noembed|plaintext)\b[\s\S]*?(<\/\1\s*>|$)/gi;
function htmlRico_(valor) {
  let s = String(valor == null ? '' : valor);
  if (s.length > TEXTO_RICO_MAXIMO * 3) throw new Error('O texto é grande demais (máximo de ' + TEXTO_RICO_MAXIMO + ' caracteres).');
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(BLOCOS_PERIGOSOS_, '');
  const escapar = function (t) {
    return t.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,30});)/gi, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  let saida = '', pos = 0, m;
  const re = /<[^<>]*>/g;
  while ((m = re.exec(s))) {
    saida += escapar(s.slice(pos, m.index));
    pos = m.index + m[0].length;
    const t = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(m[0]);
    const nome = t ? t[2].toLowerCase() : '';
    if (!TAGS_RICAS_[nome]) continue;
    if (nome === 'br') { if (!t[1]) saida += '<br>'; continue; }
    saida += '<' + t[1] + nome + '>';
  }
  saida += escapar(s.slice(pos));
  saida = saida.trim();
  if (!textoDoHtml_('<div>' + saida + '</div>').trim()) return '';
  if (saida.length > TEXTO_RICO_MAXIMO) throw new Error('O texto é grande demais (máximo de ' + TEXTO_RICO_MAXIMO + ' caracteres).');
  return saida.charAt(0) === '<' ? saida : '<div>' + saida + '</div>';
}

/* O que veio da tela: HTML limpo (rico, ou comecando com "<") ou o texto simples de antes, como esta. */
function campoRico_(valor, rico) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return '';
  if (!rico && s.charAt(0) !== '<') return s;
  return htmlRico_(s);
}

/* O que vai para a tela: o HTML da planilha passa de novo pelo filtro (alguem pode ter mexido nela a mao). */
function htmlGuardado_(valor) {
  const s = String(valor == null ? '' : valor).trim();
  if (!s) return '';
  if (s.charAt(0) !== '<') return s;
  try { return htmlRico_(s); } catch (e) { return ''; }
}

/* HTML (ou texto simples) -> texto simples: e-mails, busca e o resumo do cartao. */
function textoDoHtml_(valor) {
  const s = String(valor == null ? '' : valor);
  if (s.trim().charAt(0) !== '<') return s.trim();
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<li>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (x, n) { return String.fromCharCode(Number(n)); })
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* LEGENDAS: {idDaFoto: "legenda"} — so as fotos que ainda estao na acao. */
function lerLegendas_(valor) {
  try {
    const o = JSON.parse(String(valor || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) { return {}; }
}
function fotosComLegenda_(anexos, legendas) {
  const l = lerLegendas_(legendas);
  return fotosDaCelula_(anexos).map(function (f) { f.legenda = String(l[f.id] || ''); return f; });
}
/*
 * As legendas que vieram da tela: a de cada foto nova (fotos[i].legenda, na
 * ordem em que subiram) e as das fotos que ja estavam (legendas: {id: texto}).
 * mudou: a tela mandou legenda de foto que ja estava (editar).
 */
function legendasDoPedido_(params, fotos, gravadas) {
  const novas = {};
  [].concat((params && params.fotos) || []).filter(function (f) { return f && f.dados; }).forEach(function (f, i) {
    const t = limparLegenda_(f.legenda);
    if (t && gravadas[i]) novas[gravadas[i].id] = t;
  });
  const vieram = params && params.legendas && typeof params.legendas === 'object' && !Array.isArray(params.legendas) ? params.legendas : null;
  const existentes = {};
  if (vieram) Object.keys(vieram).forEach(function (id) { existentes[String(id)] = limparLegenda_(vieram[id]); });
  return { novas: novas, existentes: vieram ? existentes : null, mudou: !!vieram };
}
/* LEGENDAS depois de salvar: as antigas, as editadas (so de foto que esta na acao) e as das fotos novas. */
function juntarLegendas_(atual, legendas) {
  const naAcao = lerAnexos_(atual.ANEXOS).map(function (a) { return a.id; });
  const base = lerLegendas_(atual.LEGENDAS), saida = {};
  naAcao.forEach(function (id) {
    const t = legendas.existentes && Object.prototype.hasOwnProperty.call(legendas.existentes, id) ? legendas.existentes[id] : limparLegenda_(base[id]);
    if (t) saida[id] = t;
  });
  Object.keys(legendas.novas).forEach(function (id) { saida[id] = legendas.novas[id]; });
  return JSON.stringify(saida);
}
function limparLegenda_(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, LEGENDA_MAXIMA); }

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

/*
 * As acoes de UM plano so com o que a linha tem (sem comentarios nem nomes).
 * E o que a contagem precisa: a bolinha do menu usa so isto; a tela usa isto
 * e acrescenta o historico (listarAcoes). Uma leitura da aba ACOES.
 */
function acoesDoPlano_(idPlano) {
  const plano = PLANOS[idPlano] ? idPlano : 'CALENDARIO';
  return listar('ACOES').filter(function (r) { return planoDe_(r) === plano; }).map(hidratarAcao);
}

/* As acoes de UM plano (o do Calendario, se nada for dito). */
function listarAcoes(idPlano) {
  const plano = PLANOS[idPlano] ? idPlano : 'CALENDARIO';
  return comHistorico_(plano, acoesDoPlano_(plano));
}

/*
 * O historico (comentarios), quem criou e os marcados, com o nome do
 * cadastro. A tela so pede o das acoes que a pessoa ve (21/10): o das outras
 * nem e montado.
 */
function comHistorico_(plano, acoes) {
  const coment = comentariosPorAcao_(origensDoPlano_(plano));
  const pessoas = pessoasPorEmail_();
  // Marcados e mencoes vao com o nome do cadastro: a tela destaca o @Nome e lista os marcados (19/10).
  const comNome = function (e) { return { email: e, nome: nomeDoEmail_(pessoas, e) }; };
  return acoes.map(function (a) {
    a.comentarios = (coment[a.id] || []).map(function (c) { c.mencoes = c.mencoes.map(comNome); return c; });
    a.criadoPorNome = nomeDoEmail_(pessoas, a.criadoPor);
    a.marcados = a.marcadosEmails.map(comNome);
    return a;
  });
}

/* { email: {nome, papel} } de quem tem cadastro em ACESSOS. */
function pessoasPorEmail_() {
  const m = {};
  try {
    cadastrosDeAcesso_().forEach(function (l) {      // do cache, sem reler ACESSOS
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
 * O registro que o sistema escreve sozinho ao concluir, reabrir ou cancelar
 * sem texto. Nao e comentario de ninguem: o selo e o "Comentarios (N)" da
 * tela nao contam (antes "Comentarios (1)" aparecia sem ninguem ter escrito).
 */
const TEXTOS_AUTOMATICOS = { CONCLUSAO: 'Ação concluída.', REABERTURA: 'Ação reaberta.', CANCELAMENTO: 'Ação cancelada.' };
/*
 * Os que a Limpeza antiga (LP_ACOES, entregas de 02/10 a 09/10) escrevia
 * sozinha: mudar a situacao pela edicao e concluir sem evidencia. Com a
 * evidencia ("Concluida em ... · evidencia: ...") alguem escreveu: conta.
 */
const AUTOMATICOS_LP_ACOES = [
  { tipos: ['STATUS', 'CONCLUSAO', 'CANCELAMENTO'], texto: /^Situação alterada de .+ para .+ \(edição da ação\)\.$/ },
  { tipos: ['CONCLUSAO'], texto: /^Concluída em \d{2}\/\d{2}\/\d{4}$/ }
];
function ehAutomatico_(origem, tipo, texto) {
  // O parecer sem observacao (8.13) e registro do sistema: "Parecer: Outro momento."
  if (tipo === 'PARECER') return Object.keys(NOMES_PARECER).some(function (k) { return texto === textoDoParecer_(k); });
  return TEXTOS_AUTOMATICOS[tipo] === texto || (origem === 'LP_ACOES' &&
    AUTOMATICOS_LP_ACOES.some(function (a) { return a.tipos.indexOf(tipo) !== -1 && a.texto.test(texto); }));
}

/*
 * Os comentarios das acoes da limpeza que vieram da tabela antiga (LP_ACOES)
 * continuam gravados com aquela ORIGEM — a acao manteve o mesmo ID ao passar
 * para o Plano de Acao, entao basta ler as duas origens.
 */
function origensDoPlano_(idPlano) { return idPlano === 'LIMPEZA' ? ['ACOES', 'LP_ACOES'] : ['ACOES']; }

/* { idDaAcao: [ {em, autor, nome, texto, situacao, depende, fotos, mencoes, automatico}, ... mais antigo primeiro ] } */
function comentariosPorAcao_(origens) {
  const aceitas = [].concat(origens || 'ACOES');
  const mapa = {};
  let linhas = [];
  try { linhas = listar('COMENTARIOS'); } catch (e) { return mapa; }   // banco ainda sem a tabela
  linhas.forEach(function (c) {
    if (aceitas.indexOf(String(c.ORIGEM || '')) === -1) return;
    const id = String(c.ACAO_ID || '');
    const tipo = String(c.TIPO || 'COMENTARIO').toUpperCase(), texto = String(c.TEXTO || '');
    (mapa[id] = mapa[id] || []).push({
      id: String(c.ID || ''), em: String(c.CRIADO_EM || ''),
      // Quem comentou: e-mail da SESSAO (nunca vem da tela), nome e funcao do cadastro.
      autor: String(c.AUTOR || c.CRIADO_POR || ''),
      nome: String(c.AUTOR_NOME || '') || nomeDaPessoa(String(c.AUTOR || c.CRIADO_POR || ''), ''),
      papel: String(c.AUTOR_PAPEL || ''),
      tipo: tipo, texto: texto, situacao: String(c.SITUACAO || ''), depende: String(c.DEPENDE || ''),
      fotos: fotosDaCelula_(c.ANEXOS),
      mencoes: emailsDaAcao_(c.MENCOES),                    // quem foi marcado neste comentario (19/10)
      automatico: ehAutomatico_(String(c.ORIGEM || ''), tipo, texto)
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
  const r = buscarAcesso(email);       // nome, papel e turno do cache: o PIN nao interessa aqui
  const nome = (r && String(r.NOME || '').trim()) || nomeDaPessoa(email, usuario.simulado ? '' : usuario.nome);
  const turno = r ? String(r.TURNO || '').toUpperCase().trim() : '';
  let papel = r ? [String(r.PAPEL || '').trim(), turno ? 'turno ' + turno : ''].filter(Boolean).join(' · ')
                : String((usuario.simulado ? '' : usuario.papel) || (String(usuario.perfil || '').toUpperCase() === 'ADMIN' ? 'Administrador' : ''));
  if (usuario.simulado) papel = [papel || 'Administrador', 'simulando ' + usuario.perfil].join(' · ');
  return { email: email, nome: nome, papel: papel };
}

/*
 * tipo: COMENTARIO · CONCLUSAO · REABERTURA · CANCELAMENTO · STATUS. fotos: metadados ja gravados no Drive.
 * mencoes: e-mails de quem foi marcado no comentario (19/10). Devolve o autor (o aviso de mencao usa).
 */
function gravarComentario_(usuario, origem, idAcao, texto, situacao, depende, tipo, fotos, mencoes) {
  const autor = autorDoComentario_(usuario);
  inserir('COMENTARIOS', {
    ORIGEM: origem, ACAO_ID: idAcao, TEXTO: texto, SITUACAO: situacao || '', DEPENDE: depende || '',
    AUTOR: autor.email, AUTOR_NOME: autor.nome, AUTOR_PAPEL: autor.papel, TIPO: tipo || 'COMENTARIO',
    ANEXOS: fotos && fotos.length ? JSON.stringify(fotos) : '',
    MENCOES: (mencoes || []).join(',')
  }, autor.email);
  return autor;
}

/*
 * Cuida da acao (conclui, muda a situacao e o "depende de"): um dos
 * responsaveis, ou quem gere o plano numa acao que ele VE (21/10: marcado
 * nela, ou a acao sem responsavel). A gestao que nao esta citada nem enxerga
 * a acao — nao cuida dela.
 */
function ehResponsavelOuGestor_(plano, usuario, registro) {
  const eu = String(usuario.email || '').toLowerCase().trim();
  return emailsDaAcao_(registro.RESPONSAVEL_EMAIL).indexOf(eu) !== -1 ||
    (gereOPlano_(plano, usuario) && podeVerRegistro_(plano, usuario, registro));
}

/* So os responsaveis pela acao ou quem gere o plano (e ve a acao). */
function exigirResponsavelOuGestor_(plano, usuario, registro, mensagem) {
  if (!ehResponsavelOuGestor_(plano, usuario, registro)) throw new Error(mensagem);
}

/* Comentar: quem ve a acao — os responsaveis e quem foi marcado num comentario dela (19/10); ver acoesNoAlcance. */
function exigirQuemComenta_(plano, usuario, registro) {
  if (!podeVerRegistro_(plano, usuario, registro)) {
    throw new Error('Só os responsáveis pela ação e quem foi marcado nela podem comentar.');
  }
}

const MENCOES_POR_COMENTARIO = 10;

/*
 * MARCAR PESSOA (19/10). Quem foi marcado no comentario, conferido antes de
 * gravar, subir foto ou mandar e-mail: so quem abre o Plano de Acao nesta
 * filial (a lista do campo Responsaveis, menos quem nao abre o painel dele:
 * o Oculto e so do administrador). Fora dela o comentario inteiro e
 * recusado — a tela so oferece essa lista. A recusa da o nome so de quem e
 * desta filial (os outros voltam pelo e-mail): ela nao e consulta ao
 * cadastro mestre. Devolve as pessoas como pessoasParaAcao as da (gere:
 * gere o plano — so isso nao faz ver a acao, 21/10). Marcar a si mesmo nao conta.
 */
function mencoesDoPedido_(plano, usuario, params) {
  const eu = String(usuario.email || '').toLowerCase().trim();
  const emails = emailsDaAcao_([].concat(params.mencoes || []).join(','))
    .filter(function (e) { return e !== eu; });
  if (emails.length > MENCOES_POR_COMENTARIO) throw new Error('Marque no máximo ' + MENCOES_POR_COMENTARIO + ' pessoas por comentário.');
  if (!emails.length) return [];
  // Instalacao.gs de antes (esquema sem MARCADOS/MENCOES): a marcacao sumiria calada e o e-mail prometeria um acesso que nao vem.
  if (colunasDe('ACOES').indexOf('MARCADOS') === -1 || colunasDe('COMENTARIOS').indexOf('MENCOES') === -1) {
    throw new Error('Atualização incompleta do GSL: para marcar pessoas, o Instalacao.gs desta versão precisa estar no Apps Script. Avise o administrador do sistema.');
  }
  const podem = pessoasParaAcao(plano);
  const achar = function (e) { return podem.filter(function (p) { return p.email === e && p.abre; })[0]; };
  const fora = emails.filter(function (e) { return !achar(e); });
  if (fora.length) {
    const daFilial = {};
    pessoasDaFilial().forEach(function (p) { daFilial[String(p.EMAIL || '').toLowerCase().trim()] = String(p.NOME || '').trim(); });
    throw new Error('Não dá para marcar quem não abre o ' + plano.nome + ' nesta filial: ' +
      fora.map(function (e) { return daFilial[e] || e; }).join(', ') + '.');
  }
  return emails.map(achar);
}

/* O que o comentario de quem cuida da acao muda nela: o andamento, o "depende de" ou a conclusao. */
function camposDoComentario_(usuario, atual, texto, situacao, depende) {
  const campos = {};
  if (situacao && situacao !== 'Concluída') campos.ANDAMENTO = situacao;
  if (situacao !== 'Concluída') campos.DEPENDE = situacao === 'Em andamento' && !depende ? '' : depende;
  if (situacao === 'Concluída' && atual !== ACOES_SITUACAO.CONCLUIDA) {
    campos.SITUACAO = ACOES_SITUACAO.CONCLUIDA; campos.CONCLUIDO_EM = agoraTexto(); campos.CONCLUIDO_POR = usuario.email;
    campos.OBSERVACAO = texto; campos.ANDAMENTO = 'Concluída'; campos.DEPENDE = '';
  }
  return campos;
}

/*
 * Comentar uma acao do Plano: quem avancou registra o que fez, em que
 * situacao a acao ficou e do que ela depende para concluir — com foto, se
 * quiser. Pode comentar quem e responsavel por ela, quem gere o plano e
 * quem foi marcado num comentario dela (19/10) — este so comenta: a
 * situacao e o "depende de" ficam com os responsaveis e a gestao.
 * "Concluída" conclui a acao (mesma regra do botao Concluir).
 * Marcar pessoas (mencoes): elas passam a ver e responder a acao (MARCADOS,
 * gravado na trava) e recebem um e-mail cada uma, depois da trava.
 */
function comentarAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const texto = String(params.texto || '').trim();
  const situacao = String(params.situacao || '').trim();
  const depende = String(params.depende || '').trim();
  if (!texto) throw new Error('Escreva o comentário: o que avançou, o que foi feito.');
  if (situacao && ANDAMENTOS_ACAO.indexOf(situacao) === -1) throw new Error('Situação inválida: ' + situacao);
  const fotos = fotosDoPedido_(params);
  const emailDe = function (p) { return p.email; };

  // Confere ANTES de subir as fotos (o Drive e lento e fica fora da trava)...
  const antes = acaoDoPlano_(plano, id);
  exigirQuemComenta_(plano, usuario, antes);
  if (String(antes.SITUACAO || '').toUpperCase().trim() === ACOES_SITUACAO.CANCELADA) throw new Error('Esta ação foi cancelada. Atualize a tela.');
  // ...e quem foi marcado, so depois de saber que a pessoa comenta nesta acao (a recusa diz nomes).
  const marcadas = mencoesDoPedido_(plano, usuario, params);
  const gravadas = gravarFotos_(usuario, id, fotos);

  // ...e de novo na trava, que e onde vale: a tela pode estar velha.
  let feito;
  try {
    feito = comTrava(function () {
      const registro = acaoDoPlano_(plano, id);
      exigirQuemComenta_(plano, usuario, registro);
      const atual = String(registro.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
      if (atual === ACOES_SITUACAO.CANCELADA) throw new Error('Esta ação foi cancelada. Atualize a tela.');
      // A situacao que ainda nao virou acao (8.13) so recebe comentario: andamento, "depende de" e concluir sao da acao.
      const ehAcao = parecerDe_(registro) === PARECERES.TRATAR;
      const cuida = ehAcao && ehResponsavelOuGestor_(plano, usuario, registro);
      const campos = cuida ? camposDoComentario_(usuario, atual, texto, situacao, depende) : {};
      const concluiu = campos.SITUACAO === ACOES_SITUACAO.CONCLUIDA;
      // Marcada que ainda nao era citada (responsavel, marcada, autor ou destinatario) passa a ver e a responder a acao.
      const jaMarcados = emailsDaAcao_(registro.MARCADOS), responsaveis = emailsDaAcao_(registro.RESPONSAVEL_EMAIL);
      const daSituacao = citadosDaSituacao_(registro);
      const novas = marcadas.filter(function (p) {
        return jaMarcados.indexOf(p.email) === -1 && responsaveis.indexOf(p.email) === -1 && daSituacao.indexOf(p.email) === -1;
      });
      if (novas.length) campos.MARCADOS = jaMarcados.concat(novas.map(emailDe)).join(',');
      // Ja via antes de ser marcada so quem gere o plano, na acao em que ninguem esta citado (21/10).
      const jaVia = function (p) { return p.gere && !responsaveis.length && !daSituacao.length; };
      // A acao primeiro, o historico depois: se a acao nao gravar, nada fica apontando para fotos jogadas fora.
      if (Object.keys(campos).length) atualizar('ACOES', id, campos, usuario.email);
      const autor = gravarComentario_(usuario, 'ACOES', id, texto, cuida ? situacao : '',
        cuida && situacao !== 'Concluída' ? depende : '', concluiu ? 'CONCLUSAO' : 'COMENTARIO', gravadas, marcadas.map(emailDe));
      return { autor: autor, acao: Object.assign({}, registro, campos), concluiu: concluiu,
               passaramAVer: novas.filter(function (p) { return !jaVia(p); }).map(emailDe) };
    });
  } catch (e) { jogarFotosFora_(gravadas); throw e; }

  const falhas = avisarMarcadas_(plano, feito, texto, marcadas);
  const avisadas = marcadas.length - falhas.length;
  const r = { recado: (feito.concluiu ? 'Comentário registrado e ação concluída.' : 'Comentário registrado.') +
    (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') +
    (avisadas === 1 ? ' 1 pessoa marcada foi avisada por e-mail.' : avisadas > 1 ? ' ' + avisadas + ' pessoas marcadas foram avisadas por e-mail.' : '') };
  if (falhas.length) r.avisoEmail = 'Comentário registrado, mas o aviso por e-mail não saiu para: ' + falhas.join('; ');
  return r;
}

/*
 * Um e-mail para cada pessoa marcada, DEPOIS da trava (o comentario ja esta
 * gravado). A falha nao derruba o comentario — mas tambem nao some calada
 * (a regra da acao nova): volta a lista de quem ficou sem o aviso.
 */
function avisarMarcadas_(plano, feito, texto, marcadas) {
  const falhas = [];
  marcadas.forEach(function (p) {
    try { avisarMencao_(plano, feito.acao, feito.autor, texto, p.email, feito.passaramAVer.indexOf(p.email) !== -1); }
    catch (e) { falhas.push(p.email + ' (' + (e.message || e) + ')'); }
  });
  return falhas;
}

/**
 * O que cada pessoa enxerga — QUEM ESTA CITADO NA ACAO (21/10).
 *
 * Pedido do gerente: "as acoes so devem aparecer pras pessoas que estao
 * citadas na acao". Citado e quem e responsavel (sozinho ou junto com
 * outros) e quem foi marcado num comentario dela (19/10: marcar e chamar a
 * pessoa para a conversa daquela acao — ver e responder; concluir, nao).
 * So eles veem a acao: titulo, descricao, comentarios, fotos e historico,
 * nos dois planos e em todo lugar que mostra acao (a lista e os filtros, o
 * "Em aberto", a bolinha do menu, a Gestao da Limpeza, o link do e-mail, as
 * fotos). Quem gere o plano ("Ver e editar" na tela dele), o administrador
 * e quem tem escopo TODOS (gerencia, consulta) NAO veem mais todas — antes
 * viam. Gerir continua sendo criar, e editar, reabrir, cancelar e excluir
 * as que a pessoa ve.
 *
 * A unica excecao e a acao SEM responsavel com e-mail (as que vieram da
 * planilha antiga da limpeza traziam so o nome): ninguem esta citado nela,
 * e ela sumiria para todo mundo sem ter como receber um responsavel. Essa
 * fica com quem gere o plano (e com quem for marcado nela), ate a gestao
 * escolher o responsavel em Editar — dai em diante vale a regra.
 */
/*
 * "Gere o plano" = tem "Ver e editar" na tela do plano (Plano de Acao, ou
 * Limpeza CD). E a matriz que diz; aqui so se usa a resposta para as regras
 * do plano (a acao sem responsavel fica com quem gere; o ranking inteiro).
 */
function gereOPlano_(plano, usuario) {
  return podeEditar(usuario, plano.tela);
}

function acoesNoAlcance(usuario, todas, plano) {
  plano = plano || PLANOS.CALENDARIO;
  const email = String(usuario.email || '').toLowerCase().trim();
  const gere = gereOPlano_(plano, usuario);
  return todas.filter(function (a) {
    return vePelaCitacao_(email, gere, a.responsaveisEmails, a.marcadosEmails, [a.autorEmail, a.destinatarioEmail].filter(Boolean));
  });
}

/*
 * A regra, sobre as listas de e-mails da acao. gere: a pessoa gere o plano
 * (so conta na acao em que ninguem esta citado). outros (8.13): o AUTOR da
 * situacao (quem registrou acompanha o proprio registro) e o DESTINATARIO (o
 * gerente que da o parecer). A situacao nova nasce sem responsavel, mas com
 * os dois — por isso a excecao da acao sem responsavel nao vale para ela:
 * so para a linha antiga em que ninguem esta citado.
 */
function vePelaCitacao_(email, gere, responsaveis, marcados, outros) {
  if (!email) return false;
  const extras = outros || [];
  return responsaveis.indexOf(email) !== -1 || marcados.indexOf(email) !== -1 || extras.indexOf(email) !== -1 ||
    (gere && !responsaveis.length && !extras.length);
}

/* O autor e o destinatario da linha crua (8.13). */
function citadosDaSituacao_(registro) {
  return emailsDaAcao_(registro.AUTOR).slice(0, 1).concat(emailsDaAcao_(registro.DESTINATARIO).slice(0, 1));
}

/* A mesma regra, para UMA acao (foto pedida pela tela). */
function podeVerAcao_(plano, usuario, acao) {
  return acoesNoAlcance(usuario, [acao], plano).length === 1;
}

/* A mesma regra, na linha crua da planilha (o que grava confere nela, de novo dentro da trava). */
function podeVerRegistro_(plano, usuario, registro) {
  return vePelaCitacao_(String(usuario.email || '').toLowerCase().trim(), gereOPlano_(plano, usuario),
    emailsDaAcao_(registro.RESPONSAVEL_EMAIL), emailsDaAcao_(registro.MARCADOS), citadosDaSituacao_(registro));
}

/*
 * A acao deste plano, se a pessoa a ve. A que ela nao ve "nao existe" — a
 * mesma recusa do ID errado e da porta do outro plano: editar, reabrir,
 * cancelar, excluir ou tirar foto de uma acao em que nao se esta citado nao
 * passa nem conta que ela existe.
 */
function acaoQueVe_(plano, usuario, id) {
  const r = acaoDoPlano_(plano, id);
  if (!podeVerRegistro_(plano, usuario, r)) throw new Error('Ação não encontrada. Atualize a tela.');
  return r;
}

/**
 * RANKING POR TURNO — pedido para as auditorias.
 *
 * Quantas acoes cada turno propos e quantas fechou. O percentual e de
 * CONCLUSAO, nao de proposta: propor muito e concluir pouco nao e
 * desempenho, e fila.
 *
 * So numeros, sem nenhuma acao: por isso quem gere o plano ve o ranking do
 * plano INTEIRO, tambem das acoes em que nao esta citado (21/10 — e o
 * numero das auditorias). Os demais, o das acoes que veem.
 */
function rankingAcoesPorTurno(acoes) {
  const mapa = {};
  ACOES_TURNOS.forEach(function (t) {
    mapa[t] = { turno: t, total: 0, concluidas: 0, pendentes: 0, atrasadas: 0, canceladas: 0 };
  });

  // So o que virou acao (8.13): a situacao sem parecer, postergada ou "nada a fazer" nao foi proposta a turno nenhum.
  acoes.filter(function (a) { return a.parecer === undefined || a.parecer === PARECERES.TRATAR; }).forEach(function (a) {
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

/*
 * Os numeros do topo do plano ("Em aberto", "Atrasadas", "Sob sua
 * responsabilidade", "Concluidas"). A tela E a bolinha do menu usam ESTA
 * funcao, sobre a MESMA lista (acoesNoAlcance): o numero da bolinha e
 * sempre o "Em aberto" que a pessoa ve ao abrir o plano — e o numero de
 * cartoes da lista dela (21/10: so as acoes em que esta citada, tambem para
 * a gestao; o plano inteiro so no ranking e no "no plano inteiro" da Gestao
 * da Limpeza, que nao mostram acao nenhuma).
 */
function contagensDoPlano_(minhas, email) {
  const abertas = minhas.filter(function (a) { return a.situacao === ACOES_SITUACAO.PENDENTE; });
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter(function (a) { return a.status === 'Atrasada'; }).length,
    minhas: abertas.filter(function (a) { return ehDonoDaAcao_(a, email); }).length,
    concluidas: minhas.filter(function (a) { return a.situacao === ACOES_SITUACAO.CONCLUIDA; }).length,
    // 8.13: as situacoes que esperam o MEU parecer (sou o gerente destinatario) — entram na bolinha.
    parecer: minhas.filter(function (a) { return a.situacao === SITUACAO_DO_PARECER[''] && a.destinatarioEmail === email; }).length
  };
}

/*
 * BOLINHA DO MENU (10/10) — acoes em aberto de cada modulo, para quem esta
 * usando: { calendario: {abertas, atrasadas, minhas}, limpeza: {...} }, so
 * dos planos cuja tela a pessoa abre NESTA filial (telasDe: nivel, ajuste
 * por modulo e painel). O caminho e o da tela: acoesDoPlano_ ->
 * acoesNoAlcance -> contagensDoPlano_ (21/10: so as acoes em que a pessoa
 * esta citada — a gestao tambem).
 *
 * Guardado numa chave SO por pessoa e filial (o cache tambem guarda as
 * sessoes e as telas de todo mundo; uma chave por geracao encheria o cache a
 * cada gravacao). A marca vai DENTRO do valor: mudou qualquer parte, conta de
 * novo. Ela leva a geracao da tabela ACOES (e nao a de todos os dados: uma
 * leitura de nobreak nao recontava as acoes de todo mundo), o dia, as telas
 * que a pessoa abre, o nivel, os ajustes, o escopo, o turno e a simulacao.
 * Vale 10 min, como as telas: o que for mexido direto na planilha aparece na
 * bolinha junto com a tela.
 */
const VALIDADE_PENDENCIAS = 600;

function pendenciasDoUsuario_(usuario) {
  exigirPorta_();
  const email = String(usuario.email || '').toLowerCase().trim();
  const chave = 'pend|' + filialAtual().codigo + '|' + email;
  const telas = telasDe(usuario);
  // 'citados' (21/10): a bolinha guardada com a regra de antes (a gestao contava todas) nao volta depois da atualizacao.
  // 'pareceres' (8.13): a de antes nao tinha as situacoes que esperam o parecer.
  const marca = ['citados', 'pareceres', APP.build, geracaoTabela('ACOES'), paraISO(hoje()), telas.map(function (t) { return t.id; }).join(','),
                 usuario.perfil, usuario.chaveModulos || '', escopoDe(usuario).tipo, usuario.turno || '',
                 usuario.simulado ? 'simulado' : ''].join('|');
  const cache = CacheService.getScriptCache();
  try {
    const g = JSON.parse(cache.get(chave) || 'null');
    if (g && g.marca === marca && g.pendencias) return g.pendencias;
  } catch (e) { /* recalcula */ }
  const saida = {};
  Object.keys(PLANOS).forEach(function (k) {
    const plano = PLANOS[k];
    if (!telas.some(function (t) { return t.id === plano.tela; })) return;   // nao abre o plano: sem bolinha
    const c = contagensDoPlano_(acoesNoAlcance(usuario, acoesDoPlano_(plano.id), plano), email);
    saida[plano.modulo] = { abertas: c.abertas, atrasadas: c.atrasadas, minhas: c.minhas, parecer: c.parecer };
  });
  try { cache.put(chave, JSON.stringify({ marca: marca, pendencias: saida }), VALIDADE_PENDENCIAS); } catch (e) { /* sem cache, segue */ }
  return saida;
}

/*
 * Porta da bolinha (executarAcao 'pendencias'): so leitura, sem capacidade — cada um ve os proprios
 * numeros. O menu vai junto (19/10): quem ja estava dentro quando um painel foi ligado ou desligado
 * ve a mudanca ao voltar ao menu, sem F5.
 */
function acaoPendencias(usuario) {
  return { ok: true, pendencias: pendenciasDoUsuario_(usuario),
           menu: { filial: filialAtual().codigo, telas: telasDe(usuario), modulos: modulosDe(usuario) } };
}

/** Dados da tela Plano de Acao (o do Calendario). */
function dadosAcoes(usuario, params) { return dadosPlano_(PLANOS.CALENDARIO, usuario, params); }

/* Os dados de um plano — a tela do Calendario e a aba Plano de Acao da Limpeza usam o mesmo. */
function dadosPlano_(plano, usuario, params) {
  const filtroTurno = String((params && params.turno) || '').toUpperCase().trim();
  // 8.13: sem filtro pedido, vem TUDO o que a pessoa ve — a tela filtra por parecer e por situacao (com os contadores).
  const filtroSituacao = String((params && params.situacao) || 'TODAS').toUpperCase().trim();
  const busca = String((params && params.busca) || '').toLowerCase().trim();

  // So as acoes em que a pessoa esta citada (21/10), e so delas o historico.
  const todas = acoesDoPlano_(plano.id);
  const minhas = comHistorico_(plano.id, acoesNoAlcance(usuario, todas, plano));
  const gere = gereOPlano_(plano, usuario);

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
      return (a.acao + ' ' + textoDoHtml_(a.descricao) + ' ' + textoDoHtml_(a.tratativa) + ' ' + a.responsavel + ' ' +
              a.origem + ' ' + a.zona + ' ' + a.local + ' ' + a.relatorio)
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

  /*
   * Os numeros que nao mostram acao nenhuma (21/10): quem gere o plano ve o
   * ranking por turno e o total em aberto/atrasadas do plano INTEIRO. Os
   * cartoes do topo e a bolinha continuam sendo os da lista dele.
   */
  const geral = gere ? contagensDoPlano_(todas, email) : null;
  return {
    lista: lista,
    contagens: contagensDoPlano_(minhas, email),
    geral: geral ? { abertas: geral.abertas, atrasadas: geral.atrasadas, total: todas.length } : null,
    ranking: rankingAcoesPorTurno(gere ? todas : minhas),
    turnos: ACOES_TURNOS,
    pessoas: pessoasParaAcao(plano),
    filtro: { turno: filtroTurno, situacao: filtroSituacao, busca: busca },
    plano: plano.id,
    fotos: { porVez: FOTOS_POR_VEZ, porAcao: FOTOS_POR_ACAO },
    // 8.13: o modelo de situacao e parecer. situacoes: false com o Instalacao.gs de antes (sem as colunas) — a tela so tem a acao direta.
    modelo: {
      situacoes: colunasDe('ACOES').indexOf('PARECER') !== -1,
      prioridades: PRIORIDADES.map(function (p) { return { id: p, nome: NOMES_PRIORIDADE[p] }; }),
      pareceres: NOMES_PARECER,
      relatorios: minhas.map(function (a) { return a.relatorio; })
        .filter(function (r, i, l) { return r && l.indexOf(r) === i; }).sort(),
      filial: filialAtual().nome,
      legendaMaxima: LEGENDA_MAXIMA
    },
    hoje: paraISO(hoje()),
    permissoes: {
      gerir: gere,
      // "Ver e editar" na tela do plano: sem isto (so "Ver"), nem o responsavel conclui ou comenta — a tela e so leitura.
      editar: podeEditar(usuario, plano.tela),
      email: email
    }
  };
}

/*
 * Quem aparece na lista: gente ativa no cadastro de acessos que ENXERGA a
 * tela do plano (Ver ou Ver e editar na matriz). Acao da limpeza dada a quem
 * nao ve a Limpeza chegava por e-mail e a pessoa nao tinha onde abrir. A
 * mesma lista e a de quem pode ser marcado num comentario (19/10).
 * edita: "Ver e editar" na tela do plano — so quem edita pode ser RESPONSAVEL
 * (o responsavel conclui a acao; com "Ver" ele nao conseguiria). gere: a pessoa gere o plano
 * (21/10: isso nao a faz ver as acoes — so a acao sem responsavel; a tela
 * avisa "passa a ver esta ação" para quem ainda nao esta citado).
 * abre: o painel do plano aparece para a pessoa nesta filial (Oculto: so o
 * administrador). Quem nao abre continua podendo ser responsavel (a acao
 * fica pronta antes de o painel ser mostrado), mas nao pode ser marcado: o
 * e-mail prometeria um acesso que ela nao tem.
 */
function pessoasParaAcao(plano) {
  return pessoasDaFilial()
    .filter(function (p) {
      return marcado(p.ATIVO) &&
             String(p.SITUACAO || '').toUpperCase().trim() !== 'RECUSADO';
    })
    .map(function (p) { return { linha: p, u: usuarioDoCadastro_(p) }; })
    .filter(function (x) { return !plano || (x.u && nivelNaMatriz(x.u, plano.tela) !== NIVEL_OCULTO); })
    .map(function (x) {
      const p = x.linha;
      return {
        email: String(p.EMAIL || '').toLowerCase().trim(),
        nome: String(p.NOME || '').trim() || String(p.EMAIL || '').split('@')[0],
        turno: String(p.TURNO || '').toUpperCase().trim(),
        papel: String(p.PAPEL || '').trim(),
        gere: !!(plano && x.u) && nivelNaMatriz(x.u, plano.tela) === NIVEL_EDITAR,
        edita: !!(plano && x.u) && nivelNaMatriz(x.u, plano.tela) === NIVEL_EDITAR,
        abre: !plano || !!(x.u && podeVer(x.u, plano.tela)),
        // 8.13: sugestao para "Gerente / destinatario" (a tela poe estes primeiro) — nivel GERENTE ou funcao de gerente.
        gerente: String(p.PERFIL || '').toUpperCase().trim() === 'GERENTE' || /gerent/i.test(String(p.PAPEL || ''))
      };
    })
    .filter(function (p) { return !!p.email; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/* O usuario que o cadastro monta (nivel e ajuste por menu); null para quem ainda nao tem nivel. */
function usuarioDoCadastro_(p) {
  const perfil = String(p.PERFIL || '').toUpperCase().trim();
  if (!perfil || perfil === PERFIL_PADRAO_NOVO_USUARIO) return null;
  return montarUsuario({ email: String(p.EMAIL || '').toLowerCase().trim(), perfil: perfil,
    modulos: String(p.MODULOS || '').trim(), ajustes: String(p.AJUSTES || '').trim() });
}

/* ------------------------------------------------------------------ */
/* ESCRITA                                                             */
/* ------------------------------------------------------------------ */

/*
 * MARCADOS ao editar a acao (19/10). A gestao desmarca quem foi marcado por
 * engano (desmarcados: os que ela tirou na tela) e quem virou responsavel
 * sai da lista (deixando de ser responsavel, deixa de ver). So tira: nenhum
 * e-mail entra por aqui. Vai como "os que sairam", e nao "os que ficam",
 * para nao derrubar quem outra pessoa marcou com o formulario aberto. Tela
 * antiga (sem a lista) nao desmarca ninguem.
 */
function marcadosQueFicam_(marcados, responsaveis, desmarcados) {
  const saem = responsaveis.concat(emailsDaAcao_([].concat(desmarcados || []).join(',')));
  return marcados.filter(function (e) { return saem.indexOf(e) === -1; });
}

/*
 * Cria ou edita. So quem gere o plano ("Ver e editar" no Plano de Acao ou
 * na Limpeza CD; a porta confere) — combinado: o gerente cria. Editar, so a acao
 * que a pessoa ve (21/10: citada nela, ou a acao sem responsavel). Quem
 * cria e nao fica entre os responsaveis nao ve mais a acao depois de
 * salvar — o recado diz para quem ela aparece.
 */
function salvarAcaoDoPlano_(plano, usuario, params) {

  const titulo = String(params.acao || '').trim();
  if (!titulo) throw new Error('Informe a ação.');

  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data de entrega.');

  const turno = String(params.turno || 'Todos').trim();
  if (ACOES_TURNOS.indexOf(turno) === -1) throw new Error('Turno inválido: ' + turno);

  let id = String(params.id || '').trim();
  const nova = !id;
  // Existe, e deste plano e a pessoa a ve? Confere antes de tudo (e antes de subir foto para o Drive).
  const antes = nova ? null : acaoQueVe_(plano, usuario, id);
  // 8.13: aqui so a ACAO (parecer Tratar). A situacao sem esse parecer se edita em salvarSituacao e vira acao no parecer.
  if (antes && parecerDe_(antes) !== PARECERES.TRATAR) {
    throw new Error('Esta situação ainda não virou ação: o gerente dá o parecer “Tratar / Incluir ação”. Atualize a tela.');
  }
  const modelo = colunasDe('ACOES').indexOf('PARECER') !== -1;

  // Um ou mais responsaveis (acao conjunta) — gente que enxerga o plano.
  // Quem ja era responsavel continua valendo (pode ter perdido o acesso depois).
  const emails = emailsDaAcao_([].concat(params.responsaveisEmails || [], params.responsavelEmail || []).join(','));
  const pessoas = pessoasParaAcao(plano);
  const jaEram = antes ? emailsDaAcao_(antes.RESPONSAVEL_EMAIL) : [];
  const fora = emails.filter(function (e) {
    return jaEram.indexOf(e) === -1 && !pessoas.some(function (p) { return p.email === e; });
  });
  if (fora.length) throw new Error('Sem acesso ao ' + plano.nome + ' nesta filial: ' + fora.join(', ') + '. Escolha alguém da lista.');
  // O responsavel conclui a acao: quem so tem "Ver" na tela do plano nao conseguiria (so os novos; quem ja era fica).
  const soVer = emails.filter(function (e) {
    return jaEram.indexOf(e) === -1 && pessoas.some(function (p) { return p.email === e && !p.edita; });
  });
  if (soVer.length) {
    throw new Error('Só pode ser responsável quem tem “Ver e editar” no ' + plano.nome + ': ' +
      soVer.map(function (e) { return (pessoas.filter(function (p) { return p.email === e; })[0] || {}).nome || e; }).join(', ') +
      ' só tem “Ver”.');
  }
  const conhecidos = pessoasPorEmail_();
  const nomes = emails.map(function (e) {
    const achado = pessoas.filter(function (p) { return p.email === e; })[0];
    return achado ? achado.nome : nomeDoEmail_(conhecidos, e);
  });
  let nome = nomes.join(', ') || String(params.responsavel || '').trim();
  if (!nome) throw new Error('Escolha pelo menos um responsável.');

  const campos = {
    ACAO: titulo,
    // rico (8.13): a tela nova manda HTML do editor — limpo aqui. A tela antiga manda texto simples, que fica como esta.
    DESCRICAO: campoRico_(params.descricao, params.rico),
    RESPONSAVEL: nome,
    RESPONSAVEL_EMAIL: emails.join(','),
    TURNO: turno,
    ORIGEM: String(params.origem || '').trim(),
    PRAZO: paraISO(data)
  };
  // 8.13: prioridade, "como sera tratado" e o levantamento — so quando a tela os manda (a antiga nao mexe neles).
  const prioridade = normalizarPrioridade_(params.prioridade) ||
    (plano.id === 'LIMPEZA' && params.criticidade ? normalizarPrioridade_(critLimpeza_(params.criticidade)) : '');
  if (modelo) {
    if (prioridade) campos.PRIORIDADE = prioridade;
    if (params.tratativa !== undefined) campos.TRATATIVA = campoRico_(params.tratativa, true);
    if (params.relatorio !== undefined) campos.RELATORIO = String(params.relatorio || '').trim().slice(0, RELATORIO_MAXIMO);
  }
  // Da limpeza: onde foi encontrado, criticidade e quando a acao foi aberta.
  if (plano.id === 'LIMPEZA') {
    campos.ZONA = String(params.zona || '').toUpperCase().trim();
    campos.LOCAL = String(params.local || '').trim();
    campos.CRITICIDADE = prioridade ? CRITICIDADE_DA_PRIORIDADE[prioridade] : critLimpeza_(params.criticidade);
    campos.ABERTA_EM = isoDe_(params.abertaEm) ||
      (antes ? isoDe_(antes.ABERTA_EM) || isoDoCarimbo_(antes.CRIADO_EM) : '') || paraISO(hoje());
  }

  const fotos = fotosDoPedido_(params);
  if (nova) id = gerarId('ACOES');
  else if (lerAnexos_(antes.ANEXOS).length + fotos.length > FOTOS_POR_ACAO) throw new Error(muitasFotos_());
  const gravadas = gravarFotos_(usuario, id, fotos);
  const legendas = modelo ? legendasDoPedido_(params, fotos, gravadas) : null;
  let marcadosDepois = [];       // quem continua marcado depois de salvar (o recado diz quem ve a acao)

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
        // A acao direta (8.13) ja nasce com o parecer de quem a criou: e uma situacao que ja vem tratada.
        if (modelo) {
          campos.PARECER = PARECERES.TRATAR; campos.PARECER_EM = agoraTexto(); campos.PARECER_POR = usuario.email;
          campos.PRIORIDADE = prioridade || 'NORMAL';
          if (legendas) campos.LEGENDAS = JSON.stringify(legendas.novas);
        }
        inserir('ACOES', campos, usuario.email);
        return;
      }
      const atual = acaoQueVe_(plano, usuario, id);
      if (parecerDe_(atual) !== PARECERES.TRATAR) throw new Error('Esta situação ainda não virou ação. Atualize a tela.');
      if (gravadas.length) {
        const lista = lerAnexos_(atual.ANEXOS);
        if (lista.length + gravadas.length > FOTOS_POR_ACAO) throw new Error(muitasFotos_());
        campos.ANEXOS = JSON.stringify(lista.map(metadadosDoAnexo_).concat(gravadas));
      }
      if (legendas && (legendas.mudou || gravadas.length)) campos.LEGENDAS = juntarLegendas_(atual, legendas);
      if ('MARCADOS' in atual) {
        const marcados = emailsDaAcao_(atual.MARCADOS), ficam = marcadosQueFicam_(marcados, emails, params.desmarcados);
        if (ficam.length !== marcados.length) campos.MARCADOS = ficam.join(',');
        marcadosDepois = ficam;
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

  // Quem salvou e nao esta citado deixa de ver a acao (21/10): o recado diz para quem ela aparece.
  const some = !podeVerRegistro_(plano, usuario, { RESPONSAVEL_EMAIL: campos.RESPONSAVEL_EMAIL, MARCADOS: marcadosDepois.join(',') });
  const citados = some ? nomes.concat(marcadosDepois.map(function (e) { return nomeDoEmail_(conhecidos, e); })) : [];
  const aviso = some ? (nova ? ' Ela aparece só para quem está citado nela: ' : ' Você não está citado nela: agora ela aparece só para ') +
    listaEmPortugues_(citados) + '.' : '';
  const r = { id: id, recado: (nova ? 'Ação criada.' : 'Ação atualizada.') +
    (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') + aviso };
  if (avisoEmail) r.avisoEmail = avisoEmail + aviso;
  return r;
}

/* ['Ana'] -> 'Ana' · ['Ana', 'Rui', 'Bia'] -> 'Ana, Rui e Bia' */
function listaEmPortugues_(nomes) {
  const l = nomes.filter(Boolean);
  return l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : (l[0] || '');
}

/**
 * Concluir. Sem validacao de ninguem — foi o combinado.
 * Pode concluir: o responsavel pela acao, ou quem gere o plano e ve a acao.
 * A foto (opcional) vai junto do registro da conclusao no historico.
 */
function concluirAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const fotos = fotosDoPedido_(params);
  // O nome do responsavel so para quem ve a acao (21/10: quem nao esta citado nao fica sabendo de quem ela e).
  const naoEDele = function (r) {
    return podeVerRegistro_(plano, usuario, r) ? 'Esta ação é de ' + (r.RESPONSAVEL || 'outra pessoa') + '. Só o responsável a conclui.'
      : 'Só o responsável pela ação a conclui.';
  };

  const antes = acaoDoPlano_(plano, id);
  exigirResponsavelOuGestor_(plano, usuario, antes, naoEDele(antes));
  exigirAcaoTratada_(antes);
  const situacaoAntes =String(antes.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
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
      exigirAcaoTratada_(registro);

      const situacao =String(registro.SITUACAO || ACOES_SITUACAO.PENDENTE).toUpperCase().trim();
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
      gravarComentario_(usuario, 'ACOES', id, obs || TEXTOS_AUTOMATICOS.CONCLUSAO, 'Concluída', '', 'CONCLUSAO', gravadas);

      return { recado: 'Ação concluída.' + (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') };
    });
  } catch (e) { jogarFotosFora_(gravadas); throw e; }
}

/** Voltar atras: a acao volta para a fila. Reabrir, cancelar e excluir: a gestao, so nas acoes que ve (21/10). */
function reabrirAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  return comTrava(function () {
    exigirAcaoTratada_(acaoQueVe_(plano, usuario, id));
    atualizar('ACOES', id, {
      SITUACAO: ACOES_SITUACAO.PENDENTE,
      CONCLUIDO_EM: '', CONCLUIDO_POR: '', ANDAMENTO: 'Em andamento'
    }, usuario.email);
    gravarComentario_(usuario, 'ACOES', id, String(params.motivo || '').trim() || TEXTOS_AUTOMATICOS.REABERTURA, 'Em andamento', '', 'REABERTURA');
    return { recado: 'Ação reaberta.' };
  });
}

/** Cancelar: sai da conta do turno, mas fica no historico. */
function cancelarAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const motivo = String(params.motivo || '').trim();
  return comTrava(function () {
    exigirAcaoTratada_(acaoQueVe_(plano, usuario, id));
    atualizar('ACOES', id, {
      SITUACAO: ACOES_SITUACAO.CANCELADA,
      OBSERVACAO: motivo, DEPENDE: ''
    }, usuario.email);
    gravarComentario_(usuario, 'ACOES', id, motivo ? 'Cancelada: ' + motivo : TEXTOS_AUTOMATICOS.CANCELAMENTO, 'Cancelada', '', 'CANCELAMENTO');
    return { recado: 'Ação cancelada.' };
  });
}

function excluirAcaoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  return comTrava(function () {
    const r = acaoQueVe_(plano, usuario, id);
    excluir('ACOES', id, usuario.email);
    return { recado: parecerDe_(r) === PARECERES.TRATAR ? 'Ação excluída.' : 'Situação excluída.' };
  });
}

/* Concluir, reabrir e cancelar sao da ACAO: a situacao precisa do parecer "Tratar" antes (8.13). */
function exigirAcaoTratada_(registro) {
  if (parecerDe_(registro) !== PARECERES.TRATAR) {
    throw new Error('Esta situação ainda não virou ação: falta o parecer “Tratar / Incluir ação” do gerente. Atualize a tela.');
  }
}

/* ------------------------------------------------------------------ */
/* SITUACAO: REGISTRAR, EDITAR E O PARECER (8.13)                      */
/* ------------------------------------------------------------------ */

/* Instalacao.gs de antes (sem as colunas da 8.13): nada do modelo novo grava — a frase pede o arquivo. */
function exigirModeloDeSituacoes_() {
  if (colunasDe('ACOES').indexOf('PARECER') === -1) {
    throw new Error('Atualização incompleta do GSL: para registrar situações e dar o parecer, o Instalacao.gs desta versão precisa estar no Apps Script. Avise o administrador do sistema.');
  }
}

/* O gerente que vai dar o parecer: alguem que abre o plano com "Ver e editar" nesta filial. */
function destinatarioDoPedido_(plano, email, jaEra) {
  const e = emailsDaAcao_(email)[0] || '';
  if (!e) throw new Error('Escolha o gerente que vai dar o parecer (destinatário).');
  if (e === jaEra) return e;
  const p = pessoasParaAcao(plano).filter(function (x) { return x.email === e; })[0];
  if (!p || !p.abre) throw new Error('Sem acesso ao ' + plano.nome + ' nesta filial: ' + e + '. Escolha alguém da lista.');
  if (!p.edita) throw new Error('O destinatário dá o parecer: precisa de “Ver e editar” no ' + plano.nome + ' (' + p.nome + ' só tem “Ver”).');
  return e;
}

/*
 * REGISTRAR (ou editar) UMA SITUACAO. Quem tem "Ver e editar" no plano (a
 * porta confere): titulo, prioridade, descricao em texto rico, fotos com
 * legenda, o gerente destinatario, turno, origem, levantamento e, na
 * limpeza, zona, local e "aberta em". Quem registra fica como AUTOR e,
 * com o destinatario, esta citado: os dois veem a situacao. Nasce sem
 * parecer. O destinatario recebe um e-mail com o link.
 * Editar: quem ve a situacao (citado) — a de parecer "Tratar" tambem (os
 * campos da acao ficam em salvarAcao e no parecer). Trocar o destinatario
 * (encaminhar) so enquanto nao ha parecer.
 */
function salvarSituacaoDoPlano_(plano, usuario, params) {
  exigirModeloDeSituacoes_();
  const titulo = String(params.titulo || params.acao || '').trim();
  if (!titulo) throw new Error('Informe o título da situação.');
  const turno = String(params.turno || 'Todos').trim();
  if (ACOES_TURNOS.indexOf(turno) === -1) throw new Error('Turno inválido: ' + turno);
  const prioridade = normalizarPrioridade_(params.prioridade) || 'NORMAL';
  let id = String(params.id || '').trim();
  const nova = !id;
  const antes = nova ? null : acaoQueVe_(plano, usuario, id);
  const parecerAntes = antes ? parecerDe_(antes) : '';
  const destAntes = antes ? emailsDaAcao_(antes.DESTINATARIO)[0] || '' : '';
  // O destinatario muda so sem parecer; com parecer, fica o que estava (a tela nem mostra o campo).
  // Editar sem mandar o destinatario (tela de antes, ou outro campo) mantem o que estava.
  const destinatario = !antes || !parecerAntes
    ? destinatarioDoPedido_(plano, antes && params.destinatario === undefined ? destAntes : params.destinatario, destAntes) : destAntes;

  const campos = {
    ACAO: titulo,
    DESCRICAO: campoRico_(params.descricao, true),
    PRIORIDADE: prioridade,
    TURNO: turno,
    ORIGEM: String(params.origem || '').trim(),
    RELATORIO: String(params.relatorio || '').trim().slice(0, RELATORIO_MAXIMO)
  };
  if (!antes || !parecerAntes) campos.DESTINATARIO = destinatario;
  if (plano.id === 'LIMPEZA') {
    campos.ZONA = String(params.zona || '').toUpperCase().trim();
    campos.LOCAL = String(params.local || '').trim();
    campos.CRITICIDADE = CRITICIDADE_DA_PRIORIDADE[prioridade];
    campos.ABERTA_EM = isoDe_(params.abertaEm) ||
      (antes ? isoDe_(antes.ABERTA_EM) || isoDoCarimbo_(antes.CRIADO_EM) : '') || paraISO(hoje());
  }

  const fotos = fotosDoPedido_(params);
  if (nova) id = gerarId('ACOES');
  else if (lerAnexos_(antes.ANEXOS).length + fotos.length > FOTOS_POR_ACAO) throw new Error(muitasFotos_());
  const gravadas = gravarFotos_(usuario, id, fotos);
  const legendas = legendasDoPedido_(params, fotos, gravadas);

  try {
    comTrava(function () {
      if (nova) {
        Object.assign(campos, {
          ID: id, PLANO: plano.id, SITUACAO: ACOES_SITUACAO.PENDENTE, AUTOR: String(usuario.email || '').toLowerCase().trim(),
          PARECER: '', RESPONSAVEL: '', RESPONSAVEL_EMAIL: '', PRAZO: '', CONCLUIDO_EM: '', CONCLUIDO_POR: '', OBSERVACAO: '',
          ANEXOS: gravadas.length ? JSON.stringify(gravadas) : '', LEGENDAS: JSON.stringify(legendas.novas)
        });
        inserir('ACOES', campos, usuario.email);
        return;
      }
      const atual = acaoQueVe_(plano, usuario, id);
      if (parecerDe_(atual) !== parecerAntes) throw new Error('O parecer desta situação mudou enquanto a janela estava aberta. Feche e abra de novo.');
      if (gravadas.length) {
        const lista = lerAnexos_(atual.ANEXOS);
        if (lista.length + gravadas.length > FOTOS_POR_ACAO) throw new Error(muitasFotos_());
        campos.ANEXOS = JSON.stringify(lista.map(metadadosDoAnexo_).concat(gravadas));
      }
      campos.LEGENDAS = juntarLegendas_(atual, legendas);
      atualizar('ACOES', id, campos, usuario.email);
    });
  } catch (e) { jogarFotosFora_(gravadas); throw e; }

  // O gerente fica sabendo (situacao nova, ou encaminhada para ele). Falha no e-mail nao desfaz nada, mas aparece.
  const r = { id: id, recado: (nova ? 'Situação registrada.' : 'Situação atualizada.') +
    (gravadas.length ? ' ' + gravadas.length + ' foto(s) anexada(s).' : '') };
  const eu = String(usuario.email || '').toLowerCase().trim();
  if ((nova || destinatario !== destAntes) && destinatario && destinatario !== eu) {
    try {
      avisarSituacao_(plano, Object.assign({ ID: id }, antes || {}, campos), destinatario, autorDoComentario_(usuario));
      r.recado += ' ' + nomeDoEmail_(pessoasPorEmail_(), destinatario) + ' foi avisado(a) para dar o parecer.';
    } catch (e) { r.avisoEmail = r.recado + ' Mas o aviso por e-mail não saiu para ' + destinatario + ' (' + (e.message || e) + ').'; }
  }
  return r;
}

/*
 * O PARECER DO GERENTE. Quem decide: o DESTINATARIO da situacao (o gerente
 * escolhido por quem registrou). Sem destinatario (a acao direta, a linha
 * antiga), quem deu o parecer (PARECER_POR) — a linha antiga nao muda de
 * parecer por aqui. Precisa de "Ver e editar" no plano (a porta confere).
 *   TRATAR: tratativa ("Como sera tratado", texto rico), um ou mais
 *           responsaveis com "Ver e editar" e o prazo — vira acao em aberto,
 *           e os responsaveis recebem o e-mail de sempre;
 *   DEPOIS: rever em (opcional) e observacao (opcional);
 *   NADA:   observacao (opcional);
 *   '':     volta a "Sem definicao".
 * A acao ja concluida nao muda de parecer (reabra antes). O parecer entra no
 * historico; com observacao, ela e o texto do registro.
 */
function parecerDoPlano_(plano, usuario, params) {
  exigirModeloDeSituacoes_();
  const id = String(params.id || '').trim();
  const parecer = String(params.parecer || '').toUpperCase().trim();
  if (parecer && !PARECERES[parecer]) throw new Error('Parecer inválido: ' + parecer);
  const eu = String(usuario.email || '').toLowerCase().trim();
  const obs = String(params.observacao || '').trim().slice(0, 1000);

  const antes = acaoQueVe_(plano, usuario, id);
  exigirQuemDaParecer_(antes, eu);

  const campos = { PARECER: parecer, PARECER_EM: parecer ? agoraTexto() : '', PARECER_POR: parecer ? eu : '', PARECER_OBS: obs };
  let emails = [], nomes = [];
  if (parecer === PARECERES.TRATAR) {
    const tratativa = campoRico_(params.tratativa, true);
    if (!tratativa) throw new Error('Descreva como a situação será tratada.');
    const data = paraData(params.prazo);
    if (!data) throw new Error('Informe o prazo.');
    emails = emailsDaAcao_([].concat(params.responsaveisEmails || []).join(','));
    if (!emails.length) throw new Error('Escolha pelo menos um responsável.');
    const pessoas = pessoasParaAcao(plano);
    const jaEram = emailsDaAcao_(antes.RESPONSAVEL_EMAIL);
    const fora = emails.filter(function (e) { return jaEram.indexOf(e) === -1 && !pessoas.some(function (p) { return p.email === e; }); });
    if (fora.length) throw new Error('Sem acesso ao ' + plano.nome + ' nesta filial: ' + fora.join(', ') + '. Escolha alguém da lista.');
    const soVer = emails.filter(function (e) { return jaEram.indexOf(e) === -1 && pessoas.some(function (p) { return p.email === e && !p.edita; }); });
    if (soVer.length) {
      throw new Error('Só pode ser responsável quem tem “Ver e editar” no ' + plano.nome + ': ' +
        soVer.map(function (e) { return (pessoas.filter(function (p) { return p.email === e; })[0] || {}).nome || e; }).join(', ') + ' só tem “Ver”.');
    }
    const conhecidos = pessoasPorEmail_();
    nomes = emails.map(function (e) {
      const achado = pessoas.filter(function (p) { return p.email === e; })[0];
      return achado ? achado.nome : nomeDoEmail_(conhecidos, e);
    });
    const turno = String(params.turno || antes.TURNO || 'Todos').trim();
    if (ACOES_TURNOS.indexOf(turno) === -1) throw new Error('Turno inválido: ' + turno);
    Object.assign(campos, { TRATATIVA: tratativa, RESPONSAVEL: nomes.join(', '), RESPONSAVEL_EMAIL: emails.join(','),
                            PRAZO: paraISO(data), TURNO: turno, REVER_EM: '' });
  } else if (parecer === PARECERES.DEPOIS) {
    const rever = String(params.reverEm || '').trim();
    if (rever && !isoDe_(rever)) throw new Error('Data para rever inválida.');
    campos.REVER_EM = rever ? isoDe_(rever) : '';
  } else {
    campos.REVER_EM = '';
  }
  // Quem virou responsavel sai dos marcados (como na edicao da acao).
  if (emails.length && 'MARCADOS' in antes) {
    const m = emailsDaAcao_(antes.MARCADOS), ficam = m.filter(function (e) { return emails.indexOf(e) === -1; });
    if (ficam.length !== m.length) campos.MARCADOS = ficam.join(',');
  }

  const feito = comTrava(function () {
    const atual = acaoQueVe_(plano, usuario, id);
    exigirQuemDaParecer_(atual, eu);
    const situacao = String(atual.SITUACAO || '').toUpperCase().trim();
    const tratada = parecerDe_(atual) === PARECERES.TRATAR;
    if (tratada && situacao === ACOES_SITUACAO.CONCLUIDA && parecer !== PARECERES.TRATAR) {
      throw new Error('Esta ação já foi concluída: reabra antes de mudar o parecer.');
    }
    if (situacao === ACOES_SITUACAO.CANCELADA && parecer === PARECERES.TRATAR) campos.SITUACAO = ACOES_SITUACAO.PENDENTE;
    // Virou acao agora: comeca em aberto, sem conclusao velha.
    if (parecer === PARECERES.TRATAR && !tratada) Object.assign(campos, { SITUACAO: ACOES_SITUACAO.PENDENTE, CONCLUIDO_EM: '', CONCLUIDO_POR: '', ANDAMENTO: '', DEPENDE: '' });
    atualizar('ACOES', id, campos, usuario.email);
    gravarComentario_(usuario, 'ACOES', id, textoDoParecer_(parecer) + (obs ? ' ' + obs : ''), '', '', 'PARECER');
    return { registro: Object.assign({}, atual, campos), novaAcao: parecer === PARECERES.TRATAR && !tratada,
             jaEram: emailsDaAcao_(atual.RESPONSAVEL_EMAIL) };
  });

  // E-mails depois da trava: os responsaveis (a acao e deles agora) e quem registrou a situacao.
  const falhas = [];
  if (parecer === PARECERES.TRATAR) {
    emails.forEach(function (e) {
      try { avisarAcaoNova(feito.registro, e, feito.novaAcao || feito.jaEram.indexOf(e) === -1, id, plano); }
      catch (x) { falhas.push(e + ' (' + (x.message || x) + ')'); }
    });
  }
  const autor = emailsDaAcao_(feito.registro.AUTOR)[0] || '';
  if (autor && autor !== eu && emails.indexOf(autor) === -1) {
    try { avisarParecer_(plano, feito.registro, autor, autorDoComentario_(usuario)); }
    catch (x) { falhas.push(autor + ' (' + (x.message || x) + ')'); }
  }
  const recados = { TRATAR: 'Parecer registrado: a situação virou ação' + (emails.length ? ' — ' + (emails.length > 1 ? 'responsáveis avisados' : 'responsável avisado') : '') + '.',
                    DEPOIS: 'Parecer registrado: outro momento.', NADA: 'Parecer registrado: nada a fazer.', '': 'Parecer retirado: a situação volta a “Sem definição”.' };
  const r = { id: id, recado: recados[parecer] };
  if (falhas.length) r.avisoEmail = r.recado + ' Mas o aviso por e-mail não saiu para: ' + falhas.join('; ');
  return r;
}

/* O texto do parecer no historico ("Parecer: Outro momento."). */
function textoDoParecer_(parecer) {
  return parecer ? 'Parecer: ' + NOMES_PARECER[parecer] + '.' : 'Parecer retirado.';
}

/* Quem pode dar o parecer desta linha: o destinatario; sem destinatario, quem deu o parecer que esta la. */
function exigirQuemDaParecer_(registro, eu) {
  const dest = emailsDaAcao_(registro.DESTINATARIO)[0] || '';
  const deu = String(registro.PARECER_POR || '').toLowerCase().trim();
  if (dest ? dest === eu : (deu && deu === eu)) return;
  throw new Error(dest ? 'Só ' + nomeDoEmail_(pessoasPorEmail_(), dest) + ', o gerente destinatário desta situação, dá o parecer.'
    : 'O parecer desta ação já foi dado e só quem o deu pode mudá-lo.');
}

/* As portas das situacoes (Codigo.gs: ACOES salvarSituacao, parecerSituacao e as da Limpeza). */
function acaoSalvarSituacao(usuario, params) { return salvarSituacaoDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoParecerSituacao(usuario, params) { return parecerDoPlano_(PLANOS.CALENDARIO, usuario, params); }
function acaoSalvarSituacaoLimpeza(usuario, params) { return salvarSituacaoDoPlano_(PLANOS.LIMPEZA, usuario, params); }
function acaoParecerSituacaoLimpeza(usuario, params) { return parecerDoPlano_(PLANOS.LIMPEZA, usuario, params); }

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
 * Ver uma foto. So quem enxerga a acao (a mesma regra da lista: quem esta citado nela), e so foto
 * que e da acao ou de um comentario dela — o ID de um arquivo qualquer do
 * Drive nao passa por aqui.
 * HEIC (iPhone) gravada sem converter — foto de antes de 19/10, ou o Google
 * ainda nao tinha a miniatura na hora do envio: vai a miniatura de 1600 px,
 * que o navegador abre. Sem miniatura, vai a original com semMiniatura (o
 * servidor tentou) e desistiu (o Google teve tempo e nao gerou): a tela explica.
 */
function fotoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  const arquivo = String(params.arquivo || '').trim();
  const registro = acaoDoPlano_(plano, id);
  if (!podeVerAcao_(plano, usuario, hidratarAcao(registro))) throw new Error('Ação não encontrada. Atualize a tela.');
  const estaFoto = function (a) { return a.id === arquivo; };
  const foto = lerAnexos_(registro.ANEXOS).filter(estaFoto)[0] ||
    (comentariosPorAcao_(origensDoPlano_(plano.id))[id] || []).map(function (c) { return c.fotos.filter(estaFoto)[0]; }).filter(Boolean)[0];
  if (!arquivo || !foto) throw new Error('Esta foto não é desta ação.');
  const heic = /^image\/hei[cf]/i.test(foto.tipo || '') || /\.hei[cf]$/i.test(foto.nome || '');
  const conv = heic ? heicGravadaConvertida_(arquivo) : { img: null, desistiu: false };
  const img = conv.img;
  if (img) return { ok: true, nome: img.getName(), tipo: img.getContentType(), dados: Utilities.base64Encode(img.getBytes()), convertida: true };
  let b;
  try { b = baixarAnexo(arquivo); }
  catch (e) { throw new Error('A foto não está mais no Drive (foi apagada ou movida).'); }
  return { ok: true, nome: b.nome, tipo: b.tipo, dados: b.dados, semMiniatura: heic, desistiu: conv.desistiu };
}

/* Tirar uma foto da acao (as dos comentarios ficam: o historico nao se apaga). Gestao, e so na acao que ve. */
function removerFotoDoPlano_(plano, usuario, params) {
  const id = String(params.id || '').trim();
  return comTrava(function () {
    acaoQueVe_(plano, usuario, id);
    removerAnexo(usuario, 'ACOES', id, params.arquivo);
    return { ok: true, recado: 'Foto removida.' };
  });
}

/* ------------------------------------------------------------------ */
/* HEIC (iPhone) — o Chrome nao abre: o servidor converte (19/10)       */
/*                                                                     */
/* Pela miniatura do proprio Drive, o mesmo caminho que a Entrega usa  */
/* desde o codigo original (_viaMiniaturaDrive). Na hora em que a foto */
/* e escolhida (converterFoto) e, para a HEIC que ja esta gravada, na  */
/* hora de ver (fotoDoPlano_).                                         */
/* ------------------------------------------------------------------ */

const LADO_DA_MINIATURA = 1600;     // o mesmo lado maior das fotos reduzidas na tela (FOTO_LADO_MAX)
const MARCAS_HEIC_ = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
const DRIVE_ARQUIVOS_ = 'https://www.googleapis.com/drive/v3/files/';   // a API do Drive, com o token do dono
// Por pessoa, a cada 10 min: cada conversao sobe ate 10 MB ao Drive do dono e prende uma execucao por segundos.
const CONVERSOES_HEIC_POR_JANELA = 30;

/*
 * Converter UMA foto HEIC na hora em que ela e escolhida (a tela so manda
 * quando o navegador nao abre o arquivo). So para quem pode anexar a foto
 * onde ela vai (exigirQuemAnexaFoto_), e no maximo CONVERSOES_HEIC_POR_JANELA
 * por pessoa a cada 10 min. Grava numa pasta temporaria, pega a miniatura do
 * Drive e devolve a imagem, que segue na tela como qualquer outra foto. Nada
 * fica: a pasta sai de vez na hora (apagarPastaTemporaria_). So aceita HEIC de
 * verdade, pelos bytes: nao vira conversor de qualquer arquivo. Miniatura
 * que o Google ainda nao gerou: pendente — a foto vai como veio e o visor
 * converte quando alguem abrir.
 */
function acaoConverterFoto(usuario, params) {
  exigirPorta_();
  exigirQuemAnexaFoto_(usuario, params);
  const f = fotosDoPedido_({ fotos: [params.foto] })[0];
  if (!f) throw new Error('Nenhuma foto chegou.');
  const bytes = Utilities.base64Decode(f.dados);
  if (!ehHeicPelosBytes_(bytes)) throw new Error('"' + f.nome + '" não é uma foto HEIC.');
  contarConversaoHeic_(usuario);
  const pasta = subpasta(pastaAnexos(), PASTA_TMP_ENTREGA).createFolder('heic-' + Utilities.getUuid().slice(0, 8));
  try {
    const img = miniaturaDoDrive_(pasta.createFile(Utilities.newBlob(bytes, 'image/heic', f.nome)), 25000);
    if (!img) return { ok: true, pendente: true };
    return { ok: true, nome: img.getName(), tipo: img.getContentType(), dados: Utilities.base64Encode(img.getBytes()) };
  } finally {
    apagarPastaTemporaria_(pasta);
  }
}

/*
 * Converter e o primeiro passo de anexar: so quem pode anexar a foto onde ela
 * vai. A tela diz onde (plano, uso e acao); o servidor confere como no gravar:
 * comentario ('cm': responsavel, gestao ou quem foi marcado na acao), conclusao
 * ('cc': responsavel ou gestao) ou a propria acao, nova ou editada (quem gere o plano; a editada, se ele a ve).
 */
function exigirQuemAnexaFoto_(usuario, params) {
  const plano = String(params.plano || '').toUpperCase() === PLANOS.LIMPEZA.id ? PLANOS.LIMPEZA : PLANOS.CALENDARIO;
  // A porta deixou passar com "Ver e editar" em um dos planos; a foto vai para ESTE plano.
  exigirEditar(usuario, plano.tela);
  const id = String(params.id || '').trim();
  if (params.uso === 'cm') return exigirQuemComenta_(plano, usuario, acaoDoPlano_(plano, id));
  if (params.uso === 'cc') return exigirResponsavelOuGestor_(plano, usuario, acaoDoPlano_(plano, id), 'Só o responsável pela ação anexa a foto da conclusão.');
  if (id) acaoQueVe_(plano, usuario, id);      // editar: so a acao que a pessoa ve (21/10)
}

/* Conta a conversao da pessoa (janelas de 10 min no cache) antes de subir qualquer coisa ao Drive do dono. */
function contarConversaoHeic_(usuario) {
  const cache = CacheService.getScriptCache();
  const chave = 'heic-conv|' + usuario.email + '|' + Math.floor(Date.now() / 600000);
  const feitas = Number(cache.get(chave) || 0);
  if (feitas >= CONVERSOES_HEIC_POR_JANELA) {
    throw new Error('Muitas fotos HEIC convertidas em pouco tempo. Espere alguns minutos e tente de novo.');
  }
  cache.put(chave, String(feitas + 1), 600);
}

/*
 * A pasta temporaria sai DE VEZ pela API do Drive (o mesmo token da miniatura):
 * na lixeira, a HEIC ocupava a cota do dono por 30 dias. Resposta que nao e 204
 * (API desligada, sem permissao, rede): lixeira, como antes — e a faxina diaria
 * (limparTemporariosEntrega) pega o que escapar.
 */
function apagarPastaTemporaria_(pasta) {
  try {
    const r = UrlFetchApp.fetch(DRIVE_ARQUIVOS_ + pasta.getId() + '?supportsAllDrives=true',
      { method: 'delete', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() === 204) return;
  } catch (e) { /* rede ou cota do UrlFetch: a lixeira */ }
  try { pasta.setTrashed(true); } catch (e) { /* a faxina diaria pega */ }
}

/*
 * A HEIC gravada na acao, convertida. img null: o Google ainda nao tem a
 * miniatura (ou o arquivo sumiu: o baixar explica). Uma tentativa sem
 * miniatura fica lembrada por 10 min: as aberturas seguintes consultam uma vez
 * so, sem os 6 s de espera. desistiu: gravada ha mais de 10 min e ainda sem
 * miniatura — o Google nao vai gerar, e a tela para de prometer.
 */
function heicGravadaConvertida_(idArquivo) {
  let arq;
  try { arq = DriveApp.getFileById(idArquivo); } catch (e) { return { img: null, desistiu: false }; }
  const marca = 'heic-sem-miniatura|' + idArquivo;
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { /* sem cache: espera como antes */ }
  const img = miniaturaDoDrive_(arq, cache && cache.get(marca) ? 0 : 6000);
  if (!img && cache) { try { cache.put(marca, '1', 600); } catch (e) { /* so perde o atalho */ } }
  return { img: img, desistiu: !img && Date.now() - arq.getDateCreated().getTime() > 10 * 60 * 1000 };
}

/*
 * A miniatura do arquivo em 1600 px. A de um arquivo recem-criado leva
 * alguns segundos para existir: espera ate esperaMs e devolve null se ainda
 * nao houver — quem chamou decide. O formato vem dos bytes (JPEG, PNG ou
 * WEBP): pagina de erro ou de login nao vira "foto". Rede ou cota do
 * UrlFetch tambem dao null.
 */
function miniaturaDoDrive_(arquivo, esperaMs) {
  const comToken = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  let resposta;
  try {
    const link = linkDaMiniatura_(arquivo.getId(), comToken, esperaMs);
    if (!link) return null;
    // o tamanho vem no fim do link (=s220, =w200-h190-p-k-nu): troca por 1600; link sem tamanho ganha um
    const url = /=[sw]\d+[^/]*$/.test(link) ? link.replace(/=[sw]\d+[^/]*$/, '=s' + LADO_DA_MINIATURA) : link + '=s' + LADO_DA_MINIATURA;
    resposta = UrlFetchApp.fetch(url, comToken);
    if (resposta.getResponseCode() !== 200) resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) { return null; }
  if (resposta.getResponseCode() !== 200) return null;
  const blob = resposta.getBlob();
  const formato = formatoDaImagem_(blob.getBytes());
  if (!formato) return null;
  return blob.setContentType(formato.tipo).setName(String(arquivo.getName()).replace(/\.[^.]+$/, '') + formato.ext);
}

/*
 * O thumbnailLink, esperando o Google gera-lo: pausas crescentes (0,7 s,
 * 1 s, 1,6 s... ate 4 s cada) CONTADAS ate somar esperaMs — nao pelo
 * relogio, que contaria tambem o tempo das consultas. So vale esperar pela
 * miniatura que ainda nao saiu, pela cota e por erro do Google (esperarAdianta_):
 * API do Drive desligada, politica do dominio, token recusado ou arquivo sumido
 * nao mudam com o tempo — desiste na hora e deixa o motivo no log do dono.
 */
function linkDaMiniatura_(id, comToken, esperaMs) {
  const api = DRIVE_ARQUIVOS_ + id + '?fields=thumbnailLink&supportsAllDrives=true';
  let pausa = 700, esperou = 0;
  for (;;) {
    const r = UrlFetchApp.fetch(api, comToken);
    const codigo = r.getResponseCode();
    const link = codigo === 200 ? JSON.parse(r.getContentText()).thumbnailLink : '';
    if (link) return link;
    if (codigo !== 200 && !esperarAdianta_(codigo, r)) {
      console.warn('Miniatura do Drive recusada (HTTP ' + codigo + '): ' + String(r.getContentText()).slice(0, 300));
      return '';
    }
    if (esperou + pausa > esperaMs) return '';
    Utilities.sleep(pausa);
    esperou += pausa;
    pausa = Math.min(Math.round(pausa * 1.5), 4000);
  }
}

/* Vale consultar de novo: cota (429, 403 de rateLimitExceeded ou userRateLimitExceeded) e erro do Google (5xx). */
function esperarAdianta_(codigo, r) {
  if (codigo === 429 || codigo >= 500) return true;
  return codigo === 403 && /ratelimitexceeded/i.test(String(r.getContentText()));
}

/* JPEG, PNG ou WEBP pelos primeiros bytes; null para o resto. */
function formatoDaImagem_(bytes) {
  const b = bytes.slice(0, 12).map(function (x) { return x & 255; });
  const txt = String.fromCharCode.apply(null, b);
  if (b[0] === 0xFF && b[1] === 0xD8) return { tipo: 'image/jpeg', ext: '.jpg' };
  if (b[0] === 0x89 && txt.slice(1, 4) === 'PNG') return { tipo: 'image/png', ext: '.png' };
  if (txt.slice(0, 4) === 'RIFF' && txt.slice(8, 12) === 'WEBP') return { tipo: 'image/webp', ext: '.webp' };
  return null;
}

/* HEIC/HEIF pelos primeiros bytes: 'ftyp' e uma marca da familia HEIF. */
function ehHeicPelosBytes_(bytes) {
  const txt = String.fromCharCode.apply(null, bytes.slice(0, 12).map(function (x) { return x & 255; }));
  return txt.slice(4, 8) === 'ftyp' && MARCAS_HEIC_.indexOf(txt.slice(8, 12)) !== -1;
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
    (campos.TRATATIVA ? '<p><b>Como será tratado:</b><br>' + textoEmHtml_(campos.TRATATIVA) + '</p>'
      : campos.DESCRICAO ? '<p>' + textoEmHtml_(campos.DESCRICAO) + '</p>' : '') +
    (limpeza && onde ? '<p>Local: <strong>' + htmlSeguro(onde) + '</strong>' +
      (campos.CRITICIDADE ? ' · criticidade ' + htmlSeguro(campos.CRITICIDADE) : '') + '</p>' : '') +
    '<p>Turno: <strong>' + htmlSeguro(campos.TURNO) + '</strong><br>' +
    'Entregar até: <strong>' + htmlSeguro(prazo) + '</strong></p>' +
    (campos.ORIGEM ? '<p style="color:#666">Origem: ' + htmlSeguro(campos.ORIGEM) + '</p>' : '') +
    rodapeLink(plano.tela);

  enviar([email], assunto, corpo);
}

/*
 * Quem foi marcado num comentario (19/10) recebe o comentario, a acao e o
 * botao que abre o historico dela no GSL (?tela=...&acao=ID). r: a linha da
 * acao ja com o que o comentario mudou. passouAVer: a pessoa nao enxergava
 * a acao antes (nao estava citada — 21/10: a gestao tambem) — o e-mail diz que agora ve.
 * O "Responder" do e-mail vai para quem marcou (nao para a conta que roda o
 * GSL), e o texto pede a resposta pelo botao, que e a que entra no historico.
 */
function avisarMencao_(plano, r, autor, texto, email, passouAVer) {
  const limpeza = plano.id === 'LIMPEZA';
  const quem = autor.nome || autor.email;
  const onde = [r.ZONA, r.LOCAL].filter(Boolean).join(' · ');
  const situacao = String(r.SITUACAO || '').toUpperCase().trim() === ACOES_SITUACAO.CONCLUIDA ? 'Concluída' : (r.ANDAMENTO || 'Em aberto');
  const assunto = quem + ' marcou você numa ação' + (limpeza ? ' da limpeza' : '') + ': ' + r.ACAO;
  const corpo =
    '<p><b>' + htmlSeguro(quem) + '</b>' + (autor.papel ? ' (' + htmlSeguro(autor.papel) + ')' : '') +
    ' marcou você num comentário do ' + (limpeza ? 'Plano de Ação da Limpeza CD' : 'Plano de Ação') + ':</p>' +
    caixa('Comentário:', texto, COR_AZUL, '#EEF0FF') +
    '<p style="font-size:16px;margin-top:16px"><strong>' + htmlSeguro(r.ACAO) + '</strong></p>' +
    (r.DESCRICAO ? '<p>' + textoEmHtml_(r.DESCRICAO) + '</p>' : '') +
    '<table style="border-collapse:collapse;margin:10px 0;font-size:13px">' +
    linha('Responsável', r.RESPONSAVEL || '—') + linha('Entregar até', formatarData(paraData(r.PRAZO)) || '—') +
    linha('Situação', situacao) + (r.DEPENDE ? linha('Depende de', r.DEPENDE) : '') +
    (limpeza && onde ? linha('Local', onde) : '') + '</table>' +
    (passouAVer ? '<p style="color:#475569">Você passou a acompanhar esta ação no GSL: pode ver o histórico e responder.</p>' : '') +
    '<p style="color:#475569">Responda pelo botão abaixo: a resposta fica no histórico da ação.</p>' +
    rodapeLink(plano.tela, r.ID);
  enviar([email], assunto, corpo, null, autor.email ? { replyTo: autor.email } : null);
}

/* O texto rico (ou simples) no corpo do e-mail: so o texto, escapado, com as quebras de linha. */
function textoEmHtml_(valor) {
  return htmlSeguro(textoDoHtml_(valor)).replace(/\n/g, '<br>');
}

/*
 * SITUACAO NOVA (8.13): o gerente destinatario recebe a situacao e o botao
 * que abre o historico dela no GSL (?tela=...&acao=ID), onde da o parecer.
 * O "Responder" do e-mail vai para quem registrou.
 */
function avisarSituacao_(plano, r, email, autor) {
  const limpeza = plano.id === 'LIMPEZA';
  const quem = autor.nome || autor.email;
  const prio = NOMES_PRIORIDADE[normalizarPrioridade_(r.PRIORIDADE) || 'NORMAL'];
  const fotos = lerAnexos_(r.ANEXOS).length;
  const onde = [r.ZONA, r.LOCAL].filter(Boolean).join(' · ');
  const corpo =
    '<p><b>' + htmlSeguro(quem) + '</b>' + (autor.papel ? ' (' + htmlSeguro(autor.papel) + ')' : '') +
    ' registrou uma situação no ' + (limpeza ? 'Plano de Ação da Limpeza CD' : 'Plano de Ação') + ' e escolheu você para dar o parecer:</p>' +
    '<p style="font-size:16px;margin-top:16px"><strong>' + htmlSeguro(r.ACAO) + '</strong></p>' +
    (r.DESCRICAO ? '<p>' + textoEmHtml_(r.DESCRICAO) + '</p>' : '') +
    '<table style="border-collapse:collapse;margin:10px 0;font-size:13px">' +
    linha('Prioridade', prio) + (limpeza && onde ? linha('Local', onde) : '') +
    (fotos ? linha('Fotos', fotos + (fotos > 1 ? ' fotos' : ' foto')) : '') +
    (r.RELATORIO ? linha('Levantamento', r.RELATORIO) : '') + '</table>' +
    '<p style="color:#475569">No GSL, escolha: <b>Tratar / Incluir ação</b> (como será tratado, responsáveis e prazo), ' +
    '<b>Outro momento</b> ou <b>Nada a fazer</b>.</p>' +
    rodapeLink(plano.tela, r.ID);
  enviar([email], 'Situação para o seu parecer: ' + r.ACAO, corpo, null, autor.email ? { replyTo: autor.email } : null);
}

/* Quem registrou a situacao fica sabendo do parecer (8.13). */
function avisarParecer_(plano, r, email, gerente) {
  const parecer = parecerDe_(r);
  const quem = gerente.nome || gerente.email;
  const corpo =
    '<p><b>' + htmlSeguro(quem) + '</b> deu o parecer na situação que você registrou:</p>' +
    '<p style="font-size:16px;margin-top:16px"><strong>' + htmlSeguro(r.ACAO) + '</strong></p>' +
    '<p style="font-size:15px"><b>' + htmlSeguro(NOMES_PARECER[parecer]) + '</b></p>' +
    (parecer === PARECERES.TRATAR ? '<p><b>Como será tratado:</b><br>' + textoEmHtml_(r.TRATATIVA) + '</p>' +
      '<table style="border-collapse:collapse;margin:10px 0;font-size:13px">' +
      linha('Responsável', r.RESPONSAVEL || '—') + linha('Prazo', formatarData(paraData(r.PRAZO)) || '—') + '</table>' : '') +
    (parecer === PARECERES.DEPOIS && r.REVER_EM ? '<p>Rever em ' + htmlSeguro(formatarData(paraData(r.REVER_EM))) + '.</p>' : '') +
    (r.PARECER_OBS ? '<p style="color:#475569">' + htmlSeguro(r.PARECER_OBS) + '</p>' : '') +
    rodapeLink(plano.tela, r.ID);
  enviar([email], 'Parecer na sua situação: ' + r.ACAO + ' — ' + NOMES_PARECER[parecer], corpo, null,
    gerente.email ? { replyTo: gerente.email } : null);
}
