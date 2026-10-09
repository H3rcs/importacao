/**
 * PERMISSOES
 *
 * Toda regra de acesso do sistema esta neste arquivo e na tabela PERFIS.
 * Em nenhum outro lugar existe "if perfil == GERENTE".
 *
 * A tabela PERFIS e criada pelo instalador: uma linha por nivel,
 * uma coluna TELA_<id> por tela e uma coluna PODE_<capacidade> por acao.
 * Tela nova: registre em TELAS e rode sincronizarEsquema().
 *
 * ESCOPO define o alcance de cada nivel:
 *   TODOS    - ve a operacao inteira
 *   TURNO    - ve o que for do proprio turno
 *   PROPRIAS - ve so o que e dele: atividade onde e responsavel ou que criou
 */

/*
 * MODULOS — a porta de entrada.
 *
 * O sistema abre num menu de modulos, nao numa tela solta. Cada modulo
 * junta as telas que pertencem ao mesmo assunto; a barra lateral so mostra
 * as telas do modulo em que a pessoa entrou. Um modulo sem nenhuma tela
 * liberada simplesmente nao aparece.
 */
const BUILD_PERMISSOES = '2026.10.09b';   // carimbo da entrega — ver APP.build no Codigo.gs

const MODULOS = [
  { id: 'calendario',   nome: 'Calendário',
    frase: 'Atividades do mês, entregas, validações e o andamento por turno.',
    acao: 'Abrir calendário', icone: 'calendario', cor: 'azul' },
  { id: 'assiduidade',  nome: 'Assiduidade',
    frase: 'Faltas, atestados e o desempenho dos colaboradores do CD.',
    acao: 'Ver assiduidade', icone: 'pessoas', cor: 'verde' },
  { id: 'apresentacao', nome: 'Apresentação',
    frase: 'Modo reunião: os números da semana em tela cheia.',
    acao: 'Apresentar', icone: 'tela', cor: 'ambar' },
  { id: 'nobreaks',     nome: 'Nobreaks',
    frase: 'Leituras de entrada e saída, carga e alertas de cada nobreak.',
    acao: 'Ver nobreaks', icone: 'bateria', cor: 'ciano' },
  { id: 'limpeza',      nome: 'Limpeza CD',
    frase: 'Ações geradas nas vistorias e o custo dos produtos de limpeza.',
    acao: 'Abrir limpeza', icone: 'limpeza', cor: 'verde' },
  { id: 'quadro',       nome: 'Quadro do CD',
    frase: 'Efetivo por função e turno, admissões, desligamentos e motivos.',
    acao: 'Ver quadro', icone: 'grafico', cor: 'azul' },
  { id: 'estoque',      nome: 'Estoque de TI',
    frase: 'Itens de informática: saldo, entradas, saídas, inventário e onde cada item está.',
    acao: 'Abrir estoque', icone: 'computador', cor: 'roxo' },
  /* Jovem Aprendiz (4.2.2): o Portal RH Aprendiz — tudo em Aprendiz.gs e Aprendiz.html. */
  { id: 'aprendiz',     nome: 'Jovem Aprendiz',
    frase: 'Imersão corporativa: avaliações de cada setor, médias por competência e o cronograma de rotação.',
    acao: 'Abrir portal', icone: 'aprendiz', cor: 'azul' },
  { id: 'config',       nome: 'Configuração',
    frase: 'Pessoas, acessos, rotinas do calendário e fontes do RH.',
    acao: 'Configurar', icone: 'engrenagem', cor: 'roxo' }
];

/*
 * A tela 'ranking' saiu: tudo que ela mostrava (melhores, atenção, mais
 * atestados, mais faltas e o quadro por turno) vive agora dentro da aba
 * COLABORADORES da própria Assiduidade — era a mesma informação em dois
 * lugares. A coluna TELA_RANKING continua na tabela PERFIS, inofensiva;
 * nenhum dado foi apagado.
 */
