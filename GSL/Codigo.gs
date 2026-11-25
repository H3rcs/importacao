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
  versao: '4.2.2',
  /*
   * CARIMBO DA ENTREGA. Os arquivos que mudaram nesta entrega trazem o
   * mesmo carimbo (BUILD_<ARQUIVO>). Ao entrar, a tela confere: arquivo com
   * carimbo diferente (ou sem carimbo) = implantacao pela metade — um
   * arquivo colado no Apps Script e outro nao. Foi o que deu o "Ação
   * desconhecida: comentarAcao". Entrega nova: troque o carimbo aqui, no
   * BUILD_APP do App.html e nos arquivos alterados, e acerte a tabela de
   * arquivosForaDaVersao_ (cada arquivo com o carimbo da entrega em que
   * mudou por ultimo).
   */
  build: '2026.10.21'
};

/*
 * Arquivos .gs com carimbo diferente do esperado (implantacao pela metade).
 * Cada arquivo tem o carimbo da ultima entrega em que mudou:
 *   2026.10.09  = Limpeza (estoque do TI, Plano de Acao, fotos)
 *   2026.10.09c = Jovem Aprendiz (o 09b foi o primeiro envio do mesmo pacote)
 *   2026.10.10  = desempenho: sessao que nao cai, canal barrado sem espera,
 *                 bolinha das acoes em aberto no menu
 *   2026.10.13  = Quadro do CD pela aba GERAL, inconsistencias e painel novo
 *   2026.10.13b = Quadro do CD: correcoes da revisao (recontratado, mesmo nome, datas, casamento na tela)
 *   2026.10.14  = Quadro do CD: aba Ferias (a aba FERIAS cruzada com a GERAL) e a barra lateral que recolhe
 *   2026.10.14b = Quadro do CD: aba Ferias refeita (uma lista so, calendario a um toque, palavras neutras)
 *   2026.10.19  = rotinas do calendario pelo dia da semana, selo e marcacao nos comentarios das acoes,
 *                 fotos HEIC e painel desativado fora do menu
 *   2026.10.20  = fotos e gravacoes pela pagina quando o Google barra a conversa; excluir item do estoque de verdade
 *   2026.10.21  = ferias com programacao, acoes so para os citados, relatorios nas cores da Bartofil, planilha do aprendiz
 */
function arquivosForaDaVersao_() {
  const LIMPEZA = '2026.10.09', PEDIDO_19 = '2026.10.19', PEDIDO_20 = '2026.10.20', ENTREGA = APP.build;
  const carimbos = {
    'Acoes.gs':     [ENTREGA,   typeof BUILD_ACOES === 'undefined' ? '' : BUILD_ACOES],
    'Estoque.gs':   [PEDIDO_20, typeof BUILD_ESTOQUE === 'undefined' ? '' : BUILD_ESTOQUE],
    'Limpeza.gs':   [LIMPEZA,   typeof BUILD_LIMPEZA === 'undefined' ? '' : BUILD_LIMPEZA],
    'Emails.gs':    [PEDIDO_19, typeof BUILD_EMAILS === 'undefined' ? '' : BUILD_EMAILS],
    'Instalacao.gs':[ENTREGA,   typeof BUILD_INSTALACAO === 'undefined' ? '' : BUILD_INSTALACAO],
    'Filiais.gs':   [PEDIDO_19, typeof BUILD_FILIAIS === 'undefined' ? '' : BUILD_FILIAIS],
    'Aprendiz.gs':  [ENTREGA,   typeof BUILD_APRENDIZ === 'undefined' ? '' : BUILD_APRENDIZ],
    'Permissoes.gs':[PEDIDO_19, typeof BUILD_PERMISSOES === 'undefined' ? '' : BUILD_PERMISSOES],
    'Auth.gs':      [PEDIDO_19, typeof BUILD_AUTH === 'undefined' ? '' : BUILD_AUTH],
    'Banco.gs':     [PEDIDO_19, typeof BUILD_BANCO === 'undefined' ? '' : BUILD_BANCO],
    'Quadro.gs':    [ENTREGA,   typeof BUILD_QUADRO === 'undefined' ? '' : BUILD_QUADRO],
    'Calendario.gs':[PEDIDO_19, typeof BUILD_CALENDARIO === 'undefined' ? '' : BUILD_CALENDARIO],
    'Config.gs':    [PEDIDO_19, typeof BUILD_CONFIG === 'undefined' ? '' : BUILD_CONFIG]
  };
  return Object.keys(carimbos).filter(function (k) { return carimbos[k][1] !== carimbos[k][0]; });
}

/*
 * ENTRADA DO SISTEMA — e-mail e PIN (4.2).
 *
 * A implantacao e "Executar como: eu" + "Qualquer pessoa da Bartofil":
 * o Google Workspace so deixa chegar aqui quem esta logado com uma conta
 * da empresa — mas essa conta pode ser a geral do computador. Quem esta
 * usando e dito pela propria pessoa, a cada abertura: e-mail e PIN
 * (Auth.gs). O doGet devolve a pagina ja com a tela de entrada; depois
 * de entrar, a sessao vive so naquela aba.
 *
 *   /exec                 entrada normal (pede e-mail e PIN)
 *   /exec?filial=SSA      filial preferida depois de entrar
 *   /exec?diagnostico=1   diz se o Google esta informando quem abriu
 *   POST text/plain       API em JSON da versao local, a pasta GSL-Local (ver API DA VERSAO LOCAL)
 */
function doGet(e) {
  _porta = true;
  const pedido = (e && e.parameter) || {};
  if (pedido.diagnostico) return paginaDiagnostico_();
  /*
   * 4.2.2: o codigo de sessao NAO e aceito na URL. O ?t= da navegacao de
   * reserva ficava na barra de endereco e no historico do navegador: no
   * computador compartilhado, o proximo a usar voltava pelo historico e
   * entrava como a pessoa anterior, sem digitar PIN. A reserva agora e
   * um POST (ver doPost), que nao deixa o codigo em lugar nenhum.
   */
  return paginaComCarga_(cargaDaPagina_({ filial: pedido.filial, tela: pedido.tela, p: pedido.p, aba: pedido.aba, acao: pedido.acao }));
}

/*
 * RESERVA — onde o google.script.run e barrado (HTTP 403), a pagina
 * conversa com o servidor por POST no proprio /exec, que e navegacao de
 * pagina e passa onde a chamada nao passa. Dois formularios chegam aqui:
 *   - o de ENTRADA (email, pin, confirmacao, filial);
 *   - o de NAVEGACAO (t, filial, tela, p): trocar de filial ou abrir uma
 *     tela com a sessao que ja existe.
 */
function doPost(e) {
  _porta = true;
  // API da versao local (pasta GSL-Local): pedido e resposta em JSON, sem pagina. Ver API DA VERSAO LOCAL.
  const api = pedidoDaApi_(e);
  if (api) return responderApi_(api);
  const p = (e && e.parameter) || {};
  const pagina = doPost_(p);
  terminarBilhete_(p.bilhete);          // a folga de reenvio conta a partir daqui
  return pagina;
}

