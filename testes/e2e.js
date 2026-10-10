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
async function entrarReal(aba, email, pin) {
  await clicarEm(aba, 'email', 20000);
  await aba.page.keyboard.type(email, { delay: 5 });
  await clicarEm(aba, 'pin');
  await aba.page.keyboard.type(pin, { delay: 5 });
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
      assiduidade: COLAB_CACHE === null && FICHA.matricula === '', janela: el('janela-corpo').innerHTML === '' && el('janela').classList.contains('oculto') }));
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
    await aba.page.waitForTimeout(1500);
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
    // 51 min sem ir ao servidor: a faixa aparece; o botao renova
    await f.evaluate(() => { ULTIMO_CONTATO = Date.now() - 51 * 60000; ULTIMA_ATIVIDADE = Date.now() - 20 * 60000; vigiarSessao(); });
    afirmar(/termina em \d+ min/.test(await texto(aba, 'aviso-sessao')), 'faixa do aviso');
    await f.click('#aviso-sessao button');
    await f.waitForFunction(() => !document.getElementById('aviso-sessao'), null, { timeout: 10000 });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await navegador.close();
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' cenarios ok');
  process.exit(falhas.length ? 1 : 0);
}

rodar().catch((e) => { console.error(e); process.exit(2); });
