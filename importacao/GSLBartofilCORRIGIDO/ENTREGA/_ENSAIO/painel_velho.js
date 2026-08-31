/* Painel gravado por versao anterior deve ser refeito sozinho. */
const fs=require('fs'),path=require('path'),vm=require('vm');const S=require('./stubs.js');
const DIR=path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx;vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));
ctx.instalar('admin@bartofil.com.br'); ctx.definirEmailAtual('admin@bartofil.com.br');
const adm=ctx.usuarioAtual();
const M=JSON.parse(fs.readFileSync(path.join(__dirname,'folha_real.json'),'utf8')).map(l=>l.map(v=>(v&&v.__data)?new Date(v.__data+'T12:00:00Z'):v));
const folha=S.SpreadsheetApp.create('P');const aba=folha.insertSheet('FOLHA DE PONTO');aba.dados=M;
ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:folha.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
ctx.importarArquivoRH_(ctx.listar('ARQUIVOS_RH')[0],'admin@bartofil.com.br');

/* simula o painel da versao anterior: sem versao, sem registros no turno,
   com "A CONFIRMAR" entre as categorias — exatamente o que a tela mostrava */
const linha=ctx.listar('PAINEL')[0];
const velho={ kpis:{colaboradores:351,taxa:4.2,meta:5,acimaDaMeta:false,faltas:28,atestados:180},
  porTurno:[{turno:'A',taxa:4.9,pessoas:undefined,celulas:0}],
  porCategoria:[{categoria:'Presenca',total:4121},{categoria:'A CONFIRMAR',total:530}],
  diaADia:[],porDiaSemana:[],codigosTop:[],colaboradores:[] };
ctx.atualizar('PAINEL',linha.ID,{PAYLOAD:JSON.stringify(velho)},'teste');
ctx.limparCache();
console.log('painel substituido pelo formato antigo (351 / 4.2% / 28 faltas / A CONFIRMAR 530)');

const d=ctx.dadosAssiduidade(adm,{competencia:'2026-08'});
const ok=[],err=[];
const t=(n,f)=>{try{f();ok.push(n)}catch(e){err.push(n+' -> '+(e.message||e))}};
console.log('depois de abrir a tela:', d.kpis.colaboradores, 'colaboradores,', d.kpis.taxa+'%,',
            d.kpis.faltasInjustificadas, 'faltas injustificadas');
t('o painel velho foi refeito sozinho',()=>{
  if(d.kpis.colaboradores!==341) throw new Error('colaboradores='+d.kpis.colaboradores);
  if(d.kpis.faltasInjustificadas!==21) throw new Error('faltas inj='+d.kpis.faltasInjustificadas);
});
t('as barras de turno voltaram a ter dias lancados',()=>{
  const a=d.porTurno.filter(x=>x.turno==='A')[0];
  if(!a||!a.registros) throw new Error('sem registros no turno A');
});
t('"A CONFIRMAR" saiu do grafico de categorias',()=>{
  if(d.porCategoria.some(c=>/CONFIRMAR/i.test(c.categoria))) throw new Error('ainda esta la');
});
t('o carimbo de versao ficou gravado',()=>{
  const p=JSON.parse(ctx.listar('PAINEL')[0].PAYLOAD);
  if(!p.versao) throw new Error('sem versao');
});
console.log();ok.forEach(n=>console.log('  OK   '+n));err.forEach(n=>console.log('  FALHA '+n));
console.log('\n'+ok.length+' passaram, '+err.length+' falharam');
process.exit(err.length?1:0);
