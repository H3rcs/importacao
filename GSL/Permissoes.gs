/**
 * PERMISSOES — UMA MATRIZ, TRES FAIXAS.
 *
 * Toda regra de acesso do sistema esta neste arquivo e na tabela PERFIS.
 * Em nenhum outro lugar existe "if perfil == GERENTE".
 *
 * Para cada nivel (linha da tabela PERFIS) e cada MENU (tela de TELAS), a
 * coluna TELA_<id> guarda uma de tres faixas:
 *   OCULTO - o menu nao existe para a pessoa: sem cartao, sem item na barra,
 *            sem link direto, sem dado e sem acao;
 *   VER    - abre e le tudo o que a tela mostra (exportar inclusive); toda
 *            gravacao e recusada pelo servidor e a tela nao mostra botao de gravar;
 *   EDITAR - "Ver e editar": toda acao de gravacao daquela tela vale.
 *
 * QUEM DECIDE, NESTA ORDEM (uma funcao so: nivelNaTela):
 *   1. o painel na filial em uso (Filiais e paineis): Desativado ou "Nao usar
 *      nesta filial" some para todos; Oculto so aparece para o administrador;
 *   2. o ajuste desta pessoa naquele menu (Pessoas e acessos), se houver;
 *   3. senao, a faixa do nivel dela na matriz.
 *   A unica trava: no nivel ADMIN, "Pessoas e acessos" e sempre Ver e editar
 *   (ninguem se tranca do lado de fora).
 *
 * Toda acao do catalogo ACOES (Codigo.gs) diz de qual tela ela e (`tela`)
 * e se so le (`leitura`). executarAcao confere aqui, antes de qualquer coisa.
 * Tela nova: registre em TELAS, de `tela` as acoes dela e rode sincronizarEsquema().
 *
 * ESCOPO define o alcance de cada nivel (quanto dado, nao o que pode):
 *   TODOS    - ve a operacao inteira
 *   TURNO    - ve o que for do proprio turno
 *   PROPRIAS - ve so o que e dele: atividade onde e responsavel ou que criou
 *
 * As colunas PODE_<capacidade> do modelo antigo continuam na planilha,
 * intactas e ignoradas: servem so para converter um banco antigo (ver
 * nivelAntigo_).
 */

/*
 * MODULOS — a porta de entrada.
 *
 * O sistema abre num menu de modulos, nao numa tela solta. Cada modulo
 * junta as telas que pertencem ao mesmo assunto; a barra lateral so mostra
 * as telas do modulo em que a pessoa entrou. Um modulo sem nenhuma tela
 * liberada simplesmente nao aparece.
 */
const BUILD_PERMISSOES = '2026.10.19';   // carimbo da entrega — ver APP.build no Codigo.gs

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
  { id: 'config',      nome: 'Configuração', cor: 'branco',  modulo: 'config',      funcao: 'dadosConfig' },
  { id: 'acessos',     nome: 'Pessoas e acessos', cor: 'branco', modulo: 'config',  funcao: 'dadosPessoas' },
  { id: 'filiais',     nome: 'Filiais e painéis', cor: 'branco', modulo: 'config',  funcao: 'dadosFiliais' },
  { id: 'relatos',     nome: 'Relatos de erro', cor: 'branco', modulo: 'config',   funcao: 'dadosRelatos' }
];

/* As tres faixas e como a tela as chama. */
const NIVEL_OCULTO = 'OCULTO', NIVEL_VER = 'VER', NIVEL_EDITAR = 'EDITAR';
const NIVEIS_TELA = [NIVEL_OCULTO, NIVEL_VER, NIVEL_EDITAR];
const NOMES_NIVEL = { OCULTO: 'Oculto', VER: 'Ver', EDITAR: 'Ver e editar' };
const PESO_NIVEL = { OCULTO: 0, VER: 1, EDITAR: 2 };

