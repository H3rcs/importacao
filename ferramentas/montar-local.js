#!/usr/bin/env node
/*
 * MONTAR A PASTA GSL-LOCAL — a versao do GSL que abre da pasta compartilhada
 * da Bartofil (\\servidor\GSL\GSL.html), sem programa instalado.
 *
 *   node ferramentas/montar-local.js [--fonte GSL] [--saida GSL-Local] [--url https://script.google.com/macros/s/ID/exec]
 *
 * Monta a pagina a partir dos MESMOS arquivos que o Apps Script serve
 * (Index.html e os include: Estilo, PaineisEstilo, Marca, App, Paineis,
 * Aprendiz, Carga, CargaEstilo), resolvendo os scriptlets como o servidor:
 *   <?!= include('X'); ?>  -> o conteudo de X.html (o <style> vai para o
 *                             gsl.css, cada <script> para o gsl-x.js, na
 *                             mesma ordem da pagina)
 *   <?!= inicial ?>        -> null (a pagina local pede a carga a API: "inicio")
 * Qualquer outro scriptlet para a montagem (melhor parar do que montar errado).
 *
 * Saida (a pasta inteira vai para o servidor de arquivos):
 *   GSL.html          a pagina (abrir no Chrome)
 *   gsl.css           Estilo + PaineisEstilo + Marca (logos embutidas) + Aprendiz
 *   gsl-app.js, gsl-paineis.js, gsl-aprendiz.js   os modulos
 *   vendor/pdfjs-<versao>/  o leitor de PDF (pdf.js) da Situacao de Carga — os mesmos arquivos que a
 *                     versao online busca na cdnjs, copiados de ferramentas/vendor (Apache 2.0)
 *   gsl-config.js     o endereco /exec da implantacao (o administrador edita;
 *                     uma montagem nova NAO apaga o que ja esta na pasta de saida,
 *                     a nao ser com --url)
 *   LEIA-ME-LOCAL.md  como instalar, configurar e atualizar
 *
 * Sem dependencias: so o Node.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');

function argumentos(lista) {
  const o = { fonte: path.join(RAIZ, 'GSL'), saida: path.join(RAIZ, 'GSL-Local'), url: '' };
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    const valor = () => { if (i + 1 >= lista.length) throw new Error('Falta o valor de ' + a); return lista[++i]; };
    if (a === '--fonte') o.fonte = path.resolve(valor());
    else if (a === '--saida') o.saida = path.resolve(valor());
    else if (a === '--url') o.url = String(valor()).trim();
    else if (a === '--silencioso') o.silencioso = true;
    else throw new Error('Argumento desconhecido: ' + a);
  }
  return o;
}

/*
 * Os blocos de um arquivo de include: so <style> e <script> no nivel de cima
 * (como o navegador le: o bloco termina no primeiro </script> ou </style>).
 * Texto solto fora deles (fora comentario HTML) para a montagem.
 */
function blocosDe(texto, nome) {
  const blocos = [];
  const abre = /<(script|style)\b([^>]*)>/gi;
  let i = 0;
  for (;;) {
    abre.lastIndex = i;
    const m = abre.exec(texto);
    const solto = texto.slice(i, m ? m.index : texto.length).replace(/<!--[\s\S]*?-->/g, '');
    if (solto.trim()) throw new Error(nome + '.html: texto fora de <script>/<style>: ' + solto.trim().slice(0, 80));
    if (!m) break;
    const tag = m[1].toLowerCase();
    if (m[2].trim()) throw new Error(nome + '.html: <' + tag + m[2] + '> com atributos (a montagem nao sabe levar).');
    const fim = texto.toLowerCase().indexOf('</' + tag, abre.lastIndex);
    if (fim < 0) throw new Error(nome + '.html: <' + tag + '> sem fechamento.');
    blocos.push({ tipo: tag, conteudo: texto.slice(abre.lastIndex, fim) });
    i = texto.indexOf('>', fim) + 1;
  }
  return blocos;
}

/* Carimbo da entrega: BUILD_APP do App.html (o mesmo do APP.build do Codigo.gs numa entrega inteira). */
function carimbos(fonte) {
  const app = fs.readFileSync(path.join(fonte, 'App.html'), 'utf8');
  const cod = fs.existsSync(path.join(fonte, 'Codigo.gs')) ? fs.readFileSync(path.join(fonte, 'Codigo.gs'), 'utf8') : '';
  const buildApp = (app.match(/const BUILD_APP = '([^']+)'/) || [])[1] || '';
  const buildServidor = (cod.match(/build: '([^']+)'/) || [])[1] || '';
  const versao = (cod.match(/versao: '([^']+)'/) || [])[1] || '';
  const nome = (cod.match(/nome: '([^']+)'/) || [])[1] || 'GSL Bartofil';
  if (!buildApp) throw new Error('Nao achei o BUILD_APP no App.html.');
  return { buildApp, buildServidor, versao, nome };
}

