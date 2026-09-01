/**
 * Dados.gs — ASSIDUIDADE (o BI que era a planilha GSL-DADOS)
 *
 * ESTE É O MÓDULO DE ASSIDUIDADE. Não existe um "Assiduidade.gs": todo o
 * assunto mora aqui, e é por isso que este é o maior arquivo do projeto.
 * O nome vem da planilha de origem (GSL-DADOS) e ficou.
 *
 * O que este arquivo faz, de ponta a ponta:
 *   - lê a folha de ponto do RH (detectar_ / extrair_)
 *   - traduz cada código pela tabela DE-PARA (traduz_)
 *   - agrega os números do painel (calcularAgregado_)
 *   - serve as três abas da tela: Painel (dadosAssiduidade),
 *     Colaboradores (acaoColaboradores) e Período (acaoPeriodo)
 *   - mantém a competência aberta atualizada (atualizarCompetenciaAberta)
 *
 * Motor de importacao, transformacao e agregacao (ETL) da folha de ponto.
 * Backend do web app GSL Bartofil.
 *
 * CORRECOES APLICADAS NESTA VERSAO:
 *
 * 1) FORMATO DO RETORNO. dadosAssiduidade e dadosRanking devolviam
 *    { titulo, dados: {...} }. Mas carregarTela() ja embrulha o retorno em
 *    { tela, titulo, escopo, podes, dados }. O resultado ficava aninhado
 *    duas vezes (dados.dados) e o cliente lia d.arquivo como undefined —
 *    era o "Cannot read properties of undefined (reading 'situacao')".
 *    Agora as funcoes de tela devolvem SO o objeto de dados.
 *
 * 2) LINHAS FORA DOS LIMITES. A aba de destino nasce com um numero fixo de
 *    linhas (padrao 1000). Gravar 2000+ registros estourava esse limite.
 *    substituirLote_ agora cria as linhas que faltam antes de escrever.
 *
 * 3) IMPORTACAO AUTOMATICA. Se a competencia esta cadastrada e ainda nao
 *    foi lida, a tela importa sozinha em vez de pedir um clique. So mostra
 *    o botao manual se a importacao automatica falhar — e aí mostra o erro
 *    de verdade (link/aba errados), nao uma mensagem generica.
 */

const DOW_ = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/* ==========================================================================
   TELA PRINCIPAL
   ========================================================================== */

function dadosAssiduidade(usuario, params) {
  exigirTela(usuario, 'assiduidade');

  const arquivos = listar('ARQUIVOS_RH');
  if (!arquivos.length) return { semRH: true };

  /*
   * Identifica qual competencia abrir.
   *
   * CORRECAO: a comparacao era feita com o valor CRU da celula. A funcao
   * normalizarCompetenciaRH_() existe exatamente porque '2026-08' pode
   * ter virado Date na planilha — e quando isso acontecia a tela dizia
   * "competencia sem dados importados" com o painel gravado ali do lado.
   * Agora os dois lados da comparacao passam pela mesma normalizacao.
   */
  let comp = normalizarCompetenciaRH_(params.competencia);
  let arq = null;
  if (comp) {
    arq = arquivos.filter(function (a) {
      return normalizarCompetenciaRH_(a.COMPETENCIA) === comp;
    })[0];
  }
  if (!arq) {
    arq = arquivos.filter(function (a) { return String(a.SITUACAO).toUpperCase() === 'ABERTA'; })[0] || arquivos[0];
    comp = normalizarCompetenciaRH_(arq.COMPETENCIA);
  }

  let painelRows = listar('PAINEL').filter(function (p) {
    return normalizarCompetenciaRH_(p.COMPETENCIA) === comp;
  });

  /*
   * Ainda não importado — ou importado por uma versão anterior, cujo
   * painel tem campos a menos e mostraria número errado em silêncio.
   * Nos dois casos, refaz AGORA. A competência já está cadastrada em
   * Configuração, então não há motivo para pedir um clique.
   */
  let painelVelho = false;
  if (painelRows.length) {
    try { painelVelho = !painelAtual_(JSON.parse(painelRows[0].PAYLOAD)); }
    catch (e) { painelVelho = true; }
    if (painelVelho) painelRows = [];
  }
  if (!painelRows.length) {
    try {
      importarArquivoRH_(arq, usuario.email);
      esquecerLeituras();
      painelRows = listar('PAINEL').filter(function (p) {
        return normalizarCompetenciaRH_(p.COMPETENCIA) === comp;
      });
    } catch (e) {
      return semDados_(usuario, arquivos, arq, comp, String(e.message || e));
    }
  }
  if (!painelRows.length) return semDados_(usuario, arquivos, arq, comp, '');

  return montarPainel_(usuario, arquivos, arq, comp, painelRows);
}

/*
 * VERSÃO DO PAINEL.
 *
 * O painel de cada competência fica gravado pronto na aba PAINEL. Quando
 * o cálculo muda — e ele mudou: as três famílias de falta, os dias
 * lançados por turno, os códigos fora da legenda —, o painel gravado
 * pela versão anterior continua sendo servido, e a tela mostra números
 * de outra época sem nada indicar. Foi o que aconteceu: o painel exibia
 * "A CONFIRMAR" no gráfico de categorias e "% de 0" nas barras de turno,
 * porque aqueles campos nem existiam quando ele foi gerado.
 *
 * Com o carimbo de versão, um painel velho é tratado como painel
 * ausente: o sistema o refaz sozinho na primeira abertura.
 */
const VERSAO_PAINEL = 3;

function painelAtual_(payload) {
  if (!payload) return false;
  if (Number(payload.versao) === VERSAO_PAINEL) return true;
  /*
   * Painel sem carimbo: aceita só se tiver a forma nova — os dias
   * lançados por turno e a conta dos códigos fora da legenda.
   */
  const t = (payload.porTurno || [])[0];
  return !!(t && t.registros !== undefined && payload.naoDefinidos);
}

/* Resposta quando nao ha dados para a competencia. */
function semDados_(usuario, arquivos, arq, comp, erroImport) {
  return {
    semDados: true,
    competencia: comp,
    erroImport: erroImport || '',
    arquivo: { id: arq.ID, situacao: arq.SITUACAO },
    competencias: arquivos.map(function (a) {
      return { competencia: normalizarCompetenciaRH_(a.COMPETENCIA), situacao: a.SITUACAO };
    }),
    podeGerir: podeFazer(usuario, 'PROGRAMAR')
  };
}

/* Monta o payload da tela a partir do PAINEL ja gravado. */
function montarPainel_(usuario, arquivos, arq, comp, painelRows) {
  const payload = JSON.parse(painelRows[0].PAYLOAD);

  return {
    competencia: comp,
    arquivo: { id: arq.ID, situacao: arq.SITUACAO,
               ultimaImportacao: String(arq.ULTIMA_IMPORTACAO || '') },
    podeGerir: podeFazer(usuario, 'PROGRAMAR'),
    mostraIndividual: podeVerIndividual_(usuario),
    escopo: descreverEscopo(usuario),
    competencias: arquivos.map(function (a) {
      return { competencia: normalizarCompetenciaRH_(a.COMPETENCIA), situacao: a.SITUACAO };
    }),
    kpis: payload.kpis,
    porTurno: payload.porTurno,
    porCategoria: payload.porCategoria,
    diaADia: payload.diaADia,
    porDiaSemana: payload.porDiaSemana,
    codigosTop: payload.codigosTop,
    // Codigos fora da legenda: viram aviso, nao barra de grafico.
    naoDefinidos: payload.naoDefinidos || { lancamentos: 0, codigos: [] },
    /*
     * SEM QUEBRA POR COMPETENCIA: cada competencia e uma planilha de um
     * mes, mas a operacao e continua. Esta serie atravessa todas as
     * competencias importadas, para o painel mostrar a linha do tempo
     * inteira e nao so a fatia do mes aberto.
     */
    tendencia: tendenciaContinua_(usuario),
    // Seletores da aba Período: a lista de tipos é FIXA (igual à da
    // planilha original); a de turnos vem do que existe na base.
    tipos: tiposDeAusencia_(),
    categorias: categoriasDeAusencia_(),
    turnos: turnosDaBase_()
  };
}

/** Quem pode ver nome e numero individual de colaborador. */
function podeVerIndividual_(usuario) {
  return podeFazer(usuario, 'VER_INDIVIDUAL');
}

/**
 * Serie continua de absenteismo, uma linha por competencia importada.
 * Le do AGR_COLAB (que ja esta agregado), entao custa uma leitura de
 * tabela e atravessa todo o historico sem tocar na FATO.
 */
function tendenciaContinua_(usuario) {
  const escopoTurno = turnoDoEscopo(usuario);
  const porComp = {};
  listar('AGR_COLAB').forEach(function (a) {
    if (escopoTurno && String(a.TURNO) !== escopoTurno) return;
    const c = normalizarCompetenciaRH_(a.COMPETENCIA);
    if (!c) return;
    if (!porComp[c]) porComp[c] = { registros: 0, aus: 0, inj: 0, atest: 0, pessoas: 0 };
    const s = porComp[c];
    s.registros += Number(a.REGISTROS) || 0;
    s.aus += Number(a.AUSENCIAS) || 0;
    s.inj += Number(a.FALTAS_INJ !== undefined && a.FALTAS_INJ !== '' ? a.FALTAS_INJ : a.FALTAS) || 0;
    s.atest += Number(a.ATESTADOS) || 0;
    s.pessoas++;
  });

  const meta = Number(parametro('META_ABSENTEISMO', '0.05')) * 100;
  const serie = Object.keys(porComp).sort().map(function (c) {
    const s = porComp[c];
    return {
      competencia: c,
      taxa: s.registros ? Math.round((s.aus / s.registros) * 1000) / 10 : 0,
      pessoas: s.pessoas, registros: s.registros,
      ausencias: s.aus, faltas: s.inj, atestados: s.atest
    };
  });

  let direcao = 'estavel', variacao = 0;
  if (serie.length >= 2) {
    variacao = Math.round((serie[serie.length - 1].taxa - serie[serie.length - 2].taxa) * 10) / 10;
    if (variacao > 0.2) direcao = 'piorando';
    else if (variacao < -0.2) direcao = 'melhorando';
  }
  return { meta: meta, serie: serie, direcao: direcao, variacao: variacao };
}

