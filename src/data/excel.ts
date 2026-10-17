// Import Excel : classeur PEAnalyze (export officiel de l'app, 9 onglets) ou fichier d'origine
// « Suivi des investissements.xlsx » (6 feuilles). L'export est dans excel-peanalyze.ts.
import JSZip from 'jszip';
import type { AppData, Deposit, Etf, Goal, Plan, PlanSell, Transaction } from '../domain/types';
import { t } from '../i18n';

// libellés « Indice » utilisés dans l'Excel d'origine pour les ETF suivis
const EXCEL_LABEL: Record<string, string> = {
  ESE: 'S&P 500', PUST: 'NASDAQ-100®', PAEEM: 'MSCI Emerging Markets', ETZ: 'Stoxx 600', CACC: 'CAC 40', WPEA: 'MSCI World',
};

// ------------------------------------------------------------------ utilitaires XML
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function isoToSerial(iso: string): number {
  return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);
}
export function serialToIso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parts = Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((x) => unesc(x[1]));
    out.push(parts.join(''));
  }
  return out;
}

/** Lit toutes les cellules d'une feuille : réf → valeur (nombre ou texte). */
function readCells(xml: string, sst: string[]): Map<string, number | string> {
  const map = new Map<string, number | string>();
  const re = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const inner = m[3];
    if (!inner) continue;
    const t = /\st="([^"]+)"/.exec(m[2])?.[1];
    if (t === 'inlineStr') { map.set(m[1], unesc(Array.from(inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((x) => x[1]).join(''))); continue; }
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    if (v === undefined) continue;
    if (t === 's') map.set(m[1], sst[+v] ?? '');
    else if (t === 'str' || t === 'e') map.set(m[1], unesc(v));
    else if (t === 'b') map.set(m[1], v === '1' ? 1 : 0);
    else map.set(m[1], Number(v));
  }
  return map;
}

/** Feuilles du classeur : nom → chemin dans l'archive. */
async function sheetPaths(zip: JSZip): Promise<Map<string, string>> {
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const out = new Map<string, string>();
  if (!wb || !rels) return out;
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1], t = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && t) target.set(id, t.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]+)"/.exec(m[0])?.[1], rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    if (name && rid && target.has(rid)) out.set(unesc(name), 'xl/' + target.get(rid)!);
  }
  return out;
}