/*
 * A TRAVA DO ADMIN: no nivel ADMIN, Pessoas e acessos e sempre Ver e editar.
 * Tudo o mais que o administrador marcar para o nivel ADMIN e obedecido.
 */
const TELA_TRAVADA_ADMIN = 'acessos';
const MOTIVO_TRAVA_ADMIN = 'No nível ADMIN, Pessoas e acessos é sempre “Ver e editar” — assim ninguém se tranca do lado de fora.';

/*
 * MODELO ANTIGO — so para converter banco antigo (8.11 e anteriores).
 * Cada tela era SIM/NAO e o que se podia fazer vinha das capacidades
 * (PODE_<capacidade>). Na conversao: tela liberada + uma capacidade que
 * grava nela = EDITAR; liberada sem nenhuma = VER; nao liberada = OCULTO.
 * Tela que nao tem gravacao nenhuma (Central, Apresentacao): EDITAR para o
 * nivel que tinha alguma capacidade, VER para o que nao tinha nenhuma.
 * O Plano de Acao conta ENTREGAR: e o coordenador que conclui as acoes dele.
 */
const CAPACIDADES = ['VER_INDIVIDUAL', 'ENTREGAR', 'VALIDAR', 'PROGRAMAR',
                     'EDITAR', 'EXCLUIR', 'ANEXAR', 'GERIR_ACESSOS',
                     'GERIR_ACOES', 'LANCAR_NOBREAK', 'GERIR_LIMPEZA',
                     'GERIR_FILIAIS', 'GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE'];
const ESCRITA_ANTIGA = {
  inicio: [], apresentacao: [],
  calendario: ['ENTREGAR', 'ANEXAR', 'VALIDAR', 'PROGRAMAR', 'EDITAR'],
  acoes: ['GERIR_ACOES', 'ENTREGAR'],
  assiduidade: ['PROGRAMAR'],
  nobreaks: ['LANCAR_NOBREAK'],
  limpeza: ['GERIR_LIMPEZA'],
  quadro: ['PROGRAMAR'],
  estoque: ['GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE'],
  aprendiz: ['PROGRAMAR'],
  config: ['PROGRAMAR'],
  acessos: ['GERIR_ACESSOS'],
  filiais: ['GERIR_FILIAIS'],
  relatos: ['GERIR_ACESSOS']
};
/* Telas que, no modelo antigo, so abriam com uma capacidade (o antigo `exige`). */
const EXIGIA_ANTIGA = { config: 'PROGRAMAR', acessos: 'GERIR_ACESSOS', filiais: 'GERIR_FILIAIS', relatos: 'GERIR_ACESSOS' };
/* Ajuste por modulo do modelo antigo (ACESSOS.MODULOS): as capacidades que "editar" ligava. */
const MODULOS_ANTIGOS = {
  calendario: [], assiduidade: [], apresentacao: [], quadro: [], aprendiz: [],
  nobreaks: ['LANCAR_NOBREAK'], limpeza: ['GERIR_LIMPEZA'], estoque: ['GERIR_ESTOQUE', 'MOVIMENTAR_ESTOQUE']
};

/**
 * Quem abre o sistema pela primeira vez cai aqui: fica registrado,
 * mas sem nenhuma tela, ate o administrador definir o nivel.
 * E a fila de espera - ninguem entra sozinho, e ninguem fica de fora.
 */
const PERFIL_PADRAO_NOVO_USUARIO = 'PENDENTE';

const ESCOPOS = ['TODOS', 'TURNO', 'PROPRIAS'];

/** Rede de seguranca: usado so se a tabela PERFIS estiver vazia. */
const PERFIL_MINIMO = { escopo: 'TODOS', niveis: { inicio: NIVEL_VER }, descricao: '' };

function telaPorId_(id) {
  return TELAS.filter(function (t) { return t.id === id; })[0] || null;
}

