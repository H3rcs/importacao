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

/* ------------------------------------------------------------------ */
/* ADMIN VE TUDO · ESTOQUE CD/LOJA · TROCAR PIN                        */
/* ------------------------------------------------------------------ */

caso('ADMIN ve todas as telas e paineis mesmo com PERFIS e paineis da filial incompletos (banco antigo)', () => {
  const m = mundo(); let c = ctx(m);
  // banco antigo: linha ADMIN sem as telas/capacidades novas; principal so com calendario e assiduidade
  const adm = c.listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === 'ADMIN');
  const apaga = {};
  Object.keys(adm).forEach((k) => { if (/^TELA_(NOBREAKS|LIMPEZA|QUADRO|ESTOQUE|FILIAIS)$|^PODE_(GERIR_FILIAIS|GERIR_ESTOQUE|GERIR_LIMPEZA|LANCAR_NOBREAK)$/.test(k)) apaga[k] = 'NAO'; });
  c.atualizar('PERFIS', adm.ID, apaga, DONO);
  const pr = c.listar('FILIAIS').find((l) => c.marcado(l.PRINCIPAL));
  c.atualizar('FILIAIS', pr.ID, { PAINEIS: JSON.stringify({ calendario: 'ATIVO', assiduidade: 'ATIVO' }) }, DONO);
  m.cache.clear();
  const s = entrar(m, DONO, '4321');
  const r = JSON.parse(chamar(m, DONO, 'retomarSessao', { t: s.t, f: s.f }).valor);
  const telas = r.telas.map((t) => t.id);
  ['filiais', 'nobreaks', 'limpeza', 'quadro', 'estoque', 'config', 'acessos'].forEach((id) => afirmar(telas.indexOf(id) !== -1, 'ADMIN sem a tela ' + id + ': ' + telas.join(',')));
  const mods = r.modulos || [];
  const est = mods.find((x) => x.id === 'estoque');
  afirmar(!mods.length || (est && est.oculto), 'estoque aparece marcado como oculto para o admin');
  tela(m, s, 'estoque'); tela(m, s, 'filiais'); tela(m, s, 'quadro');
  // quem nao e admin continua sem os paineis desligados
  const g = entrar(m, GERENTE, '5555');
  const rg = JSON.parse(chamar(m, GERENTE, 'retomarSessao', { t: g.t, f: g.f }).valor);
  afirmar(!rg.telas.some((t) => t.id === 'estoque' || t.id === 'nobreaks'), 'gerente: ' + rg.telas.map((t) => t.id).join(','));
});

caso('estoque de TI: estoque, minimo (alerta) e ideal; saida com data, setor e usuario', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Toner HP 85A', minimo: '2', ideal: '6', saldoInicial: '3' });
  acao(m, s, 'importarItensEstoque', { texto: 'Mouse USB\tPeriféricos\tLogitech\tM90\tun\t5\tArmário TI\t12\t\t15' });
  let itens = tela(m, s, 'estoque').itens;
  const toner = itens.find((i) => i.nome === 'Toner HP 85A'), mouse = itens.find((i) => i.nome === 'Mouse USB');
  afirmar(toner.minimo === 2 && toner.ideal === 6 && toner.saldo === 3 && toner.faltaIdeal === 3 && toner.situacao === 'OK', 'toner: ' + JSON.stringify(toner));
  afirmar(mouse.ideal === 15 && mouse.faltaIdeal === 3, 'mouse: ' + JSON.stringify(mouse));
  // chegaram dois mouses: so a quantidade
  acao(m, s, 'movimentarEstoque', { tipo: 'ENTRADA', item: mouse.codigo, quantidade: '2' });
  // saida sem setor nem usuario e recusada; com o usuario so, passa
  const e0 = erroDe(() => acao(m, s, 'movimentarEstoque', { tipo: 'SAIDA', item: toner.codigo, quantidade: '1', data: '2026-09-28' }));
  afirmar(/setor ou o usuário/.test(e0), 'saida sem destino: ' + e0);
  acao(m, s, 'movimentarEstoque', { tipo: 'SAIDA', item: toner.codigo, quantidade: '1', data: '2026-09-28', destino: 'Loja 3', solicitante: 'Carla' });
  const d = tela(m, s, 'estoque');
  itens = d.itens;
  afirmar(itens.find((i) => i.nome === 'Mouse USB').saldo === 14, 'mouse depois da entrada');
  const t2 = itens.find((i) => i.nome === 'Toner HP 85A');
  afirmar(t2.saldo === 2 && t2.situacao === 'REPOR', 'toner no minimo vira alerta: ' + t2.saldo + ' ' + t2.situacao);
  const mv = d.movimentos.find((x) => x.tipo === 'SAIDA');
  afirmar(mv.data === '2026-09-28' && mv.destino === 'Loja 3' && mv.solicitante === 'Carla' && d.listas.solicitantes.indexOf('Carla') !== -1, 'saida: ' + JSON.stringify(mv));
  const e = erroDe(() => acao(m, s, 'salvarItemEstoque', { nome: 'Cabo', minimo: '10', ideal: '4' }));
  afirmar(/não pode ser menor que o mínimo/.test(e), 'ideal < minimo: ' + e);
});

