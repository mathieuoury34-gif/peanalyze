// Tests des règles de calcul : résultats attendus = HANDOFF.md §6 (cours du 09/10/2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../src/data/seed';
import {
  assistant, computePositions, computeSummary, exposure, monthlySeries, simulate, topWithOthers, valuationDate,
  displayHistory, periodStartIndex,
} from '../src/domain/calc';
import { eur, pct, pts, parseNum, parseDateFr, eurSigned } from '../src/domain/format';
import { existsSync, readFileSync } from 'node:fs';

// Les opérations personnelles ne sont pas publiées : elles restent dans private/ (ignoré par git).
// Sans ce fichier (ex. sur GitHub), les tests qui en dépendent sont ignorés.
const FULL = new URL('../private/seed-data.full.json', import.meta.url);
const hasPrivate = existsSync(FULL);
const ptest = (name: string, fn: () => void) => test(name, { skip: hasPrivate ? false : 'données personnelles non publiées' }, fn);
const data = buildSeed(hasPrivate ? JSON.parse(readFileSync(FULL, 'utf8')) : undefined);
const positions = computePositions(data);
const P = (id: string) => positions.find((p) => p.etfId === id)!;
const r2 = (v: number) => Math.round(v * 100) / 100;

ptest('parts par ligne', () => {
  assert.deepEqual(
    Object.fromEntries(positions.map((p) => [p.etfId, p.quantity])),
    { WPEA: 49, ESE: 35, PAEEM: 7, PUST: 5, CACC: 2, ETZ: 27 },
  );
  assert.equal(positions.reduce((s, p) => s + p.quantity, 0), 125);
});

ptest('coût de revient, PRU, valeur, plus-value', () => {
  assert.equal(r2(P('ESE').costBasis), 1137.14);
  assert.equal(r2(positions.reduce((s, p) => s + p.costBasis, 0)), 2801.18);
  const pru = Object.fromEntries(positions.map((p) => [p.etfId, r2(p.pru)]));
  assert.deepEqual(pru, { ESE: 32.49, PUST: 100.41, ETZ: 20.86, WPEA: 6.0, PAEEM: 32.45, CACC: 38.98 });
  const mv = Object.fromEntries(positions.map((p) => [p.etfId, r2(p.marketValue)]));
  assert.deepEqual(mv, { ESE: 1235.85, ETZ: 579.42, PUST: 552.2, WPEA: 353.78, PAEEM: 259.56, CACC: 79.3 });
  assert.equal(r2(P('ESE').unrealizedPnl), 98.71);
  assert.equal(pctRound(P('ESE').unrealizedPnlPct), 8.7);
});

function pctRound(ratio: number) { return Math.round(ratio * 1000) / 10; }

ptest('synthèse', () => {
  const s = computeSummary(data, positions);
  assert.equal(valuationDate(data), '2026-10-09');
  assert.equal(r2(s.totalValue), 3060.11);
  assert.equal(s.totalDeposited, 2801.18);
  assert.equal(data.deposits.length, 15);
  assert.equal(r2(s.investedInSecurities), 2787.38);
  assert.equal(r2(s.unrealizedPnl), 258.93);
  assert.equal(pctRound(s.globalReturnPct), 9.2);
  assert.equal(s.cashBalance, 0);
  assert.ok(s.annualizedReturnXirr !== null);
  assert.equal(pctRound(s.annualizedReturnXirr!), 24.9);
  assert.equal(r2(s.feesPaid), 54.34);
  assert.equal(r2(s.feesRefunded), 40.54);
  assert.equal(r2(s.feesNet), 13.8);
  assert.equal(Math.round(s.avgFeePct * 10000) / 100, 0.5);
  assert.equal(pctRound(s.refundedShare), 74.6);
});

ptest('poids, écarts et parts cibles', () => {
  assert.equal(pctRound(P('ESE').weightActual), 40.4);
  assert.equal(Math.round(P('ESE').gapPts * 10) / 10, -19.6);
  assert.equal(Math.round(P('ETZ').gapPts * 10) / 10, 8.9);
  assert.equal(Math.round(P('WPEA').gapPts * 10) / 10, 11.6);
  assert.equal(r2(P('ESE').targetValue), 1836.07);
  assert.deepEqual([P('ESE').targetQuantity, P('ESE').toBuy], [52, 17]);
  assert.deepEqual([r2(P('PUST').targetValue), P('PUST').targetQuantity, P('PUST').toBuy], [612.02, 6, 1]);
  assert.deepEqual([r2(P('PAEEM').targetValue), P('PAEEM').targetQuantity, P('PAEEM').toBuy], [306.01, 8, 1]);
  assert.deepEqual([P('ETZ').targetQuantity, P('ETZ').toBuy], [14, 0]);
  assert.equal(P('CACC').inStrategy, false);
  assert.equal(P('WPEA').inStrategy, false);
});

