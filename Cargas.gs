/***********************************************************************************
 *  BARTOFIL — CENTRAL DE CARGAS  |  v2.0  (ago/2026)
 *  CD Feira de Santana — SETOR DE CARREGAMENTO
 *  ---------------------------------------------------------------------------
 *  Cadastro • Pesquisa • Conversão automática • Armazenamento
 *
 *  100% dentro do Google Sheets + Google Drive. Sem HTML, sem Web App.
 *
 *  INSTALAÇÃO:
 *    Extensões > Apps Script > cole este arquivo > Salvar > F5 na planilha
 *    Menu "🚚 CENTRAL DE CARGAS" > "▶ INSTALAR / RECONSTRUIR"
 ***********************************************************************************/

/* =================================================================================
 *  1. CONSTANTES
 * ================================================================================= */

const APP = {
  nome: 'CENTRAL DE CARGAS',
  empresa: 'BARTOFIL — CD FEIRA DE SANTANA  •  SETOR DE CARREGAMENTO',
  versao: '2.0',
  pastaRaiz: 'BARTOFIL — CENTRAL DE CARGAS'
};

const ABA = {
  inicio: 'INÍCIO',
  cadastro: 'CADASTRO',
  cargas: 'CARGAS',
  config: 'CONFIG'
};

/* Abas da v1 que não existem mais */
const ABAS_OBSOLETAS = ['TRIAGEM', 'LOG'];

/* Paleta oficial Bartofil — azul #111785 | verde #01973A | amarelo #FFEE03 | vermelho #D71920 */
const COR = {
  primaria: '#111785',
  secundaria: '#2A31A8',
  destaque: '#FFEE03',
  destaqueTexto: '#111785',
  clara: '#E7E8F4',
  subtitulo: '#B9BCE0',
  branco: '#FFFFFF',
  cinza: '#F4F4F8',
  cinzaEsc: '#5B5F7A',
  texto: '#1A1C33',
  verde: '#01973A',
  verdeClaro: '#E2F3E8',
  amarelo: '#8A7D00',
  amareloClaro: '#FFFCD9',
  vermelho: '#D71920',
  vermelhoClaro: '#FBE4E5',
  linha: '#C5C8E0'
};

/* Layout da aba CARGAS (base de dados) */
const CARGAS_CAB = 5;
const CARGAS_INI = 6;
const COL = {
  numero: 1, descricao: 2, data: 3, cadastradoPor: 4, paginas: 5,
  obs: 6, link: 7, idArquivo: 8, idPasta: 9
};
const CARGAS_NCOL = 9;

/* Layout da aba CONFIG */
const CFG = {
  root: 6, entrada: 7, pdfs: 8, originais: 9,
  manterOriginais: 10, otimizar: 11, larguraMax: 12,
  prefixo: 13, maxResultados: 14,
  descIni: 18,
  descFim: 67
};

/* Descrições do SETOR DE CARREGAMENTO — ajuste livremente na aba CONFIG */
const DESCRICOES_PADRAO = [
  'CARGA FRACIONADA',
  'CARGA FECHADA',
  'COMPLEMENTO DE CARGA',
  'ROTA CAPITAL',
  'ROTA INTERIOR',
  'TRANSFERÊNCIA ENTRE CDS',
  'FROTA PRÓPRIA',
  'TRANSPORTADORA / REDESPACHO',
  'CLIENTE RETIRA',
  'CARGA EXPRESSA / URGENTE',
  'REENTREGA',
  'DEVOLUÇÃO / RETORNO'
];

const MIMES_IMAGEM = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/bmp', 'image/webp', 'image/heic', 'image/heif'
];


/* =================================================================================
 *  2. MENU
 * ================================================================================= */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚚 CENTRAL DE CARGAS')
    .addItem('🔍 Ir para a pesquisa', 'irInicio')
    .addItem('➕ Ir para o cadastro', 'irCadastro')
    .addSeparator()
    .addItem('📁 SELECIONAR ARQUIVOS (janela)', 'abrirSeletor')
    .addItem('🔄 Conferir arquivos selecionados', 'verificarEntrada')
    .addItem('🗑️ Limpar arquivos não usados', 'limparEntradaComConfirmacao')
    .addItem('✅ FINALIZAR CADASTRO', 'cadastrarCarga')
    .addSeparator()
    .addItem('📊 Atualizar total e pesquisa', 'recalcularPaineis')
    .addItem('🗂️ Abrir pastas no Drive', 'mostrarLinksDrive')
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ Administração')
      .addItem('▶ INSTALAR / RECONSTRUIR', 'instalar')
      .addItem('🔧 Recriar validações e formatações', 'recriarValidacoes')
      .addItem('📂 Recriar estrutura de pastas', 'garantirPastas')
      .addItem('🩺 Diagnóstico do sistema', 'diagnostico'))
    .addItem('ℹ️ Sobre', 'sobre')
    .addToUi();
}

function irCadastro() { _ss().setActiveSheet(_sh(ABA.cadastro)); }
function irInicio() { _ss().setActiveSheet(_sh(ABA.inicio)); }

function sobre() {
  SpreadsheetApp.getUi().alert(
    APP.nome + ' v' + APP.versao,
    APP.empresa + '\n\n' +
    'Objetivo: manter os documentos das cargas organizados, convertidos em PDF e ' +
    'localizáveis em um clique.\n\n' +
    '1) Botão SELECIONAR ARQUIVOS — envia as fotos para a pasta _ENTRADA\n' +
    '2) Preenche número e tipo da carga\n' +
    '3) Botão FINALIZAR CADASTRO — une tudo em um PDF e arquiva no Drive\n' +
    '4) Pesquisa na aba INÍCIO e abre o arquivo',
    SpreadsheetApp.getUi().ButtonSet.OK);
}


/* =================================================================================
 *  3. INSTALADOR
 * ================================================================================= */

