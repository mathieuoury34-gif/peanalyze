// Onglet Marchés : T1-01 Mes ETF, T1-02 Détail, T1-03 Catalogue, T1-04 Comparateur, gestion de la liste
import { useMemo, useState } from 'react';
import { AppHeader, EtfDot, PriceErrorBanner, Sheet, SubHeader, SubNav, VarChip, showToast } from '../ui/kit';
import { Donut, HBarList, PriceChart, Sparkline } from '../ui/charts';
import { CheckFilled, Icon } from '../ui/icons';
import { closeSheet, navigate, openSheet, useRoute } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { displayHistory, normalizeLabel, periodStartIndex, topWithOthers } from '../domain/calc';
import { aum, dateFr, eur, eurSigned, num, pct, pctSigned, NBSP } from '../domain/format';
import { getData, replaceData, update } from '../data/store';
import { MAX_ETFS, refreshPrices, usePriceStatus } from '../data/prices';
import { lang, t, tl } from '../i18n';
import type { CatalogEtf, Etf } from '../domain/types';
import { catKey, CATALOG_DATE, COMPOSITION_DATE, isCatalogComposition } from '../data/seed';

const NAV = [{ to: '/marches', label: t('Mes ETF') }, { to: '/marches/catalogue', label: t('Catalogue') }];
const color = (id: string) => `var(--etf-${id}, var(--chart-other))`;

/** Pages officielles et complètes d'un ETF (ouvertes dans le navigateur). */
export function etfLinks(isin: string, ticker: string): { label: string; href: string }[] {
  const links = [{ label: t('Fiche complète sur justETF'), href: `https://www.justetf.com/${lang === 'en' ? 'en' : 'fr'}/etf-profile.html?isin=${encodeURIComponent(isin)}` }];
  if (ticker) links.push({ label: t('Cours sur Google Finance'), href: `https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:EPA?hl=${lang}` });
  return links;
}

export function EtfLinks({ isin, ticker }: { isin: string; ticker: string }) {
  if (!isin) return null;
  return (
    <div className="stack-4" style={{ paddingTop: 'var(--space-8)' }}>
      {etfLinks(isin, ticker).map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="ext-link">
          <Icon name="external" size={18} />{l.label}
        </a>
      ))}
      <span className="t-legal c-moderate">{t('Documents officiels (DIC, prospectus, rapports) disponibles depuis la fiche justETF ou le site de l’émetteur.')}</span>
    </div>
  );
}

