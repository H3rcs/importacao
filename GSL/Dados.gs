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
 *
 * AUDITORIA DE SETEMBRO/2026 — o que mudou e onde esta explicado:
 *   - Periodo sem VER_INDIVIDUAL nao leva nome, matricula nem data de
 *     ninguem no JSON (acaoPeriodo).
 *   - A FATO nao e mais lida inteira, apagada e reescrita a cada importacao:
 *     o bloco novo entra no fim e SO DEPOIS o antigo sai, tudo sob a trava
 *     do script (substituirLote_, importarArquivoRH_).
 *   - Competencia validada (aaaa-mm, sem duplicata); renomear leva os dados
 *     junto, excluir tira da base; rotulo sem cadastro nao entra em conta
 *     nenhuma (acaoSalvarArquivoRH, competenciasCadastradas_).
 *   - Uma pessoa, um dia, uma conta — no Periodo e na ficha (prevalece_).
 *   - Painel velho e Reclassificar refazem os numeros a partir da FATO, sem
 *     depender da planilha do RH (recalcularDaFato_).
 *   - Agregado por (matricula, turno): quem muda de turno conta em cada um.
 *   - Linhas da folha deixadas de fora viram aviso (extrair_).
 *   - Mes novo ainda vazio nao derruba a tela (dadosAssiduidade).
 *   - Escopo decidido num lugar so (turnoDaAssiduidade_).
 *   - Licenca que ja e ausencia conta uma vez (calcularAgregado_).
 *   - Meta lida na montagem, aceitando virgula (metaAbsenteismo_).
 *   - Previa so acusa blocos divergentes quando divergem (detectar_).
 */

const DOW_ = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/*
 * Quanto esperar pela trava do script (ms). A trava e UMA so para o sistema
 * inteiro — calendario, estoque, limpeza, tudo. Por isso a importacao so a
 * segura durante a GRAVACAO: ler a planilha do RH fica do lado de fora.
 */
const ESPERA_TRAVA_RH = 30000;
/* Na abertura da tela a espera e menor: melhor dizer "tente de novo" do que
   prender a pessoa meio minuto diante de um "Carregando". */
const ESPERA_TRAVA_TELA = 10000;

/* O mes do RH comeca no dia 21: a competencia 2026-08 vai de 21/07 a 20/08. */
const DIA_INICIO_COMPETENCIA = 21;

/* ==========================================================================
   TELA PRINCIPAL
   ========================================================================== */

function dadosAssiduidade(usuario, params) {
  exigirTela(usuario, 'assiduidade');

  const arquivos = arquivosOrdenados_();
  if (!arquivos.length) return { semRH: true };

  /*
   * Competencia escolhida no seletor: e ela, com ou sem dados — foi a pessoa
   * que pediu. Os dois lados da comparacao passam pela mesma normalizacao,
   * porque '2026-08' pode ter virado Date numa planilha antiga.
   */
  const pedida = normalizarCompetenciaRH_(params && params.competencia);
  const escolhida = pedida
    ? arquivos.filter(function (a) { return compDe_(a) === pedida; })[0]
    : null;
  if (escolhida) {
    const r = garantirPainel_(escolhida, usuario);
    return r.painel
      ? montarPainel_(usuario, arquivos, escolhida, compDe_(escolhida), r.painel, '')
      : semDados_(usuario, arquivos, escolhida, compDe_(escolhida), r.erro);
  }

  /*
   * SEM ESCOLHA: a competencia ABERTA mais recente (e a que o RH ainda
   * atualiza); sem nenhuma aberta, a mais recente de todas.
   *
   * MES NOVO AINDA VAZIO. No dia 21 alguem cadastra a competencia nova como
   * Aberta, mas a folha do RH ainda nao tem nenhum dia lancado. Antes a tela
   * inteira virava "Importacao pendente", sem seletor: quem nao era gestor
   * ficava sem ver nem o mes anterior ate o RH lancar o primeiro dia. Agora
   * a tela cai na competencia mais recente que tem painel e diz por que.
   */
  const preferida = arquivos.filter(ehAberta_)[0] || arquivos[0];
  const r = garantirPainel_(preferida, usuario);
  if (r.painel) return montarPainel_(usuario, arquivos, preferida, compDe_(preferida), r.painel, '');

  const reserva = competenciaMaisRecenteComPainel_(arquivos, preferida, usuario);
  if (reserva) {
    const aviso = 'A competência ' + compBR_(compDe_(preferida)) + ' (' +
      String(preferida.SITUACAO || '').toLowerCase() + ') ainda não tem dados' +
      (r.erro ? ' — ' + r.erro : '.') +
      ' Mostrando ' + compBR_(compDe_(reserva.arq)) + ', a mais recente com lançamentos.';
    return montarPainel_(usuario, arquivos, reserva.arq, compDe_(reserva.arq), reserva.painel, aviso);
  }
  return semDados_(usuario, arquivos, preferida, compDe_(preferida), r.erro);
}

/*
 * Garante o painel de uma competencia: o gravado, se for da versao atual;
 * senao, refaz a partir da FATO; so importa da planilha do RH quando a
 * competencia ainda nao tem nada na base. Devolve { painel: linha | null, erro }.
 *
 * Por que a FATO primeiro: um painel "velho" (gravado por uma versao
 * anterior do calculo) era jogado fora e a tela tentava REIMPORTAR a folha.
 * Mes fechado costuma ter a folha arquivada pelo RH — a reimportacao falhava
 * e a competencia inteira sumia da tela ("sem dados"), com milhares de
 * linhas dela na FATO. Os lancamentos ja estao na base; o painel sai deles.
 */
function garantirPainel_(arq, usuario) {
  const comp = compDe_(arq);
  const gravado = painelDaCompetencia_(comp);
  if (gravado && painelAtual_(lerPayload_(gravado))) return { painel: gravado, erro: '' };

  // Mes novo com a folha ainda vazia: cada montagem da tela tomava a trava
  // do sistema e reabria a planilha do RH so para ouvir "nenhum lancamento".
  if (!gravado && folhaVaziaRecente_(comp)) {
    return { painel: null, erro: 'A folha do RH desta competência ainda não tem lançamentos.' };
  }

  try {
    if (recalcularDaFato_(comp, usuario.email, ESPERA_TRAVA_TELA)) {
      const p = painelDaCompetencia_(comp);
      if (p) return { painel: p, erro: '' };
    }
  } catch (e) {
    // Falhou refazer o que existe (trava ocupada, por exemplo): reimportar
    // por cima so pioraria. Havendo painel de versao anterior, ele serve —
    // melhor que a tela de "importacao pendente" com o mes cheio de dados.
    if (gravado) return { painel: gravado, erro: '' };
    return { painel: null, erro: String(e.message || e) };
  }

  try {
    importarArquivoRH_(arq, usuario.email, ESPERA_TRAVA_TELA);
    const p = painelDaCompetencia_(comp);
    return { painel: p || null, erro: '' };
  } catch (e2) {
    return { painel: null, erro: String(e2.message || e2) };
  }
}

/*
 * FOLHA VAZIA — o mes novo do RH (dia 21 em diante) nasce sem lancamento.
 * A marca vive 30 minutos no cache (por filial) e cai na primeira
 * importacao que achar lancamento.
 */
function marcarFolhaVazia_(comp, vazia) {
  try {
    const cache = CacheService.getScriptCache();
    const chave = chaveNoEspaco('rh_vazia_' + comp);
    if (vazia) cache.put(chave, '1', 1800); else cache.remove(chave);
  } catch (e) { /* a marca e so para poupar trabalho */ }
}
function folhaVaziaRecente_(comp) {
  try { return !!CacheService.getScriptCache().get(chaveNoEspaco('rh_vazia_' + comp)); }
  catch (e) { return false; }
}

/* A competencia mais recente (fora `exceto`) que tem painel — atual ou refeito da FATO. */
function competenciaMaisRecenteComPainel_(arquivos, exceto, usuario) {
  for (let i = 0; i < arquivos.length; i++) {
    const a = arquivos[i];
    if (a === exceto) continue;
    const comp = compDe_(a);
    const p = painelDaCompetencia_(comp);
    if (!p) continue;                         // nunca importada: nao e hora de importar
    if (painelAtual_(lerPayload_(p))) return { arq: a, painel: p };
    try {
      if (recalcularDaFato_(comp, usuario.email, ESPERA_TRAVA_TELA)) {
        const novo = painelDaCompetencia_(comp);
        if (novo) return { arq: a, painel: novo };
      }
    } catch (e) {
      return { arq: a, painel: p };           // trava ocupada: o painel anterior serve
    }
  }
  return null;
}

/*
 * VERSÃO DO PAINEL.
 *
 * O painel de cada competência fica gravado pronto na aba PAINEL. Quando
 * o cálculo muda, o painel gravado pela versão anterior continua sendo
 * servido, e a tela mostra números de outra época sem nada indicar.
 * Com o carimbo de versão, um painel velho é refeito sozinho (a partir da
 * FATO) na primeira abertura.
 *
 * 4: agregado por (matrícula, turno) e licença que já é ausência contada
 *    uma vez só.
 * 5: (4.2.2) 'Ignorar' fora das contas também depois do Reclassificar e um
 *    lançamento por pessoa e dia.
 */
const VERSAO_PAINEL = 5;

function painelAtual_(payload) {
  // Painel sem carimbo e de uma versao anterior a esta: refaz. Refazer
  // custa uma leitura da FATO; mostrar numero de outra regra custa confianca.
  return !!payload && Number(payload.versao) === VERSAO_PAINEL;
}

function lerPayload_(linha) {
  try { return JSON.parse(linha.PAYLOAD); } catch (e) { return null; }
}

/* A linha da aba PAINEL de uma competencia (a primeira, se houver mais de uma). */
function painelDaCompetencia_(comp) {
  return listar('PAINEL').filter(function (p) {
    return normalizarCompetenciaRH_(p.COMPETENCIA) === comp;
  })[0] || null;
}

/* Resposta quando nao ha dados para a competencia. */
function semDados_(usuario, arquivos, arq, comp, erroImport) {
  return {
    semDados: true,
    competencia: comp,
    erroImport: erroImport || '',
    arquivo: { id: arq.ID, situacao: arq.SITUACAO },
    // O seletor tambem vai aqui: sem ele, a tela "sem dados" era um beco
    // sem saida — ninguem conseguia voltar ao mes anterior.
    competencias: listaDeCompetencias_(arquivos),
    podeGerir: podeFazer(usuario, 'PROGRAMAR')
  };
}

