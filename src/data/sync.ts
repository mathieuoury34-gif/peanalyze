// Synchronisation cloud gratuite : Firebase (offre Spark, sans carte bancaire), connexion Google.
// Le SDK est chargé à la demande depuis gstatic ; tant que FIREBASE_CONFIG est vide, l'app reste 100 % locale.
import { useSyncExternalStore } from 'react';
import { FIREBASE_CONFIG } from './firebase-config';
import { getData, getPrefs, onDataChange, replaceData, setPrefs } from './store';
import type { AppData } from '../domain/types';

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
let status: SyncStatus = { configured: !!FIREBASE_CONFIG.apiKey, ready: !FIREBASE_CONFIG.apiKey, user: null, state: 'off', lastSync: '', error: '' };
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
    set({ ready: true, state: 'error', error: 'Service de synchronisation injoignable' });
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
    await fs.setDoc(docRef(uid), { data: JSON.stringify(d), updatedAt: d.updatedAt, device: navigator.userAgent.slice(0, 120) });
    lastSynced = d.updatedAt;
    set({ state: 'ok', lastSync: new Date().toISOString(), error: '' });
  } catch (e) {
    set({ state: 'error', error: 'Envoi impossible : ' + ((e as Error).message || 'erreur') });
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
        replaceData(remote, 'remote');
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
    if (u) {
      set({ ready: true, user: { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' }, state: 'syncing' });
      setPrefs({ skipLogin: false });
      watch(u.uid);
    } else {
      unsubDoc?.(); unsubDoc = null;
      set({ ready: true, user: null, state: 'off' });
    }
  });
  onDataChange((d, origin) => {
    if (origin !== 'local' || !auth?.currentUser) return;
    if (d.updatedAt <= lastSynced) return; // simple mise à jour des cours : chaque appareil les récupère lui-même
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(auth.currentUser.uid), 1200);
  });
}

export async function signIn(): Promise<void> {
  if (!(await init())) throw new Error('Synchronisation non configurée');
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fa.signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) await fa.signInWithRedirect(auth, provider);
    else if (!code.includes('popup-closed')) throw e;
  }
}

export async function signOut(): Promise<void> {
  if (auth) await fa.signOut(auth);
}

export async function syncNow(): Promise<void> {
  if (auth?.currentUser) await push(auth.currentUser.uid);
}

export function needsLogin(): boolean {
  return status.configured && status.ready && !status.user && !getPrefs().skipLogin;
}
