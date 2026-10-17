// Simulateur › Plans : liste des scénarios « et si… », modèles de départ et comparateur
import { useMemo, useState } from 'react';
import { AppHeader, Empty, SubNav, PriceErrorBanner } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { eur, eurSigned, num, pct } from '../domain/format';
import { blankPlan, computePlan, planSellOne, planSingle, type PlanResult } from '../domain/plan';
import type { AppData, Plan } from '../domain/types';
import { newId } from '../data/store';
import { t, tn } from '../i18n';
import { EtfPickerSheet, SIM_NAV, planDrafts, shortName } from './PlanParts';

type Chooser = null | 'sell' | 'single';

export function addPlan(plan: Plan): void {
  planDrafts.set(plan.id, plan); // brouillon : conservé seulement par « Enregistrer » dans l'éditeur
  navigate('/simulateur/plan/' + plan.id);
}

function summary(data: AppData, p: Plan, r: PlanResult): string {
  const parts: string[] = [];
  if (r.sells.length) parts.push(t('Vend {l}', { l: r.sells.map((s) => (s.all ? '' : s.qty + ' ') + shortName(data, s.key)).join(', ') }));
  if (r.buys.length) parts.push(t('Achète {l}', { l: r.buys.map((b) => shortName(data, b.key)).join(', ') }));
  if (!parts.length) parts.push(p.deposit > 0 ? t('Versement de {a}', { a: eur(p.deposit, 0) }) : t('Plan vide : ajoutez une vente ou un versement'));
  return parts.join(' · ');
}