async function loader(buf: ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(buf);
  const paths = await sheetPaths(zip);
  const sst = zip.file('xl/sharedStrings.xml') ? sharedStrings(await zip.file('xl/sharedStrings.xml')!.async('string')) : [];
  const sheet = async (name: string, fallback?: string) => {
    const p = paths.get(name) || fallback;
    const f = p ? zip.file(p) : null;
    if (!f) throw new Error(t('feuille « {n} » manquante', { n: name }));
    return readCells(await f.async('string'), sst);
  };
  return { zip, paths, sheet };
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : NaN);
const round2 = (v: number) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ classeur PEAnalyze (export de l'app)
async function parsePeanalyze(L: Awaited<ReturnType<typeof loader>>, current: AppData): Promise<AppData> {
  const next: AppData = structuredClone(current);
  const hist = await L.sheet('Historique');
  const deposits: Deposit[] = [];
  const transactions: Transaction[] = [];
  const unknown = new Set<string>();
  for (let r = 6; r < 6 + 5000; r++) {
    const a = hist.get('A' + r), b = hist.get('B' + r), d = hist.get('D' + r);
    if (a === undefined && d === undefined && hist.get('A' + (r + 1)) === undefined && hist.get('D' + (r + 1)) === undefined) break;
    if (typeof a === 'number' && typeof b === 'number' && b !== 0) deposits.push({ id: 'd-' + serialToIso(a) + '-' + r, date: serialToIso(a), amount: round2(b) }); // négatif = retrait
    if (typeof d === 'number') {
      const tk = String(hist.get('E' + r) || '').trim().toUpperCase();
      const unit = num(hist.get('G' + r)), qty = num(hist.get('H' + r)), gross = num(hist.get('J' + r)), refund = num(hist.get('L' + r));
      if (!tk || !isFinite(unit) || !isFinite(qty) || !isFinite(gross)) continue;
      if (!next.etfs.some((e) => e.id === tk)) unknown.add(tk);
      transactions.push({ id: 'b-' + serialToIso(d) + '-' + tk + '-' + r, date: serialToIso(d), etfId: tk, unitPrice: unit, quantity: qty, grossAmount: gross,
        fees: Math.round((gross - unit * qty) * 1e4) / 1e4, feeRefund: isFinite(refund) ? refund : 0 });
    }
  }
  if (!deposits.length && !transactions.length) throw new Error(t('aucune opération trouvée'));
  // ETF inconnus de l'app : repris du catalogue (cours indicatif), sinon l'import est refusé
  for (const tk of unknown) {
    const c = next.catalog.find((x) => x.ticker === tk);
    if (!c) throw new Error(t('ETF « {t} » inconnu', { t: tk }));
    next.etfs.push({ id: tk, index: c.index, name: c.name, isin: c.isin, ticker: tk, exchange: c.exchange, category: c.category, peaEligible: c.peaEligible,
      lastPrice: c.unitPrice ?? 0, ter: c.ter, aumMEur: c.aumMEur ?? 0, replication: c.replication ?? 'Synthétique', distribution: c.distribution ?? 'Capitalisant',
      inStrategy: false, sectors: structuredClone(c.sectors ?? []), countries: structuredClone(c.countries ?? []), comp: c.comp && { ...c.comp }, priceHistory: [] });
    if (!next.myEtfIds.includes(tk)) next.myEtfIds.push(tk);
  }
  next.deposits = deposits;
  next.transactions = transactions;
  next.settings.cashBalance = null;

  // Mes ETF : liste, ordre, stratégie, allocation cible et couleurs lus dans le classeur
  try {
    const me = await L.sheet('Mes ETF');
    const listed: string[] = [];
    const colors: Record<string, string> = {};
    const targets: Record<string, number> = {};
    const strat: Record<string, boolean> = {};
    for (let r = 5; r < 60; r++) {
      const raw = me.get('A' + r);
      if (typeof raw !== 'string' || !raw.trim()) { if (r > 30) break; continue; }
      const tk = raw.trim().toUpperCase();
      let e = next.etfs.find((x) => x.id === tk);
      if (!e) {
        const c = next.catalog.find((x) => x.ticker === tk);
        if (!c) throw new Error(t('ETF « {t} » inconnu', { t: tk }));
        e = { id: tk, index: c.index, name: c.name, isin: c.isin, ticker: tk, exchange: c.exchange, category: c.category, peaEligible: c.peaEligible,
          lastPrice: c.unitPrice ?? 0, ter: c.ter, aumMEur: c.aumMEur ?? 0, replication: c.replication ?? 'Synthétique', distribution: c.distribution ?? 'Capitalisant',
          inStrategy: false, sectors: structuredClone(c.sectors ?? []), countries: structuredClone(c.countries ?? []), comp: c.comp && { ...c.comp }, priceHistory: [] };
        next.etfs.push(e);
      }
      if (listed.includes(tk)) continue;
      listed.push(tk);
      const g = num(me.get('G' + r));
      strat[tk] = String(me.get('F' + r) || '').trim().toLowerCase() === 'oui' && isFinite(g) && g > 0;
      targets[tk] = strat[tk] ? g : 0;
      const col = String(me.get('O' + r) ?? '').trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{6}$/.test(col)) colors[tk] = col.toUpperCase();
    }
    if (listed.length) {
      // la liste de l'ami remplace la vôtre ; les ETF détenus absents de la feuille restent suivis à la suite
      const held = [...new Set(transactions.map((x) => x.etfId))].filter((x) => !listed.includes(x));
      next.myEtfIds = [...listed, ...held];
      for (const e of next.etfs) { e.inStrategy = !!strat[e.id]; }
      next.targetAllocation = targets;
      next.etfs = next.etfs.filter((e) => next.myEtfIds.includes(e.id));
      next.settings.etfColors = colors; // couleurs du classeur (les ETF sans couleur reçoivent la première libre)
    }
  } catch (err) {
    if (err instanceof Error && !/manquante/.test(err.message)) throw err; // onglet absent : on garde la stratégie de l'app
  }

  // simulateur
  try {
    const si = await L.sheet('Simulateur');
    const od = si.get('B10');
    if (typeof od === 'number' && od > 0) next.settings.peaOpeningDate = serialToIso(od);
    const cap = num(si.get('B5')), hz = num(si.get('B6')), rate = num(si.get('B7'));
    if (isFinite(cap) && isFinite(hz) && isFinite(rate)) {
      const phases = [];
      for (let r = 6; r <= 15; r++) {
        const y = num(si.get('D' + r)), m = num(si.get('E' + r));
        if (isFinite(y) && isFinite(m)) phases.push({ fromYear: y, monthly: m });
      }
      next.simulation = { initialCapital: cap, horizonYears: hz, annualRate: rate, dcaPhases: phases.length ? phases : next.simulation.dcaPhases };
    }
    // réglages rangés dans le classeur : rappel mensuel et ETF de référence (absents = désactivés)
    const rd = num(si.get('B11'));
    next.settings.reminderDay = isFinite(rd) && rd >= 1 && rd <= 28 ? Math.round(rd) : 0;
    const bm = String(si.get('B12') ?? '').trim().toUpperCase();
    next.settings.benchmarkId = bm && next.etfs.some((e) => e.id === bm) ? bm : undefined;
  } catch { /* onglet absent */ }

  // plans et objectifs appartiennent au classeur : ceux de l'application sont remplacés (vides si l'onglet est absent)
  next.plans = await readPlans(L);
  next.goals = await readGoals(L);
  return next;
}

