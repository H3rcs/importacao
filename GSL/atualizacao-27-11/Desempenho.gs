/**
 * Desempenho.gs — o MEDIDOR, a ABERTURA EM PARTES e o AQUECIMENTO (27/11).
 *
 * O gerente testou em producao: "no computador normal o GSL e rapido, na
 * cloud e uma tartaruga" e "o login sempre da problema de conexao com o
 * Google". Para decidir com numero na mao, a tela mede e o servidor guarda:
 *
 *   MEDIDOR    cada pagina mede a abertura (ate a entrada aparecer), a entrada
 *              (e-mail e PIN ate o menu), cada chamada ao Google (nome, tempo,
 *              tamanho, falha, nova tentativa, desvio pela pagina) e o tempo de
 *              desenhar as telas pesadas. O servidor mede o proprio tempo de cada
 *              tela e acao e quantas abas da planilha leu (vai junto na resposta,
 *              no campo _srv). A tela junta as medicoes e manda em lote, de
 *              minuto em minuto no maximo (acao registrarDesempenho). Guardado no
 *              cache do script por 6 h (fatias de 15 min), e um resumo por dia em
 *              14 dias (propriedade DSP_DIAS, feito pelo aquecimento). Quem ve:
 *              so o administrador, em Configuracao > Sistema > Desempenho.
 *
 *   EM PARTES  a pagina do /exec (GET) sai sem os modulos pesados (Paineis,
 *              Aprendiz, Carga e o estilo da Carga): a entrada aparece com menos
 *              da metade do HTML, e a tela busca os modulos por tras enquanto a
 *              pessoa digita o PIN (carregarModulo). A pagina da reserva (POST,
 *              computador que barra a conversa com o Google) continua inteira.
 *
 *   AQUECIMENTO o gatilho aquecerCache passa a rodar de 5 em 5 minutos (Ligar
 *              rotinas automaticas): a cada vez, das 5h as 21h, o servidor roda um
 *              pouco (menos partidas a frio do Apps Script para quem chega); o
 *              aquecimento completo (as tabelas no cache) continua de 15 em 15.
 *              Desligavel no painel (propriedade MANTER_AQUECIDO = NAO).
 */

const BUILD_DESEMPENHO = '2026.11.27';   // carimbo da entrega — ver APP.build no Codigo.gs

/* ------------------------------------------------------------------ */
/* ABERTURA EM PARTES                                                  */
/* ------------------------------------------------------------------ */

/* Os modulos que a pagina do GET deixa de fora (na ordem: a Carga usa funcoes do Paineis). */
const MODULOS_A_PARTE = {
  paineis: ['Paineis'],
  aprendiz: ['Aprendiz'],
  carga: ['CargaEstilo', 'Carga']
};

/*
 * O codigo de um modulo para a tela (google.script.run). O mesmo HTML que o
 * doGet poria na pagina (include: o HtmlService ja passou pelos <script>),
 * sem dado nenhum: abre sem sessao, como a propria pagina. Modulo opcional
 * que nao foi colado no projeto (Carga, Aprendiz) volta vazio — a faixa
 * "Atualizacao incompleta" diz qual falta.
 */
function carregarModulo(nome) {
  const t0 = Date.now();
  const n = String(nome || '');
  if (!Object.prototype.hasOwnProperty.call(MODULOS_A_PARTE, n)) throw new Error('Módulo desconhecido: ' + n.replace(/[^\w-]/g, '').slice(0, 30));
  const html = MODULOS_A_PARTE[n].map(function (f) { return include(f); }).join('\n');
  return JSON.stringify({ nome: n, build: APP.build, html: html, _srv: { ms: Date.now() - t0 } });
}

/* ------------------------------------------------------------------ */
/* MEDIDOR — gravar                                                    */
/* ------------------------------------------------------------------ */

