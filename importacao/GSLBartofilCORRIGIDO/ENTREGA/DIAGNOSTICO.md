# DIAGNÓSTICO — GSL Bartofil

Leitura completa dos 21 arquivos do projeto "GSL TESTE" (8.906 linhas).
Base: cópia intacta em `01_ORIGINAL/`. Todo o trabalho vai em `02_CORRIGIDO/`.

Classificação: **CRÍTICO** = dado errado na tela, função que não roda ou
regra inviolável quebrada · **MÉDIO** = lentidão sentida ou comportamento
inconsistente · **BAIXO** = código morto, duplicado ou cosmético.

Índice rápido:

| # | Item | Arquivo | Classe |
|---|---|---|---|
| 1 | Categorias com/sem acento não batem → BI inteiro zerado | Instalacao.gs / Dados.gs | CRÍTICO |
| 2 | Filtro de período aponta para categorias inexistentes | Dados.gs / App.html | CRÍTICO |
| 3 | `BI_FALTAS` idem — custo e reincidência sempre zero | BI.gs | CRÍTICO |
| 4 | Cruzamento lê STATUS cru → não bate com o Calendário | BI.gs | CRÍTICO |
| 5 | `oauthScopes` no manifesto (quebra o envio de e-mail) | appsscript.json | CRÍTICO |
| 6 | Coluna ANEXOS com dois formatos incompatíveis | Arquivos.gs / Entrega.gs | CRÍTICO |
| 7 | Cada clique dispara a rebusca de TODAS as telas | App.html | CRÍTICO |
| 8 | Login enfileira 7 chamadas antes de liberar o clique | App.html | CRÍTICO |
| 9 | Escritas em laço (cancelar mês, importar, sementes) | Calendario/Dados/Instalacao | CRÍTICO |
| 10 | Toda gravação invalida o cache de tudo | Banco.gs | CRÍTICO |
| 11 | Vermelho na interface e nos e-mails | Estilo.html / Emails.gs | CRÍTICO |
| 12 | `diagnostico()` chama `carregarTela` com assinatura antiga | Codigo.gs | CRÍTICO |
| 13–32 | ver seção MÉDIO | vários | MÉDIO |
| 33–44 | ver seção BAIXO | vários | BAIXO |

---

## 1 · FUNÇÕES QUEBRADAS OU NUNCA CHAMADAS

### CRÍTICO

**1.1 · `calcularAgregado_()` nunca conta dia trabalhado** — `Dados.gs:487`
`semearDePara()` (Instalacao.gs:310) grava as categorias **sem acento**:
`Presenca`, `Ferias`, `Licenca legal`. `calcularAgregado_()` compara **com
acento**: `cat === 'Presença'`, `'Férias'`, `'Licença legal'`.
Nenhuma dessas três comparações jamais é verdadeira.
Consequência em cadeia: `TRABALHADOS` fica 0 para todo colaborador →
`base = trab + aus` vira só as ausências → **assiduidade de todo mundo é
0%**, `% de ausência por turno` vira 100%, o ranking dos "melhores" é lixo
e as colunas FERIAS/FOLGAS/LICENCAS de `AGR_COLAB` ficam zeradas.
É o defeito de maior impacto do sistema: o BI inteiro mostra número errado
e ninguém percebe porque a tela carrega normalmente.

**1.2 · Filtro por tipo do Período nunca devolve nada** — `Dados.gs:244`
O mapa traduz `FALTA_INJUST → 'Falta injustificada'`, `LICENCA → 'Licença
legal'`. Nenhuma dessas strings existe no DE-PARA (que só tem `Falta`,
`Atestado`, `Licenca legal` sem cedilha). Qualquer filtro diferente de
"Todas as ausências" devolve lista vazia. O select em `App.html:1180`
oferece cinco opções, quatro delas mortas.

**1.3 · `BI_FALTAS` — mesmo defeito** — `BI.gs:19`
`['Falta injustificada','Falta justificada','Falta disciplinar']`.
`biCusto().diasFalta` e `biReincidencia().injustificadas` são sempre 0.

