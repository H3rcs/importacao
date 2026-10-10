#!/usr/bin/env node
/*
 * DESEMPENHO E SESSAO (10/10) — servidor.
 *
 *   node testes/desempenho.js [pasta-do-GSL]
 *
 * Sessao duravel (o cache do Google pode perder itens antes do prazo),
 * geracao publicada so depois da gravacao, tabelas dos modulos no cache,
 * gravar e devolver a tela numa ida so, gravar pela reserva sem gravar duas
 * vezes, a tela do link de e-mail/F5 junto com a entrada e as portas novas
 * fechadas para quem chama pelo console.
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
const sessoesDuraveis = (m) => Object.keys(m.props.user).filter((k) => /^sessao_/.test(k));
const tirarDoCache = (m, re) => { for (const k of [...m.cache.keys()]) if (re.test(k)) m.cache.delete(k); };
/* POST do formulario (reserva) com um bilhete novo, como a pagina faria. */
function post(m, campos) {
  const pagina = ctx(m, '').doGet({ parameter: {} });
  const bilhete = JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(pagina.getContent())[1].replace(/\\u002f/g, '/').replace(/\\u003c/g, '<')).bilhete;
  const c = novaExecucao(m, PASTA, { contaGoogle: 'computador.cd@bartofil.com.br' }, OP);
  const saida = c.doPost({ parameter: Object.assign({ bilhete }, campos) });
  return JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(saida.getContent())[1].replace(/\\u002f/g, '/').replace(/\\u003c/g, '<'));
}
function caso(nome, fn) {
  try { fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + e.message); }
}

console.log('Desempenho e sessao em ' + PASTA + '\n');

/* ------------------------------------------------------------------ */
/* SESSAO DURAVEL                                                      */
/* ------------------------------------------------------------------ */

caso('sessao: o cache perdeu a sessao (despejo) e a pessoa continua; o diagnostico conta', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  afirmar(sessoesDuraveis(m).length === 1, 'a entrada guardou a copia duravel (so o resumo do codigo)');
  afirmar(!JSON.stringify(m.props.user).includes(s.t), 'o codigo da sessao nao fica nas propriedades');
  tirarDoCache(m, /^sess_/);
  afirmar(tela(m, s, 'acoes'), 'abriu a tela com a sessao salva pela loja');
  afirmar(Number(m.cache.get('diag_sessao_salva_pela_loja').v) === 1, 'contou uma sessao salva');
  afirmar([...m.cache.keys()].some((k) => k === 'sess_' + s.t), 'a sessao voltou para o cache');
});

caso('sessao: 1 h sem uso acaba (pela loja tambem) e apaga as duas copias; Sair apaga as duas', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  tirarDoCache(m, /^sess_/);
  const k = sessoesDuraveis(m)[0];
  const reg = JSON.parse(m.props.user[k]); reg.u = Date.now() - 61 * 60000; m.props.user[k] = JSON.stringify(reg);
  afirmar(/\[SESSAO\]/.test(erroDe(() => tela(m, s, 'acoes'))), 'sessao parada ha 61 min recusada');
  afirmar(!sessoesDuraveis(m).length, 'a copia duravel saiu');
  const s2 = entrar(m, GERENTE, '5555');
  chamar(m, GERENTE, 'sairDoSistema', { t: s2.t, f: s2.f });
  afirmar(!sessoesDuraveis(m).length && ![...m.cache.keys()].some((x) => x === 'sess_' + s2.t), 'Sair apagou o cache e a loja');
  afirmar(/\[SESSAO\]/.test(erroDe(() => tela(m, s2, 'acoes'))), 'depois de sair, nada abre');
});

