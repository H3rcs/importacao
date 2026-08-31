# RELATÓRIO FINAL — GSL Bartofil

**Projeto:** GSL TESTE (Google Apps Script) · CD Feira de Santana
**Entrada:** 21 arquivos, 8.906 linhas
**Trabalho:** diagnóstico completo, 17 correções CRÍTICAS, 18 MÉDIAS e 8 BAIXAS

---

## Em uma página

O app tinha **dois problemas independentes**, e cada um explicava metade
da sua queixa.

**"Várias funções não funcionam."** A raiz principal era uma diferença de
acento. `semearDePara()` grava a categoria `Presenca`; `calcularAgregado_()`
comparava com `'Presença'`. A comparação nunca era verdadeira, então
**nenhum dia trabalhado era contado**. Isso não gerava erro nenhum: a tela
carregava, os gráficos apareciam, e todo colaborador tinha **0% de
assiduidade**, todo turno tinha **100% de absenteísmo** e o ranking não
significava nada. Três telas mostrando número errado, com a mesma origem, e
nada denunciando.

Junto com ela vieram parentes do mesmo defeito: o filtro por tipo do
Período apontava para categorias que não existem (qualquer filtro devolvia
vazio), o BI contava faltas por uma lista de nomes que ninguém grava, e o
cruzamento assiduidade × entregas lia a coluna STATUS crua — que quase
nunca é atualizada — em vez de derivar o status como o resto do sistema
faz. Havia ainda uma coisa mais grave e mais simples: **a instalação nunca
terminava**, por causa de um cache de propriedades que não era invalidado
depois de gravar o `ID_BANCO`.

**"O app está lento demais."** Aqui o vilão não era o servidor: era o
número de idas até ele. Depois de **cada** clique de botão, o cliente
apagava o próprio cache e pedia **todas** as telas de novo — aprovar uma
atividade custava 8 idas ao servidor, e como o Apps Script atende uma
chamada por vez para a mesma pessoa, o clique seguinte entrava atrás
dessas oito. No login era pior: sete chamadas de prebusca enfileiradas
antes de qualquer coisa que você fosse clicar. Do lado do servidor, três
laços gravavam linha a linha (encerrar o mês: 228 chamadas de serviço;
importar a folha: 333 com 60 pessoas, com risco real de estourar o limite
de 6 minutos com o CD inteiro), toda gravação aposentava o cache de todas
as tabelas, e as datas eram recalculadas centenas de vezes por tela para
responder sempre "hoje".

Tudo isso está corrigido, medido e documentado. As três regras invioláveis
foram aplicadas: `oauthScopes` fora do manifesto, **nenhum vermelho** em
lugar nenhum (nem na tela, nem nos e-mails), tema claro como padrão. A
separação BI × Calendário estava correta e foi preservada intacta.

---

## O que foi feito

### As correções críticas, em uma linha cada

| ID | Correção | Efeito |
|---|---|---|
| C1 | `esquecerProps()` depois de gravar o `ID_BANCO` | a instalação passou a terminar |
| C2 | comparação de categoria sem acento | **o BI inteiro voltou a ter número certo** |
| C3 | filtro de período por família canônica | filtro por tipo deixou de devolver vazio |
| C4 | seletor "Tipo" montado a partir do DE-PARA | acabou a opção que não leva a lugar nenhum |
| C5 | `BI_FALTAS` → teste por família | custo e reincidência deixaram de dar zero |
| C6 | cruzamento deriva o status e usa a mesma janela | Análise e Calendário passaram a bater |
| C7 | ANEXOS aceita ID e URL | a entrega em PDF voltou a abrir |
| C8 | fim da rebusca-tudo depois de cada clique | 8 idas ao servidor → **2** |
| C9 | prebusca por módulo, cedendo a vez | o login parou de prender o primeiro clique |
| C10 | `inserirVarios` / `atualizarVarios` | base para os três laços abaixo |
| C11 | os três laços de escrita em lote | −86%, −93% e −98% de chamadas |
| C12 | `gerarId()` com contador de execução | sem ID repetido dentro do lote |
| C13 | geração de cache **por tabela** | gravação pequena parou de derrubar o BI |
| C14 | `oauthScopes` removido | regra inviolável |
| C15 | vermelho eliminado da tela e dos e-mails | regra inviolável |
| C16 | `diagnostico()` com a assinatura certa | a medição do projeto voltou a rodar |
| C17 | `acaoValidar` com checagem de nulo | erro claro em vez de `TypeError` |

