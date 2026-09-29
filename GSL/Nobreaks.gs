/**
 * NOBREAKS — a planilha de monitoramento virou painel.
 *
 * As leituras sao lancadas AQUI, na mesma ordem da folha de papel que
 * fica ao lado de cada equipamento: data, leitura (1a, 2a, 3a), hora,
 * ENTRADA (Vi, Ii, Pi) e depois SAIDA (Vo, Io, Po). Uma folha por
 * nobreak por semana vira uma grade de 7 dias x 3 leituras na tela.
 *
 * Calculado (nunca digitado):
 *   Carga de saida (%) = Po / potencia nominal cadastrada
 *   Po / Pi (%)        = o que ele entrega em relacao ao que puxa da rede
 *   Alerta             = tensao fora da tolerancia da nominal, ou carga
 *                        acima do limite (parametros NOBREAK_*)
 */

const NB_DIAS_NO_PAINEL = 120;   // quanto historico viaja com a tela

function num_(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const t = String(v).trim().replace(/\s/g, '');
  if (!t) return null;
  // aceita 221,5 e 221.5; com virgula, o ponto e separador de milhar (7.196,0)
  let limpo = t;
  if (t.indexOf(',') !== -1) limpo = t.replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return isNaN(n) ? null : n;
}

/* Inteiro com ponto de milhar ("7.500", "5.000", "1.500") e milhar, nao decimal. */
function numMilhar_(v) {
  if (typeof v === 'string' && /^\s*\d{1,3}(\.\d{3})+\s*$/.test(v)) v = v.replace(/\./g, '');
  return num_(v);
}

function isoDe_(v) {
  if (!v) return '';
  const d = paraData(v);
  return d ? paraISO(d) : '';
}

/*
 * Codigo de equipamento/item (nobreak, estoque de TI): so A-Z, 0-9, ponto,
 * hifen e sublinhado. Acento cai, espaco vira hifen, o resto sai. O codigo
 * aparece em botoes, filtros e chaves — nao pode carregar aspas nem codigo.
 */
function codigoLimpo_(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().trim().replace(/\s+/g, '-').replace(/[^A-Z0-9._-]/g, '');
}

function horaDe_(v) {
  if (v instanceof Date) return dd_(v.getHours()) + ':' + dd_(v.getMinutes());
  const t = String(v || '').trim();
  const m = t.match(/^(\d{1,2})\s*[:hH.]\s*(\d{2})/);
  if (m) return dd_(Number(m[1])) + ':' + m[2];
  const hh = t.match(/^(\d{1,2})\s*[hH]$/);
  if (hh) return dd_(Number(hh[1])) + ':00';
  const so = t.match(/^(\d{1,2})$/);
  if (so) return dd_(Number(so[1])) + ':00';
  return t;
}

function equipamentosNobreak_() {
  return listar('NB_EQUIPAMENTOS').map(function (e) {
    return {
      id: e.ID,
      codigo: String(e.CODIGO || '').trim(),
      modelo: String(e.MODELO || '').trim(),
      local: String(e.LOCAL || '').trim(),
      potencia: num_(e.POTENCIA_VA),
      tensaoEntrada: num_(e.TENSAO_ENTRADA),
      tensaoSaida: num_(e.TENSAO_SAIDA),
      ativo: String(e.ATIVO || 'SIM').trim() === '' || marcado(e.ATIVO),
      observacao: String(e.OBSERVACAO || '')
    };
  }).filter(function (e) { return e.codigo; })
    .sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });
}

function hidratarLeitura_(l) {
  return {
    id: l.ID,
    data: isoDe_(l.DATA),
    hora: horaDe_(l.HORA),
    leitura: Number(String(l.LEITURA || '').replace(/\D/g, '')) || 0,
    nobreak: String(l.NOBREAK || '').trim(),
    vi: num_(l.VI), ii: num_(l.II), pi: num_(l.PI),
    vo: num_(l.VO), io: num_(l.IO), po: num_(l.PO),
    ocorrencia: String(l.OCORRENCIA || ''),
    lidoPor: String(l.LIDO_POR || '')
  };
}

function leiturasNobreak_(desdeISO, ateISO) {
  return listar('NB_LEITURAS').map(hidratarLeitura_).filter(function (l) {
    if (!l.data || !l.nobreak) return false;
    if (desdeISO && l.data < desdeISO) return false;
    if (ateISO && l.data > ateISO) return false;
    return true;
  }).sort(function (a, b) {
    return a.data.localeCompare(b.data) || (a.leitura - b.leitura) || a.hora.localeCompare(b.hora);
  });
}

