# GSL 4.2.2 — o que mudou e como publicar

O código-fonte está na pasta `GSL/`. O `GSL-v4.2.2.zip` tem o projeto inteiro até o pedido de 13/10. Os arquivos que mudaram em 14/10 estão listados no pedido de 14/10 e foram enviados à parte, no `GSL-ferias-14-10-v2.zip` (a aba Férias refeita; substitui o `GSL-ferias-14-10.zip`). Os de 19/10 estão no pedido de 19/10 e no `GSL-19-10.zip`; os de 20/10, no pedido de 20/10 e no `GSL-20-10.zip`; os de 21/10, no pedido de 21/10 e no `GSL-21-10.zip`. A `4.2.2` parte da `4.2.1` que você enviou. Ela corrige o que impedia o sistema de abrir e tudo o que duas rodadas de revisão completa encontraram:
- 1ª rodada: 57 achados; 55 confirmados e corrigidos.
- 2ª rodada (sobre as próprias correções e sobre os painéis): 39 achados; 37 confirmados e corrigidos.

## Por que o sistema ficava travado na entrada

O erro da foto (`Uncaught SyntaxError: Failed to execute 'write' on 'Document': Unexpected token 'class'`) não vinha do login. Vinha do jeito como o Google entrega a página.

Ao servir a página, o Apps Script apaga tudo o que **parece** comentário de JavaScript (`//` e `/*`). Ele faz isso sem entender textos entre crases (os "templates" que o GSL usa para montar as telas). Dentro de um desses textos, o campo de anexo da atividade tinha `accept="image/*,..."`. O Google tomava aquele `/*` como começo de comentário e apagava o código até o próximo `*/`. Com isso, **o App.html inteiro deixava de rodar**: a página ficava parada em "Abrindo o sistema…" e nenhum botão respondia. A 4.0/4.1, a 4.2 e a 4.2.1 tinham esse trecho.

Havia ainda outras quatro coisas que prendiam a pessoa na entrada, principalmente no servidor em nuvem:
- **várias contas Google no mesmo navegador:** o Google recusa a conversa com `PERMISSION_DENIED`, e a reserva só reagia ao erro 403;
- **`Conversas.gs` antigo esquecido no projeto:** o Apps Script recusava carregar o projeto inteiro;
- **fonte do Google bloqueada ou lenta:** a abertura esperava a fonte;
- **`location.reload()` dentro da moldura do Google:** a tela voltava em branco.

## Depois da primeira publicação

- **O ADMIN tem todas as telas e permissões.** A tabela PERFIS podia vir incompleta de versões antigas, e o administrador não via Filiais e painéis, Nobreaks, Limpeza, Quadro do CD (onde se liga a planilha do BI) e Estoque de TI. Agora o ADMIN tem todas as telas e permissões, sem depender da tabela PERFIS. Nos painéis vale o estado de cada filial (desde 19/10): **Oculto** aparece só para o administrador, com o selo **oculto**; **Desativado** e **Não usar nesta filial** somem até para ele. Se um painel sumiu do seu menu, ligue-o como Ativo ou Oculto em **Configuração › Filiais e painéis**.
- **Cadastrar outro CD** (Campina Grande, Ponte Nova…): **Configuração › Filiais e painéis › Nova filial**. Informe nome, cidade, código (ex.: CPG, PNV) e os painéis. O sistema cria a planilha da filial sozinho.
- **Estoque de TI** abre direto na aba **Estoque**:
  - Busca grande no topo: digite "mouse" e a lista filtra na hora.
  - Colunas: **Material de Informática CD/Loja** (o mesmo material serve para o CD e para a loja), **Estoque**, **Estoque mínimo** e **Estoque ideal**.
  - **Alerta:** quando um material chega ao estoque mínimo (ou zera), aparece uma faixa vermelha no topo com os itens, e a linha fica marcada. Clicar na faixa mostra só os que precisam repor.
  - **+ Entrada** em cada linha: chegou material, digite a quantidade e aperte Enter (a data já vem com hoje).
  - **− Saída** em cada linha: quantidade, data da saída, **setor** e **usuário que recebeu** (pelo menos um dos dois). Os setores e usuários já usados aparecem como sugestão.
  - As abas **Resumo**, **Movimentações** e **Inventário** continuam.
  - Em **Colar da planilha**, a última coluna é o estoque ideal. O esquema subiu para 8.4 e a coluna nova é criada sozinha.
- **Planilha do BI do Quadro do CD:** abra o painel **Quadro do CD**. Se ainda não houver planilha ligada, a tela mostra o campo para colar o link e o botão **Ligar planilha**; depois, o botão **Trocar planilha** fica no alto da tela. É a planilha com as abas GERAL, CADMITIDOS (ou CDADMITIDOS), CDESLIGADOS e FÉRIAS (veja os pedidos de 13/10 e 14/10). O nome da aba pode variar em maiúsculas, acentos e espaços; o título acima do cabeçalho é ignorado; a data de admissão pode ser data, texto (02/09/2025) ou mês ("ago/2025"). Depois de mudar a planilha, clique em **Atualizar dados** no Quadro: ele lê na hora. Sem isso, a tela guardada pode levar de 10 a 15 minutos para mostrar a mudança. Ela precisa estar compartilhada com a conta dona do script (a que publicou o GSL). Cada filial liga a sua.
- **Nobreaks:**
  - **Hora só com números:** `0830` vira 08:30 e `14` vira 14:00 (não precisa dos dois pontos). Hora que não existe fica vermelha e não é gravada.
  - O **Histórico** tem a mesma cara da folha de lançamento: dia agrupado, entrada em azul, saída em verde, carga e alerta em vermelho. O mês pode ser "Todos (últimos 120 dias)".
  - **Exportar Excel** gera um `.xlsx` com duas abas: Leituras e Resumo por nobreak.
  - **Exportar PDF** abre o relatório pronto (A4 deitado) e a janela de impressão. Escolha "Salvar como PDF". O relatório exporta o que está filtrado na tela. Se nada abrir, libere pop-ups para o site.
- **Trocar PIN:** botão **Trocar PIN**, abaixo do seu nome no menu lateral. Pede o PIN atual e o novo duas vezes. Quem esqueceu o PIN pede ao administrador: **Pessoas e acessos › Zerar PIN**.

## Pedido de 21/10 (férias com programação, ações só para os citados, relatórios Bartofil, planilha do aprendiz)

**Férias: programar a data e acompanhar até a saída**

A aba Férias foi refeita em cima das quatro datas da aba FÉRIAS:
- **pa_inicio e pa_fim:** o período aquisitivo.
- **DTA_LIMITE:** a data em que a pessoa **pode sair** de férias. Uns 60 dias antes dela, a pessoa entra em **Programar**. Sem DTA_LIMITE, vale o dia seguinte ao pa_fim.
- **DTA_LIMITEMAX:** o **limite máximo para sair**, o último dia para começar as férias. Ele não pode passar.

**Programar:** quem pode trocar a planilha do Quadro clica em **Programar** e escolhe o início (entre "pode sair a partir de" e o limite máximo) e os dias (5 a 30, padrão 30). A janela mostra a volta e até quando entregar o aviso. A programação fica gravada no GSL; a planilha continua só de leitura. **Reprogramar** muda a data. Na ficha da pessoa ficam **Cancelar programação** e **Desfazer confirmação**.

**As cores acompanham o tempo:**

| Cor | Sem programação | Programada |
|---|---|---|
| **Azul** (no prazo) | Programar: pode sair a partir de… | Programada para… · aviso até… / Sai em… |
| **Amarelo** (atenção) | Já pode sair desde… — sem programação | Entregar o aviso até… (a semana do aviso) |
| **Laranja** (urgente) | Programe já: limite máximo em até 60 dias | Sai em N dias (a semana da saída) / Saída prevista — confirme |
| **Vermelho** (crítico) | Programe hoje (o aviso já não cabe antes do limite) / Limite máximo vencido | Saiu de férias em…? Confirme (3 dias depois) / Programada depois do limite máximo |
| **Verde** (resolvido) | — | De férias (STATUS da GERAL) / Férias cumpridas |
| **Cinza** (nada a fazer) | Em dia: ainda falta para poder sair | — |

- **Confirmar saída** fecha a programação. Quando a extração nova chega sem o período (o RH fechou), as férias contam como cumpridas sozinhas.
- **Buscar pelo nome**, no alto da aba, acha qualquer pessoa, sem precisar de acento. Mostra também quem está em dia, para programar com antecedência.
- A lista tem dois grupos, **Programar** e **Programadas**, e a linha "N de férias agora · N cumpridas nos últimos 60 dias". O calendário, a ficha, a Visão geral, o Copiar resumo e o Excel seguem a mesma lógica. O número na aba conta quem está em vermelho ou laranja.
- **Parâmetros:** aviso de férias (30 dias); entra em Programar quantos dias antes de poder sair (60); urgente com o limite máximo em até (60); dias para confirmar a saída (3). Os parâmetros "Avisar" e "Programar" da versão anterior não são mais lidos.
- Continua sem nenhuma palavra de multa.
- Na primeira entrada depois de publicar, o banco de cada filial ganha sozinho a tabela FERIAS_PROG (esquema 8.11).

**Plano de Ação: cada ação só aparece para quem está citado nela**
- Nos dois planos (Calendário e Limpeza), uma ação só aparece para os **responsáveis** e para quem foi **marcado** num comentário dela. Isso vale para a lista, os filtros, a bolinha do menu, a Gestão da Limpeza, o link do e-mail, as fotos e os comentários.
- O administrador, a gerência, a consulta e quem criou a ação **não veem** as ações em que não estão citados. Quem gere o plano continua criando ações. Editar, reabrir, cancelar e excluir só valem nas ações que a pessoa vê.
- Quem cria uma ação sem ficar entre os responsáveis recebe o aviso "Ação criada. Ela aparece só para quem está citado nela: …", e a ação sai da lista dele.
- Para quem gere o plano ficam só os números do plano inteiro (ranking por turno, total em aberto e atrasadas), sem mostrar nenhuma ação.
- **Exceção:** ação sem responsável com e-mail (as que vieram da planilha antiga da Limpeza) fica com quem gere o plano até alguém ser escolhido como responsável em Editar.

**Relatórios nas cores da Bartofil**
- Todo relatório exportado (Nobreaks, Quadro do CD, Conferência, Férias, Estoque de TI e da Limpeza) sai com a marca.
- **Excel:** título em azul, tarja verde e amarela, cabeçalho azul com texto branco, linhas zebradas, cabeçalho congelado e com filtro, e rodapé "GSL Bartofil · filial · Página X de Y". As situações vêm coloridas como na tela.
- **PDF:** logo da Bartofil, título em azul, tarja azul/verde/amarela, tabelas com cabeçalho azul e o rodapé "GSL Bartofil" em toda página. As cores saem mesmo com "Gráficos de plano de fundo" desligado.
- O vermelho só aparece como alerta: a marca não tem vermelho.

