#!/usr/bin/env node
/*
 * TESTES DA ASSIDUIDADE — datas repetidas e contas erradas.
 *
 *   node testes/assiduidade.js [pasta-do-GSL]
 *
 * Roda o Dados.gs de verdade no emulador (sem navegador), com folhas do RH
 * montadas para cada caso que ja produziu "data repetida" no Periodo:
 *   1. folhas que se sobrepoem e reimportacao;
 *   2. matricula gravada como numero por versao antiga ao lado da nova em texto;
 *   3. a mesma pessoa em dois blocos da folha (mudou de turno no mes);
 *   4. modelo fixo de 31 colunas num mes de 30 dias;
 *   5. rotulo antigo de competencia ('08/2025' x '2025-08').
 */
'use strict';
process.env.TZ = 'America/Bahia';
const path = require('path');
const { Mundo, novaExecucao } = require('./emulador/gas.js');
const { folhaRH } = require('./emulador/folha-rh.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const DONO = 'dono@bartofil.com.br';
const resultados = [];

function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }
const repetidas = (l) => l.filter((d, i) => l.indexOf(d) !== i);
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function novoMundo() {
  const mundo = new Mundo({ dono: DONO });
  const c = novaExecucao(mundo, PASTA, { contaGoogle: DONO }, { apagarComentarios: 'nenhum' });
  c._porta = true;
  c.instalar(DONO);
  return mundo;
}
/* Cada chamada e uma execucao nova, como no Google. */
function acao(mundo, fn, params) {
  const ctx = novaExecucao(mundo, PASTA, { contaGoogle: DONO }, { apagarComentarios: 'nenhum' });
  ctx._porta = true;
  const admin = { email: DONO, perfil: 'ADMIN', turno: '', permissoes: ctx.permissoesDe('ADMIN') };
  return ctx[fn](admin, params || {});
}
function aba(mundo, nome) { return mundo.planilhas.get(mundo.props.script.ID_BANCO).abas.find((a) => a.nome === nome); }
function linhas(mundo, nome) {
  const a = aba(mundo, nome);
  const cab = (a.dados[0] || []).map(String);
  const out = [];
  for (let l = 1; l < a.dados.length; l++) {
    const r = a.dados[l];
    if (!r || !r.some((v) => v !== '' && v !== undefined)) continue;
    const o = {}; cab.forEach((c, j) => { o[c] = r[j] === undefined ? '' : r[j]; }); out.push(o);
  }
  return out;
}

function caso(nome, fn) {
  try { fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + e.message); }
}

console.log('Assiduidade em ' + PASTA + '\n');

caso('folhas sobrepostas (18-20/08 nas duas) e reimportacao: cada data uma vez', () => {
  const m = novoMundo();
  const pessoas = [
    { mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-05': '16', '2025-08-06': '1', '2025-08-19': '16' } },
    { mat: '100555', nome: 'BRUNO LIMA', turno: 'B', dias: { '2025-08-12': '28', '2025-08-19': '1', '2025-08-25': '16' } }
  ];
  const a = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: folhaRH(m, 'F08', { inicio: [2025, 7, 21], dias: 31, pessoas }), aba: 'FOLHA DE PONTO' });
  const b = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-09', link: folhaRH(m, 'F09', { inicio: [2025, 8, 18], dias: 34, pessoas, matComoNumero: true }), aba: 'FOLHA DE PONTO' });
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  acao(m, 'acaoImportarCompetencia', { id: b.id });
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  const r = acao(m, 'acaoPeriodo', { de: '2025-08-01', ate: '2025-08-31', tipo: 'TODAS' });
  afirmar(r.registros === 6, 'registros 6, veio ' + r.registros);
  r.lista.forEach((p) => afirmar(!repetidas(p.datas.map((x) => x.data)).length, p.nome + ': ' + p.datas.map((x) => x.data).join(', ')));
});

