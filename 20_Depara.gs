/*******************************************************************************
 * 20_Depara.gs — tradução: nome → matrícula, código → tipo, setor → setor oficial
 *
 * Regra inegociável: similaridade NUNCA grava sozinha. Um match errado de nome
 * vira advertência disciplinar na pessoa errada. O duvidoso vai para PENDENCIAS.
 ******************************************************************************/

/** Carrega as dimensões uma vez por execução. */
function dims_() {
  if (_cache.dims) return _cache.dims;

  var d = { pessoasPorMat: {}, pessoasPorNome: {}, nomes: [], turnos: {},
            codigos: {}, setores: {} };

  // --- DIM_PESSOAS
  var vp = aba_('DIM_PESSOAS').getDataRange().getValues();
  for (var i = 1; i < vp.length; i++) {
    var mat = String(vp[i][0] || '').trim();
    var nome = String(vp[i][1] || '').trim();
    if (!mat && !nome) continue;
    if (norm_(nome).indexOf('EXEMPLO') >= 0) continue;
    var p = { matricula: mat, nome: nome, setor: String(vp[i][3] || '').trim(),
              ativo: norm_(vp[i][6]) !== 'N' };
    if (mat) d.pessoasPorMat[norm_(mat)] = p;
    var apelidos = String(vp[i][2] || '').split(';').concat([nome]);
    for (var a = 0; a < apelidos.length; a++) {
      var chave = norm_(apelidos[a]);
      if (!chave) continue;
      if (!d.pessoasPorNome[chave]) { d.pessoasPorNome[chave] = p; d.nomes.push(chave); }
    }
  }

  // --- DIM_TURNO_HIST
  var vt = aba_('DIM_TURNO_HIST').getDataRange().getValues();
  for (var j = 1; j < vt.length; j++) {
    var m = norm_(vt[j][0]);
    if (!m) continue;
    if (!d.turnos[m]) d.turnos[m] = [];
    d.turnos[m].push({
      turno: paraTurno_(vt[j][1]),
      de: paraData_(vt[j][2]),
      ate: paraData_(vt[j][3])
    });
  }

  // --- DIM_CODIGOS
  var vc = aba_('DIM_CODIGOS').getDataRange().getValues();
  for (var k = 1; k < vc.length; k++) {
    var org = norm_(vc[k][0]), cod = norm_(vc[k][1]);
    if (!org || !cod) continue;
    if (norm_(vc[k][2]).indexOf('EXEMPLO') >= 0) continue;
    d.codigos[org + '|' + cod] = {
      tipo: String(vc[k][3] || '').trim(),
      unidade: norm_(vc[k][4]) || 'EVENTO',
      score: norm_(vc[k][5]) !== 'N',
      gravidade: paraNumero_(vc[k][6], 1)
    };
  }

  // --- DIM_SETORES
  var vs = aba_('DIM_SETORES').getDataRange().getValues();
  for (var s = 1; s < vs.length; s++) {
    var de = norm_(vs[s][0]), para = String(vs[s][1] || '').trim();
    if (!de || !para) continue;
    if (de.indexOf('EXEMPLO') >= 0) continue;
    d.setores[de] = para;
  }

  _cache.dims = d;
  return d;
}

