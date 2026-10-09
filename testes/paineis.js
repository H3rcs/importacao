#!/usr/bin/env node
/*
 * TESTES DOS PAINEIS (NOBREAKS, LIMPEZA, ESTOQUE), PLANO DE ACAO, FOTOS, FILIAIS E CONFIGURACAO.
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

const SUP = 'sup.limpeza@bartofil.com.br';
/* PNG de 1x1: bytes de imagem de verdade para as fotos. */
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const foto = (n, tipo) => ({ nome: 'foto' + n + '.jpg', tipo: tipo || 'image/jpeg', dados: PNG_1x1 });

caso('limpeza: estoque igual ao de TI (LP-0001, minimo e ideal, saida com destino, estorno, inventario, historico) e separado do de TI', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarItemLimpeza', { nome: 'Detergente neutro 5L', unidade: 'galão', minimo: '2', ideal: '6', saldoInicial: '3' });
  let d = tela(m, s, 'limpeza').estoque;
  const det = d.itens.find((i) => i.nome === 'Detergente neutro 5L');
  afirmar(det && det.codigo === 'LP-0001' && det.saldo === 3 && det.situacao === 'OK' && det.unidade === 'galão', 'cadastro: ' + JSON.stringify(det));
  afirmar(d.permissoes.cadastrar && d.permissoes.movimentar && d.prefixo === 'LP', 'gerente gere o estoque da limpeza: ' + JSON.stringify(d.permissoes));
  const e0 = erroDe(() => acao(m, s, 'movimentarLimpeza', { tipo: 'SAIDA', item: 'LP-0001', quantidade: '1' }));
  afirmar(/Informe para onde foi/.test(e0), 'saida sem destino: ' + e0);
  acao(m, s, 'movimentarLimpeza', { tipo: 'SAIDA', item: 'LP-0001', quantidade: '1', destino: 'Z7 — Sanitários', solicitante: 'Equipe turno A' });
  d = tela(m, s, 'limpeza').estoque;
  const depois = d.itens.find((i) => i.codigo === 'LP-0001');
  afirmar(depois.saldo === 2 && depois.situacao === 'REPOR' && depois.faltaIdeal === 4, 'apos a saida: ' + JSON.stringify(depois));
  afirmar(/Saldo insuficiente/.test(erroDe(() => acao(m, s, 'movimentarLimpeza', { tipo: 'SAIDA', item: 'LP-0001', quantidade: '5', destino: 'Z1' }))), 'saldo insuficiente');
  const saida = d.movimentos.find((x) => x.tipo === 'SAIDA');
  acao(m, s, 'estornarLimpeza', { id: saida.id, motivo: 'lançado errado' });
  d = tela(m, s, 'limpeza').estoque;
  afirmar(d.itens.find((i) => i.codigo === 'LP-0001').saldo === 3 && d.movimentos.find((x) => x.id === saida.id).estornado, 'estorno');
  acao(m, s, 'inventarioLimpeza', { contagens: [{ codigo: 'LP-0001', contado: '5', saldoVisto: 3 }] });
  const h = acao(m, s, 'historicoItemLimpeza', { codigo: 'LP-0001' });
  afirmar(h.saldo === 5 && h.total === 4, 'historico: saldo ' + h.saldo + ' lancamentos ' + h.total);
  // o estoque de TI nao ve nem mexe no da limpeza
  const adm = entrar(m, DONO, '4321');
  afirmar(!tela(m, adm, 'estoque').itens.some((i) => i.codigo === 'LP-0001'), 'fora do estoque de TI');
  afirmar(/Escolha um item do cadastro/.test(erroDe(() => acao(m, adm, 'movimentarEstoque', { tipo: 'ENTRADA', item: 'LP-0001', quantidade: '1' }))), 'porta do TI');
  acao(m, adm, 'salvarItemEstoque', { nome: 'Mouse USB' });
  afirmar(tela(m, adm, 'estoque').itens.find((i) => i.nome === 'Mouse USB').codigo === 'TI-0001', 'o TI continua com TI-0001');
});

