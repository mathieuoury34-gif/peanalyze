// Formatage français (HANDOFF §4)
export const NBSP = ' '; // entre nombre et unité
export const MINUS = '−';

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const k = min + ':' + max;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(k, f);
  }
  return f;
}

/** Nombre au format français, sans signe moins ASCII. */
export function num(v: number, min = 2, max = min): string {
  const s = nf(min, max).format(Math.abs(v));
  return (v < 0 && Math.abs(v) >= Math.pow(10, -max) / 2 ? MINUS : '') + s;
}

export function eur(v: number, decimals = 2, maxDecimals = decimals): string {
  return num(v, decimals, maxDecimals) + NBSP + '€';
}

/** Montant signé (+ explicite pour les gains). */
export function eurSigned(v: number, decimals = 2): string {
  const r = Math.round(v * Math.pow(10, decimals));
  return (r > 0 ? '+' : '') + eur(v, decimals);
}

export function pct(ratio: number, decimals = 1): string {
  return num(ratio * 100, decimals) + NBSP + '%';
}

export function pctSigned(ratio: number, decimals = 1): string {
  const r = Math.round(ratio * 100 * Math.pow(10, decimals));
  return (r > 0 ? '+' : '') + pct(ratio, decimals);
}

/** Points de pourcentage signés : « −19,6 » */
export function pts(v: number, decimals = 1): string {
  const r = Math.round(v * Math.pow(10, decimals));
  return (r > 0 ? '+' : '') + num(v, decimals);
}

export function aum(v: number | null): string {
  if (v === null || v === undefined) return '—';
  if (v < 1) return '< 1' + NBSP + 'M€';
  return num(v, 0) + NBSP + 'M€';
}

export function arrow(v: number): string {
  return v >= 0 ? '▲' : '▼';
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** 'YYYY-MM-DD' → 'jj/mm/aaaa' */
export function dateFr(iso: string): string {
  if (!iso) return '';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}
/** 'YYYY-MM-DD' → 'jj/mm' */
export function dateShort(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}
/** 'YYYY-MM' → 'sept. 26' */
export function monthShort(ym: string): string {
  return MONTHS_SHORT[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
}
/** 'YYYY-MM' → 'septembre 2026' */
export function monthLong(ym: string): string {
  return MONTHS_LONG[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
}
export function monthName(m: number): string {
  return MONTHS_LONG[m];
}
export function weekday(iso: string): string {
  return WEEKDAYS[new Date(iso + 'T12:00:00').getDay()];
}
export function dateLong(iso: string): string {
  const d = weekday(iso);
  return d.charAt(0).toUpperCase() + d.slice(1) + ' ' + +iso.slice(8, 10) + ' ' + MONTHS_SHORT[+iso.slice(5, 7) - 1];
}

/** 'jj/mm/aaaa' → 'YYYY-MM-DD' ou '' si invalide */
export function parseDateFr(s: string): string {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(s);
  if (!m) return '';
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** Saisie française « 1 234,56 » → nombre (NaN si vide/invalide) */
export function parseNum(s: string): number {
  const t = String(s).replace(/[\s  €%]/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return NaN;
  const v = Number(t);
  return isFinite(v) ? v : NaN;
}

/** Nombre → texte de champ « 34,28 » (sans séparateur de milliers) */
export function toInput(v: number, decimals = 2): string {
  if (!isFinite(v)) return '';
  return v.toFixed(decimals).replace('.', ',');
}

export function todayIso(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function dateTimeFr(isoDateTime: string): string {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' à ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
