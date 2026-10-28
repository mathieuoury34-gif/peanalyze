// Thème de l'interface : clair, sombre ou celui du système. Préférence propre à l'appareil,
// appliquée sans recharger (attribut data-theme sur <html>, couleurs dans styles/tokens.css).
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'peanalyze:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = typeof window === 'undefined' ? 'system' : read();
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function themePref(): ThemePref {
  return pref;
}

export function resolvedTheme(): 'light' | 'dark' {
  return pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref;
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  refreshThemeColor();
  listeners.forEach((l) => l());
}

/** Couleur de la barre d'état : sombre tant que l'écran de lancement (toujours sombre) est affiché, puis celle du thème. */
export function refreshThemeColor(): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const splashing = !!document.getElementById('splash') && !document.getElementById('splash')!.classList.contains('out');
  meta.setAttribute('content', splashing ? '#0F1519' : getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim() || (resolvedTheme() === 'dark' ? '#0F1519' : '#FFFFFF'));
}

export function setThemePref(p: ThemePref): void {
  pref = p;
  try { localStorage.setItem(KEY, p); } catch { /* stockage indisponible */ }
  apply();
}

/** Notifié quand le thème affiché change (choix de l'utilisateur ou réglage du système). */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

media?.addEventListener?.('change', () => { if (pref === 'system') apply(); });
apply();
