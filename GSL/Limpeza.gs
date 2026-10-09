/**
 * LIMPEZA CD (4.2.2) — tres coisas, nada mais:
 *
 *   - GESTAO: o resumo — acoes abertas e atrasadas, o que vence primeiro
 *     e os produtos que chegaram ao estoque minimo;
 *   - PLANO DE ACAO: o mesmo modelo do Plano de Acao do Calendario
 *     (responsaveis, prazo, etapa, comentarios com historico, "depende
 *     de", fotos). As acoes moram na tabela ACOES com PLANO = LIMPEZA —
 *     ver Acoes.gs;
 *   - ESTOQUE: o mesmo controle do Estoque de TI (catalogo, minimo e
 *     ideal, entrada, saida, estorno, inventario e historico), nas tabelas
 *     LP_EST_ITENS e LP_EST_MOVIMENTOS — ver Estoque.gs.
 *
 * Saiu o controle por lote/compra/embalagem (LP_LOTES, LP_ITENS,
 * LP_COMPRAS, LP_EMBALAGENS, LP_PRODUTOS): as tabelas continuam no banco,
 * com tudo o que foi registrado, mas a tela nao usa mais. As acoes da
 * tabela antiga (LP_ACOES) passam sozinhas para o Plano de Acao na
 * primeira abertura depois da atualizacao (Instalacao.gs).
 */

const BUILD_LIMPEZA = '2026.10.09';   // carimbo da entrega — ver APP.build no Codigo.gs
const LP_ORIGENS = ['Vistoria setorial', 'Ronda do supervisor', 'Auditoria mensal',
                    'Ocorrência do turno', 'Reclamação'];
const LP_CRITICIDADES = ['Alta', 'Média', 'Baixa'];

/* Situacao da tabela antiga (LP_ACOES) — usada na passagem para o Plano de Acao. */
function statusLimpeza_(s) {
  const t = normalizarTexto_(s);
  if (t.indexOf('CONCLU') === 0) return 'Concluída';
  if (t.indexOf('CANCEL') === 0) return 'Cancelada';
  if (t.indexOf('ANDAMENTO') !== -1) return 'Em andamento';
  return 'Aberta';
}

function critLimpeza_(c) {
  const t = normalizarTexto_(c);
  if (t.indexOf('ALT') === 0) return 'Alta';
  if (t.indexOf('BAIX') === 0) return 'Baixa';
  return 'Média';
}

function zonasLimpeza_() {
  return listar('LP_ZONAS').map(function (z) {
    return { id: z.ID, zona: String(z.ZONA || '').trim(), descricao: String(z.DESCRICAO || '').trim(),
             ativo: String(z.ATIVO || 'SIM').trim() === '' || marcado(z.ATIVO) };
  }).filter(function (z) { return z.zona; })
    .sort(function (a, b) {
      const na = Number(a.zona.replace(/\D/g, '')), nb = Number(b.zona.replace(/\D/g, ''));
      return (na - nb) || a.zona.localeCompare(b.zona);
    });
}

/*
 * A tela inteira numa ida so: o plano (todas as acoes que a pessoa
 * enxerga — os filtros sao aplicados na tela) e o estoque.
 */
function dadosLimpeza(usuario, params) {
  return {
    hoje: paraISO(hoje()),
    plano: dadosPlano_(PLANOS.LIMPEZA, usuario, { situacao: 'TODAS' }),
    estoque: dadosDoEstoque_(ESTOQUES.LP, usuario, params || {}),
    zonas: zonasLimpeza_(),
    listas: { origens: LP_ORIGENS, criticidades: LP_CRITICIDADES },
    permissoes: { gerir: podeFazer(usuario, 'GERIR_LIMPEZA') }
  };
}

/* ------------------------------------------------------------------ */
/* ACOES ANTIGAS (LP_ACOES) -> PLANO DE ACAO DA LIMPEZA                */
/* ------------------------------------------------------------------ */

/*
 * Uma linha da tabela antiga no formato do Plano de Acao. O ID e o mesmo:
 * os comentarios que ela ja tinha continuam ligados a ela.
 *   O que foi encontrado -> Acao (o titulo)
 *   Acao definida        -> O que precisa ser feito
 *   Responsavel (texto)  -> Responsavel (sem e-mail: a gestao atribui
 *                            alguem quando editar)
 */
