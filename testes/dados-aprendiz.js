'use strict';
/*
 * PLANILHA DE TESTE DO JOVEM APRENDIZ — o mesmo formato da "Imersao
 * Corporativa (respostas)", com nomes ficticios. Datas relativas a hoje,
 * para o status de cada setor (concluido / em andamento / a fazer) ser
 * sempre o mesmo, em qualquer dia em que o teste rodar.
 *
 *   planilhaAprendiz(Data, hoje) -> { 'Respostas ao formulário 1': [...], 'Cronograma': [...] }
 *
 * `Data` e o Date do ambiente do script (mundo.DataDoScript): no Apps
 * Script as datas da planilha nascem nesse ambiente. Meio-dia, para nao
 * escorregar um dia em fuso nenhum.
 */
const SETORES = ['Devolução', 'Inventario', 'Recebimento', 'C. Carregamento', 'C. Grandeza', 'C. Miudeza', 'C. Flowrack', 'Loja'];

module.exports = function planilhaAprendiz(Data, hoje) {
  const dia = (desloc) => new Data(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + desloc, 12, 0, 0);
  const vazio = () => ['', '', '', '', '', '', '', '', '', ''];
  // um bloco de 8 linhas: nome, contrato, ferias e os setores (com inicio e final)
  const bloco = (linhas, col, nome, contrato, ferias, setores, primeiroDia) => {
    setores.forEach((s, k) => {
      const l = linhas[k];
      if (k === 0) l[col] = nome;
      if (k === 1 && contrato) l[col] = contrato;
      if (k === 2 && ferias) l[col] = ferias;
      l[col + 1] = s;
      l[col + 2] = dia(primeiroDia + 7 * k);
      l[col + 3] = dia(primeiroDia + 7 * k + 4);
    });
  };
  const cronograma = [['Turno A', '', '', '', '', 'Turno B', '', '', '', ''],
                      ['Nome', 'Setor', 'Inicio', 'Final', '', 'Nome', 'Setor', 'Inicio', 'Final', '']];
  const b1 = Array.from({ length: 9 }, vazio);
  bloco(b1, 0, 'ANA BEATRIZ TESTE', 'Final de contrato: 15/03/27', 'Periodo de Ferias:  01/12/26 a 30/12/26', SETORES, -70);
  bloco(b1, 5, 'BRUNO CARLOS TESTE', 'Final de contrato: 20/11/2026', 'Periodo de Ferias: 01/12/2026 a 15/12/2026', SETORES.slice(0, 3), -7);
  const b2 = Array.from({ length: 9 }, vazio);
  bloco(b2, 0, 'CAIO DIAS TESTE', 'Final de contrato: 05/02/2028', 'Periodo de Ferias: 01/03/28 a 30/03/28', SETORES, 30);
  bloco(b2, 5, 'Daniela Esteves Teste', '', '', SETORES.slice(0, 2), 40);
  cronograma.push(...b1, ...b2);

  const quando = (desloc, h) => new Data(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + desloc, h || 9, 30, 0);
  const r = (desloc, avaliador, setor, nome, n, media, pos, mel) =>
    [quando(desloc), avaliador.toLowerCase().replace(/\s+/g, '.') + '@bartofil.com.br', avaliador, setor, nome].concat(n, [pos, mel, media]);
  const respostas = [
    ['Carimbo de data/hora', 'Endereço de e-mail', 'AVALIADOR', 'SETOR ', 'NOME E SOBRENOME DO JOVEM APRENDIZ:',
     'ATENÇÃO CONCENTRADA:', 'DISCIPLINA', 'INTERESSE', 'PROATIVIDADE', 'APRENDIZADO', 'PONTOS POSITIVOS', 'PONTOS A SEREM MELHORADOS', 'Média por setor'],
    r(-66, 'Avaliador Um', 'DEVOLUÇÃO', 'ANA BEATRIZ TESTE', [4, 4, 4, 4, 4], 4, 'Atenta', 'Nada'),
    r(-59, 'Avaliador Dois', 'INVENTARIO', 'ANA BEATRIZ TESTE', [3, 3, 3, 3, 3], 3, 'Pontual', 'Comunicação'),
    r(-52, 'Avaliador Tres', 'RECEBIMENTO - A', 'ANA BEATRIZ TESTE', [4, 4, 4, 4, 4], 4, 'Rápida', 'Atenção'),
    r(-51, 'Avaliador Quatro', 'RECEBIMENTO - B', 'ANA BEATRIZ TESTE', [2, 2, 2, 2, 2], 2, 'Esforçada', 'Agilidade'),
    r(-45, 'Avaliador Cinco', 'CARREGAMENTO - A', 'ANA BEATRIZ TESTE', [5, 5, 5, 5, 5], 5, 'Excelente', 'Nada a declarar'),
    r(-38, 'Avaliador Seis', 'GRANDEZA - B', 'ANA BEATRIZ TESTE', [4, 3, 4, 3, 4], 3.6, 'Interessada', 'Disciplina'),
    r(-31, 'Avaliador Sete', 'MIUDEZA - A', 'ANA BEATRIZ TESTE', [3, 4, 3, 4, 3], 3.4, 'Organizada', 'Proatividade'),
    r(-24, 'Avaliador Oito', 'FLOWRACK - B', 'ANA BEATRIZ TESTE', [4, 4, 4, 4, 4], 4, 'Cuidadosa\nCalma', 'Ritmo'),
    r(-17, 'Avaliador Nove', 'LOJA', 'ANA BEATRIZ TESTE', [5, 4, 5, 4, 5], 4.6, 'Simpática', 'Precisa ser mais ágil! \n'),
    r(-4, 'Avaliador Um', 'DEVOLUÇÃO - A', 'BRUNO CARLOS TESTE', [3, 3, 3, 3, 3], 3, 'Prestativo', 'Foco'),
    // linha nova do Formulario, sem a formula da media (coluna M vazia)
    r(-3, 'Avaliador Dez', 'DEVOLUÇÃO - B', 'BRUNO CARLOS TESTE', [4, 3, 3, 3, 3], '', '', ''),
    r(-20, 'Avaliador Nove', 'LOJA', 'ELIAS FORA DO CRONOGRAMA', [3, 3, 3, 3, 3], 3, 'Ok', 'Ok'),
    r(-10, 'Avaliador Dois', 'INVENTARIO', 'ELIAS FORA DO CRONOGRAMA', [4, 4, 4, 4, 4], 4, 'Bom', 'Bom'),
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Esse aqui', '', '', '', '', '', '', '', '', '', '', '']
  ];
  return { 'Respostas ao formulário 1': respostas, 'Cronograma': cronograma };
};

/* O que a tela tem que mostrar com esta planilha (contas feitas a mao). */
module.exports.esperado = {
  lista: [['ANA BEATRIZ TESTE', 'Concluído'], ['BRUNO CARLOS TESTE', 'Pendente'], ['ELIAS FORA DO CRONOGRAMA', 'Pendente'],
          ['CAIO DIAS TESTE', 'Não realizada'], ['Daniela Esteves Teste', 'Não realizada']],
  ana: { mediaGeral: 3.7, mediasPilares: [3.8, 3.8, 3.7, 3.8, 3.7], vivenciados: 8, totais: 8, fimContrato: '15/03/2027',
         periodoFerias: '01/12/2026 a 30/12/2026', recebimento: 3 },
  bruno: { vivenciados: 1, totais: 3, linha: ['concluido', 'fazendo', 'pendente'], devolucao: 3.1, semFormula: 3.2 },
  ordemCronograma: ['BRUNO CARLOS TESTE', 'ANA BEATRIZ TESTE', 'CAIO DIAS TESTE', 'Daniela Esteves Teste']
};
