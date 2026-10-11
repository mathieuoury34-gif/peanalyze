// T3-02 Assistant du mois + T3-03 Allocation cible
import { useState } from 'react';
import { EtfDot, Segmented, Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { navigate, closeSheet } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { assistant, type AssistantMode } from '../domain/calc';
import { eur, num, parseNum, pts, todayIso, NBSP } from '../domain/format';
import { getData, newId, replaceData, update } from '../data/store';

export function AssistantScreen() {
  const { data, positions, etf } = useCalc();
  const [text, setText] = useState('750');
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
  const bars: [string, number[]][] = [['Avant', before.map((v) => v / tb)], ['Après', after.map((v) => v / ta)], ['Cible', all.map((p) => p.weightTarget)]];
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
    showToast(added.length + ' achat' + (added.length > 1 ? 's' : '') + ' pré-rempli' + (added.length > 1 ? 's' : ''), { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen" data-screen="T3-02">
      <SubHeader title="Assistant du mois" fallback="/portefeuille" />
      <main className="content flush-top">
        <section className="bleed stack-12 form-narrow" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-20)' }}>
          <label className="field">
            <span className="lbl">Montant à investir ce mois-ci</span>
            <span className="input-wrap">
              <input className="input num large" type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} style={{ paddingRight: 44 }} data-component="AmountField.large" />
              <span className="suffix" aria-hidden="true">€</span>
            </span>
          </label>
          <div role="group" aria-label="Montants rapides" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-8)' }}>
            {[300, 500, 750, 1000].map((v) => (
              <button key={v} type="button" className="chip" style={{ padding: 0 }} aria-pressed={amount === v} onClick={() => setText(String(v))}>{num(v, 0)}{NBSP}€</button>
            ))}
          </div>
          <Segmented label="Méthode de répartition" value={mode} onChange={setMode} options={[['target', 'Suivre la cible'], ['rebalance', 'Rééquilibrer']]} />
          <p className="t-caption c-neutral">
            {mode === 'target'
              ? `Le versement est réparti selon l’allocation cible (${targetsText} %) entre les ${strat.length} ETF de ta stratégie, en parts entières.`
              : 'Chaque part va à l’ETF le plus en dessous de sa cible : l’écart se réduit plus vite, mais tout peut aller sur un seul ETF.'}
          </p>
        </section>

        <div className="stack-16 dcols-2">
          <section aria-labelledby="t302-buy" className="card">
            <h2 id="t302-buy">À acheter</h2>
            <ul>
              {strat.map((p, i) => {
                const q = res.parts[p.etfId] || 0;
                return (
                  <li key={p.etfId} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto', padding: 'var(--space-10) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                    <EtfDot id={p.etfId} />
                    <span className="stack" style={{ minWidth: 0 }}>
                      <span className="t-strong">{name(p.etfId)}</span>
                      <span className="t-caption c-moderate">{q ? `${q} part${q > 1 ? 's' : ''} × ${eur(p.price)}` : 'Rien ce mois-ci'}</span>
                    </span>
                    <span className="t-amount-s" style={{ color: q ? 'var(--text)' : 'var(--text-moderate)' }}>{q ? eur(q * p.price) : '—'}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="dl" style={{ gap: 'var(--space-6) var(--space-12)', paddingTop: 'var(--space-12)', borderTop: '1px solid var(--divider-minimal)' }}>
              <dt>Total des titres</dt><dd className="t-amount-s">{eur(res.total)}</dd>
              <dt>Frais estimés <span className="t-caption">({res.orders} ordre{res.orders > 1 ? 's' : ''} × {eur(fee)})</span></dt><dd>{eur(res.fees)}</dd>
              <dt>Reste non investi</dt><dd>{eur(res.left)}</dd>
            </dl>
          </section>

          <section aria-labelledby="t302-viz" className="card">
            <h2 id="t302-viz">Allocation avant / après</h2>
            {bars.map(([lab, ws]) => (
              <div key={lab} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 'var(--space-8)', alignItems: 'center' }}>
                <span className="t-caption c-neutral">{lab}</span>
                <div role="img" aria-label={lab + ' : ' + all.map((p, i) => name(p.etfId) + ' ' + num(ws[i] * 100, 1) + ' %').join(', ')} className="stack-bar">
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
            <p className="t-legal c-moderate">Écart à la cible après achat, en points.</p>
          </section>
        </div>

        <div className="stack-8 form-narrow">
          <button type="button" className="btn btn-primary block" disabled={res.orders === 0} onClick={save}>Enregistrer ces achats</button>
          <p className="center t-caption c-moderate">Pré-remplit le journal ; les montants exacts seront à corriger après exécution.</p>
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
    showToast('Allocation cible enregistrée');
  };

  return (
    <Sheet title="Allocation cible" full
      head={
        <>
          <div aria-live="polite" className="between" style={{ padding: 'var(--space-8) var(--space-16)', borderRadius: 'var(--radius-12)', background: bad ? 'var(--critical-bg)' : 'var(--success-bg)', color: bad ? 'var(--critical-text)' : 'var(--success-text)' }}>
            <span className="t-strong">Total</span>
            <span className="t-h3">{total}{NBSP}%</span>
          </div>
          {bad && <span role="alert" className="t-caption-strong c-critical">{total > 100 ? `Retirez ${total - 100}${NBSP}% pour atteindre 100${NBSP}%.` : `Il manque ${100 - total}${NBSP}% pour atteindre 100${NBSP}%.`}</span>}
        </>
      }
      footer={<button type="button" className="btn btn-primary block" disabled={bad} onClick={save}>Valider</button>}>
      <ul style={{ padding: 'var(--space-8) 0' }}>
        {list.map((e, i) => {
          const on = inStrat[e.id];
          const id = 'strat-' + e.id;
          return (
            <li key={e.id} style={{ padding: 'var(--space-12) 0', borderTop: i ? '1px solid var(--divider-minimal)' : undefined }} className="stack-8">
              <span className="row" style={{ gap: 'var(--space-10)' }}>
                <EtfDot id={e.id} />
                <span className="grow t-strong">{e.index} <span className="t-caption c-moderate">· {e.id}</span></span>
                <span className="t-amount-m right" style={{ minWidth: 52, color: on ? 'var(--text)' : 'var(--text-moderate)' }}>{on ? vals[e.id] : 0}{NBSP}%</span>
              </span>
              <input className="range" type="range" min={0} max={100} step={5} value={on ? vals[e.id] : 0} disabled={!on}
                aria-label={'Cible ' + e.index} onChange={(ev) => setVals({ ...vals, [e.id]: Number(ev.target.value) })} data-component="Slider" />
              <span className="between">
                <span id={id} className="t-caption c-neutral">Dans ma stratégie</span>
                <Switch checked={on} labelledBy={id} onChange={(v) => { setInStrat({ ...inStrat, [e.id]: v }); if (v && !vals[e.id]) setVals({ ...vals, [e.id]: 5 }); }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