function acaoDaTabelaAntiga_(a) {
  const status = statusLimpeza_(a.STATUS);
  const problema = String(a.PROBLEMA || '').trim();
  const oQueFazer = String(a.ACAO || '').trim();
  const fazer = /^\(acao nao registrada\)$/.test(normalizarTexto_(oQueFazer).toLowerCase()) ? '' : oQueFazer;
  const evidencia = String(a.EVIDENCIA || '').trim();
  const custo = num_(a.CUSTO);
  const fechamento = isoDe_(a.FECHAMENTO);
  const extras = [evidencia ? 'Evidência: ' + evidencia : '', custo ? 'Custo: R$ ' + String(custo).replace('.', ',') : '']
    .filter(Boolean).join(' · ');
  const turno = String(a.TURNO || '').toUpperCase().trim();
  return {
    ID: String(a.ID),
    PLANO: 'LIMPEZA',
    ACAO: problema || fazer || '(sem descrição)',
    DESCRICAO: problema ? fazer : '',
    RESPONSAVEL: String(a.RESPONSAVEL || '').trim() || 'Supervisor de Limpeza',
    RESPONSAVEL_EMAIL: '',
    TURNO: ACOES_TURNOS.indexOf(turno) !== -1 ? turno : 'Todos',
    ORIGEM: String(a.ORIGEM || '').trim() || 'Vistoria setorial',
    PRAZO: isoDe_(a.PRAZO),
    SITUACAO: status === 'Concluída' ? ACOES_SITUACAO.CONCLUIDA : (status === 'Cancelada' ? ACOES_SITUACAO.CANCELADA : ACOES_SITUACAO.PENDENTE),
    CONCLUIDO_EM: status === 'Concluída' && fechamento ? formatarData(paraData(fechamento)) : '',
    CONCLUIDO_POR: '',
    OBSERVACAO: status === 'Concluída' || status === 'Cancelada' ? extras : '',
    ANDAMENTO: status === 'Em andamento' ? 'Em andamento' : (status === 'Concluída' ? 'Concluída' : ''),
    DEPENDE: status === 'Concluída' || status === 'Cancelada' ? '' : String(a.DEPENDE || '').trim(),
    ZONA: String(a.ZONA || '').toUpperCase().trim(),
    LOCAL: String(a.LOCAL || '').trim(),
    CRITICIDADE: critLimpeza_(a.CRITICIDADE),
    ABERTA_EM: isoDe_(a.DATA),
    ANEXOS: ''
  };
}

/*
 * Passa as acoes da tabela antiga para o Plano de Acao. Roda na migracao
 * (garantirEsquema) e pode rodar de novo sem duplicar: o ID que ja esta em
 * ACOES (mesmo excluido) nao entra outra vez. Na tabela antiga nada e
 * apagado. Devolve quantas passaram.
 */
function migrarAcoesDaLimpeza_() {
  let antigas;
  try { antigas = listar('LP_ACOES'); } catch (e) { return 0; }
  if (!antigas.length) return 0;
  /*
   * Ler o que ja passou e gravar na MESMA trava: duas pessoas abrindo o
   * sistema juntas logo depois da atualizacao passavam as duas pela
   * conferencia e gravavam cada acao duas vezes, com o mesmo ID.
   */
  return comTrava(function () {
    const ja = {};
    listar('ACOES', true).forEach(function (r) { ja[String(r.ID)] = true; });
    const novas = antigas.filter(function (a) { return a.ID && !ja[String(a.ID)]; });
    if (!novas.length) return 0;
    inserirVarios('ACOES', novas.map(acaoDaTabelaAntiga_), 'migracao');
    // Quem registrou e quando continuam os de antes (o inserir carimba "agora").
    atualizarVarios('ACOES', novas.map(function (a) {
      const c = { CRIADO_EM: carimboTexto_(a.CRIADO_EM), CRIADO_POR: String(a.CRIADO_POR || '') };
      const outros = acaoDaTabelaAntiga_(a);
      if (outros.SITUACAO === ACOES_SITUACAO.CONCLUIDA && !outros.CONCLUIDO_EM) c.CONCLUIDO_EM = carimboTexto_(a.ATUALIZADO_EM);
      return { id: String(a.ID), campos: c };
    }).filter(function (m) { return m.campos.CRIADO_EM; }), 'migracao');
    return novas.length;
  });
}

/* Carimbo sempre no formato do sistema ('dd/MM/yyyy HH:mm:ss'), mesmo quando a celula antiga virou Date. */
function carimboTexto_(v) {
  const p = partesDoCarimbo_(v);
  if (!p) return String(v == null ? '' : v).trim();
  return dd_(p.d) + '/' + dd_(p.m) + '/' + p.a + ' ' + dd_(p.h) + ':' + dd_(p.mi) + ':' + dd_(p.s);
}

