/*******************************************************************************
 * 40_Publicacao.gs — o único ponto de contato com o calendário (GSL v5)
 *
 * OPCIONAL. Ligado/desligado em PARAM > "Publicar agregados no GSL (S/N)".
 * A estrutura do calendário NÃO muda: escrevemos nas mesmas colunas da aba
 * OCORRÊNCIAS que já existem desde a v5, deixando COLABORADOR e DESCRIÇÃO
 * vazias. Com a publicação desligada, a aba continua sendo digitada pelo menu
 * do calendário, como sempre foi.
 *
 * Sai daqui SOMENTE agregado: uma linha por data + tipo + turno + setor.
 * Nome, matrícula e descrição nunca atravessam esta fronteira.
 *
 * A publicação é EMPURRADA por este script, que roda com a conta do
 * administrador. A planilha do GSL não guarda o ID desta planilha, não tem
 * IMPORTRANGE e portanto não tem como um editor "puxar" a base individual.
 ******************************************************************************/

var GSL_COLS = 10;              // A..J — mesmo layout da OCORRÊNCIAS da v5
var MESES_PUBLICADOS = 13;      // janela que a GERÊNCIA e o PAINEL enxergam

/** Traduz o tipo canônico para o que a planilha do GSL entende. '' = não publica. */
function tipoPublicavel_(tipo) {
  if (TIPOS_PUBLICAVEIS.indexOf(tipo) >= 0) return tipo;
  if (tipo === 'Falta justificada') {
    return paramSN_('Contar falta justificada', false) ? 'Falta' : '';
  }
  return '';   // Saída antecipada, Atraso, Férias, Afastamento ficam na camada restrita
}

function publicarAgregadosAgora() { publicarAgregados_(true); }

function publicarAgregados_(interativo) {
  if (!paramSN_('Publicar agregados', true)) {
    if (interativo) ui_('A publicação está pausada no PARAM.');
    return;
  }
  var id = idGSL_();
  if (!id) throw new Error('Preencha o ID da planilha do GSL na aba PARAM.');

  var destino;
  try {
    destino = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('Sem acesso à planilha do GSL. Confira o ID no PARAM.');
  }
  var nomeAba = String(param_('Aba de destino no GSL') || 'OCORRÊNCIAS');
  var sh = destino.getSheetByName(nomeAba);
  if (!sh) throw new Error('Aba "' + nomeAba + '" não existe na planilha do GSL.');
  var primeira = paramNum_('Primeira linha de dados no GSL', 6);

  // ------------------------------------------------------------- agregação
  var corte = new Date();
  corte.setMonth(corte.getMonth() - MESES_PUBLICADOS);
  corte = new Date(corte.getFullYear(), corte.getMonth(), 1);

  var shf = aba_('FATOS');
  var grupos = {};
  if (shf.getLastRow() > 1) {
    var vals = shf.getRange(2, 1, shf.getLastRow() - 1, COLS_FATOS).getValues();
    vals.forEach(function (l) {
      if (!l[0]) return;
      var data = new Date(l[0]);
      if (data < corte) return;
      var tipo = tipoPublicavel_(String(l[1]));
      if (!tipo) return;
      var chave = [data.getTime(), tipo, l[2], l[3]].join('|');
      if (!grupos[chave]) {
        grupos[chave] = { data: data, tipo: tipo, turno: l[2], setor: l[3], qtde: 0 };
      }
      grupos[chave].qtde += paraNumero_(l[4], 0);
    });
  }

  var linhas = Object.keys(grupos).map(function (k) { return grupos[k]; })
    .sort(function (a, b) { return a.data - b.data; })
    .map(function (g) {
      // F (colaborador) e G (descrição) vão VAZIAS de propósito.
      return [g.data, g.tipo, g.turno, g.setor, g.qtde, '', '',
              semanaISO_(g.data), primeiroDoMes_(g.data), anoISO_(g.data)];
    });

  // ------------------------------------------------------------- publicação
  var ultima = Math.max(sh.getLastRow(), primeira);
  var qtdLimpar = ultima - primeira + 1;
  if (qtdLimpar > 0) sh.getRange(primeira, 1, qtdLimpar, GSL_COLS).clearContent();
  if (linhas.length) {
    sh.getRange(primeira, 1, linhas.length, GSL_COLS).setValues(linhas);
  }

  sh.getRange('L5').setValue('Atualizado em ' + fmtDataHora_(agora_()) +
                             ' · dados agregados, sem identificação individual');

  log_('Publicação', nomeAba + ' do GSL', '', linhas.length + ' linhas agregadas',
       'janela de ' + MESES_PUBLICADOS + ' meses');

  if (interativo) {
    ui_(linhas.length + ' linha(s) agregada(s) publicadas no GSL.\n\n' +
        'Nenhum nome ou matrícula foi enviado.');
  }
}

/**
 * UTILITÁRIO DE MIGRAÇÃO — rodar UMA VEZ, no projeto do GSL (não aqui).
 * As fórmulas da v5/v6 leem OCORRÊNCIAS até a linha 605. Com o agregado diário
 * de 13 meses isso fica apertado; esta função amplia todas as referências para
 * 5005 sem tocar em nenhuma outra fórmula da planilha.
 *
 * Cole no projeto Apps Script do GSL, execute, confira e apague.
 *
 *   function ampliarFaixaOcorrencias() {
 *     var re = /(OCORRÊNCIAS!\$[A-J]\$6:\$[A-J]\$)605/g;
 *     var n = 0;
 *     SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
 *       var f = sh.getDataRange().getFormulas();
 *       for (var i = 0; i < f.length; i++) {
 *         for (var j = 0; j < f[i].length; j++) {
 *           if (!f[i][j]) continue;
 *           var nova = f[i][j].replace(re, '$1' + '5005');
 *           if (nova !== f[i][j]) { sh.getRange(i + 1, j + 1).setFormula(nova); n++; }
 *         }
 *       }
 *     });
 *     SpreadsheetApp.getUi().alert(n + ' fórmulas ampliadas para 5005 linhas.');
 *   }
 *
 * Grava célula a célula de propósito: setFormulas() em um bloco inteiro apagaria
 * todas as células que contêm valor em vez de fórmula.
 */
