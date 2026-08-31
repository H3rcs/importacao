/**
 * DATAS E FUSO
 *
 * Portado do GSL_Bartofil_v10 (tz_, _serieAgora_, diaNum_, fmt_).
 *
 * POR QUE ISTO EXISTE
 * getSpreadsheetTimeZone() volta vazio em Drive compartilhado, em planilha
 * recem-criada e em chamada vinda de gatilho. Sem string valida, TODO
 * Utilities.formatDate quebra. Aqui ele tem tres redes de seguranca e guarda
 * o ultimo fuso bom nas propriedades do script.
 *
 * O QUE MUDA EM RELACAO A PLANILHA
 * O app grava PRAZO como texto 'aaaa-mm-dd', nao como numero de serie. Sem
 * conversao de fuso na gravacao, o bug do D-1 simplesmente nao acontece.
 * O carimbo de hora da ENTREGA continua precisando do cuidado antigo: gravado
 * cru, a entrega das 22h35 vira 01h35 do dia seguinte.
 */

const FUSO_PADRAO = 'America/Bahia';

/*
 * DESEMPENHO: fuso() e chamado por linha de dado (por formatarData, por
 * paraISO, por diaNum). Enquanto TZ_OK nao estivesse gravado, CADA uma
 * dessas chamadas abria a planilha com openById — centenas de idas ao
 * Google numa unica tela. A memoria da execucao resolve; ela morre junto
 * com a requisicao, entao nunca serve fuso velho.
 */
var _fusoMemo = '';

function fuso() {
  if (_fusoMemo) return _fusoMemo;

  let t = '';
  try { t = prop('TZ_OK', ''); } catch (e) {}
  if (t) { _fusoMemo = t; return t; }

  try { t = abrirBanco().getSpreadsheetTimeZone(); } catch (e) { t = ''; }
  if (t && typeof t === 'string') {
    try { PropertiesService.getScriptProperties().setProperty('TZ_OK', t); } catch (e) {}
    esquecerProps();
    _fusoMemo = t;
    return t;
  }
  try { t = Session.getScriptTimeZone(); } catch (e) { t = ''; }
  _fusoMemo = (t && typeof t === 'string') ? t : FUSO_PADRAO;
  return _fusoMemo;
}

/** Chamado por quem grava o fuso: a memoria da execucao tem que cair. */
function esquecerFuso() { _fusoMemo = ''; _hojeMemo = null; _hojeISOMemo = ''; _hojeNumMemo = null; }

/** Fixa o fuso do banco e do projeto no padrao da Bartofil. */
function corrigirFuso() {
  const relato = { antes: '', agora: FUSO_PADRAO, projeto: '', divergente: false };
  try { relato.antes = abrirBanco().getSpreadsheetTimeZone(); } catch (e) {}
  try { abrirBanco().setSpreadsheetTimeZone(FUSO_PADRAO); } catch (e) {}
  PropertiesService.getScriptProperties().setProperty('TZ_OK', FUSO_PADRAO);
  esquecerProps();
  esquecerFuso();
  try { relato.projeto = Session.getScriptTimeZone(); } catch (e) {}
  relato.divergente = !!relato.projeto && relato.projeto !== FUSO_PADRAO;
  relato.horaCerta = Utilities.formatDate(new Date(), FUSO_PADRAO, 'dd/MM/yyyy HH:mm');
  return relato;
}

/** Carimbo de data e hora no fuso certo, montado na mao. */
function agoraTexto() {
  return Utilities.formatDate(new Date(), fuso(), 'dd/MM/yyyy HH:mm:ss');
}

/** Numero do dia no fuso da operacao — base de toda comparacao de prazo. */
function diaNum(d) {
  const s = Utilities.formatDate(new Date(d), fuso(), 'yyyy,MM,dd').split(',');
  return Math.round(Date.UTC(+s[0], +s[1] - 1, +s[2]) / 86400000);
}

/*
 * "Hoje" nao muda no meio de uma requisicao, mas era recalculado por
 * linha: hidratar() chamava hoje() duas vezes por atividade e statusDe()
 * mais uma. Com 200 atividades davam ~600 Utilities.formatDate para
 * responder sempre a mesma data. Memoria por execucao.
 */
var _hojeMemo = null, _hojeISOMemo = '', _hojeNumMemo = null;