**1.4 · `acaoDetalhesAtividade` e `removerAnexo` são inalcançáveis**
`carregarAnexos()` (App.html:769) é a única chamadora e **nunca é
chamada**; o elemento `#lista-anexos` que ela procura não existe mais na
janela de atividade. Junto com ela morreu `baixar()` e a ação
`removerAnexo` do catálogo.

**1.5 · Ações catalogadas sem nenhuma interface** — `Codigo.gs:89–92`
`salvarDePara`, `excluirDePara`, `codigosPendentes`, `reclassificar` e
`excluirRotina` existem no servidor, têm permissão declarada e não têm um
único botão. Sem elas, o DE-PARA — que é a origem do defeito 1.1 — não
pode ser corrigido pela tela, só editando a planilha na mão.

**1.6 · `diagnostico()` quebra ao rodar** — `Codigo.gs:428`
Chama `carregarTela(t.id, {})`. A assinatura virou
`carregarTela(email, idTela, params)`, então `t.id` entra como e-mail e
`{}` como id de tela → `Tela desconhecida: [object Object]`.
A função de medição do próprio projeto não roda.

**1.7 · `acaoValidar` pode estourar** — `Calendario.gs:610`
`obter('ATIVIDADES', params.id).PRAZO` sem checar nulo — chamado **duas
vezes** na mesma expressão, e mais duas na versão com validação. ID
inexistente vira `TypeError` em vez de mensagem.

### MÉDIO

**1.8 · `garantirCompetencia()` órfã** — `Calendario.gs:250`.
A lógica foi copiada para dentro de `dadosCalendario`. Duas cópias da
mesma regra, uma delas nunca executada.

**1.9 · `rhPeriodo(d)` órfã** — `App.html:1053`. `pintarAbaRH` usa
`rhPeriodoTela`. Sobrou da versão anterior da aba.

**1.10 · `lerPlanilhaExterna()` / `abasDaPlanilhaExterna()` órfãs** —
`Banco.gs:386`. Substituídas por `abrirFolha_()` no Dados.gs.

**1.11 · `restaurarMeuAcesso()`** — `Instalacao.gs:425`. Órfã de propósito
(socorro para rodar no editor). Documentada, mantida.

**1.12 · `janelaAutorizarEmail(msg)`** — `App.html:352` passa argumento
que a função (linha 439) não declara nem usa.

---

## 2 · GARGALOS DE PERFORMANCE — do pior para o menor

O custo real no Apps Script não é o cálculo: é **cada chamada a serviço
do Google** (abrir planilha, ler faixa, escrever, ler propriedade, tocar o
Drive) e **cada ida e volta do `google.script.run`** (1 a 3 s fixos,
independente do tamanho da resposta). A lista abaixo está ordenada por
essas duas moedas.

**2.1 · CRÍTICO — cada clique rebusca todas as telas** — `App.html:341`
`agir()` termina com `setTimeout(() => { esquecerTelas();
prebuscar(todas as outras telas) }, 1200)`. `esquecerTelas()` apaga o
cache inteiro do cliente — inclusive a tela que acabou de ser desenhada —
e a prebusca refaz **uma chamada por tela** (6 para o admin).
Impacto: aprovar UMA atividade = 1 chamada da ação + 1 da tela atual + 6
da prebusca = **8 idas ao servidor, ~12 a 20 s de fila**. Como o Apps
Script serializa as chamadas do mesmo usuário, o próximo clique da pessoa
entra **atrás dessas seis**. É a causa principal de "o app está lento".

**2.2 · CRÍTICO — o login prende a fila** — `App.html:113 / 268`
`prebuscar(r.telas)` dispara logo depois de entrar: 7 chamadas
sequenciais. Nos primeiros ~15 s depois do login, qualquer clique fica
enfileirado atrás delas. A tela abre rápido e trava em seguida — o pior
padrão possível de percepção.

