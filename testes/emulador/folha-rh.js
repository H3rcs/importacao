/*
 * Monta, no Drive do emulador, uma FOLHA DE PONTO no formato da do RH:
 * "DATA INICIAL" no alto, cabecalho MATRICULA | NOME | T. | dias (numero do
 * dia, 21 22 ... 31 01 ... 20) e uma linha por colaborador com o codigo de
 * cada dia (a sigla do turno = dia trabalhado).
 *
 *   folhaRH(mundo, 'Folha agosto', {
 *     inicio: [2025, 7, 21], dias: 31,
 *     pessoas: [{ mat: '100234', nome: 'ANA SOUZA', turno: 'A', dias: { '2025-08-05': '16' } }]
 *   }) -> url da planilha
 */
'use strict';
function folhaRH(mundo, nome, o) {
  const p = mundo.novaPlanilha(nome);
  const aba = p.abas[0];
  aba.nome = o.aba || 'FOLHA DE PONTO';
  aba.maxC = Math.max(aba.maxC, 3 + o.dias + 2);
  aba.maxL = Math.max(aba.maxL, 10 + o.pessoas.length);
  const [a, m, d] = o.inicio;
  const ini = new Date(a, m - 1, d);
  aba.gravar(0, 0, 'BARTOFIL DISTRIBUIDORA — FOLHA DE PONTO');
  aba.gravar(2, 0, 'DATA INICIAL');
  aba.gravar(2, 1, new Date(a, m - 1, d));
  const L = 5;                                   // linha 6 da planilha
  aba.gravar(L, 0, 'MATRICULA'); aba.gravar(L, 1, 'NOME'); aba.gravar(L, 2, 'T.');
  const datas = [];
  for (let i = 0; i < o.dias; i++) {
    const dt = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i);
    datas.push(dt);
    aba.gravar(L - 1, 3 + i, ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][dt.getDay()]);
    aba.gravar(L, 3 + i, o.cabecalhoComData ? new Date(dt) : dt.getDate());
  }
  const iso = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  o.pessoas.forEach((pe, k) => {
    const r = L + 1 + k;
    aba.gravar(r, 0, o.matComoNumero ? Number(pe.mat) : pe.mat);
    aba.gravar(r, 1, pe.nome);
    aba.gravar(r, 2, pe.turno);
    datas.forEach((dt, i) => {
      const cod = (pe.dias && pe.dias[iso(dt)]) || (dt.getDay() === 0 ? '' : pe.turno);
      if (cod) aba.gravar(r, 3 + i, cod);
    });
  });
  aba.gravar(L + 1 + o.pessoas.length, 0, 'HORAS TRABALHADAS');
  return 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit';
}
module.exports = { folhaRH };
