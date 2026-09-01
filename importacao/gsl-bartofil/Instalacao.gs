/**
 * INSTALACAO — cria o banco com o modelo REAL do GSL.
 *
 * Espelha a planilha "Reuniao Semanal com Coordenadores": mesmas colunas,
 * mesmos status, mesmo ciclo de entrega e validacao.
 */

const COLUNAS_CONTROLE = ['ID', 'CRIADO_EM', 'CRIADO_POR', 'ATUALIZADO_EM', 'ATUALIZADO_POR', 'EXCLUIDO'];

const ESQUEMA = {
  // O coracao: uma linha por entrega, como na aba do mes.
  ATIVIDADES: ['COMPETENCIA', 'SEMANA', 'PRAZO', 'ATIVIDADE', 'TIPO', 'TURNO',
               'COORDENADOR', 'COORDENADOR_EMAIL', 'SETOR', 'ANEXOS',
               'ENTREGUE_EM', 'VALIDACAO', 'MOTIVO', 'STATUS'],

  // CONFIG da planilha, quebrada em tabelas
  EQUIPE:     ['PAPEL', 'NOME', 'EMAIL', 'TURNO', 'ATIVO'],
  SETORES:    ['SETOR', 'ATIVO'],
  ROTINAS:    ['TIPO', 'ATIVIDADE', 'FREQUENCIA', 'DIA', 'POR_TURNO', 'EXIGE_SETOR', 'QUANTIDADE', 'ATIVO'],
  PARAMETROS: ['CHAVE', 'VALOR', 'DESCRICAO'],

  // GSL-DADOS — mesmas abas da planilha de BI
  ARQUIVOS_RH: ['COMPETENCIA', 'LINK', 'ABA', 'SITUACAO', 'ULTIMA_IMPORTACAO', 'LINHAS', 'OBSERVACAO'],
  DE_PARA:     ['CODIGO', 'DESCRICAO', 'CATEGORIA', 'CONTA_COMO_AUSENCIA'],
  COLABORADORES: ['MATRICULA', 'NOME', 'TURNO'],
  FATO_ASSIDUIDADE: ['DATA', 'COMPETENCIA', 'DIA_SEMANA', 'MATRICULA', 'TURNO',
                     'CODIGO', 'CATEGORIA', 'AUSENCIA'],
  // As tres familias de falta tem coluna propria: a legenda do RH separa
  // injustificada (16), justificada (28) e disciplinar (18), e a gestao
  // trata cada uma de um jeito. FALTAS continua sendo a soma das tres.
  AGR_COLAB:   ['COMPETENCIA', 'MATRICULA', 'NOME', 'TURNO', 'REGISTROS', 'TRABALHADOS',
                'AUSENCIAS', 'FALTAS', 'FALTAS_INJ', 'FALTAS_JUST', 'FALTAS_DISC',
                'ATESTADOS', 'FERIAS', 'FOLGAS', 'LICENCAS',
                'ASSIDUIDADE', 'ULTIMA_FALTA'],
  // Painel pronto, gravado na importacao. A tela le UMA linha em vez de
  // varrer as 5 mil da FATO a cada abertura.
  PAINEL:      ['COMPETENCIA', 'GERADO_EM', 'PAYLOAD'],

  // acesso e auditoria
  /*
   * PESSOAS — tabela unica.
   *
   * Antes existiam duas: EQUIPE (papel, quem recebe aviso) e ACESSOS
   * (quem entra). Eram as MESMAS pessoas em dois cadastros que nao
   * conversavam — dava para ter o "Gerente" na EQUIPE com nivel
   * COORDENADOR em ACESSOS, e ninguem percebia. Agora ACESSOS guarda a
   * pessoa inteira; a EQUIPE continua existindo no banco (nada foi
   * apagado) e e migrada para ca automaticamente.
   *
   * SITUACAO: PENDENTE (pediu e aguarda) · ATIVO · RECUSADO · INATIVO
   */
  ACESSOS:    ['EMAIL', 'NOME', 'PAPEL', 'PERFIL', 'TURNO', 'ATIVO',
               'SITUACAO', 'PEDIDO_EM', 'DECIDIDO_EM', 'DECIDIDO_POR', 'OBSERVACAO'],
  PERFIS:     ['PERFIL', 'DESCRICAO', 'ESCOPO'],
  LOG:        ['QUANDO', 'QUEM', 'ACAO', 'TABELA', 'REGISTRO', 'DETALHE']
};

const TABELAS_SEM_CONTROLE = ['LOG'];

function bancoInstalado() { return !!prop('ID_BANCO', ''); }

