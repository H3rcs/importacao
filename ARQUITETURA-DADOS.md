# GSL Bartofil · v7 — arquitetura de dados

**CD Feira de Santana** · Turnos A / B / C
Caminho no repositório: `docs/ARQUITETURA-DADOS.md`

---

## 1 · O desenho em uma frase

São **duas planilhas**, com papéis separados:

| | **GSL — Calendário (v5)** | **GSL-DADOS (v7)** |
|---|---|---|
| Para quê | Atividades, prazos, entregas, validação, reunião de sexta | Base de dados do BI |
| Estrutura | **Permanece exatamente como está** | Nova, criada por script |
| Quem abre | Coordenadores e gerente | Administrador, gerente e RH |
| Alimentada por | Coordenadores, como hoje | ETL das 3 planilhas da empresa |
| Consumida por | Quem trabalha no CD | Looker Studio |

A GSL-DADOS não substitui nada do calendário. Ela existe porque as três
planilhas da empresa (RH, erros e metas) trazem **dados individuais** que não
podem circular entre coordenadores — e porque um BI precisa de dados planos,
que uma planilha de trabalho nunca vai ter.

```
Planilha do RH ┐
Planilha erros ├─► GSL-DADOS (restrita) ─┬─► Looker Studio · gerência
Planilha metas ┘   de-para + FATOS       └─► (opcional) totais no GSL
```

## 2 · Por que uma segunda planilha, e não abas protegidas

Proteção de aba no Google Sheets impede **edição**, não **leitura**. Uma aba
oculta continua visível em `Ver → Abas ocultas`, no histórico de versões, no
download em XLSX e em qualquer fórmula digitada numa célula vazia. Enquanto o
dado pessoal estiver no mesmo arquivo que o coordenador abre, ele está
acessível. A separação física é a única proteção real.

## 3 · Por que o script empurra, e o `IMPORTRANGE` não entra no GSL

`IMPORTRANGE` autoriza o **par de arquivos**, não o intervalo. Autorizado uma
vez, qualquer editor do calendário poderia escrever
`=IMPORTRANGE("id_da_GSL-DADOS";"FATOS!A1:Z9999")` e receber a base inteira, com
nomes e atestados.

Por isso a única direção de escrita é de dentro para fora: o gatilho do Apps
Script roda com a conta do administrador, lê a fonte restrita e cola **valores**
no destino. O calendário não guarda o ID da planilha restrita e não tem nenhuma
referência viva a ela.

> `IMPORTRANGE` continua útil em um lugar só: dentro da GSL-DADOS, para ler as
> planilhas de origem — arquivo restrito lendo arquivo restrito.

## 4 · Camadas da GSL-DADOS

| Camada | Abas | Papel |
|---|---|---|
| Configuração | `PARAM`, `FONTES` | IDs, e-mails e o de-para dos cabeçalhos |
| Staging | `STG_RH`, `STG_ERROS`, `STG_METAS` | cópia crua da origem, com carimbo e hash |
| Dimensões | `DIM_PESSOAS`, `DIM_TURNO_HIST`, `DIM_CODIGOS`, `DIM_SETORES` | a tradução |
| Fatos | `FATOS`, `FATOS_METAS` | a fonte única do BI |
| Operação | `PENDENCIAS`, `SYNC`, `LOG` | o que não traduziu, a saúde e a auditoria |

Todas as abas de dados são **planas**: cabeçalho na linha 1, sem título
mesclado, sem linha em branco, sem célula decorada. É feio de propósito — é o
que o Looker Studio e o script esperam. A beleza fica no calendário e no painel.

### 4.1 `DIM_PESSOAS` — o de-para de gente

`MATRICULA · NOME OFICIAL · APELIDOS · SETOR · ADMISSÃO · DESLIGAMENTO · ATIVO`

- **Matrícula é a chave.** Se as planilhas não têm matrícula, esse é o pedido
  número um ao RH — sem ela, homônimo vira erro de gestão.
- `APELIDOS` guarda cada grafia já vista: `JOAO SILVA;J. SILVA;JOÃO S.`
- O ETL alimenta essa coluna sozinho toda vez que você resolve uma pendência.

### 4.2 `DIM_TURNO_HIST` — turno tem data

`MATRICULA · TURNO · VÁLIDO DE · VÁLIDO ATÉ`

Colaborador muda de turno. Se o sistema usasse o turno *atual*, a falta de março
migraria para o turno novo e o score de um coordenador mudaria retroativamente
sem ninguém entender por quê. A falta pertence ao turno **da data do fato**.

### 4.3 `DIM_CODIGOS` — o de-para de códigos

`ORIGEM · CÓDIGO · DESCRIÇÃO · TIPO CANÔNICO · UNIDADE · CONTA NO SCORE · GRAVIDADE`

Tipos canônicos fechados: `Falta`, `Falta justificada`, `Atestado`,
`Saída antecipada`, `Atraso`, `Erro operacional`, `Férias`, `Afastamento`,
`Ignorar`.

Decisões que precisam estar tomadas aqui, não no código:

- Falta justificada entra no absenteísmo? No score?
- Atestado conta **dias**; falta conta **eventos**.
- Saída antecipada vale quanto — indicador próprio ou fração de falta?
- Férias e afastamento **não são absenteísmo**. Sem isso, o turno com alguém de
  férias parece indisciplinado.

### 4.4 `FATOS` — a tabela canônica

`DATA · TIPO · TURNO · SETOR · QTDE · MATRICULA · COLABORADOR · DESCRIÇÃO ·
SEMANA · MÊS · ANO · _ORIGEM · _LINHA_ORIG · _HASH · _IMPORTADO_EM`

Ficam de fora por decisão de projeto: CID, diagnóstico, nome do médico, qualquer
texto copiado do atestado. O sistema precisa saber que houve 3 dias de atestado
— não precisa saber de quê.

### 4.5 `FATOS_METAS` — grão diferente, tabela diferente

`MÊS · SETOR · TURNO · INDICADOR · META · REALIZADO · PCT_ATINGIDO · …`

Meta é mensal e agregada; ocorrência é diária e pontual. Misturar as duas obriga
a filtrar por tipo em toda fórmula e quebra o Looker.

### 4.6 `PENDENCIAS` — a fila que salva o projeto

Toda linha da origem que o ETL não conseguiu traduzir cai aqui, com a sugestão
mais próxima e o percentual de similaridade. Enquanto estiver na fila, **aquela
linha está fora dos indicadores**.

E-mail semanal com o total em aberto. Silêncio aqui é o modo de falha mais
perigoso do sistema: números baixos e errados parecem números bons.

## 5 · O ETL

### 5.1 Coluna pelo nome, nunca pela posição

O RH vai inserir uma coluna no meio da planilha em algum momento. Se o script
lesse "coluna D", passaria a somar a coluna errada em silêncio. O ETL localiza a
linha de cabeçalho, normaliza (maiúsculas, sem acento, espaço simples) e mapeia
pelos sinônimos escritos na aba `FONTES`.

**Falha alta:** coluna obrigatória ausente aborta **a fonte inteira**, escreve o
motivo na `SYNC` e envia e-mail. Não grava dado parcial. Meio dado é pior que
dado nenhum.

### 5.2 Recarga da janela

Cada execução reconstrói os fatos daquela fonte dentro da janela configurada
(padrão 60 dias). Isso resolve de uma vez três coisas que o "só inserir o que é
novo" não resolve: correção retroativa do RH, linha excluída na origem e gatilho
executado duas vezes.

Nada é apagado antes de a leitura da origem terminar com sucesso.

### 5.3 Tradução

1. Matrícula bate → resolvido.
2. Nome normalizado bate um apelido → resolvido.
3. Similaridade ≥ 0,88 com candidato único → **sugestão** na fila, nunca
   lançamento automático.
4. Qualquer outro caso → `PENDENCIAS`.

O passo 3 nunca grava sozinho. Um match errado de nome vira advertência
disciplinar na pessoa errada.

### 5.4 Gatilhos

| Quando | O quê |
|---|---|
| De hora em hora, 6h–20h | Importa as três fontes |
| Diariamente 5h30 | Importa e (se habilitado) publica os totais |
| Segunda 7h | E-mail de pendências |

Limite do Apps Script: 6 minutos por execução. É o motivo da janela incremental.

## 6 · A fronteira com o calendário — decisão em aberto

As abas `GERÊNCIA`, `SCORE` e `PAINEL` do calendário leem faltas e atestados da
aba `OCORRÊNCIAS`. Dois caminhos, **nenhum deles mexe na estrutura da v5**:

**A · Publicar (`PARAM` → `Publicar agregados no GSL = S`)**
A GSL-DADOS escreve na `OCORRÊNCIAS` uma linha por data + tipo + turno + setor,
nas mesmas colunas de sempre, com `COLABORADOR` e `DESCRIÇÃO` vazias. Ninguém
digita mais ocorrência à mão e o placar passa a refletir o RH.
Custo: uma vez só, ampliar as fórmulas de 605 para 5005 linhas
(função comentada em `40_Publicacao.gs`).

**B · Não publicar (`= N`)**
A `OCORRÊNCIAS` continua sendo digitada pelo menu do calendário, como hoje. Zero
mexida. A análise de verdade vive toda no Looker.
Custo: o mesmo dado é lançado duas vezes.

Recomendação: **A**. Tira a digitação manual sem custar nada visual ao
coordenador.

## 7 · Matriz de acesso

| Artefato | Coordenadores | Gerente | RH | Diretoria | Admin |
|---|---|---|---|---|---|
| GSL — calendário | editar | editar | — | ver | dono |
| GSL-DADOS | **nenhum** | ver | editar `DIM_` | — | dono |
| Looker · Operação | ver | ver | — | ver | dono |
| Looker · Pessoas | — | ver | ver | ver | dono |
| Planilhas de origem | conforme setor | ver | dono | — | ver |