**2.3 · CRÍTICO — escritas linha a linha** — três lugares
| Onde | Laço | Chamadas de serviço |
|---|---|---|
| `acaoCancelarCompetencia` (Calendario.gs:340) | 1 `atualizar()` por atividade | ~30 × (lock + ler cabeçalho + ler linha + escrever + bump de geração + log) ≈ **180** |
| `acaoImportarCompetencia` (Dados.gs:421) | 1 `inserir`/`atualizar` por colaborador | 200 colaboradores ≈ **1.200** |
| `semearDePara/Parametros/Rotinas/Setores/Perfis` (Instalacao.gs) | 68 `inserir()` | ≈ **400** |
A importação com 200 pessoas é candidata direta a estourar o limite de
6 minutos de execução.

**2.4 · CRÍTICO — toda gravação aposenta o cache inteiro** — `Banco.gs:474`
O comentário no arquivo diz que a geração "só avança quando a gravação
mexe em algo que as telas mostram". O código avança para **qualquer
tabela exceto LOG**. Como a geração entra na chave de todas as tabelas
(`tb|<geração>|<tabela>`) e de todas as telas (`t|<geração>|…`), salvar um
setor joga fora o cache de ATIVIDADES, FATO_ASSIDUIDADE, AGR_COLAB,
PERFIS e das 7 telas. A próxima abertura relê tudo da planilha.
Ainda: `avancarGeracao()` grava em `ScriptProperties` a cada escrita —
mais uma chamada de serviço por gravação.

**2.5 · ALTO — `Utilities.formatDate` em laço**
`hidratar()` chama `formatarData`, `paraISO`, `diaNum(hoje())` e
`statusDe` (que chama `diaNum(hoje())` de novo) **por linha**. Cada um
desses passa por `fuso()` e por um `Utilities.formatDate`.
`gerarInsights()` refaz `diaNum(paraData(a.prazoISO))` dentro de ~10
filtros sobre a mesma lista.
Com 200 atividades: **≈ 1.000 formatDate por abertura da Central**, sendo
que "hoje" é o mesmo valor o tempo todo.

**2.6 · ALTO — camadas de fundo do tema inativo continuam animando** —
`Estilo.html:255–320`
As camadas do tema escuro (12 partículas, 2 camadas de estrelas com
`drop-shadow`, 3 nebulosas com `filter: blur(80px)` e `will-change`)
ficam em `opacity: 0` no tema claro — mas **a animação continua rodando**.
O navegador mantém a textura de GPU da nebulosa de 700 px desfocada e
compõe ~20 camadas por quadro, metade delas invisíveis. Em máquina fraca
é o que rouba os quadros da interface.

**2.7 · ALTO — releitura completa depois de cada escrita**
`acaoValidar`, `acaoEntregar`, `acaoAgendarTreinamento`, `acaoDefinirSetor`,
`acaoCancelarAtividade` e `acaoCriarAtividade` fazem
`atualizar(...)` e logo depois `hidratar(obter('ATIVIDADES', id))`.
`atualizar` → `limparCache` → `esquecerLeituras()`, então esse `obter`
relê a aba ATIVIDADES inteira só para montar um e-mail.
**+1 leitura completa da tabela por ação.**

**2.8 · MÉDIO — a tela de Calendário hidrata a tabela duas vezes**
`dadosCalendario` monta `todas` (mês filtrado, hidratado) e depois chama
`atividadesCanceladas()`, que faz `listar('ATIVIDADES').map(hidratar)` —
hidrata **todos os meses de novo** para ficar com as canceladas de um só.

**2.9 · MÉDIO — `listar(tabela, true)` nunca é cacheável**
`gerarCompetencia`, `acaoGerarMes`, `acaoCriarAtividade` e
`garantirCompetencia` usam `incluirExcluidos = true`, que desliga o cache
entre execuções: leitura crua da planilha toda vez.

**2.10 · MÉDIO — `estadoInstalacao()` toca o ScriptApp sempre**
`ScriptApp.getProjectTriggers()` roda no bootstrap, no `dadosConfig` **e**
no `dadosAcessos`. Informação que muda uma vez por mês, buscada em toda
abertura.

**2.11 · MÉDIO — `fuso()` sem memória**
Se `TZ_OK` ainda não foi gravado, cada chamada faz
`SpreadsheetApp.openById(...)` — e `fuso()` é chamado por linha de dado.

