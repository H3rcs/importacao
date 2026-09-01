/**
 * BANCO
 *
 * Camada unica de acesso a dados. Nenhum outro arquivo conhece
 * SpreadsheetApp. Se um dia o banco virar Firestore ou Cloud SQL,
 * so este arquivo muda.
 *
 * Regras que este arquivo garante:
 *   - todo registro tem ID proprio, que nunca muda quando a aba e reordenada
 *   - exclusao e logica (coluna EXCLUIDO), entao nada some do historico
 *   - escrita concorrente e serializada por LockService
 *   - leitura e uma viagem por aba, nunca celula a celula
 */

/*
 * As propriedades sao lidas dezenas de vezes por requisicao (ID_BANCO,
 * EMAIL_ADMIN, VERSAO_ESQUEMA...) e cada leitura e uma chamada de servico.
 * Uma leitura so por execucao, guardada aqui.
 */
var _props = null;

function prop(chave, padrao) {
  if (!_props) _props = PropertiesService.getScriptProperties().getProperties();
  const v = _props[chave];
  return (v === null || v === undefined || v === '') ? padrao : v;
}

/** Quem grava propriedade tem que derrubar esta copia. */
function esquecerProps() { _props = null; }

/* ------------------------------------------------------------------ */
/* CACHE DE TEXTO GRANDE                                               */
/*                                                                     */
/* O CacheService recusa qualquer valor acima de 100 KB, e recusa em    */
/* silencio: a gravacao "funciona" e a leitura seguinte volta vazia. O  */
/* payload de uma tela cheia passa disso com facilidade. Aqui o texto e */
/* fatiado em pedacos de 90 KB e remontado na leitura.                  */
/* ------------------------------------------------------------------ */

const FATIA_CACHE = 90 * 1024;

function gravarTextoCache(chave, texto, segundos) {
  try {
    const cache = CacheService.getScriptCache();
    const pedacos = [];
    for (let i = 0; i < texto.length; i += FATIA_CACHE) {
      pedacos.push(texto.substring(i, i + FATIA_CACHE));
    }
    if (pedacos.length > 20) return false;   // grande demais: nao vale cachear

    const mapa = { };
    mapa[chave] = String(pedacos.length);
    pedacos.forEach(function (p, i) { mapa[chave + ':' + i] = p; });
    cache.putAll(mapa, segundos || 120);
    return true;
  } catch (e) { return false; }
}