**Jovem Aprendiz: leitura da planilha corrigida**
- A aba de respostas é achada mesmo renomeada, em inglês ("Form Responses 1") ou com a Cronograma como primeira aba. Com o formulário religado, vale a aba nova ("Respostas ao formulário 2"). Antes, nesses casos, todos apareciam como "Não realizada".
- Ligar a planilha agora exige as duas abas e diz qual falta.
- Na Cronograma, rótulos como "Férias:", "Fim de contrato:", "Média Geral", o título e o cabeçalho não viram mais aprendiz. Bloco curto não pega os setores do vizinho. O contrato e as férias aparecem sem o rótulo.
- Setor repetido no cronograma conta uma vez. A avaliação num setor fora do cronograma não deixa o aprendiz "Concluído". A lista e o painel mostram o mesmo.
- A mais recente é sempre a do carimbo de data/hora, qualquer que seja a ordem da aba.
- Nota em branco não conta como zero e aparece como "—".
- Avaliação nova aparece em até 5 minutos para todos. "Trocar planilha" com o mesmo link lê na hora.
- **Conferir na planilha:** o nome do aprendiz na Cronograma não pode ter data nem dois-pontos.

**Arquivos desta entrega** (carimbo `2026.10.21`; enviados no `GSL-21-10.zip`). São os 9 que mudaram desde o pacote de 20/10:
- `Acoes.gs`, `Aprendiz.gs`, `Codigo.gs`, `Instalacao.gs`, `Quadro.gs`;
- `App.html`, `Aprendiz.html`, `Paineis.html`, `PaineisEstilo.html`.

Como publicar: cole os 9 por cima, crie uma **Nova versão** da implantação e recarregue a página (F5). Se faltar algum, a faixa amarela diz qual.

**Para conferir:**
1. **Férias:** abra o Quadro do CD › Férias, busque uma pessoa pelo nome, clique em **Programar** e salve. Ela passa para **Programadas**, com a cor do prazo.
2. **Plano de Ação:** como administrador, as ações em que você não é responsável nem marcado não aparecem mais.
3. **Relatórios:** exporte o Excel do Estoque de TI e o PDF dos Nobreaks. Os dois saem nas cores da Bartofil.
4. **Jovem Aprendiz:** abra o painel e confira se cada aprendiz está com os setores e as avaliações certas.

## Pedido de 20/10 (Google bloqueando a conexão, excluir item do estoque, primeira foto HEIC)

**"O Google bloqueou a conversa": as fotos e as gravações vão pela rota que funciona**

Em alguns computadores (várias contas Google no mesmo navegador, cookies barrados), o Google recusa a conversa direta com o sistema. O GSL já tinha a rota de reserva: grava recarregando a página. Mas essa rota deixava as fotos de fora, e era aí que o erro aparecia toda hora. Agora:
- **Ação, comentário e conclusão com foto** vão pela rota de reserva junto com as fotos. A página recarrega e a ação aparece com as fotos. A foto HEIC vai como veio e o visor converte depois.
- **O Google recusou o clique** (erro 403 ou "PERMISSION_DENIED"): nesse caso nada foi gravado, então o mesmo clique segue sozinho pela rota de reserva. Não aparece mais o erro pedindo para clicar de novo. Se o navegador exigir, aparece o botão **Continuar**.
- **A página que veio pela reserva** começava achando que o Google estava bloqueado e recusava foto e arquivo sem tentar. Por isso a primeira foto do visor dava erro e, passando para a próxima e voltando, abria. Agora o sistema confere antes e só recusa se o bloqueio for real.
- Uma **queda passageira da rede** (servidor ocupado, internet oscilando) não aparece mais como "o Google bloqueou". A mensagem diz que a conexão caiu e pede para conferir se a gravação foi feita. O visor de fotos ganhou o botão **Tentar de novo**.
- Continua precisando da conversa direta (quando o bloqueio é real): abrir uma foto no visor e anexar arquivo na entrega de atividade. Nesses casos, o melhor é usar uma janela do Chrome só com a conta @bartofil.com.br.

**Estoque (TI e Limpeza): Excluir exclui**
- **Remover** no cadastro do item agora abre uma confirmação, que diz quantas movimentações o item tem.
- **Excluir mesmo assim** apaga o item e todas as movimentações dele: saem do saldo, do histórico e dos relatórios. Um item novo com o mesmo código começa do zero. Na planilha, as linhas ficam marcadas como excluídas (EXCLUIDO = SIM), como em todo o GSL.
- **Desativar (manter o histórico)** tira o item de uso e guarda o histórico, como antes.
- Item sem movimentação: **Excluir** apaga direto.

**Arquivos desta entrega** (carimbo `2026.10.20`; enviados no `GSL-20-10.zip`). São só os 4 que mudaram desde o pacote de 19/10:
- `App.html`, `Paineis.html`, `Estoque.gs` e `Codigo.gs` (no `Codigo.gs` mudou só o carimbo).

Como publicar: cole os 4 por cima, crie uma **Nova versão** da implantação e recarregue a página (F5). Se você ainda não colou o pacote de 19/10, cole primeiro os 15 dele (`GSL-19-10.zip`) e depois estes 4.

**Para conferir:**
1. Num computador em que o Google bloqueia a conversa, crie uma ação com foto. A página recarrega e a ação aparece com a foto.
2. Abra uma ação com fotos HEIC: a primeira foto abre direto.
3. No Estoque de TI, abra um item com movimentações, clique em **Remover** e depois em **Excluir mesmo assim**. O item some das listas.

## Pedido de 19/10 (rotinas do calendário, comentários e fotos HEIC nas ações, painel desativado)

**Calendário › Rotinas: o dia nos botões, e a mudança vale também para o que já foi gerado**

Em **Configuração › Calendário › Rotinas**:
- O campo que pedia número saiu. A rotina agora tem **Repete**:
  - **Toda semana:** escolha o dia nos botões **Seg Ter Qua Qui Sex Sáb Dom**. Embaixo aparecem as próximas datas, por exemplo "Toda quarta-feira · próximas: 21/10, 28/10, 04/11". Sábado e domingo também valem.
  - **Todo mês:** 1ª segunda-feira, última sexta-feira ou um dia fixo (1 a 31). Se o mês não tiver o dia (31 em setembro), vale o último dia do mês. Continua uma por turno no mês: mudar o dia do mês não cria uma segunda atividade se a do mês já foi feita.
  - **Vagas sem data:** de 1 a 10 vagas por mês. O gerente agenda cada vaga em "Treinamentos e vagas".
- **Rotina nova** entra na hora no mês atual e no seguinte (os que já foram gerados), só de hoje em diante. Nenhuma atividade nasce atrasada.
- **Mudar o dia** (de quarta para sexta, por exemplo): as atividades pendentes de hoje em diante vão para a sexta da mesma semana, com a nota "Remarcada de … para …: a rotina mudou para toda sexta.". Antes de gravar, a tela diz quantas vão mudar. As remarcadas à mão ficam no dia escolhido, e a confirmação diz quantas ficam. Se a sexta desta semana já passou, a desta semana fica como está. Desmarcando **Ajustar também as atividades já geradas**, a mudança vale só para os meses que ainda vão ser gerados.
- **Desativar** (botão na lista): as pendentes de hoje em diante são canceladas, inclusive as remarcadas à mão. Elas saem do calendário e ficam no "Arquivo — atividades canceladas" do mês, com o motivo "Cancelada pela rotina". **Ativar** traz essas atividades de volta (a remarcada à mão volta no dia que tinha sido escolhido, se ele ainda não passou).
- **Remover** pede confirmação e cancela as pendentes de hoje em diante. O histórico continua. Mudar o turno ou a frequência também cancela as que a regra nova não gera, e as confirmações avisam.
- **Nunca mudam:** atividades entregues ou validadas, com anexo, canceladas à mão, vagas já agendadas e datas que já passaram.
- A **sigla** não muda depois que a rotina gerou atividades, porque ela está no código delas. Para usar outra sigla, crie uma rotina nova e desative a antiga.
- **"Exige setor"** agora vale para qualquer rotina, não só para a vistoria: o gerente escolhe o setor na atividade e o turno recebe o aviso.
- **Gerar mês** num mês que já existe só completa de hoje em diante.
- Depois de gravar, o recado diz o que aconteceu no calendário, por exemplo "Rotina salva. No calendário: 6 mudaram para sexta." ou "Rotina desativada. 6 atividades pendentes canceladas (OUT 2026: 2 · NOV 2026: 4)." Os recados longos ficam mais tempo na tela.
- Duas pessoas editando a mesma rotina: quem salvar com a janela aberta antes da mudança da outra recebe "Esta rotina foi alterada por outra pessoa enquanto a janela estava aberta. Feche e abra de novo." Nada é desfeito.

**O que ficou da versão anterior (vale conferir uma vez depois de publicar):**
- **Rotina que você desativou antes desta versão** e cujas atividades ainda aparecem no calendário: na lista ela aparece como "parada · 6 ainda no calendário". Clique em **Tirar do calendário (6)**.
- **Rotina que você removeu antes desta versão** e cujas atividades ficaram no calendário: aparece embaixo da lista, em **Atividades de rotinas removidas** (por exemplo "RON — 6 pendentes de hoje em diante"). Clique em **Tirar do calendário**.
- **Atividades que ficaram no dia antigo** (a versão anterior não mexia no calendário quando a rotina mudava) ou que foram mudadas direto na planilha: abra a rotina e clique em **Salvar**. A tela pergunta "Levar para o dia da rotina?": **Levar para quarta** move as atividades (com a nota "Remarcada de … para …: dia da rotina (toda quarta)."), **Deixar como estão** salva sem mexer nelas.

