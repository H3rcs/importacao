# Correções desta rodada — desempenho e tema

Duas frentes: o app estava lento e o tema não batia com a referência
(`atividades_2026.html`). As duas causas eram independentes.

---

## Frente 1 — lentidão do lado do navegador (era a maior)

O que travava, no `Estilo.html` antigo:

| Problema | Por que custava |
|---|---|
| 3 `.nebulosa` com `filter: blur(90px)` animando para sempre, com `mix-blend-mode: screen` | blend mode impede o navegador de promover a camada para a GPU — cada quadro remisturava a tela inteira |
| `.cartao` com `backdrop-filter: blur(18px)` | cada cartão reamostra o fundo desfocado a cada quadro; uma tela com 15 cartões = 15 desfoques por quadro, sobre um fundo que nunca para |
| `.aurora` animando `background-position` | repinta a superfície inteira a cada quadro |
| `.estrelas` piscando `box-shadow` | repaint por estrela, por quadro |

O que ficou no lugar:

- Nenhuma animação de cor, sombra, filtro ou `background-position` no céu.
  Só `transform` e `opacity` — as duas propriedades que o compositor
  resolve sozinho, sem repintar.
- `mix-blend-mode` removido; `will-change: transform` nas camadas com
  `blur()`, então o desfoque é calculado uma vez e depois só deslizado.
- `backdrop-filter` só sobrou em 2 lugares: barra lateral e janela modal.
  Fora dos cartões.
- `contain: strict` no `.ceu`: mexer no fundo nunca reprocessa o conteúdo.
- Atalho para máquina fraca: `<html class="sem-animacao">` congela o céu
  inteiro sem tirar o visual.

**Medido: 60 FPS** na prévia, com as 12 partículas e as duas camadas de
estrelas rodando.

## Frente 2 — tema fiel à referência

- **Modo noturno:** espaço com gradientes radiais, duas camadas de
  estrelas (uma que deriva devagar, outra maior que pulsa a cada 4,5 s),
  nebulosa roxa de 700px (`#8B5CF6` sobre `#581C87`), mais a rosa e a
  ciano. Opacidade das nebulosas subiu de 0,5 → 0,62.
- **Estrelas cadentes removidas** — eram o "espelho" atravessando a tela.
- **Modo claro:** aurora pastel (`#DBEAFE → #E0E7FF → #FCE7F3 → #D1FAE5`),
  duas ondas, três cristais e seis bolhas subindo.
- **Neon:** `#00F3FF`, `#BC13FE`, `#0AFF68`, `#FF2D95`, `#FFB800` no
  escuro, com versões escurecidas no claro (senão some no papel branco).
  Fita neon de 3px no topo de cada cartão; números dos KPIs pintados com
  o gradiente da própria fita.
- **Interação:** cartão sobe 3px com curva elástica
  `cubic-bezier(.34, 1.56, .64, 1)`, acende a borda neon e leva uma
  varredura de luz no hover. Entrada escalonada até o 6º cartão.

### Defeitos que apareceram no caminho

- `.meteoro:nth-of-type(1)` nunca casava — `nth-of-type` conta por **tag**,
  e eram todas `<div>`. Agora cada camada tem classe própria (`c1..c3`).
- `.topo` (cabeçalho fixo) pintava uma faixa **opaca** na cor `--fundo`
  por cima do céu: como a aurora muda de cor e o `--fundo` não, aparecia
  um retângulo claro recortado no fundo. Agora desfoca o que passa por
  baixo e some com máscara, sem aresta.
- `.serie-barra` (barras do gráfico) vinha em `--alerta`, vermelho.
  Vermelho é sinal de problema, não cor de gráfico — e não existe na
  marca Bartofil. Padrão agora é ciano/roxo, com variantes
  `.verde .amarela .vermelha` para status.

## Frente 3 — lentidão do lado do servidor

| Onde | Antes | Agora |
|---|---|---|
| `App.html` | todo clique no menu = ida ao servidor (1–3 s), sem cache; voltar a uma tela já vista pagava de novo | `CACHE_TELAS`: pinta na hora e revalida por trás. Menos de 20 s, nem revalida. Gravação limpa tudo |
| `Banco.gs` `limparCache()` | qualquer gravação apagava `perfis`, `acessos` e `assiduidade` — salvar uma atividade obrigava todo mundo a remontar a matriz de permissões | `limparCache(tabela)`: cada tabela derruba só o cache que alimenta. Sem argumento ainda apaga tudo (instalação e botão "Atualizar dados") |
| `Banco.gs` `registrarLog()` | um `appendRow` de rede por gravação — dobrava o tempo de toda escrita, só por auditoria | balde no cache, desce de 10 em 10 numa escrita só. `descarregarLog()` esvazia na hora e roda no gatilho diário |
| `Auth.gs` `usuarioAtual()` | recalculado a cada chamada (e às vezes mais de uma vez na mesma requisição) | memorizado por execução em `_usuarioDaVez`; a variável morre com a requisição, então nunca serve a identidade de uma pessoa para outra |

## Frente 4 — a lentidão que sobrou (2ª rodada)

O cache da rodada anterior só ajudava na **volta** a uma tela. A primeira
visita de cada tela, e a entrada no app, continuavam pagando o preço cheio.