caso('sessao: a loja fora do ar nao impede a entrada; a poda tira so as paradas', () => {
  const m = mundo();
  const original = m.props.user;
  // loja que recusa gravar: a entrada continua (so o cache)
  m.props.user = new Proxy({}, { set() { throw new Error('Properties fora do ar'); } });
  const s = entrar(m, GERENTE, '5555');
  afirmar(tela(m, s, 'acoes'), 'entrou e abriu com a loja recusando');
  m.props.user = original;
  const s1 = entrar(m, GERENTE, '5555'); entrar(m, COORD, '1234');
  const chaves = sessoesDuraveis(m);
  afirmar(chaves.length === 2, 'duas sessoes na loja: ' + chaves.length);
  const velha = chaves[0]; const reg = JSON.parse(m.props.user[velha]); reg.u = Date.now() - 80 * 60000; m.props.user[velha] = JSON.stringify(reg);
  ctx(m).podarSessoes_(true);
  afirmar(sessoesDuraveis(m).length === 1 && !m.props.user[velha], 'a poda tirou so a parada ha 80 min');
  afirmar(tela(m, s1, 'acoes') || true, 'quem esta em uso segue');
});

caso('sessao: manterSessao renova sem devolver dado; sem sessao diz ok:false', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const k = 'sess_' + s.t; const e = m.cache.get(k); const v = JSON.parse(e.v); v.t = Date.now() - 20 * 60000; e.v = JSON.stringify(v);
  const r = JSON.parse(chamar(m, GERENTE, 'manterSessao', { t: s.t, f: s.f }).valor);
  afirmar(r.ok === true && Object.keys(r).length === 1, 'renovou e so devolveu ok: ' + JSON.stringify(r));
  afirmar(Date.now() - JSON.parse(m.cache.get(k).v).t < 5000, 'o ultimo uso andou');
  const r2 = JSON.parse(chamar(m, 'estagiario@bartofil.com.br', 'manterSessao', { t: 'f'.repeat(64), f: s.f }).valor);
  afirmar(r2.ok === false, 'sem sessao: ok false');
});

/* ------------------------------------------------------------------ */
/* ENTRADA, F5 E LINK DE E-MAIL NUMA IDA SO                            */
/* ------------------------------------------------------------------ */

caso('entrada com a tela do link de e-mail ja vem com a tela montada; F5 (retomarSessao) volta na mesma tela', () => {
  const m = mundo(); entrar(m, GERENTE, '5555');
  const r = JSON.parse(chamar(m, GERENTE, 'entrar', GERENTE, '5555', '', '', '', 'acoes').valor);
  afirmar(r.ok && r.telaEmbutida && r.telaEmbutida.id === 'acoes' && r.telaEmbutida.resposta.dados, 'tela junto com a entrada');
  const f5 = JSON.parse(chamar(m, GERENTE, 'retomarSessao', { t: r.token, f: r.filial.codigo, tela: 'calendario', p: '' }).valor);
  afirmar(f5.entrada === 'APP' && f5.telaEmbutida && f5.telaEmbutida.id === 'calendario', 'F5 com a tela da aba');
  // tela que a pessoa nao abre: aviso e menu (nao erro)
  const c = entrar(m, COORD, '1234');
  const x = JSON.parse(chamar(m, COORD, 'retomarSessao', { t: c.t, f: c.f, tela: 'acessos' }).valor);
  afirmar(x.entrada === 'APP' && !x.telaEmbutida && x.avisoTela, 'coordenadora sem a tela: aviso — ' + JSON.stringify(x.avisoTela));
});

/* ------------------------------------------------------------------ */
/* RESERVA: GRAVAR PELA PAGINA                                         */
/* ------------------------------------------------------------------ */