function lerTextoCache(chave) {
  try {
    const cache = CacheService.getScriptCache();
    const quantos = Number(cache.get(chave) || 0);
    if (!quantos) return null;

    const nomes = [];
    for (let i = 0; i < quantos; i++) nomes.push(chave + ':' + i);
    const partes = cache.getAll(nomes);

    let texto = '';
    for (let i = 0; i < quantos; i++) {
      const p = partes[chave + ':' + i];
      if (p === undefined || p === null) return null;   // fatia venceu: descarta tudo
      texto += p;
    }
    return texto;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ */
/* GERACAO DOS DADOS                                                   */
/*                                                                     */
/* Nao da para apagar chaves de cache que a gente nao consegue listar   */
/* (sao uma por tela, perfil e parametro). Entao toda chave carrega o   */
/* numero da geracao: qualquer gravacao no banco avanca o numero e as   */
/* chaves antigas viram lixo que expira sozinho.                        */
/* ------------------------------------------------------------------ */

var _geracao = null;

function geracaoDados() {
  if (_geracao) return _geracao;
  const cache = CacheService.getScriptCache();
  let g = cache.get('geracao');
  if (!g) {
    g = prop('GERACAO_DADOS', '1');
    cache.put('geracao', g, 21600);
  }
  _geracao = g;
  return g;
}

function avancarGeracao() {
  const g = String(Number(geracaoDados() || 1) + 1);
  PropertiesService.getScriptProperties().setProperty('GERACAO_DADOS', g);
  CacheService.getScriptCache().put('geracao', g, 21600);
  esquecerProps();
  _geracao = g;
  return g;
}

/* ------------------------------------------------------------------ */
/* GERACAO POR TABELA                                                  */
/*                                                                     */
/* A geracao global aposenta as TELAS ja montadas — e certo que ela     */
/* avance a cada gravacao, porque qualquer tela pode mostrar o que      */
/* mudou. Mas ela tambem estava na chave do cache das TABELAS: salvar   */
/* um setor jogava fora a copia de FATO_ASSIDUIDADE (5 mil linhas) e a  */
/* proxima abertura relia a planilha inteira sem nenhuma necessidade.   */
/* Cada tabela passa a ter a sua propria geracao.                       */
/* ------------------------------------------------------------------ */

var _geracaoTb = {};

function geracaoTabela(tabela) {
  if (_geracaoTb[tabela]) return _geracaoTb[tabela];
  const g = String(prop('GER_TB_' + tabela, '1'));
  _geracaoTb[tabela] = g;
  return g;
}

/*
 * PERFORMANCE
 * Cada openById e cada getDataRange sao uma viagem de rede. Numa unica
 * abertura de tela o mesmo banco era aberto varias vezes e a mesma tabela
 * lida mais de uma vez. Estes dois caches valem SO durante a execucao
 * corrente (o Apps Script recria o ambiente a cada chamada), entao nao ha
 * risco de servir dado velho entre requisicoes.
 */
let _banco = null;
let _tabelas = {};

function abrirBanco() {
  if (_banco) return _banco;
  const id = prop('ID_BANCO', '');
  if (!id) throw new Error('O banco ainda não foi instalado.');
  _banco = SpreadsheetApp.openById(id);
  return _banco;
}

function esquecerLeituras() {
  _tabelas = {};
  // O mapa turno -> coordenador e derivado da EQUIPE: se a tabela foi
  // relida, ele tambem tem que cair, senao continuava valendo o mapa
  // montado antes da gravacao dentro da mesma requisicao.
  if (typeof _equipeMemo !== 'undefined') _equipeMemo = null;
}

function abaDe(tabela) {
  const aba = abrirBanco().getSheetByName(tabela);
  if (!aba) throw new Error('A tabela ' + tabela + ' nao existe. Rode sincronizarEsquema().');
  return aba;
}

/* ------------------------------------------------------------------ */
/* LEITURA                                                             */
/* ------------------------------------------------------------------ */

/**
 * Devolve os registros vivos de uma tabela como lista de objetos.
 * incluirExcluidos: true traz tambem os apagados (usado em auditoria).
 */
/*
 * Tabelas que valem guardar entre execucoes. Sao as lidas em quase toda
 * tela; as demais nao pagam o custo de serializar.
 */
const TABELAS_CACHEAVEIS = {
  ATIVIDADES: 1, COLABORADORES: 1, SETORES: 1, ROTINAS: 1, PARAMETROS: 1,
  DE_PARA: 1, FATO_ASSIDUIDADE: 1, AGR_COLAB: 1, PERFIS: 1
};

function listar(tabela, incluirExcluidos) {
  const chave = tabela + (incluirExcluidos ? ':todos' : '');
  if (_tabelas[chave]) return _tabelas[chave];

  /*
   * CACHE DE TABELA ENTRE EXECUCOES.
   *
   * Ler uma aba e a operacao mais cara do sistema: e uma viagem de rede
   * cujo custo cresce com o numero de linhas. Guardando o resultado ja
   * montado, uma tela que nao encontrou payload pronto ainda evita as
   * leituras de planilha. A geracao na chave garante que qualquer
   * gravacao aposenta a copia na hora.
   */
  const cacheavel = !!TABELAS_CACHEAVEIS[tabela] && !incluirExcluidos;
  const chaveCache = cacheavel ? ('tb|' + geracaoTabela(tabela) + '|' + tabela) : '';

  if (cacheavel) {
    const guardado = lerTextoCache(chaveCache);
    if (guardado) {
      try {
        const lista = JSON.parse(guardado);
        _tabelas[chave] = lista;
        return lista;
      } catch (e) { /* copia corrompida: le da planilha */ }
    }
  }

  /*
   * getDataRange() percorre tudo que a aba ja teve, inclusive linhas
   * vazias que so ficaram formatadas. Pedindo o retangulo exato, a
   * leitura encolhe junto com os dados de verdade.
   */
  const aba = abaDe(tabela);
  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();
  // Tabela vazia tambem entra na memoria da execucao: sem isso, cada
  // chamada seguinte reabria a aba so para descobrir de novo que nao ha
  // nada nela (acontece o tempo todo em ARQUIVOS_RH e PAINEL).
  if (ultimaLinha < 2 || ultimaColuna < 1) { _tabelas[chave] = []; return _tabelas[chave]; }
  const valores = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getValues();
  if (valores.length < 2) { _tabelas[chave] = []; return _tabelas[chave]; }

  const colunas = valores[0].map(function (c) { return String(c).trim().toUpperCase(); });
  const registros = [];

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    if (linha.every(function (c) { return c === '' || c === null; })) continue;

    const r = { _linha: i + 1 };
    colunas.forEach(function (coluna, c) { if (coluna) r[coluna] = linha[c]; });

    if (!incluirExcluidos && marcado(r.EXCLUIDO)) continue;
    registros.push(r);
  }
  _tabelas[chave] = registros;

  /*
   * So guarda se tudo for texto ou numero. Uma celula que volte como Date
   * viraria string na ida e volta pelo JSON, e o codigo que espera Date
   * quebraria em silencio — o tipo de defeito que so aparece semanas
   * depois. Na duvida, nao guarda.
   */
  if (cacheavel && registros.length && semObjetos(registros)) {
    gravarTextoCache(chaveCache, JSON.stringify(registros), CACHE_SEGUNDOS);
  }
  return registros;
}

/** true se nenhum valor for objeto (Date, por exemplo). */
function semObjetos(registros) {
  const amostra = registros.length > 40 ? 40 : registros.length;
  for (let i = 0; i < amostra; i++) {
    const r = registros[i];
    const chaves = Object.keys(r);
    for (let c = 0; c < chaves.length; c++) {
      const v = r[chaves[c]];
      if (v !== null && typeof v === 'object') return false;
    }
  }
  return true;
}

function obter(tabela, id) {
  const encontrados = listar(tabela).filter(function (r) { return String(r.ID) === String(id); });
  return encontrados.length ? encontrados[0] : null;
}

/** Localiza a linha fisica de um ID. Uma leitura da coluna ID, so. */
function linhaDoId(aba, id) {
  const colunas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
    .map(function (c) { return String(c).trim().toUpperCase(); });
  const colId = colunas.indexOf('ID');
  if (colId === -1) throw new Error('A tabela não tem coluna ID.');

  const ids = aba.getRange(2, colId + 1, Math.max(1, aba.getLastRow() - 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return { linha: i + 2, colunas: colunas };
  }
  throw new Error('Registro ' + id + ' nao encontrado em ' + aba.getName() + '.');
}

/* ------------------------------------------------------------------ */
/* ESCRITA                                                             */
/* ------------------------------------------------------------------ */

function inserir(tabela, campos, quem) {
  return comTrava(function () {
    const aba = abaDe(tabela);
    const colunas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });

    const registro = {};
    Object.keys(campos).forEach(function (k) { registro[k.toUpperCase()] = campos[k]; });

    registro.ID = registro.ID || gerarId(tabela);
    registro.CRIADO_EM = agoraTexto();
    registro.CRIADO_POR = quem;
    registro.ATUALIZADO_EM = registro.CRIADO_EM;
    registro.ATUALIZADO_POR = quem;
    registro.EXCLUIDO = 'NAO';

    const linha = colunas.map(function (c) { return registro[c] === undefined ? '' : registro[c]; });
    aba.appendRow(linha);

    limparCache(tabela);
    registrarLog(quem, 'INSERIR', tabela, registro.ID, resumirCampos(campos));
    return registro.ID;
  });
}

