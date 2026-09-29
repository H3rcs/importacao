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
 * gas_conta. O cookie gas_403=1 simula o bloqueio do google.script.run
 * (varias contas Google no mesmo navegador).
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
    history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} }
  } };
})();
</script>`;
}

function embrulhar(saida, base) {
  const st = saida._estado || { conteudo: saida.getContent(), titulo: '', metas: [] };
  let html = st.conteudo;
  const cal = calco(base);
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + cal) : cal + html;
  const metas = (st.metas || []).map(([n, c]) => `<meta name="${n}" content="${c}">`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${st.titulo || ''}</title>${metas}</head>
<body style="margin:0;overflow:hidden">
<iframe id="userHtmlFrame" sandbox="${SANDBOX}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"></iframe>
<script>
(function () {
  var html = ${JSON.stringify(html).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029')};
  var d = document.getElementById('userHtmlFrame').contentDocument;
  d.open(); d.write(html); d.close();
})();
</script></body></html>`;
}

function criarServidor(opcoes) {
  opcoes = Object.assign({ pasta: null, porta: 0, contaPadrao: 'geral@bartofil.com.br', dono: 'dono@bartofil.com.br',
    apagarComentarios: 'simples' }, opcoes || {});
  const mundo = opcoes.mundo || new Mundo({ dono: opcoes.dono });
  const execOpcoes = { apagarComentarios: opcoes.apagarComentarios, ordem: opcoes.ordem };
  const registro = [];

  const servidor = http.createServer(async (req, res) => {
    const base = 'http://' + req.headers.host;
    mundo.opcoes.urlApp = base + '/exec';
    const url = new URL(req.url, base);
    const cookies = lerCookies(req);
    const execucao = { contaGoogle: cookies.gas_conta !== undefined ? cookies.gas_conta : opcoes.contaPadrao };
    try {
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
          registro.push({ tipo: 'doGet', q: url.search });
          saida = ctx.doGet(eventoDe(url.searchParams));
        } else {
          const corpo = await lerCorpo(req);
          const params = new URLSearchParams(corpo);
          registro.push({ tipo: 'doPost', campos: [...params.keys()] });
          const e = eventoDe(params);
          e.postData = { contents: corpo, type: 'application/x-www-form-urlencoded', length: corpo.length };
          saida = ctx.doPost(e);
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(embrulhar(saida, base));
        return;
      }
      if (url.pathname === '/__gsr' && req.method === 'POST') {
        const { fn, args } = JSON.parse(await lerCorpo(req));
        registro.push({ tipo: 'run', fn });
        if (cookies.gas_403 === '1') { res.writeHead(403); res.end('Forbidden'); return; }
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

  return new Promise((ok) => {
    servidor.listen(opcoes.porta, '127.0.0.1', () => {
      const porta = servidor.address().port;
      mundo.opcoes.urlApp = 'http://127.0.0.1:' + porta + '/exec';
      ok({ servidor, mundo, registro, url: 'http://127.0.0.1:' + porta + '/exec', porta,
        fechar: () => new Promise((f) => servidor.close(f)),
        chamar: (conta, fn, ...args) => chamarPeloNavegador(mundo, opcoes.pasta, { contaGoogle: conta }, fn, args, execOpcoes),
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
