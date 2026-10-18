// Plans (Simulateur › Plans) : calcul d'un scénario « et si je vendais… et que j'achetais… ».
// Fonctions pures : rien n'est écrit dans le portefeuille réel.
import type { AppData, CatalogEtf, CompMeta, Plan, PlanSell, WeightItem } from './types';
import { assistant, cashBalance, compositionUsable, computePositions, displayHistory, ledger, normalizeLabel, priceAt, valuationDate, type ExposureRow, type OrderFee } from './calc';
import { feeFnOf } from './brokers';
import { drawdownOf, volatilityOf } from './analysis';
import { catKey } from '../data/seed';

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Écart à la cible (en points) à partir duquel on considère qu'on y est. */
export const CONVERGED_PTS = 5;
export const MAX_CONVERGE_MONTHS = 240;

// ---------------------------------------------------------------- instruments (ETF détenus, suivis ou du catalogue)
export interface Instrument {
  key: string; // identifiant de l'ETF dans l'app, sinon mnémonique/ISIN du catalogue
  name: string;
  index: string;
  isin: string;
  price: number;
  indicative: boolean; // cours du catalogue (non suivi par l'app) : à vérifier chez le courtier
  ter: number;
  held: number; // parts détenues
  costBasis: number; // coût de revient des parts détenues
  sectors: WeightItem[];
  countries: WeightItem[];
  comp?: CompMeta;
  mine: boolean; // dans « Mes ETF » ou détenu
}

export function instrumentOf(data: AppData, key: string): Instrument | null {
  const etf = data.etfs.find((e) => e.id === key);
  if (etf) {
    const l = ledger(data.transactions).lines[key];
    const held = l?.quantity ?? 0, cost = l?.costBasis ?? 0;
    return { key, name: etf.name, index: etf.index, isin: etf.isin, price: etf.lastPrice, indicative: false, ter: etf.ter, held, costBasis: cost,
      sectors: etf.sectors, countries: etf.countries, comp: etf.comp, mine: data.myEtfIds.includes(key) || held > 0 };
  }
  const c: CatalogEtf | undefined = data.catalog.find((x) => catKey(x) === key);
  if (!c) return null;
  return { key, name: c.name, index: c.index, isin: c.isin, price: c.unitPrice ?? 0, indicative: true, ter: c.ter, held: 0, costBasis: 0,
    sectors: c.sectors ?? [], countries: c.countries ?? [], comp: c.comp, mine: false };
}

/** Stratégie actuelle de l'app (ETF « dans la stratégie »), normalisée à 100 %. */
export function currentStrategy(data: AppData): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const e of data.etfs) {
    const w = e.inStrategy ? data.targetAllocation[e.id] || 0 : 0;
    if (w > 0) { out[e.id] = w; sum += w; }
  }
  if (sum > 0) for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

export function normalize(targets: Record<string, number>): Record<string, number> {
  const sum = Object.values(targets).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const out: Record<string, number> = {};
  if (sum <= 0) return out;
  for (const [k, v] of Object.entries(targets)) if (v > 0) out[k] = v / sum;
  return out;
}

export function planTargets(data: AppData, plan: Plan): Record<string, number> {
  return plan.targets ? normalize(plan.targets) : currentStrategy(data);
}

/** Parts vendues pour une ligne du plan (jamais plus que ce qui est détenu). */
export function sellQuantity(s: PlanSell, held: number): number {
  if (held <= 0) return 0;
  if (s.kind === 'all') return held;
  if (s.kind === 'pct') return Math.min(held, Math.floor(held * Math.max(0, Math.min(1, s.value)) + 1e-9));
  return Math.min(held, Math.max(0, Math.floor(s.value)));
}

// ---------------------------------------------------------------- résultat
export interface SellLine { key: string; qty: number; price: number; gross: number; fee: number; net: number; cost: number; gain: number; all: boolean }
export interface BuyLine { key: string; qty: number; price: number; cost: number; fee: number }
export interface AllocRow { key: string; before: number; after: number; wBefore: number; wAfter: number; wTarget: number; qtyBefore: number; qtyAfter: number }
export type PlanWarning = 'noTarget' | 'noPrice' | 'shortfall' | 'withdraw' | 'indicative' | 'nothingToSell' | 'unusedBudget' | 'pea5y';
export interface ExposureCompare { label: string; before: number; after: number }

