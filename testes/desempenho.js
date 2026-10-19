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
  const diag = novaExecucao(m, PASTA, { contaGoogle: GERENTE }, OP).doGet({ parameter: { diagnostico: '1' } }).getContent();
  afirmar(/a cópia salvou \(últimas 6 h\)<\/td><td[^>]*>1</.test(diag) && /Sessões guardadas agora<\/td><td[^>]*>1</.test(diag),
    'o ?diagnostico=1 mostra as contas: ' + diag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
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
  // O aquecimento so roda das 5 h as 21 h: a hora que ele le (formatDate 'H') vira 10 h, a qualquer hora do teste.
  const formatar = c.Utilities.formatDate;
  c.Utilities.formatDate = function (d, fuso, formato) { return formato === 'H' ? '10' : formatar.apply(this, arguments); };
  let x;
  try { x = c.aquecerCache(); } finally { c.Utilities.formatDate = formatar; }
  afirmar(x.ok && x.tabelas > 5, 'aqueceu as tabelas: ' + JSON.stringify(x));
  afirmar(![...m.cache.keys()].some((k) => /^t\|/.test(k)), 'nenhuma tela montada');
  afirmar([...m.cache.keys()].some((k) => /^tb\|.*ACOES/.test(k)), 'copia de ACOES pronta');
  const n1 = m.chamadasPlanilha;
  tela(m, s, 'acoes');
  afirmar(m.chamadasPlanilha - n1 <= 2, 'a primeira tela do dia ja sai do cache: ' + (m.chamadasPlanilha - n1));
});

/* ------------------------------------------------------------------ */
/* REVISAO DO 10/10: SESSAO, GERACOES, RESERVA, BOLINHA, COLAGEM       */
/* ------------------------------------------------------------------ */

const abaDoBanco = (m, nome) => m.planilhas.get(ctx(m).prop('ID_BANCO')).abas.find((a) => a.nome === nome);

caso('sessao: um pedido que leu a sessao antes do Sair nao a traz de volta (marca de saida)', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  // ultimo uso ha 6 min e loja gravada ha 11: o proximo pedido regravaria as duas copias
  const k = 'sess_' + s.t; const e = m.cache.get(k); const v = JSON.parse(e.v);
  v.t = Date.now() - 6 * 60000; v.d = Date.now() - 11 * 60000; e.v = JSON.stringify(v);
  const r = ctx(m, GERENTE);
  r.preLerCache_(s.t);                                              // R leu a sessao...
  chamar(m, GERENTE, 'sairDoSistema', { t: s.t, f: s.f });          // ...a pessoa saiu...
  afirmar(r.emailDaSessao_(s.t) === '', 'R confere a marca antes de regravar');
  afirmar(!m.cache.get(k) && !sessoesDuraveis(m).length, 'nada voltou: cache ' + !!m.cache.get(k) + ', loja ' + sessoesDuraveis(m).length);
  afirmar(/\[SESSAO\]/.test(erroDe(() => tela(m, s, 'acoes'))), 'a sessao continua encerrada');
});

caso('sessao: a loja que nao respondeu nao derruba a pessoa (erro passageiro, sem [SESSAO])', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  tirarDoCache(m, /^sess_/);                                        // o cache perdeu a sessao...
  const original = m.props.user;
  let tentativas = 0;
  m.props.user = new Proxy(original, { get(o, k) {                 // ...e a loja falhou nas duas tentativas
    if (typeof k === 'string' && /^sessao_/.test(k)) { tentativas++; throw new Error('Service invoked too many times: properties'); }
    return o[k];
  } });
  const r = chamar(m, GERENTE, 'carregarTela', { t: s.t, f: s.f }, 'acoes', {});
  m.props.user = original;
  const msg = r.ok ? String(JSON.parse(r.valor).erro || '') : r.erro.message;
  afirmar(!/\[SESSAO\]/.test(msg) && /conferir a sua sess/i.test(msg), 'erro passageiro: ' + msg);
  afirmar(tentativas === 2, 'tentou duas vezes: ' + tentativas);
  afirmar(tela(m, s, 'acoes'), 'a loja voltou: a mesma sessao abre a tela');
});