caso('matricula antiga gravada como numero (12345) + nova em texto (012345): uma pessoa so', () => {
  const m = novoMundo();
  const pessoas = [
    { mat: '012345', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-19': '16', '2025-08-25': '1', '2025-08-26': '1' } },
    { mat: '100555', nome: 'BRUNO LIMA', turno: 'B', dias: { '2025-08-19': '16' } }
  ];
  const set = folhaRH(m, 'F09', { inicio: [2025, 8, 18], dias: 34, pessoas, matComoTexto: true });
  acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: 'https://docs.google.com/spreadsheets/d/arquivada/edit', aba: 'FOLHA DE PONTO', situacao: 'Fechada' });
  const b = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-09', link: set, aba: 'FOLHA DE PONTO' });
  // linhas gravadas por uma versao antiga (antes do formato texto): MATRICULA numero, DATA objeto Date
  const fato = aba(m, 'FATO_ASSIDUIDADE'); const cab = fato.dados[0]; const col = (n) => cab.indexOf(n);
  let l = 1;
  const legado = (d, mat, turno, cod, cat) => {
    const [y, mo, dd] = d.split('-').map(Number); const row = new Array(cab.length).fill('');
    row[col('ID')] = 'legado-' + l; row[col('DATA')] = new Date(y, mo - 1, dd); row[col('COMPETENCIA')] = '2025-08';
    row[col('MATRICULA')] = mat; row[col('TURNO')] = turno; row[col('CODIGO')] = cod; row[col('CATEGORIA')] = cat;
    row[col('AUSENCIA')] = 'Sim'; row[col('CRIADO_EM')] = '2025-08-21 06:00:00'; row[col('EXCLUIDO')] = 'NAO';
    fato.dados[l++] = row;
  };
  legado('2025-08-12', 12345, 'A', '16', 'Falta injustificada');
  legado('2025-08-19', 12345, 'A', '16', 'Falta injustificada');
  legado('2025-08-19', 100555, 'B', '16', 'Falta injustificada');
  const colab = aba(m, 'COLABORADORES'); const cc = colab.dados[0];
  const rc = new Array(cc.length).fill(''); rc[cc.indexOf('ID')] = 'COL-legado'; rc[cc.indexOf('MATRICULA')] = 12345;
  rc[cc.indexOf('NOME')] = 'ANA SOUZA'; rc[cc.indexOf('TURNO')] = 'A'; rc[cc.indexOf('EXCLUIDO')] = 'NAO'; colab.dados[1] = rc;
  m.cache.clear();
  acao(m, 'acaoImportarCompetencia', { id: b.id });

  const r = acao(m, 'acaoPeriodo', { de: '2025-08-01', ate: '2025-09-20', tipo: 'TODAS' });
  const anas = r.lista.filter((p) => p.nome === 'ANA SOUZA');
  afirmar(anas.length === 1, 'ANA numa linha so, vieram ' + anas.length);
  afirmar(anas[0].datas.map((x) => x.data).join(',') === '12/08/2025,19/08/2025,25/08/2025,26/08/2025', 'datas da ANA: ' + anas[0].datas.map((x) => x.data).join(','));
  afirmar(anas[0].matricula === '012345', 'matricula exibida com o zero: ' + anas[0].matricula);
  afirmar(r.registros === 5 && r.colaboradores === 2, 'registros 5 / pessoas 2, veio ' + r.registros + '/' + r.colaboradores);
  afirmar(r.linhaDoTempo.find((x) => x.data === '2025-08-19').total === 2, 'dia 19/08 conta 2');
  const nomes = linhas(m, 'COLABORADORES').map((c) => c.NOME).filter((n) => n === 'ANA SOUZA');
  afirmar(nomes.length === 1, 'ANA uma vez no cadastro de colaboradores, veio ' + nomes.length);
  for (const mat of ['012345', '12345']) {
    const f = acao(m, 'acaoFichaColaborador', { matricula: mat });
    afirmar(f.ausencias.length === 4, 'ficha ' + mat + ' com as 4 ausencias: ' + f.ausencias.map((x) => x.data).join(', '));
  }
});

