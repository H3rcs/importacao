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
const { miniaturaDrive, pastasDeConversao, HEIC_MINI, JPEG_MINI } = require('./emulador/miniatura-drive.js');

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
  const pelaPortaGenerica = chamar(m, 'pedro@bartofil.com.br', 'obterAnexo', { t: pedro.t, f: pedro.f }, a.fotos[0].id);
  afirmar(!pelaPortaGenerica.ok && /Plano de Ação/.test(pelaPortaGenerica.erro.message), 'obterAnexo nao entrega foto de acao: ' + JSON.stringify(pelaPortaGenerica.erro || pelaPortaGenerica.valor).slice(0, 120));
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

/*
 * FOTO HEIC (19/10): o Chrome nao abre a foto do iPhone. A tela manda cada HEIC
 * sozinha para o converterFoto, que devolve a miniatura do Drive; a HEIC que ja
 * esta gravada sai convertida no visor (fotoAcao). A miniatura e roteirizada
 * pelo UrlFetch (emulador/miniatura-drive.js).
 */
const heic = (nome) => ({ nome: nome || 'IMG_0001.HEIC', tipo: 'image/heic', dados: HEIC_MINI });

caso('fotos HEIC: converterFoto devolve a miniatura do Drive em JPEG (=s1600, com o token) e a pasta temporaria vai para a lixeira; sem miniatura a tempo, pendente (9 consultas contadas, nao pelo relogio)', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const drive = miniaturaDrive(m, { atraso: 2 });
  const r = acao(m, adm, 'converterFoto', { foto: heic() });
  afirmar(r.dados === JPEG_MINI && r.tipo === 'image/jpeg' && r.nome === 'IMG_0001.jpg' && !r.pendente, 'convertida: ' + JSON.stringify(r).slice(0, 120));
  afirmar(drive.log.join(' | ') === 'files.get #1 sem link (Bearer) | files.get #2 sem link (Bearer) | files.get #3 link (Bearer) | miniatura =s1600 (Bearer)',
    'caminho: ' + drive.log.join(' | '));
  let pastas = pastasDeConversao(m);
  afirmar(pastas.length === 1 && pastas[0].lixo, 'pasta temporaria na lixeira: ' + JSON.stringify(pastas.map((p) => [p.nome, p.lixo])));
  const gravada = [...m.arquivos.values()].filter((a) => a.pais.has(pastas[0].id));
  afirmar(gravada.length === 1 && gravada[0].mime === 'image/heic', 'a HEIC vai ao Drive como image/heic (para ele gerar a miniatura): ' + JSON.stringify(gravada.map((a) => a.mime)));
  drive.roteiro.nunca = true; drive.log.length = 0;
  const p = acao(m, adm, 'converterFoto', { foto: heic('IMG_0002.HEIC') });
  afirmar(p.pendente === true && !p.dados, 'pendente: ' + JSON.stringify(p));
  afirmar(drive.log.length === 9 && drive.log.every((l) => /^files\.get #\d sem link \(Bearer\)$/.test(l)), 'consultas: ' + drive.log.join(' | '));
  pastas = pastasDeConversao(m);
  afirmar(pastas.length === 2 && pastas.every((x) => x.lixo), 'as duas pastas na lixeira');
});

caso('fotos HEIC: a miniatura e conferida pelos bytes (pagina de login nao vira foto; PNG vem como PNG); link com outro tamanho ou sem tamanho vira =s1600; rede caindo da pendente; Drive falhando da o erro — a pasta sempre vai para a lixeira', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const drive = miniaturaDrive(m, { imagem: 'html' });
  afirmar(acao(m, adm, 'converterFoto', { foto: heic() }).pendente === true, 'pagina HTML com HTTP 200 nao vira foto');
  drive.roteiro.imagem = 'png';
  const png = acao(m, adm, 'converterFoto', { foto: heic() });
  afirmar(png.tipo === 'image/png' && png.nome === 'IMG_0001.png', 'png: ' + png.tipo + ' ' + png.nome);
  for (const link of ['w200-h190-p-k-nu', 's220?authuser=0', '']) {
    Object.assign(drive.roteiro, { imagem: 'jpeg', link: link }); drive.log.length = 0;
    afirmar(acao(m, adm, 'converterFoto', { foto: heic() }).tipo === 'image/jpeg', 'link "' + link + '"');
    afirmar(drive.log.slice(-1)[0] === 'miniatura =s1600 (Bearer)', 'link "' + link + '": ' + drive.log.join(' | '));
  }
  drive.roteiro.lancar = true;
  afirmar(acao(m, adm, 'converterFoto', { foto: heic() }).pendente === true, 'rede caindo: pendente');
  afirmar(pastasDeConversao(m).length === 6 && pastasDeConversao(m).every((p) => p.lixo), 'pastas: ' + JSON.stringify(pastasDeConversao(m).map((p) => [p.nome, p.lixo])));
  const novoArquivo = m.novoArquivo;
  m.novoArquivo = function (nome) { if (/^IMG_/.test(nome)) throw new Error('Drive cheio'); return novoArquivo.apply(this, arguments); };
  try { afirmar(/Drive cheio/.test(erroDe(() => acao(m, adm, 'converterFoto', { foto: heic() }))), 'o erro do Drive sobe'); }
  finally { m.novoArquivo = novoArquivo; }
  afirmar(pastasDeConversao(m).length === 7 && pastasDeConversao(m).every((p) => p.lixo), 'a da falha tambem foi para a lixeira');
});

caso('fotos HEIC: converterFoto recusa o que nao e HEIC pelos bytes, mais de 10 MB e sem foto (sem criar nada no Drive); a porta e de quem ve o calendario OU a limpeza', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  miniaturaDrive(m);
  const antes = m.arquivos.size + m.pastas.size;
  const e1 = erroDe(() => acao(m, adm, 'converterFoto', { foto: { nome: 'x.heic', tipo: 'image/heic', dados: JPEG_MINI } }));
  afirmar(e1 === 'converterFoto: "x.heic" não é uma foto HEIC.', 'JPEG fingindo HEIC: ' + e1);
  afirmar(/passa de 10 MB/.test(erroDe(() => acao(m, adm, 'converterFoto', { foto: { nome: 'g.heic', tipo: 'image/heic', dados: 'A'.repeat(14 * 1024 * 1024) } }))), 'grande');
  afirmar(/não é uma foto/.test(erroDe(() => acao(m, adm, 'converterFoto', { foto: { nome: 'a.pdf', tipo: 'application/pdf', dados: HEIC_MINI } }))), 'tipo');
  afirmar(erroDe(() => acao(m, adm, 'converterFoto', {})) === 'converterFoto: Nenhuma foto chegou.', 'sem foto');
  afirmar(m.arquivos.size + m.pastas.size === antes, 'nada criado no Drive');
  acao(m, adm, 'salvarUsuario', { email: SUP, nome: 'Sup Limpeza', perfil: 'SUPERVISOR', turno: '', filiais: '*', papel: 'Supervisor' });
  afirmar(acao(m, entrar(m, SUP, '2222'), 'converterFoto', { foto: heic() }).dados === JPEG_MINI, 'supervisor (so a limpeza) converte');
  afirmar(acao(m, entrar(m, COORD, '1234'), 'converterFoto', { foto: heic() }).dados === JPEG_MINI, 'coordenadora (so o calendario) converte');
  const reg = ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === COORD);
  acao(m, adm, 'definirModuloPessoa', { id: reg.ID, modulo: 'calendario', modo: 'NAO' });
  const e2 = erroDe(() => acao(m, entrar(m, COORD, '1234'), 'converterFoto', { foto: heic() }));
  afirmar(/não tem acesso ao módulo/.test(e2), 'sem calendario e sem limpeza: ' + e2);
});

caso('fotos HEIC: o visor converte a HEIC ja gravada (da versao anterior, ou miniatura que nao estava pronta) — acao e comentario, nos dois planos; sem miniatura vai a original; a JPEG nao passa pela miniatura', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const drive = miniaturaDrive(m);
  // como a versao anterior gravava: a HEIC crua, image/heic
  const r = acao(m, adm, 'salvarAcao', { acao: 'Doca 3', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD], fotos: [heic('IMG_0009.HEIC'), foto(1)] });
  acao(m, adm, 'comentarAcao', { id: r.id, texto: 'Antes do conserto', fotos: [heic('IMG_0010.HEIC')] });
  const a = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === r.id);
  const v = acao(m, adm, 'fotoAcao', { id: r.id, arquivo: a.fotos[0].id });
  afirmar(v.convertida && v.tipo === 'image/jpeg' && v.dados === JPEG_MINI && v.nome === 'IMG_0009.jpg', 'da acao: ' + JSON.stringify(v).slice(0, 120));
  const vc = acao(m, adm, 'fotoAcao', { id: r.id, arquivo: a.comentarios[0].fotos[0].id });
  afirmar(vc.convertida && vc.dados === JPEG_MINI && vc.nome === 'IMG_0010.jpg', 'do comentario: ' + JSON.stringify(vc).slice(0, 120));
  drive.log.length = 0;
  const j = acao(m, adm, 'fotoAcao', { id: r.id, arquivo: a.fotos[1].id });
  afirmar(j.dados === PNG_1x1 && !j.convertida && !drive.log.length, 'a JPEG vai como esta, sem consulta: ' + drive.log.join(' | '));
  drive.roteiro.nunca = true;
  const o = acao(m, adm, 'fotoAcao', { id: r.id, arquivo: a.fotos[0].id });
  afirmar(o.tipo === 'image/heic' && o.dados === HEIC_MINI && !o.convertida && drive.log.length === 5, 'sem miniatura (5 consultas, 6 s): ' + o.tipo + ' ' + drive.log.length);
  drive.roteiro.nunca = false;
  const l = acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Banheiro', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE], fotos: [heic('IMG_0011.HEIC')] });
  const al = tela(m, adm, 'limpeza').plano.lista.find((x) => x.id === l.id);
  const vl = acao(m, adm, 'fotoAcaoLimpeza', { id: l.id, arquivo: al.fotos[0].id });
  afirmar(vl.convertida && vl.dados === JPEG_MINI && vl.nome === 'IMG_0011.jpg', 'limpeza: ' + JSON.stringify(vl).slice(0, 120));
  afirmar(/não é desta ação/.test(erroDe(() => acao(m, adm, 'fotoAcao', { id: r.id, arquivo: al.fotos[0].id }))), 'foto de outra acao continua barrada');
});

caso('versao: cada arquivo traz o carimbo da entrega em que mudou; arquivo esquecido ou da entrega anterior aparece na faixa', () => {
  const c = ctx(new Mundo({ dono: DONO }));
  afirmar(c.arquivosForaDaVersao_().length === 0, 'fora da versao: ' + c.arquivosForaDaVersao_().join());
  const fs = require('fs'), os = require('os');
  const ler = (n) => fs.readFileSync(path.join(PASTA, n), 'utf8');
  const build = ler('Codigo.gs').match(/build: '([^']+)'/)[1];
  const app = ler('App.html');
  afirmar(app.match(/BUILD_APP = '([^']+)'/)[1] === build, 'App.html no carimbo ' + build);
  const esperaAprendiz = app.match(/BUILD_APRENDIZ_TELA !== '([^']+)'/)[1];
  afirmar(ler('Aprendiz.html').match(/BUILD_APRENDIZ_TELA = '([^']+)'/)[1] === esperaAprendiz, 'Aprendiz.html no carimbo que o App.html espera (' + esperaAprendiz + ')');
  const esperaPE = app.match(/carimboCss\('--gsl-paineis-estilo'\) !== '([^']+)'/)[1];
  afirmar(ler('PaineisEstilo.html').match(/--gsl-paineis-estilo: '([^']+)'/)[1] === esperaPE, 'PaineisEstilo.html no carimbo que o App.html espera (' + esperaPE + ')');
  const esperaEstilo = app.match(/carimboDoEstilo\(\) !== '([^']+)'/)[1];
  afirmar(ler('Estilo.html').match(/--gsl-estilo: '([^']+)'/)[1] === esperaEstilo, 'Estilo.html no carimbo que o App.html espera (' + esperaEstilo + ')');
  afirmar(/var GSL_T0 = Date\.now\(\)/.test(ler('Index.html')) && /id="entrar-continuar"/.test(ler('Index.html')) && /id="lateral-alternar"/.test(ler('Index.html')),
    'Index.html com o que o App.html confere');
  const esperaPaineis = app.match(/BUILD_PAINEIS !== '([^']+)'/)[1];
  afirmar(ler('Paineis.html').match(/BUILD_PAINEIS = '([^']+)'/)[1] === esperaPaineis, 'Paineis.html no carimbo que o App.html espera (' + esperaPaineis + ')');
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const r = JSON.parse(chamar(m, DONO, 'retomarSessao', { t: s.t, f: s.f }).valor);
  afirmar(r.app && r.app.build === build && Array.isArray(r.app.foraDaVersao) && !r.app.foraDaVersao.length, 'sessao: ' + JSON.stringify(r.app));
  // implantacao pela metade: Filiais.gs da entrega anterior (carimbo velho) e Aprendiz.gs esquecido
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-versao-'));
  try {
    fs.readdirSync(PASTA).forEach((n) => fs.copyFileSync(path.join(PASTA, n), path.join(tmp, n)));
    fs.writeFileSync(path.join(tmp, 'Filiais.gs'), ler('Filiais.gs').replace(/BUILD_FILIAIS = '[^']+'/, "BUILD_FILIAIS = '2026.10.09'"));
    fs.unlinkSync(path.join(tmp, 'Aprendiz.gs'));
    fs.unlinkSync(path.join(tmp, 'Aprendiz.html'));
    const c2 = novaExecucao(new Mundo({ dono: DONO }), tmp, { contaGoogle: DONO }, OP);
    const fora = c2.arquivosForaDaVersao_();
    afirmar(fora.join() === 'Filiais.gs,Aprendiz.gs', 'a faixa diz quais faltam: ' + fora.join());
    // a tela do modulo esquecida nao derruba a pagina (a faixa da tela avisa); as do nucleo continuam obrigatorias
    afirmar(c2.include('Aprendiz') === '' && c2.include('App').length > 1000, 'include tolerante so para a tela do modulo');
    afirmar(erroDe(() => c2.include('App2')) !== '', 'arquivo do nucleo que falta continua dando erro');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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

caso('rotinas pela porta (19/10): a Configuracao traz as pendentes da rotina e os meses gerados; Desativar exige PROGRAMAR e tira a rotina do calendario', () => {
  const m = new Mundo({ dono: DONO, agora: '2026-10-19T10:00:00-03:00' });
  ctx(m).instalar(DONO);
  const c = ctx(m);
  c.acaoSalvarUsuario({ email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') }, { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
  const adm = entrar(m, DONO, '4321');
  tela(m, adm, 'calendario', { competencia: 'OUT 2026' });      // abrir o mes gera, como o gerente faz
  tela(m, adm, 'calendario', { competencia: 'NOV 2026' });
  const r = acao(m, adm, 'salvarRotina', { tipo: 'RON', atividade: 'Ronda', frequencia: 'SEMANAL', dia: '3', porTurno: false, ativo: true });
  afirmar(r.invalidarTudo && r.recado === 'Rotina salva. No calendário: 2 criadas em OUT 2026 e 4 em NOV 2026 (de hoje em diante).', r.recado);
  const cfg = tela(m, adm, 'config');
  const ron = cfg.rotinas.find((x) => x.tipo === 'RON');
  afirmar(ron.pendentes.total === 6 && ron.temAtividades && cfg.mesesGerados.join() === 'OUT 2026,NOV 2026', JSON.stringify([ron, cfg.mesesGerados]));
  const coord = entrar(m, COORD, '1234');
  afirmar(/nao pode executar/.test(erroDe(() => acao(m, coord, 'alternarRotina', { id: ron.id, ativo: false }))), 'coordenador recusado');
  const d = acao(m, adm, 'alternarRotina', { id: ron.id, ativo: false });
  afirmar(d.invalidarTudo && d.recado === 'Rotina desativada. 6 atividades pendentes canceladas (OUT 2026: 2 · NOV 2026: 4).', d.recado);
  afirmar(!tela(m, adm, 'calendario', { competencia: 'NOV 2026' }).atividades.some((a) => a.tipo === 'RON'), 'NOV sem a rotina');
  afirmar(tela(m, adm, 'config').rotinas.find((x) => x.tipo === 'RON').ativo === false, 'parada na lista');
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
/* PAINEL DESATIVADO SOME DE TODOS (19/10) · ESTOQUE · TROCAR PIN      */
/* ------------------------------------------------------------------ */

const sessaoDe = (m, s) => JSON.parse(chamar(m, s.email, 'retomarSessao', { t: s.t, f: s.f }).valor);
const cartoes = (menu) => menu.modulos.map((q) => q.id + (q.oculto ? '(oculto)' : '')).join(',');
/* A gravacao como a tela faz (agir): a acao e a tela de Filiais e paineis numa ida so — com o menu novo. */
const gravarNaTela = (m, s, nome, params, idTela) =>
  JSON.parse(chamar(m, s.email, 'executarAcaoETela', { t: s.t, f: s.f }, nome, params, idTela || 'filiais', {}).valor);

/*
 * 19/10 (substitui o "ADMIN ve todas as telas e paineis" da 4.2.2): o ADMIN continua com todas as
 * telas e permissoes sem depender da tabela PERFIS, mas nos paineis vale o estado da filial.
 */
caso('ADMIN com PERFIS incompleto (banco antigo) nunca fica trancado fora da Configuracao; painel fora da filial some ate para ele e volta ao ligar (Oculto com a etiqueta)', () => {
  const m = mundo(); const c = ctx(m);
  // banco antigo: linha ADMIN sem nenhuma permissao e sem as telas da Configuracao; principal so com calendario e assiduidade
  const adm = c.listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === 'ADMIN');
  const apaga = {};
  Object.keys(adm).forEach((k) => { if (/^TELA_(NOBREAKS|LIMPEZA|QUADRO|ESTOQUE|CONFIG|ACESSOS|FILIAIS|RELATOS)$|^PODE_/.test(k)) apaga[k] = 'NAO'; });
  c.atualizar('PERFIS', adm.ID, apaga, DONO);
  const pr = c.listar('FILIAIS').find((l) => c.marcado(l.PRINCIPAL));
  c.atualizar('FILIAIS', pr.ID, { PAINEIS: JSON.stringify({ calendario: 'ATIVO', assiduidade: 'ATIVO' }) }, DONO);
  m.cache.clear();
  const s = entrar(m, DONO, '4321');
  let r = sessaoDe(m, s);
  const telas = r.telas.map((t) => t.id).join(',');
  afirmar(telas === 'inicio,calendario,acoes,assiduidade,config,acessos,filiais,relatos', 'ADMIN: ' + telas);
  const capacidades = Object.keys(adm).filter((k) => /^PODE_/.test(k)).map((k) => k.slice(5));
  afirmar(capacidades.length >= 14 && capacidades.every((k) => r.usuario.podes.indexOf(k) !== -1), 'todas as permissoes: ' + r.usuario.podes.join(','));
  afirmar(cartoes(r) === 'calendario,assiduidade,config', 'cartoes: ' + cartoes(r));
  ['config', 'acessos', 'filiais', 'relatos'].forEach((id) => tela(m, s, id));
  afirmar(/não está ligado na filial/.test(erroDe(() => tela(m, s, 'estoque'))), 'estoque fora da filial nao abre nem para o ADMIN');
  // ele liga em Filiais e paineis: Ativo para todos, Oculto so para ele (com a etiqueta)
  acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'estoque', estado: 'ATIVO' });
  acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'quadro', estado: 'OCULTO' });
  r = sessaoDe(m, s);
  afirmar(cartoes(r) === 'calendario,assiduidade,quadro(oculto),estoque,config', 'depois de ligar: ' + cartoes(r));
  tela(m, s, 'estoque'); tela(m, s, 'quadro');
  const g = entrar(m, GERENTE, '5555');
  afirmar(cartoes(sessaoDe(m, g)) === 'calendario,assiduidade,estoque,config', 'gerente (sem o oculto): ' + cartoes(sessaoDe(m, g)));
});

caso('painel Desativado ou "Nao usar nesta filial" some para todos, inclusive o ADMIN (menu, tela, acao, atalho e bolinha); Oculto so o ADMIN ve', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321'), g = entrar(m, GERENTE, '5555');
  const nobreaks = (x) => x.modulos.filter((q) => q.id === 'nobreaks').map((q) => 'nobreaks' + (q.oculto ? '(oculto)' : '')).join('');
  const esperado = { ATIVO: ['nobreaks', 'nobreaks'], OCULTO: ['nobreaks(oculto)', ''], DESATIVADO: ['', ''], REMOVER: ['', ''] };
  Object.keys(esperado).forEach((estado) => {
    acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado });
    const ra = sessaoDe(m, s), rg = sessaoDe(m, g);
    afirmar(nobreaks(ra) === esperado[estado][0] && nobreaks(rg) === esperado[estado][1], estado + ': admin "' + nobreaks(ra) + '", gerente "' + nobreaks(rg) + '"');
    afirmar(ra.telas.some((t) => t.id === 'nobreaks') === !!esperado[estado][0], estado + ': tela no menu do admin');
  });
  acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'DESATIVADO' });
  afirmar(/não está ligado na filial CD Feira de Santana/.test(erroDe(() => tela(m, s, 'nobreaks'))), 'ADMIN: tela recusada');
  afirmar(/não tem acesso ao módulo Nobreaks/.test(erroDe(() => acao(m, s, 'semanaNobreak', {}))), 'ADMIN: acao recusada');
  afirmar(!tela(m, s, 'inicio').atalhos.some((t) => t.id === 'nobreaks'), 'ADMIN: sem o atalho na Central');
  // bolinha: o Calendario desativado com acao em aberto nao conta nem para o ADMIN
  acao(m, s, 'salvarAcao', { acao: 'Lâmpadas do flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
  afirmar(acao(m, s, 'pendencias').pendencias.calendario.abertas === 1, 'antes: bolinha do calendario');
  acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'calendario', estado: 'DESATIVADO' });
  const p = acao(m, s, 'pendencias');
  afirmar(!p.pendencias.calendario && !p.menu.telas.some((t) => t.modulo === 'calendario'), 'calendario desativado: ' + JSON.stringify(p.pendencias));
});

