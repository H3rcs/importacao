/**
 * LIMPEZA CD — a planilha de gestao virou painel, e ficou mais enxuta.
 *
 * Ficou o que a gerencia usa para decidir:
 *   - GESTAO: os numeros do mes (acoes abertas, atrasadas, criticas,
 *     compras e custo previsto) e o que vence primeiro;
 *   - ACOES: tudo que saiu NAO conforme — principalmente das vistorias —
 *     com responsavel, prazo e fechamento;
 *   - CUSTOS: produtos (concentracao, diluicao e rendimento), compras e
 *     embalagens abertas (ate quando deveria render x ate quando rendeu).
 *
 * Saiu: registros de ocorrencia e o resumo diario dos turnos. O papel
 * continua sendo o registro detalhado; aqui entra so o que vira acao ou
 * custo.
 */

const LP_STATUS = ['Aberta', 'Em andamento', 'Concluída', 'Cancelada'];
const LP_ORIGENS = ['Vistoria setorial', 'Ronda do supervisor', 'Auditoria mensal',
                    'Ocorrência do turno', 'Reclamação'];
const LP_CRITICIDADES = ['Alta', 'Média', 'Baixa'];
const LP_TIPOS_PRODUTO = ['Concentrado', 'Pronto uso'];
const LP_RESPONSAVEIS = ['Supervisor de Limpeza', 'Manutenção Predial', 'SESMT',
                         'Gerência de Logística', 'Compras', 'Equipe do turno'];

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

function diasEntre_(isoA, isoB) {
  const a = paraData(isoA), b = paraData(isoB);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function somarDias_(iso, dias) {
  const d = paraData(iso);
  if (!d) return '';
  return paraISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(dias)));
}

/* ------------------------------------------------------------------ */
/* LEITURA                                                             */
/* ------------------------------------------------------------------ */

function acoesLimpeza_(hojeIso) {
  const coment = comentariosPorAcao_('LP_ACOES');
  const lista = listar('LP_ACOES').map(function (a) {
    const status = statusLimpeza_(a.STATUS);
    const data = isoDe_(a.DATA), prazo = isoDe_(a.PRAZO), fechamento = isoDe_(a.FECHAMENTO);
    const aberta = status === 'Aberta' || status === 'Em andamento';
    return {
      id: a.ID, data: data, turno: String(a.TURNO || '').toUpperCase().trim(),
      origem: String(a.ORIGEM || '').trim() || 'Vistoria setorial',
      zona: String(a.ZONA || '').trim(), local: String(a.LOCAL || '').trim(),
      problema: String(a.PROBLEMA || '').trim(), criticidade: critLimpeza_(a.CRITICIDADE),
      acao: String(a.ACAO || '').trim(), responsavel: String(a.RESPONSAVEL || '').trim(),
      prazo: prazo, status: status, fechamento: fechamento,
      evidencia: String(a.EVIDENCIA || '').trim(), custo: num_(a.CUSTO),
      depende: String(a.DEPENDE || '').trim(), comentarios: coment[String(a.ID || '')] || [],
      aberta: aberta,
      atrasada: aberta && !!prazo && prazo < hojeIso,
      diasAberta: data ? (fechamento ? diasEntre_(data, fechamento) : (aberta ? diasEntre_(data, hojeIso) : null)) : null,
      diasParaPrazo: (aberta && prazo) ? diasEntre_(hojeIso, prazo) : null
    };
  });
  // Reincidencia: o mesmo problema no mesmo local, contado no historico.
  const vezes = {};
  lista.forEach(function (a) {
    const k = (a.local + '|' + a.problema).toLowerCase();
    vezes[k] = (vezes[k] || 0) + 1;
  });
  lista.forEach(function (a) { a.reincidencia = vezes[(a.local + '|' + a.problema).toLowerCase()] || 1; });
  return lista.sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
}

/* As contas da aba PRODUTOS da planilha, uma por uma. */
function calcularProduto_(p) {
  const pronto = normalizarTexto_(p.tipo).indexOf('PRONTO') === 0;
  const emb = p.embalagemMl, preco = p.preco, dil = p.diluicao, sol = p.solucaoL, porDia = p.aplicacoesDia;
  const mlAplic = pronto ? (sol ? sol * 1000 : null) : ((dil && sol) ? dil * sol : null);
  const aplicEmb = (emb && mlAplic) ? emb / mlAplic : null;
  const custoAplic = (preco && aplicEmb) ? preco / aplicEmb : null;
  const custoLitro = (preco && emb) ? (pronto ? preco / emb * 1000 : (dil ? (preco / emb) * dil : null)) : null;
  const duracao = (aplicEmb && porDia) ? aplicEmb / porDia : null;
  const custoDia = (custoAplic && porDia) ? custoAplic * porDia : null;
  p.pronto = pronto;
  p.mlAplicacao = mlAplic;
  p.aplicacoesEmbalagem = aplicEmb;
  p.custoAplicacao = custoAplic;
  p.custoLitro = custoLitro;
  p.duracaoDias = duracao;
  p.custoDia = custoDia;
  p.custoMes = custoDia ? custoDia * 30 : null;
  return p;
}

function produtosLimpeza_() {
  return listar('LP_PRODUTOS').map(function (p) {
    return calcularProduto_({
      id: p.ID, produto: String(p.PRODUTO || '').trim(), tipo: String(p.TIPO || 'Concentrado').trim(),
      embalagemMl: num_(p.EMBALAGEM_ML), preco: num_(p.PRECO), diluicao: num_(p.DILUICAO_ML_L),
      solucaoL: num_(p.SOLUCAO_L), aplicacoesDia: num_(p.APLICACOES_DIA), onde: String(p.ONDE || ''),
      ativo: String(p.ATIVO || 'SIM').trim() === '' || marcado(p.ATIVO)
    });
  }).filter(function (p) { return p.produto; })
    .sort(function (a, b) { return a.produto.localeCompare(b.produto); });
}