function dadosNobreaks(usuario) {
  const h = hoje();
  const desde = new Date(h.getFullYear(), h.getMonth(), h.getDate() - NB_DIAS_NO_PAINEL);
  const todas = listar('NB_LEITURAS');

  return {
    hoje: paraISO(h),
    equipamentos: equipamentosNobreak_(),
    leituras: leiturasNobreak_(paraISO(desde), ''),
    totalLeituras: todas.length,
    primeiraLeitura: todas.length ? todas.map(function (l) { return isoDe_(l.DATA); })
      .filter(Boolean).sort()[0] || '' : '',
    parametros: {
      tolerancia: num_(parametro('NOBREAK_TENSAO_TOLERANCIA', 10)) || 10,
      cargaAlerta: num_(parametro('NOBREAK_CARGA_ALERTA', 80)) || 80,
      porDia: num_(parametro('NOBREAK_LEITURAS_DIA', 3)) || 3
    },
    permissoes: {
      lancar: podeFazer(usuario, 'LANCAR_NOBREAK'),
      cadastrar: podeFazer(usuario, 'PROGRAMAR') && podeFazer(usuario, 'LANCAR_NOBREAK')
    }
  };
}

/** Leituras de uma semana qualquer (a grade de lancamento, fora da janela do painel). */
function acaoSemanaNobreak(usuario, params) {
  const inicio = paraData(params.inicio);
  if (!inicio) throw new Error('Data inicial inválida.');
  const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
  const codigo = String(params.nobreak || '').trim();
  return {
    ok: true,
    leituras: leiturasNobreak_(paraISO(inicio), paraISO(fim)).filter(function (l) {
      return !codigo || l.nobreak === codigo;
    })
  };
}

/* Campos numericos, na ordem do papel. */
const NB_CAMPOS = ['VI', 'II', 'PI', 'VO', 'IO', 'PO'];

function camposDaLeitura_(l, quem) {
  const c = {
    DATA: isoDe_(l.data),
    HORA: horaDe_(l.hora),
    LEITURA: Number(String(l.leitura == null ? '' : l.leitura).replace(/\D/g, '')) || '',
    NOBREAK: String(l.nobreak || '').trim(),
    OCORRENCIA: String(l.ocorrencia || '').trim(),
    LIDO_POR: quem
  };
  NB_CAMPOS.forEach(function (k) {
    let bruto = l[k.toLowerCase()];
    // Potencia em VA: "6.900" e seis mil e novecentos (ponto de milhar).
    if ((k === 'PI' || k === 'PO') && typeof bruto === 'string' && /^\s*\d{1,3}(\.\d{3})+\s*$/.test(bruto)) {
      bruto = bruto.replace(/\./g, '');
    }
    const n = num_(bruto);
    c[k] = n === null ? '' : n;
  });
  return c;
}

function leituraVazia_(c) {
  return NB_CAMPOS.every(function (k) { return c[k] === '' || c[k] === null; }) && !c.OCORRENCIA;
}

/**
 * Grava a grade da semana de UM nobreak. Cada linha e casada pela chave
 * nobreak + data + numero da leitura: o que ja existe e atualizado, o que
 * e novo e inserido, o que foi apagado na grade e excluido. Uma escrita
 * por tipo de operacao, nao uma por celula.
 */
