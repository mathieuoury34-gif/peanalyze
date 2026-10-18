// Portefeuille › Courtiers : et si mon PEA était chez un autre courtier ? Mes ordres rejoués avec la grille de chaque courtier.
import { useMemo, useState } from 'react';
import { AppHeader, Fab, PriceErrorBanner, Segmented, SubNav, Switch } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate, openSheet } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { holdingCost } from '../domain/analysis';
import { auditFees, type AuditKind } from '../domain/feeAudit';
import { CUSTOM_BROKER, brokerOf, offerActive } from '../domain/brokers';
import { update } from '../data/store';
import { compareBrokers, plannedMonthly, scenarioOf, type Basis, type BrokerRow } from '../domain/brokerCompare';
import { dateFr, eur, eurSigned, pct } from '../domain/format';
import { t, tn } from '../i18n';
import { PF_NAV } from './Portfolio';
import { OfferLine, TariffFreshness, brokerName, describeGrid } from './BrokerParts';
import { MoneyField } from './PlanParts';

function Row({ r, max, years, scheduledOn, etfName, mine }: { r: BrokerRow; max: number; years: number; scheduledOn: boolean; etfName: (id: string) => string; mine: Record<string, 'yes' | 'no'> }) {
  const b = r.broker;
  const etfCount = r.etf.ok.length + r.etf.no.length + r.etf.unknown.length;
  const better = r.diff < -0.005, worse = r.diff > 0.005;
  return (
    <li className="stack-8" style={{ padding: 'var(--space-12) 0', borderTop: '1px solid var(--divider-minimal)' }} data-testid="broker-row" data-broker={b.id}>
      <span className="between" style={{ gap: 'var(--space-8)', alignItems: 'baseline' }}>
        <span className="t-strong">{brokerName(b)}{r.current && <span className="warn-chip" style={{ marginLeft: 'var(--space-8)', padding: '0 var(--space-6)' }}>{t('Mon courtier')}</span>}</span>
        <span className="t-amount-s">{eur(r.cost.total, 0)}<span className="t-caption c-moderate"> {t('par an')}</span></span>
      </span>
      <span className="hbar" aria-hidden="true"><span style={{ width: Math.max(2, max > 0 ? (r.cost.total / max) * 100 : 0) + '%', background: r.current ? 'var(--chart-2)' : 'var(--brand-primary)' }} /></span>
      <span className="t-caption c-neutral">
        {t('Courtage {a}', { a: eur(r.cost.brokerage) })}
        {r.cost.custody > 0 && ' · ' + t('tenue de compte {a}', { a: eur(r.cost.custody) })}
        {r.cost.inactivity > 0 && ' · ' + t('abonnement ou inactivité {a}', { a: eur(r.cost.inactivity) })}
        {r.cost.freeOrders > 0 && ' · ' + tn(r.cost.freeOrders, '{n} ordre gratuit', '{n} ordres gratuits')}
      </span>
      {!r.current && (
        <span className="t-caption" style={{ color: better ? 'var(--success-text)' : worse ? 'var(--critical-text)' : undefined }}>
          {better && t('{a} de moins par an qu’avec votre courtier actuel', { a: eur(-r.diff, 0) })}
          {worse && t('{a} de plus par an qu’avec votre courtier actuel', { a: eur(r.diff, 0) })}
          {!better && !worse && t('Même coût que votre courtier actuel')}
          {better && ' · ' + t('soit {g} de plus au bout de {y} ans si vous investissez cette économie', { g: eur(r.gainAtHorizon, 0), y: years })}
        </span>
      )}
      {!r.current && better && r.exit > 0 && (
        <span className="t-caption c-neutral">
          {r.refund > 0
            ? t('Changer coûterait jusqu’à environ {e} de frais de transfert chez votre courtier actuel, dont {r} pris en charge par l’offre de ce courtier : {n} à votre charge', { e: eur(r.exit, 0), r: eur(r.refund, 0), n: eur(r.exitNet, 0) })
            : t('Changer coûterait jusqu’à environ {e} de frais de transfert chez votre courtier actuel', { e: eur(r.exit, 0) })}
          {r.paybackMonths !== null && ' · ' + t('rentabilisé en {d}', { d: r.paybackMonths >= 24 ? tn(Math.round(r.paybackMonths / 12), '{n} an', '{n} ans') : tn(r.paybackMonths, '{n} mois', '{n} mois') })}
          {r.paybackMonths === null && r.exitNet === 0 && ' · ' + t('rien à rentabiliser')}
        </span>
      )}
      {!r.current && etfCount > 0 && (
        <span className="t-caption" style={{ color: r.etf.no.length ? 'var(--critical-text)' : r.etf.unknown.length ? 'var(--warning-text)' : 'var(--success-text)' }} data-testid="broker-etf-status">
          {r.etf.no.length > 0
            ? t('Absent chez ce courtier : {l}', { l: r.etf.no.map(etfName).join(', ') })
            : r.etf.unknown.length > 0
              ? t('Disponibilité de vos ETF à vérifier chez ce courtier ({a} sur {n} confirmés)', { a: r.etf.ok.length, n: etfCount })
              : t('Tous vos ETF sont disponibles chez ce courtier')}
        </span>
      )}
      {b.minOrder && r.cost.belowMin > 0 && (
        <span className="t-caption" style={{ color: 'var(--warning-text)' }}>{tn(r.cost.belowMin, '{n} de vos ordres est sous le minimum de {m} : il faudrait le regrouper.', '{n} de vos ordres sont sous le minimum de {m} : il faudrait les regrouper.', { m: eur(b.minOrder, 0) })}</span>
      )}
      <details>
        <summary className="t-caption" style={{ cursor: 'pointer', minHeight: 28, display: 'flex', alignItems: 'center' }}>{t('Voir la grille et les conditions')}</summary>
        <ul className="stack-4 t-caption c-neutral" style={{ paddingTop: 'var(--space-4)' }}>{describeGrid(b).map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="t-caption c-moderate" style={{ paddingTop: 'var(--space-4)' }}>{t(b.note)}</p>
        {b.catalogue && <p className="t-caption c-moderate">{t(b.catalogue.note)}</p>}
        <OfferLine b={b} />
        {!r.current && r.etf.ok.length + r.etf.no.length + r.etf.unknown.length > 0 && (
          <div className="stack-8" style={{ paddingTop: 'var(--space-8)' }}>
            <span className="t-label">{t('Mes ETF chez ce courtier')}</span>
            <span className="t-caption c-moderate">{t('Cherchez chaque ETF (par son code ISIN) sur le site du courtier, puis notez ici s’il y est proposé sur le PEA.')}</span>
            {[...r.etf.ok, ...r.etf.no, ...r.etf.unknown].map((id) => (
              <label key={id} className="between" style={{ gap: 'var(--space-8)', minHeight: 40 }}>
                <span className="t-caption">{etfName(id)}</span>
                <select className="input" style={{ width: 'auto', minWidth: 120 }} aria-label={etfName(id) + ' · ' + brokerName(b)} value={mine[id] ?? ''}
                  onChange={(e) => update((d) => {
                    const m = (d.settings.brokerEtf ||= {});
                    const per = (m[b.id] ||= {});
                    if (e.target.value) per[id] = e.target.value as 'yes' | 'no'; else delete per[id];
                    if (!Object.keys(per).length) delete m[b.id];
                    if (!Object.keys(m).length) delete d.settings.brokerEtf;
                  })}>
                  <option value="">{t('À vérifier')}</option>
                  <option value="yes">{t('Disponible')}</option>
                  <option value="no">{t('Absent')}</option>
                </select>
              </label>
            ))}
          </div>
        )}
        <TariffFreshness b={b} />
        {scheduledOn && b.scheduledFee !== undefined && <p className="t-legal c-moderate">{t('Calcul fait avec l’investissement programmé de ce courtier.')}</p>}
      </details>
    </li>
  );
}

const KIND_LABEL: Record<AuditKind, () => string> = {
  ok: () => '', higher: () => t('plus cher que la grille'), lower: () => t('moins cher que la grille'), odd: () => t('à vérifier : montant inhabituel'),
};

/** Frais réellement enregistrés contre la grille du courtier choisi : écarts, causes possibles, grille proposée. */
function FeeAuditCard() {
  const { data } = useCalc();
  const audit = useMemo(() => auditFees(data), [data]);
  const [all, setAll] = useState(false);
  const b = brokerOf(data.settings);
  if (audit.rows.length < 1) return null;
  const n = audit.rows.length, bad = audit.flagged.length;
  const shown = all ? audit.flagged : audit.flagged.slice(0, 6);
  const etfName = (id: string) => data.etfs.find((e) => e.id === id)?.name ?? id;
  const fit = audit.fit;
  const apply = () => { if (!fit) return; update((d) => { d.settings.brokerId = undefined; d.settings.feePerOrder = fit.feePerOrder; d.settings.feePct = fit.feePct || undefined; }); };
  return (
    <section aria-labelledby="t305-aud" className="card g8 dspan-12" data-testid="fee-audit">
      <h2 id="t305-aud">{t('Mes frais réels contre la grille')}</h2>
      <p className="t-caption c-neutral">{t('Chaque ordre de votre journal est rejoué avec la grille de {b}. Les écarts viennent d’une erreur de saisie, de frais cachés, d’une offre non prévue ou d’une grille qui a changé.', { b: brokerName(b) })}</p>
      <p className="t-strong" data-testid="fee-audit-verdict">
        {bad === 0
          ? t('Vos {n} ordres collent à la grille : {a} de frais enregistrés.', { n, a: eur(audit.paidTotal) })
          : t('{k} ordres sur {n} s’écartent de la grille. Frais enregistrés : {a}, grille : {g}.', { k: bad, n, a: eur(audit.paidTotal), g: eur(audit.expectedTotal) })}
      </p>
      {bad > 0 && (
        <ul>
          {shown.map((r) => (
            <li key={r.id} className="between" style={{ gap: 'var(--space-8)', padding: 'var(--space-8) 0', borderTop: '1px solid var(--divider-minimal)', alignItems: 'baseline' }} data-testid="fee-audit-row">
              <span className="stack-4" style={{ minWidth: 0 }}>
                <span className="t-label">{etfName(r.etfId)} · {dateFr(r.date)}</span>
                <span className="t-caption c-neutral">{r.side === 'buy' ? t('Achat') : t('Vente')} {eur(r.amount)} · {KIND_LABEL[r.kind]()}</span>
              </span>
              <span className="t-caption" style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0, color: r.kind === 'higher' || r.kind === 'odd' ? 'var(--critical-text)' : 'var(--warning-text)' }}>
                {t('payé {a}', { a: eur(r.net) })}<br />{t('grille {a}', { a: eur(r.expected) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {bad > 6 && <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? t('Voir moins') : t('Voir les {n} ordres', { n: bad })}</button>}
      {fit && (
        <div className="stack-8" data-testid="fee-audit-fit">
          <p className="t-caption">
            {t('Vos frais payés correspondent mieux à : {c}. Cette grille colle à {w} ordres sur {n}, contre {x} avec la grille actuelle.', {
              c: [fit.feePerOrder > 0 && eur(fit.feePerOrder) + ' ' + t('par ordre'), fit.feePct > 0 && pct(fit.feePct, 2) + ' ' + t('du montant')].filter(Boolean).join(' + '),
              w: fit.within, n: fit.n, x: fit.withinNow,
            })}
          </p>
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={apply}>
            {b.id === CUSTOM_BROKER ? t('Ajuster ma grille sur mes frais réels') : t('Utiliser cette grille à la place de {b}', { b: brokerName(b) })}
          </button>
          <span className="t-legal c-moderate">{t('La grille est recalculée sur les ordres qui ont payé des frais. Rien n’est modifié sans votre clic ; vos ordres déjà enregistrés gardent leurs frais.')}</span>
        </div>
      )}
      {bad > 0 && !fit && <p className="t-caption c-moderate">{t('Corrigez les ordres douteux dans l’Historique, ou choisissez la bonne grille dans les réglages.')}</p>}
    </section>
  );
}

export function BrokersScreen() {
  const { data, positions } = useCalc();
  const hasOrders = data.transactions.length >= 3;
  const [basis, setBasis] = useState<Basis>(hasOrders ? 'real' : 'planned');
  const [scheduled, setScheduled] = useState(false);
  const [monthly, setMonthly] = useState(() => plannedMonthly(data));
  const sc = useMemo(() => scenarioOf(data, positions, basis, monthly, scheduled), [data, positions, basis, monthly, scheduled]);
  const rows = useMemo(() => compareBrokers(data, sc), [data, sc]);
  const cost = useMemo(() => holdingCost(data, positions), [data, positions]);
  const max = Math.max(1, ...rows.map((r) => r.cost.total));
  const cur = rows.find((r) => r.current);
  const best = rows.find((r) => !r.current && r.diff < -0.005 && r.cost.belowMin === 0 && r.etf.no.length === 0); // un courtier qui refuse vos petits ordres ou n'a pas vos ETF ne compte pas
  const etfName = (id: string) => data.etfs.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="screen" data-screen="T3-05">
      <AppHeader title={t('Portefeuille')} />
      <PriceErrorBanner />
      <SubNav items={PF_NAV()} label={t('Sections du portefeuille')} />
      <main className="content with-fab dgrid">
        <details className="explain dspan-12" open={!hasOrders || undefined}>
          <summary style={{ cursor: 'pointer', font: 'var(--type-caption-strong)', minHeight: 32, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="info" size={18} />{t('Et si mon PEA était ailleurs ?')}</summary>
          <span>{t('Les frais de courtage dépendent du courtier, du montant de chaque ordre et du nombre d’ordres par an. Cet écran rejoue une année de vos ordres avec la grille de chaque courtier connu, ajoute les frais de tenue de compte, et montre ce que vous paieriez.')}</span>
          <span>{t('C’est une comparaison de frais, pas un conseil : le choix d’un courtier dépend aussi des ETF proposés, de la fiabilité, du service et des conditions de transfert.')}</span>
        </details>

        <section aria-labelledby="t305-scn" className="card g16 dspan-12">
          <h2 id="t305-scn">{t('Sur quelle année comparer ?')}</h2>
          <Segmented<Basis> label={t('Base de la comparaison')} value={basis} onChange={setBasis}
            options={[['real', t('Mes ordres des 12 derniers mois')], ['planned', t('Mon versement prévu')]]} />
          {basis === 'planned' && <MoneyField label={t('Versement mensuel')} value={monthly} onChange={setMonthly} hint={t('Réparti entre les ETF de votre stratégie selon leurs poids, un ordre par ETF et par mois.')} />}
          <div className="between" style={{ minHeight: 52, gap: 'var(--space-12)' }}>
            <span id="t305-sch">{t('Utiliser l’investissement programmé quand il est moins cher')}</span>
            <Switch checked={scheduled} onChange={setScheduled} labelledBy="t305-sch" />
          </div>
          <p className="t-caption c-neutral" data-testid="broker-basis">
            {sc.orders.length
              ? t('{n} ordres sur l’année, soit environ {m} investis par mois, pour un portefeuille de {v}.', { n: sc.orders.length, m: eur(sc.monthly, 0), v: eur(sc.portfolioValue, 0) })
              : t('Aucun ordre à comparer : enregistrez des achats ou indiquez un versement mensuel prévu.')}
          </p>
        </section>

        {sc.orders.length > 0 && cur && (
          <section aria-labelledby="t305-res" className="card dspan-12">
            <h2 id="t305-res">{t('Ce que vous paieriez par an')}</h2>
            {best ? (
              <p className="t-strong" data-testid="broker-verdict">{t('Le moins cher sur cette base : {b}, avec {a} de moins par an que votre courtier actuel.', { b: brokerName(best.broker), a: eur(-best.diff, 0) })}</p>
            ) : (
              <p className="t-strong" data-testid="broker-verdict">{t('Sur cette base, aucun des courtiers connus ne coûte moins cher que le vôtre.')}</p>
            )}
            <ul>{rows.map((r) => <Row key={r.broker.id} r={r} max={max} years={data.simulation.horizonYears} scheduledOn={scheduled} etfName={etfName} mine={data.settings.brokerEtf?.[r.broker.id] ?? {}} />)}</ul>
            {basis === 'real' && cost.brokerage12m > 0 && (
              <p className="t-caption c-neutral">{t('Pour comparaison : vos relevés montrent {a} de frais de courtage réellement payés sur 12 mois (remboursements déduits) ; la grille de votre courtier en donne {g}.', { a: eur(cost.brokerage12m), g: eur(cur.cost.brokerage) })}</p>
            )}
            <p className="t-caption c-neutral">{t('Ces chiffres ne comptent pas les frais courants des ETF : ils sont les mêmes quel que soit le courtier.')}</p>
          </section>
        )}

        <FeeAuditCard />

        <section aria-labelledby="t305-lim" className="card g8 dspan-12">
          <h2 id="t305-lim">{t('Avant de changer de courtier')}</h2>
          <ul className="stack-8 t-caption c-neutral" style={{ paddingLeft: 'var(--space-16)', listStyle: 'disc' }}>
            <li>{t('Un PEA se transfère en entier, sans vente des titres (un seul PEA par personne) : le nouveau courtier reprend la date d’ouverture, donc l’ancienneté fiscale est conservée. Comptez plusieurs semaines.')}</li>
            <li>{t('L’ancien courtier facture le transfert (environ 15 € par ligne, 150 € au plus d’après les sources consultées) ; certains courtiers remboursent tout ou partie de ces frais : renseignez-vous.')}</li>
            <li>{t('Vérifiez que vos ETF sont proposés chez le nouveau courtier, les montants minimaux par ordre et les parts entières obligatoires sur le PEA.')}</li>
            <li>{t('Les tarifs changent souvent et diffèrent selon l’offre ou la Caisse régionale : contrôlez la brochure tarifaire avant toute décision.')}</li>
          </ul>
          <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres')}>{t('Régler mon courtier dans les paramètres')}</button>
        </section>
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

void eurSigned; void offerActive;
