# CHANGELOG — GSL Bartofil

Uma entrada por alteração: **arquivo · o que mudou · por quê**.
Ordem de execução: CRÍTICO → MÉDIO → BAIXO, como pedido.
Nada foi apagado: onde havia dúvida, o caso foi para `PENDENCIAS.md`.

---

## CRÍTICO

### C1 · `Instalacao.gs` — a instalação nunca terminava
**Mudou:** uma linha, `esquecerProps()`, logo depois do `setProperties({ID_BANCO...})`.
**Por quê:** `prop()` guarda **todas** as propriedades na primeira leitura da
execução. A primeira linha de `instalar()` chama `bancoInstalado()` →
`prop('ID_BANCO')` — e nesse instante a cópia guardada é a de um script sem
banco. As propriedades são gravadas em seguida, mas a cópia em memória
continua vazia: `semearPerfis()` chamava `abrirBanco()`, lia `ID_BANCO = ''`
e estourava **"O banco ainda nao foi instalado"** — com o banco recém-criado
no Drive. Este defeito não estava na minha lista inicial: apareceu quando
rodei a instalação num banco de ensaio (ver RELATORIO.md, "como validei").

### C2 · `Instalacao.gs` + `Dados.gs` — categorias com e sem acento
**Mudou:** `calcularAgregado_()` passou a comparar categoria por
`catN_()` (sem acento, caixa alta) em vez de `cat === 'Presença'`.
Novo helper `catN_()` ao lado de `norm_()`.
**Por quê:** `semearDePara()` grava `Presenca`, `Ferias`, `Licenca legal`
(sem acento); `calcularAgregado_()` comparava com acento. As três
comparações eram sempre falsas → `TRABALHADOS = 0` para todo colaborador →
assiduidade individual **0%**, taxa por turno **100%**, ranking sem sentido,
FERIAS/FOLGAS/LICENCAS zerados. Medido no ensaio: antes `TRABALHADOS=0` e
`ASSIDUIDADE=0%`; depois `18` e `90%` para a mesma folha.

### C3 · `Dados.gs` — filtro de período apontava para categorias inexistentes
**Mudou:** o mapa fixo (`FALTA_INJUST → 'Falta injustificada'` etc.) virou
`categoriasDoTipo_()`, que compara de forma canônica e trata cada chave
antiga como uma **família** de categorias. Nova `categoriasDeAusencia_()`,
exposta em `dadosAssiduidade().categorias`.
**Por quê:** nenhuma das strings do mapa existe no DE-PARA. Qualquer filtro
diferente de "Todas" devolvia lista vazia. Ensaio: `FALTA_INJUST` dava
**0 registros** antes, **5** agora.

### C4 · `App.html` — seletor "Tipo" do Período montado a partir dos dados
**Mudou:** as seis opções fixas viraram `TODAS` + as categorias que o
DE-PARA realmente marca como ausência.
**Por quê:** a tela oferecia cinco filtros, quatro deles impossíveis de
satisfazer. Agora ela só oferece o que existe na base.

### C5 · `BI.gs` — `BI_FALTAS` com o mesmo defeito
**Mudou:** a lista fixa saiu; entraram `biCat()` e `biEhFalta()` (qualquer
categoria cuja forma canônica comece com `FALTA`).
**Por quê:** `biCusto().diasFalta` e `biReincidencia().injustificadas` eram
sempre 0. Ensaio: `diasFalta` 0 → 5. O campo `faltas` foi acrescentado ao
retorno; `injustificadas` continua lá para não quebrar a tela, e a coluna
passou a se chamar "Faltas" (era "Injustif.", que descrevia outra coisa).

### C6 · `BI.gs` — cruzamento lia STATUS cru
**Mudou:** `biCruzamento()` deriva o status com `statusDe()` — a mesma
função do Calendário — e recebe o `corte` para analisar a **mesma janela**
de meses da assiduidade ao lado.
**Por quê:** o status do sistema é derivado, nunca digitado; a coluna
STATUS só recebe valor em algumas gravações e nunca muda sozinha quando o
prazo vence. A aba Análise mostrava 0 atrasadas enquanto o Calendário
mostrava 12. Além disso, a coluna da esquerda falava de N meses e a da
direita, de todo o histórico.

### C7 · `Arquivos.gs` + `Calendario.gs` — coluna ANEXOS com dois formatos
**Mudou:** `idsDeAnexos()` passa cada item por `idDoArquivoDrive()`, que
extrai o ID de uma URL do Drive; nova `urlDeAnexo()`, usada por
`hidratar().anexoUrl`. `descreverArquivo()` passou a devolver sempre a
mesma forma (`url` e `quebrado` inclusive).
**Por quê:** `anexarArquivo()` grava IDs; `acaoFinalizarEntrega()` grava uma
URL. Uma URL virava "1 anexo" e `listarAnexos()` fazia
`getFileById('https://...')` → "(arquivo removido do Drive)" para uma
entrega que estava lá. E o retorno de `listarAnexos` tinha forma diferente
no sucesso e no erro.

### C8 · `App.html` — cada clique rebuscava todas as telas
**Mudou:** o `setTimeout` no fim de `agir()` (que fazia `esquecerTelas()` e
prebuscava todas as telas) foi removido. Entrou `envelhecerTelas()`: as
outras telas continuam no cache do navegador, marcadas como velhas, e
revalidam sozinhas **quando a pessoa abrir**.
**Por quê:** aprovar uma atividade custava 8 idas ao servidor (1 da ação +
1 da tela + 6 da prebusca), ~12 a 20 s de fila, e o próximo clique entrava
atrás. Agora custa 2.