**Plano de Ação: selo de comentário e marcar uma pessoa** (Calendário e Limpeza)
- Cada cartão mostra no topo o selo **💬 N**, com o número de comentários. Ele aparece também na tabela da **Limpeza › Gestão**. Conta só o que alguém escreveu: concluir, reabrir ou cancelar sem texto não conta. Clicar no selo abre o histórico.
- **novo:** o selo fica cheio, com a palavra "novo", quando outra pessoa comentou nas últimas 72 horas e você ainda não abriu o histórico naquele aparelho (nem respondeu depois).
- **Marcar alguém:** no comentário, digite **@** e o começo do nome, da função ou do turno (não precisa de acento), ou use o botão **@ Marcar pessoa**, que mostra todas as pessoas do plano. Escolha com o dedo, o mouse, ou as setas e Enter. A linha "Vai avisar por e-mail: @Nome ×" mostra quem será avisado; o × tira a pessoa, e apagar o "@Nome" do texto também. Até 10 pessoas por comentário, entre quem abre aquele Plano de Ação na filial.
- Escreveu o nome inteiro sem escolher na lista? Ao clicar em **Registrar comentário**, a pessoa entra em "Vai avisar por e-mail" com um aviso. Confira e clique de novo para gravar.
- Cada pessoa marcada recebe um e-mail com o comentário, os dados da ação e o botão **Abrir a ação no GSL**. Depois do e-mail e do PIN, ele abre direto o histórico da ação, na filial certa (na Limpeza, na aba Plano de Ação). Responder o e-mail vai para quem marcou, mas o que entra no histórico é a resposta pelo botão.
- Quem foi marcado passa a ver **aquela** ação e pode comentar nela. Não conclui, não edita e não muda a situação. No cartão aparece "Marcados: …" e, para quem foi marcado, o selo **@ você**, até a pessoa responder.
- **Marcou por engano?** Em **Editar** a ação (gestão), a caixa **Marcados (veem e comentam esta ação)** deixa desmarcar: a pessoa deixa de ver a ação.
- Na primeira entrada depois de publicar, o banco de cada filial ganha sozinho as colunas MARCADOS (aba ACOES) e MENCOES (aba COMENTARIOS). É a versão 8.10 do esquema; ninguém precisa rodar nada.

**Fotos HEIC no Plano de Ação**
- A foto HEIC que o Chrome não abre (copiada do iPhone para o computador, ou o HEIF de alguns Android) agora é convertida pelo Google no momento em que é escolhida. Enquanto isso, o campo mostra "Convertendo IMG_0001.HEIC para JPG — leva alguns segundos…". Depois ela segue como as outras: prévia, JPEG de até 1600 px, gravada como .jpg. Vale na ação, no comentário e na conclusão, nos dois planos.
- No computador, o seletor de arquivos passa a mostrar os .heic. Pelo iPhone (câmera ou Fototeca), nada muda: o próprio iPhone entrega a foto em JPEG.
- Se o Google ainda não tiver preparado a foto, ou a conexão falhar, ela vai como veio, com um aviso, e aparece normalmente quando alguém abrir a ação.
- As fotos HEIC gravadas antes desta versão também abrem no visor, e o **Baixar** entrega .jpg.
- Arquivo que não abre como foto (TIFF, PDF…) é recusado na hora: "Envie JPG, PNG ou HEIC."
- A cópia temporária usada na conversão é apagada de vez do Drive (não fica ocupando a lixeira).

**Painel desativado some do menu de todos**
- Em **Configuração › Filiais e painéis**, cada painel tem um estado por filial:
  - **Ativo:** aparece para quem tem o nível liberado;
  - **Oculto:** só o administrador vê, com a etiqueta **oculto**. Bom para montar e testar (e ligar a planilha) antes de mostrar para a equipe;
  - **Desativado** e **Não usar nesta filial:** some do menu de todos, **inclusive do administrador**. Os dados continuam guardados: é só voltar para Ativo.
- Vale na hora, sem F5: o cartão some ou volta. Quem estava com o sistema aberto vê o cartão sumir ao voltar ao menu. Se clicar no cartão antigo, ou recarregar a página, volta ao menu com o aviso "Este painel foi desligado nesta filial."
- O administrador nunca fica trancado: Configuração, Pessoas e acessos, Filiais e painéis e Relatos de erro continuam sempre abertos para ele. Numa filial com todos os painéis desligados, o menu diz "Nenhum painel ligado nesta filial." e tem o botão para religar.
- **Editar nome** da filial grava só o nome e a cidade. Antes ele podia religar um painel que tinha acabado de ser desligado.

**Arquivos desta entrega** (carimbo `2026.10.19`; enviados no `GSL-19-10.zip`). São os 15 que mudaram desde o pacote de 14/10:
- `Acoes.gs`, `Auth.gs`, `Banco.gs`, `Calendario.gs`, `Codigo.gs`, `Config.gs`, `Emails.gs`, `Filiais.gs`, `Instalacao.gs`, `Permissoes.gs`;
- `App.html`, `Paineis.html`, `Index.html`, `Estilo.html`, `PaineisEstilo.html`.

Como publicar:
1. Cole os 15 por cima dos de mesmo nome (os outros arquivos do projeto não mudam).
2. Crie uma **Nova versão** da implantação (Implantar › Gerenciar implantações › editar › Nova versão). Se faltar algum arquivo, a faixa amarela no topo diz qual. Com um arquivo faltando, nada se perde: a parte nova recusa com "Atualização incompleta do GSL…" até o arquivo ser colado.
3. **Recarregue a página (F5).** Quem estiver com o GSL aberto durante a implantação também precisa recarregar.
4. Os e-mails de quem foi marcado usam o envio de e-mail que o GSL já tem: não pede autorização nova.

**Para conferir:**
1. **Rotinas:** em Configuração › Calendário › Rotinas, abra uma rotina semanal, troque o dia e salve. No Calendário, as pendentes de hoje em diante estão no dia novo. Veja se alguma rotina aparece como "parada · N ainda no calendário" ou se há "Atividades de rotinas removidas", e use **Tirar do calendário**.
2. **Comentários:** num cartão do Plano de Ação, abra Comentários, digite **@** e escolha uma pessoa. Ela recebe o e-mail, e o selo 💬 aparece no cartão.
3. **HEIC:** no computador, anexe uma foto .HEIC numa ação. Ela aparece com prévia e é gravada como .jpg. Confira também se uma foto **em pé** continua em pé.
4. **Painéis:** em Filiais e painéis, ponha um painel em Desativado: o cartão some do seu menu na hora. Volte para Ativo.

## Pedido de 14/10 (Quadro do CD: aba Férias e barra lateral que recolhe)

**A planilha: aba FÉRIAS**

Extraia as férias do sistema e cole numa aba chamada **FÉRIAS**, na mesma planilha da GERAL. Pode colar como sai do sistema:
- a ordem das colunas não importa;
- um título acima do cabeçalho é ignorado;
- o nome da aba pode variar em maiúsculas, acentos e espaços (FERIAS, CD FÉRIAS, BASE FÉRIAS, CONTROLE DE FÉRIAS…).

| Coluna | Para que o GSL usa |
|---|---|
| **Matricula** | liga a linha à pessoa da GERAL: são os 3 últimos números do RH |
| **Nome** | confirma a ligação; se a matrícula não servir, liga pelo nome |
| **cc** | só as linhas do centro de custo do CD (655) entram; as outras são de outros setores |
| **pa_inicio** e **pa_fim** | o período aquisitivo: depois do pa_fim (ou do DTA_LIMITE, que repete a data), a pessoa já pode tirar as férias |
| **DTA_LIMITEMAX** | a data limite para sair de férias: todos os prazos contam a partir dela |

- **Matricula, Nome, pa_fim e DTA_LIMITEMAX são obrigatórias.** Sem o DTA_LIMITEMAX, a aba Férias diz que falta a coluna e que o GSL não sabe o prazo de ninguém. Sem Matricula, Nome ou pa_fim, um aviso no alto da aba diz qual coluna falta, e a Conferência explica o efeito. Sem Matricula e Nome juntas, nenhuma linha é lida, e a aba mostra só esse aviso no lugar da lista.
- As outras colunas (Empresa, Filial, Descrição, turno, admissão, dias vencidos, codfuc, tipfuncao) podem vir na extração. A equipe e a função que aparecem na tela são as da GERAL.
- Datas podem ser data do Sheets ou texto (10/06/2026).
- Uma pessoa com dois períodos em aberto tem duas linhas: a ficha mostra os dois, e a lista mostra a pessoa pelo mais urgente.

**Como o GSL liga a FÉRIAS à GERAL**
- Pelos 3 últimos números do RH: o RH 100123 da GERAL é a matrícula 123 da FÉRIAS. Zeros à esquerda não contam ("0123" = "123").
- O nome confere a ligação. A grafia pode mudar, porque a GERAL é digitada à mão e a FÉRIAS sai do sistema:
  - THIAGO e TIAGO, LUIZ e LUIS, SOUZA e SOUSA, WELLINGTON e WELINGTON valem como o mesmo nome;
  - o nome pode vir sem o primeiro nome ("PAULA SOUZA" = "ANA PAULA DE SOUZA") ou com a inicial ("J CARLOS SILVA").
  
  Se for outro nome, o GSL não liga as férias e aponta na Conferência: elas seriam de outra pessoa. Só o sobrenome em comum não basta.
- Mais de uma pessoa com o mesmo final de RH (100123 e 109123):
  - vale primeiro quem bate mais números da matrícula: a matrícula 1456 é do RH 101456, e a 456 não é dele;
  - depois, quem está ativo (quem já saiu só fica com a linha se nenhuma pessoa ativa servir);
  - depois, o nome mais parecido: o nome igual vem antes do só parecido, e um nome que contradiz o outro (cada lado com um nome que o outro não tem) vale pouco;
  - uma pessoa da GERAL fica com uma matrícula só, e a mesma matrícula com outro nome é outra pessoa.
  
  Se ainda empatar, a Conferência aponta "linha que serve a mais de uma pessoa".
- Quem está **sem RH** na GERAL é achado pelo nome exato, se for a única pessoa ativa com esse nome.
- Só entram pessoas **ativas** na GERAL. Quem já saiu fica fora das férias do quadro.
- As linhas de **outro centro de custo** só entram se a matrícula bater e o nome for o mesmo (ou o mesmo primeiro nome e mais um nome em comum). As outras são de outros setores e não geram aviso.
- O que não fecha vai para a **Conferência**, como **atenção**, com a linha da aba FÉRIAS e o botão que abre a planilha nela:
  - **Férias: matrícula de outra pessoa:** o final do RH é de alguém da GERAL com outro nome, e o GSL não liga as férias a essa pessoa. Ou o RH está errado na GERAL, ou o nome está escrito diferente demais;
  - **Férias: linha que serve a mais de uma pessoa:** a matrícula (ou o nome) bate com mais de uma pessoa ativa, e o nome não desempata;
  - **Férias: do CD, mas fora da GERAL:** a linha tem o centro de custo do CD, mas ninguém da GERAL é o dono dela. Se alguém da GERAL tem o mesmo nome com outro RH, o aviso diz quem é: ou é a mesma pessoa e o RH está errado, ou é um homônimo;
  - **Férias: sem linha na aba FÉRIAS:** a pessoa está ativa na GERAL, mas não tem linha ligada a ela. O aviso diz o motivo: a matrícula não veio na extração, ou veio com outro nome. Sem a linha, o GSL não tem como avisar o prazo.

**A aba Férias**

