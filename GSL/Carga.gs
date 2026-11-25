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
 * Toda gravacao passa pelo executarAcao (capacidade GERIR_CARGA, modulo
 * carga) e pelo comTrava; o inserir/atualizar do Banco.gs grava o LOG.
 *
 * ONDE ESTAO OS DADOS (para trocar o armazenamento do "ao vivo" sem mexer
 * nas contas): so este arquivo toca nas tabelas CARGA_*. Leitura:
 * cgSnapshots_ + cgCargasDe_ (envios), cgEquipe_ (alocacao),
 * cgEquipamentos_ (paleteiras e carrinhos) e cgGeracao_ (o numero que a
 * tela pergunta). Gravacao: as acao...Carga abaixo, cada uma numa trava.
 *
 * Celulas do relatorio: "X" = pronto, "-" = o deposito nao tem nada nesta
 * carga, "a/b" = a de b tarefas feitas. A carga marcada com "*" e de 24 horas.
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
const CG_EQUIP_PADRAO = { PALETEIRA: 12, CARRINHO: 35 };
const CG_EQUIP_DONO = { CARRINHO: 'MIUDEZA' };       // carrinho e sempre da Miudeza; paleteira vai e volta do pool
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
      desde: String(r.DESDE || ''), por: String(r.ATUALIZADO_POR || r.CRIADO_POR || '') };
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
      const estado = CG_ESTADOS_EQUIP.indexOf(String(r.ESTADO)) !== -1 ? String(r.ESTADO) : 'LIVRE';
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
 * SEMENTE (instalacao, migracao 8.12 e filial nova): 12 paleteiras no pool e 35 carrinhos na Miudeza,
 * tudo livre. So quando a tabela nunca teve linha nenhuma — o que a gerencia ajustou depois fica.
 */
