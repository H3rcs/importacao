/**
 * IDENTIDADE — so reconhecer quem abriu.
 *
 * A PORTA E DO GOOGLE, NAO DO GSL.
 *
 * O GSL e implantado como "Executar como: eu" e "Quem pode acessar:
 * Qualquer pessoa da Bartofil". Com isso o proprio Google Workspace faz
 * o login: quem nao esta logado com uma conta @bartofil.com.br nem chega
 * a ver a pagina. E a mesma implantacao do BI de funcoes, que funciona
 * no servidor em nuvem.
 *
 * O que sobra para o GSL e uma pergunta so: QUEM e esta pessoa, para
 * saber quais telas ela ve. A resposta vem de Session.getActiveUser(),
 * que o Google preenche quando quem abre e do mesmo dominio do dono do
 * script. O navegador nao manda e-mail, token nem senha — nao ha o que
 * forjar e nao ha tela de entrada para travar.
 *
 * O que saiu (e por que):
 *   - o botao "Entrar com Google" (OAuth) e o token de sessao: eram a
 *     tela que ficava em loop no servidor em nuvem;
 *   - a tela de pedido de acesso e a triagem: quem nao esta cadastrado
 *     ve um aviso para falar com o administrador, e o administrador
 *     cadastra em Pessoas e acessos.
 */

var _usuarioDaVez = null;
const BUILD_AUTH = '2026.10.10';   // carimbo da entrega — ver APP.build no Codigo.gs

/*
 * 4.2 — QUEM ENTRA E O E-MAIL DIGITADO, NAO A CONTA DO NAVEGADOR.
 *
 * Nos computadores compartilhados do CD o navegador fica com a conta Google
 * de quem usou antes (ou com varias contas guardadas, o que ainda derruba
 * o google.script.run com HTTP 403). Por isso, a cada abertura, a pessoa
 * digita o e-mail e o PIN dela; o servidor devolve um codigo de sessao que
 * vive so enquanto a aba estiver aberta. A conta Google do navegador so
 * precisa ser da Bartofil (a implantacao exige) — pode ser a conta geral
 * do computador.
 *
 * Propriedade IDENTIDADE=GOOGLE volta ao modo antigo (conta do navegador);
 * fica para os testes automaticos e para emergencia.
 */
var _tokenDaVez = '';
var _porta = false;

function modoGoogle_() { return String(prop('IDENTIDADE', '')).toUpperCase().trim() === 'GOOGLE'; }

/* O e-mail de quem esta usando: o da sessao (modo padrao) ou o do Google. */
function emailDoUsuario_() {
  return modoGoogle_() ? emailDeQuemAbriu() : emailDaSessao_(_tokenDaVez);
}

function usuarioAtual() {
  if (_usuarioDaVez) return _usuarioDaVez;
  _usuarioDaVez = calcularUsuarioAtual();
  return _usuarioDaVez;
}

/** Zera a memoria quando o proprio usuario muda (simulacao, novo perfil). */
function esquecerUsuario() { _usuarioDaVez = null; }

/* Erro com motivo que a tela sabe explicar. */
function erroDeEntrada_(tipo, mensagem, email) {
  const e = new Error(mensagem);
  e.tipoEntrada = tipo;          // SEM_CONTA · SEM_CADASTRO · DESATIVADO · SEM_NIVEL
  e.email = email || '';
  return e;
}

function calcularUsuarioAtual() {
  const email = emailDoUsuario_();

  if (!email) {
    if (!modoGoogle_()) {
      // [SESSAO] e a marca que o navegador usa para voltar a tela de entrada.
      throw erroDeEntrada_('SEM_SESSAO', '[SESSAO] Sua sessão terminou. Entre de novo com o seu e-mail e PIN.');
    }
    throw erroDeEntrada_('SEM_CONTA',
      'O Google não informou qual conta abriu o sistema. Confira se você está com a conta ' +
      '@bartofil.com.br aberta neste navegador e recarregue a página.');
  }

  const simulado = simulacaoAtiva(email);
  if (simulado) return montarUsuario(simulado);

  const registro = buscarAcesso(email);
  const admin = String(prop('EMAIL_ADMIN', '')).toLowerCase().trim();

  // O dono do sistema nunca fica trancado do lado de fora, mesmo se
  // alguem apagar a linha dele em ACESSOS. "Dono" e o EMAIL_ADMIN da
  // instalacao OU a conta que fez a implantacao (a que executa o script).
  if (!registro && (email === admin || email === donoDoScript()) &&
      (modoGoogle_() || emailDeQuemAbriu() === email)) {
    return montarUsuario({ email: email, nome: nomeDaPessoa(email, ''), papel: 'Administrador do sistema',
      perfil: 'ADMIN', turno: '', filiais: '*', situacao: 'ATIVO', cadastrado: true, verificado: true });
  }

  if (!registro) {
    throw erroDeEntrada_('SEM_CADASTRO',
      'Sua conta ainda não foi cadastrada no GSL. Peça ao administrador para liberar o seu acesso.', email);
  }

  const situacao = String(registro.SITUACAO || '').toUpperCase().trim();
  const perfil = String(registro.PERFIL || '').toUpperCase().trim();

  if (!marcado(registro.ATIVO) || situacao === 'RECUSADO' || situacao === 'INATIVO') {
    throw erroDeEntrada_('DESATIVADO',
      'Seu acesso ao GSL está desativado. Fale com o administrador.', email);
  }
  if (!perfil || perfil === PERFIL_PADRAO_NOVO_USUARIO) {
    throw erroDeEntrada_('SEM_NIVEL',
      'Seu cadastro existe, mas ainda não tem nível de acesso definido. Fale com o administrador.', email);
  }

  return montarUsuario({
    verificado: true,
    id: registro.ID,
    email: email,
    nome: nomeDaPessoa(email, registro.NOME),
    papel: String(registro.PAPEL || '').trim(),
    perfil: perfil,
    turno: String(registro.TURNO || '').toUpperCase().trim(),
    filiais: String(registro.FILIAIS || '').trim(),
    modulos: String(registro.MODULOS || '').trim(),
    situacao: situacao || 'ATIVO',
    cadastrado: true
  });
}

