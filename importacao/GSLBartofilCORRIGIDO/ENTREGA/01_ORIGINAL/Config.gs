/**
 * CONFIG — equipe, setores, rotinas e parametros.
 * Substitui a aba CONFIG da planilha, com edicao pela tela.
 */

function dadosConfig(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  // indice de quem tem acesso, por e-mail
  const acessoPorEmail = {};
  listar('ACESSOS').forEach(function (a) {
    const em = String(a.EMAIL || '').toLowerCase().trim();
    if (em) acessoPorEmail[em] = { perfil: String(a.PERFIL || '').toUpperCase().trim() };
  });

  return {
    equipe: listar('EQUIPE').map(function (p) {
      // mostra o turno que o sistema realmente usa: o da coluna, ou o
      // extraido do papel ("Coordenador . Turno A") — como na planilha.
      const em = String(p.EMAIL || '').toLowerCase().trim();
      const ac = acessoPorEmail[em];
      return { id: p.ID, papel: p.PAPEL, nome: p.NOME, email: p.EMAIL,
               turno: turnoDaPessoa(p), ativo: marcado(p.ATIVO),
               // liga a EQUIPE (quem recebe aviso) com ACESSOS (quem entra):
               // sem isso as duas listas nao conversavam e ninguem percebia.
               temAcesso: !!ac, perfilAcesso: ac ? ac.perfil : '' };
    }),
    setores: listar('SETORES').map(function (s) {
      return { id: s.ID, setor: s.SETOR, ativo: marcado(s.ATIVO) };
    }),
    rotinas: listar('ROTINAS').map(function (r) {
      return { id: r.ID, tipo: r.TIPO, atividade: r.ATIVIDADE, frequencia: r.FREQUENCIA,
               dia: r.DIA, porTurno: marcado(r.POR_TURNO), exigeSetor: marcado(r.EXIGE_SETOR),
               quantidade: r.QUANTIDADE, ativo: marcado(r.ATIVO) };
    }),
    parametros: listar('PARAMETROS').map(function (p) {
      return { id: p.ID, chave: p.CHAVE, valor: p.VALOR, descricao: p.DESCRICAO };
    }),
    arquivosRH: arquivosRH(),
    // Links das apresentacoes, um por turno — cartao proprio na tela.
    apresentacoes: TURNOS.map(function (tn) {
      const chave = 'APRESENTACAO_' + tn;
      const p = listar('PARAMETROS').filter(function (x) {
        return String(x.CHAVE).toUpperCase() === chave;
      })[0];
      return { turno: tn, id: p ? p.ID : '', link: p ? String(p.VALOR || '') : '' };
    }),
    turnos: TURNOS,
    sistema: estadoInstalacao(),
    fuso: { atual: fuso(), padrao: FUSO_PADRAO, hora: agoraTexto() },
    pastaAnexos: urlPastaAnexos()
  };
}

/** Link da pasta do Drive onde as entregas dos coordenadores sao guardadas. */
function urlPastaAnexos() {
  try {
    const id = prop('ID_PASTA_ANEXOS', '');
    if (!id) return '';
    return DriveApp.getFolderById(id).getUrl();
  } catch (e) { return ''; }
}

function acaoSalvarPessoa(usuario, params) {
  const campos = {
    PAPEL: String(params.papel || '').trim(),
    NOME: String(params.nome || '').trim(),
    EMAIL: String(params.email || '').toLowerCase().trim(),
    TURNO: String(params.turno || '').toUpperCase().trim(),
    ATIVO: params.ativo ? 'SIM' : 'NAO'
  };
  if (!campos.NOME) throw new Error('Informe o nome.');
  if (!campos.EMAIL) throw new Error('Informe o e-mail: e por ele que os avisos saem.');

  const r = params.id ? atualizar('EQUIPE', params.id, campos, usuario.email)
                      : { ok: true, id: inserir('EQUIPE', campos, usuario.email) };
  limparCache();
  return r;
}

function acaoExcluirPessoa(usuario, params) { return excluir('EQUIPE', params.id, usuario.email); }

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
  if (!chave) throw new Error('Nao consegui identificar o parametro a salvar.');

  const linha = listar('PARAMETROS').filter(function (p) {
    return String(p.CHAVE).toUpperCase().trim() === chave;
  })[0];

  if (linha) atualizar('PARAMETROS', linha.ID, { VALOR: valor }, usuario.email);
  else inserir('PARAMETROS', { CHAVE: chave, VALOR: valor, DESCRICAO: String(params.descricao || '') }, usuario.email);

  limparCache();
  return { ok: true, valor: valor };
}

function acaoCorrigirFuso(usuario) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  return corrigirFuso();
}