/* O texto de uma celula da matriz como faixa ('' = nao e faixa: SIM/NAO do modelo antigo, vazio...). */
function faixaDoTexto_(valor) {
  const t = String(valor == null ? '' : valor).toUpperCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  if (t === 'EDITAR' || t === 'VER E EDITAR') return NIVEL_EDITAR;
  if (t === 'VER') return NIVEL_VER;
  if (t === 'OCULTO') return NIVEL_OCULTO;
  return '';
}

/*
 * CONVERSAO DO MODELO ANTIGO, para UMA tela de UMA linha da tabela PERFIS
 * (TELA_<id> SIM/NAO + as colunas PODE_). Usada pela migracao (que grava o
 * resultado) e na leitura, para qualquer celula que ainda nao seja faixa —
 * um banco antigo funciona igual antes e depois de migrar.
 *   - ADMIN: EDITAR em tudo (no modelo antigo ele via e podia tudo);
 *   - quem via o Calendario via o Plano de Acao (regra antiga de 4.2.2).
 */
function nivelAntigo_(idTela, linha) {
  const perfil = String(linha.PERFIL || '').toUpperCase().trim();
  if (perfil === 'ADMIN') return NIVEL_EDITAR;
  const sim = function (coluna) { return marcado(linha[coluna]); };
  const podes = CAPACIDADES.filter(function (c) { return sim('PODE_' + c); });
  let liberada = sim('TELA_' + idTela.toUpperCase());
  if (idTela === 'acoes' && sim('TELA_CALENDARIO')) liberada = true;
  if (EXIGIA_ANTIGA[idTela] && podes.indexOf(EXIGIA_ANTIGA[idTela]) === -1) liberada = false;
  if (!liberada) return NIVEL_OCULTO;
  const escreve = ESCRITA_ANTIGA[idTela] || [];
  if (!escreve.length) return podes.length ? NIVEL_EDITAR : NIVEL_VER;
  return escreve.some(function (c) { return podes.indexOf(c) !== -1; }) ? NIVEL_EDITAR : NIVEL_VER;
}

/* A faixa de cada tela numa linha da tabela PERFIS (celula antiga convertida na hora). */
function niveisDaLinha_(linha) {
  const niveis = {};
  TELAS.forEach(function (t) {
    niveis[t.id] = faixaDoTexto_(linha['TELA_' + t.id.toUpperCase()]) || nivelAntigo_(t.id, linha);
  });
  return niveis;
}

/* true se alguma celula de tela da linha ainda nao e faixa (a migracao regrava a linha). */
function linhaNoModeloAntigo_(linha) {
  return TELAS.some(function (t) { return !faixaDoTexto_(linha['TELA_' + t.id.toUpperCase()]); });
}

function carregarPerfis() {
  return comCache('perfis', function () {
    const perfis = {};
    listar('PERFIS').forEach(function (l) {
      const nome = String(l.PERFIL || '').toUpperCase().trim();
      if (!nome) return;
      const escopo = String(l.ESCOPO || 'TODOS').toUpperCase().trim();
      perfis[nome] = {
        escopo: ESCOPOS.indexOf(escopo) !== -1 ? escopo : 'TODOS',
        niveis: niveisDaLinha_(l),
        descricao: String(l.DESCRICAO || '').trim(),
        id: l.ID
      };
    });
    return perfis;
  });
}

/*
 * As permissoes de um NIVEL: a linha dele na matriz, com a trava do ADMIN.
 * Nao existe mais "o ADMIN ve tudo": o que estiver na linha ADMIN vale para ele.
 */
function permissoesDe(perfil) {
  const perfis = carregarPerfis();
  const nome = String(perfil || '').toUpperCase().trim();
  const base = perfis[nome] || perfis[PERFIL_PADRAO_NOVO_USUARIO] || PERFIL_MINIMO;
  const niveis = {};
  TELAS.forEach(function (t) { niveis[t.id] = (base.niveis || {})[t.id] || NIVEL_OCULTO; });
  if (nome === 'ADMIN') niveis[TELA_TRAVADA_ADMIN] = NIVEL_EDITAR;
  return { escopo: base.escopo || 'TODOS', niveis: niveis,
           descricao: base.descricao || (nome === 'ADMIN' ? 'Administrador' : ''), id: base.id };
}