/** Onglet « Plans » : une ligne par plan (A–G) + détail des ventes et cibles (I–M). */
async function readPlans(L: Awaited<ReturnType<typeof loader>>): Promise<Plan[]> {
  let sh: Map<string, number | string>;
  try { sh = await L.sheet('Plans'); } catch { return []; }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const plans: Plan[] = [];
  const byId = new Map<string, Plan>();
  for (let r = 6, blank = 0; r < 2000 && blank < 40; r++) {
    const name = str(sh.get('B' + r));
    if (!name) { blank++; continue; }
    blank = 0;
    const id = str(sh.get('A' + r)) || 'plan-' + r;
    const n = (c: string) => { const v = num(sh.get(c + r)); return isFinite(v) && v > 0 ? v : 0; };
    const p: Plan = { id, name, createdAt: str(sh.get('C' + r)) || new Date().toISOString(), sells: [], deposit: n('D'), withdraw: n('E'), monthly: n('F'),
      targets: /^pers/i.test(str(sh.get('G' + r))) ? {} : null };
    plans.push(p);
    byId.set(id, p);
  }
  for (let r = 6, blank = 0; r < 4000 && blank < 40; r++) {
    const id = str(sh.get('I' + r));
    if (!id) { blank++; continue; }
    blank = 0;
    const p = byId.get(id);
    const etf = str(sh.get('K' + r)).toUpperCase();
    if (!p || !etf) continue;
    const type = str(sh.get('J' + r)).toLowerCase();
    const mode = str(sh.get('L' + r)).toLowerCase();
    const v = num(sh.get('M' + r));
    if (type.startsWith('v')) {
      const sell: PlanSell = mode.startsWith('t') ? { etfId: etf, kind: 'all', value: 0 } : mode === '%' ? { etfId: etf, kind: 'pct', value: isFinite(v) ? Math.min(1, Math.max(0, v)) : 0 } : { etfId: etf, kind: 'qty', value: isFinite(v) ? Math.max(0, v) : 0 };
      p.sells.push(sell);
    } else if (type.startsWith('c') && p.targets && isFinite(v)) p.targets[etf] = Math.max(0, v);
  }
  for (const p of plans) if (p.targets && !Object.keys(p.targets).length) p.targets = null;
  return plans;
}

/** Onglet « Objectifs » : nom, capital visé, échéance. */
async function readGoals(L: Awaited<ReturnType<typeof loader>>): Promise<Goal[]> {
  let sh: Map<string, number | string>;
  try { sh = await L.sheet('Objectifs'); } catch { return []; }
  const goals: Goal[] = [];
  for (let r = 6, blank = 0; r < 600 && blank < 30; r++) {
    const name = sh.get('B' + r), target = num(sh.get('C' + r)), d = num(sh.get('D' + r));
    if (typeof name !== 'string' || !name.trim()) { blank++; continue; }
    blank = 0;
    if (!isFinite(target) || target <= 0 || !isFinite(d) || d <= 0) continue;
    const id = sh.get('A' + r), created = sh.get('E' + r);
    goals.push({ id: typeof id === 'string' && id ? id : 'goal-' + r, name: name.trim(), target: round2(target), date: serialToIso(d), createdAt: typeof created === 'string' && created ? created : new Date().toISOString() });
  }
  return goals;
}