caso('trocar o proprio PIN: confere o atual, e o novo passa a valer', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const e1 = erroDe(() => acao(m, s, 'trocarMeuPin', { atual: '1111', novo: '2468', confirmacao: '2468' }));
  afirmar(/PIN atual está incorreto/.test(e1), 'atual errado: ' + e1);
  const e2 = erroDe(() => acao(m, s, 'trocarMeuPin', { atual: '5555', novo: '2468', confirmacao: '2469' }));
  afirmar(/não são iguais/.test(e2), 'confirmacao: ' + e2);
  acao(m, s, 'trocarMeuPin', { atual: '5555', novo: '2468', confirmacao: '2468' });
  const velho = JSON.parse(chamar(m, GERENTE, 'entrar', GERENTE, '5555', '', '', '').valor);
  afirmar(!velho.token, 'PIN antigo nao entra');
  const novo = JSON.parse(chamar(m, GERENTE, 'entrar', GERENTE, '2468', '', '', '').valor);
  afirmar(novo.token, 'PIN novo entra: ' + JSON.stringify(novo).slice(0, 160));
});

caso('quadro do CD: le os admitidos da aba CADMITIDOS sem data (Produtiva / Colaborador / Equipe / Funcao / Status)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (a, b, c) => new m.DataDoScript(a, b, c);
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'APOIO TA': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO'], ['1', 'ANA', 'TA', 'CONFERENTE'], ['2', 'BRUNO', 'TA', 'SEPARADOR']],
    // layout real da filial: sem data de admissao
    'CADMITIDOS': [['ADMITIDOS'], ['PRODUTIVA', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'STATUS'],
      ['3', 'CARLA', 'TB', 'SEPARADOR', 'Ativo'],
      ['4', 'DIEGO', 'TC', 'CONFERENTE', 'Em treinamento'],
      ['5', 'EVA', 'TA', 'OPERADOR', 'Ativo']],
    'CDADMITIDOS (antigo)': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA ADMISSÃO'], ['9', 'NAO LER', 'TB', 'X', D(2025, 7, 11)]],
    'CDESLIGADOS': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO'],
      ['6', 'FABIO', 'TB', 'SEPARADOR', D(2025, 7, 20), 'Pedido', 'Outro emprego']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro, 'erro: ' + d.erro);
  afirmar(d.adm.length === 3, 'admitidos: ' + JSON.stringify(d.adm));
  const carla = d.adm.find((a) => a.nome === 'CARLA');
  afirmar(carla.cod === '3' && carla.equipe === 'TB' && carla.funcao === 'SEPARADOR' && carla.status === 'ATIVO', 'carla: ' + JSON.stringify(carla));
  afirmar(d.adm.filter((a) => a.status === 'EM TREINAMENTO').length === 1, 'status');
  afirmar(d.des.length === 1 && d.apoio.length === 2, 'desligados ' + d.des.length + ' apoio ' + d.apoio.length);
});

caso('limpeza por lote: compra com varios produtos, "acabou" mede a duracao, reabastecimento individual e por lote', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarLoteLimpeza', { tipo: 'LOTE', data: '2026-08-01', fornecedor: 'Forn A', nf: '123', itens: [
    { produto: 'Detergente neutro 5L', quantidade: '2', unidade: 'galão', precoUnit: '45,90' },
    { produto: 'Álcool 70', quantidade: '6', unidade: 'litro', precoUnit: '9,90' }] });
  let d = tela(m, s, 'limpeza');
  afirmar(d.lotes.length === 1 && d.lotes[0].total === 151.2 && d.itens.filter((i) => i.situacao === 'EM_USO').length === 2, 'lote: ' + JSON.stringify(d.lotes[0]));
  const det = d.itens.find((i) => /Detergente/.test(i.produto));
  const e0 = erroDe(() => acao(m, s, 'acabouItemLimpeza', { id: det.id, data: '2026-07-01' }));
  afirmar(/anterior à compra/.test(e0), 'acabou antes da compra: ' + e0);
  acao(m, s, 'acabouItemLimpeza', { id: det.id, data: '2026-08-21' });
  d = tela(m, s, 'limpeza');
  const det2 = d.itens.find((i) => i.id === det.id);
  afirmar(det2.situacao === 'AGUARDANDO' && det2.dias === 20 && d.kpis.aguardandoReposicao === 1, 'acabou: ' + JSON.stringify(det2));
  // reabastecimento individual
  acao(m, s, 'reabastecerLimpeza', { id: det.id, data: '2026-08-22', quantidade: '1', precoUnit: '47' });
  d = tela(m, s, 'limpeza');
  afirmar(d.itens.find((i) => i.id === det.id).situacao === 'REPOSTO' && d.lotes.length === 2 && d.lotes[0].tipo === 'INDIVIDUAL', 'reposto individual');
  const c = d.consumo.find((x) => /Detergente/.test(x.produto));
  afirmar(c.duracaoMedia === 20 && c.custoDia === 4.59 && c.compras === 2, 'consumo: ' + JSON.stringify(c));
  // o alcool acaba e volta num lote novo: reabastecimento anotado sozinho
  const alc = d.itens.find((i) => /lcool/.test(i.produto));
  acao(m, s, 'acabouItemLimpeza', { id: alc.id, data: '2026-09-01' });
  acao(m, s, 'salvarLoteLimpeza', { tipo: 'LOTE', data: '2026-09-02', itens: [{ produto: 'álcool 70', quantidade: '6', unidade: 'litro', precoUnit: '10' }, { produto: 'Pano', quantidade: '10' }] });
  d = tela(m, s, 'limpeza');
  afirmar(d.itens.find((i) => i.id === alc.id).situacao === 'REPOSTO' && d.kpis.aguardandoReposicao === 0, 'reposto pelo lote');
  // compra com produto ja acabado nao pode ser excluida
  const e1 = erroDe(() => acao(m, s, 'excluirLoteLimpeza', { id: d.lotes.find((l) => l.data === '2026-08-01').id }));
  afirmar(/já tem produto marcado como acabado/.test(e1), 'excluir: ' + e1);
});

