/*******************************************************************************
 * GSL-DADOS · IMPORTADOR DE ASSIDUIDADE (v1)
 * -----------------------------------------------------------------------------
 * Planilha SEPARADA do calendário GSL Bartofil. Lê a planilha de assiduidade que
 * o RH gera a cada competência, despivota o quadro (uma coluna por dia vira uma
 * linha por dia) e empilha em FATO_ASSIDUIDADE, que é o que o Looker Studio lê.
 *
 * PRINCÍPIO DE PROJETO: nada aqui depende de posição fixa na planilha do RH.
 * Tudo que o script procura está parametrizado na aba CONFIG. Se a importação
 * não reconhecer alguma coisa, o ajuste é feito NA PLANILHA, sem abrir o código.
 *
 * ORDEM DE USO:
 *   1. Colar o link da planilha do RH em IMPORTAR!B6
 *   2. Menu GSL Dados > Pré-visualizar importação   (NÃO escreve nada)
 *   3. Conferir o relatório; se algo vier torto, ajustar a aba CONFIG e repetir
 *   4. Menu GSL Dados > Importar assiduidade
 *
 * A pré-visualização é somente leitura e pode rodar quantas vezes precisar.
 * Nenhuma linha é gravada enquanto ela acusar erro.
 ******************************************************************************/

var ABA_IMP = 'IMPORTAR', ABA_CFG = 'CONFIG', ABA_DP = 'DE-PARA',
    ABA_FATO = 'FATO_ASSIDUIDADE', ABA_COL = 'COLABORADORES';

var CEL_LINK = 'B6', CEL_COMP = 'B8', LIN_HIST = 12;
var LIN_FATO = 6, LIN_DP = 6, LIN_COLAB = 6;
var COR_AZUL = '#111785', COR_VERDE = '#01973A', COR_VERM = '#D71920', COR_AMAR = '#B45309';

// ------------------------------------------------------------------ menu
function onOpen() {
  SpreadsheetApp.getUi().createMenu('GSL Dados')
    .addItem('1 · Pré-visualizar importação (não grava nada)', 'previewImportacao')
    .addItem('2 · Importar assiduidade', 'importarAssiduidade')
    .addSeparator()
    .addItem('Reclassificar códigos (após mexer no DE-PARA)', 'reclassificarCodigos')
    .addItem('Códigos sem tradução', 'codigosPendentes')
    .addSeparator()
    .addItem('Conferir a aba CONFIG', 'conferirConfig')
    .addToUi();
}

// ------------------------------------------------------------------ utilidades
function ss_() { return SpreadsheetApp.getActive(); }
function tzD_() { return ss_().getSpreadsheetTimeZone(); }

/** Texto sem acento, sem espaço duplo, em maiúsculas — para comparar rótulos. */
function norm_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[àáâãä]/gi, 'A').replace(/[èéêë]/gi, 'E').replace(/[ìíîï]/gi, 'I')
    .replace(/[òóôõö]/gi, 'O').replace(/[ùúûü]/gi, 'U').replace(/[ç]/gi, 'C')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Forma canônica de um código, para o DE-PARA casar com a planilha do RH mesmo
 * quando um lado vem como texto e o outro como número: '003', 003 e 3 são o
 * mesmo código; '6.1' e 6.1 também.
 */
function codigo_(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v).trim().toUpperCase().replace(',', '.');
  if (/^[0-9]*\.?[0-9]+$/.test(s)) {
    var n = Number(s);
    if (!isNaN(n)) return String(n);
  }
  return s;
}

