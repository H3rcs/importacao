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

function dadosLimpeza(usuario, params) {
  const hojeIso = paraISO(hoje());
  const mes = /^\d{4}-\d{2}$/.test(String(params.mes || '')) ? params.mes : hojeIso.slice(0, 7);

  const acoes = acoesLimpeza_(hojeIso);
  const produtos = produtosLimpeza_();
  const embalagens = embalagensLimpeza_(produtos, hojeIso);
  const compras = comprasLimpeza_();

  const abertas = acoes.filter(function (a) { return a.aberta; });
  const doMes = acoes.filter(function (a) { return (a.data || '').slice(0, 7) === mes; });
  const concluidasMes = acoes.filter(function (a) { return a.status === 'Concluída' && (a.fechamento || '').slice(0, 7) === mes; });
  const comprasMes = compras.filter(function (c) { return (c.data || '').slice(0, 7) === mes; });
  const somar = function (l, k) { return l.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); };

  // Compras dos ultimos 6 meses, para a tendencia.
  const meses = [];
  const base = paraData(mes + '-01');
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const k = paraISO(d).slice(0, 7);
    meses.push({ mes: k, total: somar(compras.filter(function (c) { return (c.data || '').slice(0, 7) === k; }), 'total') });
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
      comprasMes: somar(comprasMes, 'total'),
      custoPrevistoMes: somar(produtos.filter(function (p) { return p.ativo; }), 'custoMes'),
      custoAcoesMes: somar(doMes, 'custo'),
      embalagensAtrasadas: embalagens.filter(function (e) { return e.emUso && e.diasRestantes !== null && e.diasRestantes < 0; }).length
    },
    comprasPorMes: meses,
    acoes: acoes,
    produtos: produtos,
    embalagens: embalagens,
    compras: compras,
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
    CUSTO: num_(params.custo) === null ? '' : num_(params.custo)
  };
  if (!campos.PROBLEMA) throw new Error('Descreva o que foi encontrado.');
  if (!campos.ACAO) throw new Error('Defina a ação que resolve o problema.');
  if (campos.STATUS !== 'Concluída' && campos.STATUS !== 'Cancelada') campos.FECHAMENTO = '';

  if (!params.id) {
    if (campos.STATUS === 'Concluída') campos.FECHAMENTO = isoDe_(params.fechamento) || paraISO(hoje());
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
  if (num_(params.custo) !== null) campos.CUSTO = num_(params.custo);
  // A situacao e conferida na hora de gravar: a tela pode estar velha.
  return comTrava(function () {
    const a = obter('LP_ACOES', params.id);
    if (!a) throw new Error('Ação não encontrada.');
    const status = statusLimpeza_(a.STATUS);
    if (status === 'Cancelada') throw new Error('Esta ação foi cancelada. Para concluir, edite e reabra antes.');
    if (status === 'Concluída') throw new Error('Esta ação já foi concluída' +
      (isoDe_(a.FECHAMENTO) ? ' em ' + formatarData(paraData(isoDe_(a.FECHAMENTO))) : '') + '.');
    return atualizar('LP_ACOES', params.id, campos, usuario.email);
  });
}

function acaoExcluirAcaoLimpeza(usuario, params) { return excluir('LP_ACOES', params.id, usuario.email); }

/* ------------------------------------------------------------------ */
/* CUSTOS                                                              */
/* ------------------------------------------------------------------ */

function nOuVazio_(v) { const n = num_(v); return n === null ? '' : n; }

