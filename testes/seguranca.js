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
const { Mundo, chamarPeloNavegador, novaExecucao } = require('./emulador/gas.js');
const { HEIC_MINI } = require('./emulador/miniatura-drive.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const DONO = 'dono@bartofil.com.br', ATACANTE = 'estagiario@bartofil.com.br';
const m = new Mundo({ dono: DONO });
const run = (conta, fn, ...a) => chamarPeloNavegador(m, PASTA, { contaGoogle: conta }, fn, a, { apagarComentarios: 'nenhum' });

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHA ') + msg); if (!cond) falhas++; };

run(DONO, 'instalar', DONO);
const e = JSON.parse(run(DONO, 'entrar', DONO, '4321', '4321', '', '').valor);
const ctx = { t: e.token, f: e.filial.codigo };
// Jovem Aprendiz ligado a uma planilha: o cache da tela guarda as avaliacoes de todos os aprendizes
const LINK_APZ = (function () {
  const abas = require('./dados-aprendiz.js')(m.DataDoScript, new Date());
  const p = m.novaPlanilha('Imersão Corporativa (respostas)');
  const Aba = Object.getPrototypeOf(p.abas[0]).constructor;
  Object.keys(abas).forEach((nome, i) => {
    const aba = i === 0 ? p.abas[0] : new Aba(p, nome, 1000, 26);
    if (i === 0) aba.nome = nome; else p.abas.push(aba);
    abas[nome].forEach((linha, l) => { aba.dados[l] = linha.slice(); });
  });
  return 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit';
})();
run(DONO, 'executarAcao', ctx, 'salvarFonteAprendiz', { link: LINK_APZ });
e.telas.forEach((t) => run(DONO, 'carregarTela', ctx, t.id, {}));      // caches quentes, como no dia a dia
// um primeiro acesso em andamento (codigo guardado no cache)
run(ATACANTE, 'entrar', DONO.replace('dono', 'outro'), '1111', '', '', '');

// "usuario" montado no console, com "Ver e editar" em tudo (e os campos do modelo antigo) — so a porta pode barrar.
const TODAS_EDITAR = {};
['inicio', 'calendario', 'acoes', 'assiduidade', 'apresentacao', 'nobreaks', 'limpeza', 'quadro', 'estoque', 'aprendiz', 'config', 'acessos', 'filiais', 'relatos']
  .forEach((t) => { TODAS_EDITAR[t] = 'EDITAR'; });
const FALSO = { email: ATACANTE, perfil: 'ADMIN', permissoes: { escopo: 'TODOS', niveis: TODAS_EDITAR, telas: ['limpeza', 'acoes', 'estoque', 'aprendiz'],
  podes: ['GERIR_LIMPEZA', 'GERIR_ACOES', 'GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE', 'PROGRAMAR'] } };
const apz = JSON.parse(run(DONO, 'carregarTela', ctx, 'aprendiz', {}).valor).dados;
ok(apz && apz.lista && apz.lista.length === 5, 'preparo: Jovem Aprendiz ligado e com o cache quente (' + (apz && apz.lista ? apz.lista.length : 0) + ' aprendizes)');
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
  ['acaoPendencias', FALSO], ['pendenciasDoUsuario_', FALSO], ['comPendencias_', { ok: true, entrada: 'APP' }],
  ['acaoFotoAcao', FALSO, { id: 'x', arquivo: 'y' }], ['acaoFotoAcaoLimpeza', FALSO, { id: 'x', arquivo: 'y' }],
  ['acaoSalvarItemLimpeza', FALSO, { nome: 'x' }], ['acaoMovimentarLimpeza', FALSO, { tipo: 'ENTRADA', item: 'LP-0001', quantidade: 1 }],
  ['acaoSalvarAcaoLimpeza', FALSO, { acao: 'x', prazo: '2026-12-01', turno: 'A', responsavel: 'x' }],
  ['acaoRemoverFotoAcao', FALSO, { id: 'x', arquivo: 'y' }], ['removerAnexo', FALSO, 'ACOES', 'x', 'y'],
  // 4.2.2: Jovem Aprendiz — avaliacoes dos aprendizes e a troca da planilha
  ['dadosAprendiz', FALSO], ['acaoSalvarFonteAprendiz', FALSO, { link: LINK_APZ }], ['acaoAtualizarAprendiz', FALSO],
  ['lerPlanilhaAprendiz_', LINK_APZ.split('/')[5]], ['idPlanilhaAprendiz_'],
  // 10/10: sessao duravel, gravar pela reserva, cache — tudo interno
  ['acaoPelaPagina_', { t: 'x', acao: 'excluirAcao', ap: '{}' }], ['embutirTela_', {}, 'x', 'acoes', ''],
  ['encerrarSessao_', 'f'.repeat(64)], ['podarSessoes_', true], ['resumoDasSessoes_'], ['lerSessaoDaLoja_', 'f'.repeat(64)], ['publicarNumeros_', { GERACAO_DADOS: '999' }], ['publicarGeracoes_'], ['preLerCache_', 'x'],
  ['cadastrosDeAcesso_'], ['lojaDeSessoes_'], ['chaveSessaoDuravel_', 'x'],
  // 19/10: o menu relido depois de uma gravacao (so por dentro do executarAcaoETela)
  ['menuDaSessao_', ctx],
  // 19/10: foto HEIC — as pecas do conversor (o Drive e a API do Drive com o token do dono)
  ['miniaturaDoDrive_', 'x', 25000], ['heicGravadaConvertida_', 'x'],
  // revisao de 19/10: quem pode converter, o limite por pessoa e o DELETE da pasta temporaria (com o token do dono)
  ['exigirQuemAnexaFoto_', FALSO, { plano: 'CALENDARIO', uso: 'ac' }], ['contarConversaoHeic_', FALSO], ['apagarPastaTemporaria_', 'x'],
  // 19/10: marcar pessoa no comentario — a lista de quem pode ser marcado (com quem ve tudo), o aviso e a porta direta
  ['pessoasParaAcao', { id: 'CALENDARIO', modulo: 'calendario', cap: 'GERIR_ACOES' }],
  ['acaoComentarAcao', FALSO, { id: 'x', texto: 'x', mencoes: [DONO] }], ['acaoComentarAcaoLimpeza', FALSO, { id: 'x', texto: 'x', mencoes: [DONO] }],
  ['mencoesDoPedido_', { id: 'CALENDARIO', modulo: 'calendario', cap: 'GERIR_ACOES', nome: 'Plano de Ação' }, FALSO, { mencoes: [DONO] }],
  ['avisarMencao_', { id: 'CALENDARIO', tela: 'acoes' }, { ID: 'x', ACAO: 'x' }, { email: ATACANTE, nome: 'x' }, 'x', DONO, true],
  ['enviar', [DONO], 'x', '<p>x</p>', null, { replyTo: ATACANTE }], ['marcadosQueFicam_', [DONO], [], []],
  ['acaoSalvarAcao', FALSO, { id: 'x', acao: 'x', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [ATACANTE], desmarcados: [DONO] }],
  // 19/10: rotinas — gravar, desativar e remover mexem nas atividades ja geradas
  ['acaoSalvarRotina', FALSO, { tipo: 'RON', atividade: 'x', frequencia: 'SEMANAL', dia: '3', ativo: true }],
  ['acaoAlternarRotina', FALSO, { id: 'x', ativo: false }], ['acaoExcluirRotina', FALSO, { id: 'x' }],
  ['acaoLimparSiglaOrfa', FALSO, { sigla: 'RON' }],
  // 20/10: Remover do estoque apaga o item E as movimentacoes dele
  ['acaoExcluirItemEstoque', FALSO, { id: 'x', excluirMovimentos: true }], ['acaoExcluirItemLimpeza', FALSO, { id: 'x', excluirMovimentos: true }],
  // 21/10: programacao das ferias do Quadro (grava no banco da filial)
  ['acaoProgramarFerias', FALSO, { matricula: '123', nome: 'x', paFim: '2026-06-09', inicio: '2026-12-07', dias: 30 }],
  ['acaoConfirmarFerias', FALSO, { id: 'x' }], ['acaoCancelarProgramacaoFerias', FALSO, { id: 'x' }],
  ['gerarCompetencia', 'OUT 2026', ATACANTE], ['sincronizarRotina_', null, null, ATACANTE],
  // 8.12: a matriz de tres faixas — mexer na matriz, no ajuste de alguem, restaurar o padrao, converter o banco,
  // ler a faixa de alguem ou a lista de pessoas com as faixas: nada disso anda fora da porta
  ['acaoAlterarPermissao', FALSO, { id: 'x', coluna: 'TELA_ACESSOS', valor: 'EDITAR' }],
  ['acaoDefinirAjustePessoa', FALSO, { id: 'x', tela: 'filiais', nivel: 'EDITAR' }],
  ['acaoDefinirModuloPessoa', FALSO, { id: 'x', modulo: 'config', modo: 'EDITAR' }],
  ['acaoSalvarUsuario', FALSO, { email: ATACANTE, nome: 'x', perfil: 'ADMIN', ajustes: { acessos: 'EDITAR' } }],
  ['acaoRestaurarPerfis', FALSO], ['migrarParaTresFaixas_'], ['permissoesDe', 'ADMIN'], ['permissoesDaPessoa', 'ADMIN', {}],
  ['nivelNaTela', FALSO, 'estoque'], ['exigirAcao_', FALSO, 'x', { tela: 'estoque' }], ['dadosPessoas', FALSO], ['listarPessoas'],
  ['linhaCruaDoNivel_', 'ADMIN'], ['marcaDoMenu', FALSO],
  // 25/11: Situacao de Carga — a tela (nomes do Quadro), os envios, a equipe, os equipamentos e a geracao
  ['dadosCarga', FALSO, {}], ['acaoGeracaoCarga', FALSO],
  ['acaoEnviarSituacaoCarga', FALSO, { emitidoEm: '2026-11-25T08:00:00', depositos: [{ id: 'GRANDEZA' }], cargas: [{ nro: '762480', d: { GRANDEZA: ['X', 'X'] } }] }],
  ['acaoExcluirSituacaoCarga', FALSO, { id: 'x' }], ['acaoMoverPessoaCarga', FALSO, { pessoa: { k: 'C123', nome: 'x' }, destino: { dep: 'GRANDEZA', papel: 'SEPARADOR' } }],
  ['acaoLimparAlocacaoCarga', FALSO, {}], ['acaoEquipamentoCarga', FALSO, { tipo: 'PALETEIRA', numero: 1, estado: 'MANUTENCAO' }],
  ['acaoQuantidadeEquipamentoCarga', FALSO, { tipo: 'PALETEIRA', quantidade: 0 }], ['semearEquipamentosCarga_'], ['cgCargasDe_', { CARGAS: 'DRIVE:x' }],
  // 8.15: Situacao de Carga fase 2 — historico, sequencia, falta, boxes (planilha de fora), passagem, ajustes e a migracao
  ['acaoSnapshotCarga', FALSO, { id: 'x', com: 'atual' }], ['acaoBoxCarga', FALSO, { numero: 1, estado: 'BLOQUEADO' }],
  ['acaoCarregamentoCarga', FALSO, { op: 'salvar', carga: '762480', box: 1 }], ['acaoImportarBoxesCarga', FALSO, { link: LINK_APZ }],
  ['acaoSequenciaCarga', FALSO, { op: 'mover', carga: '762480', para: 1 }],
  ['acaoPresencaCarga', FALSO, { pessoa: { k: 'C123', nome: 'x' }, falta: true }],
  ['acaoPassagemCarga', FALSO, { op: 'confirmar', sai: 'A', entra: 'B' }],
  ['acaoParametrosCarga', FALSO, { boxes: 30 }],
  ['migrarCarga815_'], ['cgLerPlanilhaBoxes_', LINK_APZ.split('/')[5]], ['cgPatioDaTela_', []], ['cgSalvarParametro_', 'CARGA_BOXES', '1', 'x'],
  // 8.16: Situacao de Carga fase 3 — subturno 5x2, alocacao automatica e em lote, grade Controle e cadastros do patio
  ['acaoSubturnoCarga', FALSO, { pessoas: [{ k: 'C123', nome: 'x', equipe: '1° TURNO' }], subturno: 'A1' }],
  ['acaoDesfazerAutoCarga', FALSO, { id: 'x' }], ['acaoAlocarLoteCarga', FALSO, { itens: [] }],
  ['acaoCarregamentoLoteCarga', FALSO, { linhas: [{ carga: '762480', box: 1 }] }],
  ['acaoCadastroCarga', FALSO, { op: 'salvar', tipo: 'DESTINO', valor: 'x' }],
  ['cgAutoTurno_'], ['cgEntradaAuto_', 'A', '2026-11-25', []], ['cgSaidaAuto_', 'A', '2026-11-25'], ['migrarCheckoutsPorDeposito_'],
  ['cgMesclarSequencia_', [], '2026-11-25T08:00:00', 'x'], ['cgFaltas_', [], '2026-11-25T08:00:00', true]
];
const emailsAntesDosAtaques = m.emails.length;
bloqueadas.forEach(([fn, ...a]) => {
  const r = run(ATACANTE, fn, ...a);
  ok(!r.ok && /Acesso negado|not found/i.test(r.erro.message), fn + '(' + a.map((x) => JSON.stringify(x)).join(', ').slice(0, 50) + ') bloqueada' +
    (r.ok ? ' — DEVOLVEU ' + JSON.stringify(r.valor).slice(0, 60) : ''));
});
ok(m.emails.length === emailsAntesDosAtaques, 'nenhum e-mail saiu pelas chamadas diretas (marcar pessoa pelo console nao avisa ninguem)');

