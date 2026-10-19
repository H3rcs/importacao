/**
 * Config.gs — CONFIGURAÇÃO: fontes do RH, calendário e sistema.
 *
 * Substitui a aba CONFIG da planilha, com edição pela tela.
 * As PESSOAS saíram daqui: viraram a tela "Pessoas e acessos", servida
 * pelo Auth.gs (dadosPessoas em Codigo.gs).
 */

/*
 * CONFIGURAÇÃO — reorganizada.
 *
 * Era um depósito: equipe, rotinas, setores, parâmetros soltos, arquivos
 * do RH, links de apresentação e botões de sistema, tudo empilhado numa
 * tela só, sem hierarquia. Agora a tela tem SEÇÕES declaradas aqui, e o
 * cliente desenha uma aba por seção:
 *
 *   1. Fontes do RH   — de onde vêm os dados de assiduidade
 *   2. Calendário     — rotinas e setores (o que nasce a cada mês)
 *   3. Sistema        — parâmetros, fuso, rotinas automáticas
 *
 * As PESSOAS saíram daqui: viraram tela própria ("Pessoas e acessos"),
 * junto com o que era a tela de Acessos.
 */
function dadosConfig(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');

  const parametros = listar('PARAMETROS').map(function (p) {
    return { id: p.ID, chave: String(p.CHAVE || '').toUpperCase().trim(),
             valor: p.VALOR, descricao: p.DESCRICAO };
  });

  /*
   * Os parâmetros ganharam grupo. Antes eram dezessete campos numa
   * coluna só, em ordem de cadastro, misturando "meta de absenteísmo"
   * com "cabeçalho da coluna de matrícula".
   */
  const grupo = function (chave) {
    if (chave.indexOf('APRESENTACAO_') === 0) return 'oculto';
    // Configurado na propria tela do Quadro; e o login antigo, que saiu.
    if (chave === 'QUADRO_PLANILHA' || chave === 'EXIGIR_SESSAO_GOOGLE') return 'oculto';
    if (chave.indexOf('RH_') === 0) return 'rh';
    if (['META_ABSENTEISMO', 'CUSTO_DIA_AUSENCIA', 'HORA_ATUALIZACAO_RH'].indexOf(chave) !== -1) return 'rh';
    if (['JANELA_PRAZOS_DIAS', 'COPIAR_GESTAO_APOS_DIAS', 'ENVIAR_DIGESTO',
         'EMAIL_COPIA', 'EMAIL_DIRETORIA'].indexOf(chave) !== -1) return 'avisos';
    if (['GERAR_MES_NO_DIA'].indexOf(chave) !== -1) return 'calendario';
    return 'sistema';
  };
  parametros.forEach(function (p) { p.grupo = grupo(p.chave); });

  const rotinas = listar('ROTINAS');
  // Calendario.gs de outra entrega (colado pela metade): a tela abre assim mesmo, sem os numeros do
  // calendario; gravar rotina recusa (exigirCalendarioDestaVersao_) e a faixa diz qual arquivo falta.
  const comCalendario = typeof calendarioDasRotinas_ === 'function' && typeof siglaDaRotina_ === 'function';
  const noCalendario = comCalendario ? calendarioDasRotinas_(rotinas) : {};
  const sigla = function (r) { return comCalendario ? siglaDaRotina_(r) : String(r.TIPO || '').toUpperCase().trim(); };

  return {
    setores: listar('SETORES').map(function (s) {
      return { id: s.ID, setor: s.SETOR, ativo: marcado(s.ATIVO) };
    }),
    rotinas: rotinas.map(function (r) {
      const regra = regraDaRotina_(r.FREQUENCIA, r.DIA, r.QUANTIDADE);
      const cal = noCalendario[sigla(r)] || { pendentes: { total: 0, porMes: {} }, temAtividades: false };
      // pendentes e temAtividades: a confirmacao da tela e a trava da sigla, sem ir ao servidor.
      // versao: o formulario a devolve ao gravar (outra pessoa mudou a rotina com ele aberto?). Em texto, como o
      // acaoSalvarRotina compara: um Date iria no JSON em outro formato.
      return { id: r.ID, tipo: sigla(r), atividade: r.ATIVIDADE, frequencia: regra.FREQUENCIA,
               dia: regra.DIA, porTurno: marcado(r.POR_TURNO), exigeSetor: marcado(r.EXIGE_SETOR),
               quantidade: regra.QUANTIDADE, ativo: marcado(r.ATIVO), versao: String(r.ATUALIZADO_EM || ''),
               pendentes: cal.pendentes, temAtividades: cal.temAtividades, problema: erroNaRegra_(regra) };
    }),
    // Rotinas removidas pela versao anterior com pendentes ainda no calendario (a tela oferece tira-las).
    orfas: typeof siglasOrfas_ === 'function' ? siglasOrfas_(rotinas) : [],
    // Onde mudar uma rotina mexe nas atividades que ja existem (os textos da tela dizem quais meses).
    mesesGerados: typeof mesesGeradosDeHojeEmDiante_ === 'function' ? mesesGeradosDeHojeEmDiante_() : [],
    parametros: parametros.filter(function (p) { return p.grupo !== 'oculto'; }),
    parametrosTodos: parametros.map(function (p) { return { chave: p.chave, valor: p.valor }; }),
    arquivosRH: arquivosRH(),
    dePara: listar('DE_PARA').map(function (l) {
      return { id: l.ID, codigo: String(l.CODIGO), descricao: String(l.DESCRICAO || ''),
               categoria: String(l.CATEGORIA || ''), ausencia: marcado(l.CONTA_COMO_AUSENCIA) };
    }).sort(function (a, b) {
      const na = Number(a.codigo), nb = Number(b.codigo);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.codigo).localeCompare(String(b.codigo));
    }),
    categorias: categoriasConhecidas_(),
    // Links das apresentacoes, um por turno — cartao proprio na tela.
    apresentacoes: TURNOS.map(function (tn) {
      const chave = 'APRESENTACAO_' + tn;
      const p = parametros.filter(function (x) { return x.chave === chave; })[0];
      return { turno: tn, id: p ? p.id : '', link: p ? String(p.valor || '') : '' };
    }),
    turnos: TURNOS,
    sistema: estadoInstalacao(),
    fuso: { atual: fuso(), padrao: FUSO_PADRAO, hora: agoraTexto() },
    pastaAnexos: urlPastaAnexos()
  };
}