function instalar(emailAdmin) {
  if (bancoInstalado()) throw new Error('O banco já foi instalado. Para recomecar, apague a propriedade ID_BANCO.');

  const instalador = String(emailAdmin || '').toLowerCase().trim() || emailDeQuemAbriu();
  if (!instalador || instalador.indexOf('@') === -1) throw new Error('Informe o e-mail do administrador.');

  const raiz = DriveApp.createFolder('GSL Bartofil');
  const anexos = raiz.createFolder('Anexos');
  const modelos = raiz.createFolder('Modelos');

  const planilha = SpreadsheetApp.create('GSL_BANCO');
  DriveApp.getFileById(planilha.getId()).moveTo(raiz);

  Object.keys(ESQUEMA).forEach(function (tabela, i) {
    const aba = (i === 0) ? planilha.getSheets()[0] : planilha.insertSheet();
    aba.setName(tabela);
    escreverCabecalho(aba, colunasDe(tabela));
  });

  PropertiesService.getScriptProperties().setProperties({
    ID_BANCO: planilha.getId(),
    ID_PASTA_RAIZ: raiz.getId(),
    ID_PASTA_ANEXOS: anexos.getId(),
    ID_PASTA_MODELOS: modelos.getId(),
    EMAIL_ADMIN: instalador
  });

  /*
   * CORRECAO CRITICA — a instalacao nunca chegava ao fim.
   *
   * prop() guarda TODAS as propriedades na primeira leitura da execucao.
   * A primeira linha desta funcao chama bancoInstalado(), que chama
   * prop('ID_BANCO') — e naquele momento a copia guardada e a de um
   * script sem banco nenhum. As propriedades acima sao gravadas, mas a
   * copia em memoria continua vazia: a semente seguinte chamava
   * abrirBanco(), lia ID_BANCO = '' da copia velha e estourava em
   * "O banco ainda nao foi instalado" — com o banco recem-criado no
   * Drive. Uma linha resolve: derrubar a copia depois de gravar.
   */
  esquecerProps();

  semearPerfis();
  semearRotinas();
  semearParametros();
  semearSetores();
  semearDePara();
  // Uma linha so: ACESSOS passou a ser o cadastro unico de pessoas.
  inserir('ACESSOS', {
    EMAIL: instalador, NOME: instalador.split('@')[0],
    PAPEL: 'Administrador do sistema', PERFIL: 'ADMIN', TURNO: '',
    ATIVO: 'SIM', SITUACAO: 'ATIVO', DECIDIDO_EM: agoraTexto(), DECIDIDO_POR: 'instalacao'
  }, 'sistema');
  PropertiesService.getScriptProperties().setProperty('EQUIPE_MIGRADA', 'SIM');
  esquecerProps();

  registrarLog(instalador, 'INSTALAR', 'SISTEMA', planilha.getId(), 'Banco criado');
  return { ok: true, banco: planilha.getUrl(), pasta: raiz.getUrl(), admin: instalador };
}

function colunasDe(tabela) {
  let colunas = ESQUEMA[tabela].slice();
  if (tabela === 'PERFIS') {
    colunas = colunas
      .concat(TELAS.map(function (t) { return 'TELA_' + t.id.toUpperCase(); }))
      .concat(CAPACIDADES.map(function (c) { return 'PODE_' + c; }));
  }
  if (TABELAS_SEM_CONTROLE.indexOf(tabela) === -1) {
    colunas = ['ID'].concat(colunas).concat(COLUNAS_CONTROLE.slice(1));
  }
  return colunas;
}

function escreverCabecalho(aba, colunas) {
  aba.getRange(1, 1, 1, colunas.length).setValues([colunas])
     .setFontWeight('bold').setBackground('#111785').setFontColor('#FFFFFF');
  aba.setFrozenRows(1);
  // Sem isto, "2026-08" e "2026-08-17" viram Date na gravacao e voltam como
  // "Sat Aug 01 2026 00:00:00 GMT-0300" na leitura. Tudo aqui e texto.
  aba.getRange(1, 1, aba.getMaxRows(), Math.max(colunas.length, aba.getMaxColumns())).setNumberFormat('@');
  if (aba.getMaxColumns() > colunas.length) {
    aba.deleteColumns(colunas.length + 1, aba.getMaxColumns() - colunas.length);
  }
}

/**
 * MIGRACAO AUTOMATICA.
 *
 * Roda a cada abertura. Se o banco foi criado por uma versao anterior,
 * as tabelas e colunas que faltam sao criadas aqui, e as tabelas de
 * referencia vazias sao semeadas. Nenhuma dessas correcoes deveria
 * depender de alguem rodar funcao no editor.
 */
const VERSAO_ESQUEMA = '5.1';   // 5.1: COMPETENCIA e SEMANA alinhadas ao PRAZO de cada atividade