/*
 * Nome de quem esta usando. Sem nome no cadastro, o ultimo recurso e o
 * comeco do e-mail arrumado (ponto e underline viram espaco, cada
 * palavra com inicial maiuscula).
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
  const nivel = permissoesDe(base.perfil);
  // O ADMIN ve tudo sempre; nos demais vale o ajuste por modulo da pessoa.
  const ajustes = String(base.perfil || '').toUpperCase() === 'ADMIN' ? {} : lerModulosPessoa(base.modulos);
  base.permissoes = aplicarModulosDaPessoa(nivel, ajustes);
  // Entra na chave do cache de tela: duas pessoas do mesmo nivel com
  // ajustes diferentes nao podem dividir o mesmo payload.
  base.chaveModulos = Object.keys(ajustes).sort().map(function (k) { return k + ':' + ajustes[k]; }).join(',');
  return base;
}

/*
 * getActiveUser()    = a pessoa que esta com o navegador aberto.
 * getEffectiveUser() = a conta que o script RODA (o dono da implantacao).
 *
 * So a primeira serve para dizer quem esta usando. A segunda seria o
 * dono para todo mundo — e todo mundo entraria como administrador.
 */
function emailDeQuemAbriu() {
  let email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  return String(email || '').toLowerCase().trim();
}

/* A conta que EXECUTA o script. Serve para instalacao e avisos de sistema. */
function donoDoScript() {
  let email = '';
  try { email = Session.getEffectiveUser().getEmail(); } catch (e) { email = ''; }
  return String(email || '').toLowerCase().trim();
}

/*
 * DIAGNOSTICO — /exec?diagnostico=1
 * Responde, de dentro da implantacao, se o Google esta informando quem abriu.
 */