### C9 · `App.html` — o login prendia a fila
**Mudou:** `prebuscar(r.telas)` saiu do login. Nasceu `prebuscarModulo()`,
disparada 2,5 s depois de a pessoa **entrar num módulo**, só com as telas
daquele módulo, uma de cada vez, parando se a pessoa trocar de módulo.
Novo contador `pedidosDoUsuario` + `filaLivre()`: a prebusca só anda com a
fila do usuário vazia.
**Por quê:** o Apps Script atende uma chamada por vez para a mesma pessoa.
Sete chamadas de prebusca logo depois do login faziam qualquer clique dos
primeiros ~15 s esperar por elas. O app abria rápido e travava em seguida.

### C10 · `Banco.gs` — escrita em lote (`inserirVarios` / `atualizarVarios`)
**Mudou:** duas funções novas que fazem, com **uma leitura e uma escrita**,
o que antes era um `inserir()`/`atualizar()` por registro. `atualizarVarios`
monta um índice ID → linha uma única vez.
**Por quê:** cada `inserir()` custa trava + leitura de cabeçalho + escrita +
troca de geração + log — umas seis idas ao Google. Dentro de laço isso
virava centenas.

### C11 · `Calendario.gs` / `Dados.gs` / `Instalacao.gs` — os três laços de escrita
**Mudou:**
- `acaoCancelarCompetencia`: filtra cru, hidrata só o mês, grava com
  `atualizarVarios` (**228 → 5** chamadas);
- `acaoImportarCompetencia`: colaboradores novos num `inserirVarios`, os
  que mudaram num `atualizarVarios`, e **quem não mudou nem é tocado**
  (**333 → 23** com 60 colaboradores);
- `semearPerfis/Rotinas/DePara/Setores/Parametros` e as chaves novas de
  `garantirEsquema`: um `inserirVarios` por tabela (**383 → 52** na
  instalação);
- `acaoRestaurarPerfis`: uma leitura e duas escritas no total.
**Por quê:** a importação com ~200 pessoas era candidata direta a estourar
o limite de 6 minutos de execução.

### C12 · `Banco.gs` — `gerarId()` colidia dentro do lote
**Mudou:** o sufixo aleatório ganhou um contador de execução (`_seqId`).
**Por quê:** gravando 200 colaboradores no mesmo milissegundo, a chance de
dois IDs iguais passava de 40% (46.656 sufixos possíveis). Sem isso, a
escrita em lote do C11 introduziria um defeito novo.

### C13 · `Banco.gs` — toda gravação aposentava o cache de tudo
**Mudou:** a chave do cache de tabela passou de `tb|<geração global>|` para
`tb|<geração da tabela>|` (`geracaoTabela()`, propriedade `GER_TB_<tabela>`).
`limparCache()` avança **só** a geração da tabela que mudou, mais a geração
global (que aposenta as telas), e faz isso numa **única** escrita de
propriedades.
**Por quê:** o comentário no arquivo dizia que a geração só avançava quando
a gravação mexia em algo visível; o código avançava para qualquer tabela
exceto LOG. Salvar um setor jogava fora a cópia de FATO_ASSIDUIDADE (5 mil
linhas), AGR_COLAB, ATIVIDADES e PERFIS.

### C14 · `appsscript.json` — `oauthScopes` removido
**Mudou:** o bloco `oauthScopes` com os 7 escopos foi retirado; o resto do
manifesto está intacto.
**Por quê:** regra inviolável do dono do projeto — com a lista, o envio de
e-mail quebra por conflito de escopo. O manifesto sem ela é a única versão
que funciona neste ambiente.

### C15 · `Estilo.html` + `Emails.gs` — vermelho eliminado
**Mudou:**
- `--alerta: #D71920` → `#A87A00` (âmbar da marca escurecido);
  novos `--alerta-forte` e `--alerta-tenue`; `--vermelho` e
  `--vermelho-tenue` viram apelidos (as classes se chamam `vermelho` em
  dezenas de lugares no App.html — o nome ficou, a cor mudou);
- tema escuro: `--alerta: #FFC43D`, `--alerta-forte: #E0A200`;
- `#DC2626`, `#991B1B`, `#9A1218`, `#FCE9EA`, `#FDE8E8` e todos os
  `rgba(215,25,32,·)` substituídos;
- pílulas, botão "perigo", recado de erro e tela de falha ganharam âmbar
  **fixo** (`#8A6A00` / `#5C4600`), porque têm texto branco por cima e não
  podem seguir um token que clareia no tema escuro;
- `.kpi.vermelho` deixou de parear com `--neon-rosa` (rosa + âmbar
  brigavam) e passou a parear com `--neon-ambar`;
- `Emails.gs`: `COR_ALERTA` `#D71920` → `#8A6A00`, e a caixa de motivo de
  reprovação `#FDE8E8` → `#FFF3CC`.
**Por quê:** regra inviolável — não existe vermelho na marca Bartofil, nem
para alerta de erro. O vermelho aparecia na tela **e** em todo e-mail que o
sistema mandava. Conferido por teste automático e por captura das duas
telas.

### C16 · `Codigo.gs` — `diagnostico()` quebrado
**Mudou:** `carregarTela(t.id, {})` → `carregarTela(u.email, t.id, {})`.
**Por quê:** a assinatura virou `(email, idTela, params)`; o id de tela
entrava como e-mail e a função morria em
`Tela desconhecida: [object Object]`. A própria medição do projeto não
rodava.

