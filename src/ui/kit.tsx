// Composants partagés (planche Système)
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, Logo } from './icons';
import { back, closeSheet, navigate, tabOf, useRoute, type Tab } from './router';
import { useData } from '../data/store';
import { refreshPrices, usePriceStatus } from '../data/prices';
import { valuationDate } from '../domain/calc';
import { dateFr, dateShort, dateTimeFr, arrow, pctSigned } from '../domain/format';

// ------------------------------------------------------------------ mesure
export function useWidth<T extends HTMLElement>(fallback = 326): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function useScrolled(threshold = 24): boolean {
  const [s, setS] = useState(false);
  useEffect(() => {
    const on = () => setS(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return s;
}

// ------------------------------------------------------------------ en-têtes
export function useUpdatedText(): string {
  const data = useData();
  const s = data.settings.lastPriceUpdate;
  return s ? 'Cours mis à jour le ' + dateTimeFr(s) : 'Cours du ' + dateFr(valuationDate(data));
}

export function AppHeader({ title }: { title: string }) {
  const compact = useScrolled();
  const updated = useUpdatedText();
  const ps = usePriceStatus();
  return (
    <header className={'app-header' + (compact ? ' compact' : '')} data-component="AppHeader">
      <div className="bar">
        <div className="titles">
          <h1>{title}</h1>
          <span className="updated">{updated}</span>
        </div>
        <div className="actions">
          <button type="button" className={'icon-btn' + (ps.loading ? ' spin' : '')} aria-label="Actualiser les cours" onClick={() => refreshPrices({ force: true })} disabled={ps.loading}>
            <Icon name="refresh" />
          </button>
          <a href="#/parametres" className="icon-btn" aria-label="Paramètres" onClick={(e) => { e.preventDefault(); navigate('/parametres'); }}>
            <Icon name="settings" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function SubHeader({ title, fallback, close, bordered, right }: { title: string; fallback: string; close?: boolean; bordered?: boolean; right?: ReactNode }) {
  return (
    <header className={'sub-header' + (bordered ? ' bordered' : '')}>
      <div className="bar">
        <button type="button" className={'icon-btn' + (close ? ' neutral' : '')} aria-label={close ? 'Fermer sans enregistrer' : 'Retour'} onClick={() => back(fallback)}>
          <Icon name={close ? 'close' : 'back'} />
        </button>
        <h1>{title}</h1>
        {right || <span />}
      </div>
    </header>
  );
}

/** Bandeau d'erreur des cours (T0-02). */
export function PriceErrorBanner() {
  const ps = usePriceStatus();
  const data = useData();
  if (!ps.error) return null;
  return (
    <div role="alert" className="banner-error">
      <Icon name="alert" size={20} />
      <span>{ps.error.startsWith('Ajoutez') ? ps.error : 'Cours indisponibles – dernières valeurs du ' + dateShort(valuationDate(data)) + ' (' + ps.error + ')'}</span>
      {ps.error.startsWith('Ajoutez')
        ? <button type="button" onClick={() => navigate('/parametres')}>Paramètres</button>
        : <button type="button" onClick={() => refreshPrices({ force: true })}>Réessayer</button>}
    </div>
  );
}

// ------------------------------------------------------------------ sous-navigation
export function SubNav({ items, label, children, bordered }: { items: { to: string; label: string }[]; label: string; children?: ReactNode; bordered?: boolean }) {
  const route = useRoute();
  return (
    <div className={'subnav' + (bordered ? ' bordered' : '')}>
      <nav aria-label={label} className="seg" data-component="SegmentedControl">
        {items.map((it) => (
          <a key={it.to} href={'#' + it.to} aria-current={route.path === it.to ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); if (route.path !== it.to) navigate(it.to, { replace: true }); }}>
            {it.label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg" data-component="SegmentedControl">
      {options.map(([id, l]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

export function ChipGroup<T extends string>({ value, options, onChange, label, className }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className ?? 'row wrap'} style={className ? undefined : { gap: 'var(--space-6)' }}>
      {options.map(([id, l]) => (
        <button key={id} type="button" className="chip" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ navigation principale
const TABS: { id: Exclude<Tab, 'none'>; label: string; to: string }[] = [
  { id: 'marches', label: 'Marchés', to: '/marches' },
  { id: 'historique', label: 'Historique', to: '/historique' },
  { id: 'portefeuille', label: 'Portefeuille', to: '/portefeuille' },
  { id: 'simulateur', label: 'Simulateur', to: '/simulateur' },
];

export function TabBar() {
  const route = useRoute();
  const active = tabOf(route.path);
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); if (route.path !== to) navigate(to); };
  return (
    <>
      <nav aria-label="Navigation principale" className="tabbar" data-component="TabBar">
        {TABS.map((t) => (
          <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
            <span className="pill"><Icon name={t.id} /></span>
            {t.label}
          </a>
        ))}
      </nav>
      <aside className="sidenav" aria-label="Navigation principale">
        <Logo size={20} />
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
              <Icon name={t.id} />{t.label}
            </a>
          ))}
          <a href="#/parametres" aria-current={route.path.startsWith('/parametres') ? 'page' : undefined} onClick={go('/parametres')}>
            <Icon name="settings" />Paramètres
          </a>
        </nav>
        <SyncFoot />
      </aside>
    </>
  );
}

function SyncFoot() {
  const updated = useUpdatedText();
  return <div className="foot">{updated}</div>;
}

export function Fab({ onClick, label = 'Ajouter un virement ou un achat' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick} data-component="Button.fab">
      <Icon name="plus" />
    </button>
  );
}

// ------------------------------------------------------------------ feuilles
export function Sheet({ title, children, footer, full, onClose = closeSheet, head }: { title: string; children: ReactNode; footer?: ReactNode; full?: boolean; onClose?: () => void; head?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={'sheet' + (full ? ' full' : '')} data-component={full ? 'BottomSheet.full' : 'BottomSheet'} style={{ outline: 'none' }}>
        <span className="handle" aria-hidden="true" />
        <div className="sheet-head" style={full ? { borderBottom: '1px solid var(--divider-minimal)' } : undefined}>
          <div className="between">
            <h2 className="t-h2">{title}</h2>
            <button type="button" className="icon-btn neutral" aria-label="Fermer" onClick={onClose} style={{ marginRight: 'calc(-1 * var(--space-10))' }}>
              <Icon name="close" />
            </button>
          </div>
          {head}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ toasts
interface ToastState { id: number; text: string; undo?: () => void; error?: boolean }
let toast: ToastState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();
export function showToast(text: string, opts: { undo?: () => void; error?: boolean } = {}) {
  toast = { id: Date.now(), text, ...opts };
  toastListeners.forEach((l) => l());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = null; toastListeners.forEach((l) => l()); }, opts.undo ? 6000 : 3500);
}
export function ToastHost() {
  const t = useSyncExternalStore((l) => { toastListeners.add(l); return () => toastListeners.delete(l); }, () => toast);
  if (!t) return null;
  return (
    <div role="status" className={'toast' + (t.error ? ' error' : '')} key={t.id} data-component="Toast">
      <Icon name={t.error ? 'alert' : 'success'} />
      <span className="t-strong">{t.text}</span>
      {t.undo ? <button type="button" onClick={() => { t.undo!(); toast = null; toastListeners.forEach((l) => l()); }}>Annuler</button> : <span />}
    </div>
  );
}

// ------------------------------------------------------------------ petits éléments
export function EtfDot({ id, size = 12, style }: { id: string; size?: number; style?: React.CSSProperties }) {
  return <span className="dot" style={{ width: size, height: size, background: `var(--etf-${id}, var(--chart-other))`, ...style }} />;
}

export function VarChip({ ratio, suffix }: { ratio: number; suffix?: string }) {
  const r = Math.round(ratio * 1000);
  return <span className={'var-chip' + (r < 0 ? ' down' : r === 0 ? ' flat' : '')}>{arrow(ratio)} {pctSigned(ratio)}{suffix}</span>;
}

export function Switch({ checked, onChange, labelledBy, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; labelledBy?: string; label?: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} data-component="Toggle" />;
}

export function Empty({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty" data-component="EmptyState">
      <span className="empty-icon"><Icon name={icon} size={40} /></span>
      <h2 className="t-h3">{title}</h2>
      <p className="c-neutral">{text}</p>
      {action}
    </div>
  );
}

/** Calendrier (DatePicker) : mois navigable, en-tête vert. */
export function DatePicker({ value, onChange, label = 'Date' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const [view, setView] = useState(value.slice(0, 7));
  const y = +view.slice(0, 4), m = +view.slice(5, 7);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const shift = (k: number) => { let mm = m + k, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } setView(yy + '-' + String(mm).padStart(2, '0')); };
  const today = new Date().toISOString().slice(0, 10);
  const long = (() => {
    const d = new Date(value + 'T12:00:00');
    const wd = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()];
    const ms = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][d.getMonth()];
    return wd.charAt(0).toUpperCase() + wd.slice(1) + ' ' + d.getDate() + ' ' + ms;
  })();
  return (
    <div className="datepicker" data-component="DatePicker">
      <div className="head">
        <span className="overline">{label}</span>
        <span className="t-h2">{long}</span>
      </div>
      <div className="body">
        <div className="month">
          <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => shift(-1)}><Icon name="back" size={20} /></button>
          <span>{MONTHS[m - 1]} {y}</span>
          <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => shift(1)}><Icon name="next" size={20} /></button>
        </div>
        <div className="grid">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <button key={'b' + i} type="button" disabled tabIndex={-1} />)}
          {Array.from({ length: days }, (_, i) => {
            const iso = view + '-' + String(i + 1).padStart(2, '0');
            return (
              <button key={iso} type="button" aria-pressed={iso === value} className={iso === today ? 'today' : undefined} onClick={() => onChange(iso)}>{i + 1}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Hero({ label, value, chip, children, className = '' }: { label: string; value: string; chip?: string; children?: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={'hero ' + className} data-component="Card.hero">
      <div className="stack-4">
        <span className="overline">{label}</span>
        <span className="t-display">{value}</span>
        {chip && <span className="row"><span className="chip-reverse">{chip}</span></span>}
      </div>
      {children}
    </section>
  );
}
