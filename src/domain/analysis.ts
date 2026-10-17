// Analyse du portefeuille : comparaison à un ETF de référence, recoupements entre ETF, risque et coût de détention.
// Fonctions pures, testées dans tests/analysis.test.ts. Aucune ne modifie les données.
import type { AppData, Etf, Position, Simulation } from './types';
import { displayHistory, etfById, monthEnd, nextMonth, portfolioValueAt, priceAt, simulate, valuationDate, compositionUsable } from './calc';

const round2 = (v: number) => Math.round(v * 100) / 100;

// ================================================================ 1. Comparaison avec un ETF de référence
export interface BenchPoint { date: string; mine: number; bench: number }
export interface BenchResult {
  benchId: string;
  from: string; // début de la comparaison (1er virement, ou début de l'historique des cours de la référence)
  to: string;
  startValue: number; // valeur du portefeuille à `from`, investie à la même date dans la référence
  netIn: number; // argent net versé depuis `from` (virements − retraits)
  mineEnd: number;
  benchEnd: number;
  mineGain: number; // valeur finale − argent mis (début + versements nets)
  benchGain: number;
  mineGainPct: number;
  benchGainPct: number;
  diff: number; // mineEnd − benchEnd
  shortened: boolean; // la comparaison commence après votre premier virement (historique de cours trop court)
  points: BenchPoint[];
}

/**
 * Que serait devenu mon argent s'il avait été placé dans un seul ETF de référence aux mêmes dates ?
 * Les virements (et retraits) sont rejoués à l'identique dans la référence, au cours de clôture du jour.
 * Si l'historique de cours de la référence est plus court que le vôtre, la comparaison démarre à sa première date,
 * avec la valeur que votre portefeuille avait ce jour-là.
 */
export function benchmarkCompare(data: AppData, benchId: string): BenchResult | null {
  const bench = etfById(data, benchId);
  if (!bench || !data.deposits.length) return null;
  const hist = displayHistory(bench);
  if (hist.length < 2) return null;
  const vd = valuationDate(data);
  const firstDeposit = data.deposits.reduce((m, d) => (d.date < m ? d.date : m), data.deposits[0].date);
  const from = firstDeposit > hist[0][0] ? firstDeposit : hist[0][0];
  if (from >= vd) return null;
  const startValue = portfolioValueAt(data, from, from >= vd);
  if (startValue <= 0) return null;
  const p0 = priceAt(bench, from);
  if (!p0) return null;
  const flows = data.deposits.filter((d) => d.date > from && d.date <= vd).sort((a, b) => (a.date < b.date ? -1 : 1));
  let units = startValue / p0;
  const unitsAt = (d: string) => {
    let u = startValue / p0;
    for (const f of flows) if (f.date <= d) { const p = priceAt(bench, f.date); if (p) u += f.amount / p; }
    return u;
  };
  for (const f of flows) { const p = priceAt(bench, f.date); if (p) units += f.amount / p; }

  const dates: string[] = [from];
  for (let ym = from.slice(0, 7); ym <= vd.slice(0, 7); ym = nextMonth(ym)) {
    const end = ym === vd.slice(0, 7) ? vd : monthEnd(ym);
    if (end > from && end !== dates[dates.length - 1]) dates.push(end);
  }
  const points: BenchPoint[] = dates.map((d) => ({
    date: d,
    mine: round2(portfolioValueAt(data, d, d >= vd)),
    bench: round2(unitsAt(d) * (priceAt(bench, d) ?? p0)),
  }));
  const netIn = flows.reduce((s, f) => s + f.amount, 0);
  const mineEnd = points[points.length - 1].mine;
  const benchEnd = round2(units * (priceAt(bench, vd) ?? p0));
  const put = startValue + netIn;
  return {
    benchId, from, to: vd, startValue: round2(startValue), netIn: round2(netIn), mineEnd, benchEnd,
    mineGain: round2(mineEnd - put), benchGain: round2(benchEnd - put),
    mineGainPct: put > 0 ? (mineEnd - put) / put : 0, benchGainPct: put > 0 ? (benchEnd - put) / put : 0,
    diff: round2(mineEnd - benchEnd), shortened: from > firstDeposit, points,
  };
}

