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
  assert.deepEqual(wb.sheets.map((s) => s.name), ['Tableau de bord', 'Portefeuille', 'Historique', 'Évolution', 'Mes ETF', 'Cours', 'Compositions', 'Catalogue', 'Simulateur', 'Plans', 'Courtiers', 'Objectifs']);
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

test('le courtier et la grille saisie font l’aller-retour par le classeur', async () => {
  const d = sample();
  d.settings.brokerId = 'traderepublic';
  d.settings.feePerOrder = 1.92;
  d.settings.feePct = 0.001;
  d.settings.annualFee = 12;
  d.settings.annualPct = 0.003;
  const back = await roundtrip(d);
  assert.equal(back.settings.brokerId, 'traderepublic');
  assert.equal(back.settings.feePerOrder, 1.92);
  assert.equal(back.settings.feePct, 0.001);
  assert.equal(back.settings.annualFee, 12);
  assert.equal(back.settings.annualPct, 0.003);
  const custom = sample();
  custom.settings.feePerOrder = 2.5;
  const back2 = await roundtrip(custom);
  assert.equal(back2.settings.brokerId, undefined);
  assert.equal(back2.settings.feePerOrder, 2.5);
  assert.equal(back2.settings.feePct, undefined);
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

test('changer de classeur : tout ce qui appartient au classeur est repris, et reste vide si le classeur est vide', async () => {
  // classeur source : réglages simples, sans rappel, sans ETF de référence, sans date d'ouverture, sans courtier ni réponses
  const src = sample();
  src.settings.peaOpeningDate = '';
  src.settings.reminderDay = 0;
  src.settings.benchmarkId = undefined;
  src.settings.brokerId = undefined;
  src.settings.feePerOrder = 0;
  src.settings.feePct = undefined;
  src.settings.annualFee = undefined;
  src.settings.annualPct = undefined;
  src.settings.brokerEtf = undefined;
  src.simulation = { initialCapital: 0, horizonYears: 10, annualRate: 0.05, dcaPhases: [{ fromYear: 1, monthly: 0 }] };
  const buf = await buildPeanalyzeWorkbook(src, CATALOG_DATE).zip().generateAsync({ type: 'uint8array' });
  // application déjà remplie avec les réglages d'un autre classeur
  const mine = sample();
  mine.settings.peaOpeningDate = '2024-05-02';
  mine.settings.reminderDay = 12;
  mine.settings.benchmarkId = 'ESE';
  mine.settings.brokerId = 'fortuneo';
  mine.settings.feePerOrder = 4;
  mine.settings.feePct = 0.002;
  mine.settings.annualFee = 30;
  mine.settings.annualPct = 0.004;
  mine.settings.brokerEtf = { saxo: { ESE: 'no' } };
  mine.simulation = { initialCapital: 9999, horizonYears: 20, annualRate: 0.08, dcaPhases: [{ fromYear: 1, monthly: 700 }] };
  const back = await parseWorkbook(buf, mine);
  assert.equal(back.settings.peaOpeningDate, '');
  assert.equal(back.settings.reminderDay, 0);
  assert.equal(back.settings.benchmarkId, undefined);
  assert.equal(back.settings.brokerId, undefined);
  assert.equal(back.settings.feePerOrder, 0);
  assert.equal(back.settings.feePct, undefined);
  assert.equal(back.settings.annualFee, undefined);
  assert.equal(back.settings.annualPct, undefined);
  assert.equal(back.settings.brokerEtf, undefined);
  assert.equal(back.simulation.initialCapital, 0);
  assert.deepEqual(back.simulation.dcaPhases, [{ fromYear: 1, monthly: 0 }]);
});
test('les réponses « mes ETF chez ce courtier » font l’aller-retour par l’onglet Courtiers', async () => {
  const d = sample();
  d.settings.brokerEtf = { traderepublic: { ESE: 'yes', PUST: 'no' }, saxo: { ESE: 'no' } };
  const back = await roundtrip(d);
  assert.deepEqual(back.settings.brokerEtf, { traderepublic: { ESE: 'yes', PUST: 'no' }, saxo: { ESE: 'no' } });
  const none = await roundtrip(sample());
  assert.equal(none.settings.brokerEtf, undefined);
});

test('classeur PEAnalyze : retraits, indexation et réglages font l’aller-retour', async () => {
  const d = sample();
  d.simulation = { ...d.simulation, inflation: 0.025, withdrawals: [{ fromYear: 8, amount: 1200 }, { fromYear: 11, amount: 1500.5 }], withdrawIndexed: true, keepDca: true, withdrawTax: true, withdrawTaxRate: 0.172, volatility: 0.2 };
  const back = await roundtrip(d);
  assert.deepEqual(back.simulation, d.simulation);
  d.simulation = { initialCapital: 10, horizonYears: 30, annualRate: 0.05, dcaPhases: [{ fromYear: 1, monthly: 100 }], withdrawMode: 'percent', withdrawals: [{ fromYear: 10, amount: 4 }] };
  const b2 = await roundtrip(d);
  assert.deepEqual(b2.simulation, d.simulation);
  // phases mixtes : somme unique puis pourcentage, type par phase
  d.simulation = { initialCapital: 10, horizonYears: 30, annualRate: 0.05, dcaPhases: [{ fromYear: 1, monthly: 100 }], keepDca: true, withdrawals: [{ fromYear: 8, amount: 100000, kind: 'lump' }, { fromYear: 12, amount: 3.5, kind: 'percent' }, { fromYear: 20, amount: 900 }] };
  const b3 = await roundtrip(d);
  assert.deepEqual(b3.simulation, d.simulation);
});

test('classeur PEAnalyze : saisies de la Calculatrice et affichage font l’aller-retour', async () => {
  const d = sample();
  d.simulation = { initialCapital: 10, horizonYears: 30, annualRate: 0.07, dcaPhases: [{ fromYear: 1, monthly: 100 }],
    calc: { unk: 'years', src: 'free', capFree: 450000, rate: 5.5, wMode: 'pct', wEur: 2100, wPct: 3.5, years: 31.5, target: 20000, idx: true, infl: 2.5, tax: true, taxPct: 17.2 },
    view: { tab: 'calc', mcSim: true, mcCalc: true, constant: true, fees: true } };
  const back = await roundtrip(d);
  assert.deepEqual(back.simulation, d.simulation);
  // valeurs par défaut : rien n'est enregistré
  const plain = sample();
  const b2 = await roundtrip(plain);
  assert.equal(b2.simulation.calc, undefined);
  assert.equal(b2.simulation.view, undefined);
  // la valeur par défaut suit la simulation : rendement 7 % saisi = défaut, donc absent
  d.simulation = { ...d.simulation, calc: { rate: 7, idx: false }, view: undefined };
  const b3 = await roundtrip(d);
  assert.equal(b3.simulation.calc, undefined);
});

test('classeur PEAnalyze : objectif de revenu mensuel', async () => {
  const d = sample();
  d.goals = [
    { id: 'g1', name: 'Maison', target: 40000, date: '2030-06-01', createdAt: '2026-11-01T10:00:00.000Z' },
    { id: 'g2', name: 'Retraite', target: 1, date: '2056-06-01', createdAt: '2026-11-01T10:00:00.000Z', monthlyIncome: 2000, incomeYears: 25 },
  ];
  const back = await roundtrip(d);
  const [a, b] = back.goals;
  assert.equal(a.monthlyIncome, undefined);
  assert.equal(a.target, 40000);
  assert.equal(b.monthlyIncome, 2000);
  assert.equal(b.incomeYears, 25);
  assert.ok(b.target > 100000); // le capital calculé est enregistré dans la colonne « Capital visé »
});
