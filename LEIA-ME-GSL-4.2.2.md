# GSL 4.2.2 — o que mudou e como publicar

O código-fonte está na pasta `GSL/` (e empacotado em `GSL-v4.2.2.zip`). A `4.2.2` parte da `4.2.1` que você enviou. Ela corrige o que impedia o sistema de abrir e tudo o que duas rodadas de revisão completa encontraram:
- 1ª rodada: 57 achados; 55 confirmados e corrigidos.
- 2ª rodada (sobre as próprias correções e sobre os painéis): 39 achados; 37 confirmados e corrigidos.

## Por que o sistema ficava travado na entrada

O erro da foto (`Uncaught SyntaxError: Failed to execute 'write' on 'Document': Unexpected token 'class'`) não vinha do login. Vinha do jeito como o Google entrega a página.

Ao servir a página, o Apps Script apaga tudo o que **parece** comentário de JavaScript (`//` e `/*`). Ele faz isso sem entender textos entre crases (os "templates" que o GSL usa para montar as telas). Dentro de um desses textos, o campo de anexo da atividade tinha `accept="image/*,..."`. O Google tomava aquele `/*` como começo de comentário e apagava o código até o próximo `*/`. Com isso, **o App.html inteiro deixava de rodar**: a página ficava parada em "Abrindo o sistema…" e nenhum botão respondia. A 4.0/4.1, a 4.2 e a 4.2.1 tinham esse trecho.

Havia ainda outras quatro coisas que prendiam a pessoa na entrada, principalmente no servidor em nuvem:
- **várias contas Google no mesmo navegador:** o Google recusa a conversa com `PERMISSION_DENIED`, e a reserva só reagia ao erro 403;
- **`Conversas.gs` antigo esquecido no projeto:** o Apps Script recusava carregar o projeto inteiro;
- **fonte do Google bloqueada ou lenta:** a abertura esperava a fonte;
- **`location.reload()` dentro da moldura do Google:** a tela voltava em branco.

## Depois da primeira publicação

- **O ADMIN vê tudo.** A tabela PERFIS e os painéis gravados na filial podiam vir incompletos de versões antigas, e o administrador não via Filiais e painéis, Nobreaks, Limpeza, Quadro do CD (onde se liga a planilha do BI) e Estoque de TI. Agora o ADMIN tem todas as telas e permissões, sem depender da tabela PERFIS. Ele também vê todos os painéis em qualquer filial. Um painel que não está ligado para os outros aparece para ele com o selo **oculto**; para ligar para todos, use **Filiais e painéis**.
- **Cadastrar outro CD** (Campina Grande, Ponte Nova…): **Configuração › Filiais e painéis › Nova filial**. Informe nome, cidade, código (ex.: CPG, PNV) e os painéis. O sistema cria a planilha da filial sozinho.
- **Estoque de TI** abre direto na aba **Estoque**:
  - Busca grande no topo: digite "mouse" e a lista filtra na hora.
  - Colunas: **Material de Informática CD/Loja** (o mesmo material serve para o CD e para a loja), **Estoque**, **Estoque mínimo** e **Estoque ideal**.
  - **Alerta:** quando um material chega ao estoque mínimo (ou zera), aparece uma faixa vermelha no topo com os itens, e a linha fica marcada. Clicar na faixa mostra só os que precisam repor.
  - **+ Entrada** em cada linha: chegou material, digite a quantidade e aperte Enter (a data já vem com hoje).
  - **− Saída** em cada linha: quantidade, data da saída, **setor** e **usuário que recebeu** (pelo menos um dos dois). Os setores e usuários já usados aparecem como sugestão.
  - As abas **Resumo**, **Movimentações** e **Inventário** continuam.
  - Em **Colar da planilha**, a última coluna é o estoque ideal. O esquema subiu para 8.4 e a coluna nova é criada sozinha.
