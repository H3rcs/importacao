#!/usr/bin/env node
/*
 * PERFIS DE ACESSO — A MATRIZ DE TRES FAIXAS (8.12).
 *
 *   node testes/perfis.js [pasta-do-GSL]
 *
 * Para cada menu (TELAS) x cada faixa (Oculto, Ver, Ver e editar), pelas
 * portas publicas (entrar -> carregarTela / executarAcao), como a tela faz:
 *   - o menu aparece (e o cartao do modulo) so com Ver ou Ver e editar;
 *   - carregarTela abre com Ver/Ver e editar e recusa com Oculto; pode.editar so com Ver e editar;
 *   - TODA acao do catalogo ACOES daquela tela: a de gravar so passa com Ver e editar; a de
 *     leitura (leitura: true) passa com Ver; acao sem `tela` (e sem `livre`) reprova o teste;
 *   - o ajuste da pessoa vale por cima do nivel; a trava do ADMIN; o ADMIN obedece a matriz;
 *   - a conversao de um banco 8.11 (TELA_ SIM/NAO + PODE_, MODULOS por pessoa) e da 8.9/8.10;
 *   - a reserva por POST (canal barrado) passa pela mesma porta;
 *   - nenhum .gs desta versao decide acesso por capacidade.
 */
'use strict';
process.env.TZ = 'America/Bahia';
const fs = require('fs');
const path = require('path');
const { Mundo, novaExecucao, chamarPeloNavegador } = require('./emulador/gas.js');

const PASTA = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const OP = { apagarComentarios: 'nenhum' };
const DONO = 'dono@bartofil.com.br';
const GERENTE = 'joao.lima@bartofil.com.br';
const COORD = 'maria.souza@bartofil.com.br';
const CARLA = 'carla.dias@bartofil.com.br';        // nivel CONSULTA: e nela que a matriz e girada
const ATACANTE = 'estagiario@bartofil.com.br';
const FAIXAS = ['OCULTO', 'VER', 'EDITAR'];
/* As acoes da propria pessoa, fora de qualquer menu. Acao nova "livre" tem de entrar aqui de proposito. */
// 27/11: registrarDesempenho — cada pessoa manda as proprias medicoes de tempo (nada de dado de ninguem).
const LIVRES = ['enviarFeedback', 'trocarMeuPin', 'pendencias', 'atualizarDados', 'registrarDesempenho'];
/* Recusa da porta (a matriz), nao do negocio. */
const RECUSA = /só para ver|não inclui a tela|não está ligado na filial|não diz de qual tela/;

