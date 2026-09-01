/**
 * IDENTIDADE
 *
 * Responde uma pergunta so: quem abriu o sistema.
 * O que a pessoa pode fazer e assunto do Permissoes.gs.
 * Os usuarios vivem na tabela ACESSOS do banco - cadastrados pelo app.
 */

/*
 * MEMORIA DE EXECUCAO.
 *
 * usuarioAtual() e chamado no comeco de toda requisicao — e as vezes mais
 * de uma vez dentro da mesma. Cada chamada lia o cache de ACESSOS e
 * remontava a matriz de permissoes do perfil. Agora a resposta e calculada
 * UMA vez por execucao; a variavel morre junto com a requisicao, entao nao
 * ha risco de servir a identidade de uma pessoa para outra.
 */
var _usuarioDaVez = null;
var _emailInformado = '';   // email que o cliente mandou (guardado no navegador)

function usuarioAtual() {
  if (_usuarioDaVez) return _usuarioDaVez;
  _usuarioDaVez = calcularUsuarioAtual();
  return _usuarioDaVez;
}

/** O cliente informa quem esta usando; vale por esta requisicao. */
function definirEmailAtual(email) {
  _emailInformado = String(email || '').toLowerCase().trim();
  _usuarioDaVez = null;
}

/** Zera a memoria quando o proprio usuario muda (simulacao, novo perfil). */
function esquecerUsuario() { _usuarioDaVez = null; }

function calcularUsuarioAtual() {
  // Prioridade: 1) email informado pela tela de identificacao;
  //             2) sessao Google (funciona so em alguns modos de publicacao).
  const email = _emailInformado || emailDeQuemAbriu();
  if (!email) {
    // Sem email: o cliente vai mostrar a tela de identificacao.
    const e = new Error('IDENTIFICAR');
    e.identificar = true;
    throw e;
  }

  const simulado = simulacaoAtiva(email);
  if (simulado) return montarUsuario(simulado);

  const registro = buscarAcesso(email);
  if (!registro) {
    /*
     * Antes, quem digitasse um e-mail desconhecido era cadastrado em
     * silencio como PENDENTE e via uma tela de espera sem ter pedido
     * nada. Agora nao existe cadastro automatico: a tela de login
     * oferece o formulario de pedido, e e a pessoa que decide pedir.
     */
    const e = new Error('SEM_CADASTRO');
    e.semCadastro = true;
    throw e;
  }

  const situacao = String(registro.SITUACAO || '').toUpperCase().trim();
  if (situacao === 'RECUSADO') {
    throw new Error('O seu pedido de acesso não foi aprovado. Fale com o administrador.');
  }
  if (!marcado(registro.ATIVO) && situacao !== 'PENDENTE') {
    throw new Error('Seu acesso ao sistema está desativado. Procure o administrador.');
  }

  return montarUsuario({
    id: registro.ID,
    novo: String(registro.PERFIL || '').toUpperCase().trim() === PERFIL_PADRAO_NOVO_USUARIO,
    email: email,
    nome: nomeDaPessoa(email, registro.NOME),
    papel: String(registro.PAPEL || '').trim(),
    perfil: String(registro.PERFIL || PERFIL_PADRAO_NOVO_USUARIO).toUpperCase().trim(),
    turno: String(registro.TURNO || '').toUpperCase().trim(),
    situacao: situacao || 'ATIVO',
    cadastrado: true
  });
}

/*
 * Nome de quem esta usando. O rodape da barra lateral mostrava
 * "hercullito123" — o comeco do e-mail — porque o cadastro nao tinha
 * nome preenchido e o ultimo recurso vencia. Agora o nome e obrigatorio
 * no pedido de acesso e no convite, e o ultimo recurso ficou mais
 * apresentavel (troca ponto/underline por espaco e deixa cada palavra
 * com inicial maiuscula) para o caso de um cadastro antigo sem nome.
 */
function nomeDaPessoa(email, nomeAcesso) {
  const direto = String(nomeAcesso || '').trim();
  if (direto) return direto;
  const raiz = String(email || '').split('@')[0].replace(/[._\-]+/g, ' ').replace(/\d+$/, '').trim();
  if (!raiz) return 'Usuário';
  return raiz.split(/\s+/).map(function (p) {
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  }).join(' ').trim();
}

function montarUsuario(base) {
  base.permissoes = permissoesDe(base.perfil);
  return base;
}

