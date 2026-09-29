/**
 * QUADRO DO CD — o BI de funcoes dentro do GSL.
 *
 * Continua lendo a MESMA planilha de apoio de antes (abas APOIO TA,
 * APOIO TB, APOIO TC, CADMITIDOS e CDESLIGADOS) e desenhando o mesmo
 * painel. A diferenca e que ele agora mora no GSL, com o acesso do GSL,
 * e cada filial aponta para a planilha dela (parametro QUADRO_PLANILHA).
 *
 * Novidade pedida pela gerencia: o MOTIVO do desligamento, lido da
 * coluna MOTIVO da aba CDESLIGADOS.
 */

const QUADRO_ABAS_APOIO = ['APOIO TA', 'APOIO TB', 'APOIO TC'];
const QUADRO_ABA_ADMITIDOS = 'CADMITIDOS';
const QUADRO_ABA_DESLIGADOS = 'CDESLIGADOS';

/*
 * A aba e achada pelo nome sem diferenciar maiuscula, acento, espaco ou
 * pontuacao, e por apelidos: a planilha de apoio de algumas filiais chama
 * "CDADMITIDOS" (e nao "CADMITIDOS") — e a aba inteira era ignorada, sem
 * admitido nenhum no Quadro.
 */
const QUADRO_APELIDOS = {
  CADMITIDOS: { nomes: ['CADMITIDOS', 'CDADMITIDOS', 'ADMITIDOS', 'ADMISSOES', 'CADMISSOES', 'CDADMISSOES'], pedacos: ['ADMITID', 'ADMISS'] },
  CDESLIGADOS: { nomes: ['CDESLIGADOS', 'CDDESLIGADOS', 'DESLIGADOS', 'DESLIGAMENTOS', 'CDESLIGAMENTOS', 'CDDESLIGAMENTOS'], pedacos: ['DESLIG', 'DEMITID', 'DEMISS'] }
};
function chaveAbaQ_(nome) { return normalizaQ_(nome).replace(/[^A-Z0-9]/g, ''); }
function abaQuadro_(ss, nomeAba) {
  const exata = ss.getSheetByName(nomeAba);
  if (exata) return exata;
  const abas = ss.getSheets();
  const alvo = chaveAbaQ_(nomeAba);
  const ap = QUADRO_APELIDOS[nomeAba] || { nomes: [], pedacos: [] };
  const nomes = [alvo].concat(ap.nomes);
  const porNome = abas.filter(function (a) { return nomes.indexOf(chaveAbaQ_(a.getName())) !== -1; })[0];
  if (porNome) return porNome;
  return abas.filter(function (a) {
    const k = chaveAbaQ_(a.getName());
    return ap.pedacos.some(function (x) { return k.indexOf(x) !== -1; });
  })[0] || null;
}
const QUADRO_CACHE_SEGUNDOS = 300;