/* ------------------------------------------------------------------ */
/* ESCRITA EM LOTE                                                     */
/*                                                                     */
/* Um `inserir()` custa: trava + leitura do cabecalho + appendRow +     */
/* troca de geracao (escrita de propriedade) + log. Chamado dentro de   */
/* um laco — 68 vezes na instalacao, 200 vezes na importacao da folha,  */
/* 30 vezes ao encerrar um mes — isso vira centenas de idas ao Google e */
/* e o que faz a importacao chegar perto do limite de 6 minutos.        */
/* Estas duas funcoes fazem o mesmo trabalho com UMA leitura e UMA      */
/* escrita, seja para 5 linhas ou para 5 mil.                           */
/* ------------------------------------------------------------------ */

/** Insere varios registros de uma vez. Devolve os IDs, na ordem. */
function inserirVarios(tabela, registros, quem) {
  if (!registros || !registros.length) return [];
  return comTrava(function () {
    const aba = abaDe(tabela);
    const colunas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });

    const agora = agoraTexto();
    const ids = [];
    const bloco = registros.map(function (campos) {
      const r = {};
      Object.keys(campos).forEach(function (k) { r[k.toUpperCase()] = campos[k]; });
      r.ID = r.ID || gerarId(tabela);
      r.CRIADO_EM = agora;  r.CRIADO_POR = quem;
      r.ATUALIZADO_EM = agora;  r.ATUALIZADO_POR = quem;
      r.EXCLUIDO = 'NAO';
      ids.push(r.ID);
      return colunas.map(function (c) { return r[c] === undefined ? '' : r[c]; });
    });

    // A aba nasce com um numero fixo de linhas; escrever alem disso da
    // "linhas fora dos limites". Cria o que faltar antes de gravar.
    const primeira = aba.getLastRow() + 1;
    const necessarias = primeira + bloco.length - 1;
    if (aba.getMaxRows() < necessarias) {
      aba.insertRowsAfter(aba.getMaxRows(), necessarias - aba.getMaxRows());
    }
    aba.getRange(primeira, 1, bloco.length, colunas.length).setValues(bloco);

    limparCache(tabela);
    registrarLog(quem, 'INSERIR LOTE', tabela, ids.length + ' registros', '');
    return ids;
  });
}

