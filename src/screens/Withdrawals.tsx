// Onglet Simulateur › Retraits : phases de retrait, courbe du capital, scénarios aléatoires (Monte Carlo) et calculette à 4 variables.
import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { AppHeader, InfoTip, PriceErrorBanner, Segmented, SubNav, Switch } from '../ui/kit';
import { SIM_NAV } from './PlanParts';
import { WithdrawChart } from '../ui/WithdrawChart';
import { Icon } from '../ui/icons';
import { useCalc } from '../ui/useCalc';
import { navigate } from '../ui/router';
import { MAX_HORIZON } from '../domain/calc';
import { adjustForCosts, holdingCost } from '../domain/analysis';
import { eur, num, parseNum, pct, toInput } from '../domain/format';
import { update } from '../data/store';
import { calcConfig, configFromSim, DEFAULT_INFLATION, DEFAULT_TAX_RATE, DEFAULT_VOLATILITY, kindOf, MAX_CALC_YEARS, monteCarlo, run, solve, type CalcInput, type Unknown } from '../domain/withdraw';
import type { Simulation, WithdrawKind, WithdrawPhase } from '../domain/types';
import { lang, t, tn } from '../i18n';

/** Champ numérique : garde le texte tapé, se resynchronise quand la valeur change de l'extérieur (résultat de la calculette). */
function NumField({ label, value, onChange, suffix, decimals = 0, result, hint, max }: { label: string; value: number; onChange?: (v: number) => void; suffix?: string; decimals?: number; result?: boolean; hint?: string; max?: number }) {
  const fmt = (v: number) => (isFinite(v) ? toInput(v, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : decimals) : '');
  const [text, setText] = useState(fmt(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus || result) setText(fmt(value)); }, [value, focus, result]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <span className="input-wrap">
        <input className="input num" type="text" inputMode="decimal" value={text} readOnly={result || !onChange} aria-readonly={result || undefined}
          style={{ paddingRight: suffix ? 48 : undefined, ...(result ? { background: 'var(--bg-hover)', font: 'var(--type-body-strong)', color: 'var(--primary-fg)' } : {}) }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onChange={(e) => { setText(e.target.value); const v = parseNum(e.target.value); onChange?.(isFinite(v) && v >= 0 ? Math.min(v, max ?? Infinity) : 0); }} />
        {suffix && <span className="suffix" aria-hidden="true" style={{ font: 'var(--type-body)', color: 'var(--text-moderate)' }}>{suffix}</span>}
      </span>
      {hint && <span className="t-caption c-moderate">{hint}</span>}
    </label>
  );
}

function SwitchRow({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="between" style={{ minHeight: 52, gap: 'var(--space-12)' }}><span id={id}>{label}</span><Switch checked={checked} onChange={onChange} labelledBy={id} disabled={disabled} /></div>;
}

function Slider({ label, value, min, max, step, shown, onChange, lo, hi, fine }: { label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void; lo: string; hi: string; fine?: number }) {
  // `fine` : pas des boutons − / + (réglage précis) ; la valeur reste au pas près (évite les erreurs d'arrondi des décimales)
  const sid = useId();
  const nudge = (d: number) => onChange(Math.round(Math.min(max, Math.max(min, value + d)) * 1000) / 1000);
  const btn = { width: 'var(--touch-min)', height: 'var(--touch-min)', flexShrink: 0, border: '1px solid var(--divider-minimal)', borderRadius: 'var(--radius-full)', background: 'transparent', color: 'var(--primary-fg)', font: 'var(--type-h2, var(--type-body-strong))', cursor: 'pointer' } as const;
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <span className="between"><span className="t-label" id={sid}>{label}</span><span className="t-amount-m c-primary">{shown}</span></span>
      <span className="row" style={{ gap: 'var(--space-8)' }}>
        {fine && <button type="button" style={btn} aria-label={t('Diminuer')} disabled={value <= min} onClick={() => nudge(-fine)}>−</button>}
        <input className="range" style={{ flex: 1, minWidth: 0 }} type="range" aria-labelledby={sid} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-component="Slider" />
        {fine && <button type="button" style={btn} aria-label={t('Augmenter')} disabled={value >= max} onClick={() => nudge(fine)}>+</button>}
      </span>
      <span className="between t-legal c-moderate"><span>{lo}</span><span>{hi}</span></span>
    </div>
  );
}

const yearsText = (y: number) => { const m = Math.round(y * 12), a = Math.floor(m / 12), r = m % 12; return [a ? tn(a, '{n} an', '{n} ans') : '', r ? (lang === 'en' && r === 1 ? '1 month' : t('{n} mois', { n: r })) : ''].filter(Boolean).join(' ') || t('moins d’un mois'); };

