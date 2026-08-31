# TESTES — o que rodar no Apps Script para validar cada correção

Um item por correção do `CHANGELOG.md`. A coluna **ID** é a mesma dos dois
arquivos, então dá para ir e voltar.

Cada teste tem: **o que fazer**, **o que tem que acontecer** e, quando o
defeito era invisível, **como era antes** — para você reconhecer que a
correção pegou.

> Marque `[x]` conforme for passando. Se algum falhar, o ID diz exatamente
> qual mudança investigar.

---

## Antes de começar — subir o código

- [ ] **T0.1** Cole os 17 arquivos do `02_CORRIGIDO/` por cima dos atuais no
      projeto **GSL TESTE**. Não crie duplicados. Se o seu projeto tem
      `config.gs` em minúsculo, cole nele.
- [ ] **T0.2** Abra o `appsscript.json` no editor e **confirme que não há
      bloco `oauthScopes`**. (C14 — regra inviolável. Se ele voltar, o
      e-mail quebra.)
- [ ] **T0.3** Salve (Ctrl+S) e espere o ícone de nuvem parar.
- [ ] **T0.4** Implantar → Gerenciar implantações → lápis → **Nova versão**
      → Implantar. Para testar durante o ajuste, use a URL `/dev`.

**Atalho de sanidade (30 s, no editor):** Executar → `diagnostico` →
Ctrl+Enter para ver o registro. Ele agora **roda** (C16). Guarde esse
registro: é a sua linha de base de tempo.

---

## Bloco 1 · Instalação e estrutura

- [ ] **T1 (C1) — a instalação chega ao fim**
  *Só se você for criar um banco novo.* Apague a propriedade `ID_BANCO`
  (Configurações do projeto → Propriedades do script), abra o app e clique
  em **Criar banco de dados**.
  **Esperado:** o banco é criado e o app abre logado como administrador.
  **Antes:** morria em *"O banco ainda nao foi instalado"* — com a planilha
  recém-criada no Drive.

- [ ] **T2 (C11) — a instalação ficou rápida**
  No mesmo teste acima, cronometre.
  **Esperado:** poucos segundos. As sementes agora são 5 escritas, não 68.
  **Antes:** ~383 chamadas de serviço.

- [ ] **T3 (C12) — nenhum ID repetido**
  Abra a planilha `GSL_BANCO`, aba **DE_PARA**, coluna ID.
  **Esperado:** 35 IDs, todos diferentes. (Repita na COLABORADORES depois
  do T12.)

- [ ] **T4 (B1) — a página monta inteira**
  Abra o app e aperte F12 → Console.
  **Esperado:** nenhum erro de HTML mal formado; a barra lateral, o topo e
  o conteúdo aparecem nos lugares certos.

---

## Bloco 2 · Identidade visual (regras invioláveis)

- [ ] **T5 (M10) — abre no tema claro**
  Coloque o celular (ou o Chrome) no **modo escuro** e abra o app numa aba
  anônima.
  **Esperado:** o app abre **claro**.
  **Antes:** abria escuro, seguindo o aparelho.

- [ ] **T6 (C15) — nenhum vermelho na tela**
  Abra o Calendário num mês que tenha atividade **atrasada** e outra
  **reprovada**. Olhe as pílulas de status, as etiquetas, o cartão de
  atrasadas na Central e a faixa de andamento.
  **Esperado:** tudo em **âmbar/dourado**. Nada vermelho.
  Repita no tema escuro (botão ☾ no topo).

- [ ] **T7 (C15) — nenhum vermelho nos botões e avisos**
  Force um erro: tente reprovar uma atividade **sem escrever motivo**.
  **Esperado:** a tarja de aviso aparece em âmbar escuro, texto legível.
  Confira também o botão "Cancelar atividade" e o "Encerrar mês".

- [ ] **T8 (C15) — nenhum vermelho nos e-mails**
  Configuração → **Enviar digesto agora**. Abra o e-mail que chegou.
  **Esperado:** o cabeçalho da seção "ATRASADAS" e a caixa de motivo de
  reprovação em âmbar. Nada vermelho.
  **Antes:** `#D71920` puro em todo e-mail que o sistema mandava.

- [ ] **T9 (M9) — o fundo não come a máquina**
  Com o app aberto no tema **claro**, F12 → aba Performance (ou o medidor
  de FPS: Ctrl+Shift+P → "Show frames per second").
  **Esperado:** o app fica fluido; as camadas do céu escuro estão
  **congeladas**, não apenas invisíveis.

---

## Bloco 3 · Velocidade sentida (é o motivo do trabalho)

- [ ] **T10 (C9) — o login não trava o primeiro clique**
  Entre no sistema e, **assim que a tela de módulos aparecer**, clique num
  módulo imediatamente.
  **Esperado:** responde na hora.
  **Antes:** ficava até ~15 s parado, esperando 7 prebuscas terminarem.

