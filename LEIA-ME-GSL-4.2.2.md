# GSL 4.2.2 — o que mudou e como publicar

O código-fonte está na pasta `GSL/` (e empacotado em `GSL-v4.2.2.zip`). A `4.2.2` parte da `4.2.1` que você enviou e corrige o que impedia o sistema de abrir, além do que a revisão completa encontrou.

## Por que o sistema ficava travado na entrada

O erro da foto (`Uncaught SyntaxError: Failed to execute 'write' on 'Document': Unexpected token 'class'`) não vinha do login. Ele vinha do jeito como o Google entrega a página.

Ao servir a página, o Apps Script apaga tudo o que **parece** comentário de JavaScript (`//` e `/*`). Ele faz isso sem entender textos entre crases (os "templates" que o GSL usa para montar as telas). Dentro de um desses textos, o campo de anexo da atividade tinha `accept="image/*,..."`. O Google tomava aquele `/*` como começo de comentário e apagava o código até o próximo `*/`. Com isso, **o arquivo App.html inteiro deixava de rodar**. A página ficava parada em "Abrindo o sistema…" e nenhum botão respondia. O mesmo acontecia com os `https://` dentro desses textos.

A 4.0/4.1 e a 4.2 tinham esse mesmo trecho. A 4.2.1 também.

## O que foi corrigido

**Abertura e entrada**
- Removidos todos os `//` e `/*` que não são comentário, em `App.html`, `Paineis.html` e nos dados que vão junto com a página (`Codigo.gs`). O teste `testes/checar-htmlservice.js` confere isso.
- Se algum dia o código da página não carregar, a tela mostra o erro ("O sistema não carregou: …") em vez de ficar girando para sempre.
- `Conversas.gs` antigo esquecido no projeto: ele declarava de novo um nome que hoje está no `Codigo.gs`, e o Apps Script **recusava carregar o projeto inteiro**. O nome foi trocado. Também vai um `Conversas.gs` vazio para colar por cima do antigo.
- `location.reload()` foi trocado por uma recarga da janela inteira. Dentro da moldura do Google, o reload deixava a tela em branco. Isso afetava instalar, "Tentar de novo", "Já fui liberado" e "Já troquei".
- O código da sessão **não vai mais na URL** (`?t=…`). No computador compartilhado, o próximo usuário voltava pelo histórico do navegador e entrava como a pessoa anterior, sem digitar o PIN. A navegação de reserva (usada quando o Google bloqueia a conexão com HTTP 403) agora é por POST.
- **Primeiro acesso com código.** Antes, qualquer pessoa que soubesse o e-mail de um colega, ou de um administrador, podia criar o PIN dele e entrar como ele. Agora, no primeiro acesso, o sistema manda um código de 6 números para o e-mail da pessoa. Ela digita esse código junto com o PIN novo. Isso não é pedido quando o navegador já está na conta Google dela. O administrador também pode gerar um código em **Pessoas e acessos › Código de acesso / Zerar PIN**.
- O e-mail "acesso liberado" dizia que não havia senha. Agora ele explica o e-mail + PIN.

**Assiduidade › Período (datas duplicadas)**
- A versão 4.0/4.1 não tinha nenhuma deduplicação. Quando duas folhas do RH se sobrepunham, a mesma falta aparecia duas vezes ("19/08, 19/08"). A 4.2 já corrigia esse caso. A 4.2.2 fecha as outras quatro causas:
  1. matrícula gravada como número por versões antigas (`12345`) ao lado da nova em texto (`012345`): a pessoa virava duas linhas;
  2. mesma pessoa em dois blocos da folha (troca de turno): o dia contava duas vezes e uma falta podia sumir;
  3. coluna "31" num mês de 30 dias virava o dia 1 do mês seguinte (data repetida);
  4. rótulo antigo de competência (`08/2025`) não era reconhecido como `2025-08`.

**Outros**
- "Reportar erro" ou "Atualizar dados" na tela inicial de módulos levava a uma tela de erro sem saída.
- A tela "Relatos de erro" não aparecia para bancos já atualizados. A versão do esquema subiu para 8.3.
- O menu não oferece mais telas que abririam direto num erro de permissão.

## Como publicar (passo a passo)

1. Abra o projeto do GSL no Apps Script da empresa.
2. **Apague** os arquivos `Conversas.gs` e `Login.gs`, se existirem. Se preferir não apagar o `Conversas.gs`, cole por cima dele o `Conversas.gs` vazio desta versão.
3. Substitua o conteúdo de **todos** os arquivos pelos da pasta `GSL/`, com os mesmos nomes. São 26 `.gs` e `.html` (contando o `Conversas.gs` vazio) mais o `appsscript.json`. Arquivo `.html` no editor é "HTML", sem a extensão no nome.
4. Salve. Em **Implantar › Gerenciar implantações**, edite (lápis) a implantação que já existe e escolha **Versão: Nova versão**. Assim o endereço continua o mesmo. Confira:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa em Bartofil**
5. Abra o endereço do sistema. A tela deve pedir e-mail e PIN. Se aparecer "O sistema não carregou: …", mande a mensagem.
6. O código de primeiro acesso vai por e-mail. Se o e-mail nunca foi autorizado, rode `testarEmail` pelo editor (Executar) e aceite as permissões.
7. Entre como administrador e clique **uma vez** em **Reclassificar a base** (Configuração, parte do RH). Assim os painéis e a aba Colaboradores dos meses já fechados são refeitos com as contas novas (sem "Ignorar", um lançamento por pessoa e dia). Os meses abertos se refazem sozinhos.
8. Abra `…/exec?diagnostico=1`. Se a linha "Endereço usado pelo sistema" terminar em `/dev`, copie o endereço `/exec` da implantação. Cole em **Configurações do projeto › Propriedades do script** com o nome `URL_APP`.

## Testes (para quem mexer no código)

Os testes rodam o GSL num emulador do Apps Script, com a página dentro de um Chromium de verdade.

```
node testes/checar-htmlservice.js     # nenhum // ou /* que o Google apagaria
node testes/assiduidade.js            # os 5 casos de data repetida / conta errada
node testes/e2e.js                    # instalação, entrada, PIN, 403, telas, Período…
```

O `e2e.js` precisa do Playwright com Chromium. Rodar os três antes de publicar evita que o erro da foto volte.
