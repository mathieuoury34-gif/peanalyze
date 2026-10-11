// Classeur Excel officiel de PEAnalyze (validé le 11/10/2026) : 9 onglets à la charte de l'application.
// Les données saisies (virements, achats, ETF, cours, compositions, simulateur) sont des valeurs ;
// tout le reste est en formules, pour que le fichier reste vivant dans Excel.
import type { AppData, Etf } from '../domain/types';
import { computePositions, exposure, monthlySeries, normalizeLabel, valuationDate } from '../domain/calc';
import { Workbook, colName as L, type Sheet, type Style, type Value } from './xlsx';

// ------------------------------------------------------------------ charte (tokens.css)
const PRIMARY = '007461', PETROL = '004652', TEXT = '19212D', NEUTRAL = '465266', MODERATE = '666E8A';
const BG = 'F6F7F9', DIV = 'EDEEF1', DIVIDER = 'AEB2C0';
const SUCCESS = '137128', SUCCESS_BG = 'EAF5EB', CRIT = 'AE0014', CRIT_BG = 'FFEDEB';
const TINT = 'E6F1EF', INPUT = '1F3FBF', SUB = 'D5E3E1';
const ETF_COLORS: Record<string, string> = { ESE: '007461', PUST: '0A94A8', PAEEM: 'F8D10A', ETZ: '004652', CACC: 'A0D7A2', WPEA: '5159EA' };
const EXTRA = ['1BCB99', 'BAE3EC', 'C85207', '8E6C8A', 'BCC0CD', '0A94A8', 'F8D10A', '5159EA'];
const LIGHT = new Set(['F8D10A', 'A0D7A2', 'BAE3EC', 'BCC0CD', '1BCB99']);

const EUR = '#,##0.00 "€"', EUR0 = '#,##0 "€"', EUR_S = '+#,##0.00 "€";-#,##0.00 "€";0.00 "€"', PRICE = '#,##0.00## "€"';
const PCT1 = '0.0%', PCT2 = '0.00%', PCT_S = '+0.0%;-0.0%;0.0%', PTS = '+0.0" pts";-0.0" pts";0.0" pts"';
const DATE = 'dd/mm/yyyy', MEUR = '#,##0 "M€"', INT = '#,##0';
const NROWS = 1000; // capacité des tableaux de saisie
const E_LAST = 30;

interface Put { fmt?: string; b?: boolean; color?: string; inp?: boolean; h?: 'left' | 'center' | 'right'; sz?: number; bg?: string; border?: boolean; i?: boolean }
function st(o: Put = {}): Style {
  return {
    font: { sz: o.sz || 10, b: o.b, i: o.i, color: o.inp ? INPUT : o.color || TEXT },
    numFmt: o.fmt,
    fill: o.bg,
    align: o.h ? { h: o.h, v: 'center' } : undefined,
    border: o.border === false ? undefined : { bottom: ['thin', DIV] },
  };
}
const f = (s: string): Value => ({ f: s });

class Page {
  constructor(public ws: Sheet) {}
  put(r: number, c: number, v: Value, o: Put = {}) { this.ws.set(r, c, v, st(o)); }
  header(r: number, c: number, labels: string[], height = 30) {
    labels.forEach((lab, i) => this.ws.set(r, c + i, lab, { font: { sz: 9, b: true, color: 'FFFFFF' }, fill: PRIMARY, align: { h: 'center', v: 'center', wrap: true } }));
    this.ws.height(r, height);
  }
  section(r: number, c: number, text: string) { this.ws.set(r, c, text.toUpperCase(), { font: { sz: 9, b: true, color: NEUTRAL } }); }
  widths(w: Record<string, number>) { for (const [k, v] of Object.entries(w)) this.ws.width(k, v); }
}

function page(wb: Workbook, title: string, heading: string, subtitle: string, ncol: number, tab = PRIMARY): Page {
  const ws = wb.sheet(title);
  ws.tab = tab;
  for (let c = 1; c <= ncol; c++) {
    ws.set(1, c, null, { fill: PETROL });
    ws.set(2, c, null, { fill: PETROL });
  }
  ws.height(1, 30).height(2, 20).height(3, 10);
  ws.set(1, 1, heading, { font: { sz: 16, b: true, color: 'FFFFFF' }, fill: PETROL, align: { v: 'center', indent: 1 } });
  ws.set(2, 1, subtitle, { font: { sz: 9, color: SUB }, fill: PETROL, align: { v: 'top', indent: 1 } });
  return new Page(ws);
}

function tickerStyle(color: string): Style {
  return { font: { b: true, color: LIGHT.has(color) ? TEXT : 'FFFFFF' }, fill: color, align: { h: 'center', v: 'center' }, border: { bottom: ['thin', DIV] } };
}

const sorted = <T extends { date: string }>(a: T[]) => a.slice().sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