function letraNum_(l) {
  var s = norm_(l).replace(/[^A-Z]/g, ''), n = 0;
  if (!s) return 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function dataBr_(d) { return Utilities.formatDate(d, tzD_(), 'dd/MM/yyyy'); }
function ym_(d) { return Utilities.formatDate(d, tzD_(), 'yyyy-MM'); }

/** Aceita Date, "21/07/2026" ou "2026-07-21". */
function paraData_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var s = String(v || '').trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var a = Number(m[3]); if (a < 100) a += 2000;
    return new Date(a, Number(m[2]) - 1, Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

// ------------------------------------------------------------------ CONFIG
function cfgD_() {
  var c = ss_().getSheetByName(ABA_CFG);
  if (!c) throw new Error('Aba CONFIG não encontrada.');
  var v = c.getRange('C6:C25').getValues();          // C6 = índice 0
  function g(lin) { return v[lin - 6][0]; }

  var turnos = String(g(7) || 'ADM,A,B,C').split(',')
    .map(function (t) { return norm_(t); }).filter(Boolean)
    .sort(function (a, b) { return b.length - a.length; });   // ADM antes de A

  var blocos = c.getRange('B29:D32').getValues().map(function (l) {
    return { turno: norm_(l[0]), ini: Number(l[1]) || 0, fim: Number(l[2]) || 0 };
  });

  return {
    diaIni: Number(g(6)) || 21,
    turnos: turnos,
    palavraBloco: norm_(g(8) || 'TURNO'),
    cabMat: norm_(g(9) || 'MATRICULA'),
    cabNome: norm_(g(10) || 'NOME'),
    ignorar: String(g(11) || 'HORAS TRABALHADAS').split(',')
      .map(function (t) { return norm_(t); }).filter(Boolean),
    rotuloData: norm_(g(12) || 'DATA INICIAL'),
    abaOrigem: String(g(13) || '').trim(),
    gravarNome: norm_(g(14)) !== 'NAO',
    brancoFimBloco: Number(g(15)) || 3,
    manual: norm_(g(19)) === 'MANUAL',
    mLinCab: Number(g(20)) || 0,
    mColMat: letraNum_(g(21)),
    mColNome: letraNum_(g(22)),
    mColIni: letraNum_(g(23)),
    mColFim: letraNum_(g(24)),
    mDataIni: paraData_(g(25)),
    mBlocos: blocos.filter(function (b) { return b.ini > 0; })
  };
}

// ------------------------------------------------------------------ origem
function abrirOrigem_() {
  var imp = ss_().getSheetByName(ABA_IMP);
  var link = String(imp.getRange(CEL_LINK).getValue() || '').trim();
  if (!link || link.indexOf('COLE_O_LINK') > -1) {
    throw new Error('Cole o link da planilha do RH em ' + ABA_IMP + '!' + CEL_LINK + '.');
  }
  var arq;
  try { arq = SpreadsheetApp.openByUrl(link); }
  catch (err) {
    throw new Error('Não consegui abrir a planilha do link. Verifique se você tem acesso a ela ' +
                    'e se o link é de uma Planilha Google (não de um .xlsx no Drive).');
  }
  var cfg = cfgD_();
  var sh = cfg.abaOrigem ? arq.getSheetByName(cfg.abaOrigem) : arq.getSheets()[0];
  if (!sh) throw new Error('Aba "' + cfg.abaOrigem + '" não existe nessa planilha. ' +
                           'Corrija CONFIG!C13 ou deixe em branco para usar a primeira aba.');
  return { arq: arq, sh: sh, link: link };
}

// ------------------------------------------------------------------ detecção
/**
 * Descobre onde estão os blocos de turno, as colunas e as datas.
 * Nunca lança erro: devolve o que achou + a lista de problemas, para a
 * pré-visualização poder mostrar tudo de uma vez.
 */
function detectar_(m, cfg) {
  var erros = [], avisos = [];
  var nLin = m.length, nCol = 0;
  for (var i = 0; i < nLin; i++) nCol = Math.max(nCol, m[i].length);

  // ---- 1. data inicial da folha
  var dataIni = cfg.manual && cfg.mDataIni ? cfg.mDataIni : null;
  if (!dataIni) {
    for (var r = 0; r < Math.min(nLin, 40) && !dataIni; r++) {
      for (var c = 0; c < nCol; c++) {
        if (norm_(m[r][c]).indexOf(cfg.rotuloData) > -1) {
          for (var k = c + 1; k < nCol; k++) {
            var d = paraData_(m[r][k]);
            if (d) { dataIni = d; break; }
          }
        }
        if (dataIni) break;
      }
    }
  }
  if (!dataIni) erros.push('Não encontrei a DATA INICIAL da folha. Preencha CONFIG!C25 no formato dd/mm/aaaa.');

  // ---- 2. blocos de turno
  var blocos = [];
  if (cfg.manual && cfg.mBlocos.length) {
    blocos = cfg.mBlocos.map(function (b) {
      return { turno: b.turno, linTit: b.ini - 1, ini: b.ini - 1, fim: (b.fim || nLin) - 1, manual: true };
    });
  } else {
    var re = new RegExp(cfg.palavraBloco + '\\s+(' + cfg.turnos.join('|') + ')(?![A-Z])', 'i');
    for (var r2 = 0; r2 < nLin; r2++) {
      var linha = m[r2].map(norm_).join(' ');
      var mt = linha.match(re);
      if (mt) blocos.push({ turno: norm_(mt[1]), linTit: r2, manual: false });
    }
    for (var b = 0; b < blocos.length; b++) {
      blocos[b].fim = (b + 1 < blocos.length ? blocos[b + 1].linTit - 1 : nLin - 1);
    }
  }
  if (!blocos.length) {
    erros.push('Não encontrei nenhum bloco de turno. Ajuste CONFIG!C8 (palavra que marca o bloco) ' +
               'ou preencha as linhas de cada turno na seção C da CONFIG.');
  } else {
    var achados = blocos.map(function (b) { return b.turno; });
    cfg.turnos.forEach(function (t) {
      if (achados.indexOf(t) < 0) avisos.push('O turno ' + t + ' está na CONFIG mas não foi encontrado na planilha.');
    });
  }

  // ---- 3. cabeçalho, colunas e datas de cada bloco
  blocos.forEach(function (b) {
    var lim = Math.min(b.fim, b.linTit + 12);
    b.linCab = -1;

    if (cfg.manual && cfg.mLinCab) {
      b.linCab = cfg.mLinCab - 1;
    } else {
      for (var r = b.linTit; r <= lim && b.linCab < 0; r++) {
        for (var c = 0; c < nCol; c++) {
          if (norm_(m[r][c]).indexOf(cfg.cabMat) > -1) { b.linCab = r; break; }
        }
      }
    }
    if (b.linCab < 0) {
      erros.push('Turno ' + b.turno + ': não achei a linha do cabeçalho "' + cfg.cabMat +
                 '". Ajuste CONFIG!C9 ou preencha CONFIG!C20.');
      return;
    }

    // colunas de matrícula e nome
    b.colMat = cfg.manual && cfg.mColMat ? cfg.mColMat - 1 : -1;
    b.colNome = cfg.manual && cfg.mColNome ? cfg.mColNome - 1 : -1;
    for (var c2 = 0; c2 < nCol; c2++) {
      var t = norm_(m[b.linCab][c2]);
      if (b.colMat < 0 && t.indexOf(cfg.cabMat) > -1) b.colMat = c2;
      if (b.colNome < 0 && t === cfg.cabNome) b.colNome = c2;
    }
    if (b.colMat < 0) erros.push('Turno ' + b.turno + ': não achei a coluna de matrícula. Preencha CONFIG!C21.');
    if (b.colNome < 0) avisos.push('Turno ' + b.turno + ': não achei a coluna de nome — só a matrícula será gravada.');

    // colunas de data: a linha com a maior sequência de números de 1 a 31
    if (cfg.manual && cfg.mColIni && cfg.mColFim) {
      b.linDias = b.linCab;
      b.cols = [];
      for (var c3 = cfg.mColIni - 1; c3 <= cfg.mColFim - 1; c3++) {
        var dia = Number(m[b.linCab][c3]);
        if (dia >= 1 && dia <= 31) b.cols.push({ col: c3, dia: dia });
      }
    } else {
      var melhor = { qtd: 0, lin: -1, cols: [] };
      for (var r3 = Math.max(0, b.linCab - 2); r3 <= Math.min(b.fim, b.linCab + 2); r3++) {
        var cols = [];
        for (var c4 = 0; c4 < nCol; c4++) {
          var v = m[r3][c4], n = Number(v);
          if (v !== '' && !isNaN(n) && n >= 1 && n <= 31 && String(v).indexOf('.') < 0) {
            cols.push({ col: c4, dia: n });
          }
        }
        if (cols.length > melhor.qtd) melhor = { qtd: cols.length, lin: r3, cols: cols };
      }
      b.linDias = melhor.lin;
      b.cols = melhor.cols;
    }
    if (b.cols.length < 7) {
      erros.push('Turno ' + b.turno + ': achei só ' + b.cols.length + ' coluna(s) de data. ' +
                 'Preencha CONFIG!C23 e C24 com a primeira e a última letra de coluna.');
    }

    // datas reais: o cabeçalho traz só o dia; a virada de mês vem da sequência
    if (dataIni && b.cols.length) {
      var ano = dataIni.getFullYear(), mes = dataIni.getMonth(), ult = 0;
      b.datas = b.cols.map(function (cd) {
        if (ult && cd.dia < ult) { mes++; if (mes > 11) { mes = 0; ano++; } }
        ult = cd.dia;
        return new Date(ano, mes, cd.dia);
      });
    } else {
      b.datas = [];
    }
  });

  return { blocos: blocos, dataIni: dataIni, erros: erros, avisos: avisos, nLin: nLin, nCol: nCol };
}

/** Competência: o período fecha no dia (diaIni - 1) do mês seguinte. */
function competencia_(d, diaIni) {
  var ano = d.getFullYear(), mes = d.getMonth();
  if (d.getDate() >= diaIni) { mes++; if (mes > 11) { mes = 0; ano++; } }
  return Utilities.formatDate(new Date(ano, mes, 1), tzD_(), 'yyyy-MM');
}

// ------------------------------------------------------------------ extração
function extrair_(m, det, cfg) {
  var regs = [], nomes = {}, codigos = {}, porTurno = {}, comps = {};

  det.blocos.forEach(function (b) {
    if (b.linCab < 0 || b.colMat < 0 || !b.datas.length) return;
    porTurno[b.turno] = porTurno[b.turno] || { pessoas: 0, celulas: 0 };
    var brancos = 0;

    for (var r = b.linCab + 1; r <= b.fim; r++) {
      var linTxt = m[r].map(norm_).join(' ');
      var pular = false;
      cfg.ignorar.forEach(function (ig) { if (ig && linTxt.indexOf(ig) > -1) pular = true; });
      if (pular) continue;

      var mat = String(m[r][b.colMat] === null ? '' : m[r][b.colMat]).trim();
      if (!mat) { if (++brancos >= cfg.brancoFimBloco) break; continue; }
      brancos = 0;
      if (!/[0-9]/.test(mat)) continue;                      // linha de título solta

      porTurno[b.turno].pessoas++;
      if (b.colNome >= 0) {
        var nm = String(m[r][b.colNome] || '').trim();
        if (nm) nomes[mat] = { nome: nm, turno: b.turno };
      }

      for (var k = 0; k < b.cols.length; k++) {
        var bruto = m[r][b.cols[k].col];
        var cod = codigo_(bruto);
        if (!cod) continue;
        var data = b.datas[k];
        var comp = competencia_(data, cfg.diaIni);
        codigos[cod] = (codigos[cod] || 0) + 1;
        comps[comp] = (comps[comp] || 0) + 1;
        porTurno[b.turno].celulas++;
        regs.push({ data: data, comp: comp,
                    mesCal: Utilities.formatDate(data, tzD_(), 'yyyy-MM'),
                    mat: mat, turno: b.turno, cod: cod });
      }
    }
  });

  // competência dominante (a folha pode pegar dois meses; vale a que tem mais dias)
  var comp = '', maior = -1;
  Object.keys(comps).forEach(function (k) { if (comps[k] > maior) { maior = comps[k]; comp = k; } });

  return { regs: regs, nomes: nomes, codigos: codigos, porTurno: porTurno,
           comps: comps, compPrincipal: comp };
}

// ------------------------------------------------------------------ DE-PARA
function dePara_() {
  var sh = ss_().getSheetByName(ABA_DP);
  var mapa = {};
  if (!sh) return mapa;
  var last = sh.getLastRow();
  if (last < LIN_DP) return mapa;
  sh.getRange(LIN_DP, 1, last - LIN_DP + 1, 4).getValues().forEach(function (l) {
    var c = codigo_(l[0]);
    if (c) mapa[c] = { cat: String(l[2] || 'A CONFIRMAR'), aus: String(l[3] || '') };
  });
  return mapa;
}

// ------------------------------------------------------------------ 1 · PRÉVIA
function previewImportacao() {
  var ui = SpreadsheetApp.getUi();
  var org, det, ext, cfg;
  try {
    cfg = cfgD_();
    org = abrirOrigem_();
    var m = org.sh.getDataRange().getValues();
    det = detectar_(m, cfg);
    ext = extrair_(m, det, cfg);
  } catch (err) {
    ui.alert('Não deu para ler a planilha\n\n' + err.message);
    return;
  }

  var dp = dePara_(), semTrad = [];
  Object.keys(ext.codigos).forEach(function (c) { if (!dp[c]) semTrad.push(c); });

  var h = '<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">';
  h += '<div style="background:' + COR_AZUL + ';color:#fff;padding:12px 16px;font-size:15px;font-weight:bold">' +
       'PRÉ-VISUALIZAÇÃO — nada foi gravado</div><div style="padding:14px 16px">';
  h += '<p><b>Origem:</b> ' + org.arq.getName() + ' · aba "' + org.sh.getName() + '" · ' +
       det.nLin + ' linhas × ' + det.nCol + ' colunas</p>';

  if (det.erros.length) {
    h += '<p style="color:' + COR_VERM + ';font-weight:bold">PROBLEMAS ENCONTRADOS — corrija a aba CONFIG e rode de novo</p><ul>';
    det.erros.forEach(function (e) { h += '<li style="margin:4px 0;color:' + COR_VERM + '">' + e + '</li>'; });
    h += '</ul>';
  }
  if (det.avisos.length) {
    h += '<p style="color:' + COR_AMAR + ';font-weight:bold">Avisos</p><ul>';
    det.avisos.forEach(function (e) { h += '<li style="margin:4px 0;color:' + COR_AMAR + '">' + e + '</li>'; });
    h += '</ul>';
  }

  h += '<p><b>Data inicial lida:</b> ' + (det.dataIni ? dataBr_(det.dataIni) : '<span style="color:' + COR_VERM + '">não encontrada</span>') + '</p>';

  h += '<table style="border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0">' +
       '<tr style="background:' + COR_AZUL + ';color:#fff">' +
       ['Turno', 'Linha do bloco', 'Cabeçalho', 'Colaboradores', 'Colunas de data', 'Período lido', 'Lançamentos']
         .map(function (x) { return '<th style="padding:5px 8px;text-align:left">' + x + '</th>'; }).join('') + '</tr>';
  det.blocos.forEach(function (b, i) {
    var pt = ext.porTurno[b.turno] || { pessoas: 0, celulas: 0 };
    var per = b.datas.length ? dataBr_(b.datas[0]) + ' a ' + dataBr_(b.datas[b.datas.length - 1]) : '—';
    h += '<tr style="background:' + (i % 2 ? '#f8f9fc' : '#fff') + '">' +
      ['Turno ' + b.turno, b.linTit + 1, b.linCab < 0 ? '—' : b.linCab + 1, pt.pessoas,
       b.cols.length, per, pt.celulas]
        .map(function (x) { return '<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">' + x + '</td>'; }).join('') + '</tr>';
  });
  h += '</table>';

  h += '<p><b>Total a importar:</b> ' + ext.regs.length + ' linha(s) · ' +
       '<b>competência:</b> ' + (ext.compPrincipal || '—') + '</p>';

  var listaComp = Object.keys(ext.comps).sort();
  if (listaComp.length > 1) {
    h += '<p style="color:' + COR_AMAR + '">A folha cobre mais de uma competência: ' +
         listaComp.map(function (k) { return k + ' (' + ext.comps[k] + ')'; }).join(' · ') +
         '. Cada linha guarda a sua — nenhuma será perdida.</p>';
  }

  var cods = Object.keys(ext.codigos).sort();
  h += '<p><b>Códigos encontrados (' + cods.length + '):</b> ' +
       cods.map(function (c) {
         return dp[c] ? c + '<span style="color:#6b7280">(' + ext.codigos[c] + ')</span>'
                      : '<b style="color:' + COR_VERM + '">' + c + '(' + ext.codigos[c] + ')</b>';
       }).join(' · ') + '</p>';
  if (semTrad.length) {
    h += '<p style="color:' + COR_VERM + '"><b>Sem tradução no DE-PARA:</b> ' + semTrad.join(', ') +
         '. Eles entram como "A CONFIRMAR" — acrescente as linhas no DE-PARA antes de publicar o painel.</p>';
  }

  h += '<p style="margin-top:14px;padding:10px;background:' +
       (det.erros.length ? '#FEF2F2' : '#F0FDF4') + ';border-left:4px solid ' +
       (det.erros.length ? COR_VERM : COR_VERDE) + '">' +
       (det.erros.length
         ? 'Corrija os pontos acima na aba CONFIG e rode a pré-visualização de novo. A importação não deve ser feita assim.'
         : 'Está pronto. Se os números acima batem com a planilha do RH, use <b>GSL Dados &gt; Importar assiduidade</b>.') +
       '</p></div></div>';

  ui.showModalDialog(HtmlService.createHtmlOutput(h).setWidth(880).setHeight(640),
                     'Pré-visualização da importação');
}

// ------------------------------------------------------------------ 2 · IMPORTAR
function importarAssiduidade() {
  var ui = SpreadsheetApp.getUi();
  var cfg, org, det, ext;
  try {
    cfg = cfgD_();
    org = abrirOrigem_();
    var m = org.sh.getDataRange().getValues();
    det = detectar_(m, cfg);
    ext = extrair_(m, det, cfg);
  } catch (err) {
    ui.alert('Não deu para ler a planilha\n\n' + err.message);
    return;
  }

  if (det.erros.length) {
    ui.alert('Importação cancelada\n\nA leitura da planilha do RH tem ' + det.erros.length +
             ' problema(s):\n\n• ' + det.erros.join('\n• ') +
             '\n\nAjuste a aba CONFIG e rode a pré-visualização antes de importar.');
    return;
  }
  if (!ext.regs.length) {
    ui.alert('Nada a importar — não encontrei nenhum lançamento nas colunas de data.');
    return;
  }

  var comps = Object.keys(ext.comps).sort();
  var resp = ui.alert('Confirmar importação',
    ext.regs.length + ' linha(s) serão gravadas.\n' +
    'Competência(s): ' + comps.join(', ') + '\n\n' +
    'Se alguma dessas competências já estiver na base, as linhas dela serão SUBSTITUÍDAS.\n\n' +
    'Rodou a pré-visualização e os números bateram?', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var dp = dePara_();
  var fato = ss_().getSheetByName(ABA_FATO);
  var agora = new Date();
  var quem = String(Session.getActiveUser().getEmail() || '') || 'não identificado';

  // ---- limpa a linha de exemplo, se ainda estiver lá
  if (fato.getLastRow() >= LIN_FATO &&
      String(fato.getRange(LIN_FATO, 9).getValue()).indexOf('(exemplo)') === 0) {
    fato.deleteRow(LIN_FATO);
  }

  // ---- remove as competências que estão sendo reimportadas
  var removidas = 0;
  var last = fato.getLastRow();
  if (last >= LIN_FATO) {
    var atual = fato.getRange(LIN_FATO, 2, last - LIN_FATO + 1, 1).getValues();
    for (var r = atual.length - 1; r >= 0; r--) {
      if (comps.indexOf(String(atual[r][0])) > -1) {
        fato.deleteRow(LIN_FATO + r);
        removidas++;
      }
    }
  }

  // ---- grava em bloco (setValues, nunca appendRow: 4 mil linhas estouraria o tempo)
  var linhas = ext.regs.map(function (g) {
    var t = dp[g.cod] || { cat: 'A CONFIRMAR', aus: '' };
    return [g.data, g.comp, g.mesCal, g.mat, g.turno, g.cod, t.cat, t.aus, agora, org.link];
  });
  linhas.sort(function (a, b) {
    if (a[0] - b[0]) return a[0] - b[0];
    if (a[4] < b[4]) return -1;
    if (a[4] > b[4]) return 1;
    return String(a[3]) < String(b[3]) ? -1 : 1;
  });

  var ini = Math.max(fato.getLastRow() + 1, LIN_FATO);
  var PASSO = 4000;
  for (var i = 0; i < linhas.length; i += PASSO) {
    var pedaco = linhas.slice(i, i + PASSO);
    fato.getRange(ini + i, 1, pedaco.length, 10).setValues(pedaco);
  }
  fato.getRange(ini, 1, linhas.length, 1).setNumberFormat('dd/mm/yyyy');
  fato.getRange(ini, 9, linhas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  fato.getRange(ini, 1, linhas.length, 10).setFontFamily('Arial').setFontSize(9.5);

  // ---- COLABORADORES
  var novos = 0;
  if (cfg.gravarNome) {
    var colab = ss_().getSheetByName(ABA_COL);
    var lc = colab.getLastRow();
    if (lc >= LIN_COLAB && String(colab.getRange(LIN_COLAB, 5).getValue()).indexOf('Preenchida pelo script') === 0) {
      colab.deleteRow(LIN_COLAB);
      lc = colab.getLastRow();
    }
    var existentes = {};
    if (lc >= LIN_COLAB) {
      colab.getRange(LIN_COLAB, 1, lc - LIN_COLAB + 1, 1).getValues()
        .forEach(function (l, k) { existentes[String(l[0]).trim()] = LIN_COLAB + k; });
    }
    var add = [];
    Object.keys(ext.nomes).forEach(function (mat) {
      var d = ext.nomes[mat];
      if (existentes[mat]) {
        colab.getRange(existentes[mat], 3, 1, 2).setValues([[d.turno, agora]]);
      } else {
        add.push([mat, d.nome, d.turno, agora, '']);
        novos++;
      }
    });
    if (add.length) {
      var li = Math.max(colab.getLastRow() + 1, LIN_COLAB);
      colab.getRange(li, 1, add.length, 5).setValues(add);
      colab.getRange(li, 4, add.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      colab.getRange(li, 1, add.length, 5).setFontFamily('Arial').setFontSize(9.5);
    }
  }

  // ---- histórico e competência detectada
  var semTrad = [];
  Object.keys(ext.codigos).forEach(function (c) { if (!dp[c]) semTrad.push(c); });
  var imp = ss_().getSheetByName(ABA_IMP);
  imp.getRange(CEL_COMP).setValue(comps.join(', '));
  var lh = Math.max(imp.getLastRow() + 1, LIN_HIST);
  if (lh === LIN_HIST && String(imp.getRange(LIN_HIST, 1).getValue()).indexOf('(exemplo)') === 0) {
    imp.getRange(LIN_HIST, 1, 1, 6).clearContent();
  } else if (lh > LIN_HIST) {
    lh = imp.getLastRow() + 1;
  }
  imp.getRange(lh, 1, 1, 6).setValues([[agora, comps.join(', '), linhas.length,
                                        semTrad.length ? semTrad.join(', ') : '—', quem, org.link]]);
  imp.getRange(lh, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  imp.getRange(lh, 1, 1, 6).setFontFamily('Arial').setFontSize(9.5);

  ui.alert('Importação concluída\n\n' +
    linhas.length + ' linha(s) gravadas em ' + ABA_FATO + '.\n' +
    (removidas ? removidas + ' linha(s) da(s) mesma(s) competência(s) foram substituídas.\n' : '') +
    (novos ? novos + ' colaborador(es) novo(s) na aba COLABORADORES.\n' : '') +
    (semTrad.length ? '\nATENÇÃO: os códigos ' + semTrad.join(', ') +
      ' entraram como "A CONFIRMAR". Acrescente-os no DE-PARA e use ' +
      '"Reclassificar códigos" antes de publicar o painel.' : '\nTodos os códigos foram traduzidos.'));
}

// ------------------------------------------------------------------ reclassificar
/** Reescreve CATEGORIA e AUSÊNCIA de todo o histórico a partir do DE-PARA atual. */
function reclassificarCodigos() {
  var ui = SpreadsheetApp.getUi();
  var fato = ss_().getSheetByName(ABA_FATO);
  var last = fato.getLastRow();
  if (last < LIN_FATO) { ui.alert('A base ainda está vazia.'); return; }

  var dp = dePara_();
  var n = last - LIN_FATO + 1;
  var cods = fato.getRange(LIN_FATO, 6, n, 1).getValues();
  var saida = [], mudou = 0, pend = {};
  var atual = fato.getRange(LIN_FATO, 7, n, 2).getValues();

  for (var i = 0; i < n; i++) {
    var c = codigo_(cods[i][0]);
    var t = dp[c] || { cat: 'A CONFIRMAR', aus: '' };
    if (!dp[c] && c) pend[c] = true;
    if (String(atual[i][0]) !== t.cat || String(atual[i][1]) !== t.aus) mudou++;
    saida.push([t.cat, t.aus]);
  }
  fato.getRange(LIN_FATO, 7, n, 2).setValues(saida);

  var lista = Object.keys(pend);
  ui.alert('Reclassificação concluída\n\n' + n + ' linha(s) revistas · ' + mudou + ' alterada(s).' +
    (lista.length ? '\n\nAinda sem tradução no DE-PARA: ' + lista.join(', ') : '\n\nTodos os códigos estão traduzidos.'));
}

// ------------------------------------------------------------------ pendências
function codigosPendentes() {
  var fato = ss_().getSheetByName(ABA_FATO);
  var last = fato.getLastRow();
  if (last < LIN_FATO) { SpreadsheetApp.getUi().alert('A base ainda está vazia.'); return; }
  var dp = dePara_(), pend = {};
  fato.getRange(LIN_FATO, 6, last - LIN_FATO + 1, 1).getValues().forEach(function (l) {
    var c = codigo_(l[0]);
    if (c && !dp[c]) pend[c] = (pend[c] || 0) + 1;
  });
  var ks = Object.keys(pend).sort();
  SpreadsheetApp.getUi().alert(ks.length
    ? 'CÓDIGOS SEM TRADUÇÃO NO DE-PARA\n\n' +
      ks.map(function (k) { return '  ' + k + ' — ' + pend[k] + ' lançamento(s)'; }).join('\n') +
      '\n\nAcrescente cada um na aba DE-PARA e rode "Reclassificar códigos".'
    : 'Nenhum código pendente. Todos os lançamentos estão traduzidos no DE-PARA.');
}

// ------------------------------------------------------------------ conferência
function conferirConfig() {
  var itens = [];
  function chk(ok, txt) { itens.push((ok ? '✔ ' : '✖ ') + txt); }
  var cfg;
  try { cfg = cfgD_(); }
  catch (err) { SpreadsheetApp.getUi().alert('CONFIG ilegível: ' + err.message); return; }

  chk(cfg.diaIni >= 1 && cfg.diaIni <= 28, 'Dia de início da competência: ' + cfg.diaIni);
  chk(cfg.turnos.length > 0, 'Turnos considerados: ' + cfg.turnos.join(', '));
  chk(!!cfg.palavraBloco, 'Palavra do bloco: "' + cfg.palavraBloco + '"');
  chk(!!cfg.cabMat, 'Cabeçalho de matrícula: "' + cfg.cabMat + '"');
  chk(!!cfg.rotuloData, 'Rótulo da data inicial: "' + cfg.rotuloData + '"');
  itens.push((cfg.manual ? '• ' : '• ') + 'Modo de leitura: ' + (cfg.manual ? 'MANUAL' : 'Automático'));
  if (cfg.manual) {
    chk(cfg.mBlocos.length > 0 || cfg.mLinCab > 0 || cfg.mColIni > 0,
        'Modo manual com pelo menos um campo preenchido');
  }
  ['INÍCIO', ABA_IMP, ABA_DP, ABA_FATO, ABA_COL, 'RESUMO_BI', ABA_CFG].forEach(function (n) {
    chk(!!ss_().getSheetByName(n), 'Aba ' + n + ' presente');
  });
  var dp = dePara_();
  var nDp = Object.keys(dp).length;
  chk(nDp > 0, 'DE-PARA com ' + nDp + ' código(s) cadastrado(s)');
  var aConf = 0;
  Object.keys(dp).forEach(function (k) { if (dp[k].cat === 'A CONFIRMAR') aConf++; });
  chk(aConf === 0, aConf ? aConf + ' código(s) ainda marcados como "A CONFIRMAR" no DE-PARA'
                         : 'Nenhum código pendente no DE-PARA');
  var link = String(ss_().getSheetByName(ABA_IMP).getRange(CEL_LINK).getValue() || '');
  chk(link.indexOf('http') === 0 && link.indexOf('COLE_O_LINK') < 0, 'Link da planilha do RH preenchido');

  SpreadsheetApp.getUi().alert('CONFERÊNCIA DA CONFIGURAÇÃO\n\n' + itens.join('\n'));
}