const TELAS = [
  { id: 'inicio',      nome: 'Central',      cor: 'azul',    modulo: 'calendario',  funcao: 'dadosInicio' },
  { id: 'calendario',  nome: 'Calendário',   cor: 'verde',   modulo: 'calendario',  funcao: 'dadosCalendario' },
  { id: 'acoes',       nome: 'Plano de Ação', cor: 'ambar',  modulo: 'calendario',  funcao: 'dadosAcoes' },
  { id: 'assiduidade', nome: 'Assiduidade',  cor: 'amarelo', modulo: 'assiduidade', funcao: 'dadosAssiduidade' },
  { id: 'apresentacao', nome: 'Apresentação', cor: 'amarelo', modulo: 'apresentacao', funcao: 'dadosApresentacao' },
  { id: 'nobreaks',    nome: 'Nobreaks',     cor: 'azul',    modulo: 'nobreaks',    funcao: 'dadosNobreaks' },
  { id: 'limpeza',     nome: 'Limpeza CD',   cor: 'verde',   modulo: 'limpeza',     funcao: 'dadosLimpeza' },
  { id: 'quadro',      nome: 'Quadro do CD', cor: 'amarelo', modulo: 'quadro',      funcao: 'dadosQuadro' },
  { id: 'estoque',     nome: 'Estoque de TI', cor: 'azul',   modulo: 'estoque',     funcao: 'dadosEstoque' },
  { id: 'aprendiz',    nome: 'Portal RH Aprendiz', cor: 'azul', modulo: 'aprendiz',  funcao: 'dadosAprendiz' },
  { id: 'config',      nome: 'Configuração', cor: 'branco',  modulo: 'config',      funcao: 'dadosConfig', exige: 'PROGRAMAR' },
  { id: 'acessos',     nome: 'Pessoas e acessos', cor: 'branco', modulo: 'config',  funcao: 'dadosPessoas', exige: 'GERIR_ACESSOS' },
  { id: 'filiais',     nome: 'Filiais e painéis', cor: 'branco', modulo: 'config',  funcao: 'dadosFiliais', exige: 'GERIR_FILIAIS' },
  { id: 'relatos',     nome: 'Relatos de erro', cor: 'branco', modulo: 'config',   funcao: 'dadosRelatos', exige: 'GERIR_ACESSOS' }
];

/*
 * ENTREGAR  - anexa a propria entrega (coordenador)
 * VALIDAR   - aprova, reprova ou cancela (gerente)
 * PROGRAMAR - gera mes, remarca, define setor, agenda treinamento, mexe na config
 */
/*
 * GERIR_ACOES - cria, edita, cancela e exclui acao do plano (gerente).
 *               Concluir NAO exige isso: o responsavel conclui a dele.
 */
/*
 * LANCAR_NOBREAK - lanca e corrige leituras dos nobreaks.
 * GERIR_LIMPEZA  - registra acoes da limpeza, compras e produtos.
 * GERIR_FILIAIS  - cria filial e liga/oculta/desativa paineis.
 */
const CAPACIDADES = ['VER_INDIVIDUAL', 'ENTREGAR', 'VALIDAR', 'PROGRAMAR',
                     'EDITAR', 'EXCLUIR', 'ANEXAR', 'GERIR_ACESSOS',
                     'GERIR_ACOES', 'LANCAR_NOBREAK', 'GERIR_LIMPEZA',
                     'GERIR_FILIAIS', 'GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE'];

/*
 * MODULOS POR PESSOA.
 *
 * O nivel (ADMIN, GERENTE, COORDENADOR...) continua sendo o ponto de
 * partida. Por cima dele, cada pessoa pode ter um ajuste por modulo:
 *   NAO    nao ve o modulo, mesmo que o nivel dela veja
 *   VER    ve o modulo, sem poder lancar/editar nele
 *   EDITAR ve e pode lancar/editar (so nos modulos listados abaixo com
 *          capacidades; nos outros, o que ela pode fazer vem do nivel)
 * Configuracao nao entra: ela segue sempre o nivel.
 *
 * Capacidades que "editar" liga (e "ver" desliga) em cada modulo:
 */
const MODULOS_AJUSTAVEIS = {
  calendario: [], assiduidade: [], apresentacao: [], quadro: [], aprendiz: [],
  nobreaks: ['LANCAR_NOBREAK'],
  limpeza: ['GERIR_LIMPEZA'],
  estoque: ['GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE']
};
const MODOS_MODULO = ['NAO', 'VER', 'EDITAR'];

function lerModulosPessoa(texto) {
  const saida = {};
  let obj = {};
  try { obj = JSON.parse(String(texto || '{}')) || {}; } catch (e) { obj = {}; }
  Object.keys(obj).forEach(function (m) {
    const modo = String(obj[m] || '').toUpperCase().trim();
    if (MODULOS_AJUSTAVEIS[m] && MODOS_MODULO.indexOf(modo) !== -1) {
      saida[m] = (modo === 'EDITAR' && !MODULOS_AJUSTAVEIS[m].length) ? 'VER' : modo;
    }
  });
  return saida;
}

