// Graphiques SVG (planche Handoff §3) – largeur fluide, mêmes proportions que les maquettes.
import { useState, type ReactNode } from 'react';
import { useWidth } from './kit';
import { niceStep } from '../domain/calc';
import { dateFr, num, NBSP, monthShort, eur, MONTHS_ABBR as MONTHS } from '../domain/format';
import { lang, t } from '../i18n';
const AXIS = 36; // largeur réservée aux graduations à droite

function hoverFromEvent(ev: React.PointerEvent<HTMLDivElement>, n: number): number {
  const rect = ev.currentTarget.getBoundingClientRect();
  const ratio = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1);
  return Math.round(ratio * (n - 1));
}

function kEur(v: number): string {
  if (lang === 'en') return '€' + (v >= 1000 ? (v / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v)));
  return (v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + NBSP + 'k' : String(Math.round(v))) + NBSP + '€';
}

// ------------------------------------------------------------------ Sparkline
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  if (values.length < 2) return <div ref={ref} style={{ height: 'var(--sparkline-height)' }} />;
  const step = Math.max(1, Math.round(values.length / 62));
  const pts = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const X = (i: number) => (i / (pts.length - 1)) * w;
  const Y = (v: number) => (hi === lo ? 20 : 38 - ((v - lo) / (hi - lo)) * 36);
  const d = pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  return (
    <div ref={ref} style={{ height: 'var(--sparkline-height)' }}>
      <svg viewBox={`0 0 ${w} 40`} width={w} height="40" aria-hidden="true" data-component="Sparkline" style={{ display: 'block', overflow: 'visible' }}>
        <path d={d} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ PriceChart (T1-02)
export interface Buy { date: string; quantity: number; unitPrice: number }

export function PriceChart({ history, start, buys, pru, color, label, emptyText }: { history: [string, number][]; start: number; buys: Buy[]; pru?: number; color: string; label: string; emptyText?: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const s = Math.min(start, Math.max(history.length - 2, 0));
  const e = history.length - 1;
  if (history.length < 2) {
    return <div ref={ref} className="chart c-moderate t-caption" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 var(--space-16)' }}>{emptyText || t('Historique indisponible')}</div>;
  }
  const W = cw - AXIS, H = 180, T = 8, B = T + H;
  let lo = Infinity, hi = -Infinity;
  for (let i = s; i <= e; i++) { lo = Math.min(lo, history[i][1]); hi = Math.max(hi, history[i][1]); }
  const pad = Math.max((hi - lo) * 0.08, 0.2); lo -= pad; hi += pad;
  const X = (i: number) => ((i - s) / (e - s)) * W;
  const Y = (p: number) => T + H - ((p - lo) / (hi - lo)) * H;
  let line = '';
  for (let i = s; i <= e; i++) line += (i === s ? 'M' : 'L') + X(i).toFixed(1) + ',' + Y(history[i][1]).toFixed(1) + ' ';
  const area = line + 'L' + W + ',' + B + ' L0,' + B + ' Z';
  const step = niceStep((hi - lo) / 4);
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = Y(v);
    grid += 'M0,' + y.toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={v} className="tick" style={{ left: W + 6, top: y - 9 }}>{eur(v, step < 1 ? 1 : 0)}</span>);
  }
  const days = (Date.parse(history[e][0]) - Date.parse(history[s][0])) / 864e5;
  const tickIdx = Array.from(new Set([0, 1, 2, 3].map((k) => Math.round(s + ((e - s) * k) / 3))));
  const xTicks = tickIdx.map((i, k) => {
    const d = history[i][0];
    const lab = days <= 100 ? d.slice(8, 10) + '/' + d.slice(5, 7) : MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(2, 4);
    const st: React.CSSProperties = k === 0 ? { left: 0 } : k === tickIdx.length - 1 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' };
    return <span key={k} className="tick" style={{ top: 194, ...st }}>{lab}</span>;
  });
  const buyIdx = buys.map((b) => ({ i: history.findIndex((p) => p[0] >= b.date), b })).filter((x) => x.i >= s && x.i <= e);
  let h = hover;
  if (h === null || h < s || h > e) h = buyIdx.length ? buyIdx[buyIdx.length - 1].i : e;
  const hb = buyIdx.filter((x) => x.i === h);
  const hx = X(h), hy = Y(history[h][1]);
  const tipLeft = Math.min(Math.max(hx - 70, 0), cw - 150);
  const tipTop = hy > 110 ? hy - 86 : hy + 14;
  const showPru = pru !== undefined && pru >= lo && pru <= hi;
  return (
    <div ref={ref} className="chart" data-component="PriceChart" style={{ height: 216 }}>
      <svg viewBox={`0 0 ${cw} 216`} width={cw} height="216" role="img" aria-label={label}>
        <defs>
          <linearGradient id="pc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.22 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={area} fill="url(#pc-grad)" />
        <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: color }} />
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicks}
      {showPru && (
        <>
          <div style={{ position: 'absolute', left: 0, width: W, height: 0, borderTop: '2px dashed var(--chart-pru)', pointerEvents: 'none', top: Y(pru!) }} />
          <span className="badge" style={{ position: 'absolute', left: 4, top: Y(pru!) + 4, color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '0 var(--space-6)', pointerEvents: 'none' }}>{t('PRU')} {eur(pru!)}</span>
        </>
      )}
      <div className="cross" style={{ top: T, height: H, left: hx }} />
      {buyIdx.map((x, k) => (
        <span key={k} aria-hidden="true" className="marker-dot" style={{ background: 'var(--bg-surface)', border: '2px solid var(--brand-primary)', left: X(x.i) - 5, top: Y(history[x.i][1]) - 5 }} />
      ))}
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(ev) => setHover(s + hoverFromEvent(ev, e - s + 1))} onPointerDown={(ev) => setHover(s + hoverFromEvent(ev, e - s + 1))} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ minWidth: 120, left: tipLeft, top: tipTop }}>
        <span className="t-caption c-reverse-muted">{dateFr(history[h][0])}</span>
        <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{eur(history[h][1], 2, 4)}</span>
        {hb.map((x, k) => <span key={k} className="t-caption-strong" style={{ color: 'var(--brand-light-green)' }}>{t('Achat : {q} × {p}', { q: x.b.quantity, p: eur(x.b.unitPrice, 2, 4) })}</span>)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ AreaComparisonChart (T2-01)
export function AreaComparisonChart({ points }: { points: { month: string; deposited: number; value: number }[] }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  if (n < 2) {
    return (
      <div ref={ref} className="stack-4 t-caption c-neutral">
        {points.map((p) => <span key={p.month}>{t('{m} : épargné {d}, valeur {v}', { m: monthShort(p.month), d: eur(p.deposited), v: eur(p.value) })}</span>)}
      </div>
    );
  }
  const W = cw - AXIS, H = 150, T = 8, B = T + H;
  const mx = Math.max(...points.map((p) => Math.max(p.deposited, p.value)), 1);
  const step = niceStep(mx / 3);
  const top = Math.ceil(mx / step) * step;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => T + H - (v / top) * H;
  const path = (k: 'deposited' | 'value') => points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ');
  const valLine = path('value'), depLine = path('deposited');
  let gap = points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(Math.max(p.value, p.deposited)).toFixed(1)).join(' ');
  for (let i = n - 1; i >= 0; i--) gap += ' L' + X(i).toFixed(1) + ',' + Y(points[i].deposited).toFixed(1);
  gap += ' Z';
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (let v = step; v <= top + 1e-6; v += step) {
    grid += 'M0,' + Y(v).toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{kEur(v)}</span>);
  }
  const picks = Array.from(new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]));
  const xTicks = picks.map((i, k) => (
    <span key={k} className="tick" style={{ top: 166, ...(k === 0 ? { left: 0 } : k === picks.length - 1 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' as const }) }}>{monthShort(points[i].month)}</span>
  ));
  const h = hover === null ? n - 1 : hover;
  const hx = X(h);
  const tipLeft = Math.min(Math.max(hx - 64, 0), W - 128);
  return (
    <div ref={ref} className="chart" data-component="AreaComparisonChart" style={{ height: 186 }}>
      <svg viewBox={`0 0 ${cw} 186`} width={cw} height="186" role="img" aria-label={t('Montant épargné et valeur réelle de {a} à {b} : {d} épargnés, valeur {v}', { a: monthShort(points[0].month), b: monthShort(points[n - 1].month), d: eur(points[n - 1].deposited), v: eur(points[n - 1].value) })}>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={valLine + ` L${W},${B} L0,${B} Z`} style={{ fill: 'var(--chart-value-area)' }} />
        <path d={gap} style={{ fill: 'var(--chart-gain-area)' }} />
        <path d={depLine} fill="none" strokeWidth="2" strokeDasharray="4 3" style={{ stroke: 'var(--chart-deposited-line)' }} />
        <path d={valLine} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--chart-value)' }} />
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicks}
      <div className="cross" style={{ top: T, height: H, left: hx }} />
      <span aria-hidden="true" className="marker-dot" style={{ background: 'var(--chart-value)', border: '2px solid var(--bg-surface)', left: hx - 5, top: Y(points[h].value) - 5 }} />
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(ev) => setHover(hoverFromEvent(ev, n))} onPointerDown={(ev) => setHover(hoverFromEvent(ev, n))} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ minWidth: 128, left: tipLeft, top: Y(points[h].value) > 80 ? 8 : 90 }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{monthShort(points[h].month)}</span>
        <span className="t-caption c-reverse-muted">{t('Épargné {v}', { v: eur(points[h].deposited) })}</span>
        <span className="t-caption" style={{ color: 'var(--text-reverse)' }}>{t('Valeur {v}', { v: eur(points[h].value) })}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Donuts
