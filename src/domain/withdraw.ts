// Retraits : simulation mensuelle avec phases de retrait, calculette à 4 variables et Monte Carlo.
// Fonctions pures (aucun accès à l'interface), testées dans tests/withdraw.test.ts.
//
// Conventions (les mêmes que `simulate` dans calc.ts) : rendement annuel composé converti en taux mensuel équivalent,
// versements ET retraits en fin de mois, après le rendement du mois. Année 1 = les 12 premiers mois.
import type { DcaPhase, Simulation, WithdrawKind, WithdrawPhase } from './types';

export const DEFAULT_INFLATION = 0.02;
export const DEFAULT_VOLATILITY = 0.15;
/** Prélèvements sociaux sur les gains d'un retrait de PEA de plus de 5 ans (18,6 % depuis janvier 2026). */
export const DEFAULT_TAX_RATE = 0.186;
/** Durée maximale cherchée par la calculette (années) : au-delà, le capital est dit « durable ». */
export const MAX_CALC_YEARS = 100;

export interface WithdrawConfig {
  initialCapital: number;
  annualRate: number;
  years: number; // horizon simulé
  dca: DcaPhase[];
  withdrawals: WithdrawPhase[];
  mode: 'amount' | 'percent';
  indexed: boolean;
  inflation: number;
  keepDca: boolean;
  tax: boolean;
  taxRate: number;
  basis?: number; // prix de revient initial (défaut : le capital initial)
  allowNegative?: boolean; // le solveur laisse le capital passer sous zéro pour rester continu
  floor?: number; // seuil sous lequel le capital est dit épuisé (défaut 0)
}

export interface YearPoint {
  year: number;
  value: number; // capital en fin d'année
  deposited: number; // versements cumulés (capital initial compris)
  withdrawn: number; // retraits nets cumulés (ce qui arrive sur le compte)
  tax: number; // prélèvements sociaux cumulés
}

export interface RunResult {
  years: YearPoint[];
  finalValue: number;
  depletedMonth: number | null; // premier mois où le capital ne couvre plus le retrait (null = jamais)
  startYear: number | null; // première année de retrait
  totalWithdrawn: number;
  totalDeposited: number;
  totalTax: number;
  unpaid: number; // retraits demandés mais impossibles à payer (capital épuisé), nets
}

export function configFromSim(sim: Simulation): WithdrawConfig {
  return {
    initialCapital: sim.initialCapital, annualRate: sim.annualRate, years: sim.horizonYears,
    dca: sim.dcaPhases, withdrawals: sim.withdrawals ?? [],
    mode: sim.withdrawMode ?? 'amount', indexed: !!sim.withdrawIndexed, inflation: sim.inflation ?? DEFAULT_INFLATION,
    keepDca: !!sim.keepDca, tax: !!sim.withdrawTax, taxRate: sim.withdrawTaxRate ?? DEFAULT_TAX_RATE,
  };
}

/** Type effectif d'une phase (les anciennes phases sans type suivent le réglage global). */
export const kindOf = (p: WithdrawPhase, mode: 'amount' | 'percent'): WithdrawKind => p.kind ?? (mode === 'percent' ? 'percent' : 'monthly');

/** Phase en vigueur pendant l'année `year` (la dernière dont le début est passé), comme les phases de versement. */
function phaseIndexByYear<T extends { fromYear: number }>(phases: T[], years: number): number[] {
  const sorted = phases.map((p, i) => ({ p, i })).sort((a, b) => a.p.fromYear - b.p.fromYear);
  const out: number[] = [];
  for (let y = 1; y <= years; y++) {
    let idx = -1;
    for (const s of sorted) if (y >= s.p.fromYear) idx = s.i;
    out.push(idx);
  }
  return out;
}