/*
 * Categorias do DE-PARA: as que ja existem na tabela, mais as do padrao
 * do sistema. Escrever categoria a mao foi o que gerou 'Presenca' de um
 * lado e 'Presença' do outro — e o BI inteiro zerado.
 */
const CATEGORIAS_PADRAO = ['Presença', 'Falta injustificada', 'Falta justificada',
                           'Falta disciplinar', 'Atestado', 'Férias', 'Folga',
                           'Licença legal', 'Ajuste de horas', 'Abono', 'Outros',
                           'Ignorar', 'Não definido'];

function categoriasConhecidas_() {
  const vistas = {};
  CATEGORIAS_PADRAO.forEach(function (c) { vistas[c] = true; });
  listar('DE_PARA').forEach(function (l) {
    const c = String(l.CATEGORIA || '').trim();
    if (c) vistas[c] = true;
  });
  return Object.keys(vistas).sort();
}

/** Link da pasta do Drive onde as entregas dos coordenadores sao guardadas. */
function urlPastaAnexos() {
  try {
    const id = prop('ID_PASTA_ANEXOS', '');
    if (!id) return '';
    return DriveApp.getFolderById(id).getUrl();
  } catch (e) { return ''; }
}

/*
 * acaoSalvarPessoa / acaoExcluirPessoa saíram: a EQUIPE deixou de ser um
 * cadastro à parte. Pessoa agora se cadastra em "Pessoas e acessos"
 * (Auth.gs), num lugar só. A aba EQUIPE continua no banco, intacta, e
 * foi migrada para ACESSOS automaticamente.
 */

function acaoSalvarSetor(usuario, params) {
  const nome = String(params.setor || '').trim();
  if (!nome) throw new Error('Informe o nome do setor.');
  return params.id
    ? atualizar('SETORES', params.id, { SETOR: nome, ATIVO: params.ativo ? 'SIM' : 'NAO' }, usuario.email)
    : { ok: true, id: inserir('SETORES', { SETOR: nome, ATIVO: 'SIM' }, usuario.email) };
}