function garantirEsquema() {
  // A checagem completa le o cabecalho de 10 abas. Rodar isso a cada
  // abertura custava segundos. So roda quando a versao do codigo mudou.
  if (prop('VERSAO_ESQUEMA', '') === VERSAO_ESQUEMA) return false;

  const planilha = abrirBanco();
  let mexeu = false;

  // 1 · tabelas e colunas que faltam
  const faltaAlgo = Object.keys(ESQUEMA).some(function (tabela) {
    const aba = planilha.getSheetByName(tabela);
    if (!aba) return true;
    const existentes = aba.getRange(1, 1, 1, Math.max(1, aba.getLastColumn())).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });
    return colunasDe(tabela).some(function (c) { return existentes.indexOf(c) === -1; });
  });
  if (faltaAlgo) { sincronizarEsquema(); mexeu = true; }

  // 2 · tabelas de referencia vazias
  if (!listar('PERFIS').length) { semearPerfis(); mexeu = true; }
  if (!listar('ROTINAS').length) { semearRotinas(); mexeu = true; }
  if (!listar('PARAMETROS').length) { semearParametros(); mexeu = true; }
  // Chaves novas em instalacao ja existente: cria so as que faltam.
  (function () {
    const existentes = {};
    listar('PARAMETROS').forEach(function (p) { existentes[String(p.CHAVE).toUpperCase()] = true; });
    const faltantes = [['APRESENTACAO_A', 'Link do Google Apresentacoes do turno A'],
     ['APRESENTACAO_B', 'Link do Google Apresentacoes do turno B'],
     ['APRESENTACAO_C', 'Link do Google Apresentacoes do turno C']]
      .filter(function (p) { return !existentes[p[0]]; })
      .map(function (p) { return { CHAVE: p[0], VALOR: '', DESCRICAO: p[1] }; });
    if (faltantes.length) {
      inserirVarios('PARAMETROS', faltantes, 'sistema');   // era um inserir por chave
      mexeu = true;
    }
  })();
  if (!listar('SETORES').length) { semearSetores(); mexeu = true; }

  // 3 · formato texto em todas as tabelas (bancos antigos vieram sem)
  if (prop('FORMATO_TEXTO', '') !== 'SIM') {
    Object.keys(ESQUEMA).forEach(function (tabela) {
      const aba = planilha.getSheetByName(tabela);
      if (aba) aba.getRange(1, 1, aba.getMaxRows(), aba.getMaxColumns()).setNumberFormat('@');
    });
    PropertiesService.getScriptProperties().setProperty('FORMATO_TEXTO', 'SIM');
  esquecerProps();
    mexeu = true;
  }

  // 4 · tabela de traducao do RH
  if (!listar('DE_PARA').length) { semearDePara(); mexeu = true; }

  // 5 · EQUIPE e ACESSOS eram dois cadastros da mesma pessoa
  if (migrarEquipeParaAcessos()) mexeu = true;

  /*
   * 5.1 · rotulo de mes alinhado ao prazo.
   *
   * Atividade remarcada de um mes para o outro por uma versao antiga
   * ficou com PRAZO em setembro e COMPETENCIA em agosto. A tela ja nao
   * se guia mais pelo rotulo, mas o digesto, a Central e as contagens
   * ainda leem a COMPETENCIA — deixa-la errada e guardar uma mentira no
   * banco. Roda sozinho na primeira abertura depois da atualizacao;
   * ninguem precisa apertar nada.
   */
  try {
    const r = corrigirCompetencias('migracao');
    if (r && r.corrigidas) mexeu = true;
  } catch (e) { registrarLog('sistema', 'ERRO', 'COMPETENCIA', '', String(e)); }

  // 6 · o ADMIN nunca pode perder acesso quando uma tela nova aparece
  if (mexeu) { liberarTudoParaAdmin(); limparCache(); }
  PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', VERSAO_ESQUEMA);
  esquecerProps();
  return mexeu;
}

/**
 * Traz a EQUIPE para dentro de ACESSOS, casando por e-mail.
 *
 * Roda uma vez (marcada em EQUIPE_MIGRADA). Quem ja tem acesso recebe o
 * PAPEL e o TURNO que estavam na EQUIPE; quem so estava na EQUIPE entra
 * como PENDENTE — recebeu papel e aviso, mas nunca teve nivel definido,
 * entao quem decide isso e o administrador, na tela de Pessoas.
 * A aba EQUIPE continua no banco, intacta.
 */
