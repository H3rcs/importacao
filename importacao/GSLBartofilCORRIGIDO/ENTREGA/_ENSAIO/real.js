/* Roda o ETL de verdade contra a FOLHA DE PONTO real e compara com os
   numeros da GSL-DADOS em producao (competencia 2026-08). */
const fs=require('fs'), path=require('path'), vm=require('vm');
const S=require('./stubs.js');
const DIR=process.argv[2]||path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,
  isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx; vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));

// instala
try { ctx.instalar('admin@bartofil.com.br'); }
catch(e){ ctx.esquecerProps(); ctx.semearPerfis(); ctx.semearRotinas(); ctx.semearParametros();
  ctx.semearSetores(); ctx.semearDePara();
  ctx.inserir('ACESSOS',{EMAIL:'admin@bartofil.com.br',NOME:'admin',PERFIL:'ADMIN',ATIVO:'SIM'},'sistema'); }
ctx.definirEmailAtual('admin@bartofil.com.br');
const adm=ctx.usuarioAtual();

// carrega a folha real
const M=JSON.parse(fs.readFileSync(path.join(__dirname,'folha_real.json'),'utf8'))
  .map(l=>l.map(v=>(v&&v.__data)?new Date(v.__data+'T12:00:00Z'):v));
const folha=S.SpreadsheetApp.create('CONTROLE DE PONTO CD AGOSTO 2026');
const aba=folha.insertSheet('FOLHA DE PONTO');
aba.dados=M;

ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:folha.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
const arq=ctx.listar('ARQUIVOS_RH')[0];

console.log('=== PRE-VISUALIZACAO ===');
const prev=ctx.acaoPreviewImportacao(adm,{id:arq.ID});
console.log('  linha do cabecalho:', prev.linhaCabecalho, '| colunas de data:', prev.colunasData);
console.log('  registros:', prev.registros, '| pessoas:', prev.pessoas);
console.log('  periodo:', prev.primeiraData, 'a', prev.ultimaData);
prev.avisos.forEach(a=>console.log('  AVISO:', a));
prev.erros.forEach(a=>console.log('  ERRO:', a));
console.log('  por turno:', prev.porTurno.map(t=>t.turno+':'+t.pessoas).join(' '));
console.log('  codigos pendentes:', prev.codigosPendentes.length ?
  prev.codigosPendentes.map(c=>c.codigo+'('+c.vezes+')').join(' ') : 'nenhum');

console.log('\n=== IMPORTACAO ===');
const imp=ctx.acaoImportarCompetencia(adm,{id:arq.ID});
console.log(' ', imp.registros, 'lancamentos |', imp.aviso||'sem codigo pendente');

const painel=ctx.dadosAssiduidade(adm,{competencia:'2026-08'});
const k=painel.kpis;

// ---- numeros de referencia, lidos da GSL-DADOS do usuario ----
const ESPERADO={colaboradores:341,registros:4846,ausencias:214,taxa:4.4,
  faltasInjustificadas:21,faltasJustificadas:7,faltasDisciplinares:6,faltas:34,
  atestados:180,ferias:365,pessoasEmFerias:25,comAusencia:59};
const TURNO_ESPERADO={
  ADM:{pessoas:40,registros:538,presencas:473,ausencias:3,faltasInjustificadas:0,atestados:3},
  A:  {pessoas:104,registros:1610,presencas:1415,ausencias:83,faltasInjustificadas:4,atestados:77},
  B:  {pessoas:113,registros:1519,presencas:1294,ausencias:77,faltasInjustificadas:6,atestados:67}};

console.log('\n=== KPIs · calculado x GSL-DADOS ===');
let ok=0,dif=0;
Object.keys(ESPERADO).forEach(campo=>{
  const meu=k[campo], esp=ESPERADO[campo];
  const bate = (campo==='taxa') ? Math.abs(meu-esp)<0.15 : meu===esp;
  if(bate) ok++; else dif++;
  console.log(`  ${bate?'OK  ':'DIF '} ${campo.padEnd(24)} calculado=${String(meu).padStart(6)}   planilha=${String(esp).padStart(6)}`);
});

console.log('\n=== POR TURNO · calculado x GSL-DADOS ===');
console.log('  turno  pessoas      registros     presencas     ausencias    f.injust.     atestados');
Object.keys(TURNO_ESPERADO).forEach(t=>{
  const meu=painel.porTurno.find(x=>x.turno===t)||{}, esp=TURNO_ESPERADO[t];
  const par=(a,b)=>{const b2=(a===b); if(b2)ok++;else dif++; return `${String(a).padStart(5)}/${String(b).padEnd(5)}${b2?' ':'!'}`;};
  console.log(`  ${t.padEnd(6)} ${par(meu.pessoas,esp.pessoas)} ${par(meu.registros,esp.registros)} ${par(meu.presencas,esp.presencas)} ${par(meu.ausencias,esp.ausencias)} ${par(meu.faltasInjustificadas,esp.faltasInjustificadas)} ${par(meu.atestados,esp.atestados)}`);
});

console.log('\n=== COLABORADORES ===');
console.log('  na tabela COLABORADORES:', ctx.listar('COLABORADORES').length, '(planilha do usuario: 357)');
console.log('  no AGR_COLAB:', ctx.listar('AGR_COLAB').length, '(planilha do usuario: 341)');
['21000056','21000703','21000665','21000781','21000252'].forEach(m=>{
  const c=ctx.listar('COLABORADORES').filter(x=>String(x.MATRICULA)===m)[0];
  console.log('  ' + m + ':', c?('PRESENTE — '+String(c.NOME).trim()):'*** PERDIDO ***');
});

console.log('\n=== AMOSTRA DE ASSIDUIDADE (conferir contra AGR_COLAB da planilha) ===');
[['21000018','MARVILIN',13,12,0,100],['21000024','ALBERTO',13,13,0,100],
 ['21000053','WELLISON',15,14,1,93.3],['21000035','FABIO',29,11,0,100]]
 .forEach(([mat,nome,reg,trab,aus,assid])=>{
  const a=ctx.listar('AGR_COLAB').filter(x=>String(x.MATRICULA)===mat)[0];
  if(!a){console.log('  '+mat+' AUSENTE');dif++;return;}
  const b = Number(a.REGISTROS)===reg && Number(a.TRABALHADOS)===trab &&
            Number(a.AUSENCIAS)===aus && Math.abs(parseFloat(a.ASSIDUIDADE)-assid)<0.2;
  if(b)ok++;else dif++;
  console.log(`  ${b?'OK  ':'DIF '} ${mat} ${nome.padEnd(9)} reg=${a.REGISTROS}/${reg} trab=${a.TRABALHADOS}/${trab} aus=${a.AUSENCIAS}/${aus} assid=${a.ASSIDUIDADE}/${assid}%`);
});

console.log('\n' + ok + ' conferem, ' + dif + ' divergem');

console.log('\n=== FILTRO DE PERIODO (folha real) ===');
[['TODAS','todas as ausencias'],['Falta injustificada','codigo 16'],
 ['Falta justificada','codigo 28'],['Falta disciplinar','codigo 18'],
 ['Atestado','codigos 1, 21 e 130'],['Licença legal','licencas']].forEach(([tp,desc])=>{
  const r=ctx.acaoPeriodo(adm,{de:'2026-07-21',ate:'2026-08-20',tipo:tp});
  console.log(`  ${tp.padEnd(22)} ${String(r.registros).padStart(4)} registros / ${String(r.colaboradores).padStart(3)} pessoas   (${desc})`);
});
console.log('\n  categorias oferecidas no seletor:', painel.categorias.join(' · '));