/*
 * VERSAO LOCAL: a implantacao em "Qualquer pessoa" deixa chegar quem nao tem conta Google
 * nenhuma — o Google entrega o e-mail vazio, como num gatilho. As mesmas chamadas, anonimas.
 */
console.log('\nAs mesmas chamadas sem conta Google (implantacao em "Qualquer pessoa", versao local):');
let anonimasPassaram = [];
bloqueadas.forEach(([fn, ...a]) => {
  const r = run('', fn, ...a);
  if (!(!r.ok && /Acesso negado|not found/i.test(r.erro.message))) anonimasPassaram.push(fn + (r.ok ? ' DEVOLVEU ' + JSON.stringify(r.valor).slice(0, 60) : ' ' + r.erro.message.slice(0, 60)));
});
ok(!anonimasPassaram.length, bloqueadas.length + ' chamadas anonimas bloqueadas' + (anonimasPassaram.length ? ' — PASSARAM: ' + anonimasPassaram.join(' | ') : ''));
ok(m.emails.length === emailsAntesDosAtaques, 'nenhum e-mail saiu pelas chamadas anonimas');
const gatilhoFalso = run('', 'atualizarCompetenciaAberta', { triggerUid: '12345', authMode: 'FULL' });
ok(!gatilhoFalso.ok && /Acesso negado/.test(gatilhoFalso.erro.message), 'evento de gatilho inventado (triggerUid que nao existe) nao passa');
['rotinaDiaria', 'aquecerCache', 'gerarMesSeNecessario'].forEach((fn) => {
  const r = run('', fn);
  ok(!r.ok && /Acesso negado/.test(r.erro.message), fn + ' anonimo (sem o evento do gatilho) bloqueado');
});
// rotinaMensal engole o erro do gerarMesSeNecessario (que e barrado la dentro): nada roda, nada volta
const rm = run('', 'rotinaMensal');
ok(rm.ok ? rm.valor === null && m.emails.length === emailsAntesDosAtaques : /Acesso negado/.test(rm.erro.message), 'rotinaMensal anonima nao faz nada');

