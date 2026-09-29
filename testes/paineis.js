#!/usr/bin/env node
/*
 * TESTES DOS PAINEIS (NOBREAKS, LIMPEZA, ESTOQUE), FILIAIS E CONFIGURACAO.
 *
 *   node testes/paineis.js [pasta-do-GSL]
 *
 * Um caso por achado da segunda revisao da 4.2.2. Tudo pelas portas
 * publicas (entrar -> carregarTela / executarAcao), como a tela faz.
 */
'use strict';
process.env.TZ = 'America/Bahia';
const path = require('path');
const { Mundo, novaExecucao, chamarPeloNavegador } = require('./emulador/gas.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const OP = { apagarComentarios: 'nenhum' };
const DONO = 'dono@bartofil.com.br';
const GERENTE = 'joao.lima@bartofil.com.br';
const COORD = 'maria.souza@bartofil.com.br';
const resultados = [];
function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }

function ctx(m, conta) { const c = novaExecucao(m, PASTA, { contaGoogle: conta || DONO }, OP); c._porta = true; return c; }
function chamar(m, conta, fn, ...args) { return chamarPeloNavegador(m, PASTA, { contaGoogle: conta }, fn, args, OP); }
function codigoDoEmail(m, email) {
  const x = m.emails.filter((e) => e.to === email && /código de primeiro acesso/i.test(e.subject)).pop();
  return x ? (x.subject.match(/(\d{6})\s*$/) || [])[1] : '';
}
/* Entra como a pessoa (a conta Google e a propria: nao pede codigo). */
function entrar(m, email, pin) {
  let r = JSON.parse(chamar(m, email, 'entrar', email, pin, '', '', '').valor);
  if (r.pedirCodigo) r = JSON.parse(chamar(m, email, 'entrar', email, pin, pin, '', codigoDoEmail(m, email)).valor);
  else if (r.criarPin) r = JSON.parse(chamar(m, email, 'entrar', email, pin, pin, '', '').valor);
  if (!r.token) throw new Error('entrar ' + email + ': ' + JSON.stringify(r).slice(0, 300));
  return { t: r.token, f: r.filial.codigo, email };
}
function mundo() {
  const m = new Mundo({ dono: DONO });
  ctx(m).instalar(DONO);
  const c = ctx(m);
  const admin = { email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') };
  c.acaoSalvarUsuario(admin, { email: GERENTE, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' });
  ctx(m).acaoSalvarUsuario(admin, { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
  return m;
}
function tela(m, s, id, params) {
  const r = chamar(m, s.email, 'carregarTela', { t: s.t, f: s.f }, id, params || {});
  if (!r.ok) throw new Error('tela ' + id + ': ' + r.erro.message);
  const x = JSON.parse(r.valor);
  if (x && x.ok === false) throw new Error('tela ' + id + ': ' + x.erro);
  return x.dados;
}
function acao(m, s, nome, params) {
  const r = chamar(m, s.email, 'executarAcao', { t: s.t, f: s.f }, nome, params || {});
  if (!r.ok) throw new Error(nome + ': ' + r.erro.message);
  const x = JSON.parse(r.valor);
  if (x && x.ok === false) throw new Error(x.erro);
  return x;
}
function erroDe(fn) { try { fn(); return ''; } catch (e) { return e.message; } }

/* Planilha antiga em memoria: { nomeDaAba: [linha0, linha1, ...] } (linhas podem ter buracos). */
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

function caso(nome, fn) {
  try { fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + e.message); }
}

console.log('Paineis em ' + PASTA + '\n');

/* ------------------------------------------------------------------ */
/* NOBREAKS                                                            */
/* ------------------------------------------------------------------ */

caso('nobreak: potencia "7.500" VA e sete mil e quinhentos, nao 7,5', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const nb = tela(m, s, 'nobreaks').equipamentos[0];
  acao(m, s, 'salvarNobreak', { id: nb.id, codigo: nb.codigo, modelo: nb.modelo, local: nb.local, potencia: '7.500', tensaoEntrada: '220', tensaoSaida: '120' });
  const depois = tela(m, s, 'nobreaks').equipamentos.find((e) => e.id === nb.id);
  afirmar(depois.potencia === 7500, 'potencia ' + depois.potencia);
});

caso('nobreak: modulo em "Ver" nao cadastra, edita nem remove equipamento', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const reg = ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === GERENTE);
  acao(m, adm, 'definirModuloPessoa', { id: reg.ID, modulo: 'nobreaks', modo: 'VER' });
  const ger = entrar(m, GERENTE, '5555');
  const d = tela(m, ger, 'nobreaks');
  afirmar(!d.permissoes.cadastrar && !d.permissoes.lancar, 'permissoes ' + JSON.stringify(d.permissoes));
  const nb = d.equipamentos[0];
  afirmar(erroDe(() => acao(m, ger, 'salvarNobreak', { id: nb.id, codigo: nb.codigo, potencia: '3000', ativo: false })), 'salvar recusado');
  afirmar(erroDe(() => acao(m, ger, 'excluirNobreak', { id: nb.id })), 'excluir recusado');
  afirmar(tela(m, adm, 'nobreaks').equipamentos.find((e) => e.id === nb.id).ativo, 'continua ativo');
});

caso('nobreak: hora "8h" vira 08:00 e a ultima leitura do dia e a das 14:00', () => {
  const m = mundo(); const s = entrar(m, COORD, '1234');
  const nb = tela(m, s, 'nobreaks').equipamentos[0].codigo;
  acao(m, s, 'lancarLeituras', { nobreak: nb, leituras: [
    { data: '2026-09-29', leitura: 1, hora: '8h', vi: 221, ii: 10, pi: 3800, vo: 120, io: 20, po: 6800, ocorrencia: '' },
    { data: '2026-09-29', leitura: 2, hora: '14:00', vi: 221, ii: 10, pi: 3800, vo: 120, io: 20, po: 2000, ocorrencia: '' }
  ] });
  const minhas = tela(m, s, 'nobreaks').leituras.filter((l) => l.nobreak === nb && l.data === '2026-09-29');
  afirmar(minhas[0].hora === '08:00', 'hora ' + minhas[0].hora);
  afirmar(minhas[minhas.length - 1].hora === '14:00' && minhas[minhas.length - 1].leitura === 2, 'ultima: ' + JSON.stringify(minhas.map((l) => [l.leitura, l.hora])));
});

caso('nobreak: planilha antiga com o mesmo codigo duas vezes importa inteira (cadastro + lancamentos)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = planilhaAntiga(m, 'Monitoramento_Nobreaks_Bartofil', {
    'Cadastro': [null, null, null, null,
      ['NOBREAK', 'MODELO', 'LOCAL', 'POTÊNCIA (VA)', 'TENSÃO NOMINAL ENTRADA (V)', 'TENSÃO NOMINAL SAÍDA (V)'],
      ['NB 09', '', '', '', 220, 120],
      ['NB-09', 'SMS 3kVA', 'CPD', 3000, 220, 120]],
    'Lançamentos': [null, null, null,
      ['DATA', 'HORA', 'LEITURA', 'NOBREAK', 'VI (V)', 'II (A)', 'PI (VA)', 'VO (V)', 'IO (A)', 'PO (VA)', 'OCORRÊNCIAS'],
      [new m.DataDoScript(2026, 8, 28), '08:00', 1, 'NB-09', 220, 5, 1100, 120, 8, 960, '']]
  });
  acao(m, s, 'importarNobreaks', { link });
  const d = tela(m, s, 'nobreaks');
  const nb = d.equipamentos.filter((e) => e.codigo === 'NB-09');
  afirmar(nb.length === 1 && nb[0].modelo === 'SMS 3kVA' && nb[0].potencia === 3000, 'equipamento: ' + JSON.stringify(nb));
  afirmar(d.leituras.some((l) => l.nobreak === 'NB-09'), 'lancamento importado');
});