function embalagensLimpeza_(produtos, hojeIso) {
  const porNome = {};
  produtos.forEach(function (p) { porNome[p.produto.toLowerCase()] = p; });
  return listar('LP_EMBALAGENS').map(function (e) {
    const prod = porNome[String(e.PRODUTO || '').trim().toLowerCase()];
    const previsto = prod ? prod.duracaoDias : null;
    const abertura = isoDe_(e.ABERTURA), termino = isoDe_(e.TERMINO);
    const deveAte = (abertura && previsto) ? somarDias_(abertura, previsto) : '';
    const rendeu = (abertura && termino) ? diasEntre_(abertura, termino) : null;
    const rend = (rendeu !== null && previsto) ? rendeu / previsto : null;
    let situacao;
    if (!termino) situacao = (deveAte && hojeIso > deveAte) ? 'Passou do prazo — ainda em uso' : 'Em uso';
    else if (rend === null) situacao = 'Terminou';
    else if (rend >= 1.1) situacao = 'Rendeu mais que o previsto';
    else if (rend >= 0.9) situacao = 'Dentro do previsto';
    else if (rend >= 0.75) situacao = 'Rendeu abaixo';
    else situacao = 'Muito abaixo — verificar diluição';
    return {
      id: e.ID, produto: String(e.PRODUTO || '').trim(), dataCompra: isoDe_(e.DATA_COMPRA),
      nf: String(e.NF || ''), preco: num_(e.PRECO), abertura: abertura, termino: termino,
      previstoDias: previsto, deveRenderAte: deveAte, diasRestantes: (!termino && deveAte) ? diasEntre_(hojeIso, deveAte) : null,
      diasRendeu: rendeu, desvio: (rendeu !== null && previsto) ? Math.round(rendeu - previsto) : null,
      rendimento: rend, situacao: situacao, emUso: !termino, observacao: String(e.OBSERVACAO || '')
    };
  }).filter(function (e) { return e.produto; })
    .sort(function (a, b) { return (b.abertura || '').localeCompare(a.abertura || ''); });
}

