/**
 * CALENDARIO — o modelo real do GSL.
 *
 * Uma atividade nasce do gerador de rotinas, nao da mao do usuario:
 *   QUA Vistoria Setorial (por turno, com setor)
 *   QUI Relatorio Semanal Consolidado (por turno)
 *   SEX Reuniao Semanal com a Gerencia (todos)
 *   1a segunda: Programacao de Ferias · ultima sexta: Mudanca de Funcao
 *   5 vagas de Treinamento que o gerente agenda quando quiser
 *
 * ID no padrao da planilha: AGO-S34-VIS-A
 *
 * O STATUS NAO E DIGITADO. Ele e derivado, sempre, de tres fatos:
 *   validacao preenchida -> Aprovada / Reprovada / Cancelada
 *   entrega anexada      -> Aguard. valid.
 *   prazo vencido        -> Atrasada
 *   nada disso           -> Pendente
 * Foi isso que na planilha exigia formula e coluna auxiliar.
 */

const STATUS = {
  PENDENTE: 'Pendente', AGUARDANDO: 'Aguard. valid.', APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada', CANCELADA: 'Cancelada', ATRASADA: 'Atrasada',
  NAO_AGENDADO: 'Nao agendado'
};

const VALIDACOES = ['Aprovado', 'Reprovado', 'Cancelada'];
const TURNOS = ['A', 'B', 'C'];

/* ------------------------------------------------------------------ */
/* GERACAO DO MES                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cria as atividades de uma competencia inteira a partir da tabela ROTINAS.
 * Idempotente: uma atividade que ja existe (mesmo ID) nunca e duplicada.
 */
function gerarCompetencia(competencia, quem) {
  const base = competenciaParaData(competencia);
  if (!base) throw new Error('Competencia invalida: ' + competencia);

  const ano = base.getFullYear(), mes = base.getMonth();
  const sigla = SIGLAS[mes];
  const existentes = {};
  listar('ATIVIDADES', true).forEach(function (a) { existentes[String(a.ID)] = true; });

  const equipe = coordenadoresPorTurno();
  const novas = [];

  listar('ROTINAS').filter(function (r) { return marcado(r.ATIVO); }).forEach(function (rotina) {
    datasDaRotina(rotina, ano, mes).forEach(function (data) {
      const turnos = marcado(rotina.POR_TURNO) ? TURNOS : ['Todos'];
      turnos.forEach(function (turno) {
        const semana = data ? semanaISO(data) : 'S00';
        const sufixo = (turno === 'Todos') ? 'T' : turno;
        const id = sigla + '-' + semana + '-' + rotina.TIPO + '-' + sufixo;
        if (existentes[id]) return;

        const pessoa = (turno === 'Todos')
          ? { nome: 'Gerencia + coordenadores', email: '' }
          : (equipe[turno] || { nome: '', email: '' });

        novas.push({
          ID: id,
          COMPETENCIA: competencia,
          SEMANA: semana,
          PRAZO: data ? paraISO(data) : '',
          ATIVIDADE: rotina.ATIVIDADE,
          TIPO: rotina.TIPO,
          TURNO: turno,
          COORDENADOR: pessoa.nome,
          COORDENADOR_EMAIL: pessoa.email,
          SETOR: '',
          ANEXOS: '', ENTREGUE_EM: '', VALIDACAO: '', MOTIVO: '',
          STATUS: data ? STATUS.PENDENTE : STATUS.NAO_AGENDADO
        });
        existentes[id] = true;
      });
    });
  });

  // Uma escrita so. Antes eram ~30 appendRow — 30 idas ao servidor, e o
  // botao parecia nao fazer nada porque a chamada demorava demais.
  if (novas.length) {
    const aba = abaDe('ATIVIDADES');
    const colunas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });
    const agora = agoraTexto();
    const bloco = novas.map(function (r) {
      r.CRIADO_EM = agora; r.CRIADO_POR = quem || 'sistema';
      r.ATUALIZADO_EM = agora; r.ATUALIZADO_POR = quem || 'sistema'; r.EXCLUIDO = 'NAO';
      return colunas.map(function (c) { return r[c] === undefined ? '' : r[c]; });
    });
    aba.getRange(aba.getLastRow() + 1, 1, bloco.length, colunas.length).setValues(bloco);
    esquecerLeituras();
  }
  limparCache();
  registrarLog(quem || 'sistema', 'GERAR MES', 'ATIVIDADES', competencia, novas.length + ' atividades');
  return { ok: true, competencia: competencia, criadas: novas.length };
}