caso('sessao: a poda sai da entrada (vai para o aquecimento); sem o gatilho, uma entrada a cada 2 h poda no maximo 30', () => {
  const m = mundo();
  const agora = Date.now(), velho = JSON.stringify({ e: 'x@bartofil.com.br', c: agora - 3 * 3600000, u: agora - 3 * 3600000 });
  for (let i = 0; i < 40; i++) m.props.user['sessao_velha' + i] = velho;
  m.props.script.PODA_SESSOES_EM = String(agora);                   // o aquecimento podou ha pouco
  entrar(m, GERENTE, '5555');
  afirmar(sessoesDuraveis(m).length === 41, 'a entrada nao podou: ' + sessoesDuraveis(m).length);
  m.props.script.PODA_SESSOES_EM = String(agora - 3 * 3600000);     // gatilho parado ha 3 h
  entrar(m, COORD, '1234');
  afirmar(sessoesDuraveis(m).length === 12, 'a entrada podou so 30: ' + sessoesDuraveis(m).length);
  ctx(m, '').aquecerCache();                                        // o gatilho (a qualquer hora) poda o resto
  afirmar(sessoesDuraveis(m).length === 2, 'o aquecimento podou o resto: ' + sessoesDuraveis(m).length);
});

caso('geracoes: quem publica depois nao repete o numero de quem publicou no meio ("Atualizar dados" durante uma gravacao)', () => {
  const m = mundo(); const s = entrar(m, DONO, '4321');
  acao(m, s, 'salvarItemEstoque', { nome: 'Mouse USB', saldoInicial: '3' });
  const k = Object.keys(m.props.script).find((x) => /^GER_TB_.*EST_ITENS$/.test(x));
  const base = Number(m.props.script[k]);
  const c = ctx(m);
  c.comTrava(function () {
    c.inserir('EST_ITENS', { NOME: 'Teclado' }, DONO);               // pendente: base + 1
    ctx(m).limparCache();                                           // outra execucao, fora da trava: publica base + 1
  });
  afirmar(Number(m.props.script[k]) === base + 2, 'a gravacao saiu como base + 2: ' + m.props.script[k] + ' (base ' + base + ')');
});

caso('geracoes: o "geracao" que faltava no cache nao volta para tras (a pre-leitura e do comeco do pedido)', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const dono = entrar(m, DONO, '4321');
  for (const apagarDeNovo of [false, true]) {
    m.cache.delete('geracao');
    const r = ctx(m, GERENTE);
    r.preLerCache_(s.t);                                            // o pedido comecou sem 'geracao'...
    r.prop('GERACAO_DADOS');                                        // ...e com a foto das propriedades
    acao(m, dono, 'salvarItemEstoque', { nome: 'Item ' + apagarDeNovo, saldoInicial: '1' });   // outra execucao publica
    const g1 = m.props.script.GERACAO_DADOS;
    if (apagarDeNovo) m.cache.delete('geracao');                    // e o cache perdeu de novo
    afirmar(r.geracaoDados() === g1 && m.cache.get('geracao').v === g1,
      (apagarDeNovo ? 'sem cache' : 'com cache') + ': leu ' + r.geracaoDados() + ', cache ' + m.cache.get('geracao').v + ', publicado ' + g1);
  }
});

