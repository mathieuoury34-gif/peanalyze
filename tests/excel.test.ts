// Export du classeur PEAnalyze puis réimport : les opérations, la stratégie et le simulateur doivent revenir à l'identique.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildSeed, CATALOG_DATE } from '../src/data/seed';
import { buildPeanalyzeWorkbook } from '../src/data/excel-peanalyze';
import { parseWorkbook } from '../src/data/excel';

function sample() {
  const d = buildSeed();
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
  for (const e of d.etfs) assert.equal(back.targetAllocation[e.id] || 0, e.inStrategy ? d.targetAllocation[e.id] || 0 : 0);
});

test('classeur PEAnalyze : structure', async () => {
  const wb = buildPeanalyzeWorkbook(sample(), CATALOG_DATE);
  assert.deepEqual(wb.sheets.map((s) => s.name), ['Tableau de bord', 'Portefeuille', 'Historique', 'Évolution', 'Mes ETF', 'Cours', 'Compositions', 'Catalogue', 'Simulateur']);
  assert.equal(wb.sheets.reduce((n, s) => n + s.charts.length, 0), 8);
});

const ORIG = new URL('../private/template.full.xlsx', import.meta.url);
test('import du fichier d’origine', { skip: existsSync(ORIG) ? false : 'fichier personnel non publié' }, async () => {
  const back = await parseWorkbook(readFileSync(ORIG), buildSeed());
  assert.equal(back.deposits.length, 15);
  assert.equal(back.transactions.length, 30);
  assert.equal(back.simulation.initialCapital, 3000);
});