/** Grava a lista de zonas inteira (a janela de zonas edita todas de uma vez). */
function acaoSalvarZona(usuario, params) {
  const zonas = params.zonas || [];
  const atuais = {};
  zonasLimpeza_().forEach(function (z) { atuais[z.id] = z; });
  const mud = [], novas = [];
  zonas.forEach(function (z) {
    const c = { ZONA: String(z.zona || '').toUpperCase().trim(), DESCRICAO: String(z.descricao || '').trim(),
                ATIVO: z.ativo === false ? 'NAO' : 'SIM' };
    if (!c.ZONA) return;
    if (z.id && atuais[z.id]) mud.push({ id: z.id, campos: c });
    else novas.push(c);
  });
  if (mud.length) atualizarVarios('LP_ZONAS', mud, usuario.email);
  if (novas.length) inserirVarios('LP_ZONAS', novas, usuario.email);
  return { ok: true };
}

/*
 * IMPORTAR DA PLANILHA ANTIGA (04_Planilha_Gestao_Limpeza, a versao online).
 *
 * Traz: as zonas da aba CADASTROS, as NAO CONFORMIDADES (viram acoes do
 * Plano de Acao da Limpeza) e os nomes da aba PRODUTOS (viram itens do
 * estoque, com saldo zero — o saldo nasce das entradas). Nao duplica o que
 * ja foi importado (mesma data + turno + local + problema; mesmo nome de
 * produto). Compras, rendimento e registros dos turnos ficam de fora: o
 * estoque agora e controlado por entradas e saidas.
 */