export interface PlanResult {
  sells: SellLine[];
  buys: BuyLine[];
  cashBefore: number;
  deposit: number;
  withdraw: number;
  saleGross: number;
  saleFees: number;
  saleNet: number;
  budget: number;
  buyCost: number;
  buyFees: number;
  cashAfter: number;
  feesTotal: number;
  realizedGain: number;
  realizedGainPct: number | null;
  valueBefore: number; // titres
  valueAfter: number;
  rows: AllocRow[];
  hasTarget: boolean;
  gapBefore: number | null; // points
  gapAfter: number | null;
  terBefore: number;
  terAfter: number;
  annualCostBefore: number;
  annualCostAfter: number;
  annualSaving: number; // €/an à valeur de portefeuille égale (après)
  breakEvenMonths: number | null;
  linesBefore: number;
  linesAfter: number;
  topBefore: number;
  topAfter: number;
  convergeMonths: number | null; // sans vendre ; null = plus de MAX_CONVERGE_MONTHS ; -1 = déjà dans la cible
  sectors: { rows: ExposureCompare[]; coverageBefore: number; coverageAfter: number };
  countries: { rows: ExposureCompare[]; coverageBefore: number; coverageAfter: number };
  warnings: PlanWarning[];
  indicativeKeys: string[];
}

interface Holding { key: string; qty: number; price: number }

export function trackingGap(values: Record<string, number>, targets: Record<string, number>): number | null {
  const total = Object.values(values).reduce((s, v) => s + v, 0);
  const keys = new Set([...Object.keys(values), ...Object.keys(targets)]);
  if (!Object.keys(targets).length || total <= 0) return null;
  let sum = 0;
  for (const k of keys) sum += Math.abs((values[k] || 0) / total - (targets[k] || 0));
  return (sum / 2) * 100;
}

function blend(items: { weight: number; sectors: WeightItem[]; countries: WeightItem[]; comp?: CompMeta }[], kind: 'sectors' | 'countries'): { rows: ExposureRow[]; coverage: number } {
  const acc = new Map<string, number>();
  let covered = 0, total = 0;
  for (const it of items) {
    if (it.weight <= 0) continue;
    total += it.weight;
    if (!compositionUsable(it)) continue;
    covered += it.weight;
    for (const x of it[kind]) {
      const l = normalizeLabel(x.label);
      acc.set(l, (acc.get(l) || 0) + it.weight * x.weight);
    }
  }
  const k = covered > 0 ? 1 / covered : 0;
  return { rows: Array.from(acc, ([label, weight]) => ({ label, weight: weight * k })), coverage: total > 0 ? covered / total : 1 };
}

function compare(before: ExposureRow[], after: ExposureRow[]): ExposureCompare[] {
  const labels = new Set([...before.map((r) => r.label), ...after.map((r) => r.label)]);
  const b = new Map(before.map((r) => [r.label, r.weight])), a = new Map(after.map((r) => [r.label, r.weight]));
  return Array.from(labels, (label) => ({ label, before: b.get(label) || 0, after: a.get(label) || 0 }))
    .sort((x, y) => (x.label === 'Autres' ? 1 : 0) - (y.label === 'Autres' ? 1 : 0) || Math.max(y.before, y.after) - Math.max(x.before, x.after));
}

/** Mois de versements réguliers (sans vendre) pour approcher la cible à moins de CONVERGED_PTS points. */
export function monthsToConverge(holdings: Holding[], targets: Record<string, number>, monthly: number, fee: OrderFee, prices: Record<string, number> = {}): number | null {
  const vals: Record<string, number> = {};
  const price: Record<string, number> = { ...prices };
  for (const h of holdings) { vals[h.key] = h.qty * h.price; price[h.key] = h.price; }
  for (const k of Object.keys(targets)) if (!(k in vals)) vals[k] = 0;
  const gap = () => trackingGap(vals, targets);
  const g0 = gap();
  if (g0 === null) return null;
  if (g0 <= CONVERGED_PTS) return -1;
  if (monthly <= 0) return null;
  for (let m = 1; m <= MAX_CONVERGE_MONTHS; m++) {
    const items = Object.keys(vals).map((k) => ({ id: k, price: price[k] ?? 0, value: vals[k], target: targets[k] || 0 }));
    const res = assistant(items, monthly, 'rebalance', fee);
    for (const k of Object.keys(res.parts)) vals[k] += res.parts[k] * (price[k] ?? 0);
    const g = gap();
    if (g !== null && g <= CONVERGED_PTS) return m;
  }
  return null;
}

