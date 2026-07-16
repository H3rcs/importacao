# GSL Bartofil — Calendário de Gestão Operacional

Sistema de acompanhamento semanal dos coordenadores de turno (A/B/C) do CD de
Feira de Santana, hospedado no Google Planilhas com automações em Apps Script.

## Arquivos

| Arquivo | Descrição |
|---|---|
| `GSL-Bartofil-Calendario-v2.xlsx` | Planilha completa (JUL-DEZ 2026): painel CENTRAL, CONFIG e 6 abas mensais com calendário-mostrador. Importar no Google Drive e **Arquivo > Salvar como Planilhas Google**. |
| `Code.gs` | Automações (Apps Script): lembretes de prazo, cobrança automática de atraso, anexo de entregas com 1 clique direto ao Drive, aprovação/reprovação com motivo, mudança de prazos, setor da vistoria, treinamentos e cancelamento por gerente/administrador. |
| `modelos/*.docx` | 6 modelos Word para download: 5 relatórios semanais (ERR, SUP, MET, FAL, ACO) + Checklist de Vistoria (VIS). Subir na subpasta Modelos da pasta do Drive e colar os links na tabela MODELOS PARA DOWNLOAD (topo da aba INÍCIO) para que os e-mails levem o link do modelo. |

## Instalação (5 min)

1. Suba o `.xlsx` no Google Drive, abra e use **Arquivo > Salvar como Planilhas Google** (obrigatório — em modo XLSX o script não roda).
2. **Extensões > Apps Script**, cole o conteúdo de `Code.gs` e salve.
3. Preencha a aba **CONFIG** (nomes e e-mails da equipe) e, depois, cole os links dos modelos na aba **INÍCIO**.
4. No editor do Apps Script, execute `instalarGatilhos` uma vez e autorize.
5. Recarregue a planilha — o menu **GSL Bartofil** aparece na barra.

## Cronograma semanal

SEG Erros Operacionais (ERR) - TER Suporte de Supervisores (SUP) - QUA Vistoria
Setorial (VIS) - QUI Metas (MET) - SEX Faltas e Atestados (FAL) + Acompanhamento
c/ Supervisores + Reunião Semanal com a Gerência (rastreada: lembrete, mudança de data e validação pelo gerente) - Férias (FER) na
1ª segunda do mês - Mudança de Função (MDF) na última sexta - Treinamentos (TRE)
programados pelo gerente.

## Lembretes e cobrança de atraso

O gatilho diário (7h) envia lembrete 2 dias antes e no dia do prazo. Vencido o
prazo sem entrega, o coordenador recebe cobrança automática **a cada 3 dias**
(com cópia para gerente e administrador) até anexar o relatório ou a atividade
ser cancelada. Os intervalos são configuráveis na CONFIG (D12/D13).
