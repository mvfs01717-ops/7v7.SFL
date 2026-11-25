import { seededRng, seededRoll, hashKey } from '../../src/lib/game/seeded';

let pass = 0, fail = 0;
const out: string[] = [];
const check = (name: string, ok: boolean, info = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

const seq = (key: string, n: number) => { const r = seededRng(key); return Array.from({ length: n }, () => r()); };

// 1) mesma chave, mesma sequência (o que a sincronização exige)
check('mesma chave gera a mesma sequência', JSON.stringify(seq('lance|7|3', 50)) === JSON.stringify(seq('lance|7|3', 50)));
// 2) chaves diferentes divergem
check('chaves diferentes divergem', JSON.stringify(seq('lance|7|3', 10)) !== JSON.stringify(seq('lance|7|4', 10)));
// 3) valores sempre em [0, 1)
{ const v = seq('faixa', 20000); check('valores em [0,1)', v.every((x) => x >= 0 && x < 1)); }
// 4) distribuição razoável: média perto de 0.5 e quartis balanceados
{
  const v = seq('distribuicao', 40000);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const q = [0, 0, 0, 0];
  for (const x of v) q[Math.min(3, Math.floor(x * 4))]++;
  const maxDev = Math.max(...q.map((c) => Math.abs(c / v.length - 0.25)));
  check('média próxima de 0,5', Math.abs(mean - 0.5) < 0.01, `média=${mean.toFixed(4)}`);
  check('quartis balanceados (desvio < 1%)', maxDev < 0.01, `desvio máx=${(maxDev * 100).toFixed(2)}%`);
}
// 5) seededRoll é o primeiro valor da sequência
check('seededRoll = primeiro valor da sequência', seededRoll('abc') === seq('abc', 1)[0]);
// 6) hash estável (valor fixo para não mudar sem perceber)
check('hashKey é estável entre execuções', hashKey('lance') === hashKey('lance') && hashKey('') === 2166136261);
// 7) independência entre duas sequências com chaves próximas (correlação baixa)
{
  const a = seq('jogo|1', 5000), b = seq('jogo|2', 5000);
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  const corr = num / Math.sqrt(da * db);
  check('chaves vizinhas não correlacionadas (|r| < 0,05)', Math.abs(corr) < 0.05, `r=${corr.toFixed(4)}`);
}

console.log(out.join('\n'));
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
