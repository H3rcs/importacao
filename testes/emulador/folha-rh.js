/*
 * Monta, no Drive do emulador, uma FOLHA DE PONTO no formato da do RH:
 * "DATA INICIAL" no alto, cabecalho MATRICULA | NOME | T. | dias (numero do
 * dia, 21 22 ... 31 01 ... 20) e uma linha por colaborador com o codigo de
 * cada dia (a sigla do turno = dia trabalhado). Devolve o link.
 *
 *   folhaRH(mundo, 'Folha agosto', {
 *     inicio: [2025, 7, 21], dias: 31,
 *     pessoas: [{ mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-05': '16' } }]
 *   })
 *
 * Opcoes:
 *   blocos: [{ pessoas: [...] }, ...]   um cabecalho por bloco (um por turno, como na folha real)
 *   cabDias: [21, ..., 31, 1, ..., 20]  numeros de dia explicitos (modelo fixo de 31 colunas)
 *   cabecalhoComData: true              o cabecalho traz a data, nao o numero do dia
 *   matComoNumero: true                 a matricula foi digitada/convertida em numero
 *   matComoTexto: true                  a coluna de matricula esta como texto (mantem zero a esquerda)
 * Por pessoa: dias { 'aaaa-mm-dd': codigo } e soDias [iso...] (so esses dias preenchidos).
 */
'use strict';
function folhaRH(mundo, nome, o) {
  const p = mundo.novaPlanilha(nome);
  const aba = p.abas[0];
  aba.nome = o.aba || 'FOLHA DE PONTO';
  const blocos = o.blocos || [{ pessoas: o.pessoas }];
  const [a, m, d] = o.inicio;
  const ini = new Date(a, m - 1, d);
  const datas = [], cab = [];
  if (o.cabDias) {
    let ano = a, mes = m - 1, ant = 0;
    o.cabDias.forEach((dia, i) => {
      if (i > 0 && dia < ant) { mes++; if (mes > 11) { mes = 0; ano++; } }
      ant = dia;
      datas.push(new Date(ano, mes, dia)); cab.push(dia);
    });
  } else {
    for (let i = 0; i < o.dias; i++) {
      const dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i);
      datas.push(dt); cab.push(o.cabecalhoComData ? new Date(dt) : dt.getDate());
    }
  }
  aba.maxC = Math.max(aba.maxC, 3 + datas.length + 5);
  aba.maxL = Math.max(aba.maxL, 20 + blocos.reduce((n, b) => n + b.pessoas.length + 4, 0));
  if (o.matComoTexto) aba.formatoColuna.set(0, '@');

  const iso = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  aba.gravar(0, 0, 'BARTOFIL DISTRIBUIDORA — FOLHA DE PONTO');
  aba.gravar(2, 0, 'DATA INICIAL');
  aba.gravar(2, 1, new Date(a, m - 1, d));
  let L = 5;                                   // linha 6 da planilha
  blocos.forEach((b) => {
    datas.forEach((dt, i) => aba.gravar(L - 1, 3 + i, ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dt.getDay()]));
    aba.gravar(L, 0, 'MATRICULA'); aba.gravar(L, 1, 'NOME'); aba.gravar(L, 2, 'T.');
    cab.forEach((c, i) => aba.gravar(L, 3 + i, c));
    b.pessoas.forEach((pe, k) => {
      const r = L + 1 + k;
      aba.gravar(r, 0, o.matComoNumero ? Number(pe.mat) : pe.mat);
      aba.gravar(r, 1, pe.nome);
      aba.gravar(r, 2, pe.turno);
      datas.forEach((dt, i) => {
        const k2 = iso(dt);
        let cod;
        if (pe.soDias) cod = pe.soDias.indexOf(k2) >= 0 ? ((pe.dias && pe.dias[k2]) || pe.turno) : '';
        else cod = (pe.dias && pe.dias[k2]) || (dt.getDay() === 0 ? '' : pe.turno);
        if (cod) aba.gravar(r, 3 + i, cod);
      });
    });
    L = L + 1 + b.pessoas.length;
    aba.gravar(L, 0, 'HORAS TRABALHADAS');
    L += 3;
  });
  return 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit';
}
module.exports = { folhaRH };
