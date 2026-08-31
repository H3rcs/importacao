/**
 * CENTRAL — andamento geral, mes a mes e por turno.
 * Portado da aba CENTRAL e do motor de insights do GSL_Bartofil_v10.
 */

function dadosInicio(usuario) {
  const escopo = escopoDe(usuario);
  const agora = hoje();
  const ordAtual = agora.getFullYear() * 12 + agora.getMonth();

  /*
   * A Central conta so do mes ATUAL em diante. Antes ela varria a tabela
   * inteira e somava julho (e todo o historico), por isso aparecia "130
   * atrasadas" de meses que ja foram encerrados.
   */
  // Filtra CRU (texto) e so entao hidrata: hidratar todas as atividades de
  // todos os meses para depois jogar fora era o que segurava o carregamento.
  const todas = listar('ATIVIDADES').filter(function (a) {
    const d = competenciaParaData(normalizarCompetencia(a.COMPETENCIA));
    return d ? (d.getFullYear() * 12 + d.getMonth()) >= ordAtual : true;
  }).map(hidratar);
  const minhas = todas.filter(function (a) { return dentroDoEscopo(a, escopo); });
  const hojeN = diaNum(hoje());
  const semana = intervaloDaSemana(0);

  const ativas = minhas.filter(function (a) {
    return a.status !== STATUS.CANCELADA && a.status !== STATUS.APROVADA && a.prazoISO;
  });

  const daSemana = minhas.filter(function (a) {
    if (!a.prazoISO) return false;
    const d = paraData(a.prazoISO);
    return d >= semana.inicio && d <= semana.fim;
  }).sort(function (a, b) { return a.prazoISO.localeCompare(b.prazoISO); });

  return {
    saudacao: usuario.nome,
    perfil: usuario.perfil,
    escopo: descreverEscopo(usuario),
    hoje: formatarData(hoje()),
    geral: resumirStatus(minhas),
    urgencias: {
      atrasadas: ativas.filter(function (a) { return diaNum(paraData(a.prazoISO)) < hojeN; }).length,
      hoje: ativas.filter(function (a) { return diaNum(paraData(a.prazoISO)) === hojeN; }).length,
      amanha: ativas.filter(function (a) { return diaNum(paraData(a.prazoISO)) === hojeN + 1; }).length,
      aguardando: minhas.filter(function (a) { return a.status === STATUS.AGUARDANDO; }).length
    },
    semana: {
      inicio: formatarData(semana.inicio), fim: formatarData(semana.fim),
      itens: daSemana
    },
    porMes: andamentoPorMes(todas),
    porTurno: TURNOS.map(function (t) { return resumoTurno(todas, t); }),
    insights: podeFazer(usuario, 'VER_INDIVIDUAL') ? gerarInsights(todas) : [],
    atalhos: telasDe(usuario).filter(function (t) { return t.id !== 'inicio'; })
  };
}

/** Uma linha por competencia, como a tabela do meio da aba CENTRAL. */
function andamentoPorMes(todas) {
  const mapa = {};
  todas.forEach(function (a) {
    if (!a.competencia) return;
    if (!mapa[a.competencia]) mapa[a.competencia] = [];
    mapa[a.competencia].push(a);
  });

  return Object.keys(mapa).sort(function (a, b) {
    const da = competenciaParaData(a), db = competenciaParaData(b);
    return (da && db) ? da - db : 0;
  }).map(function (comp) {
    const r = resumirStatus(mapa[comp]);
    r.competencia = comp;
    r.situacao = r.total === 0 ? '—'
               : r.aprovadas === r.total ? 'Concluido'
               : r.atrasadas ? 'Com atraso' : 'Em andamento';
    return r;
  });
}

/* ------------------------------------------------------------------ */
/* MOTOR DE INSIGHTS — os oito diagnosticos da planilha                */
/* ------------------------------------------------------------------ */