const DSP_FATIA_MS = 15 * 60 * 1000;      // uma chave do cache a cada 15 min
const DSP_FATIAS = 24;                    // 24 x 15 min = 6 h (o limite do cache)
const DSP_GAVETAS = 4;                    // pessoas diferentes gravando juntas nao se atropelam
const DSP_MAX_BYTES = 90 * 1024;          // o cache recusa valor acima de 100 KB
const DSP_TIPOS = { abertura: 1, entrada: 1, run: 1, tela: 1, pdf: 1, post: 1, modulo: 1, leve: 1 };
const DSP_VIAS = { run: 1, post: 1, local: 1, pagina: 1 };

const dspFatia_ = function (ms) { return Math.floor(ms / DSP_FATIA_MS); };
const dspChave_ = function (fatia, gaveta) { return 'dsp|' + fatia + '|' + gaveta; };
function dspGaveta_(texto) {
  let h = 0;
  String(texto || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 9973; });
  return h % DSP_GAVETAS;
}
const dspTexto_ = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').slice(0, max); };
const dspInt_ = function (v, max) { const n = Math.round(Number(v) || 0); return n < 0 ? 0 : (n > max ? max : n); };

/* A maquina que mediu: o rotulo dado no painel, a dica do navegador e se o modo leve esta ligado. */
function dspMaquina_(m) {
  m = m && typeof m === 'object' ? m : {};
  return { id: dspTexto_(m.id, 16).replace(/[^\w-]/g, '') || 'sem-id', r: dspTexto_(m.r, 40), d: dspTexto_(m.d, 140), l: m.l ? 1 : 0 };
}

/*
 * Uma amostra no formato curto do cache:
 *   [quando, quem, maquina, tipo, nome, detalhe, ms, ok, srv, leituras, kb, tentativas, via, erro]
 */
function dspAmostra_(a, agora, quem, maq) {
  if (!a || typeof a !== 'object' || !DSP_TIPOS[a.k]) return null;
  const idade = dspInt_(a.i, 6 * 3600 * 1000);
  return [agora - idade, quem, maq, String(a.k), dspTexto_(a.n, 40).replace(/[^\w.:-]/g, ''), dspTexto_(a.x, 40).replace(/[^\w.:-]/g, ''),
    dspInt_(a.ms, 600000), a.ok ? 1 : 0, a.srv == null ? -1 : dspInt_(a.srv, 600000), dspInt_(a.lp, 999), dspInt_(a.kb, 99999),
    dspInt_(a.rt, 9), DSP_VIAS[a.via] ? String(a.via) : 'run', a.ok ? '' : dspTexto_(a.e, 160)];
}

/* Guarda um lote de medicoes. quem: o e-mail (fica so o nome antes do @). */
function dspGuardar_(email, pedido) {
  pedido = pedido && typeof pedido === 'object' ? pedido : {};
  const lista = Array.isArray(pedido.a) ? pedido.a.slice(0, 80) : [];
  if (!lista.length) return 0;
  const agora = Date.now();
  const quem = String(email || '').split('@')[0].slice(0, 40);
  const maq = dspMaquina_(pedido.m);
  const novas = lista.map(function (a) { return dspAmostra_(a, agora, quem, maq.id); }).filter(Boolean);
  if (!novas.length) return 0;
  const cache = CacheService.getScriptCache();
  const chave = dspChave_(dspFatia_(agora), dspGaveta_(maq.id + quem));
  let caixa = null;
  try { caixa = JSON.parse(cache.get(chave) || 'null'); } catch (e) { caixa = null; }
  if (!caixa || !Array.isArray(caixa.a)) caixa = { a: [], m: {} };
  caixa.a = caixa.a.concat(novas);
  caixa.m[maq.id] = [maq.r, maq.d, maq.l, quem, agora];
  let texto = JSON.stringify(caixa);
  while (texto.length > DSP_MAX_BYTES && caixa.a.length > 10) {           // cheia: saem as mais velhas
    caixa.a = caixa.a.slice(Math.ceil(caixa.a.length / 4));
    texto = JSON.stringify(caixa);
  }
  try { cache.put(chave, texto, 6 * 3600); } catch (e) { return 0; }
  return novas.length;
}

