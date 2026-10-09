/**
 * FILIAIS
 *
 * O GSL nasceu para o CD de Feira de Santana e agora serve mais de uma
 * filial. Cada filial tem:
 *   - o PROPRIO banco (uma planilha so dela, com as mesmas tabelas);
 *   - a PROPRIA lista de paineis, cada um Ativo, Oculto ou Desativado.
 *
 * O banco mestre (a planilha GSL_BANCO original) guarda o que e comum a
 * todas: quem entra (ACESSOS e PERFIS), o cadastro de FILIAIS e o LOG.
 * Os dados de Feira continuam nele, exatamente onde sempre estiveram —
 * Feira e a filial PRINCIPAL e nada nela mudou de lugar.
 *
 * Em cada requisicao o cliente informa em qual filial a pessoa esta; o
 * servidor confere se ela pode estar ali (definirFilial) e, dai em
 * diante, toda leitura e gravacao cai no banco daquela filial.
 */

/* Os paineis que podem ir para uma filial. Configuracao nao entra: ela
   existe em toda filial, para quem tem permissao. */
const PAINEIS = [
  { id: 'calendario',   nome: 'Calendário',        frase: 'Atividades do mês, entregas e plano de ação.' },
  { id: 'assiduidade',  nome: 'Assiduidade',       frase: 'Faltas, atestados e desempenho a partir da folha do RH.' },
  { id: 'apresentacao', nome: 'Apresentação',      frase: 'Modo reunião, com os números da semana.' },
  { id: 'nobreaks',     nome: 'Nobreaks',          frase: 'Leituras de entrada e saída de cada nobreak.' },
  { id: 'limpeza',      nome: 'Limpeza CD',        frase: 'Ações das vistorias e custo dos produtos.' },
  { id: 'quadro',       nome: 'Quadro do CD',      frase: 'Efetivo por função e turno, admissões e desligamentos.' },
  { id: 'estoque',      nome: 'Estoque de TI',     frase: 'Itens de informática: entradas, saídas, saldo e inventário.' },
  { id: 'aprendiz',     nome: 'Jovem Aprendiz',    frase: 'Avaliações da imersão corporativa e cronograma de rotação.' }
];

const PAINEL_ATIVO = 'ATIVO';
const PAINEL_OCULTO = 'OCULTO';           // so o administrador ve — para montar e testar
const PAINEL_DESATIVADO = 'DESATIVADO';   // ninguem ve; os dados continuam guardados
const ESTADOS_PAINEL = [PAINEL_ATIVO, PAINEL_OCULTO, PAINEL_DESATIVADO];

/*
 * Tabelas que vivem SEMPRE no banco mestre, qualquer que seja a filial.
 * Todo o resto e dado da filial.
 */
const BUILD_FILIAIS = '2026.10.09c';   // carimbo da entrega — ver APP.build no Codigo.gs
const TABELAS_GLOBAIS = { ACESSOS: 1, PERFIS: 1, FILIAIS: 1, LOG: 1, SESSOES: 1, EQUIPE: 1, FEEDBACK: 1 };

/* Chaves de cache que nao dependem da filial. */
const CHAVES_CACHE_GLOBAIS = { perfis: 1, acessos: 1, filiais: 1 };

/* Filial principal quando o cadastro ainda nao existe (primeira abertura
   depois da atualizacao). A migracao grava esta mesma linha na tabela. */
const FILIAL_PADRAO = { codigo: 'FSA', nome: 'CD Feira de Santana', cidade: 'Feira de Santana - BA' };

var _filialDaVez = '';     // codigo da filial desta requisicao ('' = principal)
var _filialFixada = false; // true quando a requisicao veio de uma pessoa, dentro de uma filial
var _filiaisMemo = null;   // cadastro lido nesta execucao

/* ------------------------------------------------------------------ */
/* LEITURA DO CADASTRO                                                 */
/* ------------------------------------------------------------------ */

