// Onglet Historique : T2-01 Vue d'ensemble, T2-02 Journal, T2-03 Ajouter, T2-04 Achat, T2-05 Virement
import { useMemo, useRef, useState } from 'react';
import { AppHeader, DatePicker, Empty, EtfDot, Fab, Hero, PriceErrorBanner, Sheet, SubHeader, SubNav, ChipGroup, showToast } from '../ui/kit';
import { AreaComparisonChart } from '../ui/charts';
import { Icon } from '../ui/icons';
import { back, navigate, openSheet, useRoute } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { monthlySeries } from '../domain/calc';
import { dateFr, eur, eurSigned, monthLong, num, parseDateFr, parseNum, pct, pctSigned, toInput, todayIso, NBSP } from '../domain/format';
import { getData, newId, replaceData, update } from '../data/store';
import type { Deposit, Transaction } from '../domain/types';

const NAV = [{ to: '/historique', label: 'Vue d’ensemble' }, { to: '/historique/journal', label: 'Journal' }];

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
    ['dep', 'Montant total épargné', eur(summary.totalDeposited), false, `Somme de tous les virements faits sur le PEA (${data.deposits.length} virement${data.deposits.length > 1 ? 's' : ''}).`],
    ['inv', 'Investi en titres', eur(summary.investedInSecurities), false, 'Somme des cours × quantités de tous les achats, hors frais.'],
    ['cash', 'Solde espèces', eur(summary.cashBalance), false, 'Argent présent sur le PEA mais pas encore investi (virements − achats frais compris + remboursements).'],
    ['pnl', 'Plus-value latente', eurSigned(summary.unrealizedPnl), true, 'Valorisation totale − montant total épargné. Elle n’est réalisée qu’à la vente.'],
    ['ret', 'Rendement global', pctSigned(summary.globalReturnPct), true, 'Plus-value latente ÷ montant total épargné.'],
    ['irr', 'Rendement annualisé (TRI)', irr === null ? '—' : pctSigned(irr), true, 'Taux de rendement interne (XIRR) qui tient compte de la date de chaque virement.' + (ageMonths && ageMonths < 24 ? ` Élevé car le PEA a ${ageMonths} mois : il se stabilisera avec le temps.` : '')],
  ];
  const cur = kpis.find((k) => k[0] === info);
  const gainColor = (v: number) => (v >= 0 ? 'var(--success-text)' : 'var(--critical-text)');

  if (!data.deposits.length && !data.transactions.length) {
    return (
      <div className="screen">
        <AppHeader title="Historique" />
        <SubNav items={NAV} label="Sections Historique" />
        <Empty title="Aucun achat pour l'instant" text="Enregistrez votre premier virement puis vos achats d'ETF pour suivre votre PEA."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('/historique/virement')}><Icon name="plus" size={20} />Ajouter un virement</button>} />
      </div>
    );
  }

  return (
    <div className="screen" data-screen="T2-01">
      <AppHeader title="Historique" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections Historique" />
      <main className="content with-fab dgrid">
        <Hero className="dspan-5" label="Valorisation totale" value={eur(summary.totalValue)} chip={`${summary.unrealizedPnl >= 0 ? '▲' : '▼'} ${eurSigned(summary.unrealizedPnl)} · ${pctSigned(summary.globalReturnPct)}`} />
        <div className="stack-8 dspan-7">
          <section aria-label="Indicateurs" className="grid-2 kpi-grid">
            {kpis.map(([id, label, value, gain]) => {
              const raw = id === 'pnl' ? summary.unrealizedPnl : id === 'ret' ? summary.globalReturnPct : id === 'irr' ? irr ?? 0 : 1;
              return (
                <div key={id} className="kpi" data-component="KpiCard">
                  <span className="label">{label}</span>
                  <span className="value" style={{ color: gain ? gainColor(raw) : 'var(--text)' }}>{value}</span>
                  <button type="button" className="icon-btn info" aria-label={'Explication : ' + label} aria-expanded={info === id} onClick={() => setInfo(info === id ? null : id)} style={{ color: 'var(--text-neutral)' }}>
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
          <h2 id="t201-chart">Épargne vs valeur réelle</h2>
          <div className="legend">
            <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-value)' }} />Valeur réelle</span>
            <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-deposited-line)' }} />Montant épargné</span>
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-gain-area)' }} />Plus-value</span>
          </div>
          <ChipGroup label="Période" value={period} onChange={setPeriod} options={[['6M', '6M'], ['1A', '1A'], ['Tout', 'Tout']]} />
          <AreaComparisonChart points={shown} />
        </section>

        <section aria-labelledby="t201-fees" className="card dspan-5">
          <h2 id="t201-fees">Frais</h2>
          <dl className="dl">
            <dt>Frais payés</dt><dd>{eur(summary.feesPaid)}</dd>
            <dt>Frais remboursés</dt><dd className="c-success">{eur(-summary.feesRefunded)}</dd>
            <dt className="t-strong total" style={{ color: 'var(--text)' }}>Coût net</dt><dd className="t-amount-m total">{eur(summary.feesNet)}</dd>
          </dl>
          <div className="stack" style={{ gap: 'var(--space-6)' }}>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary.refundedShare * 1000) / 10} aria-label="Part des frais remboursés" className="hbar" style={{ overflow: 'hidden' }}>
              <span style={{ width: Math.min(100, summary.refundedShare * 100) + '%' }} />
            </div>
            <div className="between t-caption c-neutral wrap">
              <span>{pct(summary.refundedShare)} des frais remboursés</span>
              <span>Frais moyens <strong style={{ color: 'var(--text)' }}>{pct(summary.avgFeePct, 2)}</strong> par ordre</span>
            </div>
          </div>
        </section>

        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center', justifySelf: 'center' }} onClick={() => navigate('/historique/journal', { replace: true })}>
          Voir tout l'historique<Icon name="next" size={20} />
        </button>
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