- [ ] **T11 (C8) — aprovar uma atividade é rápido**
  Abra o Calendário → uma atividade entregue → **Aprovar**. Cronometre do
  clique até a tela voltar.
  **Esperado:** 2 idas ao servidor (uns poucos segundos), e o próximo
  clique responde na hora.
  **Antes:** 8 idas — a ação, a tela e mais 6 de prebusca — e o clique
  seguinte entrava atrás delas.

- [ ] **T12 (C8) — voltar para uma tela já vista é instantâneo**
  Central → Calendário → Central.
  **Esperado:** a volta pinta na hora, sem "Carregando…". Se houver
  novidade, a tela se corrige sozinha em silêncio.

- [ ] **T13 (C9) — a prebusca não atrapalha**
  Entre num módulo e fique clicando entre as telas dele por uns 10 s.
  **Esperado:** nada engasga. A prebusca cede a vez enquanto você usa.

- [ ] **T14 (M3/M4/M5) — Central e Calendário abrem mais leves**
  Compare com o registro do `diagnostico` que você guardou no T0.
  **Esperado:** "montar tela inicio" e "montar tela calendario" abaixo do
  que eram.

- [ ] **T15 (C13) — salvar coisa pequena não derruba o BI**
  Abra Assiduidade → aba **Análise** (deixe carregar). Vá em Configuração,
  **adicione um setor**, e volte para Análise.
  **Esperado:** a Análise volta rápido — o cache das 5 mil linhas da
  FATO_ASSIDUIDADE sobreviveu à gravação do setor.
  **Antes:** salvar um setor jogava fora o cache de ATIVIDADES,
  FATO_ASSIDUIDADE, AGR_COLAB e PERFIS.

---

## Bloco 4 · O BI de assiduidade (o defeito mais grave)

> **Este bloco é o mais importante.** Antes da correção, todos os números
> de assiduidade estavam errados e a tela carregava normalmente — nada
> denunciava o problema.

- [ ] **T16 (C2) — dias trabalhados deixaram de ser zero**
  Assiduidade → aba **Colaborador**.
  **Esperado:** a coluna de dias trabalhados traz números reais (perto do
  número de dias úteis do mês) e a assiduidade individual fica na casa dos
  90%.
  **Antes:** trabalhados = 0 e assiduidade = **0%** para **todo mundo**.

- [ ] **T17 (C2) — a taxa por turno faz sentido**
  Assiduidade → aba **Painel**, cartão "% de ausência por turno".
  **Esperado:** algo entre 2% e 15%.
  **Antes:** **100%** em todos os turnos.

- [ ] **T18 (C2) — o ranking volta a existir**
  Assiduidade → aba **Ranking**.
  **Esperado:** a lista "melhores" traz nomes com assiduidade real e
  ordenada.
  **Antes:** ranking vazio ou todo mundo empatado em 0%.

- [ ] **T19 (C2) — férias, folgas e licenças aparecem**
  Abra a planilha `GSL_BANCO`, aba **AGR_COLAB**, colunas FERIAS, FOLGAS,
  LICENCAS de um mês importado.
  **Esperado:** valores preenchidos para quem teve.
  **Antes:** tudo zero.
  *(Se ainda estiver zerado depois de reimportar, o código correspondente
  no DE-PARA pode estar com a categoria errada — veja T24.)*

- [ ] **T20 (C3/C4) — o filtro por tipo do Período funciona**
  Assiduidade → aba **Período** → escolha "Este mês" → no campo **Tipo**
  escolha **Falta** → Consultar.
  **Esperado:** a lista traz só as faltas, e o número é **menor** que o de
  "Todas as ausências".
  **Antes:** o campo Tipo tinha cinco opções fixas e **todas** devolviam
  lista vazia (ou o total sem filtro nenhum).

- [ ] **T21 (C4) — o campo Tipo só oferece o que existe**
  Ainda no Período, abra o seletor **Tipo**.
  **Esperado:** "Todas as ausências" mais as categorias que o **seu**
  DE-PARA marca como ausência. Nada de opção que não leva a lugar nenhum.

- [ ] **T22 (C5) — custo e reincidência contam as faltas**
  Configuração → Parâmetros → preencha **CUSTO_DIA_AUSENCIA** (ex.: 180).
  Assiduidade → aba **Análise**.
  **Esperado:** o cartão de custo mostra valor, e a tabela de Reincidência
  traz a coluna **Faltas** preenchida (era "Injustif." e vivia zerada).

- [ ] **T23 (C6) — o cruzamento bate com o Calendário**
  Assiduidade → Análise → tabela "Assiduidade × entregas". Anote as
  atrasadas de um turno. Vá ao Calendário e conte as atrasadas do mesmo
  turno **no mesmo período**.
  **Esperado:** os números conversam.
  **Antes:** a Análise mostrava 0 atrasadas enquanto o Calendário mostrava
  uma dúzia — ela lia a coluna STATUS, que quase nunca é atualizada.

