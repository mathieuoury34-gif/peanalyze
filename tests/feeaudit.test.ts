import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { BROKERS, STALE_DAYS, offerActive, orderFee, orderFees, tariffAlert, transferRefundOf, yearCost } from '../src/domain/brokers';
import { compareBrokers, scenarioOf } from '../src/domain/brokerCompare';
import { computePositions } from '../src/domain/calc';
import { auditFees, fitGrid } from '../src/domain/feeAudit';
import type { Transaction } from '../src/domain/types';

const B = (id: string) => BROKERS.find((b) => b.id === id)!;

test('Crédit Agricole : Initial = 0,5 % ; Intégral = dégressif et abonnement offert à 12 ordres', () => {
  const ini = B('ca-initial'), int = B('ca-integral');
  assert.equal(orderFee(ini, 1000), 5);
  assert.ok(Math.abs(orderFee(int, 400) - 1.92) < 1e-9);
  assert.equal(orderFee(int, 800), 1.44);
  assert.equal(orderFee(int, 2000), 2.4);
  const few = Array.from({ length: 5 }, (_, i) => ({ date: `2026-0${i + 1}-05`, amount: 500, side: 'buy' as const }));
  const many = Array.from({ length: 12 }, (_, i) => ({ date: `2026-${String(i + 1).padStart(2, '0')}-05`, amount: 500, side: 'buy' as const }));
  assert.equal(yearCost(int, few, 10000).inactivity, 96);
  assert.equal(yearCost(int, many, 10000).inactivity, 0);
  assert.equal(yearCost(ini, many, 10000).custody, 30); // 0,3 % de 10 000 €
});
test('orderFees : même résultat que yearCost, premier ordre gratuit du mois attribué au plus ancien', () => {
  const f = B('fortuneo');
  const orders = [
    { date: '2026-03-20', amount: 300, side: 'buy' as const },
    { date: '2026-03-02', amount: 300, side: 'buy' as const },
  ];
  const fees = orderFees(f, orders);
  assert.deepEqual(fees, [1.05, 0]); // le 2 mars est le premier du mois, donc gratuit
  assert.equal(yearCost(f, orders, 0).brokerage, 1.05);
});
test('offres : transfert remboursé tant que l’offre court, jamais pour un courtier sans offre', () => {
  assert.equal(transferRefundOf(B('boursobank'), '2026-10-18'), 3000);
  assert.equal(transferRefundOf(B('saxo'), '2026-10-18'), 150);
  assert.equal(transferRefundOf(B('traderepublic'), '2026-10-18'), 0);
  assert.equal(offerActive(B('fortuneo'), '2026-12-31'), true);
  assert.equal(offerActive(B('fortuneo'), '2027-01-01'), false);
  assert.equal(transferRefundOf({ ...B('saxo'), offer: { text: 'x', until: '2026-01-01' } }, '2026-10-18'), 0);
});
test('comparaison : transfert remboursé = rien à rentabiliser ; ETF absent signalé', () => {
  const d = fixture();
  d.settings.feePerOrder = 5;
  const pos = computePositions(d);
  d.settings.brokerEtf = { saxo: { AAA: 'yes', BBB: 'no' } };
  const rows = compareBrokers(d, scenarioOf(d, pos, 'planned', 600, false), '2026-10-18');
  const sx = rows.find((r) => r.broker.id === 'saxo')!;
  assert.equal(sx.refund, sx.exit); // 3 lignes : 45 € < 150 €
  assert.equal(sx.exitNet, 0);
  assert.equal(sx.paybackMonths, null);
  assert.deepEqual(sx.etf.ok, ['AAA']);
  assert.deepEqual(sx.etf.no, ['BBB']);
  assert.ok(sx.etf.unknown.includes('OLD'));
  const cur = rows.find((r) => r.current)!;
  assert.deepEqual(cur.etf, { ok: [], no: [], unknown: [] });
});
test('alerte tarifs : périmés après 6 mois, ou page modifiée depuis le relevé', () => {
  const b = { ...B('xtb'), checked: '2026-01-01' };
  assert.equal(tariffAlert(b, undefined, '2026-04-01').stale, false);
  assert.equal(tariffAlert(b, undefined, '2026-07-10').stale, STALE_DAYS < 190);
  const a = tariffAlert(b, { changedAt: '2026-03-01' }, '2026-03-02');
  assert.equal(a.changedOn, '2026-03-01');
  assert.equal(tariffAlert(b, { changedAt: '2025-12-31' }, '2026-03-02').changedOn, undefined); // changement antérieur au relevé
  assert.equal(tariffAlert({ ...b, checked: '' }, undefined, '2030-01-01').days, null); // grille saisie : jamais « périmée »
});