// ------------------------------------------------------------------ fichier d'origine « Suivi des investissements.xlsx »
async function parseOriginal(L: Awaited<ReturnType<typeof loader>>, current: AppData): Promise<AppData> {
  const sel = await L.sheet('Sélection ETF', 'xl/worksheets/sheet1.xml');
  const labelToTicker = new Map<string, string>();
  const tickerRow: Record<string, number> = {};
  for (let r = 2; r <= 40; r++) {
    const a = sel.get('A' + r), d = sel.get('D' + r);
    if (typeof d === 'string' && d && typeof a === 'string') { labelToTicker.set(a.trim(), d.trim()); tickerRow[d.trim()] = r; }
  }
  for (const [tk, lab] of Object.entries(EXCEL_LABEL)) if (!labelToTicker.has(lab)) labelToTicker.set(lab, tk);

  const hist = await L.sheet('Historique des achats', 'xl/worksheets/sheet3.xml');
  let header = 0;
  for (let r = 2; r < 400; r++) if (hist.get('A' + r) === 'DATE') { header = r; break; }
  if (!header) throw new Error(t('tableau des achats introuvable'));
  const deposits: Deposit[] = [];
  for (let r = 2; r < header; r++) {
    const a = hist.get('A' + r), b = hist.get('B' + r);
    if (typeof a === 'number' && typeof b === 'number' && b > 0) deposits.push({ id: 'd-' + serialToIso(a) + '-' + r, date: serialToIso(a), amount: round2(b) });
  }
  const transactions: Transaction[] = [];
  for (let r = header + 1; r < header + 2000; r++) {
    const a = hist.get('A' + r);
    if (typeof a !== 'number') { if (hist.get('A' + (r + 1)) === undefined) break; continue; }
    const label = String(hist.get('B' + r) || '').trim();
    const name = String(hist.get('C' + r) || '').trim();
    const tk = labelToTicker.get(label) || current.etfs.find((e) => e.name === name || e.index === label)?.id;
    const unit = Number(hist.get('D' + r)), qty = Number(hist.get('E' + r)), gross = Number(hist.get('G' + r)), refund = Number(hist.get('I' + r) || 0);
    if (!tk || !isFinite(unit) || !isFinite(qty) || !isFinite(gross)) continue;
    transactions.push({ id: 'b-' + serialToIso(a) + '-' + tk + '-' + r, date: serialToIso(a), etfId: tk, unitPrice: unit, quantity: qty, grossAmount: gross, fees: Math.round((gross - unit * qty) * 1e4) / 1e4, feeRefund: refund });
  }
  if (!deposits.length && !transactions.length) throw new Error(t('aucune opération trouvée'));

  const next: AppData = structuredClone(current);
  next.deposits = deposits;
  next.transactions = transactions;
  next.plans = []; // le fichier d'origine ne contient ni plans ni objectifs : ceux de l'autre classeur ne restent pas
  next.goals = [];
  // Solde espèces toujours recalculé (virements − achats frais compris + remboursements) : jamais figé par l'import
  next.settings.cashBalance = null;

  // cours (Sélection ETF, colonne H)
  for (const e of next.etfs) {
    const r = tickerRow[e.ticker];
    const v = r ? sel.get('H' + r) : undefined;
    if (typeof v === 'number' && v > 0) e.lastPrice = v;
  }
  // allocation cible (Synthèse, colonne J)
  const syn = await L.sheet('Synthèse du portefeuille', 'xl/worksheets/sheet5.xml');
  for (let r = 2; r <= 30; r++) {
    const lab = syn.get('A' + r);
    if (typeof lab !== 'string' || !lab.trim() || lab === 'TOTAL') continue;
    const tk = labelToTicker.get(lab.trim());
    const j = syn.get('J' + r);
    if (!tk || typeof j !== 'number') continue;
    next.targetAllocation[tk] = j;
    const e: Etf | undefined = next.etfs.find((x) => x.id === tk);
    if (e) e.inStrategy = j > 0;
  }
  // simulateur
  const sim = await L.sheet('Simulateur dépargne', 'xl/worksheets/sheet6.xml');
  const n = (ref: string) => num(sim.get(ref));
  if (isFinite(n('C2'))) {
    next.simulation = {
      initialCapital: n('C2'),
      horizonYears: isFinite(n('C3')) ? n('C3') : next.simulation.horizonYears,
      annualRate: isFinite(n('C4')) ? n('C4') : next.simulation.annualRate,
      dcaPhases: [6, 8, 10, 12].map((r) => ({ fromYear: n('C' + r), monthly: n('C' + (r + 1)) })).filter((p) => isFinite(p.fromYear) && isFinite(p.monthly) && p.fromYear < 999),
    };
  }
  return next;
}

/** Lit un classeur PEAnalyze ou le fichier d'origine et renvoie les données mises à jour. */
export async function parseWorkbook(buf: ArrayBuffer | Uint8Array, current: AppData): Promise<AppData> {
  const L = await loader(buf);
  if (L.paths.has('Historique') && L.paths.has('Mes ETF')) return parsePeanalyze(L, current);
  return parseOriginal(L, current);
}

export async function importXlsx(file: File, current: AppData): Promise<AppData> {
  return parseWorkbook(await file.arrayBuffer(), current);
}