### C17 · `Calendario.gs` — `acaoValidar` estourava com ID inexistente
**Mudou:** lê `obter()` **uma** vez, valida o nulo com mensagem clara, e
reaproveita o registro. Eram até quatro `obter()`, dois deles na mesma
expressão, sem checagem.
**Por quê:** ID inválido virava `Cannot read properties of null (reading
'PRAZO')` em vez de "Atividade nao encontrada".

---

## MÉDIO

### M1 · `Calendario.gs` / `Entrega.gs` — releitura completa depois de gravar
**Mudou:** novo helper `comCampos_(registro, campos)`. `acaoValidar`,
`acaoEntregar`, `acaoDefinirSetor`, `acaoRemarcar`, `acaoCancelarAtividade`,
`acaoAgendarTreinamento`, `acaoCriarAtividade` e `acaoFinalizarEntrega`
montam o registro atualizado em memória em vez de reler.
**Por quê:** `atualizar()` → `limparCache()` → `esquecerLeituras()`. O
`obter()` seguinte relia a aba ATIVIDADES **inteira** só para montar um
e-mail: uma leitura completa da tabela por clique de botão.

### M2 · `Calendario.gs` — `acaoRemarcar` não recalculava o status
**Mudou:** a remarcação passou a gravar `STATUS: statusDe(nova, ...)`.
**Por quê:** remarcar uma atividade atrasada para daqui a 20 dias deixava a
linha gravada como "Atrasada". (Na tela o status é derivado e aparecia
certo — mas quem lê a coluna, como o `biCruzamento` antigo, via errado.)

### M3 · `Datas.gs` — datas paravam de custar chamada de serviço
**Mudou:** `fuso()`, `hoje()` e `hojeISO()` memoizados por execução; novos
`hojeNum()` e `diaNumISO()`; `paraISO()` e `formatarData()` passaram a ler
ano/mês/dia direto do objeto Date em vez de chamar `Utilities.formatDate`;
`esquecerFuso()` derruba a memória quando alguém grava o fuso.
**Por quê:** `hidratar()` chamava `hoje()` duas vezes por linha e
`statusDe()` mais uma; `gerarInsights()` refazia `diaNum(paraData(...))`
dentro de ~10 filtros sobre a mesma lista. Com 200 atividades eram ~1.000
`formatDate` por abertura da Central, todos recalculando o mesmo dia. E
`fuso()`, sem `TZ_OK` gravado, abria a planilha a **cada** chamada.

### M4 · `Calendario.gs` — `hidratar()` enxuta
**Mudou:** `coordenadorDaLinha(r)` chamado uma vez (era duas); o número do
dia do prazo viaja junto (`prazoNum`).
**Por quê:** roda uma vez por linha da tabela. `Central.gs` e `Emails.gs`
foram atualizados para usar `a.prazoNum` e `hojeNum()`.

### M5 · `Calendario.gs` — a tela hidratava a tabela duas vezes
**Mudou:** `atividadesCanceladas()` ganhou o parâmetro `jaHidratadas` e
`dadosCalendario` passa a lista que já montou.
**Por quê:** ela fazia `listar('ATIVIDADES').map(hidratar)` de novo,
hidratando **todos os meses** para pescar as canceladas de um.

### M6 · `Dados.gs` — competência do RH comparada crua
**Mudou:** `dadosAssiduidade`, `dadosRanking`, `acaoImportarCompetencia`,
`acaoPreviewImportacao` e `acaoReclassificar` passaram a normalizar os dois
lados com `normalizarCompetenciaRH_()`; a gravação de FATO, AGR_COLAB e
PAINEL usa a competência normalizada.
**Por quê:** a função existe justamente porque `2026-08` pode ter virado
`Date` na planilha. Quando virava, a tela dizia "competência sem dados
importados" com o painel gravado ali do lado — e objetos `Date` se
espalhavam pela FATO.

### M7 · `Dados.gs` — `substituirLote_` reabria o banco
**Mudou:** `SpreadsheetApp.openById(PropertiesService...)` → `abaDe(nome)`.
**Por quê:** 2 chamadas extras por lote, 4 por importação, e furava a regra
de arquitetura "só o Banco.gs conhece SpreadsheetApp".

### M8 · `Instalacao.gs` / `Emails.gs` — estado dos gatilhos em cache
**Mudou:** `estadoInstalacao()` guarda o resultado de
`ScriptApp.getProjectTriggers()` por 10 min; `instalarGatilhos()` e
`removerGatilhos()` chamam `esquecerEstadoGatilhos()` para o selo acender
na hora.
**Por quê:** rodava no bootstrap, no `dadosConfig` **e** no `dadosAcessos` —
três idas ao ScriptApp por sessão para algo que muda quando alguém aperta
um botão.

### M9 · `Estilo.html` — o céu do tema inativo parou de animar
**Mudou:** dois blocos novos que aplicam `animation-play-state: paused`,
`will-change: auto` e `content-visibility: hidden` nas camadas do tema que
não está em uso.
**Por quê:** `opacity: 0` esconde, **não** para a animação. No tema claro,
as 12 partículas, as 2 camadas de estrelas (uma com `drop-shadow`) e as 3
nebulosas com `blur(80px)` continuavam sendo compostas em todo quadro —
invisíveis. O navegador mantinha a textura de GPU de uma nebulosa de 700px
desfocada por nada.

### M10 · `App.html` — tema claro é o padrão
**Mudou:** `iniciar()` aplica `'claro'` em vez de seguir
`prefers-color-scheme`.
**Por quê:** pedido do dono ("tema visual claro"). Quem tinha o celular no
modo escuro entrava num app escuro sem nunca ter pedido. O botão do topo e
a preferência gravada no servidor continuam mandando.