/*
 * AJUSTE DESTA PESSOA (ACESSOS.AJUSTES): {"estoque":"VER","limpeza":"OCULTO"}
 * por tela, nas mesmas tres faixas. Tela fora do JSON = igual ao nivel.
 * Coluna AJUSTES vazia (cadastro de antes de 8.12) = o ajuste antigo por
 * modulo (ACESSOS.MODULOS) convertido; "{}" = nenhum ajuste.
 */
function lerAjustesPessoa(textoAjustes, textoModulosAntigo, perfil) {
  const bruto = String(textoAjustes == null ? '' : textoAjustes).trim();
  if (!bruto) return ajustesDoModeloAntigo_(textoModulosAntigo, perfil);
  let obj = {};
  try { obj = JSON.parse(bruto) || {}; } catch (e) { obj = {}; }
  const saida = {};
  Object.keys(obj).forEach(function (id) {
    const faixa = faixaDoTexto_(obj[id]);
    if (telaPorId_(id) && faixa) saida[id] = faixa;
  });
  return saida;
}

/* O texto gravado em ACESSOS.AJUSTES (sempre um JSON: "{}" quer dizer "nenhum ajuste"). */
function textoDosAjustes(ajustes) {
  const limpo = {};
  TELAS.forEach(function (t) {
    const f = faixaDoTexto_((ajustes || {})[t.id]);
    if (f) limpo[t.id] = f;
  });
  return JSON.stringify(limpo);
}

/*
 * O ajuste antigo por MODULO (NAO/VER/EDITAR) vira ajuste por TELA, em cada
 * tela do modulo: NAO -> Oculto, EDITAR -> Ver e editar, VER -> Ver. Nos
 * modulos em que o modelo antigo nao tinha o que "editar" (Calendario,
 * Assiduidade, Apresentacao, Quadro, Jovem Aprendiz), VER so ligava o modulo
 * e o que a pessoa podia fazer vinha do nivel: ali cada tela fica com o que
 * o nivel antigo dava a ela com a tela liberada (com a capacidade que grava
 * = Ver e editar; sem = Ver). No modelo antigo o ajuste nao valia para o ADMIN.
 */
function ajustesDoModeloAntigo_(textoModulos, perfil) {
  let obj = {};
  try { obj = JSON.parse(String(textoModulos || '{}')) || {}; } catch (e) { obj = {}; }
  const saida = {};
  const nome = String(perfil || '').toUpperCase().trim();
  if (nome === 'ADMIN' || !obj || typeof obj !== 'object') return saida;
  let linhaNivel;
  Object.keys(obj).forEach(function (m) {
    const modo = String(obj[m] || '').toUpperCase().trim();
    if (!MODULOS_ANTIGOS[m] || ['NAO', 'VER', 'EDITAR'].indexOf(modo) === -1) return;
    TELAS.filter(function (t) { return t.modulo === m; }).forEach(function (t) {
      if (modo === 'NAO') { saida[t.id] = NIVEL_OCULTO; return; }
      if (MODULOS_ANTIGOS[m].length) { saida[t.id] = modo === 'EDITAR' ? NIVEL_EDITAR : NIVEL_VER; return; }
      if (linhaNivel === undefined) linhaNivel = linhaCruaDoNivel_(nome);
      const linha = Object.assign({}, linhaNivel || { PERFIL: nome });
      linha['TELA_' + t.id.toUpperCase()] = 'SIM';
      saida[t.id] = nivelAntigo_(t.id, linha) === NIVEL_EDITAR ? NIVEL_EDITAR : NIVEL_VER;
    });
  });
  return saida;
}

