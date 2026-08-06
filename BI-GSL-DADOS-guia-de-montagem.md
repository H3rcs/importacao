# BI GSL — Guia de montagem no Looker Studio

CD Feira de Santana · fonte: planilha **GSL-DADOS** · versão 1

Este documento é para ser seguido com o Looker Studio aberto. Tudo que está em bloco de código é para copiar e colar exatamente como está.

Tempo estimado: cerca de uma hora, quase toda em copiar e colar. A página de Assiduidade já pode ser montada hoje; Erros e Metas ficam prontas mas vazias até essas fontes serem importadas.

---

## 1 · Antes de começar

Confira estes quatro pontos. Cada um deles, se estiver errado, custa meia hora de procura depois.

1. A GSL-DADOS está salva como **Planilha Google**, não como .xlsx.
2. A aba `FATO_ASSIDUIDADE` já tem pelo menos uma competência importada.
3. Na aba `RESUMO_BI`, a coluna **A CONFIRMAR** está zerada. Se não estiver, há código do RH sem tradução no DE-PARA — o painel vai mostrar uma fatia "A CONFIRMAR" e alguém vai perguntar o que é.
4. Você está logado com a conta Bartofil que tem acesso à planilha.

---

## 2 · Conectar as fontes de dados

São três fontes, uma por tabela fato. O procedimento é o mesmo para as três.

No Looker Studio: **Criar › Fonte de dados › Planilhas Google**, escolha a GSL-DADOS e a aba correspondente.

### O ponto crítico

As abas fato têm título nas linhas 1 a 3 e o **cabeçalho na linha 5**. O conector do Looker assume cabeçalho na primeira linha e vai importar "GSL-DADOS · BASE ANALÍTICA" como nome de campo.

Para corrigir, marque **"Intervalo personalizado"** na tela de conexão e informe:

| Fonte | Aba | Intervalo |
|---|---|---|
| Assiduidade | `FATO_ASSIDUIDADE` | `A5:J200000` |
| Erros | `FATO_ERROS` | `A5:L200000` |
| Metas | `FATO_METAS` | `A5:K20000` |

Deixe **"Usar a primeira linha como cabeçalho"** marcado — com o intervalo começando em 5, a primeira linha do intervalo é o cabeçalho certo.

Os intervalos são propositalmente maiores que o volume atual. A assiduidade cresce cerca de 4.600 linhas por competência, ou 55 mil por ano; o teto de 200 mil dá uns três anos de folga sem precisar mexer.

### Conferência dos tipos

Depois de conectar, confira na lista de campos:

- `DATA` deve estar como **Data**. Se vier como texto, mude o tipo no próprio Looker.
- `COMPETÊNCIA` e `MÊS CALENDÁRIO` ficam como **Texto**. É o esperado — o formato `2026-08` ordena corretamente em ordem alfabética, e no passo 3 criamos uma versão de data para as séries temporais.
- `META` e `REALIZADO` devem estar como **Número**.

Renomeie as três fontes para `GSL Assiduidade`, `GSL Erros` e `GSL Metas`, senão daqui a duas semanas você não sabe qual é qual.

---

## 3 · Campos calculados

Esta é a parte que o Looker não faz sozinho. Crie cada campo em **Recurso › Gerenciar fontes de dados › Editar › Adicionar um campo**.

### 3.1 · Fonte GSL Assiduidade

**Competência (data)** — converte o texto `2026-08` em data, para usar em gráficos de série temporal.

```
PARSE_DATE("%Y-%m", COMPETÊNCIA)
```

**Ausência (num)** — transforma o Sim/Não em número somável. É a base de quase tudo nesta página.

```
CASE WHEN AUSÊNCIA = "Sim" THEN 1 ELSE 0 END
```

**Turno (rótulo)** — só cosmético, para o painel não misturar "ADM" com "A".

```
CASE WHEN TURNO = "ADM" THEN "ADM" ELSE CONCAT("Turno ", TURNO) END
```

**Taxa de absenteísmo** — agregação. Tipo do campo: **Número**, formato **Percentual**.

```
SUM(Ausência (num)) / COUNT(MATRÍCULA)
```

> Atenção ao que este número significa: é a proporção de **dias lançados** que foram ausência, não a proporção sobre dias úteis contratuais. A planilha do RH não traz a jornada prevista, então esta é a melhor medida possível com o dado que existe. Se um dia o RH passar a informar dias úteis, isto vira `SUM(Ausência)/dias úteis` e fica exato. Deixe isso registrado ao apresentar o painel.