> A lógica de prazos e os parâmetros desta parte foram substituídos em 21/10 (programação das férias): veja o pedido de 21/10.

A aba fica entre Movimentação e Conferência. A primeira versão desta aba (régua, duas colunas, escalonar, tira de meses, calendário com duas marcas por pessoa, mapa por turno) ficou cheia demais. Ela foi refeita no mesmo dia: agora é **um cartão só, "O que fazer e até quando"**. Cada pessoa aparece uma vez, com um verbo e uma data. A data é a de agir e fica numa folhinha de calendário no começo da linha.

Os prazos contam os dias até o DTA_LIMITEMAX (a data limite para sair de férias), com a data de hoje:

| Grupo | Quem | O que fazer |
|---|---|---|
| **Precisam sair de férias** (■ vermelho) | prazo vencido, ou data limite a menos de 30 dias (o aviso de 30 dias já não cabe) | combinar a data com a pessoa e com o RH. A folhinha mostra a data limite: "Prazo vencido · há 35 dias" ou "Sair até · em 13 dias" |
| **Avisar** (▲ âmbar) | data limite entre 30 e 60 dias | entregar o aviso de férias até a data da folhinha ("avisar até" = data limite menos 30; com a data limite a 30 dias, o aviso é hoje). A linha também diz o "sair até" |
| **Programar** (relógio azul; fechado, abre em **Mostrar**) | data limite entre 61 e 90 dias | ainda há tempo: escolher o mês |
| **Em dia** (só o número, no rodapé) | data limite a mais de 90 dias, ou período ainda em aquisição | nada por agora |

- **Ordem:** o prazo vencido há mais tempo vem primeiro; depois, pela data.
- **Etiquetas**, só quando valem:
  - **de férias agora**: pelo STATUS da GERAL. Se as férias forem deste período, está resolvido;
  - **afastado**: as férias ficam para depois da volta;
  - **2 períodos completos**;
  - **período sem data**: outro período da pessoa veio sem DTA_LIMITEMAX. Veja a ficha;
  - **consta como desligado**: está na CDESLIGADOS e ainda ativo na GERAL (a mesma pessoa da faixa vermelha do painel). Corrija o STATUS na GERAL; se ela saiu mesmo, as férias vão na rescisão.
- **Tocar na linha** abre a ficha da pessoa.
- **Ninguém para avisar nem para sair:** a linha diz quem é o próximo aviso e até quando.
- **Rodapé:**
  - quantos estão **em dia**;
  - quantos estão **sem dados de férias** (tocar abre a lista, com o motivo de cada um) e, se alguém está sem linha na aba FÉRIAS, o link **ver na Conferência**. Sem ninguém assim, linhas da aba FÉRIAS que não fecham com a GERAL aparecem como "N linhas da aba FÉRIAS para conferir";
  - **Baixar Excel** e **Parâmetros** (este, só para quem pode trocar a planilha);
  - embaixo, a frase: "Marcou férias no sistema? Cole a extração nova na aba FÉRIAS e use Atualizar dados."
- **Cada pessoa conta num lugar só.** Os grupos, "em dia" e "sem dados" somam as pessoas do filtro.
- **Calendário** (botão ao lado de **Lista**; o GSL lembra a escolha naquele computador):
  - o mês no desenho da tela Calendário, com cada pessoa uma vez, no dia de agir: vermelho = sair até, âmbar = avisar até, azul = programar, cinza = em dia;
  - quem está com o prazo vencido fica numa faixa vermelha acima da grade;
  - até 3 nomes por dia; com mais, **+N no dia** abre a lista daquele dia;
  - **‹ ›** troca de mês, e **Hoje** volta ao mês atual.
- **Tela estreita** (celular, tablet, notebook com zoom): a linha vira três andares, e o calendário mostra só os símbolos de cada dia. Tocar no dia abre a lista dele.
- **O número na aba** (visto das outras abas) conta quem precisa sair de férias (■). Se não houver ninguém, conta quem é para avisar (▲). Com a aba Férias aberta, o número some, porque já está na lista.
- **O GSL nunca diz "ninguém para avisar" sem saber.** Com a aba FÉRIAS vazia, sem a coluna DTA_LIMITEMAX ou sem as colunas Matricula e Nome, a aba, o cartão da Visão geral e o Copiar resumo dizem que o GSL não sabe o prazo de ninguém (e o que corrigir). Quem não tem linha na aba FÉRIAS, ou tem como período mais urgente um sem DTA_LIMITEMAX, entra em "sem dados de férias", e o texto passa a dizer "entre quem tem prazo".

Fora da aba:
- **Ficha da pessoa:** a seção Férias mostra cada período em aberto numa linha do tempo (aquisição → pode tirar → aviso → data limite), com três datas: pode tirar desde, avisar até e **sair até (data limite)**. A situação de cada período é Prazo vencido, Urgente: sair até a data, Avisar, Programar, Em dia ou Sem data limite na aba FÉRIAS.
- **Visão geral:** o cartão Férias mostra quantos precisam sair de férias, quantos são para avisar, o próximo aviso e quantos estão sem dados.
- **Copiar resumo:**
  - na aba Férias, copia as listas PRECISAM SAIR DE FÉRIAS, AVISAR e SEM DADOS DE FÉRIAS, para o WhatsApp;
  - nas outras abas, o resumo ganha a linha "Férias: 6 precisam sair de férias, 11 para avisar, 2 sem dados de férias".
- **Baixar Excel:** todos os períodos do filtro, com a situação (PRAZO VENCIDO, URGENTE, AVISAR, PROGRAMAR, EM DIA, SEM DATA LIMITE), as datas, a coluna "SAIR ATÉ (DATA LIMITE)" e os dias até a data limite.

**Palavras da tela.** Quem vê o Quadro pode ser o próprio colaborador, então a tela usa só palavras neutras: prazo, data limite, sair até, avisar até, programar, em dia. Nenhum texto fala em multa ou em férias em dobro: nem a aba, nem a ficha, nem a Visão geral, nem o Excel, o Copiar resumo, os Parâmetros ou as mensagens do servidor. Um teste confere.

Se a planilha não tiver a aba FÉRIAS, o cartão diz como criar. O resto do Quadro continua igual.

**Parâmetros (editáveis na própria tela)**

Link **Parâmetros** no rodapé da aba Férias (ou no cartão "Falta a aba FÉRIAS"). Só aparece para quem pode trocar a planilha do Quadro (nível com a permissão de programar, como o ADMIN). Os parâmetros valem para a filial e para todo mundo que vê o Quadro.

| Parâmetro | Padrão | Faixa |
|---|---|---|
| Centro(s) de custo do CD | 655 | um ou mais, separados por vírgula |
| Quantos números do fim do RH formam a matrícula | 3 | 1 a 8 |
| Aviso de férias: dias antes da saída | 30 | 0 a 120 |
| "Avisar": data limite em até quantos dias | 60 | maior que o aviso |
| "Programar": data limite em até quantos dias | 90 | maior que o "Avisar" |

**Salvar** relê a planilha com os parâmetros novos. **Voltar ao padrão** devolve todos os valores da tabela. Os dois parâmetros do escalonar saíram junto com ele. Se você chegou a salvar os parâmetros na primeira versão da aba, a tabela PARAMETROS pode ter as linhas FERIAS_ESCALONAR_DIAS e FERIAS_ESCALONAR_MESES. Elas não são mais lidas e podem ser apagadas.

**Barra lateral que recolhe**

Antes do título de cada tela há um botão (o ícone de painel) que **esconde a barra lateral**: a tela ocupa a largura toda. Clicar de novo traz a barra de volta. O GSL lembra a escolha naquele computador. No celular, a barra é a faixa de cima da tela, e o botão a esconde do mesmo jeito.

**Arquivos desta entrega** (carimbo `2026.10.14b`; `Estilo.html` continua `2026.10.14`; enviados no `GSL-ferias-14-10-v2.zip`). São só os sete que mudaram desde o pacote de 13/10. A aba refeita substitui a primeira versão: use este pacote, não o `GSL-ferias-14-10.zip` anterior.
- `Quadro.gs`;
- `Paineis.html`;
- `PaineisEstilo.html`;
- `Codigo.gs`;
- `App.html`;
- `Index.html`;
- `Estilo.html`.

Como publicar:
1. Cole os sete por cima dos de mesmo nome. Se você já tinha colado a primeira versão de 14/10, bastam os cinco que mudaram desde ela: `Quadro.gs`, `Paineis.html`, `PaineisEstilo.html`, `Codigo.gs` e `App.html` (o `Index.html` e o `Estilo.html` são iguais).
2. Crie uma **Nova versão** da implantação (Implantar › Gerenciar implantações › editar › Nova versão). Se faltar algum arquivo, a faixa amarela no topo diz qual.
3. **Recarregue a página (F5).** Quem estiver com o GSL aberto durante a implantação também precisa recarregar.
4. Abra o Quadro e clique em **Atualizar dados**.

**Para conferir:**
1. Cole a extração na aba FÉRIAS, abra o Quadro do CD e clique em **Atualizar dados**. A aba **Férias** aparece entre Movimentação e Conferência.
2. Escolha uma pessoa do grupo **Avisar**. A folhinha é o "avisar até", 30 dias antes da data limite; o "sair até" da linha é o DTA_LIMITEMAX da linha dela na aba FÉRIAS.
3. Toque em **Calendário**: a mesma pessoa aparece no dia do "avisar até".
4. Em **Conferência**, veja os grupos que começam com "Férias:". "Sem linha na aba FÉRIAS" lista quem está ativo na GERAL e não veio na extração.
5. Clique no botão à esquerda do título: a barra lateral some e a tela se alarga. Clique de novo para trazer a barra.

## Pedido de 13/10 (Quadro do CD: uma aba só, a GERAL, e um painel novo)

**A planilha: só a aba GERAL**

O Quadro agora lê uma aba só, a **GERAL**, na mesma planilha, e separa os turnos sozinho. As abas APOIO TA, TB e TC podem continuar na planilha, mas o GSL não as lê mais. Ele só volta a elas se a planilha ficar sem a aba GERAL; assim o quadro nunca fica vazio na troca. Admitidos e desligados continuam vindo da CADMITIDOS e da CDESLIGADOS.

| Coluna | O que é |
|---|---|
| **EQUIPE** | `1° TURNO`, `2° TURNO`, `3° TURNO` ou `ADM` |
| **COD** | número do produtivo |
| **PROD** | nome do colaborador |
| **DESCRIÇÃO** | função |
| **RH** | matrícula no RH |
| **STATUS** | se a pessoa ainda está na empresa |

