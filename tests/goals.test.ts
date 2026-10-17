import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { goalProgress, monthsBetween, projectedValue, requiredMonthly } from '../src/domain/goals';

test('versement requis : il redonne bien l’objectif quand on le projette', () => {
  const m = requiredMonthly(1000, 20000, 120, 0.06);
  assert.ok(Math.abs(projectedValue(1000, m, 120, 0.06) - 20000) < 0.01);
  assert.ok(m > 0);
});
test('versement requis : sans rendement, simple division ; objectif déjà atteint = 0', () => {
  assert.equal(requiredMonthly(1000, 2200, 12, 0), 100);
  assert.equal(requiredMonthly(5000, 2000, 12, 0.05), 0);
});
test('mois entiers entre deux dates', () => {
  assert.equal(monthsBetween('2026-10-09', '2027-01-30'), 3);
  assert.equal(monthsBetween('2026-10-09', '2026-01-01'), 0);
});
test('progression d’un objectif', () => {
  const d = fixture();
  d.simulation = { initialCapital: 0, horizonYears: 10, annualRate: 0.05, dcaPhases: [{ fromYear: 1, monthly: 300 }] };
  const g = { id: 'g', name: 'Maison', target: 30000, date: '2036-10-09', createdAt: '' };
  const p = goalProgress(d, g, 2000);
  assert.equal(p.ratio, 2000 / 30000);
  assert.equal(p.remaining, 28000);
  assert.ok(p.months > 100);
  assert.ok(p.requiredWithReturn! < p.requiredPlain!);
  assert.equal(p.plannedMonthly, 300);
  assert.equal(p.onTrack, p.projected >= 30000);
  assert.equal(goalProgress(d, g, 40000).reached, true);
  const old = goalProgress(d, { ...g, date: '2020-01-01' }, 2000);
  assert.equal(old.overdue, true);
  assert.equal(old.requiredWithReturn, null);
});