/** Datas em que uma rotina cai dentro do mes. Avulsa devolve vagas sem data. */
function datasDaRotina(rotina, ano, mes) {
  const freq = String(rotina.FREQUENCIA || '').toUpperCase().trim();

  if (freq === 'SEMANAL') return diasDoMesEm(ano, mes, Number(rotina.DIA) || 3);

  if (freq === 'MENSAL') {
    const regra = String(rotina.DIA || '').toUpperCase().trim();
    if (regra === 'PRIMEIRA_SEGUNDA') return [primeiraSegunda(ano, mes)].filter(Boolean);
    if (regra === 'ULTIMA_SEXTA') return [ultimaSexta(ano, mes)].filter(Boolean);
    const dia = Number(regra);
    return dia ? [new Date(ano, mes, dia)] : [];
  }

  if (freq === 'AVULSA') {
    const vagas = Number(rotina.QUANTIDADE) || 1;
    const saida = [];
    for (let i = 0; i < vagas; i++) saida.push(null);  // sem data: "Nao agendado"
    return saida;
  }
  return [];
}

/** Vaga avulsa recebe indice no ID para nao colidir: AGO-S00-TRE-T-2 */
var _equipeMemo = null;

/*
 * Turno de uma pessoa da EQUIPE.
 *
 * Na planilha original nao existe coluna de turno: ele vem escrito dentro
 * do PAPEL ("Coordenador . Turno A (manha)"). Aqui aceitamos os dois: a
 * coluna TURNO, se preenchida; senao, extraimos a letra do papel. Assim
 * quem cadastrou so o papel nao fica sem coordenador na tela.
 */
function turnoDaPessoa(p) {
  const direto = String(p.TURNO || '').toUpperCase().trim();
  if (direto) return direto;

  const papel = String(p.PAPEL || '').toUpperCase();
  // "TURNO A", "TURNO-B", "TURNO: C" ... e tambem ADM / J / BC
  const m = papel.match(/TURNO\s*[:\-\u00b7]?\s*(ADM|BC|[ABCJ])\b/);
  if (m) return m[1];
  if (papel.indexOf('ADMINISTRADOR') !== -1) return '';
  return '';
}

function coordenadoresPorTurno() {
  if (_equipeMemo) return _equipeMemo;
  const mapa = {};
  listar('EQUIPE').filter(function (p) { return marcado(p.ATIVO); }).forEach(function (p) {
    const t = turnoDaPessoa(p);
    if (t && !mapa[t]) {
      mapa[t] = { nome: String(p.NOME || '').trim(), email: String(p.EMAIL || '').toLowerCase().trim() };
    }
  });
  _equipeMemo = mapa;
  return mapa;
}

/** Gera manualmente uma competencia — o gerente adianta um mes sem esperar o gatilho. */
function acaoGerarMes(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const competencia = String(params.competencia || '').trim();
  if (!competenciaParaData(competencia)) throw new Error('Competencia invalida.');
  const jaTem = listar('ATIVIDADES', true).some(function (a) {
    return normalizarCompetencia(a.COMPETENCIA) === competencia;
  });
  if (jaTem) return { ok: true, jaExistia: true, competencia: competencia };
  gerarCompetencia(competencia, usuario.email);
  return { ok: true, competencia: competencia };
}

/**
 * Gera o mes seguinte quando chega o dia configurado (padrao 20).
 * Equivalente ao gerarMesSeNecessario() da planilha.
 */
function gerarMesSeNecessario() {
  const diaGatilho = Number(parametro('GERAR_MES_NO_DIA', 20));
  const agora = hoje();
  if (agora.getDate() < diaGatilho) return { ok: true, gerado: false };

  const proximo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const competencia = competenciaDe(proximo);
  const jaExiste = listar('ATIVIDADES', true).some(function (a) { return a.COMPETENCIA === competencia; });
  if (jaExiste) return { ok: true, gerado: false };

  const r = gerarCompetencia(competencia, 'sistema');
  return { ok: true, gerado: true, competencia: competencia, criadas: r.criadas };
}

/* ------------------------------------------------------------------ */
/* LEITURA                                                             */
/* ------------------------------------------------------------------ */