/*
 * Miniatura real da apresentacao. O Google ja gera um thumbnail de cada
 * arquivo do Drive; aqui ele vira data-URI para o cartao mostrar a capa
 * do slide em vez de um retangulo generico. Se falhar (link errado, sem
 * permissao), devolve vazio e o cartao usa o desenho padrao.
 */
function idDoLink(link) {
  const m = String(link || '').match(/\/d\/([a-zA-Z0-9-_]{20,})/);
  return m ? m[1] : '';
}

/*
 * DESEMPENHO: buscar miniatura e nome no Drive custa quase 1 segundo por
 * chamada. Com 3 turnos eram 6 idas ao Drive a cada abertura da tela.
 * Agora as duas informacoes vem numa unica leitura e ficam em cache por
 * 6 horas — a tela abre instantanea e a capa so e rebuscada quando o
 * cache expira ou o link muda.
 */
function capaApresentacao(link) {
  const id = idDoLink(link);
  if (!id) return { miniatura: '', titulo: '' };

  const chave = 'capa_' + id;
  const cache = CacheService.getScriptCache();
  try {
    const guardado = cache.get(chave);
    if (guardado) return JSON.parse(guardado);
  } catch (e) { /* segue e rebusca */ }

  const dados = { miniatura: '', titulo: '' };
  try {
    const arq = DriveApp.getFileById(id);       // UMA leitura, nao duas
    dados.titulo = arq.getName();
    const blob = arq.getThumbnail();
    if (blob) {
      const b64 = Utilities.base64Encode(blob.getBytes());
      // CacheService recusa acima de ~100KB: so guarda se couber.
      if (b64.length < 88000) dados.miniatura = 'data:' + blob.getContentType() + ';base64,' + b64;
    }
  } catch (e) { return dados; }

  try { cache.put(chave, JSON.stringify(dados), 21600); } catch (e) {}
  return dados;
}

