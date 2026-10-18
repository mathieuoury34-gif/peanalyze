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

/** Résultat d'une vente enregistrée : coût de revient sorti au PRU du moment, produit net reçu, plus-value réalisée. */
export interface SaleInfo { cost: number; proceeds: number; gain: number }
export interface LedgerLine { quantity: number; costBasis: number; realized: number }

/** Rejoue les opérations dans l'ordre (par date ; à date égale, achats avant ventes) :
 *  un achat augmente parts et coût de revient, une vente (quantité négative) sort du coût de revient au PRU courant. */
export function ledger(transactions: Transaction[], upTo?: string, skipId?: string): { lines: Record<string, LedgerLine>; sales: Map<string, SaleInfo> } {
  const list = transactions
    .map((t, i) => ({ t, i }))
    .filter((x) => (!upTo || x.t.date <= upTo) && x.t.id !== skipId)
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : (a.t.quantity >= 0 ? 0 : 1) - (b.t.quantity >= 0 ? 0 : 1) || a.i - b.i));
  const lines: Record<string, LedgerLine> = {};
  const sales = new Map<string, SaleInfo>();
  for (const { t } of list) {
    const s = (lines[t.etfId] ||= { quantity: 0, costBasis: 0, realized: 0 });
    const net = t.grossAmount - t.feeRefund; // débit net du courtier (négatif pour une vente)
    if (t.quantity >= 0) { s.quantity += t.quantity; s.costBasis += net; continue; }
    const sold = Math.min(-t.quantity, s.quantity);
    const cost = s.quantity > 0 ? (s.costBasis / s.quantity) * sold : 0;
    const proceeds = -net;
    s.quantity -= sold;
    s.costBasis = s.quantity > 0 ? s.costBasis - cost : 0;
    s.realized += proceeds - cost;
    sales.set(t.id, { cost: round2(cost), proceeds: round2(proceeds), gain: round2(proceeds - cost) });
  }
  return { lines, sales };
}

/** Parts détenues et coût de revient d'un ETF à une date (en ignorant éventuellement une opération en cours de modification). */
export function holdingAt(transactions: Transaction[], etfId: string, upTo: string, skipId?: string): LedgerLine {
  return ledger(transactions, upTo, skipId).lines[etfId] || { quantity: 0, costBasis: 0, realized: 0 };
}

