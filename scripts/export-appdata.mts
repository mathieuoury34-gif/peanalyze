// Usage : node --import tsx scripts/export-appdata.mts <sortie.json>  (lit private/seed-data.full.json et public/prices.json)
// Exporte les données de l'app (calculées par le code de l'app) pour construire le classeur Excel
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeed, builtinCatalog } from '../src/data/seed';
import { applyQuotes } from '../src/data/prices';
import { computePositions, computeSummary, exposure, monthlySeries, normalizeLabel, simulate, valuationDate } from '../src/domain/calc';
const data = buildSeed(JSON.parse(readFileSync('private/seed-data.full.json', 'utf8')));
const pf = JSON.parse(readFileSync('public/prices.json', 'utf8'));
applyQuotes(data, data.etfs.filter((e) => pf.quotes[e.ticker]).map((e) => ({ id: e.id, ...pf.quotes[e.ticker] })));
const positions = computePositions(data);
const summary = computeSummary(data, positions);
const out = {
  valuationDate: valuationDate(data),
  etfs: data.etfs.map((e) => ({ ...e, sectors: e.sectors.map((s) => ({ ...s, label: normalizeLabel(s.label) })), countries: e.countries.map((s) => ({ ...s, label: normalizeLabel(s.label) })) })),
  deposits: data.deposits, transactions: data.transactions, targetAllocation: data.targetAllocation, simulation: data.simulation,
  feePerOrder: data.settings.feePerOrder,
  catalog: builtinCatalog(),
  expected: { positions, summary, sectors: exposure(data, positions, 'sectors'), countries: exposure(data, positions, 'countries'), monthly: monthlySeries(data), sim: simulate(data.simulation) },
};
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('ok', out.valuationDate, summary.totalValue.toFixed(2), summary.annualizedReturnXirr);