/** Turnos que existem na base — alimenta o filtro de turno do Periodo. */
function turnosDaBase_() {
  const vistos = {};
  listar('AGR_COLAB').forEach(function (a) {
    const t = String(a.TURNO || '').trim();
    if (t) vistos[t] = true;
  });
  return Object.keys(vistos).sort();
}

/* ==========================================================================
   CONSULTAS — COLABORADORES E PERIODO
   ========================================================================== */

/**
 * Aba COLABORADORES da tela de Assiduidade.
 *
 * Le do AGR_COLAB, nao do payload do painel — ver a explicacao em
 * calcularAgregado_: a lista nao cabia na celula do painel e era por isso
 * que a aba nao carregava. Aqui ela vem sob demanda, ja com o escopo do
 * usuario aplicado, e traz junto os quadros que a tela de Ranking
 * mostrava (melhores, atencao, mais atestados, mais faltas) — a tela
 * separada deixou de existir porque isto aqui ja e a mesma informacao.
 */
function acaoColaboradores(usuario, params) {
  exigirTela(usuario, 'assiduidade');
  const comp = normalizarCompetenciaRH_(params && params.competencia);
  if (!comp) throw new Error('Competência não informada.');

  const minimo = Number(params && params.minimo) || 0;
  const escopoTurno = turnoDoEscopo(usuario);
  const filtroTurno = String((params && params.turno) || '').trim();

  let linhas = listar('AGR_COLAB').filter(function (a) {
    return normalizarCompetenciaRH_(a.COMPETENCIA) === comp;
  });
  if (escopoTurno) linhas = linhas.filter(function (a) { return String(a.TURNO) === escopoTurno; });
  if (filtroTurno) linhas = linhas.filter(function (a) { return String(a.TURNO) === filtroTurno; });

  const lista = linhas.map(function (a) {
    const inj = Number(a.FALTAS_INJ !== undefined && a.FALTAS_INJ !== '' ? a.FALTAS_INJ : a.FALTAS) || 0;
    return {
      matricula: String(a.MATRICULA), nome: String(a.NOME || ''), turno: String(a.TURNO || ''),
      registros: Number(a.REGISTROS) || 0,
      trabalhados: Number(a.TRABALHADOS) || 0,
      ausencias: Number(a.AUSENCIAS) || 0,
      faltas: Number(a.FALTAS) || 0,
      faltasInjustificadas: inj,
      faltasJustificadas: Number(a.FALTAS_JUST) || 0,
      faltasDisciplinares: Number(a.FALTAS_DISC) || 0,
      atestados: Number(a.ATESTADOS) || 0,
      ferias: Number(a.FERIAS) || 0,
      folgas: Number(a.FOLGAS) || 0,
      licencas: Number(a.LICENCAS) || 0,
      assiduidade: parseFloat(String(a.ASSIDUIDADE).replace('%', '')) || 0
    };
  });

  // Ordena por assiduidade; empate desempata por quem tem menos ausencia.
  const ordenada = lista.slice().sort(function (a, b) {
    if (b.assiduidade !== a.assiduidade) return b.assiduidade - a.assiduidade;
    return a.ausencias - b.ausencias;
  });
  // "Qualificados" so entram nos rankings — a lista completa mostra todos.
  const qualificados = ordenada.filter(function (c) { return c.registros >= minimo; });

  const porValor = function (campo) {
    return lista.filter(function (c) { return c[campo] > 0; })
      .map(function (c) {
        return { matricula: c.matricula, nome: c.nome, turno: c.turno, valor: c[campo] };
      })
      .sort(function (a, b) { return b.valor - a.valor; }).slice(0, 15);
  };

  return {
    competencia: comp,
    minimo: minimo,
    turno: filtroTurno,
    turnos: turnosDaBase_(),
    lista: lista.sort(function (a, b) { return a.nome.localeCompare(b.nome); }),
    melhores: qualificados.slice(0, 15),
    atencao: qualificados.slice().reverse().slice(0, 15),
    maisAtestados: porValor('atestados'),
    maisFaltas: porValor('faltasInjustificadas'),
    porTurno: resumoPorTurno_(lista)
  };
}

/** Quadro por turno montado a partir da lista ja filtrada. */
function resumoPorTurno_(lista) {
  const t = {};
  lista.forEach(function (c) {
    const k = c.turno || 'Sem turno';
    if (!t[k]) t[k] = { turno: k, pessoas: 0, registros: 0, trabalhados: 0,
                        ausencias: 0, faltas: 0, atestados: 0 };
    const s = t[k];
    s.pessoas++; s.registros += c.registros; s.trabalhados += c.trabalhados;
    s.ausencias += c.ausencias; s.faltas += c.faltasInjustificadas; s.atestados += c.atestados;
  });
  const linhas = Object.keys(t).sort().map(function (k) {
    const s = t[k];
    s.media = s.registros ? Math.round(((s.registros - s.ausencias) / s.registros) * 1000) / 10 : 0;
    return s;
  });
  const cd = linhas.reduce(function (acc, x) {
    acc.pessoas += x.pessoas; acc.registros += x.registros; acc.trabalhados += x.trabalhados;
    acc.ausencias += x.ausencias; acc.faltas += x.faltas; acc.atestados += x.atestados;
    return acc;
  }, { turno: 'CD', pessoas: 0, registros: 0, trabalhados: 0, ausencias: 0, faltas: 0, atestados: 0 });
  cd.media = cd.registros ? Math.round(((cd.registros - cd.ausencias) / cd.registros) * 1000) / 10 : 0;
  linhas.push(cd);
  return linhas;
}

/* ------------------------------------------------------------------ */
/* PERIODO — a consulta continua                                       */
/*                                                                     */
/* Cada competencia do RH e uma planilha de um mes. Esta consulta NAO   */
/* enxerga essa divisao: ela varre a FATO por DATA, entao um intervalo  */
/* de 01/06 a 29/08 traz o que houver, venha de quantas competencias    */
/* vier, sem buraco na virada de uma para a outra.                      */
/* ------------------------------------------------------------------ */

/*
 * Data de um registro da FATO, como texto aaaa-mm-dd.
 *
 * A coluna e gravada como texto — mas se a aba perder o formato "@" em
 * algum momento, o Google Sheets le "2026-07-21" como Date e devolve um
 * objeto. A versao anterior fazia `new Date(f.DATA + 'T12:00:00')`: com
 * um Date na mao isso virava "Fri Jul 21 2026 ...T12:00:00", que e data
 * invalida — e a consulta de periodo devolvia ZERO registros, que foi
 * exatamente o que aconteceu. Aqui os dois formatos sao aceitos e a
 * comparacao e de texto, que e exata e barata.
 */
function isoDaFato_(v) {
  if (v instanceof Date) return paraISO(v);
  const t = String(v || '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + '-' + br[2] + '-' + br[1];
  const d = paraData(t);
  return d ? paraISO(d) : '';
}

function acaoPeriodo(usuario, params) {
  exigirTela(usuario, 'assiduidade');
  const de = String(params.de || '').slice(0, 10);
  const ate = String(params.ate || '').slice(0, 10);
  if (!de || !ate) throw new Error('Período inválido.');
  if (de > ate) throw new Error('A data inicial é depois da data final.');

  const tipo = params.tipo || 'TODAS';
  const filtroTurno = String(params.turno || '').trim();
  const soAusencias = params.incluirPresenca ? false : true;

  const diasNoPeriodo = Math.round(
    (diaNumISO(ate) - diaNumISO(de))) + 1;

  const escopoTurno = turnoDoEscopo(usuario);
  const filtro = filtroDeTipo_(tipo);
  let varridos = 0, foraDoIntervalo = 0, semDataValida = 0;

  const colab = {};
  const porCategoria = {}, porCompetencia = {}, porTurno = {}, porDia = {};
  let registrosTotal = 0;

  listar('FATO_ASSIDUIDADE').forEach(function (f) {
    varridos++;
    const iso = isoDaFato_(f.DATA);
    if (!iso) { semDataValida++; return; }
    if (iso < de || iso > ate) { foraDoIntervalo++; return; }

    const turno = String(f.TURNO || '');
    if (escopoTurno && turno !== escopoTurno) return;
    if (filtroTurno && turno !== filtroTurno) return;

    const cat = String(f.CATEGORIA || '');
    if (soAusencias && String(f.AUSENCIA) !== 'Sim') return;
    // Codigo fora da legenda nao entra na consulta nem nos graficos.
    if (ehNaoDefinido_(cat)) return;
    if (!passaNoTipo_(filtro, catN_(cat))) return;

    const mat = String(f.MATRICULA);
    if (!colab[mat]) colab[mat] = { turno: turno, registros: 0, datas: [] };
    colab[mat].registros++;
    colab[mat].datas.push(iso);
    registrosTotal++;

    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    const cp = normalizarCompetenciaRH_(f.COMPETENCIA) || '—';
    porCompetencia[cp] = (porCompetencia[cp] || 0) + 1;
    porTurno[turno || 'Sem turno'] = (porTurno[turno || 'Sem turno'] || 0) + 1;
    porDia[iso] = (porDia[iso] || 0) + 1;
  });

  const nomesMap = {};
  listar('COLABORADORES').forEach(function (c) { nomesMap[String(c.MATRICULA)] = c.NOME; });

  const lista = Object.keys(colab).map(function (mat) {
    const c = colab[mat];
    c.datas.sort();
    return {
      matricula: mat, nome: nomesMap[mat] || mat, turno: c.turno, registros: c.registros,
      primeira: brDoIso_(c.datas[0]),
      ultima: brDoIso_(c.datas[c.datas.length - 1]),
      datas: c.datas.map(function (dt) { return { data: brDoIso_(dt) }; }),
      barra: diasNoPeriodo ? Math.min(100, Math.round((c.registros / diasNoPeriodo) * 100)) : 0
    };
  }).sort(function (a, b) { return b.registros - a.registros; });

  /*
   * Linha do tempo continua: um ponto por dia do intervalo, atravessando
   * as competencias. E ela que mostra que nao ha buraco na virada.
   */
  const linhaDoTempo = [];
  const iniN = diaNumISO(de), fimN = diaNumISO(ate);
  if (fimN - iniN <= 400) {
    for (let n = iniN; n <= fimN; n++) {
      const d = new Date(n * 86400000);
      const iso = d.getUTCFullYear() + '-' + dd_(d.getUTCMonth() + 1) + '-' + dd_(d.getUTCDate());
      linhaDoTempo.push({ data: iso, total: porDia[iso] || 0 });
    }
  }

  /*
   * QUANDO VOLTA VAZIO, DIGA POR QUÊ.
   *
   * A consulta mostrava "0 registros" e ponto — e não havia como saber,
   * de fora, se a base estava vazia, se as datas estavam num formato
   * que o filtro não entendia, ou se simplesmente não houve ausência no
   * intervalo. Estas três contagens respondem isso na própria tela.
   */
  const vazio = registrosTotal === 0;
  const porque = !vazio ? null : {
    linhasNaBase: varridos,
    semDataValida: semDataValida,
    foraDoIntervalo: foraDoIntervalo,
    baseVazia: varridos === 0,
    // "tudo fora do intervalo" é o caso em que a base tem dado, mas de
    // outras datas — aí o texto sugere o intervalo que existe.
    tudoForaDoIntervalo: varridos > 0 && foraDoIntervalo === varridos
  };

  return {
    colaboradores: lista.length, registros: registrosTotal, diasNoPeriodo: diasNoPeriodo,
    porque: porque,
    escopo: descreverEscopo(usuario),
    de: brDoIso_(de), ate: brDoIso_(ate), tipo: tipo, turno: filtroTurno,
    mostraIndividual: podeVerIndividual_(usuario),
    porCategoria: Object.keys(porCategoria).map(function (k) {
      return { categoria: k, total: porCategoria[k] };
    }).sort(function (a, b) { return b.total - a.total; }),
    porCompetencia: Object.keys(porCompetencia).sort().map(function (k) {
      return { competencia: k, total: porCompetencia[k] };
    }),
    porTurno: Object.keys(porTurno).sort().map(function (k) {
      return { turno: k, total: porTurno[k] };
    }),
    linhaDoTempo: linhaDoTempo,
    lista: lista.slice(0, 60), mais: Math.max(0, lista.length - 60)
  };
}

/** 'aaaa-mm-dd' -> 'dd/mm/aaaa', sem passar por Date. */
function brDoIso_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
}

