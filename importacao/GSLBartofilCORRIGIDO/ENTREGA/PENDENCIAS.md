# PENDÊNCIAS — o que eu **não** mexi, e por quê

Regra que segui: em caso de dúvida sobre a intenção de um trecho, sobre
remover algo ou sobre uma mudança que pudesse quebrar comportamento
existente, **deixei como está e registrei aqui**. Nada nesta lista foi
alterado no `02_CORRIGIDO`.

---

## 1 · Arquivo de referência que eu não recebi

**`atividades_2026.html`.** As instruções pedem "tema visual claro,
mantendo o padrão do HTML `atividades_2026`", e o `CORRECOES.md` do
projeto se refere a ele como a referência estética. **Ele não veio no
.zip.** Não tenho como comparar o resultado contra a referência.

O que fiz na ausência dele: mantive integralmente a estrutura visual que
já estava no `Estilo.html` (aurora pastel, cristais, bolhas, cartões de
vidro) e mexi só no que as regras invioláveis exigiam — tirar o vermelho e
tornar o claro o padrão. Nenhum layout, espaçamento, tipografia ou
componente foi redesenhado.

**O que eu faria com o arquivo em mãos:** comparar paleta, raios, sombras
e escala tipográfica lado a lado e ajustar só as divergências. Se você
puder mandá-lo, é uma passada rápida e isolada.

---

## 2 · Coisas que existem, ninguém chama, e eu não apaguei

| O quê | Onde | Por que não removi |
|---|---|---|
| `lerPlanilhaExterna()` / `abasDaPlanilhaExterna()` | `Banco.gs` | Foram substituídas por `abrirFolha_()` no Dados.gs, mas são a única forma genérica de ler planilha externa que sobrou. Podem estar previstas para o próximo módulo. Custam 13 linhas e zero desempenho — apagar é ganho nenhum e risco de faltar depois. |
| `garantirCompetencia()` | `Calendario.gs` | A lógica foi copiada para dentro de `dadosCalendario`. Deixei a função (com comentário explicando) porque é a única forma de materializar um mês **fora da tela** — útil no editor e para qualquer rotina futura. **Atenção se for reativá-la:** ela lê com `incluirExcluidos = true`, leitura que não passa pelo cache. |
| `restaurarMeuAcesso()` | `Instalacao.gs` | Órfã de propósito: é o socorro para rodar no editor se você perder o próprio acesso. Documentada, mantida. |
| Ação `entregar` | `Codigo.gs` / `Calendario.gs` | É o caminho de **anexo avulso** (um arquivo por vez). O botão da tela hoje usa o fluxo novo (`iniciarEntrega` → `receberParte` → `finalizarEntrega`, que gera o PDF único). A ação continua válida e funcional, só não tem botão. Não sei se você quer os dois caminhos na interface ou só o do PDF. **Decisão sua.** |
| `rhPeriodo(d)` | `App.html` | Versão antiga da aba Período, substituída por `rhPeriodoTela`. Deixei porque o conteúdo dela ("ausências dia a dia da competência") não existe em nenhuma outra tela — pode ser algo que você queira de volta como cartão. |
| Bloco comentado dentro de `dentroDoEscopo()` | `Calendario.gs` | É a lógica de filtro por turno, desligada de propósito e documentada no LEIA-ME. Mantida exatamente como estava. |

---

## 3 · Dúvidas de regra de negócio — decisão sua