function migrarEquipeParaAcessos() {
  if (prop('EQUIPE_MIGRADA', '') === 'SIM') return false;

  let equipe = [];
  try { equipe = listar('EQUIPE'); } catch (e) { equipe = []; }

  const porEmail = {};
  listar('ACESSOS').forEach(function (a) {
    const e = String(a.EMAIL || '').toLowerCase().trim();
    if (e && !porEmail[e]) porEmail[e] = a;
  });

  const mudancas = [], novos = [];
  equipe.forEach(function (p) {
    const email = String(p.EMAIL || '').toLowerCase().trim();
    if (!email) return;
    const papel = String(p.PAPEL || '').trim();
    const turno = turnoDaPessoa(p);
    const nome = String(p.NOME || '').trim();
    const atual = porEmail[email];

    if (atual) {
      const campos = {};
      if (papel && !String(atual.PAPEL || '').trim()) campos.PAPEL = papel;
      if (turno && !String(atual.TURNO || '').trim()) campos.TURNO = turno;
      if (nome && !String(atual.NOME || '').trim()) campos.NOME = nome;
      if (!String(atual.SITUACAO || '').trim()) {
        campos.SITUACAO = marcado(atual.ATIVO) ? 'ATIVO' : 'INATIVO';
      }
      if (Object.keys(campos).length) mudancas.push({ id: atual.ID, campos: campos });
    } else {
      novos.push({
        EMAIL: email, NOME: nome || email.split('@')[0], PAPEL: papel,
        PERFIL: PERFIL_PADRAO_NOVO_USUARIO, TURNO: turno,
        ATIVO: marcado(p.ATIVO) ? 'SIM' : 'NAO',
        SITUACAO: 'PENDENTE', PEDIDO_EM: agoraTexto(),
        OBSERVACAO: 'Veio do cadastro antigo de Equipe — defina o nível de acesso.'
      });
    }
  });

  // Quem ja estava em ACESSOS e nunca teve SITUACAO ganha uma agora.
  Object.keys(porEmail).forEach(function (e) {
    const a = porEmail[e];
    if (String(a.SITUACAO || '').trim()) return;
    if (mudancas.some(function (m) { return m.id === a.ID; })) return;
    const perfil = String(a.PERFIL || '').toUpperCase().trim();
    mudancas.push({ id: a.ID, campos: {
      SITUACAO: perfil === PERFIL_PADRAO_NOVO_USUARIO ? 'PENDENTE'
              : (marcado(a.ATIVO) ? 'ATIVO' : 'INATIVO') } });
  });

  if (mudancas.length) atualizarVarios('ACESSOS', mudancas, 'migracao');
  if (novos.length) inserirVarios('ACESSOS', novos, 'migracao');

  PropertiesService.getScriptProperties().setProperty('EQUIPE_MIGRADA', 'SIM');
  esquecerProps();
  return (mudancas.length + novos.length) > 0;
}

/** Marca SIM em toda coluna TELA_ e PODE_ do perfil ADMIN. */
function liberarTudoParaAdmin() {
  const admin = listar('PERFIS').filter(function (p) {
    return String(p.PERFIL || '').toUpperCase().trim() === 'ADMIN';
  })[0];
  if (!admin) return;

  const campos = {};
  TELAS.forEach(function (t) { campos['TELA_' + t.id.toUpperCase()] = 'SIM'; });
  CAPACIDADES.forEach(function (c) { campos['PODE_' + c] = 'SIM'; });
  campos.ESCOPO = 'TODOS';
  atualizar('PERFIS', admin.ID, campos, 'sistema');
}

function sincronizarEsquema() {
  const planilha = abrirBanco();
  const novidades = [];
  Object.keys(ESQUEMA).forEach(function (tabela) {
    let aba = planilha.getSheetByName(tabela);
    if (!aba) {
      aba = planilha.insertSheet(tabela);
      escreverCabecalho(aba, colunasDe(tabela));
      novidades.push('aba ' + tabela);
      return;
    }
    const existentes = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
      .map(function (c) { return String(c).trim().toUpperCase(); });
    const faltando = colunasDe(tabela).filter(function (c) { return existentes.indexOf(c) === -1; });
    if (faltando.length) {
      aba.getRange(1, existentes.length + 1, 1, faltando.length).setValues([faltando])
         .setFontWeight('bold').setBackground('#111785').setFontColor('#FFFFFF');
      novidades.push(tabela + ': ' + faltando.join(', '));
    }
  });
  limparCache();
  return { ok: true, novidades: novidades };
}

/* ---------------- Sementes ---------------- */

/* Sementes em LOTE: eram ~68 inserir() (cada um com trava, leitura de
   cabecalho, escrita e troca de geracao) so para criar o banco. Agora e
   uma escrita por tabela. */
function semearPerfis() {
  inserirVarios('PERFIS', perfisPadrao().map(linhaPerfil), 'sistema');
}

/*
 * Perfis padrao do sistema — a fonte unica da verdade.
 *   ADMIN       ve tudo, pode tudo
 *   GERENTE     valida entregas, programa, ve assiduidade e config
 *   COORDENADOR so entrega, escopo do seu turno; NAO valida, NAO ve
 *               assiduidade, apresentacao nem config
 *   CONSULTA    so leitura
 *   PENDENTE    aguardando liberacao, sem telas
 */
function perfisPadrao() {
  return [
    { PERFIL: 'ADMIN', DESCRICAO: 'Administrador do sistema', ESCOPO: 'TODOS',
      telas: TELAS.map(function (t) { return t.id; }), podes: CAPACIDADES },
    { PERFIL: 'GERENTE', DESCRICAO: 'Gerência — valida as entregas', ESCOPO: 'TODOS',
      telas: ['inicio', 'calendario', 'assiduidade', 'apresentacao', 'config', 'acessos'],
      podes: ['VER_INDIVIDUAL', 'EDITAR', 'EXCLUIR', 'ANEXAR', 'VALIDAR', 'PROGRAMAR', 'GERIR_ACESSOS'] },
    { PERFIL: 'COORDENADOR', DESCRICAO: 'Coordenação de turno — entrega', ESCOPO: 'TURNO',
      telas: ['inicio', 'calendario'], podes: ['ANEXAR', 'ENTREGAR'] },
    { PERFIL: 'CONSULTA', DESCRICAO: 'Somente leitura', ESCOPO: 'TODOS',
      telas: ['inicio', 'calendario'], podes: [] },
    { PERFIL: 'PENDENTE', DESCRICAO: 'Aguardando liberação', ESCOPO: 'PROPRIAS', telas: [], podes: [] }
  ];
}

