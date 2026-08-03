# RUNBOOK — GSL-DADOS v7

Manual de operação. Escrito para que outra pessoa consiga manter o sistema sem
depender do administrador atual.

---

## 1 · Instalação (uma vez)

1. Suba `GSL-DADOS-v7.xlsx` no Drive e abra.
2. **Arquivo → Salvar como Planilhas Google.** Apague o `.xlsx` do Drive depois.
3. Renomeie para `GSL-DADOS · CD Feira de Santana`.
4. **Compartilhamento:** restrito. Adicione o gerente como *leitor* e o RH como
   *editor* (RH precisa manter as abas `DIM_`). Em Configurações do
   compartilhamento, desmarque *download, impressão e cópia* para leitores.
   Nunca "qualquer pessoa com o link".
5. Extensões → Apps Script. Crie um arquivo para cada `.gs` de
   `apps-script/dados/src/`, mantendo os nomes.
6. Preencha a aba **PARAM** (IDs e e-mails) e a aba **FONTES** (bloco 1).
7. Menu **GSL-DADOS → Instalar gatilhos** e autorize.
8. Menu **GSL-DADOS → Diagnóstico do sistema**. Só siga quando estiver tudo ✔.
9. Só se você optar por publicar os totais no calendário (seção 6 da
   arquitetura): no projeto Apps Script **do calendário**, rode uma vez a função
   `ampliarFaixaOcorrencias` do comentário em `40_Publicacao.gs`, que amplia as
   fórmulas de 605 para 5005 linhas. Confira a `GERÊNCIA` depois.
   Optando por não publicar, deixe `Publicar agregados no GSL = N` no `PARAM` e
   pule este passo.

### No projeto do calendário (independente do resto)

Cole `apps-script/gsl/src/CorrigirPlacar.gs` e execute `corrigirPlacar()` uma
vez. Ele reescreve só as fórmulas da aba SCORE — nenhuma outra aba é tocada.

## 2 · Preenchendo o de-para (a parte que decide o projeto)

Abra as três planilhas de origem lado a lado com a aba `FONTES`.

- **Bloco 1:** cole o ID (ou o link inteiro) de cada planilha, o nome exato da
  aba e em que linha está o cabeçalho.
- **Bloco 2:** para cada campo, escreva o nome **exato** da coluna na origem.
  Mais de uma grafia possível: separe por `;`. Campo que a origem não tem: deixe
  em branco.

Depois:
- `DIM_CODIGOS` — uma linha para cada código que aparece nas planilhas. Sem isso
  a linha vira pendência e **não entra nos números**.
- `DIM_PESSOAS` — matrícula, nome oficial e as grafias já vistas.
- `DIM_TURNO_HIST` — turno com vigência. Só é obrigatório se a origem não
  informa o turno na própria linha.
- `DIM_SETORES` — só quando a origem escreve o setor diferente do nome oficial.

Apague as linhas de exemplo (em itálico cinza) antes de usar.

## 3 · Rotina normal

| Quando | O quê |
|---|---|
| De hora em hora, 6h–20h | Importa as três fontes e reconstrói a janela de 60 dias |
| Diariamente 5h30 | Importa e publica os agregados no GSL |
| Segunda 7h | E-mail com as pendências abertas |

Manual: menu **GSL-DADOS → Importar agora**.

## 4 · Resolver pendências (toda semana)

Aba `PENDENCIAS`. Cada linha é algo que o sistema não soube traduzir e que
**está fora dos indicadores** enquanto estiver ali.

1. Preencha a coluna `AÇÃO`:
   - `Confirmar sugestão` — a sugestão está certa; a grafia vira apelido.
   - `Criar novo` — é gente/código/setor novo; a linha é criada na `DIM_`
     correspondente para você completar.
   - `Ignorar` — não deve virar fato.
2. Menu **GSL-DADOS → Resolver pendências**.
3. Menu **GSL-DADOS → Importar agora** para reprocessar.

Fila crescendo semana após semana = indicadores silenciosamente errados. É o
sinal de alerta mais importante do sistema.

## 5 · Quando algo quebra

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| E-mail "Falha na importação" | Mudaram o cabeçalho ou a aba na origem | Ajuste o bloco 2 da `FONTES` e importe |
| `SYNC` com status ERRO | Mesma coisa, ou perda de acesso à planilha | Rode o Diagnóstico |
| Números do calendário zerados | Publicação pausada no `PARAM`, ou fórmulas ainda em 605 linhas | Confira o `PARAM` e rode `ampliarFaixaOcorrencias` |
| Placar com 60,0 em todos os turnos | `corrigirPlacar()` ainda não foi executado | Rode no projeto do calendário |
| Falta some do turno certo | `DIM_TURNO_HIST` sem vigência ou com data errada | Corrija e use *Reprocessar histórico completo* |
| Número diverge do RH | Pendências abertas | Zere a fila e reprocesse |
| Execução estourou o tempo | Janela grande demais | Reduza a janela no `PARAM` |

**Nada é apagado quando uma fonte falha.** O ETL aborta aquela fonte e mantém o
que já estava gravado. Falha parcial nunca vira dado parcial.

## 6 · Alterações no de-para

Depois de mexer em qualquer `DIM_`, rode **Reprocessar histórico completo**.
A importação normal só reconstrói os últimos 60 dias.

## 7 · Privacidade — regras operacionais

- Não cole CID, diagnóstico ou imagem de atestado em nenhuma coluna.
- A `GSL-DADOS` não vai para os coordenadores em nenhuma hipótese, nem "só para
  ver", nem em PDF.
- O relatório do Looker com nomes é compartilhado individualmente com gerência e
  RH — nunca por link aberto.
- Dado individual: 5 anos. Depois, só o agregado histórico.
- A aba `LOG` responde quem alterou o quê e quando. Não editar.

## 8 · Deploy e código

```bash
cd apps-script/dados      # ou apps-script/gsl, para o calendário
cp .clasp.json.exemplo .clasp.json    # cole o scriptId do projeto
clasp push                            # sobe o que está no repositório
clasp pull                            # traz correção feita no editor do navegador
```

Editou direto no navegador em uma emergência? O primeiro comando do dia seguinte
é `clasp pull` + commit. Senão o próximo `push` apaga a correção.

A planilha é gerada por `build/gerar_gsl_dados.py` — mudanças de estrutura vão no
script, não na planilha.

## 9 · Contatos

| Assunto | Quem |
|---|---|
| Planilha do RH | (preencher) |
| Planilha de erros | (preencher) |
| Planilha de metas | (preencher) |
| Planilha do GSL e este sistema | Administrador |

Os IDs das planilhas ficam na aba `PARAM`/`FONTES` — **não** no repositório.
