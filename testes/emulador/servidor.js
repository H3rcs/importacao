/*
 * SERVIDOR DO EMULADOR — serve o GSL como o Google serve um app da web.
 *
 *   GET  /exec        -> doGet(e)
 *   POST /exec        -> doPost(e)   (formulario de reserva da entrada)
 *   POST /__gsr       -> google.script.run.<funcao>(...args)
 *
 * A pagina do GSL vai dentro de um iframe com o MESMO sandbox do Apps
 * Script e e escrita com document.write, como faz o Google — e por isso
 * que o erro da foto aparece como "Failed to execute 'write' on 'Document'".
 *
 * Quem o Google diz que abriu (Session.getActiveUser) vem do cookie
 * gas_conta. O cookie gas_403=1 simula o bloqueio do google.script.run por
 * HTTP 403; gas_403=perm, o PERMISSION_DENIED de varias contas Google no
 * mesmo navegador; gas_atraso=ms atrasa as respostas; gas_atraso_post=ms
 * atrasa a resposta do POST DEPOIS de o doPost rodar (o Google ja entrou,
 * a pagina nova ainda nao chegou).
 *
 * Mais cookies (desempenho, 10/10):
 *   gas_atraso_get=ms       o doGet demora (partida a frio do Apps Script)
 *   gas_atraso_iframe=ms    a moldura demora para ser escrita (maquina lenta)
 *   gas_falha=fn[:status][:n]  as n primeiras chamadas de fn pelo google.script.run
 *                           falham com HTTP status (500 = falha passageira); sem n, todas
 *   gas_sem_history=1       o google.script.history.replace nao faz nada
 *   gas_sem_storage=1       sessionStorage/localStorage barrados (cookie de terceiros bloqueado)
 * O google.script.history.replace mexe no historico da janela de cima, como
 * o do Google: depois dele o F5 e um GET (e nao o reenvio do POST).
 *
 * criarServidor({ agora: '2026-10-19T10:00:00-03:00' }) (19/10): o relogio do
 * script comeca nesse instante e anda dali (ver Mundo, em gas.js).
 *
 * API DA VERSAO LOCAL (GSL-Local): POST /exec com corpo text/plain (ou o
 * formulario api=1) e a API em JSON do doPost. Como o Google:
 *   - a resposta do /exec e um 302 para o "eco" (/__eco?k=..., no Google e o
 *     script.googleusercontent.com), os dois com Access-Control-Allow-Origin: *;
 *   - quem chama de uma pagina file:// nao manda cookie: para o script, ele e
 *     anonimo (Session.getActiveUser vazio);
 *   - OPTIONS (preflight) recebe 405 sem cabecalho de CORS: so o pedido
 *     "simples" (text/plain) passa;
 *   - definirAcesso('dominio') imita a implantacao "Qualquer pessoa em
 *     Bartofil": sem a conta Google, o POST vira 302 para o login, sem CORS
 *     (o fetch da pagina local falha). 'qualquer' (padrao) e "Qualquer pessoa".
 */
'use strict';
const http = require('http');
const { URL } = require('url');
const { Mundo, novaExecucao, chamarPeloNavegador } = require('./gas.js');

const SANDBOX = 'allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox ' +
                'allow-same-origin allow-scripts allow-top-navigation-by-user-activation';

function lerCookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}

function lerCorpo(req) {
  return new Promise((ok) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
  });
}

function eventoDe(params) {
  const parameter = {}, parameters = {};
  for (const [k, v] of params) {
    if (!(k in parameter)) parameter[k] = v;
    (parameters[k] = parameters[k] || []).push(v);
  }
  return { parameter, parameters, queryString: params.toString(), contentLength: -1, pathInfo: '' };
}

