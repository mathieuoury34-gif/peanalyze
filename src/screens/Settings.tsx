// T0-01 Paramètres + T0-03 Connexion
import { useRef, useState } from 'react';
import { SubHeader, showToast } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { navigate } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { dateFr, dateTimeFr, eur, num, parseDateFr, parseNum, toInput, NBSP } from '../domain/format';
import { getData, replaceData, setPrefs, update } from '../data/store';
import { refreshPrices, testSource } from '../data/prices';
import { signIn, signOut, syncNow, useSync } from '../data/sync';
import { buildSeed } from '../data/seed';
import type { AppData, PriceRefresh } from '../domain/types';
import { MAX_ETFS } from '../data/prices';
import { lang, setLang, t } from '../i18n';

const PEA_CEILING = 150000;

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Row({ icon, title, sub, onClick, right }: { icon: string; title: string; sub: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} style={{ width: '100%', display: 'grid', gridTemplateColumns: '24px 1fr 20px', gap: 'var(--space-12)', alignItems: 'center', minHeight: 64, padding: 0, border: 0, background: 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer' }}>
        <Icon name={icon} style={{ color: 'var(--brand-primary)' }} />
        <span className="stack"><span className="t-strong">{title}</span><span className="t-caption c-moderate">{sub}</span></span>
        {right ?? <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />}
      </button>
    </li>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="stack-8">
      <h2 id={id} className="overline c-neutral" style={{ padding: '0 var(--space-4)' }}>{title}</h2>
      {children}
    </section>
  );
}

export function SettingsScreen() {
  const { data, summary } = useCalc();
  const s = data.settings;
  const sync = useSync();
  const [csv, setCsv] = useState(s.csvUrl);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openDate, setOpenDate] = useState(s.peaOpeningDate ? dateFr(s.peaOpeningDate) : '');
  const [fee, setFee] = useState(toInput(s.feePerOrder));
  const [busy, setBusy] = useState('');
  const [reset, setReset] = useState(false);
  const xlsxInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const firstDeposit = data.deposits.reduce((m, d) => (!m || d.date < m ? d.date : m), '');
  const opening = s.peaOpeningDate || '';
  const fiveYears = opening ? String(+opening.slice(0, 4) + 5) + opening.slice(4) : '';
  const followed = new Set([...data.myEtfIds, ...data.transactions.map((x) => x.etfId)]).size;
  const setFreq = (f: 1 | 2) => {
    if (f === 2 && followed > MAX_ETFS[2]) {
      showToast(t('Vous suivez {n} ETF : retirez-en {k} de « Mes ETF » pour passer à 2 actualisations par jour.', { n: followed, k: followed - MAX_ETFS[2] }), { error: true });
      return;
    }
    update((d) => { d.settings.priceFreq = f; });
  };

  const saveSource = async (provider: 'server' | 'csv') => {
    const value = provider === 'csv' ? csv.trim() : '';
    update((d) => { d.settings.priceProvider = provider; if (provider === 'csv') d.settings.csvUrl = value; });
    if (provider === 'csv' && !value) return;
    setTesting(true); setTestMsg(null);
    try {
      const msg = await testSource(provider, value);
      setTestMsg({ ok: true, text: msg });
      refreshPrices({ force: true });
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message === 'Failed to fetch' ? t('Source injoignable (connexion ou adresse)') : (e as Error).message });
    } finally { setTesting(false); }
  };

  const doExportXlsx = async () => {
    setBusy('xlsx');
    try {
      const [{ exportPeanalyzeXlsx }, { CATALOG_DATE }] = await Promise.all([import('../data/excel-peanalyze'), import('../data/seed')]);
      const blob = await exportPeanalyzeXlsx(getData(), CATALOG_DATE);
      download('PEAnalyze ' + new Date().toISOString().slice(0, 10) + '.xlsx', blob);
      showToast(t('Fichier Excel exporté'));
    } catch (e) {
      showToast(t('Export impossible : {e}', { e: (e as Error).message }), { error: true });
    } finally { setBusy(''); }
  };

  const onImportXlsx = async (f: File) => {
    setBusy('import');
    try {
      const prev = getData();
      const { importXlsx } = await import('../data/excel');
      const next = await importXlsx(f, prev);
      replaceData({ ...next, updatedAt: new Date().toISOString() });
      showToast(t('Import : {d} virements, {a} achats', { d: next.deposits.length, a: next.transactions.length }), { undo: () => replaceData(prev) });
    } catch (e) {
      showToast(t('Import impossible : {e}', { e: (e as Error).message }), { error: true });
    } finally { setBusy(''); }
  };

  const onImportJson = async (f: File) => {
    try {
      const prev = getData();
      const d = JSON.parse(await f.text()) as AppData;
      if (!d || !Array.isArray(d.etfs) || !Array.isArray(d.transactions)) throw new Error(t('fichier non reconnu'));
      replaceData({ ...d, updatedAt: new Date().toISOString() });
      showToast(t('Sauvegarde restaurée'), { undo: () => replaceData(prev) });
    } catch (e) {
      showToast(t('Restauration impossible : {e}', { e: (e as Error).message }), { error: true });
    }
  };

  return (
    <div className="screen" data-screen="T0-01">
      <SubHeader title={t('Paramètres')} fallback="/portefeuille" />
      <main className="content form-narrow" style={{ gap: 'var(--space-24)' }}>
        <Section id="t001-sync" title={t('Compte & synchronisation')}>
          <div className="card" style={{ borderRadius: 'var(--radius-12)' }}>
            {!sync.configured ? (
              <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-12)' }}>
                <Icon name="cloud" style={{ color: 'var(--text-moderate)' }} />
                <span className="stack">
                  <span className="t-strong">{t('Synchronisation pas encore activée')}</span>
                  <span className="t-caption c-moderate">{t('Les données sont enregistrées sur cet appareil. La connexion Google sera disponible dès que le projet Firebase gratuit sera relié à l’app.')}</span>
                </span>
              </div>
            ) : sync.user ? (
              <>
                <div className="row" style={{ gap: 'var(--space-12)' }}>
                  {sync.user.photo
                    ? <img src={sync.user.photo} alt="" width={40} height={40} style={{ borderRadius: 'var(--radius-full)' }} referrerPolicy="no-referrer" />
                    : <span className="op-icon" style={{ background: 'var(--bg-brand-minimal)', color: 'var(--brand-primary)' }}>{(sync.user.name || sync.user.email).charAt(0).toUpperCase()}</span>}
                  <span className="stack grow">
                    <span className="t-strong ellipsis">{sync.user.name || t('Compte Google')}</span>
                    <span className="t-caption c-moderate ellipsis">{sync.user.email}</span>
                  </span>
                </div>
                <div className="row t-caption" style={{ color: sync.state === 'error' ? 'var(--critical-text)' : 'var(--success-text)' }}>
                  <Icon name={sync.state === 'error' ? 'alert' : 'success'} size={18} />
                  {sync.state === 'error' ? sync.error : sync.state === 'syncing' ? t('Synchronisation…') : (sync.lastSync ? t('Synchronisé le {d}', { d: dateTimeFr(sync.lastSync) }) : t('Synchronisé')) + ' · ' + t('téléphone et PC partagent les mêmes données')}
                </div>
                <div className="row wrap">
                  <button type="button" className="btn btn-secondary" onClick={() => syncNow()}><Icon name="refresh" size={18} />{t('Synchroniser maintenant')}</button>
                  <button type="button" className="btn btn-tertiary" style={{ color: 'var(--text-neutral)' }} onClick={() => signOut()}><Icon name="logout" size={18} />{t('Se déconnecter')}</button>
                </div>
              </>
            ) : (
              <>
                <span className="t-caption c-moderate">{t('Connectez-vous pour retrouver les mêmes données sur votre téléphone et votre PC (sauvegarde automatique, gratuite).')}</span>
                <button type="button" className="btn btn-primary" onClick={() => signIn().catch((e) => showToast(t('Connexion impossible : {e}', { e: e.message }), { error: true }))}>{t('Continuer avec Google')}</button>
              </>
            )}
          </div>
        </Section>

        <Section id="t001-lang" title={t('Langue')}>
          <div className="card g8" style={{ borderRadius: 'var(--radius-12)' }}>
            <div className="seg" role="group" aria-label={t('Langue de l’application')}>
              <button type="button" aria-pressed={lang === 'fr'} onClick={() => lang !== 'fr' && setLang('fr')}>Français</button>
              <button type="button" aria-pressed={lang === 'en'} onClick={() => lang !== 'en' && setLang('en')}>English</button>
            </div>
            <span className="t-caption c-moderate">{t('Langue de cet appareil. Le classeur Excel exporté reste en français.')}</span>
          </div>
        </Section>

        <Section id="t001-cours" title={t('Cours')}>
          <div className="card g16" style={{ borderRadius: 'var(--radius-12)' }}>
            <label className="field">
              <span className="lbl">{t('Actualisation des cours dans l’app')}</span>
              <select className="input" value={s.priceRefresh} onChange={(e) => update((d) => { d.settings.priceRefresh = e.target.value as PriceRefresh; })} data-component="Select">
                <option value="open">{t("À l'ouverture de l'app")}</option>
                <option value="hour">{t('Toutes les heures (marché ouvert)')}</option>
                <option value="manual">{t('Manuelle uniquement')}</option>
              </select>
            </label>
            <div className="field">
              <span className="lbl">{t('Source des cours')}</span>
              <div className="seg" role="group" aria-label={t('Source des cours')}>
                <button type="button" aria-pressed={s.priceProvider === 'server'} onClick={() => update((d) => { d.settings.priceProvider = 'server'; })}>{t('Automatique')}</button>
                <button type="button" aria-pressed={s.priceProvider === 'csv'} onClick={() => update((d) => { d.settings.priceProvider = 'csv'; })}>Google Sheets</button>
              </div>
            </div>
            {s.priceProvider === 'server' ? (
              <>
                <label className="field">
                  <span className="lbl">{t('Actualisations par jour ouvré (robot des cours)')}</span>
                  <select className="input" value={s.priceFreq === 1 ? 1 : 2} onChange={(e) => setFreq(Number(e.target.value) === 1 ? 1 : 2)} data-component="Select">
                    <option value={2}>{t('2 fois par jour (13 h + clôture) · {m} ETF max', { m: MAX_ETFS[2] })}</option>
                    <option value={1}>{t('1 fois par jour (clôture) · {m} ETF max', { m: MAX_ETFS[1] })}</option>
                  </select>
                  <span className="hint">{t('{n} / {m} ETF suivis (« Mes ETF » et ETF détenus).', { n: followed, m: MAX_ETFS[s.priceFreq === 1 ? 1 : 2] })}</span>
                </label>
                <p className="t-caption c-neutral">{t('Le robot des cours (gratuit, API EODHD) suit les ETF de « Mes ETF » de chaque compte connecté : il récupère 5 ans d’historique dans l’heure qui suit l’ajout d’un ETF, puis le cours chaque jour ouvré. Un ETF retiré n’est plus suivi. Son quota de 18 appels par jour est partagé entre les comptes ; les plus anciens sont servis en premier.')}</p>
                {sync.configured && !sync.user && <p className="t-caption-strong" style={{ color: 'var(--warning-text)' }}>{t('Connectez-vous avec Google pour que le robot connaisse vos ETF.')}</p>}
              </>
            ) : (
              <label className="field">
                <span className="lbl">{t('Lien CSV de la feuille Google publiée')}</span>
                <input className="input" type="url" value={csv} placeholder="https://docs.google.com/spreadsheets/…/pub?output=csv" onChange={(e) => setCsv(e.target.value)} />
                <span className="hint">{t('Une feuille avec, par ligne : ticker (ex. ESE) et cours (=GOOGLEFINANCE("EPA:ESE")). Fichier › Partager › Publier sur le Web › CSV.')}</span>
              </label>
            )}
            <button type="button" className="btn btn-secondary" disabled={testing} onClick={() => saveSource(s.priceProvider)}>
              {testing ? t('Test en cours…') : s.priceProvider === 'server' ? t('Actualiser et vérifier') : t('Enregistrer et tester')}
            </button>
            {testMsg && <span role="status" className="t-caption-strong" style={{ color: testMsg.ok ? 'var(--success-text)' : 'var(--critical-text)' }}>{testMsg.text}</span>}
          </div>
        </Section>

        <Section id="t001-data" title={t('Données')}>
          <ul className="tile-list divided" style={{ padding: '0 var(--space-16)' }}>
            <Row icon="upload" title={t('Importer un fichier Excel')} sub={busy === 'import' ? t('Lecture en cours…') : t('Classeur PEAnalyze ou fichier d’origine (Suivi des investissements)')} onClick={() => xlsxInput.current?.click()} />
            <Row icon="sheet" title={t('Exporter en Excel (.xlsx)')} sub={busy === 'xlsx' ? t('Préparation du fichier…') : t('Classeur PEAnalyze : 9 onglets, formules et graphiques')} onClick={doExportXlsx} />
            <Row icon="download" title={t('Exporter en JSON')} sub={t('Sauvegarde complète des données')} onClick={() => download('peanalyze-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json', new Blob([JSON.stringify(getData(), null, 1)], { type: 'application/json' }))} />
            <Row icon="upload" title={t('Restaurer une sauvegarde JSON')} sub={t('Remplace les données de l’app')} onClick={() => jsonInput.current?.click()} />
          </ul>
          <input ref={xlsxInput} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportXlsx(f); e.target.value = ''; }} />
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportJson(f); e.target.value = ''; }} />
        </Section>

        <Section id="t001-etf" title={t('Mes ETF')}>
          <a href="#/parametres/etf" onClick={(e) => { e.preventDefault(); navigate('/parametres/etf'); }} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto 20px', gap: 'var(--space-12)', alignItems: 'center', minHeight: 64, padding: '0 var(--space-16)', borderRadius: 'var(--radius-12)', color: 'var(--text)', textDecoration: 'none' }}>
            <span className="stack"><span className="t-strong">{t('Gérer la liste « Mes ETF »')}</span><span className="t-caption c-moderate">{t('Ordre, ajout et retrait des ETF suivis')}</span></span>
            <span className="badge" style={{ background: 'var(--bg-grey-minimal)', font: 'var(--type-chip)' }}>{data.myEtfIds.length} ETF</span>
            <Icon name="next" size={20} style={{ color: 'var(--text-moderate)' }} />
          </a>
        </Section>

        <Section id="t001-pea" title={t('PEA')}>
          <div className="card g16" style={{ borderRadius: 'var(--radius-12)' }}>
            <label className="field">
              <span className="lbl">{t("Date d'ouverture du PEA")}</span>
              <input className={'input' + (openDate && !parseDateFr(openDate) ? ' invalid' : '')} type="text" inputMode="numeric" placeholder={t('jj/mm/aaaa')} value={openDate}
                onChange={(e) => { setOpenDate(e.target.value); const iso = parseDateFr(e.target.value); if (iso || !e.target.value) update((d) => { d.settings.peaOpeningDate = iso; }); }} data-component="DatePicker.field" />
              <span className="hint">{firstDeposit ? t('Premier versement enregistré le {d}.', { d: dateFr(firstDeposit) }) : ''}{fiveYears ? ' ' + t('Fiscalité allégée à partir du {d} (5 ans).', { d: dateFr(fiveYears) }) : ''}</span>
            </label>
            <div className="stack" style={{ gap: 'var(--space-6)' }}>
              <span className="between"><span className="t-label">{t('Plafond des versements')}</span><span className="t-caption c-neutral">{eur(summary.totalDeposited, 0)} / {eur(PEA_CEILING, 0)}</span></span>
              <span className="hbar"><span style={{ width: Math.min(100, (summary.totalDeposited / PEA_CEILING) * 100) + '%' }} /></span>
            </div>
            <label className="field">
              <span className="lbl">{t('Frais estimés par ordre (€)')}</span>
              <input className="input num" type="text" inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); const v = parseNum(e.target.value); if (isFinite(v) && v >= 0) update((d) => { d.settings.feePerOrder = v; }); }} />
              <span className="hint">{t('Utilisé par l’assistant du mois et pour pré-remplir les achats.')}</span>
            </label>
          </div>
        </Section>

        <Section id="t001-about" title={t('À propos')}>
          <div className="card g8" style={{ borderRadius: 'var(--radius-12)' }}>
            <span data-component="AppLogo"><Logo size={18} /></span>
            <span className="t-caption c-neutral">{t('Application personnelle de suivi de PEA en ETF. Les données restent les vôtres ; les cours viennent de la source que vous configurez. Version {v}.', { v: '1.1' })}</span>
            {!reset
              ? <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start', color: 'var(--critical-text)', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setReset(true)}>{t('Effacer toutes mes données')}</button>
              : (
                <div className="row wrap">
                  <span className="t-caption-strong c-critical grow">{t('Tous les virements et achats seront effacés. Confirmer ?')}</span>
                  <button type="button" className="btn btn-danger" onClick={() => { const prev = getData(); replaceData({ ...buildSeed(), updatedAt: new Date().toISOString() }); setReset(false); showToast(t('Données réinitialisées'), { undo: () => replaceData(prev) }); }}>{t('Réinitialiser')}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setReset(false)}>{t('Annuler')}</button>
                </div>
              )}
          </div>
        </Section>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ T0-03 Connexion
