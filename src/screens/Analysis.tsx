// Portefeuille › Analyse : comparaison à un ETF de référence, recoupements entre ETF, risque et coût de détention
import { useMemo } from 'react';
import { AppHeader, EtfDot, Fab, PriceErrorBanner, SubNav } from '../ui/kit';
import { CompareLinesChart } from '../ui/charts';
import { Icon } from '../ui/icons';
import { navigate, openSheet } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { update } from '../data/store';
import { benchmarkCompare, holdingCost, overlapPairs, riskAnalysis, simulationWithCosts, type OverlapPair } from '../domain/analysis';
import { displayHistory, exposure, exposureCoverage } from '../domain/calc';
import { dateFr, eur, eurSigned, num, pct, pctSigned } from '../domain/format';
import { t, tl } from '../i18n';
import { PF_NAV } from './Portfolio';

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="kpi" data-component="KpiCard">
      <span className="label">{label}</span>
      <span className="t-amount-m" style={{ color: tone === 'good' ? 'var(--success-text)' : tone === 'bad' ? 'var(--critical-text)' : undefined }}>{value}</span>
      {sub && <span className="t-caption c-moderate">{sub}</span>}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="row t-caption c-neutral" style={{ alignItems: 'flex-start' }}><Icon name="info" size={18} />{children}</p>;
}

const LEVEL: Record<OverlapPair['level'], () => string> = {
  double: () => t('Même indice : doublon'),
  high: () => t('Recoupement très fort'),
  moderate: () => t('Recoupement notable'),
  low: () => t('Recoupement faible'),
};