/* ------------------------------------------------------------------ */
/* TIPOS DE AUSÊNCIA — a lista do seletor do Período                   */
/*                                                                     */
/* Lista FIXA, igual à da planilha original. Antes ela era montada a    */
/* partir das categorias que por acaso existiam no DE-PARA: se o mês    */
/* não tivesse nenhuma falta justificada, a opção sumia do seletor —    */
/* e quem quisesse conferir "não teve nenhuma?" não tinha como.         */
/* Agora as sete opções estão sempre lá; a que não tiver registro       */
/* simplesmente devolve zero, que é uma resposta.                       */
/* ------------------------------------------------------------------ */

const TIPOS_AUSENCIA = [
  { id: 'TODAS',            nome: 'Todas as ausências' },
  { id: 'FALTA_INJUST',     nome: 'Falta injustificada' },
  { id: 'FALTA_JUST',       nome: 'Falta justificada' },
  { id: 'FALTA_DISC',       nome: 'Falta disciplinar' },
  { id: 'ATESTADO',         nome: 'Atestado' },
  { id: 'LICENCA',          nome: 'Licença legal' },
  { id: 'OUTROS',           nome: 'Outros' }
];

/* As cinco famílias nomeadas. O que sobra é "Outros". */
const CATEGORIAS_NOMEADAS = ['FALTA', 'FALTA INJUSTIFICADA', 'FALTA JUSTIFICADA',
                             'FALTA DISCIPLINAR', 'ATESTADO', 'LICENCA LEGAL'];

function tiposDeAusencia_() {
  return TIPOS_AUSENCIA.map(function (t) { return { id: t.id, nome: t.nome }; });
}

/*
 * Devolve o filtro a aplicar sobre a categoria da FATO:
 *   { modo: 'TODAS' }                     — aceita qualquer ausência
 *   { modo: 'LISTA',  cats: [...] }       — só estas categorias
 *   { modo: 'OUTROS', exceto: [...] }     — ausência que não é nenhuma
 *                                            das cinco nomeadas
 * Aceita também o nome da categoria direto (retrocompatível com links
 * antigos e com quem chamar a ação por fora da tela).
 */
function filtroDeTipo_(tipo) {
  const t = catN_(tipo);
  if (!t || t === 'TODAS') return { modo: 'TODAS' };
  if (t === 'OUTROS') return { modo: 'OUTROS', exceto: CATEGORIAS_NOMEADAS };

  const familias = {
    'FALTA':        ['FALTA', 'FALTA INJUSTIFICADA'],
    'FALTA_INJUST': ['FALTA', 'FALTA INJUSTIFICADA'],
    'FALTA INJUSTIFICADA': ['FALTA', 'FALTA INJUSTIFICADA'],
    'FALTA_JUST':   ['FALTA JUSTIFICADA'],
    'FALTA JUSTIFICADA': ['FALTA JUSTIFICADA'],
    'FALTA_DISC':   ['FALTA DISCIPLINAR'],
    'FALTA DISCIPLINAR': ['FALTA DISCIPLINAR'],
    'ATESTADO':     ['ATESTADO'],
    'LICENCA':      ['LICENCA LEGAL'],
    'LICENCA LEGAL':['LICENCA LEGAL']
  };
  return { modo: 'LISTA', cats: familias[t] || [t] };
}

/* Aplica o filtro a uma categoria já canônica. */
function passaNoTipo_(filtro, catCanon) {
  if (filtro.modo === 'TODAS') return true;
  if (filtro.modo === 'OUTROS') return filtro.exceto.indexOf(catCanon) === -1;
  return filtro.cats.indexOf(catCanon) !== -1;
}

/* Nome antigo, mantido: alguma chamada solta pode ainda usar. */
function categoriasDoTipo_(tipo) {
  const f = filtroDeTipo_(tipo);
  return f.modo === 'LISTA' ? f.cats : [];
}

/*
 * Categorias que o DE-PARA marca como ausência, na grafia gravada.
 * Serve ao diagnóstico e à conferência do DE-PARA — o seletor do
 * Período usa a lista fixa acima.
 */
function categoriasDeAusencia_() {
  const vistas = {};
  listar('DE_PARA').forEach(function (l) {
    if (norm_(l.CONTA_COMO_AUSENCIA) !== 'SIM') return;
    const c = String(l.CATEGORIA || '').trim();
    if (c && !ehNaoDefinido_(c)) vistas[c] = true;
  });
  return Object.keys(vistas).sort();
}

function acaoFichaColaborador(usuario, params) {
  exigirTela(usuario, 'assiduidade');
  if (!podeVerIndividual_(usuario)) {
    throw new Error('Seu nível de acesso vê apenas os números agregados.');
  }
  const mat = params.matricula;
  if (!mat) throw new Error('Matrícula não informada.');

  const historicoRaw = listar('AGR_COLAB').filter(function (a) {
    return a.MATRICULA === mat;
  }).sort(function (a, b) { return String(a.COMPETENCIA).localeCompare(String(b.COMPETENCIA)); });

  let nome = mat, turno = '';
  const historico = historicoRaw.map(function (h) {
    nome = h.NOME || nome;
    turno = h.TURNO || turno;
    const reg = Number(h.REGISTROS) || 0;
    const trab = Number(h.TRABALHADOS) || 0;
    const aus = Number(h.AUSENCIAS) || 0;
    const fer = Number(h.FERIAS) || 0;
    const fol = Number(h.FOLGAS) || 0;
    const lic = Number(h.LICENCAS) || 0;
    const inj = Number(h.FALTAS_INJ !== undefined && h.FALTAS_INJ !== '' ? h.FALTAS_INJ : h.FALTAS) || 0;
    return {
      competencia: normalizarCompetenciaRH_(h.COMPETENCIA),
      // "Dias lanç." aparecia como "—": o campo não vinha no histórico.
      registros: reg, trabalhados: trab, ausencias: aus,
      faltas: Number(h.FALTAS) || 0,
      faltasInjustificadas: inj,
      faltasJustificadas: Number(h.FALTAS_JUST) || 0,
      faltasDisciplinares: Number(h.FALTAS_DISC) || 0,
      atestados: Number(h.ATESTADOS) || 0,
      ferias: fer, folgas: fol, licencas: lic,
      /*
       * O que sobra: ajuste de horas, abono, compensação — dias lançados
       * que não são presença nem ausência. Sem esta conta, a barra da
       * ficha não fechava com o total de dias lançados.
       */
      outros: Math.max(0, reg - trab - aus - fer - fol - lic),
      assiduidade: parseFloat(String(h.ASSIDUIDADE).replace('%', '')) || 0
    };
  });

  /*
   * A ficha mostra o historico inteiro da pessoa, atravessando todas as
   * planilhas ja importadas — isso e proposital.
   *
   * MAS: o mes do RH vai do dia 21 ao 20, entao a MESMA data cai em duas
   * competencias (25/08 existe em 2026-08 e em 2026-09). Sem tratar, a
   * mesma falta aparecia repetida na lista. Aqui cada DATA + CODIGO conta
   * uma vez so, ficando com o registro da competencia mais recente.
   */
  const jaVistos = {};
  const ausenciasRaw = listar('FATO_ASSIDUIDADE').filter(function (f) {
    if (String(f.MATRICULA) !== String(mat)) return false;
    if (String(f.AUSENCIA) !== 'Sim') return false;
    if (ehNaoDefinido_(f.CATEGORIA)) return false;
    const chave = isoDaFato_(f.DATA) + '|' + String(f.CODIGO);
    if (jaVistos[chave]) return false;
    jaVistos[chave] = true;
    return true;
  }).map(function (f) {
    const c = {}; Object.keys(f).forEach(function (k) { c[k] = f[k]; });
    c._iso = isoDaFato_(f.DATA);
    return c;
  }).sort(function (a, b) { return String(b._iso).localeCompare(String(a._iso)); }).slice(0, 60);

  const mapaCodigos = lerDePara_();
  const ausencias = ausenciasRaw.map(function (a) {
    const t = traduz_(mapaCodigos, a.CODIGO);
    // br_(new Date(a.DATA + 'T12:00:00')) quebrava quando a celula vinha
    // como Date; brDoIso_ trata texto e Date pelo mesmo caminho.
    return {
      data: brDoIso_(a._iso), iso: a._iso,
      // A competencia vai junto: sem ela a lista parecia contradizer o
      // cabecalho (que resume um mes so).
      competencia: normalizarCompetenciaRH_(a.COMPETENCIA),
      codigo: a.CODIGO, descricao: t.desc, categoria: String(a.CATEGORIA || '')
    };
  });

  /* Quebra das ausências por categoria — alimenta as barras da ficha. */
  const porCategoria = {};
  ausencias.forEach(function (a) {
    const c = a.categoria || 'Sem categoria';
    porCategoria[c] = (porCategoria[c] || 0) + 1;
  });

  return {
    matricula: mat, nome: nome, turno: turno,
    meta: Number(parametro('META_ABSENTEISMO', '0.05')) * 100,
    historico: historico,
    ausencias: ausencias,
    porCategoria: Object.keys(porCategoria).map(function (c) {
      return { categoria: c, total: porCategoria[c] };
    }).sort(function (a, b) { return b.total - a.total; })
  };
}

