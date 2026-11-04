# Escala de Limpeza – Loja Bartofil

App da rotina de limpeza da loja (Lu e Agnaldo), com escala equilibrada, POPs por ambiente, plano de ação e exportação para o Google Planilhas e PDF.

## Arquivos
| Arquivo | Para quê |
|---|---|
| `apps-script/Codigo.gs` | Código do servidor (Google Apps Script) |
| `apps-script/Index.html` | O app |
| `apps-script/appsscript.json` | Manifesto (permissões e configuração do app da Web) |
| `index.html` | Cópia do app para abrir direto no navegador, sem Google (dados ficam só naquele navegador) |

---

## Instalação no Google Apps Script

### 1. Criar a planilha
1. Abra o Google Drive com a conta da Bartofil.
2. Clique em **Novo > Planilhas Google > Planilha em branco**.
3. Renomeie para **Escala de Limpeza – Loja**.

### 2. Abrir o Apps Script
1. Na planilha, vá em **Extensões > Apps Script**.
2. No canto superior esquerdo, clique em **Projeto sem título** e renomeie para **Escala de Limpeza – Loja**.

### 3. Mostrar o manifesto
1. Na barra da esquerda, clique na engrenagem **Configurações do projeto**.
2. Marque **Mostrar arquivo de manifesto "appsscript.json" no editor**.
3. Volte em **Editor** (ícone `< >` na barra da esquerda).

### 4. Colar os três arquivos
1. Clique em **Código.gs**, apague tudo e cole o conteúdo de `apps-script/Codigo.gs`.
2. Clique em **appsscript.json**, apague tudo e cole o conteúdo de `apps-script/appsscript.json`.
3. Clique no **+** ao lado de Arquivos > **HTML**, digite o nome `Index` (sem `.html`) e confirme.
4. Apague o conteúdo do Index e cole o conteúdo de `apps-script/Index.html`.
5. Clique em **Salvar projeto** (ícone de disquete).

### 5. Rodar a instalação uma vez
1. Na barra de cima, no seletor de funções, escolha **instalar**.
2. Clique em **Executar**.
3. Na janela de autorização: **Revisar permissões >** escolha sua conta **> Permitir**.
4. No registro de execução deve aparecer **Execução concluída**.

Isso cria a aba oculta `_dados` na planilha e a pasta **Escala de Limpeza – Loja Bartofil** no seu Drive.

### 6. Publicar o app
1. Clique em **Implantar > Nova implantação**.
2. Na engrenagem ao lado de "Selecione o tipo", escolha **App da Web**.
3. Descrição: `Escala de limpeza v1`.
4. Executar como: **Eu**.
5. Quem pode acessar: **Qualquer pessoa em Bartofil** (só contas da empresa).
6. Clique em **Implantar** e copie o **URL do app da Web**. Esse é o link do app.

### 7. Usar pela planilha
Ao reabrir a planilha aparece o menu **Escala de limpeza** com:
- **Abrir o app**: mostra o link do app.
- **Abrir a pasta de exportações no Drive**.
- **Instalar ou reparar**.

### Atualizar depois de uma mudança no código
1. Cole o código novo nos arquivos e salve.
2. **Implantar > Gerenciar implantações >** lápis na implantação ativa **> Versão: Nova versão > Implantar**.
O link continua o mesmo.

---

## O que o app faz

- **Hoje**: linha do tempo do dia com picos, almoço e hora atual; checklist de cada um com tarefas atrasadas, tarefa pesada e o POP de cada tarefa.
- **Semana**: grade da semana por pessoa. Botões para imprimir o checklist (uma folha A4 por pessoa) e **Exportar escalas**.
- **Exportar escalas** (só na versão Google): cria ou atualiza na planilha as abas `Escala Lu`, `Escala Agnaldo`, `Rodízio` e `Carga`, com caixas de seleção, e salva um PDF da escala de cada um na pasta do Drive, subpasta **Escalas**.
- **Distribuição**: arrastar blocos para mudar horário ou pessoa; painel **Equilíbrio do trabalho** com a carga de cada um, dia a dia e por ambiente, e o botão **Equilibrar automaticamente**.
- **Escala**: rodízio dos turnos, inversões pontuais, horários, picos, dias de expediente, curso de trabalho em altura, logo e backup.
- **POPs**: 11 procedimentos da loja (banheiros, piso, prateleiras, caixa, carrinhos, estacionamento, altura, devolução/depósito, administrativo, refeitório). Editáveis, com impressão em A4 retrato (uma página por POP) e **Gerar PDFs no Drive**, subpasta **POPs**.
- **Plano de ação**: ações com responsável, prazo e status.

## Como o trabalho fica equivalente
- Cada tarefa tem um esforço: leve (1), médio (2) ou pesado (3). Carga = minutos x esforço.
- Os dois turnos têm a mesma carga ponderada por dia (diferença de até ~10% em dias com tarefa mensal ou trimestral).
- Os dois fazem lavagem pesada, revisões, carrinhos, prateleiras, refeitório e lixeiras todos os dias.
- As tarefas seguem o turno e o turno alterna toda semana: em 2 semanas, Lu e Agnaldo fazem exatamente o mesmo trabalho.

## Banheiros
- Banheiros gerais: lavagem completa todos os dias às 07:00.
- Banheiro de funcionários: lavagem completa todos os dias às 14:45.
- Revisão dos banheiros (gerais e funcionários): 7 vezes ao dia, distribuída entre os dois turnos.
