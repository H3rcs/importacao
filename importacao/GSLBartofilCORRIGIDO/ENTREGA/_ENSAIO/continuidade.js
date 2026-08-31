/* Duas competencias, cada uma numa planilha propria (como o RH entrega).
   Confere que a consulta por periodo atravessa as duas sem buraco. */
const fs=require('fs'),path=require('path'),vm=require('vm');const S=require('./stubs.js');
const DIR=path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx;vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));
ctx.instalar('admin@bartofil.com.br'); ctx.definirEmailAtual('admin@bartofil.com.br');
const adm=ctx.usuarioAtual();

/* Monta uma folha do RH: 6 pessoas, um intervalo de datas, com faltas. */
function folha(nome, ini, dias, faltasEm) {
  const f=S.SpreadsheetApp.create(nome); const aba=f.insertSheet('FOLHA DE PONTO');
  const datas=[]; for(let d=0;d<dias;d++){const x=new Date(ini); x.setUTCDate(x.getUTCDate()+d); datas.push(x);}
  aba.dados.push(['T.','Matrícula','NOME'].concat(datas));
  for(let i=0;i<6;i++){
    const turno=['A','B','C'][i%3];
    const l=[turno, String(300000+i), 'PESSOA '+i];
    for(let d=0;d<dias;d++) l.push(faltasEm.indexOf(d)>=0 && i===0 ? '16' : turno);
    aba.dados.push(l);
  }
  return f;
}
const jun = folha('RH JUL', new Date(Date.UTC(2026,5,21)), 30, [3, 10]);   // 21/06 a 20/07
const jul = folha('RH AGO', new Date(Date.UTC(2026,6,21)), 31, [5, 12]);   // 21/07 a 20/08

ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-07',link:jun.getUrl(),aba:'FOLHA DE PONTO',situacao:'Fechada'});
ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:jul.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
ctx.listar('ARQUIVOS_RH').forEach(a=>ctx.importarArquivoRH_(a,'admin@bartofil.com.br'));

const ok=[],err=[];
const t=(n,f)=>{try{f();ok.push(n)}catch(e){err.push(n+' -> '+(e.message||e))}};

console.log('duas competencias importadas:',
  ctx.listar('ARQUIVOS_RH').map(a=>a.COMPETENCIA).join(' e '));
console.log('FATO:', ctx.listar('FATO_ASSIDUIDADE').length, 'lancamentos');

// --- periodo que ATRAVESSA as duas competencias ---
const p = ctx.acaoPeriodo(adm,{de:'2026-06-21',ate:'2026-08-20',tipo:'TODAS'});
console.log('\nperiodo 21/06 a 20/08:', p.registros, 'ausencias em', p.colaboradores, 'pessoa(s)');
console.log('  por competencia:', p.porCompetencia.map(c=>c.competencia+'='+c.total).join(' · '));
console.log('  linha do tempo:', p.linhaDoTempo.length, 'dias, com', p.linhaDoTempo.filter(x=>x.total).length, 'dias com ausencia');

t('periodo cruza as duas competencias', ()=>{
  if(p.porCompetencia.length!==2) throw new Error('viu '+p.porCompetencia.length+' competencia(s), esperava 2');
});
t('total = soma das duas', ()=>{
  const soma=p.porCompetencia.reduce((n,c)=>n+c.total,0);
  if(soma!==p.registros) throw new Error(soma+' != '+p.registros);
  if(p.registros!==4) throw new Error('esperava 4 faltas no total, veio '+p.registros);
});
t('linha do tempo continua, sem buraco na virada', ()=>{
  if(p.linhaDoTempo.length!==61) throw new Error('esperava 61 dias, veio '+p.linhaDoTempo.length);
  const isos=p.linhaDoTempo.map(x=>x.data);
  if(isos[0]!=='2026-06-21') throw new Error('comeca em '+isos[0]);
  if(isos[isos.length-1]!=='2026-08-20') throw new Error('termina em '+isos[isos.length-1]);
  // a virada 20/07 -> 21/07 tem que existir e ser consecutiva
  const i=isos.indexOf('2026-07-20');
  if(i<0 || isos[i+1]!=='2026-07-21') throw new Error('buraco na virada da competencia');
});
t('filtro por turno funciona', ()=>{
  const a=ctx.acaoPeriodo(adm,{de:'2026-06-21',ate:'2026-08-20',tipo:'TODAS',turno:'A'});
  const b=ctx.acaoPeriodo(adm,{de:'2026-06-21',ate:'2026-08-20',tipo:'TODAS',turno:'B'});
  if(a.registros!==4) throw new Error('turno A: '+a.registros);
  if(b.registros!==0) throw new Error('turno B deveria ser 0, veio '+b.registros);
});
t('tendencia continua tem as duas competencias', ()=>{
  const painel=ctx.dadosAssiduidade(adm,{competencia:'2026-08'});
  if(!painel.tendencia || painel.tendencia.serie.length!==2)
    throw new Error('serie com '+(painel.tendencia?painel.tendencia.serie.length:0)+' ponto(s)');
});
t('ficha do colaborador atravessa as competencias', ()=>{
  const f=ctx.acaoFichaColaborador(adm,{matricula:'300000'});
  if(f.historico.length!==2) throw new Error('historico com '+f.historico.length+' mes(es)');
  if(f.ausencias.length!==4) throw new Error('ausencias: '+f.ausencias.length);
});
t('atualizacao diaria so relê a competencia ABERTA', ()=>{
  const r=ctx.atualizarCompetenciaAberta();
  if(!r.ok) throw new Error(JSON.stringify(r.erros));
  const comps=r.feitas.map(f=>f.competencia);
  if(comps.length!==1 || comps[0]!=='2026-08')
    throw new Error('releu '+JSON.stringify(comps));
});
console.log();
ok.forEach(n=>console.log('  OK   '+n));
err.forEach(n=>console.log('  FALHA '+n));
console.log('\n'+ok.length+' passaram, '+err.length+' falharam');
process.exit(err.length?1:0);