- A ordem das colunas não importa, e um título acima do cabeçalho é ignorado.
- **Células mescladas** (por exemplo, "1° TURNO" mesclado no bloco do turno) valem para todas as linhas da mesclagem.
- **DESCRIÇÃO** escrita de dois jeitos (com e sem acento, ou com espaço a mais) conta como uma função só, com a grafia mais usada na GERAL. Números contam: "ANALISTA 1" e "ANALISTA 2" são funções diferentes.
- **EQUIPE:** além do jeito do pedido, o GSL entende "1º" (com o "º"), "TURNO 1", "T1" e as letras antigas TA/TB/TC ou A/B/C (1°, 2° e 3° TURNO). Com outro valor (ex.: "TURNO 4"), a pessoa conta no CD, mas fica sem turno, e a Conferência aponta a linha.
- **STATUS:** está **fora da empresa** quem tem INATIVO, DESATIVADO, DESLIGADO, DEMITIDO, DEMISSÃO, RESCISÃO, EX-…, SAIU, FORA, BAIXA, NÃO, ENCERRADO, DISPENSADO ou TRANSFERIDO.
  - **FÉRIAS** e **AFASTADO** (também licença, atestado, INSS e auxílio) continuam na empresa, só que fora do posto.
  - Qualquer outro valor (ATIVO, vazio, EM TREINAMENTO, EXPERIÊNCIA) conta como ativo.
  - Na Conferência, "Como o GSL leu a planilha" mostra como cada valor escrito foi entendido.

**Desligado com STATUS ativo**

Quando alguém está na CDESLIGADOS e o STATUS na GERAL ainda é ativo, o GSL aponta a inconsistência em dois lugares:
- uma **faixa vermelha** no alto do Quadro, com o nome, o turno, a data do desligamento e quantas pessoas o CD teria sem esses desligados;
- a aba **Conferência**, com a linha da GERAL e o botão que abre a planilha nessa linha.

Como o GSL acha a pessoa:
- primeiro pelo COD, depois pela matrícula (RH);
- se a CDESLIGADOS não tiver nenhum dos dois, pelo nome, sem diferenciar acento nem maiúscula. Nesse caso o aviso diz "Achado pelo nome — confira se é a mesma pessoa";
- **mesmo nome, mas outro COD ou RH:** pode ser um homônimo, um número digitado errado ou uma recontratação com número novo. O GSL não tem como saber, então aponta como **atenção** (sem a faixa vermelha), no grupo "Mesmo nome de um desligado", dizendo os dois números. Se foi recontratação, ponha na CADMITIDOS a data da nova admissão, com o COD (ou o RH) e o nome como estão na GERAL, e o aviso some. Se o número foi digitado errado, acerte-o. Se for um homônimo, não mude nada na GERAL;
- valores de preenchimento no COD ou no RH ("-", "0", "#N/A") não contam como número.

Casos especiais:
- **Desligamento sem data** na CDESLIGADOS também é conferido. Ele só fica fora dos gráficos e das contas por período. Uma data impossível (mês 13, ou 09/15/2026 colado no formato americano) conta como sem data.
- **Desligamento com data futura** (aviso prévio) ainda não é inconsistência: a pessoa ainda trabalha.
- **Recontratação:** se a pessoa aparece de novo na CADMITIDOS com o mesmo COD ou RH (ou o número novo que está na GERAL), **o mesmo nome** e data **posterior** ao desligamento, não há aviso: o quadro está certo. A saída antiga continua na CDESLIGADOS, porque conta no turnover. Não contam como recontratação:
  - uma admissão achada só pelo nome, porque pode ser um homônimo;
  - uma admissão com o mesmo número e **outro nome** (número reaproveitado, digitado errado, ou o nome escrito de outro jeito). O aviso diz "A CADMITIDOS tem o COD … com outro nome (…): se for a mesma pessoa, escreva o nome como na GERAL; se não for, confira o número";
  - uma admissão com data **no futuro** (ano digitado errado ou pré-cadastro). O aviso pede para conferir a data;
  - uma saída anotada só com o mês ("out/2026" ou "2026-10") e uma admissão no mesmo mês: a admissão precisa ser de um mês seguinte. O aviso pede o dia da saída.

  Em cada caso, o aviso continua vermelho e diz o que falta: a data da nova admissão, o COD ou o RH na linha da CADMITIDOS, o nome como na GERAL, ou a data (ou o dia) da saída. Uma saída mais antiga que a readmissão não gera aviso, porque vale a mais recente.

A faixa vermelha também aparece se a GERAL estiver **sem a coluna PROD, EQUIPE ou STATUS**: ela explica o efeito ("por isso os nomes não aparecem", "por isso todos estão contando como ativos"). Se a planilha não tiver a aba GERAL, o Quadro diz isso, em vez de mostrar um quadro vazio.

A Conferência também aponta, como **atenção** (sem a faixa vermelha):
- linha sem nome (PROD vazio);
- EQUIPE fora do padrão;
- COD repetido;
- matrícula (RH) repetida;
- admitido que não entrou na GERAL.

**O nome que sumia**

A causa estava em como o GSL achava o cabeçalho e a coluna do nome:
- A coluna do nome se chama **PROD**. O GSL procurava "COLABORADOR" ou "NOME" e, sem achar, deixava o nome vazio.
- Quando o título acima do cabeçalho tinha a palavra "COLABORADORES", o GSL tomava o título pelo cabeçalho. O nome virava "COD" ou um número.

Agora o cabeçalho é a primeira linha, entre as 15 primeiras, com pelo menos dois nomes de coluna conhecidos. Cada coluna é procurada primeiro pelo nome exato e só depois por parte do nome. Uma leitura antiga guardada no cache é descartada e lida de novo.

**O painel novo**

São quatro abas. A linha de filtros (Equipe e Função) vale para tudo o que está abaixo dela. Cor quer dizer equipe (azul 1°, laranja 2°, verde-água 3°, amarelo ADM), sempre com o nome escrito ao lado. Vermelho e âmbar só aparecem para problema, sempre com ícone e palavra.
- **Visão geral:**
  - o CD inteiro e um cartão por equipe: pessoas, a fatia do CD, disponíveis, de férias e afastados, liderança ("1 para cada N", pelas funções de líder, supervisor, coordenador…), saídas em 90 dias e os alertas;
  - o **mapa de calor Função × Turno**, com os grupos Liderança e Administrativo (este começa recolhido numa linha). Tocar num número abre a lista daquelas pessoas;
  - **Desfalques de hoje**: funções com metade ou menos das pessoas disponíveis, segundo o STATUS;
  - **Movimentação dos últimos 90 dias**, comparada com os 90 anteriores, com um mini-gráfico de 6 meses.
- **Quadro por turno:**
  - o quadro de parede de cada turno, em blocos por função, com busca por nome, COD ou RH (Enter com um resultado só abre a ficha);
  - os recortes No quadro, Disponíveis, Fora do posto, Novos, Com pendência e Fora da empresa, e a ordem A–Z;
  - **Imprimir quadro** (um turno por página) e **Exportar Excel** (abas Quadro e Conferência);
  - tocar num nome abre a **ficha**: COD, RH, STATUS, como o GSL entendeu, a linha da GERAL (o botão abre a planilha nessa linha), admissão, desligamento e pendências.
- **Movimentação:**
  - o período, de 30 dias até tudo;
  - saídas (comparadas com o período anterior, só quando há histórico), entradas e turnover de saída (% ao mês). O saldo saiu: sem data de admissão ele enganava;
  - entradas e saídas por mês (com "Ver em tabela"), os motivos agrupados por tipo (pedido do colaborador × decisão da empresa) e onde as pessoas saem (por turno e por função);
  - a lista de quem entrou e saiu, por mês, com os avisos "ainda ativo na GERAL" e "não está na GERAL". Tocar num mês ou num motivo recorta tudo abaixo.
- **Conferência:** o que corrigir na planilha, agrupado e na ordem das linhas, com "o que é" e "como corrigir"; **Baixar lista (Excel)**; e **Como o GSL leu a planilha** (as colunas achadas e como cada STATUS e EQUIPE foi entendido).
- **Copiar resumo** (no alto da tela): copia 4 ou 5 linhas com o quadro do recorte, para colar no WhatsApp ou no e-mail.

O coordenador abre o Quadro já no turno dele (A = 1° TURNO, B = 2°, C = 3°). No computador compartilhado, quem entra depois não herda os filtros de quem saiu. **O nível COORDENADOR não vê o Quadro por padrão.** Para liberar para alguém: **Pessoas e acessos › Quem vê cada módulo**, coluna **Quadro do CD**, opção **Ver**.

**Arquivos desta entrega** (carimbo `2026.10.13b`; se você já colou o pacote anterior de 13/10, cole estes cinco por cima): `Quadro.gs`, `Paineis.html`, `PaineisEstilo.html`, `Codigo.gs` e `App.html`. Cole os cinco e crie uma **Nova versão** da implantação (Implantar › Gerenciar implantações › editar › Nova versão). Se faltar algum arquivo, a faixa amarela no topo diz qual. Depois, **recarregue a página (F5)**, abra o Quadro e clique em **Atualizar dados**. As telas guardadas pela versão anterior são descartadas sozinhas na implantação nova. Quem estiver com o GSL aberto durante a implantação também precisa recarregar (F5): uma aba antiga pode mostrar "O Quadro.gs desta implantação é da versão anterior" ou "O GSL foi atualizado", e isso se resolve recarregando.

**Para conferir:**
1. Abra o Quadro do CD. O subtítulo diz "Aba GERAL de «…» · lida hoje às hh:mm", e o cartão CD inteiro mostra quantas pessoas estão no quadro.
2. Compare o número de cada cartão com a planilha (filtro na coluna EQUIPE, só STATUS ativo, férias e afastados).
3. Se aparecer a faixa vermelha, toque no nome. A ficha abre, e o botão leva à linha da GERAL.
4. Em **Conferência › Como o GSL leu a planilha**, confira se cada STATUS foi entendido como você espera.

## Pedido de 10/10 (desempenho: computador que barra o Google, sessão que caía sozinha, bolinha das ações em aberto)

**O que acontecia**
- **Computador que barra a conversa com o Google** (várias contas Google no navegador, ou bloqueio da rede): cada clique tentava primeiro o caminho normal, e o Google demorava para recusar. Só depois aparecia o "Continuar" e a página recarregava. Daí o "lento, lento, lento".
- **Saía sozinho da conta:** a sessão ficava só no cache do Google, e o Google apaga o que está no cache quando precisa de espaço (mais ainda com muita gente usando). Quando isso acontecia, o sistema pedia e-mail e PIN de novo, com a pessoa no meio do trabalho.