export function PlansScreen() {
  const { data, summary: sum } = useCalc();
  const plans = data.plans ?? [];
  const results = useMemo(() => plans.map((p) => computePlan(data, p)), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chooser, setChooser] = useState<Chooser>(null);
  const hasLines = sum.lines > 0;
  const id = () => newId('plan');

  return (
    <div className="screen" data-screen="T4-10">
      <AppHeader title={t('Simulateur')} />
      <PriceErrorBanner />
      <SubNav items={SIM_NAV()} label={t('Sections du simulateur')} />
      <main className="content dgrid">
        <details className="explain dspan-12" open={!plans.length || undefined}>
          <summary style={{ cursor: 'pointer', font: 'var(--type-caption-strong)', minHeight: 32, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="info" size={18} />{t('À quoi servent les plans ?')}</summary>
          <span>{t('Un plan est un « et si… » : et si je vendais cet ETF, combien cela me rapporterait-il, et que faudrait-il acheter pour me rapprocher de ma stratégie ? L’app calcule les ordres en parts entières, frais compris, et montre ce que ça change : écart à la cible, frais de gestion, répartition par secteur et par pays.')}</span>
          <span>{t('Rien n’est modifié dans votre portefeuille : vous passez les ordres chez votre courtier, puis vous enregistrez vos achats dans le journal.')}</span>
          <button type="button" className="link" onClick={() => navigate('/parametres/aide?q=plans')}>{t('En savoir plus dans l’aide')}</button>
        </details>

        <section aria-labelledby="t410-new" className="card g8 dspan-12">
          <h2 id="t410-new">{t('Créer un plan')}</h2>
          <div className="grid-2">
            <button type="button" className="btn btn-secondary" disabled={!hasLines} onClick={() => setChooser('sell')}><Icon name="minus" size={20} />{t('Vendre un ETF')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setChooser('single')}><Icon name="sparkle" size={20} />{t('Tout regrouper dans un ETF')}</button>
            <button type="button" className="btn btn-secondary" style={{ gridColumn: '1 / -1' }} onClick={() => addPlan(blankPlan(data, id(), t('Plan libre')))}><Icon name="plus" size={20} />{t('Plan libre : ventes, versement et cible à ma main')}</button>
          </div>
          <p className="t-caption c-moderate">{t('Ces modèles préparent un plan que vous pouvez ensuite modifier librement.')}</p>
        </section>

        {plans.length === 0 ? (
          <div className="dspan-12"><Empty icon="sparkle" title={t('Aucun plan pour l’instant')} text={t('Essayez par exemple « Vendre un ETF » pour voir ce que rapporterait sa vente et vers quoi réinvestir.')} /></div>
        ) : (
          <section aria-labelledby="t410-list" className="stack-8 dspan-12">
            <h2 id="t410-list">{tn(plans.length, '{n} plan', '{n} plans')}</h2>
            <ul className="stack-8">
              {plans.map((p, i) => {
                const r = results[i];
                return (
                  <li key={p.id}>
                    <a href={'#/simulateur/plan/' + p.id} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                      onClick={(e) => { e.preventDefault(); navigate('/simulateur/plan/' + p.id); }}>
                      <span className="between"><span className="t-h3">{p.name}</span><Icon name="next" size={20} /></span>
                      <span className="t-caption c-neutral" style={{ display: 'block', margin: 'var(--space-2) 0 var(--space-10)' }}>{summary(data, p, r)}</span>
                      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-8)' }}>
                        <span className="stack-4"><span className="t-caption c-moderate">{r.sells.length ? t('Net des ventes') : t('Budget')}</span><span className="t-amount-s">{eur(r.sells.length ? r.saleNet : r.budget, 0)}</span></span>
                        <span className="stack-4"><span className="t-caption c-moderate">{t('Écart à la cible')}</span><span className="t-amount-s">{r.gapBefore === null ? '—' : num(r.gapBefore, 0) + ' → ' + num(r.gapAfter!, 0)}</span></span>
                        <span className="stack-4"><span className="t-caption c-moderate">{t('Frais du plan')}</span><span className="t-amount-s">{eur(r.feesTotal)}</span></span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {plans.length >= 1 && (
          <section aria-labelledby="t410-cmp" className="stack-8 dspan-12">
            <h2 id="t410-cmp">{t('Comparer')}</h2>
            <div className="table-wrap" data-component="Table">
              <table>
                <caption className="sr-only">{t('Comparaison des plans avec la situation actuelle')}</caption>
                <thead>
                  <tr><th scope="col"></th><th scope="col">{t('Aujourd’hui')}</th>{plans.map((p) => <th key={p.id} scope="col">{p.name}</th>)}</tr>
                </thead>
                <tbody>
                  {(() => {
                    const r0 = results[0];
                    const row = (label: string, now: string, f: (r: PlanResult) => string) => (
                      <tr key={label}><th scope="row">{label}</th><td>{now}</td>{results.map((r, i) => <td key={plans[i].id}>{f(r)}</td>)}</tr>
                    );
                    return [
                      row(t('Argent récupéré (net)'), '—', (r) => (r.sells.length ? eur(r.saleNet, 0) : '—')),
                      row(t('Achats'), '—', (r) => (r.buys.length ? eur(r.buyCost, 0) : '—')),
                      row(t('Frais du plan'), '—', (r) => eur(r.feesTotal)),
                      row(t('Écart à la cible (points)'), r0.gapBefore === null ? '—' : num(r0.gapBefore, 1), (r) => (r.gapAfter === null ? '—' : num(r.gapAfter, 1))),
                      row(t('Frais de gestion moyens'), pct(r0.terBefore, 2), (r) => pct(r.terAfter, 2)),
                      row(t('Lignes'), String(r0.linesBefore), (r) => String(r.linesAfter)),
                      row(t('Plus-value réalisée'), '—', (r) => (r.sells.length ? eurSigned(r.realizedGain, 0) : '—')),
                      row(t('Espèces restantes'), eur(r0.cashBefore, 0), (r) => eur(r.cashAfter, 0)),
                    ];
                  })()}
                </tbody>
              </table>
            </div>
            <p className="t-legal c-moderate">{t('Écart à la cible : somme des écarts en points entre votre répartition et la cible, divisée par deux (0 = parfaitement dans la cible).')}</p>
          </section>
        )}
      </main>

      {chooser === 'sell' && (
        <EtfPickerSheet data={data} title={t('Quel ETF vendre ?')} mode="held" onClose={() => setChooser(null)}
          onPick={(k) => { setChooser(null); addPlan(planSellOne(data, id(), k, t('Vendre {n}', { n: shortName(data, k) }))); }} />
      )}
      {chooser === 'single' && (
        <EtfPickerSheet data={data} title={t('Quel ETF garder ?')} mode="any" onClose={() => setChooser(null)}
          onPick={(k) => { setChooser(null); addPlan(planSingle(data, id(), k, t('Tout en {n}', { n: shortName(data, k) }))); }} />
      )}
    </div>
  );
}
