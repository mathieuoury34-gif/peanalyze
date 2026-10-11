// Export / import Excel au format du fichier d'origine « Suivi des investissements.xlsx ».
// L'export part du fichier d'origine (public/template.xlsx) et y réécrit les données :
// mise en forme, graphiques, formules GOOGLEFINANCE et répartitions sont conservés.
import JSZip from 'jszip';
import type { AppData, Deposit, Transaction } from '../domain/types';
import { computePositions, computeSummary, monthlySeries } from '../domain/calc';

// libellés « Indice » utilisés dans l'Excel pour les ETF d'origine
const EXCEL_LABEL: Record<string, string> = {
  ESE: 'S&P 500', PUST: 'NASDAQ-100®', PAEEM: 'MSCI Emerging Markets', ETZ: 'Stoxx 600', CACC: 'CAC 40', WPEA: 'MSCI World',
};
const SHEET = { selection: 'xl/worksheets/sheet1.xml', historique: 'xl/worksheets/sheet3.xml', graphe: 'xl/worksheets/sheet4.xml', synthese: 'xl/worksheets/sheet5.xml', simulateur: 'xl/worksheets/sheet6.xml' };

// ------------------------------------------------------------------ utilitaires XML
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const r6 = (v: number) => String(Math.round(v * 1e6) / 1e6);

export function isoToSerial(iso: string): number {
  return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);
}
export function serialToIso(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
}

interface Cell { col: string; attrs: string; inner: string | null }
const CELL_RE = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function parseRow(rowXml: string): { attrs: string; cells: Cell[] } {
  const m = /^<row r="\d+"([^>]*)>([\s\S]*)<\/row>$/.exec(rowXml) || /^<row r="\d+"([^>]*)\/>$/.exec(rowXml);
  const attrs = m ? m[1] : '';
  const body = m && m[2] ? m[2] : '';
  const cells: Cell[] = [];
  let c: RegExpExecArray | null;
  CELL_RE.lastIndex = 0;
  while ((c = CELL_RE.exec(body))) cells.push({ col: c[1], attrs: c[2], inner: c[3] ?? null });
  return { attrs, cells };
}
function styleOf(cell?: Cell): string {
  const m = cell && /\ss="(\d+)"/.exec(cell.attrs);
  return m ? m[1] : '0';
}
function rowsOf(xml: string): Map<number, string> {
  const map = new Map<number, string>();
  const re = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) map.set(+m[1], m[0]);
  return map;
}