caso('geracoes: a publicacao que falha tenta de novo; falhou duas vezes, a copia derivada ja saiu e nada fica com o numero perdido', () => {
  const m = mundo(); entrar(m, DONO, '4321');
  const original = m.props.script;
  for (const falhas of [1, 2]) {
    ctx(m).carregarPerfis();                                        // copia 'perfis' no cache
    afirmar([...m.cache.keys()].some((k) => /perfis$/.test(k)), 'copia perfis no cache');
    const g0 = Number(original.GERACAO_DADOS);
    let falta = falhas;
    m.props.script = new Proxy(original, { set(o, k, v) {
      if (/^GER/.test(String(k)) && falta > 0) { falta--; throw new Error('Properties fora do ar'); }
      o[k] = v; return true;
    } });
    const c = ctx(m);
    try { c.comTrava(function () { c.limparCache('PERFIS'); }); } finally { m.props.script = original; }
    afirmar(![...m.cache.keys()].some((k) => /perfis$/.test(k)), falhas + ' falha(s): a copia perfis saiu');
    if (falhas === 1) afirmar(Number(original.GERACAO_DADOS) === g0 + 1, 'segunda tentativa publicou: ' + original.GERACAO_DADOS);
    else afirmar(Number(original.GERACAO_DADOS) === g0 && c._geracao === null, 'nao publicou e esqueceu o numero: ' + original.GERACAO_DADOS + ' / ' + c._geracao);
  }
});

caso('geracoes: execucao com mais de 1 min publica cada gravacao na hora (o limite de 6 min nao esconde o que ja foi gravado)', () => {
  const m = mundo(); entrar(m, DONO, '4321');
  const c = ctx(m);
  c._inicioDaExecucao = Date.now() - 61000;
  const g0 = Number(m.props.script.GERACAO_DADOS);
  let noMeio = null;
  c.comTrava(function () {
    c.inserir('SETORES', { SETOR: 'Doca nova', ATIVO: 'SIM' }, DONO);
    noMeio = Number(m.props.script.GERACAO_DADOS);
    c.inserir('SETORES', { SETOR: 'Doca 2', ATIVO: 'SIM' }, DONO);
  });
  afirmar(noMeio === g0 + 1 && Number(m.props.script.GERACAO_DADOS) === g0 + 2, 'publicou a cada gravacao: ' + [g0, noMeio, m.props.script.GERACAO_DADOS]);
  // dentro da trava, COLABORADORES vem da planilha (a importacao confere "quem ja existe")
  ctx(m).listar('COLABORADORES');
  const c2 = ctx(m); let leu = 0;
  c2.comTrava(function () { const n0 = m.chamadasPlanilha; c2.listar('COLABORADORES'); leu = m.chamadasPlanilha - n0; });
  afirmar(leu > 0, 'COLABORADORES lido da planilha dentro da trava');
});

caso('Atualizar dados: a varrida le a planilha de agora (prazo mudado a mao acerta o mes no primeiro clique)', () => {
  const m = mundo(); const d = entrar(m, DONO, '4321'); const c = ctx(m);
  const id = c.inserir('ATIVIDADES', { COMPETENCIA: 'SET 2026', SEMANA: 'S39', PRAZO: '2026-09-25', ATIVIDADE: 'Inventario', TIPO: 'INV', TURNO: 'A', STATUS: 'Pendente' }, DONO);
  tela(m, d, 'calendario');                                         // copia de ATIVIDADES no cache
  const a = abaDoBanco(m, 'ATIVIDADES'); const cab = a.dados[0].map((x) => String(x).toUpperCase());
  const l = a.dados.findIndex((r, i) => i > 0 && r && String(r[cab.indexOf('ID')]) === id);
  a.dados[l][cab.indexOf('PRAZO')] = '2026-10-05';                  // a mao, direto na planilha
  acao(m, d, 'atualizarDados', {});
  afirmar(/^OUT/.test(String(a.dados[l][cab.indexOf('COMPETENCIA')])), 'mes acertado no primeiro clique: ' + a.dados[l][cab.indexOf('COMPETENCIA')]);
});

