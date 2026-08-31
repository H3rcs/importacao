/* Simula o caso REAL do usuario: banco que ja existe, com o DE-PARA
   ERRADO da versao anterior. Roda "Restaurar tabela padrao" e confere
   se os numeros passam a bater com a GSL-DADOS. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const S=require('./stubs.js');
const DIR=path.join(__dirname,'..','02_CORRIGIDO');
const ctx=Object.assign({console,JSON,Math,Date,String,Number,Boolean,Object,Array,Error,RegExp,
  isNaN,parseInt,parseFloat,Set,Map,Buffer},S);
ctx.globalThis=ctx; vm.createContext(ctx);
['Banco.gs','Datas.gs','Permissoes.gs','Instalacao.gs','Auth.gs','Calendario.gs','Central.gs',
 'Config.gs','Arquivos.gs','Entrega.gs','Emails.gs','Dados.gs','Codigo.gs']
 .forEach(f=>vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f}));

ctx.instalar('admin@bartofil.com.br');
ctx.definirEmailAtual('admin@bartofil.com.br');
const adm=ctx.usuarioAtual();

// --- reverte o DE-PARA para a tabela ERRADA da versao anterior ---
const ANTIGO = {'1':['Atestado medico','Atestado','SIM'],'2':['Viagem a servico','Presenca','NAO'],
 '3':['Folga a compensar','Folga','NAO'],'4':['Falecimento','Licenca legal','NAO'],
 '5':['H.E. compensada','Compensacao','NAO'],'6':['Abonado','Licenca legal','NAO'],
 '6.1':['Ferias','Ferias','NAO'],'16':['Falta','Falta','SIM'],'18':['Falta (suspensao)','Falta','SIM'],
 '19':['Dia compensado','Compensacao','NAO'],'23':['Acompanhante de filho','Atestado','SIM'],
 '24':['Acompanhante de esposa','Atestado','SIM'],'26':['Desconto horas parcial BH','Compensacao','NAO'],
 '401':['Hr Falta Desvio Folha','Falta','SIM'],'003':['Saiu mais cedo','Compensacao','NAO']};
const mudancas=[], remover=[];
ctx.listar('DE_PARA').forEach(l=>{
  const c=ctx.codigo_(l.CODIGO);
  if (ANTIGO[c]) mudancas.push({id:l.ID,campos:{DESCRICAO:ANTIGO[c][0],CATEGORIA:ANTIGO[c][1],CONTA_COMO_AUSENCIA:ANTIGO[c][2]}});
  else if (['00','28','29','-','PP','SISTEMA INTRANET'].indexOf(c)>=0) remover.push({id:l.ID,campos:{EXCLUIDO:'SIM'}});
});
ctx.atualizarVarios('DE_PARA',mudancas.concat(remover),'sistema');
console.log('Banco preparado como a versao ANTERIOR deixaria:');
console.log('  ' + mudancas.length + ' codigos com categoria errada, ' + remover.length + ' ausentes');
console.log('  DE-PARA com', ctx.listar('DE_PARA').length, 'codigos');

// --- importa a folha real com o DE-PARA errado ---
const M=JSON.parse(fs.readFileSync(path.join(__dirname,'folha_real.json'),'utf8'))
  .map(l=>l.map(v=>(v&&v.__data)?new Date(v.__data+'T12:00:00Z'):v));
const folha=S.SpreadsheetApp.create('PONTO'); const aba=folha.insertSheet('FOLHA DE PONTO'); aba.dados=M;
ctx.acaoSalvarArquivoRH(adm,{competencia:'2026-08',link:folha.getUrl(),aba:'FOLHA DE PONTO',situacao:'Aberta'});
const arq=ctx.listar('ARQUIVOS_RH')[0];
ctx.acaoImportarCompetencia(adm,{id:arq.ID});
const antes=ctx.dadosAssiduidade(adm,{competencia:'2026-08'}).kpis;
console.log('\nANTES de restaurar (DE-PARA errado):');
console.log(`  registros=${antes.registros}  ausencias=${antes.ausencias}  taxa=${antes.taxa}%  f.injust=${antes.faltasInjustificadas}  atestados=${antes.atestados}`);

// --- o botao ---
const r=ctx.acaoRestaurarDePara(adm);
console.log('\nRestaurar tabela padrao ->', r.corrigidos, 'corrigidos,', r.criados, 'criados,', r.total, 'na tabela');

// --- reclassificar ---
ctx.acaoReclassificar(adm,{});
const dep=ctx.dadosAssiduidade(adm,{competencia:'2026-08'}).kpis;
console.log('\nDEPOIS de restaurar + reclassificar:');
console.log(`  registros=${dep.registros}  ausencias=${dep.ausencias}  taxa=${dep.taxa}%  f.injust=${dep.faltasInjustificadas}  atestados=${dep.atestados}`);

const ESP={colaboradores:341,registros:4846,ausencias:214,faltasInjustificadas:21,
  faltasJustificadas:7,faltasDisciplinares:6,atestados:180,ferias:365};
let ok=0,dif=0;
console.log('\nconferencia contra a GSL-DADOS:');
Object.keys(ESP).forEach(c=>{ const b=dep[c]===ESP[c]; b?ok++:dif++;
  console.log(`  ${b?'OK  ':'DIF '} ${c.padEnd(22)} ${String(dep[c]).padStart(6)} / ${ESP[c]}`); });
console.log('\n' + ok + ' conferem, ' + dif + ' divergem');
process.exit(dif?1:0);