const resultados = [];
function afirmar(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); }
function caso(nome, fn) {
  try { fn(); resultados.push(true); console.log('  ok   ' + nome); }
  catch (e) { resultados.push(false); console.log('  FALHA ' + nome + '\n        ' + e.message); }
}
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
function telaCrua(m, s, id, params) {
  const r = chamar(m, s.email, 'carregarTela', { t: s.t, f: s.f }, id, params || {});
  if (!r.ok) throw new Error(r.erro.message);
  return JSON.parse(r.valor);
}
function porta(m, s, nome, params) {       // { ok, erro }: a resposta da porta, sem lancar
  const r = chamar(m, s.email, 'executarAcao', { t: s.t, f: s.f }, nome, params || {});
  if (!r.ok) return { ok: false, erro: r.erro.message };
  const x = JSON.parse(r.valor);
  return (x && x.ok === false) ? { ok: false, erro: String(x.erro || '') } : { ok: true, valor: x };
}
function acao(m, s, nome, params) {
  const r = porta(m, s, nome, params);
  if (!r.ok) throw new Error(nome + ': ' + r.erro);
  return r.valor;
}
function erroDe(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
const sessaoDe = (m, s) => JSON.parse(chamar(m, s.email, 'retomarSessao', { t: s.t, f: s.f }).valor);
const linhaDoNivel = (m, perfil) => ctx(m).listar('PERFIS').find((l) => String(l.PERFIL).toUpperCase() === perfil);
const idDe = (m, email) => ctx(m).listar('ACESSOS').find((a) => String(a.EMAIL).toLowerCase() === email).ID;

function mundo() {
  const m = new Mundo({ dono: DONO });
  ctx(m).instalar(DONO);
  const c = ctx(m);
  const admin = { email: DONO, perfil: 'ADMIN', permissoes: c.permissoesDe('ADMIN') };
  c.acaoSalvarUsuario(admin, { email: GERENTE, nome: 'João Lima', perfil: 'GERENTE', turno: '', filiais: '*', papel: 'Gerente' });
  ctx(m).acaoSalvarUsuario(admin, { email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora' });
  ctx(m).acaoSalvarUsuario(admin, { email: CARLA, nome: 'Carla Dias', perfil: 'CONSULTA', turno: '', filiais: '*', papel: 'Qualidade' });
  return m;
}

console.log('Perfis de acesso em ' + PASTA + '\n');
const C0 = ctx(new Mundo({ dono: DONO }));
const vm = require('vm');
const TELAS = vm.runInContext('TELAS', C0).map((t) => ({ id: t.id, nome: t.nome, modulo: t.modulo }));
const ACOES = vm.runInContext('ACOES', C0);

caso('o catalogo ACOES: toda acao diz a tela (que existe) ou e livre de proposito; as livres sao so as da propria pessoa', () => {
  const ids = TELAS.map((t) => t.id);
  const semTela = Object.keys(ACOES).filter((n) => {
    const a = ACOES[n];
    if (a.livre === true && !a.tela) return LIVRES.indexOf(n) === -1;
    const telas = [].concat(a.tela || []);
    return !telas.length || telas.some((t) => ids.indexOf(t) === -1);
  });
  afirmar(!semTela.length, 'acao sem tela (ou livre sem estar na lista LIVRES deste teste): ' + semTela.join(', '));
  afirmar(Object.keys(ACOES).every((n) => !('capacidade' in ACOES[n]) && !('modulo' in ACOES[n])), 'sobrou capacidade/modulo no catalogo');
  // cada menu com gravacao tem pelo menos uma acao; Central e Apresentacao so leem
  const comGravacao = ids.filter((t) => Object.keys(ACOES).some((n) => [].concat(ACOES[n].tela || []).indexOf(t) !== -1 && !ACOES[n].leitura));
  afirmar(comGravacao.join() === 'calendario,acoes,assiduidade,nobreaks,limpeza,quadro,estoque,aprendiz,carga,config,acessos,filiais,relatos', 'menus com gravacao: ' + comGravacao.join());
  // uma acao inventada sem tela e recusada pela porta (nao vira brecha)
  const c = ctx(new Mundo({ dono: DONO }));
  afirmar(/não diz de qual tela/.test(erroDe(() => c.exigirAcao_({ perfil: 'ADMIN', permissoes: { niveis: {} } }, 'nova', { funcao: 'x' }))), 'acao sem tela recusada');
});

caso('instalacao nova: a matriz padrao (ADMIN tudo Ver e editar; GERENTE a operacao e a Configuracao, Filiais so ver; COORDENADOR; SUPERVISOR; CONSULTA so ver)', () => {
  const m = mundo(); const c = ctx(m);
  const n = (p) => c.permissoesDe(p).niveis;
  const lista = (p, f) => TELAS.filter((t) => n(p)[t.id] === f).map((t) => t.id).join();
  afirmar(lista('ADMIN', 'EDITAR') === TELAS.map((t) => t.id).join(), 'ADMIN: ' + JSON.stringify(n('ADMIN')));
  afirmar(lista('GERENTE', 'VER') === 'filiais' && !lista('GERENTE', 'OCULTO'), 'GERENTE: ' + JSON.stringify(n('GERENTE')));
  afirmar(lista('COORDENADOR', 'EDITAR') === 'inicio,calendario,acoes,nobreaks,carga' && !lista('COORDENADOR', 'VER'), 'COORDENADOR: ' + JSON.stringify(n('COORDENADOR')));
  afirmar(lista('SUPERVISOR', 'EDITAR') === 'limpeza' && !lista('SUPERVISOR', 'VER'), 'SUPERVISOR');
  afirmar(lista('CONSULTA', 'VER') === 'inicio,calendario,acoes,nobreaks,limpeza,quadro,carga' && !lista('CONSULTA', 'EDITAR'), 'CONSULTA: ' + JSON.stringify(n('CONSULTA')));
  afirmar(c.permissoesDe('COORDENADOR').escopo === 'TURNO', 'escopo do coordenador');
  const cab = m.planilhas.get(c.prop('ID_BANCO')).abas.find((a) => a.nome === 'PERFIS').dados[0];
  afirmar(!cab.some((x) => /^PODE_/.test(x)), 'banco novo sem as colunas PODE_: ' + cab.join());
  afirmar(c.listar('PERFIS').every((l) => TELAS.every((t) => ['OCULTO', 'VER', 'EDITAR'].indexOf(l['TELA_' + t.id.toUpperCase()]) !== -1)), 'celulas gravadas como faixa');
});

/*
 * A MATRIZ, MENU POR MENU. A Carla (nivel CONSULTA) comeca com tudo Oculto; cada menu passa
 * pelas tres faixas, pela tela do administrador (alterarPermissao), e volta a Oculto.
 */
const PARAMS = {                               // o pedido que nao faz estrago: chega a regra do negocio e para nela
  converterFoto: (t) => ({ plano: t === 'limpeza' ? 'LIMPEZA' : 'CALENDARIO' }),
  restaurarPerfis: () => ({}),
  enviarDigesto: () => ({}),
  ligarGatilhos: () => ({}),
  corrigirFuso: () => ({}),
  atualizarRH: () => ({}), reclassificar: () => ({}), restaurarDePara: () => ({}), limparOrfasRH: () => ({})
};
const PAINEIS_TODOS = ['calendario', 'assiduidade', 'apresentacao', 'nobreaks', 'limpeza', 'quadro', 'estoque', 'aprendiz'];
const NAO_RODA = { enviarDigesto: 1, ligarGatilhos: 1, corrigirFuso: 1, atualizarRH: 1, reclassificar: 1, restaurarDePara: 1, limparOrfasRH: 1 };

caso('a matriz, menu por menu x Oculto/Ver/Ver e editar: menu, cartao, tela, e cada acao do catalogo (gravar so com Ver e editar; ler com Ver)', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  PAINEIS_TODOS.forEach((p) => acao(m, adm, 'alterarPainel', { codigo: 'FSA', painel: p, estado: 'ATIVO' }));
  const consulta = linhaDoNivel(m, 'CONSULTA');
  const faixa = (id, f) => acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_' + id.toUpperCase(), valor: f });
  TELAS.forEach((t) => faixa(t.id, 'OCULTO'));
  const carla = entrar(m, CARLA, '7777');
  afirmar(!sessaoDe(m, carla).telas.length, 'tudo Oculto: nenhum menu');
  const problemas = [];
  TELAS.forEach((t) => {
    const daTela = Object.keys(ACOES).filter((n) => [].concat(ACOES[n].tela || []).indexOf(t.id) !== -1);
    FAIXAS.forEach((f) => {
      faixa(t.id, f);
      const r = sessaoDe(m, carla);
      const noMenu = r.telas.find((x) => x.id === t.id);
      const cartao = r.modulos.find((x) => x.id === t.modulo);
      if (f === 'OCULTO') {
        if (noMenu || cartao) problemas.push(t.id + '/Oculto: no menu');
        const e = erroDe(() => telaCrua(m, carla, t.id));
        if (!/não inclui a tela/.test(e)) problemas.push(t.id + '/Oculto: a tela abriu — ' + e);
      } else {
        if (!noMenu || noMenu.nivel !== f || !cartao || cartao.telas.join() !== t.id) problemas.push(t.id + '/' + f + ': menu ' + JSON.stringify([noMenu, cartao && cartao.telas]));
        let x = null;
        try { x = telaCrua(m, carla, t.id); } catch (e) { problemas.push(t.id + '/' + f + ': a tela nao abriu — ' + e.message); }
        if (x && (!x.pode || x.pode.nivel !== f || x.pode.editar !== (f === 'EDITAR'))) problemas.push(t.id + '/' + f + ': pode ' + JSON.stringify(x.pode));
        if (x && typeof x.menu !== 'string') problemas.push(t.id + '/' + f + ': a tela sem o retrato do menu');
      }
      daTela.forEach((n) => {
        if (NAO_RODA[n] && f === 'EDITAR') return;       // gravaria de verdade (e-mail, gatilho, base inteira): basta a recusa nas outras faixas
        const a = ACOES[n];
        const passa = f === 'EDITAR' || (f === 'VER' && a.leitura === true);
        const params = PARAMS[n] ? PARAMS[n](t.id) : { id: '__nao-existe__' };
        const r2 = porta(m, carla, n, params);
        const recusada = !r2.ok && RECUSA.test(r2.erro);
        if (passa && recusada) problemas.push(n + ' em ' + t.id + '/' + f + ': recusada pela porta — ' + r2.erro);
        if (!passa && !recusada) problemas.push(n + ' em ' + t.id + '/' + f + ': PASSOU (' + (r2.ok ? 'gravou' : r2.erro) + ')');
        if (!passa && f === 'VER' && !/só para ver/.test(r2.erro || '')) problemas.push(n + ' em ' + t.id + '/Ver: a frase nao diz "só para ver" — ' + r2.erro);
      });
    });
    faixa(t.id, 'OCULTO');
  });
  afirmar(!problemas.length, problemas.length + ' problema(s):\n          ' + problemas.slice(0, 25).join('\n          '));
});

caso('vale na hora para quem ja esta dentro: a tela seguinte ja vem com a faixa nova (sem sair), e a gravacao recusada nao grava', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const carla = entrar(m, CARLA, '7777');
  acao(m, adm, 'salvarItemEstoque', { nome: 'Mouse USB', saldoInicial: '2' });
  const consulta = linhaDoNivel(m, 'CONSULTA');
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'EDITAR' });
  const t1 = telaCrua(m, carla, 'estoque');
  afirmar(t1.pode.editar && t1.dados.permissoes.cadastrar && t1.dados.permissoes.movimentar, 'Ver e editar: ' + JSON.stringify(t1.pode));
  acao(m, carla, 'movimentarEstoque', { tipo: 'SAIDA', item: t1.dados.itens[0].codigo, quantidade: '1', destino: 'Loja 1' });
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'VER' });
  const t2 = telaCrua(m, carla, 'estoque');
  afirmar(!t2.pode.editar && !t2.dados.permissoes.cadastrar && !t2.dados.permissoes.movimentar && t2.menu.indexOf('estoque:VER') !== -1, 'Ver: ' + JSON.stringify([t2.pode, t2.menu]));
  afirmar(/só para ver/.test(porta(m, carla, 'movimentarEstoque', { tipo: 'SAIDA', item: t1.dados.itens[0].codigo, quantidade: '1', destino: 'Loja 1' }).erro), 'gravacao forjada recusada');
  afirmar(telaCrua(m, adm, 'estoque').dados.itens[0].saldo === 1, 'nada gravado');
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'OCULTO' });
  afirmar(!sessaoDe(m, carla).modulos.some((x) => x.id === 'estoque'), 'Oculto: o cartao some');
  afirmar(/não inclui a tela/.test(erroDe(() => telaCrua(m, carla, 'estoque'))), 'Oculto: o link direto nao abre');
  // a resposta de quem mudou a matriz traz o menu novo (o proprio nivel)
  const ger = entrar(m, GERENTE, '5555');
  const linhaG = linhaDoNivel(m, 'GERENTE');
  const x = JSON.parse(chamar(m, DONO, 'executarAcaoETela', { t: adm.t, f: adm.f }, 'alterarPermissao', { id: linhaG.ID, coluna: 'TELA_QUADRO', valor: 'OCULTO' }, 'acessos', {}).valor);
  afirmar(x.r.invalidarTudo && x.menu && Array.isArray(x.menu.telas), 'a resposta traz o menu');
  afirmar(!sessaoDe(m, ger).telas.some((t) => t.id === 'quadro'), 'o gerente perdeu o Quadro na hora');
});