console.log('\nPortas novas sem sessao (10/10):');
const ea = run(ATACANTE, 'executarAcaoETela', { t: 'f'.repeat(64), f: ctx.f }, 'excluirAcao', { id: 'x' }, 'acoes', {});
ok(!ea.ok && /\[SESSAO\]/.test(ea.erro.message), 'executarAcaoETela sem sessao: ' + (ea.ok ? 'DEVOLVEU ' + String(ea.valor).slice(0, 60) : ea.erro.message.slice(0, 50)));
const ms = run(ATACANTE, 'manterSessao', { t: 'f'.repeat(64), f: ctx.f });
ok(ms.ok && JSON.parse(ms.valor).ok === false && Object.keys(JSON.parse(ms.valor)).length === 1, 'manterSessao sem sessao so diz ok:false');
const sc = run(ATACANTE, 'sondarCanal');
ok(sc.ok && sc.valor === 'ok', 'sondarCanal so diz "ok"');

console.log('\nFoto HEIC pelo console (19/10):');
const noDrive = () => m.arquivos.size + m.pastas.size;
const antesHeic = noDrive();
const fotoHeic = { foto: { nome: 'a.heic', tipo: 'image/heic', dados: HEIC_MINI } };
const cd = run(ATACANTE, 'acaoConverterFoto', FALSO, fotoHeic);
ok(!cd.ok && /Acesso negado/.test(cd.erro.message) && noDrive() === antesHeic, 'acaoConverterFoto direto: recusado, nada criado no Drive' +
  (cd.ok ? ' — DEVOLVEU ' + JSON.stringify(cd.valor).slice(0, 60) : ''));