/* O google.script.run do navegador, ligado ao /__gsr deste servidor. */
function calco(base) {
  return `<script>
(function () {
  var BASE = ${JSON.stringify(base)};
  function corredor(o) {
    return new Proxy({}, { get: function (alvo, nome) {
      if (nome === 'withSuccessHandler') return function (f) { return corredor(Object.assign({}, o, { ok: f })); };
      if (nome === 'withFailureHandler') return function (f) { return corredor(Object.assign({}, o, { falha: f })); };
      if (nome === 'withUserObject') return function (u) { return corredor(Object.assign({}, o, { u: u })); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        window.__gsrChamadas = (window.__gsrChamadas || []).concat([nome]);
        fetch(BASE + '/__gsr', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fn: nome, args: args }), credentials: 'same-origin' })
          .then(function (r) {
            if (r.status !== 200) throw new Error('NetworkError: Connection failure due to HTTP ' + r.status);
            return r.json();
          })
          .then(function (j) {
            if (j.ok) { if (o.ok) o.ok(j.valor, o.u); return; }
            var e = new Error(j.erro.message); e.name = j.erro.name || 'ScriptError';
            if (o.falha) o.falha(e, o.u); else setTimeout(function () { throw e; });
          })
          .catch(function (e) { if (o.falha) o.falha(e, o.u); });
      };
    } });
  }
  window.google = { script: {
    run: corredor({}),
    host: { close: function () {}, setHeight: function () {}, setWidth: function () {}, editor: { focus: function () {} } },
    url: { getLocation: function (cb) { cb({ parameter: {}, parameters: {}, hash: '' }); } },
    // como o google.script.history de verdade: mexe no historico da janela de cima
    history: { push: function () {}, setChangeHandler: function () {},
      replace: function (estado, params, hash) {
        try {
          var q = Object.keys(params || {}).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
          window.parent.history.replaceState(estado, '', BASE + '/exec' + (q ? '?' + q : '') + (hash ? '#' + hash : ''));
          window.__historyReplace = (window.__historyReplace || 0) + 1;
        } catch (e) { window.__historyReplaceErro = String(e); }
      } }
  } };
})();
</script>`;
}

