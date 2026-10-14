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
 * 14/10 — FÉRIAS. A aba FÉRIAS da mesma planilha (a extracao do sistema de
 * RH: matricula, nome, centro de custo, periodo aquisitivo e as datas
 * limite) e cruzada com a GERAL pela matricula — os ultimos numeros do RH.
 * A tela mostra quem esta perto do limite antes da multa.
 *
 * INCONSISTENCIAS: desligado (CDESLIGADOS) que continua ATIVO na GERAL — o
 * pedido da gerencia, a unica "grave" (a faixa vermelha da tela) — e, como
 * "atencao", o que deixa o quadro errado: linha sem nome, EQUIPE fora do
 * padrao, produtivo ou matricula repetidos e admitido que nao entrou na
 * GERAL. Cada uma diz a linha da planilha.
 */
const BUILD_QUADRO = '2026.10.14';   // carimbo da entrega — ver APP.build no Codigo.gs

const QUADRO_ABA_GERAL = 'GERAL';
const QUADRO_ABAS_APOIO = ['APOIO TA', 'APOIO TB', 'APOIO TC'];
const QUADRO_ABA_ADMITIDOS = 'CADMITIDOS';
const QUADRO_ABA_DESLIGADOS = 'CDESLIGADOS';
const QUADRO_ABA_FERIAS = 'FÉRIAS';
/*
 * PARAMETROS DAS FERIAS (14/10): editaveis na propria aba Ferias (botao
 * Parametros, para quem pode trocar a planilha); cada filial tem os seus.
 *   cc       centro(s) de custo do CD: linha da FÉRIAS dele sem par na GERAL
 *            vira conferencia (as dos outros centros sao de outros setores)
 *   digitos  quantos numeros do fim do RH formam a matricula da FÉRIAS
 *   aviso    antecedencia do aviso de ferias (dias): o "avisar ate" e o
 *            limite menos isso; limite a menos disso e critico
 *   avisar   limite em ate N dias: "avisar ja"
 *   planejar limite em ate N dias: "planejar"
 *   janela   escalonar: limites a menos de N dias um do outro
 *   meses    escalonar e o mapa por turno olham os proximos N meses
 * Valor vazio (ou invalido, editado a mao na Configuracao) = o padrao.
 */
const FERIAS_PADRAO = { cc: ['655'], digitos: 3, aviso: 30, avisar: 60, planejar: 90, janela: 30, meses: 6 };
const FERIAS_CHAVES = { cc: 'FERIAS_CC', digitos: 'FERIAS_DIGITOS_RH', aviso: 'FERIAS_AVISO_DIAS', avisar: 'FERIAS_AVISAR_DIAS',
  planejar: 'FERIAS_PLANEJAR_DIAS', janela: 'FERIAS_ESCALONAR_DIAS', meses: 'FERIAS_ESCALONAR_MESES' };
const FERIAS_LIMITES = { digitos: [1, 8], aviso: [0, 120], avisar: [1, 400], planejar: [2, 400], janela: [1, 120], meses: [1, 24] };
function parametrosFeriasQ_() {
  const ler = function (k) { const v = parametro(FERIAS_CHAVES[k], ''); return v == null ? '' : String(v).trim(); };
  const n = function (k) {
    const t = ler(k), v = Number(t.replace(',', '.')), lim = FERIAS_LIMITES[k];
    return t !== '' && isFinite(v) && Math.round(v) === v && v >= lim[0] && v <= lim[1] ? v : FERIAS_PADRAO[k];
  };
  const cc = ler('cc').split(/[^0-9]+/)
    .map(function (x) { return x.replace(/^0+(?=\d)/, ''); }).filter(function (x) { return /[1-9]/.test(x); });
  const p = { cc: cc.length ? cc : FERIAS_PADRAO.cc.slice(), digitos: n('digitos'), aviso: n('aviso'), avisar: n('avisar'), planejar: n('planejar'),
    janela: n('janela'), meses: n('meses') };
  // as faixas em ordem: aviso < avisar < planejar (editado fora de ordem a mao: volta ao padrao)
  if (p.avisar <= p.aviso || p.planejar <= p.avisar) { p.aviso = FERIAS_PADRAO.aviso; p.avisar = FERIAS_PADRAO.avisar; p.planejar = FERIAS_PADRAO.planejar; }
  return p;
}
const QUADRO_EQUIPES = ['1° TURNO', '2° TURNO', '3° TURNO', 'ADM'];
// O formato do que vai para o cache: copia de outro formato (versao anterior do Quadro.gs) e relida.
// 4 (14/10): com as ferias.
const QUADRO_FORMATO = 4;

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
  CDESLIGADOS: { nomes: ['CDESLIGADOS', 'CDDESLIGADOS', 'DESLIGADOS', 'DESLIGAMENTOS', 'CDESLIGAMENTOS', 'CDDESLIGAMENTOS'], pedacos: ['DESLIG', 'DEMITID', 'DEMISS'] },
  'FÉRIAS': { nomes: ['FERIAS', 'CFERIAS', 'CDFERIAS', 'FERIASCD', 'BASEFERIAS', 'EXTRACAOFERIAS', 'CONTROLEFERIAS', 'CONTROLEDEFERIAS'], pedacos: ['FERIAS'] }
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
  const pf = parametrosFeriasQ_();
  const base = {
    configurado: !!id,
    podeConfigurar: podeFazer(usuario, 'PROGRAMAR'),
    filial: filialAtual().nome,
    parametrosFerias: pf
  };
  if (!id) return base;

  const chave = chaveQuadroQ_(id);
  const guardado = lerTextoCache(chave);
  if (guardado) {
    try {
      const g = JSON.parse(guardado);
      if (g && g.formato === QUADRO_FORMATO && g.assinaturaFerias === assinaturaFeriasQ_(pf)) return Object.assign(base, g);
    } catch (e) { /* le de novo */ }
  }
  try {
    const dados = lerPlanilhaQuadro_(id, pf);
    dados.assinaturaFerias = assinaturaFeriasQ_(pf);
    gravarTextoCache(chave, JSON.stringify(dados), QUADRO_CACHE_SEGUNDOS);
    return Object.assign(base, dados);
  } catch (e) {
    base.erro = e && e.semAba ? e.message : 'Não consegui ler a planilha do Quadro: ' + (e.message || e) +
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
  nome:   { exatos: ['PROD', 'COLABORADOR', 'NOME', 'NOME DO COLABORADOR', 'NOME COMPLETO', 'FUNCIONARIO'], pedacos: ['COLABORADOR', 'NOME', 'FUNCIONARIO'], evitar: ['COD', 'MATRIC', 'PRODUTIV'] },
  cod:    { exatos: ['COD', 'CODIGO', 'PRODUTIVA', 'PRODUTIVO', 'COD PRODUTIVO', 'CODIGO PRODUTIVO', 'N PRODUTIVO'], pedacos: ['PRODUTIV', 'COD'], evitar: ['DESCRI', 'RH', 'MATRIC'] },
  rh:     { exatos: ['RH', 'MATRICULA', 'MATRICULA RH', 'MAT RH', 'MAT', 'COD RH', 'CODIGO RH', 'N RH'], pedacos: ['MATRIC', 'RH'] },
  equipe: { exatos: ['EQUIPE', 'TURNO', 'EQUIPE TURNO'], pedacos: ['EQUIPE', 'TURNO'] },
  funcao: { exatos: ['DESCRICAO', 'FUNCAO', 'CARGO', 'DESCRICAO DA FUNCAO'], pedacos: ['FUNCAO', 'CARGO', 'DESCRICAO'] },
  status: { exatos: ['STATUS', 'SITUACAO'], pedacos: ['STATUS', 'SITUAC'] }
};
const QUADRO_COLUNAS_ADM = {
  data: { exatos: ['DATA ADMISSAO', 'DATA DE ADMISSAO', 'ADMISSAO', 'DATA'], pedacos: ['ADMISS', 'ADMIT', 'DATA', 'ENTRADA', 'INICIO', 'MES'], evitar: ['MOTIVO', 'TIPO', 'STATUS', 'SITUAC', 'NASC'] }
};
const QUADRO_COLUNAS_DES = {
  data:   { exatos: ['DATA DESLIGAMENTO', 'DATA DO DESLIGAMENTO', 'DATA DEMISSAO', 'DATA DE DEMISSAO', 'DESLIGAMENTO', 'DATA'], pedacos: ['DESLIG', 'DEMISS', 'SAIDA', 'DATA'], evitar: ['MOTIVO', 'TIPO', 'ADMISS', 'NASC'] },
  tipo:   { exatos: ['TIPO', 'TIPO DE DESLIGAMENTO', 'TIPO DESLIGAMENTO'], pedacos: ['TIPO'], evitar: ['MOTIVO'] },
  motivo: { exatos: ['MOTIVO', 'MOTIVO DO DESLIGAMENTO', 'MOTIVO DESLIGAMENTO'], pedacos: ['MOTIVO'] }
};
/*
 * Aba FÉRIAS (14/10): a extracao do sistema de RH, como vem — Empresa,
 * Filial, Matricula, Descricao, Nome, cc, turno, admissao, pa_inicio,
 * pa_fim, DTA_LIMITE, DTA_LIMITEMAX, dias vencidos, codfuc, tipfuncao.
 * "pa_inicio" vira "PA INICIO" no cabecalho comparavel. TIPFUNCAO e CODFUC
 * nao sao a funcao (por isso a funcao nao e achada pelo pedaco FUNCAO).
 */