### M11 · `Entrega.gs` — `acaoReceberParte` aceitava qualquer pasta do Drive
**Mudou:** nova `dentroDoTemporario_()`; a ação só grava em pasta filha de
`Anexos/_TEMPORARIO`.
**Por quê:** qualquer pessoa identificada no app podia mandar arquivo para
qualquer pasta a que o dono do script tem acesso.

### M12 · `Calendario.gs` — o e-mail não derruba mais a entrega gravada
**Mudou:** `acaoEntregar` envolve `avisarEntregaRecebida` em try/catch e
devolve `avisoEmail` no lugar de estourar; mesma coisa em
`acaoAgendarTreinamento`.
**Por quê:** `enviar()` passou a lançar exceção quando o e-mail falha
(mudança deliberada, comentada no Emails.gs). Só que a atividade já estava
carimbada como entregue: a pessoa via erro e reenviava o arquivo. A rota de
entrega em PDF já se protegia assim — as duas agora se comportam igual.

### M13 · `Config.gs` + `App.html` — o DE-PARA voltou para a tela
**Mudou:** `dadosConfig` devolve `dePara` e `categorias`
(`categoriasConhecidas_()`, com `CATEGORIAS_PADRAO`); a Configuração ganhou
um cartão "DE-PARA" com tabela, editar/remover, "Novo código", "Códigos sem
tradução" e "Reclassificar a base"; o cartão de Rotinas ganhou "Nova
rotina", coluna Ativa e "Remover".
**Por quê:** as ações `salvarDePara`, `excluirDePara`, `codigosPendentes`,
`reclassificar` e `excluirRotina` existiam no catálogo, com permissão
declarada, e **não tinham um único botão**. A tabela que decide o que conta
como ausência em todo o BI — a mesma que causou o C2 — só podia ser
corrigida abrindo a planilha na mão. A categoria virou um `<select>` para
que grafia divergente não volte a acontecer.

### M14 · `App.html` — `formRotina()` sem id
**Mudou:** abre em branco quando chamada sem id.
**Por quê:** o botão "Nova rotina" (M13) a chamaria sem id e ela estouraria
em `t.tipo` de `undefined`.

### M15 · `App.html` — a lista de anexos voltou a ser alcançável
**Mudou:** a janela da atividade renderiza `#lista-anexos` quando há anexo,
e chama `carregarAnexos(a.id, p.entregar)` depois de abrir. Cada anexo
ganhou também um link "Abrir" quando o Drive devolve a URL.
**Por quê:** `carregarAnexos()` existia e **nunca** era chamada, e o
elemento que ela procurava tinha saído da janela. Com isso as ações
`detalhesAtividade` e `removerAnexo` e a função `baixar()` ficaram
inalcançáveis: quem anexou arquivo avulso não conseguia ver nem remover.

### M16 · `Auth.gs` — `autocadastrar` limpava o cache duas vezes
**Mudou:** o `limparCache('ACESSOS')` redundante saiu (`inserir` já chama).
**Por quê:** duas trocas de geração seguidas por cadastro novo.

### M17 · `Banco.gs` — três economias pequenas e certas
**Mudou:** `registrarLog` abre a aba LOG uma vez (era duas na mesma linha);
`excluir()` faz uma escrita de linha em vez de duas de célula (e agora
carimba `ATUALIZADO_EM`); `listar()` memoiza também o resultado vazio.
**Por quê:** tabela vazia fazia toda chamada seguinte reabrir a aba só para
redescobrir que não há nada (acontece o tempo todo em ARQUIVOS_RH e PAINEL).

### M18 · `Banco.gs` — `esquecerLeituras()` derruba `_equipeMemo`
**Por quê:** se a EQUIPE fosse gravada e relida na mesma requisição, o mapa
turno → coordenador continuava valendo o de antes da gravação.

---

## BAIXO

### B1 · `Index.html` — `</div>` sobrando (linha 37). Estrutura agora balanceada (65/65).
### B2 · `Config.gs` + `App.html` — os parâmetros `APRESENTACAO_*` saíram do cartão genérico de Parâmetros (já têm cartão próprio; apareciam duas vezes e editar num não atualizava o outro). `valorPar()` passou a olhar `parametrosTodos`.
### B3 · `Dados.gs` / `BI.gs` — `ymd_`, `br_`, `agoraTextoDados_`, `normalizarCompetenciaRH_` e as duas formatações do BI trocaram `'America/Bahia'` fixo por `fuso()`. Eram duas fontes de verdade para a mesma coisa, e a fixa não acompanharia um "Corrigir fuso".
### B4 · `App.html` — `janelaAutorizarEmail(msg)` passou a declarar e mostrar a mensagem que já recebia e ignorava.
### B5 · `App.html` — `agir()` guarda `innerHTML` do botão, não `textContent`: botões com ícone voltavam sem ele depois da ação.
### B6 · `App.html` — a mensagem de erro da importação citava a aba `CONVERTER DADOS`; o padrão do sistema, o LEIA-ME e o formulário dizem `FOLHA DE PONTO`.
### B7 · `Calendario.gs` — `garantirCompetencia()` ficou com um comentário explicando que não é mais chamada, por que, e o que observar se voltar a ser. **Não foi removida** (ver PENDENCIAS).
### B8 · `Arquivos.gs` — `listarAnexos()` devolve a mesma forma no sucesso e no erro (`url` e `quebrado` sempre presentes).

---

## Desempenho — antes/depois em chamadas de serviço do Google

