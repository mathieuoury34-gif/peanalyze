// Ventes et retraits : PRU conservé, plus-value réalisée, espèces, TRI
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cashBalance, computePositions, computeSummary, holdingAt, ledger } from '../src/domain/calc';
import { fixture } from './fixture';

const r2 = (v: number) => Math.round(v * 100) / 100;
const sell = (id: string, date: string, etfId: string, price: number, qty: number, fee = 2) => ({
  id, date, etfId, unitPrice: price, quantity: -qty, grossAmount: -(price * qty - fee), fees: fee, feeRefund: 0,
});

test('vente partielle : le PRU ne bouge pas, le coût de revient sort au PRU', () => {
  const d = fixture();
  const before = computePositions(d).find((p) => p.etfId === 'AAA')!; // 10 × 100 + 1,92 de frais
  assert.equal(r2(before.pru), 100.19);
  d.transactions.push(sell('s1', '2026-03-01', 'AAA', 110, 4));
  const p = computePositions(d).find((x) => x.etfId === 'AAA')!;
  assert.equal(p.quantity, 6);
  assert.equal(r2(p.pru), 100.19);
  assert.equal(r2(p.costBasis), r2(6 * 100.192));
  // produit net 4 × 110 − 2 = 438 ; coût sorti 4 × 100,192 = 400,77 ; plus-value 37,23
  assert.equal(r2(p.realizedPnl), r2(438 - 4 * 100.192));
  assert.equal(r2(ledger(d.transactions).sales.get('s1')!.gain), 37.23);
});

test('espèces : une vente crédite le net, un retrait les diminue', () => {
  const d = fixture();
  const c0 = cashBalance(d);
  d.transactions.push(sell('s1', '2026-03-01', 'AAA', 110, 4));
  assert.equal(r2(cashBalance(d)), r2(c0 + 438));
  d.deposits.push({ id: 'w1', date: '2026-03-02', amount: -300 });
  assert.equal(r2(cashBalance(d)), r2(c0 + 438 - 300));
});

test('vente totale : ligne soldée, coût remis à zéro, plus-value réalisée conservée', () => {
  const d = fixture();
  d.transactions.push(sell('s1', '2026-03-01', 'OLD', 22, 25));
  const p = computePositions(d).find((x) => x.etfId === 'OLD')!;
  assert.equal(p.quantity, 0);
  assert.equal(p.costBasis, 0);
  assert.equal(r2(p.realizedPnl), r2(25 * 22 - 2 - 501.92));
  const s = computeSummary(d);
  assert.equal(s.lines, 2);
  assert.equal(r2(s.realizedPnl), r2(p.realizedPnl));
});

test('achat, vente, nouvel achat : le PRU suit l\'ordre chronologique', () => {
  const d = fixture();
  d.transactions = [
    { id: 'a', date: '2026-01-01', etfId: 'AAA', unitPrice: 100, quantity: 10, grossAmount: 1000, fees: 0, feeRefund: 0 },
    sell('b', '2026-02-01', 'AAA', 100, 5, 0),
    { id: 'c', date: '2026-03-01', etfId: 'AAA', unitPrice: 200, quantity: 5, grossAmount: 1000, fees: 0, feeRefund: 0 },
  ];
  const p = computePositions(d).find((x) => x.etfId === 'AAA')!;
  assert.equal(p.quantity, 10);
  assert.equal(p.costBasis, 1500); // 500 restants + 1000
  assert.equal(p.pru, 150);
  assert.equal(p.realizedPnl, 0);
});

test('parts détenues à une date, en ignorant une opération', () => {
  const d = fixture();
  d.transactions.push(sell('s1', '2026-03-01', 'AAA', 110, 4));
  assert.equal(holdingAt(d.transactions, 'AAA', '2026-02-01').quantity, 10);
  assert.equal(holdingAt(d.transactions, 'AAA', '2026-03-01').quantity, 6);
  assert.equal(holdingAt(d.transactions, 'AAA', '2026-03-01', 's1').quantity, 10);
});

test('vente supérieure aux parts détenues : limitée aux parts disponibles', () => {
  const d = fixture();
  d.transactions.push(sell('s1', '2026-03-01', 'AAA', 110, 15));
  assert.equal(computePositions(d).find((x) => x.etfId === 'AAA')!.quantity, 0);
});

test('TRI : un retrait compte comme un flux sortant du PEA', () => {
  const d = fixture();
  const a = computeSummary(d).totalDeposited;
  d.deposits.push({ id: 'w1', date: '2026-03-02', amount: -300 });
  const s = computeSummary(d);
  assert.equal(s.totalDeposited, a - 300);
  assert.ok(s.annualizedReturnXirr === null || isFinite(s.annualizedReturnXirr));
});
