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
  AGR_COLAB:   ['COMPETENCIA', 'MATRICULA', 'NOME', 'TURNO', 'REGISTROS', 'TRABALHADOS',
                'AUSENCIAS', 'FALTAS', 'ATESTADOS', 'FERIAS', 'FOLGAS', 'LICENCAS',
                'ASSIDUIDADE', 'ULTIMA_FALTA'],
  // Painel pronto, gravado na importacao. A tela le UMA linha em vez de
  // varrer as 5 mil da FATO a cada abertura.
  PAINEL:      ['COMPETENCIA', 'GERADO_EM', 'PAYLOAD'],

  // acesso e auditoria
  ACESSOS:    ['EMAIL', 'NOME', 'PERFIL', 'TURNO', 'ATIVO'],
  PERFIS:     ['PERFIL', 'DESCRICAO', 'ESCOPO'],
  LOG:        ['QUANDO', 'QUEM', 'ACAO', 'TABELA', 'REGISTRO', 'DETALHE']
};

const TABELAS_SEM_CONTROLE = ['LOG'];

function bancoInstalado() { return !!prop('ID_BANCO', ''); }

function instalar(emailAdmin) {
  if (bancoInstalado()) throw new Error('O banco ja foi instalado. Para recomecar, apague a propriedade ID_BANCO.');

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

  semearPerfis();
  semearRotinas();
  semearParametros();
  semearSetores();
  semearDePara();
  inserir('ACESSOS', { EMAIL: instalador, NOME: instalador.split('@')[0], PERFIL: 'ADMIN', ATIVO: 'SIM' }, 'sistema');
  inserir('EQUIPE', { PAPEL: 'Administrador do sistema', NOME: instalador.split('@')[0], EMAIL: instalador, TURNO: '', ATIVO: 'SIM' }, 'sistema');

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
const VERSAO_ESQUEMA = '4.2';   // 4.2: modulos + tela apresentacao (coluna TELA_APRESENTACAO em PERFIS)

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
    [['APRESENTACAO_A', 'Link do Google Apresentacoes do turno A'],
     ['APRESENTACAO_B', 'Link do Google Apresentacoes do turno B'],
     ['APRESENTACAO_C', 'Link do Google Apresentacoes do turno C']].forEach(function (p) {
      if (!existentes[p[0]]) {
        inserir('PARAMETROS', { CHAVE: p[0], VALOR: '', DESCRICAO: p[1] }, 'sistema');
        mexeu = true;
      }
    });
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

  // 5 · o ADMIN nunca pode perder acesso quando uma tela nova aparece
  if (mexeu) { liberarTudoParaAdmin(); limparCache(); }
  PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA', VERSAO_ESQUEMA);
  esquecerProps();
  return mexeu;
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

function semearPerfis() {
  perfisPadrao().forEach(function (p) { inserir('PERFIS', linhaPerfil(p), 'sistema'); });
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
    { PERFIL: 'GERENTE', DESCRICAO: 'Gerencia — valida as entregas', ESCOPO: 'TODOS',
      telas: ['inicio', 'calendario', 'assiduidade', 'config'],
      podes: ['VER_INDIVIDUAL', 'EDITAR', 'EXCLUIR', 'ANEXAR', 'VALIDAR', 'PROGRAMAR'] },
    { PERFIL: 'COORDENADOR', DESCRICAO: 'Coordenacao de turno — entrega', ESCOPO: 'TURNO',
      telas: ['inicio', 'calendario'], podes: ['ANEXAR', 'ENTREGAR'] },
    { PERFIL: 'CONSULTA', DESCRICAO: 'Somente leitura', ESCOPO: 'TODOS',
      telas: ['inicio', 'calendario'], podes: [] },
    { PERFIL: 'PENDENTE', DESCRICAO: 'Aguardando liberacao', ESCOPO: 'PROPRIAS', telas: [], podes: [] }
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
  perfisPadrao().forEach(function (p) {
    const iguais = listar('PERFIS').filter(function (x) {
      return String(x.PERFIL).toUpperCase().trim() === p.PERFIL;
    });
    if (iguais.length) {
      atualizar('PERFIS', iguais[0].ID, linhaPerfil(p), usuario.email);
      // apaga DUPLICATAS: uma linha COORDENADOR antiga (escopo PROPRIAS)
      // sobrescrevia a correta, porque a ultima lida vencia.
      for (let i = 1; i < iguais.length; i++) {
        try { excluir('PERFIS', iguais[i].ID, usuario.email); } catch (e) {}
      }
    } else {
      inserir('PERFIS', linhaPerfil(p), usuario.email);
    }
  });
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
  [
    { TIPO: 'VIS', ATIVIDADE: 'Vistoria Setorial (checklist no setor)', FREQUENCIA: 'SEMANAL', DIA: 3, POR_TURNO: 'SIM', EXIGE_SETOR: 'SIM', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'RSC', ATIVIDADE: 'Relatorio Semanal Consolidado (erros + metas + assiduidade)', FREQUENCIA: 'SEMANAL', DIA: 4, POR_TURNO: 'SIM', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'REU', ATIVIDADE: 'Reuniao Semanal com a Gerencia', FREQUENCIA: 'SEMANAL', DIA: 5, POR_TURNO: 'NAO', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'FER', ATIVIDADE: 'Programacao de Ferias (mensal)', FREQUENCIA: 'MENSAL', DIA: 'PRIMEIRA_SEGUNDA', POR_TURNO: 'SIM', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'MDF', ATIVIDADE: 'Mudanca de Funcao — reuniao mensal', FREQUENCIA: 'MENSAL', DIA: 'ULTIMA_SEXTA', POR_TURNO: 'NAO', EXIGE_SETOR: 'NAO', QUANTIDADE: '', ATIVO: 'SIM' },
    { TIPO: 'TRE', ATIVIDADE: 'Treinamento com Colaboradores — tema a definir', FREQUENCIA: 'AVULSA', DIA: '', POR_TURNO: 'NAO', EXIGE_SETOR: 'NAO', QUANTIDADE: 5, ATIVO: 'SIM' }
  ].forEach(function (r) { inserir('ROTINAS', r, 'sistema'); });
}

/**
 * Traducao dos codigos, tirada da legenda da folha de ponto da Bartofil.
 *
 * DETALHE QUE MUDA TUDO: quando a pessoa trabalhou, a celula do dia traz o
 * NOME DO TURNO (ADM, A, B, C), nao um codigo. Por isso os turnos entram
 * aqui como "DIA TRABALHADO" — sem eles, toda a folha vira "nao mapeado".
 */
function semearDePara() {
  // Categorias iguais as do Dados.gs: Presenca, Falta, Atestado, Ferias,
  // Folga, Licenca legal, Compensacao, Outros.
  const codigos = [
    ['ADM', 'Dia trabalhado (turno ADM)', 'Presenca', 'NAO'],
    ['A',   'Dia trabalhado (turno A)',   'Presenca', 'NAO'],
    ['B',   'Dia trabalhado (turno B)',   'Presenca', 'NAO'],
    ['C',   'Dia trabalhado (turno C)',   'Presenca', 'NAO'],
    ['J',   'Dia trabalhado (jovem aprendiz)', 'Presenca', 'NAO'],
    ['BC',  'Dia trabalhado (turno BC)',  'Presenca', 'NAO'],
    ['1',   'Atestado medico',            'Atestado', 'SIM'],
    ['2',   'Viagem a servico',           'Presenca', 'NAO'],
    ['3',   'Folga a compensar',          'Folga', 'NAO'],
    ['4',   'Falecimento (3 dias consecutivos)', 'Licenca legal', 'NAO'],
    ['5',   'H.E. compensada',            'Compensacao', 'NAO'],
    ['6',   'Abonado',                    'Licenca legal', 'NAO'],
    ['6.1', 'Ferias',                     'Ferias', 'NAO'],
    ['7',   'Servico externo',            'Presenca', 'NAO'],
    ['8',   'Casamento (3 dias uteis)',   'Licenca legal', 'NAO'],
    ['9',   'Nascimento de filho (5 dias)', 'Licenca legal', 'NAO'],
    ['10',  'Justica eleitoral',          'Licenca legal', 'NAO'],
    ['11',  'Doacao de sangue',           'Licenca legal', 'NAO'],
    ['12',  'Cinzas',                     'Folga', 'NAO'],
    ['13',  'Transferencia',              'Outros', 'NAO'],
    ['14',  'Feriado',                    'Folga', 'NAO'],
    ['15',  'Folga a compensar BH',       'Folga', 'NAO'],
    ['16',  'Falta',                      'Falta', 'SIM'],
    ['17',  'Esqueceu cracha / marcacao', 'Presenca', 'NAO'],
    ['18',  'Falta (suspensao)',          'Falta', 'SIM'],
    ['19',  'Dia compensado',             'Compensacao', 'NAO'],
    ['20',  'Enchente',                   'Licenca legal', 'NAO'],
    ['21',  'Consulta medica',            'Atestado', 'SIM'],
    ['22',  'Audiencia',                  'Licenca legal', 'NAO'],
    ['23',  'Acompanhante de filho',      'Atestado', 'SIM'],
    ['24',  'Acompanhante de esposa',     'Atestado', 'SIM'],
    ['26',  'Desconto horas parcial BH',  'Compensacao', 'NAO'],
    ['130', 'Atestado acima de 15 dias',  'Atestado', 'SIM'],
    ['401', 'Hora falta desvio folha',    'Falta', 'SIM'],
    ['003', 'Saiu mais cedo (horas a compensar)', 'Compensacao', 'NAO']
  ];
  codigos.forEach(function (c) {
    inserir('DE_PARA', { CODIGO: c[0], DESCRICAO: c[1], CATEGORIA: c[2],
                         CONTA_COMO_AUSENCIA: c[3] }, 'sistema');
  });
}

function semearSetores() {
  ['Recebimento', 'Grandeza', 'Miudeza', 'Nobre', 'Carregamento', 'Mesanino']
    .forEach(function (s) { inserir('SETORES', { SETOR: s, ATIVO: 'SIM' }, 'sistema'); });
}

function semearParametros() {
  [
    ['JANELA_PRAZOS_DIAS', '1', 'Janela de "proximos prazos" no e-mail matinal (dias)'],
    ['COPIAR_GESTAO_APOS_DIAS', '1', 'Copiar a gestao no digesto apos atraso de (dias)'],
    ['EMAIL_COPIA', '', 'E-mail em copia (opcional)'],
    ['EMAIL_DIRETORIA', '', 'E-mail da diretoria para o relatorio mensal (opcional)'],
    ['GERAR_MES_NO_DIA', '20', 'Dia em que o proximo mes e gerado automaticamente'],
    ['ENVIAR_DIGESTO', 'SIM', 'Enviar o digesto matinal aos coordenadores'],
    ['META_ABSENTEISMO', '0.05', 'Meta de absenteismo do painel de assiduidade'],
    ['CUSTO_DIA_AUSENCIA', '0', 'Custo estimado de um dia de ausencia (R$) — 0 desliga o calculo'],
    ['RH_CAB_MATRICULA', 'MATRICULA', 'Texto que identifica a coluna de matricula na folha'],
    ['RH_CAB_NOME', 'NOME', 'Cabecalho da coluna de nome'],
    ['RH_CAB_TURNO', 'T.', 'Cabecalho da coluna de turno'],
    ['RH_DIGITOS_MATRICULA', '6', 'Minimo de digitos para a linha valer como colaborador'],
    ['RH_TURNOS', 'ADM,A,B,C,J,BC', 'Turnos aceitos; fora disso a linha e ignorada'],
    ['RH_CORTAR_LINHAS', 'HORAS TRABALHADAS,TOTAL,QUNT', 'Linhas de totalizacao a pular'],
    ['APRESENTACAO_A', '', 'Link do Google Apresentacoes do turno A'],
    ['APRESENTACAO_B', '', 'Link do Google Apresentacoes do turno B'],
    ['APRESENTACAO_C', '', 'Link do Google Apresentacoes do turno C']
  ].forEach(function (p) {
    inserir('PARAMETROS', { CHAVE: p[0], VALOR: p[1], DESCRICAO: p[2] }, 'sistema');
  });
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
const GATILHOS_ESPERADOS = ['rotinaDiaria', 'rotinaMensal', 'gerarMesSeNecessario', 'aquecerCache'];

function estadoInstalacao() {
  // getProjectTriggers exige o escopo script.scriptapp. Sem ele, nao da
  // para saber — o indicador mostra "desconhecido", nunca um numero solto.
  let ligados = null;   // null = nao consegui checar
  try {
    const nomes = ScriptApp.getProjectTriggers().map(function (g) { return g.getHandlerFunction(); });
    ligados = GATILHOS_ESPERADOS.filter(function (f) { return nomes.indexOf(f) !== -1; });
  } catch (e) { ligados = null; }

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

/* A fonte do RH agora vive na tabela ARQUIVOS_RH — ver Assiduidade.gs. */

/** Socorro do dono: rode pelo editor se perder o proprio acesso. */
function restaurarMeuAcesso() {
  const email = emailDeQuemAbriu();
  if (!email) throw new Error('Nao consegui identificar sua conta.');
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
