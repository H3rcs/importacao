/**
 * GSL BARTOFIL - Sistema de Gestao do CD Feira de Santana
 *
 * PORTA UNICA DE ENTRADA.
 *
 *   carregarTela(id, params)   -> toda leitura
 *   executarAcao(nome, params) -> toda escrita
 *
 * As duas conferem permissao antes de despachar. Modulo novo = registrar
 * a tela em TELAS, escrever dados<Nome>(usuario, params), registrar as
 * acoes em ACOES e rodar sincronizarEsquema().
 */

const APP = {
  nome: 'GSL Bartofil',
  versao: '3.0.0'
};

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.app = APP;

  /*
   * O primeiro carregamento ia e voltava duas vezes ao servidor antes de
   * mostrar qualquer coisa: uma para o bootstrap, outra para a tela. Cada
   * ida e volta do google.script.run custa 1 a 3 segundos. Aqui as duas
   * respostas viajam DENTRO do HTML — a tela abre sem nenhuma chamada.
   */
  // A identidade agora vem do cliente (tela de identificacao), nao da
  // sessao do servidor — que fica vazia quando o app roda como o dono.
  // O doGet so informa se o sistema esta instalado; quem entra e a tela.
  let inicial = '';
  try {
    inicial = JSON.stringify({ ok: true, instalado: bancoInstalado(), precisaIdentificar: true });
  } catch (erro) {
    inicial = JSON.stringify({ ok: false, erro: String(erro.message || erro) });
  }
  t.inicial = inicial;
  return t.evaluate()
    .setTitle(APP.nome)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/**
 * Catalogo de acoes de escrita. Cada uma declara a capacidade exigida.
 * Nenhuma funcao de escrita e alcancavel sem passar por aqui.
 */