/**
 * Atualiza varios registros de uma vez.
 * mudancas: [{ id: 'ATV-...', campos: { STATUS: 'Cancelada' } }, ...]
 */
function atualizarVarios(tabela, mudancas, quem) {
  if (!mudancas || !mudancas.length) return { ok: true, alterados: 0 };
  return comTrava(function () {
    const aba = abaDe(tabela);
    const ultima = aba.getLastRow(), nCol = aba.getLastColumn();
    if (ultima < 2) return { ok: true, alterados: 0 };

    const valores = aba.getRange(1, 1, ultima, nCol).getValues();
    const colunas = valores[0].map(function (c) { return String(c).trim().toUpperCase(); });
    const colId = colunas.indexOf('ID');
    if (colId === -1) throw new Error('A tabela ' + tabela + ' nao tem coluna ID.');

    // Indice ID -> linha, montado uma vez. Antes cada atualizar() varria a
    // coluna ID inteira de novo, uma vez por registro.
    const linhaDe = {};
    for (let i = 1; i < valores.length; i++) linhaDe[String(valores[i][colId])] = i;

    const posQuando = colunas.indexOf('ATUALIZADO_EM');
    const posQuem = colunas.indexOf('ATUALIZADO_POR');
    const agora = agoraTexto();

    let menor = valores.length, maior = 0, n = 0;
    mudancas.forEach(function (m) {
      const i = linhaDe[String(m.id)];
      if (i === undefined) return;
      Object.keys(m.campos).forEach(function (k) {
        const pos = colunas.indexOf(k.toUpperCase());
        if (pos !== -1) valores[i][pos] = m.campos[k];
      });
      if (posQuando !== -1) valores[i][posQuando] = agora;
      if (posQuem !== -1) valores[i][posQuem] = quem;
      if (i < menor) menor = i;
      if (i > maior) maior = i;
      n++;
    });
    if (!n) return { ok: true, alterados: 0 };

    // Escreve so o bloco que contem as linhas mexidas.
    aba.getRange(menor + 1, 1, maior - menor + 1, nCol)
       .setValues(valores.slice(menor, maior + 1));

    limparCache(tabela);
    registrarLog(quem, 'ATUALIZAR LOTE', tabela, n + ' registros', '');
    return { ok: true, alterados: n };
  });
}