export function WithdrawalsScreen() {
  const [tab, setTab] = useState<'sim' | 'calc'>('sim');
  return (
    <div className="screen" data-screen="T4-06">
      <AppHeader title={t('Simulateur')} />
      <PriceErrorBanner />
      <SubNav items={SIM_NAV()} label={t('Sections du simulateur')} />
      <main className="content dgrid dtop">
        <details className="explain dspan-12">
          <summary style={{ cursor: 'pointer', font: 'var(--type-caption-strong)', minHeight: 32, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="info" size={18} />{t('Comment fonctionnent les retraits ?')}</summary>
          <span>{t('Une fois votre capital constitué, vous pouvez en retirer chaque mois une somme fixe (ou une part du capital restant). « Ma simulation » trace l’évolution du capital avec vos phases de retrait ; « Calculette » trouve la valeur manquante parmi la durée, le retrait, le capital et le rendement.')}</span>
          <span>{t('Le rendement est supposé constant, sauf dans les scénarios aléatoires (Monte Carlo) qui testent aussi la mauvaise surprise : une baisse juste après le début des retraits. Projection indicative, pas une promesse.')}</span>
          <button type="button" className="link" onClick={() => navigate('/parametres/aide?q=retraits')}>{t('En savoir plus dans l’aide')}</button>
        </details>
        <div className="dspan-12"><Segmented label={t('Mode')} value={tab} onChange={setTab} options={[['sim', t('Ma simulation')], ['calc', t('Calculette')]]} /></div>
        {tab === 'sim' ? <SimTab /> : <CalcTab />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ volatilité (partagée)
function VolatilitySlider() {
  const { data } = useCalc();
  const v = data.simulation.volatility ?? DEFAULT_VOLATILITY;
  const setVol = (pc: number) => update((d) => { d.simulation.volatility = Math.round(Math.min(60, Math.max(1, pc)) * 10) / 1000; }); // au dixième de point
  const shown = pct(v, Math.round(v * 1000) % 10 ? 1 : 0);
  return <Slider label={t('Volatilité annuelle (scénarios aléatoires)')} value={Math.min(30, Math.max(5, Math.round(v * 1000) / 10))} min={5} max={30} step={0.1} fine={0.1} shown={shown} lo={pct(0.05, 0)} hi={pct(0.3, 0)} onChange={setVol} />;
}

// ------------------------------------------------------------------ ma simulation
function SimTab() {
  const { data, positions } = useCalc();
  const sim = data.simulation;
  const [constant, setConstant] = useState(false);
  const [fees, setFees] = useState(false);
  const [showMc, setShowMc] = useState(true);
  const [table, setTable] = useState(false);
  const [adv, setAdv] = useState(false);
  const [advChart, setAdvChart] = useState(false);
  const cost = useMemo(() => holdingCost(data, positions), [data, positions]);
  const set = (patch: Partial<Simulation>) => update((d) => { d.simulation = { ...d.simulation, ...patch }; });
  const phases = sim.withdrawals ?? [];
  const legacy = sim.withdrawMode ?? 'amount';
  const kinds = phases.map((p) => kindOf(p, legacy));
  const hasMonthly = kinds.includes('monthly'), hasFixed = hasMonthly || kinds.includes('lump');
  const infl = sim.inflation ?? DEFAULT_INFLATION;
  const taxRate = sim.withdrawTaxRate ?? DEFAULT_TAX_RATE;
  const vol = sim.volatility ?? DEFAULT_VOLATILITY;
  const eff = fees && cost.securities > 0 ? adjustForCosts(data, cost, cost.ordersPerYear) : sim;
  const cfg = useMemo(() => configFromSim(eff), [eff]);
  const res = useMemo(() => run(cfg), [cfg]);
  const dCfg = useDeferredValue(cfg), dVol = useDeferredValue(vol); // le Monte Carlo suit avec un léger retard : le curseur reste fluide
  const mc = useMemo(() => (dCfg.withdrawals.length ? monteCarlo(dCfg, dVol) : null), [dCfg, dVol]);
  const setPhase = (i: number, patch: Partial<WithdrawPhase>) => set({ withdrawals: phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const f = (y: number) => (constant ? 1 / Math.pow(1 + infl, y) : 1);
  const points = res.years.map((p) => ({ ...p, value: p.value * f(p.year), withdrawn: p.withdrawn * f(p.year), deposited: p.deposited * f(p.year), tax: p.tax * f(p.year) }));
  const band = mc && showMc && mc.p50.length === points.length ? { p10: mc.p10.map((v, i) => v * f(i)), p50: mc.p50.map((v, i) => v * f(i)), p90: mc.p90.map((v, i) => v * f(i)) } : undefined;
  const last = points[points.length - 1];
  const depletedYear = res.depletedMonth !== null ? res.depletedMonth / 12 : null;
  // montant proposé pour un nouveau retrait : 4 % du capital accumulé à l'année de début, par an (arrondi à 50 € près par mois)
  const defaultAmount = (kind: WithdrawKind, from: number) => {
    if (kind === 'percent') return 4;
    if (kind === 'lump') return 20000;
    const capAt = run({ ...configFromSim(sim), withdrawals: [] }).years[Math.min(Math.max(0, from - 1), sim.horizonYears)]?.value ?? 0;
    return Math.max(50, Math.round((capAt * 0.04) / 12 / 50) * 50);
  };
  const addPhase = () => {
    const lastIdx = phases.length ? phases.reduce((a, b, i) => (b.fromYear > phases[a].fromYear ? i : a), 0) : -1;
    // première phase : à mi-horizon ; suivantes : 5 ans après la dernière, avec le même type (une somme unique est suivie d'un retrait mensuel)
    const from = lastIdx >= 0 ? Math.min(MAX_HORIZON, phases[lastIdx].fromYear + 5) : Math.max(1, Math.round(sim.horizonYears / 2));
    const kind: WithdrawKind = lastIdx >= 0 && kinds[lastIdx] !== 'lump' ? kinds[lastIdx] : 'monthly';
    set({ withdrawals: [...phases, { fromYear: from, kind, amount: lastIdx >= 0 && kinds[lastIdx] === kind ? phases[lastIdx].amount : defaultAmount(kind, from) }] });
  };
  const setKind = (i: number, kind: WithdrawKind) => setPhase(i, { kind, amount: defaultAmount(kind, phases[i].fromYear) });
  const ys = sim.horizonYears;
  const ok = mc && hasFixed;
  return (
    <>
      <section aria-labelledby="t406-ph" className="card g8 dspan-5 dstart">
        <div className="between"><h2 id="t406-ph">{t('Phases de retrait')}</h2><InfoTip><span>{t('Capital de départ {c}, versements, horizon et rendement : voir l’onglet Épargne.', { c: eur(sim.initialCapital, 0) })}</span></InfoTip></div>
        {phases.length === 0 && <p className="t-caption c-neutral">{t('Aucun retrait pour l’instant : ajoutez une phase pour voir la courbe.')}</p>}
        <ul>
          {phases.map((p, i) => {
            const kd = kinds[i];
            return (
              <li key={i} className="stack-8" style={{ padding: 'var(--space-8) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                <div className="row" style={{ gap: 'var(--space-6)' }}>
                  <span className="t-caption c-neutral">{kd === 'lump' ? t('En l’année') : t("À partir de l'année")}</span>
                  <input type="number" min={1} max={MAX_HORIZON} value={p.fromYear} aria-label={t('Année de début de la phase de retrait {n}', { n: i + 1 })}
                    onChange={(e) => setPhase(i, { fromYear: Math.max(1, Number(e.target.value) || 1) })}
                    className="input" style={{ width: 52, height: 'var(--touch-min)', padding: '0 var(--space-6)', font: 'var(--type-body-strong)', textAlign: 'center' }} />
                  <span className="t-caption c-neutral">·</span>
                  <input type="number" min={0} step={kd === 'percent' ? 0.1 : kd === 'lump' ? 1000 : 50} value={p.amount} aria-label={kd === 'percent' ? t('Retrait de la phase {n} en pourcentage du capital par an', { n: i + 1 }) : kd === 'lump' ? t('Somme retirée en une fois à la phase {n} en euros', { n: i + 1 }) : t('Retrait mensuel de la phase {n} en euros', { n: i + 1 })}
                    onChange={(e) => setPhase(i, { amount: Math.max(0, Number(e.target.value) || 0) })}
                    className="input" style={{ width: kd === 'lump' ? 96 : 76, height: 'var(--touch-min)', padding: '0 var(--space-6)', font: 'var(--type-body-strong)', textAlign: 'right' }} />
                  <span className="t-caption c-neutral grow">{kd === 'percent' ? t('% / an') : kd === 'lump' ? t('€ en une fois') : t('€/mois')}</span>
                  <button type="button" className="icon-btn" style={{ color: 'var(--critical-text)', marginRight: 'calc(-1 * var(--space-10))' }} aria-label={t('Supprimer la phase de retrait {n}', { n: i + 1 })}
                    onClick={() => set({ withdrawals: phases.filter((_, j) => j !== i) })}><Icon name="trash" size={20} /></button>
                </div>
                <div role="group" aria-label={t('Type de la phase de retrait {n}', { n: i + 1 })} className="chips g6" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
                  {([['monthly', t('€ par mois')], ['percent', t('% du capital par an')], ['lump', t('Somme unique')]] as [WithdrawKind, string][]).map(([k, l]) => (
                    <button key={k} type="button" className="chip" aria-pressed={kd === k} onClick={() => kd !== k && setKind(i, k)}>{l}</button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={addPhase}><Icon name="plus" size={20} />{t('Ajouter une phase de retrait')}</button>
        <div className="between"><button type="button" className="btn btn-tertiary" aria-expanded={adv} onClick={() => setAdv(!adv)}>{t('Options avancées')}<Icon name={adv ? 'up' : 'down'} size={20} /></button><InfoTip label={t('Explication des options')}><span>{t('Les versements s’arrêtent au début du premier retrait régulier (mensuel ou en %) ; une somme unique ne les arrête pas. Le montant de chaque phase vaut à son année de début, puis suit l’inflation chaque année si l’indexation est activée. Prélèvements sociaux : appliqués à la part de gains de chaque retrait, pour un PEA de plus de 5 ans (18,6 % depuis janvier 2026) ; les retraits avant 5 ans ferment le PEA et ne sont pas simulés ici.')}</span></InfoTip></div>
        {adv && (
          <div className="stack" style={{ gap: 'var(--space-12)' }}>
            <SwitchRow id="t406-idx" label={t('Indexer mes retraits mensuels sur l’inflation ({p})', { p: pct(infl, 0) })} checked={!!sim.withdrawIndexed && hasMonthly} disabled={!hasMonthly} onChange={(v) => set({ withdrawIndexed: v })} />
            <SwitchRow id="t406-dca" label={t('Continuer mes versements pendant les retraits')} checked={!!sim.keepDca} onChange={(v) => set({ keepDca: v })} />
            <SwitchRow id="t406-tax" label={t('Déduire les prélèvements sociaux ({p})', { p: pct(taxRate, 1) })} checked={!!sim.withdrawTax} onChange={(v) => set({ withdrawTax: v })} />
          </div>
        )}
      </section>

      {phases.length === 0 && (
        <section aria-labelledby="t406-empty" className="card g12 dspan-7 dstart">
          <div className="between"><h2 id="t406-empty">{t('Ce que vous pouvez simuler')}</h2><InfoTip><span>{t('Vous pouvez les enchaîner : une somme unique, puis un pourcentage ensuite, en gardant ou non vos versements mensuels. La courbe, le taux de réussite et les scénarios aléatoires apparaissent dès la première phase.')}</span></InfoTip></div>
          <p className="t-body">{t('Chaque phase de retrait commence à l’année de votre choix et peut être de trois types :')}</p>
          <ul className="stack-8">
            <li className="t-body"><strong>{t('€ par mois')}</strong> — {t('par exemple 1 500 € par mois à partir de l’année 20.')}</li>
            <li className="t-body"><strong>{t('% du capital par an')}</strong> — {t('par exemple 4 % : le retrait suit la valeur du capital.')}</li>
            <li className="t-body"><strong>{t('Somme unique')}</strong> — {t('par exemple 100 000 € l’année 10 pour un apport immobilier.')}</li>
          </ul>
        </section>
      )}
      {phases.length > 0 && (
        <>
          <section aria-label={t('Résultats')} className="stack-8 dspan-7 dstart">
            <div className="hero" style={{ gap: 'var(--space-4)' }} data-component="Card.hero">
              {depletedYear !== null ? (
                <>
                  <span className="overline">{t('Capital épuisé')}{constant ? ' ' + t('(euros constants)') : ''}</span>
                  <span className="t-display">{t('année {y}', { y: Math.ceil(depletedYear) })}</span>
                  <span className="t-caption c-reverse-muted">{t('Il manque {u} de retraits sur les {n} ans simulés.', { u: eur(res.unpaid * f(ys), 0), n: ys })}</span>
                </>
              ) : (
                <>
                  <span className="overline">{tn(ys, 'Capital final dans {n} an', 'Capital final dans {n} ans')}{constant ? ' ' + t('(euros constants)') : ''}</span>
                  <span className="t-display">{eur(last.value, 0)}</span>
                  <span className="t-caption c-reverse-muted">{t('Tous vos retraits sont couverts jusqu’à l’horizon.')}</span>
                </>
              )}
            </div>
            <div className="grid-2">
              <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
                <span className="row t-caption c-moderate" style={{ gap: 'var(--space-6)' }}><span style={{ width: 10, height: 10, borderRadius: 'var(--radius-2)', background: 'var(--chart-6)' }} />{t('Retraits nets cumulés')}</span>
                <span className="value">{eur(last.withdrawn, 0)}</span>
              </div>
              <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
                <span className="row t-caption c-moderate" style={{ gap: 'var(--space-6)' }}>{ok ? t('Taux de réussite') : t('Capital médian final')}</span>
                <span className="value" style={{ color: ok ? (mc!.successRate >= 0.9 ? 'var(--success-text)' : mc!.successRate >= 0.75 ? 'var(--warning-text)' : 'var(--critical-text)') : undefined }}>{ok ? pct(mc!.successRate, 0) : mc ? eur(mc.p50[mc.p50.length - 1] * f(ys), 0) : '–'}</span>
              </div>
              <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
                <span className="t-caption c-moderate">{sim.withdrawTax ? t('Prélèvements sociaux payés') : t('Versements cumulés')}</span>
                <span className="value">{eur(sim.withdrawTax ? last.tax : last.deposited, 0)}</span>
              </div>
              {mc && <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard"><span className="t-caption c-moderate">{t('Mauvais scénario (10 %)')}</span><span className="value">{eur(mc.p10[mc.p10.length - 1] * f(ys), 0)}</span></div>}
            </div>
          </section>

          <section aria-labelledby="t406-chart" className="card dspan-8 dstart">
            <h2 id="t406-chart">{t('Évolution du capital')}</h2>
            <WithdrawChart points={points} band={band} startYear={res.startYear} depletedYear={depletedYear} label={t('Capital simulé sur {n} ans avec retraits : {v} à l’horizon, {w} retirés au total', { n: ys, v: eur(last.value, 0), w: eur(last.withdrawn, 0) })} />
            <div className="legend">
              <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--brand-primary)' }} />{t('Capital (rendement constant)')}</span>
              <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-6)' }} />{t('Retraits cumulés')}</span>
              {band && <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-value)', opacity: 0.35 }} />{t('Scénarios aléatoires (10 % à 90 %)')}</span>}
              <span><span style={{ width: 0, height: 12, borderLeft: '2px dashed var(--text-moderate)' }} />{t('Début des retraits')}</span>
            </div>
            <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} aria-expanded={advChart} onClick={() => setAdvChart(!advChart)}>{t('Options avancées')}<Icon name={advChart ? 'up' : 'down'} size={20} /></button>
            {advChart && (
              <div className="stack" style={{ gap: 'var(--space-12)' }}>
                <SwitchRow id="t406-mc" label={t('Afficher les scénarios aléatoires (Monte Carlo)')} checked={showMc} onChange={setShowMc} />
                <SwitchRow id="t406-fees" label={t('Déduire mes frais (frais courants et courtage)')} checked={fees && cost.securities > 0} disabled={cost.securities <= 0} onChange={setFees} />
                <SwitchRow id="t406-const" label={t('Afficher en euros constants (inflation {p})', { p: pct(infl, 0) })} checked={constant} onChange={setConstant} />
              </div>
            )}
          </section>

          <section aria-labelledby="t406-mcs" className="card g12 dspan-4 dstart">
            <div className="between"><h2 id="t406-mcs">{t('Scénarios aléatoires')}</h2><InfoTip>
              {mc && kinds.includes('lump') && mc.successRate < 1 && <span>{t('Une somme unique est due à une date précise (prélèvements sociaux compris si activés) : si le marché a été mauvais avant cette date, le capital ne la couvre pas en entier, ce qui compte comme un échec. Retarder la date, baisser la somme ou continuer les versements améliore ce taux.')}</span>}
              <span>{t('Chaque scénario tire des rendements mensuels au hasard autour de votre rendement annuel (médiane) avec la volatilité choisie ; 15 % correspond à peu près à un ETF actions mondial. Les rendements sont supposés indépendants d’un mois à l’autre : les vraies crises durent plus longtemps. Les résultats sont les mêmes à chaque affichage.')}</span>
            </InfoTip></div>
            <VolatilitySlider />
            {mc && (
              <p className="t-body">
                {hasFixed
                  ? t('Sur {n} scénarios de marché, {p} tiennent jusqu’à l’horizon sans épuiser le capital.', { n: num(mc.paths, 0), p: pct(mc.successRate, 0) })
                  : t('Sur {n} scénarios de marché, le capital final se situe entre {a} (mauvais cas) et {b} (bon cas).', { n: num(mc.paths, 0), a: eur(mc.p10[mc.p10.length - 1] * f(ys), 0), b: eur(mc.p90[mc.p90.length - 1] * f(ys), 0) })}
                {mc.medianDepletionYear !== null && hasFixed ? ' ' + t('Quand le capital s’épuise, c’est en général vers l’année {y}.', { y: mc.medianDepletionYear }) : ''}
              </p>
            )}
          </section>

          <button type="button" className="btn btn-secondary block dspan-12" aria-expanded={table} onClick={() => setTable(!table)}>{t('Tableau année par année')}<Icon name={table ? 'up' : 'down'} size={20} /></button>
          {table && (
            <section className="table-wrap dspan-12" data-component="Table">
              <table>
                <caption className="sr-only">{t('Capital simulé année par année avec retraits')}</caption>
                <thead><tr><th scope="col">{t('Année')}</th><th scope="col">{t('Versements cumulés')}</th><th scope="col">{t('Retraits cumulés')}</th><th scope="col">{t('Capital total')}</th></tr></thead>
                <tbody>{points.slice(1).map((y) => (
                  <tr key={y.year}><th scope="row">{Math.ceil(y.year)}</th><td>{eur(y.deposited, 0)}</td><td className="c-success">{eur(y.withdrawn, 0)}</td><td className="t-amount-s">{eur(y.value, 0)}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ calculette
const UNKNOWNS: [Unknown, string][] = [['monthly', 'Retrait'], ['years', 'Durée'], ['capital', 'Capital'], ['rate', 'Rendement']];

function CalcTab() {
  const { data, summary } = useCalc();
  const sim = data.simulation;
  const [unk, setUnk] = useState<Unknown>('monthly');
  const [src, setSrc] = useState<'free' | 'pea' | 'sim'>('sim');
  const [capFree, setCapFree] = useState(300000);
  const [rate, setRate] = useState(Math.round(sim.annualRate * 1000) / 10);
  const [wMode, setWMode] = useState<'eur' | 'pct'>('eur');
  const [wEur, setWEur] = useState(1500);
  const [wPct, setWPct] = useState(4);
  const [years, setYears] = useState(25);
  const [target, setTarget] = useState(0);
  const [idx, setIdx] = useState(!!sim.withdrawIndexed);
  const [infl, setInfl] = useState((sim.inflation ?? DEFAULT_INFLATION) * 100);
  const [tax, setTax] = useState(!!sim.withdrawTax);
  const [taxPct, setTaxPct] = useState((sim.withdrawTaxRate ?? DEFAULT_TAX_RATE) * 100);
  const [showMc, setShowMc] = useState(true);
  const [adv, setAdv] = useState(false);
  const [advChart, setAdvChart] = useState(false);
  const vol = sim.volatility ?? DEFAULT_VOLATILITY;

  // capital de départ : saisi, valeur actuelle du PEA, ou capital simulé au moment où les retraits commencent
  const accum = useMemo(() => run({ ...configFromSim(sim), withdrawals: [] }), [sim]);
  const startY = Math.min(accum.years.length - 1, Math.max(0, (sim.withdrawals?.length ? Math.min(...sim.withdrawals.map((p) => p.fromYear)) : sim.horizonYears) - 1));
  const simCap = accum.years[startY]?.value ?? 0, simBasis = accum.years[startY]?.deposited ?? 0;
  const capital = unk === 'capital' ? 0 : src === 'pea' ? summary.totalValue : src === 'sim' ? simCap : capFree;
  const basis = unk === 'capital' ? undefined : src === 'pea' ? Math.min(summary.totalDeposited, capital) : src === 'sim' ? Math.min(simBasis, capital) : undefined;
  const pctMode = wMode === 'pct' && unk !== 'capital' && unk !== 'monthly';
  const monthly = pctMode ? (capital * wPct) / 100 / 12 : wEur;
  const input: CalcInput = { capital, rate: rate / 100, monthly, years, target, indexed: idx, inflation: infl / 100, tax, taxRate: taxPct / 100, basis };
  const sol = useMemo(() => solve(unk, input), [unk, capital, rate, monthly, years, target, idx, infl, tax, taxPct, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = sol.status !== 'incomplete';
  const resolved: CalcInput = { ...input, [unk]: ready ? sol.value : 0 };
  const horizon = unk === 'years' ? (sol.status === 'durable' ? 40 : Math.min(MAX_CALC_YEARS, Math.ceil(sol.value) + 2)) : Math.max(1, Math.min(MAX_CALC_YEARS, years));
  const cfg = useMemo(() => ({ ...calcConfig(resolved, horizon), allowNegative: false }), [unk, sol.value, capital, rate, monthly, years, target, idx, infl, tax, taxPct, basis, horizon]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => run(cfg), [cfg]);
  const dCfg = useDeferredValue(cfg), dVol = useDeferredValue(vol);
  const mc = useMemo(() => (ready && resolved.monthly > 0 ? monteCarlo(dCfg, dVol) : null), [dCfg, dVol, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const band = mc && showMc && mc.p50.length === res.years.length ? { p10: mc.p10, p50: mc.p50, p90: mc.p90 } : undefined;
  const depletedYear = res.depletedMonth !== null ? res.depletedMonth / 12 : null;
  const outCap = resolved.capital, outMonthly = resolved.monthly;

  let headline = '', sub = '';
  if (!ready) headline = t('Renseignez la durée pour obtenir le résultat.');
  else switch (unk) {
    case 'monthly':
      headline = sol.status === 'zero' ? t('Aucun retrait possible : le capital visé n’est déjà pas atteint.') : t('Vous pouvez retirer {v} par mois', { v: eur(sol.value, 0) });
      if (sol.status === 'ok' && capital > 0) sub = t('Soit {p} du capital par an (règle des 4 % : {r}).', { p: pct((sol.value * 12) / capital, 2), r: eur((capital * 0.04) / 12, 0) });
      break;
    case 'years':
      headline = sol.status === 'durable' ? t('Capital durable : les intérêts couvrent ce retrait') : t('Votre capital tient {d}', { d: yearsText(sol.value) });
      if (sol.status === 'durable') sub = t('Même après {n} ans, le capital n’est pas épuisé.', { n: MAX_CALC_YEARS });
      break;
    case 'capital':
      headline = t('Il vous faut {v}', { v: eur(sol.value, 0) });
      sub = t('pour retirer {m} par mois pendant {d}.', { m: eur(monthly, 0), d: yearsText(years) });
      break;
    case 'rate':
      headline = sol.status === 'zero' ? t('0 % suffit : votre capital couvre déjà ces retraits') : sol.status === 'impossible' ? t('Inaccessible : il faudrait plus de 50 % par an') : t('Rendement annuel requis : {v}', { v: pct(sol.value, 2) });
      break;
  }
  return (
    <>
      <section aria-labelledby="t406-calc" className="card g16 dspan-5 dstart">
        <h2 id="t406-calc">{t('Que cherchez-vous ?')}</h2>
        <div role="group" aria-label={t('Variable à calculer')} className="chips g6">
          {UNKNOWNS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={unk === k} onClick={() => setUnk(k)}>{t(l)}</button>)}
        </div>
        {unk === 'capital' ? <NumField label={t('Capital de départ (€)')} value={sol.value} result suffix="€" /> : (
          <>
            <Segmented label={t('Source du capital')} value={src} onChange={setSrc} options={[['free', t('Saisi')], ['pea', t('Mon PEA')], ['sim', t('Fin d’épargne')]]} />
            {src === 'free' ? <NumField label={t('Capital de départ (€)')} value={capFree} onChange={setCapFree} suffix="€" />
              : <p className="t-body-strong">{t('Capital de départ : {c}', { c: eur(capital, 0) })}<span className="t-caption c-moderate">{src === 'pea' ? ' ' + t('(valeur actuelle de votre PEA)') : ' ' + t('(capital simulé au début des retraits)')}</span></p>}
          </>
        )}
        {unk === 'rate' ? <NumField label={t('Rendement annuel (%)')} value={sol.value * 100} decimals={2} result suffix="%" /> : <NumField label={t('Rendement annuel (%)')} value={rate} onChange={setRate} decimals={1} suffix="%" max={50} />}
        {unk === 'monthly' ? <NumField label={t('Retrait mensuel (€)')} value={sol.value} result suffix="€" hint={capital > 0 && sol.status === 'ok' ? t('{p} du capital par an', { p: pct((sol.value * 12) / capital, 2) }) : undefined} />
          : (
            <>
              {unk !== 'capital' && <Segmented label={t('Saisir le retrait en')} value={wMode} onChange={setWMode} options={[['eur', t('€ par mois')], ['pct', t('% du capital par an')]]} />}
              {pctMode ? <NumField label={t('Taux de retrait annuel (%)')} value={wPct} onChange={setWPct} decimals={2} suffix="%" hint={t('Soit {m} par mois', { m: eur(monthly, 0) })} />
                : <NumField label={t('Retrait mensuel (€)')} value={wEur} onChange={setWEur} suffix="€" hint={unk !== 'capital' && capital > 0 ? t('{p} du capital par an', { p: pct((wEur * 12) / capital, 2) }) : undefined} />}
            </>
          )}
        {unk === 'years' ? <NumField label={t('Durée')} value={sol.value} result decimals={1} suffix={t('ans')} hint={sol.status === 'durable' ? t('Plus de {n} ans', { n: MAX_CALC_YEARS }) : yearsText(sol.value)} /> : <NumField label={t('Durée (années)')} value={years} onChange={setYears} suffix={t('ans')} max={MAX_CALC_YEARS} />}
        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} aria-expanded={adv} onClick={() => setAdv(!adv)}>{t('Options avancées')}<Icon name={adv ? 'up' : 'down'} size={20} /></button>
        {adv && (
          <div className="stack" style={{ gap: 'var(--space-12)' }}>
          <NumField label={t('Capital restant visé à la fin (€)')} value={target} onChange={setTarget} suffix="€" hint={unk === 'years' ? t('La durée se termine quand le capital passe sous cette somme.') : undefined} />
            <SwitchRow id="t406-c-idx" label={t('Indexer le retrait sur l’inflation')} checked={idx} onChange={setIdx} />
            {idx && <NumField label={t('Inflation annuelle (%)')} value={infl} onChange={setInfl} decimals={1} suffix="%" max={30} />}
            <SwitchRow id="t406-c-tax" label={t('Déduire les prélèvements sociaux')} checked={tax} onChange={setTax} />
            {tax && <NumField label={t('Taux des prélèvements sociaux (%)')} value={taxPct} onChange={setTaxPct} decimals={1} suffix="%" max={50} hint={basis === undefined ? t('Capital supposé sans gain : seuls les gains futurs sont taxés.') : undefined} />}
          </div>
        )}
      </section>

      <div className="dspan-7 dstart stack-12">
      <section aria-label={t('Résultat')} className="stack-8">
        <div className="hero" style={{ gap: 'var(--space-4)' }} data-component="Card.hero">
          <span className="overline">{t('Résultat')}</span>
          <span className="t-display" style={{ fontSize: 'clamp(22px, 7vw, 32px)', lineHeight: 1.2 }}>{headline}</span>
          {sub && <span className="t-caption c-reverse-muted">{sub}</span>}
        </div>
        {mc && (
          <div className="grid-2">
            <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
              <span className="t-caption c-moderate">{t('Taux de réussite')}</span>
              <span className="value" style={{ color: mc.successRate >= 0.9 ? 'var(--success-text)' : mc.successRate >= 0.75 ? 'var(--warning-text)' : 'var(--critical-text)' }}>{pct(mc.successRate, 0)}</span>
            </div>
            <div className="kpi" style={{ paddingBottom: 'var(--space-12)' }} data-component="KpiCard">
              <span className="t-caption c-moderate">{t('Capital restant (médiane)')}</span>
              <span className="value">{eur(mc.p50[mc.p50.length - 1], 0)}</span>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="t406-cchart" className="card">
        <div className="between"><h2 id="t406-cchart">{t('Évolution du capital')}</h2><InfoTip><span>{t('Retraits en fin de mois, rendement composé constant (sauf scénarios aléatoires), hors frais. Le taux de réussite est la part des scénarios où tous les retraits sont payés jusqu’à la fin de la durée.')}</span></InfoTip></div>
        {ready && outCap > 0 && outMonthly > 0 ? (
          <WithdrawChart points={res.years} band={band} startYear={null} depletedYear={depletedYear} label={t('Capital de {c} avec {m} retirés par mois pendant {n} ans', { c: eur(outCap, 0), m: eur(outMonthly, 0), n: horizon })} />
        ) : <p className="t-caption c-moderate">{t('Renseignez un capital et un retrait pour tracer la courbe.')}</p>}
        <div className="legend">
          <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--brand-primary)' }} />{t('Capital (rendement constant)')}</span>
          <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-6)' }} />{t('Retraits cumulés')}</span>
          {band && <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-value)', opacity: 0.35 }} />{t('Scénarios aléatoires (10 % à 90 %)')}</span>}
        </div>
        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} aria-expanded={advChart} onClick={() => setAdvChart(!advChart)}>{t('Options avancées')}<Icon name={advChart ? 'up' : 'down'} size={20} /></button>
        {advChart && (
          <div className="stack" style={{ gap: 'var(--space-12)' }}>
            <SwitchRow id="t406-c-mc" label={t('Afficher les scénarios aléatoires (Monte Carlo)')} checked={showMc} onChange={setShowMc} />
            <VolatilitySlider />
          </div>
        )}
      </section>
      </div>
    </>
  );
}