/** Construit le classeur à partir des données de l'app. */
export function buildPeanalyzeWorkbook(data: AppData, catalogDate = ''): Workbook {
  const held = new Set(data.transactions.map((t) => t.etfId));
  const ids = data.myEtfIds.filter((id) => data.etfs.some((e) => e.id === id));
  for (const id of held) if (!ids.includes(id) && data.etfs.some((e) => e.id === id)) ids.push(id);
  const etfs: Etf[] = ids.map((id) => data.etfs.find((e) => e.id === id)!);
  const tickers = etfs.map((e) => e.id);
  const colors: Record<string, string> = {};
  tickers.forEach((t, i) => { colors[t] = ETF_COLORS[t] || EXTRA[i % EXTRA.length]; });
  const deps = sorted(data.deposits);
  const txs = sorted(data.transactions);
  const positions = computePositions(data);
  const order = tickers.filter((t) => positions.some((p) => p.etfId === t)).concat(positions.map((p) => p.etfId).filter((t) => !tickers.includes(t)));
  const vd = valuationDate(data);
  const nC = tickers.length;

  const wb = new Workbook();
  const dash = page(wb, 'Tableau de bord', 'PEAnalyze · Tableau de bord', 'Valorisé au', 9);
  const pf = page(wb, 'Portefeuille', 'Portefeuille', 'Positions, allocation réelle et cible, parts à acheter, répartitions sectorielle et géographique.', 16);
  const hi = page(wb, 'Historique', 'Historique des opérations', 'Saisissez vos virements et achats dans les cellules en bleu : montants, frais et indicateurs se calculent seuls. Débit courtier = montant débité frais inclus ; remboursement = frais rendus par le courtier.', 14);
  const ev = page(wb, 'Évolution', 'Évolution mensuelle', 'Montant épargné et valeur réelle du portefeuille à la fin de chaque mois.', 7 + nC);
  const me = page(wb, 'Mes ETF', 'Mes ETF', 'Caractéristiques, stratégie et allocation cible des ETF suivis. Cours : feuille « Cours ».', 14);
  const co = page(wb, 'Cours', 'Cours de clôture', 'Historique quotidien des cours (Euronext Paris) et performance en base 100.', 3 + 2 * nC, PETROL);
  const cp = page(wb, 'Compositions', 'Compositions des indices', 'Répartition sectorielle et géographique de chaque ETF (poids saisis) et contribution au portefeuille.', 6, PETROL);
  const ca = page(wb, 'Catalogue', 'Catalogue des ETF éligibles au PEA', '', 15, PETROL);
  const si = page(wb, 'Simulateur', "Simulateur d'épargne", 'Capitalisation mensuelle, versements par phases, résultat en euros courants et constants.', 10);

  // ================================================================ Cours
  {
    const ws = co.ws;
    const hist = new Map<string, Map<string, number>>();
    for (const e of etfs) {
      const h = e.priceHistory.slice();
      if (e.lastPriceDate && (!h.length || h[h.length - 1][0] < e.lastPriceDate)) h.push([e.lastPriceDate, e.lastPrice]);
      for (const [d, p] of h) {
        if (!hist.has(d)) hist.set(d, new Map());
        hist.get(d)!.set(e.id, p);
      }
    }
    const dates = Array.from(hist.keys()).sort();
    const base = nC + 3;
    co.header(3, 1, ['Date', ...tickers], 22);
    co.header(3, base - 1, ['Base 100', ...tickers], 22);
    tickers.forEach((t, j) => ws.style(3, 2 + j, { font: { sz: 9, b: true, color: LIGHT.has(colors[t]) ? TEXT : 'FFFFFF' }, fill: colors[t], align: { h: 'center', v: 'center' } }));
    dates.forEach((d, i) => {
      const r = 4 + i;
      co.put(r, 1, new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)), { fmt: DATE });
      co.put(r, base - 1, f(`A${r}`), { fmt: DATE, color: MODERATE });
      tickers.forEach((t, j) => {
        const v = hist.get(d)!.get(t);
        co.put(r, 2 + j, v ?? null, { fmt: PRICE, inp: true });
        const c = L(2 + j);
        co.put(r, base + j, f(`IF(${c}${r}="","",${c}${r}/INDEX(${c}$4:${c}$5000,MATCH(TRUE,INDEX(${c}$4:${c}$5000<>"",0),0))*100)`), { fmt: '0.0' });
      });
    });
    const last = 3 + Math.max(dates.length, 1);
    ws.freeze = 'B4';
    co.widths({ A: 12, [L(base - 1)]: 12, [L(nC + 2)]: 3 });
    for (let j = 0; j < nC; j++) { ws.width(2 + j, 10); ws.width(base + j, 9); }
    wb.define('ValDate', 'MAX(Cours!$A$4:$A$5000)');

    // ================================================================ Mes ETF
    const mw = me.ws;
    me.header(4, 1, ['Ticker', 'Indice', 'Nom', 'ISIN', 'Catégorie', 'Dans la stratégie', 'Allocation cible', 'Frais (TER)', 'Encours', 'Réplication', 'Distribution', 'Dernier cours', 'Date du cours', 'Perf. depuis le début']);
    const lastCol = L(1 + Math.max(nC, 1));
    etfs.forEach((e, i) => {
      const r = 5 + i;
      const t = e.id;
      mw.set(r, 1, t, tickerStyle(colors[t]));
      me.put(r, 2, e.index, { inp: true });
      me.put(r, 3, e.name, { inp: true });
      me.put(r, 4, e.isin, { inp: true });
      me.put(r, 5, e.category, { inp: true });
      me.put(r, 6, e.inStrategy ? 'Oui' : 'Non', { inp: true, h: 'center' });
      me.put(r, 7, e.inStrategy ? data.targetAllocation[t] || 0 : 0, { fmt: PCT1, inp: true, h: 'center' });
      me.put(r, 8, e.ter, { fmt: PCT2, inp: true });
      me.put(r, 9, e.aumMEur || null, { fmt: MEUR, inp: true });
      me.put(r, 10, e.replication, { inp: true });
      me.put(r, 11, e.distribution, { inp: true });
      const colm = `MATCH($A${r},Cours!$B$3:$${lastCol}$3,0)`;
      const rng = `Cours!$B$4:$${lastCol}$5000`;
      me.put(r, 12, f(`INDEX(${rng},MATCH(9.99E+307,INDEX(${rng},0,${colm})),${colm})`), { fmt: PRICE, b: true });
      me.put(r, 13, f(`INDEX(Cours!$A$4:$A$5000,MATCH(9.99E+307,INDEX(${rng},0,${colm})))`), { fmt: DATE });
      me.put(r, 14, f(`L${r}/INDEX(${rng},MATCH(TRUE,INDEX(INDEX(${rng},0,${colm})<>"",0),0),${colm})-1`), { fmt: PCT_S });
    });
    const rt = 5 + etfs.length;
    if (etfs.length) {
      mw.validation(`F5:F${rt - 1}`, '"Oui,Non"');
      me.put(rt, 6, 'Total cible', { b: true, h: 'right', border: false });
      me.put(rt, 7, f(`SUM(G5:G${rt - 1})`), { fmt: PCT1, b: true, h: 'center', border: false });
      me.put(rt, 8, f(`IF(ROUND(G${rt},4)=1,"✓ 100 %","⚠ doit faire 100 %")`), { color: MODERATE, border: false });
    }
    me.widths({ A: 9, B: 16, C: 44, D: 15, E: 30, F: 11, G: 11, H: 9, I: 11, J: 12, K: 13, L: 12, M: 12, N: 12 });
    mw.freeze = 'B5';
    wb.define('E_Ticker', `'Mes ETF'!$A$5:$A$${E_LAST}`);
    wb.define('E_Indice', `'Mes ETF'!$B$5:$B$${E_LAST}`);
    wb.define('E_Strat', `'Mes ETF'!$F$5:$F$${E_LAST}`);
    wb.define('E_Cible', `'Mes ETF'!$G$5:$G$${E_LAST}`);
    wb.define('E_Cours', `'Mes ETF'!$L$5:$L$${E_LAST}`);
    if (dates.length && nC) {
      mw.chart({
        kind: 'line', title: 'Performance des ETF (base 100 au début de l’historique)', at: [rt + 3, 2], size: [26, 9], legend: 'b',
        catFmt: 'mmm yy', valFmt: '0', tickSkip: 42,
        series: tickers.map((t, j) => ({ nameRef: `Cours!$${L(base + j)}$3`, cat: `Cours!$${L(base - 1)}$4:$${L(base - 1)}$${last}`, val: `Cours!$${L(base + j)}$4:$${L(base + j)}$${last}`, color: colors[t], line: { w: 15000 } })),
      });
    }
  }

  // ================================================================ Historique
  const first = 6, lastRow = first + NROWS - 1;
  {
    const ws = hi.ws;
    hi.section(4, 1, 'Virements');
    hi.section(4, 4, 'Achats');
    hi.header(5, 1, ['Date', 'Montant']);
    hi.header(5, 4, ['Date', 'ETF', 'Indice', 'Cours', 'Quantité', 'Montant brut', 'Débit courtier', 'Frais', 'Rembour-sement', 'Frais nets', 'Frais en %']);
    ws.validation(`E${first}:E${lastRow}`, `'Mes ETF'!$A$5:$A$${E_LAST}`);
    const blank = (r: number, c: number, fmt?: string) => ws.set(r, c, null, { font: { color: INPUT }, numFmt: fmt });
    const pre = Math.max(txs.length + 200, 300);
    for (let i = 0; i < NROWS; i++) {
      const r = first + i;
      if (i < deps.length) {
        hi.put(r, 1, new Date(+deps[i].date.slice(0, 4), +deps[i].date.slice(5, 7) - 1, +deps[i].date.slice(8, 10)), { fmt: DATE, inp: true });
        hi.put(r, 2, deps[i].amount, { fmt: EUR, inp: true });
      } else if (i < pre) { blank(r, 1, DATE); blank(r, 2, EUR); }
      if (i < txs.length) {
        const t = txs[i];
        hi.put(r, 4, new Date(+t.date.slice(0, 4), +t.date.slice(5, 7) - 1, +t.date.slice(8, 10)), { fmt: DATE, inp: true });
        hi.put(r, 5, t.etfId, { inp: true, h: 'center' });
        hi.put(r, 7, t.unitPrice, { fmt: PRICE, inp: true });
        hi.put(r, 8, t.quantity, { fmt: INT, inp: true });
        hi.put(r, 10, t.grossAmount, { fmt: EUR, inp: true });
        hi.put(r, 12, t.feeRefund, { fmt: EUR, inp: true });
      } else if (i < pre) {
        blank(r, 4, DATE); blank(r, 5); blank(r, 7, PRICE); blank(r, 8, INT); blank(r, 10, EUR); blank(r, 12, EUR);
      }
      if (i < pre) {
        const bd = i < txs.length;
        hi.put(r, 6, f(`IF(E${r}="","",IFERROR(INDEX(E_Indice,MATCH(E${r},E_Ticker,0)),"?"))`), { color: NEUTRAL, border: bd });
        hi.put(r, 9, f(`IF(D${r}="","",G${r}*H${r})`), { fmt: EUR, border: bd });
        hi.put(r, 11, f(`IF(D${r}="","",J${r}-I${r})`), { fmt: EUR, border: bd });
        hi.put(r, 13, f(`IF(D${r}="","",K${r}-L${r})`), { fmt: EUR, border: bd });
        hi.put(r, 14, f(`IF(OR(D${r}="",I${r}=0),"",M${r}/I${r})`), { fmt: PCT2, border: bd });
      }
      // flux pour le TRI (colonnes masquées)
      ws.set(r, 16, f(`IF(A${r}="",MIN($A$${first}:$A$${lastRow}),A${r})`), { numFmt: DATE });
      ws.set(r, 17, f(`IF(B${r}="",0,-B${r})`), { numFmt: EUR });
    }
    ws.set(first - 1, 16, f(`MIN($A$${first}:$A$${lastRow})`), { numFmt: DATE });
    ws.set(first - 1, 17, 0);
    ws.set(lastRow + 1, 16, f('ValDate'), { numFmt: DATE });
    ws.set(lastRow + 1, 17, f('Valorisation'), { numFmt: EUR });
    ws.set(4, 16, 'Flux pour le TRI', { font: { sz: 8, color: MODERATE } });
    ws.hidden.add(16); ws.hidden.add(17);
    hi.widths({ A: 12, B: 12, C: 3, D: 12, E: 8, F: 14, G: 11, H: 9, I: 13, J: 13, K: 9, L: 11, M: 10, N: 9, O: 3, P: 11, Q: 11 });
    ws.freeze = `A${first}`;
    ws.cf(`N${first}:N${lastRow}`, { type: 'cellIs', operator: 'greaterThan', formula: '0.005', dxf: { font: { color: CRIT } } });
    const rng = (c: string) => `Historique!$${c}$${first}:$${c}$${lastRow}`;
    for (const [nm, c] of [['V_Date', 'A'], ['V_Montant', 'B'], ['A_Date', 'D'], ['A_ETF', 'E'], ['A_Cours', 'G'], ['A_Qte', 'H'], ['A_Brut', 'I'],
      ['A_Debit', 'J'], ['A_Frais', 'K'], ['A_Remb', 'L'], ['A_FraisNets', 'M'], ['A_FraisPct', 'N']]) wb.define(nm, rng(c));
    wb.define('TRI_Dates', `Historique!$P$${first - 1}:$P$${lastRow + 1}`);
    wb.define('TRI_Flux', `Historique!$Q$${first - 1}:$Q$${lastRow + 1}`);
  }

  // ================================================================ Portefeuille
  const p0 = 5;
  const pt = p0 + order.length;
  {
    const ws = pf.ws;
    pf.header(4, 1, ['Indice', 'Ticker', 'Stratégie', 'Parts', 'Coût de revient', 'PRU', 'Cours', 'Valeur', 'Plus-value', 'Plus-value %', 'Poids réel', 'Cible', 'Écart', 'Valeur cible', 'Parts cibles', 'Parts à acheter']);
    order.forEach((t, i) => {
      const r = p0 + i;
      const m = `MATCH($B${r},E_Ticker,0)`;
      pf.put(r, 1, f(`INDEX(E_Indice,${m})`), { b: true });
      ws.set(r, 2, t, tickerStyle(colors[t] || EXTRA[0]));
      pf.put(r, 3, f(`IF(INDEX(E_Strat,${m})="Oui","Oui","Hors stratégie")`), { color: NEUTRAL, h: 'center' });
      pf.put(r, 4, f(`SUMIF(A_ETF,$B${r},A_Qte)`), { fmt: INT, h: 'center' });
      pf.put(r, 5, f(`SUMIF(A_ETF,$B${r},A_Debit)-SUMIF(A_ETF,$B${r},A_Remb)`), { fmt: EUR });
      pf.put(r, 6, f(`IF(D${r}>0,E${r}/D${r},"")`), { fmt: PRICE });
      pf.put(r, 7, f(`INDEX(E_Cours,${m})`), { fmt: PRICE });
      pf.put(r, 8, f(`D${r}*G${r}`), { fmt: EUR, b: true });
      pf.put(r, 9, f(`H${r}-E${r}`), { fmt: EUR_S });
      pf.put(r, 10, f(`IF(E${r}>0,I${r}/E${r},"")`), { fmt: PCT_S });
      pf.put(r, 11, f(`IF(TotalTitres>0,H${r}/TotalTitres,0)`), { fmt: PCT1, h: 'center' });
      pf.put(r, 12, f(`IF(C${r}="Oui",INDEX(E_Cible,${m}),0)`), { fmt: PCT1, h: 'center' });
      pf.put(r, 13, f(`(K${r}-L${r})*100`), { fmt: PTS, h: 'center' });
      pf.put(r, 14, f(`L${r}*Valorisation`), { fmt: EUR });
      pf.put(r, 15, f(`IF(G${r}>0,ROUND(N${r}/G${r},0),0)`), { fmt: INT, h: 'center' });
      pf.put(r, 16, f(`MAX(0,O${r}-D${r})`), { fmt: INT, b: true, h: 'center', color: PRIMARY });
    });
    pf.put(pt, 1, 'Total titres', { b: true, bg: TINT });
    for (let c = 2; c <= 16; c++) pf.put(pt, c, null, { bg: TINT });
    const sumOf = (c: number) => (order.length ? `SUM(${L(c)}${p0}:${L(c)}${pt - 1})` : '0');
    for (const [c, fmt] of [[4, INT], [5, EUR], [8, EUR], [9, EUR_S], [11, PCT1], [12, PCT1], [14, EUR], [16, INT]] as [number, string][]) {
      pf.put(pt, c, f(sumOf(c)), { fmt, b: true, bg: TINT, h: fmt === INT || fmt === PCT1 ? 'center' : undefined });
    }
    pf.put(pt, 10, f(`IF(E${pt}>0,I${pt}/E${pt},"")`), { fmt: PCT_S, b: true, bg: TINT });
    ws.cf(`I${p0}:J${pt}`, { type: 'cellIs', operator: 'lessThan', formula: '0', dxf: { font: { color: CRIT } } });
    ws.cf(`I${p0}:J${pt}`, { type: 'cellIs', operator: 'greaterThan', formula: '0', dxf: { font: { color: SUCCESS } } });
    if (order.length) {
      ws.cf(`M${p0}:M${pt - 1}`, { type: 'cellIs', operator: 'lessThan', formula: '-5', dxf: { font: { color: CRIT, b: true }, fill: CRIT_BG } });
      ws.cf(`M${p0}:M${pt - 1}`, { type: 'cellIs', operator: 'greaterThan', formula: '5', dxf: { font: { color: '8A4B00', b: true }, fill: 'FFF4D6' } });
    }
    wb.define('TotalTitres', `Portefeuille!$H$${pt}`);
    wb.define('P_Ticker', `Portefeuille!$B$${p0}:$B$${Math.max(pt - 1, p0)}`);
    wb.define('P_PoidsReel', `Portefeuille!$K$${p0}:$K$${Math.max(pt - 1, p0)}`);
    pf.put(pt + 1, 1, "Écart : poids réel − cible, en points. Rouge si l'ETF est sous-pondéré de plus de 5 points, orange s'il est sur-pondéré.", { sz: 8, color: MODERATE, border: false });
    pf.widths({ A: 16, B: 9, C: 13, D: 9, E: 13, F: 10, G: 10, H: 12, I: 12, J: 10, K: 9, L: 8, M: 10, N: 12, O: 8, P: 9 });
    ws.freeze = 'C5';

    // ---- Compositions
    const cw = cp.ws;
    cp.header(4, 1, ['ETF', 'Type', 'Libellé', 'Poids dans l’indice', 'Poids dans le portefeuille']);
    let r = 5;
    for (const e of etfs) {
      for (const [kind, lab] of [['sectors', 'Secteur'], ['countries', 'Pays']] as const) {
        for (const it of e[kind]) {
          cp.put(r, 1, e.id, { h: 'center', inp: true });
          cp.put(r, 2, lab, { inp: true });
          cp.put(r, 3, normalizeLabel(it.label), { inp: true });
          cp.put(r, 4, it.weight, { fmt: PCT2, inp: true });
          cp.put(r, 5, f(`D${r}*IFERROR(INDEX(P_PoidsReel,MATCH(A${r},P_Ticker,0)),0)`), { fmt: PCT2 });
          r++;
        }
      }
    }
    cp.widths({ A: 8, B: 9, C: 30, D: 12, E: 14 });
    cw.freeze = 'A5';
    for (const [nm, c] of [['C_ETF', 'A'], ['C_Type', 'B'], ['C_Label', 'C'], ['C_Contrib', 'E']]) wb.define(nm, `Compositions!$${c}$5:$${c}$2000`);

    // ---- répartitions du portefeuille
    const block = (col: number, title: string, kind: string, rows: { label: string }[]): [number, number] => {
      const r0 = pt + 4, vc = col + 3;
      pf.section(r0, col, title);
      pf.header(r0 + 1, col, ['Libellé', '', '', 'Poids'], 20);
      ws.merge(r0 + 1, col, r0 + 1, col + 2);
      rows.forEach((x, i) => {
        const rr = r0 + 2 + i;
        for (let k = 0; k < 3; k++) pf.put(rr, col + k, k === 0 ? x.label : null);
        ws.merge(rr, col, rr, col + 2);
        pf.put(rr, vc, f(`SUMIFS(C_Contrib,C_Type,"${kind}",C_Label,${L(col)}${rr})`), { fmt: PCT1 });
      });
      const end = r0 + 1 + rows.length;
      if (rows.length) ws.cf(`${L(vc)}${r0 + 2}:${L(vc)}${end}`, { type: 'dataBar', color: '9FD0C7' });
      return [r0, end];
    };
    const [s0, s1] = block(1, 'Répartition sectorielle du portefeuille', 'Secteur', exposure(data, positions, 'sectors'));
    const [g0, g1] = block(6, 'Répartition géographique du portefeuille', 'Pays', exposure(data, positions, 'countries'));
    for (const [c0, end, col, title, row] of [[s0, Math.min(s1, s0 + 11), 1, 'Secteurs (top 10)', s0], [g0, Math.min(g1, g0 + 11), 6, 'Pays (top 10)', g0 + 18]] as [number, number, number, string, number][]) {
      if (end < c0 + 2) continue;
      ws.chart({
        kind: 'bar', title, at: [row, 11], size: [15, 8], legend: null, catText: true, valFmt: '0%', reverse: true, gap: 60,
        series: [{ val: `Portefeuille!$${L(col + 3)}$${c0 + 2}:$${L(col + 3)}$${end}`, cat: `Portefeuille!$${L(col)}$${c0 + 2}:$${L(col)}$${end}`, color: PRIMARY }],
      });
    }
  }

  // ================================================================ Évolution
  const months = monthlySeries(data).map((m) => m.month);
  const cE = 5 + nC, cV = 6 + nC, cP = 7 + nC;
  const mLast = 4 + months.length;
  {
    const ws = ev.ws;
    ev.header(4, 1, ['Mois', 'Fin de période', 'Versé dans le mois', 'Montant épargné', ...tickers.map((t) => `Valeur ${t}`), 'Espèces', 'Valeur réelle', 'Plus-value']);
    tickers.forEach((t, j) => ws.set(3, 5 + j, t, { font: { sz: 7, color: BG } }));
    months.forEach((ym, i) => {
      const r = 5 + i;
      ev.put(r, 1, new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1), { fmt: 'mmm yyyy', b: true });
      ev.put(r, 2, f(`MIN(EOMONTH(A${r},0),ValDate)`), { fmt: DATE, color: MODERATE });
      ev.put(r, 3, f(`SUMIFS(V_Montant,V_Date,">="&A${r},V_Date,"<="&B${r})`), { fmt: EUR });
      ev.put(r, 4, f(`SUMIFS(V_Montant,V_Date,"<="&B${r})`), { fmt: EUR, b: true });
      tickers.forEach((_t, j) => {
        const cc = L(2 + j);
        ev.put(r, 5 + j, f(`SUMIFS(A_Qte,A_ETF,${L(5 + j)}$3,A_Date,"<="&$B${r})*IFERROR(INDEX(Cours!${cc}$4:${cc}$5000,MATCH($B${r},Cours!$A$4:$A$5000,1)),0)`), { fmt: EUR, color: NEUTRAL });
      });
      ev.put(r, cE, f(`MAX(0,D${r}-SUMIFS(A_Debit,A_Date,"<="&B${r})+SUMIFS(A_Remb,A_Date,"<="&B${r}))`), { fmt: EUR, color: NEUTRAL });
      ev.put(r, cV, f(`SUM(${L(5)}${r}:${L(cE)}${r})`), { fmt: EUR, b: true, color: PRIMARY });
      ev.put(r, cP, f(`${L(cV)}${r}-D${r}`), { fmt: EUR_S });
    });
    if (months.length) {
      ws.cf(`${L(cP)}5:${L(cP)}${mLast}`, { type: 'cellIs', operator: 'lessThan', formula: '0', dxf: { font: { color: CRIT } } });
      ws.cf(`${L(cP)}5:${L(cP)}${mLast}`, { type: 'cellIs', operator: 'greaterThan', formula: '0', dxf: { font: { color: SUCCESS } } });
      ws.chart(evolutionChart(`'Évolution'`, mLast, cV, [mLast + 3, 1], [24, 9]));
    }
    ev.widths({ A: 11, B: 12, C: 12, D: 13, [L(cE)]: 10, [L(cV)]: 13, [L(cP)]: 12 });
    for (let j = 0; j < nC; j++) ws.width(5 + j, 11);
    ws.freeze = 'B5';
  }

  // ================================================================ Simulateur
  {
    const ws = si.ws;
    const sim = data.simulation;
    si.section(4, 1, 'Paramètres');
    const params: [string, number, string][] = [['Capital initial', sim.initialCapital, EUR0], ['Horizon (années)', sim.horizonYears, '0'], ['Rendement annuel', sim.annualRate, PCT1], ['Inflation (euros constants)', 0.02, PCT1]];
    params.forEach(([lab, v, fmt], i) => {
      si.put(5 + i, 1, lab, { color: NEUTRAL });
      si.put(5 + i, 2, v, { fmt, inp: true, b: true, bg: TINT });
    });
    si.put(9, 1, 'Taux mensuel équivalent', { color: NEUTRAL });
    si.put(9, 2, f('(1+B7)^(1/12)-1'), { fmt: '0.000%' });
    si.section(4, 4, 'Versements mensuels par phase');
    si.header(5, 4, ["À partir de l'année", 'Versement mensuel'], 28);
    const phases = sim.dcaPhases.slice().sort((a, b) => a.fromYear - b.fromYear);
    for (let i = 0; i < 10; i++) {
      const r = 6 + i;
      si.put(r, 4, phases[i] ? phases[i].fromYear : null, { fmt: '0', inp: true, h: 'center' });
      si.put(r, 5, phases[i] ? phases[i].monthly : null, { fmt: EUR0, inp: true });
    }
    si.put(16, 4, "Classez les phases par année croissante ; une phase s'applique jusqu'à la suivante.", { sz: 8, color: MODERATE, border: false });
    si.section(4, 7, "Résultat à l'horizon");
    const res: [string, string, string][] = [['Capital final', 'INDEX(D21:D61,MATCH(B6,A21:A61,0))', EUR0], ['Total versé', 'INDEX(C21:C61,MATCH(B6,A21:A61,0))', EUR0],
      ['Intérêts composés', 'H5-H6', EUR0], ['Capital final en euros constants', 'INDEX(F21:F61,MATCH(B6,A21:A61,0))', EUR0]];
    res.forEach(([lab, fx, fmt], i) => {
      si.put(5 + i, 7, lab, { color: NEUTRAL });
      si.put(5 + i, 8, f(fx), { fmt, b: true, color: i === 0 ? PRIMARY : TEXT, sz: i === 0 ? 12 : 10 });
    });
    si.section(19, 1, 'Projection année par année');
    si.header(20, 1, ['Année', 'Versement mensuel', 'Total versé', 'Capital', 'Intérêts cumulés', 'Capital en euros constants'], 28);
    for (let y = 0; y <= 40; y++) {
      const r = 21 + y;
      const hide = `A${r}>$B$6`;
      si.put(r, 1, y, { fmt: '0', h: 'center', b: true });
      if (y === 0) {
        si.put(r, 2, f('""'), { fmt: EUR0 });
        si.put(r, 3, f('$B$5'), { fmt: EUR0 });
        si.put(r, 4, f('$B$5'), { fmt: EUR0, b: true });
      } else {
        si.put(r, 2, f(`IF(${hide},"",IFERROR(LOOKUP(A${r},$D$6:$D$15,$E$6:$E$15),0))`), { fmt: EUR0 });
        si.put(r, 3, f(`IF(${hide},"",C${r - 1}+B${r}*12)`), { fmt: EUR0 });
        si.put(r, 4, f(`IF(${hide},"",IF($B$9=0,D${r - 1}+B${r}*12,D${r - 1}*(1+$B$9)^12+B${r}*((1+$B$9)^12-1)/$B$9))`), { fmt: EUR0, b: true });
      }
      si.put(r, 5, f(`IF(D${r}="","",D${r}-C${r})`), { fmt: EUR0, color: SUCCESS });
      si.put(r, 6, f(`IF(D${r}="","",D${r}/(1+$B$8)^A${r})`), { fmt: EUR0, color: NEUTRAL });
    }
    ws.cf('A21:A61', { type: 'expression', formula: 'A21>$B$6', dxf: { font: { color: DIVIDER } } });
    si.widths({ A: 28, B: 14, C: 13, D: 16, E: 16, F: 16, G: 30, H: 14 });
    const hz = Math.min(40, Math.max(1, Math.round(sim.horizonYears)));
    const rr = (c: string) => `Simulateur!$${c}$21:$${c}$${21 + hz}`;
    ws.chart({
      kind: 'line', title: 'Capital projeté et total versé', at: [11, 7], size: [17, 9], legend: 'b', valFmt: '#,##0 "€"', catText: false,
      series: [
        { nameRef: 'Simulateur!$D$20', cat: rr('A'), val: rr('D'), color: PRIMARY, line: { w: 28575 } },
        { nameRef: 'Simulateur!$C$20', cat: rr('A'), val: rr('C'), color: MODERATE, line: { w: 19050, dash: 'dash' } },
        { nameRef: 'Simulateur!$F$20', cat: rr('A'), val: rr('F'), color: '0A94A8', line: { w: 15875, dash: 'sysDot' } },
      ],
    });
  }

  // ================================================================ Catalogue
  {
    const ws = ca.ws;
    const cat = data.catalog;
    ws.set(2, 1, `${cat.length} ETF · source : liste justETF${catalogDate ? ' relevée le ' + catalogDate.split('-').reverse().join('/') : ''} (frais, encours et prix d'une part indicatifs). Filtrez avec les flèches des en-têtes.`, { font: { sz: 9, color: SUB }, fill: PETROL, align: { v: 'top', indent: 1 } });
    ca.header(4, 1, ['Indice', 'Nom', 'ISIN', 'Mnémo', 'Place', 'Catégorie', 'Frais', 'Encours', 'Création', 'Composants', 'Réplication', 'Distribution', 'ESG', "Prix d'une part", 'Remarque']);
    const heldIsin = new Set(etfs.map((e) => e.isin));
    cat.forEach((c, i) => {
      const r = 5 + i;
      const bg = i % 2 ? BG : undefined;
      const vals: [Value, string | undefined][] = [[c.index, undefined], [c.name, undefined], [c.isin, undefined], [c.ticker || '—', undefined], [c.exchange, undefined], [c.category, undefined],
        [c.ter, PCT2], [c.aumMEur, MEUR], [c.inceptionYear, '0'], [c.holdingsCount, INT], [c.replication || '—', undefined], [c.distribution || '—', undefined],
        [c.esg ? 'Oui' : 'Non', undefined], [c.unitPrice, PRICE], [c.note || '', undefined]];
      vals.forEach(([v, fmt], j) => ca.put(r, 1 + j, v, { fmt, b: j === 0, color: j === 14 ? MODERATE : TEXT, sz: j === 14 ? 8 : 10, h: [3, 6, 8, 12].includes(j) ? 'center' : undefined, bg: j === 0 && heldIsin.has(c.isin) ? SUCCESS_BG : bg }));
    });
    const caLast = 4 + Math.max(cat.length, 1);
    ws.autoFilter = `A4:O${caLast}`;
    wb.define('_xlnm._FilterDatabase', `Catalogue!$A$4:$O$${caLast}`, 7, true);
    ws.freeze = 'B5';
    ca.widths({ A: 30, B: 46, C: 14, D: 8, E: 15, F: 22, G: 8, H: 10, I: 9, J: 11, K: 12, L: 12, M: 6, N: 11, O: 44 });
    ws.cf(`G5:G${caLast}`, { type: 'cellIs', operator: 'lessThanOrEqual', formula: '0.002', dxf: { font: { color: SUCCESS, b: true } } });
  }

  // ================================================================ Tableau de bord
  {
    const ws = dash.ws;
    ws.set(2, 3, f('ValDate'), { font: { sz: 9, b: true, color: 'FFFFFF' }, fill: PETROL, numFmt: DATE, align: { h: 'left', v: 'top' } });
    ws.set(2, 5, 'cours de clôture Euronext Paris', { font: { sz: 9, color: SUB }, fill: PETROL, align: { v: 'top' } });
    wb.define('Epargne', 'SUM(V_Montant)');
    wb.define('Especes', 'MAX(0,SUM(V_Montant)-SUM(A_Debit)+SUM(A_Remb))');
    wb.define('Valorisation', 'TotalTitres+Especes');
    const cards: [string, string, string, string, string, string][] = [
      ['Valorisation totale', 'Valorisation', EUR, 'dont espèces', 'Especes', EUR],
      ['Plus-value latente', 'Valorisation-Epargne', EUR_S, 'rendement global', 'IF(Epargne>0,(Valorisation-Epargne)/Epargne,0)', PCT_S],
      ['Rendement annualisé (TRI)', 'IFERROR(XIRR(TRI_Flux,TRI_Dates),"")', PCT_S, 'virements', 'COUNT(V_Date)', INT],
      ['Montant épargné', 'Epargne', EUR, 'investi en titres', 'SUM(A_Brut)', EUR],
      ['Parts détenues', `Portefeuille!D${pt}`, INT, 'lignes', order.length ? `COUNTIF(Portefeuille!D${p0}:D${pt - 1},">0")` : '0', INT],
      ['Frais nets', 'SUM(A_Frais)-SUM(A_Remb)', EUR, 'remboursés', 'SUM(A_Remb)', EUR],
      ['Frais moyens par achat', 'IFERROR(AVERAGE(A_FraisPct),0)', PCT2, 'part remboursée', 'IF(SUM(A_Frais)>0,SUM(A_Remb)/SUM(A_Frais),0)', '0%'],
      ['Solde espèces', 'Especes', EUR, 'achats enregistrés', 'COUNT(A_Date)', INT],
    ];
    ws.width(1, 2);
    for (let c = 2; c <= 9; c++) ws.width(c, 13.5);
    const gap: [string, string] = ['thick', 'FFFFFF'];
    cards.forEach(([lab, fx, fmt, sublab, subf, subfmt], k) => {
      const row = k < 4 ? 5 : 10;
      const c1 = 2 + 2 * (k % 4), c2 = c1 + 1;
      const hero = k === 0;
      const [bg, fg, sfg] = hero ? [PETROL, 'FFFFFF', 'BFD3D0'] : [BG, TEXT, MODERATE];
      for (let rr = row; rr < row + 4; rr++) {
        ws.set(rr, c1, null, { fill: bg, border: { left: gap } });
        ws.set(rr, c2, null, { fill: bg, border: { right: gap } });
      }
      ws.merge(row, c1, row, c2);
      ws.merge(row + 1, c1, row + 2, c2);
      ws.set(row, c1, lab.toUpperCase(), { font: { sz: 8, b: true, color: sfg }, fill: bg, border: { left: gap }, align: { v: 'bottom', indent: 1 } });
      ws.set(row + 1, c1, f(fx), { font: { sz: 18, b: true, color: fg }, fill: bg, numFmt: fmt, border: { left: gap }, align: { v: 'center', indent: 1 } });
      ws.set(row + 3, c1, sublab, { font: { sz: 8, color: sfg }, fill: bg, border: { left: gap }, align: { v: 'top', indent: 1 } });
      ws.set(row + 3, c2, f(subf), { font: { sz: 8, b: true, color: fg }, fill: bg, numFmt: subfmt, border: { right: gap }, align: { h: 'right', v: 'top', indent: 1 } });
    });
    for (const [rr, h] of [[5, 18], [6, 18], [7, 18], [8, 18], [9, 8], [10, 18], [11, 18], [12, 18], [13, 18]]) ws.height(rr, h);
    ws.cf('D6', { type: 'cellIs', operator: 'lessThan', formula: '0', dxf: { font: { color: CRIT } } });
    ws.cf('D6', { type: 'cellIs', operator: 'greaterThan', formula: '0', dxf: { font: { color: SUCCESS } } });
    dash.section(15, 2, 'Allocation réelle et cible');
    dash.header(16, 2, ['Indice', 'Ticker', 'Valeur', 'Réel', 'Cible', 'Écart', 'À acheter'], 22);
    order.forEach((t, i) => {
      const r = 17 + i, pr = p0 + i;
      dash.put(r, 2, f(`Portefeuille!A${pr}`), { b: true });
      ws.set(r, 3, t, tickerStyle(colors[t] || EXTRA[0]));
      dash.put(r, 4, f(`Portefeuille!H${pr}`), { fmt: EUR });
      dash.put(r, 5, f(`Portefeuille!K${pr}`), { fmt: PCT1, h: 'center' });
      dash.put(r, 6, f(`Portefeuille!L${pr}`), { fmt: PCT1, h: 'center' });
      dash.put(r, 7, f(`Portefeuille!M${pr}`), { fmt: PTS, h: 'center' });
      dash.put(r, 8, f(`Portefeuille!P${pr}`), { fmt: INT, h: 'center', b: true, color: PRIMARY });
    });
    const tl = 16 + Math.max(order.length, 1);
    if (order.length) {
      ws.cf(`G17:G${tl}`, { type: 'cellIs', operator: 'lessThan', formula: '-5', dxf: { font: { color: CRIT, b: true } } });
      ws.cf(`G17:G${tl}`, { type: 'cellIs', operator: 'greaterThan', formula: '5', dxf: { font: { color: '8A4B00', b: true } } });
      const D = (c: string) => `'Tableau de bord'!$${c}$17:$${c}$${tl}`;
      ws.chart({ kind: 'doughnut', title: 'Répartition réelle', at: [tl + 2, 2], size: [10, 7.5], legend: 'r', catText: true, hole: 58,
        series: [{ val: D('E'), cat: D('C'), color: PRIMARY, points: order.map((t) => colors[t] || EXTRA[0]) }] });
      ws.chart({ kind: 'col', title: 'Réel et cible par ETF', at: [tl + 2, 6], size: [13, 7.5], legend: 'b', catText: true, valFmt: '0%', gap: 80,
        series: [
          { nameRef: `'Tableau de bord'!$E$16`, val: D('E'), cat: D('C'), color: PRIMARY },
          { nameRef: `'Tableau de bord'!$F$16`, val: D('F'), cat: D('C'), color: DIVIDER },
        ] });
    }
    if (months.length) ws.chart(evolutionChart(`'Évolution'`, mLast, cV, [tl + 18, 2], [23.5, 8]));
    const leg = tl + 35;
    ws.set(leg, 2, 'Mode d’emploi', { font: { sz: 9, b: true, color: NEUTRAL } });
    ['Les cellules en bleu se saisissent (Historique, Mes ETF, Cours, Compositions, Simulateur) ; tout le reste se calcule.',
      'Valorisation = valeur des titres au dernier cours + solde espèces. Solde espèces = virements − débits courtier + remboursements de frais.',
      'TRI : taux de rendement interne annualisé sur les virements (XIRR, base 365 jours).',
      `Fichier exporté par PEAnalyze le ${new Date().toLocaleDateString('fr-FR')} (cours au ${vd.split('-').reverse().join('/')}) : les données de l’application font foi.`,
    ].forEach((n, i) => ws.set(leg + 1 + i, 2, '• ' + n, { font: { sz: 8, color: MODERATE } }));
  }
  return wb;
}

function evolutionChart(sheet: string, mLast: number, cV: number, at: [number, number], size: [number, number]) {
  const col = (c: number) => `${sheet}!$${L(c)}$5:$${L(c)}$${mLast}`;
  return {
    kind: 'line' as const, title: 'Montant épargné et valeur réelle', at, size, legend: 'b' as const, catFmt: 'mmm yy', valFmt: '#,##0 "€"',
    series: [
      { nameRef: `${sheet}!$D$4`, cat: col(1), val: col(4), color: MODERATE, line: { w: 19050, dash: 'dash' } },
      { nameRef: `${sheet}!$${L(cV)}$4`, cat: col(1), val: col(cV), color: PRIMARY, line: { w: 28575 } },
    ],
  };
}

/** Fichier .xlsx prêt à télécharger. */
export async function exportPeanalyzeXlsx(data: AppData, catalogDate = ''): Promise<Blob> {
  return buildPeanalyzeWorkbook(data, catalogDate).zip().generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
