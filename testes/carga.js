#!/usr/bin/env node
/*
 * SITUACAO DE CARGA — o leitor do PDF e o servidor.
 *
 *   node testes/carga.js [pasta-do-GSL]
 *
 * 1. LEITOR: o PDF de verdade (testes/fixtures/situacao-carga-real.pdf, emitido em 25/11/2026 08:48:58,
 *    conferido linha a linha com o pdftotext em situacao-carga-real.esperado.txt) e PDFs no estilo do
 *    Stimulsoft gerados aqui pelo Chromium (page.pdf) a partir de uma tabela HTML: duas paginas com o
 *    cabecalho repetido, cargas de 24 horas (com "*", com a faixa amarela, com as duas), cargas agrupadas,
 *    sem veiculo, nome quebrado em duas linhas, nomes alinhados a esquerda, um deposito novo no relatorio.
 *    O bloco do leitor e o primeiro <script> do Carga.html, rodado aqui fora do navegador, com o mesmo
 *    pdf.js da versao online (ferramentas/vendor). Tambem o texto colado (pdftotext) da o mesmo resultado.
 * 2. SERVIDOR (emulador): instalacao e migracao (tabelas, paleteiras e carrinhos padrao, painel),
 *    envios (ordem, repetido, futuro, grande, desfazer), indicadores (ritmo, previsao, paradas),
 *    equilibrio entre depositos, equipe (um lugar por pessoa, andares do Nobre), pool de paleteiras,
 *    carrinhos, quantidades, permissoes e a geracao do ao vivo (tamanho e tempo da pergunta).
 */
'use strict';
process.env.TZ = 'America/Bahia';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { Mundo, novaExecucao, chamarPeloNavegador } = require('./emulador/gas.js');
const { blocosDe } = require('../ferramentas/montar-local.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const VENDOR = path.join(__dirname, '..', 'ferramentas', 'vendor', 'pdfjs-3.11.174');
const REAL = path.join(__dirname, 'fixtures', 'situacao-carga-real.pdf');
const OP = { apagarComentarios: 'nenhum' };
const DONO = 'dono@bartofil.com.br';
const GERENTE = 'joao.lima@bartofil.com.br';
const COORD = 'maria.souza@bartofil.com.br';
const CONSULTA = 'carla.dias@bartofil.com.br';
const AGORA = '2026-11-25T18:00:00-03:00';
const resultados = [];
function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }
async function caso(nome, fn) {
  try { await fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + String(e.message).split('\n').join('\n        ')); }
}

/* ------------------------------------------------------------------ */
/* O LEITOR (primeiro <script> do Carga.html)                          */
/* ------------------------------------------------------------------ */
globalThis.pdfjsWorker = require(path.join(VENDOR, 'pdf.worker.min.js'));
const pdfjs = require(path.join(VENDOR, 'pdf.min.js'));
const blocoLeitor = blocosDe(fs.readFileSync(path.join(PASTA, 'Carga.html'), 'utf8'), 'Carga').filter((b) => b.tipo === 'script')[0].conteudo;
const LEITOR = vm.createContext({ console });
vm.runInContext(blocoLeitor + '\n;globalThis.API = { cgLerSituacao, cgPaginasDoPdf, cgLerTexto, cgIdDeposito, cgCelulaTexto };', LEITOR);
const L = LEITOR.API;
async function lerPdf(arquivo) {
  const data = new Uint8Array(fs.readFileSync(arquivo));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  return L.cgLerSituacao(await L.cgPaginasDoPdf(doc, pdfjs));
}
const linhaDe = (c, deps) => [c.nro, c.h24 ? '*' : '', c.nome, c.veiculo, c.box].concat(deps.map((d) => c.d[d.id].join(' '))).join(' | ');

