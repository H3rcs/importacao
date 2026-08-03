/*******************************************************************************
 * GSL BARTOFIL · GSL-DADOS · v7
 * 00_Param.gs — leitura das abas de configuração (PARAM e FONTES)
 *
 * Nada aqui usa número fixo de linha: as abas de configuração são localizadas
 * pelo texto, para que inserir uma linha na planilha não quebre o ETL.
 ******************************************************************************/

var TIPOS_CANONICOS = ['Falta', 'Falta justificada', 'Atestado', 'Saída antecipada',
                       'Atraso', 'Erro operacional', 'Férias', 'Afastamento', 'Ignorar'];

/** Tipos que a planilha do GSL conhece. O resto fica só na camada restrita. */
var TIPOS_PUBLICAVEIS = ['Erro operacional', 'Falta', 'Atestado'];

var FONTES_VALIDAS = ['RH', 'ERROS', 'METAS'];

var _cache = {};

function ss_() { return SpreadsheetApp.getActive(); }

function aba_(nome) {
  var sh = ss_().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada na GSL-DADOS.');
  return sh;
}

function tz_() { return ss_().getSpreadsheetTimeZone(); }

/** Normaliza texto para comparação: maiúsculas, sem acento, espaço simples. */
function norm_(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Lê um parâmetro da aba PARAM pelo texto da coluna A (valor na coluna C). */
function param_(chave) {
  if (!_cache.param) {
    var vals = aba_('PARAM').getDataRange().getValues();
    _cache.param = {};
    for (var i = 0; i < vals.length; i++) {
      var k = norm_(vals[i][0]);
      if (k) _cache.param[k] = vals[i][2];
    }
  }
  var alvo = norm_(chave);
  for (var k in _cache.param) {
    if (k.indexOf(alvo) === 0) return _cache.param[k];
  }
  return '';
}

function paramNum_(chave, padrao) {
  var v = param_(chave);
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? padrao : n;
}

function paramSN_(chave, padrao) {
  var v = norm_(param_(chave));
  return v === 'S' ? true : (v === 'N' ? false : padrao);
}

/** Localiza a linha de um bloco na aba FONTES pelos títulos das colunas A e B. */
function _linhaBloco_(vals, tituloA, tituloB) {
  for (var i = 0; i < vals.length; i++) {
    if (norm_(vals[i][0]) === tituloA && norm_(vals[i][1]) === tituloB) return i;
  }
  throw new Error('Bloco "' + tituloA + ' / ' + tituloB + '" não encontrado na aba FONTES. ' +
                  'Não apague as linhas de cabeçalho.');
}

/**
 * Configuração das fontes.
 * -> { RH: {ativa, id, aba, linhaCabecalho, janela, campos:{campo:[sinônimos]},
 *           obrigatorios:[campo]} , ... }
 */
function fontes_() {
  if (_cache.fontes) return _cache.fontes;
  var vals = aba_('FONTES').getDataRange().getValues();
  var out = {};

  var b1 = _linhaBloco_(vals, 'FONTE', 'ATIVA');
  for (var i = b1 + 1; i < vals.length; i++) {
    var f = norm_(vals[i][0]);
    if (!f) continue;
    if (FONTES_VALIDAS.indexOf(f) < 0) break;   // acabou o bloco 1
    out[f] = {
      nome: f,
      ativa: norm_(vals[i][1]) === 'S',
      id: String(vals[i][2] || '').trim(),
      aba: String(vals[i][3] || '').trim(),
      linhaCabecalho: parseInt(vals[i][4], 10) || 1,
      janela: parseInt(vals[i][5], 10) || paramNum_('Janela de leitura', 60),
      campos: {},
      obrigatorios: []
    };
  }

  var b2 = _linhaBloco_(vals, 'FONTE', 'CAMPO');
  for (var j = b2 + 1; j < vals.length; j++) {
    var fo = norm_(vals[j][0]);
    var campo = String(vals[j][1] || '').trim().toLowerCase();
    if (!fo || !campo || !out[fo]) continue;
    var sinonimos = String(vals[j][2] || '').split(';')
      .map(norm_).filter(function (s) { return s !== ''; });
    if (sinonimos.length) out[fo].campos[campo] = sinonimos;
    if (norm_(vals[j][3]) === 'S') out[fo].obrigatorios.push(campo);
  }

  _cache.fontes = out;
  return out;
}

/** ID da planilha do GSL (destino da publicação). */
function idGSL_() {
  var id = String(param_('ID da planilha do GSL') || '').trim();
  // aceita o link inteiro colado, além do ID puro
  var m = id.match(/\/d\/([a-zA-Z0-9-_]{20,})/);
  return m ? m[1] : id;
}

function emailsAviso_() {
  var e = [param_('E-mail do administrador'), param_('E-mail do RH')];
  return e.map(function (x) { return String(x || '').trim(); })
          .filter(function (x) { return x.indexOf('@') > 0; }).join(',');
}

function agora_() { return new Date(); }

function fmtData_(d) {
  return Utilities.formatDate(new Date(d), tz_(), 'dd/MM/yyyy');
}

function fmtDataHora_(d) {
  return Utilities.formatDate(new Date(d), tz_(), 'dd/MM/yyyy HH:mm');
}

/** SHA-256 em hexadecimal — usado como impressão digital da linha de origem. */
function hash_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto),
                                      Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
    hex += b.length === 1 ? '0' + b : b;
  }
  return hex.substring(0, 32);
}

/** Data → primeiro dia do mês (chave mensal usada pelo GSL). */
function primeiroDoMes_(d) {
  var x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1);
}

/** Semana ISO no formato usado pelo GSL: "S32". */
function semanaISO_(d) {
  var x = new Date(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate());
  var dia = (x.getDay() + 6) % 7;              // segunda = 0
  x.setDate(x.getDate() - dia + 3);            // quinta da mesma semana
  var primeiraQuinta = new Date(x.getFullYear(), 0, 4);
  var d2 = (primeiraQuinta.getDay() + 6) % 7;
  primeiraQuinta.setDate(primeiraQuinta.getDate() - d2 + 3);
  var semana = 1 + Math.round((x - primeiraQuinta) / 604800000);
  return 'S' + semana;
}

/** Ano ISO (a semana 1 de janeiro pode pertencer ao ano anterior). */
function anoISO_(d) {
  var x = new Date(d);
  x.setDate(x.getDate() + 4 - ((x.getDay() + 6) % 7 + 1));
  return x.getFullYear();
}
