/**
 * DADOS.gs — BI de Assiduidade Integrado
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

  // Identifica qual competencia abrir
  let comp = params.competencia;
  let arq = null;
  if (comp) {
    arq = arquivos.filter(function (a) { return a.COMPETENCIA === comp; })[0];
  }
  if (!arq) {
    arq = arquivos.filter(function (a) { return String(a.SITUACAO).toUpperCase() === 'ABERTA'; })[0] || arquivos[0];
    comp = arq.COMPETENCIA;
  }

  let painelRows = listar('PAINEL').filter(function (p) { return p.COMPETENCIA === comp; });

  /*
   * Ainda nao importado? Importa AGORA, sozinho. A competencia ja esta
   * cadastrada em Configuracao, entao nao ha motivo para pedir um clique.
   */
  if (!painelRows.length) {
    try {
      acaoImportarCompetencia(usuario, { id: arq.ID });
      esquecerLeituras();
      painelRows = listar('PAINEL').filter(function (p) { return p.COMPETENCIA === comp; });
    } catch (e) {
      return semDados_(usuario, arquivos, arq, comp, String(e.message || e));
    }
  }
  if (!painelRows.length) return semDados_(usuario, arquivos, arq, comp, '');

  return montarPainel_(usuario, arquivos, arq, comp, painelRows);
}

/* Resposta quando nao ha dados para a competencia. */
function semDados_(usuario, arquivos, arq, comp, erroImport) {
  return {
    semDados: true,
    competencia: comp,
    erroImport: erroImport || '',
    arquivo: { id: arq.ID, situacao: arq.SITUACAO },
    competencias: arquivos.map(function (a) {
      return { competencia: a.COMPETENCIA, situacao: a.SITUACAO };
    }),
    podeGerir: podeFazer(usuario, 'PROGRAMAR')
  };
}

/* Monta o payload da tela a partir do PAINEL ja gravado. */
function montarPainel_(usuario, arquivos, arq, comp, painelRows) {
  const payload = JSON.parse(painelRows[0].PAYLOAD);
  const turnosPermitidos = turnoDoEscopo(usuario);

  // Controle de granularidade da visao individual
  if (turnosPermitidos) {
    payload.colaboradores = payload.colaboradores.filter(function (c) {
      return c.turno === turnosPermitidos;
    });
    payload.mostraIndividual = true;
  } else if (usuario.permissoes.escopo === 'TODOS' || usuario.permissoes.escopo === 'PROPRIAS') {
    payload.mostraIndividual = podeFazer(usuario, 'VER_INDIVIDUAL');
    if (!payload.mostraIndividual && usuario.permissoes.escopo === 'PROPRIAS' && usuario.turno) {
      payload.colaboradores = payload.colaboradores.filter(function (c) {
        return c.turno === usuario.turno;
      });
      payload.mostraIndividual = true;
    }
  }

  return {
    competencia: comp,
    arquivo: { id: arq.ID, situacao: arq.SITUACAO },
    podeGerir: podeFazer(usuario, 'PROGRAMAR'),
    escopo: descreverEscopo(usuario),
    competencias: arquivos.map(function (a) {
      return { competencia: a.COMPETENCIA, situacao: a.SITUACAO };
    }),
    kpis: payload.kpis,
    porTurno: payload.porTurno,
    porCategoria: payload.porCategoria,
    diaADia: payload.diaADia,
    porDiaSemana: payload.porDiaSemana,
    codigosTop: payload.codigosTop,
    colaboradores: payload.colaboradores,
    mostraIndividual: payload.mostraIndividual
  };
}

/* ==========================================================================
   CONSULTAS (RANKING, PERIODO, FICHA)
   ========================================================================== */