// ------------------------------------------------------------------ T1-01
export function MyEtfsScreen() {
  const { data } = useCalc();
  const etfs = data.myEtfIds.map((id) => data.etfs.find((e) => e.id === id)).filter(Boolean) as Etf[];
  const firstDate = etfs.reduce((m, e) => (e.priceHistory[0] && (!m || e.priceHistory[0][0] < m) ? e.priceHistory[0][0] : m), '');
  return (
    <div className="screen" data-screen="T1-01">
      <AppHeader title={t('Marchés')} />
      <PriceErrorBanner />
      <SubNav items={NAV} label={t('Sections Marchés')} />
      <main className="content gap-12">
        <div className="between" style={{ gap: 'var(--space-8)' }}>
          <p className="t-caption c-moderate">{t('{n} ETF suivis', { n: etfs.length })}{firstDate ? ' · ' + t('variation depuis le {d}', { d: dateFr(firstDate) }) : ''}</p>
          <button type="button" className="btn btn-tertiary" style={{ flexShrink: 0 }} onClick={() => navigate('/parametres/etf')}><Icon name="list" size={18} />{t('Gérer ma liste')}</button>
        </div>
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
                    <span className="t-amount-m">{tl(e.index)}</span>
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
                  <span className="badge">{tl(e.distribution)}</span>
                  <span className="badge">{tl(e.replication)}</span>
                  <span className="badge">{t('Frais {p}', { p: pct(e.ter, 2) })}</span>
                </span>
              </a>
            );
          })}
        </div>
        {etfs.length === 0 && <p className="center c-moderate" style={{ padding: 'var(--space-24)' }}>{t('Aucun ETF suivi. Ajoutez-en depuis le catalogue.')}</p>}
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
  const robot = usePriceStatus().robot;
  if (!e) {
    return (
      <div className="screen">
        <SubHeader title="ETF" fallback="/marches" />
        <main className="content"><p className="c-moderate">{t('Cet ETF n’existe plus dans vos données.')}</p></main>
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
  const sectors = topWithOthers(e.sectors, 8).map((x) => ({ ...x, label: tl(x.label) }));
  const countries = topWithOthers(e.countries, 8).map((x) => ({ ...x, label: tl(x.label) }));
  const emptyText = !robot.loaded ? undefined
    : !robot.tracked.includes(e.ticker) ? t('Historique en cours de récupération : le robot des cours l’ajoute dans l’heure qui suit l’ajout à « Mes ETF » (compte Google connecté nécessaire).')
      : robot.skipped.includes(e.ticker) ? t('Quota quotidien du robot atteint : l’historique sera récupéré à son prochain passage.') : undefined;
  const sectorSlices = sectors.map((x, i) => ({ value: x.weight, color: x.isOther ? 'var(--chart-other)' : `var(--chart-${i + 1})` }));

  return (
    <div className="screen" data-screen="T1-02">
      <SubHeader title={tl(e.index)} fallback="/marches" />
      <main className="content flush-top dgrid">
        <section aria-label={t('Cours')} className="bleed stack-12 dspan-8" style={{ paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-20)', gridRow: 'span 3' }}>
          <div className="stack-4">
            <span className="t-caption c-moderate">{e.name} · {e.id}</span>
            <span className="t-display">{eur(e.lastPrice)}</span>
            <span className="row wrap">
              {h.length > 1 && <VarChip ratio={ch} />}
              <span className="t-caption c-neutral">{period === 'Perso' && from ? t('du {a} au {b}', { a: dateFr(h[s][0]), b: dateFr(h[h.length - 1][0]) }) : h[s] ? t('depuis le {d}', { d: dateFr(h[s][0]) }) : ''}</span>
            </span>
          </div>
          <div role="group" aria-label={t('Période du graphique')} className="chips g6">
            {(['1M', '3M', '6M', '1A', 'Max', 'Perso'] as Period[]).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={period === k} onClick={() => { setPeriod(k); if (k === 'Perso' && !from && h.length) setFrom(h[Math.max(0, h.length - 60)][0]); }}>
                {k === 'Perso' && <Icon name="calendar" size={16} />}{k === 'Perso' ? t('Personnalisé') : k === '1A' ? t('1A') : k}
              </button>
            ))}
          </div>
          {period === 'Perso' && (
            <label className="field">
              <span className="lbl t-caption">{t('Début de la période')}</span>
              <input className="input" type="date" value={from} min={h[0]?.[0]} max={h[h.length - 1]?.[0]} onChange={(ev) => setFrom(ev.target.value)} />
            </label>
          )}
          <PriceChart history={h} start={s} buys={buys} pru={p && p.quantity > 0 ? p.pru : undefined} color={color(e.id)} emptyText={emptyText}
            label={t('Cours de l’ETF {i} du {a} au {b}, de {x} à {y}', { i: e.index, a: h[s] ? dateFr(h[s][0]) : '', b: h.length ? dateFr(h[h.length - 1][0]) : '', x: eur(first), y: eur(e.lastPrice) })} />
          <div className="legend">
            <span><span className="dot s10" style={{ background: 'var(--bg-surface)', border: '2px solid var(--brand-primary)' }} />{t('Mes achats ({n})', { n: buys.length })}</span>
            {p && p.quantity > 0 && <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-pru)' }} />{t('Prix de revient')}</span>}
          </div>
        </section>

        <section aria-labelledby="t102-pos" className="card highlight dspan-4">
          <h2 id="t102-pos">{t('Ma position')}</h2>
          {p && p.quantity > 0 ? (
            <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
              <div className="stack"><span className="t-caption c-neutral">{t('Parts')}</span><span className="t-amount-m">{p.quantity}</span></div>
              <div className="stack"><span className="t-caption c-neutral">{t('PRU')}</span><span className="t-amount-m">{eur(p.pru)}</span></div>
              <div className="stack"><span className="t-caption c-neutral">{t('Valeur')}</span><span className="t-amount-m">{eur(p.marketValue)}</span></div>
              <div className="stack"><span className="t-caption c-neutral">{t('Plus-value')}</span>
                <span className="t-amount-m" style={{ color: p.unrealizedPnl >= 0 ? 'var(--success-text)' : 'var(--critical-text)' }}>{eurSigned(p.unrealizedPnl)} <span className="t-caption-strong">({pctSigned(p.unrealizedPnlPct)})</span></span>
              </div>
            </div>
          ) : <p className="c-neutral">{t('Vous ne détenez pas encore cet ETF.')}</p>}
          <button type="button" className="btn btn-primary block" onClick={() => navigate('/historique/achat?etf=' + e.id)}>
            <Icon name="plus" size={20} />{t('Enregistrer un achat')}
          </button>
        </section>

        <section aria-labelledby="t102-car" className="card g4 dspan-4">
          <h2 id="t102-car" style={{ marginBottom: 'var(--space-8)' }}>{t('Caractéristiques')}</h2>
          <dl className="kv">
            <dt>ISIN</dt><dd>{e.isin}</dd>
            <dt>{t('Place')}</dt><dd>{tl(e.exchange)}</dd>
            <dt>{t('Catégorie')}</dt><dd>{tl(e.category)}</dd>
            <dt>{t('Éligible PEA')}</dt><dd style={{ color: e.peaEligible ? 'var(--success-text)' : 'var(--critical-text)' }}>{e.peaEligible ? t('Oui') : t('Non')}</dd>
            <dt>{t('Frais de gestion')}</dt><dd>{pct(e.ter, 2)}</dd>
            <dt>{t('Actifs nets')}</dt><dd>{aum(e.aumMEur)}</dd>
            <dt>{t('Réplication')}</dt><dd>{tl(e.replication)}</dd>
            <dt>{t('Revenus')}</dt><dd>{tl(e.distribution)}</dd>
          </dl>
          <EtfLinks isin={e.isin} ticker={e.ticker} />
        </section>

        {sectors.length > 0 && (
          <section aria-labelledby="t102-sec" className="card g16 dspan-6">
            <h2 id="t102-sec">{t('Répartition sectorielle')}</h2>
            <Donut slices={sectorSlices} label={t('Secteurs du {i} : {l}', { i: e.index, l: sectors.map((x) => x.label + ' ' + pct(x.weight)).join(', ') })}>
              <span className="t-amount-l">{e.sectors.length}</span>
              <span className="t-caption c-moderate">{t('secteurs')}</span>
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
            <h2 id="t102-geo">{t('Répartition géographique')}</h2>
            <HBarList rows={countries} />
            {e.countries.length > 8 && <p className="t-caption c-moderate">{t('Top 8 pays + « Autres ».')}</p>}
          </section>
        )}
        {(sectors.length > 0 || countries.length > 0) && isCatalogComposition(e) && (
          <p className="t-caption c-moderate dspan-12">{t('Principaux secteurs et pays de l’indice suivi (source justETF, au {d}).', { d: dateFr(COMPOSITION_DATE) })}</p>
        )}
        {!sectors.length && !countries.length && (
          <section className="card"><p className="c-neutral t-caption">{t('Composition non renseignée pour cet ETF.')}</p></section>
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ T1-03
type Sort = 'ter' | 'aum' | 'year' | 'unit';
const MAX_COMPARE = 3;

export function addCatalogEtf(c: CatalogEtf): void {
  if (!c.ticker) return; // non coté sur Euronext Paris : pas de suivi de cours possible
  update((d) => {
    if (!d.etfs.some((e) => e.id === c.ticker)) {
      d.etfs.push({
        id: c.ticker, index: c.index, name: c.name, isin: c.isin, ticker: c.ticker, exchange: c.exchange || 'Euronext Paris',
        category: c.category, peaEligible: c.peaEligible, lastPrice: c.unitPrice ?? 0, ter: c.ter, aumMEur: c.aumMEur ?? 0,
        replication: c.replication ?? 'Synthétique', distribution: c.distribution ?? 'Capitalisant', inStrategy: false, sectors: structuredClone(c.sectors ?? []), countries: structuredClone(c.countries ?? []), priceHistory: [],
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
  const route = useRoute();
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const infoEtf = route.query.get('sheet') === 'info' && infoKey ? data.catalog.find((c) => catKey(c) === infoKey) : undefined;
  const showInfo = (c: CatalogEtf) => { setInfoKey(catKey(c)); openSheet('info'); };
  const CAT_ORDER = ['Monde', 'États-Unis', 'Europe', 'Zone euro', 'France', 'Allemagne', 'Autres pays européens', 'Émergents, Asie et Japon', 'Secteurs et thèmes', 'Levier et inverse', 'Monétaire et diversifiés'];
  const cats = useMemo(() => Array.from(new Set(data.catalog.map((c) => c.category))).sort((a, b) => (CAT_ORDER.indexOf(a) + 99) % 99 - (CAT_ORDER.indexOf(b) + 99) % 99), [data.catalog]);
  const ql = q.trim().toLowerCase();
  // valeurs inconnues (null) toujours en fin de liste
  const key: Record<Sort, (c: CatalogEtf) => number> = { ter: (c) => c.ter, aum: (c) => -(c.aumMEur ?? -Infinity), year: (c) => c.inceptionYear ?? Infinity, unit: (c) => c.unitPrice ?? Infinity };
  const list = data.catalog
    .filter((c) => (!f.pea || c.peaEligible) && (!f.cheap || c.ter <= 0.002) && (!f.phys || c.replication === 'Physique') && (!f.synth || c.replication === 'Synthétique')
      && (!f.esg || c.esg) && (cat === 'all' || c.category === cat)
      && (!ql || (c.ticker + ' ' + c.index + ' ' + c.name + ' ' + c.isin).toLowerCase().includes(ql)))
    .sort((a, b) => (key[sort](a) - key[sort](b)) || ((b.aumMEur ?? 0) - (a.aumMEur ?? 0)));
  const chip = (k: keyof typeof f, label: string) => (
    <button key={k} type="button" className="chip" aria-pressed={f[k]} onClick={() => setF({ ...f, [k]: !f[k] })} data-component="Chip.filter">{label}</button>
  );

  const toggleMine = (c: CatalogEtf) => {
    if (!c.ticker) { showToast(t('Cet ETF n’est pas coté sur Euronext Paris : suivi des cours impossible'), { error: true }); return; }
    const mine = data.myEtfIds.includes(c.ticker);
    const followed = new Set([...data.myEtfIds, ...data.transactions.map((x) => x.etfId)]).size;
    const freq = data.settings.priceFreq === 1 ? 1 : 2;
    if (!mine && followed >= MAX_ETFS[freq]) {
      showToast(freq === 2
        ? t('Maximum {m} ETF suivis avec 2 actualisations par jour : retirez-en un, ou passez à 1 actualisation par jour dans les paramètres.', { m: MAX_ETFS[2] })
        : t('Maximum {m} ETF suivis : retirez-en un de « Mes ETF » avant d’en ajouter un autre.', { m: MAX_ETFS[1] }), { error: true });
      return;
    }
    if (mine) {
      const prev = getData();
      update((d) => { d.myEtfIds = d.myEtfIds.filter((x) => x !== c.ticker); });
      showToast(t('{i} retiré de Mes ETF', { i: c.index }), { undo: () => replaceData(prev) });
    } else {
      addCatalogEtf(c);
      showToast(t('{i} ajouté à Mes ETF', { i: c.index }));
      refreshPrices({ silent: true });
    }
  };

  return (
    <div className="screen" data-screen="T1-03">
      <AppHeader title={t('Marchés')} />
      <SubNav items={NAV} label={t('Sections Marchés')} bordered>
        <label className="search" data-component="TextField.search">
          <Icon name="search" size={20} style={{ color: 'var(--text-neutral)' }} />
          <span className="sr-only">{t('Rechercher un ETF')}</span>
          <input type="search" placeholder={t('Indice, ETF, ticker ou ISIN')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div role="group" aria-label={t('Filtres')} className="chips">
          {chip('pea', t('Éligible PEA'))}{chip('cheap', t('Frais ≤ {p}', { p: pct(0.002, 2) }))}{chip('phys', t('Physique'))}{chip('synth', t('Synthétique'))}{chip('esg', 'ESG')}
          <label className="chip chip-select" aria-pressed={cat !== 'all'} data-component="Chip.select">
            <span className="sr-only">{t('Catégorie')}</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">{t('Catégorie')}</option>
              {cats.map((c) => <option key={c} value={c}>{tl(c)}</option>)}
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
            <span>{t('Trier :')}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ border: 0, background: 'transparent', color: 'var(--primary-fg)', font: 'var(--type-chip)', cursor: 'pointer' }} data-component="Select">
              <option value="ter">{t('Frais')}</option>
              <option value="aum">{t('Encours')}</option>
              <option value="year">{t('Année de création')}</option>
              <option value="unit">{t("Prix d'une part")}</option>
            </select>
          </label>
        </div>
        {list.length > 0 ? (
          <ul className="tile-list" style={{ padding: '0 var(--space-12)' }}>
            {list.map((c, i) => {
              const k = catKey(c);
              const checked = compare.includes(k);
              const mine = !!c.ticker && data.myEtfIds.includes(c.ticker);
              return (
                <li key={k} className="list-row" data-component="ListRow.catalogue" style={{ gridTemplateColumns: '20px 1fr auto var(--touch-min)', minHeight: 64, borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
                  <input type="checkbox" className="checkbox" checked={checked} disabled={!checked && compare.length >= MAX_COMPARE}
                    aria-label={t('Comparer {i} ({k})', { i: c.index, k: c.ticker || c.isin })}
                    onChange={() => setCompare(checked ? compare.filter((x) => x !== k) : [...compare, k])} />
                  <button type="button" className="row-link stack" style={{ minWidth: 0 }} onClick={() => showInfo(c)}
                    aria-label={t('Informations sur {i} ({k})', { i: c.index, k: c.ticker || c.isin })}>
                    <span className="t-strong ellipsis">{tl(c.index)} <Icon name="info" size={14} style={{ verticalAlign: '-2px', color: 'var(--text-moderate)' }} /></span>
                    <span className="t-caption c-moderate ellipsis">{c.name} ({c.ticker || t('hors Paris')})</span>
                    {c.note && <span className="t-legal c-moderate ellipsis">{tl(c.note)}</span>}
                  </button>
                  <span className="stack" style={{ alignItems: 'flex-end' }}>
                    <span className="t-amount-s">{pct(c.ter, 2)}</span>
                    <span className="t-caption c-moderate nowrap">{aum(c.aumMEur)}</span>
                  </span>
                  <button type="button" className="icon-btn" style={{ marginRight: 'calc(-1 * var(--space-10))', opacity: c.ticker ? 1 : 0.35 }}
                    aria-label={!c.ticker ? t('{i} : non coté sur Euronext Paris', { i: c.index }) : mine ? t('{i} ({k}) est dans Mes ETF', { i: c.index, k: c.ticker }) : t('Ajouter {i} ({k}) à Mes ETF', { i: c.index, k: c.ticker })} aria-pressed={mine} onClick={() => toggleMine(c)}>
                    {mine ? <CheckFilled /> : <Icon name="plusCircle" size={22} />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="center c-moderate" style={{ padding: 'var(--space-24) var(--space-16)' }}>{t('Aucun ETF ne correspond à ces filtres.')}</p>}
        <p className="t-legal c-moderate" style={{ padding: '0 var(--space-4)' }}>{t('Liste des ETF éligibles au PEA (source justETF, relevé du {d}). Frais, encours et prix d’une part indicatifs ; vérifiez auprès de votre courtier avant d’acheter.', { d: CATALOG_DATE.split('-').reverse().join('/') })}</p>
      </main>
      {infoEtf && <CatalogInfoSheet c={infoEtf} mine={!!infoEtf.ticker && data.myEtfIds.includes(infoEtf.ticker)} onToggleMine={() => toggleMine(infoEtf)} />}
      {compare.length >= 2 && (
        <div style={{ position: 'fixed', left: 0, right: 0, margin: '0 auto', maxWidth: 'var(--content-max)', bottom: 'calc(var(--tabbar-height) + var(--safe-bottom))', zIndex: 5, padding: 'var(--space-12) var(--screen-margin)', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sticky)' }} className="row compare-bar">
          <span className="grow t-caption c-neutral">{compare.length >= MAX_COMPARE ? t('3 ETF maximum') : t('Cochez jusqu’à 3 ETF')}</span>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/marches/comparer')}>{t('Comparer ({n})', { n: compare.length })}</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ fiche rapide d'un ETF du catalogue
function CatalogInfoSheet({ c, mine, onToggleMine }: { c: CatalogEtf; mine: boolean; onToggleMine: () => void }) {
  const { data } = useCalc();
  const inData = !!c.ticker && data.etfs.some((e) => e.id === c.ticker);
  return (
    <Sheet title={tl(c.index)} onClose={closeSheet}
      footer={
        <div className="stack-8">
          {c.ticker && (
            <button type="button" className={'btn block ' + (mine ? 'btn-secondary' : 'btn-primary')} onClick={onToggleMine}>
              {mine ? <><Icon name="check" size={20} />{t('Dans Mes ETF (retirer)')}</> : <><Icon name="plus" size={20} />{t('Ajouter à Mes ETF')}</>}
            </button>
          )}
          {inData && <button type="button" className="btn btn-tertiary block" onClick={() => { closeSheet(); setTimeout(() => navigate('/marches/etf/' + c.ticker), 0); }}>{t('Ouvrir la fiche dans l’app (cours et graphique)')}</button>}
        </div>
      }>
      <div className="stack-8" style={{ paddingBottom: 'var(--space-12)' }}>
        <span className="t-caption c-moderate">{c.name}</span>
        <dl className="kv">
          <dt>ISIN</dt><dd>{c.isin}</dd>
          <dt>{t('Mnémonique')}</dt><dd>{c.ticker || t('non coté à Paris')}</dd>
          <dt>{t('Catégorie')}</dt><dd>{tl(c.category)}</dd>
          <dt>{t('Éligible PEA')}</dt><dd>{c.peaEligible ? t('Oui') : t('Non')}</dd>
          <dt>{t('Frais de gestion')}</dt><dd>{pct(c.ter, 2)} {t('par an')}</dd>
          <dt>{t('Encours')}</dt><dd>{aum(c.aumMEur)}</dd>
          {c.inceptionYear !== null && <><dt>{t('Création')}</dt><dd>{c.inceptionYear}</dd></>}
          {c.holdingsCount !== null && <><dt>{t('Nombre de composants')}</dt><dd>{num(c.holdingsCount, 0)}</dd></>}
          <dt>{t('Réplication')}</dt><dd>{c.replication ? tl(c.replication) : '—'}</dd>
          <dt>{t('Revenus')}</dt><dd>{c.distribution ? tl(c.distribution) : '—'}</dd>
          <dt>ESG</dt><dd>{c.esg ? t('Oui') : t('Non')}</dd>
          {c.unitPrice !== null && <><dt>{t('Prix d’une part (indicatif)')}</dt><dd>{eur(c.unitPrice)}</dd></>}
        </dl>
        {c.note && <p className="t-caption c-neutral">{tl(c.note)}</p>}
        <EtfLinks isin={c.isin} ticker={c.ticker} />
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ T1-04
export function CompareScreen({ compare, setCompare }: { compare: string[]; setCompare: (c: string[]) => void }) {
  const { data } = useCalc();
  const sel = compare.map((t) => data.catalog.find((c) => catKey(c) === t)).filter(Boolean) as CatalogEtf[];
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${Math.max(sel.length, 1)}, minmax(0, 1fr))`, gap: 'var(--space-8)' };
  const defs: [string, (c: CatalogEtf) => number | string | boolean | null, (v: never) => string, 'min' | 'max' | null, string][] = [
    [t('Frais de gestion'), (c) => c.ter, (v: number) => pct(v, 2), 'min', t('le plus bas')],
    [t('Encours'), (c) => c.aumMEur, (v: number) => aum(v), 'max', t('le plus élevé')],
    [t('Création'), (c) => c.inceptionYear, (v: number | null) => (v === null ? '—' : String(v)), 'min', t('le plus ancien')],
    [t('Nombre de composants'), (c) => c.holdingsCount, (v: number | null) => (v === null ? '—' : num(v, 0)), 'max', t('le plus diversifié')],
    [t('Réplication'), (c) => c.replication, (v: string | null) => (v ? tl(v) : '—'), null, ''],
    [t('Distribution'), (c) => c.distribution, (v: string | null) => (v ? tl(v) : '—'), null, ''],
    [t('Prix d’une part'), (c) => { const e = c.ticker ? data.etfs.find((x) => x.id === c.ticker) : undefined; return e ? e.lastPrice : c.unitPrice; }, (v: number | null) => (v === null ? '—' : eur(v, v >= 100 ? 0 : 2)), 'min', t('le plus accessible')],
    ['ESG', (c) => c.esg, (v: boolean) => (v ? t('Oui') : t('Non')), null, ''],
  ];
  return (
    <div className="screen" data-screen="T1-04">
      <SubHeader title={t('Comparer ({n})', { n: sel.length })} fallback="/marches/catalogue" />
      <div style={{ position: 'sticky', top: 'calc(var(--safe-top) + var(--header-height))', zIndex: 2, background: 'var(--bg-surface)', boxShadow: 'var(--shadow-s)', padding: 'var(--space-8) var(--screen-margin) var(--space-12)' }}>
        <div style={grid}>
          {sel.map((c) => (
            <div key={catKey(c)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-8) var(--space-8) var(--space-8) var(--space-10)', borderRadius: 'var(--radius-12)', background: 'var(--bg-surface-minimal)', minWidth: 0 }}>
              <span className="t-amount-s" style={{ paddingRight: 28 }}>{c.ticker || c.isin}</span>
              <span className="t-caption c-neutral ellipsis">{tl(c.index)}</span>
              <span className="t-legal c-moderate" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.name}</span>
              <button type="button" aria-label={t('Retirer {k} de la comparaison', { k: c.ticker || c.isin })} onClick={() => sel.length > 2 ? setCompare(compare.filter((x) => x !== catKey(c))) : undefined}
                disabled={sel.length <= 2} style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--text-neutral)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sel.length > 2 ? 'pointer' : 'default', opacity: sel.length > 2 ? 1 : 0.35 }}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <main className="content gap-12">
        {sel.length < 2 ? <p className="c-moderate">{t('Sélectionnez au moins 2 ETF dans le catalogue.')}</p> : (
          <>
            <p className="row t-caption c-neutral"><span style={{ width: 14, height: 14, borderRadius: 'var(--radius-4)', background: 'var(--success-bg)', border: '1px solid var(--success-text)' }} />{t('Meilleure valeur de chaque ligne')}</p>
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
                      <span className="t-legal c-moderate">{same ? t('identique') : note}</span>
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
        <button type="button" className="btn btn-secondary block form-narrow" onClick={() => navigate('/marches/catalogue', { replace: true })}>{t('Modifier la sélection')}</button>
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
    showToast(t('ETF retiré de la liste'), { undo: () => replaceData(prev) });
  };
  return (
    <div className="screen">
      <SubHeader title={t('Mes ETF')} fallback="/parametres" />
      <main className="content gap-12 form-narrow">
        <p className="t-caption c-neutral">{t('Ordre d’affichage dans l’onglet Marchés. Un ETF détenu reste dans le portefeuille même s’il est retiré de cette liste.')}</p>
        <p className="t-caption c-neutral">{t('{n} / {m} ETF suivis par le robot des cours ({f} par jour). Un ETF retiré n’est plus actualisé.', { n: new Set([...data.myEtfIds, ...held]).size, m: MAX_ETFS[data.settings.priceFreq === 1 ? 1 : 2], f: data.settings.priceFreq === 1 ? t('1 actualisation') : t('2 actualisations') })}</p>
        <ul className="tile-list" style={{ padding: '0 var(--space-12)' }}>
          {list.map((e, i) => (
            <li key={e.id} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto', minHeight: 64, borderTop: i ? '1px solid var(--divider-minimal)' : undefined }}>
              <EtfDot id={e.id} />
              <span className="stack" style={{ minWidth: 0 }}>
                <span className="t-strong">{tl(normalizeLabel(e.index))}</span>
                <span className="t-caption c-moderate">{e.id}{held.has(e.id) ? ' · ' + t('détenu') : ''}</span>
              </span>
              <span className="row" style={{ gap: 0 }}>
                <button type="button" className="icon-btn" aria-label={t('Monter')} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={20} /></button>
                <button type="button" className="icon-btn" aria-label={t('Descendre')} disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={20} /></button>
                <button type="button" className="icon-btn" style={{ color: 'var(--critical-text)' }} aria-label={t('Retirer {i}', { i: e.index })} onClick={() => remove(e.id)}><Icon name="trash" size={20} /></button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary block" onClick={() => navigate('/marches/catalogue')}><Icon name="plus" size={20} />{t('Ajouter depuis le catalogue')}</button>
      </main>
    </div>
  );
}
