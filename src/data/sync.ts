// Synchronisation cloud gratuite : Firebase (offre Spark, sans carte bancaire), connexion Google.
// Le SDK est chargé à la demande depuis gstatic ; tant que FIREBASE_CONFIG est vide, l'app reste 100 % locale.
import { useSyncExternalStore } from 'react';
import { FIREBASE_CONFIG } from './firebase-config';
import { getData, getPrefs, onDataChange, replaceData, setPrefs } from './store';
import type { AppData } from '../domain/types';
import { t } from '../i18n';
import { refreshPrices } from './prices';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const load = (m: string): Promise<Any> => import(/* @vite-ignore */ SDK + m);

export interface SyncStatus {
  configured: boolean;
  ready: boolean; // l'état de connexion est connu
  user: { name: string; email: string; photo: string } | null;
  state: 'off' | 'syncing' | 'ok' | 'error';
  lastSync: string;
  error: string;
}
// Appareil déjà connecté (ou utilisé sans compte) : on affiche tout de suite les données locales sans attendre Firebase
let authChecked = false;
const known = (() => { try { const p = getPrefs(); return !!(p.syncedUid || p.skipLogin); } catch { return false; } })();
let status: SyncStatus = { configured: !!FIREBASE_CONFIG.apiKey, ready: !FIREBASE_CONFIG.apiKey || known, user: null, state: 'off', lastSync: '', error: '' };
const listeners = new Set<() => void>();
const set = (s: Partial<SyncStatus>) => { status = { ...status, ...s }; listeners.forEach((l) => l()); };
export function useSync(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}

let auth: Any, db: Any, fa: Any, fs: Any;
let unsubDoc: (() => void) | null = null;
let lastSynced = '';
let pushTimer: ReturnType<typeof setTimeout> | undefined;

async function init(): Promise<boolean> {
  if (auth) return true;
  if (!status.configured) return false;
  try {
    const [app, a, f] = await Promise.all([load('firebase-app.js'), load('firebase-auth.js'), load('firebase-firestore.js')]);
    fa = a; fs = f;
    const fbApp = app.initializeApp(FIREBASE_CONFIG);
    auth = a.getAuth(fbApp);
    auth.languageCode = 'fr';
    db = f.initializeFirestore(fbApp, { localCache: f.persistentLocalCache() });
    return true;
  } catch (e) {
    authChecked = true;
    set({ ready: true, state: 'error', error: t('Service de synchronisation injoignable') });
    console.warn('[sync] init', e);
    return false;
  }
}

function docRef(uid: string) {
  return fs.doc(db, 'users', uid, 'state', 'main');
}

async function push(uid: string) {
  const d = getData();
  set({ state: 'syncing' });
  try {
    // catalogue et historiques de cours : données publiques rechargées par chaque appareil, inutile de les stocker
    const slim = { ...d, catalog: [], etfs: d.etfs.map((e) => ({ ...e, priceHistory: [] })) };
    await fs.setDoc(docRef(uid), { data: JSON.stringify(slim), updatedAt: d.updatedAt, device: navigator.userAgent.slice(0, 120) });
    lastSynced = d.updatedAt;
    set({ state: 'ok', lastSync: new Date().toISOString(), error: '' });
  } catch (e) {
    set({ state: 'error', error: t('Envoi impossible : {e}', { e: (e as Error).message || t('erreur') }) });
  }
}

function watch(uid: string) {
  unsubDoc?.();
  unsubDoc = fs.onSnapshot(docRef(uid), (snap: Any) => {
    const firstTime = getPrefs().syncedUid !== uid;
    setPrefs({ syncedUid: uid });
    if (!snap.exists()) { push(uid); return; }
    const v = snap.data() as { data: string; updatedAt: string };
    const local = getData();
    // Premier passage sur cet appareil avec un portefeuille vide : les données du cloud priment toujours
    const localEmpty = !local.deposits.length && !local.transactions.length;
    if (v.updatedAt > local.updatedAt || (firstTime && localEmpty)) {
      try {
        const remote = JSON.parse(v.data) as AppData;
        lastSynced = remote.updatedAt;
        let missing = false;
        for (const e of remote.etfs) {
          if (e.priceHistory?.length) continue;
          const mine = local.etfs.find((x) => x.id === e.id);
          if (mine?.priceHistory.length) e.priceHistory = mine.priceHistory;
          else missing = true;
        }
        replaceData(remote, 'remote');
        if (missing) refreshPrices({ silent: true });
      } catch { /* document illisible */ }
    } else if (local.updatedAt > v.updatedAt) {
      push(uid);
    } else lastSynced = v.updatedAt;
    set({ state: 'ok', lastSync: new Date().toISOString(), error: '' });
  }, (e: Error) => set({ state: 'error', error: e.message }));
}

