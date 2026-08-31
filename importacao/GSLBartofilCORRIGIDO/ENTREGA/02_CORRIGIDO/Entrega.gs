/**
 * ENTREGA EM PDF — porte fiel do modulo v8 do GSL_Bartofil_v10.
 *
 * O coordenador seleciona varias fotos (ou documentos) de qualquer formato
 * e o sistema junta tudo num PDF unico, arquiva no Drive na pasta do turno,
 * carimba a entrega na atividade e avisa a gestao.
 *
 *   so fotos              -> PDF sangrado, uma foto por pagina cheia
 *   documentos (+ fotos)  -> PDF em folha A4
 *   um PDF pronto sozinho -> arquivado como esta
 *
 * Formatos que o navegador nao decodifica (HEIC/HEIF/TIFF/AVIF/DNG) sao
 * convertidos para JPEG pela miniatura em alta resolucao do proprio Drive.
 *
 * Fluxo no web app (difere da planilha, que usava a barra lateral):
 *   1. receberParteEntrega(...)  — cliente manda cada arquivo, um a um, para
 *      uma pasta temporaria no Drive.
 *   2. finalizarEntrega(...)     — junta tudo, gera o PDF, arquiva e avisa.
 */

var LARGURA_MAX_PDF = 1600;                                   // px do lado maior
var NATIVOS_IMG  = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
var DOCS_TEXTO   = ['docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'htm'];
var PASTA_TMP_ENTREGA = '_TEMPORARIO';

function _extEntrega(nome) {
  var m = String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}
function _pad4(n) { return ('000' + n).slice(-4); }
function _limpaNomeEntrega(s) {
  return String(s || '').replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* AÇÕES chamadas pelo cliente (catalogadas em Codigo.gs)             */
/* ------------------------------------------------------------------ */

/** Cria a pasta temporaria e devolve o id — o cliente manda os arquivos para la. */
function acaoIniciarEntrega(usuario, params) {
  garantirAlcance(usuario, params.id);
  var token = Utilities.getUuid().replace(/-/g, '').substring(0, 10);
  var tmp = subpasta(subpasta(pastaAnexos(), PASTA_TMP_ENTREGA), token);
  return { ok: true, pasta: tmp.getId() };
}

/*
 * Recebe um arquivo do lote e grava na pasta temporaria.
 *
 * SEGURANCA: antes esta acao aceitava QUALQUER id de pasta do Drive e
 * gravava la — quem estivesse identificado no app podia escrever em
 * qualquer pasta a que o dono do script tem acesso. Agora so aceita uma
 * pasta que esteja dentro de Anexos/_TEMPORARIO, que e onde
 * acaoIniciarEntrega() cria a pasta do envio.
 */
function acaoReceberParte(usuario, params) {
  var pasta = DriveApp.getFolderById(String(params.pasta));
  if (!dentroDoTemporario_(pasta)) {
    throw new Error('Pasta de envio invalida. Comece a entrega de novo.');
  }
  var blob = Utilities.newBlob(
    Utilities.base64Decode(params.b64),
    params.mime || 'application/octet-stream',
    _pad4(Number(params.indice)) + '_' + _limpaNomeEntrega(params.nome));
  pasta.createFile(blob);
  return { ok: true };
}

/** Junta tudo num PDF, arquiva, carimba a atividade e avisa a gestao. */
function acaoFinalizarEntrega(usuario, params) {
  garantirAlcance(usuario, params.id);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { throw new Error('Outro envio esta em andamento. Tente de novo em alguns segundos.'); }

  var tmp = null;
  try {
    var atividade = obter('ATIVIDADES', params.id);
    if (!atividade) throw new Error('Atividade não encontrada.');
    var info = hidratar(atividade);

    tmp = DriveApp.getFolderById(String(params.pasta));
    var arquivos = [], it = tmp.getFiles();
    while (it.hasNext()) arquivos.push(it.next());
    if (!arquivos.length) throw new Error('Nenhum arquivo chegou ao Drive. Tente enviar de novo.');
    arquivos.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });

    var pdfs = [], docs = [], imgs = [];
    arquivos.forEach(function (f) {
      var e = _extEntrega(f.getName());
      if (e === 'pdf') pdfs.push(f);
      else if (DOCS_TEXTO.indexOf(e) > -1) docs.push(f);
      else imgs.push(f);
    });

    var nomeBase = _limpaNomeEntrega(
      info.id + ' - ' + String(info.atividade).substring(0, 45) + ' - ' +
      Utilities.formatDate(new Date(), fuso(), 'dd-MM-yyyy'));

    // O Apps Script nao faz merge de PDF pronto com outros arquivos.
    if (pdfs.length && (docs.length || imgs.length || pdfs.length > 1)) {
      throw new Error('Um PDF já pronto não pode ser juntado com outros arquivos. ' +
        'Envie o PDF sozinho, ou mande tudo como fotos/documentos.');
    }

    var final;
    if (pdfs.length === 1) {
      final = pdfs[0].getBlob().setName(nomeBase + '.pdf');
    } else if (docs.length === 1 && !imgs.length) {
      var gdoc = _paraGoogleDocEntrega(docs[0].getBlob(), '__TMP_' + nomeBase.substring(0, 40));
      try { final = DriveApp.getFileById(gdoc).getAs('application/pdf').setName(nomeBase + '.pdf'); }
      finally { try { DriveApp.getFileById(gdoc).setTrashed(true); } catch (e4) {} }
    } else if (docs.length) {
      final = _montarMistoEntrega(arquivos, nomeBase);
    } else {
      var blobs = imgs.map(function (f) {
        var e = _extEntrega(f.getName());
        return (NATIVOS_IMG.indexOf(e) > -1) ? f.getBlob() : _viaMiniaturaDrive(f, LARGURA_MAX_PDF);
      });
      final = _imagensParaPdfEntrega(blobs, nomeBase);
    }

    var pasta = subpasta(subpasta(pastaAnexos(), info.competencia), 'Turno ' + info.turno);
    var file = pasta.createFile(final);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e1) {
      try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }
      catch (e2) { /* mantem a permissao da pasta */ }
    }
    var url = file.getUrl();

    var campos = { ANEXOS: url, ENTREGUE_EM: agoraTexto(), STATUS: STATUS.AGUARDANDO };
    atualizar('ATIVIDADES', params.id, campos, usuario.email);

    // `atualizar` esvazia a memoria de leitura, entao um obter() aqui
    // relia a aba ATIVIDADES inteira so para montar o e-mail. Os campos
    // que mudaram estao logo acima.
    var atualizada = hidratar(comCampos_(atividade, campos));
    try {
      avisarEntregaEmPdf(atualizada, arquivos.length, url, usuario);
    } catch (eMail) { /* o e-mail nao pode derrubar a entrega ja gravada */ }

    try { tmp.setTrashed(true); } catch (e3) {}
    return { ok: true, url: url, arquivos: arquivos.length };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** true se a pasta e filha direta de Anexos/_TEMPORARIO. */