const QUADRO_COLUNAS_FERIAS = {
  matricula:    { exatos: ['MATRICULA', 'MATRIC', 'MAT', 'MATRICULA RH', 'CHAPA', 'REGISTRO'], pedacos: ['MATRIC'] },
  nome:         { exatos: ['NOME', 'NOME DO COLABORADOR', 'NOME COLABORADOR', 'COLABORADOR', 'FUNCIONARIO', 'NOME FUNCIONARIO', 'NOME COMPLETO'],
                  pedacos: ['NOME', 'COLABORADOR', 'FUNCIONARIO'], evitar: ['EMPRESA', 'FILIAL', 'FUNCAO', 'CARGO', 'TURNO', 'CUSTO'] },
  funcao:       { exatos: ['DESCRICAO', 'FUNCAO', 'CARGO', 'DESCRICAO FUNCAO', 'DESCRICAO DA FUNCAO', 'DESCRICAO CARGO', 'DESCRICAO DO CARGO'],
                  pedacos: ['DESCRI', 'CARGO'], evitar: ['TIP', 'COD', 'TURNO', 'CUSTO', 'EMPRESA', 'FILIAL'] },
  cc:           { exatos: ['CC', 'C C', 'CENTRO DE CUSTO', 'CENTRO CUSTO', 'C CUSTO', 'CCUSTO', 'COD CC'], pedacos: ['CUSTO'] },
  equipe:       { exatos: ['TURNO', 'EQUIPE', 'DESCRICAO TURNO'], pedacos: ['TURNO'] },
  admissao:     { exatos: ['ADMISSAO', 'DATA ADMISSAO', 'DATA DE ADMISSAO', 'DT ADMISSAO', 'DTA ADMISSAO'], pedacos: ['ADMISS'] },
  paInicio:     { exatos: ['PA INICIO', 'INICIO PA', 'PA INI', 'INICIO PERIODO AQUISITIVO', 'PERIODO AQUISITIVO INICIO', 'INICIO AQUISITIVO', 'DT INICIO PA'],
                  pedacos: ['PA INI', 'INICIO PER', 'AQUISITIVO INI'] },
  paFim:        { exatos: ['PA FIM', 'FIM PA', 'FIM PERIODO AQUISITIVO', 'PERIODO AQUISITIVO FIM', 'FIM AQUISITIVO', 'DT FIM PA'],
                  pedacos: ['PA FIM', 'FIM PER', 'AQUISITIVO FIM'] },
  limite:       { exatos: ['DTA LIMITE', 'DATA LIMITE', 'DT LIMITE', 'LIMITE'], pedacos: [] },
  limiteMax:    { exatos: ['DTA LIMITEMAX', 'DTA LIMITE MAX', 'DTA LIMITE MAXIMA', 'DATA LIMITE MAX', 'DATA LIMITE MAXIMA', 'DT LIMITEMAX', 'DT LIMITE MAX',
                  'LIMITEMAX', 'LIMITE MAX', 'LIMITE MAXIMO'], pedacos: ['LIMITEMAX', 'LIMITE MAX'] },
  diasVencidos: { exatos: ['DIAS VENCIDOS', 'DIAS VENC', 'DIAS VENCIDO', 'VENCIDOS', 'QTD DIAS VENCIDOS', 'QT DIAS VENCIDOS'], pedacos: ['VENCID'] },
  empresa:      { exatos: ['EMPRESA'], pedacos: [] },
  filial:       { exatos: ['FILIAL'], pedacos: [] }
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
  // Depois, por pedaco — na ordem de prioridade dos pedacos (nao a da posicao da coluna).
  Object.keys(campos).forEach(function (k) {
    if (col[k] !== undefined || !campos[k].pedacos.length) return;
    const evitar = campos[k].evitar || [];
    const pedacos = campos[k].pedacos;
    for (let p = 0; p < pedacos.length; p++) {
      for (let i = 0; i < cab.length; i++) {
        const c = cab[i];
        if (!c || usada[i]) continue;
        if (c.indexOf(pedacos[p]) !== -1 && !evitar.some(function (x) { return c.indexOf(x) !== -1; })) { col[k] = i; usada[i] = true; return; }
      }
    }
  });
  return col;
}

function valorQ_(linha, col, campo) { return col[campo] === undefined ? '' : linha[col[campo]]; }

/*
 * Celulas mescladas (ex.: "1° TURNO" mesclado no bloco do turno): o Sheets
 * so devolve o valor na primeira linha da mesclagem. Aqui as linhas de baixo
 * recebem o valor de cima — so dentro das mesclagens de verdade, nunca por
 * palpite. Devolve quantas linhas foram completadas.
 */
function preencherMescladasQ_(aba, t) {
  let n = 0;
  try {
    const mescladas = aba.getDataRange().getMergedRanges();
    mescladas.forEach(function (m) {
      const topo = m.getRow() - t.primeiraLinha, c = m.getColumn() - 1;
      if (topo < 0 || !t.linhas[topo]) return;              // mesclagem no titulo ou no cabecalho
      const v = t.linhas[topo][c];
      if (v === '' || v === null || v === undefined) return;
      for (let i = topo + 1; i < topo + m.getNumRows(); i++) {
        if (t.linhas[i] && (t.linhas[i][c] === '' || t.linhas[i][c] === null)) { t.linhas[i][c] = v; n++; }
      }
    });
  } catch (e) { /* sem acesso as mesclagens: segue com os valores como vieram */ }
  return n;
}

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

/*
 * Uma chave so por planilha: o "Atualizar dados" da barra lateral (Codigo.gs)
 * apaga esta mesma chave. O centro de custo e os numeros da matricula mudam o
 * casamento das ferias: vao dentro da copia guardada, e uma copia de outros
 * parametros e relida.
 */