function doPost_(p) {

  // SAIR pela reserva: apaga a sessao no servidor (o sairDoSistema pelo
  // google.script.run tambem seria barrado). Reenviado, nao faz mal.
  if (p.sair) {
    if (/^[a-f0-9]{32,80}$/.test(String(p.sair))) {
      // typeof: Auth.gs da entrega anterior (colado pela metade) — apaga ao menos a copia do cache.
      if (typeof encerrarSessao_ === 'function') encerrarSessao_(String(p.sair));
      else { try { CacheService.getScriptCache().remove('sess_' + String(p.sair)); } catch (x) {} }
    }
    return paginaComCarga_({ ok: true, instalado: true, entrada: 'ENTRAR', recado: 'Você saiu do GSL.', viaPost: true });
  }

  /*
   * BILHETE DE USO UNICO (4.2.2). O navegador guarda o POST no historico:
   * F5 ou Voltar depois de "Sair" reenviava o e-mail e o PIN (ou a sessao)
   * da pessoa anterior e o proximo entrava como ela. Cada pagina leva um
   * bilhete; o POST so vale com um bilhete novo — ou enquanto o primeiro
   * pedido com ele ainda roda, ou ate 15 s depois de ele terminar (clique
   * repetido). Bilhete que sumiu do cache (pagina aberta mais de 6 h) nao
   * vale, mas a tela diz o motivo e guarda o e-mail.
   */
  const bilhete = estadoDoBilhete_(p.bilhete);
  if (bilhete !== 'ok') {
    // A pagina recusada NAO abre nada. Quem decide e a ABA: se ela ainda tem a
    // sessao viva (a regra do F5 do lerSessao), mostra "Continuar" — um clique,
    // sem PIN, e o servidor confere a sessao de novo. Aba restaurada pede o PIN.
    return paginaComCarga_({ ok: true, instalado: true, entrada: 'ENTRAR', viaPost: true, retomavel: true,
      emailDigitado: bilhete === 'vencido' ? String(p.email || '') : '',
      erroEntrada: bilhete === 'vencido'
        ? 'Esta página ficou aberta muito tempo. Digite o PIN de novo para entrar.'
        : 'Por segurança, esta página não pode ser reenviada. Digite o e-mail e o PIN de novo.' });
  }

  // GRAVAR pela reserva (o google.script.run e barrado nesta maquina): ver acaoPelaPagina_.
  if (!String(p.email || '').trim() && p.t && p.acao) return acaoPelaPagina_(p);
  if (!String(p.email || '').trim() && p.t) {
    const nav = cargaDaPagina_({ t: p.t, filial: p.filial, tela: p.tela, p: p.p });
    nav.viaPost = true;
    return paginaComCarga_(comPendencias_(nav));
  }
  let carga;
  try {
    const r = entrar_(p.email, p.pin, p.confirmacao, p.filial, p.codigo);
    // Entrou: o bilhete queima de vez (sem a folga de 15 s) — reenviar este
    // POST pelo historico nao pode abrir a sessao de novo.
    if (r && r.ok) queimarBilhete_(p.bilhete);
    // Veio de um link de e-mail (?tela=...): a tela ja vai junto com a entrada (com os filtros do link, em p).
    if (r && r.ok && r.entrada === 'APP' && p.tela) embutirTela_(r, r.token, p.tela, p.p);
    carga = (r && r.ok) ? r : { ok: true, instalado: true, entrada: 'ENTRAR',
      erroEntrada: (r && r.erro) || '', recado: (r && !r.erro && r.recado) || '',
      criarPin: !!(r && r.criarPin), pedirCodigo: !!(r && r.pedirCodigo),
      emailDigitado: String(p.email || '') };
    if (!(r && r.ok) && !carga.erroEntrada && !carga.recado) carga.erroEntrada = 'Não consegui entrar.';
  } catch (erro) {
    carga = { ok: true, instalado: true, entrada: 'ENTRAR', erroEntrada: String(erro.message || erro),
              emailDigitado: String(p.email || '') };
  }
  carga.viaPost = true;
  return paginaComCarga_(comPendencias_(carga));
}

/*
 * Pagina que veio pela RESERVA (POST): a bolinha do menu ja vai dentro — com
 * o canal barrado a pagina nao consegue pedir mais nada depois de aberta.
 * Pelo canal normal a bolinha vem numa chamada separada, depois do menu na
 * tela (acaoPendencias): a entrada nao espera por ela.
 */
function comPendencias_(carga) {
  if (carga && carga.ok && carga.entrada === 'APP') {
    try { carga.pendencias = pendenciasDoUsuario_(usuarioAtual()); }
    catch (e) { /* sem bolinha, nunca sem pagina */ }
  }
  return carga;
}

const BILHETE_SEG = 6 * 3600;
const BILHETE_FOLGA_MS = 15 * 1000;      // o mesmo prazo do F5 no navegador (gsl_saida)
const BILHETE_EM_USO_MS = 2 * 60 * 1000; // pedido que morreu no meio nao segura o bilhete para sempre

function novoBilhete_() {
  const b = Utilities.getUuid();
  try { CacheService.getScriptCache().put('bilhete_' + b, 'novo', BILHETE_SEG); } catch (e) {}
  return b;
}

function queimarBilhete_(bilhete) {
  try { CacheService.getScriptCache().put('bilhete_' + String(bilhete || ''), 'queimado', BILHETE_SEG); } catch (e) {}
}

/* 'ok' · 'vencido' (sumiu do cache: 6 h ou despejo) · 'recusado' (queimado, reenvio tardio, formato). */
function estadoDoBilhete_(bilhete) {
  const b = String(bilhete || '');
  if (!/^[0-9a-f-]{36}$/i.test(b)) return 'recusado';
  const cache = CacheService.getScriptCache();
  const v = cache.get('bilhete_' + b) || '';
  if (!v) return 'vencido';
  if (v === 'novo') {
    cache.put('bilhete_' + b, 'uso:' + Date.now(), BILHETE_SEG);
    return 'ok';
  }
  const m = /^(uso|fim):(\d+)$/.exec(v);
  if (!m) return 'recusado';                                 // queimado
  const idade = Date.now() - Number(m[2]);
  return (m[1] === 'uso' ? idade <= BILHETE_EM_USO_MS : idade <= BILHETE_FOLGA_MS) ? 'ok' : 'recusado';
}

/* O pedido terminou: a folga de 15 s comeca agora (bilhete queimado continua queimado). */
function terminarBilhete_(bilhete) {
  try {
    const b = String(bilhete || '');
    if (!/^[0-9a-f-]{36}$/i.test(b)) return;
    const cache = CacheService.getScriptCache();
    if (/^uso:/.test(cache.get('bilhete_' + b) || '')) cache.put('bilhete_' + b, 'fim:' + Date.now(), BILHETE_SEG);
  } catch (e) { /* so encurta a folga */ }
}

/*
 * Bilhete novo para a pagina que continua aberta. O cliente pede quando a
 * pagina passa de 4 h (enquanto o canal funciona), para a reserva por POST
 * nunca ficar com um bilhete vencido na mao. Nao exige sessao: qualquer
 * abertura da pagina (GET) ja da um bilhete novo — isto nao abre nada a mais.
 */
function renovarBilhete(ctx) {
  contextoDaChamada_(ctx);
  return novoBilhete_();
}

/*
 * O que a pagina leva dentro (CARGA_INICIAL). pedido = { t, filial, tela, p }.
 * Sem sessao valida, a pagina abre na ENTRADA (e-mail + PIN).
 */
