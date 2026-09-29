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
 * ID: SET26-S36-VIS-A (mes + ano + semana + tipo + turno). As vagas sem
 * data levam indice: SET26-S00-TRE-T-1 ... -5. Atividades antigas ficaram
 * com o ID no padrao da planilha (AGO-S34-VIS-A) e continuam validas.
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
/* ID DAS ATIVIDADES                                                   */
/* ------------------------------------------------------------------ */

/*
 * O ID nasceu sem ano: SET-S36-VIS-A. Na planilha bastava — cada mes era
 * uma aba. Aqui e uma tabela so, e como a geracao pula ID que ja existe,
 * o SET-S36-VIS-A de 2026 impedia o de 2027 de nascer: setembro/2027
 * abria com 11 de 36 atividades, sem aviso nenhum. E as 5 vagas de
 * treinamento tinham o MESMO ID (SET-S00-TRE-T): nascia uma so.
 *
 * Agora o que nasce leva o ano (SET26) e a vaga leva indice (-1..-5).
 * Nada e renomeado: o ID antigo continua nomeando a pasta de anexos e
 * aparecendo em e-mail ja enviado.
 */
function prefixoIdMes_(ano, mes) {
  return SIGLAS[mes] + String(ano).slice(-2);
}

function idDeRotina_(ano, mes, semana, tipo, sufixo, indice) {
  return prefixoIdMes_(ano, mes) + '-' + semana + '-' + tipo + '-' + sufixo + (indice ? '-' + indice : '');
}

/* O mesmo ID no formato antigo (sem ano, sem indice) — so para reconhecer o que ja existe. */
function idDeRotinaAntigo_(mes, semana, tipo, sufixo) {
  return SIGLAS[mes] + '-' + semana + '-' + tipo + '-' + sufixo;
}

/*
 * Anos a que uma linha pode pertencer. O ID antigo nao tem ano, entao ele
 * sai do PRAZO, do rotulo COMPETENCIA e do carimbo de criacao. O ultimo
 * cobre a remarcacao de dezembro para janeiro (prazo e rotulo viram o ano
 * seguinte, a criacao nao). Mes passado nunca e gerado de novo, entao a
 * folga aqui nao tem como esconder atividade de um ano que ainda vem.
 */
function anosDaLinha_(r) {
  const anos = {};
  const p = paraData(r.PRAZO);
  if (p) anos[p.getFullYear()] = true;
  const c = competenciaParaData(normalizarCompetencia(r.COMPETENCIA));
  if (c) anos[c.getFullYear()] = true;
  const criado = anoDoCarimbo(r.CRIADO_EM);
  if (criado) anos[criado] = true;
  return Object.keys(anos).map(Number);
}

/* ------------------------------------------------------------------ */
/* MES JA GERADO — marcador por filial                                 */
/* ------------------------------------------------------------------ */

/*
 * "O mes ja existe?" era respondido olhando se havia LINHA no mes. Uma
 * unica atividade de rotina remarcada de 30/09 para 01/10 (ou um
 * treinamento agendado para outubro) respondia que sim, e outubro inteiro
 * nunca nascia: nem pelo gatilho, nem ao abrir a tela, nem pelo botao
 * "Gerar mes" — que ainda dizia "Mes gerado". Ficava 1 atividade no mes.
 *
 * Agora quem responde e um marcador gravado quando a geracao RODA (uma
 * propriedade por filial). A geracao em si e idempotente — pula ID que
 * ja existe —, entao rodar de novo num mes sem marcador (os antigos,
 * depois desta versao) so completa o que falta.
 */
const MESES_GERADOS_GUARDADOS = 36;

function chaveMesesGerados_() { return 'MESES_GERADOS' + sufixoDaFilial(); }