caso('ajuste desta pessoa: vale por cima do nivel (Oculto, Ver, Ver e editar), "Igual ao nivel" tira; aparece na tela de Pessoas ao lado do nivel', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const maria = entrar(m, COORD, '1234');
  const id = idDe(m, COORD);
  const faixaDela = (t) => (sessaoDe(m, maria).telas.find((x) => x.id === t) || {}).nivel || 'OCULTO';
  afirmar(faixaDela('estoque') === 'OCULTO' && faixaDela('nobreaks') === 'EDITAR', 'do nivel');
  acao(m, adm, 'definirAjustePessoa', { id, tela: 'estoque', nivel: 'EDITAR' });
  acao(m, adm, 'definirAjustePessoa', { id, tela: 'nobreaks', nivel: 'VER' });
  acao(m, adm, 'definirAjustePessoa', { id, tela: 'calendario', nivel: 'OCULTO' });
  afirmar(faixaDela('estoque') === 'EDITAR' && faixaDela('nobreaks') === 'VER' && faixaDela('calendario') === 'OCULTO', 'ajuste por cima do nivel');
  acao(m, maria, 'salvarItemEstoque', { nome: 'Cabo HDMI', saldoInicial: '1' });
  afirmar(/só para ver/.test(porta(m, maria, 'lancarLeituras', { nobreak: 'x', leituras: [] }).erro), 'nobreak so ver');
  afirmar(/não inclui a tela "Calendário"/.test(erroDe(() => telaCrua(m, maria, 'calendario'))), 'calendario oculto para ela');
  const p = telaCrua(m, adm, 'acessos').dados.pessoas.find((x) => x.email === COORD);
  afirmar(p.ajustes.estoque === 'EDITAR' && p.doNivel.estoque === 'OCULTO' && p.efetivo.estoque === 'EDITAR' && p.efetivo.calendario === 'OCULTO', 'Pessoas: ' + JSON.stringify([p.ajustes, p.doNivel.estoque]));
  acao(m, adm, 'definirAjustePessoa', { id, tela: 'estoque', nivel: 'PADRAO' });
  afirmar(faixaDela('estoque') === 'OCULTO', 'Igual ao nivel');
  // o cadastro grava o ajuste junto (o seletor "Igual ao nivel" vai como PADRAO)
  acao(m, adm, 'salvarUsuario', { id, email: COORD, nome: 'Maria Souza', perfil: 'COORDENADOR', turno: 'A', filiais: '*', papel: 'Coordenadora',
    ajustes: { estoque: 'VER', nobreaks: 'PADRAO', calendario: 'PADRAO' } });
  afirmar(faixaDela('estoque') === 'VER' && faixaDela('nobreaks') === 'EDITAR' && faixaDela('calendario') === 'EDITAR', 'pelo cadastro');
  afirmar(ctx(m).obter('ACESSOS', id).AJUSTES === '{"estoque":"VER"}', 'gravado: ' + ctx(m).obter('ACESSOS', id).AJUSTES);
  // so um administrador mexe no acesso a Pessoas e acessos / Filiais e paineis (nem pelo ajuste)
  const ger = entrar(m, GERENTE, '5555');
  afirmar(/Só um administrador/.test(erroDe(() => acao(m, ger, 'definirAjustePessoa', { id, tela: 'filiais', nivel: 'EDITAR' }))), 'gerente nao da Filiais');
  afirmar(/Só um administrador/.test(erroDe(() => acao(m, ger, 'definirAjustePessoa', { id: idDe(m, GERENTE), tela: 'acessos', nivel: 'OCULTO' }))), 'nem tira Pessoas');
  acao(m, ger, 'definirAjustePessoa', { id, tela: 'quadro', nivel: 'VER' });
  afirmar(faixaDela('quadro') === 'VER', 'o gerente ajusta os outros menus');
  afirmar(/Só um administrador pode dar, tirar ou editar o nível ADMIN/.test(erroDe(() => acao(m, ger, 'definirAjustePessoa', { id: idDe(m, DONO), tela: 'quadro', nivel: 'OCULTO' }) )) ||
    /não encontrada/.test(erroDe(() => acao(m, ger, 'definirAjustePessoa', { id: idDe(m, DONO), tela: 'quadro', nivel: 'OCULTO' }))), 'nem o acesso de um ADMIN');
});