**2.12 · MÉDIO — `substituirLote_` reabre o banco** — `Dados.gs:583`
`SpreadsheetApp.openById(PropertiesService.getScriptProperties()
.getProperty('ID_BANCO'))` em vez de reaproveitar `abrirBanco()`.
2 chamadas extras por lote, 4 por importação. Também fura a regra de
arquitetura "só o Banco.gs conhece SpreadsheetApp".

**2.13 · MÉDIO — `registrarLog` abre a aba LOG duas vezes**
`abaDe('LOG').getRange(abaDe('LOG').getLastRow() + 1, …)` — `Banco.gs:358`.

**2.14 · MÉDIO — `autocadastrar` limpa o cache duas vezes**
`inserir()` já chama `limparCache('ACESSOS')`; a função chama de novo →
duas trocas de geração seguidas (`Auth.gs:257`).

**2.15 · BAIXO — `hidratar` monta o coordenador duas vezes por linha**
`coordenadorDaLinha(r).nome` e `coordenadorDaLinha(r).email` —
`Calendario.gs:428`.

**2.16 · BAIXO — `montarGrade` formata 42 datas por mês** com
`paraISO()` (um `formatDate` cada) para montar a grade do calendário.

**2.17 · BAIXO — `excluir()` faz duas escritas de célula** separadas
(`EXCLUIDO` e `ATUALIZADO_POR`) — `Banco.gs:316`.

**2.18 · BAIXO — `urlPastaAnexos()`** toca o Drive em toda abertura da
Configuração para devolver uma URL que nunca muda.

**2.19 · Observação — gatilho `aquecerCache` a cada 15 min**
96 execuções por dia, cada uma montando todas as telas do admin. É
intencional e ajuda o primeiro acesso, mas consome cota. Mantido; anotado
em PENDENCIAS.md para o dono decidir o intervalo.

---

## 3 · ERROS DE LÓGICA — dados que não batem entre telas

**3.1 · CRÍTICO — assiduidade não bate com nada** (mesma raiz do 1.1).
`AGR_COLAB.TRABALHADOS = 0` → a tela de Assiduidade mostra taxa de turno
calculada sobre `trab + aus`, que vira só `aus` → 100%. O Ranking usa
`ASSIDUIDADE` da mesma tabela → todo mundo com 0%. A aba Análise usa
`biTendencia(agr)` sobre os mesmos campos → série toda em 100%.
Três telas, três números errados, todos com a mesma origem.

**3.2 · CRÍTICO — "Atrasadas" do cruzamento ≠ "Atrasadas" do Calendário**
`biCruzamento()` (BI.gs:326) lê `a.STATUS === 'Atrasada'` **da coluna**.
O projeto inteiro trata status como valor **derivado** (`statusDe()`):
a coluna só recebe valor em algumas gravações e nunca é atualizada quando
o prazo vence sozinho. Resultado: a aba Análise mostra 0 atrasadas
enquanto o Calendário mostra 12.

**3.3 · CRÍTICO — anexo entregue não abre**
`anexarArquivo()` grava **IDs do Drive** separados por vírgula em ANEXOS.
`acaoFinalizarEntrega()` grava **uma URL** na mesma coluna.
`hidratar()` conta `idsDeAnexos(r.ANEXOS).length` → uma URL vira
"1 anexo"; `listarAnexos()` faz `getFileById(<url>)` → devolve
"(arquivo removido do Drive)" para uma entrega que está lá.

**3.4 · MÉDIO — competência do RH comparada crua**
`dadosAssiduidade` compara `p.COMPETENCIA === comp` sem passar por
`normalizarCompetenciaRH_()`, que existe justamente porque a célula
`2026-08` pode ter virado `Date`. Se virou, a tela diz "sem dados" com o
painel gravado ali do lado.

**3.5 · MÉDIO — filtros de período com fronteiras diferentes**
`acaoPeriodo` monta `new Date(de + 'T00:00:00')` no fuso do runtime,
enquanto `FATO_ASSIDUIDADE.DATA` é texto `aaaa-mm-dd` comparado via
`new Date(f.DATA + 'T12:00:00')`. O meio-dia salva do erro de fuso, mas
as duas datas nascem de regras diferentes — comparação de texto seria
exata e mais barata.

