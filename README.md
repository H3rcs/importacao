# GSL Bartofil — Sistema de Gestão Operacional (v5)
### CD Feira de Santana · Turnos A / B / C · Coordenadores + Gerência

A v4 transforma o calendário em um **sistema**: dados estruturados, painel
executivo com gráficos e meses gerados automaticamente para sempre.

---

## O que há no pacote

| Arquivo | O que é |
|---|---|
| `GSL-Bartofil-Calendario-v5.xlsx` | A planilha (importar no Google Drive) |
| `Code.gs` | Automações v6 (Apps Script) — e-mails, anexos, meses infinitos, ocorrências, insights, relatório PDF, auditoria e backup |
| `Modelo-Relatorio-Semanal.docx` | Modelo Word do Relatório Semanal Consolidado |
| `README.md` | Este guia |

## Os upgrades da v5 (inteligência e governança)

### Motor de insights — aba INSIGHTS
O script analisa os registros e **escreve diagnósticos em português**: setor com
tendência de alta de erros, problemas recorrentes (3+ semanas), absenteísmo
fora da curva por turno, concentração de erros por dia da semana, colaborador
com afastamentos recorrentes, turnos com atrasos ativos e melhorias
comprovadas — cada um com recomendação. Roda toda quinta, entra no briefing
do gerente e no relatório mensal. Manual: menu → **Gerar insights agora**.

### Score e ranking de turnos — aba SCORE
Nota **0–100** por turno e mês: Aprovação (40) + Pontualidade (30) +
Absenteísmo (30) — pesos e meta editáveis nas células amarelas. A pontualidade
usa uma marca interna carimbada no 1º dia de atraso: entregar depois **não
apaga o histórico**. Medalhas do mês, líder e ranking completo.

### Relatório executivo mensal (PDF)
Todo **dia 1º às 6h** o script fecha o mês anterior num PDF com KPIs, score,
top setores em erros, insights e os gráficos do PAINEL; salva na pasta
**Relatórios** do Drive e envia à gestão e à diretoria (CONFIG!D16).
Manual: menu → **Gerar relatório mensal (PDF) agora**.

### Governança — aba LOG, backup e diagnóstico
Toda alteração em campo crítico (prazo, validação, motivo, setor, anexo,
atividade, ocorrências, CONFIG) vira uma linha na aba **LOG**: quem, quando,
valor anterior e novo. Backup mensal automático da planilha inteira no Drive
(mantém os 12 últimos). Menu → **Diagnóstico do sistema** confere e-mails,
gatilhos, abas, capacidade e links num clique.

## Os 3 grandes upgrades da v4 (mantidos)

### 1 · Dados estruturados — aba OCORRÊNCIAS
Cada **erro operacional, falta ou atestado** vira UM registro (data, tipo,
turno, setor, quantidade, descrição), lançado pelo menu
**GSL Bartofil → Registrar ocorrência** ou digitado direto na aba.
É a **fonte única**: as colunas FALTAS/ATESTADOS das abas mensais, a GERÊNCIA
e o PAINEL somam sozinhos a partir dela — nada é digitado duas vezes, e o
histórico fica analisável para sempre.

### 2 · Painel executivo — aba PAINEL
KPIs do mês (erros, absenteísmo, variação vs. mês anterior, setor crítico,
% concluído) e 4 gráficos que se preenchem sozinhos:
- **Pareto — onde o CD mais erra** (top setores);
- **Erros por mês, por turno** (colunas empilhadas);
- **Absenteísmo por mês, por turno** (linhas);
- **% de atividades concluídas por mês** (tendência).

### 3 · Meses infinitos
As abas mensais agora são 100% dirigidas por fórmula a partir de uma âncora.
Todo **dia 20 às 6h** o script duplica a aba oculta `MODELO_MES`, cria o mês
seguinte pronto (calendário, IDs, prazos, validações) e avisa a gestão por
e-mail. Também dá para criar na hora: **menu → Gerar aba do próximo mês**.
CENTRAL, GERÊNCIA e PAINEL já esperam os meses até DEZ/2027 e passam a
enxergar cada aba assim que ela nasce.

## O ritmo da semana (inalterado)
- **QUA** — Vistoria Setorial (setor definido pelo gerente na coluna J);
- **QUI** — Relatório Semanal Consolidado (1 documento único);
- **SEX** — Reunião Semanal com a Gerência — o marco da semana;
- Mensais: Férias (1ª segunda), Mudança de Função (última sexta),
  Treinamentos (seção verde de cada aba, quando o gerente marcar).

## E-mails automáticos (v4/v5)
- **Digesto matinal único (7h)** por coordenador: atrasadas, vence hoje,
  vence AMANHÃ, próximos prazos — um só e-mail com tudo;
- **Briefing do gerente** na véspera e na manhã da reunião (retrato da
  GERÊNCIA + pauta sugerida);
- **Tempo real**: entrega anexada, Aprovado/Reprovado com motivo, prazo
  alterado, setor definido, treinamento marcado, cancelamentos;
- **Dia 20**: aviso de que a aba do próximo mês foi criada.

## Instalação (5 min)
1. Suba o `.xlsx` no Google Drive e abra;
2. **Arquivo → Salvar como Planilhas Google** (obrigatório);
3. Extensões → Apps Script → cole o `Code.gs` → salvar;
4. Preencha a aba **CONFIG** (nomes/e-mails);
5. No Apps Script, execute **instalarGatilhos** 1 vez e autorize;
6. Recarregue: o menu **GSL Bartofil** aparece;
6b. Rode **Diagnóstico do sistema** no menu — tudo deve estar ✔;
7. Suba os modelos Word no Drive e cole os links na aba INÍCIO (linhas 12-13);
8. **Não exclua nem renomeie a aba oculta `MODELO_MES`.**

## Observações técnicas
- Os gráficos do PAINEL são nativos e importam para o Planilhas Google;
  confira-os após o passo 2 (bar/linha convertem direto — se algum vier sem
  série, basta apontar o intervalo indicado nas colunas N+ do PAINEL).
- A aba OCORRÊNCIAS comporta 600 registros com fórmulas prontas (± 2 anos de
  uso); para ampliar, selecione a última linha e arraste as colunas H:J.
- Limite de upload pelo diálogo de anexo: 25 MB (acima disso, cole o link do
  Drive na coluna LINK DO ANEXO).

Paleta oficial Bartofil: azul `#111785` · verde `#01973A` · amarelo `#FFEE03`.