function acaoSalvarProduto(usuario, params) {
  const campos = {
    PRODUTO: String(params.produto || '').trim(),
    TIPO: normalizarTexto_(params.tipo).indexOf('PRONTO') === 0 ? 'Pronto uso' : 'Concentrado',
    EMBALAGEM_ML: nOuVazio_(params.embalagemMl), PRECO: nOuVazio_(params.preco),
    DILUICAO_ML_L: nOuVazio_(params.diluicao), SOLUCAO_L: nOuVazio_(params.solucaoL),
    APLICACOES_DIA: nOuVazio_(params.aplicacoesDia), ONDE: String(params.onde || '').trim(),
    ATIVO: params.ativo === false ? 'NAO' : 'SIM'
  };
  if (!campos.PRODUTO) throw new Error('Informe o nome do produto.');
  if (params.id) return atualizar('LP_PRODUTOS', params.id, campos, usuario.email);
  const repetido = produtosLimpeza_().some(function (p) { return p.produto.toLowerCase() === campos.PRODUTO.toLowerCase(); });
  if (repetido) throw new Error('Esse produto já está cadastrado.');
  return { ok: true, id: inserir('LP_PRODUTOS', campos, usuario.email) };
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
    QUANTIDADE: nOuVazio_(params.quantidade), PRECO_UNIT: nOuVazio_(params.precoUnit),
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
    PRECO: nOuVazio_(params.preco), ABERTURA: isoDe_(params.abertura),
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
  const acoesTem = {};
  listar('LP_ACOES').forEach(function (a) {
    acoesTem[(isoDe_(a.DATA) + '|' + t(a.LOCAL) + '|' + t(a.PROBLEMA)).toLowerCase()] = true;
  });
  const novasAcoes = [];
  ler(aba('NAO CONFORMIDADES'), 'DATA').forEach(function (o) {
    const problema = t(p(o, 'O QUE FOI'));
    if (!problema) return;
    const data = isoDe_(p(o, 'DATA'));
    const k = (data + '|' + t(p(o, 'LOCAL')) + '|' + problema).toLowerCase();
    if (acoesTem[k]) return;
    acoesTem[k] = true;
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
  comprasLimpeza_().forEach(function (c) { compTem[(c.data + '|' + c.produto + '|' + c.nf).toLowerCase()] = true; });
  const novasComp = [];
  ler(aba('COMPRAS'), 'DATA').forEach(function (o) {
    const prod = t(p(o, 'PRODUTO'));
    const data = isoDe_(p(o, 'DATA'));
    if (!prod || !data) return;
    const k = (data + '|' + prod + '|' + t(p(o, 'NF'))).toLowerCase();
    if (compTem[k]) return;
    compTem[k] = true;
    novasComp.push({ DATA: data, PRODUTO: prod, QUANTIDADE: nOuVazio_(p(o, 'QUANTIDADE')),
      PRECO_UNIT: nOuVazio_(p(o, 'PRECO UNIT')), FORNECEDOR: t(p(o, 'FORNECEDOR')), NF: t(p(o, 'NF')),
      OBSERVACAO: t(p(o, 'OBSERVACAO')) });
  });
  if (novasComp.length) { inserirVarios('LP_COMPRAS', novasComp, usuario.email); relato.compras = novasComp.length; }

  // Embalagens (RENDIMENTO)
  const embTem = {};
  listar('LP_EMBALAGENS').forEach(function (e) { embTem[(t(e.PRODUTO) + '|' + isoDe_(e.ABERTURA)).toLowerCase()] = true; });
  const novasEmb = [];
  ler(aba('RENDIMENTO'), 'PRODUTO').forEach(function (o) {
    const prod = t(p(o, 'PRODUTO'));
    const abertura = isoDe_(p(o, 'DATA DE ABERTURA'));
    if (!prod || !abertura) return;
    const k = (prod + '|' + abertura).toLowerCase();
    if (embTem[k]) return;
    embTem[k] = true;
    novasEmb.push({ PRODUTO: prod, DATA_COMPRA: isoDe_(p(o, 'DATA DA COMPRA')), NF: t(p(o, 'NF')),
      PRECO: nOuVazio_(p(o, 'PRECO PAGO')), ABERTURA: abertura, TERMINO: isoDe_(p(o, 'DATA REAL')),
      OBSERVACAO: t(p(o, 'CAUSA')) });
  });
  if (novasEmb.length) { inserirVarios('LP_EMBALAGENS', novasEmb, usuario.email); relato.embalagens = novasEmb.length; }

  return { ok: true, relato: relato, recado: 'Importado: ' + relato.acoes + ' ação(ões), ' + relato.produtos +
    ' produto(s), ' + relato.compras + ' compra(s), ' + relato.embalagens + ' embalagem(ns) e ' +
    relato.zonas + ' zona(s).' };
}