/* Monta o payload da tela a partir do PAINEL ja gravado. */
function montarPainel_(usuario, arquivos, arq, comp, painelLinha, aviso) {
  const payload = lerPayload_(painelLinha) || {};

  /*
   * META NA MONTAGEM. A meta ia junto no payload gravado na importacao:
   * trocar o parametro nao mudava o cartao (so a linha da tendencia, que ja
   * lia ao vivo) ate a proxima reimportacao — e mes fechado nunca mais era
   * reimportado. Agora a comparacao com a meta e feita aqui, na hora.
   */
  const meta = metaAbsenteismo_();
  const kpis = Object.assign({}, payload.kpis || {});
  kpis.meta = meta;
  kpis.acimaDaMeta = (Number(kpis.taxa) || 0) > meta;

  return {
    competencia: comp,
    aviso: aviso || '',
    arquivo: { id: arq.ID, situacao: arq.SITUACAO,
               ultimaImportacao: String(arq.ULTIMA_IMPORTACAO || '') },
    podeGerir: podeFazer(usuario, 'PROGRAMAR'),
    mostraIndividual: podeVerIndividual_(usuario),
    escopo: descreverEscopo(usuario),
    competencias: listaDeCompetencias_(arquivos),
    kpis: kpis,
    porTurno: payload.porTurno || [],
    porCategoria: payload.porCategoria || [],
    diaADia: payload.diaADia || [],
    porDiaSemana: payload.porDiaSemana || [],
    codigosTop: payload.codigosTop || [],
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

/*
 * ESCOPO DA ASSIDUIDADE — decidido num lugar so.
 *
 * Antes, KPIs, % por turno e dia a dia eram do CD inteiro, mas a tendencia,
 * a aba Colaboradores e o Periodo filtravam pelo turno do coordenador — e o
 * rotulo dizia "Todos os turnos". Na mesma tela, a mesma competencia
 * aparecia com 6,9% no cartao e 3,2% no grafico.
 *
 * A ESCOLHA: todo mundo que abre a Assiduidade ve os numeros AGREGADOS do
 * CD inteiro, que e o que o resto do sistema faz hoje (dentroDoEscopo e
 * descreverEscopo estao com o filtro por turno desligado "por ora"). O que
 * separa quem ve o que e o VER_INDIVIDUAL: sem ele, nenhum nome, matricula
 * ou data de ninguem sai do servidor. Agregado de turno nao identifica
 * pessoa; dado individual, sim — e esse continua fechado.
 *
 * Se o escopo por turno for religado, e aqui que muda — e o painel (hoje um
 * so, do CD) passara a precisar de uma versao por turno.
 */
function turnoDaAssiduidade_(usuario) {
  return null;
}

/**
 * Serie continua de absenteismo, uma linha por competencia importada.
 * Le do AGR_COLAB (que ja esta agregado), entao custa uma leitura de
 * tabela e atravessa todo o historico sem tocar na FATO.
 */
function tendenciaContinua_(usuario) {
  const turno = turnoDaAssiduidade_(usuario);
  const validas = competenciasCadastradas_();
  const porComp = {};
  lerAgr_().forEach(function (a) {
    const c = normalizarCompetenciaRH_(a.COMPETENCIA);
    // Rotulo sem cadastro (sobra de uma competencia renomeada ou excluida
    // por versao anterior) nao vira ponto da serie.
    if (!c || !validas[c]) return;
    if (turno && String(a.TURNO) !== turno) return;
    if (!porComp[c]) porComp[c] = { registros: 0, aus: 0, inj: 0, atest: 0, pessoas: {} };
    const s = porComp[c];
    s.registros += Number(a.REGISTROS) || 0;
    s.aus += Number(a.AUSENCIAS) || 0;
    s.inj += faltasInj_(a);
    s.atest += Number(a.ATESTADOS) || 0;
    // Pessoa, nao linha: quem mudou de turno tem uma linha por turno.
    s.pessoas[matChave_(a.MATRICULA)] = true;
  });

  const meta = metaAbsenteismo_();
  const serie = Object.keys(porComp).sort().map(function (c) {
    const s = porComp[c];
    return {
      competencia: c,
      taxa: s.registros ? Math.round((s.aus / s.registros) * 1000) / 10 : 0,
      pessoas: Object.keys(s.pessoas).length, registros: s.registros,
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
  const validas = competenciasCadastradas_();
  const vistos = {};
  lerAgr_().forEach(function (a) {
    if (!validas[normalizarCompetenciaRH_(a.COMPETENCIA)]) return;
    const t = String(a.TURNO || '').trim();
    if (t) vistos[t] = true;
  });
  return Object.keys(vistos).sort();
}

/*
 * META DE ABSENTEISMO, em pontos percentuais (5 = 5%).
 *
 * O parametro e texto livre na Configuracao. Quem digita "0,05" (virgula,
 * o jeito brasileiro) fazia Number() dar NaN: a meta sumia do cartao e
 * "acima da meta" ficava sempre falso — cartao verde com 17% de faltas.
 * Aceita "0,05", "0.05", "5", "5%". Abaixo de 1 e fracao (0,05 = 5%); de 1
 * para cima ja e porcentagem.
 */
function metaAbsenteismo_() {
  const bruto = String(parametro('META_ABSENTEISMO', '0.05') || '')
    .trim().replace('%', '').replace(',', '.');
  let n = Number(bruto);
  if (!isFinite(n) || n <= 0) return 5;
  if (n < 1) n = n * 100;
  return Math.round(n * 10) / 10;
}

/* ==========================================================================
   LEITURA DA BASE — o que os leitores enxergam
   ========================================================================== */

/* ARQUIVOS_RH da mais recente para a mais antiga. */
function arquivosOrdenados_() {
  return listar('ARQUIVOS_RH').slice().sort(function (a, b) {
    return compDe_(b).localeCompare(compDe_(a));
  });
}

function compDe_(arq) { return normalizarCompetenciaRH_(arq && arq.COMPETENCIA); }
function ehAberta_(arq) { return String(arq.SITUACAO || '').toUpperCase().trim() === 'ABERTA'; }

/* '2026-08' -> '08/2026' (para mensagens; a chave continua aaaa-mm). */
function compBR_(comp) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(comp || ''));
  return m ? m[2] + '/' + m[1] : String(comp || '');
}

function listaDeCompetencias_(arquivos) {
  return arquivos.map(function (a) {
    return { competencia: compDe_(a), situacao: a.SITUACAO };
  });
}

/*
 * As competencias CADASTRADAS em Configuracao. Os leitores (tendencia,
 * Colaboradores, Periodo, ficha) so contam linhas destes rotulos: linha
 * com rotulo sem cadastro e sobra de uma competencia renomeada ou excluida
 * por versao anterior, e fazia o Periodo contar em dobro e a tendencia
 * ganhar um ponto fantasma. O Diagnostico da base lista essas sobras e o
 * botao "Limpar sobras" as tira de vez (acaoLimparOrfasRH).
 */
function competenciasCadastradas_() {
  const s = {};
  listar('ARQUIVOS_RH').forEach(function (a) {
    const c = compDe_(a);
    if (c) s[c] = true;
  });
  return s;
}

function faltasInj_(a) {
  return Number(a.FALTAS_INJ !== undefined && a.FALTAS_INJ !== '' ? a.FALTAS_INJ : a.FALTAS) || 0;
}

/* Entre duas gravacoes do mesmo dado, a mais nova (CRIADO_EM, depois a linha). */
function maisNovaGravacao_(a, b) {
  const ta = String(a.CRIADO_EM || ''), tb = String(b.CRIADO_EM || '');
  if (ta !== tb) return ta > tb;
  return (Number(a._linha) || 0) > (Number(b._linha) || 0);
}

/*
 * AGR_COLAB como os leitores devem ve-lo: uma linha por (competencia,
 * matricula, turno). Se uma gravacao foi interrompida entre "entra o bloco
 * novo" e "sai o antigo" (ver substituirLote_), as duas copias convivem ate
 * a proxima importacao — aqui fica so a mais nova, para nenhuma conta dobrar.
 */
function lerAgr_() {
  const melhor = {}, ordem = [];
  listar('AGR_COLAB').forEach(function (a) {
    const k = normalizarCompetenciaRH_(a.COMPETENCIA) + '|' + matChave_(a.MATRICULA) + '|' + String(a.TURNO || '');
    if (!melhor[k]) { melhor[k] = a; ordem.push(k); return; }
    if (maisNovaGravacao_(a, melhor[k])) melhor[k] = a;
  });
  return ordem.map(function (k) { return melhor[k]; });
}

/*
 * UMA PESSOA, UM DIA, UMA CONTA.
 *
 * A mesma data pode estar em duas competencias (folhas que se sobrepoem, ou
 * uma importacao interrompida no meio). O Periodo nao tratava isso e contava
 * a mesma falta duas vezes; a ficha deduplicava por data+codigo, entao duas
 * versoes diferentes do mesmo dia (falta numa folha, atestado na outra)
 * apareciam as duas. Agora os dois usam esta regra:
 *   1. vale a competencia DONA do dia pela regra do RH (21 -> 20): 25/08 e
 *      da 2026-09, 18/08 e da 2026-08;
 *   2. se nenhuma for a dona, vale a de rotulo mais recente;
 *   3. mesma competencia duas vezes: vale a gravacao mais nova (na mesma
 *      gravacao, o lancamento de maior peso — ver pesoDoDia_).
 * Devolve true se `a` prevalece sobre `b`.
 */
function prevalece_(a, b) {
  const ca = normalizarCompetenciaRH_(a.COMPETENCIA), cb = normalizarCompetenciaRH_(b.COMPETENCIA);
  if (ca !== cb) {
    const dono = competenciaDoDia_(a._iso || isoDaFato_(a.DATA));
    if (ca === dono) return true;
    if (cb === dono) return false;
    return ca > cb;
  }
  // Mesma gravacao (a pessoa em dois blocos da mesma folha): a linha de
  // baixo ganhava sempre, mesmo sendo "Transferencia" contra uma falta de
  // verdade — e a falta sumia do Periodo e da ficha. Vale o peso do dia.
  if (String(a.CRIADO_EM || '') === String(b.CRIADO_EM || '')) {
    const pa = pesoDoDia_(a), pb = pesoDoDia_(b);
    if (pa !== pb) return pa > pb;
  }
  return maisNovaGravacao_(a, b);
}

/* 'aaaa-mm-dd' -> competencia do RH que contem o dia (o mes vira no dia 21). */
function competenciaDoDia_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  let ano = +m[1], mes = +m[2];
  if (+m[3] >= DIA_INICIO_COMPETENCIA) { mes++; if (mes > 12) { mes = 1; ano++; } }
  return ano + '-' + (mes < 10 ? '0' : '') + mes;
}

/*
 * LEITURA SOB MEDIDA DA FATO.
 *
 * A FATO e a maior tabela do sistema (~10 mil linhas por competencia) e nao
 * cabe no cache. A ficha de UMA pessoa lia a aba inteira — 880 mil celulas
 * com seis meses de historico — para ficar com 31 linhas por mes. Aqui a
 * leitura e em dois tempos: primeiro SO a coluna que filtra (uma celula por
 * linha), depois so os trechos que interessam. `folga` junta trechos
 * proximos numa leitura so (menos idas ao Google); o que entrou so pela
 * folga e descartado na hora. `aoVarrer`, se vier, ve cada valor da coluna
 * uma vez (o Periodo usa para explicar um resultado zerado).
 */
function lerFatoOnde_(coluna, aceita, folga, aoVarrer) {
  const aba = abaDe('FATO_ASSIDUIDADE');
  const ultima = aba.getLastRow();
  const nCol = aba.getLastColumn();
  if (ultima < 2 || nCol < 1) return [];
  const colunas = aba.getRange(1, 1, 1, nCol).getValues()[0]
    .map(function (c) { return String(c).trim().toUpperCase(); });
  const idx = colunas.indexOf(coluna);
  if (idx < 0) throw new Error('A aba FATO_ASSIDUIDADE está sem a coluna ' + coluna + '.');

  const valores = aba.getRange(2, idx + 1, ultima - 1, 1).getValues();
  const alvo = [];
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i][0];
    if (aoVarrer) aoVarrer(v);
    if (aceita(v)) alvo.push(i + 2);
  }

  const saida = [];
  trechos_(alvo, folga).forEach(function (t) {
    const bloco = aba.getRange(t.ini, 1, t.n, nCol).getValues();
    for (let k = 0; k < bloco.length; k++) {
      const linha = bloco[k];
      if (!aceita(linha[idx])) continue;
      if (linha.every(function (c) { return c === '' || c === null; })) continue;
      const r = { _linha: t.ini + k };
      for (let j = 0; j < colunas.length; j++) if (colunas[j]) r[colunas[j]] = linha[j];
      if (marcado(r.EXCLUIDO)) continue;
      saida.push(r);
    }
  });
  return saida;
}

/* Algumas colunas da FATO inteira, uma leitura por coluna (sem montar objetos). */
function lerColunasFato_(nomes) {
  const saida = { linhas: 0 };
  nomes.forEach(function (n) { saida[n] = []; });
  const aba = abaDe('FATO_ASSIDUIDADE');
  const ultima = aba.getLastRow(), nCol = aba.getLastColumn();
  if (ultima < 2 || nCol < 1) return saida;
  const colunas = aba.getRange(1, 1, 1, nCol).getValues()[0]
    .map(function (c) { return String(c).trim().toUpperCase(); });
  saida.linhas = ultima - 1;
  nomes.forEach(function (n) {
    const i = colunas.indexOf(n);
    saida[n] = i < 0 ? [] : aba.getRange(2, i + 1, ultima - 1, 1).getValues().map(function (x) { return x[0]; });
  });
  return saida;
}

/* Numeros de linha (crescentes) -> trechos contiguos { ini, n }, juntando vaos de ate `folga` linhas. */
function trechos_(linhas, folga) {
  const saida = [];
  const f = Math.max(0, Number(folga) || 0);
  for (let i = 0; i < linhas.length; i++) {
    const n = linhas[i];
    const u = saida[saida.length - 1];
    if (u && n - (u.ini + u.n) <= f) u.n = n - u.ini + 1;
    else saida.push({ ini: n, n: 1 });
  }
  return saida;
}

/* ==========================================================================
   CONSULTAS — COLABORADORES E PERIODO
   ========================================================================== */

/**
 * Aba COLABORADORES da tela de Assiduidade.
 *
 * Le do AGR_COLAB, nao do payload do painel — ver a explicacao em
 * calcularAgregado_: a lista nao cabia na celula do painel e era por isso
 * que a aba nao carregava. Aqui ela vem sob demanda e traz junto os quadros
 * que a tela de Ranking mostrava (melhores, atencao, mais atestados, mais
 * faltas) — a tela separada deixou de existir porque isto aqui ja e a mesma
 * informacao.
 */