caso('alterarPainel devolve o menu novo: o cartao sai e volta sem F5, o recado diz o painel e a filial; outra filial nao mexe no menu; desligar a filial em que esta da semFilial', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  let x = gravarNaTela(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'DESATIVADO' });
  afirmar(x.menu && x.menu.filial === 'FSA' && !x.menu.telas.some((t) => t.id === 'nobreaks') && cartoes(x.menu).indexOf('nobreaks') === -1, 'desativado: ' + (x.menu && cartoes(x.menu)));
  afirmar(x.r.recado === 'Painel Nobreaks desativado em CD Feira de Santana: saiu do menu de todos, inclusive do seu. Os dados continuam guardados.', 'recado: ' + x.r.recado);
  x = gravarNaTela(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'OCULTO' });
  afirmar(/nobreaks\(oculto\)/.test(cartoes(x.menu)) && x.r.recado === 'Painel Nobreaks oculto em CD Feira de Santana: só administradores veem, com a etiqueta oculto.', 'oculto: ' + cartoes(x.menu) + ' / ' + x.r.recado);
  x = gravarNaTela(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'ATIVO' });
  afirmar(/(^|,)nobreaks(,|$)/.test(cartoes(x.menu)) && x.r.recado === 'Painel Nobreaks ativo em CD Feira de Santana: aparece para quem tem o nível liberado.', 'ativo: ' + cartoes(x.menu) + ' / ' + x.r.recado);
  x = gravarNaTela(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'REMOVER' });
  afirmar(cartoes(x.menu).indexOf('nobreaks') === -1 && x.r.recado === 'Painel Nobreaks fora de CD Feira de Santana: saiu do menu de todos.', 'nao usar: ' + x.r.recado);
  // outra filial: o recado diz qual, e o menu (o da filial em uso) nao muda
  acao(m, s, 'salvarFilial', { nome: 'CD Salvador', cidade: 'Salvador', codigo: 'SSA', paineis: { calendario: 'ATIVO', nobreaks: 'ATIVO' } });
  const antes = gravarNaTela(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'ATIVO' }).menu;
  x = gravarNaTela(m, s, 'alterarPainel', { codigo: 'SSA', painel: 'nobreaks', estado: 'DESATIVADO' });
  afirmar(JSON.stringify([x.menu.telas, x.menu.modulos]) === JSON.stringify([antes.telas, antes.modulos]) && /^Painel Nobreaks desativado em CD Salvador:/.test(x.r.recado), 'outra filial: ' + x.r.recado);
  afirmar(x.menu.filiais.map((f) => f.codigo).join() === 'FSA,SSA', 'filiais no menu: ' + JSON.stringify(x.menu.filiais));
  // dentro da SSA, o ADMIN desliga a propria SSA: o menu diz que a filial nao vale mais
  x = gravarNaTela(m, Object.assign({}, s, { f: 'SSA' }), 'alternarFilial', { codigo: 'SSA' });
  afirmar(x.menu && x.menu.semFilial === true && x.menu.filiais.map((f) => f.codigo).join() === 'FSA', 'semFilial: ' + JSON.stringify(x.menu));
});

caso('"Editar nome" da filial grava so o nome e a cidade: a copia velha dos paineis (outra aba) nao religa o painel desativado', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const fsa = tela(m, s, 'filiais').filiais.find((f) => f.codigo === 'FSA');
  const copiaVelha = JSON.parse(JSON.stringify(fsa.paineis));               // nobreaks: ATIVO
  acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'DESATIVADO' });
  const x = gravarNaTela(m, s, 'salvarFilial', { id: fsa.id, nome: 'CD Feira', cidade: fsa.cidade, paineis: copiaVelha });
  const c = ctx(m), pr = c.listar('FILIAIS').find((l) => c.marcado(l.PRINCIPAL));
  afirmar(JSON.parse(pr.PAINEIS).nobreaks === 'DESATIVADO' && pr.NOME === 'CD Feira', 'PAINEIS=' + pr.PAINEIS + ' NOME=' + pr.NOME);
  afirmar(x.menu.filiais.find((f) => f.codigo === 'FSA').nome === 'CD Feira' && cartoes(x.menu).indexOf('nobreaks') === -1, 'menu com o nome novo: ' + JSON.stringify(x.menu.filiais));
});

caso('bolinha (pendencias) traz o menu de agora: quem ja estava dentro ve o painel desligado ao voltar ao menu; mexer no proprio acesso devolve o menu', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321'), maria = entrar(m, COORD, '1234');
  const antes = acao(m, maria, 'pendencias').menu;
  afirmar(antes.filial === 'FSA' && cartoes(antes) === 'calendario,nobreaks', 'antes: ' + cartoes(antes));
  acao(m, s, 'alterarPainel', { codigo: 'FSA', painel: 'nobreaks', estado: 'DESATIVADO' });
  const depois = acao(m, maria, 'pendencias').menu;
  afirmar(cartoes(depois) === 'calendario' && !depois.telas.some((t) => t.id === 'nobreaks'), 'depois: ' + cartoes(depois));
  afirmar(/não está ligado na filial/.test(erroDe(() => tela(m, maria, 'nobreaks'))), 'a tela velha e recusada');
  // o gerente (GERIR_ACESSOS) tira o proprio Estoque: a resposta ja traz o menu sem ele; o de outra pessoa nao
  const g = entrar(m, GERENTE, '5555');
  const idDe = (email) => ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === email).ID;
  const x = gravarNaTela(m, g, 'definirModuloPessoa', { id: idDe(GERENTE), modulo: 'estoque', modo: 'NAO' }, 'acessos');
  afirmar(x.menu && cartoes(x.menu).indexOf('estoque') === -1 && x.tela && x.tela.tela === 'acessos', 'o proprio modulo: ' + (x.menu && cartoes(x.menu)));
  const y = gravarNaTela(m, g, 'definirModuloPessoa', { id: idDe(COORD), modulo: 'estoque', modo: 'VER' }, 'acessos');
  afirmar(y.menu === null && y.tela, 'o acesso de outra pessoa nao rele o menu: ' + JSON.stringify(y.menu));
  const z = gravarNaTela(m, g, 'salvarUsuario', { id: idDe(GERENTE), email: GERENTE, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' }, 'acessos');
  afirmar(z.menu && cartoes(z.menu).indexOf('estoque') === -1, 'salvar a propria ficha tambem devolve o menu: ' + JSON.stringify(z.menu));
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

caso('quadro do CD (layout antigo, sem a GERAL): le as abas APOIO e os admitidos da CADMITIDOS sem data', () => {
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
  afirmar(carla.cod === '3' && carla.equipe === '2° TURNO' && carla.funcao === 'SEPARADOR' && carla.status === 'ATIVO', 'carla: ' + JSON.stringify(carla));
  afirmar(d.adm.filter((a) => a.status === 'EM TREINAMENTO').length === 1, 'status');
  afirmar(d.des.length === 1 && d.geral.length === 2 && d.leitura.layout === 'APOIO', 'desligados ' + d.des.length + ' quadro ' + d.geral.length + ' ' + d.leitura.layout);
  afirmar(d.geral.every((g) => g.equipe === '1° TURNO' && g.nome && g.ativo), 'turno da aba antiga: ' + JSON.stringify(d.geral));
});

caso('quadro do CD: como o STATUS e a EQUIPE escritos na GERAL sao entendidos (EXPERIENCIA e ativo; EX-FUNCIONARIO esta fora)', () => {
  const c = ctx(mundo());
  const st = { 'ATIVO': 'ATIVO', '': 'ATIVO', 'Em treinamento': 'ATIVO', 'EXPERIÊNCIA': 'ATIVO', 'Contrato de experiência': 'ATIVO', 'Aviso prévio': 'ATIVO',
    'INATIVO': 'FORA', 'Desligado': 'FORA', 'DEMITIDO': 'FORA', 'Demissão': 'FORA', 'Ex-funcionário': 'FORA', 'DESATIVADO': 'FORA', 'NÃO': 'FORA', 'Transferido': 'FORA',
    'FÉRIAS': 'FERIAS', 'Em férias': 'FERIAS', 'AFASTADO': 'AFASTADO', 'Afastado INSS': 'AFASTADO', 'Licença maternidade': 'AFASTADO', 'Atestado': 'AFASTADO' };
  Object.keys(st).forEach((v) => afirmar(c.situacaoQ_(v) === st[v], 'STATUS "' + v + '": ' + c.situacaoQ_(v) + ' (esperava ' + st[v] + ')'));
  const eq = { '1° TURNO': '1° TURNO', '1º TURNO': '1° TURNO', '1º turno': '1° TURNO', 'TURNO 1': '1° TURNO', 'T1': '1° TURNO', 'TA': '1° TURNO', 'A': '1° TURNO',
    'Turno A': '1° TURNO', 'PRIMEIRO TURNO': '1° TURNO', '2° TURNO': '2° TURNO', 'TB': '2° TURNO', '3 TURNO': '3° TURNO', 'TC': '3° TURNO',
    'ADM': 'ADM', 'ADMINISTRATIVO': 'ADM', 'TURNO 4': '', '': '' };
  Object.keys(eq).forEach((v) => afirmar(c.equipeQ_(v) === eq[v], 'EQUIPE "' + v + '": "' + c.equipeQ_(v) + '" (esperava "' + eq[v] + '")'));
});

caso('quadro do CD: desligado SEM DATA na CDESLIGADOS que continua ATIVO na GERAL tambem vira inconsistencia (fora dos graficos)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'], ['1° TURNO', '1', 'ANA LIMA', 'SEPARADOR', '101', 'ATIVO'],
      ['2° TURNO', '2', 'BRUNO DIAS', 'CONFERENTE', '102', 'ATIVO']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'STATUS']],
    'CDESLIGADOS': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO'], ['2', 'BRUNO DIAS', 'TB', 'CONFERENTE', '', 'VOLUNTÁRIO', 'Outro emprego']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.des.length === 0 && d.desSemData.length === 1, 'sem data fica fora do periodo: des ' + d.des.length + ' semData ' + (d.desSemData || []).length);
  const da = d.inconsistencias.filter((x) => x.tipo === 'DESLIGADO_ATIVO');
  afirmar(da.length === 1 && da[0].cod === '2' && da[0].data === '' && /sem data/.test(da[0].detalhe), 'desligado sem data e ativo: ' + JSON.stringify(da));
  afirmar(d.leitura.des && d.leitura.des.linhas === 1 && d.leitura.des.semData === 1 && d.leitura.adm && d.leitura.adm.linhas === 0,
    'resumo das abas: ' + JSON.stringify([d.leitura.adm, d.leitura.des]));
});

caso('quadro do CD: homonimo (ou COD digitado errado) vira atencao; COD de preenchimento, desligamento futuro e recontratado nao viram aviso; COD RH e matricula', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO DO SETOR', 'CARGO ATUAL', 'COD RH', 'STATUS'],
      ['1° TURNO', '-', 'ANA LIMA', 'EXPEDICAO', 'SEPARADOR', '101', 'ATIVO'],
      ['1° TURNO', '30002', 'JOSE SILVA', 'EXPEDICAO', 'SEPARADOR', '102', 'ATIVO'],
      ['2° TURNO', '30003', 'CARLOS ROCHA', 'EXPEDICAO', 'CONFERENTE', '103', 'ATIVO'],
      ['2° TURNO', '30004', 'DORA MELO', 'EXPEDICAO', 'CONFERENTE', '104', 'ATIVO']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'STATUS', 'DATA ADMISSÃO'], ['30004', 'DORA MELO', 'TB', 'CONFERENTE', 'ATIVO', D(-5)]],
    'CDESLIGADOS': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO'],
      ['-', 'MARIA SOUZA', 'TA', 'SEPARADOR', D(-30), 'VOLUNTÁRIO', ''],          // COD "-" nao casa com a ANA (COD "-")
      ['99999', 'JOSE SILVA', 'TA', 'SEPARADOR', D(-20), 'VOLUNTÁRIO', ''],      // homonimo: outro produtivo
      ['30003', 'CARLOS ROCHA', 'TB', 'CONFERENTE', D(10), 'INVOLUNTÁRIO', ''],  // aviso previo: sai daqui a 10 dias
      ['30004', 'DORA MELO', 'TB', 'CONFERENTE', D(-60), 'VOLUNTÁRIO', '']]      // recontratada (admitida de novo ha 5 dias)
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro, 'erro: ' + d.erro);
  afirmar(d.leitura.colunas.funcao === 'CARGO ATUAL' && d.leitura.colunas.rh === 'COD RH' && d.leitura.colunas.cod === 'COD', 'colunas pela prioridade: ' + JSON.stringify(d.leitura.colunas));
  // a recontratada (admitida de novo depois da saida), o aviso previo e o COD "-" nao geram nada; o homonimo pede conferencia (tipo proprio)
  afirmar(!d.inconsistencias.some((x) => x.tipo === 'DESLIGADO_ATIVO'), 'nenhum desligado ativo: ' + JSON.stringify(d.inconsistencias));
  const mn = d.inconsistencias.filter((x) => x.tipo === 'MESMO_NOME');
  afirmar(mn.length === 1 && mn[0].cod === '30002' && mn[0].gravidade === 'atencao' && /o COD é 99999 na CDESLIGADOS e 30002 na GERAL/.test(mn[0].detalhe),
    'so o homonimo, como atencao: ' + JSON.stringify(mn));
  // o "apoio" de transicao (13/10) saiu; sem a aba FÉRIAS, ferias = null e nenhuma conferencia de ferias
  afirmar(d.apoio === undefined && d.ferias === null && d.leitura.ferias === null && !d.inconsistencias.some((x) => /^FERIAS_/.test(x.tipo)),
    'sem apoio e sem ferias: ' + JSON.stringify([d.apoio, d.ferias]));
  // planilha sem a GERAL (nem as APOIO): erro que diz o que fazer, e nada fica guardado no cache
  const semAba = planilhaAntiga(m, 'Outra planilha', { 'QUADRO': [['EQUIPE', 'COD', 'PROD']], 'CDESLIGADOS': [['COD']] });
  acao(m, s, 'salvarFonteQuadro', { link: semAba });
  const d2 = tela(m, s, 'quadro');
  afirmar(/Não achei a aba GERAL na planilha «Outra planilha»/.test(d2.erro || '') && !/Confira se o link/.test(d2.erro), 'sem a aba: ' + d2.erro);
});