function comprasLimpeza_() {
  return listar('LP_COMPRAS').map(function (c) {
    const qtd = num_(c.QUANTIDADE), unit = num_(c.PRECO_UNIT);
    return {
      id: c.ID, data: isoDe_(c.DATA), produto: String(c.PRODUTO || '').trim(),
      quantidade: qtd, precoUnit: unit, total: (qtd && unit) ? qtd * unit : null,
      fornecedor: String(c.FORNECEDOR || ''), nf: String(c.NF || ''), observacao: String(c.OBSERVACAO || '')
    };
  }).filter(function (c) { return c.produto || c.data; })
    .sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
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

/* ------------------------------------------------------------------ */
/* CUSTOS POR LOTE (4.2.2)                                             */
/*                                                                     */
/* O supervisor registra a COMPRA (data, fornecedor, NF e os produtos   */
/* que vieram). Cada produto fica em uso ate ele apertar "Acabou": o    */
/* sistema guarda a data e mede quanto durou. Depois ele registra o     */
/* reabastecimento — compra individual ou num lote novo — e o ciclo     */
/* recomeca. Sem cadastro previo de produto: o nome digitado basta.     */
/* ------------------------------------------------------------------ */

function chaveProdutoLp_(nome) { return normalizarTexto_(nome).replace(/\s+/g, ' ').trim(); }

function lotesLimpeza_(hojeIso) {
  const lotes = {};
  listar('LP_LOTES').forEach(function (l) {
    lotes[l.ID] = { id: l.ID, data: isoDe_(l.DATA), tipo: String(l.TIPO || 'LOTE').toUpperCase().trim() === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'LOTE',
      fornecedor: String(l.FORNECEDOR || '').trim(), nf: String(l.NF || '').trim(), observacao: String(l.OBSERVACAO || '').trim(),
      itens: [], total: 0 };
  });
  const itens = listar('LP_ITENS').map(function (i) {
    const lote = lotes[i.LOTE] || null;
    const qtd = num_(i.QUANTIDADE), unit = num_(i.PRECO_UNIT);
    const inicio = isoDe_(i.INICIO) || (lote ? lote.data : '');
    const acabou = isoDe_(i.ACABOU_EM), reposto = isoDe_(i.REPOSTO_EM);
    const dias = inicio ? diasEntre_(inicio, acabou || hojeIso) : null;
    const it = {
      id: i.ID, lote: String(i.LOTE || ''), produto: String(i.PRODUTO || '').trim(), chave: chaveProdutoLp_(i.PRODUTO),
      quantidade: qtd, unidade: String(i.UNIDADE || 'un').trim() || 'un', precoUnit: unit,
      total: (qtd && unit) ? Math.round(qtd * unit * 100) / 100 : null,
      inicio: inicio, acabouEm: acabou, repostoEm: reposto, repostoPor: String(i.REPOSTO_POR || ''),
      dias: dias, situacao: !acabou ? 'EM_USO' : (reposto ? 'REPOSTO' : 'AGUARDANDO'),
      dataCompra: lote ? lote.data : '', tipoCompra: lote ? lote.tipo : '', fornecedor: lote ? lote.fornecedor : '', nf: lote ? lote.nf : '',
      observacao: String(i.OBSERVACAO || '').trim()
    };
    if (lote) { lote.itens.push(it); lote.total += it.total || 0; }
    return it;
  }).filter(function (i) { return i.produto; });

  // Consumo por produto: quanto dura (so o que ja acabou), quanto custa.
  const porProduto = {};
  itens.forEach(function (i) {
    const p = porProduto[i.chave] || (porProduto[i.chave] = { produto: i.produto, compras: 0, quantidade: 0, gasto: 0,
      duracoes: [], custosDia: [], emUso: 0, aguardando: 0, ultimaCompra: '', ultimoPreco: null });
    p.compras++; p.quantidade += i.quantidade || 0; p.gasto += i.total || 0;
    if (i.situacao === 'EM_USO') p.emUso++;
    if (i.situacao === 'AGUARDANDO') p.aguardando++;
    if (i.acabouEm && i.dias !== null) {
      const d = Math.max(1, i.dias);
      p.duracoes.push({ dias: d, acabou: i.acabouEm });
      if (i.total) p.custosDia.push(i.total / d);
    }
    if (!p.ultimaCompra || i.dataCompra > p.ultimaCompra) { p.ultimaCompra = i.dataCompra; p.ultimoPreco = i.precoUnit; p.produto = i.produto; }
  });
  const consumo = Object.keys(porProduto).map(function (k) {
    const p = porProduto[k];
    const media = p.duracoes.length ? p.duracoes.reduce(function (s, x) { return s + x.dias; }, 0) / p.duracoes.length : null;
    const ultima = p.duracoes.slice().sort(function (a, b) { return b.acabou.localeCompare(a.acabou); })[0];
    return { produto: p.produto, chave: k, compras: p.compras, quantidade: p.quantidade, gasto: Math.round(p.gasto * 100) / 100,
      duracaoMedia: media === null ? null : Math.round(media * 10) / 10, ultimaDuracao: ultima ? ultima.dias : null,
      ciclos: p.duracoes.length,
      custoDia: p.custosDia.length ? Math.round(p.custosDia.reduce(function (s, x) { return s + x; }, 0) / p.custosDia.length * 100) / 100 : null,
      emUso: p.emUso, aguardando: p.aguardando, ultimaCompra: p.ultimaCompra, ultimoPreco: p.ultimoPreco };
  }).sort(function (a, b) { return a.produto.localeCompare(b.produto); });

  // Em uso ha mais tempo que a media: provavel que esteja acabando (ou que esqueceram de apertar).
  const mediaDe = {}; consumo.forEach(function (c) { mediaDe[c.chave] = c.duracaoMedia; });
  itens.forEach(function (i) { i.duracaoMedia = mediaDe[i.chave]; i.passouDaMedia = i.situacao === 'EM_USO' && i.duracaoMedia && i.dias > i.duracaoMedia; });

  const listaLotes = Object.keys(lotes).map(function (k) { const l = lotes[k]; l.total = Math.round(l.total * 100) / 100; return l; })
    .sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
  return { lotes: listaLotes, itens: itens, consumo: consumo };
}

function itensDaCompra_(lista) {
  const itens = (lista || []).map(function (i) {
    return { PRODUTO: String(i.produto || '').trim(), QUANTIDADE: milOuVazio_(i.quantidade),
             UNIDADE: String(i.unidade || 'un').trim() || 'un', PRECO_UNIT: milOuVazio_(i.precoUnit) };
  }).filter(function (i) { return i.PRODUTO; });
  if (!itens.length) throw new Error('Inclua pelo menos um produto na compra.');
  itens.forEach(function (i) {
    if (!(i.QUANTIDADE > 0)) throw new Error('Informe a quantidade de "' + i.PRODUTO + '" (maior que zero).');
    if (i.PRECO_UNIT !== '' && !(i.PRECO_UNIT >= 0)) throw new Error('Preço inválido em "' + i.PRODUTO + '".');
  });
  return itens;
}

/*
 * Registra a compra e seus produtos. O reabastecimento e automatico: para
 * cada produto comprado, o item mais antigo do mesmo produto que ja acabou
 * e ainda esperava reposicao fica "reposto" por esta compra. `repoe` (ids)
 * escolhe os itens explicitamente (botao Reabastecer).
 */
function acaoSalvarLoteLimpeza(usuario, params) {
  const data = isoDe_(params.data) || paraISO(hoje());
  const tipo = String(params.tipo || 'LOTE').toUpperCase() === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'LOTE';
  const itens = itensDaCompra_(params.itens);
  if (tipo === 'INDIVIDUAL' && itens.length > 1) throw new Error('Compra individual tem um produto só. Para vários, registre um lote.');
  return comTrava(function () {
    const idLote = inserir('LP_LOTES', { DATA: data, TIPO: tipo, FORNECEDOR: String(params.fornecedor || '').trim(),
      NF: String(params.nf || '').trim(), OBSERVACAO: String(params.observacao || '').trim() }, usuario.email);
    inserirVarios('LP_ITENS', itens.map(function (i) {
      return Object.assign({ LOTE: idLote, INICIO: data, ACABOU_EM: '', REPOSTO_EM: '', REPOSTO_POR: '', OBSERVACAO: '' }, i);
    }), usuario.email);

    const pendentes = listar('LP_ITENS').filter(function (i) {
      return isoDe_(i.ACABOU_EM) && !isoDe_(i.REPOSTO_EM) && String(i.LOTE) !== String(idLote);
    }).sort(function (a, b) { return isoDe_(a.ACABOU_EM).localeCompare(isoDe_(b.ACABOU_EM)); });
    const escolhidos = [].concat(params.repoe || []).map(String);
    const repostos = [];
    itens.forEach(function (novo) {
      const k = chaveProdutoLp_(novo.PRODUTO);
      const alvo = pendentes.filter(function (p) {
        return repostos.indexOf(p.ID) === -1 && (escolhidos.length ? escolhidos.indexOf(String(p.ID)) !== -1 : chaveProdutoLp_(p.PRODUTO) === k);
      })[0];
      if (alvo) repostos.push(alvo.ID);
    });
    if (repostos.length) {
      atualizarVarios('LP_ITENS', repostos.map(function (id) { return { id: id, campos: { REPOSTO_EM: data, REPOSTO_POR: idLote } }; }), usuario.email);
    }
    return { ok: true, id: idLote, recado: (tipo === 'INDIVIDUAL' ? 'Compra individual' : 'Lote com ' + itens.length + ' produto(s)') +
      ' registrado' + (repostos.length ? ' · ' + repostos.length + ' reabastecimento(s) anotado(s)' : '') + '.' };
  });
}

function acaoExcluirLoteLimpeza(usuario, params) {
  return comTrava(function () {
    const lote = obter('LP_LOTES', params.id);
    if (!lote) throw new Error('Compra não encontrada.');
    const itens = listar('LP_ITENS').filter(function (i) { return String(i.LOTE) === String(params.id); });
    if (itens.some(function (i) { return isoDe_(i.ACABOU_EM); })) {
      throw new Error('Esta compra já tem produto marcado como acabado — o histórico de duração depende dela. Corrija o produto em vez de excluir a compra.');
    }
    // Quem esta compra tinha reabastecido volta a esperar reposicao.
    const repostos = listar('LP_ITENS').filter(function (i) { return String(i.REPOSTO_POR) === String(params.id); });
    if (repostos.length) atualizarVarios('LP_ITENS', repostos.map(function (i) { return { id: i.ID, campos: { REPOSTO_EM: '', REPOSTO_POR: '' } }; }), usuario.email);
    itens.forEach(function (i) { excluir('LP_ITENS', i.ID, usuario.email); });
    excluir('LP_LOTES', params.id, usuario.email);
    return { ok: true, recado: 'Compra excluída.' };
  });
}

function acaoAcabouItemLimpeza(usuario, params) {
  return comTrava(function () {
    const it = obter('LP_ITENS', params.id);
    if (!it) throw new Error('Produto não encontrado.');
    if (isoDe_(it.ACABOU_EM)) throw new Error('Este produto já estava marcado como acabado em ' + formatarData(paraData(isoDe_(it.ACABOU_EM))) + '.');
    const data = isoDe_(params.data) || paraISO(hoje());
    const inicio = isoDe_(it.INICIO);
    if (inicio && data < inicio) throw new Error('A data em que acabou é anterior à compra (' + formatarData(paraData(inicio)) + ').');
    atualizar('LP_ITENS', params.id, { ACABOU_EM: data, OBSERVACAO: String(params.observacao || it.OBSERVACAO || '').trim() }, usuario.email);
    const dias = inicio ? Math.max(1, diasEntre_(inicio, data)) : null;
    return { ok: true, recado: String(it.PRODUTO) + ' acabou' + (dias ? ' — durou ' + dias + ' dia(s)' : '') + '. Registre o reabastecimento quando chegar.' };
  });
}

/* Apertou "Acabou" por engano: volta para em uso (so se ainda nao foi reposto). */
function acaoVoltarItemLimpeza(usuario, params) {
  return comTrava(function () {
    const it = obter('LP_ITENS', params.id);
    if (!it) throw new Error('Produto não encontrado.');
    if (isoDe_(it.REPOSTO_EM)) throw new Error('Este produto já foi reabastecido; não dá para voltar.');
    atualizar('LP_ITENS', params.id, { ACABOU_EM: '' }, usuario.email);
    return { ok: true, recado: String(it.PRODUTO) + ' voltou para em uso.' };
  });
}

/* Reabastecer um produto que acabou com uma compra individual. */
function acaoReabastecerLimpeza(usuario, params) {
  const it = obter('LP_ITENS', params.id);
  if (!it) throw new Error('Produto não encontrado.');
  return acaoSalvarLoteLimpeza(usuario, {
    tipo: 'INDIVIDUAL', data: params.data, fornecedor: params.fornecedor, nf: params.nf, observacao: params.observacao,
    itens: [{ produto: it.PRODUTO, quantidade: params.quantidade, unidade: it.UNIDADE, precoUnit: params.precoUnit }],
    repoe: [it.ID]
  });
}

function dadosLimpeza(usuario, params) {
  const hojeIso = paraISO(hoje());
  const mes = /^\d{4}-\d{2}$/.test(String(params.mes || '')) ? params.mes : hojeIso.slice(0, 7);

  const acoes = acoesLimpeza_(hojeIso);
  const produtos = produtosLimpeza_();
  const embalagens = embalagensLimpeza_(produtos, hojeIso);
  const compras = comprasLimpeza_();
  const porLote = lotesLimpeza_(hojeIso);
  // Gasto do mes: compras por lote + compras do formato antigo.
  const gastoNoMes = function (k) {
    return somar(porLote.lotes.filter(function (l) { return (l.data || '').slice(0, 7) === k; }), 'total') +
           somar(compras.filter(function (c) { return (c.data || '').slice(0, 7) === k; }), 'total');
  };

  const somar = function (l, k) { return l.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); };
  const abertas = acoes.filter(function (a) { return a.aberta; });
  const doMes = acoes.filter(function (a) { return (a.data || '').slice(0, 7) === mes; });
  const concluidasMes = acoes.filter(function (a) { return a.status === 'Concluída' && (a.fechamento || '').slice(0, 7) === mes; });
  const comprasMes = compras.filter(function (c) { return (c.data || '').slice(0, 7) === mes; });

  // Compras dos ultimos 6 meses, para a tendencia.
  const meses = [];
  const base = paraData(mes + '-01');
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const k = paraISO(d).slice(0, 7);
    meses.push({ mes: k, total: Math.round(gastoNoMes(k) * 100) / 100 });
  }

  return {
    hoje: hojeIso,
    mes: mes,
    kpis: {
      abertas: abertas.length,
      atrasadas: abertas.filter(function (a) { return a.atrasada; }).length,
      altas: abertas.filter(function (a) { return a.criticidade === 'Alta'; }).length,
      abertasMes: doMes.length,
      deVistoria: doMes.filter(function (a) { return /VISTORIA/.test(normalizarTexto_(a.origem)); }).length,
      concluidasMes: concluidasMes.length,
      comprasMes: Math.round(gastoNoMes(mes) * 100) / 100,
      emUso: porLote.itens.filter(function (i) { return i.situacao === 'EM_USO'; }).length,
      aguardandoReposicao: porLote.itens.filter(function (i) { return i.situacao === 'AGUARDANDO'; }).length,
      custoPrevistoMes: somar(produtos.filter(function (p) { return p.ativo; }), 'custoMes'),
      custoAcoesMes: somar(doMes, 'custo'),
      embalagensAtrasadas: embalagens.filter(function (e) { return e.emUso && e.diasRestantes !== null && e.diasRestantes < 0; }).length
    },
    comprasPorMes: meses,
    acoes: acoes,
    produtos: produtos,
    embalagens: embalagens,
    compras: compras,
    lotes: porLote.lotes,
    itens: porLote.itens,
    consumo: porLote.consumo,
    zonas: zonasLimpeza_(),
    listas: {
      status: LP_STATUS, origens: LP_ORIGENS, criticidades: LP_CRITICIDADES,
      tipos: LP_TIPOS_PRODUTO, responsaveis: LP_RESPONSAVEIS, turnos: ['A', 'B', 'C', 'ADM']
    },
    permissoes: { gerir: podeFazer(usuario, 'GERIR_LIMPEZA') }
  };
}