function dadosRanking(usuario, params) {
  exigirTela(usuario, 'ranking');
  const arquivos = listar('ARQUIVOS_RH');
  if (!arquivos.length) return { semDados: true };

  let comp = params.competencia;
  if (!comp) {
    const arq = arquivos.filter(function (a) {
      return String(a.SITUACAO).toUpperCase() === 'ABERTA';
    })[0] || arquivos[0];
    comp = arq.COMPETENCIA;
  }

  const minDias = Number(params.minimo) || 10;
  const res = acaoRanking(usuario, { competencia: comp, minimo: minDias });
  res.competencia = comp;
  res.competencias = arquivos.map(function (a) { return a.COMPETENCIA; });
  return res;
}

function acaoRanking(usuario, params) {
  exigirTela(usuario, 'ranking');
  const minDias = Number(params.minimo) || 10;
  const comp = params.competencia;
  if (!comp) throw new Error('Competência não informada.');

  const qualificados = listar('AGR_COLAB').filter(function (a) {
    return a.COMPETENCIA === comp && Number(a.REGISTROS) >= minDias;
  });

  const escopoTurno = turnoDoEscopo(usuario);
  const turnosStats = {};
  qualificados.forEach(function (q) {
    const t = q.TURNO || 'Sem turno';
    if (!turnosStats[t]) turnosStats[t] = { trab: 0, aus: 0, pessoas: 0 };
    turnosStats[t].trab += Number(q.TRABALHADOS);
    turnosStats[t].aus += Number(q.AUSENCIAS);
    turnosStats[t].faltas = (turnosStats[t].faltas || 0) + (Number(q.FALTAS) || 0);
    turnosStats[t].atestados = (turnosStats[t].atestados || 0) + (Number(q.ATESTADOS) || 0);
    turnosStats[t].pessoas++;
  });

  const turnos = Object.keys(turnosStats).map(function (t) {
    const s = turnosStats[t];
    const celulas = s.trab + s.aus;
    const tx = celulas ? Math.round(((celulas - s.aus) / celulas) * 1000) / 10 : 0;
    return { turno: t, media: tx, pessoas: s.pessoas, trabalhados: s.trab,
             ausencias: s.aus, faltas: s.faltas || 0, atestados: s.atestados || 0 };
  }).sort(function (a, b) { return b.media - a.media; });

  // Linha de total do CD inteiro, como na planilha.
  const somaCD = turnos.reduce(function (acc, t) {
    acc.pessoas += t.pessoas; acc.trabalhados += t.trabalhados;
    acc.ausencias += t.ausencias; acc.faltas += t.faltas; acc.atestados += t.atestados;
    return acc;
  }, { pessoas: 0, trabalhados: 0, ausencias: 0, faltas: 0, atestados: 0 });
  const celCD = somaCD.trabalhados + somaCD.ausencias;
  somaCD.turno = 'CD';
  somaCD.media = celCD ? Math.round(((celCD - somaCD.ausencias) / celCD) * 1000) / 10 : 0;
  turnos.push(somaCD);

  let visiveis = qualificados;
  if (escopoTurno) visiveis = visiveis.filter(function (q) { return q.TURNO === escopoTurno; });

  const listaOrd = visiveis.map(function (q) {
    return {
      matricula: q.MATRICULA, nome: q.NOME, turno: q.TURNO,
      ausencias: q.AUSENCIAS, assiduidade: parseFloat(q.ASSIDUIDADE) || 0
    };
  });

  listaOrd.sort(function (a, b) {
    if (b.assiduidade !== a.assiduidade) return b.assiduidade - a.assiduidade;
    return a.ausencias - b.ausencias;
  });

  /*
   * Rankings extras que a planilha original tinha e faltavam aqui:
   * quem mais tem ATESTADO e quem mais tem FALTA INJUSTIFICADA. Sao
   * problemas de natureza diferente — um e saude, o outro e disciplina —
   * e a gestao trata cada um de um jeito.
   */
  const maisAtestados = visiveis.map(function (q) {
    return { matricula: q.MATRICULA, nome: q.NOME, turno: q.TURNO,
             valor: Number(q.ATESTADOS) || 0 };
  }).filter(function (p) { return p.valor > 0; })
    .sort(function (a, b) { return b.valor - a.valor; }).slice(0, 15);

  const maisFaltas = visiveis.map(function (q) {
    return { matricula: q.MATRICULA, nome: q.NOME, turno: q.TURNO,
             valor: Number(q.FALTAS) || 0 };
  }).filter(function (p) { return p.valor > 0; })
    .sort(function (a, b) { return b.valor - a.valor; }).slice(0, 15);

  return {
    turnos: turnos,
    melhores: listaOrd.slice(0, 15),
    atencao: listaOrd.slice().reverse().slice(0, 15),
    maisAtestados: maisAtestados,
    maisFaltas: maisFaltas,
    minimo: minDias
  };
}