function linhaPerfil(p) {
  const r = { PERFIL: p.PERFIL, DESCRICAO: p.DESCRICAO, ESCOPO: p.ESCOPO };
  TELAS.forEach(function (t) { r['TELA_' + t.id.toUpperCase()] = p.telas.indexOf(t.id) !== -1 ? 'SIM' : 'NAO'; });
  CAPACIDADES.forEach(function (c) { r['PODE_' + c] = p.podes.indexOf(c) !== -1 ? 'SIM' : 'NAO'; });
  return r;
}

/**
 * Reescreve os perfis padrao por cima dos existentes — conserta de uma vez
 * um perfil que foi editado errado (ex.: coordenador que ficou podendo
 * validar ou vendo assiduidade). Nao mexe em ACESSOS: as pessoas continuam
 * nos seus perfis, so a definicao do perfil volta ao correto.
 */
function acaoRestaurarPerfis(usuario) {
  exigirCapacidade(usuario, 'GERIR_ACESSOS');
  // Uma leitura da tabela e duas escritas no total, em vez de um
  // atualizar()/inserir() por perfil (eram ate 10 idas ao Google).
  const existentes = listar('PERFIS');
  const mudancas = [], novos = [];
  perfisPadrao().forEach(function (p) {
    const iguais = existentes.filter(function (x) {
      return String(x.PERFIL).toUpperCase().trim() === p.PERFIL;
    });
    if (iguais.length) {
      mudancas.push({ id: iguais[0].ID, campos: linhaPerfil(p) });
      // apaga DUPLICATAS: uma linha COORDENADOR antiga (escopo PROPRIAS)
      // sobrescrevia a correta, porque a ultima lida vencia.
      for (let i = 1; i < iguais.length; i++) {
        mudancas.push({ id: iguais[i].ID, campos: { EXCLUIDO: 'SIM' } });
      }
    } else {
      novos.push(linhaPerfil(p));
    }
  });
  if (mudancas.length) atualizarVarios('PERFIS', mudancas, usuario.email);
  if (novos.length) inserirVarios('PERFIS', novos, usuario.email);
  esquecerLeituras();
  try { CacheService.getScriptCache().remove('perfis'); } catch (e) {}
  try { avancarGeracao(); } catch (e) {}
  const coord = carregarPerfis()['COORDENADOR'];
  return { ok: true, coordenadorEscopo: coord ? coord.escopo : '(nao encontrado)' };
}

/**
 * As rotinas do GSL, exatamente como na planilha:
 *   QUA Vistoria · QUI Relatorio · SEX Reuniao
 *   1a segunda: Programacao de Ferias · ultima sexta: Mudanca de Funcao
 *   5 vagas de treinamento que o gerente agenda
 * DIA: 1=segunda ... 5=sexta. FREQUENCIA: SEMANAL | MENSAL | AVULSA
 */
function semearRotinas() {
  const lote = [];
  [
    { TIPO: 'VIS', ATIVIDADE: 'Vistoria Setorial (checklist no setor)', FREQUENCIA: 'SEMANAL', DIA: 3, POR_TURNO: 'SIM', EXIGE_SETOR: 'SIM', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'RSC', ATIVIDADE: 'Relatorio Semanal Consolidado (erros + metas + assiduidade)', FREQUENCIA: 'SEMANAL', DIA: 4, POR_TURNO: 'SIM', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'REU', ATIVIDADE: 'Reuniao Semanal com a Gerencia', FREQUENCIA: 'SEMANAL', DIA: 5, POR_TURNO: 'NAO', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'FER', ATIVIDADE: 'Programacao de Ferias (mensal)', FREQUENCIA: 'MENSAL', DIA: 'PRIMEIRA_SEGUNDA', POR_TURNO: 'SIM', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'MDF', ATIVIDADE: 'Mudanca de Funcao — reuniao mensal', FREQUENCIA: 'MENSAL', DIA: 'ULTIMA_SEXTA', POR_TURNO: 'NAO', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'TRE', ATIVIDADE: 'Treinamento com Colaboradores — tema a definir', FREQUENCIA: 'AVULSA', DIA: '', POR_TURNO: 'NAO', EXIGE_SETOR: 'NAO', QUANTIDADE: 5, ATIVO: 'SIM' }
  ].forEach(function (r) { lote.push(r); });
  inserirVarios('ROTINAS', lote, 'sistema');
}