- [ ] **T24 (M13) — o DE-PARA voltou para a tela**
  Configuração → role até o cartão **DE-PARA**.
  **Esperado:** a tabela dos códigos aparece, com Editar e Remover.
  Clique em **Novo código**: a **categoria é um seletor**, não texto livre
  (foi grafia divergente que zerou o BI inteiro).
  **Antes:** o cartão não existia — a tabela só podia ser corrigida abrindo
  a planilha na mão.

- [ ] **T25 (M13) — códigos sem tradução**
  Configuração → DE-PARA → **Códigos sem tradução**.
  **Esperado:** ou a lista dos códigos que a folha trouxe e não estão
  cadastrados, ou "nenhum código pendente".

- [ ] **T26 (M13) — reclassificar**
  Mude a categoria de um código pouco usado, salve, e clique em
  **Reclassificar a base**.
  **Esperado:** termina sem erro e os painéis refletem a mudança.
  *(Pode demorar alguns minutos se houver muitos meses importados.)*

- [ ] **T27 (C11) — a importação da folha não estoura o tempo**
  Configuração → Arquivos do RH → **Reimportar** a competência aberta.
  Cronometre.
  **Esperado:** termina bem dentro do limite de 6 minutos, mesmo com o CD
  inteiro. Rode uma **segunda vez** em seguida: deve ser ainda mais rápida,
  porque quem não mudou nem é tocado.
  **Antes:** ~1.200 chamadas de serviço só para gravar os colaboradores.

- [ ] **T28 (M6) — competência não "some"**
  Assiduidade → troque a competência no seletor do topo, ida e volta.
  **Esperado:** os dados aparecem sempre.
  **Antes:** se a célula `2026-08` tivesse virado data na planilha, a tela
  dizia "competência sem dados importados" com o painel gravado ali do lado.

---

## Bloco 5 · Calendário e ciclo de entrega

- [ ] **T29 (C17) — validar dá erro claro, não quebra**
  *No editor:* Executar → cole no console de execução uma chamada a
  `executarAcao('SEU_EMAIL','validar',{id:'NAO-EXISTE',validacao:'Aprovado'})`.
  **Esperado:** *"Atividade nao encontrada."*
  **Antes:** `Cannot read properties of null (reading 'PRAZO')`.

- [ ] **T30 (M1) — aprovar/reprovar continua avisando por e-mail**
  Aprove uma entrega e reprove outra (com motivo).
  **Esperado:** o coordenador do turno recebe os dois e-mails, com os dados
  corretos da atividade (prazo, turno, setor, motivo).
  *Isto valida a mudança mais delicada do lote: o e-mail passou a ser
  montado em memória em vez de reler a planilha.*

- [ ] **T31 (M2) — remarcar limpa o atraso**
  Pegue uma atividade **atrasada**, remarque para daqui a 15 dias com
  motivo.
  **Esperado:** ela some das atrasadas e volta como **Pendente**. Confira
  também a coluna STATUS na planilha: tem que estar "Pendente".
  **Antes:** a coluna continuava "Atrasada".

- [ ] **T32 (M12) — o e-mail não desfaz a entrega**
  *Só se o seu envio de e-mail estiver com problema.* Faça uma entrega.
  **Esperado:** a entrega é gravada e você vê um aviso dizendo que o
  e-mail não saiu — **não** uma mensagem de erro que faz você reenviar.

- [ ] **T33 (C11) — encerrar o mês é instantâneo**
  Num mês antigo, use **Encerrar mês**. Cronometre.
  **Esperado:** responde em segundos, e todas as pendentes ficam
  Canceladas — **menos as já aprovadas**, que não podem ser tocadas.
  **Antes:** ~228 chamadas de serviço; o botão parecia travado.

- [ ] **T34 (C7) — a entrega em PDF abre**
  Abra uma atividade que tenha entrega em PDF.
  **Esperado:** o botão grande "Entrega recebida" abre o PDF no Drive.

- [ ] **T35 (C7/M15) — anexos avulsos voltaram a aparecer**
  Numa atividade com anexo, abra a janela.
  **Esperado:** a lista de anexos carrega com nome, tamanho, **Baixar** e
  **Abrir**; quem pode entregar vê também **Remover**.
  **Antes:** a lista nunca era montada — as ações `detalhesAtividade` e
  `removerAnexo` estavam inalcançáveis, e um PDF entregue aparecia como
  "(arquivo removido do Drive)".

- [ ] **T36 (M11) — a pasta de envio é validada**
  Faça uma entrega com 2 ou 3 fotos.
  **Esperado:** o PDF único é gerado e arquivado normalmente.
  *(A trava nova só recusa pasta fora de `Anexos/_TEMPORARIO`; o fluxo
  normal não muda.)*

- [ ] **T37 (M14) — nova rotina**
  Configuração → cartão Rotinas → **Nova rotina**.
  **Esperado:** o formulário abre **em branco** e salva.
  **Antes:** o botão não existia; chamar a função sem id quebrava.

- [ ] **T38 (M13) — remover rotina**
  Ainda no cartão Rotinas, remova uma rotina de teste.
  **Esperado:** some da lista; as atividades já geradas **continuam** no
  calendário.

