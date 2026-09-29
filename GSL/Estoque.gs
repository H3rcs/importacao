/**
 * ESTOQUE DE TI — itens de informatica do CD.
 *
 * Dois cadastros, nada mais:
 *   EST_ITENS      o catalogo: o que existe (mouse, teclado, toner, SSD...)
 *   EST_MOVIMENTOS tudo que entrou, saiu, voltou, foi ajustado ou baixado
 *
 * O saldo NAO e digitado: e a soma das movimentacoes. Assim o numero
 * sempre tem historia — da para saber de onde veio cada unidade e para
 * onde foi. Inventario (contagem fisica) vira um AJUSTE com a diferenca.
 *
 *   ENTRADA    compra, doacao, recebido de outra filial        (+)
 *   SAIDA      entregue para um setor ou pessoa                (-)
 *   DEVOLUCAO  voltou ao estoque (emprestimo, troca)           (+)
 *   BAIXA      descarte, defeito sem conserto, perda           (-)
 *   AJUSTE     correcao de inventario (guarda a diferenca)     (+/-)
 */

const EST_TIPOS = ['ENTRADA', 'SAIDA', 'DEVOLUCAO', 'BAIXA', 'AJUSTE'];
const EST_SINAL = { ENTRADA: 1, DEVOLUCAO: 1, SAIDA: -1, BAIXA: -1, AJUSTE: 1 };
const EST_NOMES_TIPO = { ENTRADA: 'Entrada', SAIDA: 'Saída', DEVOLUCAO: 'Devolução', BAIXA: 'Baixa', AJUSTE: 'Ajuste de inventário' };
const EST_CATEGORIAS = ['Computadores e notebooks', 'Monitores', 'Periféricos', 'Cabos e adaptadores', 'Rede',
  'Armazenamento', 'Impressão e toner', 'Energia e nobreak', 'Telefonia e coletores', 'Peças e componentes',
  'Acessórios', 'Outros'];
const EST_UNIDADES = ['un', 'cx', 'pct', 'm', 'rolo', 'kit', 'par'];
/*
 * Quanto de movimentacao viaja com a tela. Eram 400 dias: com uso normal
 * o payload passava de 900 KB. O historico COMPLETO de um item vem sob
 * demanda (acaoHistoricoItemEstoque), com saldo-base calculado aqui.
 */
const EST_DIAS_HISTORICO = 90;
const EST_HISTORICO_MAX = 1000;   // teto de linhas do historico de um item (o saldo-base cobre o resto)

function estNum_(v) { const n = num_(v); return n === null ? 0 : n; }

/* Onde o material de informatica e usado: no CD, na loja ou nos dois. */
const EST_USOS = ['CD', 'LOJA', 'CD/LOJA'];
function usoEstoque_(v) {
  const t = String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[E+&]/g, '/').replace(/\/+/g, '/');
  if (t === 'CD') return 'CD';
  if (t === 'LOJA') return 'LOJA';
  if (t.indexOf('CD') !== -1 && t.indexOf('LOJA') !== -1) return 'CD/LOJA';
  return '';
}
/* Soma de decimais (0,3 - 0,1 - 0,2) deixa resto de ponto flutuante: arredonda. */
function estArred_(n) { return Math.round(n * 1e6) / 1e6; }

/* CRIADO_EM ('dd/MM/yyyy HH:mm:ss') em ordem que se compara como texto. */
function criadoOrdenavel_(t) {
  const m = String(t || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] + ' ' + m[4] : String(t || '');
}

/* Mais recente primeiro: data do movimento e, no mesmo dia, a ordem de gravacao. */
function ordemMovimentoDesc_(a, b) {
  return (b.data + ' ' + criadoOrdenavel_(b.criado)).localeCompare(a.data + ' ' + criadoOrdenavel_(a.criado)) ||
    String(b.id).localeCompare(String(a.id));   // mesmo segundo: o ID carrega o milissegundo da gravacao
}

