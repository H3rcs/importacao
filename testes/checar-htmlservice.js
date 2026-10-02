#!/usr/bin/env node
/*
 * CHECAGEM DO HTMLSERVICE — rode antes de colar os arquivos no Apps Script.
 *
 *   node testes/checar-htmlservice.js [pasta-do-GSL]
 *
 * O Google, ao servir a pagina, apaga o que PARECE comentario de JavaScript
 * (barra-barra e barra-asterisco) sem entender template literal (crase).
 * Um accept="image/(asterisco)" dentro de um template engolia o codigo ate o
 * proximo fim de comentario e a tela travava na entrada com
 * "SyntaxError: Unexpected token 'class'".
 *
 * Esta checagem:
 *   1. monta o Index.html com os include() como o doGet faz;
 *   2. procura barra-barra, barra-asterisco e abre-comentario-HTML dentro
 *      de texto, template ou regex (tudo que NAO e comentario de verdade);
 *   3. passa cada <script> por varias versoes do "apagador de comentario"
 *      do Google e confere se o JavaScript continua valido.
 * Sai com codigo 1 se achar problema.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ts;
try { ts = require('typescript'); } catch (e) {
  try { ts = require('/opt/node22/lib/node_modules/typescript'); } catch (e2) {
    console.error('Precisa do pacote "typescript" (npm i -g typescript).');
    process.exit(2);
  }
}

const pasta = path.resolve(process.argv[2] || path.join(__dirname, '..', 'GSL'));
const ler = (nome) => fs.readFileSync(path.join(pasta, nome), 'utf8');

/* 1. A pagina como o doGet monta — CARGA_INICIAL escapada pela MESMA
      expressao do paginaComCarga_ (Codigo.gs), com uma urlApp de verdade. */
const expr = (ler('Codigo.gs').match(/t\.inicial\s*=\s*([^\n]+);/) || [])[1];
if (!expr) { console.error('Nao achei "t.inicial = ..." no Codigo.gs.'); process.exit(1); }
const carga = { ok: true, entrada: 'ENTRAR', urlApp: 'https://script.google.com/a/macros/bartofil.com.br/s/abc/exec',
  aviso: 'texto com </script> e /* e // dentro' };
const inicial = new Function('carga', 'return ' + expr)(carga);
let pagina = ler('Index.html')
  .replace(/<\?!= include\('(\w+)'\); \?>/g, (m, nome) => ler(nome + '.html'))
  .replace('<?!= inicial ?>', () => inicial);

const sobra = pagina.match(/<\?[\s\S]*?\?>/);
if (sobra) { console.error('Scriptlet nao avaliado na pagina: ' + sobra[0].slice(0, 80)); process.exit(1); }

const blocos = [];
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(pagina))) {
  blocos.push({ codigo: m[1], linha: pagina.slice(0, m.index).split('\n').length });
}

let problemas = 0;
const linhas = pagina.split('\n');

/* 2. Sequencias perigosas fora de comentario. */
const TIPOS = new Set([
  ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral
]);
blocos.forEach((b) => {
  const sf = ts.createSourceFile('x.js', b.codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visitar = (no) => {
    if (TIPOS.has(no.kind)) {
      const ini = no.getStart(sf);
      const bruto = b.codigo.slice(ini, no.end);
      ['//', '/*', '<!--', '</script'].forEach((seq) => {
        let i = bruto.indexOf(seq);
        while (i !== -1) {
          const n = b.linha + b.codigo.slice(0, ini + i).split('\n').length - 1;
          console.error(`PERIGO linha ${n} da pagina: "${seq}" dentro de texto/template/regex -> ${linhas[n - 1].trim().slice(0, 120)}`);
          problemas++;
          i = bruto.indexOf(seq, i + 1);
        }
      });
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
});

/* 3. O JavaScript sobrevive ao apagador de comentario? */
function apagar(codigo, o) {
  let saida = '', estado = 'codigo', i = 0;
  while (i < codigo.length) {
    const c = codigo[i], d = codigo[i + 1];
    if (estado === 'codigo') {
      if (c === '/' && d === '/') { estado = 'linha'; i += 2; continue; }
      if (c === '/' && d === '*') { estado = 'bloco'; i += 2; continue; }
      if (o.simples && c === "'") estado = 'simples';
      else if (o.duplas && c === '"') estado = 'duplas';
      saida += c; i++; continue;
    }
    if (estado === 'linha') { if (c === '\n') { estado = 'codigo'; saida += c; } i++; continue; }
    if (estado === 'bloco') {
      if (c === '*' && d === '/') { estado = 'codigo'; i += 2; continue; }
      if (c === '\n') saida += c;
      i++; continue;
    }
    if (c === '\\') { saida += c + (d || ''); i += 2; continue; }
    if ((estado === 'simples' && c === "'") || (estado === 'duplas' && c === '"')) estado = 'codigo';
    else if (o.quebraFecha && c === '\n') estado = 'codigo';
    saida += c; i++;
  }
  return saida;
}
const VARIANTES = [
  { nome: 'sem apagar', simples: true, duplas: true, nada: true },
  { nome: 'aspas simples e duplas', simples: true, duplas: true },
  { nome: 'so aspas simples', simples: true, duplas: false },
  { nome: 'so aspas duplas', simples: false, duplas: true },
  { nome: 'nenhuma aspa', simples: false, duplas: false },
  { nome: 'aspas fecham na quebra', simples: true, duplas: true, quebraFecha: true }
];
blocos.forEach((b, k) => {
  VARIANTES.forEach((v) => {
    const codigo = v.nada ? b.codigo : apagar(b.codigo, v);
    try { new vm.Script(codigo, { filename: 'bloco' + (k + 1) }); }
    catch (e) {
      const l = (String(e.stack).match(/bloco\d+:(\d+)/) || [])[1];
      console.error(`ERRO no <script> ${k + 1} (${v.nome}): ${e.message}` + (l ? ` — linha ${b.linha + Number(l) - 1} da pagina` : ''));
      problemas++;
    }
  });
});

if (problemas) { console.error(`\n${problemas} problema(s). Corrija antes de publicar.`); process.exit(1); }
console.log(`OK: ${blocos.length} <script> conferidos em ${VARIANTES.length} variantes; nenhum barra-barra/barra-asterisco fora de comentario.`);