function diagnosticoIdentidade() {
  const ativo = emailDeQuemAbriu();
  const dono = donoDoScript();
  let cadastro = null;
  try { cadastro = ativo ? buscarAcesso(ativo) : null; } catch (e) { cadastro = null; }

  const r = {
    usuarioAtivo: ativo || '(vazio)',
    donoDoScript: dono || '(vazio)',
    identidadeConfiavel: !!ativo,
    cadastrado: !!cadastro,
    perfil: cadastro ? String(cadastro.PERFIL || '') : '',
    veredito: ''
  };

  if (!ativo) {
    r.veredito = 'O Google NÃO informou quem abriu. Confira a implantação: "Executar como: eu" e ' +
      '"Quem pode acessar: Qualquer pessoa da Bartofil". E confira se a pessoa está com a conta ' +
      '@bartofil.com.br aberta no navegador.';
  } else if (!cadastro) {
    r.veredito = 'O Google informou a conta ' + ativo + ', mas ela não está cadastrada em Pessoas e acessos.';
  } else {
    r.veredito = 'Tudo certo: o Google informou a conta e ela está cadastrada com o nível ' + r.perfil + '.';
  }

  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function buscarAcesso(email) {
  const alvo = String(email || '').toLowerCase().trim();
  const achados = cadastrosDeAcesso_().filter(function (a) { return a.EMAIL === alvo; });
  return achados.length ? achados[0] : null;
}

/*
 * As pessoas cadastradas SEM o resumo do PIN, da copia 'acessos' do cache —
 * a mesma lista que decide quem entra. As telas que so precisam de nome,
 * turno, perfil e filiais usam esta (10/10): antes cada uma relia a aba
 * ACESSOS inteira da planilha.
 */
function cadastrosDeAcesso_() {
  return comCache('acessos', function () {
    return listar('ACESSOS').map(function (l) {
      return {
        ID: l.ID,
        EMAIL: String(l.EMAIL || '').toLowerCase().trim(),
        NOME: l.NOME, PAPEL: l.PAPEL, PERFIL: l.PERFIL, TURNO: l.TURNO,
        ATIVO: l.ATIVO, SITUACAO: l.SITUACAO, FILIAIS: l.FILIAIS, MODULOS: l.MODULOS
      };
    });
  });
}

/* A LISTA DE PESSOAS — alimenta a tela "Pessoas e acessos". */
function listarPessoas() {
  return listar('ACESSOS').map(function (l) {
    const perfil = String(l.PERFIL || '').toUpperCase().trim();
    let situacao = String(l.SITUACAO || '').toUpperCase().trim() ||
                   (marcado(l.ATIVO) ? 'ATIVO' : 'INATIVO');
    if (!marcado(l.ATIVO)) situacao = 'INATIVO';
    return {
      id: l.ID,
      email: String(l.EMAIL || '').trim(),
      nome: String(l.NOME || '').trim(),
      papel: String(l.PAPEL || '').trim(),
      perfil: perfil,
      semNivel: !perfil || perfil === PERFIL_PADRAO_NOVO_USUARIO,
      turno: String(l.TURNO || '').toUpperCase().trim(),
      filiais: String(l.FILIAIS || '').toUpperCase().trim(),
      modulos: lerModulosPessoa(l.MODULOS),
      ativo: marcado(l.ATIVO),
      situacao: situacao,
      observacao: String(l.OBSERVACAO || ''),
      temPin: !!String(l.PIN_HASH || '').trim(),
      desde: l.CRIADO_EM
    };
  }).filter(function (a) { return a.email; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

/* Nome antigo, mantido para nao quebrar chamada existente. */
function listarAcessos() { return listarPessoas(); }

/*
 * O nivel ADMIN so e dado, tirado ou editado por outro ADMIN. Antes, quem
 * tinha GERIR_ACESSOS (o gerente, por padrao) se promovia a ADMIN e ainda
 * podia desativar o dono do sistema.
 */
function protegerAdmin_(usuario, perfilAlvo, perfilNovo) {
  if (String(usuario.perfil || '').toUpperCase() === 'ADMIN') return;
  if (String(perfilAlvo || '').toUpperCase().trim() === 'ADMIN' ||
      String(perfilNovo || '').toUpperCase().trim() === 'ADMIN') {
    throw new Error('Só um administrador pode dar, tirar ou editar o nível ADMIN.');
  }
}

/* --- Administracao de pessoas, chamada pela tela --- */

/*
 * Cadastrar = liberar. Nao existe mais pedido nem fila: o administrador
 * cadastra a pessoa, escolhe o nivel e as filiais, e ela ja entra.
 */
function acaoSalvarUsuario(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const campos = {
    EMAIL: String(params.email || '').toLowerCase().trim(),
    NOME: String(params.nome || '').trim(),
    PAPEL: String(params.papel || '').trim(),
    PERFIL: String(params.perfil || '').toUpperCase().trim(),
    TURNO: String(params.turno || '').toUpperCase().trim(),
    FILIAIS: String(params.filiais || '').toUpperCase().replace(/\s+/g, ''),
    ATIVO: params.ativo === false ? 'NAO' : 'SIM'
  };
  if (params.modulos && typeof params.modulos === 'object') {
    campos.MODULOS = JSON.stringify(lerModulosPessoa(JSON.stringify(params.modulos)));
    if (campos.MODULOS === '{}') campos.MODULOS = '';
  }
  if (!campos.EMAIL || campos.EMAIL.indexOf('@') === -1) throw new Error('Informe um e-mail válido.');
  if (!campos.NOME) throw new Error('Informe o nome da pessoa — é ele que aparece no sistema.');
  if (!campos.PERFIL || campos.PERFIL === PERFIL_PADRAO_NOVO_USUARIO) throw new Error('Escolha o nível de acesso.');
  campos.SITUACAO = campos.ATIVO === 'SIM' ? 'ATIVO' : 'INATIVO';
  campos.DECIDIDO_EM = agoraTexto();
  campos.DECIDIDO_POR = usuario.email;

  if (params.id) {
    const alvo = obter('ACESSOS', params.id);
    protegerAdmin_(usuario, alvo && alvo.PERFIL, campos.PERFIL);
    if (alvo && String(alvo.EMAIL || '').toLowerCase() === usuario.email && campos.ATIVO === 'NAO') {
      throw new Error('Você não pode desativar o próprio acesso.');
    }
    const r = atualizar('ACESSOS', params.id, campos, usuario.email);
    limparCache('ACESSOS');
    return r;
  }

  protegerAdmin_(usuario, '', campos.PERFIL);
  const jaExiste = buscarAcesso(campos.EMAIL);
  if (jaExiste) throw new Error('Esse e-mail já está cadastrado.');
  const id = inserir('ACESSOS', campos, usuario.email);
  limparCache('ACESSOS');
  const resposta = { ok: true, id: id };
  try { avisarAcessoLiberado({ nome: campos.NOME, email: campos.EMAIL, perfil: campos.PERFIL }); }
  catch (e) { resposta.avisoEmail = 'Pessoa cadastrada, mas o e-mail de aviso não saiu: ' + (e.message || e); }
  return resposta;
}

/*
 * Muda UM modulo de UMA pessoa — o clique na tabela "Modulos por pessoa".
 * modo: PADRAO (volta a seguir o nivel) · NAO · VER · EDITAR
 */
function acaoDefinirModuloPessoa(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const alvo = obter('ACESSOS', params.id);
  if (!alvo) throw new Error('Pessoa não encontrada.');
  const modulo = String(params.modulo || '');
  if (!MODULOS_AJUSTAVEIS[modulo]) throw new Error('Este módulo segue sempre o nível de acesso.');
  const modo = String(params.modo || '').toUpperCase().trim();
  const atuais = lerModulosPessoa(alvo.MODULOS);
  if (modo === 'PADRAO' || !modo) delete atuais[modulo];
  else if (MODOS_MODULO.indexOf(modo) !== -1) atuais[modulo] = modo;
  else throw new Error('Opção inválida.');
  atualizar('ACESSOS', params.id, { MODULOS: Object.keys(atuais).length ? JSON.stringify(atuais) : '' }, usuario.email);
  limparCache('ACESSOS');
  return { ok: true };
}

/** Liga/desliga o acesso sem apagar a pessoa. */
function acaoAlternarAtivo(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const alvo = obter('ACESSOS', params.id);
  if (!alvo) throw new Error('Pessoa não encontrada.');
  protegerAdmin_(usuario, alvo.PERFIL, '');
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
  const alvo = obter('ACESSOS', params.id);
  protegerAdmin_(usuario, alvo && alvo.PERFIL, '');
  if (alvo && String(alvo.EMAIL || '').toLowerCase() === usuario.email) {
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
  const linha = obter('PERFIS', params.id);
  if (!linha) throw new Error('Nível não encontrado.');
  if (String(usuario.perfil || '').toUpperCase() !== 'ADMIN' &&
      (String(linha.PERFIL || '').toUpperCase().trim() === 'ADMIN' || coluna.indexOf('PODE_GERIR_') === 0)) {
    throw new Error('Só um administrador mexe no nível ADMIN e nas permissões de gerir acessos e filiais.');
  }
  const campos = {};
  campos[coluna] = (coluna === 'ESCOPO') ? params.valor : (params.valor ? 'SIM' : 'NAO');
  const r = atualizar('PERFIS', params.id, campos, usuario.email);
  r.invalidarTudo = true;
  return r;
}

/* --- Ver o sistema como outro nivel (so o administrador) ---
 * Guardado nas propriedades do SCRIPT com o e-mail na chave: com
 * "Executar como: eu", as propriedades de usuario sao as do dono, iguais
 * para todo mundo. */

function chaveSimulacao_(email) { return 'SIMULACAO_' + String(email).toLowerCase(); }

function simularPerfil(perfil, turno, ctx) {
  contextoDaChamada_(ctx);
  const email = emailDoUsuario_();
  if (email !== String(prop('EMAIL_ADMIN', '')).toLowerCase()) {
    throw new Error('Somente o administrador pode simular perfis.');
  }
  PropertiesService.getScriptProperties().setProperty(chaveSimulacao_(email), JSON.stringify({
    perfil: String(perfil).toUpperCase().trim(),
    turno: String(turno || '').toUpperCase().trim()
  }));
  esquecerProps();
  esquecerUsuario();
  return { ok: true };
}

function encerrarSimulacao(ctx) {
  contextoDaChamada_(ctx);
  const email = emailDoUsuario_();
  PropertiesService.getScriptProperties().deleteProperty(chaveSimulacao_(email));
  esquecerProps();
  esquecerUsuario();
  return { ok: true };
}

function simulacaoAtiva(email) {
  if (email !== String(prop('EMAIL_ADMIN', '')).toLowerCase()) return null;
  const bruto = prop(chaveSimulacao_(email), '');
  if (!bruto) return null;
  let s;
  try { s = JSON.parse(bruto); } catch (e) { return null; }
  return {
    email: email, nome: 'Simulando ' + s.perfil + (s.turno ? ' / turno ' + s.turno : ''),
    perfil: s.perfil, turno: s.turno, filiais: '*', cadastrado: true, simulado: true, verificado: true
  };
}


/* ------------------------------------------------------------------ */
/* ENTRADA POR E-MAIL E PIN (4.2)                                      */
/* ------------------------------------------------------------------ */

const SESSAO_SEGUNDOS = 6 * 3600;      // o CacheService guarda no maximo 6 h
const SESSAO_RENOVAR_MS = 5 * 60 * 1000;
// Uma hora sem usar o sistema e a sessao acaba (4.2.2): no computador
// compartilhado, a aba esquecida aberta nao fica valida por 6 horas.
const SESSAO_OCIOSA_MS = 60 * 60 * 1000;
const PIN_TENTATIVAS = 5;
const PIN_BLOQUEIO_SEG = 10 * 60;
const CODIGO_EMAIL_SEG = 15 * 60;      // codigo de primeiro acesso mandado por e-mail
const CODIGO_ADMIN_SEG = 6 * 3600;     // codigo entregue pelo administrador (limite do cache)
const CODIGO_REENVIO_MS = 60 * 1000;   // no maximo um e-mail de codigo por minuto
const CODIGO_POR_JANELA = 3;           // e-mails de codigo por pessoa a cada 15 min
const CODIGO_GLOBAL_HORA = 60;         // e-mails de codigo do sistema inteiro por hora
const CODIGO_RESERVA_COTA = 50;        // cota diaria de e-mail que o codigo nunca consome

/*
 * Toda porta publica chama isto primeiro. `ctx` e { t: sessao, f: filial }
 * (o navegador manda os dois); texto puro e a filial do modo antigo.
 * Marca a execucao como "entrou pela porta" — ver exigirPorta_().
 */
function contextoDaChamada_(ctx) {
  _porta = true;
  if (ctx && typeof ctx === 'object') {
    _tokenDaVez = String(ctx.t || '');
    return String(ctx.f || '');
  }
  return String(ctx || '');
}

/*
 * PORTA OBRIGATORIA.
 *
 * O Apps Script deixa o navegador chamar QUALQUER funcao global pelo
 * google.script.run — nao so as portas. Sem esta trava, alguem com o
 * console aberto chamava direto uma funcao interna (gravar pessoa, ler
 * tabela, baixar arquivo) passando um "usuario" inventado. O acesso ao
 * banco, ao Drive, ao e-mail, ao cache de telas e aos gatilhos passa por
 * aqui: so anda se a execucao entrou por uma porta (que confere a sessao)
 * ou se e o dono rodando pelo editor/gatilho.
 */
var _portaConferida = false;
function exigirPorta_() {
  if (_porta || _portaConferida) return;
  const ativo = emailDeQuemAbriu();
  // EMAIL_ADMIN lido direto: o prop() passa por aqui (seria recursao).
  const admin = String(PropertiesService.getScriptProperties().getProperty('EMAIL_ADMIN') || '').toLowerCase().trim();
  if (!ativo ||                                         // gatilho: ninguem do outro lado
      ativo === donoDoScript() ||                       // editor, pelo dono
      (admin && ativo === admin)) {
    _portaConferida = true;
    return;
  }
  throw new Error('Acesso negado: use o sistema pela tela.');
}

/* Funcoes de editor (instalar, restaurar acesso...): so o dono. */
function exigirDono_() {
  const ativo = emailDeQuemAbriu();
  const admin = String(prop('EMAIL_ADMIN', '')).toLowerCase().trim();
  if (ativo && (ativo === donoDoScript() || ativo === admin)) return;
  if (!ativo && !bancoInstalado()) return;              // primeira instalacao pelo editor
  throw new Error('Somente o dono do sistema pode fazer isto.');
}

function segredoPin_() {
  let s = prop('SEGREDO_PIN', '');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('SEGREDO_PIN', s);
    esquecerProps();
  }
  return s;
}

/* So o resumo do PIN vai para a planilha — quem abre a planilha nao le o PIN. */
function resumoPin_(email, pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    segredoPin_() + '|' + String(email).toLowerCase() + '|' + String(pin), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/*
 * SESSAO DURAVEL (10/10). O CacheService e so o caminho rapido: o Google
 * nao garante que um item fique ate o prazo, e o cache do script (no maximo
 * 1.000 itens) e dividido com as telas, tabelas e bilhetes de todo mundo.
 * Uma sessao despejada era a pessoa "saindo sozinha". A copia que vale
 * fica nas propriedades de USUARIO do dono (com "Executar como: eu", uma
 * loja so, separada das configuracoes que o prop() le a cada chamada). Na
 * loja vai so o RESUMO do codigo: quem le as propriedades nao entra como
 * ninguem.
 *
 *   cache 'sess_<codigo>'   -> { e, t (ultimo uso, de 5 em 5 min), c (criada), d (ultima escrita na loja) }
 *   loja  'sessao_<resumo>' -> { e, c, u (ultimo uso, de 10 em 10 min) }
 *
 * As regras nao mudam: 1 h sem uso acaba a sessao (pela loja, no maximo
 * 10 min mais cedo, nunca mais tarde) e "Sair" apaga as duas copias.
 */
const SESSAO_GRAVAR_USO_MS = 10 * 60 * 1000;   // no maximo uma escrita na loja a cada 10 min por sessao
const SESSAO_PODA_MS = SESSAO_OCIOSA_MS + 15 * 60 * 1000;
const PREFIXO_SESSAO_DURAVEL = 'sessao_';
var _sessoesDaVez = {};                         // codigo -> e-mail ('' = nao existe), so nesta execucao

function lojaDeSessoes_() { return PropertiesService.getUserProperties(); }

function chaveSessaoDuravel_(token) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'sessao|' + token, Utilities.Charset.UTF_8);
  return PREFIXO_SESSAO_DURAVEL + Utilities.base64EncodeWebSafe(d).replace(/=+$/, '').slice(0, 32);
}

function criarSessao_(email) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  const agora = Date.now();
  // A loja e a copia que vale, mas nunca impede a entrada: loja cheia ou fora do ar = como antes (so o cache).
  try { lojaDeSessoes_().setProperty(chaveSessaoDuravel_(token), JSON.stringify({ e: email, c: agora, u: agora })); } catch (e) {}
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({ e: email, t: agora, c: agora, d: agora }), SESSAO_SEGUNDOS);
  _sessoesDaVez[token] = String(email || '').toLowerCase().trim();
  try { podarSessoes_(false); } catch (e) {}
  return token;
}

/* E-mail dono da sessao, ou '' se ela nao existe/venceu. Renova o ultimo uso de tempos em tempos. */
function emailDaSessao_(token) {
  const t = String(token || '');
  if (!/^[a-f0-9]{32,80}$/.test(t)) return '';
  if (_sessoesDaVez[t] !== undefined) return _sessoesDaVez[t];
  const cache = CacheService.getScriptCache();
  let s = null;
  // Uma chamada so ao cache para a sessao, as pessoas, os perfis, as filiais e a geracao (preLerCache_).
  try { preLerCache_(t); s = JSON.parse(lerChaveCache_(cache, 'sess_' + t) || 'null'); } catch (e) { s = null; }
  const doCache = !!s;
  if (!s) {
    // O cache perdeu (despejo) ou a sessao nunca existiu: a loja decide.
    let reg = null;
    try { reg = JSON.parse(lojaDeSessoes_().getProperty(chaveSessaoDuravel_(t)) || 'null'); } catch (e) { reg = null; }
    if (!reg || !reg.e) { _sessoesDaVez[t] = ''; return ''; }
    s = { e: reg.e, t: Number(reg.u || 0), c: Number(reg.c || 0), d: Number(reg.u || 0) };
  }
  const agora = Date.now();
  if (agora - Number(s.t || 0) > SESSAO_OCIOSA_MS) {
    encerrarSessao_(t);
    return '';
  }
  // Diagnostico: sessao viva que so a loja tinha = antes desta versao, uma "saida sozinha".
  if (!doCache) contarDiagnostico_('sessao_salva_pela_loja');
  let mudou = !doCache;
  if (agora - Number(s.t || 0) > SESSAO_RENOVAR_MS) { s.t = agora; mudou = true; }
  if (agora - Number(s.d || 0) > SESSAO_GRAVAR_USO_MS) {
    s.d = agora;
    try { lojaDeSessoes_().setProperty(chaveSessaoDuravel_(t), JSON.stringify({ e: s.e, c: s.c || agora, u: agora })); } catch (e) {}
    mudou = true;
  }
  if (mudou) { try { cache.put('sess_' + t, JSON.stringify(s), SESSAO_SEGUNDOS); } catch (e) {} }
  const email = String(s.e || '').toLowerCase().trim();
  _sessoesDaVez[t] = email;
  return email;
}

/* Fim da sessao (Sair, 1 h sem uso): as duas copias. */
function encerrarSessao_(token) {
  const t = String(token || '');
  if (!/^[a-f0-9]{32,80}$/.test(t)) return;
  try { CacheService.getScriptCache().remove('sess_' + t); } catch (e) {}
  try { lojaDeSessoes_().deleteProperty(chaveSessaoDuravel_(t)); } catch (e) {}
  _sessoesDaVez[t] = '';
}

/*
 * PODA: sessao parada ha mais de 1 h 15 min sai da loja. Roda na rotina
 * diaria e, no maximo uma vez por hora, numa entrada. Nunca apaga sessao
 * viva: quem esta em uso tem o ultimo uso gravado ha no maximo 10 min.
 */
function podarSessoes_(forcar) {
  const cache = CacheService.getScriptCache();
  if (!forcar && cache.get('poda_sessoes')) return 0;
  try { cache.put('poda_sessoes', '1', 3600); } catch (e) {}
  const loja = lojaDeSessoes_();
  const todas = loja.getProperties();
  const agora = Date.now();
  let n = 0;
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf(PREFIXO_SESSAO_DURAVEL) !== 0) return;
    let reg = null;
    try { reg = JSON.parse(todas[k]); } catch (e) { reg = null; }
    if (!reg || agora - Number(reg.u || 0) > SESSAO_PODA_MS) { try { loja.deleteProperty(k); n++; } catch (e) {} }
  });
  return n;
}

