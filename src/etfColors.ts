// Couleur de chaque ETF dans les graphiques : choisie par l'utilisateur (settings.etfColors),
// sinon attribuée selon l'ordre d'apparition dans « Mes ETF ».
import { useEffect } from 'react';
import type { AppData } from './domain/types';
import { useData } from './data/store';

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

/** Couleur hexadécimale (sans #) de chaque ETF suivi. */
export function etfHexes(data: AppData): Record<string, string> {
  const custom = data.settings.etfColors || {};
  const out: Record<string, string> = {};
  trackedIds(data).forEach((id, i) => { out[id] = isHex(custom[id]) ? custom[id].toUpperCase() : defaultHex(i); });
  return out;
}

/** Applique les couleurs aux variables CSS --etf-{id} (les défauts suivent le thème clair/sombre). */
export function applyEtfColors(data: AppData): void {
  const root = document.documentElement;
  const custom = data.settings.etfColors || {};
  trackedIds(data).forEach((id, i) => {
    root.style.setProperty(`--etf-${id}`, isHex(custom[id]) ? '#' + custom[id] : i < 8 ? `var(--chart-${i + 1})` : '#' + defaultHex(i));
  });
}

export function useEtfColors(): void {
  const data = useData();
  useEffect(() => { applyEtfColors(data); }, [data]);
}