const resumo = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 10);

function montar(opcoes) {
  const o = Object.assign(argumentos([]), opcoes || {});
  const ler = (nome) => fs.readFileSync(path.join(o.fonte, nome), 'utf8');
  const existe = (nome) => fs.existsSync(path.join(o.fonte, nome));
  const c = carimbos(o.fonte);
  const avisos = [];
  if (c.buildServidor && c.buildServidor !== c.buildApp) {
    avisos.push('Carimbos diferentes: App.html ' + c.buildApp + ', Codigo.gs ' + c.buildServidor + ' (entrega pela metade?).');
  }

  const css = [];                 // [nome, texto] na ordem da pagina
  const scripts = {};             // arquivo -> texto
  let index = ler('Index.html');
  let linkCss = false;

  index = index.replace(/<\?([\s\S]*?)\?>/g, (tudo, corpo) => {
    const inc = /^!=\s*include\('(\w+)'\);?\s*$/.exec(corpo.trim());
    if (inc) {
      const nome = inc[1];
      if (!existe(nome + '.html')) {
        // Como o include() do servidor: so os opcionais podem faltar (a faixa de versao avisa).
        if (nome === 'Aprendiz') { avisos.push('Aprendiz.html nao existe: montado sem o Jovem Aprendiz.'); return ''; }
        if (nome === 'Carga' || nome === 'CargaEstilo') { avisos.push(nome + '.html nao existe: montado sem a Situacao de Carga.'); return ''; }
        throw new Error('Falta o arquivo ' + nome + '.html na pasta ' + o.fonte);
      }
      let saida = '';
      const blocos = blocosDe(ler(nome + '.html'), nome);
      let n = 0;
      blocos.forEach((b) => {
        if (b.tipo === 'style') {
          css.push([nome, b.conteudo]);
          if (!linkCss) { linkCss = true; saida += '<link rel="stylesheet" href="gsl.css?v=@CSS@">'; }
          return;
        }
        const arquivo = 'gsl-' + nome.toLowerCase() + (n++ ? '-' + n : '') + '.js';
        scripts[arquivo] = '/* GSL Bartofil — ' + nome + '.html (montado por ferramentas/montar-local.js; nao edite aqui) */\n' + b.conteudo;
        saida += '<script src="' + arquivo + '?v=' + resumo(scripts[arquivo]) + '"></script>';
      });
      return saida;
    }
    if (/^!=\s*inicial\s*$/.test(corpo.trim())) return 'null';
    throw new Error('Scriptlet que a montagem nao conhece no Index.html: <?' + corpo.slice(0, 60) + '?>');
  });

  const textoCss = css.map(([nome, t]) => '/* ===== ' + nome + '.html ===== */\n' + t).join('\n');
  index = index.replace('@CSS@', resumo(textoCss));

  // O que o servidor poe em volta (setTitle, addMetaTag) e o que so a pagina local tem (configuracao e carimbo).
  const local = { build: c.buildApp, versao: c.versao, montadoEm: new Date().toISOString() };
  const cabeca = '\n  <script src="gsl-config.js"></script>\n' +
    '  <script>var GSL_LOCAL = ' + JSON.stringify(local) + ';</script>';
  const marcaT0 = /<script>\s*var GSL_T0 = Date\.now\(\);\s*<\/script>/;
  if (!marcaT0.test(index)) throw new Error('Index.html sem o GSL_T0 no alto do <head>.');
  index = index.replace(marcaT0, (m) => m + cabeca);
  index = index.replace(/<meta charset="utf-8">/i, (m) => m +
    '\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>' + c.nome + '</title>');
  index = index.replace(/<!DOCTYPE html>/i, (m) => m + '\n<!-- ' + c.nome + ' ' + c.versao + ' (' + c.buildApp + ') — versao local, montada por ferramentas/montar-local.js. Nao edite: monte de novo. -->');

  // Saida: os arquivos montados antes saem (um modulo que deixou de existir nao fica para tras); o gsl-config.js fica.
  fs.mkdirSync(o.saida, { recursive: true });
  fs.readdirSync(o.saida).forEach((f) => {
    if (/^gsl(-[\w-]+)?\.(js|css)$/.test(f) && f !== 'gsl-config.js') fs.unlinkSync(path.join(o.saida, f));
  });
  const escrever = (nome, texto) => fs.writeFileSync(path.join(o.saida, nome), texto, 'utf8');
  escrever('GSL.html', index);
  escrever('gsl.css', textoCss);
  Object.keys(scripts).forEach((f) => escrever(f, scripts[f]));
  const config = path.join(o.saida, 'gsl-config.js');
  if (o.url || !fs.existsSync(config)) escrever('gsl-config.js', textoConfig(o.url));
  escrever('LEIA-ME-LOCAL.md', leiaMe(c, local));
  copiarVendor(o.saida);

  const r = { saida: o.saida, build: c.buildApp, arquivos: fs.readdirSync(o.saida).sort(), avisos };
  if (!o.silencioso) {
    console.log('GSL-Local montado em ' + o.saida + ' (carimbo ' + c.buildApp + ')');
    console.log('  ' + r.arquivos.join('\n  '));
    avisos.forEach((a) => console.log('AVISO: ' + a));
    if (!o.url && /COLE_AQUI/.test(fs.readFileSync(config, 'utf8'))) {
      console.log('Falta o endereco: edite o gsl-config.js (ou monte de novo com --url https://script.google.com/macros/s/ID/exec).');
    }
  }
  return r;
}