caso('a mesma pessoa em dois blocos da folha (mudou de turno): um lancamento por dia, falta preservada', () => {
  const m = novoMundo();
  const diasA = {}, diasB = {};
  for (let i = 0; i < 31; i++) {
    const d = new Date(2025, 6, 21 + i); const k = iso(d);
    if (d < new Date(2025, 7, 6)) { diasA[k] = 'A'; diasB[k] = '13'; } else { diasA[k] = '13'; diasB[k] = 'B'; }
  }
  diasA['2025-08-04'] = '16';        // falta quando ainda era do turno A
  diasB['2025-08-12'] = '1';         // atestado ja no turno B
  const todos = Object.keys(diasA);
  const url = folhaRH(m, 'F08', { inicio: [2025, 7, 21], dias: 31, blocos: [
    { pessoas: [{ mat: '100777', nome: 'CARLA DIAS', turno: 'A', dias: diasA, soDias: todos },
                { mat: '100555', nome: 'BRUNO LIMA', turno: 'A', dias: { '2025-08-04': '16' }, soDias: todos }] },
    { pessoas: [{ mat: '100777', nome: 'CARLA DIAS', turno: 'B', dias: diasB, soDias: todos }] }
  ] });
  const a = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: url, aba: 'FOLHA DE PONTO' });
  const imp = acao(m, 'acaoImportarCompetencia', { id: a.id });
  afirmar(/mesmo dia/.test(imp.aviso || ''), 'a importacao avisa: ' + imp.aviso);
  const fato = linhas(m, 'FATO_ASSIDUIDADE').filter((f) => String(f.MATRICULA) === '100777');
  afirmar(fato.length === 31, 'CARLA com 31 linhas na FATO (um por dia), veio ' + fato.length);
  const p = acao(m, 'acaoPeriodo', { de: '2025-07-21', ate: '2025-08-20', tipo: 'TODAS' });
  const carla = p.lista.find((x) => x.matricula === '100777');
  afirmar(carla && carla.datas.map((x) => x.data).join(',') === '04/08/2025,12/08/2025', 'CARLA com 04/08 e 12/08: ' + (carla && carla.datas.map((x) => x.data).join(',')));
  afirmar(p.registros === 3, 'registros 3, veio ' + p.registros);
  const c1 = acao(m, 'acaoColaboradores', { competencia: '2025-08' }).lista.find((x) => x.matricula === '100777');
  afirmar(c1.registros === 31 && c1.ausencias === 2, 'Colaboradores CARLA 31/2, veio ' + c1.registros + '/' + c1.ausencias);
  acao(m, 'acaoReclassificar', {});
  const c2 = acao(m, 'acaoColaboradores', { competencia: '2025-08' }).lista.find((x) => x.matricula === '100777');
  afirmar(c2.registros === 31 && c2.ausencias === 2, 'depois de Reclassificar continua 31/2, veio ' + c2.registros + '/' + c2.ausencias);
});

