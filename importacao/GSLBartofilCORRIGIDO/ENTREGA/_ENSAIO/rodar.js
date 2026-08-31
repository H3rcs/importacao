const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('./stubs.js');
const DIR = process.argv[2] || path.join(__dirname, '..', '02_CORRIGIDO');

const ctx = Object.assign({ console, JSON, Math, Date, String, Number, Boolean, Object, Array,
  Error, RegExp, isNaN, parseInt, parseFloat, Set, Map, Buffer }, S);
ctx.globalThis = ctx;
vm.createContext(ctx);

const ordem = ['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs',
               'Central.gs','Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs'];
ordem.forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f }));

const ok = [], erros = [];
function t(nome, fn) { try { fn(); ok.push(nome); } catch (e) { erros.push(nome + ' -> ' + (e.message || e)); } }
function eq(a, b, msg) { if (String(a) !== String(b)) throw new Error((msg || '') + ' esperado ' + b + ', veio ' + a); }

console.log('== instalacao ==');
let r;
try {
  r = ctx.instalar('admin@bartofil.com.br');
} catch (e) {
  /*
   * Roda contra a versao ORIGINAL: prop() guarda as propriedades na
   * primeira leitura e instalar() nao derruba essa copia depois de gravar
   * o ID_BANCO. A instalacao morre aqui. Registramos como falha e
   * compensamos, para o resto da bateria ainda dar informacao.
   */
  erros.push('C1 · instalar() -> ' + (e.message || e));
  console.log('  FALHA CRITICA na instalacao: ' + (e.message || e));
  console.log('  (compensando para seguir com o resto dos testes)');
  ctx.esquecerProps();
  ctx.semearPerfis(); ctx.semearRotinas(); ctx.semearParametros();
  ctx.semearSetores(); ctx.semearDePara();
  ctx.inserir('ACESSOS', { EMAIL: 'admin@bartofil.com.br', NOME: 'admin', PERFIL: 'ADMIN', ATIVO: 'SIM' }, 'sistema');
  ctx.inserir('EQUIPE', { PAPEL: 'Administrador do sistema', NOME: 'admin', EMAIL: 'admin@bartofil.com.br', ATIVO: 'SIM' }, 'sistema');
  r = { ok: true };
}
console.log('  banco criado:', !!r.ok, '| perfis:', ctx.listar('PERFIS').length,
            '| de-para:', ctx.listar('DE_PARA').length, '| parametros:', ctx.listar('PARAMETROS').length,
            '| setores:', ctx.listar('SETORES').length, '| rotinas:', ctx.listar('ROTINAS').length);

t('IDs unicos no lote', () => {
  const ids = ctx.listar('DE_PARA').map(x => x.ID);
  eq(new Set(ids).size, ids.length, 'IDs de DE_PARA duplicados:');
});

// equipe: 3 coordenadores + gerente
ctx.definirEmailAtual('admin@bartofil.com.br');
const adm = ctx.usuarioAtual();
[['Coordenador · Turno A','Ana','ana@b.com','A','COORDENADOR'],
 ['Coordenador · Turno B','Bruno','bruno@b.com','B','COORDENADOR'],
 ['Coordenador · Turno C','Caio','caio@b.com','C','COORDENADOR'],
 ['Gerente','Gina','gina@b.com','','GERENTE']]
 .forEach(p => ctx.acaoSalvarUsuario(adm, { papel:p[0], nome:p[1], email:p[2], turno:p[3], perfil:p[4], ativo:true }));

console.log('\n== calendario ==');
const compAtual = ctx.competenciaDe(ctx.hoje());
const g = ctx.gerarCompetencia(compAtual, 'admin@bartofil.com.br');
console.log('  atividades geradas em', compAtual + ':', g.criadas);
const cal = ctx.dadosCalendario(adm, {});
console.log('  na tela:', cal.atividades.length, 'atividades +', cal.treinamentos.length, 'treinamentos');
console.log('  resumo:', JSON.stringify(cal.resumo));
t('grade do mes montada', () => { if (!cal.grade.length) throw new Error('grade vazia'); });
t('coordenador resolvido', () => {
  const a = cal.atividades.find(x => x.turno === 'A');
  if (!a || a.coordenador !== 'Ana') throw new Error('turno A sem Ana: ' + (a && a.coordenador));
});
t('prazoNum presente', () => {
  const a = cal.atividades[0];
  if (typeof a.prazoNum !== 'number') throw new Error('prazoNum ausente');
  eq(a.prazoNum, ctx.diaNumISO(a.prazoISO), 'prazoNum divergente:');
});

