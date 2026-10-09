/**
 * JOVEM APRENDIZ — o "Portal RH Aprendiz" dentro do GSL (4.2.2).
 *
 * E o mesmo programa que rodava sozinho na planilha "Imersao Corporativa
 * (respostas)": le as avaliacoes que o Formulario grava (aba "Respostas ao
 * formulario 1") e o cronograma de rotacao (aba "Cronograma"), e monta:
 *   - RELATORIO E AVALIACOES: o painel de cada aprendiz (media geral,
 *     setores vivenciados, cronograma com o status de cada setor, graficos
 *     por setor e por competencia e o feedback de cada avaliador);
 *   - CRONOGRAMA GERAL DOS SETORES: um cartao por aprendiz, com as datas
 *     e o status de cada setor.
 *
 * O que mudou ao entrar no GSL:
 *   1. mora no GSL: menu de modulos, nivel de acesso e filial do GSL;
 *   2. o cronograma geral vem da propria aba Cronograma (no programa
 *      antigo a lista estava escrita a mao dentro da pagina);
 *   3. os cartoes do cronograma geral ficam em ordem de FIM DE CONTRATO —
 *      o contrato que vence primeiro aparece primeiro.
 *
 * MANUTENCAO — onde mexer:
 *   - nome das abas e posicao das colunas da planilha: APZ_CONFIG, logo abaixo;
 *   - regras (status do aprendiz, medias, setores, ordem): este arquivo;
 *   - a tela (abas, graficos, cartoes, cores): Aprendiz.html;
 *   - qual planilha: parametro APRENDIZ_PLANILHA (Configuracao) ou o botao
 *     "Trocar planilha" na propria tela. Cada filial liga a sua.
 *   - o menu e o acesso: Permissoes.gs (MODULOS e TELAS) e o nivel de cada
 *     pessoa em Pessoas e acessos.
 *
 * A atualizacao semanal do Formulario (toda quinta, 6h: a lista de nomes
 * com os aprendizes da semana) continua no script da propria planilha. Ela
 * usa o FormApp; trazer para o GSL obrigaria a conta dona do GSL a
 * autorizar o sistema de novo, e ate la o GSL inteiro ficaria parado.
 */

const BUILD_APRENDIZ = '2026.10.09b';   // carimbo da entrega — ver APP.build no Codigo.gs

const APZ_CONFIG = {
  ABA_RESPOSTAS: 'Respostas ao formulário 1',
  ABA_CRONOGRAMA: 'Cronograma',
  /* Aba de respostas (0 = coluna A). */
  COL: { DATA: 0, AVALIADOR: 2, SETOR: 3, NOME: 4, ATENCAO: 5, DISCIPLINA: 6, INTERESSE: 7,
         PROATIVIDADE: 8, APRENDIZADO: 9, POSITIVOS: 10, MELHORAR: 11, MEDIA: 12 },
  /* Aba Cronograma: dois blocos lado a lado — Turno A (A a D) e Turno B (F a I). */
  BLOCOS: [{ nome: 0, setor: 1, inicio: 2, final: 3 }, { nome: 5, setor: 6, inicio: 7, final: 8 }],
  LINHAS_POR_APRENDIZ: 8
};
const APZ_CACHE_SEGUNDOS = 300;
const APZ_STATUS = { CONCLUIDO: 'Concluído', PENDENTE: 'Pendente', NAO_REALIZADA: 'Não realizada' };

/* ------------------------------------------------------------------ */
/* A PLANILHA                                                          */
/* ------------------------------------------------------------------ */

