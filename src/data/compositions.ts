// Répartitions sectorielle et géographique « connectées » : public/compositions.json est mis à jour une fois par mois
// par GitHub Actions (fiches mensuelles des émetteurs). Aucun appel à l'API des cours (EODHD) : zéro quota consommé.
import { update } from './store';
import { refreshCompositions, setCompositionsOverlay, type CompositionsFile } from './seed';

/** Charge le fichier publié avec l'app ; s'il est absent ou invalide, le catalogue intégré reste la référence. */
export async function loadCompositions(): Promise<void> {
  try {
    const r = await fetch(new URL('compositions.json', document.baseURI).href + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const f = (await r.json()) as CompositionsFile;
    if (!f || typeof f.items !== 'object') return;
    setCompositionsOverlay(f);
    update((d) => refreshCompositions(d, f), { touch: false });
  } catch { /* hors ligne : on garde les répartitions déjà enregistrées */ }
}