function dentroDoTemporario_(pasta) {
  try {
    var raizTmp = subpasta(pastaAnexos(), PASTA_TMP_ENTREGA).getId();
    var pais = pasta.getParents();
    while (pais.hasNext()) {
      if (pais.next().getId() === raizTmp) return true;
    }
  } catch (e) { /* na duvida, nega */ }
  return false;
}

/* ------------------------------------------------------------------ */
/* CONVERSÃO — o coracao do modulo v8                                 */
/* ------------------------------------------------------------------ */

/* HEIC/HEIF/TIFF/AVIF/DNG -> JPEG, pela miniatura em alta resolucao do Drive. */
function _viaMiniaturaDrive(file, largura) {
  var token = ScriptApp.getOAuthToken();
  var api = 'https://www.googleapis.com/drive/v3/files/' + file.getId() +
            '?fields=thumbnailLink&supportsAllDrives=true';
  var link = '';
  for (var t = 0; t < 8 && !link; t++) {
    var r = UrlFetchApp.fetch(api, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) link = (JSON.parse(r.getContentText()).thumbnailLink || '');
    if (!link) Utilities.sleep(1500);
  }
  if (!link) {
    throw new Error('O Google ainda não gerou a pre-visualizacao de "' + file.getName() +
      '". Aguarde alguns segundos e envie de novo, ou converta a foto para JPEG.');
  }
  link = link.replace(/=s\d+.*$/, '=s' + largura).replace(/=w\d+-h\d+.*$/, '=s' + largura);
  var img = UrlFetchApp.fetch(link, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (img.getResponseCode() !== 200) img = UrlFetchApp.fetch(link, { muteHttpExceptions: true });
  if (img.getResponseCode() !== 200) {
    throw new Error('Não consegui converter "' + file.getName() + '" (HTTP ' + img.getResponseCode() + ').');
  }
  return img.getBlob().setContentType('image/jpeg')
            .setName(file.getName().replace(/\.[^.]+$/, '') + '.jpg');
}

/* DOCX/DOC/ODT/RTF/TXT/HTML -> Google Docs, via API do Drive. Devolve o id. */
function _paraGoogleDocEntrega(blob, nome) {
  var token = ScriptApp.getOAuthToken();
  var meta = { name: nome, mimeType: 'application/vnd.google-apps.document' };
  var lim = 'gslbartofil' + Date.now();
  var cabeca = '--' + lim + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
               JSON.stringify(meta) + '\r\n--' + lim + '\r\nContent-Type: ' +
               (blob.getContentType() || 'application/octet-stream') + '\r\n\r\n';
  var corpo = Utilities.newBlob(cabeca).getBytes()
                .concat(blob.getBytes())
                .concat(Utilities.newBlob('\r\n--' + lim + '--').getBytes());
  var r = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'post', contentType: 'multipart/related; boundary=' + lim,
      payload: corpo, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) {
    throw new Error('Não consegui converter "' + blob.getName() + '" (HTTP ' + r.getResponseCode() +
      '). Se for .doc antigo, salve como .docx e envie de novo.');
  }
  return JSON.parse(r.getContentText()).id;
}