Os 26 itens MÉDIO e BAIXO estão no `CHANGELOG.md`, cada um com arquivo,
mudança e motivo.

### Desempenho — antes e depois, em chamadas de serviço

Mesmo cenário rodado nas duas versões, com os serviços do Google
instrumentados:

| Cenário | Antes | Depois |
|---|---:|---:|
| Instalar (banco + sementes) | 383 | **52** |
| Encerrar o mês | 228 | **5** |
| Importar a folha (60 pessoas, 1.200 lançamentos) | 333 | **23** |
| Salvar um setor e reabrir o BI | 10 | 8 |
| Validar uma atividade | 9 | 8 |

E, do lado do navegador — que é onde a lentidão era sentida:

| Ação | Antes | Depois |
|---|---:|---:|
| Entrar no sistema | 1 + 7 enfileiradas | **1** |
| Aprovar / reprovar / cancelar | **8** | **2** |
| Voltar a uma tela já vista | 1 | **0** (pinta do cache) |

### Interface

Nenhum layout foi redesenhado. As mudanças visuais são as que as regras
exigiam, mais duas de desempenho:

- todo vermelho (`#D71920`, `#DC2626`, `#991B1B`, `#9A1218` e os `rgba`
  correspondentes) virou âmbar — o amarelo da marca escurecido até ter
  contraste com texto branco;
- tema claro passou a ser o padrão (o botão ☾ e a preferência gravada
  continuam mandando);
- as camadas do céu do tema **inativo** pararam de animar: `opacity: 0`
  escondia, mas o navegador continuava compondo 12 partículas, 2 camadas
  de estrelas e 3 nebulosas com `blur(80px)` em todo quadro;
- a Configuração ganhou o cartão **DE-PARA** e os botões de rotina — não
  é funcionalidade nova: são ações que já existiam no servidor, com
  permissão declarada, e não tinham um único botão.

---

## Como validei

Escrevi um **banco de ensaio** que implementa o suficiente dos serviços do
Google (`SpreadsheetApp`, `PropertiesService`, `CacheService`,
`LockService`, `DriveApp`, `MailApp`, `Utilities`) para rodar os 14
arquivos `.gs` fora do Apps Script. Com ele instalei o sistema do zero,
cadastrei equipe, gerei um mês, validei e cancelei atividades, importei uma
folha de ponto sintética e abri todas as telas — **nas duas versões**.

Foi esse ensaio que encontrou o C1: eu não tinha visto o defeito da
instalação lendo o código, ele apareceu na primeira tentativa de instalar.

O mesmo roteiro rodado no original mostra o antes com números:

```
ORIGINAL:   21 passaram, 13 falharam
  FALHA CRITICA na instalacao: O banco ainda nao foi instalado.
  TRABALHADOS=0 (bug do acento)      assiduidade de Ana: veio 0%, esperado 90%
  turno A com taxa 100%              ranking vazio
  FALTA_INJUST: 0 registros          diasFalta=0
  filtro tipo=Falta: 6 registros (era o total, sem filtro nenhum)
  validar com id inexistente: Cannot read properties of null (reading 'PRAZO')
  diagnostico(): Tela desconhecida: [object Object]

CORRIGIDO:  33 passaram, 0 falharam
```

O roteiro está no `_ENSAIO/`, junto com um `LEIA-ME.md`. Dá para rodar
os dois lado a lado.

Além disso rodei, nas duas versões, as três verificações que o próprio
projeto documenta no `ESTADO-DO-PROJETO.md`:

1. `node --check` em cada `.gs` — **14/14 ok**;
2. identificadores duplicados entre arquivos (todos os `.gs` dividem o
   escopo global no Apps Script) — **nenhum**;
3. `App.html` carregado num DOM falso com `node:vm` — **compila e todos os
   handlers de `onclick`/`onchange` existem**.

E mais quatro checagens minhas: toda tela e toda ação do catálogo apontam
para função que existe; toda função chamada pelo cliente existe no
servidor; todo token CSS usado pelo cliente existe no `Estilo.html`; e o
`Index.html` fecha todas as `<div>` (65/65 — havia uma sobrando).

Por fim, capturei as duas telas (claro e escuro) num Chromium para
conferir a paleta de perto. Não sobrou vermelho.

**O ensaio não substitui o teste real.** Ele não cobre envio de e-mail de
verdade, a conversão de fotos em PDF (que depende de `DocumentApp`,
`UrlFetchApp` e das miniaturas do Drive) nem o comportamento do CSS no
navegador de cada pessoa. Por isso o `TESTES.md` existe, com 52 itens
numerados pelos mesmos IDs do `CHANGELOG.md`.

---

## O que **não** foi feito, e por quê

**Não recebi o `atividades_2026.html`.** Ele é citado como a referência
estética, tanto no seu pedido quanto no `CORRECOES.md` do projeto, e não
veio no .zip. Sem ele, mantive integralmente a estrutura visual existente e
mexi só no que as regras invioláveis exigiam. Comparar contra a referência
é uma passada rápida e isolada — mande o arquivo e eu faço.

**Não removi nada que ainda pudesse servir.** Três funções órfãs
(`lerPlanilhaExterna`, `abasDaPlanilhaExterna`, `garantirCompetencia`), a
ação `entregar` (anexo avulso, sem botão desde que o fluxo de PDF entrou) e
o painel antigo `rhPeriodo` continuam onde estavam. Cada uma está listada
no `PENDENCIAS.md` com o motivo. O bloco comentado dentro de
`dentroDoEscopo()` — o filtro por turno desligado — está exatamente como
estava.

**Não portei as funções que faltam** do `GSL_Bartofil_v10.gs`
(`relatorioMensalPDF`, `backupMensal_`, `restaurarDataOriginal`, os
modelos `.docx`). Você pediu correção e desempenho, e disse para não
inventar funcionalidade nova. A lista está registrada no `PENDENCIAS.md`
para não se perder.

**Deixei cinco decisões para você**, todas no `PENDENCIAS.md`: se o filtro
por turno volta (e o que fazer com o texto do diagnóstico de acesso, que
hoje explica uma regra desligada); se a ação `entregar` merece botão; se
falta justificada/disciplinar viram categorias de verdade no DE-PARA; se o
gatilho de aquecimento a cada 15 min deve ser afrouxado; e se "Aguard.
valid." deve mudar de cor, já que com o vermelho fora ela ficou mais viva
que "Atrasada".

---

## Estado final de cada arquivo