**O que mudou**
1. **O computador que barra o Google vai direto pela página.** Na primeira recusa, o sistema anota que aquele computador está barrado (a anotação vale 12 horas) e passa a usar direto o caminho da página: um clique, uma recarga, sem espera e sem a tela de "Continuar". Isso vale para abrir telas, trocar de filial e também para **gravar** (salvar, concluir, comentar), que antes falhava nesses computadores. No máximo a cada 10 minutos, o sistema testa sem a pessoa perceber se a conversa voltou.
   - **F5** volta na mesma tela, com os filtros. Se a página pedir, é um clique em **Continuar como <nome>**, sem PIN. Se não for você, use **Não é você? Entrar com outro e-mail**.
   - **Gravação em andamento:** enquanto a página da gravação não volta, outro clique mostra "Aguarde: a gravação anterior ainda está sendo feita" e não atropela a gravação.
   - **Página recusada pelo Google** (o Google às vezes apaga a "senha" de uso único da página): aparece **Continuar como <nome>**, sem PIN. Se era uma gravação, a tela avisa que **ela não foi feita** e é preciso fazer de novo.
   - **Exceção:** enviar arquivo ou foto ainda precisa da conversa direta com o Google. Nesses computadores, a tela avisa para usar outro computador, ou um perfil do Chrome só com a conta da Bartofil.
2. **A sessão não cai mais sozinha.** Além do cache, o sistema guarda uma segunda cópia da sessão no próprio script: o e-mail e a hora, numa chave que é um resumo do código da sessão (nunca o código em si, nunca o PIN). Se o cache perder a sessão, a cópia salva. Se o Google demorar a responder na hora de conferir, a pessoa vê "tente de novo" e continua dentro; antes, voltava para o e-mail e o PIN. A regra de 1 hora parada continua, com três melhorias:
   - quem está mexendo na tela (clicando, digitando, rolando) tem a sessão renovada sozinha;
   - com 40 minutos sem usar o sistema, aparece um aviso com o botão **Continuar conectado**;
   - com 50 minutos sem ninguém mexer na tela, a sessão termina sozinha e a tela se fecha, para o próximo a usar o computador não ver os dados de quem saiu.

   **Sair** encerra as duas cópias. Um pedido que já estava a caminho não traz a sessão de volta.
3. **Mais agilidade no servidor:**
   - cada pedido consulta o cache uma vez só (antes eram várias idas);
   - as tabelas que as telas leem ficam guardadas no cache por até 30 minutos e se renovam sozinhas a cada gravação feita pelo sistema;
   - gravar já devolve a tela atualizada: uma ida só, sem a lista piscar em "Carregando…";
   - o aquecedor (a cada 15 minutos, das 5h às 21h) prepara as tabelas de todas as filiais para todo mundo. Antes ele só montava as telas do administrador.
4. **Bolinha no cartão do módulo.** No menu, os cartões do **Calendário** (Plano de Ação) e da **Limpeza** mostram uma bolinha com o número de ações em aberto **da pessoa**: é o mesmo número do "Em aberto" da tela do plano. A bolinha fica **vermelha com "!"** quando alguma está atrasada. Sem ação em aberto, ela não aparece. Ela se atualiza depois de salvar ou concluir, e ao voltar para o menu (no máximo a cada 2 minutos). Funciona também nos computadores que barram o Google.

**Importante: editou a planilha à mão?** Mudanças feitas pelo sistema aparecem na hora. Se alguém editar o GSL_BANCO direto na planilha, clique em **Atualizar dados**: as cópias no cache duram até 30 minutos. Exceção: **Pessoas e acessos** e **níveis** (as abas ACESSOS e PERFIS) valem em no máximo 5 minutos. Assim, desativar alguém direto na planilha tira a pessoa do sistema em até 5 minutos, mesmo sem o clique.

**O melhor conserto para os computadores do CD (para o TI):** o Google barra a conversa quando há várias contas Google abertas no navegador e a da Bartofil não é a primeira. Qualquer uma destas resolve:
- deixar a conta **@bartofil.com.br como a primeira** do navegador (sair de todas, entrar primeiro com a da Bartofil, depois nas outras);
- criar um **perfil do Chrome só para o GSL**, com apenas a conta da Bartofil.

Com isso o sistema usa o caminho direto, que é mais rápido e permite enviar fotos.

**Diagnóstico:** `…/exec?diagnostico=1` agora mostra também quantas sessões o cache perdeu e a cópia salvou nas últimas 6 horas, e quantas sessões estão guardadas. Cada sessão salva seria um "saiu sozinho" na versão anterior. As sessões paradas há mais de 1h15 são apagadas pelo aquecimento (a rotina de 15 em 15 minutos). Sem as rotinas ligadas, uma entrada a cada 2 horas apaga algumas.

**Arquivos desta entrega:** `App.html`, `Index.html`, `Estilo.html`, `Codigo.gs`, `Auth.gs`, `Banco.gs`, `Acoes.gs` e `Filiais.gs`. Cole todos e crie uma **Nova versão** da implantação (Implantar › Gerenciar implantações › editar › Nova versão). Se faltar algum, a faixa amarela no topo diz qual. Agora ela confere também o `Index.html` e o `Estilo.html`. Colado pela metade, o sistema continua entrando e saindo normalmente (foi testado com cada arquivo da versão anterior). Num computador que barra o Google, ele não tenta gravar com o `Codigo.gs` antigo: avisa que a atualização está incompleta.

**Para conferir num computador do CD que barra o Google:**
1. Entre com e-mail e PIN. A página recarrega uma vez e abre o menu, sem a tela de "Continuar".
2. Abra um módulo. Uma recarga e a tela aparece, sem esperar.
3. Aperte F5. A página volta na mesma tela (no máximo um clique em "Continuar como …").
4. Conclua uma ação do Plano de Ação. Ela é gravada, e a bolinha do Calendário diminui.
5. Clique em Sair e aperte F5. A página pede e-mail e PIN de novo.

## Pedido de 09/10 (Jovem Aprendiz: o Portal RH Aprendiz dentro do GSL)

O "Portal RH Aprendiz" virou um módulo do GSL: card **Jovem Aprendiz** no menu, tela **Portal RH Aprendiz**. A cara e as contas são as do programa antigo:
- barra azul com a lista de aprendizes (🟢 Concluído, 🔵 Pendente, ⚪ Não realizada);
- aba **Relatório e Avaliações**: fim de contrato e férias, média geral, setores vivenciados, linha do tempo dos setores, média por setor, radar das competências, detalhamento por avaliação e o feedback de cada avaliador;
- aba **Cronograma Geral dos Setores**, com a busca por nome.

**A mudança pedida:** no Cronograma Geral, os cartões vêm **em ordem de fim de contrato**: o contrato que vence primeiro aparece primeiro. Quem não tem a data no cronograma vai para o fim.

**O que mudou por ter entrado no GSL:**
- O cronograma geral agora é lido da aba **Cronograma** da planilha. No programa antigo ele estava escrito à mão dentro da página. Mudou na planilha, muda na tela.
- Ano com 2 dígitos (15/03/27) aparece com 4 (15/03/2027).
- Os gráficos são desenhados pelo próprio GSL, sem a biblioteca Chart.js da internet. Os números são os mesmos; o gráfico de competências usa uma cor só.
- **Avaliação nova sem a fórmula da média.** O Formulário acrescenta a linha nova sem a fórmula da coluna M ("Média por setor"). O portal antigo mostrava **0** até alguém puxar a fórmula para baixo; o GSL já faz a mesma conta da fórmula (a média das notas).
- Linha em branco dentro de "Pontos positivos" ou "Pontos a melhorar" não vira um tópico vazio.

**Ligar a planilha (uma vez em cada filial):** abra o módulo. Sem planilha, a tela mostra o campo para colar o link da **Imersão Corporativa (respostas)** e o botão **Ligar planilha**. Depois, o botão **Trocar planilha** fica no alto da tela. O link também aparece em **Configuração › Sistema › Outros parâmetros** (`APRENDIZ_PLANILHA`). A planilha precisa estar compartilhada (leitura basta) com a conta dona do GSL, a que publicou o sistema. A leitura fica guardada por 5 minutos; **Atualizar dados** lê de novo na hora.

**Corrigir na planilha:** na aba Cronograma, as células **F14, F23, F32, F41 e F50** estão com "Periodo de Ferias: 08/02/24 a 09/02/28". A página antiga mostrava 08/02/2028 porque a lista estava escrita à mão nela. Troque o `24` por `28` nessas cinco células.

**O formulário semanal continua na planilha.** O script que atualiza o formulário toda semana (a parte do FormApp do `Código.txt`) fica no projeto da própria planilha, como já está. Ele não entrou no GSL porque pediria uma autorização nova (Formulários), e o GSL ficaria parado até alguém aceitar.

**Quem vê:** gerente e administrador, por padrão. Para liberar para outra pessoa: **Pessoas e acessos**, na pessoa, módulo **Jovem Aprendiz: Ver**. Só quem configura o sistema (permissão Programar) liga ou troca a planilha. O painel já vem ligado na filial principal; nas outras, ligue em **Filiais e painéis**. O esquema sobe para **8.9** sozinho.

**Onde fica cada coisa (manutenção):**

| O que mudar | Onde |
|---|---|
| Regras: status, médias, setores, contrato e férias, ordem do cronograma | `GSL/Aprendiz.gs` |
| Nome das abas e colunas da planilha (se o formulário ganhar ou perder pergunta) | `APZ_CONFIG`, no começo do `GSL/Aprendiz.gs` |
| A tela: textos, cores, gráficos, cartões do cronograma | `GSL/Aprendiz.html` |
| Qual planilha | botão **Trocar planilha**, ou o parâmetro `APRENDIZ_PLANILHA` |
| Card do menu, nome da tela e quem vê por padrão | `GSL/Permissoes.gs` (`MODULOS`, `TELAS`) e `GSL/Instalacao.gs` (telas do perfil GERENTE) |
| Quem pode ligar/trocar a planilha e atualizar | `GSL/Codigo.gs`, lista `ACOES` (`salvarFonteAprendiz`, `atualizarAprendiz`) |
| O painel na filial | `GSL/Filiais.gs` (`PAINEIS`) |
| A ligação da tela no sistema | `GSL/App.html` (`TELAS_PINTA`, `ICONES`) e `GSL/Index.html` (`include('Aprendiz')`) |
| Testes | `testes/paineis.js`, `testes/seguranca.js` e `testes/e2e.js` (casos "jovem aprendiz"); planilha de teste com nomes inventados em `testes/dados-aprendiz.js` |

**Arquivos desta entrega:** `Aprendiz.gs` e `Aprendiz.html` (novos), `Codigo.gs`, `Filiais.gs`, `Instalacao.gs`, `Permissoes.gs`, `App.html` e `Index.html`. Para criar os novos no Apps Script: **+ › Script** com o nome `Aprendiz` e **+ › HTML** com o nome `Aprendiz`. Cole todos e crie uma **Nova versão** da implantação (Implantar › Gerenciar implantações › editar › Nova versão). Se faltar algum arquivo deste pacote, a faixa amarela no topo diz qual.

