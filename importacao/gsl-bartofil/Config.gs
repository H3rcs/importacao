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
    if (chave.indexOf('RH_') === 0) return 'rh';
    if (['META_ABSENTEISMO', 'CUSTO_DIA_AUSENCIA', 'HORA_ATUALIZACAO_RH'].indexOf(chave) !== -1) return 'rh';
    if (['JANELA_PRAZOS_DIAS', 'COPIAR_GESTAO_APOS_DIAS', 'ENVIAR_DIGESTO',
         'EMAIL_COPIA', 'EMAIL_DIRETORIA'].indexOf(chave) !== -1) return 'avisos';
    if (['GERAR_MES_NO_DIA'].indexOf(chave) !== -1) return 'calendario';
    return 'sistema';
  };
  parametros.forEach(function (p) { p.grupo = grupo(p.chave); });

  return {
    setores: listar('SETORES').map(function (s) {
      return { id: s.ID, setor: s.SETOR, ativo: marcado(s.ATIVO) };
    }),
    rotinas: listar('ROTINAS').map(function (r) {
      return { id: r.ID, tipo: r.TIPO, atividade: r.ATIVIDADE, frequencia: r.FREQUENCIA,
               dia: r.DIA, porTurno: marcado(r.POR_TURNO), exigeSetor: marcado(r.EXIGE_SETOR),
               quantidade: r.QUANTIDADE, ativo: marcado(r.ATIVO) };
    }),
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

function acaoSalvarRotina(usuario, params) {
  const campos = {
    TIPO: String(params.tipo || '').toUpperCase().trim().substring(0, 3),
    ATIVIDADE: String(params.atividade || '').trim(),
    FREQUENCIA: String(params.frequencia || 'SEMANAL').toUpperCase().trim(),
    DIA: params.dia,
    POR_TURNO: params.porTurno ? 'SIM' : 'NAO',
    EXIGE_SETOR: params.exigeSetor ? 'SIM' : 'NAO',
    QUANTIDADE: params.quantidade || '',
    ATIVO: params.ativo ? 'SIM' : 'NAO'
  };
  if (!campos.TIPO) throw new Error('Informe a sigla do tipo (3 letras) — ela entra no ID da atividade.');
  if (!campos.ATIVIDADE) throw new Error('Descreva a atividade.');
  return params.id ? atualizar('ROTINAS', params.id, campos, usuario.email)
                   : { ok: true, id: inserir('ROTINAS', campos, usuario.email) };
}

function acaoExcluirRotina(usuario, params) { return excluir('ROTINAS', params.id, usuario.email); }

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