/* Acao livre (cada pessoa manda as proprias medicoes): { m: maquina, a: [amostras] }. */
function acaoRegistrarDesempenho(usuario, params) {
  exigirPorta_();
  return { ok: true, n: dspGuardar_(usuario && usuario.email, params) };
}

/* A pagina que veio pela reserva (POST) traz as medicoes que a aba juntou (campo dsp do formulario). */
function dspDoFormulario_(email, texto) {
  if (!email || !texto || String(texto).length > 20000) return;
  try { dspGuardar_(email, JSON.parse(String(texto))); } catch (e) { /* medicao nunca atrapalha a pagina */ }
}

/* Leituras de planilha desta execucao (contadas no listar, Banco.gs) e o tempo do servidor (_srv). */
function dspMarca_(texto, t0, doCache) {
  if (typeof texto !== 'string' || texto.charAt(0) !== '{' || texto.length < 3) return texto;
  const lp = typeof _dspLeituras === 'number' ? _dspLeituras : 0;
  return '{"_srv":{"ms":' + (Date.now() - t0) + ',"lp":' + lp + (doCache ? ',"c":1' : '') + '},' + texto.slice(1);
}

/* ------------------------------------------------------------------ */
/* MEDIDOR — o painel (so o administrador)                              */
/* ------------------------------------------------------------------ */

function dspTodas_() {
  const agora = Date.now(), f = dspFatia_(agora), chaves = [];
  for (let i = 0; i < DSP_FATIAS + 1; i++) for (let g = 0; g < DSP_GAVETAS; g++) chaves.push(dspChave_(f - i, g));
  let mapa = {};
  try { mapa = CacheService.getScriptCache().getAll(chaves) || {}; } catch (e) { mapa = {}; }
  const amostras = [], maquinas = {};
  Object.keys(mapa).forEach(function (k) {
    let c = null;
    try { c = JSON.parse(mapa[k]); } catch (e) { c = null; }
    if (!c || !Array.isArray(c.a)) return;
    c.a.forEach(function (a) { if (Array.isArray(a) && a.length >= 14 && agora - a[0] <= 6 * 3600 * 1000) amostras.push(a); });
    Object.keys(c.m || {}).forEach(function (id) {
      const m = c.m[id];
      if (!maquinas[id] || maquinas[id][4] < m[4]) maquinas[id] = m;
    });
  });
  amostras.sort(function (a, b) { return a[0] - b[0]; });
  return { amostras: amostras, maquinas: maquinas };
}

function dspPercentil_(ordenados, p) {
  if (!ordenados.length) return 0;
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil(p / 100 * ordenados.length) - 1));
  return ordenados[i];
}
function dspResumo_(lista) {
  const ms = lista.map(function (a) { return a[6]; }).sort(function (x, y) { return x - y; });
  const srv = lista.filter(function (a) { return a[8] >= 0; }).map(function (a) { return a[8]; }).sort(function (x, y) { return x - y; });
  const lp = lista.reduce(function (s, a) { return s + a[9]; }, 0);
  const kb = lista.reduce(function (s, a) { return s + a[10]; }, 0);
  return {
    n: lista.length, falhas: lista.filter(function (a) { return !a[7]; }).length,
    tentativas: lista.filter(function (a) { return a[11] > 0; }).length,
    pagina: lista.filter(function (a) { return a[12] === 'post' || a[12] === 'pagina'; }).length,
    p50: dspPercentil_(ms, 50), p90: dspPercentil_(ms, 90), max: ms.length ? ms[ms.length - 1] : 0,
    srv50: srv.length ? dspPercentil_(srv, 50) : -1, srv90: srv.length ? dspPercentil_(srv, 90) : -1,
    lp: lista.length ? Math.round(lp / lista.length * 10) / 10 : 0, kb: lista.length ? Math.round(kb / lista.length) : 0
  };
}

