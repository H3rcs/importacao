# Correções desta rodada — desempenho e tema

Duas frentes: o app estava lento e o tema não batia com a referência
(`atividades_2026.html`). As duas causas eram independentes.

---

## Frente 1 — lentidão do lado do navegador (era a maior)

O que travava, no `Estilo.html` antigo:

| Problema | Por que custava |
|---|---|
| 3 `.nebulosa` com `filter: blur(90px)` animando para sempre, com `mix-blend-mode: screen` | blend mode impede o navegador de promover a camada para a GPU — cada quadro remisturava a tela inteira |
| `.cartao` com `backdrop-filter: blur(18px)` | cada cartão reamostra o fundo desfocado a cada quadro; uma tela com 15 cartões = 15 desfoques por quadro, sobre um fundo que nunca para |
| `.aurora` animando `background-position` | repinta a superfície inteira a cada quadro |
| `.estrelas` piscando `box-shadow` | repaint por estrela, por quadro |

O que ficou no lugar:

- Nenhuma animação de cor, sombra, filtro ou `background-position` no céu.
  Só `transform` e `opacity` — as duas propriedades que o compositor
  resolve sozinho, sem repintar.
- `mix-blend-mode` removido; `will-change: transform` nas camadas com
  `blur()`, então o desfoque é calculado uma vez e depois só deslizado.
- `backdrop-filter` só sobrou em 2 lugares: barra lateral e janela modal.
  Fora dos cartões.
- `contain: strict` no `.ceu`: mexer no fundo nunca reprocessa o conteúdo.
- Atalho para máquina fraca: `<html class="sem-animacao">` congela o céu
  inteiro sem tirar o visual.

**Medido: 60 FPS** na prévia, com as 12 partículas e as duas camadas de
estrelas rodando.

## Frente 2 — tema fiel à referência

- **Modo noturno:** espaço com gradientes radiais, duas camadas de
  estrelas (uma que deriva devagar, outra maior que pulsa a cada 4,5 s),
  nebulosa roxa de 700px (`#8B5CF6` sobre `#581C87`), mais a rosa e a
  ciano. Opacidade das nebulosas subiu de 0,5 → 0,62.
- **Estrelas cadentes removidas** — eram o "espelho" atravessando a tela.
- **Modo claro:** aurora pastel (`#DBEAFE → #E0E7FF → #FCE7F3 → #D1FAE5`),
  duas ondas, três cristais e seis bolhas subindo.
- **Neon:** `#00F3FF`, `#BC13FE`, `#0AFF68`, `#FF2D95`, `#FFB800` no
  escuro, com versões escurecidas no claro (senão some no papel branco).
  Fita neon de 3px no topo de cada cartão; números dos KPIs pintados com
  o gradiente da própria fita.
- **Interação:** cartão sobe 3px com curva elástica
  `cubic-bezier(.34, 1.56, .64, 1)`, acende a borda neon e leva uma
  varredura de luz no hover. Entrada escalonada até o 6º cartão.

### Defeitos que apareceram no caminho

- `.meteoro:nth-of-type(1)` nunca casava — `nth-of-type` conta por **tag**,
  e eram todas `<div>`. Agora cada camada tem classe própria (`c1..c3`).
- `.topo` (cabeçalho fixo) pintava uma faixa **opaca** na cor `--fundo`
  por cima do céu: como a aurora muda de cor e o `--fundo` não, aparecia
  um retângulo claro recortado no fundo. Agora desfoca o que passa por
  baixo e some com máscara, sem aresta.
- `.serie-barra` (barras do gráfico) vinha em `--alerta`, vermelho.
  Vermelho é sinal de problema, não cor de gráfico — e não existe na
  marca Bartofil. Padrão agora é ciano/roxo, com variantes
  `.verde .amarela .vermelha` para status.

## Frente 3 — lentidão do lado do servidor

