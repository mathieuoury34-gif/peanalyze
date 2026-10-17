// Rappel mensuel « investir » : notification locale, sans serveur.
// Limite assumée : sans serveur de notifications, rien ne peut réveiller l'app si elle n'a jamais été ouverte ; le rappel s'affiche
// à l'ouverture de l'app (bandeau + notification) et, sur les navigateurs qui le permettent (Chrome/Edge, app installée), en tâche de fond.
import type { AppData } from '../domain/types';
import { reminderState } from '../domain/reminder';
import { todayIso } from '../domain/format';
import { onDataChange, getData } from './store';
import { t } from '../i18n';

const CACHE = 'pea-config';
const KEY = './reminder.json';
const DISMISS = 'peanalyze:reminder-dismissed';

interface Mirror { day: number; boughtMonth: string; notifiedMonth: string; title: string; body: string; url: string }

const safe = {
  get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};

export const notificationsSupported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
export const notificationPermission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

export const dismissedMonth = () => safe.get(DISMISS);
export function dismissReminder(): void { safe.set(DISMISS, todayIso().slice(0, 7)); window.dispatchEvent(new Event('peanalyze-reminder')); }
export const reminderDismissed = () => dismissedMonth() === todayIso().slice(0, 7);

async function readMirror(): Promise<Mirror | null> {
  try { const r = await (await caches.open(CACHE)).match(KEY); return r ? ((await r.json()) as Mirror) : null; } catch { return null; }
}
async function writeMirror(m: Mirror): Promise<void> {
  try { await (await caches.open(CACHE)).put(KEY, new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } })); } catch { /* cache indisponible */ }
}

/** Copie la config du rappel dans le cache du navigateur pour que le service worker puisse notifier en tâche de fond. */
export async function mirrorReminder(data: AppData): Promise<void> {
  if (typeof caches === 'undefined') return;
  const prev = await readMirror();
  const today = todayIso();
  const ym = today.slice(0, 7);
  const s = reminderState(data, today);
  const day = s ? s.day : 0;
  const boughtMonth = data.transactions.some((x) => x.quantity > 0 && x.date.startsWith(ym)) ? ym : '';
  await writeMirror({ day, boughtMonth, notifiedMonth: prev?.notifiedMonth || safe.get('peanalyze:reminder-notified'), title: t('C’est le moment d’investir'), body: t('Votre investissement du mois n’est pas encore enregistré.'), url: './#/portefeuille/assistant' });
}

async function show(m: Mirror): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts: NotificationOptions = { body: m.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'pea-reminder', data: { url: m.url } };
    if (reg) { await reg.showNotification(m.title, opts); return true; }
    new Notification(m.title, opts);
    return true;
  } catch { return false; }
}

/** À l'ouverture de l'app : notifie une fois par mois si le rappel est dû et que la permission est accordée. */
export async function checkReminder(data: AppData = getData()): Promise<void> {
  await mirrorReminder(data);
  if (notificationPermission() !== 'granted') return;
  const s = reminderState(data, todayIso());
  if (!s || !s.due) return;
  const ym = todayIso().slice(0, 7);
  const m = await readMirror();
  if (!m || m.notifiedMonth === ym || safe.get('peanalyze:reminder-notified') === ym) return;
  if (await show(m)) {
    safe.set('peanalyze:reminder-notified', ym);
    await writeMirror({ ...m, notifiedMonth: ym });
  }
}

/** Active les notifications (demande la permission) et la vérification périodique quand le navigateur la propose. */
export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  const p = await Notification.requestPermission();
  if (p === 'granted') await registerPeriodic();
  return p;
}

export async function registerPeriodic(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const ps = (reg as unknown as { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } }).periodicSync;
    if (!ps) return false;
    await ps.register('pea-reminder', { minInterval: 12 * 3600 * 1000 });
    return true;
  } catch { return false; }
}

let started = false;
export function startReminder(): void {
  if (started) return;
  started = true;
  setTimeout(() => void checkReminder(), 3000);
  onDataChange((d) => void mirrorReminder(d));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkReminder(); });
}