caso('modelo de 31 colunas num mes de 30 dias: a coluna "31" nao vira outro 01/10', () => {
  const m = novoMundo();
  const cabDias = [];
  for (let d = 21; d <= 31; d++) cabDias.push(d);
  for (let d = 1; d <= 20; d++) cabDias.push(d);
  const url = folhaRH(m, 'F10', { inicio: [2025, 9, 21], cabDias, pessoas: [{ mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-10-01': '16' } }] });
  const a = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-10', link: url, aba: 'FOLHA DE PONTO' });
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  const dia1 = linhas(m, 'FATO_ASSIDUIDADE').filter((x) => x.DATA === '2025-10-01');
  afirmar(dia1.length === 1 && String(dia1[0].CODIGO) === '16', '01/10 uma vez, com a falta: ' + dia1.map((x) => x.CODIGO).join(','));
  const datas = linhas(m, 'FATO_ASSIDUIDADE').map((x) => x.DATA);
  afirmar(!repetidas(datas).length, 'nenhuma data repetida na FATO: ' + repetidas(datas).join(','));
  const c = acao(m, 'acaoColaboradores', { competencia: '2025-10' }).lista[0];
  afirmar(c.faltasInjustificadas === 1, 'uma falta, veio ' + c.faltasInjustificadas);
});

caso('rotulo antigo de competencia ("08/2025") e o mesmo mes que "2025-08"', () => {
  const m = novoMundo();
  const url = folhaRH(m, 'F08', { inicio: [2025, 7, 21], dias: 31, pessoas: [{ mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-05': '16' } }] });
  const a = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: url, aba: 'FOLHA DE PONTO' });
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  for (const t of ['ARQUIVOS_RH', 'FATO_ASSIDUIDADE', 'AGR_COLAB', 'PAINEL']) {      // como uma versao antiga gravava
    const ab = aba(m, t); const j = ab.dados[0].indexOf('COMPETENCIA');
    for (let l = 1; l < ab.dados.length; l++) if (ab.dados[l] && ab.dados[l][j] === '2025-08') ab.dados[l][j] = '08/2025';
  }
  m.cache.clear();
  let recusou = '';
  try { acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: url, aba: 'FOLHA DE PONTO' }); }
  catch (e) { recusou = e.message; }
  afirmar(/já está cadastrada/.test(recusou), 'segundo cadastro do mesmo mes recusado: ' + (recusou || 'ACEITO'));
  const d = acao(m, 'dadosAssiduidade', {});
  afirmar(d.competencias.length === 1, 'seletor com um mes so: ' + d.competencias.map((c) => c.competencia).join(', '));
});

caso('codigo marcado como Ignorar + Reclassificar: mesma conta de uma importacao nova', () => {
  const m = novoMundo();
  const dias = {};
  for (let i = 0; i < 31; i++) { const d = new Date(2025, 6, 21 + i); if (d.getDay() === 3) dias[iso(d)] = 'X'; }   // anotacao do RH as quartas
  dias['2025-08-05'] = '16';
  const url = folhaRH(m, 'F08', { inicio: [2025, 7, 21], dias: 31, pessoas: [
    { mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias }, { mat: '100555', nome: 'BRUNO LIMA', turno: 'B', dias }] });
  const a = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: url, aba: 'FOLHA DE PONTO' });
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  acao(m, 'acaoSalvarDePara', { codigo: 'X', descricao: 'Anotacao do RH', categoria: 'Ignorar' });
  acao(m, 'acaoReclassificar', {});
  const depois = acao(m, 'dadosAssiduidade', { competencia: '2025-08' }).kpis;
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  const novo = acao(m, 'dadosAssiduidade', { competencia: '2025-08' }).kpis;
  afirmar(depois.registros === novo.registros && depois.taxa === novo.taxa,
    'Reclassificar ' + depois.registros + ' / ' + depois.taxa + '% x importacao nova ' + novo.registros + ' / ' + novo.taxa + '%');
});

caso('Atualizar dados com o mes novo ainda vazio: atualiza o outro e nao da erro', () => {
  const m = novoMundo();
  const pessoas = [{ mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-05': '16' } }];
  const ago = folhaRH(m, 'F08', { inicio: [2025, 7, 21], dias: 31, pessoas });
  const set = folhaRH(m, 'F09', { inicio: [2025, 8, 21], dias: 31, pessoas: [] });          // mes novo: folha sem ninguem ainda
  const a = acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-08', link: ago, aba: 'FOLHA DE PONTO' });
  acao(m, 'acaoSalvarArquivoRH', { competencia: '2025-09', link: set, aba: 'FOLHA DE PONTO' });
  acao(m, 'acaoImportarCompetencia', { id: a.id });
  const r = acao(m, 'acaoAtualizarRH', {});
  afirmar(r.ok && r.feitas.length === 1 && r.feitas[0].competencia === '2025-08', 'agosto atualizado: ' + JSON.stringify(r).slice(0, 200));
  afirmar(/sem lançamentos/.test(r.aviso) && (r.vazias || []).indexOf('2025-09') >= 0, 'avisa que setembro ainda esta vazio: ' + r.aviso);
  afirmar(!linhas(m, 'LOG').some((l) => l.ACAO === 'ERRO' && /IMPORTACAO/.test(String(l.TABELA))), 'nenhum ERRO de importacao no LOG');
  const d = acao(m, 'dadosAssiduidade', { competencia: '2025-09' });
  afirmar(d.semDados && (d.competencias || []).length === 2, 'mes vazio mostra "sem dados" com o seletor dos dois meses');
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
