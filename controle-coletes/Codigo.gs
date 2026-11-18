/** @OnlyCurrentDoc */
// CONTROLE DE COLETES — P1 entrega / P2 recolhe
// Roda SÓ com gatilhos simples (onOpen / onEdit): nunca pede autorização e não dá erro 403.

const COR = { azul:'#111785', verde:'#01973A', amarelo:'#FFEE03', branco:'#FFFFFF',
  azulClaro:'#EEF0FA', verdeClaro:'#E6F5EC', amareloClaro:'#FFFBD1', cinza:'#6B7080',
  linha:'#C9CDE6', zebra:'#F4F5FB', texto:'#1F2340' };
const ABA = { painel:'COLETES', reg:'REGISTRO', forn:'FORNECEDORES', cfg:'CONFIG' };
const ST = { patio:'NO PÁTIO', ok:'DEVOLVIDO', falta:'DEVOLVIDO C/ FALTA' };

/* ================= GATILHOS SIMPLES ================= */

function onOpen() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(ABA.painel)) montar_(ss);
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== ABA.painel) return;
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;
  const a1 = e.range.getA1Notation();
  const msgCel = (a1.charAt(0) === 'B' || a1.charAt(0) === 'C') ? 'B17' : 'E17';
  try {
    if (a1 === 'C12') {
      const p = placa_(e.range.getValue());
      if (p !== e.range.getValue()) e.range.setValue(p);
    } else if (a1 === 'C13') {
      const c14 = sh.getRange('C14');
      if (c14.isBlank() && Number(e.range.getValue()) > 0) c14.setValue(Number(e.range.getValue()));
    } else if (a1 === 'F11') {
      SpreadsheetApp.flush();
      sh.getRange('F14').setValue(sh.getRange('F13').getValue());
    } else if (a1 === 'C16' && e.range.getValue() === true) {
      e.range.setValue(false);
      registrarEntrega_(sh);
    } else if (a1 === 'F16' && e.range.getValue() === true) {
      e.range.setValue(false);
      confirmarDevolucao_(sh);
    }
  } catch (err) {
    msg_(sh, msgCel, '⚠ ' + err.message, false);
  }
}

/* ================= AÇÕES ================= */

function registrarEntrega_(sh) {
  const v = sh.getRange('C11:C15').getValues().map(r => r[0]);
  const fornecedor = String(v[0]).trim();
  const placa = placa_(v[1]);
  const pessoas = Number(v[2]);
  const coletes = v[3] === '' ? pessoas : Number(v[3]);
  const responsavel = String(v[4]).trim();

  if (!fornecedor) throw new Error('Informe o FORNECEDOR.');
  if (!placaOk_(placa)) throw new Error('Placa inválida. Use o formato ABC1D23 ou ABC1234.');
  if (!(pessoas >= 1) || pessoas % 1) throw new Error('Informe quantas PESSOAS estão no caminhão.');
  if (!(coletes >= 1) || coletes % 1) throw new Error('Informe quantos COLETES foram entregues.');
  if (!responsavel) throw new Error('Informe o RESPONSÁVEL (P1).');

  const reg = SpreadsheetApp.getActive().getSheetByName(ABA.reg);
  const lock = trava_();
  try {
    if (linhaNoPatio_(reg, placa)) throw new Error('A placa ' + placa + ' já está NO PÁTIO com coletes. Faça a devolução antes.');
    const row = reg.getLastRow() + 1;
    const id = 'C' + String(row - 1).padStart(4, '0');
    reg.getRange(row, 1, 1, 13).setValues([[id, new Date(), fornecedor, placa, pessoas, coletes,
      responsavel, '', '', '', '', ST.patio, '']]);
  } finally { if (lock) lock.releaseLock(); }

  addFornecedor_(fornecedor);
  sh.getRange('C11:C14').clearContent();
  SpreadsheetApp.flush();
  let aviso = '';
  const disp = sh.getRange('F8').getValue();
  if (typeof disp === 'number' && disp < 0) aviso = '  (atenção: estoque de coletes negativo, confira a aba CONFIG)';
  msg_(sh, 'B17', '✅ Entrega registrada: ' + coletes + ' colete(s) • ' + placa + ' • ' + fornecedor + aviso, true);
}