// valida / cancela / remarca
const alvo = cal.atividades[0];
t('validar aprovado', () => { ctx.acaoValidar(adm, { id: alvo.id, validacao: 'Aprovado', motivo: 'ok' }); });
t('validar id inexistente da erro claro', () => {
  try { ctx.acaoValidar(adm, { id: 'NAO-EXISTE', validacao: 'Aprovado' }); throw new Error('nao lancou'); }
  catch (e) { if (!/n[aã]o encontrada/i.test(e.message)) throw e; }
});
t('remarcar recalcula status', () => {
  const b = cal.atividades[1];
  ctx.acaoRemarcar(adm, { id: b.id, prazo: ctx.paraISO(new Date(Date.now() + 20*864e5)), motivo: 'chuva', avisar: false });
  const dep = ctx.hidratar(ctx.obter('ATIVIDADES', b.id));
  eq(dep.status, 'Pendente', 'status apos remarcar:');
});
const antesCancel = ctx.listar('ATIVIDADES').length;
const rc = ctx.acaoCancelarCompetencia(adm, { competencia: compAtual, motivo: 'teste' });
console.log('  cancelamento em lote:', rc.canceladas, 'atividades');
t('cancelamento em lote gravou', () => {
  const cancel = ctx.listar('ATIVIDADES').filter(x => String(x.VALIDACAO) === 'Cancelada').length;
  eq(cancel, rc.canceladas, 'gravadas x reportadas:');
  eq(ctx.listar('ATIVIDADES').length, antesCancel, 'perdeu linhas:');
});
t('aprovada nao foi cancelada', () => {
  const a = ctx.obter('ATIVIDADES', alvo.id);
  eq(String(a.VALIDACAO), 'Aprovado', 'a aprovada mudou:');
});

console.log('\n== BI / assiduidade ==');
// folha de ponto sintetica: 4 pessoas, 20 dias
const folha = S.SpreadsheetApp.create('FOLHA RH');
const aba = folha.insertSheet('FOLHA DE PONTO');
const dias = [];
for (let d = 1; d <= 20; d++) dias.push(new Date(2026, 6, d));
aba.dados.push(['MATRICULA', 'NOME', 'T.'].concat(dias));
const pessoas = [['100001','ANA SOUZA','A'],['100002','BRUNO LIMA','A'],
                 ['100003','CARLA DIAS','B'],['100004','DANIEL ROCHA','B']];
pessoas.forEach((p, i) => {
  const linha = p.slice();
  for (let d = 0; d < 20; d++) {
    if (i === 0 && (d === 3 || d === 10)) linha.push('16');       // 2 faltas
    else if (i === 1 && d === 5) linha.push('1');                 // 1 atestado
    else if (i === 2 && (d === 2 || d === 9 || d === 14)) linha.push('16');
    else linha.push(p[2]);                                        // dia trabalhado
  }
  aba.dados.push(linha);
});
ctx.acaoSalvarArquivoRH(adm, { competencia: '2026-07', link: folha.getUrl(), aba: 'FOLHA DE PONTO', situacao: 'Aberta' });
const arqRH = ctx.listar('ARQUIVOS_RH')[0];
const imp = ctx.acaoImportarCompetencia(adm, { id: arqRH.ID });
console.log('  importados:', imp.registros, 'lancamentos |', imp.aviso || 'sem codigo pendente');