function listarFiliais() {
  if (_filiaisMemo) return _filiaisMemo;
  let linhas = [];
  try {
    linhas = comCache('filiais', function () {
      return listar('FILIAIS').map(function (l) {
        return {
          id: l.ID,
          codigo: String(l.CODIGO || '').toUpperCase().trim(),
          nome: String(l.NOME || '').trim(),
          cidade: String(l.CIDADE || '').trim(),
          bancoId: String(l.BANCO_ID || '').trim(),
          principal: marcado(l.PRINCIPAL),
          ativa: String(l.ATIVA || 'SIM').trim() === '' ? true : marcado(l.ATIVA),
          paineis: lerPaineis_(l.PAINEIS),
          ordem: Number(l.ORDEM || 0)
        };
      }).filter(function (f) { return f.codigo; });
    });
  } catch (e) {
    // Banco de versao antiga, ainda sem a tabela FILIAIS: a migracao cria.
    linhas = [];
  }

  if (!linhas.length) {
    linhas = [{
      id: '', codigo: FILIAL_PADRAO.codigo, nome: FILIAL_PADRAO.nome, cidade: FILIAL_PADRAO.cidade,
      bancoId: prop('ID_BANCO', ''), principal: true, ativa: true,
      paineis: paineisPadraoPrincipal_(), ordem: 0, virtual: true
    }];
  }
  if (!linhas.some(function (f) { return f.principal; })) linhas[0].principal = true;

  linhas.sort(function (a, b) {
    if (a.principal !== b.principal) return a.principal ? -1 : 1;
    return (a.ordem - b.ordem) || a.nome.localeCompare(b.nome);
  });
  _filiaisMemo = linhas;
  return linhas;
}

function esquecerFiliais() { _filiaisMemo = null; }

function lerPaineis_(bruto) {
  const saida = {};
  let obj = {};
  try { obj = JSON.parse(String(bruto || '{}')) || {}; } catch (e) { obj = {}; }
  Object.keys(obj).forEach(function (k) {
    const estado = String(obj[k] || '').toUpperCase().trim();
    if (ESTADOS_PAINEL.indexOf(estado) !== -1) saida[String(k).toLowerCase()] = estado;
  });
  return saida;
}

/* Feira tem todos os paineis; os que ja existiam ligados, os novos tambem. */
function paineisPadraoPrincipal_() {
  const p = {};
  PAINEIS.forEach(function (x) { p[x.id] = PAINEL_ATIVO; });
  return p;
}

function filialPrincipal() {
  const lista = listarFiliais();
  return lista.filter(function (f) { return f.principal; })[0] || lista[0];
}

function filialPorCodigo(codigo) {
  const c = String(codigo || '').toUpperCase().trim();
  return listarFiliais().filter(function (f) { return f.codigo === c; })[0] || null;
}

/** A filial desta requisicao. Sem escolha explicita, a principal. */
function filialAtual() {
  if (_filialDaVez) {
    const f = filialPorCodigo(_filialDaVez);
    if (f) return f;
  }
  return filialPrincipal();
}

function ehFilialPrincipal() {
  const f = filialAtual();
  return !f || f.principal;
}

/* ------------------------------------------------------------------ */
/* ESCOLHA DA FILIAL NA REQUISICAO                                     */
/* ------------------------------------------------------------------ */

/**
 * Troca a filial em uso. Tudo que foi lido na memoria desta execucao cai,
 * porque as tabelas de dados agora vem de outro banco.
 */
function definirFilial(codigo) {
  const c = String(codigo || '').toUpperCase().trim();
  if (c === _filialDaVez) return;
  _filialDaVez = c;
  esquecerLeituras();
}

/**
 * A filial pedida pelo cliente, conferida contra o que a pessoa pode ver.
 * Sem codigo, fica a primeira filial liberada para ela.
 */
function entrarNaFilial(usuario, codigo) {
  const liberadas = filiaisDoUsuario(usuario);
  if (!liberadas.length) {
    throw new Error('Seu cadastro não está ligado a nenhuma filial ativa. Fale com o administrador.');
  }
  const c = String(codigo || '').toUpperCase().trim();
  const alvo = c ? liberadas.filter(function (f) { return f.codigo === c; })[0] : liberadas[0];
  if (!alvo) throw new Error('Você não tem acesso à filial ' + c + '.');
  definirFilial(alvo.principal ? '' : alvo.codigo);
  _filialFixada = true;
  return alvo;
}