function _copiarCorpoEntrega(origem, destino) {
  var n = origem.getNumChildren();
  for (var k = 0; k < n; k++) {
    var el;
    try { el = origem.getChild(k).copy(); } catch (e) { continue; }
    var tp = el.getType();
    try {
      if (tp === DocumentApp.ElementType.PARAGRAPH)            destino.appendParagraph(el.asParagraph());
      else if (tp === DocumentApp.ElementType.LIST_ITEM)       destino.appendListItem(el.asListItem());
      else if (tp === DocumentApp.ElementType.TABLE)           destino.appendTable(el.asTable());
      else if (tp === DocumentApp.ElementType.INLINE_IMAGE)    destino.appendImage(el.asInlineImage());
      else if (tp === DocumentApp.ElementType.PAGE_BREAK)      destino.appendPageBreak();
      else if (tp === DocumentApp.ElementType.HORIZONTAL_RULE) destino.appendHorizontalRule();
    } catch (e) { /* elemento sem equivalente: segue */ }
  }
}

/* Só fotos: PDF sangrado, a pagina assume a proporcao da 1a imagem. */
function _imagensParaPdfEntrega(blobs, nomeBase) {
  var doc = DocumentApp.create('__TMP_' + nomeBase.substring(0, 40) + '_' + Date.now());
  var body = doc.getBody();
  body.setMarginTop(0).setMarginBottom(0).setMarginLeft(0).setMarginRight(0);

  var imgs = [];
  blobs.forEach(function (b, k) {
    var par = body.appendParagraph('');
    par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    par.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    try {
      var img = par.appendInlineImage(b);
      imgs.push({ img: img, w: img.getWidth(), h: img.getHeight() });
    } catch (e) { par.appendText('[Arquivo nao suportado: ' + b.getName() + ']'); }
    if (k < blobs.length - 1) body.appendPageBreak();
  });
  try {
    var c0 = body.getChild(0);
    if (c0.getType() === DocumentApp.ElementType.PARAGRAPH &&
        c0.asParagraph().getNumChildren() === 0) c0.removeFromParent();
  } catch (e) {}
  if (!imgs.length) { DriveApp.getFileById(doc.getId()).setTrashed(true); throw new Error('Nenhuma imagem pode ser lida.'); }

  var base = imgs[0], largPag = 612, altPag = Math.round(largPag * base.h / base.w);
  if (altPag > 1500) { altPag = 1500; largPag = Math.round(altPag * base.w / base.h); }
  if (altPag < 200)  { altPag = 200;  largPag = Math.round(altPag * base.w / base.h); }
  body.setPageWidth(largPag).setPageHeight(altPag);
  imgs.forEach(function (o) {
    var esc = Math.min(largPag / o.w, altPag / o.h);
    o.img.setWidth(Math.floor(o.w * esc)).setHeight(Math.floor(o.h * esc));
  });

  doc.saveAndClose();
  var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(nomeBase + '.pdf');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return pdf;
}

