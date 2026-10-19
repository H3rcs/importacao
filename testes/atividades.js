#!/usr/bin/env node
/*
 * TESTES DO CALENDARIO, ATIVIDADES, PLANO DE ACAO E AVISOS.
 *
 *   node testes/atividades.js [pasta-do-GSL]
 *
 * Roda o codigo de verdade no emulador (sem navegador), um caso por achado
 * da revisao da 4.2.2.
 */
'use strict';
process.env.TZ = 'America/Bahia';
const path = require('path');
const { Mundo, novaExecucao } = require('./emulador/gas.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const DONO = 'dono@bartofil.com.br';
const resultados = [];
function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }

function novoMundo() {
  const mundo = new Mundo({ dono: DONO });
  const c = novaExecucao(mundo, PASTA, { contaGoogle: DONO }, { apagarComentarios: 'nenhum' });
  c._porta = true;
  c.instalar(DONO);
  return mundo;
}
function ctx(m, conta) { const c = novaExecucao(m, PASTA, { contaGoogle: conta || DONO }, { apagarComentarios: 'nenhum' }); c._porta = true; return c; }
function admin(c, email) { return { email: email || DONO, perfil: 'ADMIN', turno: '', permissoes: c.permissoesDe('ADMIN'), chaveModulos: '' }; }
function caso(nome, fn) {
  try { fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + e.message); }
}

console.log('Atividades em ' + PASTA + '\n');

caso('rotina mensal do dia 31: cai no ultimo dia de setembro, nao em 1o de outubro', () => {
  const m = novoMundo();
  let c = ctx(m);
  c.acaoSalvarRotina(admin(c), { tipo: 'INV', atividade: 'Inventario mensal', frequencia: 'MENSAL', dia: '31', porTurno: false, ativo: true });
  c = ctx(m); c.gerarCompetencia('SET 2026', DONO);
  c = ctx(m); c.gerarCompetencia('OUT 2026', DONO);
  c = ctx(m);
  const inv = c.listar('ATIVIDADES').filter((a) => String(a.TIPO) === 'INV').map((a) => c.paraISO(c.paraData(a.PRAZO)));
  afirmar(inv.indexOf('2026-09-30') !== -1 && inv.indexOf('2026-10-31') !== -1 && inv.indexOf('2026-10-01') === -1,
    'datas: ' + inv.join(', '));
  let erro = '';
  try { c.acaoSalvarRotina(admin(c), { tipo: 'XYZ', atividade: 'x', frequencia: 'MENSAL', dia: '45', ativo: true }); } catch (e) { erro = e.message; }
  afirmar(/1 a 31/.test(erro), 'dia 45 recusado: ' + erro);
});

caso('remover o unico arquivo entregue: a atividade sai de "Aguardando validacao"', () => {
  const m = novoMundo();
  let c = ctx(m); c.gerarCompetencia('SET 2026', DONO);
  c = ctx(m);
  const a = c.listar('ATIVIDADES').filter((x) => x.PRAZO)[0];
  const arq = m.novoArquivo('entrega.pdf', 'application/pdf', Buffer.from('%PDF'));
  c.atualizar('ATIVIDADES', a.ID, { ANEXOS: arq.id, ENTREGUE_EM: c.agoraTexto(), STATUS: 'Aguard. valid.' }, DONO);
  c = ctx(m);
  c.acaoRemoverAnexoAtividade(admin(c), { id: a.ID, idArquivo: arq.id });
  c = ctx(m);
  const depois = c.obter('ATIVIDADES', a.ID);
  afirmar(!String(depois.ENTREGUE_EM) && String(depois.STATUS) !== 'Aguard. valid.', 'status ' + depois.STATUS + ' / entregue ' + depois.ENTREGUE_EM);
});

caso('"Entrega recebida" abre o ULTIMO arquivo (o corrigido), nao o reprovado', () => {
  const m = novoMundo(); const c = ctx(m);
  afirmar(/novo/.test(c.urlDeAnexo('https://drive/velho,https://drive/novo')), 'lista de links');
  afirmar(/ID2/.test(c.urlDeAnexo('ID1,ID2')), 'lista de ids');
});

