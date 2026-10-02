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

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