export function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="login" data-screen="T0-03">
      <span className="art"><Icon name="trend" size={64} strokeWidth={2.2} /></span>
      <div className="stack-8">
        <h1 className="t-h1"><Logo size={28} /></h1>
        <p className="t-body c-neutral">{t('Ton PEA, clair et à jour')}</p>
      </div>
      <div className="stack-12" style={{ width: '100%', maxWidth: 360 }}>
        <button type="button" className="btn btn-secondary block" disabled={busy} style={{ height: 48 }}
          onClick={async () => { setBusy(true); try { await signIn(); } catch (e) { showToast(t('Connexion impossible : {e}', { e: (e as Error).message }), { error: true }); } finally { setBusy(false); } }}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          {busy ? t('Connexion…') : t('Continuer avec Google')}
        </button>
        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center' }} onClick={() => { setPrefs({ skipLogin: true }); onSkip(); }}>
          {t('Utiliser sans compte (données sur cet appareil uniquement)')}
        </button>
      </div>
      <p className="t-legal c-moderate" style={{ maxWidth: 320 }}>{t('Vos données sont synchronisées dans votre espace privé, gratuitement. Rien n’est partagé.')}</p>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <div className="screen" aria-busy="true" aria-label={t('Chargement du portefeuille')} data-component="Skeleton">
      <div className="stack-16" style={{ padding: 'calc(var(--safe-top) + var(--space-16)) var(--screen-margin)' }}>
        <div className="skel" style={{ height: 44, borderRadius: 'var(--radius-full)' }} />
        <div className="skel" style={{ height: 150, borderRadius: 'var(--radius-16)' }} />
        <div className="row" style={{ gap: 'var(--space-16)' }}>
          <div className="skel" style={{ width: 140, height: 140, borderRadius: 'var(--radius-full)' }} />
          <div className="stack grow" style={{ gap: 'var(--space-10)' }}>
            {[90, 70, 80, 60].map((w) => <div key={w} className="skel" style={{ height: 12, width: w + '%', borderRadius: 'var(--radius-full)' }} />)}
          </div>
        </div>
        <div className="skel" style={{ height: 96, borderRadius: 'var(--radius-16)' }} />
      </div>
    </div>
  );
}