---

## Bloco 6 · Configuração, acessos e rotinas automáticas

- [ ] **T39 (M8) — o selo das rotinas acende na hora**
  Configuração → **Ligar rotinas automáticas**.
  **Esperado:** o selo vira verde "4 de 4" imediatamente (o cache de
  gatilhos é limpo pelo próprio botão).

- [ ] **T40 (B2) — links de apresentação sem duplicata**
  Configuração → cartão **Parâmetros**.
  **Esperado:** as chaves `APRESENTACAO_A/B/C` **não** aparecem ali — elas
  só existem no cartão "Apresentações da reunião", logo abaixo.
  **Antes:** apareciam nos dois, e editar num não atualizava o outro.

- [ ] **T41 (B2) — a dica do rodapé continua certa**
  No cartão Sistema, leia a última linha.
  **Esperado:** "…geração do mês seguinte no dia **20**" (ou o valor que
  você configurou), não em branco.

- [ ] **T42 (B4) — a janela de autorização mostra o erro**
  Se um envio falhar por permissão, a janela "Falta autorizar o envio de
  e-mail" aparece.
  **Esperado:** ela mostra **a mensagem de erro real** no topo, além do
  passo a passo.

- [ ] **T43 (B5) — botões com ícone não perdem o ícone**
  Clique em **📁 Abrir pasta das entregas** e em **📅 Remarcar data**.
  **Esperado:** depois da ação, o ícone continua lá.

- [ ] **T44 (B6) — a dica da aba está certa**
  Cadastre uma competência com aba errada de propósito e abra Assiduidade.
  **Esperado:** a mensagem sugere **FOLHA DE PONTO** (o padrão do sistema),
  não "CONVERTER DADOS".

- [ ] **T45 (M16/M17) — nada quebrou nas operações comuns**
  Cadastre uma pessoa nova, um setor, edite um parâmetro, cadastre um
  usuário em Acessos e mude uma permissão na matriz.
  **Esperado:** tudo salva e a tela reflete na hora.

- [ ] **T46 — restaurar níveis de acesso**
  Configuração → **Restaurar níveis de acesso**.
  **Esperado:** responde rápido e informa o escopo do Coordenador. Confira
  na planilha, aba PERFIS: **uma** linha por perfil, sem duplicata.

---

## Bloco 7 · Separação BI × Calendário (regra inviolável)

- [ ] **T47 — coordenador não vê dado individual**
  Entre com o e-mail de um **coordenador** (ou use a simulação de perfil).
  **Esperado:**
  - o menu mostra só **Central** e **Calendário**;
  - **não** existe módulo Assiduidade nem Apresentação nem Configuração;
  - na Central, o painel de insights **não aparece** (exige
    `VER_INDIVIDUAL`);
  - nenhum nome ou número individual de colaborador em lugar nenhum.

- [ ] **T48 — gerente/admin vê o individual**
  Entre como gerente ou admin.
  **Esperado:** Assiduidade → Colaborador lista nome, matrícula e
  assiduidade individual normalmente.

> Nada nesta separação foi alterado — os dois testes existem para
> confirmar que **continua** valendo depois das mudanças.

---

## Bloco 8 · Rotinas automáticas (rodar uma vez, no editor)

- [ ] **T49** Executar → `rotinaDiaria`.
      **Esperado:** termina sem erro; o digesto sai; o balde de LOG é
      esvaziado na aba LOG.
- [ ] **T50** Executar → `gerarMesSeNecessario`.
      **Esperado:** a partir do dia 20, cria o mês seguinte; antes disso,
      não faz nada. Rodar duas vezes **não** duplica atividade.
- [ ] **T51** Executar → `aquecerCache`.
      **Esperado:** devolve `{ok:true, prontas:N}` em horário útil.
- [ ] **T52** Executar → `testarEmail`.
      **Esperado:** o e-mail de teste chega e o registro mostra a cota
      restante.

---

## Bloco 9 · RODADA 2 — assiduidade com a folha real

> Estes vêm da conferência contra a sua `GSL-DADOS`. Os números da coluna
> "esperado" são os que a **sua planilha** produz para a competência
> **2026-08** — se o app mostrar outra coisa, é o app que está errado.

- [ ] **T53 (R1) — o DE-PARA subiu completo**
  Configuração → cartão DE-PARA.
  **Esperado:** 41 códigos. Confira alguns que estavam errados:
  `5` e `003` = **Ajuste de horas**; `6` = **Abono**; `16` = **Falta
  injustificada**; `18` = **Falta disciplinar**; `19` = **Folga**;
  `23` e `24` = **Licença legal / não conta como ausência**;
  `401` = Ajuste de horas / **não** conta.
  Confira que existem: `00`, `28`, `29`, `-`, `PP` e `SISTEMA INTRANET`.
  *Se o banco é antigo, o DE-PARA já tem linhas: veja T61.*

