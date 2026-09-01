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
  if (!base) throw new Error('Competência invalida: ' + competencia);

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

/*
 * Turno -> coordenador. Passou a ler de ACESSOS, que virou o cadastro
 * unico de pessoas: EQUIPE e ACESSOS eram as mesmas pessoas em duas
 * tabelas que nao conversavam, e o coordenador do turno podia estar num
 * cadastro e nao no outro.
 *
 * Prefere quem tem acesso ATIVO; entre dois do mesmo turno, quem for
 * COORDENADOR vem primeiro.
 */
function coordenadoresPorTurno() {
  if (_equipeMemo) return _equipeMemo;
  const mapa = {};
  const candidatos = listar('ACESSOS').filter(function (p) {
    return marcado(p.ATIVO) && String(p.EMAIL || '').trim();
  });
  const nota = function (p) {
    return String(p.PERFIL || '').toUpperCase().trim() === 'COORDENADOR' ? 0 : 1;
  };
  candidatos.sort(function (a, b) { return nota(a) - nota(b); }).forEach(function (p) {
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
  if (!competenciaParaData(competencia)) throw new Error('Competência invalida.');
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
  const competencia = params.competencia || competenciaDe(hoje());
  const escopo = escopoDe(usuario);

  /*
   * MES ENCERRADO.
   *
   * Antes, pedir um mes vencido era redirecionado para o mes atual: "mes
   * vencido nao deve mais ser aberto". A intencao era boa — ninguem cai
   * num mes velho cheio de "atrasadas" por engano — mas o efeito era que
   * agosto simplesmente DEIXAVA DE EXISTIR na virada do mes, e nao havia
   * como consultar o que foi feito. Os dados nunca sairam do banco; era
   * a navegacao que os escondia.
   *
   * Agora o mes vencido abre normalmente, marcado como ENCERRADO. A tela
   * mostra o aviso, o mes fica claramente separado dos que estao
   * correndo, e nada nele e gerado ou recalculado (ver abaixo).
   */
  const dPed = competenciaParaData(competencia);
  const encerrado = !!dPed &&
    (dPed.getFullYear() * 12 + dPed.getMonth()) < (hoje().getFullYear() * 12 + hoje().getMonth());

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

  /*
   * QUAL ATIVIDADE E DESTE MES: manda a DATA DO PRAZO, nao o rotulo.
   *
   * A COMPETENCIA e o rotulo com que a atividade nasceu. Remarcar uma
   * atividade de 29/08 para 01/09 muda o prazo; o rotulo so acompanha se
   * quem remarcou estava rodando uma versao que ja corrigia isso. Toda
   * linha remarcada antes disso ficou com PRAZO em setembro e rotulo AGO,
   * e o resultado era exatamente o que apareceu na tela: a atividade
   * pintada no dia 1 de setembro DENTRO do calendario de agosto (a grade
   * desenha pela data) e ausente do calendario de setembro (a lista
   * filtrava pelo rotulo).
   *
   * Agora o mes de uma atividade e o mes em que ela vence. Rotulo errado
   * deixa de esconder atividade — sem precisar consertar linha nenhuma.
   * Sem prazo (treinamento ainda nao agendado) o rotulo continua valendo,
   * que e a unica informacao que existe.
   *
   * ATENCAO ao ler o PRAZO: a celula NEM SEMPRE volta como texto
   * 'aaaa-mm-dd'. Ela pode vir como objeto Date (planilha antiga, ou
   * linha que o Sheets converteu antes de o formato de texto ser
   * aplicado) ou como '01/09/2026'. A primeira versao desta correcao
   * comparava `String(PRAZO).slice(0,7)` com '2026-09'; nesses dois
   * casos a comparacao falhava, caia no rotulo, e a atividade continuava
   * presa em agosto — so que agora sem aparecer na grade, porque o dia
   * cinza tinha parado de desenhar. Some dos dois lados: foi o que
   * aconteceu. `paraData` entende os tres formatos.
   */
  const alvo = competenciaParaData(competencia);
  const mesAlvo = alvo ? (alvo.getFullYear() * 12 + alvo.getMonth()) : null;
  const doMesPeloPrazo = function (a) {
    const p = paraData(a.PRAZO);
    if (p && mesAlvo !== null) return (p.getFullYear() * 12 + p.getMonth()) === mesAlvo;
    return normalizarCompetencia(a.COMPETENCIA) === competencia;
  };

  /*
   * O MES JA NASCEU? Conta so atividade de ROTINA.
   *
   * Este teste decide se o mes precisa ser materializado a partir das
   * ROTINAS. Ele perguntava "existe QUALQUER atividade neste mes?" — e
   * uma unica avulsa respondia que sim. Foi o que aconteceu com outubro:
   * havia uma AV marcada para 01/10, o mes se declarou pronto, a geracao
   * nunca rodou e o calendario abriu com uma atividade so.
   *
   * Avulsa e o que o gerente acrescenta POR FORA das rotinas; ela nunca
   * pode responder por elas. Treinamento sem data ('S00') tambem nao
   * conta: ele e vaga, nao rotina cumprida.
   */
  const ehDeRotina = function (a) {
    const t = String(a.TIPO || '').toUpperCase().trim();
    return t && t !== 'AV';
  };
  const existeMes = cruas.some(function (a) {
    return ehDeRotina(a) && doMesPeloPrazo(a);
  });

  /*
   * Mes ENCERRADO nunca gera. Sem esta guarda, abrir agosto em setembro
   * criaria as rotinas de agosto do zero — atividades nascendo ja
   * atrasadas, num mes que ninguem pode mais cumprir. Consulta e
   * consulta.
   */
  if (!existeMes && !encerrado) {
    // So gera se ainda nao existe; quem nao programa apenas ve vazio.
    // gerarCompetencia pula ID que ja existe, entao rodar de novo nunca
    // duplica nada — no pior caso nao faz coisa alguma.
    if (dPed && podeFazer(usuario, 'PROGRAMAR')) {
      try { gerarCompetencia(competencia, usuario.email); } catch (e) { /* segue */ }
    }
  }

  const fonte = existeMes ? cruas : listar('ATIVIDADES');
  const todas = fonte.filter(doMesPeloPrazo).map(hidratar);

  // Cancelada some de TUDO — calendario, tabela de gestao e contagens —
  // exatamente como na planilha ("saiu do mostrador e das contagens").
  const doMes = todas.filter(function (a) { return a.status !== STATUS.CANCELADA; })
                     .filter(function (a) { return dentroDoEscopo(a, escopo); });


  doMes.sort(function (a, b) { return String(a.prazoISO).localeCompare(String(b.prazoISO)); });

  const base = competenciaParaData(competencia) || hoje();
  const meses = competenciasExistentes(cruas);

  return {
    competencia: competencia,
    encerrado: encerrado,
    competenciasDisponiveis: meses,
    // Quais dos meses da tira ja se encerraram — a tira precisa saber
    // para separar o que passou do que esta correndo.
    competenciasEncerradas: mesesEncerrados(meses),
    grade: montarGrade(base, doMes),
    /*
     * Na planilha, treinamento nao mora na tabela GESTAO DE ATIVIDADES: ele
     * tem a faixa verde propria embaixo, porque e vaga que o gerente marca,
     * nao rotina que nasce com o mes. Aqui e a mesma separacao.
     */
    atividades: doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; }),
    treinamentos: doMes.filter(function (a) { return a.tipo === 'TRE'; }),
    // Reaproveita a lista que ja foi hidratada acima. Antes chamava
    // atividadesCanceladas(), que fazia listar('ATIVIDADES').map(hidratar)
    // de novo — hidratava TODOS os meses so para pescar as canceladas de
    // um. Era a tabela inteira processada duas vezes por abertura.
    canceladas: atividadesCanceladas(competencia, escopo, todas),
    // Mesmo calculo do `encerrado` la de cima — era repetido aqui em
    // linha, e duas copias da mesma regra e uma delas esperando divergir.
    mesPassado: encerrado,
    naoAgendadas: doMes.filter(function (a) { return !a.prazoISO && a.tipo !== 'TRE'; }),
    resumo: resumirStatus(doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; })),
    andamento: linhaAndamento(doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; })),
    porTurno: TURNOS.map(function (t) { return resumoTurno(doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; }), t); }),
    setores: listar('SETORES').filter(function (s) { return marcado(s.ATIVO); })
                              .map(function (s) { return s.SETOR; }),
    equipe: listar('ACESSOS').filter(function (p) { return marcado(p.ATIVO) && String(p.TURNO || '').trim(); })
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
 *
 * NAO E MAIS CHAMADA: dadosCalendario passou a fazer isso em linha, para
 * aproveitar a leitura crua que ela ja tinha feito. Mantida porque e a
 * unica forma de materializar um mes fora da tela (util no editor e para
 * qualquer rotina futura), e removida ela seria funcionalidade a menos.
 * Se um dia for chamada de novo, note que ela le a tabela com
 * incluirExcluidos = true — leitura que nao passa pelo cache.
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

