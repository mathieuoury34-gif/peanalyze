// Objectifs d'épargne : un capital à atteindre à une date. Fonctions pures, testées dans tests/goals.test.ts.
import type { AppData, DcaPhase, Goal } from './types';
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
  plannedMonthly: number; // versement mensuel prévu aujourd'hui (phase en cours du simulateur)
  phasesUsed: DcaPhase[]; // phases de versement du simulateur qui commencent avant l'échéance
  phasesLater: DcaPhase[]; // phases qui ne commencent qu'après l'échéance (sans effet sur cet objectif)
  projected: number; // capital estimé à l'échéance en suivant les phases de versement du simulateur
  scaleNeeded: number | null; // facteur par lequel multiplier tous les versements prévus pour atteindre l'objectif (null si rien n'est prévu)
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

/** Versement mensuel de la phase en cours pendant l'année `year` du simulateur (1 = les 12 premiers mois), comme `simulate`. */
export function monthlyAt(phases: DcaPhase[], year: number): number {
  let m = 0;
  for (const p of phases.slice().sort((a, b) => a.fromYear - b.fromYear)) if (year >= p.fromYear) m = p.monthly;
  return m;
}

/** Capital après `n` mois si les versements suivent les phases du simulateur (la phase change à chaque début d'année du simulateur). */
export function projectedWithPhases(current: number, phases: DcaPhase[], n: number, rate: number): number {
  const i = Math.pow(1 + rate, 1 / 12) - 1;
  let v = current;
  for (let k = 1; k <= n; k++) v = v * (1 + i) + monthlyAt(phases, Math.ceil(k / 12));
  return v;
}

export function goalProgress(data: AppData, goal: Goal, current = computeSummary(data).totalValue): GoalProgress {
  const vd = valuationDate(data);
  const months = goal.date <= vd ? 0 : monthsBetween(vd, goal.date);
  const rate = data.simulation.annualRate;
  const phases = data.simulation.dcaPhases.slice().sort((a, b) => a.fromYear - b.fromYear);
  const planned = monthlyAt(phases, 1);
  const lastYear = Math.max(1, Math.ceil(months / 12));
  const phasesUsed = phases.filter((p) => p.fromYear <= lastYear);
  const phasesLater = phases.filter((p) => p.fromYear > lastYear);
  const overdue = goal.date <= vd && current < goal.target;
  const remaining = Math.max(0, goal.target - current);
  const projected = projectedWithPhases(current, phases, months, rate);
  // les versements sont linéaires : un facteur unique les ajuste pour atteindre exactement l'objectif
  const contrib = projectedWithPhases(0, phases, months, rate);
  const grown = projectedWithPhases(current, [], months, rate);
  const scaleNeeded = months > 0 && contrib > 0 && projected < goal.target ? Math.max(0, (goal.target - grown) / contrib) : null;
  return {
    current, ratio: goal.target > 0 ? Math.min(1, current / goal.target) : 0, remaining, months,
    reached: current >= goal.target, overdue,
    requiredWithReturn: months > 0 ? requiredMonthly(current, goal.target, months, rate) : null,
    requiredPlain: months > 0 ? remaining / months : null,
    plannedMonthly: planned, phasesUsed, phasesLater, projected, scaleNeeded, onTrack: months > 0 ? projected >= goal.target : null,
  };
}
