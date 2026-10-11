// Robot des cours (GitHub Actions) : met à jour public/prices.json avec l'API EODHD (offre gratuite, 20 appels/jour).
//
// Les ETF suivis = réunion des listes « Mes ETF » des comptes (Firestore, collection publique watch/{uid} :
// { tickers, freq, createdAt }). Le budget quotidien est partagé : les comptes les plus anciens sont servis
// en premier, et un ETF suivi par plusieurs comptes ne coûte qu'une fois.
//
// MODE (variable d'environnement) :
//   midday : cours de 13 h pour les ETF à 2 actualisations par jour
//   close  : cours de clôture pour tous les ETF suivis
//   sync   : passage horaire, récupère seulement l'historique des ETF nouvellement ajoutés
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const FILE = 'public/prices.json';
const KEY = process.env.EODHD_API_KEY;
const MODE = process.env.MODE || 'close';
export const BUDGET = 18; // appels par jour (2 de marge sur les 20 de l'offre gratuite)
const HISTORY_START = '2021-10-01'; // 5 ans d'historique à l'ajout d'un ETF
const PRUNE_DAYS = 60; // un ETF plus suivi par personne est effacé du fichier après ce délai
const fbSrc = readFileSync('src/data/firebase-config.ts', 'utf8');
const FIREBASE = { projectId: /projectId:\s*'([^']+)'/.exec(fbSrc)[1], apiKey: /apiKey:\s*'([^']+)'/.exec(fbSrc)[1] };

const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function lastBusinessDay() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

const file = JSON.parse(readFileSync(FILE, 'utf8'));
file.quotes ||= {};
const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8')).etfs;
const parisTickers = new Set(catalog.map((c) => c.ticker).filter(Boolean));

// ------------------------------------------------------------------ 1. qui suit quoi ?
async function readWatchLists() {
  const out = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/watch?pageSize=300&key=${FIREBASE.apiKey}${pageToken ? '&pageToken=' + pageToken : ''}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Firestore → HTTP ' + r.status);
    const j = await r.json();
    for (const d of j.documents || []) {
      const f = d.fields || {};
      const tickers = (f.tickers?.arrayValue?.values || []).map((v) => String(v.stringValue || '').toUpperCase()).filter((t) => parisTickers.has(t)).slice(0, BUDGET);
      out.push({ uid: d.name.split('/').pop(), tickers, freq: Number(f.freq?.integerValue || 2) === 1 ? 1 : 2, createdAt: f.createdAt?.stringValue || d.createTime });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

let users;
try {
  users = await readWatchLists();
} catch (e) {
  console.log('Listes de suivi illisibles (' + e.message + ') : on garde les ETF déjà suivis.');
  users = [{ uid: 'fichier', tickers: file.tickers || [], freq: 2, createdAt: '' }];
}
if (!users.some((u) => u.tickers.length)) users = [{ uid: 'fichier', tickers: file.tickers || [], freq: 2, createdAt: '' }];

// priorité : ordre d'ancienneté des comptes, puis ordre de la liste de chacun
const order = [];
const freq = {};
for (const u of users) for (const t of u.tickers) {
  if (!order.includes(t)) order.push(t);
  freq[t] = Math.max(freq[t] || 0, u.freq);
}

// ------------------------------------------------------------------ 2. budget du jour
if (!file.usage || file.usage.date !== today) file.usage = { date: today, calls: 0 };
let changed = false;
const skipped = new Set();
async function get(path) {
  if (file.usage.calls >= BUDGET) throw Object.assign(new Error('quota du jour atteint'), { quota: true });
  file.usage.calls++;
  changed = true;
  const r = await fetch(`https://eodhd.com/api/${path}${path.includes('?') ? '&' : '?'}api_token=${KEY}&fmt=json`);
  if (!r.ok) throw new Error(path.split('?')[0] + ' → HTTP ' + r.status);
  return r.json();
}
function put(q, date, close) {
  const h = q.history || (q.history = []);
  const i = h.findIndex((p) => p[0] === date);
  if (i >= 0) h[i] = [date, close]; else h.push([date, close]);
  h.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  q.date = h[h.length - 1][0];
  q.price = h[h.length - 1][1];
  changed = true;
}

// appels à garder pour les passages réguliers restants du jour (les ajouts ne doivent pas les priver de leurs cours)
const now = new Date();
const weekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
const n2 = order.filter((t) => freq[t] === 2).length;
const reserve = !weekday ? 0 : (now.getUTCHours() < 11 ? n2 : 0) + (now.getUTCHours() < 17 ? order.length : 0);

// ------------------------------------------------------------------ 3. travail
if (!KEY) {
  console.log('EODHD_API_KEY absent : cours non mis à jour.');
} else {
  for (const tk of order) {
    const q = file.quotes[tk] || (file.quotes[tk] = { price: 0, date: '', history: [] });
    const sym = encodeURIComponent(tk + '.PA');
    try {
      // a) historique complet à l'ajout (1 appel, renvoie toute la période)
      if (!q.full && (MODE !== 'sync' || file.usage.calls + reserve < BUDGET)) {
        const first = q.history?.length ? q.history[0][0] : today;
        const rows = await get(`eod/${sym}?from=${HISTORY_START}&to=${addDays(first, -1)}`);
        for (const r of rows) if (r && r.date && Number.isFinite(r.close)) put(q, r.date, r.close);
        q.full = true;
        changed = true;
        console.log(tk, 'historique récupéré :', q.history.length, 'séances');
      }
      if (MODE === 'sync' || (MODE === 'midday' && freq[tk] !== 2)) continue;
      // b) séances manquantes (robot arrêté, jours fériés…)
      const last = q.history?.length ? q.history[q.history.length - 1][0] : HISTORY_START;
      if (last < lastBusinessDay()) {
        const rows = await get(`eod/${sym}?from=${addDays(last, 1)}`);
        for (const r of rows) if (r && r.date && Number.isFinite(r.close)) put(q, r.date, r.close);
      }
      // c) cours du moment
      if (MODE === 'close' || freq[tk] === 2) {
        const rt = await get(`real-time/${sym}`);
        if (rt && Number.isFinite(rt.close) && rt.close > 0 && rt.timestamp) put(q, iso(new Date(rt.timestamp * 1000)), rt.close);
      }
      console.log(tk, q.price, q.date);
    } catch (e) {
      if (e.quota) skipped.add(tk);
      console.log(tk, 'non actualisé :', e.message);
    }
  }
}

// ------------------------------------------------------------------ 4. ménage et écriture
for (const tk of order) file.quotes[tk].watchedAt = today;
for (const [tk, q] of Object.entries(file.quotes)) {
  if (!order.includes(tk) && q.watchedAt && addDays(q.watchedAt, PRUNE_DAYS) < today) { delete file.quotes[tk]; changed = true; }
}
const before = JSON.stringify([file.tickers, file.freq, file.skipped]);
file.tickers = order;
file.freq = freq;
file.skipped = Array.from(skipped);
file.limits = { callsPerDay: BUDGET, maxAt2PerDay: Math.floor(BUDGET / 2), maxAt1PerDay: BUDGET };
file.historyStart = HISTORY_START;
if (JSON.stringify([file.tickers, file.freq, file.skipped]) !== before) changed = true;
if (changed) {
  file.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(file) + '\n');
}
output('changed', changed ? 'true' : 'false');
console.log(`mode ${MODE} · ${users.length} compte(s) · ${order.length} ETF suivis · appels EODHD aujourd'hui : ${file.usage.calls}/${BUDGET}` + (skipped.size ? ' · non actualisés (quota) : ' + [...skipped].join(', ') : '') + (changed ? ' — fichier mis à jour' : ' — aucun changement'));