Configurações obrigatórias na GSL-DADOS: compartilhamento restrito (nunca
"qualquer pessoa com o link"), download/impressão/cópia desmarcados para
leitores, abas `FATOS` e `STG_` protegidas, `LOG` intocado.

### LGPD — o que precisa estar escrito

- **Base legal:** cumprimento de obrigação legal e execução do contrato de
  trabalho. Atestado é dado sensível de saúde (art. 11) e por isso não circula
  fora de RH e gerência.
- **Minimização:** tipo, data e quantidade de dias. Sem CID, sem diagnóstico,
  sem imagem.
- **Retenção:** individual por 5 anos; depois, só o agregado histórico.
- **Rastreabilidade:** a aba `LOG` responde quem alterou o quê e quando.

O argumento a levar ao gerente: o modelo novo **reduz** o número de pessoas com
acesso a dado pessoal, mesmo aumentando muito a informação disponível.

## 8 · Looker Studio

**Fonte:** as abas `FATOS`, `FATOS_METAS` e `DIM_PESSOAS` da GSL-DADOS.
**Credenciais:** do proprietário — assim o gerente vê o painel sem precisar de
acesso à planilha. Em troca, o controle passa a ser o compartilhamento do
relatório.

**Dois relatórios separados, não um com filtro:**

| Relatório | Conteúdo | Para quem |
|---|---|---|
| **Operação** | erros por setor, Pareto, absenteísmo por turno, metas | coordenadores, gerência, diretoria |
| **Pessoas** | absenteísmo individual, reincidência, atestados | gerência e RH |

Filtro por e-mail do visualizador é frágil sem BigQuery por trás. Dois
relatórios é mais simples e mais seguro.

**Atualização:** cache padrão de 15 minutos. Com o ETL de hora em hora, o painel
fica com atraso máximo de ~1h15 — adequado para gestão. Tempo real exigiria
BigQuery, não Sheets.

## 9 · Repositório e servidor Bartofil

```
gsl-bartofil/
├─ apps-script/
│  ├─ gsl/src/       Code.gs (v6, inalterado) + CorrigirPlacar.gs
│  └─ dados/src/     00_Param · 10_Fontes · 20_Depara · 30_Etl · 40_Publicacao · 50_Menu
├─ build/            gerador da GSL-DADOS (Python/openpyxl)
├─ docs/             este documento e o runbook
└─ .gitignore
```

- `clasp push` sobe o que está no repositório; `clasp pull` traz correção feita
  no editor do navegador. Editou no navegador numa emergência? O primeiro
  comando do dia seguinte é `clasp pull` + commit, senão o próximo push apaga.
- IDs e e-mails **não** entram no repositório: ficam nas abas `PARAM`/`FONTES`.
- `.gitignore` ignora `*.xlsx` de propósito: a planilha é artefato de build,
  recriável por `build/gerar_gsl_dados.py`. É o que dá diff legível.
- Servidor interno: Gitea ou GitLab CE (Gitea roda em ~200 MB de RAM). `main`
  protegida, merge com registro, tag por release, backup do repositório fora do
  próprio servidor.
- O `clasp` precisa de internet e da conta Google: o deploy sai da máquina do
  administrador; o servidor guarda o código. CI depois, só para lint.
- GitHub privado atual: definir com a empresa se vira espelho externo ou é
  encerrado.

## 10 · Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Layout da origem muda | Leitura por nome de cabeçalho + aborta e avisa |
| Homônimos | Matrícula como chave; sem ela, pendência obrigatória |
| Turno muda no meio do mês | `DIM_TURNO_HIST` com vigência |
| Pendências acumulam sem ninguém olhar | E-mail semanal + contador na `SYNC` |
| RH corrige o passado | Recarga da janela |
| Renomearam aba ou planilha de origem | Diagnóstico testa acesso às 3 fontes |
| Estouro dos 6 minutos | Janela incremental + carga completa manual |
| Dependência de uma pessoa | Runbook + código no servidor da empresa |

## 11 · Decisões que dependem da empresa, não do código

1. Publicar ou não os totais no calendário (seção 6).
2. Falta justificada entra no score?
3. Saída antecipada vale quanto?
4. Metas são por setor, por turno ou por colaborador?
5. Meta entra no `SCORE` como quarto componente? Os pesos já são editáveis.
6. Existe matrícula nas três planilhas?
7. Qual servidor Git, e o GitHub atual vira espelho ou é encerrado?

## 12 · Estado das fases

| Fase | Situação |
|---|---|
| F1 · GSL-DADOS + de-para | pronto |
| F2 · ETL do RH | pronto — falta o de-para real e validar 30 dias contra o RH |
| F3 · erros e metas | pronto — mesma pendência |
| F4 · publicação no calendário | pronto, aguardando a decisão da seção 6 |
| F5 · Looker Studio | a fazer |
| F6 · servidor Bartofil | a fazer |

F2 decide o projeto: se o número importado não bater com o do RH, nada depois
disso tem valor. Vale rodar duas semanas em paralelo — o RH segue o processo
atual e compara — antes de desligar a digitação manual.
