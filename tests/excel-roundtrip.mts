// Vérification manuelle de l'export / import Excel (nécessite les données personnelles dans private/).
// Usage : node --import tsx tests/excel-roundtrip.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeed } from '../src/data/seed';
import { buildWorkbook, parseWorkbook } from '../src/data/excel';

const full = () => buildSeed(JSON.parse(readFileSync('private/seed-data.full.json', 'utf8')));
const tpl = readFileSync('public/template.xlsx');
const data = full();
// ajoute 6 virements et 2 achats pour tester le décalage du tableau
for (let i = 0; i < 6; i++) data.deposits.push({ id: 'x' + i, date: `2026-1${i % 2}-0${i + 1}`, amount: 100 + i });
data.transactions.push({ id: 'y1', date: '2026-10-08', etfId: 'ESE', unitPrice: 35, quantity: 2, grossAmount: 71.92, fees: 1.92, feeRefund: 0 });
data.transactions.push({ id: 'y2', date: '2026-10-08', etfId: 'PUST', unitPrice: 110, quantity: 1, grossAmount: 111.92, fees: 1.92, feeRefund: 0.5 });
const zip = await buildWorkbook(tpl, data);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync('private/export-test.xlsx', buf);
const back = await parseWorkbook(buf, buildSeed());
console.log('aller-retour : virements', back.deposits.length, '/', data.deposits.length, '— achats', back.transactions.length, '/', data.transactions.length);
const orig = await parseWorkbook(readFileSync('private/template.full.xlsx'), buildSeed());
const s = full();
console.log('import du fichier d\'origine conforme :',
  JSON.stringify(orig.transactions.map((t) => [t.date, t.etfId, t.quantity, t.grossAmount])) === JSON.stringify(s.transactions.map((t) => [t.date, t.etfId, t.quantity, t.grossAmount])));