function acaoPeriodo(usuario, params) {
  exigirTela(usuario, 'assiduidade');
  const de = params.de, ate = params.ate, tipo = params.tipo || 'TODAS';
  if (!de || !ate) throw new Error('Período inválido.');

  const dDe = new Date(de + 'T00:00:00');
  const dAte = new Date(ate + 'T23:59:59');
  const diasNoPeriodo = Math.round((dAte - dDe) / 86400000) + 1;

  let fato = listar('FATO_ASSIDUIDADE').filter(function (f) {
    const dt = new Date(f.DATA + 'T12:00:00');
    return dt >= dDe && dt <= dAte;
  });

  const escopoTurno = turnoDoEscopo(usuario);
  if (escopoTurno) fato = fato.filter(function (f) { return f.TURNO === escopoTurno; });

  /*
   * Filtro por categoria REAL do DE-PARA. Antes so existia "Falta" e
   * "Atestado", mas a legenda do RH separa falta injustificada (16),
   * justificada (28) e disciplinar (18) — que a gestao trata de formas
   * diferentes. 'TODAS' traz qualquer ausencia.
   */
  if (tipo && tipo !== 'TODAS') {
    const alvo = {
      'FALTA_INJUST': 'Falta injustificada',
      'FALTA_JUST':   'Falta justificada',
      'FALTA_DISC':   'Falta disciplinar',
      'ATESTADO':     'Atestado',
      'LICENCA':      'Licença legal',
      // compatibilidade com o filtro antigo
      'FALTA':        'Falta injustificada'
    }[tipo];
    if (alvo) fato = fato.filter(function (f) { return String(f.CATEGORIA) === alvo; });
  }
  fato = fato.filter(function (f) { return f.AUSENCIA === 'Sim'; });

  const colab = {};
  fato.forEach(function (f) {
    const mat = f.MATRICULA;
    if (!colab[mat]) colab[mat] = { turno: f.TURNO, registros: 0, datas: [] };
    colab[mat].registros++;
    colab[mat].datas.push(f.DATA);
  });

  const nomesMap = {};
  listar('COLABORADORES').forEach(function (c) { nomesMap[c.MATRICULA] = c.NOME; });

  let registrosTotal = 0;
  const lista = Object.keys(colab).map(function (mat) {
    const c = colab[mat];
    registrosTotal += c.registros;
    c.datas.sort();
    return {
      matricula: mat, nome: nomesMap[mat] || mat, turno: c.turno, registros: c.registros,
      primeira: br_(new Date(c.datas[0] + 'T12:00:00')),
      ultima: br_(new Date(c.datas[c.datas.length - 1] + 'T12:00:00')),
      datas: c.datas.map(function (dt) { return { data: br_(new Date(dt + 'T12:00:00')) }; }),
      barra: diasNoPeriodo ? Math.min(100, Math.round((c.registros / diasNoPeriodo) * 100)) : 0
    };
  }).sort(function (a, b) { return b.registros - a.registros; });

  // Quebra por categoria e por competencia — assim da para ver, num
  // intervalo que cruza varios meses, o peso de cada tipo e de cada mes.
  const porCategoria = {}, porCompetencia = {};
  fato.forEach(function (f) {
    const cat = String(f.CATEGORIA || 'Outros');
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    const cp = String(f.COMPETENCIA || '—');
    porCompetencia[cp] = (porCompetencia[cp] || 0) + 1;
  });

  return {
    colaboradores: lista.length, registros: registrosTotal, diasNoPeriodo: diasNoPeriodo,
    escopo: descreverEscopo(usuario), de: br_(dDe), ate: br_(dAte), tipo: tipo,
    porCategoria: Object.keys(porCategoria).map(function (k) {
      return { categoria: k, total: porCategoria[k] };
    }).sort(function (a, b) { return b.total - a.total; }),
    porCompetencia: Object.keys(porCompetencia).sort().map(function (k) {
      return { competencia: k, total: porCompetencia[k] };
    }),
    lista: lista.slice(0, 50), mais: Math.max(0, lista.length - 50)
  };
}

