'use strict';
/*
 * PLANILHA DE TESTE DO QUADRO DO CD — o formato novo (aba GERAL) com nomes
 * ficticios, mais as abas de admitidos e desligados de sempre. Datas
 * relativas a hoje: "ultimos 90 dias" da sempre o mesmo resultado.
 *
 *   planilhaQuadro(Data, hoje) -> { abas: { 'GERAL': [...], 'CADMITIDOS': [...], ... }, esperado: {...} }
 *   planilhaQuadro(Data, hoje, { antigo: true }) -> o layout de antes (APOIO TA / TB / TC)
 *
 * `Data` e o Date do ambiente do script (mundo.DataDoScript). Meio-dia,
 * para a data nao escorregar um dia em fuso nenhum.
 *
 * A GERAL de teste tem, de proposito, o que a planilha de verdade costuma
 * ter: titulo em cima do cabecalho (com a palavra COLABORADORES), "1º" e
 * "1°" misturados, uma linha sem nome, uma equipe fora do padrao, um
 * produtivo repetido, um desligado que continua ATIVO e um admitido que
 * nao entrou na GERAL.
 */
const PRIMEIROS = ['ANA', 'BRUNO', 'CARLA', 'DIEGO', 'EDUARDA', 'FABIO', 'GABRIELA', 'HUGO', 'ISABELA', 'JOAO',
  'KAREN', 'LUCAS', 'MARIANA', 'NATAN', 'OTAVIO', 'PATRICIA', 'RAFAEL', 'SABRINA', 'TIAGO', 'VANESSA',
  'WESLEY', 'YASMIN', 'ALINE', 'CAIO', 'DANIELA', 'EMERSON', 'FERNANDA', 'GUSTAVO', 'HELENA', 'IGOR', 'JULIANA'];
const SOBRENOMES = ['SANTOS', 'OLIVEIRA', 'SOUZA', 'LIMA', 'PEREIRA', 'COSTA', 'RODRIGUES', 'ALMEIDA', 'NASCIMENTO',
  'ARAUJO', 'CARVALHO', 'RIBEIRO', 'MARTINS', 'ROCHA', 'BARBOSA', 'TEIXEIRA', 'MOREIRA', 'CAVALCANTI', 'DIAS', 'MENDES', 'FREITAS'];

/* Quantos de cada funcao em cada equipe (os ATIVOS, antes das linhas especiais). */
const QUADRO = {
  '1° TURNO': [['SEPARADOR', 18], ['AUXILIAR DE LOGÍSTICA', 10], ['CONFERENTE', 8], ['OPERADOR DE EMPILHADEIRA', 6],
    ['OPERADOR DE PALETEIRA', 5], ['REPOSITOR', 5], ['ARMAZENISTA', 4], ['LÍDER DE EQUIPE', 2],
    ['SUPERVISOR DE OPERAÇÕES', 1], ['AUXILIAR DE EXPEDIÇÃO', 1]],
  '2° TURNO': [['SEPARADOR', 16], ['AUXILIAR DE LOGÍSTICA', 9], ['CONFERENTE', 7], ['OPERADOR DE EMPILHADEIRA', 5],
    ['OPERADOR DE PALETEIRA', 4], ['REPOSITOR', 4], ['ARMAZENISTA', 3], ['LÍDER DE EQUIPE', 2],
    ['SUPERVISOR DE OPERAÇÕES', 1], ['AUXILIAR DE EXPEDIÇÃO', 1]],
  '3° TURNO': [['SEPARADOR', 12], ['AUXILIAR DE LOGÍSTICA', 7], ['CONFERENTE', 5], ['OPERADOR DE EMPILHADEIRA', 4],
    ['OPERADOR DE PALETEIRA', 3], ['REPOSITOR', 2], ['ARMAZENISTA', 2], ['LÍDER DE EQUIPE', 2], ['SUPERVISOR DE OPERAÇÕES', 1]],
  'ADM': [['ASSISTENTE ADMINISTRATIVO', 4], ['ANALISTA DE LOGÍSTICA', 3], ['ASSISTENTE DE RH', 2], ['ANALISTA DE RH', 1],
    ['COORDENADOR DE LOGÍSTICA', 1], ['GERENTE DE CD', 1], ['TÉCNICO DE SEGURANÇA', 1], ['JOVEM APRENDIZ', 1]]
};

