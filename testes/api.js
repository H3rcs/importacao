#!/usr/bin/env node
/*
 * API DA VERSAO LOCAL (GSL-Local) — servidor e montagem da pasta.
 *
 *   node testes/api.js [pasta-do-GSL]
 *
 * A pasta compartilhada abre o GSL como file:// e conversa com o /exec por
 * fetch: um POST text/plain com {"api":1,"fn":...,"args":[...]}, que o
 * doPost responde em JSON. A implantacao fica em "Qualquer pessoa": quem
 * chama e anonimo para o Google. Aqui:
 *   - so as portas da lista passam; o resto (funcoes internas, instalar,
 *     truques com __proto__) e recusado;
 *   - fora da entrada, sem o codigo de uma sessao viva a porta nem roda;
 *   - a entrada anonima sempre pede o codigo do e-mail no primeiro acesso e
 *     o PIN errado bloqueia como na online;
 *   - as paginas (doGet, formulario de entrada) nao mudaram;
 *   - pelo emulador HTTP: 302 para o eco com Access-Control-Allow-Origin: *,
 *     preflight recusado, "Qualquer pessoa em Bartofil" sem CORS;
 *   - a montagem (ferramentas/montar-local.js) resolve os include como o
 *     servidor e guarda o gsl-config.js do administrador.
 */
'use strict';
process.env.TZ = 'America/Bahia';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { Mundo, novaExecucao, chamarPeloNavegador } = require('./emulador/gas.js');
const { criarServidor } = require('./emulador/servidor.js');
const { montar } = require('../ferramentas/montar-local.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const OP = { apagarComentarios: 'nenhum' };
const DONO = 'dono@bartofil.com.br';
const COORD = 'maria.souza@bartofil.com.br';
const resultados = [];
function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }
function ctx(m, conta) { const c = novaExecucao(m, PASTA, { contaGoogle: conta || DONO }, OP); c._porta = true; return c; }
function chamar(m, conta, fn, ...args) { return chamarPeloNavegador(m, PASTA, { contaGoogle: conta }, fn, args, OP); }
async function caso(nome, fn) {
  try { await fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + e.message); }
}