/** Atualiza so as colunas enviadas, numa unica escrita por bloco contiguo. */
function atualizar(tabela, id, campos, quem) {
  return comTrava(function () {
    const aba = abaDe(tabela);
    const alvo = linhaDoId(aba, id);
    const valores = aba.getRange(alvo.linha, 1, 1, alvo.colunas.length).getValues()[0];

    Object.keys(campos).forEach(function (k) {
      const pos = alvo.colunas.indexOf(k.toUpperCase());
      if (pos !== -1) valores[pos] = campos[k];
    });

    const posQuando = alvo.colunas.indexOf('ATUALIZADO_EM');
    const posQuem = alvo.colunas.indexOf('ATUALIZADO_POR');
    if (posQuando !== -1) valores[posQuando] = agoraTexto();
    if (posQuem !== -1) valores[posQuem] = quem;

    aba.getRange(alvo.linha, 1, 1, valores.length).setValues([valores]);

    limparCache(tabela);
    registrarLog(quem, 'ATUALIZAR', tabela, id, resumirCampos(campos));
    return { ok: true, id: id };
  });
}

/** Exclusao logica: o registro sai das listas, mas continua no banco. */
function excluir(tabela, id, quem) {
  return comTrava(function () {
    const aba = abaDe(tabela);
    const alvo = linhaDoId(aba, id);
    const pos = alvo.colunas.indexOf('EXCLUIDO');
    if (pos === -1) throw new Error('A tabela ' + tabela + ' nao permite exclusao.');

    // Eram duas escritas de celula (EXCLUIDO e ATUALIZADO_POR). Uma linha
    // inteira numa unica viagem custa o mesmo que uma celula.
    const linha = aba.getRange(alvo.linha, 1, 1, alvo.colunas.length).getValues()[0];
    linha[pos] = 'SIM';
    const posQuem = alvo.colunas.indexOf('ATUALIZADO_POR');
    if (posQuem !== -1) linha[posQuem] = quem;
    const posQuando = alvo.colunas.indexOf('ATUALIZADO_EM');
    if (posQuando !== -1) linha[posQuando] = agoraTexto();
    aba.getRange(alvo.linha, 1, 1, linha.length).setValues([linha]);

    limparCache(tabela);
    registrarLog(quem, 'EXCLUIR', tabela, id, '');
    return { ok: true, id: id };
  });
}

/** Serializa escritas concorrentes: dois coordenadores salvando junto nao se atropelam. */
function comTrava(funcao) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) {
    throw new Error('O sistema esta ocupado gravando outra alteracao. Tente de novo em instantes.');
  }
  try {
    return funcao();
  } finally {
    trava.releaseLock();
  }
}

/*
 * LOG EM LOTE.
 *
 * Cada appendRow no LOG e uma escrita de rede inteira — ela dobrava o
 * tempo de toda gravacao do sistema, so para registrar auditoria. Agora
 * as linhas ficam num balde no cache e descem juntas a cada LOTE_LOG
 * eventos, numa unica escrita.
 */
const LOTE_LOG = 10;
const CHAVE_LOG = 'log_pendente';

