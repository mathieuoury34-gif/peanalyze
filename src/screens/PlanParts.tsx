// Éléments communs aux écrans Plans : navigation du Simulateur, couleurs, champ de montant, sélecteur d'ETF
import { useState } from 'react';
import { Sheet } from '../ui/kit';
import { Icon } from '../ui/icons';
import { eur, num, parseNum, pct, toInput } from '../domain/format';
import { instrumentOf, searchCatalog, type Instrument } from '../domain/plan';
import type { AppData } from '../domain/types';
import { catKey } from '../data/seed';
import { t, tl } from '../i18n';

export const SIM_NAV = () => [{ to: '/simulateur', label: t('Épargne') }, { to: '/simulateur/plans', label: t('Plans') }, { to: '/simulateur/objectifs', label: t('Objectifs') }];

const FALLBACK = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];
/** Couleur d'un ETF dans les graphiques : celle de l'app s'il est suivi, sinon une couleur de secours stable. */
export function colorOf(key: string, i = 0): string {
  return `var(--etf-${key}, ${FALLBACK[i % FALLBACK.length]})`;
}
export function Dot({ id, i = 0, size = 12 }: { id: string; i?: number; size?: number }) {
  return <span className="dot" style={{ width: size, height: size, background: colorOf(id, i) }} />;
}

/** Nom court d'un ETF (indice) pour les listes. */
export function shortName(data: AppData, key: string): string {
  const i = instrumentOf(data, key);
  return i ? tl(i.index) : key;
}

/** Champ de montant en euros : l'état texte est local, la valeur numérique est remontée à chaque frappe. */
export function MoneyField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const [text, setText] = useState(value ? toInput(value, value % 1 ? 2 : 0) : '');
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <span className="input-wrap">
        <input className="input num" type="text" inputMode="decimal" value={text} placeholder="0" style={{ paddingRight: 44 }}
          onChange={(e) => { setText(e.target.value); const v = parseNum(e.target.value); onChange(isFinite(v) && v >= 0 ? v : 0); }} />
        <span className="suffix" aria-hidden="true">€</span>
      </span>
      {hint && <span className="t-caption c-moderate">{hint}</span>}
    </label>
  );
}

function Row({ i, onPick, tag }: { i: Instrument; onPick: () => void; tag?: string }) {
  return (
    <li>
      <button type="button" className="list-row" style={{ gridTemplateColumns: '1fr auto', width: '100%', textAlign: 'left', padding: 'var(--space-10) 0', background: 'none', border: 0, borderTop: '1px solid var(--divider-minimal)', cursor: 'pointer' }} onClick={onPick}>
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{tl(i.index)} <span className="t-caption c-moderate">· {i.key}</span></span>
          <span className="t-caption c-moderate ellipsis">{i.name}</span>
          <span className="t-caption c-moderate">{t('Frais {p}', { p: pct(i.ter, 2) })}{i.price > 0 ? ' · ' + eur(i.price) : ''}{i.indicative ? ' · ' + t('cours indicatif') : ''}{tag ? ' · ' + tag : ''}</span>
        </span>
        <Icon name="plus" size={20} />
      </button>
    </li>
  );
}

/** Choix d'un ETF : parmi ceux que l'on détient (mode « held ») ou dans « Mes ETF » puis tout le catalogue PEA (mode « any »). */
export function EtfPickerSheet({ data, title, mode, exclude = [], onPick, onClose }: { data: AppData; title: string; mode: 'held' | 'any'; exclude?: string[]; onPick: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const held = new Map<string, number>();
  for (const tx of data.transactions) held.set(tx.etfId, (held.get(tx.etfId) || 0) + tx.quantity);
  const mine: Instrument[] = data.etfs
    .filter((e) => (mode === 'held' ? (held.get(e.id) || 0) > 0 : data.myEtfIds.includes(e.id) || (held.get(e.id) || 0) > 0) && !exclude.includes(e.id))
    .map((e) => instrumentOf(data, e.id)!)
    .filter((i) => !q.trim() || (i.name + ' ' + i.index + ' ' + i.key).toLowerCase().includes(q.trim().toLowerCase()));
  const mineKeys = new Set(data.etfs.map((e) => e.id));
  const cat: Instrument[] = mode === 'any'
    ? searchCatalog(data, q).filter((c) => !mineKeys.has(catKey(c)) && !exclude.includes(catKey(c))).map((c) => instrumentOf(data, catKey(c))!).filter(Boolean)
    : [];
  return (
    <Sheet title={title} full onClose={onClose}
      head={mode === 'any' ? (
        <label className="search" style={{ marginTop: 'var(--space-8)' }}>
          <Icon name="search" size={20} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Indice, ETF, ticker ou ISIN')} aria-label={t('Rechercher un ETF')} />
        </label>
      ) : undefined}>
      <div className="stack" style={{ paddingBottom: 'var(--space-16)' }}>
        {mine.length > 0 && (
          <>
            <h3 className="t-label c-neutral" style={{ paddingTop: 'var(--space-12)' }}>{mode === 'held' ? t('Mes lignes') : t('Mes ETF')}</h3>
            <ul>{mine.map((i) => <Row key={i.key} i={i} onPick={() => onPick(i.key)} tag={mode === 'held' ? t('{n} parts', { n: held.get(i.key) || 0 }) : undefined} />)}</ul>
          </>
        )}
        {cat.length > 0 && (
          <>
            <h3 className="t-label c-neutral" style={{ paddingTop: 'var(--space-12)' }}>{t('Catalogue PEA')}</h3>
            <ul>{cat.map((i) => <Row key={i.key} i={i} onPick={() => onPick(i.key)} />)}</ul>
            <p className="t-legal c-moderate">{t('Cours du catalogue : indicatifs, à vérifier chez votre courtier.')}</p>
          </>
        )}
        {!mine.length && !cat.length && <p className="c-neutral" style={{ padding: 'var(--space-16) 0' }}>{t('Aucun ETF ne correspond.')}</p>}
      </div>
    </Sheet>
  );
}

/** « 12,3 → 4,5 » avec flèche, pour comparer avant / après. */
export function fromTo(a: string, b: string): string {
  return a + ' → ' + b;
}
export const pctDelta = (a: number, b: number) => num((b - a) * 100, 1);