**3.6 · MÉDIO — a entrega grava e depois falha**
`enviar()` passou a **lançar** exceção quando o e-mail não sai (mudança
deliberada, comentada em `Emails.gs:253`). `acaoEntregar` chama
`avisarEntregaRecebida()` **sem try/catch**: a atividade já foi carimbada
como entregue, mas a pessoa recebe erro e reenvia. `acaoFinalizarEntrega`
já protege esse mesmo trecho — as duas rotas de entrega se comportam
diferente.

**3.7 · MÉDIO — `dentroDoEscopo()` sempre devolve `true`**
Desligado de propósito (documentado no LEIA-ME), mas `acaoDiagnosticoAcesso`
continua explicando ao usuário por que o escopo TURNO estaria escondendo
atividades — diagnóstico que descreve uma regra que não está mais ligada.

**3.8 · MÉDIO — tema abre escuro contra o pedido**
`iniciar()` aplica `prefers-color-scheme` do aparelho antes de o servidor
responder. Em celular no modo escuro, o app abre escuro.

**3.9 · BAIXO — parâmetros de apresentação aparecem duas vezes**
`dadosConfig` devolve `apresentacoes` **e** as mesmas chaves dentro de
`parametros`; a tela desenha os dois cartões. Editar num não atualiza o
outro até recarregar.

**3.10 · BAIXO — mensagem de erro contradiz o padrão**
A tela de Assiduidade sugere a aba `CONVERTER DADOS`; o LEIA-ME, o
parâmetro padrão e o formulário dizem `FOLHA DE PONTO`.

**3.11 · BAIXO — `descreverEscopo(usuario)` ignora o argumento** e devolve
sempre "Todos os turnos" (coerente com 3.7, mas a assinatura engana).

---

## 4 · CÓDIGO DUPLICADO OU MORTO

**4.1** `garantirCompetencia()` × o trecho inline em `dadosCalendario` —
mesma regra escrita duas vezes (uma morta). *MÉDIO*
**4.2** `carregarAnexos()`, `baixar()`, `rhPeriodo()` — clientes órfãos. *MÉDIO*
**4.3** `lerPlanilhaExterna()`, `abasDaPlanilhaExterna()` — servidor órfão. *BAIXO*
**4.4** `dentroDoEscopo()` guarda o corpo antigo comentado logo abaixo do
`return true`. Intencional e documentado — **mantido**. *BAIXO*
**4.5** `--vermelho: var(--alerta)` — alias de compatibilidade sobre um
token que a marca proíbe. *BAIXO*
**4.6** `Index.html:37` — `</div>` sobrando, fechando um elemento que já
tinha sido fechado. *BAIXO*
**4.7** `MESES_EXT`, `PERFIL_MINIMO`, `TAMANHO_MAXIMO_MB` e `ESCOPOS` são
declarados e usados em um lugar só ou nenhum — mantidos por serem
referência de domínio. *BAIXO*
**4.8** `listar()` devolve `[]` sem memoizar quando a tabela está vazia:
toda chamada seguinte relê a aba. *BAIXO*
**4.9** `_equipeMemo` nunca é zerado dentro da execução — se a EQUIPE for
gravada e relida na mesma requisição, o mapa velho continua valendo. *BAIXO*

---

## 5 · REGRAS INVIOLÁVEIS — estado encontrado

| Regra | Estado no original | Ação |
|---|---|---|
| Sem `oauthScopes` no manifesto | **violada** — os 7 escopos estão lá | removidos |
| Sem vermelho na marca | **violada** — `--alerta: #D71920`, `#DC2626`, `#991B1B`, `COR_ALERTA` nos e-mails | trocados por âmbar de marca |
| Tema claro | parcial — o app segue o aparelho e pode abrir escuro | claro vira o padrão |
| BI individual × Calendário agregado | **respeitada** — `dadosInicio` só emite insight agregado e exige `VER_INDIVIDUAL`; nome individual só sai por `VER_INDIVIDUAL` nas telas do módulo Assiduidade | preservada, sem mexer |

---
---

# RODADA 2 — com a planilha-fonte e a GSL-DADOS em mãos