/*
 * Os meses que a tira mostra.
 *
 * Esta funcao descartava tudo que ja tinha passado. O motivo declarado
 * era nao deixar ninguem cair num mes velho cheio de "atrasadas" — mas o
 * preco era alto demais: na virada do mes, agosto inteiro desaparecia da
 * navegacao e nao havia mais como consultar o que a operacao entregou.
 * Historico nao e o mesmo problema que "mes errado aberto por engano";
 * o segundo se resolve com um aviso na tela, nao apagando o primeiro.
 *
 * Agora entram: os meses vencidos QUE TEM ATIVIDADE (nunca um mes vazio
 * do passado, que so poluiria a tira), o mes atual e os seis a frente.
 * A tela marca os vencidos como encerrados.
 */
function competenciasExistentes(jaLidas) {
  const vistas = {};
  const base = hoje();

  // Meses que ja tem atividade — inclusive os que ja passaram. Reaproveita
  // a leitura que a tela ja fez; sem isso era mais uma varredura da tabela
  // inteira a cada abertura.
  (jaLidas || listar('ATIVIDADES', true)).forEach(function (a) {
    const prazo = paraData(a.PRAZO);
    const c = prazo ? competenciaDe(prazo) : normalizarCompetencia(a.COMPETENCIA);
    if (c && competenciaParaData(c)) vistas[c] = true;
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

/** Quais competencias da lista ja se encerraram (mes anterior ao atual). */
function mesesEncerrados(lista) {
  const base = hoje();
  const ordAtual = base.getFullYear() * 12 + base.getMonth();
  return (lista || []).filter(function (c) {
    const d = competenciaParaData(c);
    return !!d && (d.getFullYear() * 12 + d.getMonth()) < ordAtual;
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
  /*
   * DESEMPENHO: era um `atualizar()` por atividade. Cada um custa trava,
   * leitura do cabecalho, varredura da coluna ID, escrita da linha, troca
   * de geracao e log — umas seis idas ao Google. Com 30 atividades no mes
   * eram ~180 chamadas, e o botao parecia travado. Agora e UMA leitura e
   * UMA escrita, independentemente do tamanho do mes.
   *
   * Filtra CRU antes de hidratar: hidratar a tabela inteira so para
   * descobrir o status de 30 linhas era trabalho jogado fora.
   */
  const alvos = listar('ATIVIDADES').filter(function (r) {
    return normalizarCompetencia(r.COMPETENCIA) === competencia;
  }).map(hidratar).filter(function (a) {
    return a.status !== STATUS.CANCELADA && a.status !== STATUS.APROVADA;
  });

  const r = atualizarVarios('ATIVIDADES', alvos.map(function (a) {
    return { id: a.id, campos: { VALIDACAO: 'Cancelada', MOTIVO: motivo, STATUS: STATUS.CANCELADA } };
  }), usuario.email);

  return { ok: true, canceladas: r.alterados };
}

/**
 * Reativa uma atividade cancelada: limpa a validacao e o status volta a ser
 * calculado pelo prazo. E o "restaurar" que faltava.
 */
function acaoReativarAtividade(usuario, params) {
  exigirCapacidade(usuario, 'VALIDAR');
  const a = obter('ATIVIDADES', params.id);
  if (!a) throw new Error('Atividade não encontrada.');
  atualizar('ATIVIDADES', params.id, {
    VALIDACAO: '', MOTIVO: '',
    STATUS: statusDe(paraData(a.PRAZO), a.ENTREGUE_EM, '')
  }, usuario.email);
  return { ok: true };
}

/**
 * Lista as canceladas de uma competencia — alimenta a tela de arquivo.
 * `jaHidratadas` evita reprocessar a tabela quando quem chamou ja tem a
 * lista pronta (e o caso de dadosCalendario).
 */
/*
 * CONSERTO DE ROTULO.
 *
 * A tela ja passou a decidir o mes pela data do prazo, entao rotulo
 * errado nao esconde mais nada. Mas a COMPETENCIA continua sendo o que o
 * digesto, a Central e as contagens leem — deixa-la errada e guardar uma
 * mentira no banco. Esta funcao alinha o rotulo e a semana ao prazo de
 * cada atividade, numa gravacao em lote. Roda no botao "Atualizar dados"
 * e na rotina diaria; nao toca em quem ja esta certo.
 *
 * O ID nao muda: ele nomeia a pasta dos anexos no Drive e e referencia em
 * e-mail ja enviado. Um AGO-S35-AV-T vencendo em setembro fica com o ID
 * de origem, como acontece na planilha.
 */
function corrigirCompetencias(quem) {
  const mudancas = [];
  listar('ATIVIDADES').forEach(function (a) {
    const prazo = paraData(a.PRAZO);
    if (!prazo) return;
    const certa = competenciaDe(prazo);
    const certaSemana = semanaISO(prazo);
    const campos = {};
    if (normalizarCompetencia(a.COMPETENCIA) !== certa) campos.COMPETENCIA = certa;
    if (String(a.SEMANA || '').trim() !== certaSemana) campos.SEMANA = certaSemana;
    if (Object.keys(campos).length) mudancas.push({ id: String(a.ID), campos: campos });
  });
  if (!mudancas.length) return { ok: true, corrigidas: 0 };
  atualizarVarios('ATIVIDADES', mudancas, quem || 'sistema');
  limparCache('ATIVIDADES');
  return { ok: true, corrigidas: mudancas.length };
}

function atividadesCanceladas(competencia, escopo, jaHidratadas) {
  // Quando a lista ja chega restrita ao mes (pelo prazo), refiltrar pelo
  // rotulo so faria a cancelada mal rotulada sumir de novo.
  const base = jaHidratadas || listar('ATIVIDADES').map(hidratar)
    .filter(function (a) { return a.competencia === competencia; });
  return base
    .filter(function (a) { return a.status === STATUS.CANCELADA; })
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

/*
 * DESEMPENHO desta funcao (ela roda uma vez por LINHA da tabela):
 *   - coordenadorDaLinha(r) era chamado DUAS vezes (nome e e-mail),
 *     e ele consulta o mapa da EQUIPE. Agora uma vez so.
 *   - diaNum(hoje()) aparecia aqui e mais uma vez dentro de statusDe():
 *     dois Utilities.formatDate por linha para descobrir sempre o mesmo
 *     "hoje". Virou hojeNum(), calculado uma vez por execucao.
 *   - o numero do dia do prazo passou a viajar junto (prazoNum), entao a
 *     Central, os insights e o digesto param de recalcular a mesma coisa
 *     em cada filtro que fazem sobre a lista.
 */
function hidratar(r) {
  const prazo = paraData(r.PRAZO);
  const prazoISO = prazo ? paraISO(prazo) : '';
  const prazoNum = prazoISO ? diaNumISO(prazoISO) : null;
  const validacao = String(r.VALIDACAO || '').trim();
  const entregue = String(r.ENTREGUE_EM || '').trim();
  // Metadado de anexo custa uma chamada ao Drive por arquivo. Na lista basta
  // a contagem; nome e tamanho so quando a atividade e aberta.
  const idsAnexos = idsDeAnexos(r.ANEXOS);
  const coord = coordenadorDaLinha(r);

  return {
    id: String(r.ID || ''),
    competencia: normalizarCompetencia(r.COMPETENCIA),
    semana: String(r.SEMANA || ''),
    prazo: formatarData(prazo),
    prazoISO: prazoISO,
    prazoNum: prazoNum,
    diaSemana: prazo ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][prazo.getDay()] : '',
    atividade: String(r.ATIVIDADE || '').trim(),
    tipo: String(r.TIPO || '').toUpperCase().trim(),
    turno: String(r.TURNO || '').trim(),
    coordenador: coord.nome,
    coordenadorEmail: coord.email,
    setor: String(r.SETOR || '').trim(),
    anexos: idsAnexos,
    qtdAnexos: idsAnexos.length,
    // Link direto da entrega. A coluna pode trazer URL (entrega em PDF) ou
    // IDs do Drive (anexo avulso); urlDeAnexo() resolve os dois.
    anexoUrl: urlDeAnexo(r.ANEXOS),
    entregue: !!entregue,
    entregueEm: entregue,
    validacao: validacao,
    motivo: String(r.MOTIVO || '').trim(),
    status: statusDe(prazoISO, entregue, validacao),
    diasAtraso: (prazoNum !== null && !entregue && !validacao)
      ? Math.max(0, hojeNum() - prazoNum) : 0,
    criadoPor: String(r.CRIADO_POR || '').toLowerCase().trim()
  };
}

/*
 * O status nunca e digitado: e consequencia dos fatos da linha.
 * Aceita o prazo como Date (chamadas antigas) ou como texto aaaa-mm-dd
 * (caminho novo, sem nenhum Utilities.formatDate).
 */
function statusDe(prazo, entregueEm, validacao) {
  if (validacao === 'Aprovado') return STATUS.APROVADA;
  if (validacao === 'Reprovado') return STATUS.REPROVADA;
  if (validacao === 'Cancelada') return STATUS.CANCELADA;
  if (entregueEm) return STATUS.AGUARDANDO;
  if (!prazo) return STATUS.NAO_AGENDADO;
  const dia = (prazo instanceof Date) ? diaNumISO(paraISO(prazo)) : diaNumISO(prazo);
  if (isNaN(dia)) return STATUS.NAO_AGENDADO;
  return (dia < hojeNum()) ? STATUS.ATRASADA : STATUS.PENDENTE;
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
      const desteMes = data.getMonth() === mes;
      /*
       * Dia cinza (sobra da semana que atravessa o mes) nao carrega mais
       * atividade. Ele mostrava o compromisso do mes vizinho como se
       * fosse deste, e a mesma atividade parecia existir em agosto e nao
       * existir em setembro.
       */
      const doDia = desteMes ? (porDia[iso] || []) : [];
      /*
       * As cores do calendario da planilha, na mesma ordem de precedencia:
       * amarelo = hoje · vermelho = dia com atraso · azul = dia com prazo ·
       * verde = reuniao com a gerencia (o marco da semana).
       */
      dias.push({
        iso: iso, dia: data.getDate(), doMes: desteMes,
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

/*
 * DEPOIS DE GRAVAR, NAO RELEIA.
 *
 * Toda acao fazia `atualizar(...)` e logo em seguida
 * `hidratar(obter('ATIVIDADES', id))` so para montar o e-mail. Mas
 * `atualizar` chama `limparCache`, que chama `esquecerLeituras()`: aquele
 * `obter` relia a aba ATIVIDADES INTEIRA — uma leitura completa da tabela
 * por clique de botao. Como sabemos exatamente quais campos mudaram,
 * basta aplica-los sobre o registro que ja tinhamos em maos.
 */
function comCampos_(registro, campos) {
  const copia = {};
  Object.keys(registro || {}).forEach(function (k) { copia[k] = registro[k]; });
  Object.keys(campos || {}).forEach(function (k) { copia[k.toUpperCase()] = campos[k]; });
  return copia;
}

/** Coordenador anexa a entrega. Carimba a hora e avisa a gestao. */
function acaoEntregar(usuario, params) {
  garantirAlcance(usuario, params.id);
  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade não encontrada.');

  const resultado = anexarArquivo(usuario, 'ATIVIDADES', params.id, params.arquivo);

  const jaEntregue = String(antes.ENTREGUE_EM || '').trim();
  if (!jaEntregue) {
    const campos = { ENTREGUE_EM: agoraTexto(), STATUS: STATUS.AGUARDANDO };
    atualizar('ATIVIDADES', params.id, campos, usuario.email);

    // Copia em memoria do registro ja atualizado, para montar o aviso sem
    // reler a tabela. A coluna ANEXOS foi gravada pelo anexarArquivo acima,
    // que devolve a lista nova — por isso ela entra aqui, e nao no
    // `campos` (que ja foi gravado).
    const depois = comCampos_(antes, campos);
    if (resultado && resultado.anexosDoRegistro !== undefined) {
      depois.ANEXOS = resultado.anexosDoRegistro;
    }
    /*
     * O aviso NAO pode derrubar uma entrega ja gravada. enviar() passou a
     * lancar excecao quando o e-mail falha (mudanca deliberada, para o
     * erro nao morrer no log) — mas aqui a atividade ja esta carimbada
     * como entregue. Sem este try, a pessoa via um erro e reenviava o
     * arquivo. A rota de entrega em PDF ja se protegia assim; agora as
     * duas se comportam igual, e a falha volta como aviso, nao como erro.
     */
    try {
      avisarEntregaRecebida(hidratar(depois), usuario);
    } catch (e) {
      resultado.avisoEmail = 'A entrega foi gravada, mas o e-mail para a gestao nao saiu: ' +
                             (e.message || e);
    }
  }
  return resultado;
}

/** Gerente aprova, reprova ou cancela. O e-mail sai com o motivo junto. */
function acaoValidar(usuario, params) {
  const validacao = String(params.validacao || '').trim();

  /*
   * Antes esta funcao chamava obter() ate QUATRO vezes — duas delas na
   * mesma expressao — e sem checar nulo: um ID inexistente estourava em
   * "Cannot read properties of null". Agora le uma vez, valida, e monta o
   * registro atualizado em memoria (sem a releitura completa da tabela
   * que o obter() pos-gravacao provocava).
   */
  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade não encontrada.');
  const prazoAtual = paraData(antes.PRAZO);
  const entregueAtual = antes.ENTREGUE_EM;

  // vazio = reabrir: limpa validacao e motivo, status volta a ser calculado
  if (validacao === '') {
    atualizar('ATIVIDADES', params.id, {
      VALIDACAO: '', MOTIVO: '',
      STATUS: statusDe(prazoAtual, entregueAtual, '')
    }, usuario.email);
    return { ok: true, reaberta: true };
  }
  if (VALIDACOES.indexOf(validacao) === -1) throw new Error('Validação invalida.');

  const motivo = String(params.motivo || '').trim();
  if (validacao === 'Reprovado' && !motivo) {
    throw new Error('Reprovação exige motivo: e ele que o coordenador recebe no e-mail.');
  }

  const campos = {
    VALIDACAO: validacao, MOTIVO: motivo,
    STATUS: statusDe(prazoAtual, entregueAtual, validacao)
  };
  atualizar('ATIVIDADES', params.id, campos, usuario.email);

  let avisoEmail = '';
  try { avisarValidacao(hidratar(comCampos_(antes, campos)), validacao, usuario); }
  catch (e) { avisoEmail = 'Validacao gravada, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
  return { ok: true, avisoEmail: avisoEmail };
}

/** Gerente define o setor da vistoria — o coordenador e avisado na hora. */
function acaoDefinirSetor(usuario, params) {
  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade não encontrada.');
  const campos = { SETOR: String(params.setor || '').trim() };
  atualizar('ATIVIDADES', params.id, campos, usuario.email);
  let avisoEmail = '';
  try { avisarSetorDefinido(hidratar(comCampos_(antes, campos))); }
  catch (e) { avisoEmail = 'Setor gravado, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
  return { ok: true, avisoEmail: avisoEmail };
}

/** Remarcacao com motivo — equivalente ao aplicarRemarcacao da planilha. */
function acaoRemarcar(usuario, params) {
  const nova = paraData(params.prazo);
  if (!nova) throw new Error('Informe a nova data.');
  const motivo = String(params.motivo || '').trim();
  if (!motivo) throw new Error('Remarcação exige motivo.');

  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade não encontrada.');
  const prazoAntigo = formatarData(paraData(antes.PRAZO));
  let avisoEmail = '';

  const campos = {
    /*
     * A COMPETENCIA acompanha a data nova. Sem isso, remarcar de 28/08
     * para 03/09 deixava a atividade com competencia AGO: sumia do
     * calendario de setembro e nao encaixava em nenhum dia de agosto.
     */
    PRAZO: paraISO(nova), SEMANA: semanaISO(nova), COMPETENCIA: competenciaDe(nova),
    // Remarcar reabre o prazo: o status tem que ser recalculado, senao a
    // linha continua "Atrasada" mesmo com a data nova la na frente.
    STATUS: statusDe(nova, antes.ENTREGUE_EM, String(antes.VALIDACAO || '').trim()),
    MOTIVO: ('Remarcada de ' + prazoAntigo + ' para ' + formatarData(nova) + ': ' + motivo)
  };
  atualizar('ATIVIDADES', params.id, campos, usuario.email);

  if (params.avisar !== false) {
    try { avisarRemarcacao(hidratar(comCampos_(antes, campos)), prazoAntigo, motivo); }
    catch (e) { avisoEmail = 'Prazo remarcado, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
  }
  return { ok: true, avisoEmail: avisoEmail };
}

/**
 * Cancela uma atividade. Nao apaga: marca VALIDACAO = Cancelada, guarda o
 * motivo e sai do calculo de atrasos — igual ao cancelarAtividade da
 * planilha. O coordenador do turno recebe o aviso na hora.
 */
function acaoCancelarAtividade(usuario, params) {
  const motivo = String(params.motivo || '').trim() || 'Cancelada pela gestao.';
  const a = obter('ATIVIDADES', params.id);
  if (!a) throw new Error('Atividade não encontrada.');

  const campos = { VALIDACAO: 'Cancelada', MOTIVO: motivo, STATUS: STATUS.CANCELADA };
  atualizar('ATIVIDADES', params.id, campos, usuario.email);

  let avisoEmail = '';
  try { avisarValidacao(hidratar(comCampos_(a, campos)), 'Cancelada', usuario); }
  catch (e) { avisoEmail = 'Cancelamento gravado, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
  return { ok: true, avisoEmail: avisoEmail };
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

  const nova = {
    ID: id, COMPETENCIA: competencia, SEMANA: semana, PRAZO: paraISO(data),
    ATIVIDADE: atividade, TIPO: 'AV', TURNO: turno,
    COORDENADOR: pessoa.nome, COORDENADOR_EMAIL: pessoa.email,
    SETOR: String(params.setor || '').trim(),
    ANEXOS: '', ENTREGUE_EM: '', VALIDACAO: '', MOTIVO: '', STATUS: STATUS.PENDENTE
  };
  inserir('ATIVIDADES', nova, usuario.email);

  // O registro acabou de ser montado aqui: nao ha por que reler a tabela
  // inteira so para hidrata-lo.
  /*
   * O aviso nao pode derrubar a atividade ja criada — mas TAMBEM nao pode
   * sumir em silencio. Antes o catch vazio escondia a falha: a atividade
   * nascia, o e-mail nao saia, e ninguem ficava sabendo. Agora o motivo
   * volta como aviso e a tela mostra.
   */
  let avisoEmail = '', avisados = [];
  try { avisados = avisarNovaAtividade(hidratar(nova)) || []; }
  catch (e) { avisoEmail = 'Atividade criada, mas o aviso por e-mail nao saiu: ' + (e.message || e); }

  /*
   * A tela dizia sempre "Atividade criada — coordenador avisado", tendo
   * o e-mail saido ou nao. Agora ela repete os enderecos que receberam:
   * da para conferir na hora se o aviso foi para quem devia.
   */
  const recado = avisados.length
    ? 'Atividade criada — aviso enviado para ' + avisados.join(', ')
    : 'Atividade criada.';
  return { ok: true, id: id, avisoEmail: avisoEmail, recado: recado, avisados: avisados };
}

/** Gerente agenda um treinamento que estava como "Nao agendado". */
function acaoAgendarTreinamento(usuario, params) {
  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data do treinamento.');

  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade não encontrada.');

  const campos = {
    PRAZO: paraISO(data), SEMANA: semanaISO(data),
    ATIVIDADE: String(params.atividade || '').trim() || antes.ATIVIDADE,
    STATUS: STATUS.PENDENTE
  };
  // Na planilha o gerente escolhe de qual turno e o treinamento; "Todos"
  // convoca os tres coordenadores.
  if (params.turno) campos.TURNO = String(params.turno).trim();
  atualizar('ATIVIDADES', params.id, campos, usuario.email);

  // O aviso nao pode desfazer um agendamento ja gravado.
  const resposta = { ok: true };
  try { avisarTreinamento(hidratar(comCampos_(antes, campos))); }
  catch (e) { resposta.avisoEmail = 'Treinamento agendado, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
  return resposta;
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
  if (!r) throw new Error('Atividade não encontrada.');
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
  if (!registro) throw new Error('Atividade não encontrada.');
  if (dentroDoEscopo(hidratar(registro), escopo)) return;
  throw new Error('Esta atividade não esta no seu alcance.');
}