- **Planilha do BI do Quadro do CD:** abra o painel **Quadro do CD**. Se ainda não houver planilha ligada, a tela mostra o campo para colar o link e o botão **Ligar planilha**; depois, o botão **Trocar planilha** fica no alto da tela. É a planilha com as abas APOIO TA, APOIO TB, APOIO TC, CADMITIDOS (ou CDADMITIDOS) e CDESLIGADOS. O nome da aba pode variar em maiúsculas, acentos e espaços; o título acima do cabeçalho é ignorado; a data de admissão pode ser data, texto (02/09/2025) ou mês ("ago/2025"). Depois de mudar a planilha, clique em **Atualizar dados** no Quadro (a leitura fica guardada por 5 minutos). Ela precisa estar compartilhada com a conta dona do script (a que publicou o GSL). Cada filial liga a sua.
- **Nobreaks:**
  - **Hora só com números:** `0830` vira 08:30 e `14` vira 14:00 (não precisa dos dois pontos). Hora que não existe fica vermelha e não é gravada.
  - O **Histórico** tem a mesma cara da folha de lançamento: dia agrupado, entrada em azul, saída em verde, carga e alerta em vermelho. O mês pode ser "Todos (últimos 120 dias)".
  - **Exportar Excel** gera um `.xlsx` com duas abas: Leituras e Resumo por nobreak.
  - **Exportar PDF** abre o relatório pronto (A4 deitado) e a janela de impressão. Escolha "Salvar como PDF". O relatório exporta o que está filtrado na tela. Se nada abrir, libere pop-ups para o site.
- **Trocar PIN:** botão **Trocar PIN**, abaixo do seu nome no menu lateral. Pede o PIN atual e o novo duas vezes. Quem esqueceu o PIN pede ao administrador: **Pessoas e acessos › Zerar PIN**.

## Pedido de 02/10 (assiduidade 403, relatório dos nobreaks, comentários nas ações)

- **Assiduidade — "NetworkError: falha na conexão devido a HTTP 403":** a lista de colaboradores era uma segunda chamada ao Google, e é ela que o Google barra em alguns computadores (várias contas abertas, ou tela aberta pela navegação de reserva). Agora a lista vem junto com a própria tela. Se o Google barrar a ficha, ela abre recarregando a página (botão **Abrir a ficha**).
- **Relatório dos nobreaks com o layout da folha de lançamento:**
  - **PDF:** uma folha por nobreak e por semana, com o cabeçalho do equipamento (nobreak, local, modelo, potência, tensão, semana) e a grade da folha: os 7 dias com as 3 leituras, ENTRADA em azul, SAÍDA em verde, carga, ocorrências e alertas em vermelho. Leitura não lançada sai em branco, como no papel.
  - **Excel:** uma aba **Resumo** e uma aba por folha (nobreak e semana), no mesmo layout.
- **Comentários nas ações** (Plano de Ação do Calendário e ações da Limpeza):
  - O botão **Comentários** abre o histórico da ação e o campo para registrar o que avançou, a situação e o que ela ainda espera para concluir (**Depende de**).
  - Situações do Plano de Ação: Em andamento, Aguardando ou Concluída. Situações da Limpeza: Aberta, Em andamento ou Concluída.
  - Comentar como "Concluída" conclui a ação.
  - O cartão mostra a situação, o "Depende de" e o último comentário.
  - No Plano de Ação comentam os responsáveis e a gestão. Na Limpeza, quem gere a Limpeza.
- **Identificação de quem comentou:** cada registro do histórico guarda o **e-mail** da pessoa logada (vem da sessão de e-mail e PIN, não de um campo que dê para digitar), o **nome** e a **função/turno** do cadastro (Pessoas e acessos), e a **data e hora**. O administrador que comenta enquanto simula um perfil fica registrado com o próprio nome ("simulando COORDENADOR" na função). Nenhum registro pode ser editado ou apagado pela tela.
- **Histórico completo até a conclusão:** além dos comentários, também entram no histórico, com quem fez:
  - no Plano de Ação: **Marcar como concluída**, **Reabrir** e **Cancelar** (com o motivo);
  - na Limpeza: **Concluir** e a mudança de situação pela edição.

  O topo do histórico mostra quem criou a ação e quando.
- O esquema subiu para 8.7. A tabela COMENTARIOS e as colunas novas (AUTOR_PAPEL, TIPO) são criadas sozinhas.

## Pedido de 01/10 (calendário, assiduidade, quadro, TI, limpeza, menu)