/* ------------------------------------------------------------------ */
/* LIMPEZA                                                             */
/* ------------------------------------------------------------------ */

caso('limpeza: embalagem "5.000" ml e cinco litros (o custo do mes nao sai 1000x maior)', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarProduto', { produto: 'Detergente Teste', tipo: 'Concentrado', embalagemMl: '5.000', preco: '45,90', diluicao: '10', solucaoL: '5', aplicacoesDia: '2' });
  const p = tela(m, s, 'limpeza').produtos.find((x) => x.produto === 'Detergente Teste');
  afirmar(p.embalagemMl === 5000 && p.preco === 45.9, 'embalagem ' + p.embalagemMl + ' preco ' + p.preco);
});

caso('limpeza: renomear o produto leva as embalagens junto; nome repetido na edicao e recusado', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarProduto', { produto: 'Detergente Neutro', tipo: 'Concentrado', embalagemMl: '5000', preco: '45,90', diluicao: '10', solucaoL: '5', aplicacoesDia: '2' });
  acao(m, s, 'salvarProduto', { produto: 'Alcool 70', tipo: 'Pronto uso', embalagemMl: '1000', preco: '9,90' });
  acao(m, s, 'salvarEmbalagem', { produto: 'detergente neutro', abertura: '2026-09-20' });
  let d = tela(m, s, 'limpeza');
  const prod = d.produtos.find((x) => x.produto === 'Detergente Neutro');
  acao(m, s, 'salvarProduto', { id: prod.id, produto: 'Detergente Neutro 5L', tipo: 'Concentrado', embalagemMl: '5000', preco: '45,90', diluicao: '10', solucaoL: '5', aplicacoesDia: '2' });
  d = tela(m, s, 'limpeza');
  const emb = d.embalagens.filter((e) => /detergente/i.test(e.produto));
  afirmar(emb.length === 1 && emb[0].produto === 'Detergente Neutro 5L' && emb[0].previstoDias > 0, 'embalagem: ' + JSON.stringify(emb));
  const alcool = d.produtos.find((x) => x.produto === 'Alcool 70');
  const erro = erroDe(() => acao(m, s, 'salvarProduto', { id: alcool.id, produto: 'detergente neutro 5l', tipo: 'Pronto uso' }));
  afirmar(/já está cadastrado/.test(erro), 'repetido recusado: ' + erro);
});

