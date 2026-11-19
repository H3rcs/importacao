/**
 * Avaliação dos Coordenadores pela Supervisão — cria o Google Forms + planilha de respostas.
 * Rode UMA vez a função criarFormulario. Se rodar de novo, não duplica: só mostra os links.
 * IMPORTANTE: não mude os títulos das perguntas — o relatorio.html usa esses títulos para ler o CSV.
 */

/***** CONFIGURAÇÃO — edite só esta parte *****/
const COORDENADORES = [
  'Coordenador 1',
  'Coordenador 2',
  'Coordenador 3'
];
const TURNOS = ['Turno A', 'Turno B', 'Turno C', 'Administrativo'];
const TITULO = 'Avaliação dos Coordenadores pela Supervisão';
/**********************************************/

const ESCALA = [
  '1 - Discordo totalmente',
  '2 - Discordo',
  '3 - Neutro',
  '4 - Concordo',
  '5 - Concordo totalmente'
];

const BLOCOS = [
  {
    titulo: 'Liderança e comunicação',
    linhas: [
      'Comunica metas e prioridades do turno com clareza',
      'Repassa a tempo as informações e decisões da gerência',
      'Está disponível quando a supervisão precisa',
      'Escuta as sugestões e opiniões da supervisão',
      'Dá retorno (feedback) sobre o meu trabalho'
    ]
  },
  {
    titulo: 'Gestão do turno',
    linhas: [
      'Planeja e organiza bem o turno',
      'Distribui tarefas e pessoas de forma justa',
      'Resolve problemas operacionais com rapidez',
      'Toma decisões com segurança',
      'Acompanha os indicadores (produtividade, erros, prazos)'
    ]
  },
  {
    titulo: 'Postura e relacionamento',
    linhas: [
      'Trata a supervisão e a equipe com respeito',
      'É justo e imparcial com todos',
      'Dá o exemplo (pontualidade, segurança e normas)',
      'Apoia a supervisão diante da equipe',
      'Mantém a calma sob pressão'
    ]
  },
  {
    titulo: 'Desenvolvimento da equipe',
    linhas: [
      'Incentiva o meu crescimento profissional',
      'Delega e me dá autonomia para decidir',
      'Reconhece quando o trabalho é bem feito'
    ]
  }
];

function criarFormulario() {
  const props = PropertiesService.getScriptProperties();
  const idExistente = props.getProperty('FORM_ID');

  // Proteção: se já foi criado, não cria outro, só mostra os links
  if (idExistente) {
    try {
      const f = FormApp.openById(idExistente);
      Logger.log('O formulário JÁ EXISTE. Nada foi criado de novo.');
      Logger.log('Link para os supervisores: ' + f.getPublishedUrl());
      Logger.log('Link para editar: ' + f.getEditUrl());
      return;
    } catch (e) {
      props.deleteProperty('FORM_ID'); // foi apagado no Drive, cria de novo
    }
  }

  const form = FormApp.create(TITULO);
  form.setDescription(
    'Esta avaliação é ANÔNIMA: seu nome e seu e-mail não são registrados.\n' +
    'O objetivo é ajudar cada coordenador a melhorar a forma de liderar. ' +
    'Responda com sinceridade, pensando nos últimos 3 meses de trabalho.\n' +
    'Se você trabalha com mais de um coordenador, envie uma avaliação para cada um.'
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage(
    'Obrigado! Sua avaliação foi registrada de forma anônima.\n' +
    'Para avaliar outro coordenador, clique em "Enviar outra resposta".'
  );

  // ---- Identificação ----
  form.addListItem()
    .setTitle('Qual coordenador você está avaliando?')
    .setChoiceValues(COORDENADORES)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Em qual turno você trabalha?')
    .setChoiceValues(TURNOS)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Há quanto tempo você trabalha com este coordenador?')
    .setChoiceValues(['Menos de 3 meses', 'De 3 a 6 meses', 'De 6 meses a 1 ano', 'Mais de 1 ano'])
    .setRequired(true);

  // ---- Blocos de avaliação (escala 1 a 5) ----
  BLOCOS.forEach(function (b) {
    form.addPageBreakItem().setTitle(b.titulo);
    form.addGridItem()
      .setTitle(b.titulo + ' — marque o quanto você concorda com cada frase')
      .setRows(b.linhas)
      .setColumns(ESCALA)
      .setRequired(true);
  });

  // ---- Avaliação geral ----
  form.addPageBreakItem().setTitle('Avaliação geral');

  form.addScaleItem()
    .setTitle('De 0 a 10, que nota você dá para este coordenador?')
    .setBounds(0, 10)
    .setLabels('Muito ruim', 'Excelente')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Quais são os principais pontos fortes deste coordenador?')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('O que este coordenador precisa melhorar?')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Sugestões ou comentários (opcional)')
    .setRequired(false);

  // ---- Planilha de respostas ----
  const planilha = SpreadsheetApp.create('Respostas - ' + TITULO);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, planilha.getId());

  // Publica o formulário (se a conta tiver essa opção)
  try { form.setPublished(true); } catch (e) {}

  props.setProperty('FORM_ID', form.getId());

  Logger.log('FORMULÁRIO CRIADO!');
  Logger.log('Link para os supervisores: ' + form.getPublishedUrl());
  Logger.log('Link para editar: ' + form.getEditUrl());
  Logger.log('Planilha de respostas: ' + planilha.getUrl());
}
