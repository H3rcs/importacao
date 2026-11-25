/**
 * SITUACAO DE CARGA — o relatorio "Situacao de Expedicao das Cargas em
 * Processo" (Stimulsoft) virando indicadores do CD.
 *
 * Como funciona:
 *   - a tela le o PDF NO NAVEGADOR (pdf.js, ver Carga.html) e manda as
 *     cargas ja em tabela; aqui cada envio vira um SNAPSHOT (CARGA_SNAPSHOTS)
 *     com a data e hora de emissao do relatorio. O historico fica: e dele que
 *     saem o ritmo (tarefas por hora entre um envio e outro), a previsao de
 *     termino e as cargas paradas;
 *   - o servidor NAO confia no que veio da tela: confere cada campo, refaz o
 *     resumo e recusa o relatorio mais velho que o ultimo (ou o mesmo de novo);
 *   - a equipe de cada deposito (separadores, conferentes e os andares do
 *     flowrack do Nobre) vem do Quadro do CD (aba GERAL, lida pelo Quadro.gs)
 *     e a alocacao fica em CARGA_EQUIPE: uma linha viva por pessoa, entao a
 *     pessoa esta num lugar so;
 *   - paleteiras e carrinhos ficam em CARGA_EQUIPAMENTOS (livre, em uso,
 *     em manutencao);
 *   - a tela pergunta de tempos em tempos a "geracao" (acaoGeracaoCarga, que
 *     so le tres numeros) e redesenha quando alguem mexeu.
 *
 * Toda gravacao passa pelo executarAcao (faixa "Ver e editar" na tela
 * carga da matriz de acesso) e pelo comTrava; o inserir/atualizar do Banco.gs grava o LOG.
 *
 * ONDE ESTAO OS DADOS (para trocar o armazenamento do "ao vivo" sem mexer
 * nas contas): so este arquivo toca nas tabelas CARGA_*. Leitura:
 * cgSnapshots_ + cgCargasDe_ (envios), cgEquipe_ (alocacao),
 * cgEquipamentos_ (paleteiras e carrinhos) e cgGeracao_ (o numero que a
 * tela pergunta). Gravacao: as acao...Carga abaixo, cada uma numa trava.
 *
 * Celulas do relatorio: "X" = pronto, "-" = o deposito nao tem nada nesta
 * carga, "a/b" = a de b tarefas feitas. A carga marcada com "*" e de 24 horas.
 *
 * FASE 2 (8.15), no fim deste arquivo: o historico de cada envio (cgSnapshotDaTela_ e a comparacao
 * entre dois envios), a SEQUENCIA das cargas (CARGA_SEQUENCIA), os TURNOS pelo horario (parametros
 * CARGA_TURNO_A/B/C) e a FALTA do dia (CARGA_PRESENCA), as paleteiras e os check-outs que acompanham
 * separadores e conferentes, os BOXES E O CARREGAMENTO (o controle das docas, no lugar da planilha), o modelo do
 * FLOWRACK (ruas por andar) e a PASSAGEM DE TURNO (CARGA_PASSAGEM).
 */

/*
 * Os depositos na ordem do relatorio. equip: o que cada um usa (o Nobre e flowrack: pessoas por andar).
 * PALETEIRAS (decisao da gerencia em 25/11): UM POOL SO de 12 paleteiras para o CD. Grandeza, Nobre
 * Grandeza, Pesaveis e Blocado estao sob a mesma supervisao e tiram do mesmo pool: cada paleteira esta
 * LIVRE (no pool), em USO num desses quatro depositos, ou em MANUTENCAO. CARRINHOS: 35, da Miudeza.
 * As duas quantidades mudam na tela (quem edita) e ficam gravadas.
 */
const CG_DEPOSITOS = [
  { id: 'GRANDEZA',       nome: 'Grandeza',       equip: 'PALETEIRA', grupo: 'GNPB' },
  { id: 'MIUDEZA',        nome: 'Miudeza',        equip: 'CARRINHO' },
  { id: 'BLOCADO',        nome: 'Blocado',        equip: 'PALETEIRA', grupo: 'GNPB' },
  { id: 'PESAVEIS',       nome: 'Pesáveis',       equip: 'PALETEIRA', grupo: 'GNPB' },
  { id: 'NOBRE',          nome: 'Nobre',          equip: '',          andares: 5 },
  { id: 'NOBRE_GRANDEZA', nome: 'Nobre Grandeza', equip: 'PALETEIRA', grupo: 'GNPB' }
];
/* Os quatro depositos de uma supervisao so (a tela "Supervisao" mostra os quatro lado a lado). */
const CG_GRUPO_SUPERVISAO = ['GRANDEZA', 'NOBRE_GRANDEZA', 'PESAVEIS', 'BLOCADO'];
const CG_EQUIP_PADRAO = { PALETEIRA: 12, CARRINHO: 35, CHECKOUT: 12 };
const CG_EQUIP_DONO = { CARRINHO: 'MIUDEZA' };       // carrinho e sempre da Miudeza; paleteira vai e volta do pool
/*
 * 8.15 (pedido da gerencia): a paleteira e o check-out deixam de ser arrastados. Cada SEPARADOR alocado na
 * Grandeza, Nobre Grandeza, Pesaveis ou Blocado usa uma paleteira do pool do CD; cada CONFERENTE alocado
 * (em qualquer deposito) usa um check-out (estacao de conferencia) — um pool so para o CD. Livres = total -
 * manutencao - em uso. A manutencao continua manual. Quem chegou por ultimo (DESDE) e quem fica sem.
 */
const CG_EQUIP_CONSUMO = { PALETEIRA: 'SEPARADOR', CHECKOUT: 'CONFERENTE' };
const CG_EQUIP_NOME = { PALETEIRA: ['Paleteira', 'paleteira', 'paleteiras'], CARRINHO: ['Carrinho', 'carrinho', 'carrinhos'], CHECKOUT: ['Check-out', 'check-out', 'check-outs'] };
/*
 * EQUILIBRIO ENTRE DEPOSITOS (25/11): os depositos tem que andar juntos — a carga so sai quando
 * TODOS os depositos dela terminam. Diferenca entre o mais adiantado e o mais atrasado, em pontos
 * percentuais: ate EQUILIBRADO = Equilibrado; ate ATENCAO = Atencao; acima = Desequilibrado.
 * Os limites ficam em PARAMETROS (CARGA_EQUILIBRIO_PP e CARGA_ATENCAO_PP), editaveis na Configuracao.
 */
const CG_EQUILIBRIO_PADRAO = { equilibrado: 10, atencao: 20, peso24h: 2 };
const CG_ANDARES = ['Térreo', '1º andar', '2º andar', '3º andar', '4º andar'];
const CG_PAPEIS = ['SEPARADOR', 'CONFERENTE'];
const CG_ESTADOS_EQUIP = ['LIVRE', 'USO', 'MANUTENCAO'];
const CG_MAX_CARGAS = 3000;
const CG_MAX_EQUIP = 60;
const CG_CELULA_MAX = 45000;          // a celula do Sheets aceita 50 mil caracteres
const CG_SNAPSHOTS_NA_PLANILHA = 6;   // os mais novos guardam as cargas na propria planilha; os outros vao para o Drive
const CG_JANELA_RITMO_H = 3;          // o ritmo olha as ultimas 3 horas de envios
const CG_INTERVALO_MAX_H = 4;         // dois envios com mais de 4 h entre eles (a noite) nao entram no ritmo
const CG_HISTORICO_H = 36;            // a linha do tempo mostra as ultimas 36 horas

/* ------------------------------------------------------------------ */
/* DATAS (o relatorio traz a hora local; as contas sao em minutos)      */
/* ------------------------------------------------------------------ */

/* "2026-11-25T08:05:37" (hora local do CD) ou '' */
function cgIso_(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return '';
  const a = +m[1], me = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (a < 2020 || a > 2100 || me < 1 || me > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return '';
  const dt = new Date(Date.UTC(a, me - 1, d, h, mi, s));
  if (dt.getUTCDate() !== d) return '';                      // 31/11 nao existe
  return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00');
}
/* Minutos "de relogio" desde 1970, contando a hora local como se fosse UTC: so serve para diferencas. */
function cgMin_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(iso || ''));
  if (!m) return 0;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 60000);
}
function cgAgoraIso_() { return Utilities.formatDate(new Date(), fuso(), "yyyy-MM-dd'T'HH:mm:ss"); }
function cgBr_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : String(iso || '');
}

/* ------------------------------------------------------------------ */
/* CELULAS                                                             */
/* ------------------------------------------------------------------ */

/* Uma celula do relatorio: 'X' · '-' · 'a/b' · '' (nao lida). Qualquer outra coisa vira ''. */
function cgCelula_(v) {
  const t = String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
  if (t === 'X' || t === '✓' || t === 'OK') return 'X';
  if (t === '-' || t === '–' || t === '—') return '-';
  const m = /^(\d{1,5})\/(\d{1,5})$/.exec(t);
  if (m) {
    const a = +m[1], b = +m[2];
    if (b > 0 && a <= b) return a + '/' + b;
  }
  return '';
}
/* { a, b, x, nada } de uma celula ja normalizada. */
function cgPartes_(c) {
  if (c === 'X') return { x: true, a: 0, b: 0 };
  if (c === '-') return { nada: true, a: 0, b: 0 };
  const m = /^(\d+)\/(\d+)$/.exec(c || '');
  if (m) return { a: +m[1], b: +m[2], completa: +m[1] >= +m[2] };
  return { vazia: true, a: 0, b: 0 };
}
function cgCompleta_(c) { const p = cgPartes_(c); return !!(p.x || p.completa); }

/* ------------------------------------------------------------------ */
/* VALIDACAO DO QUE VEIO DA TELA                                       */
/* ------------------------------------------------------------------ */

function cgTexto_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

/* Os depositos do relatorio: os conhecidos pelo id; um deposito novo no relatorio entra com o nome dele. */
function cgDepositosDoEnvio_(lista) {
  const saida = [], vistos = {};
  (Array.isArray(lista) && lista.length ? lista : CG_DEPOSITOS).slice(0, 12).forEach(function (d) {
    const bruto = typeof d === 'string' ? d : (d && (d.id || d.nome));
    const id = cgIdDeposito_(bruto);
    if (!id || vistos[id]) return;
    vistos[id] = true;
    const conhecido = CG_DEPOSITOS.filter(function (x) { return x.id === id; })[0];
    saida.push({ id: id, nome: conhecido ? conhecido.nome : cgTexto_(d && d.nome || bruto, 30) });
  });
  if (!saida.length) throw new Error('A situação de carga veio sem nenhum depósito.');
  return saida;
}
function cgIdDeposito_(v) {
  const t = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t) return '';
  if (/NOBRE/.test(t) && /GRAND/.test(t)) return 'NOBRE_GRANDEZA';
  if (/NOBRE/.test(t)) return 'NOBRE';
  if (/GRAND/.test(t)) return 'GRANDEZA';
  if (/MIUD/.test(t)) return 'MIUDEZA';
  if (/BLOC/.test(t)) return 'BLOCADO';
  if (/PESAV|PESAD/.test(t)) return 'PESAVEIS';
  return t.replace(/ /g, '_').slice(0, 24);
}

/* As cargas que vieram da tela, conferidas. Devolve { cargas, recusadas }. */
function cgCargasDoEnvio_(lista, depositos) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('Nenhuma carga lida. Confira se o PDF é a Situação de Expedição das Cargas.');
  if (lista.length > CG_MAX_CARGAS) throw new Error('São ' + lista.length + ' linhas: mais do que uma situação de carga costuma ter (' + CG_MAX_CARGAS + ').');
  const cargas = [], recusadas = [], vistas = {};
  lista.forEach(function (c, i) {
    c = c || {};
    const n = String(c.nro || c.n || '').replace(/\D+/g, '');
    if (!/^\d{3,10}$/.test(n)) { recusadas.push('linha ' + (i + 1) + ': número da carga inválido'); return; }
    if (vistas[n]) { recusadas.push('carga ' + n + ' repetida'); return; }
    vistas[n] = true;
    const s = {};
    let lidas = 0;
    depositos.forEach(function (d) {
      const par = (c.d && (c.d[d.id] || c.d[d.nome])) || (c.s && c.s[d.id]) || [];
      const sep = cgCelula_(Array.isArray(par) ? par[0] : par.sep);
      const conf = cgCelula_(Array.isArray(par) ? par[1] : par.conf);
      if (sep || conf) lidas++;
      s[d.id] = [sep, conf];
    });
    if (!lidas) { recusadas.push('carga ' + n + ': nenhuma célula de depósito lida'); return; }
    cargas.push({
      n: n,
      nm: cgTexto_(c.nome || c.nm, 160),
      v: cgTexto_(c.veiculo || c.v, 40),
      bx: cgTexto_(c.box || c.bx, 8).replace(/[^\w-]/g, ''),
      h: c.h24 || c.h ? 1 : 0,
      s: s
    });
  });
  if (!cargas.length) throw new Error('Nenhuma carga ficou de pé depois da conferência: ' + recusadas.slice(0, 3).join('; ') + '.');
  return { cargas: cargas, recusadas: recusadas };
}

/* Assinatura do conteudo (para recusar o mesmo arquivo duas vezes). */
function cgAssinatura_(emitido, cargas) {
  const texto = emitido + '|' + cargas.map(function (c) {
    return [c.n, c.nm, c.v, c.bx, c.h, Object.keys(c.s).sort().map(function (k) { return k + ':' + c.s[k].join(','); }).join(';')].join('|');
  }).join('\n');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* LEITURA DOS SNAPSHOTS                                               */
/* ------------------------------------------------------------------ */

function cgJson_(t, padrao) { try { const v = JSON.parse(String(t || '')); return v == null ? padrao : v; } catch (e) { return padrao; } }

/* Os snapshots vivos, do mais novo para o mais velho (pela emissao; empate pelo envio). */
function cgSnapshots_() {
  return listar('CARGA_SNAPSHOTS').filter(function (r) { return cgIso_(r.EMITIDO_EM); }).sort(function (a, b) {
    const d = cgMin_(b.EMITIDO_EM) - cgMin_(a.EMITIDO_EM);
    return d || String(b.ENVIADO_EM || '').localeCompare(String(a.ENVIADO_EM || ''));
  });
}

/* As cargas de um snapshot: da planilha ou, nos mais antigos, do arquivo no Drive. */
function cgCargasDe_(linha) {
  const bruto = String(linha && linha.CARGAS || '');
  if (!bruto) return [];
  if (bruto.indexOf('DRIVE:') === 0) {
    try { return cgJson_(DriveApp.getFileById(bruto.slice(6)).getBlob().getDataAsString(), []); }
    catch (e) { return []; }
  }
  // Envio grande: o texto continua nas colunas CARGAS_2 e CARGAS_3.
  return cgJson_(bruto + String(linha.CARGAS_2 || '') + String(linha.CARGAS_3 || ''), []);
}

/* ------------------------------------------------------------------ */
/* RESUMO DE UM SNAPSHOT                                               */
/* ------------------------------------------------------------------ */

/*
 * Por deposito:
 *   cargas        cargas com trabalho no deposito (SEP ou CONF diferente de "-")
 *   concluidas    SEP e CONF prontos (X, ou a/b com a = b)
 *   naoIniciadas  nada separado ainda (0/b)
 *   emSep         separacao comecada e nao terminada
 *   emConf        separacao pronta, conferencia por terminar
 *   restSep/Conf  tarefas que faltam: soma de (b - a) das celulas a/b
 *   sepFeitas/Total, confFeitas/Total: tarefas feitas e totais; a celula X
 *                 conta o tamanho que a carga teve no ultimo a/b visto (tb);
 *                 sem tamanho conhecido, a media de tarefas por carga do deposito
 *   h24Pend       cargas de 24 horas com o deposito por terminar
 */
function cgResumo_(cargas, depositos) {
  const dep = {};
  depositos.forEach(function (d) {
    const r = { cargas: 0, concluidas: 0, naoIniciadas: 0, emSep: 0, emConf: 0, restSep: 0, restConf: 0,
      sepFeitas: 0, sepTotal: 0, confFeitas: 0, confTotal: 0, h24Pend: 0, estimadas: 0 };
    let somaB = 0, nB = 0;
    cargas.forEach(function (c) {
      const par = c.s[d.id] || ['', ''];
      [0, 1].forEach(function (k) { const p = cgPartes_(par[k]); if (p.b) { somaB += p.b; nB++; } });
    });
    const media = nB ? somaB / nB : 1;
    cargas.forEach(function (c) {
      const par = c.s[d.id] || ['', ''];
      const ps = cgPartes_(par[0]), pc = cgPartes_(par[1]);
      if ((ps.nada || ps.vazia) && (pc.nada || pc.vazia)) return;
      r.cargas++;
      const tam = (c.tb && c.tb[d.id]) || 0;
      const sepOk = ps.x || ps.completa || ps.nada, confOk = pc.x || pc.completa || pc.nada;
      if (sepOk && confOk) r.concluidas++;
      else if (sepOk) r.emConf++;
      else if (ps.a > 0) r.emSep++;
      else r.naoIniciadas++;
      if (c.h && !(sepOk && confOk)) r.h24Pend++;
      [[ps, 'Sep'], [pc, 'Conf']].forEach(function (x) {
        const p = x[0];
        if (p.nada || p.vazia) return;
        if (p.x) {
          const t = tam || media;
          if (!tam) r.estimadas++;
          r[x[1].toLowerCase() + 'Feitas'] += t; r[x[1].toLowerCase() + 'Total'] += t;
          return;
        }
        r[x[1].toLowerCase() + 'Feitas'] += p.a; r[x[1].toLowerCase() + 'Total'] += p.b;
        r['rest' + x[1]] += p.b - p.a;
      });
    });
    ['sepFeitas', 'sepTotal', 'confFeitas', 'confTotal'].forEach(function (k) { r[k] = Math.round(r[k]); });
    dep[d.id] = r;
  });
  const total = cargas.length;
  const prontas = cargas.filter(function (c) {
    return depositos.every(function (d) { const par = c.s[d.id] || ['', '']; return cgCompletaOuNada_(par[0]) && cgCompletaOuNada_(par[1]); });
  }).length;
  const h24 = cargas.filter(function (c) { return c.h; });
  const h24Pend = h24.filter(function (c) {
    return !depositos.every(function (d) { const par = c.s[d.id] || ['', '']; return cgCompletaOuNada_(par[0]) && cgCompletaOuNada_(par[1]); });
  }).length;
  return { v: 1, total: total, prontas: prontas, h24: h24.length, h24Pend: h24Pend, dep: dep };
}
function cgCompletaOuNada_(c) { const p = cgPartes_(c); return !!(p.x || p.completa || p.nada || p.vazia); }

/* Tarefas feitas por deposito numa carga (a celula X conta o tamanho conhecido). */
function cgFeitas_(c, idDep) {
  const par = (c.s && c.s[idDep]) || ['', ''];
  const tam = (c.tb && c.tb[idDep]) || 0;
  return [0, 1].map(function (k) {
    const p = cgPartes_(par[k]);
    if (p.x) return tam;
    return p.a || 0;
  });
}

/*
 * ACOMPANHAMENTO de uma carga entre envios (vai junto com cada carga):
 *   pv  minuto da primeira emissao em que a carga apareceu
 *   um  { deposito: minuto da ultima emissao em que a celula mudou }
 *   tb  { deposito: maior b ja visto (o tamanho da carga no deposito) }
 * E o "desde": tarefas feitas desde o envio anterior, por deposito.
 */
function cgAcompanhar_(cargas, anteriores, depositos, minNovo, minAnterior) {
  const antes = {};
  (anteriores || []).forEach(function (c) { antes[c.n] = c; });
  const desde = {};
  depositos.forEach(function (d) { desde[d.id] = { sep: 0, conf: 0, cargas: 0 }; });
  cargas.forEach(function (c) {
    const a = antes[c.n];
    c.pv = a && a.pv ? a.pv : minNovo;
    c.um = {}; c.tb = {};
    depositos.forEach(function (d) {
      const par = c.s[d.id] || ['', ''];
      const parAntes = a && a.s && a.s[d.id];
      const tamAntes = (a && a.tb && a.tb[d.id]) || 0;
      const bs = par.map(function (x) { return cgPartes_(x).b || 0; });
      c.tb[d.id] = Math.max(tamAntes, bs[0], bs[1]);
      if (!c.tb[d.id]) delete c.tb[d.id];
      const igual = parAntes && parAntes[0] === par[0] && parAntes[1] === par[1];
      c.um[d.id] = igual && a.um && a.um[d.id] ? a.um[d.id] : minNovo;
      if (!a && !minAnterior) return;
      const agora = cgFeitas_(c, d.id), ant = a ? cgFeitas_(a, d.id) : [0, 0];
      desde[d.id].sep += Math.max(0, agora[0] - ant[0]);
      desde[d.id].conf += Math.max(0, agora[1] - ant[1]);
      if (cgCompleta_(par[0]) && cgCompleta_(par[1]) && !(parAntes && cgCompleta_(parAntes[0]) && cgCompleta_(parAntes[1]))) desde[d.id].cargas++;
    });
  });
  return { desde: desde, horas: minAnterior ? Math.max(0, (minNovo - minAnterior) / 60) : 0 };
}

/* ------------------------------------------------------------------ */
/* EQUIPE (Quadro do CD) E ALOCACAO                                    */
/* ------------------------------------------------------------------ */

/* As pessoas ativas da aba GERAL do Quadro (a copia de 5 minutos do Quadro.gs). */
function cgPessoasDoQuadro_() {
  const id = typeof idPlanilhaQuadro_ === 'function' ? idPlanilhaQuadro_() : '';
  if (!id) return { pessoas: [], aviso: 'Ligue a planilha do Quadro do CD (módulo Quadro do CD) para trazer a lista de funcionários.' };
  let q;
  try { q = quadroLidoQ_(id, parametrosFeriasQ_()); }
  catch (e) { return { pessoas: [], aviso: 'Não consegui ler o Quadro do CD: ' + (e.message || e) }; }
  const vistas = {};
  const pessoas = [];
  (q.geral || []).forEach(function (g) {
    if (!g.ativo || !g.nome) return;
    let k = g.cod ? 'C' + String(g.cod).replace(/[^\w-]/g, '') : (g.rh ? 'R' + String(g.rh).replace(/[^\w-]/g, '') : 'N' + cgChaveNome_(g.nome));
    if (vistas[k]) k = k + '-' + g.ref;
    vistas[k] = true;
    pessoas.push({ k: k, nome: g.nome, funcao: g.funcao || '', equipe: g.equipe || g.equipeBruta || '', situacao: g.situacao || 'ATIVO' });
  });
  return { pessoas: pessoas, aviso: '', fonte: q.fonte ? q.fonte.nome : '' };
}
function cgChaveNome_(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]+/g, '').slice(0, 40);
}