caso('reserva: o aviso parcial da acao chega pela pagina; o mesmo clique reenviado durante a gravacao e um aviso neutro', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  const c = ctx(m);
  // atualizarRH devolve os meses que falharam em 'aviso': uma acao de teste no lugar dela
  const id = acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] }).id;
  const idem = '55555555-2222-4333-8444-555555555555';
  m.cache.set('feito_' + idem, { v: JSON.stringify({ ok: true, pendente: true, recado: 'A gravação ainda está sendo feita. Confira a tela em instantes.' }), expira: Date.now() + 120000 });
  const p = post(m, { t: s.t, filial: s.f, tela: 'acoes', acao: 'comentarAcao', ap: JSON.stringify({ id: id, texto: 'x' }), idem: idem });
  afirmar(p.resultadoAcao && p.resultadoAcao.ok !== false && p.resultadoAcao.pendente, 'neutro: ' + JSON.stringify(p.resultadoAcao));
  afirmar(!c.listar('COMENTARIOS').some((x) => x.TEXTO === 'x'), 'nao gravou de novo');
  const fonte = require('fs').readFileSync(path.join(PASTA, 'Codigo.gs'), 'utf8');
  afirmar(/aviso: String\(r\.aviso \|\| ''\)/.test(fonte), 'acaoPelaPagina_ leva o aviso da acao');
});

caso('bolinha: gravar em outra tabela nao reconta as acoes; a conta vale 10 min', () => {
  const m = mundo(); const s = entrar(m, GERENTE, '5555');
  acao(m, s, 'salvarAcao', { acao: 'Iluminação do Flow', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] });
  acao(m, s, 'pendencias');
  const k = [...m.cache.keys()].find((x) => /^pend\|/.test(x));
  const antes = m.cache.get(k);
  afirmar(antes && antes.expira - Date.now() <= 600 * 1000 + 5, 'vale 10 min: ' + (antes && Math.round((antes.expira - Date.now()) / 1000)) + ' s');
  acao(m, entrar(m, DONO, '4321'), 'salvarItemEstoque', { nome: 'Mouse USB', saldoInicial: '3' });   // outra tabela
  acao(m, s, 'pendencias');
  afirmar(m.cache.get(k) === antes, 'a conta guardada continuou valendo');
  acao(m, s, 'salvarAcao', { acao: 'Porta da doca', prazo: '2026-12-02', turno: 'A', responsaveisEmails: [GERENTE] });
  afirmar(acao(m, s, 'pendencias').pendencias.calendario.abertas === 2, 'gravou em ACOES: recontou');
});