/* Aplica os ajustes da pessoa sobre as permissoes do nivel (sem alterar o nivel). */
function aplicarModulosDaPessoa(base, ajustes) {
  const chaves = Object.keys(ajustes || {});
  if (!chaves.length) return base;
  const p = { escopo: base.escopo, telas: base.telas.slice(), podes: base.podes.slice(),
              descricao: base.descricao, id: base.id };
  const tira = function (lista, x) { const i = lista.indexOf(x); if (i !== -1) lista.splice(i, 1); };
  const poe = function (lista, x) { if (lista.indexOf(x) === -1) lista.push(x); };
  chaves.forEach(function (m) {
    const modo = ajustes[m];
    const telas = TELAS.filter(function (t) { return t.modulo === m; });
    const caps = MODULOS_AJUSTAVEIS[m] || [];
    if (modo === 'NAO') {
      telas.forEach(function (t) { tira(p.telas, t.id); });
      caps.forEach(function (c) { tira(p.podes, c); });
      return;
    }
    if (modo === 'EDITAR') caps.forEach(function (c) { poe(p.podes, c); });
    if (modo === 'VER') caps.forEach(function (c) { tira(p.podes, c); });
    telas.forEach(function (t) { if (!t.exige || p.podes.indexOf(t.exige) !== -1) poe(p.telas, t.id); });
  });
  return p;
}

/* Como o modulo fica para a pessoa, depois do nivel e do ajuste: NAO · VER · EDITAR */
function modoEfetivo(permissoes, idModulo) {
  const ve = TELAS.some(function (t) { return t.modulo === idModulo && permissoes.telas.indexOf(t.id) !== -1; });
  if (!ve) return 'NAO';
  const caps = MODULOS_AJUSTAVEIS[idModulo] || [];
  return (caps.length && caps.every(function (c) { return permissoes.podes.indexOf(c) !== -1; })) ? 'EDITAR' : 'VER';
}

/**
 * Quem abre o sistema pela primeira vez cai aqui: fica registrado,
 * mas sem nenhuma tela, ate o administrador definir o nivel.
 * E a fila de espera - ninguem entra sozinho, e ninguem fica de fora.
 */
const PERFIL_PADRAO_NOVO_USUARIO = 'PENDENTE';

const ESCOPOS = ['TODOS', 'TURNO', 'PROPRIAS'];

/** Rede de seguranca: usado so se a tabela PERFIS estiver vazia. */
const PERFIL_MINIMO = { escopo: 'TODOS', telas: ['inicio'], podes: [], descricao: '' };

function carregarPerfis() {
  return comCache('perfis', function () {
    const perfis = {};
    listar('PERFIS').forEach(function (l) {
      const nome = String(l.PERFIL || '').toUpperCase().trim();
      if (!nome) return;

      const telas = [];
      const podes = [];
      Object.keys(l).forEach(function (coluna) {
        if (!marcado(l[coluna])) return;
        if (coluna.indexOf('TELA_') === 0) telas.push(coluna.substring(5).toLowerCase());
        if (coluna.indexOf('PODE_') === 0) podes.push(coluna.substring(5).toUpperCase());
      });

      const escopo = String(l.ESCOPO || 'TODOS').toUpperCase().trim();
      perfis[nome] = {
        escopo: ESCOPOS.indexOf(escopo) !== -1 ? escopo : 'TODOS',
        telas: telas,
        podes: podes,
        descricao: String(l.DESCRICAO || '').trim(),
        id: l.ID
      };
    });
    return perfis;
  });
}

function permissoesDe(perfil) {
  const perfis = carregarPerfis();
  const nome = String(perfil || '').toUpperCase().trim();
  /*
   * O ADMIN ve e pode TUDO, qualquer que seja a linha dele na tabela PERFIS
   * (4.2.2). Banco que veio de versao antiga podia ter a linha ADMIN sem as
   * colunas novas marcadas (TELA_NOBREAKS, TELA_LIMPEZA, TELA_QUADRO,
   * TELA_ESTOQUE, PODE_GERIR_FILIAIS...) e o administrador nao via os
   * paineis nem a tela de Filiais.
   */
  if (nome === 'ADMIN') {
    const base = perfis.ADMIN || PERFIL_MINIMO;
    return { escopo: 'TODOS', telas: TELAS.map(function (t) { return t.id; }),
             podes: CAPACIDADES.slice(), descricao: base.descricao || 'Administrador', id: base.id };
  }
  const p = perfis[nome] || perfis[PERFIL_PADRAO_NOVO_USUARIO] || PERFIL_MINIMO;
  /*
   * Quem ve o Calendario ve o Plano de Acao (4.2.2): o coordenador precisa
   * concluir as acoes dele, e a tela so mostra a cada um as acoes em que e
   * responsavel. Banco antigo podia ter a linha COORDENADOR sem TELA_ACOES.
   */
  if (p.telas.indexOf('calendario') !== -1 && p.telas.indexOf('acoes') === -1) {
    return { escopo: p.escopo, telas: p.telas.concat(['acoes']), podes: p.podes, descricao: p.descricao, id: p.id };
  }
  return p;
}