ptest('exposition pays (top 10 + Autres)', () => {
  const rows = topWithOthers(exposure(data, positions, 'countries'), 10);
  const got = rows.map((r) => [r.label, Math.round(r.weight * 1000) / 10]);
  assert.deepEqual(got, [
    ['États-Unis', 66.8], ['France', 5.6], ['Royaume-Uni', 4.1], ['Allemagne', 2.8], ['Taïwan', 2.2],
    ['Pays-Bas', 2.1], ['Chine', 2.0], ['Corée du Sud', 1.6], ['Italie', 1.1], ['Suède', 1.0], ['Autres', 10.9],
  ]);
});

ptest('exposition secteurs (libellés normalisés)', () => {
  const rows = exposure(data, positions, 'sectors');
  const m = Object.fromEntries(rows.map((r) => [r.label, Math.round(r.weight * 1000) / 10]));
  assert.equal(m['Technologies de l’information'], 30.9);
  assert.equal(m['Finance'], 13.5);
  assert.equal(m['Industrie'], 10.6);
  assert.equal(m['Consommation discrétionnaire'], 9.8);
  assert.equal(m['Services de communication'], 9.0);
  assert.equal(m['Consommation de base'], 6.3);
  assert.equal(m['Énergie'], 3.9);
  assert.equal(m['Matériaux'], 3.2);
  assert.equal(m['Services aux collectivités'], 2.4);
  // L'Excel comptait la Santé des émergents à la place de leurs « Autres » ; le calcul correct donne :
  assert.equal(m['Santé'], 8.6);
  assert.equal(m['Autres'], 1.9);
  assert.equal(Math.round(rows.reduce((s, r) => s + r.weight, 0) * 1000) / 10, 100);
});

test('variation d’un ETF depuis le 01/08/2025', () => {
  const ese = data.etfs.find((e) => e.id === 'ESE')!;
  const h = displayHistory(ese);
  const s = periodStartIndex(h, null);
  assert.equal(h[s][0], '2025-08-01');
  assert.equal(pctRound(ese.lastPrice / h[s][1] - 1), 30.1);
});

ptest('assistant — suivre la cible (750 €)', () => {
  const items = positions.map((p) => ({ id: p.etfId, price: p.price, value: p.marketValue, target: p.weightTarget }));
  const r = assistant(items, 750, 'target', 1.92);
  assert.deepEqual([r.parts.ESE, r.parts.PUST, r.parts.PAEEM, r.parts.ETZ, r.parts.CACC, r.parts.WPEA], [13, 1, 2, 4, 0, 0]);
  assert.equal(r.total, 729.47);
  assert.equal(r.fees, 7.68);
  assert.equal(r.left, 12.85);
});

ptest('assistant — rééquilibrer (750 €)', () => {
  const items = positions.map((p) => ({ id: p.etfId, price: p.price, value: p.marketValue, target: p.weightTarget }));
  const r = assistant(items, 750, 'rebalance', 1.92);
  assert.equal(r.parts.ESE, 21);
  assert.equal(r.total, 741.51);
  assert.equal(r.fees, 1.92);
});

test('simulateur mensuel', () => {
  const y = simulate({ initialCapital: 3000, horizonYears: 7, annualRate: 0.085, dcaPhases: [{ fromYear: 1, monthly: 700 }] });
  assert.equal(y[7].deposited, 61800);
  assert.equal(Math.round(y[7].value - y[7].deposited), 22540);
  assert.equal(Math.round(y[7].value), 84340);
  assert.deepEqual([y[1].deposited, Math.round(y[1].value - y[1].deposited)], [11400, 577]);
  assert.deepEqual([y[5].deposited, Math.round(y[5].value - y[5].deposited)], [45000, 11195]);
});

ptest('simulateur — paramètres du fichier Excel', () => {
  // phases du fichier d'origine (identiques sur 7 ans)
  const s = simulate(data.simulation);
  assert.equal(Math.round(s[7].value), 84340);
});

test('données publiques : aucune opération personnelle', () => {
  const pub = buildSeed();
  assert.equal(pub.deposits.length, 0);
  assert.equal(pub.transactions.length, 0);
  assert.equal(pub.updatedAt, '');
  assert.ok(pub.etfs.length >= 6);
});

ptest('série mensuelle épargne / valeur', () => {
  const m = monthlySeries(data);
  assert.equal(m[0].month, '2025-07');
  assert.equal(m[m.length - 1].month, '2026-10');
  assert.equal(m[m.length - 1].deposited, 2801.18);
  assert.equal(m[m.length - 1].value, 3060.11);
  assert.equal(m.find((x) => x.month === '2026-09')!.deposited, 2801.18);
});

test('formatage français', () => {
  assert.equal(eur(1235.85), '1 235,85 €');
  assert.equal(pct(0.0013, 2), '0,13 %');
  assert.equal(pts(-19.6), '−19,6');
  assert.equal(eurSigned(258.93), '+258,93 €');
  assert.equal(parseNum('1 234,56'), 1234.56);
  assert.equal(parseDateFr('29/09/2026'), '2026-09-29');
  assert.equal(parseDateFr('31/02/2026'), '');
});
