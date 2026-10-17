import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { benchmarkCompare, holdingCost, overlapPairs, riskAnalysis, simulationWithCosts } from '../src/domain/analysis';
import { computePositions } from '../src/domain/calc';
import type { AppData } from '../src/domain/types';

/** Jours ouvrés à partir du 05/01/2026 avec une fonction de cours. */
function history(n: number, f: (i: number) => number): [string, number][] {
  const out: [string, number][] = [];
  const d = new Date(Date.UTC(2026, 0, 5));
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push([d.toISOString().slice(0, 10), Math.round(f(out.length) * 1e4) / 1e4]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
function withHistory(): AppData {
  const d = fixture();
  const h = history(80, (i) => 100 * (1 + i * 0.002));
  const a = d.etfs[0];
  a.priceHistory = h;
  a.lastPrice = h[h.length - 1][1];
  a.lastPriceDate = h[h.length - 1][0];
  d.deposits = [{ id: 'd1', date: h[0][0], amount: 1000 }, { id: 'd2', date: h[30][0], amount: 500 }];
  d.transactions = [
    { id: 't1', date: h[0][0], etfId: 'AAA', unitPrice: h[0][1], quantity: 1000 / h[0][1], grossAmount: 1000, fees: 0, feeRefund: 0 },
    { id: 't2', date: h[30][0], etfId: 'AAA', unitPrice: h[30][1], quantity: 500 / h[30][1], grossAmount: 500, fees: 0, feeRefund: 0 },
  ];
  return d;
}

test('comparaison : tout dans la référence aux mêmes dates = même résultat', () => {
  const d = withHistory();
  const r = benchmarkCompare(d, 'AAA')!;
  assert.ok(r);
  assert.equal(r.shortened, false);
  assert.ok(Math.abs(r.diff) < 0.05, 'écart ' + r.diff);
  assert.ok(Math.abs(r.mineGain - r.benchGain) < 0.05);
  assert.equal(r.startValue, 1000);
  assert.equal(r.netIn, 500);
  assert.ok(r.mineGain > 0);
  assert.equal(r.points[0].date, d.deposits[0].date);
});

test('comparaison : un retrait est rejoué dans la référence', () => {
  const d = withHistory();
  const h = d.etfs[0].priceHistory;
  d.deposits.push({ id: 'w', date: h[50][0], amount: -300 });
  d.transactions.push({ id: 't3', date: h[50][0], etfId: 'AAA', unitPrice: h[50][1], quantity: -300 / h[50][1], grossAmount: -300, fees: 0, feeRefund: 0 });
  const r = benchmarkCompare(d, 'AAA')!;
  assert.equal(r.netIn, 200);
  assert.ok(Math.abs(r.diff) < 0.05);
});

test('comparaison : historique de la référence plus court que mon premier virement', () => {
  const d = withHistory();
  d.deposits[0].date = '2025-06-01';
  d.transactions[0].date = '2025-06-01';
  const r = benchmarkCompare(d, 'AAA')!;
  assert.ok(r.shortened);
  assert.equal(r.from, d.etfs[0].priceHistory[0][0]);
});

test('comparaison : sans historique, pas de résultat', () => {
  const d = fixture();
  assert.equal(benchmarkCompare(d, 'BBB'), null);
});

test('risque : cours régulier = volatilité nulle, pas de baisse', () => {
  const d = withHistory();
  const r = riskAnalysis(d, computePositions(d));
  assert.ok(r.volatility !== null && r.volatility < 0.05);
  assert.equal(r.maxDrawdown, 0);
});

test('risque : pire baisse sommet → creux', () => {
  const d = withHistory();
  const h = history(80, (i) => (i < 20 ? 100 + i : i < 40 ? 119 - (i - 19) * 2 : 80 + (i - 40)));
  d.etfs[0].priceHistory = h;
  d.etfs[0].lastPrice = h[79][1];
  d.etfs[0].lastPriceDate = h[79][0];
  d.deposits = [{ id: 'd1', date: h[0][0], amount: 1000 }];
  d.transactions = [{ id: 't1', date: h[0][0], etfId: 'AAA', unitPrice: 100, quantity: 10, grossAmount: 1000, fees: 0, feeRefund: 0 }];
  const r = riskAnalysis(d, computePositions(d));
  assert.ok(r.maxDrawdown! < -0.3 && r.maxDrawdown! > -0.36, 'mdd ' + r.maxDrawdown);
  assert.equal(r.drawdownFrom, h[19][0]);
  assert.ok(r.volatility! > 0.1);
  assert.equal(r.lines[0].etfId, 'AAA');
});

test('concentration : poids de la plus grosse ligne et nombre de lignes équivalentes', () => {
  const d = fixture(); // 1000 / 500 / 500
  const r = riskAnalysis(d, computePositions(d));
  assert.equal(r.largestId, 'AAA');
  assert.ok(Math.abs(r.largestWeight - 0.5) < 1e-9);
  assert.ok(Math.abs(r.hhi - (0.25 + 0.0625 + 0.0625 + 0)) < 1e-9 || Math.abs(r.hhi - 0.375) < 1e-9);
  assert.ok(Math.abs(r.effectiveLines - 1 / 0.375) < 1e-9);
  assert.ok(Math.abs(r.top3 - 1) < 1e-9);
});

test('recoupements : pays et secteurs en commun, même indice = doublon', () => {
  const d = fixture();
  d.transactions.push({ id: 't4', date: '2026-01-10', etfId: 'WRLD', unitPrice: 10, quantity: 50, grossAmount: 500, fees: 0, feeRefund: 0 });
  const pairs = overlapPairs(d, computePositions(d));
  const aw = pairs.find((p) => [p.a, p.b].sort().join() === 'AAA,WRLD')!;
  assert.ok(Math.abs(aw.countries! - 0.3) < 1e-9);
  assert.ok(Math.abs(aw.sectors! - 0.7) < 1e-9);
  assert.ok(Math.abs(aw.overlap - 0.5) < 1e-9);
  assert.equal(aw.level, 'moderate');
  d.etfs.find((e) => e.id === 'BBB')!.index = 'AAA';
  const dup = overlapPairs(d, computePositions(d)).find((p) => p.sameIndex)!;
  assert.equal(dup.level, 'double');
  assert.equal(dup.overlap, 1);
});

test('recoupements : une composition non vérifiée n’est pas comparée', () => {
  const d = fixture();
  d.etfs[0].comp = { kind: 'justetf', date: '2026-09-30' };
  const pairs = overlapPairs(d, computePositions(d));
  assert.ok(!pairs.some((p) => p.a === 'AAA' || p.b === 'AAA'));
});

test('coût de détention : frais courants pondérés + courtage des 12 mois', () => {
  const d = fixture();
  const c = holdingCost(d, computePositions(d));
  assert.ok(Math.abs(c.terEur - 9.5) < 1e-9);
  assert.ok(Math.abs(c.terPct - 9.5 / 2000) < 1e-9);
  assert.ok(Math.abs(c.brokerage12m - 5.76) < 1e-9);
  assert.equal(c.ordersPerYear, 3);
  assert.ok(Math.abs(c.totalPerYear - 15.26) < 1e-9);
  assert.equal(c.lines[0].etfId, 'OLD');
});

test('simulateur : les frais réduisent le capital final', () => {
  const d = fixture();
  d.simulation = { initialCapital: 1000, horizonYears: 20, annualRate: 0.07, dcaPhases: [{ fromYear: 1, monthly: 200 }] };
  const cost = holdingCost(d, computePositions(d));
  const r = simulationWithCosts(d, cost, 12);
  assert.ok(r.withCosts < r.without);
  assert.ok(r.lost > 0);
  assert.ok(Math.abs(r.rate - (0.07 - cost.terPct)) < 1e-12);
});

import { computePlan, planBacktest, blankPlan } from '../src/domain/plan';
test('test sur le passé : plan qui vend tout pour un ETF plus calme', () => {
  const d = withHistory();
  const h = d.etfs[0].priceHistory;
  const b = d.etfs[1]; // BBB : cours très volatil
  b.priceHistory = h.map(([date], i) => [date, 50 * (1 + (i % 2 ? 0.03 : -0.03))] as [string, number]);
  b.lastPrice = b.priceHistory[79][1]; b.lastPriceDate = h[79][0];
  const plan = { ...blankPlan(d, 'p', 'x'), sells: [{ etfId: 'AAA', kind: 'all' as const, value: 0 }], targets: { BBB: 1 } };
  const r = computePlan(d, plan);
  const bt = planBacktest(d, r)!;
  assert.ok(bt, 'backtest disponible');
  assert.ok(bt.before.vol! < 0.05);
  assert.ok(bt.after.vol! > bt.before.vol!);
  assert.ok(bt.sessions >= 20);
  assert.ok(bt.before.coverage > 0.99);
});
