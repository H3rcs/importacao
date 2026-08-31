/* Banco como a versao anterior deixaria: EQUIPE e ACESSOS separados,
   com a mesma pessoa em niveis diferentes. Confere a migracao. */
const fs=require('fs'),path=require('path'),vm=require('vm');const S=require('./stubs.js');
const DIR=path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx;vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));
ctx.instalar('admin@bartofil.com.br');

// --- desfaz a migracao e recria o cenario antigo ---
S._sp.deleteProperty('EQUIPE_MIGRADA');
ctx.esquecerProps();
ctx.inserirVarios('EQUIPE',[
  {PAPEL:'Coordenador · Turno A',NOME:'Ana Souza',EMAIL:'ana@b.com',TURNO:'A',ATIVO:'SIM'},
  {PAPEL:'Coordenador · Turno B',NOME:'Bruno Lima',EMAIL:'bruno@b.com',TURNO:'B',ATIVO:'SIM'},
  {PAPEL:'Gerente',NOME:'Gina Dias',EMAIL:'gina@b.com',TURNO:'',ATIVO:'SIM'},
],'antigo');
// a mesma Ana ja existia em ACESSOS, com nivel divergente e sem papel/turno
ctx.inserirVarios('ACESSOS',[
  {EMAIL:'ana@b.com',NOME:'',PERFIL:'COORDENADOR',TURNO:'',ATIVO:'SIM'},
],'antigo');
ctx.limparCache();
console.log('cenario antigo: EQUIPE com', ctx.listar('EQUIPE').length,
            'pessoas, ACESSOS com', ctx.listar('ACESSOS').length);

const mexeu = ctx.migrarEquipeParaAcessos();
ctx.limparCache();
const pessoas = ctx.listarPessoas();
console.log('migrou?', mexeu, '| ACESSOS agora com', pessoas.length, 'pessoas');
pessoas.forEach(p => console.log(`  ${p.email.padEnd(22)} nome=${(p.nome||'—').padEnd(12)} papel=${(p.papel||'—').padEnd(22)} turno=${(p.turno||'—').padEnd(4)} nivel=${p.perfil.padEnd(12)} ${p.situacao}`));

const ok=[],err=[];
const t=(n,f)=>{try{f();ok.push(n)}catch(e){err.push(n+' -> '+(e.message||e))}};
t('ninguem se perdeu', ()=>{ if(pessoas.length!==4) throw new Error(pessoas.length+' pessoas, esperava 4'); });
t('Ana ganhou papel e turno sem perder o nivel', ()=>{
  const a=pessoas.filter(p=>p.email==='ana@b.com')[0];
  if(!a) throw new Error('sumiu');
  if(a.turno!=='A') throw new Error('turno='+a.turno);
  if(a.perfil!=='COORDENADOR') throw new Error('nivel='+a.perfil);
  if(!a.papel) throw new Error('sem papel');
  if(!a.nome) throw new Error('sem nome');
});
t('quem so estava na EQUIPE entra como PENDENTE', ()=>{
  const g=pessoas.filter(p=>p.email==='gina@b.com')[0];
  if(!g) throw new Error('sumiu');
  if(g.situacao!=='PENDENTE') throw new Error('situacao='+g.situacao);
});
t('a EQUIPE continua intacta no banco', ()=>{
  if(ctx.listar('EQUIPE').length!==3) throw new Error('a aba EQUIPE foi mexida');
});
t('coordenador do turno sai de ACESSOS', ()=>{
  ctx.esquecerLeituras();
  const m=ctx.coordenadoresPorTurno();
  if(!m.A || m.A.email!=='ana@b.com') throw new Error(JSON.stringify(m));
});
t('migracao nao roda duas vezes', ()=>{
  if(ctx.migrarEquipeParaAcessos()!==false) throw new Error('rodou de novo');
});
console.log();
ok.forEach(n=>console.log('  OK   '+n)); err.forEach(n=>console.log('  FALHA '+n));
console.log('\n'+ok.length+' passaram, '+err.length+' falharam');
process.exit(err.length?1:0);