caso('ADMIN: obedece a matriz (Oculto some, Ver so le) — menos Pessoas e acessos, sempre Ver e editar (a trava, tambem contra o ajuste); so ADMIN mexe no nivel ADMIN e nas colunas de acesso', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321');
  const a = linhaDoNivel(m, 'ADMIN');
  acao(m, adm, 'alterarPermissao', { id: a.ID, coluna: 'TELA_ESTOQUE', valor: 'OCULTO' });
  acao(m, adm, 'alterarPermissao', { id: a.ID, coluna: 'TELA_NOBREAKS', valor: 'VER' });
  let r = sessaoDe(m, adm);
  afirmar(!r.telas.some((t) => t.id === 'estoque') && r.telas.find((t) => t.id === 'nobreaks').nivel === 'VER', 'o ADMIN obedece: ' + JSON.stringify(r.telas));
  afirmar(/só para ver/.test(porta(m, adm, 'salvarNobreak', { codigo: 'X' }).erro), 'Ver: o ADMIN nao grava');
  afirmar(/não inclui a tela/.test(porta(m, adm, 'salvarItemEstoque', { nome: 'X' }).erro), 'Oculto: o ADMIN nao grava');
  const trava = porta(m, adm, 'alterarPermissao', { id: a.ID, coluna: 'TELA_ACESSOS', valor: 'OCULTO' });
  afirmar(/sempre “Ver e editar”/.test(trava.erro), 'a trava: ' + trava.erro);
  // a trava vale tambem contra o ajuste por pessoa (gravado direto na planilha)
  ctx(m).atualizar('ACESSOS', idDe(m, DONO), { AJUSTES: '{"acessos":"OCULTO","filiais":"OCULTO"}' }, DONO);
  m.cache.clear();
  r = sessaoDe(m, adm);
  afirmar(r.telas.find((t) => t.id === 'acessos').nivel === 'EDITAR' && !r.telas.some((t) => t.id === 'filiais'), 'trava contra o ajuste: ' + JSON.stringify(r.telas.map((t) => t.id + ':' + t.nivel)));
  const d = telaCrua(m, adm, 'acessos').dados;
  afirmar(d.perfis.find((p) => p.perfil === 'ADMIN').travas.acessos && d.souAdmin, 'a grade marca a trava');
  // o gerente (Ver e editar em Pessoas) nao mexe no nivel ADMIN nem nas colunas de Pessoas/Filiais
  const ger = entrar(m, GERENTE, '5555');
  afirmar(/Só um administrador mexe no nível ADMIN/.test(erroDe(() => acao(m, ger, 'alterarPermissao', { id: a.ID, coluna: 'TELA_QUADRO', valor: 'OCULTO' }))), 'nivel ADMIN');
  const c = linhaDoNivel(m, 'CONSULTA');
  afirmar(/Só um administrador/.test(erroDe(() => acao(m, ger, 'alterarPermissao', { id: c.ID, coluna: 'TELA_FILIAIS', valor: 'EDITAR' }))), 'coluna Filiais');
  afirmar(/Só um administrador/.test(erroDe(() => acao(m, ger, 'restaurarPerfis', {}))), 'restaurar o padrao');
  acao(m, ger, 'alterarPermissao', { id: c.ID, coluna: 'TELA_QUADRO', valor: 'OCULTO' });
  afirmar(telaCrua(m, ger, 'acessos').dados.soDoAdmin.join() === 'acessos,filiais', 'a grade do gerente sabe o que e so do ADMIN');
  // valores invalidos
  afirmar(/Escolha Oculto, Ver ou Ver e editar/.test(erroDe(() => acao(m, adm, 'alterarPermissao', { id: c.ID, coluna: 'TELA_QUADRO', valor: 'SIM' }))), 'SIM nao e faixa');
  afirmar(/Coluna de permissão inválida/.test(erroDe(() => acao(m, adm, 'alterarPermissao', { id: c.ID, coluna: 'PODE_PROGRAMAR', valor: true }))), 'PODE_ nao e mais gravado');
  acao(m, adm, 'alterarPermissao', { id: c.ID, coluna: 'ESCOPO', valor: 'TURNO' });
  afirmar(ctx(m).permissoesDe('CONSULTA').escopo === 'TURNO', 'alcance por nivel');
  afirmar(/Alcance inválido/.test(erroDe(() => acao(m, adm, 'alterarPermissao', { id: c.ID, coluna: 'ESCOPO', valor: 'TUDO' }))), 'alcance invalido');
  // restaurar o padrao: a matriz volta, a trava continua
  acao(m, adm, 'restaurarPerfis', {});
  afirmar(sessaoDe(m, adm).telas.some((t) => t.id === 'estoque'), 'restaurado: o ADMIN ve o estoque de novo');
});