- [ ] **T54 (R2) — traço e anotação saem da base**
  Reimporte agosto/2026. Configuração → DE-PARA → **Códigos sem tradução**.
  **Esperado:** "nenhum código pendente".
  Depois, na planilha `GSL_BANCO`, aba FATO_ASSIDUIDADE: **não** deve
  existir nenhuma linha com CÓDIGO `-`, `PP` ou `SISTEMA INTRANET`.
  **Antes:** 173 células dessas entravam como lançamento e derrubavam a
  taxa de absenteísmo.

- [ ] **T55 (R3) — os cinco colaboradores voltaram**
  Assiduidade → aba Colaborador → procure por matrícula.
  **Esperado:** os cinco aparecem —
  `21000056` VALDY OLIVEIRA · `21000703` VINICIUS ALVES ·
  `21000665` WELLINGTON SILVA · `21000781` STEPHANIE DE JESUS ·
  `21000252` RENATO ROCHA.
  **Antes:** os cinco eram descartados da importação inteira, sem aviso.

- [ ] **T56 (R1–R4) — os KPIs batem com a sua planilha**
  Assiduidade → competência **2026-08** → aba Painel.
  **Esperado, exatamente:**

  | | |
  |---|---:|
  | Colaboradores | **341** |
  | Registros | **4.846** |
  | Absenteísmo | **4,4%** |
  | Faltas injustificadas | **21** |
  | Faltas justificadas (na legenda do cartão) | **7** |
  | Faltas disciplinares (na legenda do cartão) | **6** |
  | Atestados | **180** |

- [ ] **T57 (R4) — por turno, também exato**
  Mesmo painel, cartão "% de ausência por turno".
  **Esperado:** ADM **0,6%** (3 de 538) · A **5,2%** (83 de 1610) ·
  B **5,1%** (77 de 1519). O rótulo mostra pessoas e dias lançados.
  **Antes:** o denominador era trabalhados + ausências, então quem teve
  férias saía com percentual maior que o real.

- [ ] **T58 (R4) — assiduidade individual**
  Aba Colaborador, confira quatro:
  `21000018` MARVILIN 13 reg / 12 trab / 0 aus → **100%**;
  `21000024` ALBERTO 13/13/0 → **100%**;
  `21000053` WELLISON 15/14/1 → **93,3%**;
  `21000035` FABIO 29/11/0 → **100%** (18 dias de férias).

- [ ] **T59 (R6) — as três famílias de falta separadas**
  Assiduidade → Período → intervalo 21/07 a 20/08 → campo **Tipo**.
  **Esperado:** o seletor oferece *Falta injustificada*, *Falta
  justificada*, *Falta disciplinar*, *Atestado* e *Licença legal*.
  Consultando uma a uma: **21**, **7**, **6**, **180** e **0** registros
  — que somam os **214** de "Todas as ausências".

- [ ] **T60 (R7) — o aviso dos blocos de cabeçalho**
  Configuração → Arquivos do RH → **Pré-visualizar** a competência.
  **Esperado:** o aviso *"A folha tem 7 blocos de cabeçalho (um por
  turno). Todos com o mesmo layout, então a leitura é confiável."*
  Se algum mês trouxer blocos diferentes, o aviso muda de tom — e aí vale
  conferir o resultado antes de importar.

- [ ] **T61 (R1) — banco que já existe: trazer o DE-PARA novo**
  **Este é o teste mais importante do bloco, e o primeiro que você deve
  fazer** — o seu banco já tem o DE-PARA antigo, com os nove códigos
  errados, e a semente não reescreve o que já está lá (de propósito: as
  suas edições valem mais que a minha tabela).

  Configuração → cartão DE-PARA → **Restaurar tabela padrão** → confirme.
  Depois, no mesmo cartão, → **Reclassificar a base**.

  **Esperado:** o aviso diz quantos códigos foram corrigidos e quantos
  criados (num banco da versão anterior: ~14 corrigidos, 6 criados).
  Em seguida os números do T56 passam a bater.
  *Rodei exatamente esta sequência num banco montado como a versão
  anterior deixaria: antes, taxa 4,1% e 28 faltas injustificadas; depois,
  4,4% e 21 — os números da sua planilha.*

  **Restaurar não apaga nada** que você tenha acrescentado ao DE-PARA. Se
  você tinha editado algum código de propósito, ele volta ao padrão —
  confira a lista depois e reedite se precisar.

- [ ] **T62 (R5/R6) — as colunas novas do AGR_COLAB**
  Planilha `GSL_BANCO`, aba **AGR_COLAB**.
  **Esperado:** as colunas `FALTAS_INJ`, `FALTAS_JUST` e `FALTAS_DISC`
  existem (a migração cria sozinha) e estão preenchidas depois de
  reimportar. Confira que **NOME está na coluna de nome** e **TURNO na de
  turno** — a gravação passou a casar por nome de coluna, e este teste é
  o que prova que a mudança não embaralhou nada.