/*
 * O pdf.js da Situacao de Carga (o leitor do PDF roda no navegador). A versao vem do Carga.html
 * (CG_PDFJS_VERSAO) e os arquivos de ferramentas/vendor/pdfjs-<versao>: os mesmos que a cdnjs serve.
 */
function copiarVendor(saida) {
  const versao = ((fs.existsSync(path.join(RAIZ, 'GSL', 'Carga.html')) ? fs.readFileSync(path.join(RAIZ, 'GSL', 'Carga.html'), 'utf8') : '')
    .match(/const CG_PDFJS_VERSAO = '([^']+)'/) || [])[1];
  if (!versao) return;
  const origem = path.join(RAIZ, 'ferramentas', 'vendor', 'pdfjs-' + versao);
  if (!fs.existsSync(origem)) throw new Error('Falta ferramentas/vendor/pdfjs-' + versao + ' (o leitor de PDF da Situacao de Carga).');
  const destino = path.join(saida, 'vendor', 'pdfjs-' + versao);
  fs.mkdirSync(destino, { recursive: true });
  fs.readdirSync(origem).forEach((f) => fs.copyFileSync(path.join(origem, f), path.join(destino, f)));
}

function textoConfig(url) {
  return `/*
 * GSL LOCAL — CONFIGURACAO (o unico arquivo da pasta que o administrador edita).
 *
 * url: o endereco /exec da implantacao do GSL no Apps Script
 *   (Implantar > Gerenciar implantacoes > copie o "URL do app da Web").
 * A implantacao precisa estar com "Quem pode acessar: Qualquer pessoa".
 * Com "Qualquer pessoa em Bartofil" o Google pede login e a pasta nao conecta.
 *
 * Ao trocar a pasta por uma versao nova, guarde este arquivo e coloque-o de volta.
 */
var GSL_CONFIG = {
  url: ${JSON.stringify(url || 'https://script.google.com/macros/s/COLE_AQUI_O_ID_DA_IMPLANTACAO/exec')}
};
`;
}