/* Documentos (+ fotos): um PDF so, folha A4. */
function _montarMistoEntrega(arquivos, nomeBase) {
  var LARG = 595, ALT = 842, MARG = 42;
  var doc = DocumentApp.create('__TMP_' + nomeBase.substring(0, 40) + '_' + Date.now());
  var body = doc.getBody();
  body.setPageWidth(LARG).setPageHeight(ALT);
  body.setMarginTop(MARG).setMarginBottom(MARG).setMarginLeft(MARG).setMarginRight(MARG);
  var util = { w: LARG - 2 * MARG, h: ALT - 2 * MARG };
  var lixo = [], primeiro = true;

  arquivos.forEach(function (f) {
    var e = _extEntrega(f.getName());
    if (!primeiro) body.appendPageBreak();
    primeiro = false;

    if (DOCS_TEXTO.indexOf(e) > -1) {
      var id = _paraGoogleDocEntrega(f.getBlob(), '__TMP_PARTE_' + Date.now());
      lixo.push(id);
      _copiarCorpoEntrega(DocumentApp.openById(id).getBody(), body);
    } else {
      var blob = (NATIVOS_IMG.indexOf(e) > -1) ? f.getBlob() : _viaMiniaturaDrive(f, LARGURA_MAX_PDF);
      var par = body.appendParagraph('');
      par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      par.setSpacingBefore(0).setSpacingAfter(0);
      try {
        var img = par.appendInlineImage(blob);
        var esc = Math.min(util.w / img.getWidth(), util.h / img.getHeight(), 1);
        img.setWidth(Math.floor(img.getWidth() * esc)).setHeight(Math.floor(img.getHeight() * esc));
      } catch (e2) { par.appendText('[Arquivo nao suportado: ' + f.getName() + ']'); }
    }
  });

  try {
    var c0 = body.getChild(0);
    if (c0.getType() === DocumentApp.ElementType.PARAGRAPH &&
        c0.asParagraph().getNumChildren() === 0) c0.removeFromParent();
  } catch (e) {}

  doc.saveAndClose();
  var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(nomeBase + '.pdf');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  lixo.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  return pdf;
}

/* Faxina das pastas temporarias, chamada pela rotina diaria. */
function limparTemporariosEntrega() {
  try {
    var pai = subpasta(pastaAnexos(), PASTA_TMP_ENTREGA), it = pai.getFolders();
    var limite = Date.now() - 24 * 3600 * 1000;
    while (it.hasNext()) {
      var f = it.next();
      if (f.getDateCreated().getTime() < limite) { try { f.setTrashed(true); } catch (e) {} }
    }
  } catch (e) {}
}
