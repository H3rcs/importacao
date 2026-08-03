/*******************************************************************************
 * GSL BARTOFIL · CALENDÁRIO (v5) · correção do PLACAR
 *
 * Cole este arquivo no projeto Apps Script DA PLANILHA DO GSL (o calendário),
 * execute corrigirPlacar() uma vez e confira a aba SCORE. Nada mais da planilha
 * é tocado: só as fórmulas da aba SCORE são reescritas.
 *
 * O QUE ESTAVA ERRADO
 * O denominador do score contava como "programada" toda atividade da aba do mês,
 * inclusive as ainda PENDENTES (que nem venceram). Resultado: aprovação = 0 ÷ N,
 * pontualidade e absenteísmo cheios, e todo mês de todo turno fechava em 60,0.
 * Empatados, os três ganhavam 🥇 e o líder era sempre "Turno A", por ser o
 * primeiro IF da fórmula.
 *
 * O QUE MUDA
 * 1 · Denominador = só o que JÁ VENCEU (Aprovada + Entregue + Atrasada +
 *     Reprovada). Mês futuro fica em branco em vez de pontuar 60.
 * 2 · Atraso passa a contar tanto o status "Atrasada" quanto a marca fA
 *     carimbada pelo digesto — antes dependia só da marca.
 * 3 · Empate vira "Empate técnico"; as medalhas seguem a posição real.
 * 4 · No início do mês, quando nada venceu, o painel mostra o último mês
 *     fechado e diz qual é (célula J4).
 * 5 · Coluna Z: nome da aba do mês, calculado uma vez por linha. As fórmulas
 *     ficam curtas e a aba recalcula mais rápido.
 ******************************************************************************/

var SCORE_LIN_INI = 10, SCORE_LIN_FIM = 27;