/* ------------------------------------------------------------------ */
/* ACOES                                                               */
/* ------------------------------------------------------------------ */

function acaoSalvarAcaoLimpeza(usuario, params) {
  const campos = {
    DATA: isoDe_(params.data) || paraISO(hoje()),
    TURNO: String(params.turno || '').toUpperCase().trim(),
    ORIGEM: String(params.origem || 'Vistoria setorial').trim(),
    ZONA: String(params.zona || '').trim(),
    LOCAL: String(params.local || '').trim(),
    PROBLEMA: String(params.problema || '').trim(),
    CRITICIDADE: critLimpeza_(params.criticidade),
    ACAO: String(params.acao || '').trim(),
    RESPONSAVEL: String(params.responsavel || '').trim(),
    PRAZO: isoDe_(params.prazo),
    STATUS: statusLimpeza_(params.status),
    EVIDENCIA: String(params.evidencia || '').trim(),
    CUSTO: milOuVazio_(params.custo)
  };
  if (!campos.PROBLEMA) throw new Error('Descreva o que foi encontrado.');
  if (!campos.ACAO) throw new Error('Defina a ação que resolve o problema.');
  if (campos.STATUS !== 'Concluída' && campos.STATUS !== 'Cancelada') campos.FECHAMENTO = '';
  conferirFechamento_(campos.DATA, isoDe_(params.fechamento));

  if (!params.id) {
    // Acao registrada ja resolvida: sem data de conclusao informada, vale a
    // data da propria acao (antes virava "hoje" — 45 dias "em aberto" para
    // algo resolvido na hora, e contado como concluido no mes errado).
    if (campos.STATUS === 'Concluída') campos.FECHAMENTO = isoDe_(params.fechamento) || campos.DATA;
    return { ok: true, id: inserir('LP_ACOES', campos, usuario.email) };
  }
  return comTrava(function () {
    /*
     * Editar uma acao JA concluida (corrigir o texto, pôr a evidencia) nao
     * mexe no fechamento: o formulario nem tem esse campo, e antes a data
     * virava "hoje" — dias em aberto e "concluidas no mes" mudavam sozinhos.
     * O fechamento so nasce quando a acao PASSA a concluida.
     */
    if (campos.STATUS === 'Concluída') {
      const antes = obter('LP_ACOES', params.id);
      if (!antes) throw new Error('Ação não encontrada.');
      const informado = isoDe_(params.fechamento);
      const jaFechada = statusLimpeza_(antes.STATUS) === 'Concluída' && isoDe_(antes.FECHAMENTO);
      if (informado) campos.FECHAMENTO = informado;
      else if (!jaFechada) campos.FECHAMENTO = paraISO(hoje());
    }
    return atualizar('LP_ACOES', params.id, campos, usuario.email);
  });
}

