// Objectifs d'épargne : un capital à atteindre à une date. Fonctions pures, testées dans tests/goals.test.ts.
import type { AppData, Goal } from './types';
import { computeSummary, valuationDate } from './calc';

export interface GoalProgress {
  current: number; // valorisation actuelle du PEA
  ratio: number; // 0–1 atteint
  remaining: number;
  months: number; // mois entiers restants (0 si l'échéance est passée)
  reached: boolean;
  overdue: boolean;
  requiredWithReturn: number | null; // versement mensuel nécessaire au rendement du simulateur ; null si échéance passée
  requiredPlain: number | null; // sans aucun rendement
  plannedMonthly: number; // versement mensuel prévu (1re phase du simulateur)
  projected: number; // capital estimé à l'échéance en continuant au rythme prévu
  onTrack: boolean | null; // projected ≥ objectif ; null si l'échéance est passée
}

export function monthsBetween(from: string, to: string): number {
  return Math.max(0, (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)));
}

/** Versement mensuel qui, ajouté chaque mois à un capital de départ, donne `target` après `n` mois au rendement annuel `rate`. */
export function requiredMonthly(current: number, target: number, n: number, rate: number): number {
  if (n <= 0) return Math.max(0, target - current);
  const i = Math.pow(1 + rate, 1 / 12) - 1;
  if (i === 0) return Math.max(0, (target - current) / n);
  const g = Math.pow(1 + i, n);
  return Math.max(0, ((target - current * g) * i) / (g - 1));
}

export function projectedValue(current: number, monthly: number, n: number, rate: number): number {
  const i = Math.pow(1 + rate, 1 / 12) - 1;
  let v = current;
  for (let k = 0; k < n; k++) v = v * (1 + i) + monthly;
  return v;
}

export function goalProgress(data: AppData, goal: Goal, current = computeSummary(data).totalValue): GoalProgress {
  const vd = valuationDate(data);
  const months = goal.date <= vd ? 0 : monthsBetween(vd, goal.date);
  const rate = data.simulation.annualRate;
  const planned = data.simulation.dcaPhases.length ? data.simulation.dcaPhases.slice().sort((a, b) => a.fromYear - b.fromYear)[0].monthly : 0;
  const overdue = goal.date <= vd && current < goal.target;
  const remaining = Math.max(0, goal.target - current);
  const projected = projectedValue(current, planned, months, rate);
  return {
    current, ratio: goal.target > 0 ? Math.min(1, current / goal.target) : 0, remaining, months,
    reached: current >= goal.target, overdue,
    requiredWithReturn: months > 0 ? requiredMonthly(current, goal.target, months, rate) : null,
    requiredPlain: months > 0 ? remaining / months : null,
    plannedMonthly: planned, projected, onTrack: months > 0 ? projected >= goal.target : null,
  };
}