function acaoColaboradores(usuario, params) {
  exigirTela(usuario, 'assiduidade');
  /*
   * A porta (ACOES) ja exige VER_INDIVIDUAL. Esta e a segunda chave, para o
   * dia em que alguem chamar a funcao por outro caminho: tudo aqui e nome e
   * numero de pessoa.
   */
  if (!podeVerIndividual_(usuario)) {
    throw new Error('Seu nível de acesso vê apenas os números agregados.');
  }
  const comp = normalizarCompetenciaRH_(params && params.competencia);
  if (!comp) throw new Error('Competência não informada.');

  const minimo = Number(params && params.minimo) || 0;
  const escopoTurno = turnoDaAssiduidade_(usuario);
  const filtroTurno = String((params && params.turno) || '').trim();

  /*
   * PEDACOS: o AGR_COLAB tem uma linha por (matricula, turno). Quem mudou de
   * turno no meio do mes tem duas, e cada turno conta so os dias dele — o
   * filtro "turno B" traz a parte B de quem veio do A, e o quadro por turno
   * soma do jeito certo. A LISTA junta os pedacos: uma linha por pessoa.
   */
  const pedacos = lerAgr_().filter(function (a) {
    if (normalizarCompetenciaRH_(a.COMPETENCIA) !== comp) return false;
    if (escopoTurno && String(a.TURNO) !== escopoTurno) return false;
    if (filtroTurno && String(a.TURNO) !== filtroTurno) return false;
    return true;
  }).map(pedacoDoAgr_);
  const lista = somarPorPessoa_(pedacos);

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
    porTurno: resumoPorTurno_(pedacos)
  };
}

const CAMPOS_SOMA_ = ['registros', 'trabalhados', 'ausencias', 'faltas', 'faltasInjustificadas',
  'faltasJustificadas', 'faltasDisciplinares', 'atestados', 'ferias', 'folgas', 'licencas'];

/* Uma linha do AGR_COLAB como numeros. */
function pedacoDoAgr_(a) {
  return {
    matricula: matExibida_(a.MATRICULA), nome: String(a.NOME || ''), turno: String(a.TURNO || ''),
    registros: Number(a.REGISTROS) || 0,
    trabalhados: Number(a.TRABALHADOS) || 0,
    ausencias: Number(a.AUSENCIAS) || 0,
    faltas: Number(a.FALTAS) || 0,
    faltasInjustificadas: faltasInj_(a),
    faltasJustificadas: Number(a.FALTAS_JUST) || 0,
    faltasDisciplinares: Number(a.FALTAS_DISC) || 0,
    atestados: Number(a.ATESTADOS) || 0,
    ferias: Number(a.FERIAS) || 0,
    folgas: Number(a.FOLGAS) || 0,
    licencas: Number(a.LICENCAS) || 0
  };
}

/*
 * Junta os pedacos de cada pessoa. O turno mostrado e o de mais dias
 * primeiro ("A/B" = mais dias no A, depois no B); `turnos` traz a lista.
 * A assiduidade e recalculada da soma — media de porcentagens daria errado.
 */
function somarPorPessoa_(pedacos) {
  const porMat = {}, ordem = [];
  pedacos.forEach(function (p) {
    let s = porMat[p.matricula];
    if (!s) {
      s = porMat[p.matricula] = { matricula: p.matricula, nome: p.nome, partes: [] };
      CAMPOS_SOMA_.forEach(function (c) { s[c] = 0; });
      ordem.push(p.matricula);
    }
    if (!s.nome && p.nome) s.nome = p.nome;
    CAMPOS_SOMA_.forEach(function (c) { s[c] += p[c]; });
    s.partes.push({ turno: p.turno, registros: p.registros });
  });
  return ordem.map(function (m) {
    const s = porMat[m];
    s.partes.sort(function (a, b) { return b.registros - a.registros; });
    s.turnos = s.partes.map(function (x) { return x.turno; });
    s.turno = s.turnos.map(function (t) { return t || '—'; }).join('/');
    delete s.partes;
    s.assiduidade = s.registros ? Math.round(((s.registros - s.ausencias) / s.registros) * 1000) / 10 : 0;
    return s;
  });
}

/*
 * Quadro por turno a partir dos PEDACOS (matricula, turno). `pessoas` conta
 * gente, nao linhas: quem passou pelos turnos A e B conta nos dois quadros
 * e uma vez so no quadro do CD.
 */
