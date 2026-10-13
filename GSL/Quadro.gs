/**
 * QUADRO DO CD — o BI de funcoes dentro do GSL.
 *
 * 13/10 — UMA ABA SO. O quadro vem da aba GERAL da planilha de apoio:
 *
 *   EQUIPE | COD | PROD | DESCRIÇÃO | RH | STATUS
 *   (turno) (produtivo) (nome) (funcao) (matricula) (na empresa?)
 *
 * e o GSL separa os turnos (1° TURNO, 2° TURNO, 3° TURNO e ADM). As abas
 * APOIO TA / TB / TC ficam de lado: so sao lidas se a planilha ainda nao
 * tiver a GERAL (outra filial no layout antigo). Admitidos (CADMITIDOS) e
 * desligados (CDESLIGADOS) continuam vindo das mesmas abas.
 *
 * INCONSISTENCIAS: desligado (CDESLIGADOS) que continua ATIVO na GERAL — o
 * pedido da gerencia, a unica "grave" (a faixa vermelha da tela) — e, como
 * "atencao", o que deixa o quadro errado: linha sem nome, EQUIPE fora do
 * padrao, produtivo ou matricula repetidos e admitido que nao entrou na
 * GERAL. Cada uma diz a linha da planilha.
 */
const BUILD_QUADRO = '2026.10.13';   // carimbo da entrega — ver APP.build no Codigo.gs

const QUADRO_ABA_GERAL = 'GERAL';
const QUADRO_ABAS_APOIO = ['APOIO TA', 'APOIO TB', 'APOIO TC'];
const QUADRO_ABA_ADMITIDOS = 'CADMITIDOS';
const QUADRO_ABA_DESLIGADOS = 'CDESLIGADOS';
const QUADRO_EQUIPES = ['1° TURNO', '2° TURNO', '3° TURNO', 'ADM'];
// O formato do que vai para o cache: copia de outro formato (versao anterior do Quadro.gs) e relida.
const QUADRO_FORMATO = 2;

/*
 * A aba e achada pelo nome sem diferenciar maiuscula, acento, espaco ou
 * pontuacao, e por apelidos: a planilha de apoio de algumas filiais chama
 * "CDADMITIDOS" (e nao "CADMITIDOS") — e a aba inteira era ignorada, sem
 * admitido nenhum no Quadro. A GERAL so pelo nome (sem pedacos: "RESUMO
 * GERAL" nao e ela).
 */
const QUADRO_APELIDOS = {
  GERAL: { nomes: ['GERAL', 'QUADROGERAL', 'BASEGERAL', 'GERALCD'], pedacos: [] },
  CADMITIDOS: { nomes: ['CADMITIDOS', 'CDADMITIDOS', 'ADMITIDOS', 'ADMISSOES', 'CADMISSOES', 'CDADMISSOES'], pedacos: ['ADMITID', 'ADMISS'] },
  CDESLIGADOS: { nomes: ['CDESLIGADOS', 'CDDESLIGADOS', 'DESLIGADOS', 'DESLIGAMENTOS', 'CDESLIGAMENTOS', 'CDDESLIGAMENTOS'], pedacos: ['DESLIG', 'DEMITID', 'DEMISS'] }
};
function chaveAbaQ_(nome) { return normalizaQ_(nome).replace(/[^A-Z0-9]/g, ''); }
function abaQuadro_(ss, nomeAba) {
  const exata = ss.getSheetByName(nomeAba);
  if (exata) return exata;
  const abas = ss.getSheets();
  const alvo = chaveAbaQ_(nomeAba);
  const ap = QUADRO_APELIDOS[nomeAba] || { nomes: [], pedacos: [] };
  const nomes = [alvo].concat(ap.nomes);
  const porNome = abas.filter(function (a) { return nomes.indexOf(chaveAbaQ_(a.getName())) !== -1; })[0];
  if (porNome) return porNome;
  return abas.filter(function (a) {
    const k = chaveAbaQ_(a.getName());
    return ap.pedacos.some(function (x) { return k.indexOf(x) !== -1; });
  })[0] || null;
}
const QUADRO_CACHE_SEGUNDOS = 300;