function mesesGerados_() {
  return String(prop(chaveMesesGerados_(), '') || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
}

/* 'set 2026', Date ou 'SET 2026' -> 'SET 2026'; '' se nao for competencia valida. */
function competenciaNormal_(valor) {
  const d = competenciaParaData(normalizarCompetencia(valor));
  return d ? competenciaDe(d) : '';
}

function mesGerado_(competencia) {
  const c = competenciaNormal_(competencia);
  return !!c && mesesGerados_().indexOf(c) !== -1;
}

/* Chamado DENTRO da trava da geracao: le e grava a lista sem corrida. */
function marcarMesGerado_(competencia) {
  const c = competenciaNormal_(competencia);
  if (!c) return;
  const lista = mesesGerados_();
  if (lista.indexOf(c) !== -1) return;
  lista.push(c);
  // Mes que ja passou nunca e gerado de novo (esta encerrado): basta
  // guardar os ultimos, para a propriedade nao crescer para sempre.
  PropertiesService.getScriptProperties()
    .setProperty(chaveMesesGerados_(), lista.slice(-MESES_GERADOS_GUARDADOS).join(','));
  esquecerProps();
}

/* ------------------------------------------------------------------ */
/* GERACAO DO MES                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cria as atividades de uma competencia inteira a partir da tabela ROTINAS.
 * Idempotente: uma atividade que ja existe (mesmo ID, ou o mesmo ID no
 * formato antigo do MESMO ano) nunca e duplicada. Rodar de novo so
 * completa o que falta — e marca o mes como gerado.
 *
 * CONCORRENCIA: ler os IDs e gravar o lote acontecem DENTRO da trava. Antes
 * era ler, pensar e gravar sem trava; o gatilho das 5h e a rotina diaria
 * (as duas geram o mes) ou dois gerentes abrindo o mes juntos gravavam o
 * mes em dobro — e a copia nunca mais podia ser atualizada (atualizar()
 * acha a primeira linha do ID), ficando "Atrasada" no digesto para sempre.
 */
function gerarCompetencia(competencia, quem, soSeNaoGerado) {
  const base = competenciaParaData(normalizarCompetencia(competencia));
  if (!base) throw new Error('Competência invalida: ' + competencia);

  const ano = base.getFullYear(), mes = base.getMonth();
  const comp = competenciaDe(base);

  return comTrava(function () {
    // Gatilho e tela: se outra execucao marcou o mes enquanto esta esperava
    // a trava, nao ha o que fazer (o botao "Gerar mes" roda sempre, para
    // completar o mes). A comTrava derrubou a memoria: o marcador e o atual.
    if (soSeNaoGerado && mesGerado_(comp)) return { ok: true, competencia: comp, criadas: 0, jaGerado: true };

    // Dentro da trava o listar() relê a planilha: a comTrava derrubou a
    // memoria da execucao, entao o que outra execucao gravou agora aparece.
    const existentes = {}, antigosDoAno = {};
    listar('ATIVIDADES', true).forEach(function (a) {
      const id = String(a.ID || '');
      existentes[id] = true;
      if (anosDaLinha_(a).indexOf(ano) !== -1) antigosDoAno[id] = true;
    });

    const equipe = coordenadoresPorTurno();
    const novas = [];

    listar('ROTINAS').filter(function (r) { return marcado(r.ATIVO); }).forEach(function (rotina) {
      const tipo = String(rotina.TIPO || '').trim();
      if (!tipo) return;
      const turnos = marcado(rotina.POR_TURNO) ? TURNOS : ['Todos'];
      datasDaRotina(rotina, ano, mes).forEach(function (data, i) {
        const semana = data ? semanaISO(data) : 'S00';
        const indice = data ? 0 : i + 1;          // vaga sem data: 1, 2, 3...
        turnos.forEach(function (turno) {
          const sufixo = (turno === 'Todos') ? 'T' : turno;
          const id = idDeRotina_(ano, mes, semana, tipo, sufixo, indice);
          // A vaga 1 e a atividade com data tinham, no formato antigo, o
          // mesmo ID sem ano: se ele existe neste ano, a atividade existe.
          const antigo = (indice <= 1) ? idDeRotinaAntigo_(mes, semana, tipo, sufixo) : '';
          if (existentes[id] || (antigo && antigosDoAno[antigo])) return;

          const pessoa = (turno === 'Todos')
            ? { nome: 'Gerencia + coordenadores', email: '' }
            : (equipe[turno] || { nome: '', email: '' });

          novas.push({
            ID: id,
            COMPETENCIA: comp,
            SEMANA: semana,
            PRAZO: data ? paraISO(data) : '',
            ATIVIDADE: rotina.ATIVIDADE,
            TIPO: tipo,
            TURNO: turno,
            COORDENADOR: pessoa.nome,
            COORDENADOR_EMAIL: pessoa.email,
            SETOR: '',
            ANEXOS: '', ENTREGUE_EM: '', VALIDACAO: '', MOTIVO: '',
            STATUS: data ? statusDe(data, '', '') : STATUS.NAO_AGENDADO
          });
          existentes[id] = true;
        });
      });
    });

    /*
     * inserirVarios em vez de escrever direto na aba: ele abre as linhas
     * que faltam. A escrita direta em getRange(ultima + 1, ...) quebrava
     * quando a grade da aba enchia (~1000 linhas, uns dois anos de meses)
     * — e a tela engolia o erro: o mes abria vazio, sem aviso.
     */
    if (novas.length) inserirVarios('ATIVIDADES', novas, quem || 'sistema');
    marcarMesGerado_(comp);
    registrarLog(quem || 'sistema', 'GERAR MES', 'ATIVIDADES', comp, novas.length + ' atividades');
    return { ok: true, competencia: comp, criadas: novas.length };
  });
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
  const m = papel.match(/TURNO\s*[:\-·]?\s*(ADM|BC|[ABCJ])\b/);
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
  const candidatos = pessoasDaFilial().filter(function (p) {
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

/**
 * Gera manualmente uma competencia — o gerente adianta um mes sem esperar
 * o gatilho, ou completa um mes (rotina nova, mes que ficou pela metade).
 *
 * Antes: se ja houvesse QUALQUER atividade no mes, devolvia "jaExistia"
 * sem gerar nada — e a tela dizia "Mes gerado" do mesmo jeito. Agora a
 * geracao sempre roda (e idempotente) e o recado diz o que aconteceu.
 */
function acaoGerarMes(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const competencia = competenciaNormal_(params.competencia);
  if (!competencia) throw new Error('Competência invalida.');
  const r = gerarCompetencia(competencia, usuario.email);
  return {
    ok: true, competencia: competencia, criadas: r.criadas, jaExistia: r.criadas === 0,
    recado: r.criadas
      ? competencia + ': ' + r.criadas + ' atividade(s) criada(s) a partir das rotinas.'
      : 'Nada a gerar: ' + competencia + ' já tinha todas as atividades das rotinas.'
  };
}

/**
 * Gera o mes seguinte quando chega o dia configurado (padrao 20).
 * Equivalente ao gerarMesSeNecessario() da planilha.
 */
/*
 * Gatilho: roda em cada filial que tem o Calendario ligado.
 *
 * A rotina diaria das 5h faz o MESMO trabalho (gerarMesDaFilial_). As duas
 * continuam existindo porque ha gatilho instalado com os dois nomes; com
 * a trava e o marcador, a segunda a rodar nao faz nada — so le o marcador.
 */
function gerarMesSeNecessario() {
  return emCadaFilial_('calendario', gerarMesDaFilial_);
}

/*
 * O que a rotina gera sozinha: o mes ATUAL, se ainda nao foi gerado (e o
 * conserto automatico do mes que ficou preso sem nascer), e o SEGUINTE a
 * partir do dia configurado. Mes marcado nao custa nada: nem trava, nem
 * leitura de planilha.
 */
function gerarMesDaFilial_() {
  const diaGatilho = Number(parametro('GERAR_MES_NO_DIA', 20));
  const agora = hoje();
  const alvos = [competenciaDe(agora)];
  if (agora.getDate() >= diaGatilho) {
    alvos.push(competenciaDe(new Date(agora.getFullYear(), agora.getMonth() + 1, 1)));
  }

  const gerados = [];
  alvos.forEach(function (competencia) {
    if (mesGerado_(competencia)) return;
    const r = gerarCompetencia(competencia, 'sistema', true);
    if (r.jaGerado) return;
    gerados.push({ competencia: competencia, criadas: r.criadas });
  });
  const ultimo = gerados[gerados.length - 1] || {};
  return { ok: true, gerado: gerados.length > 0, competencia: ultimo.competencia || '',
           criadas: ultimo.criadas || 0, meses: gerados };
}

/* ------------------------------------------------------------------ */
/* LEITURA                                                             */
/* ------------------------------------------------------------------ */

/*
 * QUAL ATIVIDADE E DE UM MES: manda a DATA DO PRAZO, nao o rotulo.
 *
 * A COMPETENCIA e o rotulo com que a atividade nasceu. Remarcar uma
 * atividade de 29/08 para 01/09 muda o prazo; o rotulo so acompanha se
 * quem remarcou estava rodando uma versao que ja corrigia isso. Sem prazo
 * (treinamento ainda nao agendado) o rotulo continua valendo, que e a
 * unica informacao que existe.
 *
 * ATENCAO ao ler o PRAZO: a celula NEM SEMPRE volta como texto
 * 'aaaa-mm-dd'. Ela pode vir como objeto Date (planilha antiga) ou como
 * '01/09/2026'. `paraData` entende os tres formatos.
 */
function doMesPeloPrazo_(competencia) {
  const alvo = competenciaParaData(competencia);
  const mesAlvo = alvo ? (alvo.getFullYear() * 12 + alvo.getMonth()) : null;
  return function (a) {
    const p = paraData(a.PRAZO);
    if (p && mesAlvo !== null) return (p.getFullYear() * 12 + p.getMonth()) === mesAlvo;
    return normalizarCompetencia(a.COMPETENCIA) === competencia;
  };
}

function dadosCalendario(usuario, params) {
  const competencia = competenciaNormal_(params && params.competencia) || competenciaDe(hoje());
  const escopo = escopoDe(usuario);

  /*
   * MES ENCERRADO.
   *
   * O mes vencido abre normalmente, marcado como ENCERRADO: a tela mostra
   * o aviso, o mes fica separado dos que estao correndo, e nada nele e
   * gerado ou recalculado. (Antes ele era redirecionado para o mes atual e
   * agosto simplesmente deixava de existir na virada do mes.)
   */
  const dPed = competenciaParaData(competencia);
  const encerrado = !!dPed &&
    (dPed.getFullYear() * 12 + dPed.getMonth()) < (hoje().getFullYear() * 12 + hoje().getMonth());

  /*
   * DESEMPENHO: le a tabela CRUA uma vez so, filtra o mes ainda cru
   * (comparacao barata) e hidrata SO as linhas do mes.
   */
  const cruas = listar('ATIVIDADES');
  const doMesPeloPrazo = doMesPeloPrazo_(competencia);

  /*
   * O mes nasce sozinho na primeira vez que o gerente/adm o abre — sem
   * botao, como a aba da planilha nascia do MODELO. Quem decide se ja
   * nasceu e o marcador (ver mesGerado_), nao a existencia de linhas.
   * Mes ENCERRADO nunca gera: consulta e consulta.
   *
   * Se a geracao falhar, a tela AVISA. Antes o erro era engolido e o mes
   * abria vazio, como se nao houvesse rotina nenhuma.
   */
  let avisoGeracao = '';
  let gerou = false;
  if (dPed && !encerrado && podeFazer(usuario, 'PROGRAMAR') && !mesGerado_(competencia)) {
    try {
      gerou = gerarCompetencia(competencia, usuario.email, true).criadas > 0;
    } catch (e) {
      avisoGeracao = 'As atividades de ' + competencia + ' não puderam ser geradas agora: ' +
        (e.message || e) + ' Tente de novo em instantes ou use "Gerar mês" em Configuração.';
    }
  }

  const fonte = gerou ? listar('ATIVIDADES') : cruas;
  const todas = fonte.filter(doMesPeloPrazo).map(hidratar);

  // Cancelada some de TUDO — calendario, tabela de gestao e contagens —
  // exatamente como na planilha ("saiu do mostrador e das contagens").
  const doMes = todas.filter(function (a) { return a.status !== STATUS.CANCELADA; })
                     .filter(function (a) { return dentroDoEscopo(a, escopo); });

  doMes.sort(function (a, b) { return String(a.prazoISO).localeCompare(String(b.prazoISO)); });

  const base = competenciaParaData(competencia) || hoje();
  const meses = competenciasExistentes(fonte);
  const comPrazo = doMes.filter(function (a) { return a.prazoISO && a.tipo !== 'TRE'; });

  return {
    competencia: competencia,
    encerrado: encerrado,
    avisoGeracao: avisoGeracao,
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
    atividades: comPrazo,
    treinamentos: doMes.filter(function (a) { return a.tipo === 'TRE'; }),
    // Reaproveita a lista que ja foi hidratada acima.
    canceladas: atividadesCanceladas(competencia, escopo, todas),
    mesPassado: encerrado,
    naoAgendadas: doMes.filter(function (a) { return !a.prazoISO && a.tipo !== 'TRE'; }),
    resumo: resumirStatus(comPrazo),
    andamento: linhaAndamento(comPrazo),
    porTurno: TURNOS.map(function (t) { return resumoTurno(comPrazo, t); }),
    setores: listar('SETORES').filter(function (s) { return marcado(s.ATIVO); })
                              .map(function (s) { return s.SETOR; }),
    equipe: pessoasDaFilial().filter(function (p) { return marcado(p.ATIVO) && String(p.TURNO || '').trim(); })
                             .map(function (p) { return { turno: String(p.TURNO).toUpperCase().trim(), nome: String(p.NOME || '').trim() }; }),
    validacoes: VALIDACOES,
    permissoes: {
      entregar: podeEntregar_(usuario),
      // Turno em que a pessoa pode entregar ('' = qualquer um). A tela
      // esconde o envio nas atividades dos outros turnos; o servidor barra.
      turnoEntrega: turnoDeEntrega_(usuario),
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
    texto: partes.join(' · ')
  };
}

/**
 * Garante que a competencia exista. Se ja foi gerada, nao faz nada.
 * Se nao foi e a pessoa pode programar, gera das rotinas na hora.
 *
 * NAO E MAIS CHAMADA pela tela (dadosCalendario faz isso em linha).
 * Mantida porque e a forma de materializar um mes fora da tela (util no
 * editor). Segue a mesma regra da tela: marcador, nao existencia de linha.
 */
function garantirCompetencia(competencia, usuario) {
  if (!competenciaNormal_(competencia)) return false;
  if (mesGerado_(competencia)) return false;
  if (!podeFazer(usuario, 'PROGRAMAR')) return false;   // coordenador espera o gerente abrir
  try { return !gerarCompetencia(competencia, usuario.email, true).jaGerado; }
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
 * Os meses que a tira mostra: os vencidos QUE TEM ATIVIDADE (nunca um mes
 * vazio do passado, que so poluiria a tira), o mes atual e os seis a
 * frente. A tela marca os vencidos como encerrados.
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
 * "Encerrar mes passado": cancela o que ficou PENDENTE ou ATRASADO (e as
 * vagas de treinamento nunca agendadas) de uma competencia.
 *
 * Antes cancelava tudo que nao estivesse aprovado — inclusive entrega
 * AGUARDANDO validacao e REPROVADA: o trabalho entregue pelo coordenador
 * virava "Cancelada", sem e-mail. Entrega se valida, nao se cancela; ela
 * fica no mes e o recado diz quantas ficaram esperando.
 *
 * Uma leitura e uma escrita (atualizarVarios), dentro da trava.
 */
function acaoCancelarCompetencia(usuario, params) {
  exigirCapacidade(usuario, 'VALIDAR');
  const competencia = competenciaNormal_(params.competencia);
  if (!competencia) throw new Error('Competência invalida.');
  const motivo = String(params.motivo || '').trim() || 'Mes encerrado pela gestao.';
  const cancelaveis = [STATUS.PENDENTE, STATUS.ATRASADA, STATUS.NAO_AGENDADO];

  const r = comTrava(function () {
    // O mes e o que a tela mostra: pela data do prazo, como no calendario.
    const doMes = listar('ATIVIDADES').filter(doMesPeloPrazo_(competencia));
    const alvos = [];
    let entregues = 0;
    doMes.forEach(function (bruta) {
      const a = hidratar(bruta);
      if (cancelaveis.indexOf(a.status) !== -1) alvos.push({ bruta: bruta, a: a });
      else if (a.status === STATUS.AGUARDANDO || a.status === STATUS.REPROVADA) entregues++;
    });
    const feito = atualizarVarios('ATIVIDADES', alvos.map(function (x) {
      return { id: x.a.id, campos: {
        VALIDACAO: 'Cancelada', MOTIVO: motivoComValidacao_(x.bruta.MOTIVO, motivo), STATUS: STATUS.CANCELADA } };
    }), usuario.email);
    return { canceladas: feito.alterados, entregues: entregues };
  });

  return {
    ok: true, canceladas: r.canceladas, aguardando: r.entregues,
    recado: r.canceladas + ' atividade(s) de ' + competencia + ' cancelada(s).' +
      (r.entregues ? ' ' + r.entregues + ' entrega(s) aguardando validação ou reprovada(s) não foram canceladas — valide-as no calendário.' : '')
  };
}

/**
 * Reativa uma atividade cancelada: limpa a validacao e o status volta a ser
 * calculado pelo prazo. E o "restaurar" que faltava.
 */
function acaoReativarAtividade(usuario, params) {
  exigirCapacidade(usuario, 'VALIDAR');
  comTrava(function () {
    const a = obter('ATIVIDADES', params.id);
    if (!a) throw new Error('Atividade não encontrada.');
    atualizar('ATIVIDADES', params.id, {
      VALIDACAO: '', MOTIVO: motivoComValidacao_(a.MOTIVO, ''),
      STATUS: statusDe(paraData(a.PRAZO), a.ENTREGUE_EM, '')
    }, usuario.email);
  });
  return { ok: true };
}

/*
 * CONSERTO DE ROTULO.
 *
 * A tela ja decide o mes pela data do prazo, entao rotulo errado nao
 * esconde mais nada. Mas a COMPETENCIA continua sendo o que o digesto, a
 * Central e as contagens leem — deixa-la errada e guardar uma mentira no
 * banco. Esta funcao alinha o rotulo e a semana ao prazo de cada
 * atividade, numa gravacao em lote. Roda no botao "Atualizar dados" e na
 * rotina diaria; nao toca em quem ja esta certo.
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

/**
 * Lista as canceladas de uma competencia — alimenta a tela de arquivo.
 * `jaHidratadas` evita reprocessar a tabela quando quem chamou ja tem a
 * lista pronta (e o caso de dadosCalendario).
 */
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
 * FILA DE VALIDACAO — de QUALQUER mes.
 *
 * A Central, a Apresentacao e o briefing so olhavam do mes atual em
 * diante. Entrega feita no dia 30 e ainda nao validada sumia de todas as
 * filas no dia 1 — so aparecia abrindo o mes encerrado, e ficava
 * "Aguard. valid." para sempre. Aguardar validacao nao vence com o mes.
 *
 * Filtra cru (entregue e sem validacao e exatamente o status AGUARDANDO)
 * e so hidrata o que sobra.
 */
function aguardandoValidacao_() {
  return listar('ATIVIDADES').filter(function (r) {
    return String(r.ENTREGUE_EM || '').trim() && !String(r.VALIDACAO || '').trim();
  }).map(hidratar).filter(function (a) { return a.status === STATUS.AGUARDANDO; })
    .sort(function (a, b) { return String(a.prazoISO).localeCompare(String(b.prazoISO)); });
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
 *   - coordenadorDaLinha(r) uma vez so;
 *   - hojeNum() calculado uma vez por execucao;
 *   - o numero do dia do prazo (prazoNum) e o da primeira entrega
 *     (entregueNum) viajam junto, entao a Central, os insights e o
 *     digesto nao recalculam a mesma coisa em cada filtro.
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
    // Dia da PRIMEIRA entrega (ENTREGUE_EM nao e mais sobrescrito): e o que
    // a pontualidade dos insights compara com o prazo.
    entregueNum: entregue ? diaNumDoCarimbo(r.ENTREGUE_EM) : null,
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
  // ATENCAO: isto e so VER. Gravar (entregar, remover anexo) tem guarda
  // propria, que continua valendo — ver podeGravarNaAtividade_.
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
/* QUEM PODE GRAVAR NUMA ATIVIDADE                                     */
/* ------------------------------------------------------------------ */

/*
 * Entregar = ENTREGAR ou ANEXAR. E exatamente quem a tela deixa ver o
 * botao de envio: o coordenador (ENTREGAR) e a gerencia (ANEXAR — o
 * gerente anexa, por exemplo, a ata da reuniao "Todos"). Antes o servidor
 * nao conferia nada: um perfil CONSULTA, sem o botao, entregava chamando
 * a acao direto e a atividade virava "Aguard. valid.".
 */
function podeEntregar_(usuario) {
  return podeFazer(usuario, 'ENTREGAR') || podeFazer(usuario, 'ANEXAR');
}

function exigirPodeEntregar_(usuario) {
  if (!podeEntregar_(usuario)) {
    throw new Error('Seu perfil (' + usuario.perfil + ') nao pode entregar atividade.');
  }
}

/* Turno em que a pessoa pode gravar; '' = qualquer turno. */
function turnoDeEntrega_(usuario) {
  const e = escopoDe(usuario);
  if (e.tipo === 'TODOS' || podeFazer(usuario, 'VALIDAR')) return '';
  return String(e.turno || '').toUpperCase().trim();
}

/*
 * GUARDA DE ESCRITA. O filtro de VISAO foi desligado (todo mundo ve tudo)
 * e levou junto a guarda de GRAVACAO: o coordenador B entregava a
 * atividade do turno A e removia anexo de atividade ja aprovada dele.
 * Ver continua liberado; gravar volta a respeitar o turno:
 *   - gestao (escopo TODOS ou quem valida): qualquer atividade;
 *   - turno "Todos": qualquer um que entrega;
 *   - coordenador: as do proprio turno. Turno em branco no cadastro nao
 *     tranca ninguem (o diagnostico de acesso aponta o problema).
 */
function podeGravarNaAtividade_(usuario, registro) {
  const e = escopoDe(usuario);
  if (e.tipo === 'TODOS' || podeFazer(usuario, 'VALIDAR')) return true;
  const turno = String(registro.TURNO || '').toUpperCase().trim();
  if (!turno || turno === 'TODOS') return true;
  const meu = String(e.turno || '').toUpperCase().trim();
  if (e.tipo === 'TURNO' && !meu) return true;
  if (meu && turno === meu) return true;
  if (e.tipo === 'PROPRIAS') {
    const email = String(usuario.email || '').toLowerCase().trim();
    if (coordenadorDaLinha(registro).email === email) return true;
    if (String(registro.CRIADO_POR || '').toLowerCase().trim() === email) return true;
  }
  return false;
}

function garantirAlcanceEscrita_(usuario, registro) {
  if (podeGravarNaAtividade_(usuario, registro)) return;
  const turno = String(registro.TURNO || '').trim();
  throw new Error('Esta atividade e do turno ' + turno + ': so o coordenador do turno ' + turno +
                  ' ou a gerencia podem entregar ou mexer nos anexos dela.');
}

/* ------------------------------------------------------------------ */
/* MOTIVO — nota de remarcacao + motivo da validacao                   */
/* ------------------------------------------------------------------ */

/*
 * A coluna MOTIVO guarda duas coisas: a nota de cada remarcacao
 * ("Remarcada de 10/09/2026 para 15/09/2026: ...") e o motivo da
 * validacao (reprovacao, cancelamento, feedback da aprovacao). Uma
 * apagava a outra: remarcar uma reprovada sumia com o motivo da
 * reprovacao (o coordenador via "Reprovada" sem saber por que), e aprovar
 * sem feedback apagava a nota da remarcacao. Agora:
 *   - remarcar ACRESCENTA a nota ao que ja existe;
 *   - validar troca so o motivo da validacao e mantem as notas.
 */
const SEP_MOTIVO = ' · ';
const PREFIXO_REMARCACAO = 'Remarcada de ';

function partesDoMotivo_(motivo) {
  return String(motivo || '').split(SEP_MOTIVO)
    .map(function (s) { return s.trim(); }).filter(Boolean);
}

function motivoComValidacao_(motivoAtual, novo) {
  const partes = partesDoMotivo_(motivoAtual).filter(function (s) { return s.indexOf(PREFIXO_REMARCACAO) === 0; });
  const texto = String(novo || '').trim();
  if (texto) partes.push(texto);
  return partes.join(SEP_MOTIVO);
}

function motivoComRemarcacao_(motivoAtual, nota) {
  const partes = partesDoMotivo_(motivoAtual);
  partes.push(nota);
  return partes.join(SEP_MOTIVO);
}

/* So o motivo da validacao (sem as notas de remarcacao) — o que vai no e-mail. */
function motivoDeValidacao_(motivo) {
  return partesDoMotivo_(motivo).filter(function (s) { return s.indexOf(PREFIXO_REMARCACAO) !== 0; }).join(SEP_MOTIVO);
}

/* ------------------------------------------------------------------ */
/* ACOES                                                               */
/* ------------------------------------------------------------------ */

/*
 * DEPOIS DE GRAVAR, NAO RELEIA.
 *
 * Toda acao fazia `atualizar(...)` e logo em seguida
 * `hidratar(obter('ATIVIDADES', id))` so para montar o e-mail — uma
 * leitura completa da tabela por clique de botao. Como sabemos exatamente
 * quais campos mudaram, basta aplica-los sobre o registro que ja tinhamos.
 */
function comCampos_(registro, campos) {
  const copia = {};
  Object.keys(registro || {}).forEach(function (k) { copia[k] = registro[k]; });
  Object.keys(campos || {}).forEach(function (k) { copia[k.toUpperCase()] = campos[k]; });
  return copia;
}

/*
 * O que uma entrega muda na linha, lida DENTRO da trava:
 *   - ENTREGUE_EM so na PRIMEIRA entrega (as seguintes acrescentam
 *     arquivo, nao apagam a data em que a atividade foi entregue — e ela
 *     que diz se foi no prazo);
 *   - entrega depois de REPROVADA volta para "Aguard. valid.": antes a
 *     correcao ficava "Reprovada", fora da fila da gerencia e do briefing.
 */
function camposDaEntrega_(atual) {
  const campos = {};
  const jaEntregue = String(atual.ENTREGUE_EM || '').trim();
  if (!jaEntregue) campos.ENTREGUE_EM = agoraTexto();
  const validacao = String(atual.VALIDACAO || '').trim();
  if (validacao === 'Reprovado') campos.VALIDACAO = '';
  campos.STATUS = statusDe(paraData(atual.PRAZO), campos.ENTREGUE_EM || jaEntregue,
                           campos.VALIDACAO !== undefined ? campos.VALIDACAO : validacao);
  return campos;
}

/** Coordenador anexa a entrega. Carimba a hora e avisa a gestao. */
function acaoEntregar(usuario, params) {
  exigirPodeEntregar_(usuario);
  const antes = obter('ATIVIDADES', params.id);
  if (!antes) throw new Error('Atividade não encontrada.');
  garantirAlcanceEscrita_(usuario, antes);

  const resultado = anexarArquivo(usuario, 'ATIVIDADES', params.id, params.arquivo);

  const feito = comTrava(function () {
    const atual = obter('ATIVIDADES', params.id);
    if (!atual) throw new Error('Atividade não encontrada.');
    const campos = camposDaEntrega_(atual);
    atualizar('ATIVIDADES', params.id, campos, usuario.email);
    return { depois: comCampos_(atual, campos), avisar: !!campos.ENTREGUE_EM || campos.VALIDACAO === '' };
  });

  if (feito.avisar) {
    /*
     * O aviso NAO pode derrubar uma entrega ja gravada: a falha volta como
     * aviso, nao como erro (sem isto, a pessoa via erro e reenviava).
     */
    try {
      avisarEntregaRecebida(hidratar(feito.depois), usuario);
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
  if (validacao !== '' && VALIDACOES.indexOf(validacao) === -1) throw new Error('Validação invalida.');
  const motivo = String(params.motivo || '').trim();
  if (validacao === 'Reprovado' && !motivo) {
    throw new Error('Reprovação exige motivo: e ele que o coordenador recebe no e-mail.');
  }

  // Ler, decidir e gravar dentro da trava: a linha lida e a atual, e o
  // MOTIVO novo e montado sobre o MOTIVO de agora (com as notas de
  // remarcacao que houver).
  const depois = comTrava(function () {
    const antes = obter('ATIVIDADES', params.id);
    if (!antes) throw new Error('Atividade não encontrada.');
    const campos = {
      VALIDACAO: validacao,
      // vazio = reabrir: limpa a validacao e o motivo dela; notas de
      // remarcacao ficam
      MOTIVO: motivoComValidacao_(antes.MOTIVO, validacao ? motivo : ''),
      STATUS: statusDe(paraData(antes.PRAZO), antes.ENTREGUE_EM, validacao)
    };
    atualizar('ATIVIDADES', params.id, campos, usuario.email);
    return comCampos_(antes, campos);
  });

  if (validacao === '') return { ok: true, reaberta: true };

  let avisoEmail = '';
  try {
    const a = hidratar(depois);
    a.motivo = motivo;   // o e-mail leva so o motivo desta validacao
    avisarValidacao(a, validacao, usuario);
  } catch (e) { avisoEmail = 'Validacao gravada, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
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

  const r = comTrava(function () {
    const antes = obter('ATIVIDADES', params.id);
    if (!antes) throw new Error('Atividade não encontrada.');
    const prazoAntigo = formatarData(paraData(antes.PRAZO));
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
      // A nota ENTRA no motivo; nao apaga o motivo de uma reprovacao.
      MOTIVO: motivoComRemarcacao_(antes.MOTIVO,
        PREFIXO_REMARCACAO + prazoAntigo + ' para ' + formatarData(nova) + ': ' + motivo)
    };
    atualizar('ATIVIDADES', params.id, campos, usuario.email);
    return { depois: comCampos_(antes, campos), prazoAntigo: prazoAntigo };
  });

  let avisoEmail = '';
  if (params.avisar !== false) {
    try { avisarRemarcacao(hidratar(r.depois), r.prazoAntigo, motivo); }
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
  const depois = comTrava(function () {
    const a = obter('ATIVIDADES', params.id);
    if (!a) throw new Error('Atividade não encontrada.');
    const campos = { VALIDACAO: 'Cancelada', MOTIVO: motivoComValidacao_(a.MOTIVO, motivo), STATUS: STATUS.CANCELADA };
    atualizar('ATIVIDADES', params.id, campos, usuario.email);
    return comCampos_(a, campos);
  });

  let avisoEmail = '';
  try {
    const h = hidratar(depois);
    h.motivo = motivo;
    avisarValidacao(h, 'Cancelada', usuario);
  } catch (e) { avisoEmail = 'Cancelamento gravado, mas o aviso por e-mail nao saiu: ' + (e.message || e); }
  return { ok: true, avisoEmail: avisoEmail };
}

/**
 * Cria uma atividade avulsa — a que o gerente adiciona fora das rotinas
 * (uma tarefa pontual, uma cobranca extra). O ID nasce com AV (e o mes e
 * o ano da data) para nao colidir com as geradas pelas ROTINAS.
 */
function acaoCriarAtividade(usuario, params) {
  const atividade = String(params.atividade || '').trim();
  if (!atividade) throw new Error('Informe o nome da atividade.');
  const data = paraData(params.prazo);
  if (!data) throw new Error('Informe a data da atividade.');

  const competencia = competenciaDe(data);
  const turno = String(params.turno || 'Todos').trim();
  const semana = semanaISO(data);
  const sufixo = (turno === 'Todos') ? 'T' : turno;
  const raiz = prefixoIdMes_(data.getFullYear(), data.getMonth()) + '-' + semana + '-AV-' + sufixo;

  /*
   * ID unico: se ja existe um com o mesmo prefixo, adiciona um contador.
   * Conferir e gravar ficam na MESMA trava — dois gerentes criando juntos
   * no mesmo turno e semana ganhavam o mesmo ID.
   */
  const nova = comTrava(function () {
    const existentes = {};
    listar('ATIVIDADES', true).forEach(function (x) { existentes[String(x.ID)] = true; });
    let id = raiz, n = 2;
    while (existentes[id]) { id = raiz + '-' + n; n++; }

    const equipe = coordenadoresPorTurno();
    const pessoa = (turno === 'Todos')
      ? { nome: 'Gerencia + coordenadores', email: '' }
      : (equipe[turno] || { nome: '', email: '' });

    const registro = {
      ID: id, COMPETENCIA: competencia, SEMANA: semana, PRAZO: paraISO(data),
      ATIVIDADE: atividade, TIPO: 'AV', TURNO: turno,
      COORDENADOR: pessoa.nome, COORDENADOR_EMAIL: pessoa.email,
      SETOR: String(params.setor || '').trim(),
      ANEXOS: '', ENTREGUE_EM: '', VALIDACAO: '', MOTIVO: '', STATUS: statusDe(data, '', '')
    };
    inserir('ATIVIDADES', registro, usuario.email);
    return registro;
  });

  /*
   * O aviso nao pode derrubar a atividade ja criada — mas TAMBEM nao pode
   * sumir em silencio: o motivo volta como aviso e a tela mostra.
   */
  let avisoEmail = '', avisados = [];
  try { avisados = avisarNovaAtividade(hidratar(nova)) || []; }
  catch (e) { avisoEmail = 'Atividade criada, mas o aviso por e-mail nao saiu: ' + (e.message || e); }

  // A tela repete os enderecos que receberam: da para conferir na hora se
  // o aviso foi para quem devia.
  const recado = avisados.length
    ? 'Atividade criada — aviso enviado para ' + avisados.join(', ')
    : 'Atividade criada.';
  return { ok: true, id: nova.ID, avisoEmail: avisoEmail, recado: recado, avisados: avisados };
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

/** Metadados dos anexos de UMA atividade — chamado ao abrir a janela. */
function acaoDetalhesAtividade(usuario, params) {
  garantirAlcance(usuario, params.id);
  const r = obter('ATIVIDADES', params.id);
  if (!r) throw new Error('Atividade não encontrada.');
  /*
   * A conversa vem JUNTO com os anexos, na mesma ida ao servidor.
   * Buscar as mensagens numa segunda chamada custaria mais um a tres
   * segundos toda vez que alguem abre uma atividade.
   */
  return {
    id: params.id,
    anexos: listarAnexos(r.ANEXOS),
    // Conversas saiu na 4.2: os detalhes nao leem mais a aba MENSAGENS.
    mensagens: [],
    podeConversar: false
  };
}

/*
 * Remover anexo: do proprio turno (ou gestao) e nunca de atividade ja
 * APROVADA — a menos que quem remove seja quem valida. Antes qualquer
 * coordenador tirava a evidencia de uma entrega aprovada de outro turno.
 * Conferir e remover na mesma trava: a linha conferida e a gravada.
 */
function acaoRemoverAnexoAtividade(usuario, params) {
  return comTrava(function () {
    const registro = obter('ATIVIDADES', params.id);
    if (!registro) throw new Error('Atividade não encontrada.');
    garantirAlcanceEscrita_(usuario, registro);
    if (String(registro.VALIDACAO || '').trim() === 'Aprovado' && !podeFazer(usuario, 'VALIDAR')) {
      throw new Error('Esta atividade ja foi aprovada: so a gerencia pode remover anexo dela.');
    }
    return removerAnexo(usuario, 'ATIVIDADES', params.id, params.idArquivo);
  });
}

function garantirAlcance(usuario, id) {
  const escopo = escopoDe(usuario);
  if (escopo.tipo === 'TODOS') return;
  const registro = obter('ATIVIDADES', id);
  if (!registro) throw new Error('Atividade não encontrada.');
  if (dentroDoEscopo(hidratar(registro), escopo)) return;
  throw new Error('Esta atividade não esta no seu alcance.');
}