caso('limpeza: importacao traz nao conformidades para o Plano de Acao e produtos para o estoque; reimportar nao duplica', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const D = (a, b, c) => new m.DataDoScript(a, b, c);
  const link = planilhaAntiga(m, '04_Planilha_Gestao_Limpeza', {
    'CADASTROS': [['ZONA', 'DESCRIÇÃO'], ['Z11', 'Pátio novo']],
    'NÃO CONFORMIDADES': [['REGISTRO DE NÃO CONFORMIDADES'], null,
      ['DATA', 'TURNO', 'ORIGEM', 'ZONA', 'LOCAL', 'O QUE FOI ENCONTRADO', 'CRITICIDADE', 'AÇÃO DEFINIDA', 'RESPONSÁVEL', 'PRAZO', 'STATUS', 'FECHAMENTO', 'EVIDÊNCIA'],
      [D(2026, 8, 5), 'A', 'Vistoria setorial', 'Z1', 'Banheiro masculino', 'Sem papel', 'Alta', 'Repor', 'Supervisor', D(2026, 8, 5), 'Concluída', D(2026, 8, 5), 'CH-0151'],
      [D(2026, 8, 5), 'C', 'Vistoria setorial', 'Z1', 'Banheiro masculino', 'Sem papel', 'Alta', 'Repor', 'Supervisor', D(2026, 8, 6), 'Aberta', '', '']],
    'PRODUTOS': [['PRODUTO', 'TIPO', 'EMBALAGEM (ML)', 'PREÇO (R$)', 'DILUIÇÃO (ML/L)', 'SOLUÇÃO POR APLICAÇÃO (L)', 'APLICAÇÕES POR DIA', 'ONDE USA'],
      ['Detergente Neutro', 'Concentrado', 5000, 45.9, 10, 5, 2, 'Pisos'],
      ['Leia antes: esta aba calcula o custo por aplicação a partir da embalagem e da diluição', '', '', '', '', '', '', '']]
  });
  acao(m, s, 'importarLimpeza', { link });
  const conta = () => { const d = tela(m, s, 'limpeza'); return [d.plano.lista.filter((a) => a.acao === 'Sem papel').length, d.estoque.itens.length, d.zonas.filter((z) => z.zona === 'Z11').length]; };
  afirmar(conta().join() === '2,1,1', 'primeira importacao (acoes, produtos, zona nova): ' + conta());
  acao(m, s, 'importarLimpeza', { link });
  afirmar(conta().join() === '2,1,1', 'reimportar: ' + conta());
  const d = tela(m, s, 'limpeza');
  const aberta = d.plano.lista.find((a) => a.acao === 'Sem papel' && a.situacao === 'PENDENTE');
  afirmar(aberta && aberta.turno === 'C' && aberta.zona === 'Z1' && aberta.local === 'Banheiro masculino' && aberta.criticidade === 'Alta' &&
    aberta.descricao === 'Repor' && aberta.abertaEm === '2026-09-05' && aberta.plano === 'LIMPEZA', 'aberta: ' + JSON.stringify(aberta).slice(0, 300));
  const feita = d.plano.lista.find((a) => a.acao === 'Sem papel' && a.situacao === 'CONCLUIDA');
  afirmar(feita && /CH-0151/.test(feita.observacao) && feita.concluidoEm === '05/09/2026', 'concluida: ' + JSON.stringify(feita).slice(0, 300));
  const p = d.estoque.itens[0];
  afirmar(p.nome === 'Detergente Neutro' && p.codigo === 'LP-0001' && p.saldo === 0 && p.local === 'Pisos', 'produto: ' + JSON.stringify(p));
  afirmar(!tela(m, s, 'acoes', { situacao: 'TODAS' }).lista.some((a) => a.acao === 'Sem papel'), 'fora do plano do calendario');
});

