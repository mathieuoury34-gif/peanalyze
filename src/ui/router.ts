// Navigation par hash (#/portefeuille…) avec l'historique du navigateur :
// le bouton retour d'Android ferme les feuilles et revient à l'écran précédent.
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string; // ex. '/marches/etf/ESE'
  parts: string[]; // ['marches', 'etf', 'ESE']
  query: URLSearchParams;
  key: string;
}

export const HOME = '/portefeuille';

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || HOME;
  const [p, q = ''] = h.split('?');
  const path = p.startsWith('/') ? p : '/' + p;
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q), key: h };
}

let current = parse();
const listeners = new Set<() => void>();
const depth = () => ((history.state as { pea?: number } | null)?.pea ?? 0);
if (history.state?.pea === undefined) history.replaceState({ pea: 0 }, '');

function emit(scrollTop: boolean) {
  const prevPath = current.path;
  current = parse();
  listeners.forEach((l) => l());
  if (scrollTop && prevPath !== current.path) window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => emit(true));
window.addEventListener('hashchange', () => { if (parse().key !== current.key) emit(true); });

export function useRoute(): Route {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState({ pea: depth() }, '', '#' + to);
  else history.pushState({ pea: depth() + 1 }, '', '#' + to);
  emit(true);
}

/** Retour : historique interne s'il existe, sinon écran parent. */
export function back(fallback: string): void {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function openSheet(name: string): void {
  const r = parse();
  r.query.set('sheet', name);
  history.pushState({ pea: depth() + 1 }, '', '#' + r.path + '?' + r.query.toString());
  emit(false);
}

export function closeSheet(): void {
  const r = parse();
  if (!r.query.get('sheet')) return;
  if (depth() > 0) { history.back(); return; }
  r.query.delete('sheet');
  const q = r.query.toString();
  history.replaceState({ pea: 0 }, '', '#' + r.path + (q ? '?' + q : ''));
  emit(false);
}

export type Tab = 'marches' | 'historique' | 'portefeuille' | 'simulateur' | 'none';
export function tabOf(path: string): Tab {
  const p = path.split('/')[1];
  if (p === 'marches' || p === 'historique' || p === 'portefeuille' || p === 'simulateur') return p;
  return 'none';
}