/**
 * Traducao dos codigos, tirada da legenda da folha de ponto da Bartofil.
 *
 * DETALHE QUE MUDA TUDO: quando a pessoa trabalhou, a celula do dia traz o
 * NOME DO TURNO (ADM, A, B, C), nao um codigo. Por isso os turnos entram
 * aqui como "DIA TRABALHADO" — sem eles, toda a folha vira "nao mapeado".
 */
/**
 * Reaplica a tabela padrao do DE-PARA por cima da que esta no banco.
 *
 * POR QUE ISTO EXISTE: a semente so roda quando a tabela esta VAZIA —
 * de proposito, porque as suas edicoes valem mais que a minha tabela.
 * Só que a versao anterior do sistema semeou um DE-PARA com nove
 * codigos errados, e num banco que ja existe eles nunca sairiam de la
 * sozinhos. Este botao corrige os que divergem, cria os que faltam e
 * NAO apaga nada que voce tenha acrescentado.
 */
function acaoRestaurarDePara(usuario) {
  exigirCapacidade(usuario, 'PROGRAMAR');

  const existentes = {};
  listar('DE_PARA').forEach(function (l) {
    const c = codigo_(l.CODIGO);
    if (c && !existentes[c]) existentes[c] = l;
  });

  const mudancas = [], novos = [];
  dePARAPadrao().forEach(function (p) {
    const atual = existentes[p.CODIGO];
    if (!atual) { novos.push(p); return; }
    // So grava o que realmente diverge — evita reescrever a tabela toda.
    if (String(atual.CATEGORIA || '').trim() !== p.CATEGORIA ||
        norm_(atual.CONTA_COMO_AUSENCIA) !== p.CONTA_COMO_AUSENCIA ||
        String(atual.DESCRICAO || '').trim() !== p.DESCRICAO) {
      mudancas.push({ id: atual.ID, campos: {
        DESCRICAO: p.DESCRICAO, CATEGORIA: p.CATEGORIA,
        CONTA_COMO_AUSENCIA: p.CONTA_COMO_AUSENCIA } });
    }
  });

  if (mudancas.length) atualizarVarios('DE_PARA', mudancas, usuario.email);
  if (novos.length) inserirVarios('DE_PARA', novos, usuario.email);
  limparCache();

  return { ok: true, corrigidos: mudancas.length, criados: novos.length,
           total: dePARAPadrao().length };
}

function semearDePara() {
  inserirVarios('DE_PARA', dePARAPadrao(), 'sistema');
}