function nomeDe(i) {
  return PRIMEIROS[i % PRIMEIROS.length] + ' ' + SOBRENOMES[(i * 7) % SOBRENOMES.length] + ' ' + SOBRENOMES[(i * 13 + 3) % SOBRENOMES.length];
}

module.exports = function planilhaQuadro(Data, hoje, opcoes) {
  opcoes = opcoes || {};
  const dia = (desloc) => new Data(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + desloc, 12, 0, 0);
  const pessoas = [];          // { equipe, cod, nome, funcao, rh, status }
  let i = 0;
  Object.keys(QUADRO).forEach((equipe) => {
    QUADRO[equipe].forEach(([funcao, n]) => {
      for (let k = 0; k < n; k++, i++) {
        // 1° TURNO: metade escrita com o "º" (ordinal) — as duas formas aparecem na planilha de verdade
        const escrita = equipe === '1° TURNO' && i % 2 ? '1º TURNO' : equipe;
        // ferias e afastados continuam na empresa (contam no efetivo)
        const status = i % 31 === 5 ? 'FÉRIAS' : (i % 53 === 7 ? 'AFASTADO' : 'ATIVO');
        pessoas.push({ equipe: escrita, cod: String(30001 + i), nome: nomeDe(i), funcao, rh: String(100001 + i), status });
      }
    });
  });
  const base = pessoas.length;                                   // 164
  // fora da empresa, mas ainda na lista (nao contam)
  const fora = [
    { equipe: '2° TURNO', cod: '29001', nome: 'ROBERTO ANTUNES PRADO', funcao: 'SEPARADOR', rh: '099001', status: 'INATIVO' },
    { equipe: '3° TURNO', cod: '29002', nome: 'SILVIA REGINA BORGES', funcao: 'CONFERENTE', rh: '099002', status: 'DESLIGADO' },
    { equipe: '1° TURNO', cod: '29003', nome: 'TALES MOURA CAMPOS', funcao: 'REPOSITOR', rh: '099003', status: 'INATIVO' },
    { equipe: 'ADM', cod: '29004', nome: 'URSULA PRATES NOGUEIRA', funcao: 'ASSISTENTE ADMINISTRATIVO', rh: '099004', status: 'INATIVO' }
  ];
  // linhas com problema (contam no efetivo: estao ATIVAS)
  const especiais = [
    { equipe: 'TURNO 4', cod: '39001', nome: 'RENATO SILVA ALVES', funcao: 'SEPARADOR', rh: '109001', status: 'ATIVO' },      // equipe fora do padrao
    { equipe: '2° TURNO', cod: '39002', nome: '', funcao: 'CONFERENTE', rh: '109002', status: 'ATIVO' },                       // sem nome
    { equipe: '3° TURNO', cod: pessoas[10].cod, nome: 'MAURICIO PIRES LEAL', funcao: 'REPOSITOR', rh: '109003', status: 'ATIVO' }   // produtivo repetido
  ];
  const geral = pessoas.concat(fora, especiais);

  // desligados: os que sairam (fora da GERAL ou INATIVOS nela) e TRES que continuam ATIVOS na GERAL
  const tipos = ['VOLUNTÁRIO', 'INVOLUNTÁRIO'];
  const motivos = ['Outro emprego', 'Faltas', 'Baixo desempenho', 'Mudança de cidade', 'Término de contrato', 'Problemas pessoais', ''];
  const equipesVelhas = ['TA', 'TB', 'TC', 'ADM'];
  const desligados = [];
  for (let k = 0; k < 20; k++) {
    desligados.push({ cod: String(28001 + k), nome: nomeDe(500 + k), equipe: equipesVelhas[k % 4], funcao: k % 3 ? 'SEPARADOR' : 'CONFERENTE',
      data: dia(-5 - k * 8), tipo: tipos[k % 2], motivo: motivos[k % motivos.length] });
  }
  desligados.push({ cod: '29002', nome: 'SILVIA REGINA BORGES', equipe: 'TC', funcao: 'CONFERENTE', data: dia(-20), tipo: 'INVOLUNTÁRIO', motivo: 'Faltas' });  // INATIVA na GERAL: ok
  const ativoDesligadoCod = pessoas[3], ativoDesligadoCod2 = pessoas[90], ativoDesligadoNome = pessoas[120];
  desligados.push({ cod: ativoDesligadoCod.cod, nome: ativoDesligadoCod.nome, equipe: 'TA', funcao: ativoDesligadoCod.funcao, data: dia(-12), tipo: 'VOLUNTÁRIO', motivo: 'Outro emprego' });
  desligados.push({ cod: ativoDesligadoCod2.cod, nome: ativoDesligadoCod2.nome, equipe: 'TB', funcao: ativoDesligadoCod2.funcao, data: dia(-40), tipo: 'INVOLUNTÁRIO', motivo: 'Baixo desempenho' });
  // sem produtivo na aba de desligados: o nome (com acento e caixa diferentes) encontra a pessoa
  desligados.push({ cod: '', nome: ativoDesligadoNome.nome.toLowerCase().replace(/^./, (c) => c.toUpperCase()), equipe: 'TC', funcao: ativoDesligadoNome.funcao, data: dia(-25), tipo: 'VOLUNTÁRIO', motivo: 'Mudança de cidade' });

  // admitidos (aba sem data, como a da filial): 10 estao na GERAL, 2 nao
  const admitidos = pessoas.slice(140, 150).map((p, k) => ({ cod: p.cod, nome: p.nome, equipe: k % 3 === 0 ? 'TB' : p.equipe,
    funcao: p.funcao, status: k % 4 === 0 ? 'EM TREINAMENTO' : 'ATIVO', data: dia(-10 - k * 9) }));
  admitidos.push({ cod: '39100', nome: 'XAVIER LOPES BRITO', equipe: '1° TURNO', funcao: 'SEPARADOR', status: 'ATIVO', data: dia(-3) });
  admitidos.push({ cod: '39101', nome: 'ZILDA FONSECA REIS', equipe: 'ADM', funcao: 'ASSISTENTE DE RH', status: 'ATIVO', data: dia(-6) });

  const abas = {};
  if (opcoes.antigo) {
    // o layout de antes: uma aba por turno, cabecalho COD / COLABORADOR / EQUIPE / FUNCAO
    [['APOIO TA', /^1/], ['APOIO TB', /^2/], ['APOIO TC', /^3/]].forEach(([nome, re]) => {
      abas[nome] = [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO']].concat(pessoas.filter((p) => re.test(p.equipe))
        .map((p) => [p.cod, p.nome, nome.slice(-2), p.funcao]));
    });
  } else {
    abas['GERAL'] = [['QUADRO GERAL DE COLABORADORES — CD FEIRA DE SANTANA'], [],
      ['EQUIPE', 'COD', 'PROD', 'DESCRIÇÃO', 'RH', 'STATUS']]
      .concat(geral.map((p) => [p.equipe, p.cod, p.nome, p.funcao, p.rh, p.status]));
    // as abas antigas continuam na planilha, desatualizadas: o GSL nao le mais
    abas['APOIO TA'] = [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO'], ['1', 'NAO LER ESTA ABA', 'TA', 'SEPARADOR']];
  }
  abas['CADMITIDOS'] = [['ADMITIDOS'], ['PRODUTIVA', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'STATUS', 'DATA ADMISSÃO']]
    .concat(admitidos.map((a) => [a.cod, a.nome, a.equipe, a.funcao, a.status, a.data]));
  abas['CDESLIGADOS'] = [['COD', 'COLABORADOR', 'EQUIPE', 'FUNÇÃO', 'DATA DESLIGAMENTO', 'TIPO', 'MOTIVO']]
    .concat(desligados.map((d) => [d.cod, d.nome, d.equipe, d.funcao, d.data, d.tipo, d.motivo]));

  // FÉRIAS (14/10): a extracao do sistema de RH. Matricula = os 3 ultimos numeros do RH da GERAL. Um periodo
  // aquisitivo em aberto por pessoa (alguns com dois), com o limite antes da multa espalhado de -40 a +400 dias.
  if (!opcoes.antigo && !opcoes.semFerias) {
    const fmt = (dt) => ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2) + '/' + dt.getFullYear();
    const linhaFerias = (p, k, limiteMax, comoTexto) => {
      const lm = dia(limiteMax), paFim = dia(limiteMax - 320), paIni = dia(limiteMax - 685), adm = dia(limiteMax - 685 - 365 * (k % 4));
      const d = (x) => comoTexto ? fmt(x) : x;
      return ['Bartofil', 21, p.rh.slice(-3), p.funcao, p.nome, 655, p.equipe.replace('1º', '1°').slice(0, 1) === 'A' ? 'ADM' : p.equipe.slice(0, 1),
        d(adm), d(paIni), d(paFim), d(paFim), d(lm), limiteMax < 0 ? 30 : 0, 100 + (k % 7), 'OPERACIONAL'];
    };
    const ferias = [];
    pessoas.forEach((p, k) => {
      if (k === 77) return;                                                 // uma pessoa da GERAL sem linha (conferencia)
      // limite: 2 vencidos, 5 em ate 30 dias, ~10 em 31-60, ~10 em 61-90, o resto liberado ou em aquisicao
      const lm = k < 2 ? -10 - k * 25 : (k < 7 ? 3 + k * 5 : (k < 17 ? 32 + (k - 7) * 3 : (k < 27 ? 62 + (k - 17) * 3 : 95 + ((k * 37) % 300))));
      ferias.push(linhaFerias(p, k, lm, k % 3 === 0));
      if (k % 40 === 1) ferias.push(linhaFerias(p, k, lm + 365, false));    // segundo periodo em aberto
    });
    // os especiais com nome tambem estao na extracao (o final do RH deles repete o de outras pessoas: o nome desempata)
    especiais.filter((p) => p.nome).forEach((p, k) => ferias.push(linhaFerias(p, k, 150 + k * 20, false)));
    ferias.push(['Bartofil', 21, '901', 'SEPARADOR', 'NATALIA COSTA FREIRE', 655, '1', dia(-500), dia(-500), dia(-135), dia(-135), dia(180), 0, 101, 'OPERACIONAL']);   // CC 655, fora da GERAL
    ferias.push(['Bartofil', 21, '902', 'VENDEDOR', 'OSCAR LIMA PRADO', 700, 'ADM', dia(-500), dia(-500), dia(-135), dia(-135), dia(180), 0, 104, 'COMERCIAL']);     // outro setor
    abas['FÉRIAS'] = [['Empresa', 'Filial', 'Matricula', 'Descrição', 'Nome', 'cc', 'turno', 'admissão', 'pa_inicio', 'pa_fim', 'DTA_LIMITE', 'DTA_LIMITEMAX',
      'dias vencidos', 'codfuc', 'tipfuncao']].concat(ferias);
  }

  const porEquipe = { '1° TURNO': 0, '2° TURNO': 0, '3° TURNO': 0, 'ADM': 0 };
  pessoas.forEach((p) => { porEquipe[p.equipe.replace('º', '°')]++; });
  porEquipe['2° TURNO']++; porEquipe['3° TURNO']++;              // a linha sem nome e a do produtivo repetido
  return {
    abas,
    esperado: {
      ativos: base + especiais.length,                           // 167: quem esta na empresa
      fora: fora.length,                                         // 4 na lista, mas fora da empresa
      porEquipe,                                                 // { '1° TURNO': 60, '2° TURNO': 53, '3° TURNO': 39, ADM: 14 } + 1 fora do padrao
      semEquipe: 1,
      ferias: pessoas.filter((p) => p.status === 'FÉRIAS').length,
      afastados: pessoas.filter((p) => p.status === 'AFASTADO').length,
      desligados: desligados.length,
      admitidos: admitidos.length,
      desligadoAtivo: [ativoDesligadoCod.cod, ativoDesligadoCod2.cod, ativoDesligadoNome.cod],
      semNome: ['39002'],
      equipeForaDoPadrao: ['39001'],
      codRepetido: [pessoas[10].cod],
      admitidoFora: ['39100', '39101'],
      feriasSemLinha: opcoes.antigo || opcoes.semFerias ? null : pessoas[77].cod,
      feriasVencidas: opcoes.antigo || opcoes.semFerias ? 0 : 2
    }
  };
};
