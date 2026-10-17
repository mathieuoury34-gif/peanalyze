// Règles de calcul de PEAnalyze (HANDOFF.md §6). Fonctions pures, testées dans tests/calc.test.ts.
import type { AppData, Etf, Position, PortfolioSummary, Simulation, Transaction, WeightItem } from './types';

const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- cours
export function etfById(data: AppData, id: string): Etf | undefined {
  return data.etfs.find((e) => e.id === id);
}

/** Date du dernier cours connu (toutes lignes confondues). */
export function valuationDate(data: AppData): string {
  let d = '';
  for (const e of data.etfs) {
    const h = e.priceHistory.length ? e.priceHistory[e.priceHistory.length - 1][0] : '';
    const last = e.lastPriceDate && e.lastPriceDate > h ? e.lastPriceDate : h;
    if (last > d) d = last;
  }
  return d || new Date().toISOString().slice(0, 10);
}

/** Cours de clôture à une date (dernier cours ≤ date). */
export function priceAt(etf: Etf, iso: string): number | null {
  const h = etf.priceHistory;
  if (etf.lastPriceDate && iso >= etf.lastPriceDate) return etf.lastPrice;
  if (!h.length || iso < h[0][0]) return null;
  if (iso >= h[h.length - 1][0]) return etf.lastPriceDate ? etf.lastPrice : h[h.length - 1][1];
  let lo = 0, hi = h.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (h[mid][0] <= iso) lo = mid; else hi = mid - 1;
  }
  return h[lo][1];
}

// ---------------------------------------------------------------- positions
export function quantities(transactions: Transaction[], upTo?: string): Record<string, number> {
  const q: Record<string, number> = {};
  for (const t of transactions) {
    if (upTo && t.date > upTo) continue;
    q[t.etfId] = (q[t.etfId] || 0) + t.quantity;
  }
  return q;
}

export function cashBalance(data: AppData, upTo?: string): number {
  if (!upTo && data.settings.cashBalance !== null && data.settings.cashBalance !== undefined) return data.settings.cashBalance;
  let c = 0;
  for (const d of data.deposits) if (!upTo || d.date <= upTo) c += d.amount;
  for (const t of data.transactions) if (!upTo || t.date <= upTo) c -= t.grossAmount - t.feeRefund;
  return round2(Math.max(c, 0));
}

function targetOf(data: AppData, etf: Etf | undefined, id: string): number {
  if (etf && !etf.inStrategy) return 0;
  return data.targetAllocation[id] || 0;
}

export function computePositions(data: AppData): Position[] {
  const ids: string[] = [];
  for (const t of data.transactions) if (!ids.includes(t.etfId)) ids.push(t.etfId);
  for (const e of data.etfs) if (e.inStrategy && targetOf(data, e, e.id) > 0 && !ids.includes(e.id)) ids.push(e.id);

  const raw = ids.map((id) => {
    const etf = etfById(data, id);
    let quantity = 0, costBasis = 0;
    for (const t of data.transactions) {
      if (t.etfId !== id) continue;
      quantity += t.quantity;
      costBasis += t.grossAmount - t.feeRefund;
    }
    const price = etf ? etf.lastPrice : 0;
    return { id, etf, quantity, costBasis, price, marketValue: quantity * price };
  });
  const securities = raw.reduce((s, r) => s + r.marketValue, 0);
  const total = securities + cashBalance(data);

  return raw.map((r) => {
    const weightTarget = targetOf(data, r.etf, r.id);
    const weightActual = securities > 0 ? r.marketValue / securities : 0;
    const targetValue = weightTarget * total;
    const targetQuantity = r.price > 0 ? Math.round(targetValue / r.price) : 0;
    const pnl = r.marketValue - r.costBasis;
    return {
      etfId: r.id,
      quantity: r.quantity,
      costBasis: r.costBasis,
      pru: r.quantity > 0 ? r.costBasis / r.quantity : 0,
      price: r.price,
      marketValue: r.marketValue,
      unrealizedPnl: pnl,
      unrealizedPnlPct: r.costBasis > 0 ? pnl / r.costBasis : 0,
      weightActual,
      weightTarget,
      gapPts: (weightActual - weightTarget) * 100,
      targetValue,
      targetQuantity,
      toBuy: Math.max(0, targetQuantity - r.quantity),
      inStrategy: !!r.etf?.inStrategy && weightTarget > 0,
    };
  });
}

