# GSL Bartofil — versão final

Sistema de Gestão Operacional do CD Feira de Santana, como web app do Google Apps Script.

## Arquivos (17)

**Código (.gs)** — 13 arquivos
- `Codigo.gs` — porta de entrada (doGet), catálogo de ações, cache de telas
- `Auth.gs` — identificação da pessoa e resolução do nome
- `Permissoes.gs` — telas, perfis, capacidades e escopos
- `Banco.gs` — camada de dados sobre a planilha, com cache
- `Datas.gs` — datas, fuso e competências
- `Calendario.gs` — mês, atividades, validação, remarcação, cancelamento
- `Central.gs` — tela inicial, insights e apresentação
- `Dados.gs` — BI de assiduidade (importação, ETL, painel, ranking, período)
- `Emails.gs` — digesto, avisos e gatilhos
- `Entrega.gs` — várias fotos/arquivos viram um PDF único
- `Arquivos.gs` — anexos no Drive
- `Config.gs` — tela de configuração
- `Instalacao.gs` — esquema, instalação e perfis padrão

**Interface (.html)** — 4 arquivos
- `Index.html` — estrutura, céu animado, telas de login/espera
- `App.html` — todo o JavaScript do cliente
- `Estilo.html` — CSS completo
- `Marca.html` — logo e identidade

**`appsscript.json`** — manifesto com os 7 escopos necessários

## Como subir

1. Substitua cada arquivo no editor do Apps Script (cole por cima, não crie duplicado).
   Atenção: se o seu projeto tem `config.gs` em minúsculo, cole nele — não crie `Config.gs`.
2. Salve (Ctrl+S) e espere o ícone de nuvem parar.
3. Implantar → Gerenciar implantações → editar (lápis) → **Nova versão** → Implantar.
4. Na primeira abertura o Google pede autorização — aceite tudo (Gmail, Drive, Documentos).

## Depois de subir

- **Configuração → Ligar rotinas automáticas** — deixa o selo verde (4 de 4).
- **Configuração → Restaurar níveis de acesso** — garante Coordenador correto.
- **Configuração → Apresentações** — cole os 3 links do Google Apresentações.
- **Configuração → Arquivos do RH** — a aba da folha deve ser **FOLHA DE PONTO**.

## Detalhes que valem lembrar

- **Login sem senha**: a pessoa informa o e-mail cadastrado; fica salvo no navegador dela.
- **Fotos → PDF**: várias fotos viram um PDF único, uma por página (HEIC também).
- **Mês novo**: nasce sozinho a partir do dia 20, ou pelo botão "Gerar próximo mês".
- **Meses passados**: somem do seletor e não entram em nenhum indicador.
- **Filtro por turno**: desligado por ora — todos veem todas as atividades.
  Para religar, veja `dentroDoEscopo()` em Calendario.gs (a lógica está comentada lá).