**Dia da semana** — para a análise de concentração.

```
FORMAT_DATETIME("%A", DATA)
```

**Colaboradores distintos**

```
COUNT_DISTINCT(MATRÍCULA)
```

**Só faltas** e **Só atestados** — separam o que é disciplinar do que é saúde. Servem para o gerente não tratar as duas coisas como a mesma.

```
CASE WHEN CATEGORIA = "Falta" THEN 1 ELSE 0 END
```

```
CASE WHEN CATEGORIA = "Atestado" THEN 1 ELSE 0 END
```

### 3.2 · Fonte GSL Erros

**Competência (data)**

```
PARSE_DATE("%Y-%m", COMPETÊNCIA)
```

**Qtd efetiva** — a coluna QUANTIDADE é opcional no mapeamento; quando vier vazia, cada linha vale 1.

```
IFNULL(QUANTIDADE, 1)
```

**Turno (rótulo)**

```
CASE WHEN TURNO = "ADM" THEN "ADM" ELSE CONCAT("Turno ", TURNO) END
```

### 3.3 · Fonte GSL Metas

**Competência (data)**

```
PARSE_DATE("%Y-%m", COMPETÊNCIA)
```

**Atingimento** — recalcule aqui em vez de usar a coluna `% ATINGIDO` da planilha. A coluna serve para conferência linha a linha; o Looker precisa da razão dos totais para agregar corretamente. Formato **Percentual**.

```
SUM(REALIZADO) / SUM(META)
```

**Farol** — classificação por linha, para colorir tabelas e contar metas atingidas.

```
CASE
  WHEN `% ATINGIDO` >= 1    THEN "Atingida"
  WHEN `% ATINGIDO` >= 0.9  THEN "Perto"
  WHEN `% ATINGIDO` > 0     THEN "Abaixo"
  ELSE "Sem realizado"
END
```

---

## 4 · As quatro páginas

### Página 1 · Visão do gerente

O que ele olha antes da reunião de sexta. Um cartão de pontuação em cima, quatro blocos embaixo.

**Cartões (Scorecard), lado a lado no topo**

| Cartão | Fonte | Métrica |
|---|---|---|
| Taxa de absenteísmo | Assiduidade | `Taxa de absenteísmo` |
| Faltas no mês | Assiduidade | `SUM(Só faltas)` |
| Atestados no mês | Assiduidade | `SUM(Só atestados)` |
| Erros no mês | Erros | `SUM(Qtd efetiva)` |
| Metas atingidas | Metas | Contagem de registros, filtrado por `Farol = "Atingida"` |

Em cada cartão, ative **Comparação › Período anterior**. É isso que faz aparecer a setinha de variação — sem ela o número sozinho não diz nada.

**Gráfico de barras — Absenteísmo por turno**
Dimensão `Turno (rótulo)`, métrica `Taxa de absenteísmo`, ordenado decrescente.

**Gráfico de barras horizontais — Erros por setor (top 10)**
Fonte Erros. Dimensão `SETOR`, métrica `SUM(Qtd efetiva)`, limite de 10 linhas, ordenado decrescente.

**Tabela — Metas do mês**
Fonte Metas. Dimensões `INDICADOR` e `Turno (rótulo)`; métricas `META`, `REALIZADO` e `Atingimento`. Na coluna Atingimento, use **Formatação condicional** para verde acima de 100%, amarelo entre 90 e 100, vermelho abaixo.

**Série temporal — Absenteísmo mês a mês**
Dimensão de tempo `Competência (data)`, métrica `Taxa de absenteísmo`, dividida por `Turno (rótulo)`.

### Página 2 · Assiduidade

**Série temporal empilhada** — `Competência (data)` × `SUM(Ausência (num))`, dividido por `CATEGORIA`. Mostra se o absenteísmo está subindo por falta ou por atestado, que são problemas diferentes.

**Tabela dinâmica** — linhas `Turno (rótulo)`, colunas `CATEGORIA`, valor contagem de registros. É o espelho da aba RESUMO_BI: se os dois não baterem, a conexão está lendo o intervalo errado.

**Barras — Concentração por dia da semana**
Dimensão `Dia da semana`, métrica `SUM(Ausência (num))`, filtrado para excluir sábado e domingo.

**Barras — Top 10 códigos**
Dimensão `CÓDIGO`, métrica contagem. Serve para ver se algum código está sendo usado de forma estranha pelo RH — um pico repentino num código raro costuma ser erro de digitação, não fenômeno real.

