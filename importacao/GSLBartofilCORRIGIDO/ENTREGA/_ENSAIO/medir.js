/* Mede chamadas a servicos do Google em cenarios identicos. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('./stubs.js');
const DIR = process.argv[2];
const ctx = Object.assign({ console, JSON, Math, Date, String, Number, Boolean, Object, Array,
  Error, RegExp, isNaN, parseInt, parseFloat, Set, Map, Buffer }, S);
ctx.globalThis = ctx; vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f }));

const linhas = [];
function medir(nome, fn) {
  S.zerar();
  try { fn(); } catch (e) { /* segue: o que interessa e a contagem */ }
  const c = S.CHAMADAS;
  linhas.push([nome, c.leitura, c.escrita, c.props, c.trava, c.abrir + c.gatilhos,
               c.leitura + c.escrita + c.props + c.trava + c.abrir + c.gatilhos]);
}

medir('INSTALAR (criar banco + sementes)', () => ctx.instalar('admin@bartofil.com.br'));

ctx.definirEmailAtual('admin@bartofil.com.br');
const adm = ctx.usuarioAtual();
[['Coordenador · Turno A','Ana','ana@b.com','A'],['Coordenador · Turno B','Bruno','bruno@b.com','B'],
 ['Coordenador · Turno C','Caio','caio@b.com','C'],['Gerente','Gina','gina@b.com','']]
 .forEach(p => ctx.acaoSalvarPessoa(adm, { papel:p[0], nome:p[1], email:p[2], turno:p[3], ativo:true }));
const comp = ctx.competenciaDe(ctx.hoje());
medir('GERAR MES (rotinas -> atividades)', () => ctx.gerarCompetencia(comp, 'admin@bartofil.com.br'));

ctx.esquecerLeituras();
medir('ABRIR CALENDARIO (sem cache de tela)', () => { ctx.esquecerLeituras(); ctx.dadosCalendario(adm, {}); });
medir('ABRIR CENTRAL (sem cache de tela)', () => { ctx.esquecerLeituras(); ctx.dadosInicio(adm); });

const umaAtiv = ctx.listar('ATIVIDADES').filter(a => String(a.TIPO) !== 'TRE')[0];
medir('VALIDAR uma atividade (acao + e-mail)', () => {
  ctx.esquecerLeituras();
  ctx.acaoValidar(adm, { id: umaAtiv.ID, validacao: 'Aprovado', motivo: 'ok' });
});

medir('ENCERRAR O MES (cancelar todas as pendentes)', () => {
  ctx.esquecerLeituras();
  ctx.acaoCancelarCompetencia(adm, { competencia: comp, motivo: 'teste' });
});

// folha de ponto: 60 pessoas x 20 dias
const folha = S.SpreadsheetApp.create('FOLHA');
const aba = folha.insertSheet('FOLHA DE PONTO');
const dias = []; for (let d = 1; d <= 20; d++) dias.push(new Date(2026, 6, d));
aba.dados.push(['MATRICULA', 'NOME', 'T.'].concat(dias));
for (let i = 0; i < 60; i++) {
  const mat = String(200000 + i), turno = ['A','B','C'][i % 3];
  const linha = [mat, 'PESSOA ' + i, turno];
  for (let d = 0; d < 20; d++) linha.push((d === (i % 20)) ? '16' : turno);
  aba.dados.push(linha);
}
ctx.acaoSalvarArquivoRH(adm, { competencia: '2026-07', link: folha.getUrl(), aba: 'FOLHA DE PONTO', situacao: 'Aberta' });
const arq = ctx.listar('ARQUIVOS_RH')[0];
medir('IMPORTAR FOLHA (60 colaboradores, 1200 lancamentos)', () => {
  ctx.esquecerLeituras();
  ctx.acaoImportarCompetencia(adm, { id: arq.ID });
});
medir('ABRIR ASSIDUIDADE (painel gravado)', () => { ctx.esquecerLeituras(); ctx.dadosAssiduidade(adm, { competencia: '2026-07' }); });
medir('ABRIR CONFIGURACAO', () => { ctx.esquecerLeituras(); ctx.dadosConfig(adm); });

/* O efeito da geracao por tabela: gravar algo pequeno e, logo depois,
   abrir uma tela que depende da tabela grande. Antes, a gravacao do setor
   aposentava o cache de FATO_ASSIDUIDADE junto. */
medir('SALVAR UM SETOR e reabrir o BI (5 mil linhas em cache)', () => {
  ctx.esquecerLeituras();
  ctx.acaoSalvarSetor(adm, { setor: 'Setor de teste', ativo: true });
  ctx.esquecerLeituras();
  ctx.dadosAnalise(adm, { meses: 12 });
});

console.log(JSON.stringify(linhas));