export function computePositions(data: AppData): Position[] {
  const ids: string[] = [];
  for (const t of data.transactions) if (!ids.includes(t.etfId)) ids.push(t.etfId);
  for (const e of data.etfs) if (e.inStrategy && targetOf(data, e, e.id) > 0 && !ids.includes(e.id)) ids.push(e.id);
  const { lines } = ledger(data.transactions);

  const raw = ids.map((id) => {
    const etf = etfById(data, id);
    const l = lines[id] || { quantity: 0, costBasis: 0, realized: 0 };
    const price = etf ? etf.lastPrice : 0;
    return { id, etf, quantity: l.quantity, costBasis: l.costBasis, realized: l.realized, price, marketValue: l.quantity * price };
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
      realizedPnl: r.realized,
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
  const feeRatios = data.transactions.filter((t) => t.quantity !== 0 && t.unitPrice > 0).map((t) => (t.fees - t.feeRefund) / (t.unitPrice * Math.abs(t.quantity)));
  return {
    totalDeposited,
    investedInSecurities,
    cashBalance: cash,
    securitiesValue,
    totalValue,
    unrealizedPnl,
    realizedPnl: round2(positions.reduce((s, p) => s + p.realizedPnl, 0)),
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
export function compositionUsable(etf: Pick<Etf, 'sectors' | 'countries' | 'comp'>): boolean {
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

export function monthEnd(ym: string): string {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ym + '-' + String(d).padStart(2, '0');
}
export function nextMonth(ym: string): string {
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

/** Valeur du portefeuille (titres + espèces) à une date ; `latest` = utiliser le dernier cours connu plutôt que l'historique. */
export function portfolioValueAt(data: AppData, end: string, latest = false): number {
  const q = quantities(data.transactions, end);
  let value = 0;
  for (const id of Object.keys(q)) {
    if (!q[id]) continue;
    const etf = etfById(data, id);
    if (!etf) continue;
    const p = latest ? etf.lastPrice : priceAt(etf, end);
    const tx = data.transactions.filter((t) => t.etfId === id && t.date <= end);
    value += q[id] * (p ?? (tx.length ? tx[tx.length - 1].unitPrice : 0));
  }
  return value + cashBalance(data, end);
}

export function monthlySeries(data: AppData): MonthPoint[] {
  if (!data.deposits.length) return [];
  const vd = valuationDate(data);
  const first = data.deposits.reduce((m, d) => (d.date < m ? d.date : m), data.deposits[0].date).slice(0, 7);
  const out: MonthPoint[] = [];
  for (let ym = first; ym <= vd.slice(0, 7); ym = nextMonth(ym)) {
    const end = ym === vd.slice(0, 7) ? vd : monthEnd(ym);
    const deposited = data.deposits.filter((d) => d.date <= end).reduce((s, d) => s + d.amount, 0);
    out.push({ month: ym, deposited: round2(deposited), value: round2(portfolioValueAt(data, end, end === vd)) });
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

/** Frais d'un ordre : un nombre = frais fixes par ordre ; une fonction = frais selon l'ETF et le montant de l'ordre. */
export type OrderFee = number | ((amount: number, o?: { etfId?: string; side?: 'buy' | 'sell' }) => number);

export function assistant(items: AssistantInput[], amount: number, mode: AssistantMode, feeSpec: OrderFee): AssistantResult {
  const fee = typeof feeSpec === 'number' ? () => feeSpec : (a: number, id: string) => feeSpec(a, { etfId: id, side: 'buy' });
  const strat = items.filter((e) => e.target > 0 && e.price > 0);
  const parts: Record<string, number> = {};
  items.forEach((e) => (parts[e.id] = 0));
  amount = Math.max(0, amount || 0);
  let left: number;
  if (mode === 'target') {
    // les frais dépendent du montant de chaque ordre : deux passes d'estimation avant d'allouer le reste
    let budget = amount;
    for (let pass = 0; pass < 3; pass++) budget = Math.max(0, amount - strat.reduce((s, e) => s + fee(budget * e.target, e.id), 0));
    left = amount - strat.reduce((s, e) => s + fee(budget * e.target, e.id), 0);
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
    for (const e of strat) if (!parts[e.id]) left += fee(budget * e.target, e.id);
  } else {
    const total0 = items.reduce((s, e) => s + e.value, 0);
    left = amount;
    let spent = 0;
    for (;;) {
      let best: AssistantInput | null = null, bg = 0;
      for (const e of strat) {
        // coût d'une part de plus : son prix + la hausse des frais de l'ordre (le 1er achat porte les frais fixes)
        const q = parts[e.id];
        const cost = e.price + fee((q + 1) * e.price, e.id) - (q ? fee(q * e.price, e.id) : 0);
        if (cost > left + 1e-9) continue;
        const w = (e.value + parts[e.id] * e.price) / (total0 + spent + e.price);
        const g = e.target - w;
        if (g > bg) { bg = g; best = e; }
      }
      if (!best) break;
      const q = parts[best.id];
      left -= best.price + fee((q + 1) * best.price, best.id) - (q ? fee(q * best.price, best.id) : 0);
      parts[best.id] += 1;
      spent += best.price;
    }
  }
  const orders = strat.filter((e) => parts[e.id] > 0).length;
  const total = strat.reduce((s, e) => s + parts[e.id] * e.price, 0);
  const fees = strat.reduce((s, e) => s + (parts[e.id] > 0 ? fee(parts[e.id] * e.price, e.id) : 0), 0);
  return { parts, total: round2(total), orders, fees: round2(fees), left: round2(Math.max(left, 0)) };
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