function dadosCalendario(usuario, params) {
  let competencia = params.competencia || competenciaDe(hoje());
  // Blindagem: se pedirem um mes que ja passou (link antigo, cache), joga
  // para o mes atual — mes vencido nao deve mais ser aberto.
  const dPed = competenciaParaData(competencia);
  if (dPed && (dPed.getFullYear() * 12 + dPed.getMonth()) < (hoje().getFullYear() * 12 + hoje().getMonth())) {
    competencia = competenciaDe(hoje());
  }
  const escopo = escopoDe(usuario);

  /*
   * O mes nasce sozinho. Na planilha, abrir a aba do mes ja mostra as
   * atividades porque a aba foi gerada do MODELO. Aqui a competencia
   * pedida e materializada a partir das ROTINAS na primeira vez que
   * alguem a abre — sem botao, do mesmo jeito que la. So o gerente/adm
   * dispara a criacao; um coordenador que chega antes ve o mes ja pronto.
   */
  /*
   * DESEMPENHO: antes a tela lia a tabela DUAS vezes inteiras — uma em
   * garantirCompetencia (so para saber se o mes existe) e outra para
   * montar. E hidratava TODAS as atividades de todos os meses para depois
   * jogar fora as dos outros. Agora:
   *   1. le a tabela CRUA uma vez so;
   *   2. filtra o mes ainda cru (comparacao de texto, barata);
   *   3. hidrata SO as linhas do mes.
   * Com varios meses acumulados, isso e a diferenca entre segundos e
   * instantaneo — era o "Carregando..." demorado.
   */
  const cruas = listar('ATIVIDADES');
  const existeMes = cruas.some(function (a) {
    return normalizarCompetencia(a.COMPETENCIA) === competencia;
  });
  if (!existeMes) {
    // So gera se ainda nao existe; quem nao programa apenas ve vazio.
    if (competenciaParaData(competencia) && podeFazer(usuario, 'PROGRAMAR')) {
      try { gerarCompetencia(competencia, usuario.email); } catch (e) { /* segue */ }
    }
  }

  const fonte = existeMes ? cruas : listar('ATIVIDADES');
  const todas = fonte.filter(function (a) {
    return normalizarCompetencia(a.COMPETENCIA) === competencia;
  }).map(hidratar);

  // Cancelada some de TUDO — calendario, tabela de gestao e contagens —
  // exatamente como na planilha ("saiu do mostrador e das contagens").
  const doMes = todas.filter(function (a) { return a.competencia === competencia; })
                     .filter(function (a) { return a.status !== STATUS.CANCELADA; })
                     .filter(function (a) { return dentroDoEscopo(a, escopo); });


  doMes.sort(function (a, b) { return String(a.prazoISO).localeCompare(String(b.prazoISO)); });

  const base = competenciaParaData(competencia) || hoje();

  return {
    competencia: competencia,
    competenciasDisponiveis: competenciasExistentes(cruas),
    grade: montarGrade(base, doMes),
    /*
     * Na planilha, treinamento nao mora na tabela GESTAO DE ATIVIDADES: ele
     * tem a faixa verde propria embaixo, porque e vaga que o gerente marca,
     * nao rotina que nasce com o mes. Aqui e a mesma separacao.
     */
    atividades: doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; }),
    treinamentos: doMes.filter(function (a) { return a.tipo === 'TRE'; }),
    canceladas: atividadesCanceladas(competencia, escopo),
    mesPassado: (function () { const d = competenciaParaData(competencia); return d ? (d.getFullYear() * 12 + d.getMonth()) < (hoje().getFullYear() * 12 + hoje().getMonth()) : false; })(),
    naoAgendadas: doMes.filter(function (a) { return !a.prazoISO && a.tipo !== 'TRE'; }),
    resumo: resumirStatus(doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; })),
    andamento: linhaAndamento(doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; })),
    porTurno: TURNOS.map(function (t) { return resumoTurno(doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; }), t); }),
    setores: listar('SETORES').filter(function (s) { return marcado(s.ATIVO); })
                              .map(function (s) { return s.SETOR; }),
    equipe: listar('EQUIPE').filter(function (p) { return marcado(p.ATIVO) && String(p.TURNO || '').trim(); })
                            .map(function (p) { return { turno: String(p.TURNO).toUpperCase().trim(), nome: String(p.NOME || '').trim() }; }),
    validacoes: VALIDACOES,
    permissoes: {
      entregar: podeFazer(usuario, 'ENTREGAR') || podeFazer(usuario, 'ANEXAR'),
      validar: podeFazer(usuario, 'VALIDAR'),
      programar: podeFazer(usuario, 'PROGRAMAR'),
      editar: podeFazer(usuario, 'EDITAR')
    }
  };
}