caso('quadro do CD: EQUIPE e DESCRICAO em celulas mescladas valem para todas as linhas do bloco (o Sheets so devolve a primeira)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['QUADRO GERAL'], ['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '1', 'ANA', 'SEPARADOR', '101', 'ATIVO'], ['', '2', 'BRUNO', '', '102', 'ATIVO'], ['', '3', 'CARLA', '', '103', 'ATIVO'],
      ['2° TURNO', '4', 'DIEGO', 'CONFERENTE', '104', 'ATIVO'], ['', '5', 'EVA', 'CONFERENTE', '105', 'ATIVO'],
      ['', '6', 'FABIO', 'CONFERENTE', '106', 'ATIVO']],                       // esta ultima nao esta em mesclagem nenhuma
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR']], 'CDESLIGADOS': [['COD', 'COLABORADOR']]
  });
  const pl = m.planilhas.get(link.split('/d/')[1].split('/')[0]);
  const geral = pl.abas.find((a) => a.nome === 'GERAL');
  geral.mescladas = [[1, 1, 1, 6], [3, 1, 3, 1], [3, 4, 3, 1], [6, 1, 2, 1]];   // titulo, 1° TURNO (3 linhas), SEPARADOR (3), 2° TURNO (so 2)
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  const por = (nome) => d.geral.find((g) => g.nome === nome);
  afirmar(['ANA', 'BRUNO', 'CARLA'].every((n) => por(n).equipe === '1° TURNO' && por(n).funcao === 'SEPARADOR') && por('EVA').equipe === '2° TURNO',
    'mescladas preenchidas: ' + JSON.stringify(d.geral.map((g) => [g.nome, g.equipe, g.funcao])));
  afirmar(por('FABIO').equipe === '' && d.inconsistencias.some((x) => x.tipo === 'EQUIPE' && x.nome === 'FABIO'), 'fora da mesclagem continua sem turno (e vira aviso)');
  afirmar(d.leitura.mescladas === 5, 'linhas completadas: ' + d.leitura.mescladas);
});

caso('quadro do CD: "COD COLABORADOR" nao vira o nome, "DATA ADMISSAO" nao vira a saida, data impossivel conta como sem data; a versao entra na chave das telas', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'], ['1° TURNO', '30001', 'ANA LIMA', 'SEPARADOR', '101', 'ATIVO'],
      ['1° TURNO', '30002', 'BRUNO DIAS', 'SEPARADOR', '102', 'ATIVO'], ['2° TURNO', '30003', 'CARLA REIS', 'CONFERENTE', '103', 'ATIVO']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR', 'DATA NASCIMENTO', 'ADMITIDO EM'], ['30003', 'CARLA REIS', '15/01/1995', '01/09/2026']],
    'CDESLIGADOS': [['COD COLABORADOR', 'NOME COLABORADOR', 'DATA ADMISSÃO', 'DATA SAÍDA', 'TIPO'],
      ['30001', 'ANA LIMA', '02/05/2019', '20/09/2026', 'VOLUNTÁRIO'],
      ['30002', 'BRUNO DIAS', '02/05/2019', '09/15/2026', 'VOLUNTÁRIO']]      // formato americano colado como texto: mes 15
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro, 'erro: ' + d.erro);
  const ana = d.des.find((x) => x.cod === '30001');
  afirmar(ana && ana.nome === 'ANA LIMA' && ana.data === '2026-09-20', 'nome e data da saida pelas colunas certas: ' + JSON.stringify(d.des));
  afirmar(d.desSemData.length === 1 && d.desSemData[0].cod === '30002', 'data impossivel = sem data: ' + JSON.stringify(d.desSemData));
  afirmar(d.adm.length === 1 && d.adm[0].data === '2026-09-01', 'admissao pela coluna certa (nao a de nascimento): ' + JSON.stringify(d.adm));
  const da = d.inconsistencias.filter((x) => x.tipo === 'DESLIGADO_ATIVO').map((x) => x.cod + ':' + x.gravidade).sort().join();
  afirmar(da === '30001:grave,30002:grave', 'os dois desligados ativos aparecem: ' + da);
  // a chave das telas guardadas leva o carimbo: uma implantacao nova nao serve a tela montada pelo codigo anterior
  const c = ctx(m);
  const u = { email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') };
  const k = c.chaveDeTela('quadro', u, {});
  afirmar(k.split('|')[1] === /build: '([^']+)'/.exec(require('fs').readFileSync(PASTA + '/Codigo.gs', 'utf8'))[1], 'carimbo na chave da tela: ' + k);
});

caso('quadro do CD: recontratacao so cala o aviso quando a admissao casa por NUMERO; com numero novo nao vira "mesmo nome"; saida nova sem data depois da readmissao avisa', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '30010', 'JOSE SILVA', 'SEPARADOR', '100', 'ATIVO'],        // desligado de verdade; um homonimo foi admitido sem produtivo
      ['1° TURNO', '30200', 'MARIA SOUZA', 'SEPARADOR', '200', 'ATIVO'],       // recontratada com COD novo
      ['2° TURNO', '30300', 'DORA MELO', 'CONFERENTE', '300', 'ATIVO']],       // recontratada que saiu de novo (linha nova sem data)
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'STATUS', 'DATA ADMISSÃO'],
      ['', 'JOSE SILVA', 'TB', 'CONFERENTE', 'EM TREINAMENTO', D(-5)],
      ['30200', 'MARIA SOUZA', 'TA', 'SEPARADOR', 'ATIVO', D(-10)],
      ['30300', 'DORA MELO', 'TB', 'CONFERENTE', 'ATIVO', D(-90)]],
    'CDESLIGADOS': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO'],
      ['30010', 'JOSE SILVA', 'TA', 'SEPARADOR', D(-30), 'INVOLUNTÁRIO', 'Faltas'],
      ['30010', 'MARIA SOUZA', 'TA', 'SEPARADOR', D(-60), 'VOLUNTÁRIO', ''],
      ['30300', 'DORA MELO', 'TB', 'CONFERENTE', D(-200), 'VOLUNTÁRIO', ''],
      ['30300', 'DORA MELO', 'TB', 'CONFERENTE', '', 'INVOLUNTÁRIO', 'Faltas']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro, 'erro: ' + d.erro);
  const graves = d.inconsistencias.filter((x) => x.tipo === 'DESLIGADO_ATIVO').map((x) => x.cod + ':' + x.gravidade).sort().join();
  afirmar(graves === '30010:grave,30300:grave', 'JOSE (admissao so pelo nome nao cala) e DORA (saida nova sem data) avisam: ' + JSON.stringify(d.inconsistencias));
  afirmar(!d.inconsistencias.some((x) => x.cod === '30200'), 'MARIA, recontratada com COD novo, sem aviso: ' + JSON.stringify(d.inconsistencias));
  afirmar(/readmissão/.test(d.inconsistencias.find((x) => x.cod === '30300').detalhe), 'a dica da DORA fala da readmissao');
});