caso('reserva: gravar pela pagina passa pela porta, devolve a tela atualizada e o mesmo POST nao grava duas vezes', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const id = acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] }).id;
  const idem = '11111111-2222-4333-8444-555555555555';
  const campos = { t: s.t, filial: s.f, tela: 'acoes', acao: 'comentarAcao', ap: JSON.stringify({ id: id, texto: 'Lâmpadas compradas' }), idem: idem, recado: 'Comentário registrado' };
  const p1 = post(m, campos);
  afirmar(p1.entrada === 'APP' && p1.viaPost && p1.resultadoAcao && p1.resultadoAcao.ok, 'gravou: ' + JSON.stringify(p1.resultadoAcao));
  afirmar(p1.telaEmbutida && p1.telaEmbutida.id === 'acoes', 'voltou com a tela');
  post(m, campos);                                                  // o mesmo POST de novo (clique repetido)
  const n = ctx(m).listar('COMENTARIOS').filter((c) => c.TEXTO === 'Lâmpadas compradas').length;
  afirmar(n === 1, 'um comentario so: ' + n);
  post(m, Object.assign({}, campos, { idem: '99999999-2222-4333-8444-555555555555' }));
  afirmar(ctx(m).listar('COMENTARIOS').filter((c) => c.TEXTO === 'Lâmpadas compradas').length === 2, 'outro clique (outro idem) grava de novo');
  // a porta continua valendo: coordenadora nao exclui acao; sessao invalida nao grava
  const c = entrar(m, COORD, '1234');
  const p3 = post(m, { t: c.t, filial: c.f, tela: 'acoes', acao: 'excluirAcao', ap: JSON.stringify({ id: id }), idem: '33333333-2222-4333-8444-555555555555' });
  afirmar(p3.resultadoAcao && p3.resultadoAcao.ok === false, 'a porta recusou: ' + JSON.stringify(p3.resultadoAcao));
  afirmar(ctx(m).obter('ACOES', id), 'a acao continua');
  const p4 = post(m, { t: 'f'.repeat(64), filial: s.f, acao: 'comentarAcao', ap: JSON.stringify({ id: id, texto: 'invasor' }), idem: '44444444-2222-4333-8444-555555555555' });
  afirmar(p4.entrada === 'ENTRAR' && !ctx(m).listar('COMENTARIOS').some((x) => x.TEXTO === 'invasor'), 'sem sessao nao grava');
});

caso('reserva: pagina recusada (bilhete usado) avisa que da para continuar; Sair pela reserva apaga a sessao duravel', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const c = novaExecucao(m, PASTA, { contaGoogle: 'computador.cd@bartofil.com.br' }, OP);
  const pg = c.doPost({ parameter: { bilhete: 'nao-existe', t: s.t, filial: s.f } });
  const carga = JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(pg.getContent())[1].replace(/\\u002f/g, '/'));
  afirmar(carga.entrada === 'ENTRAR' && carga.retomavel === true && !carga.token && !carga.telaEmbutida, 'recusada, sem dado, retomavel: ' + JSON.stringify(carga).slice(0, 200));
  post(m, { sair: s.t });
  afirmar(!sessoesDuraveis(m).length, 'sair pela reserva apagou a copia duravel');
});

/* ------------------------------------------------------------------ */
/* GRAVAR E DEVOLVER A TELA NUMA IDA SO                                */
/* ------------------------------------------------------------------ */

caso('executarAcaoETela: grava e devolve a tela ja com a gravacao; acao proibida da o mesmo erro da porta', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const id = acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] }).id;
  tela(m, s, 'acoes', { situacao: 'TODAS' });                         // tela no cache, antes do comentario
  const x = JSON.parse(chamar(m, GERENTE, 'executarAcaoETela', { t: s.t, f: s.f }, 'comentarAcao', { id: id, texto: 'Primeiro' }, 'acoes', { situacao: 'TODAS' }).valor);
  afirmar(x.r && x.r.ok !== false, 'gravou');
  const a = x.tela.dados.lista.find((y) => y.id === id);
  afirmar(a && a.comentarios.length === 1 && a.comentarios[0].texto === 'Primeiro', 'a tela que voltou ja tem o comentario');
  const c = entrar(m, COORD, '1234');
  const erro = chamar(m, COORD, 'executarAcaoETela', { t: c.t, f: c.f }, 'excluirAcao', { id: id }, 'acoes', {});
  afirmar(!erro.ok && /n[aã]o pode|permiss|acesso/i.test(erro.erro.message), 'proibida: ' + (erro.erro && erro.erro.message));
  afirmar(/\[SESSAO\]/.test(chamar(m, 'estagiario@bartofil.com.br', 'executarAcaoETela', { t: 'f'.repeat(64), f: s.f }, 'comentarAcao', { id: id, texto: 'x' }, 'acoes', {}).erro.message), 'sem sessao: [SESSAO]');
});