/** A faixa do topo da aba: "EM ANDAMENTO — 3 de 15 aprovadas · 4 em atraso". */
function linhaAndamento(lista) {
  const c = resumirStatus(lista);
  const partes = [c.aprovadas + ' de ' + c.total + ' atividades aprovadas'];
  if (c.atrasadas) partes.push(c.atrasadas + ' em atraso');
  if (c.aguardando) partes.push(c.aguardando + ' aguardando validacao');
  return {
    titulo: c.atrasadas ? 'COM ATRASOS' : (c.total && c.aprovadas === c.total ? 'MES CONCLUIDO' : 'EM ANDAMENTO'),
    nivel: c.atrasadas ? 'atraso' : (c.total && c.aprovadas === c.total ? 'ok' : 'andamento'),
    texto: partes.join(' \u00b7 ')
  };
}

/**
 * Garante que a competencia exista. Se ja tem atividade, nao faz nada.
 * Se nao tem e a pessoa pode programar, gera das rotinas na hora.
 */
function garantirCompetencia(competencia, usuario) {
  const existe = listar('ATIVIDADES', true).some(function (a) {
    return normalizarCompetencia(a.COMPETENCIA) === competencia;
  });
  if (existe) return false;
  if (!competenciaParaData(competencia)) return false;
  if (!podeFazer(usuario, 'PROGRAMAR')) return false;   // coordenador espera o gerente abrir
  try { gerarCompetencia(competencia, usuario.email); return true; }
  catch (e) { return false; }
}

/*
 * Uma celula de COMPETENCIA que o Google tenha lido como data volta como
 * objeto Date; sem tratar, o seletor de meses mostrava "Wed Jul 01 2026
 * 00:00:00 GMT-0300" em vez de "JUL 2026". Aqui todo valor vira a sigla
 * de tres letras + ano, seja ele texto ou data.
 */
function normalizarCompetencia(valor) {
  if (valor instanceof Date) return competenciaDe(valor);
  const s = String(valor || '').toUpperCase().trim();
  return competenciaParaData(s) ? s : s;
}

function competenciasExistentes(jaLidas) {
  const vistas = {};
  const base = hoje();
  const ordAtual = base.getFullYear() * 12 + base.getMonth();

  // meses que ja tem atividade — mas SO do mes atual em diante. Meses que
  // ja passaram nao aparecem no seletor: sem eles na navegacao, ninguem
  // cai num mes velho cheio de "atrasadas", e os indicadores nunca mostram
  // numero de mes vencido. E o comportamento que a gestao espera.
  // Reaproveita a leitura que a tela ja fez — sem isso era mais uma
  // varredura da tabela inteira a cada abertura.
  (jaLidas || listar('ATIVIDADES', true)).forEach(function (a) {
    const c = normalizarCompetencia(a.COMPETENCIA);
    if (!c) return;
    const d = competenciaParaData(c);
    if (d && (d.getFullYear() * 12 + d.getMonth()) >= ordAtual) vistas[c] = true;
  });

  // + janela navegavel para frente: do mes atual ate 6 meses a frente.
  for (let i = 0; i <= 6; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    vistas[competenciaDe(d)] = true;
  }
  return Object.keys(vistas).sort(function (a, b) {
    const da = competenciaParaData(a), db = competenciaParaData(b);
    return (da && db) ? da - db : 0;
  });
}

/**
 * Cancela todas as atividades ainda pendentes de uma competencia passada.
 * Usado para "fechar" um mes que ja passou: elas somem do mostrador e das
 * contagens, mas ficam no arquivo (recuperaveis).
 */
function acaoCancelarCompetencia(usuario, params) {
  exigirCapacidade(usuario, 'VALIDAR');
  const competencia = String(params.competencia || '').trim();
  const motivo = String(params.motivo || '').trim() || 'Mes encerrado pela gestao.';
  let n = 0;
  listar('ATIVIDADES').map(hidratar).forEach(function (a) {
    if (a.competencia !== competencia) return;
    if (a.status === STATUS.CANCELADA || a.status === STATUS.APROVADA) return;
    atualizar('ATIVIDADES', a.id, { VALIDACAO: 'Cancelada', MOTIVO: motivo, STATUS: STATUS.CANCELADA }, usuario.email);
    n++;
  });
  return { ok: true, canceladas: n };
}

/**
 * Reativa uma atividade cancelada: limpa a validacao e o status volta a ser
 * calculado pelo prazo. E o "restaurar" que faltava.
 */
function acaoReativarAtividade(usuario, params) {
  exigirCapacidade(usuario, 'VALIDAR');
  const a = obter('ATIVIDADES', params.id);
  if (!a) throw new Error('Atividade nao encontrada.');
  atualizar('ATIVIDADES', params.id, {
    VALIDACAO: '', MOTIVO: '',
    STATUS: statusDe(paraData(a.PRAZO), a.ENTREGUE_EM, '')
  }, usuario.email);
  return { ok: true };
}