function dePARAPadrao() {
  /*
   * TABELA REAL DA BARTOFIL — transcrita da legenda da FOLHA DE PONTO e
   * conferida contra a aba DE-PARA da GSL-DADOS em producao. A versao
   * anterior era uma aproximacao minha e errava em nove codigos, o que
   * jogava numero errado no painel inteiro:
   *
   *   5, 26, 401, 003  estavam como "Compensacao"  -> Ajuste de horas
   *   6                estava como "Licenca legal" -> Abono
   *   16               estava como "Falta"         -> Falta injustificada
   *   18               estava como "Falta"         -> Falta disciplinar
   *   19               estava como "Compensacao"   -> Folga
   *   23 e 24          estavam como "Atestado/Sim" -> Licenca legal/Nao
   *   401              contava como ausencia       -> nao conta
   *   00, 28, 29       simplesmente nao existiam
   *
   * As tres familias de falta sao separadas DE PROPOSITO: injustificada
   * (16), justificada (28) e disciplinar (18) sao tratadas de formas
   * diferentes pela gestao e no painel elas nunca se somam num balde so.
   *
   * IGNORAR e uma categoria de verdade: a grade traz tracos, marcacoes
   * internas do RH e anotacoes em texto no meio dos dias. Sem elas aqui,
   * cada uma virava um lancamento "A CONFIRMAR" que entrava na conta e
   * empurrava a taxa de absenteismo para baixo (eram 173 celulas na folha
   * de agosto/2026).
   *
   * O dia trabalhado NAO tem codigo proprio: a celula traz a SIGLA DO
   * TURNO. Por isso ADM, A, B, C, J e BC entram aqui como Presenca — sem
   * eles, a folha inteira vira "nao mapeado".
   */
  const codigos = [
    // sigla do turno = dia trabalhado
    ['ADM', 'Dia trabalhado — turno administrativo', 'Presença', 'NAO'],
    ['A',   'Dia trabalhado — turno A',              'Presença', 'NAO'],
    ['B',   'Dia trabalhado — turno B',              'Presença', 'NAO'],
    ['C',   'Dia trabalhado — turno C',              'Presença', 'NAO'],
    ['J',   'Dia trabalhado — Jovem Aprendiz',       'Presença', 'NAO'],
    ['BC',  'Dia trabalhado — Bombeiros Civis',      'Presença', 'NAO'],

    // legenda numerada do RH
    ['00',  'Licença sem vencimento',                'Licença legal', 'SIM'],
    ['1',   'Atestado médico',                       'Atestado', 'SIM'],
    ['2',   'Viagem a serviço',                      'Presença', 'NAO'],
    ['3',   'Folga a compensar',                     'Folga', 'NAO'],
    ['4',   'Falecimento (3 dias consecutivos)',     'Licença legal', 'NAO'],
    ['5',   'H.E. compensada',                       'Ajuste de horas', 'NAO'],
    ['6',   'Abonado',                               'Abono', 'NAO'],
    ['6.1', 'Férias',                                'Férias', 'NAO'],
    ['7',   'Serviço externo',                       'Presença', 'NAO'],
    ['8',   'Casamento (3 dias úteis)',              'Licença legal', 'NAO'],
    ['9',   'Nascimento de filho(a) — 5 dias',       'Licença legal', 'NAO'],
    ['10',  'Justiça eleitoral',                     'Licença legal', 'NAO'],
    ['11',  'Doação de sangue',                      'Licença legal', 'NAO'],
    ['12',  'Cinzas',                                'Folga', 'NAO'],
    ['13',  'Transferência',                         'Outros', 'NAO'],
    ['14',  'Feriado',                               'Folga', 'NAO'],
    ['15',  'Folga a compensar — banco de horas',    'Folga', 'NAO'],
    ['16',  'Falta',                                 'Falta injustificada', 'SIM'],
    ['17',  'Esqueceu crachá / marcação',            'Presença', 'NAO'],
    ['18',  'Falta (suspensão)',                     'Falta disciplinar', 'SIM'],
    ['19',  'Dia compensado',                        'Folga', 'NAO'],
    ['20',  'Enchente',                              'Licença legal', 'NAO'],
    ['21',  'Consulta médica',                       'Atestado', 'SIM'],
    ['22',  'Audiência',                             'Licença legal', 'NAO'],
    ['23',  'Acompanhante — filho',                  'Licença legal', 'NAO'],
    ['24',  'Acompanhante — esposa',                 'Licença legal', 'NAO'],
    ['26',  'Desconto de horas parcial — banco de horas', 'Ajuste de horas', 'NAO'],
    ['28',  'Falta com justificativa',               'Falta justificada', 'SIM'],
    ['29',  'Cáceres sem vencimento',                'Licença legal', 'SIM'],
    ['130', 'Atestado acima de 15 dias',             'Atestado', 'SIM'],
    ['401', 'Hora falta desvio folha',               'Ajuste de horas', 'NAO'],
    ['003', 'Saiu mais cedo — horas a compensar',    'Ajuste de horas', 'NAO'],

    // o que aparece na grade e NAO e lancamento
    ['-',                'Traço na grade (sem lançamento)', 'Ignorar', 'NAO'],
    ['PP',               'Marcação interna do RH',          'Ignorar', 'NAO'],
    ['SISTEMA INTRANET', 'Anotação de texto na grade',      'Ignorar', 'NAO']
  ];
  return codigos.map(function (c) {
    return { CODIGO: c[0], DESCRICAO: c[1], CATEGORIA: c[2], CONTA_COMO_AUSENCIA: c[3] };
  });
}

function semearSetores() {
  inserirVarios('SETORES', ['Recebimento', 'Grandeza', 'Miudeza', 'Nobre', 'Carregamento', 'Mesanino']
    .map(function (s) { return { SETOR: s, ATIVO: 'SIM' }; }), 'sistema');
}

function semearParametros() {
  const lote = [];
  [
    ['JANELA_PRAZOS_DIAS', '1', 'Janela de "proximos prazos" no e-mail matinal (dias)'],
    ['COPIAR_GESTAO_APOS_DIAS', '1', 'Copiar a gestao no digesto apos atraso de (dias)'],
    ['EMAIL_COPIA', '', 'E-mail em copia (opcional)'],
    ['EMAIL_DIRETORIA', '', 'E-mail da diretoria para o relatorio mensal (opcional)'],
    ['GERAR_MES_NO_DIA', '20', 'Dia em que o proximo mes e gerado automaticamente'],
    ['HORA_ATUALIZACAO_RH', '10', 'Hora (0 a 23) da releitura diaria da planilha do RH'],
    ['ENVIAR_DIGESTO', 'SIM', 'Enviar o digesto matinal aos coordenadores'],
    ['META_ABSENTEISMO', '0.05', 'Meta de absenteismo do painel de assiduidade'],
    ['CUSTO_DIA_AUSENCIA', '0', 'Custo estimado de um dia de ausencia (R$) — 0 desliga o calculo'],
    ['RH_CAB_MATRICULA', 'MATRICULA', 'Texto que identifica a coluna de matricula na folha'],
    ['RH_CAB_NOME', 'NOME', 'Cabecalho da coluna de nome'],
    ['RH_CAB_TURNO', 'T.', 'Cabecalho da coluna de turno'],
    ['RH_DIGITOS_MATRICULA', '6', 'Minimo de digitos para a linha valer como colaborador'],
    ['RH_TURNOS', 'ADM,A,B,C,J,BC', 'Turnos aceitos; fora disso a linha e ignorada'],
    ['RH_CORTAR_LINHAS', 'HORAS TRABALHADAS', 'Textos que marcam linha de totalizacao do RH (conferido so nas colunas de matricula, nome e turno)'],
    ['APRESENTACAO_A', '', 'Link do Google Apresentacoes do turno A'],
    ['APRESENTACAO_B', '', 'Link do Google Apresentacoes do turno B'],
    ['APRESENTACAO_C', '', 'Link do Google Apresentacoes do turno C']
  ].forEach(function (p) { lote.push({ CHAVE: p[0], VALOR: p[1], DESCRICAO: p[2] }); });
  inserirVarios('PARAMETROS', lote, 'sistema');
}

