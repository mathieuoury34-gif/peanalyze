// Données initiales : export de « Suivi des investissements.xlsx » (seed-data.json)
import seedJson from './seed-data.json';
import catalogJson from './catalog.json';
import type { AppData, CatalogEtf, Etf } from '../domain/types';

export const DATA_VERSION = 1;

/** Catalogue des ETF éligibles au PEA : donnée de référence intégrée à l'app (jamais synchronisée). */
export const CATALOG_SOURCE: string = catalogJson.source;
export const CATALOG_DATE: string = catalogJson.updated;
export const COMPOSITION_DATE: string = (catalogJson as { compositionDate?: string }).compositionDate ?? '';
export function builtinCatalog(): CatalogEtf[] {
  return catalogJson.etfs as CatalogEtf[];
}
/** Fiches mensuelles plus récentes publiées par le robot (public/compositions.json), indexées par ISIN de l'ETF source. */
export interface CompositionsFile {
  updatedAt: string;
  items: Record<string, { date: string; title?: string; sectors: Etf['sectors']; countries: Etf['countries'] }>;
}

let compOverlay: CompositionsFile | null = null;
export function setCompositionsOverlay(f: CompositionsFile | null): void { compOverlay = f; }

function catalogEntry(e: Pick<Etf, 'isin' | 'ticker'>): CatalogEtf | undefined {
  return builtinCatalog().find((x) => x.isin === e.isin) || (e.ticker ? builtinCatalog().find((x) => x.ticker === e.ticker) : undefined);
}

/** Répartition proposée pour un ETF : celle du catalogue, ou celle d'une fiche plus récente du robot. */
export function catalogComposition(e: Pick<Etf, 'isin' | 'ticker'>, overlay: CompositionsFile | null = compOverlay): { sectors: Etf['sectors']; countries: Etf['countries']; comp: NonNullable<Etf['comp']> } | null {
  const c = catalogEntry(e);
  if (!c || !c.comp || (!c.sectors?.length && !c.countries?.length)) return null;
  const o = c.comp.kind !== 'justetf' && c.comp.from ? overlay?.items?.[c.comp.from] : undefined;
  if (o && o.date > c.comp.date && o.sectors?.length) {
    return { sectors: structuredClone(o.sectors), countries: structuredClone(o.countries ?? []), comp: { ...c.comp, date: o.date } };
  }
  return { sectors: structuredClone(c.sectors ?? []), countries: structuredClone(c.countries ?? []), comp: { ...c.comp } };
}

/** Met à jour les répartitions des ETF suivis quand le catalogue (ou une fiche plus récente du robot) est plus récent. */
export function refreshCompositions(d: AppData, overlay: CompositionsFile | null = compOverlay): AppData {
  for (const e of d.etfs) {
    const c = catalogComposition(e, overlay);
    if (!c) continue;
    if (e.comp && e.comp.kind === c.comp.kind && e.comp.from === c.comp.from && e.comp.date >= c.comp.date) continue;
    e.sectors = c.sectors; e.countries = c.countries; e.comp = c.comp;
  }
  return d;
}
/** Clé unique d'une ligne du catalogue (mnémonique Paris, sinon ISIN). */
export function catKey(c: CatalogEtf): string {
  return c.ticker || c.isin;
}

export function defaultSettings(): AppData['settings'] {
  return {
    apiKey: '',
    priceProvider: 'server',
    csvUrl: '',
    priceRefresh: 'open',
    priceFreq: 2,
    peaOpeningDate: '',
    lastPriceUpdate: '',
    cashBalance: null,
    feePerOrder: 1.92,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSeed(json: any = seedJson): AppData {
  const etfs: Etf[] = json.etfs.map((e: any) => ({
    id: e.id,
    index: e.index.replace('®', ''),
    name: e.name,
    isin: e.isin,
    ticker: e.ticker,
    exchange: e.exchange,
    googleSymbol: e.googleSymbol,
    category: e.category,
    peaEligible: e.peaEligible,
    lastPrice: e.lastPrice,
    ter: e.ter,
    aumMEur: e.aumMEur,
    replication: e.replication,
    distribution: e.distribution,
    inStrategy: e.inStrategy ?? (json.targetAllocation[e.id] || 0) > 0,
    sectors: e.sectors,
    countries: e.countries,
    priceHistory: e.priceHistory.map((p: [string, number]) => [p[0].slice(0, 10), p[1]]),
  }));
  // Noms courts utilisés dans les maquettes
  const SHORT: Record<string, string> = { PAEEM: 'MSCI EM', PUST: 'NASDAQ-100' };
  etfs.forEach((e) => { if (SHORT[e.id]) e.index = SHORT[e.id]; });

  const ids = new Set<string>();
  const uid = (base: string) => { let k = base, n = 2; while (ids.has(k)) k = base + '-' + n++; ids.add(k); return k; };

  return {
    version: DATA_VERSION,
    updatedAt: '', // plus ancien que tout : des données synchronisées ont toujours la priorité
    etfs,
    myEtfIds: etfs.map((e) => e.id),
    catalog: builtinCatalog(),
    deposits: json.deposits.map((d: any) => ({ id: uid('d-' + d.date), date: d.date, amount: d.amount })),
    transactions: json.transactions.map((t: any) => ({
      id: uid('b-' + t.date + '-' + t.etfId),
      date: t.date,
      etfId: t.etfId,
      unitPrice: t.unitPrice,
      quantity: t.quantity,
      grossAmount: t.grossAmount,
      fees: t.fees,
      feeRefund: t.feeRefund,
    })),
    targetAllocation: { ...json.targetAllocation },
    simulation: {
      initialCapital: json.simulator.initialCapital,
      horizonYears: json.simulator.horizonYears,
      annualRate: json.simulator.annualRate,
      dcaPhases: json.simulator.dcaPhases.map((p: any) => ({ fromYear: p.fromYear, monthly: p.monthly })),
    },
    settings: defaultSettings(),
  };
}

/** Données initiales de l'application : neutres (aucun ETF suivi, aucune stratégie) tant qu'aucun classeur n'est chargé. */
export function emptySeed(): AppData {
  const d = buildSeed();
  d.etfs = [];
  d.myEtfIds = [];
  d.targetAllocation = {};
  return d;
}