/** Simulation mensuelle. `growth(k)` donne le facteur de rendement du mois k (0 = premier mois) ; par défaut le rendement constant. */
export function run(cfg: WithdrawConfig, growth?: (k: number) => number, onYear?: (year: number, value: number) => void, detail = true): RunResult {
  const n = Math.max(0, Math.round(cfg.years * 12));
  const nYears = Math.ceil(n / 12);
  const rm = Math.pow(1 + cfg.annualRate, 1 / 12) - 1;
  const dcaIdx = phaseIndexByYear(cfg.dca, nYears);
  // retraits réguliers (mensuel ou %) : la phase en vigueur est la dernière commencée ; sommes ponctuelles : une fois, au début de leur année
  const recur = cfg.withdrawals.filter((p) => kindOf(p, cfg.mode) !== 'lump');
  const lumps = cfg.withdrawals.filter((p) => kindOf(p, cfg.mode) === 'lump').map((p) => ({ ...p, month: (Math.max(1, Math.round(p.fromYear)) - 1) * 12 + 1 }));
  const wdIdx = phaseIndexByYear(recur, nYears);
  const startYear = cfg.withdrawals.length ? Math.min(...cfg.withdrawals.map((p) => p.fromYear)) : null;
  const dcaStopYear = recur.length ? Math.min(...recur.map((p) => p.fromYear)) : null; // une somme ponctuelle n'arrête pas les versements
  const floor = cfg.floor ?? 0;
  let v = cfg.initialCapital, basis = cfg.basis ?? cfg.initialCapital;
  let dep = cfg.initialCapital, wd = 0, tax = 0, unpaid = 0;
  let depleted: number | null = null;
  const years: YearPoint[] = detail ? [{ year: 0, value: v, deposited: dep, withdrawn: 0, tax: 0 }] : [];
  onYear?.(0, v);
  for (let mo = 1; mo <= n; mo++) {
    const year = Math.floor((mo - 1) / 12) + 1; // année du mois (1..)
    v *= growth ? growth(mo - 1) : 1 + rm;
    // versements : arrêtés dès le début des retraits, sauf si on choisit de les garder
    const d = dcaIdx[year - 1] >= 0 ? cfg.dca[dcaIdx[year - 1]].monthly : 0;
    if (d > 0 && (dcaStopYear === null || year < dcaStopYear || cfg.keepDca)) { v += d; basis += d; dep += d; }
    // une demande de retrait (net) : on vend ce qu'il faut, prélèvements sociaux compris, dans la limite du capital
    const pay = (kind: WithdrawKind, amount: number, idx: number) => {
      const gainShare = v > 0 ? Math.max(0, (v - basis) / v) : 0;
      const k = cfg.tax ? cfg.taxRate * gainShare : 0;
      let gross = kind === 'percent' ? Math.max(0, v) * (amount / 100) / 12 : (amount * idx) / (1 - k);
      let net = gross * (1 - k);
      if (!cfg.allowNegative && gross > v) { // capital insuffisant : on vend tout ce qui reste
        gross = Math.max(0, v); const paid = gross * (1 - k); unpaid += net - paid; net = paid;
      }
      if (v > 0) basis = Math.max(0, basis - gross * (basis / v));
      v -= gross; wd += net; tax += gross - net;
      if (depleted === null && (cfg.allowNegative ? v < floor - 1e-9 : unpaid > 1e-9 || v <= 1e-9)) depleted = mo;
      if (!cfg.allowNegative && v < 1e-9) { v = 0; basis = 0; }
    };
    for (const l of lumps) if (l.month === mo && l.amount > 0) pay('lump', l.amount, 1);
    const wi = wdIdx[year - 1];
    if (wi >= 0) {
      const ph = recur[wi];
      const kind = kindOf(ph, cfg.mode);
      // revalorisation : le montant de la phase vaut à son année de début, puis suit l'inflation chaque année
      const idx = cfg.indexed && kind === 'monthly' ? Math.pow(1 + cfg.inflation, year - Math.max(1, ph.fromYear)) : 1;
      pay(kind, ph.amount, idx);
    }
    if (mo % 12 === 0 || mo === n) {
      const yr = mo / 12;
      if (detail) years.push({ year: yr, value: v, deposited: dep, withdrawn: wd, tax });
      onYear?.(yr, v);
    }
  }
  return { years, finalValue: v, depletedMonth: depleted, startYear, totalWithdrawn: wd, totalDeposited: dep, totalTax: tax, unpaid };
}