- **Plano de Ação:** os coordenadores veem a tela, e cada um vê **só as ações em que é responsável**. Gerência e admin continuam vendo todas. Uma ação pode ter **mais de um responsável** (ação conjunta): todos são avisados por e-mail, e qualquer um deles pode concluir.
- **Calendário — uma cor por situação:**
  - pendente: cinza;
  - atrasada: vermelho;
  - entregue, aguardando validação: azul;
  - aprovada: verde;
  - reprovada: laranja;
  - cancelada: cinza riscado.

  A legenda fica abaixo do calendário. O arquivo entregue aparece como um anel branco, sem trocar a cor.
- **E-mails com link para a tela certa:** o botão do e-mail abre o Calendário ou o Plano de Ação depois do e-mail e do PIN.
- **Assiduidade:** ficaram só **Colaboradores** (lista ordenada por quem mais faltou: ausências, faltas injustificadas, justificadas, disciplinares, atestados) e **Período**. Os gráficos saíram. A **ficha** mostra as ausências por tipo e o dia a dia, com filtro **De / Até** e atalhos (este mês, 3 meses, 12 meses, tudo).
- **Quadro do CD:** os admitidos da aba **CADMITIDOS** (Produtiva / Colaborador / Equipe / Função / Status, sem data) aparecem. Há uma aba nova, **Admitidos**, com totais por status, equipe e função e a lista com busca.
- **Estoque de TI:**
  - **Exportar Excel** e **Exportar PDF**, como nos Nobreaks.
  - Correção: com estoque mínimo 1, ideal 1 e estoque 1, o item não pede mais reposição. O alerta só aparece quando o estoque chega ao mínimo e ainda está abaixo do ideal.
- **Limpeza CD:**
  - Gestão enxuta: ações em aberto e atrasadas, gasto do mês, produtos acabados sem reposição e as ações que vencem primeiro.
  - A aba **Custos** virou **Compras e consumo**. Registre a compra (**lote** com vários produtos ou **individual**): data, fornecedor, NF e produtos com quantidade e preço. Não precisa cadastrar o produto antes.
  - Quando um produto acabar, aperte **Acabou**: o sistema guarda a data e mede quanto durou.
  - Depois, registre o **reabastecimento**: individual pelo botão **Reabastecer**, ou num lote novo. No lote, o sistema anota o reabastecimento sozinho.
  - A tabela **Consumo por produto** mostra a duração média, a última duração, o custo por dia e o gasto total.
  - As compras do formato antigo continuam contando no gasto do mês.
- **Nível de acesso novo: SUPERVISOR** (Supervisão de limpeza). Vê e cuida só da Limpeza CD. Aparece sozinho em **Pessoas e acessos › Nível de acesso**.
- **Configurações na barra lateral:** Configuração, Pessoas e acessos, Filiais e painéis e Relatos de erro saíram do meio da tela de módulos e ficam sempre no menu lateral. As telas e permissões são as mesmas.
- O esquema subiu para 8.5. As tabelas novas da Limpeza (LP_LOTES, LP_ITENS) e o nível SUPERVISOR são criados sozinhos na primeira abertura.

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
- Aba fechada e reaberta (Ctrl+Shift+T) pede o PIN. O F5 continua funcionando. Uma sessão parada há 1 hora acaba, e a tela diz que a sessão terminou (também no modo de reserva).
- No modo de reserva, clicar duas vezes em **Entrar** não cai mais em "esta página não pode ser reenviada". Página de entrada aberta a noite toda: a tela explica, guarda o e-mail e pede só o PIN.
- Primeiro acesso: trocar o e-mail digitado desfaz o pedido de código. Antes, quem digitava o e-mail errado ficava preso na caixa do código até recarregar a página.
- O e-mail de código tem limite: 3 por pessoa a cada 15 minutos, um teto por hora para o sistema inteiro e uma reserva da cota diária de e-mail (o resumo diário não fica sem cota). Os 3 últimos códigos enviados continuam valendo.
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
- Remover o único arquivo entregue devolve a atividade para pendente. Uma entrega **reprovada** continua reprovada e com a data da 1ª entrega.
- "Entrega recebida" abre a entrega mais nova (a corrigida), não a reprovada. O nome do PDF leva a hora.
- Um e-mail com erro não derruba mais o resumo diário (digesto) dos outros turnos.
- A entrega em PDF avisa quando o e-mail para a gestão não saiu.
- Os e-mails mostram certo textos com `<` e `>`.
- O Plano de Ação não mostra mais os dados de outra pessoa. O filtro **Geral (CD)** separa as ações do turno "Todos".
- As vagas de rotinas avulsas (não só TRE) aparecem e podem ser agendadas. Agendar uma vaga que não é treinamento manda aviso de "Atividade agendada", não "Treinamento marcado".
- A Central, mês a mês, conta só atividades com data (sem as vagas avulsas não agendadas).
- O filtro do calendário continua valendo depois de uma ação. O filtro de turno não fica mais preso num mês que não tem aquele turno.
- Numa troca de filial lenta, a filial abandonada não abre sozinha depois. A lista de colaboradores de uma filial não aparece na outra.
- Com várias contas Google, um erro ao salvar mostra a explicação certa, e não mais a janela "Falta autorizar o envio de e-mail".