caso('limpeza: acao registrada ja concluida fecha na data dela; conclusao antes da acao e recusada', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarAcaoLimpeza', { data: '2026-08-15', problema: 'Piso sujo', acao: 'Lavar', status: 'Concluída', turno: 'A' });
  let a = tela(m, s, 'limpeza').acoes.find((x) => x.problema === 'Piso sujo');
  afirmar(a.fechamento === '2026-08-15' && a.diasAberta === 0, 'fechamento ' + a.fechamento + ' dias ' + a.diasAberta);
  acao(m, s, 'salvarAcaoLimpeza', { data: '2026-08-20', problema: 'Lixo', acao: 'Recolher', status: 'Aberta', turno: 'B' });
  a = tela(m, s, 'limpeza').acoes.find((x) => x.problema === 'Lixo');
  const erro = erroDe(() => acao(m, s, 'concluirAcaoLimpeza', { id: a.id, fechamento: '2026-08-10' }));
  afirmar(/anterior à data da ação/.test(erro), 'recusado: ' + erro);
  acao(m, s, 'concluirAcaoLimpeza', { id: a.id, fechamento: '2026-08-21', custo: '1.500' });
  a = tela(m, s, 'limpeza').acoes.find((x) => x.problema === 'Lixo');
  afirmar(a.fechamento === '2026-08-21' && a.custo === 1500, 'concluida: ' + a.fechamento + ' custo ' + a.custo);
});