| Onde | Antes | Agora |
|---|---|---|
| `App.html` | todo clique no menu = ida ao servidor (1–3 s), sem cache; voltar a uma tela já vista pagava de novo | `CACHE_TELAS`: pinta na hora e revalida por trás. Menos de 20 s, nem revalida. Gravação limpa tudo |
| `Banco.gs` `limparCache()` | qualquer gravação apagava `perfis`, `acessos` e `assiduidade` — salvar uma atividade obrigava todo mundo a remontar a matriz de permissões | `limparCache(tabela)`: cada tabela derruba só o cache que alimenta. Sem argumento ainda apaga tudo (instalação e botão "Atualizar dados") |
| `Banco.gs` `registrarLog()` | um `appendRow` de rede por gravação — dobrava o tempo de toda escrita, só por auditoria | balde no cache, desce de 10 em 10 numa escrita só. `descarregarLog()` esvazia na hora e roda no gatilho diário |
| `Auth.gs` `usuarioAtual()` | recalculado a cada chamada (e às vezes mais de uma vez na mesma requisição) | memorizado por execução em `_usuarioDaVez`; a variável morre com a requisição, então nunca serve a identidade de uma pessoa para outra |

## Frente 4 — a lentidão que sobrou (2ª rodada)

O cache da rodada anterior só ajudava na **volta** a uma tela. A primeira
visita de cada tela, e a entrada no app, continuavam pagando o preço cheio.

| Onde | O que foi feito |
|---|---|
| `Codigo.gs` `carregarTela()` | payload da tela guardado no servidor por 180 s. Numa repetição o `openById` nem acontece — a resposta volta sem tocar na planilha |
| `Codigo.gs` `chaveDeTela()` | a chave não leva o e-mail: leva perfil, escopo e turno. Dez coordenadores do turno B dividem o mesmo payload e o primeiro paga por todos. Só escopo `PROPRIAS` é pessoal |
| `Banco.gs` `geracaoDados()` | não dá para apagar chaves que não se consegue listar, então toda chave carrega um número de geração; qualquer gravação avança o número e o que era velho vira lixo que expira sozinho. Sem janela de dado desatualizado |
| `Banco.gs` `gravarTextoCache()` | o `CacheService` recusa valores acima de 100 KB **em silêncio** — grava "com sucesso" e a leitura volta vazia. O texto agora é fatiado em pedaços de 90 KB e remontado |
| `Banco.gs` `prop()` | as propriedades eram lidas dezenas de vezes por requisição, uma chamada de serviço cada. Agora é uma leitura por execução |
| `App.html` `prebuscar()` | assim que a tela inicial aparece, o app busca as outras sozinho, uma de cada vez, e guarda. Ao clicar no menu o dado já chegou |
| `Codigo.gs` `aquecerCache()` | gatilho de 15 em 15 minutos, das 5h às 21h, monta as telas principais e deixa prontas. Quem abre o app encontra a resposta já feita |

### Por que uma de cada vez na prebusca

O Apps Script enfileira as chamadas do mesmo usuário. Disparar as cinco
telas juntas só faria a primeira demorar mais — e é justamente a que a
pessoa está olhando.

### O que ainda vai demorar

A **primeiríssima** abertura depois de o projeto ficar horas parado. É o
ambiente do Apps Script sendo criado do zero; nenhum código evita isso. O
gatilho de aquecimento existe justamente para que essa situação seja rara
em horário de trabalho.

## Frente 5 — segunda camada de desempenho (3ª rodada)

| Onde | O que foi feito |
|---|---|
| `Banco.gs` `listar()` | as tabelas quentes (`ATIVIDADES`, `COLABORADORES`, `FATO_ASSIDUIDADE`, `PERFIS`, `SETORES`, `ROTINAS`, `PARAMETROS`, `DE_PARA`, `AGR_COLAB`) ficam guardadas já montadas entre execuções. Uma tela que não achou payload pronto ainda evita as leituras de planilha |
| `Banco.gs` `listar()` | `getDataRange()` percorre tudo que a aba já teve, inclusive linhas vazias que só ficaram formatadas. Agora pede o retângulo exato (`getLastRow` × `getLastColumn`) |
| `Banco.gs` `semObjetos()` | só guarda a tabela se todo valor for texto ou número. Uma célula que volte como `Date` viraria string na ida e volta pelo JSON e o código que espera `Date` quebraria em silêncio — defeito que só aparece semanas depois |
| `Codigo.gs` `montarBootstrap()` | o bootstrap também custa (confere esquema, identifica a pessoa, monta as telas, olha o RH). Agora entra no mesmo esquema de geração. O tema fica fora do cache: é preferência do navegador |
| `Codigo.gs` `aquecerCache()` | passa a aquecer o bootstrap do administrador junto com as telas |
| `Codigo.gs` `diagnostico()` | mede e escreve no registro o custo de abrir o banco, de cada tabela e de cada tela, com e sem cache. Serve para parar de adivinhar onde o tempo está indo |