function acaoExcluirSetor(usuario, params) { return excluir('SETORES', params.id, usuario.email); }

/*
 * ROTINAS (19/10). O "Quando" era um campo de texto que pedia numero, e
 * salvar so gravava a linha de ROTINAS: mudar o dia, desativar ou remover
 * nao chegava nas atividades dos meses ja gerados. Agora a tela escolhe o dia
 * em botoes, o servidor normaliza e confere a regra, e cada gravacao acerta o
 * calendario na mesma trava (sincronizarRotina_, Calendario.gs).
 * ajustarCalendario: false grava so a rotina — vale a partir do proximo mes gerado.
 */
const FREQUENCIAS_ROTINA = ['SEMANAL', 'MENSAL', 'AVULSA'];

/* A regra como a planilha guarda: maiusculas, aparada, dia do mes sem zero a esquerda, vagas em numero. */
function regraDaRotina_(frequencia, dia, quantidade) {
  const freq = String(frequencia || '').toUpperCase().trim();
  let d = freq === 'AVULSA' ? '' : String(dia == null ? '' : dia).toUpperCase().trim();
  if (freq === 'MENSAL' && /^\d+$/.test(d)) d = String(Number(d));
  return { FREQUENCIA: freq, DIA: d,
           QUANTIDADE: freq === 'AVULSA' ? Number(String(quantidade == null ? '' : quantidade).trim()) : '' };
}

/* O que esta errado na regra ('' = nada). Tambem marca, na Configuracao, a rotina gravada a mao na planilha. */
function erroNaRegra_(regra) {
  const n = Number(regra.DIA), vagas = regra.QUANTIDADE;
  if (FREQUENCIAS_ROTINA.indexOf(regra.FREQUENCIA) === -1) return 'Escolha como a rotina se repete: toda semana, todo mês ou vagas sem data.';
  if (regra.FREQUENCIA === 'SEMANAL' && !/^[1-7]$/.test(regra.DIA)) return 'Escolha o dia da semana.';
  if (regra.FREQUENCIA === 'MENSAL' && ['PRIMEIRA_SEGUNDA', 'ULTIMA_SEXTA'].indexOf(regra.DIA) === -1 &&
      !(/^\d+$/.test(regra.DIA) && n >= 1 && n <= 31)) return 'Rotina mensal: escolha 1ª segunda, última sexta ou um dia de 1 a 31.';
  if (regra.FREQUENCIA === 'AVULSA' && !(vagas >= 1 && vagas <= 10 && vagas === Math.floor(vagas))) return 'Rotina avulsa: informe de 1 a 10 vagas por mês.';
  return '';
}

/* Os campos da rotina vindos da tela, normalizados e conferidos. */
function camposDaRotina_(params) {
  const campos = Object.assign({
    TIPO: String(params.tipo || '').toUpperCase().trim(),
    ATIVIDADE: String(params.atividade || '').trim(),
    POR_TURNO: params.porTurno ? 'SIM' : 'NAO',
    EXIGE_SETOR: params.exigeSetor ? 'SIM' : 'NAO',
    ATIVO: params.ativo ? 'SIM' : 'NAO'
  }, regraDaRotina_(params.frequencia, params.dia, params.quantidade));
  if (!/^[A-Z0-9]{2,3}$/.test(campos.TIPO)) throw new Error('A sigla tem 2 ou 3 letras ou números (ela entra no código da atividade).');
  if (campos.TIPO === SIGLA_AVULSA) throw new Error('A sigla AV é das atividades avulsas criadas no calendário. Use outra.');
  if (!campos.ATIVIDADE) throw new Error('Descreva a atividade.');
  const erro = erroNaRegra_(campos);
  if (erro) throw new Error(erro);
  return campos;
}

/*
 * A sigla forma o ID da atividade (mes-semana-SIGLA-turno): duas rotinas com a
 * mesma sigla viram UM ID e a segunda nunca nasce; e trocar a sigla de quem ja
 * gerou dobrava o mes (IDs novos ao lado dos antigos).
 */