export function AnalysisScreen() {
  const { data, positions, etf } = useCalc();
  const name = (id: string) => etf(id)?.index ?? id;

  // ---------------------------------------------------------------- référence
  const candidates = data.etfs.filter((e) => displayHistory(e).length >= 2);
  const benchId = candidates.some((e) => e.id === data.settings.benchmarkId) ? data.settings.benchmarkId! : (candidates.find((e) => e.id === 'WPEA') ?? candidates.find((e) => /world|monde/i.test(e.index + ' ' + e.category)) ?? candidates[0])?.id;
  const bench = useMemo(() => (benchId ? benchmarkCompare(data, benchId) : null), [data, benchId]);

  const pairs = useMemo(() => overlapPairs(data, positions), [data, positions]);
  const risk = useMemo(() => riskAnalysis(data, positions), [data, positions]);
  const cost = useMemo(() => holdingCost(data, positions), [data, positions]);
  const projection = useMemo(() => (cost.securities > 0 ? simulationWithCosts(data, cost, cost.ordersPerYear) : null), [data, cost]);
  const held = positions.filter((p) => p.quantity > 0);
  const cov = exposureCoverage(data, positions);
  const topCountry = exposure(data, positions, 'countries').find((r) => !r.isOther);
  const topSector = exposure(data, positions, 'sectors').find((r) => !r.isOther);
  const shownPairs = pairs.filter((p) => p.overlap >= 0.3 || p.sameIndex);

  return (
    <div className="screen" data-screen="T3-05">
      <AppHeader title={t('Portefeuille')} />
      <PriceErrorBanner />
      <SubNav items={PF_NAV()} label={t('Sections du portefeuille')} />
      <main className="content with-fab dgrid">
        {!held.length && (
          <section className="card g8 dspan-12">
            <h2>{t('Rien à analyser pour l’instant')}</h2>
            <p className="c-neutral">{t('Dès que vous aurez enregistré un achat, cette page comparera votre portefeuille à un ETF de référence, repérera les doublons, mesurera le risque et le coût de vos ETF.')}</p>
          </section>
        )}

        {/* ------------------------------------------------ 1. référence */}
        {held.length > 0 && (
          <section aria-labelledby="t305-ref" className="card g16 dspan-12" data-testid="bench">
            <div className="stack-4">
              <h2 id="t305-ref">{t('Face à un ETF de référence')}</h2>
              <span className="t-caption c-moderate">{t('Que serait devenu votre argent s’il avait été placé dans un seul ETF, aux mêmes dates ?')}</span>
            </div>
            {candidates.length > 0 && (
              <label className="field">
                <span className="lbl">{t('ETF de référence')}</span>
                <select className="input" value={benchId} onChange={(e) => update((d) => { d.settings.benchmarkId = e.target.value; })} data-component="Select">
                  {candidates.map((e) => <option key={e.id} value={e.id}>{e.index} · {e.id}</option>)}
                </select>
              </label>
            )}
            {bench ? (
              <>
                <p className="t-strong" data-testid="bench-verdict">
                  {bench.diff >= 0
                    ? t('Votre portefeuille est {a} au-dessus de ce qu’aurait donné {r}.', { a: eur(bench.diff, 0), r: name(bench.benchId) })
                    : t('Votre portefeuille est {a} en dessous de ce qu’aurait donné {r}.', { a: eur(-bench.diff, 0), r: name(bench.benchId) })}
                </p>
                <CompareLinesChart points={bench.points.map((p) => ({ date: p.date, a: p.mine, b: p.bench }))} labelA={t('Mon portefeuille')} labelB={name(bench.benchId)} />
                <div className="row t-caption c-neutral" style={{ gap: 'var(--space-16)', flexWrap: 'wrap' }}>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 3, background: 'var(--chart-value)', borderRadius: 2 }} />{t('Mon portefeuille')}</span>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 0, borderTop: '3px dashed var(--chart-2)' }} />{name(bench.benchId)}</span>
                </div>
                <div className="grid-2">
                  <Kpi label={t('Mon portefeuille')} value={eur(bench.mineEnd, 0)} sub={`${eurSigned(bench.mineGain, 0)} · ${pctSigned(bench.mineGainPct)}`} tone={bench.mineGain >= 0 ? 'good' : 'bad'} />
                  <Kpi label={name(bench.benchId)} value={eur(bench.benchEnd, 0)} sub={`${eurSigned(bench.benchGain, 0)} · ${pctSigned(bench.benchGainPct)}`} tone={bench.benchGain >= 0 ? 'good' : 'bad'} />
                </div>
                <Note>
                  {t('Comparaison du {a} au {b} : mêmes virements et retraits, rejoués aux mêmes dates au cours de clôture. Vos espèces en attente et vos frais de courtage sont comptés pour vous, pas pour la référence.', { a: dateFr(bench.from), b: dateFr(bench.to) })}
                  {bench.shortened ? ' ' + t('L’historique de cours disponible est plus court que votre histoire : la comparaison démarre à sa première date, avec la valeur que vous aviez ce jour-là.') : ''}
                </Note>
              </>
            ) : (
              <p className="c-neutral">{candidates.length ? t('Pas assez d’historique de cours pour comparer : revenez après quelques semaines de cours.') : t('Aucun ETF suivi n’a encore d’historique de cours : actualisez les cours depuis les réglages.')}</p>
            )}
          </section>
        )}

        {/* ------------------------------------------------ 2. recoupements */}
        {held.length > 0 && (
          <section aria-labelledby="t305-dup" className="card g16 dspan-6" data-testid="overlap">
            <div className="stack-4">
              <h2 id="t305-dup">{t('Doublons et recoupements')}</h2>
              <span className="t-caption c-moderate">{t('Deux ETF peuvent acheter en partie les mêmes entreprises : vous payez alors des frais deux fois pour la même exposition.')}</span>
            </div>
            {held.length < 2 ? (
              <p className="c-neutral">{t('Vous ne détenez qu’un ETF : il n’y a pas de recoupement possible.')}</p>
            ) : shownPairs.length === 0 ? (
              <p className="c-neutral">{pairs.length ? t('Aucun recoupement notable entre vos ETF : ils couvrent des zones et des secteurs différents.') : t('Les compositions de vos ETF ne sont pas encore vérifiées : le recoupement ne peut pas être calculé.')}</p>
            ) : (
              <ul className="stack" style={{ gap: 'var(--space-12)' }}>
                {shownPairs.map((p) => (
                  <li key={p.a + p.b} className="stack-4">
                    <div className="between" style={{ gap: 'var(--space-8)' }}>
                      <span className="row t-strong" style={{ gap: 6, minWidth: 0 }}><EtfDot id={p.a} size={10} />{name(p.a)} <span className="c-moderate">+</span> <EtfDot id={p.b} size={10} />{name(p.b)}</span>
                      <span className="t-amount-s">{pct(p.overlap, 0)}</span>
                    </div>
                    <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-minimal)' }}>
                      <div style={{ width: pct(Math.min(1, p.overlap), 0), height: 6, borderRadius: 3, background: p.level === 'low' ? 'var(--chart-other)' : p.level === 'moderate' ? 'var(--chart-3)' : 'var(--critical-text)' }} />
                    </div>
                    <span className="t-caption c-moderate">
                      {LEVEL[p.level]()}
                      {p.countries !== null && p.sectors !== null ? ' · ' + t('pays {c}, secteurs {s}', { c: pct(p.countries, 0), s: pct(p.sectors, 0) }) : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(topCountry || topSector) && (
              <div className="stack-4" style={{ borderTop: '1px solid var(--divider-minimal)', paddingTop: 'var(--space-12)' }}>
                <span className="t-label c-neutral">{t('Exposition cumulée')}</span>
                {topCountry && <span>{t('Premier pays : {l} ({p} du portefeuille).', { l: tl(topCountry.label), p: pct(topCountry.weight, 0) })}</span>}
                {topSector && <span>{t('Premier secteur : {l} ({p}).', { l: tl(topSector.label), p: pct(topSector.weight, 0) })}</span>}
                <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/portefeuille/repartitions')}>{t('Voir les répartitions')}</button>
                {cov.missing.length > 0 && <span className="t-caption c-moderate">{t('Calcul sur {p} du portefeuille (compositions vérifiées).', { p: pct(cov.covered, 0) })}</span>}
              </div>
            )}
            <Note>{t('Recoupement = part commune des compositions (pays et secteurs) de deux ETF. Un S&P 500 dans un MSCI World, par exemple, recoupe à peu près le poids des États-Unis dans le MSCI World.')}</Note>
          </section>
        )}

        {/* ------------------------------------------------ 3. risque */}
        {held.length > 0 && (
          <section aria-labelledby="t305-risk" className="card g16 dspan-6" data-testid="risk">
            <div className="stack-4">
              <h2 id="t305-risk">{t('Risque')}</h2>
              <span className="t-caption c-moderate">{t('À quel point la valeur de vos ETF bouge, et à quel point vous dépendez d’une seule ligne.')}</span>
            </div>
            <div className="grid-2">
              <Kpi label={t('Volatilité annuelle')} value={risk.volatility === null ? '—' : pct(risk.volatility, 1)} sub={t('Amplitude habituelle des variations')} />
              <Kpi label={t('Pire baisse')} value={risk.maxDrawdown === null ? '—' : pct(risk.maxDrawdown, 1)} tone={risk.maxDrawdown !== null && risk.maxDrawdown < -0.1 ? 'bad' : undefined}
                sub={risk.maxDrawdown !== null && risk.maxDrawdown < 0 ? t('de {a} à {b}', { a: dateFr(risk.drawdownFrom), b: dateFr(risk.drawdownTo) }) : t('depuis le début de l’historique')} />
              <Kpi label={t('Plus grosse ligne')} value={pct(risk.largestWeight, 0)} sub={risk.largestId ? name(risk.largestId) : ''} tone={risk.largestWeight > 0.6 ? 'bad' : undefined} />
              <Kpi label={t('Lignes équivalentes')} value={num(risk.effectiveLines, 1)} sub={t('sur {n} détenues', { n: held.length })} />
            </div>
            {risk.volatility === null ? (
              <Note>{t('Pas assez de séances de cours depuis votre premier achat pour mesurer la volatilité (20 au minimum).')}</Note>
            ) : (
              <Note>{t('Mesuré sur {n} séances depuis le {d}, avec les parts que vous déteniez chaque jour (vos virements ne comptent pas comme performance). Repère : les actions mondiales varient d’environ 15 % par an et ont déjà perdu plus de 30 % lors des grandes crises. Le passé ne prédit pas l’avenir.', { n: risk.days, d: dateFr(risk.since) })}</Note>
            )}
            {risk.lines.length > 0 && (
              <div className="stack-4">
                <span className="t-label c-neutral">{t('Par ETF, sur 12 mois')}</span>
                <ul>
                  {risk.lines.map((l) => (
                    <li key={l.etfId} className="between" style={{ padding: 'var(--space-8) 0', borderTop: '1px solid var(--divider-minimal)', gap: 'var(--space-8)' }}>
                      <span className="row" style={{ gap: 6, minWidth: 0 }}><EtfDot id={l.etfId} size={10} /><span className="ellipsis">{name(l.etfId)}</span></span>
                      <span className="t-caption c-neutral" style={{ whiteSpace: 'nowrap' }}>
                        {l.volatility === null ? '—' : t('vol. {v}', { v: pct(l.volatility, 0) })} · {l.maxDrawdown === null ? '—' : t('baisse max {d}', { d: pct(l.maxDrawdown, 0) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Note>{t('Lignes équivalentes : si toutes vos lignes pesaient pareil, vous en auriez ce nombre. Plus il est proche du nombre de lignes détenues, plus le portefeuille est équilibré.')}</Note>
          </section>
        )}

        {/* ------------------------------------------------ 4. coût */}
        {held.length > 0 && (
          <section aria-labelledby="t305-cost" className="card g16 dspan-12" data-testid="cost">
            <div className="stack-4">
              <h2 id="t305-cost">{t('Ce que vos ETF vous coûtent')}</h2>
              <span className="t-caption c-moderate">{t('Frais courants des ETF (prélevés dans le cours, jamais facturés) + frais de courtage de vos ordres.')}</span>
            </div>
            <div className="grid-3">
              <Kpi label={t('Frais courants')} value={eur(cost.terEur, 2)} sub={t('{p} par an en moyenne', { p: pct(cost.terPct, 2) })} />
              <Kpi label={t('Courtage, 12 mois')} value={eur(cost.brokerage12m, 2)} sub={cost.ordersPerYear ? t('{n} ordres, remboursements déduits', { n: cost.ordersPerYear }) : t('aucun ordre sur la période')} />
              <Kpi label={t('Total par an')} value={eur(cost.totalPerYear, 2)} sub={t('{p} de vos titres', { p: pct(cost.totalPct, 2) })} />
            </div>
            <ul>
              {cost.lines.map((l) => (
                <li key={l.etfId} className="between" style={{ padding: 'var(--space-8) 0', borderTop: '1px solid var(--divider-minimal)', gap: 'var(--space-8)' }}>
                  <span className="row" style={{ gap: 6, minWidth: 0 }}><EtfDot id={l.etfId} size={10} /><span className="ellipsis">{name(l.etfId)}</span></span>
                  <span className="t-caption c-neutral" style={{ whiteSpace: 'nowrap' }}>{pct(l.ter, 2)} · {t('{a} par an', { a: eur(l.perYear, 2) })}</span>
                </li>
              ))}
            </ul>
            {projection && projection.lost > 0.5 && (
              <p>
                {t('Sur {h} ans, avec votre projection du simulateur, ces frais retireraient environ {a} au capital final ({p}).', { h: data.simulation.horizonYears, a: eur(projection.lost, 0), p: pct(projection.lost / projection.without, 1) })}
                {' '}<button type="button" className="link" onClick={() => navigate('/simulateur')}>{t('Voir le simulateur')}</button>
              </p>
            )}
            <Note>{t('Les frais courants sont estimés sur la valeur détenue aujourd’hui ; le courtage compte vos ordres des 12 derniers mois.')}</Note>
          </section>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}