function idPlanilhaQuadro_() {
  const bruto = String(parametro('QUADRO_PLANILHA', '') || '').trim();
  if (!bruto) return '';
  const m = bruto.match(/\/d\/([\w-]{20,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(bruto) ? bruto : '';
}

function dadosQuadro(usuario) {
  const id = idPlanilhaQuadro_();
  const base = {
    configurado: !!id,
    podeConfigurar: podeFazer(usuario, 'PROGRAMAR'),
    filial: filialAtual().nome
  };
  if (!id) return base;

  const chave = chaveNoEspaco('quadro|' + id);
  const guardado = lerTextoCache(chave);
  if (guardado) {
    try {
      const g = JSON.parse(guardado);
      if (g && g.formato === QUADRO_FORMATO) return Object.assign(base, g);
    } catch (e) { /* le de novo */ }
  }
  try {
    const dados = lerPlanilhaQuadro_(id);
    gravarTextoCache(chave, JSON.stringify(dados), QUADRO_CACHE_SEGUNDOS);
    return Object.assign(base, dados);
  } catch (e) {
    base.erro = 'Não consegui ler a planilha do Quadro: ' + (e.message || e) +
      '. Confira se o link está certo e se a conta dona do GSL tem acesso a ela.';
    return base;
  }
}

/* ------------------------------------------------------------------ */
/* COLUNAS                                                             */
/* ------------------------------------------------------------------ */

/*
 * O "NOME QUE SOME" (13/10). A coluna do nome era achada por pedaco do
 * cabecalho — COLABORADOR ou NOME — e o cabecalho era a primeira linha com
 * uma dessas palavras. Duas coisas davam errado, de vez em quando:
 *   - a coluna do nome chamada PROD (como na GERAL) nao era achada: o nome
 *     ficava vazio e a lista mostrava so o produtivo;
 *   - um titulo em cima do cabecalho ("QUADRO DE COLABORADORES") era tomado
 *     como o cabecalho: as colunas de verdade viravam uma linha de dados e o
 *     "nome" passava a ser o valor de outra coluna (ou nada).
 * Agora o cabecalho e a primeira das 15 primeiras linhas com pelo menos DUAS
 * colunas conhecidas, comparadas pelo nome INTEIRO; o pedaco so entra para
 * o que o nome inteiro nao achou, e nunca para uma coluna ja usada.
 */
const QUADRO_COLUNAS = {
  nome:   { exatos: ['PROD', 'COLABORADOR', 'NOME', 'NOME DO COLABORADOR', 'NOME COMPLETO', 'FUNCIONARIO'], pedacos: ['COLABORADOR', 'NOME', 'FUNCIONARIO'] },
  cod:    { exatos: ['COD', 'CODIGO', 'PRODUTIVA', 'PRODUTIVO', 'COD PRODUTIVO', 'CODIGO PRODUTIVO', 'N PRODUTIVO'], pedacos: ['PRODUTIV', 'COD'], evitar: ['DESCRI'] },
  rh:     { exatos: ['RH', 'MATRICULA', 'MATRICULA RH', 'MAT RH', 'MAT'], pedacos: ['MATRIC'] },
  equipe: { exatos: ['EQUIPE', 'TURNO', 'EQUIPE TURNO'], pedacos: ['EQUIPE', 'TURNO'] },
  funcao: { exatos: ['DESCRICAO', 'FUNCAO', 'CARGO', 'DESCRICAO DA FUNCAO'], pedacos: ['FUNCAO', 'CARGO', 'DESCRICAO'] },
  status: { exatos: ['STATUS', 'SITUACAO'], pedacos: ['STATUS', 'SITUAC'] }
};
const QUADRO_COLUNAS_ADM = {
  data: { exatos: ['DATA ADMISSAO', 'DATA DE ADMISSAO', 'ADMISSAO', 'DATA'], pedacos: ['ADMISS', 'ADMIT', 'DATA', 'ENTRADA', 'INICIO', 'MES'], evitar: ['MOTIVO', 'TIPO', 'STATUS', 'SITUAC'] }
};
const QUADRO_COLUNAS_DES = {
  data:   { exatos: ['DATA DESLIGAMENTO', 'DATA DO DESLIGAMENTO', 'DATA DEMISSAO', 'DATA DE DEMISSAO', 'DESLIGAMENTO', 'DATA'], pedacos: ['DESLIG', 'DEMISS', 'DATA'], evitar: ['MOTIVO', 'TIPO'] },
  tipo:   { exatos: ['TIPO', 'TIPO DE DESLIGAMENTO', 'TIPO DESLIGAMENTO'], pedacos: ['TIPO'], evitar: ['MOTIVO'] },
  motivo: { exatos: ['MOTIVO', 'MOTIVO DO DESLIGAMENTO', 'MOTIVO DESLIGAMENTO'], pedacos: ['MOTIVO'] }
};

/* Cabecalho comparavel: sem acento, maiusculo, pontuacao vira espaco ("PROD." = "PROD"). */
function cabQ_(v) { return normalizaQ_(v).replace(/[^A-Z0-9]+/g, ' ').trim(); }

/*
 * Le a aba: o cabecalho (ver acima), as linhas de dados e o numero, na
 * planilha, da primeira delas (para a inconsistencia dizer "linha 37").
 */
function lerTabelaQ_(aba, campos) {
  const valores = aba.getDataRange().getValues();
  const conhecidos = {};
  Object.keys(campos).forEach(function (k) { campos[k].exatos.forEach(function (x) { conhecidos[x] = true; }); });
  let iCab = -1;
  for (let i = 0; i < Math.min(15, valores.length); i++) {
    const n = valores[i].filter(function (c) { return conhecidos[cabQ_(c)]; }).length;
    if (n >= 2) { iCab = i; break; }
  }
  if (iCab === -1) {
    // Layout desconhecido: o jeito antigo (a linha com COLABORADOR/NOME), senao a primeira.
    iCab = 0;
    for (let i = 0; i < Math.min(15, valores.length); i++) {
      if (valores[i].some(function (c) { const t = cabQ_(c); return t === 'COLABORADOR' || t === 'NOME' || t === 'PROD'; })) { iCab = i; break; }
    }
  }
  const cab = (valores[iCab] || []).map(cabQ_);
  return { cab: cab, linhas: valores.slice(iCab + 1), primeiraLinha: iCab + 2, col: colunasQ_(cab, campos) };
}

/* Coluna de cada campo: nome inteiro primeiro (na ordem da lista), pedaco depois; cada coluna serve a um campo so. */
function colunasQ_(cab, campos) {
  const usada = {}, col = {};
  Object.keys(campos).forEach(function (k) {
    const lista = campos[k].exatos;
    for (let e = 0; e < lista.length; e++) {
      const i = cab.indexOf(lista[e]);
      if (i !== -1 && !usada[i]) { col[k] = i; usada[i] = true; return; }
    }
  });
  Object.keys(campos).forEach(function (k) {
    if (col[k] !== undefined || !campos[k].pedacos.length) return;
    const evitar = campos[k].evitar || [];
    for (let i = 0; i < cab.length; i++) {
      const c = cab[i];
      if (!c || usada[i]) continue;
      if (campos[k].pedacos.some(function (p) { return c.indexOf(p) !== -1; }) &&
          !evitar.some(function (x) { return c.indexOf(x) !== -1; })) { col[k] = i; usada[i] = true; return; }
    }
  });
  return col;
}

function valorQ_(linha, col, campo) { return col[campo] === undefined ? '' : linha[col[campo]]; }

/* ------------------------------------------------------------------ */
/* EQUIPE E STATUS                                                     */
/* ------------------------------------------------------------------ */

/*
 * "1° TURNO", "1º TURNO" (o ordinal), "1 TURNO", "TURNO 1", "TA" (as abas
 * antigas e as abas de admitidos/desligados), "A" -> 1° TURNO; o mesmo para
 * o 2° e o 3°; ADM / ADMINISTRATIVO -> ADM. Fora disso: '' (vira
 * inconsistencia "equipe fora do padrao", com o valor como esta escrito).
 */
function equipeQ_(v) {
  const t = normalizaQ_(v).replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t) return '';
  if (/^ADM/.test(t)) return 'ADM';
  let m = t.match(/^(\d)\s*O?\s*TURNO$/) || t.match(/^TURNO\s*(\d)$/) || t.match(/^T\s*(\d)$/) || t.match(/^(\d)$/);
  if (m) return ['', '1° TURNO', '2° TURNO', '3° TURNO'][Number(m[1])] || '';
  m = t.match(/^(?:TURNO\s*|T\s*)?([ABC])$/);
  if (m) return { A: '1° TURNO', B: '2° TURNO', C: '3° TURNO' }[m[1]];
  if (/^PRIMEIRO/.test(t)) return '1° TURNO';
  if (/^SEGUNDO/.test(t)) return '2° TURNO';
  if (/^TERCEIRO/.test(t)) return '3° TURNO';
  return '';
}

/*
 * STATUS -> se a pessoa ainda esta na empresa. FORA: inativo, desligado,
 * demitido, rescisao, "nao"... Na empresa: ATIVO, FERIAS e AFASTADO
 * (afastamento, licenca, atestado, INSS) — os dois ultimos contam no
 * efetivo, mas a tela mostra quantos estao fora do posto. Vazio: na empresa.
 */
function situacaoQ_(v) {
  const t = normalizaQ_(v).replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'ATIVO';
  if (/^(INATIV|DESATIV|DESLIG|DEMIT|DEMISS|RESCI|EX |SAIU|SAIDA|FORA|BAIXA|NAO|N$|FALSE|ENCERR|TERMIN|DISPENS|TRANSFERID)/.test(t)) return 'FORA';
  if (/FERIAS/.test(t)) return 'FERIAS';
  if (/(AFAST|LICEN|ATESTAD|INSS|AUXILIO|MATERNID|PATERNID|ACIDENT)/.test(t)) return 'AFASTADO';
  return 'ATIVO';
}

/* ------------------------------------------------------------------ */
/* LEITURA                                                             */
/* ------------------------------------------------------------------ */

function lerPlanilhaQuadro_(id) {
  exigirPorta_();
  const ss = SpreadsheetApp.openById(id);
  const leitura = { aba: '', linhas: 0, colunas: {}, faltam: [], status: {}, equipes: {}, gid: null, linhaCabecalho: 0 };
  const geral = [];

  const abaGeral = abaQuadro_(ss, QUADRO_ABA_GERAL);
  if (abaGeral) {
    const t = lerTabelaQ_(abaGeral, QUADRO_COLUNAS);
    leitura.aba = abaGeral.getName();
    leitura.linhaCabecalho = t.primeiraLinha - 1;
    try { leitura.gid = abaGeral.getSheetId(); } catch (e) { leitura.gid = null; }   // "abrir na planilha" vai direto a linha
    Object.keys(t.col).forEach(function (k) { leitura.colunas[k] = t.cab[t.col[k]]; });
    leitura.faltam = ['equipe', 'cod', 'nome', 'funcao', 'rh', 'status'].filter(function (k) { return t.col[k] === undefined; });
    t.linhas.forEach(function (linha, i) {
      const r = linhaGeralQ_(linha, t.col, t.primeiraLinha + i, '');
      if (r) geral.push(r);
    });
    leitura.layout = 'GERAL';
  } else {
    // Planilha ainda no layout antigo: as tres abas APOIO, com o turno vindo do nome da aba.
    QUADRO_ABAS_APOIO.forEach(function (nomeAba) {
      const aba = abaQuadro_(ss, nomeAba);
      if (!aba) return;
      const t = lerTabelaQ_(aba, QUADRO_COLUNAS);
      const turnoDaAba = nomeAba.replace(/APOIO\s*/i, '').trim();
      t.linhas.forEach(function (linha, i) {
        const r = linhaGeralQ_(linha, t.col, t.primeiraLinha + i, turnoDaAba);
        if (r) { r.aba = aba.getName(); geral.push(r); }
      });
      if (!leitura.aba) Object.keys(t.col).forEach(function (k) { leitura.colunas[k] = t.cab[t.col[k]]; });
      leitura.aba = leitura.aba ? leitura.aba + ', ' + aba.getName() : aba.getName();
    });
    leitura.layout = leitura.aba ? 'APOIO' : '';
  }
  leitura.linhas = geral.length;
  // Chave de cada pessoa na tela: no layout APOIO o numero da linha se repete entre as abas.
  geral.forEach(function (r, i) { r.ref = i + 1; });
  // Como cada valor escrito foi entendido (a aba Conferencia mostra): STATUS -> situacao; EQUIPE -> turno.
  geral.forEach(function (r) {
    const k = r.status || '(vazio)';
    leitura.status[k] = leitura.status[k] || { n: 0, situacao: r.situacao };
    leitura.status[k].n++;
    const e = r.equipeBruta || '(vazio)';
    leitura.equipes[e] = leitura.equipes[e] || { n: 0, equipe: r.equipe };
    leitura.equipes[e].n++;
  });

  const adm = [];
  const abaAdm = abaQuadro_(ss, QUADRO_ABA_ADMITIDOS);
  if (abaAdm) {
    const t = lerTabelaQ_(abaAdm, Object.assign({}, QUADRO_COLUNAS, QUADRO_COLUNAS_ADM));
    t.linhas.forEach(function (linha) {
      const r = {
        cod: txtQ_(valorQ_(linha, t.col, 'cod')),
        rh: txtQ_(valorQ_(linha, t.col, 'rh')),
        nome: txtQ_(valorQ_(linha, t.col, 'nome')),
        equipeBruta: txtQ_(valorQ_(linha, t.col, 'equipe')).toUpperCase(),
        funcao: txtQ_(valorQ_(linha, t.col, 'funcao')).toUpperCase(),
        status: txtQ_(valorQ_(linha, t.col, 'status')).toUpperCase(),
        data: dataQ_(valorQ_(linha, t.col, 'data'))
      };
      if (!r.nome && !r.cod) return;
      r.equipe = equipeQ_(r.equipeBruta);
      r.mes = r.data ? r.data.slice(0, 7) : '';
      adm.push(r);
    });
  }

  const des = [];
  let temColunaMotivo = false;
  const abaDes = abaQuadro_(ss, QUADRO_ABA_DESLIGADOS);
  if (abaDes) {
    const t = lerTabelaQ_(abaDes, Object.assign({}, QUADRO_COLUNAS, QUADRO_COLUNAS_DES));
    temColunaMotivo = t.col.motivo !== undefined;
    t.linhas.forEach(function (linha) {
      const r = {
        cod: txtQ_(valorQ_(linha, t.col, 'cod')),
        rh: txtQ_(valorQ_(linha, t.col, 'rh')),
        nome: txtQ_(valorQ_(linha, t.col, 'nome')),
        equipeBruta: txtQ_(valorQ_(linha, t.col, 'equipe')).toUpperCase(),
        funcao: txtQ_(valorQ_(linha, t.col, 'funcao')).toUpperCase(),
        data: dataQ_(valorQ_(linha, t.col, 'data')),
        tipo: txtQ_(valorQ_(linha, t.col, 'tipo')) || 'Não informado',
        motivo: txtQ_(valorQ_(linha, t.col, 'motivo'))
      };
      if (!r.data || (!r.nome && !r.cod)) return;     // sem data nao entra no periodo (como antes)
      r.equipe = equipeQ_(r.equipeBruta);
      r.mes = r.data.slice(0, 7);
      des.push(r);
    });
  }

  return {
    formato: QUADRO_FORMATO,
    geral: geral, adm: adm, des: des,
    inconsistencias: inconsistenciasQ_(geral, adm, des),
    leitura: leitura,
    atualizado: new Date().toISOString(),
    fonte: { nome: ss.getName(), url: ss.getUrl() },
    temColunaMotivo: temColunaMotivo
  };
}

/* Uma linha da GERAL (ou de uma aba APOIO). Linha sem nome, produtivo nem matricula nao e gente. */
function linhaGeralQ_(linha, col, numeroLinha, turnoDaAba) {
  const r = {
    cod: txtQ_(valorQ_(linha, col, 'cod')),
    nome: txtQ_(valorQ_(linha, col, 'nome')),
    rh: txtQ_(valorQ_(linha, col, 'rh')),
    equipeBruta: txtQ_(valorQ_(linha, col, 'equipe')).toUpperCase() || turnoDaAba,
    funcao: txtQ_(valorQ_(linha, col, 'funcao')).toUpperCase(),
    status: txtQ_(valorQ_(linha, col, 'status')).toUpperCase(),
    linha: numeroLinha
  };
  if (!r.nome && !r.cod && !r.rh) return null;
  r.equipe = equipeQ_(r.equipeBruta);
  r.situacao = situacaoQ_(r.status);
  r.ativo = r.situacao !== 'FORA';
  return r;
}

/* ------------------------------------------------------------------ */
/* INCONSISTENCIAS                                                     */
/* ------------------------------------------------------------------ */

/* Produtivo e matricula comparados sem zeros a esquerda ("030001" = 30001); nome sem acento e espaco duplo. */
function codigoQ_(v) { return txtQ_(v).replace(/\s+/g, '').replace(/\.0+$/, '').replace(/^0+(?=\d)/, '').toUpperCase(); }
function nomeChaveQ_(v) { return normalizaQ_(v).replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function dataCurtaQ_(iso) { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || ''); }

function indiceQ_(lista) {
  const ix = { cod: {}, rh: {}, nome: {} };
  lista.forEach(function (r) {
    const c = codigoQ_(r.cod), m = codigoQ_(r.rh), n = nomeChaveQ_(r.nome);
    if (c) (ix.cod[c] = ix.cod[c] || []).push(r);
    if (m) (ix.rh[m] = ix.rh[m] || []).push(r);
    if (n) (ix.nome[n] = ix.nome[n] || []).push(r);
  });
  return ix;
}
/* Acha a pessoa: pelo produtivo, senao pela matricula, senao pelo nome. Devolve { lista, chave }. */
function acharQ_(ix, r) {
  const c = codigoQ_(r.cod), m = codigoQ_(r.rh), n = nomeChaveQ_(r.nome);
  if (c && ix.cod[c]) return { lista: ix.cod[c], chave: 'produtivo' };
  if (m && ix.rh[m]) return { lista: ix.rh[m], chave: 'matrícula' };
  if (n && ix.nome[n]) return { lista: ix.nome[n], chave: 'nome' };
  return null;
}

function inconsistenciasQ_(geral, adm, des) {
  const saida = [];
  const ix = indiceQ_(geral), ixAdm = indiceQ_(adm), ixDes = indiceQ_(des);
  const quem = function (g) { return { cod: g.cod, rh: g.rh, nome: g.nome, equipe: g.equipe || g.equipeBruta, linha: g.linha, ref: g.ref, aba: g.aba || '' }; };
  const ondeQ = function (g) { return (g.aba ? g.aba + ' ' : '') + g.linha; };

  // 1. Desligado que continua ATIVO na GERAL (o pedido): um aviso por linha da GERAL, com o desligamento mais recente.
  const jaVisto = {};
  des.slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); }).forEach(function (d) {
    const achou = acharQ_(ix, d);
    if (!achou) return;
    achou.lista.filter(function (g) { return g.ativo; }).forEach(function (g) {
      if (jaVisto[g.linha]) return;
      jaVisto[g.linha] = true;
      const voltou = acharQ_(ixAdm, d);
      const readmitido = voltou && voltou.lista.some(function (a) { return a.data && a.data > d.data; });
      saida.push(Object.assign(quem(g), {
        tipo: 'DESLIGADO_ATIVO', gravidade: 'grave', data: d.data, chave: achou.chave,
        detalhe: 'Desligado em ' + dataCurtaQ_(d.data) + (d.motivo ? ' (' + d.motivo + ')' : '') +
          ', mas está ' + (g.status || 'sem status') + ' na ' + (g.aba || 'GERAL') + '.' +
          (achou.chave !== 'produtivo' ? ' Encontrado pelo ' + achou.chave + '.' : '') +
          (readmitido ? ' Está também nos admitidos depois dessa data: confira se foi readmitido.' : '')
      }));
    });
  });

  // 2. Linha sem nome (a coluna PROD vazia).
  geral.filter(function (g) { return !g.nome; }).forEach(function (g) {
    saida.push(Object.assign(quem(g), { tipo: 'SEM_NOME', gravidade: 'atencao', nome: '',
      detalhe: 'Sem o nome (coluna PROD)' + (g.cod ? ' — produtivo ' + g.cod : '') + (g.rh ? ', matrícula ' + g.rh : '') + '.' }));
  });

  // 3. Equipe fora do padrao (so de quem esta na empresa: e quem precisa de um turno).
  geral.filter(function (g) { return g.ativo && !g.equipe; }).forEach(function (g) {
    saida.push(Object.assign(quem(g), { tipo: 'EQUIPE', gravidade: 'atencao',
      detalhe: g.equipeBruta ? 'EQUIPE "' + g.equipeBruta + '" não é 1° TURNO, 2° TURNO, 3° TURNO nem ADM.' : 'Sem EQUIPE.' }));
  });

  // 4 e 5. Produtivo e matricula repetidos entre os que estao na empresa.
  [['cod', 'COD_REPETIDO', 'O produtivo'], ['rh', 'RH_REPETIDO', 'A matrícula']].forEach(function (x) {
    const grupos = {};
    geral.filter(function (g) { return g.ativo; }).forEach(function (g) {
      const k = codigoQ_(g[x[0]]);
      if (k) (grupos[k] = grupos[k] || []).push(g);
    });
    Object.keys(grupos).filter(function (k) { return grupos[k].length > 1; }).forEach(function (k) {
      const gs = grupos[k];
      saida.push(Object.assign(quem(gs[0]), { tipo: x[1], gravidade: 'atencao',
        nome: gs.map(function (g) { return g.nome || '(sem nome)'; }).join(' · '),
        linhas: gs.map(ondeQ), refs: gs.map(function (g) { return g.ref; }),
        detalhe: x[2] + ' ' + gs[0][x[0]] + ' está em ' + gs.length + ' linhas ativas (' + gs.map(ondeQ).join(', ') + ').' }));
    });
  });

  // 6. Admitido que nao entrou na GERAL (nem saiu depois).
  adm.forEach(function (a) {
    if (situacaoQ_(a.status) === 'FORA' || acharQ_(ix, a) || acharQ_(ixDes, a)) return;
    saida.push({ tipo: 'ADMITIDO_FORA', gravidade: 'atencao', cod: a.cod, rh: a.rh, nome: a.nome,
      equipe: a.equipe || a.equipeBruta, linha: 0, data: a.data,
      detalhe: 'Está na aba de admitidos' + (a.data ? ' (' + dataCurtaQ_(a.data) + ')' : '') + ', mas não na GERAL.' });
  });
  return saida;
}

