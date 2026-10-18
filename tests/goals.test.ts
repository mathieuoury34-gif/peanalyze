import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { goalProgress, monthlyAt, monthsBetween, projectedValue, projectedWithPhases, requiredMonthly } from '../src/domain/goals';

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

test('phases de versement : la projection suit les paliers du simulateur', () => {
  const phases = [{ fromYear: 1, monthly: 400 }, { fromYear: 3, monthly: 800 }];
  assert.equal(monthlyAt(phases, 1), 400);
  assert.equal(monthlyAt(phases, 2), 400);
  assert.equal(monthlyAt(phases, 3), 800);
  // sans rendement : 24 mois à 400 € + 12 mois à 800 €
  assert.equal(projectedWithPhases(1000, phases, 36, 0), 1000 + 24 * 400 + 12 * 800);
  // une phase unique donne le même résultat que le versement constant
  assert.ok(Math.abs(projectedWithPhases(1000, [{ fromYear: 1, monthly: 300 }], 60, 0.05) - projectedValue(1000, 300, 60, 0.05)) < 1e-6);
});
test('objectif : les phases postérieures à l’échéance sont écartées, les autres comptent', () => {
  const d = fixture();
  d.simulation = { initialCapital: 0, horizonYears: 20, annualRate: 0.05, dcaPhases: [{ fromYear: 1, monthly: 400 }, { fromYear: 4, monthly: 800 }, { fromYear: 10, monthly: 1000 }] };
  const short = goalProgress(d, { id: 'a', name: 'a', target: 50000, date: '2029-06-30', createdAt: '' }, 2000); // environ 2 ans 8 mois
  assert.deepEqual(short.phasesUsed.map((x) => x.fromYear), [1]);
  assert.deepEqual(short.phasesLater.map((x) => x.fromYear), [4, 10]);
  const long = goalProgress(d, { id: 'b', name: 'b', target: 500000, date: '2036-10-09', createdAt: '' }, 2000); // 10 ans
  assert.deepEqual(long.phasesUsed.map((x) => x.fromYear), [1, 4, 10]);
  assert.deepEqual(long.phasesLater, []);
  // avec les paliers, on projette plus qu'avec le seul premier versement
  assert.ok(long.projected > projectedValue(2000, 400, long.months, 0.05));
  // le facteur demandé amène exactement à l'objectif
  const k = long.scaleNeeded!;
  assert.ok(k > 1);
  const grown = projectedWithPhases(2000, [], long.months, 0.05);
  const contrib = projectedWithPhases(0, d.simulation.dcaPhases, long.months, 0.05);
  assert.ok(Math.abs(grown + k * contrib - 500000) < 0.5);
});
