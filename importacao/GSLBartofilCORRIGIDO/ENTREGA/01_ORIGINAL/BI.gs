/**
 * BI.gs — Análises avançadas de assiduidade
 *
 * Arquivo NOVO e independente: não altera Dados.gs. Só lê as tabelas que a
 * importação já alimenta (FATO_ASSIDUIDADE, AGR_COLAB, ATIVIDADES).
 * Todos os nomes levam o prefixo "bi" para nunca colidir com o resto.
 *
 * O que responde:
 *   1. Concentração (Pareto) — quantas pessoas explicam a maior parte das faltas
 *   2. Tendência mês a mês contra a meta
 *   3. Reincidência — quem está faltando de novo, para agir antes
 *   4. Risco de cobertura — dias em que um turno ficou desfalcado
 *   5. Padrão por dia da semana — emenda de fim de semana
 *   6. Custo estimado do absenteísmo
 *   7. Cruzamento assiduidade × entregas do calendário
 */

/* Categorias que a legenda do RH trata como ausência de verdade. */
var BI_FALTAS = ['Falta injustificada', 'Falta justificada', 'Falta disciplinar'];
var BI_ATESTADO = 'Atestado';

function biNum(v) { return Number(v) || 0; }

function biDataDe(v) {
  if (v instanceof Date) return v;
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* TELA — junta todas as análises numa resposta só                     */
/* ------------------------------------------------------------------ */

function dadosAnalise(usuario, params) {
  exigirTela(usuario, 'assiduidade');

  const meses = biNum(params && params.meses) || 6;
  const corte = new Date();
  corte.setMonth(corte.getMonth() - (meses - 1));
  corte.setDate(1);

  const escopoTurno = turnoDoEscopo(usuario);

  // Lê a base uma vez só e reaproveita em todas as análises.
  const fato = listar('FATO_ASSIDUIDADE').filter(function (l) {
    if (escopoTurno && String(l.TURNO) !== escopoTurno) return false;
    const d = biDataDe(l.DATA);
    return d && d >= corte;
  });

  const agr = listar('AGR_COLAB').filter(function (a) {
    return !escopoTurno || String(a.TURNO) === escopoTurno;
  });

  const nomes = {};
  listar('COLABORADORES').forEach(function (c) { nomes[String(c.MATRICULA)] = String(c.NOME || ''); });

  return {
    meses: meses,
    escopo: descreverEscopo(usuario),
    concentracao: biConcentracao(fato, nomes),
    tendencia: biTendencia(agr),
    reincidencia: biReincidencia(fato, nomes),
    cobertura: biCobertura(fato),
    diaSemana: biDiaSemana(fato),
    custo: biCusto(fato),
    afastamentos: biAfastamentos(fato, nomes),
    cruzamento: biCruzamento(fato)
  };
}

/* ------------------------------------------------------------------ */
/* 1. CONCENTRAÇÃO (Pareto)                                            */
/* ------------------------------------------------------------------ */

/*
 * Quase sempre um grupo pequeno responde pela maior parte das faltas.
 * Saber quantas pessoas explicam 50% e 80% muda a ação da gestão: em vez
 * de campanha para o CD inteiro, conversa dirigida com quem pesa.
 */
function biConcentracao(fato, nomes) {
  const porPessoa = {};
  fato.forEach(function (l) {
    if (String(l.AUSENCIA) !== 'Sim') return;
    const m = String(l.MATRICULA);
    porPessoa[m] = (porPessoa[m] || 0) + 1;
  });

  const lista = Object.keys(porPessoa).map(function (m) {
    return { matricula: m, nome: nomes[m] || m, total: porPessoa[m] };
  }).sort(function (a, b) { return b.total - a.total; });

  const totalGeral = lista.reduce(function (s, p) { return s + p.total; }, 0);
  let acumulado = 0, ate50 = 0, ate80 = 0;
  const curva = lista.map(function (p, i) {
    acumulado += p.total;
    const pct = totalGeral ? Math.round((acumulado / totalGeral) * 1000) / 10 : 0;
    if (!ate50 && pct >= 50) ate50 = i + 1;
    if (!ate80 && pct >= 80) ate80 = i + 1;
    return { posicao: i + 1, acumuladoPct: pct };
  });

  return {
    totalPessoas: lista.length,
    totalAusencias: totalGeral,
    pessoasAte50: ate50,
    pessoasAte80: ate80,
    pctPessoasAte80: lista.length ? Math.round((ate80 / lista.length) * 100) : 0,
    topo: lista.slice(0, 15),
    curva: curva.slice(0, 60)
  };
}

/* ------------------------------------------------------------------ */
/* 2. TENDÊNCIA mês a mês contra a meta                                */
/* ------------------------------------------------------------------ */

function biTendencia(agr) {
  const meta = biNum(parametro('META_ABSENTEISMO', '0.05')) * 100;
  const porComp = {};
  agr.forEach(function (a) {
    const c = String(a.COMPETENCIA || '');
    if (!c) return;
    if (!porComp[c]) porComp[c] = { trab: 0, aus: 0, pessoas: 0, faltas: 0, atestados: 0 };
    porComp[c].trab += biNum(a.TRABALHADOS);
    porComp[c].aus += biNum(a.AUSENCIAS);
    porComp[c].faltas += biNum(a.FALTAS);
    porComp[c].atestados += biNum(a.ATESTADOS);
    porComp[c].pessoas++;
  });

  const serie = Object.keys(porComp).sort().map(function (c) {
    const s = porComp[c];
    const base = s.trab + s.aus;
    return {
      competencia: c,
      taxa: base ? Math.round((s.aus / base) * 1000) / 10 : 0,
      pessoas: s.pessoas, faltas: s.faltas, atestados: s.atestados
    };
  });

  // Direção: compara os dois últimos meses fechados.
  let direcao = 'estavel', variacao = 0;
  if (serie.length >= 2) {
    const ult = serie[serie.length - 1].taxa, ant = serie[serie.length - 2].taxa;
    variacao = Math.round((ult - ant) * 10) / 10;
    if (variacao > 0.2) direcao = 'piorando';
    else if (variacao < -0.2) direcao = 'melhorando';
  }

  return { meta: meta, serie: serie, direcao: direcao, variacao: variacao };
}

/* ------------------------------------------------------------------ */
/* 3. REINCIDÊNCIA — agir antes de virar processo                      */
/* ------------------------------------------------------------------ */

function biReincidencia(fato, nomes) {
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);

  const porPessoa = {};
  fato.forEach(function (l) {
    if (String(l.AUSENCIA) !== 'Sim') return;
    const d = biDataDe(l.DATA);
    if (!d || d < limite) return;
    const m = String(l.MATRICULA);
    if (!porPessoa[m]) porPessoa[m] = { turno: String(l.TURNO || ''), total: 0, injust: 0, datas: [] };
    porPessoa[m].total++;
    if (String(l.CATEGORIA) === 'Falta injustificada') porPessoa[m].injust++;
    porPessoa[m].datas.push(Utilities.formatDate(d, 'America/Bahia', 'dd/MM'));
  });

  return Object.keys(porPessoa).map(function (m) {
    const p = porPessoa[m];
    return {
      matricula: m, nome: nomes[m] || m, turno: p.turno,
      total: p.total, injustificadas: p.injust,
      datas: p.datas.sort().join(', '),
      gravidade: p.injust >= 2 ? 'alta' : (p.total >= 4 ? 'alta' : 'media')
    };
  }).filter(function (p) { return p.total >= 3 || p.injustificadas >= 2; })
    .sort(function (a, b) { return b.injustificadas - a.injustificadas || b.total - a.total; })
    .slice(0, 20);
}