caso('limpeza: importacao guarda compras, embalagens e nao conformidades repetidas no mesmo dia; reimportar nao duplica', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const D = (a, b, c) => new m.DataDoScript(a, b, c);
  const link = planilhaAntiga(m, '04_Planilha_Gestao_Limpeza', {
    'CADASTROS': [['ZONA', 'DESCRIÇÃO'], ['Z1', 'Armazenagem']],
    'NÃO CONFORMIDADES': [['REGISTRO DE NÃO CONFORMIDADES'], null,
      ['DATA', 'TURNO', 'ORIGEM', 'ZONA', 'LOCAL', 'O QUE FOI ENCONTRADO', 'CRITICIDADE', 'AÇÃO DEFINIDA', 'RESPONSÁVEL', 'PRAZO', 'STATUS', 'FECHAMENTO', 'EVIDÊNCIA'],
      [D(2026, 8, 5), 'A', 'Vistoria setorial', 'Z1', 'Banheiro masculino', 'Sem papel', 'Alta', 'Repor', 'Supervisor', D(2026, 8, 5), 'Concluída', D(2026, 8, 5), ''],
      [D(2026, 8, 5), 'C', 'Vistoria setorial', 'Z1', 'Banheiro masculino', 'Sem papel', 'Alta', 'Repor', 'Supervisor', D(2026, 8, 6), 'Aberta', '', '']],
    'PRODUTOS': [['PRODUTO', 'TIPO', 'EMBALAGEM (ML)', 'PREÇO (R$)', 'DILUIÇÃO (ML/L)', 'SOLUÇÃO POR APLICAÇÃO (L)', 'APLICAÇÕES POR DIA', 'ONDE USA'],
      ['Detergente Neutro', 'Concentrado', 5000, 45.9, 10, 5, 2, 'Pisos']],
    'COMPRAS': [['DATA', 'PRODUTO', 'QUANTIDADE', 'PREÇO UNIT.', 'FORNECEDOR', 'NF', 'OBSERVAÇÃO'],
      [D(2026, 8, 10), 'Detergente Neutro', 2, 45.9, 'Forn A', '', 'pedido manhã'],
      [D(2026, 8, 10), 'Detergente Neutro', 3, 45.9, 'Forn B', '', 'pedido tarde']],
    'RENDIMENTO': [['PRODUTO', 'DATA DA COMPRA', 'NF', 'PREÇO PAGO', 'DATA DE ABERTURA', 'DEVERIA RENDER ATÉ', 'DATA REAL DE TÉRMINO', 'CAUSA PROVÁVEL'],
      ['Detergente Neutro', D(2026, 8, 10), '', 45.9, D(2026, 8, 12), '', D(2026, 9, 1), 'turno A'],
      ['Detergente Neutro', D(2026, 8, 10), '', 45.9, D(2026, 8, 12), '', '', 'turno B']]
  });
  acao(m, s, 'importarLimpeza', { link });
  const conta = () => { const d = tela(m, s, 'limpeza'); return [d.acoes.filter((a) => a.problema === 'Sem papel').length, d.compras.length, d.embalagens.length]; };
  const primeira = conta();
  afirmar(primeira.join() === '2,2,2', 'primeira importacao (acoes, compras, embalagens): ' + primeira);
  acao(m, s, 'importarLimpeza', { link });
  afirmar(conta().join() === '2,2,2', 'reimportar: ' + conta());
  afirmar(tela(m, s, 'limpeza').acoes.some((a) => a.problema === 'Sem papel' && a.status === 'Aberta'), 'a acao aberta do turno C existe');
});

/* ------------------------------------------------------------------ */
/* ESTOQUE                                                             */
/* ------------------------------------------------------------------ */

caso('estoque: 1,1 m + 0,9 m tiram os 2 m do cabo e o saldo fica zero (sem resto de ponto flutuante)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Cabo de rede Cat6', unidade: 'm', saldoInicial: '2' });
  const cod = tela(m, s, 'estoque').itens.find((i) => i.nome === 'Cabo de rede Cat6').codigo;
  acao(m, s, 'movimentarEstoque', { tipo: 'SAIDA', item: cod, quantidade: '1,1', destino: 'Doca 3' });
  acao(m, s, 'movimentarEstoque', { tipo: 'SAIDA', item: cod, quantidade: '0,9', destino: 'Doca 4' });
  const item = tela(m, s, 'estoque').itens.find((i) => i.codigo === cod);
  afirmar(item.saldo === 0 && item.situacao === 'ZERADO', 'saldo ' + item.saldo + ' ' + item.situacao);
});

caso('estoque: depois de um codigo TI com 5 digitos, os automaticos continuam (sem "ja existe TI-0251")', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Nobreak 3kVA', codigo: 'TI-10250' });
  acao(m, s, 'salvarItemEstoque', { nome: 'Mouse' });
  acao(m, s, 'salvarItemEstoque', { nome: 'Teclado' });
  const cods = tela(m, s, 'estoque').itens.map((i) => i.codigo).sort();
  afirmar(cods.indexOf('TI-10251') !== -1 && cods.indexOf('TI-10252') !== -1, 'codigos: ' + cods.join(','));
});

caso('estoque: saida estornada fica marcada (fora das contas do mes, sem novo "Estornar")', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Notebook', unidade: 'un', saldoInicial: '10' });
  const cod = tela(m, s, 'estoque').itens.find((i) => i.nome === 'Notebook').codigo;
  acao(m, s, 'movimentarEstoque', { tipo: 'SAIDA', item: cod, quantidade: '6', destino: 'Financeiro' });
  const errada = tela(m, s, 'estoque').movimentos.find((x) => x.tipo === 'SAIDA' && x.destino === 'Financeiro');
  acao(m, s, 'estornarMovimento', { id: errada.id, motivo: 'lancado errado' });
  const mv = tela(m, s, 'estoque').movimentos.find((x) => x.id === errada.id);
  afirmar(mv.estornado === true, 'estornado: ' + JSON.stringify(mv));
});