## Pedido de 09/10 (Limpeza: estoque igual ao do TI, Plano de Ação igual ao do Calendário, fotos)

A tela **Limpeza CD** agora tem cinco abas: **Gestão**, **Plano de Ação**, **Estoque**, **Movimentações** e **Inventário**.

- **Estoque:** é o mesmo controle do Estoque de TI, usando o mesmo código. Tem catálogo (código automático LP-0001…), **estoque mínimo** com alerta, **estoque ideal**, **+ Entrada** e **− Saída** em cada linha (quantidade, data, setor/zona e quem recebeu), estorno, inventário, histórico e exportar Excel/PDF. Os produtos da limpeza ficam separados dos itens de TI (tabelas próprias: `LP_EST_ITENS` e `LP_EST_MOVIMENTOS`).
- **Plano de Ação:** é o mesmo modelo do Plano de Ação do Calendário: responsáveis (um ou mais), prazo, turno, origem, **comentários** com a etapa (Em andamento / Aguardando / Concluída) e o "depende de", histórico com quem fez cada registro, concluir, reabrir e cancelar, e-mail para o responsável (com link para a Limpeza). Na limpeza há também zona, local, criticidade e "aberta em". São **dois planos separados**: uma ação da limpeza não aparece nem pode ser mexida pelo plano do Calendário, e vice-versa.
- **Quem pode:** quem tem a permissão de gerir a limpeza (gerente, supervisor de limpeza) cria e edita. O responsável pela ação comenta e conclui as suas. Só pode ser responsável quem tem acesso ao módulo Limpeza.
- **Fotos:** dá para anexar foto na **ação** (ao criar ou editar), no **comentário** e na **conclusão** (até 5 por vez). A foto é reduzida no navegador e guardada no Google Drive como os outros anexos do GSL, em `Anexos/ACOES/<id da ação>/`. O selo 📷 abre o visor por cima da janela (o comentário que você está escrevendo não se perde). Só quem enxerga a ação vê as fotos dela. A gestão pode remover uma foto da ação pelo visor; as fotos dos comentários ficam, como o histórico.
- **Ações antigas da limpeza:** passam sozinhas para o novo Plano de Ação na primeira abertura depois da atualização, com os comentários. O que foi encontrado vira o título e a ação definida vira "o que precisa ser feito". Responsável antigo (só o nome) continua aparecendo; ao editar, marque a pessoa que acompanha.
- **Saiu da tela:** compras por lote, "acabou/reabastecer", produtos com diluição e embalagens. **Nada foi apagado**: as tabelas antigas continuam na planilha.
- **Importar planilha antiga:** traz zonas, não conformidades (para o Plano de Ação) e nomes de produtos (para o estoque, com saldo zero).
- **Aviso de versão misturada:** se algum arquivo não for colado no Apps Script, aparece uma faixa amarela no topo dizendo qual (o `Estilo.html` fica de fora dessa conferência). Foi o que causou o "Ação desconhecida: comentarAcao". O esquema sobe para **8.8** sozinho.

**Arquivos desta entrega:** `Acoes.gs`, `Codigo.gs`, `Emails.gs`, `Estoque.gs`, `Filiais.gs`, `Instalacao.gs`, `Limpeza.gs`, `App.html`, `Estilo.html` e `Paineis.html`. Cole **todos** e crie uma **Nova versão** da implantação (Implantar › Gerenciar implantações › editar › Nova versão).

## Pedido de 02/10 (assiduidade 403, relatório dos nobreaks, comentários nas ações)

- **Assiduidade — "NetworkError: falha na conexão devido a HTTP 403":** a lista de colaboradores era uma segunda chamada ao Google, e é ela que o Google barra em alguns computadores (várias contas abertas, ou tela aberta pela navegação de reserva). Agora a lista vem junto com a própria tela. Se o Google barrar a ficha, ela abre recarregando a página (botão **Abrir a ficha**).
- **Relatório dos nobreaks com o layout da folha de lançamento:**
  - **PDF:** uma folha por nobreak e por semana, com o cabeçalho do equipamento (nobreak, local, modelo, potência, tensão, semana) e a grade da folha: os 7 dias com as 3 leituras, ENTRADA em azul, SAÍDA em verde, carga, ocorrências e alertas em vermelho. Leitura não lançada sai em branco, como no papel.
  - **Excel:** uma aba **Resumo** e uma aba por folha (nobreak e semana), no mesmo layout.
- **Comentários nas ações** (Plano de Ação do Calendário e ações da Limpeza):
  - O botão **Comentários** abre o histórico da ação e o campo para registrar o que avançou, a situação e o que ela ainda espera para concluir (**Depende de**).
  - Situações do Plano de Ação: Em andamento, Aguardando ou Concluída. Situações da Limpeza: Aberta, Em andamento ou Concluída.
  - Comentar como "Concluída" conclui a ação.
  - O cartão mostra a situação, o "Depende de" e o último comentário.
  - No Plano de Ação comentam os responsáveis e a gestão. Na Limpeza, quem gere a Limpeza.
- **Identificação de quem comentou:** cada registro do histórico guarda o **e-mail** da pessoa logada (vem da sessão de e-mail e PIN, não de um campo que dê para digitar), o **nome** e a **função/turno** do cadastro (Pessoas e acessos), e a **data e hora**. O administrador que comenta enquanto simula um perfil fica registrado com o próprio nome ("simulando COORDENADOR" na função). Nenhum registro pode ser editado ou apagado pela tela.
- **Histórico completo até a conclusão:** além dos comentários, também entram no histórico, com quem fez:
  - no Plano de Ação: **Marcar como concluída**, **Reabrir** e **Cancelar** (com o motivo);
  - na Limpeza: **Concluir** e a mudança de situação pela edição.

  O topo do histórico mostra quem criou a ação e quando.
- O esquema subiu para 8.7. A tabela COMENTARIOS e as colunas novas (AUTOR_PAPEL, TIPO) são criadas sozinhas.

## Pedido de 01/10 (calendário, assiduidade, quadro, TI, limpeza, menu)

- **Plano de Ação:** os coordenadores veem a tela, e cada um vê **só as ações em que é responsável**. Gerência e admin continuam vendo todas. Uma ação pode ter **mais de um responsável** (ação conjunta): todos são avisados por e-mail, e qualquer um deles pode concluir.
- **Calendário — uma cor por situação:**
  - pendente: cinza;
  - atrasada: vermelho;
  - entregue, aguardando validação: azul;
  - aprovada: verde;
  - reprovada: laranja;
  - cancelada: cinza riscado.

  A legenda fica abaixo do calendário. O arquivo entregue aparece como um anel branco, sem trocar a cor.
- **E-mails com link para a tela certa:** o botão do e-mail abre o Calendário ou o Plano de Ação depois do e-mail e do PIN.
- **Assiduidade:** ficaram só **Colaboradores** (lista ordenada por quem mais faltou: ausências, faltas injustificadas, justificadas, disciplinares, atestados) e **Período**. Os gráficos saíram. A **ficha** mostra as ausências por tipo e o dia a dia, com filtro **De / Até** e atalhos (este mês, 3 meses, 12 meses, tudo).
- **Quadro do CD:** os admitidos da aba **CADMITIDOS** (Produtiva / Colaborador / Equipe / Função / Status, sem data) aparecem. Há uma aba nova, **Admitidos**, com totais por status, equipe e função e a lista com busca.
- **Estoque de TI:**
  - **Exportar Excel** e **Exportar PDF**, como nos Nobreaks.
  - Correção: com estoque mínimo 1, ideal 1 e estoque 1, o item não pede mais reposição. O alerta só aparece quando o estoque chega ao mínimo e ainda está abaixo do ideal.
- **Limpeza CD:**
  - Gestão enxuta: ações em aberto e atrasadas, gasto do mês, produtos acabados sem reposição e as ações que vencem primeiro.
  - A aba **Custos** virou **Compras e consumo**. Registre a compra (**lote** com vários produtos ou **individual**): data, fornecedor, NF e produtos com quantidade e preço. Não precisa cadastrar o produto antes.
  - Quando um produto acabar, aperte **Acabou**: o sistema guarda a data e mede quanto durou.
  - Depois, registre o **reabastecimento**: individual pelo botão **Reabastecer**, ou num lote novo. No lote, o sistema anota o reabastecimento sozinho.
  - A tabela **Consumo por produto** mostra a duração média, a última duração, o custo por dia e o gasto total.
  - As compras do formato antigo continuam contando no gasto do mês.
- **Nível de acesso novo: SUPERVISOR** (Supervisão de limpeza). Vê e cuida só da Limpeza CD. Aparece sozinho em **Pessoas e acessos › Nível de acesso**.
- **Configurações na barra lateral:** Configuração, Pessoas e acessos, Filiais e painéis e Relatos de erro saíram do meio da tela de módulos e ficam sempre no menu lateral. As telas e permissões são as mesmas.
- O esquema subiu para 8.5. As tabelas novas da Limpeza (LP_LOTES, LP_ITENS) e o nível SUPERVISOR são criados sozinhos na primeira abertura.

## O que foi corrigido

**Abertura e entrada**
- Removidos todos os `//` e `/*` que não são comentário (`App.html`, `Paineis.html` e os dados que vão com a página). O teste `testes/checar-htmlservice.js` confere isso.
- Se o código da página não carregar, a tela mostra o erro ("O sistema não carregou: …") em vez de girar para sempre.
- Com várias contas Google (`PERMISSION_DENIED`) ou com o erro 403, a entrada vai por formulário (POST). Se o Google demorar a recusar, a tela pede um segundo clique.
- `Conversas.gs`: o nome que colidia foi trocado. Vai também um `Conversas.gs` vazio para colar por cima do antigo.
- As fontes carregam sem travar a abertura. O sistema começa assim que a página é lida.
- O botão "Tentar de novo" e os parecidos recarregam a janela inteira, não só a moldura.

