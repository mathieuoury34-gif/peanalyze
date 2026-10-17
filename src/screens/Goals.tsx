// Simulateur › Objectifs : un capital à atteindre à une date, jauge de progression et versement mensuel nécessaire
import { useState } from 'react';
import { AppHeader, DatePicker, Empty, PriceErrorBanner, Sheet, SubNav } from '../ui/kit';
import { Donut } from '../ui/charts';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { goalProgress, type GoalProgress } from '../domain/goals';
import { dateFr, eur, pct } from '../domain/format';
import type { Goal } from '../domain/types';
import { newId, update } from '../data/store';
import { t, tn } from '../i18n';
import { MoneyField, SIM_NAV } from './PlanParts';

const addMonths = (iso: string, n: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 + n, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(+iso.slice(8, 10), last));
  return d.toISOString().slice(0, 10);
};

function remainingText(p: GoalProgress): string {
  if (p.reached) return t('Objectif atteint');
  if (p.months <= 0) return t('Échéance dépassée');
  const y = Math.floor(p.months / 12), m = p.months % 12;
  const parts = [] as string[];
  if (y) parts.push(tn(y, '{n} an', '{n} ans'));
  if (m) parts.push(tn(m, '{n} mois', '{n} mois'));
  return t('dans {d}', { d: parts.join(' ') });
}