### Efeito colateral a conhecer

Quem editar a planilha **na mão**, por fora do app, pode levar até 5 minutos
para ver a mudança aparecer — o app não tem como saber que alguém mexeu.
Gravação feita pelo app invalida na hora. O botão **Atualizar dados** também
limpa tudo na hora.

## O bug do e-mail que não saía

O `appsscript.json` declarava o escopo `script.send_mail`. Esse escopo só
permite a forma **simples** do `MailApp.sendEmail` — o sistema usa a forma
com `htmlBody` e `cc`, que exige o escopo completo `https://mail.google.com/`.
Resultado: o `MailApp` lançava erro, e a função `enviar` **engolia o erro
no LOG** em vez de mostrá-lo. Por isso a ação parecia dar certo (a atividade
cancelava, a validação gravava) mas nenhum e-mail chegava, sem aviso nenhum.

Três correções:
- Escopo trocado para `https://mail.google.com/` no manifesto.
- `enviar` agora **propaga a falha**: se o e-mail não sai, a pessoa vê o
  erro na tela em vez de achar que enviou.
- `testarEmail()` para rodar pelo editor (Executar → testarEmail): diz a
  cota restante e dispara um teste ao admin. Se falhar aqui, é autorização.
- `emailsDoTurno` passa a usar o e-mail **atual** da EQUIPE, não o que
  ficou congelado na linha quando a atividade foi gerada.

**IMPORTANTE:** trocar o escopo obriga uma **reautorização**. Depois de
subir o `appsscript.json`, o Google vai pedir os acessos de novo na próxima
abertura — aceite, senão o envio continua barrado.

### O que não foi mexido e por quê

- `doGet` continua entregando bootstrap + primeira tela dentro do HTML.
  É o menor tempo total até a primeira tela útil, mesmo deixando a tela
  branca um pouco mais.
- Nada foi rodado no Apps Script real — só verificação de sintaxe.
  **Teste pela URL `/dev` antes de publicar versão.**

---

# Rodada de 01/09/2026 — quatro defeitos relatados em uso

## 1 · O botão "Salvar" do link da apresentação não podia ser clicado

`cfgApresentacao` desenhava cada turno como uma linha de **tabela**, com o
campo em `width:100%` numa célula e o botão na célula seguinte. Com
`table-layout: auto` o campo transbordava a própria célula e ficava por
cima do botão: o clique chegava no campo, nunca no botão. Nenhum link
jamais foi gravado — e é por isso que a tela de Apresentação continuou
mostrando "sem link" mesmo depois de o texto ter sido digitado. Não havia
erro nenhum a ver; a gravação não era nem tentada.

Agora cada turno é uma linha `flex` (`.linha-apres`): rótulo com largura
fixa, campo elástico, botão com lugar próprio e nada por cima. O
salvamento ganhou três portas — o botão, a tecla **Enter** e a saída do
campo — com trava para o clique não gravar duas vezes (o `blur` dispara
no `mousedown`, o `click` no `mouseup`).

Um link que não seja do Google Apresentações passa a ser recusado na
hora, com o campo em foco: colar o endereço errado era o segundo engano
mais comum e só aparecia na reunião.

## 2 · A atividade nova não avisava ninguém por e-mail

Duas causas somadas em `avisarNovaAtividade`:

- Atividade de turno **"Todos"** aparece na tela como
  "Gerência + coordenadores", mas o aviso saía só para os coordenadores.
  Quem criou nunca recebia nada e concluía — com razão — que o envio
  estava quebrado.
- `if (!destino.length) return;` — sem coordenador ativo com turno em
  "Pessoas e acessos" a lista vinha vazia e a função **desistia em
  silêncio**. A tela dizia "Atividade criada — coordenador avisado" de
  qualquer jeito.

Agora: "Todos" avisa coordenadores **e** gerência; turno específico avisa
o coordenador com a gerência em cópia; e lista vazia vira **erro visível**,
dizendo exatamente o que falta cadastrar. Além disso `acaoCriarAtividade`
devolve os endereços que receberam, e o aviso da tela passa a ser
"Atividade criada — aviso enviado para fulano@…, sicrano@…". Dá para
conferir o envio sem perguntar a ninguém.

## 3 · Vermelho de volta, e "crítico" virou "fora da meta"

A rodada anterior tinha trocado **todo** o vermelho por âmbar, alegando
que ele não existe na marca. A leitura estava errada: vermelho não existe
no **logo** — nunca deixou de ser o **sinal de alerta**. Pintar atraso,
reprovação e falta de âmbar empatou tudo com o amarelo de "aguardando", e
a tela parou de gritar.

- `--alerta` volta a vermelho (`#C62828` claro / `#FF6B5E` escuro).
- Rampa sequencial `--seq-vermelho-1..4`: quanto pior, mais escuro — a
  mesma leitura de longe que a planilha tinha. O apelido `--seq-ambar-*`
  continua apontando para ela, então nenhuma chamada antiga quebrou.
- `--faixa-aus` (ausências na ficha) sai do âmbar e vira vermelho.
- A situação passa a pintar também o **medidor**, não só o número e o
  selo: `.medidor.sit-bom / .sit-atencao / .sit-critico`.
- O texto "crítico" virou **"fora da meta"** — o espelho de "dentro da
  meta". A classe CSS continua `critico`, que é nome de estilo, não o que
  aparece na tela.

O ícone e a palavra continuam em todo selo: quem não distingue verde de
vermelho, e a folha impressa em preto e branco, seguem funcionando.

## 4 · Abas e busca da assiduidade eram invisíveis

`Painel / Colaboradores / Período` e `Turnos / Destaques / Lista completa`
eram texto solto com sublinhado de 2px. Num fundo animado, cercado de
cartões grandes, ninguém percebia que eram botões.

- `.aba` virou **pastilha** com fundo e borda; a ativa é azul cheio com
  texto branco (no escuro, gradiente claro com texto escuro).
- Sub-abas usam a mesma pastilha um grau menor, com a ativa em azul
  tênue e borda azul — a hierarquia continua legível sem sumir.
- A busca ganhou `.campo-busca`: lupa, 320px, borda mais forte e anel de
  foco. Vale para "Buscar nome ou matrícula" e "Buscar nome, e-mail ou
  turno".
- O seletor de competência do topo deixou de ser um `select` cru.

## Verificação feita

- `node --check` em todos os `.gs` — sem erro.
- Varredura de identificadores duplicados entre arquivos — nenhum.
- `App.html` carregado em `node:vm` — sintaxe válida, funções dos
  `onclick` todas definidas.
- Estilo renderizado no Chromium nos dois temas e conferido em imagem.
- **Nada rodou no Apps Script real.** Teste pela URL `/dev` antes de
  publicar versão.

---

# Rodada seguinte — atividade no mês errado e abas ainda apagadas

## 5 · A atividade aparecia em agosto e sumia em setembro

Uma atividade com prazo em 01/09 estava sendo desenhada no dia 1 **dentro
do calendário de agosto** (na faixa cinza da semana que atravessa o mês) e
não aparecia no calendário de setembro.

A causa é a diferença entre dois critérios que ninguém tinha alinhado:

- a **lista** do mês era filtrada pelo campo `COMPETENCIA` — o rótulo com
  que a atividade nasceu ("AGO 2026");
