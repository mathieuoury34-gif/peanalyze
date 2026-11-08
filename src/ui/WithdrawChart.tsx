// Courbe du capital avec retraits : trajectoire constante, fourchette Monte Carlo (10e–90e centile), début des retraits, épuisement.
import { useState, type ReactNode } from 'react';
import { useWidth } from './kit';
import { hoverIndex } from './charts';
import { niceStep } from '../domain/calc';
import { eur, NBSP } from '../domain/format';
import { lang, t } from '../i18n';
import type { YearPoint } from '../domain/withdraw';

const AXIS = 36;

function kEur(v: number): string {
  if (lang === 'en') return '€' + (v >= 1000 ? (v / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v)));
  return (v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + NBSP + 'k' : String(Math.round(v))) + NBSP + '€';
}

export interface Band { p10: number[]; p50: number[]; p90: number[] }

export function WithdrawChart({ points, band, startYear, depletedYear, label }: { points: YearPoint[]; band?: Band; startYear: number | null; depletedYear: number | null; label: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  if (n < 2) return <div ref={ref} className="chart c-moderate t-caption" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t('Pas assez de données pour tracer la courbe.')}</div>;
  const horizon = points[n - 1].year || 1;
  const W = cw - AXIS, H = 170, T = 8, B = T + H;
  const bandOk = !!band && band.p90.length === n;
  // l'échelle suit la trajectoire ; la fourchette Monte Carlo peut la dépasser (rognée à 3 fois la trajectoire pour rester lisible)
  let det = 1, hiBand = 0;
  for (let i = 0; i < n; i++) { det = Math.max(det, points[i].value, points[i].withdrawn); if (bandOk) hiBand = Math.max(hiBand, band!.p90[i]); }
  const mx = Math.max(det, Math.min(hiBand, det * 3));
  const step = niceStep(mx / 4);
  const top = Math.ceil(mx / step) * step;
  const X = (y: number) => (y / horizon) * W;
  const Y = (v: number) => T + H - (Math.min(Math.max(v, 0), top) / top) * H;
  const path = (f: (i: number) => number) => points.map((p, i) => (i ? 'L' : 'M') + X(p.year).toFixed(1) + ',' + Y(f(i)).toFixed(1)).join(' ');
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (let v = step; v <= top + 1e-6; v += step) {
    grid += 'M0,' + Y(v).toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{kEur(v)}</span>);
  }
  const half = Math.round(horizon / 2);
  const xTicks = ([[0, { left: 0 }], ...(half > 0 && half < horizon ? [[half, { left: X(half) - 30, width: 60, textAlign: 'center' }]] : []), [horizon, { right: AXIS }]] as [number, React.CSSProperties][]);
  const h = hoverIndex(hover, n); // l'index mémorisé peut dépasser le nombre de points après un changement d'horizon
  const hp = points[h];
  const hx = X(hp.year);
  const tipLeft = Math.min(Math.max(hx - 80, 0), Math.max(W - 160, 0));
  const bandPath = bandOk
    ? points.map((p, i) => (i ? 'L' : 'M') + X(p.year).toFixed(1) + ',' + Y(band!.p90[i]).toFixed(1)).join(' ') + ' ' +
      points.map((_, i) => 'L' + X(points[n - 1 - i].year).toFixed(1) + ',' + Y(band!.p10[n - 1 - i]).toFixed(1)).join(' ') + ' Z'
    : '';
  const medPath = bandOk ? path((i) => band!.p50[i]) : '';
  const sx = startYear !== null && startYear - 1 >= 0 && startYear - 1 <= horizon ? X(startYear - 1) : null; // début de l'année `startYear` = fin de l'année précédente
  const dx = depletedYear !== null ? X(Math.min(depletedYear, horizon)) : null;
  return (
    <div ref={ref} className="chart" data-component="WithdrawChart" style={{ height: 204 }}>
      <svg viewBox={`0 0 ${cw} 204`} width={cw} height="204" role="img" aria-label={label}>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        {bandPath && <path d={bandPath} style={{ fill: 'var(--chart-value)', opacity: 0.22 }} />}
        {medPath && <path d={medPath} fill="none" strokeWidth="1.5" strokeDasharray="4 3" style={{ stroke: 'var(--chart-value)' }} />}
        <path d={path((i) => points[i].value) + ` L${X(horizon)},${B} L0,${B} Z`} style={{ fill: 'var(--chart-value-area)' }} />
        <path d={path((i) => points[i].value)} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--brand-primary)' }} />
        <path d={path((i) => points[i].withdrawn)} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: 'var(--chart-6)' }} />
        {sx !== null && <line x1={sx} x2={sx} y1={T} y2={B} strokeWidth="1.5" strokeDasharray="4 3" style={{ stroke: 'var(--text-moderate)' }} />}
        {dx !== null && <circle cx={dx} cy={B} r="5" style={{ fill: 'var(--critical)' }} />}
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicks.map(([y, st], i) => <span key={'x' + i} className="tick" style={{ top: 186, ...st }}>{t('an {y}', { y })}</span>)}
      <div className="cross" style={{ top: T, height: H, left: hx, borderLeftColor: 'var(--text)' }} />
      <div className="hit" style={{ width: W, height: B }}
        onPointerMove={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setHover(Math.round(Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1) * (n - 1))); }}
        onPointerDown={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setHover(Math.round(Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1) * (n - 1))); }} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ minWidth: 160, top: 12, left: tipLeft }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{t('Année {y}', { y: hp.year })}</span>
        <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{eur(hp.value, 0)}</span>
        <span className="t-caption" style={{ color: 'var(--brand-light-green)' }}>{t('Retraits cumulés {v}', { v: eur(hp.withdrawn, 0) })}</span>
        {bandOk && <span className="t-caption c-reverse-muted">{t('Scénarios : {a} à {b}', { a: eur(band!.p10[h], 0), b: eur(band!.p90[h], 0) })}</span>}
      </div>
    </div>
  );
}