Com o `CONTROLE DE PONTO CD AGOSTO 2026` (a folha do RH) e a `GSL-DADOS`
(o BI em produção, já validado) deu para parar de supor. Rodei o ETL do
app contra a folha real e comparei linha a linha com os números que a sua
planilha produz. **Oito achados novos, seis deles CRÍTICOS** — e todos
explicam a "dificuldade de interpretar" que você relatou.

O que a folha realmente é, e que o código não sabia:

| Fato | Consequência |
|---|---|
| Cabeçalho na **linha 16**, repetido em **7 blocos** (linhas 16, 69, 182, 305, 366, 385, 403) — um por turno | lido só o primeiro; funcionava por sorte, os 7 usam o mesmo layout |
| Dia trabalhado = **sigla do turno** (ADM, A, B, C, J, BC) | já estava certo |
| 31 colunas de data, de 21/07 a 20/08 — a competência **cruza dois meses** | ok |
| **357 matrículas**, 341 com lançamento no período | o app achava 352 |
| Códigos aparecem como número (`7.0`, `6.1`), texto (`003`) e **não-códigos** (`-`, `PP`, `SISTEMA INTRANET`) | 173 células entravam na base como lançamento |
| Anotações soltas em colunas bem à direita da grade (`QUNT TUR ADM`) | derrubavam colaboradores inteiros |

---

## R1 · CRÍTICO — o DE-PARA embutido errava em 9 códigos e faltavam 3

A tabela que eu havia semeado era uma aproximação minha da legenda. A sua
`GSL-DADOS` tem a versão certa, e elas divergem em pontos que mudam o
número:

| Código | O que o app dizia | O que é |
|---|---|---|
| 5, 26, 401, 003 | Compensação | **Ajuste de horas** |
| 6 | Licença legal | **Abono** |
| 16 | Falta | **Falta injustificada** |
| 18 | Falta | **Falta disciplinar** |
| 19 | Compensação | **Folga** |
| 23 e 24 | Atestado / conta como ausência | **Licença legal / não conta** |
| 401 | contava como ausência | **não conta** |
| **00, 28, 29** | não existiam | Licença s/ venc., Falta com justificativa, Cáceres s/ venc. |

O 401 e o 23/24 contando como ausência inflavam o absenteísmo; o 28
(falta com justificativa) simplesmente não era reconhecido e caía em
"A CONFIRMAR".

## R2 · CRÍTICO — `IGNORAR` ≠ `Ignorar`

O ETL descarta a célula quando a categoria é `IGNORAR`, comparando com a
string **em caixa alta**. O DE-PARA guarda a categoria como a pessoa
escreve — `Ignorar`. A comparação nunca era verdadeira.

Efeito medido na folha de agosto: **173 células** de traço (`-`, 133×),
marcação interna do RH (`PP`, 25×) e anotação em texto
(`SISTEMA INTRANET`, 15×) entravam na base como lançamento válido.
Como a taxa de absenteísmo é `ausências ÷ lançamentos`, o denominador
inflava e a taxa saía menor que a real. É o mesmo defeito de caixa/acento
da rodada 1, num terceiro lugar.

## R3 · CRÍTICO — cinco colaboradores sumiam do sistema, sem aviso

Duas causas somadas:

1. o parâmetro `RH_CORTAR_LINHAS` vinha `HORAS TRABALHADAS,TOTAL,QUNT`.
   A sua CONFIG usa **só** `HORAS TRABALHADAS`;
2. o teste era feito sobre a **linha inteira** convertida em texto —
   incluindo as colunas 37 e 39, bem à direita da grade, onde o RH
   escreve anotações como `QUNT TUR ADM`, `QUNT TURNO C`, `QUNT TURN B`.

Resultado: **VALDY OLIVEIRA (21000056), VINICIUS ALVES (21000703),
WELLINGTON SILVA (21000665), STEPHANIE DE JESUS (21000781) e RENATO ROCHA
(21000252)** eram descartados da importação inteira. Não apareciam em
nenhuma tela, em nenhum ranking, em nenhuma contagem — e nada indicava
que faltavam. A sua GSL-DADOS tem os cinco.

## R4 · CRÍTICO — três denominadores diferentes para a mesma ideia

