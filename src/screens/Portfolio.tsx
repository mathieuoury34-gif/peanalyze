// T3-01 Synthèse (écran de lancement) + T3-04 Répartitions
import { useState } from 'react';
import { AppHeader, EtfDot, Fab, Hero, PriceErrorBanner, Segmented, SubNav, useWidth } from '../ui/kit';
import { DoubleDonut, Donut, HBarList } from '../ui/charts';
import { Icon } from '../ui/icons';
import { navigate, openSheet } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { exposure, topWithOthers } from '../domain/calc';
import { eur, eurSigned, num, pct, pctSigned, pts, NBSP } from '../domain/format';
import type { Position } from '../domain/types';
import { WelcomeCard } from '../ui/WelcomeCard';

const NAV = [{ to: '/portefeuille', label: 'Synthèse' }, { to: '/portefeuille/repartitions', label: 'Répartitions' }];

export function PortfolioScreen() {
  const { data, positions, summary, etf } = useCalc();
  const [mode, setMode] = useState<'real' | 'target' | 'both'>('both');
  const [open, setOpen] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [donutRef, donutW] = useWidth<HTMLDivElement>(326);

  const order = data.etfs.map((e) => e.id);
  const ordered = positions.slice().sort((a, b) => order.indexOf(a.etfId) - order.indexOf(b.etfId));
  const strat = positions.filter((p) => p.inStrategy).sort((a, b) => b.marketValue - a.marketValue);
  const off = positions.filter((p) => !p.inStrategy && p.quantity > 0).sort((a, b) => b.marketValue - a.marketValue);
  const color = (id: string) => `var(--etf-${id}, var(--chart-other))`;
  const label = (id: string) => etf(id)?.index ?? id;
  const donutLabel = 'Anneau extérieur : répartition réelle (' + ordered.map((p) => label(p.etfId) + ' ' + pct(p.weightActual)).join(', ')
    + '). Anneau intérieur : cible (' + ordered.filter((p) => p.weightTarget > 0).map((p) => label(p.etfId) + ' ' + pct(p.weightTarget, 0)).join(', ') + ').';

  return (
    <div className="screen" data-screen="T3-01">
      <AppHeader title="Portefeuille" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections du portefeuille" />
      <main className="content with-fab dgrid">
        {!data.deposits.length && !data.transactions.length && <WelcomeCard className="dspan-12" />}
        <Hero className="dspan-5" label="Valorisation totale" value={eur(summary.totalValue)} chip={`${summary.unrealizedPnl >= 0 ? '▲' : '▼'} ${eurSigned(summary.unrealizedPnl)} · ${pctSigned(summary.globalReturnPct)}`}>
          <div className="foot">
            <span><strong>{summary.totalQuantity}</strong> parts</span>
            <span><strong>{summary.lines}</strong> lignes</span>
            <span><strong>{eur(summary.totalDeposited)}</strong> versés</span>
            {summary.cashBalance > 0 && <span><strong>{eur(summary.cashBalance)}</strong> en espèces</span>}
          </div>
        </Hero>

        <section aria-labelledby="t301-rep" className="card g16 dspan-7" style={{ gridRow: 'span 2' }}>
          <h2 id="t301-rep">Réel et cible</h2>
          <Segmented label="Anneaux affichés" value={mode} onChange={setMode} options={[['real', 'Réel'], ['target', 'Cible'], ['both', 'Les deux']]} />
          <div ref={donutRef} className="row" style={{ gap: donutW < 360 ? 'var(--space-12)' : 'var(--space-16)', alignItems: 'center' }}>
            <DoubleDonut size={donutW < 310 ? 128 : donutW < 360 ? 140 : 180}
              label={donutLabel}
              outer={ordered.map((p) => ({ value: p.weightActual, color: color(p.etfId) }))}
              inner={ordered.map((p) => ({ value: p.weightTarget, color: color(p.etfId) }))}
              showOuter={mode !== 'target'} showInner={mode !== 'real'}>
              <span className="t-caption c-moderate">Total</span>
              <span className="t-amount-s">{eur(summary.totalValue, 0)}</span>
            </DoubleDonut>
            <ul className="grow stack t-caption" style={{ gap: 'var(--space-6)' }}>
              <li className="list-row c-moderate" style={{ gridTemplateColumns: '10px 1fr 34px 28px', gap: 'var(--space-4)' }}><span /><span /><span className="right">Réel</span><span className="right">Cible</span></li>
              {ordered.map((p) => (
                <li key={p.etfId} className="list-row" style={{ gridTemplateColumns: '10px 1fr 34px 28px', gap: 'var(--space-4)' }}>
                  <EtfDot id={p.etfId} size={10} />
                  <span className="ellipsis">{label(p.etfId)}</span>
                  <span className="right" style={{ fontWeight: 600 }}>{num(p.weightActual * 100, 1)}</span>
                  <span className="right c-neutral">{p.weightTarget > 0 ? num(p.weightTarget * 100, 0) : '0'}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <a href="#/portefeuille/assistant" className="dspan-5" onClick={(e) => { e.preventDefault(); navigate('/portefeuille/assistant'); }}
          style={{ display: 'grid', gridTemplateColumns: '40px 1fr 24px', gap: 'var(--space-12)', alignItems: 'center', padding: 'var(--space-16)', borderRadius: 'var(--radius-16)', background: 'var(--bg-brand-minimal)', color: 'var(--text)', textDecoration: 'none' }}>
          <span style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'var(--brand-primary)', color: 'var(--text-reverse)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkle" size={20} /></span>
          <span className="stack">
            <span className="t-amount-s">Assistant du mois</span>
            <span className="t-caption c-neutral">Combien de parts acheter avec mon versement ?</span>
          </span>
          <Icon name="next" size={20} style={{ color: 'var(--brand-primary)' }} />
        </a>

        <section aria-labelledby="t301-pos" className="stack-12">
          <div className="between baseline">
            <h2 id="t301-pos" className="t-h3">Mes positions</h2>
            <span className="t-caption c-moderate">triées par valeur</span>
          </div>
          <div className="stack-12 dcols-2">
            {strat.map((p) => (
              <PositionCard key={p.etfId} p={p} name={label(p.etfId)} open={open === p.etfId} onToggle={() => setOpen(open === p.etfId ? null : p.etfId)} />
            ))}
          </div>
          {off.length > 0 && (
            <div className="stack-12">
              <button type="button" aria-expanded={showOff} onClick={() => setShowOff(!showOff)}
                className="between" style={{ border: 0, background: 'transparent', padding: 'var(--space-8) 0', cursor: 'pointer', minHeight: 'var(--touch-min)', textAlign: 'left' }}>
                <span className="stack">
                  <span className="t-amount-m">Hors stratégie <span className="badge outline" style={{ marginLeft: 6 }}>{off.length} ETF</span></span>
                  <span className="t-caption c-moderate">Détenus mais plus achetés · {eur(off.reduce((s, p) => s + p.marketValue, 0))} · {pct(off.reduce((s, p) => s + p.weightActual, 0))} du portefeuille</span>
                </span>
                <Icon name="down" size={20} style={{ color: 'var(--brand-primary)', transform: `rotate(${showOff ? 180 : 0}deg)`, transition: 'transform .2s' }} />
              </button>
              {showOff && (
                <div className="stack-12 dcols-2">
                  {off.map((p) => <PositionCard key={p.etfId} p={p} name={label(p.etfId)} open={open === p.etfId} onToggle={() => setOpen(open === p.etfId ? null : p.etfId)} />)}
                </div>
              )}
            </div>
          )}
        </section>

        <button type="button" className="btn btn-secondary block dspan-6" onClick={() => openSheet('cible')} data-component="Button.secondary">
          Modifier mon allocation cible
        </button>
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function PositionCard({ p, name, open, onToggle }: { p: Position; name: string; open: boolean; onToggle: () => void }) {
  const warn = Math.abs(p.gapPts) > 5;
  const down = p.unrealizedPnl < 0;
  return (
    <article className="card" data-component="PositionCard">
      <button type="button" aria-expanded={open} onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto 20px', gap: 'var(--space-10)', alignItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', minHeight: 'var(--touch-min)' }}>
        <EtfDot id={p.etfId} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="row wrap" style={{ gap: 'var(--space-6)' }}>
            <span className="t-amount-m">{name}</span>
            {!p.inStrategy && <span className="badge outline">Hors stratégie</span>}
          </span>
          <span className="t-caption c-moderate">{p.quantity} part{p.quantity > 1 ? 's' : ''} · {p.etfId}</span>
        </span>
        <span className="stack" style={{ alignItems: 'flex-end', gap: 'var(--space-2)' }}>
          <span className="t-amount-m nowrap">{eur(p.marketValue)}</span>
          <span className={'var-chip' + (down ? ' down' : '')} style={{ padding: '0 var(--space-8)' }}>{down ? '▼' : '▲'} {eurSigned(p.unrealizedPnl)} · {pctSigned(p.unrealizedPnlPct)}</span>
        </span>
        <Icon name="down" size={20} style={{ color: 'var(--brand-primary)', transition: 'transform .2s', transform: `rotate(${open ? 180 : 0}deg)` }} />
      </button>
      {p.inStrategy ? (
        <>
          <div className="alloc-bar" data-component="AllocationBar">
            <div className="fill" style={{ width: Math.min(100, p.weightActual * 100) + '%', background: `var(--etf-${p.etfId}, var(--chart-other))` }} />
            <div className="marker" style={{ left: p.weightTarget * 100 + '%' }} />
          </div>
          <div className="between t-caption c-neutral">
            <span>{pct(p.weightActual)} · cible {num(p.weightTarget * 100, 0)}{NBSP}%</span>
            <span className={warn ? 'warn-chip' : 't-caption-strong c-neutral'}>écart {pts(p.gapPts)}{NBSP}pts</span>
          </div>
        </>
      ) : (
        <div className="t-caption c-neutral">{pct(p.weightActual)} du portefeuille · plus d'achats prévus</div>
      )}
      {open && (
        <>
          <dl className="dl" style={{ paddingTop: 'var(--space-12)', borderTop: '1px solid var(--divider-minimal)' }}>
            <dt>Prix actuel</dt><dd>{eur(p.price)}</dd>
            <dt>PRU</dt><dd>{eur(p.pru)}</dd>
            {p.inStrategy && <><dt>Valeur cible</dt><dd>{eur(p.targetValue)}</dd></>}
            {p.inStrategy && <><dt>Parts cibles</dt><dd>{p.targetQuantity}</dd></>}
            {p.inStrategy && <><dt>Parts à acheter</dt><dd className="t-amount-s c-primary">{p.toBuy}</dd></>}
            {!p.inStrategy && <><dt>Coût de revient</dt><dd>{eur(p.costBasis)}</dd></>}
          </dl>
          <a href={'#/marches/etf/' + p.etfId} onClick={(e) => { e.preventDefault(); navigate('/marches/etf/' + p.etfId); }}
            className="t-button" style={{ alignSelf: 'flex-start', textDecoration: 'none', padding: 'var(--space-8) 0' }}>Voir la fiche de l'ETF</a>
        </>
      )}
    </article>
  );
}

// ------------------------------------------------------------------ T3-04
export function RepartitionsScreen() {
  const { data, positions } = useCalc();
  const [tab, setTab] = useState<'sec' | 'geo'>('sec');
  const sectors = exposure(data, positions, 'sectors');
  const named = sectors.filter((s) => s.label !== 'Autres');
  const otherSec = sectors.filter((s) => s.label === 'Autres');
  const sectorList = [...named, ...otherSec];
  // donut : 8 plus gros secteurs en couleur, le reste en gris
  const donut = sectorList.map((s, i) => ({ value: s.weight, color: s.label !== 'Autres' && i < 8 ? `var(--chart-${i + 1})` : 'var(--chart-other)' }));
  const grey = sectorList.filter((s, i) => !(s.label !== 'Autres' && i < 8)).map((s) => s.label.toLowerCase());
  const countries = topWithOthers(exposure(data, positions, 'countries'), 10);
  const top = named[0];

  return (
    <div className="screen" data-screen="T3-04">
      <AppHeader title="Portefeuille" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections du portefeuille" />
      <main className="content with-fab">
        <div className="form-narrow"><Segmented label="Type de répartition" value={tab} onChange={setTab} options={[['sec', 'Secteurs'], ['geo', 'Pays']]} /></div>
        {tab === 'sec' ? (
          <section aria-labelledby="t304-sec" className="card g16 form-narrow">
            <h2 id="t304-sec">Secteurs du portefeuille</h2>
            <Donut slices={donut} label={'Secteurs : ' + sectorList.map((s) => s.label + ' ' + pct(s.weight)).join(', ')}>
              {top && <><span className="t-amount-l">{pct(top.weight)}</span><span className="t-caption c-moderate">{top.label.split(' ')[0]}</span></>}
            </Donut>
            <ul>
              {sectorList.map((s, i) => (
                <li key={s.label} className="legend-row">
                  <span className="dot s10" style={{ background: donut[i].color }} />
                  <span>{s.label}</span>
                  <span className="t-strong right">{pct(s.weight)}</span>
                </li>
              ))}
            </ul>
            {grey.length > 0 && <p className="t-legal c-moderate">Le donut regroupe en gris les plus petits secteurs ({grey.join(', ')}).</p>}
          </section>
        ) : (
          <section aria-labelledby="t304-geo" className="card form-narrow">
            <h2 id="t304-geo">Pays du portefeuille</h2>
            <HBarList rows={countries} />
          </section>
        )}
        <p className="row t-caption c-neutral form-narrow" style={{ alignItems: 'flex-start' }}>
          <Icon name="info" size={18} />
          Répartition calculée en pondérant la composition de chaque ETF par son poids dans le portefeuille.
        </p>
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}