/*
 * PEDIDO DE ACESSO.
 *
 * Ninguem entra sozinho e ninguem fica de fora sem saber por que. Quem
 * informa um e-mail que nao esta cadastrado NAO e mais registrado em
 * silencio: a tela mostra o formulario de pedido (nome, turno, papel), o
 * pedido entra como PENDENTE e o administrador recebe um aviso. Quando
 * ele decide, a pessoa recebe outro aviso.
 *
 * DOMINIOS_PERMITIDOS, se preenchido (ex.: "bartofil.com.br"), barra o
 * pedido de fora da organizacao.
 */
function conferirDominio_(email) {
  const permitidos = String(prop('DOMINIOS_PERMITIDOS', '')).toLowerCase().trim();
  if (!permitidos) return;
  const dominio = String(email).split('@')[1] || '';
  const lista = permitidos.split(',').map(function (d) { return d.trim(); }).filter(Boolean);
  if (lista.indexOf(dominio) === -1) {
    throw new Error('Esta conta não pertence à organização. Use o seu e-mail corporativo.');
  }
}

/** Chamada direta pela tela de login — a pessoa ainda nao tem sessao. */
function solicitarAcesso(dados) {
  try {
    const d = dados || {};
    const email = String(d.email || '').toLowerCase().trim();
    if (!email || email.indexOf('@') === -1) {
      return JSON.stringify({ ok: false, motivo: 'Digite um e-mail válido.' });
    }
    const nome = String(d.nome || '').trim();
    if (!nome) return JSON.stringify({ ok: false, motivo: 'Informe o seu nome.' });

    if (!bancoInstalado()) {
      return JSON.stringify({ ok: false, motivo: 'O sistema ainda não foi instalado.' });
    }
    conferirDominio_(email);

    const jaTem = buscarAcesso(email);
    if (jaTem) {
      const situacao = String(jaTem.SITUACAO || '').toUpperCase().trim();
      if (situacao === 'PENDENTE') {
        return JSON.stringify({ ok: true, jaPendente: true,
          motivo: 'Você já tem um pedido aguardando o administrador.' });
      }
      if (marcado(jaTem.ATIVO)) {
        return JSON.stringify({ ok: true, jaLiberado: true,
          motivo: 'Este e-mail já tem acesso liberado. Volte e clique em Entrar.' });
      }
      // Acesso recusado ou desativado: reabre o pedido.
      atualizar('ACESSOS', jaTem.ID, {
        NOME: nome, PAPEL: String(d.papel || '').trim(), TURNO: String(d.turno || '').toUpperCase().trim(),
        SITUACAO: 'PENDENTE', PEDIDO_EM: agoraTexto(),
        OBSERVACAO: String(d.observacao || '').trim()
      }, 'pedido');
    } else {
      inserir('ACESSOS', {
        EMAIL: email, NOME: nome,
        PAPEL: String(d.papel || '').trim(),
        PERFIL: PERFIL_PADRAO_NOVO_USUARIO,
        TURNO: String(d.turno || '').toUpperCase().trim(),
        ATIVO: 'NAO', SITUACAO: 'PENDENTE', PEDIDO_EM: agoraTexto(),
        OBSERVACAO: String(d.observacao || '').trim()
      }, 'pedido');
    }
    limparCache('ACESSOS');

    let avisou = false;
    try { avisarPedidoDeAcesso({ nome: nome, email: email,
            papel: String(d.papel || '').trim(), turno: String(d.turno || '').trim(),
            observacao: String(d.observacao || '').trim() }); avisou = true; } catch (e) {}

    return JSON.stringify({ ok: true, avisou: avisou,
      motivo: 'Pedido enviado. Assim que o administrador liberar, você recebe um e-mail.' });
  } catch (e) {
    return JSON.stringify({ ok: false, motivo: String(e.message || e) });
  }
}

function emailDeQuemAbriu() {
  let email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail(); } catch (e) { email = ''; }
  }
  return String(email || '').toLowerCase().trim();
}

function buscarAcesso(email) {
  const cadastrados = comCache('acessos', function () {
    return listar('ACESSOS').map(function (l) {
      return {
        ID: l.ID,
        EMAIL: String(l.EMAIL || '').toLowerCase().trim(),
        NOME: l.NOME, PAPEL: l.PAPEL, PERFIL: l.PERFIL, TURNO: l.TURNO,
        ATIVO: l.ATIVO, SITUACAO: l.SITUACAO
      };
    });
  });
  const achados = cadastrados.filter(function (a) { return a.EMAIL === email; });
  return achados.length ? achados[0] : null;
}