function acaoImportarLimpeza(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_LIMPEZA');
  const link = String(params.link || '').trim();
  if (!link) throw new Error('Cole o link da planilha antiga.');
  let arq;
  exigirPorta_();
  try { arq = /^[\w-]{25,}$/.test(link) ? SpreadsheetApp.openById(link) : SpreadsheetApp.openByUrl(link); }
  catch (e) { throw new Error('Não consegui abrir a planilha. Confira o link e se você tem acesso a ela.'); }

  const aba = function (prefixo) {
    const abas = arq.getSheets();
    for (let i = 0; i < abas.length; i++) {
      if (normalizarTexto_(abas[i].getName()).indexOf(prefixo) === 0) return abas[i];
    }
    return null;
  };
  // Cabecalho = primeira linha (entre as 6 primeiras) que tem o marcador.
  const ler = function (sh, marcador) {
    if (!sh) return [];
    const v = sh.getDataRange().getValues();
    let cab = -1;
    for (let i = 0; i < Math.min(6, v.length); i++) {
      if (v[i].some(function (c) { return normalizarTexto_(c) === marcador; })) { cab = i; break; }
    }
    if (cab === -1) return [];
    const nomes = v[cab].map(normalizarTexto_);
    return v.slice(cab + 1).map(function (l) {
      const o = {}; nomes.forEach(function (n, i) { if (n && o[n] === undefined) o[n] = l[i]; }); return o;
    });
  };
  const p = function (o, pedaco) {
    const ks = Object.keys(o);
    for (let k = 0; k < ks.length; k++) if (ks[k].indexOf(pedaco) === 0) return o[ks[k]];
    return '';
  };
  const t = function (v) { return String(v == null ? '' : v).trim(); };
  // Turno da chave: o que o Plano de Acao aceita; o resto (vazio, "Todos", letra estranha) vira ''.
  const turnoDaChave = function (v) {
    const u = String(v == null ? '' : v).toUpperCase().trim();
    return u !== 'TODOS' && ACOES_TURNOS.indexOf(u) !== -1 ? u : '';
  };
  const relato = { acoes: 0, produtos: 0, zonas: 0 };
  // A planilha antiga e lida ANTES da trava: so a gravacao precisa dela.
  const linhasZonas = ler(aba('CADASTROS'), 'ZONA');
  const linhasAcoes = ler(aba('NAO CONFORMIDADES'), 'DATA');
  const linhasProdutos = ler(aba('PRODUTOS'), 'PRODUTO');

  return comTrava(function () {
    // Zonas
    const zonasTem = {};
    zonasLimpeza_().forEach(function (z) { zonasTem[z.zona] = true; });
    const novasZonas = [];
    linhasZonas.forEach(function (o) {
      const z = t(p(o, 'ZONA')).toUpperCase();
      if (!z || zonasTem[z] || !/^Z\d+/.test(z)) return;
      zonasTem[z] = true;
      novasZonas.push({ ZONA: z, DESCRICAO: t(p(o, 'DESCRICAO')), ATIVO: 'SIM' });
    });
    if (novasZonas.length) { inserirVarios('LP_ZONAS', novasZonas, usuario.email); relato.zonas = novasZonas.length; }

    // Acoes (NAO CONFORMIDADES) -> Plano de Acao da Limpeza
    /*
     * Conta por chave (nao "ja vi / nao vi"): duas nao conformidades iguais no
     * mesmo dia e local (turno A resolveu, turno C ainda aberta) eram UMA — a
     * aberta sumia. Reimportar continua sem duplicar: pula enquanto a planilha
     * nao tiver mais linhas daquela chave do que o GSL ja tem.
     */
    const chaveAcao = function (data, turno, local, problema) {
      return [data, turnoDaChave(turno), local, problema].join('|').toLowerCase();
    };
    const acoesTem = {};
    listar('ACOES').filter(function (r) { return planoDe_(r) === 'LIMPEZA'; }).forEach(function (a) {
      const k = chaveAcao(isoDe_(a.ABERTA_EM), a.TURNO, t(a.LOCAL), t(a.ACAO));
      acoesTem[k] = (acoesTem[k] || 0) + 1;
    });
    const acoesVistas = {};
    const novasAcoes = [];
    linhasAcoes.forEach(function (o) {
      const problema = t(p(o, 'O QUE FOI'));
      if (!problema) return;
      const data = isoDe_(p(o, 'DATA'));
      const k = chaveAcao(data, t(p(o, 'TURNO')), t(p(o, 'LOCAL')), problema);
      acoesVistas[k] = (acoesVistas[k] || 0) + 1;
      if (acoesVistas[k] <= (acoesTem[k] || 0)) return;
      const linha = acaoDaTabelaAntiga_({
        ID: gerarId('ACOES'), DATA: data, TURNO: t(p(o, 'TURNO')), ORIGEM: t(p(o, 'ORIGEM')),
        ZONA: t(p(o, 'ZONA')), LOCAL: t(p(o, 'LOCAL')), PROBLEMA: problema, CRITICIDADE: p(o, 'CRIT'),
        ACAO: t(p(o, 'ACAO')), RESPONSAVEL: t(p(o, 'RESPONSAVEL')), PRAZO: p(o, 'PRAZO'),
        STATUS: p(o, 'STATUS'), FECHAMENTO: p(o, 'FECHAMENTO'), EVIDENCIA: t(p(o, 'EVIDENCIA')), CUSTO: ''
      });
      novasAcoes.push(linha);
    });
    if (novasAcoes.length) { inserirVarios('ACOES', novasAcoes, usuario.email); relato.acoes = novasAcoes.length; }

    // Produtos -> itens do estoque da limpeza (so o nome; o saldo nasce das entradas)
    const itens = itensEstoque_(ESTOQUES.LP);
    const prodTem = {};
    itens.forEach(function (x) { prodTem[x.nome.toLowerCase()] = true; });
    let proximo = Number((proximoCodigoEstoque_(itens, ESTOQUES.LP.prefixo).match(/\d+$/) || ['1'])[0]);
    const novosProd = [];
    linhasProdutos.forEach(function (o) {
      const nome = t(p(o, 'PRODUTO'));
      if (!nome || prodTem[nome.toLowerCase()]) return;
      // Linhas de instrucao da planilha (texto comprido, sem numero nenhum) nao sao produto.
      if (nome.length > 60 || (num_(p(o, 'EMBALAGEM')) === null && num_(p(o, 'PRECO')) === null)) return;
      prodTem[nome.toLowerCase()] = true;
      novosProd.push(camposItem_({ codigo: ESTOQUES.LP.prefixo + '-' + String(proximo++).padStart(4, '0'),
        nome: nome, categoria: 'Químicos e detergentes', unidade: 'un', local: t(p(o, 'ONDE')) }));
    });
    if (novosProd.length) { inserirVarios(ESTOQUES.LP.itens, novosProd, usuario.email); relato.produtos = novosProd.length; }

    return { ok: true, relato: relato, recado: 'Importado: ' + relato.acoes + ' ação(ões) para o Plano de Ação, ' +
      relato.produtos + ' produto(s) para o estoque e ' + relato.zonas + ' zona(s).' };
  });
}