function conferirSigla_(sigla, antes) {
  const mesma = listar('ROTINAS').filter(function (r) {
    return siglaDaRotina_(r) === sigla && (!antes || String(r.ID) !== String(antes.ID));
  })[0];
  if (mesma) throw new Error('A sigla ' + sigla + ' já é da rotina "' + mesma.ATIVIDADE + '". Use outra sigla.');
  const velha = siglaDaRotina_(antes);
  if (velha && velha !== sigla && siglaTemAtividades_(velha)) {
    throw new Error('A sigla não muda depois que a rotina gerou atividades — ela está no código delas. Crie uma rotina nova e desative esta.');
  }
}

/*
 * Calendario.gs de outra entrega (colado pela metade): a rotina nao e gravada.
 * Sem o acerto desta versao a linha de ROTINAS mudaria e o calendario nao (ou
 * mudaria pelas regras de antes). siglasOrfas_ so existe a partir desta entrega.
 */
function exigirCalendarioDestaVersao_() {
  if (typeof sincronizarRotina_ !== 'function' || typeof siglasOrfas_ !== 'function') {
    throw new Error('Atualização incompleta do GSL: as rotinas precisam do Calendario.gs desta versão. Avise o administrador do sistema.');
  }
}

function acaoSalvarRotina(usuario, params) {
  exigirCalendarioDestaVersao_();
  const campos = camposDaRotina_(params);
  return comTrava(function () {
    const antes = params.id ? obter('ROTINAS', params.id) : null;
    if (params.id && !antes) throw new Error('Rotina não encontrada.');
    // O formulario aberto antes de outra pessoa gravar desfaria a mudanca dela (e o calendario iria junto).
    if (antes && params.versao && String(antes.ATUALIZADO_EM || '') !== String(params.versao)) {
      throw new Error('Esta rotina foi alterada por outra pessoa enquanto a janela estava aberta. Feche e abra de novo.');
    }
    conferirSigla_(campos.TIPO, antes);
    const r = antes ? atualizar('ROTINAS', params.id, campos, usuario.email)
                    : { ok: true, id: inserir('ROTINAS', campos, usuario.email) };
    const nota = params.ajustarCalendario === false ? null
      : sincronizarRotina_(antes, campos, usuario.email, params.alinharForaDoDia !== false);
    return resultadoDaRotina_(r, antes, campos, nota);
  });
}

/* Desativar / Ativar da lista: so o ATIVO muda (a tela nao reenvia os outros campos). */
function acaoAlternarRotina(usuario, params) {
  exigirCalendarioDestaVersao_();
  const ativar = params.ativo === true;
  return comTrava(function () {
    const antes = obter('ROTINAS', params.id);
    if (!antes) throw new Error('Rotina não encontrada.');
    const erro = ativar ? erroNaRegra_(regraDaRotina_(antes.FREQUENCIA, antes.DIA, antes.QUANTIDADE)) : '';
    if (erro) throw new Error('Corrija a rotina em Editar antes de ativá-la: ' + erro);
    const campos = { ATIVO: ativar ? 'SIM' : 'NAO' };
    const depois = comCampos_(antes, campos);
    const r = atualizar('ROTINAS', params.id, campos, usuario.email);
    // Ativar nao leva para o dia da regra a pendente que estava fora dele (so o Salvar, depois da pergunta da tela).
    return resultadoDaRotina_(r, antes, depois, sincronizarRotina_(antes, depois, usuario.email, false));
  });
}

/* Remover: as pendentes de hoje em diante saem do calendario (canceladas); o historico fica. */
function acaoExcluirRotina(usuario, params) {
  exigirCalendarioDestaVersao_();
  return comTrava(function () {
    const antes = obter('ROTINAS', params.id);
    if (!antes) throw new Error('Rotina não encontrada.');
    const nota = sincronizarRotina_(antes, null, usuario.email);
    return resultadoDaRotina_(excluir('ROTINAS', params.id, usuario.email), antes, null, nota);
  });
}

/*
 * Rotina removida pela versao anterior, que so tirava a linha de ROTINAS: as
 * pendentes de hoje em diante que ficaram no calendario saem agora (canceladas
 * com a marca, como no Remover). Sigla de rotina da lista e a das avulsas nao.
 */