caso('painel da filial vem antes da faixa: Desativado some ate para quem tem Ver e editar; Oculto so o administrador; a frase diz a causa', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321'); const ger = entrar(m, GERENTE, '5555');
  acao(m, adm, 'alterarPainel', { codigo: 'FSA', painel: 'quadro', estado: 'OCULTO' });
  afirmar(sessaoDe(m, adm).telas.some((t) => t.id === 'quadro') && !sessaoDe(m, ger).telas.some((t) => t.id === 'quadro'), 'Oculto: so o administrador');
  afirmar(/não está ligado na filial/.test(porta(m, ger, 'salvarFonteQuadro', { link: 'x' }).erro), 'a acao do painel oculto: a frase do painel');
  acao(m, adm, 'alterarPainel', { codigo: 'FSA', painel: 'quadro', estado: 'DESATIVADO' });
  afirmar(!sessaoDe(m, adm).telas.some((t) => t.id === 'quadro'), 'Desativado: nem o administrador');
  afirmar(/não está ligado na filial/.test(erroDe(() => telaCrua(m, adm, 'quadro'))), 'a tela: a frase do painel');
});

caso('reserva por POST (canal barrado): a gravacao pela pagina passa pela mesma porta — com Ver e recusada e nada grava; com Oculto a tela nao vem embutida', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321'); const carla = entrar(m, CARLA, '7777');
  acao(m, adm, 'salvarItemEstoque', { nome: 'Teclado', saldoInicial: '5' });
  const consulta = linhaDoNivel(m, 'CONSULTA');
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'VER' });
  const carga = (saida) => JSON.parse(/CARGA_INICIAL\s*=\s*(\{.*?\});/s.exec(saida.getContent())[1].replace(/\\u002f/g, '/').replace(/\\u003c/g, '<'));
  const get = () => carga(ctx(m, 'computador.cd@bartofil.com.br').doGet({ parameter: {} }));
  const post = (campos) => carga(ctx(m, 'computador.cd@bartofil.com.br').doPost({ parameter: Object.assign({ bilhete: get().bilhete }, campos) }));
  const item = telaCrua(m, adm, 'estoque').dados.itens[0];
  const p = post({ t: carla.t, filial: carla.f, tela: 'estoque', acao: 'movimentarEstoque',
    ap: JSON.stringify({ tipo: 'SAIDA', item: item.codigo, quantidade: '1', destino: 'Loja' }), idem: '11111111-2222-4333-8444-555555555555' });
  afirmar(p.resultadoAcao && p.resultadoAcao.ok === false && /só para ver/.test(p.resultadoAcao.erro), 'recusada pela porta: ' + JSON.stringify(p.resultadoAcao));
  afirmar(p.telaEmbutida && p.telaEmbutida.resposta.pode.editar === false, 'a tela volta so para ver');
  afirmar(telaCrua(m, adm, 'estoque').dados.itens[0].saldo === 5, 'nada gravado');
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'EDITAR' });
  const p2 = post({ t: carla.t, filial: carla.f, tela: 'estoque', acao: 'movimentarEstoque',
    ap: JSON.stringify({ tipo: 'SAIDA', item: item.codigo, quantidade: '1', destino: 'Loja' }), idem: '21111111-2222-4333-8444-555555555555' });
  afirmar(p2.resultadoAcao && p2.resultadoAcao.ok !== false && telaCrua(m, adm, 'estoque').dados.itens[0].saldo === 4, 'Ver e editar grava: ' + JSON.stringify(p2.resultadoAcao));
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'OCULTO' });
  const p3 = post({ t: carla.t, filial: carla.f, tela: 'estoque' });
  afirmar(!p3.telaEmbutida && /não inclui a tela/.test(p3.avisoTela || ''), 'Oculto: sem tela, com o aviso — ' + JSON.stringify([p3.avisoTela]));
  // o link de e-mail (?tela=) tambem: a tela so vem embutida para quem a ve
  const r = JSON.parse(chamar(m, CARLA, 'entrar', CARLA, '7777', '', '', '', 'estoque', '').valor);
  afirmar(!r.telaEmbutida && /não inclui a tela/.test(r.avisoTela || ''), 'link de e-mail para tela Oculta: ' + JSON.stringify([r.avisoTela]));
});