### 3.1 · O filtro por turno continua desligado
`dentroDoEscopo()` devolve `true` sempre: todo mundo vê todas as
atividades. Isso está documentado como intencional ("desligado por ora,
para destravar a operação").

**A inconsistência que sobrou:** `acaoDiagnosticoAcesso` ("Por que não vejo
atividades?") continua explicando ao usuário por que o escopo TURNO estaria
escondendo atividades dele — um diagnóstico que descreve uma regra que não
está mais ligada. Se alguém abrir essa janela hoje, lê uma explicação sobre
um filtro inexistente. Não mexi porque não sei se o filtro vai voltar.

**Opções:** (a) religar o filtro e o diagnóstico volta a fazer sentido;
(b) manter desligado e eu ajusto o texto do diagnóstico para dizer "o
filtro por turno está desligado, todos veem tudo"; (c) deixar como está.

### 3.2 · `descreverEscopo(usuario)` ignora o argumento
Devolve sempre "Todos os turnos". É coerente com o 3.1, mas a assinatura
engana quem lê. Some junto se o filtro voltar.

### 3.3 · Falta justificada / disciplinar não existem no DE-PARA
O seletor de tipo do Período oferecia essas categorias e o DE-PARA padrão
só tem `Falta` (códigos 16, 18 e 401 todos como `Falta`). Corrigi fazendo o
seletor ser montado a partir do que existe de verdade na base — mas **não
criei as categorias**, porque isso mudaria a classificação dos seus dados.

Se a gestão trata falta injustificada, justificada e disciplinar de formas
diferentes (e a legenda do RH sugere que sim: o 18 é suspensão, o 16 é
falta simples), o caminho agora está aberto: Configuração → DE-PARA →
editar o código e escolher a categoria. Os filtros e o BI acompanham
sozinhos, porque passaram a comparar por família (`FALTA*`).

### 3.4 · Gatilho `aquecerCache` a cada 15 minutos
São 96 execuções por dia, cada uma montando **todas** as telas do
administrador. Ajuda muito quem chega no primeiro acesso do dia, e consome
cota o resto do tempo. É intencional e não mexi.

**Se quiser reduzir:** trocar `everyMinutes(15)` por `everyMinutes(30)` em
`instalarGatilhos()` (`Emails.gs`) corta pela metade sem mudar a
experiência de forma perceptível — o cache de tela vale 180 s de qualquer
jeito, então o aquecimento serve mais para manter o ambiente do Apps Script
acordado do que para preencher o cache.

### 3.5 · Ramp de cores entre "Atrasada" e "Aguard. valid."
Com o vermelho fora, "Atrasada" ficou em âmbar escuro (`#8A6A00`) e
"Aguard. valid." continuou no laranja que já tinha (`#D97706`, que não era
vermelho e por isso não precisei tocar). O resultado é que o estado menos
grave está visualmente mais vivo que o mais grave.

Não mexi porque mudar a cor de "Aguardando" é decisão de design, não
correção de defeito. **Se quiser**, a troca é de uma linha: "Aguardando"
para o azul da marca (esperando a gerência = está nas mãos do sistema) e
"Atrasada" fica sendo o único âmbar forte da tela.

### 3.6 · `--neon-rosa` continua magenta
Os tokens de neon (`--neon-rosa: #DB2777` no claro, `#FF2D95` no escuro)
são decorativos — brilho de borda de cartão e partículas do céu escuro.
Magenta não é vermelho, então não caiu na regra; mas também não é azul,
verde nem amarelo. Tirei o rosa de onde ele pareava com o alerta
(`.kpi.vermelho`), e deixei o resto. Se você quiser a paleta decorativa
100% dentro da marca, é uma passada nos seis tokens `--neon-*` — mas isso
muda o visual de todos os cartões e eu não faria sem você ver antes.

---

## 4 · Coisas que eu não consegui testar

Rodei o sistema inteiro num **banco de ensaio** (ver RELATORIO.md), o que
cobre a lógica de dados, permissões, ETL, agregação e o ciclo do
calendário. O que esse ensaio **não** cobre, e você precisa validar no
Apps Script de verdade (o `TESTES.md` tem o passo a passo):

- **Envio de e-mail** — o `MailApp` do ensaio só registra a chamada. O
  conteúdo eu conferi (nenhum vermelho sobrou), mas a autorização e a
  entrega real só no ambiente.
- **Entrega em PDF** (`Entrega.gs`) — depende de `DocumentApp`,
  `UrlFetchApp` e das miniaturas do Drive. Não simulei a conversão. A
  única mudança que fiz nesse arquivo foi a trava de pasta (M11) e o
  `comCampos_` (M1); a lógica de conversão está **intacta**.
- **`content-visibility: hidden`** no céu do tema inativo — funciona em
  Chrome, Edge e Safari 18+. Em navegador antigo ele é simplesmente
  ignorado e volta ao comportamento anterior (esconde mas continua
  animando); o `animation-play-state: paused`, que é o ganho principal,
  vale em todos.
- **`color-mix()`** no CSS — já era usado no arquivo original, então não
  aumentei a exigência de navegador.

---

## 5 · Uma coisa que eu mudaria, mas não é minha decisão

O `ESTADO-DO-PROJETO.md` diz que as planilhas originais
(`GSL_Bartofil_v10.gs`, 1.900 linhas, e o `Dados.gs` de 870) são a
**especificação**, e lista funções que ainda faltam ser portadas:
`relatorioMensalPDF`, `backupMensal_`, `diagnosticoSistema`,
`acertarHorariosRegistrados`, `restaurarDataOriginal` (o "desfazer" da
remarcação) e os modelos `.docx` para download.

Não portei nenhuma delas: você pediu correção e desempenho, e disse
explicitamente para **não inventar funcionalidade nova**. Registro aqui só
para que a lista não se perca — e para dizer que, com os scripts originais
em mãos, portar é trabalho mecânico e de baixo risco agora que a camada de
dados está estável.


---
---

# RODADA 2 — o que ficou pendente

## 6 · Duas coisas do DE-PARA que eu copiei sem entender

A tabela nova veio da aba DE-PARA da sua GSL-DADOS, que é a fonte da
verdade. Duas linhas de lá carregam uma observação que **você** escreveu
dizendo que o significado ainda não estava confirmado — copiei como
está, sem decidir por você:

| Código | Como ficou | A dúvida, na sua própria observação |
|---|---|---|
| `PP` | **Ignorar** | *"PENDENTE: confirmar significado com o RH"*. São 25 células na folha de agosto. Se `PP` for um lançamento de verdade, essas 25 estão saindo da base indevidamente. |
| `29` | Licença legal, **conta como ausência** | *"Cáceres sem vencimento — confirmar o significado exato"*. Não apareceu nenhuma vez em agosto/2026, então hoje não muda número nenhum. |

O `-` (traço, 133 células) eu tratei como **Ignorar** seguindo a sua
planilha (*"Traço na grade (sem lançamento) — não entra na base"*). Foi
essa decisão que fez o total de registros bater exatamente com o seu:
4.846. Se o traço tivesse algum significado, o número não fecharia.

**Se o RH confirmar outro significado para `PP`:** Configuração → DE-PARA
→ editar o código → Reclassificar a base. Nenhuma linha de código muda.

## 7 · Dezesseis pessoas na folha sem nenhum lançamento

A folha traz **357 matrículas**; **341** têm ao menos uma célula
preenchida no período. As 16 restantes entram em COLABORADORES (ficam
cadastradas) mas não aparecem no painel do mês — que é exatamente o que a
sua GSL-DADOS faz. Só registro aqui para que o número 341 não pareça
perda de gente: são pessoas sem lançamento na competência (admissão,
afastamento, desligamento).

## 8 · O período cruza dois meses e isso não aparece na tela

A competência `2026-08` cobre **21/07 a 20/08**. A sua FATO_ASSIDUIDADE
tem uma coluna `MÊS CALENDÁRIO` separada da `COMPETÊNCIA` justamente para
isso; a do app não tem. Não acrescentei porque nenhuma tela usa hoje, e
seria coluna nova sem consumidor.

**Fica registrado como opção:** se você quiser um dia separar "o que caiu
em julho" de "o que caiu em agosto" dentro da mesma competência, é uma
coluna a mais na FATO (a migração cria sozinha) e um filtro na aba
Período. Diga que eu faço.

## 9 · Modo leve: o que ele NÃO resolve

O modo leve conserta a fluidez do fundo e das transições. Ele **não**
muda o tempo de resposta do servidor — se uma tela demora porque o Apps
Script está montando o payload, ela vai continuar demorando o mesmo.
Pelas medições da rodada 1, esse tempo já caiu bastante; se ainda houver
tela lenta **depois** do modo leve ligado, é servidor, não animação, e
vale me dizer qual.

Também não mexi na quantidade de camadas do céu. Medi e não adianta: com
compositor por software, uma camada animando custa o mesmo que doze. Ou
anima (61 quadros com aceleração, 18 sem) ou não anima. Reduzir de doze
para três daria o mesmo 18 — só com menos beleza.

## 10 · O limiar do modo leve é um chute calibrado

Liga abaixo de **45 quadros/s** medidos em 1 segundo. Medi 15–18 nas
máquinas sem aceleração e 61 nas com — a folga é grande, então 45 separa
bem os dois mundos. Mas é um número que eu escolhi.

**O risco:** se a máquina estiver momentaneamente ocupada bem na hora em
que o app abre (um antivírus rodando, uma sincronização), ele pode ligar
o modo leve numa máquina boa. Por isso o botão ⚡ está no topo, ao
alcance de todos, e a escolha manual passa a valer para sempre naquele
computador. Se você vir isso acontecer com frequência, me diga — dá para
medir duas vezes antes de decidir.

---
---

# RODADA 3 — o que ficou pendente

## 11 · `BI.gs` saiu do projeto

A aba Análise foi removida a seu pedido, e com ela o arquivo `BI.gs`
inteiro (384 linhas) deixou de ter uso. **Apague-o do projeto no Apps
Script.** Ele continua preservado no `01_ORIGINAL/` se um dia você quiser
algum daqueles quadros de volta — os que existiam eram: concentração
(Pareto) das ausências, reincidência em 30 dias, risco de cobertura por
dia, custo estimado do absenteísmo e o cruzamento assiduidade × entregas.

O único que eu trouxe para o Painel foi a **tendência mês a mês**, porque
era o que respondia a uma pergunta de gestão. Se algum outro fizer falta,
diga qual — trazer um deles de volta é meia hora.

## 12 · A aba EQUIPE continua no banco, sem uso

A migração copia as pessoas para ACESSOS e **não apaga nada**. A aba
segue lá, congelada, como rede de segurança. Depois de conferir que
Pessoas e acessos está com todo mundo (teste T72), você pode apagá-la à
mão — ou deixar; ela não é lida por ninguém e não custa nada.

## 13 · Quem estava só na Equipe entra como pedido

São pessoas que recebiam aviso mas nunca tiveram nível de acesso
definido. Eu **não** inventei um nível para elas: elas aparecem como
pedido aguardando, para você decidir. Se forem muitas, é um clique cada.

## 14 · O que eu NÃO mudei no cálculo, de propósito

Você disse que "o motor não está contando certo as coisas, por exemplo na
tela de período as faltas aparecem com um número incorreto". Encontrei
**duas** causas — a data virando objeto (que zerava a consulta) e os
códigos fora da legenda entrando na conta — e corrigi as duas.

O que eu **não** toquei foi a definição dos indicadores: taxa =
ausências ÷ dias lançados, assiduidade = (registros − ausências) ÷
registros, e as três famílias de falta separadas. Elas vêm da sua
GSL-DADOS e continuam batendo exato com ela (34 conferências, 0
divergências). Se algum número ainda parecer errado depois de subir,
me diga **qual tela, qual número e qual você esperava** — com isso eu
acho a causa rápido.

## 15 · Os filtros da planilha original

Você mencionou que a planilha tinha vários tipos de filtro e combinações.
Do que apareceu nas capturas, o Período agora tem: **intervalo de datas**
(livre ou por oito atalhos), **tipo de ausência** (montado a partir do
DE-PARA) e **turno**. Falta o "Outros" que aparecia no seu seletor — ele
não existe como categoria na base; se for uma categoria de verdade,
cadastre-a no DE-PARA e ela aparece sozinha no filtro.

Se houver outras combinações que você usa e eu não vi, mande a captura da
planilha — o motor da consulta já aceita filtros novos sem reescrita.

## 16 · Acentuação: o que ficou de fora

Acentuei o texto visível das telas e as mensagens de erro. **Não** mexi
em: nomes de coluna do banco (são maiúsculas e sem acento de propósito —
mudá-los quebraria o banco), identificadores do código, e os comentários
técnicos dentro dos arquivos.

Se sobrar alguma palavra sem acento numa tela, é caso isolado: me diga
onde que eu corrijo.