function acaoLimparSiglaOrfa(usuario, params) {
  exigirCalendarioDestaVersao_();
  const sigla = String(params.sigla || '').toUpperCase().trim();
  if (!/^[A-Z0-9]+$/.test(sigla)) throw new Error('Informe a sigla da rotina removida.');
  if (sigla === SIGLA_AVULSA) throw new Error('A sigla AV é das atividades avulsas criadas no calendário: elas não são de rotina.');
  return comTrava(function () {
    if (listar('ROTINAS').some(function (r) { return siglaDaRotina_(r) === sigla; })) {
      throw new Error('A rotina ' + sigla + ' está na lista: use Desativar ou Remover nela.');
    }
    const nota = sincronizarRotina_({ TIPO: sigla }, null, usuario.email);
    return { ok: true, calendario: nota, esquecerTelas: nota.canceladas > 0,
             recado: nota.canceladas
               ? 'Rotina removida ' + sigla + ': ' + quantos_(nota.canceladas, 'atividade pendente cancelada', 'atividades pendentes canceladas') + '.'
               : 'Nada a tirar: a rotina removida ' + sigla + ' não tem pendentes de hoje em diante.' };
  });
}

/*
 * O que volta para a tela: o recado com o que mudou no calendario e, quando
 * o calendario mudou, esquecerTelas — sem ele o calendario abria primeiro a
 * copia guardada (sem a mudanca) e parecia que nada tinha acontecido. Nao e o
 * invalidarTudo: o menu nao muda, e a Configuracao volta junto com a gravacao
 * (uma ida so ao servidor, executarAcaoETela).
 */
function resultadoDaRotina_(r, antes, depois, nota) {
  const mudou = !!nota && (nota.movidas + nota.canceladas + nota.criadas + nota.reativadas + nota.renomeadas > 0);
  r.calendario = nota;
  r.recado = nota ? recadoDaRotina_(antes, depois, nota)
    : 'Rotina salva. As atividades já geradas não mudaram; vale a partir de ' + primeiroMesAGerar_() + '.';
  // O "Exige setor" tambem esta no calendario (tiposComSetor).
  r.esquecerTelas = mudou || marcado((antes || {}).EXIGE_SETOR) !== marcado((depois || {}).EXIGE_SETOR);
  return r;
}