| Onde | O que foi feito |
|---|---|
| `Codigo.gs` `carregarTela()` | payload da tela guardado no servidor por 180 s. Numa repetição o `openById` nem acontece — a resposta volta sem tocar na planilha |
| `Codigo.gs` `chaveDeTela()` | a chave não leva o e-mail: leva perfil, escopo e turno. Dez coordenadores do turno B dividem o mesmo payload e o primeiro paga por todos. Só escopo `PROPRIAS` é pessoal |
| `Banco.gs` `geracaoDados()` | não dá para apagar chaves que não se consegue listar, então toda chave carrega um número de geração; qualquer gravação avança o número e o que era velho vira lixo que expira sozinho. Sem janela de dado desatualizado |
| `Banco.gs` `gravarTextoCache()` | o `CacheService` recusa valores acima de 100 KB **em silêncio** — grava "com sucesso" e a leitura volta vazia. O texto agora é fatiado em pedaços de 90 KB e remontado |
| `Banco.gs` `prop()` | as propriedades eram lidas dezenas de vezes por requisição, uma chamada de serviço cada. Agora é uma leitura por execução |
| `App.html` `prebuscar()` | assim que a tela inicial aparece, o app busca as outras sozinho, uma de cada vez, e guarda. Ao clicar no menu o dado já chegou |
| `Codigo.gs` `aquecerCache()` | gatilho de 15 em 15 minutos, das 5h às 21h, monta as telas principais e deixa prontas. Quem abre o app encontra a resposta já feita |

### Por que uma de cada vez na prebusca

O Apps Script enfileira as chamadas do mesmo usuário. Disparar as cinco
telas juntas só faria a primeira demorar mais — e é justamente a que a
pessoa está olhando.

### O que ainda vai demorar

A **primeiríssima** abertura depois de o projeto ficar horas parado. É o
ambiente do Apps Script sendo criado do zero; nenhum código evita isso. O
gatilho de aquecimento existe justamente para que essa situação seja rara
em horário de trabalho.

## Frente 5 — segunda camada de desempenho (3ª rodada)

| Onde | O que foi feito |
|---|---|
| `Banco.gs` `listar()` | as tabelas quentes (`ATIVIDADES`, `COLABORADORES`, `FATO_ASSIDUIDADE`, `PERFIS`, `SETORES`, `ROTINAS`, `PARAMETROS`, `DE_PARA`, `AGR_COLAB`) ficam guardadas já montadas entre execuções. Uma tela que não achou payload pronto ainda evita as leituras de planilha |
| `Banco.gs` `listar()` | `getDataRange()` percorre tudo que a aba já teve, inclusive linhas vazias que só ficaram formatadas. Agora pede o retângulo exato (`getLastRow` × `getLastColumn`) |
| `Banco.gs` `semObjetos()` | só guarda a tabela se todo valor for texto ou número. Uma célula que volte como `Date` viraria string na ida e volta pelo JSON e o código que espera `Date` quebraria em silêncio — defeito que só aparece semanas depois |
| `Codigo.gs` `montarBootstrap()` | o bootstrap também custa (confere esquema, identifica a pessoa, monta as telas, olha o RH). Agora entra no mesmo esquema de geração. O tema fica fora do cache: é preferência do navegador |
| `Codigo.gs` `aquecerCache()` | passa a aquecer o bootstrap do administrador junto com as telas |
| `Codigo.gs` `diagnostico()` | mede e escreve no registro o custo de abrir o banco, de cada tabela e de cada tela, com e sem cache. Serve para parar de adivinhar onde o tempo está indo |

### Efeito colateral a conhecer

Quem editar a planilha **na mão**, por fora do app, pode levar até 5 minutos
para ver a mudança aparecer — o app não tem como saber que alguém mexeu.
Gravação feita pelo app invalida na hora. O botão **Atualizar dados** também
limpa tudo na hora.

## O bug do e-mail que não saía

O `appsscript.json` declarava o escopo `script.send_mail`. Esse escopo só
permite a forma **simples** do `MailApp.sendEmail` — o sistema usa a forma
com `htmlBody` e `cc`, que exige o escopo completo `https://mail.google.com/`.
Resultado: o `MailApp` lançava erro, e a função `enviar` **engolia o erro
no LOG** em vez de mostrá-lo. Por isso a ação parecia dar certo (a atividade
cancelava, a validação gravava) mas nenhum e-mail chegava, sem aviso nenhum.

Três correções:
- Escopo trocado para `https://mail.google.com/` no manifesto.
- `enviar` agora **propaga a falha**: se o e-mail não sai, a pessoa vê o
  erro na tela em vez de achar que enviou.
- `testarEmail()` para rodar pelo editor (Executar → testarEmail): diz a
  cota restante e dispara um teste ao admin. Se falhar aqui, é autorização.
- `emailsDoTurno` passa a usar o e-mail **atual** da EQUIPE, não o que
  ficou congelado na linha quando a atividade foi gerada.

**IMPORTANTE:** trocar o escopo obriga uma **reautorização**. Depois de
subir o `appsscript.json`, o Google vai pedir os acessos de novo na próxima
abertura — aceite, senão o envio continua barrado.

### O que não foi mexido e por quê

- `doGet` continua entregando bootstrap + primeira tela dentro do HTML.
  É o menor tempo total até a primeira tela útil, mesmo deixando a tela
  branca um pouco mais.
- Nada foi rodado no Apps Script real — só verificação de sintaxe.
  **Teste pela URL `/dev` antes de publicar versão.**