A sua planilha define, e a legenda do painel diz com todas as letras:

- **taxa** = ausências ÷ **dias lançados**
- **% do turno** = ausências do turno ÷ **registros do turno**
- **assiduidade** = (registros − ausências) ÷ **registros**

O app usava `trabalhados + ausências` como denominador em dois desses
três lugares. Quem teve férias, folga ou licença no mês saía com
denominador menor que o real — assiduidade inflada — e a porcentagem do
turno no Ranking não batia com a mesma porcentagem na tela de
Assiduidade. Conferindo com o seu ADM: `3 ÷ 538 = 0,56%` (planilha)
contra `3 ÷ 476 = 0,63%` (app).

## R5 · CRÍTICO — o AGR_COLAB era montado por posição

`substituirLote_` recebia uma lista de arrays e uma função que repetia o
cabeçalho na mão (`[uuid, c[0], c[1], ... c[12], '', ...]`). Acrescentar
uma coluna ao esquema faria **todos os valores deslizarem de coluna em
silêncio** — nome no lugar de turno, ausências no lugar de faltas. É uma
armadilha armada esperando a próxima alteração.

## R6 · MÉDIO — as três famílias de falta viravam um balde só

O seu DE-PARA diz, escrito: *"FALTA INJUSTIFICADA (16), FALTA JUSTIFICADA
(28), FALTA DISCIPLINAR (18) e ATESTADO (1, 21, 130) são categorias
separadas de propósito: no painel elas nunca se somam num balde só."*
O app somava tudo em `FALTAS`. Faltar sem avisar, faltar com
justificativa aceita e cumprir suspensão são três coisas diferentes, e a
gestão trata cada uma de um jeito.

## R7 · MÉDIO — nada conferia os 7 blocos de cabeçalho

A leitura usa as colunas do primeiro bloco para a folha inteira. Hoje os
sete têm o mesmo layout, então funciona. Se um mês vier com um bloco
diferente, o app leria dado errado calado.

## R8 · CRÍTICO — a animação de entrada rodava duas vezes

Este é o "delay nas animações" que você viu.

O app pinta a tela do cache **na hora** e, se o servidor devolver algo
diferente, repinta por trás (é o que faz a navegação parecer instantânea).
Só que cada repintura reescreve o HTML da página inteira — e com isso
**toda a entrada elástica dos cartões rodava de novo**. O conteúdo
aparecia, assentava, e meio segundo depois deslizava outra vez do zero,
com escalonamento de até 0,3 s entre cartões. Não era demora: era
animação repetida.

## R9 · CRÍTICO — o fundo animado derruba máquina sem aceleração de vídeo

Medi com o compositor por software (que é o que acontece num PC de
escritório com driver antigo, GPU na lista de bloqueio, ou acesso remoto):

| Situação | Quadros por segundo |
|---|---:|
| Céu animando (como estava) | **15 a 18** |
| Só a aurora animando | 19 |
| Só as bolhas animando | 19 |
| Só os cristais animando | 18 |
| Céu parado | **61** |

O resultado é o mesmo com uma camada ou com doze: **não existe
meio-termo**. O custo não é o número de camadas, é o fato de a página
nunca parar de repintar uma superfície do tamanho da tela. Numa máquina
**com** aceleração o céu é praticamente de graça — por isso ninguém tinha
visto isso antes.

## R10 · MÉDIO — desfoque de fundo calculado para nada

`.lateral` tinha `backdrop-filter: blur(18px)`, mas no tema claro o fundo
dela é um gradiente **opaco**: o navegador desfocava uma coluna de 244 px
de altura inteira, a cada quadro, com o céu animando por trás, para um
resultado que ninguém via. `.topo` tem desfoque + saturação + máscara e
fica em cima do céu animado — recalculado a cada quadro também.

## R11 · BAIXO — o céu continuava animando com a aba escondida

O app fica aberto o dia inteiro numa aba de fundo. O navegador reduz os
quadros, mas não para as animações.

---
---

# RODADA 3 — achados a partir das telas em uso

As capturas do sistema rodando mostraram coisas que a leitura do código
não mostra. Onze achados novos.