function acaoConcluirAcaoLimpeza(usuario, params) {
  const campos = { STATUS: 'Concluída', FECHAMENTO: isoDe_(params.fechamento) || paraISO(hoje()) };
  if (params.evidencia) campos.EVIDENCIA = String(params.evidencia).trim();
  if (numMilhar_(params.custo) !== null) campos.CUSTO = numMilhar_(params.custo);
  // A situacao e conferida na hora de gravar: a tela pode estar velha.
  return comTrava(function () {
    const a = obter('LP_ACOES', params.id);
    if (!a) throw new Error('Ação não encontrada.');
    conferirFechamento_(isoDe_(a.DATA), campos.FECHAMENTO);
    const status = statusLimpeza_(a.STATUS);
    if (status === 'Cancelada') throw new Error('Esta ação foi cancelada. Para concluir, edite e reabra antes.');
    if (status === 'Concluída') throw new Error('Esta ação já foi concluída' +
      (isoDe_(a.FECHAMENTO) ? ' em ' + formatarData(paraData(isoDe_(a.FECHAMENTO))) : '') + '.');
    return atualizar('LP_ACOES', params.id, campos, usuario.email);
  });
}

function acaoExcluirAcaoLimpeza(usuario, params) { return excluir('LP_ACOES', params.id, usuario.email); }