Medido rodando o **mesmo cenário** nas duas versões, com os serviços do
Google instrumentados (`_teste/medir.js`). A conta soma leituras de faixa,
escritas, acessos a `PropertiesService`, travas, aberturas de planilha e
consultas de gatilho. **Não** conta acertos no `CacheService`, que são
ordens de grandeza mais baratos.

| Cenário | Antes | Depois | Ganho |
|---|---:|---:|---:|
| Instalar (criar banco + sementes) | 383 | 52 | **−86%** |
| Encerrar o mês (cancelar as pendentes) | 228 | 5 | **−98%** |
| Importar a folha (60 colaboradores, 1.200 lançamentos) | 333 | 23 | **−93%** |
| Salvar um setor e reabrir o BI | 10 | 8 | −20% |
| Gerar o mês (rotinas → atividades) | 6 | 5 | −17% |
| Abrir Configuração | 7 | 6 | −14% |
| Validar uma atividade (ação + e-mail) | 9 | 8 | −11% |
| Abrir Calendário (sem cache de tela) | 3 | 3 | igual |
| Abrir Assiduidade (painel gravado) | 2 | 2 | igual |

Duas leituras importantes desta tabela:

**"Igual" não quer dizer "sem ganho".** Abrir o Calendário já custava 3
leituras; o ganho ali é de **processamento** (a tabela deixou de ser
hidratada duas vezes, e ~1.000 `Utilities.formatDate` viraram zero) e,
principalmente, de **idas do navegador ao servidor** — que a tabela acima
não mede porque acontecem no cliente:

| Ação no navegador | Antes | Depois |
|---|---:|---:|
| Entrar no sistema | 1 + **7 de prebusca** enfileiradas | 1 |
| Entrar num módulo | 1 | 1 (+ prebusca só daquele módulo, cedendo a vez) |
| Aprovar / reprovar / cancelar | **8** (ação + tela + 6 de prebusca) | **2** |
| Voltar para uma tela já vista | 1 | 0 (pinta do cache) ou 1 em segundo plano |

**Os três maiores ganhos são os três laços de escrita.** A importação da
folha com 200 colaboradores era a operação com risco real de estourar o
limite de 6 minutos do Apps Script; com 60 pessoas ela caiu de 333 para 23
chamadas, e o custo agora cresce com o número de *mudanças*, não com o
número de pessoas.

---
---

# RODADA 2 — planilha real e animações

## Assiduidade — o ETL agora reproduz a sua GSL-DADOS

### R1 · `Instalacao.gs` — DE-PARA reescrito com a tabela real
**Mudou:** `semearDePara()` passou de 34 para 41 códigos, transcritos da
legenda da FOLHA DE PONTO e conferidos contra a aba DE-PARA da sua
GSL-DADOS. Categorias com acento, como você escreve.
**Por quê:** a minha versão era uma aproximação e errava em nove códigos
(5, 6, 16, 18, 19, 23, 24, 26, 401, 003), não tinha três (00, 28, 29) e
não conhecia os não-códigos que aparecem na grade (`-`, `PP`,
`SISTEMA INTRANET`). Cada erro desses vira número errado no painel.

### R1b · `Instalacao.gs` + `Codigo.gs` + `App.html` — botão "Restaurar tabela padrão"
**Mudou:** a tabela virou `dePARAPadrao()`, reaproveitada por
`semearDePara()` e pela nova ação `acaoRestaurarDePara`, com botão no
cartão DE-PARA da Configuração. Ela corrige os códigos que divergem do
padrão, cria os que faltam e **não apaga** nada que você tenha
acrescentado.
**Por quê:** a semente só roda com a tabela vazia — de propósito, porque
as suas edições valem mais que a minha tabela. Só que o seu banco já tem
o DE-PARA errado gravado, e ele nunca sairia de lá sozinho: sem este
botão, a correção R1 simplesmente não chegaria a você.
**Conferido:** montei um banco como a versão anterior deixaria (15
códigos com categoria errada, 6 ausentes), importei a folha real —
taxa 4,1% e 28 faltas injustificadas — e rodei Restaurar + Reclassificar:
**4,4% e 21**, os números da sua planilha.

### R2 · `Dados.gs` — `IGNORAR` deixou de ser comparado em caixa alta
**Mudou:** `catN_(t.cat) === 'IGNORAR'` no lugar de `t.cat === 'IGNORAR'`.
O mesmo em `acaoPreviewImportacao` e `acaoCodigosPendentes`, para
`'A CONFIRMAR'`.
**Por quê:** o DE-PARA guarda `Ignorar`, o código comparava com `IGNORAR`.
**173 células** de traço, marcação interna e anotação em texto entravam
na base como lançamento e empurravam a taxa de absenteísmo para baixo.

### R3 · `Dados.gs` + `Instalacao.gs` — os cinco colaboradores perdidos
**Mudou:** duas coisas. O parâmetro `RH_CORTAR_LINHAS` passou a
`HORAS TRABALHADAS` (igual à sua CONFIG), e o teste passou a olhar **só
as colunas de matrícula, nome e turno** — nunca a linha inteira.
**Por quê:** o RH escreve anotações (`QUNT TUR ADM`) nas colunas 37 e 39,
muito à direita da grade. A palavra batia com o filtro e derrubava a
linha. VALDY, VINICIUS, WELLINGTON, STEPHANIE e RENATO sumiam do sistema
sem aviso. Olhar só a identificação é ao mesmo tempo mais certeiro e à
prova desse tipo de acidente.