/** Lista as canceladas de uma competencia — alimenta a tela de arquivo. */
function atividadesCanceladas(competencia, escopo) {
  return listar('ATIVIDADES').map(hidratar)
    .filter(function (a) { return a.competencia === competencia && a.status === STATUS.CANCELADA; })
    .filter(function (a) { return dentroDoEscopo(a, escopo); });
}

/*
 * Coordenador de uma atividade. Se a linha ja tem o nome gravado, usa ele.
 * Se esta vazio (atividade gerada antes de a equipe ser cadastrada), puxa
 * da EQUIPE atual pelo turno — assim os tracos "—" somem sem precisar
 * regerar o mes. Turno "Todos" mostra a gestao.
 */
function coordenadorDaLinha(r) {
  const nomeGravado = String(r.COORDENADOR || '').trim();
  const emailGravado = String(r.COORDENADOR_EMAIL || '').toLowerCase().trim();
  if (nomeGravado) return { nome: nomeGravado, email: emailGravado };

  const turno = String(r.TURNO || '').toUpperCase().trim();
  if (turno === 'TODOS' || turno === '') return { nome: 'Gerencia + coordenadores', email: emailGravado };
  const equipe = coordenadoresPorTurno();
  const p = equipe[turno];
  return p ? { nome: p.nome, email: p.email || emailGravado } : { nome: '', email: emailGravado };
}

function hidratar(r) {
  const prazo = paraData(r.PRAZO);
  const validacao = String(r.VALIDACAO || '').trim();
  const entregue = String(r.ENTREGUE_EM || '').trim();
  // Metadado de anexo custa uma chamada ao Drive por arquivo. Na lista basta
  // a contagem; nome e tamanho so quando a atividade e aberta.
  const idsAnexos = idsDeAnexos(r.ANEXOS);

  return {
    id: String(r.ID || ''),
    competencia: normalizarCompetencia(r.COMPETENCIA),
    semana: String(r.SEMANA || ''),
    prazo: formatarData(prazo),
    prazoISO: prazo ? paraISO(prazo) : '',
    diaSemana: prazo ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][prazo.getDay()] : '',
    atividade: String(r.ATIVIDADE || '').trim(),
    tipo: String(r.TIPO || '').toUpperCase().trim(),
    turno: String(r.TURNO || '').trim(),
    coordenador: coordenadorDaLinha(r).nome,
    coordenadorEmail: coordenadorDaLinha(r).email,
    setor: String(r.SETOR || '').trim(),
    anexos: idsAnexos,
    qtdAnexos: idsAnexos.length,
    anexoUrl: String(r.ANEXOS || '').trim(),   // link direto do PDF da entrega
    entregue: !!entregue,
    entregueEm: entregue,
    validacao: validacao,
    motivo: String(r.MOTIVO || '').trim(),
    status: statusDe(prazo, entregue, validacao),
    diasAtraso: (prazo && !entregue && !validacao) ? Math.max(0, diaNum(hoje()) - diaNum(prazo)) : 0,
    criadoPor: String(r.CRIADO_POR || '').toLowerCase().trim()
  };
}

/** O status nunca e digitado: e consequencia dos fatos da linha. */
function statusDe(prazo, entregueEm, validacao) {
  if (validacao === 'Aprovado') return STATUS.APROVADA;
  if (validacao === 'Reprovado') return STATUS.REPROVADA;
  if (validacao === 'Cancelada') return STATUS.CANCELADA;
  if (entregueEm) return STATUS.AGUARDANDO;
  if (!prazo) return STATUS.NAO_AGENDADO;
  return (diaNum(prazo) < diaNum(hoje())) ? STATUS.ATRASADA : STATUS.PENDENTE;
}

/** Grade do mes, domingo a sabado, como o calendario visual da planilha. */
function montarGrade(base, atividades) {
  const ano = base.getFullYear(), mes = base.getMonth();
  const porDia = {};
  atividades.forEach(function (a) {
    if (!a.prazoISO) return;
    (porDia[a.prazoISO] = porDia[a.prazoISO] || []).push(a);
  });

  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const semanas = [];
  const hojeIso = hojeISO();

  for (let s = 0; s < 6; s++) {
    const dias = [];
    for (let d = 0; d < 7; d++) {
      const data = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + s * 7 + d);
      const iso = paraISO(data);
      const doDia = porDia[iso] || [];
      /*
       * As cores do calendario da planilha, na mesma ordem de precedencia:
       * amarelo = hoje · vermelho = dia com atraso · azul = dia com prazo ·
       * verde = reuniao com a gerencia (o marco da semana).
       */
      dias.push({
        iso: iso, dia: data.getDate(), doMes: data.getMonth() === mes,
        hoje: iso === hojeIso,
        temPrazo: doDia.length > 0,
        temAtraso: doDia.some(function (a) { return a.status === STATUS.ATRASADA; }),
        reuniao: doDia.some(function (a) { return a.tipo === 'REU'; }),
        itens: doDia.map(function (a) {
          return { id: a.id, tipo: a.tipo, turno: a.turno, status: a.status, atividade: a.atividade, entregue: a.entregue, qtdAnexos: a.qtdAnexos };
        })
      });
    }
    semanas.push(dias);
    if (dias[6].doMes === false && s >= 4) break;
  }
  return semanas;
}

