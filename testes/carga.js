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
      return { nro, nome: cargas[nro].nome || 'CARGA ' + nro, veiculo: cargas[nro].veiculo != null ? cargas[nro].veiculo : 'MEDIO', box: cargas[nro].box || '9', h24: !!cargas[nro].h24, d };
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
  await caso('instalação: tabelas, painel ligado, 12 paleteiras no pool do CD, 35 carrinhos e 8 check-outs na Miudeza, 10 check-outs no Nobre, limites do equilíbrio', () => {
    const m = mundo(); const s = entrar(m, DONO, '4321');
    const d = tela(m, s);
    const pal = d.equipamentos.filter((e) => e.tipo === 'PALETEIRA'), car = d.equipamentos.filter((e) => e.tipo === 'CARRINHO');
    afirmar(pal.length === 12 && pal.every((e) => e.estado === 'LIVRE' && e.dep === '' && e.id), 'paleteiras ' + JSON.stringify(pal.slice(0, 2)));
    afirmar(car.length === 35 && car.every((e) => e.estado === 'LIVRE' && e.dep === 'MIUDEZA' && e.id), 'carrinhos ' + car.length);
    const chk = d.equipamentos.filter((e) => e.tipo === 'CHECKOUT');
    afirmar(chk.length === 18 && chk.every((e) => e.estado === 'LIVRE' && e.id) && chk.filter((e) => e.dep === 'MIUDEZA').length === 8 && chk.filter((e) => e.dep === 'NOBRE').length === 10, 'check-outs ' + chk.length);
    afirmar(ctx(m).listar('CARGA_EQUIPAMENTOS').length === 65, 'gravados na planilha');
    afirmar(d.turnos.map((t) => t.texto).join(' ') === '06:50–16:14 16:04–01:01 23:00–07:00' && d.turnoAgora.ativos.join() === 'B', 'turnos ' + JSON.stringify(d.turnoAgora));
    afirmar(d.sequencia && !d.sequencia.usada && !d.sequencia.itens.length && d.patio && d.patio.n === 26 && d.patio.contagem.livres === 26, 'fase 2 vazia');
    afirmar(d.flowrack.ruas.join() === '6,6,6,6,6' && Array.isArray(d.faltas) && Array.isArray(d.envios), 'flowrack/faltas');
    ['CARGA_SEQUENCIA', 'CARGA_PRESENCA', 'CARGA_PASSAGEM'].forEach((t) => afirmar(Array.isArray(ctx(m).listar(t)), 'tabela ' + t));
    afirmar(d.podeEditar && !d.snapshot && d.depositos.length === 6 && d.andares.length === 5, 'tela vazia');
    const par = ctx(m).listar('PARAMETROS').map((p) => p.CHAVE);
    afirmar(['CARGA_EQUILIBRIO_PP', 'CARGA_ATENCAO_PP', 'CARGA_PESO_24H', 'CARGA_TURNO_A', 'CARGA_TURNO_B', 'CARGA_TURNO_C', 'CARGA_BOX_PERMANENCIA_MIN', 'CARGA_SITUACOES_BOX',
      'CARGA_BOXES', 'CARGA_FLOWRACK_RUAS', 'CARGA_SEQ_EM_CURSO'].every((k) => par.indexOf(k) !== -1), 'parametros');
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
    afirmar(m.props.script.VERSAO_ESQUEMA === '8.16', 'versao ' + m.props.script.VERSAO_ESQUEMA);
  });

  await caso('migração 8.14 → 8.15: tabelas novas e a coluna RUA, paleteira "em uso" volta para o pool (a manutenção fica), check-outs semeados, parâmetros novos', () => {
    const m = mundo();
    const c = ctx(m);
    const banco = m.planilhas.get(c.prop('ID_BANCO', ''));
    ['CARGA_SEQUENCIA', 'CARGA_PRESENCA', 'CARGA_PASSAGEM', 'CARGA_BOXES', 'CARGA_CARREGAMENTO'].forEach((t) => { banco.abas = banco.abas.filter((a) => a.nome !== t); });
    // banco da 8.14: sem a coluna RUA, sem check-outs, paleteiras marcadas em uso a mao
    const eq = banco.abas.find((a) => a.nome === 'CARGA_EQUIPE');
    const iRua = eq.dados[0].indexOf('RUA');
    eq.dados.forEach((l) => { if (l) l.splice(iRua, 1); });
    const abaEq = banco.abas.find((a) => a.nome === 'CARGA_EQUIPAMENTOS');
    const cab = abaEq.dados[0];
    abaEq.dados = abaEq.dados.filter((l, i) => !i || (l && l[cab.indexOf('TIPO')] !== 'CHECKOUT'));
    m.cache.clear();
    const linhas = ctx(m).listar('CARGA_EQUIPAMENTOS').filter((r) => r.TIPO === 'PALETEIRA');
    ctx(m).atualizar('CARGA_EQUIPAMENTOS', linhas[0].ID, { ESTADO: 'USO', DEPOSITO: 'GRANDEZA' }, 'teste');
    ctx(m).atualizar('CARGA_EQUIPAMENTOS', linhas[1].ID, { ESTADO: 'USO', DEPOSITO: 'BLOCADO' }, 'teste');
    ctx(m).atualizar('CARGA_EQUIPAMENTOS', linhas[2].ID, { ESTADO: 'MANUTENCAO', DEPOSITO: '', OBSERVACAO: 'roda' }, 'teste');
    const par = banco.abas.find((a) => a.nome === 'PARAMETROS');
    const iChave = par.dados[0].indexOf('CHAVE');
    par.dados = par.dados.filter((l, i) => !i || !(l && /^CARGA_(TURNO|BOX|SITUACOES|FLOWRACK|SEQ)/.test(String(l[iChave]))));
    m.props.script.VERSAO_ESQUEMA = '8.14';
    m.cache.clear();
    const s = entrar(m, DONO, '4321');
    const d = tela(m, s);
    afirmar(m.props.script.VERSAO_ESQUEMA === '8.16', 'versao ' + m.props.script.VERSAO_ESQUEMA);
    const pal = ctx(m).listar('CARGA_EQUIPAMENTOS').filter((r) => r.TIPO === 'PALETEIRA');
    afirmar(!pal.some((r) => r.ESTADO === 'USO') && pal.filter((r) => r.ESTADO === 'MANUTENCAO').length === 1 && pal.find((r) => r.ESTADO === 'MANUTENCAO').OBSERVACAO === 'roda', 'paleteiras ' + JSON.stringify(pal.map((r) => r.ESTADO)));
    afirmar(ctx(m).listar('CARGA_EQUIPAMENTOS').filter((r) => r.TIPO === 'CHECKOUT').length === 18, 'check-outs semeados');
    afirmar(banco.abas.find((a) => a.nome === 'CARGA_EQUIPE').dados[0].indexOf('RUA') !== -1, 'coluna RUA');
    ['CARGA_SEQUENCIA', 'CARGA_PRESENCA', 'CARGA_PASSAGEM', 'CARGA_BOXES', 'CARGA_CARREGAMENTO'].forEach((t) => afirmar(banco.abas.some((a) => a.nome === t), 'tabela ' + t));
    afirmar(ctx(m).parametro('CARGA_TURNO_B', '') === '16:04-01:01' && ctx(m).parametro('CARGA_BOXES', '') === '26', 'parametros');
    afirmar(d.equipamentos.filter((e) => e.tipo === 'CHECKOUT').length === 18 && d.equipamentos.filter((e) => e.tipo === 'PALETEIRA' && e.estado === 'MANUTENCAO').length === 1, 'tela');
    // abrir de novo nao migra outra vez (nada duplica)
    m.cache.clear();
    tela(m, entrar(m, DONO, '4321'));
    afirmar(ctx(m).listar('CARGA_EQUIPAMENTOS').length === 65, 'nada duplicou: ' + ctx(m).listar('CARGA_EQUIPAMENTOS').length);
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

  await caso('edição em lote (27/11): várias pessoas e uma falta num Salvar só — uma geração, a mudada por outra pessoa no meio volta como falha, o resto é feito', () => {
    const m = mundo(); const s = entrar(m, COORD, '1234'); const g = entrar(m, GERENTE, '5555');
    ligarQuadro(m, entrar(m, DONO, '4321'));
    const t0 = tela(m, s), p = t0.pessoas;
    // o gerente ja tinha posto p[3] na Miudeza; a coordenadora abriu a tela antes (de: disponivel)
    acao(m, g, 'moverPessoaCarga', { pessoa: p[3], destino: { dep: 'MIUDEZA', papel: 'CONFERENTE' } });
    const g0 = tela(m, s).g;
    const ops = [
      { tipo: 'mover', pessoa: p[0], destino: { dep: 'GRANDEZA', papel: 'SEPARADOR', andar: '', rua: '' }, de: null },
      { tipo: 'mover', pessoa: p[1], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 2, rua: 3 }, de: null },
      { tipo: 'mover', pessoa: p[2], destino: { dep: 'PESAVEIS', papel: 'CONFERENTE', andar: '', rua: '' }, de: null },
      { tipo: 'mover', pessoa: p[3], destino: { dep: 'BLOCADO', papel: 'SEPARADOR', andar: '', rua: '' }, de: null },     // mudada por outro
      { tipo: 'falta', pessoa: p[4], falta: true, de: false },
      { tipo: 'mover', pessoa: p[5], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 9, rua: '' }, de: null }       // andar que nao existe
    ];
    const r = acao(m, s, 'edicaoEquipeCarga', { ops });
    afirmar(r.feitas === 4 && r.falhas.length === 2, 'feitas/falhas: ' + JSON.stringify([r.feitas, r.falhas]));
    afirmar(/outra pessoa mudou .* enquanto você editava \(agora em Miudeza · conferente\)/.test(r.falhas[0].motivo) && r.falhas[0].k === p[3].k, 'conflito: ' + r.falhas[0].motivo);
    afirmar(/andar do flowrack/.test(r.falhas[1].motivo), 'andar: ' + r.falhas[1].motivo);
    const lugar = (k) => r.equipe.find((x) => x.k === k);
    afirmar(lugar(p[0].k).dep === 'GRANDEZA' && lugar(p[1].k).andar === 2 && lugar(p[1].k).rua === 3 && lugar(p[2].k).papel === 'CONFERENTE' &&
      lugar(p[3].k).dep === 'MIUDEZA' && !lugar(p[4].k), 'equipe: ' + JSON.stringify(r.equipe.map((x) => [x.nome, x.dep, x.papel, x.andar])));
    afirmar(r.faltas.some((f) => f.k === p[4].k) && r.g && r.g !== g0, 'falta gravada e a geracao subiu');
    // as outras telas veem na proxima pergunta (a geracao mudou uma vez so)
    const vista = tela(m, g);
    afirmar(vista.g === r.g && vista.equipe.length === 4, 'a outra tela: ' + vista.equipe.length);
    // de volta: tirar dois e desfazer a falta, conferindo o lugar de agora
    const r2 = acao(m, s, 'edicaoEquipeCarga', { ops: [
      { tipo: 'mover', pessoa: p[0], destino: null, de: { dep: 'GRANDEZA', papel: 'SEPARADOR', andar: -1, rua: 0 } },
      { tipo: 'mover', pessoa: p[1], destino: null, de: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 2, rua: 3 } },
      { tipo: 'falta', pessoa: p[4], falta: false, de: true }] });
    afirmar(r2.feitas === 3 && !r2.falhas.length && r2.equipe.length === 2 && !r2.faltas.some((f) => f.k === p[4].k && f.ativa), 'volta: ' + JSON.stringify(r2.falhas));
    // falta marcada por outra pessoa no meio: mover quem faltou nao passa
    acao(m, g, 'presencaCarga', { pessoa: p[6], falta: true });
    const r3 = acao(m, s, 'edicaoEquipeCarga', { ops: [{ tipo: 'mover', pessoa: p[6], destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' }, de: null }] });
    afirmar(r3.feitas === 0 && /falta/.test(r3.falhas[0].motivo), 'falta no meio: ' + JSON.stringify(r3.falhas));
    // recusas
    afirmar(/Nenhuma alteração/.test(erroDe(() => acao(m, s, 'edicaoEquipeCarga', { ops: [] }))), 'vazio');
    afirmar(/só para ver/.test(erroDe(() => acao(m, entrar(m, CONSULTA, '7777'), 'edicaoEquipeCarga', { ops }))), 'quem so ve nao salva');
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

  await caso('paleteiras e check-outs acompanham as pessoas: cada separador (G·NG·P·B) usa uma paleteira, cada conferente da Miudeza ou do Nobre um check-out do depósito; manutenção à mão; "faltam N"', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    ligarQuadro(m, s);
    const p = tela(m, s).pessoas;
    const mover = (x, dep, papel, andar) => acao(m, s, 'moverPessoaCarga', { pessoa: x, destino: { dep, papel, andar } });
    const consumo = () => { const c = ctx(m); return c.cgConsumoEquip_(c.cgEquipe_(), c.cgEquipamentos_()); };
    // o "em uso" a mao nao existe mais
    afirmar(/entra em uso sozinha/.test(erroDe(() => acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 1, estado: 'USO', dep: 'GRANDEZA' }))), 'paleteira USO recusado');
    afirmar(/entra em uso sozinho/.test(erroDe(() => acao(m, s, 'equipamentoCarga', { tipo: 'CHECKOUT', dep: 'NOBRE', numero: 1, estado: 'USO' }))), 'checkout USO recusado');
    afirmar(/só na Miudeza ou no Nobre/.test(erroDe(() => acao(m, s, 'equipamentoCarga', { tipo: 'CHECKOUT', dep: 'GRANDEZA', numero: 1, estado: 'MANUTENCAO' }))), 'checkout so na Miudeza e no Nobre');
    [0, 1, 2].forEach((i) => { mover(p[i], 'GRANDEZA', 'SEPARADOR'); m.desvioRelogio += 1000; });
    mover(p[3], 'MIUDEZA', 'SEPARADOR'); mover(p[4], 'NOBRE', 'SEPARADOR', 2);       // Miudeza e Nobre nao usam paleteira
    mover(p[5], 'NOBRE', 'CONFERENTE'); mover(p[6], 'GRANDEZA', 'CONFERENTE');
    let c = consumo();
    afirmar(c.PALETEIRA.pessoas === 3 && c.PALETEIRA.emUso === 3 && c.PALETEIRA.livres === 9 && !c.PALETEIRA.falta && c.PALETEIRA.porDep.GRANDEZA.com === 3, 'paleteiras ' + JSON.stringify(c.PALETEIRA));
    afirmar(c.CHECKOUT_NOBRE.pessoas === 1 && c.CHECKOUT_NOBRE.livres === 9 && c.CHECKOUT_NOBRE.porDep.NOBRE.com === 1 && c.CHECKOUT_MIUDEZA.pessoas === 0 && c.CHECKOUT_MIUDEZA.livres === 8,
      'check-outs (o conferente da Grandeza nao usa) ' + JSON.stringify([c.CHECKOUT_NOBRE, c.CHECKOUT_MIUDEZA]));
    // pool menor e uma em manutencao: os dois separadores que chegaram por ultimo (Blocado) ficam sem
    acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'PALETEIRA', quantidade: 4 });
    let r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 2, estado: 'MANUTENCAO', obs: 'roda solta' });
    afirmar(/Paleteira 2: em manutenção/.test(r.recado), r.recado);
    m.desvioRelogio += 1000; mover(p[7], 'BLOCADO', 'SEPARADOR'); m.desvioRelogio += 1000; mover(p[8], 'BLOCADO', 'SEPARADOR');
    c = consumo();
    afirmar(c.PALETEIRA.total === 4 && c.PALETEIRA.manutencao === 1 && c.PALETEIRA.disponiveis === 3 && c.PALETEIRA.falta === 2 && c.PALETEIRA.livres === 0, 'falta ' + JSON.stringify(c.PALETEIRA));
    afirmar(c.PALETEIRA.porDep.BLOCADO.sem === 2 && c.PALETEIRA.porDep.GRANDEZA.sem === 0 && c.PALETEIRA.sem.join() === [p[7].k, p[8].k].join(), 'quem ficou sem ' + JSON.stringify(c.PALETEIRA.porDep));
    // mover de novo para o mesmo deposito e papel nao muda o "desde" (a paleteira continua com a pessoa)
    const desde = ctx(m).cgEquipe_().find((x) => x.k === p[4].k).desde;
    m.desvioRelogio += 60000; mover(p[4], 'NOBRE', 'SEPARADOR', 3);
    afirmar(ctx(m).cgEquipe_().find((x) => x.k === p[4].k).desde === desde, 'desde mantido');
    // a manutencao volta: funcionando
    r = acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 2, estado: 'LIVRE' });
    afirmar(/funcionando/.test(r.recado) && consumo().PALETEIRA.falta === 1, 'voltou: ' + r.recado);
    // check-outs: quantidade e manutencao
    mover(p[9], 'MIUDEZA', 'CONFERENTE'); m.desvioRelogio += 1000; mover(p[10], 'MIUDEZA', 'CONFERENTE');
    r = acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'CHECKOUT', dep: 'MIUDEZA', quantidade: 1 });
    afirmar(/1 check-out na Miudeza/.test(r.recado), r.recado);
    r = acao(m, s, 'equipamentoCarga', { tipo: 'CHECKOUT', dep: 'NOBRE', numero: 10, estado: 'MANUTENCAO', obs: 'leitor' });
    afirmar(/Check-out 10 do Nobre: em manutenção/.test(r.recado), r.recado);
    c = consumo();
    afirmar(c.CHECKOUT_MIUDEZA.falta === 1 && c.CHECKOUT_MIUDEZA.sem.join() === p[10].k && c.CHECKOUT_NOBRE.falta === 0 && c.CHECKOUT_NOBRE.manutencao === 1 && c.CHECKOUT_NOBRE.total === 10,
      'check-out falta ' + JSON.stringify([c.CHECKOUT_MIUDEZA, c.CHECKOUT_NOBRE]));
    afirmar(r.equipamentos.filter((e) => e.tipo === 'CHECKOUT' && e.dep === 'MIUDEZA').length === 1 && r.equipamentos.filter((e) => e.tipo === 'CHECKOUT' && e.dep === 'NOBRE').length === 10, 'quantidades por deposito');
    afirmar(/de 0 a 60/.test(erroDe(() => acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'PALETEIRA', quantidade: 61 }))), 'limite 60');
    afirmar(/não existe/.test(erroDe(() => acao(m, s, 'equipamentoCarga', { tipo: 'PALETEIRA', numero: 9, estado: 'MANUTENCAO' }))), 'numero fora');
    // carrinhos: continuam a mao (ciclo e quantidade)
    r = acao(m, s, 'equipamentoCarga', { tipo: 'CARRINHO', numero: 35, estado: 'USO' });
    afirmar(r.equipamentos.find((e) => e.tipo === 'CARRINHO' && e.numero === 35).estado === 'USO', 'carrinho em uso');
    r = acao(m, s, 'quantidadeEquipamentoCarga', { tipo: 'CARRINHO', quantidade: 0 });
    afirmar(!r.equipamentos.some((e) => e.tipo === 'CARRINHO') && !tela(m, s).equipamentos.some((e) => e.tipo === 'CARRINHO'), 'carrinhos 0 (nao volta para o padrao)');
  });

  await caso('permissões: consulta vê e pergunta a geração, mas não grava; "Ver" na matriz tira a gravação do gerente', () => {
    const m = mundo();
    const con = entrar(m, CONSULTA, '7777');
    afirmar(acao(m, con, 'geracaoCarga', {}).g, 'geracao para quem ve');
    afirmar(tela(m, con).patio.mapa.length === 26 && /não existe mais/.test(erroDe(() => acao(m, con, 'snapshotCarga', { id: 'x' }))), 'leituras para quem ve');
    ['enviarSituacaoCarga', 'moverPessoaCarga', 'equipamentoCarga', 'quantidadeEquipamentoCarga', 'limparAlocacaoCarga', 'excluirSituacaoCarga',
      'sequenciaCarga', 'presencaCarga', 'passagemCarga', 'carregamentoCarga', 'boxCarga', 'importarBoxesCarga', 'parametrosCarga'].forEach((n) => {
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

  console.log('\nFase 2 (8.15):');

  await caso('turnos pelo horário: A, B e C (B e C passam da meia-noite), sobreposição = passagem, o dia do turno e o turno do Quadro (1° = A, ADM, 4° fora)', () => {
    const m = mundo(); const c = ctx(m);
    const t = c.cgTurnos_();
    const h = (hh, mm) => c.cgTurnosNoHorario_(t, hh * 60 + mm);
    const casos = [[10, 0, 'A', null], [16, 10, 'A,B', 'A>B'], [16, 14, 'B', null], [20, 0, 'B', null], [23, 30, 'B,C', 'B>C'], [0, 30, 'B,C', 'B>C'],
      [1, 1, 'C', null], [3, 0, 'C', null], [6, 55, 'A,C', 'C>A'], [7, 0, 'A', null], [6, 49, 'C', null]];
    casos.forEach(([hh, mm, ativos, pass]) => {
      const r = h(hh, mm);
      afirmar(r.ativos.slice().sort().join() === ativos && (r.passagem ? r.passagem.sai + '>' + r.passagem.entra : null) === pass, hh + ':' + mm + ' ' + JSON.stringify(r));
    });
    afirmar(c.cgDiaDoTurno_('C', '2026-11-26T02:00:00', t) === '2026-11-25' && c.cgDiaDoTurno_('C', '2026-11-26T15:00:00', t) === '2026-11-26', 'dia do C');
    afirmar(c.cgDiaDoTurno_('B', '2026-11-26T00:30:00', t) === '2026-11-25' && c.cgDiaDoTurno_('A', '2026-11-26T00:30:00', t) === '2026-11-26' && c.cgDiaDoTurno_('', '2026-12-01T00:30:00', t) === '2026-12-01', 'dia do B/A');
    afirmar(c.cgDiaDoTurno_('C', '2026-12-01T03:00:00', t) === '2026-11-30' && c.cgDiaDoTurno_('C', '2027-01-01T03:00:00', t) === '2026-12-31', 'virada de mes e ano');
    const eq = { '1° TURNO': 'A', '1º TURNO': 'A', '2° TURNO': 'B', 'TURNO 3': 'C', '3': 'C', 'TB': 'B', 'ADM': 'ADM', 'ADMINISTRATIVO': 'ADM', '4° TURNO': '', '': '' };
    Object.keys(eq).forEach((k) => afirmar(c.cgTurnoDaEquipe_(k) === eq[k], k + ' -> ' + c.cgTurnoDaEquipe_(k)));
    afirmar(JSON.stringify(c.cgHorarioTurno_('6h50 às 16h14')) === JSON.stringify({ ini: 410, fim: 974 }) && !c.cgHorarioTurno_('25:00-01:00') && !c.cgHorarioTurno_('08:00-08:00'), 'leitura do horario');
    // editar na tela (quem edita): o horario novo vale
    const s = entrar(m, GERENTE, '5555');
    acao(m, s, 'parametrosCarga', { turnos: { A: '07:00 - 15:20', B: '15:10-23:40', C: '23:30-07:10' } });
    const d = tela(m, s);
    afirmar(d.turnos.map((x) => x.texto).join(' ') === '07:00–15:20 15:10–23:40 23:30–07:10' && d.turnos[1].cruza === false && d.turnos[2].cruza === true, 'editado ' + JSON.stringify(d.turnos));
    afirmar(/Turno B: escreva o horário/.test(erroDe(() => acao(m, s, 'parametrosCarga', { turnos: { B: 'de tarde' } }))), 'horario invalido');
    afirmar(/Nada para salvar/.test(erroDe(() => acao(m, s, 'parametrosCarga', {}))), 'vazio');
  });

  await caso('faltou: chip vermelho (sai da alocação, não pode ser alocado), vale até o fim do turno da pessoa (o C passa da meia-noite), desfazer, ao vivo e no LOG', () => {
    const m = mundo(); let s = entrar(m, COORD, '1234');
    ligarQuadro(m, entrar(m, DONO, '4321'));
    const p = tela(m, s).pessoas;
    const a = p.find((x) => x.equipe === '1° TURNO'), cT = p.find((x) => x.equipe === '3° TURNO');
    acao(m, s, 'moverPessoaCarga', { pessoa: a, destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } });
    const g0 = acao(m, s, 'geracaoCarga', {}).g;
    let r = acao(m, s, 'presencaCarga', { pessoa: a, falta: true });
    afirmar(/marcado como falta e tirado da alocação/.test(r.recado) && !r.equipe.some((x) => x.k === a.k) && r.faltas.length === 1 && r.faltas[0].k === a.k, 'marcou ' + r.recado);
    afirmar(r.g !== g0 && acao(m, s, 'geracaoCarga', {}).g === r.g, 'geracao mudou');
    afirmar(r.faltas[0].porNome === 'Maria Souza' && r.faltas[0].data === '2026-11-25' && r.faltas[0].turno === 'A', 'quem e quando ' + JSON.stringify(r.faltas[0]));
    afirmar(/marcado como falta neste turno \(por Maria Souza\)/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: a, destino: { dep: 'MIUDEZA', papel: 'SEPARADOR' } }))), 'nao aloca');
    r = acao(m, s, 'presencaCarga', { pessoa: a, falta: true });
    afirmar(ctx(m).listar('CARGA_PRESENCA').length === 1, 'marcar de novo nao duplica');
    ctx(m).descarregarLog();
    afirmar(ctx(m).listar('LOG').some((l) => l.TABELA === 'CARGA_PRESENCA' && l.QUEM === COORD), 'no LOG');
    afirmar(tela(m, s).faltas.length === 1 && tela(m, s).faltas[0].ativa, 'na tela');
    // desfazer
    r = acao(m, s, 'presencaCarga', { pessoa: a, falta: false });
    afirmar(/Falta de .* desfeita/.test(r.recado) && !r.faltas.length, 'desfez');
    acao(m, s, 'moverPessoaCarga', { pessoa: a, destino: { dep: 'MIUDEZA', papel: 'SEPARADOR' } });
    // o turno C: marcada as 23:30 de 25/11 continua as 02:00 de 26/11 e some no C seguinte (23:30 de 26/11)
    m.desvioRelogio = Date.parse('2026-11-25T23:30:00-03:00') - Date.now(); s = entrar(m, COORD, '1234');
    acao(m, s, 'presencaCarga', { pessoa: cT, falta: true });
    acao(m, s, 'presencaCarga', { pessoa: a, falta: true });
    const valendo = () => { const c = ctx(m); return c.cgFaltas_(c.cgTurnos_(), c.cgAgoraIso_()); };
    m.desvioRelogio = Date.parse('2026-11-26T02:00:00-03:00') - Date.now(); s = entrar(m, COORD, '1234');
    afirmar(tela(m, s).faltas.filter((x) => x.ativa).length === 1, 'a tela leva as de ontem e hoje, com "ativa"');
    let f = valendo().map((x) => x.k);
    afirmar(f.indexOf(cT.k) !== -1 && f.indexOf(a.k) === -1, 'as 02:00 do dia seguinte: o C continua, o A (do dia 25) ja nao ' + JSON.stringify(f));
    m.desvioRelogio = Date.parse('2026-11-26T23:30:00-03:00') - Date.now(); s = entrar(m, COORD, '1234');
    f = valendo();
    afirmar(!f.length, 'no turno seguinte zerou ' + JSON.stringify(f));
    acao(m, s, 'moverPessoaCarga', { pessoa: cT, destino: { dep: 'BLOCADO', papel: 'CONFERENTE' } });
    afirmar(/Pessoa inválida/.test(erroDe(() => acao(m, s, 'presencaCarga', { pessoa: { k: '<x>', nome: 'x' }, falta: true }))), 'chave');
  });

  await caso('sequência: segue o relatório até alguém mexer; mover persiste para todos; confere pela situação (fora de sequência, deveria ter começado); PDF novo entra no fim; 24 h para o topo; limpar', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    const ger2 = entrar(m, DONO, '4321');
    acao(m, s, 'parametrosCarga', { emCurso: 2 });
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', {
      '900001': { GRANDEZA: ['0/10', '0/10'] }, '900002': { GRANDEZA: ['0/10', '0/10'] }, '900003': { GRANDEZA: ['0/10', '0/10'] },
      '900004': { MIUDEZA: ['2/10', '0/10'] }, '900005': { GRANDEZA: ['X', 'X'] }, '900006': { NOBRE: ['0/5', '0/5'] } }));
    let q = tela(m, s).sequencia;
    afirmar(!q.usada && q.itens.map((x) => x.n).join() === '900001,900002,900003,900004,900005,900006' && q.itens.every((x) => x.virtual), 'virtual na ordem do relatorio');
    const flags = (seq) => seq.itens.map((x) => x.n.slice(-1) + ':' + x.flags.join('+')).join(' ');
    afirmar(flags(q) === '1:emCurso+deveria+pulada 2:emCurso+deveria 3: 4:fora 5: 6:', 'conferencia ' + flags(q));
    afirmar(q.alertas.fora === 1 && q.alertas.deveria === 2 && q.prontas === 1 && q.ativas === 5, 'alertas ' + JSON.stringify(q.alertas));
    afirmar(!ctx(m).listar('CARGA_SEQUENCIA').length, 'nada gravado ainda');
    // mover a 900004 para a primeira posicao: grava a fila inteira; o outro ve
    const g0 = acao(m, s, 'geracaoCarga', {}).g;
    let r = acao(m, s, 'sequenciaCarga', { op: 'mover', carga: '900004', para: 1 });
    afirmar(r.recado === 'Carga 900004 na posição 1.' && r.g !== g0, r.recado);
    afirmar(ctx(m).listar('CARGA_SEQUENCIA').length === 6 && r.sequencia.usada && !r.sequencia.itens.some((x) => x.virtual), 'gravou 6 linhas');
    q = tela(m, ger2).sequencia;
    afirmar(q.itens.map((x) => x.n).join() === '900004,900001,900002,900003,900005,900006' && q.mexida && q.mexida.por === GERENTE, 'o outro ve ' + q.itens.map((x) => x.n));
    afirmar(flags(q) === '4:emCurso 1:emCurso+deveria 2: 3: 5: 6:', 'conferida de novo ' + flags(q));
    r = acao(m, ger2, 'sequenciaCarga', { op: 'mover', carga: '900006', para: 99 });
    afirmar(r.sequencia.itens[5].n === '900006' && /posição 6/.test(r.recado), 'para alem do fim = ultima');
    r = acao(m, ger2, 'sequenciaCarga', { op: 'mover', carga: '900003', para: 2 });
    afirmar(r.sequencia.itens.map((x) => x.n).join() === '900004,900003,900001,900002,900005,900006', 'mover para o meio ' + r.sequencia.itens.map((x) => x.n));
    afirmar(/não está na sequência/.test(erroDe(() => acao(m, s, 'sequenciaCarga', { op: 'mover', carga: '123456', para: 1 }))), 'carga desconhecida');
    afirmar(/qual posição/.test(erroDe(() => acao(m, s, 'sequenciaCarga', { op: 'mover', carga: '900001', para: 0 }))), 'posicao 0');
    afirmar(/desconhecida/.test(erroDe(() => acao(m, s, 'sequenciaCarga', { op: 'apagar' }))), 'op');
    // PDF novo: a 900002 saiu do relatorio; a 900007 (24 h) entra no fim com a sugestao de subir
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', {
      '900001': { GRANDEZA: ['3/10', '0/10'] }, '900003': { GRANDEZA: ['0/10', '0/10'] }, '900004': { MIUDEZA: ['6/10', '2/10'] },
      '900005': { GRANDEZA: ['X', 'X'] }, '900006': { NOBRE: ['0/5', '0/5'] }, '900007': { h24: true, d: { BLOCADO: ['0/4', '0/4'] } } }));
    q = tela(m, s).sequencia;
    afirmar(q.itens.map((x) => x.n).join() === '900004,900003,900001,900002,900005,900006,900007', 'nova no fim ' + q.itens.map((x) => x.n));
    const it = (n) => q.itens.find((x) => x.n === n);
    afirmar(it('900002').saiu && it('900002').estado === 'saiu' && it('900007').flags.indexOf('prioridade') !== -1 && it('900007').h === 1, 'saiu e prioridade ' + JSON.stringify([it('900002'), it('900007')]));
    afirmar(ctx(m).listar('CARGA_SEQUENCIA').find((x) => x.CARGA === '900002').SAIU_EM === '2026-11-25T09:00:00', 'SAIU_EM');
    r = acao(m, s, 'sequenciaCarga', { op: 'topo24' });
    afirmar(r.sequencia.itens[0].n === '900007' && /1 carga de 24 horas subiu/.test(r.recado) && !r.sequencia.itens[0].flags.includes('prioridade'), 'topo ' + r.recado);
    // limpar: sai a pronta (900005) e a que saiu do relatorio (900002); a pronta nao volta como virtual
    r = acao(m, s, 'sequenciaCarga', { op: 'limpar' });
    afirmar(/2 cargas saíram da fila/.test(r.recado) && r.sequencia.itens.map((x) => x.n).join() === '900007,900004,900003,900001,900006', 'limpar ' + r.sequencia.itens.map((x) => x.n));
    afirmar(/Nenhuma carga pronta/.test(erroDe(() => acao(m, s, 'sequenciaCarga', { op: 'limpar' }))), 'nada para limpar');
    // a carga que volta ao relatorio volta para a fila no lugar dela
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T10:00:00', { '900001': { GRANDEZA: ['4/10', '0/10'] }, '900008': { GRANDEZA: ['0/3', '0/3'] } }));
    q = tela(m, s).sequencia;
    afirmar(q.itens.map((x) => x.n + (x.saiu ? '-' : '')).join() === '900007-,900004-,900003-,900001,900006-,900008', 'depois do 3o PDF ' + q.itens.map((x) => x.n + (x.saiu ? '-' : '')));
    // mais de 24 h fora do relatorio: some da fila no PDF seguinte
    m.desvioRelogio = Date.parse('2026-11-26T12:00:00-03:00') - Date.now();
    const s2 = entrar(m, GERENTE, '5555');
    acao(m, s2, 'enviarSituacaoCarga', envio('2026-11-26T11:00:00', { '900001': { GRANDEZA: ['9/10', '0/10'] }, '900008': { GRANDEZA: ['0/3', '0/3'] } }));
    q = tela(m, s2).sequencia;
    afirmar(q.itens.map((x) => x.n).join() === '900001,900008', '24 h depois ' + q.itens.map((x) => x.n));
  });

  await caso('histórico: abrir um envio antigo (só leitura, com os indicadores daquela hora), comparar com agora e entre dois; o envio do Drive carrega sob demanda', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', { '900001': { GRANDEZA: ['0/10', '0/10'] }, '900002': { GRANDEZA: ['5/10', '0/10'], NOBRE: ['0/4', '0/4'] }, '900003': { MIUDEZA: ['1/2', '0/2'] } }));
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T09:00:00', { '900001': { GRANDEZA: ['4/10', '0/10'] }, '900002': { GRANDEZA: ['X', 'X'], NOBRE: ['X', 'X'] }, '900004': { GRANDEZA: ['0/6', '0/6'] } }));
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T10:00:00', { '900001': { GRANDEZA: ['10/10', '2/10'] }, '900004': { GRANDEZA: ['0/6', '0/6'] } }));
    const d = tela(m, s);
    afirmar(d.envios.length === 3 && d.envios[2].emitido === '2026-11-25T08:00:00' && d.envios[0].total === 2 && !d.envios[0].drive, 'lista ' + JSON.stringify(d.envios[2]));
    const id1 = d.envios[2].id, id2 = d.envios[1].id;
    let r = acao(m, s, 'snapshotCarga', { id: id1, com: 'atual' });
    afirmar(r.snapshot.emitido === '2026-11-25T08:00:00' && r.snapshot.cargas.length === 3 && r.snapshot.resumo.dep.GRANDEZA.restSep === 15, 'snapshot ' + JSON.stringify(r.snapshot.resumo.dep.GRANDEZA));
    afirmar(r.indicadores.porDep.GRANDEZA && r.indicadores.equilibrio && r.indicadores.envios === 1, 'indicadores daquela hora ' + r.indicadores.envios);
    const cp = r.comparacao;
    afirmar(cp.de === '2026-11-25T08:00:00' && cp.para === '2026-11-25T10:00:00' && cp.horas === 2, 'janela ' + JSON.stringify([cp.de, cp.para, cp.horas]));
    afirmar(cp.porDep.GRANDEZA.sep === 10 && cp.porDep.GRANDEZA.conf === 2 && cp.porDep.GRANDEZA.concluidas === 0, 'grandeza ' + JSON.stringify(cp.porDep.GRANDEZA));
    const tipo = (n) => (cp.cargas.find((x) => x.n === n) || {}).tipo;
    afirmar(tipo('900001') === 'avancou' && tipo('900002') === 'saiu' && tipo('900003') === 'saiu' && tipo('900004') === 'nova' && cp.totais.novas === 1 && cp.totais.sairam === 2, 'tipos ' + JSON.stringify(cp.cargas));
    // entre os dois primeiros (a ordem dos dois nao importa)
    r = acao(m, s, 'snapshotCarga', { id: id2, com: id1 });
    afirmar(r.comparacao.de === '2026-11-25T08:00:00' && r.comparacao.para === '2026-11-25T09:00:00', 'ordem ' + JSON.stringify([r.comparacao.de, r.comparacao.para]));
    const t2 = (n) => (r.comparacao.cargas.find((x) => x.n === n) || {}).tipo;
    afirmar(t2('900002') === 'concluiu' && r.comparacao.porDep.NOBRE.concluidas === 1 && r.comparacao.porDep.NOBRE.sep === 4 && r.comparacao.porDep.NOBRE.conf === 4, 'concluiu ' + JSON.stringify(r.comparacao.porDep.NOBRE));
    afirmar(r.comparacao.porDep.NOBRE.pctAntes === 0 && r.comparacao.porDep.NOBRE.pctDepois === 100, 'pct nobre');
    afirmar(!acao(m, s, 'snapshotCarga', { id: id1, com: id1 }).comparacao, 'consigo mesmo: sem comparacao');
    afirmar(/não existe mais/.test(erroDe(() => acao(m, s, 'snapshotCarga', { id: 'nada' }))), 'id invalido');
    // envios antigos no Drive: abrem do mesmo jeito; arquivo sumido = mensagem clara
    for (let h = 11; h < 18; h++) acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T' + h + ':00:00', { '900001': { GRANDEZA: ['10/10', (h - 9) + '/10'] } }));
    const env = tela(m, s).envios;
    const doDrive = env.filter((x) => x.drive);
    afirmar(doDrive.length >= 3 && doDrive.some((x) => x.id === id1), 'no drive: ' + doDrive.length);
    r = acao(m, s, 'snapshotCarga', { id: id1, com: 'atual' });
    afirmar(r.snapshot.drive && r.snapshot.cargas.length === 3 && r.comparacao.totais.sairam === 2, 'do Drive ' + r.snapshot.cargas.length);
    const linha = ctx(m).listar('CARGA_SNAPSHOTS').find((x) => x.ID === id1);
    m.arquivos.get(String(linha.CARGAS).slice(6)).lixo = true;
    m.arquivos.delete(String(linha.CARGAS).slice(6));
    afirmar(/no Drive/.test(erroDe(() => acao(m, s, 'snapshotCarga', { id: id1 }))), 'arquivo apagado');
  });

  await caso('pátio e boxes (nativo): registrar (número curto, tipo do veículo pelo relatório), box, chegou, carregando, carregada libera o box, reabrir, excluir; histórico; ao vivo', () => {
    const m = mundo(); const s = entrar(m, COORD, '1234');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T15:00:00', { '900001': { h24: true, d: { GRANDEZA: ['0/10', '0/10'] } }, '900002': { GRANDEZA: ['X', 'X'] },
      '900003': { box: '12', d: { GRANDEZA: ['3/10', '0/10'] } } }));
    let d = tela(m, s);
    afirmar(d.patio.n === 26 && d.patio.mapa.length === 26 && d.patio.mapa.every((b) => b.estado === 'LIVRE') && d.patio.semRegistro.length === 3 && d.patio.semRegistro[0].n === '900001',
      'patio vazio ' + JSON.stringify(d.patio.contagem));
    afirmar(d.patio.situacoes.length === 25 && d.patio.situacoes.indexOf('MARCOU E NAO VEIO') !== -1 && d.patio.tipos.join() === 'LEVE,VUC,MEDIO,TOCO,TRUCK,CARRETA,OUTRO', 'listas');
    const g0 = acao(m, s, 'geracaoCarga', {}).g;
    // numero curto (como no quadro antigo): 002 = 900002; tipo pelo veiculo do relatorio (MEDIO)
    let r = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '002', box: 7, veiculo: 'abc1d23', motorista: 'Motorista Teste B', previsao: '16:30' });
    afirmar(/Carga 900002 no box 7 \(002 = 900002\)/.test(r.recado) && r.g !== g0, r.recado);
    const id2 = r.id;
    let b7 = r.patio.mapa[6];
    afirmar(b7.estado === 'RESERVADO' && b7.itens[0].n === '900002' && b7.itens[0].tipo === 'MEDIO' && b7.itens[0].veiculo === 'ABC1D23' && b7.itens[0].pdf.estado === 'pronta', 'box 7 reservado ' + JSON.stringify(b7.itens[0]).slice(0, 200));
    afirmar(/já está no box 7/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900002' }))), 'duplicada');
    afirmar(/Box de 1 a 26/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900001', box: 27 }))), 'box 27');
    afirmar(/Observação "TANTO FAZ" não está na lista/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900001', situacao: 'tanto faz' }))), 'situacao fora da lista');
    afirmar(/Horário de chegada: escreva/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900001', previsao: 'logo' }))), 'previsao');
    afirmar(/Informe o número/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '' }))), 'sem numero');
    // o carro chegou: o box fica ocupado com o veiculo encostado
    m.desvioRelogio += 60000;
    r = acao(m, s, 'carregamentoCarga', { op: 'chegou', id: id2 });
    b7 = r.patio.mapa[6];
    afirmar(/chegou ao box 7 às \d\d:\d\d/.test(r.recado) && b7.estado === 'OCUPADO' && b7.itens[0].situacao === 'JÁ NO BOX' && b7.noBox && b7.noBox === b7.itens[0].chegada, r.recado + ' ' + JSON.stringify(b7).slice(0, 200));
    // a 900001 (24 h) entra no patio com "marcou e nao veio": alerta de prioridade
    r = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900001', tipo: 'TRUCK', situacao: 'marcou e não veio', prioridade: '1' });
    const id1 = r.id;
    afirmar(r.patio.fila.length === 1 && r.patio.fila[0].n === '900001' && r.patio.fila[0].situacao === 'MARCOU E NAO VEIO' && r.patio.fila[0].etapa === 'FILA', 'fila ' + JSON.stringify(r.patio.fila[0]).slice(0, 200));
    afirmar(r.patio.alertas.some((a) => a.tipo === 'prioridadeRisco' && a.carga === '900001' && a.grav === 'alerta'), 'prioridade com risco');
    // arrastar para o box 3 (reservado para a loja de Vitoria da Conquista: aviso); depois de volta ao patio
    r = acao(m, s, 'carregamentoCarga', { op: 'box', id: id1, box: 3 });
    afirmar(r.patio.mapa[2].estado === 'RESERVADO' && !r.patio.fila.length, 'no box 3');
    afirmar(r.patio.alertas.some((a) => a.tipo === 'boxDaLoja' && a.carga === '900001' && /Box 3 é reservado para a Loja Vitória da Conquista: a carga 900001 não é da loja/.test(a.texto)), 'aviso do box da loja');
    afirmar(/Ponha a carga/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'box', id: id1, box: 0 }) && acao(m, s, 'carregamentoCarga', { op: 'carregando', id: id1 }))), 'carregando sem box');
    acao(m, s, 'carregamentoCarga', { op: 'box', id: id1, box: 3 });
    r = acao(m, s, 'carregamentoCarga', { op: 'carregando', id: id1 });
    afirmar(r.patio.mapa[2].estado === 'CARREGANDO' && r.patio.mapa[2].itens[0].chegada && r.patio.mapa[2].itens[0].situacao === 'CARREGANDO', 'carregando');
    // carregada: libera o box, fica nas carregadas de hoje; reabrir volta ao box
    r = acao(m, s, 'carregamentoCarga', { op: 'carregada', id: id2 });
    afirmar(/box 7 liberado/.test(r.recado) && r.patio.mapa[6].estado === 'LIVRE' && r.patio.carregadas[0].n === '900002' && r.patio.carregadas[0].carregadaPor === COORD, r.recado);
    afirmar(/já está carregada/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'carregada', id: id2 }))), 'carregada duas vezes');
    r = acao(m, s, 'carregamentoCarga', { op: 'reabrir', id: id2 });
    afirmar(r.patio.mapa[6].estado === 'OCUPADO' && !r.patio.carregadas.length, 'reaberta no box 7');
    acao(m, s, 'carregamentoCarga', { op: 'carregada', id: id2 });
    const hist = ctx(m).cgCarregamentos_().find((x) => x.id === id2).hist.map((h) => h[2]);
    afirmar(hist.join(' | ') === 'registrou no box 7 | chegou (box 7) | carregada (box 7 liberado) | reabriu | carregada (box 7 liberado)' && ctx(m).cgCarregamentos_()[0].hist[0][1] === 'Maria Souza', 'historico ' + hist.join(' | '));
    // situacao e excluir
    r = acao(m, s, 'carregamentoCarga', { op: 'situacao', id: id1, situacao: 'Carro com defeito' });
    afirmar(r.patio.mapa[2].itens[0].situacao === 'CARRO COM DEFEITO' && r.patio.mapa[2].itens[0].situacaoCat === 'risco', 'situacao');
    r = acao(m, s, 'carregamentoCarga', { op: 'excluir', id: id1 });
    afirmar(r.patio.mapa[2].estado === 'LIVRE' && /tirada do pátio/.test(r.recado), 'excluida');
    afirmar(/não existe mais/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'chegou', id: id1 }))), 'id excluido');
    // a carga que nao esta no relatorio entra (com aviso), e o numero curto que nao casa e recusado
    r = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '765432', veiculo: 'VUC 2700' });
    afirmar(/não está na situação de carga/.test(r.recado) && r.patio.fila.find((x) => x.n === '765432').tipo === 'VUC', 'fora do pdf ' + r.recado);
    afirmar(/Nenhuma carga da situação de carga termina em 777/.test(erroDe(() => acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '777' }))), 'curto sem par');
    ctx(m).descarregarLog();
    afirmar(ctx(m).listar('LOG').some((l) => l.TABELA === 'CARGA_CARREGAMENTO'), 'no LOG');
  });

  await caso('pátio: cruzamento com o PDF (pronta sem veículo no box, veículo encostado com a carga longe, box diferente, carga que saiu do relatório; o tempo encostado não avisa mais) e box bloqueado', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T15:00:00', { '900001': { h24: true, d: { GRANDEZA: ['X', 'X'] } }, '900002': { box: '5', d: { GRANDEZA: ['1/10', '0/10'] } },
      '900003': { box: '4', d: { GRANDEZA: ['X', 'X'] } }, '900004': { box: '6', d: { GRANDEZA: ['X', 'X'] } } }));
    acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900002', box: 9, chegada: '17:00' });
    acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900003', box: 4 });
    const id4 = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900004', box: 6, chegada: '17:30' }).id;
    acao(m, s, 'carregamentoCarga', { op: 'carregando', id: id4 });
    const p = tela(m, s).patio;
    const tipos = p.alertas.map((a) => a.tipo + ':' + a.carga).sort().join(' ');
    afirmar(tipos === 'boxDiferente:900002 boxLonge:900002 prontaSemBox:900001 prontaSemBox:900003', 'alertas ' + tipos);
    afirmar(p.alertas[0].tipo === 'prontaSemBox' && p.alertas[0].carga === '900001' && p.alertas[0].grav === 'alerta' && /nem registro no pátio/.test(p.alertas[0].texto), 'a de 24 h primeiro ' + p.alertas[0].texto);
    afirmar(p.mapa[8].estado === 'OCUPADO' && /T17:00:00$/.test(p.mapa[8].noBox) && p.mapa[8].itens[0].chegada === p.mapa[8].noBox && p.mapa[5].estado === 'CARREGANDO', 'chegada pela hora: ' + p.mapa[8].noBox);
    afirmar(!('noBoxMin' in p.mapa[8]) && !('noBoxMin' in p.mapa[8].itens[0]) && !('permanenciaMin' in p), 'sem o tempo encostado');
    // 3 h depois: o veiculo continua encostado, sem aviso de tempo (pedido de 26/11); a chegada continua gravada
    m.desvioRelogio += 90 * 60000;
    const s2 = entrar(m, GERENTE, '5555');
    const p2 = ctx(m).cgPatioDaTela_(ctx(m).cgCargasDoUltimo_());
    afirmar(!p2.alertas.some((a) => a.tipo === 'permanencia' || /encostado há/.test(a.texto)) && /T17:00:00$/.test(p2.mapa[8].noBox), 'sem aviso de permanencia ' + JSON.stringify(p2.alertas.map((a) => a.tipo)));
    // a carga sai do relatorio sem estar carregada
    acao(m, s2, 'enviarSituacaoCarga', envio('2026-11-25T16:00:00', { '900001': { GRANDEZA: ['X', 'X'] } }));
    const p3 = tela(m, s2).patio;
    afirmar(p3.alertas.filter((a) => a.tipo === 'foraDoPdf').map((a) => a.carga).sort().join() === '900002,900003,900004', 'fora do pdf');
    // bloquear: box com carga nao bloqueia; vazio bloqueia e nao recebe carga
    afirmar(/tem carga/.test(erroDe(() => acao(m, s2, 'boxCarga', { numero: 9, estado: 'BLOQUEADO' }))), 'box com carga');
    let r = acao(m, s2, 'boxCarga', { numero: 2, estado: 'BLOQUEADO', obs: 'porta quebrada' });
    afirmar(r.patio.mapa[1].estado === 'BLOQUEADO' && r.patio.mapa[1].obs === 'porta quebrada' && /Box 2 bloqueado/.test(r.recado), 'bloqueado');
    afirmar(/box 2 está bloqueado \(porta quebrada\)/.test(erroDe(() => acao(m, s2, 'carregamentoCarga', { op: 'salvar', carga: '900001', box: 2 }))), 'nao recebe');
    r = acao(m, s2, 'boxCarga', { numero: 2, estado: 'LIVRE' });
    afirmar(r.patio.mapa[1].estado === 'LIVRE' && !r.patio.mapa[1].obs, 'liberado');
    // quantidade de boxes
    acao(m, s2, 'parametrosCarga', { boxes: 30 });
    afirmar(tela(m, s2).patio.mapa.length === 30, '30 boxes');
    afirmar(/de 1 a 99/.test(erroDe(() => acao(m, s2, 'parametrosCarga', { boxes: 0 }))), 'boxes 0');
    // tipos de veiculo pelo texto do relatorio
    const t = (x) => ctx(m).cgTipoDoVeiculo_(x);
    afirmar(t('VUC 2700') === 'VUC' && t('MEDIO - DEP') === 'MEDIO' && t('3/4') === 'MEDIO' && t('TOCO - DEP') === 'TOCO' && t('BI-TRUCK') === 'TRUCK' && t('CARRETA LS') === 'CARRETA' &&
      t('LEVE') === 'LEVE' && t('FIORINO') === 'LEVE' && t('XYZ') === 'OUTRO' && t('') === '', 'tipos');
  });

  /* A planilha antiga dos boxes: Controle + Situacao dos BOXs, com o que a de verdade tem (linhas vazias, coluna sem nome). */
  function planilhaBoxes(m) {
    const controle = [
      ['CARGA', 'COMPLEMENTO', 'PRIORIDADE', 'BOX', 'CARRO', 'DESCRIÇÃO', 'MOTORISTA', 'CARREGADA?', 'OBSERVAÇÃO', '', 'HORÁRIO CHEGADA'],
      ['900001', '', '1', '5', 'TRUCK', 'ROTA TESTE NORTE', 'MOTORISTA TESTE A', 'NÃO', 'MARCOU E NAO VEIO', '', ''],
      ['002', '', '', '3', 'VUC', 'ROTA TESTE SUL', 'MOTORISTA TESTE B', '', 'MOTORISTA A CAMINHO', '', ''],
      ['', '', '', '', '', '', '', '', '', '', ''],
      ['900004', 'COMPL', '', '7', 'TRUCK', 'ROTA TESTE LESTE', 'MOTORISTA TESTE C', '', 'JÁ NO BOX', '', '06:10'],
      ['900005', '', 'ALTA', '3', 'TOCO', 'ROTA TESTE OESTE', 'MOTORISTA TESTE D', 'SIM', 'Carro com defeito', '', '']
    ];
    const boxes = [26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const sit = [['SITUAÇÃO DOS BOXS'], [], [],
      [''].concat(boxes.map((b) => b === 7 ? 'TRUCK' : (b === 12 ? 'BI-TRUCK' : ''))),
      ['BOX'].concat(boxes.map(String)),
      [''].concat(boxes.map((b) => [7, 12, 20].indexOf(b) !== -1 ? 'Ocupado' : 'Livre')),
      [''].concat(boxes.map((b) => b === 7 ? '004' : (b === 12 ? '003  010' : (b === 20 ? '999' : ''))))];
    // a Situacao vai da coluna B ate a AA (27 colunas): a aba de teste tem 40
    const p = m.novaPlanilha('Controle de Boxes (teste)');
    const Aba = Object.getPrototypeOf(p.abas[0]).constructor;
    p.abas[0].nome = 'Controle';
    controle.forEach((l, i) => { p.abas[0].dados[i] = l.slice(); });
    const aba = new Aba(p, 'Situação dos BOXs', 1000, 40);
    p.abas.push(aba);
    sit.forEach((l, i) => { aba.dados[i] = l.slice(); });
    return 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit';
  }

  await caso('importar da planilha antiga (uma vez): Controle e quadro dos boxes viram o pátio, a carregada não entra, o que já está no GSL fica; a planilha não é tocada', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T08:00:00', {
      '900001': { h24: true, d: { GRANDEZA: ['0/10', '0/10'] } }, '900002': { GRANDEZA: ['X', 'X'] }, '900003': { box: '12', d: { GRANDEZA: ['3/10', '0/10'] } },
      '900004': { box: '7', d: { GRANDEZA: ['X', 'X'] } }, '900005': { GRANDEZA: ['1/10', '0/10'] }, '900010': { box: '12', d: { GRANDEZA: ['9/10', '9/10'] } } }));
    acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900003', box: 1 });       // ja esta no GSL: fica como esta
    const link = planilhaBoxes(m);
    const id = link.split('/')[5];
    const antes = JSON.stringify(m.planilhas.get(id).abas.map((a) => a.dados));
    afirmar(/Cole o link/.test(erroDe(() => acao(m, s, 'importarBoxesCarga', { link: 'http://exemplo.com' }))), 'link ruim');
    let r = acao(m, s, 'importarBoxesCarga', { link });
    afirmar(/4 cargas importadas da planilha "Controle de Boxes \(teste\)" \(2 já estavam no GSL ou sem número\)\. A planilha não foi alterada\./.test(r.recado), r.recado);
    const por = {};
    ctx(m).cgCarregamentos_().forEach((x) => { por[x.n] = x; });
    afirmar(!por['900005'] && por['900003'].box === 1, 'carregada nao entra; a do GSL fica');
    afirmar(por['900001'].box === 5 && por['900001'].situacao === 'MARCOU E NAO VEIO' && por['900001'].tipo === 'TRUCK' && por['900001'].motorista === 'MOTORISTA TESTE A' && por['900001'].etapa === 'BOX' && !por['900001'].noBox, '900001 ' + JSON.stringify(por['900001']).slice(0, 200));
    afirmar(por['900002'].box === 3 && por['900002'].tipo === 'VUC' && por['900002'].situacao === 'MOTORISTA A CAMINHO', '002 = 900002');
    afirmar(por['900004'].box === 7 && por['900004'].noBox === '2026-11-25T06:10:00' && por['900004'].chegada === '2026-11-25T06:10:00' && por['900004'].situacao === 'JÁ NO BOX', '900004 no box desde 06:10');
    afirmar(por['900010'].box === 12 && por['900010'].noBox && por['900010'].tipo === 'TRUCK', '900010 do quadro (BI-TRUCK, ocupado)');
    afirmar(JSON.stringify(m.planilhas.get(id).abas.map((a) => a.dados)) === antes, 'a planilha deles nao foi tocada');
    r = acao(m, s, 'importarBoxesCarga', { link });
    afirmar(/^0 cargas importadas/.test(r.recado), 'de novo nao duplica: ' + r.recado);
  });

  await caso('planilha antiga, leitura tolerante: cabeçalho fora da 1ª linha, colunas em outra ordem, nomes sem acento ou minúsculos, abas com outro nome; faltando aba, o aviso', () => {
    const m = mundo(); const c = ctx(m);
    const r = c.cgInterpretarBoxes_([
      { nome: 'Resumo', valores: [['qualquer coisa'], ['1', '2']] },
      { nome: ' controle ', valores: [['PLANILHA DE DOCAS'], [], ['Observacao', 'Nº Carga', 'Box', 'motorista', 'Horario de chegada', 'carro', 'Carregada'],
        ['sem previsão', '763154', '14', 'X', '07:15', 'TRUCK', 'sim'], ['', '', '', '', '', '', ''], ['Já no box', '155/156', '15', 'Y', '', 'VUC', '']] },
      { nome: 'situacao dos boxs', valores: [[], ['', 'CARRETA', ''], ['', '3', '2', '1'], ['', 'ocupado', 'LIVRE', 'Ocupado'], ['', '154 155', '', '']] }
    ]);
    afirmar(r.abas.controle === ' controle ' && r.abas.situacao === 'situacao dos boxs' && !r.avisos.length, 'abas ' + JSON.stringify(r));
    afirmar(r.controle.length === 3 && r.controle[0].carga === '763154' && r.controle[0].box === '14' && r.controle[0].obsCat === 'risco' && r.controle[0].carregadaSim && r.controle[0].chegada === '07:15', 'controle ' + JSON.stringify(r.controle[0]));
    afirmar(r.controle[1].carga === '155' && r.controle[2].carga === '156' && r.controle[1].obsCat === 'ok', 'duas cargas numa celula');
    afirmar(r.boxes.length === 3 && r.boxes[0].numero === 3 && r.boxes[0].estado === 'OCUPADO' && r.boxes[0].veiculo === 'CARRETA' && r.boxes[0].cargas.join() === '154,155' && r.boxes[1].estado === 'LIVRE', 'boxes ' + JSON.stringify(r.boxes));
    const sem = c.cgInterpretarBoxes_([{ nome: 'Plan1', valores: [['nada aqui']] }]);
    afirmar(sem.avisos.length === 2 && /Controle/.test(sem.avisos[0]) && /Situação dos BOXs/.test(sem.avisos[1]), 'avisos ' + JSON.stringify(sem.avisos));
    // numero curto que casa com duas cargas: nao chuta
    const amb = c.cgResolverCarga_('154', [{ n: '763154' }, { n: '764154' }]);
    afirmar(!amb.n && amb.ambigua.join() === '763154,764154' && /pode ser 763154 ou 764154/.test(amb.erro), 'ambigua ' + JSON.stringify(amb));
    afirmar(['MARCOU E NAO VEIO', 'Marcou e não veio', 'CARRO NA OFICINA', 'SEM PREVISÃO'].every((o) => c.cgCategoriaObs_(o) === 'risco') &&
      c.cgCategoriaObs_('CARREGAR SÓ À NOITE') === 'espera' && c.cgCategoriaObs_('JÁ NO BOX') === 'ok' && c.cgCategoriaObs_('outra coisa') === 'outra' && c.cgCategoriaObs_('') === '', 'categorias');
  });

  await caso('passagem de turno: quem sai confirma o retrato (24 h primeiro, gargalo, alocação, manutenção, faltas); quem entra marca ciente; confirmar de novo pede ciente de novo', () => {
    const m = mundo(); const s = entrar(m, COORD, '1234');
    ligarQuadro(m, entrar(m, DONO, '4321'));
    const p = tela(m, s).pessoas;
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T15:00:00', { '900001': { GRANDEZA: ['8/10', '0/10'] }, '900002': { h24: true, d: { NOBRE: ['1/10', '0/10'] } }, '900003': { GRANDEZA: ['X', 'X'] } }));
    acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } });
    acao(m, s, 'presencaCarga', { pessoa: p[1], falta: true });
    acao(m, s, 'equipamentoCarga', { tipo: 'CHECKOUT', dep: 'NOBRE', numero: 3, estado: 'MANUTENCAO', obs: 'leitor' });
    afirmar(/ainda não confirmou/.test(erroDe(() => acao(m, s, 'passagemCarga', { op: 'ciente', sai: 'A', entra: 'B' }))), 'ciente sem confirmar');
    afirmar(/Diga o turno/.test(erroDe(() => acao(m, s, 'passagemCarga', { op: 'confirmar', sai: 'A', entra: 'A' }))), 'turnos iguais');
    let r = acao(m, s, 'passagemCarga', { op: 'confirmar', sai: 'A', entra: 'B', obs: 'Box 7 com defeito na porta' });
    afirmar(/confirmada/.test(r.recado) && r.passagens.length === 1, r.recado);
    const ps = r.passagens[0];
    afirmar(ps.data === '2026-11-25' && ps.confirmadoNome === 'Maria Souza' && !ps.cienteEm && ps.obs === 'Box 7 com defeito na porta', 'linha ' + JSON.stringify(ps).slice(0, 200));
    const re = ps.resumo;
    afirmar(re.abertas === 2 && re.cargas[0].n === '900002' && re.cargas[0].gargalo === 'NOBRE' && re.h24 === 1 && re.emitido === '2026-11-25T15:00:00', 'cargas ' + JSON.stringify(re.cargas));
    afirmar(re.alocacao.GRANDEZA.sep === 1 && re.pessoas === 1 && re.faltas.length === 1 && re.manutencao.length === 1 && re.manutencao[0].tipo === 'CHECKOUT' && re.manutencao[0].obs === 'leitor', 'resto ' + JSON.stringify(re));
    const ger = entrar(m, GERENTE, '5555');
    r = acao(m, ger, 'passagemCarga', { op: 'ciente', sai: 'A', entra: 'B' });
    afirmar(r.passagens[0].cienteNome === 'João Lima' && r.passagens[0].cienteEm, 'ciente ' + JSON.stringify(r.passagens[0]).slice(0, 200));
    afirmar(/Já está ciente: João Lima/.test(erroDe(() => acao(m, ger, 'passagemCarga', { op: 'ciente', sai: 'A', entra: 'B' }))), 'ciente duas vezes');
    r = acao(m, s, 'passagemCarga', { op: 'confirmar', sai: 'A', entra: 'B' });
    afirmar(r.passagens.length === 1 && !r.passagens[0].cienteEm, 'confirmar de novo pede ciente de novo');
    afirmar(tela(m, s).passagens.length === 1, 'na tela');
  });

  await caso('flowrack: ruas por andar (parâmetro), pessoa na rua do andar, rua fora do andar recusada, trocar de rua não muda o "desde"', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    ligarQuadro(m, s);
    const p = tela(m, s).pessoas;
    let r = acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 2, rua: 3 } });
    afirmar(r.equipe[0].andar === 2 && r.equipe[0].rua === 3, 'rua 3 ' + JSON.stringify(r.equipe[0]));
    afirmar(/tem 6 ruas/.test(erroDe(() => acao(m, s, 'moverPessoaCarga', { pessoa: p[1], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 2, rua: 7 } }))), 'rua 7');
    acao(m, s, 'parametrosCarga', { ruas: '6,6,8,8,4' });
    afirmar(tela(m, s).flowrack.ruas.join() === '6,6,8,8,4', 'parametro');
    const desde = r.equipe[0].desde;
    m.desvioRelogio += 60000;
    r = acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 2, rua: 8 } });
    afirmar(r.equipe[0].rua === 8 && r.equipe[0].desde === desde, 'rua 8 ' + JSON.stringify(r.equipe[0]));
    r = acao(m, s, 'moverPessoaCarga', { pessoa: p[0], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 4 } });
    afirmar(r.equipe[0].rua === 0 && r.equipe[0].andar === 4, 'sem rua = o andar todo');
    afirmar(/Ruas do flowrack/.test(erroDe(() => acao(m, s, 'parametrosCarga', { ruas: '6,6' }))) && /Ruas do flowrack/.test(erroDe(() => acao(m, s, 'parametrosCarga', { ruas: '30' }))), 'ruas invalidas');
    acao(m, s, 'parametrosCarga', { ruas: '7,7,7,7,7' });
    afirmar(ctx(m).parametro('CARGA_FLOWRACK_RUAS', '') === '7', 'iguais viram um numero so');
  });

  console.log('\nFase 3 (8.16):');

  /* O Quadro de teste com as funcoes como no mapa da gerencia: "Separador nobre", "Sep. grandeza I", "Conf. miudeza II"... e o Recebimento. */
  function ligarQuadro5x2(m, s) {
    const { abas } = require('./dados-quadro.js')(m.DataDoScript, new Date(Date.parse(AGORA)));
    const g = abas.GERAL;
    const iCab = g.findIndex((l) => l && l[0] === 'EQUIPE'), iFun = 3;   // EQUIPE · COD · PROD · DESCRICAO (a funcao) · RH · STATUS
    const SEP = ['SEPARADOR NOBRE', 'SEP. GRANDEZA I', 'SEP. MIUDEZA I'], CONF = ['CONF. NOBRE', 'CONF. MIUDEZA II', 'CONF. GRANDEZA II'];
    let ns = 0, nc = 0, nr = 0;
    for (let i = iCab + 1; i < g.length; i++) {
      const l = g[i];
      if (!l || !l[iFun]) continue;
      if (l[iFun] === 'SEPARADOR') l[iFun] = SEP[ns++ % 3];
      else if (l[iFun] === 'CONFERENTE') l[iFun] = CONF[nc++ % 3];
      else if (l[iFun] === 'REPOSITOR' && nr++ < 2) l[iFun] = 'REC. MERCADORIA';
    }
    acao(m, s, 'salvarFonteQuadro', { link: planilhaAntiga(m, 'BI Quadro CD Feira', abas) });
    m.cache.clear();
  }
  const quando = (iso) => { m0.desvioRelogio = Date.parse(iso) - Date.now(); };
  let m0 = null;

  await caso('escala 5x2: A1/A2 e C1/C2 pelo dia da semana (segunda só A2/C2, terça só A1/C1, quarta a sábado os dois), B e ADM de segunda a sexta, o C que passa da meia-noite é do dia em que começou', () => {
    const m = mundo(); const c = ctx(m);
    const t = c.cgTurnos_(), adm = c.cgHorarioAdm_();
    const reg = (equipe, sub, funcao) => c.cgRegime_({ k: 'C1', equipe, funcao: funcao || 'SEPARADOR NOBRE' }, sub ? { C1: sub } : {});
    const est = (r, iso) => c.cgSituacaoNaEscala_(r, iso, t, adm).estado;
    // 23/11/2026 e segunda; 28/11 sabado; 29/11 domingo
    const casos = [
      ['1° TURNO', 'A1', '2026-11-23T10:00:00', 'folga'], ['1° TURNO', 'A2', '2026-11-23T10:00:00', 'servico'],
      ['1° TURNO', 'A1', '2026-11-24T10:00:00', 'servico'], ['1° TURNO', 'A2', '2026-11-24T10:00:00', 'folga'],
      ['1° TURNO', 'A1', '2026-11-28T10:00:00', 'servico'], ['1° TURNO', 'A2', '2026-11-28T10:00:00', 'servico'], ['1° TURNO', 'A1', '2026-11-29T10:00:00', 'folga'],
      ['1° TURNO', 'A2', '2026-11-23T18:00:00', 'fora'], ['1° TURNO', '', '2026-11-23T10:00:00', 'servico'],
      ['3° TURNO', 'C2', '2026-11-23T23:30:00', 'servico'], ['3° TURNO', 'C1', '2026-11-23T23:30:00', 'folga'],
      ['3° TURNO', 'C1', '2026-11-24T02:00:00', 'folga'], ['3° TURNO', 'C2', '2026-11-24T02:00:00', 'servico'],
      ['3° TURNO', 'C1', '2026-11-24T23:30:00', 'servico'], ['3° TURNO', 'C2', '2026-11-24T23:30:00', 'folga'],
      ['3° TURNO', 'C1', '2026-11-29T02:00:00', 'servico'], ['3° TURNO', 'C1', '2026-11-29T23:30:00', 'folga'],
      ['2° TURNO', '', '2026-11-27T20:00:00', 'servico'], ['2° TURNO', '', '2026-11-28T20:00:00', 'folga'], ['2° TURNO', '', '2026-11-28T00:30:00', 'servico'],
      ['ADM', '', '2026-11-23T10:00:00', 'servico'], ['ADM', '', '2026-11-28T10:00:00', 'folga'], ['ADM', '', '2026-11-23T20:00:00', 'fora']
    ];
    casos.forEach(([eq, sub, iso, quer]) => { const v = est(reg(eq, sub), iso); afirmar(v === quer, eq + ' ' + (sub || '-') + ' ' + iso + ': ' + v + ' (esperava ' + quer + ')'); });
    // o Recebimento do Turno A e horario ADM (segunda a sexta), sem subturno
    const rec = reg('1° TURNO', 'A1', 'Rec. mercadoria');
    afirmar(rec.turno === 'ADM' && rec.recebimento && est(rec, '2026-11-28T10:00:00') === 'folga' && est(rec, '2026-11-23T09:00:00') === 'servico', 'recebimento ' + JSON.stringify(rec));
    afirmar(c.cgRegime_({ k: 'x', equipe: '1º TURNO', funcao: 'DESCARREGADOR' }, {}).turno === 'ADM' && reg('1° TURNO', '').aDefinir && reg('2° TURNO', 'A1').grade === 'B', 'descarregador, a definir, B sem subturno');
    // funcao -> deposito e papel
    const z = (f) => { const r = c.cgZonaDaFuncao_(f); return r ? r.dep + '/' + r.papel : '-'; };
    const mapa = { 'Separador nobre': 'NOBRE/SEPARADOR', 'Sep. grandeza I': 'GRANDEZA/SEPARADOR', 'SEP. MIUDEZA I': 'MIUDEZA/SEPARADOR', 'Conf. nobre': 'NOBRE/CONFERENTE',
      'Conf. miudeza II': 'MIUDEZA/CONFERENTE', 'CONF. GRANDEZA II': 'GRANDEZA/CONFERENTE', 'Separador Nobre Grandeza': 'NOBRE_GRANDEZA/SEPARADOR', 'Conferente pesáveis': 'PESAVEIS/CONFERENTE',
      'SEPARADOR': '/SEPARADOR', 'Aux. expedição I': '-', 'Controle expedição': '-', 'Central miudeza': '-', 'Sup. carregamento': '-', 'Montador de carga I': '-' };
    Object.keys(mapa).forEach((f) => afirmar(z(f) === mapa[f], f + ' -> ' + z(f)));
    afirmar(c.cgHorarioAdm_().texto === '08:00–17:48', 'ADM padrao');
  });

  await caso('subturnos: marcar A1/A2 e C1/C2 em lote (só do turno certo; o Recebimento e o B recusam), trocar, limpar; a disponibilidade por depósito agora e nos próximos turnos', () => {
    const m = mundo(); m0 = m; const s = entrar(m, GERENTE, '5555');
    ligarQuadro5x2(m, s);
    let d = tela(m, s);
    const A = d.pessoas.filter((p) => p.equipe === '1° TURNO' && !/REC/.test(p.funcao)), C = d.pessoas.filter((p) => p.equipe === '3° TURNO'), B = d.pessoas.filter((p) => p.equipe === '2° TURNO');
    let r = acao(m, s, 'subturnoCarga', { pessoas: A.slice(0, 10), subturno: 'A1' });
    afirmar(/10 pessoas no A1/.test(r.recado) && Object.keys(r.subturnos).length === 10, r.recado);
    acao(m, s, 'subturnoCarga', { pessoas: A.slice(10, 20), subturno: 'A2' });
    acao(m, s, 'subturnoCarga', { pessoas: C.filter((x, i) => i % 2), subturno: 'C1' });
    acao(m, s, 'subturnoCarga', { pessoas: C.filter((x, i) => !(i % 2)), subturno: 'C2' });
    afirmar(/A1 é só do Turno A/.test(erroDe(() => acao(m, s, 'subturnoCarga', { pessoas: [B[0]], subturno: 'A1' }))), 'B recusa');
    const rec = d.pessoas.find((p) => /REC/.test(p.funcao));
    afirmar(/Recebimento: horário ADM/.test(erroDe(() => acao(m, s, 'subturnoCarga', { pessoas: [rec], subturno: 'A2' }))), 'recebimento recusa');
    afirmar(/A1, A2, C1 ou C2/.test(erroDe(() => acao(m, s, 'subturnoCarga', { pessoas: [A[0]], subturno: 'B1' }))), 'subturno invalido');
    r = acao(m, s, 'subturnoCarga', { pessoas: [A[0]], subturno: 'A2' });
    afirmar(r.subturnos[A[0].k] === 'A2' && ctx(m).listar('CARGA_PESSOAS').filter((x) => x.PESSOA === A[0].k).length === 1, 'trocou sem duplicar');
    r = acao(m, s, 'subturnoCarga', { pessoas: [A[1]], subturno: '' });
    afirmar(!r.subturnos[A[1].k], 'limpou');
    d = tela(m, s);
    afirmar(d.subturnos[A[0].k] === 'A2' && d.turnoAdm.texto === '08:00–17:48', 'na tela');
    // disponibilidade pura: quarta 18:00 (so o B em servico), os proximos turnos C (23:00) e A (06:50 de quinta)
    const c = ctx(m);
    const disp = c.cgDisponibilidade_(d.pessoas, d.subturnos, [{ k: B.find((x) => /^SEP/.test(x.funcao) && x.situacao === 'ATIVO').k }], c.cgTurnos_(), c.cgHorarioAdm_(), '2026-11-25T18:00:00');
    const zb = Object.keys(disp.zonas).filter((k) => /SEPARADOR/.test(k)).reduce((t, k) => t + disp.zonas[k].servico, 0);
    const bSep = B.filter((x) => /^SEP/.test(x.funcao) && x.situacao === 'ATIVO').length;
    afirmar(zb === bSep - 1 && Object.keys(disp.zonas).reduce((t, k) => t + disp.zonas[k].falta, 0) === 1, 'separadores do B agora (menos a falta): ' + zb + ' de ' + bSep);
    afirmar(disp.proximos.map((x) => x.turno + '@' + x.inicio).join() === 'C@2026-11-25T23:00,A@2026-11-26T06:50,B@2026-11-26T16:04', 'proximos ' + disp.proximos.map((x) => x.turno + '@' + x.inicio));
    const cSep = C.filter((x) => /^SEP/.test(x.funcao) && x.situacao === 'ATIVO').length;
    afirmar(Object.keys(disp.proximos[0].zonas).filter((k) => /SEPARADOR/.test(k)).reduce((t, k) => t + disp.proximos[0].zonas[k], 0) === cSep, 'quarta a noite: C1 + C2');
    // segunda: so o C2 trabalha
    const seg = c.cgDisponibilidade_(d.pessoas, d.subturnos, [], c.cgTurnos_(), c.cgHorarioAdm_(), '2026-11-23T18:00:00');
    const c2 = C.filter((x, i) => !(i % 2) && /^(SEP|CONF)/.test(x.funcao) && x.situacao === 'ATIVO').length;
    const nSegC = Object.keys(seg.proximos[0].zonas).reduce((t, k) => t + seg.proximos[0].zonas[k], 0);
    afirmar(seg.proximos[0].turno === 'C' && nSegC === c2, 'segunda a noite so o C2: ' + nSegC + ' de ' + c2);
    afirmar(disp.mapeamento.some((x) => x.funcao === 'SEPARADOR NOBRE' && x.dep === 'NOBRE' && x.papel === 'SEPARADOR') && disp.mapeamento.some((x) => !x.papel), 'mapeamento visivel');
  });

  await caso('alocação automática: na entrada do turno os separadores e conferentes vão para o depósito da função (menos folga 5x2 e falta; quem já está alocado fica); na saída, quem saiu é liberado; uma vez só; desfazer', () => {
    const m = mundo(); m0 = m; let s = entrar(m, GERENTE, '5555');
    ligarQuadro5x2(m, s);
    let d = tela(m, s);               // quarta 18:00: entra o B (16:04) e sai o A (16:14)
    const B = d.pessoas.filter((p) => p.equipe === '2° TURNO' && p.situacao === 'ATIVO');
    const mapeados = B.filter((p) => /^(SEP|CONF)/.test(p.funcao));
    afirmar(d.equipe.length === mapeados.length && d.equipe.every((x) => x.equipe === '2° TURNO'), 'o B inteiro alocado: ' + d.equipe.length + ' de ' + mapeados.length);
    const nob = d.equipe.filter((x) => x.dep === 'NOBRE' && x.papel === 'SEPARADOR');
    afirmar(nob.length && nob.every((x) => x.andar >= 0) && Math.max.apply(null, [0, 1, 2, 3, 4].map((a) => nob.filter((x) => x.andar === a).length)) - Math.min.apply(null, [0, 1, 2, 3, 4].map((a) => nob.filter((x) => x.andar === a).length)) <= 1, 'Nobre: pelos andares');
    afirmar(d.equipe.find((x) => /GRANDEZA/.test(x.funcao) && /^SEP/.test(x.funcao)).dep === 'GRANDEZA', 'grandeza');
    const auto = d.automaticas.find((a) => a.tipo === 'ENTRADA' && a.turno === 'B');
    afirmar(auto && auto.qtd === mapeados.length && auto.dia === '2026-11-25', 'registro ' + JSON.stringify(d.automaticas));
    ctx(m).descarregarLog();
    afirmar(ctx(m).listar('LOG').some((l) => l.TABELA === 'CARGA_ALOCACOES'), 'no LOG');
    // de novo: nao duplica (nem pela pergunta ao vivo)
    acao(m, s, 'geracaoCarga', {}); m.cache.clear(); d = tela(m, s);
    afirmar(ctx(m).listar('CARGA_ALOCACOES').filter((x) => x.TIPO === 'ENTRADA' && x.TURNO === 'B').length === 1 && d.equipe.length === mapeados.length, 'uma vez so');
    // o movimento a mao depois fica; desfazer tira so quem continua onde a automatica pos
    const um = d.equipe.find((x) => x.dep === 'GRANDEZA');
    acao(m, s, 'moverPessoaCarga', { pessoa: d.pessoas.find((p) => p.k === um.k), destino: { dep: 'BLOCADO', papel: 'SEPARADOR' } });
    let r = acao(m, s, 'desfazerAutoCarga', { id: auto.id });
    afirmar(r.equipe.length === 1 && r.equipe[0].k === um.k && r.equipe[0].dep === 'BLOCADO', 'desfez e o movido a mao ficou ' + JSON.stringify(r.equipe.slice(0, 2)));
    afirmar(/Já foi desfeita/.test(erroDe(() => acao(m, s, 'desfazerAutoCarga', { id: auto.id }))), 'desfazer duas vezes');
    // segunda-feira: C1 folga, so o C2 entra; quem faltou nao entra
    const C = d.pessoas.filter((p) => p.equipe === '3° TURNO' && p.situacao === 'ATIVO');
    acao(m, s, 'subturnoCarga', { pessoas: C.filter((x, i) => i % 2), subturno: 'C1' });
    acao(m, s, 'subturnoCarga', { pessoas: C.filter((x, i) => !(i % 2)), subturno: 'C2' });
    const c2 = C.filter((x, i) => !(i % 2) && /^(SEP|CONF)/.test(x.funcao));
    m.desvioRelogio = Date.parse('2026-11-30T22:30:00-03:00') - Date.now(); s = entrar(m, GERENTE, '5555');
    acao(m, s, 'presencaCarga', { pessoa: c2[0], falta: true });
    m.desvioRelogio = Date.parse('2026-11-30T23:05:00-03:00') - Date.now(); s = entrar(m, GERENTE, '5555'); m.cache.clear();
    d = tela(m, s);
    const doC = d.equipe.filter((x) => x.equipe === '3° TURNO');
    afirmar(doC.length === c2.length - 1 && doC.every((x) => c2.some((p) => p.k === x.k)) && !doC.some((x) => x.k === c2[0].k), 'segunda: so o C2, sem a falta: ' + doC.length + ' de ' + c2.length);
    const autoC = d.automaticas.find((a) => a.tipo === 'ENTRADA' && a.turno === 'C' && a.dia === '2026-11-30');
    afirmar(autoC && autoC.puladas.folga === C.filter((x, i) => i % 2 && /^(SEP|CONF)/.test(x.funcao)).length && autoC.puladas.falta === 1, 'puladas ' + JSON.stringify(autoC && autoC.puladas));
    // terca 01:30: o B (01:01) saiu — quem e do B sai da alocacao; desfazer devolve
    const bAntes = d.equipe.filter((x) => x.equipe === '2° TURNO').length;
    m.desvioRelogio = Date.parse('2026-12-01T01:30:00-03:00') - Date.now(); s = entrar(m, GERENTE, '5555'); m.cache.clear();
    d = tela(m, s);
    const saida = d.automaticas.find((a) => a.tipo === 'SAIDA' && a.turno === 'B' && a.dia === '2026-11-30');
    afirmar(saida && saida.qtd === bAntes && !d.equipe.some((x) => x.equipe === '2° TURNO') && d.equipe.some((x) => x.equipe === '3° TURNO'), 'saida do B ' + JSON.stringify(saida) + ' antes ' + bAntes);
    if (bAntes) {
      r = acao(m, s, 'desfazerAutoCarga', { id: saida.id });
      afirmar(r.equipe.filter((x) => x.equipe === '2° TURNO').length === bAntes, 'desfazer a saida devolve');
    }
  });

  await caso('alocar em lote ("Alocar pela função") e qualquer pessoa do CD (carregamento, aux. expedição) pode ir para a separação; ela consome paleteira como qualquer separador', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    ligarQuadro(m, s);
    const p = tela(m, s).pessoas;
    const aux = p.filter((x) => /AUXILIAR/.test(x.funcao)).slice(0, 2), sep = p.filter((x) => x.funcao === 'SEPARADOR').slice(0, 2);
    let r = acao(m, s, 'alocarLoteCarga', { itens: aux.map((x) => ({ pessoa: x, destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } })).concat(
      [{ pessoa: sep[0], destino: { dep: 'NOBRE', papel: 'SEPARADOR' } }, { pessoa: sep[1], destino: { dep: 'NOBRE', papel: 'SEPARADOR', andar: 2 } }]) });
    afirmar(/3 pessoas alocadas; 1 não: .*escolha o andar/.test(r.recado), r.recado);
    afirmar(r.equipe.filter((x) => x.dep === 'GRANDEZA' && /AUXILIAR/.test(x.funcao)).length === 2, 'aux. na separacao, com a funcao de origem');
    const c = ctx(m).cgConsumoEquip_(ctx(m).cgEquipe_(), ctx(m).cgEquipamentos_());
    afirmar(c.PALETEIRA.pessoas === 2, 'consome paleteira');
    r = acao(m, s, 'alocarLoteCarga', { itens: [{ pessoa: aux[0], destino: { dep: 'MIUDEZA', papel: 'SEPARADOR' } }] });
    afirmar(/0 pessoas alocadas; 1 não: .*já alocado/.test(r.recado), r.recado);
  });

  await caso('grade "Controle" (as colunas da planilha): colar várias linhas (número curto, box, carro, descrição, motorista, carregada, observação, horário), uma linha com erro não derruba as outras, editar uma célula, colar de novo não duplica', () => {
    const m = mundo(); const s = entrar(m, COORD, '1234');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T15:00:00', { '900001': { nome: 'ROTA NORTE TESTE', d: { GRANDEZA: ['0/10', '0/10'] } }, '900002': { GRANDEZA: ['X', 'X'] },
      '900003': { GRANDEZA: ['3/10', '0/10'] } }));
    let r = acao(m, s, 'carregamentoLoteCarga', { linhas: [
      { carga: '001', box: '5', veiculo: '46115', motorista: 'MOTORISTA TESTE A', carregada: 'NÃO', situacao: 'motorista a caminho', previsao: '17:30' },
      { carga: '900002', box: '7', veiculo: '46116', descricao: 'FPI-D-TESTE', carregada: 'SIM', situacao: 'JÁ NO BOX' },
      { carga: '900003', box: '99' },
      { carga: '777' }
    ] });
    afirmar(/2 linhas salvas, 2 com erro/.test(r.recado) && r.resultados[2].erro === 'Box de 1 a 26.' && /termina em 777/.test(r.resultados[3].erro), r.recado + ' ' + JSON.stringify(r.resultados));
    const por = () => { const o = {}; ctx(m).cgCarregamentos_().forEach((x) => { o[x.n] = x; }); return o; };
    let x = por();
    afirmar(x['900001'].box === 5 && x['900001'].veiculo === '46115' && x['900001'].descricao === 'ROTA NORTE TESTE' && x['900001'].previsao === '17:30' && x['900001'].situacao === 'MOTORISTA A CAMINHO' && x['900001'].etapa === 'BOX',
      'linha 1 (descricao do relatorio) ' + JSON.stringify(x['900001']).slice(0, 300));
    afirmar(x['900002'].etapa === 'CARREGADA' && x['900002'].descricao === 'FPI-D-TESTE' && x['900002'].carregadaPor === COORD, 'linha 2 carregada');
    // editar uma celula (so ela muda)
    r = acao(m, s, 'carregamentoLoteCarga', { linhas: [{ id: x['900001'].id, motorista: 'MOTORISTA TESTE B' }] });
    x = por();
    afirmar(r.recado === 'Salvo.' && x['900001'].motorista === 'MOTORISTA TESTE B' && x['900001'].box === 5 && x['900001'].veiculo === '46115', 'celula ' + JSON.stringify(x['900001']).slice(0, 200));
    // colar a mesma carga de novo: atualiza a linha aberta; "NÃO" reabre a carregada
    r = acao(m, s, 'carregamentoLoteCarga', { linhas: [{ carga: '900001', box: '6' }, { id: x['900002'].id, carregada: 'NÃO' }] });
    x = por();
    afirmar(ctx(m).cgCarregamentos_().filter((y) => y.n === '900001').length === 1 && x['900001'].box === 6 && x['900002'].etapa === 'BOX', 'upsert e reabrir ' + JSON.stringify(r.resultados));
    afirmar(/não existe mais/.test(acao(m, s, 'carregamentoLoteCarga', { linhas: [{ id: 'nada', box: 1 }] }).resultados[0].erro), 'id sumido');
    afirmar(/No máximo 300/.test(erroDe(() => acao(m, s, 'carregamentoLoteCarga', { linhas: Array.from({ length: 301 }, () => ({ carga: '1' })) }))), 'limite');
    afirmar(x['900001'].hist.map((h) => h[2]).join(' | ') === 'registrou no box 5 | editou | editou · box 6', 'historico ' + x['900001'].hist.map((h) => h[2]).join(' | '));
  });

  await caso('cadastros do pátio: motoristas (código, nome, placa), destinos, horários e observações; repetido recusado; a aba Cadastro da planilha antiga lida pelo conteúdo e importada junto (nunca grava nela)', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    let r = acao(m, s, 'cadastroCarga', { op: 'salvar', tipo: 'MOTORISTA', codigo: '900111', valor: 'Motorista Teste Um', placa: 'tst1a23' });
    afirmar(r.cadastro.motoristas[0].nome === 'MOTORISTA TESTE UM' && r.cadastro.motoristas[0].placa === 'TST1A23' && r.cadastro.motoristas[0].codigo === '900111', 'motorista');
    afirmar(/já está no cadastro/.test(erroDe(() => acao(m, s, 'cadastroCarga', { op: 'salvar', tipo: 'MOTORISTA', valor: 'motorista teste um' }))), 'repetido');
    acao(m, s, 'cadastroCarga', { op: 'salvar', tipo: 'DESTINO', valor: 'fpi-d-teste' });
    r = acao(m, s, 'cadastroCarga', { op: 'salvar', tipo: 'HORARIO', valor: '5:30' });
    afirmar(r.cadastro.horarios[0].valor === '05:30' && r.cadastro.destinos[0].valor === 'FPI-D-TESTE', 'horario e destino');
    afirmar(/escreva como 05:30/.test(erroDe(() => acao(m, s, 'cadastroCarga', { op: 'salvar', tipo: 'HORARIO', valor: 'cedo' }))), 'horario invalido');
    r = acao(m, s, 'cadastroCarga', { op: 'excluir', id: r.cadastro.horarios[0].id });
    afirmar(!r.cadastro.horarios.length, 'excluiu');
    r = acao(m, s, 'cadastroCarga', { op: 'situacoes', lista: 'JÁ NO BOX; carregando; Já no box; AGUARDANDO NOTA' });
    afirmar(ctx(m).cgSituacoesBox_().join('|') === 'JÁ NO BOX|CARREGANDO|AGUARDANDO NOTA|CARRO NO PATIO|MARCOU E NAO VEIO', 'situacoes ' + ctx(m).cgSituacoesBox_().join('|'));
    const c = ctx(m);
    const lm = c.cgLerMotorista_('144001 - MOTORISTA TESTE DOIS (ABC1D23)');
    afirmar(lm.codigo === '144001' && lm.nome === 'MOTORISTA TESTE DOIS' && lm.placa === 'ABC1D23' && c.cgLerMotorista_('SO O NOME').nome === 'SO O NOME', 'ler motorista');
    const cad = c.cgInterpretarCadastro_([
      ['', 'ROTA TESTE A', 'AMANHA CEDO', '0.0208333333333333'],
      ['900201 - MOTORISTA TESTE TRES (TST3C33)', 'ROTA TESTE B', 'JÁ NO BOX', '0.0833333333333333'],
      ['900202 - MOTORISTA TESTE QUATRO', 'ROTA TESTE C', 'NOVA SITUACAO', '0.645833333333333']
    ]);
    afirmar(cad.motoristas.length === 2 && cad.motoristas[1].placa === '' && cad.destinos.join() === 'ROTA TESTE A,ROTA TESTE B,ROTA TESTE C' && cad.horarios.join() === '00:30,02:00,15:30' &&
      cad.situacoes.join() === 'AMANHA CEDO,JÁ NO BOX,NOVA SITUACAO', 'cadastro lido ' + JSON.stringify(cad));
    // importar da planilha antiga com a aba Cadastro
    const pl = m.novaPlanilha('Controle de Boxes (teste)');
    const Aba = Object.getPrototypeOf(pl.abas[0]).constructor;
    pl.abas[0].nome = 'Controle';
    [['CARGA', 'COMPLEMENTO', 'PRIORIDADE', 'BOX', 'CARRO', 'DESCRIÇÃO', 'MOTORISTA', 'CARREGADA?', 'OBSERVAÇÃO', '', 'HORÁRIO CHEGADA'],
      ['900301', '', '', '4', '46200', 'ROTA TESTE A', '900201 - MOTORISTA TESTE TRES (TST3C33)', '', 'NOVA SITUACAO', '', '02:00']].forEach((l, i) => { pl.abas[0].dados[i] = l; });
    const cadAba = new Aba(pl, 'Cadastro', 100, 10); pl.abas.push(cadAba);
    [['', 'ROTA TESTE A', 'AMANHA CEDO', '00:30'], ['900201 - MOTORISTA TESTE TRES (TST3C33)', 'ROTA TESTE B', 'NOVA SITUACAO', '02:00'], ['900202 - MOTORISTA TESTE QUATRO', 'FPI-D-TESTE', 'JÁ NO BOX', '15:30']]
      .forEach((l, i) => { cadAba.dados[i] = l; });
    const antes = JSON.stringify(pl.abas.map((a) => a.dados));
    r = acao(m, s, 'importarBoxesCarga', { link: 'https://docs.google.com/spreadsheets/d/' + pl.id + '/edit' });
    afirmar(/1 carga importada/.test(r.recado) && /itens no cadastro/.test(r.recado), r.recado);
    const cg = c.cgCadastro_();
    afirmar(cg.motoristas.length === 3 && cg.destinos.length === 3 && cg.horarios.map((h) => h.valor).join() === '00:30,02:00,15:30', 'importou o cadastro (sem repetir o destino ja cadastrado) ' + JSON.stringify(cg).slice(0, 300));
    afirmar(c.cgSituacoesBox_().indexOf('NOVA SITUACAO') !== -1, 'a observacao nova entrou na lista');
    const x = c.cgCarregamentos_().find((y) => y.n === '900301');
    afirmar(x && x.descricao === 'ROTA TESTE A' && x.previsao === '02:00' && x.veiculo === '46200' && x.situacao === 'NOVA SITUACAO' && /MOTORISTA TESTE TRES/.test(x.motorista), 'linha importada ' + JSON.stringify(x).slice(0, 300));
    afirmar(JSON.stringify(pl.abas.map((a) => a.dados)) === antes, 'a planilha nao foi tocada');
  });

  await caso('migração 8.15 → 8.16: o check-out do CD inteiro sai, entram os da Miudeza (8) e do Nobre (10); as tabelas novas; o painel da carga desligado pelo administrador não volta a ligar', () => {
    const m = mundo(); const c = ctx(m);
    const banco = m.planilhas.get(c.prop('ID_BANCO', ''));
    ['CARGA_PESSOAS', 'CARGA_ALOCACOES', 'CARGA_CADASTRO'].forEach((t) => { banco.abas = banco.abas.filter((a) => a.nome !== t); });
    const abaEq = banco.abas.find((a) => a.nome === 'CARGA_EQUIPAMENTOS');
    const cab = abaEq.dados[0];
    abaEq.dados = abaEq.dados.filter((l, i) => !i || (l && l[cab.indexOf('TIPO')] !== 'CHECKOUT'));
    m.cache.clear();
    ctx(m).inserirVarios('CARGA_EQUIPAMENTOS', Array.from({ length: 12 }, (x, i) => ({ TIPO: 'CHECKOUT', DEPOSITO: '', NUMERO: String(i + 1), ESTADO: i === 2 ? 'MANUTENCAO' : 'LIVRE' })), 'teste');
    const adm = entrar(m, DONO, '4321');
    acao(m, adm, 'alterarPainel', { codigo: adm.f, painel: 'carga', estado: 'DESATIVADO' });
    m.props.script.VERSAO_ESQUEMA = '8.13';          // como se a 8.14 ainda estivesse pendente
    m.cache.clear();
    entrar(m, DONO, '4321');
    afirmar(m.props.script.VERSAO_ESQUEMA === '8.16', 'versao ' + m.props.script.VERSAO_ESQUEMA);
    const chk = ctx(m).cgEquipamentos_().filter((e) => e.tipo === 'CHECKOUT');
    afirmar(chk.length === 18 && chk.filter((e) => e.dep === 'MIUDEZA').length === 8 && chk.filter((e) => e.dep === 'NOBRE').length === 10 && !chk.some((e) => !e.dep), 'check-outs ' + chk.length);
    afirmar(ctx(m).listar('CARGA_EQUIPAMENTOS').filter((r) => r.TIPO === 'CHECKOUT' && !r.DEPOSITO).length === 0, 'o do CD inteiro saiu');
    ['CARGA_PESSOAS', 'CARGA_ALOCACOES', 'CARGA_CADASTRO'].forEach((t) => afirmar(banco.abas.some((a) => a.nome === t), 'tabela ' + t));
    afirmar(banco.abas.find((a) => a.nome === 'CARGA_CARREGAMENTO').dados[0].indexOf('DESCRICAO') !== -1, 'coluna DESCRICAO');
    const prm = {};
    ctx(m).listar('PARAMETROS').forEach((r) => { prm[r.CHAVE] = (prm[r.CHAVE] || 0) + 1; });
    afirmar(prm.CARGA_BOXES_ORDEM === 1 && prm.CARGA_BOXES_LOJA === 1, 'parametros novos uma vez: ' + prm.CARGA_BOXES_ORDEM + ' ' + prm.CARGA_BOXES_LOJA);
    afirmar(ctx(m).parametro('CARGA_BOXES_ORDEM', '') === '26-1' && ctx(m).parametro('CARGA_BOXES_LOJA', '') === '1-2 = Feira de Santana; 3 = Vitória da Conquista', 'valores padrao');
    const f = ctx(m).listar('FILIAIS').find((x) => x.PRINCIPAL === 'SIM');
    afirmar(JSON.parse(f.PAINEIS).carga === 'DESATIVADO', 'o painel desligado ficou desligado: ' + f.PAINEIS);
    // de novo: nada muda
    m.cache.clear(); m.props.script.VERSAO_ESQUEMA = '8.15'; entrar(m, DONO, '4321');
    afirmar(ctx(m).cgEquipamentos_().filter((e) => e.tipo === 'CHECKOUT').length === 18, 'idempotente');
  });

  await caso('quadro das docas e lojas: ordem 26→1, boxes 1-2 da loja de Feira e 3 da de Vitória da Conquista, a carga da loja entra sozinha no box dela, sem os avisos do pátio, e continua na sequência', () => {
    const m = mundo(); const s = entrar(m, GERENTE, '5555');
    acao(m, s, 'enviarSituacaoCarga', envio('2026-11-25T15:00:00', {
      '762882': { box: '1', veiculo: '', nome: '762787/762788/762789/762790', d: { NOBRE: ['X', 'X'] } },
      '762883': { box: '1', veiculo: '', nome: '762791/762792', d: { MIUDEZA: ['1/2', '0/2'] } },
      '763384': { box: '3', veiculo: '', nome: 'C87-W-XX-VDC/RETIRA-OO-OOO-PRI', d: { MIUDEZA: ['0/1', '0/1'] } },
      '900011': { box: '12', d: { GRANDEZA: ['X', 'X'] } },
      '900012': { box: '14', d: { GRANDEZA: ['2/10', '0/10'] } } }));
    let p = tela(m, s).patio;
    // a ordem das docas como no CD: 26 ... 1
    afirmar(p.ordem.length === 26 && p.ordem[0] === 26 && p.ordem[25] === 1 && p.ordemTexto === '26-1', 'ordem ' + p.ordem.join());
    afirmar(JSON.stringify(p.lojas) === JSON.stringify([{ box: 1, nome: 'Feira de Santana' }, { box: 2, nome: 'Feira de Santana' }, { box: 3, nome: 'Vitória da Conquista' }]) &&
      p.lojasTexto === '1-2 = Feira de Santana; 3 = Vitória da Conquista', 'lojas ' + JSON.stringify(p.lojas));
    // a carga da loja entra sozinha no box dela, sem registro e sem veiculo
    afirmar(p.mapa[0].loja === 'Feira de Santana' && p.mapa[1].loja === 'Feira de Santana' && p.mapa[2].loja === 'Vitória da Conquista' && !p.mapa[3].loja, 'loja do box');
    afirmar(p.mapa[0].itens.map((x) => x.n).join() === '762882,762883' && p.mapa[0].itens.every((x) => x.virtual && !x.id && x.loja === 'Feira de Santana' && !x.veiculo && x.pdf) &&
      p.mapa[0].estado === 'RESERVADO' && p.mapa[2].itens[0].n === '763384' && p.mapa[2].itens[0].loja === 'Vitória da Conquista' && p.mapa[1].estado === 'LIVRE', 'cargas da loja no box ' + JSON.stringify(p.mapa[0]).slice(0, 300));
    afirmar(p.lojaPorCarga['762882'] === 'Feira de Santana' && p.lojaPorCarga['763384'] === 'Vitória da Conquista' && !p.lojaPorCarga['900011'] && p.porCarga['762882'].loja === 'Feira de Santana' && p.porCarga['762882'].box === 1, 'loja por carga');
    // sem "pronta sem veiculo", "sem registro no patio" nem "box diferente" para as da loja
    afirmar(p.semRegistro.map((x) => x.n).sort().join() === '900011,900012', 'sem registro so as de fora ' + p.semRegistro.map((x) => x.n));
    afirmar(p.alertas.map((a) => a.tipo + ':' + a.carga).join() === 'prontaSemBox:900011', 'alertas ' + p.alertas.map((a) => a.tipo + ':' + a.carga));
    // continuam nos indicadores e na sequencia
    const d = tela(m, s);
    afirmar(d.sequencia.itens.some((x) => x.n === '762882') && d.sequencia.itens.some((x) => x.n === '763384') && d.snapshot.cargas.length === 5, 'na sequencia e no relatorio');
    // a carga de fora no box de uma loja: aviso; a da loja registrada em outro box: vale o registro, sem "box diferente"
    let r = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '900012', box: 2, veiculo: 'TESTE12', tipo: 'TRUCK' });
    afirmar(r.patio.alertas.some((a) => a.tipo === 'boxDaLoja' && a.box === 2 && a.carga === '900012' && /Loja Feira de Santana/.test(a.texto)), 'aviso de carga de fora no box da loja');
    r = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '762883', box: 5 });
    afirmar(r.patio.mapa[4].itens[0].n === '762883' && r.patio.mapa[4].itens[0].loja === 'Feira de Santana' && !r.patio.mapa[4].itens[0].virtual &&
      r.patio.mapa[0].itens.map((x) => x.n).join() === '762882' && !r.patio.alertas.some((a) => a.carga === '762883'), 'registro vale ' + JSON.stringify(r.patio.alertas));
    // "Carregada" na carga da loja: cria o registro ja carregado e o box fica livre
    r = acao(m, s, 'carregamentoCarga', { op: 'salvar', carga: '763384', box: 3, carregada: 'SIM' });
    afirmar(r.patio.mapa[2].estado === 'LIVRE' && !r.patio.mapa[2].itens.length && r.patio.carregadas.some((x) => x.n === '763384' && x.loja === 'Vitória da Conquista'), 'loja carregada');
    // os ajustes: ordem e lojas (com validacao); "nenhum" desliga
    afirmar(/Ordem dos boxes/.test(erroDe(() => acao(m, s, 'parametrosCarga', { ordemBoxes: '1-30' }))) && /Boxes das lojas/.test(erroDe(() => acao(m, s, 'parametrosCarga', { lojas: 'box um' }))) &&
      /Boxes das lojas/.test(erroDe(() => acao(m, s, 'parametrosCarga', { lojas: '1 = A; 1 = B' }))), 'validacao');
    acao(m, s, 'parametrosCarga', { ordemBoxes: '1-10, 12', lojas: '4 = Loja da Matriz; 6-7 = Loja de Alagoinhas' });
    p = tela(m, s).patio;
    afirmar(p.ordem.join() === '1,2,3,4,5,6,7,8,9,10,12' && p.lojasTexto === '4 = Matriz; 6-7 = Alagoinhas' && p.mapa[0].itens.length === 0 && p.semRegistro.some((x) => x.n === '762882'), 'ajustes ' + p.lojasTexto + ' ' + p.ordem);
    acao(m, s, 'parametrosCarga', { lojas: 'nenhum' });
    p = tela(m, s).patio;
    afirmar(!p.lojas.length && p.lojasTexto === 'nenhum' && !Object.keys(p.lojaPorCarga).length && p.alertas.some((a) => a.tipo === 'prontaSemBox' && a.carga === '762882'), 'sem lojas');
    // pura: a funcao do texto
    const c = ctx(m);
    afirmar(JSON.stringify(c.cgLerBoxesLoja_('1-2 = Feira de Santana; 3 = Vitória da Conquista', 26)) === JSON.stringify({ 1: 'Feira de Santana', 2: 'Feira de Santana', 3: 'Vitória da Conquista' }) &&
      c.cgLerBoxesLoja_('30 = X', 26) === null && c.cgTextoBoxesLoja_({ 1: 'A', 2: 'A', 5: 'A', 3: 'B' }) === '1-2, 5 = A; 3 = B', 'texto das lojas');
  });

  const falhas = resultados.filter((x) => !x).length;
  console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
  process.exit(falhas ? 1 : 0);
}
rodar().catch((e) => { console.error(e); process.exit(2); });
