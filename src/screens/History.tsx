// Onglet Historique : T2-01 Vue d'ensemble, T2-02 Journal, T2-03 Ajouter, T2-04 Achat, T2-05 Virement
import { useMemo, useRef, useState } from 'react';
import { AppHeader, DatePicker, Empty, EtfDot, Fab, Hero, PriceErrorBanner, Sheet, SubHeader, SubNav, ChipGroup, showToast } from '../ui/kit';
import { AreaComparisonChart } from '../ui/charts';
import { Icon } from '../ui/icons';
import { back, navigate, openSheet, useRoute } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { computePositions, holdingAt, ledger, monthlySeries } from '../domain/calc';
import { feeFnOf } from '../domain/brokers';
import { dateFr, eur, eurSigned, monthLong, num, parseDateFr, parseNum, pct, pctSigned, toInput, todayIso, NBSP } from '../domain/format';
import { getData, newId, replaceData, update } from '../data/store';
import type { Deposit, Transaction } from '../domain/types';
import { Segmented } from '../ui/kit';
import { t, tn, tl } from '../i18n';

const NAV = [{ to: '/historique', label: t('Vue d’ensemble') }, { to: '/historique/journal', label: t('Journal') }];

// ------------------------------------------------------------------ T2-01
export function OverviewScreen() {
  const { data, summary } = useCalc();
  const [info, setInfo] = useState<string | null>(null);
  const [period, setPeriod] = useState<'6M' | '1A' | 'Tout'>('Tout');
  const series = useMemo(() => monthlySeries(data), [data]);
  const n = series.length;
  const shown = period === 'Tout' ? series : series.slice(Math.max(0, n - (period === '6M' ? 7 : 13)));
  const irr = summary.annualizedReturnXirr;
  const firstDeposit = data.deposits.length ? data.deposits.reduce((m, d) => (d.date < m ? d.date : m), data.deposits[0].date) : '';
  const ageMonths = firstDeposit ? Math.round((Date.parse(summary.valuationDate) - Date.parse(firstDeposit)) / (30.44 * 864e5)) : 0;
  const kpis: [string, string, string, boolean, string][] = [
    ['dep', t('Montant total épargné'), eur(summary.totalDeposited), false, tn(data.deposits.length, 'Somme de tous les virements faits sur le PEA ({n} virement).', 'Somme de tous les virements faits sur le PEA ({n} virements).')],
    ['inv', t('Investi en titres'), eur(summary.investedInSecurities), false, t('Somme des cours × quantités des achats, moins celle des ventes, hors frais.')],
    ['cash', t('Solde espèces'), eur(summary.cashBalance), false, t('Argent présent sur le PEA mais pas encore investi (virements − achats frais compris + remboursements).')],
    ['pnl', summary.realizedPnl ? t('Plus-value totale') : t('Plus-value latente'), eurSigned(summary.unrealizedPnl), true, summary.realizedPnl ? t('Valorisation totale − montant total épargné : plus-value latente (lignes encore détenues) + plus-value déjà réalisée par vos ventes ({r}).', { r: eurSigned(summary.realizedPnl) }) : t('Valorisation totale − montant total épargné. Elle n’est réalisée qu’à la vente.')],
    ['ret', t('Rendement global'), pctSigned(summary.globalReturnPct), true, t('Plus-value latente ÷ montant total épargné.')],
    ['irr', t('Rendement annualisé (TRI)'), irr === null ? '—' : pctSigned(irr), true, t('Taux de rendement interne (XIRR) qui tient compte de la date de chaque virement.') + (ageMonths && ageMonths < 24 ? ' ' + t('Élevé car le PEA a {n} mois : il se stabilisera avec le temps.', { n: ageMonths }) : '')],
  ];
  const cur = kpis.find((k) => k[0] === info);
  const gainColor = (v: number) => (v >= 0 ? 'var(--success-text)' : 'var(--critical-text)');

  if (!data.deposits.length && !data.transactions.length) {
    return (
      <div className="screen">
        <AppHeader title={t('Historique')} />
        <SubNav items={NAV} label={t('Sections Historique')} />
        <Empty title={t("Aucun achat pour l'instant")} text={t("Enregistrez votre premier virement puis vos achats d'ETF pour suivre votre PEA.")}
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('/historique/virement')}><Icon name="plus" size={20} />{t('Ajouter un virement')}</button>} />
      </div>
    );
  }

  return (
    <div className="screen" data-screen="T2-01">
      <AppHeader title={t('Historique')} />
      <PriceErrorBanner />
      <SubNav items={NAV} label={t('Sections Historique')} />
      <main className="content with-fab dgrid">
        <Hero className="dspan-5" label={t('Valorisation totale')} value={eur(summary.totalValue)} chip={`${summary.unrealizedPnl >= 0 ? '▲' : '▼'} ${eurSigned(summary.unrealizedPnl)} · ${pctSigned(summary.globalReturnPct)}`} />
        <div className="stack-8 dspan-7">
          <section aria-label={t('Indicateurs')} className="grid-2 kpi-grid">
            {kpis.map(([id, label, value, gain]) => {
              const raw = id === 'pnl' ? summary.unrealizedPnl : id === 'ret' ? summary.globalReturnPct : id === 'irr' ? irr ?? 0 : 1;
              return (
                <div key={id} className="kpi" data-component="KpiCard">
                  <span className="label">{label}</span>
                  <span className="value" style={{ color: gain ? gainColor(raw) : 'var(--text)' }}>{value}</span>
                  <button type="button" className="icon-btn info" aria-label={t('Explication : {l}', { l: label })} aria-expanded={info === id} onClick={() => setInfo(info === id ? null : id)} style={{ color: 'var(--text-neutral)' }}>
                    <Icon name="info" size={18} />
                  </button>
                </div>
              );
            })}
          </section>
          {cur && (
            <div role="note" className="note">
              <Icon name="info" size={20} />
              <span><strong>{cur[1]}</strong> — {cur[4]}</span>
            </div>
          )}
        </div>

        <section aria-labelledby="t201-chart" className="card dspan-7">
          <h2 id="t201-chart">{t('Épargne vs valeur réelle')}</h2>
          <div className="legend">
            <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-value)' }} />{t('Valeur réelle')}</span>
            <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-deposited-line)' }} />{t('Montant épargné')}</span>
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-gain-area)' }} />{t('Plus-value')}</span>
          </div>
          <ChipGroup label={t('Période')} value={period} onChange={setPeriod} options={[['6M', '6M'], ['1A', t('1A')], ['Tout', t('Tout')]]} />
          <AreaComparisonChart points={shown} />
        </section>

        <section aria-labelledby="t201-fees" className="card dspan-5">
          <h2 id="t201-fees">{t('Frais')}</h2>
          <dl className="dl">
            <dt>{t('Frais payés')}</dt><dd>{eur(summary.feesPaid)}</dd>
            <dt>{t('Frais remboursés')}</dt><dd className="c-success">{eur(-summary.feesRefunded)}</dd>
            <dt className="t-strong total" style={{ color: 'var(--text)' }}>{t('Coût net')}</dt><dd className="t-amount-m total">{eur(summary.feesNet)}</dd>
          </dl>
          <div className="stack" style={{ gap: 'var(--space-6)' }}>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary.refundedShare * 1000) / 10} aria-label={t('Part des frais remboursés')} className="hbar" style={{ overflow: 'hidden' }}>
              <span style={{ width: Math.min(100, summary.refundedShare * 100) + '%' }} />
            </div>
            <div className="between t-caption c-neutral wrap">
              <span>{t('{p} des frais remboursés', { p: pct(summary.refundedShare) })}</span>
              <span>{t('Frais moyens')} <strong style={{ color: 'var(--text)' }}>{pct(summary.avgFeePct, 2)}</strong> {t('par ordre')}</span>
            </div>
          </div>
        </section>

        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center', justifySelf: 'center' }} onClick={() => navigate('/historique/journal', { replace: true })}>
          {t("Voir tout l'historique")}<Icon name="next" size={20} />
        </button>
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