/* Contadores de diagnostico (cache, 6 h): quantas sessoes a loja salvou (aparece no ?diagnostico=1). */
function contarDiagnostico_(nome) {
  try {
    const cache = CacheService.getScriptCache();
    const k = 'diag_' + nome;
    cache.put(k, String(Number(cache.get(k) || 0) + 1), 21600);
  } catch (e) {}
}

/* A pessoa inteira (com o resumo do PIN), lida da tabela — nao do cache de acessos. */
function registroDeAcesso_(email) {
  const alvo = String(email || '').toLowerCase().trim();
  return listar('ACESSOS').filter(function (l) {
    return String(l.EMAIL || '').toLowerCase().trim() === alvo;
  })[0] || null;
}

function contarErroPin_(email) {
  const cache = CacheService.getScriptCache();
  const k = 'pinerro_' + email.replace(/[^a-z0-9]/g, '_');
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), PIN_BLOQUEIO_SEG);
  return n;
}
function pinBloqueado_(email) {
  return Number(CacheService.getScriptCache().get('pinerro_' + email.replace(/[^a-z0-9]/g, '_')) || 0) >= PIN_TENTATIVAS;
}
function zerarErrosPin_(email) {
  try { CacheService.getScriptCache().remove('pinerro_' + email.replace(/[^a-z0-9]/g, '_')); } catch (e) {}
}

