# PEAnalyze

Application personnelle de suivi de PEA en ETF (Portefeuille, Historique, Marchés, Simulateur), installable sur Android, iPhone et PC, **sans aucun frais**.

## Structure
| Dossier | Contenu |
|---|---|
| `src/domain/` | Règles de calcul (positions, PRU, TRI, expositions, assistant, simulateur) et formatage français |
| `src/data/` | Données (stockage local, `seed-data.json` et `catalog.json` : ETF, cours et catalogue publics), cours, synchronisation Firebase, export Excel (`excel-peanalyze.ts` + générateur `xlsx.ts`) et import (`excel.ts`) |
| `src/ui/` | Composants de la planche Système, graphiques SVG, navigation |
| `src/screens/` | Écrans T0 à T4 de la maquette |
| `src/styles/` | `tokens.css` (design tokens v2) et `app.css` |
| `public/` | Icônes, manifeste PWA, `prices.json` (cours mis à jour par GitHub Actions) |
| `tests/` | Tests des calculs (valeurs attendues de HANDOFF.md §6) et aller-retour export / import Excel |
| `private/` | **Non publié** (ignoré par git) : opérations personnelles et fichier Excel d'origine, utilisés par les tests en local |

## Données personnelles
Le dépôt et le site publiés ne contiennent **aucune opération personnelle** (virements, achats, montants). Au premier lancement, l'app propose de se connecter avec Google (données retrouvées depuis le cloud) ou d'importer un classeur PEAnalyze (ou le fichier d'origine `Suivi des investissements.xlsx`) ; elles restent ensuite sur l'appareil et dans Firestore, accessibles uniquement par le compte Google propriétaire.

## Commandes
- `npm install` puis `npm test` : tests des calculs
- `npm run build` : construit l'application dans `dist/`
- `npm run dev` : serveur local sur http://127.0.0.1:5173

## Mise en ligne gratuite
1. **GitHub Pages** : dépôt public `peanalyze`, onglet *Settings › Pages › Source : GitHub Actions*. Le fichier `.github/workflows/deploy.yml` publie l'app à chaque envoi.
2. **Firebase (synchronisation, offre Spark sans carte)** : créer un projet, activer *Authentication › Google* et *Firestore*, coller la configuration Web dans `src/data/firebase-config.ts`, publier `firestore.rules`, ajouter le domaine `xxx.github.io` dans *Authentication › Settings › Domaines autorisés*.
3. **Cours** : secret de dépôt `EODHD_API_KEY` (*Settings › Secrets and variables › Actions*) ; GitHub Actions met à jour `public/prices.json` vers 13 h et après la clôture chaque jour ouvré. Alternative dans l'app : lien CSV d'une feuille Google publiée (ticker ; cours).

## Installation sur le téléphone
- Android : ouvrir l'adresse dans Chrome › menu ⋮ › *Ajouter à l'écran d'accueil* (ou *Installer l'application*).
- iPhone : Safari › Partager › *Sur l'écran d'accueil*.

## Export Excel
Paramètres › Exporter en Excel produit le classeur officiel PEAnalyze (9 onglets : Tableau de bord, Portefeuille, Historique, Évolution, Mes ETF, Cours, Compositions, Catalogue, Simulateur). Les saisies (cellules en bleu) sont des valeurs, tout le reste est en formules et graphiques, recalculés à l'ouverture. Le même fichier peut être réimporté dans l'app.
