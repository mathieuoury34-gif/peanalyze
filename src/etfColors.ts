// Couleur de chaque ETF dans les graphiques : choisie par l'utilisateur (settings.etfColors),
// sinon attribuée selon l'ordre d'apparition dans « Mes ETF ».
import { useEffect } from 'react';
import type { AppData } from './domain/types';
import { update, useData } from './data/store';

/** Couleurs par défaut (ordre de « Mes ETF »), identiques aux jetons --chart-1…8 du thème clair. */
export const DEFAULT_HEX = ['007461', '0A94A8', 'F8D10A', '004652', 'A0D7A2', '5159EA', '1BCB99', 'BAE3EC', 'C85207', '8E6C8A', 'E5484D', 'F59E0B'];

/** Grande palette proposée dans le sélecteur (6 teintes × 7 nuances + neutres). */
export const PALETTE: string[] = [
  '004652', '007461', '1BCB99', 'A0D7A2', '2E7D32', '66BB6A', '9CCC65',
  '0A94A8', '006D8F', '4FC3F7', 'BAE3EC', '1565C0', '5159EA', '8389F2',
  '311B92', '7E57C2', '8E6C8A', 'BA68C8', 'AD1457', 'F06292', 'F8BBD0',
  'AE0014', 'E5484D', 'FF8A65', 'C85207', 'F59E0B', 'F8D10A', 'FFF176',
  '5D4037', '8D6E63', 'BCAAA4', '19212D', '465266', '666E8A', 'AEB2C0',
];

export const isHex = (s: unknown): s is string => typeof s === 'string' && /^[0-9A-Fa-f]{6}$/.test(s);

/** Ids des ETF suivis, dans l'ordre : Mes ETF puis ETF détenus hors liste. */
export function trackedIds(data: AppData): string[] {
  const ids = data.myEtfIds.filter((id) => data.etfs.some((e) => e.id === id));
  for (const t of data.transactions) if (!ids.includes(t.etfId) && data.etfs.some((e) => e.id === t.etfId)) ids.push(t.etfId);
  return ids;
}

export function defaultHex(index: number): string {
  return DEFAULT_HEX[index % DEFAULT_HEX.length];
}

/** Couleur de chaque ETF suivi : celle enregistrée, sinon la première couleur par défaut libre (dans l'ordre de Mes ETF).
 *  Une fois attribuée, la couleur suit l'ETF quand on le déplace dans la liste. */
export function assignColors(ids: string[], custom: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const id of ids) if (isHex(custom[id])) { out[id] = custom[id].toUpperCase(); used.add(out[id]); }
  let k = 0;
  for (const id of ids) {
    if (out[id]) continue;
    while (k < DEFAULT_HEX.length && used.has(DEFAULT_HEX[k])) k++;
    out[id] = k < DEFAULT_HEX.length ? DEFAULT_HEX[k] : defaultHex(ids.indexOf(id));
    used.add(out[id]);
  }
  return out;
}

/** Couleur hexadécimale (sans #) de chaque ETF suivi. */
export function etfHexes(data: AppData): Record<string, string> {
  return assignColors(trackedIds(data), data.settings.etfColors);
}

/** Ordre d'affichage des ETF : Mes ETF, puis les autres. */
export function etfOrder(data: AppData): string[] {
  const t = trackedIds(data);
  return [...t, ...data.etfs.map((e) => e.id).filter((id) => !t.includes(id))];
}

/** Applique les couleurs aux variables CSS --etf-{id}. */
export function applyEtfColors(data: AppData): void {
  const root = document.documentElement;
  for (const [id, hex] of Object.entries(etfHexes(data))) root.style.setProperty(`--etf-${id}`, '#' + hex);
}

export function useEtfColors(): void {
  const data = useData();
  useEffect(() => {
    applyEtfColors(data);
    // fige les couleurs attribuées par défaut pour qu'elles ne changent plus quand on réordonne la liste
    const ids = trackedIds(data);
    const cur = data.settings.etfColors || {};
    if (ids.some((id) => !isHex(cur[id]))) {
      const full = assignColors(ids, cur);
      update((d) => { d.settings.etfColors = { ...(d.settings.etfColors || {}), ...full }; }, { touch: false });
    }
  }, [data]);
}