/* ==========================================================================
   IMPORTACAO E PROCESSAMENTO (ETL)
   ========================================================================== */

function acaoPreviewImportacao(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const arq = obter('ARQUIVOS_RH', params.id);
  if (!arq) throw new Error('Arquivo não encontrado.');

  const cfg = cfgD_();
  const folha = abrirFolha_(arq.LINK, arq.ABA);
  const det = detectar_(folha.m, cfg);

  const res = {
    erros: det.erros, avisos: det.avisos,
    linhaCabecalho: det.linCab >= 0 ? det.linCab + 1 : 'Não achada',
    colunasData: det.cols.length,
    registros: 0, pessoas: 0, porTurno: [], codigosPendentes: [],
    primeiraData: det.cols.length ? br_(det.cols[0].data) : 'N/A',
    ultimaData: det.cols.length ? br_(det.cols[det.cols.length - 1].data) : 'N/A'
  };

  if (det.erros.length) return res;

  const ext = extrair_(folha.m, det, cfg, normalizarCompetenciaRH_(arq.COMPETENCIA));
  res.registros = ext.regs.length;
  res.pessoas = Object.keys(ext.nomes).length;

  const mapa = lerDePara_();
  Object.keys(ext.porTurno).sort().forEach(function (t) {
    res.porTurno.push({
      turno: t || '(vazio)',
      pessoas: ext.porTurno[t].pessoas,
      celulas: ext.porTurno[t].celulas
    });
  });

  Object.keys(ext.codigos).sort().forEach(function (c) {
    if (ehNaoDefinido_(traduz_(mapa, c).cat)) {
      res.codigosPendentes.push({ codigo: c, vezes: ext.codigos[c] });
    }
  });

  return res;
}

function acaoImportarCompetencia(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const arq = obter('ARQUIVOS_RH', params.id);
  if (!arq) throw new Error('Arquivo não encontrado.');
  return importarArquivoRH_(arq, usuario.email);
}

/*
 * O motor da importacao, separado da acao para o gatilho diario poder
 * chamar a mesma coisa sem inventar um usuario.
 */
function importarArquivoRH_(arq, quem) {
  const cfg = cfgD_();
  const folha = abrirFolha_(arq.LINK, arq.ABA);
  const det = detectar_(folha.m, cfg);

  if (det.erros.length) throw new Error(det.erros[0]);

  // Toda gravacao usa a competencia NORMALIZADA. Se a celula da planilha
  // virou Date, gravar o valor cru espalhava objetos Date pela FATO e
  // pelo AGR_COLAB, e nada mais casava com o texto 'aaaa-mm'.
  const compArq = normalizarCompetenciaRH_(arq.COMPETENCIA);

  const ext = extrair_(folha.m, det, cfg, compArq);
  if (!ext.regs.length) throw new Error('Nenhum lançamento encontrado na planilha do RH.');

  const mapa = lerDePara_();
  const linhasFato = [];
  const pend = {};

  ext.regs.forEach(function (g) {
    const t = traduz_(mapa, g.cod);
    /*
     * A comparacao era com a string em CAIXA ALTA ('IGNORAR'), mas o
     * DE-PARA grava a categoria como a pessoa escreve — 'Ignorar'. Nada
     * casava, e as 173 celulas de traco, marcacao interna do RH e
     * anotacao em texto entravam na base como lancamento: o denominador
     * da taxa de absenteismo inflava e o painel divergia da planilha.
     * catN_ compara sem acento e sem caixa.
     */
    const catCanon = catN_(t.cat);
    if (catCanon === 'IGNORAR') return;
    if (ehNaoDefinido_(catCanon)) pend[g.cod] = true;
    linhasFato.push([
      ymd_(g.data), g.comp, DOW_[g.data.getDay()], g.mat, g.turno, g.cod, t.cat, t.aus ? 'Sim' : 'Não'
    ]);
  });

  /*
   * Colaboradores — DESEMPENHO.
   *
   * Era um inserir() ou atualizar() por pessoa dentro do laco. Com 200
   * colaboradores isso significava ~1.200 chamadas de servico so nesta
   * etapa, e era o candidato numero um a estourar o limite de 6 minutos
   * da execucao. Agora: uma escrita para os novos, uma para os que
   * mudaram, e quem nao mudou nem e tocado.
   */
  const colabExistentes = {};
  listar('COLABORADORES').forEach(function (c) {
    colabExistentes[String(c.MATRICULA)] = c;
  });

  const novosColab = [], mudancasColab = [];
  Object.keys(ext.nomes).forEach(function (mat) {
    const d = ext.nomes[mat];
    const atual = colabExistentes[String(mat)];
    if (!atual) {
      novosColab.push({ MATRICULA: mat, NOME: d.nome, TURNO: d.turno });
      return;
    }
    // So grava quem realmente mudou de nome ou de turno.
    if (String(atual.NOME || '') !== String(d.nome || '') ||
        String(atual.TURNO || '') !== String(d.turno || '')) {
      mudancasColab.push({ id: atual.ID, campos: { NOME: d.nome, TURNO: d.turno } });
    }
  });
  if (novosColab.length) inserirVarios('COLABORADORES', novosColab, quem);
  if (mudancasColab.length) atualizarVarios('COLABORADORES', mudancasColab, quem);

  // Fato em lote — agora por nome de coluna, nao por posicao.
  substituirLote_('FATO_ASSIDUIDADE', compArq, linhasFato.map(function (l) {
    return { DATA: l[0], COMPETENCIA: l[1], DIA_SEMANA: l[2], MATRICULA: l[3],
             TURNO: l[4], CODIGO: l[5], CATEGORIA: l[6], AUSENCIA: l[7] };
  }), quem);

  // Agregados e payload do painel
  const agr = calcularAgregado_(compArq, linhasFato, ext.nomes);

  substituirLote_('AGR_COLAB', compArq, agr.linhasColab, quem);

  const painelRows = listar('PAINEL').filter(function (p) {
    return normalizarCompetenciaRH_(p.COMPETENCIA) === compArq;
  });
  const payloadStr = JSON.stringify(agr.payload);
  if (painelRows.length) {
    atualizar('PAINEL', painelRows[0].ID, { GERADO_EM: agoraTextoDados_(), PAYLOAD: payloadStr }, quem);
  } else {
    inserir('PAINEL', { COMPETENCIA: compArq, GERADO_EM: agoraTextoDados_(), PAYLOAD: payloadStr }, quem);
  }

  atualizar('ARQUIVOS_RH', arq.ID,
    { ULTIMA_IMPORTACAO: agoraTextoDados_(), LINHAS: linhasFato.length }, quem);

  esquecerLeituras();

  /*
   * CONFERÊNCIA PÓS-GRAVAÇÃO.
   *
   * Antes a importação dizia "ok" pelo simples fato de não ter lançado
   * exceção. Se a gravação tivesse ido para o lugar errado, ou se a
   * competência gravada não casasse com a competência lida, ninguém
   * ficava sabendo: o painel continuava mostrando o número velho (que
   * mora noutra aba) e parecia que "nada mudou". Agora a função relê o
   * que acabou de escrever e compara.
   */
  const gravadas = listar('FATO_ASSIDUIDADE').filter(function (f) {
    return normalizarCompetenciaRH_(f.COMPETENCIA) === compArq;
  }).length;
  if (gravadas !== linhasFato.length) {
    throw new Error('A gravação não confere: li ' + linhasFato.length +
      ' lançamento(s) da folha, mas a base ficou com ' + gravadas +
      ' na competência ' + compArq + '. Nada foi dado como atualizado.');
  }

  const lp = Object.keys(pend);
  return {
    ok: true,
    competencia: compArq,
    registros: linhasFato.length,
    colaboradores: Object.keys(ext.nomes).length,
    aviso: lp.length ? 'Códigos fora da legenda: ' + lp.join(', ') : ''
  };
}

/* ==========================================================================
   CALCULOS DO BI
   ========================================================================== */