// ---------------------------------------------------------------- calculette à 4 variables
export type Unknown = 'years' | 'monthly' | 'capital' | 'rate';

export interface CalcInput {
  capital: number;
  rate: number; // rendement annuel
  monthly: number; // retrait mensuel net (€)
  years: number; // durée du retrait
  target: number; // capital restant visé à la fin (0 = tout consommer)
  indexed: boolean;
  inflation: number;
  tax: boolean;
  taxRate: number;
  basis?: number; // prix de revient du capital (défaut : le capital, donc sans gain)
}

/** `incomplete` : une valeur connue manque (durée vide ou nulle) ; la valeur renvoyée est alors NaN. */
export type SolveStatus = 'ok' | 'durable' | 'zero' | 'impossible' | 'incomplete';
export interface Solution { value: number; status: SolveStatus }

export function calcConfig(i: CalcInput, years = i.years): WithdrawConfig {
  return {
    initialCapital: i.capital, annualRate: i.rate, years, dca: [], withdrawals: i.monthly > 0 ? [{ fromYear: 1, amount: i.monthly }] : [],
    mode: 'amount', indexed: i.indexed, inflation: i.inflation, keepDca: false, tax: i.tax, taxRate: i.taxRate, basis: i.basis, allowNegative: true, floor: i.target,
  };
}

/** Capital restant au bout de la durée (négatif = manque). */
export function balanceAfter(i: CalcInput): number {
  return run(calcConfig(i), undefined, undefined, false).finalValue;
}

function bisect(f: (x: number) => number, lo: number, hi: number, increasing: boolean): number {
  for (let k = 0; k < 120; k++) {
    const mid = (lo + hi) / 2;
    const above = f(mid) >= 0;
    if (above === increasing) hi = mid; else lo = mid;
    if (hi - lo <= Math.max(1e-10, Math.abs(hi) * 1e-12)) break;
  }
  return (lo + hi) / 2;
}

/** Nombre de mois pendant lesquels le retrait est payé en entier avant que le capital passe sous `target` (Infinity si jamais en 100 ans). */
export function monthsLasting(i: CalcInput): number {
  const r = run(calcConfig(i, MAX_CALC_YEARS), undefined, undefined, false);
  return r.depletedMonth === null ? Infinity : r.depletedMonth - 1;
}

/** Calcule la variable inconnue à partir des autres. */
export function solve(unknown: Unknown, i: CalcInput): Solution {
  // sans durée (champ vide ou 0), retrait, capital et rendement n'ont pas de sens : pas de résultat plutôt qu'un nombre démesuré
  if (unknown !== 'years' && !(i.years * 12 >= 1)) return { value: NaN, status: 'incomplete' };
  const fin = (x: Partial<CalcInput>) => balanceAfter({ ...i, ...x }) - i.target;
  switch (unknown) {
    case 'years': {
      const m = monthsLasting(i);
      return m === Infinity ? { value: MAX_CALC_YEARS, status: 'durable' } : { value: m / 12, status: 'ok' };
    }
    case 'monthly': {
      if (fin({ monthly: 0 }) < 0) return { value: 0, status: 'zero' }; // même sans retrait, le capital visé n'est pas atteint
      let hi = Math.max(1, i.capital / Math.max(1, i.years * 12)) * 2;
      for (let k = 0; k < 80 && fin({ monthly: hi }) > 0; k++) hi *= 2;
      return { value: bisect((w) => fin({ monthly: w }), 0, hi, false), status: 'ok' };
    }
    case 'capital': {
      let hi = Math.max(1, i.monthly * i.years * 12 + i.target) * 2;
      for (let k = 0; k < 80 && fin({ capital: hi, basis: i.basis === undefined ? undefined : i.basis }) < 0; k++) hi *= 2;
      return { value: bisect((c) => fin({ capital: c }), 0, hi, true), status: 'ok' };
    }
    case 'rate': {
      if (fin({ rate: 0 }) >= 0) return { value: 0, status: 'zero' }; // 0 % suffit déjà
      if (fin({ rate: 0.5 }) < 0) return { value: 0.5, status: 'impossible' };
      return { value: bisect((r) => fin({ rate: r }), 0, 0.5, true), status: 'ok' };
    }
  }
}