function registrarLog(quem, acao, tabela, registro, detalhe) {
  try {
    const cache = CacheService.getScriptCache();
    const balde = JSON.parse(cache.get(CHAVE_LOG) || '[]');
    balde.push([agoraTexto(), quem, acao, tabela, registro, detalhe || '']);

    if (balde.length >= LOTE_LOG) {
      cache.remove(CHAVE_LOG);
      const aba = abaDe('LOG');   // era abaDe('LOG') duas vezes na mesma linha
      aba.getRange(aba.getLastRow() + 1, 1, balde.length, 6).setValues(balde);
    } else {
      cache.put(CHAVE_LOG, JSON.stringify(balde), 21600);  // 6 h, o maximo
    }
  } catch (e) { /* log nunca derruba a operacao */ }
}

/** Esvazia o balde na hora. Chamado pelo gatilho diario e ao sair do ar. */
function descarregarLog() {
  const cache = CacheService.getScriptCache();
  const balde = JSON.parse(cache.get(CHAVE_LOG) || '[]');
  if (!balde.length) return { ok: true, linhas: 0 };
  cache.remove(CHAVE_LOG);
  const aba = abaDe('LOG');
  aba.getRange(aba.getLastRow() + 1, 1, balde.length, 6).setValues(balde);
  return { ok: true, linhas: balde.length };
}

function resumirCampos(campos) {
  return Object.keys(campos).map(function (k) {
    return k + '=' + String(campos[k]).substring(0, 40);
  }).join('; ').substring(0, 400);
}

/* ------------------------------------------------------------------ */
/* PLANILHA EXTERNA (RH) - somente leitura                             */
/* ------------------------------------------------------------------ */

function lerPlanilhaExterna(chaveProp, nomeAba) {
  const id = prop(chaveProp, '');
  if (!id) throw new Error('A planilha externa (' + chaveProp + ') ainda nao foi vinculada.');
  const aba = SpreadsheetApp.openById(id).getSheetByName(nomeAba);
  if (!aba) throw new Error('A aba "' + nomeAba + '" nao existe na planilha vinculada.');
  return aba.getDataRange().getValues();
}

function abasDaPlanilhaExterna(chaveProp) {
  const id = prop(chaveProp, '');
  if (!id) return [];
  return SpreadsheetApp.openById(id).getSheets().map(function (s) { return s.getName(); });
}

/* ------------------------------------------------------------------ */
/* UTILITARIOS                                                         */
/* ------------------------------------------------------------------ */

/*
 * ID legivel e ordenavel por criacao: ATV-M4K2P1-7X3
 *
 * O sufixo era so aleatorio. Gravando 200 colaboradores no mesmo
 * milissegundo (o que a importacao faz), a chance de dois IDs iguais
 * passava de 40%. O contador da execucao garante unicidade dentro do
 * lote; o tempo e o acaso cuidam do resto entre execucoes.
 */
var _seqId = 0;

function gerarId(tabela) {
  const prefixo = tabela.substring(0, 3).toUpperCase();
  const tempo = Date.now().toString(36).toUpperCase();
  const conta = (_seqId++).toString(36).toUpperCase();
  const sorte = Math.floor(Math.random() * 1296).toString(36).toUpperCase();
  return prefixo + '-' + tempo + '-' + conta + sorte;
}

function marcado(valor) {
  if (valor === true) return true;
  const v = String(valor == null ? '' : valor).toUpperCase().trim();
  return ['SIM', 'S', 'X', 'V', 'TRUE', 'VERDADEIRO', '1'].indexOf(v) !== -1;
}

/* Datas e fuso ficam no Datas.gs — ver o porque do cuidado com o carimbo. */

/* --- Cache: guarda resultado calculado, nunca a tabela crua --------- */

const CACHE_SEGUNDOS = 300;
const CHAVES_CACHE = ['perfis', 'acessos', 'assiduidade'];

/*
 * Cada tabela derruba SO o cache que depende dela. Antes, salvar uma
 * atividade apagava tambem 'perfis' e 'acessos': a proxima tela de
 * qualquer pessoa tinha que remontar a matriz de permissoes inteira.
 */