function cargaDaPagina_(pedido) {
  let carga;
  try {
    if (!modoGoogle_() && bancoInstalado()) {
      _tokenDaVez = String(pedido.t || '');
      if (!emailDaSessao_(_tokenDaVez)) {
        _tokenDaVez = '';
        const carga = { ok: true, instalado: true, entrada: 'ENTRAR', sessaoInvalida: !!pedido.t };
        // Link de e-mail (?tela=calendario): depois da entrada, abre nessa tela.
        const destino = String(pedido.tela || '').toLowerCase().trim();
        if (!pedido.t && TELAS.some(function (x) { return x.id === destino; })) {
          carga.telaDepois = destino;
          carga.filialDepois = String(pedido.filial || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          // aba=1: o endereco que a pagina da reserva pos na barra (F5), nao um link — a posicao da aba vale mais.
          if (pedido.aba) carga.destinoDaAba = true;
          // E-mail de quem foi marcado num comentario (19/10): ?tela=acoes&acao=ID (ou tela=limpeza) abre o historico da acao.
          const telaDePlano = Object.keys(PLANOS).some(function (k) { return PLANOS[k].tela === destino; });
          if (telaDePlano && /^[A-Za-z0-9_-]{3,40}$/.test(String(pedido.acao || ''))) carga.acaoDepois = String(pedido.acao);
        }
        // Veio com sessao e ela acabou (1 h parada, ou saiu): a tela diz por que.
        if (pedido.t) carga.erroEntrada = 'Sua sessão terminou. Entre de novo com o seu e-mail e PIN.';
        return carga;
      }
    }
    carga = montarEntrada_(pedido.filial);
    if (_tokenDaVez) carga.token = _tokenDaVez;
    /*
     * tela=assiduidade — a tela ja vem montada dentro do HTML. E o caminho
     * de reserva do cliente: se o google.script.run for barrado numa
     * maquina (HTTP 403), abrir uma tela vira navegacao de pagina.
     */
    if (carga.ok && carga.entrada === 'APP' && pedido.tela) embutirTela_(carga, _tokenDaVez, pedido.tela, pedido.p);
  } catch (erro) {
    carga = { ok: false, erro: String(erro.message || erro) };
  }
  return carga;
}

/*
 * A tela pedida ja vai montada dentro da resposta (reserva por POST, link de
 * e-mail, F5). Os parametros (filtros) vem em JSON. carregarTela e a porta
 * de sempre: confere sessao, filial e permissao. Tela que a pessoa nao abre
 * vira o aviso, e ela cai no menu.
 */
function embutirTela_(carga, token, tela, pJson) {
  let params = {};
  try { params = pJson ? (JSON.parse(String(pJson)) || {}) : {}; } catch (x) { params = {}; }
  try {
    carga.telaEmbutida = { id: String(tela), params: params,
      resposta: JSON.parse(carregarTela({ t: token, f: carga.filial.codigo }, String(tela), params)) };
  } catch (erroTela) { carga.avisoTela = String(erroTela.message || erroTela); }
}

/*
 * GRAVAR PELA RESERVA (10/10). Onde o google.script.run e barrado, o agir()
 * da tela manda a acao num POST: t (sessao), filial, acao, ap (parametros em
 * JSON), idem (codigo unico do clique) e tela/p (a tela que volta). A acao
 * passa pela MESMA porta de sempre (executarAcao: sessao, filial, capacidade,
 * modulo). O idem guarda o resultado por 10 min: o mesmo POST reenviado
 * (clique repetido, "Continuar") nao grava de novo.
 */
function acaoPelaPagina_(p) {
  const idem = /^[0-9a-f-]{36}$/i.test(String(p.idem || '')) ? 'feito_' + String(p.idem).toLowerCase() : '';
  const cache = CacheService.getScriptCache();
  let resultado = null;
  if (idem) {
    try { const ja = cache.get(idem); if (ja) resultado = JSON.parse(ja); } catch (x) {}
  }
  if (!resultado) {
    if (idem) {
      // O mesmo clique reenviado enquanto o primeiro roda: aviso neutro (nao e erro — nao convida a gravar de novo).
      try { cache.put(idem, JSON.stringify({ ok: true, pendente: true, recado: 'A gravação ainda está sendo feita. Confira a tela em instantes.' }), 120); } catch (x) {}
    }
    let params = {};
    try { params = JSON.parse(String(p.ap || '{}')) || {}; } catch (x) { params = {}; }
    try {
      const r = JSON.parse(executarAcao({ t: p.t, f: p.filial }, String(p.acao), params)) || {};
      resultado = { ok: r.ok !== false, erro: r.ok === false ? String(r.erro || '') : '',
        recado: String(r.recado || ''), avisoEmail: String(r.avisoEmail || ''), aviso: String(r.aviso || '') };
    } catch (erro) {
      resultado = { ok: false, erro: String(erro.message || erro) };
    }
    if (idem) { try { cache.put(idem, JSON.stringify(resultado), 600); } catch (x) {} }
  }
  esquecerUsuario();
  const nav = cargaDaPagina_({ t: p.t, filial: p.filial, tela: p.tela, p: p.p });
  nav.viaPost = true;
  if (nav.entrada === 'APP') nav.resultadoAcao = Object.assign({ recadoBotao: String(p.recado || '').slice(0, 200) }, resultado);
  return paginaComCarga_(comPendencias_(nav));
}

/*
 * SONDA DO CANAL. A tela chama ao abrir a entrada (e de vez em quando nas
 * paginas da reserva) para saber se o google.script.run passa nesta
 * maquina — antes de a pessoa clicar. Nao le nem grava nada.
 */
function sondarCanal() { return 'ok'; }

/*
 * API DA VERSAO LOCAL (GSL-Local, a pasta compartilhada da Bartofil).
 *
 * A pagina aberta da pasta (file://, sem programa instalado) nao tem o
 * google.script.run: cada chamada vai por fetch() num POST text/plain
 * (pedido "simples", sem preflight) no mesmo /exec:
 *   {"api":1,"fn":"carregarTela","args":[{"t":"<sessao>","f":"FSA"},"acoes",{}]}
 * e volta {"ok":true,"valor":...} ou {"ok":false,"erro":"mensagem"} — o
 * mesmo que o google.script.run entrega a tela (o valor, ou a mensagem do
 * erro, com o [SESSAO] quando a sessao acabou). Tambem aceita o formulario
 * api=1&pedido=<o mesmo JSON>.
 *
 * O fetch de uma pagina file:// so passa com a implantacao em "Qualquer
 * pessoa" (sem login do Google): quem chama e ANONIMO para o Google. Por
 * isso:
 *   - so as portas que a tela ja chama passam (API_PORTAS); o resto, nem
 *     as funcoes internas, nem instalar, nem nada novo, e recusado;
 *   - cada porta roda com as conferencias de sempre (sessao, filial, a
 *     matriz de acesso em tres faixas — e o bloqueio do PIN na entrada);
 *   - fora a entrada (inicio, entrar, sondarCanal), a API exige o codigo
 *     de uma sessao viva ANTES de chamar a porta. Sem ela, a porta nem
 *     roda: volta o [SESSAO] (ou a resposta de "sem sessao" que a porta
 *     ja dava, para a tela reagir igual).
 * As paginas (doGet e o resto do doPost) continuam como estavam.
 */
const SESSAO_TERMINOU_API = '[SESSAO] Sua sessão terminou. Entre de novo com o seu e-mail e PIN.';
const API_PORTAS = {
  // entrada: sem sessao
  inicio:            { funcao: 'inicioPelaApi_', publica: true },
  entrar:            { funcao: 'entrar', publica: true },
  sondarCanal:       { funcao: 'sondarCanal', publica: true },
  // com sessao viva (semSessao: o que a propria porta responde sem sessao — a tela reage igual)
  retomarSessao:     { funcao: 'retomarSessao', semSessao: { ok: true, instalado: true, entrada: 'ENTRAR' } },
  abrirFilial:       { funcao: 'abrirFilial', semSessao: { ok: false, entrada: 'SEM_SESSAO', erro: SESSAO_TERMINOU_API } },
  manterSessao:      { funcao: 'manterSessao', semSessao: { ok: false } },
  sairDoSistema:     { funcao: 'sairDoSistema', semSessao: { ok: true } },
  carregarTela:      { funcao: 'carregarTela' },
  executarAcao:      { funcao: 'executarAcao' },
  executarAcaoETela: { funcao: 'executarAcaoETela' },
  obterAnexo:        { funcao: 'obterAnexo' },
  encerrarSimulacao: { funcao: 'encerrarSimulacao' }
};
const API_MAX_ARGS = 8;

/* O pedido da API, ou null quando o POST e de pagina (formulario de entrada, reserva). */
function pedidoDaApi_(e) {
  const pd = (e && e.postData) || null;
  const p = (e && e.parameter) || {};
  let bruto;
  if (pd && /^text\/plain/i.test(String(pd.type || ''))) bruto = String(pd.contents || '');
  else if (p.api === '1') bruto = String(p.pedido || '');
  else return null;
  let pedido = null;
  try { pedido = JSON.parse(bruto); } catch (x) { pedido = null; }
  if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido) || pedido.api !== 1) return { invalido: true };
  return pedido;
}