caso('estoque: historico com dois movimentos no mesmo segundo nao mostra saldo negativo', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Mouse', unidade: 'un' });
  const cod = tela(m, s, 'estoque').itens.find((i) => i.nome === 'Mouse').codigo;
  // Grava os dois no mesmo segundo (CRIADO_EM igual), como dois cliques rapidos.
  const c = ctx(m);
  c.inserirVarios('EST_MOVIMENTOS', [
    { DATA: '2026-09-29', TIPO: 'ENTRADA', ITEM: cod, QUANTIDADE: 5 },
    { DATA: '2026-09-29', TIPO: 'SAIDA', ITEM: cod, QUANTIDADE: 1 }
  ], DONO);
  const h = acao(m, s, 'historicoItemEstoque', { codigo: cod });
  const lista = h.dados ? h.dados : h;
  // A tela refaz o saldo linha a linha a partir do saldoBase, da mais antiga para a mais nova.
  let saldo = lista.saldoBase;
  const saldos = lista.movimentos.slice().reverse().map((x) => (saldo += x.efeito));
  afirmar(lista.movimentos[0].tipo === 'SAIDA' && saldos.every((x) => x >= 0) && lista.saldo === 4,
    'ordem ' + lista.movimentos.map((x) => x.tipo).join(',') + ' saldos ' + saldos.join(','));
});

/* ------------------------------------------------------------------ */
/* FILIAIS                                                             */
/* ------------------------------------------------------------------ */

caso('filiais: tirar a pessoa da ultima filial em "Quem entra" nao da acesso a principal', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarFilial', { nome: 'CD Salvador', cidade: 'Salvador', codigo: 'SSA', paineis: { calendario: 'ATIVO' } });
  acao(m, s, 'salvarUsuario', { email: 'davi@bartofil.com.br', nome: 'Davi', perfil: 'COORDENADOR', turno: 'C', filiais: 'SSA', papel: 'Coord' });
  acao(m, s, 'salvarPessoasFilial', { codigo: 'SSA', emails: [] });
  const c = ctx(m);
  const davi = c.listar('ACESSOS').find((x) => x.EMAIL === 'davi@bartofil.com.br');
  const filiais = c.filiaisDoUsuario({ perfil: 'COORDENADOR', filiais: davi.FILIAIS }).map((f) => f.codigo);
  afirmar(filiais.length === 0, 'Davi entra em: ' + filiais.join(',') + ' (FILIAIS=' + davi.FILIAIS + ')');
});

caso('filiais: salvar "Quem entra" nao tira a filial de quem esta desativado (e nao aparece na lista)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarFilial', { nome: 'CD Salvador', cidade: 'Salvador', codigo: 'SSA', paineis: { calendario: 'ATIVO' } });
  acao(m, s, 'salvarUsuario', { email: 'carla@bartofil.com.br', nome: 'Carla', perfil: 'COORDENADOR', turno: 'B', filiais: 'FSA,SSA', papel: 'Coord' });
  const carla = ctx(m).listar('ACESSOS').find((x) => x.EMAIL === 'carla@bartofil.com.br');
  acao(m, s, 'salvarUsuario', { id: carla.ID, email: 'carla@bartofil.com.br', nome: 'Carla', perfil: 'COORDENADOR', turno: 'B', filiais: 'FSA,SSA', papel: 'Coord', ativo: false });
  const d = tela(m, s, 'filiais');
  acao(m, s, 'salvarPessoasFilial', { codigo: 'SSA', emails: d.pessoas.filter((p) => !p.todas && p.filiais.indexOf('SSA') !== -1).map((p) => p.email) });
  const depois = ctx(m).listar('ACESSOS').find((x) => x.EMAIL === 'carla@bartofil.com.br');
  afirmar(String(depois.FILIAIS) === 'FSA,SSA', 'FILIAIS=' + depois.FILIAIS);
});

caso('filiais: o numero de digitos da matricula nao vaza de uma filial para a outra', () => {
  const m = mundo(); const c = ctx(m);
  c._digitosMat = 8;
  c.esquecerLeituras();
  afirmar(c._digitosMat === null, '_digitosMat ' + c._digitosMat);
});

