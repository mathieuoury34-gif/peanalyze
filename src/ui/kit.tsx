// Composants partagés (planche Système)
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Logo } from './icons';
import { back, closeSheet, navigate, tabOf, useRoute, type Tab } from './router';
import { useData } from '../data/store';
import { refreshPrices, usePriceStatus } from '../data/prices';
import { valuationDate } from '../domain/calc';
import { dateFr, dateLong, dateShort, dateTimeFr, arrow, pctSigned, todayIso, MONTHS_TITLE } from '../domain/format';
import { t, t as tr } from '../i18n';

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

export function useScrolled(threshold = 20): boolean {
  const [s, setS] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => { raf = 0; setS(window.scrollY >= threshold); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(on); };
    on();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { window.removeEventListener('scroll', schedule); if (raf) cancelAnimationFrame(raf); };
  }, [threshold]);
  return s;
}

// ------------------------------------------------------------------ en-têtes
export function useUpdatedText(): string {
  const data = useData();
  const s = data.settings.lastPriceUpdate;
  return s ? t('Cours mis à jour le {d}', { d: dateTimeFr(s) }) : t('Cours du {d}', { d: dateFr(valuationDate(data)) });
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
          <button type="button" className={'icon-btn' + (ps.loading ? ' spin' : '')} aria-label={t('Actualiser les cours')} onClick={() => refreshPrices({ force: true })} disabled={ps.loading}>
            <Icon name="refresh" />
          </button>
          <a href="#/parametres" className="icon-btn" aria-label={t('Paramètres')} onClick={(e) => { e.preventDefault(); navigate('/parametres'); }}>
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
        <button type="button" className={'icon-btn' + (close ? ' neutral' : '')} aria-label={close ? t('Fermer sans enregistrer') : t('Retour')} onClick={() => back(fallback)}>
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
      <span>{ps.noSource ? ps.error : t('Cours indisponibles – dernières valeurs du {d} ({e})', { d: dateShort(valuationDate(data)), e: ps.error })}</span>
      {ps.noSource
        ? <button type="button" onClick={() => navigate('/parametres')}>{t('Paramètres')}</button>
        : <button type="button" onClick={() => refreshPrices({ force: true })}>{t('Réessayer')}</button>}
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
  { id: 'portefeuille', label: 'Portefeuille', to: '/portefeuille' },
  { id: 'historique', label: 'Historique', to: '/historique' },
  { id: 'marches', label: 'Marchés', to: '/marches' },
  { id: 'simulateur', label: 'Simulateur', to: '/simulateur' },
];

export function TabBar() {
  const route = useRoute();
  const active = tabOf(route.path);
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); if (route.path !== to) navigate(to); };
  return (
    <>
      <nav aria-label={tr('Navigation principale')} className="tabbar" data-component="TabBar">
        {TABS.map((t) => (
          <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
            <span className="pill"><Icon name={t.id} /></span>
            {tr(t.label)}
          </a>
        ))}
      </nav>
      <aside className="sidenav" aria-label={tr('Navigation principale')}>
        <Logo size={20} />
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
              <Icon name={t.id} />{tr(t.label)}
            </a>
          ))}
          <a href="#/parametres" aria-current={route.path.startsWith('/parametres') && route.path !== '/parametres/aide' ? 'page' : undefined} onClick={go('/parametres')}>
            <Icon name="settings" />{tr('Paramètres')}
          </a>
          <a href="#/parametres/aide" aria-current={route.path === '/parametres/aide' ? 'page' : undefined} onClick={go('/parametres/aide')}>
            <Icon name="help" />{tr('Aide et guide')}
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

export function Fab({ onClick, label = t('Ajouter un virement ou un achat') }: { onClick: () => void; label?: string }) {
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
            <button type="button" className="icon-btn neutral" aria-label={t('Fermer')} onClick={onClose} style={{ marginRight: 'calc(-1 * var(--space-10))' }}>
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
      {t.undo ? <button type="button" onClick={() => { t.undo!(); toast = null; toastListeners.forEach((l) => l()); }}>{tr('Annuler')}</button> : <span />}
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

/** Balayage horizontal (doigt ou souris) : appelle onNext (vers la gauche) ou onPrev (vers la droite) ; le clic qui suit un balayage est ignoré. */
function useSwipe(onNext: () => void, onPrev: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const swiped = useRef(false);
  return {
    onPointerDown: (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY, t: Date.now() }; swiped.current = false; },
    onPointerUp: (e: React.PointerEvent) => {
      const s0 = start.current; start.current = null;
      if (!s0) return;
      const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - s0.t > 800) return;
      swiped.current = true;
      if (dx < 0) onNext(); else onPrev();
    },
    onPointerCancel: () => { start.current = null; },
    onClickCapture: (e: React.MouseEvent) => { if (swiped.current) { swiped.current = false; e.stopPropagation(); e.preventDefault(); } },
  };
}

