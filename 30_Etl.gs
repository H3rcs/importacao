/*******************************************************************************
 * 30_Etl.gs — orquestração da importação
 *
 * Estratégia: RECARGA DA JANELA. Cada execução reconstrói os fatos daquela fonte
 * dentro da janela de dias configurada. Isso resolve de uma vez três problemas
 * que o "só inserir o que é novo" não resolve: correção retroativa do RH,
 * exclusão de linha na origem e execução repetida do gatilho.
 *
 * Nada é apagado antes de a leitura da origem terminar com sucesso.
 ******************************************************************************/

var COLS_FATOS = 15;
var COLS_METAS = 11;

function etlIncremental() { executarEtl_(false, false); }
function importarAgora()  { executarEtl_(false, true); }
function reprocessarTudo() { executarEtl_(true, true); }

function executarEtl_(completo, interativo) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    if (interativo) ui_('Já existe uma importação em andamento. Tente em um minuto.');
    return;
  }
  try {
    _cache = {};
    var cfgs = fontes_();
    var d = dims_();
    var limiar = paramNum_('Limiar de similaridade', 0.88);
    var carimbo = agora_();

    var pendencias = [];
    var fatosNovos = [];
    var metasNovas = [];
    var processadas = {};
    var resumo = [];
    var falhas = [];

    FONTES_VALIDAS.forEach(function (nome) {
      var cfg = cfgs[nome];
      if (!cfg || !cfg.ativa) {
        gravarSync_(nome, '', 0, 0, 0, 'PAUSADA', 'Fonte desativada na aba FONTES.');
        return;
      }
      if (completo) cfg.janela = 3650;

      var regs;
      try {
        regs = lerFonte_(cfg);
      } catch (e) {
        falhas.push(nome + ': ' + e.message);
        gravarSync_(nome, carimbo, 0, 0, 0, 'ERRO', e.message);
        return;                       // aborta esta fonte, preserva o que já existe
      }

      gravarStaging_(nome, regs);
      processadas[nome] = cfg;

      var r = (nome === 'METAS')
        ? transformarMetas_(regs, d, carimbo, metasNovas)
        : transformarOcorrencias_(regs, d, limiar, carimbo, fatosNovos, pendencias);

      gravarSync_(nome, carimbo, regs.length, r.gerados, r.ignorados,
                  r.pendentes ? 'ATENÇÃO' : 'OK',
                  r.pendentes ? r.pendentes + ' linha(s) em PENDENCIAS' : 'Importação normal.');
      resumo.push(nome + ': ' + regs.length + ' lidas, ' + r.gerados + ' fatos, ' +
                  r.pendentes + ' pendências');
    });

    if (processadas['RH'] || processadas['ERROS']) {
      aplicarFatos_(fatosNovos, processadas, completo);
    }
    if (processadas['METAS']) {
      aplicarMetas_(metasNovas);
    }
    var totalPend = gravarPendencias_(pendencias);
    atualizarPendenciasSync_();

    log_('Importação', completo ? 'reprocessamento total' : 'janela',
         '', resumo.join(' · '), totalPend + ' pendências na fila');

    if (falhas.length) avisarFalha_(falhas);
    if (interativo) {
      ui_(resumo.join('\n') + '\n\nPendências na fila: ' + totalPend +
          (falhas.length ? '\n\nFALHAS:\n' + falhas.join('\n') : ''));
    }
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------ transformação */

function transformarOcorrencias_(regs, d, limiar, carimbo, saida, pendencias) {
  var gerados = 0, ignorados = 0, pendentes = 0;

  regs.forEach(function (reg) {
    // 1 · código -> tipo canônico
    var info = null;
    if (reg.codigo) {
      info = d.codigos[norm_(reg.origem) + '|' + norm_(reg.codigo)];
      if (!info) {
        novaPendencia_(pendencias, reg, { tipo: 'codigo', valor: reg.codigo, sugestao: '', sim: '' });
        pendentes++; return;
      }
    } else if (reg.origem === 'ERROS') {
      info = { tipo: 'Erro operacional', unidade: 'EVENTO', score: true, gravidade: 1 };
    } else {
      novaPendencia_(pendencias, reg, { tipo: 'codigo', valor: '(código em branco)', sugestao: '', sim: '' });
      pendentes++; return;
    }
    if (!info.tipo || norm_(info.tipo) === 'IGNORAR') { ignorados++; return; }

    // 2 · pessoa
    var rp = resolverPessoa_(reg, d, limiar);
    if (rp.pendencia) { novaPendencia_(pendencias, reg, rp.pendencia); pendentes++; return; }
    var pessoa = rp.pessoa || null;

    // 3 · turno (o da data do fato, não o de hoje)
    var turno = reg.turno;
    if (!turno && pessoa) turno = turnoNaData_(pessoa.matricula, reg.data, d);
    if (!turno) {
      novaPendencia_(pendencias, reg, {
        tipo: 'turno',
        valor: (pessoa ? pessoa.nome : reg.colaborador || reg.setor) + ' em ' + fmtData_(reg.data),
        sugestao: '', sim: ''
      });
      pendentes++; return;
    }

    // 4 · setor
    var setor = resolverSetor_(reg.setor, d) || (pessoa ? pessoa.setor : '');

    // 5 · quantidade
    var qtde = reg.qtde;
    if (qtde === null || qtde === undefined || qtde === '') qtde = 1;
    if (qtde <= 0) { ignorados++; return; }

    saida.push([
      reg.data, info.tipo, turno, setor, qtde,
      pessoa ? pessoa.matricula : '', pessoa ? pessoa.nome : '',
      reg.descricao, semanaISO_(reg.data), primeiroDoMes_(reg.data), anoISO_(reg.data),
      reg.origem, reg.linhaOrig, reg.hash, carimbo
    ]);
    gerados++;
  });

  return { gerados: gerados, ignorados: ignorados, pendentes: pendentes };
}

function transformarMetas_(regs, d, carimbo, saida) {
  var gerados = 0, ignorados = 0;
  regs.forEach(function (reg) {
    if (reg.meta === null && reg.realizado === null) { ignorados++; return; }
    var meta = reg.meta === null ? 0 : reg.meta;
    var real = reg.realizado === null ? 0 : reg.realizado;
    saida.push([
      primeiroDoMes_(reg.data), resolverSetor_(reg.setor, d), reg.turno, reg.indicador,
      meta, real, meta ? real / meta : '',
      reg.origem, reg.linhaOrig, reg.hash, carimbo
    ]);
    gerados++;
  });
  return { gerados: gerados, ignorados: ignorados, pendentes: 0 };
}

/* -------------------------------------------------------------- persistência */

/** Substitui os fatos das fontes processadas dentro da janela e mantém o resto. */
function aplicarFatos_(novos, processadas, completo) {
  var sh = aba_('FATOS');
  var ultima = sh.getLastRow();
  var mantidos = [];

  if (ultima > 1) {
    var vals = sh.getRange(2, 1, ultima - 1, COLS_FATOS).getValues();
    mantidos = vals.filter(function (l) {
      if (!l[0]) return false;
      var origem = String(l[11] || '');
      var cfg = processadas[origem];
      if (!cfg) return true;                       // fonte não processada agora
      if (completo) return false;                  // reprocessamento total
      var limite = new Date();
      limite.setDate(limite.getDate() - cfg.janela);
      limite.setHours(0, 0, 0, 0);
      return new Date(l[0]) < limite;              // fora da janela recarregada
    });
  }

  var final = mantidos.concat(novos);
  final.sort(function (a, b) { return new Date(a[0]) - new Date(b[0]); });

  if (ultima > 1) sh.getRange(2, 1, ultima - 1, COLS_FATOS).clearContent();
  if (final.length) sh.getRange(2, 1, final.length, COLS_FATOS).setValues(final);
}

/** Metas são pequenas e vêm sempre inteiras: substituição total. */
function aplicarMetas_(novas) {
  var sh = aba_('FATOS_METAS');
  var ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, COLS_METAS).clearContent();
  if (novas.length) sh.getRange(2, 1, novas.length, COLS_METAS).setValues(novas);
}

