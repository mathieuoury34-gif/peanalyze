// Frais réels contre grille : chaque ordre du journal est rejoué avec la grille du courtier choisi, les écarts sont repérés
// (erreur de saisie, frais cachés, offre non prévue) et une grille plus fidèle est proposée. Fonctions pures, testées.
import type { AppData } from './types';
import { brokerOf, orderFees, type CostOrder } from './brokers';

export type AuditKind = 'ok' | 'higher' | 'lower' | 'odd';

export interface AuditRow {
  id: string;
  date: string;
  etfId: string;
  side: 'buy' | 'sell';
  amount: number; // montant hors frais
  paid: number; // frais enregistrés
  refund: number; // remboursés par le courtier
  net: number; // payés − remboursés
  expected: number; // selon la grille
  diff: number; // net − attendu
  kind: AuditKind;
}

export interface GridFit {
  feePerOrder: number;
  /** 0,005 = 0,5 % du montant */
  feePct: number;
  /** ordres pris en compte dans l'ajustement (ceux qui ont payé des frais) */
  n: number;
  /** ordres qui collent à la grille actuelle / à la grille proposée, parmi ces n */
  within: number;
  withinNow: number;
}

export interface FeeAudit {
  rows: AuditRow[];
  /** écarts, du plus grand au plus petit */
  flagged: AuditRow[];
  paidTotal: number;
  expectedTotal: number;
  fit: GridFit | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const median = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
/** Écart toléré entre frais réels et frais attendus : quelques centimes d'arrondi, ou 2 %. */
export const tolerance = (expected: number) => Math.max(0.05, 0.02 * expected);

const nameOf = (data: AppData, id: string) => data.etfs.find((e) => e.id === id)?.name ?? data.catalog.find((c) => c.ticker === id)?.name ?? '';

export function auditFees(data: AppData): FeeAudit {
  const b = brokerOf(data.settings);
  const txs = data.transactions.filter((t) => t.quantity !== 0 && t.unitPrice > 0);
  const orders: CostOrder[] = txs.map((t) => ({ date: t.date, amount: Math.abs(t.unitPrice * t.quantity), side: t.quantity > 0 ? 'buy' : 'sell', etfName: nameOf(data, t.etfId) }));
  const expected = orderFees(b, orders, { byDate: true });
  const rows: AuditRow[] = txs.map((t, i) => {
    const amount = orders[i].amount;
    const net = round2(t.fees - t.feeRefund);
    const diff = round2(net - expected[i]);
    const odd = net < -0.005 || t.fees > Math.max(5, 0.05 * amount); // frais négatifs ou énormes (plus de 5 € et 5 % du montant) : probable faute de frappe
    const kind: AuditKind = odd ? 'odd' : Math.abs(diff) <= tolerance(expected[i]) ? 'ok' : diff > 0 ? 'higher' : 'lower';
    return { id: t.id, date: t.date, etfId: t.etfId, side: orders[i].side, amount: round2(amount), paid: round2(t.fees), refund: round2(t.feeRefund), net, expected: expected[i], diff, kind };
  });
  const flagged = rows.filter((r) => r.kind !== 'ok').sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return {
    rows, flagged,
    paidTotal: round2(rows.reduce((s, r) => s + r.net, 0)),
    expectedTotal: round2(rows.reduce((s, r) => s + r.expected, 0)),
    fit: fitGrid(rows),
  };
}

/**
 * Grille qui colle le mieux aux frais réellement payés : fixe par ordre, pourcentage du montant, ou les deux.
 * Seuls comptent les ordres qui ont payé des frais (les ordres gratuits relèvent d'offres, pas de la grille) ;
 * moins de 5 ordres, on ne propose rien. La proposition n'est faite que si elle colle à plus d'ordres que la grille actuelle.
 */
export function fitGrid(rows: AuditRow[]): GridFit | null {
  const paid = rows.filter((r) => r.net > 0 && r.kind !== 'odd');
  if (paid.length < 5) return null;
  const within = (a: number, b: number) => paid.filter((r) => Math.abs(r.net - (a + b * r.amount)) <= tolerance(a + b * r.amount)).length;
  const withinNow = paid.filter((r) => Math.abs(r.net - r.expected) <= tolerance(r.expected)).length;

  const cands: { a: number; b: number; params: number }[] = [];
  cands.push({ a: round2(median(paid.map((r) => r.net))), b: 0, params: 1 });
  cands.push({ a: 0, b: Math.round(median(paid.map((r) => r.net / r.amount)) * 1e4) / 1e4, params: 1 });
  const n = paid.length, mx = paid.reduce((s, r) => s + r.amount, 0) / n, my = paid.reduce((s, r) => s + r.net, 0) / n;
  const vx = paid.reduce((s, r) => s + (r.amount - mx) ** 2, 0);
  if (vx > 0) {
    const slope = paid.reduce((s, r) => s + (r.amount - mx) * (r.net - my), 0) / vx;
    const icpt = my - slope * mx;
    if (slope > 0 && icpt > 0) cands.push({ a: round2(icpt), b: Math.round(slope * 1e4) / 1e4, params: 2 });
  }
  let best: { a: number; b: number; score: number } | null = null;
  for (const c of cands) {
    if (c.a === 0 && c.b === 0) continue;
    const score = within(c.a, c.b) - 0.5 * c.params;
    if (!best || score > best.score) best = { a: c.a, b: c.b, score };
  }
  if (!best) return null;
  const w = within(best.a, best.b);
  if (w <= withinNow) return null;
  return { feePerOrder: best.a, feePct: best.b, n, within: w, withinNow };
}