caso('limpeza: acoes da tabela antiga (LP_ACOES) passam para o Plano de Acao na atualizacao, com o mesmo ID e os comentarios; nao duplica', () => {
  const m = mundo(); let c = ctx(m);
  const ids = c.inserirVarios('LP_ACOES', [
    { DATA: '2026-09-01', TURNO: 'A', ORIGEM: 'Vistoria setorial', ZONA: 'Z2', LOCAL: 'Doca 4', PROBLEMA: 'Piso com óleo', CRITICIDADE: 'Alta',
      ACAO: 'Lavar com desengraxante', RESPONSAVEL: 'Equipe do turno', PRAZO: '2026-09-03', STATUS: 'Em andamento', FECHAMENTO: '', EVIDENCIA: '', CUSTO: '', DEPENDE: 'desengraxante chegar' },
    { DATA: '2026-08-10', TURNO: '', ORIGEM: 'Reclamação', ZONA: '', LOCAL: 'Refeitório', PROBLEMA: 'Lixeira quebrada', CRITICIDADE: 'Baixa',
      ACAO: 'Trocar', RESPONSAVEL: 'Compras', PRAZO: '2026-08-20', STATUS: 'Concluída', FECHAMENTO: '2026-08-15', EVIDENCIA: 'CH-0151', CUSTO: '89.9', DEPENDE: '' }
  ], 'antigo@bartofil.com.br');
  c = ctx(m); c.inserir('COMENTARIOS', { ORIGEM: 'LP_ACOES', ACAO_ID: ids[0], TEXTO: 'Pedido o desengraxante', SITUACAO: 'Em andamento',
    DEPENDE: 'desengraxante chegar', AUTOR: GERENTE, AUTOR_NOME: 'João Lima', AUTOR_PAPEL: 'Gerente', TIPO: 'COMENTARIO' }, GERENTE);
  // a atualizacao de versao roda a migracao sozinha
  c = ctx(m); c.PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', '8.7');
  c = ctx(m); c.garantirEsquema();
  c = ctx(m); afirmar(c.migrarAcoesDaLimpeza_() === 0, 'rodar de novo nao passa nada');
  const s = entrar(m, GERENTE, '5555');
  const d = tela(m, s, 'limpeza').plano;
  const oleo = d.lista.find((a) => a.id === ids[0]);
  afirmar(oleo && oleo.acao === 'Piso com óleo' && oleo.descricao === 'Lavar com desengraxante' && oleo.situacao === 'PENDENTE' &&
    oleo.andamento === 'Em andamento' && oleo.depende === 'desengraxante chegar' && oleo.zona === 'Z2' && oleo.local === 'Doca 4' &&
    oleo.criticidade === 'Alta' && oleo.abertaEm === '2026-09-01' && oleo.turno === 'A' && oleo.responsavel === 'Equipe do turno', 'em andamento: ' + JSON.stringify(oleo).slice(0, 500));
  afirmar(oleo.comentarios.length === 1 && oleo.comentarios[0].texto === 'Pedido o desengraxante' && oleo.comentarios[0].nome === 'João Lima', 'comentario antigo continua ligado');
  const lix = d.lista.find((a) => a.id === ids[1]);
  afirmar(lix && lix.situacao === 'CONCLUIDA' && lix.concluidoEm === '15/08/2026' && /CH-0151/.test(lix.observacao) && /89,9/.test(lix.observacao) &&
    lix.turno === 'Todos' && lix.criadoPor === 'antigo@bartofil.com.br', 'concluida: ' + JSON.stringify(lix).slice(0, 400));
  afirmar(!tela(m, s, 'acoes', { situacao: 'TODAS' }).lista.some((a) => a.id === ids[0]), 'fora do plano do calendario');
  // excluida depois da migracao nao volta
  acao(m, s, 'excluirAcaoLimpeza', { id: ids[1] });
  c = ctx(m); afirmar(c.migrarAcoesDaLimpeza_() === 0, 'excluida nao volta');
  // responsavel antigo (so o nome): a gestao comenta e edita sem marcar ninguem — o nome e a data de abertura ficam
  acao(m, s, 'comentarAcaoLimpeza', { id: ids[0], texto: 'Chegou o desengraxante', situacao: 'Em andamento' });
  acao(m, s, 'salvarAcaoLimpeza', { id: ids[0], acao: 'Piso com óleo', descricao: 'Lavar', prazo: '2026-09-10', turno: 'A', responsavel: 'Equipe do turno', zona: 'Z2', local: 'Doca 4', criticidade: 'Alta' });
  const oleo2 = tela(m, s, 'limpeza').plano.lista.find((a) => a.id === ids[0]);
  afirmar(oleo2.responsavel === 'Equipe do turno' && oleo2.abertaEm === '2026-09-01' && oleo2.comentarios.length === 2 && oleo2.prazoISO === '2026-09-10', 'editada: ' + JSON.stringify(oleo2).slice(0, 300));
});

