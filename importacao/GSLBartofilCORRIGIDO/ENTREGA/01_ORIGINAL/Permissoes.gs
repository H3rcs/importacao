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
const MODULOS = [
  { id: 'calendario',   nome: 'Calendario',
    frase: 'Atividades do mes, entregas, validacoes e o andamento por turno.',
    acao: 'Abrir calendario', icone: 'calendario', cor: 'azul' },
  { id: 'assiduidade',  nome: 'Assiduidade',
    frase: 'Faltas, atestados e o ranking dos colaboradores do CD.',
    acao: 'Ver assiduidade', icone: 'pessoas', cor: 'verde' },
  { id: 'apresentacao', nome: 'Apresentacao',
    frase: 'Modo reuniao: os numeros da semana em tela cheia.',
    acao: 'Apresentar', icone: 'tela', cor: 'ambar' },
  { id: 'config',       nome: 'Configuracao',
    frase: 'Pessoas, setores, rotinas, parametros e acessos ao sistema.',
    acao: 'Configurar', icone: 'engrenagem', cor: 'roxo' }
];

const TELAS = [
  { id: 'inicio',      nome: 'Central',      cor: 'azul',    modulo: 'calendario',  funcao: 'dadosInicio' },
  { id: 'calendario',  nome: 'Calendario',   cor: 'verde',   modulo: 'calendario',  funcao: 'dadosCalendario' },
  { id: 'assiduidade', nome: 'Assiduidade',  cor: 'amarelo', modulo: 'assiduidade', funcao: 'dadosAssiduidade' },
  { id: 'ranking',     nome: 'Ranking',      cor: 'verde',   modulo: 'assiduidade', funcao: 'dadosRanking' },
  { id: 'apresentacao', nome: 'Apresentacao', cor: 'amarelo', modulo: 'apresentacao', funcao: 'dadosApresentacao' },
  { id: 'config',      nome: 'Configuracao', cor: 'branco',  modulo: 'config',      funcao: 'dadosConfig' },
  { id: 'acessos',     nome: 'Acessos',      cor: 'branco',  modulo: 'config',      funcao: 'dadosAcessos' }
];

/*
 * ENTREGAR  - anexa a propria entrega (coordenador)
 * VALIDAR   - aprova, reprova ou cancela (gerente)
 * PROGRAMAR - gera mes, remarca, define setor, agenda treinamento, mexe na config
 */
const CAPACIDADES = ['VER_INDIVIDUAL', 'ENTREGAR', 'VALIDAR', 'PROGRAMAR',
                     'EDITAR', 'EXCLUIR', 'ANEXAR', 'GERIR_ACESSOS'];

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
  return perfis[String(perfil || '').toUpperCase().trim()] ||
         perfis[PERFIL_PADRAO_NOVO_USUARIO] ||
         PERFIL_MINIMO;
}

/* --- As perguntas que o resto do sistema faz --- */

function podeAbrir(usuario, idTela) {
  return usuario.permissoes.telas.indexOf(idTela) !== -1;
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

/** Modulos que a pessoa enxerga: os que tem ao menos uma tela liberada. */
function modulosDe(usuario) {
  const telas = telasDe(usuario);
  return MODULOS.filter(function (m) {
    return telas.some(function (t) { return t.modulo === m.id; });
  }).map(function (m) {
    return { id: m.id, nome: m.nome, frase: m.frase, acao: m.acao, icone: m.icone, cor: m.cor,
             telas: telas.filter(function (t) { return t.modulo === m.id; }).map(function (t) { return t.id; }) };
  });
}

function exigirTela(usuario, idTela) {
  if (!podeAbrir(usuario, idTela)) {
    throw new Error('Seu perfil (' + usuario.perfil + ') nao tem acesso a tela "' + idTela + '".');
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