/* ------------------------------------------------------------------ */
/* QUEM PODE O QUE, POR FILIAL                                         */
/* ------------------------------------------------------------------ */

/** true para quem administra o sistema (ve painel oculto, gere filiais). */
function ehAdministrador(usuario) {
  if (!usuario) return false;
  if (String(usuario.perfil || '').toUpperCase() === 'ADMIN') return true;
  return usuario.permissoes && usuario.permissoes.podes.indexOf('GERIR_FILIAIS') !== -1;
}

/*
 * Coluna FILIAIS da pessoa em ACESSOS:
 *   vazio  -> so a filial principal (todo cadastro antigo cai aqui)
 *   *      -> todas
 *   FSA,SSA -> as listadas
 * O administrador entra em todas, sempre.
 */
function codigosDaPessoa_(texto) {
  const t = String(texto || '').toUpperCase().replace(/\s+/g, '');
  if (!t) return null;                       // principal
  if (t === '*' || t === 'TODAS') return ['*'];
  if (t === 'NENHUMA') return [];            // tirada da ultima filial em "Quem entra"
  return t.split(/[,;]/).filter(Boolean);
}

function filiaisDoUsuario(usuario) {
  const ativas = listarFiliais().filter(function (f) { return f.ativa; });
  if (ehAdministrador(usuario)) return ativas;
  const codigos = codigosDaPessoa_(usuario.filiais);
  if (!codigos) return ativas.filter(function (f) { return f.principal; });
  if (codigos[0] === '*') return ativas;
  return ativas.filter(function (f) { return codigos.indexOf(f.codigo) !== -1; });
}

function pessoaNaFilial_(registroAcesso, filial) {
  const perfil = String(registroAcesso.PERFIL || '').toUpperCase().trim();
  if (perfil === 'ADMIN') return true;
  const codigos = codigosDaPessoa_(registroAcesso.FILIAIS);
  if (!codigos) return !!filial.principal;
  if (codigos[0] === '*') return true;
  return codigos.indexOf(filial.codigo) !== -1;
}

/**
 * As pessoas da filial em uso. Substitui o listar('ACESSOS') cru nos
 * modulos: sem isto, o coordenador do turno A de Feira receberia o
 * digesto do turno A de outra filial.
 */
function pessoasDaFilial() {
  const f = filialAtual();
  return listar('ACESSOS').filter(function (p) { return pessoaNaFilial_(p, f); });
}

/** Estado de um painel na filial em uso: ATIVO, OCULTO, DESATIVADO ou '' (nao foi para ela). */
function estadoDoPainel(idPainel) {
  if (!idPainel || idPainel === 'config') return PAINEL_ATIVO;
  const f = filialAtual();
  return (f && f.paineis && f.paineis[idPainel]) || '';
}

function painelVisivel(usuario, idPainel) {
  const estado = estadoDoPainel(idPainel);
  if (estado === PAINEL_ATIVO) return true;
  // O administrador ve todos os paineis em toda filial (4.2.2): os que nao
  // estao ativos aparecem para ele marcados como ocultos, para montar e
  // ligar. Antes um painel que nunca tinha sido ligado na filial (banco
  // antigo) sumia ate para o ADMIN — e ele nao tinha como achar.
  return ehAdministrador(usuario);
}

/* ------------------------------------------------------------------ */
/* ONDE CADA TABELA MORA                                               */
/* ------------------------------------------------------------------ */

function idBancoMestre() { return prop('ID_BANCO', ''); }

function idBancoDaFilial() {
  const f = filialAtual();
  return (f && !f.principal && f.bancoId) ? f.bancoId : idBancoMestre();
}

function idBancoDaTabela(tabela) {
  return TABELAS_GLOBAIS[String(tabela).toUpperCase()] ? idBancoMestre() : idBancoDaFilial();
}