caso('limpeza: responsavel precisa enxergar a Limpeza; quem tem o modulo so em "Ver" ve e conclui so as suas', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const pessoas = tela(m, adm, 'limpeza').plano.pessoas;
  afirmar(!pessoas.some((p) => p.email === COORD) && pessoas.some((p) => p.email === GERENTE), 'lista: ' + pessoas.map((p) => p.email).join());
  const e = erroDe(() => acao(m, adm, 'salvarAcaoLimpeza', { acao: 'x', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }));
  afirmar(/Sem acesso ao Plano de Ação da Limpeza/.test(e), 'recusado: ' + e);
  const reg = ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === COORD);
  acao(m, adm, 'definirModuloPessoa', { id: reg.ID, modulo: 'limpeza', modo: 'VER' });
  acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Da Maria', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD], zona: 'Z7', criticidade: 'Alta' });
  acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Do gerente', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
  const maria = entrar(m, COORD, '1234');
  const dm = tela(m, maria, 'limpeza');
  afirmar(dm.plano.lista.length === 1 && dm.plano.lista[0].acao === 'Da Maria' && !dm.plano.permissoes.gerir, 'maria ve so a dela: ' + dm.plano.lista.map((a) => a.acao).join());
  afirmar(!dm.estoque.permissoes.cadastrar && !dm.estoque.permissoes.movimentar, 'estoque so para ver');
  const doGerente = tela(m, adm, 'limpeza').plano.lista.find((a) => a.acao === 'Do gerente');
  afirmar(/Só os responsáveis/.test(erroDe(() => acao(m, maria, 'comentarAcaoLimpeza', { id: doGerente.id, texto: 'oi' }))), 'nao comenta a do gerente');
  acao(m, maria, 'comentarAcaoLimpeza', { id: dm.plano.lista[0].id, texto: 'Feito', situacao: 'Concluída' });
  afirmar(tela(m, maria, 'limpeza').plano.lista[0].situacao === 'CONCLUIDA', 'concluiu a dela');
  afirmar(erroDe(() => acao(m, maria, 'salvarItemLimpeza', { nome: 'X' })), 'em Ver nao cadastra no estoque');
  afirmar(erroDe(() => acao(m, maria, 'salvarAcaoLimpeza', { acao: 'x', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] })), 'em Ver nao cria acao');
});

caso('planos separados: a acao de um plano nao abre pela porta do outro, e cada tela so lista as suas', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarUsuario', { email: SUP, nome: 'Sup Limpeza', perfil: 'SUPERVISOR', turno: '', filiais: '*', papel: 'Supervisor' });
  acao(m, adm, 'salvarAcao', { acao: 'Do calendario', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD], fotos: [foto(1)] });
  acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Da limpeza', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [SUP], fotos: [foto(2)] });
  const cal = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista;
  const lim = tela(m, adm, 'limpeza').plano.lista;
  afirmar(cal.length === 1 && cal[0].acao === 'Do calendario' && lim.length === 1 && lim[0].acao === 'Da limpeza', 'listas: ' + cal.map((a) => a.acao) + ' / ' + lim.map((a) => a.acao));
  const sup = entrar(m, SUP, '2222');
  ['concluirAcaoLimpeza', 'comentarAcaoLimpeza', 'cancelarAcaoLimpeza', 'excluirAcaoLimpeza', 'reabrirAcaoLimpeza', 'fotoAcaoLimpeza', 'removerFotoAcaoLimpeza'].forEach((n) => {
    const e = erroDe(() => acao(m, sup, n, { id: cal[0].id, texto: 'x', arquivo: cal[0].fotos[0].id }));
    afirmar(/Ação não encontrada/.test(e), 'supervisor › ' + n + ': ' + e);
  });
  const e1 = erroDe(() => acao(m, sup, 'salvarAcaoLimpeza', { id: cal[0].id, acao: 'Sequestrada', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [SUP] }));
  afirmar(/Ação não encontrada/.test(e1), 'editar pela porta da limpeza: ' + e1);
  const ger = entrar(m, GERENTE, '5555');
  ['salvarAcao', 'concluirAcao', 'comentarAcao', 'cancelarAcao', 'excluirAcao', 'reabrirAcao', 'fotoAcao', 'removerFotoAcao'].forEach((n) => {
    const e = erroDe(() => acao(m, ger, n, { id: lim[0].id, acao: 'x', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE], texto: 'x', arquivo: lim[0].fotos[0].id }));
    afirmar(/Ação não encontrada/.test(e), 'gerente › ' + n + ': ' + e);
  });
  const c2 = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista[0], l2 = tela(m, adm, 'limpeza').plano.lista[0];
  afirmar(c2.acao === 'Do calendario' && c2.situacao === 'PENDENTE' && !c2.comentarios.length && c2.fotos.length === 1, 'calendario intacto');
  afirmar(l2.acao === 'Da limpeza' && l2.situacao === 'PENDENTE' && !l2.comentarios.length && l2.fotos.length === 1, 'limpeza intacta');
});