/** Le um parametro da tabela PARAMETROS (nao das propriedades do script). */
function parametro(chave, padrao) {
  const achado = listar('PARAMETROS').filter(function (p) {
    return String(p.CHAVE || '').toUpperCase().trim() === String(chave).toUpperCase();
  })[0];
  return achado && String(achado.VALOR) !== '' ? achado.VALOR : padrao;
}

/*
 * Estado das rotinas automaticas.
 *
 * "Ligado" nao e so ter algum gatilho: e ter os que importam. Conferimos
 * pelo nome da funcao, entao o indicador so acende verde quando as quatro
 * rotinas estao de pe (diaria, mensal, geracao do mes e aquecimento).
 */
const GATILHOS_ESPERADOS = ['rotinaDiaria', 'rotinaMensal', 'gerarMesSeNecessario',
                            'aquecerCache', 'atualizarCompetenciaAberta'];
const CHAVE_GATILHOS = 'estado_gatilhos';

/** Chamado por quem liga ou desliga gatilho: o selo tem que refletir na hora. */
function esquecerEstadoGatilhos() {
  try { CacheService.getScriptCache().remove(CHAVE_GATILHOS); } catch (e) {}
}

function estadoInstalacao() {
  // getProjectTriggers exige o escopo script.scriptapp. Sem ele, nao da
  // para saber — o indicador mostra "desconhecido", nunca um numero solto.
  //
  // DESEMPENHO: esta chamada roda no bootstrap, no dadosConfig E no
  // dadosAcessos — tres idas ao ScriptApp por sessao para uma informacao
  // que muda quando alguem aperta "Ligar rotinas automaticas", ou seja,
  // quase nunca. Guardada por 10 minutos; o botao limpa na hora.
  let ligados = null;   // null = nao consegui checar
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(CHAVE_GATILHOS);
  if (guardado) {
    try { ligados = JSON.parse(guardado); } catch (e) { ligados = null; }
  }
  if (ligados === null) {
    try {
      const nomes = ScriptApp.getProjectTriggers().map(function (g) { return g.getHandlerFunction(); });
      ligados = GATILHOS_ESPERADOS.filter(function (f) { return nomes.indexOf(f) !== -1; });
      try { cache.put(CHAVE_GATILHOS, JSON.stringify(ligados), 600); } catch (e) {}
    } catch (e) { ligados = null; }
  }

  const total = GATILHOS_ESPERADOS.length;
  return {
    instalado: bancoInstalado(),
    rhConfigurado: listar('ARQUIVOS_RH').length > 0,
    // compatibilidade: quem lia .gatilhos continua lendo um numero
    gatilhos: ligados === null ? '?' : ligados.length,
    rotinas: {
      estado: ligados === null ? 'desconhecido' : (ligados.length >= total ? 'ligado' : (ligados.length ? 'parcial' : 'desligado')),
      ligados: ligados === null ? 0 : ligados.length,
      total: total
    }
  };
}

/*
 * A fonte do RH vive na tabela ARQUIVOS_RH; quem a lê e processa é o
 * Dados.gs.
 *
 * (Este comentário apontava para "Assiduidade.gs" — um arquivo que nunca
 * existiu no projeto. O módulo de assiduidade sempre foi o Dados.gs.
 * Uma referência errada em comentário faz alguém procurar um arquivo que
 * não existe, então ela virou o nome certo.)
 */

/** Socorro do dono: rode pelo editor se perder o proprio acesso. */
function restaurarMeuAcesso() {
  const email = emailDeQuemAbriu();
  if (!email) throw new Error('Não consegui identificar sua conta.');
  const existente = listar('ACESSOS').filter(function (a) {
    return String(a.EMAIL || '').toLowerCase().trim() === email;
  })[0];
  if (existente) atualizar('ACESSOS', existente.ID, { PERFIL: 'ADMIN', ATIVO: 'SIM' }, 'sistema');
  else inserir('ACESSOS', { EMAIL: email, NOME: email.split('@')[0], PERFIL: 'ADMIN', ATIVO: 'SIM' }, 'sistema');
  PropertiesService.getScriptProperties().setProperty('EMAIL_ADMIN', email);
  esquecerProps();
  limparCache();
  return { ok: true, admin: email };
}
