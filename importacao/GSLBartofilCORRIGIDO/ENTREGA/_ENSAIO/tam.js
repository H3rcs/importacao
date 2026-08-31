const fs=require('fs'),path=require('path'),vm=require('vm');const S=require('./stubs.js');
const DIR=path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx;vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs','Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));
ctx.instalar('admin@bartofil.com.br'); ctx.definirEmailAtual('admin@bartofil.com.br');
const adm=ctx.usuarioAtual();
const M=JSON.parse(fs.readFileSync(path.join(__dirname,'folha_real.json'),'utf8')).map(l=>l.map(v=>(v&&v.__data)?new Date(v.__data+'T12:00:00Z'):v));
const folha=S.SpreadsheetApp.create('P');const aba=folha.insertSheet('FOLHA DE PONTO');aba.dados=M;
ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:folha.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
ctx.acaoImportarCompetencia(adm,{id:ctx.listar('ARQUIVOS_RH')[0].ID});
const p=ctx.listar('PAINEL')[0];
const s=String(p.PAYLOAD);
console.log('TAMANHO DO PAYLOAD DO PAINEL:', s.length.toLocaleString('pt-BR'), 'caracteres');
console.log('LIMITE DE UMA CELULA DO GOOGLE SHEETS: 50.000');
console.log(s.length>50000 ? '  *** ESTOURA O LIMITE ***' : '  cabe');
const o=JSON.parse(s);
Object.keys(o).forEach(k=>{
  const t=JSON.stringify(o[k]).length;
  console.log(`  ${k.padEnd(16)} ${String(t).padStart(7)} car.  ${Array.isArray(o[k])?o[k].length+' itens':''}`);
});
console.log('\nFATO_ASSIDUIDADE: tipo da coluna DATA ->', typeof ctx.listar('FATO_ASSIDUIDADE')[0].DATA, JSON.stringify(ctx.listar('FATO_ASSIDUIDADE')[0].DATA));
console.log('cacheavel entre execucoes?', ctx.semObjetos(ctx.listar('FATO_ASSIDUIDADE')));
