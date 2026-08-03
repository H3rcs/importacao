/*******************************************************************************
 * 10_Fontes.gs — leitura das três planilhas da empresa
 *
 * Princípio: a coluna é localizada pelo NOME do cabeçalho, nunca pela posição.
 * Se uma coluna obrigatória sumir, a fonte inteira é abortada com aviso —
 * o ETL nunca grava dado parcial. Meio dado é pior que dado nenhum.
 ******************************************************************************/

/** Converte o valor de uma célula em Date, aceitando Date, texto ou serial. */
function paraData_(v) {
  if (!v && v !== 0) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    return new Date(ano, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // "AGO/2026", "08/2026" — usado nas metas
  m = s.match(/^([A-Za-zÀ-ú]{3,})[\/\- ](\d{4})$/);
  if (m) {
    var sig = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    var idx = sig.indexOf(norm_(m[1]).substring(0, 3));
    if (idx >= 0) return new Date(+m[2], idx, 1);
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[2], +m[1] - 1, 1);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function paraNumero_(v, padrao) {
  if (v === '' || v === null || v === undefined) return padrao;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/[^\d,.\-]/g, '').replace(',', '.'));
  return isNaN(n) ? padrao : n;
}

/** Normaliza o turno para A / B / C. Devolve '' se não reconhecer. */
function paraTurno_(v) {
  var s = norm_(v);
  if (!s) return '';
  if (s === 'A' || s === 'B' || s === 'C') return s;
  if (s.indexOf('MANHA') >= 0 || s === '1' || s === 'T1' || s === 'TURNO A') return 'A';
  if (s.indexOf('TARDE') >= 0 || s === '2' || s === 'T2' || s === 'TURNO B') return 'B';
  if (s.indexOf('NOITE') >= 0 || s === '3' || s === 'T3' || s === 'TURNO C') return 'C';
  var m = s.match(/\b([ABC])\b/);
  return m ? m[1] : '';
}

/**
 * Lê uma fonte e devolve as linhas cruas já mapeadas para os campos canônicos.
 * Lança Error se a planilha, a aba ou uma coluna obrigatória não existir.
 */
function lerFonte_(cfg) {
  if (!cfg.id) throw new Error('ID da planilha não preenchido na aba FONTES.');
  var ssFonte;
  try {
    ssFonte = SpreadsheetApp.openById(cfg.id);
  } catch (e) {
    throw new Error('Sem acesso à planilha de origem (ID inválido ou sem permissão).');
  }
  var sh = cfg.aba ? ssFonte.getSheetByName(cfg.aba) : ssFonte.getSheets()[0];
  if (!sh) throw new Error('Aba "' + cfg.aba + '" não existe na planilha de origem.');

  var vals = sh.getDataRange().getValues();
  var iCab = cfg.linhaCabecalho - 1;
  if (iCab < 0 || iCab >= vals.length) throw new Error('Linha de cabeçalho fora da planilha.');

  // cabeçalho normalizado -> índice da coluna
  var cabecalhos = {};
  for (var c = 0; c < vals[iCab].length; c++) {
    var t = norm_(vals[iCab][c]);
    if (t && cabecalhos[t] === undefined) cabecalhos[t] = c;
  }

  // campo canônico -> índice, via lista de sinônimos da aba FONTES
  var col = {};
  for (var campo in cfg.campos) {
    var lista = cfg.campos[campo];
    for (var k = 0; k < lista.length; k++) {
      if (cabecalhos[lista[k]] !== undefined) { col[campo] = cabecalhos[lista[k]]; break; }
    }
  }

  var faltando = cfg.obrigatorios.filter(function (campo) { return col[campo] === undefined; });
  if (faltando.length) {
    throw new Error('Coluna obrigatória não encontrada na origem: ' + faltando.join(', ') +
                    '. Confira o de-para de cabeçalhos na aba FONTES.');
  }

  var pega = function (linha, campo) {
    return col[campo] === undefined ? '' : linha[col[campo]];
  };

  var limite = new Date();
  limite.setDate(limite.getDate() - cfg.janela);
  limite.setHours(0, 0, 0, 0);

  var out = [];
  for (var r = iCab + 1; r < vals.length; r++) {
    var linha = vals[r];
    var vazia = linha.every(function (x) { return x === '' || x === null; });
    if (vazia) continue;

    var reg = {
      origem: cfg.nome,
      linhaOrig: r + 1,
      data: paraData_(cfg.nome === 'METAS' ? pega(linha, 'mes') : pega(linha, 'data')),
      matricula: String(pega(linha, 'matricula') || '').trim(),
      colaborador: String(pega(linha, 'colaborador') || '').trim(),
      turno: paraTurno_(pega(linha, 'turno')),
      setor: String(pega(linha, 'setor') || '').trim(),
      codigo: String(pega(linha, 'codigo') || '').trim(),
      qtde: paraNumero_(pega(linha, 'qtde'), null),
      descricao: String(pega(linha, 'descricao') || '').trim(),
      indicador: String(pega(linha, 'indicador') || '').trim(),
      meta: paraNumero_(pega(linha, 'meta'), null),
      realizado: paraNumero_(pega(linha, 'realizado'), null)
    };

    if (!reg.data) continue;                        // linha sem data não é fato
    if (cfg.nome !== 'METAS' && reg.data < limite) continue;   // fora da janela

    reg.hash = hash_([reg.origem, reg.data.getTime(), reg.matricula, reg.colaborador,
                      reg.turno, reg.setor, reg.codigo, reg.qtde, reg.indicador,
                      reg.meta, reg.realizado].join('|'));
    out.push(reg);
  }
  return out;
}

/** Grava a cópia crua na aba de staging correspondente (rastreabilidade). */
function gravarStaging_(fonte, regs) {
  var nome = 'STG_' + fonte;
  var sh = aba_(nome);
  var ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, sh.getLastColumn()).clearContent();
  if (!regs.length) return;

  var carimbo = agora_();
  var linhas = regs.map(function (r) {
    if (fonte === 'METAS') {
      return [r.origem, r.linhaOrig, r.hash, carimbo,
              r.data, r.setor, r.turno, r.indicador, r.meta, r.realizado];
    }
    return [r.origem, r.linhaOrig, r.hash, carimbo,
            r.data, r.matricula, r.colaborador, r.turno, r.setor, r.codigo, r.qtde, r.descricao];
  });
  sh.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
}
