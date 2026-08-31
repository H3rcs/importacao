/* A folha do RH passou a trazer o NUMERO DO DIA no cabecalho, com o dia
   da semana na linha de cima. Este roteiro converte a folha real para
   esse formato e confere que a leitura chega nos MESMOS numeros. */
const fs=require('fs'),path=require('path'),vm=require('vm');const S=require('./stubs.js');
const DIR=path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx;vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));
ctx.instalar('admin@bartofil.com.br'); ctx.definirEmailAtual('admin@bartofil.com.br');
const adm=ctx.usuarioAtual();

const M=JSON.parse(fs.readFileSync(path.join(__dirname,'folha_real.json'),'utf8'))
  .map(l=>l.map(v=>(v&&v.__data)?new Date(v.__data+'T12:00:00Z'):v));

/* converte o cabecalho: data -> numero do dia (como a planilha nova) */
const cab=15;                      // linha 16 (0-based)
let convertidas=0;
M[cab]=M[cab].map(v=>{
  if(v instanceof Date){ convertidas++; return v.getUTCDate(); }
  return v;
});
console.log('cabecalho convertido:', convertidas, 'datas viraram numero do dia');
console.log('amostra:', M[cab].slice(3,12).join(' '));
// confere que DATA INICIAL continua na folha
let achou=null;
for(let r=0;r<20;r++) for(let c=0;c<8;c++){
  const v=M[r] && M[r][c];
  if(v && String(v).toUpperCase().indexOf('DATA INICIAL')>=0) achou=M[r][c+1];
}
console.log('DATA INICIAL na folha:', achou instanceof Date ? achou.toISOString().slice(0,10) : achou);

const folha=S.SpreadsheetApp.create('PONTO NOVO FORMATO');
const aba=folha.insertSheet('FOLHA DE PONTO'); aba.dados=M;
ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:folha.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
const arq=ctx.listar('ARQUIVOS_RH')[0];

console.log('\n--- PRE-VISUALIZACAO ---');
const prev=ctx.acaoPreviewImportacao(adm,{id:arq.ID});
prev.erros.forEach(e=>console.log('  ERRO:',e));
prev.avisos.forEach(a=>console.log('  AVISO:',a));
console.log('  colunas de dia:',prev.colunasData,'| periodo:',prev.primeiraData,'a',prev.ultimaData);
console.log('  registros:',prev.registros,'| pessoas:',prev.pessoas);

console.log('\n--- IMPORTACAO ---');
const imp=ctx.importarArquivoRH_(arq,'admin@bartofil.com.br');
console.log(' ',imp.registros,'lancamentos |',imp.aviso||'sem codigo fora da legenda');
const k=ctx.dadosAssiduidade(adm,{competencia:'2026-08'}).kpis;

const ESP={colaboradores:341,registros:4846,ausencias:214,faltasInjustificadas:21,
  faltasJustificadas:7,faltasDisciplinares:6,atestados:180,ferias:365};
let ok=0,dif=0;
console.log('\n--- CONFERENCIA (mesmos numeros da GSL-DADOS) ---');
Object.keys(ESP).forEach(c=>{const b=k[c]===ESP[c]; b?ok++:dif++;
  console.log(`  ${b?'OK  ':'DIF '} ${c.padEnd(22)} ${String(k[c]).padStart(6)} / ${ESP[c]}`);});

/* o periodo tambem tem que funcionar */
const per=ctx.acaoPeriodo(adm,{de:'2026-07-21',ate:'2026-08-20',tipo:'TODAS'});
console.log('\n  periodo 21/07 a 20/08:',per.registros,'ausencias');
if(per.registros===214) ok++; else { dif++; console.log('  DIF periodo'); }

console.log('\n'+ok+' conferem, '+dif+' divergem');
process.exit(dif?1:0);