function resumirStatus(lista) {
  const c = { total: 0, aprovadas: 0, aguardando: 0, pendentes: 0, atrasadas: 0, reprovadas: 0, canceladas: 0 };
  lista.forEach(function (a) {
    if (a.status === STATUS.CANCELADA) { c.canceladas++; return; }
    c.total++;
    if (a.status === STATUS.APROVADA) c.aprovadas++;
    else if (a.status === STATUS.AGUARDANDO) c.aguardando++;
    else if (a.status === STATUS.ATRASADA) c.atrasadas++;
    else if (a.status === STATUS.REPROVADA) c.reprovadas++;
    else c.pendentes++;
  });
  c.percentual = c.total ? Math.round((c.aprovadas / c.total) * 100) : 0;
  return c;
}

/** O turno "Todos" conta para os tres — igual ao resumoTurno_ da planilha. */
function resumoTurno(lista, turno) {
  const meus = lista.filter(function (a) {
    return (a.turno === turno || a.turno === 'Todos') && a.status !== STATUS.CANCELADA;
  });
  const r = resumirStatus(meus);
  r.turno = turno;
  return r;
}

/**
 * Diagnostico de acesso — responde "por que nao vejo minhas atividades?".
 * Mostra o que o sistema entende do usuario e casa contra as atividades.
 */
function acaoDiagnosticoAcesso(usuario, params) {
  const escopo = escopoDe(usuario);
  const competencia = (params && params.competencia) || competenciaDe(hoje());
  const todas = listar('ATIVIDADES').map(hidratar)
    .filter(function (a) { return a.competencia === competencia && a.status !== STATUS.CANCELADA; });

  const visiveis = todas.filter(function (a) { return dentroDoEscopo(a, escopo); });
  const turnosNasAtividades = {};
  todas.forEach(function (a) { turnosNasAtividades[a.turno] = (turnosNasAtividades[a.turno] || 0) + 1; });

  return {
    voceEh: {
      email: usuario.email,
      perfil: usuario.perfil,
      turno: usuario.turno || '(vazio)',
      escopo: escopo.tipo,
      escopoTurno: escopo.turno || '(vazio)'
    },
    competencia: competencia,
    totalNoMes: todas.length,
    visiveisParaVoce: visiveis.length,
    turnosDasAtividades: Object.keys(turnosNasAtividades).map(function (t) {
      return t + ': ' + turnosNasAtividades[t];
    }),
    diagnostico: (function () {
      if (escopo.tipo === 'TODOS') return 'Voce tem escopo TODOS — deveria ver tudo (' + todas.length + ').';
      if (escopo.tipo === 'TURNO') {
        if (!escopo.turno) return 'PROBLEMA: seu escopo e TURNO mas seu turno esta VAZIO na tabela de Acessos. Defina o turno (A, B ou C) na sua linha em Acessos.';
        if (!turnosNasAtividades[escopo.turno]) return 'PROBLEMA: seu turno e "' + escopo.turno + '" mas nenhuma atividade do mes tem esse turno. Confira se o turno na sua linha de Acessos bate com o das atividades (' + Object.keys(turnosNasAtividades).join(', ') + ').';
        return 'OK: seu turno "' + escopo.turno + '" casa com ' + turnosNasAtividades[escopo.turno] + ' atividade(s).';
      }
      if (escopo.tipo === 'PROPRIAS') {
        if (visiveis.length === 0) return 'PROBLEMA: escopo PROPRIAS mostra so o que esta atribuido ao seu email (' + usuario.email + '). Nenhuma atividade tem seu email como coordenador. Confira o e-mail na tabela Equipe (Configuracao) — o turno da atividade puxa o coordenador de la.';
        return 'OK: ' + visiveis.length + ' atividade(s) atribuida(s) a voce.';
      }
      return 'Escopo desconhecido.';
    })()
  };
}