const CACHE_POR_TABELA = {
  ACESSOS: ['acessos'],
  PERFIS: ['perfis'],
  // ATIVIDADES faltava aqui: sem entrada, cada gravacao caia no "apaga
  // tudo" e invalidava ate a assiduidade. Era o que deixava os botoes do
  // calendario lentos.
  ATIVIDADES: ['calendario'],
  EQUIPE: ['calendario'],
  ROTINAS: ['calendario'],
  SETORES: ['calendario'],
  FATO_ASSIDUIDADE: ['assiduidade'],
  AGR_COLAB: ['assiduidade'],
  PAINEL: ['assiduidade'],
  DE_PARA: ['assiduidade'],
  COLABORADORES: ['assiduidade']
};

function comCache(chave, funcao) {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(chave);
  if (guardado) {
    try { return JSON.parse(guardado); } catch (e) { /* recalcula */ }
  }
  const resultado = funcao();
  try {
    const texto = JSON.stringify(resultado);
    if (texto.length < 95000) cache.put(chave, texto, CACHE_SEGUNDOS);
  } catch (e) { /* grande demais, segue sem cache */ }
  return resultado;
}

/**
 * Sem argumento, apaga tudo (usado na instalacao e no botao "Atualizar
 * dados"). Com o nome da tabela, apaga so o que aquela tabela alimenta.
 */
/*
 * Sem argumento, apaga tudo (instalacao, botao "Atualizar dados").
 * Com o nome da tabela, apaga so o que aquela tabela alimenta.
 *
 * A geracao (que aposenta as telas ja montadas) so avanca quando a
 * gravacao mexe em algo que as telas mostram. Antes ela avancava sempre,
 * entao cancelar UMA atividade obrigava o servidor a remontar todas as
 * telas do zero — era isso que travava os botoes do calendario.
 */
function limparCache(tabela) {
  esquecerLeituras();
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();

  if (!tabela) {
    // Limpeza total (instalacao, botao "Atualizar dados"): tudo avanca,
    // mas numa UNICA escrita de propriedades em vez de uma por tabela.
    if (CHAVES_CACHE.length) cache.removeAll(CHAVES_CACHE);
    const mapa = {};
    Object.keys(TABELAS_CACHEAVEIS).forEach(function (t) {
      const gt = String(Number(geracaoTabela(t) || 1) + 1);
      mapa['GER_TB_' + t] = gt;
      _geracaoTb[t] = gt;
    });
    const gg = String(Number(geracaoDados() || 1) + 1);
    mapa.GERACAO_DADOS = gg;
    props.setProperties(mapa);
    cache.put('geracao', gg, 21600);
    esquecerProps();
    _geracao = gg;
    return;
  }

  const nome = String(tabela).toUpperCase();
  const chaves = CACHE_POR_TABELA[nome] || [];
  if (chaves.length) cache.removeAll(chaves);

  // LOG nao aparece em tela nenhuma: nao precisa aposentar nada.
  if (nome === 'LOG') return;

  /*
   * Antes, esta linha era `avancarGeracao()` sozinha — e a geracao global
   * estava na chave de TODAS as tabelas. Salvar um setor obrigava a
   * releitura de ATIVIDADES, FATO_ASSIDUIDADE, AGR_COLAB e PERFIS na
   * abertura seguinte. Agora so a tabela que mudou perde a copia; as
   * telas continuam sendo aposentadas (elas podem mostrar o que mudou).
   * As duas gravacoes de propriedade viram uma.
   */
  const mapa = {};
  if (TABELAS_CACHEAVEIS[nome]) {
    const gt = String(Number(geracaoTabela(nome) || 1) + 1);
    mapa['GER_TB_' + nome] = gt;
    _geracaoTb[nome] = gt;
  }
  const gg = String(Number(geracaoDados() || 1) + 1);
  mapa.GERACAO_DADOS = gg;
  props.setProperties(mapa);
  cache.put('geracao', gg, 21600);
  esquecerProps();
  _geracao = gg;
}
