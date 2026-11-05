# Escala de Limpeza – Loja

App da rotina de limpeza da loja: escala de cada colaborador (dia, semana e mês), alternância semanal das tarefas compartilhadas, equilíbrio de carga, POPs por ambiente e plano de ação. Roda no Google Apps Script, com os dados numa planilha.

Nome da empresa e logo **não ficam no código**: são digitados no app (Equipe > Identidade) e salvos na planilha.

## Arquivos
| Arquivo | Para quê |
|---|---|
| `apps-script/Codigo.gs` | Servidor (Apps Script) |
| `apps-script/Index.html` | O app |
| `apps-script/appsscript.json` | Manifesto, **sem** lista de permissões |
| `index.html` | Cópia para abrir direto no navegador, sem Google (salva só naquele navegador) |

---

## Instalação (faça com a conta Google da empresa)

### 1. Planilha
1. No Google Drive, clique em **Novo > Planilhas Google > Planilha em branco**.
2. Renomeie para **Escala de Limpeza – Loja**.

### 2. Apps Script
1. Na planilha, vá em **Extensões > Apps Script**.
2. Clique em **Projeto sem título** e renomeie para **Escala de Limpeza – Loja**.
3. Na engrenagem **Configurações do projeto**, marque **Mostrar arquivo de manifesto "appsscript.json" no editor**.
4. Volte em **Editor** (ícone `< >`).

### 3. Colar os arquivos
1. **Código.gs**: apague tudo e cole `apps-script/Codigo.gs`.
2. **appsscript.json**: apague tudo e cole `apps-script/appsscript.json`.
3. **+ > HTML**, nome `Index` (sem `.html`): apague tudo e cole `apps-script/Index.html`.
4. Clique em **Salvar projeto**.

### 4. Autorizar pelo editor (uma vez)
1. Clique no arquivo **Código.gs** (o botão Executar só aparece com um `.gs` aberto).
2. No seletor de função, escolha **instalar**.
3. Clique em **Executar** > **Revisar permissões** > sua conta > **Avançado** > **Acessar** > **Permitir**.
4. O registro deve mostrar **Instalação concluída**.

Autorizando pelo editor, o app publicado não fica pedindo permissão de novo.

### 5. Publicar
1. **Implantar > Nova implantação**.
2. Engrenagem ao lado de "Selecione o tipo" > **App da Web**.
3. Executar como: **Eu**.
4. Quem pode acessar: **Qualquer pessoa da** (organização da empresa).
5. **Implantar** e copie o **URL do app da Web**.

### 6. Primeiro acesso
1. Abra o link.
2. Vá em **Equipe > Identidade**: digite o nome da empresa e envie a logo.
3. Confira os horários em **Equipe** e o plano de ação.

### Atualizar depois
1. Cole o código novo e salve.
2. **Implantar > Gerenciar implantações >** lápis **> Versão: Nova versão > Implantar**.

---

## Se não salvar na planilha
O selo no topo mostra a situação: **Salvo na planilha**, **Salvando…** ou **Não salvou na planilha**. Clique nele para o diagnóstico, que testa cada etapa e mostra o erro real do Google. Uma cópia fica sempre no navegador, então nada se perde enquanto o problema é resolvido.

Causas mais comuns:
- **Mais de uma conta Google aberta no navegador** (erro 403 ou NetworkError). Abra o app numa janela anônima só com a conta dona da planilha.
- **Autorização não concluída**. Refaça o passo 4 pelo editor.
- **Implantação antiga**. Depois de colar código novo, publique uma nova versão (Atualizar depois).

Pela planilha também dá para rodar **Escala de limpeza > Diagnóstico do salvamento**.

---

## Regras da escala
- Agnaldo: 07:00 às 16:00, almoço 12:00 às 13:00, sábado 07:00 às 11:00.
- Lu: 08:30 às 18:30, almoço 13:00 às 14:00.
- Banheiros (clientes e funcionários): lavagem 1x ao dia + manutenções. Masculino com o Agnaldo, feminino com a Lu.
- Café: 07:00 Agnaldo, 12:00 Lu.
- Varrer a loja 1x ao dia + passadas de manutenção; frente de caixa antes dos picos (09:00 e 13:00) e no fim da tarde; carrinhos 3x ao dia.
- Máquina do CD às terças e quintas: loja, devolução e retira (terça), depósito (quinta). Devolução, retira e depósito varridos todo dia.
- Salas administrativas, tesouraria, escada e corredor todo dia; sala de reunião 2x por semana; sala 06 a cada 15 dias; refeitório limpeza completa + manutenções; sala 07 todo dia.
- Mensal: lonas e fachada superior (Agnaldo, altura, sábado); vitrine do térreo e estacionamento em três partes (Lu). Placas a cada 3 meses, aos sábados (Agnaldo).
- Prateleiras e armazenagem perto do caixa: fora da escala (tarefa pausada).
- Tarefas sem regra fixa alternam toda semana entre os dois (semana A e semana B). **Inverter**, na tela Equipe, troca uma semana específica.
- Carga = minutos x esforço (leve 1, médio 2, pesado 3), comparada por hora trabalhada.