function dentroDoEscopo(a, escopo) {
  // POR ORA: todo mundo ve todas as atividades. O filtro por turno/pessoa
  // esta desligado para destravar a operacao — coordenador enxerga tudo.
  // (A logica antiga ficou preservada abaixo, comentada, para religar depois.)
  return true;

  /*
  if (escopo.tipo === 'TODOS') return true;
  if (escopo.tipo === 'PROPRIAS') {
    return a.coordenadorEmail === escopo.email || a.criadoPor === escopo.email;
  }
  if (!escopo.turno) return true;
  return a.turno === escopo.turno || a.turno === 'Todos';
  */
}

/* ------------------------------------------------------------------ */
/* ACOES                                                               */
/* ------------------------------------------------------------------ */

/** Coordenador anexa a entrega. Carimba a hora e avisa a gestao. */
function acaoEntregar(usuario, params) {
  garantirAlcance(usuario, params.id);
  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade nao encontrada.');

  const resultado = anexarArquivo(usuario, 'ATIVIDADES', params.id, params.arquivo);

  const jaEntregue = String(antes.ENTREGUE_EM || '').trim();
  if (!jaEntregue) {
    atualizar('ATIVIDADES', params.id, {
      ENTREGUE_EM: agoraTexto(), STATUS: STATUS.AGUARDANDO
    }, usuario.email);
    avisarEntregaRecebida(hidratar(obter('ATIVIDADES', params.id)), usuario);
  }
  return resultado;
}

/** Gerente aprova, reprova ou cancela. O e-mail sai com o motivo junto. */
function acaoValidar(usuario, params) {
  const validacao = String(params.validacao || '').trim();
  // vazio = reabrir: limpa validacao e motivo, status volta a ser calculado
  if (validacao === '') {
    atualizar('ATIVIDADES', params.id, {
      VALIDACAO: '', MOTIVO: '',
      STATUS: statusDe(paraData(obter('ATIVIDADES', params.id).PRAZO),
                       obter('ATIVIDADES', params.id).ENTREGUE_EM, '')
    }, usuario.email);
    return { ok: true, reaberta: true };
  }
  if (VALIDACOES.indexOf(validacao) === -1) throw new Error('Validacao invalida.');

  const motivo = String(params.motivo || '').trim();
  if (validacao === 'Reprovado' && !motivo) {
    throw new Error('Reprovacao exige motivo: e ele que o coordenador recebe no e-mail.');
  }

  atualizar('ATIVIDADES', params.id, {
    VALIDACAO: validacao, MOTIVO: motivo,
    STATUS: statusDe(paraData(obter('ATIVIDADES', params.id).PRAZO),
                     obter('ATIVIDADES', params.id).ENTREGUE_EM, validacao)
  }, usuario.email);

  try { avisarValidacao(hidratar(obter('ATIVIDADES', params.id)), validacao, usuario); } catch (e) {}
  return { ok: true };
}

/** Gerente define o setor da vistoria — o coordenador e avisado na hora. */
function acaoDefinirSetor(usuario, params) {
  atualizar('ATIVIDADES', params.id, { SETOR: String(params.setor || '').trim() }, usuario.email);
  try { avisarSetorDefinido(hidratar(obter('ATIVIDADES', params.id))); } catch (e) {}
  return { ok: true };
}

/** Remarcacao com motivo — equivalente ao aplicarRemarcacao da planilha. */
function acaoRemarcar(usuario, params) {
  const nova = paraData(params.prazo);
  if (!nova) throw new Error('Informe a nova data.');
  const motivo = String(params.motivo || '').trim();
  if (!motivo) throw new Error('Remarcacao exige motivo.');

  const antes = obter('ATIVIDADES', params.id);
  const prazoAntigo = formatarData(paraData(antes.PRAZO));

  atualizar('ATIVIDADES', params.id, {
    PRAZO: paraISO(nova), SEMANA: semanaISO(nova),
    MOTIVO: ('Remarcada de ' + prazoAntigo + ' para ' + formatarData(nova) + ': ' + motivo)
  }, usuario.email);

  if (params.avisar !== false) { try { avisarRemarcacao(hidratar(obter('ATIVIDADES', params.id)), prazoAntigo, motivo); } catch (e) {} }
  return { ok: true };
}

/**
 * Cancela uma atividade. Nao apaga: marca VALIDACAO = Cancelada, guarda o
 * motivo e sai do calculo de atrasos — igual ao cancelarAtividade da
 * planilha. O coordenador do turno recebe o aviso na hora.
 */
