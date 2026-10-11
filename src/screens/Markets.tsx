// Onglet Marchés : T1-01 Mes ETF, T1-02 Détail, T1-03 Catalogue, T1-04 Comparateur, gestion de la liste
import { useMemo, useState } from 'react';
import { AppHeader, EtfDot, PriceErrorBanner, SubHeader, SubNav, VarChip, showToast } from '../ui/kit';
import { Donut, HBarList, PriceChart, Sparkline } from '../ui/charts';
import { CheckFilled, Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { displayHistory, normalizeLabel, periodStartIndex, topWithOthers } from '../domain/calc';
import { aum, dateFr, eur, eurSigned, num, pct, pctSigned, NBSP } from '../domain/format';
import { getData, replaceData, update } from '../data/store';
import { refreshPrices } from '../data/prices';
import type { CatalogEtf, Etf } from '../domain/types';

const NAV = [{ to: '/marches', label: 'Mes ETF' }, { to: '/marches/catalogue', label: 'Catalogue' }];
const color = (id: string) => `var(--etf-${id}, var(--chart-other))`;

// ------------------------------------------------------------------ T1-01
export function MyEtfsScreen() {
  const { data } = useCalc();
  const etfs = data.myEtfIds.map((id) => data.etfs.find((e) => e.id === id)).filter(Boolean) as Etf[];
  const firstDate = etfs.reduce((m, e) => (e.priceHistory[0] && (!m || e.priceHistory[0][0] < m) ? e.priceHistory[0][0] : m), '');
  return (
    <div className="screen" data-screen="T1-01">
      <AppHeader title="Marchés" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections Marchés" />
      <main className="content gap-12">
        <p className="t-caption c-moderate">{etfs.length} ETF suivis{firstDate ? ' · variation depuis le ' + dateFr(firstDate) : ''}</p>
        <div className="stack-12 dcols-3">
          {etfs.map((e) => {
            const h = displayHistory(e);
            const ch = h.length ? e.lastPrice / h[0][1] - 1 : 0;
            return (
              <a key={e.id} href={'#/marches/etf/' + e.id} onClick={(ev) => { ev.preventDefault(); navigate('/marches/etf/' + e.id); }}
                className="card" style={{ gap: 'var(--space-10)', color: 'var(--text)', textDecoration: 'none' }} data-component="EtfCard">
                <span style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 'var(--space-10)', alignItems: 'start' }}>
                  <EtfDot id={e.id} style={{ marginTop: 6 }} />
                  <span className="stack" style={{ minWidth: 0 }}>
                    <span className="t-amount-m">{e.index}</span>
                    <span className="t-caption c-moderate">{e.name} · {e.id}</span>
                  </span>
                  <span className="stack-4" style={{ alignItems: 'flex-end' }}>
                    <span className="t-amount-l nowrap">{eur(e.lastPrice)}</span>
                    {h.length > 1 && <VarChip ratio={ch} />}
                  </span>
                </span>
                <Sparkline values={h.map((p) => p[1])} color={color(e.id)} />
                <span className="row wrap" style={{ gap: 'var(--space-6)' }}>
                  {e.peaEligible && <span className="badge">PEA</span>}
                  <span className="badge">{e.distribution}</span>
                  <span className="badge">{e.replication}</span>
                  <span className="badge">Frais {pct(e.ter, 2)}</span>
                </span>
              </a>
            );
          })}
        </div>
        {etfs.length === 0 && <p className="center c-moderate" style={{ padding: 'var(--space-24)' }}>Aucun ETF suivi. Ajoutez-en depuis le catalogue.</p>}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ T1-02
type Period = '1M' | '3M' | '6M' | '1A' | 'Max' | 'Perso';
export function EtfDetailScreen({ id }: { id: string }) {
  const { data, pos, etf: getEtf } = useCalc();
  const e = getEtf(id);
  const [period, setPeriod] = useState<Period>('Max');
  const [from, setFrom] = useState('');
  if (!e) {
    return (
      <div className="screen">
        <SubHeader title="ETF" fallback="/marches" />
        <main className="content"><p className="c-moderate">Cet ETF n’existe plus dans vos données.</p></main>
      </div>
    );
  }
  const h = displayHistory(e);
  const months = { '1M': 1, '3M': 3, '6M': 6, '1A': 12, Max: null, Perso: null }[period];
  const s = periodStartIndex(h, months, period === 'Perso' && from ? from : undefined);
  const first = h[s]?.[1] ?? e.lastPrice;
  const ch = e.lastPrice / first - 1;
  const p = pos(id);
  const buys = data.transactions.filter((t) => t.etfId === id).map((t) => ({ date: t.date, quantity: t.quantity, unitPrice: t.unitPrice }));
  const sectors = topWithOthers(e.sectors, 8);
  const countries = topWithOthers(e.countries, 8);
  const sectorSlices = sectors.map((x, i) => ({ value: x.weight, color: x.isOther ? 'var(--chart-other)' : `var(--chart-${i + 1})` }));

  return (
    <div className="screen" data-screen="T1-02">
      <SubHeader title={e.index} fallback="/marches" />
      <main className="content flush-top dgrid">
        <section aria-label="Cours" className="bleed stack-12 dspan-8" style={{ paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-20)', gridRow: 'span 3' }}>
          <div className="stack-4">
            <span className="t-caption c-moderate">{e.name} · {e.id}</span>
            <span className="t-display">{eur(e.lastPrice)}</span>
            <span className="row wrap">
              {h.length > 1 && <VarChip ratio={ch} />}
              <span className="t-caption c-neutral">{period === 'Perso' && from ? 'du ' + dateFr(h[s][0]) + ' au ' + dateFr(h[h.length - 1][0]) : h[s] ? 'depuis le ' + dateFr(h[s][0]) : ''}</span>
            </span>
          </div>
          <div role="group" aria-label="Période du graphique" className="chips g6">
            {(['1M', '3M', '6M', '1A', 'Max', 'Perso'] as Period[]).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={period === k} onClick={() => { setPeriod(k); if (k === 'Perso' && !from && h.length) setFrom(h[Math.max(0, h.length - 60)][0]); }}>
                {k === 'Perso' && <Icon name="calendar" size={16} />}{k === 'Perso' ? 'Personnalisé' : k}
              </button>
            ))}
          </div>
          {period === 'Perso' && (
            <label className="field">
              <span className="lbl t-caption">Début de la période</span>
              <input className="input" type="date" value={from} min={h[0]?.[0]} max={h[h.length - 1]?.[0]} onChange={(ev) => setFrom(ev.target.value)} />
            </label>
          )}
          <PriceChart history={h} start={s} buys={buys} pru={p && p.quantity > 0 ? p.pru : undefined} color={color(e.id)}
            label={`Cours de l’ETF ${e.index} du ${h[s] ? dateFr(h[s][0]) : ''} au ${h.length ? dateFr(h[h.length - 1][0]) : ''}, de ${eur(first)} à ${eur(e.lastPrice)}`} />
          <div className="legend">
            <span><span className="dot s10" style={{ background: 'var(--bg-surface)', border: '2px solid var(--brand-primary)' }} />Mes achats ({buys.length})</span>
            {p && p.quantity > 0 && <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-pru)' }} />Prix de revient</span>}
          </div>
        </section>

        <section aria-labelledby="t102-pos" className="card highlight dspan-4">
          <h2 id="t102-pos">Ma position</h2>
          {p && p.quantity > 0 ? (
            <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
              <div className="stack"><span className="t-caption c-neutral">Parts</span><span className="t-amount-m">{p.quantity}</span></div>
              <div className="stack"><span className="t-caption c-neutral">PRU</span><span className="t-amount-m">{eur(p.pru)}</span></div>
              <div className="stack"><span className="t-caption c-neutral">Valeur</span><span className="t-amount-m">{eur(p.marketValue)}</span></div>
              <div className="stack"><span className="t-caption c-neutral">Plus-value</span>
                <span className="t-amount-m" style={{ color: p.unrealizedPnl >= 0 ? 'var(--success-text)' : 'var(--critical-text)' }}>{eurSigned(p.unrealizedPnl)} <span className="t-caption-strong">({pctSigned(p.unrealizedPnlPct)})</span></span>
              </div>
            </div>
          ) : <p className="c-neutral">Vous ne détenez pas encore cet ETF.</p>}
          <button type="button" className="btn btn-primary block" onClick={() => navigate('/historique/achat?etf=' + e.id)}>
            <Icon name="plus" size={20} />Enregistrer un achat
          </button>
        </section>

        <section aria-labelledby="t102-car" className="card g4 dspan-4">
          <h2 id="t102-car" style={{ marginBottom: 'var(--space-8)' }}>Caractéristiques</h2>
          <dl className="kv">
            <dt>ISIN</dt><dd>{e.isin}</dd>
            <dt>Place</dt><dd>{e.exchange}</dd>
            <dt>Catégorie</dt><dd>{e.category}</dd>
            <dt>Éligible PEA</dt><dd style={{ color: e.peaEligible ? 'var(--success-text)' : 'var(--critical-text)' }}>{e.peaEligible ? 'Oui' : 'Non'}</dd>
            <dt>Frais de gestion</dt><dd>{pct(e.ter, 2)}</dd>
            <dt>Actifs nets</dt><dd>{aum(e.aumMEur)}</dd>
            <dt>Réplication</dt><dd>{e.replication}</dd>
            <dt>Revenus</dt><dd>{e.distribution}</dd>
          </dl>
        </section>

        {sectors.length > 0 && (
          <section aria-labelledby="t102-sec" className="card g16 dspan-6">
            <h2 id="t102-sec">Répartition sectorielle</h2>
            <Donut slices={sectorSlices} label={'Secteurs du ' + e.index + ' : ' + sectors.map((x) => x.label + ' ' + pct(x.weight)).join(', ')}>
              <span className="t-amount-l">{e.sectors.length}</span>
              <span className="t-caption c-moderate">secteurs</span>
            </Donut>
            <ul>
              {sectors.map((x, i) => (
                <li key={x.label} className="legend-row">
                  <span className="dot s10" style={{ background: sectorSlices[i].color }} />
                  <span>{x.label}</span>
                  <span className="t-strong right">{pct(x.weight)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {countries.length > 0 && (
          <section aria-labelledby="t102-geo" className="card dspan-6">
            <h2 id="t102-geo">Répartition géographique</h2>
            <HBarList rows={countries} />
            {e.countries.length > 8 && <p className="t-caption c-moderate">Top 8 pays + « Autres ».</p>}
          </section>
        )}
        {!sectors.length && !countries.length && (
          <section className="card"><p className="c-neutral t-caption">Composition non renseignée pour cet ETF.</p></section>
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ T1-03
type Sort = 'ter' | 'aum' | 'year' | 'unit';
const MAX_COMPARE = 3;

export function addCatalogEtf(c: CatalogEtf): void {
  update((d) => {
    if (!d.etfs.some((e) => e.id === c.ticker)) {
      d.etfs.push({
        id: c.ticker, index: c.index, name: c.name, isin: c.isin, ticker: c.ticker, exchange: c.exchange || 'Euronext Paris',
        category: c.category, peaEligible: c.peaEligible, lastPrice: c.unitPrice, ter: c.ter, aumMEur: c.aumMEur,
        replication: c.replication, distribution: c.distribution, inStrategy: false, sectors: [], countries: [], priceHistory: [],
      });
    }
    if (!d.myEtfIds.includes(c.ticker)) d.myEtfIds.push(c.ticker);
  });
}

export function CatalogueScreen({ compare, setCompare }: { compare: string[]; setCompare: (c: string[]) => void }) {
  const { data } = useCalc();
  const [q, setQ] = useState('');
  const [f, setF] = useState({ pea: true, cheap: false, phys: false, synth: false, esg: false });
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState<Sort>('ter');
  const cats = useMemo(() => Array.from(new Set(data.catalog.map((c) => c.category))), [data.catalog]);
  const ql = q.trim().toLowerCase();
  const key: Record<Sort, (c: CatalogEtf) => number> = { ter: (c) => c.ter, aum: (c) => -c.aumMEur, year: (c) => c.inceptionYear, unit: (c) => c.unitPrice };
  const list = data.catalog
    .filter((c) => (!f.pea || c.peaEligible) && (!f.cheap || c.ter <= 0.002) && (!f.phys || c.replication === 'Physique') && (!f.synth || c.replication === 'Synthétique')
      && (!f.esg || c.esg) && (cat === 'all' || c.category === cat)
      && (!ql || (c.ticker + ' ' + c.index + ' ' + c.name + ' ' + c.isin).toLowerCase().includes(ql)))
    .sort((a, b) => key[sort](a) - key[sort](b) || b.aumMEur - a.aumMEur);
  const chip = (k: keyof typeof f, label: string) => (
    <button key={k} type="button" className="chip" aria-pressed={f[k]} onClick={() => setF({ ...f, [k]: !f[k] })} data-component="Chip.filter">{label}</button>
  );

  const toggleMine = (c: CatalogEtf) => {
    const mine = data.myEtfIds.includes(c.ticker);
    if (mine) {
      const prev = getData();
      update((d) => { d.myEtfIds = d.myEtfIds.filter((x) => x !== c.ticker); });
      showToast(c.index + ' retiré de Mes ETF', { undo: () => replaceData(prev) });
    } else {
      addCatalogEtf(c);
      showToast(c.index + ' ajouté à Mes ETF');
      refreshPrices({ silent: true });
    }
  };

  return (
    <div className="screen" data-screen="T1-03">
      <AppHeader title="Marchés" />
      <SubNav items={NAV} label="Sections Marchés" bordered>
        <label className="search" data-component="TextField.search">
          <Icon name="search" size={20} style={{ color: 'var(--text-neutral)' }} />
          <span className="sr-only">Rechercher un ETF</span>
          <input type="search" placeholder="Indice, ETF, ticker ou ISIN" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div role="group" aria-label="Filtres" className="chips">
          {chip('pea', 'Éligible PEA')}{chip('cheap', `Frais ≤ 0,20${NBSP}%`)}{chip('phys', 'Physique')}{chip('synth', 'Synthétique')}{chip('esg', 'ESG')}
          <label className="chip chip-select" aria-pressed={cat !== 'all'} data-component="Chip.select">
            <span className="sr-only">Catégorie</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">Catégorie</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Icon name="down" size={16} />
          </label>
        </div>
      </SubNav>
      <main className="content stack-8" style={{ gap: 'var(--space-8)', paddingTop: 'var(--space-12)', paddingBottom: compare.length >= 2 ? 'calc(var(--tabbar-height) + var(--safe-bottom) + 96px)' : undefined }}>
        <div className="between">
          <span className="overline c-neutral">{list.length} ETF</span>
          <label className="row c-primary t-chip" style={{ gap: 'var(--space-6)', height: 'var(--touch-min)' }}>
            <Icon name="sort" size={20} />
            <span>Trier :</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ border: 0, background: 'transparent', color: 'var(--brand-primary)', font: 'var(--type-chip)', cursor: 'pointer' }} data-component="Select">
              <option value="ter">Frais</option>
              <option value="aum">Encours</option>
              <option value="year">Année de création</option>
              <option value="unit">Prix d'une part</option>
            </select>
          </label>
        </div>
        {list.length > 0 ? (
          <ul className="tile-list" style={{ padding: '0 var(--space-12)' }}>
            {list.map((c, i) => {
              const checked = compare.includes(c.ticker);
              const mine = data.myEtfIds.includes(c.ticker);
              return (
                <li key={c.ticker} className="list-row" data-component="ListRow.catalogue" style={{ gridTemplateColumns: '20px 1fr auto var(--touch-min)', minHeight: 64, borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                  <input type="checkbox" className="checkbox" checked={checked} disabled={!checked && compare.length >= MAX_COMPARE}
                    aria-label={`Comparer ${c.index} (${c.ticker})`}
                    onChange={() => setCompare(checked ? compare.filter((x) => x !== c.ticker) : [...compare, c.ticker])} />
                  <span className="stack" style={{ minWidth: 0 }}>
                    <span className="t-strong ellipsis">{c.index}</span>
                    <span className="t-caption c-moderate ellipsis">{c.name} ({c.ticker})</span>
                  </span>
                  <span className="stack" style={{ alignItems: 'flex-end' }}>
                    <span className="t-amount-s">{pct(c.ter, 2)}</span>
                    <span className="t-caption c-moderate nowrap">{aum(c.aumMEur)}</span>
                  </span>
                  <button type="button" className="icon-btn" style={{ marginRight: 'calc(-1 * var(--space-10))' }}
                    aria-label={mine ? `${c.index} (${c.ticker}) est dans Mes ETF` : `Ajouter ${c.index} (${c.ticker}) à Mes ETF`} aria-pressed={mine} onClick={() => toggleMine(c)}>
                    {mine ? <CheckFilled /> : <Icon name="plusCircle" size={22} />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="center c-moderate" style={{ padding: 'var(--space-24) var(--space-16)' }}>Aucun ETF ne correspond à ces filtres.</p>}
      </main>
      {compare.length >= 2 && (
        <div style={{ position: 'fixed', left: 0, right: 0, margin: '0 auto', maxWidth: 'var(--content-max)', bottom: 'calc(var(--tabbar-height) + var(--safe-bottom))', zIndex: 5, padding: 'var(--space-12) var(--screen-margin)', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sticky)' }} className="row compare-bar">
          <span className="grow t-caption c-neutral">{compare.length >= MAX_COMPARE ? '3 ETF maximum' : 'Cochez jusqu’à 3 ETF'}</span>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/marches/comparer')}>Comparer ({compare.length})</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ T1-04
export function CompareScreen({ compare, setCompare }: { compare: string[]; setCompare: (c: string[]) => void }) {
  const { data } = useCalc();
  const sel = compare.map((t) => data.catalog.find((c) => c.ticker === t)).filter(Boolean) as CatalogEtf[];
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${Math.max(sel.length, 1)}, minmax(0, 1fr))`, gap: 'var(--space-8)' };
  const defs: [string, (c: CatalogEtf) => number | string | boolean | null, (v: never) => string, 'min' | 'max' | null, string][] = [
    ['Frais de gestion', (c) => c.ter, (v: number) => pct(v, 2), 'min', 'le plus bas'],
    ['Encours', (c) => c.aumMEur, (v: number) => aum(v), 'max', 'le plus élevé'],
    ['Création', (c) => c.inceptionYear, (v: number) => String(v), 'min', 'le plus ancien'],
    ['Nombre de composants', (c) => c.holdingsCount, (v: number | null) => (v === null ? '—' : num(v, 0)), 'max', 'le plus diversifié'],
    ['Réplication', (c) => c.replication, (v: string) => v, null, ''],
    ['Distribution', (c) => c.distribution, (v: string) => v, null, ''],
    ['Prix d’une part', (c) => { const e = data.etfs.find((x) => x.id === c.ticker); return e ? e.lastPrice : c.unitPrice; }, (v: number) => eur(v, v >= 100 ? 0 : 2), 'min', 'le plus accessible'],
    ['ESG', (c) => c.esg, (v: boolean) => (v ? 'Oui' : 'Non'), null, ''],
  ];
  return (
    <div className="screen" data-screen="T1-04">
      <SubHeader title={`Comparer (${sel.length})`} fallback="/marches/catalogue" />
      <div style={{ position: 'sticky', top: 'calc(var(--safe-top) + var(--header-height))', zIndex: 2, background: 'var(--bg-surface)', boxShadow: 'var(--shadow-s)', padding: 'var(--space-8) var(--screen-margin) var(--space-12)' }}>
        <div style={grid}>
          {sel.map((c) => (
            <div key={c.ticker} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-8) var(--space-8) var(--space-8) var(--space-10)', borderRadius: 'var(--radius-12)', background: 'var(--bg-surface-minimal)', minWidth: 0 }}>
              <span className="t-amount-s" style={{ paddingRight: 28 }}>{c.ticker}</span>
              <span className="t-caption c-neutral ellipsis">{c.index}</span>
              <span className="t-legal c-moderate" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.name}</span>
              <button type="button" aria-label={`Retirer ${c.ticker} de la comparaison`} onClick={() => sel.length > 2 ? setCompare(compare.filter((x) => x !== c.ticker)) : undefined}
                disabled={sel.length <= 2} style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--text-neutral)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sel.length > 2 ? 'pointer' : 'default', opacity: sel.length > 2 ? 1 : 0.35 }}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <main className="content gap-12">
        {sel.length < 2 ? <p className="c-moderate">Sélectionnez au moins 2 ETF dans le catalogue.</p> : (
          <>
            <p className="row t-caption c-neutral"><span style={{ width: 14, height: 14, borderRadius: 'var(--radius-4)', background: 'var(--success-bg)', border: '1px solid var(--success-text)' }} />Meilleure valeur de chaque ligne</p>
            <section className="card" style={{ padding: 'var(--space-4) var(--space-16)', gap: 0 }} data-component="ComparisonTable">
              {defs.map(([label, get, fmt, best, note], ri) => {
                const vals = sel.map(get);
                const nums = vals.filter((v): v is number => typeof v === 'number');
                const target = best && nums.length ? (best === 'min' ? Math.min(...nums) : Math.max(...nums)) : null;
                const same = vals.every((v) => v === vals[0]);
                return (
                  <div key={label} className="stack-8" style={{ padding: 'var(--space-12) 0', borderTop: ri ? '1px solid var(--divider-minimal)' : undefined }}>
                    <div className="between">
                      <span className="overline c-neutral">{label}</span>
                      <span className="t-legal c-moderate">{same ? 'identique' : note}</span>
                    </div>
                    <div style={grid}>
                      {vals.map((v, i) => {
                        const hit = !same && target !== null && v === target;
                        return <span key={i} style={{ padding: 'var(--space-6) var(--space-8)', borderRadius: 'var(--radius-8)', font: hit ? 'var(--type-amount-s)' : 'var(--type-body)', color: hit ? 'var(--success-text)' : 'var(--text)', background: hit ? 'var(--success-bg)' : undefined }}>{(fmt as (x: unknown) => string)(v)}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
        <button type="button" className="btn btn-secondary block form-narrow" onClick={() => navigate('/marches/catalogue', { replace: true })}>Modifier la sélection</button>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ gestion de « Mes ETF » (depuis Paramètres)
export function ManageEtfsScreen() {
  const { data } = useCalc();
  const list = data.myEtfIds.map((id) => data.etfs.find((e) => e.id === id)).filter(Boolean) as Etf[];
  const held = new Set(data.transactions.map((t) => t.etfId));
  const move = (i: number, k: number) => update((d) => {
    const a = d.myEtfIds; const j = i + k;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
  });
  const remove = (id: string) => {
    const prev = getData();
    update((d) => { d.myEtfIds = d.myEtfIds.filter((x) => x !== id); });
    showToast('ETF retiré de la liste', { undo: () => replaceData(prev) });
  };
  return (
    <div className="screen">
      <SubHeader title="Mes ETF" fallback="/parametres" />
      <main className="content gap-12 form-narrow">
        <p className="t-caption c-neutral">Ordre d’affichage dans l’onglet Marchés. Un ETF détenu reste dans le portefeuille même s’il est retiré de cette liste.</p>
        <ul className="tile-list" style={{ padding: '0 var(--space-12)' }}>
          {list.map((e, i) => (
            <li key={e.id} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto', minHeight: 64, borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
              <EtfDot id={e.id} />
              <span className="stack" style={{ minWidth: 0 }}>
                <span className="t-strong">{normalizeLabel(e.index)}</span>
                <span className="t-caption c-moderate">{e.id}{held.has(e.id) ? ' · détenu' : ''}</span>
              </span>
              <span className="row" style={{ gap: 0 }}>
                <button type="button" className="icon-btn" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={20} /></button>
                <button type="button" className="icon-btn" aria-label="Descendre" disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={20} /></button>
                <button type="button" className="icon-btn" style={{ color: 'var(--critical-text)' }} aria-label={'Retirer ' + e.index} onClick={() => remove(e.id)}><Icon name="trash" size={20} /></button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary block" onClick={() => navigate('/marches/catalogue')}><Icon name="plus" size={20} />Ajouter depuis le catalogue</button>
      </main>
    </div>
  );
}