| Arquivo | Linhas | Linhas tocadas | O que mudou |
|---|---:|---:|---|
| `appsscript.json` | 18 → **10** | 13 | `oauthScopes` removido (regra inviolável) |
| `Codigo.gs` | 434 → **437** | 7 | `diagnostico()` com a assinatura certa |
| `Banco.gs` | 488 → **670** | 210 | escrita em lote, geração por tabela, `gerarId`, três economias |
| `Datas.gs` | 141 → **204** | 79 | memória de fuso/hoje, `diaNumISO`, formatação sem chamada de serviço |
| `Auth.gs` | 228 → **230** | 4 | limpeza de cache duplicada removida |
| `Permissoes.gs` | 172 → **172** | 0 | **intacto** |
| `Instalacao.gs` | 437 → **481** | 96 | correção da instalação, sementes em lote, cache de gatilhos |
| `Calendario.gs` | 762 → **874** | 202 | `hidratar` enxuta, `statusDe` por texto, `comCampos_`, cancelamento em lote, remarcação recalcula status |
| `Central.gs` | 308 → **315** | 35 | usa `prazoNum`/`hojeNum` (fim dos ~1.000 `formatDate`) |
| `Config.gs` | 145 → **192** | 49 | DE-PARA e categorias no payload, `APRESENTACAO_*` sem duplicata |
| `Dados.gs` | 906 → **1.019** | 217 | **acento das categorias**, filtro de período, colaboradores em lote, competência normalizada, `abaDe` |
| `BI.gs` | 349 → **384** | 61 | famílias de falta, cruzamento derivando o status na mesma janela |
| `Emails.gs` | 322 → **333** | 25 | `COR_ALERTA` sem vermelho, cache de gatilhos |
| `Entrega.gs` | 299 → **324** | 35 | trava da pasta temporária, sem releitura pós-gravação |
| `Arquivos.gs` | 115 → **151** | 42 | ANEXOS aceita ID e URL, retorno com forma única |
| `Index.html` | 155 → **154** | 1 | `</div>` sobrando |
| `Estilo.html` | 1.288 → **1.340** | 114 | vermelho → âmbar, céu do tema inativo congelado |
| `App.html` | 1.989 → **2.146** | 241 | fim da rebusca-tudo, prebusca por módulo, tema claro, DE-PARA na tela, anexos religados |
| `Marca.html` | 26 → **26** | 0 | **intacto** |
| `LEIA-ME.md` · `ESTADO-DO-PROJETO.md` · `CORRECOES.md` | — | 0 | **intactos** (documentação sua) |

Os `.gs` cresceram cerca de 12% em linhas. Quase tudo é comentário: cada
correção não óbvia carrega no código a explicação do que estava errado e
por que a solução é essa — para que a próxima pessoa (ou você, daqui a
seis meses) não desfaça sem saber.

---

## Entregáveis

```
01_ORIGINAL/     os 21 arquivos como chegaram, somente leitura
02_CORRIGIDO/    os arquivos finais — é esta pasta que sobe
DIAGNOSTICO.md   os 44 achados, classificados, com arquivo e linha
CHANGELOG.md     uma entrada por alteração + a tabela antes/depois
PENDENCIAS.md    o que não mexi, por quê, e as 5 decisões que são suas
TESTES.md        52 testes numerados pelos mesmos IDs do CHANGELOG
RELATORIO.md     este arquivo
_ENSAIO/         (opcional) o ambiente que roda os .gs fora do Apps Script
```

**Por onde começar:** `TESTES.md`, bloco 4. É o defeito do acento — o mais
grave, o mais invisível, e o que muda todo número que a gestão olha.

---
---

# RODADA 2 — planilha real e animações

## Em uma página

Você trouxe as duas coisas que faltavam: a **folha do RH** e a
**GSL-DADOS em produção**. Com elas eu parei de supor. Rodei o ETL do app
contra a sua folha real e comparei com o que a sua planilha calcula —
e a comparação encontrou seis defeitos críticos que eu não tinha como ver
lendo o código.

**O maior deles: a tabela DE-PARA que o app semeava era uma aproximação
minha da legenda, e errava em nove códigos.** O 5, o 26, o 401 e o 003
estavam como "Compensação" quando são **Ajuste de horas**; o 6 estava
como licença quando é **Abono**; o 16 e o 18 caíam os dois em "Falta"
quando são **injustificada** e **disciplinar**; o 23 e o 24 contavam como
ausência quando não contam. E faltavam três códigos inteiros — o **28
(falta com justificativa)**, o 00 e o 29.

Somado a isso, um defeito de caixa: o ETL descartava a célula quando a
categoria era `IGNORAR`, mas o DE-PARA guarda `Ignorar`. Nunca casava.
As **173 células** de traço (`-`), marcação interna do RH (`PP`) e
anotação em texto (`SISTEMA INTRANET`) entravam na base como lançamento
válido e empurravam a taxa de absenteísmo para baixo.