function gerarInsights(todas) {
  const saida = [];
  const hojeN = diaNum(hoje());
  /*
   * Blindagem: mesmo que chegue lista de outros meses, os insights so
   * analisam do mes atual em diante. Sem isso, "Turno A com 63 atrasadas"
   * vinha somando um mes ja encerrado.
   */
  const agoraI = hoje();
  const ordI = agoraI.getFullYear() * 12 + agoraI.getMonth();
  const vigentes = todas.filter(function (a) {
    const d = competenciaParaData(a.competencia);
    return d ? (d.getFullYear() * 12 + d.getMonth()) >= ordI : true;
  });
  const linhas = vigentes.filter(function (a) { return a.status !== STATUS.CANCELADA && a.prazoISO; });
  const jan56 = linhas.filter(function (a) { return diaNum(paraData(a.prazoISO)) > hojeN - 56; });
  const jan84 = linhas.filter(function (a) { return diaNum(paraData(a.prazoISO)) > hojeN - 84; });

  // 1 · atrasos ativos por turno
  TURNOS.forEach(function (t) {
    const n = linhas.filter(function (a) {
      return doTurno(a, t) && !a.entregue && a.status !== STATUS.APROVADA &&
             diaNum(paraData(a.prazoISO)) < hojeN;
    }).length;
    if (n >= 3) saida.push(ins('alto', 'Turno ' + t + ' esta com ' + n + ' atividade(s) atrasada(s) agora.',
      'Cobranca direta na reuniao de sexta; se houver sobrecarga real, redistribuir ou renegociar prazos.'));
  });

  // 2 · reprovacoes por turno nas ultimas 8 semanas
  TURNOS.forEach(function (t) {
    const n = jan56.filter(function (a) { return doTurno(a, t) && a.status === STATUS.REPROVADA; }).length;
    if (n >= 2) saida.push(ins('medio', 'Turno ' + t + ' teve ' + n +
      ' entrega(s) reprovada(s) nas ultimas 8 semanas — o problema e qualidade, nao prazo.',
      'Revisar o modelo do documento com o coordenador antes de cobrar nova entrega.'));
  });

  // 3 · atividade que mais atrasa
  const porAtividade = {};
  jan56.forEach(function (a) {
    if (a.status !== STATUS.ATRASADA && a.diasAtraso === 0) return;
    const chave = String(a.atividade).split('(')[0].trim();
    porAtividade[chave] = (porAtividade[chave] || 0) + 1;
  });
  Object.keys(porAtividade).forEach(function (k) {
    if (porAtividade[k] >= 3) saida.push(ins('alto', '"' + k + '" atrasou ' + porAtividade[k] +
      ' vez(es) nas ultimas 8 semanas — e a atividade mais problematica do periodo.',
      'Checar se o prazo e realista ou se falta insumo para o coordenador conseguir entregar.'));
  });

  // 4 · gargalo de validacao
  const parados = linhas.filter(function (a) {
    return a.status === STATUS.AGUARDANDO && diaNum(paraData(a.prazoISO)) < hojeN - 5;
  });
  if (parados.length >= 3) saida.push(ins('medio', parados.length +
    ' entrega(s) estao anexadas ha mais de 5 dias aguardando validacao da gerencia.',
    'A fila de validacao virou o gargalo — reservar um horario fixo na semana para aprovar ou reprovar.'));

  // 5 · concentracao de atraso por dia da semana
  const porDia = [0, 0, 0, 0, 0, 0, 0, 0];
  let totalAtrasos = 0;
  jan56.forEach(function (a) {
    if (a.status !== STATUS.ATRASADA) return;
    const d = paraData(a.prazoISO);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    porDia[dow]++; totalAtrasos++;
  });
  if (totalAtrasos >= 5) {
    const nomes = ['', 'segundas', 'tercas', 'quartas', 'quintas', 'sextas', 'sabados', 'domingos'];
    for (let d = 1; d <= 7; d++) {
      if (porDia[d] / totalAtrasos >= 0.4) saida.push(ins('medio', 'Atividades com prazo nas ' + nomes[d] +
        ' concentram ' + Math.round(porDia[d] / totalAtrasos * 100) + '% dos atrasos das ultimas 8 semanas.',
        'Rever a carga desse dia — pode ser pico de operacao no CD ou prazo mal posicionado na semana.'));
    }
  }

  // 6 · pontualidade por turno nas ultimas 12 semanas
  TURNOS.forEach(function (t) {
    const base = jan84.filter(function (a) {
      return doTurno(a, t) && diaNum(paraData(a.prazoISO)) <= hojeN &&
             (a.entregue || a.status === STATUS.APROVADA);
    });
    if (base.length < 5) return;
    const noPrazo = base.filter(function (a) { return a.diasAtraso === 0; }).length;
    const pct = Math.round(noPrazo / base.length * 100);
    if (pct < 70) saida.push(ins('alto', 'Turno ' + t + ' entregou no prazo apenas ' + pct +
      '% das ' + base.length + ' atividades das ultimas 12 semanas.',
      'Pontualidade abaixo do aceitavel — tratar como ponto de acompanhamento semanal, nao pontual.'));
    else if (pct >= 95) saida.push(ins('bom', 'Turno ' + t + ' esta com ' + pct +
      '% de entregas no prazo nas ultimas 12 semanas.',
      'Reconhecer o coordenador na reuniao e mapear o que ele faz de diferente para replicar nos outros turnos.'));
  });

  // 7 · setor de vistoria com reincidencia de reprovacao
  const porSetor = {};
  jan56.forEach(function (a) {
    if (a.status !== STATUS.REPROVADA || !a.setor) return;
    porSetor[a.setor] = (porSetor[a.setor] || 0) + 1;
  });
  Object.keys(porSetor).forEach(function (s) {
    if (porSetor[s] >= 2) saida.push(ins('medio', 'Vistorias do setor ' + s + ' foram reprovadas ' +
      porSetor[s] + ' vez(es) nas ultimas 8 semanas.',
      'Acompanhar o setor de perto na proxima vistoria e verificar se o checklist esta sendo aplicado por inteiro.'));
  });

  // 8 · turno que zerou os atrasos nas ultimas 3 semanas
  TURNOS.forEach(function (t) {
    const recentes = linhas.filter(function (a) {
      return doTurno(a, t) && diaNum(paraData(a.prazoISO)) > hojeN - 21 &&
             diaNum(paraData(a.prazoISO)) <= hojeN;
    });
    if (recentes.length >= 4 && !recentes.some(function (a) { return a.diasAtraso > 0; })) {
      saida.push(ins('bom', 'Turno ' + t + ' zerou os atrasos nas ultimas 3 semanas.',
        'Momento bom para elogiar publicamente na reuniao — reforco funciona melhor que cobranca.'));
    }
  });

  if (!saida.length) {
    saida.push(ins('bom', 'Nenhum padrao preocupante no calendario neste momento.',
      'Manter o ritmo. Atrasos, reprovacoes e gargalos de validacao seguem monitorados a cada abertura.'));
  }
  return saida;
}