function cgEquipe_() {
  return listar('CARGA_EQUIPE').map(function (r) {
    return { id: r.ID, k: String(r.PESSOA || ''), nome: String(r.NOME || ''), funcao: String(r.FUNCAO || ''), equipe: String(r.EQUIPE || ''),
      dep: String(r.DEPOSITO || ''), papel: String(r.PAPEL || ''), andar: r.ANDAR === '' || r.ANDAR == null ? -1 : Number(r.ANDAR),
      desde: String(r.DESDE || ''), por: String(r.ATUALIZADO_POR || r.CRIADO_POR || ''),
      rua: r.RUA === '' || r.RUA == null ? 0 : (Number(r.RUA) || 0) };
  }).filter(function (x) { return x.k && x.dep; });
}

/* Contagem de quem esta em cada deposito agora: { DEP: { sep, conf, andares: [..] } } */
function cgContagemEquipe_(equipe) {
  const c = {};
  CG_DEPOSITOS.forEach(function (d) { c[d.id] = { sep: 0, conf: 0, andares: [0, 0, 0, 0, 0] }; });
  equipe.forEach(function (p) {
    const x = c[p.dep];
    if (!x) return;
    if (p.papel === 'CONFERENTE') x.conf++;
    else { x.sep++; if (p.andar >= 0 && p.andar < 5) x.andares[p.andar]++; }
  });
  return c;
}

/* ------------------------------------------------------------------ */
/* EQUIPAMENTOS                                                        */
/* ------------------------------------------------------------------ */

/*
 * Os equipamentos: { id, tipo, numero, estado, dep, obs, quando, por }. dep: onde a paleteira esta em
 * uso ('' = no pool ou na manutencao); carrinho: sempre MIUDEZA. Tipo que nunca foi gravado (banco
 * antigo sem a semente) aparece com a quantidade padrao, tudo livre — a primeira mudanca grava.
 */
function cgEquipamentos_() {
  const linhas = listar('CARGA_EQUIPAMENTOS');
  const saida = [];
  Object.keys(CG_EQUIP_PADRAO).forEach(function (tipo) {
    const minhas = linhas.filter(function (r) { return String(r.TIPO) === tipo; })
      .sort(function (a, b) { return Number(a.NUMERO) - Number(b.NUMERO); });
    if (!minhas.length) {
      for (let i = 1; i <= CG_EQUIP_PADRAO[tipo]; i++) saida.push(cgEquipVirtual_(tipo, i));
      return;
    }
    minhas.forEach(function (r) {
      if (Number(r.NUMERO) < 1) return;          // a linha 0 so guarda que a quantidade foi para zero
      let estado = CG_ESTADOS_EQUIP.indexOf(String(r.ESTADO)) !== -1 ? String(r.ESTADO) : 'LIVRE';
      if (CG_EQUIP_CONSUMO[tipo] && estado === 'USO') estado = 'LIVRE';   // 8.15: o uso vem das pessoas alocadas
      let dep = String(r.DEPOSITO || '');
      if (CG_EQUIP_DONO[tipo]) dep = CG_EQUIP_DONO[tipo];
      else if (estado !== 'USO') dep = '';
      saida.push({ id: r.ID, tipo: tipo, numero: Number(r.NUMERO), estado: estado, dep: dep,
        obs: String(r.OBSERVACAO || ''), quando: String(r.ATUALIZADO_EM || ''), por: String(r.ATUALIZADO_POR || '') });
    });
  });
  return saida;
}
function cgEquipVirtual_(tipo, i) {
  return { id: '', tipo: tipo, numero: i, estado: 'LIVRE', dep: CG_EQUIP_DONO[tipo] || '', obs: '', quando: '', por: '' };
}

/*
 * SEMENTE (instalacao, migracoes 8.14 e 8.15 e filial nova): 12 paleteiras no pool, 35 carrinhos na
 * Miudeza e 12 check-outs, tudo livre. So o TIPO que nunca teve linha nenhuma (nem a linha 0 de quem
 * zerou) — o que a gerencia ajustou depois fica.
 */
function semearEquipamentosCarga_() {
  const todas = listar('CARGA_EQUIPAMENTOS', true);
  const linhas = [];
  Object.keys(CG_EQUIP_PADRAO).forEach(function (tipo) {
    if (todas.some(function (r) { return String(r.TIPO) === tipo; })) return;
    for (let i = 1; i <= CG_EQUIP_PADRAO[tipo]; i++) linhas.push({ TIPO: tipo, DEPOSITO: CG_EQUIP_DONO[tipo] || '', NUMERO: String(i), ESTADO: 'LIVRE' });
  });
  if (!linhas.length) return false;
  inserirVarios('CARGA_EQUIPAMENTOS', linhas, 'sistema');
  return true;
}

/*
 * MIGRACAO 8.15: a paleteira "em uso" num deposito (arrastada a mao ate a 8.14) volta para LIVRE — o uso
 * agora e calculado pelos separadores alocados, entao nenhuma paleteira fica contada duas vezes; a
 * manutencao fica como estava. E os check-outs entram (12, livres).
 */
function migrarCarga815_() {
  let mexeu = false;
  const emUso = listar('CARGA_EQUIPAMENTOS').filter(function (r) { return CG_EQUIP_CONSUMO[String(r.TIPO)] && String(r.ESTADO) === 'USO'; });
  if (emUso.length) {
    atualizarVarios('CARGA_EQUIPAMENTOS', emUso.map(function (r) { return { id: r.ID, linha: r._linha, campos: { ESTADO: 'LIVRE', DEPOSITO: '' } }; }), 'migracao');
    mexeu = true;
  }
  if (semearEquipamentosCarga_()) mexeu = true;
  return mexeu;
}

/* Dentro da trava: grava as linhas do tipo que so existiam no padrao (banco sem a semente). */
function cgMaterializar_(tipo, quem) {
  if (listar('CARGA_EQUIPAMENTOS').some(function (r) { return String(r.TIPO) === tipo; })) return;
  const novas = [];
  for (let i = 1; i <= CG_EQUIP_PADRAO[tipo]; i++) novas.push({ TIPO: tipo, DEPOSITO: CG_EQUIP_DONO[tipo] || '', NUMERO: String(i), ESTADO: 'LIVRE' });
  inserirVarios('CARGA_EQUIPAMENTOS', novas, quem);
  esquecerLeituras();
}

/* ------------------------------------------------------------------ */
/* GERACAO (a tela pergunta de tempos em tempos)                        */
/* ------------------------------------------------------------------ */

const CG_TABELAS_VIVAS = ['CARGA_SNAPSHOTS', 'CARGA_EQUIPE', 'CARGA_EQUIPAMENTOS', 'CARGA_SEQUENCIA', 'CARGA_PRESENCA', 'CARGA_PASSAGEM',
  'CARGA_BOXES', 'CARGA_CARREGAMENTO'];
function cgGeracao_() {
  return CG_TABELAS_VIVAS.map(function (t) { return geracaoTabela(t); }).join('.');
}

function acaoGeracaoCarga(usuario) {
  return { ok: true, g: cgGeracao_() };
}

/* ------------------------------------------------------------------ */
/* TELA                                                                */
/* ------------------------------------------------------------------ */

function dadosCarga(usuario, params) {
  const snaps = cgSnapshots_();
  const ultimo = snaps[0] || null;
  const equipe = cgEquipe_();
  const contagem = cgContagemEquipe_(equipe);
  const quadro = cgPessoasDoQuadro_();
  const agora = cgAgoraIso_();
  const turnos = cgTurnos_();
  const base = {
    g: cgGeracao_(),
    podeEditar: podeEditar(usuario, 'carga'),
    depositos: CG_DEPOSITOS.map(function (d) { return { id: d.id, nome: d.nome, equip: d.equip, andares: d.andares || 0 }; }),
    andares: CG_ANDARES,
    filial: filialAtual().nome,
    pessoas: quadro.pessoas,
    avisoQuadro: quadro.aviso,
    fonteQuadro: quadro.fonte || '',
    equipe: equipe,
    equipamentos: cgEquipamentos_(),
    agora: agora,
    snapshot: null,
    historico: [],
    // fase 2 (8.15)
    turnos: turnos,
    turnoAgora: cgTurnosNoHorario_(turnos, cgMinDoDia_(agora)),
    faltas: cgFaltas_(turnos, agora, true),
    flowrack: { ruas: cgRuasFlowrack_() },
    envios: cgListaEnvios_(snaps),
    passagens: cgPassagens_(),
    sequencia: null,
    patio: null,
    voce: { email: usuario.email, nome: String(usuario.nome || usuario.email || '') }
  };
  if (!ultimo) { base.sequencia = cgSequenciaDaTela_([]); base.patio = cgPatioDaTela_([]); return base; }

  const depositos = cgJson_(ultimo.DEPOSITOS, null) || CG_DEPOSITOS.map(function (d) { return { id: d.id, nome: d.nome }; });
  const cargas = cgCargasDe_(ultimo);
  const resumo = cgJson_(ultimo.RESUMO, {}) || {};
  const minUlt = cgMin_(ultimo.EMITIDO_EM);

  // Historico: as ultimas 36 horas de envios (a linha do tempo e o ritmo)
  const recentes = snaps.filter(function (s) { return minUlt - cgMin_(s.EMITIDO_EM) <= CG_HISTORICO_H * 60; }).slice(0, 60);
  base.historico = recentes.map(function (s) {
    const r = cgJson_(s.RESUMO, {}) || {};
    const t = cgTotais_(r);
    return { id: s.ID, emitido: cgIso_(s.EMITIDO_EM), enviado: String(s.ENVIADO_EM || ''), por: String(s.ENVIADO_NOME || s.ENVIADO_POR || ''),
      total: r.total || 0, prontas: r.prontas || 0, h24Pend: r.h24Pend || 0, pctSep: t.pctSep, pctConf: t.pctConf, restSep: t.restSep, restConf: t.restConf,
      arquivo: String(s.ARQUIVO || '') };
  });

  base.snapshot = {
    id: ultimo.ID, emitido: cgIso_(ultimo.EMITIDO_EM), enviado: String(ultimo.ENVIADO_EM || ''),
    por: String(ultimo.ENVIADO_NOME || ultimo.ENVIADO_POR || ''), arquivo: String(ultimo.ARQUIVO || ''),
    paginas: Number(ultimo.PAGINAS || 0), naoLidas: Number(ultimo.NAO_LIDAS || 0),
    depositos: depositos, cargas: cargas, resumo: resumo
  };
  base.indicadores = cgIndicadores_(recentes, cargas, depositos, resumo, contagem);
  base.indicadores.equilibrio = cgEquilibrio_(cargas, depositos, contagem, cgLimitesEquilibrio_());
  base.sequencia = cgSequenciaDaTela_(cargas);
  base.patio = cgPatioDaTela_(cargas);
  return base;
}

/* Totais do CD num resumo (para a linha do tempo). */
function cgTotais_(r) {
  let sf = 0, st = 0, cf = 0, ct = 0, rs = 0, rc = 0;
  Object.keys((r && r.dep) || {}).forEach(function (k) {
    const d = r.dep[k];
    sf += d.sepFeitas || 0; st += d.sepTotal || 0; cf += d.confFeitas || 0; ct += d.confTotal || 0;
    rs += d.restSep || 0; rc += d.restConf || 0;
  });
  return { pctSep: st ? Math.round(sf / st * 1000) / 10 : 100, pctConf: ct ? Math.round(cf / ct * 1000) / 10 : 100, restSep: rs, restConf: rc };
}

/*
 * INDICADORES por deposito (ver tambem cgResumo_):
 *   pctSep / pctConf   tarefas feitas / tarefas totais
 *   ritmoSep / Conf    tarefas por hora: soma do "feitas desde o envio anterior" dos envios das ultimas 3 h
 *                      (intervalos de mais de 4 h ficam de fora) / soma das horas desses intervalos
 *   porPessoaSep/Conf  ritmo / media de pessoas alocadas no deposito nesses envios (a alocacao fica gravada em cada envio)
 *   etaMin             minutos para zerar o deposito no ritmo atual: o maior entre restSep/ritmoSep e restConf/ritmoConf
 *   paradas            cargas por terminar, da mais parada para a menos (minutos sem mudar a celula)
 */
function cgIndicadores_(recentes, cargas, depositos, resumo, contagem) {
  const minUlt = recentes.length ? cgMin_(recentes[0].EMITIDO_EM) : 0;
  const janela = recentes.filter(function (s) { return minUlt - cgMin_(s.EMITIDO_EM) <= CG_JANELA_RITMO_H * 60; })
    .map(function (s) { return cgJson_(s.RESUMO, {}) || {}; })
    .filter(function (r) { return r.desde && r.desde.horas > 0 && r.desde.horas <= CG_INTERVALO_MAX_H; });
  const porDep = {};
  depositos.forEach(function (d) {
    const r = (resumo.dep && resumo.dep[d.id]) || {};
    let horas = 0, sep = 0, conf = 0, cargasFeitas = 0, pesSep = 0, pesConf = 0;
    janela.forEach(function (x) {
      const ds = x.desde.dep && x.desde.dep[d.id];
      if (!ds) return;
      horas += x.desde.horas; sep += ds.sep || 0; conf += ds.conf || 0; cargasFeitas += ds.cargas || 0;
      const eq = x.equipe && x.equipe[d.id];
      if (eq) { pesSep += (eq.sep || 0) * x.desde.horas; pesConf += (eq.conf || 0) * x.desde.horas; }
    });
    const ritmoSep = horas ? sep / horas : null, ritmoConf = horas ? conf / horas : null;
    const mediaSep = horas ? pesSep / horas : 0, mediaConf = horas ? pesConf / horas : 0;
    const eta = function (rest, ritmo) { return rest <= 0 ? 0 : (ritmo ? rest / ritmo * 60 : null); };
    const etaSep = eta(r.restSep || 0, ritmoSep), etaConf = eta(r.restConf || 0, ritmoConf);
    const paradas = cargas.filter(function (c) {
      const par = c.s[d.id] || ['', ''];
      if (par[0] === '-' && par[1] === '-') return false;
      if (!par[0] && !par[1]) return false;
      return !(cgCompletaOuNada_(par[0]) && cgCompletaOuNada_(par[1]));
    }).map(function (c) {
      return { n: c.n, nm: c.nm, h: c.h, s: c.s[d.id], parada: Math.max(0, minUlt - ((c.um && c.um[d.id]) || minUlt)),
        fila: Math.max(0, minUlt - (c.pv || minUlt)) };
    }).sort(function (a, b) { return (b.h - a.h) || (b.parada - a.parada) || (b.fila - a.fila); }).slice(0, 12);
    porDep[d.id] = {
      pctSep: r.sepTotal ? Math.round(r.sepFeitas / r.sepTotal * 1000) / 10 : (r.cargas ? 0 : 100),
      pctConf: r.confTotal ? Math.round(r.confFeitas / r.confTotal * 1000) / 10 : (r.cargas ? 0 : 100),
      horasRitmo: Math.round(horas * 100) / 100,
      ritmoSep: ritmoSep == null ? null : Math.round(ritmoSep * 10) / 10,
      ritmoConf: ritmoConf == null ? null : Math.round(ritmoConf * 10) / 10,
      cargasHora: horas ? Math.round(cargasFeitas / horas * 10) / 10 : null,
      porPessoaSep: mediaSep && ritmoSep ? Math.round(ritmoSep / mediaSep * 10) / 10 : null,
      porPessoaConf: mediaConf && ritmoConf ? Math.round(ritmoConf / mediaConf * 10) / 10 : null,
      etaMin: etaSep == null || etaConf == null ? (r.restSep || r.restConf ? null : 0) : Math.round(Math.max(etaSep, etaConf)),
      etaSepMin: etaSep == null ? null : Math.round(etaSep), etaConfMin: etaConf == null ? null : Math.round(etaConf),
      paradas: paradas,
      maisParadaMin: paradas.length ? Math.max.apply(null, paradas.map(function (p) { return p.parada; })) : 0
    };
  });
  return { porDep: porDep, envios: recentes.length, janelaH: CG_JANELA_RITMO_H };
}