function responderApi_(pedido) {
  let r;
  try {
    r = { ok: true, valor: rodarPortaDaApi_(pedido) };
  } catch (erro) {
    r = { ok: false, erro: String((erro && erro.message) || erro || 'Erro desconhecido.') };
  }
  r.build = APP.build;          // a pasta compara com o carimbo dela (faixa "Atualização incompleta")
  let texto;
  try { texto = JSON.stringify(r); }
  catch (x) { texto = JSON.stringify({ ok: false, erro: 'O servidor montou uma resposta que não passa para a tela.', build: APP.build }); }
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

function rodarPortaDaApi_(pedido) {
  if (pedido.invalido) throw new Error('Pedido inválido para a API do GSL.');
  const nome = String(pedido.fn || '');
  const porta = Object.prototype.hasOwnProperty.call(API_PORTAS, nome) ? API_PORTAS[nome] : null;
  if (!porta) throw new Error('Função não liberada na API do GSL: ' + nome.replace(/[^\w.-]/g, '').slice(0, 60) + '.');
  // IDENTIDADE=GOOGLE (modo antigo) depende da conta do navegador, que a pagina local nao manda.
  if (modoGoogle_()) throw new Error('A versão local não funciona com a propriedade IDENTIDADE=GOOGLE. Use a versão online.');
  const args = Array.isArray(pedido.args) ? pedido.args.slice(0, API_MAX_ARGS) : [];
  if (!porta.publica) {
    const ctx = args[0];
    const token = ctx && typeof ctx === 'object' ? String(ctx.t || '') : '';
    if (!emailDaSessao_(token)) {
      if (porta.semSessao) return JSON.stringify(porta.semSessao);
      throw new Error(SESSAO_TERMINOU_API);
    }
  }
  const executor = globalThis[porta.funcao];
  if (typeof executor !== 'function') throw new Error('A porta ' + nome + ' não existe neste Codigo.gs.');
  const valor = executor.apply(null, args);
  return valor === undefined ? null : valor;
}

/*
 * O que a pagina local precisa para abrir (o CARGA_INICIAL que o doGet poe
 * dentro do HTML): entrada, link de e-mail (?tela=...), endereco online.
 * NUNCA com sessao: a aba que ja tem sessao continua pelo retomarSessao.
 */
function inicioPelaApi_(pedido) {
  const q = pedido && typeof pedido === 'object' ? pedido : {};
  const texto = function (v) { return v === undefined || v === null ? '' : String(v).slice(0, 2000); };
  const carga = cargaDaPagina_({ filial: texto(q.filial), tela: texto(q.tela), p: texto(q.p), aba: texto(q.aba), acao: texto(q.acao) });
  carga.urlApp = urlDoApp_();
  return JSON.stringify(carga);
}

/*
 * GATILHO DE VERDADE (versao local). Com a implantacao em "Qualquer pessoa",
 * quem chama pelo navegador tambem chega sem conta Google (vazio), como um
 * gatilho. A porta obrigatoria (exigirPorta_) deixava passar o vazio
 * pensando no gatilho; agora ela so deixa passar o vazio quando a funcao
 * do gatilho provou que e um gatilho: o evento traz o triggerUid de um
 * gatilho instalado neste projeto. Quem chama a funcao pelo console nao
 * tem esse numero.
 */
var _gatilhoConferido = false;
function gatilhoDeVerdade_(e) {
  const uid = e && typeof e === 'object' && e.triggerUid ? String(e.triggerUid) : '';
  if (!uid) return false;
  try {
    if (ScriptApp.getProjectTriggers().some(function (g) { return String(g.getUniqueId()) === uid; })) _gatilhoConferido = true;
  } catch (x) { /* sem a lista, nao conta como gatilho */ }
  return _gatilhoConferido;
}

function paginaComCarga_(carga) {
  carga.urlApp = urlDoApp_();
  carga.bilhete = novoBilhete_();
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

/*
 * Endereco do app. Em alguns projetos o getUrl() devolve o endereco de
 * teste (/dev), que so abre para quem edita o script: a reserva por POST e
 * o "Tentar de novo" levariam as pessoas a uma tela de erro. A propriedade
 * URL_APP (o /exec da implantacao, colado pelo administrador) tem
 * prioridade — ver /exec?diagnostico=1.
 */
function urlDoApp_() {
  const fixo = String(prop('URL_APP', '')).trim();
  if (/^https:\/\/script\.google\.com\/.+\/exec$/.test(fixo)) return fixo;
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
    // gravarPelaPagina: este Codigo.gs grava pela reserva (acaoPelaPagina_). App.html novo com o Codigo.gs
    // antigo nao manda a gravacao por POST — o doPost_ antigo trataria como navegacao e nada seria gravado.
    app: Object.assign({}, APP, { foraDaVersao: arquivosForaDaVersao_(), gravarPelaPagina: true }),
    usuario: {
      nome: usuario.nome, email: usuario.email, papel: usuario.papel || '', perfil: usuario.perfil,
      turno: usuario.turno, escopo: descreverEscopo(usuario)
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
  /*
   * Implantacao em "Qualquer pessoa" (versao local): esta pagina abre para quem
   * nao tem conta Google nenhuma. Sem ninguem identificado, a conta do dono vai
   * mascarada e os numeros das sessoes ficam de fora.
   */
  const anonimo = !emailDeQuemAbriu();
  // typeof: o Auth.gs da entrega anterior (colado pela metade) nao tem o resumo — a pagina abre assim mesmo
  const sessoes = !anonimo && typeof resumoDasSessoes_ === 'function' ? resumoDasSessoes_() : null;

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;color:#14152B">' +
    '<div style="background:#111785;color:#fff;padding:14px 18px;font-weight:bold">GSL — diagnóstico de identidade</div>' +
    '<table style="width:100%;border-collapse:collapse;background:#f7f8fc">' +
    linha('Quem o Google diz que abriu', d.usuarioAtivo || '(vazio)') +
    linha('Conta que executa o script', anonimo ? mascararEmail_(d.donoDoScript) : (d.donoDoScript || '(vazio)')) +
    linha('Cadastrada no GSL?', d.cadastrado ? 'SIM — ' + (d.perfil || '') : 'NÃO') +
    linha('Endereço usado pelo sistema', htmlSeguro(urlDoApp_() || '(vazio)') +
      (/\/dev$/.test(urlDoApp_()) ? ' — é o de TESTE: grave o /exec na propriedade URL_APP' : '')) +
    (sessoes ? linha('Sessões que o cache do Google perdeu e a cópia salvou (últimas 6 h)', String(sessoes.salvasPelaLoja)) +
      linha('Sessões guardadas agora', sessoes.naLoja < 0 ? '(não consegui ler)' : String(sessoes.naLoja)) : '') +
    '</table>' +
    '<p style="line-height:1.7;background:#FFF8D6;padding:14px 18px;border-left:4px solid #EA6D0B">' +
    d.veredito + (anonimo ? ' Com a implantação em "Qualquer pessoa" (a que a pasta GSL-Local usa), isto é o esperado: ' +
      'quem entra é dito pelo e-mail e PIN do GSL, não pela conta Google.' : '') + '</p></div>';

  return HtmlService.createHtmlOutput(html).setTitle('GSL — diagnóstico');
}

/* d***o@bartofil.com.br — a pagina de diagnostico aberta sem conta Google nao mostra o e-mail do dono. */
function mascararEmail_(email) {
  const e = String(email || '');
  const i = e.indexOf('@');
  if (i < 1) return e ? '(oculto)' : '(vazio)';
  return htmlSeguro(e.charAt(0) + '***' + (i > 1 ? e.charAt(i - 1) : '') + e.slice(i));
}

function acaoDiagnosticoIdentidade(usuario) {
  return diagnosticoIdentidade();
}

function include(nome) {
  try {
    return HtmlService.createHtmlOutputFromFile(nome).getContent();
  } catch (e) {
    // Tela de modulo esquecida (ou com outro nome) ao colar a entrega: o resto do GSL abre e a
    // faixa "Atualização incompleta" diz qual arquivo falta. As telas do nucleo continuam obrigatorias.
    if (INCLUDES_OPCIONAIS.indexOf(nome) !== -1) return '';
    throw e;
  }
}
const INCLUDES_OPCIONAIS = ['Aprendiz'];

/**
 * CATALOGO DE ACOES — a unica porta de gravacao (e das leituras sob demanda).
 *
 * Cada acao diz de qual TELA ela e. executarAcao confere na matriz de
 * permissoes (exigirAcao_, Permissoes.gs) antes de chamar a funcao:
 *   tela: 'x'            -> precisa de "Ver e editar" na tela x;
 *   tela: ['x', 'y']     -> "Ver e editar" em qualquer uma delas (a acao mora nas duas);
 *   leitura: true        -> so le (abrir foto, historico, ficha, exportar): basta "Ver";
 *   livre: true          -> da propria pessoa, fora de qualquer menu (relatar erro,
 *                           trocar o proprio PIN, a bolinha do menu, atualizar a copia).
 * Nenhuma outra conferencia decide quem pode: dentro das funcoes ficam so as
 * regras do negocio (alcance do escopo, so os citados veem a acao do plano, o
 * responsavel conclui a dele, ninguem valida a propria entrega...).
 * Acao nova sem `tela` (e sem `livre`) e recusada aqui e reprova o teste
 * testes/perfis.js — nao existe acao fora da matriz.
 */
const ACOES = {
  // calendario — o ciclo de entrega e validacao
  entregar:            { tela: 'calendario', funcao: 'acaoEntregar' },
  validar:             { tela: 'calendario', funcao: 'acaoValidar' },
  definirSetor:        { tela: 'calendario', funcao: 'acaoDefinirSetor' },
  remarcar:            { tela: 'calendario', funcao: 'acaoRemarcar' },
  agendarTreinamento:  { tela: 'calendario', funcao: 'acaoAgendarTreinamento' },
  removerAnexo:        { tela: 'calendario', funcao: 'acaoRemoverAnexoAtividade' },
  detalhesAtividade:   { tela: 'calendario', leitura: true, funcao: 'acaoDetalhesAtividade' },
  iniciarEntrega:      { tela: 'calendario', funcao: 'acaoIniciarEntrega' },
  receberParte:        { tela: 'calendario', funcao: 'acaoReceberParte' },
  finalizarEntrega:    { tela: 'calendario', funcao: 'acaoFinalizarEntrega' },
  criarAtividade:      { tela: 'calendario', funcao: 'acaoCriarAtividade' },
  cancelarAtividade:   { tela: 'calendario', funcao: 'acaoCancelarAtividade' },
  cancelarCompetencia: { tela: 'calendario', funcao: 'acaoCancelarCompetencia' },
  reativarAtividade:   { tela: 'calendario', funcao: 'acaoReativarAtividade' },
  diagnosticoAcesso:   { tela: 'calendario', leitura: true, funcao: 'acaoDiagnosticoAcesso' },
  diagnosticoIdentidade: { tela: 'acessos', leitura: true, funcao: 'acaoDiagnosticoIdentidade' },

  /*
   * PLANO DE ACAO. Com "Ver e editar" no Plano de Acao: criar, editar,
   * reabrir, cancelar e excluir as acoes que a pessoa ve (so as em que esta
   * citada); concluir e comentar seguem a regra do plano (Acoes.gs): o
   * responsavel conclui a dele, comenta quem ve a acao.
   */
  salvarAcao:          { tela: 'acoes', funcao: 'acaoSalvarAcao' },
  concluirAcao:        { tela: 'acoes', funcao: 'acaoConcluirAcao' },
  comentarAcao:        { tela: 'acoes', funcao: 'acaoComentarAcao' },
  reabrirAcao:         { tela: 'acoes', funcao: 'acaoReabrirAcao' },
  cancelarAcao:        { tela: 'acoes', funcao: 'acaoCancelarAcao' },
  excluirAcao:         { tela: 'acoes', funcao: 'acaoExcluirAcao' },
  // Fotos (4.2.2): ver confere se a pessoa enxerga a acao (so leitura); tirar e gravar.
  fotoAcao:            { tela: 'acoes', leitura: true, funcao: 'acaoFotoAcao' },
  removerFotoAcao:     { tela: 'acoes', funcao: 'acaoRemoverFotoAcao' },
  // Foto HEIC (iPhone) que o navegador nao abre: o servidor converte na hora da escolha (os dois planos usam),
  // so para quem pode anexar a foto onde ela vai — a funcao confere o plano do pedido (exigirQuemAnexaFoto_, no Acoes.gs).
  converterFoto:       { tela: ['acoes', 'limpeza'], funcao: 'acaoConverterFoto' },

  // Conversas saiu na 4.2 (projeto para depois). As mensagens antigas
  // continuam na aba MENSAGENS; so nao ha mais tela nem acao para elas.

  /*
   * Relatar erro e livre porque quem esta travado num erro e justamente
   * quem tem menos acesso para contornar sozinho.
   */
  enviarFeedback:      { livre: true, funcao: 'acaoEnviarFeedback' },
  // Cada pessoa troca o proprio PIN (confere o atual).
  trocarMeuPin:        { livre: true, funcao: 'acaoTrocarMeuPin' },
  resolverFeedback:    { tela: 'relatos', funcao: 'acaoResolverFeedback' },

  // configuracao
  salvarSetor:         { tela: 'config', funcao: 'acaoSalvarSetor' },
  excluirSetor:        { tela: 'config', funcao: 'acaoExcluirSetor' },
  // Rotinas (19/10): gravar, desativar/ativar e remover acertam tambem as atividades ja geradas do calendario.
  salvarRotina:        { tela: 'config', funcao: 'acaoSalvarRotina' },
  alternarRotina:      { tela: 'config', funcao: 'acaoAlternarRotina' },
  excluirRotina:       { tela: 'config', funcao: 'acaoExcluirRotina' },
  // Rotina removida pela versao anterior: as pendentes que ficaram no calendario saem (Configuracao > Calendario).
  limparSiglaOrfa:     { tela: 'config', funcao: 'acaoLimparSiglaOrfa' },
  gerarMes:            { tela: 'config', funcao: 'acaoGerarMes' },
  salvarParametro:     { tela: 'config', funcao: 'acaoSalvarParametro' },
  corrigirFuso:        { tela: 'config', funcao: 'acaoCorrigirFuso' },
  ligarGatilhos:       { tela: 'config', funcao: 'acaoLigarGatilhos' },
  enviarDigesto:       { tela: 'config', funcao: 'acaoEnviarDigesto' },

  // GSL-DADOS (Configuracao > Fontes do RH; a Assiduidade tem o "Atualizar" e o diagnostico)
  salvarArquivoRH:     { tela: 'config', funcao: 'acaoSalvarArquivoRH' },
  excluirArquivoRH:    { tela: 'config', funcao: 'acaoExcluirArquivoRH' },
  previewImportacao:   { tela: 'config', funcao: 'acaoPreviewImportacao' },
  importarCompetencia: { tela: 'config', funcao: 'acaoImportarCompetencia' },
  codigosPendentes:    { tela: 'config', leitura: true, funcao: 'acaoCodigosPendentes' },
  salvarDePara:        { tela: 'config', funcao: 'acaoSalvarDePara' },
  excluirDePara:       { tela: 'config', funcao: 'acaoExcluirDePara' },
  reclassificar:       { tela: 'config', funcao: 'acaoReclassificar' },
  restaurarDePara:     { tela: 'config', funcao: 'acaoRestaurarDePara' },
  atualizarRH:         { tela: ['assiduidade', 'config'], funcao: 'acaoAtualizarRH' },
  // Tira da base as competencias sem cadastro (sobras de renomear/excluir antigos).
  limparOrfasRH:       { tela: ['assiduidade', 'config'], funcao: 'acaoLimparOrfasRH' },
  diagnosticoRH:       { tela: ['assiduidade', 'config'], leitura: true, funcao: 'acaoDiagnosticoRH' },
  // A aba COLABORADORES le do AGR_COLAB sob demanda — a lista nao cabia
  // no payload do painel (limite de 50 mil caracteres por celula).
  fichaColaborador:    { tela: 'assiduidade', leitura: true, funcao: 'acaoFichaColaborador' },
  colaboradores:       { tela: 'assiduidade', leitura: true, funcao: 'acaoColaboradores' },
  periodo:             { tela: 'assiduidade', leitura: true, funcao: 'acaoPeriodo' },

  // pessoas e acessos (a matriz de niveis, as pessoas e o ajuste de cada uma)
  salvarUsuario:       { tela: 'acessos', funcao: 'acaoSalvarUsuario' },
  excluirUsuario:      { tela: 'acessos', funcao: 'acaoExcluirUsuario' },
  alterarPermissao:    { tela: 'acessos', funcao: 'acaoAlterarPermissao' },
  alternarAtivo:       { tela: 'acessos', funcao: 'acaoAlternarAtivo' },
  definirAjustePessoa: { tela: 'acessos', funcao: 'acaoDefinirAjustePessoa' },
  // Compatibilidade (tela de antes, "Modulos por pessoa"): o ajuste de um modulo inteiro, nas mesmas faixas.
  definirModuloPessoa: { tela: 'acessos', funcao: 'acaoDefinirModuloPessoa' },
  restaurarPerfis:     { tela: 'acessos', funcao: 'acaoRestaurarPerfis' },
  zerarPin:            { tela: 'acessos', funcao: 'acaoZerarPin' },

  // estoque de TI
  salvarItemEstoque:   { tela: 'estoque', funcao: 'acaoSalvarItemEstoque' },
  excluirItemEstoque:  { tela: 'estoque', funcao: 'acaoExcluirItemEstoque' },
  importarItensEstoque:{ tela: 'estoque', funcao: 'acaoImportarItensEstoque' },
  movimentarEstoque:   { tela: 'estoque', funcao: 'acaoMovimentarEstoque' },
  estornarMovimento:   { tela: 'estoque', funcao: 'acaoEstornarMovimento' },
  inventarioEstoque:   { tela: 'estoque', funcao: 'acaoInventarioEstoque' },
  // leitura sob demanda: historico completo de um item (a tela leva so ~90 dias)
  historicoItemEstoque:{ tela: 'estoque', leitura: true, funcao: 'acaoHistoricoItemEstoque' },

  // filiais e paineis
  salvarFilial:        { tela: 'filiais', funcao: 'acaoSalvarFilial' },
  alterarPainel:       { tela: 'filiais', funcao: 'acaoAlterarPainel' },
  alternarFilial:      { tela: 'filiais', funcao: 'acaoAlternarFilial' },
  salvarPessoasFilial: { tela: 'filiais', funcao: 'acaoSalvarPessoasDaFilial' },

  // nobreaks
  lancarLeituras:      { tela: 'nobreaks', funcao: 'acaoLancarLeituras' },
  salvarLeitura:       { tela: 'nobreaks', funcao: 'acaoSalvarLeitura' },
  excluirLeitura:      { tela: 'nobreaks', funcao: 'acaoExcluirLeitura' },
  semanaNobreak:       { tela: 'nobreaks', leitura: true, funcao: 'acaoSemanaNobreak' },
  salvarNobreak:       { tela: 'nobreaks', funcao: 'acaoSalvarNobreak' },
  excluirNobreak:      { tela: 'nobreaks', funcao: 'acaoExcluirNobreak' },
  importarNobreaks:    { tela: 'nobreaks', funcao: 'acaoImportarNobreaks' },

  /*
   * LIMPEZA (4.2.2) — o Plano de Acao no mesmo modelo do Calendario e o
   * estoque no mesmo modelo do de TI. Ver foto e historico sao leitura.
   */
  salvarAcaoLimpeza:   { tela: 'limpeza', funcao: 'acaoSalvarAcaoLimpeza' },
  concluirAcaoLimpeza: { tela: 'limpeza', funcao: 'acaoConcluirAcaoLimpeza' },
  comentarAcaoLimpeza: { tela: 'limpeza', funcao: 'acaoComentarAcaoLimpeza' },
  reabrirAcaoLimpeza:  { tela: 'limpeza', funcao: 'acaoReabrirAcaoLimpeza' },
  cancelarAcaoLimpeza: { tela: 'limpeza', funcao: 'acaoCancelarAcaoLimpeza' },
  excluirAcaoLimpeza:  { tela: 'limpeza', funcao: 'acaoExcluirAcaoLimpeza' },
  fotoAcaoLimpeza:     { tela: 'limpeza', leitura: true, funcao: 'acaoFotoAcaoLimpeza' },
  removerFotoAcaoLimpeza: { tela: 'limpeza', funcao: 'acaoRemoverFotoAcaoLimpeza' },
  salvarItemLimpeza:   { tela: 'limpeza', funcao: 'acaoSalvarItemLimpeza' },
  excluirItemLimpeza:  { tela: 'limpeza', funcao: 'acaoExcluirItemLimpeza' },
  importarItensLimpeza:{ tela: 'limpeza', funcao: 'acaoImportarItensLimpeza' },
  movimentarLimpeza:   { tela: 'limpeza', funcao: 'acaoMovimentarLimpeza' },
  estornarLimpeza:     { tela: 'limpeza', funcao: 'acaoEstornarLimpeza' },
  inventarioLimpeza:   { tela: 'limpeza', funcao: 'acaoInventarioLimpeza' },
  historicoItemLimpeza:{ tela: 'limpeza', leitura: true, funcao: 'acaoHistoricoItemLimpeza' },
  salvarZona:          { tela: 'limpeza', funcao: 'acaoSalvarZona' },
  importarLimpeza:     { tela: 'limpeza', funcao: 'acaoImportarLimpeza' },

  // jovem aprendiz (Portal RH Aprendiz — Aprendiz.gs). Atualizar so rele a planilha: leitura.
  salvarFonteAprendiz: { tela: 'aprendiz', funcao: 'acaoSalvarFonteAprendiz' },
  atualizarAprendiz:   { tela: 'aprendiz', leitura: true, funcao: 'acaoAtualizarAprendiz' },

  // quadro do CD. Atualizar so rele a planilha: leitura.
  salvarFonteQuadro:   { tela: 'quadro', funcao: 'acaoSalvarFonteQuadro' },
  salvarParametrosFerias: { tela: 'quadro', funcao: 'acaoSalvarParametrosFerias' },
  // Programacao das ferias (21/10): a data escolhida para cada periodo fica no banco da filial (FERIAS_PROG).
  programarFerias:     { tela: 'quadro', funcao: 'acaoProgramarFerias' },
  confirmarFerias:     { tela: 'quadro', funcao: 'acaoConfirmarFerias' },
  cancelarProgramacaoFerias: { tela: 'quadro', funcao: 'acaoCancelarProgramacaoFerias' },
  atualizarQuadro:     { tela: 'quadro', leitura: true, funcao: 'acaoAtualizarQuadro' },

  // gerais, da propria pessoa
  // Bolinha do menu (acoes em aberto por modulo): so leitura; so conta o que a pessoa ve (nivelNaTela).
  pendencias:          { livre: true, funcao: 'acaoPendencias' },
  // "Atualizar dados" (barra lateral): joga fora as copias e rele a planilha; nao muda dado de ninguem.
  atualizarDados:      { livre: true, funcao: 'acaoAtualizarDados' }
};

/*
 * Segundos que um payload de tela vale no servidor. 10/10: 10 min (era 3).
 * Qualquer gravacao pelo sistema aposenta todas as telas na hora (a geracao
 * esta na chave); o prazo so pesa para o que for digitado direto na planilha.
 */
const VALIDADE_TELA = 600;

/*
 * A chave nao leva o e-mail de quem pediu — leva o que de fato muda o
 * conteudo: perfil, escopo e turno. Assim dez coordenadores do turno B
 * dividem o mesmo payload, e o primeiro que abrir paga por todos.
 * A excecao e o escopo PROPRIAS, onde o conteudo e pessoal mesmo.
 */
/*
 * Telas cujo conteudo depende de QUEM olha — o "voce" e o Concluir do Plano
 * de Acao, o "eu" de Pessoas e acessos. Sem o e-mail na chave, duas pessoas
 * do mesmo nivel e turno dividiam o mesmo payload (e cada ADMIN recebia o
 * que o aquecimento do cache montou para o dono).
 */
const TELAS_PESSOAIS = { acoes: true, acessos: true, limpeza: true };

/*
 * Telas sem a copia da tela: a funcao delas ja guarda a copia da planilha de fora
 * (Jovem Aprendiz: 5 minutos, ver dadosAprendiz). Com a copia da tela (10 min) por cima,
 * a avaliacao nova levava ate 15 minutos para aparecer, e cada nivel (gerente, admin)
 * via uma hora diferente da planilha ao mesmo tempo.
 */
const TELAS_SEM_COPIA = { aprendiz: true };

function chaveDeTela(idTela, usuario, params) {
  const e = escopoDe(usuario);
  const dono = (e.tipo === 'PROPRIAS' || TELAS_PESSOAIS[idTela]) ? usuario.email : '';
  /*
   * O DIA entra na chave. Os indicadores dependem de "hoje" (atrasada,
   * vence hoje, mes vigente); sem o dia, uma tela montada ontem continuava
   * sendo servida e mostrava numeros de um mes que ja virou.
   */
  const dia = paraISO(hoje());
  // A filial entra na chave: a mesma tela de duas filiais sao dois payloads. O carimbo
  // (APP.build) tambem: cada implantacao nova aposenta as telas montadas pelo codigo anterior.
  // Os arquivos fora da versao tambem: colar o arquivo que faltava (mesmo carimbo) aposenta a tela montada sem ele.
  return ['t', APP.build + arquivosForaDaVersao_().join(','), geracaoDados(), dia, filialAtual().codigo, idTela, usuario.perfil, usuario.chaveModulos || '',
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
  const tela = telaPorId_(idTela);
  if (!tela) throw new Error('Tela desconhecida: ' + idTela);
  // A matriz (painel da filial -> ajuste da pessoa -> nivel): Oculto nao abre, nem pelo link direto.
  exigirVer(usuario, idTela);

  /*
   * CACHE DE TELA NO SERVIDOR.
   *
   * Sem ele, toda abertura de tela reabre a planilha (openById) e le de
   * novo cada aba que a tela usa. Com ele, uma tela ja montada volta sem
   * tocar na planilha: o tempo cai de segundos para o custo da chamada.
   * A geracao dentro da chave garante que qualquer gravacao invalida
   * tudo na hora — nao existe janela de dado velho depois de uma escrita.
   */
  const semCopia = !!TELAS_SEM_COPIA[idTela];
  const chave = chaveDeTela(idTela, usuario, params);
  const guardado = semCopia ? null : lerTextoCache(chave);
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
    /*
     * O que a pessoa pode NESTA tela, com os dados: a tela so mostra botao
     * e campo de gravar com pode.editar (Ver e editar). Com Ver, ela abre so
     * para leitura — e o servidor recusa qualquer gravacao do mesmo jeito.
     */
    pode: { nivel: nivelNaTela(usuario, idTela), ver: true, editar: podeEditar(usuario, idTela) },
    // O retrato do menu (cada tela e a faixa dela): a tela confere com o menu que tem e, se mudou, rele o menu.
    menu: marcaDoMenu(usuario),
    dados: executor(usuario, params || {})
  });

  if (!semCopia) gravarTextoCache(chave, texto, VALIDADE_TELA);
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
function aquecerCache(e) {
  gatilhoDeVerdade_(e);         // o gatilho prova que e gatilho (ver GATILHO DE VERDADE)
  exigirPorta_();
  // As sessoes paradas saem da loja aqui (a qualquer hora), e nao na entrada de alguem.
  try { if (typeof podarSessoes_ === 'function') podarSessoes_(500); } catch (e) {}
  const hora = Number(Utilities.formatDate(new Date(), fuso(), 'H'));
  if (hora < 5 || hora > 21) return { ok: true, pulou: 'fora de horario' };
  if (!bancoInstalado()) return { ok: true, pulou: 'sem banco' };

  /*
   * 10/10 — O AQUECIMENTO QUE SERVE A TODOS. Antes ele montava as telas na
   * pele do administrador: so o administrador aproveitava (a chave da tela
   * leva o perfil). Agora, em cada filial ativa:
   *   - a atualizacao do banco (garantirEsquema), para a primeira entrada
   *     depois de uma versao nova nao pagar a migracao;
   *   - as copias que todo pedido le (pessoas, perfis, filiais);
   *   - as copias das tabelas que as telas leem (so relidas se venceram).
   */
  let tabelas = 0;
  try { cadastrosDeAcesso_(); carregarPerfis(); listarFiliais(); } catch (e) {}
  emCadaFilial_(null, function () {
    try { garantirEsquema(); } catch (e) { /* a entrada tenta de novo */ }
    TABELAS_AQUECIDAS.forEach(function (t) {
      try { listar(t); tabelas++; } catch (e) { /* tabela que falha nao derruba o resto */ }
    });
  });
  return { ok: true, tabelas: tabelas };
}
const TABELAS_AQUECIDAS = ['ATIVIDADES', 'SETORES', 'ROTINAS', 'PARAMETROS', 'COLABORADORES', 'ACOES', 'COMENTARIOS',
  'NB_EQUIPAMENTOS', 'NB_LEITURAS', 'EST_ITENS', 'EST_MOVIMENTOS', 'LP_EST_ITENS', 'LP_EST_MOVIMENTOS', 'LP_ZONAS'];

/*
 * GRAVAR E JA DEVOLVER A TELA (10/10). Antes cada gravacao eram duas idas ao
 * servidor em fila (a acao, depois a tela de novo) e a lista piscava em
 * "Carregando…". Aqui sao as duas portas de sempre — executarAcao e
 * carregarTela, cada uma com as suas conferencias — numa execucao so. A tela
 * e montada depois de a trava publicar a gravacao, entao ja mostra o que mudou.
 * 19/10: a gravacao que muda o menu (paineis, filiais e niveis: invalidarTudo;
 * a pessoa mexendo no proprio acesso: menuMudou) devolve tambem o menu novo —
 * o cartao some ou volta na hora, sem F5.
 */
function executarAcaoETela(ctx, nomeAcao, params, idTela, paramsTela) {
  const r = JSON.parse(executarAcao(ctx, nomeAcao, params)) || {};
  let tela = null, menu = null;
  if (!r.invalidarTudo && idTela && idTela !== 'modulos') {
    try { esquecerUsuario(); tela = JSON.parse(carregarTela(ctx, idTela, paramsTela || {})); } catch (e) { tela = null; }
  }
  if (r.invalidarTudo || r.menuMudou) {
    try { menu = menuDaSessao_(ctx); } catch (e) { menu = null; }   // sem menu, a tela fica como esta (F5 corrige)
  }
  return JSON.stringify({ r: r, tela: tela, menu: menu });
}

/*
 * O menu da pessoa (telas, modulos e filiais) relido DEPOIS da gravacao. A
 * filial em uso que deixou de valer volta como semFilial: a tela leva a escolha
 * de outra filial. motivo: 'desligada' (o administrador desligou a filial) ou
 * 'semAcesso' (a filial continua ligada; a pessoa saiu dela no proprio cadastro).
 */
function menuDaSessao_(ctx) {
  esquecerFiliais(); esquecerUsuario();
  const usuario = usuarioAtual();
  const filiais = filiaisDoUsuario(usuario);
  const codigo = String((ctx && ctx.f) || '').toUpperCase().trim();
  if (codigo && !filiais.some(function (f) { return f.codigo === codigo; })) {
    const f = filialPorCodigo(codigo);
    return { filial: codigo, semFilial: true, motivo: f && f.ativa ? 'semAcesso' : 'desligada', filiais: resumoDasFiliais_(filiais) };
  }
  const filial = entrarNaFilial(usuario, codigo);
  return { filial: filial.codigo, telas: telasDe(usuario), modulos: modulosDe(usuario), filiais: resumoDasFiliais_(filiais) };
}

function executarAcao(ctx, nomeAcao, params) {
  const codigoFilial = contextoDaChamada_(ctx);
  const usuario = usuarioAtual();
  entrarNaFilial(usuario, codigoFilial);
  const acao = Object.prototype.hasOwnProperty.call(ACOES, nomeAcao) ? ACOES[nomeAcao] : null;
  // Quase sempre e implantacao pela metade: a tela nova chama uma acao que o Codigo.gs antigo nao tem.
  if (!acao) throw new Error('Ação desconhecida: ' + nomeAcao + '. O Codigo.gs publicado está numa versão anterior às telas — ' +
    'cole todos os arquivos desta versão no Apps Script e crie uma "Nova versão" da implantação.');
  // A MATRIZ decide, e so ela: painel da filial -> ajuste da pessoa -> nivel (Permissoes.gs).
  exigirAcao_(usuario, nomeAcao, acao);

  const executor = globalThis[acao.funcao];
  if (typeof executor !== 'function') {
    throw new Error('A ação "' + nomeAcao + '" aponta para ' + acao.funcao + ', que nao existe.');
  }
  return JSON.stringify(executor(usuario, params || {}) || { ok: true });
}

/* --- Acoes gerais --- */

function acaoAtualizarDados() {
  // As copias das planilhas de fora (Quadro do CD e Jovem Aprendiz) ficam 5 minutos guardadas e nao
  // passam pelo limparCache: "Atualizar dados" tem que reler as da filial aberta tambem.
  try { const q = idPlanilhaQuadro_(); if (q) CacheService.getScriptCache().remove(chaveNoEspaco('quadro|' + q)); } catch (e) {}
  try { const a = idPlanilhaAprendiz_(); if (a) CacheService.getScriptCache().remove(chaveNoEspaco('aprendiz|' + a)); } catch (e) {}
  // As copias saem ANTES da varrida abaixo: ela tem que ler a planilha como esta agora (quem
  // clica aqui pode ter acabado de mexer nela a mao), e nao a copia de ate 30 min.
  limparCache();
  // Aproveita a varrida para alinhar rotulo de mes e semana ao prazo de
  // cada atividade. Uma linha remarcada por uma versao antiga ficou com
  // COMPETENCIA de agosto e prazo em setembro; e aqui que ela se acerta
  // (a gravacao dela aposenta as telas de novo).
  let corrigidas = 0;
  try { corrigidas = (corrigirCompetencias('atualizar dados') || {}).corrigidas || 0; } catch (e) {}
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
 *
 * A matriz vai inteira: os menus agrupados por modulo (linhas), os niveis
 * (colunas) com a faixa de cada celula, e para cada pessoa a faixa do nivel,
 * o ajuste dela e o que fica valendo (efetivo, sem o painel da filial).
 */
function dadosPessoas(usuario) {
  const perfis = carregarPerfis();
  const pessoas = listarPessoas();
  pessoas.forEach(function (p) {
    const doNivel = p.semNivel ? null : permissoesDe(p.perfil).niveis;
    const efetivo = p.semNivel ? null : permissoesDaPessoa(p.perfil, p.ajustes).niveis;
    p.doNivel = doNivel || {};
    p.efetivo = efetivo || {};
    delete p.modulos;
  });
  // Telas sem nenhuma gravacao no catalogo: ali "Ver e editar" e o mesmo que "Ver" (a grade avisa).
  const comGravacao = {};
  Object.keys(ACOES).forEach(function (n) {
    const a = ACOES[n];
    if (a.leitura === true || a.livre === true) return;
    [].concat(a.tela || []).forEach(function (t) { comGravacao[t] = true; });
  });
  const nomes = Object.keys(perfis).filter(function (n) { return n !== PERFIL_PADRAO_NOVO_USUARIO; });
  // ADMIN primeiro, os outros na ordem do nome.
  nomes.sort(function (a, b) { return a === 'ADMIN' ? -1 : (b === 'ADMIN' ? 1 : a.localeCompare(b)); });
  return {
    pessoas: pessoas,
    filiais: listarFiliais().map(function (f) {
      return { codigo: f.codigo, nome: f.nome, principal: f.principal, ativa: f.ativa };
    }),
    niveis: nomes,
    modulos: MODULOS.map(function (m) {
      return { id: m.id, nome: m.nome, telas: TELAS.filter(function (t) { return t.modulo === m.id; }).map(function (t) {
        return { id: t.id, nome: t.nome, soLeitura: !comGravacao[t.id] };
      }) };
    }).filter(function (m) { return m.telas.length; }),
    telas: TELAS.map(function (t) { return { id: t.id, nome: t.nome, modulo: t.modulo }; }),
    faixas: NIVEIS_TELA.map(function (f) { return { id: f, nome: NOMES_NIVEL[f] }; }),
    perfis: nomes.map(function (nome) {
      const travas = {};
      if (nome === 'ADMIN') travas[TELA_TRAVADA_ADMIN] = MOTIVO_TRAVA_ADMIN;
      return {
        id: perfis[nome].id, perfil: nome, escopo: perfis[nome].escopo,
        descricao: perfis[nome].descricao, niveis: permissoesDe(nome).niveis, travas: travas
      };
    }),
    // So o administrador mexe no nivel ADMIN e no acesso a Pessoas e acessos / Filiais e paineis (Auth.gs).
    soDoAdmin: String(usuario.perfil || '').toUpperCase() === 'ADMIN' ? [] : TELAS_SO_DO_ADMIN,
    souAdmin: String(usuario.perfil || '').toUpperCase() === 'ADMIN',
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
  const filial = contextoDaChamada_(ctx);
  const usuario = usuarioAtual();  // exige sessao valida
  entrarNaFilial(usuario, filial);
  // Os anexos sao das entregas do Calendario: baixar e ler a tela, entao segue a matriz dela (Ver basta).
  exigirVer(usuario, 'calendario');
  // So arquivo que mora dentro da pasta do GSL. Antes, qualquer ID do Drive
  // do dono (que e quem executa o script) saia por aqui.
  if (!arquivoDoGsl_(idArquivo)) throw new Error('Este arquivo não é um anexo do GSL.');
  // Foto de acao (Anexos/ACOES/<id>) so sai pela porta do plano, que confere quem enxerga a acao.
  if (fotoDeAcao_(idArquivo)) throw new Error('Esta foto abre pelo Plano de Ação.');
  return baixarAnexo(idArquivo);
}

/* true se o arquivo mora em Anexos/ACOES/<id da acao>/. */
function fotoDeAcao_(idArquivo) {
  const anexos = String(prop('ID_PASTA_ANEXOS', ''));
  try {
    const pais = DriveApp.getFileById(String(idArquivo)).getParents();
    while (pais.hasNext()) {
      const avos = pais.next().getParents();
      while (avos.hasNext()) {
        const tabela = avos.next();
        if (tabela.getName() !== 'ACOES') continue;
        const raiz = tabela.getParents();
        while (raiz.hasNext()) if (raiz.next().getId() === anexos) return true;
      }
    }
  } catch (e) { /* sem acesso ao arquivo: o resto da conferencia decide */ }
  return false;
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

const TIPOS_DE_RELATO = ['ERRO', 'SUGESTAO', 'DUVIDA'];

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
    TIPO: TIPOS_DE_RELATO.indexOf(tipo) !== -1 ? tipo : 'ERRO',
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
  return { feedbacks: listarFeedback(), podeVerFeedback: true };
}