function calcularAgregado_(comp, linhasFato, nomes) {
  /*
   * CONFERIDO CONTRA A GSL-DADOS EM PRODUCAO (competencia 2026-08).
   * As definicoes abaixo sao as da planilha do usuario, nao as minhas:
   *
   *   REGISTRO       = uma celula preenchida da grade (pessoa x dia), ja
   *                    sem o que o DE-PARA marca como "Ignorar".
   *   TAXA           = ausencias / registros           (nao trab+aus)
   *   TAXA DO TURNO  = ausencias do turno / registros do turno
   *   ASSIDUIDADE    = (registros - ausencias) / registros
   *
   * A versao anterior usava (trabalhados + ausencias) como denominador em
   * dois desses tres lugares. Quem tem ferias, folga ou licenca no mes
   * saia com denominador menor que o real e assiduidade inflada, e a
   * porcentagem do turno nao batia com a da planilha.
   *
   * As tres familias de falta ficam separadas: no painel elas nunca se
   * somam num balde so (regra escrita no DE-PARA do proprio usuario).
   */
  let lanc = 0, aus = 0, faltaInj = 0, faltaJust = 0, faltaDisc = 0, atest = 0, ferias = 0;
  const porCat = {}, porCod = {}, porDia = {}, porDow = {}, colab = {};

  linhasFato.forEach(function (l) {
    const data = l[0], mat = l[3], turno = l[4], cod = l[5], cat = l[6];
    const ausencia = (l[7] === 'Sim');
    const catN = catN_(cat);
    lanc++;

    porCat[cat] = (porCat[cat] || 0) + 1;
    porCod[cod] = porCod[cod] || { total: 0 };
    porCod[cod].total++;

    porDia[data] = porDia[data] || { total: 0, ausencias: 0 };
    porDia[data].total++;

    if (!colab[mat]) {
      colab[mat] = { turno: turno, registros: 0, trab: 0, aus: 0,
                     inj: 0, just: 0, disc: 0, atest: 0,
                     ferias: 0, folga: 0, lic: 0, abono: 0, ajuste: 0 };
    }
    const c = colab[mat];
    if (c.turno === '' && turno) c.turno = turno;
    c.registros++;

    if (catN === 'PRESENCA') c.trab++;
    else if (catN === 'FERIAS') { c.ferias++; ferias++; }
    else if (catN === 'FOLGA') c.folga++;
    else if (catN === 'LICENCA LEGAL') c.lic++;
    else if (catN === 'ABONO') c.abono++;
    else if (catN === 'AJUSTE DE HORAS') c.ajuste++;

    if (ausencia) {
      aus++; c.aus++;
      porDia[data].ausencias++;
      porDow[l[2]] = (porDow[l[2]] || 0) + 1;
      if (catN === 'FALTA INJUSTIFICADA' || catN === 'FALTA') { faltaInj++; c.inj++; }
      else if (catN === 'FALTA JUSTIFICADA') { faltaJust++; c.just++; }
      else if (catN === 'FALTA DISCIPLINAR') { faltaDisc++; c.disc++; }
      if (catN === 'ATESTADO') { atest++; c.atest++; }
    }
  });

  const mats = Object.keys(colab);
  const taxaGlobal = lanc ? Math.round((aus / lanc) * 1000) / 10 : 0;
  const meta = Number(parametro('META_ABSENTEISMO', '0.05')) * 100;

  const kpis = {
    colaboradores: mats.length,
    registros: lanc,
    ausencias: aus,
    taxa: taxaGlobal, meta: meta, acimaDaMeta: taxaGlobal > meta,
    // As tres familias separadas, mais o total — como no painel da planilha.
    faltas: faltaInj + faltaJust + faltaDisc,
    faltasInjustificadas: faltaInj,
    faltasJustificadas: faltaJust,
    faltasDisciplinares: faltaDisc,
    atestados: atest,
    ferias: ferias,
    pessoasEmFerias: mats.filter(function (m) { return colab[m].ferias > 0; }).length,
    comAusencia: mats.filter(function (m) { return colab[m].aus > 0; }).length
  };

  const turnosStats = {};
  mats.forEach(function (m) {
    const t = colab[m].turno || 'Sem turno';
    if (!turnosStats[t]) turnosStats[t] = { pessoas: 0, registros: 0, trab: 0, aus: 0, inj: 0, atest: 0 };
    const s = turnosStats[t];
    s.pessoas++;
    s.registros += colab[m].registros;
    s.trab += colab[m].trab;
    s.aus += colab[m].aus;
    s.inj += colab[m].inj;
    s.atest += colab[m].atest;
  });

  const arrTurno = Object.keys(turnosStats).sort().map(function (t) {
    const s = turnosStats[t];
    return {
      turno: t,
      // Denominador = registros do turno, igual ao painel da planilha.
      taxa: s.registros ? Math.round((s.aus / s.registros) * 1000) / 10 : 0,
      pessoas: s.pessoas, celulas: s.registros, registros: s.registros,
      presencas: s.trab, ausencias: s.aus,
      faltasInjustificadas: s.inj, atestados: s.atest
    };
  });

  /*
   * Codigo fora da legenda NAO entra nos graficos. Ele vira um aviso
   * proprio ("N lancamentos com codigo nao definido"), com a lista dos
   * codigos, para alguem cadastrar no DE-PARA. Antes ele aparecia como
   * uma barra gigante chamada "A CONFIRMAR" no meio das categorias
   * reais — na folha de agosto eram 530 lancamentos, a segunda maior
   * barra do painel, dizendo exatamente nada.
   */
  const arrCat = Object.keys(porCat).filter(function (k) {
    return !ehNaoDefinido_(k);
  }).map(function (k) {
    return { categoria: k, total: porCat[k] };
  }).sort(function (a, b) { return b.total - a.total; });

  const arrDia = Object.keys(porDia).sort().map(function (d) {
    const t = porDia[d].total, a = porDia[d].ausencias;
    return { data: d, total: t, ausencias: a, taxa: t ? Math.round((a / t) * 1000) / 10 : 0 };
  });

  const dwOrdem = { 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'domingo': 7 };
  const arrDow = Object.keys(porDow).map(function (d) {
    return { dia: d, total: porDow[d] };
  }).sort(function (a, b) { return dwOrdem[a.dia] - dwOrdem[b.dia]; });

  const mapa = lerDePara_();
  const todosCodigos = Object.keys(porCod).map(function (c) {
    const t = traduz_(mapa, c);
    return { codigo: c, descricao: t.desc, categoria: t.cat, total: porCod[c].total,
             naoDefinido: ehNaoDefinido_(t.cat) };
  }).sort(function (a, b) { return b.total - a.total; });

  const arrCod = todosCodigos.filter(function (c) { return !c.naoDefinido; }).slice(0, 15);
  const semLegenda = todosCodigos.filter(function (c) { return c.naoDefinido; });
  const naoDefinidos = {
    lancamentos: semLegenda.reduce(function (n, c) { return n + c.total; }, 0),
    codigos: semLegenda.slice(0, 20).map(function (c) {
      return { codigo: c.codigo, total: c.total };
    })
  };

  const arrColab = mats.sort().map(function (m) {
    const c = colab[m];
    return {
      matricula: m, nome: nomes[m] ? nomes[m].nome : '(sem nome)', turno: c.turno,
      registros: c.registros,
      trabalhados: c.trab, ausencias: c.aus,
      faltas: c.inj + c.just + c.disc,
      faltasInjustificadas: c.inj, faltasJustificadas: c.just, faltasDisciplinares: c.disc,
      atestados: c.atest, ferias: c.ferias, folgas: c.folga, licencas: c.lic,
      // (registros - ausencias) / registros
      assiduidade: c.registros ? Math.round(((c.registros - c.aus) / c.registros) * 1000) / 10 : 0
    };
  });

  /*
   * Linhas do AGR_COLAB montadas POR NOME DE COLUNA, nao por posicao.
   * Antes era um array posicional casado na mao com o cabecalho: bastava
   * acrescentar uma coluna no esquema para todo o resto deslizar de lugar
   * em silencio. Agora quem casa e o substituirLote_, pelo cabecalho real
   * da aba.
   */
  const linhasColab = arrColab.map(function (c) {
    return {
      COMPETENCIA: comp, MATRICULA: c.matricula, NOME: c.nome, TURNO: c.turno,
      REGISTROS: c.registros, TRABALHADOS: c.trabalhados, AUSENCIAS: c.ausencias,
      FALTAS: c.faltas,
      FALTAS_INJ: c.faltasInjustificadas,
      FALTAS_JUST: c.faltasJustificadas,
      FALTAS_DISC: c.faltasDisciplinares,
      ATESTADOS: c.atestados, FERIAS: c.ferias, FOLGAS: c.folgas, LICENCAS: c.licencas,
      ASSIDUIDADE: c.assiduidade + '%'
    };
  });

  /*
   * O PAYLOAD DO PAINEL NAO LEVA MAIS A LISTA DE COLABORADORES.
   *
   * Ele e gravado numa UNICA celula da aba PAINEL, e uma celula do Google
   * Sheets aceita no maximo 50.000 caracteres. Com 341 colaboradores o
   * payload dava 96.681 — quase o dobro. A lista sozinha respondia por
   * 91.768 deles. Resultado: a gravacao do painel falhava ou vinha
   * truncada, e a aba "Colaborador" simplesmente nao carregava (o erro
   * acontecia no meio da montagem e a tela ficava com o conteudo
   * anterior, sem mensagem nenhuma).
   *
   * A lista ja existe inteira na tabela AGR_COLAB, uma linha por pessoa.
   * A aba passa a le-la de la, sob demanda. O payload caiu para ~5 KB e
   * o limite deixou de ser um problema — inclusive quando o CD crescer.
   */
  return {
    payload: {
      versao: VERSAO_PAINEL,
      kpis: kpis, porTurno: arrTurno, porCategoria: arrCat, diaADia: arrDia,
      porDiaSemana: arrDow, codigosTop: arrCod, naoDefinidos: naoDefinidos
    },
    linhasColab: linhasColab
  };
}

/* ==========================================================================
   UTILITARIOS INTERNOS
   ========================================================================== */

/*
 * Troca todas as linhas de UMA competencia numa aba, em bloco.
 *
 * `registros` e uma lista de OBJETOS com as chaves iguais aos nomes das
 * colunas. Antes era uma lista de arrays posicionais mais uma funcao
 * formatadora que repetia o cabecalho na mao — bastava acrescentar uma
 * coluna ao esquema para todos os valores deslizarem de coluna em
 * silencio, e o painel passava a mostrar nome no lugar de turno sem
 * ninguem perceber. Aqui quem manda e o cabecalho real da aba.
 */