caso('fotos: na acao e no comentario vao para Anexos/ACOES/<id>; so quem enxerga a acao ve; foto de outra acao nao passa; a gestao remove', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarUsuario', { email: 'pedro@bartofil.com.br', nome: 'Pedro', perfil: 'COORDENADOR', turno: 'B', filiais: '*', papel: 'Coord' });
  const r = acao(m, adm, 'salvarAcao', { acao: 'Iluminação', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD], fotos: [foto(1), foto(2)] });
  afirmar(/2 foto/.test(r.recado), 'recado: ' + r.recado);
  acao(m, adm, 'salvarAcao', { acao: 'Outra', prazo: '2026-12-01', turno: 'B', responsaveisEmails: ['pedro@bartofil.com.br'], fotos: [foto(9)] });
  const lista = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista;
  const a = lista.find((x) => x.id === r.id), outra = lista.find((x) => x.acao === 'Outra');
  afirmar(a.fotos.length === 2 && a.fotos[0].nome === 'foto1.jpg' && !('url' in a.fotos[0]), 'fotos na acao: ' + JSON.stringify(a.fotos));
  const arq = m.arquivos.get(a.fotos[0].id);
  const pasta = m.pastas.get([...arq.pais][0]);
  const pastaTabela = m.pastas.get([...pasta.pais][0]);
  afirmar(pasta.nome === a.id && pastaTabela.nome === 'ACOES' && !arq.lixo, 'pasta: ' + pastaTabela.nome + '/' + pasta.nome);
  const maria = entrar(m, COORD, '1234');
  acao(m, maria, 'comentarAcao', { id: a.id, texto: 'Lâmpadas trocadas', situacao: 'Em andamento', fotos: [foto(3)] });
  const am = tela(m, maria, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === a.id);
  const fc = am.comentarios[0].fotos[0];
  afirmar(fc && fc.nome === 'foto3.jpg' && [...m.arquivos.get(fc.id).pais][0] === pasta.id, 'foto do comentario na pasta da acao');
  const v = acao(m, maria, 'fotoAcao', { id: a.id, arquivo: a.fotos[1].id });
  afirmar(v.dados === PNG_1x1 && /^image\//.test(v.tipo), 'responsavel ve: ' + JSON.stringify(v).slice(0, 80));
  afirmar(acao(m, maria, 'fotoAcao', { id: a.id, arquivo: fc.id }).dados === PNG_1x1, 've a do comentario');
  const pedro = entrar(m, 'pedro@bartofil.com.br', '2222');
  afirmar(/Ação não encontrada/.test(erroDe(() => acao(m, pedro, 'fotoAcao', { id: a.id, arquivo: a.fotos[0].id }))), 'quem nao enxerga a acao nao ve a foto');
  afirmar(/não é desta ação/.test(erroDe(() => acao(m, maria, 'fotoAcao', { id: a.id, arquivo: outra.fotos[0].id }))), 'foto de outra acao');
  afirmar(/não é desta ação/.test(erroDe(() => acao(m, maria, 'fotoAcao', { id: a.id, arquivo: 'qualquer-id-do-drive' }))), 'arquivo qualquer');
  afirmar(erroDe(() => acao(m, maria, 'removerFotoAcao', { id: a.id, arquivo: a.fotos[0].id })), 'responsavel nao remove');
  afirmar(/não é anexo deste registro/.test(erroDe(() => acao(m, adm, 'removerFotoAcao', { id: a.id, arquivo: fc.id }))), 'foto de comentario fica');
  acao(m, adm, 'removerFotoAcao', { id: a.id, arquivo: a.fotos[0].id });
  let depois = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === a.id);
  afirmar(depois.fotos.length === 1 && depois.fotos[0].id === a.fotos[1].id && m.arquivos.get(a.fotos[0].id).lixo, 'removida e na lixeira');
  acao(m, adm, 'salvarAcao', { id: a.id, acao: 'Iluminação', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD], fotos: [foto(4)] });
  depois = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === a.id);
  afirmar(depois.fotos.length === 2, 'editar acrescenta: ' + depois.fotos.length);
  acao(m, maria, 'concluirAcao', { id: a.id, observacao: 'feito', fotos: [foto(5)] });
  const fim = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === a.id).comentarios.slice(-1)[0];
  afirmar(fim.tipo === 'CONCLUSAO' && fim.fotos.length === 1, 'foto na conclusao: ' + JSON.stringify(fim).slice(0, 200));
});