/* ID do lancamento que um estorno desfaz ('ESTORNO de EST-... (Saida de ...)'), comparado inteiro. */
function idEstornado_(observacao) {
  const m = /^ESTORNO de ([^\s(]+)/.exec(String(observacao || ''));
  return m ? m[1] : '';
}

function itensEstoque_() {
  return listar('EST_ITENS').map(function (i) {
    return {
      id: i.ID,
      codigo: String(i.CODIGO || '').toUpperCase().trim(),
      nome: String(i.NOME || '').trim(),
      categoria: String(i.CATEGORIA || '').trim() || 'Outros',
      marca: String(i.MARCA || '').trim(),
      modelo: String(i.MODELO || '').trim(),
      unidade: String(i.UNIDADE || 'un').trim() || 'un',
      minimo: estNum_(i.ESTOQUE_MINIMO),
      ideal: estNum_(i.ESTOQUE_IDEAL),
      uso: usoEstoque_(i.USO),
      local: String(i.LOCAL || '').trim(),
      observacao: String(i.OBSERVACAO || '').trim(),
      ativo: String(i.ATIVO || 'SIM').trim() === '' || marcado(i.ATIVO)
    };
  }).filter(function (i) { return i.codigo || i.nome; });
}

function movimentosEstoque_() {
  return listar('EST_MOVIMENTOS').map(function (m) {
    const tipo = String(m.TIPO || '').toUpperCase().trim();
    const qtd = estNum_(m.QUANTIDADE);
    return {
      id: m.ID,
      data: isoDe_(m.DATA),
      tipo: tipo,
      item: String(m.ITEM || '').toUpperCase().trim(),
      quantidade: qtd,
      efeito: (EST_SINAL[tipo] || 0) * qtd,
      destino: String(m.DESTINO || '').trim(),
      solicitante: String(m.SOLICITANTE || '').trim(),
      documento: String(m.DOCUMENTO || '').trim(),
      serie: String(m.SERIE || '').trim(),
      observacao: String(m.OBSERVACAO || '').trim(),
      por: String(m.REGISTRADO_POR || m.CRIADO_POR || '').trim(),
      criado: String(m.CRIADO_EM || '')
    };
  }).filter(function (m) { return m.item && EST_TIPOS.indexOf(m.tipo) !== -1; });
}

/** Saldo de cada item, somando todas as movimentacoes. */
function saldosEstoque_(movs) {
  const s = {};
  (movs || movimentosEstoque_()).forEach(function (m) { s[m.item] = (s[m.item] || 0) + m.efeito; });
  Object.keys(s).forEach(function (k) { s[k] = estArred_(s[k]); });
  return s;
}

function dadosEstoque(usuario, params) {
  const hojeIso = paraISO(hoje());
  const itens = itensEstoque_();
  const movs = movimentosEstoque_();
  const saldo = saldosEstoque_(movs);
  const ultimaSaida = {}, ultimaEntrada = {};
  movs.forEach(function (m) {
    if (m.tipo === 'SAIDA' && (!ultimaSaida[m.item] || m.data > ultimaSaida[m.item])) ultimaSaida[m.item] = m.data;
    if (m.tipo === 'ENTRADA' && (!ultimaEntrada[m.item] || m.data > ultimaEntrada[m.item])) ultimaEntrada[m.item] = m.data;
  });

  itens.forEach(function (i) {
    i.saldo = saldo[i.codigo] || 0;
    // Quanto falta para chegar ao estoque ideal (0 = esta no ideal ou acima).
    i.faltaIdeal = i.ideal && i.saldo < i.ideal ? estArred_(i.ideal - Math.max(0, i.saldo)) : 0;
    i.ultimaSaida = ultimaSaida[i.codigo] || '';
    i.ultimaEntrada = ultimaEntrada[i.codigo] || '';
    i.situacao = !i.ativo ? 'INATIVO' : (i.saldo <= 0 ? 'ZERADO' : (i.minimo && i.saldo <= i.minimo ? 'REPOR' : 'OK'));
  });
  itens.sort(function (a, b) { return a.nome.localeCompare(b.nome); });

  // Movimentacao de item que nao existe mais no catalogo continua visivel.
  const conhecidos = {};
  itens.forEach(function (i) { conhecidos[i.codigo] = i; });

  const h = hoje();
  const desde = paraISO(new Date(h.getFullYear(), h.getMonth(), h.getDate() - EST_DIAS_HISTORICO));
  const recentes = movs.filter(function (m) { return !m.data || m.data >= desde; }).sort(ordemMovimentoDesc_);
  // Lancamento ja estornado: fora das contas do mes na tela e sem o botao Estornar.
  const estornados = {};
  movs.forEach(function (m) { const x = idEstornado_(m.observacao); if (x) estornados[x] = true; });
  recentes.forEach(function (m) { m.estornado = !!estornados[m.id]; });

  const categorias = {};
  EST_CATEGORIAS.forEach(function (c) { categorias[c] = true; });
  itens.forEach(function (i) { categorias[i.categoria] = true; });
  const destinos = {};
  movs.forEach(function (m) { if (m.destino) destinos[m.destino] = true; });

  return {
    hoje: hojeIso,
    itens: itens,
    movimentos: recentes,
    diasMovimentos: EST_DIAS_HISTORICO,
    totalMovimentos: movs.length,
    listas: {
      tipos: EST_TIPOS.map(function (t) { return { id: t, nome: EST_NOMES_TIPO[t] }; }),
      categorias: Object.keys(categorias).sort(),
      unidades: EST_UNIDADES,
      usos: EST_USOS,
      destinos: Object.keys(destinos).sort()
    },
    permissoes: {
      cadastrar: podeFazer(usuario, 'GERIR_ESTOQUE'),
      movimentar: podeFazer(usuario, 'MOVIMENTAR_ESTOQUE')
    }
  };
}

/* ------------------------------------------------------------------ */
/* CADASTRO DE ITENS                                                   */
/* ------------------------------------------------------------------ */

function camposItem_(p) {
  return {
    CODIGO: codigoLimpo_(p.codigo),
    NOME: String(p.nome || '').trim(),
    CATEGORIA: String(p.categoria || '').trim() || 'Outros',
    MARCA: String(p.marca || '').trim(),
    MODELO: String(p.modelo || '').trim(),
    UNIDADE: String(p.unidade || 'un').trim() || 'un',
    ESTOQUE_MINIMO: num_(p.minimo) === null ? '' : num_(p.minimo),
    ESTOQUE_IDEAL: num_(p.ideal) === null ? '' : num_(p.ideal),
    USO: usoEstoque_(p.uso),
    LOCAL: String(p.local || '').trim(),
    OBSERVACAO: String(p.observacao || '').trim(),
    ATIVO: p.ativo === false ? 'NAO' : 'SIM'
  };
}

/* Codigo automatico: TI-0001, TI-0002... quando a pessoa nao informa. */
function proximoCodigoEstoque_(itens) {
  let maior = 0;
  itens.forEach(function (i) {
    const m = String(i.codigo).match(/^TI-(\d+)$/);
    if (m) maior = Math.max(maior, Number(m[1]));
  });
  return 'TI-' + String(maior + 1).padStart(4, '0');
}

function acaoSalvarItemEstoque(usuario, params) {
  const campos = camposItem_(params);
  if (!campos.NOME) throw new Error('Informe o nome do item (ex.: Mouse USB).');
  if (campos.ESTOQUE_IDEAL !== '' && campos.ESTOQUE_MINIMO !== '' && campos.ESTOQUE_IDEAL < campos.ESTOQUE_MINIMO) {
    throw new Error('O estoque ideal (' + campos.ESTOQUE_IDEAL + ') não pode ser menor que o mínimo (' + campos.ESTOQUE_MINIMO + ').');
  }
  if (String(params.codigo || '').trim() && !campos.CODIGO) {
    throw new Error('Código inválido: use só letras, números, ponto, hífen ou sublinhado (ex.: TI-0001).');
  }

  /*
   * Codigo reservado e conferido DENTRO da trava. Fora dela, dois cadastros
   * ao mesmo tempo liam a mesma lista e saiam os dois com o mesmo TI-####
   * — e o saldo, que e somado por codigo, passava a ser dos dois.
   */
  return comTrava(function () {
    const itens = itensEstoque_();
    const antes = params.id ? itens.filter(function (i) { return i.id === params.id; })[0] : null;
    if (params.id && !antes) throw new Error('Item não encontrado.');
    if (!campos.CODIGO) campos.CODIGO = (antes && antes.codigo) || proximoCodigoEstoque_(itens);
    const repetido = itens.filter(function (i) { return i.codigo === campos.CODIGO && i.id !== params.id; })[0];
    if (repetido) throw new Error('Já existe um item com o código ' + campos.CODIGO + ' (' + repetido.nome + ').');

    if (antes) {
      const r = atualizar('EST_ITENS', params.id, campos, usuario.email);
      // Codigo trocado: o historico acompanha — na mesma trava, para nao sobrar movimento orfao.
      if (antes.codigo && antes.codigo !== campos.CODIGO) {
        const mud = listar('EST_MOVIMENTOS').filter(function (m) { return String(m.ITEM || '').toUpperCase().trim() === antes.codigo; })
          .map(function (m) { return { id: m.ID, campos: { ITEM: campos.CODIGO } }; });
        if (mud.length) atualizarVarios('EST_MOVIMENTOS', mud, usuario.email);
      }
      return r;
    }
    const id = inserir('EST_ITENS', campos, usuario.email);
    // Saldo inicial opcional: vira uma ENTRADA, para o numero ter origem.
    const inicial = num_(params.saldoInicial);
    if (inicial && inicial > 0) {
      inserir('EST_MOVIMENTOS', { DATA: paraISO(hoje()), TIPO: 'ENTRADA', ITEM: campos.CODIGO, QUANTIDADE: inicial,
        DESTINO: '', SOLICITANTE: '', DOCUMENTO: '', SERIE: '', OBSERVACAO: 'Saldo inicial do cadastro',
        REGISTRADO_POR: usuario.email }, usuario.email);
    }
    return { ok: true, id: id, codigo: campos.CODIGO, recado: 'Item ' + campos.CODIGO + ' cadastrado.' };
  });
}

function acaoExcluirItemEstoque(usuario, params) {
  const item = itensEstoque_().filter(function (i) { return i.id === params.id; })[0];
  if (!item) throw new Error('Item não encontrado.');
  const temHistorico = movimentosEstoque_().some(function (m) { return m.item === item.codigo; });
  if (temHistorico) {
    // Com historico nao apaga: desativa. O historico continua consultavel.
    atualizar('EST_ITENS', params.id, { ATIVO: 'NAO' }, usuario.email);
    return { ok: true, recado: 'O item tem movimentações, então foi desativado em vez de apagado.' };
  }
  return excluir('EST_ITENS', params.id, usuario.email);
}

/*
 * CADASTRO EM LOTE — colar da planilha.
 * Uma linha por item, colunas separadas por TAB (o que o Excel/Planilhas
 * copia) ou ponto e virgula, nesta ordem:
 *   nome | categoria | marca | modelo | unidade | minimo | local | saldo inicial | codigo | uso (CD/LOJA) | ideal
 * So o nome e obrigatorio. Linha de cabecalho e ignorada.
 */
function acaoImportarItensEstoque(usuario, params) {
  const texto = String(params.texto || '');
  if (!texto.trim()) throw new Error('Cole as linhas da planilha.');
  // Lista lida, codigos gerados e gravacao na mesma trava (ver acaoSalvarItemEstoque).
  return comTrava(function () {
    const itens = itensEstoque_();
    const porCodigo = {}, porNome = {};
    itens.forEach(function (i) { porCodigo[i.codigo] = i; porNome[i.nome.toLowerCase()] = i; });

    const novos = [], entradas = [], ignoradas = [];
    let proximo = Number((proximoCodigoEstoque_(itens).match(/\d+/) || ['1'])[0]);
    texto.split(/\r?\n/).forEach(function (linha, n) {
      if (!linha.trim()) return;
      const c = linha.split(linha.indexOf('\t') !== -1 ? '\t' : ';').map(function (x) { return String(x).trim(); });
      const nome = c[0] || '';
      if (!nome || /^(nome|item|produto|descri)/i.test(nome)) return;   // cabecalho
      if (porNome[nome.toLowerCase()]) { ignoradas.push(nome + ' (já existe)'); return; }
      let codigo = codigoLimpo_(c[8]);
      if (c[8] && !codigo) { ignoradas.push(nome + ' (código inválido)'); return; }
      if (!codigo) { codigo = 'TI-' + String(proximo).padStart(4, '0'); proximo++; }
      if (porCodigo[codigo]) { ignoradas.push(nome + ' (código ' + codigo + ' já existe)'); return; }
      const campos = camposItem_({ codigo: codigo, nome: nome, categoria: c[1], marca: c[2], modelo: c[3],
        unidade: c[4], minimo: c[5], local: c[6], uso: c[9], ideal: c[10] });
      novos.push(campos);
      porCodigo[codigo] = true; porNome[nome.toLowerCase()] = true;
      const saldo = num_(c[7]);
      if (saldo && saldo > 0) entradas.push({ DATA: paraISO(hoje()), TIPO: 'ENTRADA', ITEM: codigo, QUANTIDADE: saldo,
        DESTINO: '', SOLICITANTE: '', DOCUMENTO: '', SERIE: '', OBSERVACAO: 'Saldo inicial (cadastro em lote)',
        REGISTRADO_POR: usuario.email });
    });
    if (!novos.length) throw new Error('Nenhum item novo encontrado.' + (ignoradas.length ? ' Ignorados: ' + ignoradas.join(', ') : ''));
    inserirVarios('EST_ITENS', novos, usuario.email);
    if (entradas.length) inserirVarios('EST_MOVIMENTOS', entradas, usuario.email);
    return { ok: true, recado: novos.length + ' item(ns) cadastrado(s)' + (entradas.length ? ', ' + entradas.length + ' com saldo inicial' : '') +
      (ignoradas.length ? '. Ignorados: ' + ignoradas.slice(0, 5).join(', ') + (ignoradas.length > 5 ? '…' : '') : '.') };
  });
}

/* ------------------------------------------------------------------ */
/* MOVIMENTACOES                                                       */
/* ------------------------------------------------------------------ */

function acaoMovimentarEstoque(usuario, params) {
  const tipo = String(params.tipo || '').toUpperCase().trim();
  if (EST_TIPOS.indexOf(tipo) === -1) throw new Error('Escolha o tipo da movimentação.');
  if (tipo === 'AJUSTE') exigirCapacidade(usuario, 'GERIR_ESTOQUE');
  const codigo = String(params.item || '').toUpperCase().trim();
  let qtd = num_(params.quantidade);
  if (qtd === null || qtd === 0) throw new Error('Informe a quantidade.');
  if (tipo !== 'AJUSTE' && qtd < 0) throw new Error('A quantidade é sempre positiva — o tipo diz se entra ou sai.');
  if ((tipo === 'SAIDA') && !String(params.destino || '').trim()) {
    throw new Error('Informe para onde foi (setor ou pessoa) — é o que permite saber onde cada item está.');
  }

  /*
   * Saldo lido, conferido e gravado na MESMA trava. Com a conferencia fora
   * dela, duas saidas da ultima unidade ao mesmo tempo passavam as duas e o
   * saldo ficava negativo.
   */
  return comTrava(function () {
    const item = itensEstoque_().filter(function (i) { return i.codigo === codigo; })[0];
    if (!item) throw new Error('Escolha um item do cadastro.');
    if (!item.ativo) throw new Error(item.nome + ' está inativo. Reative o item no cadastro antes de movimentar.');

    const saldo = saldosEstoque_()[item.codigo] || 0;
    const efeito = (EST_SINAL[tipo] || 0) * qtd;
    if (estArred_(saldo + efeito) < 0) {
      throw new Error('Saldo insuficiente: ' + item.nome + ' tem ' + saldo + ' ' + item.unidade +
        ' e a movimentação tira ' + Math.abs(efeito) + '. Registre a entrada antes ou faça um ajuste de inventário.');
    }

    const campos = {
      DATA: isoDe_(params.data) || paraISO(hoje()), TIPO: tipo, ITEM: item.codigo, QUANTIDADE: qtd,
      DESTINO: String(params.destino || '').trim(), SOLICITANTE: String(params.solicitante || '').trim(),
      DOCUMENTO: String(params.documento || '').trim(), SERIE: String(params.serie || '').trim(),
      OBSERVACAO: String(params.observacao || '').trim(), REGISTRADO_POR: usuario.email
    };
    const id = inserir('EST_MOVIMENTOS', campos, usuario.email);
    return { ok: true, id: id, recado: EST_NOMES_TIPO[tipo] + ' registrada: ' + item.nome + ' — saldo agora ' + estArred_(saldo + efeito) + ' ' + item.unidade + '.' };
  });
}

/*
 * Estornar = lancar o movimento contrario, com referencia ao original.
 * Nada e apagado: o historico mostra o erro e a correcao.
 */
function acaoEstornarMovimento(usuario, params) {
  exigirCapacidade(usuario, 'GERIR_ESTOQUE');
  // "Ja foi estornado?" e o estorno na mesma trava: dois cliques ao mesmo tempo nao estornam duas vezes.
  // Item inativo pode ser estornado: o estorno corrige o historico, nao e uso do item.
  return comTrava(function () {
    const movs = movimentosEstoque_();
    const m = movs.filter(function (x) { return x.id === params.id; })[0];
    if (!m) throw new Error('Movimentação não encontrada.');
    if (/^ESTORNO/.test(m.observacao)) throw new Error('Este lançamento já é um estorno.');
    const jaEstornado = movs.some(function (x) { return idEstornado_(x.observacao) === m.id; });
    if (jaEstornado) throw new Error('Este lançamento já foi estornado.');
    const saldo = saldosEstoque_(movs)[m.item] || 0;
    if (estArred_(saldo - m.efeito) < 0) throw new Error('O estorno deixaria o saldo negativo. Confira as movimentações posteriores.');
    inserir('EST_MOVIMENTOS', {
      DATA: paraISO(hoje()), TIPO: 'AJUSTE', ITEM: m.item, QUANTIDADE: -m.efeito,
      DESTINO: m.destino, SOLICITANTE: '', DOCUMENTO: m.documento, SERIE: m.serie,
      OBSERVACAO: 'ESTORNO de ' + m.id + ' (' + EST_NOMES_TIPO[m.tipo] + ' de ' + formatarData(paraData(m.data)) + ')' +
        (params.motivo ? ' — ' + String(params.motivo).trim() : ''),
      REGISTRADO_POR: usuario.email
    }, usuario.email);
    return { ok: true, recado: 'Lançamento estornado.' };
  });
}

/*
 * INVENTARIO — a contagem fisica. Recebe { contagens: [{codigo, contado, saldoVisto}] }
 * e grava um AJUSTE so onde a contagem difere do saldo do sistema.
 *
 * saldoVisto e o saldo que a tela mostrava quando a pessoa contou. Se o
 * item foi movimentado depois (outra pessoa deu uma saida no meio da
 * contagem), a diferenca calculada apagaria aquele movimento: o item fica
 * de fora e o recado pede para conferir de novo.
 */
function acaoInventarioEstoque(usuario, params) {
  return comTrava(function () {
    const saldo = saldosEstoque_();
    const itens = {};
    itensEstoque_().forEach(function (i) { itens[i.codigo] = i; });
    const ajustes = [], mudaram = [];
    (params.contagens || []).forEach(function (c) {
      const codigo = String(c.codigo || '').toUpperCase().trim();
      const contado = num_(c.contado);
      if (!itens[codigo] || contado === null) return;
      if (contado < 0) throw new Error('Contagem negativa em ' + itens[codigo].nome + '.');
      const atual = saldo[codigo] || 0;
      const visto = num_(c.saldoVisto);
      if (visto !== null && Math.abs(visto - atual) > 1e-9) {
        mudaram.push(itens[codigo].nome + ' (' + visto + ' → ' + atual + ')');
        return;
      }
      const dif = contado - atual;
      if (!dif) return;
      ajustes.push({ DATA: paraISO(hoje()), TIPO: 'AJUSTE', ITEM: codigo, QUANTIDADE: dif,
        DESTINO: '', SOLICITANTE: '', DOCUMENTO: '', SERIE: '',
        OBSERVACAO: 'Inventário: sistema ' + atual + ', contado ' + contado +
          (params.observacao ? ' — ' + String(params.observacao).trim() : ''),
        REGISTRADO_POR: usuario.email });
    });
    if (ajustes.length) inserirVarios('EST_MOVIMENTOS', ajustes, usuario.email);
    const recado = ajustes.length ? ajustes.length + ' item(ns) ajustado(s) pela contagem.' : 'A contagem bateu com o sistema. Nenhum ajuste.';
    return { ok: true, mudaram: mudaram, recado: recado + (mudaram.length
      ? ' Ficaram de fora porque foram movimentados depois que a tela abriu — confira e conte de novo: ' + mudaram.join(', ') + '.' : '') };
  });
}

/*
 * HISTORICO COMPLETO DE UM ITEM — sob demanda (a tela so leva ~90 dias).
 * saldoBase = o que havia antes do lancamento mais antigo devolvido; o
 * saldo corrido da janela parte dele e termina no saldo atual.
 */
function acaoHistoricoItemEstoque(usuario, params) {
  const codigo = String(params.codigo || '').toUpperCase().trim();
  if (!codigo) throw new Error('Escolha o item.');
  const item = itensEstoque_().filter(function (i) { return i.codigo === codigo; })[0];
  const movs = movimentosEstoque_().filter(function (m) { return m.item === codigo; }).sort(ordemMovimentoDesc_);
  const saldo = movs.reduce(function (s, m) { return s + m.efeito; }, 0);
  const lista = movs.slice(0, EST_HISTORICO_MAX);
  const naLista = lista.reduce(function (s, m) { return s + m.efeito; }, 0);
  return {
    ok: true, codigo: codigo, nome: item ? item.nome : codigo, unidade: item ? item.unidade : '',
    saldo: estArred_(saldo), saldoBase: estArred_(saldo - naLista), total: movs.length, movimentos: lista
  };
}