function resumoPorTurno_(pedacos) {
  const t = {}, todos = {};
  pedacos.forEach(function (c) {
    const k = c.turno || 'Sem turno';
    if (!t[k]) t[k] = { turno: k, pessoas: 0, registros: 0, trabalhados: 0,
                        ausencias: 0, faltas: 0, atestados: 0, _mats: {} };
    const s = t[k];
    s._mats[c.matricula] = true;
    todos[c.matricula] = true;
    s.registros += c.registros; s.trabalhados += c.trabalhados;
    s.ausencias += c.ausencias; s.faltas += c.faltasInjustificadas; s.atestados += c.atestados;
  });
  const linhas = Object.keys(t).sort().map(function (k) {
    const s = t[k];
    s.pessoas = Object.keys(s._mats).length;
    delete s._mats;
    s.media = s.registros ? Math.round(((s.registros - s.ausencias) / s.registros) * 1000) / 10 : 0;
    return s;
  });
  const cd = linhas.reduce(function (acc, x) {
    acc.registros += x.registros; acc.trabalhados += x.trabalhados;
    acc.ausencias += x.ausencias; acc.faltas += x.faltas; acc.atestados += x.atestados;
    return acc;
  }, { turno: 'CD', pessoas: Object.keys(todos).length, registros: 0, trabalhados: 0, ausencias: 0, faltas: 0, atestados: 0 });
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
  const de = String((params && params.de) || '').slice(0, 10);
  const ate = String((params && params.ate) || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    throw new Error('Período inválido.');
  }
  if (de > ate) throw new Error('A data inicial é depois da data final.');

  const tipo = params.tipo || 'TODAS';
  const filtroTurno = String(params.turno || '').trim();
  const soAusencias = params.incluirPresenca ? false : true;

  const diasNoPeriodo = Math.round(
    (diaNumISO(ate) - diaNumISO(de))) + 1;

  /*
   * DADO INDIVIDUAL. A tela ja escondia a lista de quem nao tem
   * VER_INDIVIDUAL — mas escondia so na tela: nome, matricula e as datas
   * de ausencia de cada pessoa viajavam no JSON, a um F12 de distancia.
   * Agora a lista nem sai do servidor; os numeros agregados continuam.
   */
  const mostraIndividual = podeVerIndividual_(usuario);
  const escopoTurno = turnoDaAssiduidade_(usuario);
  const filtro = filtroDeTipo_(tipo);
  const validas = competenciasCadastradas_();

  /*
   * So a coluna DATA e varrida inteira; as linhas vem so dos trechos com
   * data no intervalo (folga 64: os dias de uma pessoa ficam juntos, entao
   * o trecho de uma competencia vira uma leitura so).
   */
  let varridos = 0, foraDoIntervalo = 0, semDataValida = 0;
  const noIntervalo = function (v) {
    const iso = isoDaFato_(v);
    return !!iso && iso >= de && iso <= ate;
  };
  const linhas = lerFatoOnde_('DATA', noIntervalo, 64, function (v) {
    if (v === '' || v === null) return;          // linha vazia nao e lancamento
    varridos++;
    const iso = isoDaFato_(v);
    if (!iso) semDataValida++;
    else if (iso < de || iso > ate) foraDoIntervalo++;
  });

  // Uma pessoa, um dia, uma conta — ver prevalece_.
  const vencedoras = {};
  linhas.forEach(function (f) {
    if (!validas[normalizarCompetenciaRH_(f.COMPETENCIA)]) return;
    f._iso = isoDaFato_(f.DATA);
    const chave = matChave_(f.MATRICULA) + '|' + f._iso;
    if (!vencedoras[chave] || prevalece_(f, vencedoras[chave])) vencedoras[chave] = f;
  });

  const colab = {};
  const porCategoria = {}, porCompetencia = {}, porTurno = {}, porDia = {};
  let registrosTotal = 0;

  Object.keys(vencedoras).sort().forEach(function (k) {
    const f = vencedoras[k];
    const iso = f._iso;
    const turno = String(f.TURNO || '');
    if (escopoTurno && turno !== escopoTurno) return;
    if (filtroTurno && turno !== filtroTurno) return;

    const cat = String(f.CATEGORIA || '');
    if (soAusencias && String(f.AUSENCIA) !== 'Sim') return;
    // Codigo fora da legenda nao entra na consulta nem nos graficos.
    if (ehNaoDefinido_(cat)) return;
    if (!passaNoTipo_(filtro, catN_(cat))) return;

    const mat = matChave_(f.MATRICULA);
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

  let lista = [];
  if (mostraIndividual) {
    const nomesMap = {};
    listar('COLABORADORES').forEach(function (c) { nomesMap[matChave_(c.MATRICULA)] = c.NOME; });
    lista = Object.keys(colab).map(function (mat) {
      const c = colab[mat];
      c.datas.sort();
      return {
        matricula: matExibida_(mat), nome: nomesMap[mat] || matExibida_(mat), turno: c.turno, registros: c.registros,
        primeira: brDoIso_(c.datas[0]),
        ultima: brDoIso_(c.datas[c.datas.length - 1]),
        datas: c.datas.map(function (dt) { return { data: brDoIso_(dt) }; }),
        barra: diasNoPeriodo ? Math.min(100, Math.round((c.registros / diasNoPeriodo) * 100)) : 0
      };
    }).sort(function (a, b) { return b.registros - a.registros; });
  }

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
    colaboradores: Object.keys(colab).length, registros: registrosTotal, diasNoPeriodo: diasNoPeriodo,
    porque: porque,
    escopo: descreverEscopo(usuario),
    de: brDoIso_(de), ate: brDoIso_(ate), tipo: tipo, turno: filtroTurno,
    mostraIndividual: mostraIndividual,
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
    lista: lista.slice(0, 60),
    mais: Math.max(0, lista.length - 60)
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
  const mat = matChave_((params && params.matricula) || '');
  if (!mat) throw new Error('Matrícula não informada.');
  const validas = competenciasCadastradas_();

  /*
   * Historico: os pedacos do AGR_COLAB somados por competencia. Quem mudou
   * de turno tem dois pedacos no mes, e a ficha mostra o mes inteiro.
   */
  const porComp = {};
  lerAgr_().forEach(function (a) {
    if (matChave_(a.MATRICULA) !== mat) return;
    const c = normalizarCompetenciaRH_(a.COMPETENCIA);
    if (!c || !validas[c]) return;
    (porComp[c] = porComp[c] || []).push(pedacoDoAgr_(a));
  });

  let nome = '', turno = '';
  const historico = Object.keys(porComp).sort().map(function (c) {
    const p = somarPorPessoa_(porComp[c])[0];
    nome = p.nome || nome;
    turno = p.turno || turno;
    /*
     * LICENCA QUE JA E AUSENCIA. O AGR_COLAB gravado por versao anterior
     * contava a licenca sem vencimento (codigos 00 e 29 — "Licenca legal"
     * que conta como ausencia) duas vezes: em AUSENCIAS e em LICENCAS. A
     * barra da ficha passava de 100% e os dias de ajuste sumiam. A sobra
     * negativa e exatamente essa dupla contagem: ela sai das licencas. O
     * calculo novo (calcularAgregado_) ja grava do jeito certo.
     */
    const sobra = p.registros - p.trabalhados - p.ausencias - p.ferias - p.folgas - p.licencas;
    const licencas = sobra < 0 ? Math.max(0, p.licencas + sobra) : p.licencas;
    return {
      competencia: c,
      // "Dias lanç." aparecia como "—": o campo não vinha no histórico.
      registros: p.registros, trabalhados: p.trabalhados, ausencias: p.ausencias,
      faltas: p.faltas,
      faltasInjustificadas: p.faltasInjustificadas,
      faltasJustificadas: p.faltasJustificadas,
      faltasDisciplinares: p.faltasDisciplinares,
      atestados: p.atestados,
      ferias: p.ferias, folgas: p.folgas, licencas: licencas,
      /*
       * O que sobra: ajuste de horas, abono, compensação — dias lançados
       * que não são presença nem ausência. Sem esta conta, a barra da
       * ficha não fechava com o total de dias lançados.
       */
      outros: Math.max(0, sobra),
      assiduidade: p.assiduidade
    };
  });

  // Nome e turno ATUAIS: o COLABORADORES e atualizado a cada importacao
  // com o turno do dia mais recente da pessoa.
  const cadastro = listar('COLABORADORES').filter(function (c) {
    return matChave_(c.MATRICULA) === mat;
  })[0];
  if (cadastro) {
    nome = String(cadastro.NOME || '') || nome;
    turno = String(cadastro.TURNO || '') || turno;
  }

  /*
   * A ficha mostra o historico inteiro da pessoa, atravessando todas as
   * planilhas ja importadas — isso e proposital. As linhas vem so desta
   * pessoa (leitura sob medida, nao a FATO inteira) e cada DIA conta uma vez
   * (prevalece_): antes a chave era data+codigo, e o mesmo dia com falta
   * numa folha e atestado na outra aparecia duas vezes.
   */
  const porDia = {};
  lerFatoOnde_('MATRICULA', function (v) { return matChave_(v) === mat; }, 0).forEach(function (f) {
    if (!validas[normalizarCompetenciaRH_(f.COMPETENCIA)]) return;
    f._iso = isoDaFato_(f.DATA);
    if (!f._iso) return;
    if (!porDia[f._iso] || prevalece_(f, porDia[f._iso])) porDia[f._iso] = f;
  });
  /*
   * FILTRO DE PERIODO (4.2.2): de/ate em ISO. Sem filtro, o historico inteiro.
   * A ficha e para consultar o status da pessoa — foco nas ausencias e nos
   * tipos de ausencia dentro do periodo escolhido.
   */
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(params.de || '')) ? String(params.de) : '';
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(params.ate || '')) ? String(params.ate) : '';
  const noPeriodo = function (iso) { return (!de || iso >= de) && (!ate || iso <= ate); };
  const diasNoPeriodo = Object.keys(porDia).filter(noPeriodo);
  const todas = diasNoPeriodo.map(function (k) { return porDia[k]; })
    .filter(function (f) { return String(f.AUSENCIA) === 'Sim' && !ehNaoDefinido_(f.CATEGORIA); })
    .sort(function (a, b) { return b._iso.localeCompare(a._iso); });

  // As familias que a gestao cobra, na ordem da legenda do RH.
  const familia = function (cat) {
    const c = catN_(cat);
    if (c === 'FALTA' || c === 'FALTA INJUSTIFICADA') return 'Falta injustificada';
    if (c === 'FALTA JUSTIFICADA') return 'Falta justificada';
    if (c === 'FALTA DISCIPLINAR') return 'Falta disciplinar';
    if (c === 'ATESTADO') return 'Atestado';
    if (c === 'LICENCA LEGAL') return 'Licença legal';
    return 'Outras ausências';
  };
  const ordemTipos = ['Falta injustificada', 'Falta justificada', 'Falta disciplinar', 'Atestado', 'Licença legal', 'Outras ausências'];
  const porTipo = {};
  ordemTipos.forEach(function (t) { porTipo[t] = 0; });
  todas.forEach(function (a) { porTipo[familia(a.CATEGORIA)]++; });
  const datasPeriodo = diasNoPeriodo.slice().sort();

  const mapaCodigos = lerDePara_();
  const ausencias = todas.slice(0, 500).map(function (a) {
    const t = traduz_(mapaCodigos, a.CODIGO);
    return {
      data: brDoIso_(a._iso), iso: a._iso,
      // A competencia vai junto: sem ela a lista parecia contradizer o
      // cabecalho (que resume um mes so).
      competencia: normalizarCompetenciaRH_(a.COMPETENCIA),
      codigo: a.CODIGO, descricao: t.desc, categoria: String(a.CATEGORIA || ''), tipo: familia(a.CATEGORIA)
    };
  });

  /* Quebra das ausências por categoria — o histórico inteiro, não só as 60 da lista. */
  const porCategoria = {};
  todas.forEach(function (a) {
    const c = String(a.CATEGORIA || '') || 'Sem categoria';
    porCategoria[c] = (porCategoria[c] || 0) + 1;
  });

  return {
    matricula: matExibida_(mat), nome: nome || matExibida_(mat), turno: turno,
    meta: metaAbsenteismo_(),
    historico: historico.filter(function (h) {
      // so as competencias que tocam o periodo
      return (!ate || h.competencia + '-01' <= ate) && (!de || h.competencia + '-31' >= de);
    }),
    ausencias: ausencias,
    totalAusencias: todas.length,
    periodo: {
      de: de, ate: ate, diasLancados: diasNoPeriodo.length, ausencias: todas.length,
      primeiroDia: datasPeriodo[0] || '', ultimoDia: datasPeriodo[datasPeriodo.length - 1] || '',
      porTipo: ordemTipos.map(function (t) { return { tipo: t, total: porTipo[t] }; })
    },
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
    erros: det.erros, avisos: det.avisos.slice(),
    linhaCabecalho: det.linCab >= 0 ? det.linCab + 1 : 'Não achada',
    colunasData: det.cols.length,
    registros: 0, pessoas: 0, porTurno: [], codigosPendentes: [], rejeitadas: [],
    primeiraData: det.cols.length ? br_(det.cols[0].data) : 'N/A',
    ultimaData: det.cols.length ? br_(det.cols[det.cols.length - 1].data) : 'N/A'
  };

  if (det.erros.length) return res;

  const ext = extrair_(folha.m, det, cfg, normalizarCompetenciaRH_(arq.COMPETENCIA));
  res.registros = ext.regs.length;
  res.pessoas = Object.keys(ext.nomes).length;
  // Linha deixada de fora vira aviso, com nome — antes ela sumia em silencio.
  res.rejeitadas = ext.rejeitadas.slice(0, 50);
  res.avisos = res.avisos.concat(avisosDeRejeitadas_(ext.rejeitadas));

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

/* As linhas que o extrair_ deixou de fora, em frases para a tela. */
function avisosDeRejeitadas_(rejeitadas) {
  const avisos = [];
  const quem = function (lista) {
    const nomes = lista.slice(0, 5).map(function (r) {
      return (r.nome || 'sem nome') + (r.valor ? ' (' + r.valor + ')' : '') + ' — linha ' + r.linha;
    });
    return nomes.join('; ') + (lista.length > 5 ? '; e mais ' + (lista.length - 5) : '');
  };
  const porTurno = rejeitadas.filter(function (r) { return r.motivo === 'turno'; });
  if (porTurno.length) {
    const rotulos = {};
    porTurno.forEach(function (r) { rotulos[r.valor] = true; });
    avisos.push(porTurno.length + ' linha(s) de colaborador ficaram de fora porque o turno não está ' +
      'na lista aceita (' + Object.keys(rotulos).map(function (t) { return '"' + t + '"'; }).join(', ') +
      '): ' + quem(porTurno) + '. Corrija o turno na folha ou acrescente-o em Configuração › ' +
      'Como a folha é lida (RH_TURNOS).');
  }
  const curtas = rejeitadas.filter(function (r) { return r.motivo === 'matricula'; });
  if (curtas.length) {
    avisos.push(curtas.length + ' linha(s) ficaram de fora porque a matrícula tem menos de ' +
      curtas[0].minimo + ' dígitos: ' + quem(curtas) + '. Se a coluna perdeu o zero à esquerda, ' +
      'formate-a como texto na folha do RH.');
  }
  const semMat = rejeitadas.filter(function (r) { return r.motivo === 'sem-matricula'; });
  if (semMat.length) {
    avisos.push(semMat.length + ' linha(s) com nome e lançamentos, mas sem matrícula, ficaram de fora: ' +
      quem(semMat) + '.');
  }
  return avisos;
}

function acaoImportarCompetencia(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const arq = obter('ARQUIVOS_RH', params.id);
  if (!arq) throw new Error('Arquivo não encontrado.');
  const r = importarArquivoRH_(arq, usuario.email);
  r.invalidarTudo = true;
  return r;
}

/*
 * O motor da importacao, separado da acao para o gatilho diario poder
 * chamar a mesma coisa sem inventar um usuario. Todos os caminhos passam
 * por aqui — gatilho, botao "Atualizar", botao "Importar" e a importacao
 * que a propria tela dispara — e portanto pela mesma trava.
 */
function importarArquivoRH_(arq, quem, espera) {
  /*
   * 1 · LER E CALCULAR, FORA DA TRAVA.
   *
   * A trava do script e uma so para o sistema inteiro. Segura-la enquanto a
   * planilha do RH e aberta e percorrida (segundos; as vezes dezenas) deixaria
   * quem salva qualquer coisa no calendario esperando. Nada aqui grava.
   */
  const cfg = cfgD_();
  const folha = abrirFolha_(arq.LINK, arq.ABA);
  const det = detectar_(folha.m, cfg);

  if (det.erros.length) throw new Error(det.erros[0]);

  // Toda gravacao usa a competencia NORMALIZADA. Se a celula da planilha
  // virou Date, gravar o valor cru espalhava objetos Date pela FATO e
  // pelo AGR_COLAB, e nada mais casava com o texto 'aaaa-mm'.
  const compArq = normalizarCompetenciaRH_(arq.COMPETENCIA);
  if (competenciaDigitada_(compArq) !== compArq) {
    throw new Error('A competência "' + compArq + '" não está no formato aaaa-mm (ex.: 2026-08). ' +
      'Corrija em Configuração › Fontes do RH antes de importar.');
  }

  const ext = extrair_(folha.m, det, cfg, compArq);
  if (!ext.regs.length) {
    // Tem gente com lancamento, mas todas as linhas foram recusadas (turno
    // fora de RH_TURNOS, matricula curta): isso e erro de verdade, com o
    // motivo — nao "folha ainda vazia".
    if ((ext.rejeitadas || []).some(function (r) { return r.celulas > 0; })) {
      throw new Error('Nenhum lançamento aproveitado da planilha do RH. ' +
        avisosDeRejeitadas_(ext.rejeitadas).join(' '));
    }
    // Folha ainda vazia (o mes do RH vira no dia 21): nao e falha de
    // importacao — ver marcarFolhaVazia_ e acaoAtualizarRH.
    marcarFolhaVazia_(compArq, true);
    const vazia = new Error('Nenhum lançamento encontrado na planilha do RH.');
    vazia.folhaVazia = true;
    throw vazia;
  }
  marcarFolhaVazia_(compArq, false);

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
   * UMA PESSOA, UM DIA, UM LANCAMENTO — ja na importacao (4.2.2).
   *
   * Quem muda de turno aparece em dois blocos da folha, e as vezes uma
   * linha ou uma coluna vem repetida. Cada celula virava uma linha da
   * FATO: o dia contava duas vezes no painel e no Colaboradores, e o
   * Periodo e a ficha escolhiam uma das duas pela posicao na folha. Fica o
   * lancamento de maior peso (ver pesoDoDia_) e a previa avisa quem foi.
   */
  const umPorDia = {}, repetidos = {};
  linhasFato.forEach(function (l) {
    const k = matChave_(l[3]) + '|' + l[0];
    const atual = umPorDia[k];
    if (!atual) { umPorDia[k] = l; return; }
    repetidos[l[3]] = true;
    if (pesoDoDia_({ AUSENCIA: l[7], CATEGORIA: l[6] }) > pesoDoDia_({ AUSENCIA: atual[7], CATEGORIA: atual[6] })) umPorDia[k] = l;
  });
  if (Object.keys(repetidos).length) {
    linhasFato.length = 0;
    Object.keys(umPorDia).forEach(function (k) { linhasFato.push(umPorDia[k]); });
  }

  // Agregados e payload do painel — calculados ja, fora da trava.
  const agr = calcularAgregado_(compArq, linhasFato, ext.nomes);

  const lp = Object.keys(pend);
  const rp = Object.keys(repetidos);
  const avisos = (lp.length ? ['Códigos fora da legenda: ' + lp.join(', ')] : [])
    .concat(rp.length ? ['Matrícula(s) com dois lançamentos no mesmo dia (ficou um): ' + rp.slice(0, 10).join(', ')] : [])
    .concat(avisosDeRejeitadas_(ext.rejeitadas));

  /*
   * 2 · GRAVAR, TUDO DENTRO DE UMA TRAVA.
   *
   * Antes nada travava a importacao inteira. Duas importacoes que se
   * cruzavam (o gatilho relendo agosto enquanto um gerente importava
   * setembro, ou a tela importando sozinha) liam a FATO, cada uma gravava
   * por cima da outra, e setembro voltava ao dado antigo na FATO enquanto o
   * PAINEL mostrava o novo — com as duas respondendo "ok".
   */
  return comTrava(function () {
    // A competencia pode ter sido renomeada ou excluida enquanto a folha era lida.
    const atual = obter('ARQUIVOS_RH', arq.ID);
    if (!atual || normalizarCompetenciaRH_(atual.COMPETENCIA) !== compArq) {
      throw new Error('A competência ' + compArq + ' foi alterada ou removida enquanto a folha ' +
        'era lida. Nada foi gravado — importe de novo.');
    }

    gravarColaboradores_(ext.nomes, quem);

    // Fato em lote — por nome de coluna, nao por posicao.
    const fato = substituirLote_('FATO_ASSIDUIDADE', compArq, linhasFato.map(function (l) {
      return { DATA: l[0], COMPETENCIA: l[1], DIA_SEMANA: l[2], MATRICULA: l[3],
               TURNO: l[4], CODIGO: l[5], CATEGORIA: l[6], AUSENCIA: l[7] };
    }), quem);
    substituirLote_('AGR_COLAB', compArq, agr.linhasColab, quem);
    gravarPainel_(compArq, agr.payload, quem);

    atualizar('ARQUIVOS_RH', arq.ID,
      { ULTIMA_IMPORTACAO: agoraTextoDados_(), LINHAS: linhasFato.length }, quem);

    /*
     * CONFERÊNCIA PÓS-GRAVAÇÃO.
     *
     * Antes a importação dizia "ok" pelo simples fato de não ter lançado
     * exceção. Agora ela confere, pela coluna COMPETENCIA, se a base ficou
     * com exatamente o que foi lido da folha.
     */
    if (fato.naBase !== linhasFato.length) {
      throw new Error('A gravação não confere: li ' + linhasFato.length +
        ' lançamento(s) da folha, mas a base ficou com ' + fato.naBase +
        ' na competência ' + compArq + '. Importe de novo.');
    }

    return {
      ok: true,
      competencia: compArq,
      registros: linhasFato.length,
      colaboradores: Object.keys(ext.nomes).length,
      aviso: avisos.join(' · ')
    };
  }, espera || ESPERA_TRAVA_RH);
}

/*
 * Colaboradores — DESEMPENHO.
 *
 * Era um inserir() ou atualizar() por pessoa dentro do laco. Com 200
 * colaboradores isso significava ~1.200 chamadas de servico so nesta
 * etapa. Agora: uma escrita para os novos, uma para os que mudaram, e quem
 * nao mudou nem e tocado. O turno gravado e o do dia MAIS RECENTE da pessoa
 * na folha (ver extrair_) — antes era o do ultimo bloco lido, que segue a
 * ordem dos turnos na folha, nao a do calendario.
 */
function gravarColaboradores_(nomes, quem) {
  const colabExistentes = {};
  listar('COLABORADORES').forEach(function (c) {
    colabExistentes[matChave_(c.MATRICULA)] = c;
  });

  const novosColab = [], mudancasColab = [];
  Object.keys(nomes).forEach(function (mat) {
    const d = nomes[mat];
    const atual = colabExistentes[matChave_(mat)];
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
}

/*
 * Grava o painel pronto de uma competencia (uma linha na aba PAINEL). Se
 * houver mais de uma — sobra de duas importacoes antigas que se cruzaram —
 * fica uma so.
 */
function gravarPainel_(comp, payload, quem) {
  return comTrava(function () {
    const texto = JSON.stringify(payload);
    const linhas = listar('PAINEL').filter(function (p) {
      return normalizarCompetenciaRH_(p.COMPETENCIA) === comp;
    });
    if (!linhas.length) {
      inserir('PAINEL', { COMPETENCIA: comp, GERADO_EM: agoraTextoDados_(), PAYLOAD: texto }, quem);
      return;
    }
    atualizar('PAINEL', linhas[0].ID, { GERADO_EM: agoraTextoDados_(), PAYLOAD: texto }, quem);
    for (let i = 1; i < linhas.length; i++) excluir('PAINEL', linhas[i].ID, quem);
  }, ESPERA_TRAVA_RH);
}

/*
 * REFAZ AGR_COLAB E PAINEL DE UMA COMPETENCIA A PARTIR DA FATO.
 *
 * Os lancamentos ja estao na base; nao ha por que reabrir a planilha do RH
 * para refazer as contas. Serve ao painel de versao antiga (dadosAssiduidade)
 * e ao Reclassificar — os dois antes reimportavam a folha e, se o RH tinha
 * arquivado a planilha do mes, falhavam: o painel sumia, ou o Reclassificar
 * dizia "ok" com a FATO reclassificada e o painel ainda com as categorias
 * velhas. Devolve null quando a competencia nao tem nada na FATO.
 */
function recalcularDaFato_(comp, quem, espera) {
  return comTrava(function () {
    const linhas = lerFatoOnde_('COMPETENCIA', function (v) {
      return normalizarCompetenciaRH_(v) === comp;
    }, 0);
    if (!linhas.length) return null;

    // Uma importacao interrompida pode ter deixado duas gravacoes do mesmo
    // dia: fica a mais nova, para o recalculo nao contar em dobro.
    const porDia = {};
    linhas.forEach(function (f) {
      f._iso = isoDaFato_(f.DATA);
      const k = matChave_(f.MATRICULA) + '|' + f._iso;
      if (!porDia[k] || prevalece_(f, porDia[k])) porDia[k] = f;
    });

    const linhasFato = Object.keys(porDia).sort().map(function (k) {
      const f = porDia[k];
      const dow = String(f.DIA_SEMANA || '') ||
        (f._iso ? DOW_[new Date(f._iso + 'T12:00:00').getDay()] : '');
      return [f._iso, comp, dow, String(f.MATRICULA), String(f.TURNO || ''),
              String(f.CODIGO), String(f.CATEGORIA || ''), String(f.AUSENCIA) === 'Sim' ? 'Sim' : 'Não'];
    });

    // Nome da epoca (AGR_COLAB da competencia); sem ele, o do cadastro.
    const nomes = {};
    listar('COLABORADORES').forEach(function (c) {
      nomes[matChave_(c.MATRICULA)] = { nome: String(c.NOME || '') };
    });
    listar('AGR_COLAB').forEach(function (a) {
      if (normalizarCompetenciaRH_(a.COMPETENCIA) !== comp) return;
      if (String(a.NOME || '')) nomes[matChave_(a.MATRICULA)] = { nome: String(a.NOME) };
    });

    const agr = calcularAgregado_(comp, linhasFato, nomes);
    substituirLote_('AGR_COLAB', comp, agr.linhasColab, quem);
    gravarPainel_(comp, agr.payload, quem);
    return { competencia: comp, registros: linhasFato.length };
  }, espera || ESPERA_TRAVA_RH);
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
   *                    sem o que o DE-PARA marca como "Ignorar". Codigo
   *                    fora da legenda E registro (celula preenchida): fica
   *                    fora dos graficos por categoria, mas conta no total.
   *   TAXA           = ausencias / registros           (nao trab+aus)
   *   TAXA DO TURNO  = ausencias do turno / registros do turno
   *   ASSIDUIDADE    = (registros - ausencias) / registros
   *
   * As tres familias de falta ficam separadas: no painel elas nunca se
   * somam num balde so (regra escrita no DE-PARA do proprio usuario).
   *
   * POR (MATRICULA, TURNO). Quem muda de turno no meio do mes aparece na
   * folha em dois blocos. Antes a pessoa inteira ficava no turno do PRIMEIRO
   * bloco: o turno B perdia os dias dela, o A ganhava, e o filtro "turno B"
   * nao a trazia. Agora cada pedaco vai para o turno em que o dia foi
   * trabalhado, e as contagens de PESSOAS contam gente, nao linhas.
   *
   * AUSENCIA CONTA UMA VEZ. Um dia que o DE-PARA marca como ausencia entra
   * so em "ausencias" — antes a "Licenca legal" que conta como ausencia
   * (00, 29) entrava tambem em "licencas", e a ficha somava o dia duas vezes.
   */
  let lanc = 0, aus = 0, faltaInj = 0, faltaJust = 0, faltaDisc = 0, atest = 0, ferias = 0;
  const porCat = {}, porCod = {}, porDia = {}, porDow = {}, pedacos = {};
  const pessoas = {}, pessoasFerias = {}, pessoasAus = {};

  linhasFato.forEach(function (l) {
    const data = l[0], mat = String(l[3]), turno = String(l[4] || ''), cod = l[5], cat = l[6];
    const ausencia = (l[7] === 'Sim');
    const catN = catN_(cat);
    // 'Ignorar' nao e lancamento. A importacao ja tirava essas linhas, mas o
    // Reclassificar so troca a categoria na FATO: sem esta linha, o codigo
    // recem-marcado como Ignorar continuava inflando registros e baixando a taxa.
    if (catN === 'IGNORAR') return;
    lanc++;

    porCat[cat] = (porCat[cat] || 0) + 1;
    porCod[cod] = porCod[cod] || { total: 0 };
    porCod[cod].total++;

    porDia[data] = porDia[data] || { total: 0, ausencias: 0 };
    porDia[data].total++;

    pessoas[mat] = true;
    const chave = mat + '|' + turno;
    if (!pedacos[chave]) {
      pedacos[chave] = { mat: mat, turno: turno, registros: 0, trab: 0, aus: 0,
                         inj: 0, just: 0, disc: 0, atest: 0,
                         ferias: 0, folga: 0, lic: 0, abono: 0, ajuste: 0 };
    }
    const c = pedacos[chave];
    c.registros++;

    if (ausencia) {
      aus++; c.aus++;
      pessoasAus[mat] = true;
      porDia[data].ausencias++;
      porDow[l[2]] = (porDow[l[2]] || 0) + 1;
      if (catN === 'FALTA INJUSTIFICADA' || catN === 'FALTA') { faltaInj++; c.inj++; }
      else if (catN === 'FALTA JUSTIFICADA') { faltaJust++; c.just++; }
      else if (catN === 'FALTA DISCIPLINAR') { faltaDisc++; c.disc++; }
      if (catN === 'ATESTADO') { atest++; c.atest++; }
    }
    else if (catN === 'PRESENCA') c.trab++;
    else if (catN === 'FERIAS') { c.ferias++; ferias++; pessoasFerias[mat] = true; }
    else if (catN === 'FOLGA') c.folga++;
    else if (catN === 'LICENCA LEGAL') c.lic++;
    else if (catN === 'ABONO') c.abono++;
    else if (catN === 'AJUSTE DE HORAS') c.ajuste++;
  });

  const taxaGlobal = lanc ? Math.round((aus / lanc) * 1000) / 10 : 0;
  // A meta vai no payload so por compatibilidade: a tela compara com a meta
  // do momento (montarPainel_), nao com a do dia da importacao.
  const meta = metaAbsenteismo_();

  const kpis = {
    colaboradores: Object.keys(pessoas).length,
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
    pessoasEmFerias: Object.keys(pessoasFerias).length,
    comAusencia: Object.keys(pessoasAus).length
  };

  const turnosStats = {};
  Object.keys(pedacos).forEach(function (k) {
    const p = pedacos[k];
    const t = p.turno || 'Sem turno';
    if (!turnosStats[t]) turnosStats[t] = { mats: {}, registros: 0, trab: 0, aus: 0, inj: 0, atest: 0 };
    const s = turnosStats[t];
    s.mats[p.mat] = true;
    s.registros += p.registros;
    s.trab += p.trab;
    s.aus += p.aus;
    s.inj += p.inj;
    s.atest += p.atest;
  });

  const arrTurno = Object.keys(turnosStats).sort().map(function (t) {
    const s = turnosStats[t];
    return {
      turno: t,
      // Denominador = registros do turno, igual ao painel da planilha.
      taxa: s.registros ? Math.round((s.aus / s.registros) * 1000) / 10 : 0,
      pessoas: Object.keys(s.mats).length, celulas: s.registros, registros: s.registros,
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
  }).sort(function (a, b) { return (dwOrdem[a.dia] || 9) - (dwOrdem[b.dia] || 9); });

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

  /*
   * Linhas do AGR_COLAB montadas POR NOME DE COLUNA, nao por posicao — uma
   * por (matricula, turno). Quem casa com o cabecalho real da aba e o
   * substituirLote_: acrescentar uma coluna no esquema nao desloca nada.
   */
  const linhasColab = Object.keys(pedacos).sort().map(function (k) {
    const c = pedacos[k];
    const assid = c.registros ? Math.round(((c.registros - c.aus) / c.registros) * 1000) / 10 : 0;
    return {
      COMPETENCIA: comp, MATRICULA: c.mat,
      NOME: (nomes[c.mat] || nomes[matChave_(c.mat)] || {}).nome || '(sem nome)',
      TURNO: c.turno,
      REGISTROS: c.registros, TRABALHADOS: c.trab, AUSENCIAS: c.aus,
      FALTAS: c.inj + c.just + c.disc,
      FALTAS_INJ: c.inj,
      FALTAS_JUST: c.just,
      FALTAS_DISC: c.disc,
      ATESTADOS: c.atest, FERIAS: c.ferias, FOLGAS: c.folga, LICENCAS: c.lic,
      // (registros - ausencias) / registros
      ASSIDUIDADE: assid + '%'
    };
  });

  /*
   * O PAYLOAD DO PAINEL NAO LEVA A LISTA DE COLABORADORES.
   *
   * Ele e gravado numa UNICA celula da aba PAINEL, e uma celula do Google
   * Sheets aceita no maximo 50.000 caracteres. Com 341 colaboradores o
   * payload dava 96.681. A lista ja existe inteira na tabela AGR_COLAB; a
   * aba Colaboradores le de la, sob demanda. O payload fica em ~5 KB.
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
 * Troca todas as linhas de UMA competência numa aba — SEM ARRISCAR AS OUTRAS.
 *
 * `registros` e uma lista de OBJETOS com as chaves iguais aos nomes das
 * colunas; quem manda na posicao e o cabecalho real da aba.
 *
 * HISTÓRICO. A 1ª versão apagava as linhas da competência (deleteRows) e
 * escrevia as novas embaixo: quebrava quando a aba só tinha aquela
 * competência ("Não é possível excluir todas as linhas não congeladas").
 * A 2ª lia a aba INTEIRA, limpava e reescrevia tudo: resolvia aquilo, mas
 * punha TODAS as competências em risco a cada importação. Se a execução
 * morresse entre o clearContent e o último bloco (fim dos 6 minutos,
 * "Service Spreadsheets timed out"), meses fechados sumiam — na auditoria,
 * uma falha no 2º bloco apagou 2.200 linhas de um mês fechado e o painel
 * dele continuou dizendo que estava tudo lá. E o custo crescia com o
 * histórico inteiro, a cada importação.
 *
 * AGORA, em três tempos, dentro da trava:
 *   1. lê SÓ a coluna COMPETENCIA, para achar o bloco antigo;
 *   2. grava o bloco NOVO depois da última linha — nada que existe é tocado;
 *   3. só então apaga o bloco antigo, de baixo para cima.
 * Se cair no passo 2, nenhuma outra competência foi tocada e o bloco antigo
 * continua lá: sobra no máximo uma cópia parcial da nova, que os leitores
 * ignoram (ficam com a gravação mais nova de cada dia — prevalece_ e
 * lerAgr_) e que a próxima importação limpa. O caso da 1ª versão não volta:
 * quando o bloco antigo sai, o novo já está embaixo dele. E só a competência
 * é escrita — o custo deixa de crescer com o histórico.
 */
function substituirLote_(abaNome, comp, registros, quem) {
  return comTrava(function () {
    let sh;
    try { sh = abaDe(abaNome); } catch (e) {
      throw new Error('A aba ' + abaNome + ' não existe no banco.');
    }

    const nCol = Math.max(1, sh.getLastColumn());
    const colunas = sh.getRange(1, 1, 1, nCol).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });
    const idxComp = colunas.indexOf('COMPETENCIA');
    if (idxComp < 0) throw new Error('A aba ' + abaNome + ' está sem a coluna COMPETENCIA.');

    /* monta as linhas novas ANTES de tocar no que está gravado */
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
      // velho do que esvaziar a competência por causa de uma leitura ruim.
      throw new Error('Nada a gravar em ' + abaNome + ' para a competência ' + comp +
                      '. A base anterior foi preservada.');
    }

    /* 1 · onde está o bloco antigo (uma célula por linha) */
    const antigas = linhasDaCompetencia_(sh, idxComp, comp);

    try {
      /* 2 · o bloco novo entra depois da última linha */
      const inicio = Math.max(2, sh.getLastRow() + 1);
      const fim = inicio + novas.length - 1;
      if (sh.getMaxRows() < fim) sh.insertRowsAfter(sh.getMaxRows(), fim - sh.getMaxRows());

      const chunk = 4000;
      for (let i = 0; i < novas.length; i += chunk) {
        const pedaco = novas.slice(i, i + chunk);
        const faixa = sh.getRange(inicio + i, 1, pedaco.length, nCol);
        /*
         * O FORMATO DE TEXTO VEM ANTES DO VALOR. Na ordem inversa o Sheets
         * já interpretou "2026-07-21" como data ao receber o valor; mudar o
         * formato depois só troca a aparência, e a leitura seguinte devolve
         * um objeto Date. Foi assim que a coluna DATA virou Date.
         */
        faixa.setNumberFormat('@');
        faixa.setValues(pedaco);
      }

      /* 3 · só agora sai o bloco antigo */
      apagarLinhas_(sh, antigas);
    } finally {
      /*
       * INVALIDAR O CACHE DA TABELA mesmo se algo falhou no meio: a aba
       * pode ter mudado. A tabela é guardada no CacheService entre
       * requisições sob a geração da tabela, que só avança aqui.
       */
      limparCache(abaNome);
    }

    // Conferência pela coluna: quantas linhas a competência tem agora.
    const naBase = linhasDaCompetencia_(sh, idxComp, comp).length;
    return { removidas: antigas.length, gravadas: novas.length, naBase: naBase };
  }, ESPERA_TRAVA_RH);
}

/* Numeros das linhas (>= 2) de uma competencia, lendo so a coluna COMPETENCIA. */
function linhasDaCompetencia_(sh, idxComp, comp) {
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const v = sh.getRange(2, idxComp + 1, ultima - 1, 1).getValues();
  const saida = [];
  for (let i = 0; i < v.length; i++) {
    if (normalizarCompetenciaRH_(v[i][0]) === comp) saida.push(i + 2);
  }
  return saida;
}

/*
 * Apaga linhas (numeros em ordem crescente), de baixo para cima — assim
 * apagar um trecho nao desloca os que ainda faltam.
 */
function apagarLinhas_(sh, linhas) {
  if (!linhas.length) return 0;
  /*
   * "Não é possível excluir todas as linhas não congeladas": o Google recusa
   * apagar TODAS as linhas abaixo do cabeçalho. Quando for o caso, abre uma
   * linha vazia no fim antes.
   */
  if (sh.getMaxRows() - 1 - linhas.length < 1) sh.insertRowsAfter(sh.getMaxRows(), 1);
  const t = trechos_(linhas, 0);
  for (let k = t.length - 1; k >= 0; k--) sh.deleteRows(t[k].ini, t[k].n);
  return linhas.length;
}

/*
 * Tira da base TUDO o que e de uma competencia: FATO, AGR_COLAB e PAINEL.
 * Usado ao excluir a competencia e para limpar sobras sem cadastro.
 */
function apagarCompetenciaDaBase_(comp, quem) {
  return comTrava(function () {
    let n = 0;
    ['FATO_ASSIDUIDADE', 'AGR_COLAB'].forEach(function (tab) {
      const sh = abaDe(tab);
      const idx = colunaDaAba_(sh, 'COMPETENCIA');
      if (idx < 0) return;
      const linhas = linhasDaCompetencia_(sh, idx, comp);
      if (!linhas.length) return;
      try { n += apagarLinhas_(sh, linhas); } finally { limparCache(tab); }
    });
    listar('PAINEL').filter(function (p) {
      return normalizarCompetenciaRH_(p.COMPETENCIA) === comp;
    }).forEach(function (p) { excluir('PAINEL', p.ID, quem); });
    return n;
  }, ESPERA_TRAVA_RH);
}

/*
 * RENOMEAR LEVA OS DADOS JUNTO. Antes, corrigir o rotulo de '2026-9' para
 * '2026-09' e reimportar deixava as 72 linhas antigas com '2026-9' para
 * sempre: o Periodo contava tudo em dobro e a tendencia ganhava um ponto
 * fantasma. Aqui as linhas mudam de rotulo no lugar (so a coluna
 * COMPETENCIA), sem precisar da planilha do RH. Sobra antiga com o rotulo
 * novo (de um cadastro excluido) sai antes, para nao misturar.
 */
function renomearCompetenciaNaBase_(de, para, quem) {
  return comTrava(function () {
    apagarCompetenciaDaBase_(para, quem);
    let n = 0;
    ['FATO_ASSIDUIDADE', 'AGR_COLAB'].forEach(function (tab) {
      const sh = abaDe(tab);
      const idx = colunaDaAba_(sh, 'COMPETENCIA');
      if (idx < 0) return;
      const linhas = linhasDaCompetencia_(sh, idx, de);
      if (!linhas.length) return;
      try {
        trechos_(linhas, 0).forEach(function (t) {
          const valores = [];
          for (let i = 0; i < t.n; i++) valores.push([para]);
          const faixa = sh.getRange(t.ini, idx + 1, t.n, 1);
          faixa.setNumberFormat('@');
          faixa.setValues(valores);
        });
        n += linhas.length;
      } finally { limparCache(tab); }
    });
    listar('PAINEL').filter(function (p) {
      return normalizarCompetenciaRH_(p.COMPETENCIA) === de;
    }).forEach(function (p) { atualizar('PAINEL', p.ID, { COMPETENCIA: para }, quem); });
    return n;
  }, ESPERA_TRAVA_RH);
}

/* Posicao (0-based) de uma coluna pelo cabecalho real da aba; -1 se nao houver. */
function colunaDaAba_(sh, nome) {
  const nCol = sh.getLastColumn();
  if (nCol < 1) return -1;
  return sh.getRange(1, 1, 1, nCol).getValues()[0]
    .map(function (c) { return String(c).trim().toUpperCase(); }).indexOf(nome);
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
exigirPorta_();
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

/* true quando alguma celula da linha e o cabecalho da matricula. */
function linhaDeCabecalho_(linha, nCol, cfg) {
  for (let c = 0; c < nCol; c++) {
    if (norm_((linha || [])[c]).indexOf(cfg.cabMat) > -1) return true;
  }
  return false;
}

/* Colunas e datas de uma grade, para comparar um bloco com o outro. */
function assinaturaDaGrade_(cols) {
  return cols.map(function (x) {
    return x.col + '@' + (x.data instanceof Date ? x.data.getTime() : String(x.data));
  }).join(',');
}

function detectar_(m, cfg) {
  const erros = [], avisos = [];
  const nLin = m.length;
  let nCol = 0;
  for (let i = 0; i < nLin; i++) nCol = Math.max(nCol, m[i].length);

  let linCab = -1;
  for (let r = 0; r < nLin && linCab < 0; r++) {
    if (linhaDeCabecalho_(m[r], nCol, cfg)) linCab = r;
  }
  if (linCab < 0) {
    return {
      erros: ['Não achei a linha de cabeçalho. (Procurei "' + cfg.cabMat + '")'],
      avisos: [], nLin: nLin, nCol: nCol, linCab: -1, cols: [], blocos: []
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
   *
   * AVISO FALSO. A conferencia procurava DATAS nos cabecalhos seguintes. No
   * formato que a folha passou a usar (numero do dia, nao data), nenhum
   * cabecalho tem data — entao TODO bloco extra era "divergente", a previa
   * dizia "6 deles com as datas em colunas diferentes" com a folha certinha,
   * e uma divergencia de verdade se perdia no meio do alarme de sempre.
   * Agora cada cabecalho e lido pelo mesmo colunasDeData_ do primeiro, e o
   * bloco e lido pelas colunas do PROPRIO cabecalho (extrair_ usa `blocos`):
   * se um turno vier com a grade deslocada, os dias caem no lugar certo.
   */
  const assinatura = assinaturaDaGrade_(cols);
  const blocos = [];
  let total = 1, divergente = 0;
  for (let r2 = linCab + 1; r2 < nLin; r2++) {
    if (!linhaDeCabecalho_(m[r2], nCol, cfg)) continue;
    total++;
    const g2 = colunasDeData_(m, r2, nCol);
    const legivel = g2.cols.length >= 7;
    blocos.push({ linha: r2, cols: legivel ? g2.cols : cols });
    if (!legivel || assinaturaDaGrade_(g2.cols) !== assinatura) divergente++;
  }
  if (total > 1) {
    avisos.push('A folha tem ' + total + ' blocos de cabeçalho (um por turno). ' +
      (divergente
        ? divergente + ' deles com os dias em colunas diferentes do primeiro — cada bloco foi ' +
          'lido pelas colunas do seu próprio cabeçalho; confira o resultado.'
        : 'Todos com o mesmo layout, então a leitura é confiável.'));
  }

  return {
    erros: erros, avisos: avisos, nLin: nLin, nCol: nCol, linCab: linCab,
    colMat: colMat, colNome: colNome, colTurno: colTurno, cols: cols, linIni: linCab + 1,
    blocos: blocos
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
  const ignoradas = [];
  const cols = melhor.map(function (d, i) {
    if (i > 0 && d.dia < anterior) {
      mes++;
      if (mes > 11) { mes = 0; ano++; }
    }
    anterior = d.dia;
    const dt = new Date(ano, mes, d.dia, 12, 0, 0);
    // Dia que nao existe no mes (a coluna "31" num mes de 30, que o modelo
    // fixo de 31 colunas traz): virava o dia 1 do mes seguinte, que ja tem
    // coluna propria — a mesma data duas vezes. A coluna e ignorada.
    if (dt.getDate() !== d.dia) { ignoradas.push(d.dia); return null; }
    /*
     * MEIO-DIA, não meia-noite. A data montada aqui atravessa o
     * Utilities.formatDate mais adiante; ancorada à meia-noite, qualquer
     * deslocamento de fuso (o do projeto, o da planilha, o horário de
     * verão) empurra o dia para trás e a folha inteira anda um dia. Ao
     * meio-dia sobram doze horas de folga para cada lado.
     */
    return { col: d.col, data: dt };
  }).filter(Boolean);

  const aviso = 'O cabeçalho da grade traz o número do dia, não a data. Montei o período a ' +
    'partir de “DATA INICIAL” (' + formatarData(inicio) + '): de ' +
    formatarData(cols[0].data) + ' a ' + formatarData(cols[cols.length - 1].data) + '. ' +
    (ignoradas.length ? 'Coluna(s) de dia que não existe(m) no mês, ignorada(s): ' + ignoradas.join(', ') + '. ' : '') +
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
  /*
   * LINHAS DEIXADAS DE FORA. Uma linha de colaborador com turno fora da
   * lista (RH_TURNOS), com matricula que perdeu digito (zero a esquerda que
   * a planilha comeu) ou sem matricula sumia do sistema inteiro, sem aviso:
   * a previa dizia "8 pessoas" e ninguem sabia da nona. Agora cada uma
   * volta com o motivo, o nome e a linha da folha.
   */
  const rejeitadas = [];
  const reMat = new RegExp('^\\d{' + cfg.digitos + ',}$');
  const ultimoDia = {};   // matricula -> { t, turno } do dia mais recente com lancamento

  const celulasPreenchidas = function (linha, cols) {
    let n = 0;
    for (let k = 0; k < cols.length; k++) if (codigo_(linha[cols[k].col])) n++;
    return n;
  };

  const blocos = det.blocos || [];
  let cols = det.cols, bi = 0;

  for (let r = det.linIni; r < det.nLin; r++) {
    // Cada bloco e lido pelas colunas do proprio cabecalho (ver detectar_).
    while (bi < blocos.length && blocos[bi].linha <= r) { cols = blocos[bi].cols; bi++; }

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

    const nomeLinha = det.colNome >= 0 ? String(linha[det.colNome] || '').trim() : '';
    const mat = codigo_(linha[det.colMat]);
    if (!reMat.test(mat)) {
      // So conta como rejeitada a linha que parece de gente: tem lancamento.
      if (/^\d+$/.test(mat)) {
        const n = celulasPreenchidas(linha, cols);
        if (n) rejeitadas.push({ motivo: 'matricula', valor: mat, nome: nomeLinha, linha: r + 1,
                                 celulas: n, minimo: cfg.digitos });
      } else if (!mat && nomeLinha && !linhaDeCabecalho_(linha, det.nCol, cfg)) {
        const n2 = celulasPreenchidas(linha, cols);
        if (n2) rejeitadas.push({ motivo: 'sem-matricula', valor: '', nome: nomeLinha, linha: r + 1, celulas: n2 });
      }
      continue;
    }

    const turno = det.colTurno >= 0 ? norm_(linha[det.colTurno]) : '';
    if (turno && cfg.turnos.indexOf(turno) < 0) {
      turnosFora[turno] = (turnosFora[turno] || 0) + 1;
      rejeitadas.push({ motivo: 'turno', valor: turno, nome: nomeLinha, linha: r + 1,
                        celulas: celulasPreenchidas(linha, cols) });
      continue;
    }

    porTurno[turno] = porTurno[turno] || { pessoas: 0, celulas: 0 };
    porTurno[turno].pessoas++;

    if (nomeLinha) nomes[mat] = { nome: nomeLinha, turno: turno };

    for (let k = 0; k < cols.length; k++) {
      const cod = codigo_(linha[cols[k].col]);
      if (!cod) continue;
      codigos[cod] = (codigos[cod] || 0) + 1;
      porTurno[turno].celulas++;
      regs.push({ data: cols[k].data, mat: mat, turno: turno, cod: cod, comp: comp });
      const t = cols[k].data instanceof Date ? cols[k].data.getTime() : 0;
      if (!ultimoDia[mat] || t >= ultimoDia[mat].t) ultimoDia[mat] = { t: t, turno: turno };
    }
  }

  // Turno do cadastro = o do dia mais recente (quem passou do A para o B e do B).
  Object.keys(nomes).forEach(function (mat) {
    if (ultimoDia[mat]) nomes[mat].turno = ultimoDia[mat].turno;
  });

  return { regs: regs, nomes: nomes, codigos: codigos, porTurno: porTurno,
           turnosFora: turnosFora, rejeitadas: rejeitadas };
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
 * MATRICULA — uma chave so (4.2.2). Versoes antigas gravaram a matricula
 * como NUMERO (12345) antes de a base virar texto; as novas gravam como
 * veio da folha ('012345'). Comparando o texto cru, a mesma pessoa virava
 * duas — e a mesma data aparecia duas vezes no Periodo, uma em cada linha.
 * Toda comparacao passa por matChave_ (sem zeros a esquerda); o que vai
 * para a tela passa por matExibida_ (completa com zeros ate
 * RH_DIGITOS_MATRICULA, como na folha do RH).
 */
function matChave_(v) { return codigo_(v).replace(/^0+(?=\d)/, ''); }

var _digitosMat = null;
function matExibida_(v) {
  const k = matChave_(v);
  if (!/^\d+$/.test(k)) return k;
  if (_digitosMat === null) _digitosMat = cfgD_().digitos;
  return k.length < _digitosMat ? ('0000000000' + k).slice(-_digitosMat) : k;
}

/*
 * Peso de um lancamento do dia, para quando a mesma pessoa tem dois no
 * mesmo dia (dois blocos de turno na folha, linha ou coluna repetida):
 * ausencia > categoria definida > Outros > fora da legenda.
 */
function pesoDoDia_(f) {
  const c = catN_(f.CATEGORIA);
  // Ignorar perde ate para o que esta fora da legenda: ele nem entra nas
  // contas, entao se vencesse o dia o dia de verdade sumia (Reclassificar).
  if (c === 'IGNORAR') return -1;
  if (String(f.AUSENCIA) === 'Sim') return 3;
  if (ehNaoDefinido_(c)) return 0;
  return c === 'OUTROS' ? 1 : 2;
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

/* Gatilho: relê a competencia aberta em cada filial com Assiduidade ligada. */
function atualizarCompetenciaAberta() {
  const r = emCadaFilial_('assiduidade', atualizarCompetenciaAbertaDaFilial_);
  if (r.length === 1) return r[0];
  const junto = { ok: true, feitas: [], erros: [], vazias: [] };
  r.forEach(function (x) {
    if (!x) return;
    junto.feitas = junto.feitas.concat(x.feitas || []);
    junto.erros = junto.erros.concat(x.erros || []);
    junto.vazias = junto.vazias.concat(x.vazias || []);
    if (x.ok === false) junto.ok = false;
  });
  return junto;
}

function atualizarCompetenciaAbertaDaFilial_() {
  const abertos = arquivosOrdenados_().filter(ehAberta_);
  if (!abertos.length) {
    return { ok: true, pulou: 'Nenhuma competência está marcada como Aberta.', feitas: [], erros: [] };
  }

  const quem = String(prop('EMAIL_ADMIN', 'sistema'));
  const feitas = [], erros = [], vazias = [];
  /*
   * LIMITE DE 6 MINUTOS. Cada competencia aberta e uma importacao inteira.
   * Esquecer meses antigos como "Aberta" (o cadastro nasce assim) fazia o
   * gatilho encadear importacoes ate ser morto no meio de uma. Passados
   * 4 minutos, as que faltam ficam para a proxima rodada, com aviso.
   */
  const inicio = Date.now();
  abertos.forEach(function (arq) {
    const comp = normalizarCompetenciaRH_(arq.COMPETENCIA);
    if (Date.now() - inicio > 240000) {
      erros.push({ competencia: comp, erro: 'Ficou para a próxima rodada: o tempo desta execução acabou. ' +
        'Marque como Fechada as competências que o RH não mexe mais.' });
      return;
    }
    try {
      const r = importarArquivoRH_(arq, quem);
      feitas.push({ competencia: comp, registros: r.registros,
                    colaboradores: r.colaboradores, aviso: r.aviso || '' });
    } catch (e) {
      // Mes novo com a folha ainda sem lancamento: nao e erro (todo mes, do
      // dia 21 ate o RH lancar o primeiro dia, o botao e o gatilho falhavam).
      if (e && e.folhaVazia) { vazias.push(comp); return; }
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
  return { ok: erros.length === 0, feitas: feitas, erros: erros, vazias: vazias };
}

/** Botao "Atualizar agora": mesma rotina do gatilho, disparada por gente. */
function acaoAtualizarRH(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const r = atualizarCompetenciaAberta();

  if (r.pulou) throw new Error(r.pulou + ' Marque uma em Configuração › Fontes do RH.');

  const erros = r.erros.map(function (e) { return e.competencia + ': ' + e.erro; }).join(' · ');
  // Nada foi atualizado: o erro vai para a tela, com a competência e o motivo.
  // Se alguma foi, ela aparece — antes um mes com erro escondia os que deram
  // certo e a tela nem recarregava.
  if (r.erros.length && !r.feitas.length) throw new Error('Não consegui atualizar ' + erros);

  const total = r.feitas.reduce(function (n, f) { return n + f.registros; }, 0);
  const partes = r.feitas.map(function (f) {
    return f.competencia + ' — ' + f.registros + ' lançamentos, ' +
           f.colaboradores + ' pessoas' + (f.aviso ? ' · ' + f.aviso : '');
  });
  if ((r.vazias || []).length) partes.push('ainda sem lançamentos na folha: ' + r.vazias.join(', '));
  if (r.erros.length) partes.push('NÃO atualizadas: ' + erros);
  return {
    ok: true, feitas: r.feitas, vazias: r.vazias || [], invalidarTudo: true,
    aviso: partes.join(' | ') || 'Nada a atualizar.',
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

  // So as tres colunas que a conta usa — a FATO inteira nao cabe em memoria barata.
  const col = lerColunasFato_(['DATA', 'COMPETENCIA', 'AUSENCIA']);
  const porComp = {};
  let total = 0, comData = 0, semData = 0, tipoDate = 0, minIso = '', maxIso = '';

  for (let i = 0; i < col.linhas; i++) {
    const dataV = col.DATA[i], compV = col.COMPETENCIA[i];
    if ((dataV === '' || dataV === null) && (compV === '' || compV === null)) continue;
    total++;
    const c = normalizarCompetenciaRH_(compV) || '(vazia)';
    if (!porComp[c]) porComp[c] = { linhas: 0, ausencias: 0, de: '', ate: '' };
    const g = porComp[c];
    g.linhas++;
    if (String(col.AUSENCIA[i]) === 'Sim') g.ausencias++;
    if (dataV instanceof Date) tipoDate++;
    const iso = isoDaFato_(dataV);
    if (iso) {
      comData++;
      if (!g.de || iso < g.de) g.de = iso;
      if (!g.ate || iso > g.ate) g.ate = iso;
      if (!minIso || iso < minIso) minIso = iso;
      if (!maxIso || iso > maxIso) maxIso = iso;
    } else semData++;
  }

  const validas = competenciasCadastradas_();
  const arquivos = arquivosOrdenados_().map(function (a) {
    const c = compDe_(a);
    return {
      competencia: c, situacao: String(a.SITUACAO || ''),
      ultimaImportacao: String(a.ULTIMA_IMPORTACAO || ''),
      linhasDeclaradas: Number(a.LINHAS) || 0,
      linhasNaBase: porComp[c] ? porComp[c].linhas : 0
    };
  });

  /*
   * SOBRAS: competencias que estao na base sem cadastro (renomeadas ou
   * excluidas por versao anterior). Nao entram em conta nenhuma; aqui elas
   * aparecem, e quem pode gerir tem o botao para tira-las.
   */
  const orfas = Object.keys(competenciasNaBase_(porComp)).filter(function (c) {
    return !validas[c];
  }).sort().map(function (c) {
    return { competencia: c, linhas: porComp[c] ? porComp[c].linhas : 0 };
  });

  return {
    totalLinhas: total,
    comData: comData,
    // o cliente lê por este nome; `semData` fica como apelido antigo
    semDataValida: semData, semData: semData,
    celulasComoData: tipoDate,
    intervalo: { de: brDoIso_(minIso), ate: brDoIso_(maxIso), deIso: minIso, ateIso: maxIso },
    competencias: Object.keys(porComp).sort().map(function (c) {
      return { competencia: c, linhas: porComp[c].linhas, ausencias: porComp[c].ausencias,
               de: brDoIso_(porComp[c].de), ate: brDoIso_(porComp[c].ate),
               semCadastro: !validas[c] };
    }),
    arquivos: arquivos,
    orfas: orfas,
    podeLimpar: podeFazer(usuario, 'PROGRAMAR'),
    agrColab: lerAgr_().length,
    colaboradores: listar('COLABORADORES').length,
    ultimosErros: ultimosErrosDeImportacao_()
  };
}

/* Os rotulos de competencia presentes na base (FATO, AGR_COLAB, PAINEL). */
function competenciasNaBase_(porCompFato) {
  const vistas = {};
  Object.keys(porCompFato || {}).forEach(function (c) { if (c && c !== '(vazia)') vistas[c] = true; });
  listar('AGR_COLAB').forEach(function (a) {
    const c = normalizarCompetenciaRH_(a.COMPETENCIA); if (c) vistas[c] = true;
  });
  listar('PAINEL').forEach(function (p) {
    const c = normalizarCompetenciaRH_(p.COMPETENCIA); if (c) vistas[c] = true;
  });
  return vistas;
}

/*
 * Ultimos erros de importacao do LOG. O LOG e do sistema inteiro e so
 * cresce; ler a aba toda para achar cinco linhas era o passo mais caro do
 * diagnostico. Le so o fim.
 */
function ultimosErrosDeImportacao_() {
  try {
    const aba = abaDe('LOG');
    const ultima = aba.getLastRow();
    if (ultima < 2) return [];
    const n = Math.min(2000, ultima - 1);
    // LOG: QUANDO, QUEM, ACAO, TABELA, REGISTRO, DETALHE — as seis colunas de registrarLog.
    return aba.getRange(ultima - n + 1, 1, n, 6).getValues().filter(function (l) {
      return String(l[2]) === 'ERRO' && String(l[3]) === 'IMPORTACAO';
    }).slice(-5).map(function (l) {
      return { quando: String(l[0] || ''), competencia: String(l[4] || ''), erro: String(l[5] || '') };
    });
  } catch (e) { return []; }
}

/* Tira da base as competencias sem cadastro (o botao do Diagnostico). */
function acaoLimparOrfasRH(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const validas = competenciasCadastradas_();
  const col = lerColunasFato_(['COMPETENCIA']);
  const naFato = {};
  col.COMPETENCIA.forEach(function (v) { const c = normalizarCompetenciaRH_(v); if (c) naFato[c] = true; });
  const orfas = Object.keys(competenciasNaBase_(naFato)).filter(function (c) { return !validas[c]; });
  let linhas = 0;
  orfas.forEach(function (c) { linhas += apagarCompetenciaDaBase_(c, usuario.email); });
  return {
    ok: true, competencias: orfas, linhas: linhas, invalidarTudo: true,
    recado: orfas.length
      ? 'Sobras removidas: ' + orfas.join(', ') + ' (' + linhas + ' linha(s)).'
      : 'Nenhuma sobra na base.'
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
    const c = normalizarCompetenciaRH_(a.COMPETENCIA);
    return {
      id: a.ID,
      competencia: c,
      // Rotulo fora do padrao aaaa-mm (cadastro antigo): a tela pede para corrigir.
      formatoOk: competenciaDigitada_(c) === c,
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

/*
 * O que a pessoa digitou no campo Competencia, no padrao aaaa-mm — ou ''
 * se nao der para entender. Aceita 2026-08, 2026-8, 08/2026 e 8/2026: o
 * rotulo e a CHAVE que liga a folha a tudo que se grava dela, e '2026-8'
 * ao lado de '2026-08' eram duas competencias diferentes para o sistema.
 */
function competenciaDigitada_(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, fuso(), 'yyyy-MM');
  const t = String(valor || '').trim();
  let ano, mes, m;
  if ((m = /^(\d{4})[-\/.](\d{1,2})$/.exec(t))) { ano = +m[1]; mes = +m[2]; }
  else if ((m = /^(\d{1,2})[-\/.](\d{4})$/.exec(t))) { ano = +m[2]; mes = +m[1]; }
  else return '';
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return '';
  return ano + '-' + (mes < 10 ? '0' : '') + mes;
}

function acaoSalvarArquivoRH(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const comp = competenciaDigitada_(params.competencia);
  if (!comp) {
    throw new Error('Competência inválida: "' + String(params.competencia || '') +
      '". Use o formato aaaa-mm (ex.: 2026-08).');
  }
  const campos = {
    COMPETENCIA: comp,
    LINK: String(params.link || '').trim(),
    ABA: String(params.aba || 'FOLHA DE PONTO').trim(),
    SITUACAO: String(params.situacao || 'Aberta').trim(),
    OBSERVACAO: String(params.observacao || '').trim()
  };
  if (!campos.LINK) throw new Error('Cole o link da planilha do RH.');

  // Conferir e gravar dentro da mesma trava: dois cadastros ao mesmo tempo
  // nao passam juntos pela checagem de duplicata.
  return comTrava(function () {
    const id = String(params.id || '');
    const repetida = listar('ARQUIVOS_RH').filter(function (a) {
      // Compara no formato aaaa-mm: um cadastro antigo '08/2025' e o mesmo
      // mes que '2025-08' (antes passava, e o mes aparecia duas vezes). So
      // aqui — normalizar em toda leitura "ressuscitava" sobras de meses
      // renomeados por versao antiga (ver acaoLimparOrfasRH).
      return String(a.ID) !== id && (competenciaDigitada_(compDe_(a)) || compDe_(a)) === comp;
    })[0];
    if (repetida) {
      throw new Error('A competência ' + comp + ' já está cadastrada. Edite a existente em vez de cadastrar outra.');
    }

    if (!id) return { ok: true, id: inserir('ARQUIVOS_RH', campos, usuario.email), invalidarTudo: true };

    const antes = obter('ARQUIVOS_RH', id);
    if (!antes) throw new Error('Competência não encontrada.');
    const compAntes = compDe_(antes);
    const r = atualizar('ARQUIVOS_RH', id, campos, usuario.email);
    r.invalidarTudo = true;
    if (compAntes && compAntes !== comp) {
      const n = renomearCompetenciaNaBase_(compAntes, comp, usuario.email);
      r.recado = 'Competência renomeada de ' + compAntes + ' para ' + comp +
        (n ? ' — ' + n + ' linha(s) já importadas foram junto.' : '.');
    }
    return r;
  }, ESPERA_TRAVA_RH);
}

function acaoExcluirArquivoRH(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  return comTrava(function () {
    const arq = obter('ARQUIVOS_RH', params.id);
    if (!arq) throw new Error('Competência não encontrada.');
    const comp = compDe_(arq);
    const r = excluir('ARQUIVOS_RH', params.id, usuario.email);
    r.invalidarTudo = true;
    /*
     * EXCLUIR TIRA DA BASE. Antes so a linha do cadastro saia: a FATO, o
     * AGR_COLAB e o PAINEL da competencia ficavam, e ela continuava na
     * tendencia e no Periodo sem aparecer no seletor. Se outro cadastro
     * (duplicata antiga) ainda usa o mesmo rotulo, os dados ficam.
     */
    const outro = listar('ARQUIVOS_RH').filter(function (a) { return compDe_(a) === comp; })[0];
    if (comp && !outro) {
      const n = apagarCompetenciaDaBase_(comp, usuario.email);
      r.recado = 'Competência ' + comp + ' removida' + (n ? ' — ' + n + ' linha(s) saíram da base.' : '.');
    }
    return r;
  }, ESPERA_TRAVA_RH);
}

/** Codigos que apareceram na folha e ainda nao estao no DE-PARA. */
function acaoCodigosPendentes(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const mapa = lerDePara_();
  const col = lerColunasFato_(['CODIGO', 'CATEGORIA']);
  const vistos = {}, jaNaLegenda = {};
  for (let i = 0; i < col.linhas; i++) {
    const c = String(col.CODIGO[i] == null ? '' : col.CODIGO[i]).trim();
    if (!c) continue;
    /*
     * Mesma procura da importacao (traduz_, com as variacoes "03"/"3",
     * "6,1"/"6.1"). A comparacao exata dava falso "pendente" para codigo
     * que a traducao encontra.
     */
    const foraAgora = ehNaoDefinido_(traduz_(mapa, c).cat);
    const foraNaBase = ehNaoDefinido_(col.CATEGORIA[i]);
    if (!foraAgora && !foraNaBase) continue;
    vistos[c] = (vistos[c] || 0) + 1;
    // Ja cadastrado, mas a base ainda tem a categoria antiga: falta Reclassificar.
    if (!foraAgora) jaNaLegenda[c] = true;
  }
  return Object.keys(vistos).sort().map(function (c) {
    return { codigo: c, vezes: vistos[c], jaNaLegenda: !!jaNaLegenda[c] };
  });
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
  return comTrava(function () {
    // Codigo repetido: a linha mais nova valia em silencio, e corrigir a
    // que aparece na tela nao mudava nada na importacao nem no Reclassificar.
    const outro = listar('DE_PARA').filter(function (l) {
      return codigo_(l.CODIGO) === campos.CODIGO && String(l.ID) !== String(params.id || '');
    })[0];
    if (outro) {
      throw new Error('O código ' + campos.CODIGO + ' já está no DE-PARA (' + String(outro.CATEGORIA || '—') +
        '). Edite a linha que já existe.');
    }
    return params.id
      ? atualizar('DE_PARA', params.id, campos, usuario.email)
      : { ok: true, id: inserir('DE_PARA', campos, usuario.email) };
  });
}

function acaoExcluirDePara(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  return excluir('DE_PARA', params.id, usuario.email);
}

/*
 * RECLASSIFICA A BASE depois de mexer no DE-PARA.
 *
 * Antes: reescrevia a FATO inteira (as 14 colunas) e depois REIMPORTAVA
 * cada competencia da planilha do RH, engolindo o erro de quem nao abria —
 * "ok, 2 competencias" com a FATO reclassificada e o painel de agosto ainda
 * nas categorias velhas, porque a folha de agosto tinha sido arquivada.
 * Agora:
 *   1. reaplica o DE-PARA so nas colunas CATEGORIA e AUSENCIA, no lugar;
 *   2. refaz AGR_COLAB e PAINEL de cada competencia A PARTIR DA FATO
 *      (recalcularDaFato_) — a planilha do RH nao e aberta;
 *   3. se alguma falhar, a resposta diz qual e por que.
 */
function acaoReclassificar(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const mapa = lerDePara_();
  const validas = competenciasCadastradas_();

  const passo1 = comTrava(function () {
    const aba = abaDe('FATO_ASSIDUIDADE');
    const ultima = aba.getLastRow();
    if (ultima < 2) return { linhas: 0, comps: [] };
    const colunas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });
    const cCod = colunas.indexOf('CODIGO');
    const cCat = colunas.indexOf('CATEGORIA');
    const cAus = colunas.indexOf('AUSENCIA');
    const cComp = colunas.indexOf('COMPETENCIA');
    if (cCod < 0 || cCat < 0 || cAus < 0 || cComp < 0) {
      throw new Error('A aba FATO_ASSIDUIDADE está sem as colunas esperadas.');
    }
    const n = ultima - 1;
    const cods = aba.getRange(2, cCod + 1, n, 1).getValues();
    const comps = aba.getRange(2, cComp + 1, n, 1).getValues();
    const cats = aba.getRange(2, cCat + 1, n, 1).getValues();
    const auss = aba.getRange(2, cAus + 1, n, 1).getValues();
    const vistas = {};
    for (let i = 0; i < n; i++) {
      const cod = codigo_(cods[i][0]);
      if (!cod && (comps[i][0] === '' || comps[i][0] === null)) continue;   // linha vazia fica vazia
      const t = traduz_(mapa, cod);
      cats[i][0] = t.cat;
      auss[i][0] = t.aus ? 'Sim' : 'Não';
      const c = normalizarCompetenciaRH_(comps[i][0]);
      if (validas[c]) vistas[c] = true;
    }
    try {
      aba.getRange(2, cCat + 1, n, 1).setValues(cats);
      aba.getRange(2, cAus + 1, n, 1).setValues(auss);
    } finally {
      limparCache('FATO_ASSIDUIDADE');
    }
    return { linhas: n, comps: Object.keys(vistas).sort() };
  }, ESPERA_TRAVA_RH);

  // Uma trava por competencia: quem salva outra coisa no meio nao espera o fim.
  const feitas = [], erros = [];
  const inicio = Date.now();
  passo1.comps.forEach(function (c) {
    if (Date.now() - inicio > 240000) {
      erros.push(c + ': ficou para depois (tempo da execução) — rode Reclassificar de novo');
      return;
    }
    try {
      if (recalcularDaFato_(c, usuario.email)) feitas.push(c);
    } catch (e) {
      const msg = String(e.message || e);
      erros.push(c + ': ' + msg);
      registrarLog(usuario.email, 'ERRO', 'IMPORTACAO', c, 'Reclassificar: ' + msg);
    }
  });

  if (erros.length) {
    throw new Error('Reclassifiquei a base, mas não consegui refazer o painel de ' +
      erros.join(' · ') + (feitas.length ? ' (refeitas: ' + feitas.join(', ') + ')' : ''));
  }
  return {
    ok: true, linhas: passo1.linhas, competencias: feitas.length, invalidarTudo: true,
    recado: 'Base reclassificada: ' + passo1.linhas + ' lançamento(s); painel refeito em ' +
      feitas.length + ' competência(s).'
  };
}