/** Capital nécessaire à l'échéance pour retirer `monthly` €/mois pendant `years` ans (objectifs de revenu). */
export function requiredCapital(monthly: number, years: number, rate: number, indexed = false, inflation = DEFAULT_INFLATION): number {
  if (!(monthly > 0) || !(years > 0)) return 0;
  return solve('capital', { capital: 0, rate, monthly, years, target: 0, indexed, inflation, tax: false, taxRate: DEFAULT_TAX_RATE }).value;
}

// ---------------------------------------------------------------- Monte Carlo
export interface McResult {
  paths: number;
  successRate: number; // part des tirages où le capital n'est jamais épuisé (retraits tous payés)
  p10: number[]; p50: number[]; p90: number[]; // capital en fin de chaque année (0..years)
  medianDepletionYear: number | null; // année médiane d'épuisement parmi les tirages épuisés
  depletedShare: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tirages aléatoires : rendements mensuels log-normaux indépendants, de médiane égale au rendement annuel choisi
 * (la courbe « constante » est donc la médiane) et de volatilité annuelle `vol`. Chaque tirage a sa propre graine :
 * mêmes résultats d'un affichage à l'autre, et un changement de paramètre déplace la courbe sans la « secouer ».
 */
export function monteCarlo(cfg: WithdrawConfig, vol = DEFAULT_VOLATILITY, paths = 2000, seed = 1): McResult {
  const n = Math.max(0, Math.round(cfg.years * 12));
  const nY = Math.ceil(n / 12);
  const mu = Math.log(1 + cfg.annualRate) / 12, sg = vol / Math.sqrt(12);
  const byYear: Float64Array[] = Array.from({ length: nY + 1 }, () => new Float64Array(paths));
  const c = { ...cfg, allowNegative: false };
  let ok = 0; const depYears: number[] = [];
  for (let p = 0; p < paths; p++) {
    const rnd = mulberry32(seed * 1000003 + p * 7919 + 17);
    let spare = NaN;
    const g = () => {
      let z: number;
      if (!Number.isNaN(spare)) { z = spare; spare = NaN; } else {
        const u = Math.max(rnd(), 1e-12), w = rnd(), r = Math.sqrt(-2 * Math.log(u));
        z = r * Math.cos(2 * Math.PI * w); spare = r * Math.sin(2 * Math.PI * w);
      }
      return Math.exp(mu + sg * z);
    };
    const res = run(c, g, (y, v) => { byYear[Math.min(Math.ceil(y), nY)][p] = v; }, false);
    if (res.depletedMonth === null) ok++; else depYears.push(Math.ceil(res.depletedMonth / 12));
  }
  const pick = (arr: Float64Array, q: number) => { const s = Float64Array.from(arr).sort(); return s[Math.min(paths - 1, Math.max(0, Math.round(q * (paths - 1))))]; };
  depYears.sort((a, b) => a - b);
  return {
    paths, successRate: paths ? ok / paths : 0,
    p10: byYear.map((a) => pick(a, 0.1)), p50: byYear.map((a) => pick(a, 0.5)), p90: byYear.map((a) => pick(a, 0.9)),
    medianDepletionYear: depYears.length ? depYears[Math.floor(depYears.length / 2)] : null, depletedShare: paths ? depYears.length / paths : 0,
  };
}