export interface Slice { value: number; color: string }

function rings(slices: Slice[], r: number, c: number, width: number, key: string) {
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const visible = slices.filter((x) => x.value > 0);
  const gap = visible.length > 1 ? 2 : 0;
  let off = 0;
  return visible.map((x, i) => {
    const len = Math.max((x.value / total) * C - gap, 0.5);
    const el = <circle key={key + i} cx={c} cy={c} r={r} fill="none" strokeWidth={width} strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform={`rotate(-90 ${c} ${c})`} style={{ stroke: x.color }} />;
    off += len + gap;
    return el;
  });
}

export function Donut({ slices, size = 160, ring = 24, label, children }: { slices: Slice[]; size?: number; ring?: number; label: string; children?: ReactNode }) {
  const c = size / 2, r = c - ring / 2 - 4;
  return (
    <div className="donut-wrap" style={{ width: size, height: size, alignSelf: 'center' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} data-component="DonutChart">
        {slices.some((s) => s.value > 0)
          ? rings(slices, r, c, ring, 'd')
          : <circle cx={c} cy={c} r={r} fill="none" strokeWidth={ring} style={{ stroke: 'var(--bg-grey-minimal)' }} />}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}

export function DoubleDonut({ outer, inner, showOuter, showInner, label, children, size = 180 }: { outer: Slice[]; inner: Slice[]; showOuter: boolean; showInner: boolean; label: string; children?: ReactNode; size?: number }) {
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" width={size} height={size} role="img" aria-label={label} data-component="DonutChart.double">
        <g opacity={showOuter ? 1 : 0} style={{ transition: 'opacity .2s' }}>{rings(outer, 76, 90, 20, 'o')}</g>
        <g opacity={showInner ? 1 : 0} style={{ transition: 'opacity .2s' }}>{rings(inner, 50, 90, 14, 'i')}</g>
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ StackedAreaChart (T4-01)
export function StackedAreaChart({ years, real, label }: { years: { year: number; value: number; deposited: number }[]; real?: { t: number; value: number }[]; label: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = years.length;
  const horizon = years[n - 1].year || 1;
  const W = cw - AXIS, H = 170, T = 8, B = T + H;
  const mx = Math.max(years[n - 1].value, ...(real || []).map((r) => r.value), 1);
  const step = niceStep(mx / 4);
  const top = Math.ceil(mx / step) * step;
  const X = (y: number) => (y / horizon) * W;
  const Y = (v: number) => T + H - (v / top) * H;
  const line = (k: 'value' | 'deposited') => years.map((p, i) => (i ? 'L' : 'M') + X(p.year).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ');
  const close = ` L${W},${B} L0,${B} Z`;
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (let t = step; t <= top + 1e-6; t += step) {
    grid += 'M0,' + Y(t).toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={t} className="tick" style={{ left: W + 6, top: Y(t) - 9 }}>{kEur(t)}</span>);
  }
  // graduations : début, milieu (seulement s'il est distinct des extrémités) et fin ; clés uniques (évite des étiquettes fantômes)
  const half = Math.round(horizon / 2);
  const xTicks = ([[0, { left: 0 }], ...(half > 0 && half < horizon ? [[half, { left: X(half) - 30, width: 60, textAlign: 'center' }]] : []), [horizon, { right: AXIS }]] as [number, React.CSSProperties][]);
  const h = hover === null ? n - 1 : hover;
  const hp = years[h];
  const hx = X(hp.year);
  const tipLeft = Math.min(Math.max(hx - 70, 0), W - 140);
  const realLine = real && real.length > 1 ? real.map((r, i) => (i ? 'L' : 'M') + X(Math.min(r.t, horizon)).toFixed(1) + ',' + Y(r.value).toFixed(1)).join(' ') : '';
  return (
    <div ref={ref} className="chart" data-component="StackedAreaChart" style={{ height: 204 }}>
      <svg viewBox={`0 0 ${cw} 204`} width={cw} height="204" role="img" aria-label={label}>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={line('value') + close} style={{ fill: 'var(--chart-value)' }} />
        <path d={line('deposited') + close} style={{ fill: 'var(--chart-deposited)' }} />
        {realLine && <path d={realLine} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--chart-6)' }} />}
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicks.map(([y, st], i) => <span key={'x' + i} className="tick" style={{ top: 186, ...st }}>{t('an {y}', { y })}</span>)}
      <div className="cross" style={{ top: T, height: H, left: hx, borderLeftColor: 'var(--text)' }} />
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(ev) => setHover(hoverFromEvent(ev, n))} onPointerDown={(ev) => setHover(hoverFromEvent(ev, n))} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ minWidth: 140, top: 12, left: tipLeft }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{t('Année {y}', { y: hp.year })}</span>
        <span className="t-caption c-reverse-muted">{t('Versements {v}', { v: eur(hp.deposited, 0) })}</span>
        <span className="t-caption" style={{ color: 'var(--brand-light-green)' }}>{t('Intérêts +{v}', { v: eur(hp.value - hp.deposited, 0) })}</span>
        <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{eur(hp.value, 0)}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ barres horizontales
export function HBarList({ rows }: { rows: { label: string; weight: number; isOther?: boolean }[] }) {
  return (
    <ul className="stack" style={{ gap: 'var(--space-10)' }} data-component="HorizontalBarChart">
      {rows.map((r) => (
        <li key={r.label} className="stack-4">
          <span className="between"><span>{r.label}</span><span className="t-strong">{num(r.weight * 100, 1)}{NBSP}%</span></span>
          <span className="hbar"><span style={{ width: Math.min(100, r.weight * 100) + '%', background: r.isOther || r.label === 'Autres' ? 'var(--chart-other)' : 'var(--brand-primary)' }} /></span>
        </li>
      ))}
    </ul>
  );
}
