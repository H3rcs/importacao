# Banco de ensaio — opcional

Não faz parte do sistema. É o ambiente que roda os arquivos `.gs` **fora
do Apps Script**, e é onde as correções foram validadas. Fica aqui porque
serve para a próxima alteração — e para conferir cada folha nova do RH.

## Os roteiros

```bash
cd _ENSAIO

node rodar.js ../02_CORRIGIDO     # 35 testes funcionais        -> 35/0
node rodar.js ../01_ORIGINAL      # o antes, para comparar      -> 21/13

node real.js                      # ETL contra a FOLHA REAL do RH,
                                  # conferido com a GSL-DADOS   -> 34/0
node continuidade.js              # duas competências, uma planilha
                                  # cada, sem quebra na virada  ->  7/0
node migracao.js                  # DE-PARA errado -> Restaurar
                                  # + Reclassificar             ->  8/0
node migracao_pessoas.js          # Equipe + Acessos -> cadastro
                                  # único, sem perder ninguém   ->  6/0
node formato_novo.js              # a folha com NÚMERO DO DIA no
                                  # cabeçalho (o formato novo)     ->  9/0
node painel_velho.js              # painel gravado por versão
                                  # anterior se refaz sozinho      ->  4/0
node robustez.js                  # os sete filtros, a importação
                                  # que falha sem destruir a base,
                                  # o cache que não segurava dado
                                  # velho, reimportar sem duplicar -> 11/0
node tam.js                       # tamanho do payload do painel
                                  # (o limite da célula é 50.000)

node medir.js ../01_ORIGINAL      # chamadas de serviço, antes
node medir.js ../02_CORRIGIDO     # ... e depois
```

## `real.js` — o mais útil no dia a dia

Carrega `folha_real.json` (a FOLHA DE PONTO de agosto/2026 exportada da
planilha do RH), roda a importação de verdade e compara com os números
que a sua GSL-DADOS produz: colaboradores, registros, ausências, taxa, as
três famílias de falta, atestados, férias e o quadro por turno.

**Para conferir um mês novo**, exporte a aba `FOLHA DE PONTO` para
`folha_real.json` no mesmo formato (matriz de linhas; datas como
`{"__data":"AAAA-MM-DD"}`) e ajuste os números de referência no topo do
arquivo. Se algo divergir, o roteiro diz qual indicador.

## `tam.js` — a conta que quebrou a aba Colaborador

O painel é gravado numa célula só, e uma célula do Google Sheets aceita
50.000 caracteres. Antes da correção o payload tinha 96.681. Rode este
roteiro depois de qualquer mudança no painel: se passar de 50.000, a aba
volta a não carregar.

## O que os roteiros NÃO cobrem

Envio de e-mail de verdade, conversão de fotos em PDF (`DocumentApp` +
miniaturas do Drive) e o comportamento do CSS no navegador — para isso,
o `TESTES.md`.