**E cinco colaboradores sumiam do sistema inteiro, sem aviso.** O filtro
de linhas de totalização procurava as palavras de corte na linha inteira
convertida em texto — inclusive nas colunas 37 e 39, bem à direita da
grade, onde o RH escreve anotações como `QUNT TUR ADM`. VALDY, VINICIUS,
WELLINGTON, STEPHANIE e RENATO eram descartados na importação e não
apareciam em tela nenhuma.

Sobre as animações: **não era demora, era animação repetida.** O app
pinta a tela do cache na hora e repinta por trás quando o servidor
confirma. Cada repintura reescrevia o HTML da página, e com isso toda a
entrada elástica dos cartões rodava de novo — o conteúdo aparecia,
assentava, e meio segundo depois deslizava outra vez. Corrigido: a
repintura de fundo não reanima nada.

E medi o fundo animado com o compositor por software, que é o que
acontece num PC de escritório com driver antigo ou acesso remoto:
**15 a 18 quadros por segundo**. Parado, 61. O detalhe que fecha a
questão: dá o mesmo número com **uma** camada animando ou com **doze** —
o custo é a página nunca parar de repintar a tela inteira. Não existe
meio-termo, então o app agora mede a máquina ao abrir e liga sozinho um
**modo leve** que congela o fundo e tira os desfoques, mantendo cores,
vidro, sombras e layout idênticos.

## A prova

Rodei o código de produção contra a sua folha de agosto e comparei com a
sua GSL-DADOS:

| Indicador | App | GSL-DADOS |
|---|---:|---:|
| Colaboradores | 341 | 341 |
| Registros (pessoa × dia) | 4.846 | 4.846 |
| Ausências | 214 | 214 |
| Taxa de absenteísmo | 4,4% | 4,4% |
| Faltas injustificadas (16) | 21 | 21 |
| Faltas justificadas (28) | 7 | 7 |
| Faltas disciplinares (18) | 6 | 6 |
| Atestados (1, 21, 130) | 180 | 180 |
| Dias de férias | 365 | 365 |
| Pessoas em férias | 25 | 25 |
| Pessoas com ausência | 59 | 59 |

Por turno, também exato — ADM 40 pessoas / 538 registros / 473 presenças
/ 3 ausências; A 104 / 1610 / 1415 / 83; B 113 / 1519 / 1294 / 77.
E a assiduidade individual, conferida nome a nome contra o seu AGR_COLAB.

**34 conferências, 0 divergências.**

## O que você precisa fazer (e é rápido)

O seu banco **já tem** o DE-PARA errado gravado, e a semente não
reescreve o que já está lá — de propósito, porque as suas edições valem
mais que a minha tabela. Então a correção não chega sozinha:

> **Configuração → cartão DE-PARA → "Restaurar tabela padrão" →
> depois "Reclassificar a base".**

Montei um banco exatamente como a versão anterior deixaria e rodei essa
sequência: antes, taxa 4,1% e 28 faltas injustificadas; depois, **4,4% e
21** — os números da sua planilha. Restaurar não apaga nada que você
tenha acrescentado.

## O que mudou nas telas

Três coisas, todas pequenas e todas consequência do que a sua planilha
diz:

1. O cartão "Faltas" virou **"Faltas injustificadas"**, com as
   justificadas e as disciplinares na legenda. Está escrito no seu
   DE-PARA: *"no painel elas nunca se somam num balde só"*.
2. O cartão de % por turno mostra o denominador (`5,2% de 1610`) e
   quantas pessoas — os números agora são os mesmos no Painel e no
   Ranking, que antes usavam denominadores diferentes.
3. Um botão **⚡** no canto superior direito liga e desliga o modo leve.
   Ele está no topo, e não só na Configuração, porque quem sente a
   lentidão é o coordenador — e o perfil dele não tem Configuração.

## Onde encontrar o detalhe

- `DIAGNOSTICO.md` → seção **RODADA 2**: os 11 achados novos, com os
  números medidos.
