// Fabrique public/template.xlsx (modèle de l'export Excel) à partir du fichier personnel private/template.full.xlsx :
// même mise en forme, formules et graphiques, mais sans aucun montant personnel.
// Usage : node --import tsx scripts/sanitize-template.mts
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { buildSeed } from '../src/data/seed';
import { buildWorkbook } from '../src/data/excel';

const full = JSON.parse(readFileSync('private/seed-data.full.json', 'utf8'));
const data = buildSeed(full);
// Même nombre de lignes que l'original (la structure du modèle est conservée), valeurs neutres
data.deposits = data.deposits.map((d, i) => ({ ...d, date: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`, amount: 0 }));
data.transactions = data.transactions.map((t, i) => ({ ...t, date: `2025-${String((i % 12) + 1).padStart(2, '0')}-02`, unitPrice: 0, quantity: 0, grossAmount: 0, fees: 0, feeRefund: 0 }));
data.settings.cashBalance = null;
data.simulation = { initialCapital: 0, horizonYears: 10, annualRate: 0.07, dcaPhases: [{ fromYear: 1, monthly: 0 }] };

const zip = await buildWorkbook(readFileSync('private/template.full.xlsx'), data);

// Valeurs mises en cache : retirées (Excel recalcule tout à l'ouverture, fullCalcOnLoad)
for (const path of Object.keys(zip.files)) {
  if (/^xl\/worksheets\/sheet[3-6]\.xml$/.test(path)) { // feuilles personnelles (1 et 2 = données ETF publiques)
    let x = await zip.file(path)!.async('string');
    x = x.replace(/<c [^>]*[^/]>[\s\S]*?<\/c>/g, (cell) => (cell.includes('<f') ? cell.replace(/<v>[^<]*<\/v>/, '') : cell));
    zip.file(path, x);
  } else if (/^xl\/charts\/chart\d+\.xml$/.test(path)) {
    let x = await zip.file(path)!.async('string');
    x = x.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/g, '').replace(/<c:strCache>[\s\S]*?<\/c:strCache>/g, '');
    zip.file(path, x);
  }
}
const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync('public/template.xlsx', out);
console.log('public/template.xlsx', out.length, 'octets');
