// Comparaison de courtiers : mes ordres (réels ou prévus) rejoués avec la grille de chaque courtier. Fonctions pures, testées.
import type { AppData, Position } from './types';
import { BROKERS, brokerOf, transferOutCost, yearCost, type Broker, type CostOrder, type YearCost } from './brokers';
import { valuationDate } from './calc';
import { monthlyAt } from './goals';

export type Basis = 'real' | 'planned';

export interface Scenario {
  orders: CostOrder[];
  /** Versement mensuel moyen représenté par ces ordres. */
  monthly: number;
  portfolioValue: number;
  lines: number;
  basis: Basis;
}

const nameOf = (data: AppData, id: string) => data.etfs.find((e) => e.id === id)?.name ?? data.catalog.find((c) => c.ticker === id)?.name ?? '';
const monthAdd = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/** Versement mensuel prévu : phase en cours du simulateur, sinon moyenne des virements des 12 derniers mois. */
export function plannedMonthly(data: AppData): number {
  const phase = monthlyAt(data.simulation.dcaPhases, 1);
  if (phase > 0) return phase;
  const vd = valuationDate(data);
  const cut = new Date(Date.parse(vd + 'T00:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
  const sum = data.deposits.filter((d) => d.date > cut && d.amount > 0).reduce((s, d) => s + d.amount, 0);
  return Math.round(sum / 12);
}

/** Les ordres d'une année type : ceux des 12 derniers mois, ou le versement mensuel réparti selon la stratégie. */
export function scenarioOf(data: AppData, positions: Position[], basis: Basis, monthly: number, scheduled: boolean): Scenario {
  const held = positions.filter((p) => p.quantity > 0);
  const portfolioValue = held.reduce((s, p) => s + p.marketValue, 0);
  const vd = valuationDate(data);
  if (basis === 'real') {
    const cut = new Date(Date.parse(vd + 'T00:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
    const recent = data.transactions.filter((t) => t.date > cut && t.quantity !== 0);
    const orders: CostOrder[] = recent.map((t) => ({ date: t.date, amount: Math.abs(t.unitPrice * t.quantity), side: t.quantity > 0 ? 'buy' : 'sell', etfName: nameOf(data, t.etfId), scheduled: scheduled && t.quantity > 0 }));
    const invested = recent.filter((t) => t.quantity > 0).reduce((s, t) => s + t.unitPrice * t.quantity, 0);
    return { orders, monthly: invested / 12, portfolioValue, lines: held.length, basis };
  }
  const strat = Object.entries(data.targetAllocation).filter(([, w]) => w > 0);
  const weights = strat.length ? strat : held.length ? held.map((p): [string, number] => [p.etfId, 1]) : [['', 1] as [string, number]];
  const total = weights.reduce((s, [, w]) => s + w, 0) || 1;
  const orders: CostOrder[] = [];
  const first = monthAdd(vd.slice(0, 7), 1);
  for (let m = 0; m < 12; m++) {
    for (const [id, w] of weights) {
      const amount = (monthly * w) / total;
      if (amount > 0) orders.push({ date: monthAdd(first, m) + '-05', amount, side: 'buy', etfName: nameOf(data, id), scheduled });
    }
  }
  return { orders, monthly, portfolioValue, lines: Math.max(held.length, weights.length), basis };
}

export interface BrokerRow {
  broker: Broker;
  current: boolean;
  cost: YearCost;
  /** Écart annuel avec le courtier actuel : négatif = économie. */
  diff: number;
  /** Frais de sortie du courtier actuel si l'on change (transfert), 0 pour le courtier actuel. */
  exit: number;
  /** Mois pour rentabiliser les frais de sortie grâce à l'économie ; null si pas d'économie ou pas de frais. */
  paybackMonths: number | null;
  /** Capital supplémentaire à l'horizon du simulateur si l'économie annuelle est investie chaque mois. */
  gainAtHorizon: number;
}

/** Valeur future d'une économie annuelle `perYear`, investie par douzièmes, au rendement annuel `rate`, sur `years` ans. */
export function savingsFutureValue(perYear: number, rate: number, years: number): number {
  const i = Math.pow(1 + rate, 1 / 12) - 1;
  const n = Math.round(years * 12);
  const m = perYear / 12;
  return i === 0 ? m * n : (m * (Math.pow(1 + i, n) - 1)) / i;
}

export function compareBrokers(data: AppData, sc: Scenario, today?: string): BrokerRow[] {
  const cur = brokerOf(data.settings);
  const list = [cur, ...BROKERS.filter((b) => b.id !== cur.id)];
  const base = yearCost(cur, sc.orders, sc.portfolioValue, today);
  const rate = data.simulation.annualRate;
  const years = data.simulation.horizonYears;
  return list.map((b) => {
    const cost = b.id === cur.id ? base : yearCost(b, sc.orders, sc.portfolioValue, today);
    const diff = cost.total - base.total;
    const exit = b.id === cur.id ? 0 : transferOutCost(sc.lines);
    const saving = -diff;
    return {
      broker: b, current: b.id === cur.id, cost, diff, exit,
      paybackMonths: saving > 0 && exit > 0 ? Math.ceil((exit / saving) * 12) : null,
      gainAtHorizon: saving > 0 ? savingsFutureValue(saving, rate, years) : -savingsFutureValue(-saving, rate, years),
    };
  }).sort((a, b) => a.cost.total - b.cost.total || (a.current ? -1 : 1));
}