## S1 · CRÍTICO — o painel não cabe numa célula da planilha

O payload do painel é gravado inteiro numa **única célula** da aba
PAINEL. Uma célula do Google Sheets aceita **50.000 caracteres**.

Medido com a folha real: **96.681 caracteres**, dos quais **91.768** são
a lista de colaboradores (341 pessoas × 12 campos).

Consequência: a gravação falha ou vem truncada, `rhColaboradores` quebra
ao ler `d.colaboradores`, e — como `pintarAbaRH` fazia
`alvo.innerHTML = rhKpis(d) + rhColaboradores(d)` sem tratamento de erro
— a atribuição inteira nunca acontece e **a tela fica com o conteúdo da
aba anterior**. É por isso que clicar em "Colaborador" parecia não fazer
nada: a aba trocava de destaque e o painel continuava desenhado.

## S2 · CRÍTICO — a consulta de período devolvia zero

`acaoPeriodo` fazia `new Date(f.DATA + 'T12:00:00')`. Se `f.DATA` vier
como **objeto Date** — o que acontece assim que a aba perde o formato de
texto "@" — a concatenação produz
`"Fri Jul 21 2026 12:00:00 GMT-0300T12:00:00"`, que é data inválida, e
**todo registro é descartado**. A tela mostrava: 0 colaboradores, 0
registros de ausência, 91 dias no intervalo.

## S3 · CRÍTICO — o código 6.1 (férias) não era encontrado

Na tela, `6.1` aparecia com descrição vazia e categoria "A CONFIRMAR",
**350 vezes** — o bloco de férias inteiro do mês fora de qualquer conta.
`codigo_()` não tratava o caso de a célula ter virado Date nem a vírgula
decimal, e `traduz_()` só tentava uma variação (zeros à esquerda).

## S4 · MÉDIO — "A CONFIRMAR" era a segunda maior barra do painel

530 lançamentos — traços, marcações internas do RH e o próprio 6.1 —
apareciam como uma categoria no gráfico "Dias por categoria", ao lado de
Presença e Atestado. Uma barra grande que não significa nada.

## S5 · CRÍTICO — dois cadastros para a mesma pessoa

A tela de Configuração mostrava a EQUIPE; a tela de Acessos mostrava
ACESSOS. São as mesmas pessoas. Na captura dá para ver o resultado: o
**Gerente** está na Equipe com a coluna Acesso marcada como
**COORDENADOR**. Dois registros discordando, sem nada que avisasse.

## S6 · CRÍTICO — cadastro automático silencioso

Quem digitasse um e-mail desconhecido era registrado como PENDENTE **sem
pedir nada** e caía numa tela de espera. O administrador **não era
avisado**: o pedido ficava na fila até alguém abrir a tela por acaso.
Não havia formulário de pedido, nem motivo, nem resposta.

## S7 · MÉDIO — "a gestão" dependia de texto livre

`emailsDaGestao()` procurava as palavras "GERENTE" ou "ADMINISTRADOR"
dentro do campo PAPEL da EQUIPE. Escrito "Gerência", ou deixado em
branco, **nenhum aviso da gestão saía** — sem erro, sem log.

## S8 · MÉDIO — o rodapé mostrava o começo do e-mail

`hercullito123` em vez do nome. O cadastro não exigia nome, e o último
recurso de `nomeDaPessoa()` era o trecho antes do `@`.

## S9 · MÉDIO — informação repetida em duas telas

A tela de Ranking mostrava melhores, atenção, mais atestados e mais
faltas — dados que saem do mesmo AGR_COLAB que a tela de Assiduidade já
lê. Dois lugares para a mesma coisa, e um deles um item de menu a mais.

## S10 · MÉDIO — a aba Período não filtrava por turno

O formulário tinha datas e tipo de ausência. Não tinha turno — que é o
recorte que a gestão do CD mais usa.

## S11 · BAIXO — texto sem acento e um botão morto

O sistema inteiro estava escrito sem acentuação ("Apresentacao",
"Configuracao", "Periodo"). E a faixa de simulação de perfil chamava
`pararSimulacao()`, uma função que nunca existiu no cliente: clicar dava
erro no console e nada acontecia.