### R4 · `Dados.gs` — denominadores alinhados com a sua planilha
**Mudou:** `calcularAgregado_` reescrita.
- assiduidade = **(registros − ausências) ÷ registros**
- % do turno = **ausências do turno ÷ registros do turno**
- `acaoRanking` idem
**Por quê:** eram `trabalhados + ausências`. Quem teve férias, folga ou
licença saía com denominador menor que o real, e a média do turno no
Ranking não batia com a mesma média na tela de Assiduidade.

### R5 · `Dados.gs` — `substituirLote_` grava por nome de coluna
**Mudou:** passou a receber uma lista de **objetos** com as chaves iguais
aos nomes das colunas e casar pelo cabeçalho real da aba. A função
formatadora posicional foi embora.
**Por quê:** era um array casado na mão com o cabeçalho. Acrescentar uma
coluna ao esquema faria todos os valores deslizarem de coluna em
silêncio. (E eu precisava acrescentar três — ver R6.)

### R6 · `Instalacao.gs` + `Dados.gs` + `App.html` — as três famílias de falta
**Mudou:** `AGR_COLAB` ganhou `FALTAS_INJ`, `FALTAS_JUST` e
`FALTAS_DISC` (`VERSAO_ESQUEMA` para 4.3, a migração cria sozinha);
os KPIs trazem a quebra; o cartão "Faltas" virou **"Faltas
injustificadas"** com as outras duas na legenda.
**Por quê:** está escrito no seu próprio DE-PARA — *"no painel elas nunca
se somam num balde só"*. Faltar sem avisar, faltar com justificativa
aceita e cumprir suspensão são três coisas diferentes.

### R7 · `Dados.gs` — aviso sobre os blocos de cabeçalho
**Mudou:** `detectar_` conta os blocos de cabeçalho e confere se todos
têm as datas nas mesmas colunas; a pré-visualização avisa.
**Por quê:** a folha tem **sete** (um por turno). A leitura usa as
colunas do primeiro para tudo. Hoje funciona porque são idênticos — mas
funcionava por sorte, sem ninguém conferir.

### Conferência contra a GSL-DADOS · competência 2026-08

Rodei o código de produção contra a sua folha real e comparei com o que a
sua planilha calcula:

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
| Pessoas com alguma ausência | 59 | 59 |

E por turno, também exato:

| Turno | Pessoas | Registros | Presenças | Ausências | F. injust. | Atestados |
|---|---:|---:|---:|---:|---:|---:|
| ADM | 40 / 40 | 538 / 538 | 473 / 473 | 3 / 3 | 0 / 0 | 3 / 3 |
| A | 104 / 104 | 1610 / 1610 | 1415 / 1415 | 83 / 83 | 4 / 4 | 77 / 77 |
| B | 113 / 113 | 1519 / 1519 | 1294 / 1294 | 77 / 77 | 6 / 6 | 67 / 67 |

**34 conferências, 0 divergências.** COLABORADORES com as 357 matrículas
da folha, AGR_COLAB com as 341 que tiveram lançamento, e nenhum código
pendente.

---

## Animações

### R8 · `App.html` + `Estilo.html` — a entrada deixou de rodar duas vezes
**Mudou:** `pintar(idTela, r, silencioso)`. A repintura de fundo da
revalidação — e a volta para uma tela que já estava desenhada — recebem
a classe `.sem-entrada`, que desliga a animação de entrada.
**Por quê:** **este é o "delay" que você viu.** Cada repintura reescrevia
o HTML da página e toda a entrada elástica dos cartões rodava de novo,
com escalonamento de até 0,3 s. O conteúdo aparecia, assentava, e meio
segundo depois deslizava outra vez. Não era demora — era animação
repetida.

### R9 · `App.html` + `Estilo.html` — MODO LEVE, ligado sozinho
**Mudou:** `medirFluidez()` conta os quadros por ~1 s depois de abrir. Se
o navegador não estiver entregando quadros de sobra (< 45/s), liga o modo
leve e guarda a decisão neste computador. Atalhos antes de medir:
`prefers-reduced-motion`, ou máquina declarando ≤ 2 núcleos / ≤ 2 GB.
No modo leve o céu para, os desfoques de fundo saem e os cartões não
entram deslizando — **cores, vidro, sombras e layout continuam iguais**.
**Por quê:** medido com compositor por software (PC de escritório com
driver antigo, GPU bloqueada ou acesso remoto), o fundo animado derruba a
página para **15–18 quadros/s**; parado, dá **61**. E dá o mesmo número
com uma camada ou com doze — o custo é a página nunca parar de repintar
a tela inteira, não a quantidade de camadas. Não existe meio-termo útil,
então a decisão é binária mesmo.

### R10 · `Index.html` + `Estilo.html` — botão do modo leve no topo
**Mudou:** um botão ⚡ ao lado do de tema. Cinza = desligado, amarelo da
marca = ligado. Também há um botão com explicação no cartão Sistema da
Configuração.
**Por quê:** quem sente a lentidão é o coordenador — e o perfil dele não
tem acesso à Configuração. Deixar o interruptor só lá seria deixá-lo fora
do alcance de quem precisa.

### R11 · `Estilo.html` — desfoque de fundo só onde ele aparece
**Mudou:** `backdrop-filter` saiu da `.lateral` no tema claro (fica só no
escuro), e sai de tudo no modo leve.
**Por quê:** no tema claro o fundo da lateral é um gradiente **opaco** —
o navegador desfocava uma coluna de 244 px de altura inteira, a cada
quadro, com o céu animando por trás, para um resultado que ninguém via.