caso('colagem pela metade: com qualquer um dos .gs desta entrega na versao anterior, a entrada funciona, a faixa diz qual falta e o Sair pela reserva encerra', () => {
  const fs = require('fs'), os = require('os'), { execSync } = require('child_process');
  const ANTES = '5888060';
  let velhos = {};
  try {
    for (const f of ['Acoes.gs', 'Auth.gs', 'Banco.gs', 'Codigo.gs', 'Filiais.gs']) {
      velhos[f] = execSync('git show ' + ANTES + ':GSL/' + f, { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    }
  } catch (e) { console.log('        (sem o historico do git: caso pulado)'); return; }
  const carga = (html) => JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(html)[1].replace(/\\u002f/g, '/').replace(/\\u003c/g, '<'));
  for (const velho of Object.keys(velhos)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-metade-'));
    try {
      fs.readdirSync(PASTA).forEach((n) => fs.copyFileSync(path.join(PASTA, n), path.join(tmp, n)));
      fs.writeFileSync(path.join(tmp, velho), velhos[velho]);
      const m = new Mundo({ dono: DONO });
      const c = novaExecucao(m, tmp, { contaGoogle: DONO }, OP); c._porta = true; c.instalar(DONO);
      const r = JSON.parse(chamarPeloNavegador(m, tmp, { contaGoogle: DONO }, 'entrar', [DONO, '4321', '4321', '', ''], OP).valor);
      afirmar(r.entrada === 'APP' && r.token, velho + ' antigo: entrou — ' + JSON.stringify(r).slice(0, 160));
      const buildNovo = fs.readFileSync(path.join(PASTA, 'Codigo.gs'), 'utf8').match(/build: '([^']+)'/)[1];
      const avisa = velho === 'Codigo.gs' ? r.app.build !== buildNovo : r.app.foraDaVersao.indexOf(velho) !== -1;
      afirmar(avisa, velho + ' antigo: a faixa avisa — ' + JSON.stringify(r.app));
      for (const id of ['acoes', 'limpeza']) {
        const t = chamarPeloNavegador(m, tmp, { contaGoogle: DONO }, 'carregarTela', [{ t: r.token, f: r.filial.codigo }, id, {}], OP);
        afirmar(t.ok, velho + ' antigo: tela ' + id + ' — ' + (t.erro && t.erro.message));
      }
      const g = novaExecucao(m, tmp, { contaGoogle: 'computador.cd@bartofil.com.br' }, OP).doGet({ parameter: {} });
      novaExecucao(m, tmp, { contaGoogle: 'computador.cd@bartofil.com.br' }, OP).doPost({ parameter: { bilhete: carga(g.getContent()).bilhete, sair: r.token } });
      tirarDoCache(m, /^sess_/);                                     // e o cache ainda perdeu a sessao: a loja nao traz de volta
      const depois = chamarPeloNavegador(m, tmp, { contaGoogle: DONO }, 'carregarTela', [{ t: r.token, f: r.filial.codigo }, 'acoes', {}], OP);
      afirmar(!depois.ok && /\[SESSAO\]/.test(depois.erro.message), velho + ' antigo: depois de Sair a sessao acabou');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
});

caso('colagem pela metade (19/10): um .gs da entrega anterior por vez — a faixa diz qual falta, as telas abrem e nada e destruido (paineis da filial, marcacao sem a coluna)', () => {
  const fs = require('fs'), os = require('os'), { execSync } = require('child_process');
  const ANTES = '2b60bb2';   // a ultima entrega antes de 19/10 (Ferias refeita)
  const arquivos = ['Acoes.gs', 'Auth.gs', 'Banco.gs', 'Calendario.gs', 'Codigo.gs', 'Config.gs', 'Emails.gs', 'Filiais.gs', 'Instalacao.gs', 'Permissoes.gs'];
  let velhos = {};
  try {
    for (const f of arquivos) velhos[f] = execSync('git show ' + ANTES + ':GSL/' + f, { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) { console.log('        (sem o historico do git: caso pulado)'); return; }
  const buildNovo = fs.readFileSync(path.join(PASTA, 'Codigo.gs'), 'utf8').match(/build: '([^']+)'/)[1];
  const paginaMandaPaineis = /agir\('salvarFilial',\{id:\$\{jsArg\(f\.id\)\},nome:val\('fl-nome'\),cidade:val\('fl-cidade'\),paineis:/.test(fs.readFileSync(path.join(PASTA, 'Paineis.html'), 'utf8'));
  afirmar(paginaMandaPaineis, 'o "Editar nome" da filial manda a copia dos paineis (o Filiais.gs anterior regravaria {} sem ela)');
  for (const velho of arquivos) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-metade19-'));
    try {
      fs.readdirSync(PASTA).forEach((n) => fs.copyFileSync(path.join(PASTA, n), path.join(tmp, n)));
      fs.writeFileSync(path.join(tmp, velho), velhos[velho]);
      const pelo = (m, conta, fn, ...args) => chamarPeloNavegador(m, tmp, { contaGoogle: conta }, fn, args, OP);
      const executar = (m, s, nome, params) => {
        const r = pelo(m, s.email, 'executarAcao', { t: s.t, f: s.f }, nome, params || {});
        if (!r.ok) throw new Error(r.erro.message);
        const x = JSON.parse(r.valor);
        if (x && x.ok === false) throw new Error(x.erro);
        return x;
      };
      const entrarAqui = (m, email, pin) => {
        let r = JSON.parse(pelo(m, email, 'entrar', email, pin, '', '', '').valor);
        if (r.pedirCodigo) r = JSON.parse(pelo(m, email, 'entrar', email, pin, pin, '', codigoDoEmail(m, email)).valor);
        else if (r.criarPin) r = JSON.parse(pelo(m, email, 'entrar', email, pin, pin, '', '').valor);
        afirmar(r.token, velho + ' anterior: ' + email + ' entrou — ' + JSON.stringify(r).slice(0, 160));
        return { t: r.token, f: r.filial.codigo, email, r };
      };
      const m = new Mundo({ dono: DONO });
      const c = novaExecucao(m, tmp, { contaGoogle: DONO }, OP); c._porta = true; c.instalar(DONO);
      const c2 = novaExecucao(m, tmp, { contaGoogle: DONO }, OP); c2._porta = true;
      const admin = { email: DONO, perfil: 'ADMIN', permissoes: c2.permissoesDe('ADMIN') };
      c2.acaoSalvarUsuario(admin, { email: GERENTE, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' });
      const c3 = novaExecucao(m, tmp, { contaGoogle: DONO }, OP); c3._porta = true;
      c3.acaoSalvarUsuario(admin, { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
      const adm = entrarAqui(m, DONO, '4321');
      const avisa = velho === 'Codigo.gs' ? adm.r.app.build !== buildNovo : adm.r.app.foraDaVersao.indexOf(velho) !== -1;
      afirmar(avisa, velho + ' anterior: a faixa avisa — ' + JSON.stringify(adm.r.app));
      for (const id of ['inicio', 'calendario', 'acoes', 'limpeza', 'config', 'filiais', 'acessos']) {
        const t = pelo(m, DONO, 'carregarTela', { t: adm.t, f: adm.f }, id, {});
        afirmar(t.ok, velho + ' anterior: tela ' + id + ' abre — ' + (t.erro && t.erro.message));
      }
      // "Editar nome" com o que a pagina manda: os paineis da filial ficam como estavam
      const lerFiliais = () => { const x = novaExecucao(m, tmp, { contaGoogle: DONO }, OP); x._porta = true; return x.listarFiliais(); };
      const f0 = lerFiliais()[0], antes = JSON.stringify(f0.paineis);
      executar(m, adm, 'salvarFilial', { id: f0.id, nome: f0.nome, cidade: f0.cidade, paineis: f0.paineis });
      afirmar(JSON.stringify(lerFiliais()[0].paineis) === antes, velho + ' anterior: PAINEIS intacto depois do Editar nome');
      // marcar pessoa: ou grava a marcacao, ou recusa — nunca promete acesso sem gravar
      const ger = entrarAqui(m, GERENTE, '5555');
      const id = executar(m, ger, 'salvarAcao', { acao: 'Porta do doca', prazo: '2026-12-01', turno: 'A', responsaveisEmails: [GERENTE] }).id;
      m.emails.length = 0;
      let recusa = '';
      try { executar(m, ger, 'comentarAcao', { id, texto: 'oi @Maria Souza', mencoes: [COORD] }); } catch (e) { recusa = e.message; }
      const x = novaExecucao(m, tmp, { contaGoogle: DONO }, OP); x._porta = true;
      const cm = x.listar('COMENTARIOS').filter((k) => k.TEXTO === 'oi @Maria Souza')[0];
      const prometeu = m.emails.some((e) => e.to === COORD && /passou a acompanhar/.test(e.htmlBody || e.body || ''));
      afirmar(recusa || !prometeu || (cm && cm.MENCOES === COORD), velho + ' anterior: marcacao gravada ou recusada (' + (recusa || JSON.stringify(cm && cm.MENCOES)) + ')');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
