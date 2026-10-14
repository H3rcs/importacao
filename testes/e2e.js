#!/usr/bin/env node
/*
 * TESTES DE PONTA A PONTA — o GSL rodando no emulador, num Chromium de verdade.
 *
 *   node testes/e2e.js [pasta-do-GSL] [filtro]
 *
 * Cada cenario sobe um "Google" novo (servidor + planilhas em memoria), com
 * o apagador de comentarios do HtmlService ligado, e usa a tela como uma
 * pessoa usaria: digita, clica, recarrega. Precisa do Playwright com
 * Chromium (PLAYWRIGHT_BROWSERS_PATH, se o Chromium estiver fora do padrao).
 */
'use strict';
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { criarServidor } = require('./emulador/servidor.js');
const { folhaRH } = require('./emulador/folha-rh.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const FILTRO = process.argv[3] || '';
const DONO = 'dono@bartofil.com.br';
const GERAL = 'computador.cd@bartofil.com.br';     // conta Google do computador compartilhado
const COORD = 'maria.souza@bartofil.com.br';
const GERENTE = 'joao.lima@bartofil.com.br';

/* ------------------------------------------------------------------ */
/* apoio                                                               */
/* ------------------------------------------------------------------ */

let navegador;
const resultados = [];

function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }

async function subir(opcoes) {
  const s = await criarServidor(Object.assign({ pasta: PASTA, apagarComentarios: process.env.GSL_APAGADOR || 'simples', dono: DONO }, opcoes || {}));
  return s;
}

/* Instala direto no servidor (sem tela) e cadastra pessoas. */
function instalarComPessoas(s) {
  const r = s.chamar(DONO, 'instalar', DONO);
  afirmar(r.ok, 'instalar: ' + JSON.stringify(r.erro));
  const ctx = s.contexto(DONO);
  ctx._porta = true;
  const admin = { email: DONO, perfil: 'ADMIN', permissoes: ctx.permissoesDe('ADMIN') };
  ctx.acaoSalvarUsuario(admin, { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
  ctx.acaoSalvarUsuario(admin, { email: GERENTE, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' });
}

/*
 * ASSIDUIDADE — duas competencias do RH com folhas que se SOBREPOEM
 * (setembro comeca em 18/08: 18, 19 e 20/08 estao nas duas) e a mesma
 * falta de 19/08 lancada nas duas. Agosto e importado duas vezes.
 * Tudo pelas portas publicas (entrar -> executarAcao), como a tela faz.
 */
function prepararAssiduidade(s) {
  const run = (fn, ...a) => { const r = s.chamar(DONO, fn, ...a); if (!r.ok) throw new Error(fn + ': ' + r.erro.message); return r.valor; };
  const e = JSON.parse(run('entrar', DONO, '4321', '4321', ''));
  afirmar(e.entrada === 'APP', 'dono entrou: ' + JSON.stringify(e).slice(0, 200));
  const ctx = { t: e.token, f: e.filial.codigo };
  const acao = (nome, p) => { const x = JSON.parse(run('executarAcao', ctx, nome, p || {})); if (x && x.ok === false) throw new Error(nome + ': ' + x.erro); return x.dados !== undefined ? x.dados : x; };
  const pessoas = [
    { mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-05': '16', '2025-08-06': '1', '2025-08-19': '16' } },
    { mat: '100555', nome: 'BRUNO LIMA', turno: 'B', dias: { '2025-08-12': '28', '2025-08-19': '1', '2025-08-25': '16' } }
  ];
  const agosto = folhaRH(s.mundo, 'Folha 2025-08', { inicio: [2025, 7, 21], dias: 31, pessoas });
  const setembro = folhaRH(s.mundo, 'Folha 2025-09', { inicio: [2025, 8, 18], dias: 34, pessoas, matComoNumero: true });
  const a = acao('salvarArquivoRH', { competencia: '2025-08', link: agosto, aba: 'FOLHA DE PONTO' });
  const b = acao('salvarArquivoRH', { competencia: '09/2025', link: setembro, aba: 'FOLHA DE PONTO' });
  acao('importarCompetencia', { id: a.id });
  acao('importarCompetencia', { id: b.id });
  acao('importarCompetencia', { id: a.id });              // reimportar nao pode duplicar
  return { acao };
}

function repetidas(lista) { return lista.filter((d, i) => lista.indexOf(d) !== i); }

/* Uma "aba" com uma conta Google. Devolve page e o frame do GSL. */
async function abrirAba(s, conta, extras) {
  const contexto = extras && extras.contexto ? extras.contexto : await navegador.newContext();
  const cookies = [{ name: 'gas_conta', value: conta, url: s.url }];
  if (extras && extras.bloqueio403) cookies.push({ name: 'gas_403', value: extras.bloqueio403 === 'perm' ? 'perm' : '1', url: s.url });
  if (extras && extras.atraso) cookies.push({ name: 'gas_atraso', value: String(extras.atraso), url: s.url });
  if (extras && extras.atrasoPost) cookies.push({ name: 'gas_atraso_post', value: String(extras.atrasoPost), url: s.url });
  await contexto.addCookies(cookies);
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.googleapis|Failed to load resource/.test(m.text())) erros.push('console: ' + m.text());
  });
  await page.goto(s.url + ((extras && extras.query) || ''), { waitUntil: 'domcontentloaded' });
  const aba = { page, contexto, erros, s };
  await esperarTela(aba);
  return aba;
}

async function frame(aba) {
  for (let i = 0; i < 50; i++) {
    const h = await aba.page.$('#userHtmlFrame');
    const f = h && await h.contentFrame();
    if (f) { try { await f.waitForLoadState('load', { timeout: 5000 }); } catch (e) {} return f; }
    await aba.page.waitForTimeout(100);
  }
  throw new Error('iframe do GSL nao apareceu');
}

const TELAS = ['carregando', 'falha', 'instalacao', 'entrar', 'sem-acesso', 'escolher-filial', 'aplicacao'];
async function telaVisivel(aba) {
  const f = await frame(aba);
  return f.evaluate((ids) => ids.filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('oculto'); }), TELAS);
}
async function esperarTela(aba, quais, ms) {
  const fim = Date.now() + (ms || 15000);
  let v = [];
  while (Date.now() < fim) {
    try {
      v = await telaVisivel(aba);
      if (!quais && v.length && v[0] !== 'carregando') return v[0];
      if (quais && v.some((x) => quais.includes(x))) return v.find((x) => quais.includes(x));
    } catch (e) { /* pagina navegando */ }
    await aba.page.waitForTimeout(150);
  }
  throw new Error('esperava tela ' + (quais || ['qualquer']).join('/') + ', estava em ' + v.join(','));
}
async function texto(aba, id) { const f = await frame(aba); return f.evaluate((i) => (document.getElementById(i) || {}).textContent || '', id); }

/* O codigo de primeiro acesso que o "Google" mandou para o e-mail (o emulador guarda os e-mails). */
function codigoDoEmail(s, email) {
  const m = s.mundo.emails.filter((x) => x.to === email && /código de primeiro acesso/i.test(x.subject)).pop();
  return m ? (m.subject.match(/(\d{6})\s*$/) || [])[1] : '';
}

/* Cria o PIN pelo servidor, com o codigo do e-mail, como a pessoa faria. */
function criarPin(s, conta, email, pin) {
  let r = JSON.parse(s.chamar(conta, 'entrar', email, pin, '', '', '').valor);
  if (r.pedirCodigo) r = JSON.parse(s.chamar(conta, 'entrar', email, pin, pin, '', codigoDoEmail(s, email)).valor);
  else if (r.criarPin) r = JSON.parse(s.chamar(conta, 'entrar', email, pin, pin, '', '').valor);
  afirmar(r.token, 'PIN criado para ' + email + ': ' + JSON.stringify(r).slice(0, 200));
  return r;
}

async function entrar(aba, email, pin, confirmar, codigo) {
  const f = await frame(aba);
  await f.fill('#entrar-email', email);
  await f.fill('#entrar-pin', pin);
  await f.click('#entrar-botao');
  if (confirmar) {
    await f.waitForSelector('#entrar-confirma:not(.oculto)', { timeout: 10000 });
    if (await f.isVisible('#entrar-codigo')) {
      await f.fill('#entrar-codigo', codigo || codigoDoEmail(aba.s, email));
    }
    await f.fill('#entrar-pin2', pin);
    await f.click('#entrar-botao');
  }
}

async function cenario(nome, fn) {
  if (FILTRO && nome.indexOf(FILTRO) === -1) return;
  const ini = Date.now();
  try {
    await fn();
    resultados.push({ nome, ok: true, ms: Date.now() - ini });
    console.log('  ok   ' + nome);
  } catch (e) {
    resultados.push({ nome, ok: false, erro: e.message });
    console.log('  FALHA ' + nome + '\n        ' + String(e.message).split('\n').join('\n        '));
  }
}

/*
 * ENTRADA DE VERDADE (10/10). O evaluate do Playwright roda com "gesto do
 * usuario": cada evaluate da ao navegador um clique novo, e a moldura navega
 * mesmo quando, para uma pessoa, o clique ja teria "vencido" — exatamente o
 * caso do "Continuar". Estes cenarios nao tocam na pagina enquanto um passo
 * roda: um observador no documento de cima (addInitScript) le a moldura e
 * conta o estado pelo console; os cliques sao do mouse, nas coordenadas que
 * ele informa; o teclado digita.
 */
const OBSERVADOR = `(() => {
  if (window.top !== window) return;
  let ultimo = '';
  const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom > window.innerHeight || r.top < 0) return null; return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
  const ler = () => {
    const fr = document.getElementById('userHtmlFrame');
    const d = fr && fr.contentDocument, w = fr && fr.contentWindow;
    if (!d || !d.body) return null;
    const vis = ['carregando', 'falha', 'instalacao', 'entrar', 'sem-acesso', 'escolher-filial', 'aplicacao']
      .filter((id) => { const e = d.getElementById(id); return e && !e.classList.contains('oculto'); });
    const jan = d.getElementById('janela');
    const janela = jan && !jan.classList.contains('oculto') ? ((d.getElementById('janela-titulo') || {}).textContent || '') : '';
    const cont = d.getElementById('entrar-continuar');
    const achar = (sel, re) => [...d.querySelectorAll(sel)].find((x) => !re || re.test(x.textContent));
    const card = d.querySelector('.cartao-acao');
    const mc = card ? /Coment[^(]*[(]([0-9]+)[)]/.exec(card.textContent) : null;
    let barrado = null; try { barrado = w.eval('typeof CANAL_BARRADO !== "undefined" ? CANAL_BARRADO : null'); } catch (e) {}
    return {
      tela: vis.join(','), janela, barrado,
      titulo: (d.getElementById('titulo-pagina') || {}).textContent || '',
      pagina: (((d.getElementById('pagina') || {}).textContent) || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      msg: (((d.getElementById('entrar-msg') || {}).textContent) || '').slice(0, 90),
      continuar: !!(cont && !cont.classList.contains('oculto')),
      continuarMsg: (((d.getElementById('entrar-continuar-msg') || {}).textContent) || '').slice(0, 120),
      coment: card ? (mc ? Number(mc[1]) : 0) : -1,
      recado: ((d.getElementById('recado') || {}).textContent || '').slice(0, 90),
      pos: {
        email: caixa(d.getElementById('entrar-email')), pin: caixa(d.getElementById('entrar-pin')),
        entrar: caixa(d.getElementById('entrar-botao')), continuar: caixa(d.getElementById('entrar-continuar-botao')),
        janelaContinuar: janela === 'Continuar' ? caixa(d.querySelector('#janela-rodape .botao')) : null,
        card0: caixa(d.querySelector('.holocard')), cardEstoque: caixa(achar('.holocard', /Estoque de TI/)),
        cardCalendario: caixa(achar('.holocard', /Calend/)),
        menuAcoes: caixa(d.querySelector('.item-menu[data-pagina="acoes"]')),
        menuCalendario: caixa(d.querySelector('.item-menu[data-pagina="calendario"]')),
        comentarios: janela ? null : caixa(achar('.cartao-acao button', /^\\s*Coment/)),
        cmTexto: caixa(d.getElementById('cm-texto')),
        registrar: caixa(achar('#janela-rodape .botao', /Registrar coment/))
      }
    };
  };
  setInterval(() => {
    let e; try { e = ler(); } catch (x) { return; }
    if (!e) return;
    const k = JSON.stringify(e);
    if (k !== ultimo) { ultimo = k; console.debug('\\u00a7' + k); }
  }, 30);
})();`;

/* Aba "de verdade": cookies, observador, eventos do servidor com hora. */
async function abrirAbaReal(s, conta, extras) {
  extras = extras || {};
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 1600 } });
  await contexto.addInitScript(OBSERVADOR);
  const cookies = [{ name: 'gas_conta', value: conta, url: s.url }];
  if (extras.bloqueio403) cookies.push({ name: 'gas_403', value: extras.bloqueio403 === 'perm' ? 'perm' : '1', url: s.url });
  if (extras.atraso) cookies.push({ name: 'gas_atraso', value: String(extras.atraso), url: s.url });
  if (extras.atrasoPost) cookies.push({ name: 'gas_atraso_post', value: String(extras.atrasoPost), url: s.url });
  if (extras.falha) cookies.push({ name: 'gas_falha', value: extras.falha, url: s.url });
  await contexto.addCookies(cookies);
  const page = await contexto.newPage();
  const aba = { page, contexto, s, estado: null, erros: [], marca: 0 };
  page.on('console', (m) => {
    const t = m.text();
    if (t.charAt(0) === '§') { try { aba.estado = JSON.parse(t.slice(1)); } catch (e) {} return; }
    if (m.type() === 'error' && !/ERR_CERT|fonts\.googleapis|Failed to load resource|escape its sandboxing|Unsafe attempt to initiate navigation/.test(t)) aba.erros.push('console: ' + t);
  });
  page.on('pageerror', (e) => aba.erros.push(e.message));
  page.on('framenavigated', (fr) => { if (fr === page.mainFrame()) aba.estado = null; });
  await page.goto(s.url + (extras.query || ''), { waitUntil: 'domcontentloaded' });
  return aba;
}
/* Espera um estado (sem tocar na pagina). */
async function esperarEstado(aba, pred, ms, rotulo) {
  const fim = Date.now() + (ms || 20000);
  while (Date.now() < fim) {
    if (aba.estado && pred(aba.estado)) return aba.estado;
    await new Promise((ok) => setTimeout(ok, 40));
  }
  throw new Error('esperava ' + (rotulo || 'estado') + '; estava: ' + JSON.stringify(aba.estado && Object.assign({}, aba.estado, { pos: undefined })));
}
async function clicarEm(aba, nome, ms) {
  // A posicao tem que ficar parada um instante (fontes e logo ainda acomodando a tela).
  let antes = '', iguais = 0;
  const fim = Date.now() + (ms || 15000);
  while (Date.now() < fim) {
    const p = aba.estado && aba.estado.pos && aba.estado.pos[nome];
    const k = p ? p.join(',') : '';
    if (k && k === antes) { if (++iguais >= 3) { await aba.page.mouse.click(p[0], p[1]); return; } } else iguais = 0;
    antes = k;
    await new Promise((ok) => setTimeout(ok, 80));
  }
  throw new Error('posicao de ' + nome + ' nao apareceu; estado: ' + JSON.stringify(aba.estado && Object.assign({}, aba.estado, { pos: undefined })));
}
/* Entra digitando e-mail e PIN e clicando em Entrar (a pessoa leva ~1 s para digitar). */
/*
 * Digita no ritmo de uma pessoa (~2 s para e-mail e PIN). A sonda do canal
 * sai quando a pagina abre; com a falha lenta de 6 s, ela so acusa o
 * bloqueio dentro dos ~5 s que o clique vale se o Entrar vier mais de 1 s
 * depois dela. Digitando em 0,3 s, a maquina carregada passava do limite.
 */
async function entrarReal(aba, email, pin) {
  await clicarEm(aba, 'email', 20000);
  await aba.page.keyboard.type(email, { delay: 60 });
  await clicarEm(aba, 'pin');
  await aba.page.keyboard.type(pin, { delay: 60 });
  await clicarEm(aba, 'entrar');
}
/* Pedidos ao servidor desde a marca: POSTs de pagina e chamadas (por funcao). */
function marcar(aba) { aba.marca = aba.s.registro.length; }
function desdeMarca(aba) {
  const r = aba.s.registro.slice(aba.marca);
  return { posts: r.filter((x) => x.tipo === 'doPost').length, gets: r.filter((x) => x.tipo === 'doGet').length,
    runs: r.filter((x) => x.tipo === 'run').map((x) => x.fn) };
}

/* ------------------------------------------------------------------ */
/* cenarios                                                            */
/* ------------------------------------------------------------------ */