caso('trava: grava a planilha (flush) antes de soltar a trava', () => {
  const m = mundo(); const c = ctx(m);
  const ordem = [];
  const trava = c.LockService.getScriptLock();
  const soltarOriginal = trava.releaseLock.bind(trava);
  const plan = c.SpreadsheetApp;
  const flushOriginal = plan.flush;
  plan.flush = () => { ordem.push('flush'); return flushOriginal.call(plan); };
  c.LockService.getScriptLock = () => ({ tryLock: (ms) => trava.tryLock(ms), releaseLock: () => { ordem.push('solta'); soltarOriginal(); } });
  c.comTrava(() => 1);
  afirmar(ordem.join(',') === 'flush,solta', 'ordem: ' + ordem.join(','));
});

/* ------------------------------------------------------------------ */
/* CONFIGURACAO                                                        */
/* ------------------------------------------------------------------ */

caso('rotinas: sigla repetida e dia semanal invalido sao recusados', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const e1 = erroDe(() => acao(m, s, 'salvarRotina', { tipo: 'REU', atividade: 'Outra reuniao', frequencia: 'MENSAL', dia: '10', ativo: true }));
  afirmar(/sigla REU já é/.test(e1), 'sigla: ' + e1);
  const e2 = erroDe(() => acao(m, s, 'salvarRotina', { tipo: 'XYZ', atividade: 'Ronda', frequencia: 'SEMANAL', dia: 'segunda', ativo: true }));
  afirmar(/dia da semana/.test(e2), 'dia "segunda": ' + e2);
  const e3 = erroDe(() => acao(m, s, 'salvarRotina', { tipo: 'XYZ', atividade: 'Ronda', frequencia: 'SEMANAL', dia: '9', ativo: true }));
  afirmar(/dia da semana/.test(e3), 'dia 9: ' + e3);
  acao(m, s, 'salvarRotina', { tipo: 'XYZ', atividade: 'Ronda', frequencia: 'SEMANAL', dia: '2', ativo: true });
  const reu = ctx(m).listar('ROTINAS').find((r) => String(r.TIPO) === 'REU');
  acao(m, s, 'salvarRotina', { id: reu.ID, tipo: 'REU', atividade: reu.ATIVIDADE + ' (editada)', frequencia: reu.FREQUENCIA, dia: String(reu.DIA), ativo: true });
});

caso('DE-PARA: codigo repetido e recusado (a linha que aparece na tela e a que vale)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarDePara', { codigo: 'X9', descricao: 'Teste', categoria: 'Outros', ausencia: false });
  const e = erroDe(() => acao(m, s, 'salvarDePara', { codigo: 'x9', descricao: 'De novo', categoria: 'Falta', ausencia: true }));
  afirmar(/já está no DE-PARA/.test(e), 'repetido: ' + e);
  const c = ctx(m);
  const codigos = c.listar('DE_PARA').map((l) => c.codigo_(l.CODIGO));
  const repetidos = codigos.filter((x, i) => codigos.indexOf(x) !== i);
  afirmar(!repetidos.length, 'a legenda padrao ja vem sem repetidos: ' + repetidos.join(','));
  const linha = c.listar('DE_PARA').find((l) => c.codigo_(l.CODIGO) === 'X9');
  acao(m, s, 'salvarDePara', { id: linha.ID, codigo: 'X9', descricao: 'Teste (editado)', categoria: 'Outros', ausencia: false });
});

caso('atualizacao de versao nao religa o Estoque que o administrador desligou na principal', () => {
  const m = mundo(); let c = ctx(m);
  const pr = c.listar('FILIAIS').find((l) => c.marcado(l.PRINCIPAL));
  const paineis = JSON.parse(pr.PAINEIS || '{}');
  delete paineis.estoque;
  c.atualizar('FILIAIS', pr.ID, { PAINEIS: JSON.stringify(paineis) }, DONO);
  m.props.script.VERSAO_ESQUEMA = '8.2';                  // banco da 4.2.1
  m.cache.clear();
  c = ctx(m); c.garantirEsquema();
  c = ctx(m);
  const depois = JSON.parse(c.listar('FILIAIS').find((l) => c.marcado(l.PRINCIPAL)).PAINEIS || '{}');
  afirmar(!depois.estoque, 'estoque religado: ' + JSON.stringify(depois));
  afirmar(m.props.script.VERSAO_ESQUEMA !== '8.2', 'a migracao rodou: versao ' + m.props.script.VERSAO_ESQUEMA);
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
