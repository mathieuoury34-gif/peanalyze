// Données initiales : export de « Suivi des investissements.xlsx » (seed-data.json)
import seedJson from './seed-data.json';
import type { AppData, CatalogEtf, Etf } from '../domain/types';

export const DATA_VERSION = 1;

export function defaultSettings(): AppData['settings'] {
  return {
    apiKey: '',
    priceProvider: 'server',
    csvUrl: '',
    priceRefresh: 'open',
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

  // Noms d'indices courts du catalogue (maquette T1-03)
  const CAT_INDEX: Record<string, string> = {
    ESE: 'S&P 500', SPEA: 'S&P 500', PSP5: 'S&P 500', CACC: 'CAC 40', MSE: 'EURO STOXX 50', C50: 'EURO STOXX 50',
    ETZ: 'STOXX Europe 600', BNK: 'STOXX Europe 600 Banks', TNO: 'STOXX Europe 600 Technology',
    HLT: 'STOXX Europe 600 Health Care', IND: 'STOXX Europe 600 Industrials', CW8: 'MSCI World', DCAM: 'MSCI World',
    WPEA: 'MSCI World', LWLD: 'MSCI World Leveraged (2x)', PUST: 'Nasdaq-100', LQQ: 'Nasdaq-100 Leveraged (2x)',
    RS2U: 'Russell 2000', RS2K: 'Russell 2000', PLEM: 'MSCI EM EMEA ESG Leaders', PAEEM: 'MSCI EM ESG Leaders',
  };
  const catalog: CatalogEtf[] = json.catalog.map((c: any) => ({
    ...c,
    name: c.name.trim(),
    index: CAT_INDEX[c.ticker] || c.index.replace(/®/g, '').replace(/ Index$/, ''),
  }));
  const ids = new Set<string>();
  const uid = (base: string) => { let k = base, n = 2; while (ids.has(k)) k = base + '-' + n++; ids.add(k); return k; };

  return {
    version: DATA_VERSION,
    updatedAt: '', // plus ancien que tout : des données synchronisées ont toujours la priorité
    etfs,
    myEtfIds: etfs.map((e) => e.id),
    catalog,
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
