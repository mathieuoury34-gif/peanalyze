// Export du classeur PEAnalyze puis réimport : les opérations, la stratégie et le simulateur doivent revenir à l'identique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildSeed, CATALOG_DATE } from '../src/data/seed';
import { buildPeanalyzeWorkbook } from '../src/data/excel-peanalyze';
import { parseWorkbook } from '../src/data/excel';

function sample() {
  const d = buildSeed();
  d.settings.peaOpeningDate = '2025-11-03';
  d.deposits = [
    { id: 'd1', date: '2026-01-05', amount: 500 },
    { id: 'd2', date: '2026-02-05', amount: 300.5 },
  ];
  d.transactions = [
    { id: 't1', date: '2026-01-06', etfId: 'ESE', unitPrice: 30.1234, quantity: 10, grossAmount: 303.15, fees: 1.916, feeRefund: 1.5 },
    { id: 't2', date: '2026-02-06', etfId: 'PUST', unitPrice: 101.5, quantity: 2, grossAmount: 204.92, fees: 1.92, feeRefund: 0 },
  ];
  d.simulation = { initialCapital: 1234, horizonYears: 12, annualRate: 0.065, dcaPhases: [{ fromYear: 1, monthly: 250 }, { fromYear: 6, monthly: 400 }] };
  return d;
}

async function roundtrip(d: ReturnType<typeof buildSeed>) {
  const buf = await buildPeanalyzeWorkbook(d, CATALOG_DATE).zip().generateAsync({ type: 'uint8array' });
  return parseWorkbook(buf, buildSeed());
}

test('classeur PEAnalyze : export puis réimport', async () => {
  const d = sample();
  const back = await roundtrip(d);
  assert.deepEqual(back.deposits.map((x) => [x.date, x.amount]), d.deposits.map((x) => [x.date, x.amount]));
  assert.deepEqual(back.transactions.map((t) => [t.date, t.etfId, t.unitPrice, t.quantity, t.grossAmount, t.feeRefund]),
    d.transactions.map((t) => [t.date, t.etfId, t.unitPrice, t.quantity, t.grossAmount, t.feeRefund]));
  assert.deepEqual(back.simulation, d.simulation);
  assert.equal(back.settings.peaOpeningDate, '2025-11-03');
  for (const e of d.etfs) assert.equal(back.targetAllocation[e.id] || 0, e.inStrategy ? d.targetAllocation[e.id] || 0 : 0);
});

test('classeur PEAnalyze : structure', async () => {
  const wb = buildPeanalyzeWorkbook(sample(), CATALOG_DATE);
  assert.deepEqual(wb.sheets.map((s) => s.name), ['Tableau de bord', 'Portefeuille', 'Historique', 'Évolution', 'Mes ETF', 'Cours', 'Compositions', 'Catalogue', 'Simulateur', 'Plans', 'Objectifs']);
  assert.equal(wb.sheets.reduce((n, s) => n + s.charts.length, 0), 8);
});

const ORIG = new URL('../private/template.full.xlsx', import.meta.url);
test('import du fichier d’origine', { skip: existsSync(ORIG) ? false : 'fichier personnel non publié' }, async () => {
  const back = await parseWorkbook(readFileSync(ORIG), buildSeed());
  assert.equal(back.deposits.length, 15);
  assert.equal(back.transactions.length, 30);
  assert.equal(back.simulation.initialCapital, 3000);
});

test('import : la liste Mes ETF, la cible et les couleurs viennent du classeur', async () => {
  const d = sample();
  d.myEtfIds = ['PUST', 'ESE'];
  d.settings.etfColors = { ESE: 'AE0014' };
  const buf = await buildPeanalyzeWorkbook(d, CATALOG_DATE).zip().generateAsync({ type: 'uint8array' });
  // l'importeur a une autre liste et une autre cible
  const mine = buildSeed();
  mine.myEtfIds = ['WPEA', 'ETZ'];
  mine.targetAllocation = { WPEA: 1 };
  const back = await parseWorkbook(buf, mine);
  assert.deepEqual(back.myEtfIds, ['PUST', 'ESE']);
  assert.equal(back.targetAllocation.WPEA || 0, 0);
  assert.deepEqual(back.etfs.map((e) => e.id).sort(), ['ESE', 'PUST']);
  assert.deepEqual(back.settings.etfColors, { PUST: '007461', ESE: 'AE0014' });
});

test('ventes, retrait, plans, objectifs et réglages suivent le classeur', async () => {
  const d = sample();
  d.deposits.push({ id: 'd3', date: '2026-03-01', amount: -120 });
  d.transactions.push({ id: 't3', date: '2026-03-02', etfId: 'ESE', unitPrice: 31, quantity: -4, grossAmount: -(31 * 4 - 1.92), fees: 1.92, feeRefund: 0 });
  d.plans = [
    { id: 'p1', name: 'Alléger le S&P', createdAt: '2026-04-01T10:00:00.000Z', sells: [{ etfId: 'ESE', kind: 'pct', value: 0.25 }, { etfId: 'PUST', kind: 'all', value: 0 }, { etfId: 'ESE', kind: 'qty', value: 2 }], deposit: 300, withdraw: 0, monthly: 150, targets: { ESE: 0.6, PUST: 0.4 } },
    { id: 'p2', name: 'Simple', createdAt: '2026-04-02T10:00:00.000Z', sells: [], deposit: 0, withdraw: 500, monthly: 0, targets: null },
  ];
  d.goals = [{ id: 'g1', name: 'Apport maison', target: 25000, date: '2031-06-30', createdAt: '2026-04-03T10:00:00.000Z' }];
  d.settings.reminderDay = 5;
  d.settings.benchmarkId = 'ESE';
  const back = await roundtrip(d);
  assert.deepEqual(back.deposits.map((x) => x.amount), [500, 300.5, -120]);
  assert.deepEqual(back.transactions.map((t) => t.quantity), [10, 2, -4]);
  assert.equal(back.transactions[2].grossAmount, d.transactions[2].grossAmount);
  assert.deepEqual(back.plans, d.plans);
  assert.deepEqual(back.goals, d.goals);
  assert.equal(back.settings.reminderDay, 5);
  assert.equal(back.settings.benchmarkId, 'ESE');
});

test('changer de classeur remplace les plans et objectifs de l’application', async () => {
  const mine = buildSeed();
  mine.plans = [{ id: 'x', name: 'Plan de l’autre classeur', createdAt: '2026-01-01T00:00:00.000Z', sells: [], deposit: 0, withdraw: 0, monthly: 0, targets: null }];
  mine.goals = [{ id: 'y', name: 'Autre objectif', target: 1000, date: '2030-01-01', createdAt: '2026-01-01T00:00:00.000Z' }];
  const d = sample(); // classeur sans plan ni objectif
  const buf = await buildPeanalyzeWorkbook(d, CATALOG_DATE).zip().generateAsync({ type: 'uint8array' });
  const back = await parseWorkbook(buf, mine);
  assert.deepEqual(back.plans, []);
  assert.deepEqual(back.goals, []);
});