/* A linha crua do nivel na tabela PERFIS (com as colunas PODE_ antigas), ou null. */
function linhaCruaDoNivel_(perfil) {
  return listar('PERFIS').filter(function (l) { return String(l.PERFIL || '').toUpperCase().trim() === perfil; })[0] || null;
}

/*
 * As permissoes de UMA PESSOA: o nivel, o ajuste dela por cima, e a trava do
 * ADMIN por ultimo. E o que fica em usuario.permissoes; o painel da filial
 * entra na hora da pergunta (nivelNaTela), porque depende da filial em uso.
 */
function permissoesDaPessoa(perfil, ajustes) {
  const nivel = permissoesDe(perfil);
  const niveis = {};
  TELAS.forEach(function (t) {
    niveis[t.id] = (ajustes && ajustes[t.id]) || nivel.niveis[t.id] || NIVEL_OCULTO;
  });
  if (String(perfil || '').toUpperCase().trim() === 'ADMIN') niveis[TELA_TRAVADA_ADMIN] = NIVEL_EDITAR;
  return comCamposAntigos_({ escopo: nivel.escopo, niveis: niveis, descricao: nivel.descricao, id: nivel.id });
}

/* --- As perguntas que o resto do sistema faz --- */

/*
 * A FAIXA EFETIVA de uma pessoa numa tela, na filial em uso. E A FUNCAO que
 * decide: menu, abrir tela, gravar, bolinha, atalhos, links de e-mail e a
 * reserva por POST passam todos por aqui.
 *   1. painel da filial (Desativado / fora da filial: ninguem; Oculto: so o administrador);
 *   2. ajuste da pessoa, senao o nivel (ja juntos em usuario.permissoes);
 *   3. trava do ADMIN (ja aplicada em usuario.permissoes).
 */
function nivelNaTela(usuario, idTela) {
  const tela = telaPorId_(idTela);
  if (!tela || !usuario || !usuario.permissoes) return NIVEL_OCULTO;
  const nivel = nivelNaMatriz(usuario, idTela);
  if (nivel === NIVEL_OCULTO) return NIVEL_OCULTO;
  if (!painelVisivel(usuario, tela.modulo)) return NIVEL_OCULTO;
  return nivel;
}

/* A faixa da pessoa na matriz (nivel + ajuste + trava), sem olhar o painel da filial. */
function nivelNaMatriz(usuario, idTela) {
  const n = usuario && usuario.permissoes && usuario.permissoes.niveis && usuario.permissoes.niveis[idTela];
  return PESO_NIVEL[n] !== undefined ? n : NIVEL_OCULTO;
}

function podeVer(usuario, idTela) { return nivelNaTela(usuario, idTela) !== NIVEL_OCULTO; }
function podeEditar(usuario, idTela) { return nivelNaTela(usuario, idTela) === NIVEL_EDITAR; }

/* Abrir/ler uma tela. A frase diz a causa, na ordem em que se decide: o painel da filial, depois a matriz (nivel/ajuste). */
function exigirVer(usuario, idTela) {
  if (podeVer(usuario, idTela)) return;
  const tela = telaPorId_(idTela);
  if (tela && !painelVisivel(usuario, tela.modulo)) {
    throw new Error('Este painel não está ligado na filial ' + filialAtual().nome + '.');
  }
  throw new Error('Seu acesso (' + usuario.perfil + ') não inclui a tela "' + (tela ? tela.nome : idTela) + '".');
}

/* Gravar numa tela: so com Ver e editar. */
function exigirEditar(usuario, idTela) {
  exigirVer(usuario, idTela);
  if (!podeEditar(usuario, idTela)) {
    throw new Error('Seu acesso a "' + telaPorId_(idTela).nome + '" é só para ver: gravar precisa de “Ver e editar”.');
  }
}

