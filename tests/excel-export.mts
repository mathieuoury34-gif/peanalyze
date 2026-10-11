// Génère le classeur officiel à partir des données personnelles (private/) : node --import tsx tests/excel-export.mts <sortie.xlsx>
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeed, CATALOG_DATE } from '../src/data/seed';
import { applyQuotes } from '../src/data/prices';
import { buildPeanalyzeWorkbook } from '../src/data/excel-peanalyze';
const data = buildSeed(JSON.parse(readFileSync('private/seed-data.full.json', 'utf8')));
const pf = JSON.parse(readFileSync('public/prices.json', 'utf8'));
applyQuotes(data, data.etfs.filter((e) => pf.quotes[e.ticker]).map((e) => ({ id: e.id, ...pf.quotes[e.ticker] })));
const buf = await buildPeanalyzeWorkbook(data, CATALOG_DATE).zip().generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(process.argv[2], buf);
console.log('ok', buf.length);
