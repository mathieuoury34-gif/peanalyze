// État de l'application : données persistées localement (+ synchronisation cloud optionnelle)
import { useSyncExternalStore } from 'react';
import type { AppData } from '../domain/types';
import { buildSeed, builtinCatalog, DATA_VERSION, defaultSettings } from './seed';

const KEY = 'peanalyze:data';
type Listener = () => void;

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as AppData;
      if (d && d.version === DATA_VERSION && Array.isArray(d.etfs)) {
        d.settings = { ...defaultSettings(), ...d.settings };
        if ((d.settings.priceProvider as string) !== 'csv') d.settings.priceProvider = 'server';
        d.settings.cashBalance = null; // solde espèces : toujours calculé
        d.catalog = builtinCatalog(); // catalogue : toujours la version intégrée à l'app
        return d;
      }
    }
  } catch { /* stockage indisponible : on repart des données d'origine */ }
  return buildSeed();
}

let data: AppData = load();
const listeners = new Set<Listener>();
const changeHooks = new Set<(d: AppData, origin: 'local' | 'remote') => void>();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota ou mode privé */ }
}

export function getData(): AppData {
  return data;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Notifié à chaque modification (utilisé par la synchronisation cloud). */
export function onDataChange(fn: (d: AppData, origin: 'local' | 'remote') => void): () => void {
  changeHooks.add(fn);
  return () => changeHooks.delete(fn);
}

export function update(fn: (d: AppData) => AppData | void, opts: { touch?: boolean } = {}): void {
  const draft: AppData = structuredClone(data);
  const res = fn(draft);
  data = res || draft;
  if (opts.touch !== false) data.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach((l) => l());
  changeHooks.forEach((h) => h(data, 'local'));
}

/** Remplace les données (import, synchronisation). */
export function replaceData(next: AppData, origin: 'local' | 'remote' = 'local'): void {
  data = { ...next, catalog: builtinCatalog(), settings: { ...defaultSettings(), ...next.settings, cashBalance: null } };
  persist();
  listeners.forEach((l) => l());
  changeHooks.forEach((h) => h(data, origin));
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}

export function newId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// ------------------------------------------------------------ préférences locales (non synchronisées)
const PREF_KEY = 'peanalyze:prefs';
export interface Prefs { skipLogin: boolean; firebaseConfig: string; syncedUid?: string }
export function getPrefs(): Prefs {
  try {
    return { skipLogin: false, firebaseConfig: '', ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { skipLogin: false, firebaseConfig: '' };
  }
}
export function setPrefs(p: Partial<Prefs>): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...getPrefs(), ...p })); } catch { /* ignore */ }
}
