/*
 * A MINIATURA DO DRIVE no emulador — o caminho por onde o servidor converte a
 * foto HEIC do iPhone (Acoes.gs, miniaturaDoDrive_). Roteiriza o UrlFetchApp
 * do mundo: a consulta files.get?fields=thumbnailLink da API do Drive e o
 * proprio link da miniatura.
 *
 *   const drive = miniaturaDrive(mundo, { atraso: 1 });
 *   ... converterFoto ...
 *   drive.log  -> ['files.get #1 sem link (Bearer)', 'files.get #2 link (Bearer)', 'miniatura =s1600 (Bearer)']
 *   drive.roteiro.nunca = true;          (o roteiro muda no meio do teste)
 *   drive.apagadas -> [{ nome: 'heic-…', arquivos: ['IMG_0001.HEIC image/heic'] }]   (as pastas que o DELETE da API apagou de vez)
 *   pastasDeConversao(mundo)             as pastas Anexos/_TEMPORARIO/heic-... que sobraram (so na lixeira)
 *
 * Roteiro:
 *   atraso: n       consultas de cada arquivo sem o thumbnailLink antes de ele sair (o Google gerando)
 *   nunca: true     o Google nao gera a miniatura
 *   link: 's220'    o tamanho no fim do link: 's220', 'w200-h190-p-k-nu' ou '' (link sem tamanho)
 *   imagem: 'jpeg'  o que o link devolve: 'jpeg', 'png' ou 'html' (pagina de login, com HTTP 200)
 *   lancar: true    o UrlFetch lanca (rede caindo, cota do dia)
 *   recusa: { codigo: 403, motivo: 'accessNotConfigured' }   o files.get responde com erro (API desligada,
 *                   politica do dominio, token recusado, arquivo sumido, cota: 'rateLimitExceeded', 429, 5xx)
 *   apagar: false   a API recusa o DELETE da pasta temporaria (403): ela fica so na lixeira
 *
 * HEIC_MINI: uma HEIC de verdade (HEVC, 160x120, 1,3 KB, feita com pillow-heif/libheif).
 * JPEG_MINI: o JPEG que faz o papel da miniatura (a mesma imagem, 160x120).
 */