function instalar() {
  const ss = _ss();
  const ui = SpreadsheetApp.getUi();

  const r = ui.alert('Instalar Central de Cargas',
    'Isto vai criar/reconstruir as abas do sistema e a estrutura de pastas no Drive.\n\n' +
    'As cargas já cadastradas são preservadas.\n\nContinuar?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  criarAbaConfig_();
  criarAbaCargas_();
  criarAbaInicio_();
  criarAbaCadastro_();

  // remove abas da versão anterior
  ABAS_OBSOLETAS.forEach(function (n) {
    const s = _shOpc(n);
    if (s) ss.deleteSheet(s);
  });
  ss.getSheets().forEach(function (s) {
    const n = s.getName();
    if ((n === 'Página1' || n === 'Sheet1' || n === 'Planilha1') && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });

  garantirPastas();
  criarGatilhos_();
  recriarValidacoes();
  recalcularPaineis();

  ss.setActiveSheet(_sh(ABA.inicio));
  ui.alert('✅ Instalação concluída',
    'A Central de Cargas está pronta.\n\n' +
    'Para escolher os arquivos, use o menu 🚚 CENTRAL DE CARGAS > 📁 SELECIONAR ARQUIVOS.\n\n' +
    'Quer um botão de clique na aba CADASTRO? Inserir > Desenho > desenhe um retângulo > ' +
    'Salvar > clique nos 3 pontinhos do desenho > Atribuir script > digite: abrirSeletor',
    ui.ButtonSet.OK);
}

function criarGatilhos_() {
  const ss = _ss();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'aoEditar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(ss).onEdit().create();
}


/* =================================================================================
 *  4. CONSTRUÇÃO DAS ABAS
 * ================================================================================= */

function criarAbaConfig_() {
  const sh = _shCriar(ABA.config, COR.cinzaEsc);
  sh.clear();
  sh.setHiddenGridlines(true);
  _larguras_(sh, [40, 300, 320, 300, 60]);

  _titulo_(sh, 'B2:D3', '⚙️ CONFIGURAÇÕES DO SISTEMA',
    'Parâmetros, pastas do Drive e lista de tipos de carga');

  _secao_(sh, 'B5:D5', '📂 PASTAS DO GOOGLE DRIVE (preenchidas automaticamente)');
  sh.getRange(CFG.root, 2, 4, 2).setValues([
    ['Pasta raiz do sistema (ID)', ''],
    ['Pasta _ENTRADA — onde os arquivos são selecionados (ID)', ''],
    ['Pasta CARGAS_PDF — PDFs finais (ID)', ''],
    ['Pasta ORIGINAIS — fotos arquivadas (ID)', '']
  ]);

  sh.getRange(CFG.manterOriginais, 2, 5, 3).setValues([
    ['Manter fotos originais após converter?', 'NÃO', 'NÃO = mais rápido; as fotos vão para a lixeira e o PDF fica como registro. SIM = guarda cópia na pasta ORIGINAIS.'],
    ['Otimizar imagens antes do PDF?', 'NÃO', 'Deixe NÃO: a janela de seleção já reduz a foto no computador. SIM só é útil para fotos jogadas direto na _ENTRADA pelo Drive.'],
    ['Largura máxima da imagem (px)', 1600, 'Só vale se a otimização estiver SIM.'],
    ['Prefixo do nome do arquivo PDF', 'CARGA', 'Ex.: CARGA-10233_CARGA-FRACIONADA_2026-08-12.pdf'],
    ['Máx. de resultados na pesquisa', 10, 'Entre 1 e 10.']
  ]);

  sh.getRange(CFG.root, 2, 9, 1).setFontWeight('bold').setFontColor(COR.texto);
  sh.getRange(CFG.root, 3, 4, 1).setFontFamily('Roboto Mono').setFontSize(9).setFontColor(COR.cinzaEsc);
  sh.getRange(CFG.manterOriginais, 3, 5, 1)
    .setBackground(COR.clara).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(CFG.root, 4, 9, 1).setFontSize(9).setFontColor(COR.cinzaEsc).setWrap(true);
  sh.getRange(CFG.root, 2, 9, 3).setBorder(true, true, true, true, true, true, COR.linha, null);

  _secao_(sh, 'B' + (CFG.descIni - 2) + ':D' + (CFG.descIni - 2),
    '📝 TIPOS DE CARGA — edite livremente, a lista suspensa do cadastro sai daqui');
  sh.getRange(CFG.descIni - 1, 2).setValue('DESCRIÇÃO / TIPO DA CARGA')
    .setFontWeight('bold').setBackground(COR.primaria).setFontColor(COR.branco)
    .setHorizontalAlignment('center');
  sh.getRange(CFG.descIni - 1, 3).clearContent().setBackground(null);
  sh.getRange(CFG.descIni, 3, CFG.descFim - CFG.descIni + 1, 1).clearContent().setBackground(null);

  sh.getRange(CFG.descIni, 2, DESCRICOES_PADRAO.length, 1)
    .setValues(DESCRICOES_PADRAO.map(function (d) { return [d]; }));
  sh.getRange(CFG.descIni, 2, CFG.descFim - CFG.descIni + 1, 1)
    .setBorder(true, true, true, true, true, true, COR.linha, null)
    .setHorizontalAlignment('left');

  sh.setFrozenRows(4);
  return sh;
}

function criarAbaCargas_() {
  const antiga = _shOpc(ABA.cargas);
  let dados = [];
  if (antiga && antiga.getLastRow() >= CARGAS_INI) {
    dados = _migrarDados_(antiga);
  }

  const sh = _shCriar(ABA.cargas, COR.primaria);
  sh.clear();
  sh.setHiddenGridlines(true);
  _larguras_(sh, [135, 250, 110, 220, 80, 320, 150, 10, 10]);

  _titulo_(sh, 'A1:G3', '📋 CARGAS ARQUIVADAS',
    'Base do sistema — uma linha por carga, com o PDF armazenado no Google Drive');

  const cab = ['Nº DA CARGA', 'DESCRIÇÃO / TIPO', 'DATA', 'CADASTRADO POR', 'PÁGS',
    'OBSERVAÇÃO', 'ARQUIVO PDF', 'ID ARQUIVO', 'ID PASTA'];
  sh.getRange(CARGAS_CAB, 1, 1, cab.length).setValues([cab])
    .setBackground(COR.secundaria).setFontColor(COR.branco).setFontWeight('bold')
    .setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(CARGAS_CAB, 34);

  if (dados.length) sh.getRange(CARGAS_INI, 1, dados.length, CARGAS_NCOL).setValues(dados);

  sh.setFrozenRows(CARGAS_CAB);
  sh.hideColumns(COL.idArquivo, 2);

  if (sh.getMaxRows() < 1000) sh.insertRowsAfter(sh.getMaxRows(), 1000 - sh.getMaxRows());
  const n = sh.getMaxRows() - CARGAS_INI + 1;

  sh.getRange(CARGAS_INI, 1, n, 7).setVerticalAlignment('middle').setFontSize(10);
  sh.getRange(CARGAS_INI, COL.numero, n, 1)
    .setFontWeight('bold').setHorizontalAlignment('center').setFontColor(COR.primaria);
  sh.getRange(CARGAS_INI, COL.data, n, 1)
    .setHorizontalAlignment('center').setNumberFormat('dd/mm/yyyy');
  sh.getRange(CARGAS_INI, COL.paginas, n, 1).setHorizontalAlignment('center');
  sh.getRange(CARGAS_INI, COL.link, n, 1).setHorizontalAlignment('center');

  return sh;
}

/* Converte a base da v1 (12 colunas, com status de triagem) para o formato v2 */
function _migrarDados_(sh) {
  const nCols = Math.max(sh.getLastColumn(), CARGAS_NCOL);
  const vals = sh.getRange(CARGAS_INI, 1, sh.getLastRow() - CARGAS_INI + 1, nCols).getValues();
  const cabAntigo = String(sh.getRange(CARGAS_CAB, 6).getValue() || '').toUpperCase();
  const eraV1 = cabAntigo.indexOf('STATUS') >= 0;

  return vals.filter(function (v) { return String(v[0]).trim(); }).map(function (v) {
    if (eraV1) {
      // v1: 1 nº | 2 desc | 3 data | 4 cadPor | 5 págs | 6 status | 7 triadoPor
      //     8 dataTriagem | 9 obs | 10 link | 11 idArq | 12 idPasta
      return [v[0], v[1], v[2], v[3], v[4], v[8], '', v[10], v[11]];
    }
    return [v[0], v[1], v[2], v[3], v[4], v[5], '', v[7], v[8]];
  });
}

function criarAbaInicio_() {
  const sh = _shCriar(ABA.inicio, COR.destaque);
  sh.clear();
  sh.clearFormats();
  sh.setHiddenGridlines(true);
  _larguras_(sh, [30, 150, 250, 115, 80, 165, 300, 30]);

  _titulo_(sh, 'B2:G4', '🚚 ' + APP.nome,
    APP.empresa + '  •  Arquivo digital das cargas');

  // ---- Único indicador: total de cargas
  sh.getRange('B6:C6').merge().setValue(0)
    .setFontSize(34).setFontWeight('bold').setFontColor(COR.primaria)
    .setHorizontalAlignment('center').setVerticalAlignment('bottom').setBackground(COR.branco);
  sh.getRange('B7:C7').merge().setValue('CARGAS CADASTRADAS')
    .setFontSize(10).setFontWeight('bold').setFontColor(COR.cinzaEsc)
    .setHorizontalAlignment('center').setVerticalAlignment('top').setBackground(COR.branco);
  sh.getRange('B6:C7')
    .setBorder(true, true, true, true, false, false, COR.primaria, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sh.getRange('D6:G7').merge()
    .setValue('Digite abaixo o número da carga, o tipo ou parte da observação.\n' +
      'Com o campo vazio, aparecem as últimas cargas cadastradas.')
    .setFontSize(11).setFontColor(COR.cinzaEsc).setWrap(true)
    .setVerticalAlignment('middle').setHorizontalAlignment('left');
  sh.setRowHeight(6, 52);
  sh.setRowHeight(7, 26);

  // ---- Caixa de pesquisa
  sh.getRange('B9:G9').merge()
    .setValue('🔍  PESQUISAR CARGA  —  digite e tecle ENTER')
    .setFontSize(11).setFontWeight('bold').setFontColor(COR.branco)
    .setBackground(COR.primaria).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(9, 28);

  sh.getRange('B10:G11').merge().setValue('')
    .setFontSize(22).setFontWeight('bold').setFontColor(COR.texto)
    .setBackground(COR.branco).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, false, false, COR.primaria, SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.setRowHeight(10, 34);
  sh.setRowHeight(11, 34);

  sh.getRange('B12:G12').merge().setValue('')
    .setFontSize(10).setFontColor(COR.cinzaEsc).setHorizontalAlignment('center');

  // ---- Resultados
  sh.getRange(14, 2, 1, 6)
    .setValues([['Nº DA CARGA', 'DESCRIÇÃO / TIPO', 'DATA', 'PÁGS', 'ARQUIVO', 'OBSERVAÇÃO']])
    .setBackground(COR.secundaria).setFontColor(COR.branco).setFontWeight('bold')
    .setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(14, 30);

  sh.getRange(15, 2, 10, 6).setVerticalAlignment('middle').setFontSize(11)
    .setBorder(true, true, true, true, true, true, COR.linha, null);
  for (let i = 15; i <= 24; i++) sh.setRowHeight(i, 30);
  sh.getRange(15, 2, 10, 1).setFontWeight('bold').setHorizontalAlignment('center').setFontColor(COR.primaria);
  sh.getRange(15, 4, 10, 1).setHorizontalAlignment('center').setNumberFormat('dd/mm/yyyy');
  sh.getRange(15, 5, 10, 1).setHorizontalAlignment('center');
  sh.getRange(15, 6, 10, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor(COR.secundaria);

  sh.getRange('B26:G26').merge()
    .setValue('➕ Para arquivar uma nova carga, vá para a aba CADASTRO  •  📋 Lista completa na aba CARGAS')
    .setFontSize(10).setFontColor(COR.branco).setBackground(COR.cinzaEsc)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(26, 26);

  sh.setFrozenRows(14);
  return sh;
}

function criarAbaCadastro_() {
  const sh = _shCriar(ABA.cadastro, COR.verde);
  sh.clear();
  sh.clearFormats();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.setHiddenGridlines(true);
  _larguras_(sh, [30, 250, 210, 60, 250, 250, 30]);

  _titulo_(sh, 'B2:F4', '➕ CADASTRAR NOVA CARGA',
    'Selecione os arquivos, preencha os dados e finalize — o PDF é montado e arquivado sozinho');

  // ---------- 1. Arquivos
  _secao_(sh, 'B6:F6', '1️⃣  ARQUIVOS DA CARGA');

  sh.getRange('B7:C7').merge().setValue('📁  SELECIONAR ARQUIVOS')
    .setBackground(COR.destaque).setFontColor(COR.destaqueTexto)
    .setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange('D7:F7').merge()
    .setValue('▶  Abra pelo menu 🚚 CENTRAL DE CARGAS > 📁 SELECIONAR ARQUIVOS (janela).\n' +
      'Para virar botão de clique: Inserir > Desenho > salvar > 3 pontinhos > Atribuir script > abrirSeletor')
    .setBackground(COR.clara).setFontColor(COR.primaria).setFontWeight('bold')
    .setFontSize(9).setWrap(true)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(7, 46);
  sh.getRange('B9:F10').merge()
    .setValue('Nenhum arquivo selecionado ainda.\n' +
      'Ao fechar a janela de seleção, a lista dos arquivos enviados aparece aqui.')
    .setBackground(COR.cinza).setFontColor(COR.cinzaEsc).setFontSize(11)
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true)
    .setBorder(true, true, true, true, false, false, COR.linha, null);

  // ---------- 2. Dados
  _secao_(sh, 'B12:F12', '2️⃣  DADOS DA CARGA');
  const campos = [
    [14, 'Nº DA CARGA  *', 'Não pode repetir. O sistema bloqueia números duplicados.'],
    [16, 'DESCRIÇÃO / TIPO DA CARGA  *', 'Lista editável na aba CONFIG.'],
    [18, 'DATA DE REFERÊNCIA', 'Define a pasta ano/mês onde o PDF será arquivado.'],
    [20, 'OBSERVAÇÃO', 'Opcional. Entra na pesquisa.']
  ];
  campos.forEach(function (c) {
    sh.getRange(c[0], 2).setValue(c[1]).setFontWeight('bold').setFontColor(COR.texto).setFontSize(11);
    sh.getRange(c[0], 3, 1, 3).merge().setValue('')
      .setBackground(COR.branco).setFontSize(13).setVerticalAlignment('middle')
      .setBorder(true, true, true, true, false, false, COR.secundaria, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(c[0], 6).setValue(c[2]).setFontSize(9).setFontColor(COR.cinzaEsc).setWrap(true);
    sh.setRowHeight(c[0], 34);
  });
  sh.getRange(14, 3).setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');
  sh.getRange(18, 3).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center').setValue(new Date());

  // ---------- 3. Finalizar
  _secao_(sh, 'B22:F22', '3️⃣  FINALIZAR');
  _botao_(sh, 'B23:C23', 'D23', 'E23:F23',
    '✅  FINALIZAR CADASTRO', '◀  marque para montar o PDF e arquivar');

  sh.getRange('B25:F27').merge().setValue('Aguardando...')
    .setBackground(COR.cinza).setFontColor(COR.cinzaEsc).setFontSize(11)
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true)
    .setBorder(true, true, true, true, false, false, COR.linha, null);

  return sh;
}

/* Desenha um "botão": rótulo amarelo + caixa de seleção que dispara a ação */
function _botao_(sh, rangeRotulo, celulaCheck, rangeDica, rotulo, dica) {
  sh.getRange(rangeRotulo).merge()
    .setValue(rotulo)
    .setBackground(COR.destaque).setFontColor(COR.destaqueTexto)
    .setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(celulaCheck).insertCheckboxes().setValue(false)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(rangeDica).merge().setValue(dica)
    .setBackground(COR.clara).setFontColor(COR.primaria).setFontWeight('bold')
    .setFontSize(10).setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(Number(rangeRotulo.match(/\d+/)[0]), 40);
}


/* =================================================================================
 *  5. VALIDAÇÕES E FORMATAÇÃO
 * ================================================================================= */

function recriarValidacoes() {
  const cfg = _sh(ABA.config);
  const cargas = _sh(ABA.cargas);
  const cadastro = _sh(ABA.cadastro);

  const vDesc = SpreadsheetApp.newDataValidation()
    .requireValueInRange(cfg.getRange(CFG.descIni, 2, CFG.descFim - CFG.descIni + 1, 1), true)
    .setAllowInvalid(false)
    .setHelpText('Escolha o tipo da carga (lista editável na aba CONFIG).').build();
  const vSimNao = SpreadsheetApp.newDataValidation()
    .requireValueInList(['SIM', 'NÃO'], true).setAllowInvalid(false).build();

  cadastro.getRange(16, 3).setDataValidation(vDesc);
  cargas.getRange(CARGAS_INI, COL.descricao, 1000, 1).setDataValidation(vDesc);
  cfg.getRange(CFG.manterOriginais, 3).setDataValidation(vSimNao);
  cfg.getRange(CFG.otimizar, 3).setDataValidation(vSimNao);

  cargas.setConditionalFormatRules([]);
  try {
    cargas.getRange(CARGAS_CAB, 1, 1000, 7).getBandings().forEach(function (b) { b.remove(); });
    cargas.getRange(CARGAS_CAB, 1, 1000, 7)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  } catch (e) { /* já existe */ }

  SpreadsheetApp.getActive().toast('Validações e formatações recriadas.', '🔧 CONFIG', 5);
}

/* =================================================================================
 *  6. DRIVE
 * ================================================================================= */

function garantirPastas() {
  const cfg = _sh(ABA.config);
  const raiz = _pastaPorIdOuNome_(cfg.getRange(CFG.root, 3).getValue(), APP.pastaRaiz, null);
  const entrada = _pastaPorIdOuNome_(cfg.getRange(CFG.entrada, 3).getValue(), '_ENTRADA', raiz);
  const pdfs = _pastaPorIdOuNome_(cfg.getRange(CFG.pdfs, 3).getValue(), 'CARGAS_PDF', raiz);
  const orig = _pastaPorIdOuNome_(cfg.getRange(CFG.originais, 3).getValue(), 'ORIGINAIS', raiz);

  _gravarSeMudou_(cfg, CFG.root, raiz.getId());
  _gravarSeMudou_(cfg, CFG.entrada, entrada.getId());
  _gravarSeMudou_(cfg, CFG.pdfs, pdfs.getId());
  _gravarSeMudou_(cfg, CFG.originais, orig.getId());

  return { raiz: raiz, entrada: entrada, pdfs: pdfs, originais: orig };
}

function _gravarSeMudou_(cfg, linha, valor) {
  const cel = cfg.getRange(linha, 3);
  if (String(cel.getValue()).trim() !== valor) cel.setValue(valor);
}

function _pastaPorIdOuNome_(id, nome, pai) {
  if (id) {
    try {
      const f = DriveApp.getFolderById(String(id).trim());
      if (!f.isTrashed()) return f;
    } catch (e) { /* recria */ }
  }
  const it = pai ? pai.getFoldersByName(nome) : DriveApp.getFoldersByName(nome);
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) return f;
  }
  return pai ? pai.createFolder(nome) : DriveApp.createFolder(nome);
}

function abrirEntrada() {
  const p = garantirPastas();
  SpreadsheetApp.getUi().alert('📁 Selecionar arquivos',
    'Envie as fotos da carga para a pasta _ENTRADA:\n\n' + p.entrada.getUrl() +
    '\n\nDepois volte aqui e marque a caixa "CONFERIR os arquivos selecionados".',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function mostrarLinksDrive() {
  const p = garantirPastas();
  SpreadsheetApp.getUi().alert('🗂️ Pastas no Google Drive',
    '📥 _ENTRADA (selecionar arquivos):\n' + p.entrada.getUrl() + '\n\n' +
    '📄 CARGAS_PDF (PDFs arquivados):\n' + p.pdfs.getUrl() + '\n\n' +
    '🗄️ ORIGINAIS (fotos guardadas):\n' + p.originais.getUrl() + '\n\n' +
    '📂 RAIZ:\n' + p.raiz.getUrl(),
    SpreadsheetApp.getUi().ButtonSet.OK);
}


/* =================================================================================
 *  7. CADASTRO
 * ================================================================================= */

function verificarEntrada() {
  const p = garantirPastas();
  const imgs = _listarImagens_(p.entrada);
  const pdfs = _listarPdfs_(p.entrada);

  if (!imgs.length && !pdfs.length) {
    _msgArquivos_('⚠️ Nenhum arquivo na pasta _ENTRADA.\n' +
      'Clique em 📁 SELECIONAR ARQUIVOS e envie as fotos da carga.', COR.amareloClaro, COR.amarelo);
    return;
  }
  if (imgs.length) {
    const nomes = imgs.slice(0, 10).map(function (f, i) { return (i + 1) + ') ' + f.getName(); }).join('   ');
    _msgArquivos_('📷 ' + imgs.length + ' imagem(ns) selecionada(s), nesta ordem:\n' +
      nomes + (imgs.length > 10 ? '   ...' : ''), COR.verdeClaro, COR.verde);
  } else {
    _msgArquivos_('📄 1 PDF selecionado: ' + pdfs[0].getName() +
      ' — será arquivado como está.', COR.verdeClaro, COR.verde);
  }
}

function cadastrarCarga() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    _msgResultado_('⏳ Outro cadastro está em andamento. Aguarde e tente de novo.', COR.amareloClaro, COR.amarelo);
    return;
  }

  try {
    const sh = _sh(ABA.cadastro);
    const cargas = _sh(ABA.cargas);
    const cfg = _sh(ABA.config);

    const numero = String(sh.getRange(14, 3).getValue()).trim();
    const descricao = String(sh.getRange(16, 3).getValue()).trim();
    let dataRef = sh.getRange(18, 3).getValue();
    const obs = String(sh.getRange(20, 3).getValue()).trim();

    if (!numero) return _erro_('❌ Informe o Nº DA CARGA.');
    if (!descricao) return _erro_('❌ Escolha a DESCRIÇÃO / TIPO DA CARGA.');
    if (!(dataRef instanceof Date)) dataRef = new Date();

    const dup = _acharCarga_(numero);
    if (dup) {
      return _erro_('🚫 CARGA DUPLICADA.\n\nO número "' + numero + '" já está arquivado (linha ' +
        dup.linha + ', ' + dup.descricao + ', ' + _dataBr_(dup.data) + ').\n' +
        'Use outro número ou localize a carga na aba INÍCIO.');
    }

    const p = garantirPastas();
    const imgs = _listarImagens_(p.entrada);
    const pdfsSoltos = _listarPdfs_(p.entrada);

    if (!imgs.length && !pdfsSoltos.length) {
      return _erro_('❌ Nenhum arquivo selecionado.\n\n' +
        'Clique em 📁 SELECIONAR ARQUIVOS, envie as fotos para a pasta _ENTRADA e finalize novamente.');
    }

    SpreadsheetApp.getActive().toast('Montando o PDF...', '⏳ Processando', 30);

    const prefixo = String(cfg.getRange(CFG.prefixo, 3).getValue() || 'CARGA').trim();
    const nomeBase = prefixo + '-' + _slug_(numero) + '_' + _slug_(descricao) + '_' + _dataIso_(dataRef);

    let pdfBlob, paginas;
    if (imgs.length) {
      const otimizar = String(cfg.getRange(CFG.otimizar, 3).getValue()).toUpperCase() === 'SIM';
      const largura = Number(cfg.getRange(CFG.larguraMax, 3).getValue()) || 1600;
      const blobs = imgs.map(function (f) { return otimizar ? _blobOtimizado_(f, largura) : f.getBlob(); });

      const pesoMb = blobs.reduce(function (s, b) { return s + b.getBytes().length; }, 0) / 1048576;
      if (pesoMb > 45) {
        return _erro_('❌ Os arquivos somam ' + pesoMb.toFixed(1) + ' MB e o limite de montagem é ~45 MB.\n' +
          'Divida a carga em duas partes (ex.: 10233-A e 10233-B) ou reduza a largura máxima na CONFIG.');
      }
      pdfBlob = _imagensParaPdf_(blobs, nomeBase);
      paginas = blobs.length;
    } else {
      pdfBlob = pdfsSoltos[0].getBlob().setName(nomeBase + '.pdf');
      paginas = 1;
      if (pdfsSoltos.length > 1) {
        SpreadsheetApp.getActive().toast('Havia mais de um PDF na _ENTRADA. Só o primeiro foi usado.', '⚠️ Atenção', 8);
      }
    }

    const pastaDestino = _pastaMes_(p.pdfs, dataRef);
    const arquivoPdf = pastaDestino.createFile(pdfBlob);
    arquivoPdf.setName(nomeBase + '.pdf');
    arquivoPdf.setDescription('Carga ' + numero + ' | ' + descricao + ' | ' + (obs || 'sem observação'));

    const manter = String(cfg.getRange(CFG.manterOriginais, 3).getValue()).toUpperCase() === 'SIM';
    let pastaOrig = null;
    if (manter) pastaOrig = p.originais.createFolder(nomeBase);
    imgs.concat(pdfsSoltos).forEach(function (f) {
      try {
        if (manter) { pastaOrig.addFile(f); p.entrada.removeFile(f); }
        else { f.setTrashed(true); }
      } catch (e) { /* segue */ }
    });

    const linha = Math.max(cargas.getLastRow() + 1, CARGAS_INI);
    cargas.getRange(linha, 1, 1, CARGAS_NCOL).setValues([[
      numero, descricao, dataRef, _usuario_(), paginas, obs, '',
      arquivoPdf.getId(), pastaDestino.getId()
    ]]);
    cargas.getRange(linha, COL.link).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText('📄 ABRIR PDF')
        .setLinkUrl(arquivoPdf.getUrl()).build());

    sh.getRange(14, 3).clearContent();
    sh.getRange(20, 3).clearContent();
    _msgArquivos_('Nenhum arquivo selecionado ainda.', COR.cinza, COR.cinzaEsc);

    _msgResultado_('✅ CARGA ' + numero + ' ARQUIVADA COM SUCESSO\n' +
      descricao + '  •  ' + paginas + ' página(s)  •  PDF salvo em ' + pastaDestino.getName() + '\n' +
      'Já pode ser localizada na pesquisa da aba INÍCIO.', COR.verdeClaro, COR.verde);

    recalcularPaineis();
    SpreadsheetApp.getActive().toast('Carga ' + numero + ' arquivada!', '✅ Sucesso', 6);

  } catch (err) {
    _erro_('💥 Erro inesperado: ' + err.message + '\n\nNada foi gravado na base. Tente novamente.');
  } finally {
    lock.releaseLock();
  }
}


