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
  versao: '4.2.1'
};

/*
 * ENTRADA DO SISTEMA — sem login.
 *
 * A implantacao e "Executar como: eu" + "Qualquer pessoa da Bartofil":
 * o Google Workspace so deixa chegar aqui quem esta logado com a conta
 * da empresa. O doGet apenas descobre QUEM chegou (Auth.gs), em QUAIS
 * filiais ela pode entrar (Filiais.gs) e manda tudo dentro do HTML — a
 * primeira tela abre sem nenhuma chamada ao servidor.
 *
 *   /exec                 entrada normal
 *   /exec?filial=SSA      entra direto numa filial
 *   /exec?diagnostico=1   diz se o Google esta informando quem abriu
 */
function doGet(e) {
  _porta = true;
  const pedido = (e && e.parameter) || {};
  if (pedido.diagnostico) return paginaDiagnostico_();

  let carga;
  try {
    /*
     * 4.2: sem sessao, a pagina abre na tela de ENTRADA (e-mail + PIN).
     * Com ?t=<sessao> (a navegacao de reserva leva o codigo), abre direto.
     */
    if (!modoGoogle_() && bancoInstalado()) {
      _tokenDaVez = String(pedido.t || '');
      if (!emailDaSessao_(_tokenDaVez)) {
        _tokenDaVez = '';
        return paginaComCarga_({ ok: true, instalado: true, entrada: 'ENTRAR', sessaoInvalida: !!pedido.t });
      }
    }
    carga = montarEntrada_(pedido.filial);
    if (_tokenDaVez) carga.token = _tokenDaVez;
    /*
     * ?tela=assiduidade — a tela ja vem montada dentro do HTML.
     * E o caminho de reserva do cliente: se o google.script.run for
     * barrado numa maquina (HTTP 403), abrir uma tela vira navegacao de
     * pagina, que passa onde a chamada nao passa.
     */
    if (carga.ok && carga.entrada === 'APP' && pedido.tela) {
      // Parametros da tela vem em ?p= (JSON) — antes a reserva perdia os filtros.
      let params = {};
      try { params = pedido.p ? (JSON.parse(String(pedido.p)) || {}) : {}; } catch (x) { params = {}; }
      try {
        carga.telaEmbutida = { id: String(pedido.tela), params: params,
          resposta: JSON.parse(carregarTela({ t: _tokenDaVez, f: carga.filial.codigo }, String(pedido.tela), params)) };
      } catch (erroTela) { carga.avisoTela = String(erroTela.message || erroTela); }
    }
  } catch (erro) {
    carga = { ok: false, erro: String(erro.message || erro) };
  }
  return paginaComCarga_(carga);
}

/*
 * RESERVA DA ENTRADA. Onde o google.script.run e barrado (HTTP 403), o
 * formulario de e-mail e PIN e enviado como POST para o proprio /exec —
 * navegacao de pagina, que passa onde a chamada nao passa.
 */
function doPost(e) {
  _porta = true;
  const p = (e && e.parameter) || {};
  let carga;
  try {
    const r = entrar_(p.email, p.pin, p.confirmacao, p.filial);
    carga = (r && r.ok) ? r : { ok: true, instalado: true, entrada: 'ENTRAR',
      erroEntrada: (r && (r.erro || r.recado)) || 'Não consegui entrar.', criarPin: !!(r && r.criarPin),
      emailDigitado: String(p.email || '') };
  } catch (erro) {
    carga = { ok: true, instalado: true, entrada: 'ENTRAR', erroEntrada: String(erro.message || erro),
              emailDigitado: String(p.email || '') };
  }
  return paginaComCarga_(carga);
}

