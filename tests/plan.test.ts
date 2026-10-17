// Tests du moteur de plans (Simulateur › Plans) sur un portefeuille fictif
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppData } from '../src/domain/types';
import { fixture, sec } from './fixture';
import { blankPlan, computePlan, currentStrategy, monthsToConverge, planSellOne, planSingle, sellQuantity, trackingGap } from '../src/domain/plan';

test('quantité vendue : tout, nombre de parts, fraction', () => {
  assert.equal(sellQuantity({ etfId: 'X', kind: 'all', value: 0 }, 7), 7);
  assert.equal(sellQuantity({ etfId: 'X', kind: 'qty', value: 3 }, 7), 3);
  assert.equal(sellQuantity({ etfId: 'X', kind: 'qty', value: 30 }, 7), 7);
  assert.equal(sellQuantity({ etfId: 'X', kind: 'pct', value: 0.5 }, 7), 3);
  assert.equal(sellQuantity({ etfId: 'X', kind: 'all', value: 0 }, 0), 0);
});

test('stratégie actuelle normalisée, écart à la cible', () => {
  const d = fixture();
  assert.deepEqual(currentStrategy(d), { AAA: 0.6, BBB: 0.4 });
  assert.equal(trackingGap({ A: 50, B: 50 }, { A: 0.5, B: 0.5 }), 0);
  assert.equal(Math.round(trackingGap({ A: 100 }, { A: 0.5, B: 0.5 })!), 50);
  assert.equal(trackingGap({ A: 1 }, {}), null);
});

test('vendre un ETF entier : produit net, achats en parts entières, frais comptés', () => {
  const d = fixture();
  const plan = planSellOne(d, 'p1', 'OLD', 'Vendre OLD');
  const r = computePlan(d, plan);
  assert.equal(r.sells.length, 1);
  assert.equal(r.sells[0].gross, 500);
  assert.equal(r.sells[0].net, 498);
  assert.equal(r.saleNet, 498);
  for (const b of r.buys) assert.ok(Number.isInteger(b.qty) && b.qty > 0);
  // budget = trésorerie + produit net ; rien ne dépasse
  assert.ok(r.buyCost + r.buyFees <= r.budget + 1e-6);
  assert.ok(Math.abs(r.cashAfter - (r.budget - r.buyCost - r.buyFees)) < 0.01);
  // l'ETF vendu disparaît, l'écart à la cible diminue
  assert.equal(r.rows.find((x) => x.key === 'OLD')!.qtyAfter, 0);
  assert.ok(r.gapAfter! < r.gapBefore!);
  // plus-value réalisée = produit net − coût de revient
  assert.equal(r.realizedGain, -3.92); // 498 − (500 + 1,92 de frais d'achat)
  assert.equal(r.linesBefore, 3);
  assert.ok(r.linesAfter <= 3);
});

test('tout passer sur un seul ETF : toutes les autres lignes sont vendues', () => {
  const d = fixture();
  const r = computePlan(d, planSingle(d, 'p2', 'WRLD', 'Tout en WRLD'));
  assert.equal(r.sells.length, 3);
  assert.ok(r.sells.every((s) => s.all));
  assert.equal(r.buys.length, 1);
  assert.equal(r.buys[0].key, 'WRLD');
  assert.equal(r.linesAfter, 1);
  assert.ok(r.topAfter > 0.99);
  // frais annuels : TER pondéré avant (0,2/0,5/1 %) > après (0,12 %)
  assert.ok(r.terAfter < r.terBefore);
  assert.equal(Math.round(r.terAfter * 10000) / 10000, 0.0012);
  assert.ok(r.annualSaving > 0);
  assert.ok(r.breakEvenMonths !== null && r.breakEvenMonths >= 1);
  // expositions : les pays passent à 70 % États-Unis / 30 % France
  const us = r.countries.rows.find((x) => x.label === 'États-Unis')!;
  assert.ok(Math.abs(us.after - 0.7) < 1e-9);
});

test('retrait : réduit le budget et signale un manque', () => {
  const d = fixture();
  const p = blankPlan(d, 'p3', 'Retrait');
  p.sells = [{ etfId: 'OLD', kind: 'all', value: 0 }];
  p.withdraw = 100000;
  const r = computePlan(d, p);
  assert.equal(r.budget, 0);
  assert.ok(r.warnings.includes('shortfall'));
  assert.ok(r.warnings.includes('withdraw'));
  assert.equal(r.buys.length, 0);
});

test('plan sans cible : aucun achat, avertissement', () => {
  const d = fixture();
  d.targetAllocation = {};
  const p = blankPlan(d, 'p4', 'Sans cible');
  p.deposit = 500;
  const r = computePlan(d, p);
  assert.ok(r.warnings.includes('noTarget'));
  assert.equal(r.buys.length, 0);
  assert.equal(r.gapBefore, null);
});

test('ETF du catalogue non suivi : cours indicatif signalé', () => {
  const d = fixture();
  d.catalog = [{ index: 'MSCI World', name: 'Cat World', isin: 'LU000', ticker: 'CWLD', exchange: 'PAR', category: 'Monde', peaEligible: true, ter: 0.0045, aumMEur: 5000, inceptionYear: 2020, holdingsCount: 1500, esg: false,
    replication: 'Synthétique', distribution: 'Capitalisant', unitPrice: 30, sectors: [sec('Finance', 0.2), sec('Santé', 0.8)], countries: [sec('États-Unis', 1)], comp: { kind: 'fiche', date: '2026-09-30' } }];
  const p = planSingle(d, 'p5', 'CWLD', 'Catalogue');
  const r = computePlan(d, p);
  assert.ok(r.warnings.includes('indicative'));
  assert.deepEqual(r.indicativeKeys, ['CWLD']);
  assert.ok(r.buys[0].key === 'CWLD' && r.buys[0].price === 30);
});

test('convergence sans vendre : déjà dans la cible, ou nombre de mois fini', () => {
  const held = [{ key: 'A', qty: 10, price: 10 }, { key: 'B', qty: 10, price: 10 }];
  assert.equal(monthsToConverge(held, { A: 0.5, B: 0.5 }, 100, 2), -1);
  const m = monthsToConverge(held, { A: 0.5, C: 0.5 }, 200, 2, { C: 10 });
  assert.ok(m !== null && m > 0 && m < 240);
  assert.equal(monthsToConverge(held, { A: 0.5, C: 0.5 }, 0, 2, { C: 10 }), null);
});