// ---------------------------------------------------------------- XIRR
export interface Flow { date: string; amount: number }

export function xirr(flows: Flow[]): number | null {
  if (flows.length < 2) return null;
  const sorted = flows.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const t0 = Date.parse(sorted[0].date + 'T00:00:00Z');
  const ts = sorted.map((f) => (Date.parse(f.date + 'T00:00:00Z') - t0) / 86400000 / 365);
  const npv = (r: number) => sorted.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, ts[i]), 0);
  if (!sorted.some((f) => f.amount > 0) || !sorted.some((f) => f.amount < 0)) return null;
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- synthèse
export function computeSummary(data: AppData, positions = computePositions(data)): PortfolioSummary {
  const totalDeposited = round2(data.deposits.reduce((s, d) => s + d.amount, 0));
  const investedInSecurities = data.transactions.reduce((s, t) => s + t.unitPrice * t.quantity, 0);
  const cash = cashBalance(data);
  const securitiesValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalValue = securitiesValue + cash;
  const unrealizedPnl = totalValue - totalDeposited;
  const vd = valuationDate(data);
  const flows: Flow[] = data.deposits.map((d) => ({ date: d.date, amount: -d.amount }));
  flows.push({ date: vd, amount: totalValue });
  const feesPaid = data.transactions.reduce((s, t) => s + t.fees, 0);
  const feesRefunded = data.transactions.reduce((s, t) => s + t.feeRefund, 0);
  const feeRatios = data.transactions.filter((t) => t.unitPrice * t.quantity > 0).map((t) => (t.fees - t.feeRefund) / (t.unitPrice * t.quantity));
  return {
    totalDeposited,
    investedInSecurities,
    cashBalance: cash,
    securitiesValue,
    totalValue,
    unrealizedPnl,
    globalReturnPct: totalDeposited > 0 ? unrealizedPnl / totalDeposited : 0,
    annualizedReturnXirr: data.deposits.length ? xirr(flows) : null,
    feesPaid,
    feesRefunded,
    feesNet: feesPaid - feesRefunded,
    avgFeePct: feeRatios.length ? feeRatios.reduce((s, v) => s + v, 0) / feeRatios.length : 0,
    refundedShare: feesPaid > 0 ? feesRefunded / feesPaid : 0,
    totalQuantity: positions.reduce((s, p) => s + p.quantity, 0),
    lines: positions.filter((p) => p.quantity > 0).length,
    valuationDate: vd,
  };
}