- a **grade** desenhava cada atividade no dia do `PRAZO`, e a grade tem
  seis semanas, então ela inclui dias do mês seguinte.

Uma atividade remarcada de 29/08 para 01/09 por uma versão que ainda não
atualizava o rótulo ficou com prazo em setembro e rótulo de agosto. Ela
entrava na lista de agosto, era desenhada no dia 1 (que aparece cinza no
fim do calendário de agosto) e nunca entrava na lista de setembro.

Três correções:

- **O mês de uma atividade passa a ser o mês em que ela vence.** O rótulo
  só decide quando não há prazo (treinamento ainda não agendado). Rótulo
  errado deixa de esconder atividade, sem precisar consertar linha nenhuma.
- **Dia cinza não carrega mais atividade.** A sobra da semana que atravessa
  o mês mostra só o número do dia.
- **`corrigirCompetencias()`**: alinha `COMPETENCIA` e `SEMANA` ao prazo de
  cada atividade, em lote. Roda no botão **Atualizar dados** (que avisa
  quantas linhas corrigiu) e na rotina diária. O `ID` não muda — ele nomeia
  a pasta de anexos no Drive e já circulou por e-mail.

## 6 · Abas e busca continuavam invisíveis

A rodada anterior transformou as abas em pastilhas, mas com borda de 1px
translúcida (`--linha-forte`, 30% de opacidade) sobre um fundo quase
branco: na tela, continuavam parecendo texto. E as sub-abas tinham ganhado
de propósito um azul mais tênue "para não competir com a hierarquia" —
resultado: sumiram de novo. Hierarquia que custa a legibilidade não é
hierarquia, é decoração.

- Borda das pastilhas: **2px** numa cor própria (`--borda-aba`, azul da
  marca a 38%), com sombra suave. Texto em `--tinta`, não em cinza.
- Sub-abas usam a **mesma** pastilha cheia da aba principal, só meio grau
  menor. A ativa é azul cheio com texto branco, nos dois níveis.
- Busca: borda de **2px em azul vivo**, lupa maior, texto e placeholder com
  peso 500, sombra e anel de foco de 4px.

---

# Correção da correção — o `PRAZO` não é sempre texto

A rodada anterior fez o calendário decidir o mês pela **data do prazo**, e
não pelo rótulo `COMPETENCIA`. A ideia estava certa; a leitura do prazo,
não. O filtro era assim:

```js
const p = String(a.PRAZO || '').trim().slice(0, 7);
if (p && /^\d{4}-\d{2}$/.test(p)) return p === prefixoMes;
return normalizarCompetencia(a.COMPETENCIA) === competencia;  // desvio
```

Isso só funciona se a célula voltar como o texto `2026-09-01`. Medido:

| Como o `PRAZO` volta | `slice(0,7)` | Resultado |
|---|---|---|
| `'2026-09-01'` | `"2026-09"` | reconhecido |
| `'01/09/2026'` | `"01/09/2"` | **cai no rótulo** |
| `new Date(2026, 8, 1)` | `"Tue Sep"` | **cai no rótulo** |

E a célula **volta como `Date`** com frequência — o próprio arquivo já
sabia disso em outro ponto: `normalizarCompetencia` existe exatamente
porque uma célula de competência lida como data virava
`"Wed Jul 01 2026 00:00:00 GMT-0300"` no seletor de meses.

Então a atividade remarcada continuou classificada em agosto pelo rótulo
antigo — só que a outra mudança da mesma rodada (dia cinza não desenha
mais atividade) tirou o desenho dela do dia 1 no calendário de agosto.
Resultado: sumiu dos dois lados. Um defeito criado pela correção do
outro.

**Agora o filtro usa `paraData()`**, que é a função que o resto do sistema
já usa e entende os três formatos, e compara ano e mês como número:

```js
const p = paraData(a.PRAZO);
if (p && mesAlvo !== null) return (p.getFullYear() * 12 + p.getMonth()) === mesAlvo;
```

Conferido em teste com os três formatos: os três resolvem para 01/09/2026.

## E o conserto do que já está gravado

