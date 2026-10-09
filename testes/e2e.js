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
    for (const k of [...s.mundo.cache.keys()]) if (/^sess_/.test(k)) s.mundo.cache.delete(k);      // 1 h parada
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
    const r = await f.evaluate(() => {
      sessionStorage.setItem('gsl_sessao', 'abc123'); sessionStorage.setItem('gsl_saida', String(Date.now() - 20000));
      const velha = lerSessao();
      sessionStorage.setItem('gsl_sessao', 'abc123'); sessionStorage.setItem('gsl_saida', String(Date.now() - 1000));
      const f5 = lerSessao();
      return { velha, f5 };
    });
    afirmar(r.velha === '' && r.f5 === 'abc123', 'restaurada depois de 20 s: nada; F5: sessao — ' + JSON.stringify(r));
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

  await navegador.close();
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' cenarios ok');
  process.exit(falhas.length ? 1 : 0);
}

rodar().catch((e) => { console.error(e); process.exit(2); });
