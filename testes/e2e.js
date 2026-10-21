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
const { miniaturaDrive, pastasDeConversao, HEIC_MINI, JPEG_MINI } = require('./emulador/miniatura-drive.js');

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

/*
 * RELATORIOS NAS CORES DA BARTOFIL (21/10). O .xlsx baixado: cada parte e
 * XML bem formado (o DOMParser do proprio Chromium confere), os count="" do
 * styles.xml batem com os itens e as cores da marca estao la (azul no
 * cabecalho com texto branco, filete verde, tarja amarela, zebra, titulo azul).
 * Devolve { caminho no zip: texto } para o cenario conferir as abas.
 */
async function conferirXlsxDaMarca(aba, caminho) {
  const cp = require('child_process');
  const nomes = cp.execSync('unzip -Z1 "' + caminho + '"').toString().split('\n').filter(Boolean);
  const partes = {};
  nomes.forEach((n) => { partes[n] = cp.execSync('unzip -p "' + caminho + '" "' + n.replace(/[[\]]/g, '\\$&') + '"').toString(); });
  afirmar(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'].every((n) => partes[n]), 'partes do xlsx: ' + nomes.join());
  for (const n of nomes) {
    const erro = await aba.page.evaluate((x) => {
      const e = new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror')[0];
      return e ? e.textContent : '';
    }, partes[n]);
    afirmar(!erro, 'xlsx: ' + n + ' nao e XML bem formado: ' + erro);
  }
  const est = partes['xl/styles.xml'];
  [['fonts', '<font>'], ['fills', '<fill>'], ['borders', '<border>'], ['cellXfs', '<xf ']].forEach(([tag, filho]) => {
    const m = est.match(new RegExp('<' + tag + ' count="(\\d+)">([\\s\\S]*?)</' + tag + '>'));
    afirmar(m && Number(m[1]) === m[2].split(filho).length - 1, 'styles.xml: count de ' + tag + ' nao bate: ' + (m ? m[1] : 'sem ' + tag));
  });
  afirmar(/<fgColor rgb="FF111785"\/>/.test(est) && /<b\/><sz val="11"\/><color rgb="FFFFFFFF"\/>/.test(est) &&
    /<bottom style="medium"><color rgb="FF01973A"\/><\/bottom>/.test(est) && /<fgColor rgb="FFFFEE03"\/>/.test(est) &&
    /<fgColor rgb="FFF3F5FA"\/>/.test(est) && /<b\/><sz val="16"\/><color rgb="FF111785"\/>/.test(est), 'styles.xml sem as cores da Bartofil: ' + est.slice(0, 500));
  return partes;
}

/* A janela do relatorio em PDF nas cores da Bartofil: logo, titulo azul, tarja, cabecalho de tabela azul e o rodape. */
async function conferirPdfDaMarca(janela) {
  await janela.waitForFunction(() => { const l = document.querySelector('.rel-cab img.logo'); return !l || l.complete; }, null, { timeout: 10000 });
  const m = await janela.evaluate(() => {
    const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : {}; };
    const logo = document.querySelector('.rel-cab img.logo');
    return {
      logo: logo ? logo.getAttribute('src').slice(0, 22) : '', carregou: !!(logo && logo.naturalWidth > 100),
      h1: cs('.rel-cab h1').color, th: cs('table:not(.rel-pagina) th').backgroundColor, thTexto: cs('table:not(.rel-pagina) th').color,
      tarja: Array.from(document.querySelectorAll('.rel-cab + .rel-tarja i')).map((i) => getComputedStyle(i).backgroundColor).join(' '),
      rodape: ((document.querySelector('.rel-rod') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      ajuste: getComputedStyle(document.body).getPropertyValue('-webkit-print-color-adjust')
    };
  });
  afirmar(m.logo === 'data:image/png;base64,' && m.carregou, 'logo da Bartofil no relatorio: ' + JSON.stringify(m).slice(0, 300));
  afirmar(m.h1 === 'rgb(17, 23, 133)' && m.th === 'rgb(17, 23, 133)' && m.thTexto === 'rgb(255, 255, 255)', 'titulo e cabecalho de tabela no azul: ' + JSON.stringify(m));
  afirmar(m.tarja === 'rgb(17, 23, 133) rgb(1, 151, 58) rgb(255, 238, 3)', 'tarja azul/verde/amarela: ' + m.tarja);
  afirmar(/^GSL Bartofil · .+ · gerado em \d\d\/\d\d\/\d{4}/.test(m.rodape), 'rodape: ' + m.rodape);
  afirmar(m.ajuste === 'exact', 'cores na impressao (print-color-adjust): ' + m.ajuste);
}

/* Uma "aba" com uma conta Google. Devolve page e o frame do GSL. */
async function abrirAba(s, conta, extras) {
  const contexto = extras && extras.contexto ? extras.contexto : await navegador.newContext();
  // relogio (19/10): o navegador no mesmo instante do servidor de subir({ agora }) — as datas da tela batem.
  if (extras && extras.relogio) await contexto.clock.install({ time: new Date(extras.relogio) });
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

/* COMENTARIOS (19/10): mais gente no cadastro e uma pessoa gravando pelo servidor (sem tela), como a tela faz. */
const PEDRO = 'pedro.alves@bartofil.com.br', CONSULTA = 'carla.dias@bartofil.com.br';
function cadastrar(s, email, nome, perfil, turno, papel) {
  const ctx = s.contexto(DONO);
  ctx._porta = true;
  ctx.acaoSalvarUsuario({ email: DONO, perfil: 'ADMIN', permissoes: ctx.permissoesDe('ADMIN') }, { email, nome, perfil, turno, filiais: '*', papel });
}
function pelaPorta(s, conta, email, pin) {
  const e = criarPin(s, conta, email, pin);
  const c = { t: e.token, f: e.filial.codigo };
  return (nome, params) => {
    const r = s.chamar(conta, 'executarAcao', c, nome, params || {});
    afirmar(r.ok, nome + ': ' + JSON.stringify(r.erro));
    const x = JSON.parse(r.valor);
    afirmar(x.ok !== false, nome + ': ' + x.erro);
    return x;
  };
}
/* O "?tela=...&acao=..." do botao do ultimo e-mail de mencao para a pessoa. */
function linkDaMencao(s, para, assunto) {
  const m = s.mundo.emails.filter((e) => e.to === para && assunto.test(e.subject)).pop();
  const link = ((m && m.htmlBody) || '').match(/href="([^"]+)"/);
  afirmar(link, 'e-mail de mencao para ' + para);
  return link[1].slice(link[1].indexOf('?'));
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

/* PAINEIS NO MENU (19/10): os cartoes como a pessoa ve — "nobreaks[oculto]" quando tem a etiqueta. */
function cartoesDoMenu(f) {
  return f.evaluate(() => [...document.querySelectorAll('.grade-modulos .holocard[data-modulo]')]
    .map((b) => b.dataset.modulo + (b.querySelector('.selo-oculto') ? '[oculto]' : '')).join(','));
}
const paginaPronta = (id) => paginaAtual === id && !/Carregando|Abrindo/.test(document.getElementById('pagina').innerText);
/* Filiais e paineis: o administrador muda um painel da principal pelo <select> do cartao. Devolve o recado. */
async function mudarPainelPelaTela(f, painel, estado) {
  await f.evaluate(() => abrirConfig('filiais'));
  await f.waitForFunction(paginaPronta, 'filiais', { timeout: 15000 });
  const nome = await f.evaluate((p) => DADOS.catalogo.find((x) => x.id === p).nome, painel);
  await f.selectOption('xpath=(//tr[.//strong[normalize-space()="' + nome + '"]]//select)[1]', estado);
  await f.waitForFunction(([p, e]) => paginaAtual === 'filiais' && DADOS && DADOS.filiais && !/Carregando/.test(document.getElementById('pagina').innerText) &&
    (DADOS.filiais.find((x) => x.principal).paineis[p] || 'REMOVER') === e, [painel, estado], { timeout: 15000 });
  return f.evaluate(() => document.getElementById('recado').textContent);
}
/* FOTO HEIC (19/10): as acoes que a tela pediu ao servidor, em ordem (a converterFoto e uma por foto). */
function acoesPedidas(aba) {
  const lista = [];
  aba.page.on('request', (r) => {
    if (!/__gsr$/.test(r.url())) return;
    try { const j = JSON.parse(r.postData()); if (/^executarAcao/.test(j.fn)) lista.push(j.args[1]); } catch (e) { /* nao era uma chamada */ }
  });
  return lista;
}
const visorComFoto = () => { const i = document.querySelector('#visor-imagem img'); return !!i && i.complete && i.naturalWidth > 0; };
/* Escolhe fotos no campo e espera a tela terminar de prepara-las (ou de converte-las). */
async function escolherFotos(f, campo, arquivos) {
  await f.setInputFiles('#' + campo + '-fotos', arquivos);
  await f.waitForFunction((c) => !FOTOS_PREPARANDO[c], campo, { timeout: 30000 });
}

/* Depois de um POST da reserva: a moldura NOVA (sem a marca da velha) pronta na condicao pedida. */
async function paginaNova(aba, pronta, arg) {
  const fim = Date.now() + 30000;
  let visto = '';
  while (Date.now() < fim) {
    try {
      const f = await frame(aba);
      visto = await f.evaluate(() => (window.__paginaVelha ? 'velha ' : 'nova ') + (typeof paginaAtual === 'undefined' ? '' : paginaAtual));
      if (/^nova/.test(visto) && await f.evaluate(() => typeof SESSAO !== 'undefined' && !!SESSAO) && await f.evaluate(pronta, arg)) return f;
    } catch (e) { visto = 'navegando'; }
    await aba.page.waitForTimeout(150);
  }
  throw new Error('a pagina nova nao chegou (' + visto + ')');
}

/*
 * ROTINAS (19/10): servidor e navegador parados na segunda 19/10/2026, com OUT e NOV ja gerados — como
 * em producao depois do dia 20 do mes anterior. ronda: a Ronda (RON, toda quarta) criada pelo servidor.
 */
const SEGUNDA_19_10 = '2026-10-19T10:00:00-03:00';
function comOutENov(s, ronda) {
  const c = s.contexto(DONO);
  c._porta = true;
  ['OUT 2026', 'NOV 2026'].forEach((comp) => c.gerarCompetencia(comp, DONO));
  if (!ronda) return;
  const c2 = s.contexto(DONO);
  c2._porta = true;
  c2.acaoSalvarRotina({ email: DONO, perfil: 'ADMIN', permissoes: c2.permissoesDe('ADMIN') }, Object.assign({ tipo: 'RON',
    atividade: 'Ronda de segurança', frequencia: 'SEMANAL', dia: '3', porTurno: false, exigeSetor: false, ativo: true }, ronda));
}
/* Pelo servidor, sem tela: fn recebe o contexto e o "usuario" administrador (cada chamada e uma execucao nova). */
function noServidor(s, fn) {
  const c = s.contexto(DONO);
  c._porta = true;
  return fn(c, { email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') });
}
const idDaRotinaNoServidor = (s, tipo) => noServidor(s, (c) => c.listar('ROTINAS').find((r) => String(r.TIPO) === tipo).ID);
/* Os dias (do mes aberto no calendario) com pilula da sigla: "21,28". */
const diasDaSigla = (f, sigla) => f.evaluate((s) => [...document.querySelectorAll('.grade-mes .dia:not(.fora)')]
  .filter((d) => [...d.querySelectorAll('.pilula')].some((p) => p.textContent.trim().split(' ')[0] === s))
  .map((d) => d.querySelector('.dia-numero').textContent.trim()).join(','), sigla);
async function abrirMes(f, comp) {
  await f.evaluate((c) => abrir('calendario', { competencia: c }), comp);
  await f.waitForFunction((c) => paginaAtual === 'calendario' && DADOS && DADOS.competencia === c && !!document.querySelector('.grade-mes'), comp, { timeout: 15000 });
}
async function abrirRotinas(f) {
  await f.evaluate(() => { ABA_CFG = 'calendario'; abrir('config'); });
  await f.waitForFunction(() => paginaAtual === 'config' && !!document.querySelector('#conteudo-cfg .rot-botoes'), null, { timeout: 15000 });
}
/* A linha da rotina na lista: "RON | Ronda de segurança | toda quarta | — | ativa". */
const linhaDaRotina = (f, sigla) => f.evaluate((s) => {
  const tr = [...document.querySelectorAll('#conteudo-cfg tr')].find((t) => t.cells[0] && t.cells[0].textContent.trim() === s);
  return tr ? [...tr.cells].slice(0, 5).map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ') : '';
}, sigla);
/* Clica e devolve o recado NOVO (o texto do anterior continua no elemento). */
async function recadoDe(f, clique) {
  await f.evaluate(() => { const r = document.getElementById('recado'); r.textContent = ''; r.classList.add('oculto'); });
  await clique();
  await f.waitForFunction(() => document.getElementById('recado').textContent, null, { timeout: 15000 });
  return f.evaluate(() => (document.getElementById('recado').classList.contains('erro') ? '[ERRO] ' : '') + document.getElementById('recado').textContent);
}
const textoDe = async (f, sel) => (await f.textContent(sel)).replace(/\s+/g, ' ').trim();

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

  /*
   * Revisao de 19/10 (experiencia X5): os recados novos (rotina, painel, foto HEIC) tem 90 a 120 letras e
   * sumiam em 2,6 s; um recado novo sumia no prazo do anterior; o leitor de tela nao anunciava; no celular
   * o recado de erro cobria o Cancelar da janela. E o input.travado usava color-mix, que o Chrome 109 nao tem.
   */
  await cenario('recado: o texto longo fica o tempo de ler e um recado novo nao some no prazo do anterior; o leitor de tela anuncia e o toque passa para o botao de baixo; campo travado com o fundo de informacao sem color-mix (Chrome 109)', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, GERAL);
    const f = await frame(aba);
    const visivel = () => f.evaluate(() => !document.getElementById('recado').classList.contains('oculto'));
    const longo = 'Painel Nobreaks desativado em CD Feira de Santana: saiu do menu de todos, inclusive do seu. Os dados continuam guardados.';
    await f.evaluate((t) => avisar(t), longo);
    await aba.page.waitForTimeout(3500);
    afirmar(await visivel(), 'o recado de ' + longo.length + ' letras continua na tela depois de 3,5 s');
    await f.evaluate(() => avisar('Pronto'));
    await aba.page.waitForTimeout(1800);
    await f.evaluate((t) => avisar(t), longo);
    await aba.page.waitForTimeout(1500);                // 3,3 s depois do "Pronto": o prazo dele (2,6 s) ja passou
    afirmar(await visivel(), 'o recado novo nao sumiu no prazo do anterior');
    const recado = await f.evaluate(() => { const r = document.getElementById('recado'); return [r.getAttribute('role'), r.getAttribute('aria-live'), r.getAttribute('aria-atomic'), getComputedStyle(r).pointerEvents].join(' '); });
    afirmar(recado === 'status polite true none', 'recado anunciado e sem pegar o toque: ' + recado);
    const fundo = await f.evaluate(() => {
      const i = document.createElement('input'); i.className = 'travado'; document.body.appendChild(i);
      const claro = getComputedStyle(i).backgroundColor;
      aplicarTema('escuro'); const escuro = getComputedStyle(i).backgroundColor; aplicarTema('claro');
      i.remove();
      return claro + ' / ' + escuro;
    });
    afirmar(fundo === 'rgba(15, 23, 42, 0.06) / rgba(248, 250, 252, 0.06)', 'input.travado nos dois temas: ' + fundo);
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
    // 19/10: o "novo" do selo de comentario fica neste aparelho — so com IDs (da acao e do comentario)
    const dono = pelaPorta(s, DONO, DONO, '4321');
    const id = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    dono('comentarAcao', { id, texto: 'Lâmpadas compradas' });
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => abrir('acoes'));
    await f.waitForSelector('.cartao-acao .selo-coment.novo', { timeout: 15000 });
    await f.click('.cartao-acao .selo-coment');
    await f.waitForSelector('#janela:not(.oculto) .coment-item', { timeout: 10000 });
    const guardado = await f.evaluate(() => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
    });
    const txt = JSON.stringify(guardado);
    afirmar(/^\{"ACO-[^"]+":"COM-[^"]+"\}$/.test(guardado.gsl_coment_vistos || ''), 'o "visto" do comentario, so com IDs: ' + txt);
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

  /*
   * FOTO HEIC (19/10) — "Fotos do tipo HEIC nao estao sendo processadas pelas acoes". O Chromium,
   * como o Chrome 109 do CD, nao abre HEIC: a foto ia crua, sem previa, e o visor so dizia "Este
   * navegador nao mostra fotos HEIC". A HEIC daqui e de verdade (HEVC); a miniatura do Drive e
   * roteirizada pelo UrlFetch do emulador (emulador/miniatura-drive.js).
   */
  await cenario('plano de acao: foto HEIC do iPhone (o Chrome nao abre) vira JPEG pelo servidor — "Convertendo…" segura o Criar; previa, Drive e visor; tipo vazio e nome sem extensao; TIFF e PDF recusados na hora; JPEG nao vai ao servidor', async () => {
    const s = await subir(); instalarComPessoas(s);
    const drive = miniaturaDrive(s.mundo, { atraso: 1 });
    const heic = Buffer.from(HEIC_MINI, 'base64');
    const aba = await abrirAba(s, DONO);
    const pedidas = acoesPedidas(aba);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes', { situacao: 'TODAS' }); });
    await f.waitForFunction(paginaPronta, 'acoes', { timeout: 15000 });
    await f.evaluate(() => formAcao(null));
    const aceita = await f.getAttribute('#ac-fotos', 'accept');
    afirmar(aceita === 'image/*,.heic,.heif', 'accept no computador (o filtro do Windows mostra .heic): ' + aceita);
    afirmar(await texto(aba, 'ac-fotos-situacao') === 'até 5 por vez · JPG, PNG ou HEIC', 'dica: ' + await texto(aba, 'ac-fotos-situacao'));
    afirmar(await f.evaluate(() => { const x = document.getElementById('ac-fotos-situacao'); return x.getAttribute('role') === 'status' && x.getAttribute('aria-live') === 'polite'; }),
      'a situacao das fotos e anunciada ao leitor de tela');
    // cada conversao leva onde a foto vai (o servidor so converte para quem pode anexar ali): aqui, uma acao nova do Calendario
    const contextos = [];
    aba.page.on('request', (q) => {
      if (!/__gsr$/.test(q.url())) return;
      try { const j = JSON.parse(q.postData()); if (j.args[1] === 'converterFoto') contextos.push([j.args[2].plano, j.args[2].uso, j.args[2].id].join('/')); } catch (e) { /* outra chamada */ }
    });
    // o servidor demora: a tela diz o que esta fazendo e o Criar espera
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '1500', url: s.url }]);
    pedidas.length = 0;
    await f.setInputFiles('#ac-fotos', [
      { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic },
      { name: 'IMG_0002.HEIC', mimeType: '', buffer: heic },          // Windows sem a extensao HEIF: tipo vazio
      { name: '1000012345', mimeType: '', buffer: heic }              // seletor de fotos do Android: sem extensao
    ]);
    await f.waitForFunction(() => /^Convertendo /.test(document.getElementById('ac-fotos-situacao').textContent), null, { timeout: 10000 });
    const situacao = await texto(aba, 'ac-fotos-situacao');
    afirmar(situacao === 'Convertendo IMG_0001.HEIC para JPG (1 de 3) — leva alguns segundos…', 'situacao: ' + situacao);
    await f.click('.janela .botao >> text=Criar ação');
    afirmar(await texto(aba, 'recado') === 'Espere as fotos terminarem de ser preparadas e clique de novo.', 'o Criar espera: ' + await texto(aba, 'recado'));
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '0', url: s.url }]);
    await f.waitForFunction(() => !FOTOS_PREPARANDO.ac, null, { timeout: 30000 });
    const prontas = await f.evaluate(() => FOTOS_PENDENTES.ac.map((x) => x.nome + ' ' + x.tipo + (x.previa ? ' com previa' : ' sem previa')).join(' | '));
    afirmar(prontas === 'IMG_0001.jpg image/jpeg com previa | IMG_0002.jpg image/jpeg com previa | 1000012345.jpg image/jpeg com previa', 'prontas: ' + prontas);
    afirmar(await f.evaluate(() => document.querySelectorAll('#ac-previas img').length) === 3, 'tres previas');
    afirmar(pedidas.filter((n) => n === 'converterFoto').length === 3, 'uma chamada por foto: ' + pedidas.join());
    afirmar(drive.log.filter((l) => l === 'miniatura =s1600 (Bearer)').length === 3 && drive.log.every((l) => / \(Bearer\)$/.test(l)), 'miniatura do Drive: ' + drive.log.join(' | '));
    afirmar(drive.apagadas.length === 3 && !pastasDeConversao(s.mundo).length, 'uma pasta por foto, todas apagadas de vez: ' + JSON.stringify(drive.apagadas));
    afirmar(contextos.join() === 'CALENDARIO/ac/,CALENDARIO/ac/,CALENDARIO/ac/', 'contexto de cada conversao: ' + contextos.join());
    // TIFF e PDF: recusados na hora, sem ir ao servidor; a JPEG e reduzida aqui, como sempre
    pedidas.length = 0;
    await escolherFotos(f, 'ac', { name: 'scan.tif', mimeType: 'image/tiff', buffer: Buffer.from('49492a000800000000000000', 'hex') });
    afirmar(await texto(aba, 'recado') === '"scan.tif" não abre como foto neste navegador. Envie JPG, PNG ou HEIC.', 'tiff: ' + await texto(aba, 'recado'));
    await escolherFotos(f, 'ac', { name: 'relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    afirmar(await texto(aba, 'recado') === '"relatorio.pdf" não é uma foto. Envie JPG, PNG ou HEIC.', 'pdf: ' + await texto(aba, 'recado'));
    await escolherFotos(f, 'ac', { name: 'doca.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_MINI, 'base64') });
    afirmar(await f.evaluate(() => FOTOS_PENDENTES.ac.length === 4 && !!FOTOS_PENDENTES.ac[3].previa), 'a JPEG entrou com previa');
    afirmar(!pedidas.includes('converterFoto'), 'TIFF, PDF e JPEG nao vao ao conversor: ' + pedidas.join());
    await f.fill('#ac-acao', 'Doca 3 com piso solto');
    await f.check('.ac-resp[value="' + DONO + '"]');
    await f.fill('#ac-prazo', '2026-12-01');
    await f.click('.janela .botao >> text=Criar ação');
    await f.waitForFunction(() => (planoD().lista || []).some((a) => a.acao === 'Doca 3 com piso solto' && a.fotos.length === 4), null, { timeout: 20000 });
    const a = await f.evaluate(() => planoD().lista.find((x) => x.acao === 'Doca 3 com piso solto'));
    const noDrive = a.fotos.map((x) => { const d = s.mundo.arquivos.get(x.id); return d.nome + ' ' + d.mime + (d.bytes[0] === 0xff && d.bytes[1] === 0xd8 ? ' JPEG' : ' ?'); });
    afirmar(noDrive.join(' | ') === 'IMG_0001.jpg image/jpeg JPEG | IMG_0002.jpg image/jpeg JPEG | 1000012345.jpg image/jpeg JPEG | doca.jpg image/jpeg JPEG', 'no Drive: ' + noDrive.join(' | '));
    const pasta = s.mundo.pastas.get([...s.mundo.arquivos.get(a.fotos[0].id).pais][0]);
    afirmar(pasta.nome === a.id && s.mundo.pastas.get([...pasta.pais][0]).nome === 'ACOES', 'na pasta da acao (ACOES/<id>)');
    await f.evaluate((id) => verFotosDaAcao(id), a.id);
    await f.waitForFunction(visorComFoto, null, { timeout: 15000 });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('limpeza no Android: accept so image/*; HEIC sem miniatura na hora vai como veio (aviso, previa "HEIC ·") e o visor converte depois; a HEIC antiga, gravada crua pela versao anterior, abre no visor e o Baixar sai .jpg', async () => {
    const s = await subir(); instalarComPessoas(s);
    const drive = miniaturaDrive(s.mundo, { nunca: true });
    // a foto da versao anterior: a tela mandava a HEIC crua e o servidor a gravava image/heic
    const c = s.contexto(DONO); c._porta = true;
    const antiga = c.acaoSalvarAcaoLimpeza({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') },
      { acao: 'Foto antiga do iPhone', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [DONO], fotos: [{ nome: 'IMG_0100.HEIC', tipo: 'image/heic', dados: HEIC_MINI }] });
    // um Samsung com HEIF ligado: o Chrome do Android tambem nao abre HEIC
    const contexto = await navegador.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36' });
    const aba = await abrirAba(s, DONO, { contexto });
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('limpeza'); });
    await f.waitForFunction(() => document.querySelectorAll('#pagina .abas .aba').length >= 5, null, { timeout: 15000 });
    await f.click('#pagina .abas .aba[data-aba="plano"]');
    await f.click('#acoes-topo >> text=Nova ação');
    const aceita = await f.getAttribute('#ac-fotos', 'accept');
    afirmar(aceita === 'image/*', 'accept no Android (extensao derruba o seletor de fotos): ' + aceita);
    await escolherFotos(f, 'ac', { name: 'IMG_0004.HEIC', mimeType: 'image/heic', buffer: Buffer.from(HEIC_MINI, 'base64') });
    const recado = await texto(aba, 'recado');
    afirmar(recado === 'A foto "IMG_0004.HEIC" vai como está: o Google ainda não terminou de convertê-la. Ela aparece normalmente quando alguém abrir a ação.', 'aviso: ' + recado);
    const previa = await f.evaluate(() => document.getElementById('ac-previas').innerText.replace(/\s+/g, ' ').trim());
    afirmar(/^HEIC · IMG_0004\.HEIC/.test(previa) && await f.evaluate(() => FOTOS_PENDENTES.ac[0].tipo === 'image/heic'), 'previa: ' + previa);
    afirmar(drive.log.filter((l) => /^files\.get/.test(l)).length === 9 && drive.apagadas.length === 1 && !pastasDeConversao(s.mundo).length,
      'esperou a miniatura (9 consultas) e a pasta saiu de vez: ' + drive.log.join(' | '));
    await f.fill('#ac-acao', 'Banheiro da doca sem papel');
    await f.check('.ac-resp[value="' + DONO + '"]');
    await f.fill('#ac-prazo', '2026-12-01');
    await f.click('.janela .botao >> text=Criar ação');
    await f.waitForFunction(() => ((DADOS.plano || {}).lista || []).some((a) => a.acao === 'Banheiro da doca sem papel' && a.fotos.length === 1), null, { timeout: 20000 });
    const nova = await f.evaluate(() => DADOS.plano.lista.find((x) => x.acao === 'Banheiro da doca sem papel'));
    const gravada = s.mundo.arquivos.get(nova.fotos[0].id);
    afirmar(gravada.nome === 'IMG_0004.HEIC' && gravada.mime === 'image/heic', 'no Drive, como veio: ' + gravada.nome + ' ' + gravada.mime);
    // o Google ainda sem a miniatura: o visor explica e nao guarda a HEIC
    await f.evaluate((id) => verFotosDaAcao(id), nova.id);
    await f.waitForFunction(() => /preparando/.test(document.getElementById('visor-imagem').textContent), null, { timeout: 15000 });
    const aviso = await f.evaluate(() => document.getElementById('visor-imagem').innerText.trim());
    afirmar(aviso === 'O Google ainda está preparando esta foto HEIC. Feche e abra de novo em alguns segundos — ou use Baixar.', 'visor: ' + aviso);
    afirmar(await f.evaluate((id) => !FOTO_CACHE.has(id), nova.fotos[0].id), 'a HEIC nao fica no cache do visor');
    // a miniatura ficou pronta: abrir de novo mostra a foto
    drive.roteiro.nunca = false;
    await f.evaluate((id) => { visorFechar(); verFotosDaAcao(id); }, nova.id);
    await f.waitForFunction(visorComFoto, null, { timeout: 15000 });
    // a HEIC antiga abre convertida, e o Baixar entrega .jpg (o Windows abre)
    await f.evaluate((id) => { visorFechar(); verFotosDaAcao(id); }, antiga.id);
    await f.waitForFunction(visorComFoto, null, { timeout: 15000 });
    const [baixado] = await Promise.all([aba.page.waitForEvent('download', { timeout: 10000 }), f.click('#visor-baixar')]);
    afirmar(baixado.suggestedFilename() === 'IMG_0100.jpg', 'Baixar: ' + baixado.suggestedFilename());
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /*
   * REVISAO DE 19/10 — FOTO HEIC. A conversao leva segundos no servidor: a janela pode fechar ou ser
   * trocada no meio (H1), a rede ou o canal podem cair (H2), a pessoa pode escolher mais fotos (H3).
   */
  const fotosHeic = (n) => Array.from({ length: n }, (x, i) => ({ name: 'IMG_000' + (i + 1) + '.HEIC', mimeType: 'image/heic', buffer: Buffer.from(HEIC_MINI, 'base64') }));
  /* Os recados que aparecem, com a janela em que apareceram ("fechada" quando nenhuma). */
  const vigiarRecados = (f) => f.evaluate(() => {
    window.__recados = [];
    const r = document.getElementById('recado');
    new MutationObserver(() => {
      if (r.classList.contains('oculto') || !r.textContent) return;
      const janela = document.getElementById('janela');
      window.__recados.push('[' + (janela.classList.contains('oculto') ? 'fechada' : document.getElementById('janela-titulo').textContent) + '] ' + r.textContent);
    }).observe(r, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  async function planoComHeic(s, conta, pin) {
    const aba = await abrirAba(s, conta);
    await entrar(aba, conta, pin, true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes', { situacao: 'TODAS' }); });
    await f.waitForFunction(paginaPronta, 'acoes', { timeout: 15000 });
    return { aba, f };
  }

  await cenario('foto HEIC: Cancelar, os Comentarios de outra acao ou outra Nova acao no lugar durante a conversao param tudo — nenhuma conversao a mais, nenhum recado por cima da outra janela; o Criar da janela nova grava sem foto', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { nunca: true });           // o "vai como esta" sairia de cada conversao
    const c = s.contexto(DONO); c._porta = true;
    const outra = c.acaoSalvarAcao({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') },
      { acao: 'Empilhadeira 7 com vazamento', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [DONO] }).id;
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    const pedidas = acoesPedidas(aba);
    let respondidas = 0;
    aba.page.on('response', (r) => { try { if (/__gsr$/.test(r.url()) && JSON.parse(r.request().postData()).args[1] === 'converterFoto') respondidas++; } catch (e) { /* outra */ } });
    await vigiarRecados(f);
    for (const [rotulo, trocar] of [['Cancelar', () => f.click('#janela-rodape .botao.secundario >> text=Cancelar')],
      ['Comentarios de outra acao', () => f.evaluate((id) => abrirComentarios(id, true), outra)],
      ['outra Nova acao', () => f.evaluate(() => formAcao(null))]]) {
      await f.evaluate(() => formAcao(null));
      await aba.contexto.addCookies([{ name: 'gas_atraso', value: '1500', url: s.url }]);
      pedidas.length = 0; respondidas = 0;
      await f.setInputFiles('#ac-fotos', fotosHeic(3));
      await f.waitForFunction(() => /^Convertendo IMG_0001\.HEIC para JPG \(1 de 3\)/.test(document.getElementById('ac-fotos-situacao').textContent), null, { timeout: 10000 });
      await trocar();
      // a conversao que ja estava no servidor volta; espera mais que o atraso de outra ida
      for (let i = 0; i < 100 && !respondidas; i++) await aba.page.waitForTimeout(100);
      await aba.page.waitForTimeout(2500);
      const conv = pedidas.filter((n) => n === 'converterFoto').length;
      const recados = await f.evaluate(() => window.__recados.filter((x) => /HEIC/.test(x)));
      afirmar(respondidas === 1 && conv === 1 && !recados.length, rotulo + ': ' + conv + ' conversao(oes), recados ' + JSON.stringify(recados));
    }
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '0', url: s.url }]);
    afirmar(await f.evaluate(() => !FOTOS_PENDENTES.ac.length && !FOTOS_PREPARANDO.ac && document.getElementById('ac-previas').innerHTML === ''), 'a janela nova nao tem foto nem espera');
    await f.fill('#ac-acao', 'Doca 3 sem luz');
    await f.check('.ac-resp[value="' + DONO + '"]');
    await f.fill('#ac-prazo', '2026-12-01');
    await f.click('.janela .botao >> text=Criar ação');
    await f.waitForFunction(() => (planoD().lista || []).some((a) => a.acao === 'Doca 3 sem luz'), null, { timeout: 20000 });
    afirmar(await f.evaluate(() => planoD().lista.find((a) => a.acao === 'Doca 3 sem luz').fotos.length) === 0, 'a acao nova foi gravada sem foto');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /*
   * 20/10 — A ROTA QUE FUNCIONA. Com o canal barrado, a foto ia ser recusada ("Este computador bloqueia...");
   * agora a gravacao com foto vai pela pagina, o 403 do primeiro clique segue sozinho pela pagina, e a pagina
   * que so ACHA que o canal e barrado confere com a sonda antes de recusar (a primeira foto do visor).
   */
  await cenario('canal barrado: criar acao com foto (JPEG e HEIC crua) grava pela pagina (1 POST) e as fotos ficam na acao', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { atraso: 1 });
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    await aba.contexto.addCookies([{ name: 'gas_403', value: '1', url: s.url }]);
    await f.evaluate(() => formAcao(null));
    await escolherFotos(f, 'ac', [{ name: 'doca.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_MINI, 'base64') }]);
    await escolherFotos(f, 'ac', fotosHeic(1));
    afirmar(await f.evaluate(() => CANAL_BARRADO && FOTOS_PENDENTES.ac.map((x) => x.tipo).join(',') === 'image/jpeg,image/heic'), 'duas fotos prontas com o canal barrado');
    await f.fill('#ac-acao', 'Doca 5 com goteira');
    await f.check('.ac-resp[value="' + DONO + '"]');
    await f.fill('#ac-prazo', '2026-12-01');
    const posts = []; aba.page.on('request', (r) => { if (r.method() === 'POST' && /\/exec/.test(r.url())) posts.push(r.postData().length); });
    await f.click('.janela .botao >> text=Criar ação');
    const g = await paginaNova(aba, () => paginaAtual === 'acoes' && (planoD().lista || []).some((a) => a.acao === 'Doca 5 com goteira'));
    const fotos = await g.evaluate(() => planoD().lista.find((a) => a.acao === 'Doca 5 com goteira').fotos.map((x) => x.nome).join(','));
    afirmar(posts.length === 1 && fotos === 'doca.jpg,IMG_0001.HEIC', 'um POST com as fotos (' + posts.length + '): ' + fotos);
    const recado = await g.evaluate(() => document.getElementById('recado').textContent);
    afirmar(!/bloqueia/.test(recado), 'sem a recusa de antes: ' + recado);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal: o Google recusa o primeiro clique (HTTP 403) — o comentario segue pela pagina sozinho, sem erro na tela, e grava uma vez so', async () => {
    const s = await subir(); instalarComPessoas(s);
    const c = s.contexto(DONO); c._porta = true;
    const id = c.acaoSalvarAcao({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') },
      { acao: 'Portão 2 travando', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [DONO] }).id;
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    await f.evaluate((i) => abrirComentarios(i, true), id);
    await f.fill('#cm-texto', 'Peça pedida ao fornecedor');
    await aba.contexto.addCookies([{ name: 'gas_falha', value: 'executarAcaoETela:403:1', url: s.url }]);
    await f.click('.janela .botao >> text=Registrar comentário');
    const g = await paginaNova(aba, (i) => paginaAtual === 'acoes' && (planoD().lista || []).some((a) => a.id === i && a.comentarios.some((x) => x.texto === 'Peça pedida ao fornecedor')), id);
    const coment = s.contexto(DONO).listar('COMENTARIOS').filter((x) => x.TEXTO === 'Peça pedida ao fornecedor');
    const recado = await g.evaluate(() => (document.getElementById('recado').classList.contains('erro') ? '[ERRO] ' : '') + document.getElementById('recado').textContent);
    afirmar(coment.length === 1 && !/ERRO|bloque/.test(recado), 'gravou uma vez pela pagina: ' + coment.length + ' / ' + recado);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('pagina que so acha que o canal e barrado (veio da reserva, o canal voltou): a primeira foto do visor abre — a sonda confere antes de recusar; queda de rede nao vira "o Google bloqueou"', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { atraso: 1 });
    const c = s.contexto(DONO); c._porta = true;
    const id = c.acaoSalvarAcao({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') }, { acao: 'Rampa 1 quebrada', prazo: '2026-12-01', turno: 'A',
      responsaveisEmails: [DONO], fotos: [{ nome: 'IMG_0400.HEIC', tipo: 'image/heic', dados: HEIC_MINI }, { nome: 'rampa.jpg', tipo: 'image/jpeg', dados: JPEG_MINI }] }).id;
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    await f.evaluate(() => lembrarCanalBarrado());              // como a pagina que veio pela reserva
    const pedidas = acoesPedidas(aba);
    await f.evaluate((i) => verFotosDaAcao(i), id);
    await f.waitForFunction(visorComFoto, null, { timeout: 20000 });
    afirmar(await f.evaluate(() => !CANAL_BARRADO && !document.querySelector('#visor-imagem .erro-caixa')), 'a primeira foto abriu e a marca de barrado saiu');
    afirmar(pedidas.filter((n) => n === 'fotoAcao').length === 1, 'uma ida so pela foto: ' + pedidas.join(','));
    const texto = await f.evaluate(() => explicarErro('NetworkError: Connection failure due to HTTP 500'));
    afirmar(/^A conexão com o Google caiu/.test(texto) && !/bloqueou/.test(texto), 'queda de rede: ' + texto);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('foto HEIC: a conexao cai na conversao (HTTP 500) — a foto vai como esta, com o aviso em portugues; canal barrado (HTTP 403) — tambem vai crua (a gravacao vai pela pagina)', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { atraso: 1 });
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    await f.evaluate(() => formAcao(null));
    await aba.contexto.addCookies([{ name: 'gas_falha', value: 'executarAcao:500:1', url: s.url }]);
    let recado = await recadoDe(f, () => escolherFotos(f, 'ac', fotosHeic(1)));
    afirmar(recado === '[ERRO] A foto "IMG_0001.HEIC" vai como está: a conexão com o Google falhou na conversão. Ela aparece normalmente quando alguém abrir a ação.', 'HTTP 500: ' + recado);
    const r = await f.evaluate(() => ({ fotos: FOTOS_PENDENTES.ac.map((x) => x.nome + ' ' + x.tipo).join(' | '), previa: document.getElementById('ac-previas').innerText.trim(), barrado: CANAL_BARRADO }));
    afirmar(r.fotos === 'IMG_0001.HEIC image/heic' && /^HEIC · IMG_0001\.HEIC/.test(r.previa) && !r.barrado, 'foi como veio: ' + JSON.stringify(r));
    await f.evaluate(() => formAcao(null));
    await aba.contexto.addCookies([{ name: 'gas_403', value: '1', url: s.url }]);
    recado = await recadoDe(f, () => escolherFotos(f, 'ac', fotosHeic(1)));
    afirmar(recado === '[ERRO] A foto "IMG_0001.HEIC" vai como está: este computador não deixa o Google convertê-la agora. Ela aparece normalmente quando alguém abrir a ação.', 'HTTP 403: ' + recado);
    afirmar(await f.evaluate(() => FOTOS_PENDENTES.ac.length === 1 && FOTOS_PENDENTES.ac[0].tipo === 'image/heic' && CANAL_BARRADO), 'canal barrado: a HEIC vai crua');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('foto HEIC: segunda escolha durante a conversao — a vaga da HEIC ja conta (5 no maximo, a sexta e recusada na hora) e o "N foto(s) prontas" espera a conversao', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { atraso: 1 });
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    await f.evaluate(() => formAcao(null));
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '2500', url: s.url }]);
    await f.setInputFiles('#ac-fotos', fotosHeic(1));
    await f.waitForFunction(() => /^Convertendo IMG_0001\.HEIC para JPG — /.test(document.getElementById('ac-fotos-situacao').textContent), null, { timeout: 10000 });
    const jpeg = Buffer.from(JPEG_MINI, 'base64');
    const recado = await recadoDe(f, () => f.setInputFiles('#ac-fotos', [1, 2, 3, 4, 5].map((i) => ({ name: 'doca' + i + '.jpg', mimeType: 'image/jpeg', buffer: jpeg }))));
    afirmar(recado === '[ERRO] No máximo 5 fotos de cada vez.', 'a sexta: ' + recado);
    await f.waitForFunction(() => FOTOS_PENDENTES.ac.length === 4 && FOTOS_PREPARANDO.ac === 1, null, { timeout: 10000 });
    const durante = await texto(aba, 'ac-fotos-situacao');
    afirmar(/^Convertendo IMG_0001\.HEIC para JPG — /.test(durante), 'a situacao continua a da conversao: ' + durante);
    await f.waitForFunction(() => !FOTOS_PREPARANDO.ac, null, { timeout: 30000 });
    await aba.contexto.addCookies([{ name: 'gas_atraso', value: '0', url: s.url }]);
    const fim = await f.evaluate(() => ({ fotos: FOTOS_PENDENTES.ac.map((x) => x.nome).join(','), situacao: document.getElementById('ac-fotos-situacao').textContent }));
    afirmar(fim.fotos === 'doca1.jpg,doca2.jpg,doca3.jpg,doca4.jpg,IMG_0001.jpg' && fim.situacao === '5 foto(s) prontas para enviar', 'no fim: ' + JSON.stringify(fim));
    await f.fill('#ac-acao', 'Doca 3 com piso solto');
    await f.check('.ac-resp[value="' + DONO + '"]');
    await f.fill('#ac-prazo', '2026-12-01');
    await f.click('.janela .botao >> text=Criar ação');
    await f.waitForFunction(() => (planoD().lista || []).some((a) => a.acao === 'Doca 3 com piso solto' && a.fotos.length === 5), null, { timeout: 20000 });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('visor da HEIC sem miniatura: "preparando" (fica fora do cache); gravada ha mais de 10 min, o Google desistiu (usar Baixar, e fica guardada); com o Acoes.gs de antes, o texto de sempre', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { nunca: true });
    const c = s.contexto(DONO); c._porta = true;
    const id = c.acaoSalvarAcao({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') }, { acao: 'Três fotos do iPhone', prazo: '2026-12-01', turno: 'A',
      responsaveisEmails: [DONO], fotos: ['IMG_0300.HEIC', 'IMG_0301.HEIC', 'IMG_0302.HEIC'].map((n) => ({ nome: n, tipo: 'image/heic', dados: HEIC_MINI })) }).id;
    const { aba, f } = await planoComHeic(s, DONO, '4321');
    const fotos = await f.evaluate((i) => planoD().lista.find((a) => a.id === i).fotos.map((x) => x.id), id);
    s.mundo.arquivos.get(fotos[1]).criado = new Date(Date.now() - 11 * 60 * 1000);     // gravada ha 11 min
    // a terceira como o Acoes.gs de antes devolve: a HEIC crua, sem dizer se tentou converter
    await aba.page.route('**/__gsr', async (route) => {
      let j = {}; try { j = JSON.parse(route.request().postData() || '{}'); } catch (e) { /* nao e chamada */ }
      if (!(j.fn === 'executarAcao' && j.args && j.args[1] === 'fotoAcao' && j.args[2].arquivo === fotos[2])) return route.continue();
      const r = JSON.parse(await (await route.fetch()).text());
      const v = JSON.parse(r.valor); delete v.semMiniatura; delete v.desistiu; r.valor = JSON.stringify(v);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
    });
    const textoDoVisor = async (n) => {
      await f.waitForFunction((x) => VISOR && VISOR.i === x && !!VISOR.url, n, { timeout: 15000 });
      return f.evaluate(() => document.getElementById('visor-imagem').innerText.trim());
    };
    await f.evaluate((i) => verFotosDaAcao(i), id);
    afirmar(await textoDoVisor(0) === 'O Google ainda está preparando esta foto HEIC. Feche e abra de novo em alguns segundos — ou use Baixar.', 'preparando');
    await f.evaluate(() => visorAndar(1));
    afirmar(await textoDoVisor(1) === 'O Google não conseguiu converter esta foto HEIC para mostrar aqui. Use Baixar para abrir no computador.', 'desistiu');
    await f.evaluate(() => visorAndar(1));
    afirmar(await textoDoVisor(2) === 'Este navegador não mostra fotos HEIC. Use Baixar para abrir no computador.', 'Acoes.gs de antes');
    const cache = await f.evaluate((ids) => ids.map((x) => FOTO_CACHE.has(x)).join(','), fotos);
    afirmar(cache === 'false,true,true', 'so a que o Google ainda prepara fica fora do cache: ' + cache);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('foto HEIC da coordenadora (que nao cria acao): converte no comentario e na conclusao da acao dela — a tela manda o plano, o uso e a acao', async () => {
    const s = await subir(); instalarComPessoas(s);
    miniaturaDrive(s.mundo, { atraso: 1 });
    const dono = criarPin(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    const r = s.chamar(DONO, 'executarAcao', { t: dono.token, f: dono.filial.codigo }, 'salvarAcao', { acao: 'Doca 7 sem luz', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
    const id = JSON.parse(r.valor).id;
    const aba = await abrirAba(s, GERAL);
    const contextos = [];
    aba.page.on('request', (q) => {
      if (!/__gsr$/.test(q.url())) return;
      try { const j = JSON.parse(q.postData()); if (j.args[1] === 'converterFoto') contextos.push([j.args[2].plano, j.args[2].uso, j.args[2].id === id ? 'ID' : j.args[2].id].join('/')); } catch (e) { /* outra */ }
    });
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao'], 20000);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForFunction(paginaPronta, 'acoes', { timeout: 15000 });
    await f.evaluate((i) => abrirComentarios(i, true), id);
    await escolherFotos(f, 'cm', fotosHeic(1));
    afirmar(await f.evaluate(() => FOTOS_PENDENTES.cm.map((x) => x.nome + ' ' + x.tipo).join()) === 'IMG_0001.jpg image/jpeg', 'convertida no comentario');
    await f.evaluate((i) => { fecharJanela(); formConcluirAcao(i); }, id);
    await escolherFotos(f, 'cc', fotosHeic(1));
    afirmar(await f.evaluate(() => FOTOS_PENDENTES.cc.map((x) => x.nome + ' ' + x.tipo).join()) === 'IMG_0001.jpg image/jpeg', 'convertida na conclusao');
    afirmar(contextos.join() === 'CALENDARIO/cm/ID,CALENDARIO/cc/ID', 'contextos: ' + contextos.join());
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /* No iPhone e no iPad o proprio iOS converte a HEIC para JPEG — se o accept nao listar .heic. O iPadOS se diz Mac: o toque o separa. */
  await cenario('foto no iPhone e no iPad (o iPadOS se diz Mac, com toque): accept so image/*; no Mac sem toque, as extensoes', async () => {
    const s = await subir(); instalarComPessoas(s);
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    for (const [rotulo, ua, toques, esperado] of [['iPhone', IPHONE, 5, 'image/*'], ['iPad', MAC, 5, 'image/*'], ['Mac sem toque', MAC, 0, 'image/*,.heic,.heif']]) {
      const contexto = await navegador.newContext({ userAgent: ua });
      await contexto.addInitScript((n) => { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n, configurable: true }); }, toques);
      const aba = await abrirAba(s, DONO, { contexto });
      const f = await frame(aba);
      const aceita = await f.evaluate(() => /accept="([^"]*)"/.exec(fotosCampoHtml('ac', 'Fotos'))[1]);
      afirmar(aceita === esperado, rotulo + ': ' + aceita);
      afirmar(!aba.erros.length, rotulo + ': erros ' + aba.erros.join(' | '));
      await contexto.close();
    }
    await s.fechar();
  });

  /* Implantacao pela metade: a tela nova com o Codigo.gs (ou o Acoes.gs) de antes, que nao converte. */
  for (const [velho, de, para] of [['Codigo.gs', /\n\s*converterFoto:[^\n]*/, ''], ['Acoes.gs', 'function acaoConverterFoto(', 'function acaoDeOutraVersao(']]) {
    await cenario('implantacao pela metade (' + velho + ' de antes, sem o converterFoto): a HEIC vai como ia antes e a acao e criada', async () => {
      const fs = require('fs'), os = require('os');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-heic-'));
      try {
        fs.readdirSync(PASTA).forEach((n) => fs.copyFileSync(path.join(PASTA, n), path.join(tmp, n)));
        fs.writeFileSync(path.join(tmp, velho), fs.readFileSync(path.join(PASTA, velho), 'utf8').replace(de, para));
        const s = await subir({ pasta: tmp }); instalarComPessoas(s);
        miniaturaDrive(s.mundo);
        const aba = await abrirAba(s, DONO);
        const pedidas = acoesPedidas(aba);
        await entrar(aba, DONO, '4321', true);
        await esperarTela(aba, ['aplicacao']);
        const f = await frame(aba);
        await f.evaluate(() => { esquecerTelas(); abrir('acoes', { situacao: 'TODAS' }); });
        await f.waitForFunction(paginaPronta, 'acoes', { timeout: 15000 });
        await f.evaluate(() => formAcao(null));
        await escolherFotos(f, 'ac', { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from(HEIC_MINI, 'base64') });
        const pronta = await f.evaluate(() => FOTOS_PENDENTES.ac.map((x) => x.nome + ' ' + x.tipo + (x.previa ? ' com previa' : ' sem previa')).join(' | '));
        afirmar(pedidas.includes('converterFoto') && pronta === 'IMG_0001.HEIC image/heic sem previa', 'tentou converter e ficou como veio: ' + pronta + ' / ' + pedidas.join());
        afirmar(/^HEIC · IMG_0001\.HEIC/.test(await f.evaluate(() => document.getElementById('ac-previas').innerText.trim())), 'previa HEIC');
        await f.fill('#ac-acao', 'Doca 5');
        await f.check('.ac-resp[value="' + DONO + '"]');
        await f.fill('#ac-prazo', '2026-12-01');
        await f.click('.janela .botao >> text=Criar ação');
        await f.waitForFunction(() => (planoD().lista || []).some((a) => a.acao === 'Doca 5' && a.fotos.length === 1), null, { timeout: 20000 });
        const id = await f.evaluate(() => planoD().lista.find((x) => x.acao === 'Doca 5').fotos[0].id);
        afirmar(s.mundo.arquivos.get(id).mime === 'image/heic', 'gravada como veio');
        afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
        await aba.contexto.close(); await s.fechar();
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    });
  }

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
    // 21/10: nota em branco (Disciplina) numa linha sem a formula da media — um traco, nao zero; a media geral so com as notas dadas
    abaResp.dados.splice(14, 0, [new s.mundo.DataDoScript(hj.getFullYear(), hj.getMonth(), hj.getDate(), 7, 0, 0), 'x@bartofil.com.br', 'Avaliador Doze',
      'DEVOLUÇÃO', 'Daniela Esteves Teste', 4, '', 5, 3, 4, 'Atenta', 'Nada', '']);
    await f.click('#acoes-topo button:has-text("Atualizar dados")');
    await f.waitForFunction(() => DADOS && DADOS.lista && DADOS.lista.some((x) => x.nomeOriginal === 'Daniela Esteves Teste' && x.status === 'Pendente'), null, { timeout: 15000 });
    await f.waitForSelector('#apz-sel', { timeout: 10000 });
    await f.selectOption('#apz-sel', await f.evaluate(() => DADOS.lista.find((x) => x.nomeOriginal === 'Daniela Esteves Teste').chave));
    await f.waitForSelector('.apz-feedback', { timeout: 10000 });
    const semNota = await f.evaluate(() => ({
      kpi: document.querySelector('[data-kpi="media"]').textContent,
      barras: Array.from(document.querySelectorAll('#apz-competencias text[font-weight="600"]')).map((t) => t.textContent).join(' '),
      radar: Array.from(document.querySelectorAll('#apz-g-radar tspan')).map((t) => t.textContent).join(' '),
      media: document.querySelector('.apz-feedback-quem').textContent.replace(/\s+/g, ' ').trim()
    }));
    afirmar(semNota.kpi === '4 / 5' && semNota.barras === '4 5 3 4 —' && semNota.radar === '4 5 3 4 —' && /Média: 4$/.test(semNota.media),
      'nota em branco: ' + JSON.stringify(semNota));
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

  /*
   * REMOVER (20/10) — "quando eu disser que e para excluir, ele tem que excluir". O Remover do item
   * pergunta antes (sem ir ao servidor), diz quantas movimentacoes vao junto e deixa escolher.
   */
  const confirmacaoDoRemover = async (f, nome) => {
    await f.click('#est-tabela-itens tr:has(strong:text-is("' + nome + '")) >> text=Editar');
    await f.waitForSelector('#ei-nome');
    await f.click('#janela-rodape >> text=Remover');
    await f.waitForFunction(() => /^Excluir “/.test(document.getElementById('janela-titulo').textContent), null, { timeout: 5000 });
    return f.evaluate(() => ({
      titulo: document.getElementById('janela-titulo').textContent,
      texto: document.getElementById('janela-corpo').textContent.replace(/\s+/g, ' ').trim(),
      botoes: [...document.querySelectorAll('#janela-rodape button')].map((b) => b.textContent.trim() + (b.classList.contains('perigo') ? ' [vermelho]' : '')).join(' | ')
    }));
  };
  const TEXTO_EXCLUIR = (quais, fim) => 'Excluir apaga o item e ' + quais + ' do saldo, do histórico e dos relatórios. ' + fim;
  const PARA_DESATIVAR = 'Para só tirar o item de uso e manter o histórico, desative o item.';

  await cenario('estoque: Remover pergunta antes — diz quantas movimentacoes vao junto (inclusive as de mais de 90 dias); Voltar, Desativar (manter o historico) e Excluir mesmo assim; sem movimentacao so Excluir; Limpeza igual', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(async () => {
      await executarAcaoSrv('salvarItemEstoque', { nome: 'Mouse USB', saldoInicial: '10' });
      await executarAcaoSrv('movimentarEstoque', { tipo: 'SAIDA', item: 'TI-0001', quantidade: '3', destino: 'Recebimento' });
      await executarAcaoSrv('salvarItemEstoque', { nome: 'Teclado', saldoInicial: '5' });
      await executarAcaoSrv('salvarItemEstoque', { nome: 'Cabo HDMI' });
    });
    // uma entrada de mais de 90 dias (a tela nao a leva, mas ela vai junto e entra na conta)
    noServidor(s, (c) => c.inserir('EST_MOVIMENTOS', { DATA: '2025-01-10', TIPO: 'ENTRADA', ITEM: 'TI-0001', QUANTIDADE: 1 }, DONO));
    await f.evaluate(() => { esquecerTelas(); abrir('estoque'); });
    await f.waitForFunction(() => paginaAtual === 'estoque' && !!document.querySelector('#est-tabela-itens'), null, { timeout: 15000 });
    const pedidas = acoesPedidas(aba);
    let c = await confirmacaoDoRemover(f, 'Mouse USB');
    afirmar(c.titulo === 'Excluir “Mouse USB”?', 'titulo: ' + c.titulo);
    afirmar(c.texto === TEXTO_EXCLUIR('as 3 movimentações dele: saem', PARA_DESATIVAR), 'texto: ' + c.texto);
    afirmar(c.botoes === 'Voltar | Desativar (manter o histórico) | Excluir mesmo assim [vermelho]', 'botoes: ' + c.botoes);
    afirmar(!pedidas.length, 'a confirmacao abriu sem ir ao servidor: ' + pedidas.join());
    // Voltar: de volta ao formulario do item
    await f.click('#janela-rodape >> text=Voltar');
    await f.waitForFunction(() => document.getElementById('ei-nome') && document.getElementById('ei-nome').value === 'Mouse USB', null, { timeout: 5000 });
    await f.click('#janela-rodape >> text=Remover');
    await f.waitForSelector('#janela-rodape >> text=Desativar (manter o histórico)');
    let r = await recadoDe(f, () => f.click('#janela-rodape >> text=Desativar (manter o histórico)'));
    afirmar(r === 'Item TI-0001 desativado. O histórico continua guardado.', 'desativar: ' + r);
    await f.waitForFunction(() => { const i = DADOS.itens.find((x) => x.codigo === 'TI-0001'); return i && !i.ativo && i.saldo === 8 && i.movimentacoes === 3; }, null, { timeout: 15000 });
    // inativo: sem o Desativar
    await f.click('.lp-filtro >> text=Inativos');
    c = await confirmacaoDoRemover(f, 'Mouse USB');
    afirmar(c.texto === TEXTO_EXCLUIR('as 3 movimentações dele: saem', 'O item já está desativado: deixando assim, o histórico continua guardado.'), 'inativo: ' + c.texto);
    afirmar(c.botoes === 'Voltar | Excluir mesmo assim [vermelho]', 'botoes do inativo: ' + c.botoes);
    r = await recadoDe(f, () => f.click('#janela-rodape >> text=Excluir mesmo assim'));
    afirmar(r === 'Item TI-0001 excluído, com as 3 movimentações dele.', 'excluir: ' + r);
    await f.waitForFunction(() => paginaAtual === 'estoque' && !DADOS.itens.some((x) => x.codigo === 'TI-0001') && !DADOS.movimentos.some((x) => x.item === 'TI-0001'), null, { timeout: 15000 });
    afirmar(pedidas.join() === 'excluirItemEstoque,excluirItemEstoque', 'acoes: ' + pedidas.join());
    const noBanco = noServidor(s, (cx) => cx.listar('EST_MOVIMENTOS', true).filter((x) => x.ITEM === 'TI-0001').map((x) => x.EXCLUIDO).join());
    afirmar(noBanco === 'SIM,SIM,SIM', 'movimentacoes no banco: ' + noBanco);
    // uma movimentacao (singular) e nenhuma
    await f.click('.lp-filtro >> nth=0');             // Ativos
    c = await confirmacaoDoRemover(f, 'Teclado');
    afirmar(c.texto === TEXTO_EXCLUIR('a única movimentação dele: ela sai', PARA_DESATIVAR), 'uma: ' + c.texto);
    await f.click('#janela-rodape >> text=Voltar');
    await f.click('#janela-rodape >> text=Cancelar');
    c = await confirmacaoDoRemover(f, 'Cabo HDMI');
    afirmar(c.texto === 'Cabo HDMI (TI-0003) não tem movimentações. Excluir apaga o item do cadastro.', 'nenhuma: ' + c.texto);
    afirmar(c.botoes === 'Voltar | Excluir [vermelho]', 'botoes sem movimentacao: ' + c.botoes);
    r = await recadoDe(f, () => f.click('#janela-rodape button:text-is("Excluir")'));
    afirmar(r === 'Item TI-0003 excluído.', 'sem movimentacao: ' + r);
    await f.waitForFunction(() => DADOS.itens.map((x) => x.codigo).join() === 'TI-0002', null, { timeout: 15000 });
    // LIMPEZA — a mesma janela, pela porta da limpeza
    await f.evaluate(async () => {
      await executarAcaoSrv('salvarItemLimpeza', { nome: 'Detergente neutro 5L', unidade: 'galão', saldoInicial: '6' });
      await executarAcaoSrv('movimentarLimpeza', { tipo: 'SAIDA', item: 'LP-0001', quantidade: '2', destino: 'Z7' });
      await executarAcaoSrv('salvarItemLimpeza', { nome: 'Papel toalha', unidade: 'fardo' });
      esquecerTelas(); ABA_LP = 'estoque'; abrir('limpeza');
    });
    await f.waitForFunction(() => paginaAtual === 'limpeza' && !!document.querySelector('#conteudo-lp #est-tabela-itens'), null, { timeout: 15000 });
    c = await confirmacaoDoRemover(f, 'Detergente neutro 5L');
    afirmar(c.titulo === 'Excluir “Detergente neutro 5L”?' && c.texto === TEXTO_EXCLUIR('as 2 movimentações dele: saem', PARA_DESATIVAR) &&
      c.botoes === 'Voltar | Desativar (manter o histórico) | Excluir mesmo assim [vermelho]', 'limpeza: ' + JSON.stringify(c));
    r = await recadoDe(f, () => f.click('#janela-rodape >> text=Excluir mesmo assim'));
    afirmar(r === 'Item LP-0001 excluído, com as 2 movimentações dele.', 'limpeza: ' + r);
    await f.waitForFunction(() => DADOS.estoque.itens.map((x) => x.codigo).join() === 'LP-0002' && !DADOS.estoque.movimentos.length, null, { timeout: 15000 });
    afirmar(await f.evaluate(() => ABA_LP) === 'estoque', 'continua na aba Estoque da limpeza');
    afirmar(pedidas.slice(-1)[0] === 'excluirItemLimpeza', 'porta da limpeza: ' + pedidas.join());
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('estoque com o Google barrando (HTTP 403): a confirmacao do Remover abre sem ir ao servidor; Desativar e Excluir mesmo assim gravam pela pagina (1 POST cada) e voltam no Estoque', async () => {
    const s = await subir(); instalarComPessoas(s);
    noServidor(s, (c, adm) => c.acaoSalvarItemEstoque(adm, { nome: 'Mouse USB', saldoInicial: '10' }));
    noServidor(s, (c, adm) => c.acaoMovimentarEstoque(adm, { tipo: 'SAIDA', item: 'TI-0001', quantidade: '3', destino: 'Recebimento' }));
    noServidor(s, (c, adm) => c.acaoSalvarItemEstoque(adm, { nome: 'Teclado', saldoInicial: '5' }));
    criarPin(s, DONO, DONO, '4321');
    const aba = await abrirAba(s, DONO, { bloqueio403: true, contexto: await navegador.newContext({ viewport: { width: 1300, height: 1300 } }) });
    await entrar(aba, DONO, '4321');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 30000) === 'aplicacao', 'entrou pela reserva');
    let f = await paginaNova(aba, () => CANAL_BARRADO && paginaAtual === 'modulos');
    const pelaPagina = async (gesto, pronta) => {
      await f.evaluate(() => { window.__paginaVelha = true; });
      await gesto();
      f = await paginaNova(aba, pronta);
    };
    await pelaPagina(() => f.evaluate(() => { esquecerTelas(); abrir('estoque'); }), () => paginaAtual === 'estoque' && !!document.querySelector('#est-tabela-itens'));
    marcar(aba);
    let c = await confirmacaoDoRemover(f, 'Mouse USB');
    let d = desdeMarca(aba);
    afirmar(!d.posts && !d.gets && !d.runs.filter((x) => x !== 'sondarCanal').length, 'a confirmacao abriu sem ir ao servidor: ' + JSON.stringify(d));
    afirmar(c.texto === TEXTO_EXCLUIR('as 2 movimentações dele: saem', PARA_DESATIVAR) && c.botoes === 'Voltar | Desativar (manter o histórico) | Excluir mesmo assim [vermelho]', 'confirmacao: ' + JSON.stringify(c));
    marcar(aba);
    await pelaPagina(() => f.click('#janela-rodape >> text=Desativar (manter o histórico)'),
      () => paginaAtual === 'estoque' && DADOS.itens.some((i) => i.codigo === 'TI-0001' && !i.ativo));
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'desativou pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction(() => document.getElementById('recado').textContent === 'Item TI-0001 desativado. O histórico continua guardado.', null, { timeout: 5000 });
    await f.click('.lp-filtro >> text=Inativos');
    c = await confirmacaoDoRemover(f, 'Mouse USB');
    afirmar(c.botoes === 'Voltar | Excluir mesmo assim [vermelho]', 'inativo: ' + c.botoes);
    marcar(aba);
    await pelaPagina(() => f.click('#janela-rodape >> text=Excluir mesmo assim'),
      () => paginaAtual === 'estoque' && DADOS.itens.map((i) => i.codigo).join() === 'TI-0002');
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'excluiu pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction(() => document.getElementById('recado').textContent === 'Item TI-0001 excluído, com as 2 movimentações dele.', null, { timeout: 5000 });
    afirmar(await f.evaluate(() => !DADOS.movimentos.some((x) => x.item === 'TI-0001') && DADOS.totalMovimentos === 1), 'as movimentacoes sairam da tela');
    const noBanco = noServidor(s, (cx) => [cx.listar('EST_ITENS').map((x) => x.CODIGO).join(), cx.listar('EST_MOVIMENTOS', true).filter((x) => x.ITEM === 'TI-0001').map((x) => x.EXCLUIDO).join()]);
    afirmar(noBanco[0] === 'TI-0002' && noBanco[1] === 'SIM,SIM', 'no banco: ' + JSON.stringify(noBanco));
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
    const partes = await conferirXlsxDaMarca(aba, caminho);
    require('fs').unlinkSync(caminho);
    afirmar(/xl\/workbook.xml/.test(lista) && /sheet2.xml/.test(lista), 'zip: ' + lista);
    afirmar(/08:30/.test(folha) && /<v>960<\/v>/.test(folha), 'planilha: ' + folha.slice(0, 300));
    // nas cores da Bartofil: titulo (s=1), tarja verde/amarela (s=8/9), cabecalho azul (s=3) congelado e com filtro, numero a direita (s=5/7), zebra
    afirmar(/<row r="1" ht="26" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Folha de leituras — /.test(folha) &&
      /<row r="3" ht="5" customHeight="1"><c r="A3" s="8"\/>.*<c r="L3" s="9"\/><\/row>/.test(folha) &&
      /<c r="A4" s="3" t="inlineStr"><is><t xml:space="preserve">Dia<\/t>/.test(folha) && /<c r="L4" s="3" t="inlineStr">/.test(folha) &&
      /<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"\/>/.test(folha) && /<autoFilter ref="A4:L25"\/>/.test(folha) &&
      /<c r="J\d+" s="[57]"><v>960<\/v><\/c>/.test(folha) && / s="6"/.test(folha) && / s="7"/.test(folha), 'planilha nas cores da Bartofil: ' + folha.slice(0, 900));
    afirmar(/<autoFilter ref="A4:G5"\/>/.test(partes['xl/worksheets/sheet1.xml']) &&
      /<definedName name="_xlnm\._FilterDatabase" localSheetId="1" hidden="1">'NB-01 [^<']+'!\$A\$4:\$L\$25<\/definedName>/.test(partes['xl/workbook.xml']),
      'filtro do Excel: ' + partes['xl/workbook.xml']);
    // PDF (janela de impressao)
    const [janela] = await Promise.all([aba.contexto.waitForEvent('page', { timeout: 15000 }), f.click('text=Exportar PDF')]);
    await janela.waitForLoadState();
    const texto = await janela.evaluate(() => document.body.innerText);
    afirmar(/Folha de leituras/.test(texto) && /08:30/.test(texto) && /ENTRADA/.test(texto) && /SAÍDA/.test(texto), 'pdf: ' + texto.slice(0, 200));
    const linhasFolha = await janela.evaluate(() => document.querySelectorAll('table.nb-folha-pdf tbody tr').length);
    afirmar(linhasFolha === 21, 'folha com 7 dias x 3 leituras: ' + linhasFolha);
    await conferirPdfDaMarca(janela);
    // entrada no azul e saida no verde da marca (identidade, nao alerta)
    const grupos = await janela.evaluate(() => ['th.g-en', 'th.g-sa', 'th.en', 'th.sa'].map((s) => getComputedStyle(document.querySelector('.nb-folha-pdf ' + s)).backgroundColor).join(' '));
    afirmar(grupos === 'rgb(17, 23, 133) rgb(1, 151, 58) rgb(231, 234, 254) rgb(217, 245, 230)', 'entrada/saida nas cores da marca: ' + grupos);
    if (process.env.FOTO_PDF) await janela.screenshot({ path: process.env.FOTO_PDF, fullPage: true });
    // o PDF como o Chrome imprime, SEM "graficos de plano de fundo": as cores saem pelo print-color-adjust
    if (process.env.GUARDAR_PDF) await janela.pdf({ path: process.env.GUARDAR_PDF, preferCSSPageSize: true });
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
    if (process.env.GUARDAR_XLSX) require('fs').copyFileSync(caminho, process.env.GUARDAR_XLSX);
    const partes = await conferirXlsxDaMarca(aba, caminho);
    require('fs').unlinkSync(caminho);
    afirmar(/Mouse/.test(folha) && /Estoque ideal/.test(folha), 'planilha do estoque');
    // titulo azul, cabecalho azul congelado com filtro e a situacao no tom do chip da tela (Normal = verde, s=11)
    afirmar(/<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Estoque de TI — /.test(folha) && /<c r="K4" s="3" t="inlineStr"><is><t xml:space="preserve">Situação<\/t>/.test(folha) &&
      /<c r="K5" s="11" t="inlineStr"><is><t xml:space="preserve">Normal<\/t>/.test(folha) && /<pane ySplit="4" /.test(folha) && /<autoFilter ref="A4:L5"\/>/.test(folha) &&
      /<c r="A4" s="3"/.test(partes['xl/worksheets/sheet2.xml']), 'estoque nas cores da Bartofil: ' + folha.slice(0, 900));
    /*
     * O pnBaixarXlsx com o que as outras telas podem mandar: celula { v, tom } (tom desconhecido sai normal),
     * duas tabelas na aba (sem filtro, congela a 1a), aba sem titulo (cabecalho na linha 1) e nome com
     * apostrofo no filtro; caractere de controle no texto. Tudo XML bem formado e com o estilo certo.
     */
    const teste = await f.evaluate(() => pnXlsxArquivos([
      { nome: 'Duas tabelas', linhas: [['Título do teste'], ['Subtítulo'], [], ['A', 'B', 'C'], [1, { v: 'GRAVE', tom: 'vermelho' }, 'x\u0001y'],
        [2.5, { v: 'ok', tom: 'roxo' }, ''], [3, { v: 7, tom: 'verde' }], [], ['D', 'E'], ['y', { v: 'Férias', tom: 'azul' }]] },
      { nome: "Sem d'título", linhas: [['COL1', 'COL2'], ['a', 1], ['b', { v: 'ATENÇÃO', tom: 'amarelo' }]] }
    ]).reduce((o, [n, x]) => { o[n] = x; return o; }, {}));
    for (const n of Object.keys(teste)) {
      const erro = await f.evaluate((x) => { const e = new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror')[0]; return e ? e.textContent : ''; }, teste[n]);
      afirmar(!erro, 'pnXlsxArquivos: ' + n + ' nao e XML bem formado: ' + erro);
    }
    const t1 = teste['xl/worksheets/sheet1.xml'], t2 = teste['xl/worksheets/sheet2.xml'];
    afirmar(/<c r="B5" s="15" t="inlineStr"><is><t xml:space="preserve">GRAVE<\/t>/.test(t1) && /<c r="C5" s="4" t="inlineStr"><is><t xml:space="preserve">xy<\/t>/.test(t1) &&
      /<c r="A6" s="7"><v>2.5<\/v><\/c><c r="B6" s="6" t="inlineStr"><is><t xml:space="preserve">ok<\/t><\/is><\/c><c r="C6" s="6"\/>/.test(t1) &&
      /<c r="B7" s="11"><v>7<\/v><\/c><c r="C7" s="4"\/>/.test(t1) && /<c r="A9" s="3" t="inlineStr"><is><t xml:space="preserve">D</.test(t1) &&
      /<c r="B10" s="10" t="inlineStr"><is><t xml:space="preserve">Férias</.test(t1) && /<pane ySplit="4" /.test(t1) && !/<autoFilter/.test(t1) && /<c r="A3" s="8"\/><c r="B3" s="8"\/><c r="C3" s="9"\/>/.test(t1),
      'aba com duas tabelas e tons: ' + t1.slice(0, 1500));
    afirmar(/<row r="1" ht="21" customHeight="1"><c r="A1" s="3"/.test(t2) && /<pane ySplit="1" topLeftCell="A2"/.test(t2) && /<autoFilter ref="A1:B3"\/>/.test(t2) &&
      /<c r="B3" s="12" t="inlineStr"><is><t xml:space="preserve">ATENÇÃO<\/t>/.test(t2) && !/tabSelected/.test(t2) && /tabSelected="1"/.test(t1) &&
      /localSheetId="1" hidden="1">'Sem d''título'!\$A\$1:\$B\$3<\/definedName>/.test(teste['xl/workbook.xml']) && !/localSheetId="0"/.test(teste['xl/workbook.xml']),
      'aba sem titulo: ' + t2.slice(0, 900) + ' / ' + teste['xl/workbook.xml']);
    const [janela] = await Promise.all([aba.contexto.waitForEvent('page', { timeout: 15000 }), f.click('text=Exportar PDF')]);
    await janela.waitForLoadState();
    afirmar(/estoque de TI/i.test(await janela.evaluate(() => document.body.innerText)), 'relatorio PDF');
    await conferirPdfDaMarca(janela);
    if (process.env.FOTO_PDF_ESTOQUE) await janela.screenshot({ path: process.env.FOTO_PDF_ESTOQUE, fullPage: true });
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

  /*
   * COMENTARIOS (19/10) — "Nas acoes precisa de um indicador visual para as acoes que tem
   * comentario e a possibilidade de marcar uma pessoa em um comentario." Antes a unica pista era o
   * "Comentarios (N)" do rodape — que contava ate o "Acao concluida." automatico —, e "@Fulano"
   * ficava como texto puro: sem sugestao, sem destaque, sem e-mail e sem acesso para a pessoa.
   */
  await cenario('plano de acao: selo de comentario no topo do cartao (numero e "novo"), some ao abrir; registro automatico nao conta; Limpeza > Gestao tambem', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = pelaPorta(s, DONO, DONO, '4321');
    const maria = pelaPorta(s, GERAL, COORD, '1234');
    const gerente = pelaPorta(s, GERAL, GERENTE, '5555');
    // 21/10: so quem esta citado ve a acao — o dono, que olha a lista, fica entre os responsaveis
    const a1 = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    dono('salvarAcao', { acao: 'Pintura da faixa de pedestres', prazo: '2026-12-05', turno: 'A', responsaveisEmails: [COORD, DONO] });
    const a3 = dono('salvarAcao', { acao: 'Organizar o almoxarifado', prazo: '2026-11-10', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    maria('comentarAcao', { id: a1, texto: 'Lâmpadas compradas, aguardando a manutenção', situacao: 'Aguardando', depende: 'manutenção' });
    maria('concluirAcao', { id: a3 });                                  // so o registro automatico "Ação concluída."
    const l1 = dono('salvarAcaoLimpeza', { acao: 'Banheiro da central sem papel', prazo: '2026-12-01', turno: 'A', zona: 'Z7', responsaveisEmails: [GERENTE, DONO] }).id;
    gerente('comentarAcaoLimpeza', { id: l1, texto: 'Papel acabou no estoque, pedi compra' });
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes', { situacao: 'TODAS' }); });
    await f.waitForSelector('.cartao-acao .acao-topo .selo-coment', { timeout: 15000 });
    const cartoes = () => f.evaluate(() => [...document.querySelectorAll('.cartao-acao')].map((c) => ({
      t: c.querySelector('.acao-titulo').textContent.trim(),
      selo: ((c.querySelector('.acao-topo .selo-coment') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      novo: !!c.querySelector('.selo-coment.novo'), dica: (c.querySelector('.selo-coment') || { title: '' }).title,
      botao: [...c.querySelectorAll('.acao-botoes button')].map((b) => b.textContent.trim())[0] })));
    const k = await cartoes();
    const c1 = k.find((x) => /Ilumina/.test(x.t)), c2 = k.find((x) => /Pintura/.test(x.t)), c3 = k.find((x) => /almoxarifado/.test(x.t));
    afirmar(/ 1 comentário novo$/.test(c1.selo) && c1.novo && c1.botao === 'Comentários (1)' &&
      /^1 comentário — o último de Maria Souza em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(c1.dica), 'acao comentada: ' + JSON.stringify(c1));
    afirmar(!c2.selo && c2.botao === 'Comentários', 'sem comentario, sem selo: ' + JSON.stringify(c2));
    afirmar(!c3.selo && c3.botao === 'Comentários', 'concluir pelo botao (registro automatico) nao conta: ' + JSON.stringify(c3));
    if (process.env.FOTO_SELO) await aba.page.screenshot({ path: process.env.FOTO_SELO + '-lista.png', fullPage: true });
    // o selo abre o historico, e o "novo" sai — tambem depois de redesenhar (fica neste aparelho)
    await f.click('.cartao-acao .selo-coment');
    await f.waitForSelector('#janela:not(.oculto) #cm-texto', { timeout: 10000 });
    afirmar(/Iluminação do Flow/.test(await f.evaluate(() => el('janela-titulo').textContent)), 'o selo abre os comentarios da acao');
    afirmar(await f.evaluate(() => !document.querySelector('.selo-coment.novo')), 'abrir tira o "novo"');
    await f.evaluate(() => { fecharJanela(); esquecerTelas(); abrir('acoes', { situacao: 'TODAS' }); });
    await f.waitForSelector('.cartao-acao .selo-coment', { timeout: 15000 });
    afirmar(!(await cartoes()).some((x) => x.novo), 'redesenhado, continua visto');
    // Limpeza > Gestao: o mesmo selo na linha da acao, e ele abre o historico
    await f.evaluate(() => { esquecerTelas(); abrir('limpeza'); });
    await f.waitForSelector('#conteudo-lp table .selo-coment', { timeout: 15000 });
    afirmar(/ 1 comentário novo$/.test((await f.$eval('#conteudo-lp table .selo-coment', (b) => b.textContent)).replace(/\s+/g, ' ').trim()), 'selo na Gestao');
    await f.click('#conteudo-lp table .selo-coment');
    await f.waitForSelector('#janela:not(.oculto) .coment-item', { timeout: 10000 });
    afirmar(/Banheiro da central sem papel/.test(await f.evaluate(() => el('janela-titulo').textContent)), 'abre o historico da acao da limpeza');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('plano de acao: selos — "novo" sai quando eu respondo (tambem de outro aparelho); o leitor de tela ouve "2 comentários, com comentário novo"; "@ você" nao fica na cancelada; sem localStorage, abrir o historico tira o "novo" ate recarregar', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = pelaPorta(s, DONO, DONO, '4321'), joao = pelaPorta(s, GERAL, GERENTE, '5555'), maria = pelaPorta(s, GERAL, COORD, '1234');
    // 21/10: so quem esta citado comenta — o João junto com a Maria; o dono na dos extintores
    const a1 = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, GERENTE] }).id;
    const a2 = dono('salvarAcao', { acao: 'Pintura da faixa', prazo: '2026-12-02', turno: 'A', responsaveisEmails: [COORD, GERENTE] }).id;
    const a3 = dono('salvarAcao', { acao: 'Extintores vencidos', prazo: '2026-12-03', turno: 'A', responsaveisEmails: [GERENTE, DONO] }).id;
    joao('comentarAcao', { id: a1, texto: 'Comprei as lâmpadas' });
    joao('comentarAcao', { id: a1, texto: 'A manutenção vem quinta' });
    joao('comentarAcao', { id: a2, texto: 'Maria, a tinta chegou' });
    maria('comentarAcao', { id: a2, texto: 'Pinto amanhã' });                     // a Maria respondeu pelo celular
    dono('comentarAcao', { id: a3, texto: '@Maria Souza confere a validade?', mencoes: [COORD] });
    dono('cancelarAcao', { id: a3, motivo: 'A brigada trocou todos' });
    // o computador do CD com o armazenamento do navegador bloqueado (cookie de terceiros)
    const contexto = await navegador.newContext();
    await contexto.addCookies([{ name: 'gas_sem_storage', value: '1', url: s.url }]);
    const aba = await abrirAba(s, GERAL, { contexto });
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const selos = () => f.evaluate(() => Object.fromEntries([...document.querySelectorAll('.cartao-acao')].map((c) => [c.querySelector('.acao-titulo').textContent.trim(), {
      coment: ((c.querySelector('.selo-coment') || {}).textContent || '').replace(/\s+/g, ' ').trim(), novo: !!c.querySelector('.selo-coment.novo'),
      mencao: !!c.querySelector('.selo-mencao') }])));
    const abrirPlano = async () => {
      await f.evaluate(() => abrir('acoes', { situacao: 'TODAS' }));
      await f.waitForFunction(() => paginaAtual === 'acoes' && document.querySelectorAll('.cartao-acao').length === 3, null, { timeout: 15000 });
    };
    await f.evaluate(() => esquecerTelas());
    await abrirPlano();
    let k = await selos();
    afirmar(/ 2 comentários, com comentário novo$/.test(k['Iluminação do Flow'].coment) && k['Iluminação do Flow'].novo, 'dois, um deles novo: ' + JSON.stringify(k['Iluminação do Flow']));
    afirmar(/ 2 comentários$/.test(k['Pintura da faixa'].coment) && !k['Pintura da faixa'].novo, 'respondi depois do comentario: sem "novo" — ' + JSON.stringify(k['Pintura da faixa']));
    afirmar(k['Extintores vencidos'] && !k['Extintores vencidos'].mencao, 'cancelada (ninguem comenta): sem "@ você" — ' + JSON.stringify(k['Extintores vencidos']));
    await f.click('.cartao-acao:has-text("Iluminação do Flow") .selo-coment');
    await f.waitForSelector('#janela:not(.oculto) #cm-texto', { timeout: 10000 });
    await f.evaluate(() => fecharJanela());
    k = await selos();
    afirmar(/ 2 comentários$/.test(k['Iluminação do Flow'].coment) && !k['Iluminação do Flow'].novo, 'abrir tira o "novo" (e o texto do leitor): ' + JSON.stringify(k['Iluminação do Flow']));
    await f.evaluate(() => abrir('modulos'));
    await aba.page.waitForTimeout(300);
    await abrirPlano();
    afirmar(!(await selos())['Iluminação do Flow'].novo, 'de volta a tela, sem localStorage: continua visto');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('plano de acao: "@" sugere pessoas (setas, Enter, Tab, Esc), botao "@ Marcar pessoa", grava; cada marcado recebe o e-mail e o historico destaca o @Nome', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, PEDRO, 'Pedro Alves', 'COORDENADOR', 'B', 'Coordenador');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] });
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao button:has-text("Comentários")', { timeout: 15000 });
    await f.click('.cartao-acao button:has-text("Comentários")');
    await f.click('#cm-texto');
    await aba.page.keyboard.type('Ótimo. @ped', { delay: 20 });
    await f.waitForSelector('#cm-sugestoes .mencao-opcao', { timeout: 5000 });
    const sug = await f.evaluate(() => ({ itens: [...document.querySelectorAll('#cm-sugestoes [role="option"]')].map((o) => o.textContent.replace(/\s+/g, ' ').trim()),
      expandido: el('cm-texto').getAttribute('aria-expanded'), ativo: el('cm-texto').getAttribute('aria-activedescendant'), papel: el('cm-sugestoes').getAttribute('role') }));
    afirmar(sug.itens.length === 1 && sug.itens[0] === 'Pedro Alves Coordenador · turno B passa a ver esta ação' && sug.expandido === 'true' &&
      sug.ativo === 'cm-sug-0' && sug.papel === 'listbox', 'sugestao do "@ped": ' + JSON.stringify(sug));
    if (process.env.FOTO_MENCAO) await aba.page.screenshot({ path: process.env.FOTO_MENCAO + '-sugestoes.png' });
    await aba.page.keyboard.press('Enter');
    await aba.page.keyboard.type('você tem extintor sobrando?', { delay: 5 });
    const campo = () => f.evaluate(() => ({ texto: el('cm-texto').value, linha: el('cm-marcados').textContent.replace(/\s+/g, ' ').trim(),
      escolhidas: MENCAO.escolhidas.slice(), aberta: !el('cm-sugestoes').classList.contains('oculto'), janela: !el('janela').classList.contains('oculto') }));
    let c = await campo();
    afirmar(c.texto === 'Ótimo. @Pedro Alves você tem extintor sobrando?' && /^Vai avisar por e-mail: @Pedro Alves/.test(c.linha) && !c.aberta, 'Enter marcou: ' + JSON.stringify(c));
    // o botao abre a lista inteira (e ela nao fecha sozinha); setas e Tab escolhem
    await f.click('.mencao-barra .botao-texto');
    await aba.page.waitForTimeout(400);
    const inteira = await f.evaluate(() => [...document.querySelectorAll('#cm-sugestoes [role="option"] b')].map((b) => b.textContent));
    afirmar(inteira.join() === 'João Lima,Maria Souza', 'lista inteira, sem quem escreve e sem quem ja foi marcado: ' + inteira.join());
    await aba.page.keyboard.press('ArrowDown');
    await aba.page.keyboard.press('ArrowUp');
    await aba.page.keyboard.press('Tab');
    c = await campo();
    afirmar(c.escolhidas.join() === [PEDRO, GERENTE].join() && /@João Lima $/.test(c.texto), 'setas e Tab: ' + JSON.stringify(c));
    // o "×" tira a marcacao (o texto fica); Esc fecha so a lista, sem acento acha o João
    await f.click('#cm-marcados .mencao-tirar[aria-label="Não marcar João Lima"]');
    c = await campo();
    afirmar(c.escolhidas.join() === PEDRO && /@João Lima $/.test(c.texto), 'o × tira: ' + JSON.stringify(c));
    await f.evaluate(() => { const t = el('cm-texto'); t.focus(); t.selectionStart = t.selectionEnd = t.value.length; });
    await aba.page.keyboard.type('e @joao', { delay: 20 });
    await f.waitForSelector('#cm-sugestoes .mencao-opcao', { timeout: 5000 });
    await aba.page.keyboard.press('Escape');
    c = await campo();
    afirmar(!c.aberta && c.janela && c.escolhidas.join() === PEDRO, 'Esc fecha a lista e nao a janela: ' + JSON.stringify(c));
    await aba.page.keyboard.press('Backspace');
    await f.waitForSelector('#cm-sugestoes .mencao-opcao', { timeout: 5000 });
    await aba.page.keyboard.press('Enter');
    c = await campo();
    afirmar(c.escolhidas.join() === [PEDRO, GERENTE].join(), 'de novo pelo teclado: ' + JSON.stringify(c));
    const antes = s.mundo.emails.length;
    await f.click('#janela-rodape .botao >> text=Registrar comentário');
    await f.waitForFunction(() => document.getElementById('janela').classList.contains('oculto'), null, { timeout: 15000 });
    afirmar(await f.evaluate(() => el('recado').textContent) === 'Comentário registrado. 2 pessoas marcadas foram avisadas por e-mail.', 'recado');
    const mails = s.mundo.emails.slice(antes);
    const mp = mails.find((m) => m.to === PEDRO), mg = mails.find((m) => m.to === GERENTE);
    afirmar(mails.length === 2 && mp && mg && /marcou você numa ação: Iluminação do Flow$/.test(mp.subject), 'um e-mail para cada marcado: ' + mails.map((m) => m.to + ' | ' + m.subject).join(' ;; '));
    // 21/10: o gerente tambem nao via a acao (nao estava citado) — os dois passam a acompanhar
    afirmar(/passou a acompanhar/.test(mp.htmlBody) && /passou a acompanhar/.test(mg.htmlBody), 'quem nao estava citado passou a acompanhar');
    // o historico destaca quem foi marcado; o cartao diz quem esta marcado
    await f.waitForSelector('.cartao-acao button:has-text("Comentários (1)")', { timeout: 15000 });
    const card = await f.evaluate(() => document.querySelector('.cartao-acao .acao-meta').textContent.replace(/\s+/g, ' '));
    afirmar(/Marcados: Pedro Alves, João Lima/.test(card), 'cartao: ' + card);
    await f.click('.cartao-acao button:has-text("Comentários (1)")');
    await f.waitForSelector('.coment-item .coment-mencao', { timeout: 10000 });
    const h = await f.evaluate(() => ({ destaque: [...document.querySelectorAll('.coment-item .coment-texto .coment-mencao')].map((x) => x.textContent),
      marcou: document.querySelector('.coment-item .coment-mencoes').textContent.replace(/\s+/g, ' ').trim() }));
    afirmar(h.destaque.join() === '@Pedro Alves,@João Lima,@João Lima' && h.marcou === 'Marcou: @Pedro Alves @João Lima', 'historico: ' + JSON.stringify(h));
    if (process.env.FOTO_MENCAO) await aba.page.screenshot({ path: process.env.FOTO_MENCAO + '-historico.png' });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /* A lista do "@" na revisao de 19/10: o cursor que anda, o "@ " sem nome, a lista inteira, nome composto, "@Pedro," e o @Nome apagado. */
  await cenario('plano de acao: "@" — com o cursor fora do @ (Home, setas, clique) o Enter quebra a linha e o Tab sai, sem marcar; "@ " nao abre a lista; "@" sozinho lista todos e as setas rolam a lista; nome composto e "@Pedro,"; apagar o @Nome desmarca e so quem ficou recebe o e-mail', async () => {
    const s = await subir(); instalarComPessoas(s);
    const RIBEIRO = 'ana.paula.ribeiro@bartofil.com.br', CARLOS = 'carlos.mendes@bartofil.com.br';
    [[PEDRO, 'Pedro Alves', 'B'], [CARLOS, 'Carlos Mendes', 'B'], [RIBEIRO, 'Ana Paula Ribeiro', 'C'], ['ana.paula@bartofil.com.br', 'Ana Paula', 'A'],
     ['helena.isidoro@bartofil.com.br', 'Helena Isidoro', 'C'], ['bruno.lima@bartofil.com.br', 'Bruno Lima', 'A'],
     ['igor.santos@bartofil.com.br', 'Igor Santos', 'B'], ['otavio.reis@bartofil.com.br', 'Otávio Reis', 'C']]
      .forEach(([email, nome, turno]) => cadastrar(s, email, nome, 'COORDENADOR', turno, 'Coordenador'));
    cadastrar(s, CONSULTA, 'Carla Dias', 'CONSULTA', '', 'Qualidade');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    const id = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao button:has-text("Comentários")', { timeout: 15000 });
    const comentarDoZero = async () => { await f.evaluate((x) => { fecharJanela(); abrirComentarios(x, true); }, id); await f.click('#cm-texto'); };
    const teclar = (t) => aba.page.keyboard.type(t, { delay: 20 });
    const listaAberta = () => f.waitForSelector('#cm-sugestoes .mencao-opcao', { timeout: 5000 });
    const campo = () => f.evaluate(() => ({ texto: el('cm-texto').value, escolhidas: MENCAO.escolhidas.slice(), aberta: !el('cm-sugestoes').classList.contains('oculto'),
      foco: document.activeElement === el('cm-texto'), opcoes: [...document.querySelectorAll('#cm-sugestoes [role="option"] b')].map((b) => b.textContent),
      emails: MENCAO.lista.map((p) => p.email), vazia: !!document.querySelector('#cm-sugestoes .mencao-vazia'),
      linha: el('cm-marcados').textContent.replace(/\s+/g, ' ').trim() }));
    // (1) o cursor saiu do "@...": Home + Enter quebra a linha — nada duplicado, ninguem marcado
    await comentarDoZero();
    await teclar('Lâmpadas compradas. Falta @Hel');
    await listaAberta();
    await aba.page.keyboard.press('Home');
    let c = await campo();
    afirmar(!c.aberta, 'o Home fecha a lista: ' + JSON.stringify(c));
    await aba.page.keyboard.press('Enter');
    c = await campo();
    afirmar(c.texto === '\nLâmpadas compradas. Falta @Hel' && !c.escolhidas.length && !c.linha, 'Home + Enter: ' + JSON.stringify(c));
    // setas para dentro do "@..." + Tab: o Tab sai do campo e nao sobra pedaco do nome
    await comentarDoZero();
    await teclar('Oi @Hel');
    await listaAberta();
    for (let i = 0; i < 3; i++) await aba.page.keyboard.press('ArrowLeft');
    await aba.page.keyboard.press('Tab');
    c = await campo();
    afirmar(c.texto === 'Oi @Hel' && !c.escolhidas.length && !c.foco, 'setas + Tab: ' + JSON.stringify(c));
    // clique (ou toque) no comeco do texto com a lista aberta: ela fecha, e o Enter quebra a linha ali
    await comentarDoZero();
    await teclar('Troca feita na quinta, @ped');
    await listaAberta();
    await f.click('#cm-texto', { position: { x: 3, y: 8 } });
    c = await campo();
    afirmar(!c.aberta, 'o clique no texto fecha a lista: ' + JSON.stringify(c));
    await aba.page.keyboard.press('Enter');
    c = await campo();
    afirmar(c.texto === '\nTroca feita na quinta, @ped' && !c.escolhidas.length, 'clique + Enter: ' + JSON.stringify(c));
    // (2) "@ " (espaco logo depois do @) nao e marcacao: o Enter quebra a linha
    await comentarDoZero();
    await teclar('Reunião amanhã @ ');
    c = await campo();
    afirmar(!c.aberta, '"@ " nao abre a lista: ' + JSON.stringify(c));
    await aba.page.keyboard.press('Enter');
    c = await campo();
    afirmar(c.texto === 'Reunião amanhã @ \n' && !c.escolhidas.length, '"@ " + Enter: ' + JSON.stringify(c));
    // (3) "@" sozinho (o botao): todos do plano menos quem escreve — mais de 8 — e as setas levam a lista junto
    await comentarDoZero();
    await f.click('.mencao-barra .botao-texto');
    await listaAberta();
    c = await campo();
    afirmar(c.opcoes.length === 11 && !c.emails.includes(DONO), 'a lista inteira (11 pessoas): ' + c.opcoes.join());
    for (let i = 0; i < 10; i++) await aba.page.keyboard.press('ArrowDown');
    const rolou = await f.evaluate(() => { const cx = el('cm-sugestoes'), a = cx.querySelector('.mencao-opcao.ativa');
      return { ativa: a.querySelector('b').textContent, topo: cx.scrollTop, visivel: a.offsetTop >= cx.scrollTop && a.offsetTop + a.offsetHeight <= cx.scrollTop + cx.clientHeight }; });
    afirmar(rolou.topo > 0 && rolou.visivel && rolou.ativa === c.opcoes[10], 'a ativa fica a vista: ' + JSON.stringify(rolou));
    await aba.page.keyboard.press('Escape');
    // (4) nome composto (ate 4 palavras) e "@Pedro,": a lista continua e o nome entra inteiro, com a virgula
    await comentarDoZero();
    await teclar('Lâmpadas: @Ana Paula R');
    c = await campo();
    afirmar(c.aberta && c.opcoes.join() === 'Ana Paula Ribeiro', 'nome composto: ' + JSON.stringify(c));
    await aba.page.keyboard.press('Enter');
    await teclar('@Pedro,');
    c = await campo();
    afirmar(c.aberta && !c.vazia && c.opcoes.join() === 'Pedro Alves', '"@Pedro," ainda acha o Pedro: ' + JSON.stringify(c));
    await aba.page.keyboard.press('Enter');
    // (5) apagar o @Nome desmarca: a Carla escolhida por engano, apagada com Backspace; depois o Carlos
    await teclar('e @carl');
    await listaAberta();
    await aba.page.keyboard.press('Enter');
    c = await campo();
    afirmar(c.escolhidas.includes(CONSULTA), 'a Carla entrou: ' + JSON.stringify(c));
    for (let i = 0; i < '@Carla Dias '.length; i++) await aba.page.keyboard.press('Backspace');
    c = await campo();
    afirmar(!c.escolhidas.includes(CONSULTA) && !/Carla/.test(c.linha), 'o @Nome apagado sai da linha: ' + JSON.stringify(c));
    await teclar('@carlo');
    await listaAberta();
    await aba.page.keyboard.press('Enter');
    c = await campo();
    afirmar(c.texto === 'Lâmpadas: @Ana Paula Ribeiro @Pedro Alves, e @Carlos Mendes ' && c.escolhidas.join() === [RIBEIRO, PEDRO, CARLOS].join(), 'texto e marcados: ' + JSON.stringify(c));
    const antes = s.mundo.emails.length;
    await f.click('#janela-rodape .botao >> text=Registrar comentário');
    await f.waitForFunction(() => document.getElementById('janela').classList.contains('oculto'), null, { timeout: 15000 });
    const para = s.mundo.emails.slice(antes).map((m) => m.to).sort();
    afirmar(para.join() === [RIBEIRO, PEDRO, CARLOS].sort().join(), 'so quem ficou na linha recebe: ' + para.join());
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('plano de acao: "@Nome" escrito inteiro sem escolher na lista — o 1o clique em Registrar poe a pessoa em "Vai avisar" com a nota e nao grava; o 2o grava e avisa; quem saiu pelo × fica fora', async () => {
    const s = await subir(); instalarComPessoas(s);
    const RIBEIRO = 'ana.paula.ribeiro@bartofil.com.br';
    cadastrar(s, PEDRO, 'Pedro Alves', 'COORDENADOR', 'B', 'Coordenador');
    cadastrar(s, RIBEIRO, 'Ana Paula Ribeiro', 'COORDENADOR', 'C', 'Coordenadora');
    cadastrar(s, 'ana.paula@bartofil.com.br', 'Ana Paula', 'COORDENADOR', 'A', 'Coordenadora');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    const id = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao button:has-text("Comentários")', { timeout: 15000 });
    await f.click('.cartao-acao button:has-text("Comentários")');
    await f.fill('#cm-texto', '@Pedro Alves, tem lâmpada sobrando? E a @Ana Paula Ribeiro também. @Maria Souza anota.');
    const antes = s.mundo.emails.length, comentarios = () => s.contexto(DONO).listar('COMENTARIOS').filter((x) => x.ACAO_ID === id);
    await f.click('#janela-rodape .botao >> text=Registrar comentário');
    const r = await f.evaluate(() => ({ janela: !el('janela').classList.contains('oculto'), vivo: el('cm-marcados').getAttribute('aria-live'),
      chips: [...document.querySelectorAll('#cm-marcados .mencao-chip')].map((x) => x.firstChild.textContent.trim()),
      nota: (document.querySelector('#cm-marcados .mencao-nota') || {}).textContent }));
    afirmar(r.janela && r.vivo === 'polite' && r.chips.join() === '@Pedro Alves,@Ana Paula Ribeiro' &&
      r.nota === 'Você escreveu @Pedro Alves e @Ana Paula Ribeiro sem escolher na lista. As pessoas entraram em “Vai avisar por e-mail”: confira (o × tira) e clique de novo em Registrar comentário.',
      '1o clique (quem escreve e a "Ana Paula" de dentro do nome maior ficam fora): ' + JSON.stringify(r));
    afirmar(s.mundo.emails.length === antes && !comentarios().length, '1o clique: nada gravado nem enviado');
    await f.click('#cm-marcados .mencao-tirar[aria-label="Não marcar Ana Paula Ribeiro"]');
    await f.click('#janela-rodape .botao >> text=Registrar comentário');
    await f.waitForFunction(() => document.getElementById('janela').classList.contains('oculto'), null, { timeout: 15000 });
    afirmar(await f.evaluate(() => el('recado').textContent) === 'Comentário registrado. 1 pessoa marcada foi avisada por e-mail.', 'recado');
    const mails = s.mundo.emails.slice(antes);
    afirmar(mails.map((m) => m.to).join() === PEDRO && comentarios().length === 1 && comentarios()[0].MENCOES === PEDRO,
      '2o clique: grava e avisa so o Pedro: ' + JSON.stringify([mails.map((m) => m.to), comentarios().map((x) => x.MENCOES)]));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('plano de acao: "Editar" mostra quem foi marcado — desmarcar quem foi marcado por engano tira a pessoa da acao (so tira)', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, PEDRO, 'Pedro Alves', 'COORDENADOR', 'B', 'Coordenador');
    cadastrar(s, CONSULTA, 'Carla Dias', 'CONSULTA', '', 'Qualidade');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    const id = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    dono('salvarAcao', { acao: 'Pintura da faixa', prazo: '2026-12-02', turno: 'A', responsaveisEmails: [COORD, DONO] });
    dono('comentarAcao', { id, texto: '@Pedro Alves @Carla Dias vejam', mencoes: [PEDRO, CONSULTA] });
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao:has-text("Iluminação do Flow") button:has-text("Editar")', { timeout: 15000 });
    await f.click('.cartao-acao:has-text("Pintura da faixa") button:has-text("Editar")');
    afirmar(!(await f.$('.janela .mencao-marcados')), 'sem marcados, o formulario nao mostra a caixa');
    await f.evaluate(() => fecharJanela());
    await f.click('.cartao-acao:has-text("Iluminação do Flow") button:has-text("Editar")');
    const form = await f.evaluate(() => { const fs = document.querySelector('.janela fieldset.mencao-marcados');
      return fs && { legenda: fs.querySelector('legend').textContent, marcados: [...fs.querySelectorAll('.ac-marcado')].map((x) => x.value + (x.checked ? ':sim' : ':nao')),
        nomes: [...fs.querySelectorAll('label')].map((l) => l.textContent.trim()), dica: fs.querySelector('.dica').textContent }; });
    afirmar(form && form.legenda === 'Marcados (veem e comentam esta ação)' && form.marcados.join() === PEDRO + ':sim,' + CONSULTA + ':sim' &&
      form.nomes.join() === 'Pedro Alves,Carla Dias' && form.dica === 'Desmarque quem foi marcado por engano: a pessoa deixa de ver esta ação.', 'formulario: ' + JSON.stringify(form));
    await f.uncheck('.ac-marcado[value="' + PEDRO + '"]');
    await f.click('#janela-rodape .botao >> text=Salvar');
    await f.waitForFunction(() => document.getElementById('janela').classList.contains('oculto'), null, { timeout: 15000 });
    await f.waitForFunction(() => /Marcados: Carla Dias/.test(document.querySelector('.cartao-acao').textContent), null, { timeout: 15000 });
    afirmar(s.contexto(DONO).obter('ACOES', id).MARCADOS === CONSULTA, 'MARCADOS: ' + s.contexto(DONO).obter('ACOES', id).MARCADOS);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('plano de acao: painel Oculto — o "@" so oferece quem abre o painel (o administrador); o campo Responsaveis continua com todos', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, 'bia.admin@bartofil.com.br', 'Bia Admin', 'ADMIN', '', 'Administradora');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] });
    dono('alterarPainel', { codigo: 'FSA', painel: 'calendario', estado: 'OCULTO' });
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao button:has-text("Comentários")', { timeout: 15000 });
    await f.click('.cartao-acao button:has-text("Comentários")');
    await f.click('.mencao-barra .botao-texto');
    await f.waitForSelector('#cm-sugestoes .mencao-opcao', { timeout: 5000 });
    const opcoes = await f.evaluate(() => [...document.querySelectorAll('#cm-sugestoes [role="option"] b')].map((b) => b.textContent));
    afirmar(opcoes.join() === 'Bia Admin', 'so quem abre o painel Oculto: ' + opcoes.join());
    await f.evaluate(() => { fecharJanela(); formAcao(); });
    const resp = await f.evaluate(() => [...document.querySelectorAll('.ac-resp')].map((x) => x.value));
    afirmar(resp.includes(COORD) && resp.includes(GERENTE), 'responsaveis com todos: ' + resp.join());
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('link do e-mail de mencao (?filial=FSA&tela=acoes&acao=ID) abre o historico depois do e-mail e PIN, sem a escolha de filial para quem tem duas — tambem pela reserva (HTTP 403, acao ja concluida) e na Limpeza (aba Plano); F5 nao reabre; acao que sumiu so avisa, com a filial', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, PEDRO, 'Pedro Alves', 'COORDENADOR', 'B', 'Coordenador');
    cadastrar(s, CONSULTA, 'Carla Dias', 'CONSULTA', '', 'Qualidade');
    criarPin(s, GERAL, PEDRO, '2345'); criarPin(s, GERAL, CONSULTA, '7777');
    const dono = pelaPorta(s, DONO, DONO, '4321'), maria = pelaPorta(s, GERAL, COORD, '1234');
    // 21/10: so quem esta citado comenta (e marca) — o dono fica entre os responsaveis
    const a1 = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    const a2 = dono('salvarAcao', { acao: 'Extintores vencidos', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    const l1 = dono('salvarAcaoLimpeza', { acao: 'Banheiro da central sem papel', prazo: '2026-12-01', turno: 'A', zona: 'Z7', responsaveisEmails: [GERENTE, DONO] }).id;
    const l2 = dono('salvarAcaoLimpeza', { acao: 'Lixeira quebrada', prazo: '2026-12-01', turno: 'A', zona: 'Z2', responsaveisEmails: [GERENTE, DONO] }).id;
    dono('comentarAcao', { id: a1, texto: '@Pedro Alves tem extintor sobrando?', mencoes: [PEDRO] });
    dono('comentarAcao', { id: a2, texto: '@Pedro Alves confere a validade?', mencoes: [PEDRO] });
    dono('comentarAcaoLimpeza', { id: l1, texto: '@Carla Dias confere na auditoria?', mencoes: [CONSULTA] });
    dono('comentarAcaoLimpeza', { id: l2, texto: '@Carla Dias veja', mencoes: [CONSULTA] });
    // Pedro e Carla entram em duas filiais: o link leva a filial (tambem a principal), senao cairiam na escolha da filial
    dono('salvarFilial', { nome: 'CD Salvador', cidade: 'Salvador - BA', codigo: 'SSA', paineis: { calendario: 'ATIVO', limpeza: 'ATIVO' } });
    const q1 = linkDaMencao(s, PEDRO, /Iluminação/), q2 = linkDaMencao(s, PEDRO, /Extintores/);
    const ql1 = linkDaMencao(s, CONSULTA, /Banheiro/), ql2 = linkDaMencao(s, CONSULTA, /Lixeira/);
    afirmar(q1 === '?filial=FSA&tela=acoes&acao=' + a1 && ql1 === '?filial=FSA&tela=limpeza&acao=' + l1, 'links: ' + q1 + ' ' + ql1);
    const janela = (f) => f.evaluate(() => ({ titulo: el('janela-titulo').textContent, situacao: !!el('cm-sit'), pagina: paginaAtual,
      filtro: paginaAtual === 'acoes' ? DADOS.filtro.situacao : PLANO.local.situacao, abaLp: typeof ABA_LP === 'undefined' ? '' : ABA_LP }));
    // (1) canal normal: depois do e-mail e do PIN o historico da acao abre sozinho; o endereco perde o "acao="
    let aba = await abrirAba(s, GERAL, { query: q1 });
    await entrar(aba, PEDRO, '2345');
    let f = await frame(aba);
    await f.waitForSelector('#janela:not(.oculto) #cm-texto', { timeout: 20000 });
    let st = await janela(f);
    afirmar(/Iluminação do Flow/.test(st.titulo) && !st.situacao && st.pagina === 'acoes' && st.filtro === 'TODAS', 'o link abriu a acao (o marcado so comenta): ' + JSON.stringify(st));
    afirmar(!/acao=/.test(aba.page.url()) && /tela=acoes/.test(aba.page.url()), 'endereco sem a acao: ' + aba.page.url());
    if (process.env.FOTO_LINK) await aba.page.screenshot({ path: process.env.FOTO_LINK + '-pedro.png' });
    await f.evaluate(() => fecharJanela());
    afirmar(/você/.test(await f.evaluate(() => (document.querySelector('.cartao-acao .selo-mencao') || {}).textContent || '')), 'cartao do Pedro com o "@ você"');
    // F5 na mesma aba: volta no plano, sem reabrir o historico
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    afirmar(await esperarTela(aba, ['aplicacao', 'entrar']) === 'aplicacao', 'F5 continua dentro');
    f = await frame(aba);
    await f.waitForFunction(() => paginaAtual === 'acoes' && !!document.querySelector('.cartao-acao'), null, { timeout: 15000 });
    await aba.page.waitForTimeout(800);
    afirmar(await f.evaluate(() => el('janela').classList.contains('oculto')), 'F5 nao reabriu o historico');
    afirmar(!aba.erros.length, 'erros (canal normal): ' + aba.erros.join(' | '));
    await aba.contexto.close();
    // (2) reserva (HTTP 403), com a acao ja concluida quando o Pedro clica: o plano vem com todas numa ida so
    maria('concluirAcao', { id: a2 });
    aba = await abrirAba(s, GERAL, { query: q2, bloqueio403: true });
    await entrar(aba, PEDRO, '2345');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 20000) === 'aplicacao', 'entrou pela reserva');
    f = await frame(aba);
    await f.waitForSelector('#janela:not(.oculto) #cm-texto', { timeout: 20000 });
    st = await janela(f);
    afirmar(/Extintores vencidos/.test(st.titulo) && st.filtro === 'TODAS' && await f.evaluate(() => CANAL_BARRADO), 'pela reserva: ' + JSON.stringify(st));
    afirmar(s.registro.some((r) => r.tipo === 'doPost' && r.campos.includes('email') && /situacao/.test(decodeURIComponent(r.corpo || ''))), 'o formulario de entrada levou os filtros do link');
    afirmar(!aba.erros.length, 'erros (reserva): ' + aba.erros.join(' | '));
    await aba.contexto.close();
    // (3) Limpeza: a CONSULTA marcada cai na aba Plano com o historico aberto e pode responder
    aba = await abrirAba(s, GERAL, { query: ql1 });
    await entrar(aba, CONSULTA, '7777');
    f = await frame(aba);
    await f.waitForSelector('#janela:not(.oculto) #cm-texto', { timeout: 20000 });
    st = await janela(f);
    const ativa = await f.evaluate(() => (document.querySelector('#pagina .abas .aba.ativa') || { dataset: {} }).dataset.aba);
    afirmar(/Banheiro da central sem papel/.test(st.titulo) && st.pagina === 'limpeza' && st.abaLp === 'plano' && ativa === 'plano', 'limpeza: ' + JSON.stringify([st, ativa]));
    // (4) o link de uma acao que sumiu (excluida): so o aviso, sem janela — com a filial, para quem tem mais de uma
    dono('excluirAcaoLimpeza', { id: l2 });
    await aba.page.goto(s.url + ql2, { waitUntil: 'domcontentloaded' });
    await esperarTela(aba, ['aplicacao', 'entrar']);
    f = await frame(aba);
    await f.waitForFunction(() => el('recado').textContent === 'Esta ação não está nesta filial (CD Feira de Santana) ou não está mais disponível para você.', null, { timeout: 20000 });
    afirmar(await f.evaluate(() => el('janela').classList.contains('oculto')), 'sem janela para a acao que sumiu');
    afirmar(!aba.erros.length, 'erros (limpeza): ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('link de mencao: so o plano da tela do link abre a acao — o outro plano nao avisa "não está mais disponível", e abrir outra tela descarta o link', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = pelaPorta(s, DONO, DONO, '4321');
    dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
    const l1 = dono('salvarAcaoLimpeza', { acao: 'Banheiro da central sem papel', prazo: '2026-12-01', turno: 'A', zona: 'Z7', responsaveisEmails: [DONO] }).id;
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const estado = () => f.evaluate(() => ({ recado: el('recado').textContent, janela: !el('janela').classList.contains('oculto'), link: ACAO_DO_LINK,
      aba: typeof ABA_LP === 'undefined' ? '' : ABA_LP }));
    // o link da Limpeza ficou pendente (a Limpeza nao chegou a abrir) e a pessoa foi para o Plano de Acao do Calendario
    await f.evaluate((id) => { ACAO_DO_LINK = { id: id, tela: 'limpeza' }; el('recado').textContent = ''; esquecerTelas(); abrir('acoes'); }, l1);
    await f.waitForFunction(paginaPronta, 'acoes', { timeout: 15000 });
    await aba.page.waitForTimeout(300);
    let st = await estado();
    afirmar(!st.recado && !st.janela && st.link === null, 'o Calendario nao usa (nem guarda) o link da Limpeza: ' + JSON.stringify(st));
    await f.evaluate(() => { esquecerTelas(); abrir('limpeza'); });
    await f.waitForFunction(paginaPronta, 'limpeza', { timeout: 15000 });
    await aba.page.waitForTimeout(300);
    st = await estado();
    afirmar(!st.janela && st.aba === 'gestao', 'a Limpeza abre como sempre (o link foi descartado): ' + JSON.stringify(st));
    // na tela do link, abre o historico (aba Plano)
    await f.evaluate((id) => { ACAO_DO_LINK = { id: id, tela: 'limpeza' }; esquecerTelas(); abrir('limpeza'); }, l1);
    await f.waitForSelector('#janela:not(.oculto) #cm-texto', { timeout: 15000 });
    st = await estado();
    afirmar(st.aba === 'plano' && st.link === null && /Banheiro da central sem papel/.test(await f.evaluate(() => el('janela-titulo').textContent)), 'limpeza: ' + JSON.stringify(st));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /*
   * QUEM VE A ACAO (21/10) — "as ações só devem aparecer pras pessoas que estão citadas na ação".
   * O gerente gere o plano, mas nao esta citado em nada: nem o link do e-mail, nem a lista, nem a
   * bolinha, nem a Gestao da Limpeza mostram as acoes dos outros (so os numeros do plano inteiro).
   * Criando sem ficar entre os responsaveis, o recado diz para quem a acao aparece.
   */
  await cenario('plano de acao — quem ve (21/10): o gerente nao citado so ve o aviso no link de mencao encaminhado, nenhuma bolinha e a Gestao da limpeza sem a acao (so o total do plano); criar sem ser responsavel mostra o recado e a acao sai da lista', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, PEDRO, 'Pedro Alves', 'COORDENADOR', 'B', 'Coordenador');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    criarPin(s, GERAL, GERENTE, '5555');
    const a1 = dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    dono('comentarAcao', { id: a1, texto: '@Pedro Alves tem extintor sobrando?', mencoes: [PEDRO] });
    dono('salvarAcaoLimpeza', { acao: 'Banheiro da central sem papel', prazo: '2026-12-01', turno: 'A', zona: 'Z7', responsaveisEmails: [DONO] });
    const q1 = linkDaMencao(s, PEDRO, /Iluminação/);
    // (1) o link do e-mail do Pedro aberto pelo gerente: ele nao esta citado — so o aviso, sem janela nem cartao
    const aba = await abrirAba(s, GERAL, { query: q1 });
    await entrar(aba, GERENTE, '5555');
    const f = await frame(aba);
    await f.waitForFunction(() => el('recado').textContent === 'Esta ação não está mais disponível para você.', null, { timeout: 20000 });
    const pag = await f.evaluate(() => ({ janela: !el('janela').classList.contains('oculto'), pagina: paginaAtual,
      cartoes: document.querySelectorAll('.cartao-acao').length, texto: el('pagina').innerText.replace(/\s+/g, ' ') }));
    afirmar(!pag.janela && pag.pagina === 'acoes' && !pag.cartoes && !/Iluminação/.test(pag.texto) && /No plano inteiro: 1 em aberto/.test(pag.texto) &&
      /Aparecem aqui só as ações em que você está citado/.test(pag.texto), 'o link: ' + JSON.stringify(pag).slice(0, 500));
    // (2) o menu: nenhuma bolinha — nada em aberto em que ele esteja citado
    await f.evaluate(() => abrirModulos());
    await f.waitForFunction(() => paginaAtual === 'modulos' && PENDENCIAS && PENDENCIAS.modulos && PENDENCIAS.modulos.limpeza && PENDENCIAS.modulos.calendario, null, { timeout: 15000 });
    const bol = await f.evaluate(() => ({ cal: PENDENCIAS.modulos.calendario.abertas, lp: PENDENCIAS.modulos.limpeza.abertas, bolinhas: document.querySelectorAll('.holo-bolinha').length }));
    afirmar(bol.cal === 0 && bol.lp === 0 && !bol.bolinhas, 'sem bolinha: ' + JSON.stringify(bol));
    // (3) a Gestao da limpeza: a acao do dono nao aparece — so o total do plano inteiro
    await f.evaluate(() => { esquecerTelas(); abrir('limpeza'); });
    await f.waitForFunction(() => paginaAtual === 'limpeza' && !!document.querySelector('#conteudo-lp .kpi'), null, { timeout: 15000 });
    const gestao = (await f.evaluate(() => el('conteudo-lp').innerText)).replace(/\s+/g, ' ');
    afirmar(!/Banheiro da central/.test(gestao) && /1 no plano inteiro/.test(gestao) && /Nenhuma ação em aberto em que você esteja citado \(o plano tem 1\)/.test(gestao), 'Gestao: ' + gestao.slice(0, 500));
    // (4) criar pela tela sem ficar entre os responsaveis: o formulario avisa, o recado diz para quem ela aparece e ela nao entra na lista
    await f.evaluate(() => { esquecerTelas(); abrir('acoes', { situacao: 'TODAS' }); });
    await f.waitForFunction(paginaPronta, 'acoes', { timeout: 15000 });
    await f.evaluate(() => formAcao());
    afirmar(/A ação aparece só para quem está citado nela/.test(await f.evaluate(() => el('janela').innerText)), 'o formulario avisa');
    await f.fill('#ac-acao', 'Pintura da faixa');
    await f.fill('#ac-prazo', '2026-12-01');
    await f.check('.ac-resp[value="' + COORD + '"]');
    const recado = await recadoDe(f, () => f.click('#janela-rodape .botao >> text=Criar ação'));
    afirmar(recado === 'Ação criada. Ela aparece só para quem está citado nela: Maria Souza.', 'recado: ' + recado);
    await f.waitForFunction(() => paginaAtual === 'acoes' && DADOS && DADOS.geral && DADOS.geral.abertas === 2, null, { timeout: 15000 });
    afirmar(await f.evaluate(() => !document.querySelector('.cartao-acao') && !DADOS.lista.length), 'a acao nao entra na lista do gerente (o plano tem 2 em aberto)');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('implantacao pela metade: App.html de antes com o Paineis.html desta versao — a Limpeza CD abre (Gestao e Plano), so sem o selo', async () => {
    const fs = require('fs'), os = require('os'), { execSync } = require('child_process');
    let velho;
    try { velho = execSync('git show 2b60bb2:GSL/App.html', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
    catch (e) { console.log('        (sem o historico do git: cenario pulado)'); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-app-velho-'));
    try {
      fs.readdirSync(PASTA).forEach((n) => fs.copyFileSync(path.join(PASTA, n), path.join(tmp, n)));
      fs.writeFileSync(path.join(tmp, 'App.html'), velho);
      const s = await subir({ pasta: tmp }); instalarComPessoas(s);
      const dono = pelaPorta(s, DONO, DONO, '4321');
      const l1 = dono('salvarAcaoLimpeza', { acao: 'Banheiro da central sem papel', prazo: '2026-12-01', turno: 'A', zona: 'Z7', responsaveisEmails: [DONO] }).id;
      dono('comentarAcaoLimpeza', { id: l1, texto: 'Papel pedido ao almoxarifado' });
      const aba = await abrirAba(s, DONO);
      await entrar(aba, DONO, '4321');
      await esperarTela(aba, ['aplicacao']);
      const f = await frame(aba);
      await f.evaluate(() => { esquecerTelas(); abrir('limpeza'); });
      await f.waitForFunction(() => paginaAtual === 'limpeza' && !/Carregando/.test(el('pagina').innerText), null, { timeout: 15000 });
      const gestao = await f.evaluate(() => el('pagina').innerText);
      afirmar(!/Não consegui montar/.test(gestao) && /Banheiro da central sem papel/.test(gestao), 'Gestao: ' + gestao.slice(0, 200));
      await f.evaluate(() => trocarAbaLP('plano'));
      await f.waitForSelector('#conteudo-lp .cartao-acao', { timeout: 10000 });
      afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
      await aba.contexto.close(); await s.fechar();
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  await cenario('celular 390 px: os selos ("@ você", comentario "novo" e situacao) descem para baixo do titulo sem vazar do cartao; o "novo" fica legivel no tema escuro', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = pelaPorta(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    const id = dono('salvarAcao', { acao: 'Iluminação do Flow — trocar as lâmpadas queimadas do corredor 3', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] }).id;
    dono('comentarAcao', { id, texto: '@Maria Souza consegue até sexta? A auditoria é segunda.', mencoes: [COORD] });
    dono('salvarAcao', { acao: 'Pintura', prazo: '2026-12-05', turno: 'A', responsaveisEmails: [COORD] });
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const aba = await abrirAba(s, GERAL, { contexto });
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao .selo-mencao', { timeout: 15000 });
    await aba.page.waitForTimeout(500);
    const medir = () => f.evaluate(() => {
      const fora = [];
      document.querySelectorAll('.cartao-acao').forEach((c) => {
        const r = c.getBoundingClientRect();
        c.querySelectorAll('.acao-titulo, .acao-selos > *').forEach((x) => {
          const q = x.getBoundingClientRect();
          if (q.left < r.left - 0.5 || q.right > r.right + 0.5) fora.push(x.className + ' ' + Math.round(q.left) + '..' + Math.round(q.right) + ' fora de ' + Math.round(r.left) + '..' + Math.round(r.right));
        });
      });
      const c = document.querySelector('.cartao-acao');
      const t = c.querySelector('.acao-titulo').getBoundingClientRect(), sl = c.querySelector('.acao-selos').getBoundingClientRect();
      return { fora, titulo: Math.round(t.width), selosEmbaixo: sl.top >= t.bottom - 1, rolagem: document.documentElement.scrollWidth - window.innerWidth };
    });
    let m = await medir();
    afirmar(!m.fora.length && m.rolagem <= 0 && m.titulo >= 200 && m.selosEmbaixo, 'claro: ' + JSON.stringify(m));
    if (process.env.FOTO_CELULAR) {
      await f.evaluate(() => window.scrollTo(0, document.querySelector('.cartao-acao').getBoundingClientRect().top + window.scrollY - 140));
      await aba.page.screenshot({ path: process.env.FOTO_CELULAR + '-claro.png' });
    }
    await f.evaluate(() => alternarTema());
    await aba.page.waitForTimeout(400);
    m = await medir();
    const novo = await f.$eval('.selo-coment.novo', (b) => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color]);
    afirmar(!m.fora.length && m.rolagem <= 0 && novo.join() === 'rgb(79, 70, 229),rgb(255, 255, 255)', 'escuro: ' + JSON.stringify([m, novo]));
    if (process.env.FOTO_CELULAR) await aba.page.screenshot({ path: process.env.FOTO_CELULAR + '-escuro.png' });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('celular (toque): o × de cada pessoa marcada tem 32 px para o dedo, o "@ Marcar pessoa" tambem, e os chips nao ficam colados', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, PEDRO, 'Pedro Alves', 'COORDENADOR', 'B', 'Coordenador');
    const dono = pelaPorta(s, DONO, DONO, '4321');
    dono('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, DONO] });
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const aba = await abrirAba(s, DONO, { contexto });
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => { esquecerTelas(); abrir('acoes'); });
    await f.waitForSelector('.cartao-acao button:has-text("Comentários")', { timeout: 15000 });
    await f.tap('.cartao-acao button:has-text("Comentários")');
    await f.tap('#cm-texto');
    for (const parte of ['@ped', '@joa']) {
      await aba.page.keyboard.type(parte, { delay: 20 });
      await f.waitForSelector('#cm-sugestoes .mencao-opcao', { timeout: 5000 });
      await aba.page.keyboard.press('Enter');
    }
    const m = await f.evaluate(() => {
      const caixa = (x) => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      return { toque: matchMedia('(pointer: coarse)').matches, tirar: [...document.querySelectorAll('#cm-marcados .mencao-tirar')].map(caixa),
        botao: caixa(document.querySelector('.mencao-barra .botao-texto')), margem: getComputedStyle(document.querySelector('#cm-marcados .mencao-chip')).marginRight };
    });
    afirmar(m.toque && m.tirar.length === 2 && m.tirar.every(([l, a]) => l >= 32 && a >= 32) && m.botao[1] >= 32 && parseFloat(m.margem) >= 6, 'alvos: ' + JSON.stringify(m));
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

  await cenario('canal barrado: comentar com mencao grava pela pagina (1 POST); o marcado recebe o e-mail e o aviso do e-mail que nao saiu aparece', async () => {
    const s = await subir(); instalarComPessoas(s);
    cadastrar(s, 'joana.invalido@bartofil.com.br', 'Joana Prado', 'GERENTE', '', 'Gerente');
    const gerente = pelaPorta(s, GERAL, GERENTE, '5555');
    gerente('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
    const aba = await abrirAbaReal(s, GERAL, { bloqueio403: '1', atraso: 1500, atrasoPost: 800 });
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => x.coment === 0 && x.pos.comentarios, 15000, 'cartao da acao');
    await clicarEm(aba, 'comentarios');
    await clicarEm(aba, 'cmTexto');
    // as sugestoes sao da tela (as pessoas do plano): o canal barrado nao atrapalha
    await aba.page.keyboard.type('Vejam isto @mar', { delay: 20 });
    await new Promise((ok) => setTimeout(ok, 300));
    await aba.page.keyboard.press('Enter');
    await aba.page.keyboard.type('e @joa', { delay: 20 });
    await new Promise((ok) => setTimeout(ok, 300));
    await aba.page.keyboard.press('Enter');
    marcar(aba);
    await clicarEm(aba, 'registrar');
    await esperarEstado(aba, (x) => x.coment === 1, 15000, 'comentario gravado');
    const d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((f) => f !== 'sondarCanal').length, 'gravou pela pagina: ' + JSON.stringify(d));
    await esperarEstado(aba, (x) => /não saiu para: joana\.invalido/.test(x.recado), 10000, 'o aviso do e-mail que nao saiu');
    const linha = s.contexto(DONO).listar('COMENTARIOS').find((c) => /Vejam isto/.test(c.TEXTO || ''));
    afirmar(linha && linha.TEXTO === 'Vejam isto @Maria Souza e @Joana Prado' && linha.MENCOES === COORD + ',joana.invalido@bartofil.com.br', 'comentario: ' + JSON.stringify(linha && [linha.TEXTO, linha.MENCOES]));
    afirmar(s.mundo.emails.some((m) => m.to === COORD && /marcou você numa ação: Iluminação do Flow$/.test(m.subject)), 'a Maria recebeu o aviso');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal barrado: "@Nome" escrito sem escolher na lista — o 1o clique so poe a pessoa em "Vai avisar" (nenhum POST); o 2o clique grava pela pagina (1 POST) e avisa', async () => {
    const s = await subir(); instalarComPessoas(s);
    const gerente = pelaPorta(s, GERAL, GERENTE, '5555');
    gerente('salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
    const aba = await abrirAbaReal(s, GERAL, { bloqueio403: '1', atraso: 1500, atrasoPost: 800 });
    await entrarReal(aba, GERENTE, '5555');
    await esperarEstado(aba, (x) => x.tela === 'aplicacao' && x.pos.cardCalendario, 30000, 'menu');
    await clicarEm(aba, 'cardCalendario');
    await clicarEm(aba, 'menuAcoes');
    await esperarEstado(aba, (x) => x.coment === 0 && x.pos.comentarios, 15000, 'cartao da acao');
    await clicarEm(aba, 'comentarios');
    await clicarEm(aba, 'cmTexto');
    await aba.page.keyboard.type('Vejam isto, @Maria Souza.', { delay: 20 });
    marcar(aba);
    await clicarEm(aba, 'registrar');
    await new Promise((ok) => setTimeout(ok, 800));
    let d = desdeMarca(aba);
    afirmar(d.posts === 0 && /Iluminação do Flow/.test(aba.estado.janela), '1o clique: so revisa, sem POST: ' + JSON.stringify([d, aba.estado.janela]));
    await clicarEm(aba, 'registrar');
    await esperarEstado(aba, (x) => x.coment === 1, 15000, 'comentario gravado');
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((f) => f !== 'sondarCanal').length, '2o clique: gravou pela pagina: ' + JSON.stringify(d));
    const linha = s.contexto(DONO).listar('COMENTARIOS').find((c) => /Vejam isto/.test(c.TEXTO || ''));
    afirmar(linha && linha.MENCOES === COORD, 'marcou a Maria: ' + JSON.stringify(linha && [linha.TEXTO, linha.MENCOES]));
    afirmar(s.mundo.emails.some((m) => m.to === COORD && /marcou você numa ação: Iluminação do Flow$/.test(m.subject)), 'a Maria recebeu o aviso');
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
   * PAINEL DESATIVADO SOME DO MENU (19/10). O pedido: o administrador desativava um painel em
   * Filiais e paineis e o cartao continuava no menu dele (depois do F5, so com a etiqueta
   * "oculto"); quem ja estava dentro via o cartao e a tela velha ate recarregar.
   */
  await cenario('filiais e paineis: Desativado tira o cartao do menu na hora (ADMIN, sem F5); Oculto mostra a etiqueta; Ativo traz de volta; F5 e link de painel desligado caem no menu com o aviso', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    let f = await frame(aba);
    await f.evaluate(() => entrarModulo('nobreaks'));            // a tela fica guardada na pagina
    await f.waitForFunction(paginaPronta, 'nobreaks', { timeout: 15000 });
    let recado = await mudarPainelPelaTela(f, 'nobreaks', 'DESATIVADO');
    afirmar(recado === 'Painel Nobreaks desativado em CD Feira de Santana: saiu do menu de todos, inclusive do seu. Os dados continuam guardados.', 'recado: ' + recado);
    const como = await f.evaluate(() => document.querySelector('#pagina .cartao').innerText.replace(/\s+/g, ' '));
    afirmar(/Oculto Só o administrador vê, com a etiqueta oculto\. Bom para montar e testar \(e ligar a planilha\) antes de mostrar para a equipe\./.test(como) &&
      /Desativado Some do menu de todos, inclusive do administrador\. Os dados continuam guardados — é só voltar para Ativo\./.test(como) &&
      /Não usar nesta filial O painel não faz parte desta filial: some do menu de todos, como o Desativado\. Os dados continuam guardados\./.test(como), 'como funciona: ' + como);
    // os quatro estados lado a lado (ou 2 e 2): nunca 3 numa linha e 1 sobrando
    const colunas = await f.evaluate(() => getComputedStyle(document.querySelector('#pagina .pn-grade.quatro')).gridTemplateColumns.split(' ').length);
    afirmar(colunas === 4 || colunas === 2, 'colunas do "Como funciona": ' + colunas);
    const sessao = await f.evaluate(() => ({ modulos: SESSAO.modulos.map((m) => m.id).join(','), guardada: Object.keys(CACHE_TELAS).some((k) => k.split('|')[1] === 'nobreaks') }));
    afirmar(!/nobreaks/.test(sessao.modulos) && !sessao.guardada, 'sem F5, a sessao e as telas guardadas ja estao sem o Nobreaks: ' + JSON.stringify(sessao));
    await f.click('.voltar-modulos');
    await f.waitForFunction(() => paginaAtual === 'modulos');
    afirmar(!/nobreaks/.test(await cartoesDoMenu(f)), 'o cartao saiu na hora: ' + await cartoesDoMenu(f));
    await f.evaluate(() => abrir('nobreaks'));                    // um atalho velho para a tela
    afirmar(await f.evaluate(() => paginaAtual === 'modulos' && document.getElementById('recado').textContent === 'Esta tela não está liberada para você nesta filial.'), 'atalho velho barrado');
    recado = await mudarPainelPelaTela(f, 'nobreaks', 'OCULTO');
    afirmar(recado === 'Painel Nobreaks oculto em CD Feira de Santana: só administradores veem, com a etiqueta oculto.', 'recado: ' + recado);
    await f.click('.voltar-modulos');
    afirmar(/(^|,)nobreaks\[oculto\](,|$)/.test(await cartoesDoMenu(f)), 'oculto, com a etiqueta: ' + await cartoesDoMenu(f));
    await mudarPainelPelaTela(f, 'nobreaks', 'ATIVO');
    await f.click('.voltar-modulos');
    afirmar(/(^|,)nobreaks(,|$)/.test(await cartoesDoMenu(f)), 'ativo, sem a etiqueta: ' + await cartoesDoMenu(f));
    // "Nao usar nesta filial" tambem tira, e o F5 confirma
    recado = await mudarPainelPelaTela(f, 'nobreaks', 'REMOVER');
    afirmar(recado === 'Painel Nobreaks não é mais usado em CD Feira de Santana: saiu do menu de todos, inclusive do seu. Os dados continuam guardados.', 'recado: ' + recado);
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    await esperarTela(aba, ['aplicacao'], 20000);
    f = await frame(aba);
    await f.waitForFunction(paginaPronta, 'filiais', { timeout: 15000 });
    await f.evaluate(() => abrirModulos());
    afirmar(!/nobreaks/.test(await cartoesDoMenu(f)), 'depois do F5: ' + await cartoesDoMenu(f));
    // F5 em cima de uma tela cujo painel outra aba desligou: cai no menu com o aviso
    await f.evaluate(() => entrarModulo('limpeza'));
    await f.waitForFunction(paginaPronta, 'limpeza', { timeout: 15000 });
    const tk = await f.evaluate(() => ({ t: TOKEN, f: FILIAL }));
    afirmar(s.chamar(DONO, 'executarAcao', tk, 'alterarPainel', { codigo: 'FSA', painel: 'limpeza', estado: 'DESATIVADO' }).ok, 'outra aba desligou a Limpeza');
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    await esperarTela(aba, ['aplicacao'], 20000);
    f = await frame(aba);
    await f.waitForFunction(() => paginaAtual === 'modulos' && document.getElementById('recado').textContent === 'Este painel foi desligado nesta filial.', null, { timeout: 15000 });
    afirmar(!/limpeza|nobreaks/.test(await cartoesDoMenu(f)), 'F5 na Limpeza desligada: ' + await cartoesDoMenu(f));
    // link de e-mail para a tela de um painel desligado: entra e cai no menu com o aviso
    const link = await abrirAba(s, DONO, { query: '?tela=limpeza' });
    await entrar(link, DONO, '4321');
    await esperarTela(link, ['aplicacao'], 20000);
    const fl = await frame(link);
    await fl.waitForFunction(() => paginaAtual === 'modulos' && document.getElementById('recado').textContent === 'Este painel foi desligado nesta filial.', null, { timeout: 15000 });
    afirmar(!aba.erros.length && !link.erros.length, 'erros: ' + aba.erros.concat(link.erros).join(' | '));
    await link.contexto.close(); await aba.contexto.close(); await s.fechar();
  });

  /*
   * P3 (revisao de 19/10): o menu vem com a bolinha e com cada gravacao, e as respostas podem chegar fora
   * de ordem (execucoes em paralelo, partida a frio). A resposta de um pedido mais velho que o menu em uso
   * nao vale: antes, o cartao do painel recem-desativado voltava e o clique dava "Este painel foi desligado".
   */
  await cenario('menu na ordem dos pedidos: a bolinha calculada antes de desativar o painel e entregue depois nao traz o cartao de volta; duas gravacoes com as respostas trocadas ficam com o menu da ultima', async () => {
    const s = await subir(); instalarComPessoas(s);
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.waitForFunction(() => paginaAtual === 'modulos', null, { timeout: 15000 });
    /* Segura a resposta do primeiro pedido que casar: o servidor ja respondeu (o retrato e de antes), a tela recebe quando soltar. */
    const segurar = async (casa) => {
      let soltar, chegou, entregou;
      const solta = new Promise((ok) => { soltar = ok; });
      const pegou = new Promise((ok) => { chegou = ok; });
      const entregue = new Promise((ok) => { entregou = ok; });
      let feito = false;
      await aba.page.route('**/__gsr', async (route) => {
        let j = {}; try { j = JSON.parse(route.request().postData() || '{}'); } catch (e) { /* nao e chamada */ }
        if (feito || !casa(j)) return route.continue();
        feito = true;
        const corpo = await (await route.fetch()).text();
        chegou();
        await solta;
        await route.fulfill({ status: 200, contentType: 'application/json', body: corpo });
        entregou();
      });
      return { pegou, soltar: async () => { soltar(); await entregue; await aba.page.unroute('**/__gsr'); } };
    };
    const modulos = () => f.evaluate(() => SESSAO.modulos.map((m) => m.id).join(','));
    // 1. a bolinha sai com o Nobreaks ainda ativo; a resposta chega depois do Desativado
    const bolinha = await segurar((j) => j.fn === 'executarAcao' && j.args && j.args[1] === 'pendencias');
    await f.evaluate(() => { PENDENCIAS = null; abrirModulos(); });
    await bolinha.pegou;
    await mudarPainelPelaTela(f, 'nobreaks', 'DESATIVADO');
    afirmar(!/nobreaks/.test(await modulos()), 'o Desativado tirou o Nobreaks: ' + await modulos());
    await bolinha.soltar();
    await f.waitForFunction(() => PENDENCIAS_PEDIDO === '' && !!PENDENCIAS, null, { timeout: 15000 });
    await f.evaluate(() => abrirModulos());
    afirmar(!/nobreaks/.test(await modulos()) && !/nobreaks/.test(await cartoesDoMenu(f)), 'a bolinha atrasada nao trouxe o cartao: ' + await cartoesDoMenu(f));
    // 2. duas gravacoes em voo: a resposta da primeira (Nobreaks ativo de novo) chega depois da segunda (Limpeza desativada)
    await mudarPainelPelaTela(f, 'nobreaks', 'ATIVO');
    const primeira = await segurar((j) => j.fn === 'executarAcaoETela' && j.args && j.args[1] === 'alterarPainel' && j.args[2].painel === 'nobreaks');
    const seletor = (nome) => 'xpath=(//tr[.//strong[normalize-space()="' + nome + '"]]//select)[1]';
    await f.selectOption(seletor('Nobreaks'), 'DESATIVADO');
    await primeira.pegou;
    await f.selectOption(seletor('Limpeza CD'), 'DESATIVADO');
    await f.waitForFunction(() => /^Painel Limpeza CD desativado/.test(document.getElementById('recado').textContent), null, { timeout: 15000 });
    await primeira.soltar();
    // o recado da primeira sai depois do menu dela ser decidido (aplicado ou deixado de lado)
    await f.waitForFunction(() => /^Painel Nobreaks desativado/.test(document.getElementById('recado').textContent), null, { timeout: 15000 });
    afirmar(!/nobreaks|limpeza/.test(await modulos()), 'ficou o menu da ultima gravacao: ' + await modulos());
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /* P6 (revisao de 19/10): o menu sem nenhum cartao diz o porque e, para quem liga os paineis, o caminho. */
  await cenario('menu sem cartao: o ADMIN com todos os paineis desligados ve "Nenhum painel ligado nesta filial." e o botao abre Filiais e paineis; a coordenadora sem modulo ve a quem pedir', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = criarPin(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    ['calendario', 'assiduidade', 'apresentacao', 'nobreaks', 'limpeza', 'quadro', 'estoque', 'aprendiz'].forEach((p) =>
      afirmar(s.chamar(DONO, 'executarAcao', { t: dono.token, f: dono.filial.codigo }, 'alterarPainel', { codigo: 'FSA', painel: p, estado: 'DESATIVADO' }).ok, p + ' desativado'));
    const vazio = (fr) => fr.evaluate(() => document.querySelector('.grade-modulos .vazio').innerText.replace(/\s+/g, ' ').trim());
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao'], 20000);
    const f = await frame(aba);
    await f.waitForFunction(() => paginaAtual === 'modulos' && !!document.querySelector('.grade-modulos .vazio'), null, { timeout: 15000 });
    afirmar(await vazio(f) === 'Nenhum painel ligado nesta filial. Ligar em Configuração › Filiais e painéis', 'ADMIN: ' + await vazio(f));
    await f.click('.grade-modulos .vazio .botao-texto');
    await f.waitForFunction(paginaPronta, 'filiais', { timeout: 15000 });
    const coord = await abrirAba(s, GERAL);
    await entrar(coord, COORD, '1234');
    await esperarTela(coord, ['aplicacao'], 20000);
    const fc = await frame(coord);
    await fc.waitForFunction(() => paginaAtual === 'modulos' && !!document.querySelector('.grade-modulos .vazio'), null, { timeout: 15000 });
    afirmar(await vazio(fc) === 'Nenhum módulo liberado para você nesta filial. Fale com o administrador.', 'coordenadora: ' + await vazio(fc));
    afirmar(!aba.erros.length && !coord.erros.length, 'erros: ' + aba.erros.concat(coord.erros).join(' | '));
    await coord.contexto.close(); await aba.contexto.close(); await s.fechar();
  });

  await cenario('painel desligado com a coordenadora dentro: o cartao velho (com e sem tela guardada), a acao e o F5 voltam ao menu com o aviso; a volta ao menu tira e devolve o cartao', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = criarPin(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    const painel = (estado) => afirmar(s.chamar(DONO, 'executarAcao', { t: dono.token, f: dono.filial.codigo }, 'alterarPainel',
      { codigo: 'FSA', painel: 'nobreaks', estado }).ok, 'o administrador deixou o Nobreaks ' + estado);
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao'], 20000);
    let f = await frame(aba);
    await f.waitForFunction(() => paginaAtual === 'modulos', null, { timeout: 15000 });
    const voltouComAviso = async (rotulo) => {
      try {
        await f.waitForFunction(() => paginaAtual === 'modulos' && document.getElementById('recado').textContent === 'Este painel foi desligado nesta filial.', null, { timeout: 15000 });
      } catch (e) {
        throw new Error(rotulo + ': ' + JSON.stringify(await f.evaluate(() => [paginaAtual, document.getElementById('recado').textContent, document.getElementById('pagina').innerText.slice(0, 120)])));
      }
      const r = await f.evaluate(() => ({ erro: document.querySelectorAll('#pagina .erro-caixa').length,
        lateral: [...document.querySelectorAll('#menu .item-menu')].map((b) => b.dataset.pagina).join(',') }));
      afirmar(await cartoesDoMenu(f) === 'calendario' && !r.erro && !/nobreaks/.test(r.lateral), rotulo + ': ' + await cartoesDoMenu(f) + ' ' + JSON.stringify(r));
      await f.evaluate(() => { document.getElementById('recado').textContent = ''; });
    };
    const voltarAoMenu = async (cartao) => {      // a bolinha vencida (mais de 2 min): voltar ao menu rele o menu
      await f.evaluate(() => { if (PENDENCIAS) PENDENCIAS.quando = 0; abrirModulos(); });
      await f.waitForFunction((c) => !!document.querySelector('.holocard[data-modulo="nobreaks"]') === c, cartao, { timeout: 15000 });
    };
    // 1. tela guardada ha mais de 20 s: pinta a velha, a revalidacao e recusada e volta ao menu
    await f.click('.holocard[data-modulo="nobreaks"]');
    await f.waitForFunction(paginaPronta, 'nobreaks', { timeout: 15000 });
    await f.evaluate(() => abrirModulos());
    painel('DESATIVADO');
    await f.evaluate(() => { Object.keys(CACHE_TELAS).forEach((k) => { CACHE_TELAS[k].quando = 0; }); });
    await f.click('.holocard[data-modulo="nobreaks"]');
    await voltouComAviso('cartao com a tela guardada');
    // 2. Ativo de novo: voltar ao menu traz o cartao; desligado de novo, voltar ao menu tira (sem clique, sem F5)
    painel('ATIVO');
    await voltarAoMenu(true);
    painel('DESATIVADO');
    await voltarAoMenu(false);
    // 3. cartao velho sem tela guardada: a tela e recusada e volta ao menu (sem caixa de erro)
    painel('ATIVO');
    await voltarAoMenu(true);
    painel('DESATIVADO');
    await f.evaluate(() => esquecerTelas());
    await f.click('.holocard[data-modulo="nobreaks"]');
    await voltouComAviso('cartao sem tela guardada');
    // 4. dentro da tela quando o painel sai: a acao recusada volta ao menu com o aviso
    painel('ATIVO');
    await voltarAoMenu(true);
    await f.click('.holocard[data-modulo="nobreaks"]');
    await f.waitForFunction(paginaPronta, 'nobreaks', { timeout: 15000 });
    painel('DESATIVADO');
    await f.evaluate(() => agir('semanaNobreak', {}).catch(() => {}));
    await voltouComAviso('acao recusada');
    // 5. F5 em cima da tela do painel desligado
    painel('ATIVO');
    await voltarAoMenu(true);
    await f.click('.holocard[data-modulo="nobreaks"]');
    await f.waitForFunction(paginaPronta, 'nobreaks', { timeout: 15000 });
    painel('DESATIVADO');
    await aba.page.reload({ waitUntil: 'domcontentloaded' });
    await esperarTela(aba, ['aplicacao'], 20000);
    f = await frame(aba);
    await voltouComAviso('F5');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /*
   * P5 (revisao de 19/10): o aviso diz a causa. O "Sem acesso" de uma pessoa (o painel continua ativo para os
   * outros) nao e "painel desligado"; a tela que o nivel perdeu (Configuracao sem PROGRAMAR) nem painel e.
   */
  await cenario('"Sem acesso" da pessoa com ela dentro: a acao recusada volta ao menu com "Este painel não está mais liberado para você nesta filial."; o nivel sem a capacidade da tela: a mensagem do servidor, sem o aviso de painel', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = criarPin(s, DONO, DONO, '4321');
    criarPin(s, GERAL, COORD, '1234');
    criarPin(s, GERENTE, GERENTE, '5555');
    const pelaPorta = (acao, params) => afirmar(s.chamar(DONO, 'executarAcao', { t: dono.token, f: dono.filial.codigo }, acao, params).ok, acao);
    const c = s.contexto(DONO); c._porta = true;
    const idDe = (email) => c.listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === email).ID;
    const aba = await abrirAba(s, GERAL);
    await entrar(aba, COORD, '1234');
    await esperarTela(aba, ['aplicacao'], 20000);
    const f = await frame(aba);
    await f.click('.holocard[data-modulo="nobreaks"]');
    await f.waitForFunction(paginaPronta, 'nobreaks', { timeout: 15000 });
    pelaPorta('definirModuloPessoa', { id: idDe(COORD), modulo: 'nobreaks', modo: 'NAO' });
    await f.evaluate(() => agir('semanaNobreak', {}).catch(() => {}));
    await f.waitForFunction(() => paginaAtual === 'modulos' && document.getElementById('recado').textContent === 'Este painel não está mais liberado para você nesta filial.', null, { timeout: 15000 });
    afirmar(await cartoesDoMenu(f) === 'calendario', 'o cartao saiu so para ela: ' + await cartoesDoMenu(f));
    // o gerente na Configuracao; o administrador tira o PROGRAMAR do nivel GERENTE
    const ger = await abrirAba(s, GERENTE);
    await entrar(ger, GERENTE, '5555');
    await esperarTela(ger, ['aplicacao'], 20000);
    const fg = await frame(ger);
    await fg.evaluate(() => abrirConfig('config'));
    await fg.waitForFunction(paginaPronta, 'config', { timeout: 15000 });
    const nivel = c.listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === 'GERENTE');
    pelaPorta('alterarPermissao', { id: nivel.ID, coluna: 'PODE_PROGRAMAR', valor: false });
    await fg.evaluate(() => { document.getElementById('recado').textContent = ''; esquecerTelas(); abrir('config'); });
    await fg.waitForFunction(() => !!document.querySelector('#pagina .erro-caixa'), null, { timeout: 15000 });
    const r = await fg.evaluate(() => ({ pagina: paginaAtual, erro: document.querySelector('#pagina .erro-caixa').textContent, recado: document.getElementById('recado').textContent }));
    afirmar(r.pagina === 'config' && r.erro === 'Seu perfil (GERENTE) nao tem acesso a tela "config".' && !/painel/i.test(r.recado), 'nivel: ' + JSON.stringify(r));
    afirmar(!aba.erros.length && !ger.erros.length, 'erros: ' + aba.erros.concat(ger.erros).join(' | '));
    await ger.contexto.close(); await aba.contexto.close(); await s.fechar();
  });

  await cenario('filiais e paineis: o administrador desliga a filial em que esta e vai para a escolha de filial, com o aviso', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = criarPin(s, DONO, DONO, '4321');
    afirmar(s.chamar(DONO, 'executarAcao', { t: dono.token, f: dono.filial.codigo }, 'salvarFilial',
      { nome: 'CD Salvador', cidade: 'Salvador - BA', codigo: 'SSA', paineis: { calendario: 'ATIVO' } }).ok, 'filial SSA criada');
    const aba = await abrirAba(s, DONO);
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['escolher-filial'], 20000);
    let f = await frame(aba);
    await f.click('.cartao-filial:has-text("CD Salvador")');
    await esperarTela(aba, ['aplicacao'], 20000);
    await f.evaluate(() => abrirConfig('filiais'));
    await f.waitForFunction(paginaPronta, 'filiais', { timeout: 15000 });
    await f.click('.cartao:has(.mono:text-is("SSA")) button:has-text("Desligar filial")');
    await esperarTela(aba, ['escolher-filial'], 15000);
    const r = await f.evaluate(() => ({ recado: document.getElementById('recado').textContent,
      cartoes: [...document.querySelectorAll('#grade-filiais .cartao-filial .holo-marca')].map((x) => x.textContent).join(',') }));
    afirmar(r.recado === 'Esta filial foi desligada. Escolha outra para continuar.' && r.cartoes === 'FSA', 'escolha de filial: ' + JSON.stringify(r));
    await f.click('.cartao-filial:has-text("CD Feira de Santana")');
    await esperarTela(aba, ['aplicacao'], 20000);
    await f.waitForFunction(() => paginaAtual === 'modulos' && SESSAO.filial.codigo === 'FSA' && document.querySelectorAll('.grade-modulos .holocard').length > 0, null, { timeout: 15000 });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /* P4 (revisao de 19/10): a filial continua ligada — foi a pessoa que saiu dela no proprio cadastro. */
  await cenario('filiais: o gerente tira a si mesmo da filial em que esta — escolha de filial com "Você não tem mais acesso a esta filial"; sem filial ativa nenhuma, a tela de sem acesso explica', async () => {
    const s = await subir(); instalarComPessoas(s);
    const dono = criarPin(s, DONO, DONO, '4321');
    afirmar(s.chamar(DONO, 'executarAcao', { t: dono.token, f: dono.filial.codigo }, 'salvarFilial',
      { nome: 'CD Salvador', cidade: 'Salvador - BA', codigo: 'SSA', paineis: { calendario: 'ATIVO' } }).ok, 'filial SSA criada');
    criarPin(s, GERENTE, GERENTE, '5555');
    const c = s.contexto(DONO); c._porta = true;
    const id = c.listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === GERENTE).ID;
    const aba = await abrirAba(s, GERENTE);
    await entrar(aba, GERENTE, '5555');
    await esperarTela(aba, ['escolher-filial'], 20000);
    const f = await frame(aba);
    await f.click('.cartao-filial:has-text("CD Feira de Santana")');
    await esperarTela(aba, ['aplicacao'], 20000);
    // a ficha dele em Pessoas e acessos, gravada como a tela grava (agir)
    const salvarFicha = (filiais) => f.evaluate(([i, fl, email]) => agir('salvarUsuario', { id: i, email: email, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: fl, papel: 'Gerente' }).catch(() => {}), [id, filiais, GERENTE]);
    await salvarFicha('SSA');
    await esperarTela(aba, ['escolher-filial'], 15000);
    let r = await f.evaluate(() => ({ recado: document.getElementById('recado').textContent,
      cartoes: [...document.querySelectorAll('#grade-filiais .cartao-filial .holo-marca')].map((x) => x.textContent).join(',') }));
    afirmar(r.recado === 'Você não tem mais acesso a esta filial. Escolha outra para continuar.' && r.cartoes === 'SSA', 'so a SSA: ' + JSON.stringify(r));
    await f.click('.cartao-filial:has-text("CD Salvador")');
    await esperarTela(aba, ['aplicacao'], 20000);
    await f.waitForFunction(() => SESSAO && SESSAO.filial && SESSAO.filial.codigo === 'SSA', null, { timeout: 15000 });
    await salvarFicha('NENHUMA');
    await esperarTela(aba, ['sem-acesso'], 15000);
    r = await f.evaluate(() => ({ titulo: document.getElementById('sem-acesso-titulo').textContent, texto: document.getElementById('sem-acesso-texto').textContent,
      conta: document.getElementById('sem-acesso-conta').textContent }));
    afirmar(r.titulo === 'Nenhuma filial liberada' && r.texto === 'Seu cadastro não está ligado a nenhuma filial ativa. Fale com o administrador.' && r.conta === GERENTE,
      'sem filial nenhuma: ' + JSON.stringify(r));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('canal barrado (HTTP 403): desativar pela pagina tira o cartao do ADMIN; Ativo traz de volta', async () => {
    const s = await subir(); instalarComPessoas(s);
    criarPin(s, DONO, DONO, '4321');
    const aba = await abrirAba(s, DONO, { bloqueio403: true });
    await entrar(aba, DONO, '4321');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 30000) === 'aplicacao', 'entrou pela reserva');
    let f = await paginaNova(aba, () => CANAL_BARRADO && paginaAtual === 'modulos');
    afirmar(/(^|,)nobreaks(,|$)/.test(await cartoesDoMenu(f)), 'antes: ' + await cartoesDoMenu(f));
    const pelaPagina = async (gesto, pronta, arg) => {
      await f.evaluate(() => { window.__paginaVelha = true; });
      await gesto();
      f = await paginaNova(aba, pronta, arg);
    };
    // sem tela guardada (a de menos de 20 s seria pintada ali mesmo): Filiais e paineis vem pela pagina
    const irParaFiliais = () => pelaPagina(() => f.evaluate(() => { esquecerTelas(); abrirConfig('filiais'); }), paginaPronta, 'filiais');
    const filiaisCom = (e) => paginaAtual === 'filiais' && !/Carregando|Abrindo/.test(document.getElementById('pagina').innerText) &&
      (DADOS.filiais.find((x) => x.principal).paineis.nobreaks || '') === e;
    await irParaFiliais();
    await pelaPagina(() => f.selectOption('xpath=(//tr[.//strong[normalize-space()="Nobreaks"]]//select)[1]', 'DESATIVADO'), filiaisCom, 'DESATIVADO');
    await f.waitForFunction(() => /^Painel Nobreaks desativado em CD Feira de Santana/.test(document.getElementById('recado').textContent), null, { timeout: 5000 });
    await f.evaluate(() => abrirModulos());
    afirmar(!/nobreaks/.test(await cartoesDoMenu(f)), 'pela pagina, o cartao saiu: ' + await cartoesDoMenu(f));
    await irParaFiliais();
    await pelaPagina(() => f.selectOption('xpath=(//tr[.//strong[normalize-space()="Nobreaks"]]//select)[1]', 'ATIVO'), filiaisCom, 'ATIVO');
    await f.evaluate(() => abrirModulos());
    afirmar(/(^|,)nobreaks(,|$)/.test(await cartoesDoMenu(f)), 'ativo de novo: ' + await cartoesDoMenu(f));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /*
   * ROTINAS (19/10) — "quero colocar uma atividade recorrente toda semana e nao aparece nem o dia para
   * marcar, ele pede numero; mudar de um dia da semana para outro nao vai; desativar nao vai".
   */
  await cenario('rotinas pela tela: dia em botoes (Qua), sem numero; a nova aparece de hoje em diante; Sex com a confirmacao leva as 6 para a sexta; Desativar cancela (Arquivo) e Ativar traz de volta; sabado e domingo; Remover confirma', async () => {
    const s = await subir({ agora: SEGUNDA_19_10 }); instalarComPessoas(s); comOutENov(s);
    // Janela alta: a lista de rotinas inteira cabe sem rolar (rolando, o cabecalho fixo cobre a linha clicada).
    const aba = await abrirAba(s, DONO, { relogio: SEGUNDA_19_10, contexto: await navegador.newContext({ viewport: { width: 1300, height: 1300 } }) });
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await abrirMes(f, 'OUT 2026');                        // o calendario fica guardado na tela (CACHE_TELAS)
    await abrirRotinas(f);
    // 1. rotina nova: o dia sai dos botoes, nao de um campo que pede numero
    await f.click('text=Nova rotina');
    await f.waitForSelector('.rot-dias');
    afirmar(!(await f.$('#ro-dia')) && await textoDe(f, '.rot-dias') === 'Seg Ter Qua Qui Sex Sáb Dom', 'botoes dos dias: ' + await textoDe(f, '.rot-dias'));
    await f.fill('#ro-tipo', 'RON');
    await f.fill('#ro-atividade', 'Ronda de segurança');
    await f.click('.rot-dias label:has-text("Qua")');
    afirmar(await textoDe(f, '#ro-previa') === 'Toda quarta-feira · próximas: 21/10, 28/10, 04/11', 'previa: ' + await textoDe(f, '#ro-previa'));
    let r = await recadoDe(f, () => f.click('#janela-rodape >> text=Salvar'));
    afirmar(r === 'Rotina salva. No calendário: 2 criadas em OUT 2026 e 4 em NOV 2026 (de hoje em diante).', r);
    afirmar(await f.evaluate(() => !Object.keys(CACHE_TELAS).some((k) => k.indexOf('|calendario|') !== -1)), 'a tela esqueceu o calendario guardado');
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON'), null, { timeout: 15000 });
    afirmar(await linhaDaRotina(f, 'RON') === 'RON | Ronda de segurança | toda quarta | — | ativa', await linhaDaRotina(f, 'RON'));
    await abrirMes(f, 'OUT 2026');
    afirmar(await diasDaSigla(f, 'RON') === '21,28', 'OUT de hoje em diante: ' + await diasDaSigla(f, 'RON'));
    // 2. quarta -> sexta: a janela confirma com os numeros que vieram na Configuracao
    await abrirRotinas(f);
    await f.click('#conteudo-cfg tr:has(td:text-is("RON")) >> text=Editar');
    await f.waitForSelector('.rot-dias input:checked');
    afirmar(await f.evaluate(() => document.querySelector('input[name="ro-dia-semana"]:checked').getAttribute('aria-label')) === 'quarta-feira', 'o dia atual vem marcado');
    afirmar(await f.evaluate(() => el('ro-tipo').disabled), 'a sigla trava depois de gerar');
    afirmar(await textoDe(f, '.rot-agora') === 'No calendário agora: 6 pendentes de hoje em diante (OUT 2026: 2 · NOV 2026: 4).', await textoDe(f, '.rot-agora'));
    await f.click('.rot-dias label:has-text("Sex")');
    await f.click('#janela-rodape >> text=Salvar');
    await f.waitForSelector('#ro-ajustar:checked');
    afirmar(await textoDe(f, '#janela-titulo') === 'Mudar a rotina no calendário?', 'titulo');
    const mudar = await textoDe(f, '.rot-texto');
    afirmar(mudar === '“Ronda de segurança” passa de toda quarta para toda sexta. As 6 atividades pendentes de hoje em diante ' +
      '(OUT 2026: 2 · NOV 2026: 4) vão para a sexta da mesma semana. Não mudam: as já entregues ou validadas, as remarcadas à mão ' +
      'e as de datas que já passaram. Se a sexta desta semana já passou, a desta semana fica como está.', mudar);
    r = await recadoDe(f, () => f.click('text=Salvar e ajustar o calendário'));
    afirmar(r === 'Rotina salva. No calendário: 6 mudaram para sexta.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON' && x.dia === '5'), null, { timeout: 15000 });
    afirmar(/ \| toda sexta \| /.test(await linhaDaRotina(f, 'RON')), await linhaDaRotina(f, 'RON'));
    await abrirMes(f, 'OUT 2026');
    afirmar(await diasDaSigla(f, 'RON') === '23,30', 'OUT na sexta: ' + await diasDaSigla(f, 'RON'));
    await abrirMes(f, 'NOV 2026');
    afirmar(await diasDaSigla(f, 'RON') === '6,13,20,27', 'NOV na sexta: ' + await diasDaSigla(f, 'RON'));
    // 3. Desativar na lista: confirma com a contagem; o calendario fica sem a rotina e o Arquivo com elas
    await abrirRotinas(f);
    await f.click('#conteudo-cfg tr:has(td:text-is("RON")) >> text=Desativar');
    await f.waitForSelector('text=Desativar e cancelar 6');
    afirmar(await textoDe(f, '#janela-titulo') === 'Desativar “Ronda de segurança”?', await textoDe(f, '#janela-titulo'));
    r = await recadoDe(f, () => f.click('text=Desativar e cancelar 6'));
    afirmar(r === 'Rotina desativada. 6 atividades pendentes canceladas (OUT 2026: 2 · NOV 2026: 4).', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON' && !x.ativo), null, { timeout: 15000 });
    afirmar(/ \| parada$/.test(await linhaDaRotina(f, 'RON')), await linhaDaRotina(f, 'RON'));
    await abrirMes(f, 'OUT 2026');
    afirmar(await diasDaSigla(f, 'RON') === '', 'OUT sem a rotina: ' + await diasDaSigla(f, 'RON'));
    const arquivo = await f.evaluate(() => [...document.querySelectorAll('.bloco-arquivo .linha-atividade')]
      .map((x) => x.textContent.replace(/\s+/g, ' ')).filter((x) => /RON-T/.test(x)));
    afirmar(arquivo.length === 2 && arquivo.every((x) => /Cancelada pela rotina \(rotina desativada em 19\/10\/2026\)\./.test(x)), 'Arquivo: ' + arquivo.join(' || '));
    // 4. Ativar: voltam, sem confirmacao
    await abrirRotinas(f);
    r = await recadoDe(f, () => f.click('#conteudo-cfg tr:has(td:text-is("RON")) >> text=Ativar'));
    afirmar(r === 'Rotina ativada. 6 atividades de volta ao calendário.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON' && x.ativo), null, { timeout: 15000 });
    await abrirMes(f, 'OUT 2026');
    afirmar(await diasDaSigla(f, 'RON') === '23,30', 'de volta na sexta: ' + await diasDaSigla(f, 'RON'));
    // 5. sabado e domingo
    await abrirRotinas(f);
    for (const [sigla, dia] of [['SAB', 'Sáb'], ['DOM', 'Dom']]) {
      await f.click('text=Nova rotina');
      await f.waitForSelector('.rot-dias');
      await f.fill('#ro-tipo', sigla);
      await f.fill('#ro-atividade', 'Conferência de ' + dia);
      await f.click('.rot-dias label:has-text("' + dia + '")');
      await recadoDe(f, () => f.click('#janela-rodape >> text=Salvar'));
      await f.waitForFunction((x) => paginaAtual === 'config' && DADOS.rotinas.some((t) => t.tipo === x), sigla, { timeout: 15000 });
    }
    afirmar(/ \| todo sábado \| /.test(await linhaDaRotina(f, 'SAB')) && / \| todo domingo \| /.test(await linhaDaRotina(f, 'DOM')),
      await linhaDaRotina(f, 'SAB') + ' / ' + await linhaDaRotina(f, 'DOM'));
    // 6. Remover pede confirmacao
    await f.click('#conteudo-cfg tr:has(td:text-is("DOM")) >> text=Remover');
    await f.waitForSelector('text=Remover rotina');
    const remover = await textoDe(f, '.rot-texto');
    afirmar(remover === 'A rotina sai da lista e para de gerar atividades. As 6 pendentes de hoje em diante serão canceladas ' +
      '(ficam no Arquivo de canceladas). O histórico — entregues, validadas e passadas — continua.', remover);
    r = await recadoDe(f, () => f.click('text=Remover rotina'));
    afirmar(r === 'Rotina removida. 6 atividades pendentes canceladas.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && !DADOS.rotinas.some((x) => x.tipo === 'DOM'), null, { timeout: 15000 });
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  /*
   * O que a versao anterior deixou no calendario: "Desativar" so gravava ATIVO=NAO e "Remover" so tirava a
   * linha de ROTINAS — as pendentes ficaram (a queixa "desativar nao vai").
   */
  await cenario('rotinas da versao anterior: a parada com pendentes mostra "Tirar do calendario (6)" e a removida aparece em "Atividades de rotinas removidas"; as duas saem do calendario', async () => {
    const s = await subir({ agora: SEGUNDA_19_10 }); instalarComPessoas(s); comOutENov(s);
    const nova = (campos) => noServidor(s, (c, adm) => c.acaoSalvarRotina(adm, Object.assign({ frequencia: 'SEMANAL', porTurno: false, exigeSetor: false, ativo: true }, campos)));
    nova({ tipo: 'LIM', atividade: 'Limpeza da doca', dia: '4' });
    nova({ tipo: 'INS', atividade: 'Inspeção de extintores', dia: '2' });
    const lim = idDaRotinaNoServidor(s, 'LIM'), ins = idDaRotinaNoServidor(s, 'INS');
    noServidor(s, (c) => c.atualizar('ROTINAS', lim, { ATIVO: 'NAO' }, DONO));
    noServidor(s, (c) => c.excluir('ROTINAS', ins, DONO));
    const aba = await abrirAba(s, DONO, { relogio: SEGUNDA_19_10, contexto: await navegador.newContext({ viewport: { width: 1300, height: 1300 } }) });
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await abrirRotinas(f);
    // 1. parada com pendentes: a lista diz quantas ainda estao no calendario e oferece tira-las
    afirmar(await linhaDaRotina(f, 'LIM') === 'LIM | Limpeza da doca | toda quinta | — | parada · 6 ainda no calendário', await linhaDaRotina(f, 'LIM'));
    await f.click('#conteudo-cfg tr:has(td:text-is("LIM")) >> text=Tirar do calendário (6)');
    await f.waitForSelector('#janela-rodape >> text=Tirar do calendário');
    afirmar(await textoDe(f, '#janela-titulo') === 'Tirar “Limpeza da doca” do calendário?', await textoDe(f, '#janela-titulo'));
    const parada = await textoDe(f, '.rot-texto');
    afirmar(parada === 'A rotina já está parada, mas 6 atividades pendentes de hoje em diante (OUT 2026: 2 · NOV 2026: 4) continuam no calendário — ' +
      'ficaram da versão anterior. Elas serão canceladas e ficam no Arquivo de canceladas do mês.', parada);
    let r = await recadoDe(f, () => f.click('#janela-rodape >> text=Tirar do calendário'));
    afirmar(r === 'Rotina parada. 6 atividades pendentes canceladas (OUT 2026: 2 · NOV 2026: 4).', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'LIM' && !x.pendentes.total), null, { timeout: 15000 });
    afirmar(await linhaDaRotina(f, 'LIM') === 'LIM | Limpeza da doca | toda quinta | — | parada' && !(await f.$('text=Tirar do calendário (')), await linhaDaRotina(f, 'LIM'));
    // 2. removida: nao esta na lista, mas as pendentes dela aparecem a parte
    afirmar(await textoDe(f, '.rot-orfas') === 'Atividades de rotinas removidas INS — 6 pendentes de hoje em diante Tirar do calendário', await textoDe(f, '.rot-orfas'));
    await f.click('.rot-orfa:has-text("INS") >> text=Tirar do calendário');
    await f.waitForSelector('#janela-rodape >> text=Tirar do calendário');
    afirmar(await textoDe(f, '#janela-titulo') === 'Tirar as atividades da rotina removida INS?', await textoDe(f, '#janela-titulo'));
    afirmar(await textoDe(f, '.rot-texto') === 'As 6 pendentes de hoje em diante (OUT 2026: 2 · NOV 2026: 4) serão canceladas e ficam no Arquivo de canceladas do mês.',
      await textoDe(f, '.rot-texto'));
    r = await recadoDe(f, () => f.click('#janela-rodape >> text=Tirar do calendário'));
    afirmar(r === 'Rotina removida INS: 6 atividades pendentes canceladas.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && !(DADOS.orfas || []).length && !document.querySelector('.rot-orfas'), null, { timeout: 15000 });
    // 3. o calendario sem as duas
    for (const comp of ['OUT 2026', 'NOV 2026']) {
      await abrirMes(f, comp);
      afirmar(await diasDaSigla(f, 'LIM') === '' && await diasDaSigla(f, 'INS') === '', comp + ': ' + await diasDaSigla(f, 'LIM') + ' / ' + await diasDaSigla(f, 'INS'));
    }
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('rotina com atividade fora do dia (mudada na planilha): salvar so o nome pergunta "Levar para o dia da rotina?" — Deixar nao mexe, Levar leva; a troca de dia conta a remarcada a mao; janela velha recusada sem erro na tela', async () => {
    const s = await subir({ agora: SEGUNDA_19_10 }); instalarComPessoas(s); comOutENov(s, {});
    noServidor(s, (c) => c.atualizar('ATIVIDADES', 'NOV26-S47-RON-T', { PRAZO: '2026-11-19' }, DONO));          // direto na planilha
    noServidor(s, (c, adm) => c.acaoRemarcar(adm, { id: 'NOV26-S46-RON-T', prazo: '2026-11-12', motivo: 'feriado', avisar: false }));   // pela tela
    const aba = await abrirAba(s, DONO, { relogio: SEGUNDA_19_10, contexto: await navegador.newContext({ viewport: { width: 1300, height: 1300 } }) });
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    const editarRonda = async () => {
      await abrirRotinas(f);
      await f.click('#conteudo-cfg tr:has(td:text-is("RON")) >> text=Editar');
      await f.waitForSelector('.rot-dias input:checked');
    };
    await editarRonda();
    // "No calendario agora" com a cor e a margem dele (o .dica de depois nao apaga)
    const agora = await f.evaluate(() => {
      const p = getComputedStyle(document.querySelector('.rot-agora')), x = document.createElement('span');
      x.style.color = 'var(--tinta)'; document.body.appendChild(x);
      const tinta = getComputedStyle(x).color; x.remove();
      return p.marginTop === '14px' && p.color === tinta;
    });
    afirmar(agora, 'a caixa "No calendário agora" com a cor e a margem dela');
    // 1. so o nome: a tela pergunta, sem ir ao servidor; "Deixar como esta" nao mexe na linha
    await f.fill('#ro-atividade', 'Ronda da noite');
    await f.click('#janela-rodape >> text=Salvar');
    await f.waitForSelector('#janela-rodape >> text=Levar para quarta');
    afirmar(await textoDe(f, '#janela-titulo') === 'Levar para o dia da rotina?', await textoDe(f, '#janela-titulo'));
    const fora = await textoDe(f, '.rot-texto');
    afirmar(fora === '1 atividade pendente de hoje em diante está fora do dia da rotina (toda quarta): ficou no dia antigo na versão anterior ' +
      'ou foi mudada direto na planilha.', fora);
    let r = await recadoDe(f, () => f.click('#janela-rodape >> text=Deixar como está'));
    afirmar(r === 'Rotina salva. No calendário: 6 com o nome novo. Ficaram como estavam: 1 remarcada à mão, 1 fora do dia da rotina.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON' && x.atividade === 'Ronda da noite'), null, { timeout: 15000 });
    await abrirMes(f, 'NOV 2026');
    afirmar(await diasDaSigla(f, 'RON') === '4,12,19,25', 'Deixar: ' + await diasDaSigla(f, 'RON'));
    // 2. de novo, "Levar para quarta": a de 19/11 vai para 18/11 (a remarcada a mao fica)
    await editarRonda();
    await f.click('#janela-rodape >> text=Salvar');
    await f.waitForSelector('#janela-rodape >> text=Levar para quarta');
    r = await recadoDe(f, () => f.click('#janela-rodape >> text=Levar para quarta'));
    afirmar(r === 'Rotina salva. No calendário: 1 mudou para quarta. Ficaram como estavam: 1 remarcada à mão.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON' && !x.pendentes.foraDoDia), null, { timeout: 15000 });
    await abrirMes(f, 'NOV 2026');
    afirmar(await diasDaSigla(f, 'RON') === '4,12,18,25', 'Levar: ' + await diasDaSigla(f, 'RON'));
    // 3. quarta -> sexta: a confirmacao separa a remarcada a mao, como o servidor faz
    await editarRonda();
    await f.click('.rot-dias label:has-text("Sex")');
    await f.click('#janela-rodape >> text=Salvar');
    await f.waitForSelector('#ro-ajustar:checked');
    const mudar = await textoDe(f, '.rot-texto');
    afirmar(mudar === '“Ronda da noite” passa de toda quarta para toda sexta. Das 6 pendentes de hoje em diante (OUT 2026: 2 · NOV 2026: 4), ' +
      '5 vão para a sexta da mesma semana e 1 remarcada à mão fica onde está. Não mudam: as já entregues ou validadas e as de datas que já passaram. ' +
      'Se a sexta desta semana já passou, a desta semana fica como está.', mudar);
    r = await recadoDe(f, () => f.click('text=Salvar e ajustar o calendário'));
    afirmar(r === 'Rotina salva. No calendário: 5 mudaram para sexta. Ficaram como estavam: 1 remarcada à mão.', r);
    await f.waitForFunction(() => paginaAtual === 'config' && DADOS.rotinas.some((x) => x.tipo === 'RON' && x.dia === '5'), null, { timeout: 15000 });
    // 4. outra pessoa grava a rotina com a janela aberta: o Salvar e recusado, sem "Uncaught (in promise)" na tela
    await editarRonda();
    s.mundo.desvioRelogio += 60 * 1000;
    noServidor(s, (c) => c.atualizar('ROTINAS', idDaRotinaNoServidor(s, 'RON'), { ATIVIDADE: 'Ronda do gerente B' }, DONO));
    r = await recadoDe(f, () => f.click('#janela-rodape >> text=Salvar'));
    afirmar(r === '[ERRO] Esta rotina foi alterada por outra pessoa enquanto a janela estava aberta. Feche e abra de novo.', r);
    afirmar(noServidor(s, (c) => String(c.obter('ROTINAS', idDaRotinaNoServidor(s, 'RON')).ATIVIDADE)) === 'Ronda do gerente B', 'a gravacao do outro ficou');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('rotinas com o Google barrando (HTTP 403): a confirmacao abre sem ir ao servidor e a gravacao vai pela pagina (1 POST), de volta na lista; Desativar tambem', async () => {
    const s = await subir({ agora: SEGUNDA_19_10 }); instalarComPessoas(s); comOutENov(s, {});
    criarPin(s, DONO, DONO, '4321');
    const aba = await abrirAba(s, DONO, { bloqueio403: true, relogio: SEGUNDA_19_10,
      contexto: await navegador.newContext({ viewport: { width: 1300, height: 1300 } }) });
    await entrar(aba, DONO, '4321');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 30000) === 'aplicacao', 'entrou pela reserva');
    let f = await paginaNova(aba, () => CANAL_BARRADO && paginaAtual === 'modulos');
    const pelaPagina = async (gesto, pronta) => {
      await f.evaluate(() => { window.__paginaVelha = true; });
      await gesto();
      f = await paginaNova(aba, pronta);
    };
    const listaPronta = () => paginaAtual === 'config' && !!document.querySelector('#conteudo-cfg .rot-botoes');
    await pelaPagina(() => f.evaluate(() => { esquecerTelas(); abrirConfig('config'); }), () => paginaAtual === 'config' && !!document.querySelector('.abas'));
    await f.click('.abas .aba >> text=Calendário');                 // a aba fica guardada para a pagina que volta da gravacao
    await f.waitForSelector('#conteudo-cfg .rot-botoes');
    await f.click('#conteudo-cfg tr:has(td:text-is("RON")) >> text=Editar');
    await f.click('.rot-dias label:has-text("Sex")');
    marcar(aba);
    await f.click('#janela-rodape >> text=Salvar');
    await f.waitForSelector('#ro-ajustar');
    let d = desdeMarca(aba);
    afirmar(!d.posts && !d.gets && !d.runs.filter((x) => x !== 'sondarCanal').length, 'a confirmacao abriu sem ir ao servidor: ' + JSON.stringify(d));
    afirmar(/As 6 atividades pendentes de hoje em diante \(OUT 2026: 2 · NOV 2026: 4\) vão para a sexta/.test(await textoDe(f, '.rot-texto')), 'contagem da confirmacao');
    marcar(aba);
    await pelaPagina(() => f.click('text=Salvar e ajustar o calendário'), listaPronta);
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'gravou pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction(() => document.getElementById('recado').textContent === 'Rotina salva. No calendário: 6 mudaram para sexta.', null, { timeout: 5000 });
    afirmar(/ \| toda sexta \| /.test(await linhaDaRotina(f, 'RON')), 'a pagina voltou na lista das rotinas: ' + await linhaDaRotina(f, 'RON'));
    const c = s.contexto(DONO);
    c._porta = true;
    afirmar(c.listar('ATIVIDADES').filter((a) => String(a.TIPO) === 'RON').every((a) => c.paraData(a.PRAZO).getDay() === 5), 'no servidor, todas na sexta');
    await f.click('#conteudo-cfg tr:has(td:text-is("RON")) >> text=Desativar');
    await f.waitForSelector('text=Desativar e cancelar 6');
    marcar(aba);
    await pelaPagina(() => f.click('text=Desativar e cancelar 6'), listaPronta);
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'desativou pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction(() => /^Rotina desativada\. 6 atividades pendentes canceladas/.test(document.getElementById('recado').textContent), null, { timeout: 5000 });
    afirmar(/ \| parada$/.test(await linhaDaRotina(f, 'RON')), await linhaDaRotina(f, 'RON'));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('rotinas da versao anterior com o Google barrando (HTTP 403): "Tirar do calendario" da rotina removida e o "Deixar como esta" gravam pela pagina (1 POST cada)', async () => {
    const s = await subir({ agora: SEGUNDA_19_10 }); instalarComPessoas(s); comOutENov(s, {});
    noServidor(s, (c) => c.excluir('ROTINAS', idDaRotinaNoServidor(s, 'RON'), DONO));                       // removida pela versao anterior
    noServidor(s, (c) => c.atualizar('ATIVIDADES', 'NOV26-S46-REU-T', { PRAZO: '2026-11-12' }, DONO));      // reuniao de sexta mudada na planilha
    criarPin(s, DONO, DONO, '4321');
    const aba = await abrirAba(s, DONO, { bloqueio403: true, relogio: SEGUNDA_19_10,
      contexto: await navegador.newContext({ viewport: { width: 1300, height: 1300 } }) });
    await entrar(aba, DONO, '4321');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 30000) === 'aplicacao', 'entrou pela reserva');
    let f = await paginaNova(aba, () => CANAL_BARRADO && paginaAtual === 'modulos');
    const pelaPagina = async (gesto, pronta) => {
      await f.evaluate(() => { window.__paginaVelha = true; });
      await gesto();
      f = await paginaNova(aba, pronta);
    };
    const listaPronta = () => paginaAtual === 'config' && !!document.querySelector('#conteudo-cfg .rot-botoes');
    await pelaPagina(() => f.evaluate(() => { esquecerTelas(); abrirConfig('config'); }), () => paginaAtual === 'config' && !!document.querySelector('.abas'));
    await f.click('.abas .aba >> text=Calendário');
    await f.waitForSelector('#conteudo-cfg .rot-orfas');
    afirmar(/RON — 6 pendentes de hoje em diante/.test(await textoDe(f, '.rot-orfas')), await textoDe(f, '.rot-orfas'));
    await f.click('.rot-orfa:has-text("RON") >> text=Tirar do calendário');
    await f.waitForSelector('#janela-rodape >> text=Tirar do calendário');
    marcar(aba);
    await pelaPagina(() => f.click('#janela-rodape >> text=Tirar do calendário'), listaPronta);
    let d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'tirou pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction(() => document.getElementById('recado').textContent === 'Rotina removida RON: 6 atividades pendentes canceladas.', null, { timeout: 5000 });
    afirmar(!(await f.$('.rot-orfas')), 'a lista das removidas sumiu');
    afirmar(!noServidor(s, (c) => c.listar('ATIVIDADES').some((a) => String(a.TIPO) === 'RON' && String(a.VALIDACAO) !== 'Cancelada')), 'no servidor, nenhuma RON no calendario');
    // a reuniao mudada na planilha: salvar sem mudar a regra pergunta; "Deixar" (alinharForaDoDia: false) atravessa o POST
    await f.click('#conteudo-cfg tr:has(td:text-is("REU")) >> text=Editar');
    await f.waitForSelector('.rot-dias input:checked');
    marcar(aba);
    await f.click('#janela-rodape >> text=Salvar');
    await f.waitForSelector('#janela-rodape >> text=Levar para sexta');
    afirmar(!desdeMarca(aba).posts, 'a pergunta abriu sem ir ao servidor');
    await pelaPagina(() => f.click('#janela-rodape >> text=Deixar como está'), listaPronta);
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'gravou pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction(() => document.getElementById('recado').textContent === 'Rotina salva. Ficaram como estavam: 1 fora do dia da rotina.', null, { timeout: 5000 });
    const prazo = noServidor(s, (c) => c.paraISO(c.paraData(c.obter('ATIVIDADES', 'NOV26-S46-REU-T').PRAZO)));
    afirmar(prazo === '2026-11-12', 'a reuniao ficou na quinta: ' + prazo);
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('rotina com "Exige setor": a atividade mostra o seletor de setor e o coordenador recebe o aviso; a Vistoria sem a marca nao mostra', async () => {
    const s = await subir({ agora: SEGUNDA_19_10 }); instalarComPessoas(s); comOutENov(s, { exigeSetor: true });
    const c = s.contexto(DONO);
    c._porta = true;
    const vis = c.listar('ROTINAS').find((x) => String(x.TIPO) === 'VIS');
    c.acaoSalvarRotina({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') },
      { id: vis.ID, tipo: 'VIS', atividade: vis.ATIVIDADE, frequencia: 'SEMANAL', dia: '3', porTurno: true, exigeSetor: false, ativo: true });
    const aba = await abrirAba(s, DONO, { relogio: SEGUNDA_19_10 });
    await entrar(aba, DONO, '4321', true);
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await abrirMes(f, 'OUT 2026');
    await f.evaluate(() => abrirAtividade('OUT26-S43-RON-T'));
    await f.waitForSelector('#a-setor');
    afirmar(await f.evaluate(() => el('a-setor').closest('.campo').querySelector('label').textContent) === 'Setor', 'rotulo "Setor"');
    s.mundo.emails.length = 0;
    const r = await recadoDe(f, () => f.selectOption('#a-setor', 'Recebimento'));
    afirmar(r === 'Setor definido — coordenador avisado', r);
    afirmar(s.mundo.emails.some((e) => e.to === COORD && e.subject === 'Setor definido — Ronda de segurança (S43): Recebimento'),
      'aviso: ' + s.mundo.emails.map((e) => e.to + ' ' + e.subject).join(' | '));
    await f.waitForFunction(() => paginaAtual === 'calendario' && el('janela').classList.contains('oculto'), null, { timeout: 15000 });
    await f.evaluate(() => abrirAtividade('OUT26-S43-VIS-A'));
    await f.waitForSelector('#janela:not(.oculto)');
    afirmar(!(await f.$('#a-setor')), 'a Vistoria sem "Exige setor" nao mostra o seletor');
    // servidor de antes desta versao (sem tiposComSetor): a Vistoria mostra, como era
    const deAntes = await f.evaluate(() => {
      const t = DADOS.tiposComSetor;
      delete DADOS.tiposComSetor;
      abrirAtividade('OUT26-S43-VIS-A');
      const tem = !!el('a-setor');
      DADOS.tiposComSetor = t;
      return tem;
    });
    afirmar(deAntes, 'sem tiposComSetor, a Vistoria tem o seletor');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
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
    // Ferias (21/10): o numero da aba conta quem esta no vermelho ou no laranja (sem programacao: 2 vermelhos e 1 laranja)
    afirmar(abasTela.join('|') === 'Visão geral|Quadro por turno|Movimentação|Férias ■ 3|Conferência ■ 3', 'abas: ' + abasTela.join('|'));
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
    afirmar(/^Quadro do CD — CD Feira de Santana — \d\d\/\d\d\/\d{4}\n167 pessoas no quadro: 1° TURNO 60 · 2° TURNO 53 · 3° TURNO 39 · ADM 14 · sem turno 1\n158 disponíveis · 6 de férias · 3 afastados\nÚltimos 90 dias: 15 saídas e 11 entradas\nAtenção: 3 desligados ainda ATIVOS na GERAL\nFérias: \d+ para programar, 0 programadas, 3 pedem atenção agora, 3 sem dados de férias$/.test(resumo),
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
    // FÉRIAS (21/10): a aba abre com a busca e os grupos; cada pessoa conta num lugar so. Cada caso da situacao, a busca,
    // a janela Programar, o calendario, o Excel e a gravacao pela pagina estao nos cenarios "ferias (21/10)" (relogio parado).
    const PROIBIDAS = /multa|dobro|risco|penalidade|infra[çc][ãa]o|puni[çc][ãa]o/i;
    await f.evaluate(() => { try { localStorage.removeItem('gsl_ferias_vista'); } catch (e) {} QD.feVista = ''; qdAba('ferias'); });
    await f.waitForSelector('.qd-fe .qd-fe-grupo', { timeout: 5000 });
    const fe = await f.evaluate(() => ({
      aba: document.querySelector('#qd-abas .aba[data-aba="ferias"]').innerText.replace(/\s+/g, ' ').trim(),
      tit: document.querySelector('#qd-fe-tit').innerText.trim(), busca: document.querySelector('#qd-fe-busca').placeholder,
      vista: document.querySelector('.qd-fe-vista .qd-pill[aria-pressed="true"]').innerText.trim(),
      grupos: Array.from(document.querySelectorAll('.qd-fe-grupo h3')).map((h) => h.innerText.replace(/\s+/g, ' ').trim()),
      rodape: document.querySelector('.qd-fe-rodape').innerText.replace(/\s+/g, ' ').trim(), html: document.querySelector('.qd-fe').innerHTML,
      soma: (() => { const c = qdFeContagem(qdFePessoas()), d = qdFeDesconhecido(); return [c.programar.length, c.programadas.length, c.emdia.length, d.n, qdRecorte(qdNaEmpresa()).length]; })() }));
    afirmar(fe.aba === 'Férias' && fe.tit === 'Programação de férias' && fe.busca === 'Buscar pelo nome' && fe.vista === 'Lista' && /^Programar \d+$/.test(fe.grupos[0]) && fe.grupos.length === 1,
      'aba Ferias (sem o contador com a aba aberta; Lista na primeira vez; sem programacao, so o Programar): ' + JSON.stringify([fe.aba, fe.tit, fe.vista, fe.grupos]));
    afirmar(/^\d+ em dia 3 sem dados de férias · ver na Conferência Baixar Excel Parâmetros crítico urgente atenção no prazo resolvido nada a fazer Marcou férias no sistema\? Cole a extração nova na aba FÉRIAS e use Atualizar dados\.$/.test(fe.rodape),
      'rodape: ' + fe.rodape);
    afirmar(fe.soma[0] + fe.soma[1] + fe.soma[2] + fe.soma[3] === fe.soma[4] && fe.soma[1] === 0 && !PROIBIDAS.test(fe.html), 'cada pessoa conta num lugar so: ' + fe.soma.join());
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
    afirmar(await c.evaluate(() => !!document.querySelector('.qd-fe .qd-fe-rodape') && !document.querySelector('.qd-fe-rodape').innerText.includes('Parâmetros') &&
      document.querySelectorAll('.qd-fe-item').length > 0 && !document.querySelector('.qd-fe-bt')), 'quem so ve nao muda os parametros nem programa ferias (sem botoes)');
    afirmar(!pc.erros.length, 'erros: ' + pc.erros.join(' | '));
    await pc.contexto.close();
    await s.fechar();
  });


  /*
   * FÉRIAS (21/10, programacao). Servidor e navegador parados na quarta 21/10/2026; a planilha de teste do Quadro
   * (dados-quadro.js: as 17 primeiras pessoas sao um caso cada) ligada pelo servidor e a programacao desses casos
   * ja gravada no banco, como a tela gravaria.
   */
  const QUARTA_21_10 = '2026-10-21T10:00:00-03:00';
  const PROIBIDAS_FE = /multa|dobro|risco|penalidade|infra[çc][ãa]o|puni[çc][ãa]o/i;
  const quadroComFerias = async (opcoes) => {
    const s = await subir({ agora: QUARTA_21_10 }); instalarComPessoas(s);
    const { abas, esperado: E } = require('./dados-quadro.js')(s.mundo.DataDoScript, new Date(QUARTA_21_10));
    const pl = s.mundo.novaPlanilha('BI Quadro CD Feira');
    const Aba = Object.getPrototypeOf(pl.abas[0]).constructor;
    Object.keys(abas).forEach((nome, i) => {
      const a = i === 0 ? pl.abas[0] : new Aba(pl, nome, 1000, 26);
      if (i === 0) a.nome = nome; else pl.abas.push(a);
      abas[nome].forEach((linha, l) => { if (linha) a.dados[l] = linha.slice(); });
    });
    const dono = pelaPorta(s, DONO, DONO, '4321');
    dono('salvarFonteQuadro', { link: 'https://docs.google.com/spreadsheets/d/' + pl.id + '/edit' });
    const c = s.contexto(DONO); c._porta = true;
    E.programacoes.forEach((p) => c.inserir('FERIAS_PROG', p, DONO));
    const aba = await abrirAba(s, DONO, Object.assign({ relogio: QUARTA_21_10, contexto: await navegador.newContext({ viewport: (opcoes && opcoes.viewport) || { width: 1300, height: 1100 } }) }, opcoes || {}));
    return { s, E, dono, aba };
  };
  /* Abre o Quadro na aba Ferias (pelo canal normal). */
  const abrirFerias = async (aba) => {
    await entrar(aba, DONO, '4321');
    await esperarTela(aba, ['aplicacao']);
    const f = await frame(aba);
    await f.evaluate(() => abrir('quadro'));
    await f.waitForSelector('.qd-cartao', { timeout: 20000 });
    return f;
  };
  /* A linha de uma pessoa na aba (a primeira com esse nome), como a pessoa ve. */
  const linhaFe = (f, nome) => f.evaluate((n) => {
    const li = Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-item')).find((x) => x.querySelector('.qd-fe-nome').innerText.trim() === n);
    if (!li) return null;
    const t = (sel) => ((li.querySelector(sel) || {}).innerText || '').replace(/\s+/g, ' ').trim();
    return { st: t('.qd-fe-st'), cor: (/qd-fe-(vermelho|laranja|amarelo|azul|verde|cinza|semdata)/.exec(li.className) || [])[1], folha: t('.qd-fe-folha'), det: t('.qd-fe-det'),
      bts: Array.from(li.querySelectorAll('.qd-fe-bt')).map((b) => b.innerText.trim()), grupo: li.closest('.qd-fe-grupo') ? li.closest('.qd-fe-grupo').querySelector('h3').id : '',
      rot: li.querySelector('.qd-fe-abre').getAttribute('aria-label') };
  }, nome);
  /* Clica num botao da linha de uma pessoa (Programar, Reprogramar, Confirmar saida). */
  const botaoFe = (f, nome, texto) => f.evaluate(([n, t]) => {
    const li = Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-item')).find((x) => x.querySelector('.qd-fe-nome').innerText.trim() === n);
    Array.from(li.querySelectorAll('.qd-fe-bt')).find((b) => b.innerText.trim() === t).click();
  }, [nome, texto]);
  const recadoFe = (f, texto) => f.waitForFunction((t) => document.getElementById('recado').textContent === t && el('janela').classList.contains('oculto'), texto, { timeout: 15000 });
  const ESPERA_FE = {
    vencido: ['vermelho', 'Limite máximo para sair vencido em 11/10 (há 10 dias)'], ja: ['laranja', 'Programe já: limite máximo em 45 dias'],
    hoje: ['vermelho', 'Programe hoje: limite máximo em 20 dias'], pode: ['amarelo', 'Já pode sair desde 23/06 — sem programação'],
    programar: ['azul', 'Programar: pode sair a partir de 20/11'], deferias: ['verde', 'De férias desde 18/10'],
    prog: ['azul', 'Programada para 20/12 · aviso até 20/11'], aviso: ['amarelo', 'Entregar o aviso até 24/10 (em 3 dias)'],
    sai: ['azul', 'Sai em 10/11 (em 20 dias)'], breve: ['laranja', 'Sai em 5 dias (26/10)'], confirme: ['laranja', 'Saída prevista para 19/10 — confirme'],
    confirmeja: ['vermelho', 'Saiu de férias em 11/10? Confirme'], depois: ['vermelho', 'Programada depois do limite máximo — reprogramar'],
    cumprida: ['verde', 'Férias cumpridas'], fechado: ['cinza', 'Em dia — pode sair a partir de 29/01'], emdia: ['cinza', 'Em dia — pode sair a partir de 19/01'],
    semdata: ['semdata', 'Sem limite máximo na aba FÉRIAS']
  };
  const dma = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  /* FOTO_FERIAS=prefixo: as telas da aba Ferias em PNG, para conferir o desenho (sem as animacoes de entrada, paradas pelo relogio do teste). */
  const fotoFe = async (aba, f, nome, rolar) => {
    if (!process.env.FOTO_FERIAS) return;
    await f.addStyleTag({ content: '*, *::before { animation: none !important; transition: none !important; }' });
    if (rolar) await f.evaluate((sel) => { const e = document.querySelector(sel); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 12); }, rolar);
    await aba.page.screenshot({ path: process.env.FOTO_FERIAS + '-' + nome + '.png' });
  };

  await cenario('ferias (21/10): relogio parado — a cor e o texto de cada caso, os grupos Programar e Programadas (folhinha, ordem, botoes), de ferias agora e cumpridas, o numero da aba, o calendario, o Excel, o resumo, a Visao geral e a ficha; nenhuma palavra de multa', async () => {
    const { s, E, aba } = await quadroComFerias();
    const f = await abrirFerias(aba);
    afirmar(await f.evaluate(() => document.querySelector('#qd-abas .aba[data-aba="ferias"]').innerText.replace(/\s+/g, ' ').trim()) === 'Férias ■ 7',
      'o numero da aba: 4 no vermelho e 3 no laranja (o CD inteiro)');
    // a cor e o texto de cada caso (a pessoa vale pelo periodo mais urgente)
    const sit = await f.evaluate((casos) => { const fd = qdFeriasDados(), r = {}; Object.keys(casos).forEach((k) => {
      const g = qdGeral().find((x) => x.cod === casos[k].cod); const p = fd.porRef[g.ref]; r[k] = p ? [p.pior.cor, p.pior.txt] : null; }); return r; }, E.casos);
    const errados = Object.keys(ESPERA_FE).filter((k) => JSON.stringify(sit[k]) !== JSON.stringify(ESPERA_FE[k]));
    afirmar(!errados.length, 'situacao de cada caso: ' + errados.map((k) => k + ' ' + JSON.stringify(sit[k]) + ' (esperado ' + JSON.stringify(ESPERA_FE[k]) + ')').join(' | '));
    // os grupos na tela
    await f.evaluate(() => { QD.feVista = 'lista'; qdAba('ferias'); });
    await f.waitForSelector('#qd-fe-corpo .qd-fe-grupo');
    const g = await f.evaluate(() => ({ grupos: Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-grupo h3')).map((h) => h.innerText.replace(/\s+/g, ' ').trim()),
      prog: Array.from(document.querySelectorAll('#qd-fe-g-programadas ~ .qd-fe-itens .qd-fe-nome, .qd-fe-grupo:nth-of-type(2) .qd-fe-nome')).map((x) => x.innerText.trim()),
      ordem: Array.from(document.querySelectorAll('.qd-fe-grupo')).map((gr) => Array.from(gr.querySelectorAll('.qd-fe-nome')).map((x) => x.innerText.trim())),
      agora: document.querySelector('.qd-fe-agora-bt').innerText.replace(/\s+/g, ' ').trim(), html: document.querySelector('.qd-fe').innerHTML }));
    const n = (k) => E.casos[k].nome;
    afirmar(/^Programar \d+$/.test(g.grupos[0]) && g.grupos[1] === 'Programadas 7', 'grupos: ' + g.grupos.join(' | '));
    afirmar(g.ordem[0].slice(0, 3).join() === [n('vencido'), n('hoje'), n('ja')].join() && g.ordem[1].join() === ['confirmeja', 'depois', 'confirme', 'breve', 'aviso', 'sai', 'prog'].map(n).join(),
      'do mais urgente para o menos: ' + JSON.stringify([g.ordem[0].slice(0, 4), g.ordem[1]]));
    afirmar(['deferias', 'cumprida', 'fechado', 'emdia', 'semdata'].every((k) => !g.ordem.some((x) => x.indexOf(n(k)) !== -1)), 'em dia, verde e sem dados fora dos grupos');
    // o grupo grande mostra 40 e o "Mostrar todos"
    const todos = Number(g.grupos[0].replace(/\D+/g, ''));
    afirmar(todos > 40 && g.ordem[0].length === 40 && await f.evaluate(() => document.querySelector('.qd-fe-grupo .qd-mais').innerText.trim()) === 'Mostrar todos (' + todos + ')', 'Programar com ' + todos);
    await f.click('.qd-fe-grupo .qd-mais');
    await f.waitForFunction((t) => document.querySelectorAll('.qd-fe-grupo')[0].querySelectorAll('.qd-fe-item').length === t, todos, { timeout: 5000 });
    afirmar(g.agora === '6 de férias agora · 2 cumpridas nos últimos 60 dias', 'linha de ferias agora: ' + g.agora);
    await fotoFe(aba, f, 'lista', '.qd-fe');
    await fotoFe(aba, f, 'programadas', '#qd-fe-g-programadas');
    const lv = await linhaFe(f, n('vencido')), lp = await linhaFe(f, n('pode')), la = await linhaFe(f, n('aviso')), lc = await linhaFe(f, n('confirme')), lb = await linhaFe(f, n('breve'));
    afirmar(lv.cor === 'vermelho' && lv.folha === 'OUT 11 dom' && lv.st === ESPERA_FE.vencido[1] && lv.det === 'pode sair desde 25/11/2025' && lv.bts.join() === 'Programar',
      'linha do vencido (folhinha no limite maximo; a outra data com o ano, a mais de 300 dias): ' + JSON.stringify(lv));
    afirmar(lp.folha === 'JUN 23 ter' && lp.det === 'limite máximo para sair: ' + dma(E.casos.pode.limiteMax).slice(0, 5) && /Consta como desligado/.test(lp.rot) && lp.grupo === 'qd-fe-g-programar',
      'linha do amarelo (folhinha no pode sair; consta como desligado): ' + JSON.stringify(lp));
    afirmar(la.cor === 'amarelo' && la.folha === 'NOV 23 seg' && la.det === 'Sai em 23/11 (em 33 dias) · 30 dias' && la.bts.join() === 'Reprogramar' && la.grupo === 'qd-fe-g-programadas', 'linha do aviso: ' + JSON.stringify(la));
    afirmar(lc.bts.join() === 'Confirmar saída,Reprogramar' && lc.det === 'Saída em 19/10 (há 2 dias) · 30 dias · volta em 18/11' && lb.bts.join() === 'Reprogramar' &&
      lb.det === '30 dias · volta em 25/11' && (await linhaFe(f, n('depois'))).det === 'Sai em 19/01 (em 90 dias) · 30 dias · limite máximo para sair: 09/01',
      'confirmar so do inicio em diante; a linha de baixo so com o que o texto colorido nao diz: ' + JSON.stringify([lc, lb]));
    // de ferias agora e cumpridas: a linha abre a lista
    await f.click('.qd-fe-agora-bt');
    const agora = await f.evaluate(() => Array.from(document.querySelectorAll('.qd-fe-agora .qd-fe-item')).map((li) => li.querySelector('.qd-fe-nome').innerText.trim() + ': ' + li.querySelector('.qd-fe-st').innerText.trim() +
      (li.querySelector('.qd-fe-det') ? ' ' + li.querySelector('.qd-fe-det').innerText.trim() : '')));
    afirmar(agora.length === 8 && agora.some((x) => x.indexOf(n('deferias') + ': De férias desde 18/10 Saída em 18/10') === 0) && agora.indexOf(n('cumprida') + ': Férias cumpridas saiu em 01/10 · 30 dias') !== -1 &&
      agora.indexOf(n('fechado') + ': Férias cumpridas saiu em 06/10 · 30 dias · período fechado na aba FÉRIAS') !== -1, 'quem esta de ferias e as cumpridas: ' + agora.join(' | '));
    // rodape e legenda
    const rod = await f.evaluate(() => [document.querySelector('.qd-fe-rodape').innerText.replace(/\s+/g, ' ').trim(),
      (() => { const c = qdFeContagem(qdFePessoas()), d = qdFeDesconhecido(); return c.programar.length + c.programadas.length + c.emdia.length + d.n === qdRecorte(qdNaEmpresa()).length; })()]);
    afirmar(/^\d+ em dia 3 sem dados de férias · ver na Conferência Baixar Excel Parâmetros crítico urgente atenção no prazo resolvido nada a fazer /.test(rod[0]) && rod[1], 'rodape: ' + rod[0]);
    // calendario de outubro: as pilulas no dia que importa; o vermelho com a data ja passada na faixa de cima
    await f.click('.qd-fe-vista .qd-pill:has-text("Calendário")');
    await f.waitForSelector('.qd-fe-mes');
    const cal = await f.evaluate((nomes) => {
      const pil = (nome) => { const b = Array.from(document.querySelectorAll('.qd-fe-mes .qd-fe-pil')).find((x) => x.getAttribute('aria-label').indexOf(' — ' + nome + ' (') !== -1);
        return b ? b.closest('td').querySelector('.qd-fe-dia-n').innerText + ' ' + (/qd-fe-(vermelho|laranja|amarelo|azul|verde|cinza)/.exec(b.className) || [])[1] : ''; };
      return { tit: document.querySelector('#qd-fe-mes-tit').innerText, faixa: document.querySelector('.qd-fe-vencidos').innerText.replace(/\s+/g, ' ').trim(),
        pils: nomes.map(pil), html: document.querySelector('.qd-fe').innerHTML };
    }, [n('confirme'), n('breve'), n('deferias'), n('vencido'), n('confirmeja')]);
    await fotoFe(aba, f, 'calendario', '.qd-fe');
    afirmar(cal.tit === 'Outubro de 2026' && cal.pils.join() === '19 laranja,26 laranja,18 verde,,' && /^Data já passou .+ \(11\/10\) .+ \(11\/10\)$/.test(cal.faixa) && !PROIBIDAS_FE.test(cal.html),
      'calendario: ' + JSON.stringify([cal.tit, cal.pils, cal.faixa]));
    await f.click('.qd-fe-seta.prox');
    afirmar(await f.evaluate((nome) => { const b = Array.from(document.querySelectorAll('.qd-fe-mes .qd-fe-pil')).find((x) => x.getAttribute('aria-label').indexOf(' — ' + nome + ' (') !== -1);
      return b && b.closest('td').querySelector('.qd-fe-dia-n').innerText === '10' && /qd-fe-vermelho/.test(b.className) && /: Programe hoje: limite máximo em 20 dias\.$/.test(b.getAttribute('title')); }, n('hoje')),
    'novembro: o "programe hoje" no dia do limite maximo');
    // o dia com gente abre a lista dele embaixo da grade (com os botoes); "Hoje" volta ao mes de hoje; a escolha Lista | Calendario fica no navegador
    const doDia = await f.evaluate(() => { qdFeDia('2026-11-10'); const l = document.querySelector('#qd-fe-dia-lista');
      return { tit: l.querySelector('h4').innerText.replace(/\s+/g, ' ').trim(), itens: l.querySelectorAll('.qd-fe-item').length, bts: l.querySelectorAll('.qd-fe-bt').length,
        n: qdFePorDia(qdFePessoas(), '2026-11')['2026-11-10'].length }; });
    afirmar(doDia.tit === 'Terça-feira, 10/11 fechar' && doDia.itens === doDia.n && doDia.n >= 2 && doDia.bts >= doDia.n, 'lista do dia: ' + JSON.stringify(doDia));
    await f.evaluate(() => qdFeFecharDia());
    await f.click('.qd-fe-hoje-bt');
    afirmar(await f.evaluate(() => !document.querySelector('.qd-fe-hoje-bt') && QD.feMes === '2026-10' && !document.querySelector('#qd-fe-dia-lista') &&
      localStorage.getItem('gsl_ferias_vista') === 'calendario' && (QD.feVista = '', qdDesenhar(), QD.feVista === 'calendario')), 'Hoje e a escolha guardada');
    // muita gente no mesmo dia: 2 pilulas e "+N no dia"; a faixa de cima mostra 6 nomes e corta (as datas mudadas so na pagina)
    const muitos = await f.evaluate(() => {
      const orig = DADOS, r = {};
      try {
        const hoje = qdHoje(), dia = qdSomarDias(hoje, 45);
        const emDia = qdFePessoas().filter((p) => p.pior.k === 'emdia').map((p) => p.g.ref), mesmoDia = emDia.slice(0, 5), vencem = emDia.slice(5, 13);
        DADOS = Object.assign({}, orig, { ferias: Object.assign({}, orig.ferias, { linhas: orig.ferias.linhas.map((x) => {
          const y = Object.assign({}, x);
          if (mesmoDia.indexOf(y.ref) !== -1) y.limite = dia;                   // azul: pode sair a partir do mesmo dia
          else if (vencem.indexOf(y.ref) !== -1) y.limiteMax = qdSomarDias(hoje, -20 - vencem.indexOf(y.ref));
          return y;
        }) }) });
        QD.feVista = 'calendario'; QD.feMes = dia.slice(0, 7); QD.feDia = '';
        const cal = new DOMParser().parseFromString(qdFerias(), 'text/html');
        const td = cal.querySelector('.qd-fe-dia-bt[data-dia="' + dia + '"]').closest('td'), faixa = cal.querySelector('.qd-fe-vencidos');
        r.dia = { pil: td.querySelectorAll('.qd-fe-pil').length, mais: (td.querySelector('.qd-fe-mais') || {}).textContent || '', n: qdFePorDia(qdFePessoas(), dia.slice(0, 7))[dia].length };
        r.faixa = { nomes: faixa.querySelectorAll('span .qd-link').length, mais: (Array.from(faixa.querySelectorAll('button')).pop() || {}).textContent || '' };
      } finally { DADOS = orig; QD.feVista = 'calendario'; QD.feMes = ''; }
      return r;
    });
    afirmar(muitos.dia.n >= 6 && muitos.dia.pil === 2 && muitos.dia.mais === '+' + (muitos.dia.n - 2) + ' no dia' && muitos.faixa.nomes === 6 && muitos.faixa.mais === 'e mais 4 na lista',
      'muita gente no mesmo dia e a faixa cortada: ' + JSON.stringify(muitos));
    await f.click('.qd-fe-vista .qd-pill:has-text("Lista")');
    // Excel: as colunas do pedido; a linha da programada
    const xls = await f.evaluate(() => { const o = pnBaixarXlsx; let cap = null; pnBaixarXlsx = (nome, abas) => { cap = { nome, abas }; }; try { qdFeBaixar(); } finally { pnBaixarXlsx = o; } return cap; });
    const cab = xls.abas[0].linhas[0].join('|'), lprog = xls.abas[0].linhas.find((l) => l[0] === n('prog'));
    const cp = E.casos.prog;
    afirmar(cab === 'NOME|RH|EQUIPE|FUNÇÃO|PA INÍCIO|PA FIM|PODE SAIR A PARTIR DE|LIMITE MÁXIMO PARA SAIR|PROGRAMADA PARA|DIAS|VOLTA EM|SITUAÇÃO|DIAS ATÉ O LIMITE MÁXIMO' &&
      xls.nome === 'ferias-quadro-cd-2026-10-21.xlsx' && xls.abas[0].linhas[1][0] === n('vencido') &&
      JSON.stringify(lprog) === JSON.stringify([n('prog'), cp.rh, '1° TURNO', 'SEPARADOR', '01/09/2025', dma(cp.paFim), dma(cp.pode), dma(cp.limiteMax), '20/12/2026', 30, '19/01/2027',
        'Programada para 20/12 · aviso até 20/11', 270]) && !PROIBIDAS_FE.test(JSON.stringify(xls)), 'Excel: ' + cab + ' / ' + JSON.stringify(lprog));
    // copiar resumo, Visao geral e a linha do resumo das outras abas
    const txt = await f.evaluate(() => ({ resumo: qdFeResumoTexto(), linha: qdFeResumoLinha(), card: qdFeCartaoGeral().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));
    afirmar(/^Férias — Quadro do CD — CD Feira de Santana — 21\/10\/2026\nPROGRAMAR \(\d+\)\n- .+ \(1° TURNO, SEPARADOR\) — Limite máximo para sair vencido em 11\/10 \(há 10 dias\)\n/.test(txt.resumo) &&
      txt.resumo.indexOf('\nPROGRAMADAS (7)\n- ' + n('confirmeja') + ' (1° TURNO, SEPARADOR) — Saiu de férias em 11/10? Confirme · Saída em 11/10 (há 10 dias) · 30 dias · volta em 10/11\n') !== -1 &&
      /\nDE FÉRIAS AGORA \(6\)\n/.test(txt.resumo) && /\nSEM DADOS DE FÉRIAS \(3\)\n/.test(txt.resumo) && !PROIBIDAS_FE.test(txt.resumo), 'copiar resumo: ' + txt.resumo.slice(0, 900));
    afirmar(/^Férias: \d+ para programar, 7 programadas, 7 pedem atenção agora, 3 sem dados de férias$/.test(txt.linha), 'linha do resumo: ' + txt.linha);
    afirmar(new RegExp('^Férias Ver férias → Programação pela aba FÉRIAS\\. \\d+ para programar 7 programadas 7 pedem atenção agora \\(vermelho ou laranja\\) Próxima saída: ' + n('breve') +
      ' 1° TURNO em 26/10 seg \\(em 5 dias\\)\\. 3 sem dados de férias \\( ver na Conferência \\)$').test(txt.card) && !PROIBIDAS_FE.test(txt.card), 'Visao geral: ' + txt.card);
    // a ficha: um bloco por periodo, com a linha do tempo, as datas e a programacao
    await f.evaluate((cod) => qdFicha(qdGeral().find((x) => x.cod === cod).ref), E.casos.ja.cod);
    await f.waitForSelector('#janela:not(.oculto) .qd-fe-ficha');
    const ficha = await f.evaluate(() => ({ blocos: Array.from(document.querySelectorAll('.qd-fe-ficha > li')).map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
      tempo: document.querySelectorAll('.qd-fe-ficha .qd-fe-tempo').length, html: document.querySelector('.qd-ficha').innerHTML }));
    await fotoFe(aba, f, 'ficha');
    afirmar(ficha.blocos.length === 2 && ficha.tempo === 2 && /^Programe já: limite máximo em 45 dias linha \d+ da aba FÉRIAS HOJE PA INÍCIO 19\/01\/2025 PA FIM 19\/01\/2026 PODE SAIR A PARTIR DE 19\/01\/2026 seg LIMITE MÁXIMO PARA SAIR 05\/12\/2026 · em 45 dias Programar$/.test(ficha.blocos[0]) &&
      /^Em dia — pode sair a partir de 19\/01 /.test(ficha.blocos[1]) && !PROIBIDAS_FE.test(ficha.html), 'ficha (dois periodos, do mais antigo): ' + JSON.stringify(ficha.blocos));
    await f.evaluate(() => fecharJanela());
    // parametros: os novos campos; o aviso de 46 dias muda as cores (o limite maximo em 45 dias passa a "programe hoje"); depois volta ao padrao
    await f.click('.qd-fe-rod-acoes button:has-text("Parâmetros")');
    await f.waitForSelector('#fp-janela');
    const modal = await f.evaluate(() => ({ txt: document.querySelector('#janela').textContent.replace(/\s+/g, ' '), campos: Array.from(document.querySelectorAll('#janela input')).map((i) => i.id + '=' + i.value).join() }));
    afirmar(modal.campos === 'fp-cc=655,fp-digitos=3,fp-aviso=30,fp-janela=60,fp-urgente=60,fp-tolerancia=3' && /Entra em “Programar”: dias antes de poder sair/.test(modal.txt) && !PROIBIDAS_FE.test(modal.txt),
      'parametros: ' + JSON.stringify(modal));
    await f.fill('#fp-aviso', '46');
    await f.click('#janela-rodape button:has-text("Salvar")');
    await f.waitForFunction(() => DADOS && DADOS.parametrosFerias && DADOS.parametrosFerias.aviso === 46 && document.querySelector('.qd-fe-sub'), null, { timeout: 15000 });
    afirmar((await linhaFe(f, n('ja'))).st === 'Programe hoje: limite máximo em 45 dias' && await f.evaluate(() => document.querySelector('.qd-fe-sub').innerText) === 'O aviso de férias é dado 46 dias antes da saída.',
      'aviso de 46 dias: ' + JSON.stringify(await linhaFe(f, n('ja'))));
    await f.click('.qd-fe-rod-acoes button:has-text("Parâmetros")');
    await f.waitForSelector('#fp-aviso');
    await f.click('#janela-rodape button:has-text("Voltar ao padrão")');
    await f.waitForFunction(() => DADOS && DADOS.parametrosFerias && DADOS.parametrosFerias.aviso === 30, null, { timeout: 15000 });
    // a aba que nao serve (vazia, sem DTA_LIMITEMAX, sem Matricula e Nome, sem a aba): nada vira "ninguem para programar"
    const ruim = await f.evaluate(() => {
      const orig = DADOS, r = {}, txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const com = (ferias, leitura) => Object.assign({}, orig, { ferias: Object.assign({}, orig.ferias, ferias), leitura: Object.assign({}, orig.leitura, { ferias: Object.assign({}, orig.leitura.ferias, leitura) }) });
      try {
        DADOS = com({ linhas: [] }, { linhas: 0 }); r.vazia = [txt(qdFerias()), txt(qdFeCartaoGeral()), qdFeResumoLinha()];
        DADOS = com({ linhas: orig.ferias.linhas.map((x) => Object.assign({}, x, { limiteMax: '' })) }, { faltam: ['limiteMax'] }); r.semColuna = [txt(qdFerias()), qdFeResumoLinha()];
        DADOS = com({ linhas: [] }, { linhas: 0, faltam: ['matricula', 'nome'] }); r.semMatNome = txt(qdFerias());
        DADOS = Object.assign({}, orig, { ferias: null }); r.semAba = txt(qdFerias());
      } finally { DADOS = orig; }
      return r;
    });
    afirmar(/^Programação de férias A aba FÉRIAS está vazia Só tem o cabeçalho/.test(ruim.vazia[0]) && /A aba FÉRIAS está vazia: o GSL não sabe o prazo de ninguém\./.test(ruim.vazia[1]) &&
      ruim.vazia[2] === 'Férias: a aba FÉRIAS está vazia (o GSL não sabe os prazos)' && /Não achei a coluna DTA_LIMITEMAX na aba FÉRIAS Sem ela/.test(ruim.semColuna[0]) &&
      /Não achei as colunas Matricula e Nome na aba FÉRIAS/.test(ruim.semMatNome) && /^Programação de férias Falta a aba FÉRIAS na planilha Extraia as férias do sistema \(com Matricula, Nome, pa_fim, DTA_LIMITE e DTA_LIMITEMAX\)/.test(ruim.semAba) &&
      !/Ninguém para programar/.test(JSON.stringify(ruim)) && !PROIBIDAS_FE.test(JSON.stringify(ruim)), 'aba que nao serve: ' + JSON.stringify(ruim));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('ferias (21/10): a busca pelo nome (sem acento) acha quem esta em dia e deixa programar; a janela Programar (limites, a volta e o aviso ao vivo, o aviso que ja nao cabe, as recusas sem ir ao servidor); Reprogramar; Confirmar saida; Desfazer e Cancelar pela ficha', async () => {
    const { s, E, aba } = await quadroComFerias();
    const f = await abrirFerias(aba);
    const n = (k) => E.casos[k].nome;
    // cada leitura num contexto novo (o listar guarda a tabela lida durante a execucao)
    const banco = () => { const c = s.contexto(DONO); c._porta = true; return c.listar('FERIAS_PROG'); };
    const prog = (k) => banco().find((x) => Number(x.MATRICULA) === Number(E.casos[k].matricula) && x.PA_FIM === E.casos[k].paFim);
    /* Busca a pessoa pelo nome inteiro (a lista da busca mostra todo mundo que bate, em qualquer situacao). */
    const buscar = async (nome) => {
      await f.fill('#qd-fe-busca', nome);
      await f.waitForFunction((x) => Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-nome')).some((y) => y.innerText.trim() === x), nome, { timeout: 5000 });
    };
    await f.evaluate(() => qdAba('ferias'));
    await f.waitForSelector('#qd-fe-busca');
    // a busca: sem acento, as palavras em qualquer ordem; o RH tambem; o cursor fica no campo
    await f.fill('#qd-fe-busca', 'conceicao patricia');
    await f.waitForFunction(() => document.querySelectorAll('#qd-fe-corpo .qd-fe-item').length === 1, null, { timeout: 5000 });
    let l = await linhaFe(f, n('emdia'));
    afirmar(l && l.st === 'Em dia — pode sair a partir de 19/01' && l.cor === 'cinza' && l.bts.join() === 'Programar' && l.grupo === 'qd-fe-g-busca' &&
      await f.evaluate(() => document.activeElement.id === 'qd-fe-busca'), 'busca sem acento acha quem esta em dia: ' + JSON.stringify(l));
    await f.fill('#qd-fe-busca', E.casos.emdia.rh);
    await f.waitForFunction((nome) => document.querySelectorAll('#qd-fe-corpo .qd-fe-item').length === 1 && document.querySelector('#qd-fe-corpo .qd-fe-nome').innerText.trim() === nome, n('emdia'), { timeout: 5000 });
    await f.fill('#qd-fe-busca', 'ninguem com esse nome');
    await f.waitForFunction(() => /^Ninguém com «ninguem com esse nome» no quadro\.$/.test(document.querySelector('#qd-fe-corpo').innerText.trim()), null, { timeout: 5000 });
    await f.fill('#qd-fe-busca', 'Patrícia Conceição');
    await f.waitForFunction(() => document.querySelectorAll('#qd-fe-corpo .qd-fe-item').length === 1, null, { timeout: 5000 });
    // a janela Programar: o periodo, as duas datas, os limites do campo e a volta e o aviso ao vivo
    await botaoFe(f, n('emdia'), 'Programar');
    await f.waitForSelector('#fe-inicio');
    const jan = () => f.evaluate(() => ({ tit: el('janela-titulo').textContent, fatos: document.querySelector('.qd-fe-prog-fatos').innerText.replace(/\s+/g, ' ').trim(),
      min: el('fe-inicio').min, max: el('fe-inicio').max, v: el('fe-inicio').value, dias: el('fe-dias').value, vivo: el('fe-vivo').textContent,
      alerta: el('fe-alerta').hidden ? '' : el('fe-alerta').textContent, erro: el('fe-erro').hidden ? '' : el('fe-erro').textContent,
      bts: Array.from(document.querySelectorAll('#janela-rodape button')).map((b) => b.innerText.trim()).join() }));
    let j = await jan();
    afirmar(j.tit === 'Programar férias — PATRÍCIA CONCEIÇÃO ARAÚJO' && j.fatos === 'Período aquisitivo: 19/01/2026 a 19/01/2027 Pode sair a partir de: 19/01/2027 Limite máximo para sair: 05/12/2027' &&
      j.min === '2027-01-19' && j.max === '2027-12-05' && j.v === '2027-01-19' && j.dias === '30' && j.vivo === 'Volta em 18/02/2027 · entregar o aviso até 20/12/2026' && !j.alerta &&
      j.bts === 'Voltar,Salvar programação', 'janela Programar: ' + JSON.stringify(j));
    // as recusas aparecem na janela, sem ir ao servidor
    marcar(aba);
    const recusa = async (inicio, dias) => { await f.fill('#fe-inicio', inicio); await f.fill('#fe-dias', dias); await f.click('#janela-rodape >> text=Salvar programação'); return (await jan()).erro; };
    afirmar(await recusa('2027-01-18', '30') === 'PATRÍCIA CONCEIÇÃO ARAÚJO só pode sair de férias a partir de 19/01/2027.', 'antes de poder sair');
    afirmar(await recusa('2027-12-06', '30') === 'A data passa do limite máximo para sair (05/12/2027). Escolha uma data até lá.', 'depois do limite maximo');
    afirmar(await recusa('2027-02-01', '4') === 'Dias de férias: use um número inteiro de 5 a 30.', 'dias');
    const d = desdeMarca(aba);
    afirmar(!d.posts && !d.runs.filter((x) => x !== 'sondarCanal').length, 'as recusas nao vao ao servidor: ' + JSON.stringify(d));
    await f.fill('#fe-dias', '20');
    await f.fill('#fe-obs', 'Combinado com a supervisão');
    j = await jan();
    afirmar(j.vivo === 'Volta em 21/02/2027 · entregar o aviso até 02/01/2027' && !j.alerta, 'ao vivo: ' + j.vivo);
    await f.click('#janela-rodape >> text=Salvar programação');
    await recadoFe(f, 'Férias de PATRÍCIA CONCEIÇÃO ARAÚJO programadas para 01/02/2027 (20 dias).');
    await f.waitForFunction((nome) => { const li = document.querySelector('#qd-fe-corpo .qd-fe-item'); return li && /Programada/.test(li.innerText) && li.querySelector('.qd-fe-nome').innerText.trim() === nome; }, n('emdia'), { timeout: 15000 });
    l = await linhaFe(f, n('emdia'));
    afirmar(l.st === 'Programada para 01/02 · aviso até 02/01' && l.cor === 'azul' && l.bts.join() === 'Reprogramar' && await f.evaluate(() => el('qd-fe-busca').value) === 'Patrícia Conceição',
      'a linha da busca ja programada (a busca fica): ' + JSON.stringify(l));
    afirmar(prog('emdia') && prog('emdia').INICIO === '2027-02-01' && Number(prog('emdia').DIAS) === 20 && prog('emdia').OBSERVACAO === 'Combinado com a supervisão', 'gravou: ' + JSON.stringify(prog('emdia')));
    // o aviso que ja nao cabe e so um alerta: grava
    await buscar(n('pode'));
    await botaoFe(f, n('pode'), 'Programar');
    await f.waitForSelector('#fe-inicio');
    await f.fill('#fe-inicio', '2026-11-01');
    j = await jan();
    await fotoFe(aba, f, 'programar');
    afirmar(j.alerta === 'O aviso de 30 dias já não cabe antes desse início.' && j.vivo === 'Volta em 01/12/2026 · entregar o aviso até 02/10/2026', 'o aviso que nao cabe: ' + JSON.stringify(j));
    await f.click('#janela-rodape >> text=Salvar programação');
    await recadoFe(f, 'Férias de ' + n('pode') + ' programadas para 01/11/2026 (30 dias).');
    // Reprogramar: a janela ja vem com a data e os dias
    await buscar(n('prog'));
    await botaoFe(f, n('prog'), 'Reprogramar');
    await f.waitForSelector('#fe-inicio');
    j = await jan();
    afirmar(j.tit === 'Reprogramar férias — ' + n('prog') && j.v === '2026-12-20' && j.dias === '30', 'reprogramar: ' + JSON.stringify(j));
    await f.fill('#fe-inicio', '2027-01-04');
    await f.click('#janela-rodape >> text=Salvar programação');
    await recadoFe(f, 'Férias de ' + n('prog') + ' reprogramadas para 04/01/2027 (30 dias).');
    await f.waitForFunction((nome) => Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-item')).some((li) => li.querySelector('.qd-fe-nome').innerText.trim() === nome && /04\/01/.test(li.innerText)), n('prog'), { timeout: 15000 });
    afirmar((await linhaFe(f, n('prog'))).st === 'Programada para 04/01 · aviso até 05/12' && banco().filter((x) => Number(x.MATRICULA) === Number(E.casos.prog.matricula)).length === 1,
      'reprogramada na mesma linha');
    // Confirmar saida: fica verde (cumprida) e conta nas cumpridas dos ultimos 60 dias
    await buscar(n('confirme'));
    await botaoFe(f, n('confirme'), 'Confirmar saída');
    await recadoFe(f, 'Saída de férias de ' + n('confirme') + ' confirmada (19/10/2026).');
    await f.waitForFunction((nome) => Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-item')).some((li) => li.querySelector('.qd-fe-nome').innerText.trim() === nome && /Férias cumpridas/.test(li.innerText)), n('confirme'), { timeout: 15000 });
    l = await linhaFe(f, n('confirme'));
    afirmar(l.cor === 'verde' && !l.bts.length && prog('confirme').SITUACAO === 'CUMPRIDA', 'confirmada: ' + JSON.stringify(l));
    await f.fill('#qd-fe-busca', '');
    await f.waitForFunction(() => /3 cumpridas nos últimos 60 dias/.test((document.querySelector('.qd-fe-agora-bt') || {}).innerText || ''), null, { timeout: 5000 });
    afirmar(!(await f.evaluate((nome) => Array.from(document.querySelectorAll('.qd-fe-grupo .qd-fe-nome')).some((x) => x.innerText.trim() === nome), n('confirme'))), 'saiu das Programadas');
    // ficha: Desfazer a confirmacao
    const ficha = async (k) => { await f.evaluate((cod) => qdFicha(qdGeral().find((x) => x.cod === cod).ref), E.casos[k].cod); await f.waitForSelector('#janela:not(.oculto) .qd-fe-ficha'); };
    await ficha('confirme');
    const fc = await f.evaluate(() => document.querySelector('.qd-fe-ficha').innerText.replace(/\s+/g, ' '));
    afirmar(/Saiu 19\/10\/2026 \(segunda-feira\) · 30 dias · volta em 18\/11\/2026 · saída confirmada em 21\/10\/2026/.test(fc) && /Desfazer confirmação$/.test(fc.trim()), 'ficha da cumprida: ' + fc);
    await f.click('.qd-fe-ficha .qd-fe-bt:has-text("Desfazer confirmação")');
    await recadoFe(f, 'Confirmação desfeita: as férias de ' + n('confirme') + ' voltam a programadas para 19/10/2026.');
    await f.waitForFunction((nome) => Array.from(document.querySelectorAll('.qd-fe-grupo .qd-fe-nome')).some((x) => x.innerText.trim() === nome), n('confirme'), { timeout: 15000 });
    afirmar((await linhaFe(f, n('confirme'))).st === 'Saída prevista para 19/10 — confirme', 'voltou para as Programadas');
    // ficha: Cancelar programacao pergunta antes; Voltar volta para a ficha
    await ficha('breve');
    const fb = await f.evaluate(() => document.querySelector('.qd-fe-ficha').innerText.replace(/\s+/g, ' '));
    afirmar(/Programada para 26\/10\/2026 \(segunda-feira\) · 30 dias · volta em 25\/11\/2026/.test(fb) && /Reprogramar Cancelar programação$/.test(fb.trim()), 'ficha da programada: ' + fb);
    await f.click('.qd-fe-ficha .qd-fe-bt:has-text("Cancelar programação")');
    await f.waitForSelector('.qd-fe-pergunta');
    afirmar(await f.evaluate(() => el('janela-titulo').textContent + ' | ' + document.querySelector('.qd-fe-pergunta').innerText.replace(/\s+/g, ' ').trim()) ===
      'Cancelar programação | Cancelar a programação das férias de ' + n('breve') + ' (início em 26/10/2026, 30 dias)? O período volta para “Programar”.', 'a pergunta');
    await f.click('#janela-rodape >> text=Voltar');
    await f.waitForSelector('#janela:not(.oculto) .qd-fe-ficha');
    await f.click('.qd-fe-ficha .qd-fe-bt:has-text("Cancelar programação")');
    await f.waitForSelector('.qd-fe-pergunta');
    await f.click('#janela-rodape >> text=Cancelar programação');
    await recadoFe(f, 'Programação das férias de ' + n('breve') + ' cancelada.');
    await buscar(n('breve'));
    l = await linhaFe(f, n('breve'));
    afirmar(l.st === 'Já pode sair desde 02/08 — sem programação' && l.cor === 'amarelo' && l.bts.join() === 'Programar' && !prog('breve'), 'de volta a programar: ' + JSON.stringify(l));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('ferias (21/10): canal barrado (HTTP 403) — Programar e Confirmar saida gravam pela pagina (1 POST cada, os campos em JSON) e a pagina volta na aba Ferias, com a busca e o recado', async () => {
    const { s, E, aba } = await quadroComFerias({ bloqueio403: true });
    const n = (k) => E.casos[k].nome;
    await entrar(aba, DONO, '4321');
    afirmar(await esperarTela(aba, ['aplicacao', 'falha'], 30000) === 'aplicacao', 'entrou pela reserva');
    let f = await paginaNova(aba, () => CANAL_BARRADO && paginaAtual === 'modulos');
    const pelaPagina = async (gesto, pronta) => { await f.evaluate(() => { window.__paginaVelha = true; }); await gesto(); f = await paginaNova(aba, pronta); };
    await pelaPagina(() => f.evaluate(() => { esquecerTelas(); abrir('quadro'); }), () => paginaAtual === 'quadro' && !!document.querySelector('.qd-cartao'));
    await f.evaluate(() => qdAba('ferias'));
    await f.fill('#qd-fe-busca', 'patricia conceicao');
    await f.waitForFunction(() => document.querySelectorAll('#qd-fe-corpo .qd-fe-item').length === 1, null, { timeout: 5000 });
    await botaoFe(f, n('emdia'), 'Programar');
    await f.waitForSelector('#fe-inicio');
    await f.fill('#fe-inicio', '2027-03-01');
    await f.fill('#fe-dias', '15');
    marcar(aba);
    const naAba = () => paginaAtual === 'quadro' && QD.aba === 'ferias' && !!document.querySelector('#qd-fe-corpo .qd-fe-item');
    await pelaPagina(() => f.click('#janela-rodape >> text=Salvar programação'), naAba);
    let d = desdeMarca(aba);
    const post = aba.s.registro.slice(aba.marca).find((x) => x.tipo === 'doPost'), campos = new URLSearchParams(post.corpo);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length && campos.get('acao') === 'programarFerias' &&
      JSON.stringify(JSON.parse(campos.get('ap'))) === JSON.stringify({ matricula: String(Number(E.casos.emdia.matricula)), nome: n('emdia'), paFim: E.casos.emdia.paFim, limiteMax: E.casos.emdia.limiteMax,
        inicio: '2027-03-01', dias: 15, observacao: '' }), 'gravou pela pagina: ' + JSON.stringify([d, campos.get('acao'), campos.get('ap')]));
    await f.waitForFunction(() => document.getElementById('recado').textContent === 'Férias de PATRÍCIA CONCEIÇÃO ARAÚJO programadas para 01/03/2027 (15 dias).', null, { timeout: 5000 });
    const l = await linhaFe(f, n('emdia'));
    afirmar(l && l.st === 'Programada para 01/03 · aviso até 30/01' && await f.evaluate(() => el('qd-fe-busca').value) === 'patricia conceicao', 'a pagina voltou na aba Ferias, com a busca: ' + JSON.stringify(l));
    const c = s.contexto(DONO); c._porta = true;
    afirmar(c.listar('FERIAS_PROG').some((x) => Number(x.MATRICULA) === Number(E.casos.emdia.matricula) && x.INICIO === '2027-03-01' && Number(x.DIAS) === 15), 'no servidor');
    // Confirmar saida tambem vai pela pagina
    await f.fill('#qd-fe-busca', n('confirmeja').split(' ')[0] + ' ' + n('confirmeja').split(' ').pop());
    await f.waitForFunction((nome) => Array.from(document.querySelectorAll('#qd-fe-corpo .qd-fe-nome')).some((x) => x.innerText.trim() === nome), n('confirmeja'), { timeout: 5000 });
    marcar(aba);
    await pelaPagina(() => botaoFe(f, n('confirmeja'), 'Confirmar saída'), naAba);
    d = desdeMarca(aba);
    afirmar(d.posts === 1 && !d.runs.filter((x) => x !== 'sondarCanal').length, 'confirmou pela pagina: ' + JSON.stringify(d));
    await f.waitForFunction((t) => document.getElementById('recado').textContent === t, 'Saída de férias de ' + n('confirmeja') + ' confirmada (11/10/2026).', { timeout: 5000 });
    afirmar((await linhaFe(f, n('confirmeja'))).st === 'Férias cumpridas', 'cumprida na volta da pagina');
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close(); await s.fechar();
  });

  await cenario('ferias (21/10): celular 390 px — a busca, a lista com os botoes, o calendario, a ficha e a janela Programar sem vazar da tela (claro e escuro, com as cores legiveis); quem so ve o Quadro nao tem botao', async () => {
    const { s, E, aba } = await quadroComFerias({ viewport: { width: 390, height: 844 } });
    const f = await abrirFerias(aba);
    const n = (k) => E.casos[k].nome;
    await f.evaluate(() => { QD.feVista = 'lista'; qdAba('ferias'); });
    await f.waitForSelector('#qd-fe-corpo .qd-fe-grupo');
    await aba.page.waitForTimeout(300);
    const medir = () => f.evaluate(() => {
      const fora = [], larg = window.innerWidth;
      document.querySelectorAll('.qd-fe *, #janela:not(.oculto) *').forEach((x) => {
        const r = x.getBoundingClientRect();
        if (r.width && (r.right > larg + 0.5 || r.left < -0.5) && !x.closest('.qd-fe-mes')) fora.push((x.className || x.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      });
      return { fora: fora.slice(0, 6), rolagem: document.documentElement.scrollWidth - window.innerWidth };
    });
    let m = await medir();
    const bt = await f.evaluate(() => { const b = document.querySelector('#qd-fe-corpo .qd-fe-bt'); const r = b.getBoundingClientRect(), a = b.closest('.qd-fe-item').querySelector('.qd-fe-abre').getBoundingClientRect(); return [Math.round(r.height), r.top >= a.bottom - 1]; });
    afirmar(!m.fora.length && m.rolagem <= 0 && bt[0] >= 40 && bt[1], 'lista no celular (botoes embaixo, 40 px): ' + JSON.stringify([m, bt]));
    await fotoFe(aba, f, 'celular-claro', '.qd-fe');
    await f.fill('#qd-fe-busca', 'patricia conceicao');
    await f.waitForFunction(() => document.querySelectorAll('#qd-fe-corpo .qd-fe-item').length === 1, null, { timeout: 5000 });
    m = await medir();
    afirmar(!m.fora.length && m.rolagem <= 0, 'busca no celular: ' + JSON.stringify(m));
    await botaoFe(f, n('emdia'), 'Programar');
    await f.waitForSelector('#fe-inicio');
    await f.fill('#fe-inicio', '2026-11-01');
    await f.evaluate(() => qdFeVivo());
    m = await medir();
    afirmar(!m.fora.length && m.rolagem <= 0, 'janela Programar no celular: ' + JSON.stringify(m));
    await f.click('#janela-rodape >> text=Voltar');
    await f.fill('#qd-fe-busca', '');
    await f.evaluate((cod) => qdFicha(qdGeral().find((x) => x.cod === cod).ref), E.casos.ja.cod);
    await f.waitForSelector('#janela:not(.oculto) .qd-fe-ficha');
    m = await medir();
    afirmar(!m.fora.length && m.rolagem <= 0, 'ficha no celular: ' + JSON.stringify(m));
    await f.evaluate(() => fecharJanela());
    await f.click('.qd-fe-vista .qd-pill:has-text("Calendário")');
    await f.waitForSelector('.qd-fe-mes .qd-fe-dia-bt');
    m = await medir();
    const pontos = await f.evaluate(() => document.querySelectorAll('.qd-fe-mes .qd-fe-dia-bt .qd-fe-ponto').length);
    afirmar(m.rolagem <= 0 && pontos > 0 && await f.evaluate(() => getComputedStyle(document.querySelector('.qd-fe-pilulas')).display === 'none'), 'calendario no celular (os quadradinhos no lugar das pilulas): ' + JSON.stringify([m, pontos]));
    await f.click('.qd-fe-vista .qd-pill:has-text("Lista")');
    // tema escuro: o texto colorido na cor clara (contraste), a folhinha com a tinta escura
    const cores = () => f.evaluate(() => ['vermelho', 'laranja', 'amarelo', 'azul'].map((c) => { const x = document.querySelector('#qd-fe-corpo .qd-fe-st.qd-fe-' + c); return x ? getComputedStyle(x).color : ''; }).join(' '));
    const claro = await cores();
    await f.evaluate(() => alternarTema());
    await aba.page.waitForTimeout(400);
    const escuro = await cores();
    m = await medir();
    await fotoFe(aba, f, 'celular-escuro', '.qd-fe-grupo');
    afirmar(claro === 'rgb(180, 35, 24) rgb(194, 65, 12) rgb(138, 90, 0) rgb(29, 78, 216)' && escuro === 'rgb(252, 165, 165) rgb(253, 186, 116) rgb(252, 211, 77) rgb(147, 197, 253)' &&
      !m.fora.length && m.rolagem <= 0, 'cores do texto (claro | escuro): ' + claro + ' | ' + escuro + ' ' + JSON.stringify(m));
    afirmar(!aba.erros.length, 'erros: ' + aba.erros.join(' | '));
    await aba.contexto.close();
    // a coordenadora com o Quadro so para ver: a lista, sem nenhum botao de gravar
    const cx = s.contexto(DONO); cx._porta = true;
    const adminCx = { email: DONO, perfil: 'ADMIN', permissoes: cx.permissoesDe('ADMIN') };
    cx.acaoDefinirModuloPessoa(adminCx, { id: cx.listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === COORD).ID, modulo: 'quadro', modo: 'VER' });
    criarPin(s, GERAL, COORD, '1357');
    const pc = await abrirAba(s, GERAL, { relogio: QUARTA_21_10 });
    await entrar(pc, COORD, '1357');
    await esperarTela(pc, ['aplicacao']);
    const g = await frame(pc);
    await g.evaluate(() => abrir('quadro'));
    await g.waitForSelector('.qd-cartao', { timeout: 20000 });
    await g.evaluate(() => { QD.equipe = '*'; qdAba('ferias'); });
    await g.waitForSelector('#qd-fe-corpo .qd-fe-item');
    await g.evaluate((cod) => qdFicha(qdGeral().find((x) => x.cod === cod).ref), E.casos.confirme.cod);
    await g.waitForSelector('#janela:not(.oculto) .qd-fe-ficha');
    afirmar(await g.evaluate(() => !document.querySelector('.qd-fe-bt') && !/Parâmetros/.test(document.querySelector('.qd-fe-rodape').innerText) &&
      /Saída prevista para 19\/10 — confirme/.test(document.querySelector('.qd-fe-ficha').innerText)), 'quem so ve: a situacao, sem botao');
    afirmar(!pc.erros.length, 'erros: ' + pc.erros.join(' | '));
    await pc.contexto.close(); await s.fechar();
  });

  await navegador.close();
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' cenarios ok');
  process.exit(falhas.length ? 1 : 0);
}

rodar().catch((e) => { console.error(e); process.exit(2); });