/* Agrupa por uma funcao de chave; devolve as linhas com o resumo, as mais usadas primeiro. */
function dspAgrupar_(amostras, chaveDe, limite) {
  const grupos = {};
  amostras.forEach(function (a) { const k = chaveDe(a); if (k) (grupos[k] = grupos[k] || []).push(a); });
  return Object.keys(grupos).map(function (k) { return Object.assign({ chave: k }, dspResumo_(grupos[k])); })
    .sort(function (x, y) { return y.n - x.n; }).slice(0, limite || 60);
}

function acaoPainelDesempenho(usuario, params) {
  exigirPorta_();
  // So o administrador ve os numeros de todo mundo. Para os outros, a resposta vazia (nao e erro: a tela so nao mostra).
  if (!ehAdministrador(usuario)) return { ok: true, semAcesso: true };
  const t = dspTodas_();
  const a = t.amostras;
  const nomeDe = function (x) { return x[3] + ':' + x[4] + (x[5] ? ':' + x[5] : ''); };
  const r = {
    ok: true, agora: Date.now(), janelaHoras: 6, total: a.length,
    // os marcos: abrir a pagina, entrar, cada tela, cada acao
    marcos: dspAgrupar_(a, function (x) {
      if (x[3] === 'abertura' || x[3] === 'entrada' || x[3] === 'modulo' || x[3] === 'pdf' || x[3] === 'post') return x[3] + ':' + x[4];
      if (x[3] === 'run') return 'run:' + x[4];
      if (x[3] === 'tela') return 'tela:desenho';
      return '';
    }, 40),
    porAcao: dspAgrupar_(a, function (x) { return (x[3] === 'run' || x[3] === 'tela') && x[5] ? nomeDe(x) : ''; }, 60),
    porMaquina: dspAgrupar_(a, function (x) { return x[3] === 'run' || x[3] === 'abertura' || x[3] === 'entrada' ? x[2] : ''; }, 40).map(function (l) {
      const m = t.maquinas[l.chave] || [];
      const daMaq = a.filter(function (x) { return x[2] === l.chave; });
      const ab = daMaq.filter(function (x) { return x[3] === 'abertura' && x[4] === 'entrada'; }).map(function (x) { return x[6]; }).sort(function (p, q) { return p - q; });
      const pessoas = {};
      daMaq.forEach(function (x) { if (x[1]) pessoas[x[1]] = 1; });
      return Object.assign(l, { rotulo: m[0] || '', dica: m[1] || '', leve: !!m[2], ultimo: m[4] || 0,
        abertura50: ab.length ? dspPercentil_(ab, 50) : -1, pessoas: Object.keys(pessoas).length });
    }),
    erros: a.filter(function (x) { return !x[7]; }).slice(-30).reverse().map(function (x) {
      const m = t.maquinas[x[2]] || [];
      return { quando: x[0], quem: x[1], maquina: m[0] || m[1] || x[2], nome: nomeDe(x), ms: x[6], via: x[12], tentativas: x[11], erro: x[13] };
    }),
    dias: dspDias_(),
    aquecimento: { ligado: manterAquecido_(), ultimo: Number(CacheService.getScriptCache().get('aquecido_em') || 0),
      ultimoCompleto: Number(CacheService.getScriptCache().get('aquecido_completo_em') || 0) }
  };
  // A planilha das medicoes (Exportar): so quando pedida — pode passar de mil linhas.
  if (params && params.bruto) {
    r.bruto = a.map(function (x) {
      const m = t.maquinas[x[2]] || [];
      return [x[0], x[1], m[0] || '', m[1] || '', x[3], x[4], x[5], x[6], x[7], x[8], x[9], x[10], x[11], x[12], x[13]];
    });
  }
  return r;
}