caso('quadro do CD: so cala a recontratacao a admissao do MESMO nome, ja feita e depois da saida; saida so com o mes; homonimo nao cala a pessoa; a dica diz o que conferir', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const h = new Date();
  const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const mesTexto = MESES[h.getMonth()].toLowerCase() + '/' + h.getFullYear();
  const mesIso = h.getFullYear() + '-' + ('0' + (h.getMonth() + 1)).slice(-2);           // "aaaa-mm", tambem so com o mes
  const M = new Date(h.getFullYear(), h.getMonth() - 2, 1);                                 // um mes de dois meses atras
  const DM = (dia) => new m.DataDoScript(M.getFullYear(), M.getMonth(), dia, 12, 0, 0);
  const mTexto = MESES[M.getMonth()].toLowerCase() + '/' + M.getFullYear();
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '30010', 'JOSE SILVA', 'SEPARADOR', '100', 'ATIVO'],       // o COD dele foi dado a um novato na CADMITIDOS
      ['1° TURNO', '30020', 'ANA LIMA', 'SEPARADOR', '200', 'ATIVO'],         // readmissao com o ano digitado errado (no futuro)
      ['1° TURNO', '30030', 'CARLOS ROCHA', 'SEPARADOR', '300', 'ATIVO'],     // saida anotada so com o mes; admissao no mesmo mes
      ['2° TURNO', '30040', 'DORA MELO', 'CONFERENTE', '400', 'ATIVO'],       // recontratada ha tempo, saiu de novo com o COD trocado
      ['2° TURNO', '30050', 'EVA PRADO', 'CONFERENTE', '', 'ATIVO'],          // a outra EVA (RH 999) saiu e voltou; esta saiu
      ['2° TURNO', '30060', 'FABIO ALVES', 'CONFERENTE', '600', 'ATIVO'],     // CADMITIDOS so com o nome
      ['3° TURNO', '30070', 'GIL SANTOS', 'SEPARADOR', '700', 'ATIVO'],       // saida sem data, readmissao datada
      ['3° TURNO', '30080', 'HELENA DIAS', 'SEPARADOR', '800', 'ATIVO'],      // recontratada com COD novo, CADMITIDOS sem data
      ['3° TURNO', '30090', 'IVO NUNES', 'SEPARADOR', '900', 'ATIVO'],        // o RH dele foi dado a outro na CADMITIDOS
      ['3° TURNO', '30100', 'JULIA MOTA', 'SEPARADOR', '1000', 'ATIVO'],      // admissao original datada, readmissao sem data
      ['3° TURNO', '30120', 'LUIZ PAES', 'SEPARADOR', '1200', 'ATIVO'],       // saida "aaaa-mm" e admissao no mesmo mes
      ['ADM', '30130', 'MARTA REGO', 'ANALISTA', '1300', 'ATIVO'],            // saiu, voltou e saiu de novo no mesmo mes (so com o mes)
      ['ADM', '30140', 'NINA ROCHA', 'ANALISTA', '1400', 'ATIVO'],            // a admissao original tem o nome escrito de outro jeito
      ['ADM', '30150', 'OTTO LIMA', 'ANALISTA', '1500', 'ATIVO']],            // recontratado com COD novo e nome abreviado na CADMITIDOS
    'CADMITIDOS': [['PRODUTIVA', 'MATRÍCULA', 'COLABORADOR', 'STATUS', 'DATA ADMISSÃO'],
      ['30010', '', 'PEDRO COSTA', 'ATIVO', D(-5)],
      ['30020', '', 'ANA LIMA', 'ATIVO', D(200)],
      ['30030', '', 'CARLOS ROCHA', 'ATIVO', D(0)],
      ['30040', '', 'DORA MELO', 'ATIVO', D(-400)],
      ['', '999', 'EVA PRADO', 'ATIVO', D(-3)],
      ['', '', 'FABIO ALVES', 'ATIVO', D(-5)],
      ['30070', '', 'GIL SANTOS', 'ATIVO', D(-10)],
      ['30080', '', 'HELENA DIAS', 'ATIVO', ''],
      ['40999', '900', 'MARCOS REIS', 'ATIVO', D(-5)],
      ['30100', '1000', 'JULIA MOTA', 'ATIVO', D(-700)],
      ['30100', '1000', 'JULIA MOTA', 'ATIVO', ''],
      ['30120', '1200', 'LUIZ PAES', 'ATIVO', D(0)],
      ['30130', '1300', 'MARTA REGO', 'ATIVO', DM(10)],
      ['30140', '1400', 'NINA S. ROCHA', 'ATIVO', D(-900)],
      ['30150', '1500', 'OTTO M LIMA', 'ATIVO', D(-5)]],
    'CDESLIGADOS': [['COD', 'MATRÍCULA', 'COLABORADOR', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO'],
      ['30010', '', 'JOSE SILVA', D(-30), 'INVOLUNTÁRIO', 'Faltas'],
      ['30020', '', 'ANA LIMA', D(-10), 'VOLUNTÁRIO', ''],
      ['30030', '', 'CARLOS ROCHA', mesTexto, 'VOLUNTÁRIO', ''],
      ['30040', '', 'DORA MELO', D(-600), 'VOLUNTÁRIO', ''],
      ['30400', '', 'DORA MELO', D(-20), 'INVOLUNTÁRIO', 'Faltas'],
      ['30050', '', 'EVA PRADO', D(-40), 'INVOLUNTÁRIO', 'Faltas'],
      ['', '999', 'EVA PRADO', D(-20), 'VOLUNTÁRIO', ''],
      ['30060', '', 'FABIO ALVES', D(-30), 'VOLUNTÁRIO', ''],
      ['30070', '', 'GIL SANTOS', '', 'VOLUNTÁRIO', ''],
      ['28610', '', 'HELENA DIAS', D(-30), 'VOLUNTÁRIO', ''],
      ['30090', '900', 'IVO NUNES', D(-30), 'INVOLUNTÁRIO', 'Faltas'],
      ['30100', '1000', 'JULIA MOTA', D(-30), 'VOLUNTÁRIO', ''],
      ['30120', '1200', 'LUIZ PAES', mesIso, 'VOLUNTÁRIO', ''],
      ['30130', '1300', 'MARTA REGO', DM(3), 'VOLUNTÁRIO', ''],
      ['30130', '1300', 'MARTA REGO', mTexto, 'INVOLUNTÁRIO', 'Faltas'],
      ['30140', '1400', 'NINA ROCHA', D(-30), 'INVOLUNTÁRIO', 'Faltas'],
      ['28000', '', 'OTTO LIMA', D(-30), 'VOLUNTÁRIO', '']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro, 'erro: ' + d.erro);
  const de = (cod) => d.inconsistencias.filter((x) => x.cod === cod && (x.tipo === 'DESLIGADO_ATIVO' || x.tipo === 'MESMO_NOME'));
  const um = (cod, tipo, re, porque) => {
    const l = de(cod);
    afirmar(l.length === 1 && l[0].tipo === tipo && (!re || re.test(l[0].detalhe)), porque + ': ' + JSON.stringify(l));
  };
  um('30010', 'DESLIGADO_ATIVO', /A CADMITIDOS tem o COD 30010 com outro nome \(PEDRO COSTA.*escreva o nome como na GERAL; se não for, confira o número/, 'admissao pelo numero com OUTRO nome nao prova recontratacao');
  um('30020', 'DESLIGADO_ATIVO', /data no futuro .*confira a data/, 'admissao com data no futuro nao conta');
  um('30030', 'DESLIGADO_ATIVO', /só com o mês e a readmissão .* é do mesmo mês: ponha o dia da saída/, 'saida so com o mes e admissao no mesmo mes nao e recontratacao (a dica pede o dia)');
  um('30120', 'DESLIGADO_ATIVO', /ponha o dia da saída/, 'saida "aaaa-mm" tambem e so com o mes');
  um('30090', 'DESLIGADO_ATIVO', /A CADMITIDOS tem o RH 900 com outro nome \(MARCOS REIS/, 'achada pelo RH: a dica aponta o RH, nao o COD do outro');
  um('30100', 'DESLIGADO_ATIVO', /sem data: se foi recontratação, ponha a data da nova admissão/, 'readmissao sem data ao lado da admissao original datada: a dica pede a data');
  um('30130', 'DESLIGADO_ATIVO', /readmissão em 10\/.* só com o mês: ponha o dia da saída/, 'saida so com o mes no mes da readmissao nao e calada pela saida anterior');
  um('30140', 'DESLIGADO_ATIVO', null, 'desligada de verdade');
  afirmar(!/outro nome/.test(de('30140')[0].detalhe), 'a admissao ORIGINAL (antes da saida) com outro nome nao vira dica: ' + de('30140')[0].detalhe);
  um('30150', 'MESMO_NOME', /com outro nome \(OTTO M LIMA.*escreva o nome como na GERAL/, 'recontratado com o nome abreviado: a dica pede o nome como na GERAL');
  um('30040', 'MESMO_NOME', null, 'saida nova (COD trocado) depois da readmissao continua pedindo conferencia');
  um('30050', 'DESLIGADO_ATIVO', null, 'a volta da outra EVA (achada so pelo nome) nao cala a saida desta');
  afirmar(de('30050')[0].chave === 'produtivo', 'a EVA desligada e achada pelo produtivo');
  um('30060', 'DESLIGADO_ATIVO', /mesmo nome, mas sem o COD\/RH desta pessoa.*ponha o COD ou o RH/, 'CADMITIDOS so com o nome: a dica pede o numero');
  um('30070', 'DESLIGADO_ATIVO', /ponha a data desta saída/, 'saida sem data com readmissao datada: a dica pede a data da saida');
  um('30080', 'MESMO_NOME', /sem data: se foi recontratação, ponha a data da nova admissão/, 'recontratada com COD novo sem data: a dica pede a data');
  // a dica segue a regra: com a data da readmissao, o aviso da HELENA some
  const pl = m.planilhas.get(link.split('/d/')[1].split('/')[0]);
  pl.abas.find((a) => a.nome === 'CADMITIDOS').dados[8][4] = D(-5);
  acao(m, s, 'atualizarQuadro', {});
  const d2 = tela(m, s, 'quadro');
  afirmar(!d2.inconsistencias.some((x) => x.cod === '30080'), 'com a data da readmissao, sem aviso: ' + JSON.stringify(d2.inconsistencias.filter((x) => x.cod === '30080')));
});

caso('quadro do CD: aba FÉRIAS cruzada com a GERAL pelos ultimos numeros do RH; o nome desempata o mesmo final; conferencias das ferias', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '30001', 'ANA LIMA', 'SEPARADOR', '100123', 'ATIVO'],          // dois periodos em aberto
      ['1° TURNO', '30002', 'BRUNO DIAS', 'SEPARADOR', '100456', 'ATIVO'],        // o final 456 esta na FÉRIAS com outro nome
      ['2° TURNO', '30003', 'CARLOS MOTA', 'CONFERENTE', '', 'ATIVO'],            // sem RH: acha pelo nome
      ['2° TURNO', '30004', 'DORA MELO', 'CONFERENTE', '100999', 'ATIVO'],        // 999: o mesmo final que a EVA
      ['3° TURNO', '30005', 'EVA PRADO', 'SEPARADOR', '109999', 'ATIVO'],
      ['ADM', '30006', 'FABIO ALVES', 'ANALISTA', '200777', 'INATIVO'],           // saiu da empresa
      ['ADM', '30007', 'GIL SANTOS', 'ANALISTA', '200888', 'ATIVO']],             // sem linha na FÉRIAS
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR']], 'CDESLIGADOS': [['COD', 'COLABORADOR']],
    'Férias': [['RELATÓRIO DE FÉRIAS - FILIAL 21'],
      ['Empresa', 'Filial', 'Matricula', 'Descrição', 'Nome', 'cc', 'turno', 'admissão', 'pa_inicio', 'pa_fim', 'DTA_LIMITE', 'DTA_LIMITEMAX', 'dias vencidos', 'codfuc', 'tipfuncao'],
      ['Bartofil', 21, 123, 'SEPARADOR', 'Ana Lima', 655, 'A', '10/06/2020', '10/06/2025', '09/06/2026', '09/06/2026', '24/04/2027', 30, 101, 'OPERACIONAL'],
      ['Bartofil', 21, 123, 'SEPARADOR', 'ANA LIMA', 655, 'A', '10/06/2020', '10/06/2026', '09/06/2027', '09/06/2027', '24/04/2028', '', 101, 'OPERACIONAL'],
      ['Bartofil', 21, '0456', 'CONFERENTE', 'CARLOS MOTA', '655', 'B', D(-900), D(-500), D(-135), D(-135), D(180), 0, 102, 'OPERACIONAL'],
      ['Bartofil', 21, 999, 'SEPARADOR', 'Eva Prado', 655, 'C', D(-800), D(-400), D(-35), D(-35), D(280), 0, 101, 'OPERACIONAL'],
      ['Bartofil', 21, 999, 'CONFERENTE', 'DORA MELO', 655, 'B', D(-800), D(-420), D(-55), D(-55), D(260), 0, 102, 'OPERACIONAL'],
      ['Bartofil', 21, 999, 'SEPARADOR', 'JOAO NINGUEM', 655, 'B', D(-800), D(-420), D(-55), D(-55), D(260), 0, 101, 'OPERACIONAL'],
      ['Bartofil', 21, 777, 'ANALISTA', 'FABIO ALVES', 655, 'ADM', D(-900), D(-500), D(-135), D(-135), D(180), 0, 103, 'ADMINISTRATIVO'],
      ['Bartofil', 21, 555, 'SEPARADOR', 'HELIO COSTA', 655, 'A', D(-200), D(-200), D(165), D(165), D(480), 0, 101, 'OPERACIONAL'],
      ['Bartofil', 21, 444, 'VENDEDOR', 'IRIS LOPES', 700, 'ADM', D(-200), D(-200), D(165), D(165), D(480), 0, 104, 'COMERCIAL'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.formato === 4 && d.ferias && d.ferias.aba === 'Férias', 'leu a aba Férias: ' + (d.erro || JSON.stringify(d.ferias && d.ferias.aba)));
  const lf = d.leitura.ferias;
  afirmar(lf.colunas.matricula === 'MATRICULA' && lf.colunas.funcao === 'DESCRICAO' && lf.colunas.paInicio === 'PA INICIO' && lf.colunas.paFim === 'PA FIM' &&
    lf.colunas.limite === 'DTA LIMITE' && lf.colunas.limiteMax === 'DTA LIMITEMAX' && lf.colunas.diasVencidos === 'DIAS VENCIDOS' && lf.colunas.cc === 'CC' &&
    !lf.faltam.length, 'colunas do sistema (TIPFUNCAO nao e a funcao): ' + JSON.stringify(lf));
  afirmar(lf.linhas === 9 && lf.ligadas === 6 && lf.peloNome === 1 && lf.foraDoCd === 1 && lf.linhaCabecalho === 2, 'resumo da leitura: ' + JSON.stringify(lf));
  const ref = (cod) => d.geral.find((g) => g.cod === cod).ref;
  const de = (cod) => d.ferias.linhas.filter((f) => f.ref === ref(cod));
  const ana = de('30001');
  afirmar(ana.length === 2 && ana.every((f) => f.chave === 'matricula') && ana[0].paFim === '2026-06-09' && ana[0].limiteMax === '2027-04-24' &&
    ana[0].diasVencidos === 30 && ana[1].diasVencidos === '' && ana[0].linha === 3, 'ANA, dois periodos pela matricula 123: ' + JSON.stringify(ana));
  afirmar(de('30003').length === 1 && de('30003')[0].chave === 'nome', 'CARLOS (sem RH) achado pelo nome: ' + JSON.stringify(de('30003')));
  afirmar(de('30004').length === 1 && de('30005').length === 1 && de('30005')[0].nome === 'Eva Prado', 'o nome desempata o final 999 (DORA e EVA)');
  afirmar(de('30006').length === 1, 'linha de quem saiu fica ligada a ela (a tela deixa de fora)');
  afirmar(!d.ferias.linhas.some((f) => /IRIS/.test(f.nome)) && d.ferias.linhas.some((f) => /HELIO/.test(f.nome) && !f.ref), 'outro centro de custo sai; o do CD sem par fica');
  const conf = (tipo) => d.inconsistencias.filter((x) => x.tipo === tipo);
  afirmar(conf('FERIAS_NOME').length === 1 && /é de CARLOS MOTA; na GERAL, esse final de RH é de BRUNO DIAS \(RH 100456\)\. As férias foram ligadas a CARLOS MOTA \(sem RH na GERAL\) pelo nome/.test(conf('FERIAS_NOME')[0].detalhe),
    'matricula de outra pessoa: ' + JSON.stringify(conf('FERIAS_NOME')));
  // o final 999 e da DORA e da EVA, que ja tem as suas linhas (o nome desempatou): o JOAO NINGUEM e outra pessoa, fora da GERAL
  afirmar(!conf('FERIAS_DUPLA').length, 'ninguem em duas pessoas: ' + JSON.stringify(conf('FERIAS_DUPLA')));
  const fora = conf('FERIAS_FORA_GERAL');
  afirmar(fora.map((x) => x.matricula + '@' + x.linha).join() === '999@8,555@10' && fora.every((x) => x.aba === 'Férias' && !x.ref) &&
    /não é de ninguém da GERAL\. O final 999 é de DORA MELO \(RH 100999\); EVA PRADO \(RH 109999\), que já têm as suas linhas, com outro nome\.$/.test(fora[0].detalhe),
    'CC 655 sem par na GERAL: ' + JSON.stringify(fora));
  afirmar(conf('FERIAS_SEM_DADOS').map((x) => x.cod).sort().join() === '30002,30007', 'quem esta no quadro sem linha na FÉRIAS: ' + JSON.stringify(conf('FERIAS_SEM_DADOS')));
  afirmar(d.inconsistencias.filter((x) => /^FERIAS_/.test(x.tipo)).every((x) => x.gravidade === 'atencao'), 'conferencias das ferias sao de atencao');
  // PARAMETROS (editaveis na aba Ferias): o padrao vem na tela; o servidor confere o que chega
  const P0 = d.parametrosFerias;
  afirmar(P0 && Object.keys(P0).sort().join() === 'avisar,aviso,cc,digitos,planejar' && P0.cc.join() === '655' && P0.digitos === 3 && P0.aviso === 30 && P0.avisar === 60 && P0.planejar === 90,
    'parametros padrao (sem os do escalonar): ' + JSON.stringify(P0));
  const ok = { cc: '700', digitos: '4', aviso: '45', avisar: '75', planejar: '120' };
  afirmar(/pelo menos um centro de custo/.test(erroDe(() => acao(m, s, 'salvarParametrosFerias', Object.assign({}, ok, { cc: 'abc' })))), 'centro de custo sem numero');
  afirmar(/: "Avisar" precisa ser maior que o aviso de férias \(45 dias\)\.$/.test(erroDe(() => acao(m, s, 'salvarParametrosFerias', Object.assign({}, ok, { avisar: '40' })))), 'avisar menor que o aviso');
  afirmar(/: "Programar" precisa ser maior que "Avisar" \(75 dias\)\.$/.test(erroDe(() => acao(m, s, 'salvarParametrosFerias', Object.assign({}, ok, { planejar: '75' })))), 'programar menor que o avisar');
  afirmar(/Números da matrícula: use um número inteiro de 1 a 8/.test(erroDe(() => acao(m, s, 'salvarParametrosFerias', Object.assign({}, ok, { digitos: '0' })))), 'digitos fora da faixa');
  const coord = entrar(m, COORD, '1234');
  afirmar(erroDe(() => acao(m, coord, 'salvarParametrosFerias', ok)) !== '', 'coordenador nao muda os parametros');
  acao(m, s, 'salvarParametrosFerias', ok);
  const d3 = tela(m, s, 'quadro');
  const P1 = d3.parametrosFerias;
  afirmar(P1.cc.join() === '700' && P1.digitos === 4 && P1.aviso === 45 && P1.avisar === 75 && P1.planejar === 120 && P1.janela === undefined,
    'parametros salvos: ' + JSON.stringify(P1));
  afirmar(!ctx(m).listar('PARAMETROS').some((x) => /^FERIAS_ESCALONAR/.test(x.CHAVE)), 'o escalonar nao grava mais parametro');
  const conf3 = (tipo) => d3.inconsistencias.filter((x) => x.tipo === tipo);
  // CC 700: a linha da IRIS (700) e do CD e esta fora da GERAL; as do 655 passam a ser de outro setor: so entram pela matricula com o nome certo
  // (CARLOS, sem RH, nao e mais achado pelo nome; HELIO, JOAO, EVA e a do CARLOS ficam de fora, sem conferencia)
  afirmar(conf3('FERIAS_FORA_GERAL').map((x) => x.matricula).join() === '444' && d3.leitura.ferias.foraDoCd === 4 && !conf3('FERIAS_NOME').length,
    'centro de custo do parametro: ' + JSON.stringify([conf3('FERIAS_FORA_GERAL'), conf3('FERIAS_NOME'), d3.leitura.ferias.foraDoCd]));
  // 4 numeros: a matricula 999 vira 0999 e so bate com o RH 100999 (DORA); o RH 109999 da EVA termina em 9999
  const ref3 = (cod) => d3.geral.find((g) => g.cod === cod).ref;
  afirmar(!conf3('FERIAS_DUPLA').length && d3.ferias.linhas.filter((f) => f.ref === ref3('30004')).length === 1 && !d3.ferias.linhas.some((f) => f.ref === ref3('30005')) &&
    conf3('FERIAS_SEM_DADOS').some((x) => x.cod === '30005' && /A matrícula 9999 \(o final do RH 109999\) não está na aba Férias/.test(x.detalhe)),
    'numeros da matricula do parametro: ' + JSON.stringify(conf3('FERIAS_SEM_DADOS')));
  acao(m, s, 'salvarParametrosFerias', { padrao: true });
  const P2 = tela(m, s, 'quadro').parametrosFerias;
  afirmar(P2.cc.join() === '655' && P2.digitos === 3 && P2.aviso === 30 && P2.avisar === 60 && P2.planejar === 90, 'de volta ao padrao: ' + JSON.stringify(P2));
  // extracao nova colada na aba: a copia guardada (5 min) segue ate o "Atualizar dados" — o da barra lateral tambem rele
  const idQ = /\/d\/([\w-]+)/.exec(link)[1];
  const abaF = m.planilhas.get(idQ).abas.find((a) => a.nome === 'Férias');
  abaF.dados[2][11] = '24/05/2027';
  const limAna = (dd) => dd.ferias.linhas.filter((f) => f.ref === ref('30001')).map((f) => f.limiteMax).sort()[0];
  afirmar(limAna(tela(m, s, 'quadro')) === '2027-04-24', 'dentro dos 5 minutos: a copia guardada');
  acao(m, s, 'atualizarDados', {});
  afirmar(limAna(tela(m, s, 'quadro')) === '2027-05-24', '"Atualizar dados" da barra lateral rele a aba FÉRIAS');
  // copia guardada com outros parametros (centro de custo, numeros da matricula): nao e servida
  const cq = novaExecucao(m, PASTA, { contaGoogle: DONO }, OP); cq._porta = true;
  const guardada = JSON.parse(cq.lerTextoCache(cq.chaveQuadroQ_(idQ)));
  afirmar(guardada && guardada.assinaturaFerias === '655|3', 'a copia guardada diz com que parametros foi lida: ' + (guardada && guardada.assinaturaFerias));
  cq.gravarTextoCache(cq.chaveQuadroQ_(idQ), JSON.stringify(Object.assign(guardada, { assinaturaFerias: '700|4', geral: [] })), 300);
  afirmar(tela(m, s, 'quadro').geral.length === 7, 'copia de outros parametros relida');
});