function confirmarDevolucao_(sh) {
  const placa = String(sh.getRange('F11').getValue()).trim();
  const dv = sh.getRange('F14').getValue();
  const responsavel = String(sh.getRange('F15').getValue()).trim();

  if (!placa) throw new Error('Escolha a PLACA do caminhão.');
  if (dv === '' || !(Number(dv) >= 0) || Number(dv) % 1) throw new Error('Informe quantos COLETES foram devolvidos.');
  if (!responsavel) throw new Error('Informe o RESPONSÁVEL (P2).');

  const reg = SpreadsheetApp.getActive().getSheetByName(ABA.reg);
  const lock = trava_();
  let falta, devolvidos;
  try {
    const row = linhaNoPatio_(reg, placa);
    if (!row) throw new Error('A placa ' + placa + ' não está no pátio.');
    const r = reg.getRange(row, 1, 1, 13).getValues()[0];
    const entregues = Number(r[5]);
    devolvidos = Number(dv);
    if (devolvidos > entregues) throw new Error('Devolvidos (' + devolvidos + ') é maior que entregues (' + entregues + '). Confira.');
    falta = entregues - devolvidos;
    const agora = new Date();
    reg.getRange(row, 8, 1, 6).setValues([[agora, devolvidos, responsavel, falta,
      falta > 0 ? ST.falta : ST.ok, tempo_(r[1], agora)]]);
  } finally { if (lock) lock.releaseLock(); }

  sh.getRange('F11').clearContent();
  sh.getRange('F14').clearContent();
  if (falta > 0) msg_(sh, 'E17', '⚠ Devolução registrada COM FALTA de ' + falta + ' colete(s) • ' + placa, false);
  else msg_(sh, 'E17', '✅ Devolução completa: ' + devolvidos + ' colete(s) • ' + placa, true);
}

/* ================= AUXILIARES ================= */

function placa_(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function placaOk_(p) { return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p); }

function trava_() {
  try { const l = LockService.getDocumentLock(); l.waitLock(10000); return l; }
  catch (e) { return null; }
}

function linhaNoPatio_(reg, placa) {
  const last = reg.getLastRow();
  if (last < 2) return 0;
  const vals = reg.getRange(2, 4, last - 1, 9).getValues(); // D..L
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === placa && vals[i][8] === ST.patio) return i + 2;
  }
  return 0;
}

function tempo_(ini, fim) {
  if (!(ini instanceof Date)) return '';
  const min = Math.max(0, Math.round((fim - ini) / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + 'h' + String(m).padStart(2, '0') + 'min' : m + 'min';
}

function addFornecedor_(nome) {
  const f = SpreadsheetApp.getActive().getSheetByName(ABA.forn);
  const last = f.getLastRow();
  const lista = last > 1 ? f.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).trim().toUpperCase()) : [];
  if (lista.indexOf(nome.toUpperCase()) === -1) {
    f.getRange(last + 1, 1).setValue(nome);
    f.getRange(2, 1, last, 1).sort(1);
  }
}

function msg_(sh, cel, texto, ok) {
  sh.getRange(cel).setValue(texto)
    .setFontColor(ok ? COR.verde : COR.azul)
    .setBackground(ok ? COR.verdeClaro : COR.amarelo)
    .setFontWeight('bold').setFontStyle('normal');
  SpreadsheetApp.getActive().toast(texto, 'Coletes', 6);
}

/* ================= MONTAGEM (roda sozinha na 1ª abertura) ================= */

function montar_(ss) {
  const p = ss.insertSheet(ABA.painel, 0);
  let reg = ss.getSheetByName(ABA.reg), forn = ss.getSheetByName(ABA.forn), cfg = ss.getSheetByName(ABA.cfg);
  if (!reg) { reg = ss.insertSheet(ABA.reg, 1); montarRegistro_(reg); }
  if (!forn) { forn = ss.insertSheet(ABA.forn, 2); montarFornecedores_(forn); }
  if (!cfg) { cfg = ss.insertSheet(ABA.cfg, 3); montarConfig_(cfg); }
  montarPainel_(p, forn, cfg);
  const nomes = Object.keys(ABA).map(k => ABA[k]);
  ss.getSheets().forEach(s => {
    if (nomes.indexOf(s.getName()) === -1 && s.getLastRow() === 0 && s.getLastColumn() === 0) ss.deleteSheet(s);
  });
  ss.setActiveSheet(p);
}

function enxugar_(sh, cols, rows) {
  if (sh.getMaxColumns() > cols) sh.deleteColumns(cols + 1, sh.getMaxColumns() - cols);
  if (rows && sh.getMaxRows() > rows) sh.deleteRows(rows + 1, sh.getMaxRows() - rows);
}

