// Veille des tarifs : public/brokers-watch.json est mis à jour chaque mois par le robot (scripts/watch-brokers.py).
// Il dit seulement « la page tarifaire du courtier a changé de chiffres » ; il ne modifie jamais les grilles.
import { useEffect, useState } from 'react';
import type { WatchItem } from '../domain/brokers';

export interface WatchFile { updatedAt: string; items: Record<string, WatchItem> }

let cache: Promise<WatchFile | null> | null = null;

export function loadBrokerWatch(): Promise<WatchFile | null> {
  cache ||= (async () => {
    try {
      const r = await fetch(new URL('brokers-watch.json', document.baseURI).href + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const f = (await r.json()) as WatchFile;
      return f && typeof f.items === 'object' ? f : null;
    } catch { return null; } // hors ligne : pas d'alerte du robot, l'alerte d'ancienneté reste
  })();
  return cache;
}

export function useBrokerWatch(): WatchFile | null {
  const [w, setW] = useState<WatchFile | null>(null);
  useEffect(() => { let on = true; void loadBrokerWatch().then((f) => { if (on) setW(f); }); return () => { on = false; }; }, []);
  return w;
}