/*
 * Comentar uma acao da Limpeza (4.2.2): o que avancou, a situacao em que
 * ficou (Aberta, Em andamento ou Concluida) e o que falta para concluir.
 * Vira o historico da acao ate a conclusao.
 */
function acaoComentarAcaoLimpeza(usuario, params) {
  const texto = String(params.texto || '').trim();
  const depende = String(params.depende || '').trim();
  if (!texto) throw new Error('Escreva o comentário: o que avançou, o que foi feito.');
  const novo = params.situacao ? statusLimpeza_(params.situacao) : '';
  return comTrava(function () {
    const a = obter('LP_ACOES', params.id);
    if (!a) throw new Error('Ação não encontrada.');
    const atual = statusLimpeza_(a.STATUS);
    if (atual === 'Cancelada') throw new Error('Esta ação foi cancelada. Para continuar, edite e reabra antes.');
    const campos = {};
    if (novo && novo !== 'Cancelada' && novo !== atual) {
      campos.STATUS = novo;
      if (novo === 'Concluída') {
        campos.FECHAMENTO = paraISO(hoje());
        conferirFechamento_(isoDe_(a.DATA), campos.FECHAMENTO);
      } else if (atual === 'Concluída') campos.FECHAMENTO = '';
    }
    campos.DEPENDE = (novo || atual) === 'Concluída' ? '' : depende;
    gravarComentario_(usuario, 'LP_ACOES', String(params.id), texto, novo || atual, campos.DEPENDE);
    atualizar('LP_ACOES', params.id, campos, usuario.email);
    return { ok: true, recado: campos.STATUS === 'Concluída' ? 'Comentário registrado e ação concluída.' : 'Comentário registrado.' };
  });
}

/* Conclusao antes da data da acao dava "dias em aberto" negativo. */
function conferirFechamento_(dataIso, fechamentoIso) {
  if (dataIso && fechamentoIso && fechamentoIso < dataIso) {
    throw new Error('A data de conclusão (' + formatarData(paraData(fechamentoIso)) +
      ') é anterior à data da ação (' + formatarData(paraData(dataIso)) + ').');
  }
}

/* ------------------------------------------------------------------ */
/* CUSTOS                                                              */
/* ------------------------------------------------------------------ */

function nOuVazio_(v) { const n = num_(v); return n === null ? '' : n; }
function milOuVazio_(v) { const n = numMilhar_(v); return n === null ? '' : n; }

function acaoSalvarProduto(usuario, params) {
  const campos = {
    PRODUTO: String(params.produto || '').trim(),
    TIPO: normalizarTexto_(params.tipo).indexOf('PRONTO') === 0 ? 'Pronto uso' : 'Concentrado',
    EMBALAGEM_ML: milOuVazio_(params.embalagemMl), PRECO: milOuVazio_(params.preco),
    DILUICAO_ML_L: nOuVazio_(params.diluicao), SOLUCAO_L: nOuVazio_(params.solucaoL),
    APLICACOES_DIA: nOuVazio_(params.aplicacoesDia), ONDE: String(params.onde || '').trim(),
    ATIVO: params.ativo === false ? 'NAO' : 'SIM'
  };
  if (!campos.PRODUTO) throw new Error('Informe o nome do produto.');
  return comTrava(function () {
    // Editar tambem confere o nome (antes so o cadastro novo conferia, e dava
    // para ter dois "Detergente Neutro 5L").
    const repetido = produtosLimpeza_().some(function (p) {
      return p.id !== params.id && p.produto.toLowerCase() === campos.PRODUTO.toLowerCase();
    });
    if (repetido) throw new Error('Esse produto já está cadastrado.');
    if (!params.id) return { ok: true, id: inserir('LP_PRODUTOS', campos, usuario.email) };
    const antes = obter('LP_PRODUTOS', params.id);
    if (!antes) throw new Error('Produto não encontrado.');
    const nomeAntes = String(antes.PRODUTO || '').trim();
    const r = atualizar('LP_PRODUTOS', params.id, campos, usuario.email);
    /*
     * Renomeou: embalagens e compras vao junto (como o codigo do nobreak vai
     * para as leituras). Antes elas ficavam orfas — sem "deve render ate" e
     * fora da conta de embalagens atrasadas.
     */
    if (nomeAntes && nomeAntes !== campos.PRODUTO) {
      ['LP_EMBALAGENS', 'LP_COMPRAS'].forEach(function (tb) {
        const muda = listar(tb).filter(function (x) {
          return String(x.PRODUTO || '').trim().toLowerCase() === nomeAntes.toLowerCase();
        }).map(function (x) { return { id: x.ID, campos: { PRODUTO: campos.PRODUTO } }; });
        if (muda.length) atualizarVarios(tb, muda, usuario.email);
      });
    }
    return r;
  });
}

function acaoExcluirProduto(usuario, params) { return excluir('LP_PRODUTOS', params.id, usuario.email); }

/*
 * Compra. Se `abrirEmbalagens` vier marcado, cada embalagem comprada ja
 * entra como embalagem aberta na data informada — o atalho para quem
 * compra e ja poe em uso.
 */
