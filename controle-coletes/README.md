# Controle de Coletes

Planilha Google Sheets + Apps Script para controlar os coletes entregues aos fornecedores na recepção.

- **P1** entrega os coletes conforme o número de pessoas no caminhão.
- **P2** recolhe os coletes na saída.

Registra fornecedor, placa, coletes entregues, coletes devolvidos, falta e tempo no pátio.

## Sem autorização e sem erro 403

- Usa só gatilhos simples (`onOpen` e `onEdit`), que não pedem autorização da conta.
- `@OnlyCurrentDoc`: o script só tem acesso a esta planilha.
- Não tem web app, menu personalizado nem janela (HtmlService).
- **Não clique em "Executar" no editor do Apps Script.** Se clicar, o Google pede autorização.

## Instalação

1. Abra **sheets.new** e dê o nome "Controle de Coletes".
2. Vá em **Extensões → Apps Script**.
3. Apague o conteúdo de `Código.gs`, cole o `Codigo.gs` desta pasta e salve (Ctrl+S).
4. Feche o Apps Script, volte para a planilha e aperte **F5**. O painel se monta sozinho.
5. Na aba **CONFIG**, digite em **B2** o total de coletes e em **B4** o nome da empresa (aparece no cabeçalho).
6. Compartilhe com o pessoal da P1 e da P2 como **Editor**.

## Abas

| Aba | Para que serve |
|---|---|
| COLETES | Painel: indicadores, bloco ① P1 (entrega), bloco ② P2 (devolução) e lista dos caminhões no pátio |
| REGISTRO | Histórico completo (não editar à mão) |
| FORNECEDORES | Lista de fornecedores, que cresce sozinha |
| CONFIG | Total de coletes, nome no cabeçalho e lista automática de placas no pátio |

## Regras automáticas

- Placa padronizada (maiúsculas, sem traço), aceita ABC1234 e ABC1D23.
- Não aceita a mesma placa duas vezes no pátio.
- Não aceita devolução maior que a entrega.
- Devolução menor que a entrega fica registrada como **DEVOLVIDO C/ FALTA** e desconta do estoque.

Cores: azul `#111785`, verde `#01973A`, amarelo `#FFEE03`.