function substituirLote_(abaNome, comp, registros, quem) {
  /*
   * Troca todas as linhas de UMA competência numa aba.
   *
   * NÃO APAGA LINHAS — reescreve a área de dados.
   *
   * A versão anterior apagava as linhas da competência com deleteRows e
   * escrevia as novas embaixo. Funcionava enquanto a aba tinha linhas de
   * outras competências sobrando; no dia em que TODAS as linhas eram da
   * competência que estava sendo trocada, o Google recusava a operação
   * inteira com "Não é possível excluir todas as linhas não congeladas"
   * — não se pode apagar todas as linhas não congeladas de uma aba. Era
   * o caso normal: uma competência importada, reimportada em seguida.
   *
   * Aqui a aba é tratada como um bloco: lê o que existe, separa o que
   * fica, junta com o que entra, limpa a área e escreve tudo de volta.
   * Nenhuma linha é excluída, então a regra do Google não é tocada — e
   * de quebra são menos chamadas de serviço que o laço de deleteRows.
   */
  let sh;
  try { sh = abaDe(abaNome); } catch (e) {
    throw new Error('A aba ' + abaNome + ' não existe no banco.');
  }

  const nCol = Math.max(1, sh.getLastColumn());
  const colunas = sh.getRange(1, 1, 1, nCol).getValues()[0]
    .map(function (c) { return String(c).trim().toUpperCase(); });
  const idxComp = colunas.indexOf('COMPETENCIA');
  if (idxComp < 0) throw new Error('A aba ' + abaNome + ' está sem a coluna COMPETENCIA.');

  /* 1 · monta as linhas novas ANTES de tocar no que está gravado */
  const agora = agoraTextoDados_();
  const novas = (registros || []).map(function (r) {
    const linha = {};
    Object.keys(r).forEach(function (k) { linha[k.toUpperCase()] = r[k]; });
    if (linha.ID === undefined) linha.ID = Utilities.getUuid();
    linha.CRIADO_EM = agora;  linha.CRIADO_POR = quem || 'sistema';
    linha.ATUALIZADO_EM = agora;  linha.ATUALIZADO_POR = quem || 'sistema';
    linha.EXCLUIDO = 'NAO';
    return colunas.map(function (c) { return linha[c] === undefined ? '' : linha[c]; });
  });

  if (!novas.length) {
    // Nada a gravar: NÃO mexe no que já está lá. Melhor manter o dado
    // velho do que esvaziar a aba por causa de uma leitura ruim.
    throw new Error('Nada a gravar em ' + abaNome + ' para a competência ' + comp +
                    '. A base anterior foi preservada.');
  }

  /* 2 · lê o que existe e separa o que fica (outras competências) */
  const ultimaAntes = sh.getLastRow();
  let mantidas = [];
  if (ultimaAntes >= 2) {
    mantidas = sh.getRange(2, 1, ultimaAntes - 1, nCol).getValues().filter(function (l) {
      const vazia = l.every(function (c) { return c === '' || c === null; });
      if (vazia) return false;
      return normalizarCompetenciaRH_(l[idxComp]) !== comp;
    });
  }

  const finais = mantidas.concat(novas);

  /* 3 · garante linhas físicas suficientes */
  const precisa = finais.length + 1;                 // +1 do cabeçalho
  if (sh.getMaxRows() < precisa) {
    sh.insertRowsAfter(sh.getMaxRows(), precisa - sh.getMaxRows());
  }

  /* 4 · limpa a área de dados (sem apagar linha) e escreve */
  const limparAte = Math.max(ultimaAntes - 1, finais.length);
  if (limparAte > 0) {
    sh.getRange(2, 1, Math.min(limparAte, sh.getMaxRows() - 1), nCol).clearContent();
  }

  const chunk = 4000;
  for (let i = 0; i < finais.length; i += chunk) {
    const pedaco = finais.slice(i, i + chunk);
    const faixa = sh.getRange(2 + i, 1, pedaco.length, nCol);
    /*
     * O FORMATO DE TEXTO VEM ANTES DO VALOR. Na ordem inversa o Sheets
     * já interpretou "2026-07-21" como data ao receber o valor; mudar o
     * formato depois só troca a aparência, e a leitura seguinte devolve
     * um objeto Date. Foi assim que a coluna DATA virou Date.
     */
    faixa.setNumberFormat('@');
    faixa.setValues(pedaco);
  }

  /*
   * INVALIDAR O CACHE DA TABELA — não só a memória da execução.
   * A tabela é guardada no CacheService entre requisições sob a chave
   * `tb|<geração da tabela>|<tabela>`, e a geração só avança em
   * limparCache(tabela). Sem isto, quem importasse e fosse olhar em
   * seguida via os números de antes por até cinco minutos.
   */
  limparCache(abaNome);
  return { mantidas: mantidas.length, gravadas: novas.length, total: finais.length };
}

function cfgD_() {
  return {
    cabMat: norm_(parametro('RH_CAB_MATRICULA', 'MATRICULA')),
    cabNome: norm_(parametro('RH_CAB_NOME', 'NOME')),
    cabTurno: norm_(parametro('RH_CAB_TURNO', 'T.')),
    turnos: String(parametro('RH_TURNOS', 'ADM,A,B,C,J,BC')).split(',').map(norm_).filter(String),
    digitos: Number(parametro('RH_DIGITOS_MATRICULA', '6')) || 6,
    corta: String(parametro('RH_CORTAR_LINHAS', 'HORAS TRABALHADAS,TOTAL,QUNT')).split(',').map(norm_).filter(String)
  };
}

function lerDePara_() {
  const mapa = {};
  listar('DE_PARA').forEach(function (l) {
    const c = codigo_(l.CODIGO);
    if (c) {
      mapa[c] = {
        desc: String(l.DESCRICAO || ''),
        cat: String(l.CATEGORIA || CAT_NAO_DEFINIDO),
        aus: norm_(l.CONTA_COMO_AUSENCIA) === 'SIM'
      };
    }
  });
  return mapa;
}

/* Categoria que o painel usa para o que nao esta na legenda. */
const CAT_NAO_DEFINIDO = 'Não definido';

/*
 * Procura o codigo no DE-PARA aceitando as variacoes que a folha produz:
 * com zeros a esquerda ("003" x "3"), com virgula decimal ("6,1" x
 * "6.1") e com o ".0" que a planilha as vezes cola em numero inteiro.
 * O que nao for encontrado vira "Não definido" — nome que aparece na
 * tela, no lugar do antigo "A CONFIRMAR", e que fica FORA dos graficos.
 */
function traduz_(mapa, cod) {
  const bruto = String(cod == null ? '' : cod);
  if (mapa[bruto]) return mapa[bruto];

  const tentativas = [
    bruto.replace(/^0+(?=\d)/, ''),     // 003 -> 3
    bruto.replace(',', '.'),            // 6,1 -> 6.1
    bruto.replace('.', ','),            // 6.1 -> 6,1
    bruto.replace(/\.0+$/, ''),         // 7.0 -> 7
    bruto.trim().toUpperCase()
  ];
  for (let i = 0; i < tentativas.length; i++) {
    const t = tentativas[i];
    if (t && t !== bruto && mapa[t]) return mapa[t];
  }
  return { desc: '', cat: CAT_NAO_DEFINIDO, aus: false, naoDefinido: true };
}

/** true quando a categoria significa "nao esta na legenda". */
function ehNaoDefinido_(cat) {
  const c = catN_(cat);
  return c === 'NAO DEFINIDO' || c === 'A CONFIRMAR' || c === '';
}

function abrirFolha_(link, abaEsperada) {
  let arq;
  try {
    arq = SpreadsheetApp.openByUrl(link);
  } catch (e) {
    throw new Error('Não consegui abrir a planilha da competência. Verifique o link.');
  }
  const sh = abaEsperada ? arq.getSheetByName(abaEsperada) : arq.getSheets()[0];
  if (!sh) {
    throw new Error('A aba "' + abaEsperada + '" não existe no arquivo. Abas disponíveis: ' +
      arq.getSheets().map(function (s) { return s.getName(); }).join(', '));
  }
  return { arq: arq, sh: sh, m: sh.getDataRange().getValues() };
}

function detectar_(m, cfg) {
  const erros = [], avisos = [];
  const nLin = m.length;
  let nCol = 0;
  for (let i = 0; i < nLin; i++) nCol = Math.max(nCol, m[i].length);

  let linCab = -1;
  for (let r = 0; r < nLin && linCab < 0; r++) {
    for (let c = 0; c < nCol; c++) {
      if (norm_(m[r][c]).indexOf(cfg.cabMat) > -1) { linCab = r; break; }
    }
  }
  if (linCab < 0) {
    return {
      erros: ['Não achei a linha de cabeçalho. (Procurei "' + cfg.cabMat + '")'],
      avisos: [], nLin: nLin, nCol: nCol, linCab: -1, cols: []
    };
  }

  let colMat = -1, colNome = -1, colTurno = -1;
  for (let c2 = 0; c2 < nCol; c2++) {
    const t = norm_(m[linCab][c2]);
    if (colMat < 0 && t.indexOf(cfg.cabMat) > -1) colMat = c2;
    if (colNome < 0 && t === cfg.cabNome) colNome = c2;
    if (colTurno < 0 && t === cfg.cabTurno) colTurno = c2;
  }
  if (colMat < 0) erros.push('Não achei a coluna de matrícula.');
  if (colTurno < 0) avisos.push('Não achei a coluna do turno.');

  const grade = colunasDeData_(m, linCab, nCol);
  const cols = grade.cols;
  if (grade.aviso) avisos.push(grade.aviso);
  if (cols.length < 7) {
    erros.push('Achei só ' + cols.length + ' coluna(s) de dia na linha ' + (linCab + 1) + '. ' +
      grade.motivo + ' Confira se a aba cadastrada é a FOLHA DE PONTO (a que tem os dias ' +
      'em colunas) e se a célula “DATA INICIAL” está preenchida.');
  }

  /*
   * A folha do RH repete o cabecalho a cada bloco de turno (na de
   * agosto/2026 sao SETE blocos: linhas 16, 69, 182, 305, 366, 385 e 403).
   * Ler tudo com as colunas do primeiro bloco so funciona porque todos
   * usam o mesmo layout. Aqui conferimos isso de verdade: se algum bloco
   * seguinte tiver as datas em colunas diferentes, vira aviso na
   * pre-visualizacao em vez de virar numero errado em silencio.
   */
  const assinatura = cols.map(function (x) { return x.col; }).join(',');
  let blocos = 1, divergente = 0;
  for (let r2 = linCab + 1; r2 < nLin; r2++) {
    let ehCabecalho = false;
    for (let c4 = 0; c4 < nCol && !ehCabecalho; c4++) {
      if (norm_(m[r2][c4]).indexOf(cfg.cabMat) > -1) ehCabecalho = true;
    }
    if (!ehCabecalho) continue;
    blocos++;
    const outras = [];
    for (let c5 = 0; c5 < nCol; c5++) if (eData_(m[r2][c5])) outras.push(c5);
    if (outras.join(',') !== assinatura) divergente++;
  }
  if (blocos > 1) {
    avisos.push('A folha tem ' + blocos + ' blocos de cabeçalho (um por turno). ' +
      (divergente
        ? divergente + ' deles com as datas em colunas diferentes do primeiro — confira o resultado.'
        : 'Todos com o mesmo layout, então a leitura é confiável.'));
  }

  return {
    erros: erros, avisos: avisos, nLin: nLin, nCol: nCol, linCab: linCab,
    colMat: colMat, colNome: colNome, colTurno: colTurno, cols: cols, linIni: linCab + 1
  };
}