function doTurno(a, turno) { return a.turno === turno || a.turno === 'Todos'; }

function ins(nivel, texto, recomendacao) {
  return { nivel: nivel, texto: texto, recomendacao: recomendacao, geradoEm: agoraTexto() };
}


/* ------------------------------------------------------------------ */
/* APRESENTACAO — modo reuniao                                         */
/*                                                                     */
/* Mesma leitura do briefing que a planilha manda por e-mail na vespera */
/* da reuniao: quadro por turno, atrasos a cobrar, fila de validacao e  */
/* o que os dados estao dizendo. Aqui em tela cheia, para projetar.     */
/* ------------------------------------------------------------------ */

function dadosApresentacao(usuario) {
  // Tambem so do mes atual em diante — a apresentacao nao pode mostrar
  // atraso de mes ja encerrado.
  const agoraA = hoje();
  const ordA = agoraA.getFullYear() * 12 + agoraA.getMonth();
  const todas = listar('ATIVIDADES').filter(function (a) {
    const d = competenciaParaData(normalizarCompetencia(a.COMPETENCIA));
    return d ? (d.getFullYear() * 12 + d.getMonth()) >= ordA : true;
  }).map(hidratar);
  const hojeN = diaNum(hoje());
  const semana = intervaloDaSemana(0);

  const vivas = todas.filter(function (a) { return a.status !== STATUS.CANCELADA; });

  const atrasadas = vivas.filter(function (a) {
    return a.prazoISO && a.status !== STATUS.APROVADA && !a.entregue &&
           diaNum(paraData(a.prazoISO)) < hojeN;
  }).sort(function (a, b) { return a.prazoISO.localeCompare(b.prazoISO); });

  const aguardando = vivas.filter(function (a) { return a.status === STATUS.AGUARDANDO; })
    .sort(function (a, b) { return String(a.prazoISO).localeCompare(String(b.prazoISO)); });

  return {
    hoje: formatarData(hoje()),
    semana: { inicio: formatarData(semana.inicio), fim: formatarData(semana.fim) },
    geral: resumirStatus(vivas),
    porTurno: TURNOS.map(function (t) { return resumoTurno(todas, t); }),
    porMes: andamentoPorMes(todas),
    atrasadas: atrasadas.slice(0, 15),
    maisAtrasadas: Math.max(0, atrasadas.length - 15),
    aguardando: aguardando.slice(0, 15),
    maisAguardando: Math.max(0, aguardando.length - 15),
    insights: gerarInsights(todas),
    // Links das apresentacoes por turno, cadastrados em Configuracao.
    apresentacoes: TURNOS.map(function (t) {
      const link = String(parametro('APRESENTACAO_' + t, '')).trim();
      const capa = link ? capaApresentacao(link) : { miniatura: '', titulo: '' };
      return { turno: t, link: link, miniatura: capa.miniatura, titulo: capa.titulo };
    })
  };
}