**Nobreaks e Limpeza**
- Número com ponto de milhar ("7.500" VA, embalagem de "5.000" ml, "1.500" reais) era gravado 1000 vezes menor. O custo previsto por mês saía errado.
- Nobreaks: quem está em **Ver** no módulo não cadastra, edita, remove nem importa equipamento.
- Hora "8h" vira 08:00. A "última leitura" do cartão e o alerta usam a leitura mais nova do dia.
- A importação da planilha antiga de nobreaks não para quando o cadastro repete o código ("NB 04" e "NB-04").
- A importação da Limpeza guarda duas compras, duas embalagens ou duas não conformidades iguais do mesmo dia. Antes ficava uma só, e podia sumir uma ação **aberta**. Reimportar continua sem duplicar.
- Renomear um produto leva as embalagens e compras junto. Nome repetido também é recusado na edição.
- Formulários da Limpeza não trocam mais em silêncio o produto, a zona, o turno ou a origem que não estão na lista.
- Ação registrada já concluída fecha na data dela (antes era "hoje"). O formulário tem o campo "Concluída em", e conclusão antes da data da ação é recusada.
- A aba clicada (Nobreaks, Limpeza, Estoque) fica acesa.

**Estoque de TI, Filiais e Configuração**
- Tirar alguém da última filial em **Quem entra** dava a essa pessoa acesso à filial principal. Salvar Quem entra também não tira mais a filial de quem está desativado.
- Estoque: 1,1 m + 0,9 m tiram os 2 m do cabo, sem resto de conta decimal que travava a última saída. Saída estornada sai das contas do mês e perde o botão Estornar. O histórico não mostra mais saldo negativo com dois lançamentos no mesmo segundo.
- Depois de um código TI com 5 dígitos, os códigos automáticos continuam (antes davam "Já existe TI-0251" para sempre).
- Rotinas: sigla repetida (a segunda rotina nunca era gerada) e dia semanal inválido ("segunda", "9") são recusados. Se o banco já tiver duas rotinas com a mesma sigla, a tela pede outra sigla ao editar uma delas.
- DE-PARA: código repetido é recusado (valia a linha nova, e a correção da linha visível não fazia efeito). Se o banco já tiver um código repetido, apague uma das linhas antes de editar a outra. A lista de "Códigos fora da legenda" mostra os que já estão cadastrados e só esperam o **Reclassificar**.
- A atualização de versão não religa o Estoque que o administrador desligou na filial principal.
- A trava de gravação grava a planilha antes de ser solta (evita dois "último item" saírem ao mesmo tempo). O número de dígitos da matrícula não vaza de uma filial para outra nas tarefas automáticas.

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
node testes/atividades.js             # calendário, Central, avisos (12 casos)
node testes/paineis.js                # Nobreaks, Limpeza, Estoque, Filiais, Configuração, ADMIN, PIN (30 casos)
node testes/e2e.js                    # entrada, PIN, 403, várias contas, telas, Período, painéis (39 cenários)
```

O `e2e.js` precisa do Playwright com Chromium. Rode tudo antes de publicar: é o que impede o erro da foto de voltar.
