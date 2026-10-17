import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { reminderState } from '../src/domain/reminder';

test('rappel désactivé sans jour', () => {
  assert.equal(reminderState(fixture(), '2026-10-17'), null);
});
test('rappel : à faire dès le jour choisi tant qu’aucun achat n’est enregistré ce mois-ci', () => {
  const d = fixture();
  d.settings.reminderDay = 5;
  assert.equal(reminderState(d, '2026-10-04')!.due, false);
  assert.equal(reminderState(d, '2026-10-04')!.daysUntil, 1);
  assert.equal(reminderState(d, '2026-10-05')!.due, true);
  assert.equal(reminderState(d, '2026-10-20')!.due, true);
  d.transactions.push({ id: 'n', date: '2026-10-06', etfId: 'AAA', unitPrice: 100, quantity: 1, grossAmount: 101.92, fees: 1.92, feeRefund: 0 });
  const s = reminderState(d, '2026-10-20')!;
  assert.equal(s.due, false);
  assert.equal(s.boughtThisMonth, true);
  assert.equal(s.nextDate, '2026-11-05');
});
test('rappel : une vente ne compte pas comme un investissement ; changement d’année', () => {
  const d = fixture();
  d.settings.reminderDay = 28;
  d.transactions.push({ id: 's', date: '2026-12-02', etfId: 'AAA', unitPrice: 100, quantity: -1, grossAmount: -98, fees: 2, feeRefund: 0 });
  assert.equal(reminderState(d, '2026-12-28')!.due, true);
  d.transactions.push({ id: 'b', date: '2026-12-28', etfId: 'AAA', unitPrice: 100, quantity: 1, grossAmount: 102, fees: 2, feeRefund: 0 });
  assert.equal(reminderState(d, '2026-12-28')!.nextDate, '2027-01-28');
});
