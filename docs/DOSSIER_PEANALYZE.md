# PEAnalyze — Dossier de reconstruction (version 1.4, 17/10/2026)

Ce document suffit à comprendre, maintenir ou **refaire entièrement** l'application. Il ne contient aucun secret ni donnée personnelle (clé API, mots de passe, montants, opérations : jamais dans ce dossier).

## 1. En une page
- **But** : suivre un PEA investi en ETF (portefeuille, historique des opérations, marchés, simulateur), avec tous les graphes utiles à la stratégie. Ce n'est **pas** un simulateur de trading : l'app ne déplace aucun argent, elle enregistre ce qui a été fait chez le courtier.
- **Forme** : application web installable (PWA) en français / anglais, thèmes clair / sombre / système. Android (Chrome › Installer), iPhone (Safari › Sur l'écran d'accueil), PC.
- **Règle d'or : 0 €.** Aucun service payant, aucune carte bancaire enregistrée nulle part, pas de Play Store / App Store.
- **En ligne** : https://mathieuoury34-gif.github.io/peanalyze/ — code : dépôt public GitHub `mathieuoury34-gif/peanalyze`.
- **Dossier PC** : `C:\Users\mathi\Desktop\Documents\Perso\PEAnalyze` → `00_Notes` (notes), `01_Design` (maquettes, brief, tokens), `02_Donnees` (Excel et données), `03_App` (code = copie du dépôt).
- **Pile technique** : React 19 + TypeScript, esbuild (aucun framework de build lourd), JSZip pour l'Excel, Firebase (Auth Google + Firestore, offre Spark), GitHub Pages + GitHub Actions, API de cours EODHD (offre gratuite).
- **Tests** : `npm test` (26 tests : calculs vérifiés sur le fichier d'origine, aller-retour Excel, moteur de plans).

## 2. Services gratuits utilisés (et ce qu'il faut refaire si tout est perdu)
| Service | Rôle | À (re)configurer |
|---|---|---|
| GitHub (dépôt public `peanalyze`) | Code, hébergement GitHub Pages, robot GitHub Actions | Settings › Pages › Source : GitHub Actions ; secret de dépôt `EODHD_API_KEY` (clé EODHD, **jamais dans le code**) |
| Firebase projet `peanalyze` (Spark, Firestore `eur3`) | Connexion Google + synchronisation | Authentication › Google activé ; domaine `mathieuoury34-gif.github.io` autorisé ; **publier `firestore.rules`** (console › Firestore › Règles › Publier) ; la config Web de `src/data/firebase-config.ts` n'est pas secrète |
| EODHD (gratuit, 20 appels/jour, 1 an d'historique) | Cours des ETF Euronext Paris (`.PA`) | Compte gratuit, clé dans le secret GitHub |
| Chrome / Safari | Installation de la PWA | – |

Les navigateurs ne peuvent pas appeler EODHD directement : c'est le robot GitHub Actions qui écrit `public/prices.json`, l'app le lit.

## 3. Arborescence du code (`03_App`)
```
index.html            page + écran de lancement animé (CSS inline) + script de thème
src/main.tsx          point d'entrée, service worker, rechargement auto à chaque nouvelle version
src/App.tsx           routage, écran de lancement (hideSplash), couleurs des ETF
src/splash.ts         maintient l'écran de lancement ≥ 1,5 s puis fondu
src/etfColors.ts      palette, attribution des couleurs par ETF, variables CSS --etf-{id}
src/i18n.ts, i18n-en.ts   t()/tn()/tl() ; dictionnaire EN indexé par la chaîne française
src/theme.ts          clair / sombre / système (attribut data-theme)
src/domain/           types.ts, calc.ts (règles de calcul), plan.ts (moteur des plans), format.ts (nombres/dates FR)
src/data/             store.ts (état + localStorage), seed.ts (état neutre), sync.ts (Firebase),
                      prices.ts (cours), excel.ts (import), excel-peanalyze.ts (export), xlsx.ts (écrivain .xlsx maison),
                      compositions.ts (charge public/compositions.json), catalog.json (248 ETF PEA + répartitions GICS et provenance), seed-data.json (6 ETF publics d'origine, utilisé par les tests)
src/screens/          Portfolio, History, Markets, Simulator (Épargne), Plans / PlanEditor / PlanParts (Simulateur › Plans), Settings, Assistant, Help
src/ui/               kit.tsx (composants), charts.tsx (graphiques SVG), icons.tsx, router.ts, useCalc.ts, WelcomeCard.tsx
src/styles/           tokens.css (design tokens, clair + sombre), app.css
public/               icônes, manifest, prices.json et compositions.json (écrits par les robots)
scripts/              build.mjs (esbuild + service worker), update-prices.mjs (robot des cours), build-catalog.py (catalogue),
                      factsheet_parse.py + compositions.py + build-compositions.py (lecture des fiches, libellés GICS français),
                      update-compositions.py (robot mensuel), i18n/, icons.py
data-src/             sources du catalogue (justETF) et fiches lues (compositions-fiches.json)
tests/                calc.test.ts, excel.test.ts, excel-export.mts (génère le classeur depuis private/)
.github/workflows/deploy.yml   robot des cours + build + déploiement (copie dans 03_App\github-workflows\)
private/              NON publié (gitignore) : données personnelles complètes, utilisées par les tests locaux
firestore.rules       règles de sécurité Firestore
```

## 4. Modèle de données (`src/domain/types.ts`)
`AppData` = `{ version, updatedAt, etfs, myEtfIds, catalog, deposits, transactions, targetAllocation, simulation, plans?, settings }`.
- `Etf` : `id` (= ticker), `index`, `name`, `isin`, `ticker`, `exchange`, `category`, `lastPrice`, `lastPriceDate`, `ter`, `aumMEur`, `replication`, `distribution`, `inStrategy`, `sectors`, `countries`, `priceHistory [date, cours]`.
- `Etf.comp` / `CatalogEtf.comp` = provenance de la répartition `{kind: 'fiche' | 'indice' | 'justetf', date, from?, fromName?}`.
- `Plan` `{id, name, sells: [{etfId, kind: 'all' | 'qty' | 'pct', value}], deposit, withdraw, monthly, targets | null}` (scénarios du Simulateur › Plans ; `targets` null = stratégie actuelle ; clés = id de l'ETF suivi ou mnémonique/ISIN du catalogue). Synchronisés avec le reste, non exportés dans l'Excel.
- `Deposit` `{date, amount}` ; `Transaction` `{date, etfId, unitPrice, quantity, grossAmount, fees, feeRefund}` (fees = brut − cours × quantité).
- `myEtfIds` : liste ordonnée de « Mes ETF » ; **c'est l'ordre d'affichage de tous les graphiques**.
- `targetAllocation` : 0–1 par ETF ; `inStrategy` = ETF dans la stratégie (cible > 0).
- `settings` : source des cours, fréquence du robot (1 ou 2/jour), date d'ouverture du PEA, frais par ordre (1,92 € Crédit Agricole), `etfColors` (hex par ETF).
- Stockage : `localStorage` (`peanalyze:data`, `peanalyze:prefs`, `peanalyze:lang`, `peanalyze:theme`) + Firestore `users/{uid}/state/main` (JSON, sans catalogue ni historiques de cours).
- **État initial neutre** (`emptySeed()`) : aucun ETF, aucune stratégie, aucune opération, jusqu'à connexion Google ou import d'un Excel.

## 5. Règles de calcul (`src/domain/calc.ts`, testées)
- Position = Σ quantités ; coût de revient = Σ (brut − remboursement de frais) ; PRU = coût / parts ; plus-value = valeur − coût.
- **Espèces** = virements − débits courtier + remboursements de frais (toujours calculé, inclus dans la valorisation).
- Valorisation = Σ parts × dernier cours + espèces ; rendement global = plus-value / épargné ; **TRI = XIRR** des virements + valorisation finale.
- Poids réel / cible / écart en points ; ETF « hors stratégie » = cible 0 mais détenu.
- **Assistant « Planifier mes achats du mois »** : deux méthodes d'allocation du montant disponible en parts entières, frais estimés inclus.
- Expositions secteurs / pays : agrégation par libellé normalisé (`normalizeLabel`) pondérée par les poids réels, **ramenée à la part du portefeuille dont la répartition est vérifiée** (les ETF dont la répartition n'est qu'indicative — `comp.kind = 'justetf'`, classification TRBC non comparable — sont exclus du calcul et signalés).
- **Plans** (`plan.ts`, testés) : ventes (tout / n parts / fraction, au dernier cours, mêmes frais par ordre que les achats) → budget = espèces + net des ventes + versement − retrait → achats en parts entières par comblement des plus gros écarts à la cible (`assistant` en mode « rééquilibrer »). Sorties : ordres, plus-value réalisée (net − coût de revient), écart à la cible (½ Σ |poids − cible|, en points) avant / après, frais de gestion moyens pondérés (TER) et amortissement des frais de courtage, exposition secteurs / pays avant / après (avec couverture), « et sans vendre ? » = nombre de mois de versements nécessaires pour passer sous 5 points d'écart (plafond 240 mois). Aucune vente n'est écrite dans le journal (les ventes ne sont pas modélisées dans l'historique).
- Série mensuelle (montant épargné vs valeur réelle), simulateur (capitalisation **mensuelle**, phases de versements illimitées, horizon 1–50 ans, euros constants avec inflation 2 %).
- **Frais Crédit Agricole** (constaté) : 1,92 € par petit ordre ; remboursement ≈ 1,92 − 0,5 % × brut.

## 6. Classeur Excel officiel (`excel-peanalyze.ts`, `xlsx.ts`, `excel.ts`)
Export : Paramètres › Exporter en Excel. 9 onglets : Tableau de bord, Portefeuille, Historique, Évolution, Mes ETF, Cours, Compositions, Catalogue, Simulateur. Saisies = cellules bleues (valeurs) ; le reste = formules + graphiques recalculés à l'ouverture.
Cellules lues à l'**import** (même fichier, aller-retour garanti par test) :
- **Historique** : A/B = virements (date, montant) à partir de la ligne 6 ; D date, E ticker, G cours, H quantité, J débit courtier, L remboursement = achats.
- **Mes ETF** (à partir de la ligne 5, 26 lignes) : A = ticker (**liste déroulante des 248 ETF du catalogue**), F = Oui/Non (dans la stratégie), G = allocation cible, O = couleur (hex). L'import **remplace** la liste, l'ordre, la stratégie, les cibles et les couleurs de l'importeur par ceux du fichier (ETF détenus hors liste ajoutés à la suite ; ETF ni listés ni détenus retirés).
- **Simulateur** : B5 capital initial, B6 horizon, B7 taux ; D6:E15 phases ; **B10 = date d'ouverture du PEA**.
- Ancien format « Suivi des investissements » (6 feuilles) toujours importable.
Plages nommées : E_Ticker/E_Indice/E_Strat/E_Cible/E_Cours (Mes ETF A/B/F/G/L5:30), A_* et V_* (Historique).
`xlsx.ts` écrit le .xlsx à la main (styles, formules, mises en forme conditionnelles, graphiques, validations de liste, plages nommées) — aucun paquet payant.

## 7. Couleurs des ETF (`etfColors.ts`)
Chaque ETF a **une couleur propre** (`settings.etfColors`), choisie dans Mes ETF › Gérer ma liste (pastille → palette de 35 teintes). Défaut = première couleur libre dans l'ordre de « Mes ETF » ; une fois attribuée, elle **suit l'ETF** quand on le déplace. Les couleurs deviennent des variables CSS `--etf-{id}` (graphiques, pastilles) et la colonne O de l'Excel.

## 8. Cours et robot (`scripts/update-prices.mjs`, `deploy.yml`)
- Suivi = réunion des « Mes ETF » + ETF détenus des comptes connectés (Firestore `watch/{uid}` = `{tickers, freq, createdAt, updatedAt}`, lisible publiquement, écrit par son propriétaire).
- Passages : 13 h Paris (ETF à 2 actualisations/jour), après la clôture (tous), horaire (historique des ETF ajoutés : 1 an). Budget 18 appels/jour sur 20 ; 9 ETF max à 2 fois/jour, 18 à 1 fois/jour ; comptes les plus anciens prioritaires ; un ETF suivi par plusieurs comptes ne coûte qu'un appel ; ETF plus suivi → effacé après 60 jours.
- Le site n'est republié que si code ou cours ont changé. Alternative sans robot : lien CSV d'une Google Sheet (ticker ; cours).
- Si aucun ETF n'est suivi, l'app n'actualise rien (état neutre, pas de bandeau d'erreur).

### 8 bis. Répartitions sectorielle et géographique (`scripts/*compositions*`, `factsheet_parse.py`)
- **Pourquoi** : justETF classe selon TRBC (S&P 500 « Technologie » 45 %) alors que les émetteurs publient du GICS (S&P 500 Technologies de l'information 39 %, États-Unis 100 %). Les deux ne sont pas comparables ; l'application utilise désormais **GICS (11 secteurs) en libellés français**.
- **Source** : fiche mensuelle institutionnelle officielle d'Amundi par ISIN et fin de mois (`https://www.amundietf.fr/pdfDocuments/monthly-factsheet/{ISIN}/FRA/FRA/INSTITUTIONNEL/ETF/{AAAAMMJJ}`), PDF lu par position des mots (pdfplumber). Les PDF graphiques d'iShares, BNP, Xtrackers, UBS, Vanguard et Ossiam ne sont pas lisibles.
- **Validité** : somme 98–102 %, tous les libellés reconnus, date de fiche ≥ 2026-07-01. **Priorité** : fiche propre → fiche d'un ETF du même indice (parts couvertes en devise ramenées à l'indice de base) → justETF marqué « indicatif » → rien. Bilan au 17/10/2026 : 98 fiches, 50 par indice, 82 indicatives, 18 sans donnée ; tous les ETF des deux portefeuilles suivis sont vérifiés.
- **Données connectées** : GitHub Actions, le 3 et le 10 de chaque mois, télécharge les nouvelles fiches (~110 requêtes HTTP simples, **aucun appel EODHD**), valide et écrit `public/compositions.json` ; l'app le charge au démarrage (`compositions.ts`) et met à jour les ETF concernés si la fiche est plus récente. Sans réseau ou si une fiche est illisible, la dernière répartition valide est conservée. Pour régénérer le catalogue : `python3 scripts/build-compositions.py <dossier de PDF>`.

## 9. Démarrage rapide (`index.html`, `splash.ts`, `sw.template.js`)
- Écran de lancement : logo vert animé (CSS inline dans `index.html`, fixé par-dessus l'app), maintenu **≥ 1,5 s** puis fondu, garde-fou 8 s. Polices Google chargées sans bloquer l'affichage.
- Service worker : la page est servie **depuis le cache** (mise à jour en arrière-plan) ; nouvelle version détectée → rechargement automatique unique.
- Appareil déjà connecté (`syncedUid`) ou utilisé sans compte : données locales affichées immédiatement, la vérification Firebase se fait en arrière-plan (`authChecked`).
- Écran tactile : pas de sélection de texte ni de menu à l'appui long (champs de saisie exceptés).

## 10. Mise en page, design, langue
- Maquettes Claude Design (`01_Design/Maquettes_PEAnalyze/`, lire `HANDOFF.md`), tokens `01_Design/design-tokens.css` → `src/styles/tokens.css`. Charte relevée sur credit-agricole.fr : Montserrat (titres) + Open Sans, vert #007461, pétrole #004652, boutons pilule, cartes 16 px.
- 4 onglets : Portefeuille (ouverture par défaut, retour après 15 min d'arrière-plan), Historique, Marchés, Simulateur. Paramètres dans l'ordre : Compte et synchro, Thème, Langue, PEA, Données, Aide, Cours, À propos.
- Bureau : grille 12 colonnes (`.dgrid`, `.dspan-N`, `.dcol`, `.drow`) ; mobile : une colonne.
- i18n : tout texte passe par `t()` ; l'anglais est dans `i18n-en.ts` (clé = phrase française). L'aide (`Help.tsx`) est rédigée dans les deux langues. L'Excel reste en français.
- Curseurs : allocation cible par pas de **1 %**, taux annuel du simulateur par pas de **0,1 %**.

## 11. Procédure pour tout refaire
1. Créer le dépôt GitHub public `peanalyze`, y pousser le contenu de `03_App` (sans `private/`), activer Pages (source GitHub Actions), copier `github-workflows/deploy.yml` vers `.github/workflows/`.
2. Créer le compte EODHD gratuit → secret de dépôt `EODHD_API_KEY`.
3. Créer le projet Firebase `peanalyze` (Spark), activer Google + Firestore (`eur3`), coller la config Web dans `src/data/firebase-config.ts`, publier `firestore.rules`, autoriser le domaine github.io.
4. `npm install`, `npm test`, `npm run build` (sortie `dist/`) ; le workflow le fait à chaque push.
5. Premier lancement : se connecter avec Google ou importer le classeur Excel PEAnalyze (un exemplaire à jour est dans `02_Donnees`).
6. Si le code est perdu : relire ce document, `01_Design/Maquettes_PEAnalyze/HANDOFF.md`, `01_Design/Brief_Claude_Design.md`, `00_Notes/Analyse_Excel_et_ameliorations.md`, puis reconstruire dans l'ordre : domain → data → ui → screens → Excel → robot.

## 12. Journal des versions
- **1.0 (11/10)** première version : 4 onglets, calculs, import Excel d'origine, Firebase, GitHub Pages, robot EODHD.
- **1.1 (11/10)** catalogue 248 ETF, solde espèces, export Excel officiel (9 onglets), robot piloté par « Mes ETF », fréquence configurable, FR/EN, thème sombre, compositions du catalogue.
- **1.2 (12/10)** retours testeurs : connexion Google, achat sans brut, curseurs de cible, horizon 50 ans, filtres PC, liens ETF, aide et guide (30 questions), « Planifier mes achats du mois ».
- **1.3 (16/10)** réordonnancement des paramètres ; allocation cible sous l'assistant ; mise en page bureau sans trous ; import Excel qui **lit Mes ETF, cible et couleurs** (liste déroulante du catalogue) ; **couleur par ETF** modifiable ; ordre des graphiques = ordre de Mes ETF ; application **neutre** à vide ; date d'ouverture du PEA dans l'Excel ; écran de lancement animé et démarrage instantané ; pas de sélection à l'appui long ; curseurs 1 % / 0,1 % ; correctif « a is not a function » à l'actualisation des cours.

- **1.4 (17/10)** répartitions sectorielle et géographique **vérifiées** (fiches officielles, GICS, provenance et date affichées par ETF, ETF indicatifs exclus des agrégats) et robot mensuel ; **Simulateur › Plans** (scénarios de vente / achat vers une nouvelle stratégie, comparateur), l'ancien simulateur devient **Simulateur › Épargne** (`/simulateur/epargne`).

## 13. Points ouverts
- **Ventes non enregistrées** : le journal ne connaît que achats et virements ; une vente exécutée chez le courtier doit encore être ignorée par l'app (chantier prioritaire : transaction de vente avec coût de revient au PRU).
- **Publier `firestore.rules`** dans la console Firebase (manuel ; tant que ce n'est pas fait, le robot suit les anciens ETF).
- Date d'ouverture du PEA : à saisir une fois (Paramètres › PEA) puis ré-exporter l'Excel.
- Testeur (PEA d'un ami) : Excel `PEAnalyze_PEA_ami.xlsx` complet depuis le 17/10/2026 (ouverture 10/10/2025, 78 opérations du relevé courtier : 36 achats, 11 versements, 31 remboursements de frais ; solde espèces 0,00 €). Stratégie : PSP5 40 %, CACC 25 %, PCEU 20 %, PAEEM 15 %, PE500 0 % (hors stratégie, conservé). Les cours de PSP5, PCEU et PE500 sont chargés par le robot à la première connexion de l'ami. Les frais courtier sont de 0,5 % du montant (minimum 1,92 € prélevé puis remboursé par « REMBOURSEMENT PLAF PEA T.PERCU »).
- L'écran de démarrage blanc d'Android (avant l'app) est celui du système, non modifiable en thème sombre.
- Limites connues : historique de cours 1 an (offre gratuite) ; ETF non cotés à Paris non suivables ; cours des ETF ajoutés dans l'Excel non repris dans la feuille Cours.
