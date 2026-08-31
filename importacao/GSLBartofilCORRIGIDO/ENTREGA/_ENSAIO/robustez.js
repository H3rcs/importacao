/* Testa o que a rodada 4 conserta: filtros fixos, importacao que nao
   destroi a base quando falha, erro que aparece, e o diagnostico. */
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
const folha=S.SpreadsheetApp.create('PONTO');const aba=folha.insertSheet('FOLHA DE PONTO');aba.dados=M;
ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:folha.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
const arq=ctx.listar('ARQUIVOS_RH')[0];
ctx.importarArquivoRH_(arq,'admin@bartofil.com.br');

const ok=[],err=[];
const t=(n,f)=>{try{f();ok.push(n)}catch(e){err.push(n+' -> '+(e.message||e))}};
const eq=(a,b,m)=>{if(String(a)!==String(b))throw new Error((m||'')+' esperado '+b+', veio '+a)};

console.log('base importada:', ctx.listar('FATO_ASSIDUIDADE').length, 'lancamentos');

/* ---- 1 · os sete filtros fixos ---- */
const painel=ctx.dadosAssiduidade(adm,{competencia:'2026-08'});
console.log('\nTIPOS OFERECIDOS NO SELETOR:');
painel.tipos.forEach(x=>console.log('  '+x.id.padEnd(14)+x.nome));
t('sao exatamente os sete pedidos', ()=>{
  const esperado=['Todas as ausências','Falta injustificada','Falta justificada',
                  'Falta disciplinar','Atestado','Licença legal','Outros'];
  const veio=painel.tipos.map(x=>x.nome);
  eq(veio.join('|'), esperado.join('|'), 'lista de tipos:');
});

console.log('\nCONSULTA POR TIPO (21/07 a 20/08):');
const res={};
painel.tipos.forEach(tp=>{
  const r=ctx.acaoPeriodo(adm,{de:'2026-07-21',ate:'2026-08-20',tipo:tp.id});
  res[tp.id]=r.registros;
  console.log(`  ${tp.nome.padEnd(22)} ${String(r.registros).padStart(4)} registros`);
});
t('as partes somam o todo', ()=>{
  const soma=res.FALTA_INJUST+res.FALTA_JUST+res.FALTA_DISC+res.ATESTADO+res.LICENCA+res.OUTROS;
  eq(soma, res.TODAS, 'soma das partes x total:');
});
t('faltas batem com a GSL-DADOS', ()=>{
  eq(res.FALTA_INJUST,21,'injustificadas:'); eq(res.FALTA_JUST,7,'justificadas:');
  eq(res.FALTA_DISC,6,'disciplinares:'); eq(res.ATESTADO,180,'atestados:');
});
t('"Outros" nao engole nem duplica', ()=>{
  if(res.OUTROS<0) throw new Error('negativo');
  if(res.OUTROS>res.TODAS) throw new Error('maior que o total');
});

/* ---- 2 · consulta vazia explica o motivo ---- */
const vazio=ctx.acaoPeriodo(adm,{de:'2020-01-01',ate:'2020-01-31',tipo:'TODAS'});
console.log('\nCONSULTA FORA DO INTERVALO (jan/2020):', vazio.registros, 'registros');
t('consulta vazia diz por que', ()=>{
  if(!vazio.porque) throw new Error('sem explicacao');
  if(!vazio.porque.tudoForaDoIntervalo) throw new Error('deveria dizer "tudo fora do intervalo"');
  if(vazio.porque.linhasNaBase!==4846) throw new Error('linhasNaBase='+vazio.porque.linhasNaBase);
});

/* ---- 3 · diagnostico da base ---- */
const diag=ctx.acaoDiagnosticoRH(adm);
console.log('\nDIAGNOSTICO: '+diag.totalLinhas+' linhas, periodo '+diag.intervalo.de+' a '+diag.intervalo.ate);
diag.arquivos.forEach(a=>console.log(`  ${a.competencia} ${a.situacao.padEnd(8)} declarado=${a.linhasDeclaradas} naBase=${a.linhasNaBase}`));
t('diagnostico bate com a base', ()=>{
  eq(diag.totalLinhas,4846,'total:'); eq(diag.semDataValida,0,'datas ilegiveis:');
  eq(diag.arquivos[0].linhasDeclaradas,diag.arquivos[0].linhasNaBase,'declarado x base:');
});

/* ---- 4 · importacao que falha NAO destroi a base ---- */
const antes=ctx.listar('FATO_ASSIDUIDADE').length;
aba.dados=[['T.','Matrícula','NOME']];   // folha vira lixo: sem datas, sem gente
let erroSubiu=false;
const r=ctx.atualizarCompetenciaAberta();
console.log('\nIMPORTACAO COM A FOLHA QUEBRADA:');
console.log('  ok?', r.ok, '| erros:', r.erros.map(e=>e.erro.slice(0,60)).join(' | '));
ctx.esquecerLeituras();
const depois=ctx.listar('FATO_ASSIDUIDADE').length;
console.log('  base antes:', antes, '-> depois:', depois);
t('a falha NAO esvazia a base', ()=>{ eq(depois, antes, 'linhas na base:'); });
t('a falha e reportada, nao engolida', ()=>{
  if(r.ok) throw new Error('devolveu ok com a folha quebrada');
  if(!r.erros.length) throw new Error('sem erro na resposta');
});
t('o botao Atualizar mostra o erro', ()=>{
  try { ctx.acaoAtualizarRH(adm); throw new Error('nao lancou'); }
  catch(e){ if(!/não consegui atualizar/i.test(e.message)) throw new Error('mensagem: '+e.message); }
});

/* ---- 5 · reimportar VARIAS vezes: sem duplicar e SEM ERRO ----
   O teste antes so comparava as contagens; se a reimportacao falhasse,
   o numero ficava igual e o teste passava pelo motivo errado. Foi
   exatamente o que aconteceu com o erro "Nao e possivel excluir todas
   as linhas nao congeladas": a base tinha SO a competencia que estava
   sendo trocada, e o Google recusa apagar todas as linhas nao
   congeladas de uma aba. Agora o teste exige sucesso declarado. */
aba.dados=M;
const passos=[];
for (let i=0;i<3;i++){
  const r=ctx.atualizarCompetenciaAberta();
  ctx.esquecerLeituras();
  passos.push({ok:r.ok, erros:r.erros.map(e=>e.erro), linhas:ctx.listar('FATO_ASSIDUIDADE').length});
}
console.log('\nREIMPORTAR TRES VEZES SEGUIDAS:');
passos.forEach((p,i)=>console.log(`  ${i+1}a: ok=${p.ok} linhas=${p.linhas}${p.erros.length?' erro='+p.erros[0].slice(0,60):''}`));
t('reimportar nao da erro (linhas nao congeladas)', ()=>{
  passos.forEach((p,i)=>{ if(!p.ok) throw new Error((i+1)+'a importacao falhou: '+p.erros[0]); });
});
t('reimportar nao duplica nem esvazia', ()=>{
  passos.forEach((p,i)=>eq(p.linhas, 4846, (i+1)+'a importacao:'));
});

/* ---- 6 · a atualizacao chega na tela ---- */
t('o painel reflete a reimportacao', ()=>{
  const p=ctx.dadosAssiduidade(adm,{competencia:'2026-08'});
  eq(p.kpis.registros,4846,'registros no painel:');
});

console.log();
ok.forEach(n=>console.log('  OK   '+n)); err.forEach(n=>console.log('  FALHA '+n));
console.log('\n'+ok.length+' passaram, '+err.length+' falharam');
process.exit(err.length?1:0);