/*
 * Prefixo usado nas chaves de cache e de geracao. A principal e as
 * tabelas globais ficam SEM prefixo — assim o cache que ja existia em
 * producao continua valendo depois da atualizacao.
 */
function espacoDaTabela(tabela) {
  if (TABELAS_GLOBAIS[String(tabela).toUpperCase()]) return '';
  return espacoDaFilial();
}

function espacoDaFilial() {
  if (!_filialDaVez) return '';
  const f = filialAtual();
  return (!f || f.principal) ? '' : (f.codigo + '|');
}

function chaveNoEspaco(chave) {
  if (CHAVES_CACHE_GLOBAIS[chave]) return chave;
  return espacoDaFilial() + chave;
}

/* Sufixo das propriedades por filial (VERSAO_ESQUEMA_SSA...). */
function sufixoDaFilial() {
  const e = espacoDaFilial();
  return e ? '_' + e.replace('|', '') : '';
}

/* ------------------------------------------------------------------ */
/* ROTINAS AUTOMATICAS EM CADA FILIAL                                  */
/* ------------------------------------------------------------------ */

/**
 * Roda `fn` uma vez em cada filial ativa que tem o painel ligado (ativo
 * ou oculto). Um gatilho do Apps Script nao tem ninguem do outro lado:
 * sem isto, a rotina diaria so enxergaria a filial principal.
 *
 * Se a requisicao ja esta dentro de uma filial (um botao apertado por
 * alguem), roda so nela.
 */
function emCadaFilial_(idPainel, fn) {
  if (_filialFixada) return [fn(filialAtual())];
  const resultados = [];
  const antes = _filialDaVez;
  listarFiliais().forEach(function (f) {
    if (!f.ativa) return;
    if (idPainel) {
      const estado = f.paineis[idPainel] || '';
      if (estado !== PAINEL_ATIVO && estado !== PAINEL_OCULTO) return;
    }
    try {
      definirFilial(f.principal ? '' : f.codigo);
      resultados.push(fn(f));
    } catch (e) {
      try { registrarLog('sistema', 'ERRO', 'FILIAL ' + f.codigo, idPainel || '', String(e.message || e)); } catch (x) {}
    }
  });
  definirFilial(antes);
  return resultados;
}

/* ------------------------------------------------------------------ */
/* TELA "FILIAIS E PAINEIS"                                            */
/* ------------------------------------------------------------------ */

function dadosFiliais(usuario) {
  exigirCapacidade(usuario, 'GERIR_FILIAIS');
  const pessoas = listar('ACESSOS').filter(function (p) { return marcado(p.ATIVO); });
  return {
    pessoas: pessoas.map(function (p) {
      const cod = codigosDaPessoa_(p.FILIAIS);
      return {
        email: String(p.EMAIL || '').toLowerCase().trim(), nome: String(p.NOME || '').trim(),
        perfil: String(p.PERFIL || '').toUpperCase().trim(),
        todas: String(p.PERFIL || '').toUpperCase().trim() === 'ADMIN' || !!(cod && cod[0] === '*'),
        filiais: cod ? cod : [filialPrincipal().codigo]
      };
    }).filter(function (p) { return p.email; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); }),
    filiais: listarFiliais().map(function (f) {
      let url = '';
      if (f.bancoId) { try { url = 'https://docs.google.com/spreadsheets/d/' + f.bancoId + '/edit'; } catch (e) {} }
      return {
        id: f.id, codigo: f.codigo, nome: f.nome, cidade: f.cidade, principal: f.principal,
        ativa: f.ativa, paineis: f.paineis, virtual: !!f.virtual, banco: url,
        pessoas: pessoas.filter(function (p) { return pessoaNaFilial_(p, f); }).length
      };
    }),
    catalogo: PAINEIS,
    estados: ESTADOS_PAINEL,
    atual: filialAtual().codigo
  };
}