function embrulhar(saida, base, extras) {
  extras = extras || {};
  const st = saida._estado || { conteudo: saida.getContent(), titulo: '', metas: [] };
  let html = st.conteudo;
  let cal = calco(base);
  if (extras.semHistory) cal = cal.replace('window.parent.history.replaceState(estado', 'void (estado');
  if (extras.semStorage) {
    cal = '<script>(function(){function negar(){throw new DOMException("Failed to read the \'sessionStorage\' property from \'Window\': Access is denied for this document.","SecurityError");}' +
      'Object.defineProperty(window,"sessionStorage",{get:negar,configurable:true});Object.defineProperty(window,"localStorage",{get:negar,configurable:true});})();</script>' + cal;
  }
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + cal) : cal + html;
  const metas = (st.metas || []).map(([n, c]) => `<meta name="${n}" content="${c}">`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${st.titulo || ''}</title>${metas}</head>
<body style="margin:0;overflow:hidden">
<iframe id="userHtmlFrame" sandbox="${SANDBOX}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"></iframe>
<script>
(function () {
  var html = ${JSON.stringify(html).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029')};
  var escrever = function () { var d = document.getElementById('userHtmlFrame').contentDocument; d.open(); d.write(html); d.close(); };
  if (${Number(extras.atrasoIframe) || 0} > 0) setTimeout(escrever, ${Number(extras.atrasoIframe) || 0}); else escrever();
})();
</script></body></html>`;
}

function criarServidor(opcoes) {
  opcoes = Object.assign({ pasta: null, porta: 0, contaPadrao: 'geral@bartofil.com.br', dono: 'dono@bartofil.com.br',
    apagarComentarios: 'simples' }, opcoes || {});
  const mundo = opcoes.mundo || new Mundo({ dono: opcoes.dono, agora: opcoes.agora });
  const execOpcoes = { apagarComentarios: opcoes.apagarComentarios, ordem: opcoes.ordem };
  const registro = [];
  const falhasFeitas = new Map();          // gas_falha com limite: quantas ja falharam
  const ecos = new Map();                  // respostas da API esperando o GET do "eco"
  const estado = { acesso: opcoes.acesso || 'qualquer' };
  const CORS = { 'Access-Control-Allow-Origin': '*' };

  const servidor = http.createServer(async (req, res) => {
    const base = 'http://' + req.headers.host;
    mundo.opcoes.urlApp = base + '/exec';
    const url = new URL(req.url, base);
    const cookies = lerCookies(req);
    const execucao = { contaGoogle: cookies.gas_conta !== undefined ? cookies.gas_conta : opcoes.contaPadrao };
    try {
      if (url.pathname === '/exec' && req.method === 'OPTIONS') {
        // O Apps Script nao responde preflight: um fetch com Content-Type application/json nao passa.
        registro.push({ tipo: 'preflight', t: Date.now() });
        res.writeHead(405); res.end(); return;
      }
      if (url.pathname === '/__eco' && req.method === 'GET') {
        const k = url.searchParams.get('k') || '';
        const r = ecos.get(k);
        ecos.delete(k);
        if (!r) { res.writeHead(404, CORS); res.end('eco vencido'); return; }
        res.writeHead(200, Object.assign({ 'Content-Type': r.tipo }, CORS));
        res.end(r.texto);
        return;
      }
      if (url.pathname === '/__login') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html><body>Fazer login - Contas do Google</body></html>');
        return;
      }
      const tipoCorpo = String(req.headers['content-type'] || '');
      if (url.pathname === '/exec' && req.method === 'POST' && (/^text\/plain/i.test(tipoCorpo) || url.searchParams.get('api') === '1')) {
        const corpo = await lerCorpo(req);
        await responderApi(req, res, url, corpo, tipoCorpo, cookies);
        return;
      }
      if (url.pathname === '/exec' && (req.method === 'GET' || req.method === 'POST')) {
        const ctx = novaExecucao(mundo, opcoes.pasta, execucao, execOpcoes);
        let saida;
        // A moldura do GSL se recarregando sozinha (location.reload dentro
        // do iframe): no Google ela volta EM BRANCO. Aqui tambem.
        if (req.method === 'GET' && req.headers['sec-fetch-dest'] === 'iframe') {
          registro.push({ tipo: 'moldura-recarregada', q: url.search });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!DOCTYPE html><html><body></body></html>');
          return;
        }
        if (req.method === 'GET') {
          registro.push({ tipo: 'doGet', q: url.search, t: Date.now() });
          if (cookies.gas_atraso_get) await new Promise((ok) => setTimeout(ok, Number(cookies.gas_atraso_get)));
          saida = ctx.doGet(eventoDe(url.searchParams));
        } else {
          const corpo = await lerCorpo(req);
          const params = new URLSearchParams(corpo);
          // formulario api=1&pedido=...: tambem e a API (resposta em JSON, nao pagina)
          if (params.get('api') === '1') { await responderApi(req, res, url, corpo, 'application/x-www-form-urlencoded', cookies); return; }
          registro.push({ tipo: 'doPost', campos: [...params.keys()], corpo: corpo, t: Date.now() });
          const e = eventoDe(params);
          e.postData = { contents: corpo, type: 'application/x-www-form-urlencoded', length: corpo.length };
          saida = ctx.doPost(e);
          if (cookies.gas_atraso_post) await new Promise((ok) => setTimeout(ok, Number(cookies.gas_atraso_post)));
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(embrulhar(saida, base, { semHistory: cookies.gas_sem_history === '1', semStorage: cookies.gas_sem_storage === '1',
          atrasoIframe: Number(cookies.gas_atraso_iframe || 0) }));
        return;
      }
      if (url.pathname === '/__gsr' && req.method === 'POST') {
        const { fn, args } = JSON.parse(await lerCorpo(req));
        registro.push({ tipo: 'run', fn, t: Date.now() });
        // gas_atraso=ms: a resposta (ou a falha) demora — o clique "vence"
        if (cookies.gas_atraso) await new Promise((ok) => setTimeout(ok, Number(cookies.gas_atraso)));
        if (cookies.gas_403 === '1') { res.writeHead(403); res.end('Forbidden'); return; }
        // gas_falha=fn[:status][:n]: falha passageira (rede, 500) nas n primeiras chamadas de fn
        if (cookies.gas_falha) {
          const [alvo, status, n] = cookies.gas_falha.split(':');
          const ja = falhasFeitas.get(cookies.gas_falha) || 0;
          if (alvo === fn && (!n || ja < Number(n))) {
            falhasFeitas.set(cookies.gas_falha, ja + 1);
            registro.push({ tipo: 'falha', fn, t: Date.now() });
            res.writeHead(Number(status || 500)); res.end('erro'); return;
          }
        }
        // gas_403=perm: o erro que o Google da com varias contas no navegador
        if (cookies.gas_403 === 'perm') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, erro: { name: 'ScriptError',
            message: "We're sorry, a server error occurred while reading from storage. Error code PERMISSION_DENIED." } }));
          return;
        }
        const r = chamarPeloNavegador(mundo, opcoes.pasta, execucao, fn, args, execOpcoes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
        return;
      }
      res.writeHead(404); res.end('nao encontrado');
    } catch (e) {
      registro.push({ tipo: 'erro', erro: String(e && e.stack || e) });
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<pre>' + String(e && e.stack || e).replace(/</g, '&lt;') + '</pre>');
    }
  });

  /*
   * API: o doPost com o corpo do fetch. A resposta (ContentService) vai para o eco e o /exec responde
   * 302 — como o Google. Sem cookie (pagina file://), a conta Google e vazia.
   */
  async function responderApi(req, res, url, corpo, tipoCorpo, cookies) {
    const base = 'http://' + req.headers.host;
    let fn = '';
    try { fn = String(JSON.parse(/^text\/plain/i.test(tipoCorpo) ? corpo : (new URLSearchParams(corpo).get('pedido') || '')).fn || ''); } catch (e) { fn = '?'; }
    registro.push({ tipo: 'api', fn, origem: req.headers.origin || '', corpo, t: Date.now() });
    if (estado.acesso === 'dominio' && cookies.gas_conta === undefined) {
      res.writeHead(302, { Location: base + '/__login?continue=exec' });       // login do Google, sem CORS
      res.end(); return;
    }
    const e = eventoDe(url.searchParams);
    if (!/^text\/plain/i.test(tipoCorpo)) {
      const extra = eventoDe(new URLSearchParams(corpo));
      Object.keys(extra.parameter).forEach((k) => { if (!(k in e.parameter)) e.parameter[k] = extra.parameter[k]; });
      Object.keys(extra.parameters).forEach((k) => { e.parameters[k] = (e.parameters[k] || []).concat(extra.parameters[k]); });
    }
    e.postData = { contents: corpo, type: tipoCorpo.split(';')[0].trim(), length: corpo.length };
    const ctx = novaExecucao(mundo, opcoes.pasta, { contaGoogle: cookies.gas_conta !== undefined ? cookies.gas_conta : '' }, execOpcoes);
    const saida = ctx.doPost(e);
    const texto = saida && typeof saida.getContent === 'function' ? saida.getContent() : String(saida);
    const tipo = saida && saida._mime === 'JSON' ? 'application/json; charset=utf-8' : (saida && saida._estado ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
    const k = require('crypto').randomUUID();
    ecos.set(k, { texto, tipo });
    res.writeHead(302, Object.assign({ Location: base + '/__eco?k=' + k }, CORS));
    res.end();
  }

  return new Promise((ok) => {
    servidor.listen(opcoes.porta, '127.0.0.1', () => {
      const porta = servidor.address().port;
      mundo.opcoes.urlApp = 'http://127.0.0.1:' + porta + '/exec';
      ok({ servidor, mundo, registro, url: 'http://127.0.0.1:' + porta + '/exec', porta,
        fechar: () => new Promise((f) => servidor.close(f)),
        chamar: (conta, fn, ...args) => chamarPeloNavegador(mundo, opcoes.pasta, { contaGoogle: conta }, fn, args, execOpcoes),
        definirAcesso: (modo) => { estado.acesso = modo; },
        contexto: (conta) => novaExecucao(mundo, opcoes.pasta, { contaGoogle: conta }, execOpcoes) });
    });
  });
}

module.exports = { criarServidor };

if (require.main === module) {
  const path = require('path');
  const pasta = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'GSL'));
  criarServidor({ pasta, porta: Number(process.env.PORTA || 8080) }).then((s) => {
    console.log('GSL emulado em ' + s.url + '  (pasta ' + pasta + ')');
  });
}