/** Distância de Levenshtein normalizada (0 a 1). */
function similaridade_(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  var m = a.length, n = b.length, prev = [], cur = [], i, j;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    cur[0] = i;
    for (j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    for (j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return 1 - (prev[n] / Math.max(m, n));
}

/**
 * Resolve a pessoa. Devolve {pessoa} ou {pendencia:{...}} ou {vazio:true}.
 */
function resolverPessoa_(reg, d, limiar) {
  if (reg.matricula) {
    var p = d.pessoasPorMat[norm_(reg.matricula)];
    if (p) return { pessoa: p };
  }
  var chave = norm_(reg.colaborador);
  if (!chave) {
    // Sem matrícula e sem nome: aceitável em erros lançados por setor.
    return reg.matricula
      ? { pendencia: { tipo: 'pessoa', valor: reg.matricula, sugestao: '', sim: 0 } }
      : { vazio: true };
  }
  if (d.pessoasPorNome[chave]) return { pessoa: d.pessoasPorNome[chave] };

  var melhor = '', score = 0, empate = false;
  for (var i = 0; i < d.nomes.length; i++) {
    var s = similaridade_(chave, d.nomes[i]);
    if (s > score) { score = s; melhor = d.nomes[i]; empate = false; }
    else if (s === score && s > 0) { empate = true; }
  }
  var sugestao = (score >= limiar && !empate && melhor) ? d.pessoasPorNome[melhor].nome : '';
  return { pendencia: { tipo: 'pessoa', valor: reg.colaborador, sugestao: sugestao,
                        sim: Math.round(score * 100) / 100 } };
}

/** Turno vigente na data do fato (a falta pertence ao turno da época). */
function turnoNaData_(matricula, data, d) {
  var lista = d.turnos[norm_(matricula)];
  if (!lista) return '';
  for (var i = 0; i < lista.length; i++) {
    var v = lista[i];
    if (!v.turno) continue;
    var depois = !v.de || data >= v.de;
    var antes = !v.ate || data <= v.ate;
    if (depois && antes) return v.turno;
  }
  return '';
}

function resolverSetor_(bruto, d) {
  var chave = norm_(bruto);
  if (!chave) return '';
  return d.setores[chave] || String(bruto).trim();
}

/** Acumula pendências em memória; são gravadas de uma vez ao fim da execução. */
function novaPendencia_(buffer, reg, p) {
  buffer.push([reg.origem, reg.linhaOrig, p.tipo, p.valor, p.sugestao || '',
               p.sim || '', '', '']);
}

/** Regrava a aba PENDENCIAS preservando as linhas que já têm AÇÃO preenchida. */
function gravarPendencias_(novas) {
  var sh = aba_('PENDENCIAS');
  var ultima = sh.getLastRow();
  var mantidas = [];
  if (ultima > 1) {
    var vals = sh.getRange(2, 1, ultima - 1, 8).getValues();
    mantidas = vals.filter(function (l) {
      var temAcao = String(l[6] || '').trim() !== '';
      var exemplo = norm_(l[3]).indexOf('EXEMPLO') >= 0;
      return temAcao && !exemplo;
    });
  }
  // não repete uma pendência que já está na fila
  var vistas = {};
  mantidas.forEach(function (l) { vistas[l[0] + '|' + l[2] + '|' + norm_(l[3])] = true; });
  var final = mantidas.slice();
  novas.forEach(function (l) {
    var k = l[0] + '|' + l[2] + '|' + norm_(l[3]);
    if (vistas[k]) return;
    vistas[k] = true;
    final.push(l);
  });

  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 8).clearContent();
  if (final.length) sh.getRange(2, 1, final.length, 8).setValues(final);
  return final.length;
}

/**
 * Menu → Resolver pendências. Aplica a coluna AÇÃO nas dimensões.
 *  - Confirmar sugestão: grava o valor não reconhecido como apelido da pessoa sugerida
 *  - Criar novo: cria a linha na dimensão correspondente, para você completar
 *  - Ignorar: apenas fecha a pendência
 */
function resolverPendencias() {
  var sh = aba_('PENDENCIAS');
  var ultima = sh.getLastRow();
  if (ultima < 2) { ui_('Não há pendências.'); return; }

  var vals = sh.getRange(2, 1, ultima - 1, 8).getValues();
  var pessoas = aba_('DIM_PESSOAS'), codigos = aba_('DIM_CODIGOS'), setores = aba_('DIM_SETORES');
  var vp = pessoas.getDataRange().getValues();
  var aplicadas = 0, restantes = [];

  vals.forEach(function (l) {
    var acao = norm_(l[6]), tipo = norm_(l[2]), valor = String(l[3] || '').trim();
    if (!acao) { restantes.push(l); return; }

    if (acao.indexOf('CONFIRMAR') === 0 && l[4]) {
      if (tipo === 'PESSOA') {
        for (var i = 1; i < vp.length; i++) {
          if (norm_(vp[i][1]) === norm_(l[4])) {
            var apelidos = String(vp[i][2] || '');
            if (norm_(apelidos).indexOf(norm_(valor)) < 0) {
              pessoas.getRange(i + 1, 3).setValue(apelidos ? apelidos + ';' + valor : valor);
            }
            break;
          }
        }
      } else if (tipo === 'SETOR') {
        setores.appendRow([valor, l[4], 'confirmado em ' + fmtData_(agora_())]);
      }
      aplicadas++;
    } else if (acao.indexOf('CRIAR') === 0) {
      if (tipo === 'PESSOA') pessoas.appendRow(['', valor, valor, '', '', '', 'S']);
      else if (tipo === 'CODIGO') codigos.appendRow([l[0], valor, '', '', 'evento', 'S', 1]);
      else if (tipo === 'SETOR') setores.appendRow([valor, valor, '']);
      aplicadas++;
    } else {
      aplicadas++;   // Ignorar
    }
    log_('Pendência resolvida', tipo + ' · ' + valor, '', String(l[6]), l[0] + ' linha ' + l[1]);
  });

  sh.getRange(2, 1, ultima - 1, 8).clearContent();
  if (restantes.length) sh.getRange(2, 1, restantes.length, 8).setValues(restantes);
  _cache.dims = null;
  ui_(aplicadas + ' pendência(s) aplicada(s). ' + restantes.length + ' aguardando ação.\n\n' +
      'Rode "Importar agora" para reprocessar com o de-para atualizado.');
}