caso('API da versao local (POST JSON no doPost): as mesmas portas, a mesma matriz — Oculto nao abre, Ver nao grava, Ver e editar grava; o menu da sessao e o da matriz', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321'); const carla = entrar(m, CARLA, '7777');
  acao(m, adm, 'salvarItemEstoque', { nome: 'Teclado', saldoInicial: '5' });
  const api = (fn, ...args) => {
    const c = novaExecucao(m, PASTA, { contaGoogle: '' }, OP);
    const corpo = JSON.stringify({ api: 1, fn: fn, args: args });
    const r = JSON.parse(c.doPost({ parameter: {}, parameters: {}, postData: { type: 'text/plain', contents: corpo, length: corpo.length } }).getContent());
    return r;
  };
  const k = { t: carla.t, f: carla.f };
  const consulta = linhaDoNivel(m, 'CONSULTA');
  let r = api('carregarTela', k, 'estoque', {});
  afirmar(!r.ok && /não inclui a tela/.test(r.erro), 'Oculto pela API: ' + JSON.stringify(r).slice(0, 120));
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'VER' });
  r = api('carregarTela', k, 'estoque', {});
  const t = JSON.parse(r.valor);
  afirmar(r.ok && t.pode.nivel === 'VER' && !t.pode.editar, 'Ver pela API: ' + JSON.stringify(t.pode));
  const codigo = t.dados.itens[0].codigo;
  r = api('executarAcao', k, 'movimentarEstoque', { tipo: 'SAIDA', item: codigo, quantidade: '1', destino: 'Loja' });
  afirmar(!r.ok && /só para ver/.test(r.erro), 'gravar com Ver pela API: ' + JSON.stringify(r).slice(0, 120));
  r = api('executarAcaoETela', k, 'movimentarEstoque', { tipo: 'SAIDA', item: codigo, quantidade: '1', destino: 'Loja' }, 'estoque', {});
  afirmar(!r.ok && /só para ver/.test(r.erro), 'executarAcaoETela com Ver pela API');
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_ESTOQUE', valor: 'EDITAR' });
  r = api('executarAcao', k, 'movimentarEstoque', { tipo: 'SAIDA', item: codigo, quantidade: '1', destino: 'Loja' });
  afirmar(r.ok && telaCrua(m, adm, 'estoque').dados.itens[0].saldo === 4, 'Ver e editar pela API grava: ' + JSON.stringify(r).slice(0, 120));
  const s = JSON.parse(api('retomarSessao', k).valor);
  afirmar(s.telas.find((x) => x.id === 'estoque').nivel === 'EDITAR', 'o menu da sessao pela API e o da matriz');
  r = api('alterarPermissao', k, { id: consulta.ID });
  afirmar(!r.ok && /não liberada na API/.test(r.erro), 'funcao interna nao passa pela API');
});

caso('anexo das entregas (obterAnexo) e atalhos da Central seguem a matriz do Calendario', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321'); const carla = entrar(m, CARLA, '7777');
  const consulta = linhaDoNivel(m, 'CONSULTA');
  acao(m, adm, 'alterarPermissao', { id: consulta.ID, coluna: 'TELA_CALENDARIO', valor: 'OCULTO' });
  const r = chamar(m, CARLA, 'obterAnexo', { t: carla.t, f: carla.f }, 'qualquer');
  afirmar(!r.ok && /não inclui a tela "Calendário"/.test(r.erro.message), 'obterAnexo sem o Calendario: ' + (r.erro && r.erro.message));
  const atalhos = telaCrua(m, carla, 'inicio').dados.atalhos.map((t) => t.id);
  afirmar(atalhos.indexOf('calendario') === -1 && atalhos.indexOf('acoes') !== -1, 'atalhos da Central: ' + atalhos.join());
});

caso('ninguem valida a propria entrega: quem mandou arquivo nao aprova nem reprova (cancelar e reabrir continuam); outra pessoa valida', () => {
  const m = mundo(); const adm = entrar(m, DONO, '4321'); const ger = entrar(m, GERENTE, '5555');
  const cal = telaCrua(m, ger, 'calendario').dados;
  const a = cal.atividades.find((x) => x.turno === 'Todos') || cal.atividades[0];
  acao(m, ger, 'entregar', { id: a.id, arquivo: { nome: 'ata.pdf', tipo: 'application/pdf', dados: Buffer.from('%PDF-1.4 teste').toString('base64') } });
  const depois = telaCrua(m, ger, 'calendario').dados.atividades.find((x) => x.id === a.id);
  afirmar(depois.entreguePor.indexOf(GERENTE) !== -1, 'quem entregou: ' + JSON.stringify(depois.entreguePor));
  afirmar(/ninguém valida a própria entrega/.test(erroDe(() => acao(m, ger, 'validar', { id: a.id, validacao: 'Aprovado' }))), 'aprovar a propria: recusado');
  afirmar(/ninguém valida a própria entrega/.test(erroDe(() => acao(m, ger, 'validar', { id: a.id, validacao: 'Reprovado', motivo: 'x' }))), 'reprovar a propria: recusado');
  acao(m, adm, 'validar', { id: a.id, validacao: 'Aprovado' });
  afirmar(ctx(m).obter('ATIVIDADES', a.id).VALIDACAO === 'Aprovado', 'outra pessoa aprova');
});

/*
 * MIGRACAO: banco da 8.11 no modelo antigo — PERFIS com TELA_ SIM/NAO e as capacidades PODE_
 * (como o perfisPadrao antigo semeava, com a linha ADMIN incompleta e o COORDENADOR sem
 * TELA_ACOES), um nivel criado a mao e ajustes por modulo em ACESSOS.MODULOS.
 */
const ANTIGOS = {
  ADMIN:       { telas: ['inicio', 'calendario', 'acoes', 'assiduidade', 'config', 'acessos'], podes: ['PROGRAMAR', 'GERIR_ACESSOS'] },
  GERENTE:     { telas: ['inicio', 'calendario', 'acoes', 'assiduidade', 'apresentacao', 'config', 'acessos', 'relatos', 'nobreaks', 'limpeza', 'quadro', 'estoque', 'aprendiz'],
                 podes: ['VER_INDIVIDUAL', 'EDITAR', 'EXCLUIR', 'ANEXAR', 'VALIDAR', 'PROGRAMAR', 'GERIR_ACESSOS', 'GERIR_ACOES', 'LANCAR_NOBREAK', 'GERIR_LIMPEZA'] },
  COORDENADOR: { telas: ['inicio', 'calendario', 'nobreaks'], podes: ['ANEXAR', 'ENTREGAR', 'LANCAR_NOBREAK'] },
  SUPERVISOR:  { telas: ['limpeza'], podes: ['GERIR_LIMPEZA'] },
  CONSULTA:    { telas: ['inicio', 'calendario', 'acoes', 'nobreaks', 'limpeza', 'quadro'], podes: [] },
  PENDENTE:    { telas: [], podes: [] },
  AUDITOR:     { telas: ['assiduidade', 'config', 'estoque'], podes: ['MOVIMENTAR_ESTOQUE'] }   // criado a mao; Configuracao sem PROGRAMAR
};
const CAPS = ['VER_INDIVIDUAL', 'ENTREGAR', 'VALIDAR', 'PROGRAMAR', 'EDITAR', 'EXCLUIR', 'ANEXAR', 'GERIR_ACESSOS',
  'GERIR_ACOES', 'LANCAR_NOBREAK', 'GERIR_LIMPEZA', 'GERIR_FILIAIS', 'GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE'];