function acaoLancarLeituras(usuario, params) {
  const codigo = String(params.nobreak || '').trim();
  if (!codigo) throw new Error('Escolha o nobreak.');
  if (!equipamentosNobreak_().some(function (e) { return e.codigo === codigo; })) {
    throw new Error('Nobreak ' + codigo + ' não está cadastrado.');
  }
  const linhas = params.leituras || [];
  if (!linhas.length) throw new Error('Nada para gravar.');

  // Monta e confere o que veio da folha (nao depende do banco). A mesma
  // celula repetida no pedido vale uma vez so — a ultima.
  const pedidas = {}, ordem = [];
  linhas.forEach(function (l) {
    const c = camposDaLeitura_(Object.assign({}, l, { nobreak: codigo }), usuario.email);
    if (!c.DATA || !c.LEITURA) return;
    const vazia = leituraVazia_(c);
    if (!vazia) {
      const validacao = conferirLeitura_(c);
      if (validacao) throw new Error(formatarData(paraData(c.DATA)) + ' · ' + c.LEITURA + 'ª leitura: ' + validacao);
    }
    const k = c.DATA + '|' + c.LEITURA;
    if (!pedidas[k]) ordem.push(k);
    pedidas[k] = { c: c, vazia: vazia };
  });

  /*
   * Casar com o que ja existe e gravar na MESMA trava. Antes o casamento era
   * lido fora dela: dois lancamentos da mesma folha ao mesmo tempo inseriam
   * a leitura duas vezes, e apagar na folha so tirava uma.
   */
  return comTrava(function () {
    const existentes = {};
    listar('NB_LEITURAS').forEach(function (r) {
      const l = hidratarLeitura_(r);
      if (l.nobreak !== codigo) return;
      const k = l.data + '|' + l.leitura;
      (existentes[k] = existentes[k] || []).push(r);
    });

    const novas = [], mudancas = [], apagar = [];
    let duplicadas = 0;
    ordem.forEach(function (k) {
      const p = pedidas[k];
      const lista = existentes[k] || [];
      // Duplicata que ja estava no banco (de antes desta correcao): fica a primeira.
      lista.slice(1).forEach(function (r) { apagar.push({ id: r.ID, campos: { EXCLUIDO: 'SIM' } }); duplicadas++; });
      const atual = lista[0];
      if (p.vazia) {
        if (atual) apagar.push({ id: atual.ID, campos: { EXCLUIDO: 'SIM' } });
        return;
      }
      if (atual) mudancas.push({ id: atual.ID, campos: p.c });
      else novas.push(p.c);
    });

    if (novas.length) inserirVarios('NB_LEITURAS', novas, usuario.email);
    const alteracoes = mudancas.concat(apagar);
    if (alteracoes.length) atualizarVarios('NB_LEITURAS', alteracoes, usuario.email);

    const apagadas = apagar.length - duplicadas;
    return { ok: true, recado: 'Semana gravada — ' + novas.length + ' nova(s), ' + mudancas.length +
      ' corrigida(s)' + (apagadas ? ', ' + apagadas + ' apagada(s)' : '') +
      (duplicadas ? ', ' + duplicadas + ' duplicada(s) removida(s)' : '') + '.' };
  });
}

/* Barra digitacao absurda (virgula no lugar errado) sem ser chata. */
function conferirLeitura_(c) {
  const tensoes = [['VI', 'Vi'], ['VO', 'Vo']];
  for (let i = 0; i < tensoes.length; i++) {
    const v = c[tensoes[i][0]];
    if (v !== '' && (v < 0 || v > 1000)) return tensoes[i][1] + ' = ' + v + ' V não parece certo.';
  }
  const correntes = [['II', 'Ii'], ['IO', 'Io']];
  for (let i = 0; i < correntes.length; i++) {
    const v = c[correntes[i][0]];
    if (v !== '' && (v < 0 || v > 2000)) return correntes[i][1] + ' = ' + v + ' A não parece certo.';
  }
  return '';
}

/** Uma leitura avulsa (editar pelo historico). */
function acaoSalvarLeitura(usuario, params) {
  const c = camposDaLeitura_(params, usuario.email);
  if (!c.NOBREAK) throw new Error('Escolha o nobreak.');
  if (!c.DATA) throw new Error('Informe a data.');
  if (!c.LEITURA) throw new Error('Informe o número da leitura (1, 2 ou 3).');
  const erro = conferirLeitura_(c);
  if (erro) throw new Error(erro);
  // A mesma celula (nobreak + data + numero) nao pode existir duas vezes.
  return comTrava(function () {
    const igual = listar('NB_LEITURAS').some(function (r) {
      const l = hidratarLeitura_(r);
      return l.nobreak === c.NOBREAK && l.data === c.DATA && l.leitura === c.LEITURA && String(r.ID) !== String(params.id || '');
    });
    if (igual) throw new Error('Já existe a ' + c.LEITURA + 'ª leitura de ' + c.NOBREAK + ' em ' +
      formatarData(paraData(c.DATA)) + '. Corrija pela folha da semana.');
    if (params.id) return atualizar('NB_LEITURAS', params.id, c, usuario.email);
    return { ok: true, id: inserir('NB_LEITURAS', c, usuario.email) };
  });
}

function acaoExcluirLeitura(usuario, params) {
  return excluir('NB_LEITURAS', params.id, usuario.email);
}

/* --- Cadastro dos equipamentos --- */