function chaveQuadroQ_(id) { return chaveNoEspaco('quadro|' + id); }
function assinaturaFeriasQ_(pf) { return pf.cc.join(',') + '|' + pf.digitos; }

function lerPlanilhaQuadro_(id, pf) {
  pf = pf || parametrosFeriasQ_();
  exigirPorta_();
  const ss = SpreadsheetApp.openById(id);
  const leitura = { aba: '', linhas: 0, colunas: {}, faltam: [], status: {}, equipes: {}, gid: null, linhaCabecalho: 0 };
  const geral = [];

  const abaGeral = abaQuadro_(ss, QUADRO_ABA_GERAL);
  if (abaGeral) {
    const t = lerTabelaQ_(abaGeral, QUADRO_COLUNAS);
    leitura.mescladas = preencherMescladasQ_(abaGeral, t);
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
      preencherMescladasQ_(aba, t);
      const turnoDaAba = nomeAba.replace(/APOIO\s*/i, '').trim();
      t.linhas.forEach(function (linha, i) {
        const r = linhaGeralQ_(linha, t.col, t.primeiraLinha + i, turnoDaAba);
        if (r) { r.aba = aba.getName(); geral.push(r); }
      });
      if (!leitura.aba) Object.keys(t.col).forEach(function (k) { leitura.colunas[k] = t.cab[t.col[k]]; });
      leitura.aba = leitura.aba ? leitura.aba + ', ' + aba.getName() : aba.getName();
    });
    leitura.layout = leitura.aba ? 'APOIO' : '';
    if (!leitura.layout) {
      const e = new Error('Não achei a aba GERAL na planilha «' + ss.getName() + '». Confira o nome da aba (GERAL) — as abas APOIO TA, TB e TC não são mais usadas.');
      e.semAba = true;
      throw e;
    }
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
    leitura.adm = { aba: abaAdm.getName(), linhas: adm.length, semData: adm.filter(function (a) { return !a.data; }).length };
  } else {
    leitura.adm = null;
  }

  const des = [], desSemData = [];
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
        dataSoMes: soMesQ_(valorQ_(linha, t.col, 'data')),
        tipo: txtQ_(valorQ_(linha, t.col, 'tipo')) || 'Não informado',
        motivo: txtQ_(valorQ_(linha, t.col, 'motivo'))
      };
      if (!r.nome && !r.cod && !r.rh) return;
      r.equipe = equipeQ_(r.equipeBruta);
      // Sem data: fica fora dos graficos e do periodo, mas entra na conferencia (desligado que continua ATIVO).
      if (!r.data) { r.mes = ''; desSemData.push(r); return; }
      r.mes = r.data.slice(0, 7);
      des.push(r);
    });
    leitura.des = { aba: abaDes.getName(), linhas: des.length + desSemData.length, semData: desSemData.length, semMotivo: !temColunaMotivo };
  } else {
    leitura.des = null;
  }

  // Ferias (14/10): a extracao do sistema de RH, cruzada com a GERAL. Sem a aba, a tela diz como carregar.
  const ferias = lerFeriasQ_(ss, pf);
  const confFerias = casarFeriasQ_(geral, ferias, pf);
  if (ferias) {
    const ccs = {};
    ferias.linhas.forEach(function (f) { const k = f.cc || '(vazio)'; ccs[k] = (ccs[k] || 0) + 1; });
    leitura.ferias = { aba: ferias.aba, linhas: ferias.linhas.length, colunas: ferias.colunas, faltam: ferias.faltam,
      linhaCabecalho: ferias.linhaCabecalho, ligadas: ferias.linhas.filter(function (f) { return f.ref; }).length,
      peloNome: ferias.linhas.filter(function (f) { return f.chave === 'nome'; }).length, foraDoCd: ferias.foraDoCd, ccs: ccs };
  } else {
    leitura.ferias = null;
  }

  return {
    formato: QUADRO_FORMATO,
    geral: geral, adm: adm, des: des, desSemData: desSemData,
    // So as linhas do quadro (as de outros centros de custo sem par na GERAL sao de outros setores e ficam de fora).
    ferias: ferias ? { aba: ferias.aba, gid: ferias.gid, linhas: ferias.linhas.filter(function (f) { return f.ref || f.doCd; }) } : null,
    inconsistencias: inconsistenciasQ_(geral, adm, des.concat(desSemData)).concat(confFerias),
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
/* FERIAS (14/10)                                                      */
/* ------------------------------------------------------------------ */

/*
 * Le a aba FÉRIAS: uma linha por periodo aquisitivo em aberto. As datas
 * vem como data do Sheets ou como texto (10/06/2026); a tela calcula a
 * situacao de cada uma com a data de hoje. Linha sem matricula e sem nome
 * (vazia, total, rodape) nao conta. Sem a aba: null.
 */
function lerFeriasQ_(ss, pf) {
  const aba = abaQuadro_(ss, QUADRO_ABA_FERIAS);
  if (!aba) return null;
  const t = lerTabelaQ_(aba, QUADRO_COLUNAS_FERIAS);
  const r = { aba: aba.getName(), gid: null, linhaCabecalho: t.primeiraLinha - 1, colunas: {}, faltam: [], linhas: [], foraDoCd: 0,
    semCc: t.col.cc === undefined };
  try { r.gid = aba.getSheetId(); } catch (e) { r.gid = null; }
  Object.keys(t.col).forEach(function (k) { r.colunas[k] = t.cab[t.col[k]]; });
  // sem estas a aba nao serve para os avisos (o centro de custo e a admissao sao uteis, mas nao essenciais)
  r.faltam = ['matricula', 'nome', 'paFim', 'limiteMax'].filter(function (k) { return t.col[k] === undefined; });
  t.linhas.forEach(function (linha, i) {
    const v = function (k) { return valorQ_(linha, t.col, k); };
    const f = {
      linha: t.primeiraLinha + i,
      matricula: digitosQ_(v('matricula')),
      nome: txtQ_(v('nome')),
      funcao: txtQ_(v('funcao')).toUpperCase(),
      cc: txtQ_(v('cc')).replace(/[.,]0+$/, ''),
      equipeBruta: txtQ_(v('equipe')).toUpperCase(),
      admissao: dataQ_(v('admissao')),
      paInicio: dataQ_(v('paInicio')),
      paFim: dataQ_(v('paFim')),
      limite: dataQ_(v('limite')),
      limiteMax: dataQ_(v('limiteMax')),
      diasVencidos: numeroQ_(v('diasVencidos'))
    };
    if (!f.matricula && !f.nome) return;
    f.equipe = equipeQ_(f.equipeBruta);
    f.doCd = r.semCc || ccDoCdQ_(f.cc, (pf || FERIAS_PADRAO).cc);
    r.linhas.push(f);
  });
  return r;
}

/* So os numeros, sem zeros a esquerda ("0123" = "123"; 123.0 do Sheets = "123"). Sem nenhum numero de 1 a 9: ''. */
function digitosQ_(v) {
  const d = txtQ_(v).replace(/[.,]0+$/, '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
  return /[1-9]/.test(d) ? d : '';
}
/* Numero escrito do jeito brasileiro ("1.234,5") ou numero do Sheets; vazio: ''. */
function numeroQ_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : '';
  const s = txtQ_(v).replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(s);
  return s !== '' && isFinite(n) ? n : '';
}
/* Centro de custo do CD (655, "655 - CD", "0655"). Vazio: nao da para saber — conta como do CD. */
function ccDoCdQ_(cc, lista) {
  const t = txtQ_(cc);
  if (!t) return true;
  const m = t.match(/\d+/);
  return !!m && lista.indexOf(m[0].replace(/^0+(?=\d)/, '')) !== -1;
}

/*
 * Nomes da mesma pessoa? A GERAL e digitada a mao e a FÉRIAS sai do sistema,
 * entao a grafia muda (THIAGO/TIAGO, LUIZ/LUIS, SOUZA/SOUSA, WELLINGTON/
 * WELINGTON, MAYCON/MAICON, WILLIAM/WILLIAN, RAPHAEL/RAFAEL). O nivel diz o
 * quanto os dois nomes batem:
 *   3 = o mesmo nome (na grafia acertada);
 *   2 = o mesmo primeiro nome e mais um nome em comum (ou um dos lados so com o primeiro nome);
 *   1 = o primeiro nome so com a inicial ("J CARLOS SILVA"), ou sem o primeiro nome:
 *       todos os nomes do mais curto estao no outro ("PAULA SOUZA" = "ANA PAULA DE SOUZA");
 *   0 = outro nome (so o sobrenome em comum nao basta: irmaos, marido e mulher);
 *  -1 = um dos lados sem nome (nao da para comparar).
 */
const PARTICULAS_Q = { DA: 1, DE: 1, DO: 1, DAS: 1, DOS: 1, E: 1 };
function grafiaQ_(x) {
  if (x.length < 2) return x;                              // a inicial fica como esta
  return x.replace(/TH/g, 'T').replace(/PH/g, 'F').replace(/Y/g, 'I').replace(/W/g, 'V').replace(/K/g, 'C').replace(/Z/g, 'S')
    .replace(/^H(?=[AEIOU])/, '').replace(/(.)\1+/g, '$1').replace(/M$/, 'N');
}
function partesNomeQ_(v) { return nomeChaveQ_(v).split(' ').filter(function (x) { return x && !PARTICULAS_Q[x]; }); }
/* O nome sem particulas e com a grafia acertada: "THIAGO DOS SANTOS" = "TIAGO SANTOS". */
function nomeGrafiaQ_(v) { return partesNomeQ_(v).map(grafiaQ_).join(' '); }
function nivelNomeQ_(a, b) {
  const ra = partesNomeQ_(a), rb = partesNomeQ_(b);
  if (!ra.length || !rb.length) return -1;
  const ga = ra.map(grafiaQ_), gb = rb.map(grafiaQ_);
  if (ga.join(' ') === gb.join(' ')) return 3;
  const inteiro = function (x) { return x.length > 1; };   // uma inicial nao conta como nome em comum
  const algumEmComum = function (xa, xb) { return xa.some(function (x) { return inteiro(x) && xb.indexOf(x) !== -1; }); };
  if (ga[0] === gb[0]) return ga.length === 1 || gb.length === 1 || algumEmComum(ga.slice(1), gb.slice(1)) ? 2 : 0;
  // a inicial e comparada com a letra escrita (antes da grafia: o H de HELENA, o M de MARIA)
  const inicial = function (x, y) { return x.length === 1 && y.charAt(0) === x; };
  if ((inicial(ra[0], rb[0]) || inicial(rb[0], ra[0])) && algumEmComum(ga.slice(1), gb.slice(1))) return 1;
  const curto = ga.length <= gb.length ? ga : gb, longo = curto === ga ? gb : ga;
  if (curto.length >= 2 && curto.every(function (x) { return inteiro(x) && longo.indexOf(x) !== -1; })) return 1;
  return 0;
}
function nomeParecidoQ_(a, b) { return nivelNomeQ_(a, b) !== 0; }
/*
 * A forca do nome num par (linha, pessoa): 40 o mesmo nome; 30 o mesmo primeiro
 * nome sem contradicao; 20 a inicial ou o nome sem o primeiro nome; 15/10 os
 * mesmos com contradicao (cada lado tem um nome que o outro nao tem: "BRUNO
 * ANTONIO SILVA" x "BRUNO MARTINS SILVA"); 5 sem nome de um dos lados; 0 outro nome.
 */
function forcaNomeQ_(a, b) {
  const L = nivelNomeQ_(a, b);
  if (L === 3) return 40;
  if (L === -1) return 5;
  if (L === 0) return 0;
  const ga = partesNomeQ_(a).map(grafiaQ_), gb = partesNomeQ_(b).map(grafiaQ_);
  const sobra = function (x, y) { return x.slice(1).some(function (n) { return n.length > 1 && y.indexOf(n) === -1; }); };
  const contradiz = sobra(ga, gb) && sobra(gb, ga);
  return L === 2 ? (contradiz ? 15 : 30) : (contradiz ? 10 : 20);
}

/*
 * Cada linha da FÉRIAS acha a pessoa da GERAL (f.ref) pela Matricula: os
 * ultimos numeros do RH (3; ou todos os da matricula, se ela tiver mais).
 * As linhas da mesma matricula e do mesmo nome sao uma pessoa (um periodo
 * por linha). Uma pessoa da GERAL tem uma matricula so.
 * 1. Pela matricula, com o nome conferido. Cada par (linha, pessoa com esse
 *    final de RH) vale mais quanto mais numeros da matricula batem (1456
 *    antes de 456), quanto mais o nome bate (nivelNomeQ_) e se a pessoa esta
 *    ativa. Os pares entram do mais forte para o mais fraco; quem ja tem uma
 *    matricula nao recebe outra. Empate no melhor par: "duas pessoas".
 *    Linha do CD: o nome precisa bater ao menos no nivel 1 (ou faltar de um
 *    lado, so com gente ativa). Linha de outro centro de custo: nivel 2 ou 3.
 *    Quem ja saiu fica com a linha so se o nome bater (a tela a deixa de fora).
 * 2. O que sobrou, so nas linhas do CD: pelo nome igual, a pessoa ativa SEM
 *    RH na GERAL (linha sem matricula: qualquer RH, nao ha numero que
 *    desminta). Com outro RH e um homonimo, ou o RH esta errado: conferencia.
 * 3. Conferencias (todas "atencao"), so das linhas do CD: a matricula e de
 *    alguem ativo de outro nome que nao tem linha (FERIAS_NOME); empate
 *    (FERIAS_DUPLA); ninguem da GERAL e o dono (FERIAS_FORA_GERAL). A linha
 *    de outro centro de custo que sobra e de outro setor (foraDoCd).
 * Quem esta no quadro sem linha vira FERIAS_SEM_DADOS, dizendo por que.
 */
function casarFeriasQ_(geral, ferias, pf) {
  const saida = [];
  if (!ferias) return saida;
  const N = (pf || FERIAS_PADRAO).digitos;                         // quantos numeros do fim do RH formam a matricula
  const zeros = new Array(N + 1).join('0');
  const fimRh = function (g) { const d = digitosQ_(g.rh); return d && d.length < N ? (zeros + d).slice(-N) : d; };
  const completa = function (m) { return m.length < N ? (zeros + m).slice(-N) : m; };
  const ehDoFinal = function (g, mm) { return fimRh(g).slice(-mm.length) === mm; };
  const porFim = {}, porNome = {};
  geral.forEach(function (g) {
    const d = fimRh(g);
    if (d) (porFim[d.slice(-N)] = porFim[d.slice(-N)] || []).push(g);
    const n = nomeGrafiaQ_(g.nome);
    if (n && g.ativo) (porNome[n] = porNome[n] || []).push(g);
  });
  const quemG = function (g) { return (g.nome || 'uma linha sem nome') + (g.rh ? ' (RH ' + g.rh + ')' : ' (sem RH na GERAL)'); };
  const item = function (f, tipo, detalhe, g) {
    return { tipo: tipo, gravidade: 'atencao', cod: g ? g.cod : '', rh: g ? g.rh : '', nome: g ? (g.nome || f.nome) : f.nome,
      equipe: g ? (g.equipe || g.equipeBruta) : (f.equipe || f.equipeBruta), linha: f.linha, aba: ferias.aba, gid: ferias.gid,
      ref: g ? g.ref : 0, matricula: f.matricula, detalhe: detalhe };
  };
  // as linhas da mesma matricula e do mesmo nome (na grafia) sao uma pessoa
  const grupos = [], porChave = {};
  ferias.linhas.forEach(function (f) {
    f.ref = 0; f.chave = '';
    const mm = f.matricula ? completa(f.matricula) : '';
    const k = mm + '|' + nomeGrafiaQ_(f.nome);
    let G = porChave[k];
    if (!G) { G = porChave[k] = { mm: mm, nome: nomeGrafiaQ_(f.nome), f: f, linhas: [], doCd: false, cands: [], pares: [] }; grupos.push(G); }
    G.linhas.push(f);
    if (f.doCd) G.doCd = true;
  });
  // uma pessoa da GERAL fica com uma matricula so; a mesma matricula com outro nome escrito e outra pessoa
  // (so a linha sem nome pode ser mais um periodo de quem ja tem a sua)
  const matDe = {}, nomeDe = {};
  const livre = function (g, G) { return !matDe[g.ref] || (matDe[g.ref] === G.mm && (!nomeDe[g.ref] || !G.nome || nomeDe[g.ref] === G.nome)); };
  const ligar = function (G, g, chave) {
    G.dono = g; G.chave = chave;
    if (G.mm) matDe[g.ref] = G.mm; else if (!matDe[g.ref]) matDe[g.ref] = '#' + g.ref;
    if (G.nome && !nomeDe[g.ref]) nomeDe[g.ref] = G.nome;
    G.linhas.forEach(function (f) { f.ref = g.ref; f.chave = chave; });
  };
  // 1. pela matricula: os pares do mais forte para o mais fraco
  const pares = [];
  grupos.forEach(function (G) {
    if (!G.mm) return;
    G.cands = (porFim[G.mm.slice(-N)] || []).filter(function (g) { return ehDoFinal(g, G.mm); });
    G.cands.forEach(function (g) {
      const F = forcaNomeQ_(G.f.nome, g.nome);
      // linha do CD: qualquer nome que bata (ou sem nome, so com gente ativa); de outro centro de custo: o mesmo nome ou o mesmo primeiro nome sem contradicao
      const serve = F === 5 ? G.doCd && g.ativo : F >= (G.doCd ? 10 : 30);
      if (!serve) return;
      // mais numeros da matricula, depois a pessoa ativa (quem ja saiu so ganha se nenhuma ativa servir), depois o nome
      const p = { G: G, g: g, F: F, k: G.mm.length * 1000 + (g.ativo ? 100 : 0) + F };
      G.pares.push(p); pares.push(p);
    });
  });
  pares.sort(function (a, b) { return b.k - a.k || (a.g.linha || 0) - (b.g.linha || 0); });
  pares.forEach(function (p) {
    const G = p.G;
    if (G.dono || G.empate || !livre(p.g, G)) return;
    const iguais = G.pares.filter(function (q) { return q.k === p.k && livre(q.g, G); });
    if (iguais.length > 1 && p.g.ativo) { G.empate = iguais.map(function (q) { return q.g; }); return; }
    ligar(G, p.g, 'matricula');                                    // empate entre quem ja saiu: tanto faz, sai da tela
  });
  // 2. o que sobrou das linhas do CD: pelo nome igual, quem esta sem RH na GERAL
  grupos.forEach(function (G) {
    if (G.dono || G.empate || !G.doCd) return;
    const n = nomeGrafiaQ_(G.f.nome);
    G.pn = ((n && porNome[n]) || []).filter(function (g) { return G.cands.indexOf(g) === -1; });
    G.semRh = (G.mm ? G.pn.filter(function (g) { return !digitosQ_(g.rh); }) : G.pn).filter(function (g) { return livre(g, G); });
    if (G.semRh.length === 1) ligar(G, G.semRh[0], 'nome');
  });
  // 3. conferencias (so das linhas do CD) e o motivo de quem ficou sem linha (o das linhas do CD vale primeiro)
  const recusa = {};
  const recusar = function (lista, texto) { lista.forEach(function (g) { if (!recusa[g.ref]) recusa[g.ref] = texto; }); };
  grupos.filter(function (G) { return G.doCd; }).concat(grupos.filter(function (G) { return !G.doCd; })).forEach(function (G) {
    const f = G.f;
    const quemF = (f.nome || 'uma linha sem nome') + ' (linha ' + f.linha + (G.doCd ? '' : ', centro de custo ' + (f.cc || 'vazio')) + ')';
    // gente ativa com esse final que nao ficou com nenhuma matricula: a linha podia ser dela (outro nome)
    const ativos = G.cands.filter(function (g) { return g.ativo; });
    const semLinha = ativos.filter(function (g) { return !matDe[g.ref]; });
    const ocupados = ativos.filter(function (g) { return matDe[g.ref] && g !== G.dono; });
    if (G.dono) {
      if (G.chave === 'nome' && semLinha.length) {
        recusar(semLinha, 'A aba ' + ferias.aba + ' tem a matrícula ' + f.matricula + ', mas de ' + quemF + ', que ficou com ' + quemG(G.dono) +
          ' pelo nome: veja "Férias: matrícula de outra pessoa".');
        saida.push(item(f, 'FERIAS_NOME', 'Na aba ' + ferias.aba + ', a matrícula ' + f.matricula + ' é de ' + f.nome + '; na GERAL, esse final de RH é de ' +
          semLinha.map(quemG).join('; ') + '. As férias foram ligadas a ' + quemG(G.dono) + ' pelo nome: inclua o RH dele(a) na GERAL e confira o de ' +
          semLinha.map(function (g) { return g.nome || 'quem tem esse final'; }).join(' e ') + '.', G.dono));
      }
      return;
    }
    if (!G.doCd) {
      // de outro setor: nao gera conferencia
      ferias.foraDoCd += G.linhas.length;
      if (G.empate) recusar(G.empate, 'A matrícula ' + f.matricula + ' está na aba ' + ferias.aba + ' numa linha de outro centro de custo (' + quemF + '), que bate com mais de uma pessoa: o GSL não a usa.');
      else if (semLinha.length) {
        // o nome bate em parte: a linha de outro centro de custo so entra com o nome igual (ou o mesmo primeiro nome)
        recusar(semLinha.filter(function (g) { return forcaNomeQ_(f.nome, g.nome) >= 10; }), 'A aba ' + ferias.aba + ' tem a matrícula ' + f.matricula + ', de ' + quemF +
          ': o nome bate só em parte, e a linha de outro centro de custo só entra com o mesmo nome (ou o mesmo primeiro nome e mais um em comum). Se a pessoa é do CD, inclua o centro de custo ' +
          (f.cc || 'vazio') + ' nos parâmetros da aba Férias.');
        recusar(semLinha, 'A aba ' + ferias.aba + ' tem a matrícula ' + f.matricula + ', mas de ' + quemF +
          (f.nome ? ', outro nome.' : ', sem o nome (a linha de outro centro de custo só entra com o nome).'));
      }
      return;
    }
    if (G.empate) {
      recusar(G.empate, 'A matrícula ' + f.matricula + ' da aba ' + ferias.aba + ', de ' + quemF + ', serve a mais de uma pessoa: veja "Férias: linha que serve a mais de uma pessoa".');
      recusar(semLinha, 'A aba ' + ferias.aba + ' tem a matrícula ' + f.matricula + ', mas de ' + quemF + ', outro nome.');
      saida.push(item(f, 'FERIAS_DUPLA', 'A matrícula ' + f.matricula + ' da aba ' + ferias.aba + (f.nome ? ' (' + f.nome + ')' : '') +
        ' bate com o RH de ' + G.empate.length + ' pessoas ativas da GERAL: ' + G.empate.map(quemG).join('; ') + '. O nome não desempata.'));
      return;
    }
    if (G.semRh && G.semRh.length > 1) {
      recusar(G.semRh, 'A linha ' + f.linha + ' da aba ' + ferias.aba + ' (' + f.nome + ') serve a mais de uma pessoa: veja "Férias: linha que serve a mais de uma pessoa".');
      recusar(semLinha, 'A aba ' + ferias.aba + ' tem a matrícula ' + f.matricula + ', mas de ' + quemF + ', outro nome.');
      saida.push(item(f, 'FERIAS_DUPLA', 'A aba ' + ferias.aba + ' tem ' + f.nome +
        (f.matricula ? ' (matrícula ' + f.matricula + (G.cands.length ? '' : ', que não bate com nenhum RH da GERAL') + ')' : ' sem matrícula') +
        ', e há ' + G.semRh.length + ' pessoas ativas com esse nome' + (f.matricula ? ' e sem RH' : '') + ' na GERAL: ' + G.semRh.map(quemG).join('; ') + '.'));
      return;
    }
    if (semLinha.length) {
      recusar(semLinha, 'A aba ' + ferias.aba + ' tem a matrícula ' + f.matricula + ', mas de ' + quemF + ', outro nome: veja "Férias: matrícula de outra pessoa".');
      saida.push(item(f, 'FERIAS_NOME', 'Na aba ' + ferias.aba + ', a matrícula ' + f.matricula + ' é de ' + (f.nome || 'uma linha sem nome') + '; na GERAL, esse final de RH é de ' +
        semLinha.map(quemG).join('; ') + '. Os nomes não batem, e o GSL não ligou as férias a ninguém. Se for a mesma pessoa, escreva o nome na GERAL como no sistema; se não for, confira o RH na GERAL.',
        semLinha[0]));
      return;
    }
    // ninguem da GERAL e o dono: o final (se houver) e de quem ja tem a sua linha ou ja saiu; o homonimo, se houver, tem outro RH
    const pn = G.pn || [], saiu = G.cands.filter(function (g) { return !g.ativo; });
    const onde = 'Está na aba ' + ferias.aba + (f.cc ? ' (centro de custo ' + f.cc + ')' : '');
    let txt;
    if (!f.matricula) txt = onde + ', sem matrícula, e ninguém ativo da GERAL ' + (pn.length ? 'sem linha tem esse nome.' : 'tem esse nome.');
    else if (ocupados.length) txt = onde + ', matrícula ' + f.matricula + ', mas não é de ninguém da GERAL.';
    else txt = onde + ', matrícula ' + f.matricula + ', mas nenhuma pessoa ativa da GERAL tem esse final de RH' + (f.nome && !pn.length ? ' nem esse nome.' : '.');
    if (f.matricula && pn.length) {
      txt += ' ' + pn.map(quemG).join('; ') + (pn.length === 1 ? ' tem' : ' têm') + ' o mesmo nome: se for a mesma pessoa, o RH na GERAL está errado; se não for, inclua a pessoa na GERAL.';
    }
    if (ocupados.length) {
      const outroNome = ocupados.every(function (g) { return nivelNomeQ_(f.nome, g.nome) === 0; });
      const outraMat = ocupados.some(function (g) { return matDe[g.ref] !== G.mm; });
      txt += ' O final ' + f.matricula + ' é de ' + ocupados.map(quemG).join('; ') + ', que já ' + (ocupados.length === 1 ? 'tem a sua linha' : 'têm as suas linhas') +
        (outroNome ? ', com outro nome' : '') + (outraMat ? ' (uma pessoa da GERAL fica com uma matrícula só)' : '') + '.';
    }
    if (saiu.length) txt += ' O final ' + f.matricula + ' também é de ' + saiu.map(quemG).join('; ') + ', que já saiu da empresa.';
    saida.push(item(f, 'FERIAS_FORA_GERAL', txt));
  });
  // Quem esta no quadro e nao tem linha na FÉRIAS: sem o prazo, o GSL nao avisa.
  if (ferias.linhas.length) {
    geral.filter(function (g) { return g.ativo && !matDe[g.ref]; }).forEach(function (g) {
      const fim = fimRh(g);
      // a linha com a matricula dele(a) (o mesmo teste do passo 1) que ficou com outra pessoa
      const donos = [];
      if (fim) grupos.forEach(function (G) { if (G.dono && G.mm && ehDoFinal(g, G.mm) && donos.indexOf(G.dono) === -1) donos.push(G.dono); });
      let txt = recusa[g.ref];
      if (!txt && donos.length) {
        txt = 'A matrícula ' + fim.slice(-N) + ' (o final do RH ' + g.rh + ') está na aba ' + ferias.aba + ', mas a linha ficou com ' + donos.map(quemG).join('; ') + ', pelo nome.';
      }
      if (!txt) txt = fim ? 'A matrícula ' + fim.slice(-N) + ' (o final do RH ' + g.rh + ') não está na aba ' + ferias.aba + '.'
        : 'Sem RH na GERAL (a aba ' + ferias.aba + ' casa pela matrícula, os últimos números do RH).';
      saida.push({ tipo: 'FERIAS_SEM_DADOS', gravidade: 'atencao', cod: g.cod, rh: g.rh, nome: g.nome, equipe: g.equipe || g.equipeBruta,
        linha: g.linha, ref: g.ref, aba: g.aba || '', detalhe: txt + ' Sem a linha dele(a), o GSL não avisa o prazo das férias.' });
    });
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* INCONSISTENCIAS                                                     */
/* ------------------------------------------------------------------ */

/* Produtivo e matricula comparados sem zeros a esquerda ("030001" = 30001); nome sem acento e espaco duplo. */
function codigoQ_(v) {
  const c = txtQ_(v).replace(/\s+/g, '').replace(/\.0+$/, '').replace(/^0+(?=\d)/, '').toUpperCase();
  return /[1-9]/.test(c) ? c : '';          // "-", "0", "#N/A", "SEM" nao identificam ninguem
}
/* A linha r tem um COD ou um RH diferente do da linha g (os dois preenchidos): pode ser outra pessoa. */
function numeroConflitaQ_(r, g) {
  return !!((codigoQ_(r.cod) && codigoQ_(g.cod) && codigoQ_(r.cod) !== codigoQ_(g.cod)) ||
    (codigoQ_(r.rh) && codigoQ_(g.rh) && codigoQ_(r.rh) !== codigoQ_(g.rh)));
}
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
  if (n && ix.nome[n]) {
    const lista = ix.nome[n].filter(function (g) { return !(c && codigoQ_(g.cod)) && !(m && codigoQ_(g.rh)); });
    if (lista.length) return { lista: lista, chave: 'nome' };
  }
  return null;
}

function inconsistenciasQ_(geral, adm, des) {
  const saida = [];
  const ix = indiceQ_(geral), ixAdm = indiceQ_(adm), ixDes = indiceQ_(des);
  const quem = function (g) { return { cod: g.cod, rh: g.rh, nome: g.nome, equipe: g.equipe || g.equipeBruta, linha: g.linha, ref: g.ref, aba: g.aba || '' }; };
  const ondeQ = function (g) { return (g.aba ? g.aba + ' ' : '') + g.linha; };

  /*
   * 1. Desligado que continua ATIVO na GERAL (o pedido): um aviso por linha da
   * GERAL, decidido pelo desligamento mais recente. Desligamento com data
   * futura (aviso previo) ainda nao conta. Quem foi admitido de novo DEPOIS da
   * saida (CADMITIDOS com data) foi recontratado: o quadro esta certo e nao ha
   * aviso — a saida antiga fica na CDESLIGADOS, porque conta no turnover.
   */
  const jaVisto = {}, recontratado = {}, hoje = hojeISO();
  const desAte = des.filter(function (d) { return !(d.data && d.data > hoje); })
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });     // a mais recente primeiro; sem data no fim
  // Admissoes achadas por NUMERO (COD ou RH): so elas podem provar uma recontratacao (pelo nome pode ser homonimo).
  const admPorNumero = function (r) {
    return [acharQ_(ixAdm, r)].filter(function (x) { return x && x.chave !== 'nome'; })
      .reduce(function (l, x) { return l.concat(x.lista); }, []);
  };
  // ...e com o mesmo nome (ou sem nome): o numero pode ter sido reaproveitado ou digitado errado na CADMITIDOS.
  const nomeOk = function (a, nomes) { const n = nomeChaveQ_(a.nome); return !n || nomes.indexOf(n) !== -1; };
  // Admitido depois da saida, e nao no futuro; saida anotada so com o mes ("out/2026" = dia 1): admissao em mes posterior.
  const depoisDe = function (a, d) {
    return !!a.data && a.data <= hoje && (d.dataSoMes ? a.data.slice(0, 7) > d.data.slice(0, 7) : a.data > d.data);
  };
  // Saida so com o mes e readmissao (ja feita) no mesmo mes: so o dia da saida decide.
  const noMesmoMes = function (a, d) { return !!(d.dataSoMes && a.data && a.data <= hoje && a.data.slice(0, 7) === d.data.slice(0, 7)); };
  // O numero pelo qual a admissao foi achada (COD ou RH), para a dica apontar o certo.
  const numeroDe = function (a, rs) {
    const c = codigoQ_(a.cod);
    return c && rs.some(function (r) { return codigoQ_(r.cod) === c; }) ? 'COD ' + a.cod : 'RH ' + a.rh;
  };
  /*
   * O que falta para a CADMITIDOS provar (ou descartar) uma recontratacao.
   * porNumero: admissoes achadas pelo COD/RH de rs; nomes: os nomes aceitos;
   * soNome: ha uma admissao achada so pelo nome (linha sem COD e sem RH).
   */
  const dica = function (d, porNumero, nomes, rs, soNome) {
    // so interessa admissao que poderia ser a volta: sem data, ou depois da saida (ou no mesmo mes, se a saida so tem o mes)
    const volta = function (a) { return !a.data || !d.data || a.data > d.data || noMesmoMes(a, d); };
    const outro = porNumero.filter(function (a) { return !nomeOk(a, nomes) && volta(a); })[0];
    if (outro) {
      return ' A CADMITIDOS tem o ' + numeroDe(outro, rs) + ' com outro nome (' + (outro.nome || 'sem nome') + (outro.data ? ', ' + dataCurtaQ_(outro.data) : '') +
        '): se for a mesma pessoa, escreva o nome como na ' + (rs[rs.length - 1].aba || 'GERAL') + '; se não for, confira o número.';
    }
    const certos = porNumero.filter(function (a) { return nomeOk(a, nomes); });
    const futura = certos.filter(function (a) { return a.data && a.data > hoje; })[0];
    if (futura) return ' A CADMITIDOS tem uma admissão com data no futuro (' + dataCurtaQ_(futura.data) + '): confira a data.';
    const mesmoMes = certos.filter(function (a) { return noMesmoMes(a, d); })[0];
    if (mesmoMes) return ' A saída está só com o mês e a readmissão (' + dataCurtaQ_(mesmoMes.data) + ') é do mesmo mês: ponha o dia da saída para conferir.';
    const datada = certos.filter(function (a) { return a.data; }).sort(function (a, b) { return b.data.localeCompare(a.data); })[0];
    if (!d.data && datada) return ' Há uma admissão na CADMITIDOS (' + dataCurtaQ_(datada.data) + '): ponha a data desta saída para conferir se ela veio antes (recontratação).';
    if (certos.some(function (a) { return !a.data; })) return ' Está na CADMITIDOS pelo COD/RH, sem data: se foi recontratação, ponha a data da nova admissão.';
    if (soNome) return ' Há na CADMITIDOS uma admissão com o mesmo nome, mas sem o COD/RH desta pessoa: se for recontratação, ponha o COD ou o RH (e a data) nessa linha da CADMITIDOS.';
    return '';
  };
  const soNomeAdm = function (r) { return (acharQ_(ixAdm, r) || {}).chave === 'nome'; };
  desAte.forEach(function (d) {
    const achou = acharQ_(ix, d);
    if (!achou) return;
    achou.lista.filter(function (g) { return g.ativo; }).forEach(function (g) {
      if (jaVisto[g.ref]) return;
      // Ja calado por recontratacao: as saidas datadas de antes da readmissao nao contam. Ainda contam a saida SEM data
      // e a saida so com o mes do mes da readmissao em diante (na ordem, "set/2026" vem como dia 1).
      const rec = recontratado[g.ref];
      if (rec && d.data && !(d.dataSoMes && d.data.slice(0, 7) >= rec.slice(0, 7))) return;
      const nomes = [nomeChaveQ_(d.nome), nomeChaveQ_(g.nome)], nomeG = [nomeChaveQ_(g.nome)];
      const porNumero = admPorNumero(d).concat(admPorNumero(g));
      const volta = function (aceitos) {
        return d.data ? porNumero.filter(function (a) { return nomeOk(a, aceitos) && depoisDe(a, d); }).map(function (a) { return a.data; }).sort()[0] : '';
      };
      if (volta(nomes)) {
        // Esta saida foi seguida de uma readmissao: sem aviso por ela. So a saida DESTA pessoa (pelo numero, sem outro
        // nome nem outro numero) com a readmissao DELA cala as saidas mais antigas; a de um homonimo ou de outra linha
        // com o mesmo numero, nao.
        const dela = achou.chave !== 'nome' && nomeOk(d, nomeG) && !numeroConflitaQ_(d, g) ? volta(nomeG) : '';
        if (dela && !rec) recontratado[g.ref] = dela;
        return;
      }
      jaVisto[g.ref] = true;
      const extra = !rec ? dica(d, porNumero, nomes, [d, g], soNomeAdm(d) || soNomeAdm(g))
        : (d.data ? ' Há também uma readmissão em ' + dataCurtaQ_(rec) + ' e esta saída está só com o mês: ponha o dia da saída para conferir.'
          : ' Há também uma saída antiga e uma readmissão (' + dataCurtaQ_(rec) + '): ponha a data desta saída para conferir.');
      saida.push(Object.assign(quem(g), {
        tipo: 'DESLIGADO_ATIVO', gravidade: 'grave', data: d.data || '', chave: achou.chave,
        detalhe: (d.data ? 'Desligado em ' + dataCurtaQ_(d.data) : 'Está na CDESLIGADOS (sem data)') + (d.motivo ? ' (' + d.motivo + ')' : '') +
          ', mas está ' + (g.status || 'sem status') + ' na ' + (g.aba || 'GERAL') + '.' +
          (achou.chave !== 'produtivo' ? ' Achado pelo ' + achou.chave + ' — confira se é a mesma pessoa.' : '') + extra
      }));
    });
  });
  /*
   * 1b. MESMO_NOME: alguem ativo tem o mesmo nome de um desligado, mas outro
   * COD ou RH — homonimo, numero digitado errado ou recontratacao com numero
   * novo. Atencao, para conferir; nunca manda inativar ninguem. Quem foi
   * admitido (pelo numero da GERAL, com o mesmo nome) depois DESTA saida e
   * recontratacao com numero novo: sem aviso.
   */
  const jaVistoNome = {};
  desAte.forEach(function (d) {
    if (acharQ_(ix, d)) return;
    const n = nomeChaveQ_(d.nome);
    ((n && ix.nome[n]) || []).filter(function (g) { return g.ativo && !jaVisto[g.ref] && !jaVistoNome[g.ref]; }).forEach(function (g) {
      const porNumero = admPorNumero(g), nomes = [nomeChaveQ_(g.nome)];
      if (d.data && porNumero.some(function (a) { return nomeOk(a, nomes) && depoisDe(a, d); })) return;
      jaVistoNome[g.ref] = true;
      const dif = [];
      if (codigoQ_(d.cod) && codigoQ_(g.cod) && codigoQ_(d.cod) !== codigoQ_(g.cod)) dif.push('o COD é ' + d.cod + ' na CDESLIGADOS e ' + g.cod + ' na ' + (g.aba || 'GERAL'));
      if (codigoQ_(d.rh) && codigoQ_(g.rh) && codigoQ_(d.rh) !== codigoQ_(g.rh)) dif.push('a matrícula é ' + d.rh + ' na CDESLIGADOS e ' + g.rh + ' na ' + (g.aba || 'GERAL'));
      saida.push(Object.assign(quem(g), {
        tipo: 'MESMO_NOME', gravidade: 'atencao', data: d.data || '', chave: 'nome',
        detalhe: 'Tem o mesmo nome de quem está na CDESLIGADOS' + (d.data ? ' (desligado em ' + dataCurtaQ_(d.data) + ')' : '') + ', mas ' +
          (dif.join(' e ') || 'os números não batem') + '. Confira se é a mesma pessoa (número digitado errado) ou um homônimo.' +
          dica(d, porNumero, nomes, [g], soNomeAdm(g))
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

/* Mes escrito por extenso ou abreviado, sem o dia ("ago/2025", "Agosto de 2025", "AGO-25"). */
const MES_TEXTO_Q = /^([A-Z]{3})[A-Z]*\s*(?:DE\s*)?[\/\-\s]?\s*(\d{2,4})$/;
/* "aaaa-mm-dd", "aaaa/mm/dd" ou so "aaaa-mm" (sem o dia: vira o dia 1). */
const DATA_ISO_Q = /^(\d{4})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?/;
/* A data veio so com o mes (vira o dia 1 em dataQ_): "ago/2025" ou "2025-08". */
function soMesQ_(v) {
  if (v && typeof v.getTime === 'function') return false;
  const s = txtQ_(v);
  const iso = s.match(DATA_ISO_Q);
  if (iso) return !iso[3];
  const mx = normalizaQ_(s).match(MES_TEXTO_Q);
  return !!(mx && MESES_Q.indexOf(mx[1]) !== -1);
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
  const mx = normalizaQ_(s).match(MES_TEXTO_Q);
  if (mx && MESES_Q.indexOf(mx[1]) !== -1) {
    const ano = mx[2].length === 2 ? '20' + mx[2] : mx[2];
    return ano + '-' + ('0' + (MESES_Q.indexOf(mx[1]) + 1)).slice(-2) + '-01';
  }
  // Mes fora de 1-12 ou dia fora de 1-31 (ex.: 09/15/2026, colado no formato americano) = sem data.
  const ok = function (ano, mes, dia) {
    return (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) ? ano + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2) : '';
  };
  const iso = s.match(DATA_ISO_Q);
  if (iso) return ok(iso[1], Number(iso[2]), Number(iso[3] || 1));
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) return ok(br[3].length === 2 ? '20' + br[3] : br[3], Number(br[2]), Number(br[1]));
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

/*
 * Parametros das ferias (botao Parametros da aba Ferias). Confere tudo
 * antes de gravar; "padrao: true" volta todos ao padrao (valor vazio).
 */
function acaoSalvarParametrosFerias(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  params = params || {};
  const valores = {};
  if (!params.padrao) {
    const cc = String(params.cc == null ? '' : params.cc).split(/[^0-9]+/).map(function (x) { return x.replace(/^0+(?=\d)/, ''); })
      .filter(function (x) { return /[1-9]/.test(x); });
    if (!cc.length) throw new Error('Informe pelo menos um centro de custo do CD (só números, ex.: 655).');
    if (cc.some(function (x) { return x.length > 10; })) throw new Error('Centro de custo com número grande demais.');
    valores.cc = cc.filter(function (x, i) { return cc.indexOf(x) === i; }).join(', ');
    const rot = { digitos: 'Números da matrícula', aviso: 'Aviso de férias', avisar: 'Avisar já', planejar: 'Planejar', janela: 'Janela do escalonar', meses: 'Meses à frente' };
    Object.keys(FERIAS_LIMITES).forEach(function (k) {
      const t = String(params[k] == null ? '' : params[k]).trim(), v = Number(t), lim = FERIAS_LIMITES[k];
      if (t === '' || !isFinite(v) || Math.round(v) !== v || v < lim[0] || v > lim[1]) {
        throw new Error(rot[k] + ': use um número inteiro de ' + lim[0] + ' a ' + lim[1] + '.');
      }
      valores[k] = v;
    });
    if (valores.avisar <= valores.aviso) throw new Error('"Avisar já" precisa ser maior que o aviso de férias (' + valores.aviso + ' dias).');
    if (valores.planejar <= valores.avisar) throw new Error('"Planejar" precisa ser maior que "Avisar já" (' + valores.avisar + ' dias).');
  }
  const desc = { cc: 'Férias (Quadro do CD): centro(s) de custo do CD', digitos: 'Férias (Quadro do CD): números do fim do RH que formam a matrícula',
    aviso: 'Férias (Quadro do CD): dias de antecedência do aviso', avisar: 'Férias (Quadro do CD): avisar já — limite em até N dias',
    planejar: 'Férias (Quadro do CD): planejar — limite em até N dias', janela: 'Férias (Quadro do CD): escalonar — limites a menos de N dias',
    meses: 'Férias (Quadro do CD): escalonar e mapa — próximos N meses' };
  const id = idPlanilhaQuadro_();
  Object.keys(FERIAS_CHAVES).forEach(function (k) {
    acaoSalvarParametro(usuario, { chave: FERIAS_CHAVES[k], valor: params.padrao ? '' : String(valores[k]), descricao: desc[k] });
  });
  // a leitura guardada com o casamento antigo (centro de custo, matricula) nao serve mais
  if (id) { try { CacheService.getScriptCache().remove(chaveQuadroQ_(id)); } catch (e) {} }
  return { ok: true, invalidarTudo: true, recado: params.padrao ? 'Parâmetros das férias de volta ao padrão.' : 'Parâmetros das férias salvos.' };
}

function acaoAtualizarQuadro(usuario) {
  const id = idPlanilhaQuadro_();
  if (id) { try { CacheService.getScriptCache().remove(chaveQuadroQ_(id)); } catch (e) {} }
  // A chave e fatiada (gravarTextoCache): sem o numero de fatias, a leitura
  // volta vazia e a planilha e relida.
  limparCache('PARAMETROS');
  return { ok: true, recado: 'Quadro relido da planilha.' };
}