function leiaMe(c, local) {
  return `# GSL Bartofil — versão local (pasta compartilhada)

Versão ${c.versao} · carimbo \`${c.buildApp}\` · montada em ${local.montadoEm.slice(0, 10)}.

Esta pasta é o GSL que abre direto do servidor de arquivos da Bartofil, sem instalar nenhum programa. É o mesmo sistema da versão online: as mesmas telas, o mesmo login (e-mail e PIN do GSL), as mesmas permissões e **os mesmos dados**. A pasta guarda só as telas; tudo o que é gravado continua nas planilhas do Google (um banco por filial), as fotos e anexos no Drive, e os e-mails saem pelo Google.

## O que tem na pasta

| Arquivo | O que é |
|---|---|
| \`GSL.html\` | A página. É ela que cada pessoa abre no Chrome. |
| \`gsl-app.js\`, \`gsl-paineis.js\`, \`gsl-aprendiz.js\` | Os módulos das telas. |
| \`gsl.css\` | A aparência (com as logos da Bartofil). |
| \`vendor/\` | O leitor de PDF da Situação de Carga (pdf.js). |
| \`gsl-config.js\` | O endereço do servidor. **O único arquivo que você edita.** |
| \`LEIA-ME-LOCAL.md\` | Este guia. |

Não edite os outros arquivos: eles são montados a partir do código do GSL (\`node ferramentas/montar-local.js\`).

## 1. Colocar a pasta no servidor

1. Copie a pasta \`GSL-Local\` inteira para a pasta compartilhada, por exemplo \`\\\\servidor\\GSL\\\`.
2. Deixe a pasta só para leitura para os usuários (só o administrador troca os arquivos).

## 2. Liberar a implantação para a pasta (uma vez)

A página aberta da pasta conversa com o Apps Script pela internet. O Google só aceita essa conversa quando a implantação é pública:

1. No Apps Script do GSL: **Implantar › Gerenciar implantações**.
2. Clique no lápis da implantação ativa.
3. Em **Quem pode acessar**, escolha **Qualquer pessoa** (não "Qualquer pessoa em Bartofil").
4. **Executar como** continua **Eu**.
5. Em **Versão**, escolha **Nova versão** e clique em **Implantar**.

Com "Qualquer pessoa em Bartofil" o Google pede login e a página local mostra "Não consegui falar com o servidor do GSL".

**Isso deixa o GSL aberto na internet?** O endereço passa a abrir sem conta Google, mas nada sai sem o login do GSL: toda tela e toda gravação exigem o e-mail e o PIN (com o bloqueio de 10 minutos depois de 5 PINs errados). O primeiro PIN só é criado com o código que chega no e-mail da pessoa (ou que o administrador gera). As funções internas do sistema continuam fechadas.

## 3. Configurar o endereço

1. Copie o **URL do app da Web** da implantação (termina em \`/exec\`).
2. Abra \`gsl-config.js\` no Bloco de Notas e cole o endereço entre as aspas:

\`\`\`
var GSL_CONFIG = {
  url: 'https://script.google.com/macros/s/AKfy...SEU_ID.../exec'
};
\`\`\`

Pode colar o endereço como o Google mostra (\`/a/macros/bartofil.com.br/s/.../exec\`): a página usa sozinha o formato público (\`/macros/s/.../exec\`).

## 4. Atalho na área de trabalho de cada usuário

1. Na área de trabalho: botão direito › **Novo › Atalho**.
2. Em "local do item", digite (troque pelo caminho da sua pasta):

\`\`\`
"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "file://servidor/GSL/GSL.html"
\`\`\`

3. Nome: **GSL Bartofil**.

Também funciona abrir \`\\\\servidor\\GSL\\GSL.html\` direto no Chrome e salvar nos favoritos. Use o **Chrome** (ou o Edge): a página precisa de um navegador atualizado.

## 5. Atualizar (versão nova do GSL)

1. Publique a versão nova no Apps Script como sempre (cole os arquivos e crie uma **Nova versão** da implantação).
2. Monte a pasta nova: \`node ferramentas/montar-local.js\` (ou use a pasta \`GSL-Local\` que veio no pacote).
3. **Guarde o seu \`gsl-config.js\`**, troque a pasta inteira do servidor pela nova e coloque o \`gsl-config.js\` de volta.
4. Cada pessoa aperta **F5**.

Se o servidor e a pasta ficarem em versões diferentes, o GSL mostra a faixa **Atualização incompleta** dizendo que a pasta GSL-Local precisa ser trocada.

## O que continua no Google

- **Dados:** as planilhas GSL_BANCO de cada filial (nada muda nelas).
- **Fotos e anexos:** a pasta do GSL no Drive.
- **E-mails:** avisos, digesto, código de primeiro acesso (pelo Google, como hoje). Os links dos e-mails abrem a versão online, porque o leitor de e-mail não abre arquivos da rede; a pasta também aceita \`GSL.html?tela=acoes\`.
- **Quadro do CD e Jovem Aprendiz:** continuam lendo as planilhas ligadas no Google.
- **Gatilhos** (digesto, geração do mês, aquecimento): rodam no Google, como hoje.
- **Instalação** do sistema e a página \`/exec?diagnostico=1\`: só pela versão online.

A versão online continua funcionando no mesmo endereço, para quem preferir ou estiver fora da rede da Bartofil.

## Problemas comuns

- **"Não consegui falar com o servidor do GSL"**: confira a internet, a implantação em **Qualquer pessoa** (passo 2) e o endereço no \`gsl-config.js\` (passo 3). O botão **Abrir a versão online** abre o sistema pelo Google enquanto isso.
- **"O endereço do gsl-config.js respondeu, mas não é a API do GSL"**: o Codigo.gs publicado é de antes da versão local, ou o endereço não é o /exec do GSL.
- **"Sua sessão terminou"**: a sessão acaba depois de 1 hora sem usar o sistema, como na versão online. Entre de novo com o e-mail e o PIN.
- **Primeiro acesso**: na pasta local o GSL sempre manda o código de 6 números para o e-mail da pessoa (a pasta não sabe qual conta Google está no computador).
- **Administrador sem linha em Pessoas e acessos** não entra pela pasta: cadastre o seu e-mail em Pessoas e acessos (ou entre pela versão online).
`;
}

module.exports = { montar, blocosDe };

if (require.main === module) {
  try { montar(argumentos(process.argv.slice(2))); }
  catch (e) { console.error('ERRO: ' + (e.message || e)); process.exit(1); }
}
