// Générateur .xlsx minimal (Office Open XML) : valeurs, formules, styles, fusions, volets figés,
// mises en forme conditionnelles, listes déroulantes, noms définis, filtres et graphiques (courbes, barres, anneau).
// Sans dépendance hors JSZip ; la structure suit l'ordre imposé par le schéma pour rester lisible par Excel et LibreOffice.
import JSZip from 'jszip';

export interface Style {
  font?: { sz?: number; b?: boolean; i?: boolean; color?: string };
  fill?: string;
  border?: { left?: [string, string]; right?: [string, string]; top?: [string, string]; bottom?: [string, string] }; // [style, couleur]
  numFmt?: string;
  align?: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'center' | 'bottom'; wrap?: boolean; indent?: number };
}
export interface Dxf { font?: { b?: boolean; color?: string; sz?: number }; fill?: string }
export type Value = string | number | boolean | Date | null | undefined | { f: string };

const FONT_NAME = 'Arial';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const argb = (c: string) => 'FF' + c.replace('#', '').toUpperCase();

export function colName(c: number): string {
  let s = '';
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
export const ref = (r: number, c: number) => colName(c) + r;
export function excelDate(d: Date | string): number {
  const t = typeof d === 'string' ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return (t - Date.UTC(1899, 11, 30)) / 86400000;
}

// ------------------------------------------------------------------ styles
class StyleBook {
  numFmts: string[] = [];
  fonts: string[] = [`<font><sz val="10"/><color rgb="FF19212D"/><name val="${FONT_NAME}"/><family val="2"/></font>`];
  fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  dxfs: string[] = [];
  private cache = new Map<string, number>();
  private idx(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }
  xf(s?: Style): number {
    if (!s) return 0;
    const key = JSON.stringify(s);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const f = s.font || {};
    const fontId = this.idx(this.fonts, `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}<sz val="${f.sz || 10}"/><color rgb="${argb(f.color || '19212D')}"/><name val="${FONT_NAME}"/><family val="2"/></font>`);
    const fillId = s.fill ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const side = (k: 'left' | 'right' | 'top' | 'bottom') => {
      const b = s.border?.[k];
      return b ? `<${k} style="${b[0]}"><color rgb="${argb(b[1])}"/></${k}>` : `<${k}/>`;
    };
    const borderId = s.border ? this.idx(this.borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`) : 0;
    let numFmtId = 0;
    if (s.numFmt) {
      const i = this.numFmts.indexOf(s.numFmt);
      numFmtId = 164 + (i >= 0 ? i : this.numFmts.push(s.numFmt) - 1);
    }
    const a = s.align;
    const align = a ? `<alignment${a.h ? ` horizontal="${a.h}"` : ''}${a.v ? ` vertical="${a.v}"` : ''}${a.wrap ? ' wrapText="1"' : ''}${a.indent ? ` indent="${a.indent}"` : ''}/>` : '';
    const xml = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`;
    const id = this.idx(this.xfs, xml);
    this.cache.set(key, id);
    return id;
  }
  dxf(d: Dxf): number {
    const font = d.font ? `<font>${d.font.b ? '<b/>' : ''}${d.font.color ? `<color rgb="${argb(d.font.color)}"/>` : ''}</font>` : '';
    const fill = d.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(d.fill)}"/><bgColor rgb="${argb(d.fill)}"/></patternFill></fill>` : '';
    return this.idx(this.dxfs, `<dxf>${font}${fill}</dxf>`);
  }
  xml(): string {
    const nf = this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + (nf ? `<numFmts count="${this.numFmts.length}">${nf}</numFmts>` : '')
      + `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>`
      + `<fills count="${this.fills.length}">${this.fills.join('')}</fills>`
      + `<borders count="${this.borders.length}">${this.borders.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + `<dxfs count="${this.dxfs.length}">${this.dxfs.join('')}</dxfs>`
      + '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
  }
}

// ------------------------------------------------------------------ graphiques
export interface Series { name?: string; nameRef?: string; cat?: string; val: string; color: string; line?: { w: number; dash?: string }; points?: string[] }
export interface ChartSpec {
  kind: 'line' | 'col' | 'bar' | 'doughnut';
  title: string;
  series: Series[];
  at: [number, number]; // [ligne, colonne] (base 1) du coin supérieur gauche
  size: [number, number]; // cm
  legend?: 'b' | 'r' | null;
  catText?: boolean; // catégories textuelles (sinon numériques / dates)
  catFmt?: string;
  valFmt?: string;
  reverse?: boolean;
  gap?: number;
  tickSkip?: number;
  hole?: number;
}

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
function txPr(sz: number, color: string, b = false) {
  return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"${b ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${FONT_NAME}"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
}
function chartXml(ch: ChartSpec): string {
  const title = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"><a:solidFill><a:srgbClr val="19212D"/></a:solidFill><a:latin typeface="${FONT_NAME}"/></a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR" sz="1100" b="1"><a:solidFill><a:srgbClr val="19212D"/></a:solidFill><a:latin typeface="${FONT_NAME}"/></a:rPr><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  const ser = ch.series.map((s, i) => {
    const tx = s.nameRef ? `<c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f></c:strRef></c:tx>` : s.name ? `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>` : '';
    let sp: string;
    if (ch.kind === 'line') {
      sp = `<c:spPr><a:ln w="${s.line?.w ?? 22000}" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${s.line?.dash ? `<a:prstDash val="${s.line.dash}"/>` : ''}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>`;
    } else if (ch.kind === 'doughnut') {
      sp = (s.points || []).map((c, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
    } else {
      sp = `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>`;
    }
    const cat = s.cat ? (ch.catText ? `<c:cat><c:strRef><c:f>${esc(s.cat)}</c:f></c:strRef></c:cat>` : `<c:cat><c:numRef><c:f>${esc(s.cat)}</c:f></c:numRef></c:cat>`) : '';
    const val = `<c:val><c:numRef><c:f>${esc(s.val)}</c:f></c:numRef></c:val>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${sp}${cat}${val}${ch.kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  }).join('');
  const axLine = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="EDEEF1"/></a:solidFill></a:ln></c:spPr>';
  const horiz = ch.kind === 'bar';
  const catAx = `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="${ch.reverse ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'l' : 'b'}"/>`
    + (ch.catFmt ? `<c:numFmt formatCode="${esc(ch.catFmt)}" sourceLinked="0"/>` : '')
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txPr(800, '666E8A')}<c:crossAx val="100"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>`
    + (ch.tickSkip ? `<c:tickLblSkip val="${ch.tickSkip}"/><c:tickMarkSkip val="${ch.tickSkip}"/>` : '') + '<c:noMultiLvlLbl val="0"/></c:catAx>';
  const valAx = `<c:valAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? (ch.reverse ? 't' : 'b') : 'l'}"/>`
    + `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="EDEEF1"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`
    + `<c:numFmt formatCode="${esc(ch.valFmt || 'General')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800, '666E8A')}<c:crossAx val="10"/><c:crosses val="${horiz && ch.reverse ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  let plot: string;
  if (ch.kind === 'line') plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="10"/><c:axId val="100"/></c:lineChart>${catAx}${valAx}`;
  else if (ch.kind === 'doughnut') plot = `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="${ch.hole ?? 58}"/></c:doughnutChart>`;
  else plot = `<c:barChart><c:barDir val="${horiz ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="${ch.gap ?? 80}"/><c:axId val="10"/><c:axId val="100"/></c:barChart>${catAx}${valAx}`;
  const legend = ch.legend === null ? '' : `<c:legend><c:legendPos val="${ch.legend || 'b'}"/><c:overlay val="0"/>${txPr(800, '465266')}</c:legend>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ${A} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<c:roundedCorners val="0"/><c:chart>${title}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
    + `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, '19212D')}</c:chartSpace>`;
}

// ------------------------------------------------------------------ feuilles
interface Cell { v: Value; s: number }
interface CfRule { type: 'cellIs' | 'expression' | 'dataBar'; operator?: string; formula?: string; dxf?: number; color?: string }

export class Sheet {
  rows = new Map<number, Map<number, Cell>>();
  widths = new Map<number, number>();
  hidden = new Set<number>();
  heights = new Map<number, number>();
  merges: string[] = [];
  cfs: { sqref: string; rules: CfRule[] }[] = [];
  dvs: { sqref: string; list: string }[] = [];
  charts: ChartSpec[] = [];
  freeze?: string;
  tab?: string;
  autoFilter?: string;
  constructor(public wb: Workbook, public name: string) {}

  set(r: number, c: number, v: Value, s?: Style): this {
    let row = this.rows.get(r);
    if (!row) { row = new Map(); this.rows.set(r, row); }
    row.set(c, { v, s: this.wb.styles.xf(s) });
    return this;
  }
  /** Applique un style sans changer la valeur. */
  style(r: number, c: number, s: Style): this {
    const cur = this.rows.get(r)?.get(c);
    return this.set(r, c, cur ? cur.v : null, s);
  }
  width(c: number | string, w: number): this { this.widths.set(typeof c === 'number' ? c : colIndex(c), w); return this; }
  height(r: number, h: number): this { this.heights.set(r, h); return this; }
  merge(r1: number, c1: number, r2: number, c2: number): this { this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`); return this; }
  cf(sqref: string, rule: Omit<CfRule, 'dxf'> & { dxf?: Dxf }): this {
    const r: CfRule = { ...rule, dxf: rule.dxf ? this.wb.styles.dxf(rule.dxf) : undefined };
    const g = this.cfs.find((x) => x.sqref === sqref);
    if (g) g.rules.push(r); else this.cfs.push({ sqref, rules: [r] });
    return this;
  }
  validation(sqref: string, list: string): this { this.dvs.push({ sqref, list }); return this; }
  chart(c: ChartSpec): this { this.charts.push(c); return this; }

  xml(drawingRid?: string): string {
    let maxR = 1, maxC = 1;
    const rowsXml: string[] = [];
    for (const r of Array.from(new Set([...this.rows.keys(), ...this.heights.keys()])).sort((a, b) => a - b)) {
      const row = this.rows.get(r) || new Map<number, Cell>();
      const cells: string[] = [];
      for (const c of Array.from(row.keys()).sort((a, b) => a - b)) {
        const { v, s } = row.get(c)!;
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
        const at = `r="${ref(r, c)}"${s ? ` s="${s}"` : ''}`;
        if (v === null || v === undefined || v === '') cells.push(`<c ${at}/>`);
        else if (typeof v === 'object' && !(v instanceof Date)) cells.push(`<c ${at}><f>${esc(v.f.replace(/^=/, ''))}</f></c>`);
        else if (v instanceof Date) cells.push(`<c ${at}><v>${excelDate(v)}</v></c>`);
        else if (typeof v === 'number') cells.push(isFinite(v) ? `<c ${at}><v>${v}</v></c>` : `<c ${at}/>`);
        else if (typeof v === 'boolean') cells.push(`<c ${at} t="b"><v>${v ? 1 : 0}</v></c>`);
        else cells.push(`<c ${at} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
      const h = this.heights.get(r);
      rowsXml.push(`<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells.join('')}</row>`);
    }
    let pane = '';
    if (this.freeze) {
      const m = /^([A-Z]+)(\d+)$/.exec(this.freeze)!;
      const xs = colIndex(m[1]) - 1, ys = +m[2] - 1;
      const active = xs && ys ? 'bottomRight' : ys ? 'bottomLeft' : 'topRight';
      pane = `<pane${xs ? ` xSplit="${xs}"` : ''}${ys ? ` ySplit="${ys}"` : ''} topLeftCell="${this.freeze}" activePane="${active}" state="frozen"/><selection pane="${active}" activeCell="${this.freeze}" sqref="${this.freeze}"/>`;
    }
    const cols = Array.from(new Set([...this.widths.keys(), ...this.hidden])).sort((a, b) => a - b)
      .map((c) => `<col min="${c}" max="${c}" width="${this.widths.get(c) ?? 9}" customWidth="1"${this.hidden.has(c) ? ' hidden="1"' : ''}/>`).join('');
    let prio = 1;
    const cf = this.cfs.map((g) => `<conditionalFormatting sqref="${g.sqref}">${g.rules.map((r) => {
      const p = prio++;
      if (r.type === 'dataBar') return `<cfRule type="dataBar" priority="${p}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="${argb(r.color || '9FD0C7')}"/></dataBar></cfRule>`;
      if (r.type === 'expression') return `<cfRule type="expression" dxfId="${r.dxf}" priority="${p}"><formula>${esc(r.formula!)}</formula></cfRule>`;
      return `<cfRule type="cellIs" dxfId="${r.dxf}" priority="${p}" operator="${r.operator}"><formula>${esc(r.formula!)}</formula></cfRule>`;
    }).join('')}</conditionalFormatting>`).join('');
    const dv = this.dvs.length ? `<dataValidations count="${this.dvs.length}">${this.dvs.map((d) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${d.sqref}"><formula1>${esc(d.list)}</formula1></dataValidation>`).join('')}</dataValidations>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetPr>${this.tab ? `<tabColor rgb="${argb(this.tab)}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>`
      + `<dimension ref="A1:${ref(maxR, maxC)}"/>`
      + `<sheetViews><sheetView showGridLines="0" workbookViewId="0"${this.wb.sheets[0] === this ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + (cols ? `<cols>${cols}</cols>` : '')
      + `<sheetData>${rowsXml.join('')}</sheetData>`
      + (this.autoFilter ? `<autoFilter ref="${this.autoFilter}"/>` : '')
      + (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
      + cf + dv
      + '<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
      + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
      + (drawingRid ? `<drawing r:id="${drawingRid}"/>` : '')
      + '</worksheet>';
  }
}

export function colIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

// ------------------------------------------------------------------ classeur
export class Workbook {
  styles = new StyleBook();
  sheets: Sheet[] = [];
  names: { name: string; ref: string; local?: number; hidden?: boolean }[] = [];

  sheet(name: string): Sheet {
    const s = new Sheet(this, name);
    this.sheets.push(s);
    return s;
  }
  define(name: string, refers: string, local?: number, hidden?: boolean): void {
    this.names.push({ name, ref: refers, local, hidden });
  }

  zip(): JSZip {
    const z = new JSZip();
    const ct: string[] = [];
    const wbRels: string[] = [];
    let chartNo = 0;
    this.sheets.forEach((s, i) => {
      const n = i + 1;
      ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      wbRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
      if (s.charts.length) {
        const anchors: string[] = [];
        const dRels: string[] = [];
        s.charts.forEach((c, k) => {
          chartNo++;
          z.file(`xl/charts/chart${chartNo}.xml`, chartXml(c));
          ct.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
          dRels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`);
          anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${c.at[1] - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.at[0] - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(c.size[0] * 360000)}" cy="${Math.round(c.size[1] * 360000)}"/>`
            + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Graphique ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
            + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`);
        });
        z.file(`xl/drawings/drawing${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ${A} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`);
        z.file(`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${dRels.join('')}</Relationships>`);
        ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        z.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
        z.file(`xl/worksheets/sheet${n}.xml`, s.xml('rId1'));
      } else {
        z.file(`xl/worksheets/sheet${n}.xml`, s.xml());
      }
    });
    const ns = this.sheets.length;
    wbRels.push(`<Relationship Id="rId${ns + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    const sheetsXml = this.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
    const namesXml = this.names.length ? `<definedNames>${this.names.map((d) => `<definedName name="${d.name}"${d.local !== undefined ? ` localSheetId="${d.local}"` : ''}${d.hidden ? ' hidden="1"' : ''}>${esc(d.ref)}</definedName>`).join('')}</definedNames>` : '';
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetsXml}</sheets>${namesXml}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
    z.file('xl/styles.xml', this.styles.xml());
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PEAnalyze</dc:title><dc:creator>PEAnalyze</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    z.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PEAnalyze</Application></Properties>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + ct.join('') + '</Types>');
    return z;
  }
}