function montarRegistro_(reg) {
  enxugar_(reg, 13);
  const cab = ['ID','ENTREGA (P1)','FORNECEDOR','PLACA','PESSOAS','COLETES ENTREGUES','RESPONSÁVEL P1',
    'DEVOLUÇÃO (P2)','COLETES DEVOLVIDOS','RESPONSÁVEL P2','FALTA','STATUS','TEMPO NO PÁTIO'];
  reg.getRange(1, 1, 1, 13).setValues([cab]).setFontColor(COR.branco).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  reg.setRowHeight(1, 42);
  reg.setFrozenRows(1);
  [80,135,220,100,80,105,150,135,105,150,70,170,110].forEach((w, i) => reg.setColumnWidth(i + 1, w));
  const max = reg.getMaxRows();
  reg.getRange(1, 1, max, 13).setFontFamily('Roboto').setVerticalAlignment('middle');
  reg.getRange(2, 1, max - 1, 13).setHorizontalAlignment('center').setFontColor(COR.texto);
  reg.getRange(2, 3, max - 1, 1).setHorizontalAlignment('left');
  reg.getRange(2, 2, max - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  reg.getRange(2, 8, max - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  reg.getRange(2, 4, max - 1, 1).setFontWeight('bold');
  const b = reg.getRange(1, 1, max, 13).applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, true, false);
  b.setHeaderRowColor(COR.azul).setFirstRowColor(COR.branco).setSecondRowColor(COR.zebra);
  const st = reg.getRange(2, 12, max - 1, 1), fa = reg.getRange(2, 11, max - 1, 1);
  reg.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(ST.patio).setBackground(COR.amarelo).setFontColor(COR.azul).setBold(true).setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(ST.ok).setBackground(COR.verde).setFontColor(COR.branco).setBold(true).setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(ST.falta).setBackground(COR.azul).setFontColor(COR.amarelo).setBold(true).setRanges([st]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground(COR.amarelo).setFontColor(COR.azul).setBold(true).setRanges([fa]).build()
  ]);
  reg.setTabColor(COR.azul);
}

function montarFornecedores_(f) {
  enxugar_(f, 1);
  f.setColumnWidth(1, 320);
  f.getRange('A1').setValue('FORNECEDORES (a lista cresce sozinha)').setBackground(COR.verde)
    .setFontColor(COR.branco).setFontWeight('bold').setFontFamily('Roboto');
  f.setRowHeight(1, 36);
  f.setFrozenRows(1);
  f.getRange(2, 1, f.getMaxRows() - 1, 1).setFontFamily('Roboto');
  f.setTabColor(COR.verde);
}

function montarConfig_(c) {
  enxugar_(c, 4, 300);
  c.setColumnWidth(1, 260); c.setColumnWidth(2, 120); c.setColumnWidth(3, 30); c.setColumnWidth(4, 240);
  c.getRange('A1:D300').setFontFamily('Roboto').setVerticalAlignment('middle');
  c.getRange('A1:B1').merge().setValue('CONFIGURAÇÃO').setBackground(COR.azul).setFontColor(COR.branco).setFontWeight('bold');
  c.getRange('A2').setValue('Total de coletes no estoque').setFontWeight('bold').setFontColor(COR.azul).setBackground(COR.azulClaro);
  c.getRange('B2').setBackground(COR.amareloClaro).setFontWeight('bold').setHorizontalAlignment('center').setNumberFormat('0')
    .setBorder(true, true, true, true, false, false, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  c.getRange('A3').setValue('Digite em B2 quantos coletes a empresa tem no total.').setFontColor(COR.cinza).setFontSize(9);
  c.getRange('A4').setValue('Nome da empresa (cabeçalho)').setFontWeight('bold').setFontColor(COR.azul).setBackground(COR.azulClaro);
  c.getRange('B4').setBackground(COR.amareloClaro).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, false, COR.linha, SpreadsheetApp.BorderStyle.SOLID);
  c.setRowHeight(4, 30);
  c.getRange('D1').setValue('PLACAS NO PÁTIO (automático, não mexer)').setBackground(COR.amarelo).setFontColor(COR.azul).setFontWeight('bold');
  c.getRange('D2').setFormula('=IFERROR(UNIQUE(FILTER(REGISTRO!D2:D,REGISTRO!L2:L="' + ST.patio + '")),"")');
  c.setRowHeight(1, 34); c.setRowHeight(2, 30);
  c.setTabColor(COR.amarelo);
}