/* --- As perguntas que o resto do sistema faz --- */

/*
 * Abrir uma tela exige DUAS coisas: o nivel da pessoa liberar a tela e o
 * painel dela estar ligado na filial em uso (ativo — ou oculto, para o
 * administrador). O modulo Configuracao nao e painel: existe em toda filial.
 */
function podeAbrir(usuario, idTela) {
  if (usuario.permissoes.telas.indexOf(idTela) === -1) return false;
  const tela = TELAS.filter(function (t) { return t.id === idTela; })[0];
  if (!tela) return false;
  // Tela que exige capacidade (Configuracao, Pessoas, Filiais, Relatos): sem
  // ela o menu mostrava o cartao e a tela abria direto num erro.
  if (tela.exige && !podeFazer(usuario, tela.exige)) return false;
  return painelVisivel(usuario, tela.modulo);
}

function podeFazer(usuario, capacidade) {
  return usuario.permissoes.podes.indexOf(String(capacidade).toUpperCase()) !== -1;
}

/**
 * Traduz o escopo do perfil no filtro que os modulos aplicam.
 *   { tipo: 'TODOS' }
 *   { tipo: 'TURNO',    turno: 'A' }
 *   { tipo: 'PROPRIAS', email: 'fulano@...', turno: 'A' }
 */
function escopoDe(usuario) {
  const tipo = usuario.permissoes.escopo;
  if (tipo === 'PROPRIAS') {
    return { tipo: 'PROPRIAS', email: usuario.email, turno: usuario.turno || null };
  }
  if (tipo === 'TURNO') return { tipo: 'TURNO', turno: usuario.turno || null };
  return { tipo: 'TODOS' };
}

/**
 * Turno usado onde a granularidade e o turno, nao a pessoa - o BI de
 * assiduidade, por exemplo. Um coordenador de escopo PROPRIAS continua
 * vendo os numeros do proprio turno: restringir por pessoa ali nao faz
 * sentido, ele nao aparece na folha de ponto que esta analisando.
 */
function turnoDoEscopo(usuario) {
  const e = escopoDe(usuario);
  return (e.tipo === 'TODOS') ? null : (e.turno || null);
}

function telasDe(usuario) {
  return TELAS.filter(function (t) { return podeAbrir(usuario, t.id); })
              .map(function (t) { return { id: t.id, nome: t.nome, cor: t.cor, modulo: t.modulo }; });
}

/* O estado do painel vai junto para a tela marcar o que esta oculto. */

/** Modulos que a pessoa enxerga: os que tem ao menos uma tela liberada. */
function modulosDe(usuario) {
  const telas = telasDe(usuario);
  return MODULOS.filter(function (m) {
    return telas.some(function (t) { return t.modulo === m.id; });
  }).map(function (m) {
    return { id: m.id, nome: m.nome, frase: m.frase, acao: m.acao, icone: m.icone, cor: m.cor,
             oculto: m.id !== 'config' && estadoDoPainel(m.id) !== PAINEL_ATIVO,
             telas: telas.filter(function (t) { return t.modulo === m.id; }).map(function (t) { return t.id; }) };
  });
}

function exigirTela(usuario, idTela) {
  if (usuario.permissoes.telas.indexOf(idTela) === -1) {
    throw new Error('Seu perfil (' + usuario.perfil + ') nao tem acesso a tela "' + idTela + '".');
  }
  if (!podeAbrir(usuario, idTela)) {
    throw new Error('Este painel não está ligado na filial ' + filialAtual().nome + '.');
  }
}

function exigirCapacidade(usuario, capacidade) {
  if (!podeFazer(usuario, capacidade)) {
    throw new Error('Seu perfil (' + usuario.perfil + ') nao pode executar esta acao.');
  }
}

function descreverEscopo(usuario) {
  // Filtro por escopo desligado por ora — todos veem tudo.
  return 'Todos os turnos';
}
