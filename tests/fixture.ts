// Portefeuille fictif commun aux tests (aucune donnée personnelle)
import { emptySeed } from '../src/data/seed';
import type { AppData, Etf } from '../src/domain/types';

export const sec = (l: string, w: number) => ({ label: l, weight: w });
export function etf(id: string, price: number, ter: number, sectors: [string, number][], countries: [string, number][], inStrategy = false): Etf {
  return { id, index: id, name: id + ' ETF', isin: 'XX' + id, ticker: id, exchange: 'PAR', category: 'Monde', peaEligible: true, lastPrice: price, ter, aumMEur: 1000,
    replication: 'Physique', distribution: 'Capitalisant', inStrategy, sectors: sectors.map(([l, w]) => sec(l, w)), countries: countries.map(([l, w]) => sec(l, w)),
    comp: { kind: 'fiche', date: '2026-09-30' }, priceHistory: [] };
}
export function fixture(): AppData {
  const d = emptySeed();
  d.etfs = [
    etf('AAA', 100, 0.0020, [['Finance', 0.6], ['Santé', 0.4]], [['France', 1]], true),
    etf('BBB', 50, 0.0050, [['Finance', 0.5], ['Santé', 0.5]], [['États-Unis', 1]], true),
    etf('OLD', 20, 0.0100, [['Santé', 1]], [['Japon', 1]], false),
    etf('WRLD', 10, 0.0012, [['Finance', 0.3], ['Santé', 0.7]], [['États-Unis', 0.7], ['France', 0.3]], false),
  ];
  d.myEtfIds = d.etfs.map((e) => e.id);
  d.deposits = [{ id: 'd1', date: '2026-01-05', amount: 3000 }];
  const buy = (id: string, etfId: string, price: number, q: number) => ({ id, date: '2026-01-10', etfId, unitPrice: price, quantity: q, grossAmount: price * q + 1.92, fees: 1.92, feeRefund: 0 });
  d.transactions = [buy('t1', 'AAA', 100, 10), buy('t2', 'BBB', 50, 10), buy('t3', 'OLD', 20, 25)]; // 1000 + 500 + 500
  d.targetAllocation = { AAA: 0.6, BBB: 0.4 };
  d.settings.feePerOrder = 2;
  return d;
}