function acaoFichaColaborador(usuario, params) {
  exigirTela(usuario, 'assiduidade');
  const mat = params.matricula;
  if (!mat) throw new Error('Matrícula não informada.');

  const historicoRaw = listar('AGR_COLAB').filter(function (a) {
    return a.MATRICULA === mat;
  }).sort(function (a, b) { return String(a.COMPETENCIA).localeCompare(String(b.COMPETENCIA)); });

  let nome = mat, turno = '';
  const historico = historicoRaw.map(function (h) {
    nome = h.NOME || nome;
    turno = h.TURNO || turno;
    return {
      competencia: h.COMPETENCIA, trabalhados: h.TRABALHADOS, ausencias: h.AUSENCIAS,
      faltas: h.FALTAS, atestados: h.ATESTADOS,
      assiduidade: String(h.ASSIDUIDADE).replace('%', '')
    };
  });

  const ausenciasRaw = listar('FATO_ASSIDUIDADE').filter(function (f) {
    return f.MATRICULA === mat && f.AUSENCIA === 'Sim';
  }).sort(function (a, b) { return String(b.DATA).localeCompare(String(a.DATA)); }).slice(0, 50);

  const mapaCodigos = lerDePara_();
  const ausencias = ausenciasRaw.map(function (a) {
    const t = traduz_(mapaCodigos, a.CODIGO);
    return {
      data: br_(new Date(a.DATA + 'T12:00:00')),
      codigo: a.CODIGO, descricao: t.desc, categoria: a.CATEGORIA
    };
  });

  return { matricula: mat, nome: nome, turno: turno, historico: historico, ausencias: ausencias };
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

  const ext = extrair_(folha.m, det, cfg, arq.COMPETENCIA);
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
    if (traduz_(mapa, c).cat === 'A CONFIRMAR') {
      res.codigosPendentes.push({ codigo: c, vezes: ext.codigos[c] });
    }
  });

  return res;
}