function idPlanilhaQuadro_() {
  const bruto = String(parametro('QUADRO_PLANILHA', '') || '').trim();
  if (!bruto) return '';
  const m = bruto.match(/\/d\/([\w-]{20,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(bruto) ? bruto : '';
}

function dadosQuadro(usuario) {
  const id = idPlanilhaQuadro_();
  const base = {
    configurado: !!id,
    podeConfigurar: podeFazer(usuario, 'PROGRAMAR'),
    filial: filialAtual().nome
  };
  if (!id) return base;

  const chave = chaveNoEspaco('quadro|' + id);
  const guardado = lerTextoCache(chave);
  if (guardado) {
    try { return Object.assign(base, JSON.parse(guardado)); } catch (e) { /* le de novo */ }
  }
  try {
    const dados = lerPlanilhaQuadro_(id);
    gravarTextoCache(chave, JSON.stringify(dados), QUADRO_CACHE_SEGUNDOS);
    return Object.assign(base, dados);
  } catch (e) {
    base.erro = 'Não consegui ler a planilha do Quadro: ' + (e.message || e) +
      '. Confira se o link está certo e se a conta dona do GSL tem acesso a ela.';
    return base;
  }
}

function lerPlanilhaQuadro_(id) {
exigirPorta_();
  const ss = SpreadsheetApp.openById(id);
  const apoio = [];
  QUADRO_ABAS_APOIO.forEach(function (nomeAba) {
    const turnoPadrao = nomeAba.replace(/APOIO\s*/i, '').trim().toUpperCase();
    lerAbaQuadro_(ss, nomeAba).forEach(function (linha) {
      const reg = {
        cod:    txtQ_(pegaQ_(linha, ['COD', 'PRODUTIVO'])),
        nome:   txtQ_(pegaQ_(linha, ['COLABORADOR', 'NOME'])),
        equipe: txtQ_(pegaQ_(linha, ['EQUIPE', 'TURNO'])).toUpperCase() || turnoPadrao,
        funcao: txtQ_(pegaQ_(linha, ['FUNCAO', 'CARGO'])).toUpperCase()
      };
      if (reg.nome || reg.cod) apoio.push(reg);
    });
  });

  const adm = lerAbaQuadro_(ss, QUADRO_ABA_ADMITIDOS).map(function (linha) {
    return {
      cod:    txtQ_(pegaQ_(linha, ['COD', 'PRODUTIVO'])),
      nome:   txtQ_(pegaQ_(linha, ['COLABORADOR', 'NOME'])),
      equipe: txtQ_(pegaQ_(linha, ['EQUIPE', 'TURNO'])).toUpperCase(),
      funcao: txtQ_(pegaQ_(linha, ['FUNCAO', 'CARGO'])).toUpperCase(),
      mes:    aoMesQ_(pegaQ_(linha, ['ADMISS', 'ADMIT', 'DATA', 'ENTRADA', 'INICIO', 'MES'], ['MOTIVO', 'TIPO']))
    };
  }).filter(function (r) { return r.mes; });

  const des = lerAbaQuadro_(ss, QUADRO_ABA_DESLIGADOS).map(function (linha) {
    const quando = pegaQ_(linha, ['DESLIG', 'DEMISS', 'DATA'], ['MOTIVO', 'TIPO']);
    return {
      cod:    txtQ_(pegaQ_(linha, ['COD', 'PRODUTIVO'])),
      nome:   txtQ_(pegaQ_(linha, ['COLABORADOR', 'NOME'])),
      equipe: txtQ_(pegaQ_(linha, ['EQUIPE', 'TURNO'])).toUpperCase(),
      funcao: txtQ_(pegaQ_(linha, ['FUNCAO', 'CARGO'])).toUpperCase(),
      mes:    aoMesQ_(quando),
      data:   dataQ_(quando),
      tipo:   txtQ_(pegaQ_(linha, ['TIPO'], ['MOTIVO'])) || 'Não informado',
      motivo: txtQ_(pegaQ_(linha, ['MOTIVO']))
    };
  }).filter(function (r) { return r.mes; });

  return {
    apoio: apoio, adm: adm, des: des, atualizado: new Date().toISOString(),
    fonte: { nome: ss.getName(), url: ss.getUrl() },
    temColunaMotivo: temColunaQ_(ss, QUADRO_ABA_DESLIGADOS, 'MOTIVO')
  };
}

/** Le uma aba inteira como [{CABECALHO: valor}]. Aba inexistente devolve []. */
function lerAbaQuadro_(ss, nomeAba) {
  const aba = abaQuadro_(ss, nomeAba);
  if (!aba) return [];
  const valores = aba.getDataRange().getValues();
  if (valores.length <= 1) return [];
  // O cabecalho nem sempre e a 1a linha (titulo em cima): e a primeira das
  // 10 primeiras que tem uma coluna de nome/colaborador.
  let iCab = 0;
  for (let i = 0; i < Math.min(10, valores.length); i++) {
    if (valores[i].some(function (c) { const t = normalizaQ_(c); return t.indexOf('COLABORADOR') !== -1 || t === 'NOME' || t.indexOf('NOME ') === 0; })) { iCab = i; break; }
  }
  const cab = valores[iCab].map(function (c) { return normalizaQ_(c); });
  return valores.slice(iCab + 1).map(function (linha) {
    const obj = {};
    cab.forEach(function (nome, i) { if (nome && obj[nome] === undefined) obj[nome] = linha[i]; });
    return obj;
  }).filter(function (obj) {
    return Object.keys(obj).some(function (k) { return String(obj[k]).trim() !== ''; });
  });
}

function temColunaQ_(ss, nomeAba, pedaco) {
  const aba = abaQuadro_(ss, nomeAba);
  if (!aba || aba.getLastColumn() < 1) return false;
  return aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
    .some(function (c) { return normalizaQ_(c).indexOf(pedaco) !== -1; });
}

/*
 * Primeiro campo cujo cabecalho contem um dos pedacos. `evitar` tira da
 * busca cabecalhos que tambem contem o pedaco mas sao outra coisa — sem
 * isso, uma coluna "MOTIVO DO DESLIGAMENTO" seria lida como a DATA do
 * desligamento, porque contem "DESLIG".
 */
function pegaQ_(linha, pedacos, evitar) {
  const chaves = Object.keys(linha).filter(function (k) {
    return !(evitar || []).some(function (x) { return k.indexOf(x) !== -1; });
  });
  for (let p = 0; p < pedacos.length; p++) {
    const alvo = normalizaQ_(pedacos[p]);
    for (let c = 0; c < chaves.length; c++) {
      if (chaves[c].indexOf(alvo) >= 0) return linha[chaves[c]];
    }
  }
  return '';
}

function normalizaQ_(v) {
  return String(v == null ? '' : v).trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function txtQ_(v) { return String(v == null ? '' : v).trim(); }

/** Data (ou texto dd/mm/aaaa) -> "aaaa-mm". */
function aoMesQ_(v) {
  const d = dataQ_(v);
  return d ? d.slice(0, 7) : '';
}

const MESES_Q = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
function dataQ_(v) {
  if (v && typeof v.getTime === 'function' && !isNaN(v.getTime())) return Utilities.formatDate(v, fuso(), 'yyyy-MM-dd');
  // Numero de serie do Sheets/Excel (dias desde 30/12/1899).
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  const s = txtQ_(v);
  // "ago/2025", "Agosto de 2025", "AGO-25"
  const mx = normalizaQ_(s).match(/^([A-Z]{3})[A-Z]*\s*(?:DE\s*)?[\/\-\s]?\s*(\d{2,4})$/);
  if (mx && MESES_Q.indexOf(mx[1]) !== -1) {
    const ano = mx[2].length === 2 ? '20' + mx[2] : mx[2];
    return ano + '-' + ('0' + (MESES_Q.indexOf(mx[1]) + 1)).slice(-2) + '-01';
  }
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?/);
  if (iso) return iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + (iso[3] || '1')).slice(-2);
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? '20' + br[3] : br[3];
    return ano + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2);
  }
  return '';
}