function bancoAntigo(versao) {
  const m = mundo(); let c = ctx(m);
  const banco = m.planilhas.get(c.prop('ID_BANCO'));
  const aba = banco.abas.find((a) => a.nome === 'PERFIS');
  // TELA_CARGA nasce na 8.14: o banco antigo nao tem a coluna (ela chega vazia e ganha o padrao de cada nivel)
  const cab = aba.dados[0].filter((x) => x !== 'TELA_CARGA');
  CAPS.forEach((k) => cab.push('PODE_' + k));
  const linhas = [cab];
  Object.keys(ANTIGOS).forEach((perfil, i) => {
    const l = cab.map(() => '');
    const pos = (k) => cab.indexOf(k);
    l[pos('ID')] = 'PER-ANT-' + i; l[pos('PERFIL')] = perfil; l[pos('ESCOPO')] = perfil === 'COORDENADOR' ? 'TURNO' : 'TODOS';
    l[pos('DESCRICAO')] = 'nivel ' + perfil; l[pos('EXCLUIDO')] = '';
    TELAS.filter((t) => t.id !== 'carga').forEach((t) => { l[pos('TELA_' + t.id.toUpperCase())] = ANTIGOS[perfil].telas.indexOf(t.id) !== -1 ? 'SIM' : 'NAO'; });
    CAPS.forEach((k) => { l[pos('PODE_' + k)] = ANTIGOS[perfil].podes.indexOf(k) !== -1 ? 'SIM' : 'NAO'; });
    linhas.push(l);
  });
  aba.dados.length = 0; linhas.forEach((l) => aba.dados.push(l));
  aba.maxC = Math.max(aba.maxC, cab.length);
  // ACESSOS sem a coluna AJUSTES (nasce na 8.12), com o ajuste por modulo antigo
  const abaA = banco.abas.find((a) => a.nome === 'ACESSOS');
  const ia = abaA.dados[0].indexOf('AJUSTES'), im = abaA.dados[0].indexOf('MODULOS');
  const ie = abaA.dados[0].indexOf('EMAIL');
  abaA.dados.forEach((l, n) => {
    if (n && l[ie] === COORD) l[im] = JSON.stringify({ estoque: 'EDITAR', nobreaks: 'NAO', quadro: 'VER', calendario: 'VER' });
    if (n && l[ie] === GERENTE) l[im] = JSON.stringify({ limpeza: 'VER' });
    if (n && l[ie] === DONO) l[im] = JSON.stringify({ calendario: 'NAO' });            // no modelo antigo, nao valia para o ADMIN
    l.splice(ia, 1);
  });
  c.PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', versao);
  m.cache.clear();
  return m;
}

caso('migracao de um banco 8.11: SIM/NAO + PODE_ viram as tres faixas (capacidade que grava = Ver e editar), ADMIN tudo Ver e editar, PODE_ ficam na planilha; MODULOS viram AJUSTES; roda uma vez so', () => {
  const m = bancoAntigo('8.11');
  // antes de migrar o banco ja funciona: a celula antiga e convertida na leitura
  afirmar(ctx(m).permissoesDe('AUDITOR').niveis.estoque === 'EDITAR', 'leitura do modelo antigo antes da migracao');
  const adm = entrar(m, DONO, '4321');                       // a entrada roda a migracao
  const c = ctx(m);
  afirmar(c.prop('VERSAO_ESQUEMA') === '8.16', 'versao: ' + c.prop('VERSAO_ESQUEMA'));
  const cel = (perfil) => { const l = c.listar('PERFIS').find((x) => x.PERFIL === perfil); const o = {}; TELAS.forEach((t) => { o[t.id] = l['TELA_' + t.id.toUpperCase()]; }); return o; };
  const esperado = {
    ADMIN:       'inicio:E calendario:E acoes:E assiduidade:E apresentacao:E nobreaks:E limpeza:E quadro:E estoque:E aprendiz:E carga:E config:E acessos:E filiais:E relatos:E',
    GERENTE:     'inicio:E calendario:E acoes:E assiduidade:E apresentacao:E nobreaks:E limpeza:E quadro:E estoque:V aprendiz:E carga:E config:E acessos:E filiais:O relatos:E',
    COORDENADOR: 'inicio:E calendario:E acoes:E assiduidade:O apresentacao:O nobreaks:E limpeza:O quadro:O estoque:O aprendiz:O carga:E config:O acessos:O filiais:O relatos:O',
    SUPERVISOR:  'inicio:O calendario:O acoes:O assiduidade:O apresentacao:O nobreaks:O limpeza:E quadro:O estoque:O aprendiz:O carga:O config:O acessos:O filiais:O relatos:O',
    CONSULTA:    'inicio:V calendario:V acoes:V assiduidade:O apresentacao:O nobreaks:V limpeza:V quadro:V estoque:O aprendiz:O carga:V config:O acessos:O filiais:O relatos:O',
    PENDENTE:    'inicio:O calendario:O acoes:O assiduidade:O apresentacao:O nobreaks:O limpeza:O quadro:O estoque:O aprendiz:O carga:O config:O acessos:O filiais:O relatos:O',
    AUDITOR:     'inicio:O calendario:O acoes:O assiduidade:V apresentacao:O nobreaks:O limpeza:O quadro:O estoque:E aprendiz:O carga:O config:O acessos:O filiais:O relatos:O'
  };
  Object.keys(esperado).forEach((p) => {
    const o = cel(p);
    const txt = TELAS.map((t) => t.id + ':' + String(o[t.id]).charAt(0)).join(' ');
    afirmar(txt === esperado[p], p + ':\n          ' + txt + '\n        esperado\n          ' + esperado[p]);
  });
  const ger = c.listar('PERFIS').find((x) => x.PERFIL === 'GERENTE');
  afirmar(ger.PODE_VALIDAR === 'SIM' && ger.PODE_GERIR_FILIAIS === 'NAO', 'as colunas PODE_ continuam na planilha, intactas');
  // os ajustes por pessoa
  const aj = (email) => c.listar('ACESSOS').find((x) => String(x.EMAIL).toLowerCase() === email).AJUSTES;
  afirmar(aj(COORD) === JSON.stringify({ inicio: 'EDITAR', calendario: 'EDITAR', acoes: 'EDITAR', nobreaks: 'OCULTO', quadro: 'VER', estoque: 'EDITAR' }), 'coordenadora: ' + aj(COORD));
  afirmar(aj(GERENTE) === '{"limpeza":"VER"}', 'gerente: ' + aj(GERENTE));
  afirmar(aj(DONO) === '{}', 'admin: o ajuste antigo nao valia para ele: ' + aj(DONO));
  afirmar(c.listar('ACESSOS').find((x) => String(x.EMAIL).toLowerCase() === COORD).MODULOS.indexOf('estoque') !== -1, 'MODULOS continua la');
  // o que cada um passa a ver bate com o que via
  const maria = entrar(m, COORD, '1234');
  const tm = sessaoDe(m, maria).telas.map((t) => t.id + ':' + t.nivel.charAt(0)).join(' ');
  afirmar(tm === 'inicio:E calendario:E acoes:E quadro:V estoque:E carga:E', 'coordenadora (a Situacao de Carga chega com o padrao do nivel): ' + tm);
  afirmar(sessaoDe(m, adm).telas.length === TELAS.length, 'o ADMIN ve tudo, como via');
  // roda uma vez so: voltar a marca da versao nao converte de novo (nada mais e SIM/NAO)
  const antes = JSON.stringify(c.listar('PERFIS')) + JSON.stringify(c.listar('ACESSOS').map((x) => x.AJUSTES));
  c.PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', '8.11'); m.cache.clear();
  const c2 = ctx(m); c2.garantirEsquema();
  afirmar(JSON.stringify(ctx(m).listar('PERFIS')) + JSON.stringify(ctx(m).listar('ACESSOS').map((x) => x.AJUSTES)) === antes, 'segunda passada nao muda nada');
});