function acaoImportarCompetencia(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const arq = obter('ARQUIVOS_RH', params.id);
  if (!arq) throw new Error('Arquivo não encontrado.');

  const cfg = cfgD_();
  const folha = abrirFolha_(arq.LINK, arq.ABA);
  const det = detectar_(folha.m, cfg);

  if (det.erros.length) throw new Error(det.erros[0]);

  const ext = extrair_(folha.m, det, cfg, arq.COMPETENCIA);
  if (!ext.regs.length) throw new Error('Nenhum lançamento encontrado na planilha do RH.');

  const mapa = lerDePara_();
  const linhasFato = [];
  const pend = {};

  ext.regs.forEach(function (g) {
    const t = traduz_(mapa, g.cod);
    if (t.cat === 'IGNORAR') return;
    if (t.cat === 'A CONFIRMAR') pend[g.cod] = true;
    linhasFato.push([
      ymd_(g.data), g.comp, DOW_[g.data.getDay()], g.mat, g.turno, g.cod, t.cat, t.aus ? 'Sim' : 'Não'
    ]);
  });

  // Colaboradores
  const colabExistentes = {};
  listar('COLABORADORES').forEach(function (c) { colabExistentes[c.MATRICULA] = c.ID; });
  Object.keys(ext.nomes).forEach(function (mat) {
    const d = ext.nomes[mat];
    if (colabExistentes[mat]) {
      atualizar('COLABORADORES', colabExistentes[mat], { NOME: d.nome, TURNO: d.turno }, usuario.email);
    } else {
      inserir('COLABORADORES', { MATRICULA: mat, NOME: d.nome, TURNO: d.turno }, usuario.email);
    }
  });

  // Fato em lote
  substituirLote_('FATO_ASSIDUIDADE', arq.COMPETENCIA, linhasFato, function (l) {
    return [Utilities.getUuid(), l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7],
            agoraTextoDados_(), 'sistema', '', '', ''];
  });

  // Agregados e payload do painel
  const agr = calcularAgregado_(arq.COMPETENCIA, linhasFato, ext.nomes);

  substituirLote_('AGR_COLAB', arq.COMPETENCIA, agr.linhasColab, function (c) {
    return [Utilities.getUuid(), c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7],
            c[8], c[9], c[10], c[11], c[12], '', agoraTextoDados_(), 'sistema', '', '', ''];
  });

  const painelRows = listar('PAINEL').filter(function (p) { return p.COMPETENCIA === arq.COMPETENCIA; });
  const payloadStr = JSON.stringify(agr.payload);
  if (painelRows.length) {
    atualizar('PAINEL', painelRows[0].ID, { GERADO_EM: agoraTextoDados_(), PAYLOAD: payloadStr }, usuario.email);
  } else {
    inserir('PAINEL', { COMPETENCIA: arq.COMPETENCIA, GERADO_EM: agoraTextoDados_(), PAYLOAD: payloadStr }, usuario.email);
  }

  atualizar('ARQUIVOS_RH', arq.ID,
    { ULTIMA_IMPORTACAO: agoraTextoDados_(), LINHAS: linhasFato.length }, usuario.email);

  esquecerLeituras();

  const lp = Object.keys(pend);
  return {
    ok: true,
    registros: linhasFato.length,
    aviso: lp.length ? 'Códigos sem tradução: ' + lp.join(', ') : ''
  };
}

/* ==========================================================================
   CALCULOS DO BI
   ========================================================================== */

