# Avaliação dos Coordenadores pela Supervisão

Os supervisores avaliam os coordenadores num Google Forms **anônimo**. As respostas caem numa planilha, e o `relatorio.html` monta o relatório final, pronto para imprimir.

| Arquivo | Para que serve |
|---|---|
| `Formulario.gs` | Apps Script que cria o formulário e a planilha de respostas |
| `appsscript.json` | Manifesto com as permissões fixas (evita autorização repetida) |
| `relatorio.html` | Relatório visual: importa o CSV das respostas e imprime |
| `relatorio-exemplo.pdf` | Como o relatório sai impresso (dados de exemplo, nomes fictícios) |

## O que é avaliado

Escala de 1 (discordo totalmente) a 5 (concordo totalmente), em 18 itens:

- **Liderança e comunicação** (5 itens): clareza das metas, repasse da gerência, disponibilidade, escuta e feedback
- **Gestão do turno** (5 itens): planejamento, divisão justa das tarefas, resolução de problemas, decisão e indicadores
- **Postura e relacionamento** (5 itens): respeito, imparcialidade, exemplo, apoio à supervisão e calma sob pressão
- **Desenvolvimento da equipe** (3 itens): incentivo ao crescimento, delegação e reconhecimento

No fim vêm a nota geral (0 a 10), os pontos fortes, o que precisa melhorar e as sugestões.

## 1. Criar o formulário (uma vez só)

1. Abra uma **janela anônima** no Chrome (Ctrl + Shift + N) e entre **só** com a conta da empresa. Com mais de uma conta logada aparece o erro 403.
2. Vá em **script.google.com** → **Novo projeto** → renomeie para **Avaliação Coordenadores**.
3. **Configurações do projeto** (engrenagem) → marque **Mostrar arquivo de manifesto "appsscript.json" no editor**.
4. Volte em **Editor**, abra o `appsscript.json`, apague tudo e cole o `appsscript.json` desta pasta.
5. Abra o `Código.gs`, apague tudo e cole o `Formulario.gs` desta pasta.
6. Troque os nomes da lista `COORDENADORES` pelos nomes reais. Salve com **Ctrl + S**.
7. Com a função **criarFormulario** selecionada, clique em **Executar** → **Revisar permissões** → conta da empresa → **Permitir**.
   Se aparecer "O Google não verificou este app": **Avançado** → **Acessar Avaliação Coordenadores (não seguro)**.
8. No **Registro de execução** aparecem os links: o dos supervisores, o de edição e o da planilha.

Se clicar em Executar de novo, **nada é duplicado**: o script só mostra os links outra vez.

**Não mude os títulos das perguntas** depois de criar. O relatório usa esses títulos para ler as respostas.

## 2. Ajustar e enviar

1. Abra o **link de edição** → ícone de **paleta** → **Cor**: azul.
2. Se aparecer o botão **Publicar**, clique nele.
3. Aba **Configurações** → **Respostas** → confira **Coletar endereços de e-mail: Não coletar**.
4. **Enviar** → ícone de **corrente** → marque **Encurtar URL** → **Copiar**. Mande esse link aos supervisores.

## 3. Gerar o relatório

1. Abra a planilha **Respostas - Avaliação dos Coordenadores pela Supervisão**.
2. **Arquivo** → **Fazer download** → **Valores separados por vírgula (.csv)**.
3. Abra o `relatorio.html` no **Chrome do computador** (dois cliques no arquivo).
4. Arraste o CSV para a área tracejada (ou clique em **Escolher arquivo CSV**).
5. Clique em **Imprimir tudo** → Destino: **Salvar como PDF** ou a impressora → **Mais definições** → marque **Gráficos de plano de fundo**.
   Para só um coordenador: vá até a página dele e clique em **Imprimir esta página**.

O CSV é lido só no seu navegador. Nenhuma resposta sai do computador e nenhuma resposta vai para este repositório.

## O que o relatório mostra

**Página de resumo (1 folha):** total de avaliações, nota média, ranking dos coordenadores, mapa de calor por critério, visão geral da empresa e participação por turno.

**Uma página por coordenador (2 folhas cada):**
- nota geral (0 a 10), média de 1 a 5 e % de respostas 4 e 5
- os 4 critérios comparados com a média de todos os coordenadores
- os 3 pontos mais fortes e os 3 pontos para desenvolver
- os 18 itens com a distribuição das respostas
- resultado por turno, tempo de convivência e os comentários escritos
- quadro de **plano de desenvolvimento** e assinaturas para a reunião de devolutiva

## Anonimato

- O formulário não coleta e-mail.
- Os comentários saem em ordem alfabética, não na ordem de envio.
- Turno com só 1 avaliação aparece oculto.
- Coordenador com menos avaliações que o mínimo (padrão: 3, ajustável na barra do relatório) recebe o aviso "Amostra pequena" e não tem a divisão por turno.