- [ ] **T63 (R4) — Ranking bate com Assiduidade**
  Assiduidade → Ranking → tabela por turno. Compare com o cartão
  "% de ausência por turno" da aba Painel.
  **Esperado:** as duas telas concordam.
  **Antes:** usavam denominadores diferentes.

---

## Bloco 10 · RODADA 2 — animações

- [ ] **T64 (R8) — a entrada não roda duas vezes**
  Abra o Calendário, espere assentar, e observe.
  **Esperado:** os cartões entram **uma vez**. Alguns segundos depois,
  quando o servidor confirma os dados, o conteúdo se atualiza no lugar,
  **sem deslizar de novo**.
  **Antes:** o conteúdo aparecia, assentava, e meio segundo depois
  deslizava outra vez do zero. Era este o "delay nas animações".

- [ ] **T65 (R8) — voltar para uma tela não reanima**
  Central → Calendário → Central.
  **Esperado:** a volta é seca, sem a entrada elástica.

- [ ] **T66 (R9) — o modo leve liga sozinho na máquina da empresa**
  Abra o app **no computador do CD** onde você sentiu a lentidão.
  **Esperado:** em 1 a 2 s o botão **⚡** no canto superior direito fica
  **amarelo** — o app mediu, viu que a máquina não estava dando conta dos
  quadros, e desligou o fundo animado sozinho.
  Num computador rápido ele fica **cinza** e as animações continuam.

- [ ] **T67 (R9) — o visual não muda**
  Com o ⚡ amarelo, confira: cores da marca, cartões de vidro, sombras,
  KPIs coloridos, layout — **tudo igual**. O que sai é o movimento do
  fundo e o desfoque.

- [ ] **T68 (R10) — o interruptor está ao alcance de todo mundo**
  Entre com um e-mail de **coordenador**.
  **Esperado:** o botão ⚡ aparece no topo (o coordenador não tem
  Configuração, e é justamente ele quem usa as máquinas mais fracas).
  Clique: alterna e o aviso confirma. Recarregue a página — **a escolha
  fica guardada** naquele computador.

- [ ] **T69 (R10) — e também na Configuração**
  Configuração → cartão Sistema.
  **Esperado:** o botão mostra "Modo leve: LIGADO" ou "desligado", com a
  explicação logo abaixo.

- [ ] **T70 (R13) — aba escondida congela o fundo**
  Deixe o app numa aba e vá trabalhar em outra por um minuto. Volte.
  **Esperado:** o fundo volta a se mover normalmente, sem solavanco.
  *(Para conferir de verdade: F12 → Performance monitor → o uso de CPU
  cai perto de zero com a aba escondida.)*

- [ ] **T71 (R11) — a lateral no tema escuro**
  Alterne para o tema escuro.
  **Esperado:** a lateral continua com o efeito de vidro fosco sobre o
  fundo estrelado. No tema claro ela é sólida — ali o desfoque foi
  removido porque não havia nada para ver através dele.

---

## Bloco 11 · RODADA 3 — acessos e login

> **Antes de tudo, T72.** A tabela de pessoas muda de formato nesta
> rodada e a migração roda sozinha na primeira abertura.

- [ ] **T72 (T2) — a migração de Equipe para Acessos**
  Suba os arquivos, abra o app e vá em **Pessoas e acessos**.
  **Esperado:** todo mundo que estava na antiga Equipe aparece aqui.
  Quem já tinha nível de acesso mantém o nível e ganha a função e o turno
  que estavam na Equipe. Quem só estava na Equipe (nunca teve nível)
  aparece como **pedido aguardando** — decida o nível de cada um.
  Confira na planilha `GSL_BANCO`: a aba **EQUIPE continua lá, intacta**.

- [ ] **T73 (T1) — uma tela só**
  **Esperado:** a Configuração **não tem mais** o cartão "Equipe", e não
  existe mais a tela "Acessos" separada com "Novo usuário". Tudo está em
  **Pessoas e acessos**, com as abas *Pessoas* e *Níveis de acesso*.
  Na sua tela antiga, o Gerente aparecia na Equipe com acesso
  COORDENADOR — confira que agora há **um registro só** por pessoa.

- [ ] **T74 (T3) — pedir acesso**
  Abra o app numa janela anônima e informe um e-mail que não existe.
  **Esperado:** aparece o formulário **Pedir acesso** (nome, e-mail,
  função, turno, observação). Envie.
  **Antes:** a pessoa era cadastrada em silêncio e caía numa tela de
  espera sem ter pedido nada.

- [ ] **T75 (T3) — a gerência é avisada**
  **Esperado:** chega um e-mail para quem tem nível ADMIN ou GERENTE, com
  nome, e-mail, função e turno do pedido.

- [ ] **T76 (T3) — autorizar**
  Em **Pessoas e acessos**, o pedido aparece no topo, em destaque.
  Escolha o nível e o turno **no próprio card** e clique em **Aprovar**.
  **Esperado:** a pessoa sai dos pedidos e entra na lista como ativa, e
  recebe um e-mail avisando que já pode entrar. Ela entra na hora, sem
  senha, com o mesmo e-mail.