/** Calendrier (DatePicker) : mois navigable, glissable à gauche/droite, en-tête vert. Les jours hors de min/max sont grisés. */
export function DatePicker({ value, selected = value, onChange, label = t('Date'), min, max }: { value: string; selected?: string; onChange: (iso: string) => void; label?: string; min?: string; max?: string }) {
  const [view, setView] = useState(value.slice(0, 7));
  const [months, setMonths] = useState(false); // vue « choisir le mois et l'année »
  const [dir, setDir] = useState<'next' | 'prev'>('next'); // sens du dernier changement de mois (animation)
  const y = +view.slice(0, 4), m = +view.slice(5, 7);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const MONTHS = MONTHS_TITLE;
  const shift = (k: number) => { setDir(k > 0 ? 'next' : 'prev'); let mm = m + k, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } setView(yy + '-' + String(mm).padStart(2, '0')); };
  const today = new Date().toISOString().slice(0, 10);
  const long = (() => {
    return selected ? dateLong(selected) : t('Choisir une date');
  })();
  const swipe = useSwipe(() => !months && shift(1), () => !months && shift(-1));
  return (
    <div className="datepicker" data-component="DatePicker" {...swipe}>
      <div className="head">
        <span className="overline">{label}</span>
        <span className="t-h2">{long}</span>
      </div>
      <div className="body">
        <div className="month">
          <button type="button" className="icon-btn" aria-label={months ? t('Année précédente') : t('Mois précédent')} onClick={() => (months ? setView(String(y - 1) + view.slice(4)) : shift(-1))}><Icon name="back" size={20} /></button>
          <button type="button" className="month-title" aria-expanded={months} aria-label={t('Choisir le mois et l’année')} onClick={() => setMonths(!months)}>
            {months ? y : MONTHS[m - 1] + ' ' + y}<Icon name="down" size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label={months ? t('Année suivante') : t('Mois suivant')} onClick={() => (months ? setView(String(y + 1) + view.slice(4)) : shift(1))}><Icon name="next" size={20} /></button>
        </div>
        {months ? (
          <div className="months">
            {MONTHS.map((mn, i) => {
              const key = y + '-' + String(i + 1).padStart(2, '0');
              const off = (!!min && key < min.slice(0, 7)) || (!!max && key > max.slice(0, 7));
              return <button key={key} type="button" aria-pressed={key === view} aria-disabled={off || undefined} className={off ? 'off' : undefined} onClick={() => { if (!off) { setView(key); setMonths(false); } }}>{mn}</button>;
            })}
          </div>
        ) : (
        <div className={'grid slide-' + dir} key={view}>
          {t('L,M,M,J,V,S,D').split(',').map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <button key={'b' + i} type="button" disabled tabIndex={-1} />)}
          {Array.from({ length: days }, (_, i) => {
            const iso = view + '-' + String(i + 1).padStart(2, '0');
            const off = (!!min && iso < min) || (!!max && iso > max); // hors période : grisé et sans effet
            return (
              <button key={iso} type="button" aria-pressed={iso === selected} aria-disabled={off || undefined} className={(iso === today ? 'today' : '') + (off ? ' off' : '') || undefined} onClick={() => { if (!off) onChange(iso); }}>{i + 1}</button>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ champ date : bouton → calendrier en surimpression
/** Le calendrier s'ouvre PAR-DESSUS l'écran (fenêtre centrée sur un voile) : rien dans la page ne bouge. */
function CalendarOverlay({ value, label, min, max, onPick, onClear, onClose }: { value: string; label: string; min?: string; max?: string; onPick: (iso: string) => void; onClear?: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true); // avant la feuille éventuelle : Échap ne ferme que le calendrier
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div className="cal-layer">
      <div className="cal-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="cal-pop" data-component="DatePicker.overlay">
        <DatePicker value={value || max || min || todayIso()} selected={value} label={label} min={min} max={max} onChange={onPick} />
        <div className="cal-actions">
          {onClear && value && <button type="button" className="btn btn-tertiary" onClick={onClear}>{t('Effacer la date')}</button>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('Fermer')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Champ date : un bouton qui affiche la date ; toucher n'importe où sur le champ ouvre le calendrier par-dessus l'écran.
 * Aucune saisie au clavier : la date se choisit uniquement dans le calendrier (glisser pour changer de mois).
 * min/max grisent les jours impossibles ; `clearable` ajoute « Effacer la date » (onChange reçoit alors '').
 */
export function DateField({ value, onChange, label, calendarLabel, min, max, hint, clearable }: {
  value: string; onChange: (iso: string) => void; label: string; calendarLabel?: string; min?: string; max?: string; hint?: ReactNode; clearable?: boolean;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="field" data-component="DateField">
      <span id={uid} className="lbl">{label}</span>
      <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={uid + ' ' + uid + 'v'}
        onClick={() => setOpen(true)} data-component="DatePicker.field">
        <span id={uid + 'v'} className={value ? undefined : 'c-moderate'}>{value ? dateFr(value) : t('Choisir une date')}</span>
        <Icon name="calendar" size={20} style={{ color: 'var(--primary-fg)' }} />
      </button>
      {hint ? <span className="hint">{hint}</span> : null}
      {open && <CalendarOverlay value={value} label={calendarLabel || label} min={min} max={max} onClose={close}
        onPick={(iso) => { setOpen(false); onChange(iso); }} onClear={clearable ? () => { setOpen(false); onChange(''); } : undefined} />}
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
