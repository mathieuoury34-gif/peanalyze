import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/domain/calc';
import { balanceAfter, configFromSim, monteCarlo, monthsLasting, requiredCapital, run, solve, type CalcInput } from '../src/domain/withdraw';

const base = (o: Partial<CalcInput> = {}): CalcInput => ({ capital: 300000, rate: 0.05, monthly: 1500, years: 25, target: 0, indexed: false, inflation: 0.02, tax: false, taxRate: 0.186, ...o });
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (tol ${tol})`);
// formules fermées (retraits constants en fin de mois, taux mensuel équivalent)
const mi = (r: number) => Math.pow(1 + r, 1 / 12) - 1;
const bal = (C: number, r: number, W: number, n: number) => { const i = mi(r), g = Math.pow(1 + i, n); return C * g - (W * (g - 1)) / i; };

test('capital restant : identique à la formule fermée', () => {
  const x = base();
  near(balanceAfter(x), bal(300000, 0.05, 1500, 300), 1e-6);
});
test('retrait maximal : redonne exactement le capital visé (et colle à la formule fermée)', () => {
  const x = base({ target: 20000 });
  const s = solve('monthly', x);
  const i = mi(0.05), g = Math.pow(1 + i, 300);
  near(s.value, ((300000 * g - 20000) * i) / (g - 1), 1e-4);
  near(balanceAfter({ ...x, monthly: s.value }), 20000, 1e-3);
});
test('capital nécessaire : formule fermée et aller-retour', () => {
  const x = base({ capital: 0, target: 10000 });
  const s = solve('capital', x);
  const i = mi(0.05), g = Math.pow(1 + i, 300);
  near(s.value, (10000 + (1500 * (g - 1)) / i) / g, 1e-3);
  near(balanceAfter({ ...x, capital: s.value }), 10000, 1e-3);
});
test('rendement requis : aller-retour, et cas limites', () => {
  const x = base({ capital: 250000 });
  const s = solve('rate', x);
  assert.equal(s.status, 'ok');
  near(balanceAfter({ ...x, rate: s.value }), 0, 0.01);
  assert.equal(solve('rate', base({ capital: 600000 })).status, 'zero'); // 0 % suffit déjà (600 000 > 1 500 × 300)
  assert.equal(solve('rate', base({ capital: 1000, monthly: 5000 })).status, 'impossible');
});
test('durée : formule fermée (nombre de mois payés en entier)', () => {
  const x = base({ capital: 200000 });
  const i = mi(0.05);
  const exact = Math.log((1500 / i - 0) / (1500 / i - 200000)) / Math.log(1 + i);
  const m = monthsLasting(x);
  assert.ok(m === Math.floor(exact) || m === Math.floor(exact) - 1 || m === Math.floor(exact) + 1, `${m} vs ${exact}`);
  const s = solve('years', x);
  assert.equal(s.status, 'ok');
  near(s.value, m / 12, 1e-9);
});
test('durée : capital durable quand les intérêts couvrent le retrait', () => {
  const s = solve('years', base({ capital: 1000000, monthly: 1000 }));
  assert.equal(s.status, 'durable');
});
test('sans rendement : retrait = capital / mois', () => {
  const s = solve('monthly', base({ rate: 0, capital: 120000, years: 10 }));
  near(s.value, 1000, 1e-6);
});
test('retrait nul impossible si le capital visé dépasse déjà ce que rapporte le capital', () => {
  assert.equal(solve('monthly', base({ capital: 1000, target: 5000, rate: 0, years: 1 })).status, 'zero');
});
test('indexation : 3 ans à 0 % = 12 × W × (1 + 1,02 + 1,02²)', () => {
  const r = run({ ...configFromSim({ initialCapital: 100000, horizonYears: 3, annualRate: 0, dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 1000 }], withdrawIndexed: true }), allowNegative: true }, undefined, undefined, false);
  near(r.totalWithdrawn, 12000 * (1 + 1.02 + 1.02 * 1.02), 1e-6);
  near(r.finalValue, 100000 - r.totalWithdrawn, 1e-6);
});
test('indexation : le capital nécessaire augmente', () => {
  assert.ok(requiredCapital(2000, 25, 0.05, true) > requiredCapital(2000, 25, 0.05, false));
  near(requiredCapital(2000, 25, 0.05), solve('capital', base({ capital: 0, monthly: 2000 })).value, 1e-6);
});
test('sans retrait : identique à simulate()', () => {
  const sim = { initialCapital: 5000, horizonYears: 12, annualRate: 0.07, dcaPhases: [{ fromYear: 1, monthly: 300 }, { fromYear: 6, monthly: 500 }] };
  const a = simulate(sim), b = run(configFromSim(sim)).years;
  assert.equal(b.length, a.length);
  a.forEach((y, k) => { near(b[k].value, y.value, 1e-6); near(b[k].deposited, y.deposited, 1e-6); });
});
test('phases : versements arrêtés au début des retraits, sauf « garder les versements »', () => {
  const sim = { initialCapital: 0, horizonYears: 4, annualRate: 0, dcaPhases: [{ fromYear: 1, monthly: 100 }], withdrawals: [{ fromYear: 3, amount: 50 }] };
  const stop = run(configFromSim(sim));
  near(stop.totalDeposited, 2400); // 24 mois seulement
  near(stop.finalValue, 2400 - 24 * 50);
  const keep = run(configFromSim({ ...sim, keepDca: true }));
  near(keep.totalDeposited, 4800);
  near(keep.finalValue, 4800 - 24 * 50);
});
test('plusieurs phases de retrait : la phase en cours remplace la précédente', () => {
  const sim = { initialCapital: 100000, horizonYears: 4, annualRate: 0, dcaPhases: [], withdrawals: [{ fromYear: 2, amount: 1000 }, { fromYear: 4, amount: 3000 }] };
  const r = run(configFromSim(sim));
  near(r.totalWithdrawn, 24 * 1000 + 12 * 3000);
  assert.equal(r.startYear, 2);
});
test('capital épuisé : les retraits non payés sont comptés et le capital reste à 0', () => {
  const r = run(configFromSim({ initialCapital: 1000, horizonYears: 2, annualRate: 0, dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 100 }] }));
  assert.equal(r.depletedMonth, 10);
  near(r.totalWithdrawn, 1000); near(r.unpaid, 1400); assert.equal(r.finalValue, 0);
});
test('mode % : retire une part du capital restant, jamais épuisé', () => {
  const r = run({ ...configFromSim({ initialCapital: 100000, horizonYears: 1, annualRate: 0, dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 4 }], withdrawMode: 'percent' }) });
  near(r.finalValue, 100000 * Math.pow(1 - 0.04 / 12, 12), 1e-6);
  assert.equal(r.depletedMonth, null);
});
test('prélèvements sociaux : seulement sur la part de gains, retrait net conservé', () => {
  // 100 000 € investis devenus 200 000 € : la moitié du capital est du gain
  const cfg = { ...configFromSim({ initialCapital: 200000, horizonYears: 1, annualRate: 0, dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 1000 }], withdrawTax: true }), basis: 100000 };
  const r = run(cfg);
  near(r.totalWithdrawn, 12000, 1e-6); // net : ce qui arrive sur le compte
  assert.ok(r.totalTax > 0);
  assert.ok(r.finalValue < 200000 - 12000); // le fisc a aussi été payé par le capital
  const none = run({ ...cfg, basis: 200000 }); // aucun gain : aucun prélèvement
  near(none.totalTax, 0, 1e-9);
  near(none.finalValue, 188000, 1e-6);
});
test('Monte Carlo : volatilité nulle = courbe constante ; mêmes graines = mêmes résultats', () => {
  const cfg = configFromSim({ initialCapital: 300000, horizonYears: 30, annualRate: 0.05, dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 1500 }] });
  const det = run(cfg);
  const a = monteCarlo(cfg, 0, 50, 1);
  a.p50.forEach((v, k) => near(v, det.years[k].value, 1e-3));
  assert.equal(a.successRate, det.depletedMonth === null ? 1 : 0);
  const b = monteCarlo(cfg, 0.15, 300, 3), c = monteCarlo(cfg, 0.15, 300, 3);
  assert.deepEqual(b.p50, c.p50);
  assert.ok(b.successRate >= 0 && b.successRate <= 1);
  b.p10.forEach((v, k) => { assert.ok(v <= b.p50[k] + 1e-6 && b.p50[k] <= b.p90[k] + 1e-6); });
});
test('Monte Carlo : plus de volatilité = taux de réussite plus faible quand le plan est serré', () => {
  const cfg = configFromSim({ initialCapital: 300000, horizonYears: 30, annualRate: 0.05, dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 1400 }] });
  const lo = monteCarlo(cfg, 0.05, 600, 2).successRate, hi = monteCarlo(cfg, 0.25, 600, 2).successRate;
  assert.ok(lo > hi, `${lo} > ${hi}`);
  assert.equal(monteCarlo({ ...cfg, withdrawals: [{ fromYear: 1, amount: 100 }] }, 0.15, 300, 2).successRate, 1);
  assert.ok(monteCarlo({ ...cfg, withdrawals: [{ fromYear: 1, amount: 6000 }] }, 0.15, 300, 2).successRate < 0.01);
});

// ---------------------------------------------------------------- phases mixtes : somme unique + retraits réguliers
const mixed = (o: object) => configFromSim({ initialCapital: 200000, horizonYears: 5, annualRate: 0, dcaPhases: [{ fromYear: 1, monthly: 100 }], ...o } as never);

test('somme unique : retirée une seule fois, au début de son année, sans arrêter les versements', () => {
  const r = run(mixed({ withdrawals: [{ fromYear: 3, amount: 100000, kind: 'lump' }] }));
  near(r.totalWithdrawn, 100000);
  near(r.years[2].value, 200000 + 100 * 24); // fin d'année 2 : rien n'est encore sorti
  near(r.years[3].value, 200000 + 100 * 36 - 100000); // la somme sort au mois 25, les versements continuent
  near(r.finalValue, 200000 + 100 * 60 - 100000);
  assert.equal(r.startYear, 3);
  assert.equal(r.depletedMonth, null);
});

test('somme unique puis retrait en % : versements arrêtés au retrait régulier seulement', () => {
  const r = run(mixed({ withdrawals: [{ fromYear: 2, amount: 50000, kind: 'lump' }, { fromYear: 4, amount: 12, kind: 'percent' }] }));
  // année 1-3 : versements ; dès l'année 4 : plus de versement (retrait régulier) ; 12 %/an à rendement nul = 1 % du capital par mois
  near(r.totalDeposited, 200000 + 100 * 36);
  assert.ok(r.totalWithdrawn > 50000 && r.finalValue > 0);
  const keep = run(mixed({ keepDca: true, withdrawals: [{ fromYear: 2, amount: 50000, kind: 'lump' }, { fromYear: 4, amount: 12, kind: 'percent' }] }));
  near(keep.totalDeposited, 200000 + 100 * 60);
});

test('somme unique supérieure au capital : tout est vendu, le manque est signalé', () => {
  const r = run(mixed({ initialCapital: 10000, dcaPhases: [], withdrawals: [{ fromYear: 2, amount: 30000, kind: 'lump' }] }));
  near(r.totalWithdrawn, 10000);
  near(r.unpaid, 20000);
  assert.equal(r.depletedMonth, 13);
});

test('phase sans type : suit encore le réglage global (anciennes données)', () => {
  const legacy = run(mixed({ dcaPhases: [], withdrawMode: 'percent', withdrawals: [{ fromYear: 1, amount: 12 }] }));
  const explicit = run(mixed({ dcaPhases: [], withdrawals: [{ fromYear: 1, amount: 12, kind: 'percent' }] }));
  near(legacy.finalValue, explicit.finalValue, 1e-6);
});

test('calculette : durée vide ou nulle → pas de résultat (et non un nombre démesuré)', () => {
  for (const u of ['monthly', 'capital', 'rate'] as const) {
    const s = solve(u, base({ years: 0 }));
    assert.equal(s.status, 'incomplete');
    assert.ok(Number.isNaN(s.value));
  }
  assert.equal(solve('years', base({ years: 0 })).status, 'ok');
});

test('saisies de la Calculatrice : valeur par défaut non enregistrée, valeur modifiée conservée', async () => {
  const { calcValue, setCalcValue, setViewValue } = await import('../src/domain/withdraw');
  const sim: any = { initialCapital: 0, horizonYears: 30, annualRate: 0.085, dcaPhases: [] };
  assert.equal(calcValue(sim, 'rate'), 8.5);
  assert.equal(calcValue(sim, 'years'), 25);
  setCalcValue(sim, 'years', 30);
  assert.deepEqual(sim.calc, { years: 30 });
  assert.equal(calcValue(sim, 'years'), 30);
  setCalcValue(sim, 'years', 25);
  assert.equal(sim.calc, undefined);
  setViewValue(sim, 'mcCalc', true);
  assert.deepEqual(sim.view, { mcCalc: true });
  setViewValue(sim, 'mcCalc', false);
  assert.equal(sim.view, undefined);
});