**Cartão** — `Colaboradores distintos`, para dar denominador ao leitor.

### Página 3 · Erros

**Pareto por setor** — gráfico combinado: barras com `SUM(Qtd efetiva)` por `SETOR` e linha com o acumulado. O Looker não faz acumulado nativo em gráfico combinado; a saída prática é usar **Tabela com barras de dados**, ordenada decrescente, e deixar o Pareto visual na barra.

**Série temporal** — `Competência (data)` × `SUM(Qtd efetiva)`, dividido por `Turno (rótulo)`.

**Tabela — Setor × Categoria** — dimensão `SETOR`, detalhamento `CATEGORIA`, métrica `SUM(Qtd efetiva)`.

**Mapa de calor (tabela dinâmica com cor)** — linhas `SETOR`, colunas `Competência (data)`, valor `SUM(Qtd efetiva)`. É a visualização que mostra reincidência: um setor com a linha inteira escura é problema estrutural, não caso isolado.

### Página 4 · Metas

**Barras agrupadas** — `INDICADOR` no eixo, `META` e `REALIZADO` lado a lado.

**Cartões por turno** — quatro `Atingimento`, um por turno, usando filtro de gráfico.

**Tabela** — `INDICADOR` × `Turno (rótulo)` × `Farol`, com cor por farol.

**Série temporal** — `Competência (data)` × `Atingimento`, dividido por `Turno (rótulo)`.

---

## 5 · Controles de filtro

Coloque no topo de todas as páginas, e marque **"Aplicar a todas as páginas"** ao inserir cada um:

- **Controle de lista** em `COMPETÊNCIA` — o filtro mais usado, deixe primeiro.
- **Controle de lista** em `Turno (rótulo)`.
- **Controle de lista** em `SETOR` (só nas páginas de Erros e Metas).
- **Controle de intervalo de datas** em `DATA` (páginas de Assiduidade).

Defina o padrão da competência para o **mês atual**, senão o painel abre mostrando o histórico inteiro somado e o número do topo assusta sem motivo.

---

## 6 · Atualização e compartilhamento

O conector de Planilhas guarda cache de 15 minutos. Depois de uma importação nova, use **Atualizar dados** no canto superior para ver na hora.

Em **Compartilhar › Gerenciar acesso**, mantenha restrito. O ponto importante: quem tem acesso ao *relatório* **não** ganha acesso à planilha — o Looker consulta os dados com a credencial do dono da fonte. É exatamente isso que permite o gerente ver o painel agregado sem enxergar a aba COLABORADORES.

Confirme uma coisa antes de publicar: na tela da fonte de dados, o **Método de credencial** deve estar como **Proprietário**, não como Visualizador. Com "Visualizador", cada pessoa consulta com a própria credencial e quem não tem acesso à planilha vê o painel vazio.

---

## 7 · Checklist antes de mostrar para a gerência

- [ ] Os totais da tabela dinâmica da página 2 batem com a aba `RESUMO_BI`
- [ ] Nenhuma fatia ou linha "A CONFIRMAR" aparece em qualquer gráfico
- [ ] Nenhum campo mostra "null" — se aparecer, é mapeamento incompleto na GSL-DADOS
- [ ] O filtro de competência abre no mês atual
- [ ] Os cartões estão com comparação de período anterior ligada
- [ ] Credencial da fonte de dados está como Proprietário
- [ ] Nenhum gráfico usa `MATRÍCULA` como dimensão visível
- [ ] A taxa de absenteísmo está documentada como "sobre dias lançados" em uma caixa de texto no rodapé da página

O penúltimo item é o que mais importa. Matrícula existe nas tabelas para cruzar dados, não para aparecer no painel — um gráfico de "top 10 matrículas com mais faltas" é tecnicamente trivial de fazer e é exatamente o que este projeto foi desenhado para evitar.

---

## 8 · Se o Looker não passar pela governança

Alternativa dentro do arquivo homologado: uma aba `PAINEL` na própria GSL-DADOS, com gráficos nativos do Google Planilhas alimentados por tabelas de apoio com `QUERY()`.

Perde-se o filtro dinâmico, o drill-down e a comparação automática de períodos. Ganha-se não ter artefato novo para homologar, e o painel viver dentro do mesmo controle de acesso da planilha.

Nesse caminho eu consigo entregar pronto, sem montagem manual da sua parte.