export function computePlan(data: AppData, plan: Plan): PlanResult {
  const fee = feeFnOf(data); // frais selon le courtier choisi, l'ETF et le montant de l'ordre
  const positions = computePositions(data);
  const targets = planTargets(data, plan);
  const hasTarget = Object.keys(targets).length > 0;
  const warnings = new Set<PlanWarning>();
  const inst = new Map<string, Instrument>();
  const get = (k: string): Instrument | null => {
    if (!inst.has(k)) { const i = instrumentOf(data, k); if (i) inst.set(k, i); }
    return inst.get(k) ?? null;
  };

  // lignes détenues avant
  const held: Holding[] = [];
  for (const p of positions) if (p.quantity > 0) held.push({ key: p.etfId, qty: p.quantity, price: p.price });

  // ventes
  const sells: SellLine[] = [];
  for (const s of plan.sells) {
    const h = held.find((x) => x.key === s.etfId);
    const i = get(s.etfId);
    if (!h || !i) continue;
    const qty = sellQuantity(s, h.qty);
    if (qty <= 0) continue;
    const gross = round2(qty * h.price);
    const sellFee = round2(fee(gross, { etfId: s.etfId, side: 'sell' }));
    const net = round2(gross - sellFee);
    const cost = round2((i.costBasis / h.qty) * qty);
    sells.push({ key: s.etfId, qty, price: h.price, gross, fee: sellFee, net, cost, gain: round2(net - cost), all: qty === h.qty });
  }
  if (plan.sells.length && !sells.length) warnings.add('nothingToSell');
  const saleGross = round2(sells.reduce((s, x) => s + x.gross, 0));
  const saleFees = round2(sells.reduce((s, x) => s + x.fee, 0));
  const saleNet = round2(saleGross - saleFees);
  const cashBefore = cashBalance(data);
  const deposit = Math.max(0, plan.deposit || 0);
  const withdraw = Math.max(0, plan.withdraw || 0);
  let budget = round2(cashBefore + saleNet + deposit - withdraw);
  if (budget < 0) { warnings.add('shortfall'); budget = 0; }
  if (withdraw > 0) {
    warnings.add('withdraw');
    const open = data.settings.peaOpeningDate;
    if (open) {
      const y = +open.slice(0, 4);
      if (isFinite(y) && new Date(y + 5, +open.slice(5, 7) - 1, +open.slice(8, 10) || 1).getTime() > Date.now()) warnings.add('pea5y');
    }
  }

  // parts restantes après les ventes
  const remaining: Holding[] = held.map((h) => ({ ...h, qty: h.qty - (sells.find((s) => s.key === h.key)?.qty ?? 0) }));
  const keys = new Set<string>([...held.map((h) => h.key), ...Object.keys(targets)]);
  const indicativeKeys: string[] = [];
  const items = Array.from(keys).map((k) => {
    const i = get(k);
    const r = remaining.find((x) => x.key === k);
    const price = i?.price ?? 0;
    if (i?.indicative && (targets[k] || 0) > 0) indicativeKeys.push(k);
    if ((targets[k] || 0) > 0 && price <= 0) warnings.add('noPrice');
    return { id: k, price, value: (r?.qty ?? 0) * price, target: targets[k] || 0 };
  });
  if (!hasTarget) warnings.add('noTarget');
  if (indicativeKeys.length) warnings.add('indicative');

  // achats : on comble d'abord les plus gros écarts, en parts entières, frais de courtage compris
  const res = hasTarget ? assistant(items, budget, 'rebalance', fee) : { parts: {} as Record<string, number>, total: 0, orders: 0, fees: 0, left: budget };
  const buys: BuyLine[] = items.filter((x) => (res.parts[x.id] || 0) > 0).map((x) => ({ key: x.id, qty: res.parts[x.id], price: x.price, cost: round2(res.parts[x.id] * x.price), fee: round2(fee(res.parts[x.id] * x.price, { etfId: x.id, side: 'buy' })) }));
  const buyCost = round2(buys.reduce((s, b) => s + b.cost, 0));
  const buyFees = round2(buys.reduce((s, b) => s + b.fee, 0));
  const cashAfter = round2(budget - buyCost - buyFees);
  if (hasTarget && budget > 0 && cashAfter > Math.max(50, budget * 0.25)) warnings.add('unusedBudget');

  // avant / après
  const valuesBefore: Record<string, number> = {}, valuesAfter: Record<string, number> = {};
  const qtyBefore: Record<string, number> = {}, qtyAfter: Record<string, number> = {};
  for (const k of keys) {
    const price = get(k)?.price ?? 0;
    const qb = held.find((h) => h.key === k)?.qty ?? 0;
    const qa = (remaining.find((h) => h.key === k)?.qty ?? 0) + (res.parts[k] || 0);
    qtyBefore[k] = qb; qtyAfter[k] = qa;
    valuesBefore[k] = qb * price; valuesAfter[k] = qa * price;
  }
  const valueBefore = Object.values(valuesBefore).reduce((s, v) => s + v, 0);
  const valueAfter = Object.values(valuesAfter).reduce((s, v) => s + v, 0);
  const rows: AllocRow[] = Array.from(keys).map((k) => ({
    key: k, before: valuesBefore[k], after: valuesAfter[k],
    wBefore: valueBefore > 0 ? valuesBefore[k] / valueBefore : 0, wAfter: valueAfter > 0 ? valuesAfter[k] / valueAfter : 0,
    wTarget: targets[k] || 0, qtyBefore: qtyBefore[k], qtyAfter: qtyAfter[k],
  })).filter((r) => r.before > 0 || r.after > 0 || r.wTarget > 0)
    .sort((a, b) => Math.max(b.wTarget, b.wAfter, b.wBefore) - Math.max(a.wTarget, a.wAfter, a.wBefore));

  const wTer = (vals: Record<string, number>, total: number) => (total > 0 ? Object.entries(vals).reduce((s, [k, v]) => s + v * (get(k)?.ter ?? 0), 0) / total : 0);
  const terBefore = wTer(valuesBefore, valueBefore), terAfter = wTer(valuesAfter, valueAfter);
  const annualCostBefore = round2(valueBefore * terBefore), annualCostAfter = round2(valueAfter * terAfter);
  const annualSaving = round2((terBefore - terAfter) * valueAfter);
  const feesTotal = round2(saleFees + buyFees);
  const realizedGain = round2(sells.reduce((s, x) => s + x.gain, 0));
  const cost = sells.reduce((s, x) => s + x.cost, 0);
  const top = (vals: Record<string, number>, total: number) => (total > 0 ? Math.max(0, ...Object.values(vals)) / total : 0);

  const expBefore = (kind: 'sectors' | 'countries') => blend(Array.from(keys).map((k) => ({ weight: valueBefore > 0 ? valuesBefore[k] / valueBefore : 0, ...pick(get(k)) })), kind);
  const expAfter = (kind: 'sectors' | 'countries') => blend(Array.from(keys).map((k) => ({ weight: valueAfter > 0 ? valuesAfter[k] / valueAfter : 0, ...pick(get(k)) })), kind);
  const sb = expBefore('sectors'), sa = expAfter('sectors'), cb = expBefore('countries'), ca = expAfter('countries');

  return {
    sells, buys, cashBefore, deposit, withdraw, saleGross, saleFees, saleNet, budget, buyCost, buyFees, cashAfter, feesTotal,
    realizedGain, realizedGainPct: cost > 0 ? realizedGain / cost : null,
    valueBefore, valueAfter, rows, hasTarget,
    gapBefore: trackingGap(valuesBefore, targets), gapAfter: trackingGap(valuesAfter, targets),
    terBefore, terAfter, annualCostBefore, annualCostAfter, annualSaving,
    breakEvenMonths: annualSaving > 0 && feesTotal > 0 ? Math.ceil((feesTotal / annualSaving) * 12) : null,
    linesBefore: Object.values(qtyBefore).filter((q) => q > 0).length, linesAfter: Object.values(qtyAfter).filter((q) => q > 0).length,
    topBefore: top(valuesBefore, valueBefore), topAfter: top(valuesAfter, valueAfter),
    convergeMonths: hasTarget ? monthsToConverge(held, targets, plan.monthly, fee, Object.fromEntries(items.map((x) => [x.id, x.price]))) : null,
    sectors: { rows: compare(sb.rows, sa.rows), coverageBefore: sb.coverage, coverageAfter: sa.coverage },
    countries: { rows: compare(cb.rows, ca.rows), coverageBefore: cb.coverage, coverageAfter: ca.coverage },
    warnings: Array.from(warnings), indicativeKeys,
  };
}