function hoje() {
  if (_hojeMemo) return new Date(_hojeMemo.getTime());   // copia: ninguem muta o memo
  const s = Utilities.formatDate(new Date(), fuso(), 'yyyy,MM,dd').split(',');
  _hojeMemo = new Date(+s[0], +s[1] - 1, +s[2]);
  return new Date(_hojeMemo.getTime());
}

function hojeISO() {
  if (_hojeISOMemo) return _hojeISOMemo;
  _hojeISOMemo = Utilities.formatDate(new Date(), fuso(), 'yyyy-MM-dd');
  return _hojeISOMemo;
}

/** Numero do dia de hoje, calculado uma vez por execucao. */
function hojeNum() {
  if (_hojeNumMemo !== null) return _hojeNumMemo;
  _hojeNumMemo = diaNumISO(hojeISO());
  return _hojeNumMemo;
}

/*
 * Numero do dia a partir do texto 'aaaa-mm-dd'.
 *
 * O app grava PRAZO como texto justamente para nao depender de fuso;
 * passar esse texto por new Date() + Utilities.formatDate so para
 * recuperar o mesmo dia era caro e desnecessario. Aqui e aritmetica pura:
 * mesmo resultado de diaNum(), zero chamada de servico.
 */
function diaNumISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

function paraData(valor) {
  if (valor instanceof Date) return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  const texto = String(valor || '').trim();
  if (!texto) return null;
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) return new Date(br[3].length === 2 ? 2000 + (+br[3]) : (+br[3]), (+br[2]) - 1, (+br[1]));
  const d = new Date(texto);
  return isNaN(d.getTime()) ? null : d;
}

/*
 * DESEMPENHO: as duas formatam Dates que o PROPRIO app construiu como
 * meia-noite local (paraData, hoje, diasDoMesEm, new Date(ano, mes, dia)).
 * Para esses valores, ler ano/mes/dia direto do objeto da exatamente o
 * mesmo resultado que Utilities.formatDate — sem a chamada de servico.
 * O fuso do projeto esta fixado no manifesto (America/Bahia), que e o
 * mesmo TZ_OK usado no resto do arquivo.
 */
function dd_(n) { return (n < 10 ? '0' : '') + n; }

function paraISO(data) {
  if (!data) return '';
  return data.getFullYear() + '-' + dd_(data.getMonth() + 1) + '-' + dd_(data.getDate());
}

function formatarData(data) {
  if (!data) return '';
  return dd_(data.getDate()) + '/' + dd_(data.getMonth() + 1) + '/' + data.getFullYear();
}

/* --- Competencia e semana, no padrao dos IDs do GSL --- */

const SIGLAS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_EXT = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO',
                   'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

/** "AGO 2026" */
function competenciaDe(data) {
  return SIGLAS[data.getMonth()] + ' ' + data.getFullYear();
}

function competenciaParaData(competencia) {
  const m = /^([A-Z]{3}) (\d{4})$/.exec(String(competencia || '').toUpperCase().trim());
  if (!m) return null;
  const mes = SIGLAS.indexOf(m[1]);
  return mes === -1 ? null : new Date(+m[2], mes, 1);
}

/** Semana ISO no formato S32, como nos IDs AGO-S32-VIS-A. */
function semanaISO(data) {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return 'S' + String(Math.ceil(((d - inicioAno) / 86400000 + 1) / 7));
}

/** Segunda a domingo da semana que contem a data. */
function intervaloDaSemana(deslocamento) {
  const base = hoje();
  const dia = base.getDay();
  const ateSegunda = (dia === 0 ? -6 : 1 - dia);
  const inicio = new Date(base.getFullYear(), base.getMonth(), base.getDate() + ateSegunda + ((deslocamento || 0) * 7));
  return { inicio: inicio, fim: new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6) };
}

/** Todas as datas de um mes que caem num dia da semana (1=SEG ... 7=DOM). */
function diasDoMesEm(ano, mes, diaSemana) {
  const saida = [];
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  for (let d = 1; d <= ultimo; d++) {
    const data = new Date(ano, mes, d);
    const dow = data.getDay() === 0 ? 7 : data.getDay();
    if (dow === diaSemana) saida.push(data);
  }
  return saida;
}

function primeiraSegunda(ano, mes) { return diasDoMesEm(ano, mes, 1)[0] || null; }

function ultimaSexta(ano, mes) {
  const sextas = diasDoMesEm(ano, mes, 5);
  return sextas.length ? sextas[sextas.length - 1] : null;
}