`corrigirCompetencias()` (que alinha `COMPETENCIA` e `SEMANA` ao prazo)
dependia de alguém clicar em **Atualizar dados**. Agora ela também entra
na migração automática: `VERSAO_ESQUEMA` subiu para **5.1**, então na
primeira abertura depois da atualização o `garantirEsquema` roda o
alinhamento sozinho. Ninguém precisa apertar nada.

## Verificação feita

- `node --check` em todos os `.gs` — sem erro.
- Identificadores duplicados entre arquivos — nenhum.
- `App.html` em `node:vm` — sintaxe válida.
- Teste da `paraData` com os três formatos de prazo — os três passam, e o
  método antigo falha em dois (tabela acima).

---

# Histórico dos meses e o mês de outubro vazio

## 7 · Outubro abriu com uma atividade só

Não foi nada removido — as rotinas de outubro **nunca foram geradas**.

O calendário materializa um mês a partir das ROTINAS na primeira vez que
alguém o abre. O teste que decidia isso era:

```js
const existeMes = cruas.some(a => normalizarCompetencia(a.COMPETENCIA) === competencia);
if (!existeMes) gerarCompetencia(competencia, ...);
```

Ou seja: *"existe QUALQUER atividade neste mês?"*. Havia uma **avulsa**
marcada para 01/10 — o mês respondeu que sim, se declarou pronto, e as
~35 rotinas nunca nasceram.

Avulsa é justamente o que o gerente acrescenta **por fora** das rotinas;
ela não pode responder por elas. O teste agora conta só atividade de
rotina (`TIPO` diferente de `AV`). Rodar a geração de novo é seguro:
`gerarCompetencia` pula todo ID que já existe, então no pior caso não faz
nada.

## 8 · Agosto sumiu na virada do mês

Por decisão de projeto, e não por perda de dado. Estava assim:

```js
// Blindagem: se pedirem um mes que ja passou, joga para o mes atual —
// mes vencido nao deve mais ser aberto.
```

E `competenciasExistentes` descartava do seletor tudo que tinha passado.
O objetivo era evitar que alguém caísse por engano num mês velho cheio de
"atrasadas". O preço foi alto demais: na virada do mês, agosto inteiro
sumia da navegação e não havia como consultar o que a operação entregou.
Os dados nunca saíram da tabela `ATIVIDADES` — era a navegação que os
escondia. Histórico e "mês errado aberto por engano" são dois problemas
diferentes; o segundo se resolve com um aviso na tela, não apagando o
primeiro.

Como ficou:

- Os meses vencidos **que têm atividade** voltam para a tira, à esquerda,
  com cadeado, em tom apagado e borda tracejada, separados por um traço
  dos meses em curso. Mês vazio do passado não entra — só poluiria.
- Abrir um mês encerrado mostra um aviso no topo dizendo que aquilo é a
  foto final. Cinza, não vermelho: é um estado, não um problema.
- **Mês encerrado nunca gera.** Sem essa guarda, abrir agosto em setembro
  criaria as rotinas de agosto do zero — atividades nascendo já
  atrasadas, num mês que ninguém pode mais cumprir.
- `+ Nova atividade` some no mês encerrado. `Encerrar mês passado` (que
  cancela o que ficou pendente) volta a ser alcançável — antes o botão
  existia mas o mês nunca abria.
- `mesPassado` deixou de ser calculado duas vezes: era a mesma regra
  escrita em dois lugares, e uma delas esperando divergir da outra.

## Verificação feita

- `node --check` em todos os `.gs`; identificadores duplicados: nenhum;
  `App.html` em `node:vm` — tudo válido.
- Teste da lógica nova com 01/09/2026 como "hoje":
  - encerrados de `[JUL, AGO, SET, OUT, NOV]` → `[JUL 2026, AGO 2026]`;
  - outubro com só uma avulsa → `existeMes` era `true` (bloqueava),
    agora é `false` (libera a geração);
  - AGO não gera, SET e OUT geram.
- Tira de meses e aviso renderizados no Chromium, nos dois temas.