caso('migracao a partir da 8.9 e da 8.10 tambem converte na primeira entrada', () => {
  ['8.9', '8.10'].forEach((v) => {
    const m = bancoAntigo(v);
    entrar(m, DONO, '4321');
    const c = ctx(m);
    afirmar(c.prop('VERSAO_ESQUEMA') === '8.16', v + ': versao ' + c.prop('VERSAO_ESQUEMA'));
    afirmar(c.listar('PERFIS').every((l) => TELAS.every((t) => ['OCULTO', 'VER', 'EDITAR'].indexOf(l['TELA_' + t.id.toUpperCase()]) !== -1)), v + ': tudo em faixas');
  });
});

caso('nenhum .gs desta versao decide acesso por capacidade, modulo ou nome do nivel (so Permissoes.gs, nos calcos de compatibilidade); a tela nao usa as capacidades', () => {
  const fora = [];
  fs.readdirSync(PASTA).filter((n) => /\.gs$/.test(n) && n !== 'Permissoes.gs').forEach((n) => {
    const s = fs.readFileSync(path.join(PASTA, n), 'utf8');
    (s.match(/\b(podeFazer|exigirCapacidade|exigirTela|modoEfetivo|aplicarModulosDaPessoa|lerModulosPessoa|exigirModuloDaAcao_|exigirPodeEntregar_)\s*\(/g) || [])
      .forEach((x) => fora.push(n + ': ' + x));
    if (/permissoes\.(podes|telas)\b/.test(s)) fora.push(n + ': permissoes.podes/telas');
  });
  afirmar(!fora.length, fora.join(', '));
  ['App.html', 'Paineis.html', 'Aprendiz.html'].forEach((n) => {
    const s = fs.readFileSync(path.join(PASTA, n), 'utf8');
    afirmar(!/\.podes\b|\bPODE_[A-Z]|SESSAO\.usuario\.perfil|SESSAO\.admin/.test(s), n + ': decide pela capacidade ou pelo nome do nivel');
  });
});

caso('chamadas diretas pelo console: as portas novas e as funcoes de cada acao do catalogo nao andam sem sessao', () => {
  const m = mundo();
  const FALSO = { email: ATACANTE, perfil: 'ADMIN', permissoes: { escopo: 'TODOS', niveis: {} } };
  TELAS.forEach((t) => { FALSO.permissoes.niveis[t.id] = 'EDITAR'; });
  // Recusa = "Acesso negado" (a porta) ou o pedido recusado antes de tocar em qualquer dado (validacao).
  // O diagnostico de identidade e a mesma pagina publica /exec?diagnostico=1: diz so quem abriu e quem e o dono.
  const PUBLICAS = { diagnosticoIdentidade: 1 };
  const passou = [];
  const antes = JSON.stringify([...m.planilhas.values()].map((p) => p.abas.map((a) => a.dados.length)));
  Object.keys(ACOES).forEach((n) => {
    const r = chamar(m, ATACANTE, ACOES[n].funcao, FALSO, { id: 'x' });
    if (r.ok && !PUBLICAS[n]) passou.push(n + ' (' + ACOES[n].funcao + '): DEVOLVEU ' + JSON.stringify(r.valor).slice(0, 60));
  });
  afirmar(JSON.stringify([...m.planilhas.values()].map((p) => p.abas.map((a) => a.dados.length))) === antes, 'nada gravado pelas chamadas diretas');
  afirmar(!passou.length, passou.join('\n          '));
  const ea = chamar(m, ATACANTE, 'executarAcao', { t: 'f'.repeat(64), f: 'FSA' }, 'alterarPermissao', { id: 'x', coluna: 'TELA_ACESSOS', valor: 'EDITAR' });
  afirmar(!ea.ok && /\[SESSAO\]/.test(ea.erro.message), 'executarAcao sem sessao');
});

const falhas = resultados.filter((x) => !x).length;
console.log('\n' + (resultados.length - falhas) + '/' + resultados.length + ' casos ok');
process.exit(falhas ? 1 : 0);