t('colaboradores gravados', () => eq(ctx.listar('COLABORADORES').length, 4, 'colaboradores:'));
t('TRABALHADOS nao e zero (o defeito do acento)', () => {
  const ana = ctx.listar('AGR_COLAB').find(a => String(a.MATRICULA) === '100001');
  if (!ana) throw new Error('AGR_COLAB sem a matricula');
  if (Number(ana.TRABALHADOS) <= 0) throw new Error('TRABALHADOS=' + ana.TRABALHADOS + ' (bug do acento nao corrigido)');
  eq(ana.TRABALHADOS, 18, 'dias trabalhados de Ana:');
  eq(ana.AUSENCIAS, 2, 'ausencias de Ana:');
  eq(ana.FALTAS, 2, 'faltas de Ana:');
});
t('assiduidade individual calculada', () => {
  const ana = ctx.listar('AGR_COLAB').find(a => String(a.MATRICULA) === '100001');
  eq(ana.ASSIDUIDADE, '90%', 'assiduidade de Ana:');
});
const painel = ctx.dadosAssiduidade(adm, { competencia: '2026-07' });
console.log('  KPIs:', JSON.stringify(painel.kpis));
console.log('  por turno:', JSON.stringify(painel.porTurno));
t('taxa por turno nao e 100%', () => {
  painel.porTurno.forEach(t2 => { if (t2.taxa >= 100) throw new Error('turno ' + t2.turno + ' com taxa ' + t2.taxa); });
});
t('categorias do periodo vem do DE-PARA', () => {
  if (!painel.categorias || !painel.categorias.length) throw new Error('sem categorias');
  ['Falta injustificada', 'Atestado'].forEach(function (c) {
    if (painel.categorias.indexOf(c) === -1) throw new Error('faltou ' + c + ': ' + painel.categorias);
  });
});
const per = ctx.acaoPeriodo(adm, { de: '2026-07-01', ate: '2026-07-31', tipo: 'Falta injustificada' });
console.log('  periodo tipo=Falta:', per.registros, 'registros /', per.colaboradores, 'pessoas');
t('filtro de periodo por categoria devolve dados', () => {
  if (per.registros !== 5) throw new Error('esperava 5 faltas, veio ' + per.registros);
});
t('filtro antigo FALTA_INJUST continua respondendo', () => {
  const p2 = ctx.acaoPeriodo(adm, { de: '2026-07-01', ate: '2026-07-31', tipo: 'FALTA_INJUST' });
  if (p2.registros !== 5) throw new Error('esperava 5, veio ' + p2.registros);
});
const col = ctx.acaoColaboradores(adm, { competencia: '2026-07', minimo: 10 });
console.log('  colaboradores:', col.lista.length, '| melhores:', col.melhores.map(x => x.nome + ' ' + x.assiduidade + '%').join(' | '));
t('aba Colaboradores carrega (era o bug da tela em branco)', () => {
  if (!col.lista.length) throw new Error('lista vazia');
  if (col.melhores[0].assiduidade <= 0) throw new Error('assiduidade zerada');
  if (!col.porTurno.length) throw new Error('sem quadro por turno');
});
t('payload do painel cabe numa celula do Sheets', () => {
  const p = ctx.listar('PAINEL')[0];
  const n = String(p.PAYLOAD).length;
  if (n > 50000) throw new Error('payload com ' + n + ' caracteres (limite 50.000)');
});
t('tendencia continua entre competencias', () => {
  if (!painel.tendencia || !painel.tendencia.serie.length) throw new Error('sem serie');
});