caso('quadro do CD: ferias — grafias do nome (THIAGO/TIAGO, LUIZ/LUIS, sem o 1o nome) ligam pela matricula; quem saiu nao esconde a linha; homonimo de outro RH ou setor nao liga', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const L = (mat, nome, cc, lim) => ['Bartofil', 21, mat, 'SEPARADOR', nome, cc, 'A', D(-900), D(-500), D(-135), D(-135), D(lim), 0, 101, 'OPERACIONAL'];
  const link = planilhaAntiga(m, 'BI Quadro Grafias', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '40001', 'TIAGO SANTOS', 'SEPARADOR', '100321', 'ATIVO'],
      ['1° TURNO', '40002', 'LUIS CARLOS SOUZA', 'SEPARADOR', '100654', 'ATIVO'],
      ['2° TURNO', '40003', 'PAULA SOUZA', 'CONFERENTE', '100111', 'ATIVO'],
      ['2° TURNO', '40004', 'JOSE CARLOS DA SILVA', 'CONFERENTE', '100222', 'ATIVO'],
      ['3° TURNO', '40005', 'FABIO ALVES', 'ANALISTA', '200777', 'INATIVO'],
      ['ADM', '40007', 'GIL SANTOS', 'ANALISTA', '200888', 'ATIVO'],
      ['ADM', '40008', 'MARIA LIMA', 'ANALISTA', '200333', 'ATIVO'],
      ['ADM', '40009', 'HELENA COSTA', 'ANALISTA', '', 'ATIVO']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR']], 'CDESLIGADOS': [['COD', 'COLABORADOR']],
    'FÉRIAS': [['Empresa', 'Filial', 'Matricula', 'Descrição', 'Nome', 'cc', 'turno', 'admissão', 'pa_inicio', 'pa_fim', 'DTA_LIMITE', 'DTA_LIMITEMAX', 'dias vencidos', 'codfuc', 'tipfuncao'],
      L(321, 'THIAGO DOS SANTOS', 655, -6),          // 2: grafia do 1o nome
      L(654, 'LUIZ CARLOS DE SOUSA', 655, 11),       // 3: LUIZ/LUIS e SOUSA/SOUZA
      L(111, 'ANA PAULA DE SOUZA', 655, 40),         // 4: a GERAL nao tem o 1o nome
      L(222, 'JOSE CARLOS DA SILVA', 655, 300),      // 5: a do JOSE
      L(874, 'JOSE CARLOS DA SILVA', 700, -5),       // 6: homonimo de outro setor: nao e do JOSE
      L(875, 'JOSE CARLOS DA SILVA', 655, 20),       // 7: homonimo do CD com outra matricula: o JOSE tem RH (o outro final)
      L(777, 'IVO NOVO', 655, 6),                    // 8: o final 777 e do FABIO, que saiu e tem outro nome
      L(888, 'PEDRO ROCHA', 700, 50),                // 9: outro setor com o final do GIL: sem conferencia
      L(333, 'CARLA REIS', 655, 15),                 // 10: o final 333 e da MARIA (outro nome) e ela nao tem linha
      L(999, 'HELENA COSTA', 655, 90)]               // 11: HELENA sem RH na GERAL: pelo nome
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.ferias, 'leu a aba: ' + d.erro);
  const ref = (cod) => d.geral.find((g) => g.cod === cod).ref;
  const de = (cod) => d.ferias.linhas.filter((f) => f.ref === ref(cod)).map((f) => f.matricula + ':' + f.chave).join();
  afirmar(de('40001') === '321:matricula' && de('40002') === '654:matricula' && de('40003') === '111:matricula', 'grafias ligam pela matricula: ' + [de('40001'), de('40002'), de('40003')]);
  afirmar(de('40004') === '222:matricula', 'o JOSE fica so com a dele: ' + de('40004'));
  afirmar(de('40009') === '999:nome', 'HELENA (sem RH) pelo nome: ' + de('40009'));
  const conf = (tipo) => d.inconsistencias.filter((x) => x.tipo === tipo);
  const fora = conf('FERIAS_FORA_GERAL');
  afirmar(fora.map((x) => x.matricula).join() === '875,777', 'fora da GERAL: ' + JSON.stringify(fora));
  afirmar(/JOSE CARLOS DA SILVA \(RH 100222\) tem o mesmo nome: se for a mesma pessoa, o RH na GERAL está errado/.test(fora[0].detalhe), 'homonimo do CD: ' + fora[0].detalhe);
  afirmar(/O final 777 também é de FABIO ALVES \(RH 200777\), que já saiu da empresa\./.test(fora[1].detalhe), 'quem saiu nao esconde a linha: ' + fora[1].detalhe);
  // o item fica com a pessoa da GERAL (o nome, os numeros e a ficha sao dela); o nome da FÉRIAS vai no detalhe
  afirmar(conf('FERIAS_NOME').map((x) => x.matricula).join() === '333' && /é de CARLA REIS; na GERAL, esse final de RH é de MARIA LIMA \(RH 200333\)\. Os nomes não batem, e o GSL não ligou as férias a ninguém/.test(conf('FERIAS_NOME')[0].detalhe) &&
    conf('FERIAS_NOME')[0].ref === ref('40008') && conf('FERIAS_NOME')[0].nome === 'MARIA LIMA' && conf('FERIAS_NOME')[0].cod === '40008',
    'outro nome no final da MARIA: ' + JSON.stringify(conf('FERIAS_NOME')));
  afirmar(!conf('FERIAS_DUPLA').length && d.leitura.ferias.foraDoCd === 2, 'outro setor sai sem conferencia: ' + d.leitura.ferias.foraDoCd);
  const sem = conf('FERIAS_SEM_DADOS');
  afirmar(sem.map((x) => x.cod).sort().join() === '40007,40008', 'sem linha: ' + JSON.stringify(sem));
  afirmar(/tem a matrícula 888, mas de PEDRO ROCHA \(linha 9, centro de custo 700\), outro nome\./.test(sem.find((x) => x.cod === '40007').detalhe) &&
    /tem a matrícula 333, mas de CARLA REIS \(linha 10\), outro nome: veja "Férias: matrícula de outra pessoa"/.test(sem.find((x) => x.cod === '40008').detalhe),
    'o "sem linha" diz por que: ' + sem.map((x) => x.detalhe).join(' | '));
  // a regra do nome, direto
  const c = ctx(m), par = c.nomeParecidoQ_;
  afirmar(par('THIAGO DOS SANTOS', 'TIAGO SANTOS') && par('WILLIAM ROCHA', 'WILLIAN ROCHA') && par('WELLINGTON MAYCON', 'WELINGTON MAICON') &&
    par('J CARLOS SILVA', 'JOSE CARLOS SILVA') && par('RAPHAEL LIMA', 'RAFAEL LIMA') && par('HELOISA SOUZA', 'ELOISA SOUSA') && par('ANA', 'ANA LIMA'),
    'grafias do mesmo nome');
  afirmar(!par('JOAO COSTA LIMA', 'PEDRO COSTA LIMA') && !par('MARIA SOUZA', 'TIAGO SOUZA') && !par('CARLA REIS', 'MARIA LIMA') && !par('ANA L', 'ANA LIMA'),
    'so o sobrenome (ou uma inicial) nao basta');
});

caso('quadro do CD: ferias — par mais forte primeiro (mais numeros da matricula, nome igual), uma matricula por pessoa; casal, inicial, linha sem nome', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const L = (mat, nome, cc, lim) => ['Bartofil', 21, mat, 'SEPARADOR', nome, cc, 'A', D(-900), D(-500), D(-135), D(-135), D(lim), 0, 101, 'OPERACIONAL'];
  const link = planilhaAntiga(m, 'BI Quadro Pares', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '50001', 'MARCOS PEDRO SILVA ROCHA', 'SEPARADOR', '101456', 'ATIVO'],
      ['1° TURNO', '50002', 'PEDRO VICTOR ALVES SILVA', 'SEPARADOR', '100757', 'ATIVO'],
      ['1° TURNO', '50003', 'ANDERSON PEDRO SILVA PEREIRA', 'SEPARADOR', '102757', 'ATIVO'],
      ['2° TURNO', '50004', 'JOSE CARLOS SANTOS', 'CONFERENTE', '100321', 'ATIVO'],
      ['2° TURNO', '50005', 'MARIA JOSE DA SILVA SANTOS', 'CONFERENTE', '109321', 'ATIVO'],
      ['2° TURNO', '50006', 'M APARECIDA SOUZA', 'CONFERENTE', '100123', 'ATIVO'],
      ['3° TURNO', '50007', 'BIA ROCHA', 'SEPARADOR', '100654', 'ATIVO'],
      ['3° TURNO', '50008', 'ANA LIMA', 'SEPARADOR', '101654', 'ATIVO'],
      ['3° TURNO', '50009', '', 'SEPARADOR', '101002', 'ATIVO'],
      ['ADM', '50010', '', 'ANALISTA', '100777', 'INATIVO'],
      ['ADM', '50011', 'DORA MELO', 'ANALISTA', '101999', 'ATIVO'],
      ['ADM', '50012', 'JOSE CARLOS SILVA', 'ANALISTA', '100222', 'ATIVO'],
      ['ADM', '50013', 'JOSE SILVA', 'ANALISTA', '100555', 'ATIVO'],
      ['ADM', '50014', 'JOSE SILVA', 'ANALISTA', '100556', 'ATIVO']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR']], 'CDESLIGADOS': [['COD', 'COLABORADOR']],
    'FÉRIAS': [['Empresa', 'Filial', 'Matricula', 'Descrição', 'Nome', 'cc', 'turno', 'admissão', 'pa_inicio', 'pa_fim', 'DTA_LIMITE', 'DTA_LIMITEMAX', 'dias vencidos', 'codfuc', 'tipfuncao'],
      L(1456, 'MARCOS PEDRO SILVA ROCHA', 655, 200),     // 2
      L(456, 'PEDRO FERREIRA SILVA', 700, -10),          // 3: outro setor; o 456 do RH 101456 e do MARCOS, que tem a 1456
      L(757, 'PEDRO VICTOR DOS ALVES SILVA', 655, 15),   // 4
      L(2757, 'ANDERSON PEDRO SILVA PEREIRA', 655, 100), // 5
      L(321, 'JOSE CARLOS SANTOS', 655, 50),             // 6: o casal com o mesmo final 321
      L(321, 'MARIA JOSE DA SILVA SANTOS', 655, 60),     // 7
      L(123, 'MARIA APARECIDA SOUZA', 655, 20),          // 8: a GERAL tem so a inicial (M)
      L(1654, 'ANA LIMA', 655, 80),                      // 9: a BIA (RH 100654) nao tem a 654
      L(1002, 'CARLA REIS', 655, 30),                    // 10: a linha sem nome da GERAL (RH 101002)
      L(2, 'PEDRO ROCHA', 700, -10),                     // 11: outro setor com o final 002: nao vai para a linha sem nome
      L(777, 'IVO NOVO', 655, 6),                        // 12: o final 777 e de uma linha sem nome que ja saiu
      L(1999, 'DORA MELO', 655, 300),                    // 13
      L(222, 'JOSE CARLOS SILVA', 655, 300),             // 14
      L(999, 'JOSE CARLOS SILVA', 655, 40),              // 15: homonimo do JOSE (RH 100222); o 999 e da DORA, que ja tem a dela
      L(555, 'JOSE SILVA', 655, 300),                    // 16
      L(556, 'JOSE SILVA', 655, 300),                    // 17
      L('', 'JOSE SILVA', 655, 45)]                      // 18: sem matricula; os dois JOSE SILVA ja tem a sua
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.ferias, 'leu a aba: ' + d.erro);
  const ref = (cod) => d.geral.find((g) => g.cod === cod).ref;
  const de = (cod) => d.ferias.linhas.filter((f) => f.ref === ref(cod)).map((f) => f.matricula + ':' + f.chave).join();
  const lig = ['50001', '50002', '50003', '50004', '50005', '50006', '50008', '50009', '50011', '50012', '50013', '50014'].map((c) => c + '=' + de(c)).join(' ');
  afirmar(lig === '50001=1456:matricula 50002=757:matricula 50003=2757:matricula 50004=321:matricula 50005=321:matricula 50006=123:matricula ' +
    '50008=1654:matricula 50009=1002:matricula 50011=1999:matricula 50012=222:matricula 50013=555:matricula 50014=556:matricula', 'quem ficou com cada linha: ' + lig);
  const conf = (tipo) => d.inconsistencias.filter((x) => x.tipo === tipo);
  afirmar(!conf('FERIAS_DUPLA').length && !conf('FERIAS_NOME').length, 'sem "duas pessoas" nem "outro nome": ' + JSON.stringify(conf('FERIAS_DUPLA').concat(conf('FERIAS_NOME'))));
  afirmar(d.leitura.ferias.foraDoCd === 2, 'as duas de outro setor: ' + d.leitura.ferias.foraDoCd);
  const fora = conf('FERIAS_FORA_GERAL');
  afirmar(fora.map((x) => x.linha).join() === '12,15,18', 'fora da GERAL: ' + JSON.stringify(fora));
  afirmar(/nenhuma pessoa ativa da GERAL tem esse final de RH nem esse nome\. O final 777 também é de uma linha sem nome \(RH 100777\), que já saiu da empresa\./.test(fora[0].detalhe), fora[0].detalhe);
  afirmar(/matrícula 999, mas não é de ninguém da GERAL\. JOSE CARLOS SILVA \(RH 100222\) tem o mesmo nome: .* O final 999 é de DORA MELO \(RH 101999\), que já tem a sua linha, com outro nome \(uma pessoa da GERAL fica com uma matrícula só\)\.$/.test(fora[1].detalhe), fora[1].detalhe);
  afirmar(/sem matrícula, e ninguém ativo da GERAL sem linha tem esse nome\./.test(fora[2].detalhe), fora[2].detalhe);
  const sem = conf('FERIAS_SEM_DADOS');
  afirmar(sem.map((x) => x.cod).join() === '50007' && /^A matrícula 654 \(o final do RH 100654\) não está na aba FÉRIAS\./.test(sem[0].detalhe), 'sem linha: ' + JSON.stringify(sem));
  // o nivel do nome, direto
  const niv = ctx(m).nivelNomeQ_;
  const n = (a, b) => niv(a, b);
  afirmar([n('M APARECIDA SOUZA', 'MARIA APARECIDA SOUZA'), n('M SILVA', 'NATALIA SILVA'), n('H COSTA LIMA', 'HELENA COSTA LIMA'), n('PEDRO FERREIRA SILVA', 'MARCOS PEDRO SILVA ROCHA'),
    n('JOSE CARLOS SANTOS', 'MARIA JOSE DA SILVA SANTOS'), n('PAULA SOUZA', 'ANA PAULA DE SOUZA'), n('THIAGO DOS SANTOS', 'TIAGO SANTOS'), n('ANA', 'ANA LIMA'), n('', 'ANA')].join() === '1,0,1,0,0,1,3,2,-1',
    'niveis do nome');
});