'use strict';
const HEIC_MINI = [
  'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAVZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAA',
  'AERAAAEAAQAAAAABegABAAAAAAAAA8EAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA1mlwcnAAAAC3',
  'aXBjbwAAAHhodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQArQgEBA3AAAAMAkAAAAwAA',
  'AwAeoBQgeWW6kkprm4CGgwIAAAMAMgAAAwACEGIAAQAHRAHBcrBiQAAAABNjb2xybmNseAABAA0ABoAAAAAUaXNwZQAAAAAAAACgAAAAeAAAABBw',
  'aXhpAAAAAAMICAgAAAAXaXBtYQAAAAAAAAABAAEEgQIDBAAAA8ltZGF0AAADvSgBrwnQmLzjNqdsJ+P/7T/eyN/9DxYmJTNsfbocDE08MaIbe3vB',
  'LKA7HKk5vpU0g1xYCYk4so+Hc1BoUNfn0kjkzvmc/f3YXsTxbefLKVUTI18O97MmXQC7qob1mPR3tx8jx/0oxEdGkutDpB1RddDAz0yLU/wJgHFS',
  'vREVyRUDvAL9+FLSFgFx1g5FYNG7X0bNG3757OZfgygmGBcO3r4FZj7zcLLQVQsQWdxSZVwbEPXhFjOsHd72ge08Z4NJFkWej++fawZLlfnHVU7d',
  'G1t4kTle2XyQPbRQSt6RqnC8w3fb4VsSe41TExWp+kWQrhnntGZWYE8LWs97ydeBPkEynmupOTEbW+emE5MQgbsoOiME/9s+sG8zWer/+L/Y5UTV',
  'DeAAAAMAAAMAAAMBbhInWIpK4Hly8CQ6WoFDk0MjA2TNSy899M2XhhlMzXRsfBBMLSltV6UAJ/R4nRLtoPbvWlsEzEp/s8rHWsPyDm5fIyzv9Zln',
  'Uomw1WpyyWXq2FZO5cOBJIbtsvWXtyFdA7n6ij34ysIsFY+gzRcDTh5CnxJJWDNOM6sa3pKgwqufqHySZRXqk1WkADl5tx1+wq8jgmPslEQIwJ4f',
  '0pcKCJ4wOSZCWEtE7fVuIXTBWlJx8R4ZuI4Bkk6c7KCqEkkcfdSGbiK+35OYAeer+X17HB68AC1dxfN6bQQKoVXnirdbDXuLPZAGSMAAuCEXl8Cv',
  'HBBdEbUsxoEqJyzdYk0tVzNylhu+Y/rotL9eeVoE3AVxGwR2SRzeCLVLf6dUuVGqKB1EcpAB3EhexHe3FV7ZIZSgqScKKHzvd2RoGozqaatWSF6b',
  'i0wO0vtvPYqnFUVLMC/3NaNuAKaJXKS4sAKHSYhkMA3w6Zyeo35aPJ9izfVO0I0JY/1qsYjoUbhQ0paoxPwVqgypuH/kR5iD/x07KLgtM0YqcTqo',
  'AdvQrt221ZxwIOPUyY46waNWq/g8jXel9FWDlj6IQ3VSvPVylwYUtIIp4edPmmG5fY9VtYZy9Vw5GS7K2rLgQqQtGeZja0gPm2PjmEstrAvETRdy',
  '1FWCFOQZruT6OQgG7pGGjPRw+6dpjCIOwZUetByNTO6t2wzv1P50vAgPhx8Frr1zJDHe5wOSE7h81CwWtKOKb4QgrUQrBUKDZurFkvDMt4T5BUqE',
  'x8BHWDDTFo1QGUSq4pjzEeEqKYT0XL5mAX3w3z9/wnX9aZvorC1k3d+8bNtJfVT4dRsFkOrCrZUouzRj1c2s1BdrSIsR91/smJwJAAAmIA=='
].join('');
const JPEG_MINI = [
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0o',
  'MCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAB4AKAD',
  'ASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKB',
  'kaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZ',
  'mqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQF',
  'BgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5',
  'OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX',
  '2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKZ5qev6U+qdetnGZVcDyezSfNfe/S3mu5fCfD+Gzr231iUlyctuVrrzb3T7FnzU9',
  'f0o81PX9KrUV4n+seK/lj9z/AMz7D/iH2W/zz++P/wAiWfNT1/SjzU9f0qtRR/rHiv5Y/c/8w/4h9lv88/vj/wDIlnzU9f0pVdWOAaq1Lb/fP0rq',
  'wWe4jEV4UpRjZvz/AMzzc44LwOBwVXE05zcoq6u1b/0lE9FFFfVn5gFFFFABRRRQAUUUUAFFFFABRRRQAVTq5VXY390/lXy/ElOU/Zcqvv8AofpP',
  'h7Xp0vrHtJJX5N3b+YbRTtjf3T+VGxv7p/KvmPYVf5X9zP0j67hv+fkfvQ2inbG/un8qNjf3T+VHsKv8r+5h9dw3/PyP3obUtv8AfP0pmxv7p/Kp',
  'IFIc5BHFd+V0akcXTbi9+x4nEmLoTyuvGM03y90TUUUV+gH4SFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUU',
  'AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFPijeWVI4kZ5HIVVUZLE9AB3NddpXw91i9ijluDDZxsRlZSTIFODnaB156Eg5H',
  'OK4sbmWFwEebFVFH1/Rbs3oYariHalFs46ivS/8AhV3/AFGP/JX/AOzrntW8B63p8IlWKO7X+IWpLsvIH3SAT17A9DnFebhuKMqxU+SnXV/O8f8A',
  '0pI6auV4ukuaUHbys/yOVooor3zzwooooAKKKKACiiigAooooAKKKKACiiigAqextJ7+7itbSJpZ5TtRF6n/AAHv2qCvSfhFpCO11q0u1mQ+REOp',
  'U4BZunBwQAQe7V5WdZnHK8FPFPVrZd29v+D5HXgsK8VXjSXXf0Oq8G+F4PD1pltst/KP3swHA/2V/wBn+fU9gOjoor8BxmMrY2tKvXlzSlu/66dk',
  'foNGjChBU6askFFFFcpocd478IJrcTXlgqpqaDkdBOB2P+16H8Dxgjx2WN4pXjlRkkQlWVhgqR1BHY19J14/8VNISw1uO9h2rHegsyjjDrjccY6H',
  'IPck7q/TeBs+qSqf2bXd1b3O6tq4+ltV2tbsfMZ7l8VH6zTVn1/zOJooor9QPlgooooAKKKKACiiigAooooAKKKKACvbvhpGieDbFkRVZzIzkDBY',
  '72GT6nAA/AV4jXr3wlvvtGgTWjybntZjtTbjajcjnvlt/v8ApXxXHtKc8rUo7Rkm/SzX5tHt5BNRxVn1T/R/odxRRRX4ufahRRRQAVwnxfjQ+H7S',
  'QopkW6ChscgFGyAfQ4H5Cu7rzT4xX3/IP09JP708ke3/AIChz/33x+favo+EqU6ub0VDo236JO/+R5ubzUcHO/8AWp5pRRRX70fAhRRRQAUUUUAF',
  'FFFABRRRQAUUUUAFbXhHWzoGtxXhVnhIMcyLjLIfTPcEA9s4xnmsWisMTh6eKoyoVVeMlZ/M0pVJUpqcHqj6PsbuC/tIrq0lWWCUbkdeh/wPt2qe',
  'vCPC3ii98PSuLfbNayEGSBycHpyp7NjjP5g4FelaV4+0W9ij+0TNZzsQpjlUkAnHO4DG3J6nHTkCvxbOeEMdgKjdCDqU+jWr+aWvz29Nj7XBZxQx',
  'EUpvll57fJnW0Vmf2/o//QW0/wD8CU/xrntW+ImkWsINh5l9MeiqpjUcjqWHpnoD07V4uGybH4qfJRoyb9Gl829F82d1XG4ekuac0vmdNrWqWuja',
  'fJeX0myJeAByzt2VR3J/+v0rwXXNRk1fVrq+mGGmfIXj5V6KucDOAAM98VP4h1691+7We+dcINqRRghE9cAk8nuf8BWVX67wvw0snpurVd6slr2S',
  '7L9X/lr8fmuZvGS5IaQX4+YUUUV9aeQFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//Z'
].join('');
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function miniaturaDrive(mundo, roteiro) {
  const drive = { roteiro: Object.assign({ atraso: 0, nunca: false, link: 's220', imagem: 'jpeg', lancar: false, recusa: null, apagar: true }, roteiro),
    log: [], apagadas: [] };
  const consultas = new Map();
  mundo.opcoes.urlFetch = (url, op) => {
    const r = drive.roteiro;
    const token = /^Bearer \S/.test(((op || {}).headers || {}).Authorization || '') ? ' (Bearer)' : '';
    if (r.lancar) { drive.log.push('rede caiu'); throw new Error('Address unavailable: ' + url); }
    const apagar = /drive\/v3\/files\/([^?]+)\?supportsAllDrives=true$/.exec(url);
    if (apagar && String((op || {}).method || '').toLowerCase() === 'delete') {
      drive.log.push('files.delete' + token);
      if (!r.apagar) return { codigo: 403, texto: JSON.stringify({ error: { code: 403, message: 'The user does not have sufficient permissions for this file.' } }) };
      const pasta = mundo.pastas.get(apagar[1]);
      if (!pasta) return { codigo: 404, texto: '' };
      drive.apagadas.push(apagarDeVez(mundo, pasta));
      return { codigo: 204, texto: '' };
    }
    const api = /drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/.exec(url);
    if (api) {
      const n = (consultas.get(api[1]) || 0) + 1;
      consultas.set(api[1], n);
      if (r.recusa) {
        drive.log.push('files.get #' + n + ' HTTP ' + r.recusa.codigo + token);
        return { codigo: r.recusa.codigo, texto: JSON.stringify({ error: { code: r.recusa.codigo, message: r.recusa.motivo || '', errors: [{ reason: r.recusa.motivo || '' }] } }) };
      }
      const pronto = !r.nunca && n > r.atraso;
      drive.log.push('files.get #' + n + (pronto ? ' link' : ' sem link') + token);
      const link = 'https://lh3.googleusercontent.com/drive-storage/AJQ' + api[1].slice(-6) + (r.link ? '=' + r.link : '');
      return { codigo: 200, texto: JSON.stringify(pronto ? { thumbnailLink: link } : {}) };
    }
    if (/^https:\/\/lh3\.googleusercontent\.com\//.test(url)) {
      drive.log.push('miniatura ' + url.replace(/^.*\/AJQ\w*/, '') + token);
      if (r.imagem === 'html') return { codigo: 200, texto: '<!DOCTYPE html><html><body>Fazer login</body></html>', tipo: 'text/html' };
      return { codigo: 200, bytes: Buffer.from(r.imagem === 'png' ? PNG_1x1 : JPEG_MINI, 'base64'), tipo: 'image/' + r.imagem };
    }
    return { codigo: 404, texto: '' };
  };
  return drive;
}

/* O DELETE da API: a pasta e o que esta dentro dela somem do Drive (nem na lixeira ficam). */
function apagarDeVez(mundo, pasta) {
  const dentro = [...mundo.arquivos.values()].filter((a) => a.pais.has(pasta.id));
  dentro.forEach((a) => mundo.arquivos.delete(a.id));
  mundo.pastas.delete(pasta.id);
  return { nome: pasta.nome, arquivos: dentro.map((a) => a.nome + ' ' + a.mime) };
}

/* As pastas que o converterFoto criou e que sobraram (Anexos/_TEMPORARIO/heic-...). */
function pastasDeConversao(mundo) {
  const tmp = [...mundo.pastas.values()].filter((p) => p.nome === '_TEMPORARIO').map((p) => p.id);
  return [...mundo.pastas.values()].filter((p) => /^heic-/.test(p.nome) && [...p.pais].some((id) => tmp.includes(id)));
}

module.exports = { miniaturaDrive, pastasDeConversao, HEIC_MINI, JPEG_MINI };