/* PDF no estilo do relatorio (Chromium). cargas: [{ nro, nome, veiculo, box, h24, amarelo, cel: [['X','X'], ...] }] */
function htmlRelatorio(cargas, opcoes) {
  opcoes = opcoes || {};
  const deps = opcoes.depositos || ['GRANDEZA', 'MIUDEZA', 'BLOCADO', 'PESAVEIS', 'NOBRE', 'NOBRE GRANDEZA'];
  const al = opcoes.nomeEsquerda ? 'left' : 'center';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 8mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; margin: 0; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: .5pt solid #999; padding: 1.5pt 2pt; text-align: center; height: 12pt; }
    thead th { font-weight: bold; }
    .t1 th { border: 0; font-size: 14pt; height: auto; } .t2 th { border: 0; font-size: 12pt; height: auto; }
    .leg th { border: 0; text-align: right; font-size: 11pt; } .leg span { background: #ff0; padding: 1pt 4pt; }
    td.nome { text-align: ${al}; overflow-wrap: anywhere; } td.box { color: #f00; } td.conf { background: #e7e6e6; }
    tr.amarelo td { background: #ff0; }
    tr { page-break-inside: avoid; }
  </style></head><body><table>
    <colgroup><col style="width:6%"><col style="width:2%"><col style="width:${opcoes.nomeLargura || 22}%"><col style="width:8%"><col style="width:4%">${deps.map(() => '<col><col>').join('')}</colgroup>
    <thead>
      <tr class="t1"><th colspan="${5 + deps.length * 2}">SITUAÇÃO DE EXPEDIÇÃO DAS CARGAS EM PROCESSO</th></tr>
      <tr class="t2"><th colspan="${5 + deps.length * 2}">${esc(opcoes.emissao || '24/11/2026 14:05:37')}</th></tr>
      <tr class="leg"><th colspan="${5 + deps.length * 2}"><span>* cargas 24 horas</span></th></tr>
      <tr><th rowspan="2">NRO</th><th rowspan="2"></th><th rowspan="2">NOME CARGA</th><th rowspan="2">VEICULO</th><th rowspan="2">BOX</th>${deps.map((d) => `<th colspan="2">${d}</th>`).join('')}</tr>
      <tr>${deps.map(() => '<th>SEP</th><th>CONF</th>').join('')}</tr>
    </thead><tbody>
    ${cargas.map((c) => `<tr class="${c.amarelo ? 'amarelo' : ''}"><td>${c.nro}</td><td>${c.h24 ? '*' : ''}</td><td class="nome">${esc(c.nome)}</td><td>${esc(c.veiculo)}</td><td class="box">${c.box}</td>${c.cel.map((p) => `<td>${p[0]}</td><td class="conf">${p[1]}</td>`).join('')}</tr>`).join('')}
    </tbody></table></body></html>`;
}
function cargasSinteticas(n, nDeps) {
  const veics = ['BI-TRUCK', 'MEDIO - DEP', 'VUC 2700', 'TOCO - DEP', 'MEDIO', ''];
  const valores = ['X', '-', '0/5', '4/9', '42/45', '2/3', '0/47', '1/2'];
  const lista = [];
  for (let i = 0; i < n; i++) {
    const grupo = i % 9 === 4;
    const cel = [];
    for (let d = 0; d < (nDeps || 6); d++) {
      const v = valores[(i * 3 + d * 5) % valores.length];
      cel.push(v === 'X' ? ['X', 'X'] : (v === '-' ? ['-', '-'] : [v, v.replace(/^\d+/, '0')]));
    }
    lista.push({
      nro: String(762480 + i * 7),
      nome: grupo ? [0, 1, 2, 3].map((k) => 762700 + i * 4 + k).join('/') : ['TIM-B-XX-JOSELANDIA-(VAN)-OO-INV-OOO', 'BA3-X-XX-EUCLIDES DA CUNHA-OO-OOO-OOO', 'BAX-X-XX-VALENCA-OO-OOO-PRI-FC', 'FPS-C-XX-TRANCOSO-OO-INV-OOO'][i % 4],
      veiculo: grupo ? '' : veics[i % veics.length], box: String(1 + (i * 5) % 24),
      h24: i % 11 === 3 || i % 13 === 7, amarelo: i % 11 === 3 || i % 17 === 9, cel: cel
    });
  }
  return lista;
}
async function gerarPdf(navegador, html, arquivo) {
  const pagina = await navegador.newPage();
  await pagina.setContent(html, { waitUntil: 'load' });
  await pagina.pdf({ path: arquivo, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  await pagina.close();
}
function conferirSinteticas(r, esperadas, deps, rotulo) {
  afirmar(r.cargas.length === esperadas.length, rotulo + ': ' + r.cargas.length + ' cargas (esperava ' + esperadas.length + '); problemas ' + JSON.stringify(r.problemas.slice(0, 3)));
  esperadas.forEach((e, i) => {
    const c = r.cargas[i];
    const veio = [c.nro, c.nome, c.veiculo, c.box, c.h24].concat(deps.map((d) => c.d[d].join(' '))).join(' | ');
    const quer = [e.nro, e.nome, e.veiculo, e.box, !!(e.h24 || e.amarelo)].concat(e.cel.map((p) => p.join(' '))).join(' | ');
    afirmar(veio === quer, rotulo + ' linha ' + (i + 1) + ':\n  veio ' + veio + '\n  quer ' + quer);
  });
}

/* ------------------------------------------------------------------ */
/* SERVIDOR (emulador)                                                 */
/* ------------------------------------------------------------------ */
function ctx(m, conta) { const c = novaExecucao(m, PASTA, { contaGoogle: conta || DONO }, OP); c._porta = true; return c; }
function chamar(m, conta, fn, ...args) { return chamarPeloNavegador(m, PASTA, { contaGoogle: conta }, fn, args, OP); }
function codigoDoEmail(m, email) {
  const x = m.emails.filter((e) => e.to === email && /código de primeiro acesso/i.test(e.subject)).pop();
  return x ? (x.subject.match(/(\d{6})\s*$/) || [])[1] : '';
}
function entrar(m, email, pin) {
  let r = JSON.parse(chamar(m, email, 'entrar', email, pin, '', '', '').valor);
  if (r.pedirCodigo) r = JSON.parse(chamar(m, email, 'entrar', email, pin, pin, '', codigoDoEmail(m, email)).valor);
  else if (r.criarPin) r = JSON.parse(chamar(m, email, 'entrar', email, pin, pin, '', '').valor);
  if (!r.token) throw new Error('entrar ' + email + ': ' + JSON.stringify(r).slice(0, 300));
  return { t: r.token, f: r.filial.codigo, email };
}
function mundo() {
  const m = new Mundo({ dono: DONO, agora: AGORA });
  ctx(m).instalar(DONO);
  const c = ctx(m);
  const admin = { email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') };
  c.acaoSalvarUsuario(admin, { email: GERENTE, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' });
  ctx(m).acaoSalvarUsuario(admin, { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
  ctx(m).acaoSalvarUsuario(admin, { email: CONSULTA, nome: 'Carla Dias', perfil: 'CONSULTA', turno: '', filiais: '*', papel: 'Consulta' });
  return m;
}
function tela(m, s) {
  const r = chamar(m, s.email, 'carregarTela', { t: s.t, f: s.f }, 'carga', {});
  if (!r.ok) throw new Error('tela: ' + r.erro.message);
  return JSON.parse(r.valor).dados;
}
function acao(m, s, nome, params) {
  const r = chamar(m, s.email, 'executarAcao', { t: s.t, f: s.f }, nome, params || {});
  if (!r.ok) throw new Error(nome + ': ' + r.erro.message);
  const x = JSON.parse(r.valor);
  if (x && x.ok === false) throw new Error(x.erro);
  return x;
}
function erroDe(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
function planilhaAntiga(m, nome, abas) {
  const p = m.novaPlanilha(nome);
  const Aba = Object.getPrototypeOf(p.abas[0]).constructor;
  Object.keys(abas).forEach((nomeAba, i) => {
    const aba = i === 0 ? p.abas[0] : new Aba(p, nomeAba, 1000, 26);
    if (i === 0) aba.nome = nomeAba; else p.abas.push(aba);
    abas[nomeAba].forEach((linha, l) => { if (linha) aba.dados[l] = linha.slice(); });
  });
  return 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit';
}
function ligarQuadro(m, s) {
  const { abas } = require('./dados-quadro.js')(m.DataDoScript, new Date(Date.parse(AGORA)));
  acao(m, s, 'salvarFonteQuadro', { link: planilhaAntiga(m, 'BI Quadro CD Feira', abas) });
}
const DEPS = ['GRANDEZA', 'MIUDEZA', 'BLOCADO', 'PESAVEIS', 'NOBRE', 'NOBRE_GRANDEZA'];
/* Envio a partir de uma lista curta: { nro: { GRANDEZA: ['0/10','0/10'], ... } } — os depositos que faltam ficam "-". */
function envio(emitidoEm, cargas, extra) {
  return Object.assign({ emitidoEm, arquivo: 'teste.pdf', paginas: 1, depositos: DEPS.map((id) => ({ id })),
    cargas: Object.keys(cargas).map((nro) => {
      const d = {};
      DEPS.forEach((id) => { d[id] = (cargas[nro].d || cargas[nro])[id] || ['-', '-']; });
      return { nro, nome: cargas[nro].nome || 'CARGA ' + nro, veiculo: 'MEDIO', box: '3', h24: !!cargas[nro].h24, d };
    }) }, extra || {});
}

async function rodar() {
  console.log('Situação de Carga em ' + PASTA + '\n');
  console.log('Leitor do PDF:');

  let real = null;
  await caso('PDF real (25/11 08:48:58): 47 cargas, cada célula, a carga de 24 horas (* e faixa amarela) e a emissão — igual ao conferido com o pdftotext', async () => {
    real = await lerPdf(REAL);
    afirmar(real.emitidoEm === '2026-11-25T08:48:58', 'emissao ' + real.emitidoEm);
    afirmar(/SITUAÇÃO DE EXPEDIÇÃO/.test(real.titulo) && real.paginas === 2, 'titulo/paginas ' + real.titulo + ' ' + real.paginas);
    afirmar(real.depositos.map((d) => d.id).join() === DEPS.join(), 'depositos ' + JSON.stringify(real.depositos));
    afirmar(!real.problemas.length && !real.avisos.length, 'problemas ' + JSON.stringify(real.problemas) + ' avisos ' + JSON.stringify(real.avisos));
    const esperado = fs.readFileSync(path.join(__dirname, 'fixtures', 'situacao-carga-real.esperado.txt'), 'utf8').split('\n').filter((l) => l && l[0] !== '#');
    const veio = real.cargas.map((c) => linhaDe(c, real.depositos));
    afirmar(veio.length === 47 && esperado.length === 47, 'linhas ' + veio.length + '/' + esperado.length);
    esperado.forEach((l, i) => afirmar(veio[i] === l, 'linha ' + (i + 1) + ':\n  veio ' + veio[i] + '\n  quer ' + l));
    const h24 = real.cargas.filter((c) => c.h24);
    afirmar(h24.length === 1 && h24[0].nro === '763304' && h24[0].estrela && h24[0].amarelo, '24 h ' + JSON.stringify(h24.map((c) => [c.nro, c.estrela, c.amarelo])));
    const g = real.cargas.find((c) => c.nro === '762882');
    afirmar(g.nome === '762787/762788/762789/762790' && g.veiculo === '' && g.box === '1', 'carga agrupada sem veiculo ' + JSON.stringify(g));
  });

  await caso('texto colado (pdftotext -layout do mesmo PDF) dá as mesmas 47 cargas', async () => {
    let texto = '';
    try { texto = require('child_process').execSync('pdftotext -layout "' + REAL + '" -', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
    catch (e) { console.log('        (sem o pdftotext nesta maquina: usei o esperado)'); return; }
    const t = L.cgLerTexto(texto);
    afirmar(t.emitidoEm === '2026-11-25T08:48:58' && !t.problemas.length, 'texto: ' + t.emitidoEm + ' ' + JSON.stringify(t.problemas.slice(0, 2)));
    const a = t.cargas.map((c) => linhaDe(c, t.depositos)), b = real.cargas.map((c) => linhaDe(c, real.depositos));
    afirmar(a.length === 47, 'linhas ' + a.length);
    a.forEach((l, i) => afirmar(l === b[i], 'linha ' + (i + 1) + ': texto ' + l + ' / pdf ' + b[i]));
  });

  await caso('células: X, -, a/b com espaços; o resto (texto, a > b, b = 0) fica sem leitura', async () => {
    const c = L.cgCelulaTexto;
    afirmar(c('X') === 'X' && c('x') === 'X' && c('-') === '-' && c('–') === '-' && c('4 / 9') === '4/9' && c('42/45') === '42/45', 'validas');
    afirmar(c('') === '' && c('abc') === '' && c('5/3') === '' && c('0/0') === '', 'invalidas');
    afirmar(L.cgIdDeposito('NOBRE GRANDEZA') === 'NOBRE_GRANDEZA' && L.cgIdDeposito('PESÁVEIS') === 'PESAVEIS' && L.cgIdDeposito('Frios') === 'FRIOS', 'nomes');
  });

  let pw = null;
  try { pw = require('playwright'); } catch (e) { try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (x) { pw = null; } }
  if (!pw) console.log('  (sem o Playwright: PDFs sintéticos pulados)');
  else {
    const nav = await pw.chromium.launch();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-carga-'));
    try {
      await caso('PDF sintético de 2 páginas (Chromium): cabeçalho repetido, * e faixa amarela, agrupadas, sem veículo, frações', async () => {
        const cargas = cargasSinteticas(58);
        const arq = path.join(dir, 'sintetico.pdf');
        await gerarPdf(nav, htmlRelatorio(cargas), arq);
        const r = await lerPdf(arq);
        afirmar(r.paginas >= 2, 'paginas ' + r.paginas);
        afirmar(r.emitidoEm === '2026-11-24T14:05:37', 'emissao ' + r.emitidoEm);
        conferirSinteticas(r, cargas, DEPS, 'sintetico');
        const soAmarelo = cargas.filter((c) => c.amarelo && !c.h24).map((c) => c.nro);
        afirmar(soAmarelo.length && soAmarelo.every((n) => r.cargas.find((c) => c.nro === n).amarelo), 'a faixa amarela sozinha marca 24 h: ' + soAmarelo);
      });
      await caso('nome comprido quebrado em duas linhas e nomes alinhados à esquerda continuam inteiros', async () => {
        const cargas = cargasSinteticas(12);
        cargas[2].nome = 'BA3-X-XX-EUCLIDES DA CUNHA-OO-OOO-OOO-ROTA-MUITO-LONGA-QUE-QUEBRA-NA-CELULA';
        cargas[5].nome = '763240/763241/763242/763243/763244/763245/763246/763247/763248';
        const arq = path.join(dir, 'quebra.pdf');
        await gerarPdf(nav, htmlRelatorio(cargas, { nomeEsquerda: true, nomeLargura: 14 }), arq);
        const r = await lerPdf(arq);
        conferirSinteticas(r, cargas, DEPS, 'quebra');
      });
      await caso('relatório com um depósito novo (FRIOS) e a emissão sem segundos: lê os 7 depósitos', async () => {
        const deps = ['GRANDEZA', 'MIUDEZA', 'BLOCADO', 'PESAVEIS', 'NOBRE', 'NOBRE GRANDEZA', 'FRIOS'];
        const cargas = cargasSinteticas(9, 7);
        const arq = path.join(dir, 'frios.pdf');
        await gerarPdf(nav, htmlRelatorio(cargas, { depositos: deps, emissao: '24/11/2026 15:40' }), arq);
        const r = await lerPdf(arq);
        afirmar(r.depositos.map((d) => d.id).join() === DEPS.concat('FRIOS').join(), 'depositos ' + JSON.stringify(r.depositos));
        afirmar(r.emitidoEm === '2026-11-24T15:40:00', 'emissao ' + r.emitidoEm);
        conferirSinteticas(r, cargas, DEPS.concat('FRIOS'), 'frios');
      });
      await caso('PDF que não é a situação de carga: nenhuma carga e o motivo', async () => {
        const arq = path.join(dir, 'outro.pdf');
        const p = await nav.newPage();
        await p.setContent('<h1>Relatório de vendas</h1><p>Total 25/11/2026</p>');
        await p.pdf({ path: arq }); await p.close();
        const r = await lerPdf(arq);
        afirmar(!r.cargas.length && r.problemas.some((x) => /SEP e CONF/.test(x.motivo)), JSON.stringify(r).slice(0, 300));
      });
      // Um exemplo do PDF sintetico fica em testes/fixtures (so e gravado se ainda nao existe).
      const exemplo = path.join(__dirname, 'fixtures', 'situacao-carga-sintetica.pdf');
      if (!fs.existsSync(exemplo) && fs.existsSync(path.join(dir, 'sintetico.pdf'))) fs.copyFileSync(path.join(dir, 'sintetico.pdf'), exemplo);
    } finally {
      await nav.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('\nServidor:');
  await caso('instalação: tabelas, painel ligado, 12 paleteiras no pool do CD e 35 carrinhos na Miudeza, limites do equilíbrio', () => {
    const m = mundo(); const s = entrar(m, DONO, '4321');
    const d = tela(m, s);
    const pal = d.equipamentos.filter((e) => e.tipo === 'PALETEIRA'), car = d.equipamentos.filter((e) => e.tipo === 'CARRINHO');
    afirmar(pal.length === 12 && pal.every((e) => e.estado === 'LIVRE' && e.dep === '' && e.id), 'paleteiras ' + JSON.stringify(pal.slice(0, 2)));
    afirmar(car.length === 35 && car.every((e) => e.estado === 'LIVRE' && e.dep === 'MIUDEZA' && e.id), 'carrinhos ' + car.length);
    afirmar(ctx(m).listar('CARGA_EQUIPAMENTOS').length === 47, 'gravados na planilha');
    afirmar(d.podeEditar && !d.snapshot && d.depositos.length === 6 && d.andares.length === 5, 'tela vazia');
    const par = ctx(m).listar('PARAMETROS').map((p) => p.CHAVE);
    afirmar(['CARGA_EQUILIBRIO_PP', 'CARGA_ATENCAO_PP', 'CARGA_PESO_24H'].every((k) => par.indexOf(k) !== -1), 'parametros');
    const ger = entrar(m, GERENTE, '5555');
    afirmar(tela(m, ger).podeEditar, 'gerente edita');
    const con = entrar(m, CONSULTA, '7777');
    afirmar(!tela(m, con).podeEditar, 'consulta so ve');
  });

  await caso('migração 8.13 → 8.14: cria as tabelas, semeia os equipamentos e liga o painel na principal (uma vez)', () => {
    const m = mundo();
    const c = ctx(m);
    const banco = m.planilhas.get(c.prop('ID_BANCO', ''));
    ['CARGA_SNAPSHOTS', 'CARGA_EQUIPE', 'CARGA_EQUIPAMENTOS'].forEach((t) => { banco.abas = banco.abas.filter((a) => a.nome !== t); });
    const f = c.listar('FILIAIS').find((x) => x.PRINCIPAL === 'SIM');
    const paineis = JSON.parse(f.PAINEIS); delete paineis.carga;
    c.atualizar('FILIAIS', f.ID, { PAINEIS: JSON.stringify(paineis) }, 'teste');
    m.props.script.VERSAO_ESQUEMA = '8.13';
    m.cache.clear();
    const s = entrar(m, DONO, '4321');
    const d = tela(m, s);
    afirmar(d.equipamentos.filter((e) => e.tipo === 'PALETEIRA' && e.id).length === 12 && d.equipamentos.filter((e) => e.tipo === 'CARRINHO' && e.id).length === 35, 'semeados');
    afirmar(JSON.parse(ctx(m).listar('FILIAIS').find((x) => x.PRINCIPAL === 'SIM').PAINEIS).carga === 'ATIVO', 'painel ligado');
    afirmar(m.props.script.VERSAO_ESQUEMA === '8.14', 'versao ' + m.props.script.VERSAO_ESQUEMA);
  });

  await caso('envio do PDF real: 47 cargas, resumo por depósito igual à conta direta das células, 24 h pendente e o "-" fora das contas', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    const r = acao(m, s, 'enviarSituacaoCarga', { emitidoEm: real.emitidoEm, arquivo: 'situacao.pdf', paginas: 2, depositos: real.depositos,
      cargas: real.cargas.map((c) => ({ nro: c.nro, nome: c.nome, veiculo: c.veiculo, box: c.box, h24: c.h24, d: c.d })) });
    afirmar(/Situação de 25\/11\/2026 08:48 salva: 47 cargas, 1 de 24 horas por terminar/.test(r.recado), r.recado);
    const d = tela(m, s);
    afirmar(d.snapshot.cargas.length === 47 && d.snapshot.emitido === '2026-11-25T08:48:58' && d.snapshot.por === 'João Lima', 'snapshot');
    DEPS.forEach((id) => {
      let cargas = 0, prontas = 0, restSep = 0, restConf = 0;
      real.cargas.forEach((c) => {
        const [a, b] = c.d[id];
        if (a === '-' && b === '-') return;
        cargas++;
        const resto = (v) => { const m2 = /^(\d+)\/(\d+)$/.exec(v); return m2 ? +m2[2] - +m2[1] : 0; };
        restSep += resto(a); restConf += resto(b);
        if ((a === 'X' || a === '-' || resto(a) === 0) && (b === 'X' || b === '-' || resto(b) === 0)) prontas++;
      });
      const x = d.snapshot.resumo.dep[id];
      afirmar(x.cargas === cargas && x.concluidas === prontas && x.restSep === restSep && x.restConf === restConf,
        id + ': ' + JSON.stringify(x) + ' esperava ' + JSON.stringify({ cargas, prontas, restSep, restConf }));
    });
    afirmar(d.snapshot.resumo.dep.PESAVEIS.cargas === 4 && d.snapshot.resumo.h24 === 1 && d.snapshot.resumo.h24Pend === 1, 'pesaveis/24h');
    const nobre = d.indicadores.porDep.NOBRE;
    afirmar(nobre.ritmoSep === null && nobre.etaMin === null && d.historico.length === 1, 'sem ritmo no 1o envio ' + JSON.stringify(nobre).slice(0, 200));
  });

  await caso('envio recusado: mais velho que o último, o mesmo de novo, no futuro, sem cargas; o mesmo conteúdo com hora nova entra', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    const base = { '762480': { GRANDEZA: ['0/5', '0/5'] } };
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', base));
    const e1 = erroDe(() => acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', base)));
    afirmar(/emitida em 25\/11\/2026 08:00, antes da mais recente do GSL \(25\/11\/2026 09:00, enviada por João Lima\)/.test(e1), e1);
    const e2 = erroDe(() => acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', { '762999': { GRANDEZA: ['X', 'X'] } })));
    afirmar(/já foi enviada por João Lima/.test(e2), e2);
    const e3 = erroDe(() => acao(m, s, 'enviarSituacaoCarga', envio('2026-11-26T09:00:00', base)));
    afirmar(/no futuro/.test(e3), e3);
    const e4 = erroDe(() => acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T10:00:00', {})));
    afirmar(/Nenhuma carga/.test(e4), e4);
    const e5 = erroDe(() => acao(m, s, 'enviarSituacaoCarga', Object.assign(envio('2026-11-25T10:00:00', base), { emitidoEm: '' })));
    afirmar(/Falta a data e a hora de emissão/.test(e5), e5);
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:30:00', base));
    afirmar(tela(m, s).historico.length === 2, 'mesmo conteudo, hora nova');
    // conferencia do servidor: numero invalido e celula invalida
    const r = acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T10:00:00', { '12': { GRANDEZA: ['0/3', '0/3'] }, '762481': { GRANDEZA: ['X', 'X'] } }));
    afirmar(/1 linha\(s\) ficaram de fora/.test(r.recado), r.recado);
  });

  await caso('ritmo, previsão e paradas entre envios; a equipe gravada em cada envio dá o ritmo por pessoa', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    ligarQuadro(m, s);
    const pessoas = tela(m, s).pessoas;
    afirmar(pessoas.length > 100 && pessoas.every((p) => p.k && p.nome), 'pessoas do Quadro: ' + pessoas.length);
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', { '900001': { GRANDEZA: ['0/10', '0/10'] }, '900002': { MIUDEZA: ['0/4', '0/4'] } }));
    pessoas.slice(0, 2).forEach((p) => acao(m, s, 'moverPessoaCarga', { pessoa: p, destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } }));
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', { '900001': { GRANDEZA: ['6/10', '2/10'] }, '900002': { MIUDEZA: ['0/4', '0/4'] } }));
    let d = tela(m, s);
    let g = d.indicadores.porDep.GRANDEZA;
    afirmar(g.ritmoSep === 6 && g.ritmoConf === 2 && g.porPessoaSep === 3 && g.porPessoaConf === null && g.etaMin === 240 && g.etaSepMin === 40, 'grandeza ' + JSON.stringify(g));
    afirmar(d.snapshot.resumo.equipe.GRANDEZA.sep === 2 && d.snapshot.resumo.desde.horas === 1, 'equipe e horas no resumo');
    afirmar(d.indicadores.porDep.MIUDEZA.paradas[0].parada === 60 && d.indicadores.porDep.MIUDEZA.paradas[0].fila === 60, 'miudeza parada ' + JSON.stringify(d.indicadores.porDep.MIUDEZA.paradas));
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T10:00:00', { '900001': { GRANDEZA: ['6/10', '2/10'] }, '900003': { GRANDEZA: ['X', 'X'] } }));
    d = tela(m, s);
    g = d.indicadores.porDep.GRANDEZA;
    afirmar(g.ritmoSep === 3 && g.paradas[0].n === '900001' && g.paradas[0].parada === 60 && g.paradas[0].fila === 120, 'parada ' + JSON.stringify(g));
    const c = d.snapshot.cargas.find((x) => x.n === '900001');
    afirmar(c.tb.GRANDEZA === 10 && c.um.GRANDEZA < c.pv + 61 && d.historico.length === 3, 'acompanhamento ' + JSON.stringify(c));
    // a noite (mais de 4 h entre envios) nao entra no ritmo
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T16:00:00', { '900001': { GRANDEZA: ['10/10', '10/10'] } }));
    g = tela(m, s).indicadores.porDep.GRANDEZA;
    afirmar(g.ritmoSep === null && g.etaMin === 0, 'depois de 6 h: ' + JSON.stringify(g).slice(0, 160));
  });

  await caso('equilíbrio: Desequilibrado com o atrasado, o adiantado e "Mover 3 separadores de Grandeza → Pesáveis"; carga travada; limites editáveis', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    ligarQuadro(m, s);
    const pessoas = tela(m, s).pessoas;
    pessoas.slice(0, 4).forEach((p) => acao(m, s, 'moverPessoaCarga', { pessoa: p, destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } }));
    acao(m, s, 'moverPessoaCarga', { pessoa: pessoas[4], destino: { dep: 'PESAVEIS', papel: 'SEPARADOR' } });
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', {
      '900001': { GRANDEZA: ['8/10', '8/10'], PESAVEIS: ['1/10', '1/10'] },
      '900002': { GRANDEZA: ['X', 'X'], PESAVEIS: ['0/10', '0/10'] },
      '900003': { NOBRE: ['X', 'X'], MIUDEZA: ['X', 'X'] } }));
    let e = tela(m, s).indicadores.equilibrio;
    afirmar(e.porDep.GRANDEZA.pct === 90 && e.porDep.PESAVEIS.pct === 5 && e.porDep.BLOCADO.pct === null, 'pct ' + JSON.stringify(e.porDep));
    const sup = e.supervisao;
    afirmar(sup.status === 'desequilibrado' && sup.spread === 85 && sup.atrasado === 'PESAVEIS' && sup.adiantado === 'GRANDEZA' && sup.deps.join() === 'GRANDEZA,PESAVEIS',
      'supervisao ' + JSON.stringify(sup));
    afirmar(sup.sugestao && sup.sugestao.texto === 'Mover 3 separadores de Grandeza → Pesáveis' && sup.sugestao.n === 3, 'sugestao ' + JSON.stringify(sup.sugestao));
    afirmar(e.cd.status === 'desequilibrado' && e.cd.deps.length === 4 && e.cd.atrasado === 'PESAVEIS', 'cd ' + JSON.stringify(e.cd).slice(0, 200));
    afirmar(e.cargas.length === 1 && e.cargas[0].n === '900002' && e.cargas[0].prontos.join() === 'GRANDEZA' && e.cargas[0].atrasados[0].dep === 'PESAVEIS', 'travadas ' + JSON.stringify(e.cargas));
    acao(m, s, 'salvarParametro', { chave: 'CARGA_EQUILIBRIO_PP', valor: '90' });
    acao(m, s, 'salvarParametro', { chave: 'CARGA_ATENCAO_PP', valor: '95' });
    e = tela(m, s).indicadores.equilibrio;
    afirmar(e.supervisao.status === 'equilibrado' && !e.supervisao.sugestao && e.limites.equilibrado === 90, 'limite editado ' + JSON.stringify(e.supervisao).slice(0, 160));
    // a carga de 24 horas pesa o dobro no % do deposito
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', { '900001': { h24: true, d: { GRANDEZA: ['0/10', '0/10'] } }, '900002': { GRANDEZA: ['10/10', '10/10'] } }));
    e = tela(m, s).indicadores.equilibrio;
    afirmar(Math.abs(e.porDep.GRANDEZA.pct - 33.3) < 0.01, 'peso 24 h: ' + e.porDep.GRANDEZA.pct);
  });

  await caso('equipe: uma pessoa num lugar só; andares do Nobre; volta para disponíveis; recusas; limpar alocação do turno', () => {
    const m = mundo(); const s = entrar(m, COORD, '1234');
    ligarQuadro(m, entrar(m, DONO, '4321'));
    const p = tela(m, s).pessoas;
    let r = acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } });
    afirmar(r.equipe.length === 1 && r.equipe[0].dep === 'GRANDEZA' && r.g, 'grandeza');
    r = acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 3 } });
    afirmar(r.equipe.length === 1 && r.equipe[0].dep === 'NOBRE' && r.equipe[0].andar === 3, 'nobre 3o andar ' + JSON.stringify(r.equipe));
    afirmar(/andar do flowrack/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'NOBRE', papel: 'SEPARADOR' } }))), 'nobre sem andar');
    afirmar(/andar do flowrack/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 5 } }))), 'andar 5');
    afirmar(/Depósito desconhecido/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'FRIOS', papel: 'SEPARADOR' } }))), 'deposito');
    afirmar(/separador ou conferente/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'GRANDEZA', papel: 'CHEFE' } }))), 'papel');
    afirmar(/Pessoa inválida/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: { k: '<x>', nome: 'x' }, destino: null }))), 'chave');
    r = acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'NOBRE', papel: 'CONFERENTE', andar: 2 } });
    afirmar(r.equipe.find((x) => x.k === p[1].k).andar === -1, 'conferente do Nobre sem andar');
    r = acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: null });
    afirmar(r.equipe.length === 1 && !r.equipe.some((x) => x.k === p[0].k), 'voltou');
    // linha repetida (planilha mexida a mao) vira uma so na proxima mudanca
    const c = ctx(m);
    c.inserir('CARGA_EQUIPE', { PESSOA: p[1].k, NOME: p[1].nome, DEPOSITO: 'GRANDEZA', PAPEL: 'SEPARADOR' }, 'teste');
    r = acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'BLOCADO', papel: 'CONFERENTE' } });
    afirmar(r.equipe.filter((x) => x.k === p[1].k).length === 1 && r.equipe[0].dep === 'BLOCADO', 'uma linha so ' + JSON.stringify(r.equipe));
    const t1 = p.filter((x) => x.equipe === '1° TURNO').slice(0, 3), t2 = p.filter((x) => x.equipe === '2° TURNO').slice(0, 2);
    t1.concat(t2).forEach((x) => acao(m, s, 'moverPessoaCarga', { pessoa: x, destino: { dep: 'MIUDEZA', papel: 'SEPARADOR' } }));
    r = acao(m, s, 'limparAlocacaoCarga', { equipe: '1° TURNO' });
    afirmar(/3 pessoas voltaram/.test(r.recado) && r.equipe.every((x) => x.equipe !== '1° TURNO'), 'limpar 1o turno ' + r.recado);
    r = acao(m, s, 'limparAlocacaoCarga', {});
    afirmar(!r.equipe.length, 'limpar tudo');
  });

  await caso('paleteiras (pool do CD): pegar a livre de número mais baixo, em uso num dos quatro, manutenção, devolver; quantidade 14 → 10', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    let r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', estado: 'USO', dep: 'PESAVEIS' });
    afirmar(/Paleteira 1: em uso em Pesáveis/.test(r.recado), r.recado);
    r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 5, estado: 'USO', dep: 'NOBRE_GRANDEZA' });
    r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', estado: 'USO', dep: 'GRANDEZA' });
    afirmar(r.equipamentos.find((e) => e.tipo === 'PALETEIRA' && e.numero === 2).dep === 'GRANDEZA', 'pegou a 2');
    afirmar(/Grandeza, Nobre Grandeza, Pesáveis ou Blocado/.test(erroDe(() => acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 3, estado: 'USO', dep: 'MIUDEZA' }))), 'miudeza nao usa paleteira');
    r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 5, estado: 'MANUTENCAO', dep: 'NOBRE_GRANDEZA', obs: 'roda' });
    const p5 = r.equipamentos.find((e) => e.tipo === 'PALETEIRA' && e.numero === 5);
    afirmar(p5.estado === 'MANUTENCAO' && p5.dep === '' && p5.obs === 'roda', 'manutencao ' + JSON.stringify(p5));
    r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 1, estado: 'LIVRE' });
    afirmar(/livre no pool/.test(r.recado), r.recado);
    r = acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'PALETEIRA', quantidade: 14 });
    afirmar(r.equipamentos.filter((e) => e.tipo === 'PALETEIRA').length === 14 && /14 paleteiras no CD/.test(r.recado), 'quantidade 14');
    r = acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'PALETEIRA', quantidade: 10 });
    afirmar(r.equipamentos.filter((e) => e.tipo === 'PALETEIRA').length === 10 && r.equipamentos.filter((e) => e.tipo === 'CARRINHO').length === 35, 'quantidade 10');
    for (let i = 0; i < 8; i++) acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', estado: 'USO', dep: 'BLOCADO' });
    afirmar(/Nenhuma paleteira livre/.test(erroDe(() => acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', estado: 'USO', dep: 'BLOCADO' }))), 'pool vazio');
    afirmar(/de 0 a 60/.test(erroDe(() => acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'PALETEIRA', quantidade: 61 }))), 'limite 60');
    // carrinhos: ciclo e quantidade
    r = acao(m, s, 'equipamentoCarga', { tipo: 'CARRINHO', numero: 35, estado: 'USO' });
    afirmar(r.equipamentos.find((e) => e.tipo === 'CARRINHO' && e.numero === 35).estado === 'USO', 'carrinho em uso');
    r = acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'CARRINHO', quantidade: 30 });
    afirmar(r.equipamentos.filter((e) => e.tipo === 'CARRINHO').length === 30, 'carrinhos 30');
    r = acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'CARRINHO', quantidade: 0 });
    afirmar(!r.equipamentos.some((e) => e.tipo === 'CARRINHO'), 'carrinhos 0 ' + r.equipamentos.filter((e) => e.tipo === 'CARRINHO').length);
    afirmar(!tela(m, s).equipamentos.some((e) => e.tipo === 'CARRINHO'), 'zero continua zero (nao volta para o padrao)');
  });

  await caso('permissões: consulta vê e pergunta a geração, mas não grava; "Ver" na matriz tira a gravação do gerente', () => {
    const m = mundo();
    const con = entrar(m, CONSULTA, '7777');
    afirmar(acao(m, con, 'geracaoCarga', {}).g, 'geracao para quem ve');
    ['enviarSituacaoCarga', 'moverPessoaCarga', 'equipamentoCarga', 'quantidadeEquipamentoCarga', 'limparAlocacaoCarga', 'excluirSituacaoCarga'].forEach((n) => {
      afirmar(/só para ver/.test(erroDe(() => acao(m, con, n, {}))), n + ' recusado');
    });
    const adm = entrar(m, DONO, '4321');
    const reg = ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === GERENTE);
    acao(m, adm, 'definirAjustePessoa', { id: reg.ID, tela: 'carga', nivel: 'VER' });
    const ger = entrar(m, GERENTE, '5555');
    afirmar(!tela(m, ger).podeEditar && erroDe(() => acao(m, ger, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 1, estado: 'USO', dep: 'GRANDEZA' })), 'gerente em Ver');
    acao(m, adm, 'definirAjustePessoa', { id: reg.ID, tela: 'carga', nivel: 'OCULTO' });
    afirmar(/não inclui a tela "Situação de Carga"/.test(erroDe(() => acao(m, ger, 'geracaoCarga', {}))), 'sem acesso ao menu (Oculto)');
    // painel desativado na filial
    acao(m, adm, 'alterarPainel', { codigo: adm.f, painel: 'carga', estado: 'DESATIVADO' });
    afirmar(/não está ligado/.test(erroDe(() => acao(m, con, 'geracaoCarga', {}))), 'painel desativado');
  });

  await caso('ao vivo: a geração muda a cada gravação (e só nas tabelas da carga); a pergunta é pequena', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    const g0 = acao(m, s, 'geracaoCarga', {}).g;
    acao(m, s, 'enviarFeedback', { tipo: 'SUGESTAO', texto: 'teste', tela: 'carga' });
    afirmar(acao(m, s, 'geracaoCarga', {}).g === g0, 'outra tabela nao mexe');
    const r = acao(m, s, 'equipamentoCarga', { tipo: 'CARRINHO', numero: 1, estado: 'USO' });
    const g1 = acao(m, s, 'geracaoCarga', {}).g;
    afirmar(g1 !== g0 && r.g === g1 && tela(m, s).g === g1, 'mudou: ' + g0 + ' -> ' + g1 + ' (acao ' + r.g + ')');
    const ini = Date.now();
    const n = 20;
    let bytesIda = 0, bytesVolta = 0;
    for (let i = 0; i < n; i++) {
      const pedido = JSON.stringify({ api: 1, fn: 'executarAcao', args: [{ t: s.t, f: s.f }, 'geracaoCarga', {}] });
      const x = chamar(m, s.email, 'executarAcao', { t: s.t, f: s.f }, 'geracaoCarga', {});
      bytesIda += pedido.length; bytesVolta += JSON.stringify({ ok: true, valor: x.valor, build: '2026.10.21' }).length;
    }
    const ms = (Date.now() - ini) / n;
    console.log('        geracaoCarga no emulador: ~' + Math.round(bytesIda / n) + ' bytes de ida, ~' + Math.round(bytesVolta / n) + ' de volta, ' + ms.toFixed(1) + ' ms por pergunta');
    afirmar(bytesVolta / n < 200, 'resposta pequena');
  });

  await caso('envio grande (mais de 45 mil caracteres) continua nas colunas seguintes e volta inteiro; desfazer só o último', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    const muitas = {};
    for (let i = 0; i < 300; i++) muitas[String(800000 + i)] = { nome: 'ROTA-' + i + '-XX-CIDADE-COM-NOME-COMPRIDO-OO-INV-OOO', d: { GRANDEZA: ['3/9', '1/9'], NOBRE: ['0/47', '0/47'], MIUDEZA: ['X', 'X'] } };
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', muitas));
    const linha = ctx(m).listar('CARGA_SNAPSHOTS')[0];
    afirmar(String(linha.CARGAS).length === 45000 && String(linha.CARGAS_2).length > 0, 'quebrou em colunas: ' + String(linha.CARGAS).length + ' + ' + String(linha.CARGAS_2).length);
    let d = tela(m, s);
    afirmar(d.snapshot.cargas.length === 300 && d.snapshot.resumo.dep.NOBRE.restSep === 300 * 47, 'voltou inteiro');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', { '762999': { GRANDEZA: ['X', 'X'] } }));
    const primeiro = d.snapshot.id;
    afirmar(/Só dá para desfazer o envio mais recente/.test(erroDe(() => acao(m, s, 'excluirSituacaoCarga', { id: primeiro }))), 'so o ultimo');
    d = tela(m, s);
    acao(m, s, 'excluirSituacaoCarga', { id: d.snapshot.id });
    d = tela(m, s);
    afirmar(d.snapshot.id === primeiro && d.snapshot.cargas.length === 300 && d.historico.length === 1, 'o anterior voltou');
  });

  await caso('envios antigos: as cargas dos mais velhos vão para o Drive e a tela de cada um continua lendo', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    for (let h = 8; h < 16; h++) acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T' + String(h).padStart(2, '0') + ':00:00', { '900001': { GRANDEZA: [(h - 8) + '/10', '0/10'] } }));
    const linhas = ctx(m).listar('CARGA_SNAPSHOTS');
    const noDrive = linhas.filter((l) => /^DRIVE:/.test(String(l.CARGAS)));
    afirmar(noDrive.length === 2 && linhas.length === 8, 'no drive ' + noDrive.length);
    const c = ctx(m);
    afirmar(c.cgCargasDe_(noDrive[0])[0].n === '900001', 'le do Drive');
    afirmar(tela(m, s).historico.length === 8, 'historico inteiro');
  });

  const falhas = resultados.filter((x) => !x).length;
  console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
  process.exit(falhas ? 1 : 0);
}
rodar().catch((e) => { console.error(e); process.exit(2); });
