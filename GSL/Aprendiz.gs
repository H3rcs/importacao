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

const BUILD_APRENDIZ = '2026.10.09c';   // carimbo da entrega — ver APP.build no Codigo.gs

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

/* A aba que o Formulario alimenta. Quem so tem leitura na planilha recebe erro aqui: valem o nome e o cabecalho. */
function apzLigadaAoFormulario_(aba) {
  try { return !!aba.getFormUrl(); } catch (e) { return false; }
}

/* A linha 1 tem as perguntas do formulario de avaliacao (AVALIADOR, NOME E SOBRENOME DO JOVEM APRENDIZ). */
function apzCabecalhoDeRespostas_(aba) {
  try {
    const n = Math.min(Math.max(aba.getLastColumn(), 1), 40);
    return /avaliador|nome e sobrenome|jovem aprendiz/.test(apzNome_(aba.getRange(1, 1, 1, n).getValues()[0].join(' | ')));
  } catch (e) { return false; }
}

/*
 * A aba de respostas — nunca a Cronograma. Entre as abas com o cabecalho do formulario (ou todas,
 * se nenhuma tiver):
 *   1. a unica ligada ao Formulario (o Formulario religado grava numa aba nova, "Respostas ao
 *      formulario 2", e a antiga fica parada);
 *   2. pelo nome ("Respostas ao formulario 1"; "Form Responses 1" na planilha em ingles), sem as
 *      copias; com mais de uma, a de numero maior (a ligacao mais nova);
 *   3. a primeira com o cabecalho (aba renomeada para "Respostas", "Avaliacoes"...).
 * Nenhuma: null, e a tela diz qual aba falta. Antes caia na primeira aba, que podia ser a propria
 * Cronograma: todo mundo aparecia "Nao realizada", sem erro nenhum.
 */
function abaRespostasApz_(ss, abaCrono) {
  const crono = abaCrono === undefined ? abaCronogramaApz_(ss) : abaCrono;
  const nomeCrono = crono ? crono.getName() : null;
  const abas = ss.getSheets().filter(function (a) { return a.getName() !== nomeCrono; });
  const doFormulario = abas.filter(apzCabecalhoDeRespostas_);
  const ligadas = doFormulario.filter(apzLigadaAoFormulario_);
  if (ligadas.length === 1) return ligadas[0];
  const alvo = chaveAbaApz_(APZ_CONFIG.ABA_RESPOSTAS);
  const peloNome = (doFormulario.length ? doFormulario : abas).filter(function (a) {
    const k = chaveAbaApz_(a.getName());
    return (k === alvo || k.indexOf('respostasaoformulario') === 0 || k.indexOf('formresponses') === 0) &&
      k.indexOf('copia') === -1 && k.indexOf('copy') === -1;
  });
  const numero = function (a) { const m = String(a.getName()).match(/(\d+)\s*$/); return m ? Number(m[1]) : 0; };
  if (peloNome.length) return peloNome.reduce(function (melhor, a) { return numero(a) > numero(melhor) ? a : melhor; });
  return doFormulario[0] || null;
}

/* A aba Cronograma: o nome exato; senao sem diferenca de maiuscula e acento; senao "Cronograma 2026" (nao a copia). */
function abaCronogramaApz_(ss) {
  const exata = ss.getSheetByName(APZ_CONFIG.ABA_CRONOGRAMA);
  if (exata) return exata;
  const alvo = chaveAbaApz_(APZ_CONFIG.ABA_CRONOGRAMA);
  const abas = ss.getSheets();
  return abas.filter(function (a) { return chaveAbaApz_(a.getName()) === alvo; })[0] ||
    abas.filter(function (a) { const k = chaveAbaApz_(a.getName()); return k.indexOf(alvo) === 0 && k.indexOf('copia') === -1; })[0] || null;
}

/* '' se as duas abas estao la; senao o que falta, para a mensagem. */
function faltaAbaApz_(abaResp, abaCrono) {
  const faltam = [];
  if (!abaResp) faltam.push('a aba das respostas do formulário ("' + APZ_CONFIG.ABA_RESPOSTAS + '")');
  if (!abaCrono) faltam.push('a aba "' + APZ_CONFIG.ABA_CRONOGRAMA + '"');
  return faltam.length ? 'falta ' + faltam.join(' e ') : '';
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
    base.erro = e.semAba ? e.message : 'Não consegui ler a planilha do Jovem Aprendiz: ' + (e.message || e) +
      '. Confira se o link está certo e se a conta dona do GSL tem acesso a ela.';
    return base;
  }
}