caso('perfil SUPERVISOR existe e cuida so da Limpeza', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarUsuario', { email: 'sup.limpeza@bartofil.com.br', nome: 'Sup Limpeza', perfil: 'SUPERVISOR', turno: '', filiais: '*', papel: 'Supervisor' });
  const sup = entrar(m, 'sup.limpeza@bartofil.com.br', '2222');
  const r = JSON.parse(chamar(m, 'sup.limpeza@bartofil.com.br', 'retomarSessao', { t: sup.t, f: sup.f }).valor);
  afirmar(r.telas.map((t) => t.id).join() === 'limpeza', 'telas: ' + r.telas.map((t) => t.id).join());
  acao(m, sup, 'salvarLoteLimpeza', { tipo: 'INDIVIDUAL', itens: [{ produto: 'Saco de lixo 100L', quantidade: '5' }] });
});

caso('estoque de TI: minimo 1, ideal 1, estoque 1 nao pede reposicao', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Leitor de código', minimo: '1', ideal: '1', saldoInicial: '1' });
  acao(m, s, 'salvarItemEstoque', { nome: 'Mouse', minimo: '2', ideal: '5', saldoInicial: '2' });
  const itens = tela(m, s, 'estoque').itens;
  afirmar(itens.find((i) => i.nome === 'Leitor de código').situacao === 'OK', 'leitor');
  afirmar(itens.find((i) => i.nome === 'Mouse').situacao === 'REPOR', 'mouse continua pedindo');
});

caso('plano de acao: coordenador ve so as suas (inclusive conjuntas) e conclui', () => {
  const m = mundo(); let c = ctx(m);
  // banco antigo: coordenador sem a tela do Plano de Acao
  const co = c.listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === 'COORDENADOR');
  c.atualizar('PERFIS', co.ID, { TELA_ACOES: 'NAO' }, DONO); m.cache.clear();
  const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarUsuario', { email: 'pedro@bartofil.com.br', nome: 'Pedro', perfil: 'COORDENADOR', turno: 'B', filiais: '*', papel: 'Coord' });
  acao(m, adm, 'salvarAcao', { acao: 'Trocar lâmpadas', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD, 'pedro@bartofil.com.br'] });
  acao(m, adm, 'salvarAcao', { acao: 'Só do Pedro', prazo: '2026-12-01', turno: 'A', responsaveisEmails: ['pedro@bartofil.com.br'] });
  const maria = entrar(m, COORD, '1234');
  const r = JSON.parse(chamar(m, COORD, 'retomarSessao', { t: maria.t, f: maria.f }).valor);
  afirmar(r.telas.some((t) => t.id === 'acoes'), 'coordenador ve a tela');
  const d = tela(m, maria, 'acoes', { situacao: 'TODAS' });
  afirmar(d.lista.length === 1 && d.lista[0].acao === 'Trocar lâmpadas' && d.lista[0].responsaveisEmails.length === 2, 'Maria ve: ' + d.lista.map((a) => a.acao).join());
  acao(m, maria, 'concluirAcao', { id: d.lista[0].id });
  afirmar(m.emails.filter((e) => /Nova ação: Trocar/.test(e.subject)).length === 2, 'os dois responsaveis avisados');
  afirmar(m.emails.some((e) => /tela=acoes/.test(e.html || e.htmlBody || e.body || '')), 'link do e-mail leva ao Plano de Acao');
  const outra = tela(m, maria, 'acoes', { situacao: 'TODAS' }).lista.find((a) => a.acao === 'Só do Pedro');
  afirmar(!outra, 'nao ve a acao do Pedro');
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