### R12 · `Estilo.html` — céu mais barato
**Mudou:** a `.aurora` (a maior camada: 180% da viewport) perdeu o
`scale` da animação e ficou só com translação; as duas ondas perderam o
`scaleY`; `will-change` saiu das 12 partículas e das 6 bolhas.
**Por quê:** escalar obriga o compositor a reamostrar a textura a cada
quadro; transladar ele resolve deslizando a que já existe. E dezenas de
`will-change` criam dezenas de texturas de GPU, que numa máquina modesta
atrapalham mais do que ajudam.

### R13 · `App.html` + `Estilo.html` — aba escondida congela o céu
**Mudou:** `visibilitychange` põe `.aba-oculta` no `<html>`, que pausa as
animações do céu.
**Por quê:** o app fica aberto o dia inteiro numa aba de fundo. O
navegador reduz os quadros, mas não para as animações — era consumo de
CPU e bateria desenhando um fundo que ninguém está vendo.

### Medição — quadros por segundo, compositor por software

| Situação | Antes | Depois | Depois + modo leve |
|---|---:|---:|---:|
| CPU sem freio | 15 | 18 | **61** |
| CPU 6× mais lenta | 12 | 14 | **61** |

O ganho real não está na coluna do meio: está no fato de a máquina fraca
agora **ser reconhecida** e receber a versão que roda a 61 quadros, sem
perder a identidade visual.

---
---

# RODADA 3 — acessos, continuidade e faxina

## Login e acessos

### T1 · Uma tela só para pessoas (`Auth.gs`, `Codigo.gs`, `Config.gs`, `App.html`)
**Mudou:** as duas telas viraram uma — **Pessoas e acessos**, com duas
abas (Pessoas · Níveis de acesso). O cartão "Equipe" saiu da
Configuração; "Nova pessoa" e "Novo usuário" viraram um botão só,
**Cadastrar pessoa**.
**Por quê:** eram as MESMAS pessoas em dois cadastros que não
conversavam. Na sua tela dava para ver o efeito: o **Gerente** aparecia
na Equipe com acesso **COORDENADOR**. Dois registros da mesma pessoa
discordando, e nada avisava.

### T2 · ACESSOS virou o cadastro único (`Instalacao.gs`)
**Mudou:** a tabela ganhou `PAPEL`, `SITUACAO`, `PEDIDO_EM`,
`DECIDIDO_EM`, `DECIDIDO_POR` e `OBSERVACAO`. `VERSAO_ESQUEMA` foi para
5.0 e uma migração traz a EQUIPE para dentro de ACESSOS, casando por
e-mail: quem já tinha acesso recebe papel e turno; quem só estava na
Equipe entra como **PENDENTE**, porque nunca teve nível definido.
**A aba EQUIPE continua no banco, intacta** — nada foi apagado.
**Conferido:** montei o cenário antigo (Equipe com 3 pessoas, Acessos com
a mesma Ana em nível divergente) e rodei a migração: ninguém se perdeu,
Ana ganhou papel e turno sem perder o nível, e a migração não roda duas
vezes.

### T3 · Pedir → autorizar → liberar (`Auth.gs`, `Emails.gs`, `Index.html`)
**Mudou:** o fluxo agora é explícito.
1. A pessoa informa o e-mail. Se não tem cadastro, a tela abre o
   **formulário de pedido** (nome, função, turno, observação).
2. A gerência recebe o pedido **por e-mail** e vê o card no topo de
   Pessoas, com **Aprovar** (escolhendo nível e turno ali mesmo) ou
   **Recusar** (com motivo).
3. A pessoa recebe a resposta por e-mail.
**Por quê:** antes, quem digitasse um e-mail desconhecido era cadastrado
**em silêncio** como PENDENTE e caía numa tela de espera sem ter pedido
nada — e o administrador não era avisado de nada. O pedido dormia na fila
até alguém abrir a tela por acaso.
**Também:** o convite direto continua existindo (**Cadastrar pessoa**),
para quem você já conhece — essa pessoa entra sem precisar pedir.

### T4 · Quem é "a gestão" deixou de depender de texto livre (`Emails.gs`)
**Mudou:** `emailsDaGestao()` passou a olhar o **nível de acesso** (ADMIN,
GERENTE), não só a palavra "gerente" no campo de função.
**Por quê:** dependia de alguém ter escrito exatamente "GERENTE" ou
"ADMINISTRADOR" no papel. Escreveu "Gerência"? Deixou em branco? Os
avisos da gestão não saíam para ninguém, sem erro nenhum.

### T5 · O nome, e não o começo do e-mail (`Auth.gs`, `App.html`)
**Mudou:** o nome virou obrigatório no pedido e no cadastro; o rodapé usa
nome → função → e-mail nessa ordem, e o último recurso formata direito
("hercullito123" → "Hercullito").
**Por quê:** o rodapé mostrava `hercullito123`.

## Assiduidade

### T6 · A aba Colaborador não carregava — e o motivo era o limite do Sheets
**Mudou:** o payload do painel **não leva mais a lista de colaboradores**.
Ela vem do `AGR_COLAB`, sob demanda, pela ação `colaboradores`.
**Por quê:** o painel é gravado numa **única célula**, e uma célula do
Google Sheets aceita **50.000 caracteres**. Com 341 pessoas o payload
dava **96.681** — a lista sozinha era 91.768 deles. A gravação falhava ou
vinha truncada, `rhColaboradores` quebrava no meio da montagem, e como o
erro não era tratado a tela ficava com o conteúdo da aba anterior: a aba
"trocava" e nada mudava. **Medido: 96.681 → 5.242 caracteres.**
Cada aba passou a montar dentro de um `try`, então um erro vira mensagem
em vez de tela congelada.