/* Um POST da pagina local: anonimo (sem conta Google), corpo text/plain. Devolve { saida, r }. */
function postar(m, contents, tipo, parameter) {
  const c = novaExecucao(m, PASTA, { contaGoogle: '' }, OP);
  const saida = c.doPost({ parameter: parameter || {}, parameters: {}, postData: { type: tipo || 'text/plain', contents: contents, length: contents.length } });
  let r = null;
  try { r = JSON.parse(saida.getContent()); } catch (e) { r = null; }
  return { saida, r };
}
function api(m, fn, ...args) {
  const { saida, r } = postar(m, JSON.stringify({ api: 1, fn: fn, args: args }));
  afirmar(saida._texto && saida._mime === 'JSON' && r && typeof r.ok === 'boolean', 'resposta JSON da API para ' + fn + ': ' + String(saida.getContent()).slice(0, 120));
  return r;
}
const valorJSON = (r) => (typeof r.valor === 'string' ? JSON.parse(r.valor) : r.valor);
function codigoDoEmail(m, email) {
  const x = m.emails.filter((e) => e.to === email && /código de primeiro acesso/i.test(e.subject)).pop();
  return x ? (x.subject.match(/(\d{6})\s*$/) || [])[1] : '';
}
function mundo() {
  const m = new Mundo({ dono: DONO });
  ctx(m).instalar(DONO);
  const c = ctx(m);
  c.acaoSalvarUsuario({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') },
    { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
  // PIN do dono criado pela versao online (conta Google dele confirma o e-mail)
  const e = JSON.parse(chamar(m, DONO, 'entrar', DONO, '4321', '4321', '', '').valor);
  afirmar(e.token, 'PIN do dono: ' + JSON.stringify(e).slice(0, 200));
  return m;
}
/* Entra pela API (anonimo), como a pagina local. */
function entrarPelaApi(m, email, pin) {
  const r = valorJSON(api(m, 'entrar', email, pin, '', '', '', '', ''));
  afirmar(r.ok && r.token, 'entrou pela API: ' + JSON.stringify(r).slice(0, 200));
  return { t: r.token, f: r.filial.codigo };
}

async function rodar() {
  console.log('API da versao local em ' + PASTA + '\n');

  await caso('inicio: sem banco diz INSTALAR (a instalacao nao passa pela API); com banco, so a entrada — nada da pessoa, nem com um codigo de sessao no pedido', () => {
    const m = new Mundo({ dono: DONO });
    const a = valorJSON(api(m, 'inicio', {}));
    afirmar(a.entrada === 'INSTALAR' && !a.conta, 'sem banco: ' + JSON.stringify(a));
    const inst = api(m, 'instalar', 'atacante@exemplo.com');
    afirmar(!inst.ok && /não liberada/.test(inst.erro) && !ctx(m).bancoInstalado(), 'instalar pela API recusado: ' + JSON.stringify(inst));
    ctx(m).instalar(DONO);
    const s = entrarPelaApiDepoisDoPin(m);
    const b = valorJSON(api(m, 'inicio', { tela: 'acoes', filial: 'fsa', acao: 'ACO-123', t: s.t }));
    afirmar(b.entrada === 'ENTRAR' && b.telaDepois === 'acoes' && b.filialDepois === 'FSA' && b.acaoDepois === 'ACO-123', 'link de e-mail: ' + JSON.stringify(b));
    afirmar(!b.token && !b.usuario && !b.telas && /\/exec$/.test(b.urlApp), 'nenhum dado de sessao no inicio: ' + JSON.stringify(b).slice(0, 300));
    const c = valorJSON(api(m, 'inicio', { tela: 'nao-existe' }));
    afirmar(c.entrada === 'ENTRAR' && !c.telaDepois, 'tela desconhecida no link nao vai junto');
  });
  function entrarPelaApiDepoisDoPin(m) {
    afirmar(JSON.parse(chamar(m, DONO, 'entrar', DONO, '4321', '4321', '', '').valor).token, 'PIN do dono');
    return entrarPelaApi(m, DONO, '4321');
  }

  await caso('entrar pela API (anonimo): o primeiro acesso sempre pede o codigo do e-mail; PIN certo abre a sessao; 5 PINs errados bloqueiam o e-mail', () => {
    const m = mundo();
    const p = valorJSON(api(m, 'entrar', COORD, '1234', '', '', '', '', ''));
    afirmar(p.ok === false && p.criarPin && p.pedirCodigo && !p.token, 'primeiro acesso pede o codigo: ' + JSON.stringify(p));
    const errado = valorJSON(api(m, 'entrar', COORD, '1234', '1234', '', '000000', '', ''));
    afirmar(!errado.token && /incorreto/i.test(errado.erro), 'codigo errado nao cria o PIN');
    const certo = valorJSON(api(m, 'entrar', COORD, '1234', '1234', '', codigoDoEmail(m, COORD), '', ''));
    afirmar(certo.ok && certo.token && certo.entrada === 'APP', 'com o codigo do e-mail: ' + JSON.stringify(certo).slice(0, 200));
    const s = entrarPelaApi(m, DONO, '4321');
    afirmar(/^[a-f0-9]{64}$/.test(s.t), 'sessao do dono');
    for (let i = 0; i < 5; i++) valorJSON(api(m, 'entrar', DONO, '9999', '', '', '', '', ''));
    const bloq = valorJSON(api(m, 'entrar', DONO, '4321', '', '', '', '', ''));
    afirmar(!bloq.token && /muitas vezes/.test(bloq.erro), 'bloqueado com o PIN certo: ' + JSON.stringify(bloq));
    const outro = valorJSON(api(m, 'entrar', COORD, '1234', '', '', '', '', ''));
    afirmar(outro.token, 'o bloqueio e por e-mail');
  });

  await caso('portas com sessao: com o codigo, a mesma resposta do google.script.run; sem ele (ou forjado, ou ctx em texto), [SESSAO] sem rodar a porta', () => {
    const m = mundo();
    const s = entrarPelaApi(m, DONO, '4321');
    const t = api(m, 'carregarTela', s, 'acoes', {});
    afirmar(t.ok && JSON.parse(t.valor).tela === 'acoes' && t.build, 'carregarTela com sessao: ' + JSON.stringify(t).slice(0, 160));
    const online = chamar(m, DONO, 'carregarTela', s, 'acoes', {});
    afirmar(online.ok && JSON.parse(online.valor).tela === JSON.parse(t.valor).tela, 'mesmo valor que o google.script.run');
    const falso = { t: 'f'.repeat(64), f: s.f };
    const feedback = () => ctx(m).listar('FEEDBACK').length;
    const antes = feedback();
    [['carregarTela', [falso, 'acessos', {}]], ['carregarTela', [s.f, 'acessos', {}]], ['carregarTela', [{ f: s.f }, 'acessos', {}]],
     ['executarAcao', [falso, 'enviarFeedback', { texto: 'x' }]], ['executarAcaoETela', [falso, 'enviarFeedback', { texto: 'x' }, 'inicio', {}]],
     ['obterAnexo', [falso, 'x']], ['encerrarSimulacao', [falso]], ['carregarTela', []]].forEach(([fn, args]) => {
      const r = api(m, fn, ...args);
      afirmar(!r.ok && r.erro === '[SESSAO] Sua sessão terminou. Entre de novo com o seu e-mail e PIN.', fn + ' sem sessao: ' + JSON.stringify(r));
    });
    afirmar(feedback() === antes, 'nada gravado sem sessao');
    // as portas que ja respondiam "sem sessao" sem erro continuam respondendo igual (a tela reage do mesmo jeito)
    afirmar(valorJSON(api(m, 'retomarSessao', falso)).entrada === 'ENTRAR', 'retomarSessao sem sessao: ENTRAR');
    const af = valorJSON(api(m, 'abrirFilial', falso));
    afirmar(af.ok === false && af.entrada === 'SEM_SESSAO' && /\[SESSAO\]/.test(af.erro), 'abrirFilial sem sessao: ' + JSON.stringify(af));
    afirmar(JSON.stringify(valorJSON(api(m, 'manterSessao', falso))) === '{"ok":false}', 'manterSessao sem sessao so diz ok:false');
    afirmar(valorJSON(api(m, 'sairDoSistema', falso)).ok === true, 'sair sem sessao: ok');
    // gravar com sessao: a porta de sempre, com capacidade e modulo
    const ea = valorJSON(api(m, 'executarAcaoETela', s, 'enviarFeedback', { texto: 'Pela pasta local' }, 'inicio', {}));
    afirmar(ea.r && ea.r.id && ea.tela && feedback() === antes + 1, 'executarAcaoETela grava e devolve a tela');
    const ac = api(m, 'executarAcao', s, 'acaoQueNaoExiste', {});
    afirmar(!ac.ok && /Ação desconhecida/.test(ac.erro), 'acao desconhecida pela porta: ' + ac.erro);
    const anexo = api(m, 'obterAnexo', s, 'id-de-fora');
    afirmar(!anexo.ok && /não é um anexo do GSL/.test(anexo.erro), 'obterAnexo so dentro da pasta do GSL: ' + anexo.erro);
    // retomar e sair com a sessao
    const rt = valorJSON(api(m, 'retomarSessao', Object.assign({ tela: 'acoes' }, s)));
    afirmar(rt.entrada === 'APP' && rt.token === s.t && rt.telaEmbutida && rt.telaEmbutida.id === 'acoes', 'retomarSessao (F5) com a tela');
    afirmar(valorJSON(api(m, 'manterSessao', s)).ok === true, 'manterSessao com sessao');
    afirmar(valorJSON(api(m, 'sairDoSistema', s)).ok === true, 'sair');
    const depois = api(m, 'carregarTela', s, 'acoes', {});
    afirmar(!depois.ok && /^\[SESSAO\]/.test(depois.erro), 'depois de sair, a sessao nao vale');
  });

  await caso('so a lista passa: funcoes internas, instalar, a reserva, prototipo e nomes estranhos sao recusados sem rodar nada', () => {
    const m = mundo();
    const s = entrarPelaApi(m, DONO, '4321');
    const nomes = ['listar', 'prop', 'instalar', 'doGet', 'doPost', 'renovarBilhete', 'simularPerfil', 'acaoPelaPagina_', 'entrar_',
      'acaoSalvarUsuario', 'inserir', 'garantirEsquema', 'aquecerCache', 'rotinaDiaria', 'diagnostico', 'restaurarMeuAcesso',
      'inicioPelaApi_', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '', 'carregarTela ', 'CarregarTela'];
    const emails = m.emails.length;
    nomes.forEach((fn) => {
      const r = api(m, fn, s, 'ACESSOS');
      afirmar(!r.ok && /^Função não liberada na API do GSL: [\w.-]*\.$/.test(r.erro), JSON.stringify(fn) + ': ' + JSON.stringify(r).slice(0, 160));
    });
    afirmar(m.emails.length === emails, 'nenhum e-mail');
    const fora = api(m, 'carregarTela', s, 'acoes', {}, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    afirmar(fora.ok, 'argumentos a mais sao cortados, nao quebram');
  });

  await caso('pedido mal formado: corpo que nao e JSON, sem "api":1, lista no lugar do objeto; o formulario api=1&pedido=... tambem e a API', () => {
    const m = mundo();
    [['nao e json', 'text/plain'], ['{"fn":"sondarCanal","args":[]}', 'text/plain'], ['[1,2]', 'text/plain'], ['', 'text/plain'],
     ['{"api":"1","fn":"sondarCanal"}', 'text/plain;charset=utf-8']].forEach(([corpo, tipo]) => {
      const { saida, r } = postar(m, corpo, tipo);
      afirmar(saida._texto && r && r.ok === false && /Pedido inválido/.test(r.erro), JSON.stringify(corpo) + ': ' + String(saida.getContent()).slice(0, 120));
    });
    const okTipo = postar(m, '{"api":1,"fn":"sondarCanal","args":[]}', 'text/plain;charset=utf-8');
    afirmar(okTipo.r.ok && okTipo.r.valor === 'ok', 'text/plain com charset');
    const form = postar(m, 'api=1', 'application/x-www-form-urlencoded', { api: '1', pedido: '{"api":1,"fn":"sondarCanal","args":[]}' });
    afirmar(form.saida._texto && form.r.ok && form.r.valor === 'ok', 'formulario api=1: ' + String(form.saida.getContent()).slice(0, 100));
    const c = ctx(m);
    const v = api(m, 'sondarCanal').valor;
    afirmar(v === 'ok' && api(m, 'sondarCanal').build === vm.runInContext('APP.build', c), 'a resposta leva o carimbo do servidor');
  });

  await caso('IDENTIDADE=GOOGLE (modo antigo, conta do navegador): a API recusa — a pagina local nao tem conta Google', () => {
    const m = mundo();
    m.props.script.IDENTIDADE = 'GOOGLE';
    const r = api(m, 'inicio', {});
    afirmar(!r.ok && /IDENTIDADE=GOOGLE/.test(r.erro), JSON.stringify(r));
  });

  await caso('as paginas nao mudaram: doGet devolve a pagina; o formulario de entrada (POST urlencoded) continua sendo pagina', () => {
    const m = mundo();
    const c = novaExecucao(m, PASTA, { contaGoogle: 'geral@bartofil.com.br' }, OP);
    const g = c.doGet({ parameter: {}, parameters: {} });
    afirmar(g._estado && /CARGA_INICIAL/.test(g.getContent()) && !g._texto, 'doGet e pagina');
    const c2 = novaExecucao(m, PASTA, { contaGoogle: 'geral@bartofil.com.br' }, OP);
    const p = c2.doPost({ parameter: { email: DONO, pin: '4321', bilhete: c2.novoBilhete_() }, parameters: {},
      postData: { type: 'application/x-www-form-urlencoded', contents: 'email=x', length: 7 } });
    afirmar(p._estado && /"entrada":"APP"/.test(p.getContent()), 'entrada pelo formulario continua: ' + p.getContent().slice(0, 80));
  });

  await caso('diagnostico=1 sem conta Google (implantacao em "Qualquer pessoa"): o e-mail do dono vai mascarado e as sessoes ficam de fora', () => {
    const m = mundo();
    const anon = novaExecucao(m, PASTA, { contaGoogle: '' }, OP).doGet({ parameter: { diagnostico: '1' }, parameters: {} }).getContent();
    afirmar(anon.indexOf(DONO) === -1 && /d\*\*\*o@bartofil\.com\.br/.test(anon) && !/Sessões guardadas/.test(anon) && /Qualquer pessoa/.test(anon), 'anonimo: ' + anon.replace(/<[^>]+>/g, ' ').slice(0, 400));
    const dono = novaExecucao(m, PASTA, { contaGoogle: DONO }, OP).doGet({ parameter: { diagnostico: '1' }, parameters: {} }).getContent();
    afirmar(dono.indexOf(DONO) !== -1 && /Sessões guardadas/.test(dono), 'o dono ve tudo');
  });

  await caso('emulador HTTP: POST text/plain -> 302 para o eco, os dois com Access-Control-Allow-Origin: *; preflight 405; "Qualquer pessoa em Bartofil" -> login sem CORS', async () => {
    const s = await criarServidor({ pasta: PASTA, dono: DONO, apagarComentarios: 'nenhum' });
    try {
      s.chamar(DONO, 'instalar', DONO);
      const corpo = JSON.stringify({ api: 1, fn: 'inicio', args: [{}] });
      const r1 = await fetch(s.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Origin: 'null' }, body: corpo, redirect: 'manual' });
      afirmar(r1.status === 302 && r1.headers.get('access-control-allow-origin') === '*' && /\/__eco\?k=/.test(r1.headers.get('location')), '302 com CORS: ' + r1.status);
      const r2 = await fetch(new URL(r1.headers.get('location'), s.url), { headers: { Origin: 'null' } });
      const j = await r2.json();
      afirmar(r2.headers.get('access-control-allow-origin') === '*' && j.ok && JSON.parse(j.valor).entrada === 'ENTRAR', 'eco: ' + JSON.stringify(j).slice(0, 120));
      const op = await fetch(s.url, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } });
      afirmar(op.status === 405 && !op.headers.get('access-control-allow-origin'), 'preflight: ' + op.status);
      s.definirAcesso('dominio');
      const r3 = await fetch(s.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: corpo, redirect: 'manual' });
      afirmar(r3.status === 302 && !r3.headers.get('access-control-allow-origin') && /__login/.test(r3.headers.get('location')), 'dominio: login sem CORS');
      afirmar(s.registro.filter((x) => x.tipo === 'api').length === 2 && !s.registro.some((x) => x.tipo === 'doPost'), 'registro: a API nao conta como POST de pagina');
    } finally { await s.fechar(); }
  });

  await caso('montagem da pasta: Index + include como o servidor, modulos validos, carimbo, gsl-config.js guardado entre montagens', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-montar-'));
    try {
      const r = montar({ fonte: PASTA, saida: dir, url: 'https://script.google.com/a/macros/bartofil.com.br/s/ABC/exec', silencioso: true });
      ['GSL.html', 'gsl.css', 'gsl-app.js', 'gsl-paineis.js', 'gsl-aprendiz.js', 'gsl-config.js', 'LEIA-ME-LOCAL.md']
        .forEach((f) => afirmar(r.arquivos.indexOf(f) !== -1, 'arquivo ' + f + ': ' + r.arquivos.join(',')));
      const html = fs.readFileSync(path.join(dir, 'GSL.html'), 'utf8');
      afirmar(!/<\?/.test(html) && /var CARGA_INICIAL = null;/.test(html), 'scriptlets resolvidos');
      const srcs = [...html.matchAll(/<script src="([^"?]+)/g)].map((x) => x[1]);
      afirmar(srcs.join(',') === 'gsl-config.js,gsl-app.js,gsl-paineis.js,gsl-aprendiz.js,gsl-carga.js,gsl-carga-2.js', 'ordem dos modulos: ' + srcs.join(','));
      afirmar(html.indexOf('gsl-config.js') < html.indexOf('gsl-app.js') && /<link rel="stylesheet" href="gsl\.css\?v=/.test(html), 'config antes do app, css no head');
      const local = JSON.parse((html.match(/var GSL_LOCAL = (\{[^<]+\});/) || [])[1] || 'null');
      const buildApp = (fs.readFileSync(path.join(PASTA, 'App.html'), 'utf8').match(/const BUILD_APP = '([^']+)'/) || [])[1];
      afirmar(local && local.build === buildApp && r.build === buildApp, 'carimbo da pasta = BUILD_APP: ' + JSON.stringify(local));
      ['gsl-app.js', 'gsl-paineis.js', 'gsl-aprendiz.js', 'gsl-config.js'].forEach((f) => {
        try { new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }); } catch (e) { throw new Error(f + ' nao e JavaScript valido: ' + e.message); }
      });
      const app = fs.readFileSync(path.join(dir, 'gsl-app.js'), 'utf8');
      afirmar(app.indexOf(fs.readFileSync(path.join(PASTA, 'App.html'), 'utf8').replace(/^<script>\n?/, '').replace(/<\/script>\s*$/, '').slice(0, 2000)) !== -1, 'gsl-app.js e o App.html');
      const css = fs.readFileSync(path.join(dir, 'gsl.css'), 'utf8');
      afirmar(/--gsl-estilo/.test(css) && /--gsl-paineis-estilo/.test(css) && /logo-completa/.test(css) && !/<\/?style>/.test(css), 'gsl.css com Estilo, PaineisEstilo e a Marca');
      const cfg = () => fs.readFileSync(path.join(dir, 'gsl-config.js'), 'utf8');
      afirmar(/bartofil\.com\.br\/s\/ABC\/exec/.test(cfg()), 'gsl-config.js com o endereco');
      fs.writeFileSync(path.join(dir, 'gsl-config.js'), cfg().replace('ABC', 'DO-ADMIN'));
      fs.writeFileSync(path.join(dir, 'gsl-velho.js'), '/* modulo de uma versao antiga */');
      montar({ fonte: PASTA, saida: dir, silencioso: true });
      afirmar(/DO-ADMIN/.test(cfg()), 'montar de novo sem --url guarda o gsl-config.js do administrador');
      afirmar(!fs.existsSync(path.join(dir, 'gsl-velho.js')), 'modulo velho sai da pasta');
      const leia = fs.readFileSync(path.join(dir, 'LEIA-ME-LOCAL.md'), 'utf8');
      afirmar(/Qualquer pessoa/.test(leia) && /gsl-config\.js/.test(leia) && /Atalho/.test(leia) && /continua no Google/.test(leia) && leia.indexOf(buildApp) !== -1, 'LEIA-ME-LOCAL.md');
      // scriptlet desconhecido para a montagem
      const fonte = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-fonte-'));
      fs.readdirSync(PASTA).forEach((f) => fs.copyFileSync(path.join(PASTA, f), path.join(fonte, f)));
      fs.writeFileSync(path.join(fonte, 'Index.html'), fs.readFileSync(path.join(fonte, 'Index.html'), 'utf8').replace('</body>', '<?= outraCoisa ?></body>'));
      let erro = '';
      try { montar({ fonte, saida: path.join(fonte, 'saida'), silencioso: true }); } catch (e) { erro = e.message; }
      fs.rmSync(fonte, { recursive: true, force: true });
      afirmar(/Scriptlet que a montagem nao conhece/.test(erro), 'scriptlet desconhecido para a montagem: ' + erro);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  const falhas = resultados.filter((x) => !x).length;
  console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
  process.exit(falhas ? 1 : 0);
}

rodar().catch((e) => { console.error(e); process.exit(2); });