function acaoSalvarCompra(usuario, params) {
  const campos = {
    DATA: isoDe_(params.data) || paraISO(hoje()),
    PRODUTO: String(params.produto || '').trim(),
    QUANTIDADE: milOuVazio_(params.quantidade), PRECO_UNIT: milOuVazio_(params.precoUnit),
    FORNECEDOR: String(params.fornecedor || '').trim(), NF: String(params.nf || '').trim(),
    OBSERVACAO: String(params.observacao || '').trim()
  };
  if (!campos.PRODUTO) throw new Error('Informe o produto ou insumo.');
  // Quantidade ou preco zero/negativo desinflava as "compras do mes".
  if (!(campos.QUANTIDADE > 0)) throw new Error('Informe a quantidade de embalagens (maior que zero).');
  if (campos.PRECO_UNIT !== '' && !(campos.PRECO_UNIT > 0)) throw new Error('O preço unitário precisa ser maior que zero.');
  if (params.id) return atualizar('LP_COMPRAS', params.id, campos, usuario.email);
  const id = inserir('LP_COMPRAS', campos, usuario.email);
  if (params.abrirEmbalagem) {
    inserir('LP_EMBALAGENS', {
      PRODUTO: campos.PRODUTO, DATA_COMPRA: campos.DATA, NF: campos.NF, PRECO: campos.PRECO_UNIT,
      ABERTURA: isoDe_(params.abertura) || campos.DATA, TERMINO: '', OBSERVACAO: ''
    }, usuario.email);
  }
  return { ok: true, id: id };
}

function acaoExcluirCompra(usuario, params) { return excluir('LP_COMPRAS', params.id, usuario.email); }

function acaoSalvarEmbalagem(usuario, params) {
  const campos = {
    PRODUTO: String(params.produto || '').trim(),
    DATA_COMPRA: isoDe_(params.dataCompra), NF: String(params.nf || '').trim(),
    PRECO: milOuVazio_(params.preco), ABERTURA: isoDe_(params.abertura),
    TERMINO: isoDe_(params.termino), OBSERVACAO: String(params.observacao || '').trim()
  };
  if (!campos.PRODUTO) throw new Error('Escolha o produto.');
  if (!campos.ABERTURA) throw new Error('Informe a data em que a embalagem foi aberta.');
  if (campos.TERMINO && campos.TERMINO < campos.ABERTURA) throw new Error('O término não pode ser antes da abertura.');
  if (params.id) return atualizar('LP_EMBALAGENS', params.id, campos, usuario.email);
  return { ok: true, id: inserir('LP_EMBALAGENS', campos, usuario.email) };
}

function acaoExcluirEmbalagem(usuario, params) { return excluir('LP_EMBALAGENS', params.id, usuario.email); }

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
 * Traz: NAO CONFORMIDADES (vira Acoes), PRODUTOS, COMPRAS, RENDIMENTO
 * (vira Embalagens) e as zonas da aba CADASTROS. Nao duplica o que ja
 * foi importado (mesma data + local + problema; mesmo produto; mesma
 * compra). Registros e Resumo dos turnos ficam de fora — sairam do painel.
 */