function acaoCancelarAtividade(usuario, params) {
  const motivo = String(params.motivo || '').trim() || 'Cancelada pela gestao.';
  const a = obter('ATIVIDADES', params.id);
  if (!a) throw new Error('Atividade nao encontrada.');

  atualizar('ATIVIDADES', params.id, {
    VALIDACAO: 'Cancelada', MOTIVO: motivo, STATUS: STATUS.CANCELADA
  }, usuario.email);

  try { avisarValidacao(hidratar(obter('ATIVIDADES', params.id)), 'Cancelada', usuario); } catch (e) {}
  return { ok: true };
}

/**
 * Cria uma atividade avulsa — a que o gerente adiciona fora das rotinas
 * (uma tarefa pontual, uma cobranca extra). O ID nasce com sufixo AV para
 * nao colidir com as geradas pelas ROTINAS.
 */
function acaoCriarAtividade(usuario, params) {
  const atividade = String(params.atividade || '').trim();
  if (!atividade) throw new Error('Informe o nome da atividade.');
  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data da atividade.');

  const competencia = competenciaDe(data);
  const turno = String(params.turno || 'Todos').trim();
  const semana = semanaISO(data);

  // ID unico: se ja existe um com o mesmo prefixo, adiciona um contador.
  const sufixo = (turno === 'Todos') ? 'T' : turno;
  const raiz = SIGLAS[data.getMonth()] + '-' + semana + '-AV-' + sufixo;
  const existentes = {};
  listar('ATIVIDADES', true).forEach(function (x) { existentes[String(x.ID)] = true; });
  let id = raiz, n = 2;
  while (existentes[id]) { id = raiz + '-' + n; n++; }

  const equipe = coordenadoresPorTurno();
  const pessoa = (turno === 'Todos')
    ? { nome: 'Gerencia + coordenadores', email: '' }
    : (equipe[turno] || { nome: '', email: '' });

  inserir('ATIVIDADES', {
    ID: id, COMPETENCIA: competencia, SEMANA: semana, PRAZO: paraISO(data),
    ATIVIDADE: atividade, TIPO: 'AV', TURNO: turno,
    COORDENADOR: pessoa.nome, COORDENADOR_EMAIL: pessoa.email,
    SETOR: String(params.setor || '').trim(),
    ANEXOS: '', ENTREGUE_EM: '', VALIDACAO: '', MOTIVO: '', STATUS: STATUS.PENDENTE
  }, usuario.email);

  try { avisarNovaAtividade(hidratar(obter('ATIVIDADES', id))); } catch (e) {}
  return { ok: true, id: id };
}

/** Gerente agenda um treinamento que estava como "Nao agendado". */
function acaoAgendarTreinamento(usuario, params) {
  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data do treinamento.');

  const campos = {
    PRAZO: paraISO(data), SEMANA: semanaISO(data),
    ATIVIDADE: String(params.atividade || '').trim() || obter('ATIVIDADES', params.id).ATIVIDADE,
    STATUS: STATUS.PENDENTE
  };
  // Na planilha o gerente escolhe de qual turno e o treinamento; "Todos"
  // convoca os tres coordenadores.
  if (params.turno) campos.TURNO = String(params.turno).trim();
  atualizar('ATIVIDADES', params.id, campos, usuario.email);

  avisarTreinamento(hidratar(obter('ATIVIDADES', params.id)));
  return { ok: true };
}

/*
 * Nao existe mais "gerar competencia" como botao. O mes nasce sozinho, do
 * mesmo jeito que na planilha: gerarMesSeNecessario() roda no gatilho e
 * cria o mes seguinte a partir da tabela ROTINAS. gerarCompetencia()
 * continua existindo como motor, chamado so por ela.
 */

/** Metadados dos anexos de UMA atividade — chamado ao abrir a janela. */
function acaoDetalhesAtividade(usuario, params) {
  garantirAlcance(usuario, params.id);
  const r = obter('ATIVIDADES', params.id);
  if (!r) throw new Error('Atividade nao encontrada.');
  return { id: params.id, anexos: listarAnexos(r.ANEXOS) };
}

function acaoRemoverAnexoAtividade(usuario, params) {
  garantirAlcance(usuario, params.id);
  return removerAnexo(usuario, 'ATIVIDADES', params.id, params.idArquivo);
}

function garantirAlcance(usuario, id) {
  const escopo = escopoDe(usuario);
  if (escopo.tipo === 'TODOS') return;
  const registro = obter('ATIVIDADES', id);
  if (!registro) throw new Error('Atividade nao encontrada.');
  if (dentroDoEscopo(hidratar(registro), escopo)) return;
  throw new Error('Esta atividade nao esta no seu alcance.');
}