function journal(d: ReturnType<typeof fixture>, rows: [string, number, number][]) {
  d.transactions = rows.map(([date, price, fees], i): Transaction => ({ id: 'x' + i, date, etfId: 'AAA', unitPrice: price, quantity: 1, grossAmount: price + fees, fees, feeRefund: 0 }));
}
test('audit : les ordres conformes à la grille ne sont pas signalés', () => {
  const d = fixture();
  d.settings.feePerOrder = 2;
  journal(d, [['2026-01-10', 100, 2], ['2026-02-10', 120, 2], ['2026-03-10', 90, 2]]);
  const a = auditFees(d);
  assert.equal(a.flagged.length, 0);
  assert.equal(a.paidTotal, 6);
  assert.equal(a.expectedTotal, 6);
});
test('audit : écart de frais et montant improbable repérés, du plus grand écart au plus petit', () => {
  const d = fixture();
  d.settings.feePerOrder = 2;
  journal(d, [['2026-01-10', 100, 2], ['2026-02-10', 120, 3.5], ['2026-03-10', 90, 19.2], ['2026-04-10', 90, 0.2]]);
  const a = auditFees(d);
  assert.deepEqual(a.flagged.map((r) => r.id), ['x2', 'x3', 'x1']);
  assert.equal(a.flagged[0].kind, 'odd'); // 19,20 € sur 90 € : plus de 5 € et 5 %
  assert.equal(a.flagged[1].kind, 'lower'); // 0,20 € au lieu de 2 € : écart de 1,80 €
  assert.equal(a.flagged[2].kind, 'higher'); // 3,50 € au lieu de 2 € : écart de 1,50 €
});
test('audit : une offre à date limite est jugée à la date de l’ordre', () => {
  const d = fixture();
  d.settings.brokerId = 'fortuneo';
  d.etfs[0].name = 'Amundi MSCI World';
  journal(d, [['2026-12-30', 600, 0], ['2027-01-15', 600, 0]]); // 2 ordres de 600 € : gratuit avant le 31/12/2026, 2,10 € ensuite
  const a = auditFees(d);
  assert.equal(a.rows[0].expected, 0);
  assert.equal(a.rows[1].expected, 2.1);
  assert.equal(a.flagged.length, 1);
});
test('grille proposée : retrouve un forfait fixe, et ne propose rien sans assez d’ordres', () => {
  const d = fixture();
  d.settings.brokerId = 'saxo'; // 0,08 %, min 2 €
  journal(d, [['2026-01-10', 100, 1.92], ['2026-02-10', 300, 1.92], ['2026-03-10', 250, 1.92], ['2026-04-10', 700, 1.92], ['2026-05-10', 90, 1.92], ['2026-06-10', 500, 1.92]]);
  const a = auditFees(d);
  assert.ok(a.fit);
  assert.equal(a.fit!.feePerOrder, 1.92);
  assert.equal(a.fit!.feePct, 0);
  assert.equal(a.fit!.within, 6);
  assert.ok(a.fit!.withinNow < 6);
  assert.equal(fitGrid(a.rows.slice(0, 3)), null);
});
test('grille proposée : retrouve un pourcentage du montant', () => {
  const d = fixture();
  d.settings.brokerId = 'xtb'; // 0 %
  journal(d, [['2026-01-10', 100, 0.5], ['2026-02-10', 400, 2], ['2026-03-10', 1000, 5], ['2026-04-10', 200, 1], ['2026-05-10', 600, 3], ['2026-06-10', 800, 4]]);
  const fit = auditFees(d).fit!;
  assert.equal(fit.feePerOrder, 0);
  assert.equal(fit.feePct, 0.005);
  assert.equal(fit.within, 6);
});

test('disponibilité des ETF : relevés par ISIN ou « tout Euronext », la réponse de l’utilisateur l’emporte, jamais « absent » sans confirmation', () => {
  const d = fixture();
  d.settings.feePerOrder = 5;
  d.etfs[0].isin = 'FR0011550185'; // dans la liste Trade Republic
  const pos = computePositions(d);
  const sc = scenarioOf(d, pos, 'planned', 600, false);
  const rows = compareBrokers(d, sc, '2026-10-18');
  const tr = rows.find((r) => r.broker.id === 'traderepublic')!;
  assert.ok(tr.etf.ok.includes('AAA'));
  assert.ok(tr.etf.unknown.includes('BBB')); // ISIN absent de la liste : à vérifier, pas « absent »
  assert.equal(tr.etf.no.length, 0);
  const bd = rows.find((r) => r.broker.id === 'boursedirect')!;
  assert.deepEqual(bd.etf.unknown, []); // « tous les ETF d’Euronext »
  d.settings.brokerEtf = { boursedirect: { AAA: 'no' } };
  const bd2 = compareBrokers(d, sc, '2026-10-18').find((r) => r.broker.id === 'boursedirect')!;
  assert.deepEqual(bd2.etf.no, ['AAA']); // la réponse de l’utilisateur l’emporte
});
test('XTB refuse le transfert d’un PEA existant ; Fortuneo ne rembourse qu’à partir de 5 000 € transférés', () => {
  const d = fixture();
  d.settings.feePerOrder = 5;
  const pos = computePositions(d);
  const sc = scenarioOf(d, pos, 'planned', 600, false);
  const rows = compareBrokers(d, sc, '2026-10-18');
  assert.equal(rows.find((r) => r.broker.id === 'xtb')!.noTransfer, true);
  assert.equal(rows.find((r) => r.broker.id === 'traderepublic')!.noTransfer, false);
  // portefeuille de la fixture : 2 000 € < 5 000 € → pas de remboursement chez Fortuneo
  assert.equal(rows.find((r) => r.broker.id === 'fortuneo')!.refund, 0);
  const big = { ...sc, portfolioValue: 20000 };
  const f = compareBrokers(d, big, '2026-10-18').find((r) => r.broker.id === 'fortuneo')!;
  assert.equal(f.refund, f.exit);
  assert.equal(transferRefundOf(B('fortuneo'), '2027-02-01', 20000), 0); // offre terminée
});
test('Saxo : achats d’ETF Amundi sans courtage jusqu’au 31/12/2026, vente facturée', () => {
  const sx = B('saxo');
  assert.equal(orderFee(sx, 300, { etfName: 'Amundi PEA Nasdaq-100', today: '2026-10-18' }), 0);
  assert.equal(orderFee(sx, 300, { etfName: 'Amundi PEA Nasdaq-100', today: '2027-01-02' }), 2);
  assert.equal(orderFee(sx, 300, { etfName: 'Amundi PEA Nasdaq-100', side: 'sell', today: '2026-10-18' }), 2);
  assert.equal(orderFee(sx, 300, { etfName: 'BNP Paribas Easy S&P 500', today: '2026-10-18' }), 2);
});