export async function startSync(): Promise<void> {
  if (!(await init())) return;
  fa.getRedirectResult(auth).catch(() => undefined);
  fa.onAuthStateChanged(auth, (u: Any) => {
    authChecked = true;
    if (u) {
      set({ ready: true, user: { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' }, state: 'syncing' });
      setPrefs({ skipLogin: false });
      watch(u.uid);
      scheduleWatchList();
    } else {
      unsubDoc?.(); unsubDoc = null;
      set({ ready: true, user: null, state: 'off' });
    }
  });
  onDataChange((d, origin) => {
    scheduleWatchList();
    if (origin !== 'local' || !auth?.currentUser) return;
    if (d.updatedAt <= lastSynced) return; // simple mise à jour des cours : chaque appareil les récupère lui-même
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(auth.currentUser.uid), 1200);
  });
}

// ------------------------------------------------------------------ liste de suivi du robot des cours
// watch/{uid} = { tickers, freq, createdAt } : lisible par le robot (GitHub Actions), modifiable par son seul propriétaire.
let watchKey = '';
let watchTimer: ReturnType<typeof setTimeout> | undefined;
let watchCreated = false;
export function watchedTickers(d: AppData = getData()): string[] {
  const ids = [...d.myEtfIds];
  for (const tx of d.transactions) if (!ids.includes(tx.etfId)) ids.push(tx.etfId);
  return ids.filter((id) => d.etfs.some((e) => e.id === id && e.ticker)).slice(0, 20);
}
function scheduleWatchList() {
  clearTimeout(watchTimer);
  watchTimer = setTimeout(pushWatchList, 1500);
}
async function pushWatchList() {
  const u = auth?.currentUser;
  if (!u) return;
  const d = getData();
  const body = { tickers: watchedTickers(d), freq: d.settings.priceFreq === 1 ? 1 : 2 };
  const key = u.uid + JSON.stringify(body);
  if (key === watchKey) return;
  try {
    const ref = fs.doc(db, 'watch', u.uid);
    if (!watchCreated) {
      const snap = await fs.getDoc(ref);
      watchCreated = snap.exists();
      if (!watchCreated) Object.assign(body, { createdAt: new Date().toISOString() });
    }
    await fs.setDoc(ref, { ...body, updatedAt: new Date().toISOString() }, { merge: true });
    watchCreated = true;
    watchKey = key;
  } catch (e) {
    console.warn('[sync] liste de suivi', e);
  }
}

/**
 * Résout quand l'utilisateur revient dans l'app sans être connecté (fenêtre Google fermée, retour arrière,
 * échec de la connexion). Sur téléphone, et surtout dans l'app installée, la fenêtre de connexion s'ouvre dans
 * un autre onglet et sa fermeture n'est pas toujours détectée : sans ce garde-fou, la promesse ne se termine
 * jamais et le bouton « Continuer avec Google » reste bloqué jusqu'au redémarrage de l'app.
 */
function returnedWithoutLogin(): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armed = false;
  let cleanup: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    const check = () => {
      if (!armed || document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      // laisse le temps à Firebase de terminer une connexion réussie
      timer = setTimeout(() => { if (!auth?.currentUser) { cleanup(); resolve(); } }, 3000);
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const arm = setTimeout(() => { armed = true; }, 800); // l'ouverture de la fenêtre Google fait perdre le focus
    cleanup = () => { clearTimeout(arm); clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  });
  return { promise, cancel: () => cleanup() };
}

let signingIn = false;
export async function signIn(): Promise<void> {
  if (!(await init())) throw new Error(t('Synchronisation non configurée'));
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  signingIn = true;
  const back = returnedWithoutLogin();
  try {
    // la première des deux : connexion terminée (ou erreur), ou retour dans l'app sans connexion
    const popup: Promise<unknown> = fa.signInWithPopup(auth, provider);
    popup.catch(() => undefined); // évite une erreur non gérée si la fenêtre se ferme après l'abandon
    await Promise.race([popup, back.promise]);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) await fa.signInWithRedirect(auth, provider);
    else if (!/popup-closed|cancelled-popup-request|user-cancelled/.test(code)) throw e;
  } finally {
    back.cancel();
    signingIn = false;
  }
}

/** Une connexion Google est-elle en cours ? */
export function isSigningIn(): boolean {
  return signingIn;
}

export async function signOut(): Promise<void> {
  if (auth) await fa.signOut(auth);
}

export async function syncNow(): Promise<void> {
  if (auth?.currentUser) await push(auth.currentUser.uid);
}

export function needsLogin(): boolean {
  return status.configured && status.ready && authChecked && !status.user && !getPrefs().skipLogin;
}