type Val = { n: number } | { s: string } | { f: string; v?: number | string } | null;
function cellXml(ref: string, style: string, val: Val): string {
  const s = style && style !== '0' ? ` s="${style}"` : '';
  if (!val) return `<c r="${ref}"${s}/>`;
  if ('n' in val) return isFinite(val.n) ? `<c r="${ref}"${s}><v>${r6(val.n)}</v></c>` : `<c r="${ref}"${s}/>`;
  if ('s' in val) return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(val.s)}</t></is></c>`;
  const v = val.v === undefined ? '' : typeof val.v === 'number' ? `<v>${r6(val.v)}</v>` : `<v>${esc(val.v)}</v>`;
  return `<c r="${ref}"${s}${typeof val.v === 'string' ? ' t="str"' : ''}><f>${esc(val.f)}</f>${v}</c>`;
}
/** Recopie une cellule du modèle à une autre ligne (sans formule partagée). */
function copyCell(cell: Cell, row: number): string {
  if (cell.inner && /<f t="shared"/.test(cell.inner)) return `<c r="${cell.col}${row}" s="${styleOf(cell)}"/>`;
  const attrs = cell.attrs;
  return cell.inner === null ? `<c r="${cell.col}${row}"${attrs}/>` : `<c r="${cell.col}${row}"${attrs}>${cell.inner}</c>`;
}
function colIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function buildRow(r: number, attrs: string, cells: Map<string, string>): string {
  const ordered = Array.from(cells.entries()).sort((a, b) => colIndex(a[0]) - colIndex(b[0])).map((e) => e[1]);
  return `<row r="${r}"${attrs}>${ordered.join('')}</row>`;
}
function replaceSheetData(xml: string, rows: string[]): string {
  return xml.replace(/<sheetData>[\s\S]*<\/sheetData>/, '<sheetData>' + rows.join('') + '</sheetData>').replace(/<dimension [^>]*\/>/, '');
}
/** Remplace la valeur d'une cellule existante en gardant son style. */
function setCell(xml: string, ref: string, val: Val): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const m = re.exec(xml);
  if (!m) return xml;
  const style = /\ss="(\d+)"/.exec(m[1])?.[1] || '0';
  return xml.slice(0, m.index) + cellXml(ref, style, val) + xml.slice(m.index + m[0].length);
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parts = Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((x) => unesc(x[1]));
    out.push(parts.join(''));
  }
  return out;
}

/** Lit toutes les cellules d'une feuille : réf → valeur (nombre ou texte). */
function readCells(xml: string, sst: string[]): Map<string, number | string> {
  const map = new Map<string, number | string>();
  const re = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const inner = m[3];
    if (!inner) continue;
    const t = /\st="([^"]+)"/.exec(m[2])?.[1];
    if (t === 'inlineStr') { map.set(m[1], unesc(Array.from(inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((x) => x[1]).join(''))); continue; }
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    if (v === undefined) continue;
    if (t === 's') map.set(m[1], sst[+v] ?? '');
    else if (t === 'str' || t === 'e') map.set(m[1], unesc(v));
    else if (t === 'b') map.set(m[1], v === '1' ? 1 : 0);
    else map.set(m[1], Number(v));
  }
  return map;
}

// ------------------------------------------------------------------ export
export async function buildWorkbook(template: ArrayBuffer | Uint8Array, data: AppData): Promise<JSZip> {
  const zip = await JSZip.loadAsync(template);
  const read = async (p: string) => (await zip.file(p)!.async('string'));
  const sst = sharedStrings(await read('xl/sharedStrings.xml'));
  const positions = computePositions(data);
  const summary = computeSummary(data, positions);

  // ---- Sélection ETF : derniers cours (valeur de repli des formules GOOGLEFINANCE)
  let sel = await read(SHEET.selection);
  const selCells = readCells(sel.slice(0, 200000), sst);
  const rowTicker: Record<number, string> = {};
  for (let r = 2; r <= 40; r++) {
    const code = selCells.get('D' + r);
    if (typeof code === 'string' && code) rowTicker[r] = code.trim();
  }
  for (const [r, tk] of Object.entries(rowTicker)) {
    const etf = data.etfs.find((e) => e.ticker === tk);
    if (!etf) continue;
    const re = new RegExp(`<c r="H${r}"([^>]*?)>([\\s\\S]*?)<\\/c>`);
    const m = re.exec(sel);
    if (!m) continue;
    const price = r6(etf.lastPrice);
    let inner = m[2];
    if (/GOOGLEFINANCE/.test(inner)) inner = inner.replace(/,(-?[\d.]+)\)<\/f>/, `,${price})</f>`).replace(/<v>[^<]*<\/v>/, `<v>${price}</v>`);
    else inner = `<f>${price}</f><v>${price}</v>`;
    sel = sel.slice(0, m.index) + `<c r="H${r}"${m[1]}>${inner}</c>` + sel.slice(m.index + m[0].length);
  }
  zip.file(SHEET.selection, sel);

  // ---- Historique des achats : virements + achats (structure d'origine, tableau décalé si besoin)
  let hist = await read(SHEET.historique);
  const tpl = rowsOf(hist);
  const tplRow = (r: number) => parseRow(tpl.get(r) || `<row r="${r}"></row>`);
  const deps: Deposit[] = data.deposits.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const txs: Transaction[] = data.transactions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = deps.length;
  const flowRow = n + 2; // dernière ligne des flux pour le TRI (= valorisation)
  const header = Math.max(19, n + 4);
  const t0 = header + 1, tEnd = t0 + txs.length - 1, tMax = t0 + 983;
  const labelOf = (id: string) => EXCEL_LABEL[id] || data.etfs.find((e) => e.id === id)?.index || id;
  const nameOf = (id: string) => data.etfs.find((e) => e.id === id)?.name || id;
  // liens hypertexte existants par ETF
  const linkByLabel = new Map<string, string>();
  for (const m of hist.matchAll(/<hyperlink r:id="(rId\d+)" ref="C(\d+)"\/>/g)) {
    const row = tplRow(+m[2]);
    const b = row.cells.find((c) => c.col === 'B');
    const idx = b?.inner && /<v>(\d+)<\/v>/.exec(b.inner)?.[1];
    if (idx !== undefined && idx !== null && sst[+idx]) linkByLabel.set(sst[+idx], m[1]);
  }
  const sumF = txs.reduce((s, t) => s + t.unitPrice * t.quantity, 0);
  const sumH = txs.reduce((s, t) => s + (t.grossAmount - t.unitPrice * t.quantity), 0);
  const sumI = txs.reduce((s, t) => s + t.feeRefund, 0);
  const d3 = sumF + sumH - sumI + summary.cashBalance;
  const rowsOut: string[] = [];
  rowsOut.push(tpl.get(1)!);
  for (let r = 2; r < header; r++) {
    const base = tplRow(r <= 16 ? r : 17);
    const cells = new Map<string, string>();
    for (const c of base.cells) cells.set(c.col, copyCell(c, r));
    if (r > 9) {
      const filler = tplRow(r === header - 1 ? 18 : 16);
      for (const c of filler.cells) if (colIndex(c.col) >= 3 && colIndex(c.col) <= 10) cells.set(c.col, copyCell(c, r));
    }
    const st = (col: string, fallback: string) => styleOf(tplRow(r <= 9 ? r : 2).cells.find((c) => c.col === col)) || fallback;
    if (r <= n + 1) {
      const d = deps[r - 2];
      cells.set('A', cellXml('A' + r, '16', { n: isoToSerial(d.date) }));
      cells.set('B', cellXml('B' + r, '17', { n: d.amount }));
    } else {
      const blank = r === header - 1 ? '57' : '40';
      cells.set('A', cellXml('A' + r, blank, null));
      cells.set('B', cellXml('B' + r, blank, null));
    }
    if (r <= flowRow) {
      const dIso = r <= n + 1 ? deps[r - 2].date : deps.length ? deps[deps.length - 1].date : '';
      cells.set('M', cellXml('M' + r, '21', { f: r === 2 ? 'IF(A2="",A1,A2)' : `IF(A${r}="",M${r - 1},A${r})`, v: dIso ? isoToSerial(dIso) : 0 }));
      cells.set('N', cellXml('N' + r, '22', { f: `IF(B${r}="",$G$9,-B${r})`, v: r <= n + 1 ? -deps[r - 2].amount : summary.totalValue }));
    } else {
      cells.set('M', cellXml('M' + r, '6', null));
      cells.set('N', cellXml('N' + r, '40', null));
    }
    if (r === 3) cells.set('D', cellXml('D3', st('D', '23'), { f: `SUM(F${t0}:F${tMax})+SUM(H${t0}:H${tMax})-SUM(I${t0}:I${tMax})+G6`, v: d3 }));
    if (r === 6) {
      cells.set('D', cellXml('D6', st('D', '23'), { f: `SUM(F${t0}:F${tMax})`, v: sumF }));
      cells.set('G', cellXml('G6', st('G', '33'), { n: summary.cashBalance }));
      cells.set('I', cellXml('I6', st('I', '35'), { f: 'D9/D3', v: d3 ? (summary.totalValue - d3) / d3 : 0 }));
    }
    if (r === 9) {
      cells.set('D', cellXml('D9', st('D', '31'), { f: 'G9-D3', v: summary.totalValue - d3 }));
      cells.set('G', cellXml('G9', st('G', '33'), { n: Math.round(summary.totalValue * 100) / 100 }));
      cells.set('I', cellXml('I9', st('I', '35'), { f: `XIRR(N2:N${flowRow},M2:M${flowRow})`, v: summary.annualizedReturnXirr ?? 0 }));
    }
    const attrs = r <= 16 ? base.attrs : '';
    rowsOut.push(buildRow(r, attrs, cells));
  }
  // en-tête du tableau des achats
  {
    const h = tplRow(19);
    rowsOut.push(buildRow(header, h.attrs, new Map(h.cells.map((c) => [c.col, copyCell(c, header)]))));
  }
  const links: string[] = [];
  txs.forEach((t, i) => {
    const r = t0 + i;
    const base = tplRow(20);
    const cells = new Map<string, string>(base.cells.map((c) => [c.col, copyCell(c, r)]));
    const label = labelOf(t.etfId);
    const f = t.unitPrice * t.quantity, hfee = t.grossAmount - f;
    cells.set('A', cellXml('A' + r, '16', { n: isoToSerial(t.date) }));
    cells.set('B', cellXml('B' + r, '63', { s: label }));
    cells.set('C', cellXml('C' + r, '65', { s: nameOf(t.etfId) }));
    cells.set('D', cellXml('D' + r, '66', { n: t.unitPrice }));
    cells.set('E', cellXml('E' + r, '67', { n: t.quantity }));
    cells.set('F', cellXml('F' + r, '68', { f: `D${r}*E${r}`, v: f }));
    cells.set('G', cellXml('G' + r, '66', { n: t.grossAmount }));
    cells.set('H', cellXml('H' + r, '68', { f: `G${r}-F${r}`, v: hfee }));
    cells.set('I', cellXml('I' + r, '66', { n: t.feeRefund }));
    cells.set('J', cellXml('J' + r, '69', { f: `(H${r}-I${r})/F${r}`, v: f ? (hfee - t.feeRefund) / f : 0 }));
    rowsOut.push(buildRow(r, base.attrs, cells));
    const rid = linkByLabel.get(label);
    if (rid) links.push(`<hyperlink r:id="${rid}" ref="C${r}"/>`);
  });
  {
    const b = tplRow(50);
    rowsOut.push(buildRow(tEnd + 1, b.attrs, new Map(b.cells.map((c) => [c.col, copyCell(c, tEnd + 1)]))));
  }
  hist = replaceSheetData(hist, rowsOut)
    .replace(/<pane ySplit="[^"]*" topLeftCell="[^"]*"/, `<pane ySplit="${header}.0" topLeftCell="A${t0}"`)
    .replace(/(<dataValidation [^>]*sqref=")B\d+:B\d+(")/, `$1B${t0}:B${Math.max(tEnd, t0)}$2`)
    .replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, links.length ? `<hyperlinks>${links.join('')}</hyperlinks>` : '')
    .replace(/<tableParts[^>]*>[\s\S]*?<\/tableParts>/, '')
    .replace(/<selection [^>]*\/>/, `<selection activeCell="A${t0}" sqref="A${t0}" pane="bottomLeft"/>`);
  zip.file(SHEET.historique, hist);
  // tableaux résiduels de l'export Google sur cette feuille : retirés (ils ne servaient pas)
  const relsPath = 'xl/worksheets/_rels/sheet3.xml.rels';
  let rels = await read(relsPath);
  const tableFiles = Array.from(rels.matchAll(/Target="\.\.\/tables\/(table\d+\.xml)"/g)).map((m) => m[1]);
  rels = rels.replace(/<Relationship [^>]*Target="\.\.\/tables\/table\d+\.xml"\/>/g, '');
  zip.file(relsPath, rels);
  let ct = await read('[Content_Types].xml');
  for (const f of tableFiles) {
    zip.remove('xl/tables/' + f);
    ct = ct.replace(new RegExp(`<Override [^>]*PartName="/xl/tables/${f}"[^>]*/>`), '');
  }
  zip.file('[Content_Types].xml', ct);

  // ---- Graphe épargne vs valeur réelle : une ligne par mois
  let gra = await read(SHEET.graphe);
  const gt = rowsOf(gra);
  const gRow = (r: number) => parseRow(gt.get(r) || `<row r="${r}"></row>`);
  const series = monthlySeries(data);
  const gOut: string[] = [gt.get(1)!];
  let prevDep = 0;
  series.forEach((p, i) => {
    const r = i + 2;
    const base = gRow(Math.min(r, 16));
    const cells = new Map<string, string>(base.cells.map((c) => [c.col, copyCell(c, r)]));
    const monthDep = Math.round((p.deposited - prevDep) * 100) / 100;
    prevDep = p.deposited;
    cells.set('A', cellXml('A' + r, '79', { s: p.month.slice(5, 7) + '/' + p.month.slice(2, 4) }));
    cells.set('B', cellXml('B' + r, '80', { n: monthDep }));
    cells.set('C', cellXml('C' + r, '80', r === 2 ? { f: 'B2', v: monthDep } : { f: `C${r - 1}+B${r}`, v: p.deposited }));
    cells.set('D', cellXml('D' + r, '17', { n: p.value }));
    gOut.push(buildRow(r, base.attrs, cells));
  });
  {
    const b = gRow(17), r = series.length + 2;
    gOut.push(buildRow(r, b.attrs, new Map(b.cells.map((c) => [c.col, copyCell(c, r)]))));
  }
  zip.file(SHEET.graphe, replaceSheetData(gra, gOut));

  // ---- Synthèse : nombre de parts et allocation cible
  let syn = await read(SHEET.synthese);
  for (const [r, tk] of Object.entries(rowTicker)) {
    if (+r > 7) continue;
    const p = positions.find((x) => x.etfId === tk);
    syn = setCell(syn, 'C' + r, { n: p ? p.quantity : 0 });
    const etf = data.etfs.find((e) => e.id === tk);
    syn = setCell(syn, 'J' + r, { n: etf && etf.inStrategy ? data.targetAllocation[tk] || 0 : 0 });
  }
  zip.file(SHEET.synthese, syn);

  // ---- Simulateur
  let sim = await read(SHEET.simulateur);
  const s = data.simulation;
  sim = setCell(sim, 'C2', { n: s.initialCapital });
  sim = setCell(sim, 'C3', { n: s.horizonYears });
  sim = setCell(sim, 'C4', { n: s.annualRate });
  const phases = s.dcaPhases.slice().sort((a, b) => a.fromYear - b.fromYear).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    const ph = phases[i];
    sim = setCell(sim, 'C' + (6 + 2 * i), { n: ph ? ph.fromYear : 999 });
    sim = setCell(sim, 'C' + (7 + 2 * i), { n: ph ? ph.monthly : phases.length ? phases[phases.length - 1].monthly : 0 });
  }
  zip.file(SHEET.simulateur, sim);

  // ---- recalcul complet à l'ouverture
  let wb = await read('xl/workbook.xml');
  wb = wb.replace(/<calcPr[^>]*\/>/, '<calcPr fullCalcOnLoad="1"/>');
  zip.file('xl/workbook.xml', wb);
  return zip;
}

export async function exportXlsx(data: AppData): Promise<Blob> {
  const res = await fetch(new URL('template.xlsx', document.baseURI).href);
  if (!res.ok) throw new Error('modèle Excel introuvable');
  const zip = await buildWorkbook(await res.arrayBuffer(), data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ------------------------------------------------------------------ import
export async function parseWorkbook(buf: ArrayBuffer | Uint8Array, current: AppData): Promise<AppData> {
  const zip = await JSZip.loadAsync(buf);
  const read = async (p: string) => {
    const f = zip.file(p);
    if (!f) throw new Error('feuille manquante (' + p.split('/').pop() + ')');
    return f.async('string');
  };
  const sst = zip.file('xl/sharedStrings.xml') ? sharedStrings(await read('xl/sharedStrings.xml')) : [];
  const selXml = await read(SHEET.selection);
  const sel = readCells(selXml.slice(0, 300000), sst);
  const labelToTicker = new Map<string, string>();
  const tickerRow: Record<string, number> = {};
  for (let r = 2; r <= 40; r++) {
    const a = sel.get('A' + r), d = sel.get('D' + r);
    if (typeof d === 'string' && d && typeof a === 'string') { labelToTicker.set(a.trim(), d.trim()); tickerRow[d.trim()] = r; }
  }
  for (const [tk, lab] of Object.entries(EXCEL_LABEL)) if (!labelToTicker.has(lab)) labelToTicker.set(lab, tk);

  const hist = readCells(await read(SHEET.historique), sst);
  let header = 0;
  for (let r = 2; r < 400; r++) if (hist.get('A' + r) === 'DATE') { header = r; break; }
  if (!header) throw new Error('tableau des achats introuvable');
  const deposits: Deposit[] = [];
  for (let r = 2; r < header; r++) {
    const a = hist.get('A' + r), b = hist.get('B' + r);
    if (typeof a === 'number' && typeof b === 'number' && b > 0) deposits.push({ id: 'd-' + serialToIso(a) + '-' + r, date: serialToIso(a), amount: Math.round(b * 100) / 100 });
  }
  const transactions: Transaction[] = [];
  for (let r = header + 1; r < header + 2000; r++) {
    const a = hist.get('A' + r);
    if (typeof a !== 'number') { if (hist.get('A' + (r + 1)) === undefined) break; continue; }
    const label = String(hist.get('B' + r) || '').trim();
    const name = String(hist.get('C' + r) || '').trim();
    const tk = labelToTicker.get(label) || current.etfs.find((e) => e.name === name || e.index === label)?.id;
    const unit = Number(hist.get('D' + r)), qty = Number(hist.get('E' + r)), gross = Number(hist.get('G' + r)), refund = Number(hist.get('I' + r) || 0);
    if (!tk || !isFinite(unit) || !isFinite(qty) || !isFinite(gross)) continue;
    transactions.push({ id: 'b-' + serialToIso(a) + '-' + tk + '-' + r, date: serialToIso(a), etfId: tk, unitPrice: unit, quantity: qty, grossAmount: gross, fees: Math.round((gross - unit * qty) * 1e4) / 1e4, feeRefund: refund });
  }
  if (!deposits.length && !transactions.length) throw new Error('aucune opération trouvée');

  const next: AppData = structuredClone(current);
  next.deposits = deposits;
  next.transactions = transactions;
  const cashCell = hist.get('G6');
  next.settings.cashBalance = typeof cashCell === 'number' && cashCell > 0 ? cashCell : null;

  // cours (Sélection ETF, colonne H)
  for (const e of next.etfs) {
    const r = tickerRow[e.ticker];
    const v = r ? sel.get('H' + r) : undefined;
    if (typeof v === 'number' && v > 0) e.lastPrice = v;
  }
  // allocation cible (Synthèse, colonne J)
  const syn = readCells(await read(SHEET.synthese), sst);
  for (let r = 2; r <= 30; r++) {
    const lab = syn.get('A' + r);
    if (typeof lab !== 'string' || !lab.trim() || lab === 'TOTAL') continue;
    const tk = labelToTicker.get(lab.trim());
    const j = syn.get('J' + r);
    if (!tk || typeof j !== 'number') continue;
    next.targetAllocation[tk] = j;
    const e = next.etfs.find((x) => x.id === tk);
    if (e) e.inStrategy = j > 0;
  }
  // simulateur
  const sim = readCells(await read(SHEET.simulateur), sst);
  const num = (ref: string) => { const v = sim.get(ref); return typeof v === 'number' ? v : NaN; };
  if (isFinite(num('C2'))) {
    next.simulation = {
      initialCapital: num('C2'),
      horizonYears: isFinite(num('C3')) ? num('C3') : next.simulation.horizonYears,
      annualRate: isFinite(num('C4')) ? num('C4') : next.simulation.annualRate,
      dcaPhases: [6, 8, 10, 12].map((r) => ({ fromYear: num('C' + r), monthly: num('C' + (r + 1)) })).filter((p) => isFinite(p.fromYear) && isFinite(p.monthly) && p.fromYear < 999),
    };
  }
  return next;
}

export async function importXlsx(file: File, current: AppData): Promise<AppData> {
  return parseWorkbook(await file.arrayBuffer(), current);
}