/* ------------------------------------------------------------------ */
/* UTEIS                                                               */
/* ------------------------------------------------------------------ */

function normalizaQ_(v) {
  return String(v == null ? '' : v).trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function txtQ_(v) {
  // Numero da planilha (produtivo, matricula) sem o ".0" que o Sheets as vezes devolve.
  if (typeof v === 'number' && isFinite(v) && Math.floor(v) === v) return String(v);
  return String(v == null ? '' : v).trim();
}

/** Data (ou texto dd/mm/aaaa) -> "aaaa-mm". */
function aoMesQ_(v) {
  const d = dataQ_(v);
  return d ? d.slice(0, 7) : '';
}

const MESES_Q = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
function dataQ_(v) {
  if (v && typeof v.getTime === 'function' && !isNaN(v.getTime())) return Utilities.formatDate(v, fuso(), 'yyyy-MM-dd');
  // Numero de serie do Sheets/Excel (dias desde 30/12/1899).
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  const s = txtQ_(v);
  // "ago/2025", "Agosto de 2025", "AGO-25"
  const mx = normalizaQ_(s).match(/^([A-Z]{3})[A-Z]*\s*(?:DE\s*)?[\/\-\s]?\s*(\d{2,4})$/);
  if (mx && MESES_Q.indexOf(mx[1]) !== -1) {
    const ano = mx[2].length === 2 ? '20' + mx[2] : mx[2];
    return ano + '-' + ('0' + (MESES_Q.indexOf(mx[1]) + 1)).slice(-2) + '-01';
  }
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?/);
  if (iso) return iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + (iso[3] || '1')).slice(-2);
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? '20' + br[3] : br[3];
    return ano + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2);
  }
  return '';
}

