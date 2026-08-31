# GSL Bartofil — estado real do projeto

Web app do Google Apps Script para o CD Feira de Santana da Bartofil.
17 arquivos, ~4.700 linhas. **Funciona parcialmente. Leia a seção "O que está quebrado".**

## Objetivo definido pelo dono do projeto

Aposentar duas planilhas como interface. Elas ficam só como banco; o Drive guarda os arquivos.
**O app deve ter todas as telas e todas as funções das planilhas.** Não é uma versão simplificada.

As planilhas originais e seus scripts (`GSL_Bartofil_v10.gs`, 1.900 linhas, e `Dados.gs`, 870 linhas)
são a **especificação**. Estão em produção, validados, em uso. Quem continuar: porte deles,
não reinvente. Foi exatamente esse erro que atrasou o projeto.

## Instalar

1. script.google.com → projeto novo → Configurações → marcar "Mostrar appsscript.json".
2. Criar os 17 arquivos com estes nomes exatos (`+` → Script para `.gs`, HTML para `.html`;
   digitar o nome **sem** extensão).
3. Implantar → Nova implantação → App da Web → Executar como **Eu** → Acesso conforme o caso.
4. Abrir `/exec`, autorizar, clicar em "Criar banco de dados".

Para testar durante o desenvolvimento use a URL `/dev` (Implantar → Testar implantações):
ela sempre roda o código salvo, sem precisar publicar versão.

## Arquivos

| Arquivo | Papel |
|---|---|
| `appsscript.json` | manifesto — fuso `America/Bahia`, escopos (drive, scriptapp, send_mail) |
| `Codigo.gs` | roteador: `carregarTela` (leitura) e `executarAcao` (escrita) |
| `Instalacao.gs` | esquema do banco, migração automática, sementes |
| `Banco.gs` | única camada que conhece `SpreadsheetApp` |
| `Datas.gs` | fuso, competência, semana ISO — portado do `tz_`/`diaNum_` original |
| `Auth.gs` | identidade pela conta Google, autocadastro como PENDENTE |
| `Permissoes.gs` | registro de telas, capacidades, escopo |
| `Calendario.gs` | geração de rotinas, entrega, validação |
| `Central.gs` | andamento + motor de 8 insights |
| `Config.gs` | equipe, setores, rotinas, parâmetros |
| `Emails.gs` | digesto matinal, avisos, gatilhos |
| `Dados.gs` | GSL-DADOS: importação da folha do RH, agregação, painel, ficha, ranking |
| `Arquivos.gs` | anexos no Drive |
| `Index.html` / `Estilo.html` / `Marca.html` / `App.html` | interface |

## Banco (criado pelo próprio app)

```
Drive/GSL Bartofil/
  GSL_BANCO          ← não compartilhar com ninguém
  Anexos/ATIVIDADES/<ID da atividade>/
  Modelos/
```

Tabelas: `ATIVIDADES`, `EQUIPE`, `SETORES`, `ROTINAS`, `PARAMETROS`, `ARQUIVOS_RH`, `DE_PARA`,
`COLABORADORES`, `FATO_ASSIDUIDADE`, `AGR_COLAB`, `PAINEL`, `ACESSOS`, `PERFIS`, `LOG`.

Todas nascem com formato de texto puro — sem isso o Sheets converte `2026-08` em data.

## Decisões de arquitetura

1. **Só `Banco.gs` conhece planilha.** Trocar de banco mexe só nele.
2. **Duas portas.** `carregarTela(id, params)` lê, `executarAcao(nome, params)` grava.
   As duas conferem permissão antes de despachar. Ambas devolvem **string JSON**, porque o
   `google.script.run` devolve `null` sem aviso quando algum valor não passa na serialização dele.
3. **Status nunca é digitado.** É derivado: validação → entrega → prazo vencido → pendente.
4. **Todo registro tem ID próprio.** Reordenar a planilha não quebra referência.
5. **Migração automática** (`garantirEsquema`) roda quando `VERSAO_ESQUEMA` muda: cria tabelas e
   colunas faltantes, semeia referências vazias, garante ADMIN com acesso total.

### Desempenho — o que já foi feito e por quê

- O `doGet` embute a resposta do bootstrap **e** a primeira tela dentro do HTML. Cada
  `google.script.run` custa 1–3 s; isso elimina duas idas e voltas na abertura.
- O painel de assiduidade é calculado **na importação** e gravado pronto na tabela `PAINEL`.
  Antes, cada abertura varria as ~5.000 linhas da FATO.
- `listar()` memoiza por execução; o handle da planilha é reaproveitado.
- Escritas em lote (`setValues`) em vez de `appendRow` por linha.
- Anexos: a lista traz só a contagem; nome e tamanho vêm do Drive só ao abrir a atividade.

## Testes automatizados que existem

Rodar antes de entregar qualquer alteração — os três já pegaram bugs reais:

```bash
# 1 · sintaxe de cada .gs
for f in *.gs; do cp $f /tmp/x.js && node --check /tmp/x.js; done

# 2 · identificadores duplicados entre arquivos
#     (todos os .gs dividem o mesmo escopo global no Apps Script;
#      dois `const TURNOS` derrubam o projeto inteiro)

# 3 · carregar o App.html num DOM falso com node:vm
#     pega "X is not defined", que causa tela branca total
```

## O que está quebrado ou incompleto

**Não testado em execução real.** Nada aqui foi rodado no Apps Script — só verificação estática.
Assuma que há bugs de comportamento.

Do `GSL_Bartofil_v10.gs` (76 funções) **ainda faltam**:
- `finalizarEntrega` + `_montarMisto_` + `_imagensParaPdf_` — múltiplos anexos viram um PDF único
- `remarcarAtividade` / `restaurarDataOriginal` — remarcação com desfazer
- `relatorioMensalPDF` — relatório mensal em PDF para a diretoria
- `backupMensal_`, `diagnosticoSistema`, `acertarHorariosRegistrados`
- modelos `.docx` para download (aba INÍCIO da planilha)

Do `Dados.gs` (39 funções) faltam: `montarPainel` com gráficos nativos, `diagnosticoLeitura`.

Telas do calendário: entrega, validação, remarcação e agendamento de treinamento **existem no
servidor** mas a janela de atividade está mínima. O calendário em grade é básico.

O usuário reclamou repetidamente da estética. A identidade visual está definida
(azul `#111785`, verde `#01973A`, amarelo `#FFEE03` — **não existe vermelho na marca**;
o vermelho é só sinal de alerta), mas o acabamento das telas está aquém.

## Para quem continuar

Peça ao usuário os arquivos originais: as três planilhas (`.xlsx`) e os dois scripts
(`GSL_Bartofil_v10.gs`, `Dados.gs`). Sem eles você vai reinventar e errar — foi o que aconteceu aqui.

O caminho mais rápido é portar as funções que faltam **verbatim** dos scripts dele, trocando
apenas a camada que desenhava na planilha (`setBackground`, `setFormula`, escrever em célula)
por retorno de dados para a tela. A lógica de negócio passa intacta.
