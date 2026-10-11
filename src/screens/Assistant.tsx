// T3-02 Assistant du mois + T3-03 Allocation cible
import { useState } from 'react';
import { EtfDot, Segmented, Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { navigate, closeSheet } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { assistant, type AssistantMode } from '../domain/calc';
import { eur, num, parseNum, pct, pts, toInput, todayIso, NBSP } from '../domain/format';
import { t, tn, tl } from '../i18n';
import { getData, newId, replaceData, update } from '../data/store';

export function AssistantScreen() {
  const { data, positions, etf, summary } = useCalc();
  const cash = summary.cashBalance;
  const [text, setText] = useState(() => toInput(Math.round((750 + cash) * 100) / 100, cash ? 2 : 0));
  const [mode, setMode] = useState<AssistantMode>('target');
  const amount = Math.max(0, parseNum(text) || 0);
  const fee = data.settings.feePerOrder;

  const order = data.etfs.map((e) => e.id);
  const all = positions.slice().sort((a, b) => order.indexOf(a.etfId) - order.indexOf(b.etfId));
  const items = all.map((p) => ({ id: p.etfId, price: p.price, value: p.marketValue, target: p.weightTarget }));
  const res = assistant(items, amount, mode, fee);
  const strat = all.filter((p) => p.weightTarget > 0);
  const name = (id: string) => etf(id)?.index ?? id;

  const before = all.map((p) => p.marketValue);
  const after = all.map((p) => p.marketValue + (res.parts[p.etfId] || 0) * p.price);
  const tb = before.reduce((s, v) => s + v, 0) || 1, ta = after.reduce((s, v) => s + v, 0) || 1;
  const bars: [string, number[]][] = [[t('Avant'), before.map((v) => v / tb)], [t('Après'), after.map((v) => v / ta)], [t('Cible'), all.map((p) => p.weightTarget)]];
  const targetsText = strat.map((p) => num(p.weightTarget * 100, 0)).join(' / ');

  const save = () => {
    const prev = getData();
    const date = todayIso();
    const added = strat.filter((p) => res.parts[p.etfId] > 0);
    if (!added.length) return;
    update((d) => {
      for (const p of added) {
        const q = res.parts[p.etfId];
        d.transactions.push({ id: newId('b'), date, etfId: p.etfId, unitPrice: p.price, quantity: q, grossAmount: Math.round((p.price * q + fee) * 100) / 100, fees: fee, feeRefund: 0 });
      }
    });
    navigate('/historique/journal', { replace: true });
    showToast(tn(added.length, '{n} achat pré-rempli', '{n} achats pré-remplis'), { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen" data-screen="T3-02">
      <SubHeader title={t('Assistant du mois')} fallback="/portefeuille" />
      <main className="content flush-top">
        <section className="bleed stack-12 form-narrow" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-20)' }}>
          <label className="field">
            <span className="lbl">{t('Montant à investir ce mois-ci')}</span>
            <span className="input-wrap">
              <input className="input num large" type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} style={{ paddingRight: 44 }} data-component="AmountField.large" />
              <span className="suffix" aria-hidden="true">€</span>
            </span>
          </label>
          {cash > 0 && (
            <p className="t-caption c-neutral" style={{ margin: 0 }}>
              {t('Le montant inclut votre solde espèces :')} <strong>{eur(cash)}</strong> {t('(remboursements de frais et reliquats des achats précédents). Les boutons ci-dessous indiquent le virement du mois.')}
            </p>
          )}
          <div role="group" aria-label={t('Montants rapides')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-8)' }}>
            {[300, 500, 750, 1000].map((v) => (
              <button key={v} type="button" className="chip" style={{ padding: 0 }} aria-pressed={Math.abs(amount - (v + cash)) < 0.005} onClick={() => setText(toInput(Math.round((v + cash) * 100) / 100, cash ? 2 : 0))}>{eur(v, 0)}</button>
            ))}
          </div>
          <Segmented label={t('Méthode de répartition')} value={mode} onChange={setMode} options={[['target', t('Suivre la cible')], ['rebalance', t('Rééquilibrer')]]} />
          <p className="t-caption c-neutral">
            {mode === 'target'
              ? t('Le versement est réparti selon l’allocation cible ({c} %) entre les {n} ETF de ta stratégie, en parts entières.', { c: targetsText, n: strat.length })
              : t('Chaque part va à l’ETF le plus en dessous de sa cible : l’écart se réduit plus vite, mais tout peut aller sur un seul ETF.')}
          </p>
        </section>

        <div className="stack-16 dcols-2">
          <section aria-labelledby="t302-buy" className="card">
            <h2 id="t302-buy">{t('À acheter')}</h2>
            <ul>
              {strat.map((p, i) => {
                const q = res.parts[p.etfId] || 0;
                return (
                  <li key={p.etfId} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto', padding: 'var(--space-10) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                    <EtfDot id={p.etfId} />
                    <span className="stack" style={{ minWidth: 0 }}>
                      <span className="t-strong">{name(p.etfId)}</span>
                      <span className="t-caption c-moderate">{q ? tn(q, '{n} part × {p}', '{n} parts × {p}', { p: eur(p.price) }) : t('Rien ce mois-ci')}</span>
                    </span>
                    <span className="t-amount-s" style={{ color: q ? 'var(--text)' : 'var(--text-moderate)' }}>{q ? eur(q * p.price) : '—'}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="dl" style={{ gap: 'var(--space-6) var(--space-12)', paddingTop: 'var(--space-12)', borderTop: '1px solid var(--divider-minimal)' }}>
              <dt>{t('Total des titres')}</dt><dd className="t-amount-s">{eur(res.total)}</dd>
              <dt>{t('Frais estimés')} <span className="t-caption">({tn(res.orders, '{n} ordre × {f}', '{n} ordres × {f}', { f: eur(fee) })})</span></dt><dd>{eur(res.fees)}</dd>
              <dt>{t('Reste non investi')}</dt><dd>{eur(res.left)}</dd>
            </dl>
          </section>

          <section aria-labelledby="t302-viz" className="card">
            <h2 id="t302-viz">{t('Allocation avant / après')}</h2>
            {bars.map(([lab, ws]) => (
              <div key={lab} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 'var(--space-8)', alignItems: 'center' }}>
                <span className="t-caption c-neutral">{lab}</span>
                <div role="img" aria-label={lab + ' : ' + all.map((p, i) => name(p.etfId) + ' ' + pct(ws[i])).join(', ')} className="stack-bar">
                  {all.map((p, i) => ws[i] > 0 ? <span key={p.etfId} style={{ width: ws[i] * 100 + '%', background: `var(--etf-${p.etfId}, var(--chart-other))` }} /> : null)}
                </div>
              </div>
            ))}
            <ul style={{ paddingTop: 'var(--space-8)', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-6) var(--space-12)' }} className="t-caption">
              {all.map((p, i) => {
                const g = (after[i] / ta - p.weightTarget) * 100;
                return (
                  <li key={p.etfId} className="row" style={{ gap: 'var(--space-6)' }}>
                    <EtfDot id={p.etfId} size={10} />
                    <span className="grow">{name(p.etfId)}</span>
                    <span className={Math.abs(g) > 5 ? 'warn-chip' : 't-caption-strong c-neutral'} style={Math.abs(g) > 5 ? { padding: '0 var(--space-6)' } : undefined}>{pts(g)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="t-legal c-moderate">{t('Écart à la cible après achat, en points.')}</p>
          </section>
        </div>

        <div className="stack-8 form-narrow">
          <button type="button" className="btn btn-primary block" disabled={res.orders === 0} onClick={save}>{t('Enregistrer ces achats')}</button>
          <p className="center t-caption c-moderate">{t('Pré-remplit le journal ; les montants exacts seront à corriger après exécution.')}</p>
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ T3-03 Allocation cible (feuille)
export function TargetSheet() {
  const { data } = useCalc();
  const held = new Set(data.transactions.map((t) => t.etfId));
  const list = data.etfs.filter((e) => held.has(e.id) || data.myEtfIds.includes(e.id));
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(list.map((e) => [e.id, Math.round((e.inStrategy ? data.targetAllocation[e.id] || 0 : 0) * 100)])));
  const [inStrat, setInStrat] = useState<Record<string, boolean>>(() => Object.fromEntries(list.map((e) => [e.id, e.inStrategy])));
  const total = list.reduce((s, e) => s + (inStrat[e.id] ? vals[e.id] : 0), 0);
  const bad = total !== 100;

  const save = () => {
    update((d) => {
      for (const e of d.etfs) {
        if (!(e.id in vals)) continue;
        e.inStrategy = inStrat[e.id] && vals[e.id] > 0;
        d.targetAllocation[e.id] = inStrat[e.id] ? vals[e.id] / 100 : 0;
      }
    });
    closeSheet();
    showToast(t('Allocation cible enregistrée'));
  };

  return (
    <Sheet title={t('Allocation cible')} full
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
      <ul style={{ padding: 'var(--space-8) 0' }}>
        {list.map((e, i) => {
          const on = inStrat[e.id];
          const id = 'strat-' + e.id;
          return (
            <li key={e.id} style={{ padding: 'var(--space-12) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }} className="stack-8">
              <span className="row" style={{ gap: 'var(--space-10)' }}>
                <EtfDot id={e.id} />
                <span className="grow t-strong">{tl(e.index)} <span className="t-caption c-moderate">· {e.id}</span></span>
                <span className="t-amount-m right" style={{ minWidth: 52, color: on ? 'var(--text)' : 'var(--text-moderate)' }}>{on ? vals[e.id] : 0}{NBSP}%</span>
              </span>
              <input className="range" type="range" min={0} max={100} step={5} value={on ? vals[e.id] : 0} disabled={!on}
                aria-label={t('Cible {i}', { i: e.index })} onChange={(ev) => setVals({ ...vals, [e.id]: Number(ev.target.value) })} data-component="Slider" />
              <span className="between">
                <span id={id} className="t-caption c-neutral">{t('Dans ma stratégie')}</span>
                <Switch checked={on} labelledBy={id} onChange={(v) => { setInStrat({ ...inStrat, [e.id]: v }); if (v && !vals[e.id]) setVals({ ...vals, [e.id]: 5 }); }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