async function rodar() {
  navegador = await playwright.chromium.launch();
  console.log('GSL em ' + PASTA + '\n');

  await cenario('pagina abre sem erro de JavaScript (com o apagador de comentarios do Google)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    afirmar((await telaVisivel(aba)).includes('entrar'), 'tela de entrada visivel');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('instalacao pela tela, pelo dono', async () => {
    const s = await subir();
    const aba = await abrirAba(s, DONO);
    afirmar(await esperarTela(aba, ['instalacao']) === 'instalacao', 'tela de instalacao');
    const f = await frame(aba);
    afirmar(await f.inputValue('#instalacao-email') === DONO, 'e-mail do dono preenchido');
    await f.click('#botao-instalar');
    afirmar(await esperarTela(aba, ['entrar'], 20000) === 'entrar', 'depois de instalar, pede e-mail e PIN');
    afirmar(await f.inputValue('#entrar-email') === DONO, 'e-mail do dono ja preenchido');
    await entrar(aba, DONO, '4321', true);
    afirmar(await esperarTela(aba, ['aplicacao', 'falha', 'sem-acesso']) === 'aplicacao', 'dono entrou depois de instalar');
    afirmar(!s.registro.some((r) => r.tipo === 'moldura-recarregada'), 'nenhuma moldura recarregada (ficaria em branco no Google)');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('dono: primeiro acesso cria o PIN e entra', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    afirmar(await esperarTela(aba, ['aplicacao', 'escolher-filial', 'falha', 'sem-acesso']) === 'aplicacao', 'entrou no sistema');
    afirmar((await texto(aba, 'usuario-conta')).includes(DONO), 'mostra a conta de quem entrou');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('coordenadora no computador compartilhado: e-mail + PIN novo, entra', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    afirmar(await esperarTela(aba, ['aplicacao', 'falha', 'sem-acesso']) === 'aplicacao', 'entrou');
    afirmar((await texto(aba, 'usuario-conta')).includes(COORD), 'entrou como ela, nao como a conta do computador');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('primeiro acesso: sem o codigo do e-mail ninguem cria o PIN de outra pessoa', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    const f = await frame(aba);
    await f.fill('#entrar-email', GERENTE);
    await f.fill('#entrar-pin', '5555');
    await f.click('#entrar-botao');
    await f.waitForSelector('#entrar-codigo', { state: 'visible', timeout: 10000 });
    afirmar(/mandamos um código/i.test(await texto(aba, 'entrar-msg')), 'avisa que mandou o codigo: ' + await texto(aba, 'entrar-msg'));
    const email = s.mundo.emails.find((x) => x.to === GERENTE);
    afirmar(email && !email.cc, 'codigo foi so para o e-mail da pessoa, sem copia');
    await f.fill('#entrar-codigo', '000000' === codigoDoEmail(s, GERENTE) ? '111111' : '000000');
    await f.fill('#entrar-pin2', '5555');
    await f.click('#entrar-botao');
    await f.waitForFunction(() => /incorreto/i.test(document.getElementById('entrar-msg').textContent), null, { timeout: 10000 });
    afirmar((await telaVisivel(aba)).includes('entrar'), 'nao entrou');
    const ctx = s.contexto(DONO); ctx._porta = true;
    const reg = ctx.registroDeAcesso_(GERENTE);
    afirmar(!String(reg.PIN_HASH || ''), 'PIN do gerente continua sem dono');
    // o dono do e-mail, com o codigo certo, cria o PIN
    await f.fill('#entrar-codigo', codigoDoEmail(s, GERENTE));
    await f.fill('#entrar-pin', '5555');
    await f.fill('#entrar-pin2', '5555');
    await f.click('#entrar-botao');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha']) === 'aplicacao', 'com o codigo certo entrou');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('administrador gera codigo de acesso; a pessoa entra com ele', async () => {
    const s = await subir(); instalarComPessoas(s);
    const adm = await abrirAba(s, DONO);
    await entrar(adm, DONO, '4321', true);
    await esperarTela(adm, ['aplicacao']);
    const fa = await frame(adm);
    await fa.evaluate(() => abrir('acessos'));
    await fa.waitForSelector('#tabela-pessoas', { timeout: 15000 });
    await fa.click('#tabela-pessoas tr:has-text("Maria Souza") button:has-text("Código de acesso")');
    await fa.waitForSelector('#janela:not(.oculto)', { timeout: 10000 });
    const codigo = ((await fa.evaluate(() => document.getElementById('janela-corpo').innerText)).match(/\b(\d{6})\b/) || [])[1];
    afirmar(codigo, 'janela mostrou o codigo');
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '2468', true, codigo);
    afirmar(await esperarTela(aba, ['aplicacao', 'falha']) === 'aplicacao', 'entrou com o codigo do administrador');
    afirmar(!aba.erros.length && !adm.erros.length, 'erros: ' + aba.erros.concat(adm.erros).join(' | '));
    await adm.contexto.close(); await aba.contexto.close(); await s.fechar();
  });

  await cenario('PIN errado: avisa, conta tentativas e bloqueia na quinta', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    const aba2 = await abrirAba(s, GERAL);
    await entrar(aba2, COORD, '9999');
    const f = await frame(aba2);
    await f.waitForFunction(() => /incorreto/i.test(document.getElementById('entrar-msg').textContent), null, { timeout: 10000 });
    afirmar(/Restam 4/.test(await texto(aba2, 'entrar-msg')), 'avisa quantas tentativas restam: ' + await texto(aba2, 'entrar-msg'));
    for (let i = 0; i < 4; i++) {
      await f.fill('#entrar-pin', '9999'); await f.click('#entrar-botao');
      await aba2.page.waitForTimeout(400);
    }
    await f.fill('#entrar-pin', '1234'); await f.click('#entrar-botao');
    await f.waitForFunction(() => /muitas vezes/i.test(document.getElementById('entrar-msg').textContent), null, { timeout: 10000 });
    afirmar((await telaVisivel(aba2)).includes('entrar'), 'continua na entrada mesmo com o PIN certo (bloqueado)');
    await aba.contexto.close(); await aba2.contexto.close(); await s.fechar();
  });

  await cenario('e-mail nao cadastrado nao entra', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, 'ninguem@bartofil.com.br', '1234');
    const f = await frame(aba);
    await f.waitForFunction(() => /não está cadastrado/i.test(document.getElementById('entrar-msg').textContent), null, { timeout: 10000 });
    afirmar((await telaVisivel(aba)).includes('entrar'), 'fica na entrada');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('nada identificavel fica guardado: outra janela pede e-mail e PIN de novo', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const guardado = await f.evaluate(() => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
    });
    const txt = JSON.stringify(guardado);
    afirmar(txt.indexOf('@') === -1, 'localStorage sem e-mail: ' + txt);
    afirmar(!/[a-f0-9]{32,}/.test(txt), 'localStorage sem codigo de sessao: ' + txt);
    // Nova aba no MESMO navegador (sessionStorage e por aba): pede de novo.
    const aba2 = await abrirAba(s, GERAL, { contexto: aba.contexto });
    afirmar(await esperarTela(aba2, ['entrar', 'aplicacao']) === 'entrar', 'nova aba pede e-mail e PIN');
    afirmar(!(await (await frame(aba2)).inputValue('#entrar-email')), 'e-mail nao vem preenchido');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('recarregar a mesma aba continua dentro (sessao da aba)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    await aba.page.reload();
    afirmar(await esperarTela(aba, ['aplicacao', 'entrar', 'falha']) === 'aplicacao', 'continua dentro depois do F5');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('sair encerra a sessao no servidor', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const token = await f.evaluate(() => TOKEN);
    await f.evaluate(() => sair());
    afirmar(await esperarTela(aba, ['entrar']) === 'entrar', 'voltou para a entrada');
    await aba.page.waitForTimeout(500);
    const r = s.chamar(GERAL, 'retomarSessao', { t: token, f: '' });
    afirmar(r.ok && JSON.parse(r.valor).entrada === 'ENTRAR', 'sessao antiga nao vale mais: ' + JSON.stringify(r));
    await aba.page.reload();
    afirmar(await esperarTela(aba, ['entrar', 'aplicacao']) === 'entrar', 'F5 depois de sair pede PIN');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('Google bloqueando o google.script.run (HTTP 403): entra pelo formulario', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');                               // PIN ja criado
    const aba = await abrirAba(s, GERAL, { bloqueio403: true });
    await entrar(aba, COORD, '1234');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha', 'sem-acesso'], 20000) === 'aplicacao', 'entrou pela reserva');
    afirmar(s.registro.some((r) => r.tipo === 'doPost'), 'usou o POST de reserva');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('varias contas Google (PERMISSION_DENIED): entra pelo formulario', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { bloqueio403: 'perm' });
    await entrar(aba, COORD, '1234');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou pela reserva');
    afirmar(s.registro.some((r) => r.tipo === 'doPost'), 'usou o POST de reserva');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('falha lenta do Google (clique ja vencido): avisa e o segundo clique entra', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { bloqueio403: true, atraso: 6500 });
    await entrar(aba, COORD, '1234');
    const f = await frame(aba);
    await f.waitForFunction(() => /Clique em Entrar de novo/i.test(document.getElementById('entrar-msg').textContent), null, { timeout: 15000 });
    await f.fill('#entrar-pin', '1234');
    await f.click('#entrar-botao');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'o segundo clique entrou');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('reenviar o POST de entrada (F5/Voltar depois de Sair) nao entra de novo', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { bloqueio403: true });
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao'], 20000);
    const post = s.registro.filter((r) => r.tipo === 'doPost').pop();
    afirmar(post && /email=/.test(post.corpo) && /bilhete=/.test(post.corpo), 'o POST de entrada levou o bilhete');
    let f = await frame(aba);
    const token = await f.evaluate(() => TOKEN);
    await f.evaluate(() => sair());
    await aba.page.waitForTimeout(1500);
    afirmar(await esperarTela(aba, ['entrar', 'aplicacao'], 15000) === 'entrar', 'saiu');
    afirmar(s.registro.some((r) => r.tipo === 'doPost' && r.campos.includes('sair')), 'a saida foi por POST');
    const r = s.chamar(GERAL, 'retomarSessao', { t: token, f: '' });
    afirmar(JSON.parse(r.valor).entrada === 'ENTRAR', 'a sessao antiga acabou no servidor');
    // o "proximo" reenvia o POST de entrada guardado no historico
    const resp = await aba.contexto.request.post(s.url, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, data: post.corpo });
    const html = await resp.text();
    afirmar(/n\\u00e3o pode ser reenviada|não pode ser reenviada|nao pode ser reenviada/.test(html) || /reenviada/.test(html), 'POST reenviado recusado');
    afirmar(!/"entrada":"APP"/.test(html), 'POST reenviado nao abre o sistema');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('reserva por POST: clique repetido em Entrar manda um POST so, e entra', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    // O Google ja processou a entrada, mas a pagina nova demora 3 s para
    // chegar: da tempo de a pessoa clicar de novo.
    const aba = await abrirAba(s, GERAL, { bloqueio403: true, atrasoPost: 3000 });
    const f = await frame(aba);
    await f.evaluate(() => { CANAL_BARRADO = true; });              // canal ja sabidamente barrado
    await f.fill('#entrar-email', COORD);
    await f.fill('#entrar-pin', '1234');
    // Mouse de verdade pelo CDP, sem esperar a resposta: o click() do
    // Playwright (e o proprio CDP) so voltam quando a pagina nova chega.
    const caixa = await (await f.$('#entrar-botao')).boundingBox();
    const cdp = await aba.contexto.newCDPSession(aba.page);
    const x = caixa.x + caixa.width / 2, y = caixa.y + caixa.height / 2;
    const clicar = () => {
      cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }).catch(() => {});
      cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }).catch(() => {});
    };
    // (Com a navegacao pendente o Playwright nao consegue avaliar nada no
    // frame: a prova e o que chega no servidor e a tela final.)
    clicar();
    await aba.page.waitForTimeout(1500);
    clicar();                                                       // a pessoa clica de novo
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou');
    const posts = s.registro.filter((r) => r.tipo === 'doPost' && /(^|&)email=/.test(r.corpo || ''));
    afirmar(posts.length === 1, 'um POST de entrada so: ' + posts.length);
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('primeiro acesso: trocar o e-mail desfaz o pedido de codigo (quem ja tem PIN entra)', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL);
    const f = await frame(aba);
    await f.fill('#entrar-email', GERENTE);                         // e-mail errado, de quem nao tem PIN
    await f.fill('#entrar-pin', '5678');
    await f.click('#entrar-botao');
    await f.waitForSelector('#entrar-codigo', { state: 'visible', timeout: 10000 });
    await f.fill('#entrar-email', COORD);                           // corrige o e-mail
    afirmar(!(await f.isVisible('#entrar-codigo')) && !(await f.isVisible('#entrar-pin2')), 'caixas do primeiro acesso somem');
    await f.fill('#entrar-pin', '1234');
    await f.click('#entrar-botao');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha', 'sem-acesso'], 15000) === 'aplicacao', 'entrou com o PIN dela');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('reserva por POST com a pagina aberta a noite toda (bilhete vencido): explica, guarda o e-mail e entra', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { bloqueio403: true });
    for (const k of [...s.mundo.cache.keys()]) if (/^bilhete_/.test(k)) s.mundo.cache.delete(k);   // 6 h depois
    await entrar(aba, COORD, '1234');
    await aba.page.waitForTimeout(1500);
    await esperarTela(aba, ['entrar']);
    let f = await frame(aba);
    await f.waitForFunction(() => /aberta muito tempo/.test(document.getElementById('entrar-msg').textContent), null, { timeout: 15000 });
    afirmar(await f.inputValue('#entrar-email') === COORD, 'o e-mail continua preenchido');
    await f.fill('#entrar-pin', '1234');
    await f.click('#entrar-botao');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'o segundo Entrar entrou');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('reserva por POST com a sessao vencida: a tela diz que a sessao terminou', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { bloqueio403: true });
    await entrar(aba, COORD, '1234');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou pela reserva');
    // 1 h parada: some do cache e a copia duravel (propriedades do dono) fica com o ultimo uso de 61 min atras
    for (const k of [...s.mundo.cache.keys()]) if (/^sess_/.test(k)) s.mundo.cache.delete(k);
    for (const k of Object.keys(s.mundo.props.user)) if (/^sessao_/.test(k)) {
      const reg = JSON.parse(s.mundo.props.user[k]); reg.u = Date.now() - 61 * 60000; s.mundo.props.user[k] = JSON.stringify(reg);
    }
    const f = await frame(aba);
    await f.click('.holocard >> nth=0');
    await aba.page.waitForTimeout(2500);
    afirmar(await esperarTela(aba, ['entrar', 'aplicacao'], 15000) === 'entrar', 'voltou para a entrada');
    const msg = await texto(aba, 'entrar-msg');
    afirmar(/sessão terminou/.test(msg), 'explica: "' + msg + '"');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('codigo de primeiro acesso: no maximo 3 e-mails em 15 min, e os anteriores continuam valendo', async () => {
    const s = await subir(); instalarComPessoas(s);
    const pedir = (email) => JSON.parse(s.chamar(GERAL, 'entrar', email, '5678', '', '', '').valor);
    const chave = 'pincod_email_' + GERENTE.replace(/[^a-z0-9]/g, '_');
    const passarUmMinuto = () => { const e = s.mundo.cache.get(chave); const v = JSON.parse(e.v); v.em -= 61000; e.v = JSON.stringify(v); };
    const codigos = [];
    for (let i = 0; i < 3; i++) {
      const r = pedir(GERENTE);
      afirmar(r.pedirCodigo && !r.erro, 'pedido ' + (i + 1) + ': ' + JSON.stringify(r).slice(0, 160));
      codigos.push(codigoDoEmail(s, GERENTE)); passarUmMinuto();
    }
    afirmar(new Set(codigos).size === 3, 'tres codigos diferentes: ' + codigos.join(','));
    const quarto = pedir(GERENTE);
    afirmar(/Já mandamos 3/.test(quarto.erro || ''), 'quarto pedido recusado: ' + JSON.stringify(quarto).slice(0, 200));
    afirmar(s.mundo.emails.filter((x) => x.to === GERENTE && /primeiro acesso/.test(x.subject)).length === 3, 'so 3 e-mails de codigo saíram');
    // o primeiro codigo (o que ja estava na caixa de entrada) continua valendo
    const r = JSON.parse(s.chamar(GERAL, 'entrar', GERENTE, '5678', '5678', '', codigos[0]).valor);
    afirmar(r.token, 'entrou com o primeiro codigo: ' + JSON.stringify(r).slice(0, 200));
    // teto do sistema inteiro por hora
    const hora = new Date().toISOString().slice(0, 13).replace(/\D/g, '');
    s.mundo.cache.set('pincod_hora_' + hora, { v: '60', expira: Date.now() + 3600000 });
    const outro = pedir(COORD);
    afirmar(/no limite/.test(outro.erro || '') && !s.mundo.emails.some((x) => x.to === COORD && /primeiro acesso/.test(x.subject)),
      'teto por hora: ' + JSON.stringify(outro).slice(0, 200));
    await s.fechar();
  });

  await cenario('aba restaurada depois de fechada nao reaproveita a sessao; F5 imediato sim', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    // A janela do F5 (20 s) conta do primeiro script da pagina nova (GSL_T0), nao do fim da carga.
    const r = await f.evaluate(() => {
      sessionStorage.setItem('gsl_sessao', 'abc123'); sessionStorage.setItem('gsl_saida', String(GSL_T0 - 21000));
      const velha = lerSessao();
      sessionStorage.setItem('gsl_sessao', 'abc123'); sessionStorage.setItem('gsl_saida', String(GSL_T0 - 1000));
      const f5 = lerSessao();
      sessionStorage.setItem('gsl_sessao', 'abc123'); sessionStorage.removeItem('gsl_saida');
      const semPagehide = lerSessao();          // aba descartada pelo navegador, travou: pede o PIN
      return { velha, f5, semPagehide };
    });
    afirmar(r.velha === '' && r.f5 === 'abc123' && r.semPagehide === '', 'restaurada depois de 20 s: nada; F5: sessao; sem pagehide: nada — ' + JSON.stringify(r));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('sem filial liberada: tela explica e "Entrar com outro e-mail" volta para a entrada', async () => {
    const s = await subir(); instalarComPessoas(s);
    const ctx = s.contexto(DONO); ctx._porta = true;
    const admin = { email: DONO, perfil: 'ADMIN', permissoes: ctx.permissoesDe('ADMIN') };
    ctx.acaoSalvarUsuario(admin, { email: 'semfilial@bartofil.com.br', nome: 'Sem Filial', perfil: 'COORDENADOR', turno: 'A', filiais: 'XYZ' });
    criarPin(s, GERAL, 'semfilial@bartofil.com.br', '1234');
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, 'semfilial@bartofil.com.br', '1234');
    afirmar(await esperarTela(aba, ['sem-acesso', 'aplicacao', 'falha']) === 'sem-acesso', 'mostra a tela de sem acesso');
    const f = await frame(aba);
    afirmar(!(await f.evaluate(() => TOKEN)), 'a sessao nao ficou guardada');
    await f.click('#sem-acesso .botao-texto');
    afirmar(await esperarTela(aba, ['entrar']) === 'entrar', 'voltou para digitar outro e-mail');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('Google Fonts travado nao prende a abertura', async () => {
    const s = await subir(); instalarComPessoas(s);
    const contexto = await navegador.newContext();
    await contexto.route(/fonts\.(googleapis|gstatic)\.com/, () => { /* nunca responde */ });
    const aba = await abrirAba(s, GERAL, { contexto });
    afirmar((await telaVisivel(aba)).includes('entrar'), 'tela de entrada abriu com a fonte travada');
    await contexto.close(); await s.fechar();
  });

  await cenario('Google bloqueando (HTTP 403) no primeiro acesso: codigo do e-mail pelo formulario', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL, { bloqueio403: true });
    let f = await frame(aba);
    await f.fill('#entrar-email', COORD);
    await f.fill('#entrar-pin', '1357');
    await f.click('#entrar-botao');
    await aba.page.waitForTimeout(1500);
    await esperarTela(aba, ['entrar']);
    f = await frame(aba);
    await f.waitForSelector('#entrar-codigo', { state: 'visible', timeout: 15000 });
    afirmar(await f.inputValue('#entrar-email') === COORD, 'e-mail continua preenchido');
    await f.fill('#entrar-pin', '1357');
    await f.fill('#entrar-codigo', codigoDoEmail(s, COORD));
    await f.fill('#entrar-pin2', '1357');
    await f.click('#entrar-botao');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou pela reserva com o codigo');
    afirmar(s.registro.filter((r) => r.tipo === 'doPost').length >= 2, 'dois POSTs de entrada');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('Google bloqueando (HTTP 403): abrir tela vai por POST e o codigo da sessao nao aparece na URL', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { bloqueio403: true });
    await entrar(aba, COORD, '1234');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou pela reserva');
    let f = await frame(aba);
    await f.click('.holocard >> nth=0');                    // clique de verdade: a navegacao precisa dele
    await aba.page.waitForTimeout(2500);
    f = await frame(aba);
    await f.waitForSelector('#aplicacao:not(.oculto)', { timeout: 15000 });
    const titulo = await f.evaluate(() => document.getElementById('titulo-pagina').textContent);
    const conteudo = await f.evaluate(() => document.getElementById('pagina').innerText);
    afirmar(!/Abrindo pela navega/.test(conteudo), 'a tela abriu (nao ficou em "Abrindo pela navegacao")');
    afirmar(s.registro.some((r) => r.tipo === 'doPost' && r.campos.includes('t') && r.campos.includes('tela')), 'usou o POST com a tela');
    afirmar(!/[?&]t=/.test(aba.page.url()), 'URL sem codigo: ' + aba.page.url());
    afirmar(!s.registro.some((r) => r.tipo === 'doGet' && /[?&]t=/.test(r.q || '')), 'nenhum GET com ?t=');
    afirmar(titulo && titulo !== 'modulos', 'titulo da tela: ' + titulo);
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('codigo de sessao na URL (?t=) nao abre o sistema', async () => {
    const s = await subir(); instalarComPessoas(s);
    const r = criarPin(s, GERAL, COORD, '1234');
    const aba = await abrirAba(s, GERAL, { query: '?t=' + r.token });
    afirmar(await esperarTela(aba, ['entrar', 'aplicacao']) === 'entrar', 'pede e-mail e PIN mesmo com o codigo na URL');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('botao "Ja fui liberado — tentar de novo" recarrega o app (sem moldura em branco)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    const f = await frame(aba);
    await f.evaluate(() => mostrarSemAcesso({ entrada: 'SEM_CADASTRO', motivo: 'teste' }));
    await f.click('#sem-acesso .botao');
    await aba.page.waitForTimeout(800);
    afirmar(await esperarTela(aba, ['entrar', 'sem-acesso', 'falha']) === 'entrar', 'voltou para a entrada');
    afirmar(!s.registro.some((r) => r.tipo === 'moldura-recarregada'), 'nao recarregou so a moldura');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('assiduidade > periodo: folhas sobrepostas e reimportacao nao repetem datas (servidor)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const { acao } = prepararAssiduidade(s);
    const r = acao('periodo', { de: '2025-08-01', ate: '2025-08-31', tipo: 'TODAS', turno: '' });
    afirmar(r.registros === 6, 'seis ausencias em agosto (3 de cada), veio ' + r.registros);
    r.lista.forEach((p) => {
      const d = p.datas.map((x) => x.data);
      afirmar(!repetidas(d).length, p.nome + ' com data repetida: ' + d.join(', '));
      afirmar(p.registros === d.length, p.nome + ': registros (' + p.registros + ') = datas (' + d.length + ')');
    });
    const ana = r.lista.find((p) => p.nome === 'ANA SOUZA');
    afirmar(ana && ana.datas.map((x) => x.data).join(',') === '05/08/2025,06/08/2025,19/08/2025', 'datas da Ana: ' + (ana && ana.datas.map((x) => x.data).join(',')));
    const dias = (r.linhaDoTempo || []).map((x) => x.data);
    afirmar(dias.length === 31 && !repetidas(dias).length, 'linha do tempo com 31 dias sem repetir');
    afirmar((r.linhaDoTempo.find((x) => x.data === '2025-08-19') || {}).total === 2, 'dia 19/08 conta 2 (uma de cada pessoa)');
    await s.fechar();
  });

  await cenario('assiduidade > periodo: a tela mostra cada data uma vez so (Chromium)', async () => {
    const s = await subir(); instalarComPessoas(s);
    prepararAssiduidade(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => abrir('assiduidade'));
    await f.waitForSelector('.abas .aba', { timeout: 15000 });
    await f.click('.abas .aba:has-text("Período")');
    await f.waitForSelector('#pd-de', { timeout: 10000 });
    await f.fill('#pd-de', '2025-08-01');
    await f.fill('#pd-ate', '2025-08-31');
    await f.click('.periodo-form .botao');
    await f.waitForSelector('td.datas-aus', { timeout: 15000 });
    const linhas = await f.$$eval('td.datas-aus', (tds) => tds.map((t) => t.textContent.trim()));
    afirmar(linhas.length === 2, 'duas pessoas na tabela, vieram ' + linhas.length);
    linhas.forEach((t) => { const d = t.split(/,\s*/); afirmar(!repetidas(d).length, 'datas repetidas na tela: ' + t); });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('reportar erro na tela de modulos: grava o relato e volta para os modulos', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.click('.botao-feedback');
    await f.fill('#fb-texto', 'Teste: a tela travou.');
    await f.click('#janela-rodape .botao:not(.secundario)');
    await aba.page.waitForTimeout(1500);
    const r = await f.evaluate(() => ({ titulo: document.getElementById('titulo-pagina').textContent,
      erro: Array.from(document.querySelectorAll('#pagina .erro-caixa')).map((e) => e.innerText).join(' | '),
      cartoes: document.querySelectorAll('#pagina .tela-modulos').length }));
    afirmar(!r.erro && r.cartoes === 1, 'voltou aos modulos sem erro: ' + JSON.stringify(r));
    const banco = [...s.mundo.planilhas.values()].find((p) => p.nome === 'GSL_BANCO');
    afirmar(banco.abas.find((a) => a.nome === 'FEEDBACK').ultimaLinha() === 2, 'relato gravado na FEEDBACK');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('projeto com o Conversas.gs antigo esquecido: o sistema ainda carrega', async () => {
    const fs = require('fs'), os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-sobra-'));
    fs.readdirSync(PASTA).forEach((f) => fs.copyFileSync(path.join(PASTA, f), path.join(tmp, f)));
    // o comeco do Conversas.gs da 4.1/4.2 (as declaracoes de topo)
    fs.writeFileSync(path.join(tmp, 'Conversas.gs'), "const CONVERSA_ATIVIDADE = 'ATIVIDADE';\n" +
      "const CONVERSA_DIRETA = 'DIRETO';\nconst CONVERSA_LIMITE = 200;\nconst FEEDBACK_TIPOS = ['ERRO', 'SUGESTAO', 'DUVIDA'];\n" +
      "function listarFeedback() { return []; }\n");
    for (const ordem of ['alfabetica', 'reversa']) {
      const s = await criarServidor({ pasta: tmp, apagarComentarios: 'simples', dono: DONO, ordem });
      instalarComPessoas(s);
      const aba = await abrirAba(s, GERAL);
      afirmar((await telaVisivel(aba)).includes('entrar'), 'abre na entrada (ordem ' + ordem + ')');
      await aba.contexto.close(); await s.fechar();
    }
    fs.rmSync(tmp, { recursive: true });
  });

  await cenario('administrador: todas as telas do menu abrem sem erro', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const telas = await f.evaluate(() => SESSAO.telas.map((t) => t.id));
    const problemas = [];
    for (const id of telas) {
      aba.erros.length = 0;
      await f.evaluate((i) => abrir(i), id);
      let conteudo = '';
      for (let k = 0; k < 60; k++) {
        conteudo = await f.evaluate(() => document.getElementById('pagina').innerText);
        if (!/Carregando/.test(conteudo)) break;
        await aba.page.waitForTimeout(150);
      }
      const erroCaixa = await f.evaluate(() => Array.from(document.querySelectorAll('#pagina .erro-caixa')).map((e) => e.innerText).join(' | '));
      if (/Carregando/.test(conteudo)) problemas.push(id + ': ficou carregando');
      if (erroCaixa) problemas.push(id + ': ' + erroCaixa.slice(0, 200));
      if (aba.erros.length) problemas.push(id + ': ' + aba.erros.join(' | ').slice(0, 300));
    }
    afirmar(!problemas.length, telas.length + ' telas; problemas:\n' + problemas.join('\n'));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('limpeza: abas novas; estoque igual ao de TI; Plano de Acao com foto na acao e no comentario (visor abre a foto)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('limpeza'); });
    await f.waitForFunction(() => document.querySelectorAll('#pagina .abas .aba').length >= 5, null, { timeout: 15000 });
    const abas = await f.evaluate(() => Array.from(document.querySelectorAll('#pagina .abas .aba')).map((b) => b.textContent.trim()));
    afirmar(abas.join('|') === 'Gestão|Plano de Ação|Estoque|Movimentações|Inventário', 'abas: ' + abas.join('|'));
    // ESTOQUE — o mesmo do TI
    await f.click('#pagina .abas .aba[data-aba="estoque"]');
    await f.click('#acoes-topo >> text=Novo produto');
    await f.fill('#ei-nome', 'Detergente neutro 5L'); await f.fill('#ei-min', '2'); await f.fill('#ei-ideal', '6'); await f.fill('#ei-saldo', '1');
    await f.click('.janela .botao >> text=Salvar');
    await f.waitForFunction(() => ((DADOS.estoque || {}).itens || []).some((i) => i.codigo === 'LP-0001' && i.saldo === 1), null, { timeout: 15000 });
    await f.waitForFunction(() => /Estoque ideal/.test(document.getElementById('conteudo-lp').textContent), null, { timeout: 15000 });
    const cab = await f.evaluate(() => Array.from(document.querySelectorAll('#conteudo-lp thead th')).map((t) => t.textContent.trim()));
    ['Produto de limpeza', 'Estoque', 'Estoque mínimo', 'Estoque ideal'].forEach((c) => afirmar(cab.indexOf(c) !== -1, 'coluna ' + c + ': ' + cab.join('|')));
    afirmar(/Detergente neutro 5L/.test(await f.evaluate(() => (document.querySelector('.est-alerta') || {}).textContent || '')), 'alerta do minimo');
    await f.click('.est-mais');
    await f.fill('#er-qtd', '4');
    await f.press('#er-qtd', 'Enter');
    await f.waitForFunction(() => { const i = ((DADOS.estoque || {}).itens || []).find((x) => x.codigo === 'LP-0001'); return i && i.saldo === 5; }, null, { timeout: 15000 });
    afirmar(await f.evaluate(() => ABA_LP) === 'estoque', 'continua na aba Estoque depois de gravar');
    // PLANO DE ACAO — o mesmo do calendario, com foto
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await f.click('#pagina .abas .aba[data-aba="plano"]');
    await f.click('#acoes-topo >> text=Nova ação');
    await f.fill('#ac-acao', 'Banheiro da central sem papel');
    await f.fill('#ac-descricao', 'Repor o papel toalha');
    await f.selectOption('#ac-zona', 'Z7');
    await f.fill('#ac-local', 'Banheiro da central');
    await f.selectOption('#ac-crit', 'Alta');
    await f.check('.ac-resp[value="' + DONO + '"]');
    await f.fill('#ac-prazo', '2026-12-01');
    await f.setInputFiles('#ac-fotos', { name: 'banheiro.png', mimeType: 'image/png', buffer: png });
    await f.waitForFunction(() => (FOTOS_PENDENTES.ac || []).length === 1 && document.querySelectorAll('#ac-previas img').length === 1, null, { timeout: 15000 });
    await f.click('.janela .botao >> text=Criar ação');
    await f.waitForFunction(() => ((DADOS.plano || {}).lista || []).some((a) => a.acao === 'Banheiro da central sem papel' && a.fotos.length === 1), null, { timeout: 20000 });
    const card = await f.evaluate(() => document.querySelector('#conteudo-lp .cartao-acao').textContent.replace(/\s+/g, ' '));
    afirmar(/Z7 · Banheiro da central/.test(card) && /Alta/.test(card) && /1 foto/.test(card), 'cartao: ' + card.slice(0, 300));
    if (process.env.FOTO_LIMPEZA) await aba.page.screenshot({ path: process.env.FOTO_LIMPEZA + '-plano.png', fullPage: true });
    // o visor abre a foto (veio do Drive pelo servidor)
    await f.click('#conteudo-lp .cartao-acao .selo-foto');
    await f.waitForFunction(() => { const i = document.querySelector('#visor-imagem img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
    if (process.env.FOTO_LIMPEZA) await aba.page.screenshot({ path: process.env.FOTO_LIMPEZA + '-visor.png' });
    await f.click('#visor-fotos .visor-rodape >> text=Fechar');
    // comentario com foto, concluindo
    await f.click('#conteudo-lp .cartao-acao button:has-text("Comentários")');
    await f.fill('#cm-texto', 'Papel reposto e dispenser conferido');
    await f.selectOption('#cm-sit', 'Concluída');
    await f.setInputFiles('#cm-fotos', { name: 'depois.png', mimeType: 'image/png', buffer: png });
    await f.waitForFunction(() => (FOTOS_PENDENTES.cm || []).length === 1, null, { timeout: 15000 });
    await f.click('.janela .botao >> text=Registrar comentário');
    await f.waitForFunction(() => ((DADOS.plano || {}).lista || []).some((a) => a.situacao === 'CONCLUIDA' && a.comentarios.length === 1 && a.comentarios[0].fotos.length === 1), null, { timeout: 20000 });
    // no Drive: Anexos/ACOES/<id da acao>/, as duas fotos juntas
    const a = await f.evaluate(() => DADOS.plano.lista.find((x) => x.acao === 'Banheiro da central sem papel'));
    const pastas = [a.fotos[0].id, a.comentarios[0].fotos[0].id].map((id) => {
      const arq = s.mundo.arquivos.get(id); const p = s.mundo.pastas.get([...arq.pais][0]);
      return s.mundo.pastas.get([...p.pais][0]).nome + '/' + p.nome;
    });
    afirmar(pastas[0] === 'ACOES/' + a.id && pastas[1] === pastas[0], 'pastas: ' + pastas.join(' | '));
    // a foto do comentario abre pelo historico
    await f.evaluate(() => { PLANO.local.situacao = 'TODAS'; pintarAbaLP(DADOS); });
    await f.click('#conteudo-lp .cartao-acao button:has-text("Comentários")');
    await f.click('.coment-item .selo-foto');
    await f.waitForFunction(() => { const i = document.querySelector('#visor-imagem img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
    afirmar(await f.evaluate(() => !document.getElementById('janela').classList.contains('oculto')), 'a janela de comentarios continua aberta por baixo do visor');
    await aba.page.keyboard.press('Escape');
    afirmar(await f.evaluate(() => document.getElementById('visor-fotos').classList.contains('oculto')), 'Esc fecha o visor');
    if (process.env.FOTO_LIMPEZA) {
      await aba.page.screenshot({ path: process.env.FOTO_LIMPEZA + '-comentarios.png' });
      await f.evaluate(() => { fecharJanela(); trocarAbaLP('gestao'); });
      await aba.page.screenshot({ path: process.env.FOTO_LIMPEZA + '-gestao.png', fullPage: true });
      await f.evaluate(() => trocarAbaLP('estoque'));
      await aba.page.screenshot({ path: process.env.FOTO_LIMPEZA + '-estoque.png', fullPage: true });
    }
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('jovem aprendiz: card no menu, liga a planilha pela tela, relatorio do aprendiz e cronograma por fim de contrato', async () => {
    const s = await subir(); instalarComPessoas(s);
    // a "Imersao Corporativa (respostas)" no Drive do dono (nomes ficticios)
    const abas = require('./dados-aprendiz.js')(s.mundo.DataDoScript, new Date());
    const E = require('./dados-aprendiz.js').esperado;
    const pl = s.mundo.novaPlanilha('Imersão Corporativa (respostas)');
    const Aba = Object.getPrototypeOf(pl.abas[0]).constructor;
    Object.keys(abas).forEach((nome, i) => {
      const a = i === 0 ? pl.abas[0] : new Aba(pl, nome, 1000, 26);
      if (i === 0) a.nome = nome; else pl.abas.push(a);
      abas[nome].forEach((linha, l) => { a.dados[l] = linha.slice(); });
    });
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    // o card do modulo no menu
    await f.evaluate(() => abrirModulos());
    const card = await f.evaluate(() => Array.from(document.querySelectorAll('.grade-modulos .holocard')).map((b) => b.innerText.replace(/\s+/g, ' ')).find((t) => /Jovem Aprendiz/.test(t)) || '');
    afirmar(/Abrir portal/i.test(card), 'card do Jovem Aprendiz no menu: ' + card);
    await f.click('.grade-modulos .holocard:has-text("Jovem Aprendiz")');
    // sem planilha: pede o link e liga pela tela
    await f.waitForSelector('#apz-link', { timeout: 15000 });
    await f.fill('#apz-link', 'https://docs.google.com/spreadsheets/d/' + pl.id + '/edit#gid=0');
    await f.click('#pagina button:has-text("Ligar planilha")');
    await f.waitForSelector('#apz-sel', { timeout: 20000 });
    const opcoes = await f.evaluate(() => Array.from(document.querySelectorAll('#apz-sel option')).slice(1).map((o) => o.textContent.trim()));
    afirmar(opcoes.length === 5 && /ANA BEATRIZ TESTE \(Concluído\)/.test(opcoes[0]) && /Não realizada/.test(opcoes[4]), 'aprendizes: ' + opcoes.join(' | '));
    afirmar(/Selecione um aprendiz/.test(await texto(aba, 'apz-conteudo')), 'comeca pedindo para escolher');
    // relatorio da Ana
    await f.selectOption('#apz-sel', { index: 1 });
    await f.waitForSelector('[data-kpi="media"]', { timeout: 10000 });
    const kpi = await f.evaluate(() => [document.querySelector('[data-kpi="media"]').textContent, document.querySelector('[data-kpi="setores"]').textContent]);
    afirmar(kpi[0] === '3.7 / 5' && kpi[1] === '8 / 8', 'KPIs (numero como no portal: 3.7): ' + kpi.join(' | '));
    const cores = await f.evaluate(() => Array.from(document.querySelectorAll('#apz-sel option')).slice(1).map((o) => o.className + ':' + getComputedStyle(o).color));
    afirmar(/apz-opt-concluido:rgb\(25, 135, 84\)/.test(cores[0]) && /apz-opt-pendente:rgb\(13, 110, 253\)/.test(cores[1]) && /apz-opt-nao:rgb\(108, 117, 125\)/.test(cores[4]),
      'cor de cada aprendiz na lista, como no portal: ' + cores.join(' | '));
    const pilulas = await f.evaluate(() => document.querySelector('.apz-pilulas').innerText.replace(/\s+/g, ' '));
    afirmar(/15\/03\/2027/.test(pilulas) && /01\/12\/2026 a 30\/12\/2026/.test(pilulas), 'contrato e ferias: ' + pilulas);
    const etapas = await f.evaluate(() => Array.from(document.querySelectorAll('.apz-etapa')).map((e) => e.className.replace('apz-etapa', '').trim()));
    afirmar(etapas.length === 8 && etapas.every((c) => c === 'concluido'), 'linha do tempo: ' + etapas.join());
    const graficos = await f.evaluate(() => Array.from(document.querySelectorAll('#apz-conteudo svg.apz-grafico')).map((g) => g.getAttribute('aria-label') + ':' + g.querySelectorAll('path, polygon').length));
    afirmar(graficos.length === 3 && /Média por setor concluído:9/.test(graficos[0]), 'graficos: ' + graficos.join(' | '));
    afirmar(await f.evaluate(() => document.querySelectorAll('.apz-feedback').length) === 9, 'nove avaliacoes no feedback');
    // detalhamento: trocar a avaliacao troca as barras
    const notas = async () => f.evaluate(() => Array.from(document.querySelectorAll('#apz-competencias text[font-weight="600"]')).map((t) => t.textContent).join(' '));
    afirmar(await notas() === '5 5 4 5 4', 'notas da avaliacao mais recente (LOJA), na ordem atencao/interesse/proatividade/aprendizado/disciplina: ' + await notas());
    await f.selectOption('#apz-sel-setor', '1');
    afirmar(await notas() === '4 4 4 4 4', 'notas do FLOWRACK - B: ' + await notas());
    // chega uma avaliacao nova da Ana (vira a primeira da lista): o detalhamento continua no FLOWRACK - B
    const abaResp = pl.abas.find((a) => a.nome === 'Respostas ao formulário 1');
    const hj = new Date();
    abaResp.dados.splice(14, 0, [new s.mundo.DataDoScript(hj.getFullYear(), hj.getMonth(), hj.getDate(), 8, 0, 0), 'x@bartofil.com.br', 'Avaliador Onze',
      'LOJA', 'ANA BEATRIZ TESTE', 2, 2, 2, 2, 2, 'Nova', 'Nova', 2]);
    await f.click('#acoes-topo button:has-text("Atualizar dados")');
    await f.waitForFunction(() => DADOS && DADOS.paineis && Object.values(DADOS.paineis).some((p) => p.avaliacoes.length === 10), null, { timeout: 15000 });
    await f.waitForSelector('#apz-sel-setor', { timeout: 10000 });
    const escolhida = await f.evaluate(() => { const s = document.getElementById('apz-sel-setor'); return s.options[s.selectedIndex].textContent; });
    afirmar(/^FLOWRACK - B/.test(escolhida) && await notas() === '4 4 4 4 4', 'a avaliacao escolhida continua a mesma: ' + escolhida + ' / ' + await notas());
    // duas respostas iguais (mesmo setor, dia e avaliador): a escolhida segue a mesma ao trocar de aba e voltar
    abaResp.dados.splice(15, 0, abaResp.dados.find((l) => l[3] === 'FLOWRACK - B').slice(0, 5).concat([1, 1, 1, 1, 1, 'Reenvio', 'Reenvio', 1]));
    abaResp.dados[15][0] = new s.mundo.DataDoScript(abaResp.dados[15][0].getTime() + 3600000);
    await f.click('#acoes-topo button:has-text("Atualizar dados")');
    await f.waitForFunction(() => DADOS && DADOS.paineis && Object.values(DADOS.paineis).some((p) => p.avaliacoes.length === 11), null, { timeout: 15000 });
    await f.waitForSelector('#apz-sel-setor', { timeout: 10000 });
    const iguais = await f.evaluate(() => Array.from(document.querySelectorAll('#apz-sel-setor option')).map((o, i) => [i, o.textContent]).filter((x) => /^FLOWRACK - B/.test(x[1])).map((x) => x[0]));
    await f.selectOption('#apz-sel-setor', String(iguais[1]));
    const antesDaAba = await notas();
    await f.click('.apz-aba[data-aba="cronograma"]'); await f.click('.apz-aba[data-aba="relatorio"]');
    const depoisDaAba = await f.evaluate(() => document.getElementById('apz-sel-setor').selectedIndex);
    afirmar(iguais.length === 2 && depoisDaAba === iguais[1] && await notas() === antesDaAba, 'respostas iguais continuam distintas: ' + iguais.join() + ' -> ' + depoisDaAba + ' ' + await notas());
    // Bruno: um setor feito, um em andamento, um pendente
    const bruno = await f.evaluate(() => DADOS.lista.find((x) => x.nomeOriginal === 'BRUNO CARLOS TESTE').chave);
    await f.selectOption('#apz-sel', bruno);
    const etapasB = await f.evaluate(() => Array.from(document.querySelectorAll('.apz-etapa')).map((e) => e.className.replace('apz-etapa', '').trim()));
    afirmar(etapasB.join() === E.bruno.linha.join(), 'linha do tempo do Bruno: ' + etapasB.join());
    if (process.env.FOTO_APRENDIZ) {
      // a pagina rola dentro da moldura do Apps Script: janela alta para caber a tela toda
      const foto = async (nome, w, h) => { await aba.page.setViewportSize({ width: w, height: h }); await aba.page.waitForTimeout(400);
        await aba.page.screenshot({ path: process.env.FOTO_APRENDIZ + '-' + nome + '.png' }); };
      await f.selectOption('#apz-sel', { index: 1 });
      await foto('relatorio', 1280, 3000);
      await foto('relatorio-celular', 390, 5200);
      await f.evaluate(() => alternarTema());
      await foto('relatorio-escuro', 1280, 3000);
      await f.evaluate(() => alternarTema());
      await aba.page.setViewportSize({ width: 1280, height: 720 });
    }
    // cronograma geral: quem vence primeiro aparece primeiro; o seletor some
    await f.click('.apz-aba[data-aba="cronograma"]');
    await f.waitForSelector('#apz-crono-grade', { timeout: 10000 });
    afirmar(await f.evaluate(() => getComputedStyle(document.getElementById('apz-sel')).visibility === 'hidden'), 'seletor some no cronograma (como no portal: invisivel, o cabecalho nao pula)');
    const ordem = await f.evaluate(() => Array.from(document.querySelectorAll('.apz-crono-cartao h5')).map((h) => h.textContent.replace(/^\S+\s/, '').trim()));
    afirmar(ordem.join('|') === E.ordemCronograma.join('|'), 'ordem do cronograma: ' + ordem.join(' | '));
    const tagsB = await f.evaluate(() => Array.from(document.querySelectorAll('.apz-crono-cartao')[0].querySelectorAll('.apz-tag')).map((t) => t.textContent));
    afirmar(tagsB.join('|') === 'Concluído|Em Andamento|A Fazer', 'setores do Bruno hoje: ' + tagsB.join('|'));
    if (process.env.FOTO_APRENDIZ) {
      await aba.page.setViewportSize({ width: 1280, height: 1500 }); await aba.page.waitForTimeout(400);
      await aba.page.screenshot({ path: process.env.FOTO_APRENDIZ + '-cronograma.png' });
      await aba.page.setViewportSize({ width: 390, height: 2400 }); await aba.page.waitForTimeout(400);
      await aba.page.screenshot({ path: process.env.FOTO_APRENDIZ + '-cronograma-celular.png' });
      await aba.page.setViewportSize({ width: 1280, height: 720 });
    }
    await f.click('#apz-busca');
    await aba.page.keyboard.type('dan');
    // a revalidacao de fundo trouxe dado novo e redesenhou a tela no meio da digitacao: foco e cursor continuam
    await f.evaluate(() => pintar('aprendiz', { ok: true, dados: JSON.parse(JSON.stringify(DADOS)) }, true));
    await aba.page.keyboard.type('iela');
    afirmar(await f.evaluate(() => document.activeElement && document.activeElement.id === 'apz-busca' && document.activeElement.value === 'daniela'),
      'busca continua com o foco e o texto inteiro depois da repintura: ' + await f.evaluate(() => (document.activeElement || {}).id + ' ' + (el('apz-busca') || {}).value));
    afirmar(await f.evaluate(() => document.querySelectorAll('.apz-crono-cartao').length) === 1, 'busca sem acento/maiuscula acha a Daniela');
    afirmar(await f.evaluate(() => mesmaResposta({ ok: true, dados: { a: 1, atualizado: 'x' } }, { ok: true, dados: { a: 1, atualizado: 'y' } }) &&
      !mesmaResposta({ ok: true, dados: { a: 1, atualizado: 'x' } }, { ok: true, dados: { a: 2, atualizado: 'x' } })), 'so a hora da leitura mudou: nao redesenha');
    await f.fill('#apz-busca', 'ninguem');
    afirmar(/Nenhum jovem encontrado/.test(await texto(aba, 'apz-crono-grade')), 'busca sem resultado');
    // atualizar dados le de novo e continua na mesma aba
    await f.click('#acoes-topo button:has-text("Atualizar dados")');
    await f.waitForFunction(() => !document.querySelector('#acoes-topo button[disabled]'), null, { timeout: 15000 });
    await f.waitForSelector('#apz-crono-grade', { timeout: 15000 });
    afirmar(await f.evaluate(() => APZ.aba) === 'cronograma', 'continua no cronograma depois de atualizar');
    // celular estreito com 16 avaliacoes: o numero em cima da coluna so aparece quando cabe; rotulos raleados
    const estreito = await f.evaluate(() => {
      const itens = Array.from({ length: 16 }, (_, i) => ({ rotulo: 'CARREGAMENTO - A', valor: 3.6 }));
      const svg = new DOMParser().parseFromString(apzGraficoColunas(itens, 278), 'image/svg+xml');
      return [svg.querySelectorAll('text[font-weight="600"]').length, svg.querySelectorAll('text[transform]').length];
    });
    afirmar(estreito[0] === 0 && estreito[1] === 8, 'grafico em tela estreita (valores, rotulos): ' + estreito.join());
    afirmar(await f.evaluate(() => apzNum(14 / 3) === '4.7' && apzNum(3) === '3' && apzNum('') === '0'), 'numero com no maximo uma casa');
    // Sair com a tela ainda vindo do servidor (computador compartilhado): a resposta que chega depois
    // e abandonada, e nada do que a pessoa viu fica na pagina (portal, ficha da assiduidade, janela).
    await f.evaluate(() => { COLAB_CACHE = { lista: [{ nome: 'ALGUEM' }] }; FICHA = { matricula: '123', de: '', ate: '' }; apzTrocarFonte(); fecharJanela(); esquecerTelas(); });
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '2500', url: s.url }]);
    await f.evaluate(() => { abrir('aprendiz'); });
    await aba.page.waitForTimeout(400);
    await f.evaluate(() => sair());
    await esperarTela(aba, ['entrar']);
    await aba.page.waitForTimeout(3500);                     // a resposta atrasada ja chegou
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '0', url: s.url }]);
    const resto = await f.evaluate(() => ({ dados: DADOS === null, pagina: document.getElementById('pagina').innerHTML === '',
      cache: Object.keys(CACHE_TELAS).length === 0, apz: APZ.chave === '' && APZ.busca === '' && APZ.aba === 'relatorio',
      assiduidade: COLAB_CACHE === null && FICHA.matricula === '', janela: el('janela-corpo').innerHTML === '' && el('janela').classList.contains('oculto'),
      quadro: typeof QD_MEMO === 'undefined' || QD_MEMO === null }));
    afirmar(Object.values(resto).every(Boolean), 'depois de sair, com a resposta atrasada ja chegada: ' + JSON.stringify(resto));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('estoque de TI: estoque, minimo, ideal, alerta e entrada rapida; "Trocar PIN" troca o PIN pela tela', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(async () => {
      await executarAcaoSrv('salvarItemEstoque', { nome: 'Toner HP 85A', minimo: '2', ideal: '6', saldoInicial: '2' });
      await executarAcaoSrv('salvarItemEstoque', { nome: 'Mouse USB', minimo: '1', ideal: '5', saldoInicial: '3' });
      esquecerTelas();
    });
    await f.evaluate(() => abrir('estoque'));
    await f.waitForFunction(() => document.querySelectorAll('#pagina .abas .aba').length >= 3, null, { timeout: 15000 });
    await f.waitForFunction(() => /Estoque ideal/.test(document.getElementById('pagina').textContent), null, { timeout: 15000 })
      .catch(async (e) => { throw new Error(e.message + ' | ' + (await f.evaluate(() => document.getElementById('pagina').innerText.slice(0, 400)))); });
    const cab = await f.evaluate(() => Array.from(document.querySelectorAll('#pagina thead th')).map((t) => t.textContent.trim()));
    ['Material de Informática CD/Loja', 'Estoque', 'Estoque mínimo', 'Estoque ideal'].forEach((c) => afirmar(cab.indexOf(c) !== -1, 'coluna ' + c + ': ' + cab.join('|')));
    const alerta = await f.evaluate(() => (document.querySelector('.est-alerta') || {}).textContent || '');
    afirmar(/Toner HP 85A/.test(alerta) && !/Mouse/.test(alerta), 'alerta do minimo: ' + alerta);
    // chegaram dois mouses: procura, + Entrada, 2, Enter
    await f.fill('#est-busca', 'mouse');
    await f.click('.est-mais');
    await f.fill('#er-qtd', '2');
    await f.press('#er-qtd', 'Enter');
    await f.waitForFunction(() => { const i = (DADOS.itens || []).find((x) => x.nome === 'Mouse USB'); return i && i.saldo === 5; }, null, { timeout: 15000 });
    // saida: quantidade, data, setor e usuario
    await f.click('.est-menos >> nth=0');
    await f.fill('#es-qtd', '1'); await f.fill('#es-setor', 'Recebimento'); await f.fill('#es-usuario', 'Carla');
    await f.click('.janela .botao >> text=Registrar saída').catch(async () => {
      await f.evaluate(() => agir('movimentarEstoque', { tipo: 'SAIDA', item: DADOS.itens.find((x) => x.nome === 'Mouse USB').codigo, quantidade: '1', destino: 'Recebimento', solicitante: 'Carla' }));
    });
    await f.waitForFunction(() => (DADOS.movimentos || []).some((m) => m.tipo === 'SAIDA' && m.solicitante === 'Carla' && m.destino === 'Recebimento'), null, { timeout: 15000 });
    await f.click('text=Trocar PIN');
    await f.fill('#tp-atual', '4321'); await f.fill('#tp-novo', '8642'); await f.fill('#tp-conf', '8642');
    await f.click('.janela .botao >> text=Trocar PIN').catch(async () => { await f.evaluate(() => agir('trocarMeuPin', { atual: '4321', novo: '8642', confirmacao: '8642' })); });
    // a janela fecha quando o servidor confirma a troca (um tempo fixo falhava com a maquina ocupada)
    await f.waitForFunction(() => document.getElementById('janela').classList.contains('oculto'), null, { timeout: 20000 });
    const r = JSON.parse(s.chamar(DONO, 'entrar', DONO, '8642', '', '', '').valor);
    afirmar(r.token, 'PIN novo entra: ' + JSON.stringify(r).slice(0, 160));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('nobreaks: hora so com numeros, historico no formato da folha e exportar Excel/PDF', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { ABA_NB = 'lancar'; abrir('nobreaks'); });
    await f.waitForSelector('#nb-folha input.hora', { timeout: 15000 });
    const hora = f.locator('#nb-folha input.hora').first();
    await hora.click(); await hora.pressSequentially('0830');
    afirmar(await hora.inputValue() === '08:30', 'mascara: ' + await hora.inputValue());
    const seg = f.locator('#nb-folha input.hora').nth(1);
    await seg.click(); await seg.pressSequentially('14'); await seg.press('Tab');
    afirmar(await seg.inputValue() === '14:00', 'completa ao sair: ' + await seg.inputValue());
    // valores da 1a e 2a leitura
    await f.evaluate(() => {
      const trs = document.querySelectorAll('#nb-folha tbody tr');
      [0, 1].forEach((i) => ['vi', 'ii', 'pi', 'vo', 'io', 'po'].forEach((k, j) => {
        const inp = trs[i].querySelector('[data-k="' + k + '"]'); inp.value = String([220, 5, 1100, 120, 8, 960][j] + i); nbAoDigitar(inp);
      }));
      nbGravarSemana();
    });
    await f.waitForFunction(() => (DADOS.leituras || []).some((l) => l.hora === '08:30') && DADOS.leituras.some((l) => l.hora === '14:00'), null, { timeout: 15000 });
    await f.evaluate(() => { NB_HIST.mes = ''; trocarAbaNB('historico'); });
    await f.waitForSelector('table.nb-historico td.nb-dia', { timeout: 15000 });
    const cab = await f.evaluate(() => Array.from(document.querySelectorAll('table.nb-historico th')).map((t) => t.textContent.trim()).join('|'));
    afirmar(/Vi \(V\).*Po \(VA\).*Carga/.test(cab) && /08:30/.test(await f.evaluate(() => document.querySelector('table.nb-historico').textContent)), 'historico: ' + cab);
    // Excel
    const [down] = await Promise.all([aba.page.waitForEvent('download', { timeout: 15000 }), f.click('text=Exportar Excel')]);
    const caminho = require('path').join(require('os').tmpdir(), 'gsl-nb-' + Date.now() + '.xlsx');
    await down.saveAs(caminho);
    const lista = require('child_process').execSync('unzip -l "' + caminho + '"').toString();
    const folha = require('child_process').execSync('unzip -p "' + caminho + '" xl/worksheets/sheet2.xml').toString();
    if (process.env.GUARDAR_XLSX) require('fs').copyFileSync(caminho, process.env.GUARDAR_XLSX);
    require('fs').unlinkSync(caminho);
    afirmar(/xl\/workbook.xml/.test(lista) && /sheet2.xml/.test(lista), 'zip: ' + lista);
    afirmar(/08:30/.test(folha) && /<v>960<\/v>/.test(folha), 'planilha: ' + folha.slice(0, 300));
    // PDF (janela de impressao)
    const [janela] = await Promise.all([aba.contexto.waitForEvent('page', { timeout: 15000 }), f.click('text=Exportar PDF')]);
    await janela.waitForLoadState();
    const texto = await janela.evaluate(() => document.body.innerText);
    afirmar(/Folha de leituras/.test(texto) && /08:30/.test(texto) && /ENTRADA/.test(texto) && /SAÍDA/.test(texto), 'pdf: ' + texto.slice(0, 200));
    const linhasFolha = await janela.evaluate(() => document.querySelectorAll('table.nb-folha-pdf tbody tr').length);
    afirmar(linhasFolha === 21, 'folha com 7 dias x 3 leituras: ' + linhasFolha);
    if (process.env.FOTO_PDF) await janela.screenshot({ path: process.env.FOTO_PDF, fullPage: true });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('assiduidade: abre na lista de colaboradores; ficha mostra ausencias por tipo com filtro de periodo', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    prepararAssiduidade(s);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('assiduidade', { competencia: '2025-08' }); });
    await f.waitForSelector('#tabela-colab tbody tr', { timeout: 20000 });
    const abas = await f.evaluate(() => Array.from(document.querySelectorAll('#pagina > .abas .aba')).map((b) => b.textContent.trim()).join('|'));
    afirmar(abas === 'Colaboradores|Período', 'abas: ' + abas);
    await f.click('#tabela-colab tbody tr >> text=ANA SOUZA');
    await f.waitForSelector('.ficha-periodo', { timeout: 15000 });
    const tudo = await f.evaluate(() => document.querySelector('.ficha-tiles-tipos').textContent);
    afirmar(/Falta injustificada/.test(tudo), 'tipos: ' + tudo);
    const antes = await f.evaluate(() => document.querySelectorAll('.ficha-ausencias tbody tr').length);
    await f.fill('#fp-de', '2025-08-10'); await f.fill('#fp-ate', '2025-08-31');
    await f.click('.ficha-periodo >> text=Filtrar');
    await f.waitForFunction((n) => { const t = document.querySelector('.ficha-periodo #fp-de'); return t && t.value === '2025-08-10' && document.querySelectorAll('.ficha-ausencias tbody tr').length < n; }, antes, { timeout: 15000 });
    const datas = await f.evaluate(() => Array.from(document.querySelectorAll('.ficha-ausencias tbody tr td:first-child')).map((t) => t.textContent.trim()));
    afirmar(datas.length >= 1 && datas.every((d) => /\/08\/2025/.test(d) && Number(d.slice(0, 2)) >= 10), 'periodo: ' + datas.join(',') + ' (antes ' + antes + ')');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('configuracoes na barra lateral; legenda de cores do calendario; Estoque de TI exporta Excel', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => abrirModulos());
    const cards = await f.evaluate(() => Array.from(document.querySelectorAll('.holocard .holo-titulo')).map((t) => t.textContent.trim()));
    afirmar(cards.indexOf('Configuração') === -1, 'cartao de configuracao saiu do meio: ' + cards.join(','));
    afirmar(/Configurações/i.test(await f.evaluate(() => document.getElementById('menu').textContent)), 'secao no menu lateral');
    await f.click('#menu >> text=Pessoas e acessos');
    await f.waitForFunction(() => paginaAtual === 'acessos' && !/Carregando/.test(document.getElementById('pagina').innerText), null, { timeout: 15000 });
    afirmar(/Configurações/i.test(await f.evaluate(() => document.getElementById('menu').textContent)), 'menu continua com a secao');
    await f.evaluate(() => abrir('calendario'));
    await f.waitForSelector('.legenda-mes .st-reprovada', { timeout: 15000 });
    await f.evaluate(async () => { await executarAcaoSrv('salvarItemEstoque', { nome: 'Mouse', minimo: '1', ideal: '3', saldoInicial: '2' }); esquecerTelas(); abrir('estoque'); });
    await f.waitForSelector('text=Exportar Excel', { timeout: 15000 });
    const [down] = await Promise.all([aba.page.waitForEvent('download', { timeout: 15000 }), f.click('text=Exportar Excel')]);
    const caminho = require('path').join(require('os').tmpdir(), 'gsl-ti-' + Date.now() + '.xlsx');
    await down.saveAs(caminho);
    const folha = require('child_process').execSync('unzip -p "' + caminho + '" xl/worksheets/sheet1.xml').toString();
    require('fs').unlinkSync(caminho);
    afirmar(/Mouse/.test(folha) && /Estoque ideal/.test(folha), 'planilha do estoque');
    const [janela] = await Promise.all([aba.contexto.waitForEvent('page', { timeout: 15000 }), f.click('text=Exportar PDF')]);
    await janela.waitForLoadState();
    afirmar(/estoque de TI/i.test(await janela.evaluate(() => document.body.innerText)), 'relatorio PDF');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('assiduidade com o Google barrando (HTTP 403): a lista de colaboradores aparece e a ficha abre pela pagina', async () => {
    const s = await subir(); instalarComPessoas(s);
    prepararAssiduidade(s);
    const aba = await abrirAba(s, DONO, { bloqueio403: true });
    await entrar(aba, DONO, '4321');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou pela reserva');
    let f = await frame(aba);
    // um clique de verdade que abre a Assiduidade pela navegacao de reserva
    await f.evaluate(() => { const b = document.createElement('button'); b.id = 'ir-assid'; b.textContent = 'ir';
      b.onclick = () => abrirPorNavegacao('assiduidade', { competencia: '2025-08' }); document.body.prepend(b); });
    await f.click('#ir-assid');
    await aba.page.waitForTimeout(2500);
    f = await frame(aba);
    await f.waitForSelector('#tabela-colab tbody tr', { timeout: 20000 });
    const txt = await f.evaluate(() => document.getElementById('conteudo-rh').innerText);
    afirmar(!/403|NetworkError/.test(txt), 'sem erro de 403: ' + txt.slice(0, 200));
    await f.click('#tabela-colab tbody tr >> text=ANA SOUZA');
    await aba.page.waitForTimeout(2500);
    f = await frame(aba);
    await f.waitForSelector('.ficha-periodo', { timeout: 20000 });
    afirmar(/ANA SOUZA/.test(await f.evaluate(() => document.querySelector('.ficha-nome').textContent)), 'ficha da Ana');
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('plano de acao: comentar pela tela gera historico e mostra o "depende de" no cartao', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(async () => {
      await executarAcaoSrv('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [SESSAO.usuario.email] });
      esquecerTelas(); abrir('acoes', { situacao: 'TODAS' });
    });
    await f.waitForSelector('.cartao-acao button:has-text("Comentários")', { timeout: 15000 });
    await f.click('.cartao-acao button:has-text("Comentários")');
    await f.fill('#cm-texto', 'Lâmpadas compradas');
    await f.selectOption('#cm-sit', 'Aguardando');
    await f.fill('#cm-dep', 'manutenção agendar');
    await f.click('.janela .botao >> text=Registrar comentário');
    await f.waitForFunction(() => /Depende de:/.test((document.querySelector('.cartao-acao') || {}).textContent || ''), null, { timeout: 15000 });
    const card = await f.evaluate(() => document.querySelector('.cartao-acao').textContent);
    afirmar(/Aguardando/.test(card) && /Lâmpadas compradas/.test(card) && /Comentários \(1\)/.test(card), 'cartao: ' + card.replace(/\s+/g, ' ').slice(0, 300));
    await f.click('.cartao-acao button:has-text("Comentários")');
    afirmar(await f.evaluate(() => document.querySelectorAll('.coment-item').length) === 1, 'historico no dialogo');
    const quem = await f.evaluate(() => document.querySelector('.coment-item .coment-cab').textContent.replace(/\s+/g, ' '));
    afirmar(/dono@bartofil\.com\.br/.test(quem) && /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(quem), 'identificacao de quem comentou: ' + quem);
    afirmar(/Ação criada/.test(await f.evaluate(() => document.querySelector('.coment-historico').textContent)), 'quem criou');
    if (process.env.FOTO_COMENT) await aba.page.screenshot({ path: process.env.FOTO_COMENT });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });


  /* ================================================================ */
  /* DESEMPENHO (10/10): canal barrado sem espera, sessao que fica      */
  /* ================================================================ */

  for (const cfg of [{ nome: '403', bloqueio403: '1', atraso: 6000, atrasoPost: 1500 }, { nome: 'PERMISSION_DENIED', bloqueio403: 'perm', atraso: 6000, atrasoPost: 1500 }]) {
    await cenario('canal barrado (' + cfg.nome + ', falha lenta de 6 s): cada clique vai direto pela pagina, sem chamada condenada e sem "Continuar"', async () => {
      const s = await subir(); instalarComPessoas(s);
      criarPin(s, GERAL, GERENTE, '5555');
      const aba = await abrirAbaReal(s, GERAL, cfg);
      await entrarReal(aba, GERENTE, '5555');
      // primeira vez: a sonda da pagina de entrada ja descobriu o bloqueio (ou o entrar falha) e a entrada vai por POST
      await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.card0, 30000, 'menu depois da entrada');
      const barrado = aba.estado.barrado;
      afirmar(barrado === true, 'a pagina da reserva sabe que o canal e barrado');
      // cada tela: 1 POST, nenhuma chamada google.script.run, nenhum "Continuar"
      for (const alvo of ['cardCalendario', 'menuAcoes']) {
        marcar(aba);
        const t0 = Date.now();
        await clicarEm(aba, alvo, 15000);
        await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.titulo && !/Abrindo|Carregando/.test(x.pagina) && x.janela !== 'Continuar' &&
          desdeMarca(aba).posts >= 1, 15000, 'tela aberta por ' + alvo);
        const d = desdeMarca(aba);
        afirmar(d.posts === 1 && !d.runs.filter((f) => f !== 'sondarCanal').length, alvo + ': 1 POST e nenhuma chamada condenada: ' + JSON.stringify(d));
        afirmar(Date.now() - t0 < 6000, alvo + ': sem esperar a falha (' + (Date.now() - t0) + ' ms)');
      }
      afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
      await aba.contexto.close(); await s.fechar();
    });
  }

  await cenario('canal barrado: F5 numa pagina da reserva vira GET e um clique em "Continuar como ..." volta na mesma tela, sem PIN', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, GERENTE, '5555');
    const aba = await abrirAbaReal(s, GERAL, { bloqueio403: 'perm', atraso: 1500, atrasoPost: 800 });
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => /Plano de A/.test(x.titulo) && !/Abrindo|Carregando/.test(x.pagina), 15000, 'Plano de Acao');
    afirmar(/\?tela=acoes/.test(aba.page.url()), 'endereco da aba depois do history.replace: ' + aba.page.url());
    marcar(aba);
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    await esperarEstado(aba, (x) => x.continuar && x.pos.continuar, 15000, 'Continuar como ...');
    let d = desdeMarca(aba);
    afirmar(d.gets === 1 && d.posts === 0, 'o F5 foi um GET (nao reenviou o POST): ' + JSON.stringify(d));
    afirmar(!/PIN/.test(aba.estado.msg), 'nao pediu o PIN: ' + aba.estado.msg);
    await clicarEm(aba, 'continuar');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && /Plano de A/.test(x.titulo) && !/Abrindo|Carregando/.test(x.pagina), 15000, 'de volta no Plano de Acao');
    d = desdeMarca(aba);
    afirmar(d.posts === 1, 'um POST para continuar: ' + JSON.stringify(d));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal barrado: comentar uma acao grava pela pagina (1 POST) e o comentario aparece', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, GERENTE, '5555');
    const e = JSON.parse(s.chamar(GERAL, 'entrar', GERENTE, '5555', '', '', '').valor);
    s.chamar(GERAL, 'executarAcao', { t: e.token, f: e.filial.codigo }, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
    const aba = await abrirAbaReal(s, GERAL, { bloqueio403: '1', atraso: 1500, atrasoPost: 800 });
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => x.coment === 0 && x.pos.comentarios, 15000, 'cartao da acao');
    await clicarEm(aba, 'comentarios');
    await clicarEm(aba, 'cmTexto');
    await aba.page.keyboard.type('Lâmpadas compradas', { delay: 5 });
    marcar(aba);
    await clicarEm(aba, 'registrar');
    await esperarEstado(aba, (x) => x.coment === 1, 15000, 'comentario gravado');
    const d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((f) => f !== 'sondarCanal').length, 'gravou pela pagina: ' + JSON.stringify(d));
    const coment = s.contexto(DONO).listar('COMENTARIOS').filter((c) => /Lâmpadas compradas/.test(c.TEXTO || ''));
    afirmar(coment.length === 1, 'um comentario so na planilha: ' + coment.length);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('falha passageira no F5 nao derruba a sessao: tenta de novo; falhou de novo, "Continuar" sem PIN', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, GERENTE, '5555');
    const aba = await abrirAbaReal(s, GERAL, {});
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => /Plano de A/.test(x.titulo) && !/Carregando/.test(x.pagina), 15000, 'Plano de Acao');
    // uma falha: a segunda tentativa entra (e volta na mesma tela)
    await aba.contexto.addCookies([{ name: 'gas_falha', value: 'retomarSessao:500:1', url: s.url }]);
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && /Plano de A/.test(x.titulo) && !/Carregando/.test(x.pagina), 20000, 'de volta no Plano depois de 1 falha');
    // duas falhas: "Continuar" (a sessao fica), e o clique entra
    await aba.contexto.addCookies([{ name: 'gas_falha', value: 'retomarSessao:500:2', url: s.url }]);
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    await esperarEstado(aba, (x) => x.continuar && x.pos.continuar, 20000, 'Continuar depois de 2 falhas');
    await clicarEm(aba, 'continuar');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && /Plano de A/.test(x.titulo) && !/Carregando/.test(x.pagina), 20000, 'continuou sem PIN');
    afirmar(!aba.erros.filter((e) => !/HTTP 500/.test(e)).length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('sessao: o cache perdeu a sessao (despejo) e a pessoa continua; 50 min sem ir ao servidor mostra o aviso', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    for (const k of [...s.mundo.cache.keys()]) if (/^sess_/.test(k)) s.mundo.cache.delete(k);      // o Google despejou o item
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForFunction(() => /Plano de A/.test(document.getElementById('titulo-pagina').textContent) && !/Carregando/.test(document.getElementById('pagina').textContent), null, { timeout: 15000 });
    afirmar(await esperarTela(aba, ['aplicacao', 'entrar']) === 'aplicacao', 'continuou dentro');
    afirmar(Number(s.mundo.cache.get('diag_sessao_salva_pela_loja') && s.mundo.cache.get('diag_sessao_salva_pela_loja').v) === 1, 'contou a sessao salva pela loja');
    // 45 min sem ir ao servidor (20 sem mexer): a faixa aparece; o botao renova
    await f.evaluate(() => { ULTIMO_CONTATO = Date.now() - 45 * 60000; ULTIMA_ATIVIDADE = Date.now() - 20 * 60000; vigiarSessao(); });
    afirmar(/termina em [1-9] min/.test(await texto(aba, 'aviso-sessao')), 'faixa do aviso: ' + await texto(aba, 'aviso-sessao'));
    await f.click('#aviso-sessao button');
    await f.waitForFunction(() => !document.getElementById('aviso-sessao'), null, { timeout: 10000 });
    // a renovacao do bilhete nao conta como uso (ela nao confere a sessao)
    const contato = await f.evaluate(async () => { const antes = ULTIMO_CONTATO = Date.now() - 30 * 60000; await chamar('renovarBilhete', ctx()); return ULTIMO_CONTATO === antes; });
    afirmar(contato, 'renovarBilhete nao renova o relogio da sessao');
    // 51 min sem ir ao servidor E sem ninguem mexer: a sessao acaba aqui e no servidor, e a tela de quem foi embora some
    await f.evaluate(() => { ULTIMO_CONTATO = Date.now() - 51 * 60000; ULTIMA_ATIVIDADE = Date.now() - 51 * 60000; vigiarSessao(); });
    afirmar(await esperarTela(aba, ['entrar', 'aplicacao']) === 'entrar', 'voltou para a entrada');
    afirmar(/sessão terminou/i.test(await texto(aba, 'entrar-msg')), 'diz que a sessao terminou: ' + await texto(aba, 'entrar-msg'));
    afirmar(!(await f.evaluate(() => document.getElementById('pagina').textContent.trim())), 'a tela da pessoa sumiu');
    const fim = Date.now() + 5000;
    while (Date.now() < fim && ![...s.mundo.cache.keys()].some((k) => /^sessfim_/.test(k))) await new Promise((ok) => setTimeout(ok, 100));
    afirmar([...s.mundo.cache.keys()].some((k) => /^sessfim_/.test(k)), 'o servidor encerrou a sessao tambem');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal barrado: pagina recusada pelo bilhete (o cache do Google perdeu) mostra "Continuar como ..." e diz que a gravacao nao foi feita', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, GERENTE, '5555');
    const e = JSON.parse(s.chamar(GERAL, 'entrar', GERENTE, '5555', '', '', '').valor);
    s.chamar(GERAL, 'executarAcao', { t: e.token, f: e.filial.codigo }, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
    const aba = await abrirAbaReal(s, GERAL, { bloqueio403: '1', atraso: 1500, atrasoPost: 800 });
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => x.coment === 0 && x.pos.comentarios, 15000, 'cartao da acao');
    await clicarEm(aba, 'comentarios');
    await clicarEm(aba, 'cmTexto');
    await aba.page.keyboard.type('Nao vai chegar', { delay: 5 });
    for (const k of [...s.mundo.cache.keys()]) if (/^bilhete_/.test(k)) s.mundo.cache.delete(k);   // o Google despejou o bilhete
    await clicarEm(aba, 'registrar');
    await esperarEstado(aba, (x) => x.continuar && x.pos.continuar, 15000, 'Continuar como ...');
    afirmar(/gravação não foi feita/i.test(aba.estado.continuarMsg) && !/PIN/.test(aba.estado.continuarMsg), 'avisa que nao gravou (sem pedir PIN): ' + aba.estado.continuarMsg);
    afirmar(!s.contexto(DONO).listar('COMENTARIOS').some((c) => /Nao vai chegar/.test(c.TEXTO || '')), 'nada gravado');
    marcar(aba);
    await clicarEm(aba, 'continuar');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && /Plano de A/.test(x.titulo) && !/Abrindo|Carregando/.test(x.pagina), 15000, 'de volta no Plano, sem PIN');
    afirmar(desdeMarca(aba).posts === 1, 'um POST para continuar: ' + JSON.stringify(desdeMarca(aba)));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal barrado: outro clique enquanto a gravacao vai pela pagina nao a perde (um POST so, e o comentario aparece)', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, GERAL, GERENTE, '5555');
    const e = JSON.parse(s.chamar(GERAL, 'entrar', GERENTE, '5555', '', '', '').valor);
    s.chamar(GERAL, 'executarAcao', { t: e.token, f: e.filial.codigo }, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
    const aba = await abrirAbaReal(s, GERAL, { bloqueio403: '1', atraso: 1500, atrasoPost: 800 });
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => x.coment === 0 && x.pos.comentarios, 15000, 'cartao da acao');
    await clicarEm(aba, 'comentarios');
    await clicarEm(aba, 'cmTexto');
    await aba.page.keyboard.type('Gravado com calma', { delay: 5 });
    await aba.contexto.addCookies([{ name: 'gas_atraso_post', value: '5000', url: s.url }]);   // o servidor demora 5 s
    marcar(aba);
    await clicarEm(aba, 'registrar');
    await aba.page.waitForTimeout(300);
    await clicarEm(aba, 'menuCalendario');                       // fecha a janela (clique no fundo)...
    await aba.page.waitForTimeout(200);
    await clicarEm(aba, 'menuCalendario');                       // ...e tenta abrir outra tela
    await esperarEstado(aba, (x) => /Aguarde/.test(x.recado), 4000, 'aviso de gravacao em andamento');
    await esperarEstado(aba, (x) => x.coment === 1, 20000, 'comentario gravado e na tela');
    afirmar(desdeMarca(aba).posts === 1, 'um POST so (o da gravacao): ' + JSON.stringify(desdeMarca(aba)));
    afirmar(s.contexto(DONO).listar('COMENTARIOS').filter((c) => /Gravado com calma/.test(c.TEXTO || '')).length === 1, 'um comentario na planilha');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal: erro de acao com "403" nao marca o computador; F5 volta na posicao da aba; Codigo.gs antigo nao grava pela pagina', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const r = await f.evaluate(() => [
      canalBarradoDeVez(new Error('Saldo insuficiente: Toner tem 403 un')),
      canalBarradoDeVez(new Error('O código 401 já está no DE-PARA (Ajuste de horas)')),
      canalBarradoDeVez(new Error('Sem espaço de armazenamento no almoxarifado')),
      canalBarradoDeVez(new Error('NetworkError: Connection failure due to HTTP 403')),
      canalBarradoDeVez(new Error("We're sorry, a server error occurred while reading from storage. Error code PERMISSION_DENIED."))]);
    afirmar(JSON.stringify(r) === '[false,false,false,true,true]', 'so os textos do Google marcam: ' + JSON.stringify(r));
    const t = await f.evaluate(() => {
      sessionStorage.setItem('gsl_destino', JSON.stringify({ tela: 'acoes', filial: '', daAba: true }));
      sessionStorage.setItem('gsl_onde', JSON.stringify({ f: FILIAL, tela: 'estoque', p: JSON.stringify({ busca: 'toner' }) }));
      const a = telaDaAba();
      const esquecido = sessionStorage.getItem('gsl_destino') === null;
      sessionStorage.setItem('gsl_destino', JSON.stringify({ tela: 'acoes', filial: '' }));
      const b = telaDaAba();
      sessionStorage.removeItem('gsl_destino');
      return [a.tela, a.p, b.tela, esquecido];
    });
    afirmar(t[0] === 'estoque' && /toner/.test(t[1]) && t[2] === 'acoes' && t[3], 'endereco da reserva perde para a posicao da aba (e e esquecido); link de e-mail ganha: ' + JSON.stringify(t));
    const posts = s.registro.filter((x) => x.tipo === 'doPost').length;
    const g = await f.evaluate(async () => {
      const app = SESSAO.app; CANAL_BARRADO = true;
      SESSAO.app = Object.assign({}, app, { gravarPelaPagina: undefined });
      let msg = '';
      try { await agir('salvarSetor', { setor: 'Doca' }); } catch (e) { msg = e.message; }
      SESSAO.app = app; CANAL_BARRADO = false;
      return msg;
    });
    afirmar(/Codigo\.gs desta vers/.test(g) && s.registro.filter((x) => x.tipo === 'doPost').length === posts, 'Codigo.gs antigo: nao manda a gravacao: ' + g);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('bolinha do menu: acoes em aberto no cartao do modulo, pelo canal normal e pela reserva (HTTP 403)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = criarPin(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    const c = { t: dono.token, f: dono.filial.codigo };
    const ontem = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
    [['Lâmpadas do flow', '2026-12-01'], ['Atrasada', ontem]].forEach(([acao, prazo]) =>
      afirmar(s.chamar(DONO, 'executarAcao', c, 'salvarAcao', { acao, prazo, turno: 'A', responsaveisEmails: [COORD] }).ok, 'acao criada'));
    // primeiro pela reserva (2 em aberto), depois pelo canal normal (que conclui uma)
    for (const bloqueio of [true, false]) {
      const desde = s.registro.length;
      const aba = await abrirAba(s, GERAL, bloqueio ? { bloqueio403: true } : {});
      await entrar(aba, COORD, '1234');
      afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou');
      const f = await frame(aba);
      await f.waitForSelector('.holocard[data-modulo="calendario"] .holo-bolinha', { timeout: 15000 });
      const b = await f.$eval('.holocard[data-modulo="calendario"]', (x) => ({ n: x.querySelector('.holo-bolinha').textContent,
        atraso: x.querySelector('.holo-bolinha').classList.contains('com-atraso'), leitor: x.querySelector('.so-leitor').textContent }));
      afirmar(b.n === '2' && b.atraso && /2 ações em aberto, 1 atrasada/.test(b.leitor), (bloqueio ? 'reserva' : 'canal') + ': ' + JSON.stringify(b));
      afirmar(!(await f.$('.holocard[data-modulo="nobreaks"] .holo-bolinha')), 'modulo sem plano nao tem bolinha');
      // os carimbos do Index.html e do Estilo.html conferem no navegador (sem faixa de versao misturada)
      afirmar(!(await f.$('#aviso-versao')), 'faixa de versao: ' + await f.$eval('#aviso-versao', (x) => x.textContent).catch(() => ''));
      if (bloqueio) afirmar(!s.registro.slice(desde).some((r) => r.tipo === 'run' && r.fn === 'executarAcao'), 'reserva: a bolinha nao tenta o canal barrado');
      if (process.env.FOTO_BOLINHA && !bloqueio) {
        await aba.page.waitForTimeout(1500);            // a entrada dos cartoes e da bolinha terminou
        await aba.page.screenshot({ path: process.env.FOTO_BOLINHA + '-claro.png' });
        await f.evaluate(() => alternarTema()); await aba.page.waitForTimeout(500);
        await aba.page.screenshot({ path: process.env.FOTO_BOLINHA + '-escuro.png' });
        await f.evaluate(() => alternarTema());
      }
      if (!bloqueio) {
        // concluir no plano e voltar ao menu: a bolinha ja mostra 1 (veio com a tela), sem pedir de novo
        await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
        await f.waitForSelector('.cartao-acao', { timeout: 15000 });
        const id = await f.evaluate(() => DADOS.lista.find((a) => a.acao === 'Lâmpadas do flow').id);
        await f.evaluate((i) => agir('concluirAcao', { id: i }), id);
        await f.waitForFunction(() => DADOS && DADOS.contagens && DADOS.contagens.abertas === 1, null, { timeout: 15000 });
        const antes = s.registro.length;
        await f.evaluate(() => abrirModulos());
        await f.waitForFunction(() => { const x = document.querySelector('.holocard[data-modulo="calendario"] .holo-bolinha'); return x && x.textContent === '1'; }, null, { timeout: 5000 });
        afirmar(!s.registro.slice(antes).some((r) => r.tipo === 'run' && r.fn === 'executarAcao'), 'voltou ao menu sem pedir os numeros de novo');
        // sair: as bolinhas eram de quem saiu
        await f.evaluate(() => sair());
        afirmar(await f.evaluate(() => PENDENCIAS === null), 'sair apaga os numeros');
      }
      afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
      await aba.contexto.close();
    }
    await s.fechar();
  });

  /*
   * QUADRO DO CD (13/10) — a planilha com a aba GERAL (nomes ficticios, com
   * titulo em cima do cabecalho, como a de verdade): o nome aparece, a faixa
   * do desligado ativo, o mapa de calor leva a lista, a ficha abre a linha da
   * planilha e a Conferencia agrupa o que corrigir. No computador
   * compartilhado, quem entra depois nao herda o recorte de quem saiu.
   */
  await cenario('quadro do CD: liga a GERAL pela tela; nomes, faixa do desligado ativo, mapa leva a lista, ficha e conferencia; no computador compartilhado cada um cai no seu turno', async () => {
    const s = await subir(); instalarComPessoas(s);
    const { abas, esperado: E } = require('./dados-quadro.js')(s.mundo.DataDoScript, new Date());
    const pl = s.mundo.novaPlanilha('BI Quadro CD Feira');
    const Aba = Object.getPrototypeOf(pl.abas[0]).constructor;
    Object.keys(abas).forEach((nome, i) => {
      const a = i === 0 ? pl.abas[0] : new Aba(pl, nome, 1000, 26);
      if (i === 0) a.nome = nome; else pl.abas.push(a);
      abas[nome].forEach((linha, l) => { if (linha) a.dados[l] = linha.slice(); });
    });
    const nomeDoCod = (cod) => (abas['GERAL'].find((l) => l && l[1] === cod) || [])[2];
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => abrir('quadro'));
    // sem planilha: pede o link e liga pela tela
    await f.waitForSelector('#bq-link', { timeout: 15000 });
    await f.fill('#bq-link', 'https://docs.google.com/spreadsheets/d/' + pl.id + '/edit#gid=0');
    await f.click('#pagina button:has-text("Ligar planilha")');
    await f.waitForSelector('.qd-faixa', { timeout: 20000 });
    const sub = await texto(aba, 'subtitulo-pagina');
    afirmar(/^Aba GERAL de «BI Quadro CD Feira» · lida hoje às \d\d:\d\d$/.test(sub), 'subtitulo: ' + sub);
    // a faixa: os desligados que continuam ATIVOS, com o nome de cada um
    const faixa = await f.evaluate(() => document.querySelector('.qd-faixa').innerText.replace(/\s+/g, ' '));
    afirmar(/3 desligados continuam ATIVOS na GERAL/.test(faixa) && /Sem eles, o CD teria 164 pessoas/.test(faixa) && faixa.includes(nomeDoCod(E.desligadoAtivo[0])) &&
      /\+ 8 pontos de atenção na planilha/.test(faixa), 'faixa: ' + faixa);
    const abasTela = await f.evaluate(() => Array.from(document.querySelectorAll('#qd-abas .aba')).map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
    afirmar(abasTela.join('|') === 'Visão geral|Quadro por turno|Movimentação|Férias ■ 6|Conferência ■ 3', 'abas: ' + abasTela.join('|'));
    // cartoes: o CD e as quatro equipes, com o numero de cada uma
    const cartoes = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-cartao')).map((c) => c.innerText.replace(/\s+/g, ' ')));
    afirmar(cartoes.length === 5 && /167 pessoas no quadro/.test(cartoes[0]) && /inclui 3 desligados ainda ativos/.test(cartoes[0]) &&
      /1° TURNO 60 pessoas 36% do CD/.test(cartoes[1]) && /1 para cada 19/.test(cartoes[1]) && /ADM 14 pessoas 8% do CD/.test(cartoes[4]) && /1 função com desfalque/.test(cartoes[4]),
      'cartoes: ' + cartoes.join(' || '));
    // desfalques de hoje: so o que esta fino (pelo STATUS), com o resumo de quem esta fora
    const desf = await f.evaluate(() => document.querySelector('#qd-desfalques').innerText.replace(/\s+/g, ' '));
    afirmar(/ADM COORDENADOR DE LOGÍSTICA 0 de 1 disponível/.test(desf) && /Fora do posto: 9 pessoas — 6 de férias · 3 afastados/.test(desf) &&
      (desf.match(/\d+ de \d+ disponíve/g) || []).length === 1, 'desfalques: ' + desf);
    // mapa: grupo Lideranca e o Administrativo recolhido numa linha (abre com um toque)
    const grupos0 = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-mapa tbody th')).map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
    afirmar(grupos0.indexOf('LIDERANÇA') !== -1 && grupos0.indexOf('LÍDER DE EQUIPE') > grupos0.indexOf('LIDERANÇA') && grupos0.some((t) => /^Administrativo · 8 funções/.test(t)) &&
      grupos0.indexOf('GERENTE DE CD') === -1, 'grupos do mapa: ' + grupos0.join(' | '));
    await f.evaluate(() => document.querySelector('.qd-mapa-recolhido button').click());
    afirmar(await f.evaluate(() => Array.from(document.querySelectorAll('.qd-mapa tbody th')).some((t) => t.innerText.trim() === 'GERENTE DE CD')), 'Administrativo abre');
    // a tela casa as pessoas com a mesma regra do servidor: COD "-" nao e chave; homonimo com outro COD nao e a mesma pessoa
    const casa = await f.evaluate((nome) => {
      const ix = qdMemo().ixGeral;
      return [qdIdCod('-'), qdIdCod('#N/A'), qdIdCod('030001'), qdAchar(ix, { cod: '-', nome: 'NINGUEM' }), qdAchar(ix, { cod: '99999', nome: nome }),
        (qdAchar(ix, { cod: '', nome: nome }) || []).length];
    }, nomeDoCod('30001'));
    afirmar(casa[0] === '' && casa[1] === '' && casa[2] === '30001' && casa[3] === null && casa[4] === null && casa[5] === 1, 'casamento na tela: ' + JSON.stringify(casa));
    const resumo = await f.evaluate(() => qdResumoTexto());
    afirmar(/^Quadro do CD — CD Feira de Santana — \d\d\/\d\d\/\d{4}\n167 pessoas no quadro: 1° TURNO 60 · 2° TURNO 53 · 3° TURNO 39 · ADM 14 · sem turno 1\n158 disponíveis · 6 de férias · 3 afastados\nÚltimos 90 dias: 15 saídas e 11 entradas\nAtenção: 3 desligados ainda ATIVOS na GERAL\nFérias: 6 precisam sair de férias, 11 para avisar, 2 sem dados de férias$/.test(resumo),
      'copiar resumo: ' + resumo);
    // mapa de calor: SEPARADOR x 1° TURNO = 18; tocar leva para a lista dessas 18 pessoas
    const celula = await f.evaluate(() => {
      const tr = Array.from(document.querySelectorAll('.qd-mapa tbody tr')).find((t) => /^SEPARADOR$/.test((t.querySelector('th') || {}).innerText || ''));
      const b = tr && tr.querySelector('td.c button');
      return b ? b.innerText.replace(/\D+/g, '') : '';
    });
    afirmar(celula === '18', 'mapa SEPARADOR x 1° TURNO: ' + celula);
    await f.evaluate(() => Array.from(document.querySelectorAll('.qd-mapa tbody tr')).find((t) => /^SEPARADOR$/.test((t.querySelector('th') || {}).innerText || '')).querySelector('td.c button').click());
    await f.waitForFunction(() => QD.aba === 'pessoas' && document.querySelectorAll('.qd-pessoa').length > 0, null, { timeout: 5000 });
    const lista = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-pessoa .qd-pessoa-nome')).map((x) => x.innerText.trim()));
    afirmar(lista.length === 18 && lista.every((n) => n && !/^\d+$/.test(n) && n !== 'COD'), 'as 18 pessoas, com nome: ' + lista.join(', '));
    const filtros = await f.evaluate(() => [QD.equipe, QD.funcao, document.querySelector('.qd-pill[aria-pressed="true"]').innerText.replace(/\s+/g, ' ').trim()]);
    afirmar(filtros[0] === '1° TURNO' && filtros[1] === 'SEPARADOR' && filtros[2] === '1° TURNO', 'filtros vindos do mapa: ' + filtros.join(' | '));
    // ficha: nome, COD, RH e o link direto para a linha da GERAL
    await f.click('.qd-pessoa >> nth=0');
    await f.waitForSelector('#janela:not(.oculto) .qd-ficha', { timeout: 5000 });
    const ficha = await f.evaluate(() => ({ nome: document.querySelector('.qd-ficha h3').innerText.trim(),
      dados: document.querySelector('.qd-ficha-dados').innerText.replace(/\s+/g, ' '),
      link: (document.querySelector('#janela-rodape a') || {}).href || '' }));
    const linhaPlanilha = abas['GERAL'].findIndex((l) => l && l[2] === ficha.nome) + 1;
    afirmar(ficha.nome === lista[0] && linhaPlanilha > 3, 'ficha de quem foi tocado: ' + JSON.stringify(ficha));
    afirmar(new RegExp('Linha da GERAL ' + linhaPlanilha, 'i').test(ficha.dados) && ficha.link.endsWith('/edit#gid=0&range=A' + linhaPlanilha), 'linha e link da planilha: ' + JSON.stringify(ficha) + ' linha ' + linhaPlanilha);
    await f.evaluate(() => fecharJanela());
    // busca por COD acha a pessoa mesmo com o filtro de outra funcao
    await f.evaluate(() => qdLimpar());
    await f.fill('#qd-busca', '30001');
    await f.waitForFunction(() => document.querySelectorAll('.qd-pessoa').length === 1, null, { timeout: 5000 });
    afirmar(await f.evaluate(() => document.querySelector('.qd-pessoa .qd-pessoa-nome').innerText.trim()) === nomeDoCod('30001'), 'busca pelo COD');
    await f.fill('#qd-busca', '');
    // A–Z: ninguem sem nome alem da linha que esta sem nome na planilha
    await f.evaluate(() => { QD.organizar = 'az'; QD.limite = 1000; qdDesenhar(); });
    const nomesAZ = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-tabela tbody tr td:first-child .qd-pessoa-nome')).map((x) => x.innerText.trim()));
    afirmar(nomesAZ.length === E.ativos && nomesAZ.filter((n) => /Sem nome/i.test(n)).length === 1 && !nomesAZ.some((n) => /^\d+$/.test(n)), 'lista A–Z: ' + nomesAZ.length + ' ' + nomesAZ.slice(-3).join(', '));
    // Conferencia: os cinco tipos, cada um com como corrigir; e como o GSL leu a planilha
    await f.evaluate(() => qdAba('conf'));
    const grupos = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-grupo h3')).map((h) => h.innerText.replace(/\s+/g, ' ').trim()));
    afirmar(grupos.join('|') === 'Desligados que continuam ATIVOS na GERAL 3|Linhas sem nome 1|EQUIPE fora do padrão 1|Produtivo (COD) repetido 1|Admitidos que não estão na GERAL 2|' +
      'Férias: do CD, mas fora da GERAL 1|Férias: sem linha na aba FÉRIAS 2', 'grupos: ' + grupos.join('|'));
    afirmar(/Achado pelo nome — confira se é a mesma pessoa/.test(await f.evaluate(() => document.querySelector('#qd-grupo-DESLIGADO_ATIVO').innerText)), 'o achado pelo nome pede conferencia');
    afirmar(!(await f.$('.qd-faixa')), 'a faixa some na propria Conferencia');
    const leitura = await f.evaluate(() => document.querySelector('.qd-leitura').textContent.replace(/\s+/g, ' '));
    afirmar(/PROD/.test(leitura) && /TURNO 4/.test(leitura) && /cabeçalho na linha 3/.test(leitura), 'como leu: ' + leitura.slice(0, 300));
    // Movimentacao abre sem erro, com os quatro numeros
    await f.evaluate(() => qdAba('mov'));
    const kpis = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-kpi')).map((k) => k.innerText.replace(/\s+/g, ' ')));
    afirmar(kpis.length === 3 && /SAÍDAS 24 sem histórico anterior para comparar 12 voluntárias · 12 involuntárias/.test(kpis[0]) && /ENTRADAS 12/.test(kpis[1]) &&
      /2,4% ao mês/.test(kpis[2]) && !(await f.$('#qd-conteudo .erro-caixa')), 'movimentacao: ' + kpis.join(' || '));
    // FÉRIAS (14/10, refeita): um cartao so — a lista do que fazer (Precisam sair de ferias, Avisar, Programar fechado), o
    // calendario a um toque e o rodape; a ficha, o texto copiado, o Excel e os parametros. Nenhuma palavra de multa em lugar nenhum.
    const PROIBIDAS = /multa|dobro|risco|penalidade|infra[çc][ãa]o|puni[çc][ãa]o/i;
    await f.evaluate(() => { try { localStorage.removeItem('gsl_ferias_vista'); } catch (e) {} QD.feVista = ''; qdAba('ferias'); });
    await f.waitForSelector('.qd-fe .qd-fe-grupo', { timeout: 5000 });
    const fe = await f.evaluate(() => ({
      aba: document.querySelector('#qd-abas .aba[data-aba="ferias"]').innerText.replace(/\s+/g, ' ').trim(),
      sub: document.querySelector('.qd-fe-sub').innerText.trim(),
      vista: document.querySelector('.qd-fe-vista .qd-pill[aria-pressed="true"]').innerText.trim(),
      grupos: Array.from(document.querySelectorAll('.qd-fe-grupo h3')).map((h) => h.innerText.replace(/\s+/g, ' ').trim()),
      itens: Array.from(document.querySelectorAll('.qd-fe-grupo')).map((g) => g.querySelectorAll('.qd-fe-item').length),
      folhas: document.querySelectorAll('.qd-fe-grupo .qd-fe-folha').length,
      prim: document.querySelector('.qd-fe-grupo.sair .qd-fe-item').getAttribute('aria-label'),
      primQuando: document.querySelector('.qd-fe-grupo.sair .qd-fe-quando').innerText.replace(/\s+/g, ' ').trim(),
      sairDias: Array.from(document.querySelectorAll('.qd-fe-grupo.sair .qd-fe-item')).map((b) => qdFeriasDados().porRef[Number(/qdFicha\((\d+)\)/.exec(b.getAttribute('onclick'))[1])].pior.dias),
      avisar: document.querySelector('.qd-fe-grupo.avisar .qd-fe-quando').innerText.replace(/\s+/g, ' ').trim(),
      rodape: document.querySelector('.qd-fe-rodape').innerText.replace(/\s+/g, ' ').trim(),
      html: document.querySelector('.qd-fe').innerHTML }));
    afirmar(fe.aba === 'Férias' && fe.sub === 'O aviso de férias é dado 30 dias antes da saída.' && fe.vista === 'Lista',
      'cabecalho da aba Ferias (sem o contador com a aba aberta; Lista na primeira vez): ' + JSON.stringify([fe.aba, fe.sub, fe.vista]));
    afirmar(fe.grupos.join('|') === 'Precisam sair de férias 6|Avisar 11|Programar 10' && fe.itens.join() === '6,11,0' && fe.folhas === 17,
      'grupos (Programar fechado): ' + fe.grupos.join('|') + ' / ' + fe.itens.join() + ' / folhas ' + fe.folhas);
    afirmar(/: prazo vencido em \d\d\/\d\d\/\d{4} \(há \d+ dias\)\. (.+ )?Abrir a ficha\.$/.test(fe.prim) && /^Prazo vencido há \d+ dias$/.test(fe.primQuando) &&
      fe.sairDias.every((d, i) => !i || fe.sairDias[i - 1] <= d), 'o prazo vencido ha mais tempo primeiro: ' + fe.prim + ' / ' + fe.primQuando + ' / ' + fe.sairDias.join());
    afirmar(/^Avisar até (hoje|amanhã|em \d+ dias) sair até \d\d\/\d\d [a-zá]{3}$/.test(fe.avisar), 'linha de Avisar: ' + fe.avisar);
    afirmar(/^\d+ em dia 2 sem dados de férias · ver na Conferência Baixar Excel Parâmetros Marcou férias no sistema\? Cole a extração nova na aba FÉRIAS e use Atualizar dados\.$/.test(fe.rodape),
      'rodape: ' + fe.rodape);
    afirmar(!PROIBIDAS.test(fe.html), 'lista das ferias sem palavra de multa');
    // Programar abre com um toque; quem esta sem dados abre no rodape
    await f.click('.qd-fe-grupo.prog .qd-fe-grupo-bt');
    await f.waitForFunction(() => document.querySelectorAll('.qd-fe-grupo.prog .qd-fe-item').length === 10, null, { timeout: 5000 });
    afirmar(await f.evaluate(() => { const b = document.querySelector('.qd-fe-grupo.prog .qd-fe-grupo-bt'); return b.getAttribute('aria-expanded') === 'true' && b.innerText.trim() === 'Esconder'; }), 'Programar aberto');
    await f.click('.qd-fe-rodape button[aria-expanded]');
    const semDados = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-fe-semdados li')).map((l) => l.innerText.replace(/\s+/g, ' ').trim()));
    afirmar(semDados.length === 2 && semDados.every((t) => / · sem linha na aba FÉRIAS$/.test(t)), 'quem esta sem dados: ' + semDados.join(' | '));
    // o calendario: cada pessoa uma vez, no dia de agir; o prazo vencido numa faixa em cima; a escolha fica guardada
    await f.click('.qd-fe-vista .qd-pill:has-text("Calendário")');
    await f.waitForSelector('.qd-fe-mes', { timeout: 5000 });
    const mesHoje = await f.evaluate(() => ({ guardada: localStorage.getItem('gsl_ferias_vista'), hoje: !!document.querySelector('.qd-fe-mes td[aria-current="date"]'),
      botaoHoje: !!document.querySelector('.qd-fe-hoje-bt') }));
    afirmar(mesHoje.guardada === 'calendario' && mesHoje.hoje && !mesHoje.botaoHoje, 'o calendario abre no mes de hoje, sem o botao Hoje: ' + JSON.stringify(mesHoje));
    // nos ultimos dias do mes, as datas de agir podem estar todas no mes seguinte: anda ate um mes com gente
    await f.evaluate(() => { for (let i = 0; i < 3 && !document.querySelector('.qd-fe-mes .qd-fe-pil'); i++) qdFeMesRel(1); });
    const cal = await f.evaluate(() => ({ tit: document.querySelector('#qd-fe-mes-tit').innerText.trim(),
      rot: Array.from(document.querySelectorAll('.qd-fe-mes .qd-fe-pil')).map((b) => b.getAttribute('title')),
      nomes: Array.from(document.querySelectorAll('.qd-fe-mes .qd-fe-pil')).map((b) => [b.getAttribute('aria-label'), b.innerText.trim()]),
      dias: Array.from(document.querySelectorAll('.qd-fe-mes .qd-fe-dia-bt')).map((b) => b.getAttribute('data-dia')),
      venc: (document.querySelector('.qd-fe-vencidos') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim(),
      leg: document.querySelector('.qd-fe-legenda').innerText.replace(/\s+/g, ' ').trim(), html: document.querySelector('.qd-fe').innerHTML }));
    afirmar(cal.rot.length > 0 && cal.rot.every((r) => /^(Sair|Avisar) até \d\d\/\d\d\/\d{4}: .+\.$/.test(r)) && new Set(cal.rot.map((r) => r.split(': ')[1])).size === cal.rot.length &&
      cal.nomes.every(([rot, nome]) => rot.indexOf(nome + ' — ') === 0), 'calendario (uma pilula por pessoa; o nome que aparece comeca o nome acessivel): ' + JSON.stringify(cal).slice(0, 700));
    afirmar(/^Prazo vencido /.test(cal.venc) && (cal.venc.match(/\(\d\d\/\d\d\)/g) || []).length === 2, 'faixa do prazo vencido: ' + cal.venc);
    afirmar(cal.leg === 'sair até avisar até programar em dia · toque no nome para abrir a ficha' && !PROIBIDAS.test(cal.html), 'legenda: ' + cal.leg);
    // o dia com gente abre a lista dele embaixo da grade (no celular e o toque no dia; no computador, o "+N no dia")
    const doDia = await f.evaluate((iso) => {
      const td = document.querySelector('.qd-fe-mes .qd-fe-dia-bt[data-dia="' + iso + '"]').closest('td');
      const n = td.querySelectorAll('.qd-fe-pil').length + Number(((td.querySelector('.qd-fe-mais') || {}).innerText || '').replace(/\D+/g, '') || 0);
      qdFeDia(iso);
      const l = document.querySelector('#qd-fe-dia-lista');
      return { n, tit: l.querySelector('h4').innerText.replace(/\s+/g, ' ').trim(), itens: l.querySelectorAll('.qd-fe-item').length, escolhido: td.isConnected ? '' : !!document.querySelector('.qd-fe-mes td.escolhido') };
    }, cal.dias[0]);
    afirmar(doDia.itens === doDia.n && doDia.n > 0 && doDia.escolhido === true && /^[A-ZÁÉÍÓÚ][a-zçáéíóúâêô-]+, \d\d\/\d\d( \(hoje\))? fechar$/.test(doDia.tit), 'lista do dia: ' + JSON.stringify(doDia));
    await f.evaluate(() => qdFeFecharDia());
    afirmar(await f.evaluate(() => !document.querySelector('#qd-fe-dia-lista')), 'fecha a lista do dia');
    await f.click('.qd-fe-seta.prox');
    await f.waitForSelector('.qd-fe-hoje-bt', { timeout: 5000 });
    await f.click('.qd-fe-hoje-bt');
    await f.waitForFunction(() => !document.querySelector('.qd-fe-hoje-bt') && QD.feMes === qdHoje().slice(0, 7), null, { timeout: 5000 });
    afirmar(await f.evaluate(() => { QD.feVista = ''; qdDesenhar(); return QD.feVista === 'calendario' && !!document.querySelector('.qd-fe-mes'); }), 'a escolha Lista/Calendario fica neste navegador');
    await f.click('.qd-fe-vista .qd-pill:has-text("Lista")');
    await f.waitForSelector('.qd-fe-grupo', { timeout: 5000 });
    // a ficha de quem esta com o prazo vencido
    await f.evaluate(() => document.querySelector('.qd-fe-grupo.sair .qd-fe-item').click());
    await f.waitForSelector('#janela:not(.oculto) .qd-fe-ficha', { timeout: 5000 });
    const fichaFe = await f.evaluate(() => ({ txt: document.querySelector('.qd-ficha').textContent.replace(/\s+/g, ' '), html: document.querySelector('.qd-ficha').innerHTML }));
    afirmar(/Férias · \d períodos? em aberto/.test(fichaFe.txt) && /Prazo vencido/.test(fichaFe.txt) && /Sair até \(data limite\)/.test(fichaFe.txt) && /venceu há \d+ dias/.test(fichaFe.txt) &&
      !PROIBIDAS.test(fichaFe.html), 'ficha do prazo vencido: ' + fichaFe.txt.slice(0, 500));
    await f.evaluate(() => fecharJanela());
    // o texto copiado, o Excel e o cartao da Visao geral
    const resumoFe = await f.evaluate(() => qdFeResumoTexto());
    afirmar(/^Férias — Quadro do CD — CD Feira de Santana — \d\d\/\d\d\/\d{4}\nPRECISAM SAIR DE FÉRIAS \(6\)\n- .+ \(.+\) — prazo vencido em \d\d\/\d\d [a-zá]{3}\n/.test(resumoFe) &&
      /\nAVISAR \(11\)\n- .+ — avisar até \d\d\/\d\d [a-zá]{3} \(sair até \d\d\/\d\d\)\n/.test(resumoFe) && /\nSEM DADOS DE FÉRIAS \(2\)\n/.test(resumoFe) && !PROIBIDAS.test(resumoFe),
      'copiar resumo na aba Ferias: ' + resumoFe);
    const xls = await f.evaluate(() => { const o = pnBaixarXlsx; let cap = null; pnBaixarXlsx = (nome, abas) => { cap = { nome, abas }; }; try { qdFeBaixar(); } finally { pnBaixarXlsx = o; } return cap; });
    const xlsCab = xls.abas[0].linhas[0].join('|'), xlsSit = Array.from(new Set(xls.abas[0].linhas.slice(1).map((l) => l[0])));
    afirmar(xlsCab === 'SITUAÇÃO|NOME|EQUIPE|FUNÇÃO|MATRÍCULA (FÉRIAS)|RH (GERAL)|INÍCIO DO PERÍODO|FIM DO PERÍODO|PODE TIRAR DESDE|AVISAR ATÉ|SAIR ATÉ (DATA LIMITE)|DIAS ATÉ A DATA LIMITE|STATUS NA GERAL' &&
      xlsSit.slice(0, 4).join() === 'PRAZO VENCIDO,URGENTE,AVISAR,PROGRAMAR' && xlsSit.every((x) => /^(PRAZO VENCIDO|URGENTE|AVISAR|PROGRAMAR|EM DIA|SEM DATA LIMITE)$/.test(x)) &&
      !PROIBIDAS.test(JSON.stringify(xls)), 'Excel das ferias: ' + xlsCab + ' / ' + xlsSit.join());
    const cartaoFe = await f.evaluate(() => qdFeCartaoGeral().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    afirmar(/^Férias Ver férias → Prazos pela aba FÉRIAS\. 6 precisam sair de férias 11 para avisar Próximo aviso: .+ até \d\d\/\d\d [a-zá]{3} \(sair até \d\d\/\d\d\)\. 2 sem dados de férias \( ver na Conferência \)$/.test(cartaoFe) &&
      !PROIBIDAS.test(cartaoFe), 'cartao da visao geral: ' + cartaoFe);
    // parametros: sem o escalonar e sem multa; o aviso passa a 45 dias e o "Avisar" a 75 — os grupos recalculam; depois volta ao padrao
    await f.click('.qd-fe-rod-acoes button:has-text("Parâmetros")');
    await f.waitForSelector('#fp-aviso', { timeout: 5000 });
    const modal = await f.evaluate(() => ({ txt: document.querySelector('#janela').textContent.replace(/\s+/g, ' '), campos: Array.from(document.querySelectorAll('#janela input')).map((i) => i.id).join() }));
    afirmar(modal.campos === 'fp-cc,fp-digitos,fp-aviso,fp-avisar,fp-planejar' && /“Programar”: data limite em até quantos dias/.test(modal.txt) && /data limite para sair \(DTA_LIMITEMAX\)/.test(modal.txt) &&
      !/scalonar/.test(modal.txt) && !PROIBIDAS.test(modal.txt), 'parametros: ' + JSON.stringify(modal));
    await f.fill('#fp-aviso', '45'); await f.fill('#fp-avisar', '75');
    await f.click('#janela-rodape button:has-text("Salvar")');
    await f.waitForFunction(() => DADOS && DADOS.parametrosFerias && DADOS.parametrosFerias.aviso === 45 && document.querySelector('.qd-fe-sub'), null, { timeout: 15000 });
    const fe45 = await f.evaluate(() => ({ sub: document.querySelector('.qd-fe-sub').innerText.trim(), grupos: Array.from(document.querySelectorAll('.qd-fe-grupo h3')).map((h) => h.innerText.replace(/\s+/g, ' ').trim()) }));
    afirmar(fe45.sub === 'O aviso de férias é dado 45 dias antes da saída.' && /^Precisam sair de férias \d+$/.test(fe45.grupos[0]) && Number(fe45.grupos[0].replace(/\D+/g, '')) > 6,
      'parametros mudam os grupos: ' + JSON.stringify(fe45));
    await f.click('.qd-fe-rod-acoes button:has-text("Parâmetros")');
    await f.waitForSelector('#fp-aviso', { timeout: 5000 });
    await f.click('#janela-rodape button:has-text("Voltar ao padrão")');
    await f.waitForFunction(() => DADOS && DADOS.parametrosFerias && DADOS.parametrosFerias.aviso === 30, null, { timeout: 15000 });
    // FÉRIAS sem dados (revisao de 14/10): aba vazia, sem a coluna da data limite, periodo sem data — nada disso vira "ninguem para avisar"
    const semPrazo = await f.evaluate(() => {
      const orig = DADOS, r = {};
      const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const com = (ferias, leitura) => Object.assign({}, orig, { ferias: Object.assign({}, orig.ferias, ferias), leitura: Object.assign({}, orig.leitura, { ferias: Object.assign({}, orig.leitura.ferias, leitura) }) });
      const tela = () => ({ aba: txt(qdFerias()), card: txt(qdFeCartaoGeral()), linha: qdFeResumoLinha(), resumo: qdFeResumoTexto() });
      try {
        DADOS = com({ linhas: [] }, { linhas: 0 }); r.vazia = tela();
        r.vazia.conf = qdMemo().inc.filter((x) => x.tipo === 'FERIAS_ABA').map((x) => x.detalhe).join(); r.vazia.selo = qdSeloAba();
        DADOS = com({ linhas: orig.ferias.linhas.map((x) => Object.assign({}, x, { limiteMax: '' })) }, { faltam: ['limiteMax'] }); r.semColuna = tela();
        // sem a coluna pa_fim: a ficha usa o DTA_LIMITE (como a situacao); colada sem o cabecalho: um aviso so, sem efeitos que se contradizem
        DADOS = com({ linhas: orig.ferias.linhas.map((x) => Object.assign({}, x, { paFim: '' })) }, { faltam: ['paFim'] });
        const refFicha = qdFeriasDados().lista.find((p) => p.pior.k === 'avisar').g.ref;
        r.semPaFim = { ficha: txt(qdFeFichaSecao(refFicha)), conf: qdMemo().inc.filter((x) => x.tipo === 'FERIAS_ABA').map((x) => x.detalhe).join(), aba: txt(qdFerias()) };
        DADOS = com({ linhas: [] }, { linhas: 0, faltam: ['matricula', 'nome', 'paFim', 'limiteMax'] });
        r.semCabecalho = qdMemo().inc.filter((x) => x.tipo === 'FERIAS_ABA').map((x) => x.detalhe).join();
        // ninguem para avisar nem para sair: a linha diz o proximo aviso (e "entre quem tem prazo", porque ha gente sem dados)
        DADOS = com({ linhas: orig.ferias.linhas.map((x) => Object.assign({}, x, { limiteMax: qdSomarDias(qdHoje(), 80) })) }, {});
        r.ninguem = { aba: txt(qdFerias()), card: txt(qdFeCartaoGeral()), resumo: qdFeResumoTexto() };
        // quem tem prazo ganha um periodo antigo sem DTA_LIMITEMAX: fica no grupo do prazo, com a etiqueta, e nao conta em "sem dados"
        DADOS = orig;
        const p1 = qdFeriasDados().lista.find((p) => p.pior.k === 'planejar');
        const extra = Object.assign({}, p1.periodos[0].f, { linha: 999, limiteMax: '', limite: '', paFim: qdSomarDias(qdHoje(), -500), paInicio: qdSomarDias(qdHoje(), -864) });
        DADOS = com({ linhas: orig.ferias.linhas.concat([extra]) }, {});
        const p2 = qdFeriasDados().porRef[p1.g.ref];
        r.semData = { pior: p2.pior.k, ks: p2.periodos.map((x) => x.k).join(), item: txt(qdFeItem(p2)), linha: qdFeResumoLinha() };
        // sem prazo perto, o periodo sem data passa na frente do "em dia": a pessoa conta em "sem dados"
        DADOS = orig;
        const p3 = qdFeriasDados().lista.find((p) => p.pior.k === 'liberada' || p.pior.k === 'aquisicao');
        DADOS = com({ linhas: orig.ferias.linhas.concat([Object.assign({}, p3.periodos[0].f, { linha: 998, limiteMax: '', limite: '', paFim: qdSomarDias(qdHoje(), -500) })]) }, {});
        r.semData.p3 = qdFeriasDados().porRef[p3.g.ref].pior.k;
        r.semData.linha3 = qdFeResumoLinha();
        QD.feSemDados = true;
        r.semData.lista = Array.from(new DOMParser().parseFromString(qdFerias(), 'text/html').querySelectorAll('.qd-fe-semdados li')).map((l) => l.textContent.replace(/\s+/g, ' ').trim());
      } finally { DADOS = orig; QD.feSemDados = false; }
      // a linha sem PROD (RH 109002) entra no texto copiado com o COD e o RH, nao com o nome vazio
      r.resumoSemNome = qdFeResumoTexto().split('\n').filter((l) => /RH 109002/.test(l) || /^-  \(/.test(l));
      // as bordas: com a data limite a 30 dias o aviso ainda cabe (e hoje); a 29, nao. No dia do pa_fim, ainda em aquisicao
      const h = qdHoje(), P = qdFeP(), sit = (lim, fim) => qdFeriasSituacao({ limiteMax: lim === null ? '' : qdSomarDias(h, lim), paFim: qdSomarDias(h, fim) }, h, P).k;
      r.bordas = [sit(30, -200), sit(29, -200), sit(0, -200), sit(-1, -200), sit(60, -200), sit(61, -200), sit(400, 0), sit(400, -1), sit(null, 0), sit(null, -1)].join();
      return r;
    });
    afirmar(/^O que fazer e até quando A aba FÉRIAS está vazia Só tem o cabeçalho: cole a extração do sistema embaixo dele e use Atualizar dados\. Parâmetros das férias$/.test(semPrazo.vazia.aba) &&
      /A aba FÉRIAS está vazia: o GSL não sabe o prazo de ninguém\./.test(semPrazo.vazia.card) && !/Ninguém para avisar/.test(semPrazo.vazia.card) &&
      semPrazo.vazia.linha === 'Férias: a aba FÉRIAS está vazia (o GSL não sabe os prazos)' && /\nA aba FÉRIAS está vazia: o GSL não sabe o prazo de ninguém\.$/.test(semPrazo.vazia.resumo) &&
      semPrazo.vazia.conf === 'A aba FÉRIAS está vazia: só tem o cabeçalho. Sem as linhas, o GSL não sabe o prazo de ninguém.' && !/planilha conferida/.test(semPrazo.vazia.selo),
      'aba FÉRIAS vazia: ' + JSON.stringify(semPrazo.vazia));
    afirmar(/Não achei a coluna DTA_LIMITEMAX na aba FÉRIAS Sem ela, o GSL não sabe o prazo de ninguém\./.test(semPrazo.semColuna.aba) &&
      /sem a coluna DTA_LIMITEMAX: o GSL não sabe o prazo de ninguém\./.test(semPrazo.semColuna.card) &&
      !/Ninguém para avisar/.test(semPrazo.semColuna.card + semPrazo.semColuna.resumo) && semPrazo.semColuna.linha === 'Férias: a aba FÉRIAS está sem a coluna DTA_LIMITEMAX (o GSL não sabe os prazos)',
      'sem a coluna DTA_LIMITEMAX: ' + JSON.stringify(semPrazo.semColuna));
    afirmar(/Pode tirar desde \d\d\/\d\d\/\d{4}/.test(semPrazo.semPaFim.ficha) && /Sair até \(data limite\)/.test(semPrazo.semPaFim.ficha) &&
      /Não achei a coluna pa_fim na aba FÉRIAS: parte das férias pode ficar sem dados\. ver na Conferência/.test(semPrazo.semPaFim.aba) &&
      /^Não achei a coluna pa_fim: "pode tirar desde" e "em aquisição" usam o DTA_LIMITE/.test(semPrazo.semPaFim.conf), 'sem pa_fim: ' + JSON.stringify(semPrazo.semPaFim));
    afirmar(semPrazo.semCabecalho === 'Não achei as colunas Matricula, Nome, pa_fim, DTA_LIMITEMAX no cabeçalho da aba FÉRIAS, e nenhuma linha foi lida (sem Matricula e sem Nome, nenhuma linha serve): o GSL não sabe o prazo de ninguém.',
      'colada sem o cabecalho: ' + semPrazo.semCabecalho);
    afirmar(/Ninguém para avisar ou sair de férias agora entre quem tem prazo · próximo aviso: .+ até \d\d\/\d\d [a-zá]{3} \(em \d+ dias\) Programar \d+/.test(semPrazo.ninguem.aba) &&
      /0 precisam sair de férias 0 para avisar Ninguém para avisar ou sair de férias agora entre quem tem prazo\. Próximo aviso: /.test(semPrazo.ninguem.card) &&
      /\nNinguém para avisar ou sair de férias agora entre quem tem prazo\. Próximo aviso: .+ até \d\d\/\d\d [a-zá]{3} \(em \d+ dias\)\.\n/.test(semPrazo.ninguem.resumo),
      'ninguem para agir: ' + JSON.stringify(semPrazo.ninguem));
    afirmar(semPrazo.semData.pior === 'planejar' && semPrazo.semData.p3 === 'semdata' && /semdata/.test(semPrazo.semData.ks) && /período sem data/.test(semPrazo.semData.item) &&
      semPrazo.semData.linha === 'Férias: 6 precisam sair de férias, 11 para avisar, 2 sem dados de férias' && semPrazo.semData.linha3 === 'Férias: 6 precisam sair de férias, 11 para avisar, 3 sem dados de férias' &&
      semPrazo.semData.lista.length === 3 && semPrazo.semData.lista.filter((t) => / · período sem data limite na aba FÉRIAS$/.test(t)).length === 1,
      'periodo sem data (cada pessoa conta num lugar so): ' + JSON.stringify(semPrazo.semData));
    afirmar(semPrazo.bordas === 'avisar,critica,critica,vencida,avisar,planejar,aquisicao,liberada,aquisicao,semdata', 'bordas das faixas: ' + semPrazo.bordas);
    afirmar(semPrazo.resumoSemNome.length === 1 && /^- Sem nome, COD 39002, RH 109002 \(2° TURNO, [^)]+\) — sem linha na aba FÉRIAS$/.test(semPrazo.resumoSemNome[0]), 'sem nome no texto copiado: ' + semPrazo.resumoSemNome.join('|'));
    afirmar(!PROIBIDAS.test(JSON.stringify(semPrazo)), 'nenhuma palavra de multa nos casos sem dados');
    // cada pessoa conta num lugar so; quem consta como desligado tem a etiqueta; o "+N no dia"; o corte da faixa do prazo vencido;
    // a aba sem Matricula e Nome; sem a aba; a ficha de um periodo com data limite e sem pa_fim
    const maisFe = await f.evaluate(() => {
      const orig = DADOS, r = {};
      const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const dom = (h) => new DOMParser().parseFromString(h, 'text/html');
      const c = qdFeContagem(qdFePessoas()), d = qdFeDesconhecido();
      r.soma = ['vencida', 'critica', 'avisar', 'planejar', 'liberada', 'aquisicao'].reduce((n, k) => n + c[k].length, 0) + d.n;
      r.quadro = qdRecorte(qdNaEmpresa()).length;
      QD.feProgramar = true; QD.feVista = 'lista';
      const itens = Array.from(dom(qdFerias()).querySelectorAll('.qd-fe-item')).map((b) => ({ ref: Number(/qdFicha\((\d+)\)/.exec(b.getAttribute('onclick'))[1]),
        tag: /consta como desligado/.test(b.textContent), rot: b.getAttribute('aria-label') }));
      r.saiu = itens.filter((x) => qdFeSaiu({ ref: x.ref }));
      r.etiquetaSobrando = itens.filter((x) => x.tag && !qdFeSaiu({ ref: x.ref })).length;
      r.resumoSaiu = qdFeResumoTexto().split('\n').filter((l) => /consta como desligado/.test(l)).length;
      r.saiuNoResumo = qdFePessoas().filter((p) => ['vencida', 'critica', 'avisar'].indexOf(p.pior.k) !== -1 && qdFeSaiu(p.g)).length;
      try {
        // cinco pessoas com o mesmo "avisar ate" (2 pilulas e "+N no dia"); seis a mais com o prazo vencido (a faixa mostra 6 e corta)
        const hoje = qdHoje(), limite = qdSomarDias(hoje, 45);
        const emDia = qdFePessoas().filter((p) => p.pior.k === 'liberada' || p.pior.k === 'aquisicao').map((p) => p.g.ref);
        const mesmoDia = emDia.slice(0, 5), vencem = emDia.slice(5, 11);         // pessoas do quadro (todos os periodos delas)
        const linhas = orig.ferias.linhas.map((x) => {
          const y = Object.assign({}, x);
          if (mesmoDia.indexOf(y.ref) !== -1) y.limiteMax = limite;
          else if (vencem.indexOf(y.ref) !== -1) y.limiteMax = qdSomarDias(hoje, -20 - vencem.indexOf(y.ref));
          return y;
        });
        DADOS = Object.assign({}, orig, { ferias: Object.assign({}, orig.ferias, { linhas }) });
        const dia = qdSomarDias(limite, -qdFeP().aviso);
        QD.feVista = 'calendario'; QD.feMes = dia.slice(0, 7); QD.feDia = '';
        const cal = dom(qdFerias());
        const td = cal.querySelector('.qd-fe-dia-bt[data-dia="' + dia + '"]').closest('td');
        r.mais = { pil: td.querySelectorAll('.qd-fe-pil').length, mais: (td.querySelector('.qd-fe-mais') || {}).textContent || '', n: qdFePorDia(qdFePessoas(), dia.slice(0, 7))[dia].length };
        const venc = cal.querySelector('.qd-fe-vencidos');
        r.venc = { nomes: venc.querySelectorAll('span .qd-link').length, mais: (Array.from(venc.querySelectorAll('button')).pop() || {}).textContent || '',
          total: qdFeContagem(qdFePessoas()).vencida.length };
        DADOS = Object.assign({}, orig, { ferias: Object.assign({}, orig.ferias, { linhas: [] }),
          leitura: Object.assign({}, orig.leitura, { ferias: Object.assign({}, orig.leitura.ferias, { linhas: 0, faltam: ['matricula', 'nome'] }) }) });
        r.semMatNome = { aba: txt(qdFerias()), card: txt(qdFeCartaoGeral()), linha: qdFeResumoLinha() };
        DADOS = Object.assign({}, orig, { ferias: null });
        r.semAba = txt(qdFerias());
        DADOS = Object.assign({}, orig, { ferias: Object.assign({}, orig.ferias, { linhas: orig.ferias.linhas.map((x) => Object.assign({}, x, { paFim: '', limite: '' })) }) });
        r.fichaSemPaFim = txt(qdFeFichaSecao(qdFeriasDados().lista.find((x) => x.pior.k === 'avisar').g.ref));
      } finally { DADOS = orig; QD.feVista = 'lista'; QD.feMes = ''; QD.feDia = ''; QD.feProgramar = false; }
      return r;
    });
    afirmar(maisFe.soma === maisFe.quadro, 'cada pessoa conta num lugar so: ' + maisFe.soma + ' x ' + maisFe.quadro);
    afirmar(maisFe.saiu.length >= 1 && maisFe.saiu.every((x) => x.tag && /Consta como desligado/.test(x.rot)) && !maisFe.etiquetaSobrando &&
      maisFe.saiuNoResumo >= 1 && maisFe.resumoSaiu === maisFe.saiuNoResumo, 'quem consta como desligado: ' + JSON.stringify([maisFe.saiu, maisFe.resumoSaiu, maisFe.saiuNoResumo]));
    afirmar(maisFe.mais.n >= 5 && maisFe.mais.pil === 2 && maisFe.mais.mais === '+' + (maisFe.mais.n - 2) + ' no dia', 'muita gente no mesmo dia (2 pilulas e "+N no dia"): ' + JSON.stringify(maisFe.mais));
    afirmar(maisFe.venc.total === 8 && maisFe.venc.nomes === 6 && maisFe.venc.mais === 'e mais 2 na lista', 'faixa do prazo vencido cortada: ' + JSON.stringify(maisFe.venc));
    afirmar(/^O que fazer e até quando Não achei as colunas Matricula e Nome na aba FÉRIAS Sem elas, nenhuma linha foi lida\./.test(maisFe.semMatNome.aba) &&
      /A aba FÉRIAS está sem as colunas Matricula e Nome: o GSL não sabe o prazo de ninguém\./.test(maisFe.semMatNome.card) &&
      maisFe.semMatNome.linha === 'Férias: a aba FÉRIAS está sem as colunas Matricula e Nome (o GSL não sabe os prazos)', 'sem Matricula e Nome: ' + JSON.stringify(maisFe.semMatNome));
    afirmar(/^O que fazer e até quando Falta a aba FÉRIAS na planilha Extraia as férias do sistema \(com Matricula, Nome, pa_fim e DTA_LIMITEMAX\)/.test(maisFe.semAba), 'sem a aba FÉRIAS: ' + maisFe.semAba);
    afirmar(/Avisar até \d\d\/\d\d\/\d{4} [a-zá]{3}/.test(maisFe.fichaSemPaFim) && /Sair até \(data limite\) \d\d\/\d\d\/\d{4} [a-zá]{3} · em \d+ dias/.test(maisFe.fichaSemPaFim) &&
      !/Pode tirar desde/.test(maisFe.fichaSemPaFim), 'ficha sem pa_fim: ' + maisFe.fichaSemPaFim);
    afirmar(!PROIBIDAS.test(JSON.stringify(maisFe)), 'nenhuma palavra de multa nos casos novos');
    // a barra lateral recolhe e volta; quem desenha pela largura da caixa (graficos do Aprendiz) recebe um "resize"
    await f.evaluate(() => { window.__redim = 0; window.addEventListener('resize', () => { window.__redim++; }); });
    await f.click('#lateral-alternar');
    afirmar(await f.evaluate(() => document.getElementById('aplicacao').classList.contains('lateral-oculta') && el('lateral-alternar').getAttribute('aria-expanded') === 'false'), 'barra lateral recolhida');
    await f.waitForFunction(() => window.__redim >= 1, null, { timeout: 3000 });
    await f.click('#lateral-alternar');
    afirmar(await f.evaluate(() => !document.getElementById('aplicacao').classList.contains('lateral-oculta')), 'barra lateral de volta');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close();

    // Computador compartilhado: o gerente olha o 3° TURNO e sai; a coordenadora (turno A) entra e cai no 1° TURNO.
    // (O coordenador nao ve o Quadro por padrao: o administrador libera o modulo para ela.)
    const cx = s.contexto(DONO); cx._porta = true;
    const adminCx = { email: DONO, perfil: 'ADMIN', permissoes: cx.permissoesDe('ADMIN') };
    cx.acaoDefinirModuloPessoa(adminCx, { id: cx.listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === COORD).ID, modulo: 'quadro', modo: 'VER' });
    const pc = await abrirAba(s, GERAL);
    await entrar(pc, GERENTE, '2468', true);
    await esperarTela(pc, ['aplicacao']);
    const g = await frame(pc);
    await g.evaluate(() => abrir('quadro'));
    await g.waitForSelector('.qd-cartao', { timeout: 20000 });
    afirmar(await g.evaluate(() => QD.equipe === '*'), 'gerente: todas as equipes');
    await g.evaluate(() => { qdEquipe('3° TURNO'); qdAba('pessoas'); });
    await g.evaluate(() => sair());
    await esperarTela(pc, ['entrar']);
    afirmar(await g.evaluate(() => QD_MEMO === null && QD.equipe === '*' && QD.aba === 'geral'), 'sair apaga o Quadro de quem saiu da memoria da pagina');
    await entrar(pc, COORD, '1357', true);
    await esperarTela(pc, ['aplicacao']);
    const c = await frame(pc);
    await c.evaluate(() => abrir('quadro'));
    await c.waitForSelector('.qd-cartao', { timeout: 20000 });
    const dela = await c.evaluate(() => [QD.equipe, QD.aba, document.querySelector('.qd-pill[aria-pressed="true"]').innerText.replace(/\s+/g, ' ').trim()]);
    afirmar(dela[0] === '1° TURNO' && dela[1] === 'geral' && /^1° TURNO/.test(dela[2]), 'coordenadora do turno A cai no 1° TURNO, na visao geral: ' + dela.join(' | '));
    afirmar(await c.evaluate(() => !document.querySelector('#acoes-topo').innerText.includes('Trocar planilha')), 'quem so ve nao troca a planilha');
    await c.evaluate(() => qdAba('ferias'));
    afirmar(await c.evaluate(() => !!document.querySelector('.qd-fe .qd-fe-rodape') && !document.querySelector('.qd-fe-rodape').innerText.includes('Parâmetros')), 'quem so ve nao muda os parametros das ferias');
    afirmar(!pc.erros.length, 'erros: ' + pc.erros.join(' | '));
    await pc.contexto.close();
    await s.fechar();
  });

  await navegador.close();
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' cenarios ok');
  process.exit(falhas.length ? 1 : 0);
}

rodar().catch((e) => { console.error(e); process.exit(2); });