/*
 * A LISTA DE PESSOAS — uma so.
 *
 * Alimenta a tela "Pessoas e acessos", que substituiu as duas telas que
 * existiam antes (Equipe, na Configuracao, e Acessos). Eram as mesmas
 * pessoas em dois cadastros que nao conversavam.
 */
function listarPessoas() {
  return listar('ACESSOS').map(function (l) {
    const situacao = String(l.SITUACAO || '').toUpperCase().trim() ||
                     (marcado(l.ATIVO) ? 'ATIVO' : 'INATIVO');
    return {
      id: l.ID,
      email: String(l.EMAIL || '').trim(),
      nome: String(l.NOME || '').trim(),
      papel: String(l.PAPEL || '').trim(),
      perfil: String(l.PERFIL || '').toUpperCase().trim(),
      turno: String(l.TURNO || '').toUpperCase().trim(),
      ativo: marcado(l.ATIVO),
      situacao: situacao,
      pendente: situacao === 'PENDENTE',
      pedidoEm: String(l.PEDIDO_EM || ''),
      decididoEm: String(l.DECIDIDO_EM || ''),
      decididoPor: String(l.DECIDIDO_POR || ''),
      observacao: String(l.OBSERVACAO || ''),
      desde: l.CRIADO_EM
    };
  }).filter(function (a) { return a.email; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/* Nome antigo, mantido para nao quebrar chamada existente. */
function listarAcessos() { return listarPessoas(); }

/* --- Acoes de administracao de pessoas, chamadas pela tela --- */

/**
 * Convite: o administrador cadastra a pessoa ja liberada, sem esperar
 * pedido. E o atalho para quem ele conhece — o pedido continua existindo
 * para quem chega sozinho.
 */
function acaoSalvarUsuario(usuario, params) {
  const campos = {
    EMAIL: String(params.email || '').toLowerCase().trim(),
    NOME: String(params.nome || '').trim(),
    PAPEL: String(params.papel || '').trim(),
    PERFIL: String(params.perfil || '').toUpperCase().trim(),
    TURNO: String(params.turno || '').toUpperCase().trim(),
    ATIVO: params.ativo === false ? 'NAO' : 'SIM'
  };
  if (!campos.EMAIL || campos.EMAIL.indexOf('@') === -1) throw new Error('Informe um e-mail válido.');
  if (!campos.NOME) throw new Error('Informe o nome da pessoa — é ele que aparece no sistema.');
  if (!campos.PERFIL) throw new Error('Escolha o nível de acesso.');
  campos.SITUACAO = campos.ATIVO === 'SIM' ? 'ATIVO' : 'INATIVO';
  campos.DECIDIDO_EM = agoraTexto();
  campos.DECIDIDO_POR = usuario.email;

  if (params.id) {
    const r = atualizar('ACESSOS', params.id, campos, usuario.email);
    limparCache('ACESSOS');
    return r;
  }

  const jaExiste = buscarAcesso(campos.EMAIL);
  if (jaExiste) throw new Error('Esse e-mail já está cadastrado.');
  const id = inserir('ACESSOS', campos, usuario.email);
  limparCache('ACESSOS');
  try { avisarAcessoLiberado({ nome: campos.NOME, email: campos.EMAIL, perfil: campos.PERFIL }); } catch (e) {}
  return { ok: true, id: id };
}

/** Aprova um pedido: define nivel e turno e libera na hora. */
function acaoAprovarAcesso(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const alvo = obter('ACESSOS', params.id);
  if (!alvo) throw new Error('Pedido não encontrado.');

  const perfil = String(params.perfil || '').toUpperCase().trim();
  if (!perfil || perfil === PERFIL_PADRAO_NOVO_USUARIO) {
    throw new Error('Escolha o nível de acesso da pessoa antes de aprovar.');
  }
  const campos = {
    PERFIL: perfil,
    TURNO: String(params.turno || alvo.TURNO || '').toUpperCase().trim(),
    PAPEL: String(params.papel || alvo.PAPEL || '').trim(),
    ATIVO: 'SIM', SITUACAO: 'ATIVO',
    DECIDIDO_EM: agoraTexto(), DECIDIDO_POR: usuario.email
  };
  atualizar('ACESSOS', params.id, campos, usuario.email);
  limparCache('ACESSOS');

  const resposta = { ok: true };
  try {
    avisarAcessoLiberado({ nome: String(alvo.NOME || ''), email: String(alvo.EMAIL || ''), perfil: perfil });
  } catch (e) {
    resposta.avisoEmail = 'Acesso liberado, mas o e-mail de aviso não saiu: ' + (e.message || e);
  }
  return resposta;
}

/** Recusa o pedido. A pessoa fica no cadastro, sem acesso, com o motivo. */
function acaoRecusarAcesso(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const alvo = obter('ACESSOS', params.id);
  if (!alvo) throw new Error('Pedido não encontrado.');
  const motivo = String(params.motivo || '').trim();

  atualizar('ACESSOS', params.id, {
    ATIVO: 'NAO', SITUACAO: 'RECUSADO', PERFIL: PERFIL_PADRAO_NOVO_USUARIO,
    OBSERVACAO: motivo, DECIDIDO_EM: agoraTexto(), DECIDIDO_POR: usuario.email
  }, usuario.email);
  limparCache('ACESSOS');

  const resposta = { ok: true };
  try {
    avisarAcessoRecusado({ nome: String(alvo.NOME || ''), email: String(alvo.EMAIL || '') }, motivo);
  } catch (e) { resposta.avisoEmail = 'Pedido recusado, mas o e-mail não saiu.'; }
  return resposta;
}

/** Liga/desliga o acesso sem apagar a pessoa. */
function acaoAlternarAtivo(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const alvo = obter('ACESSOS', params.id);
  if (!alvo) throw new Error('Pessoa não encontrada.');
  if (String(alvo.EMAIL || '').toLowerCase() === usuario.email) {
    throw new Error('Você não pode desativar o próprio acesso.');
  }
  const ligar = !marcado(alvo.ATIVO);
  atualizar('ACESSOS', params.id, {
    ATIVO: ligar ? 'SIM' : 'NAO',
    SITUACAO: ligar ? 'ATIVO' : 'INATIVO',
    DECIDIDO_EM: agoraTexto(), DECIDIDO_POR: usuario.email
  }, usuario.email);
  limparCache('ACESSOS');
  return { ok: true, ativo: ligar };
}

function acaoExcluirUsuario(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  if (String(params.email || '').toLowerCase() === usuario.email) {
    throw new Error('Você não pode remover o próprio acesso.');
  }
  const r = excluir('ACESSOS', params.id, usuario.email);
  limparCache('ACESSOS');
  return r;
}

/** Liga ou desliga uma celula da matriz de permissoes, pela tela. */
function acaoAlterarPermissao(usuario, params) {
  const coluna = String(params.coluna || '').toUpperCase();
  if (coluna.indexOf('TELA_') !== 0 && coluna.indexOf('PODE_') !== 0 && coluna !== 'ESCOPO') {
    throw new Error('Coluna de permissão invalida.');
  }
  const campos = {};
  campos[coluna] = (coluna === 'ESCOPO') ? params.valor : (params.valor ? 'SIM' : 'NAO');
  return atualizar('PERFIS', params.id, campos, usuario.email);
}

/* --- Modo de teste: apague antes de subir para producao --- */

function simularPerfil(perfil, turno) {
  const email = emailDeQuemAbriu();
  if (email !== String(prop('EMAIL_ADMIN', '')).toLowerCase()) {
    throw new Error('Somente o administrador pode simular perfis.');
  }
  PropertiesService.getUserProperties().setProperty('SIMULACAO', JSON.stringify({
    perfil: String(perfil).toUpperCase().trim(),
    turno: String(turno || '').toUpperCase().trim()
  }));
  esquecerUsuario();
  return { ok: true };
}

function encerrarSimulacao() {
  PropertiesService.getUserProperties().deleteProperty('SIMULACAO');
  esquecerUsuario();
  return { ok: true };
}

function simulacaoAtiva(email) {
  if (email !== String(prop('EMAIL_ADMIN', '')).toLowerCase()) return null;
  const bruto = PropertiesService.getUserProperties().getProperty('SIMULACAO');
  if (!bruto) return null;
  const s = JSON.parse(bruto);
  return {
    email: email, nome: 'Simulando ' + s.perfil + (s.turno ? ' / turno ' + s.turno : ''),
    perfil: s.perfil, turno: s.turno, cadastrado: true, simulado: true
  };
}