/*
 * CODIGO DE PRIMEIRO ACESSO (4.2.2).
 *
 * Antes, quem ainda nao tinha PIN criava um so digitando o e-mail. Como o
 * cadastro e feito pelo administrador e ninguem tem PIN no comeco, qualquer
 * pessoa que soubesse o e-mail de um colega (ou de um administrador) criava
 * o PIN dele, entrava como ele e ainda trancava o dono de verdade do lado de
 * fora. Agora o primeiro PIN so nasce com uma prova de que a pessoa e dona
 * do e-mail:
 *   - o navegador esta na conta Google dela (o Google ja provou); ou
 *   - um codigo de 6 numeros que o sistema manda para o e-mail dela; ou
 *   - um codigo que o administrador gerou em Pessoas e acessos (para quem
 *     nao consegue abrir o e-mail naquele momento).
 * O cache guarda so o resumo do codigo, nunca o codigo.
 */
function chaveCodigo_(email, origem) { return 'pincod_' + origem + '_' + email.replace(/[^a-z0-9]/g, '_'); }

function gerarCodigo_() {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid(), Utilities.Charset.UTF_8);
  let n = 0;
  for (let i = 0; i < 6; i++) n = (n * 256 + (b[i] & 255)) % 1000000;
  return ('00000' + n).slice(-6);
}