/* ------------------------------------------------------------------ */
/* AS COLUNAS DE DIA                                                   */
/*                                                                     */
/* A folha do RH pode trazer o cabeçalho da grade de dois jeitos, e o   */
/* leitor precisa entender os dois:                                     */
/*                                                                     */
/*   A) DATAS de verdade — a célula guarda 21/07/2026 e o Google        */
/*      devolve um objeto de data. Era o único caso tratado.            */
/*                                                                     */
/*   B) O NÚMERO DO DIA — a célula guarda 21, 22, 23 ... 31, 01, 02 ... */
/*      com o dia da semana na linha de cima. É o formato que a folha   */
/*      passou a usar, e com ele a leitura simplesmente parava: "achei  */
/*      só 0 colunas de data". A competência não é ambígua porque a     */
/*      própria folha traz a célula "DATA INICIAL" (21/07/2026): dela   */
/*      sai o mês e o ano, e a virada de mês é deduzida quando o número */
/*      do dia diminui (31 -> 01).                                      */
/* ------------------------------------------------------------------ */

function colunasDeData_(m, linCab, nCol) {
  /* A · cabeçalho com datas de verdade */
  const comData = [];
  for (let c = 0; c < nCol; c++) {
    if (eData_(m[linCab][c])) comData.push({ col: c, data: m[linCab][c] });
  }
  if (comData.length >= 7) return { cols: comData, origem: 'datas', motivo: '' };

  /* B · cabeçalho com o número do dia */
  const ehDia = function (v) {
    if (v === null || v === undefined || v === '') return 0;
    const t = String(v).trim();
    if (!/^\d{1,2}$/.test(t)) return 0;
    const n = Number(t);
    return (n >= 1 && n <= 31) ? n : 0;
  };
  // pega a MAIOR sequência de colunas vizinhas que são número de dia —
  // assim um número solto perdido numa coluna à direita não entra.
  let melhor = [], atual = [];
  for (let c = 0; c < nCol; c++) {
    const d = ehDia(m[linCab][c]);
    if (d) { atual.push({ col: c, dia: d }); }
    else { if (atual.length > melhor.length) melhor = atual; atual = []; }
  }
  if (atual.length > melhor.length) melhor = atual;

  if (melhor.length < 7) {
    return { cols: [], origem: 'nenhuma',
             motivo: 'A linha do cabeçalho não tem datas nem uma sequência de números de dia.' };
  }

  const inicio = dataInicialDaFolha_(m);
  if (!inicio) {
    return { cols: [], origem: 'sem-data-inicial',
             motivo: 'Achei ' + melhor.length + ' coluna(s) com número de dia, mas não achei a ' +
                     'célula “DATA INICIAL” para saber de que mês elas são.' };
  }

  /*
   * Monta a data de cada coluna a partir do mês/ano de DATA INICIAL,
   * virando o mês toda vez que o número do dia diminui.
   */
  let ano = inicio.getFullYear(), mes = inicio.getMonth(), anterior = 0;
  const cols = melhor.map(function (d, i) {
    if (i > 0 && d.dia < anterior) {
      mes++;
      if (mes > 11) { mes = 0; ano++; }
    }
    anterior = d.dia;
    /*
     * MEIO-DIA, não meia-noite. A data montada aqui atravessa o
     * Utilities.formatDate mais adiante; ancorada à meia-noite, qualquer
     * deslocamento de fuso (o do projeto, o da planilha, o horário de
     * verão) empurra o dia para trás e a folha inteira anda um dia. Ao
     * meio-dia sobram doze horas de folga para cada lado.
     */
    return { col: d.col, data: new Date(ano, mes, d.dia, 12, 0, 0) };
  });

  const aviso = 'O cabeçalho da grade traz o número do dia, não a data. Montei o período a ' +
    'partir de “DATA INICIAL” (' + formatarData(inicio) + '): de ' +
    formatarData(cols[0].data) + ' a ' + formatarData(cols[cols.length - 1].data) + '. ' +
    'Confira se bate com a folha antes de importar.';

  return { cols: cols, origem: 'numero-do-dia', motivo: '', aviso: aviso };
}

/*
 * Procura a célula "DATA INICIAL" no alto da folha e devolve a data que
 * está ao lado dela. É a âncora que diz de que mês são os números de dia
 * do cabeçalho.
 */
function dataInicialDaFolha_(m) {
  const ate = Math.min(m.length, 30);
  for (let r = 0; r < ate; r++) {
    const linha = m[r] || [];
    for (let c = 0; c < linha.length; c++) {
      if (norm_(linha[c]).indexOf('DATA INICIAL') === -1) continue;
      // a data costuma estar na célula seguinte; varre a linha à direita
      for (let d = c + 1; d < linha.length; d++) {
        if (eData_(linha[d])) return linha[d];
        const p = paraData(linha[d]);
        if (p && !isNaN(p.getTime())) return p;
      }
    }
  }
  return null;
}

function extrair_(m, det, cfg, comp) {
  const regs = [], nomes = {}, codigos = {}, porTurno = {}, turnosFora = {};
  const reMat = new RegExp('^\\d{' + cfg.digitos + ',}$');

  for (let r = det.linIni; r < det.nLin; r++) {
    const linha = m[r];
    if (!linha) continue;

    /*
     * LINHA DE TOTALIZACAO — o teste passou a olhar SO as colunas de
     * identificacao (matricula, nome e turno).
     *
     * Antes ele juntava a LINHA INTEIRA num texto e procurava as palavras
     * de corte ali dentro. A folha do RH tem anotacoes soltas em colunas
     * bem a direita da grade ("QUNT TUR ADM", "QUNT TURNO C"...), e uma
     * dessas palavras batia com o filtro: cinco colaboradores de verdade
     * — VALDY, VINICIUS, WELLINGTON, STEPHANIE e RENATO — sumiam do
     * sistema inteiro, sem aviso nenhum. O totalizador de verdade traz
     * "HORAS TRABALHADAS" na coluna da matricula, entao olhar so ali e
     * ao mesmo tempo mais certeiro e mais seguro.
     */
    const identificacao = norm_([
      det.colMat >= 0 ? linha[det.colMat] : '',
      det.colNome >= 0 ? linha[det.colNome] : '',
      det.colTurno >= 0 ? linha[det.colTurno] : ''
    ].join(' '));
    let pular = false;
    cfg.corta.forEach(function (x) { if (x && identificacao.indexOf(x) > -1) pular = true; });
    if (pular) continue;

    const mat = codigo_(linha[det.colMat]);
    if (!reMat.test(mat)) continue;

    const turno = det.colTurno >= 0 ? norm_(linha[det.colTurno]) : '';
    if (turno && cfg.turnos.indexOf(turno) < 0) {
      turnosFora[turno] = (turnosFora[turno] || 0) + 1;
      continue;
    }

    porTurno[turno] = porTurno[turno] || { pessoas: 0, celulas: 0 };
    porTurno[turno].pessoas++;

    if (det.colNome >= 0) {
      const nm = String(linha[det.colNome] || '').trim();
      if (nm) nomes[mat] = { nome: nm, turno: turno };
    }

    for (let k = 0; k < det.cols.length; k++) {
      const cod = codigo_(linha[det.cols[k].col]);
      if (!cod) continue;
      codigos[cod] = (codigos[cod] || 0) + 1;
      porTurno[turno].celulas++;
      regs.push({ data: det.cols[k].data, mat: mat, turno: turno, cod: cod, comp: comp });
    }
  }
  return { regs: regs, nomes: nomes, codigos: codigos, porTurno: porTurno, turnosFora: turnosFora };
}

/* ==========================================================================
   FUNCOES BASICAS
   ========================================================================== */

function norm_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[àáâãä]/gi, 'A').replace(/[èéêë]/gi, 'E').replace(/[ìíîï]/gi, 'I')
    .replace(/[òóôõö]/gi, 'O').replace(/[ùúûü]/gi, 'U').replace(/ç/gi, 'C')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/*
 * Categoria canonica: sem acento, caixa alta, espaco normalizado.
 * O DE-PARA e editavel pelo usuario, entao 'Licenca legal', 'Licença
 * legal' e 'LICENCA LEGAL' precisam significar a mesma coisa em todo
 * lugar que compara categoria.
 */
function catN_(v) { return norm_(v); }

/*
 * Normaliza o que veio da celula para o codigo do DE-PARA.
 *
 * A grade traz o mesmo codigo de tres jeitos: numero (7 -> "7", 6.1 ->
 * "6.1"), texto ("003") e — quando a planilha resolve interpretar — ate
 * objeto Date. O 6.1 e o caso critico: e o codigo de FERIAS, sao 350
 * celulas na folha de agosto, e basta ele virar outra coisa para todo o
 * bloco de ferias cair em "codigo nao definido".
 */
function codigo_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return (v === Math.floor(v)) ? String(Math.floor(v)) : String(v);
  /*
   * Date aqui e quase sempre a planilha tendo lido "6.1" como data.
   * String(Date) daria "Mon Jun 01 2026..." e o codigo se perdia. Como
   * nao da para recuperar o original com seguranca, devolvemos vazio: a
   * celula e ignorada em vez de virar um codigo inventado.
   */
  if (v instanceof Date) return '';
  let s = String(v).trim().toUpperCase();
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  // "6,1" (virgula decimal) e o mesmo codigo que "6.1"
  if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  return s;
}

/*
 * O fuso estava fixo em 'America/Bahia' nestas quatro, enquanto o resto do
 * sistema passa por fuso() (que respeita TZ_OK e a planilha). Hoje os dois
 * valores coincidem, mas eram duas fontes de verdade para a mesma coisa —
 * e uma delas nao acompanharia um "Corrigir fuso".
 */
function ymd_(d) { return Utilities.formatDate(d, fuso(), 'yyyy-MM-dd'); }
function br_(d) { return Utilities.formatDate(d, fuso(), 'dd/MM/yyyy'); }
function eData_(v) { return (v instanceof Date) && !isNaN(v.getTime()); }
function agoraTextoDados_() { return Utilities.formatDate(new Date(), fuso(), 'yyyy-MM-dd HH:mm:ss'); }

/* ------------------------------------------------------------------ */
/* ATUALIZACAO DIARIA                                                  */
/*                                                                     */
/* A planilha da competencia ABERTA e atualizada pelo RH uma vez por    */
/* dia. Este gatilho reimporta essa competencia (so ela) de manha, para */
/* quem abrir o painel ja encontrar o numero do dia. O botao           */
/* "Atualizar agora" chama a mesma coisa, na hora.                      */
/* ------------------------------------------------------------------ */