// ================================================================ 2. Doublons et recoupements
export interface OverlapPair {
  a: string; b: string;
  countries: number | null; // 0–1 : Σ min des poids pays
  sectors: number | null;
  overlap: number; // moyenne des recoupements disponibles
  sameIndex: boolean;
  level: 'double' | 'high' | 'moderate' | 'low';
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'");
function minSum(a: { label: string; weight: number }[], b: { label: string; weight: number }[]): number {
  const m = new Map(b.map((x) => [norm(x.label), x.weight]));
  return a.reduce((s, x) => s + Math.min(x.weight, m.get(norm(x.label)) ?? 0), 0);
}
const sameIdx = (x: Etf, y: Etf) => norm(x.index) === norm(y.index);

/**
 * Recoupement entre deux ETF détenus : part du portefeuille qui serait « en double » si l'on achetait l'un puis l'autre.
 * Mesuré sur les compositions vérifiées (pays et secteurs) : Σ min(poids A, poids B). Ex. : un S&P 500 dans un MSCI World ≈ le poids des États-Unis.
 */
export function overlapPairs(data: AppData, positions: Position[]): OverlapPair[] {
  const held = positions.filter((p) => p.quantity > 0).map((p) => etfById(data, p.etfId)).filter((e): e is Etf => !!e);
  const out: OverlapPair[] = [];
  for (let i = 0; i < held.length; i++) {
    for (let j = i + 1; j < held.length; j++) {
      const x = held[i], y = held[j];
      const same = sameIdx(x, y);
      const ok = compositionUsable(x) && compositionUsable(y);
      const c = ok && x.countries.length && y.countries.length ? Math.min(1, minSum(x.countries, y.countries)) : null;
      const s = ok && x.sectors.length && y.sectors.length ? Math.min(1, minSum(x.sectors, y.sectors)) : null;
      const parts = [c, s].filter((v): v is number => v !== null);
      if (!parts.length && !same) continue;
      const overlap = same ? 1 : parts.reduce((a, v) => a + v, 0) / parts.length;
      out.push({ a: x.id, b: y.id, countries: c, sectors: s, overlap, sameIndex: same, level: same ? 'double' : overlap >= 0.75 ? 'high' : overlap >= 0.5 ? 'moderate' : 'low' });
    }
  }
  return out.sort((p, q) => q.overlap - p.overlap);
}

// ================================================================ 3. Risque
export interface RiskLine { etfId: string; volatility: number | null; maxDrawdown: number | null; days: number }
export interface RiskResult {
  volatility: number | null; // annualisée (écart-type des rendements quotidiens × √252), titres seulement
  maxDrawdown: number | null; // négatif : pire baisse entre un sommet et le creux suivant
  drawdownFrom: string; drawdownTo: string;
  days: number; // nombre de rendements quotidiens utilisés
  since: string;
  lines: RiskLine[];
  largestId: string | null; largestWeight: number;
  hhi: number; effectiveLines: number; // concentration : Σ poids² et nombre « équivalent » de lignes égales
  top3: number;
}

export function volatilityOf(returns: number[]): number | null {
  if (returns.length < 20) return null;
  const m = returns.reduce((s, v) => s + v, 0) / returns.length;
  const v = returns.reduce((s, x) => s + (x - m) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}
export function drawdownOf(index: { date: string; v: number }[]): { dd: number; from: string; to: string } | null {
  if (index.length < 2) return null;
  let peak = index[0], worst = 0, from = index[0].date, to = index[0].date;
  for (const x of index) {
    if (x.v > peak.v) peak = x;
    const dd = x.v / peak.v - 1;
    if (dd < worst) { worst = dd; from = peak.date; to = x.date; }
  }
  return { dd: worst, from, to };
}

export function riskAnalysis(data: AppData, positions: Position[]): RiskResult {
  const held = positions.filter((p) => p.quantity > 0);
  const vd = valuationDate(data);
  // rendement quotidien du portefeuille « à parts figées de la veille » : les virements ne comptent pas comme performance
  const dateSet = new Set<string>();
  for (const p of held) { const e = etfById(data, p.etfId); if (e) for (const [d] of displayHistory(e)) dateSet.add(d); }
  const firstTx = data.transactions.reduce((m, t) => (!m || t.date < m ? t.date : m), '');
  const dates = Array.from(dateSet).filter((d) => d >= firstTx && d <= vd).sort();
  const rets: number[] = [];
  const index: { date: string; v: number }[] = [];
  let level = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1], cur = dates[i];
    const q = new Map<string, number>();
    for (const t of data.transactions) if (t.date <= prev) q.set(t.etfId, (q.get(t.etfId) || 0) + t.quantity);
    let v0 = 0, v1 = 0;
    for (const [id, n] of q) {
      if (n <= 0) continue;
      const e = etfById(data, id);
      const a = e && priceAt(e, prev), b = e && priceAt(e, cur);
      if (!a || !b) continue;
      v0 += n * a; v1 += n * b;
    }
    if (v0 <= 0) continue;
    const r = v1 / v0 - 1;
    rets.push(r);
    if (!index.length) index.push({ date: prev, v: level });
    level *= 1 + r;
    index.push({ date: cur, v: level });
  }
  const dd = drawdownOf(index);