function acaoSalvarNobreak(usuario, params) {
  exigirCapacidade(usuario, 'LANCAR_NOBREAK');   // modulo em VER nao cadastra
  const campos = {
    CODIGO: codigoLimpo_(params.codigo),
    MODELO: String(params.modelo || '').trim(),
    LOCAL: String(params.local || '').trim(),
    POTENCIA_VA: numMilhar_(params.potencia) === null ? '' : numMilhar_(params.potencia),
    TENSAO_ENTRADA: num_(params.tensaoEntrada) === null ? '' : num_(params.tensaoEntrada),
    TENSAO_SAIDA: num_(params.tensaoSaida) === null ? '' : num_(params.tensaoSaida),
    ATIVO: params.ativo === false ? 'NAO' : 'SIM',
    OBSERVACAO: String(params.observacao || '').trim()
  };
  if (!campos.CODIGO) throw new Error('Informe o código do nobreak (ex.: NB-01) — só letras, números, ponto, hífen ou sublinhado.');

  // Unicidade e troca de codigo (com as leituras) na mesma trava.
  return comTrava(function () {
    const repetido = equipamentosNobreak_().filter(function (e) {
      return e.codigo === campos.CODIGO && e.id !== params.id;
    })[0];
    if (repetido) throw new Error('Já existe um nobreak com o código ' + campos.CODIGO + '.');

    if (params.id) {
      const antes = obter('NB_EQUIPAMENTOS', params.id);
      const r = atualizar('NB_EQUIPAMENTOS', params.id, campos, usuario.email);
      // Codigo trocado: as leituras acompanham, senao ficariam orfas.
      const antigo = antes ? String(antes.CODIGO || '').trim() : '';
      if (antigo && antigo !== campos.CODIGO) {
        const mud = listar('NB_LEITURAS').filter(function (l) { return String(l.NOBREAK || '').trim() === antigo; })
          .map(function (l) { return { id: l.ID, campos: { NOBREAK: campos.CODIGO } }; });
        if (mud.length) atualizarVarios('NB_LEITURAS', mud, usuario.email);
      }
      return r;
    }
    return { ok: true, id: inserir('NB_EQUIPAMENTOS', campos, usuario.email) };
  });
}

function acaoExcluirNobreak(usuario, params) {
  exigirCapacidade(usuario, 'LANCAR_NOBREAK');   // modulo em VER nao cadastra
  const e = obter('NB_EQUIPAMENTOS', params.id);
  if (!e) throw new Error('Nobreak não encontrado.');
  const temLeitura = listar('NB_LEITURAS').some(function (l) { return String(l.NOBREAK || '').trim() === String(e.CODIGO).trim(); });
  if (temLeitura) {
    // Com historico, nao apaga: desativa. O historico continua no painel.
    return atualizar('NB_EQUIPAMENTOS', params.id, { ATIVO: 'NAO' }, usuario.email);
  }
  return excluir('NB_EQUIPAMENTOS', params.id, usuario.email);
}

/*
 * IMPORTAR DA PLANILHA ANTIGA (Monitoramento_Nobreaks_Bartofil).
 *
 * Le a aba Cadastro (cabecalho na linha 5) e a aba Lancamentos (cabecalho
 * na linha 4). Leitura que ja existe no GSL (mesmo nobreak, data e numero)
 * nao e duplicada. A linha de EXEMPLO da planilha e ignorada.
 */
