#!/usr/bin/env node
/*
 * LEITOR DE PDF DENTRO DO APPS SCRIPT (27/11).
 *
 *   node ferramentas/embutir-pdfjs.js [--conferir]
 *
 * A rede da Bartofil (ou o proxy do servidor em nuvem) barra a cdnjs, e o
 * "Enviar situacao (PDF)" da Situacao de Carga dava "Nao consegui carregar o
 * leitor de PDF". Agora o pdf.js vai DENTRO do projeto do Apps Script, em dois
 * arquivos HTML que o servidor le e entrega a tela pelo google.script.run
 * (acao leitorPdf, no Carga.gs):
 *
 *   GSL/LeitorPdf.html             pdf.min.js        (~120 KB)
 *   GSL/LeitorPdfTrabalhador.html  pdf.worker.min.js (~390 KB)
 *
 * Cada um traz o arquivo da pasta ferramentas/vendor/pdfjs-<versao> comprimido
 * (gzip) e escrito em base64url, em linhas de 100 letras. So letras, numeros,
 * "-" e "_": nada que o HtmlService possa apagar (barra-barra, barra-asterisco)
 * ou trocar (<, &), nada que o editor do Apps Script estranhe. Na tela, o
 * DecompressionStream do Chrome descomprime e o codigo roda como sempre.
 *
 * Formato (o servidor procura a linha GSL-PDFJS e o FIM):
 *   <pre>
 *   GSL-PDFJS <arquivo> <versao> <carimbo> <bytes> <sha256-12>
 *   H4sIAAAA...            (linhas de base64url)
 *   FIM
 *   </pre>
 *
 * --conferir: so confere se os arquivos do GSL batem com a pasta vendor (sai 1 se nao).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');
const CARIMBO = '2026.11.27';
const ARQUIVOS = [
  { origem: 'pdf.min.js', destino: 'LeitorPdf.html' },
  { origem: 'pdf.worker.min.js', destino: 'LeitorPdfTrabalhador.html' }
];

function versaoDoCarga() {
  const t = fs.readFileSync(path.join(RAIZ, 'GSL', 'Carga.html'), 'utf8');
  const v = (t.match(/const CG_PDFJS_VERSAO = '([^']+)'/) || [])[1];
  if (!v) throw new Error('Nao achei CG_PDFJS_VERSAO no Carga.html.');
  return v;
}

const sha12 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

function montarArquivo(a, versao) {
  const bruto = fs.readFileSync(path.join(RAIZ, 'ferramentas', 'vendor', 'pdfjs-' + versao, a.origem));
  // mtime zero: o mesmo arquivo de entrada da sempre o mesmo gzip (a conferencia compara o texto)
  const gz = zlib.gzipSync(bruto, { level: 9 });
  gz.writeUInt32LE(0, 4);
  const b64 = gz.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const linhas = b64.match(/.{1,100}/g);
  return '<pre>\n' +
    'GSL-PDFJS ' + a.origem + ' ' + versao + ' ' + CARIMBO + ' ' + bruto.length + ' ' + sha12(bruto) + '\n' +
    linhas.join('\n') + '\nFIM\n</pre>\n' +
    '<p>GSL Bartofil: leitor de PDF da Situacao de Carga (pdf.js ' + versao + ', Mozilla Foundation, licenca Apache 2.0),' +
    ' comprimido. Nao edite: gerado por ferramentas/embutir-pdfjs.js.</p>\n';
}

function principal() {
  const conferir = process.argv.includes('--conferir');
  const versao = versaoDoCarga();
  let diferentes = 0;
  ARQUIVOS.forEach((a) => {
    const texto = montarArquivo(a, versao);
    const destino = path.join(RAIZ, 'GSL', a.destino);
    if (conferir) {
      const atual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
      if (atual !== texto) { diferentes++; console.error('DIFERENTE: GSL/' + a.destino + ' nao bate com vendor/pdfjs-' + versao + '/' + a.origem); }
      return;
    }
    fs.writeFileSync(destino, texto, 'utf8');
    console.log('GSL/' + a.destino + ': ' + texto.length + ' caracteres (de ' + a.origem + ', pdf.js ' + versao + ')');
  });
  if (conferir) {
    if (diferentes) process.exit(1);
    console.log('OK: os leitores de PDF do GSL batem com a pasta vendor (pdf.js ' + versao + ').');
  }
}

module.exports = { montarArquivo, ARQUIVOS, CARIMBO };
if (require.main === module) principal();
