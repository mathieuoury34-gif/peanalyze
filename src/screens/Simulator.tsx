// Onglet Simulateur : T4-01 paramètres et résultat + T4-02 tableau année par année (section dépliable)
import { useMemo, useState } from 'react';
import { AppHeader, Switch } from '../ui/kit';
import { StackedAreaChart } from '../ui/charts';
import { Icon } from '../ui/icons';
import { useCalc } from '../ui/useCalc';
import { navigate } from '../ui/router';
import { deflate, MAX_HORIZON, monthlySeries, simulate } from '../domain/calc';
import { eur, num, parseNum, pct } from '../domain/format';
import { update } from '../data/store';
import type { Simulation } from '../domain/types';
import { t, tn } from '../i18n';

const INFLATION = 0.02;

export function SimulatorScreen() {
  const { data } = useCalc();
  const sim = data.simulation;
  const [capText, setCapText] = useState(num(sim.initialCapital, 0));
  const [real, setReal] = useState(false);
  const [constant, setConstant] = useState(false);
  const [table, setTable] = useState(false);
  const set = (patch: Partial<Simulation>) => update((d) => { d.simulation = { ...d.simulation, ...patch }; });

  const years = useMemo(() => {
    const y = simulate(sim);
    return constant ? deflate(y, INFLATION) : y;
  }, [sim, constant]);
  const realSeries = useMemo(() => {
    const m = monthlySeries(data);
    return m.map((p, i) => ({ t: i / 12, value: constant ? p.value / Math.pow(1 + INFLATION, i / 12) : p.value }));
  }, [data, constant]);
  const last = years[years.length - 1];
  const ys = sim.horizonYears;
  const phases = sim.dcaPhases;
  const setPhase = (i: number, patch: Partial<Simulation['dcaPhases'][number]>) => set({ dcaPhases: phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <div className="screen" data-screen="T4-01">
      <AppHeader title={t('Simulateur')} />
      <main className="content dgrid">
        <details className="explain dspan-12" open={!data.transactions.length || undefined}>
          <summary style={{ cursor: 'pointer', font: 'var(--type-caption-strong)', minHeight: 32, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="info" size={18} />{t('À quoi sert le simulateur ?')}</summary>
          <span>{t('Il estime ce que pourrait devenir votre épargne si vous investissez régulièrement : choisissez un capital de départ, un rendement annuel moyen et vos versements mensuels. C’est une projection théorique, indépendante de votre portefeuille réel (sauf si vous activez « Comparer à ma progression réelle »).')}</span>
          <span>{t('La bourse ne monte pas de façon régulière : le résultat est une tendance, pas une promesse. Frais et impôts ne sont pas déduits.')}</span>
          <button type="button" className="link" onClick={() => navigate('/parametres/aide?q=simulateur')}>{t('En savoir plus dans l’aide')}</button>
        </details>
        <section aria-labelledby="t401-par" className="card g16 dspan-5">
          <h2 id="t401-par">{t('Paramètres')}</h2>
          <label className="field">
            <span className="lbl">{t('Capital initial (€)')}</span>
            <input className="input num t-amount-m" style={{ font: 'var(--type-amount-m)' }} type="text" inputMode="decimal" value={capText}
              onChange={(e) => { setCapText(e.target.value); const v = parseNum(e.target.value); set({ initialCapital: isFinite(v) && v >= 0 ? v : 0 }); }} data-component="AmountField" />
          </label>
          <label className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="between"><span className="t-label">{t('Horizon de placement')}</span><span className="t-amount-m c-primary">{tn(ys, '{n} an', '{n} ans')}</span></span>
            <input className="range" type="range" min={1} max={MAX_HORIZON} step={1} value={ys} onChange={(e) => set({ horizonYears: Number(e.target.value) })} data-component="Slider" />
            <span className="between t-legal c-moderate"><span>{t('{n} an', { n: 1 })}</span><span>{t('{n} ans', { n: MAX_HORIZON })}</span></span>
          </label>
          <label className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="between"><span className="t-label">{t("Taux d'intérêt annuel")}</span><span className="t-amount-m c-primary">{pct(sim.annualRate, Math.round(sim.annualRate * 1000) % 10 ? 1 : 0)}</span></span>
            <input className="range" type="range" min={0} max={15} step={0.5} value={Math.round(sim.annualRate * 1000) / 10} onChange={(e) => set({ annualRate: Number(e.target.value) / 100 })} data-component="Slider" />
            <span className="between t-legal c-moderate"><span>{pct(0, 0)}</span><span>{pct(0.15, 0)}</span></span>
          </label>
        </section>

        <section aria-labelledby="t401-dca" className="card g8 dspan-7">
          <h2 id="t401-dca" style={{ marginBottom: 'var(--space-4)' }}>{t('Phases de versement (DCA)')}</h2>
          <ul>
            {phases.map((p, i) => (
              <li key={i} className="row" style={{ gap: 'var(--space-6)', padding: 'var(--space-6) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                <span className="t-caption c-neutral">{t("À partir de l'année")}</span>
                <input type="number" min={1} max={MAX_HORIZON} value={p.fromYear} aria-label={t('Année de début de la phase {n}', { n: i + 1 })}
                  onChange={(e) => setPhase(i, { fromYear: Math.max(1, Number(e.target.value) || 1) })}
                  className="input" style={{ width: 52, height: 'var(--touch-min)', padding: '0 var(--space-6)', font: 'var(--type-body-strong)', textAlign: 'center' }} />
                <span className="t-caption c-neutral">·</span>
                <input type="number" min={0} step={50} value={p.monthly} aria-label={t('Versement mensuel de la phase {n} en euros', { n: i + 1 })}
                  onChange={(e) => setPhase(i, { monthly: Math.max(0, Number(e.target.value) || 0) })}
                  className="input" style={{ width: 76, height: 'var(--touch-min)', padding: '0 var(--space-6)', font: 'var(--type-body-strong)', textAlign: 'right' }} />
                <span className="t-caption c-neutral grow">{t('€/mois')}</span>
                <button type="button" className="icon-btn" style={{ color: 'var(--critical-text)', marginRight: 'calc(-1 * var(--space-10))' }} aria-label={t('Supprimer la phase {n}', { n: i + 1 })}
                  onClick={() => set({ dcaPhases: phases.filter((_, j) => j !== i) })}><Icon name="trash" size={20} /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }}
            onClick={() => set({ dcaPhases: [...phases, { fromYear: (phases.length ? Math.max(...phases.map((p) => p.fromYear)) : 0) + 5, monthly: 700 }] })}>
            <Icon name="plus" size={20} />{t('Ajouter une phase')}
          </button>
        </section>

        <section aria-label={t('Résultats')} className="stack-8 dspan-5">
          <div className="hero" style={{ gap: 'var(--space-4)' }} data-component="Card.hero">
            <span className="overline">{tn(ys, 'Capital final dans {n} an', 'Capital final dans {n} ans')}{constant ? ' ' + t('(euros constants)') : ''}</span>
            <span className="t-display">{eur(last.value, 0)}</span>
          </div>
          <div className="grid-2">
            <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
              <span className="row t-caption c-moderate" style={{ gap: 'var(--space-6)' }}><span style={{ width: 10, height: 10, borderRadius: 'var(--radius-2)', background: 'var(--chart-deposited)' }} />{t('Versements')}</span>
              <span className="value">{eur(last.deposited, 0)}</span>
            </div>
            <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
              <span className="row t-caption c-moderate" style={{ gap: 'var(--space-6)' }}><span style={{ width: 10, height: 10, borderRadius: 'var(--radius-2)', background: 'var(--chart-value)' }} />{t('Intérêts')}</span>
              <span className="value c-success">+{eur(last.value - last.deposited, 0)}</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="t401-chart" className="card dspan-7">
          <h2 id="t401-chart">{t('Évolution du capital')}</h2>
          <StackedAreaChart years={years} real={real ? realSeries : undefined}
            label={t('Capital simulé sur {n} ans : {d} de versements et {i} d’intérêts', { n: ys, d: eur(last.deposited, 0), i: eur(last.value - last.deposited, 0) })} />
          <div className="legend">
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-deposited)' }} />{t('Versements cumulés')}</span>
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-value)' }} />{t('Intérêts cumulés')}</span>
            {real && <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-6)' }} />{t('Valeur réelle du PEA')}</span>}
          </div>
          <div className="stack" style={{ borderTop: '1px solid var(--divider-minimal)', paddingTop: 'var(--space-4)' }}>
            <div className="between" style={{ minHeight: 52, gap: 'var(--space-12)' }}><span id="t401-real">{t('Comparer à ma progression réelle')}</span><Switch checked={real} onChange={setReal} labelledBy="t401-real" /></div>
            <div className="between" style={{ minHeight: 52, gap: 'var(--space-12)' }}><span id="t401-const">{t('Afficher en euros constants (inflation {p})', { p: pct(INFLATION, 0) })}</span><Switch checked={constant} onChange={setConstant} labelledBy="t401-const" /></div>
          </div>
        </section>

        <button type="button" className="btn btn-secondary block" aria-expanded={table} onClick={() => setTable(!table)}>
          {t('Tableau année par année')}<Icon name={table ? 'up' : 'down'} size={20} />
        </button>
        {table && (
          <div className="stack-12" data-screen="T4-02">
            <p className="t-caption c-neutral">{t('Capital initial {c} · taux {r} · {n} ans · phases de DCA du simulateur', { c: eur(sim.initialCapital, 0), r: pct(sim.annualRate, Math.round(sim.annualRate * 1000) % 10 ? 1 : 0), n: ys })}{constant ? ' · ' + t('euros constants') : ''}</p>
            <section className="table-wrap" data-component="Table">
              <table>
                <caption className="sr-only">{t('Capital simulé année par année')}</caption>
                <thead><tr><th scope="col">{t('Année')}</th><th scope="col">{t('Versements cumulés')}</th><th scope="col">{t('Intérêts cumulés')}</th><th scope="col">{t('Capital total')}</th></tr></thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.year}>
                      <th scope="row">{y.year}</th>
                      <td>{eur(y.deposited, 0)}</td>
                      <td className="c-success">{eur(y.value - y.deposited, 0)}</td>
                      <td className="t-amount-s">{eur(y.value, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
        <p className="t-legal c-moderate">{t('Projection indicative : rendement constant, capitalisation mensuelle, versements en fin de mois, hors frais et fiscalité.')}</p>
      </main>
    </div>
  );
}