/*
 * Guarda o resumo do codigo. Para o e-mail, os 3 ultimos continuam valendo:
 * um pedido novo (de outra pessoa, inclusive) nao invalida o codigo que ja
 * esta na caixa de entrada de quem vai digitar.
 */
function guardarCodigo_(email, codigo, origem, segundos) {
  const h = resumoPin_(email, 'codigo:' + codigo);
  const antes = origem === 'email' ? lerCodigo_(email, origem) : null;
  const hs = [h].concat(antes ? (antes.hs || [antes.h]).filter(Boolean) : []).slice(0, CODIGO_POR_JANELA);
  CacheService.getScriptCache().put(chaveCodigo_(email, origem),
    JSON.stringify({ h: h, hs: hs, em: Date.now(), n: antes ? Number(antes.n || 1) + 1 : 1,
                     desde: antes ? Number(antes.desde || antes.em || Date.now()) : Date.now() }), segundos);
}

function lerCodigo_(email, origem) {
  const bruto = CacheService.getScriptCache().get(chaveCodigo_(email, origem));
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch (e) { return null; }
}

function codigoConfere_(email, codigo) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const resumo = resumoPin_(email, 'codigo:' + c);
  return ['email', 'admin'].some(function (o) {
    const g = lerCodigo_(email, o);
    return !!(g && (g.hs || [g.h]).indexOf(resumo) !== -1);
  });
}

function apagarCodigos_(email) {
  try { CacheService.getScriptCache().removeAll([chaveCodigo_(email, 'email'), chaveCodigo_(email, 'admin')]); } catch (e) {}
}

/*
 * Manda o codigo para o e-mail da propria pessoa — direto pelo MailApp e SEM
 * a copia (EMAIL_COPIA) que os avisos levam: o codigo e so dela.
 */
function mandarCodigoPorEmail_(email, nome) {
  const atual = lerCodigo_(email, 'email');
  if (atual && Date.now() - Number(atual.em || 0) < CODIGO_REENVIO_MS) return { jaEnviado: true };
  /*
   * LIMITES (4.2.2). O entrar() e publico: qualquer conta da empresa podia
   * pedir codigo em nome de quem ainda nao tem PIN, sem fim — gastando a
   * cota diaria de e-mail do dono (a mesma do digesto e dos avisos).
   */
  const pedeAdmin = 'Peça ao administrador um código de primeiro acesso (Pessoas e acessos).';
  if (atual && Number(atual.n || 0) >= CODIGO_POR_JANELA) {
    return { erro: 'Já mandamos ' + CODIGO_POR_JANELA + ' códigos para este e-mail. Use o mais recente, ' +
      'espere 15 minutos ou ' + pedeAdmin.charAt(0).toLowerCase() + pedeAdmin.slice(1) };
  }
  const cache = CacheService.getScriptCache();
  const kHora = 'pincod_hora_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  const naHora = Number(cache.get(kHora) || 0);
  let cota = CODIGO_RESERVA_COTA + 1;
  try { cota = MailApp.getRemainingDailyQuota(); } catch (e) { /* sem leitura da cota: segue */ }
  if (naHora >= CODIGO_GLOBAL_HORA || cota <= CODIGO_RESERVA_COTA) {
    return { erro: 'O envio de códigos está no limite agora. ' + pedeAdmin };
  }
  cache.put(kHora, String(naHora + 1), 3600);
  const codigo = gerarCodigo_();
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'GSL Bartofil — código de primeiro acesso: ' + codigo,
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14152B;max-width:560px">' +
        '<p>Olá' + (nome ? ', <b>' + htmlSeguro(nome) + '</b>' : '') + '.</p>' +
        '<p>Alguém está criando o PIN do GSL para o e-mail <b>' + htmlSeguro(email) + '</b>. ' +
        'Se foi você, digite este código na tela de entrada:</p>' +
        '<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#111785">' + codigo + '</p>' +
        '<p style="color:#666;font-size:12px">O código vale 15 minutos. Se não foi você, ignore este e-mail — ' +
        'sem o código ninguém cria o seu PIN.</p></div>'
    });
  } catch (e) {
    return { erro: 'Não consegui mandar o código para o seu e-mail (' + (e.message || e) + '). ' +
      'Peça ao administrador um código de primeiro acesso (Pessoas e acessos).' };
  }
  guardarCodigo_(email, codigo, 'email', CODIGO_EMAIL_SEG);
  try {
    registrarLog(emailDeQuemAbriu() || 'sistema', 'EMAIL', 'CODIGO_PIN', email,
      'Código de primeiro acesso enviado (pedido pela conta ' + (emailDeQuemAbriu() || '—') + ')');
  } catch (e) {}
  return { enviado: true };
}

