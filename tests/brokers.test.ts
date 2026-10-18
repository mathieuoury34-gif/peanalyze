import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { BROKERS, brokerOf, customBroker, feeFnOf, orderFee, transferOutCost, yearCost } from '../src/domain/brokers';
import { compareBrokers, savingsFutureValue, scenarioOf } from '../src/domain/brokerCompare';
import { assistant } from '../src/domain/calc';
import { computePositions } from '../src/domain/calc';

const B = (id: string) => BROKERS.find((b) => b.id === id)!;

test('grille personnalisée : frais fixes + pourcentage', () => {
  const b = customBroker({ feePerOrder: 1.92, feePct: 0.001, annualFee: 0, annualPct: 0 });
  assert.equal(orderFee(b, 100), 2.02);
  assert.equal(orderFee(b, 0), 0);
});
test('Trade Republic : 1 € par ordre, plafonné à 0,5 % sous 200 €, 0 € en investissement programmé', () => {
  const tr = B('traderepublic');
  assert.equal(orderFee(tr, 100), 0.5);
  assert.equal(orderFee(tr, 150), 0.75);
  assert.equal(orderFee(tr, 500), 1);
  assert.equal(orderFee(tr, 500, { scheduled: true }), 0);
});
test('BoursoBank : 1,99 € plafonné à 0,5 %, puis 0,5 % ; achats ETF iShares gratuits dès 100 €', () => {
  const bb = B('boursobank');
  assert.equal(orderFee(bb, 300, { etfName: 'Amundi MSCI World' }), 1.5);
  assert.equal(orderFee(bb, 450, { etfName: 'Amundi MSCI World' }), 1.99);
  assert.equal(orderFee(bb, 1000, { etfName: 'Amundi MSCI World' }), 5);
  assert.equal(orderFee(bb, 1000, { etfName: 'iShares MSCI World Swap PEA', side: 'buy' }), 0);
  assert.equal(orderFee(bb, 1000, { etfName: 'iShares MSCI World Swap PEA', side: 'sell' }), 5);
  assert.equal(orderFee(bb, 50, { etfName: 'iShares MSCI World Swap PEA' }), 0.25); // sous le seuil : tarif normal
});
test('Bourse Direct : paliers puis 0,09 %', () => {
  const bd = B('boursedirect');
  assert.equal(orderFee(bd, 100), 0.5);
  assert.equal(orderFee(bd, 400), 0.99);
  assert.equal(orderFee(bd, 800), 1.9);
  assert.equal(orderFee(bd, 3000), 3.8);
  assert.equal(orderFee(bd, 10000), 9);
});
test('Saxo : minimum 2 € ; offre Amundi de Fortuneo limitée dans le temps', () => {
  assert.equal(orderFee(B('saxo'), 100), 2);
  assert.equal(orderFee(B('saxo'), 5000), 4);
  const fo = B('fortuneo');
  assert.equal(orderFee(fo, 1000, { etfName: 'Amundi MSCI World', today: '2026-11-01' }), 0);
  assert.equal(orderFee(fo, 1000, { etfName: 'Amundi MSCI World', today: '2027-01-02' }), 3.5);
});
test('Fortuneo : le premier ordre du mois (≤ 500 €) est gratuit', () => {
  const fo = B('fortuneo');
  const orders = [
    { date: '2026-03-02', amount: 300, side: 'buy' as const }, { date: '2026-03-02', amount: 300, side: 'buy' as const },
    { date: '2026-04-02', amount: 600, side: 'buy' as const },
  ];
  const c = yearCost(fo, orders, 10000, '2026-10-18');
  assert.ok(Math.abs(c.brokerage - (1.05 + 2.1)) < 1e-9); // 2e ordre de mars à 0,35 % + ordre d'avril de 600 €
  assert.equal(c.freeOrders, 1);
});
test('coût annuel : tenue de compte, inactivité et ordres sous le minimum', () => {
  const b = { ...customBroker({ feePerOrder: 1, feePct: 0, annualFee: 10, annualPct: 0.002 }), inactivity: { fee: 96, minOrders: 12 }, minOrder: 200 };
  const c = yearCost(b, [{ date: '2026-01-05', amount: 100, side: 'buy' }, { date: '2026-02-05', amount: 400, side: 'buy' }], 5000);
  assert.equal(c.brokerage, 2);
  assert.equal(c.custody, 10 + 10);
  assert.equal(c.inactivity, 96);
  assert.equal(c.belowMin, 1);
  assert.equal(c.total, 2 + 20 + 96);
});
test('le courtier choisi dans les réglages pilote feeFnOf', () => {
  const d = fixture();
  assert.equal(brokerOf(d.settings).id, 'custom');
  assert.equal(feeFnOf(d)(100), 2); // fixture : 2 € par ordre
  d.settings.brokerId = 'traderepublic';
  assert.equal(feeFnOf(d)(100), 0.5);
  d.settings.brokerId = 'boursobank';
  d.etfs[0].name = 'iShares Core';
  assert.equal(feeFnOf(d)(1000, { etfId: 'AAA' }), 0);
  assert.equal(feeFnOf(d)(1000, { etfId: 'BBB' }), 5);
});
test('assistant : frais fixes inchangés, frais variables pris en compte', () => {
  const items = [{ id: 'A', price: 100, value: 0, target: 0.5 }, { id: 'B', price: 50, value: 0, target: 0.5 }];
  const flat = assistant(items, 1000, 'target', 2);
  assert.equal(flat.fees, 4);
  const pctFee = assistant(items, 1000, 'target', (a) => a * 0.01);
  assert.ok(pctFee.fees > 8 && pctFee.fees < 10.2, String(pctFee.fees));
  assert.ok(pctFee.total + pctFee.fees <= 1000 + 1e-9);
  const reb = assistant(items, 1000, 'rebalance', (a) => a * 0.01);
  assert.ok(reb.total + reb.fees <= 1000 + 1e-9);
});
test('comparaison : le courtier actuel est de référence, tri par coût croissant', () => {
  const d = fixture();
  const pos = computePositions(d);
  d.settings.feePerOrder = 5;
  const sc = scenarioOf(d, pos, 'planned', 600, false);
  assert.equal(sc.orders.length, 24); // 2 ETF en stratégie × 12 mois
  assert.ok(Math.abs(sc.orders.reduce((s, o) => s + o.amount, 0) - 7200) < 1e-6);
  const rows = compareBrokers(d, sc, '2026-10-18');
  const cur = rows.find((r) => r.current)!;
  assert.equal(cur.cost.brokerage, 24 * 5);
  assert.equal(cur.diff, 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].cost.total <= rows[i].cost.total);
  const tr = rows.find((r) => r.broker.id === 'traderepublic')!;
  assert.ok(tr.diff < 0 && tr.exit > 0 && tr.paybackMonths !== null && tr.gainAtHorizon > -tr.diff);
  const sched = compareBrokers(d, scenarioOf(d, pos, 'planned', 600, true), '2026-10-18').find((r) => r.broker.id === 'traderepublic')!;
  assert.equal(sched.cost.brokerage, 0);
});
test('valeur future de l’économie et frais de transfert plafonnés', () => {
  assert.equal(savingsFutureValue(120, 0, 10), 1200);
  assert.ok(savingsFutureValue(120, 0.05, 10) > 1200);
  assert.equal(transferOutCost(3), 45);
  assert.equal(transferOutCost(30), 150);
});