/*
 * A PORTA DAS ACOES (executarAcao). `tela` e uma tela ou uma lista (basta
 * uma delas); `leitura: true` pede so Ver; o resto pede Ver e editar.
 * `livre: true` e acao da propria pessoa, fora de qualquer menu (relatar
 * erro, trocar o proprio PIN, a bolinha do menu, atualizar a copia dos dados).
 * Acao sem tela e sem livre nao passa: e erro de cadastro, nao brecha.
 */
function exigirAcao_(usuario, nome, acao) {
  if (acao.livre === true && !acao.tela) return;
  const telas = [].concat(acao.tela || []).filter(function (t) { return !!telaPorId_(t); });
  if (!telas.length) throw new Error('A ação "' + nome + '" não diz de qual tela é. Avise o administrador do sistema.');
  const precisa = acao.leitura === true ? NIVEL_VER : NIVEL_EDITAR;
  if (telas.some(function (t) { return PESO_NIVEL[nivelNaTela(usuario, t)] >= PESO_NIVEL[precisa]; })) return;
  // A recusa explica pela primeira tela que a pessoa enxerga (ou pela primeira da lista).
  const alvo = telas.filter(function (t) { return podeVer(usuario, t); })[0] || telas[0];
  if (precisa === NIVEL_VER) exigirVer(usuario, alvo);
  exigirEditar(usuario, alvo);
  throw new Error('Seu acesso não permite esta ação.');    // nao chega aqui; fica de rede
}

/*
 * COMPATIBILIDADE (implantacao pela metade) — calcos finos, todos tirados
 * da matriz. Um arquivo .gs da entrega anterior, colado junto com este,
 * ainda pergunta por capacidade (podeFazer), por modulo (modoEfetivo) ou
 * le permissoes.telas/podes: a resposta vem das tres faixas. Pode = a
 * pessoa tem Ver e editar numa tela onde aquela capacidade gravava.
 * Nenhum arquivo desta versao usa isto (testes/perfis.js confere); a
 * faixa "Atualizacao incompleta" pede o arquivo que falta.
 */