export function GoalsScreen() {
  const { data, summary } = useCalc();
  const goals = (data.goals ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);

  return (
    <div className="screen" data-screen="T4-12">
      <AppHeader title={t('Simulateur')} />
      <PriceErrorBanner />
      <SubNav items={SIM_NAV()} label={t('Sections du simulateur')} />
      <main className="content dgrid">
        <details className="explain dspan-12" open={!goals.length || undefined}>
          <summary style={{ cursor: 'pointer', font: 'var(--type-caption-strong)', minHeight: 32, display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="info" size={18} />{t('À quoi servent les objectifs ?')}</summary>
          <span>{t('Un objectif est un capital à atteindre à une date : un apport, un projet, une étape. L’app compare ce capital à la valeur actuelle de votre PEA et calcule le versement mensuel qui vous y amènerait, avec le rendement annuel du simulateur ou sans aucun rendement.')}</span>
          <span>{t('C’est un calcul indicatif : la bourse peut faire mieux ou moins bien que le rendement supposé.')}</span>
        </details>

        {goals.length === 0 ? (
          <div className="dspan-12">
            <Empty icon="trend" title={t('Aucun objectif')} text={t('Fixez-vous un capital à atteindre et une date : la jauge suivra votre progression.')}
              action={<button type="button" className="btn btn-primary" onClick={() => setEdit('new')}><Icon name="plus" size={20} />{t('Créer un objectif')}</button>} />
          </div>
        ) : (
          <>
            {goals.map((g) => {
              const p = goalProgress(data, g, summary.totalValue);
              return (
                <section key={g.id} className="card g16 dspan-6" aria-label={g.name} data-testid="goal">
                  <div className="between" style={{ alignItems: 'flex-start', gap: 'var(--space-8)' }}>
                    <div className="stack-4" style={{ minWidth: 0 }}>
                      <h2 className="ellipsis">{g.name}</h2>
                      <span className="t-caption c-moderate">{eur(g.target, 0)} · {dateFr(g.date)} · {remainingText(p)}</span>
                    </div>
                    <button type="button" className="icon-btn neutral" aria-label={t('Modifier l’objectif {n}', { n: g.name })} onClick={() => setEdit(g)}><Icon name="pencil" size={20} /></button>
                  </div>
                  <div className="row" style={{ gap: 'var(--space-16)', alignItems: 'center' }}>
                    <Donut size={112} ring={16} label={t('Objectif atteint à {p}', { p: pct(p.ratio, 0) })} slices={[{ value: p.ratio, color: 'var(--chart-value)' }, { value: 1 - p.ratio, color: 'var(--chart-grid)' }]}>
                      <span className="t-amount-m">{pct(p.ratio, 0)}</span>
                    </Donut>
                    <div className="stack-4">
                      <span className="t-amount-m">{eur(p.current, 0)}</span>
                      <span className="t-caption c-moderate">{t('sur {a} visés', { a: eur(g.target, 0) })}</span>
                      {!p.reached && <span className="t-caption c-neutral">{t('Reste {a}', { a: eur(p.remaining, 0) })}</span>}
                    </div>
                  </div>
                  {!p.reached && p.requiredWithReturn !== null && (
                    <div className="stack-8" style={{ borderTop: '1px solid var(--divider-minimal)', paddingTop: 'var(--space-12)' }}>
                      <div className="between"><span className="c-neutral">{t('À épargner par mois, avec {r} de rendement', { r: pct(data.simulation.annualRate, 1) })}</span><strong className="t-amount-s" data-testid="req-return">{eur(p.requiredWithReturn, 0)}</strong></div>
                      <div className="between"><span className="c-neutral">{t('À épargner par mois, sans rendement')}</span><strong className="t-amount-s">{eur(p.requiredPlain ?? 0, 0)}</strong></div>
                      {p.plannedMonthly > 0 && (
                        <p className="t-caption" style={{ color: p.onTrack ? 'var(--success-text)' : 'var(--warning-text)' }}>
                          {p.onTrack
                            ? t('À votre rythme prévu ({m} par mois), vous atteindriez environ {v} : objectif tenu.', { m: eur(p.plannedMonthly, 0), v: eur(p.projected, 0) })
                            : t('À votre rythme prévu ({m} par mois), vous atteindriez environ {v} : il manquerait {d}.', { m: eur(p.plannedMonthly, 0), v: eur(p.projected, 0), d: eur(g.target - p.projected, 0) })}
                        </p>
                      )}
                    </div>
                  )}
                  {p.overdue && <p className="t-caption" style={{ color: 'var(--warning-text)' }}>{t('L’échéance est passée : il manque {a}. Vous pouvez la repousser en modifiant l’objectif.', { a: eur(p.remaining, 0) })}</p>}
                </section>
              );
            })}
            <div className="dspan-12"><button type="button" className="btn btn-secondary" onClick={() => setEdit('new')}><Icon name="plus" size={20} />{t('Ajouter un objectif')}</button></div>
          </>
        )}
        <p className="t-legal c-moderate dspan-12">{t('Les objectifs sont enregistrés dans le classeur Excel (onglet « Objectifs ») : changer de classeur change d’objectifs. Rendement : celui du simulateur ; vous pouvez aussi voir ce que donnerait chaque phase de versement dans l’onglet Épargne.')}</p>
      </main>
      {edit && <GoalSheet goal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { data } = useCalc();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal?.target ?? 0);
  const [date, setDate] = useState(goal?.date ?? addMonths(new Date().toISOString().slice(0, 10), 60));
  const valid = name.trim().length > 0 && target > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const save = () => {
    const g: Goal = { id: goal?.id ?? newId('goal'), name: name.trim(), target: Math.round(target * 100) / 100, date, createdAt: goal?.createdAt ?? new Date().toISOString() };
    update((d) => { d.goals = goal ? (d.goals ?? []).map((x) => (x.id === goal.id ? g : x)) : [...(d.goals ?? []), g]; });
    onClose();
  };
  const remove = () => { update((d) => { d.goals = (d.goals ?? []).filter((x) => x.id !== goal!.id); }); onClose(); };
  void data;
  return (
    <Sheet title={goal ? t('Modifier l’objectif') : t('Nouvel objectif')} onClose={onClose} full
      footer={<button type="button" className="btn btn-primary block" disabled={!valid} onClick={save}><Icon name="check" size={20} />{t('Enregistrer')}</button>}>
      <div className="stack" style={{ paddingBottom: 'var(--space-16)', gap: 'var(--space-16)' }}>
        <label className="field">
          <span className="lbl">{t('Nom de l’objectif')}</span>
          <input className="input" type="text" value={name} placeholder={t('Apport pour la maison')} onChange={(e) => setName(e.target.value)} />
        </label>
        <MoneyField label={t('Capital à atteindre')} value={target} onChange={setTarget} />
        <DatePicker value={date} onChange={setDate} label={t('Échéance')} />
        {goal && <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)' }} onClick={remove}><Icon name="trash" size={20} />{t('Supprimer cet objectif')}</button>}
      </div>
    </Sheet>
  );
}
