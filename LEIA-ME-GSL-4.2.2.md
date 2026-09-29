# GSL 4.2.2 — o que mudou e como publicar

O código-fonte está na pasta `GSL/` (e empacotado em `GSL-v4.2.2.zip`). A `4.2.2` parte da `4.2.1` que você enviou. Ela corrige o que impedia o sistema de abrir e tudo o que a revisão completa encontrou: 57 achados, dos quais 55 foram confirmados e corrigidos.

## Por que o sistema ficava travado na entrada

O erro da foto (`Uncaught SyntaxError: Failed to execute 'write' on 'Document': Unexpected token 'class'`) não vinha do login. Vinha do jeito como o Google entrega a página.

Ao servir a página, o Apps Script apaga tudo o que **parece** comentário de JavaScript (`//` e `/*`). Ele faz isso sem entender textos entre crases (os "templates" que o GSL usa para montar as telas). Dentro de um desses textos, o campo de anexo da atividade tinha `accept="image/*,..."`. O Google tomava aquele `/*` como começo de comentário e apagava o código até o próximo `*/`. Com isso, **o App.html inteiro deixava de rodar**: a página ficava parada em "Abrindo o sistema…" e nenhum botão respondia. A 4.0/4.1, a 4.2 e a 4.2.1 tinham esse trecho.

Havia ainda outras quatro coisas que prendiam a pessoa na entrada, principalmente no servidor em nuvem:
- **várias contas Google no mesmo navegador:** o Google recusa a conversa com `PERMISSION_DENIED`, e a reserva só reagia ao erro 403;
- **`Conversas.gs` antigo esquecido no projeto:** o Apps Script recusava carregar o projeto inteiro;
- **fonte do Google bloqueada ou lenta:** a abertura esperava a fonte;
- **`location.reload()` dentro da moldura do Google:** a tela voltava em branco.

## O que foi corrigido

**Abertura e entrada**
- Removidos todos os `//` e `/*` que não são comentário (`App.html`, `Paineis.html` e os dados que vão com a página). O teste `testes/checar-htmlservice.js` confere isso.
- Se o código da página não carregar, a tela mostra o erro ("O sistema não carregou: …") em vez de girar para sempre.
- Com várias contas Google (`PERMISSION_DENIED`) ou com o erro 403, a entrada vai por formulário (POST). Se o Google demorar a recusar, a tela pede um segundo clique.
- `Conversas.gs`: o nome que colidia foi trocado. Vai também um `Conversas.gs` vazio para colar por cima do antigo.
- As fontes carregam sem travar a abertura. O sistema começa assim que a página é lida.
- O botão "Tentar de novo" e os parecidos recarregam a janela inteira, não só a moldura.

**Segurança da entrada (computador compartilhado)**
- **Primeiro acesso com código.** Antes, quem soubesse o e-mail de um colega, ou de um administrador, criava o PIN dele e entrava como ele. Agora o sistema manda um código de 6 números para o e-mail da pessoa, que o digita junto com o PIN novo. Isso não é pedido se o navegador já está na conta Google dela. O administrador também pode gerar um código em **Pessoas e acessos › Código de acesso / Zerar PIN**.
- O código da sessão não vai mais na URL. Reenviar um formulário pelo histórico (F5 ou Voltar depois de "Sair") não entra de novo, porque cada página leva um bilhete de uso único.
- **Sair** apaga a sessão no servidor, também no modo de reserva.
- Aba fechada e reaberta (Ctrl+Shift+T) pede o PIN. O F5 continua funcionando. Uma sessão parada há 1 hora acaba.
- Quem entra mas não tem filial ou nível vê um botão **Entrar com outro e-mail**.
- A filial de quem usou o computador antes não passa para a pessoa seguinte.
- **Funções internas fechadas.** Qualquer conta da empresa conseguia, pelo console do navegador, ler dados de pessoas, perfis, filiais, a assiduidade de cada um e até o segredo do PIN. Agora essas funções recusam chamadas que não vêm da tela. O teste `testes/seguranca.js` confere 20 delas.

**Assiduidade › Período (datas duplicadas)**
- A 4.0/4.1 não deduplicava nada: com duas folhas do RH se sobrepondo, a mesma falta aparecia duas vezes ("19/08, 19/08"). A 4.2 já tratava esse caso. A 4.2.2 fecha as outras causas:
  1. matrícula gravada como número por versões antigas (`12345`) ao lado da nova em texto (`012345`): a pessoa virava duas linhas;
  2. mesma pessoa em dois blocos da folha (troca de turno): o dia contava duas vezes e uma falta podia sumir;
  3. coluna "31" num mês de 30 dias virava o dia 1 do mês seguinte;
  4. rótulo antigo de competência (`08/2025`) permitia cadastrar o mesmo mês duas vezes.