function comCamposAntigos_(p) {
  p.telas = TELAS.filter(function (t) { return p.niveis[t.id] && p.niveis[t.id] !== NIVEL_OCULTO; })
    .map(function (t) { return t.id; });
  p.podes = CAPACIDADES.filter(function (c) {
    if (c === 'VER_INDIVIDUAL') return p.telas.indexOf('assiduidade') !== -1;
    return Object.keys(ESCRITA_ANTIGA).some(function (t) {
      return (ESCRITA_ANTIGA[t].indexOf(c) !== -1 || EXIGIA_ANTIGA[t] === c) && p.niveis[t] === NIVEL_EDITAR;
    });
  });
  return p;
}
function podeFazer(usuario, capacidade) {
  const cap = String(capacidade || '').toUpperCase();
  if (cap === 'VER_INDIVIDUAL') return podeVer(usuario, 'assiduidade');
  return Object.keys(ESCRITA_ANTIGA).some(function (t) {
    return (ESCRITA_ANTIGA[t].indexOf(cap) !== -1 || EXIGIA_ANTIGA[t] === cap) && podeEditar(usuario, t);
  });
}
function exigirCapacidade(usuario, capacidade) {
  if (!podeFazer(usuario, capacidade)) throw new Error('Seu acesso (' + usuario.perfil + ') não permite esta ação.');
}
function exigirTela(usuario, idTela) { exigirVer(usuario, idTela); }
const MODULOS_AJUSTAVEIS = MODULOS_ANTIGOS;
function modoEfetivo(permissoes, idModulo) {
  const niveis = TELAS.filter(function (t) { return t.modulo === idModulo; })
    .map(function (t) { return (permissoes && permissoes.niveis && permissoes.niveis[t.id]) || NIVEL_OCULTO; });
  if (niveis.indexOf(NIVEL_EDITAR) !== -1) return 'EDITAR';
  return niveis.indexOf(NIVEL_VER) !== -1 ? 'VER' : 'NAO';
}
function lerModulosPessoa(texto) {
  let obj = {};
  try { obj = (typeof texto === 'object' && texto) ? texto : (JSON.parse(String(texto || '{}')) || {}); } catch (e) { obj = {}; }
  const saida = {};
  Object.keys(obj).forEach(function (m) {
    const modo = String(obj[m] || '').toUpperCase().trim();
    if (MODULOS_ANTIGOS[m] && ['NAO', 'VER', 'EDITAR'].indexOf(modo) !== -1) saida[m] = modo;
  });
  return saida;
}
function aplicarModulosDaPessoa(base, ajustesModulo) {
  const niveis = Object.assign({}, (base && base.niveis) || {});
  const de = { NAO: NIVEL_OCULTO, VER: NIVEL_VER, EDITAR: NIVEL_EDITAR };
  Object.keys(lerModulosPessoa(ajustesModulo || {})).forEach(function (m) {
    TELAS.forEach(function (t) { if (t.modulo === m) niveis[t.id] = de[String(ajustesModulo[m]).toUpperCase()]; });
  });
  return comCamposAntigos_({ escopo: (base && base.escopo) || 'TODOS', niveis: niveis,
                             descricao: base && base.descricao, id: base && base.id });
}
function exigirModuloDaAcao_(usuario, acao) {
  const lista = [].concat((acao && acao.modulo) || []);
  if (!lista.length) return;
  if (lista.some(function (m) { return TELAS.some(function (t) { return t.modulo === m && podeVer(usuario, t.id); }); })) return;
  const t = TELAS.filter(function (x) { return x.modulo === lista[0]; })[0];
  exigirVer(usuario, t ? t.id : lista[0]);
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

/* O menu: as telas que nao estao Ocultas para a pessoa nesta filial, com a faixa de cada uma. */
function telasDe(usuario) {
  return TELAS.map(function (t) { return { t: t, nivel: nivelNaTela(usuario, t.id) }; })
    .filter(function (x) { return x.nivel !== NIVEL_OCULTO; })
    .map(function (x) { return { id: x.t.id, nome: x.t.nome, cor: x.t.cor, modulo: x.t.modulo, nivel: x.nivel }; });
}

/** Modulos que a pessoa enxerga: os que tem ao menos uma tela em Ver ou Ver e editar. */
function modulosDe(usuario) {
  const telas = telasDe(usuario);
  return MODULOS.filter(function (m) {
    return telas.some(function (t) { return t.modulo === m.id; });
  }).map(function (m) {
    // O estado do painel vai junto para a tela marcar o que esta oculto (so o administrador o recebe).
    return { id: m.id, nome: m.nome, frase: m.frase, acao: m.acao, icone: m.icone, cor: m.cor,
             oculto: m.id !== 'config' && estadoDoPainel(m.id) === PAINEL_OCULTO,
             telas: telas.filter(function (t) { return t.modulo === m.id; }).map(function (t) { return t.id; }) };
  });
}

/* O retrato do menu que vai com cada tela: "id:FAIXA,..." (a tela compara com o menu que tem). */
function marcaDoMenu(usuario) {
  return telasDe(usuario).map(function (t) { return t.id + ':' + t.nivel; }).join(',');
}

/* Para a chave dos caches (tela e bolinha): o escopo e a faixa de cada tela — tudo o que muda o que a pessoa ve ou pode. */
function marcaDasPermissoes(usuario) {
  const p = (usuario && usuario.permissoes) || {};
  return (p.escopo || '') + ':' + TELAS.map(function (t) {
    return String((p.niveis || {})[t.id] || '-').charAt(0);
  }).join('');
}

function descreverEscopo(usuario) {
  // Filtro por escopo desligado por ora — todos veem tudo.
  return 'Todos os turnos';
}