/* --- Acoes da tela --- */

function acaoSalvarFonteQuadro(usuario, params) {
  const link = String(params.link || '').trim();
  if (!link) throw new Error('Cole o link da planilha do Quadro.');
  const m = link.match(/\/d\/([\w-]{20,})/);
  const id = m ? m[1] : (/^[\w-]{20,}$/.test(link) ? link : '');
  if (!id) throw new Error('Esse link não parece de uma planilha do Google.');
  let nome = '';
  try {
exigirPorta_();
    const ss = SpreadsheetApp.openById(id);
    nome = ss.getName();
    const faltam = QUADRO_ABAS_APOIO.concat([QUADRO_ABA_ADMITIDOS, QUADRO_ABA_DESLIGADOS])
      .filter(function (a) { return !abaQuadro_(ss, a); });
    if (faltam.length === 5) throw new Error('A planilha não tem nenhuma das abas esperadas (APOIO TA, APOIO TB, APOIO TC, CADMITIDOS, CDESLIGADOS).');
  } catch (e) {
    throw new Error(String(e.message || e).indexOf('abas') !== -1 ? e.message
      : 'Não consegui abrir a planilha. A conta dona do GSL precisa ter acesso a ela.');
  }
  acaoSalvarParametro(usuario, { chave: 'QUADRO_PLANILHA', valor: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    descricao: 'Link da planilha do Quadro do CD' });
  return { ok: true, invalidarTudo: true, recado: 'Quadro ligado à planilha "' + nome + '".' };
}

function acaoAtualizarQuadro(usuario) {
  const id = idPlanilhaQuadro_();
  if (id) { try { CacheService.getScriptCache().remove(chaveNoEspaco('quadro|' + id)); } catch (e) {} }
  // A chave e fatiada (gravarTextoCache): sem o numero de fatias, a leitura
  // volta vazia e a planilha e relida.
  limparCache('PARAMETROS');
  return { ok: true, recado: 'Quadro relido da planilha.' };
}