const ACOES = {
  // calendario — o ciclo de entrega e validacao
  entregar:            { capacidade: 'ENTREGAR',      funcao: 'acaoEntregar' },
  validar:             { capacidade: 'VALIDAR',       funcao: 'acaoValidar' },
  definirSetor:        { capacidade: 'PROGRAMAR',     funcao: 'acaoDefinirSetor' },
  remarcar:            { capacidade: 'PROGRAMAR',     funcao: 'acaoRemarcar' },
  agendarTreinamento:  { capacidade: 'PROGRAMAR',     funcao: 'acaoAgendarTreinamento' },
  removerAnexo:        { capacidade: 'ANEXAR',        funcao: 'acaoRemoverAnexoAtividade' },
  detalhesAtividade:   { capacidade: null,            funcao: 'acaoDetalhesAtividade' },
  iniciarEntrega:      { capacidade: null,            funcao: 'acaoIniciarEntrega' },
  receberParte:        { capacidade: null,            funcao: 'acaoReceberParte' },
  finalizarEntrega:    { capacidade: null,            funcao: 'acaoFinalizarEntrega' },
  criarAtividade:      { capacidade: 'PROGRAMAR',     funcao: 'acaoCriarAtividade' },
  cancelarAtividade:   { capacidade: 'VALIDAR',       funcao: 'acaoCancelarAtividade' },
  cancelarCompetencia: { capacidade: 'VALIDAR',       funcao: 'acaoCancelarCompetencia' },
  reativarAtividade:   { capacidade: 'VALIDAR',       funcao: 'acaoReativarAtividade' },
  diagnosticoAcesso:   { capacidade: null,            funcao: 'acaoDiagnosticoAcesso' },
  gerarMes:            { capacidade: 'PROGRAMAR',     funcao: 'acaoGerarMes' },
  restaurarPerfis:     { capacidade: 'GERIR_ACESSOS', funcao: 'acaoRestaurarPerfis' },

  // configuracao
  salvarPessoa:        { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarPessoa' },
  excluirPessoa:       { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirPessoa' },
  salvarSetor:         { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarSetor' },
  excluirSetor:        { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirSetor' },
  salvarRotina:        { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarRotina' },
  excluirRotina:       { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirRotina' },
  salvarParametro:     { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarParametro' },
  corrigirFuso:        { capacidade: 'GERIR_ACESSOS', funcao: 'acaoCorrigirFuso' },
  ligarGatilhos:       { capacidade: 'GERIR_ACESSOS', funcao: 'acaoLigarGatilhos' },

  // GSL-DADOS
  salvarArquivoRH:     { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarArquivoRH' },
  excluirArquivoRH:    { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirArquivoRH' },
  previewImportacao:   { capacidade: 'PROGRAMAR',     funcao: 'acaoPreviewImportacao' },
  importarCompetencia: { capacidade: 'PROGRAMAR',     funcao: 'acaoImportarCompetencia' },
  codigosPendentes:    { capacidade: 'PROGRAMAR',     funcao: 'acaoCodigosPendentes' },
  salvarDePara:        { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarDePara' },
  excluirDePara:       { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirDePara' },
  reclassificar:       { capacidade: 'PROGRAMAR',     funcao: 'acaoReclassificar' },
  fichaColaborador:    { capacidade: 'VER_INDIVIDUAL', funcao: 'acaoFichaColaborador' },
  ranking:             { capacidade: 'VER_INDIVIDUAL', funcao: 'acaoRanking' },
  periodo:             { capacidade: 'VER_INDIVIDUAL', funcao: 'acaoPeriodo' },
  analise:             { capacidade: 'VER_INDIVIDUAL', funcao: 'dadosAnalise' },

  // acessos
  salvarUsuario:       { capacidade: 'GERIR_ACESSOS', funcao: 'acaoSalvarUsuario' },
  excluirUsuario:      { capacidade: 'GERIR_ACESSOS', funcao: 'acaoExcluirUsuario' },
  alterarPermissao:    { capacidade: 'GERIR_ACESSOS', funcao: 'acaoAlterarPermissao' },

  // gerais
  atualizarDados:      { capacidade: null,            funcao: 'acaoAtualizarDados' },
  enviarDigesto:       { capacidade: 'PROGRAMAR',     funcao: 'acaoEnviarDigesto' }
};

/** Primeira chamada do front. Tambem detecta sistema ainda nao instalado. */
function bootstrap() {
  return JSON.stringify(montarBootstrap());
}

/*
 * O bootstrap tambem custa: confere esquema, identifica a pessoa, monta a
 * lista de telas e olha o estado do RH. Como ele so muda quando o banco
 * muda, entra no mesmo esquema de geracao. E por pessoa: leva nome,
 * e-mail e tema de quem abriu.
 */
function montarBootstrap() {
  const email = emailDeQuemAbriu();
  const chave = 'boot|' + geracaoDados() + '|' + email;
  const guardado = lerTextoCache(chave);
  if (guardado) {
    try {
      const b = JSON.parse(guardado);
      b.tema = temaDoUsuario();   // preferencia e do navegador, nunca do cache
      return b;
    } catch (e) { /* segue e remonta */ }
  }

  const montado = montarBootstrapDoZero();
  if (montado.ok && montado.instalado) gravarTextoCache(chave, JSON.stringify(montado), VALIDADE_TELA);
  return montado;
}

function montarBootstrapDoZero() {
  try {
    if (!bancoInstalado()) {
      return { ok: true, instalado: false, app: APP, conta: emailDeQuemAbriu(), tema: temaDoUsuario() };
    }

    // Antes de qualquer coisa: banco de versao antiga se conserta aqui.
    try { garantirEsquema(); } catch (e) {
      return { ok: false, erro: 'Nao consegui atualizar o banco: ' + (e.message || e) };
    }

    const u = usuarioAtual();
    const telas = telasDe(u);
    return {
      ok: true,
      instalado: true,
      app: APP,
      aguardando: telas.length === 0,
      usuario: {
        nome: u.nome, email: u.email, perfil: u.perfil, turno: u.turno,
        cadastrado: u.cadastrado, escopo: descreverEscopo(u), podes: u.permissoes.podes
      },
      telas: telas,
      modulos: modulosDe(u),
      simulacao: !!u.simulado,
      tema: temaDoUsuario(),
      rh: estadoInstalacao()
    };
  } catch (erro) {
    return { ok: false, erro: String(erro.message || erro) };
  }
}

/** Segundos que um payload de tela vale no servidor. */
const VALIDADE_TELA = 180;

/*
 * A chave nao leva o e-mail de quem pediu — leva o que de fato muda o
 * conteudo: perfil, escopo e turno. Assim dez coordenadores do turno B
 * dividem o mesmo payload, e o primeiro que abrir paga por todos.
 * A excecao e o escopo PROPRIAS, onde o conteudo e pessoal mesmo.
 */
function chaveDeTela(idTela, usuario, params) {
  const e = escopoDe(usuario);
  const dono = (e.tipo === 'PROPRIAS') ? usuario.email : '';
  /*
   * O DIA entra na chave. Os indicadores dependem de "hoje" (atrasada,
   * vence hoje, mes vigente); sem o dia, uma tela montada ontem continuava
   * sendo servida e mostrava numeros de um mes que ja virou.
   */
  const dia = paraISO(hoje());
  return ['t', geracaoDados(), dia, idTela, usuario.perfil, e.tipo, usuario.turno || '', dono,
          JSON.stringify(params || {})].join('|');
}

function carregarTela(emailUsuario, idTela, params) {
  if (emailUsuario) definirEmailAtual(emailUsuario);
  const usuario = usuarioAtual();
  exigirTela(usuario, idTela);

  const tela = TELAS.filter(function (t) { return t.id === idTela; })[0];
  if (!tela) throw new Error('Tela desconhecida: ' + idTela);

  /*
   * CACHE DE TELA NO SERVIDOR.
   *
   * Sem ele, toda abertura de tela reabre a planilha (openById) e le de
   * novo cada aba que a tela usa. Com ele, uma tela ja montada volta sem
   * tocar na planilha: o tempo cai de segundos para o custo da chamada.
   * A geracao dentro da chave garante que qualquer gravacao invalida
   * tudo na hora — nao existe janela de dado velho depois de uma escrita.
   */
  const chave = chaveDeTela(idTela, usuario, params);
  const guardado = lerTextoCache(chave);
  if (guardado) return guardado;

  const executor = globalThis[tela.funcao];
  if (typeof executor !== 'function') {
    throw new Error('A tela "' + idTela + '" aponta para ' + tela.funcao + ', que nao existe.');
  }

  /*
   * Devolvemos TEXTO, nao objeto. O google.script.run serializa sozinho,
   * mas devolve null e sem aviso quando algum valor do objeto nao passa
   * pela conversao dele. Convertendo na mao, o que chega no cliente e
   * sempre uma string previsivel - e o erro, se houver, aparece aqui.
   */
  const texto = JSON.stringify({
    tela: tela.id,
    titulo: tela.nome,
    escopo: descreverEscopo(usuario),
    podes: usuario.permissoes.podes,
    dados: executor(usuario, params || {})
  });

  gravarTextoCache(chave, texto, VALIDADE_TELA);
  return texto;
}

/*
 * AQUECIMENTO.
 *
 * O Apps Script joga fora o ambiente entre uma chamada e outra: quem abre
 * o app depois de um tempo parado paga a montagem inteira. Este gatilho
 * roda de tempos em tempos, monta as telas principais e deixa tudo pronto
 * no cache — quando alguem entra, a resposta ja existe.
 *
 * So trabalha em horario util, para nao gastar cota de madrugada.
 */
function aquecerCache() {
  const hora = Number(Utilities.formatDate(new Date(), fuso(), 'H'));
  if (hora < 5 || hora > 21) return { ok: true, pulou: 'fora de horario' };
  if (!bancoInstalado()) return { ok: true, pulou: 'sem banco' };

  const admin = String(prop('EMAIL_ADMIN', '')).toLowerCase();
  if (!admin) return { ok: true, pulou: 'sem admin' };

  // Aquece na pele de quem enxerga tudo: e o payload mais caro de montar
  // e o mesmo que serve todo mundo de escopo TODOS.
  const registro = buscarAcesso(admin);
  if (!registro) return { ok: true, pulou: 'admin fora da tabela ACESSOS' };

  const usuario = montarUsuario({
    id: registro.ID, email: admin, nome: String(registro.NOME || 'admin'),
    perfil: String(registro.PERFIL || '').toUpperCase().trim(),
    turno: String(registro.TURNO || '').toUpperCase().trim(), cadastrado: true
  });

  // O bootstrap do administrador tambem entra aquecido.
  try {
    const chaveBoot = 'boot|' + geracaoDados() + '|' + admin;
    if (!lerTextoCache(chaveBoot)) {
      gravarTextoCache(chaveBoot, JSON.stringify(montarBootstrapDoZero()), VALIDADE_TELA);
    }
  } catch (e) { /* aquecer nunca pode falhar alto */ }

  let prontas = 0;
  telasDe(usuario).forEach(function (t) {
    try {
      const chave = chaveDeTela(t.id, usuario, {});
      if (lerTextoCache(chave)) return;
      const executor = globalThis[(TELAS.filter(function (x) { return x.id === t.id; })[0] || {}).funcao];
      if (typeof executor !== 'function') return;
      gravarTextoCache(chave, JSON.stringify({
        tela: t.id, titulo: t.nome, escopo: descreverEscopo(usuario),
        podes: usuario.permissoes.podes, dados: executor(usuario, {})
      }), VALIDADE_TELA);
      prontas++;
    } catch (e) { /* uma tela que falha nao pode derrubar o aquecimento */ }
  });
  return { ok: true, prontas: prontas };
}

function executarAcao(emailUsuario, nomeAcao, params) {
  if (emailUsuario) definirEmailAtual(emailUsuario);
  const usuario = usuarioAtual();
  const acao = ACOES[nomeAcao];
  if (!acao) throw new Error('Acao desconhecida: ' + nomeAcao);
  if (acao.capacidade) exigirCapacidade(usuario, acao.capacidade);

  const executor = globalThis[acao.funcao];
  if (typeof executor !== 'function') {
    throw new Error('A acao "' + nomeAcao + '" aponta para ' + acao.funcao + ', que nao existe.');
  }
  return JSON.stringify(executor(usuario, params || {}) || { ok: true });
}

/**
 * IDENTIFICACAO (login sem senha).
 *
 * O cliente manda o email digitado; conferimos na tabela ACESSOS. Se existe
 * e esta ativo, devolvemos o bootstrap completo daquela pessoa. Se nao,
 * uma mensagem clara — sem revelar se o email existe ou nao, por seguranca.
 */
function identificar(email) {
  const alvo = String(email || '').toLowerCase().trim();
  if (!alvo || alvo.indexOf('@') === -1) {
    return JSON.stringify({ ok: false, motivo: 'Digite um e-mail valido.' });
  }
  definirEmailAtual(alvo);
  try {
    const b = montarBootstrapDoZero();
    if (!b.ok) return JSON.stringify(b);
    if (b.aguardando) {
      return JSON.stringify({ ok: false, aguardando: true,
        motivo: 'Seu acesso ainda nao foi liberado pelo administrador.' });
    }
    if (!b.telas || !b.telas.length) {
      return JSON.stringify({ ok: false,
        motivo: 'Este e-mail nao tem acesso liberado. Fale com o administrador.' });
    }
    if (b.instalado && b.telas.length) {
      b.primeiraTela = JSON.parse(carregarTela(alvo, b.telas[0].id, {}));
    }
    return JSON.stringify(b);
  } catch (e) {
    return JSON.stringify({ ok: false, motivo: 'Nao consegui entrar: ' + (e.message || e) });
  }
}

/* --- Preferencia de tema, por pessoa --- */

function temaDoUsuario() {
  return PropertiesService.getUserProperties().getProperty('TEMA') || '';
}

/** Chamada direta: precisa funcionar antes mesmo da instalacao. */
function salvarTema(tema) {
  const escolhido = (tema === 'escuro') ? 'escuro' : 'claro';
  PropertiesService.getUserProperties().setProperty('TEMA', escolhido);
  return { ok: true, tema: escolhido };
}

/* --- Acoes gerais --- */

function acaoAtualizarDados() {
  limparCache();
  return { ok: true };
}

function acaoLigarGatilhos(usuario) { return instalarGatilhos(); }

/** Dispara o digesto na hora, para conferir se os e-mails saem. */
function acaoEnviarDigesto(usuario) {
  digestoMatinal();
  return { ok: true };
}

/* dadosInicio vive no Central.gs · dadosConfig no Config.gs */

function dadosAcessos(usuario) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const perfis = carregarPerfis();
  return {
    telas: TELAS.map(function (t) { return { id: t.id, nome: t.nome }; }),
    capacidades: CAPACIDADES,
    perfis: Object.keys(perfis).map(function (nome) {
      return {
        id: perfis[nome].id, perfil: nome, escopo: perfis[nome].escopo,
        descricao: perfis[nome].descricao, telas: perfis[nome].telas, podes: perfis[nome].podes
      };
    }),
    usuarios: listarAcessos().filter(function (u) { return !u.pendente; }),
    pendentes: listarAcessos().filter(function (u) { return u.pendente; }),
    turnos: ['ADM', 'A', 'B', 'C'],
    rh: estadoInstalacao()
  };
}

/** Download de anexo: o front pede, o servidor devolve os bytes. */
function obterAnexo(idArquivo) {
  usuarioAtual();  // exige sessao valida
  return baixarAnexo(idArquivo);
}


/* ------------------------------------------------------------------ */
/* MEDICAO                                                             */
/*                                                                     */
/* Rode no editor do Apps Script (Executar -> diagnostico) e leia o     */
/* registro. Serve para parar de adivinhar onde o tempo esta indo:      */
/* mostra o custo de abrir o banco, de cada tabela e de cada tela, com  */
/* e sem cache. Nao altera nada.                                       */
/* ------------------------------------------------------------------ */

function diagnostico() {
  const relogio = function (rotulo, f) {
    const t0 = Date.now();
    let nota = '';
    try { const r = f(); nota = (r && r.length !== undefined) ? (r.length + ' itens') : ''; }
    catch (e) { nota = 'ERRO: ' + (e.message || e); }
    const ms = Date.now() - t0;
    Logger.log(Utilities.formatString('%-34s %6s ms  %s', rotulo, ms, nota));
    return ms;
  };

  Logger.log('=== GSL Bartofil — diagnostico de tempo ===');
  Logger.log('geracao dos dados: ' + geracaoDados());

  relogio('abrir banco (openById)', function () { return abrirBanco().getName(); });

  Object.keys(TABELAS_CACHEAVEIS).forEach(function (tabela) {
    esquecerLeituras();
    relogio('ler ' + tabela + ' (1a vez)', function () { return listar(tabela); });
    esquecerLeituras();
    relogio('ler ' + tabela + ' (do cache)', function () { return listar(tabela); });
  });

  const u = usuarioAtual();
  telasDe(u).forEach(function (t) {
    const chave = chaveDeTela(t.id, u, {});
    CacheService.getScriptCache().remove(chave);
    relogio('montar tela ' + t.id, function () { return carregarTela(t.id, {}); });
    relogio('tela ' + t.id + ' (do cache)', function () { return carregarTela(t.id, {}); });
  });

  Logger.log('=== fim ===');
  return 'Veja o registro de execucao (Ctrl+Enter).';
}
