// Choix du courtier (Paramètres › PEA) et libellés de grille, partagés avec l'écran Courtiers
import { useState } from 'react';
import { useCalc } from '../ui/useCalc';
import { dateFr, eur, num, parseNum, pct, toInput } from '../domain/format';
import { BROKERS, CUSTOM_BROKER, brokerOf, type Broker, type FeeTier } from '../domain/brokers';
import type { AppData } from '../domain/types';
import { update } from '../data/store';
import { t } from '../i18n';
import { MoneyField } from './PlanParts';

export const brokerName = (b: Broker) => (b.id === CUSTOM_BROKER ? t(b.name) : b.name);
export const brokerLabel = (data: AppData) => brokerName(brokerOf(data.settings));

const tierCost = (x: FeeTier) => {
  if (x.fixed > 0 && x.pct > 0) return eur(x.fixed) + ' + ' + pct(x.pct, 2);
  if (x.pct > 0) return pct(x.pct, 2);
  return eur(x.fixed);
};

/** La grille en phrases courtes, pour que l'utilisateur voie ce que l'app suppose. */
export function describeGrid(b: Broker): string[] {
  const out: string[] = [];
  b.tiers.forEach((x, i) => {
    const prev = i > 0 ? b.tiers[i - 1].upTo : 0;
    if (b.tiers.length === 1) out.push(t('Chaque ordre : {c}', { c: tierCost(x) }));
    else if (!isFinite(x.upTo)) out.push(t('Ordre de plus de {a} : {c}', { a: eur(prev, 0), c: tierCost(x) }));
    else out.push(t('Ordre jusqu’à {a} : {c}', { a: eur(x.upTo, 0), c: tierCost(x) }));
  });
  if (b.minFee) out.push(t('Minimum par ordre : {a}', { a: eur(b.minFee) }));
  if (b.cap) out.push(t('Plafonné à {p} du montant jusqu’à {a}', { p: pct(b.cap.pct, 2), a: eur(b.cap.upTo, 0) }));
  if (b.scheduledFee !== undefined) out.push(t('Investissement programmé : {c}', { c: eur(b.scheduledFee) }));
  if (b.annualFixed > 0) out.push(t('Tenue de compte : {a} par an', { a: eur(b.annualFixed) }));
  if (b.annualPct > 0) out.push(t('Droits de garde : {p} de la valeur par an', { p: pct(b.annualPct, 2) }));
  if (b.minOrder) out.push(t('Montant minimal par ordre : {a}', { a: eur(b.minOrder, 0) }));
  return out;
}

export function PercentField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const [text, setText] = useState(value ? toInput(value * 100, 2) : '');
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <span className="input-wrap">
        <input className="input num" type="text" inputMode="decimal" value={text} placeholder="0" style={{ paddingRight: 44 }}
          onChange={(e) => { setText(e.target.value); const v = parseNum(e.target.value); onChange(isFinite(v) && v >= 0 && v <= 100 ? v / 100 : 0); }} />
        <span className="suffix" aria-hidden="true">%</span>
      </span>
      {hint && <span className="t-caption c-moderate">{hint}</span>}
    </label>
  );
}

/** Sélecteur de courtier : grille connue ou grille saisie. */
export function BrokerPicker() {
  const { data } = useCalc();
  const s = data.settings;
  const b = brokerOf(s);
  const custom = b.id === CUSTOM_BROKER;
  return (
    <div className="stack" style={{ gap: 'var(--space-12)' }} data-testid="broker-picker">
      <label className="field">
        <span className="lbl">{t('Mon courtier')}</span>
        <select className="input" value={b.id} onChange={(e) => update((d) => { d.settings.brokerId = e.target.value === CUSTOM_BROKER ? undefined : e.target.value; })} data-component="Select">
          <option value={CUSTOM_BROKER}>{t('Autre courtier / ma propre grille')}</option>
          {BROKERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <span className="hint">{t('Sert à estimer les frais des ordres (assistant du mois, plans, simulateur) et à comparer avec d’autres courtiers. Vos achats déjà enregistrés gardent leurs frais réels.')}</span>
      </label>
      {custom ? (
        <>
          <MoneyField label={t('Frais fixes par ordre')} value={s.feePerOrder} onChange={(v) => update((d) => { d.settings.feePerOrder = v; })} hint={t('Par exemple 1,92 € par ordre chez certaines Caisses du Crédit Agricole.')} />
          <PercentField label={t('Frais en % du montant de l’ordre')} value={s.feePct ?? 0} onChange={(v) => update((d) => { d.settings.feePct = v || undefined; })} hint={t('0 si votre courtier ne facture qu’un montant fixe. Les frais sont la somme des deux.')} />
          <MoneyField label={t('Tenue de compte par an')} value={s.annualFee ?? 0} onChange={(v) => update((d) => { d.settings.annualFee = v || undefined; })} />
          <PercentField label={t('Droits de garde par an (% de la valeur)')} value={s.annualPct ?? 0} onChange={(v) => update((d) => { d.settings.annualPct = v || undefined; })} hint={t('Regardez l’extrait tarifaire de votre banque : chaque Caisse ou agence a sa grille.')} />
        </>
      ) : (
        <div className="stack-4" data-testid="broker-grid">
          <ul className="stack-4 t-caption c-neutral">{describeGrid(b).map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="t-caption c-moderate">{t(b.note)}</p>
          <p className="t-legal c-moderate">{t('Tarifs indicatifs relevés le {d} sur des sites comparateurs, pas chez le courtier : vérifiez sur sa brochure tarifaire.', { d: dateFr(b.checked) })} <a href={b.url} target="_blank" rel="noopener noreferrer">{t('Site du courtier')}</a></p>
        </div>
      )}
    </div>
  );
}

void num;