/* "1 criada" / "2 criadas": a quantidade com a palavra no singular ou no plural. */
function quantos_(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

/* "OUT 2026: 2 · NOV 2026: 4" — uma contagem do acerto, mes a mes. */
function porMesDoAcerto_(nota, chave) {
  return Object.keys(nota.porMes).filter(function (c) { return nota.porMes[c][chave]; })
    .map(function (c) { return c + ': ' + nota.porMes[c][chave]; }).join(' · ');
}

/* " Ficaram como estavam: 1 entregue, 1 remarcada à mão." — so o que a mudanca alcancaria (de hoje em diante). */
function ficaramComoEstavam_(m) {
  const lista = [m.entregues && quantos_(m.entregues, 'entregue', 'entregues'),
                 m.remarcadas && quantos_(m.remarcadas, 'remarcada à mão', 'remarcadas à mão'),
                 m.agendadas && quantos_(m.agendadas, 'vaga já agendada', 'vagas já agendadas'),
                 m.semanaPassou && m.semanaPassou + ' desta semana (o dia novo já passou)',
                 m.mesPassou && m.mesPassou + ' deste mês (o dia novo já passou)',
                 m.foraDoDia && m.foraDoDia + ' fora do dia da rotina'].filter(Boolean);
  return lista.length ? ' Ficaram como estavam: ' + lista.join(', ') + '.' : '';
}

/* "Rotina salva. No calendário: 6 mudaram para sexta · 1 cancelada · 1 criada." (+ o que ficou como estava) */
function recadoDaRotina_(antes, depois, nota) {
  const fim = ficaramComoEstavam_(nota.mantidas);
  const canceladas = nota.canceladas ? ' ' + quantos_(nota.canceladas, 'atividade pendente cancelada', 'atividades pendentes canceladas') : '';
  if (!depois) return 'Rotina removida.' + (canceladas ? canceladas + '.' : '') + fim;
  const estava = !!antes && marcado(antes.ATIVO), esta = marcado(depois.ATIVO);
  if (estava && !esta) return 'Rotina desativada.' + (canceladas ? canceladas + ' (' + porMesDoAcerto_(nota, 'canceladas') + ').' : '') + fim;
  // Ja parada (a versao anterior so gravava ATIVO=NAO): as pendentes que tinham ficado saem agora.
  if (!estava && !esta && nota.canceladas) return 'Rotina parada.' + canceladas + ' (' + porMesDoAcerto_(nota, 'canceladas') + ').' + fim;
  const voltaram = nota.reativadas + nota.criadas;
  if (antes && !estava && esta && !nota.movidas && !nota.canceladas) {
    return 'Rotina ativada.' + (voltaram ? ' ' + quantos_(voltaram, 'atividade de volta ao calendário.', 'atividades de volta ao calendário.') : '') + fim;
  }
  const inicio = (antes && !estava && esta) ? 'Rotina ativada.' : 'Rotina salva.';
  // So nasceram (rotina nova, mes ja gerado): "2 criadas em OUT 2026 e 4 em NOV 2026 (de hoje em diante)."
  if (nota.criadas && !nota.movidas && !nota.canceladas && !nota.reativadas && !nota.renomeadas) {
    return inicio + ' No calendário: ' + Object.keys(nota.porMes).map(function (c, i) {
      const q = nota.porMes[c].criadas;
      return (i ? q : quantos_(q, 'criada', 'criadas')) + ' em ' + c;
    }).join(' e ') + ' (de hoje em diante).' + fim;
  }
  const dia = String(depois.FREQUENCIA).toUpperCase() === 'SEMANAL' ? 'para ' + DIAS_DA_ROTINA[Number(depois.DIA)] : 'de dia';
  const partes = [nota.movidas && nota.movidas + (nota.movidas === 1 ? ' mudou ' : ' mudaram ') + dia,
                  nota.canceladas && quantos_(nota.canceladas, 'cancelada', 'canceladas'),
                  nota.criadas && quantos_(nota.criadas, 'criada', 'criadas'),
                  nota.reativadas && quantos_(nota.reativadas, 'voltou ao calendário', 'voltaram ao calendário'),
                  nota.renomeadas && nota.renomeadas + ' com o nome novo'].filter(Boolean);
  return inicio + (partes.length ? ' No calendário: ' + partes.join(' · ') + '.' : '') + fim;
}

/*
 * Salva um parametro. Antes exigia o ID da linha — se a linha ainda nao
 * existia (parametro novo, como os links de apresentacao), o ID vinha
 * vazio e a gravacao falhava em silencio. Agora grava pela CHAVE e cria
 * a linha quando ela nao existe.
 */
function acaoSalvarParametro(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const valor = String(params.valor == null ? '' : params.valor).trim();
  const chave = String(params.chave || '').toUpperCase().trim();

  if (params.id) {
    const existe = obter('PARAMETROS', params.id);
    if (existe) {
      atualizar('PARAMETROS', params.id, { VALOR: valor }, usuario.email);
      return { ok: true, valor: valor };
    }
  }
  if (!chave) throw new Error('Não consegui identificar o parametro a salvar.');

  const linha = listar('PARAMETROS').filter(function (p) {
    return String(p.CHAVE).toUpperCase().trim() === chave;
  })[0];

  if (linha) atualizar('PARAMETROS', linha.ID, { VALOR: valor }, usuario.email);
  else inserir('PARAMETROS', { CHAVE: chave, VALOR: valor, DESCRICAO: String(params.descricao || '') }, usuario.email);

  limparCache();
  /*
   * Um parametro vale para o sistema inteiro, nao so para a tela de
   * Configuracao. Sem este aviso, o cliente guardava as outras telas e a
   * Apresentacao continuava mostrando a versao de antes — o link estava
   * salvo, mas a tela aparecia vazia.
   */
  return { ok: true, valor: valor, invalidarTudo: true };
}

function acaoCorrigirFuso(usuario) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  return corrigirFuso();
}