function paginaComCarga_(carga) {
  carga.urlApp = urlDoApp_();
  const t = HtmlService.createTemplateFromFile('Index');
  t.app = APP;
  // "<" escapado: um texto com </script> dentro de um nome nao pode
  // fechar a tag do script que carrega os dados.
  // "/" escapado (4.2.2): o HtmlService apaga o que parece comentario de
  // JavaScript, e o https: da urlApp tem duas barras seguidas. \u002f e o
  // mesmo "/" para o JSON e para o navegador — e nao sobra barra nenhuma.
  t.inicial = JSON.stringify(carga).replace(/</g, '\\u003c').replace(/\//g, '\\u002f');
  return t.evaluate()
    .setTitle(APP.nome)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function urlDoApp_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/*
 * O que a tela precisa para abrir. Cada resposta tem `entrada`:
 *   INSTALAR         banco ainda nao existe
 *   SEM_CONTA        o Google nao informou quem abriu
 *   SEM_CADASTRO     conta nao cadastrada em Pessoas e acessos
 *   DESATIVADO       cadastro desligado
 *   SEM_NIVEL        cadastro sem nivel de acesso
 *   SEM_FILIAL       cadastro sem nenhuma filial ativa
 *   ESCOLHER_FILIAL  a pessoa tem mais de uma filial: ela escolhe
 *   APP              sessao pronta
 */
function montarEntrada_(codigoFilial) {
  if (!bancoInstalado()) {
    return { ok: true, instalado: false, entrada: 'INSTALAR', conta: emailDeQuemAbriu() };
  }

  // O banco mestre se atualiza sozinho na primeira abertura depois de
  // uma versao nova (tabelas, colunas, filial principal).
  try { garantirEsquema(); } catch (erro) {
    return { ok: false, erro: 'Não consegui atualizar o banco: ' + (erro.message || erro) };
  }

  let usuario;
  try {
    usuario = usuarioAtual();
  } catch (erro) {
    if (erro.tipoEntrada) {
      return { ok: true, instalado: true, entrada: erro.tipoEntrada,
               motivo: String(erro.message || erro), conta: erro.email || emailDeQuemAbriu() };
    }
    throw erro;
  }

  const filiais = filiaisDoUsuario(usuario);
  if (!filiais.length) {
    return { ok: true, instalado: true, entrada: 'SEM_FILIAL', conta: usuario.email,
             motivo: 'Seu cadastro não está ligado a nenhuma filial ativa. Fale com o administrador.' };
  }

  let pedida = String(codigoFilial || '').toUpperCase().trim();
  // Filial pedida que a pessoa nao tem (desligada, favorito antigo): ignora.
  if (pedida && !filiais.some(function (f) { return f.codigo === pedida; })) pedida = '';
  if (!pedida && filiais.length > 1) {
    return {
      ok: true, instalado: true, entrada: 'ESCOLHER_FILIAL',
      usuario: { nome: usuario.nome, email: usuario.email },
      filiais: resumoDasFiliais_(filiais)
    };
  }

  registrarEntrada_(usuario.email);
  return montarSessaoNaFilial_(usuario, pedida || filiais[0].codigo);
}

function resumoDasFiliais_(lista) {
  return lista.map(function (f) {
    const paineis = PAINEIS.filter(function (p) {
      const e = f.paineis[p.id];
      return e === PAINEL_ATIVO;
    }).map(function (p) { return p.nome; });
    return { codigo: f.codigo, nome: f.nome, cidade: f.cidade, principal: f.principal, paineis: paineis };
  });
}

/** A sessao inteira de uma pessoa dentro de uma filial. */
function montarSessaoNaFilial_(usuario, codigo) {
  const filial = entrarNaFilial(usuario, codigo);

  // O banco da filial tambem se atualiza sozinho (cada um tem a sua versao).
  try { garantirEsquema(); } catch (erro) {
    return { ok: false, erro: 'Não consegui preparar o banco da filial ' + filial.nome + ': ' + (erro.message || erro) };
  }

  const telas = telasDe(usuario);
  return {
    ok: true,
    instalado: true,
    entrada: 'APP',
    app: APP,
    usuario: {
      nome: usuario.nome, email: usuario.email, papel: usuario.papel || '', perfil: usuario.perfil,
      turno: usuario.turno, escopo: descreverEscopo(usuario), podes: usuario.permissoes.podes
    },
    admin: ehAdministrador(usuario),
    filial: { codigo: filial.codigo, nome: filial.nome, cidade: filial.cidade, principal: filial.principal },
    filiais: resumoDasFiliais_(filiaisDoUsuario(usuario)),
    telas: telas,
    modulos: modulosDe(usuario),
    simulacao: !!usuario.simulado
  };
}

/** Chamada pela tela de escolha de filial (e pelo botao "Trocar filial"). */
function abrirFilial(ctx) {
  const codigo = contextoDaChamada_(ctx);
  try {
    const usuario = usuarioAtual();
    return JSON.stringify(montarSessaoNaFilial_(usuario, codigo));
  } catch (erro) {
    return JSON.stringify({ ok: false, entrada: erro.tipoEntrada || '', erro: String(erro.message || erro) });
  }
}

/*
 * REGISTRO DE ENTRADA — quem entrou e quando. No maximo uma linha a cada
 * 30 minutos por pessoa, senao cada F5 viraria uma linha no LOG.
 */
const ENTRADA_INTERVALO_MIN = 30;

function registrarEntrada_(email) {
  try {
    const chave = 'entrada_' + String(email).replace(/[^a-z0-9]/gi, '_');
    const cache = CacheService.getScriptCache();
    if (cache.get(chave)) return;
    cache.put(chave, '1', ENTRADA_INTERVALO_MIN * 60);
    registrarLog(email, 'ENTRADA', 'ACESSOS', email, 'Entrou pelo sistema');
  } catch (e) { /* o registro nao pode impedir ninguem de entrar */ }
}

function paginaDiagnostico_() {
  let d;
  try { d = diagnosticoIdentidade(); }
  catch (erro) { d = { veredito: 'O diagnostico falhou: ' + (erro.message || erro) }; }

  const linha = (r, v) => '<tr><td style="padding:8px 14px;color:#555">' + r +
    '</td><td style="padding:8px 14px;font-weight:bold">' + v + '</td></tr>';

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;color:#14152B">' +
    '<div style="background:#111785;color:#fff;padding:14px 18px;font-weight:bold">GSL — diagnóstico de identidade</div>' +
    '<table style="width:100%;border-collapse:collapse;background:#f7f8fc">' +
    linha('Quem o Google diz que abriu', d.usuarioAtivo || '(vazio)') +
    linha('Conta que executa o script', d.donoDoScript || '(vazio)') +
    linha('Cadastrada no GSL?', d.cadastrado ? 'SIM — ' + (d.perfil || '') : 'NÃO') +
    '</table>' +
    '<p style="line-height:1.7;background:#FFF8D6;padding:14px 18px;border-left:4px solid #EA6D0B">' +
    d.veredito + '</p></div>';

  return HtmlService.createHtmlOutput(html).setTitle('GSL — diagnóstico');
}

function acaoDiagnosticoIdentidade(usuario) {
  return diagnosticoIdentidade();
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
  entregar:            { capacidade: 'ENTREGAR',      funcao: 'acaoEntregar', modulo: 'calendario' },
  validar:             { capacidade: 'VALIDAR',       funcao: 'acaoValidar', modulo: 'calendario' },
  definirSetor:        { capacidade: 'PROGRAMAR',     funcao: 'acaoDefinirSetor', modulo: 'calendario' },
  remarcar:            { capacidade: 'PROGRAMAR',     funcao: 'acaoRemarcar', modulo: 'calendario' },
  agendarTreinamento:  { capacidade: 'PROGRAMAR',     funcao: 'acaoAgendarTreinamento', modulo: 'calendario' },
  removerAnexo:        { capacidade: 'ANEXAR',        funcao: 'acaoRemoverAnexoAtividade', modulo: 'calendario' },
  detalhesAtividade:   { capacidade: null,            funcao: 'acaoDetalhesAtividade', modulo: 'calendario' },
  iniciarEntrega:      { capacidade: null,            funcao: 'acaoIniciarEntrega', modulo: 'calendario' },
  receberParte:        { capacidade: null,            funcao: 'acaoReceberParte', modulo: 'calendario' },
  finalizarEntrega:    { capacidade: null,            funcao: 'acaoFinalizarEntrega', modulo: 'calendario' },
  criarAtividade:      { capacidade: 'PROGRAMAR',     funcao: 'acaoCriarAtividade', modulo: 'calendario' },
  cancelarAtividade:   { capacidade: 'VALIDAR',       funcao: 'acaoCancelarAtividade', modulo: 'calendario' },
  cancelarCompetencia: { capacidade: 'VALIDAR',       funcao: 'acaoCancelarCompetencia', modulo: 'calendario' },
  reativarAtividade:   { capacidade: 'VALIDAR',       funcao: 'acaoReativarAtividade', modulo: 'calendario' },
  diagnosticoAcesso:   { capacidade: null,            funcao: 'acaoDiagnosticoAcesso' },
  diagnosticoIdentidade: { capacidade: null,          funcao: 'acaoDiagnosticoIdentidade' },
  gerarMes:            { capacidade: 'PROGRAMAR',     funcao: 'acaoGerarMes', modulo: ['calendario', 'config'] },
  restaurarPerfis:     { capacidade: 'GERIR_ACESSOS', funcao: 'acaoRestaurarPerfis' },

  /*
   * PLANO DE ACAO.
   * Concluir tem capacidade null de proposito: quem conclui e o
   * RESPONSAVEL pela acao, e isso a propria funcao confere. Exigir
   * GERIR_ACOES aqui trancaria o coordenador fora da acao dele.
   */
  salvarAcao:          { capacidade: 'GERIR_ACOES',   funcao: 'acaoSalvarAcao', modulo: 'calendario' },
  concluirAcao:        { capacidade: null,            funcao: 'acaoConcluirAcao', modulo: 'calendario' },
  reabrirAcao:         { capacidade: 'GERIR_ACOES',   funcao: 'acaoReabrirAcao', modulo: 'calendario' },
  cancelarAcao:        { capacidade: 'GERIR_ACOES',   funcao: 'acaoCancelarAcao', modulo: 'calendario' },
  excluirAcao:         { capacidade: 'GERIR_ACOES',   funcao: 'acaoExcluirAcao', modulo: 'calendario' },

  // Conversas saiu na 4.2 (projeto para depois). As mensagens antigas
  // continuam na aba MENSAGENS; so nao ha mais tela nem acao para elas.

  /*
   * Feedback e capacidade null porque quem esta travado num erro e
   * justamente quem tem menos permissao para contornar sozinho.
   */
  enviarFeedback:      { capacidade: null,            funcao: 'acaoEnviarFeedback' },
  resolverFeedback:    { capacidade: 'GERIR_ACESSOS', funcao: 'acaoResolverFeedback' },

  // configuracao
  salvarSetor:         { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarSetor' },
  excluirSetor:        { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirSetor' },
  salvarRotina:        { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarRotina' },
  excluirRotina:       { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirRotina' },
  salvarParametro:     { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarParametro' },
  corrigirFuso:        { capacidade: 'GERIR_ACESSOS', funcao: 'acaoCorrigirFuso' },
  ligarGatilhos:       { capacidade: 'GERIR_ACESSOS', funcao: 'acaoLigarGatilhos' },

  // GSL-DADOS
  salvarArquivoRH:     { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarArquivoRH', modulo: ['assiduidade', 'config'] },
  excluirArquivoRH:    { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirArquivoRH', modulo: ['assiduidade', 'config'] },
  previewImportacao:   { capacidade: 'PROGRAMAR',     funcao: 'acaoPreviewImportacao', modulo: ['assiduidade', 'config'] },
  importarCompetencia: { capacidade: 'PROGRAMAR',     funcao: 'acaoImportarCompetencia', modulo: ['assiduidade', 'config'] },
  codigosPendentes:    { capacidade: 'PROGRAMAR',     funcao: 'acaoCodigosPendentes', modulo: ['assiduidade', 'config'] },
  salvarDePara:        { capacidade: 'PROGRAMAR',     funcao: 'acaoSalvarDePara', modulo: ['assiduidade', 'config'] },
  excluirDePara:       { capacidade: 'PROGRAMAR',     funcao: 'acaoExcluirDePara', modulo: ['assiduidade', 'config'] },
  reclassificar:       { capacidade: 'PROGRAMAR',     funcao: 'acaoReclassificar', modulo: ['assiduidade', 'config'] },
  fichaColaborador:    { capacidade: 'VER_INDIVIDUAL', funcao: 'acaoFichaColaborador', modulo: 'assiduidade' },
  // A aba COLABORADORES le do AGR_COLAB sob demanda — a lista nao cabia
  // no payload do painel (limite de 50 mil caracteres por celula) e era
  // por isso que a aba nao carregava.
  colaboradores:       { capacidade: 'VER_INDIVIDUAL', funcao: 'acaoColaboradores', modulo: 'assiduidade' },
  periodo:             { capacidade: null,            funcao: 'acaoPeriodo', modulo: 'assiduidade' },
  atualizarRH:         { capacidade: 'PROGRAMAR',     funcao: 'acaoAtualizarRH', modulo: ['assiduidade', 'config'] },
  diagnosticoRH:       { capacidade: null,            funcao: 'acaoDiagnosticoRH', modulo: ['assiduidade', 'config'] },
  restaurarDePara:     { capacidade: 'PROGRAMAR',     funcao: 'acaoRestaurarDePara', modulo: ['assiduidade', 'config'] },
  // Tira da base as competencias sem cadastro (sobras de renomear/excluir antigos).
  limparOrfasRH:       { capacidade: 'PROGRAMAR',     funcao: 'acaoLimparOrfasRH', modulo: ['assiduidade', 'config'] },

  // pessoas e acessos
  salvarUsuario:       { capacidade: 'GERIR_ACESSOS', funcao: 'acaoSalvarUsuario' },
  excluirUsuario:      { capacidade: 'GERIR_ACESSOS', funcao: 'acaoExcluirUsuario' },
  alterarPermissao:    { capacidade: 'GERIR_ACESSOS', funcao: 'acaoAlterarPermissao' },
  alternarAtivo:       { capacidade: 'GERIR_ACESSOS', funcao: 'acaoAlternarAtivo' },
  definirModuloPessoa: { capacidade: 'GERIR_ACESSOS', funcao: 'acaoDefinirModuloPessoa' },
  salvarPessoasFilial: { capacidade: 'GERIR_FILIAIS', funcao: 'acaoSalvarPessoasDaFilial' },

  // estoque de TI
  salvarItemEstoque:   { capacidade: 'GERIR_ESTOQUE',      funcao: 'acaoSalvarItemEstoque', modulo: 'estoque' },
  excluirItemEstoque:  { capacidade: 'GERIR_ESTOQUE',      funcao: 'acaoExcluirItemEstoque', modulo: 'estoque' },
  importarItensEstoque:{ capacidade: 'GERIR_ESTOQUE',      funcao: 'acaoImportarItensEstoque', modulo: 'estoque' },
  movimentarEstoque:   { capacidade: 'MOVIMENTAR_ESTOQUE', funcao: 'acaoMovimentarEstoque', modulo: 'estoque' },
  estornarMovimento:   { capacidade: 'GERIR_ESTOQUE',      funcao: 'acaoEstornarMovimento', modulo: 'estoque' },
  inventarioEstoque:   { capacidade: 'GERIR_ESTOQUE',      funcao: 'acaoInventarioEstoque', modulo: 'estoque' },
  // leitura sob demanda: historico completo de um item (a tela leva so ~90 dias)
  historicoItemEstoque:{ capacidade: null,                 funcao: 'acaoHistoricoItemEstoque', modulo: 'estoque' },

  // filiais e paineis
  salvarFilial:        { capacidade: 'GERIR_FILIAIS', funcao: 'acaoSalvarFilial' },
  alterarPainel:       { capacidade: 'GERIR_FILIAIS', funcao: 'acaoAlterarPainel' },
  alternarFilial:      { capacidade: 'GERIR_FILIAIS', funcao: 'acaoAlternarFilial' },

  // nobreaks
  lancarLeituras:      { capacidade: 'LANCAR_NOBREAK', funcao: 'acaoLancarLeituras', modulo: 'nobreaks' },
  salvarLeitura:       { capacidade: 'LANCAR_NOBREAK', funcao: 'acaoSalvarLeitura', modulo: 'nobreaks' },
  excluirLeitura:      { capacidade: 'LANCAR_NOBREAK', funcao: 'acaoExcluirLeitura', modulo: 'nobreaks' },
  semanaNobreak:       { capacidade: null,             funcao: 'acaoSemanaNobreak', modulo: 'nobreaks' },
  salvarNobreak:       { capacidade: 'PROGRAMAR',      funcao: 'acaoSalvarNobreak', modulo: 'nobreaks' },
  excluirNobreak:      { capacidade: 'PROGRAMAR',      funcao: 'acaoExcluirNobreak', modulo: 'nobreaks' },
  importarNobreaks:    { capacidade: 'PROGRAMAR',      funcao: 'acaoImportarNobreaks', modulo: 'nobreaks' },

  // limpeza
  salvarAcaoLimpeza:   { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoSalvarAcaoLimpeza', modulo: 'limpeza' },
  concluirAcaoLimpeza: { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoConcluirAcaoLimpeza', modulo: 'limpeza' },
  excluirAcaoLimpeza:  { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoExcluirAcaoLimpeza', modulo: 'limpeza' },
  salvarProduto:       { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoSalvarProduto', modulo: 'limpeza' },
  excluirProduto:      { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoExcluirProduto', modulo: 'limpeza' },
  salvarCompra:        { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoSalvarCompra', modulo: 'limpeza' },
  excluirCompra:       { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoExcluirCompra', modulo: 'limpeza' },
  salvarEmbalagem:     { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoSalvarEmbalagem', modulo: 'limpeza' },
  excluirEmbalagem:    { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoExcluirEmbalagem', modulo: 'limpeza' },
  salvarZona:          { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoSalvarZona', modulo: 'limpeza' },
  importarLimpeza:     { capacidade: 'GERIR_LIMPEZA',  funcao: 'acaoImportarLimpeza', modulo: 'limpeza' },

  // quadro do CD
  salvarFonteQuadro:   { capacidade: 'PROGRAMAR',      funcao: 'acaoSalvarFonteQuadro', modulo: ['quadro', 'config'] },
  atualizarQuadro:     { capacidade: null,             funcao: 'acaoAtualizarQuadro', modulo: 'quadro' },

  // entrada (4.2)
  zerarPin:            { capacidade: 'GERIR_ACESSOS', funcao: 'acaoZerarPin' },

  // gerais
  atualizarDados:      { capacidade: null,            funcao: 'acaoAtualizarDados' },
  enviarDigesto:       { capacidade: 'PROGRAMAR',     funcao: 'acaoEnviarDigesto' }
};

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
  // A filial entra na chave: a mesma tela de duas filiais sao dois payloads.
  return ['t', geracaoDados(), dia, filialAtual().codigo, idTela, usuario.perfil, usuario.chaveModulos || '',
          e.tipo, usuario.turno || '', dono, JSON.stringify(params || {})].join('|');
}

/*
 * O primeiro argumento e a FILIAL em que a pessoa esta. Quem ela e o
 * servidor sabe sozinho (sessao Google); a filial e conferida contra o
 * cadastro dela antes de qualquer leitura.
 */
function carregarTela(ctx, idTela, params) {
  const codigoFilial = contextoDaChamada_(ctx);
  const usuario = usuarioAtual();
  entrarNaFilial(usuario, codigoFilial);
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
  exigirPorta_();
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
    turno: String(registro.TURNO || '').toUpperCase().trim(), filiais: '*', cadastrado: true
  });

  let prontas = 0;
  emCadaFilial_(null, function () {
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
  });
  return { ok: true, prontas: prontas };
}

function executarAcao(ctx, nomeAcao, params) {
  const codigoFilial = contextoDaChamada_(ctx);
  const usuario = usuarioAtual();
  entrarNaFilial(usuario, codigoFilial);
  const acao = ACOES[nomeAcao];
  if (!acao) throw new Error('Ação desconhecida: ' + nomeAcao);
  if (acao.capacidade) exigirCapacidade(usuario, acao.capacidade);
  exigirModuloDaAcao_(usuario, acao);

  const executor = globalThis[acao.funcao];
  if (typeof executor !== 'function') {
    throw new Error('A ação "' + nomeAcao + '" aponta para ' + acao.funcao + ', que nao existe.');
  }
  return JSON.stringify(executor(usuario, params || {}) || { ok: true });
}

/*
 * A PORTA CONFERE O MODULO, NAO SO A CAPACIDADE.
 *
 * Capacidade diz O QUE a pessoa pode fazer; o modulo diz ONDE. Sem esta
 * conferencia, quem estava com "Sem acesso" num modulo (ajuste por pessoa)
 * ou numa filial com o painel desativado continuava lendo e gravando nele
 * chamando a acao direto — a tela sumia, a porta ficava aberta.
 * `modulo` pode ser um id ou uma lista (basta enxergar um deles).
 */
function exigirModuloDaAcao_(usuario, acao) {
  if (!acao.modulo) return;
  const lista = [].concat(acao.modulo);
  const telas = telasDe(usuario);
  const ve = lista.some(function (m) { return telas.some(function (t) { return t.modulo === m; }); });
  if (!ve) {
    const nome = (MODULOS.filter(function (m) { return m.id === lista[0]; })[0] || {}).nome || lista[0];
    throw new Error('Você não tem acesso ao módulo ' + nome + ' na filial ' + filialAtual().nome + '.');
  }
}

/* --- Acoes gerais --- */

function acaoAtualizarDados() {
  // Aproveita a varrida para alinhar rotulo de mes e semana ao prazo de
  // cada atividade. Uma linha remarcada por uma versao antiga ficou com
  // COMPETENCIA de agosto e prazo em setembro; e aqui que ela se acerta.
  let corrigidas = 0;
  try { corrigidas = (corrigirCompetencias('atualizar dados') || {}).corrigidas || 0; } catch (e) {}
  limparCache();
  return { ok: true, recado: corrigidas
    ? 'Dados atualizados — ' + corrigidas + ' atividade(s) tiveram o mês corrigido pela data do prazo.'
    : '' };
}

function acaoLigarGatilhos(usuario) { return instalarGatilhos(); }

/** Dispara o digesto na hora, para conferir se os e-mails saem. */
function acaoEnviarDigesto(usuario) {
  digestoMatinal();
  return { ok: true };
}

/* dadosInicio vive no Central.gs · dadosConfig no Config.gs */

/*
 * TELA "PESSOAS E ACESSOS" — uma so.
 *
 * Substituiu as duas que existiam: o cartao "Equipe" da Configuracao
 * (com o botao "Nova pessoa") e a tela "Acessos" (com o botao "Novo
 * usuario"). Eram as mesmas pessoas em dois cadastros que nao
 * conversavam — dava para ter o Gerente cadastrado como COORDENADOR sem
 * ninguem notar, e era exatamente o que estava acontecendo.
 */
function dadosPessoas(usuario) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const perfis = carregarPerfis();
  const pessoas = listarPessoas();

  // Para a tabela "Modulos por pessoa": o que cada um ve de fato, ja com
  // o nivel e o ajuste dele.
  pessoas.forEach(function (p) {
    const nivel = permissoesDe(p.perfil);
    const perm = p.perfil === 'ADMIN' ? nivel : aplicarModulosDaPessoa(nivel, p.modulos);
    p.efetivo = {};
    p.padrao = {};
    Object.keys(MODULOS_AJUSTAVEIS).forEach(function (m) {
      p.efetivo[m] = modoEfetivo(perm, m);
      p.padrao[m] = modoEfetivo(nivel, m);
    });
  });
  return {
    pessoas: pessoas,
    modulosAjustaveis: MODULOS.filter(function (m) { return MODULOS_AJUSTAVEIS[m.id]; }).map(function (m) {
      return { id: m.id, nome: m.nome, editavel: MODULOS_AJUSTAVEIS[m.id].length > 0 };
    }),
    filiais: listarFiliais().map(function (f) {
      return { codigo: f.codigo, nome: f.nome, principal: f.principal, ativa: f.ativa };
    }),
    niveis: Object.keys(perfis).filter(function (n) { return n !== PERFIL_PADRAO_NOVO_USUARIO; }).sort(),
    telas: TELAS.map(function (t) { return { id: t.id, nome: t.nome }; }),
    capacidades: CAPACIDADES,
    perfis: Object.keys(perfis).map(function (nome) {
      return {
        id: perfis[nome].id, perfil: nome, escopo: perfis[nome].escopo,
        descricao: perfis[nome].descricao, telas: perfis[nome].telas, podes: perfis[nome].podes
      };
    }),
    turnos: ['ADM', 'A', 'B', 'C', 'J', 'BC'],
    escopos: ESCOPOS,
    eu: usuario.email
  };
}

/* Nome antigo — alguma chamada solta pode ainda existir. */
function dadosAcessos(usuario) { return dadosPessoas(usuario); }

/** true se o arquivo esta dentro da pasta raiz do GSL (sobe no maximo 8 niveis). */
function arquivoDoGsl_(idArquivo) {
  const raiz = String(prop('ID_PASTA_RAIZ', ''));
  if (!raiz || !idArquivo) return false;
  let pais;
  try { pais = DriveApp.getFileById(String(idArquivo)).getParents(); } catch (e) { return false; }
  for (let nivel = 0; nivel < 8 && pais.hasNext(); nivel++) {
    const pasta = pais.next();
    if (pasta.getId() === raiz) return true;
    pais = pasta.getParents();
  }
  return false;
}

/** Download de anexo: o front pede, o servidor devolve os bytes. */
function obterAnexo(ctx, idArquivo) {
  contextoDaChamada_(ctx);
  usuarioAtual();  // exige sessao valida
  // So arquivo que mora dentro da pasta do GSL. Antes, qualquer ID do Drive
  // do dono (que e quem executa o script) saia por aqui.
  if (!arquivoDoGsl_(idArquivo)) throw new Error('Este arquivo não é um anexo do GSL.');
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
  exigirDono_();
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

  // Pelo editor nao ha sessao de navegador: abre uma so para medir.
  if (!modoGoogle_()) _tokenDaVez = criarSessao_(emailDeQuemAbriu());
  const u = usuarioAtual();
  const f = { t: _tokenDaVez, f: filialAtual().codigo };
  telasDe(u).forEach(function (t) {
    const chave = chaveDeTela(t.id, u, {});
    CacheService.getScriptCache().remove(chave);
    relogio('montar tela ' + t.id, function () { return carregarTela(f, t.id, {}); });
    relogio('tela ' + t.id + ' (do cache)', function () { return carregarTela(f, t.id, {}); });
  });

  Logger.log('=== fim ===');
  return 'Veja o registro de execucao (Ctrl+Enter).';
}


/* ------------------------------------------------------------------ */
/* RELATOS DE ERRO (o botao "Reportar erro")                           */
/*                                                                     */
/* Moravam no Conversas.gs, que saiu na 4.2 junto com o chat. A lista  */
/* ganhou tela propria: Configuracao › Relatos de erro.                */
/* ------------------------------------------------------------------ */

const FEEDBACK_TIPOS = ['ERRO', 'SUGESTAO', 'DUVIDA'];

/* Instante real do registro: o ID carrega o milissegundo da criacao. */
function instanteDoRegistro_(r) {
  const partes = String(r.ID || '').split('-');
  if (partes.length >= 3) {
    const ms = parseInt(partes[1], 36);
    if (ms > 1e12 && ms < 1e14) return ms;
  }
  return instanteDoCarimbo(r.CRIADO_EM);
}

/**
 * Qualquer pessoa pode reportar. Nao exige capacidade nenhuma de
 * proposito: quem esta travado num erro e justamente quem tem menos
 * permissao para contornar.
 */
function acaoEnviarFeedback(usuario, params) {
  const texto = String(params.texto || '').trim();
  if (!texto) throw new Error('Descreva o que aconteceu.');

  const tipo = String(params.tipo || 'ERRO').toUpperCase().trim();
  const id = inserir('FEEDBACK', {
    TIPO: FEEDBACK_TIPOS.indexOf(tipo) !== -1 ? tipo : 'ERRO',
    TELA: String(params.tela || '').trim(),
    TEXTO: texto,
    AUTOR: String(usuario.email || '').toLowerCase().trim(),
    AUTOR_NOME: usuario.nome || usuario.email,
    NAVEGADOR: String(params.navegador || '').slice(0, 300),
    SITUACAO: 'ABERTO',
    RESPOSTA: '', RESPONDIDO_EM: '', RESPONDIDO_POR: ''
  }, usuario.email);

  let avisoEmail = '';
  try {
    const admin = prop('EMAIL_ADMIN', '');
    if (admin) {
      enviar([admin], '[GSL] ' + tipo + ' reportado por ' + (usuario.nome || usuario.email),
        '<p><strong>' + htmlSeguro(usuario.nome || usuario.email) + '</strong> reportou:</p>' +
        '<p style="border-left:3px solid #C62828;padding-left:12px">' + htmlSeguro(texto) + '</p>' +
        '<p style="color:#666;font-size:12px">Tela: ' + htmlSeguro(params.tela || '—') +
        '<br>Navegador: ' + htmlSeguro(String(params.navegador || '—').slice(0, 200)) + '</p>' +
        rodapeLink());
    }
  } catch (e) {
    avisoEmail = 'Registrei o seu relato, mas o aviso por e-mail não saiu: ' + (e.message || e);
  }

  const r = { id: id, recado: 'Recebi. Obrigado por avisar.' };
  if (avisoEmail) r.avisoEmail = avisoEmail;
  return r;
}

function listarFeedback() {
  return listar('FEEDBACK').map(function (f) {
    return {
      id: String(f.ID || ''),
      tipo: String(f.TIPO || '').toUpperCase().trim(),
      tela: String(f.TELA || '').trim(),
      texto: String(f.TEXTO || ''),
      autorNome: String(f.AUTOR_NOME || '').trim() || String(f.AUTOR || '').split('@')[0],
      autor: String(f.AUTOR || ''),
      quando: String(f.CRIADO_EM || '').trim(),
      ordem: instanteDoRegistro_(f),
      situacao: String(f.SITUACAO || 'ABERTO').toUpperCase().trim(),
      resposta: String(f.RESPOSTA || '').trim()
    };
  }).sort(function (a, b) {
    // Abertos primeiro; dentro de cada grupo, o mais recente em cima.
    if (a.situacao !== b.situacao) return a.situacao === 'ABERTO' ? -1 : 1;
    return b.ordem - a.ordem;
  });
}

function acaoResolverFeedback(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const id = String(params.id || '').trim();
  const registro = obter('FEEDBACK', id);
  if (!registro) throw new Error('Relato não encontrado.');

  atualizar('FEEDBACK', id, {
    SITUACAO: 'RESOLVIDO',
    RESPOSTA: String(params.resposta || '').trim(),
    RESPONDIDO_EM: agoraTexto(),
    RESPONDIDO_POR: usuario.email
  }, usuario.email);

  // Quem reportou merece saber que foi resolvido.
  try {
    const autor = String(registro.AUTOR || '').toLowerCase().trim();
    if (autor && params.resposta) {
      enviar([autor], '[GSL] Resolvido: o que você reportou',
        '<p>Você reportou:</p><p style="color:#666">' + htmlSeguro(registro.TEXTO) + '</p>' +
        '<p><strong>Resposta:</strong></p><p>' + htmlSeguro(params.resposta) + '</p>' + rodapeLink());
    }
  } catch (e) { /* o relato ja esta resolvido; o aviso e extra */ }

  return { recado: 'Relato resolvido.' };
}

/* Tela Configuracao › Relatos de erro. */
function dadosRelatos(usuario) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  return { feedbacks: listarFeedback(), podeVerFeedback: true };
}
