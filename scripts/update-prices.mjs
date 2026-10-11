// Met à jour public/prices.json avec l'API EODHD (offre gratuite : 20 appels/jour).
// Lancé par GitHub Actions 2 fois par jour ouvré ; la clé vient du secret EODHD_API_KEY.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'public/prices.json';
const KEY = process.env.EODHD_API_KEY;
const MAX_CALLS = 18;
if (!KEY) { console.log('EODHD_API_KEY absent : cours non mis à jour.'); process.exit(0); }

const file = JSON.parse(readFileSync(FILE, 'utf8'));
let calls = 0;
const iso = (d) => d.toISOString().slice(0, 10);
const nextDay = (s) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return iso(d); };
function lastBusinessDay() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}
async function get(path) {
  if (calls >= MAX_CALLS) throw new Error('quota de sécurité atteint');
  calls++;
  const r = await fetch(`https://eodhd.com/api/${path}${path.includes('?') ? '&' : '?'}api_token=${KEY}&fmt=json`);
  if (!r.ok) throw new Error(path.split('?')[0] + ' → HTTP ' + r.status);
  return r.json();
}
function put(q, date, close) {
  const h = q.history || (q.history = []);
  const i = h.findIndex((p) => p[0] === date);
  if (i >= 0) h[i] = [date, close]; else h.push([date, close]);
  h.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

let changed = false;
for (const tk of file.tickers) {
  const q = file.quotes[tk] || (file.quotes[tk] = { price: 0, date: '', history: [] });
  const sym = encodeURIComponent(tk + '.PA');
  try {
    const last = q.history?.length ? q.history[q.history.length - 1][0] : file.historyStart;
    if (last < lastBusinessDay()) {
      const rows = await get(`eod/${sym}?from=${nextDay(last)}`);
      for (const r of rows) if (r && r.date && Number.isFinite(r.close)) { put(q, r.date, r.close); changed = true; }
    }
    const rt = await get(`real-time/${sym}`);
    if (rt && Number.isFinite(rt.close) && rt.close > 0 && rt.timestamp) {
      const date = iso(new Date(rt.timestamp * 1000));
      put(q, date, rt.close);
      changed = true;
    }
    const h = q.history;
    if (h.length) { q.date = h[h.length - 1][0]; q.price = h[h.length - 1][1]; }
    console.log(tk, q.price, q.date);
  } catch (e) {
    console.log(tk, 'erreur :', e.message);
  }
}
if (changed) {
  file.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(file) + '\n');
}
console.log('appels EODHD :', calls, changed ? '— fichier mis à jour' : '— aucun changement');