- `CHANGELOG.md` → seção **RODADA 2**: uma entrada por alteração, mais a
  tabela de conferência e as medições de quadros por segundo.
- `TESTES.md` → **blocos 9 e 10** (T53 a T71). **Comece pelo T61** — é o
  Restaurar + Reclassificar, sem ele os outros não passam.
- `PENDENCIAS.md` → itens 6 a 10, incluindo as duas linhas do DE-PARA
  que a sua própria planilha marca como "confirmar com o RH".
- `_ENSAIO/real.js` e `_ENSAIO/migracao.js` → os dois roteiros que fazem
  a conferência contra a folha real; dá para rodar de novo a cada mês
  novo do RH.

---
---

# RODADA 3 — acessos, continuidade e faxina

## Os dois defeitos que suas telas denunciaram

Suas capturas mostraram duas coisas que eu não teria achado só lendo o
código.

**A aba Colaborador não carregava por causa de um limite de célula.** O
painel de assiduidade era gravado inteiro numa **única célula** da
planilha — e uma célula do Google Sheets aceita **50.000 caracteres**.
Com 341 pessoas, o payload dava **96.681**, e a lista de colaboradores
respondia por 91.768 deles. A gravação falhava ou vinha truncada, a
função quebrava no meio da montagem, e como o erro não era tratado a tela
simplesmente ficava com o conteúdo da aba anterior — o clique parecia não
fazer nada. A lista agora vem do `AGR_COLAB`, sob demanda: **96.681 →
5.242 caracteres**, e cada aba monta dentro de um `try`, então um erro
vira mensagem em vez de tela congelada.

**O Período devolvia zero por causa de um `+` de string.** A consulta
fazia `new Date(f.DATA + 'T12:00:00')`. Quando a coluna vinha como Date
em vez de texto — o que acontece assim que a aba perde o formato "@" —
isso virava `"Fri Jul 21 2026 ...T12:00:00"`, uma data inválida, e o
filtro descartava tudo. Era exatamente o que a sua tela mostrava: 0
colaboradores, 0 registros, 91 dias no intervalo.

E o `6.1` — férias — aparecia como "A CONFIRMAR" **350 vezes**: o bloco
de férias inteiro do mês fora da conta.

## Login e acessos

Você resumiu bem: duas telas para a mesma coisa não fazia sentido. E não
fazia mesmo — na sua Configuração, o **Gerente** aparecia na Equipe com
acesso **COORDENADOR**. Dois registros da mesma pessoa discordando, e
nada avisava.

Agora há **um cadastro só**. A tabela ACESSOS ganhou função, situação e o
histórico da decisão; a EQUIPE é migrada para dentro dela automaticamente
(e continua no banco, intacta). Uma tela — **Pessoas e acessos** — com
duas abas: as pessoas e a matriz de níveis.

E o fluxo virou o que você descreveu:

1. a pessoa informa o e-mail; se não tem cadastro, a tela abre o
   **formulário de pedido**;
2. a gerência recebe **um e-mail** e vê o pedido em destaque no topo da
   tela, com nível e turno para escolher ali mesmo;
3. **Aprovar** ou **Recusar** (com motivo);
4. a pessoa recebe a resposta por e-mail.

Antes, quem digitasse um e-mail desconhecido era cadastrado **em
silêncio** como pendente, caía numa tela de espera sem ter pedido nada, e
o administrador não era avisado — o pedido dormia até alguém abrir a tela
por acaso. O atalho continua existindo: **Cadastrar pessoa** libera
alguém direto, sem pedido, para quem você já conhece.

## Continuidade entre competências

Cada competência é uma planilha de um mês, mas a operação é contínua.
Então:

- o **Período** varre a base por data e atravessa quantas competências
  forem necessárias, com uma **linha do tempo** de um ponto por dia — que
  é onde se vê que não há buraco na virada — e a quebra por competência;
- o **Painel** ganhou a série **mês a mês de todas as competências**;
- a **ficha do colaborador** mostra o histórico inteiro.

