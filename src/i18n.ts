// Langue de l'interface : français (texte source) ou anglais (dictionnaire EN, clé = texte français).
// Préférence propre à l'appareil ; changer de langue recharge l'application.
import { EN } from './i18n-en';

export type Lang = 'fr' | 'en';
const KEY = 'peanalyze:lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'fr' || saved === 'en') return saved;
    return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language) ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export const lang: Lang = typeof window === 'undefined' ? 'fr' : detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function setLang(l: Lang): void {
  try { localStorage.setItem(KEY, l); } catch { /* stockage indisponible */ }
  location.reload();
}

/** Traduit un texte de l'interface ; {nom} est remplacé par vars.nom. */
export function t(fr: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? EN[fr] ?? fr : fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Pluriel simple : t(un, plusieurs) selon n. */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  return t(Math.abs(n) >= 2 ? many : one, { n, ...vars });
}

/** Libellés de données (secteurs, pays, catégories du catalogue, remarques). */
export function tl(label: string): string {
  if (lang !== 'en' || !label) return label;
  if (label.includes(' · ')) return label.split(' · ').map(tl).join(' · ');
  const direct = EN_LABELS[label] ?? EN[label];
  if (direct) return direct;
  // noms d'indices du catalogue : « STOXX Europe 600 Santé », « S&P 500 (couvert EUR) »…
  let out = label;
  const m = /^STOXX Europe 600 (.+)$/.exec(out);
  if (m && EN_LABELS[m[1]]) out = 'STOXX Europe 600 ' + EN_LABELS[m[1]];
  for (const [fr, en] of INDEX_WORDS) out = out.replace(fr, en);
  return out;
}

const INDEX_WORDS: [RegExp, string][] = [
  [/\(couvert (\w+)\)/, '($1 hedged)'], [/\(part (\w+)\)/, '($1 share class)'], [/Levier x(\d)/, 'Leveraged x$1'],
  [/\(gestion active\)/, '(active)'], [/Monétaire euro/, 'Euro money market'], [/\(matières premières\)/, '(commodities)'],
  [/\(actions \+ futures\)/, '(equities + futures)'], [/\(Autriche\)/, '(Austria)'], [/\(Pays-Bas\)/, '(Netherlands)'],
  [/^Luxe Monde$/, 'Global luxury'], [/^Zone euro/, 'Eurozone'], [/^Europe Dividend$/, 'Europe Dividend'],
];

const EN_LABELS: Record<string, string> = {
  // secteurs
  'Technologies de l’information': 'Information technology', 'Finance': 'Financials', 'Services de communication': 'Communication services',
  'Consommation discrétionnaire': 'Consumer discretionary', 'Santé': 'Health care', 'Industrie': 'Industrials', 'Consommation de base': 'Consumer staples',
  'Énergie': 'Energy', 'Télécommunications': 'Telecommunications', 'Services aux collectivités': 'Utilities', 'Matériaux': 'Materials', 'Immobilier': 'Real estate', 'Autres': 'Other',
  'Consommation cyclique': 'Consumer cyclicals', 'Consommation non cyclique': 'Consumer non-cyclicals', 'Technologie': 'Technology',
  'Services aux entreprises': 'Business services', 'Matériaux hors énergie': 'Basic materials',
  // pays
  'États-Unis': 'United States', 'France': 'France', 'Royaume-Uni': 'United Kingdom', 'Allemagne': 'Germany', 'Suisse': 'Switzerland',
  'Pays-Bas': 'Netherlands', 'Japon': 'Japan', 'Chine': 'China', 'Taïwan': 'Taiwan', 'Inde': 'India', 'Corée du Sud': 'South Korea', 'Canada': 'Canada',
  'Irlande': 'Ireland', 'Italie': 'Italy', 'Espagne': 'Spain', 'Suède': 'Sweden', 'Danemark': 'Denmark', 'Finlande': 'Finland', 'Norvège': 'Norway',
  'Belgique': 'Belgium', 'Australie': 'Australia', 'Brésil': 'Brazil', 'Afrique du Sud': 'South Africa', 'Arabie Saoudite': 'Saudi Arabia',
  'Malaisie': 'Malaysia', 'Mexique': 'Mexico', 'Émirats arabes unis': 'United Arab Emirates', 'Thaïlande': 'Thailand', 'Pologne': 'Poland',
  'Portugal': 'Portugal', 'Îles Caïmans': 'Cayman Islands', 'Hong Kong': 'Hong Kong', 'Singapour': 'Singapore', 'Indonésie': 'Indonesia', 'Chili': 'Chile',
  'Turquie': 'Turkey', 'Qatar': 'Qatar', 'Israël': 'Israel', 'Pérou': 'Peru', 'Colombie': 'Colombia', 'Hongrie': 'Hungary', 'Koweït': 'Kuwait',
  'Philippines': 'Philippines', 'République tchèque': 'Czech Republic', 'Autriche': 'Austria', 'Nouvelle-Zélande': 'New Zealand', 'Grèce': 'Greece',
  'Égypte': 'Egypt', 'Luxembourg': 'Luxembourg', 'Bermudes': 'Bermuda', 'Jersey': 'Jersey', 'République Tchèque': 'Czech Republic', 'New Zealand': 'New Zealand',
  // catégories des ETF d'origine
  'Actions Large Caps USA': 'US large-cap equities', 'Actions Sectorielles USA': 'US sector equities',
  'Actions Large & Mid Caps Pays Émergents': 'Emerging markets large & mid-cap equities', 'Actions Européennes': 'European equities',
  'Actions Françaises': 'French equities', 'Actions Internationales Large-Mid Caps Pays Développés': 'Developed markets large & mid-cap equities',
  // catégories du catalogue
  'Monde': 'World', 'Europe': 'Europe', 'Zone euro': 'Eurozone', 'Autres pays européens': 'Other European countries',
  'Émergents, Asie et Japon': 'Emerging markets, Asia & Japan', 'Secteurs et thèmes': 'Sectors & themes', 'Levier et inverse': 'Leveraged & inverse',
  'Monétaire et diversifiés': 'Money market & diversified',
  // remarques du catalogue
  'Éligibilité au PEA à confirmer auprès de votre courtier': 'PEA eligibility to be confirmed with your broker',
  'Non coté sur Euronext Paris (autre place européenne)': 'Not listed on Euronext Paris (other European exchange)',
  'Données partielles (frais seulement) ; mnémonique de cotation non relevé': 'Partial data (fees only); trading symbol not recorded',
  // caractéristiques
  'Synthétique': 'Synthetic', 'Physique': 'Physical', 'Echantillonné': 'Sampled', 'Capitalisant': 'Accumulating', 'Distribuant': 'Distributing',
  'Autre place européenne': 'Other European exchange', 'Non renseignée': 'Not specified',
};