caso('fotos: tipo errado, grande demais e mais de 5 de uma vez sao recusados; falha ao gravar nao deixa foto orfa no Drive', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const base = () => ({ acao: 'Teste', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
  const antes = m.arquivos.size;
  afirmar(/não é uma foto/.test(erroDe(() => acao(m, adm, 'salvarAcao', Object.assign(base(), { fotos: [foto(1, 'application/pdf')] })))), 'pdf recusado');
  afirmar(/no máximo 5/.test(erroDe(() => acao(m, adm, 'salvarAcao', Object.assign(base(), { fotos: [1, 2, 3, 4, 5, 6].map((n) => foto(n)) })))), 'seis recusadas');
  const grande = { nome: 'g.jpg', tipo: 'image/jpeg', dados: 'A'.repeat(14 * 1024 * 1024) };
  afirmar(/passa de 10 MB/.test(erroDe(() => acao(m, adm, 'salvarAcao', Object.assign(base(), { fotos: [grande] })))), 'grande recusada');
  const r = acao(m, adm, 'salvarAcao', base());
  acao(m, adm, 'cancelarAcao', { id: r.id, motivo: 'x' });
  afirmar(/cancelada/.test(erroDe(() => acao(m, adm, 'comentarAcao', { id: r.id, texto: 'oi', fotos: [foto(1)] }))), 'cancelada recusa comentario');
  afirmar(m.arquivos.size === antes, 'nada subiu para o Drive: ' + (m.arquivos.size - antes));
  // a planilha falha depois que as fotos subiram: as fotos vao para a lixeira
  const c = ctx(m);
  const admin = { email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') };
  c.inserir = () => { throw new Error('planilha fora do ar'); };
  const e = erroDe(() => c.acaoSalvarAcao(admin, Object.assign(base(), { fotos: [foto(1), foto(2)] })));
  afirmar(/planilha fora do ar/.test(e), 'erro: ' + e);
  const novas = [...m.arquivos.values()].filter((x) => /^foto[12]\.jpg$/.test(x.nome));
  afirmar(novas.length === 2 && novas.every((x) => x.lixo), 'fotos na lixeira: ' + JSON.stringify(novas.map((x) => [x.nome, x.lixo])));
});

caso('versao: os arquivos desta entrega trazem o mesmo carimbo (nada "fora da versao")', () => {
  const c = ctx(new Mundo({ dono: DONO }));
  afirmar(c.arquivosForaDaVersao_().length === 0, 'fora da versao: ' + c.arquivosForaDaVersao_().join());
  const fs = require('fs');
  const ler = (n) => fs.readFileSync(path.join(PASTA, n), 'utf8');
  const build = ler('Codigo.gs').match(/build: '([^']+)'/)[1];
  afirmar(ler('App.html').match(/BUILD_APP = '([^']+)'/)[1] === build && ler('Paineis.html').match(/BUILD_PAINEIS = '([^']+)'/)[1] === build, 'telas no carimbo ' + build);
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const r = JSON.parse(chamar(m, DONO, 'retomarSessao', { t: s.t, f: s.f }).valor);
  afirmar(r.app && r.app.build === build && Array.isArray(r.app.foraDaVersao) && !r.app.foraDaVersao.length, 'sessao: ' + JSON.stringify(r.app));
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

caso('perfil SUPERVISOR cuida so da Limpeza: plano e estoque da limpeza; nada do calendario nem do estoque de TI', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarUsuario', { email: SUP, nome: 'Sup Limpeza', perfil: 'SUPERVISOR', turno: '', filiais: '*', papel: 'Supervisor' });
  const sup = entrar(m, SUP, '2222');
  const r = JSON.parse(chamar(m, SUP, 'retomarSessao', { t: sup.t, f: sup.f }).valor);
  afirmar(r.telas.map((t) => t.id).join() === 'limpeza', 'telas: ' + r.telas.map((t) => t.id).join());
  acao(m, sup, 'salvarItemLimpeza', { nome: 'Saco de lixo 100L', unidade: 'pct', saldoInicial: '5' });
  acao(m, sup, 'salvarAcaoLimpeza', { acao: 'Lixeira da doca cheia', prazo: '2026-12-01', turno: 'B', responsaveisEmails: [SUP], zona: 'Z3', criticidade: 'Média' });
  const d = tela(m, sup, 'limpeza');
  afirmar(d.estoque.itens.length === 1 && d.plano.lista.length === 1 && d.plano.permissoes.gerir && d.plano.lista[0].zona === 'Z3', 'dados da limpeza');
  afirmar(erroDe(() => acao(m, sup, 'salvarAcao', { acao: 'x', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [SUP] })), 'nao cria acao do calendario');
  afirmar(erroDe(() => acao(m, sup, 'salvarItemEstoque', { nome: 'Mouse' })), 'nao mexe no estoque de TI');
  const mail = m.emails.find((e) => /Nova ação da limpeza: Lixeira/.test(e.subject));
  afirmar(mail && /tela=limpeza/.test(mail.html || mail.htmlBody || mail.body || '') && /Z3/.test(mail.html || mail.htmlBody || mail.body || ''), 'e-mail com o local e o link para a Limpeza');
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

caso('comentarios: historico no Plano de Acao (andamento, depende de, concluir) e na Limpeza', () => {
  const m = mundo();
  const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarUsuario', { email: 'pedro@bartofil.com.br', nome: 'Pedro', perfil: 'COORDENADOR', turno: 'B', filiais: '*', papel: 'Coord' });
  acao(m, adm, 'salvarAcao', { acao: 'Trocar lâmpadas', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
  const maria = entrar(m, COORD, '1234');
  let a = tela(m, maria, 'acoes', { situacao: 'TODAS' }).lista[0];
  const e0 = erroDe(() => acao(m, maria, 'comentarAcao', { id: a.id, texto: '' }));
  afirmar(/Escreva o comentário/.test(e0), 'texto vazio: ' + e0);
  acao(m, maria, 'comentarAcao', { id: a.id, texto: 'Lâmpadas compradas', situacao: 'Aguardando', depende: 'manutenção agendar' });
  const pedro = entrar(m, 'pedro@bartofil.com.br', '2222');
  const e1 = erroDe(() => acao(m, pedro, 'comentarAcao', { id: a.id, texto: 'oi' }));
  afirmar(/Só os responsáveis/.test(e1), 'outro coordenador: ' + e1);
  a = tela(m, maria, 'acoes', { situacao: 'TODAS' }).lista[0];
  afirmar(a.andamento === 'Aguardando' && a.depende === 'manutenção agendar' && a.comentarios.length === 1 && a.comentarios[0].nome === 'Maria Souza', 'apos 1o: ' + JSON.stringify(a).slice(0, 300));
  acao(m, maria, 'comentarAcao', { id: a.id, texto: 'Trocadas as 14 lâmpadas', situacao: 'Concluída' });
  a = tela(m, maria, 'acoes', { situacao: 'TODAS' }).lista[0];
  afirmar(a.situacao === 'CONCLUIDA' && a.comentarios.length === 2 && a.comentarios[1].texto === 'Trocadas as 14 lâmpadas' && !a.depende, 'concluida pelo comentario');
  // Limpeza: o mesmo modelo
  acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Piso quebrado', descricao: 'Trocar piso', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [DONO], zona: 'Z2' });
  let la = tela(m, adm, 'limpeza').plano.lista.find((x) => x.acao === 'Piso quebrado');
  acao(m, adm, 'comentarAcaoLimpeza', { id: la.id, texto: 'Orçamento pedido', situacao: 'Aguardando', depende: 'aprovação da gerência' });
  la = tela(m, adm, 'limpeza').plano.lista.find((x) => x.id === la.id);
  afirmar(la.andamento === 'Aguardando' && la.depende === 'aprovação da gerência' && la.comentarios.length === 1, 'limpeza: ' + JSON.stringify(la).slice(0, 300));
  acao(m, adm, 'comentarAcaoLimpeza', { id: la.id, texto: 'Piso trocado', situacao: 'Concluída' });
  la = tela(m, adm, 'limpeza').plano.lista.find((x) => x.id === la.id);
  afirmar(la.situacao === 'CONCLUIDA' && la.concluidoEm && la.comentarios.length === 2 && la.comentarios[1].tipo === 'CONCLUSAO' && !la.depende, 'limpeza concluida');
});

caso('historico das acoes: cada registro guarda quem fez (e-mail, nome do cadastro, funcao) — inclusive concluir, reabrir e cancelar', () => {
  const m = mundo();
  const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
  const maria = entrar(m, COORD, '1234');
  let a = tela(m, maria, 'acoes', { situacao: 'TODAS' }).lista[0];
  acao(m, maria, 'comentarAcao', { id: a.id, texto: 'Comprei as lâmpadas', situacao: 'Em andamento', autor: 'falsificado@x.com', nome: 'Outro' });
  acao(m, maria, 'concluirAcao', { id: a.id, observacao: '14 lâmpadas trocadas' });
  acao(m, adm, 'reabrirAcao', { id: a.id });
  acao(m, adm, 'cancelarAcao', { id: a.id, motivo: 'Obra da diretoria vai trocar tudo' });
  a = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === a.id);
  const h = a.comentarios;
  afirmar(h.length === 4, 'quatro registros: ' + h.map((c) => c.tipo).join(','));
  afirmar(h[0].autor === COORD && h[0].nome === 'Maria Souza' && /Coordenadora · turno A/.test(h[0].papel) && h[0].tipo === 'COMENTARIO', 'comentario da Maria: ' + JSON.stringify(h[0]));
  afirmar(h[1].tipo === 'CONCLUSAO' && h[1].autor === COORD && h[1].texto === '14 lâmpadas trocadas', 'conclusao: ' + JSON.stringify(h[1]));
  afirmar(h[2].tipo === 'REABERTURA' && h[2].autor === DONO, 'reabertura: ' + JSON.stringify(h[2]));
  afirmar(h[3].tipo === 'CANCELAMENTO' && /Obra da diretoria/.test(h[3].texto), 'cancelamento: ' + JSON.stringify(h[3]));
  afirmar(h.every((c) => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(c.em)), 'data e hora em todos');
  afirmar(a.criadoPorNome && a.criadoEm, 'quem criou: ' + a.criadoPorNome + ' ' + a.criadoEm);
  // administrador simulando um coordenador fica registrado com o nome dele, nao "Simulando ..."
  acao(m, adm, 'salvarAcao', { acao: 'Outra', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [DONO] });
  const outra = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.acao === 'Outra');
  const r = chamar(m, DONO, 'simularPerfil', 'COORDENADOR', 'A', { t: adm.t, f: adm.f });
  afirmar(r.ok, 'simulou: ' + JSON.stringify(r.erro || ''));
  acao(m, adm, 'comentarAcao', { id: outra.id, texto: 'Teste em simulação' });
  chamar(m, DONO, 'encerrarSimulacao', { t: adm.t, f: adm.f });
  const c = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === outra.id).comentarios[0];
  afirmar(c && c.autor === DONO && !/Simulando/.test(c.nome) && /simulando COORDENADOR/.test(c.papel), 'simulacao: ' + JSON.stringify(c));
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