// ------------------------------------------------------------------ T2-02
type Op = { kind: 'dep'; d: Deposit } | { kind: 'buy'; t: Transaction } | { kind: 'sell'; t: Transaction };

export function JournalScreen() {
  const { data, etf } = useCalc();
  const [filter, setFilter] = useState<'all' | 'dep' | 'buy' | 'sell'>('all');
  const sales = useMemo(() => ledger(data.transactions).sales, [data.transactions]);
  const [all, setAll] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const ops: Op[] = [];
  if (filter === 'all' || filter === 'dep') data.deposits.forEach((d) => ops.push({ kind: 'dep', d }));
  data.transactions.forEach((t) => {
    if (t.quantity < 0 ? filter === 'all' || filter === 'sell' : filter === 'all' || filter === 'buy') ops.push({ kind: t.quantity < 0 ? 'sell' : 'buy', t });
  });
  const dateOf = (o: Op) => (o.kind === 'dep' ? o.d.date : o.t.date);
  ops.sort((x, y) => (dateOf(x) < dateOf(y) ? 1 : dateOf(x) > dateOf(y) ? -1 : x.kind === 'dep' ? -1 : 1));
  const groups: { key: string; ops: Op[] }[] = [];
  for (const o of ops) {
    const key = dateOf(o).slice(0, 7);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, ops: [] }));
    g.ops.push(o);
  }
  const shown = all ? groups : groups.slice(0, 4);

  const remove = (o: Op) => {
    const prev = getData();
    update((d) => {
      if (o.kind === 'dep') d.deposits = d.deposits.filter((x) => x.id !== o.d.id);
      else d.transactions = d.transactions.filter((x) => x.id !== o.t.id);
    });
    setSwiped(null);
    setConfirm(null);
    showToast(o.kind === 'dep' ? (o.d.amount < 0 ? t('Retrait supprimé') : t('Virement supprimé')) : o.kind === 'sell' ? t('Vente supprimée') : t('Achat supprimé'), { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen" data-screen="T2-02">
      <AppHeader title={t('Historique')} />
      <SubNav items={NAV} label={t('Sections Historique')}>
        <div className="seg" role="group" aria-label={t("Type d'opération")} data-component="SegmentedControl">
          {([['all', t('Tout')], ['dep', t('Virements')], ['buy', t('Achats')], ['sell', t('Ventes')]] as const).map(([id, l]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>
          ))}
        </div>
      </SubNav>
      <main className="content with-fab" style={{ padding: '0 0 calc(var(--tabbar-height) + var(--safe-bottom) + 96px)', gap: 0 }}>
        {!ops.length && <Empty title={filter === 'dep' ? t('Aucun virement') : filter === 'sell' ? t('Aucune vente pour l’instant') : t('Aucun achat pour l’instant')} text={t('Utilisez le bouton + pour enregistrer une opération.')} />}
        {shown.map((g) => {
          const dep = data.deposits.filter((d) => d.date.slice(0, 7) === g.key).reduce((s, d) => s + d.amount, 0);
          return (
            <section key={g.key} className="stack">
              <h2 className="month-header" data-component="MonthHeader">
                <span>{monthLong(g.key)}</span>
                {dep > 0 && <span className="total">{t('versé +{v}', { v: eur(dep) })}</span>}
                {dep < 0 && <span className="total">{t('retiré {v}', { v: eur(-dep) })}</span>}
              </h2>
              <ul className="op-list">
                {g.ops.map((o) => {
                  const id = o.kind === 'dep' ? o.d.id : o.t.id;
                  return (
                    <OpItem key={id} op={o} name={o.kind !== 'dep' ? etf(o.t.etfId)?.index ?? o.t.etfId : ''} sale={o.kind === 'sell' ? sales.get(o.t.id) : undefined}
                      swiped={swiped === id} confirming={confirm === id}
                      onSwipe={(v) => { setSwiped(v ? id : null); setConfirm(null); }}
                      onEdit={() => navigate(o.kind === 'dep' ? '/historique/virement?edit=' + id : '/historique/achat?edit=' + id)}
                      onDelete={() => (confirm === id ? remove(o) : setConfirm(id))} />
                  );
                })}
              </ul>
            </section>
          );
        })}
        {!all && groups.length > 4 && (
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'center', marginTop: 'var(--space-16)' }} onClick={() => setAll(true)}>{t('Afficher les mois précédents')}</button>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function OpItem({ op, name, sale, swiped, confirming, onSwipe, onEdit, onDelete }: { op: Op; name: string; sale?: { gain: number }; swiped: boolean; confirming: boolean; onSwipe: (v: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const onDown = (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; moved.current = false; };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      moved.current = true;
      onSwipe(dx < 0);
      start.current = null;
    }
  };
  const click = () => { if (!moved.current) onSwipe(!swiped); moved.current = false; };
  let title: string, sub: string, fees = '', amount: string, amountColor: string, aria: string;
  if (op.kind === 'dep') {
    const out = op.d.amount < 0;
    title = out ? t('Retrait du PEA') : t('Virement sur le PEA'); sub = dateFr(op.d.date); amount = (out ? '' : '+') + eur(op.d.amount); amountColor = out ? 'var(--text)' : 'var(--success-text)';
    aria = out ? t('Retrait du {d}, {v}. Afficher les actions', { d: sub, v: eur(-op.d.amount) }) : t('Virement du {d}, {v}. Afficher les actions', { d: sub, v: eur(op.d.amount) });
  } else if (op.kind === 'sell') {
    const tx = op.t, q = -tx.quantity;
    title = t('Vente · {n} · {q}', { n: name, q: tn(q, '{n} part × {p}', '{n} parts × {p}', { p: eur(tx.unitPrice, 2, 4) }) });
    sub = dateFr(tx.date);
    fees = t('Frais {f} · remb. {r}', { f: eur(tx.fees), r: eur(tx.feeRefund) }) + (sale ? ' · ' + t('plus-value réalisée {g}', { g: eurSigned(sale.gain) }) : '');
    amount = '+' + eur(-tx.grossAmount + tx.feeRefund); amountColor = 'var(--success-text)';
    aria = t('Vente {n} du {d}, {v}. Afficher les actions', { n: name, d: sub, v: eur(-tx.grossAmount) });
  } else {
    const tx = op.t;
    title = name + ' · ' + tn(tx.quantity, '{n} part × {p}', '{n} parts × {p}', { p: eur(tx.unitPrice, 2, 4) });
    sub = dateFr(tx.date);
    fees = t('Frais {f} · remb. {r} · {p}', { f: eur(tx.fees), r: eur(tx.feeRefund), p: pct(tx.unitPrice * tx.quantity > 0 ? tx.fees / (tx.unitPrice * tx.quantity) : 0, 2) });
    amount = eur(-tx.grossAmount); amountColor = 'var(--text)';
    aria = t('Achat {n} du {d}, {v}. Afficher les actions', { n: name, d: sub, v: eur(tx.grossAmount) });
  }
  return (
    <li className={'op-item' + (swiped ? ' swiped' : '')}>
      {swiped && (
        <span className="op-actions">
          <button type="button" className="edit" onClick={onEdit}><Icon name="pencil" size={20} />{t('Modifier')}</button>
          <button type="button" className="del" onClick={onDelete}><Icon name={confirming ? 'check' : 'trash'} size={20} />{confirming ? t('Confirmer') : t('Supprimer')}</button>
        </span>
      )}
      <button type="button" className="op-row" aria-label={aria} aria-expanded={swiped} onPointerDown={onDown} onPointerMove={onMove} onClick={click}
        data-component={op.kind === 'dep' ? 'ListRow.deposit' : 'ListRow.purchase'}>
        {op.kind === 'dep'
          ? <span className="op-icon" style={{ background: 'var(--bg-blue-minimal)', color: 'var(--text-blue)' }}><Icon name="deposit" size={20} /></span>
          : <span className="op-icon" style={{ background: 'var(--bg-surface-minimal)' }}><EtfDot id={op.t.etfId} size={14} /></span>}
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{title}</span>
          <span className="t-caption c-moderate">{sub}</span>
          {fees && <span className="t-legal c-moderate">{fees}</span>}
        </span>
        <span className="t-amount-s nowrap" style={{ color: amountColor }}>{amount}</span>
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ T2-03
export function AddSheet() {
  return (
    <Sheet title={t('Ajouter')}>
      <div className="grid-2" style={{ gap: 'var(--space-12)', paddingBottom: 'calc(var(--safe-bottom) + var(--space-16))' }}>
        <button type="button" className="tile" style={{ background: 'var(--bg-blue-minimal)' }} onClick={() => navigate('/historique/virement', { replace: true })} data-component="Tile">
          <span className="tile-icon" style={{ color: 'var(--text-blue)' }}><Icon name="deposit" /></span>
          <span className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="t-amount-m">{t('Virement')}</span>
            <span className="t-caption c-neutral">{t('Argent versé sur le PEA')}</span>
          </span>
        </button>
        <button type="button" className="tile" style={{ background: 'var(--bg-brand-minimal)' }} onClick={() => navigate('/historique/achat', { replace: true })} data-component="Tile">
          <span className="tile-icon" style={{ color: 'var(--primary-fg)' }}><Icon name="cart" /></span>
          <span className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="t-amount-m">{t("Achat d'ETF")}</span>
            <span className="t-caption c-neutral">{t('Parts achetées en bourse')}</span>
          </span>
        </button>
        <button type="button" className="tile" style={{ background: 'var(--bg-surface-minimal)' }} onClick={() => navigate('/historique/achat?type=vente', { replace: true })} data-component="Tile">
          <span className="tile-icon" style={{ color: 'var(--primary-fg)' }}><Icon name="cart" /></span>
          <span className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="t-amount-m">{t("Vente d'ETF")}</span>
            <span className="t-caption c-neutral">{t('Parts vendues en bourse')}</span>
          </span>
        </button>
        <button type="button" className="tile" style={{ background: 'var(--bg-surface-minimal)' }} onClick={() => navigate('/historique/virement?type=retrait', { replace: true })} data-component="Tile">
          <span className="tile-icon" style={{ color: 'var(--text-blue)' }}><Icon name="upload" /></span>
          <span className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="t-amount-m">{t('Retrait')}</span>
            <span className="t-caption c-neutral">{t('Argent sorti du PEA')}</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ T2-04
export function PurchaseScreen() {
  const route = useRoute();
  const { data, etf } = useCalc();
  const editId = route.query.get('edit');
  const editing = editId ? data.transactions.find((t) => t.id === editId) : undefined;
  const preset = route.query.get('etf');
  const [mode, setMode] = useState<'buy' | 'sell'>(editing ? (editing.quantity < 0 ? 'sell' : 'buy') : route.query.get('type') === 'vente' ? 'sell' : 'buy');
  const sell = mode === 'sell';
  const heldNow = new Set(computePositions(data).filter((p) => p.quantity > 0).map((p) => p.etfId));
  const choices = data.etfs.filter((e) => (sell ? heldNow.has(e.id) || e.id === editing?.etfId : data.myEtfIds.includes(e.id) || data.transactions.some((t) => t.etfId === e.id)));
  const initialEtf = editing?.etfId || (preset && choices.some((e) => e.id === preset) ? preset : choices.find((e) => e.inStrategy)?.id || choices[0]?.id || '');
  const [etfId, setEtfId] = useState(initialEtf);
  const [etfOpen, setEtfOpen] = useState(false);
  const [date, setDate] = useState(editing?.date || todayIso());
  const [calOpen, setCalOpen] = useState(false);
  const [price, setPrice] = useState(editing ? toInput(editing.unitPrice, editing.unitPrice % 0.01 > 1e-9 ? 4 : 2) : toInput(etf(initialEtf)?.lastPrice ?? 0));
  const [qty, setQty] = useState(editing ? Math.abs(editing.quantity) : 1);
  const [gross, setGross] = useState(editing ? toInput(Math.abs(editing.grossAmount)) : '');
  const [refund, setRefund] = useState(editing ? toInput(editing.feeRefund) : toInput(0));
  const cur = etf(etfId);
  const p = parseNum(price), r = parseNum(refund) || 0;
  const exec = isFinite(p) ? Math.round(p * qty * 100) / 100 : 0;
  // Montant brut laissé vide : estimation = cours × quantité + frais estimés par ordre (Paramètres › PEA)
  // Vente : « g » est la somme reçue (frais déduits) ; les frais = cours × quantité − somme reçue
  const estFee = feeFnOf(data)(exec, { etfId, side: sell ? 'sell' : 'buy' });
  const estimated = Math.round((sell ? Math.max(exec - estFee, 0) : exec + estFee) * 100) / 100;
  const grossAuto = !gross.trim();
  const g = grossAuto ? estimated : parseNum(gross);
  const fees = isFinite(g) ? Math.round((sell ? exec - g : g - exec) * 100) / 100 : 0;
  const err = isFinite(g) && g > 0 && fees < 0;
  const held = cur ? holdingAt(data.transactions, etfId, date, editing?.id) : { quantity: 0, costBasis: 0, realized: 0 };
  const tooMany = sell && qty > held.quantity;
  const gainEst = sell && isFinite(g) && held.quantity > 0 ? Math.round((g + r - (held.costBasis / held.quantity) * Math.min(qty, held.quantity)) * 100) / 100 : 0;
  const valid = !!cur && isFinite(p) && p > 0 && qty > 0 && isFinite(g) && g > 0 && !err && r >= 0 && !tooMany;
  const missing = !cur ? (sell ? t('Aucun ETF détenu à vendre.') : t('Choisissez un ETF (ajoutez-le d’abord à « Mes ETF » depuis le catalogue).'))
    : tooMany ? t('Vous ne détenez que {n} parts à cette date.', { n: held.quantity })
    : !(isFinite(p) && p > 0) ? t('Indiquez le cours unitaire.')
      : !grossAuto && !(isFinite(g) && g > 0) ? t('Montant brut invalide.')
        : r < 0 || !isFinite(parseNum(refund) || 0) ? t('Remboursement de frais invalide.') : '';

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid) return;
    const prev = getData();
    const tx: Transaction = { id: editing?.id || newId(sell ? 's' : 'b'), date, etfId, unitPrice: p, quantity: sell ? -qty : qty, grossAmount: sell ? -g : g, fees: Math.max(fees, 0), feeRefund: r };
    update((d) => {
      if (editing) d.transactions = d.transactions.map((t) => (t.id === editing.id ? tx : t));
      else d.transactions.push(tx);
      if (!d.myEtfIds.includes(etfId)) d.myEtfIds.push(etfId);
    });
    back('/historique/journal');
    showToast(editing ? (sell ? t('Vente modifiée') : t('Achat modifié')) : sell ? t('Vente enregistrée') : t('Achat enregistré'), { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen screen-white" data-screen="T2-04">
      <SubHeader title={editing ? (sell ? t('Modifier la vente') : t('Modifier l’achat')) : sell ? t('Nouvelle vente') : t('Nouvel achat')} fallback="/historique/journal" close bordered />
      <form onSubmit={save} className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-20) var(--screen-margin) var(--space-24)' }}>
          {!editing && <Segmented label={t('Type d’opération')} value={mode} onChange={(m) => { setMode(m); setGross(''); const first = data.etfs.find((e) => (m === 'sell' ? heldNow.has(e.id) : data.myEtfIds.includes(e.id))); if (first && !(m === 'sell' ? heldNow.has(etfId) : data.myEtfIds.includes(etfId))) { setEtfId(first.id); setPrice(toInput(first.lastPrice)); } }} options={[['buy', t('Achat')], ['sell', t('Vente')]]} />}
          <div className="field">
            <span id="t204-etf" className="lbl">ETF</span>
            <button type="button" className="select-btn" aria-haspopup="listbox" aria-expanded={etfOpen} aria-labelledby="t204-etf" onClick={() => setEtfOpen(!etfOpen)} data-component="Select">
              <EtfDot id={etfId} />
              <span><strong style={{ fontWeight: 600 }}>{cur?.index ?? t('Choisir')}</strong> <span className="c-moderate">· {etfId}</span></span>
              <Icon name="down" size={20} style={{ color: 'var(--text-neutral)' }} />
            </button>
            {etfOpen && (
              <ul role="listbox" aria-labelledby="t204-etf" className="listbox">
                {choices.map((e) => (
                  <li key={e.id} role="none">
                    <button type="button" role="option" aria-selected={e.id === etfId} onClick={() => { setEtfId(e.id); setEtfOpen(false); if (!editing) setPrice(toInput(e.lastPrice)); }}>
                      <EtfDot id={e.id} />
                      <span>{tl(e.index)} <span className="c-moderate">· {e.id}</span></span>
                      {e.id === etfId && <Icon name="check" size={18} strokeWidth={2.4} style={{ color: 'var(--primary-fg)' }} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="field">
            <span id="t204-date" className="lbl">{t('Date')}</span>
            <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} aria-labelledby="t204-date" aria-expanded={calOpen} onClick={() => setCalOpen(!calOpen)} data-component="DatePicker.field">
              <span>{dateFr(date)}</span>
              <Icon name="calendar" size={20} style={{ color: 'var(--primary-fg)' }} />
            </button>
            {calOpen && <DatePicker value={date} label={sell ? t('Date de la vente') : t("Date de l'achat")} onChange={(d) => { setDate(d); setCalOpen(false); }} />}
          </div>
          <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
            <label className="field">
              <span className="lbl">{t('Cours unitaire (€)')}</span>
              <input className="input num" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-component="AmountField" />
            </label>
            <div className="field">
              <span id="t204-qty" className="lbl">{t('Quantité')}</span>
              <div role="group" aria-labelledby="t204-qty" className="stepper" data-component="Stepper">
                <button type="button" aria-label={t('Retirer une part')} onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" size={20} /></button>
                <input type="text" inputMode="numeric" aria-label={t('Quantité')} value={qty} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); setQty(isFinite(v) && v > 0 ? v : 1); }} />
                <button type="button" aria-label={t('Ajouter une part')} onClick={() => setQty(sell && held.quantity > 0 ? Math.min(qty + 1, held.quantity) : qty + 1)}><Icon name="plus" size={20} /></button>
              </div>
            </div>
          </div>
          <label className="field">
            <span className="lbl">{sell ? t('Montant net reçu (€)') : t('Montant brut payé (€)')}</span>
            <input className={'input num' + (err ? ' invalid' : '')} type="text" inputMode="decimal" value={gross} placeholder={toInput(estimated)}
              onChange={(e) => setGross(e.target.value)} aria-invalid={err} data-component="AmountField" />
            <span className="hint">{sell
              ? (grossAuto
                ? t('Laissé vide, la vente est enregistrée à {v} (cours × quantité − {f} de frais estimés). Saisissez la somme réellement créditée si elle est différente.', { v: eur(estimated), f: eur(estFee) })
                : t('Somme créditée par le courtier, frais déduits'))
              : grossAuto
                ? t('Laissé vide, l’achat est enregistré à {v} (cours × quantité + {f} de frais estimés). Saisissez le débit réel du courtier s’il est différent.', { v: eur(estimated), f: eur(estFee) })
                : t('Débit affiché par le courtier, frais inclus')}</span>
            {err && <span role="alert" className="err">{sell ? t('La somme reçue ne peut pas dépasser cours × quantité.') : t("Le montant brut doit être supérieur ou égal au cours d'exécution.")}</span>}
          </label>
          <label className="field">
            <span className="lbl">{t('Remboursement de frais (€)')}</span>
            <input className="input num" type="text" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} data-component="AmountField" />
          </label>
          <section aria-label={t('Calculs')} aria-live="polite" className="calc-box">
            <div className="between"><span className="c-neutral">{t("Cours d'exécution")} <span className="t-caption">({isFinite(p) ? eur(p, 2, 4) : '—'} × {qty})</span></span><strong className="t-amount-s">{eur(exec)}</strong></div>
            <div className="between"><span className="c-neutral">{t('Frais')} <span className="t-caption">{t('(brut − exécution)')}</span></span><strong className="t-amount-s">{eur(Math.max(fees, 0))}</strong></div>
            <div className="between"><span className="c-neutral">{t('% de frais')}</span><strong className="t-amount-s">{exec > 0 && isFinite(g) ? pct(Math.max(fees, 0) / exec, 2) : '—'}</strong></div>
            <div className="between" style={{ paddingTop: 'var(--space-8)', borderTop: '1px solid var(--divider-minimal)' }}><span className="c-neutral">{t('Frais nets après remboursement')}</span><strong className="t-amount-s">{eur(Math.max(fees - r, 0))}</strong></div>
            {sell && cur && (
              <>
                <div className="between"><span className="c-neutral">{t('Parts détenues avant la vente')}</span><strong className="t-amount-s">{held.quantity}</strong></div>
                <div className="between"><span className="c-neutral">{t('Plus-value réalisée estimée')} <span className="t-caption">{t('(au PRU {p})', { p: eur(held.quantity > 0 ? held.costBasis / held.quantity : 0) })}</span></span><strong className="t-amount-s" style={{ color: gainEst >= 0 ? 'var(--success-text)' : 'var(--critical-text)' }}>{eurSigned(gainEst)}</strong></div>
              </>
            )}
          </section>
        </div>
        <div style={{ position: 'sticky', bottom: 0, padding: 'var(--space-12) var(--screen-margin) calc(var(--safe-bottom) + var(--space-12))', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sticky)' }}>
          <div className="form-narrow stack-8">
            {!valid && missing && <span role="status" className="t-caption-strong c-critical center">{missing}</span>}
            <button type="submit" className="btn btn-primary block" disabled={!valid}>{editing ? t('Enregistrer les modifications') : sell ? t('Enregistrer la vente') : t("Enregistrer l'achat")}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ T2-05
export function DepositScreen() {
  const route = useRoute();
  const { data, summary } = useCalc();
  const editId = route.query.get('edit');
  const editing = editId ? data.deposits.find((d) => d.id === editId) : undefined;
  const [date, setDate] = useState(dateFr(editing?.date || todayIso()));
  const [amount, setAmount] = useState(editing ? toInput(Math.abs(editing.amount)) : '');
  const [out, setOut] = useState(editing ? editing.amount < 0 : route.query.get('type') === 'retrait');
  const iso = parseDateFr(date);
  const v = parseNum(amount);
  const valid = !!iso && isFinite(v) && v > 0;
  const base = summary.totalDeposited - (editing?.amount || 0);
  const signed = out ? -v : v;

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid) return;
    const prev = getData();
    const dep: Deposit = { id: editing?.id || newId(out ? 'w' : 'd'), date: iso, amount: out ? -v : v };
    update((d) => {
      if (editing) d.deposits = d.deposits.map((x) => (x.id === editing.id ? dep : x));
      else d.deposits.push(dep);
    });
    back('/historique/journal');
    showToast(editing ? (out ? t('Retrait modifié') : t('Virement modifié')) : out ? t('Retrait enregistré') : t('Virement enregistré'), { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen screen-white" data-screen="T2-05">
      <SubHeader title={editing ? (out ? t('Modifier le retrait') : t('Modifier le virement')) : out ? t('Nouveau retrait') : t('Nouveau virement')} fallback="/historique/journal" close bordered />
      <form onSubmit={save} className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-20) var(--screen-margin)' }}>
          {!editing && <Segmented label={t('Type d’opération')} value={out ? 'out' : 'in'} onChange={(m) => setOut(m === 'out')} options={[['in', t('Versement')], ['out', t('Retrait')]]} />}
          <label className="field">
            <span className="lbl">{t('Date')}</span>
            <span className="input-wrap">
              <input className={'input' + (date && !iso ? ' invalid' : '')} type="text" inputMode="numeric" placeholder={t('jj/mm/aaaa')} value={date} onChange={(e) => setDate(e.target.value)} style={{ paddingRight: 48 }} data-component="DatePicker.field" />
              <span className="icon-right"><Icon name="calendar" size={20} /></span>
            </span>
            {date && !iso && <span className="err">{t('Date invalide (jj/mm/aaaa).')}</span>}
          </label>
          <label className="field">
            <span className="lbl">{t('Montant (€)')}</span>
            <input className="input num large" type="text" inputMode="decimal" value={amount} placeholder={toInput(0)} onChange={(e) => setAmount(e.target.value)} data-component="AmountField" />
          </label>
          <div role="note" className="note">
            <Icon name="info" size={20} />
            <span>{out ? t('Le retrait diminue le montant total épargné et le solde espèces. Il doit correspondre à de l’argent réellement sorti du PEA (la somme doit être disponible en espèces : vendez d’abord si besoin).') : t("Le virement s'ajoute au montant total épargné et au solde espèces. Enregistrez ensuite vos achats pour l'investir.")}</span>
          </div>
          <dl className="dl calc-box" style={{ display: 'grid' }}>
            <dt>{out ? t('Total épargné après ce retrait') : t('Total épargné après ce virement')}</dt>
            <dd className="t-amount-s">{eur(base + (isFinite(v) ? signed : 0))}</dd>
          </dl>
        </div>
        <div style={{ padding: 'var(--space-12) var(--screen-margin) calc(var(--safe-bottom) + var(--space-12))', boxShadow: 'var(--shadow-sticky)' }}>
          <div className="form-narrow"><button type="submit" className="btn btn-primary block" disabled={!valid}>{editing ? t('Enregistrer les modifications') : out ? t('Enregistrer le retrait') : t('Enregistrer le virement')}</button></div>
        </div>
      </form>
    </div>
  );
}