function calcularAgregado_(comp, linhasFato, nomes) {
  let lanc = 0, aus = 0, faltas = 0, atest = 0;
  const porCat = {}, porCod = {}, porDia = {}, porDow = {}, colab = {};

  linhasFato.forEach(function (l) {
    const data = l[0], mat = l[3], turno = l[4], cod = l[5], cat = l[6];
    const ausencia = (l[7] === 'Sim');
    lanc++;

    porCat[cat] = (porCat[cat] || 0) + 1;
    porCod[cod] = porCod[cod] || { total: 0 };
    porCod[cod].total++;

    porDia[data] = porDia[data] || { total: 0, ausencias: 0 };
    porDia[data].total++;

    if (!colab[mat]) {
      colab[mat] = { turno: turno, trab: 0, aus: 0, falta: 0, atest: 0, ferias: 0, folga: 0, lic: 0 };
    }
    const c = colab[mat];
    if (c.turno === '' && turno) c.turno = turno;

    if (cat === 'Presença') c.trab++;
    if (cat === 'Férias') c.ferias++;
    if (cat === 'Folga') c.folga++;
    if (cat === 'Licença legal') c.lic++;

    if (ausencia) {
      aus++; c.aus++;
      porDia[data].ausencias++;
      porDow[l[2]] = (porDow[l[2]] || 0) + 1;
      if (cat === 'Falta') { faltas++; c.falta++; }
      if (cat === 'Atestado') { atest++; c.atest++; }
    }
  });

  const mats = Object.keys(colab);
  const taxaGlobal = lanc ? Math.round((aus / lanc) * 1000) / 10 : 0;
  const meta = Number(parametro('META_ABSENTEISMO', '0.05')) * 100;

  const kpis = {
    colaboradores: mats.length, taxa: taxaGlobal, meta: meta,
    acimaDaMeta: taxaGlobal > meta, faltas: faltas, atestados: atest
  };

  const turnosStats = {};
  mats.forEach(function (m) {
    const t = colab[m].turno || 'Sem turno';
    if (!turnosStats[t]) turnosStats[t] = { pessoas: 0, trab: 0, aus: 0 };
    turnosStats[t].pessoas++;
    turnosStats[t].trab += colab[m].trab;
    turnosStats[t].aus += colab[m].aus;
  });

  const arrTurno = Object.keys(turnosStats).sort().map(function (t) {
    const s = turnosStats[t], celulas = s.trab + s.aus;
    return {
      turno: t,
      taxa: celulas ? Math.round((s.aus / celulas) * 1000) / 10 : 0,
      pessoas: s.pessoas, celulas: celulas
    };
  });

  const arrCat = Object.keys(porCat).map(function (k) {
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
  const arrCod = Object.keys(porCod).map(function (c) {
    const t = traduz_(mapa, c);
    return { codigo: c, descricao: t.desc, categoria: t.cat, total: porCod[c].total };
  }).sort(function (a, b) { return b.total - a.total; }).slice(0, 15);

  const arrColab = mats.sort().map(function (m) {
    const c = colab[m], base = c.trab + c.aus;
    return {
      matricula: m, nome: nomes[m] ? nomes[m].nome : '(sem nome)', turno: c.turno,
      trabalhados: c.trab, ausencias: c.aus, faltas: c.falta, atestados: c.atest,
      assiduidade: base ? Math.round(((base - c.aus) / base) * 1000) / 10 : 0
    };
  });

  const linhasColab = arrColab.map(function (c) {
    return [comp, c.matricula, c.nome, c.turno, c.trabalhados + c.ausencias, c.trabalhados,
            c.ausencias, c.faltas, c.atestados, colab[c.matricula].ferias,
            colab[c.matricula].folga, colab[c.matricula].lic, c.assiduidade + '%'];
  });

  return {
    payload: {
      kpis: kpis, porTurno: arrTurno, porCategoria: arrCat, diaADia: arrDia,
      porDiaSemana: arrDow, codigosTop: arrCod, colaboradores: arrColab
    },
    linhasColab: linhasColab
  };
}

/* ==========================================================================
   UTILITARIOS INTERNOS
   ========================================================================== */

function substituirLote_(abaNome, comp, linhasBrutas, formatador) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ID_BANCO'));
  const sh = ss.getSheetByName(abaNome);
  if (!sh) return;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idxCompSheet = headers.indexOf('COMPETENCIA');
  if (idxCompSheet < 0) return;

  // Apaga o que ja existe daquela competencia
  const last = sh.getLastRow();
  if (last >= 2) {
    const v = sh.getRange(2, idxCompSheet + 1, last - 1, 1).getValues();
    let ini = -1, n = 0;
    for (let i = v.length - 1; i >= 0; i--) {
      if (String(v[i][0]) === comp) { if (ini < 0) ini = i; n++; }
      else if (ini >= 0) { sh.deleteRows(2 + i + 1, n); ini = -1; n = 0; }
    }
    if (ini >= 0) sh.deleteRows(2, n);
  }

  if (linhasBrutas && linhasBrutas.length) {
    const formatadas = linhasBrutas.map(formatador);
    const chunk = 4000;
    for (let i = 0; i < formatadas.length; i += chunk) {
      const pedaco = formatadas.slice(i, i + chunk);
      /*
       * A aba nasce com um numero fixo de linhas (padrao 1000). Escrever
       * 2000+ registros pedia linhas que nao existiam fisicamente e dava
       * "essas linhas estao fora dos limites". Aqui as linhas que faltam
       * sao criadas ANTES da escrita.
       */
      const primeira = sh.getLastRow() + 1;
      const necessarias = primeira + pedaco.length - 1;
      if (sh.getMaxRows() < necessarias) {
        sh.insertRowsAfter(sh.getMaxRows(), necessarias - sh.getMaxRows());
      }
      sh.getRange(primeira, 1, pedaco.length, pedaco[0].length)
        .setValues(pedaco).setNumberFormat('@');
    }
  }
  esquecerLeituras();
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
        cat: String(l.CATEGORIA || 'A CONFIRMAR'),
        aus: norm_(l.CONTA_COMO_AUSENCIA) === 'SIM'
      };
    }
  });
  return mapa;
}