### T7 · A tela de Ranking deixou de existir
**Mudou:** os quadros dela (assiduidade média por turno, maior
assiduidade, merecem atenção, mais atestados, mais faltas injustificadas)
foram para a aba **Colaboradores**, junto da lista individual — que ganhou
busca por nome ou matrícula.
**Por quê:** era a mesma informação em dois lugares, como você observou.

### T8 · A aba Análise saiu; o que ela tinha de útil ficou
**Mudou:** a aba foi removida e o arquivo `BI.gs` **saiu do projeto**
(são 384 linhas a menos para colar). O único quadro que dizia algo — a
tendência mês a mês — virou o **gráfico contínuo do Painel**, agora
alimentado direto do `AGR_COLAB`.

### T9 · Continuidade entre competências
**Mudou:**
- o **Período** varre a base por DATA, então um intervalo de 01/06 a
  29/08 atravessa quantas competências forem necessárias;
- ele ganhou uma **linha do tempo** com um ponto por dia do intervalo,
  que é onde se vê que não há buraco na virada;
- ganhou também **quebra por competência**, para mostrar de quantas
  planilhas veio o número;
- o **Painel** ganhou a série contínua de todas as competências;
- a **ficha do colaborador** mostra o histórico inteiro, atravessando as
  planilhas.
**Conferido:** importei duas competências (21/06–20/07 e 21/07–20/08),
cada uma numa planilha, e a consulta de 21/06 a 20/08 devolveu 61 dias
consecutivos, com a virada 20/07 → 21/07 intacta e o total batendo com a
soma das duas.

### T10 · O Período contava errado — e por dois motivos
**Mudou:** a data de cada registro passa por `isoDaFato_()`, que aceita
texto e Date e compara como texto; e códigos fora da legenda saem da
conta.
**Por quê:** a consulta fazia `new Date(f.DATA + 'T12:00:00')`. Quando a
coluna vinha como Date (a aba perde o formato "@" com facilidade), isso
virava `"Fri Jul 21 2026 ...T12:00:00"` — data inválida — e a consulta
devolvia **zero**. Foi exatamente o que a sua tela mostrou: 0
colaboradores, 0 registros, 91 dias no intervalo.

### T11 · Filtro por turno no Período
**Mudou:** o formulário ganhou **Turno**, ao lado do tipo de ausência, e o
resultado ganhou a quebra por turno. Os atalhos foram de seis para oito
(entraram "6 meses" e "Tudo").

### T12 · Código fora da legenda vira "Não definido" e sai dos gráficos
**Mudou:** o que não está no DE-PARA recebe a categoria **Não definido**;
ele fica fora do gráfico de categorias e da lista de códigos mais
lançados, e vira um **aviso** no topo do painel, com os códigos e as
contagens, e um atalho para cadastrá-los.
**Por quê:** na sua tela, "A CONFIRMAR" era a **segunda maior barra** do
painel — 530 lançamentos — dizendo exatamente nada.

### T13 · O 6.1 (férias) deixou de escapar
**Mudou:** `codigo_()` trata número, texto, vírgula decimal e Date;
`traduz_()` tenta o código com zeros à esquerda, com vírgula, com ponto e
com o ".0" que a planilha às vezes cola.
**Por quê:** na sua tela o **6.1 aparecia como "A CONFIRMAR", 350 vezes**
— o bloco de férias inteiro do mês fora da conta.

### T14 · Atualização automática, uma vez por dia
**Mudou:** gatilho novo `atualizarCompetenciaAberta`, às **10h** (hora
configurável em `HORA_ATUALIZACAO_RH`), que relê **só** a competência
marcada como Aberta. O botão **↻ Atualizar dados** faz o mesmo na hora, e
está no topo da tela de Assiduidade e na Configuração.
**Por quê:** o RH atualiza a planilha aberta uma vez por dia. As fechadas
não são tocadas.

## Configuração

### T15 · Quatro abas no lugar do depósito
**Mudou:** **Fontes do RH** (competências + DE-PARA + como a folha é
lida) · **Calendário** (rotinas, setores, prazos) · **Apresentação**
(links) · **Sistema** (estado, manutenção, outros parâmetros). Os
dezessete parâmetros soltos ganharam grupo e foram para a aba do assunto
a que pertencem.

## Acabamento

### T16 · Acentuação
**Mudou:** o texto visível do sistema passou a ser escrito em português
correto — "Apresentação", "Configuração", "Período", "Níveis de acesso",
"% de ausência", "não", "você". Foram cerca de 240 trechos em `App.html`,
`Index.html` e nas mensagens de erro dos `.gs`.
**Nota de bastidor:** o primeiro passe automático acentuou também nomes
de variáveis (`const memória`, `d.competência`) porque o arquivo inteiro
é um `<script>` e o detector de texto pegava trechos de código. Reverti e
refiz com uma regra conservadora: só é tocado o texto que parece prosa —
sem interpolação, sem parênteses, sem palavra-chave de JavaScript.

### T17 · O botão "Voltar ao meu perfil" não existia
**Mudou:** `pararSimulacao()` foi criada no cliente.
**Por quê:** a faixa de simulação chamava uma função que nunca existiu.

### T18 · O botão "Voltar" da tela de pedido era invisível
**Mudou:** `.botao-texto` ganhou variante para as telas claras.
**Por quê:** ele foi desenhado para a barra lateral escura — texto branco
sobre fundo claro.