function pick(i: Instrument | null) {
  return { sectors: i?.sectors ?? [], countries: i?.countries ?? [], comp: i?.comp };
}

// ---------------------------------------------------------------- modèles de plans
export function blankPlan(data: AppData, id: string, name: string): Plan {
  return { id, name, createdAt: new Date().toISOString(), sells: [], deposit: 0, withdraw: 0, monthly: data.simulation.dcaPhases[0]?.monthly ?? 500, targets: null };
}

/** Vendre un ETF entier ; la stratégie actuelle est conservée sans lui (renormalisée). */
export function planSellOne(data: AppData, id: string, key: string, name: string): Plan {
  const p = blankPlan(data, id, name);
  p.sells = [{ etfId: key, kind: 'all', value: 0 }];
  const rest = { ...currentStrategy(data) };
  delete rest[key];
  p.targets = Object.keys(rest).length ? normalize(rest) : null;
  return p;
}

/** Tout vendre sauf l'ETF choisi, qui devient la seule ligne (ex. un seul ETF MSCI World). */
export function planSingle(data: AppData, id: string, key: string, name: string): Plan {
  const p = blankPlan(data, id, name);
  p.sells = computePositions(data).filter((x) => x.quantity > 0 && x.etfId !== key).map((x) => ({ etfId: x.etfId, kind: 'all' as const, value: 0 }));
  p.targets = { [key]: 1 };
  return p;
}