function lerPlanilhaAprendiz_(id) {
  exigirPorta_();
  const ss = SpreadsheetApp.openById(id);
  const abaCrono = abaCronogramaApz_(ss);
  const abaResp = abaRespostasApz_(ss, abaCrono);
  const falta = faltaAbaApz_(abaResp, abaCrono);
  if (falta) {
    const e = new Error('A planilha "' + ss.getName() + '" não tem as abas esperadas: ' + falta +
      '. Confira o nome das abas (maiúsculas e acentos não importam).');
    e.semAba = true;
    throw e;
  }
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

/*
 * Linha do cronograma que NAO e nome de aprendiz: titulo, cabecalho, turno, contrato, ferias.
 * Sem diferenca de acento e maiuscula ("Periodo de Ferias" com acento so no Periodo, "Media Geral"),
 * e qualquer texto com data ou dois-pontos (nome de pessoa nao tem): "Ferias: 01/12/26",
 * "Fim de contrato 05/02/27".
 * Antes so os rotulos escritos do jeito exato saiam, e o resto virava um aprendiz a mais.
 */
function apzNaoENome_(texto) {
  const k = apzNome_(texto);
  return k === '' || /\d{1,2}\s*[\/.\-]\s*\d{1,2}|:/.test(k) || k.indexOf('turno') !== -1 || k.indexOf('media geral') !== -1 ||
    /^(nome|setor|setores|cronograma|ferias|periodo de ferias|(final|fim|termino|vencimento) d[aeo] contrato)\b/.test(k) ||
    /^((jovem|jovens) )?aprendiz(es)?$/.test(k);
}
function apzEhNome_(v) { return !!v && typeof v === 'string' && !apzNaoENome_(v); }

/* Linha de cabecalho de um bloco do cronograma ("Nome | Setor | Inicio | Final"). */
function apzCabecalhoDoBloco_(linha, b) {
  return /^setor/.test(apzNome_(linha[b.setor])) && /^nome\b|aprendiz/.test(apzNome_(linha[b.nome]));
}

/* O rotulo da frente sai: "Final de contrato : 10/01/28" -> "10/01/28"; "Periodo de ferias - 01/03/27 a ..." -> "01/03/27 a ...". */
function apzSemRotulo_(s) { return String(s).replace(/^[^:\d]*[:\-\u2013]?\s*/, '').trim(); }

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

/*
 * "Final de contrato: 10/01/28" (ou "Fim do contrato - 10/01/28") -> "10/01/2028";
 * '' se a celula nao e de contrato.
 */
function apzContrato_(celula) {
  if (celula && typeof celula.getTime === 'function') return '';
  const s = String(celula || '');
  if (apzNome_(s).indexOf('contrato') === -1) return '';
  return apzAno4_(apzSemRotulo_(s));
}

/* "Periodo de Ferias:  08/09/26 a 07/10/2026" (ou "Ferias: ...") -> "08/09/2026 a 07/10/2026". */
function apzFerias_(celula) {
  if (celula && typeof celula.getTime === 'function') return '';
  const s = String(celula || '');
  if (apzNome_(s).indexOf('ferias') === -1) return '';
  return apzAno4_(apzSemRotulo_(s));
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

/*
 * Nota da celula: numero (ou "4,5" escrito como texto). Em branco ou texto: null — nao conta
 * como zero (como o =MEDIA da coluna M). Antes a nota em branco virava 0 na media geral e no radar.
 */
function apzNota_(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(',', '.');
  return s === '' || isNaN(Number(s)) ? null : Number(s);
}

/* Momento do "Carimbo de data/hora" (Date ou texto dd/mm/aaaa hh:mm:ss), para ordenar; NaN sem data. */
function apzMomento_(v) {
  if (v && typeof v.getTime === 'function') return v.getTime();
  const m = String(v == null ? '' : v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN;
}

/*
 * Os setores do cronograma de um aprendiz, um por setor: "Loja" em dois periodos, ou
 * "C. Carregamento" e "Carregamento", e um so (a mesma chave da avaliacao, apzSetor_).
 */
function apzSetoresDoCronograma_(bloco) {
  const vistos = {}, out = [];
  (bloco ? bloco.setores : []).forEach(function (s) {
    const chave = apzSetor_(s.setor);
    if (Object.prototype.hasOwnProperty.call(vistos, chave)) return;
    vistos[chave] = true;
    out.push({ nome: s.setor, chave: chave });
  });
  return out;
}

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

  /*
   * 2 · Os blocos da aba Cronograma: nome, contrato, ferias e os setores com as datas.
   * O titulo e o cabecalho no alto ("Nome | Setor | Inicio | Final") ficam de fora. O bloco vai ate
   * 8 linhas, mas para no nome seguinte: bloco mais curto nao leva os setores do proximo aprendiz.
   * Contrato e ferias valem em qualquer linha do bloco (antes so na 2a e na 3a).
   */
  const blocos = {};               // chave -> { nome, setores, contrato, ferias }
  const ordemBlocos = [];
  const comeco = APZ_CONFIG.BLOCOS.map(function (b) {
    for (let i = 0; i < Math.min(crono.length, 15); i++) if (apzCabecalhoDoBloco_(crono[i], b)) return i + 1;
    return 0;
  });
  for (let i = 0; i < crono.length; i++) {
    APZ_CONFIG.BLOCOS.forEach(function (b, nb) {
      if (i < comeco[nb]) return;
      const raw = crono[i][b.nome];
      if (!apzEhNome_(raw)) return;
      const nomeLimpo = raw.trim();
      const k = apzNome_(nomeLimpo);
      if (blocos[k]) return;
      const setores = [];
      let contrato = '', ferias = '';
      for (let j = i; j < i + N && j < crono.length; j++) {
        if (j > i && (apzEhNome_(crono[j][b.nome]) || apzCabecalhoDoBloco_(crono[j], b))) break;
        if (j > i && !contrato) contrato = apzContrato_(crono[j][b.nome]);
        if (j > i && !ferias) ferias = apzFerias_(crono[j][b.nome]);
        const s = crono[j][b.setor];
        if (s && String(s).trim() !== '' && !/^setor(es)?$/.test(apzNome_(s))) {
          setores.push({ setor: String(s).trim(), inicio: apzIso_(crono[j][b.inicio], tz), final: apzIso_(crono[j][b.final], tz) });
        }
      }
      blocos[k] = { nome: nomeLimpo, setores: setores, contrato: contrato, ferias: ferias };
      ordemBlocos.push(k);
    });
  }

  /*
   * 3 · A lista do seletor, com o status de cada um. No cronograma: Concluido quando CADA setor
   * dele tem avaliacao — o mesmo setor duas vezes conta uma, e a avaliacao de um setor que nao
   * esta no cronograma dele nao completa outro (antes contava so a quantidade, e a lista dizia
   * Pendente com o painel em 100%, ou Concluido com setor por fazer).
   */
  const todos = ordemBlocos.slice();
  nomesDasRespostas.forEach(function (k) { if (!blocos[k]) todos.push(k); });
  const lista = todos.map(function (k) {
    const feitos = setoresAvaliados[k] || {};
    const avaliados = Object.keys(feitos).length;
    // Quem so aparece nas respostas (fora do cronograma) conta com 8 setores previstos, como antes.
    const completo = blocos[k]
      ? apzSetoresDoCronograma_(blocos[k]).every(function (s) { return feitos[s.chave]; })
      : avaliados >= N;
    let status = APZ_STATUS.NAO_REALIZADA, ordem = 3;
    if (avaliados > 0 && completo) { status = APZ_STATUS.CONCLUIDO; ordem = 1; }
    else if (avaliados > 0) { status = APZ_STATUS.PENDENTE; ordem = 2; }
    return { chave: k, nomeOriginal: blocos[k] ? blocos[k].nome : nomeDaChave[k], status: status, ordem: ordem };
  }).sort(function (a, b) { return (a.ordem - b.ordem) || a.nomeOriginal.localeCompare(b.nomeOriginal); });

  /*
   * 4 · O painel de cada aprendiz. As avaliacoes de cada um em ordem do Carimbo de data/hora, seja
   * qual for a ordem das linhas na aba (aba classificada com a mais nova em cima mostrava a mais
   * antiga como "a mais recente"). Linha sem data fica junto da linha de cima dela.
   */
  const avaliacoesDe = {};
  for (let i = 1; i < resp.length; i++) {
    const row = resp[i];
    const k = apzNome_(row[C.NOME] ? String(row[C.NOME]) : '');
    if (!k) continue;
    (avaliacoesDe[k] = avaliacoesDe[k] || []).push(row);
  }
  Object.keys(avaliacoesDe).forEach(function (k) {
    let anterior = -Infinity;
    avaliacoesDe[k] = avaliacoesDe[k].map(function (row, i) {
      const t = apzMomento_(row[C.DATA]);
      if (!isNaN(t)) anterior = t;
      return { row: row, i: i, t: isNaN(t) ? anterior : t };
    }).sort(function (a, b) { return (a.t - b.t) || (a.i - b.i); }).map(function (x) { return x.row; });
  });
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
 * medias de cada competencia, media geral (a media das cinco; nota em
 * branco fica de fora, nao vale zero), setores do
 * cronograma e o status de cada um (avaliado = concluido; o primeiro ainda
 * sem avaliacao = setor atual).
 */
function painelDoAprendiz_(item, bloco, linhas, tz) {
  const C = APZ_CONFIG.COL;
  const doCronograma = apzSetoresDoCronograma_(bloco);
  const cronogramaSetores = doCronograma.map(function (s) { return s.nome; });

  // Ordem do grafico: Atencao, Interesse, Proatividade, Aprendizado, Disciplina.
  const PILARES = [C.ATENCAO, C.INTERESSE, C.PROATIVIDADE, C.APRENDIZADO, C.DISCIPLINA];
  const avaliacoes = [];
  const soma = [0, 0, 0, 0, 0], qtd = [0, 0, 0, 0, 0];
  linhas.forEach(function (row, n) {
    // Nota em branco fica de fora da media da competencia (nao vale zero).
    const notas = PILARES.map(function (c) { return apzNota_(row[c]); });
    notas.forEach(function (v, p) { if (v !== null) { soma[p] += v; qtd[p]++; } });
    // "Media por setor" (coluna M, formula =MEDIA(F:J)). O Formulario acrescenta a linha nova SEM a
    // formula; o portal antigo mostrava 0 ate alguem puxar a formula. Aqui faz a mesma conta dela.
    // Sem nota nenhuma: sem media (null), e ela nao puxa a media do setor para baixo.
    let media = apzNota_(row[C.MEDIA]);
    if (media === null) {
      const validas = notas.filter(function (v) { return v !== null; });
      media = validas.length ? validas.reduce(function (a, b) { return a + b; }, 0) / validas.length : null;
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
      mediaSetor: media === null ? null : apzUm_(media),
      notas: notas,                          // null = nota em branco
      pontosPositivos: linhasDe(row[C.POSITIVOS]),
      pontosMelhorar: linhasDe(row[C.MELHORAR])
    });
  });

  const total = avaliacoes.length;
  // Media de cada competencia so com as notas dadas (competencia sem nota nenhuma: null, o radar mostra
  // um traco; sem avaliacao, 0 como antes); a media geral e a media das competencias que tem nota.
  const medias = soma.map(function (x, p) { return qtd[p] ? x / qtd[p] : (total ? null : 0); });
  const comNota = medias.filter(function (x, p) { return qtd[p] > 0; });
  const mediaGeral = comNota.length ? comNota.reduce(function (s, x) { return s + x; }, 0) / comNota.length : 0;

  // Media de cada setor (os dois turnos juntos) e o status no cronograma. Como no portal: da avaliacao
  // mais recente para a mais antiga, guardando a ordem em que cada setor apareceu (a soma nessa ordem
  // da o mesmo arredondamento, e quem nao esta no cronograma ve os setores nessa ordem).
  const porSetor = {}, ordemSetores = [];
  avaliacoes.slice().reverse().forEach(function (a) {
    if (!Object.prototype.hasOwnProperty.call(porSetor, a.chaveSetor)) {
      porSetor[a.chaveSetor] = { soma: 0, qtd: 0 };
      ordemSetores.push(a.chaveSetor);
    }
    if (a.mediaSetor !== null) { porSetor[a.chaveSetor].soma += a.mediaSetor; porSetor[a.chaveSetor].qtd++; }
  });
  // No cronograma, vivenciados sao os setores DELE ja avaliados (o KPI e a linha do tempo contam igual;
  // a avaliacao de um setor de fora continua nos graficos e no feedback). Fora do cronograma: todos.
  const vivenciados = doCronograma.length
    ? doCronograma.filter(function (s) { return Object.prototype.hasOwnProperty.call(porSetor, s.chave); }).length
    : ordemSetores.length;
  const setoresDaLinha = cronogramaSetores.length ? cronogramaSetores : ordemSetores;
  let achouAtual = false;
  const linhaDoTempo = setoresDaLinha.map(function (nome) {
    const k = apzSetor_(nome);
    if (Object.prototype.hasOwnProperty.call(porSetor, k)) {
      return { setor: nome, status: 'concluido', media: porSetor[k].qtd ? apzUm_(porSetor[k].soma / porSetor[k].qtd) : null };
    }
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
    mediasPilares: medias.map(function (x) { return x === null ? null : apzUm_(x); }),
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
  let nome = '', falta = '';
  try {
    const ss = SpreadsheetApp.openById(id);
    nome = ss.getName();
    // As duas abas (antes bastava uma: planilha so com uma "Cronograma" qualquer era aceita, e a
    // propria Cronograma era lida como respostas).
    const crono = abaCronogramaApz_(ss);
    falta = faltaAbaApz_(abaRespostasApz_(ss, crono), crono);
  } catch (e) {
    throw new Error('Não consegui abrir a planilha. A conta dona do GSL precisa ter acesso a ela.');
  }
  if (falta) throw new Error('A planilha "' + nome + '" não tem as abas esperadas: ' + falta + '.');
  // Ligar de novo (mesmo link) e ler de novo: a copia guardada da leitura anterior sai.
  try { CacheService.getScriptCache().remove(chaveNoEspaco('aprendiz|' + id)); } catch (e) {}
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