/* --- Acoes da tela --- */

function acaoSalvarFonteQuadro(usuario, params) {
  const link = String(params.link || '').trim();
  if (!link) throw new Error('Cole o link da planilha do Quadro.');
  const m = link.match(/\/d\/([\w-]{20,})/);
  const id = m ? m[1] : (/^[\w-]{20,}$/.test(link) ? link : '');
  if (!id) throw new Error('Esse link não parece de uma planilha do Google.');
  let nome = '';
  try {
    exigirPorta_();
    const ss = SpreadsheetApp.openById(id);
    nome = ss.getName();
    const temQuadro = abaQuadro_(ss, QUADRO_ABA_GERAL) || QUADRO_ABAS_APOIO.some(function (a) { return abaQuadro_(ss, a); });
    if (!temQuadro && !abaQuadro_(ss, QUADRO_ABA_ADMITIDOS) && !abaQuadro_(ss, QUADRO_ABA_DESLIGADOS)) {
      throw new Error('A planilha não tem nenhuma das abas esperadas (GERAL, CADMITIDOS, CDESLIGADOS).');
    }
  } catch (e) {
    throw new Error(String(e.message || e).indexOf('abas') !== -1 ? e.message
      : 'Não consegui abrir a planilha. A conta dona do GSL precisa ter acesso a ela.');
  }
  acaoSalvarParametro(usuario, { chave: 'QUADRO_PLANILHA', valor: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    descricao: 'Link da planilha do Quadro do CD' });
  return { ok: true, invalidarTudo: true, recado: 'Quadro ligado à planilha "' + nome + '".' };
}

function acaoAtualizarQuadro(usuario) {
  const id = idPlanilhaQuadro_();
  if (id) { try { CacheService.getScriptCache().remove(chaveNoEspaco('quadro|' + id)); } catch (e) {} }
  // A chave e fatiada (gravarTextoCache): sem o numero de fatias, a leitura
  // volta vazia e a planilha e relida.
  limparCache('PARAMETROS');
  return { ok: true, recado: 'Quadro relido da planilha.' };
}