function atualizarCompetenciaAberta() {
  const abertos = listar('ARQUIVOS_RH').filter(function (a) {
    return String(a.SITUACAO).toUpperCase().trim() === 'ABERTA';
  });
  if (!abertos.length) {
    return { ok: true, pulou: 'Nenhuma competência está marcada como Aberta.', feitas: [], erros: [] };
  }

  const quem = String(prop('EMAIL_ADMIN', 'sistema'));
  const feitas = [], erros = [];
  abertos.forEach(function (arq) {
    const comp = normalizarCompetenciaRH_(arq.COMPETENCIA);
    try {
      const r = importarArquivoRH_(arq, quem);
      feitas.push({ competencia: comp, registros: r.registros,
                    colaboradores: r.colaboradores, aviso: r.aviso || '' });
    } catch (e) {
      /*
       * O erro NÃO é mais engolido.
       *
       * Antes ele virava só uma linha no LOG e a função devolvia "ok"
       * com a lista vazia — a tela dizia "Dados atualizados:" sem nada
       * depois, e a pessoa via os mesmos números de antes sem nenhuma
       * pista do motivo. Era exatamente o que fazia o botão "Atualizar"
       * parecer não funcionar.
       */
      const msg = String(e.message || e);
      erros.push({ competencia: comp, erro: msg });
      registrarLog('sistema', 'ERRO', 'IMPORTACAO', comp, msg);
    }
  });
  limparCache();
  return { ok: erros.length === 0, feitas: feitas, erros: erros };
}

/** Botao "Atualizar agora": mesma rotina do gatilho, disparada por gente. */
function acaoAtualizarRH(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const r = atualizarCompetenciaAberta();

  if (r.pulou) throw new Error(r.pulou + ' Marque uma em Configuração › Fontes do RH.');

  if (r.erros.length) {
    // O erro vai para a tela, com o nome da competência e o motivo.
    throw new Error('Não consegui atualizar ' +
      r.erros.map(function (e) { return e.competencia + ': ' + e.erro; }).join(' · '));
  }

  const total = r.feitas.reduce(function (n, f) { return n + f.registros; }, 0);
  return {
    ok: true, feitas: r.feitas,
    aviso: r.feitas.map(function (f) {
      return f.competencia + ' — ' + f.registros + ' lançamentos, ' +
             f.colaboradores + ' pessoas' + (f.aviso ? ' · ' + f.aviso : '');
    }).join(' | ') || 'Nada a atualizar.',
    registros: total
  };
}

/* ------------------------------------------------------------------ */
/* DIAGNÓSTICO DA BASE                                                 */
/*                                                                     */
/* Responde "o que existe de verdade no banco agora?". Nasceu porque a  */
/* consulta por período mostrou 0 registros sem dizer por quê — e não   */
/* havia como saber, de fora, se a base estava vazia, com data em       */
/* formato errado, ou fora do intervalo pedido.                        */
/* ------------------------------------------------------------------ */

function acaoDiagnosticoRH(usuario) {
  exigirTela(usuario, 'assiduidade');

  const fato = listar('FATO_ASSIDUIDADE');
  const porComp = {};
  let comData = 0, semData = 0, tipoDate = 0, minIso = '', maxIso = '';

  fato.forEach(function (f) {
    const c = normalizarCompetenciaRH_(f.COMPETENCIA) || '(vazia)';
    if (!porComp[c]) porComp[c] = { linhas: 0, ausencias: 0, de: '', ate: '' };
    const g = porComp[c];
    g.linhas++;
    if (String(f.AUSENCIA) === 'Sim') g.ausencias++;
    if (f.DATA instanceof Date) tipoDate++;
    const iso = isoDaFato_(f.DATA);
    if (iso) {
      comData++;
      if (!g.de || iso < g.de) g.de = iso;
      if (!g.ate || iso > g.ate) g.ate = iso;
      if (!minIso || iso < minIso) minIso = iso;
      if (!maxIso || iso > maxIso) maxIso = iso;
    } else semData++;
  });

  const arquivos = listar('ARQUIVOS_RH').map(function (a) {
    const c = normalizarCompetenciaRH_(a.COMPETENCIA);
    return {
      competencia: c, situacao: String(a.SITUACAO || ''),
      ultimaImportacao: String(a.ULTIMA_IMPORTACAO || ''),
      linhasDeclaradas: Number(a.LINHAS) || 0,
      linhasNaBase: porComp[c] ? porComp[c].linhas : 0
    };
  });

  // Últimos erros de importação registrados no LOG.
  let erros = [];
  try {
    erros = listar('LOG', true).filter(function (l) {
      return String(l.ACAO) === 'ERRO' && String(l.TABELA) === 'IMPORTACAO';
    }).slice(-5).map(function (l) {
      return { quando: String(l.QUANDO || ''), competencia: String(l.REGISTRO || ''),
               erro: String(l.DETALHE || '') };
    });
  } catch (e) { erros = []; }

  return {
    totalLinhas: fato.length,
    comData: comData,
    // o cliente lê por este nome; `semData` fica como apelido antigo
    semDataValida: semData, semData: semData,
    celulasComoData: tipoDate,
    intervalo: { de: brDoIso_(minIso), ate: brDoIso_(maxIso), deIso: minIso, ateIso: maxIso },
    competencias: Object.keys(porComp).sort().map(function (c) {
      return { competencia: c, linhas: porComp[c].linhas, ausencias: porComp[c].ausencias,
               de: brDoIso_(porComp[c].de), ate: brDoIso_(porComp[c].ate) };
    }),
    arquivos: arquivos,
    agrColab: listar('AGR_COLAB').length,
    colaboradores: listar('COLABORADORES').length,
    ultimosErros: erros
  };
}



/* ==========================================================================
   GESTAO DOS ARQUIVOS DO RH E DO DE-PARA
   Estas funcoes existiam na versao anterior e sao chamadas pela tela de
   Configuracao. Ficaram de fora na reescrita — sem elas, cadastrar a
   competencia e editar o DE-PARA davam erro de "funcao nao existe".
   ========================================================================== */

/** Lista as competencias cadastradas, da mais recente para a mais antiga. */
function arquivosRH() {
  return listar('ARQUIVOS_RH').map(function (a) {
    return {
      id: a.ID,
      competencia: normalizarCompetenciaRH_(a.COMPETENCIA),
      link: String(a.LINK || '').trim(),
      aba: String(a.ABA || 'FOLHA DE PONTO').trim(),
      situacao: String(a.SITUACAO || 'Aberta').trim(),
      ultimaImportacao: String(a.ULTIMA_IMPORTACAO || ''),
      linhas: a.LINHAS || 0,
      observacao: String(a.OBSERVACAO || '')
    };
  }).sort(function (a, b) { return String(b.competencia).localeCompare(String(a.competencia)); });
}

/* A competencia do RH e "aaaa-mm". Se a celula virou Date, formata de volta. */
function normalizarCompetenciaRH_(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, fuso(), 'yyyy-MM');
  return String(valor || '').trim();
}

function acaoSalvarArquivoRH(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const campos = {
    COMPETENCIA: String(params.competencia || '').trim(),
    LINK: String(params.link || '').trim(),
    ABA: String(params.aba || 'FOLHA DE PONTO').trim(),
    SITUACAO: String(params.situacao || 'Aberta').trim(),
    OBSERVACAO: String(params.observacao || '').trim()
  };
  if (!campos.COMPETENCIA) throw new Error('Informe a competência (aaaa-mm).');
  if (!campos.LINK) throw new Error('Cole o link da planilha do RH.');

  return params.id
    ? atualizar('ARQUIVOS_RH', params.id, campos, usuario.email)
    : { ok: true, id: inserir('ARQUIVOS_RH', campos, usuario.email) };
}

function acaoExcluirArquivoRH(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  return excluir('ARQUIVOS_RH', params.id, usuario.email);
}

/** Codigos que apareceram na folha e ainda nao estao no DE-PARA. */
function acaoCodigosPendentes(usuario, params) {
  const mapa = lerDePara_();
  const vistos = {};
  listar('FATO_ASSIDUIDADE').forEach(function (l) {
    const c = String(l.CODIGO);
    if (ehNaoDefinido_(l.CATEGORIA) || !mapa[c]) vistos[c] = (vistos[c] || 0) + 1;
  });
  return Object.keys(vistos).sort().map(function (c) { return { codigo: c, vezes: vistos[c] }; });
}

function acaoSalvarDePara(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const campos = {
    CODIGO: codigo_(params.codigo),
    DESCRICAO: String(params.descricao || '').trim(),
    CATEGORIA: String(params.categoria || CAT_NAO_DEFINIDO).trim(),
    CONTA_COMO_AUSENCIA: params.ausencia ? 'SIM' : 'NAO'
  };
  if (!campos.CODIGO) throw new Error('Informe o código.');
  return params.id
    ? atualizar('DE_PARA', params.id, campos, usuario.email)
    : { ok: true, id: inserir('DE_PARA', campos, usuario.email) };
}

function acaoExcluirDePara(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  return excluir('DE_PARA', params.id, usuario.email);
}

/** Reclassifica a FATO inteira depois de mexer no DE-PARA. */
function acaoReclassificar(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const mapa = lerDePara_();
  const comps = {};
  listar('FATO_ASSIDUIDADE').forEach(function (l) {
    comps[normalizarCompetenciaRH_(l.COMPETENCIA)] = true;
  });

  const aba = abaDe('FATO_ASSIDUIDADE');
  if (aba.getLastRow() < 2) return { ok: true, linhas: 0 };

  const colunas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
    .map(function (c) { return String(c).trim().toUpperCase(); });
  const cCod = colunas.indexOf('CODIGO');
  const cCat = colunas.indexOf('CATEGORIA');
  const cAus = colunas.indexOf('AUSENCIA');
  if (cCod < 0 || cCat < 0 || cAus < 0) throw new Error('A aba FATO_ASSIDUIDADE está sem as colunas esperadas.');

  const faixa = aba.getRange(2, 1, aba.getLastRow() - 1, colunas.length);
  const valores = faixa.getValues();
  valores.forEach(function (l) {
    const t = traduz_(mapa, codigo_(l[cCod]));
    l[cCat] = t.cat;
    l[cAus] = t.aus ? 'Sim' : 'Não';
  });
  faixa.setValues(valores);
  esquecerLeituras();

  // Recalcula o painel de cada competencia afetada
  Object.keys(comps).forEach(function (c) {
    const arq = listar('ARQUIVOS_RH').filter(function (a) {
      return normalizarCompetenciaRH_(a.COMPETENCIA) === c;
    })[0];
    if (arq) {
      try { importarArquivoRH_(arq, usuario.email); } catch (e) { /* segue */ }
    }
  });

  return { ok: true, linhas: valores.length, competencias: Object.keys(comps).length };
}