Conferido de verdade: importei duas competências (21/06–20/07 e
21/07–20/08), cada uma na sua planilha, e a consulta de 21/06 a 20/08
devolveu **61 dias consecutivos**, com a virada 20/07 → 21/07 intacta e o
total batendo com a soma das duas.

## O resto da lista

- **Atualização diária às 10h** — gatilho novo que relê **só** a
  competência marcada como Aberta (é a que o RH mexe). O botão
  **↻ Atualizar dados** faz o mesmo na hora, no topo da Assiduidade.
- **Ranking** e **Análise** deixaram de existir. Os quadros do Ranking
  foram para a aba **Colaboradores**, junto da lista individual, que
  ganhou busca. Da Análise ficou só o que dizia algo — a tendência mês a
  mês — e ela virou o gráfico contínuo do Painel. O arquivo `BI.gs` saiu
  do projeto: são 384 linhas a menos para colar.
- **Filtro por turno** no Período, ao lado do tipo de ausência, e dois
  atalhos novos (6 meses, Tudo).
- **Código fora da legenda** vira **"Não definido"**, fica fora dos
  gráficos e vira uma faixa de aviso com os códigos e um atalho para
  cadastrá-los. Na sua tela, "A CONFIRMAR" era a segunda maior barra do
  painel — 530 lançamentos dizendo nada.
- **Configuração** virou quatro abas: *Fontes do RH*, *Calendário*,
  *Apresentação*, *Sistema*. Os dezessete parâmetros soltos foram para a
  aba do assunto a que pertencem.
- **Nome no rodapé** em vez de `hercullito123`.
- **Acentuação**: cerca de 240 trechos. "Apresentação", "Configuração",
  "Período", "Níveis de acesso", "% de ausência".

## Como validei

Cinco roteiros, todos no `_ENSAIO/`:

```
rodar.js             35 testes funcionais                    35/0
real.js              ETL contra a FOLHA REAL x GSL-DADOS     34/0
continuidade.js      duas competências, sem quebra            7/0
migracao.js          DE-PARA errado -> restaurar + reclassificar  8/0
migracao_pessoas.js  Equipe + Acessos -> cadastro único       6/0
```

O `real.js` continua batendo exato com a sua GSL-DADOS: 341
colaboradores, 4.846 registros, 4,4%, 21/7/6 faltas, 180 atestados, 365
dias de férias — e o quadro por turno, pessoa a pessoa.

Também renderizei as telas novas num navegador de verdade para conferir o
resultado, e nenhuma delas gera erro de JavaScript.

## O que você precisa fazer ao subir

1. **Apague o arquivo `BI.gs`** do projeto no Apps Script — ele saiu.
2. Suba os arquivos, salve e **implante uma nova versão**.
3. Abra o app: a migração de Equipe para Acessos roda sozinha. Vá em
   **Pessoas e acessos** e defina o nível de quem aparecer como pedido —
   é gente que estava só na antiga Equipe e nunca teve nível.
4. **Configuração → Sistema → Ligar rotinas automáticas.** Entrou um
   gatilho novo (o das 10h); o selo precisa mostrar **5 de 5**.
5. Se ainda não fez: **Configuração → Fontes do RH → DE-PARA → Restaurar
   tabela padrão → Reclassificar a base**. É o que faz o 6.1 virar Férias
   e o "A CONFIRMAR" sumir.

O `TESTES.md` tem os blocos 11, 12 e 13 (T72 a T95) com o passo a passo.

## Uma coisa que continua pendente

Duas linhas do DE-PARA vêm da sua própria planilha com a observação de
que o significado ainda não foi confirmado com o RH: o **PP** (25 células
na folha de agosto, hoje tratado como "Ignorar") e o **29 — Cáceres sem
vencimento**. Estão no `PENDENCIAS.md`, item 6. Se o RH confirmar outro
significado, é editar o código no DE-PARA e rodar Reclassificar — nenhuma
linha de código muda.