// ------------------------------------------------------------------ T2-02
type Op = { kind: 'dep'; d: Deposit } | { kind: 'buy'; t: Transaction };

export function JournalScreen() {
  const { data, etf } = useCalc();
  const [filter, setFilter] = useState<'all' | 'dep' | 'buy'>('all');
  const [all, setAll] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const ops: Op[] = [];
  if (filter !== 'buy') data.deposits.forEach((d) => ops.push({ kind: 'dep', d }));
  if (filter !== 'dep') data.transactions.forEach((t) => ops.push({ kind: 'buy', t }));
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
    showToast(o.kind === 'dep' ? 'Virement supprimé' : 'Achat supprimé', { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen" data-screen="T2-02">
      <AppHeader title="Historique" />
      <SubNav items={NAV} label="Sections Historique">
        <div className="seg" role="group" aria-label="Type d'opération" data-component="SegmentedControl">
          {([['all', 'Tout'], ['dep', 'Virements'], ['buy', 'Achats']] as const).map(([id, l]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>
          ))}
        </div>
      </SubNav>
      <main className="content with-fab" style={{ padding: '0 0 calc(var(--tabbar-height) + var(--safe-bottom) + 96px)', gap: 0 }}>
        {!ops.length && <Empty title={filter === 'dep' ? 'Aucun virement' : 'Aucun achat pour l’instant'} text="Utilisez le bouton + pour enregistrer une opération." />}
        {shown.map((g) => {
          const dep = data.deposits.filter((d) => d.date.slice(0, 7) === g.key).reduce((s, d) => s + d.amount, 0);
          return (
            <section key={g.key} className="stack">
              <h2 className="month-header" data-component="MonthHeader">
                <span>{monthLong(g.key)}</span>
                {dep > 0 && <span className="total">versé +{eur(dep)}</span>}
              </h2>
              <ul className="op-list">
                {g.ops.map((o) => {
                  const id = o.kind === 'dep' ? o.d.id : o.t.id;
                  return (
                    <OpItem key={id} op={o} name={o.kind === 'buy' ? etf(o.t.etfId)?.index ?? o.t.etfId : ''}
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
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'center', marginTop: 'var(--space-16)' }} onClick={() => setAll(true)}>Afficher les mois précédents</button>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function OpItem({ op, name, swiped, confirming, onSwipe, onEdit, onDelete }: { op: Op; name: string; swiped: boolean; confirming: boolean; onSwipe: (v: boolean) => void; onEdit: () => void; onDelete: () => void }) {
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
    title = 'Virement sur le PEA'; sub = dateFr(op.d.date); amount = '+' + eur(op.d.amount); amountColor = 'var(--success-text)';
    aria = `Virement du ${sub}, ${eur(op.d.amount)}. Afficher les actions`;
  } else {
    const t = op.t;
    title = `${name} · ${t.quantity} part${t.quantity > 1 ? 's' : ''} × ${eur(t.unitPrice, 2, 4)}`;
    sub = dateFr(t.date);
    fees = `Frais ${eur(t.fees)} · remb. ${eur(t.feeRefund)} · ${num(t.unitPrice * t.quantity > 0 ? (t.fees / (t.unitPrice * t.quantity)) * 100 : 0, 2)}${NBSP}%`;
    amount = eur(-t.grossAmount); amountColor = 'var(--text)';
    aria = `Achat ${name} du ${sub}, ${eur(t.grossAmount)}. Afficher les actions`;
  }
  return (
    <li className={'op-item' + (swiped ? ' swiped' : '')}>
      {swiped && (
        <span className="op-actions">
          <button type="button" className="edit" onClick={onEdit}><Icon name="pencil" size={20} />Modifier</button>
          <button type="button" className="del" onClick={onDelete}><Icon name={confirming ? 'check' : 'trash'} size={20} />{confirming ? 'Confirmer' : 'Supprimer'}</button>
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
    <Sheet title="Ajouter">
      <div className="grid-2" style={{ gap: 'var(--space-12)', paddingBottom: 'calc(var(--safe-bottom) + var(--space-16))' }}>
        <button type="button" className="tile" style={{ background: 'var(--bg-blue-minimal)' }} onClick={() => navigate('/historique/virement', { replace: true })} data-component="Tile">
          <span className="tile-icon" style={{ color: 'var(--text-blue)' }}><Icon name="deposit" /></span>
          <span className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="t-amount-m">Virement</span>
            <span className="t-caption c-neutral">Argent versé sur le PEA</span>
          </span>
        </button>
        <button type="button" className="tile" style={{ background: 'var(--bg-brand-minimal)' }} onClick={() => navigate('/historique/achat', { replace: true })} data-component="Tile">
          <span className="tile-icon" style={{ color: 'var(--brand-primary)' }}><Icon name="cart" /></span>
          <span className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="t-amount-m">Achat d'ETF</span>
            <span className="t-caption c-neutral">Parts achetées en bourse</span>
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
  const choices = data.etfs.filter((e) => data.myEtfIds.includes(e.id) || data.transactions.some((t) => t.etfId === e.id));
  const initialEtf = editing?.etfId || (preset && choices.some((e) => e.id === preset) ? preset : choices.find((e) => e.inStrategy)?.id || choices[0]?.id || '');
  const [etfId, setEtfId] = useState(initialEtf);
  const [etfOpen, setEtfOpen] = useState(false);
  const [date, setDate] = useState(editing?.date || todayIso());
  const [calOpen, setCalOpen] = useState(false);
  const [price, setPrice] = useState(editing ? toInput(editing.unitPrice, editing.unitPrice % 0.01 > 1e-9 ? 4 : 2) : toInput(etf(initialEtf)?.lastPrice ?? 0));
  const [qty, setQty] = useState(editing?.quantity ?? 1);
  const [gross, setGross] = useState(editing ? toInput(editing.grossAmount) : '');
  const [refund, setRefund] = useState(editing ? toInput(editing.feeRefund) : '0,00');
  const cur = etf(etfId);
  const p = parseNum(price), g = parseNum(gross), r = parseNum(refund) || 0;
  const exec = isFinite(p) ? Math.round(p * qty * 100) / 100 : 0;
  const fees = isFinite(g) ? Math.round((g - exec) * 100) / 100 : 0;
  const err = isFinite(g) && g > 0 && fees < 0;
  const valid = !!cur && isFinite(p) && p > 0 && qty > 0 && isFinite(g) && g > 0 && !err && r >= 0;

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid) return;
    const prev = getData();
    const tx: Transaction = { id: editing?.id || newId('b'), date, etfId, unitPrice: p, quantity: qty, grossAmount: g, fees: Math.max(fees, 0), feeRefund: r };
    update((d) => {
      if (editing) d.transactions = d.transactions.map((t) => (t.id === editing.id ? tx : t));
      else d.transactions.push(tx);
      if (!d.myEtfIds.includes(etfId)) d.myEtfIds.push(etfId);
    });
    back('/historique/journal');
    showToast(editing ? 'Achat modifié' : 'Achat enregistré', { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen screen-white" data-screen="T2-04">
      <SubHeader title={editing ? 'Modifier l’achat' : 'Nouvel achat'} fallback="/historique/journal" close bordered />
      <form onSubmit={save} className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-20) var(--screen-margin) var(--space-24)' }}>
          <div className="field">
            <span id="t204-etf" className="lbl">ETF</span>
            <button type="button" className="select-btn" aria-haspopup="listbox" aria-expanded={etfOpen} aria-labelledby="t204-etf" onClick={() => setEtfOpen(!etfOpen)} data-component="Select">
              <EtfDot id={etfId} />
              <span><strong style={{ fontWeight: 600 }}>{cur?.index ?? 'Choisir'}</strong> <span className="c-moderate">· {etfId}</span></span>
              <Icon name="down" size={20} style={{ color: 'var(--text-neutral)' }} />
            </button>
            {etfOpen && (
              <ul role="listbox" aria-labelledby="t204-etf" className="listbox">
                {choices.map((e) => (
                  <li key={e.id} role="none">
                    <button type="button" role="option" aria-selected={e.id === etfId} onClick={() => { setEtfId(e.id); setEtfOpen(false); if (!editing) setPrice(toInput(e.lastPrice)); }}>
                      <EtfDot id={e.id} />
                      <span>{e.index} <span className="c-moderate">· {e.id}</span></span>
                      {e.id === etfId && <Icon name="check" size={18} strokeWidth={2.4} style={{ color: 'var(--brand-primary)' }} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="field">
            <span id="t204-date" className="lbl">Date</span>
            <button type="button" className="select-btn" style={{ gridTemplateColumns: '1fr 20px' }} aria-labelledby="t204-date" aria-expanded={calOpen} onClick={() => setCalOpen(!calOpen)} data-component="DatePicker.field">
              <span>{dateFr(date)}</span>
              <Icon name="calendar" size={20} style={{ color: 'var(--brand-primary)' }} />
            </button>
            {calOpen && <DatePicker value={date} label="Date de l'achat" onChange={(d) => { setDate(d); setCalOpen(false); }} />}
          </div>
          <div className="grid-2" style={{ gap: 'var(--space-12)' }}>
            <label className="field">
              <span className="lbl">Cours unitaire (€)</span>
              <input className="input num" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-component="AmountField" />
            </label>
            <div className="field">
              <span id="t204-qty" className="lbl">Quantité</span>
              <div role="group" aria-labelledby="t204-qty" className="stepper" data-component="Stepper">
                <button type="button" aria-label="Retirer une part" onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" size={20} /></button>
                <input type="text" inputMode="numeric" aria-label="Quantité" value={qty} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); setQty(isFinite(v) && v > 0 ? v : 1); }} />
                <button type="button" aria-label="Ajouter une part" onClick={() => setQty(qty + 1)}><Icon name="plus" size={20} /></button>
              </div>
            </div>
          </div>
          <label className="field">
            <span className="lbl">Montant brut payé (€)</span>
            <input className={'input num' + (err ? ' invalid' : '')} type="text" inputMode="decimal" value={gross} placeholder={toInput(exec + data.settings.feePerOrder)}
              onChange={(e) => setGross(e.target.value)} aria-invalid={err} data-component="AmountField" />
            <span className="hint">Débit affiché par le courtier, frais inclus</span>
            {err && <span role="alert" className="err">Le montant brut doit être supérieur ou égal au cours d'exécution.</span>}
          </label>
          <label className="field">
            <span className="lbl">Remboursement de frais (€)</span>
            <input className="input num" type="text" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} data-component="AmountField" />
          </label>
          <section aria-label="Calculs" aria-live="polite" className="calc-box">
            <div className="between"><span className="c-neutral">Cours d'exécution <span className="t-caption">({price || '0'}{NBSP}€ × {qty})</span></span><strong className="t-amount-s">{eur(exec)}</strong></div>
            <div className="between"><span className="c-neutral">Frais <span className="t-caption">(brut − exécution)</span></span><strong className="t-amount-s">{eur(Math.max(fees, 0))}</strong></div>
            <div className="between"><span className="c-neutral">% de frais</span><strong className="t-amount-s">{exec > 0 && isFinite(g) ? pct(Math.max(fees, 0) / exec, 2) : '—'}</strong></div>
            <div className="between" style={{ paddingTop: 'var(--space-8)', borderTop: '1px solid var(--divider-minimal)' }}><span className="c-neutral">Frais nets après remboursement</span><strong className="t-amount-s">{eur(Math.max(fees - r, 0))}</strong></div>
          </section>
        </div>
        <div style={{ position: 'sticky', bottom: 0, padding: 'var(--space-12) var(--screen-margin) calc(var(--safe-bottom) + var(--space-12))', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sticky)' }}>
          <div className="form-narrow"><button type="submit" className="btn btn-primary block" disabled={!valid}>{editing ? 'Enregistrer les modifications' : "Enregistrer l'achat"}</button></div>
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
  const [amount, setAmount] = useState(editing ? toInput(editing.amount) : '');
  const iso = parseDateFr(date);
  const v = parseNum(amount);
  const valid = !!iso && isFinite(v) && v > 0;
  const base = summary.totalDeposited - (editing?.amount || 0);

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid) return;
    const prev = getData();
    const dep: Deposit = { id: editing?.id || newId('d'), date: iso, amount: v };
    update((d) => {
      if (editing) d.deposits = d.deposits.map((x) => (x.id === editing.id ? dep : x));
      else d.deposits.push(dep);
    });
    back('/historique/journal');
    showToast(editing ? 'Virement modifié' : 'Virement enregistré', { undo: () => replaceData(prev) });
  };

  return (
    <div className="screen screen-white" data-screen="T2-05">
      <SubHeader title={editing ? 'Modifier le virement' : 'Nouveau virement'} fallback="/historique/journal" close bordered />
      <form onSubmit={save} className="stack grow">
        <div className="stack form-narrow grow" style={{ gap: 'var(--space-20)', padding: 'var(--space-20) var(--screen-margin)' }}>
          <label className="field">
            <span className="lbl">Date</span>
            <span className="input-wrap">
              <input className={'input' + (date && !iso ? ' invalid' : '')} type="text" inputMode="numeric" placeholder="jj/mm/aaaa" value={date} onChange={(e) => setDate(e.target.value)} style={{ paddingRight: 48 }} data-component="DatePicker.field" />
              <span className="icon-right"><Icon name="calendar" size={20} /></span>
            </span>
            {date && !iso && <span className="err">Date invalide (jj/mm/aaaa).</span>}
          </label>
          <label className="field">
            <span className="lbl">Montant (€)</span>
            <input className="input num large" type="text" inputMode="decimal" value={amount} placeholder="0,00" onChange={(e) => setAmount(e.target.value)} data-component="AmountField" />
          </label>
          <div role="note" className="note">
            <Icon name="info" size={20} />
            <span>Le virement s'ajoute au montant total épargné et au solde espèces. Enregistrez ensuite vos achats pour l'investir.</span>
          </div>
          <dl className="dl calc-box" style={{ display: 'grid' }}>
            <dt>Total épargné après ce virement</dt>
            <dd className="t-amount-s">{eur(base + (isFinite(v) ? v : 0))}</dd>
          </dl>
        </div>
        <div style={{ padding: 'var(--space-12) var(--screen-margin) calc(var(--safe-bottom) + var(--space-12))', boxShadow: 'var(--shadow-sticky)' }}>
          <div className="form-narrow"><button type="submit" className="btn btn-primary block" disabled={!valid}>{editing ? 'Enregistrer les modifications' : 'Enregistrer le virement'}</button></div>
        </div>
      </form>
    </div>
  );
}