/* --------------------------------------------------------------------- SYNC */

/** Recalcula a coluna PENDENCIAS da aba SYNC depois que a fila é gravada. */
function atualizarPendenciasSync_() {
  var sh = aba_('SYNC');
  var vals = sh.getDataRange().getValues();
  var shp = aba_('PENDENCIAS');
  var porFonte = {};
  if (shp.getLastRow() > 1) {
    shp.getRange(2, 1, shp.getLastRow() - 1, 1).getValues().forEach(function (l) {
      var f = norm_(l[0]);
      if (f) porFonte[f] = (porFonte[f] || 0) + 1;
    });
  }
  for (var i = 1; i < vals.length; i++) {
    var f = norm_(vals[i][0]);
    if (f) sh.getRange(i + 1, 6).setValue(porFonte[f] || 0);
  }
}

function gravarSync_(fonte, quando, lidas, gerados, ignorados, status, msg) {
  var sh = aba_('SYNC');
  var vals = sh.getDataRange().getValues();
  var linha = -1;
  for (var i = 1; i < vals.length; i++) if (norm_(vals[i][0]) === norm_(fonte)) { linha = i + 1; break; }
  if (linha < 0) linha = Math.max(sh.getLastRow() + 1, 2);

  var pend = 0;
  var shp = ss_().getSheetByName('PENDENCIAS');
  if (shp && shp.getLastRow() > 1) {
    pend = shp.getRange(2, 1, shp.getLastRow() - 1, 1).getValues()
      .filter(function (l) { return norm_(l[0]) === norm_(fonte); }).length;
  }
  sh.getRange(linha, 1, 1, 8).setValues([[fonte, quando || '', lidas, gerados, ignorados,
                                          pend, status, msg]]);
}