  const lines: RiskLine[] = held.map((p) => {
    const e = etfById(data, p.etfId);
    const h = e ? displayHistory(e) : [];
    const last = h.length ? h[h.length - 1][0] : '';
    const cut = last ? new Date(Date.parse(last + 'T00:00:00Z') - 365 * 864e5).toISOString().slice(0, 10) : '';
    const hh = h.filter((x) => x[0] >= cut);
    const r: number[] = [];
    for (let i = 1; i < hh.length; i++) if (hh[i - 1][1] > 0) r.push(hh[i][1] / hh[i - 1][1] - 1);
    const d = drawdownOf(hh.map((x) => ({ date: x[0], v: x[1] })));
    return { etfId: p.etfId, volatility: volatilityOf(r), maxDrawdown: d ? d.dd : null, days: r.length };
  });

  const sec = held.reduce((s, p) => s + p.marketValue, 0);
  const w = held.map((p) => ({ id: p.etfId, w: sec > 0 ? p.marketValue / sec : 0 })).sort((a, b) => b.w - a.w);
  const hhi = w.reduce((s, x) => s + x.w * x.w, 0);
  return {
    volatility: volatilityOf(rets), maxDrawdown: dd ? dd.dd : null, drawdownFrom: dd?.from ?? '', drawdownTo: dd?.to ?? '',
    days: rets.length, since: index.length ? index[0].date : '', lines,
    largestId: w.length ? w[0].id : null, largestWeight: w.length ? w[0].w : 0,
    hhi, effectiveLines: hhi > 0 ? 1 / hhi : 0, top3: w.slice(0, 3).reduce((s, x) => s + x.w, 0),
  };
}

// ================================================================ 4. Coût de détention
export interface CostLine { etfId: string; value: number; ter: number; perYear: number }
export interface HoldingCost {
  lines: CostLine[];
  terPct: number; // frais courants pondérés par la valeur détenue
  terEur: number; // par an
  brokerage12m: number; // frais de courtage nets payés sur les 12 derniers mois
  totalPerYear: number;
  totalPct: number; // du portefeuille
  ordersPerYear: number; // nombre d'ordres sur 12 mois
  securities: number;
}

export function holdingCost(data: AppData, positions: Position[]): HoldingCost {
  const lines: CostLine[] = positions.filter((p) => p.quantity > 0).map((p) => {
    const ter = etfById(data, p.etfId)?.ter ?? 0;
    return { etfId: p.etfId, value: p.marketValue, ter, perYear: p.marketValue * ter };
  }).sort((a, b) => b.perYear - a.perYear);
  const securities = lines.reduce((s, l) => s + l.value, 0);
  const terEur = lines.reduce((s, l) => s + l.perYear, 0);
  const vd = valuationDate(data);
  const cut = new Date(Date.parse(vd + 'T00:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
  const recent = data.transactions.filter((t) => t.date > cut);
  const brokerage12m = recent.reduce((s, t) => s + t.fees - t.feeRefund, 0);
  const total = terEur + brokerage12m;
  const base = securities || 1;
  return { lines, terPct: securities > 0 ? terEur / securities : 0, terEur, brokerage12m, totalPerYear: total, totalPct: total / base, ordersPerYear: recent.length, securities };
}

/** Projection du Simulateur « nette de frais » : frais courants retirés du rendement, courtage retiré des versements. */
export function adjustForCosts(data: AppData, cost: HoldingCost, ordersPerYear: number): Simulation {
  const sim = data.simulation;
  const fee = data.settings.feePerOrder || 0;
  return {
    ...sim,
    annualRate: sim.annualRate - cost.terPct,
    dcaPhases: sim.dcaPhases.map((p) => ({ ...p, monthly: Math.max(0, p.monthly - (fee * ordersPerYear) / 12) })),
  };
}

/** Effet des frais sur la projection du Simulateur : capital final sans et avec frais. */
export function simulationWithCosts(data: AppData, cost: HoldingCost, ordersPerYear: number): { without: number; withCosts: number; lost: number; rate: number } {
  const without = simulate(data.simulation);
  const adj = adjustForCosts(data, cost, ordersPerYear);
  const withC = simulate(adj);
  const a = without.length ? without[without.length - 1].value : 0;
  const b = withC.length ? withC[withC.length - 1].value : 0;
  return { without: a, withCosts: b, lost: a - b, rate: adj.annualRate };
}