/* ------------------------------------------------------------------ */
/* EQUILIBRIO ENTRE DEPOSITOS                                          */
/* ------------------------------------------------------------------ */

function cgLimitesEquilibrio_() {
  const n = function (chave, padrao) { const v = Number(String(parametro(chave, '') || '').replace(',', '.')); return v > 0 && v < 100 ? v : padrao; };
  const eq = n('CARGA_EQUILIBRIO_PP', CG_EQUILIBRIO_PADRAO.equilibrado);
  return { equilibrado: eq, atencao: Math.max(eq, n('CARGA_ATENCAO_PP', CG_EQUILIBRIO_PADRAO.atencao)), peso24h: n('CARGA_PESO_24H', CG_EQUILIBRIO_PADRAO.peso24h) };
}

/*
 * % CONCLUIDO de um deposito, ponderado: (tarefas de SEP + CONF feitas) / (tarefas totais), e cada tarefa
 * de carga de 24 horas pesa `peso24h` (2 = vale o dobro). A celula X conta o tamanho conhecido da carga
 * (o maior b ja visto); sem tamanho, a media de tarefas por celula do deposito.
 */
function cgPctPonderado_(cargas, idDep, peso24h) {
  let somaB = 0, nB = 0;
  cargas.forEach(function (c) { ((c.s && c.s[idDep]) || []).forEach(function (v) { const p = cgPartes_(v); if (p.b) { somaB += p.b; nB++; } }); });
  const media = nB ? somaB / nB : 1;
  let feitas = 0, total = 0, rest = 0;
  cargas.forEach(function (c) {
    const w = c.h ? peso24h : 1;
    ((c.s && c.s[idDep]) || []).forEach(function (v) {
      const p = cgPartes_(v);
      if (p.nada || p.vazia) return;
      if (p.x) { const t = (c.tb && c.tb[idDep]) || media; feitas += t * w; total += t * w; return; }
      feitas += p.a * w; total += p.b * w; rest += p.b - p.a;
    });
  });
  return { pct: total ? feitas / total * 100 : null, restante: rest };
}

/*
 * EQUILIBRIO: os depositos tem que andar juntos (a carga so sai quando todos terminam).
 *   pct por deposito (ponderado), media do grupo, spread = maior - menor (pontos percentuais);
 *   status: Equilibrado (spread <= equilibrado), Atencao (<= atencao), Desequilibrado (acima);
 *   atrasado / adiantado: o menor e o maior pct;
 *   sugestao: mover N pessoas do deposito com menos tarefas por pessoa para o atrasado — N e o que
 *   deixa as tarefas por pessoa dos dois mais perto (separador se o atrasado tem mais separacao por
 *   fazer, conferente se tem mais conferencia).
 * Grupos: o CD inteiro (os seis) e a supervisao Grandeza · Nobre Grandeza · Pesaveis · Blocado.
 * Cargas desequilibradas: um deposito da carga pronto e outro com 50 pontos ou mais de atraso.
 */
function cgEquilibrio_(cargas, depositos, contagem, limites) {
  const porDep = {};
  depositos.forEach(function (d) {
    const r = cgPctPonderado_(cargas, d.id, limites.peso24h);
    const sepRest = cargas.reduce(function (t, c) { const p = cgPartes_(((c.s || {})[d.id] || [])[0]); return t + (p.b ? p.b - p.a : 0); }, 0);
    const eq = contagem[d.id] || { sep: 0, conf: 0 };
    porDep[d.id] = { pct: r.pct == null ? null : Math.round(r.pct * 10) / 10, restante: r.restante, restSep: sepRest, restConf: r.restante - sepRest,
      sep: eq.sep, conf: eq.conf };
  });
  const grupo = function (ids, nome) {
    const comTrabalho = ids.filter(function (id) { return porDep[id] && porDep[id].pct != null; });
    const saida = { nome: nome, ids: ids, deps: comTrabalho };
    if (comTrabalho.length < 2) { saida.status = 'sem'; saida.texto = 'Só um depósito com trabalho'; return saida; }
    const pcts = comTrabalho.map(function (id) { return porDep[id].pct; });
    const max = Math.max.apply(null, pcts), min = Math.min.apply(null, pcts);
    saida.media = Math.round(pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length * 10) / 10;
    saida.spread = Math.round((max - min) * 10) / 10;
    saida.status = saida.spread <= limites.equilibrado ? 'equilibrado' : (saida.spread <= limites.atencao ? 'atencao' : 'desequilibrado');
    saida.texto = { equilibrado: 'Equilibrado', atencao: 'Atenção', desequilibrado: 'Desequilibrado' }[saida.status];
    saida.atrasado = comTrabalho.filter(function (id) { return porDep[id].pct === min; })[0];
    saida.adiantado = comTrabalho.filter(function (id) { return porDep[id].pct === max; })[0];
    saida.desvios = {};
    comTrabalho.forEach(function (id) { saida.desvios[id] = Math.round((porDep[id].pct - saida.media) * 10) / 10; });
    if (saida.status !== 'equilibrado') saida.sugestao = cgSugestao_(porDep, comTrabalho, saida.atrasado);
    return saida;
  };
  const cargasDes = [];
  cargas.forEach(function (c) {
    const pcts = [];
    Object.keys(c.s || {}).forEach(function (id) {
      let f = 0, t = 0;
      (c.s[id] || []).forEach(function (v) {
        const p = cgPartes_(v);
        if (p.nada || p.vazia) return;
        if (p.x) { f += 1; t += 1; return; }
        f += p.a / p.b; t += 1;
      });
      if (t) pcts.push({ dep: id, pct: Math.round(f / t * 1000) / 10 });
    });
    if (pcts.length < 2) return;
    const prontos = pcts.filter(function (x) { return x.pct >= 100; });
    const atrasados = pcts.filter(function (x) { return x.pct <= 50; });
    if (!prontos.length || !atrasados.length) return;
    cargasDes.push({ n: c.n, nm: c.nm, h: c.h, prontos: prontos.map(function (x) { return x.dep; }),
      atrasados: atrasados.sort(function (a, b) { return a.pct - b.pct; }), gap: 100 - atrasados[0].pct });
  });
  cargasDes.sort(function (a, b) { return (b.h - a.h) || (b.gap - a.gap) || String(a.n).localeCompare(String(b.n)); });
  return {
    limites: limites, porDep: porDep,
    cd: grupo(depositos.map(function (d) { return d.id; }), 'CD'),
    supervisao: grupo(CG_GRUPO_SUPERVISAO.filter(function (id) { return depositos.some(function (d) { return d.id === id; }); }), 'Grandeza · Nobre Grandeza · Pesáveis · Blocado'),
    cargas: cargasDes.slice(0, 30), totalCargas: cargasDes.length
  };
}

/* Quem mover para o deposito atrasado: do que tem menos tarefas por pessoa, o N que mais aproxima os dois. */
function cgSugestao_(porDep, ids, atrasado) {
  const alvo = porDep[atrasado];
  const papel = alvo.restSep >= alvo.restConf ? 'SEPARADOR' : 'CONFERENTE';
  const chave = papel === 'SEPARADOR' ? 'sep' : 'conf';
  const restKey = papel === 'SEPARADOR' ? 'restSep' : 'restConf';
  const carga = function (rest, pessoas) { return pessoas > 0 ? rest / pessoas : (rest > 0 ? Infinity : 0); };
  let melhor = null;
  ids.forEach(function (id) {
    if (id === atrasado) return;
    const d = porDep[id];
    if (d[chave] < 2 && !(d[chave] >= 1 && d[restKey] === 0)) return;      // nao deixa um deposito com trabalho sem ninguem
    const maxN = d[restKey] === 0 ? d[chave] : d[chave] - 1;
    for (let n = 1; n <= maxN; n++) {
      const depois = Math.abs(carga(alvo[restKey], alvo[chave] + n) - carga(d[restKey], d[chave] - n));
      const antes = Math.abs(carga(alvo[restKey], alvo[chave]) - carga(d[restKey], d[chave]));
      if (!(depois < antes)) continue;
      if (!melhor || depois < melhor.dif) melhor = { de: id, n: n, dif: depois };
    }
  });
  if (!melhor) {
    if (!alvo[chave] && alvo[restKey] > 0) return { tipo: 'alocar', papel: papel, para: atrasado, n: 1,
      texto: 'Aloque ' + (papel === 'SEPARADOR' ? 'separadores' : 'conferentes') + ' em ' + cgNomeDep_(atrasado) + ': ' + alvo[restKey] + ' tarefas e ninguém lá.' };
    return null;
  }
  const nomePapel = papel === 'SEPARADOR' ? (melhor.n === 1 ? 'separador' : 'separadores') : (melhor.n === 1 ? 'conferente' : 'conferentes');
  return { tipo: 'mover', papel: papel, de: melhor.de, para: atrasado, n: melhor.n,
    texto: 'Mover ' + melhor.n + ' ' + nomePapel + ' de ' + cgNomeDep_(melhor.de) + ' → ' + cgNomeDep_(atrasado) };
}

/* ------------------------------------------------------------------ */
/* ACOES                                                               */
/* ------------------------------------------------------------------ */

/*
 * ENVIAR A SITUACAO. params: { emitidoEm, arquivo, paginas, depositos, cargas, naoLidas }.
 * Recusa: relatorio mais velho que o ultimo, o mesmo relatorio (mesma emissao ou mesmo conteudo),
 * data de emissao no futuro.
 */
function acaoEnviarSituacaoCarga(usuario, params) {
  const p = params || {};
  const emitido = cgIso_(p.emitidoEm);
  if (!emitido) throw new Error('Falta a data e a hora de emissão do relatório (o que vem embaixo do título, como 25/11/2026 08:05:37).');
  const agora = cgAgoraIso_();
  if (cgMin_(emitido) - cgMin_(agora) > 15) throw new Error('A emissão (' + cgBr_(emitido) + ') está no futuro. Confira a data e a hora do relatório.');
  const depositos = cgDepositosDoEnvio_(p.depositos);
  const lidas = cgCargasDoEnvio_(p.cargas, depositos);
  const cargas = lidas.cargas;
  const assinatura = cgAssinatura_(emitido, cargas);
  const quem = usuario.email;

  const salvo = comTrava(function () {
    const snaps = cgSnapshots_();
    const ultimo = snaps[0] || null;
    const mesma = snaps.filter(function (s) { return cgIso_(s.EMITIDO_EM) === emitido || String(s.ASSINATURA || '') === assinatura; })[0];
    if (mesma) {
      throw new Error('Esta situação de carga (emitida em ' + cgBr_(emitido) + ') já foi enviada' +
        (mesma.ENVIADO_NOME ? ' por ' + mesma.ENVIADO_NOME : '') + (mesma.ENVIADO_EM ? ' em ' + cgBr_(mesma.ENVIADO_EM) : '') + '.');
    }
    if (ultimo && cgMin_(emitido) < cgMin_(ultimo.EMITIDO_EM)) {
      throw new Error('Esta situação foi emitida em ' + cgBr_(emitido) + ', antes da mais recente do GSL (' + cgBr_(ultimo.EMITIDO_EM) +
        (ultimo.ENVIADO_NOME ? ', enviada por ' + ultimo.ENVIADO_NOME : '') + '). Envie um PDF mais novo.');
    }
    const anteriores = ultimo ? cgCargasDe_(ultimo) : [];
    const acomp = cgAcompanhar_(cargas, anteriores, depositos, cgMin_(emitido), ultimo ? cgMin_(ultimo.EMITIDO_EM) : 0);
    const resumo = cgResumo_(cargas, depositos);
    const contagem = cgContagemEquipe_(cgEquipe_());
    resumo.equipe = {};
    Object.keys(contagem).forEach(function (k) { resumo.equipe[k] = { sep: contagem[k].sep, conf: contagem[k].conf }; });
    resumo.desde = { horas: Math.round(acomp.horas * 1000) / 1000, dep: acomp.desde };
    const json = JSON.stringify(cargas);
    const campos = {
      EMITIDO_EM: emitido, ENVIADO_EM: agora, ENVIADO_POR: quem, ENVIADO_NOME: cgTexto_(usuario.nome || quem, 80),
      ARQUIVO: cgTexto_(p.arquivo, 120), PAGINAS: String(Math.max(0, Math.min(99, Number(p.paginas) || 0))),
      TOTAL_CARGAS: String(cargas.length), NAO_LIDAS: String(Math.max(0, Number(p.naoLidas) || 0) + lidas.recusadas.length),
      ASSINATURA: assinatura, DEPOSITOS: JSON.stringify(depositos), RESUMO: JSON.stringify(resumo),
      CARGAS: json.slice(0, CG_CELULA_MAX), CARGAS_2: json.slice(CG_CELULA_MAX, 2 * CG_CELULA_MAX), CARGAS_3: json.slice(2 * CG_CELULA_MAX, 3 * CG_CELULA_MAX)
    };
    if (json.length > 3 * CG_CELULA_MAX) {
      // Muito grande ate para tres celulas: as cargas vao para um arquivo no Drive (o resumo fica na planilha).
      const arq = pastaDoRegistro('CARGA_SNAPSHOTS', 'envios').createFile(Utilities.newBlob(json, 'application/json', 'situacao-' + emitido.replace(/[^\d]/g, '') + '.json'));
      campos.CARGAS = 'DRIVE:' + arq.getId(); campos.CARGAS_2 = ''; campos.CARGAS_3 = '';
    }
    const id = inserir('CARGA_SNAPSHOTS', campos, quem);
    cgArquivarAntigos_(snaps, quem);
    cgMesclarSequencia_(cargas, emitido, quem);
    return { id: id, resumo: resumo };
  });
  const r = salvo.resumo;
  let recado = 'Situação de ' + cgBr_(emitido) + ' salva: ' + cargas.length + (cargas.length === 1 ? ' carga' : ' cargas') +
    (r.h24Pend ? ', ' + r.h24Pend + ' de 24 horas por terminar' : '') + '.';
  if (lidas.recusadas.length) recado += ' ' + lidas.recusadas.length + ' linha(s) ficaram de fora.';
  return { ok: true, id: salvo.id, recado: recado, g: cgGeracao_() };
}

/* Os envios mais antigos passam as cargas para o Drive: a planilha fica leve (o resumo continua nela). */
function cgArquivarAntigos_(snaps, quem) {
  const velhos = snaps.slice(CG_SNAPSHOTS_NA_PLANILHA - 1).filter(function (s) {
    const c = String(s.CARGAS || '');
    return c && c.indexOf('DRIVE:') !== 0;
  }).slice(0, 3);                                     // no maximo 3 por envio: o envio nao fica lento
  if (!velhos.length) return;
  const mudancas = [];
  velhos.forEach(function (s) {
    try {
      const json = String(s.CARGAS || '') + String(s.CARGAS_2 || '') + String(s.CARGAS_3 || '');
      const arq = pastaDoRegistro('CARGA_SNAPSHOTS', 'envios').createFile(
        Utilities.newBlob(json, 'application/json', 'situacao-' + String(s.EMITIDO_EM || '').replace(/[^\d]/g, '') + '.json'));
      mudancas.push({ id: s.ID, linha: s._linha, campos: { CARGAS: 'DRIVE:' + arq.getId(), CARGAS_2: '', CARGAS_3: '' } });
    } catch (e) { /* sem o Drive, as cargas ficam na planilha */ }
  });
  if (mudancas.length) atualizarVarios('CARGA_SNAPSHOTS', mudancas, quem);
}

/* DESFAZER O ULTIMO ENVIO (PDF errado). So o mais recente sai; o anterior volta a ser o atual. */
function acaoExcluirSituacaoCarga(usuario, params) {
  const id = String((params && params.id) || '');
  comTrava(function () {
    const ultimo = cgSnapshots_()[0];
    if (!ultimo || String(ultimo.ID) !== id) throw new Error('Só dá para desfazer o envio mais recente. Atualize a tela e confira.');
    excluir('CARGA_SNAPSHOTS', id, usuario.email);
  });
  return { ok: true, recado: 'Envio desfeito. A situação anterior voltou a valer.', g: cgGeracao_() };
}

/*
 * MOVER UMA PESSOA. params: { pessoa: { k, nome, funcao, equipe }, destino: { dep, papel, andar } | null }.
 * Sem destino = de volta aos disponiveis. Uma linha viva por pessoa: mover troca o lugar dela.
 */
