// Simulateur › Plans › un plan : ventes, argent disponible, stratégie visée, ordres et effets avant / après
import { useEffect, useMemo, useState } from 'react';
import { Segmented, Sheet, SubHeader, Empty, Switch, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { back, navigate } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { dateFr, eur, eurSigned, num, pct, pctSigned, pts, todayIso, NBSP } from '../domain/format';
import { computePlan, currentStrategy, instrumentOf, planBacktest, planTargets, sellQuantity, CONVERGED_PTS, MAX_CONVERGE_MONTHS, type PlanResult, type PlanWarning } from '../domain/plan';
import type { AppData, Plan } from '../domain/types';
import { catKey } from '../data/seed';
import { getData, newId, replaceData, update } from '../data/store';
import { t, tl, tn } from '../i18n';
import { addCatalogEtf } from './Markets';
import { Dot, EtfPickerSheet, MoneyField, planDrafts, shortName } from './PlanParts';
import { brokerLabel } from './BrokerParts';

export function PlanScreen({ id }: { id: string }) {
  const { data } = useCalc();
  const saved = (data.plans ?? []).find((p) => p.id === id);
  // Un plan neuf n'existe que comme brouillon tant qu'on n'a pas appuyé sur « Enregistrer ».
  const [seed] = useState<Plan | undefined>(() => saved ?? planDrafts.get(id));
  const plan = saved ?? seed;
  if (!plan) {
    return (
      <div className="screen">
        <SubHeader title={t('Plan')} fallback="/simulateur/plans" />
        <main className="content"><Empty icon="inbox" title={t('Plan introuvable')} text={t('Ce plan a été supprimé.')} action={<button type="button" className="btn btn-primary" onClick={() => navigate('/simulateur/plans', { replace: true })}>{t('Retour aux plans')}</button>} /></main>
      </div>
    );
  }
  return <PlanEditor key={plan.id} saved={saved} initial={plan} data={data} />;
}

const warnText = (w: PlanWarning): string => {
  switch (w) {
    case 'noTarget': return t('Aucune stratégie visée : choisissez « Nouvelle cible » ou définissez la stratégie de l’app pour obtenir des achats.');
    case 'noPrice': return t('Un ETF visé n’a pas de cours connu : ses achats ne peuvent pas être calculés.');
    case 'shortfall': return t('Le retrait demandé dépasse l’argent disponible : le budget d’achat est ramené à zéro.');
    case 'withdraw': return t('Sortir de l’argent du PEA n’est pas neutre : vendre puis réinvestir dans le PEA n’est pas imposé, mais un retrait peut l’être (prélèvements sociaux sur la part de gains). Vérifiez avant d’agir.');
    case 'pea5y': return t('Votre PEA a moins de 5 ans : en principe, un retrait entraîne la clôture du plan. Ne retirez rien sans avoir vérifié les règles.');
    case 'indicative': return t('Le cours de certains ETF vient du catalogue et reste indicatif : vérifiez-le chez votre courtier avant de passer les ordres.');
    case 'nothingToSell': return t('Aucune vente valide : vérifiez le nombre de parts.');
    case 'unusedBudget': return t('Une partie du budget reste inutilisée : les parts entières sont trop chères pour combler les écarts restants.');
  }
};

function PlanEditor({ saved, initial, data }: { saved: Plan | undefined; initial: Plan; data: AppData }) {
  const { positions } = useCalc();
  const [plan, setPlan] = useState<Plan>(() => structuredClone(saved ?? initial));
  useEffect(() => () => { planDrafts.delete(initial.id); }, [initial.id]); // quitter l'écran abandonne un plan jamais enregistré
  const dirty = !saved || JSON.stringify(plan) !== JSON.stringify(saved);
  const r = useMemo(() => computePlan(data, plan), [data, plan]);
  const backtest = useMemo(() => planBacktest(data, r), [data, r]);
  const [targetSheet, setTargetSheet] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [alsoStrategy, setAlsoStrategy] = useState(plan.targets !== null);
  const [exp, setExp] = useState<'sec' | 'geo'>('sec');
  /** Modifie le brouillon local : rien n'est conservé tant qu'on n'a pas appuyé sur « Enregistrer ». */
  const patch = (fn: (p: Plan) => void) => setPlan((cur) => { const c = structuredClone(cur); fn(c); return c; });
  const save = () => {
    const final: Plan = { ...structuredClone(plan), name: plan.name.trim() || t('Plan sans nom') };
    update((d) => {
      const list = d.plans ?? [];
      const i = list.findIndex((x) => x.id === final.id);
      if (i >= 0) list[i] = final; else list.push(final);
      d.plans = list;
    });
    planDrafts.delete(final.id);
    setPlan(final);
    showToast(t('Plan enregistré'));
  };
  const held = positions.filter((p) => p.quantity > 0);
  const targets = planTargets(data, plan);
  const custom = plan.targets !== null;
  const name = (k: string) => shortName(data, k);
  const colorIdx = (k: string) => r.rows.findIndex((x) => x.key === k);

  const setSell = (etfId: string, mode: 'keep' | 'part' | 'all', qty: number) => patch((p) => {
    p.sells = p.sells.filter((s) => s.etfId !== etfId);
    if (mode === 'all') p.sells.push({ etfId, kind: 'all', value: 0 });
    if (mode === 'part') p.sells.push({ etfId, kind: 'qty', value: Math.max(1, Math.min(qty, 1e6)) });
  });

  const remove = () => {
    const prev = getData();
    planDrafts.delete(plan.id);
    if (saved) update((d) => { d.plans = (d.plans ?? []).filter((x) => x.id !== plan.id); });
    back('/simulateur/plans');
    showToast(saved ? t('Plan supprimé') : t('Plan abandonné'), saved ? { undo: () => replaceData(prev) } : undefined);
  };
  const duplicate = () => {
    const copy: Plan = { ...structuredClone(plan), id: newId('plan'), name: t('{n} (copie)', { n: plan.name }), createdAt: new Date().toISOString() };
    planDrafts.set(copy.id, copy);
    navigate('/simulateur/plan/' + copy.id, { replace: true });
  };
  const adopt = () => {
    const prev = getData();
    for (const k of Object.keys(targets)) {
      if (data.etfs.some((e) => e.id === k)) continue;
      const c = data.catalog.find((x) => catKey(x) === k);
      if (c) addCatalogEtf(c);
    }
    update((d) => {
      for (const e of d.etfs) { const w = targets[e.id] || 0; e.inStrategy = w > 0; d.targetAllocation[e.id] = w; }
    });
    showToast(t('Stratégie de l’app mise à jour'), { undo: () => replaceData(prev) });
  };
  /** Écrit le plan dans le journal : versement, ventes, retrait, achats (au dernier cours, frais estimés), à corriger après exécution. */
  const applyPlan = () => {
    const prev = getData();
    const date = todayIso();
    for (const b of r.buys) {
      if (data.etfs.some((e) => e.id === b.key)) continue;
      const c = data.catalog.find((x) => catKey(x) === b.key);
      if (c) addCatalogEtf(c);
    }
    update((d) => {
      if (r.deposit > 0) d.deposits.push({ id: newId('d'), date, amount: r.deposit });
      for (const x of r.sells) d.transactions.push({ id: newId('s'), date, etfId: x.key, unitPrice: x.price, quantity: -x.qty, grossAmount: -x.net, fees: x.fee, feeRefund: 0 });
      if (r.withdraw > 0) d.deposits.push({ id: newId('w'), date, amount: -r.withdraw });
      for (const b of r.buys) d.transactions.push({ id: newId('b'), date, etfId: b.key, unitPrice: b.price, quantity: b.qty, grossAmount: Math.round((b.cost + b.fee) * 100) / 100, fees: b.fee, feeRefund: 0 });
      if (alsoStrategy && Object.keys(targets).length) for (const e of d.etfs) { const w = targets[e.id] || 0; e.inStrategy = w > 0; d.targetAllocation[e.id] = w; }
    });
    setApplyOpen(false);
    navigate('/historique/journal', { replace: true });
    showToast(t('Plan enregistré dans le journal : corrigez les montants après exécution chez le courtier'), { undo: () => replaceData(prev) });
  };
  const copyOrders = async () => {
    const lines = [
      ...r.sells.map((s) => t('VENDRE {q} × {n} (≈ {p})', { q: s.qty, n: instrumentOf(data, s.key)?.name ?? s.key, p: eur(s.price) })),
      ...r.buys.map((b) => t('ACHETER {q} × {n} (≈ {p})', { q: b.qty, n: instrumentOf(data, b.key)?.name ?? b.key, p: eur(b.price) })),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); showToast(t('Ordres copiés')); } catch { showToast(t('Copie impossible sur cet appareil'), { error: true }); }
  };

  const gapTxt = (g: number | null) => (g === null ? '—' : num(g, 1));
  const heroSells = r.sells.length > 0;

  return (
    <div className="screen" data-screen="T4-11">
      <SubHeader title={t('Plan')} fallback="/simulateur/plans" />
      <main className="content dgrid">
        <section className="card g8 dspan-12">
          <label className="field">
            <span className="lbl">{t('Nom du plan')}</span>
            <input className="input" value={plan.name} maxLength={60} onChange={(e) => patch((p) => { p.name = e.target.value; })} />
          </label>
        </section>

        <details className="explain dspan-12" open={!plan.sells.length && !plan.deposit && plan.targets === null || undefined}>
          <summary style={{ cursor: 'pointer', font: 'var(--type-caption-strong)', minHeight: 32, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="info" size={18} />{t('Comment lire ce plan ?')}</summary>
          <ol>
            <li>{t('1 · Choisissez ce que vous vendriez (rien, une partie ou tout d’un ETF).')}</li>
            <li>{t('2 · Indiquez si vous ajoutez de l’argent (versement) ou si vous en retirez du PEA.')}</li>
            <li>{t('3 · Choisissez la répartition que vous voulez atteindre (la stratégie actuelle ou une nouvelle cible).')}</li>
            <li>{t('Le résultat en bref, plus bas, dit ce qu’il faudrait vendre et acheter, et ce que cela change. Rien n’est exécuté tant que vous ne touchez pas « Appliquer ce plan ».')}</li>
          </ol>
          <button type="button" className="link" onClick={() => navigate('/parametres/aide?q=plans')}>{t('En savoir plus dans l’aide')}</button>
        </details>

        <section aria-labelledby="t411-sell" className="card dspan-7">
          <h2 id="t411-sell">{t('1 · Ce que je vends')}</h2>
          {held.length === 0 ? <p className="c-neutral">{t('Vous ne détenez encore aucune part : rien à vendre.')}</p> : (
            <ul>
              {held.map((p, i) => {
                const s = plan.sells.find((x) => x.etfId === p.etfId);
                const mode = !s ? 'keep' : s.kind === 'all' ? 'all' : 'part';
                const line = r.sells.find((x) => x.key === p.etfId);
                const q = s ? sellQuantity(s, p.quantity) : 0;
                return (
                  <li key={p.etfId} className="stack-8" style={{ padding: 'var(--space-12) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                    <span className="row" style={{ gap: 'var(--space-10)' }}>
                      <Dot id={p.etfId} i={i} />
                      <span className="stack grow">
                        <span className="t-strong ellipsis">{name(p.etfId)} <span className="t-caption c-moderate">· {p.etfId}</span></span>
                        <span className="t-caption c-moderate">{tn(p.quantity, '{n} part', '{n} parts')} · {eur(p.marketValue)} · {t('PRU {p}', { p: eur(p.pru) })}</span>
                      </span>
                      <span className={'t-caption-strong ' + (p.unrealizedPnl >= 0 ? 'c-success' : 'c-critical')}>{eurSigned(p.unrealizedPnl, 0)}</span>
                    </span>
                    <div role="group" aria-label={t('Vendre {n}', { n: name(p.etfId) })} className="seg">
                      {([['keep', t('Garder')], ['part', t('Partie')], ['all', t('Tout')]] as const).map(([m, l]) => (
                        <button key={m} type="button" aria-pressed={mode === m}
                          onClick={() => setSell(p.etfId, m, m === 'part' ? Math.max(1, Math.floor(p.quantity / 2)) : 0)}>{l}</button>
                      ))}
                    </div>
                    {mode === 'part' && (
                      <label className="row" style={{ gap: 'var(--space-8)' }}>
                        <span className="t-caption c-neutral">{t('Parts à vendre')}</span>
                        <input type="number" min={1} max={p.quantity} value={s?.kind === 'qty' ? s.value : q} className="input" style={{ width: 84, height: 'var(--touch-min)', padding: '0 var(--space-6)', font: 'var(--type-body-strong)', textAlign: 'center' }}
                          aria-label={t('Parts de {n} à vendre', { n: name(p.etfId) })}
                          onChange={(e) => setSell(p.etfId, 'part', Math.min(p.quantity, Math.max(1, Number(e.target.value) || 1)))} />
                        <span className="t-caption c-moderate">/ {p.quantity}</span>
                      </label>
                    )}
                    {line && (
                      <span className="t-caption c-neutral">
                        {t('{q} × {p} = {g}, frais {f} → {n} net', { q: line.qty, p: eur(line.price), g: eur(line.gross), f: eur(line.fee), n: eur(line.net) })}
                        {' · '}<span className={line.gain >= 0 ? 'c-success' : 'c-critical'}>{t('plus-value {g}', { g: eurSigned(line.gain) })}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="t411-cash" className="card g8 dspan-5">
          <h2 id="t411-cash">{t('2 · Argent disponible')}</h2>
          <dl className="dl" style={{ gap: 'var(--space-6) var(--space-12)' }}>
            <dt>{t('Espèces sur le PEA')}</dt><dd>{eur(r.cashBefore)}</dd>
            <dt>{t('Produit net des ventes')}</dt><dd>{r.sells.length ? '+' + eur(r.saleNet) : eur(0)}</dd>
            <dt>{t('Nouveau versement')}</dt><dd>{r.deposit ? '+' + eur(r.deposit) : eur(0)}</dd>
            <dt>{t('Retrait du PEA')}</dt><dd>{r.withdraw ? '−' + eur(r.withdraw) : eur(0)}</dd>
            <dt className="t-strong">{t('Budget d’achat')}</dt><dd className="t-amount-s">{eur(r.budget)}</dd>
          </dl>
          <MoneyField label={t('Nouveau versement prévu')} value={plan.deposit} onChange={(v) => patch((p) => { p.deposit = v; })} />
          <MoneyField label={t('Retrait que je veux faire du PEA')} value={plan.withdraw} onChange={(v) => patch((p) => { p.withdraw = v; })} hint={t('Laissez à 0 pour tout réinvestir dans le PEA.')} />
        </section>

        <section aria-labelledby="t411-tgt" className="card g8 dspan-12">
          <h2 id="t411-tgt">{t('3 · La stratégie que je vise')}</h2>
          <Segmented label={t('Stratégie visée')} value={custom ? 'custom' : 'current'}
            options={[['current', t('Stratégie actuelle')], ['custom', t('Nouvelle cible')]]}
            onChange={(v) => { if (v === 'current') patch((p) => { p.targets = null; }); else { patch((p) => { p.targets = p.targets ?? { ...currentStrategy(data) }; }); setTargetSheet(true); } }} />
          {Object.keys(targets).length === 0 ? (
            <p className="c-neutral t-caption">{t('Aucune stratégie définie pour l’instant.')}</p>
          ) : (
            <ul className="row wrap" style={{ gap: 'var(--space-6) var(--space-12)' }}>
              {Object.entries(targets).sort((a, b) => b[1] - a[1]).map(([k, w], i) => (
                <li key={k} className="row" style={{ gap: 'var(--space-6)' }}><Dot id={k} i={colorIdx(k) >= 0 ? colorIdx(k) : i} size={10} /><span className="t-caption-strong">{name(k)}</span><span className="t-caption c-neutral">{num(w * 100, 0)}{NBSP}%</span></li>
              ))}
            </ul>
          )}
          <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { if (!custom) patch((p) => { p.targets = { ...currentStrategy(data) }; }); setTargetSheet(true); }}><Icon name="pencil" size={20} />{t('Modifier la cible')}</button>
          </div>
        </section>

        {r.warnings.length > 0 && (
          <section className="stack-8 dspan-12" aria-label={t('Points d’attention')}>
            {r.warnings.map((w) => <p key={w} className="banner-info row" role="note" style={{ alignItems: 'flex-start' }}><Icon name="alert" size={18} /><span>{warnText(w)}</span></p>)}
          </section>
        )}

        <section aria-label={t('Résultat')} className="stack-8 dspan-12">
          <h2>{t('Le résultat en bref')}</h2>
          <div className="hero" style={{ gap: 'var(--space-4)' }} data-component="Card.hero">
            <span className="overline">{heroSells ? t('Vous récupérez (net de frais)') : t('Budget d’achat')}</span>
            <span className="t-display">{eur(heroSells ? r.saleNet : r.budget, 2)}</span>
            {heroSells && <span className="t-caption c-reverse-muted">{t('Budget total à réinvestir : {b}', { b: eur(r.budget) })}</span>}
          </div>
          <ul className="card stack-8" data-testid="plan-summary">
            <li>{r.sells.length ? t('Vous vendez : {l}.', { l: r.sells.map((x) => (x.all ? '' : x.qty + ' × ') + name(x.key)).join(', ') }) : t('Vous ne vendez rien.')}</li>
            <li>{r.buys.length ? t('Vous achetez : {l}.', { l: r.buys.map((x) => x.qty + ' × ' + name(x.key)).join(', ') }) : t('Vous n’achetez rien.')}</li>
            {r.gapBefore !== null && <li>{t('Votre portefeuille passe de {a} à {b} points d’écart avec la cible (0 = exactement dans la cible).', { a: num(r.gapBefore, 1), b: num(r.gapAfter!, 1) })}</li>}
            {r.valueAfter > 0 && <li>{t('Frais de gestion moyens : {a} → {b} par an.', { a: pct(r.terBefore, 2), b: pct(r.terAfter, 2) })}</li>}
            {r.feesTotal > 0 && <li>{t('Frais de courtage du plan : {f}.', { f: eur(r.feesTotal) })}</li>}
          </ul>
        </section>

        <section aria-labelledby="t411-orders" className="card dspan-6">
          <h2 id="t411-orders">{t('Ordres à passer chez le courtier')}</h2>
          {r.sells.length === 0 && r.buys.length === 0 && <p className="c-neutral">{t('Aucun ordre : ajoutez une vente, un versement ou une stratégie.')}</p>}
          {r.sells.length > 0 && (
            <>
              <h3 className="t-label c-neutral">{t('À vendre')}</h3>
              <ul>{r.sells.map((s, i) => (
                <li key={s.key} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto', padding: 'var(--space-8) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                  <Dot id={s.key} i={i} />
                  <span className="stack"><span className="t-strong">{name(s.key)}</span><span className="t-caption c-moderate">{tn(s.qty, '{n} part × {p}', '{n} parts × {p}', { p: eur(s.price) })}{s.all ? ' · ' + t('ligne soldée') : ''}</span></span>
                  <span className="t-amount-s">+{eur(s.gross)}</span>
                </li>
              ))}</ul>
            </>
          )}
          {r.buys.length > 0 && (
            <>
              <h3 className="t-label c-neutral" style={{ paddingTop: 'var(--space-8)' }}>{t('À acheter')}</h3>
              <ul>{r.buys.map((b, i) => (
                <li key={b.key} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto', padding: 'var(--space-8) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                  <Dot id={b.key} i={colorIdx(b.key) >= 0 ? colorIdx(b.key) : i} />
                  <span className="stack"><span className="t-strong">{name(b.key)}</span><span className="t-caption c-moderate">{tn(b.qty, '{n} part × {p}', '{n} parts × {p}', { p: eur(b.price) })}{instrumentOf(data, b.key)?.indicative ? ' · ' + t('cours indicatif') : ''}</span></span>
                  <span className="t-amount-s">−{eur(b.cost)}</span>
                </li>
              ))}</ul>
            </>
          )}
          <dl className="dl" style={{ gap: 'var(--space-6) var(--space-12)', paddingTop: 'var(--space-12)', borderTop: '1px solid var(--divider-minimal)' }}>
            <dt>{t('Frais de courtage estimés')} <span className="t-caption">({tn(r.sells.length + r.buys.length, '{n} ordre', '{n} ordres')} · {brokerLabel(data)})</span></dt><dd>{eur(r.feesTotal)}</dd>
            <dt>{t('Espèces restantes après le plan')}</dt><dd>{eur(r.cashAfter)}</dd>
          </dl>
          {(r.sells.length > 0 || r.buys.length > 0) && (
            <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={copyOrders}><Icon name="list" size={20} />{t('Copier les ordres')}</button>
          )}
          <p className="t-legal c-moderate">{t('Les ventes sont comptées avec les mêmes frais par ordre que les achats ; les cours d’exécution réels peuvent différer.')}</p>
        </section>

        <section aria-labelledby="t411-viz" className="card dspan-6">
          <h2 id="t411-viz">{t('Répartition avant / après')}</h2>
          {([[t('Avant'), 'wBefore'], [t('Après'), 'wAfter'], [t('Cible'), 'wTarget']] as const).map(([lab, f]) => (
            <div key={lab} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 'var(--space-8)', alignItems: 'center' }}>
              <span className="t-caption c-neutral">{lab}</span>
              <div role="img" aria-label={lab + ' : ' + r.rows.filter((x) => x[f] > 0).map((x) => name(x.key) + ' ' + pct(x[f])).join(', ')} className="stack-bar">
                {r.rows.map((x, i) => x[f] > 0 ? <span key={x.key} style={{ width: x[f] * 100 + '%', background: `var(--etf-${x.key}, var(--chart-${(i % 8) + 1}))` }} /> : null)}
              </div>
            </div>
          ))}
          <ul className="stack-4" style={{ paddingTop: 'var(--space-8)' }}>
            {r.rows.map((x, i) => {
              const g = (x.wAfter - x.wTarget) * 100;
              return (
                <li key={x.key} className="row t-caption" style={{ gap: 'var(--space-6)' }}>
                  <Dot id={x.key} i={i} size={10} />
                  <span className="grow ellipsis">{name(x.key)}</span>
                  <span className="c-moderate">{pct(x.wBefore, 0)} → <strong>{pct(x.wAfter, 0)}</strong> / {pct(x.wTarget, 0)}</span>
                  {r.hasTarget && <span className={Math.abs(g) > CONVERGED_PTS ? 'warn-chip' : 't-caption-strong c-neutral'} style={Math.abs(g) > CONVERGED_PTS ? { padding: '0 var(--space-6)' } : undefined}>{pts(g)}</span>}
                </li>
              );
            })}
          </ul>
          <p className="t-legal c-moderate">{t('Pour chaque ETF : part avant → après le plan / cible, puis écart à la cible en points.')}</p>
        </section>

        <section aria-label={t('Ce que ça change')} className="stack-8 dspan-12">
          <h2>{t('Ce que ça change')}</h2>
          <div className="grid-2 dkpis">
            <Kpi label={t('Écart à la cible')} value={r.gapBefore === null ? '—' : num(r.gapBefore, 1) + ' → ' + num(r.gapAfter!, 1)} sub={t('points (0 = dans la cible)')} good={r.gapBefore !== null && r.gapAfter! < r.gapBefore} />
            <Kpi label={t('Frais de gestion moyens')} value={pct(r.terBefore, 2) + ' → ' + pct(r.terAfter, 2)} sub={r.valueAfter > 0 ? t('{a} par an → {b} par an', { a: eur(r.annualCostBefore, 0), b: eur(r.annualCostAfter, 0) }) : ''} good={r.terAfter < r.terBefore} />
            <Kpi label={t('Frais de courtage du plan')} value={eur(r.feesTotal)} sub={r.breakEvenMonths !== null ? t('amortis en {m} grâce à des frais de gestion plus bas', { m: r.breakEvenMonths >= 24 ? tn(Math.round(r.breakEvenMonths / 12), '{n} an', '{n} ans') : tn(r.breakEvenMonths, '{n} mois', '{n} mois') }) : t('une seule fois')} />
            <Kpi label={t('Plus-value réalisée')} value={r.sells.length ? eurSigned(r.realizedGain) : '—'} sub={r.realizedGainPct !== null ? pct(r.realizedGainPct, 1) + ' · ' + t('pas d’impôt tant que l’argent reste dans le PEA') : ''} />
            <Kpi label={t('Nombre de lignes')} value={r.linesBefore + ' → ' + r.linesAfter} sub={t('plus grosse ligne : {a} → {b}', { a: pct(r.topBefore, 0), b: pct(r.topAfter, 0) })} />
            <Kpi label={t('Valeur des titres')} value={eur(r.valueBefore, 0) + ' → ' + eur(r.valueAfter, 0)} sub={t('espèces restantes : {c}', { c: eur(r.cashAfter, 0) })} />
          </div>
        </section>

        {r.hasTarget && (
          <section aria-labelledby="t411-slow" className="card dspan-12">
            <h2 id="t411-slow">{t('Et sans vendre ?')}</h2>
            <MoneyField label={t('Mon versement mensuel')} value={plan.monthly} onChange={(v) => patch((p) => { p.monthly = v; })} />
            <p>
              {r.convergeMonths === -1 && t('Votre portefeuille est déjà à moins de {p} points de la cible : inutile de vendre.', { p: CONVERGED_PTS })}
              {r.convergeMonths === null && t('Sans vendre, avec {m} par mois, il faudrait plus de {y} ans pour approcher la cible à {p} points près.', { m: eur(plan.monthly, 0), y: MAX_CONVERGE_MONTHS / 12, p: CONVERGED_PTS })}
              {r.convergeMonths !== null && r.convergeMonths > 0 && t('Sans vendre, avec {m} par mois dirigés vers les ETF en retard, il faudrait environ {d} pour approcher la cible à {p} points près.', { m: eur(plan.monthly, 0), d: r.convergeMonths >= 24 ? tn(Math.round(r.convergeMonths / 12), '{n} an', '{n} ans') : tn(r.convergeMonths, '{n} mois', '{n} mois'), p: CONVERGED_PTS })}
            </p>
            <p className="t-legal c-moderate">{t('Estimation à cours constants : les nouveaux versements comblent d’abord les plus gros écarts, sans aucune vente.')}</p>
          </section>
        )}

        {backtest && (
          <section aria-labelledby="t411-past" className="card g8 dspan-12" data-testid="backtest">
            <h2 id="t411-past">{t('Et sur le passé ?')}</h2>
            <p className="c-neutral">{t('Si la répartition d’aujourd’hui et celle d’après le plan avaient été achetées le {d} puis conservées, voici ce qu’elles auraient donné jusqu’à aujourd’hui.', { d: dateFr(backtest.from) })}</p>
            <div className="grid-2 dkpis">
              <Kpi label={t('Performance')} value={pctSigned(backtest.before.ret) + ' → ' + pctSigned(backtest.after.ret)} sub={t('avant le plan → après le plan')} good={backtest.after.ret > backtest.before.ret} />
              <Kpi label={t('Volatilité annuelle')} value={(backtest.before.vol === null ? '—' : pct(backtest.before.vol, 1)) + ' → ' + (backtest.after.vol === null ? '—' : pct(backtest.after.vol, 1))} sub={t('plus bas = variations plus calmes')} good={backtest.before.vol !== null && backtest.after.vol !== null && backtest.after.vol < backtest.before.vol} />
              <Kpi label={t('Pire baisse')} value={pct(backtest.before.maxDd, 1) + ' → ' + pct(backtest.after.maxDd, 1)} sub={t('du sommet au creux suivant')} good={backtest.after.maxDd > backtest.before.maxDd} />
            </div>
            <p className="t-legal c-moderate">
              {t('Sur {n} séances seulement ({d} → {e}) : une période courte ne dit rien de l’avenir, et le plan aurait pu paraître meilleur ou moins bon sur une autre année. Aucun frais ni versement n’est compté ici.', { n: backtest.sessions, d: dateFr(backtest.from), e: dateFr(backtest.to) })}
              {Math.min(backtest.before.coverage, backtest.after.coverage) < 0.995 ? ' ' + t('Calcul sur les ETF dont l’historique de cours est connu ({p} de la répartition).', { p: pct(Math.min(backtest.before.coverage, backtest.after.coverage), 0) }) : ''}
            </p>
          </section>
        )}

        <section aria-labelledby="t411-exp" className="card g8 dspan-12">
          <h2 id="t411-exp">{t('Exposition avant / après')}</h2>
          <Segmented label={t('Type de répartition')} value={exp} onChange={setExp} options={[['sec', t('Secteurs')], ['geo', t('Pays')]]} />
          <ExposureCompare r={exp === 'sec' ? r.sectors : r.countries} />
        </section>

        <section className="card g8 dspan-12" aria-label={t('Actions')}>
          <div className="stack-8">
            <button type="button" className="btn btn-primary" data-testid="plan-save" disabled={!dirty} onClick={save}><Icon name="check" size={20} />{saved ? t('Enregistrer les modifications') : t('Enregistrer ce plan')}</button>
            {dirty && <p className="t-caption c-moderate" role="note" data-testid="plan-unsaved">{saved ? t('Modifications non enregistrées : si vous quittez cet écran sans enregistrer, elles seront perdues.') : t('Ce plan n’est pas encore enregistré : si vous quittez cet écran sans enregistrer, il sera abandonné.')}</p>}
            <button type="button" className="btn btn-primary" disabled={r.sells.length + r.buys.length + (r.deposit > 0 ? 1 : 0) + (r.withdraw > 0 ? 1 : 0) === 0} onClick={() => setApplyOpen(true)}><Icon name="check" size={20} />{t('Appliquer ce plan')}</button>
            <button type="button" className="btn btn-secondary" disabled={Object.keys(targets).length === 0} onClick={adopt}><Icon name="check" size={20} />{t('Adopter cette cible dans l’app')}</button>
            <button type="button" className="btn btn-secondary" onClick={duplicate}><Icon name="list" size={20} />{t('Dupliquer ce plan')}</button>
          </div>
          <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)' }} onClick={remove}><Icon name="trash" size={20} />{t('Supprimer ce plan')}</button>
          <p className="t-legal c-moderate">{t('Un plan est un calcul, pas un conseil en investissement : il ne passe aucun ordre. Une fois vos ordres exécutés chez le courtier, enregistrez vos achats dans le journal.')}</p>
        </section>
      </main>

      {applyOpen && (
        <Sheet title={t('Appliquer ce plan')} onClose={() => setApplyOpen(false)}
          footer={<button type="button" className="btn btn-primary block" onClick={applyPlan}>{t('Enregistrer dans le journal')}</button>}>
          <div className="stack-12" style={{ padding: 'var(--space-12) 0' }}>
            <p className="t-caption c-neutral">{t('Après avoir passé vos ordres chez le courtier, l’app note ces opérations dans le journal, datées d’aujourd’hui, au dernier cours connu. Vérifiez ensuite les montants exacts (Historique › Journal › Modifier).')}</p>
            <ul className="stack-4 t-caption">
              {r.deposit > 0 && <li>{t('Versement : +{v}', { v: eur(r.deposit) })}</li>}
              {r.sells.map((x) => <li key={'s' + x.key}>{t('Vente : {q} × {n} → +{v}', { q: x.qty, n: name(x.key), v: eur(x.net) })}</li>)}
              {r.withdraw > 0 && <li>{t('Retrait : −{v}', { v: eur(r.withdraw) })}</li>}
              {r.buys.map((b) => <li key={'b' + b.key}>{t('Achat : {q} × {n} → −{v}', { q: b.qty, n: name(b.key), v: eur(b.cost + b.fee) })}</li>)}
            </ul>
            {Object.keys(targets).length > 0 && (
              <div className="between" style={{ minHeight: 52, gap: 'var(--space-12)' }}>
                <span id="apply-strat">{t('Mettre aussi à jour ma stratégie cible dans l’app')}</span>
                <Switch checked={alsoStrategy} onChange={setAlsoStrategy} labelledBy="apply-strat" />
              </div>
            )}
          </div>
        </Sheet>
      )}
      {targetSheet && <PlanTargetSheet data={data} plan={plan} onClose={() => setTargetSheet(false)} onSave={(tg) => { patch((p) => { p.targets = tg; }); setTargetSheet(false); }} />}
    </div>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="kpi" data-component="KpiCard">
      <span className="label">{label}</span>
      <span className="t-amount-m" style={{ color: good ? 'var(--success-text)' : undefined }}>{value}</span>
      {sub && <span className="t-caption c-moderate">{sub}</span>}
    </div>
  );
}

function ExposureCompare({ r }: { r: PlanResult['sectors'] }) {
  const rows = r.rows.slice(0, 10);
  const partial = Math.min(r.coverageBefore, r.coverageAfter) < 0.995;
  return (
    <>
      {rows.length === 0 ? <p className="c-neutral">{t('Répartition indisponible pour ces ETF.')}</p> : (
        <ul className="stack-8">
          {rows.map((x) => {
            const d = (x.after - x.before) * 100;
            return (
              <li key={x.label} className="stack-4">
                <span className="between"><span>{tl(x.label)}</span><span className="t-caption"><span className="c-moderate">{pct(x.before, 1)} → </span><strong>{pct(x.after, 1)}</strong> <span className={Math.abs(d) < 0.05 ? 'c-moderate' : d > 0 ? 'c-primary' : 'c-neutral'}>({pts(d)})</span></span></span>
                <span className="hbar" style={{ position: 'relative' }}>
                  <span style={{ width: Math.min(100, x.after * 100) + '%', background: 'var(--brand-primary)' }} />
                  <span aria-hidden="true" style={{ position: 'absolute', top: -2, bottom: -2, left: Math.min(100, x.before * 100) + '%', width: 2, background: 'var(--text)', borderRadius: 1 }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="t-legal c-moderate">{t('La barre montre la part après le plan ; le trait noir, la part avant.')}</p>
      {partial && <p className="t-legal c-moderate">{t('Calculé sur les ETF dont la répartition officielle est connue ({a} avant, {b} après).', { a: pct(r.coverageBefore, 0), b: pct(r.coverageAfter, 0) })}</p>}
    </>
  );
}

// ------------------------------------------------------------------ cible du plan (feuille)
function PlanTargetSheet({ data, plan, onSave, onClose }: { data: AppData; plan: Plan; onSave: (t: Record<string, number>) => void; onClose: () => void }) {
  const initial = plan.targets ?? currentStrategy(data);
  const heldKeys = data.etfs.filter((e) => data.transactions.some((x) => x.etfId === e.id)).map((e) => e.id);
  const [keys, setKeys] = useState<string[]>(() => Array.from(new Set([...heldKeys, ...data.myEtfIds.filter((id) => data.etfs.some((e) => e.id === id)), ...Object.keys(initial)])));
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(keys.map((k) => [k, Math.round((initial[k] || 0) * 100)])));
  const [pick, setPick] = useState(false);
  const total = keys.reduce((s, k) => s + (vals[k] || 0), 0);
  const bad = total !== 100;
  const save = () => onSave(Object.fromEntries(keys.filter((k) => (vals[k] || 0) > 0).map((k) => [k, vals[k] / 100])));
  return (
    <>
      <Sheet title={t('Stratégie visée')} full onClose={onClose}
        head={
          <>
            <div aria-live="polite" className="between" style={{ padding: 'var(--space-8) var(--space-16)', borderRadius: 'var(--radius-12)', background: bad ? 'var(--critical-bg)' : 'var(--success-bg)', color: bad ? 'var(--critical-text)' : 'var(--success-text)' }}>
              <span className="t-strong">{t('Total')}</span>
              <span className="t-h3">{total}{NBSP}%</span>
            </div>
            {bad && <span role="alert" className="t-caption-strong c-critical">{total > 100 ? t('Retirez {n} % pour atteindre 100 %.', { n: total - 100 }) : t('Il manque {n} % pour atteindre 100 %.', { n: 100 - total })}</span>}
          </>
        }
        footer={<button type="button" className="btn btn-primary block" disabled={bad} onClick={save}>{t('Valider')}</button>}>
        <p className="t-caption c-neutral" style={{ margin: 'var(--space-12) 0 0' }}>{t('Choisissez la répartition que vous voulez atteindre (total 100 %). Cette cible ne concerne que ce plan ; la stratégie de l’app n’est modifiée que si vous touchez « Adopter cette cible dans l’app ».')}</p>
        <ul style={{ padding: 'var(--space-8) 0' }}>
          {keys.map((k, i) => (
            <li key={k} style={{ padding: 'var(--space-12) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }} className="stack-8">
              <span className="row" style={{ gap: 'var(--space-10)' }}>
                <Dot id={k} i={i} />
                <span className="grow t-strong">{shortName(data, k)} <span className="t-caption c-moderate">· {k}</span></span>
                <span className="t-amount-m right" style={{ minWidth: 52, color: vals[k] ? 'var(--text)' : 'var(--text-moderate)' }}>{vals[k] || 0}{NBSP}%</span>
              </span>
              <input className="range" type="range" min={0} max={100} step={1} value={vals[k] || 0} aria-label={t('Cible {i}', { i: shortName(data, k) })} data-component="Slider"
                onChange={(ev) => setVals({ ...vals, [k]: Number(ev.target.value) })} />
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary block" onClick={() => setPick(true)}><Icon name="plus" size={20} />{t('Ajouter un ETF')}</button>
      </Sheet>
      {pick && <EtfPickerSheet data={data} title={t('Ajouter un ETF')} mode="any" exclude={keys} onClose={() => setPick(false)}
        onPick={(k) => { setKeys([...keys, k]); setVals({ ...vals, [k]: 0 }); setPick(false); }} />}
    </>
  );
}