const cp = run(ATACANTE, 'executarAcao', { t: 'f'.repeat(64), f: ctx.f }, 'converterFoto', fotoHeic);
ok(!cp.ok && /\[SESSAO\]/.test(cp.erro.message) && noDrive() === antesHeic, 'converterFoto pela porta sem sessao: recusado, nada criado no Drive');

console.log('\nQuem deve continuar passando:');
// gatilho de verdade: o Google entrega o evento com o triggerUid de um gatilho instalado neste projeto
const gat = novaExecucao(m, PASTA, { contaGoogle: DONO }, { apagarComentarios: 'nenhum' }).ScriptApp
  .newTrigger('atualizarCompetenciaAberta').timeBased().everyHours(1).create();
const g = run('', 'atualizarCompetenciaAberta', { triggerUid: gat.getUniqueId(), authMode: 'FULL' });
ok(g.ok, 'gatilho (sem usuario, com o evento do gatilho instalado) roda atualizarCompetenciaAberta' + (g.ok ? '' : ': ' + g.erro.message));
const ga = run('', 'aquecerCache', { triggerUid: gat.getUniqueId() });
ok(ga.ok, 'gatilho roda aquecerCache' + (ga.ok ? '' : ': ' + ga.erro.message));
const d = run(DONO, 'prop', 'ID_BANCO');                                 // dono pelo editor
ok(d.ok && d.valor, 'dono pelo editor le propriedade');
const t = JSON.parse(run(ATACANTE, 'carregarTela', ctx, 'inicio', {}).valor);
ok(t && t.ok !== false, 'a tela, com sessao valida, continua abrindo');
// 25/11: no login basta o usuario — o dominio da Bartofil completa sozinho (e o e-mail inteiro continua valendo)
const soUsuario = JSON.parse(run(ATACANTE, 'entrar', 'Dono', '4321', '', '', '').valor);
ok(!!soUsuario.ok, 'entra digitando so o usuario (dono) e o PIN' + (soUsuario.ok ? '' : ': ' + soUsuario.erro));
const comArroba = JSON.parse(run(ATACANTE, 'entrar', 'dono@', '4321', '', '', '').valor);
ok(comArroba.ok, 'usuario terminado em @ tambem completa o dominio');
const errado = JSON.parse(run(ATACANTE, 'entrar', 'dono', '9999', '', '', '').valor);
ok(!errado.ok, 'PIN errado com so o usuario continua recusado');

// 25/11: teto de PINs errados por dia (o /exec da versao local fica aberto a "Qualquer pessoa")
let travou = '';
for (let i = 1; i <= 20; i++) {
  if (i % 5 === 1) m.cache.clear();                       // passa a janela de 10 min
  const r = JSON.parse(run(ATACANTE, 'entrar', DONO, String(1000 + i), '', '', '').valor);
  travou = r.erro || '';
}
m.cache.clear();
const certo = JSON.parse(run(ATACANTE, 'entrar', DONO, '4321', '', '', '').valor);
ok(!certo.ok && /travada até amanhã/.test(certo.erro), '20 PINs errados no dia: nem o PIN certo entra ate amanha (' + (certo.erro || 'entrou') + ')');
novaExecucao(m, PASTA, { contaGoogle: DONO }, { apagarComentarios: 'nenhum' }).zerarErrosPin_(DONO);
const depois = JSON.parse(run(ATACANTE, 'entrar', DONO, '4321', '', '', '').valor);
ok(depois.ok, 'zerar os erros (o administrador zerando o PIN) destrava');
console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo ok'));
process.exit(falhas ? 1 : 0);