/*
 * PORTA DE ENTRADA — e-mail + PIN.
 *   PIN certo           -> sessao nova + tudo que a tela precisa (como no doGet)
 *   primeiro acesso     -> { criarPin: true } ate a pessoa repetir o PIN
 *   errado 5 vezes      -> 10 minutos de espera para aquele e-mail
 */
function entrar(email, pin, confirmacao, filial, codigo, tela) {
  _porta = true;
  try {
    const r = entrar_(email, pin, confirmacao, filial, codigo);
    // Veio de um link de e-mail (?tela=...): a tela ja vai junto com a entrada (uma ida so).
    if (r && r.ok && r.entrada === 'APP' && tela && typeof embutirTela_ === 'function') embutirTela_(r, r.token, tela, '');
    return JSON.stringify(r);
  } catch (erro) {
    return JSON.stringify({ ok: false, erro: String(erro.message || erro) });
  }
}

function entrar_(emailBruto, pinBruto, confBruto, filial, codBruto) {
  _porta = true;
  if (!bancoInstalado()) return { ok: false, erro: 'O sistema ainda não foi instalado.' };
  try { garantirEsquema(); } catch (erro) {
    return { ok: false, erro: 'Não consegui atualizar o banco: ' + (erro.message || erro) };
  }

  const email = String(emailBruto || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'Digite o seu e-mail.' };
  if (pinBloqueado_(email)) {
    return { ok: false, erro: 'PIN errado muitas vezes. Espere 10 minutos ou peça ao administrador para zerar o seu PIN.' };
  }

  const pin = String(pinBruto || '').trim();
  const registro = registroDeAcesso_(email);
  const admin = String(prop('EMAIL_ADMIN', '')).toLowerCase().trim();
  const ehDono = email === admin || email === donoDoScript();
  const googleConfirma = emailDeQuemAbriu() === email;

  if (!registro) {
    // Dono sem linha em ACESSOS: so entra pela propria conta Google.
    if (ehDono && googleConfirma) return abrirSessaoPara_(email, filial);
    return { ok: false, erro: 'Este e-mail não está cadastrado no GSL. Peça ao administrador para liberar o seu acesso.' };
  }

  const situacao = String(registro.SITUACAO || '').toUpperCase().trim();
  const perfil = String(registro.PERFIL || '').toUpperCase().trim();
  if (!marcado(registro.ATIVO) || situacao === 'RECUSADO' || situacao === 'INATIVO') {
    return { ok: false, erro: 'Seu acesso ao GSL está desativado. Fale com o administrador.' };
  }
  if (!perfil || perfil === PERFIL_PADRAO_NOVO_USUARIO) {
    return { ok: false, erro: 'Seu cadastro existe, mas ainda não tem nível de acesso. Fale com o administrador.' };
  }
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, erro: 'O PIN tem de 4 a 6 números.' };

  const resumo = String(registro.PIN_HASH || '').trim();
  if (!resumo) {
    // PRIMEIRO ACESSO: a propria pessoa cria o PIN, digitando duas vezes —
    // e prova que o e-mail e dela (ver CODIGO DE PRIMEIRO ACESSO).
    const primeiroNome = String(registro.NOME || '').split(' ')[0];
    const conf = String(confBruto || '').trim();
    const codigo = String(codBruto || '').replace(/\D/g, '');
    if (!googleConfirma) {
      if (!codigo) {
        const envio = mandarCodigoPorEmail_(email, primeiroNome);
        if (envio.erro) return { ok: false, criarPin: true, pedirCodigo: true, erro: envio.erro };
        return { ok: false, criarPin: true, pedirCodigo: true, nome: primeiroNome,
                 recado: 'Primeiro acesso: mandamos um código de 6 números para ' + email +
                         '. Digite o código e repita o PIN.' };
      }
      if (!codigoConfere_(email, codigo)) {
        const n = contarErroPin_(email);
        const restam = PIN_TENTATIVAS - n;
        return { ok: false, criarPin: true, pedirCodigo: true, erro: restam > 0
          ? 'Código incorreto ou vencido. Confira o e-mail mais recente do GSL. ' +
            (restam === 1 ? 'Resta 1 tentativa.' : 'Restam ' + restam + ' tentativas.')
          : 'Tentativas demais. Espere 10 minutos ou peça ao administrador um código de primeiro acesso.' };
      }
    }
    if (!conf) {
      return { ok: false, criarPin: true, pedirCodigo: !googleConfirma, nome: primeiroNome,
               recado: 'Primeiro acesso: repita o PIN para confirmar. Guarde bem — é ele que você vai usar sempre.' };
    }
    if (conf !== pin) {
      return { ok: false, criarPin: true, pedirCodigo: !googleConfirma, erro: 'Os dois PINs não são iguais. Digite de novo.' };
    }
    atualizar('ACESSOS', registro.ID, { PIN_HASH: resumoPin_(email, pin), PIN_EM: agoraTexto() }, email);
    limparCache('ACESSOS');
    apagarCodigos_(email);
  } else if (resumoPin_(email, pin) !== resumo) {
    const n = contarErroPin_(email);
    const restam = PIN_TENTATIVAS - n;
    return { ok: false, erro: restam > 0
      ? 'PIN incorreto. ' + (restam === 1 ? 'Resta 1 tentativa.' : 'Restam ' + restam + ' tentativas.')
      : 'PIN errado muitas vezes. Espere 10 minutos ou peça ao administrador para zerar o seu PIN.' };
  }

  zerarErrosPin_(email);
  return abrirSessaoPara_(email, filial);
}