function idPlanilhaAprendiz_() {
  const bruto = String(parametro('APRENDIZ_PLANILHA', '') || '').trim();
  if (!bruto) return '';
  const m = bruto.match(/\/d\/([\w-]{20,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(bruto) ? bruto : '';
}

/* Nome de aba sem diferenca de maiuscula, acento, espaco sobrando. */
function chaveAbaApz_(nome) { return apzNome_(nome).replace(/[^a-z0-9]/g, ''); }

/*
 * A aba de respostas: o nome exato; senao a "Respostas ao formulario..." que
 * nao seja copia; senao a primeira aba (o programa antigo fazia isso).
 */
function abaRespostasApz_(ss) {
  const exata = ss.getSheetByName(APZ_CONFIG.ABA_RESPOSTAS);
  if (exata) return exata;
  const abas = ss.getSheets();
  const alvo = chaveAbaApz_(APZ_CONFIG.ABA_RESPOSTAS);
  return abas.filter(function (a) { return chaveAbaApz_(a.getName()) === alvo; })[0] ||
    abas.filter(function (a) {
      const k = chaveAbaApz_(a.getName());
      return k.indexOf('respostasaoformulario') === 0 && k.indexOf('copia') === -1;
    })[0] || abas[0] || null;
}

function abaCronogramaApz_(ss) {
  const exata = ss.getSheetByName(APZ_CONFIG.ABA_CRONOGRAMA);
  if (exata) return exata;
  const alvo = chaveAbaApz_(APZ_CONFIG.ABA_CRONOGRAMA);
  return ss.getSheets().filter(function (a) { return chaveAbaApz_(a.getName()) === alvo; })[0] || null;
}

/** Dados da tela. A planilha e lida uma vez e guardada por 5 minutos. */
function dadosAprendiz(usuario) {
  const id = idPlanilhaAprendiz_();
  const base = {
    configurado: !!id,
    podeConfigurar: podeFazer(usuario, 'PROGRAMAR'),
    hoje: paraISO(hoje()),
    filial: filialAtual().nome
  };
  if (!id) return base;

  const chave = chaveNoEspaco('aprendiz|' + id);
  const guardado = lerTextoCache(chave);
  if (guardado) {
    try { return Object.assign(base, JSON.parse(guardado)); } catch (e) { /* le de novo */ }
  }
  try {
    const dados = lerPlanilhaAprendiz_(id);
    gravarTextoCache(chave, JSON.stringify(dados), APZ_CACHE_SEGUNDOS);
    return Object.assign(base, dados);
  } catch (e) {
    base.erro = 'Não consegui ler a planilha do Jovem Aprendiz: ' + (e.message || e) +
      '. Confira se o link está certo e se a conta dona do GSL tem acesso a ela.';
    return base;
  }
}

function lerPlanilhaAprendiz_(id) {
  exigirPorta_();
  const ss = SpreadsheetApp.openById(id);
  const abaResp = abaRespostasApz_(ss);
  const abaCrono = abaCronogramaApz_(ss);
  const resp = abaResp && abaResp.getLastRow() > 1 ? abaResp.getDataRange().getValues() : [];
  const crono = abaCrono && abaCrono.getLastRow() > 0 ? abaCrono.getDataRange().getValues() : [];
  let tz = '';
  try { tz = ss.getSpreadsheetTimeZone(); } catch (e) { /* usa o do GSL */ }
  const dados = montarAprendiz_(resp, crono, tz || fuso());
  dados.fonte = { nome: ss.getName(), url: ss.getUrl(),
                  abaRespostas: abaResp ? abaResp.getName() : '', abaCronograma: abaCrono ? abaCrono.getName() : '' };
  dados.atualizado = new Date().toISOString();
  return dados;
}

/* ------------------------------------------------------------------ */
/* AS REGRAS (as mesmas do Portal RH Aprendiz)                         */
/* ------------------------------------------------------------------ */

/* "  Ândérson   Silva " -> "anderson silva" */
function apzNome_(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/*
 * "C. Carregamento", "CARREGAMENTO - A", "Setor Carregamento (Turno B)" ->
 * "CARREGAMENTO". O mesmo setor avaliado nos dois turnos conta uma vez.
 */
function apzSetor_(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^\s*C\.\s*/, '')
    .replace(/^\s*SETOR\s*/, '')
    .replace(/[\s\-\/\(\)]+(TURNO\s*)?[AB][\)\s]*$/, '')
    .replace(/\s*\-\s*[AB]$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Linha do cronograma que NAO e nome de aprendiz (cabecalho, contrato, ferias). */
function apzNaoENome_(texto) {
  const lower = String(texto || '').trim().toLowerCase();
  return lower === '' || lower === 'nome' || lower.indexOf('turno') !== -1 ||
    lower.indexOf('final de contrato') !== -1 || lower.indexOf('periodo de ferias') !== -1 ||
    lower.indexOf('período de férias') !== -1 || lower.indexOf('media geral') !== -1;
}

/* Ano com dois digitos vira quatro: "10/01/28" -> "10/01/2028". */
function apzAno4_(texto) {
  return String(texto || '').replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b(?!\/)/g, function (t, d, m, a) {
    return ('0' + d).slice(-2) + '/' + ('0' + m).slice(-2) + '/20' + a;
  });
}

/* Data da celula (Date, texto dd/mm/aaaa ou numero de serie) -> "aaaa-mm-dd". */
function apzIso_(v, tz) {
  if (v && typeof v.getTime === 'function') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  const s = String(v == null ? '' : v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const br = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (br) return (br[3].length === 2 ? '20' + br[3] : br[3]) + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2);
  return '';
}

/* "Final de contrato: 10/01/28" -> "10/01/2028" (ou '' se a celula nao e de contrato). */
function apzContrato_(celula) {
  if (celula && typeof celula.getTime === 'function') return '';
  const s = String(celula || '');
  if (s.toLowerCase().indexOf('final de contrato') === -1) return '';
  return apzAno4_(s.replace(/final de contrato:\s*/i, '').trim());
}

/* "Periodo de Ferias:  08/09/26 a 07/10/2026" -> "08/09/2026 a 07/10/2026". */
function apzFerias_(celula) {
  if (celula && typeof celula.getTime === 'function') return '';
  const s = String(celula || '');
  const lower = s.toLowerCase();
  if (lower.indexOf('ferias') === -1 && lower.indexOf('férias') === -1) return '';
  return apzAno4_(s.replace(/periodo de ferias:\s*/i, '').replace(/período de férias:\s*/i, '').trim());
}

/*
 * Data do texto -> "aaaa-mm-dd" para ordenar ('' se nao tiver data).
 * Aceita 10/01/2028, 10/01/28, 10-01-2028, 10.01.2028 e 2028-01-10:
 * contrato digitado de outro jeito nao pode cair no fim da lista.
 */
function apzIsoDoTexto_(texto) {
  const s = String(texto || '');
  const iso = s.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (iso) return iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + iso[3]).slice(-2);
  const m = s.match(/(?<!\d)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/);
  if (!m) return '';
  return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

function apzUm_(n) { return Number((Number(n) || 0).toFixed(1)); }

/**
 * Tudo o que a tela mostra, a partir dos valores das duas abas
 * (getValues). Separado da leitura para poder ser testado sem planilha.
 */
function montarAprendiz_(resp, crono, tz) {
  const C = APZ_CONFIG.COL, N = APZ_CONFIG.LINHAS_POR_APRENDIZ;

  /* 1 · Quem foi avaliado e em quais setores (aba de respostas). */
  const setoresAvaliados = {};     // nome normalizado -> { SETOR: true }
  const nomesDasRespostas = [];    // [chave, nome original], na ordem em que aparecem
  const nomeDaChave = {};
  for (let i = 1; i < resp.length; i++) {
    const rawNome = resp[i][C.NOME], rawSetor = resp[i][C.SETOR];
    if (!rawNome || typeof rawNome !== 'string') continue;
    const nomeLimpo = rawNome.trim(), lower = nomeLimpo.toLowerCase();
    if (nomeLimpo === '' || lower === 'nome' || lower.indexOf('nome e sobrenome') !== -1) continue;
    const k = apzNome_(nomeLimpo);
    setoresAvaliados[k] = setoresAvaliados[k] || {};
    if (rawSetor) setoresAvaliados[k][apzSetor_(rawSetor)] = true;
    if (!nomeDaChave[k]) { nomeDaChave[k] = nomeLimpo; nomesDasRespostas.push(k); }
  }

  /* 2 · Os blocos da aba Cronograma: nome, contrato, ferias e os setores com as datas. */
  const blocos = {};               // chave -> { nome, linha, bloco }
  const ordemBlocos = [];
  for (let i = 0; i < crono.length; i++) {
    APZ_CONFIG.BLOCOS.forEach(function (b) {
      const raw = crono[i][b.nome];
      if (!raw || typeof raw !== 'string' || apzNaoENome_(raw)) return;
      const nomeLimpo = raw.trim();
      const k = apzNome_(nomeLimpo);
      if (blocos[k]) return;
      const setores = [];
      for (let j = i; j < i + N && j < crono.length; j++) {
        const s = crono[j][b.setor];
        if (s && String(s).trim() !== '') {
          setores.push({ setor: String(s).trim(), inicio: apzIso_(crono[j][b.inicio], tz), final: apzIso_(crono[j][b.final], tz) });
        }
      }
      blocos[k] = {
        nome: nomeLimpo, setores: setores,
        contrato: i + 1 < crono.length ? apzContrato_(crono[i + 1][b.nome]) : '',
        ferias: i + 2 < crono.length ? apzFerias_(crono[i + 2][b.nome]) : ''
      };
      ordemBlocos.push(k);
    });
  }

  /* 3 · A lista do seletor, com o status de cada um (mesma regra de antes). */
  const todos = ordemBlocos.slice();
  nomesDasRespostas.forEach(function (k) { if (!blocos[k]) todos.push(k); });
  const lista = todos.map(function (k) {
    const avaliados = Object.keys(setoresAvaliados[k] || {}).length;
    // Quem so aparece nas respostas (fora do cronograma) conta com 8 setores previstos.
    const previstos = blocos[k] ? blocos[k].setores.length : N;
    let status = APZ_STATUS.NAO_REALIZADA, ordem = 3;
    if (avaliados > 0 && (previstos === 0 || avaliados >= previstos)) { status = APZ_STATUS.CONCLUIDO; ordem = 1; }
    else if (avaliados > 0) { status = APZ_STATUS.PENDENTE; ordem = 2; }
    return { chave: k, nomeOriginal: blocos[k] ? blocos[k].nome : nomeDaChave[k], status: status, ordem: ordem };
  }).sort(function (a, b) { return (a.ordem - b.ordem) || a.nomeOriginal.localeCompare(b.nomeOriginal); });

  /* 4 · O painel de cada aprendiz. */
  const avaliacoesDe = {};
  for (let i = 1; i < resp.length; i++) {
    const row = resp[i];
    const k = apzNome_(row[C.NOME] ? String(row[C.NOME]) : '');
    if (!k) continue;
    (avaliacoesDe[k] = avaliacoesDe[k] || []).push(row);
  }
  const paineis = {};
  lista.forEach(function (item) {
    paineis[item.chave] = painelDoAprendiz_(item, blocos[item.chave] || null, avaliacoesDe[item.chave] || [], tz);
  });

  /* 5 · O cronograma geral: o contrato que vence primeiro em cima; sem data, no fim. */
  const cronograma = ordemBlocos.map(function (k) {
    const b = blocos[k];
    return { chave: k, nome: b.nome, final_contrato: b.contrato, ferias: b.ferias,
             fimIso: apzIsoDoTexto_(b.contrato), cronograma: b.setores };
  }).sort(function (a, b) {
    if (a.fimIso && b.fimIso && a.fimIso !== b.fimIso) return a.fimIso < b.fimIso ? -1 : 1;
    if (!a.fimIso !== !b.fimIso) return a.fimIso ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });

  return { lista: lista, paineis: paineis, cronograma: cronograma };
}

/*
 * O relatorio de um aprendiz — o mesmo calculo do Portal RH Aprendiz:
 * medias de cada competencia, media geral (a media das cinco), setores do
 * cronograma e o status de cada um (avaliado = concluido; o primeiro ainda
 * sem avaliacao = setor atual).
 */
function painelDoAprendiz_(item, bloco, linhas, tz) {
  const C = APZ_CONFIG.COL;
  const cronogramaSetores = [];
  if (bloco) bloco.setores.forEach(function (s) { if (cronogramaSetores.indexOf(s.setor) === -1) cronogramaSetores.push(s.setor); });

  const avaliacoes = [];
  const soma = { atencao: 0, disciplina: 0, interesse: 0, proatividade: 0, aprendizado: 0 };
  linhas.forEach(function (row, n) {
    const notas = {
      atencao: Number(row[C.ATENCAO]) || 0, disciplina: Number(row[C.DISCIPLINA]) || 0,
      interesse: Number(row[C.INTERESSE]) || 0, proatividade: Number(row[C.PROATIVIDADE]) || 0,
      aprendizado: Number(row[C.APRENDIZADO]) || 0
    };
    Object.keys(soma).forEach(function (x) { soma[x] += notas[x]; });
    // "Media por setor" (coluna M, formula =MEDIA(F:J)). O Formulario acrescenta a linha nova SEM a
    // formula; o portal antigo mostrava 0 ate alguem puxar a formula. Aqui faz a mesma conta dela.
    let media = row[C.MEDIA] !== undefined && row[C.MEDIA] !== '' && row[C.MEDIA] !== null ? Number(row[C.MEDIA]) : NaN;
    if (isNaN(media)) {
      const validas = [C.ATENCAO, C.DISCIPLINA, C.INTERESSE, C.PROATIVIDADE, C.APRENDIZADO]
        .map(function (c) { return row[c]; })
        .filter(function (v) { return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)); })
        .map(Number);
      media = validas.length ? validas.reduce(function (a, b) { return a + b; }, 0) / validas.length : 0;
    }
    let data = '-';
    if (row[C.DATA] && typeof row[C.DATA].getTime === 'function') data = Utilities.formatDate(row[C.DATA], tz, 'dd/MM/yyyy');
    else if (row[C.DATA]) data = String(row[C.DATA]).split(' ')[0];
    const linhasDe = function (v) {
      const l = String(v || '').trim() ? String(v).split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      return l.length ? l : ['Sem registros.'];
    };
    avaliacoes.push({
      setor: row[C.SETOR] ? String(row[C.SETOR]).trim() : 'Setor ' + (n + 1),
      // Setor em branco: a chave e o proprio rotulo ("Setor 2" -> "2"), como no portal — cada um conta.
      chaveSetor: apzSetor_(row[C.SETOR] ? String(row[C.SETOR]).trim() : 'Setor ' + (n + 1)),
      avaliador: row[C.AVALIADOR] ? String(row[C.AVALIADOR]).trim() : 'N/A',
      data: data,
      mediaSetor: apzUm_(media),
      // Ordem do grafico: Atencao, Interesse, Proatividade, Aprendizado, Disciplina.
      notas: [notas.atencao, notas.interesse, notas.proatividade, notas.aprendizado, notas.disciplina],
      pontosPositivos: linhasDe(row[C.POSITIVOS]),
      pontosMelhorar: linhasDe(row[C.MELHORAR])
    });
  });

  const total = avaliacoes.length;
  const m = function (x) { return total ? soma[x] / total : 0; };
  const medias = [m('atencao'), m('interesse'), m('proatividade'), m('aprendizado'), m('disciplina')];
  const mediaGeral = total ? medias.reduce(function (s, x) { return s + x; }, 0) / 5 : 0;

  // Media de cada setor (os dois turnos juntos) e o status no cronograma. Como no portal: da avaliacao
  // mais recente para a mais antiga, guardando a ordem em que cada setor apareceu (a soma nessa ordem
  // da o mesmo arredondamento, e quem nao esta no cronograma ve os setores nessa ordem).
  const porSetor = {}, ordemSetores = [];
  avaliacoes.slice().reverse().forEach(function (a) {
    if (!Object.prototype.hasOwnProperty.call(porSetor, a.chaveSetor)) {
      porSetor[a.chaveSetor] = { soma: 0, qtd: 0 };
      ordemSetores.push(a.chaveSetor);
    }
    porSetor[a.chaveSetor].soma += Number(a.mediaSetor) || 0;
    porSetor[a.chaveSetor].qtd++;
  });
  const vivenciados = ordemSetores.length;
  const setoresDaLinha = cronogramaSetores.length ? cronogramaSetores : ordemSetores;
  let achouAtual = false;
  const linhaDoTempo = setoresDaLinha.map(function (nome) {
    const k = apzSetor_(nome);
    if (Object.prototype.hasOwnProperty.call(porSetor, k)) return { setor: nome, status: 'concluido', media: apzUm_(porSetor[k].soma / porSetor[k].qtd) };
    if (!achouAtual) { achouAtual = true; return { setor: nome, status: 'fazendo', media: null }; }
    return { setor: nome, status: 'pendente', media: null };
  });
  const totais = cronogramaSetores.length ? cronogramaSetores.length : vivenciados;

  return {
    nome: item.nomeOriginal,
    status: item.status,
    mediaGeral: apzUm_(mediaGeral),
    setoresTotais: cronogramaSetores.length > 0 ? cronogramaSetores.length : total,
    vivenciados: vivenciados,
    totais: totais,
    progresso: totais ? Math.round(vivenciados / totais * 1000) / 10 : 0,
    fimContrato: (bloco && bloco.contrato) || 'Não informado',
    periodoFerias: (bloco && bloco.ferias) || 'Não informado',
    cronogramaSetores: cronogramaSetores,
    linhaDoTempo: linhaDoTempo,
    mediasPilares: medias.map(apzUm_),
    avaliacoes: avaliacoes.reverse()       // a mais recente primeiro, como antes
  };
}

/* ------------------------------------------------------------------ */
/* ACOES DA TELA                                                       */
/* ------------------------------------------------------------------ */

/** Liga (ou troca) a planilha do Jovem Aprendiz desta filial. */
function acaoSalvarFonteAprendiz(usuario, params) {
  exigirCapacidade(usuario, 'PROGRAMAR');
  const link = String(params.link || '').trim();
  if (!link) throw new Error('Cole o link da planilha do Jovem Aprendiz.');
  const m = link.match(/\/d\/([\w-]{20,})/);
  const id = m ? m[1] : (/^[\w-]{20,}$/.test(link) ? link : '');
  if (!id) throw new Error('Esse link não parece de uma planilha do Google.');
  exigirPorta_();             // fora do try: "Acesso negado" nao pode virar "nao consegui abrir"
  let nome = '';
  try {
    const ss = SpreadsheetApp.openById(id);
    nome = ss.getName();
    if (!abaCronogramaApz_(ss) && !ss.getSheetByName(APZ_CONFIG.ABA_RESPOSTAS)) {
      throw new Error('A planilha não tem as abas esperadas ("' + APZ_CONFIG.ABA_RESPOSTAS + '" e "' + APZ_CONFIG.ABA_CRONOGRAMA + '").');
    }
  } catch (e) {
    throw new Error(String(e.message || e).indexOf('abas esperadas') !== -1 ? e.message
      : 'Não consegui abrir a planilha. A conta dona do GSL precisa ter acesso a ela.');
  }
  acaoSalvarParametro(usuario, { chave: 'APRENDIZ_PLANILHA', valor: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
    descricao: PARAMETROS_NOVOS.filter(function (p) { return p[0] === 'APRENDIZ_PLANILHA'; }).map(function (p) { return p[1]; })[0] || '' });
  return { ok: true, invalidarTudo: true, recado: 'Jovem Aprendiz ligado à planilha "' + nome + '".' };
}

/** Le a planilha de novo (sem esperar os 5 minutos da copia guardada). */
function acaoAtualizarAprendiz(usuario) {
  const id = idPlanilhaAprendiz_();
  if (id) { try { CacheService.getScriptCache().remove(chaveNoEspaco('aprendiz|' + id)); } catch (e) {} }
  // A chave e fatiada (gravarTextoCache): esquecer a contagem de fatias tambem relê.
  limparCache('PARAMETROS');
  return { ok: true, recado: 'Jovem Aprendiz relido da planilha.' };
}
