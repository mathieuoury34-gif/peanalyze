// Bandeau d'accueil du rappel mensuel « investir »
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { navigate } from './router';
import { useData } from '../data/store';
import { dismissReminder, reminderDismissed } from '../data/reminder';
import { reminderState } from '../domain/reminder';
import { eur, todayIso } from '../domain/format';
import { t } from '../i18n';

export function ReminderBanner({ className = '' }: { className?: string }) {
  const data = useData();
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    window.addEventListener('peanalyze-reminder', f);
    return () => window.removeEventListener('peanalyze-reminder', f);
  }, []);
  const s = reminderState(data, todayIso());
  if (!s || !s.due || reminderDismissed()) return null;
  const monthly = data.simulation.dcaPhases.length ? data.simulation.dcaPhases.slice().sort((a, b) => a.fromYear - b.fromYear)[0].monthly : 0;
  return (
    <section className={'card g8 ' + className} aria-label={t('Rappel mensuel')} data-testid="reminder" style={{ background: 'var(--bg-brand-minimal)' }}>
      <div className="row" style={{ gap: 'var(--space-12)', alignItems: 'flex-start' }}>
        <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--radius-full)', background: 'var(--brand-primary)', color: 'var(--text-reverse)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={20} /></span>
        <div className="stack-4">
          <h2>{t('C’est le moment d’investir')}</h2>
          <span className="c-neutral">{monthly > 0 ? t('Votre investissement du mois ({m}) n’est pas encore enregistré.', { m: eur(monthly, 0) }) : t('Votre investissement du mois n’est pas encore enregistré.')}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 'var(--space-8)', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/portefeuille/assistant')}><Icon name="sparkle" size={20} />{t('Voir quoi acheter')}</button>
        <button type="button" className="btn btn-tertiary" onClick={dismissReminder}>{t('Plus tard')}</button>
      </div>
    </section>
  );
}