function corrigirPlacar() {
  var sh = SpreadsheetApp.getActive().getSheetByName('SCORE');
  if (!sh) throw new Error('Aba SCORE não encontrada.');

  var faixa = function (r, col) {
    return 'INDIRECT("\'"&$Z' + r + '&"\'!$' + col + '$22:$' + col + '$150")';
  };
  var contar = function (r, turno, status) {
    return 'IFERROR(COUNTIFS(' + faixa(r, 'G') + ',"' + turno + '",' +
           faixa(r, 'S') + ',"' + status + '"),0)';
  };
  var vencidas = function (r, t) {
    return ['Aprovada', 'Entregue', 'Atrasada', 'Reprovada'].map(function (s) {
      return contar(r, t, s);
    }).join('+');
  };
  var atrasos = function (r, t) {
    return contar(r, t, 'Atrasada') + '+IFERROR(COUNTIFS(' + faixa(r, 'G') + ',"' + t + '",' +
           faixa(r, 'U') + ',"<>",' + faixa(r, 'S') + ',"<>Atrasada"),0)';
  };
  var lider = function (k, l, m) {
    var mx = 'MAX(N(' + k + '),N(' + l + '),N(' + m + '))';
    return '=IF(N(' + k + ')+N(' + l + ')+N(' + m + ')=0,"—",IF((N(' + k + ')=' + mx +
           ')+(N(' + l + ')=' + mx + ')+(N(' + m + ')=' + mx + ')>1,"Empate técnico",IF(N(' +
           k + ')=' + mx + ',"Turno A",IF(N(' + l + ')=' + mx + ',"Turno B","Turno C"))))';
  };
  var ultimo = function (col) {
    return 'LOOKUP(2,1/(($K$10:$K$27<>"")*($P$10:$P$27<=DATE(YEAR(TODAY()),MONTH(TODAY()),1))),' +
           col + ')';
  };
  var SIGLAS = '"JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"';

  for (var r = SCORE_LIN_INI; r <= SCORE_LIN_FIM; r++) {
    sh.getRange('Z' + r).setFormula(
      '=IF($P' + r + '="","",CHOOSE(MONTH($P' + r + '),' + SIGLAS + ')&" "&YEAR($P' + r + '))');

    ['Q', 'R', 'S'].forEach(function (col, i) {
      sh.getRange(col + r).setFormula('=' + vencidas(r, 'ABC'.charAt(i)));
    });
    ['T', 'U', 'V'].forEach(function (col, i) {
      sh.getRange(col + r).setFormula('=' + contar(r, 'ABC'.charAt(i), 'Aprovada'));
    });
    ['W', 'X', 'Y'].forEach(function (col, i) {
      sh.getRange(col + r).setFormula('=' + atrasos(r, 'ABC'.charAt(i)));
    });

    // % aprovação · % pontualidade · score, por turno
    [['B', 'Q', 'T'], ['C', 'R', 'U'], ['D', 'S', 'V']].forEach(function (c) {
      sh.getRange(c[0] + r).setFormula('=IF($' + c[1] + r + '=0,"",$' + c[2] + r + '/$' + c[1] + r + ')');
    });
    [['E', 'Q', 'W'], ['F', 'R', 'X'], ['G', 'S', 'Y']].forEach(function (c) {
      sh.getRange(c[0] + r).setFormula(
        '=IF($' + c[1] + r + '=0,"",MAX(0,1-$' + c[2] + r + '/$' + c[1] + r + '))');
    });
    [['K', 'Q', 'T', 'W', 'H'], ['L', 'R', 'U', 'X', 'I'], ['M', 'S', 'V', 'Y', 'J']]
      .forEach(function (c) {
        sh.getRange(c[0] + r).setFormula(
          '=IF($' + c[1] + r + '=0,"",ROUND($B$7*($' + c[2] + r + '/$' + c[1] + r + ')' +
          '+$D$7*MAX(0,1-$' + c[3] + r + '/$' + c[1] + r + ')' +
          '+$F$7*MAX(0,1-$' + c[4] + r + '/$H$7),1))');
      });

    sh.getRange('N' + r).setFormula(lider('$K' + r, '$L' + r, '$M' + r));
  }

  // topo: score do mês corrente ou, se nada venceu ainda, do último mês fechado
  sh.getRange('A4').setFormula('=IFERROR(' + ultimo('$K$10:$K$27') + ',"—")');
  sh.getRange('C4').setFormula('=IFERROR(' + ultimo('$L$10:$L$27') + ',"—")');
  sh.getRange('E4').setFormula('=IFERROR(' + ultimo('$M$10:$M$27') + ',"—")');
  [['B4', '$A$4', '$C$4', '$E$4'], ['D4', '$C$4', '$A$4', '$E$4'], ['F4', '$E$4', '$A$4', '$C$4']]
    .forEach(function (c) {
      sh.getRange(c[0]).setFormula('=IF(N(' + c[1] + ')=0,"",CHOOSE(1+(N(' + c[2] + ')>N(' + c[1] +
        '))+(N(' + c[3] + ')>N(' + c[1] + ')),"🥇","🥈","🥉"))');
    });
  sh.getRange('H4').setFormula(lider('$A$4', '$C$4', '$E$4'));
  sh.getRange('J4').setFormula('=IFERROR("placar de "&' + ultimo('$A$10:$A$27') + ',"")');

  sh.getRange('A5').setValue(
    'Score 0–100 por turno e mês, contando apenas o que JÁ VENCEU: APROVAÇÃO ' +
    '(aprovadas ÷ vencidas) + PONTUALIDADE (1 − atrasadas ÷ vencidas) + ABSENTEÍSMO ' +
    '(quanto mais perto da meta, melhor). Mês que ainda não venceu nada fica em branco. ' +
    'Ajuste os pesos e a meta nas células amarelas.');

  sh.hideColumns(26);   // coluna Z (auxiliar)
  SpreadsheetApp.getUi().alert(
    'Placar corrigido.\n\n' +
    '· meses futuros deixam de pontuar 60\n' +
    '· empate aparece como "Empate técnico"\n' +
    '· J4 mostra a que mês o placar se refere\n\n' +
    'Confira a aba SCORE e apague este arquivo depois, se quiser.');
}