**Segurança da entrada (computador compartilhado)**
- **Primeiro acesso com código.** Antes, quem soubesse o e-mail de um colega, ou de um administrador, criava o PIN dele e entrava como ele. Agora o sistema manda um código de 6 números para o e-mail da pessoa, que o digita junto com o PIN novo. Isso não é pedido se o navegador já está na conta Google dela. O administrador também pode gerar um código em **Pessoas e acessos › Código de acesso / Zerar PIN**.
- O código da sessão não vai mais na URL. Reenviar um formulário pelo histórico (F5 ou Voltar depois de "Sair") não entra de novo, porque cada página leva um bilhete de uso único.
- **Sair** apaga a sessão no servidor, também no modo de reserva.
- Aba fechada e reaberta (Ctrl+Shift+T) pede o PIN. O F5 continua funcionando. Uma sessão parada há 1 hora acaba, e a tela diz que a sessão terminou (também no modo de reserva).
- No modo de reserva, clicar duas vezes em **Entrar** não cai mais em "esta página não pode ser reenviada". Página de entrada aberta a noite toda: a tela explica, guarda o e-mail e pede só o PIN.
- Primeiro acesso: trocar o e-mail digitado desfaz o pedido de código. Antes, quem digitava o e-mail errado ficava preso na caixa do código até recarregar a página.
- O e-mail de código tem limite: 3 por pessoa a cada 15 minutos, um teto por hora para o sistema inteiro e uma reserva da cota diária de e-mail (o resumo diário não fica sem cota). Os 3 últimos códigos enviados continuam valendo.
- Quem entra mas não tem filial ou nível vê um botão **Entrar com outro e-mail**.
- A filial de quem usou o computador antes não passa para a pessoa seguinte.
- **Funções internas fechadas.** Qualquer conta da empresa conseguia, pelo console do navegador, ler dados de pessoas, perfis, filiais, a assiduidade de cada um e até o segredo do PIN. Agora essas funções recusam chamadas que não vêm da tela. O teste `testes/seguranca.js` confere 20 delas.

**Assiduidade › Período (datas duplicadas)**
- A 4.0/4.1 não deduplicava nada: com duas folhas do RH se sobrepondo, a mesma falta aparecia duas vezes ("19/08, 19/08"). A 4.2 já tratava esse caso. A 4.2.2 fecha as outras causas:
  1. matrícula gravada como número por versões antigas (`12345`) ao lado da nova em texto (`012345`): a pessoa virava duas linhas;
  2. mesma pessoa em dois blocos da folha (troca de turno): o dia contava duas vezes e uma falta podia sumir;
  3. coluna "31" num mês de 30 dias virava o dia 1 do mês seguinte;
  4. rótulo antigo de competência (`08/2025`) permitia cadastrar o mesmo mês duas vezes.
- Depois de "Reclassificar", os códigos marcados como **Ignorar** continuavam contando: o absenteísmo aparecia menor do que era (3,7% em vez de 4,5% no teste).
- **Atualizar dados** não dá mais erro a partir do dia 21, quando a folha do mês novo ainda está vazia. Os outros meses são atualizados e a tela avisa qual está vazio.
- O seletor de competência aparece também na tela "sem dados". O diagnóstico mostra as sobras de meses renomeados e tem o botão **Limpar sobras**.

**Calendário, atividades e avisos**
- A Central e a Apresentação contam o mesmo que o Calendário. Antes, um mês 100% aprovado aparecia com 43%.
- Rotina mensal do dia 29–31 cai no último dia do mês. Antes ela pulava para o mês seguinte.
- Remover o único arquivo entregue devolve a atividade para pendente. Uma entrega **reprovada** continua reprovada e com a data da 1ª entrega.
- "Entrega recebida" abre a entrega mais nova (a corrigida), não a reprovada. O nome do PDF leva a hora.
- Um e-mail com erro não derruba mais o resumo diário (digesto) dos outros turnos.
- A entrega em PDF avisa quando o e-mail para a gestão não saiu.
- Os e-mails mostram certo textos com `<` e `>`.
- O Plano de Ação não mostra mais os dados de outra pessoa. O filtro **Geral (CD)** separa as ações do turno "Todos".
- As vagas de rotinas avulsas (não só TRE) aparecem e podem ser agendadas. Agendar uma vaga que não é treinamento manda aviso de "Atividade agendada", não "Treinamento marcado".
- A Central, mês a mês, conta só atividades com data (sem as vagas avulsas não agendadas).
- O filtro do calendário continua valendo depois de uma ação. O filtro de turno não fica mais preso num mês que não tem aquele turno.
- Numa troca de filial lenta, a filial abandonada não abre sozinha depois. A lista de colaboradores de uma filial não aparece na outra.
- Com várias contas Google, um erro ao salvar mostra a explicação certa, e não mais a janela "Falta autorizar o envio de e-mail".

**Nobreaks e Limpeza**
- Número com ponto de milhar ("7.500" VA, embalagem de "5.000" ml, "1.500" reais) era gravado 1000 vezes menor. O custo previsto por mês saía errado.
- Nobreaks: quem está em **Ver** no módulo não cadastra, edita, remove nem importa equipamento.
- Hora "8h" vira 08:00. A "última leitura" do cartão e o alerta usam a leitura mais nova do dia.
- A importação da planilha antiga de nobreaks não para quando o cadastro repete o código ("NB 04" e "NB-04").
- A importação da Limpeza guarda duas compras, duas embalagens ou duas não conformidades iguais do mesmo dia. Antes ficava uma só, e podia sumir uma ação **aberta**. Reimportar continua sem duplicar.
- Renomear um produto leva as embalagens e compras junto. Nome repetido também é recusado na edição.
- Formulários da Limpeza não trocam mais em silêncio o produto, a zona, o turno ou a origem que não estão na lista.
- Ação registrada já concluída fecha na data dela (antes era "hoje"). O formulário tem o campo "Concluída em", e conclusão antes da data da ação é recusada.
- A aba clicada (Nobreaks, Limpeza, Estoque) fica acesa.

**Estoque de TI, Filiais e Configuração**
- Tirar alguém da última filial em **Quem entra** dava a essa pessoa acesso à filial principal. Salvar Quem entra também não tira mais a filial de quem está desativado.
- Estoque: 1,1 m + 0,9 m tiram os 2 m do cabo, sem resto de conta decimal que travava a última saída. Saída estornada sai das contas do mês e perde o botão Estornar. O histórico não mostra mais saldo negativo com dois lançamentos no mesmo segundo.
- Depois de um código TI com 5 dígitos, os códigos automáticos continuam (antes davam "Já existe TI-0251" para sempre).
- Rotinas: sigla repetida (a segunda rotina nunca era gerada) e dia semanal inválido ("segunda", "9") são recusados. Se o banco já tiver duas rotinas com a mesma sigla, a tela pede outra sigla ao editar uma delas.
- DE-PARA: código repetido é recusado (valia a linha nova, e a correção da linha visível não fazia efeito). Se o banco já tiver um código repetido, apague uma das linhas antes de editar a outra. A lista de "Códigos fora da legenda" mostra os que já estão cadastrados e só esperam o **Reclassificar**.
- A atualização de versão não religa o Estoque que o administrador desligou na filial principal.
- A trava de gravação grava a planilha antes de ser solta (evita dois "último item" saírem ao mesmo tempo). O número de dígitos da matrícula não vaza de uma filial para outra nas tarefas automáticas.

**Outros**
- "Reportar erro" ou "Atualizar dados" na tela inicial de módulos levava a uma tela de erro sem saída.
- A tela "Relatos de erro" não aparecia para bancos já atualizados. O esquema subiu para 8.3.
- O menu não oferece mais telas que abririam direto num erro de permissão.

## Como publicar (passo a passo)

1. Abra o projeto do GSL no Apps Script da empresa.
2. **Apague** os arquivos `Conversas.gs` e `Login.gs`, se existirem. Se preferir não apagar, cole por cima do `Conversas.gs` o arquivo vazio desta versão.
3. Substitua o conteúdo de **todos** os arquivos pelos da pasta `GSL/`, com os mesmos nomes. São 28 arquivos `.gs` e `.html` (contando o `Conversas.gs` vazio) mais o `appsscript.json`. No editor, os `.html` aparecem como "HTML", sem a extensão no nome.
4. Salve. Em **Implantar › Gerenciar implantações**, edite (lápis) a implantação que já existe e escolha **Versão: Nova versão**. Assim o endereço continua o mesmo. Confira:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa em Bartofil**
5. Abra o endereço do sistema. A tela deve pedir e-mail e PIN. Se aparecer "O sistema não carregou: …", mande a mensagem.
6. O código de primeiro acesso vai por e-mail. Se o envio de e-mail nunca foi autorizado, rode `testarEmail` pelo editor (**Executar**) e aceite as permissões.
7. Entre como administrador e rode **uma vez** o **Reclassificar** (Configuração, parte do RH; a janela se chama "Reclassificar a base"). Assim os meses já fechados são refeitos com as contas novas. Os meses abertos se refazem sozinhos.
8. Abra `…/exec?diagnostico=1`. Se a linha "Endereço usado pelo sistema" terminar em `/dev`, copie o endereço `/exec` da implantação e cole em **Configurações do projeto › Propriedades do script**, com o nome `URL_APP`.
9. (Opcional) Atividades gravadas em dobro por versões antigas: no editor, rode `conferirAtividadesDuplicadas` e veja o **Registro de execução**. Se a lista fizer sentido, rode `limparAtividadesDuplicadas`. Ele junta os anexos na cópia que fica e marca as outras como excluídas; nada é apagado da planilha.

**Dica para o servidor em nuvem:** se várias contas Google estiverem abertas no navegador, o sistema entra pelo modo de reserva, e funciona. Mas o mais estável é usar uma janela (ou um perfil do Chrome) só com a conta `@bartofil.com.br`.

## Testes (para quem mexer no código)

Os testes rodam o GSL num emulador do Apps Script. Nos de tela, a página roda dentro de um Chromium de verdade, na mesma moldura (sandbox) que o Google usa.

```
node testes/checar-htmlservice.js     # nenhum // ou /* que o Google apagaria
node testes/seguranca.js              # funções internas fechadas ao console
node testes/assiduidade.js            # datas repetidas e contas erradas (9 casos)
node testes/atividades.js             # calendário, Central, avisos, rotinas que acertam o calendário (34 casos)
node testes/paineis.js                # Nobreaks, Limpeza, Estoque, Filiais, Configuração, ADMIN, PIN, Jovem Aprendiz, bolinha, Quadro do CD, Férias, painel desativado, fotos HEIC, marcar pessoa, excluir item do estoque (87 casos)
node testes/desempenho.js             # sessão que sobrevive ao cache, gravar pela página, cópias das tabelas no cache, colagem pela metade, um arquivo da entrega anterior por vez (23 casos)
node testes/e2e.js                    # entrada, PIN, 403, várias contas, telas, Período, painéis, Jovem Aprendiz, canal barrado, sessão, bolinha, Quadro do CD, Férias, barra lateral, rotinas, selo e marcação nos comentários, HEIC, painel desativado, fotos pela reserva, excluir item do estoque (95 cenários)
```

O `e2e.js` precisa do Playwright com Chromium. Rode tudo antes de publicar: é o que impede o erro da foto de voltar.