- [ ] **T77 (T3) — recusar**
  Peça acesso com outro e-mail e clique em **Recusar**, com motivo.
  **Esperado:** a pessoa fica no cadastro como *recusado*, sem acesso, e
  recebe o e-mail com o motivo. Se ela pedir de novo, o pedido reabre.

- [ ] **T78 (T3) — cadastrar direto**
  **Cadastrar pessoa** → preencha e salve.
  **Esperado:** ela entra **sem precisar pedir** — é o atalho para quem
  você já conhece — e recebe o e-mail de acesso liberado.

- [ ] **T79 (T4) — os avisos da gestão saem**
  Configuração → Sistema → **Enviar digesto agora**.
  **Esperado:** quem tem nível ADMIN ou GERENTE recebe.
  **Antes:** dependia da palavra "GERENTE" estar escrita no campo de
  função; escrito de outro jeito, ninguém recebia.

- [ ] **T80 (T5) — o nome no rodapé**
  **Esperado:** o canto inferior esquerdo mostra **o nome**, e abaixo a
  função e o nível. **Antes:** mostrava `hercullito123`.
  Se ainda aparecer um pedaço de e-mail, é cadastro sem nome: edite a
  pessoa em Pessoas e acessos.

- [ ] **T81 (T17) — voltar da simulação**
  Só se você usar a simulação de perfil. **Esperado:** o botão "Voltar ao
  meu perfil" funciona (antes chamava uma função inexistente).

---

## Bloco 12 · RODADA 3 — assiduidade

- [ ] **T82 (T6) — a aba Colaboradores carrega**
  Assiduidade → **Colaboradores**.
  **Esperado:** carrega a lista individual, com busca por nome ou
  matrícula, mais os quadros de ranking.
  **Antes:** clicar na aba não fazia nada — o painel continuava na tela.
  A causa: o painel era gravado numa célula só e passava de 96 mil
  caracteres, contra o limite de 50 mil do Google Sheets.

- [ ] **T83 (T7) — a tela de Ranking sumiu**
  **Esperado:** o menu do módulo Assiduidade tem **só Assiduidade**. Os
  quadros de ranking estão dentro da aba Colaboradores.

- [ ] **T84 (T8) — a aba Análise sumiu**
  **Esperado:** as abas são **Painel · Colaboradores · Período**, só.
  No Painel, o gráfico **Absenteísmo mês a mês** mostra todas as
  competências importadas.
  *Ao subir, apague o arquivo `BI.gs` do projeto — ele não é mais usado.*

- [ ] **T85 (T13) — o 6.1 é férias**
  Painel → **Códigos mais lançados**.
  **Esperado:** o `6.1` aparece com descrição **Férias** e categoria
  **Férias**. No cartão *Dias por categoria*, "Férias" tem 365 dias.
  **Antes:** o 6.1 aparecia como "A CONFIRMAR", 350 vezes.

- [ ] **T86 (T12) — código fora da legenda**
  **Esperado:** **não existe mais** a barra "A CONFIRMAR" no gráfico de
  categorias. Se sobrou algum código sem tradução, aparece uma **faixa de
  aviso** no topo com os códigos e um atalho para cadastrá-los.
  *Se ainda vir "A CONFIRMAR", falta rodar o T61 (Restaurar tabela padrão
  + Reclassificar).*

- [ ] **T87 (T10/T11) — o Período conta certo e filtra por turno**
  Assiduidade → **Período** → "Este mês" → Tipo: *Falta injustificada*.
  **Esperado:** vem lista e números. Depois escolha um **Turno** e
  confira que o total cai.
  **Antes:** a consulta devolvia **0 registros** para qualquer intervalo,
  e não havia filtro de turno.

- [ ] **T88 (T9) — sem quebra entre competências**
  Cadastre uma segunda competência do RH e importe. No Período, escolha
  um intervalo que **atravesse as duas**.
  **Esperado:** a linha do tempo é contínua (uma coluna por dia, sem
  buraco na virada) e aparece o cartão **Por competência** mostrando de
  quantas planilhas veio o número.

- [ ] **T89 (T9) — a ficha atravessa os meses**
  Clique num colaborador.
  **Esperado:** o histórico traz uma linha por competência importada, não
  só a do mês aberto.

- [ ] **T90 (T14) — atualização diária**
  Configuração → Sistema → **Ligar rotinas automáticas** (é preciso
  religar: entrou um gatilho novo).
  **Esperado:** o selo mostra **5 de 5**. Confira em Configuração →
  Fontes do RH que a competência **Aberta** é a que será relida às 10h.
  Teste na hora com **↻ Atualizar agora**: a última leitura muda.

- [ ] **T91 (T14) — só a Aberta é relida**
  Marque uma competência antiga como **Fechada** e use Atualizar agora.
  **Esperado:** o aviso cita só a competência aberta.

---

## Bloco 13 · RODADA 3 — configuração e acabamento