function acaoImportarNobreaks(usuario, params) {
  exigirCapacidade(usuario, 'LANCAR_NOBREAK');   // modulo em VER nao cadastra
  const link = String(params.link || '').trim();
  if (!link) throw new Error('Cole o link da planilha antiga.');
  let arq;
exigirPorta_();
  try { arq = /^[\w-]{25,}$/.test(link) ? SpreadsheetApp.openById(link) : SpreadsheetApp.openByUrl(link); }
  catch (e) { throw new Error('Não consegui abrir a planilha. Confira o link e se você tem acesso a ela.'); }

  const achar = function (nomes) {
    const abas = arq.getSheets();
    for (let i = 0; i < abas.length; i++) {
      const n = normalizarTexto_(abas[i].getName());
      if (nomes.some(function (x) { return n.indexOf(x) === 0; })) return abas[i];
    }
    return null;
  };

  const tabela = function (aba, marcador) {
    if (!aba) return [];
    const v = aba.getDataRange().getValues();
    let cab = -1;
    for (let i = 0; i < Math.min(12, v.length); i++) {
      if (v[i].some(function (c) { return normalizarTexto_(c).indexOf(marcador) === 0; })) { cab = i; break; }
    }
    if (cab === -1) return [];
    const nomes = v[cab].map(normalizarTexto_);
    return v.slice(cab + 1).map(function (linha) {
      const o = {};
      nomes.forEach(function (n, i) { if (n) o[n] = linha[i]; });
      return o;
    });
  };
  const pega = function (o, pedacos) {
    const ks = Object.keys(o);
    for (let p = 0; p < pedacos.length; p++) {
      for (let k = 0; k < ks.length; k++) if (ks[k].indexOf(pedacos[p]) === 0) return o[ks[k]];
    }
    return '';
  };

  // 1 · cadastro
  const jaTem = {};
  equipamentosNobreak_().forEach(function (e) { jaTem[e.codigo] = e; });
  let novosEq = 0;
  tabela(achar(['CADASTRO']), 'NOBREAK').forEach(function (o) {
    const bruto = String(pega(o, ['NOBREAK']) || '').toUpperCase().trim();
    // Notas e observacoes escritas abaixo da tabela nao sao nobreak.
    if (bruto.length > 20 || /\s{1}\S+\s/.test(bruto)) return;
    const codigo = codigoLimpo_(bruto);
    if (!codigo || jaTem[codigo]) {
      // completa o que estiver vazio no GSL
      if (codigo && jaTem[codigo]) {
        const e = jaTem[codigo], campos = {};
        const modelo = String(pega(o, ['MODELO']) || '').trim();
        const local = String(pega(o, ['LOCAL']) || '').trim();
        const pot = numMilhar_(pega(o, ['POTENCIA']));
        if (!e.modelo && modelo && modelo.indexOf('modelo do') !== 0) campos.MODELO = modelo;
        if (!e.local && local && local.indexOf('onde ele') !== 0) campos.LOCAL = local;
        if (!e.potencia && pot) campos.POTENCIA_VA = pot;
        if (e.id && Object.keys(campos).length) {
          atualizar('NB_EQUIPAMENTOS', e.id, campos, usuario.email);
          if (campos.MODELO) e.modelo = campos.MODELO;
          if (campos.LOCAL) e.local = campos.LOCAL;
          if (campos.POTENCIA_VA) e.potencia = campos.POTENCIA_VA;
        }
      }
      return;
    }
    const novo = {
      CODIGO: codigo, MODELO: String(pega(o, ['MODELO']) || ''), LOCAL: String(pega(o, ['LOCAL']) || ''),
      POTENCIA_VA: numMilhar_(pega(o, ['POTENCIA'])) || '', TENSAO_ENTRADA: num_(pega(o, ['TENSAO NOMINAL ENTRADA'])) || '',
      TENSAO_SAIDA: num_(pega(o, ['TENSAO NOMINAL SAIDA'])) || '', ATIVO: 'SIM', OBSERVACAO: ''
    };
    // O cadastro antigo pode repetir o codigo ("NB 04" e "NB-04"): a segunda
    // linha completa a primeira. Sem o id aqui, o atualizar() recebia
    // undefined e a importacao parava no meio, sem os lancamentos.
    const idNovo = inserir('NB_EQUIPAMENTOS', novo, usuario.email);
    jaTem[codigo] = { id: idNovo, codigo: codigo, modelo: novo.MODELO, local: novo.LOCAL, potencia: novo.POTENCIA_VA };
    novosEq++;
  });

  // 2 · lancamentos
  const existentes = {};
  listar('NB_LEITURAS').forEach(function (r) {
    const l = hidratarLeitura_(r);
    existentes[l.nobreak + '|' + l.data + '|' + l.leitura] = true;
  });
  const novas = [];
  let exemplos = 0;
  tabela(achar(['LANCAMENTOS']), 'DATA').forEach(function (o) {
    const oc = String(pega(o, ['OCORRENCIAS']) || '');
    if (/EXEMPLO/i.test(oc)) { exemplos++; return; }
    const c = camposDaLeitura_({
      data: pega(o, ['DATA']), hora: pega(o, ['HORA']), leitura: pega(o, ['LEITURA']),
      nobreak: pega(o, ['NOBREAK']), vi: pega(o, ['VI']), ii: pega(o, ['II']), pi: pega(o, ['PI']),
      vo: pega(o, ['VO']), io: pega(o, ['IO']), po: pega(o, ['PO']), ocorrencia: oc
    }, usuario.email);
    c.NOBREAK = codigoLimpo_(c.NOBREAK);
    if (!c.DATA || !c.NOBREAK || !c.LEITURA || leituraVazia_(c)) return;
    const k = c.NOBREAK + '|' + c.DATA + '|' + c.LEITURA;
    if (existentes[k]) return;
    existentes[k] = true;
    novas.push(c);
  });
  if (novas.length) inserirVarios('NB_LEITURAS', novas, usuario.email);

  return { ok: true, recado: 'Importação concluída: ' + novosEq + ' nobreak(s) novo(s) e ' + novas.length +
    ' leitura(s).' + (exemplos ? ' A linha de exemplo foi ignorada.' : '') };
}

function normalizarTexto_(v) {
  return String(v == null ? '' : v).trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}