/* Liga/desliga o aquecimento de 5 em 5 min e apaga as medicoes (so o administrador). */
function acaoAjustarDesempenho(usuario, params) {
  exigirPorta_();
  if (!ehAdministrador(usuario)) throw new Error('Só o administrador do sistema ajusta o medidor de desempenho.');
  params = params || {};
  if (params.aquecer === true || params.aquecer === false) {
    PropertiesService.getScriptProperties().setProperty('MANTER_AQUECIDO', params.aquecer ? 'SIM' : 'NAO');
    registrarLog(usuario.email, 'DESEMPENHO', 'SISTEMA', '', 'Aquecimento de 5 em 5 min ' + (params.aquecer ? 'ligado' : 'desligado'));
    try { ajustarGatilhoDoAquecimento_(); } catch (e) { /* sem permissao de gatilho: vale no proximo "Ligar rotinas automaticas" */ }
  }
  if (params.apagar === true) {
    const f = dspFatia_(Date.now()), chaves = [];
    for (let i = 0; i < DSP_FATIAS + 1; i++) for (let g = 0; g < DSP_GAVETAS; g++) chaves.push(dspChave_(f - i, g));
    try { CacheService.getScriptCache().removeAll(chaves); } catch (e) {}
    PropertiesService.getScriptProperties().deleteProperty('DSP_DIAS');
    PropertiesService.getScriptProperties().deleteProperty('DSP_ULTIMA_FATIA');
    registrarLog(usuario.email, 'DESEMPENHO', 'SISTEMA', '', 'Medições de desempenho apagadas');
  }
  return { ok: true, recado: params.apagar ? 'Medições apagadas.' : (params.aquecer === false ? 'Aquecimento desligado.' : 'Aquecimento ligado.') };
}

/* ------------------------------------------------------------------ */
/* MEDIDOR — o resumo de cada dia (14 dias)                             */
/* ------------------------------------------------------------------ */

/* Faixas do histograma (ms): os percentis do dia saem dele (o limite de cima da faixa). */
const DSP_FAIXAS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000, 13000, 20000, 30000, 60000];
const DSP_CATEGORIAS = {
  abertura: function (x) { return x[3] === 'abertura' && x[4] === 'entrada'; },
  entrada: function (x) { return x[3] === 'entrada' && x[4] === 'menu'; },
  tela: function (x) { return x[3] === 'run' && x[4] === 'carregarTela'; },
  acao: function (x) { return x[3] === 'run' && /^executarAcao/.test(x[4]) && x[5] !== 'registrarDesempenho'; },
  desenho: function (x) { return x[3] === 'tela'; }
};
function dspFaixa_(ms) { for (let i = 0; i < DSP_FAIXAS.length; i++) if (ms <= DSP_FAIXAS[i]) return i; return DSP_FAIXAS.length; }

function dspLerDias_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('DSP_DIAS') || '{}') || {}; } catch (e) { return {}; }
}

/*
 * Junta as fatias de 15 min que ja fecharam (e ainda nao entraram) no resumo do dia. Roda no
 * aquecimento completo. Cada dia: por categoria [n, falhas, ...contagem por faixa]; erros de canal a parte.
 */
