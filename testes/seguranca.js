#!/usr/bin/env node
/*
 * SEGURANCA — o que qualquer conta da empresa consegue pelo console.
 *
 *   node testes/seguranca.js [pasta-do-GSL]
 *
 * O Apps Script deixa o navegador chamar QUALQUER funcao global do servidor
 * pelo google.script.run (so as terminadas em "_" ficam de fora). Este teste
 * aquece os caches com um uso normal e depois chama as funcoes internas como
 * uma conta da empresa sem cadastro: nenhuma pode devolver segredo, dado de
 * pessoa ou mexer no banco. E confere que gatilho e dono continuam passando.
 */
'use strict';
const path = require('path');
const { Mundo, chamarPeloNavegador } = require('./emulador/gas.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const DONO = 'dono@bartofil.com.br', ATACANTE = 'estagiario@bartofil.com.br';
const m = new Mundo({ dono: DONO });
const run = (conta, fn, ...a) => chamarPeloNavegador(m, PASTA, { contaGoogle: conta }, fn, a, { apagarComentarios: 'nenhum' });

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHA ') + msg); if (!cond) falhas++; };

run(DONO, 'instalar', DONO);
const e = JSON.parse(run(DONO, 'entrar', DONO, '4321', '4321', '', '').valor);
const ctx = { t: e.token, f: e.filial.codigo };
e.telas.forEach((t) => run(DONO, 'carregarTela', ctx, t.id, {}));      // caches quentes, como no dia a dia
// um primeiro acesso em andamento (codigo guardado no cache)
run(ATACANTE, 'entrar', DONO.replace('dono', 'outro'), '1111', '', '', '');

// "usuario" montado no console, com todas as capacidades — so a porta pode barrar.
const FALSO = { email: ATACANTE, perfil: 'ADMIN', permissoes: { escopo: 'TODOS', telas: ['limpeza', 'acoes', 'estoque'],
  podes: ['GERIR_LIMPEZA', 'GERIR_ACOES', 'GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE'] } };
console.log('Chamadas diretas de uma conta sem cadastro (' + PASTA + '):');
const bloqueadas = [
  ['prop', 'SEGREDO_PIN'], ['comCache', 'acessos'], ['comCache', 'pincod_email_dono_bartofil_com_br'],
  ['buscarAcesso', DONO], ['listar', 'AGR_COLAB'], ['listar', 'ACESSOS'], ['obter', 'ACESSOS', 'x'],
  ['lerTextoCache', 'geracao'], ['listarFiliais'], ['carregarPerfis'], ['idBancoMestre'],
  ['limparCache'], ['avancarGeracao'], ['inserir', 'ACESSOS', { EMAIL: 'x@bartofil.com.br', PERFIL: 'ADMIN' }, 'x'],
  ['atualizarVarios', 'ACESSOS', [{ id: 'x', campos: { PERFIL: 'ADMIN' } }], 'x'],
  ['atualizarCompetenciaAberta'], ['gerarMesSeNecessario'], ['testarEmail'], ['garantirEsquema'], ['corrigirFuso'],
  // 4.2.2: Plano de Acao da Limpeza, estoque da limpeza e fotos — "usuario" inventado no console
  ['listarAcoes', 'LIMPEZA'], ['pessoasParaAcao', null], ['dadosLimpeza', FALSO, {}], ['dadosAcoes', FALSO, {}],
  ['acaoFotoAcao', FALSO, { id: 'x', arquivo: 'y' }], ['acaoFotoAcaoLimpeza', FALSO, { id: 'x', arquivo: 'y' }],
  ['acaoSalvarItemLimpeza', FALSO, { nome: 'x' }], ['acaoMovimentarLimpeza', FALSO, { tipo: 'ENTRADA', item: 'LP-0001', quantidade: 1 }],
  ['acaoSalvarAcaoLimpeza', FALSO, { acao: 'x', prazo: '2026-12-01', turno: 'A', responsavel: 'x' }],
  ['acaoRemoverFotoAcao', FALSO, { id: 'x', arquivo: 'y' }], ['removerAnexo', FALSO, 'ACOES', 'x', 'y']
];
bloqueadas.forEach(([fn, ...a]) => {
  const r = run(ATACANTE, fn, ...a);
  ok(!r.ok && /Acesso negado|not found/i.test(r.erro.message), fn + '(' + a.map((x) => JSON.stringify(x)).join(', ').slice(0, 50) + ') bloqueada' +
    (r.ok ? ' — DEVOLVEU ' + JSON.stringify(r.valor).slice(0, 60) : ''));
});

console.log('\nQuem deve continuar passando:');
const g = run('', 'atualizarCompetenciaAberta');                        // gatilho: sem usuario do outro lado
ok(g.ok, 'gatilho (sem usuario) roda atualizarCompetenciaAberta');
const d = run(DONO, 'prop', 'ID_BANCO');                                 // dono pelo editor
ok(d.ok && d.valor, 'dono pelo editor le propriedade');
const t = JSON.parse(run(ATACANTE, 'carregarTela', ctx, 'inicio', {}).valor);
ok(t && t.ok !== false, 'a tela, com sessao valida, continua abrindo');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo ok'));
process.exit(falhas ? 1 : 0);