caso('quadro do CD: ferias — ativo antes de quem saiu; nome sem contradicao antes do so parecido; mesma matricula com outro nome e outra pessoa; os motivos certos', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const D = (dias) => { const h = new Date(); return new m.DataDoScript(h.getFullYear(), h.getMonth(), h.getDate() + dias, 12, 0, 0); };
  const L = (mat, nome, cc, lim) => ['Bartofil', 21, mat, 'SEPARADOR', nome, cc, 'A', D(-900), D(-500), D(-135), D(-135), D(lim), 0, 101, 'OPERACIONAL'];
  const link = planilhaAntiga(m, 'BI Quadro Motivos', {
    'GERAL': [['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS'],
      ['1° TURNO', '60001', 'BRUNO DOS MARTINS SILVA', 'SEPARADOR', '200901', 'ATIVO'],
      ['1° TURNO', '60002', 'ANTONIO DA SILVA', 'SEPARADOR', '300901', 'ATIVO'],
      ['1° TURNO', '60003', 'ANTONIO DE SOUZA', 'SEPARADOR', '100492', 'ATIVO'],
      ['1° TURNO', '60004', 'DANIEL LUIZ SOUZA', 'SEPARADOR', '102492', 'INATIVO'],
      ['2° TURNO', '60005', 'MARCOS ROCHA', 'CONFERENTE', '101456', 'ATIVO'],
      ['2° TURNO', '60006', 'MARIA LIMA', 'CONFERENTE', '100321', 'ATIVO'],
      ['2° TURNO', '60007', 'HELENA COSTA', 'CONFERENTE', '', 'ATIVO'],
      ['2° TURNO', '60008', 'HELENA COSTA', 'CONFERENTE', '', 'ATIVO'],
      ['3° TURNO', '60009', 'J CARLOS SILVA', 'SEPARADOR', '100654', 'ATIVO'],
      ['3° TURNO', '60010', 'JOSE SILVA', 'SEPARADOR', '100777', 'ATIVO'],
      ['3° TURNO', '60011', 'JOSE SILVA', 'SEPARADOR', '200777', 'ATIVO']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR']], 'CDESLIGADOS': [['COD', 'COLABORADOR']],
    'FÉRIAS': [['Empresa', 'Filial', 'Matricula', 'Descrição', 'Nome', 'cc', 'turno', 'admissão', 'pa_inicio', 'pa_fim', 'DTA_LIMITE', 'DTA_LIMITEMAX', 'dias vencidos', 'codfuc', 'tipfuncao'],
      L(901, 'BRUNO DOS MARTINS SILVA', 655, 200),   // 2: a do BRUNO
      L(901, 'BRUNO ANTONIO DA SILVA', 655, -5),     // 3: a mesma matricula com outro nome e outra pessoa: o ANTONIO DA SILVA (sem o 1o nome)
      L(492, 'DANIEL ANTONIO DE SOUZA', 655, 10),    // 4: o ANTONIO DE SOUZA (ativo), nao o DANIEL LUIZ (que saiu, e com um nome que contradiz)
      L(1456, 'MARCOS ROCHA', 655, 100),             // 5
      L(456, 'MARCOS ROCHA', 655, 20),               // 6: homonimo com outra matricula: o MARCOS ja tem a 1456
      L(321, 'HELENA COSTA', 655, 30),               // 7: duas HELENA sem RH; o final 321 e da MARIA (outro nome)
      L(654, 'JOSE CARLOS SILVA', 700, 40),          // 8: outro setor, o nome so em parte (a GERAL tem a inicial)
      L(777, 'JOSE SILVA', 700, 50),                 // 9: outro setor, dois JOSE SILVA com o final 777
      L(777, 'PEDRO ROCHA', 655, 60)]                // 10: do CD, o final 777 e dos dois JOSE (outro nome)
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.ferias, 'leu a aba: ' + d.erro);
  const ref = (cod) => d.geral.find((g) => g.cod === cod).ref;
  const de = (cod) => d.ferias.linhas.filter((f) => f.ref === ref(cod)).map((f) => f.linha + ':' + f.chave).join();
  afirmar(de('60001') === '2:matricula' && de('60002') === '3:matricula' && de('60003') === '4:matricula' && de('60004') === '' && de('60005') === '5:matricula',
    'quem ficou com cada linha: ' + ['60001', '60002', '60003', '60004', '60005'].map((c) => c + '=' + de(c)).join(' '));
  const conf = (tipo) => d.inconsistencias.filter((x) => x.tipo === tipo);
  afirmar(conf('FERIAS_FORA_GERAL').map((x) => x.linha).join() === '6' &&
    /matrícula 456, mas não é de ninguém da GERAL\. O final 456 é de MARCOS ROCHA \(RH 101456\), que já tem a sua linha \(uma pessoa da GERAL fica com uma matrícula só\)\.$/.test(conf('FERIAS_FORA_GERAL')[0].detalhe),
    'homonimo com outra matricula: ' + JSON.stringify(conf('FERIAS_FORA_GERAL')));
  afirmar(conf('FERIAS_DUPLA').map((x) => x.linha).join() === '7' && conf('FERIAS_NOME').map((x) => x.linha).join() === '10', 'duas HELENA e o final dos dois JOSE: ' + JSON.stringify(conf('FERIAS_DUPLA').concat(conf('FERIAS_NOME'))));
  afirmar(d.leitura.ferias.foraDoCd === 2, 'outro setor: ' + d.leitura.ferias.foraDoCd);
  const sem = {};
  conf('FERIAS_SEM_DADOS').forEach((x) => { sem[x.cod] = x.detalhe; });
  afirmar(Object.keys(sem).sort().join() === '60006,60007,60008,60009,60010,60011', 'sem linha: ' + Object.keys(sem).sort().join());
  afirmar(/^A aba FÉRIAS tem a matrícula 321, mas de HELENA COSTA \(linha 7\), outro nome\./.test(sem['60006']), 'MARIA: ' + sem['60006']);
  afirmar(/serve a mais de uma pessoa: veja "Férias: linha que serve a mais de uma pessoa"/.test(sem['60007']) && /serve a mais de uma pessoa/.test(sem['60008']), 'HELENA: ' + sem['60007']);
  afirmar(/^A aba FÉRIAS tem a matrícula 654, de JOSE CARLOS SILVA \(linha 8, centro de custo 700\): o nome bate só em parte, .* inclua o centro de custo 700 nos parâmetros da aba Férias\./.test(sem['60009']), 'J CARLOS: ' + sem['60009']);
  afirmar(/^A aba FÉRIAS tem a matrícula 777, mas de PEDRO ROCHA \(linha 10\), outro nome: veja "Férias: matrícula de outra pessoa"\./.test(sem['60010']) && sem['60010'] === sem['60011'],
    'os dois JOSE (o motivo da linha do CD primeiro): ' + sem['60010']);
});

caso('quadro do CD (layout APOIO): a mesma linha em abas diferentes nao se confunde; o repetido diz a aba de cada linha', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = planilhaAntiga(m, 'BI Quadro Feira', {
    'APOIO TA': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO'], ['1', 'ANA', 'TA', 'CONFERENTE'], ['2', 'BRUNO', 'TA', 'SEPARADOR']],
    'APOIO TB': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO'], ['7', 'CARLA', 'TB', 'CONFERENTE'], ['2', 'DIEGO', 'TB', 'SEPARADOR']],
    'CADMITIDOS': [['PRODUTIVA', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'STATUS']],
    'CDESLIGADOS': [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.leitura.layout === 'APOIO', 'leu as abas APOIO: ' + JSON.stringify(d.leitura));
  const refs = d.geral.map((g) => g.ref);
  afirmar(d.geral.length === 4 && new Set(refs).size === 4 && refs.every(Boolean), 'uma chave por pessoa: ' + JSON.stringify(d.geral));
  afirmar(d.geral.filter((g) => g.linha === 2).map((g) => g.aba).join() === 'APOIO TA,APOIO TB', 'a linha 2 existe nas duas abas');
  const rep = d.inconsistencias.find((x) => x.tipo === 'COD_REPETIDO');
  afirmar(rep && rep.refs.length === 2 && rep.linhas.join() === 'APOIO TA 3,APOIO TB 3' && /APOIO TA 3, APOIO TB 3/.test(rep.detalhe), 'repetido entre abas: ' + JSON.stringify(rep));
});

caso('quadro do CD: a aba GERAL faz a triagem dos turnos; titulo em cima, "1º"/"1°", PROD como nome; as abas APOIO ficam de lado', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const { abas, esperado: E } = require('./dados-quadro.js')(m.DataDoScript, new Date());
  acao(m, s, 'salvarFonteQuadro', { link: planilhaAntiga(m, 'BI Quadro CD Feira', abas) });
  const d = tela(m, s, 'quadro');
  afirmar(!d.erro && d.formato === 4 && d.leitura.layout === 'GERAL' && d.leitura.aba === 'GERAL', 'leu a GERAL: ' + JSON.stringify(d.leitura));
  afirmar(d.leitura.colunas.nome === 'PROD' && d.leitura.colunas.funcao === 'DESCRICAO' && d.leitura.colunas.rh === 'RH' && !d.leitura.faltam.length,
    'colunas: ' + JSON.stringify(d.leitura));
  afirmar(!d.geral.some((g) => /NAO LER/.test(g.nome)), 'a aba APOIO TA nao foi lida');
  const ativos = d.geral.filter((g) => g.ativo);
  afirmar(ativos.length === E.ativos && d.geral.length - ativos.length === E.fora, 'ativos ' + ativos.length + ' fora ' + (d.geral.length - ativos.length));
  const por = {}; ativos.forEach((g) => { por[g.equipe] = (por[g.equipe] || 0) + 1; });
  Object.keys(E.porEquipe).forEach((k) => afirmar(por[k] === E.porEquipe[k], k + ': ' + por[k] + ' (esperava ' + E.porEquipe[k] + ')'));
  afirmar(por[''] === E.semEquipe, 'equipe fora do padrao: ' + por['']);
  afirmar(ativos.filter((g) => g.situacao === 'FERIAS').length === E.ferias && ativos.filter((g) => g.situacao === 'AFASTADO').length === E.afastados, 'ferias e afastados');
  // o "nome que some": todo mundo com nome, menos a linha que esta sem nome na planilha
  const semNome = d.geral.filter((g) => !g.nome);
  afirmar(semNome.length === 1 && semNome[0].cod === '39002', 'sem nome: ' + JSON.stringify(semNome));
  afirmar(d.geral.every((g) => !/^\d+$/.test(g.nome)), 'nenhum nome virou numero');
  const primeira = d.geral[0];
  afirmar(primeira.linha === 4 && primeira.cod === '30001' && primeira.rh === '100001' && primeira.nome && primeira.funcao === 'SEPARADOR', 'linha 4 da planilha: ' + JSON.stringify(primeira));
  // admitidos e desligados: os mesmos de antes, com os turnos antigos (TA/TB/TC) no padrao novo
  afirmar(d.adm.length === E.admitidos && d.des.length === E.desligados, 'adm ' + d.adm.length + ' des ' + d.des.length);
  afirmar(d.des.filter((x) => x.equipeBruta === 'TB').every((x) => x.equipe === '2° TURNO'), 'TB = 2° TURNO');
  // inconsistencias
  const tipo = (t) => d.inconsistencias.filter((x) => x.tipo === t);
  const da = tipo('DESLIGADO_ATIVO');
  afirmar(da.map((x) => x.cod).sort().join() === E.desligadoAtivo.slice().sort().join() && da.every((x) => x.gravidade === 'grave' && x.linha > 3),
    'desligado ativo: ' + JSON.stringify(da));
  afirmar(da.some((x) => x.chave === 'nome' && /pelo nome/.test(x.detalhe)), 'um deles achado pelo nome (sem produtivo na aba de desligados)');
  afirmar(!d.inconsistencias.some((x) => /SILVIA/.test(x.nome)), 'desligada que esta INATIVA na GERAL nao e inconsistencia');
  afirmar(tipo('SEM_NOME').map((x) => x.cod).join() === E.semNome.join(), 'sem nome');
  afirmar(tipo('EQUIPE').map((x) => x.cod).join() === E.equipeForaDoPadrao.join() && /TURNO 4/.test(tipo('EQUIPE')[0].detalhe), 'equipe: ' + JSON.stringify(tipo('EQUIPE')));
  afirmar(tipo('COD_REPETIDO').map((x) => x.cod).join() === E.codRepetido.join() && tipo('COD_REPETIDO')[0].linhas.length === 2, 'produtivo repetido');
  afirmar(!tipo('RH_REPETIDO').length, 'matricula repetida: nenhuma');
  afirmar(tipo('ADMITIDO_FORA').map((x) => x.cod).sort().join() === E.admitidoFora.join(), 'admitido fora da GERAL: ' + JSON.stringify(tipo('ADMITIDO_FORA')));
  // ferias (14/10): uma pessoa do quadro sem linha na FÉRIAS (e a linha sem nome), uma linha do CC 655 fora da GERAL
  afirmar(tipo('FERIAS_SEM_DADOS').map((x) => x.cod).sort().join() === [E.feriasSemLinha].concat(E.semNome).sort().join(), 'sem linha na FÉRIAS: ' + JSON.stringify(tipo('FERIAS_SEM_DADOS')));
  // a linha sem nome (RH 109002): o final 002 esta na FÉRIAS, mas ficou com o BRUNO pelo nome — o aviso nao diz que "nao esta na aba"
  afirmar(/^A matrícula 002 \(o final do RH 109002\) está na aba FÉRIAS, mas a linha ficou com BRUNO ALMEIDA MOREIRA \(RH 100002\), pelo nome\./.test(
    (tipo('FERIAS_SEM_DADOS').find((x) => x.rh === '109002') || {}).detalhe), 'final que ficou com outra pessoa: ' + JSON.stringify(tipo('FERIAS_SEM_DADOS')));
  afirmar(tipo('FERIAS_FORA_GERAL').length === 1 && /NATALIA/.test(tipo('FERIAS_FORA_GERAL')[0].nome), 'CC 655 fora da GERAL');
  afirmar(d.inconsistencias.length === 11, 'onze inconsistencias (oito do quadro e tres das ferias): ' + d.inconsistencias.length);
  afirmar(d.ferias.linhas.length === 171 && d.leitura.ferias.foraDoCd === 1, 'ferias: ' + d.ferias.linhas.length);
});

caso('quadro do CD: titulo com "COLABORADORES" em cima do cabecalho nao rouba a coluna do nome; copia velha do cache e relida', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = planilhaAntiga(m, 'Quadro', {
    'GERAL': [['QUADRO DE COLABORADORES', '', 'ATUALIZADO EM 10/10'], ['EQUIPE', 'COD', 'COLABORADOR', 'FUNÇÃO', 'MATRÍCULA', 'SITUAÇÃO'],
      ['1° TURNO', 30001, 'ANA PAULA REIS', 'SEPARADOR', '100001', 'Ativo'], ['3º TURNO', '30002', 'BRUNO DIAS', 'CONFERENTE', '100002', 'Férias'],
      ['adm', '30003', 'CAIO LIMA', 'ANALISTA', '100003', 'Inativo']]
  });
  acao(m, s, 'salvarFonteQuadro', { link });
  const d = tela(m, s, 'quadro');
  afirmar(d.geral.map((g) => g.nome).join() === 'ANA PAULA REIS,BRUNO DIAS,CAIO LIMA', 'nomes: ' + JSON.stringify(d.geral));
  afirmar(d.geral.map((g) => g.equipe).join() === '1° TURNO,3° TURNO,ADM' && d.geral[0].cod === '30001', 'equipes e produtivo: ' + JSON.stringify(d.geral));
  afirmar(d.geral.map((g) => g.situacao).join() === 'ATIVO,FERIAS,FORA', 'situacao: ' + d.geral.map((g) => g.situacao).join());
  // copia de outro formato no cache (o Quadro.gs anterior): nao e servida
  const id = /\/d\/([\w-]+)/.exec(link)[1];
  const c = novaExecucao(m, PASTA, { contaGoogle: DONO }, OP); c._porta = true;
  c.gravarTextoCache(c.chaveNoEspaco('quadro|' + id), JSON.stringify({ apoio: [{ nome: 'VELHO' }] }), 300);
  const d2 = tela(m, s, 'quadro');
  afirmar(d2.formato === 4 && d2.geral.length === 3, 'copia velha relida: ' + JSON.stringify(Object.keys(d2)));
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

caso('bolinha do menu: o numero de cada modulo e o "Em aberto" do plano — por pessoa, depois de gravar e na pagina da reserva', () => {
  const SUP_B = 'sup.limpeza@bartofil.com.br';
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarUsuario', { email: SUP_B, nome: 'Sup Limpeza', perfil: 'SUPERVISOR', turno: '', filiais: '*', papel: 'Supervisor' });
  const ontem = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  acao(m, adm, 'salvarAcao', { acao: 'Da Maria', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] });
  acao(m, adm, 'salvarAcao', { acao: 'Atrasada conjunta', prazo: ontem, turno: 'A', responsaveisEmails: [COORD, GERENTE] });
  acao(m, adm, 'salvarAcao', { acao: 'Do gerente', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
  acao(m, adm, 'salvarAcao', { acao: 'Cancelada', prazo: ontem, turno: 'A', responsaveisEmails: [COORD] });
  acao(m, adm, 'cancelarAcao', { id: tela(m, adm, 'acoes').lista.find((a) => a.acao === 'Cancelada').id, motivo: 'x' });
  acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Doca', prazo: '2026-12-01', turno: 'B', responsaveisEmails: [SUP_B], zona: 'Z3' });
  const bolinha = (s) => acao(m, s, 'pendencias').pendencias;
  const confere = (s, quem) => {
    const b = bolinha(s), telas = JSON.parse(chamar(m, s.email, 'retomarSessao', { t: s.t, f: s.f }).valor).telas.map((t) => t.id);
    const k = telas.includes('acoes') ? tela(m, s, 'acoes').contagens : null;
    const l = telas.includes('limpeza') ? tela(m, s, 'limpeza').plano.contagens : null;
    afirmar(k ? b.calendario && b.calendario.abertas === k.abertas && b.calendario.atrasadas === k.atrasadas : !b.calendario, quem + ' calendario: ' + JSON.stringify([b, k]));
    afirmar(l ? b.limpeza && b.limpeza.abertas === l.abertas && b.limpeza.atrasadas === l.atrasadas : !b.limpeza, quem + ' limpeza: ' + JSON.stringify([b, l]));
    return b;
  };
  const maria = entrar(m, COORD, '1234');
  afirmar(confere(adm, 'admin').calendario.abertas === 3, 'admin: as 3 em aberto (a cancelada nao conta)');
  const bm = confere(maria, 'maria');
  afirmar(bm.calendario.abertas === 2 && bm.calendario.atrasadas === 1 && !bm.limpeza, 'maria: so as dela, sem limpeza: ' + JSON.stringify(bm));
  afirmar(confere(entrar(m, SUP_B, '2222'), 'supervisor').limpeza.abertas === 1, 'supervisor: so a limpeza');
  confere(entrar(m, GERENTE, '5555'), 'gerente');
  acao(m, maria, 'concluirAcao', { id: tela(m, maria, 'acoes').lista.find((a) => a.acao === 'Da Maria').id });
  afirmar(bolinha(maria).calendario.abertas === 1, 'depois de concluir: ' + JSON.stringify(bolinha(maria)));
  const carga = (html) => JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(html)[1].replace(/\\u002f/g, '/').replace(/\\u003c/g, '<'));
  const bilhete = carga(ctx(m, 'computador.cd@bartofil.com.br').doGet({ parameter: {} }).getContent()).bilhete;
  const pg = carga(ctx(m, 'computador.cd@bartofil.com.br').doPost({ parameter: { bilhete, email: COORD, pin: '1234' } }).getContent());
  afirmar(pg.entrada === 'APP' && pg.pendencias && pg.pendencias.calendario.abertas === 1, 'pagina da reserva traz a bolinha: ' + JSON.stringify(pg.pendencias));
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

/* ------------------------------------------------------------------ */
/* COMENTARIOS: O SELO E MARCAR PESSOA (19/10)                         */
/* ------------------------------------------------------------------ */
const PEDRO = 'pedro.alves@bartofil.com.br', CONSULTA = 'carla.dias@bartofil.com.br';
/* O mundo de sempre + Pedro (coordenador do turno B), a supervisora da limpeza e a Carla (CONSULTA). */
function mundoComMencoes() {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  acao(m, adm, 'salvarUsuario', { email: PEDRO, nome: 'Pedro Alves', perfil: 'COORDENADOR', turno: 'B', filiais: '*', papel: 'Coordenador' });
  acao(m, adm, 'salvarUsuario', { email: SUP, nome: 'Sueli Ramos', perfil: 'SUPERVISOR', turno: '', filiais: '*', papel: 'Supervisora' });
  acao(m, adm, 'salvarUsuario', { email: CONSULTA, nome: 'Carla Dias', perfil: 'CONSULTA', turno: '', filiais: '*', papel: 'Qualidade' });
  return { m, adm };
}
const linkDoEmail = (e) => ((e.htmlBody || '').match(/href="([^"]+)"/) || [])[1] || '';
const cargaDe = (saida) => JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(saida.getContent())[1].replace(/\\u002f/g, '/').replace(/\\u003c/g, '<'));
/* A pagina como o computador do CD a recebe: GET (link de e-mail) e POST (reserva), com bilhete novo. */
const paginaGet = (m, parametros) => cargaDe(ctx(m, 'computador.cd@bartofil.com.br').doGet({ parameter: parametros }));
const paginaPost = (m, campos) => cargaDe(ctx(m, 'computador.cd@bartofil.com.br').doPost({ parameter: Object.assign({ bilhete: paginaGet(m, {}).bilhete }, campos) }));

caso('comentarios: concluir, reabrir e cancelar SEM texto sao registros automaticos (o selo e o "Comentarios (N)" nao contam); com texto, sao de alguem', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const maria = entrar(m, COORD, '1234');
  const id = acao(m, adm, 'salvarAcao', { acao: 'Almoxarifado', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  acao(m, maria, 'concluirAcao', { id });
  acao(m, adm, 'reabrirAcao', { id });
  acao(m, adm, 'cancelarAcao', { id });
  const h = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((a) => a.id === id).comentarios;
  afirmar(h.length === 3 && h.every((c) => c.automatico === true), 'automaticos: ' + JSON.stringify(h.map((c) => [c.tipo, c.texto, c.automatico])));
  const id2 = acao(m, adm, 'salvarAcao', { acao: 'Doca', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  acao(m, maria, 'comentarAcao', { id: id2, texto: 'Ação concluída.' });
  acao(m, maria, 'concluirAcao', { id: id2, observacao: 'Feito com a manutenção' });
  acao(m, adm, 'reabrirAcao', { id: id2, motivo: 'Faltou a doca 4' });
  acao(m, adm, 'cancelarAcao', { id: id2, motivo: 'Obra nova' });
  const h2 = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((a) => a.id === id2).comentarios;
  afirmar(h2.length === 4 && h2.every((c) => c.automatico === false), 'escritos: ' + JSON.stringify(h2.map((c) => [c.tipo, c.texto, c.automatico])));
});

caso('marcar pessoa: grava MENCOES no comentario e MARCADOS na acao; um e-mail por marcado (o autor nao) com o comentario escapado e o link que abre a acao; o recado conta os avisados', () => {
  const { m } = mundoComMencoes();
  const ger = entrar(m, GERENTE, '5555');
  const id = acao(m, ger, 'salvarAcao', { acao: 'Iluminação do Flow', descricao: 'Trocar as lâmpadas', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  const e0 = m.emails.length;
  const r = acao(m, ger, 'comentarAcao', { id, texto: '@Pedro Alves tem extintor <b>sobrando</b> & pronto?', situacao: 'Aguardando', depende: 'extintores do turno B',
    mencoes: [PEDRO, DONO, GERENTE, PEDRO.toUpperCase()] });
  afirmar(r.recado === 'Comentário registrado. 2 pessoas marcadas foram avisadas por e-mail.' && !r.avisoEmail, 'recado: ' + JSON.stringify(r));
  const c = ctx(m);
  const linha = c.listar('COMENTARIOS').find((x) => x.ACAO_ID === id);
  afirmar(linha.MENCOES === PEDRO + ',' + DONO, 'MENCOES (sem repetir e sem o autor): ' + linha.MENCOES);
  afirmar(c.obter('ACOES', id).MARCADOS === PEDRO + ',' + DONO && c.obter('ACOES', id).ANDAMENTO === 'Aguardando', 'MARCADOS: ' + c.obter('ACOES', id).MARCADOS);
  const mails = m.emails.slice(e0);
  afirmar(mails.map((e) => e.to).sort().join() === [DONO, PEDRO].sort().join(), 'um e-mail por marcado: ' + mails.map((e) => e.to).join());
  const mp = mails.find((e) => e.to === PEDRO), md = mails.find((e) => e.to === DONO);
  afirmar(mp.subject === 'João Lima marcou você numa ação: Iluminação do Flow', 'assunto: ' + mp.subject);
  afirmar(/&lt;b&gt;sobrando&lt;\/b&gt; &amp; pronto\?/.test(mp.htmlBody) && !/<b>sobrando/.test(mp.htmlBody), 'comentario escapado');
  afirmar(/João Lima<\/b> \(Gerente\) marcou você num comentário do Plano de Ação/.test(mp.htmlBody) && /Trocar as lâmpadas/.test(mp.htmlBody) &&
    /extintores do turno B/.test(mp.htmlBody) && /Aguardando/.test(mp.htmlBody), 'corpo com a acao: ' + mp.htmlBody.slice(0, 300));
  afirmar(new RegExp('[?&]tela=acoes&acao=' + id + '$').test(linkDoEmail(mp)) && />Abrir a ação no GSL</.test(mp.htmlBody), 'link: ' + linkDoEmail(mp));
  afirmar(/passou a acompanhar/.test(mp.htmlBody) && !/passou a acompanhar/.test(md.htmlBody), 'so quem nao via a acao recebe o "passou a acompanhar"');
  const a = tela(m, ger, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === id);
  afirmar(JSON.stringify(a.comentarios[0].mencoes) === JSON.stringify([{ email: PEDRO, nome: 'Pedro Alves' }, { email: DONO, nome: a.comentarios[0].mencoes[1].nome }]) &&
    a.marcados.map((x) => x.nome).join() === a.comentarios[0].mencoes.map((x) => x.nome).join(), 'nomes do servidor: ' + JSON.stringify([a.comentarios[0].mencoes, a.marcados]));
  // Limpeza: o assunto diz "da limpeza", o link abre a Limpeza e o local vai no corpo
  const idL = acao(m, ger, 'salvarAcaoLimpeza', { acao: 'Banheiro sem papel', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE], zona: 'Z7', local: 'Banheiro da central' }).id;
  const rl = acao(m, ger, 'comentarAcaoLimpeza', { id: idL, texto: '@Sueli Ramos pode repor?', mencoes: [SUP] });
  afirmar(rl.recado === 'Comentário registrado. 1 pessoa marcada foi avisada por e-mail.', 'recado limpeza: ' + rl.recado);
  const ml = m.emails.slice(-1)[0];
  afirmar(ml.to === SUP && ml.subject === 'João Lima marcou você numa ação da limpeza: Banheiro sem papel' && /Plano de Ação da Limpeza CD/.test(ml.htmlBody) &&
    /Z7 · Banheiro da central/.test(ml.htmlBody) && new RegExp('[?&]tela=limpeza&acao=' + idL + '$').test(linkDoEmail(ml)), 'e-mail da limpeza: ' + ml.subject + ' ' + linkDoEmail(ml));
});

caso('marcar pessoa: mais de 10, ou quem nao abre o plano nesta filial (coordenador na Limpeza, so de outra filial, inativo, sem cadastro), recusa o comentario inteiro — nada gravado, enviado ou subido', () => {
  const { m, adm } = mundoComMencoes();
  acao(m, adm, 'salvarFilial', { nome: 'CD Salvador', cidade: 'Salvador', codigo: 'SSA', paineis: { calendario: 'ATIVO' } });
  acao(m, adm, 'salvarUsuario', { email: 'davi@bartofil.com.br', nome: 'Davi Souza', perfil: 'COORDENADOR', turno: 'C', filiais: 'SSA', papel: 'Coord' });
  acao(m, adm, 'salvarUsuario', { email: 'ines@bartofil.com.br', nome: 'Inês Prado', perfil: 'COORDENADOR', turno: 'C', filiais: '*', papel: 'Coord', ativo: false });
  const idC = acao(m, adm, 'salvarAcao', { acao: 'Iluminação', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  const idL = acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Banheiro sem papel', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [SUP], zona: 'Z7' }).id;
  const n0 = ctx(m).listar('COMENTARIOS').length, e0 = m.emails.length, d0 = m.arquivos.size;
  const recusa = (nome, id, mencoes) => erroDe(() => acao(m, adm, nome, { id, texto: 'Vejam isto', mencoes, fotos: [foto(1)] }));
  const casos = [
    ['comentarAcaoLimpeza', idL, [COORD], 'Não dá para marcar quem não abre o Plano de Ação da Limpeza nesta filial: Maria Souza.'],
    ['comentarAcao', idC, ['davi@bartofil.com.br'], 'Não dá para marcar quem não abre o Plano de Ação nesta filial: Davi Souza.'],
    ['comentarAcao', idC, [PEDRO, 'ines@bartofil.com.br'], 'Não dá para marcar quem não abre o Plano de Ação nesta filial: Inês Prado.'],
    ['comentarAcao', idC, ['fulano.tal@bartofil.com.br'], 'Não dá para marcar quem não abre o Plano de Ação nesta filial: Fulano Tal.'],
    ['comentarAcao', idC, Array.from({ length: 11 }, (x, i) => 'p' + i + '@bartofil.com.br'), 'Marque no máximo 10 pessoas por comentário.']
  ];
  casos.forEach(([nome, id, mencoes, msg]) => {
    const e = recusa(nome, id, mencoes);
    afirmar(e.slice(-msg.length) === msg, nome + ' ' + mencoes.join() + ': ' + e);
  });
  const c = ctx(m);
  afirmar(c.listar('COMENTARIOS').length === n0 && m.emails.length === e0 && m.arquivos.size === d0, 'nada gravado, enviado ou subido');
  afirmar(!c.obter('ACOES', idC).MARCADOS && !c.obter('ACOES', idL).MARCADOS, 'ninguem marcado');
});

caso('marcar pessoa: o coordenador de outro turno passa a ver a acao (lista, Em aberto, bolinha e foto) e a responder — sem concluir nem mudar a situacao; "Sob sua responsabilidade" nao muda; editar a acao mantem os marcados', () => {
  const { m, adm } = mundoComMencoes();
  const id = acao(m, adm, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD], fotos: [foto(1)] }).id;
  const outra = acao(m, adm, 'salvarAcao', { acao: 'Pintura da faixa', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  const pedro = entrar(m, PEDRO, '2222');
  afirmar(!tela(m, pedro, 'acoes', { situacao: 'TODAS' }).lista.some((a) => a.id === id), 'antes da mencao o Pedro nao ve a acao da Maria');
  afirmar(/Só os responsáveis/.test(erroDe(() => acao(m, pedro, 'comentarAcao', { id, texto: 'oi' }))), 'antes da mencao nao comenta');
  const antes = tela(m, pedro, 'acoes').contagens;
  acao(m, adm, 'comentarAcao', { id, texto: '@Pedro Alves tem extintor sobrando?', situacao: 'Aguardando', depende: 'extintores', mencoes: [PEDRO] });
  const d = tela(m, pedro, 'acoes');
  const a = d.lista.find((x) => x.id === id);
  afirmar(a && a.marcadosEmails.join() === PEDRO && a.marcados[0].nome === 'Pedro Alves', 've a acao como marcado: ' + JSON.stringify(a && a.marcados));
  afirmar(!d.lista.some((x) => x.id === outra), 'a outra acao da Maria continua fora');
  afirmar(d.contagens.minhas === antes.minhas && d.contagens.abertas === antes.abertas + 1, 'contagens: ' + JSON.stringify([antes, d.contagens]));
  afirmar(acao(m, pedro, 'pendencias').pendencias.calendario.abertas === d.contagens.abertas, 'a bolinha continua igual ao Em aberto');
  afirmar(acao(m, pedro, 'fotoAcao', { id, arquivo: a.fotos[0].id }).dados === PNG_1x1, 've a foto da acao');
  afirmar(/Só o responsável/.test(erroDe(() => acao(m, pedro, 'concluirAcao', { id }))), 'nao conclui pelo botao');
  const r = acao(m, pedro, 'comentarAcao', { id, texto: 'Tenho dois, mando amanhã', situacao: 'Concluída', depende: 'nada' });
  afirmar(r.recado === 'Comentário registrado.', 'responde: ' + r.recado);
  const depois = tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === id);
  afirmar(depois.situacao === 'PENDENTE' && depois.andamento === 'Aguardando' && depois.depende === 'extintores', 'a situacao fica com os responsaveis: ' + JSON.stringify([depois.situacao, depois.andamento, depois.depende]));
  const ult = depois.comentarios.slice(-1)[0];
  afirmar(ult.autor === PEDRO && ult.tipo === 'COMENTARIO' && !ult.situacao && !ult.depende, 'registro do marcado: ' + JSON.stringify(ult));
  afirmar(/Só os responsáveis/.test(erroDe(() => acao(m, pedro, 'comentarAcao', { id: outra, texto: 'oi' }))), 'so naquela acao');
  acao(m, adm, 'salvarAcao', { id, acao: 'Iluminação do Flow', prazo: '2026-12-05', turno: 'A', responsaveisEmails: [COORD] });
  afirmar(ctx(m).obter('ACOES', id).MARCADOS === PEDRO && tela(m, pedro, 'acoes').lista.some((x) => x.id === id), 'editar a acao mantem o marcado');
  acao(m, adm, 'salvarAcao', { id, acao: 'Iluminação do Flow', prazo: '2026-12-05', turno: 'A', responsaveisEmails: [COORD, PEDRO] });
  afirmar(!tela(m, adm, 'acoes', { situacao: 'TODAS' }).lista.find((x) => x.id === id).marcados.length, 'virou responsavel: sai de "Marcados" (sem repetir no cartao)');
});

caso('marcar pessoa: quem ja via tudo (gestao, CONSULTA) entra em MARCADOS sem o "passou a acompanhar"; a CONSULTA passa a responder so naquela acao; a lista de pessoas diz quem ja ve todas', () => {
  const { m, adm } = mundoComMencoes();
  const id = acao(m, adm, 'salvarAcao', { acao: 'Extintores vencidos', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  const outra = acao(m, adm, 'salvarAcao', { acao: 'Outra', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  const pessoas = tela(m, adm, 'acoes').pessoas;
  const ve = (e) => (pessoas.find((p) => p.email === e) || {}).veTodas;
  afirmar(ve(GERENTE) === true && ve(CONSULTA) === true && ve(DONO) === true && ve(PEDRO) === false && ve(COORD) === false, 'veTodas: ' + JSON.stringify(pessoas.map((p) => [p.email, p.veTodas])));
  const carla = entrar(m, CONSULTA, '7777');
  afirmar(/Só os responsáveis/.test(erroDe(() => acao(m, carla, 'comentarAcao', { id, texto: 'oi' }))), 'a CONSULTA nao comentava');
  const e0 = m.emails.length;
  acao(m, entrar(m, COORD, '1234'), 'comentarAcao', { id, texto: '@Carla Dias @João Lima confere na auditoria?', mencoes: [CONSULTA, GERENTE] });
  const mails = m.emails.slice(e0);
  afirmar(mails.length === 2 && mails.every((e) => !/passou a acompanhar/.test(e.htmlBody)), 'sem "passou a acompanhar": ' + mails.map((e) => e.to).join());
  afirmar(ctx(m).obter('ACOES', id).MARCADOS === CONSULTA + ',' + GERENTE, 'MARCADOS: ' + ctx(m).obter('ACOES', id).MARCADOS);
  afirmar(acao(m, carla, 'comentarAcao', { id, texto: 'Conferido' }).recado === 'Comentário registrado.', 'a CONSULTA responde');
  afirmar(/Só os responsáveis/.test(erroDe(() => acao(m, carla, 'comentarAcao', { id: outra, texto: 'oi' }))), 'so naquela acao');
});

caso('marcar pessoa: o e-mail recusado nao desfaz o comentario — volta o avisoEmail (tambem pela reserva por POST); o recado conta so quem recebeu', () => {
  const { m, adm } = mundoComMencoes();
  acao(m, adm, 'salvarUsuario', { email: 'joana.invalido@bartofil.com.br', nome: 'Joana Prado', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' });
  const id = acao(m, adm, 'salvarAcao', { acao: 'Iluminação', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  const r = acao(m, adm, 'comentarAcao', { id, texto: '@Joana Prado @Pedro Alves vejam', mencoes: ['joana.invalido@bartofil.com.br', PEDRO] });
  afirmar(/^Comentário registrado, mas o aviso por e-mail não saiu para: joana\.invalido@bartofil\.com\.br \(/.test(r.avisoEmail || ''), 'avisoEmail: ' + r.avisoEmail);
  afirmar(r.recado === 'Comentário registrado. 1 pessoa marcada foi avisada por e-mail.', 'recado: ' + r.recado);
  const c = ctx(m);
  afirmar(c.listar('COMENTARIOS').some((x) => x.ACAO_ID === id && x.MENCOES === 'joana.invalido@bartofil.com.br,' + PEDRO) &&
    c.obter('ACOES', id).MARCADOS === 'joana.invalido@bartofil.com.br,' + PEDRO, 'o comentario e os marcados ficaram');
  afirmar(m.emails.some((e) => e.to === PEDRO && /marcou você/.test(e.subject)), 'o outro recebeu');
  // a mesma gravacao pela reserva (canal barrado): o avisoEmail chega na pagina
  const pg = paginaPost(m, { t: adm.t, filial: adm.f, tela: 'acoes', acao: 'comentarAcao', idem: '11111111-2222-4333-8444-555555555555',
    ap: JSON.stringify({ id, texto: 'pela reserva', mencoes: ['joana.invalido@bartofil.com.br'] }) });
  afirmar(pg.resultadoAcao && pg.resultadoAcao.ok && /não saiu para: joana\.invalido/.test(pg.resultadoAcao.avisoEmail) &&
    pg.resultadoAcao.recado === 'Comentário registrado.', 'pela reserva: ' + JSON.stringify(pg.resultadoAcao));
});

caso('atualizacao 8.10: banco da 8.9 (sem MENCOES nem MARCADOS) ganha as duas colunas na entrada e a mencao grava', () => {
  const m = mundo(); const c = ctx(m);
  const banco = m.planilhas.get(c.prop('ID_BANCO'));
  [['ACOES', 'MARCADOS'], ['COMENTARIOS', 'MENCOES']].forEach(([aba, coluna]) => {
    const a = banco.abas.find((x) => x.nome === aba);
    const col = a.dados[0].indexOf(coluna);
    afirmar(col !== -1, coluna + ' criada na instalacao');
    a.dados.forEach((l) => l.splice(col, 1));
  });
  c.PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', '8.9');
  m.cache.clear();
  const adm = entrar(m, DONO, '4321');                       // a entrada roda a migracao
  const cab = (aba) => banco.abas.find((x) => x.nome === aba).dados[0];
  afirmar(cab('ACOES').indexOf('MARCADOS') !== -1 && cab('COMENTARIOS').indexOf('MENCOES') !== -1, 'colunas criadas');
  afirmar(m.props.script.VERSAO_ESQUEMA === '8.10', 'versao: ' + m.props.script.VERSAO_ESQUEMA);
  const id = acao(m, adm, 'salvarAcao', { acao: 'Iluminação', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [COORD] }).id;
  acao(m, adm, 'comentarAcao', { id, texto: '@João Lima', mencoes: [GERENTE] });
  const c2 = ctx(m);
  afirmar(c2.obter('ACOES', id).MARCADOS === GERENTE && c2.listar('COMENTARIOS')[0].MENCOES === GERENTE, 'a mencao gravou');
});

caso('marcar pessoa: pela porta do outro plano a acao "nao existe" — nada gravado nem enviado', () => {
  const { m, adm } = mundoComMencoes();
  const idL = acao(m, adm, 'salvarAcaoLimpeza', { acao: 'Banheiro sem papel', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [SUP], zona: 'Z7' }).id;
  const e0 = m.emails.length;
  const e = erroDe(() => acao(m, adm, 'comentarAcao', { id: idL, texto: '@João Lima', mencoes: [GERENTE] }));
  afirmar(/Ação não encontrada/.test(e), 'porta do Calendario: ' + e);
  afirmar(!ctx(m).listar('COMENTARIOS').length && !ctx(m).obter('ACOES', idL).MARCADOS && m.emails.length === e0, 'nada gravado nem enviado');
});

caso('link do e-mail de mencao: ?tela=acoes&acao=ID volta como acaoDepois (so tela de plano e ID valido); a entrada com o link (canal e formulario da reserva) traz o plano com os filtros dele', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321'); entrar(m, GERENTE, '5555');
  afirmar(paginaGet(m, { tela: 'acoes', acao: 'ACO-MVFE5X6Y-0YD' }).acaoDepois === 'ACO-MVFE5X6Y-0YD', 'acoes');
  afirmar(paginaGet(m, { tela: 'limpeza', acao: 'ACO-1A' }).acaoDepois === 'ACO-1A', 'limpeza');
  afirmar(!paginaGet(m, { tela: 'calendario', acao: 'ACO-1A' }).acaoDepois, 'tela que nao e de plano');
  afirmar(!paginaGet(m, { tela: 'acoes', acao: '<script>' }).acaoDepois && !paginaGet(m, { tela: 'acoes', acao: 'A'.repeat(41) }).acaoDepois, 'ID invalido');
  afirmar(!paginaGet(m, { acao: 'ACO-1A' }).acaoDepois, 'sem tela');
  // a acao do link pode estar concluida: o plano vem com todas, numa ida so
  const id = acao(m, adm, 'salvarAcao', { acao: 'Concluída antes do clique', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] }).id;
  acao(m, adm, 'concluirAcao', { id });
  const r = JSON.parse(chamar(m, GERENTE, 'entrar', GERENTE, '5555', '', '', '', 'acoes', '{"situacao":"TODAS"}').valor);
  afirmar(r.telaEmbutida && r.telaEmbutida.params.situacao === 'TODAS' && r.telaEmbutida.resposta.dados.lista.some((a) => a.id === id), 'entrar: ' + JSON.stringify(r.telaEmbutida && r.telaEmbutida.params));
  const pg = paginaPost(m, { email: GERENTE, pin: '5555', tela: 'acoes', p: '{"situacao":"TODAS"}' });
  afirmar(pg.entrada === 'APP' && pg.telaEmbutida && pg.telaEmbutida.params.situacao === 'TODAS' && pg.telaEmbutida.resposta.dados.lista.some((a) => a.id === id),
    'formulario da reserva: ' + JSON.stringify(pg.telaEmbutida && pg.telaEmbutida.params));
});

/* ------------------------------------------------------------------ */
/* JOVEM APRENDIZ (Portal RH Aprendiz)                                 */
/* ------------------------------------------------------------------ */
const planilhaAprendiz = require('./dados-aprendiz.js');

function ligarAprendiz(m, s) {
  const link = planilhaAntiga(m, 'Imersão Corporativa (respostas)', planilhaAprendiz(m.DataDoScript, new Date()));
  acao(m, s, 'salvarFonteAprendiz', { link });
  return link;
}

caso('jovem aprendiz: le a planilha e monta o relatorio igual ao portal (status, medias, setores, linha do tempo, feedback)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  let d = tela(m, s, 'aprendiz');
  afirmar(!d.configurado && d.podeConfigurar, 'sem planilha: pede o link');
  ligarAprendiz(m, s);
  d = tela(m, s, 'aprendiz');
  const E = planilhaAprendiz.esperado;
  afirmar(!d.erro, 'erro: ' + d.erro);
  afirmar(JSON.stringify(d.lista.map((x) => [x.nomeOriginal, x.status])) === JSON.stringify(E.lista), 'lista: ' + JSON.stringify(d.lista.map((x) => [x.nomeOriginal, x.status])));
  const ana = d.paineis[d.lista[0].chave];
  afirmar(ana.mediaGeral === E.ana.mediaGeral && JSON.stringify(ana.mediasPilares) === JSON.stringify(E.ana.mediasPilares),
    'medias da Ana: ' + ana.mediaGeral + ' ' + JSON.stringify(ana.mediasPilares));
  afirmar(ana.vivenciados === 8 && ana.totais === 8 && ana.progresso === 100, 'setores da Ana: ' + ana.vivenciados + '/' + ana.totais);
  afirmar(ana.fimContrato === E.ana.fimContrato && ana.periodoFerias === E.ana.periodoFerias, 'contrato/ferias com ano de 4 digitos: ' + ana.fimContrato + ' | ' + ana.periodoFerias);
  const receb = ana.linhaDoTempo.find((x) => x.setor === 'Recebimento');
  afirmar(receb.status === 'concluido' && receb.media === E.ana.recebimento, 'Recebimento (turnos A e B juntos): ' + JSON.stringify(receb));
  afirmar(ana.avaliacoes.length === 9 && ana.avaliacoes[0].setor === 'LOJA' && ana.avaliacoes[0].data.length === 10, 'mais recente primeiro: ' + ana.avaliacoes[0].setor);
  afirmar(JSON.stringify(ana.avaliacoes[0].pontosMelhorar) === JSON.stringify(['Precisa ser mais ágil!']), 'sem linha vazia no feedback: ' + JSON.stringify(ana.avaliacoes[0].pontosMelhorar));
  afirmar(JSON.stringify(ana.avaliacoes.find((a) => a.setor === 'FLOWRACK - B').pontosPositivos) === JSON.stringify(['Cuidadosa', 'Calma']), 'uma linha por ponto');
  const bruno = d.paineis[d.lista.find((x) => x.nomeOriginal === 'BRUNO CARLOS TESTE').chave];
  afirmar(bruno.vivenciados === E.bruno.vivenciados && bruno.totais === E.bruno.totais &&
    JSON.stringify(bruno.linhaDoTempo.map((x) => x.status)) === JSON.stringify(E.bruno.linha), 'Bruno: ' + JSON.stringify(bruno.linhaDoTempo));
  afirmar(bruno.linhaDoTempo[0].media === E.bruno.devolucao && bruno.avaliacoes[0].mediaSetor === E.bruno.semFormula,
    'linha nova sem a formula da media: ' + bruno.avaliacoes[0].mediaSetor + ' / devolucao ' + bruno.linhaDoTempo[0].media);
  afirmar(JSON.stringify(bruno.avaliacoes[0].pontosPositivos) === JSON.stringify(['Sem registros.']), 'sem texto: Sem registros.');
  const elias = d.paineis[d.lista.find((x) => x.nomeOriginal === 'ELIAS FORA DO CRONOGRAMA').chave];
  afirmar(elias.fimContrato === 'Não informado' && elias.totais === 2 && elias.linhaDoTempo.every((x) => x.status === 'concluido'), 'so nas respostas: ' + JSON.stringify(elias.linhaDoTempo));
  afirmar(elias.linhaDoTempo.map((x) => x.setor).join() === 'INVENTARIO,LOJA', 'fora do cronograma: setores da avaliacao mais recente para a mais antiga, como no portal: ' + elias.linhaDoTempo.map((x) => x.setor).join());
  afirmar(d.fonte && d.fonte.nome === 'Imersão Corporativa (respostas)' && d.fonte.abaRespostas === 'Respostas ao formulário 1', 'fonte: ' + JSON.stringify(d.fonte));
});

caso('jovem aprendiz: cronograma geral vem da aba Cronograma, em ordem de fim de contrato (sem data no fim)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  ligarAprendiz(m, s);
  const d = tela(m, s, 'aprendiz');
  afirmar(JSON.stringify(d.cronograma.map((c) => c.nome)) === JSON.stringify(planilhaAprendiz.esperado.ordemCronograma), 'ordem: ' + d.cronograma.map((c) => c.nome + ' ' + c.final_contrato).join(' | '));
  const bruno = d.cronograma[0];
  afirmar(bruno.final_contrato === '20/11/2026' && bruno.cronograma.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(bruno.cronograma[0].inicio), 'Bruno: ' + JSON.stringify(bruno));
  const hoje = d.hoje;
  const andamento = bruno.cronograma.filter((x) => hoje >= x.inicio && hoje <= x.final).map((x) => x.setor);
  afirmar(andamento.join() === 'Inventario', 'setor em andamento hoje: ' + andamento.join());
  afirmar(d.cronograma[3].final_contrato === '' && d.cronograma[3].cronograma.length === 2, 'sem contrato vai para o fim: ' + JSON.stringify(d.cronograma[3]));
});

caso('jovem aprendiz: setor em branco conta como setor proprio; media do setor somada como no portal; contrato com traco ou ponto entra na ordem', () => {
  const m = mundo(); const c = ctx(m); const D = m.DataDoScript;
  const cab = ['Carimbo', 'Email', 'AVALIADOR', 'SETOR', 'NOME', 'AT', 'DI', 'IN', 'PR', 'AP', 'POS', 'MEL', 'MEDIA'];
  const lin = (dia, setor, nome, media, notas) => [new D(2026, 8, dia, 9, 0, 0), 'a@b', 'Avaliador', setor, nome].concat(notas || [3, 3, 3, 3, 3], ['ok', 'ok', media]);
  const resp = [cab,
    lin(1, 'LOJA', 'Pessoa Um', 3), lin(2, '', 'Pessoa Um', 4), lin(3, '', 'Pessoa Um', 5),
    // quatro avaliacoes do mesmo setor: a soma na ordem do portal (mais recente primeiro) arredonda para 1.4
    lin(4, 'RECEBIMENTO - A', 'Pessoa Dois', 1), lin(5, 'RECEBIMENTO - B', 'Pessoa Dois', 1),
    lin(6, 'RECEBIMENTO - A', 'Pessoa Dois', 1.2), lin(7, 'RECEBIMENTO - B', 'Pessoa Dois', 2.6),
    // linha nova do Formulario sem a formula da media e com uma nota em branco: a conta do =MEDIA(F:J)
    lin(8, 'LOJA', 'Pessoa Tres', '', [4, '', 5, 3, 4])];
  const crono = [['Nome', 'Setor', 'Inicio', 'Final', '', 'Nome', 'Setor', 'Inicio', 'Final', '']];
  const bloco = (nome, contrato) => { const b = Array.from({ length: 8 }, () => ['', '', '', '', '', '', '', '', '', '']); b[0][0] = nome; b[1][0] = contrato; b[0][1] = 'Loja'; return b; };
  crono.push(...bloco('Contrato Traco', 'Final de contrato: 03-11-2026'), ...bloco('Contrato Barra', 'Final de contrato: 10/01/2027'),
             ...bloco('Contrato Ponto', 'Final de contrato: 30.10.26'), ...bloco('Sem Contrato', ''));
  const d = JSON.parse(JSON.stringify(c.montarAprendiz_(resp, crono, 'America/Bahia')));
  const um = d.paineis[d.lista.find((x) => x.nomeOriginal === 'Pessoa Um').chave];
  afirmar(um.vivenciados === 3 && um.linhaDoTempo.map((x) => x.setor).join() === '3,2,LOJA', 'setor em branco: ' + um.vivenciados + ' ' + um.linhaDoTempo.map((x) => x.setor).join());
  const dois = d.paineis[d.lista.find((x) => x.nomeOriginal === 'Pessoa Dois').chave];
  afirmar(dois.linhaDoTempo[0].media === 1.4, 'media do Recebimento (1 + 1 + 1.2 + 2.6, da mais recente): ' + dois.linhaDoTempo[0].media);
  const tres = d.paineis[d.lista.find((x) => x.nomeOriginal === 'Pessoa Tres').chave];
  afirmar(tres.avaliacoes[0].mediaSetor === 4, 'sem a formula: media das notas preenchidas (4, 5, 3, 4): ' + tres.avaliacoes[0].mediaSetor);
  afirmar(d.cronograma.map((x) => x.nome).join() === 'Contrato Ponto,Contrato Traco,Contrato Barra,Sem Contrato', 'ordem: ' + d.cronograma.map((x) => x.nome + ' ' + x.final_contrato).join(' | '));
});

caso('jovem aprendiz: "Atualizar dados" da barra lateral rele a planilha; parametro repetido vale o que tem valor; versao 8.10 vem depois da 8.9', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  const link = ligarAprendiz(m, s);
  let d = tela(m, s, 'aprendiz');
  afirmar(d.lista.find((x) => x.nomeOriginal === 'CAIO DIAS TESTE').status === 'Não realizada', 'antes da avaliacao nova');
  // chega uma resposta do Formulario para o Caio (a copia do servidor e de 5 minutos)
  const aba = m.planilhas.get(link.split('/')[5]).abas.find((a) => a.nome === 'Respostas ao formulário 1');
  const D = m.DataDoScript, h = new Date();
  aba.dados.splice(14, 0, [new D(h.getFullYear(), h.getMonth(), h.getDate(), 8, 0, 0), 'x@bartofil.com.br', 'Avaliador Onze', 'DEVOLUÇÃO', 'CAIO DIAS TESTE', 4, 4, 4, 4, 4, 'Bom', 'Nada', 4]);
  d = tela(m, s, 'aprendiz');
  afirmar(d.lista.find((x) => x.nomeOriginal === 'CAIO DIAS TESTE').status === 'Não realizada', 'dentro dos 5 minutos: a copia guardada');
  acao(m, s, 'atualizarDados', {});
  d = tela(m, s, 'aprendiz');
  afirmar(d.lista.find((x) => x.nomeOriginal === 'CAIO DIAS TESTE').status === 'Pendente', 'depois do "Atualizar dados" da barra lateral: ' + d.lista.map((x) => x.nomeOriginal + ' ' + x.status).join(' | '));
  // duas aberturas juntas criaram a chave duas vezes: vale a linha que tem o link
  const c = ctx(m);
  const linhas = c.listar('PARAMETROS').filter((p) => p.CHAVE === 'APRENDIZ_PLANILHA');
  c.atualizar('PARAMETROS', linhas[0].ID, { VALOR: '' }, DONO);
  c.inserir('PARAMETROS', { CHAVE: 'APRENDIZ_PLANILHA', VALOR: link, DESCRICAO: 'repetida' }, DONO);
  m.cache.clear();
  afirmar(ctx(m).idPlanilhaAprendiz_() === link.split('/')[5], 'parametro repetido: vale o que tem valor');
  const v = ctx(m).numeroDaVersao_;
  afirmar(v('8.10') > v('8.9') && v('8.9') > v('8.1') && v('8.1') > v('8.0') && v('8.0') > v('7.9') && v('') === 0, 'versoes parte por parte');
});

caso('jovem aprendiz: modulo no menu — gerente ve, coordenador so com o modulo liberado; link errado e recusado; so quem configura liga', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const ger = entrar(m, GERENTE, '5555');
  const rg = JSON.parse(chamar(m, GERENTE, 'retomarSessao', { t: ger.t, f: ger.f }).valor);
  afirmar(rg.modulos.some((x) => x.id === 'aprendiz' && x.telas.join() === 'aprendiz'), 'gerente ve o modulo: ' + rg.modulos.map((x) => x.id).join());
  let maria = entrar(m, COORD, '1234');
  let rc = JSON.parse(chamar(m, COORD, 'retomarSessao', { t: maria.t, f: maria.f }).valor);
  afirmar(!rc.telas.some((t) => t.id === 'aprendiz'), 'coordenador nao ve por padrao');
  const reg = ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === COORD);
  acao(m, adm, 'definirModuloPessoa', { id: reg.ID, modulo: 'aprendiz', modo: 'VER' });
  maria = entrar(m, COORD, '1234');
  rc = JSON.parse(chamar(m, COORD, 'retomarSessao', { t: maria.t, f: maria.f }).valor);
  afirmar(rc.telas.some((t) => t.id === 'aprendiz'), 'liberado por pessoa (Ver)');
  afirmar(erroDe(() => acao(m, maria, 'salvarFonteAprendiz', { link: 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit' })), 'quem so ve nao liga planilha');
  afirmar(/não parece de uma planilha/.test(erroDe(() => acao(m, adm, 'salvarFonteAprendiz', { link: 'qualquer coisa' }))), 'link invalido');
  const semAbas = planilhaAntiga(m, 'Outra planilha', { 'Plan1': [['a', 'b']] });
  afirmar(/abas esperadas/.test(erroDe(() => acao(m, adm, 'salvarFonteAprendiz', { link: semAbas }))), 'planilha sem as abas');
  ligarAprendiz(m, adm);
  const dm = tela(m, maria, 'aprendiz');
  afirmar(dm.configurado && !dm.podeConfigurar && dm.lista.length === 5, 'coordenador ve o portal, sem trocar a planilha');
  afirmar(/relido/.test(acao(m, maria, 'atualizarAprendiz', {}).recado), 'atualizar le de novo');
});

caso('jovem aprendiz: a atualizacao (8.9) liga o painel na principal e libera o gerente nos niveis que ja existiam', () => {
  const m = mundo(); let c = ctx(m);
  // banco como a 8.8 deixou: painel sem o aprendiz e a coluna TELA_APRENDIZ ainda nao existe
  const pr = c.listar('FILIAIS').find((f) => c.marcado(f.PRINCIPAL));
  const paineis = JSON.parse(pr.PAINEIS); delete paineis.aprendiz;
  c.atualizar('FILIAIS', pr.ID, { PAINEIS: JSON.stringify(paineis) }, DONO);
  c = ctx(m);
  const aba = m.planilhas.get(c.prop('ID_BANCO')).abas.find((a) => a.nome === 'PERFIS');
  const col = aba.dados[0].indexOf('TELA_APRENDIZ');
  afirmar(col !== -1, 'coluna criada na instalacao');
  aba.dados.forEach((l) => l.splice(col, 1));
  c.PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', '8.8');
  m.cache.clear();
  c = ctx(m); c.garantirEsquema();
  c = ctx(m);
  const pr2 = c.listar('FILIAIS').find((f) => c.marcado(f.PRINCIPAL));
  afirmar(JSON.parse(pr2.PAINEIS).aprendiz === 'ATIVO', 'painel ligado: ' + pr2.PAINEIS);
  const ger = c.listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === 'GERENTE');
  const coo = c.listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === 'COORDENADOR');
  afirmar(c.marcado(ger.TELA_APRENDIZ) && !c.marcado(coo.TELA_APRENDIZ), 'gerente sim, coordenador nao: ' + ger.TELA_APRENDIZ + ' / ' + coo.TELA_APRENDIZ);
  afirmar(c.listar('PARAMETROS').some((p) => p.CHAVE === 'APRENDIZ_PLANILHA'), 'parametro criado');
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
