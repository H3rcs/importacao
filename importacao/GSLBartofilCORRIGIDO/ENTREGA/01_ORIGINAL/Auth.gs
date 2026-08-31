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

  let registro = buscarAcesso(email);
  if (!registro) {
    registro = autocadastrar(email);
  }

  if (!marcado(registro.ATIVO)) {
    throw new Error('Seu acesso ao sistema esta desativado. Procure o administrador.');
  }

  return montarUsuario({
    id: registro.ID,
    novo: String(registro.PERFIL || '').toUpperCase().trim() === PERFIL_PADRAO_NOVO_USUARIO,
    email: email,
    nome: nomeDaPessoa(email, registro.NOME),
    perfil: String(registro.PERFIL || PERFIL_PADRAO_NOVO_USUARIO).toUpperCase().trim(),
    turno: String(registro.TURNO || '').toUpperCase().trim(),
    cadastrado: true
  });
}

function nomeDaPessoa(email, nomeAcesso) {
  const direto = String(nomeAcesso || '').trim();
  if (direto) return direto;
  try {
    const alvo = String(email || '').toLowerCase().trim();
    const naEquipe = listar('EQUIPE').filter(function (p) {
      return String(p.EMAIL || '').toLowerCase().trim() === alvo && String(p.NOME || '').trim();
    })[0];
    if (naEquipe) return String(naEquipe.NOME).trim();
  } catch (e) {}
  // ultimo recurso: comeco do email, mas com inicial maiuscula
  const raiz = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return raiz ? raiz.charAt(0).toUpperCase() + raiz.slice(1) : 'Usuario';
}

function montarUsuario(base) {
  base.permissoes = permissoesDe(base.perfil);
  return base;
}

/**
 * Primeira entrada de alguem: registra a pessoa como PENDENTE e a coloca
 * na fila do administrador. Ela ve a tela de espera, nao um erro.
 *
 * Se a propriedade DOMINIOS_PERMITIDOS estiver preenchida (ex.:
 * "bartofil.com.br"), so contas desses dominios sao registradas. E a trava
 * util enquanto o web app estiver publicado para qualquer conta Google.
 */
function autocadastrar(email) {
  const permitidos = String(prop('DOMINIOS_PERMITIDOS', '')).toLowerCase().trim();
  if (permitidos) {
    const dominio = email.split('@')[1] || '';
    const lista = permitidos.split(',').map(function (d) { return d.trim(); }).filter(Boolean);
    if (lista.indexOf(dominio) === -1) {
      throw new Error('Esta conta nao pertence a organizacao. Entre com seu e-mail corporativo.');
    }
  }

  inserir('ACESSOS', {
    EMAIL: email,
    NOME: email.split('@')[0],
    PERFIL: PERFIL_PADRAO_NOVO_USUARIO,
    TURNO: '',
    ATIVO: 'SIM'
  }, 'autocadastro');

  limparCache('ACESSOS');
  return buscarAcesso(email) || {
    EMAIL: email, NOME: email.split('@')[0], PERFIL: PERFIL_PADRAO_NOVO_USUARIO, TURNO: '', ATIVO: 'SIM'
  };
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
        NOME: l.NOME, PERFIL: l.PERFIL, TURNO: l.TURNO, ATIVO: l.ATIVO
      };
    });
  });
  const achados = cadastrados.filter(function (a) { return a.EMAIL === email; });
  return achados.length ? achados[0] : null;
}

function listarAcessos() {
  return listar('ACESSOS').map(function (l) {
    return {
      id: l.ID,
      email: String(l.EMAIL || '').trim(),
      nome: String(l.NOME || '').trim(),
      perfil: String(l.PERFIL || '').toUpperCase().trim(),
      turno: String(l.TURNO || '').toUpperCase().trim(),
      ativo: marcado(l.ATIVO),
      pendente: String(l.PERFIL || '').toUpperCase().trim() === PERFIL_PADRAO_NOVO_USUARIO,
      desde: l.CRIADO_EM
    };
  }).filter(function (a) { return a.email; });
}

/* --- Acoes de administracao de usuarios, chamadas pelo app --- */

function acaoSalvarUsuario(usuario, params) {
  const campos = {
    EMAIL: String(params.email || '').toLowerCase().trim(),
    NOME: String(params.nome || '').trim(),
    PERFIL: String(params.perfil || '').toUpperCase().trim(),
    TURNO: String(params.turno || '').toUpperCase().trim(),
    ATIVO: params.ativo ? 'SIM' : 'NAO'
  };
  if (!campos.EMAIL) throw new Error('Informe o e-mail da pessoa.');
  if (!campos.PERFIL) throw new Error('Escolha o nivel de acesso.');

  if (params.id) return atualizar('ACESSOS', params.id, campos, usuario.email);

  const jaExiste = buscarAcesso(campos.EMAIL);
  if (jaExiste) throw new Error('Esse e-mail ja esta cadastrado.');
  return { ok: true, id: inserir('ACESSOS', campos, usuario.email) };
}

function acaoExcluirUsuario(usuario, params) {
  if (String(params.email || '').toLowerCase() === usuario.email) {
    throw new Error('Voce nao pode remover o proprio acesso.');
  }
  return excluir('ACESSOS', params.id, usuario.email);
}

/** Liga ou desliga uma celula da matriz de permissoes, pela tela. */
function acaoAlterarPermissao(usuario, params) {
  const coluna = String(params.coluna || '').toUpperCase();
  if (coluna.indexOf('TELA_') !== 0 && coluna.indexOf('PODE_') !== 0 && coluna !== 'ESCOPO') {
    throw new Error('Coluna de permissao invalida.');
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