/* ---------------------------- Conversão imagem → PDF ---------------------------- */

function _imagensParaPdf_(blobs, nomeBase) {
  const doc = DocumentApp.create('__TMP_' + nomeBase + '_' + Date.now());
  const body = doc.getBody();
  body.setMarginTop(0).setMarginBottom(0).setMarginLeft(0).setMarginRight(0);

  const imgs = [];   // { img, w, h } com as dimensões originais
  blobs.forEach(function (b, i) {
    const par = body.appendParagraph('');
    par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    par.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    try {
      const img = par.appendInlineImage(b);
      imgs.push({ img: img, w: img.getWidth(), h: img.getHeight() });
    } catch (e) {
      par.appendText('[Arquivo não suportado: ' + b.getName() + ']');
      imgs.push(null);
    }
    if (i < blobs.length - 1) body.appendPageBreak();
  });

  // A página passa a ter a MESMA proporção da primeira imagem:
  // com margem zero, a foto ocupa a folha inteira, sem distorcer e sem faixa branca.
  let pw = 595, ph = 842;
  for (let i = 0; i < imgs.length; i++) {
    if (!imgs[i]) continue;
    const w = imgs[i].w, h = imgs[i].h;
    if (w >= h) { ph = 595; pw = Math.round(595 * w / h); }
    else { pw = 595; ph = Math.round(595 * h / w); }
    pw = Math.min(Math.max(pw, 200), 1400);
    ph = Math.min(Math.max(ph, 200), 1400);
    break;
  }
  body.setPageWidth(pw).setPageHeight(ph);

  // 2 pontos de folga evitam que o arredondamento gere uma página em branco extra
  imgs.forEach(function (o) {
    if (!o) return;
    const e = Math.min(pw / o.w, (ph - 2) / o.h);
    o.img.setWidth(Math.floor(o.w * e));
    o.img.setHeight(Math.floor(o.h * e));
  });

  try {
    if (body.getNumChildren() > 1) {
      const p0 = body.getChild(0);
      if (p0.getType() === DocumentApp.ElementType.PARAGRAPH &&
        p0.asParagraph().getText() === '' && p0.asParagraph().getNumChildren() === 0) {
        p0.removeFromParent();
      }
    }
  } catch (e) { /* ignora */ }

  doc.saveAndClose();
  const arqDoc = DriveApp.getFileById(doc.getId());
  const pdf = arqDoc.getAs(MimeType.PDF).setName(nomeBase + '.pdf');
  arqDoc.setTrashed(true);
  return pdf;
}