- [ ] **T92 (T15) — a Configuração organizada**
  **Esperado:** quatro abas — *Fontes do RH*, *Calendário*,
  *Apresentação*, *Sistema* — e cada assunto na sua. Os parâmetros
  aparecem junto do assunto a que pertencem, não numa lista solta.

- [ ] **T93 (T16) — acentuação**
  **Esperado:** o menu diz **Calendário**, **Apresentação**,
  **Configuração**; as abas dizem **Período**, **Níveis de acesso**; os
  títulos dizem **% de ausência**, **Códigos mais lançados**.

- [ ] **T94 (T18) — o botão Voltar aparece**
  Na tela de pedir acesso.
  **Esperado:** "Voltar" está visível (azul, sublinhado). Antes era texto
  branco sobre fundo claro.

- [ ] **T95 — nada quebrou no calendário**
  Abra o Calendário, entregue, valide, remarque e cancele uma atividade.
  **Esperado:** tudo como antes — o coordenador do turno continua sendo
  identificado (agora a partir do cadastro único) e os e-mails saem com
  os dados certos.

---

## Apêndice A · Teste de fumaça de 5 minutos

Se você tiver pouco tempo, estes seis provam que o essencial está de pé.
São os que cobrem os defeitos mais graves e os que mais mexem no código.

1. **T0.2** — o `appsscript.json` está sem `oauthScopes`.
2. **T16** — Assiduidade → Colaborador: os dias trabalhados **não** são
   zero e a assiduidade não é 0%. *(É o defeito do acento. Se este passar,
   o BI inteiro voltou.)*
3. **T11** — aprovar uma atividade e cronometrar. *(É a lentidão.)*
4. **T6** — nenhum vermelho nas pílulas de status, nos dois temas.
5. **T27** — reimportar a folha do RH sem estourar o tempo.
6. **T30** — aprovar e reprovar continuam mandando e-mail com os dados
   certos. *(É a mudança mais delicada do lote: o e-mail passou a ser
   montado em memória.)*

7. **T56** — os KPIs de agosto/2026 batem com a sua GSL-DADOS:
   341 colaboradores, 4.846 registros, 4,4%, 21 faltas injustificadas,
   180 atestados. *(É a prova de que o ETL entende a folha.)*
8. **T64** — os cartões entram **uma vez** só. *(É o "delay".)*
9. **T66** — no computador do CD, o ⚡ fica amarelo sozinho.

10. **T72** — em Pessoas e acessos, todo mundo da antiga Equipe está lá.
11. **T82** — a aba Colaboradores carrega.
12. **T87** — o Período devolve números (não mais zero).
13. **T85** — o 6.1 aparece como Férias.

Se os treze passarem, pode usar. Os outros 82 são para fechar as pontas.

---

## Apêndice B · Verificações automáticas (opcional, fora do Apps Script)

São as três que o próprio `ESTADO-DO-PROJETO.md` documenta, mais uma
minha. Rodam em qualquer máquina com Node instalado, dentro da pasta
`02_CORRIGIDO/`. Não precisam do Google.

**1 · Sintaxe de cada `.gs`** — pega erro de digitação antes de colar no
editor:

```bash
for f in *.gs; do cp "$f" /tmp/x.js && node --check /tmp/x.js || echo "ERRO em $f"; done
```
*Esperado: nenhuma linha de erro.*

**2 · Identificadores duplicados entre arquivos** — no Apps Script todos os
`.gs` dividem o mesmo escopo global; dois `const TURNOS` derrubam o projeto
inteiro:

```bash
grep -hoE "^(function [A-Za-z_$][A-Za-z0-9_$]*|(const|let|var) [A-Za-z_$][A-Za-z0-9_$]*)" *.gs   | sed -E 's/^(function|const|let|var) //' | sort | uniq -d
```
*Esperado: nenhuma saída.*

**3 · O `App.html` compila** — pega "X is not defined", que causa tela
branca total:

```bash
node -e "
const fs=require('fs'),vm=require('vm');
const s=fs.readFileSync('App.html','utf8').replace(/^<script>/,'').replace(/<\/script>\s*\$/,'');
new vm.Script(s); console.log('App.html ok');
"
```

**4 · Nenhum vermelho sobrou** — a regra inviolável, verificada por busca:

```bash
grep -rniE "#(D71920|DC2626|EF4444|991B1B|9A1218|FCE9EA|FDE8E8|F44336|FF0000)" *.gs *.html   | grep -v "^Emails.gs:1[0-9]:" 
```
*Esperado: nenhuma saída. (A exclusão ignora o comentário do `Emails.gs`
que registra qual era a cor antiga.)*

---

## Se algo falhar

1. Anote o **ID do teste** (T##) e o **ID da correção** entre parênteses.
2. O `CHANGELOG.md` tem o mesmo ID, com o arquivo, o que mudou e por quê.
3. O `01_ORIGINAL/` está intacto: dá para comparar arquivo a arquivo com
   um `diff` para ver exatamente o que aquela mudança tocou.
