// Mise à jour des cours. Deux sources possibles, sans frais :
//  • « Automatique » : prices.json publié avec l'app et mis à jour 2 fois par jour par GitHub Actions
//    (API EODHD, clé gratuite gardée en secret dans le dépôt ; EODHD refuse les appels directs d'un navigateur)
//  • Google Sheets publié en CSV (colonnes : ticker, cours[, date]) alimenté par GOOGLEFINANCE
import { useSyncExternalStore } from 'react';
import type { AppData, Etf } from '../domain/types';
import { getData, update } from './store';
import { todayIso } from '../domain/format';

export interface PriceStatus { loading: boolean; error: string; errorAt: string }
let status: PriceStatus = { loading: false, error: '', errorAt: '' };
const listeners = new Set<() => void>();
function setStatus(s: Partial<PriceStatus>) { status = { ...status, ...s }; listeners.forEach((l) => l()); }
export function usePriceStatus(): PriceStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}

interface Quote { id: string; price: number; date: string; history?: [string, number][] }
interface PricesFile { updatedAt: string; quotes: Record<string, { price: number; date: string; history?: [string, number][] }> }

async function fromServer(etfs: Etf[]): Promise<Quote[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(new URL('prices.json', document.baseURI).href + '?t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) throw new Error('Fichier des cours introuvable (' + r.status + ')');
    const f = (await r.json()) as PricesFile;
    const out: Quote[] = [];
    for (const e of etfs) {
      const q = f.quotes?.[e.ticker];
      if (q && isFinite(q.price) && q.price > 0 && q.date) out.push({ id: e.id, price: q.price, date: q.date, history: q.history });
    }
    if (!out.length) throw new Error('Aucun cours disponible pour vos ETF');
    return out;
  } finally { clearTimeout(t); }
}

/** CSV publié depuis Google Sheets : « ticker;cours;date » ou « ticker,cours,date » (en-tête facultatif). */
export function parseCsvQuotes(text: string, etfs: Etf[]): Quote[] {
  const out: Quote[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cells = line.includes(';') ? line.split(';') : line.match(/("([^"]|"")*"|[^,]+)/g) || [];
    const clean = cells.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    if (clean.length < 2) continue;
    const tk = clean[0].toUpperCase().replace(/^EPA:/, '').replace(/\.PA$/, '');
    const etf = etfs.find((e) => e.ticker.toUpperCase() === tk);
    const price = Number(clean[1].replace(/\s/g, '').replace(',', '.'));
    if (!etf || !isFinite(price) || price <= 0) continue;
    let date = todayIso();
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(clean[2] || '');
    if (m) date = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    else if (/^\d{4}-\d{2}-\d{2}/.test(clean[2] || '')) date = clean[2].slice(0, 10);
    out.push({ id: etf.id, price, date });
  }
  return out;
}

async function fromCsv(etfs: Etf[], url: string): Promise<Quote[]> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Feuille Google inaccessible (' + r.status + ')');
  const quotes = parseCsvQuotes(await r.text(), etfs);
  if (!quotes.length) throw new Error('Aucun cours reconnu dans la feuille');
  return quotes;
}

export function applyQuotes(d: AppData, quotes: Quote[]): void {
  for (const q of quotes) {
    const e = d.etfs.find((x) => x.id === q.id);
    if (!e) continue;
    if (q.history?.length) {
      const idx = new Map(e.priceHistory.map((p, i) => [p[0], i]));
      for (const p of q.history) {
        const i = idx.get(p[0]);
        if (i === undefined) e.priceHistory.push([p[0], p[1]]);
        else e.priceHistory[i] = [p[0], p[1]];
      }
      e.priceHistory.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }
    if (q.date && isFinite(q.price) && q.price > 0) {
      e.lastPrice = q.price;
      e.lastPriceDate = q.date;
      const h = e.priceHistory;
      if (h.length && h[h.length - 1][0] === q.date) h[h.length - 1] = [q.date, q.price];
      else if (!h.length || h[h.length - 1][0] < q.date) h.push([q.date, q.price]);
    }
  }
  d.settings.lastPriceUpdate = new Date().toISOString();
}

export function hasPriceSource(d: AppData = getData()): boolean {
  return d.settings.priceProvider === 'csv' ? !!d.settings.csvUrl : true;
}

/** Actualise les cours des ETF suivis et détenus. */
export async function refreshPrices(opts: { force?: boolean; silent?: boolean } = {}): Promise<boolean> {
  const d = getData();
  if (status.loading) return false;
  if (!hasPriceSource(d)) {
    if (!opts.silent) setStatus({ error: 'Ajoutez une source de cours dans les paramètres', errorAt: new Date().toISOString() });
    return false;
  }
  const held = new Set(d.transactions.map((t) => t.etfId));
  const etfs = d.etfs.filter((e) => d.myEtfIds.includes(e.id) || held.has(e.id));
  setStatus({ loading: true });
  try {
    const quotes = d.settings.priceProvider === 'csv' ? await fromCsv(etfs, d.settings.csvUrl) : await fromServer(etfs);
    update((x) => applyQuotes(x, quotes), { touch: false });
    setStatus({ loading: false, error: '', errorAt: '' });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'AbortError' ? 'Délai dépassé' : err.message) : 'Erreur inconnue';
    setStatus({ loading: false, error: msg === 'Failed to fetch' ? 'Pas de connexion' : msg, errorAt: new Date().toISOString() });
    return false;
  }
}

/** Test d'une source depuis les paramètres (n'enregistre rien). */
export async function testSource(provider: 'server' | 'csv', value: string): Promise<string> {
  const etfs = getData().etfs;
  const q = provider === 'csv' ? await fromCsv(etfs, value) : await fromServer(etfs);
  return q.length + ' cours lus (ex. ' + q[0].id + ' : ' + q[0].price.toString().replace('.', ',') + ' € au ' + q[0].date.split('-').reverse().join('/') + ')';
}

/** Actualisation automatique selon le réglage (ouverture de l'app / toutes les heures). */
export function startAutoRefresh(): void {
  const d = getData();
  if (d.settings.priceRefresh !== 'manual') setTimeout(() => refreshPrices({ silent: true }), 800);
  setInterval(() => {
    const s = getData().settings;
    if (s.priceRefresh !== 'hour' || document.hidden) return;
    const now = new Date();
    const day = now.getDay(), h = now.getHours();
    if (day >= 1 && day <= 5 && h >= 9 && h <= 19) refreshPrices({ silent: true });
  }, 60 * 60 * 1000);
}