function acaoImportarLimpeza(usuario, params) {
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
  const relato = { acoes: 0, produtos: 0, compras: 0, embalagens: 0, zonas: 0 };

  // Zonas
  const zonasTem = {};
  zonasLimpeza_().forEach(function (z) { zonasTem[z.zona] = true; });
  const novasZonas = [];
  ler(aba('CADASTROS'), 'ZONA').forEach(function (o) {
    const z = t(p(o, 'ZONA')).toUpperCase();
    if (!z || zonasTem[z] || !/^Z\d+/.test(z)) return;
    zonasTem[z] = true;
    novasZonas.push({ ZONA: z, DESCRICAO: t(p(o, 'DESCRICAO')), ATIVO: 'SIM' });
  });
  if (novasZonas.length) { inserirVarios('LP_ZONAS', novasZonas, usuario.email); relato.zonas = novasZonas.length; }

  // Acoes (NAO CONFORMIDADES)
  /*
   * Conta por chave (nao "ja vi / nao vi"): duas nao conformidades iguais no
   * mesmo dia e local (turno A resolveu, turno C ainda aberta) eram UMA — a
   * aberta sumia. Reimportar continua sem duplicar: pula enquanto a planilha
   * nao tiver mais linhas daquela chave do que o GSL ja tem.
   */
  const chaveAcao = function (data, turno, local, problema) {
    return [data, String(turno || '').toUpperCase().trim(), local, problema].join('|').toLowerCase();
  };
  const acoesTem = {};
  listar('LP_ACOES').forEach(function (a) {
    const k = chaveAcao(isoDe_(a.DATA), a.TURNO, t(a.LOCAL), t(a.PROBLEMA));
    acoesTem[k] = (acoesTem[k] || 0) + 1;
  });
  const acoesVistas = {};
  const novasAcoes = [];
  ler(aba('NAO CONFORMIDADES'), 'DATA').forEach(function (o) {
    const problema = t(p(o, 'O QUE FOI'));
    if (!problema) return;
    const data = isoDe_(p(o, 'DATA'));
    const k = chaveAcao(data, t(p(o, 'TURNO')), t(p(o, 'LOCAL')), problema);
    acoesVistas[k] = (acoesVistas[k] || 0) + 1;
    if (acoesVistas[k] <= (acoesTem[k] || 0)) return;
    const status = statusLimpeza_(p(o, 'STATUS'));
    novasAcoes.push({
      DATA: data, TURNO: t(p(o, 'TURNO')).toUpperCase(), ORIGEM: t(p(o, 'ORIGEM')) || 'Vistoria setorial',
      ZONA: t(p(o, 'ZONA')), LOCAL: t(p(o, 'LOCAL')), PROBLEMA: problema,
      CRITICIDADE: critLimpeza_(p(o, 'CRIT')), ACAO: t(p(o, 'ACAO')) || '(ação não registrada)',
      RESPONSAVEL: t(p(o, 'RESPONSAVEL')), PRAZO: isoDe_(p(o, 'PRAZO')), STATUS: status,
      FECHAMENTO: isoDe_(p(o, 'FECHAMENTO')), EVIDENCIA: t(p(o, 'EVIDENCIA')), CUSTO: ''
    });
  });
  if (novasAcoes.length) { inserirVarios('LP_ACOES', novasAcoes, usuario.email); relato.acoes = novasAcoes.length; }

  // Produtos
  const prodTem = {};
  produtosLimpeza_().forEach(function (x) { prodTem[x.produto.toLowerCase()] = true; });
  const novosProd = [];
  ler(aba('PRODUTOS'), 'PRODUTO').forEach(function (o) {
    const nome = t(p(o, 'PRODUTO'));
    if (!nome || prodTem[nome.toLowerCase()]) return;
    // Linhas de instrucao da planilha (texto comprido, sem numero nenhum) nao sao produto.
    if (nome.length > 60 || (num_(p(o, 'EMBALAGEM')) === null && num_(p(o, 'PRECO')) === null)) return;
    prodTem[nome.toLowerCase()] = true;
    novosProd.push({
      PRODUTO: nome, TIPO: normalizarTexto_(p(o, 'TIPO')).indexOf('PRONTO') === 0 ? 'Pronto uso' : 'Concentrado',
      EMBALAGEM_ML: nOuVazio_(p(o, 'EMBALAGEM')), PRECO: nOuVazio_(p(o, 'PRECO')),
      DILUICAO_ML_L: nOuVazio_(p(o, 'DILUICAO')), SOLUCAO_L: nOuVazio_(p(o, 'SOLUCAO POR')),
      APLICACOES_DIA: nOuVazio_(p(o, 'APLICACOES POR DIA')), ONDE: t(p(o, 'ONDE')), ATIVO: 'SIM'
    });
  });
  if (novosProd.length) { inserirVarios('LP_PRODUTOS', novosProd, usuario.email); relato.produtos = novosProd.length; }

  // Compras
  const compTem = {};
  const chaveComp = function (d, pr, nf, q, u) { return [d, pr, nf, q === '' || q === null ? '' : Number(q), u === '' || u === null ? '' : Number(u)].join('|').toLowerCase(); };
  comprasLimpeza_().forEach(function (c) { const k = chaveComp(c.data, c.produto, c.nf, c.quantidade, c.precoUnit); compTem[k] = (compTem[k] || 0) + 1; });
  const compVistas = {};
  const novasComp = [];
  ler(aba('COMPRAS'), 'DATA').forEach(function (o) {
    const prod = t(p(o, 'PRODUTO'));
    const data = isoDe_(p(o, 'DATA'));
    if (!prod || !data) return;
    const k = chaveComp(data, prod, t(p(o, 'NF')), nOuVazio_(p(o, 'QUANTIDADE')), nOuVazio_(p(o, 'PRECO UNIT')));
    compVistas[k] = (compVistas[k] || 0) + 1;
    if (compVistas[k] <= (compTem[k] || 0)) return;
    novasComp.push({ DATA: data, PRODUTO: prod, QUANTIDADE: nOuVazio_(p(o, 'QUANTIDADE')),
      PRECO_UNIT: nOuVazio_(p(o, 'PRECO UNIT')), FORNECEDOR: t(p(o, 'FORNECEDOR')), NF: t(p(o, 'NF')),
      OBSERVACAO: t(p(o, 'OBSERVACAO')) });
  });
  if (novasComp.length) { inserirVarios('LP_COMPRAS', novasComp, usuario.email); relato.compras = novasComp.length; }

  // Embalagens (RENDIMENTO)
  const embTem = {};
  listar('LP_EMBALAGENS').forEach(function (e) { const k = (t(e.PRODUTO) + '|' + isoDe_(e.ABERTURA)).toLowerCase(); embTem[k] = (embTem[k] || 0) + 1; });
  const embVistas = {};
  const novasEmb = [];
  ler(aba('RENDIMENTO'), 'PRODUTO').forEach(function (o) {
    const prod = t(p(o, 'PRODUTO'));
    const abertura = isoDe_(p(o, 'DATA DE ABERTURA'));
    if (!prod || !abertura) return;
    const k = (prod + '|' + abertura).toLowerCase();
    embVistas[k] = (embVistas[k] || 0) + 1;
    if (embVistas[k] <= (embTem[k] || 0)) return;
    novasEmb.push({ PRODUTO: prod, DATA_COMPRA: isoDe_(p(o, 'DATA DA COMPRA')), NF: t(p(o, 'NF')),
      PRECO: nOuVazio_(p(o, 'PRECO PAGO')), ABERTURA: abertura, TERMINO: isoDe_(p(o, 'DATA REAL')),
      OBSERVACAO: t(p(o, 'CAUSA')) });
  });
  if (novasEmb.length) { inserirVarios('LP_EMBALAGENS', novasEmb, usuario.email); relato.embalagens = novasEmb.length; }

  return { ok: true, relato: relato, recado: 'Importado: ' + relato.acoes + ' ação(ões), ' + relato.produtos +
    ' produto(s), ' + relato.compras + ' compra(s), ' + relato.embalagens + ' embalagem(ns) e ' +
    relato.zonas + ' zona(s).' };
}