// ---------------------------------------------------------------- expositions
const LABEL_FIX: Record<string, string> = {
  "technologie de l'information": 'Technologies de l’information',
  "technologies de l'information": 'Technologies de l’information',
  'energie': 'Énergie',
  'royaume-uni': 'Royaume-Uni',
  'corée du sud': 'Corée du Sud',
};
export function normalizeLabel(label: string): string {
  const k = label.trim().replace(/[’]/g, "'").toLowerCase();
  return LABEL_FIX[k] || label.trim().replace(/'/g, '’');
}

export interface ExposureRow { label: string; weight: number; isOther?: boolean }

/** Un ETF dont la répartition vient seulement de justETF (classification TRBC) n'est pas comparable aux autres (GICS) : on ne l'additionne pas. */
export function compositionUsable(etf: Etf): boolean {
  return (etf.sectors.length > 0 || etf.countries.length > 0) && etf.comp?.kind !== 'justetf';
}

/** Part du portefeuille couverte par des répartitions vérifiées, et ETF laissés de côté (indicatives ou absentes). */
export function exposureCoverage(data: AppData, positions: Position[]): { covered: number; missing: { etfId: string; name: string; weight: number }[] } {
  let covered = 0, total = 0;
  const missing: { etfId: string; name: string; weight: number }[] = [];
  for (const p of positions) {
    const etf = etfById(data, p.etfId);
    if (!etf || p.weightActual <= 0) continue;
    total += p.weightActual;
    if (compositionUsable(etf)) covered += p.weightActual;
    else missing.push({ etfId: etf.id, name: etf.name, weight: p.weightActual });
  }
  return { covered: total > 0 ? covered / total : 1, missing };
}

/** Exposition du portefeuille : Σ_etf poids réel × poids du libellé, ramenée à 100 % de la part couverte par des données vérifiées. */
export function exposure(data: AppData, positions: Position[], kind: 'sectors' | 'countries'): ExposureRow[] {
  const acc = new Map<string, number>();
  let covered = 0;
  for (const p of positions) {
    const etf = etfById(data, p.etfId);
    if (!etf || p.weightActual <= 0 || !compositionUsable(etf)) continue;
    covered += p.weightActual;
    for (const it of etf[kind]) {
      const l = normalizeLabel(it.label);
      acc.set(l, (acc.get(l) || 0) + p.weightActual * it.weight);
    }
  }
  const k = covered > 0 ? 1 / covered : 1;
  return Array.from(acc, ([label, weight]) => ({ label, weight: weight * k })).sort((a, b) => b.weight - a.weight);
}

/** Garde les n premiers libellés (hors « Autres ») et regroupe le reste dans « Autres », placé en dernier. */
export function topWithOthers(rows: ExposureRow[] | WeightItem[], n: number): ExposureRow[] {
  const list = (rows as ExposureRow[]).map((r) => ({ label: normalizeLabel(r.label), weight: r.weight }));
  const others = list.filter((r) => r.label === 'Autres').reduce((s, r) => s + r.weight, 0);
  const named = list.filter((r) => r.label !== 'Autres').sort((a, b) => b.weight - a.weight);
  const top = named.slice(0, n);
  const rest = named.slice(n).reduce((s, r) => s + r.weight, 0) + others;
  if (rest > 0.00005) top.push({ label: 'Autres', weight: rest, isOther: true } as ExposureRow);
  return top;
}

// ---------------------------------------------------------------- variation de période
export function periodStartIndex(history: [string, number][], months: number | null, from?: string): number {
  if (!history.length) return 0;
  if (from) {
    const i = history.findIndex((p) => p[0] >= from);
    return i < 0 ? history.length - 1 : i;
  }
  if (!months) return 0;
  const last = history[history.length - 1][0];
  let y = +last.slice(0, 4), m = +last.slice(5, 7) - months;
  while (m <= 0) { m += 12; y -= 1; }
  const target = y + '-' + String(m).padStart(2, '0') + last.slice(7);
  const i = history.findIndex((p) => p[0] >= target);
  return i < 0 ? 0 : i;
}

/** Historique utilisé pour l'affichage : historique + dernier cours s'il est plus récent. */
export function displayHistory(etf: Etf): [string, number][] {
  const h = etf.priceHistory.slice();
  if (etf.lastPriceDate && (!h.length || etf.lastPriceDate > h[h.length - 1][0])) h.push([etf.lastPriceDate, etf.lastPrice]);
  return h;
}

// ---------------------------------------------------------------- épargne vs valeur (mensuel)
export interface MonthPoint { month: string; deposited: number; value: number }

function monthEnd(ym: string): string {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ym + '-' + String(d).padStart(2, '0');
}
function nextMonth(ym: string): string {
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

export function monthlySeries(data: AppData): MonthPoint[] {
  if (!data.deposits.length) return [];
  const vd = valuationDate(data);
  const first = data.deposits.reduce((m, d) => (d.date < m ? d.date : m), data.deposits[0].date).slice(0, 7);
  const out: MonthPoint[] = [];
  for (let ym = first; ym <= vd.slice(0, 7); ym = nextMonth(ym)) {
    const end = ym === vd.slice(0, 7) ? vd : monthEnd(ym);
    const deposited = data.deposits.filter((d) => d.date <= end).reduce((s, d) => s + d.amount, 0);
    const q = quantities(data.transactions, end);
    let value = 0;
    for (const id of Object.keys(q)) {
      const etf = etfById(data, id);
      if (!etf) continue;
      const p = end === vd ? etf.lastPrice : priceAt(etf, end);
      const tx = data.transactions.filter((t) => t.etfId === id && t.date <= end);
      value += q[id] * (p ?? (tx.length ? tx[tx.length - 1].unitPrice : 0));
    }
    value += cashBalance(data, end);
    out.push({ month: ym, deposited: round2(deposited), value: round2(value) });
  }
  return out;
}

// ---------------------------------------------------------------- assistant du mois
export type AssistantMode = 'target' | 'rebalance';
export interface AssistantInput { id: string; price: number; value: number; target: number }
export interface AssistantResult {
  parts: Record<string, number>;
  total: number;
  orders: number;
  fees: number;
  left: number;
}

export function assistant(items: AssistantInput[], amount: number, mode: AssistantMode, fee: number): AssistantResult {
  const strat = items.filter((e) => e.target > 0 && e.price > 0);
  const parts: Record<string, number> = {};
  items.forEach((e) => (parts[e.id] = 0));
  amount = Math.max(0, amount || 0);
  let left: number;
  if (mode === 'target') {
    left = amount - strat.length * fee;
    const budget = Math.max(left, 0);
    const alloc: Record<string, number> = {};
    for (const e of strat) {
      alloc[e.id] = budget * e.target;
      parts[e.id] = Math.floor(alloc[e.id] / e.price);
      left -= parts[e.id] * e.price;
    }
    for (;;) {
      let best: AssistantInput | null = null, bd = 0;
      for (const e of strat) {
        const d = alloc[e.id] - parts[e.id] * e.price;
        if (e.price <= left + 1e-9 && d > bd) { bd = d; best = e; }
      }
      if (!best) break;
      parts[best.id] += 1;
      left -= best.price;
    }
    for (const e of strat) if (!parts[e.id]) left += fee;
  } else {
    const total0 = items.reduce((s, e) => s + e.value, 0);
    left = amount;
    let spent = 0;
    for (;;) {
      let best: AssistantInput | null = null, bg = 0;
      for (const e of strat) {
        const cost = e.price + (parts[e.id] ? 0 : fee);
        if (cost > left + 1e-9) continue;
        const w = (e.value + parts[e.id] * e.price) / (total0 + spent + e.price);
        const g = e.target - w;
        if (g > bg) { bg = g; best = e; }
      }
      if (!best) break;
      if (!parts[best.id]) left -= fee;
      parts[best.id] += 1;
      left -= best.price;
      spent += best.price;
    }
  }
  const orders = strat.filter((e) => parts[e.id] > 0).length;
  const total = strat.reduce((s, e) => s + parts[e.id] * e.price, 0);
  return { parts, total: round2(total), orders, fees: round2(orders * fee), left: round2(Math.max(left, 0)) };
}

// ---------------------------------------------------------------- simulateur
export interface SimYear { year: number; value: number; deposited: number }

/** Horizon maximal du simulateur (années). */
export const MAX_HORIZON = 50;

export function simulate(sim: Simulation): SimYear[] {
  const phases = sim.dcaPhases.slice().sort((a, b) => a.fromYear - b.fromYear);
  const monthly = (y: number) => {
    let m = 0;
    for (const p of phases) if (y >= p.fromYear) m = p.monthly;
    return m;
  };
  const rm = Math.pow(1 + sim.annualRate, 1 / 12) - 1;
  let v = sim.initialCapital, dep = sim.initialCapital;
  const out: SimYear[] = [{ year: 0, value: v, deposited: dep }];
  for (let mo = 1; mo <= sim.horizonYears * 12; mo++) {
    const m = monthly(Math.ceil(mo / 12));
    v = v * (1 + rm) + m;
    dep += m;
    if (mo % 12 === 0) out.push({ year: mo / 12, value: v, deposited: dep });
  }
  return out;
}

export function deflate(years: SimYear[], inflation: number): SimYear[] {
  return years.map((y) => {
    const f = Math.pow(1 + inflation, y.year);
    return { year: y.year, value: y.value / f, deposited: y.deposited / f };
  });
}

// ---------------------------------------------------------------- graduations
export function niceStep(raw: number): number {
  if (raw <= 0 || !isFinite(raw)) return 1;
  const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p10;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p10;
}