function dspResumirDias_() {
  const props = PropertiesService.getScriptProperties();
  const atual = dspFatia_(Date.now());
  let ultima = Number(props.getProperty('DSP_ULTIMA_FATIA') || 0);
  if (!ultima || ultima < atual - DSP_FATIAS) ultima = atual - DSP_FATIAS;
  if (ultima >= atual - 1) return 0;
  const chaves = [];
  for (let f = ultima + 1; f <= atual - 1; f++) for (let g = 0; g < DSP_GAVETAS; g++) chaves.push(dspChave_(f, g));
  let mapa = {};
  try { mapa = CacheService.getScriptCache().getAll(chaves) || {}; } catch (e) { return 0; }
  const dias = dspLerDias_();
  let n = 0;
  Object.keys(mapa).forEach(function (k) {
    let c = null;
    try { c = JSON.parse(mapa[k]); } catch (e) { c = null; }
    (c && Array.isArray(c.a) ? c.a : []).forEach(function (x) {
      const dia = Utilities.formatDate(new Date(x[0]), fuso(), 'yyyy-MM-dd');
      const d = dias[dia] = dias[dia] || {};
      Object.keys(DSP_CATEGORIAS).forEach(function (cat) {
        if (!DSP_CATEGORIAS[cat](x)) return;
        const linha = d[cat] = d[cat] || [0, 0].concat(DSP_FAIXAS.map(function () { return 0; }), [0]);
        linha[0]++; if (!x[7]) linha[1]++;
        linha[2 + dspFaixa_(x[6])]++;
      });
      if (!x[7] && /HTTP 40[13]|PERMISSION_DENIED|reading from storage/i.test(x[13])) d.canal = (d.canal || 0) + 1;
      if (x[12] === 'post' || x[12] === 'pagina') d.pagina = (d.pagina || 0) + 1;
      n++;
    });
  });
  // 14 dias no maximo (a propriedade tem limite de 9 KB)
  Object.keys(dias).sort().slice(0, -14).forEach(function (k) { delete dias[k]; });
  let texto = JSON.stringify(dias);
  while (texto.length > 8500 && Object.keys(dias).length > 1) { delete dias[Object.keys(dias).sort()[0]]; texto = JSON.stringify(dias); }
  props.setProperty('DSP_DIAS', texto);
  props.setProperty('DSP_ULTIMA_FATIA', String(atual - 1));
  return n;
}

function dspDias_() {
  const dias = dspLerDias_();
  return Object.keys(dias).sort().reverse().map(function (dia) {
    const d = dias[dia], o = { dia: dia, canal: d.canal || 0, pagina: d.pagina || 0 };
    Object.keys(DSP_CATEGORIAS).forEach(function (cat) {
      const l = d[cat];
      if (!l) return;
      const perc = function (p) {
        const alvo = Math.ceil(p / 100 * l[0]);
        let soma = 0;
        for (let i = 0; i <= DSP_FAIXAS.length; i++) { soma += l[2 + i]; if (soma >= alvo) return i < DSP_FAIXAS.length ? DSP_FAIXAS[i] : 60001; }
        return 60001;
      };
      o[cat] = { n: l[0], falhas: l[1], p50: perc(50), p90: perc(90) };
    });
    return o;
  });
}

/* ------------------------------------------------------------------ */
/* AQUECIMENTO                                                         */
/* ------------------------------------------------------------------ */

function manterAquecido_() {
  return String(PropertiesService.getScriptProperties().getProperty('MANTER_AQUECIDO') || 'SIM').toUpperCase() !== 'NAO';
}
/* De quantos em quantos minutos o gatilho aquecerCache roda (instalarGatilhos). */
function minutosDoAquecimento_() { return manterAquecido_() ? 5 : 15; }
/*
 * O gatilho no intervalo escolhido, sem o administrador precisar clicar em "Ligar rotinas automaticas"
 * de novo: depois de publicar esta versao (o gatilho antigo e de 15 em 15) e ao ligar/desligar o
 * aquecimento no painel. So troca o gatilho que ja existe — rotinas desligadas continuam desligadas.
 */
function ajustarGatilhoDoAquecimento_() {
  const props = PropertiesService.getScriptProperties();
  const quer = String(minutosDoAquecimento_());
  if (props.getProperty('AQUECIMENTO_MIN') === quer) return false;
  let tinha = false;
  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === 'aquecerCache') { ScriptApp.deleteTrigger(g); tinha = true; }
  });
  if (!tinha) return false;
  ScriptApp.newTrigger('aquecerCache').timeBased().everyMinutes(Number(quer)).create();
  props.setProperty('AQUECIMENTO_MIN', quer);
  try { if (typeof esquecerEstadoGatilhos === 'function') esquecerEstadoGatilhos(); } catch (e) {}
  return true;
}