function _blobOtimizado_(file, larguraMax) {
  try {
    const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w' + larguraMax;
    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true, followRedirects: true
    });
    if (resp.getResponseCode() === 200) {
      const b = resp.getBlob();
      if (b.getBytes().length > 8000) return b.setName(file.getName());
    }
  } catch (e) { /* usa o original */ }
  return file.getBlob();
}

function _listarImagens_(pasta) {
  const out = [];
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (MIMES_IMAGEM.indexOf(String(f.getMimeType()).toLowerCase()) >= 0) out.push(f);
  }
  out.sort(function (a, b) {
    return a.getName().localeCompare(b.getName(), 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
  return out;
}

function _listarPdfs_(pasta) {
  const out = [];
  const it = pasta.getFilesByType(MimeType.PDF);
  while (it.hasNext()) out.push(it.next());
  out.sort(function (a, b) { return a.getName().localeCompare(b.getName(), 'pt-BR', { numeric: true }); });
  return out;
}

function _pastaMes_(pdfs, data) {
  const meses = ['01-JANEIRO', '02-FEVEREIRO', '03-MARÇO', '04-ABRIL', '05-MAIO', '06-JUNHO',
    '07-JULHO', '08-AGOSTO', '09-SETEMBRO', '10-OUTUBRO', '11-NOVEMBRO', '12-DEZEMBRO'];
  const ano = _pastaPorIdOuNome_(null, String(data.getFullYear()), pdfs);
  return _pastaPorIdOuNome_(null, meses[data.getMonth()], ano);
}


/* =================================================================================
 *  7-B. JANELA DE SELEÇÃO DE ARQUIVOS (diálogo interno do Sheets)
 * ================================================================================= */

function abrirSeletor() {
  try {
    const p = garantirPastas();
    const html = HtmlService.createHtmlOutput(
      _htmlSeletor_().replace('__ID_ENTRADA__', p.entrada.getId()))
      .setWidth(620).setHeight(600);
    SpreadsheetApp.getUi().showModalDialog(html, 'Selecionar arquivos da carga');
  } catch (e) {
    // Erro real na tela, nunca engolido
    try {
      SpreadsheetApp.getUi().alert('Não foi possível abrir a janela',
        e.message + '\n\nSe a mensagem falar em interface do usuário, abra pelo menu ' +
        '🚚 CENTRAL DE CARGAS > 📁 SELECIONAR ARQUIVOS (janela) — caixas de seleção não ' +
        'podem abrir janelas no Google Sheets.',
        SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e2) {
      SpreadsheetApp.getActive().toast(
        'Abra pelo menu 🚚 CENTRAL DE CARGAS > 📁 SELECIONAR ARQUIVOS (janela).',
        'ℹ️ Como abrir', 8);
    }
  }
}

/* A janela de seleção mora aqui dentro — não existe arquivo HTML separado */
function _htmlSeletor_() {
  return `<!DOCTYPE html>
<html>
<head>
<base target="_top">
<meta charset="utf-8">
<style>
  :root{
    --azul:#111785; --azul2:#2A31A8; --amarelo:#FFEE03;
    --verde:#01973A; --vermelho:#D71920;
    --claro:#E7E8F4; --cinza:#F4F4F8; --linha:#C5C8E0; --texto:#1A1C33;
  }
  *{box-sizing:border-box;}
  body{
    font-family:Roboto,Arial,sans-serif; margin:0; padding:14px;
    color:var(--texto); background:#fff; font-size:13px;
  }
  h1{font-size:15px; margin:0 0 2px; color:var(--azul); letter-spacing:.3px;}
  .sub{font-size:11px; color:#5B5F7A; margin-bottom:12px;}

  #aviso{
    display:none; background:#FFFCD9; border:1px solid #E4D77A; color:#8A7D00;
    padding:8px 10px; border-radius:6px; font-size:12px; margin-bottom:10px;
  }
  #aviso button{
    background:#8A7D00; color:#fff; border:0; border-radius:4px;
    padding:3px 9px; font-size:11px; cursor:pointer; margin-left:6px;
  }

  #zona{
    border:2px dashed var(--azul2); border-radius:10px; background:var(--cinza);
    padding:22px 14px; text-align:center; cursor:pointer; transition:.15s;
  }
  #zona:hover, #zona.over{background:var(--claro); border-color:var(--azul);}
  #zona .icone{font-size:30px; line-height:1;}
  #zona .t{font-weight:700; color:var(--azul); margin-top:6px; font-size:14px;}
  #zona .d{font-size:11px; color:#5B5F7A; margin-top:3px;}
  input[type=file]{display:none;}

  #contagem{margin:12px 0 5px; font-weight:700; color:var(--azul); font-size:12px;}
  #lista{
    max-height:210px; overflow-y:auto; border:1px solid var(--linha);
    border-radius:6px; display:none;
  }
  .item{
    display:flex; align-items:center; gap:7px; padding:5px 8px;
    border-bottom:1px solid #EDEFF7; font-size:12px;
  }
  .item:last-child{border-bottom:0;}
  .item .ord{
    background:var(--azul); color:#fff; border-radius:4px; min-width:24px;
    text-align:center; font-weight:700; font-size:11px; padding:2px 0;
  }
  .item .nome{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .item .peso{color:#5B5F7A; font-size:11px;}
  .item button{
    border:1px solid var(--linha); background:#fff; border-radius:4px;
    cursor:pointer; width:22px; height:22px; line-height:1; font-size:11px; padding:0;
  }
  .item button:hover{background:var(--claro);}
  .item .x{color:var(--vermelho); border-color:#F0C4C6;}

  #rodape{margin-top:14px; display:flex; gap:8px; align-items:center;}
  .btn{
    border:0; border-radius:6px; padding:11px 16px; font-weight:700;
    font-size:13px; cursor:pointer;
  }
  .btn.primario{background:var(--amarelo); color:var(--azul); flex:1;}
  .btn.primario:disabled{background:#EDEFF7; color:#9AA0BC; cursor:not-allowed;}
  .btn.neutro{background:#fff; color:#5B5F7A; border:1px solid var(--linha);}

  #barra{height:7px; background:#EDEFF7; border-radius:4px; margin-top:12px; display:none;}
  #barra div{height:100%; width:0; background:var(--verde); border-radius:4px; transition:width .2s;}
  #status{font-size:12px; margin-top:7px; min-height:16px;}
  .ok{color:var(--verde); font-weight:700;}
  .err{color:var(--vermelho); font-weight:700;}
</style>
</head>
<body>

<h1>📁 SELECIONAR ARQUIVOS DA CARGA</h1>
<div class="sub">As imagens viram páginas do PDF na ordem numerada abaixo.</div>

<div id="aviso"></div>

<div id="zona">
  <div class="icone">📤</div>
  <div class="t">Clique aqui para procurar no computador</div>
  <div class="d">ou arraste as fotos para dentro desta área — JPG, PNG ou PDF</div>
</div>
<input type="file" id="arquivo" multiple accept="image/*,application/pdf">

<div id="contagem"></div>
<div id="lista"></div>

<div id="barra"><div></div></div>
<div id="status"></div>

<div id="rodape">
  <button class="btn primario" id="enviar" disabled>ENVIAR ARQUIVOS</button>
  <button class="btn neutro" id="fechar">Cancelar</button>
</div>

<script>
  var ID_ENTRADA  = '__ID_ENTRADA__';  // preenchido pelo script ao abrir a janela
  var LARGURA_MAX = 1600;   // redimensiona antes de enviar
  var QUALIDADE   = 0.82;
  var PARALELO    = 4;      // envios simultâneos
  var arquivos = [];

  var zona = document.getElementById('zona');
  var input = document.getElementById('arquivo');
  var lista = document.getElementById('lista');
  var contagem = document.getElementById('contagem');
  var btnEnviar = document.getElementById('enviar');
  var barra = document.getElementById('barra');
  var status = document.getElementById('status');

  // ---------- avisa se sobrou coisa da vez anterior ----------
  google.script.run.withSuccessHandler(function (n) {
    if (n > 0) {
      var a = document.getElementById('aviso');
      a.style.display = 'block';
      a.innerHTML = '⚠️ Já existem <b>' + n + ' arquivo(s)</b> aguardando de um envio anterior. ' +
        'Eles entrarão no mesmo PDF.' +
        '<button onclick="limpar()">Limpar antes</button>';
    }
  }).contarEntrada();

  function limpar() {
    document.getElementById('aviso').innerHTML = '⏳ Limpando...';
    google.script.run.withSuccessHandler(function () {
      document.getElementById('aviso').innerHTML = '✔ Pasta limpa. Só os arquivos abaixo entrarão no PDF.';
    }).limparEntrada();
  }

  // ---------- seleção ----------
  zona.onclick = function () { input.click(); };
  input.onchange = function () { adicionar(input.files); input.value = ''; };

  ['dragenter', 'dragover'].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('over'); });
  });
  zona.addEventListener('drop', function (e) { adicionar(e.dataTransfer.files); });

  function adicionar(fl) {
    for (var i = 0; i < fl.length; i++) arquivos.push(fl[i]);
    arquivos.sort(function (a, b) {
      return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });
    render();
  }

  function render() {
    lista.innerHTML = '';
    if (!arquivos.length) {
      lista.style.display = 'none';
      contagem.textContent = '';
      btnEnviar.disabled = true;
      return;
    }
    lista.style.display = 'block';
    var mb = arquivos.reduce(function (s, f) { return s + f.size; }, 0) / 1048576;
    contagem.textContent = arquivos.length + ' arquivo(s) — ' + mb.toFixed(1) + ' MB';
    btnEnviar.disabled = false;

    arquivos.forEach(function (f, i) {
      var d = document.createElement('div');
      d.className = 'item';
      d.innerHTML =
        '<span class="ord">' + (i + 1) + '</span>' +
        '<span class="nome" title="' + f.name + '">' + f.name + '</span>' +
        '<span class="peso">' + (f.size / 1048576).toFixed(1) + ' MB</span>' +
        '<button onclick="mover(' + i + ',-1)" title="Subir">▲</button>' +
        '<button onclick="mover(' + i + ',1)" title="Descer">▼</button>' +
        '<button class="x" onclick="remover(' + i + ')" title="Remover">✕</button>';
      lista.appendChild(d);
    });
  }

  function mover(i, d) {
    var j = i + d;
    if (j < 0 || j >= arquivos.length) return;
    var t = arquivos[i]; arquivos[i] = arquivos[j]; arquivos[j] = t;
    render();
  }
  function remover(i) { arquivos.splice(i, 1); render(); }

  // ---------- preparo do arquivo (redimensiona imagem no navegador) ----------
  function preparar(file) {
    return new Promise(function (res) {
      var cru = function () {
        var r = new FileReader();
        r.onload = function () {
          res({ mime: file.type || 'application/octet-stream', b64: r.result.split(',')[1], ext: null });
        };
        r.readAsDataURL(file);
      };
      if (!file.type || file.type.indexOf('image/') !== 0) return cru();

      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height;
        var e = Math.min(1, LARGURA_MAX / Math.max(w, h));
        w = Math.round(w * e); h = Math.round(h * e);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        try {
          var dados = c.toDataURL('image/jpeg', QUALIDADE);
          res({ mime: 'image/jpeg', b64: dados.split(',')[1], ext: 'jpg' });
        } catch (err) { cru(); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); cru(); };
      img.src = url;
    });
  }

  function enviarUm(nome, mime, b64) {
    return new Promise(function (res, rej) {
      google.script.run
        .withSuccessHandler(res)
        .withFailureHandler(function (e) { rej(e); })
        .enviarArquivo(ID_ENTRADA, nome, mime, b64);
    });
  }

  function pad(n) { return ('00' + n).slice(-3); }

  // ---------- envio ----------
  btnEnviar.onclick = async function () {
    btnEnviar.disabled = true;
    document.getElementById('fechar').disabled = true;
    barra.style.display = 'block';
    var preenche = barra.firstElementChild;

    var total = arquivos.length, prontos = 0, erro = null;
    var fila = arquivos.map(function (f, i) { return { f: f, i: i }; });

    function progresso() {
      prontos++;
      preenche.style.width = Math.round((prontos / total) * 100) + '%';
      status.textContent = 'Enviando... ' + prontos + ' de ' + total;
    }

    // Fila com vários envios ao mesmo tempo — muito mais rápido que um por vez
    async function trabalhador() {
      while (fila.length && !erro) {
        var item = fila.shift();
        try {
          var p = await preparar(item.f);
          var nome = item.f.name;
          if (p.ext) nome = nome.replace(/\.[^.]+$/, '') + '.' + p.ext;
          await enviarUm(pad(item.i + 1) + '_' + nome, p.mime, p.b64);
          progresso();
        } catch (e) {
          erro = { nome: item.f.name, msg: (e && e.message) ? e.message : e };
        }
      }
    }

    status.textContent = 'Preparando os arquivos...';
    var equipe = [];
    for (var k = 0; k < Math.min(PARALELO, total); k++) equipe.push(trabalhador());
    await Promise.all(equipe);

    if (erro) {
      status.innerHTML = '<span class="err">✖ Falha em ' + erro.nome + ': ' + erro.msg + '</span>';
      btnEnviar.disabled = false;
      document.getElementById('fechar').disabled = false;
      return;
    }

    status.innerHTML = '<span class="ok">✔ ' + total + ' arquivo(s) enviado(s). Fechando...</span>';
    google.script.run.withSuccessHandler(function () {
      setTimeout(function () { google.script.host.close(); }, 700);
    }).finalizarEnvio();
  };

  document.getElementById('fechar').onclick = function () { google.script.host.close(); };
</script>
</body>
</html>
`;
}

/* Chamado pela janela: grava um arquivo na pasta _ENTRADA.
   O ID vem pronto da janela — evita refazer a busca das pastas a cada arquivo. */
function enviarArquivo(idPasta, nome, mime, base64) {
  const pasta = idPasta ? DriveApp.getFolderById(idPasta) : garantirPastas().entrada;
  pasta.createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime, nome));
  return nome;
}

/* Chamado pela janela ao abrir: quantos arquivos já estão na _ENTRADA */
function contarEntrada() {
  const p = garantirPastas();
  return _listarImagens_(p.entrada).length + _listarPdfs_(p.entrada).length;
}

/* Chamado pela janela: esvazia a _ENTRADA (arquivos vão para a lixeira do Drive) */
function limparEntrada() {
  const p = garantirPastas();
  let n = 0;
  const it = p.entrada.getFiles();
  while (it.hasNext()) { it.next().setTrashed(true); n++; }
  return n;
}

function limparEntradaComConfirmacao() {
  const ui = SpreadsheetApp.getUi();
  const n = contarEntrada();
  if (!n) {
    ui.alert('A pasta _ENTRADA já está vazia.');
    return;
  }
  const r = ui.alert('Limpar arquivos não usados',
    'Existem ' + n + ' arquivo(s) na _ENTRADA que ainda não viraram carga.\n\n' +
    'Eles serão enviados para a lixeira do Drive. Continuar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  limparEntrada();
  _msgArquivos_('Nenhum arquivo selecionado ainda.', COR.cinza, COR.cinzaEsc);
  SpreadsheetApp.getActive().toast(n + ' arquivo(s) removido(s).', '🗑️ Limpo', 5);
}

/* Chamado pela janela ao terminar o envio */
function finalizarEnvio() {
  verificarEntrada();
  return true;
}


/* =================================================================================
 *  8. PESQUISA
 * ================================================================================= */

function pesquisar(termo) {
  const sh = _sh(ABA.inicio);
  const cfg = _sh(ABA.config);
  const max = Math.min(Math.max(Number(cfg.getRange(CFG.maxResultados, 3).getValue()) || 10, 1), 10);

  sh.getRange(15, 2, 10, 6).clearContent();

  const base = _lerCargas_();
  const q = _norm_(termo);
  let achados, rotulo;

  if (!q) {
    achados = base.slice(-max).reverse();
    rotulo = achados.length
      ? 'Últimas ' + achados.length + ' cargas arquivadas — digite acima para pesquisar'
      : 'Nenhuma carga arquivada ainda. Vá para a aba CADASTRO para começar.';
  } else {
    const pont = [];
    base.forEach(function (c) {
      const num = _norm_(c.numero);
      let p = 0;
      if (num === q) p = 100;
      else if (num.indexOf(q) === 0) p = 80;
      else if (num.indexOf(q) >= 0) p = 60;
      else if (_norm_(c.descricao).indexOf(q) >= 0) p = 40;
      else if (_norm_(c.obs).indexOf(q) >= 0) p = 25;
      if (p) pont.push({ c: c, p: p });
    });
    pont.sort(function (a, b) { return b.p - a.p || b.c.linha - a.c.linha; });
    achados = pont.slice(0, max).map(function (x) { return x.c; });
    rotulo = achados.length
      ? '✔ ' + achados.length + ' resultado(s) para "' + termo + '"' + (pont.length > max ? ' (de ' + pont.length + ')' : '')
      : '✖ Nenhuma carga encontrada para "' + termo + '". Confira o número ou pesquise pelo tipo da carga.';
  }

  sh.getRange('B12').setValue(rotulo).setFontColor(achados.length ? COR.verde : COR.vermelho);

  if (!achados.length) return;

  const linhas = achados.map(function (c) {
    return [c.numero, c.descricao, c.data, c.paginas, '', c.obs];
  });
  sh.getRange(15, 2, linhas.length, 6).setValues(linhas);

  const links = achados.map(function (c) {
    return [c.url
      ? SpreadsheetApp.newRichTextValue().setText('📄 ABRIR PDF').setLinkUrl(c.url).build()
      : SpreadsheetApp.newRichTextValue().setText('—').build()];
  });
  sh.getRange(15, 6, links.length, 1).setRichTextValues(links);
}

function recalcularPaineis() {
  const base = _lerCargas_();
  const ini = _sh(ABA.inicio);
  ini.getRange('B6').setValue(base.length);
  pesquisar(String(ini.getRange('B10').getValue() || ''));
}


/* =================================================================================
 *  9. GATILHO DE EDIÇÃO (os botões)
 * ================================================================================= */

function aoEditar(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const nome = sh.getName();
  const a1 = e.range.getA1Notation();

  try {
    if (nome === ABA.inicio && a1 === 'B10') {
      pesquisar(String(e.range.getValue() || ''));
      return;
    }
    if (nome === ABA.cadastro) {
      if (a1 === 'D7' && e.range.getValue() === true) {
        e.range.setValue(false);
        SpreadsheetApp.getActive().toast(
          'A janela de seleção só abre pelo menu 🚚 CENTRAL DE CARGAS > 📁 SELECIONAR ARQUIVOS.',
          'ℹ️ Como abrir', 8);
        return;
      }
      if (a1 === 'D23' && e.range.getValue() === true) {
        e.range.setValue(false);
        cadastrarCarga();
        return;
      }
    }
    if (nome === ABA.config && e.range.getColumn() === 2 && e.range.getRow() >= CFG.descIni) {
      recriarValidacoes();
    }
  } catch (err) {
    SpreadsheetApp.getActive().toast(err.message, '⚠️ Erro', 8);
  }
}


/* =================================================================================
 *  10. DIAGNÓSTICO
 * ================================================================================= */

function diagnostico() {
  const linhas = [];
  const ok = '✅', nao = '❌';

  Object.keys(ABA).forEach(function (k) {
    linhas.push((_shOpc(ABA[k]) ? ok : nao) + ' Aba ' + ABA[k]);
  });

  try {
    const p = garantirPastas();
    linhas.push(ok + ' Pastas do Drive acessíveis');
    linhas.push('   • Arquivos na _ENTRADA: ' +
      (_listarImagens_(p.entrada).length + _listarPdfs_(p.entrada).length));
  } catch (e) {
    linhas.push(nao + ' Pastas do Drive: ' + e.message);
  }

  const tem = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'aoEditar'; });
  linhas.push((tem ? ok : nao) + ' Gatilho de edição instalado' + (tem ? '' : ' — rode INSTALAR novamente'));

  const base = _lerCargas_();
  linhas.push(ok + ' Cargas arquivadas: ' + base.length);

  const vistos = {};
  let dups = 0, semArquivo = 0;
  base.forEach(function (c) {
    const k = _norm_(c.numero);
    if (vistos[k]) dups++; else vistos[k] = 1;
    if (!c.url) semArquivo++;
  });
  linhas.push((dups ? nao : ok) + ' Números duplicados: ' + dups);
  linhas.push((semArquivo ? '⚠️' : ok) + ' Cargas sem PDF vinculado: ' + semArquivo);

  SpreadsheetApp.getUi().alert('🩺 Diagnóstico — ' + APP.nome + ' v' + APP.versao,
    linhas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}


/* =================================================================================
 *  11. UTILITÁRIOS
 * ================================================================================= */

function _ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function _shOpc(n) { return _ss().getSheetByName(n); }
function _sh(n) {
  const s = _shOpc(n);
  if (!s) throw new Error('Aba "' + n + '" não encontrada. Rode 🚚 > Administração > INSTALAR.');
  return s;
}
function _shCriar(nome, cor) {
  let s = _shOpc(nome);
  if (!s) s = _ss().insertSheet(nome);
  s.setTabColor(cor);
  return s;
}

function _larguras_(sh, larguras) {
  larguras.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function _titulo_(sh, rangeA1, titulo, subtitulo) {
  const r = sh.getRange(rangeA1);
  r.merge().setBackground(COR.primaria).setVerticalAlignment('middle').setHorizontalAlignment('left');
  r.setRichTextValue(SpreadsheetApp.newRichTextValue()
    .setText(titulo + '\n' + subtitulo)
    .setTextStyle(0, titulo.length, SpreadsheetApp.newTextStyle()
      .setForegroundColor(COR.branco).setFontSize(20).setBold(true).build())
    .setTextStyle(titulo.length + 1, titulo.length + 1 + subtitulo.length,
      SpreadsheetApp.newTextStyle().setForegroundColor(COR.subtitulo).setFontSize(10).setBold(false).build())
    .build());
  const l = rangeA1.match(/\d+/g);
  for (let i = Number(l[0]); i <= Number(l[1]); i++) sh.setRowHeight(i, 26);
}

function _secao_(sh, rangeA1, texto) {
  sh.getRange(rangeA1).merge().setValue(texto)
    .setBackground(COR.clara).setFontColor(COR.primaria).setFontWeight('bold')
    .setFontSize(11).setVerticalAlignment('middle');
  sh.setRowHeight(Number(rangeA1.match(/\d+/)[0]), 26);
}

function _msgArquivos_(texto, fundo, cor) {
  _sh(ABA.cadastro).getRange('B9:F10')
    .setValue(texto).setBackground(fundo).setFontColor(cor).setFontWeight('bold');
}

function _msgResultado_(texto, fundo, cor) {
  _sh(ABA.cadastro).getRange('B25:F27')
    .setValue(texto).setBackground(fundo).setFontColor(cor).setFontWeight('bold');
}

function _erro_(msg) {
  _msgResultado_(msg, COR.vermelhoClaro, COR.vermelho);
  SpreadsheetApp.getActive().toast('Cadastro não concluído. Veja a mensagem na aba CADASTRO.', '❌ Atenção', 8);
  return null;
}

function _lerCargas_() {
  const sh = _sh(ABA.cargas);
  const ult = sh.getLastRow();
  if (ult < CARGAS_INI) return [];
  const vals = sh.getRange(CARGAS_INI, 1, ult - CARGAS_INI + 1, CARGAS_NCOL).getValues();
  const rich = sh.getRange(CARGAS_INI, COL.link, ult - CARGAS_INI + 1, 1).getRichTextValues();
  const out = [];
  vals.forEach(function (v, i) {
    if (!String(v[0]).trim()) return;
    let url = rich[i][0] ? rich[i][0].getLinkUrl() : null;
    if (!url && v[COL.idArquivo - 1]) url = 'https://drive.google.com/file/d/' + v[COL.idArquivo - 1] + '/view';
    out.push({
      linha: CARGAS_INI + i,
      numero: String(v[0]).trim(),
      descricao: v[1],
      data: v[2],
      cadastradoPor: v[3],
      paginas: v[4],
      obs: v[5],
      url: url
    });
  });
  return out;
}

function _acharCarga_(numero) {
  const alvo = _norm_(numero);
  const lista = _lerCargas_();
  for (let i = 0; i < lista.length; i++) {
    if (_norm_(lista[i].numero) === alvo) return lista[i];
  }
  return null;
}

function _norm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function _slug_(v) {
  return _norm_(v).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function _dataIso_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Bahia', 'yyyy-MM-dd');
}

function _dataBr_(d) {
  if (!(d instanceof Date)) return String(d || '');
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Bahia', 'dd/MM/yyyy');
}

function _usuario_() {
  try {
    return Session.getActiveUser().getEmail() || 'usuário não identificado';
  } catch (err) { return 'usuário não identificado'; }
}