- Depois de "Reclassificar", os códigos marcados como **Ignorar** continuavam contando: o absenteísmo aparecia menor do que era (3,7% em vez de 4,5% no teste).
- **Atualizar dados** não dá mais erro a partir do dia 21, quando a folha do mês novo ainda está vazia. Os outros meses são atualizados e a tela avisa qual está vazio.
- O seletor de competência aparece também na tela "sem dados". O diagnóstico mostra as sobras de meses renomeados e tem o botão **Limpar sobras**.

**Calendário, atividades e avisos**
- A Central e a Apresentação contam o mesmo que o Calendário. Antes, um mês 100% aprovado aparecia com 43%.
- Rotina mensal do dia 29–31 cai no último dia do mês. Antes ela pulava para o mês seguinte.
- Remover o único arquivo entregue devolve a atividade para pendente.
- "Entrega recebida" abre a entrega mais nova (a corrigida), não a reprovada. O nome do PDF leva a hora.
- Um e-mail com erro não derruba mais o resumo diário (digesto) dos outros turnos.
- A entrega em PDF avisa quando o e-mail para a gestão não saiu.
- Os e-mails mostram certo textos com `<` e `>`.
- O Plano de Ação não mostra mais os dados de outra pessoa. O filtro **Geral (CD)** separa as ações do turno "Todos".
- As vagas de rotinas avulsas (não só TRE) aparecem e podem ser agendadas.
- O filtro do calendário continua valendo depois de uma ação.

**Outros**
- "Reportar erro" ou "Atualizar dados" na tela inicial de módulos levava a uma tela de erro sem saída.
- A tela "Relatos de erro" não aparecia para bancos já atualizados. O esquema subiu para 8.3.
- O menu não oferece mais telas que abririam direto num erro de permissão.

## Como publicar (passo a passo)

1. Abra o projeto do GSL no Apps Script da empresa.
2. **Apague** os arquivos `Conversas.gs` e `Login.gs`, se existirem. Se preferir não apagar, cole por cima do `Conversas.gs` o arquivo vazio desta versão.
3. Substitua o conteúdo de **todos** os arquivos pelos da pasta `GSL/`, com os mesmos nomes. São 26 arquivos `.gs` e `.html` (contando o `Conversas.gs` vazio) mais o `appsscript.json`. No editor, os `.html` aparecem como "HTML", sem a extensão no nome.
4. Salve. Em **Implantar › Gerenciar implantações**, edite (lápis) a implantação que já existe e escolha **Versão: Nova versão**. Assim o endereço continua o mesmo. Confira:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa em Bartofil**
5. Abra o endereço do sistema. A tela deve pedir e-mail e PIN. Se aparecer "O sistema não carregou: …", mande a mensagem.
6. O código de primeiro acesso vai por e-mail. Se o envio de e-mail nunca foi autorizado, rode `testarEmail` pelo editor (**Executar**) e aceite as permissões.
7. Entre como administrador e rode **uma vez** o **Reclassificar** (Configuração, parte do RH; a janela se chama "Reclassificar a base"). Assim os meses já fechados são refeitos com as contas novas. Os meses abertos se refazem sozinhos.
8. Abra `…/exec?diagnostico=1`. Se a linha "Endereço usado pelo sistema" terminar em `/dev`, copie o endereço `/exec` da implantação e cole em **Configurações do projeto › Propriedades do script**, com o nome `URL_APP`.
9. (Opcional) Atividades gravadas em dobro por versões antigas: no editor, rode `conferirAtividadesDuplicadas` e veja o **Registro de execução**. Se a lista fizer sentido, rode `limparAtividadesDuplicadas`. Ele junta os anexos na cópia que fica e marca as outras como excluídas; nada é apagado da planilha.

**Dica para o servidor em nuvem:** se várias contas Google estiverem abertas no navegador, o sistema entra pelo modo de reserva, e funciona. Mas o mais estável é usar uma janela (ou um perfil do Chrome) só com a conta `@bartofil.com.br`.

## Testes (para quem mexer no código)

Os testes rodam o GSL num emulador do Apps Script. Nos de tela, a página roda dentro de um Chromium de verdade, na mesma moldura (sandbox) que o Google usa.

```
node testes/checar-htmlservice.js     # nenhum // ou /* que o Google apagaria
node testes/seguranca.js              # funções internas fechadas ao console
node testes/assiduidade.js            # datas repetidas e contas erradas (9 casos)
node testes/atividades.js             # calendário, Central, avisos (9 casos)
node testes/e2e.js                    # entrada, PIN, 403, várias contas, telas, Período (27 cenários)
```

O `e2e.js` precisa do Playwright com Chromium. Rode tudo antes de publicar: é o que impede o erro da foto de voltar.
