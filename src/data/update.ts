// Mise à jour de l'application (service worker) : vérification régulière et mise à jour forcée.
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

/** Demande au navigateur de chercher une nouvelle version (la page se recharge toute seule si elle existe). */
export async function checkForUpdate(): Promise<void> {
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* hors ligne */ }
}

/** Efface les copies en cache de l'application (jamais vos données) puis recharge : récupère toujours la dernière version. */
export async function forceUpdate(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('pea-shell-')).map((k) => caches.delete(k)));
  } catch { /* on recharge quand même */ }
  try { await fetch('./', { cache: 'reload' }); } catch { /* hors ligne */ } // rafraîchit aussi le cache HTTP du navigateur
  location.reload();
}

/** Vérifie au retour sur l'application et toutes les 30 minutes (une application restée ouverte ne se mettait pas à jour). */
export function startUpdateChecks() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  setInterval(() => void checkForUpdate(), 30 * 60 * 1000);
}