/** Recherche dans le catalogue (nom, indice, mnémonique, ISIN). */
export function searchCatalog(data: AppData, q: string, limit = 30): CatalogEtf[] {
  const s = q.trim().toLowerCase();
  const list = data.catalog.filter((c) => c.peaEligible && c.ticker && (c.unitPrice ?? 0) > 0); // cotés à Paris : l'app peut suivre leur cours
  const hit = s ? list.filter((c) => (c.name + ' ' + c.index + ' ' + c.ticker + ' ' + c.isin).toLowerCase().includes(s)) : list;
  return hit.sort((a, b) => (b.aumMEur ?? 0) - (a.aumMEur ?? 0)).slice(0, limit);
}

// ---------------------------------------------------------------- test sur le passé
export interface BacktestSide { ret: number; vol: number | null; maxDd: number; coverage: number }
export interface Backtest { from: string; to: string; sessions: number; before: BacktestSide; after: BacktestSide }

/**
 * « Qu'aurait donné ce plan sur la période de cours disponible ? » : la répartition d'aujourd'hui et celle d'après le plan
 * sont achetées le même premier jour, puis conservées sans rien changer. Seuls les ETF avec un historique de cours comptent.
 */
export function planBacktest(data: AppData, r: PlanResult): Backtest | null {
  const hist = new Map<string, [string, number][]>();
  for (const row of r.rows) {
    const e = data.etfs.find((x) => x.id === row.key);
    if (e && (row.wBefore > 0 || row.wAfter > 0)) { const h = displayHistory(e); if (h.length >= 2) hist.set(row.key, h); }
  }
  const side = (pick: (x: AllocRow) => number) => {
    const rows = r.rows.filter((x) => pick(x) > 0);
    const total = rows.reduce((s, x) => s + pick(x), 0);
    const covered = rows.filter((x) => hist.has(x.key));
    const cw = covered.reduce((s, x) => s + pick(x), 0);
    return { rows: covered, coverage: total > 0 ? cw / total : 0, weights: new Map(covered.map((x) => [x.key, cw > 0 ? pick(x) / cw : 0])) };
  };
  const b = side((x) => x.wBefore), a = side((x) => x.wAfter);
  if (b.coverage < 0.5 || a.coverage < 0.5) return null;
  const keys = new Set([...b.rows, ...a.rows].map((x) => x.key));
  const from = Array.from(keys).reduce((m, k) => (hist.get(k)![0][0] > m ? hist.get(k)![0][0] : m), '');
  const to = valuationDate(data);
  const dates = Array.from(new Set(Array.from(keys).flatMap((k) => hist.get(k)!.map((x) => x[0])))).filter((d) => d >= from && d <= to).sort();
  if (dates.length < 20) return null;
  const run = (w: Map<string, number>, coverage: number): BacktestSide => {
    const etfOf = (k: string) => data.etfs.find((e) => e.id === k)!;
    const units = new Map<string, number>();
    for (const [k, wt] of w) { const p0 = priceAt(etfOf(k), dates[0]); if (p0) units.set(k, wt / p0); }
    const val = dates.map((d) => ({ date: d, v: Array.from(units).reduce((s, [k, u]) => s + u * (priceAt(etfOf(k), d) ?? 0), 0) }));
    const rets = val.slice(1).map((x, i) => (val[i].v > 0 ? x.v / val[i].v - 1 : 0));
    const dd = drawdownOf(val);
    return { ret: val[val.length - 1].v / val[0].v - 1, vol: volatilityOf(rets), maxDd: dd ? dd.dd : 0, coverage };
  };
  return { from: dates[0], to: dates[dates.length - 1], sessions: dates.length - 1, before: run(b.weights, b.coverage), after: run(a.weights, a.coverage) };
}