function traduz_(mapa, cod) {
  if (mapa[cod]) return mapa[cod];
  const alt = String(cod).replace(/^0+(?=\d)/, '');
  if (alt !== cod && mapa[alt]) return mapa[alt];
  return { desc: '', cat: 'A CONFIRMAR', aus: false };
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

  const cols = [];
  for (let c3 = 0; c3 < nCol; c3++) {
    if (eData_(m[linCab][c3])) cols.push({ col: c3, data: m[linCab][c3] });
  }
  if (cols.length < 7) {
    erros.push('Achei só ' + cols.length + ' coluna(s) de data na linha ' + (linCab + 1) +
      '. Confira se a aba cadastrada é a FOLHA DE PONTO (a que tem os dias em colunas).');
  }

  return {
    erros: erros, avisos: avisos, nLin: nLin, nCol: nCol, linCab: linCab,
    colMat: colMat, colNome: colNome, colTurno: colTurno, cols: cols, linIni: linCab + 1
  };
}

function extrair_(m, det, cfg, comp) {
  const regs = [], nomes = {}, codigos = {}, porTurno = {}, turnosFora = {};
  const reMat = new RegExp('^\\d{' + cfg.digitos + ',}$');

  for (let r = det.linIni; r < det.nLin; r++) {
    const linha = m[r];
    if (!linha) continue;

    const txt = norm_(linha.join(' '));
    let pular = false;
    cfg.corta.forEach(function (x) { if (x && txt.indexOf(x) > -1) pular = true; });
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

function codigo_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return (v === Math.floor(v)) ? String(Math.floor(v)) : String(v);
  let s = String(v).trim().toUpperCase();
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

function ymd_(d) { return Utilities.formatDate(d, 'America/Bahia', 'yyyy-MM-dd'); }
function br_(d) { return Utilities.formatDate(d, 'America/Bahia', 'dd/MM/yyyy'); }
function eData_(v) { return (v instanceof Date) && !isNaN(v.getTime()); }
function agoraTextoDados_() { return Utilities.formatDate(new Date(), 'America/Bahia', 'yyyy-MM-dd HH:mm:ss'); }

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
  if (valor instanceof Date) return Utilities.formatDate(valor, 'America/Bahia', 'yyyy-MM');
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
    if (String(l.CATEGORIA) === 'A CONFIRMAR' || !mapa[c]) vistos[c] = (vistos[c] || 0) + 1;
  });
  return Object.keys(vistos).sort().map(function (c) { return { codigo: c, vezes: vistos[c] }; });
}

function acaoSalvarDePara(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const campos = {
    CODIGO: codigo_(params.codigo),
    DESCRICAO: String(params.descricao || '').trim(),
    CATEGORIA: String(params.categoria || 'A CONFIRMAR').trim(),
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
  listar('FATO_ASSIDUIDADE').forEach(function (l) { comps[String(l.COMPETENCIA)] = true; });

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
      try { acaoImportarCompetencia(usuario, { id: arq.ID }); } catch (e) { /* segue */ }
    }
  });

  return { ok: true, linhas: valores.length, competencias: Object.keys(comps).length };
}