/* ------------------------------------------------------------------ */
/* 4. RISCO DE COBERTURA                                               */
/* ------------------------------------------------------------------ */

/*
 * Assiduidade vira risco operacional quando muita gente do mesmo turno
 * falta no mesmo dia. Aqui listamos os piores dias por turno.
 */
function biCobertura(fato) {
  const porDiaTurno = {};
  fato.forEach(function (l) {
    const d = biDataDe(l.DATA);
    if (!d) return;
    const chave = Utilities.formatDate(d, 'America/Bahia', 'yyyy-MM-dd') + '|' + String(l.TURNO || '');
    if (!porDiaTurno[chave]) porDiaTurno[chave] = { presentes: 0, ausentes: 0 };
    if (String(l.AUSENCIA) === 'Sim') porDiaTurno[chave].ausentes++;
    else porDiaTurno[chave].presentes++;
  });

  const dias = Object.keys(porDiaTurno).map(function (k) {
    const partes = k.split('|');
    const s = porDiaTurno[k];
    const escala = s.presentes + s.ausentes;
    return {
      data: partes[0].split('-').reverse().join('/'),
      turno: partes[1],
      escala: escala, ausentes: s.ausentes,
      pctAusente: escala ? Math.round((s.ausentes / escala) * 1000) / 10 : 0
    };
  }).filter(function (d) { return d.escala >= 5 && d.ausentes > 0; })
    .sort(function (a, b) { return b.pctAusente - a.pctAusente; });

  return { piores: dias.slice(0, 12), criticos: dias.filter(function (d) { return d.pctAusente >= 15; }).length };
}

/* ------------------------------------------------------------------ */
/* 5. PADRÃO POR DIA DA SEMANA                                         */
/* ------------------------------------------------------------------ */

