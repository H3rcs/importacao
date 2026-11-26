# GSL Bartofil — versão local (pasta compartilhada)

Versão 4.2.2 · carimbo `2026.11.26` · montada em 2026-11-26.

Esta pasta é o GSL que abre direto do servidor de arquivos da Bartofil, sem instalar nenhum programa. É o mesmo sistema da versão online: as mesmas telas, o mesmo login (e-mail e PIN do GSL), as mesmas permissões e **os mesmos dados**. A pasta guarda só as telas; tudo o que é gravado continua nas planilhas do Google (um banco por filial), as fotos e anexos no Drive, e os e-mails saem pelo Google.

## O que tem na pasta

| Arquivo | O que é |
|---|---|
| `GSL.html` | A página. É ela que cada pessoa abre no Chrome. |
| `gsl-app.js`, `gsl-paineis.js`, `gsl-aprendiz.js`, `gsl-carga.js` | Os módulos das telas. |
| `gsl.css` | A aparência (com as logos da Bartofil). |
| `vendor/` | O leitor de PDF da Situação de Carga (pdf.js). |
| `gsl-config.js` | O endereço do servidor. **O único arquivo que você edita.** |
| `LEIA-ME-LOCAL.md` | Este guia. |

Não edite os outros arquivos: eles são montados a partir do código do GSL (`node ferramentas/montar-local.js`).

## 1. Colocar a pasta no servidor

1. Copie a pasta `GSL-Local` inteira para a pasta compartilhada, por exemplo `\\servidor\GSL\`.
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

1. Copie o **URL do app da Web** da implantação (termina em `/exec`).
2. Abra `gsl-config.js` no Bloco de Notas e cole o endereço entre as aspas:

```
var GSL_CONFIG = {
  url: 'https://script.google.com/macros/s/AKfy...SEU_ID.../exec'
};
```

Pode colar o endereço como o Google mostra (`/a/macros/bartofil.com.br/s/.../exec`): a página usa sozinha o formato público (`/macros/s/.../exec`).

## 4. Atalho na área de trabalho de cada usuário

1. Na área de trabalho: botão direito › **Novo › Atalho**.
2. Em "local do item", digite (troque pelo caminho da sua pasta):

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" "file://servidor/GSL/GSL.html"
```

3. Nome: **GSL Bartofil**.

Também funciona abrir `\\servidor\GSL\GSL.html` direto no Chrome e salvar nos favoritos. Use o **Chrome** (ou o Edge): a página precisa de um navegador atualizado.

## 5. Atualizar (versão nova do GSL)

1. Publique a versão nova no Apps Script como sempre (cole os arquivos e crie uma **Nova versão** da implantação).
2. Monte a pasta nova: `node ferramentas/montar-local.js` (ou use a pasta `GSL-Local` que veio no pacote).
3. **Guarde o seu `gsl-config.js`**, troque a pasta inteira do servidor pela nova e coloque o `gsl-config.js` de volta.
4. Cada pessoa aperta **F5**.

Se o servidor e a pasta ficarem em versões diferentes, o GSL mostra a faixa **Atualização incompleta** dizendo que a pasta GSL-Local precisa ser trocada.

## O que continua no Google

- **Dados:** as planilhas GSL_BANCO de cada filial (nada muda nelas).
- **Fotos e anexos:** a pasta do GSL no Drive.
- **E-mails:** avisos, digesto, código de primeiro acesso (pelo Google, como hoje). Os links dos e-mails abrem a versão online, porque o leitor de e-mail não abre arquivos da rede; a pasta também aceita `GSL.html?tela=acoes`.
- **Quadro do CD e Jovem Aprendiz:** continuam lendo as planilhas ligadas no Google.
- **Gatilhos** (digesto, geração do mês, aquecimento): rodam no Google, como hoje.
- **Instalação** do sistema e a página `/exec?diagnostico=1`: só pela versão online.

A versão online continua funcionando no mesmo endereço, para quem preferir ou estiver fora da rede da Bartofil.

## Problemas comuns

- **"Não consegui falar com o servidor do GSL"**: confira a internet, a implantação em **Qualquer pessoa** (passo 2) e o endereço no `gsl-config.js` (passo 3). O botão **Abrir a versão online** abre o sistema pelo Google enquanto isso.
- **"O endereço do gsl-config.js respondeu, mas não é a API do GSL"**: o Codigo.gs publicado é de antes da versão local, ou o endereço não é o /exec do GSL.
- **"Sua sessão terminou"**: a sessão acaba depois de 1 hora sem usar o sistema, como na versão online. Entre de novo com o e-mail e o PIN.
- **Primeiro acesso**: na pasta local o GSL sempre manda o código de 6 números para o e-mail da pessoa (a pasta não sabe qual conta Google está no computador).
- **Administrador sem linha em Pessoas e acessos** não entra pela pasta: cadastre o seu e-mail em Pessoas e acessos (ou entre pela versão online).