/**
 * Cria ou edita uma filial.
 *
 * Criar = nova planilha de banco na pasta do GSL, com todas as tabelas de
 * dados, e os paineis escolhidos. Se `copiarDe` vier preenchido, a
 * configuracao daquela filial (rotinas, setores, parametros, DE-PARA,
 * zonas e o catalogo de produtos do estoque da limpeza) e copiada — os
 * DADOS nao: cada filial comeca a sua historia do zero (o saldo nasce das
 * entradas de cada uma).
 */
function acaoSalvarFilial(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_FILIAIS');
  const nome = String(params.nome || '').trim();
  const cidade = String(params.cidade || '').trim();
  const paineis = {};
  const pedidos = params.paineis || {};
  PAINEIS.forEach(function (p) {
    const e = String(pedidos[p.id] || '').toUpperCase().trim();
    if (ESTADOS_PAINEL.indexOf(e) !== -1) paineis[p.id] = e;
  });
  if (!nome) throw new Error('Informe o nome da filial (ex.: CD Salvador).');

  // EDICAO
  if (params.id) {
    const f = listarFiliais().filter(function (x) { return x.id === params.id; })[0];
    if (!f) throw new Error('Filial não encontrada.');
    atualizar('FILIAIS', params.id, {
      NOME: nome, CIDADE: cidade, PAINEIS: JSON.stringify(paineis)
    }, usuario.email);
    limparCache('FILIAIS');
    esquecerFiliais();
    return { ok: true, invalidarTudo: true };
  }

  // CRIACAO
  const codigo = String(params.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (codigo.length < 2 || codigo.length > 6) {
    throw new Error('O código da filial precisa ter de 2 a 6 letras ou números (ex.: SSA).');
  }
  garantirFilialPrincipalGravada_();
  if (filialPorCodigo(codigo)) throw new Error('Já existe uma filial com o código ' + codigo + '.');
  if (!Object.keys(paineis).length) throw new Error('Escolha pelo menos um painel para a filial.');

  const origem = String(params.copiarDe || '').toUpperCase().trim();
  const copia = origem ? lerConfiguracaoParaCopia_(origem) : null;

  // 1 · a planilha
  const planilha = SpreadsheetApp.create('GSL_BANCO_' + codigo);
  try {
    const pasta = prop('ID_PASTA_RAIZ', '');
    if (pasta) DriveApp.getFileById(planilha.getId()).moveTo(DriveApp.getFolderById(pasta));
  } catch (e) { /* sem pasta, fica na raiz do Drive — funciona igual */ }
  try { planilha.setSpreadsheetTimeZone(FUSO_PADRAO); } catch (e) {}

  const tabelas = Object.keys(ESQUEMA).filter(function (t) { return !TABELAS_GLOBAIS[t]; });
  tabelas.forEach(function (tabela, i) {
    const aba = (i === 0) ? planilha.getSheets()[0] : planilha.insertSheet();
    aba.setName(tabela);
    escreverCabecalho(aba, colunasDe(tabela));
  });

  // 2 · o cadastro
  const id = inserir('FILIAIS', {
    CODIGO: codigo, NOME: nome, CIDADE: cidade, BANCO_ID: planilha.getId(),
    PRINCIPAL: 'NAO', ATIVA: 'SIM', PAINEIS: JSON.stringify(paineis),
    ORDEM: listarFiliais().length
  }, usuario.email);
  limparCache('FILIAIS');
  esquecerFiliais();

  // 3 · a configuracao inicial, gravada JA no banco novo
  const antes = _filialDaVez;
  try {
    definirFilial(codigo);
    semearFilialNova_(copia, usuario.email);
    PropertiesService.getScriptProperties().setProperty('VERSAO_ESQUEMA' + sufixoDaFilial(), VERSAO_ESQUEMA);
    esquecerProps();
  } finally {
    definirFilial(antes);
  }

  registrarLog(usuario.email, 'FILIAL', 'FILIAIS', codigo, 'Filial criada com banco ' + planilha.getId());
  return { ok: true, id: id, codigo: codigo, banco: planilha.getUrl(), invalidarTudo: true,
           recado: 'Filial ' + nome + ' criada. Libere as pessoas dela em Pessoas e acessos.' };
}

/** Muda o estado de UM painel numa filial — o clique da tela. */
function acaoAlterarPainel(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_FILIAIS');
  garantirFilialPrincipalGravada_();
  const f = filialPorCodigo(params.codigo);
  if (!f) throw new Error('Filial não encontrada.');
  const painel = String(params.painel || '').toLowerCase();
  if (!PAINEIS.some(function (p) { return p.id === painel; })) throw new Error('Painel desconhecido.');
  const estado = String(params.estado || '').toUpperCase().trim();

  const paineis = JSON.parse(JSON.stringify(f.paineis || {}));
  if (estado === 'REMOVER' || !estado) delete paineis[painel];
  else if (ESTADOS_PAINEL.indexOf(estado) !== -1) paineis[painel] = estado;
  else throw new Error('Estado inválido.');

  atualizar('FILIAIS', f.id, { PAINEIS: JSON.stringify(paineis) }, usuario.email);
  limparCache('FILIAIS');
  esquecerFiliais();
  return { ok: true, invalidarTudo: true };
}

/** Liga ou desliga a filial inteira (some da escolha de entrada). */
function acaoAlternarFilial(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_FILIAIS');
  garantirFilialPrincipalGravada_();
  const f = filialPorCodigo(params.codigo);
  if (!f) throw new Error('Filial não encontrada.');
  if (f.principal && f.ativa) throw new Error('A filial principal não pode ser desligada.');
  atualizar('FILIAIS', f.id, { ATIVA: f.ativa ? 'NAO' : 'SIM' }, usuario.email);
  limparCache('FILIAIS');
  esquecerFiliais();
  return { ok: true, invalidarTudo: true };
}

/* ------------------------------------------------------------------ */
/* MIGRACAO E SEMENTES                                                 */
/* ------------------------------------------------------------------ */

/**
 * Grava a filial principal na tabela, se ela ainda for so a "virtual".
 * Roda na migracao e antes de qualquer edicao do cadastro.
 */
function garantirFilialPrincipalGravada_() {
  let linhas = [];
  try { linhas = listar('FILIAIS'); } catch (e) { return false; }
  if (linhas.length) return false;
  inserir('FILIAIS', {
    CODIGO: FILIAL_PADRAO.codigo, NOME: FILIAL_PADRAO.nome, CIDADE: FILIAL_PADRAO.cidade,
    BANCO_ID: prop('ID_BANCO', ''), PRINCIPAL: 'SIM', ATIVA: 'SIM',
    PAINEIS: JSON.stringify(paineisPadraoPrincipal_()), ORDEM: 0
  }, 'migracao');
  limparCache('FILIAIS');
  esquecerFiliais();
  return true;
}

/* Liga na principal, como ATIVO, os paineis que ela ainda nao conhece. */
function adicionarPaineisNovosNaPrincipal_(ids) {
  let linhas = [];
  try { linhas = listar('FILIAIS'); } catch (e) { return false; }
  const pr = linhas.filter(function (l) { return marcado(l.PRINCIPAL); })[0];
  if (!pr) return false;
  const paineis = lerPaineis_(pr.PAINEIS);
  const faltam = ids.filter(function (id) { return !paineis[id]; });
  if (!faltam.length) return false;
  faltam.forEach(function (id) { paineis[id] = PAINEL_ATIVO; });
  atualizar('FILIAIS', pr.ID, { PAINEIS: JSON.stringify(paineis) }, 'migracao');
  limparCache('FILIAIS');
  esquecerFiliais();
  return true;
}

/*
 * QUEM ENTRA NESTA FILIAL — a lista de pessoas marcada de uma vez, pela
 * tela de Filiais. Mexe so na coluna FILIAIS de cada pessoa: quem estava
 * em "todas" ou e ADMIN continua como esta.
 */
function acaoSalvarPessoasDaFilial(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_FILIAIS');
  const f = filialPorCodigo(params.codigo);
  if (!f) throw new Error('Filial não encontrada.');
  const marcados = {};
  (params.emails || []).forEach(function (e) { marcados[String(e).toLowerCase().trim()] = true; });
  const principal = filialPrincipal();

  const mudancas = [];
  listar('ACESSOS').forEach(function (p) {
    const email = String(p.EMAIL || '').toLowerCase().trim();
    if (!email) return;
    if (String(p.PERFIL || '').toUpperCase().trim() === 'ADMIN') return;
    if (!marcado(p.ATIVO)) return;             // fora da lista da tela: nao mexe
    const atual = codigosDaPessoa_(p.FILIAIS);
    if (atual && atual[0] === '*') return;
    const lista = atual ? atual.slice() : [principal.codigo];
    const tem = lista.indexOf(f.codigo) !== -1;
    const quer = !!marcados[email];
    if (tem === quer) return;
    const nova = quer ? lista.concat([f.codigo]) : lista.filter(function (c) { return c !== f.codigo; });
    // Vazio quer dizer "so a principal": sem filial nenhuma grava um marcador.
    mudancas.push({ id: p.ID, campos: { FILIAIS: nova.length ? nova.join(',') : 'NENHUMA' } });
  });
  if (mudancas.length) atualizarVarios('ACESSOS', mudancas, usuario.email);
  limparCache('ACESSOS');
  return { ok: true, invalidarTudo: true, recado: mudancas.length
    ? mudancas.length + ' pessoa(s) atualizada(s) em ' + f.nome + '.' : 'Nada mudou.' };
}

/* Le a configuracao de uma filial para servir de modelo a outra. */
function lerConfiguracaoParaCopia_(codigoOrigem) {
  const origem = filialPorCodigo(codigoOrigem);
  if (!origem) throw new Error('Filial de origem não encontrada: ' + codigoOrigem);
  const antes = _filialDaVez;
  const limpar = function (lista) {
    return lista.map(function (r) {
      const c = {};
      Object.keys(r).forEach(function (k) {
        if (k === '_linha' || COLUNAS_CONTROLE.indexOf(k) !== -1) return;
        c[k] = r[k];
      });
      return c;
    });
  };
  try {
    definirFilial(origem.principal ? '' : origem.codigo);
    const ler = function (t) { try { return limpar(listar(t)); } catch (e) { return []; } };
    return {
      ROTINAS: ler('ROTINAS'),
      SETORES: ler('SETORES'),
      PARAMETROS: ler('PARAMETROS').filter(function (p) {
        return String(p.CHAVE || '').toUpperCase().indexOf('APRESENTACAO_') !== 0 &&
               String(p.CHAVE || '').toUpperCase() !== 'QUADRO_PLANILHA' &&
               String(p.CHAVE || '').toUpperCase() !== 'APRENDIZ_PLANILHA';
      }),
      DE_PARA: ler('DE_PARA'),
      LP_ZONAS: ler('LP_ZONAS'),
      LP_EST_ITENS: ler('LP_EST_ITENS')
    };
  } finally {
    definirFilial(antes);
  }
}

/* Sementes do banco novo — copia de outra filial ou o padrao do sistema. */
function semearFilialNova_(copia, quem) {
  const usar = function (tabela, semear) {
    if (copia && copia[tabela] && copia[tabela].length) inserirVarios(tabela, copia[tabela], quem);
    else if (semear) semear();
  };
  usar('ROTINAS', semearRotinas);
  usar('SETORES', semearSetores);
  usar('PARAMETROS', semearParametros);
  const temChave = {};
  listar('PARAMETROS').forEach(function (p) { temChave[String(p.CHAVE).toUpperCase()] = true; });
  const faltam = PARAMETROS_NOVOS.filter(function (p) { return !temChave[p[0]]; })
    .map(function (p) { return { CHAVE: p[0], VALOR: p[2] || '', DESCRICAO: p[1] }; });
  if (faltam.length) inserirVarios('PARAMETROS', faltam, quem);
  usar('DE_PARA', semearDePara);
  usar('LP_ZONAS', semearZonasLimpeza);
  usar('LP_EST_ITENS', null);
}