caso('digesto: um endereco recusado nao deixa os outros turnos sem e-mail', () => {
  const m = novoMundo();
  let c = ctx(m);
  const adm = admin(c);
  c.acaoSalvarUsuario(adm, { email: 'coord.a.invalido@bartofil.com.br', nome: 'Coord A', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenador' });
  c = ctx(m); c.acaoSalvarUsuario(admin(c), { email: 'coord.b@bartofil.com.br', nome: 'Coord B', perfil: 'COORDENADOR', turno: 'B', filiais: '*', papel: 'Coordenador' });
  c = ctx(m); c.acaoSalvarUsuario(admin(c), { email: 'coord.c@bartofil.com.br', nome: 'Coord C', perfil: 'COORDENADOR', turno: 'C', filiais: '*', papel: 'Coordenador' });
  c = ctx(m); c.gerarCompetencia(c.competenciaDe(c.hoje()), DONO);   // o mes corrente (o digesto olha dele em diante)
  m.emails.length = 0;
  let erro = '';
  c = ctx(m);
  try { c.digestoMatinal(); } catch (e) { erro = e.message; }
  const para = m.emails.map((e) => e.to);
  afirmar(para.some((x) => /coord\.b/.test(x)) && para.some((x) => /coord\.c/.test(x)), 'B e C receberam: ' + para.join(' | '));
  afirmar(/turno A/.test(erro), 'a falha do turno A foi relatada: ' + erro);
});

caso('e-mail escapa o texto de quem usa ("<A3>" no motivo nao some)', () => {
  const m = novoMundo(); const c = ctx(m);
  afirmar(/&lt;A3&gt;/.test(c.caixa('Motivo:', 'Faltou o corredor <A3>', '#000', '#fff')), 'caixa');
  afirmar(/&lt;2m/.test(c.linha('Atividade', 'Paletes <2m')), 'linha');
});

caso('cache de tela: o Plano de Acao de uma pessoa nao e servido para outra', () => {
  const m = novoMundo(); const c = ctx(m);
  const a = admin(c, 'a@bartofil.com.br'), b = admin(c, 'b@bartofil.com.br');
  afirmar(c.chaveDeTela('acoes', a, {}) !== c.chaveDeTela('acoes', b, {}), 'acoes');
  afirmar(c.chaveDeTela('acessos', a, {}) !== c.chaveDeTela('acessos', b, {}), 'acessos');
  afirmar(c.chaveDeTela('calendario', a, {}) === c.chaveDeTela('calendario', b, {}), 'calendario continua compartilhado');
});

caso('Plano de Acao: o filtro "Geral (CD)" separa as acoes do turno Todos', () => {
  const m = novoMundo();
  let c = ctx(m);
  c.acaoSalvarAcao(admin(c), { acao: 'Arrumar doca', prazo: '2026-10-10', turno: 'Todos', responsavel: 'Fulano' });
  c = ctx(m); c.acaoSalvarAcao(admin(c), { acao: 'Treinar turno A', prazo: '2026-10-10', turno: 'A', responsavel: 'Ciclano' });
  c = ctx(m);
  const geral = c.dadosAcoes(admin(c), { turno: 'Todos', situacao: 'TODAS' });
  const todas = c.dadosAcoes(admin(c), { turno: '', situacao: 'TODAS' });
  afirmar(geral.lista.length === 1 && geral.lista[0].acao === 'Arrumar doca', 'Geral: ' + geral.lista.map((x) => x.acao).join(','));
  afirmar(todas.lista.length === 2, 'sem filtro: ' + todas.lista.length);
});

caso('Central: mes com todas as atividades datadas aprovadas mostra 100%', () => {
  const m = novoMundo();
  let c = ctx(m);
  const hoje = c.hoje();
  const comp = c.competenciaDe(hoje);
  c.gerarCompetencia(comp, DONO);
  // gera tambem os proximos meses (a geracao automatica do dia 20 faz isso)
  c = ctx(m); c.gerarCompetencia(c.competenciaDe(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)), DONO);
  c = ctx(m);
  const doMes = c.listar('ATIVIDADES').filter((a) => a.PRAZO && String(a.TIPO).toUpperCase() !== 'TRE' &&
    c.competenciaDe(c.paraData(a.PRAZO)) === comp);
  c.atualizarVarios('ATIVIDADES', doMes.map((a) => ({ id: a.ID, campos: { VALIDACAO: 'Aprovado', STATUS: 'Aprovada' } })), DONO);
  c = ctx(m);
  const d = c.dadosInicio(admin(c));
  afirmar(d.geral.total > 0 && d.geral.aprovadas === d.geral.total, 'geral: ' + d.geral.aprovadas + '/' + d.geral.total);
});

caso('atividade gravada em dobro por versao antiga: conferir, limpar, e as escritas acertam a copia viva', () => {
  const m = novoMundo();
  let c = ctx(m); c.gerarCompetencia('SET 2026', DONO);
  const aba = m.planilhas.get(m.props.script.ID_BANCO).abas.find((a) => a.nome === 'ATIVIDADES');
  const copia = aba.dados[2].slice(); aba.dados.splice(aba.ultimaLinha(), 0, copia);
  const id = copia[aba.dados[0].indexOf('ID')];
  m.cache.clear();
  c = ctx(m);
  const r1 = c.conferirAtividadesDuplicadas();
  afirmar(r1.grupos === 1 && r1.marcadas === 0, 'conferir so mostra: ' + JSON.stringify(r1).slice(0, 120));
  c = ctx(m);
  const r2 = c.limparAtividadesDuplicadas();
  afirmar(r2.marcadas === 1, 'limpar marca a copia: ' + r2.marcadas);
  c = ctx(m);
  afirmar(c.listar('ATIVIDADES').filter((a) => a.ID === id).length === 1, 'uma copia viva');
  c.atualizar('ATIVIDADES', id, { MOTIVO: 'teste' }, DONO);
  c = ctx(m);
  afirmar(String(c.obter('ATIVIDADES', id).MOTIVO) === 'teste', 'a escrita foi para a copia viva');
});

caso('vaga avulsa que nao e treinamento: o aviso e de atividade agendada, nao "Treinamento marcado"', () => {
  const m = novoMundo();
  let c = ctx(m);
  c.acaoSalvarUsuario(admin(c), { email: 'coord.a@bartofil.com.br', nome: 'Coord A', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenador' });
  c = ctx(m); c.acaoSalvarRotina(admin(c), { tipo: 'AUD', atividade: 'Auditoria surpresa', frequencia: 'AVULSA', quantidade: 1, porTurno: false, ativo: true });
  c = ctx(m); c.gerarCompetencia('SET 2026', DONO);
  c = ctx(m);
  const vaga = (tipo) => c.listar('ATIVIDADES').filter((a) => String(a.TIPO) === tipo && !a.PRAZO)[0];
  const aud = vaga('AUD'), tre = vaga('TRE');
  afirmar(aud && tre, 'vagas AUD e TRE geradas');
  m.emails.length = 0;
  c.acaoAgendarTreinamento(admin(c), { id: aud.ID, prazo: '2026-09-15', atividade: 'Auditoria surpresa', turno: 'Todos' });
  const assuntosAud = m.emails.map((e) => e.subject);
  afirmar(assuntosAud.length && assuntosAud.every((x) => /Atividade agendada/.test(x) && !/Treinamento/.test(x)), 'AUD: ' + assuntosAud.join(' | '));
  m.emails.length = 0;
  c = ctx(m); c.acaoAgendarTreinamento(admin(c), { id: tre.ID, prazo: '2026-09-16', atividade: 'Empilhadeira segura', turno: 'Todos' });
  afirmar(m.emails.some((e) => /Treinamento marcado/.test(e.subject)), 'TRE continua com o aviso de treinamento');
});

caso('remover o arquivo de uma entrega reprovada: continua Reprovada e com a data da entrega', () => {
  const m = novoMundo();
  let c = ctx(m); c.gerarCompetencia('SET 2026', DONO);
  c = ctx(m);
  const a = c.listar('ATIVIDADES').filter((x) => x.PRAZO)[0];
  const arq = m.novoArquivo('entrega.pdf', 'application/pdf', Buffer.from('%PDF'));
  const entregue = c.agoraTexto();
  c.atualizar('ATIVIDADES', a.ID, { ANEXOS: arq.id, ENTREGUE_EM: entregue, VALIDACAO: 'Reprovado', STATUS: 'Reprovada' }, DONO);
  c = ctx(m);
  c.acaoRemoverAnexoAtividade(admin(c), { id: a.ID, idArquivo: arq.id });
  c = ctx(m);
  const depois = c.obter('ATIVIDADES', a.ID);
  afirmar(String(depois.VALIDACAO) === 'Reprovado' && String(depois.ENTREGUE_EM) !== '', 'validacao ' + depois.VALIDACAO + ' / entregue ' + depois.ENTREGUE_EM);
});

caso('Central por mes: atividade sem data (vaga avulsa) nao entra na conta do mes', () => {
  const m = novoMundo(); const c = ctx(m);
  const lista = [{ prazoISO: '', tipo: 'AUD' }, { prazoISO: '2026-09-10', tipo: 'INV' }, { prazoISO: '2026-09-11', tipo: 'TRE' }];
  const r = c.paraOsMeses_(lista);
  afirmar(r.length === 1 && r[0].tipo === 'INV', 'ficou: ' + JSON.stringify(r));
});

/* ------------------------------------------------------------------ */
/* ROTINAS (19/10): mudar o dia, desativar e remover acertam os meses  */
/* ja gerados. Relogio parado numa segunda (19/10/2026), com OUT e NOV */
/* ja gerados — como em producao depois do dia 20 do mes anterior.     */
/* ------------------------------------------------------------------ */

const SEGUNDA = '2026-10-19T10:00:00-03:00';
function mundoComMeses(agora) {
  const m = new Mundo({ dono: DONO, agora: agora || SEGUNDA });
  let c = ctx(m); c.instalar(DONO);
  c = ctx(m); c.acaoSalvarUsuario(admin(c), { email: 'coord.a@bartofil.com.br', nome: 'Coord A', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenador' });
  ['OUT 2026', 'NOV 2026'].forEach((comp) => ctx(m).gerarCompetencia(comp, DONO));
  return m;
}
const RONDA = { tipo: 'RON', atividade: 'Ronda', frequencia: 'SEMANAL', dia: '3', porTurno: false, exigeSetor: false, ativo: true };
function idDaRotina(m, tipo) { const r = ctx(m).listar('ROTINAS').find((x) => String(x.TIPO) === tipo); return r ? r.ID : ''; }
/* Grava a rotina (a Ronda, por padrao) como a tela: a que ja existe com a sigla e editada. */
function salvarRotina(m, campos) {
  const c = ctx(m);
  return c.acaoSalvarRotina(admin(c), Object.assign({}, RONDA, { id: idDaRotina(m, (campos && campos.tipo) || 'RON') }, campos || {}));
}
function daRotina(m, tipo) {
  const c = ctx(m);
  return c.listar('ATIVIDADES').filter((a) => String(a.TIPO) === tipo).map((a) => {
    const h = c.hidratar(a);
    return { id: h.id, iso: h.prazoISO, dia: h.diaSemana, status: h.status, motivo: h.motivo, nome: h.atividade };
  }).sort((x, y) => (x.iso || 'z' + x.id).localeCompare(y.iso || 'z' + y.id));
}
const vivas = (m, tipo) => daRotina(m, tipo).filter((l) => l.status !== 'Cancelada');
const datas = (ls) => ls.map((l) => l.iso.slice(8) + '/' + l.iso.slice(5, 7)).join(' ');

caso('rotina nova com OUT e NOV ja gerados: nasce de hoje em diante nos dois meses, nenhuma no passado', () => {
  const m = mundoComMeses();
  const r = salvarRotina(m);
  const v = vivas(m, 'RON');
  afirmar(datas(v) === '21/10 28/10 04/11 11/11 18/11 25/11', 'datas: ' + datas(v));
  afirmar(v.every((l) => l.status === 'Pendente'), 'nenhuma nasce Atrasada: ' + v.map((l) => l.status).join(','));
  afirmar(r.recado === 'Rotina salva. No calendário: 2 criadas em OUT 2026 e 4 em NOV 2026 (de hoje em diante).', r.recado);
  afirmar(r.invalidarTudo === true, 'a tela esquece as copias (o calendario mudou)');
});

caso('quarta -> sexta: as pendentes de hoje em diante vao para a sexta (mesmo ID, com a nota); entregue, remarcada a mao, cancelada a mao e atrasada ficam', () => {
  const m = mundoComMeses(); salvarRotina(m);
  let c = ctx(m);
  c.inserir('ATIVIDADES', { ID: 'OUT26-S42-RON-T', COMPETENCIA: 'OUT 2026', SEMANA: 'S42', PRAZO: '2026-10-14', ATIVIDADE: 'Ronda', TIPO: 'RON', TURNO: 'Todos', STATUS: 'Atrasada' }, DONO);
  c = ctx(m); c.atualizar('ATIVIDADES', 'NOV26-S46-RON-T', { ENTREGUE_EM: c.agoraTexto(), ANEXOS: 'arq_x', STATUS: 'Aguard. valid.' }, DONO);
  c = ctx(m); c.acaoRemarcar(admin(c), { id: 'NOV26-S47-RON-T', prazo: '2026-11-19', motivo: 'feriado', avisar: false });
  c = ctx(m); c.acaoCancelarAtividade(admin(c), { id: 'NOV26-S48-RON-T', motivo: 'inventario' });
  const idsAntes = daRotina(m, 'RON').map((l) => l.id).sort().join();
  const r = salvarRotina(m, { dia: '5' });
  const t = daRotina(m, 'RON'), por = (id) => t.find((l) => l.id === id);
  afirmar(t.map((l) => l.id).sort().join() === idsAntes, 'os mesmos IDs, nada nasceu (nem a S40 em 02/10): ' + t.map((l) => l.id).join(','));
  afirmar(por('OUT26-S43-RON-T').iso === '2026-10-23' && por('OUT26-S44-RON-T').iso === '2026-10-30' && por('NOV26-S45-RON-T').iso === '2026-11-06', 'foram para a sexta');
  afirmar(por('OUT26-S43-RON-T').motivo === 'Remarcada de 21/10/2026 para 23/10/2026: a rotina mudou para toda sexta.', 'nota: ' + por('OUT26-S43-RON-T').motivo);
  afirmar(por('OUT26-S42-RON-T').iso === '2026-10-14' && por('OUT26-S42-RON-T').status === 'Atrasada', 'a atrasada (passado) ficou');
  afirmar(por('NOV26-S46-RON-T').iso === '2026-11-11', 'a entregue ficou na quarta');
  afirmar(por('NOV26-S47-RON-T').iso === '2026-11-19', 'a remarcada a mao ficou na quinta 19/11');
  afirmar(por('NOV26-S48-RON-T').status === 'Cancelada' && /inventario/.test(por('NOV26-S48-RON-T').motivo), 'a cancelada a mao continua cancelada');
  afirmar(r.recado === 'Rotina salva. No calendário: 3 mudaram para sexta. Ficaram como estavam: 1 entregue, 1 remarcada à mão.', r.recado);
});

caso('dia trocado pela versao anterior (as atividades ficaram no dia antigo, sem nota): salvar de novo leva para o dia da rotina', () => {
  const m = mundoComMeses(); salvarRotina(m);
  const c = ctx(m); c.atualizar('ROTINAS', idDaRotina(m, 'RON'), { DIA: '5' }, DONO);    // so a linha da rotina mudava
  const r = salvarRotina(m, { dia: '5' });
  afirmar(r.calendario.movidas === 6 && vivas(m, 'RON').every((l) => l.dia === 'sex'), 'sexta: ' + datas(vivas(m, 'RON')));
});

caso('semana que atravessa o mes (sexta 30/10 -> domingo 01/11): a de OUT sai (cancelada pela rotina) e nasce NOV26-S44', () => {
  const m = mundoComMeses(); salvarRotina(m, { dia: '5' });
  const r = salvarRotina(m, { dia: '7' });
  const t = daRotina(m, 'RON');
  const out44 = t.find((l) => l.id === 'OUT26-S44-RON-T');
  afirmar(out44.status === 'Cancelada' && out44.motivo === 'Cancelada pela rotina (rotina mudou para todo domingo em 19/10/2026).', JSON.stringify(out44));
  afirmar(t.some((l) => l.id === 'NOV26-S44-RON-T' && l.iso === '2026-11-01'), 'NOV26-S44 em 01/11');
  afirmar(vivas(m, 'RON').every((l) => l.dia === 'dom'), 'vivas no domingo: ' + datas(vivas(m, 'RON')));
  afirmar(r.recado === 'Rotina salva. No calendário: 5 mudaram para domingo · 1 cancelada · 1 criada.', r.recado);
});

caso('desativar pela lista: a Configuracao contava as pendentes, o calendario fica sem a rotina e o Arquivo com elas; ativar traz de volta', () => {
  const m = mundoComMeses(); salvarRotina(m);
  let c = ctx(m);
  const ron = c.dadosConfig(admin(c)).rotinas.find((x) => x.tipo === 'RON');
  afirmar(JSON.stringify(ron.pendentes) === '{"total":6,"porMes":{"OUT 2026":2,"NOV 2026":4}}' && ron.temAtividades, JSON.stringify(ron));
  c = ctx(m);
  const r1 = c.acaoAlternarRotina(admin(c), { id: ron.id, ativo: false });
  afirmar(r1.calendario.canceladas === ron.pendentes.total, 'a contagem da tela bateu: ' + r1.calendario.canceladas);
  afirmar(r1.recado === 'Rotina desativada. 6 atividades pendentes canceladas (OUT 2026: 2 · NOV 2026: 4).', r1.recado);
  afirmar(String(ctx(m).obter('ROTINAS', ron.id).ATIVO) === 'NAO', 'rotina parada');
  c = ctx(m);
  const d = c.dadosCalendario(admin(c), { competencia: 'OUT 2026' });
  afirmar(!d.atividades.some((a) => a.tipo === 'RON'), 'OUT sem a rotina');
  const arquivo = d.canceladas.filter((a) => a.tipo === 'RON').map((a) => a.motivo);
  afirmar(arquivo.length === 2 && arquivo.every((x) => x === 'Cancelada pela rotina (rotina desativada em 19/10/2026).'), 'Arquivo: ' + arquivo.join(' | '));
  c = ctx(m);
  afirmar(c.dadosConfig(admin(c)).rotinas.find((x) => x.tipo === 'RON').pendentes.total === 0, 'nada pendente depois de desativar');
  c = ctx(m);
  const r2 = c.acaoAlternarRotina(admin(c), { id: ron.id, ativo: true });
  afirmar(r2.recado === 'Rotina ativada. 6 atividades de volta ao calendário.', r2.recado);
  const v = vivas(m, 'RON');
  afirmar(datas(v) === '21/10 28/10 04/11 11/11 18/11 25/11' && v.every((l) => !l.motivo), 'de volta, sem a marca: ' + datas(v));
});

caso('remover e recriar a mesma sigla: as canceladas pela rotina voltam no dia novo (sem ID repetido na tabela)', () => {
  const m = mundoComMeses(); salvarRotina(m);
  const c = ctx(m);
  const r1 = c.acaoExcluirRotina(admin(c), { id: idDaRotina(m, 'RON') });
  afirmar(r1.recado === 'Rotina removida. 6 atividades pendentes canceladas.' && !vivas(m, 'RON').length, r1.recado);
  const r2 = salvarRotina(m, { atividade: 'Ronda noturna', dia: '2' });
  const ids = ctx(m).listar('ATIVIDADES', true).map((a) => String(a.ID));
  afirmar(ids.length === new Set(ids).size, 'sem ID repetido');
  const v = vivas(m, 'RON');
  afirmar(r2.calendario.reativadas === 6 && v.length === 6 && v.every((l) => l.dia === 'ter' && l.nome === 'Ronda noturna'), datas(v));
});

caso('"uma por turno" liga e desliga; avulsa 5 -> 3 cancela as vagas sem data e deixa a ja agendada', () => {
  const m = mundoComMeses(); salvarRotina(m);
  const r1 = salvarRotina(m, { porTurno: true });
  afirmar(r1.calendario.canceladas === 6 && r1.calendario.criadas === 18 && vivas(m, 'RON').every((l) => /-(A|B|C)$/.test(l.id)), JSON.stringify(r1.calendario));
  const r2 = salvarRotina(m, { porTurno: false });
  afirmar(r2.calendario.reativadas === 6 && r2.calendario.canceladas === 18 && vivas(m, 'RON').every((l) => /-T$/.test(l.id)), JSON.stringify(r2.calendario));
  let c = ctx(m); c.acaoAgendarTreinamento(admin(c), { id: 'NOV26-S00-TRE-T-5', prazo: '2026-11-10', turno: 'A' });
  const tre = ctx(m).listar('ROTINAS').find((x) => String(x.TIPO) === 'TRE');
  c = ctx(m);
  const r3 = c.acaoSalvarRotina(admin(c), { id: tre.ID, tipo: 'TRE', atividade: tre.ATIVIDADE, frequencia: 'AVULSA', quantidade: 3, porTurno: false, ativo: true });
  const t = daRotina(m, 'TRE'), st = (id) => (t.find((l) => l.id === id) || {}).status;
  afirmar(['OUT26-S00-TRE-T-4', 'OUT26-S00-TRE-T-5', 'NOV26-S00-TRE-T-4'].every((id) => st(id) === 'Cancelada'), 'vagas 4 e 5 sem data canceladas');
  afirmar(st('NOV26-S00-TRE-T-5') === 'Pendente' && st('NOV26-S00-TRE-T-3') === 'Nao agendado', 'a agendada ficou');
  afirmar(r3.recado === 'Rotina salva. No calendário: 3 canceladas. Ficaram como estavam: 1 vaga já agendada.', r3.recado);
});

caso('"Gerar mes" num mes ja gerado so completa de hoje em diante (antes nasciam 07/10 e 14/10 Atrasadas); mes novo nasce inteiro', () => {
  const m = mundoComMeses();
  const r = salvarRotina(m, { ajustarCalendario: false });
  afirmar(r.recado === 'Rotina salva. As atividades já geradas não mudaram; vale a partir de DEZ 2026.' && !vivas(m, 'RON').length, r.recado);
  let c = ctx(m);
  const g = c.acaoGerarMes(admin(c), { competencia: 'OUT 2026' });
  afirmar(datas(vivas(m, 'RON')) === '21/10 28/10', 'so de hoje em diante: ' + datas(vivas(m, 'RON')));
  afirmar(g.recado === 'OUT 2026: 2 atividade(s) criada(s) — só de hoje em diante: o mês já estava gerado.', g.recado);
  c = ctx(m); c.gerarCompetencia('DEZ 2026', DONO);
  afirmar(vivas(m, 'RON').filter((l) => /^2026-12/.test(l.iso)).length === 5, 'DEZ inteiro (5 quartas)');
});

caso('validacao: sabado e domingo geram; frequencia, dia, vagas e sigla erradas sao recusadas; a sigla trava depois de gerar; mensal minusculo e normalizado', () => {
  const m = mundoComMeses();
  const erro = (campos) => { try { salvarRotina(m, campos); return ''; } catch (e) { return e.message; } };
  afirmar(erro({ tipo: 'SAB', dia: '6' }) === '' && erro({ tipo: 'DOM', dia: ' 7 ' }) === '', 'sabado e domingo aceitos');
  afirmar(datas(vivas(m, 'SAB')) === '24/10 31/10 07/11 14/11 21/11 28/11' && vivas(m, 'DOM').every((l) => l.dia === 'dom'), 'sabados: ' + datas(vivas(m, 'SAB')));
  afirmar(String(ctx(m).listar('ROTINAS').find((x) => String(x.TIPO) === 'DOM').DIA) === '7', 'dia gravado aparado');
  afirmar(erro({ tipo: 'QZN', frequencia: 'QUINZENAL' }) === 'Escolha como a rotina se repete: toda semana, todo mês ou vagas sem data.', 'QUINZENAL');
  afirmar(erro({ tipo: 'XYZ', dia: 'quarta' }) === 'Escolha o dia da semana.', 'dia por extenso');
  afirmar(erro({ tipo: 'XYZ', frequencia: 'MENSAL', dia: '32' }) === 'Rotina mensal: escolha 1ª segunda, última sexta ou um dia de 1 a 31.', 'dia 32');
  afirmar(/1 a 10 vagas/.test(erro({ tipo: 'VAG', frequencia: 'AVULSA', quantidade: 0 })) && /1 a 10 vagas/.test(erro({ tipo: 'VAG', frequencia: 'AVULSA', quantidade: 500 })), 'vagas 0 e 500');
  afirmar(erro({ tipo: 'AV' }) === 'A sigla AV é das atividades avulsas criadas no calendário. Use outra.', 'sigla AV');
  afirmar(/2 ou 3 letras/.test(erro({ tipo: 'A' })) && /2 ou 3 letras/.test(erro({ tipo: 'ABCD' })), 'sigla de 1 e de 4 letras');
  salvarRotina(m);                                                                // a Ronda gera atividades
  afirmar(erro({ id: idDaRotina(m, 'RON'), tipo: 'RND' }) === 'A sigla não muda depois que a rotina gerou atividades — ela está no código delas. Crie uma rotina nova e desative esta.', 'sigla travada');
  salvarRotina(m, { tipo: 'PAR', ativo: false });                                 // parada: nao gerou nada
  afirmar(erro({ id: idDaRotina(m, 'PAR'), tipo: 'PRD', ativo: false }) === '' && idDaRotina(m, 'PRD'), 'sem atividade, a sigla muda');
  salvarRotina(m, { tipo: 'PMS', frequencia: 'MENSAL', dia: ' primeira_segunda ' });
  salvarRotina(m, { tipo: 'D07', frequencia: 'MENSAL', dia: '07' });
  const dia = (tipo) => String(ctx(m).listar('ROTINAS').find((x) => String(x.TIPO) === tipo).DIA);
  afirmar(dia('PMS') === 'PRIMEIRA_SEGUNDA' && dia('D07') === '7', 'mensal normalizado: ' + dia('PMS') + ' / ' + dia('D07'));
  // Dia escrito a mao na planilha: nao gera nada (antes virava quarta em silencio) e a Configuracao aponta.
  let c = ctx(m); c.atualizar('ROTINAS', idDaRotina(m, 'RON'), { DIA: 'quarta' }, DONO);
  c = ctx(m);
  afirmar(c.datasDaRotina(c.obter('ROTINAS', idDaRotina(m, 'RON')), 2026, 11).length === 0, 'dia invalido nao gera');
  afirmar(c.dadosConfig(admin(c)).rotinas.find((x) => x.tipo === 'RON').problema === 'Escolha o dia da semana.', 'a Configuracao aponta o problema');
});

caso('(hoje = quinta 22/10) sexta -> segunda: a desta semana fica na sexta (a segunda ja passou); as outras vao; S49 nasce em 30/11', () => {
  const m = mundoComMeses('2026-10-22T10:00:00-03:00');
  salvarRotina(m, { dia: '5' });
  const r = salvarRotina(m, { dia: '1' });
  const v = vivas(m, 'RON'), em = (id) => (v.find((l) => l.id === id) || {}).iso;
  afirmar(em('OUT26-S43-RON-T') === '2026-10-23' && em('OUT26-S44-RON-T') === '2026-10-26' && em('NOV26-S49-RON-T') === '2026-11-30', datas(v));
  afirmar(r.recado === 'Rotina salva. No calendário: 5 mudaram para segunda · 1 criada. Ficaram como estavam: 1 desta semana (o dia novo já passou).', r.recado);
});

caso('"Exige setor": tiposComSetor do calendario segue as rotinas; o aviso do setor de outra rotina nao fala de vistoria', () => {
  const m = mundoComMeses();
  const tipos = () => { const c = ctx(m); return c.dadosCalendario(admin(c), { competencia: 'OUT 2026' }).tiposComSetor.join(','); };
  afirmar(tipos() === 'VIS', 'so a Vistoria: ' + tipos());
  const r = salvarRotina(m, { exigeSetor: true });
  afirmar(r.invalidarTudo, 'o calendario muda');
  const vis = ctx(m).listar('ROTINAS').find((x) => String(x.TIPO) === 'VIS');
  let c = ctx(m);
  const rv = c.acaoSalvarRotina(admin(c), { id: vis.ID, tipo: 'VIS', atividade: vis.ATIVIDADE, frequencia: 'SEMANAL', dia: '3', porTurno: true, exigeSetor: false, ativo: true });
  afirmar(rv.invalidarTudo && rv.recado === 'Rotina salva.', 'so a marca mudou: ' + rv.recado);
  afirmar(tipos() === 'RON', 'a Ronda com a marca, a Vistoria sem: ' + tipos());
  m.emails.length = 0;
  c = ctx(m); c.acaoDefinirSetor(admin(c), { id: 'OUT26-S43-RON-T', setor: 'Recebimento' });
  const assuntos = m.emails.map((e) => e.subject);
  afirmar(assuntos.length && assuntos.every((x) => x === 'Setor definido — Ronda (S43): Recebimento'), 'aviso: ' + assuntos.join(' | '));
});

caso('NOV gerado por versao antiga (ID sem ano NOV-S46-RON-T): mudar o dia move a linha antiga e nao nasce NOV26-S46 em dobro', () => {
  const m = new Mundo({ dono: DONO, agora: SEGUNDA });
  let c = ctx(m); c.instalar(DONO);
  ctx(m).gerarCompetencia('OUT 2026', DONO);
  salvarRotina(m, { ajustarCalendario: false });
  c = ctx(m); c.inserir('ATIVIDADES', { ID: 'NOV-S46-RON-T', COMPETENCIA: 'NOV 2026', SEMANA: 'S46', PRAZO: '2026-11-11', ATIVIDADE: 'Ronda', TIPO: 'RON', TURNO: 'Todos', STATUS: 'Pendente' }, DONO);
  ctx(m).gerarCompetencia('NOV 2026', DONO);
  salvarRotina(m, { dia: '5' });
  const lista = daRotina(m, 'RON').map((l) => l.id + '=' + l.iso);
  afirmar(lista.indexOf('NOV-S46-RON-T=2026-11-13') !== -1 && !lista.some((x) => /^NOV26-S46/.test(x)), lista.join(' '));
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
