// Premier lancement : l'app publiée ne contient aucune donnée personnelle.
// On propose d'importer « Suivi des investissements.xlsx » (une seule fois : la synchronisation fait le reste).
import { useRef, useState } from 'react';
import { getData, replaceData } from '../data/store';
import { useSync, signIn } from '../data/sync';
import { navigate } from './router';
import { showToast } from './kit';
import { Icon } from './icons';
import { t } from '../i18n';

export function WelcomeCard({ className = '' }: { className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const sync = useSync();

  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const prev = getData();
      const { importXlsx } = await import('../data/excel');
      const next = await importXlsx(f, prev);
      replaceData({ ...next, updatedAt: new Date().toISOString() });
      showToast(t('Import : {d} virements, {a} achats', { d: next.deposits.length, a: next.transactions.length }), { undo: () => replaceData(prev) });
    } catch (e) {
      showToast(t('Import impossible : {e}', { e: (e as Error).message }), { error: true });
    } finally { setBusy(false); }
  };

  return (
    <section className={'card g16 ' + className} aria-labelledby="welcome-title" data-component="WelcomeCard">
      <h2 id="welcome-title" style={{ margin: 0 }}>{t('Bienvenue sur PEAnalyze')}</h2>
      <p className="c-neutral" style={{ margin: 0 }}>
        {t('PEAnalyze suit votre PEA investi en ETF : vous y notez les virements et les achats faits chez votre courtier, et l’app calcule la valeur, les plus-values, les frais et combien acheter chaque mois. Elle ne déplace jamais d’argent.')}
      </p>
      <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/parametres/aide')}>
        <Icon name="help" size={18} />{t('Découvrir comment ça marche')}
      </button>
      <p className="c-neutral" style={{ margin: 0 }}>
        {t('Votre portefeuille est vide sur cet appareil.')}{' '}
        {sync.configured && !sync.user
          ? t('Connectez-vous avec Google pour retrouver vos données, ou importez votre fichier Excel.')
          : t('Importez votre classeur PEAnalyze ou votre fichier « Suivi des investissements.xlsx » pour retrouver tout votre historique.')}
      </p>
      {sync.configured && !sync.user && (
        <button type="button" className="btn btn-primary block" onClick={() => signIn().catch((e) => showToast(t('Connexion impossible : {e}', { e: (e as Error).message }), { error: true }))}>
          {t('Se connecter avec Google')}
        </button>
      )}
      <button type="button" className={'btn block ' + (sync.configured && !sync.user ? 'btn-secondary' : 'btn-primary')} disabled={busy} onClick={() => input.current?.click()}>
        <Icon name="upload" size={20} /> {busy ? t('Lecture en cours…') : t('Importer mon fichier Excel')}
      </button>
      <button type="button" className="btn btn-tertiary" onClick={() => navigate('/historique/virement')}>{t('Ou commencer en saisissant un virement')}</button>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </section>
  );
}