/*
 * TROCAR O PROPRIO PIN (4.2.2). Pede o PIN atual (quem achou a sessao aberta
 * num computador compartilhado nao troca o PIN de outra pessoa) e conta os
 * erros junto com os da entrada: 5 erros bloqueiam por 10 minutos.
 */
function acaoTrocarMeuPin(usuario, params) {
  const email = String(usuario.email || '').toLowerCase().trim();
  const atual = String(params.atual || '').trim();
  const novo = String(params.novo || '').trim();
  const conf = String(params.confirmacao || '').trim();
  if (pinBloqueado_(email)) throw new Error('PIN errado muitas vezes. Espere 10 minutos e tente de novo.');
  const registro = registroDeAcesso_(email);
  if (!registro || !String(registro.PIN_HASH || '').trim()) {
    throw new Error('Seu cadastro ainda não tem PIN. Saia e entre de novo para criar o seu.');
  }
  if (resumoPin_(email, atual) !== String(registro.PIN_HASH).trim()) {
    const restam = PIN_TENTATIVAS - contarErroPin_(email);
    throw new Error(restam > 0 ? 'O PIN atual está incorreto. ' + (restam === 1 ? 'Resta 1 tentativa.' : 'Restam ' + restam + ' tentativas.')
      : 'PIN errado muitas vezes. Espere 10 minutos e tente de novo.');
  }
  if (!/^\d{4,6}$/.test(novo)) throw new Error('O PIN novo tem de 4 a 6 números.');
  if (novo !== conf) throw new Error('Os dois campos do PIN novo não são iguais.');
  if (novo === atual) throw new Error('O PIN novo é igual ao atual.');
  zerarErrosPin_(email);
  atualizar('ACESSOS', registro.ID, { PIN_HASH: resumoPin_(email, novo), PIN_EM: agoraTexto() }, email);
  limparCache('ACESSOS');
  return { ok: true, recado: 'PIN trocado. Use o novo na próxima entrada.' };
}

/* Cria a sessao e devolve a mesma carga que o doGet mandaria (APP ou ESCOLHER_FILIAL). */
function abrirSessaoPara_(email, filial) {
  const token = criarSessao_(email);
  _tokenDaVez = token;
  esquecerUsuario();
  const carga = montarEntrada_(filial || '');
  carga.token = token;
  return carga;
}

/*
 * A aba recarregou com a sessao guardada: devolve a entrada de novo, sem
 * pedir o PIN. Com ctx.tela (a tela em que a aba estava), ela ja volta
 * montada — o F5 cai na mesma tela numa ida so.
 */
function retomarSessao(ctx) {
  const filial = contextoDaChamada_(ctx);
  try {
    if (!emailDaSessao_(_tokenDaVez)) return JSON.stringify({ ok: true, instalado: true, entrada: 'ENTRAR' });
    const carga = montarEntrada_(filial);
    carga.token = _tokenDaVez;
    // typeof: Auth.gs novo com Codigo.gs antigo (colado pela metade) entra assim mesmo e a faixa de versao avisa
    if (carga.ok && carga.entrada === 'APP' && ctx && ctx.tela && typeof embutirTela_ === 'function') embutirTela_(carga, _tokenDaVez, ctx.tela, ctx.p || '');
    return JSON.stringify(carga);
  } catch (erro) {
    return JSON.stringify({ ok: false, erro: String(erro.message || erro) });
  }
}

/* Sair: a sessao morre no servidor tambem (nao so no navegador). */
function sairDoSistema(ctx) {
  contextoDaChamada_(ctx);
  if (_tokenDaVez) encerrarSessao_(_tokenDaVez);
  return JSON.stringify({ ok: true });
}

/*
 * MANTER A SESSAO: a tela chama enquanto a pessoa esta mexendo nela
 * (digitando um relato longo, lendo uma tela grande) sem ir ao servidor,
 * para a 1 h sem uso contar do ultimo movimento. Aba esquecida (ninguem
 * mexendo) nao chama. Nao devolve dado nenhum.
 */
function manterSessao(ctx) {
  contextoDaChamada_(ctx);
  return JSON.stringify({ ok: !!emailDaSessao_(_tokenDaVez) });
}

/*
 * Esqueceu o PIN (ou ainda nao criou): o administrador zera e recebe um
 * CODIGO DE PRIMEIRO ACESSO para entregar a pessoa. Ela entra com o e-mail,
 * um PIN novo e esse codigo — ou pede o codigo por e-mail na propria tela.
 */
function acaoZerarPin(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  const alvo = obter('ACESSOS', params.id);
  if (!alvo) throw new Error('Pessoa não encontrada.');
  const perfilAlvo = String(alvo.PERFIL || '').toUpperCase().trim();
  if (perfilAlvo === 'ADMIN' && String(usuario.perfil).toUpperCase() !== 'ADMIN') {
    throw new Error('Só um administrador zera o PIN de outro administrador.');
  }
  const email = String(alvo.EMAIL || '').toLowerCase().trim();
  if (email === usuario.email) throw new Error('Para trocar o seu próprio PIN, peça a outro administrador.');
  atualizar('ACESSOS', params.id, { PIN_HASH: '', PIN_EM: '' }, usuario.email);
  limparCache('ACESSOS');
  zerarErrosPin_(email);
  const codigo = gerarCodigo_();
  guardarCodigo_(email, codigo, 'admin', CODIGO_ADMIN_SEG);
  registrarLog(usuario.email, 'CODIGO_PIN', 'ACESSOS', email, 'Código de primeiro acesso gerado pelo administrador');
  const nome = String(alvo.NOME || '').split(' ')[0] || 'a pessoa';
  return { ok: true, codigo: codigo, nome: nome, email: email,
    recado: 'Código de primeiro acesso de ' + nome + ': ' + codigo + ' (vale 6 horas).' };
}
