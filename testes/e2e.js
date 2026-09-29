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
  if (extras && extras.bloqueio403) cookies.push({ name: 'gas_403', value: '1', url: s.url });
  await contexto.addCookies(cookies);
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.googleapis|Failed to load resource/.test(m.text())) erros.push('console: ' + m.text());
  });
  await page.goto(s.url + ((extras && extras.query) || ''));
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

  await navegador.close();
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' cenarios ok');
  process.exit(falhas.length ? 1 : 0);
}

rodar().catch((e) => { console.error(e); process.exit(2); });