function semearEquipamentosCarga_() {
  if (listar('CARGA_EQUIPAMENTOS', true).length) return false;
  const linhas = [];
  Object.keys(CG_EQUIP_PADRAO).forEach(function (tipo) {
    for (let i = 1; i <= CG_EQUIP_PADRAO[tipo]; i++) linhas.push({ TIPO: tipo, DEPOSITO: CG_EQUIP_DONO[tipo] || '', NUMERO: String(i), ESTADO: 'LIVRE' });
  });
  inserirVarios('CARGA_EQUIPAMENTOS', linhas, 'sistema');
  return true;
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

function cgGeracao_() {
  return ['CARGA_SNAPSHOTS', 'CARGA_EQUIPE', 'CARGA_EQUIPAMENTOS'].map(function (t) { return geracaoTabela(t); }).join('.');
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
  const base = {
    g: cgGeracao_(),
    podeEditar: podeFazer(usuario, 'GERIR_CARGA'),
    depositos: CG_DEPOSITOS.map(function (d) { return { id: d.id, nome: d.nome, equip: d.equip, andares: d.andares || 0 }; }),
    andares: CG_ANDARES,
    filial: filialAtual().nome,
    pessoas: quadro.pessoas,
    avisoQuadro: quadro.aviso,
    fonteQuadro: quadro.fonte || '',
    equipe: equipe,
    equipamentos: cgEquipamentos_(),
    agora: cgAgoraIso_(),
    snapshot: null,
    historico: []
  };
  if (!ultimo) return base;

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
    let andar = '';
    if (d.andares && papel === 'SEPARADOR') {
      andar = Number(p.destino.andar);
      if (!(andar >= 0 && andar < d.andares && Math.floor(andar) === andar)) throw new Error('Escolha o andar do flowrack (térreo ao 4º).');
    }
    destino = { dep: d.id, papel: papel, andar: andar === '' ? '' : String(andar) };
  }
  const quem = usuario.email;
  comTrava(function () {
    const vivas = listar('CARGA_EQUIPE').filter(function (r) { return String(r.PESSOA) === k; });
    // Linha repetida (duas gravacoes da versao anterior, ou planilha mexida a mao): fica uma so.
    vivas.slice(destino ? 1 : 0).forEach(function (r) { excluir('CARGA_EQUIPE', r.ID, quem); });
    if (!destino) return;
    const campos = { PESSOA: k, NOME: nome, FUNCAO: cgTexto_(pessoa.funcao, 60), EQUIPE: cgTexto_(pessoa.equipe, 30),
      DEPOSITO: destino.dep, PAPEL: destino.papel, ANDAR: destino.andar, DESDE: cgAgoraIso_() };
    if (vivas.length) {
      const atual = vivas[0];
      if (String(atual.DEPOSITO) === destino.dep && String(atual.PAPEL) === destino.papel && String(atual.ANDAR) === destino.andar) return;
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
 * PALETEIRA OU CARRINHO: o estado de um. params: { tipo, numero, estado, dep }.
 *   paleteira: LIVRE (volta ao pool) · USO com dep (Grandeza, Nobre Grandeza, Pesaveis ou Blocado) · MANUTENCAO;
 *              sem numero e com estado USO = "pegar uma do pool" (a livre de numero mais baixo).
 *   carrinho:  LIVRE · USO · MANUTENCAO (sempre da Miudeza).
 */
function acaoEquipamentoCarga(usuario, params) {
  const p = params || {};
  const tipo = String(p.tipo || '').toUpperCase();
  if (!CG_EQUIP_PADRAO[tipo]) throw new Error('Equipamento desconhecido.');
  const estado = String(p.estado || '').toUpperCase();
  if (CG_ESTADOS_EQUIP.indexOf(estado) === -1) throw new Error('Estado inválido.');
  let dep = CG_EQUIP_DONO[tipo] || '';
  if (tipo === 'PALETEIRA' && estado === 'USO') {
    const d = CG_DEPOSITOS.filter(function (x) { return x.id === String(p.dep) && x.equip === 'PALETEIRA'; })[0];
    if (!d) throw new Error('Escolha onde a paleteira vai ser usada: Grandeza, Nobre Grandeza, Pesáveis ou Blocado.');
    dep = d.id;
  }
  const obs = estado === 'MANUTENCAO' ? cgTexto_(p.obs, 120) : '';
  const nome = tipo === 'CARRINHO' ? 'Carrinho' : 'Paleteira';
  let numero = p.numero === '' || p.numero == null ? 0 : Number(p.numero);
  comTrava(function () {
    cgMaterializar_(tipo, usuario.email);
    const todas = listar('CARGA_EQUIPAMENTOS').filter(function (r) { return String(r.TIPO) === tipo && Number(r.NUMERO) >= 1; });
    let linha;
    if (!numero) {
      linha = todas.filter(function (r) { return String(r.ESTADO || 'LIVRE') === 'LIVRE'; })
        .sort(function (a, b) { return Number(a.NUMERO) - Number(b.NUMERO); })[0];
      if (!linha) throw new Error('Nenhuma ' + nome.toLowerCase() + ' livre no pool agora.');
      numero = Number(linha.NUMERO);
    } else {
      linha = todas.filter(function (r) { return Number(r.NUMERO) === numero; })[0];
      if (!linha) throw new Error(nome + ' ' + numero + ' não existe.');
    }
    atualizar('CARGA_EQUIPAMENTOS', linha.ID, { ESTADO: estado, DEPOSITO: dep, OBSERVACAO: obs }, usuario.email);
  });
  esquecerLeituras();
  const onde = estado === 'USO' ? (tipo === 'PALETEIRA' ? 'em uso em ' + cgNomeDep_(dep) : 'em uso') : (estado === 'LIVRE' ? (tipo === 'PALETEIRA' ? 'livre no pool' : 'livre') : 'em manutenção');
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
  const nome = tipo === 'CARRINHO' ? (qtd === 1 ? 'carrinho' : 'carrinhos') + ' na Miudeza' : (qtd === 1 ? 'paleteira' : 'paleteiras') + ' no CD';
  return { ok: true, equipamentos: cgEquipamentos_(), g: cgGeracao_(), recado: qtd + ' ' + nome + '.' };
}