function acaoMoverPessoaCarga(usuario, params) {
  const p = params || {};
  const pessoa = p.pessoa || {};
  const k = String(pessoa.k || '');
  if (!/^[CRN][\w#-]{1,80}$/.test(k)) throw new Error('Pessoa inválida.');
  const nome = cgTexto_(pessoa.nome, 80);
  if (!nome) throw new Error('Pessoa sem nome.');
  let destino = null;
  if (p.destino && p.destino.dep) {
    const d = CG_DEPOSITOS.filter(function (x) { return x.id === String(p.destino.dep); })[0];
    if (!d) throw new Error('Depósito desconhecido: ' + cgTexto_(p.destino.dep, 30) + '.');
    const papel = String(p.destino.papel || '').toUpperCase();
    if (CG_PAPEIS.indexOf(papel) === -1) throw new Error('Escolha separador ou conferente.');
    let andar = '', rua = '';
    if (d.andares && papel === 'SEPARADOR') {
      andar = Number(p.destino.andar);
      if (!(andar >= 0 && andar < d.andares && Math.floor(andar) === andar)) throw new Error('Escolha o andar do flowrack (térreo ao 4º).');
      const r = Number(p.destino.rua || 0);
      const ruas = cgRuasFlowrack_()[andar] || 0;
      if (r) {
        if (!(r >= 1 && r <= ruas && Math.floor(r) === r)) throw new Error('O ' + CG_ANDARES[andar] + ' tem ' + ruas + ' ruas: escolha de 1 a ' + ruas + '.');
        rua = String(r);
      }
    }
    destino = { dep: d.id, papel: papel, andar: andar === '' ? '' : String(andar), rua: rua };
  }
  const quem = usuario.email;
  comTrava(function () {
    if (destino) {
      const falta = cgFaltaDe_(k, cgTurnos_(), cgAgoraIso_());
      if (falta) throw new Error(cgTitulo_(nome) + ' está marcado como falta neste turno (por ' + (falta.porNome || falta.por || 'alguém') + '). Desfaça a falta para alocar.');
    }
    const vivas = listar('CARGA_EQUIPE').filter(function (r) { return String(r.PESSOA) === k; });
    // Linha repetida (duas gravacoes da versao anterior, ou planilha mexida a mao): fica uma so.
    vivas.slice(destino ? 1 : 0).forEach(function (r) { excluir('CARGA_EQUIPE', r.ID, quem); });
    if (!destino) return;
    const campos = { PESSOA: k, NOME: nome, FUNCAO: cgTexto_(pessoa.funcao, 60), EQUIPE: cgTexto_(pessoa.equipe, 30),
      DEPOSITO: destino.dep, PAPEL: destino.papel, ANDAR: destino.andar, RUA: destino.rua, DESDE: cgAgoraIso_() };
    if (vivas.length) {
      const atual = vivas[0];
      if (String(atual.DEPOSITO) === destino.dep && String(atual.PAPEL) === destino.papel && String(atual.ANDAR) === destino.andar &&
        String(atual.RUA || '') === destino.rua) return;
      // Trocar so a rua (ou o andar) dentro do mesmo deposito e papel nao muda o DESDE: a paleteira continua com ela.
      if (String(atual.DEPOSITO) === destino.dep && String(atual.PAPEL) === destino.papel && atual.DESDE) campos.DESDE = String(atual.DESDE);
      atualizar('CARGA_EQUIPE', atual.ID, campos, quem);
    } else {
      inserir('CARGA_EQUIPE', campos, quem);
    }
  });
  esquecerLeituras();
  return { ok: true, equipe: cgEquipe_(), g: cgGeracao_() };
}

/* LIMPAR A ALOCACAO (troca de turno). params: { equipe } — so as pessoas daquele turno; vazio = todo mundo. */
function acaoLimparAlocacaoCarga(usuario, params) {
  const so = cgTexto_(params && params.equipe, 30);
  let n = 0;
  comTrava(function () {
    const alvo = listar('CARGA_EQUIPE').filter(function (r) { return !so || String(r.EQUIPE || '') === so; });
    n = alvo.length;
    if (n) atualizarVarios('CARGA_EQUIPE', alvo.map(function (r) { return { id: r.ID, linha: r._linha, campos: { EXCLUIDO: 'SIM' } }; }), usuario.email);
  });
  esquecerLeituras();
  return { ok: true, recado: n ? n + (n === 1 ? ' pessoa voltou' : ' pessoas voltaram') + ' para os disponíveis.' : 'Ninguém estava alocado' + (so ? ' no ' + so : '') + '.',
    equipe: cgEquipe_(), g: cgGeracao_() };
}

/*
 * PALETEIRA, CHECK-OUT OU CARRINHO: o estado de um. params: { tipo, numero, estado, obs }.
 *   paleteira e check-out (8.15): LIVRE (funcionando) · MANUTENCAO. O "em uso" vem dos separadores
 *              (paleteira) e dos conferentes (check-out) alocados: nao se marca a mao.
 *   carrinho:  LIVRE · USO · MANUTENCAO (sempre da Miudeza).
 */
function acaoEquipamentoCarga(usuario, params) {
  const p = params || {};
  const tipo = String(p.tipo || '').toUpperCase();
  if (!CG_EQUIP_PADRAO[tipo]) throw new Error('Equipamento desconhecido.');
  const estado = String(p.estado || '').toUpperCase();
  if (CG_ESTADOS_EQUIP.indexOf(estado) === -1) throw new Error('Estado inválido.');
  if (CG_EQUIP_CONSUMO[tipo] && estado === 'USO') {
    throw new Error(tipo === 'PALETEIRA' ? 'A paleteira entra em uso sozinha: cada separador alocado na Grandeza, Nobre Grandeza, Pesáveis ou Blocado usa uma. Aqui só se marca manutenção.'
      : 'O check-out entra em uso sozinho: cada conferente alocado usa um. Aqui só se marca manutenção.');
  }
  const dep = CG_EQUIP_DONO[tipo] || '';
  const obs = estado === 'MANUTENCAO' ? cgTexto_(p.obs, 120) : '';
  const nome = CG_EQUIP_NOME[tipo][0];
  let numero = p.numero === '' || p.numero == null ? 0 : Number(p.numero);
  comTrava(function () {
    cgMaterializar_(tipo, usuario.email);
    const todas = listar('CARGA_EQUIPAMENTOS').filter(function (r) { return String(r.TIPO) === tipo && Number(r.NUMERO) >= 1; });
    if (!numero) throw new Error('Diga qual ' + CG_EQUIP_NOME[tipo][1] + '.');
    const linha = todas.filter(function (r) { return Number(r.NUMERO) === numero; })[0];
    if (!linha) throw new Error(nome + ' ' + numero + ' não existe.');
    atualizar('CARGA_EQUIPAMENTOS', linha.ID, { ESTADO: estado, DEPOSITO: dep, OBSERVACAO: obs }, usuario.email);
  });
  esquecerLeituras();
  const onde = estado === 'USO' ? 'em uso' : (estado === 'LIVRE' ? (CG_EQUIP_CONSUMO[tipo] ? 'funcionando (no pool do CD)' : 'livre') : 'em manutenção');
  return { ok: true, equipamentos: cgEquipamentos_(), g: cgGeracao_(), recado: nome + ' ' + numero + ': ' + onde + '.' };
}
function cgNomeDep_(id) { const d = CG_DEPOSITOS.filter(function (x) { return x.id === id; })[0]; return d ? d.nome : id; }

/* QUANTIDADE de paleteiras (o pool do CD) ou de carrinhos (Miudeza). params: { tipo, quantidade } */
function acaoQuantidadeEquipamentoCarga(usuario, params) {
  const p = params || {};
  const tipo = String(p.tipo || '').toUpperCase();
  if (!CG_EQUIP_PADRAO[tipo]) throw new Error('Equipamento desconhecido.');
  const qtd = Number(p.quantidade);
  if (!(qtd >= 0 && qtd <= CG_MAX_EQUIP && Math.floor(qtd) === qtd)) throw new Error('Quantidade de 0 a ' + CG_MAX_EQUIP + '.');
  comTrava(function () {
    cgMaterializar_(tipo, usuario.email);
    const minhas = listar('CARGA_EQUIPAMENTOS').filter(function (r) { return String(r.TIPO) === tipo; });
    const zero = minhas.filter(function (r) { return Number(r.NUMERO) < 1; });
    const numeradas = minhas.filter(function (r) { return Number(r.NUMERO) >= 1; });
    const existe = {};
    numeradas.forEach(function (r) { existe[Number(r.NUMERO)] = r; });
    const novas = [];
    for (let i = 1; i <= qtd; i++) if (!existe[i]) novas.push({ TIPO: tipo, DEPOSITO: CG_EQUIP_DONO[tipo] || '', NUMERO: String(i), ESTADO: 'LIVRE' });
    if (!qtd && !zero.length) novas.push({ TIPO: tipo, DEPOSITO: CG_EQUIP_DONO[tipo] || '', NUMERO: '0', ESTADO: 'LIVRE' });
    const sobra = numeradas.filter(function (r) { return Number(r.NUMERO) > qtd; }).concat(qtd ? zero : [])
      .map(function (r) { return { id: r.ID, linha: r._linha, campos: { EXCLUIDO: 'SIM' } }; });
    if (sobra.length) atualizarVarios('CARGA_EQUIPAMENTOS', sobra, usuario.email);
    if (novas.length) inserirVarios('CARGA_EQUIPAMENTOS', novas, usuario.email);
  });
  esquecerLeituras();
  const nome = (qtd === 1 ? CG_EQUIP_NOME[tipo][1] : CG_EQUIP_NOME[tipo][2]) + (tipo === 'CARRINHO' ? ' na Miudeza' : ' no CD');
  return { ok: true, equipamentos: cgEquipamentos_(), g: cgGeracao_(), recado: qtd + ' ' + nome + '.' };
}

/* ================================================================== */
/* FASE 2 (8.15)                                                       */
/* ================================================================== */

function cgTitulo_(t) { return String(t || '').toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }
function cgNorm_(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function cgMinDoDia_(iso) { const m = /T(\d{2}):(\d{2})/.exec(String(iso || '')); return m ? +m[1] * 60 + +m[2] : 0; }
function cgDiaMais_(dia, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dia || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function cgInteiro_(v, min, max, padrao) { const n = Number(String(v == null ? '' : v).trim()); return String(v == null ? '' : v).trim() !== '' && Math.floor(n) === n && n >= min && n <= max ? n : padrao; }

/* Grava um parametro da filial (o mesmo que a Configuracao grava) sem pedir a tela Configuracao: so os da carga. */
function cgSalvarParametro_(chave, valor, quem) {
  const linha = listar('PARAMETROS').filter(function (p) { return String(p.CHAVE).toUpperCase().trim() === chave; })[0];
  if (linha) { if (String(linha.VALOR) !== String(valor)) atualizar('PARAMETROS', linha.ID, { VALOR: valor }, quem); }
  else {
    const desc = (typeof PARAMETROS_NOVOS !== 'undefined' ? PARAMETROS_NOVOS : []).filter(function (p) { return p[0] === chave; }).map(function (p) { return p[1]; })[0] || '';
    inserir('PARAMETROS', { CHAVE: chave, VALOR: valor, DESCRICAO: desc }, quem);
  }
  limparCache('PARAMETROS');
}

/* ------------------------------------------------------------------ */
/* TURNOS PELO HORARIO                                                 */
/* ------------------------------------------------------------------ */

/*
 * Os tres turnos do 5x2 (parametros CARGA_TURNO_A/B/C, editaveis): A 06:50-16:14, B 16:04-01:01 e
 * C 23:00-07:00. B e C passam da meia-noite (cruza). Onde dois se sobrepoem e a passagem de turno.
 * O Quadro do CD diz o turno de cada pessoa: 1° TURNO = A, 2° = B, 3° = C; ADM e outro valor (ex.: um
 * "4° TURNO" escrito a mao) ficam fora do filtro "no turno agora" — aparecem no chip deles e em Todos.
 */
const CG_TURNOS_PADRAO = { A: '06:50-16:14', B: '16:04-01:01', C: '23:00-07:00' };
const CG_TURNO_EQUIPE = { A: '1° TURNO', B: '2° TURNO', C: '3° TURNO' };

/* "06:50-16:14", "6h50 às 16h14", "06:50 a 16:14" -> { ini, fim } em minutos do dia (ou null) */
function cgHorarioTurno_(texto) {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const m = /^(\d{1,2})\s*[:h]\s*(\d{2})\s*(?:-|–|—|a|as|ate)\s*(\d{1,2})\s*[:h]\s*(\d{2})$/.exec(t);
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3], d = +m[4];
  if (a > 23 || c > 23 || b > 59 || d > 59) return null;
  const ini = a * 60 + b, fim = c * 60 + d;
  if (ini === fim) return null;
  return { ini: ini, fim: fim };
}
function cgHoraTexto_(min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
function cgTurnos_() {
  return ['A', 'B', 'C'].map(function (id) {
    const h = cgHorarioTurno_(parametro('CARGA_TURNO_' + id, '')) || cgHorarioTurno_(CG_TURNOS_PADRAO[id]);
    return { id: id, nome: 'Turno ' + id, equipe: CG_TURNO_EQUIPE[id], ini: h.ini, fim: h.fim, cruza: h.fim < h.ini,
      texto: cgHoraTexto_(h.ini) + '–' + cgHoraTexto_(h.fim) };
  });
}
function cgNoTurno_(t, min) { return t.cruza ? (min >= t.ini || min < t.fim) : (min >= t.ini && min < t.fim); }
/* Quem esta em servico num minuto do dia: { ativos: ['A','B'], passagem: { sai, entra } | null } */
function cgTurnosNoHorario_(turnos, min) {
  const ativos = turnos.filter(function (t) { return cgNoTurno_(t, min); });
  const saida = { ativos: ativos.map(function (t) { return t.id; }), passagem: null, min: min };
  if (ativos.length >= 2) {
    const desdeInicio = function (t) { return (min - t.ini + 1440) % 1440; };
    const ateFim = function (t) { return (t.fim - min + 1440) % 1440; };
    const entra = ativos.slice().sort(function (a, b) { return desdeInicio(a) - desdeInicio(b); })[0];
    const sai = ativos.filter(function (t) { return t.id !== entra.id; }).sort(function (a, b) { return ateFim(a) - ateFim(b); })[0];
    saida.passagem = { sai: sai.id, entra: entra.id, ate: cgHoraTexto_(sai.fim) };
  }
  return saida;
}
/* O turno (A, B, C, ADM ou '') de quem o Quadro do CD diz "1° TURNO", "2º TURNO", "TURNO 3", "ADM"... */
function cgTurnoDaEquipe_(equipe) {
  const t = cgNorm_(equipe).replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t) return '';
  if (/^ADM/.test(t)) return 'ADM';
  let m = /^(\d)\s*O?\s*TURNO$/.exec(t) || /^TURNO\s*(\d)$/.exec(t) || /^T\s*(\d)$/.exec(t) || /^(\d)$/.exec(t);
  if (m) return ['', 'A', 'B', 'C'][+m[1]] || '';
  m = /^(?:TURNO\s*|T\s*)?([ABC])$/.exec(t);
  return m ? m[1] : '';
}
/*
 * O DIA DO TURNO (a falta vale ate o fim do turno): o turno que passa da meia-noite e do dia em que
 * comecou. O C as 02:00 de 26/11 e o C de 25/11; o C as 15:00 de 26/11 ja e o de 26/11 (o proximo).
 */
function cgDiaDoTurno_(turnoId, agoraIso, turnos) {
  const dia = String(agoraIso || '').slice(0, 10);
  const t = (turnos || []).filter(function (x) { return x.id === turnoId; })[0];
  if (!t || !t.cruza) return dia;
  return cgMinDoDia_(agoraIso) < t.fim ? cgDiaMais_(dia, -1) : dia;
}

/* ------------------------------------------------------------------ */
/* FALTA DO DIA (CARGA_PRESENCA)                                       */
/* ------------------------------------------------------------------ */

/*
 * As faltas que valem agora. recentes = true: as de ontem e de hoje, cada uma com `ativa` na hora do
 * servidor — e o que a tela leva (a tela guardada no servidor vale o dia todo; quem decide se a falta
 * ainda vale e o relogio da tela, pelo mesmo cgDiaDoTurno).
 */
function cgFaltas_(turnos, agora, recentes) {
  const hoje = String(agora).slice(0, 10), ontem = cgDiaMais_(hoje, -1);
  return listar('CARGA_PRESENCA').filter(function (r) {
    if (String(r.STATUS) !== 'FALTA') return false;
    const ativa = String(r.DATA) === cgDiaDoTurno_(cgTurnoDaEquipe_(r.EQUIPE), agora, turnos);
    return recentes ? (ativa || String(r.DATA) === hoje || String(r.DATA) === ontem) : ativa;
  }).map(function (r) {
    return { id: r.ID, k: String(r.PESSOA), nome: String(r.NOME || ''), equipe: String(r.EQUIPE || ''), turno: cgTurnoDaEquipe_(r.EQUIPE),
      data: String(r.DATA), por: String(r.CRIADO_POR || ''), porNome: String(r.POR_NOME || ''), em: String(r.CRIADO_EM || ''),
      ativa: String(r.DATA) === cgDiaDoTurno_(cgTurnoDaEquipe_(r.EQUIPE), agora, turnos) };
  });
}
function cgFaltaDe_(k, turnos, agora) { return cgFaltas_(turnos, agora).filter(function (f) { return f.k === k; })[0] || null; }

/*
 * FALTOU. params: { pessoa: { k, nome, equipe }, falta: true | false }.
 * Marca (a pessoa sai da alocacao na mesma trava e nao pode ser alocada ate o fim do turno dela) ou
 * desfaz. No dia seguinte (o proximo turno da pessoa) a falta deixa de valer sozinha.
 */
function acaoPresencaCarga(usuario, params) {
  const p = params || {};
  const pessoa = p.pessoa || {};
  const k = String(pessoa.k || '');
  if (!/^[CRN][\w#-]{1,80}$/.test(k)) throw new Error('Pessoa inválida.');
  const nome = cgTexto_(pessoa.nome, 80);
  if (!nome) throw new Error('Pessoa sem nome.');
  const equipe = cgTexto_(pessoa.equipe, 30);
  const marcar = p.falta !== false && p.falta !== 'false';
  const quem = usuario.email;
  let tirou = false;
  comTrava(function () {
    const turnos = cgTurnos_(), agora = cgAgoraIso_();
    const ativas = cgFaltas_(turnos, agora).filter(function (f) { return f.k === k; });
    if (marcar) {
      if (!ativas.length) {
        inserir('CARGA_PRESENCA', { DATA: cgDiaDoTurno_(cgTurnoDaEquipe_(equipe), agora, turnos), PESSOA: k, NOME: nome, EQUIPE: equipe,
          STATUS: 'FALTA', POR_NOME: cgTexto_(usuario.nome || quem, 80) }, quem);
      }
      listar('CARGA_EQUIPE').filter(function (r) { return String(r.PESSOA) === k; }).forEach(function (r) { excluir('CARGA_EQUIPE', r.ID, quem); tirou = true; });
    } else {
      ativas.forEach(function (f) { excluir('CARGA_PRESENCA', f.id, quem); });
    }
  });
  esquecerLeituras();
  const nomeCurto = cgTitulo_(nome);
  return { ok: true, faltas: cgFaltas_(cgTurnos_(), cgAgoraIso_(), true), equipe: cgEquipe_(), g: cgGeracao_(),
    recado: marcar ? nomeCurto + ' marcado como falta' + (tirou ? ' e tirado da alocação' : '') + '.' : 'Falta de ' + nomeCurto + ' desfeita.' };
}

/* ------------------------------------------------------------------ */
/* PALETEIRAS E CHECK-OUTS QUE ACOMPANHAM AS PESSOAS                   */
/* ------------------------------------------------------------------ */

function cgUsaPaleteira_(dep) { return CG_DEPOSITOS.some(function (d) { return d.id === dep && d.equip === 'PALETEIRA'; }); }
/*
 * Por tipo: total, manutencao, disponiveis (total - manutencao), pessoas (separadores dos quatro depositos
 * de paleteira / conferentes de todos), emUso, livres e falta; porDep { pessoas, com, sem }; sem = as
 * pessoas sem equipamento (as que chegaram por ultimo).
 */
function cgConsumoEquip_(equipe, equipamentos) {
  const saida = {};
  Object.keys(CG_EQUIP_CONSUMO).forEach(function (tipo) {
    const papel = CG_EQUIP_CONSUMO[tipo];
    const lista = equipamentos.filter(function (e) { return e.tipo === tipo; });
    const manut = lista.filter(function (e) { return e.estado === 'MANUTENCAO'; }).length;
    const disponiveis = lista.length - manut;
    const pessoas = equipe.filter(function (p) { return p.papel === papel && (tipo !== 'PALETEIRA' || cgUsaPaleteira_(p.dep)); })
      .sort(function (a, b) { return String(a.desde || '9999').localeCompare(String(b.desde || '9999')) || String(a.nome).localeCompare(String(b.nome)); });
    const porDep = {}, sem = [];
    pessoas.forEach(function (p, i) {
      const d = porDep[p.dep] = porDep[p.dep] || { pessoas: 0, com: 0, sem: 0 };
      d.pessoas++;
      if (i < disponiveis) d.com++; else { d.sem++; sem.push(p.k); }
    });
    saida[tipo] = { total: lista.length, manutencao: manut, disponiveis: disponiveis, pessoas: pessoas.length,
      emUso: Math.min(pessoas.length, disponiveis), livres: Math.max(0, disponiveis - pessoas.length),
      falta: Math.max(0, pessoas.length - disponiveis), porDep: porDep, sem: sem };
  });
  return saida;
}

/* ------------------------------------------------------------------ */
/* ESTADO DE UMA CARGA (o mesmo do cgEstadoCarga da tela)              */
/* ------------------------------------------------------------------ */

function cgEstadoCarga_(c, idDep) {
  const deps = idDep ? [idDep] : Object.keys((c && c.s) || {});
  let n = 0, soma = 0, pronta = true, algo = false, gargalo = '', gargaloPct = 101;
  deps.forEach(function (d) {
    let nd = 0, sd = 0, ok = true;
    ((c.s && c.s[d]) || ['', '']).forEach(function (v) {
      const p = cgPartes_(v);
      if (p.nada || p.vazia) return;
      nd++;
      if (p.x) { sd += 1; algo = true; return; }
      sd += p.a / p.b;
      if (p.a > 0) algo = true;
      if (!p.completa) ok = false;
    });
    if (!nd) return;
    n += nd; soma += sd;
    if (!ok) { pronta = false; const pd = sd / nd * 100; if (pd < gargaloPct) { gargaloPct = pd; gargalo = d; } }
  });
  if (!n) return { estado: 'sem', pct: 100, gargalo: '', gargaloPct: null };
  return { estado: pronta ? 'pronta' : (algo ? 'andamento' : 'naoIniciada'), pct: Math.round(soma / n * 1000) / 10,
    gargalo: gargalo, gargaloPct: gargalo ? Math.round(gargaloPct * 10) / 10 : null };
}

/* ------------------------------------------------------------------ */
/* SEQUENCIA DAS CARGAS (CARGA_SEQUENCIA)                              */
/* ------------------------------------------------------------------ */

/*
 * A ordem em que as cargas devem ser feitas, montada pelo supervisor (arrastar, subir, descer, mandar
 * para a posicao N). Enquanto ninguem mexeu, a sequencia e a do relatorio e nada e gravado (as cargas
 * aparecem como "virtuais"); a primeira mudanca grava a fila inteira. Cada PDF novo poe as cargas
 * novas no fim (a de 24 horas ganha a sugestao "trazer para o topo") e marca a que saiu do relatorio.
 * POSICAO 0 = tirada da fila (Limpar concluidas): nao volta como virtual.
 * "Confere pela situacao de carga": as N primeiras por terminar devem estar em andamento (N =
 * CARGA_SEQ_EM_CURSO); carga mais para tras andando com uma anterior sem comecar = fora de sequencia.
 */
function cgNEmCurso_() { return cgInteiro_(parametro('CARGA_SEQ_EM_CURSO', ''), 1, 30, 5); }
function cgSequenciaLinhas_() {
  return listar('CARGA_SEQUENCIA').map(function (r) {
    return { id: r.ID, linha: r._linha, n: String(r.CARGA || '').replace(/\D+/g, ''), pos: Number(r.POSICAO) || 0, nm: String(r.NOME || ''),
      h: String(r.H24) === '1' || String(r.H24).toUpperCase() === 'SIM' ? 1 : 0, entrou: String(r.ENTROU_EM || ''), saiu: String(r.SAIU_EM || ''),
      por: String(r.ATUALIZADO_POR || ''), em: String(r.ATUALIZADO_EM || '') };
  }).filter(function (x) { return x.n; });
}
/* A fila de agora: as gravadas (pela POSICAO) e, no fim, as do relatorio que ainda nao estao nela. */
function cgOrdemAtual_(linhas, cargas) {
  const vistos = {}, ordem = [];
  linhas.slice().sort(function (a, b) { return (a.pos - b.pos) || a.entrou.localeCompare(b.entrou); }).forEach(function (l) {
    if (vistos[l.n]) return;
    vistos[l.n] = true;
    if (l.pos > 0) ordem.push({ n: l.n, nm: l.nm, h: l.h, entrou: l.entrou, saiu: l.saiu, linha: l });
  });
  cargas.forEach(function (c) {
    if (vistos[c.n]) return;
    vistos[c.n] = true;
    ordem.push({ n: c.n, nm: c.nm, h: c.h ? 1 : 0, entrou: '', saiu: '', virtual: true });
  });
  return ordem;
}
/* Pura: a fila conferida com a situacao de carga. */
function cgConferirSequencia_(ordem, cargas, nEmCurso) {
  const porN = {};
  cargas.forEach(function (c) { porN[c.n] = c; });
  const itens = ordem.map(function (o, i) {
    const c = porN[o.n];
    const e = c ? cgEstadoCarga_(c) : { estado: 'saiu', pct: null, gargalo: '', gargaloPct: null };
    return { n: o.n, nm: c ? c.nm : o.nm, h: c ? (c.h ? 1 : 0) : o.h, v: c ? c.v : '', bx: c ? c.bx : '', pos: i + 1, virtual: !!o.virtual,
      saiu: !c, estado: e.estado, pct: e.pct, gargalo: e.gargalo, gargaloPct: e.gargaloPct, entrou: o.entrou || '', flags: [] };
  });
  const ativo = function (x) { return !x.saiu && x.estado !== 'pronta' && x.estado !== 'sem'; };
  const ativos = itens.filter(ativo);
  ativos.slice(0, nEmCurso).forEach(function (x) { x.flags.push('emCurso'); if (x.estado === 'naoIniciada') x.flags.push('deveria'); });
  let primeiraParada = null, haNao24 = false;
  ativos.forEach(function (x) {
    if (x.estado === 'naoIniciada' && !primeiraParada) primeiraParada = x;
    if (x.estado === 'andamento' && primeiraParada && x.flags.indexOf('emCurso') === -1) {
      x.flags.push('fora'); x.antesDe = primeiraParada.n;
      if (primeiraParada.flags.indexOf('pulada') === -1) primeiraParada.flags.push('pulada');
    }
    if (x.h && haNao24) x.flags.push('prioridade');
    if (!x.h) haNao24 = true;
  });
  const conta = function (f) { return itens.filter(function (x) { return x.flags.indexOf(f) !== -1; }).length; };
  return { itens: itens, nEmCurso: nEmCurso, usada: ordem.some(function (o) { return !o.virtual; }),
    alertas: { fora: conta('fora'), deveria: conta('deveria'), prioridade: conta('prioridade') },
    ativas: ativos.length, prontas: itens.filter(function (x) { return x.estado === 'pronta'; }).length, sairam: itens.filter(function (x) { return x.saiu; }).length };
}
function cgSequenciaDaTela_(cargas) {
  const linhas = cgSequenciaLinhas_();
  const r = cgConferirSequencia_(cgOrdemAtual_(linhas, cargas), cargas, cgNEmCurso_());
  const ultima = linhas.filter(function (l) { return l.em; }).sort(function (a, b) { return b.em.localeCompare(a.em); })[0];
  r.mexida = ultima ? { por: ultima.por, em: ultima.em } : null;
  return r;
}
/* Grava a fila na ordem dada: so as linhas que mudaram de posicao e as virtuais que passam a existir. */
function cgGravarOrdem_(ordem, quem) {
  const agora = cgAgoraIso_();
  const mudar = [], novas = [];
  ordem.forEach(function (o, i) {
    const pos = String(i + 1);
    if (o.linha) { if (String(o.linha.pos) !== pos) mudar.push({ id: o.linha.id, linha: o.linha.linha, campos: { POSICAO: pos } }); }
    else novas.push({ CARGA: o.n, POSICAO: pos, NOME: cgTexto_(o.nm, 160), H24: o.h ? '1' : '', ENTROU_EM: agora, SAIU_EM: '' });
  });
  if (mudar.length) atualizarVarios('CARGA_SEQUENCIA', mudar, quem);
  if (novas.length) inserirVarios('CARGA_SEQUENCIA', novas, quem);
  return mudar.length + novas.length;
}
/*
 * MEXER NA SEQUENCIA. params: { op, carga, para }.
 *   mover    a carga vai para a posicao `para` (1 = primeira)
 *   topo24   as cargas de 24 horas por terminar sobem para o topo (na ordem em que estao)
 *   limpar   tira da fila as prontas e as que sairam do relatorio
 */
function acaoSequenciaCarga(usuario, params) {
  const p = params || {};
  const op = String(p.op || '');
  if (['mover', 'topo24', 'limpar'].indexOf(op) === -1) throw new Error('Operação desconhecida na sequência.');
  const quem = usuario.email;
  let recado = '';
  comTrava(function () {
    const ult = cgSnapshots_()[0];
    const cargas = ult ? cgCargasDe_(ult) : [];
    const linhas = cgSequenciaLinhas_();
    let ordem = cgOrdemAtual_(linhas, cargas);
    const conf = cgConferirSequencia_(ordem, cargas, cgNEmCurso_());
    if (op === 'mover') {
      const n = String(p.carga || '').replace(/\D+/g, '');
      const i = ordem.map(function (o) { return o.n; }).indexOf(n);
      if (i === -1) throw new Error('A carga ' + n + ' não está na sequência. Atualize a tela.');
      let para = Math.round(Number(p.para));
      if (!(para >= 1)) throw new Error('Diga para qual posição (1 = a primeira).');
      para = Math.min(para, ordem.length);
      const item = ordem.splice(i, 1)[0];
      ordem.splice(para - 1, 0, item);
      recado = 'Carga ' + n + ' na posição ' + para + '.';
    } else if (op === 'topo24') {
      const sobe = {};
      conf.itens.forEach(function (x) { if (x.h && !x.saiu && x.estado !== 'pronta') sobe[x.n] = true; });
      const topo = ordem.filter(function (o) { return sobe[o.n]; });
      if (!topo.length) throw new Error('Nenhuma carga de 24 horas por terminar.');
      ordem = topo.concat(ordem.filter(function (o) { return !sobe[o.n]; }));
      recado = topo.length + (topo.length === 1 ? ' carga de 24 horas subiu' : ' cargas de 24 horas subiram') + ' para o topo.';
    } else {
      const fora = {};
      conf.itens.forEach(function (x) { if (x.saiu || x.estado === 'pronta') fora[x.n] = true; });
      const tirar = ordem.filter(function (o) { return fora[o.n]; });
      if (!tirar.length) throw new Error('Nenhuma carga pronta ou fora do relatório na fila.');
      ordem = ordem.filter(function (o) { return !fora[o.n]; });
      const zerar = tirar.filter(function (o) { return o.linha; }).map(function (o) { return { id: o.linha.id, linha: o.linha.linha, campos: { POSICAO: '0' } }; });
      if (zerar.length) atualizarVarios('CARGA_SEQUENCIA', zerar, quem);
      const virtuaisProntas = tirar.filter(function (o) { return !o.linha; }).map(function (o) {
        return { CARGA: o.n, POSICAO: '0', NOME: cgTexto_(o.nm, 160), H24: o.h ? '1' : '', ENTROU_EM: cgAgoraIso_(), SAIU_EM: '' };
      });
      if (virtuaisProntas.length) inserirVarios('CARGA_SEQUENCIA', virtuaisProntas, quem);
      recado = tirar.length + (tirar.length === 1 ? ' carga saiu' : ' cargas saíram') + ' da fila.';
    }
    cgGravarOrdem_(ordem, quem);
  });
  esquecerLeituras();
  const ult = cgSnapshots_()[0];
  return { ok: true, sequencia: cgSequenciaDaTela_(ult ? cgCargasDe_(ult) : []), g: cgGeracao_(), recado: recado };
}
/*
 * PDF NOVO (dentro da trava do envio): com a fila em uso, as cargas novas entram no fim; a que saiu do
 * relatorio ganha SAIU_EM (some da fila 24 h depois); a que voltou perde o SAIU_EM. Fila nunca usada:
 * nada a gravar (ela segue o relatorio).
 */
function cgMesclarSequencia_(cargas, emitido, quem) {
  const linhas = cgSequenciaLinhas_();
  if (!linhas.length) return;
  const porN = {}, noPdf = {};
  linhas.forEach(function (l) { if (!porN[l.n]) porN[l.n] = l; });
  cargas.forEach(function (c) { noPdf[c.n] = c; });
  let fim = linhas.reduce(function (m, l) { return Math.max(m, l.pos); }, 0);
  const novas = [], mudar = [];
  cargas.forEach(function (c) {
    const l = porN[c.n];
    if (!l) { novas.push({ CARGA: c.n, POSICAO: String(++fim), NOME: c.nm, H24: c.h ? '1' : '', ENTROU_EM: emitido, SAIU_EM: '' }); return; }
    const campos = {};
    if (l.saiu) campos.SAIU_EM = '';
    if (l.nm !== c.nm) campos.NOME = c.nm;
    if (l.h !== (c.h ? 1 : 0)) campos.H24 = c.h ? '1' : '';
    if (Object.keys(campos).length) mudar.push({ id: l.id, linha: l.linha, campos: campos });
  });
  linhas.forEach(function (l) {
    if (noPdf[l.n]) return;
    if (!l.saiu) mudar.push({ id: l.id, linha: l.linha, campos: { SAIU_EM: emitido } });
    else if (cgMin_(emitido) - cgMin_(l.saiu) > 24 * 60) mudar.push({ id: l.id, linha: l.linha, campos: { EXCLUIDO: 'SIM' } });
  });
  if (mudar.length) atualizarVarios('CARGA_SEQUENCIA', mudar, quem);
  if (novas.length) inserirVarios('CARGA_SEQUENCIA', novas, quem);
}

/* ------------------------------------------------------------------ */
/* HISTORICO: ABRIR UM ENVIO E COMPARAR DOIS                           */
/* ------------------------------------------------------------------ */

function cgListaEnvios_(snaps) {
  return snaps.slice(0, 200).map(function (s) {
    const r = cgJson_(s.RESUMO, {}) || {};
    const t = cgTotais_(r);
    return { id: s.ID, emitido: cgIso_(s.EMITIDO_EM), enviado: String(s.ENVIADO_EM || ''), por: String(s.ENVIADO_NOME || s.ENVIADO_POR || ''),
      total: r.total || 0, prontas: r.prontas || 0, h24Pend: r.h24Pend || 0, pctSep: t.pctSep, pctConf: t.pctConf, restSep: t.restSep, restConf: t.restConf,
      arquivo: String(s.ARQUIVO || ''), drive: String(s.CARGAS || '').indexOf('DRIVE:') === 0 };
  });
}
/* Um envio como a tela mostra (as cargas do Drive quando e um dos antigos), com os indicadores daquela hora. */
function cgSnapshotDaTela_(snaps, linha) {
  const bruto = String(linha.CARGAS || '');
  const cargas = cgCargasDe_(linha);
  if (bruto && !cargas.length) throw new Error('Não consegui ler as cargas deste envio' + (bruto.indexOf('DRIVE:') === 0 ? ' no Drive (o arquivo foi apagado ou a conta dona do GSL perdeu o acesso)' : '') + '.');
  const depositos = cgJson_(linha.DEPOSITOS, null) || CG_DEPOSITOS.map(function (d) { return { id: d.id, nome: d.nome }; });
  const resumo = cgJson_(linha.RESUMO, {}) || {};
  const minAlvo = cgMin_(linha.EMITIDO_EM);
  const recentes = snaps.filter(function (s) { const m = cgMin_(s.EMITIDO_EM); return m <= minAlvo && minAlvo - m <= CG_HISTORICO_H * 60; });
  const contagem = {};
  CG_DEPOSITOS.forEach(function (d) { const e = (resumo.equipe || {})[d.id] || {}; contagem[d.id] = { sep: e.sep || 0, conf: e.conf || 0, andares: [0, 0, 0, 0, 0] }; });
  const indicadores = cgIndicadores_(recentes, cargas, depositos, resumo, contagem);
  indicadores.equilibrio = cgEquilibrio_(cargas, depositos, contagem, cgLimitesEquilibrio_());
  return {
    snapshot: { id: linha.ID, emitido: cgIso_(linha.EMITIDO_EM), enviado: String(linha.ENVIADO_EM || ''), por: String(linha.ENVIADO_NOME || linha.ENVIADO_POR || ''),
      arquivo: String(linha.ARQUIVO || ''), paginas: Number(linha.PAGINAS || 0), naoLidas: Number(linha.NAO_LIDAS || 0),
      depositos: depositos, cargas: cargas, resumo: resumo, drive: bruto.indexOf('DRIVE:') === 0 },
    indicadores: indicadores
  };
}
/*
 * O QUE ANDOU ENTRE DOIS ENVIOS (a = o mais velho, b = o mais novo): por deposito, as tarefas feitas e o %
 * antes e depois; por carga: nova, saiu do relatorio, ficou pronta, avancou ou parada.
 */
function cgComparar_(a, b, depositos) {
  const ra = cgResumo_(a.cargas, depositos), rb = cgResumo_(b.cargas, depositos);
  const pct = function (r) { const f = (r.sepFeitas || 0) + (r.confFeitas || 0), t = (r.sepTotal || 0) + (r.confTotal || 0); return t ? Math.round(f / t * 1000) / 10 : null; };
  const antes = {}, depois = {};
  a.cargas.forEach(function (c) { antes[c.n] = c; });
  b.cargas.forEach(function (c) { depois[c.n] = c; });
  const porDep = {}, totais = { sep: 0, conf: 0, concluidas: 0, novas: 0, sairam: 0, avancaram: 0, paradas: 0 };
  depositos.forEach(function (d) {
    let sep = 0, conf = 0, concl = 0;
    b.cargas.forEach(function (c) {
      const ant = antes[c.n];
      const fa = ant ? cgFeitas_(ant, d.id) : [0, 0], fb = cgFeitas_(c, d.id);
      sep += Math.max(0, fb[0] - fa[0]); conf += Math.max(0, fb[1] - fa[1]);
      const par = (c.s || {})[d.id] || ['', ''], parA = ant && ant.s && ant.s[d.id];
      if (cgCompleta_(par[0]) && cgCompleta_(par[1]) && !(parA && cgCompleta_(parA[0]) && cgCompleta_(parA[1]))) concl++;
    });
    porDep[d.id] = { nome: d.nome, sep: sep, conf: conf, concluidas: concl, pctAntes: pct((ra.dep || {})[d.id] || {}), pctDepois: pct((rb.dep || {})[d.id] || {}) };
    totais.sep += sep; totais.conf += conf;
  });
  const cargas = [];
  b.cargas.forEach(function (c) {
    const eb = cgEstadoCarga_(c), ant = antes[c.n];
    if (!ant) { cargas.push({ n: c.n, nm: c.nm, h: c.h ? 1 : 0, tipo: 'nova', antes: null, depois: eb.pct }); totais.novas++; return; }
    const ea = cgEstadoCarga_(ant);
    let tipo = 'parada';
    if (eb.estado === 'pronta' && ea.estado !== 'pronta') { tipo = 'concluiu'; totais.concluidas++; }
    else if (eb.estado === 'pronta') tipo = 'pronta';
    else if (eb.pct > ea.pct + 0.05) { tipo = 'avancou'; totais.avancaram++; }
    else if (eb.pct < ea.pct - 0.05) tipo = 'voltou';
    else totais.paradas++;
    cargas.push({ n: c.n, nm: c.nm, h: c.h ? 1 : 0, tipo: tipo, antes: ea.pct, depois: eb.pct });
  });
  a.cargas.forEach(function (c) {
    if (depois[c.n]) return;
    cargas.push({ n: c.n, nm: c.nm, h: c.h ? 1 : 0, tipo: 'saiu', antes: cgEstadoCarga_(c).pct, depois: null }); totais.sairam++;
  });
  const ordem = { concluiu: 0, avancou: 1, parada: 2, voltou: 3, nova: 4, saiu: 5, pronta: 6 };
  cargas.sort(function (x, y) {
    return (ordem[x.tipo] - ordem[y.tipo]) || (y.h - x.h) || ((y.depois || 0) - (y.antes || 0) - ((x.depois || 0) - (x.antes || 0))) || String(x.n).localeCompare(String(y.n));
  });
  return { de: a.emitido, para: b.emitido, horas: Math.round((cgMin_(b.emitido) - cgMin_(a.emitido)) / 60 * 100) / 100,
    porDep: porDep, totais: totais, cargas: cargas.slice(0, 400), total: cargas.length };
}
/*
 * ABRIR UM ENVIO ANTIGO (so leitura). params: { id, com } — com: o id de outro envio, ou 'atual' (o mais
 * recente), para ver o que andou entre os dois.
 */
function acaoSnapshotCarga(usuario, params) {
  const p = params || {};
  const snaps = cgSnapshots_();
  const alvo = snaps.filter(function (s) { return String(s.ID) === String(p.id || ''); })[0];
  if (!alvo) throw new Error('Este envio não existe mais (foi desfeito?). Atualize a tela.');
  const r = cgSnapshotDaTela_(snaps, alvo);
  const saida = { ok: true, snapshot: r.snapshot, indicadores: r.indicadores };
  if (p.com) {
    const outro = p.com === 'atual' ? snaps[0] : snaps.filter(function (s) { return String(s.ID) === String(p.com); })[0];
    if (outro && String(outro.ID) !== String(alvo.ID)) {
      const b = { emitido: cgIso_(outro.EMITIDO_EM), cargas: cgCargasDe_(outro) };
      const a = { emitido: r.snapshot.emitido, cargas: r.snapshot.cargas };
      const velho = cgMin_(a.emitido) <= cgMin_(b.emitido) ? a : b, novo = velho === a ? b : a;
      saida.comparacao = cgComparar_(velho, novo, r.snapshot.depositos);
      saida.comparacao.com = String(outro.ID);
    }
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* FLOWRACK (Nobre): ruas por andar                                    */
/* ------------------------------------------------------------------ */

/* [terreo, 1o, 2o, 3o, 4o]: "6" vale para todos; "6,6,8,8,4" um por andar (1 a 20). */
function cgRuasFlowrack_(texto) {
  const bruto = texto == null ? String(parametro('CARGA_FLOWRACK_RUAS', '') || '') : String(texto);
  const partes = bruto.split(/[^\d]+/).filter(Boolean).map(Number);
  const ok = function (n) { return n >= 1 && n <= 20; };
  if (partes.length === 1 && ok(partes[0])) return [0, 1, 2, 3, 4].map(function () { return partes[0]; });
  if (partes.length === 5 && partes.every(ok)) return partes;
  return texto == null ? [6, 6, 6, 6, 6] : null;
}

/* ------------------------------------------------------------------ */
/* PARAMETROS DA CARGA (tela, para quem edita)                         */
/* ------------------------------------------------------------------ */

/* params: { turnos: { A, B, C }, boxes, permanencia, ruas, emCurso } — so o que vier. */
function acaoParametrosCarga(usuario, params) {
  const p = params || {};
  const gravar = [];
  if (p.turnos) {
    ['A', 'B', 'C'].forEach(function (id) {
      if (p.turnos[id] == null) return;
      const h = cgHorarioTurno_(p.turnos[id]);
      if (!h) throw new Error('Turno ' + id + ': escreva o horário como 06:50-16:14.');
      gravar.push(['CARGA_TURNO_' + id, cgHoraTexto_(h.ini) + '-' + cgHoraTexto_(h.fim)]);
    });
  }
  if (p.boxes != null && p.boxes !== '') {
    const n = cgInteiro_(p.boxes, 1, 99, 0);
    if (!n) throw new Error('Quantidade de boxes: de 1 a 99.');
    gravar.push(['CARGA_BOXES', String(n)]);
  }
  if (p.ruas != null && p.ruas !== '') {
    const r = cgRuasFlowrack_(String(p.ruas));
    if (!r) throw new Error('Ruas do flowrack: um número de 1 a 20 (o mesmo para todos os andares) ou cinco, do térreo ao 4º (ex.: 6,6,6,8,8).');
    gravar.push(['CARGA_FLOWRACK_RUAS', r.every(function (x) { return x === r[0]; }) ? String(r[0]) : r.join(',')]);
  }
  if (p.permanencia != null && p.permanencia !== '') {
    const n = cgInteiro_(p.permanencia, 10, 1440, 0);
    if (!n) throw new Error('Tempo no box antes do alerta: de 10 a 1440 minutos.');
    gravar.push(['CARGA_BOX_PERMANENCIA_MIN', String(n)]);
  }
  if (p.emCurso != null && p.emCurso !== '') {
    const n = cgInteiro_(p.emCurso, 1, 30, 0);
    if (!n) throw new Error('Cargas em andamento ao mesmo tempo: de 1 a 30.');
    gravar.push(['CARGA_SEQ_EM_CURSO', String(n)]);
  }
  if (!gravar.length) throw new Error('Nada para salvar.');
  comTrava(function () { gravar.forEach(function (x) { cgSalvarParametro_(x[0], x[1], usuario.email); }); });
  return { ok: true, recado: 'Ajustes da situação de carga salvos.', invalidarTudo: true };
}

/* ------------------------------------------------------------------ */
/* BOXES E CARREGAMENTO — o controle das docas dentro do GSL           */
/* ------------------------------------------------------------------ */

/*
 * Pedido da gerencia (25/11): o setor de carregamento deixa a planilha de controle dos boxes e passa a
 * controlar as docas aqui. CARGA_CARREGAMENTO: uma linha por carga no carregamento, com o box, o veiculo
 * (placa ou numero e o tipo, que vira o desenho), o motorista, a situacao (a lista do parametro
 * CARGA_SITUACOES_BOX, a mesma das observacoes da planilha antiga), a chegada, a previsao e o historico.
 * ETAPA: FILA (no patio, sem box) · BOX (box reservado; com CHEGADA e NO_BOX_EM, o veiculo esta encostado)
 * · CARREGANDO · CARREGADA (libera o box; a linha fica de historico). CARGA_BOXES: so os boxes bloqueados
 * (ou com observacao); o box sem linha e livre. Cada mudanca muda a geracao: todo mundo ve na hora.
 * Cruzamento com o PDF: carga pronta sem veiculo no box, veiculo no box com a carga longe de pronta,
 * box diferente do relatorio, prioridade com situacao de risco, veiculo no box ha mais de
 * CARGA_BOX_PERMANENCIA_MIN minutos e carga que ja saiu do relatorio sem estar carregada.
 * A planilha antiga so e lida (Importar da planilha antiga, uma vez); o GSL nunca grava nela.
 */
const CG_OBS_CATEGORIA = {
  ok: ['JA NO BOX', 'CARREGANDO', 'MOTORISTA A CAMINHO', 'CARRO NO PATIO', 'MOTORISTA AGENDADO'],
  espera: ['AMANHA CEDO', 'CARREGA PELA MANHA', 'CARREGAR AMANHA', 'CARREGAR SO A NOITE', 'CARREGAR SO A TARDE', 'VEM NA MADRUGADA',
    'BOX ALTERADO', 'PRIORIDADE ALTERADA', 'MOTORRISTA CHEGOU ATRASADO', 'MOTORISTA CHEGOU ATRASADO', 'CARRO PINTANDO', 'FALTA LIGAR'],
  risco: ['MARCOU E NAO VEIO', 'CARRO COM DEFEITO', 'CARRO NA OFICINA', 'MOTORISTA NAO ATENDE', 'NAO CONSIGO CONTATO', 'NAO ESCALADO',
    'SEM ESCALAR', 'SEM O NUMERO DO MOTORISTA', 'SEM PREVISAO']
};
/* A lista da planilha deles, como eles escrevem (o parametro CARGA_SITUACOES_BOX comeca com ela). */
const CG_SITUACOES_PADRAO = ['AMANHA CEDO', 'BOX ALTERADO', 'CARREGA PELA MANHA', 'CARREGANDO', 'CARREGAR AMANHÃ', 'CARREGAR SÓ À NOITE',
  'CARREGAR SÓ À TARDE', 'CARRO COM DEFEITO', 'CARRO NA OFICINA', 'CARRO NO PATIO', 'CARRO PINTANDO', 'FALTA LIGAR', 'JÁ NO BOX',
  'MARCOU E NAO VEIO', 'MOTORISTA A CAMINHO', 'MOTORISTA AGENDADO', 'MOTORISTA NAO ATENDE', 'MOTORRISTA CHEGOU ATRASADO',
  'NAO CONSIGO CONTATO', 'NÃO ESCALADO', 'PRIORIDADE ALTERADA', 'SEM ESCALAR', 'SEM O NUMERO DO MOTORISTA', 'SEM PREVISÃO', 'VEM NA MADRUGADA'];
const CG_ETAPAS = ['FILA', 'BOX', 'CARREGANDO', 'CARREGADA'];
/* Tipos de veiculo (cada um tem o seu desenho na tela). */
const CG_TIPOS_VEICULO = ['LEVE', 'VUC', 'MEDIO', 'TOCO', 'TRUCK', 'CARRETA', 'OUTRO'];

function cgObsNorm_(obs) { return cgNorm_(obs).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function cgCategoriaObs_(obs) {
  const t = cgObsNorm_(obs);
  if (!t) return '';
  let cat = 'outra';
  ['risco', 'ok', 'espera'].some(function (k) { if (CG_OBS_CATEGORIA[k].indexOf(t) !== -1) { cat = k; return true; } return false; });
  return cat;
}
function cgNBoxes_() { return cgInteiro_(parametro('CARGA_BOXES', ''), 1, 99, 26); }
function cgPermanenciaMin_() { return cgInteiro_(parametro('CARGA_BOX_PERMANENCIA_MIN', ''), 10, 1440, 120); }
/* A lista de situacoes (parametro, uma por linha ou separadas por ;) mais as que os botoes usam. */
function cgSituacoesBox_() {
  const bruto = String(parametro('CARGA_SITUACOES_BOX', '') || '');
  const lista = bruto ? bruto.split(/[;\n]+/).map(function (x) { return cgTexto_(x, 40).toUpperCase(); }).filter(Boolean) : CG_SITUACOES_PADRAO.slice();
  ['JÁ NO BOX', 'CARREGANDO', 'CARRO NO PATIO', 'MARCOU E NAO VEIO'].forEach(function (x) {
    if (!lista.some(function (y) { return cgObsNorm_(y) === cgObsNorm_(x); })) lista.push(x);
  });
  return lista;
}
/* A situacao como esta na lista (sem diferenca de acento e maiuscula), ou '' se nao esta. */
function cgSituacaoDaLista_(texto, lista) {
  const t = cgObsNorm_(texto);
  if (!t) return '';
  return (lista || cgSituacoesBox_()).filter(function (x) { return cgObsNorm_(x) === t; })[0] || '';
}
/* "VUC 2700", "MEDIO - DEP", "3/4", "TOCO", "TRUCK", "BI-TRUCK", "CARRETA", "LEVE"... -> o tipo do desenho */
function cgTipoDoVeiculo_(texto) {
  const t = cgNorm_(texto);
  if (!t) return '';
  if (/CARRETA|SEMI ?REBOQUE|BITREM|RODOTREM|CAVALO/.test(t)) return 'CARRETA';
  if (/TRUCK|TRUCAD/.test(t)) return 'TRUCK';
  if (/TOCO/.test(t)) return 'TOCO';
  if (/\bVUC\b/.test(t)) return 'VUC';
  if (/3\/4|TRES QUARTOS|MEDIO/.test(t)) return 'MEDIO';
  if (/LEVE|UTILIT|VAN\b|FIORINO|PICK|SAVEIRO|KOMBI|STRADA|MONTANA|HR\b/.test(t)) return 'LEVE';
  return 'OUTRO';
}
/* O tipo so quando o texto diz qual (uma placa diz "OUTRO": ai vale o tipo do relatorio). */
function cgTipoConhecido_(texto) { const t = cgTipoDoVeiculo_(texto); return t === 'OUTRO' ? '' : t; }
/* "05:40" -> o ISO de hoje (ou de ontem, se a hora ainda nao chegou: o carro chegou de madrugada). */
function cgHoraParaIso_(hora, agoraIso) {
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(String(hora || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  const hh = ('0' + m[1]).slice(-2) + ':' + m[2];
  let dia = String(agoraIso).slice(0, 10);
  if (hh > String(agoraIso).slice(11, 16)) dia = cgDiaMais_(dia, -1);
  return dia + 'T' + hh + ':00';
}

function cgCarregamentos_() {
  return listar('CARGA_CARREGAMENTO').map(function (r) {
    return { id: r.ID, linha: r._linha, n: String(r.CARGA || ''), comp: String(r.COMPLEMENTO || ''), prio: String(r.PRIORIDADE || ''),
      box: Number(r.BOX) || 0, veiculo: String(r.VEICULO || ''), tipo: String(r.TIPO_VEICULO || ''), motorista: String(r.MOTORISTA || ''),
      situacao: String(r.SITUACAO || ''), situacaoCat: cgCategoriaObs_(r.SITUACAO), etapa: CG_ETAPAS.indexOf(String(r.ETAPA)) !== -1 ? String(r.ETAPA) : 'FILA',
      chegada: cgIso_(r.CHEGADA), noBox: cgIso_(r.NO_BOX_EM), previsao: String(r.PREVISAO || ''), carregadaEm: cgIso_(r.CARREGADA_EM),
      carregadaPor: String(r.CARREGADA_POR || ''), obs: String(r.OBSERVACAO || ''), hist: cgJson_(r.HISTORICO, []) || [],
      por: String(r.ATUALIZADO_POR || ''), em: String(r.ATUALIZADO_EM || '') };
  }).filter(function (x) { return x.n; });
}
function cgBoxesGravados_() {
  const saida = {};
  listar('CARGA_BOXES').forEach(function (r) {
    const n = Number(r.NUMERO);
    if (n >= 1) saida[n] = { id: r.ID, linha: r._linha, estado: String(r.ESTADO) === 'BLOQUEADO' ? 'BLOQUEADO' : 'LIVRE', obs: String(r.OBSERVACAO || '') };
  });
  return saida;
}

/* Andamento de uma carga do PDF (para o box): % geral, % da separacao e da conferencia, gargalo. */
function cgAndamentoCarga_(c) {
  const e = cgEstadoCarga_(c);
  const lado = function (k) {
    let n = 0, soma = 0;
    Object.keys(c.s || {}).forEach(function (d) {
      const p = cgPartes_((c.s[d] || [])[k]);
      if (p.nada || p.vazia) return;
      n++; soma += p.x ? 1 : p.a / p.b;
    });
    return n ? Math.round(soma / n * 1000) / 10 : null;
  };
  return { n: c.n, nm: c.nm, h: c.h ? 1 : 0, bx: c.bx || '', v: c.v || '', estado: e.estado, pct: e.pct, sep: lado(0), conf: lado(1), gargalo: e.gargalo, gargaloPct: e.gargaloPct };
}

/*
 * PURA: o patio. carregamentos (cgCarregamentos_), boxes gravados, cargas do ultimo PDF, n de boxes,
 * limite de permanencia (min) e agora -> { mapa, fila, carregadas, semRegistro, alertas, porCarga, ... }.
 */
function cgPatio_(carregamentos, gravados, cargas, nBoxes, permanencia, agora) {
  const porN = {};
  cargas.forEach(function (c) { porN[c.n] = c; });
  const minAgora = cgMin_(agora);
  const comAndamento = function (x) {
    const c = porN[x.n];
    const o = Object.assign({}, x, { pdf: c ? cgAndamentoCarga_(c) : null });
    delete o.linha;
    o.noBoxMin = x.noBox && x.etapa !== 'CARREGADA' ? Math.max(0, minAgora - cgMin_(x.noBox)) : null;
    if (!o.tipo) o.tipo = cgTipoConhecido_(x.veiculo) || (c ? cgTipoConhecido_(c.v) : '') || 'OUTRO';
    return o;
  };
  const abertos = carregamentos.filter(function (x) { return x.etapa !== 'CARREGADA'; }).map(comAndamento);
  const carregadas = carregamentos.filter(function (x) { return x.etapa === 'CARREGADA' && x.carregadaEm && minAgora - cgMin_(x.carregadaEm) <= 24 * 60; })
    .map(comAndamento).sort(function (a, b) { return b.carregadaEm.localeCompare(a.carregadaEm); });
  const mapa = [];
  for (let i = 1; i <= nBoxes; i++) {
    const g = gravados[i] || { estado: 'LIVRE', obs: '' };
    const itens = abertos.filter(function (x) { return x.box === i; });
    let estado = 'LIVRE';
    if (g.estado === 'BLOQUEADO') estado = 'BLOQUEADO';
    else if (itens.some(function (x) { return x.etapa === 'CARREGANDO'; })) estado = 'CARREGANDO';
    else if (itens.some(function (x) { return x.noBox; })) estado = 'OCUPADO';
    else if (itens.length) estado = 'RESERVADO';
    const noBox = itens.filter(function (x) { return x.noBox; }).map(function (x) { return x.noBox; }).sort()[0] || '';
    mapa.push({ numero: i, estado: estado, obs: g.obs, itens: itens, noBox: noBox, noBoxMin: noBox ? Math.max(0, minAgora - cgMin_(noBox)) : null });
  }
  const fila = abertos.filter(function (x) { return !x.box || x.box > nBoxes; }).sort(function (a, b) {
    const ha = (a.pdf && a.pdf.h) || a.prio ? 1 : 0, hb = (b.pdf && b.pdf.h) || b.prio ? 1 : 0;
    return (hb - ha) || ((b.pdf ? b.pdf.pct : -1) - (a.pdf ? a.pdf.pct : -1)) || a.n.localeCompare(b.n);
  });
  const registradas = {};
  carregamentos.forEach(function (x) { if (x.etapa !== 'CARREGADA' || (x.carregadaEm && minAgora - cgMin_(x.carregadaEm) <= 48 * 60)) registradas[x.n] = x; });
  const semRegistro = cargas.filter(function (c) { return !registradas[c.n]; }).map(cgAndamentoCarga_)
    .sort(function (a, b) { return (b.h - a.h) || ((b.estado === 'pronta') - (a.estado === 'pronta')) || (b.pct - a.pct) || a.n.localeCompare(b.n); });
  const porCarga = {};
  abertos.concat(carregadas).forEach(function (x) {
    if (porCarga[x.n] && porCarga[x.n].etapa !== 'CARREGADA') return;
    porCarga[x.n] = { id: x.id, box: x.box, etapa: x.etapa, situacao: x.situacao, situacaoCat: x.situacaoCat, veiculo: x.veiculo, tipo: x.tipo,
      chegada: x.chegada, noBox: x.noBox, carregadaEm: x.carregadaEm };
  });
  // alertas
  const alertas = [];
  abertos.forEach(function (x) {
    const p = x.pdf;
    if (x.noBox && p && p.estado !== 'pronta' && p.pct < 50) {
      alertas.push({ tipo: 'boxLonge', grav: 'atencao', box: x.box, carga: x.n, h: p.h,
        texto: 'Box ' + x.box + ': o veículo está encostado e a carga ' + x.n + ' está em ' + Math.round(p.pct) + '%' + (p.gargalo ? ' (gargalo: ' + cgNomeDep_(p.gargalo) + ')' : '') + '.' });
    }
    if (p && p.bx && x.box && Number(p.bx) !== x.box) {
      alertas.push({ tipo: 'boxDiferente', grav: 'atencao', box: x.box, carga: x.n, h: p.h, texto: 'Carga ' + x.n + ': box ' + p.bx + ' no relatório e ' + x.box + ' no pátio.' });
    }
    if (((p && p.h) || x.prio) && x.situacaoCat === 'risco') {
      alertas.push({ tipo: 'prioridadeRisco', grav: 'alerta', box: x.box, carga: x.n, h: p ? p.h : 0,
        texto: 'Carga ' + x.n + (p && p.h ? ' (24 h)' : ' (prioridade ' + x.prio + ')') + ': ' + x.situacao + '.' });
    }
    if (x.noBoxMin != null && x.noBoxMin > permanencia) {
      alertas.push({ tipo: 'permanencia', grav: 'atencao', box: x.box, carga: x.n, h: p ? p.h : 0, min: x.noBoxMin,
        texto: 'Box ' + x.box + ': veículo da carga ' + x.n + ' encostado há ' + cgDuracaoTxt_(x.noBoxMin) + ' (limite ' + cgDuracaoTxt_(permanencia) + ').' });
    }
    if (!p && cargas.length) {
      alertas.push({ tipo: 'foraDoPdf', grav: 'info', box: x.box, carga: x.n, h: 0, texto: 'Carga ' + x.n + ' não está mais na situação de carga: já foi carregada?' });
    }
  });
  cargas.forEach(function (c) {
    const a = cgAndamentoCarga_(c);
    if (a.estado !== 'pronta') return;
    const x = porCarga[c.n];
    if (x && (x.etapa === 'CARREGADA' || x.etapa === 'CARREGANDO' || (x.box && x.noBox))) return;
    alertas.push({ tipo: 'prontaSemBox', grav: c.h ? 'alerta' : 'atencao', box: x ? x.box : 0, carga: c.n, h: c.h ? 1 : 0,
      texto: 'Carga ' + c.n + (c.h ? ' (24 h)' : '') + ' está pronta e não tem veículo no box' + (x && x.situacao ? ' — ' + x.situacao : (x ? '' : ' (nem registro no pátio)')) + '.' });
  });
  const peso = { alerta: 0, atencao: 1, info: 2 };
  alertas.sort(function (a, b) { return (peso[a.grav] - peso[b.grav]) || ((b.h || 0) - (a.h || 0)) || String(a.carga).localeCompare(String(b.carga)); });
  return { n: nBoxes, permanenciaMin: permanencia, mapa: mapa, fila: fila, carregadas: carregadas.slice(0, 60), semRegistro: semRegistro.slice(0, 200),
    alertas: alertas.slice(0, 120), porCarga: porCarga,
    contagem: { livres: mapa.filter(function (b) { return b.estado === 'LIVRE'; }).length, reservados: mapa.filter(function (b) { return b.estado === 'RESERVADO'; }).length,
      ocupados: mapa.filter(function (b) { return b.estado === 'OCUPADO' || b.estado === 'CARREGANDO'; }).length,
      bloqueados: mapa.filter(function (b) { return b.estado === 'BLOQUEADO'; }).length, fila: fila.length, carregadasHoje: carregadas.length } };
}
function cgDuracaoTxt_(min) { min = Math.round(min); return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + ('0' + (min % 60)).slice(-2) : ''); }
function cgPatioDaTela_(cargas) {
  const p = cgPatio_(cgCarregamentos_(), cgBoxesGravados_(), cargas || [], cgNBoxes_(), cgPermanenciaMin_(), cgAgoraIso_());
  p.situacoes = cgSituacoesBox_();
  p.tipos = CG_TIPOS_VEICULO;
  return p;
}
function cgCargasDoUltimo_() { const u = cgSnapshots_()[0]; return u ? cgCargasDe_(u) : []; }

/* O numero da carga: completo, ou o curto (3 digitos, como no quadro dos boxes) que so uma carga do PDF termina. */
function cgResolverCarga_(texto, cargas) {
  const num = String(texto || '').replace(/\D+/g, '');
  if (!num || num.length < 2) return { n: '', erro: 'Informe o número da carga.' };
  if (cargas.some(function (c) { return c.n === num; })) return { n: num };
  if (num.length <= 5) {
    const m = cargas.filter(function (c) { return c.n.length > num.length && c.n.slice(-num.length) === num; });
    if (m.length === 1) return { n: m[0].n, curto: num };
    if (m.length > 1) return { n: '', erro: '"' + num + '" pode ser ' + m.map(function (c) { return c.n; }).join(' ou ') + ': digite o número inteiro.', ambigua: m.map(function (c) { return c.n; }) };
    if (num.length < 4) return { n: '', erro: 'Nenhuma carga da situação de carga termina em ' + num + ': digite o número inteiro.' };
  }
  return /^\d{4,10}$/.test(num) ? { n: num, fora: true } : { n: '', erro: 'Número da carga inválido.' };
}
function cgHist_(x, quem, texto, agora) {
  const h = (x && x.hist ? x.hist.slice() : []);
  h.push([agora, quem, texto]);
  return JSON.stringify(h.slice(-40));
}

/*
 * CARREGAMENTO. params: { op, id, ... }
 *   salvar      { id?, carga, complemento, prioridade, box, veiculo, tipo, motorista, situacao, chegada (hh:mm), previsao (hh:mm), observacao }
 *   box         { id, box }        0 = de volta ao patio (fila)
 *   chegou      { id }             o veiculo chegou (no box, se ja tem box; senao, no patio)
 *   carregando  { id }             comecou a carregar (precisa de box)
 *   carregada   { id }             terminou: libera o box, fica no historico
 *   situacao    { id, situacao }
 *   reabrir     { id }             desfaz o "carregada"
 *   excluir     { id }
 */
function acaoCarregamentoCarga(usuario, params) {
  const p = params || {};
  const op = String(p.op || '');
  if (['salvar', 'box', 'chegou', 'carregando', 'carregada', 'situacao', 'reabrir', 'excluir'].indexOf(op) === -1) throw new Error('Operação desconhecida no carregamento.');
  const quem = usuario.email, nomeQuem = cgTexto_(usuario.nome || quem, 60);
  let recado = '', idFinal = String(p.id || '');
  comTrava(function () {
    const agora = cgAgoraIso_();
    const todos = cgCarregamentos_();
    const nBoxes = cgNBoxes_(), gravados = cgBoxesGravados_();
    const atual = idFinal ? todos.filter(function (x) { return x.id === idFinal; })[0] : null;
    if (op !== 'salvar' && !atual) throw new Error('Este carregamento não existe mais. Atualize a tela.');
    const conferirBox = function (b) {
      if (!b) return 0;
      if (!(b >= 1 && b <= nBoxes && Math.floor(b) === b)) throw new Error('Box de 1 a ' + nBoxes + '.');
      if (gravados[b] && gravados[b].estado === 'BLOQUEADO') throw new Error('O box ' + b + ' está bloqueado' + (gravados[b].obs ? ' (' + gravados[b].obs + ')' : '') + '.');
      return b;
    };
    const gravar = function (campos, texto) {
      campos.HISTORICO = cgHist_(atual, nomeQuem, texto, agora);
      atualizar('CARGA_CARREGAMENTO', atual.id, campos, quem);
    };
    if (op === 'salvar') {
      const cargas = cgCargasDoUltimo_();
      const r = cgResolverCarga_(p.carga, cargas);
      if (!r.n) throw new Error(r.erro);
      const outro = todos.filter(function (x) { return x.n === r.n && x.etapa !== 'CARREGADA' && x.id !== idFinal; })[0];
      if (outro) throw new Error('A carga ' + r.n + ' já está ' + (outro.box ? 'no box ' + outro.box : 'no pátio') + '.');
      const box = conferirBox(Number(p.box) || 0);
      const lista = cgSituacoesBox_();
      const situacao = p.situacao ? cgSituacaoDaLista_(p.situacao, lista) : '';
      if (p.situacao && !situacao) throw new Error('Situação "' + cgTexto_(p.situacao, 40).toUpperCase() + '" não está na lista (Configuração › Outros parâmetros › CARGA_SITUACOES_BOX).');
      const tipo = String(p.tipo || '').toUpperCase();
      if (tipo && CG_TIPOS_VEICULO.indexOf(tipo) === -1) throw new Error('Tipo de veículo desconhecido.');
      const prev = String(p.previsao || '').trim();
      if (prev && !/^([01]?\d|2[0-3])[:h][0-5]\d$/.test(prev)) throw new Error('Previsão: escreva a hora como 14:30.');
      let chegada = '';
      if (p.chegada) { chegada = cgHoraParaIso_(p.chegada, agora); if (!chegada) throw new Error('Chegada: escreva a hora como 05:40.'); }
      const c = cargas.filter(function (x) { return x.n === r.n; })[0];
      const campos = { CARGA: r.n, COMPLEMENTO: cgTexto_(p.complemento, 40), PRIORIDADE: cgTexto_(p.prioridade, 20), BOX: box ? String(box) : '',
        VEICULO: cgTexto_(p.veiculo, 30).toUpperCase(), TIPO_VEICULO: tipo || cgTipoConhecido_(p.veiculo) || (c ? cgTipoConhecido_(c.v) : '') || '',
        MOTORISTA: cgTexto_(p.motorista, 60), SITUACAO: situacao, PREVISAO: prev ? prev.replace('h', ':').replace(/^(\d):/, '0$1:') : '', OBSERVACAO: cgTexto_(p.observacao, 300) };
      if (atual) {
        if (atual.etapa === 'FILA' && box) campos.ETAPA = 'BOX';
        if (!box && atual.etapa !== 'CARREGADA') { campos.ETAPA = 'FILA'; campos.NO_BOX_EM = ''; }
        if (box && atual.box !== box && atual.noBox) campos.NO_BOX_EM = agora;
        if (chegada && !atual.chegada) { campos.CHEGADA = chegada; if (box && !atual.noBox) campos.NO_BOX_EM = chegada; }
        gravar(campos, 'editou' + (box !== atual.box ? ' · box ' + (box || 'pátio') : '') + (situacao && situacao !== atual.situacao ? ' · ' + situacao : ''));
        recado = 'Carga ' + r.n + ' atualizada.';
      } else {
        campos.ETAPA = box ? 'BOX' : 'FILA';
        if (chegada) { campos.CHEGADA = chegada; if (box) campos.NO_BOX_EM = chegada; }
        campos.HISTORICO = cgHist_(null, nomeQuem, 'registrou' + (box ? ' no box ' + box : ' no pátio'), agora);
        idFinal = inserir('CARGA_CARREGAMENTO', campos, quem);
        recado = 'Carga ' + r.n + (box ? ' no box ' + box : ' no pátio') + (r.curto ? ' (' + r.curto + ' = ' + r.n + ')' : '') + (r.fora ? ' — não está na situação de carga' : '') + '.';
      }
      return;
    }
    if (op === 'box') {
      const box = conferirBox(Number(p.box) || 0);
      if (atual.etapa === 'CARREGADA') throw new Error('A carga ' + atual.n + ' já foi carregada.');
      if (box === atual.box) return;
      const campos = { BOX: box ? String(box) : '' };
      if (!box) { campos.ETAPA = 'FILA'; campos.NO_BOX_EM = ''; }
      else { if (atual.etapa === 'FILA') campos.ETAPA = 'BOX'; campos.NO_BOX_EM = atual.chegada ? agora : ''; }
      gravar(campos, box ? 'box ' + box : 'voltou ao pátio');
      recado = 'Carga ' + atual.n + (box ? ' no box ' + box : ' de volta ao pátio') + '.';
    } else if (op === 'chegou') {
      const campos = {};
      if (!atual.chegada) campos.CHEGADA = agora;
      if (atual.box && !atual.noBox) campos.NO_BOX_EM = agora;
      campos.SITUACAO = cgSituacaoDaLista_(atual.box ? 'JÁ NO BOX' : 'CARRO NO PATIO') || (atual.box ? 'JÁ NO BOX' : 'CARRO NO PATIO');
      gravar(campos, 'chegou' + (atual.box ? ' (box ' + atual.box + ')' : ' (pátio)'));
      recado = 'Veículo da carga ' + atual.n + ' chegou' + (atual.box ? ' ao box ' + atual.box : ' (no pátio)') + ' às ' + agora.slice(11, 16) + '.';
    } else if (op === 'carregando') {
      if (!atual.box) throw new Error('Ponha a carga ' + atual.n + ' num box antes de carregar.');
      gravar({ ETAPA: 'CARREGANDO', SITUACAO: cgSituacaoDaLista_('CARREGANDO') || 'CARREGANDO', CHEGADA: atual.chegada || agora, NO_BOX_EM: atual.noBox || agora }, 'carregando');
      recado = 'Carga ' + atual.n + ' carregando no box ' + atual.box + '.';
    } else if (op === 'carregada') {
      if (atual.etapa === 'CARREGADA') throw new Error('A carga ' + atual.n + ' já está carregada.');
      gravar({ ETAPA: 'CARREGADA', CARREGADA_EM: agora, CARREGADA_POR: quem }, 'carregada' + (atual.box ? ' (box ' + atual.box + ' liberado)' : ''));
      recado = 'Carga ' + atual.n + ' carregada' + (atual.box ? ': box ' + atual.box + ' liberado' : '') + '.';
    } else if (op === 'situacao') {
      const s = cgSituacaoDaLista_(p.situacao);
      if (p.situacao && !s) throw new Error('Situação fora da lista.');
      gravar({ SITUACAO: s }, s ? 'situação: ' + s : 'tirou a situação');
      recado = 'Carga ' + atual.n + ': ' + (s || 'sem situação') + '.';
    } else if (op === 'reabrir') {
      if (atual.etapa !== 'CARREGADA') throw new Error('A carga ' + atual.n + ' não está carregada.');
      if (todos.some(function (x) { return x.n === atual.n && x.etapa !== 'CARREGADA'; })) throw new Error('A carga ' + atual.n + ' já está aberta de novo no pátio.');
      const box = atual.box && !(gravados[atual.box] && gravados[atual.box].estado === 'BLOQUEADO') ? atual.box : 0;
      gravar({ ETAPA: box ? 'BOX' : 'FILA', BOX: box ? String(box) : '', CARREGADA_EM: '', CARREGADA_POR: '' }, 'reabriu');
      recado = 'Carga ' + atual.n + ' reaberta' + (box ? ' no box ' + box : ' no pátio') + '.';
    } else {
      excluir('CARGA_CARREGAMENTO', atual.id, quem);
      recado = 'Carga ' + atual.n + ' tirada do pátio.';
    }
  });
  esquecerLeituras();
  return { ok: true, id: idFinal, patio: cgPatioDaTela_(cgCargasDoUltimo_()), g: cgGeracao_(), recado: recado };
}

/* BLOQUEAR / LIBERAR UM BOX. params: { numero, estado: 'BLOQUEADO' | 'LIVRE', obs } */
function acaoBoxCarga(usuario, params) {
  const p = params || {};
  const n = cgNBoxes_(), numero = Number(p.numero);
  if (!(numero >= 1 && numero <= n && Math.floor(numero) === numero)) throw new Error('Box de 1 a ' + n + '.');
  const estado = String(p.estado || '').toUpperCase() === 'BLOQUEADO' ? 'BLOQUEADO' : 'LIVRE';
  const obs = cgTexto_(p.obs, 120);
  comTrava(function () {
    if (estado === 'BLOQUEADO' && cgCarregamentos_().some(function (x) { return x.box === numero && x.etapa !== 'CARREGADA'; })) {
      throw new Error('O box ' + numero + ' tem carga: tire as cargas dele (de volta ao pátio) antes de bloquear.');
    }
    const g = cgBoxesGravados_()[numero];
    const campos = { NUMERO: String(numero), ESTADO: estado, OBSERVACAO: estado === 'BLOQUEADO' ? obs : '' };
    if (g) atualizar('CARGA_BOXES', g.id, campos, usuario.email); else inserir('CARGA_BOXES', campos, usuario.email);
  });
  esquecerLeituras();
  return { ok: true, patio: cgPatioDaTela_(cgCargasDoUltimo_()), g: cgGeracao_(),
    recado: 'Box ' + numero + (estado === 'BLOQUEADO' ? ' bloqueado' + (obs ? ' (' + obs + ')' : '') : ' liberado') + '.' };
}

/*
 * IMPORTAR DA PLANILHA ANTIGA (uma vez, para comecar com o estado de hoje). params: { link }.
 * So LE a planilha (abas Controle e Situacao dos BOXs). Cada linha do Controle vira um carregamento
 * (a carga que ja esta aberta no GSL fica como esta; a CARREGADA = SIM nao entra); a carga que so
 * aparece no quadro dos boxes entra no box dela. Numero curto casa com a carga do PDF que termina nele.
 */
function acaoImportarBoxesCarga(usuario, params) {
  const link = String((params && params.link) || '').trim();
  const m = link.match(/\/d\/([\w-]{20,})/);
  const id = m ? m[1] : (/^[\w-]{20,}$/.test(link) ? link : '');
  if (!id) throw new Error('Cole o link da planilha antiga dos boxes (uma planilha do Google).');
  exigirPorta_();
  let lido;
  try { lido = cgLerPlanilhaBoxes_(id); }
  catch (e) { throw new Error('Não consegui abrir a planilha. A conta dona do GSL precisa ter acesso a ela (só leitura basta).'); }
  if (!lido.abas.controle && !lido.abas.situacao) throw new Error('A planilha "' + lido.fonte.nome + '" não tem a aba Controle (CARGA, BOX...) nem a Situação dos BOXs.');
  const quem = usuario.email, nomeQuem = cgTexto_(usuario.nome || quem, 60);
  let novos = 0, pulados = 0;
  comTrava(function () {
    const agora = cgAgoraIso_();
    const cargas = cgCargasDoUltimo_(), nBoxes = cgNBoxes_(), lista = cgSituacoesBox_();
    const abertas = {};
    cgCarregamentos_().forEach(function (x) { if (x.etapa !== 'CARREGADA') abertas[x.n] = true; });
    const boxDoQuadro = {};
    (lido.boxes || []).forEach(function (b) { b.cargas.forEach(function (curto) { const r = cgResolverCarga_(curto, cargas); if (r.n) boxDoQuadro[r.n] = { box: b.numero, ocupado: b.estado === 'OCUPADO', veiculo: b.veiculo }; }); });
    const linhas = [];
    const novo = function (n, campos) {
      if (abertas[n]) { pulados++; return; }
      abertas[n] = true;
      linhas.push(campos); novos++;
    };
    (lido.controle || []).forEach(function (r) {
      if (r.carregadaSim) return;
      const res = cgResolverCarga_(r.carga, cargas);
      if (!res.n) { pulados++; return; }
      const q = boxDoQuadro[res.n];
      let box = Number(r.box) || (q ? q.box : 0);
      if (!(box >= 1 && box <= nBoxes)) box = 0;
      const situacao = cgSituacaoDaLista_(r.obs, lista);
      const noBox = box && ((q && q.ocupado) || ['JA NO BOX', 'CARREGANDO'].indexOf(cgObsNorm_(r.obs)) !== -1);
      const chegada = cgHoraParaIso_(r.chegada, agora) || (noBox ? agora : '');
      const c = cargas.filter(function (x) { return x.n === res.n; })[0];
      novo(res.n, { CARGA: res.n, COMPLEMENTO: cgTexto_(r.complemento, 40), PRIORIDADE: cgTexto_(r.prioridade, 20), BOX: box ? String(box) : '',
        VEICULO: cgTexto_(r.carro, 30).toUpperCase(), TIPO_VEICULO: cgTipoConhecido_(r.carro) || (q ? cgTipoConhecido_(q.veiculo) : '') || (c ? cgTipoConhecido_(c.v) : ''),
        MOTORISTA: cgTexto_(r.motorista, 60), SITUACAO: situacao,
        ETAPA: cgObsNorm_(r.obs) === 'CARREGANDO' && box ? 'CARREGANDO' : (box ? 'BOX' : 'FILA'),
        CHEGADA: chegada, NO_BOX_EM: noBox ? chegada : '', OBSERVACAO: situacao ? '' : cgTexto_(r.obs, 300),
        HISTORICO: cgHist_(null, nomeQuem, 'importou da planilha antiga (linha ' + r.linha + ')', agora) });
    });
    Object.keys(boxDoQuadro).forEach(function (n) {
      const q = boxDoQuadro[n];
      if (!(q.box >= 1 && q.box <= nBoxes)) return;
      const c = cargas.filter(function (x) { return x.n === n; })[0];
      novo(n, { CARGA: n, BOX: String(q.box), VEICULO: '', TIPO_VEICULO: cgTipoConhecido_(q.veiculo) || (c ? cgTipoConhecido_(c.v) : ''), ETAPA: 'BOX',
        CHEGADA: q.ocupado ? agora : '', NO_BOX_EM: q.ocupado ? agora : '', SITUACAO: q.ocupado ? (cgSituacaoDaLista_('JÁ NO BOX', lista) || '') : '',
        HISTORICO: cgHist_(null, nomeQuem, 'importou do quadro dos boxes da planilha antiga', agora) });
    });
    if (linhas.length) inserirVarios('CARGA_CARREGAMENTO', linhas, quem);
  });
  esquecerLeituras();
  return { ok: true, patio: cgPatioDaTela_(cgCargasDoUltimo_()), g: cgGeracao_(),
    recado: novos + (novos === 1 ? ' carga importada' : ' cargas importadas') + ' da planilha "' + lido.fonte.nome + '"' + (pulados ? ' (' + pulados + ' já estavam no GSL ou sem número)' : '') + '. A planilha não foi alterada.' };
}

/* ---- planilha antiga dos boxes (so para Importar) ---- */
/* A planilha inteira (texto como aparece na tela), aba por aba. */
function cgLerPlanilhaBoxes_(id) {
  exigirPorta_();
  const ss = SpreadsheetApp.openById(id);
  const abas = ss.getSheets().slice(0, 12).map(function (aba) {
    const nl = Math.min(800, Math.max(1, aba.getLastRow())), nc = Math.min(60, aba.getMaxColumns(), Math.max(1, aba.getLastColumn()));
    return { nome: aba.getName(), valores: aba.getRange(1, 1, nl, nc).getDisplayValues() };
  });
  const lido = cgInterpretarBoxes_(abas);
  lido.fonte = { nome: ss.getName(), url: ss.getUrl() };
  return lido;
}

/*
 * PURA: as abas da planilha -> { controle: [...], boxes: [...], abas, avisos }. Tolerante: acha as abas e os
 * cabecalhos pelo nome (sem acento nem maiuscula) e a linha dos numeros dos boxes pelo conteudo.
 *   Controle: CARGA | COMPLEMENTO | PRIORIDADE | BOX | CARRO | DESCRICAO | MOTORISTA | CARREGADA? | OBSERVACAO | HORARIO CHEGADA
 *   Situacao dos BOXs: a linha com os numeros dos boxes (26 ... 1), embaixo "Livre"/"Ocupado", embaixo as
 *   cargas (numeros curtos separados por espaco) e, em cima, o veiculo de cada box.
 */
function cgInterpretarBoxes_(abas) {
  const nn = function (v) { return cgNorm_(v).replace(/[^A-Z0-9?]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  const saida = { controle: [], boxes: [], abas: { controle: '', situacao: '' }, avisos: [] };
  const COLS = [
    ['carga', [/^CARGA$/, /^(N|NO|NRO|NUM|NUMERO) (DA )?CARGA$/, /^CARGAS?\b/]], ['complemento', [/^COMPLEMENTO/]], ['prioridade', [/^PRIORIDADE/]],
    ['box', [/^BOX$/, /^BOX\b/, /^DOCA/]], ['carro', [/^CARRO$/, /^VEICULO/, /^CARRO\b/, /^PLACA/]], ['descricao', [/^DESCRICAO/, /^DESCR/]],
    ['motorista', [/^MOTORISTA/]], ['carregada', [/^CARREGAD/]], ['obs', [/^OBSERVAC/, /^OBS\b/]], ['chegada', [/CHEGADA/, /^HORARIO/, /^HORA\b/]]
  ];
  const acharCabecalho = function (valores) {
    for (let l = 0; l < Math.min(15, valores.length); l++) {
      const linha = (valores[l] || []).map(nn);
      if (!linha.some(function (c) { return /\bCARGA/.test(c); }) || !linha.some(function (c) { return /^(BOX|DOCA)/.test(c); })) continue;
      const col = {}, usada = {};
      COLS.forEach(function (x) {
        x[1].some(function (re) {
          let j = -1;
          for (let i = 0; i < linha.length; i++) if (!usada[i] && re.test(linha[i])) { j = i; break; }
          if (j === -1) return false;
          col[x[0]] = j; usada[j] = true; return true;
        });
      });
      if (col.carga != null) return { linha: l, col: col };
    }
    return null;
  };
  const ehControle = function (a) { return /CONTROLE/.test(nn(a.nome)) ? 1 : 0; };
  const ordemControle = abas.slice().sort(function (a, b) { return ehControle(b) - ehControle(a); });
  let controle = null;
  ordemControle.some(function (aba) { const c = acharCabecalho(aba.valores || []); if (c) { controle = { aba: aba, cab: c }; return true; } return false; });
  if (controle) {
    saida.abas.controle = controle.aba.nome;
    const col = controle.cab.col;
    const v = function (linha, k) { return col[k] == null ? '' : String(linha[col[k]] == null ? '' : linha[col[k]]).replace(/\s+/g, ' ').trim(); };
    controle.aba.valores.slice(controle.cab.linha + 1).forEach(function (linha, i) {
      const numeros = v(linha, 'carga').split(/[^\d]+/).filter(function (x) { return x.length >= 2; });
      if (!numeros.length) return;
      const base = { complemento: v(linha, 'complemento'), prioridade: v(linha, 'prioridade'), box: v(linha, 'box').replace(/[^\d]+/g, ''),
        carro: v(linha, 'carro'), descricao: v(linha, 'descricao'), motorista: v(linha, 'motorista'), carregada: v(linha, 'carregada'),
        obs: v(linha, 'obs'), chegada: v(linha, 'chegada'), linha: controle.cab.linha + i + 2 };
      base.obsCat = cgCategoriaObs_(base.obs);
      base.carregadaSim = /^(S|SIM|OK|X|CARREGAD)\b/.test(nn(base.carregada));
      numeros.forEach(function (n) { saida.controle.push(Object.assign({ carga: n }, base)); });
    });
    ['box', 'obs'].forEach(function (k) { if (col[k] == null) saida.avisos.push('Aba "' + controle.aba.nome + '": não achei a coluna ' + (k === 'box' ? 'BOX' : 'OBSERVAÇÃO') + '.'); });
  } else saida.avisos.push('Não achei a aba "Controle" (cabeçalho com CARGA e BOX).');

  // Situacao dos boxes: a linha com mais numeros de box, a de Livre/Ocupado logo abaixo e as cargas embaixo dela.
  const ehBox = function (t) { return /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 99; };
  const pesoSit = function (x) { const t = nn(x.nome); return (/SITUAC/.test(t) ? 2 : 0) + (/BOX/.test(t) ? 1 : 0); };
  const candidatas = abas.filter(function (a) { return !controle || a !== controle.aba; }).sort(function (a, b) { return pesoSit(b) - pesoSit(a); });
  let achou = null;
  candidatas.some(function (aba) {
    const val = aba.valores || [];
    let melhor = -1, nMelhor = 0;
    for (let l = 0; l < Math.min(40, val.length); l++) {
      const n = (val[l] || []).filter(function (c) { return ehBox(String(c).trim()); }).length;
      if (n > nMelhor) { nMelhor = n; melhor = l; }
    }
    if (nMelhor < 3) return false;
    achou = { aba: aba, linha: melhor };
    return true;
  });
  if (achou) {
    const val = achou.aba.valores, L = achou.linha;
    saida.abas.situacao = achou.aba.nome;
    let lStatus = -1, nStatus = 0;
    for (let l = L + 1; l <= Math.min(val.length - 1, L + 3); l++) {
      const n = (val[l] || []).filter(function (c) { return /^(LIVRE|OCUPAD)/.test(nn(c)); }).length;
      if (n > nStatus) { nStatus = n; lStatus = l; }
    }
    if (lStatus === -1) saida.avisos.push('Aba "' + achou.aba.nome + '": não achei a linha com Livre/Ocupado embaixo dos números dos boxes.');
    const lCargas = lStatus === -1 ? L + 1 : lStatus + 1;
    const vistos = {};
    (val[L] || []).forEach(function (c, j) {
      const t = String(c).trim();
      if (!ehBox(t) || vistos[t]) return;
      vistos[t] = true;
      const st = lStatus === -1 ? '' : nn((val[lStatus] || [])[j]);
      const cargasTxt = lCargas < val.length ? String((val[lCargas] || [])[j] || '') : '';
      saida.boxes.push({ numero: +t, estado: /^OCUPAD/.test(st) ? 'OCUPADO' : (/^LIVRE/.test(st) ? 'LIVRE' : ''),
        veiculo: L > 0 ? String((val[L - 1] || [])[j] || '').replace(/\s+/g, ' ').trim() : '',
        cargas: cargasTxt.split(/[^\d]+/).filter(function (x) { return x.length >= 2; }) });
    });
  } else saida.avisos.push('Não achei a aba "Situação dos BOXs" (a linha com os números dos boxes).');
  return saida;
}

/* ------------------------------------------------------------------ */
/* PASSAGEM DE TURNO (CARGA_PASSAGEM)                                  */
/* ------------------------------------------------------------------ */

/* O retrato para quem entra: cargas abertas (24 h primeiro) e o gargalo de cada, alocacao, manutencao, faltas. */
function cgResumoPassagem_(cargas, equipe, equipamentos, faltas) {
  const abertas = cargas.map(function (c) { const e = cgEstadoCarga_(c); return { n: c.n, nm: c.nm, h: c.h ? 1 : 0, bx: c.bx || '', pct: e.pct, estado: e.estado, gargalo: e.gargalo, gargaloPct: e.gargaloPct }; })
    .filter(function (x) { return x.estado === 'andamento' || x.estado === 'naoIniciada'; })
    .sort(function (a, b) { return (b.h - a.h) || (a.pct - b.pct) || String(a.n).localeCompare(String(b.n)); });
  const alocacao = {};
  CG_DEPOSITOS.forEach(function (d) { alocacao[d.id] = { sep: 0, conf: 0 }; });
  equipe.forEach(function (p) { const x = alocacao[p.dep]; if (x) x[p.papel === 'CONFERENTE' ? 'conf' : 'sep']++; });
  const consumo = cgConsumoEquip_(equipe, equipamentos);
  return {
    abertas: abertas.length, h24: abertas.filter(function (x) { return x.h; }).length, cargas: abertas.slice(0, 20),
    alocacao: alocacao, pessoas: equipe.length,
    manutencao: equipamentos.filter(function (e) { return e.estado === 'MANUTENCAO'; }).map(function (e) { return { tipo: e.tipo, numero: e.numero, obs: e.obs || '' }; }),
    faltam: { PALETEIRA: consumo.PALETEIRA.falta, CHECKOUT: consumo.CHECKOUT.falta },
    faltas: faltas.map(function (f) { return { nome: f.nome, equipe: f.equipe }; })
  };
}
function cgPassagens_() {
  return listar('CARGA_PASSAGEM').map(function (r) {
    return { id: r.ID, data: String(r.DATA || ''), sai: String(r.TURNO_SAI || ''), entra: String(r.TURNO_ENTRA || ''), resumo: cgJson_(r.RESUMO, null),
      confirmadoPor: String(r.CONFIRMADO_POR || ''), confirmadoNome: String(r.CONFIRMADO_NOME || ''), confirmadoEm: String(r.CONFIRMADO_EM || ''),
      cientePor: String(r.CIENTE_POR || ''), cienteNome: String(r.CIENTE_NOME || ''), cienteEm: String(r.CIENTE_EM || ''), obs: String(r.OBSERVACAO || '') };
  }).sort(function (a, b) { return (b.confirmadoEm || '').localeCompare(a.confirmadoEm || ''); }).slice(0, 12);
}
/*
 * PASSAGEM. params: { op: 'confirmar' | 'ciente', sai, entra, obs }.
 *   confirmar  quem sai grava o retrato de agora (de novo = substitui, e o "ciente" volta a faltar)
 *   ciente     quem entra marca que leu. DATA = o dia do turno que entra.
 */
function acaoPassagemCarga(usuario, params) {
  const p = params || {};
  const op = String(p.op || '');
  const sai = String(p.sai || '').toUpperCase(), entra = String(p.entra || '').toUpperCase();
  if (['A', 'B', 'C'].indexOf(sai) === -1 || ['A', 'B', 'C'].indexOf(entra) === -1 || sai === entra) throw new Error('Diga o turno que sai e o que entra (A, B ou C).');
  if (op !== 'confirmar' && op !== 'ciente') throw new Error('Operação desconhecida na passagem de turno.');
  const quem = usuario.email, nome = cgTexto_(usuario.nome || quem, 80);
  let recado = '';
  comTrava(function () {
    const turnos = cgTurnos_(), agora = cgAgoraIso_();
    const data = cgDiaDoTurno_(entra, agora, turnos);
    const linha = listar('CARGA_PASSAGEM').filter(function (r) { return String(r.DATA) === data && String(r.TURNO_SAI) === sai && String(r.TURNO_ENTRA) === entra; })[0];
    if (op === 'confirmar') {
      const ult = cgSnapshots_()[0];
      const resumo = cgResumoPassagem_(ult ? cgCargasDe_(ult) : [], cgEquipe_(), cgEquipamentos_(), cgFaltas_(turnos, agora));
      resumo.emitido = ult ? cgIso_(ult.EMITIDO_EM) : '';
      const campos = { DATA: data, TURNO_SAI: sai, TURNO_ENTRA: entra, RESUMO: JSON.stringify(resumo), CONFIRMADO_POR: quem, CONFIRMADO_NOME: nome,
        CONFIRMADO_EM: agora, CIENTE_POR: '', CIENTE_NOME: '', CIENTE_EM: '', OBSERVACAO: cgTexto_(p.obs, 400) };
      if (linha) atualizar('CARGA_PASSAGEM', linha.ID, campos, quem); else inserir('CARGA_PASSAGEM', campos, quem);
      recado = 'Passagem do turno ' + sai + ' para o ' + entra + ' confirmada. Falta o turno ' + entra + ' marcar "Ciente".';
    } else {
      if (!linha) throw new Error('O turno ' + sai + ' ainda não confirmou a passagem para o ' + entra + '.');
      if (linha.CIENTE_EM) throw new Error('Já está ciente: ' + (linha.CIENTE_NOME || linha.CIENTE_POR) + ' às ' + String(linha.CIENTE_EM).slice(11, 16) + '.');
      atualizar('CARGA_PASSAGEM', linha.ID, { CIENTE_POR: quem, CIENTE_NOME: nome, CIENTE_EM: agora }, quem);
      recado = 'Ciente da passagem do turno ' + sai + ' para o ' + entra + '.';
    }
  });
  esquecerLeituras();
  return { ok: true, passagens: cgPassagens_(), g: cgGeracao_(), recado: recado };
}