console.log('\n== central / apresentacao / config / acessos ==');
t('dadosInicio', () => { const c = ctx.dadosInicio(adm); if (!c.geral) throw new Error('sem geral'); });
t('dadosApresentacao', () => { const a = ctx.dadosApresentacao(adm); if (!a.porTurno) throw new Error('sem porTurno'); });
t('dadosConfig traz DE-PARA e categorias', () => {
  const c = ctx.dadosConfig(adm);
  if (!c.dePara || !c.dePara.length) throw new Error('sem dePara');
  if (!c.categorias || !c.categorias.length) throw new Error('sem categorias');
  if (c.parametros.some(p => String(p.chave).indexOf('APRESENTACAO_') === 0)) throw new Error('APRESENTACAO_ duplicado');
  if (!c.parametrosTodos.some(p => p.chave === 'GERAR_MES_NO_DIA')) throw new Error('parametrosTodos incompleto');
});
t('dadosPessoas', () => {
  const a = ctx.dadosPessoas(adm);
  if (!a.perfis.length) throw new Error('sem perfis');
  if (!a.pessoas.length) throw new Error('sem pessoas');
  if (!a.niveis.length) throw new Error('sem niveis');
});
t('pedido de acesso -> aprovacao', () => {
  const r = JSON.parse(ctx.solicitarAcesso({ email:'novo@b.com', nome:'Novo Colaborador', papel:'Conferente', turno:'A' }));
  if (!r.ok) throw new Error(r.motivo);
  const pend = ctx.dadosPessoas(adm).pedidos.filter(p => p.email === 'novo@b.com')[0];
  if (!pend) throw new Error('pedido nao entrou na fila');
  // enquanto pendente, nao entra
  const ident = JSON.parse(ctx.identificar('novo@b.com'));
  if (ident.ok) throw new Error('pendente conseguiu entrar');
  ctx.acaoAprovarAcesso(adm, { id: pend.id, perfil: 'COORDENADOR', turno: 'A' });
  ctx.definirEmailAtual('admin@bartofil.com.br');
  const depois = JSON.parse(ctx.identificar('novo@b.com'));
  if (!depois.ok) throw new Error('aprovado nao conseguiu entrar: ' + depois.motivo);
  ctx.definirEmailAtual('admin@bartofil.com.br');
});
t('email desconhecido nao vira cadastro automatico', () => {
  const r = JSON.parse(ctx.identificar('ninguem@b.com'));
  if (r.ok) throw new Error('entrou sem cadastro');
  if (!r.semCadastro) throw new Error('deveria pedir cadastro');
  if (ctx.buscarAcesso('ninguem@b.com')) throw new Error('cadastrou sozinho');
  ctx.definirEmailAtual('admin@bartofil.com.br');
});
t('carregarTela em todas as telas do admin', () => {
  ctx.telasDe(adm).forEach(tl => {
    const txt = ctx.carregarTela('admin@bartofil.com.br', tl.id, {});
    const o = JSON.parse(txt);
    if (!o.dados) throw new Error('tela ' + tl.id + ' sem dados');
  });
});
t('bootstrap', () => { const b = JSON.parse(ctx.bootstrap()); if (!b.ok) throw new Error(b.erro); });
t('identificar', () => { const b = JSON.parse(ctx.identificar('admin@bartofil.com.br')); if (!b.ok) throw new Error(b.motivo); });
t('DE-PARA editavel pela tela', () => {
  const novo = ctx.acaoSalvarDePara(adm, { codigo: '99', descricao: 'Teste', categoria: 'Falta', ausencia: true });
  if (!novo.id) throw new Error('nao criou');
  ctx.acaoExcluirDePara(adm, { id: novo.id });
});
t('codigosPendentes responde', () => {
  const l = ctx.acaoCodigosPendentes(adm, {});
  if (!Array.isArray(l)) throw new Error('nao e lista');
});
t('a ficha traz o que a tela nova desenha', () => {
  const mat = ctx.listar('AGR_COLAB')[0].MATRICULA;
  const f = ctx.acaoFichaColaborador(adm, { matricula: String(mat) });
  if (!f.historico.length) throw new Error('sem historico');
  const h = f.historico[0];
  ['registros','trabalhados','ausencias','ferias','folgas','licencas','outros',
   'faltasInjustificadas','faltasJustificadas','faltasDisciplinares','atestados']
   .forEach(function (c) { if (h[c] === undefined) throw new Error('falta o campo ' + c); });
  // a barra de composicao tem que fechar com os dias lancados
  const soma = h.trabalhados + h.ausencias + h.ferias + h.folgas + h.licencas + h.outros;
  if (soma !== h.registros) throw new Error('a barra nao fecha: ' + soma + ' != ' + h.registros);
  if (f.meta === undefined) throw new Error('sem meta');
  if (!Array.isArray(f.porCategoria)) throw new Error('sem porCategoria');
});
t('anexo: URL e ID viram o mesmo link', () => {
  eq(ctx.idsDeAnexos('https://drive.google.com/file/d/ABCDEFGHIJKLMNOPQRSTUV/view').length, 1, 'url->id:');
  eq(ctx.idsDeAnexos('ABC,DEF').length, 2, 'ids:');
  if (ctx.urlDeAnexo('ABCDEFGHIJKLMNOPQRSTUV').indexOf('https://') !== 0) throw new Error('url invalida');
});
t('diagnostico() roda', () => { ctx.diagnostico(); });
t('gerarMesSeNecessario roda', () => { ctx.gerarMesSeNecessario(); });
t('digestoMatinal roda', () => { ctx.digestoMatinal(); });
t('nenhum vermelho nos e-mails', () => {
  const txt = JSON.stringify(S.MAILS);
  if (/#D71920|#DC2626|#991B1B|#FDE8E8/i.test(txt)) throw new Error('vermelho no e-mail');
});

console.log('\n================ RESULTADO ================');
ok.forEach(n => console.log('  OK   ' + n));
erros.forEach(n => console.log('  FALHA ' + n));
console.log('\n' + ok.length + ' passaram, ' + erros.length + ' falharam');
process.exit(erros.length ? 1 : 0);