/* ------------------------------------------------------------------ */
/* CACHE: TABELAS DOS MODULOS E GERACAO DEPOIS DO FLUSH                */
/* ------------------------------------------------------------------ */

caso('cache: a tela do Plano de Acao depois de uma gravacao em OUTRA tabela nao rele ACOES da planilha', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
  tela(m, s, 'acoes');                                                // copia de ACOES no cache
  acao(m, entrar(m, DONO, '4321'), 'salvarItemEstoque', { nome: 'Mouse USB', saldoInicial: '3' });   // grava em outra tabela: a geracao das telas anda
  const antes = m.chamadasPlanilha;
  const d = tela(m, s, 'acoes');
  const leituras = m.chamadasPlanilha - antes;
  afirmar(d.lista.some((a) => a.acao === 'Iluminação do Flow'), 'a acao continua na tela');
  afirmar(leituras <= 2, 'tela remontada com as tabelas do cache: ' + leituras + ' chamadas a planilha');
  // gravou na propria ACOES: a copia e aposentada e a tela mostra
  acao(m, s, 'salvarAcao', { acao: 'Porta da doca', prazo: '2026-12-02', turno: 'A', responsaveisEmails: [GERENTE] });
  afirmar(tela(m, s, 'acoes').lista.some((a) => a.acao === 'Porta da doca'), 'a acao nova aparece');
});

caso('cache: dentro da trava a conferencia le a planilha (e nao a copia); a geracao so e publicada depois do flush', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
  tela(m, s, 'acoes');
  const c = ctx(m);
  const gAntes = m.props.script.GERACAO_DADOS;
  let viuDentro = null, publicadaDentro = null;
  c.comTrava(function () {
    const n0 = m.chamadasPlanilha;
    c.listar('ACOES');
    viuDentro = m.chamadasPlanilha - n0;
    c.inserir('SETORES', { SETOR: 'Doca nova', ATIVO: 'SIM' }, DONO);
    publicadaDentro = m.props.script.GERACAO_DADOS;
  });
  afirmar(viuDentro > 0, 'leu ACOES da planilha dentro da trava');
  afirmar(publicadaDentro === gAntes, 'a geracao nao saiu antes do fim da trava');
  afirmar(Number(m.props.script.GERACAO_DADOS) === Number(gAntes) + 1 && m.cache.get('geracao').v === m.props.script.GERACAO_DADOS, 'publicada uma vez, no fim');
});

/* ------------------------------------------------------------------ */
/* PORTAS NOVAS                                                        */
/* ------------------------------------------------------------------ */

caso('portas novas: sondarCanal nao le nada; aquecerCache nao monta tela de ninguem e deixa as tabelas prontas', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
  const n0 = m.chamadasPlanilha, k0 = m.cache.size;
  const r = chamar(m, 'estagiario@bartofil.com.br', 'sondarCanal');
  afirmar(r.ok && r.valor === 'ok' && m.chamadasPlanilha === n0 && m.cache.size === k0, 'sonda sem efeito');
  tirarDoCache(m, /^(t|tb)\|/);
  const c = ctx(m, '');                                            // gatilho: ninguem do outro lado
  // O aquecimento so roda das 5 h as 21 h: fora disso, o relogio vai para as 10 h de amanha (no futuro,
  // para o cache do emulador nao nascer vencido).
  const relogio = Date.now, h = new Date().getHours();
  if (h < 5 || h > 21) { const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(10, 0, 0, 0); Date.now = () => amanha.getTime(); }
  let x;
  try { x = c.aquecerCache(); } finally { Date.now = relogio; }
  afirmar(x.ok && x.tabelas > 5, 'aqueceu as tabelas: ' + JSON.stringify(x));
  afirmar(![...m.cache.keys()].some((k) => /^t\|/.test(k)), 'nenhuma tela montada');
  afirmar([...m.cache.keys()].some((k) => /^tb\|.*ACOES/.test(k)), 'copia de ACOES pronta');
  const n1 = m.chamadasPlanilha;
  tela(m, s, 'acoes');
  afirmar(m.chamadasPlanilha - n1 <= 2, 'a primeira tela do dia ja sai do cache: ' + (m.chamadasPlanilha - n1));
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