function montarPainel_(p, forn, cfg) {
  enxugar_(p, 7, 60);
  p.setHiddenGridlines(true);
  [16,210,250,24,210,250,16].forEach((w, i) => p.setColumnWidth(i + 1, w));
  p.getRange('A1:G60').setFontFamily('Roboto').setFontColor(COR.texto).setVerticalAlignment('middle');
  const S = SpreadsheetApp.BorderStyle;

  // Cabeçalho no padrão da marca: azul + tarja verde + tarja amarela
  p.getRange('A1:G3').setBackground(COR.azul);
  p.setRowHeight(1, 10); p.setRowHeight(2, 48); p.setRowHeight(3, 26);
  p.getRange('B2:F2').merge().setFormula('=IF(CONFIG!B4="","CONTROLE DE COLETES",UPPER(CONFIG!B4))').setFontColor(COR.branco).setFontSize(26).setFontWeight('bold');
  p.getRange('B3:F3').merge().setValue('CONTROLE DE COLETES   •   P1 entrega   •   P2 recolhe').setFontColor(COR.branco).setFontSize(11);
  p.getRange('A4:G4').setBackground(COR.verde); p.setRowHeight(4, 7);
  p.getRange('A5:G5').setBackground(COR.amarelo); p.setRowHeight(5, 7);
  p.setRowHeight(6, 14);

  // Indicadores
  const kpi = [
    ['B', 'COLETES FORA', '=SUMIF(REGISTRO!L2:L,"' + ST.patio + '",REGISTRO!F2:F)', COR.amarelo, COR.azul],
    ['C', 'CAMINHÕES NO PÁTIO', '=COUNTIF(REGISTRO!L2:L,"' + ST.patio + '")', COR.azul, COR.azul],
    ['E', 'ENTREGUES HOJE', '=SUMPRODUCT((INT(REGISTRO!B2:B)=TODAY())*REGISTRO!F2:F)', COR.azul, COR.azul],
    ['F', 'DISPONÍVEIS NO ESTOQUE', '=IF(CONFIG!B2="","defina em CONFIG",CONFIG!B2-B8-SUM(REGISTRO!K2:K))', COR.verde, COR.verde]
  ];
  kpi.forEach(k => {
    p.getRange(k[0] + '7').setValue(k[1]).setFontSize(9).setFontWeight('bold').setFontColor(COR.cinza);
    p.getRange(k[0] + '8').setFormula(k[2]).setFontSize(28).setFontWeight('bold').setFontColor(k[4]);
    p.getRange(k[0] + '7:' + k[0] + '8').setBackground(COR.azulClaro).setHorizontalAlignment('center')
      .setBorder(null, null, true, null, null, null, k[3], S.SOLID_THICK);
  });
  p.getRange('F8').setNumberFormat('0;-0;0;@');
  p.setRowHeight(7, 26); p.setRowHeight(8, 58); p.setRowHeight(9, 16);

  // Blocos de entrada
  p.getRange('B10:C10').merge().setValue('①  ENTREGA DE COLETES — P1').setBackground(COR.azul);
  p.getRange('E10:F10').merge().setValue('②  DEVOLUÇÃO DE COLETES — P2').setBackground(COR.verde);
  p.getRange('B10:F10').setFontColor(COR.branco).setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');
  p.getRange('D10').setBackground(null);
  p.setRowHeight(10, 36);
  for (let r = 11; r <= 15; r++) p.setRowHeight(r, 34);

  p.getRange('B11:B15').setValues([['Fornecedor'],['Placa do caminhão'],['Pessoas no caminhão'],['Coletes entregues'],['Responsável (P1)']])
    .setBackground(COR.azulClaro).setFontColor(COR.azul).setFontWeight('bold').setFontSize(10);
  p.getRange('E11:E15').setValues([['Placa do caminhão'],['Fornecedor'],['Coletes a devolver'],['Coletes devolvidos'],['Responsável (P2)']])
    .setBackground(COR.verdeClaro).setFontColor(COR.verde).setFontWeight('bold').setFontSize(10);
  p.getRange('B11:B15').setHorizontalAlignment('left');
  p.getRange('E11:E15').setHorizontalAlignment('left');

  const campo = r => r.setBackground(COR.amareloClaro).setFontSize(12).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, false, true, COR.linha, S.SOLID);
  campo(p.getRange('C11:C15'));
  campo(p.getRange('F11'));
  campo(p.getRange('F14:F15'));
  p.getRange('F12:F13').setBackground(COR.zebra).setFontSize(12).setFontWeight('bold').setFontColor(COR.azul)
    .setHorizontalAlignment('center').setBorder(true, true, true, true, false, true, COR.linha, S.SOLID);
  p.getRange('C13:C14').setNumberFormat('0');
  p.getRange('F13:F14').setNumberFormat('0');

  p.getRange('F12').setFormula('=IF(F11="","",IFERROR(INDEX(FILTER(REGISTRO!C2:C,REGISTRO!D2:D=F11,REGISTRO!L2:L="' + ST.patio + '"),1),""))');
  p.getRange('F13').setFormula('=IF(F11="","",IFERROR(INDEX(FILTER(REGISTRO!F2:F,REGISTRO!D2:D=F11,REGISTRO!L2:L="' + ST.patio + '"),1),""))');

  p.getRange('C14').setNote('Preenche sozinho com o nº de pessoas. Mude só se precisar.');
  p.getRange('F14').setNote('Preenche sozinho com o que foi entregue. Se voltou menos, corrija aqui.');

  // Validações
  const V = SpreadsheetApp.newDataValidation;
  p.getRange('C11').setDataValidation(V().requireValueInRange(forn.getRange('A2:A1000'), true).setAllowInvalid(true)
    .setHelpText('Escolha da lista ou digite um fornecedor novo (ele entra na lista sozinho).').build());
  p.getRange('C13:C14').setDataValidation(V().requireNumberBetween(1, 300).setAllowInvalid(false).setHelpText('Número inteiro.').build());
  p.getRange('F11').setDataValidation(V().requireValueInRange(cfg.getRange('D2:D300'), true).setAllowInvalid(false)
    .setHelpText('Só aparecem as placas que estão com coletes no pátio.').build());
  p.getRange('F14').setDataValidation(V().requireNumberBetween(0, 300).setAllowInvalid(false).setHelpText('Número inteiro.').build());

  // Botões (caixas de seleção)
  p.setRowHeight(16, 44);
  p.getRange('B16').setValue('Marque para REGISTRAR  ➜').setBackground(COR.azul);
  p.getRange('E16').setValue('Marque para CONFIRMAR  ➜').setBackground(COR.verde);
  p.getRange('B16').setFontColor(COR.branco).setFontWeight('bold').setHorizontalAlignment('right');
  p.getRange('E16').setFontColor(COR.branco).setFontWeight('bold').setHorizontalAlignment('right');
  p.getRange('C16').insertCheckboxes().setBackground(COR.amarelo).setFontColor(COR.azul).setFontSize(20).setHorizontalAlignment('center');
  p.getRange('F16').insertCheckboxes().setBackground(COR.amarelo).setFontColor(COR.verde).setFontSize(20).setHorizontalAlignment('center');

  // Mensagens
  p.setRowHeight(17, 34);
  p.getRange('B17:C17').merge().setValue('Preencha os campos amarelos e marque a caixa.');
  p.getRange('E17:F17').merge().setValue('Escolha a placa, confira a quantidade e marque a caixa.');
  p.getRange('B17:F17').setFontSize(10).setFontStyle('italic').setFontColor(COR.cinza).setWrap(true).setHorizontalAlignment('center');
  p.setRowHeight(18, 18);

  // Lista do pátio
  p.getRange('B19:F19').merge().setValue('🚚  NO PÁTIO AGORA — coletes a recolher').setBackground(COR.azul)
    .setFontColor(COR.branco).setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');
  p.setRowHeight(19, 34);
  p.getRange('B20:F20').setValues([['PLACA','FORNECEDOR','','COLETES','ENTRADA']]).setBackground(COR.amarelo)
    .setFontColor(COR.azul).setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  p.setRowHeight(20, 26);
  p.getRange('B21').setFormula('=IFERROR(FILTER({REGISTRO!D2:D,REGISTRO!C2:C},REGISTRO!L2:L="' + ST.patio + '"),"Nenhum caminhão com coletes no pátio ✔")');
  p.getRange('E21').setFormula('=IFERROR(FILTER({REGISTRO!F2:F,REGISTRO!B2:B},REGISTRO!L2:L="' + ST.patio + '"),"")');
  p.getRange('B21:F60').setHorizontalAlignment('center').setFontSize(11);
  p.getRange('B21:B60').setFontWeight('bold').setFontColor(COR.azul);
  p.getRange('E21:E60').setFontWeight('bold');
  p.getRange('F21:F60').setNumberFormat('dd/MM HH:mm');
  for (let r = 21; r <= 60; r++) p.setRowHeight(r, 28);
  p.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($E21<>"",ISEVEN(ROW()))')
      .setBackground(COR.zebra).setRanges([p.getRange('B21:F60')]).build()
  ]);
  p.setTabColor(COR.amarelo);
}