function biDiaSemana(fato) {
  const ordem = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const cont = {}, base = {};
  fato.forEach(function (l) {
    const dia = String(l.DIA_SEMANA || '').toLowerCase();
    if (!dia) return;
    base[dia] = (base[dia] || 0) + 1;
    if (String(l.AUSENCIA) === 'Sim') cont[dia] = (cont[dia] || 0) + 1;
  });

  const serie = ordem.filter(function (d) { return base[d]; }).map(function (d) {
    return {
      dia: d.charAt(0).toUpperCase() + d.slice(1),
      ausencias: cont[d] || 0,
      taxa: Math.round(((cont[d] || 0) / base[d]) * 1000) / 10
    };
  });

  // Emenda de fim de semana: segunda e sexta acima da média dos demais.
  const seg = serie.filter(function (d) { return d.dia === 'Segunda'; })[0];
  const sex = serie.filter(function (d) { return d.dia === 'Sexta'; })[0];
  const meio = serie.filter(function (d) { return ['Terça', 'Quarta', 'Quinta'].indexOf(d.dia) !== -1; });
  const mediaMeio = meio.length ? meio.reduce(function (s, d) { return s + d.taxa; }, 0) / meio.length : 0;
  const emenda = !!(seg && sex && mediaMeio &&
                    (seg.taxa > mediaMeio * 1.3 || sex.taxa > mediaMeio * 1.3));

  return { serie: serie, emenda: emenda, mediaMeio: Math.round(mediaMeio * 10) / 10 };
}

/* ------------------------------------------------------------------ */
/* 6. CUSTO DO ABSENTEÍSMO                                             */
/* ------------------------------------------------------------------ */

function biCusto(fato) {
  const custoDia = biNum(parametro('CUSTO_DIA_AUSENCIA', '0'));
  let dias = 0, diasFalta = 0;
  fato.forEach(function (l) {
    if (String(l.AUSENCIA) !== 'Sim') return;
    dias++;
    if (BI_FALTAS.indexOf(String(l.CATEGORIA)) !== -1) diasFalta++;
  });
  return {
    custoDia: custoDia,
    diasPerdidos: dias,
    diasFalta: diasFalta,
    total: Math.round(dias * custoDia),
    totalFalta: Math.round(diasFalta * custoDia),
    configurado: custoDia > 0
  };
}

/* ------------------------------------------------------------------ */
/* 7. AFASTAMENTOS LONGOS (código 130)                                 */
/* ------------------------------------------------------------------ */

/*
 * Atestado acima de 15 dias é afastamento previdenciário: não deveria
 * pesar como absenteísmo do dia a dia. Separar limpa o indicador.
 */
function biAfastamentos(fato, nomes) {
  const porPessoa = {};
  fato.forEach(function (l) {
    if (String(l.CODIGO) !== '130') return;
    const m = String(l.MATRICULA);
    if (!porPessoa[m]) porPessoa[m] = { turno: String(l.TURNO || ''), dias: 0 };
    porPessoa[m].dias++;
  });
  const lista = Object.keys(porPessoa).map(function (m) {
    return { matricula: m, nome: nomes[m] || m, turno: porPessoa[m].turno, dias: porPessoa[m].dias };
  }).sort(function (a, b) { return b.dias - a.dias; });

  return { pessoas: lista.length, diasTotal: lista.reduce(function (s, p) { return s + p.dias; }, 0), lista: lista };
}

/* ------------------------------------------------------------------ */
/* 8. CRUZAMENTO assiduidade × entregas                                */
/* ------------------------------------------------------------------ */

/*
 * A pergunta que só este sistema responde: o turno que mais falta é o que
 * mais atrasa entrega? Se sim, falta gente. Se não, o problema é processo.
 */
function biCruzamento(fato) {
  const ausPorTurno = {}, basePorTurno = {};
  fato.forEach(function (l) {
    const t = String(l.TURNO || '');
    if (!t) return;
    basePorTurno[t] = (basePorTurno[t] || 0) + 1;
    if (String(l.AUSENCIA) === 'Sim') ausPorTurno[t] = (ausPorTurno[t] || 0) + 1;
  });

  const ativPorTurno = {};
  try {
    listar('ATIVIDADES').forEach(function (a) {
      const t = String(a.TURNO || '').toUpperCase().trim();
      if (!t || t === 'TODOS') return;
      if (!ativPorTurno[t]) ativPorTurno[t] = { total: 0, atrasadas: 0, entregues: 0 };
      const st = String(a.STATUS || '');
      if (st === 'Cancelada') return;
      ativPorTurno[t].total++;
      if (st === 'Atrasada') ativPorTurno[t].atrasadas++;
      if (String(a.ENTREGUE_EM || '').trim()) ativPorTurno[t].entregues++;
    });
  } catch (e) { /* sem calendario, mostra só a assiduidade */ }

  const turnos = {};
  Object.keys(basePorTurno).forEach(function (t) { turnos[t] = true; });
  Object.keys(ativPorTurno).forEach(function (t) { turnos[t] = true; });

  return Object.keys(turnos).sort().map(function (t) {
    const base = basePorTurno[t] || 0;
    const aus = ausPorTurno[t] || 0;
    const at = ativPorTurno[t] || { total: 0, atrasadas: 0, entregues: 0 };
    return {
      turno: t,
      absenteismo: base ? Math.round((aus / base) * 1000) / 10 : 0,
      atividades: at.total,
      atrasadas: at.atrasadas,
      pctAtraso: at.total ? Math.round((at.atrasadas / at.total) * 1000) / 10 : 0
    };
  }).filter(function (t) { return t.absenteismo > 0 || t.atividades > 0; });
}
