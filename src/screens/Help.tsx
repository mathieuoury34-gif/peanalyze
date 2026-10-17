// T0-04 Aide et guide : questions fréquentes (français / anglais), avec recherche.
// Le contenu est rédigé ici dans les deux langues (pas de passage par t()) pour garder des réponses longues lisibles.
import { useMemo, useState } from 'react';
import { SubHeader } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate, useRoute } from '../ui/router';
import { lang } from '../i18n';

type L = { fr: string; en: string };
type Answer = { fr: string[]; en: string[] }; // une ligne commençant par « - » = puce
interface Q { id: string; q: L; a: Answer; tags?: string }
interface Cat { id: string; title: L; icon: string; items: Q[] }

const FAQ: Cat[] = [
  {
    id: 'decouvrir', icon: 'book', title: { fr: 'Découvrir PEAnalyze', en: 'Getting started' },
    items: [
      {
        id: 'but', tags: 'quoi sert application objectif what for purpose',
        q: { fr: 'À quoi sert PEAnalyze ?', en: 'What is PEAnalyze for?' },
        a: {
          fr: ['PEAnalyze est un tableau de bord pour suivre un PEA (Plan d’Épargne en Actions) investi en ETF. Vous y notez les opérations que vous faites réellement chez votre courtier : virements d’argent sur le PEA et achats de parts d’ETF.', 'À partir de ces opérations et des cours de bourse, l’app calcule automatiquement :', '- la valeur de votre PEA et votre plus-value ;', '- le prix de revient de chaque ETF, vos frais et votre rendement ;', '- la répartition réelle de votre portefeuille comparée à celle que vous visez ;', '- combien de parts acheter le mois prochain pour rester sur votre stratégie.', 'Elle remplace un tableur Excel, avec des graphiques lisibles sur téléphone et sur ordinateur.'],
          en: ['PEAnalyze is a dashboard to track a French PEA (equity savings plan) invested in ETFs. You record the operations you actually make with your broker: cash transfers into the PEA and purchases of ETF shares.', 'From these operations and market prices, the app automatically calculates:', '- the value of your PEA and your gain;', '- the cost price of each ETF, your fees and your return;', '- your actual allocation compared with the one you are aiming for;', '- how many shares to buy next month to stay on track.', 'It replaces an Excel spreadsheet, with charts that are easy to read on a phone or a computer.'],
        },
      },
      {
        id: 'argent', tags: 'argent réel banque courtier transférer investir vrai faux money real broker transfer',
        q: { fr: 'PEAnalyze déplace-t-il mon argent ou achète-t-il des ETF ?', en: 'Does PEAnalyze move my money or buy ETFs?' },
        a: {
          fr: ['Non. PEAnalyze n’est relié à aucune banque ni aucun courtier : il ne peut ni recevoir d’argent, ni passer d’ordre de bourse.', 'Votre argent reste sur votre PEA, chez votre banque ou votre courtier, et c’est là que vous achetez vos ETF. Ensuite, vous recopiez l’opération dans PEAnalyze (Historique › bouton +) pour que vos chiffres restent justes.'],
          en: ['No. PEAnalyze is not connected to any bank or broker: it cannot receive money or place stock orders.', 'Your money stays in your PEA, at your bank or broker, and that is where you buy your ETFs. You then copy the operation into PEAnalyze (History › + button) so your figures stay accurate.'],
        },
      },
      {
        id: 'simulation', tags: 'simulateur faux test fictif réel vue ensemble simulator fake test',
        q: { fr: 'Est-ce un simulateur pour investir « pour de faux » ?', en: 'Is it a simulator for investing “for fun”?' },
        a: {
          fr: ['Les onglets Portefeuille, Historique et Marchés montrent votre vrai portefeuille : celui que vous saisissez à partir de vos relevés de courtier. C’est une vue d’ensemble de vos investissements réels.', 'Seul l’onglet Simulateur est une projection théorique : il estime ce que pourrait devenir votre épargne selon un rendement et des versements que vous choisissez.', 'Pour découvrir l’app, vous pouvez saisir des montants fictifs, puis tout effacer dans Paramètres › À propos › Effacer toutes mes données.'],
          en: ['The Portfolio, History and Markets tabs show your real portfolio: the one you enter from your broker statements. It is an overview of your actual investments.', 'Only the Simulator tab is a theoretical projection: it estimates what your savings could become with a return and contributions you choose.', 'To try the app, you can enter fictitious amounts and then erase everything in Settings › About › Delete all my data.'],
        },
      },
      {
        id: 'commencer', tags: 'début premier lancement étapes start first steps',
        q: { fr: 'Par où commencer ?', en: 'Where do I start?' },
        a: {
          fr: ['- Connectez-vous avec Google (ou utilisez l’app sans compte) : vos données seront sauvegardées et partagées entre téléphone et PC.', '- Importez votre fichier Excel si vous en avez un (Paramètres › Données), sinon enregistrez votre premier virement : Historique › bouton +.', '- Enregistrez vos achats d’ETF.', '- Indiquez votre allocation cible : Portefeuille › Modifier mon allocation cible (par exemple 60 % S&P 500, 20 % NASDAQ-100…).', '- Chaque mois, utilisez Portefeuille › Planifier mes achats du mois pour savoir combien de parts acheter.'],
          en: ['- Sign in with Google (or use the app without an account): your data will be backed up and shared between phone and PC.', '- Import your Excel file if you have one (Settings › Data), otherwise record your first transfer: History › + button.', '- Record your ETF purchases.', '- Set your target allocation: Portfolio › Edit my target allocation (for example 60% S&P 500, 20% NASDAQ-100…).', '- Every month, use Portfolio › Plan this month’s purchases to know how many shares to buy.'],
        },
      },
      {
        id: 'pea-etf', tags: 'définition pea etf tracker indice definition index',
        q: { fr: 'C’est quoi un PEA et un ETF ?', en: 'What are a PEA and an ETF?' },
        a: {
          fr: ['Le PEA (Plan d’Épargne en Actions) est une enveloppe d’investissement française : on y verse de l’argent (150 000 € maximum de versements) pour acheter des actions ou des fonds européens. Après 5 ans, les gains bénéficient d’une fiscalité allégée.', 'Un ETF (ou « tracker ») est un fonds coté en bourse qui reproduit un indice, par exemple le S&P 500 (500 grandes entreprises américaines). Acheter une part revient à investir d’un coup dans toutes les entreprises de l’indice, avec des frais faibles.', 'PEAnalyze ne donne pas de conseil en investissement : renseignez-vous ou faites-vous conseiller avant d’investir.'],
          en: ['The PEA (Plan d’Épargne en Actions) is a French investment wrapper: you pay money in (up to €150,000 of contributions) to buy European shares or funds. After 5 years, gains are taxed more lightly.', 'An ETF (or “tracker”) is a fund listed on the stock exchange that replicates an index, for example the S&P 500 (500 large US companies). Buying one share means investing in all the companies of the index at once, with low fees.', 'PEAnalyze does not give investment advice: do your own research or get advice before investing.'],
        },
      },
    ],
  },
  {
    id: 'onglets', icon: 'portefeuille', title: { fr: 'Les quatre onglets', en: 'The four tabs' },
    items: [
      {
        id: 'portefeuille', tags: 'portefeuille synthèse accueil répartitions portfolio home',
        q: { fr: 'Portefeuille', en: 'Portfolio' },
        a: {
          fr: ['C’est l’écran d’accueil. Il montre la valeur totale de votre PEA, votre plus-value, la comparaison entre la répartition réelle et votre cible (double anneau), et une carte par ETF détenu.', 'Touchez une carte pour voir le prix actuel, votre prix de revient (PRU), la valeur visée et le nombre de parts à acheter pour atteindre la cible.', 'L’onglet « Répartitions » montre votre exposition par secteur et par pays, en additionnant le contenu de chaque ETF.'],
          en: ['This is the home screen. It shows the total value of your PEA, your gain, the comparison between your actual allocation and your target (double ring), and one card per ETF held.', 'Tap a card to see the current price, your average cost (PRU), the target value and the number of shares to buy to reach the target.', 'The “Breakdowns” section shows your exposure by sector and by country, adding up the content of each ETF.'],
        },
      },
      {
        id: 'historique', tags: 'historique journal virements achats indicateurs history log',
        q: { fr: 'Historique', en: 'History' },
        a: {
          fr: ['« Vue d’ensemble » : vos indicateurs (montant épargné, plus-value, rendement…) et la courbe de votre épargne comparée à la valeur réelle. Touchez l’icône ⓘ d’un indicateur pour son explication.', '« Journal » : la liste de tous vos virements et achats, mois par mois. Le bouton + permet d’en ajouter.'],
          en: ['“Overview”: your indicators (amount saved, gain, return…) and the curve of your savings compared with the real value. Tap the ⓘ icon of an indicator for its explanation.', '“Journal”: the list of all your transfers and purchases, month by month. The + button adds new ones.'],
        },
      },
      {
        id: 'marches', tags: 'marchés mes etf catalogue comparer markets catalogue compare',
        q: { fr: 'Marchés', en: 'Markets' },
        a: {
          fr: ['« Mes ETF » : les ETF que vous suivez, avec leur cours et leur évolution. Touchez un ETF pour sa fiche détaillée (graphique, vos achats, caractéristiques, composition, liens vers les pages officielles).', '« Catalogue » : plus de 240 ETF éligibles au PEA. Filtrez, triez, touchez un nom pour sa fiche rapide, le bouton ⊕ pour l’ajouter à Mes ETF, et cochez 2 ou 3 ETF pour les comparer.'],
          en: ['“My ETFs”: the ETFs you follow, with their price and trend. Tap an ETF for its detailed page (chart, your purchases, characteristics, composition, links to official pages).', '“Catalogue”: more than 240 PEA-eligible ETFs. Filter, sort, tap a name for a quick sheet, the ⊕ button to add it to My ETFs, and tick 2 or 3 ETFs to compare them.'],
        },
      },
      {
        id: 'simulateur-onglet', tags: 'simulateur projection futur simulator projection',
        q: { fr: 'Simulateur', en: 'Simulator' },
        a: {
          fr: ['Il projette votre épargne dans le futur : capital de départ, rendement annuel moyen supposé, durée (jusqu’à 50 ans) et versements mensuels. Il comprend trois sous-onglets : Épargne (la projection), Plans (scénarios « et si… ») et Objectifs (un capital à atteindre à une date). Voir la rubrique « Simulateur » plus bas.'],
          en: ['It projects your savings into the future: starting capital, assumed average annual return, duration (up to 50 years) and monthly contributions. It has three sub-tabs: Savings (the projection), Plans (“what if…” scenarios) and Goals (a capital to reach on a date). See the “Simulator” section below.'],
        },
      },
    ],
  },
  {
    id: 'saisir', icon: 'pencil', title: { fr: 'Saisir mes opérations', en: 'Recording my operations' },
    items: [
      {
        id: 'virement', tags: 'virement versement dépôt ajouter transfer deposit add',
        q: { fr: 'Comment enregistrer un virement ?', en: 'How do I record a transfer?' },
        a: {
          fr: ['Bouton + (Historique ou Portefeuille) › Virement. Indiquez la date et le montant versé sur le PEA. Il s’ajoute au montant total épargné et au solde espèces, en attendant d’être investi.'],
          en: ['+ button (History or Portfolio) › Transfer. Enter the date and the amount paid into the PEA. It is added to the total amount saved and to the cash balance until it is invested.'],
        },
      },
      {
        id: 'achat', tags: 'achat acheter enregistrer montant brut frais remboursement grisé purchase gross fees refund disabled',
        q: { fr: 'Comment enregistrer un achat ?', en: 'How do I record a purchase?' },
        a: {
          fr: ['Bouton + › Achat d’ETF, puis :', '- choisissez l’ETF (il doit être dans « Mes ETF » : sinon ajoutez-le depuis le catalogue) ;', '- la date, le cours unitaire et la quantité de parts ;', '- le montant brut : la somme réellement débitée par le courtier, frais compris. Laissé vide, il est estimé à cours × quantité + frais estimés (réglables dans Paramètres › PEA) ;', '- le remboursement de frais, si votre courtier en rembourse une partie.', 'L’app calcule les frais et leur pourcentage. Si le bouton « Enregistrer » est grisé, un message au-dessus indique ce qui manque.'],
          en: ['+ button › ETF purchase, then:', '- choose the ETF (it must be in “My ETFs”: otherwise add it from the catalogue);', '- the date, the unit price and the number of shares;', '- the gross amount: the sum actually debited by the broker, fees included. Left empty, it is estimated as price × quantity + estimated fees (adjustable in Settings › PEA);', '- the fee refund, if your broker refunds part of the fees.', 'The app calculates the fees and their percentage. If the “Save” button is greyed out, a message above it says what is missing.'],
        },
      },
      {
        id: 'vente', tags: 'vente vendre enregistrer plus-value réalisée sale sell record realised gain',
        q: { fr: 'Comment enregistrer une vente d’ETF ?', en: 'How do I record an ETF sale?' },
        a: {
          fr: ['Bouton + › Vente d’ETF, puis choisissez l’ETF détenu, la date, le cours et le nombre de parts vendues. Le montant net reçu (somme créditée par le courtier, frais déduits) est estimé à cours × quantité − frais si vous le laissez vide.', 'L’app retire les parts vendues au prix de revient moyen (PRU) du moment, calcule la plus-value réalisée et augmente le solde espèces. Le PRU des parts restantes ne change pas. Dans le journal, les ventes ont leur filtre « Ventes ».'],
          en: ['+ button › ETF sale, then choose the ETF you hold, the date, the price and the number of units sold. The net amount received (the sum credited by the broker, fees deducted) is estimated as price × quantity − fees if you leave it empty.', 'The app removes the units sold at the average cost (PRU) of the moment, works out the realised gain and raises the cash balance. The PRU of the remaining units does not change. In the journal, sales have their own “Sales” filter.'],
        },
      },
      {
        id: 'retrait', tags: 'retrait retirer argent sortir pea clôture withdrawal take out money',
        q: { fr: 'Comment enregistrer un retrait d’argent du PEA ?', en: 'How do I record a withdrawal from the PEA?' },
        a: {
          fr: ['Bouton + › Retrait. Indiquez la date et la somme sortie du PEA : elle doit être disponible en espèces (vendez d’abord si besoin). Le retrait diminue le montant total épargné et le solde espèces, et il compte comme un flux sortant dans le rendement annualisé (TRI).', 'Attention : retirer de l’argent avant 5 ans peut clôturer le PEA et entraîner une fiscalité ; vérifiez les règles avant tout retrait.'],
          en: ['+ button › Withdrawal. Enter the date and the sum taken out of the PEA: it must be available as cash (sell first if needed). A withdrawal lowers the total amount saved and the cash balance, and counts as an outgoing flow in the annualised return (IRR).', 'Careful: withdrawing money before 5 years can close the PEA and trigger taxes; check the rules before any withdrawal.'],
        },
      },
      {
        id: 'modifier', tags: 'modifier supprimer corriger erreur annuler edit delete undo',
        q: { fr: 'Comment modifier ou supprimer une opération ?', en: 'How do I edit or delete an operation?' },
        a: {
          fr: ['Dans Historique › Journal, faites glisser la ligne vers la gauche (ou touchez-la) pour faire apparaître « Modifier » et « Supprimer ». Après chaque enregistrement ou suppression, le bouton « Annuler » du message en bas de l’écran revient en arrière pendant quelques secondes.'],
          en: ['In History › Journal, swipe the line to the left (or tap it) to show “Edit” and “Delete”. After each save or deletion, the “Cancel” button of the message at the bottom of the screen reverts it for a few seconds.'],
        },
      },
      {
        id: 'excel', tags: 'excel import export fichier xlsx sauvegarde json backup file',
        q: { fr: 'Puis-je importer ou exporter mes données (Excel) ?', en: 'Can I import or export my data (Excel)?' },
        a: {
          fr: ['Oui, dans Paramètres › Données :', '- « Importer un fichier Excel » lit un classeur PEAnalyze ou l’ancien fichier « Suivi des investissements » ;', '- « Exporter en Excel » crée un classeur de 11 onglets, avec formules et graphiques, réimportable ensuite. Vos plans et objectifs y sont rangés (onglets « Plans » et « Objectifs ») : ils appartiennent au classeur, donc importer un autre fichier remplace ceux de l’app ;', '- « Exporter en JSON » fait une sauvegarde complète, restaurable avec « Restaurer une sauvegarde JSON ».'],
          en: ['Yes, in Settings › Data:', '- “Import an Excel file” reads a PEAnalyze workbook or the original “Suivi des investissements” file;', '- “Export to Excel” creates an 11-sheet workbook with formulas and charts, which can be imported again. Your plans and goals are stored in it (“Plans” and “Objectifs” sheets): they belong to the workbook, so importing another file replaces the ones in the app;', '- “Export to JSON” makes a full backup, restorable with “Restore a JSON backup”.'],
        },
      },
    ],
  },
  {
    id: 'assistant', icon: 'listChecks', title: { fr: 'Planifier mes achats du mois', en: 'Planning this month’s purchases' },
    items: [
      {
        id: 'assistant-quoi', tags: 'assistant planifier achats mois ia robot conseil plan purchases ai advice',
        q: { fr: 'À quoi sert « Planifier mes achats du mois » ?', en: 'What is “Plan this month’s purchases” for?' },
        a: {
          fr: ['C’est une calculatrice, pas une intelligence artificielle ni un conseiller. Vous indiquez le montant que vous allez investir ce mois-ci ; l’app calcule combien de parts entières de chaque ETF de votre stratégie acheter, en tenant compte des cours et des frais de courtage.', 'Vous passez ensuite les ordres chez votre courtier, puis « Enregistrer ces achats » les ajoute au journal (à corriger avec les montants exacts une fois exécutés).', 'Le montant proposé inclut votre solde espèces (argent déjà sur le PEA et pas encore investi).'],
          en: ['It is a calculator, not artificial intelligence or an adviser. You enter the amount you will invest this month; the app calculates how many whole shares of each ETF in your strategy to buy, taking prices and brokerage fees into account.', 'You then place the orders with your broker, and “Save these purchases” adds them to the journal (to be corrected with the exact amounts once executed).', 'The suggested amount includes your cash balance (money already in the PEA and not yet invested).'],
        },
      },
      {
        id: 'assistant-methodes', tags: 'suivre cible rééquilibrer différence méthode follow target rebalance difference',
        q: { fr: 'Quelle différence entre « Suivre la cible » et « Rééquilibrer » ?', en: 'What is the difference between “Follow the target” and “Rebalance”?' },
        a: {
          fr: ['« Suivre la cible » découpe le versement selon vos pourcentages. Avec une cible 60 / 20 / 10 / 10 % et 750 €, environ 450 € vont au premier ETF, 150 € au deuxième, etc. C’est simple et régulier : chaque ETF reçoit sa part tous les mois.', '« Rééquilibrer » donne la priorité aux ETF les plus en retard sur leur cible. Si votre S&P 500 pèse 40 % au lieu de 60 %, tout le versement peut aller sur lui ce mois-ci. Votre portefeuille revient plus vite à la répartition voulue.', 'Dans les deux cas, seuls les ETF « dans ma stratégie » (cible supérieure à 0 %) reçoivent des achats.'],
          en: ['“Follow the target” splits the contribution according to your percentages. With a 60 / 20 / 10 / 10% target and €750, about €450 goes to the first ETF, €150 to the second, etc. It is simple and regular: each ETF gets its share every month.', '“Rebalance” gives priority to the ETFs furthest below their target. If your S&P 500 weighs 40% instead of 60%, the whole contribution may go to it this month. Your portfolio returns faster to the allocation you want.', 'In both cases, only ETFs “in my strategy” (target above 0%) receive purchases.'],
        },
      },
      {
        id: 'cible', tags: 'allocation cible stratégie pourcentage hors stratégie cac 40 msci world target strategy off',
        q: { fr: 'Comment régler mon allocation cible ? Pourquoi « hors stratégie » ?', en: 'How do I set my target allocation? What does “outside strategy” mean?' },
        a: {
          fr: ['Portefeuille › Modifier mon allocation cible. Faites glisser le curseur de chaque ETF (par pas de 1 %) ; le total doit faire 100 % pour pouvoir valider.', 'Un ETF à 0 % est « hors stratégie » : vous le gardez dans le portefeuille, mais vous n’en rachetez plus. Pour le remettre dans la stratégie, faites simplement glisser son curseur (l’interrupteur « Dans ma stratégie » s’active tout seul).', 'Seuls les ETF de « Mes ETF » ou déjà détenus apparaissent dans cette liste.'],
          en: ['Portfolio › Edit my target allocation. Drag each ETF’s slider (in 1% steps); the total must be 100% to confirm.', 'An ETF at 0% is “outside strategy”: you keep it in the portfolio but no longer buy it. To bring it back into the strategy, just drag its slider (the “In my strategy” switch turns on by itself).', 'Only ETFs in “My ETFs” or already held appear in this list.'],
        },
      },
    ],
  },
  {
    id: 'chiffres', icon: 'trend', title: { fr: 'Comprendre les chiffres', en: 'Understanding the figures' },
    items: [
      {
        id: 'valorisation', tags: 'valorisation valeur totale plus-value latente rendement global value gain return',
        q: { fr: 'Valorisation, plus-value et rendement global', en: 'Value, gain and overall return' },
        a: {
          fr: ['- Valorisation totale : nombre de parts × dernier cours de chaque ETF, plus le solde espèces.', '- Plus-value latente : valorisation − montant total épargné. « Latente » car elle n’est gagnée qu’à la vente. Si vous avez vendu des ETF, le chiffre devient « plus-value totale » : lignes encore détenues + plus-value déjà réalisée.', '- Rendement global : plus-value ÷ montant épargné (net des retraits).'],
          en: ['- Total value: number of shares × last price of each ETF, plus the cash balance.', '- Unrealised gain: total value − total amount saved. “Unrealised” because it is only earned when you sell. If you have sold ETFs, the figure becomes “total gain”: lines still held + gain already realised.', '- Overall return: gain ÷ amount saved (net of withdrawals).'],
        },
      },
      {
        id: 'analyse', tags: 'analyse référence benchmark doublons recoupement risque volatilité baisse concentration frais coût analysis overlap risk drawdown cost',
        q: { fr: 'Que montre la page Analyse ?', en: 'What does the Analysis page show?' },
        a: {
          fr: ['Portefeuille › Analyse regroupe quatre éclairages :', '- Face à un ETF de référence : votre argent, avec les mêmes virements aux mêmes dates, comparé à ce qu’aurait donné un seul ETF (au choix). Sur l’historique de cours disponible (environ un an).', '- Doublons et recoupements : part commune des compositions de deux ETF détenus (pays et secteurs vérifiés), et exposition cumulée.', '- Risque : volatilité annuelle, pire baisse entre un sommet et le creux suivant, poids de la plus grosse ligne et nombre de lignes « équivalentes ».', '- Ce que vos ETF vous coûtent : frais courants pondérés + courtage des 12 derniers mois, avec leur effet sur la projection du simulateur.', 'Ce sont des mesures du passé, pas des prévisions ni des conseils.'],
          en: ['Portfolio › Analysis brings together four views:', '- Against a reference ETF: your money, with the same deposits on the same dates, compared with what a single ETF (your choice) would have given. Over the available price history (about one year).', '- Duplicates and overlaps: the share two held ETFs’ compositions have in common (verified countries and sectors), and cumulative exposure.', '- Risk: annual volatility, worst drop from a peak to the next trough, weight of the largest line and number of “equivalent” lines.', '- What your ETFs cost you: weighted ongoing charges + brokerage of the last 12 months, with their effect on the simulator projection.', 'These are measures of the past, not forecasts or advice.'],
        },
      },
      {
        id: 'rappel', tags: 'rappel mensuel notification investir bandeau reminder monthly notification invest banner',
        q: { fr: 'Comment fonctionne le rappel mensuel ?', en: 'How does the monthly reminder work?' },
        a: {
          fr: ['Paramètres › Rappel mensuel : choisissez le jour du mois. À partir de ce jour, un bandeau « C’est le moment d’investir » s’affiche sur l’écran Portefeuille tant qu’aucun achat n’est enregistré dans le mois ; « Plus tard » le masque jusqu’au mois suivant.', 'Vous pouvez aussi activer une notification. Sans serveur, elle s’affiche quand vous ouvrez l’app, et en tâche de fond seulement si votre navigateur le permet (Chrome ou Edge, app installée) : un téléphone qui n’ouvre jamais l’app peut ne rien recevoir. Le jour du rappel est enregistré dans le classeur Excel.'],
          en: ['Settings › Monthly reminder: choose the day of the month. From that day, an “It’s time to invest” banner appears on the Portfolio screen as long as no purchase is recorded in the month; “Later” hides it until next month.', 'You can also enable a notification. Without a server, it appears when you open the app, and in the background only if your browser allows it (Chrome or Edge, installed app): a phone that never opens the app may receive nothing. The reminder day is stored in the Excel workbook.'],
        },
      },
      {
        id: 'tri', tags: 'tri xirr rendement annualisé annual return',
        q: { fr: 'Qu’est-ce que le TRI (rendement annualisé) ?', en: 'What is the IRR (annualised return)?' },
        a: {
          fr: ['Le taux de rendement interne tient compte de la date de chaque virement : 100 € placés depuis un an pèsent plus que 100 € placés hier. Il donne un rendement « par an », comparable à un livret.', 'Il est souvent très élevé (ou très bas) la première année, car quelques mois de bourse sont ramenés à une année entière. Il se stabilise avec le temps.'],
          en: ['The internal rate of return takes the date of each transfer into account: €100 invested a year ago weighs more than €100 invested yesterday. It gives a “per year” return, comparable with a savings account.', 'It is often very high (or very low) in the first year, because a few months of market moves are scaled to a full year. It stabilises over time.'],
        },
      },
      {
        id: 'pru', tags: 'pru prix revient unitaire écart points solde espèces frais nets cost price gap cash',
        q: { fr: 'PRU, écart en points, solde espèces, frais nets', en: 'Average cost, gap in points, cash balance, net fees' },
        a: {
          fr: ['- PRU (prix de revient unitaire) : ce que vous a coûté une part en moyenne, frais compris. Si le cours est au-dessus, vous êtes en plus-value sur cet ETF.', '- Écart en points : poids réel − poids cible. 40 % au lieu de 60 % = −20 pts. Il s’affiche en orange au-delà de 5 pts.', '- Solde espèces : virements − achats (frais compris) + remboursements de frais. C’est l’argent du PEA pas encore investi.', '- Frais nets : frais payés − frais remboursés par le courtier.'],
          en: ['- Average cost (PRU): what one share cost you on average, fees included. If the price is above it, you have a gain on this ETF.', '- Gap in points: actual weight − target weight. 40% instead of 60% = −20 pts. It turns orange beyond 5 pts.', '- Cash balance: transfers − purchases (fees included) + fee refunds. It is the PEA money not yet invested.', '- Net fees: fees paid − fees refunded by the broker.'],
        },
      },
    ],
  },
  {
    id: 'marches-etf', icon: 'marches', title: { fr: 'ETF, cours et catalogue', en: 'ETFs, prices and catalogue' },
    items: [
      {
        id: 'mes-etf', tags: 'mes etf liste gérer ajouter retirer ordre suivre my etfs list manage',
        q: { fr: 'Comment gérer la liste « Mes ETF » ?', en: 'How do I manage the “My ETFs” list?' },
        a: {
          fr: ['Marchés › Mes ETF › « Gérer ma liste » (aussi depuis Portefeuille › Gérer mes ETF suivis, ou Paramètres). Vous pouvez changer l’ordre, retirer un ETF ou en ajouter depuis le catalogue (bouton ⊕).', 'Touchez la pastille de couleur d’un ETF pour en choisir une autre dans la palette : la couleur est attachée à l’ETF et le suit quand vous le déplacez ; un nouvel ETF reçoit la première couleur libre. L’ordre de la liste est aussi celui des graphiques (Réel et cible, etc.).', 'Un ETF détenu reste dans votre portefeuille même s’il est retiré de la liste.'],
          en: ['Markets › My ETFs › “Manage my list” (also from Portfolio › Manage my tracked ETFs, or Settings). You can change the order, remove an ETF or add one from the catalogue (⊕ button).', 'Tap an ETF’s colour dot to pick another colour from the palette: the colour belongs to the ETF and follows it when you move it; a new ETF gets the first free colour. The list order is also the order used in the charts (Actual and target, etc.).', 'An ETF you hold stays in your portfolio even if it is removed from the list.'],
        },
      },
      {
        id: 'infos-etf', tags: 'informations fiche officielle justetf dic prospectus documentation details official',
        q: { fr: 'Où trouver toutes les informations d’un ETF ?', en: 'Where can I find all the information about an ETF?' },
        a: {
          fr: ['Dans l’app : touchez un ETF dans Mes ETF (fiche complète) ou son nom dans le catalogue (fiche rapide). Vous y trouvez frais, encours, réplication, composition par secteur et par pays.', 'Le lien « Fiche complète sur justETF » ouvre la page de référence de l’ETF, d’où l’on accède aux documents officiels (DIC, prospectus, rapports). « Cours sur Google Finance » affiche le cours en direct.'],
          en: ['In the app: tap an ETF in My ETFs (full page) or its name in the catalogue (quick sheet). You will find fees, assets, replication and composition by sector and country.', 'The “Full page on justETF” link opens the ETF’s reference page, which gives access to official documents (KID, prospectus, reports). “Price on Google Finance” shows the live price.'],
        },
      },
      {
        id: 'cours', tags: 'cours prix actualisation mise à jour robot eodhd pas à jour prices update',
        q: { fr: 'Quand les cours sont-ils mis à jour ?', en: 'When are prices updated?' },
        a: {
          fr: ['Un robot gratuit récupère les cours des ETF de « Mes ETF » chaque jour de bourse, vers 13 h et après la clôture (ou seulement après la clôture, au choix dans Paramètres › Cours). L’app les recharge à l’ouverture ou avec le bouton ⟳ en haut de l’écran.', 'Un ETF qui vient d’être ajouté reçoit son historique (1 an) dans l’heure, à condition d’être connecté avec Google. Le nombre d’ETF suivis est limité (9 ou 18 selon la fréquence) car le service de cours gratuit a un quota quotidien.'],
          en: ['A free robot fetches the prices of the ETFs in “My ETFs” every trading day, around 1 pm and after the close (or only after the close, see Settings › Price). The app reloads them on opening or with the ⟳ button at the top of the screen.', 'A newly added ETF receives its history (1 year) within the hour, provided you are signed in with Google. The number of tracked ETFs is limited (9 or 18 depending on frequency) because the free price service has a daily quota.'],
        },
      },
      {
        id: 'ajout-impossible', tags: 'ajouter impossible hors paris non coté quota maximum cannot add',
        q: { fr: 'Pourquoi je ne peux pas ajouter un ETF à « Mes ETF » ?', en: 'Why can’t I add an ETF to “My ETFs”?' },
        a: {
          fr: ['- Il n’est pas coté sur Euronext Paris (mention « hors Paris ») : ses cours ne peuvent pas être suivis.', '- Le nombre maximal d’ETF suivis est atteint : retirez-en un, ou passez à une actualisation par jour dans Paramètres › Cours.'],
          en: ['- It is not listed on Euronext Paris (“outside Paris”): its prices cannot be tracked.', '- The maximum number of tracked ETFs has been reached: remove one, or switch to one update per day in Settings › Price.'],
        },
      },
      {
        id: 'comparer', tags: 'comparer comparateur compare',
        q: { fr: 'Comment comparer des ETF ?', en: 'How do I compare ETFs?' },
        a: {
          fr: ['Dans Marchés › Catalogue, cochez 2 ou 3 ETF puis touchez « Comparer ». La meilleure valeur de chaque ligne (frais les plus bas, encours le plus élevé…) est surlignée en vert.'],
          en: ['In Markets › Catalogue, tick 2 or 3 ETFs and tap “Compare”. The best value of each row (lowest fees, largest assets…) is highlighted in green.'],
        },
      },
    ],
  },
  {
    id: 'simulateur', icon: 'simulateur', title: { fr: 'Simulateur', en: 'Simulator' },
    items: [
      {
        id: 'sim-calcul', tags: 'simulateur calcul intérêts composés capital simulator compound interest',
        q: { fr: 'Comment fonctionne le simulateur ?', en: 'How does the simulator work?' },
        a: {
          fr: ['Il part de votre capital initial, ajoute chaque mois votre versement et applique chaque mois le rendement annuel choisi (intérêts composés). Il affiche le capital final, la part qui vient de vos versements et celle qui vient des intérêts.', 'Ce n’est qu’une projection : la bourse ne monte pas de façon régulière, et le résultat ne tient compte ni des frais ni des impôts.'],
          en: ['It starts from your initial capital, adds your contribution every month and applies the chosen annual return every month (compound interest). It shows the final capital, the part coming from your contributions and the part coming from interest.', 'It is only a projection: the stock market does not rise steadily, and the result ignores fees and taxes.'],
        },
      },
      {
        id: 'plans', tags: 'plans plan vendre vente etf scénario et si stratégie cible msci world sell scenario what if target',
        q: { fr: 'À quoi servent les plans (vendre un ETF, changer de stratégie) ?', en: 'What are plans for (selling an ETF, changing strategy)?' },
        a: {
          fr: ['Un plan est un scénario « et si… » : vous choisissez ce que vous vendriez (un ETF entier, une partie des parts), un éventuel nouveau versement, et la stratégie que vous visez. L’app calcule ce que rapporteraient les ventes (frais compris), puis les achats en parts entières qui rapprochent le plus votre portefeuille de la cible.', 'Elle montre ce que ça change : écart à la cible avant / après, frais de gestion moyens (et en combien de temps les frais de courtage sont amortis), plus-value réalisée, nombre de lignes, et l’exposition par secteur et par pays avant / après. « Et sans vendre ? » estime combien de mois de versements seraient nécessaires pour y arriver sans rien vendre.', 'Les modèles de départ : vendre un ETF (la stratégie actuelle est conservée sans lui), tout regrouper dans un seul ETF (par exemple un MSCI World), ou un plan libre pour régler ventes, versement et cible à votre main. Vous pouvez dupliquer des plans pour les comparer côte à côte. « Et sur le passé ? » rejoue, sur l’historique de cours disponible, la répartition d’aujourd’hui et celle d’après le plan (performance, volatilité, pire baisse) : c’est indicatif, sur une période courte.'],
          en: ['A plan is a “what if…” scenario: you choose what you would sell (a whole ETF, part of the shares), an optional new deposit and the strategy you are aiming for. The app works out what the sales would bring (fees included), then the whole-share purchases that bring your portfolio closest to the target.', 'It shows what changes: gap to target before / after, average management fees (and how long it takes for brokerage fees to pay back), realised gain, number of positions, and exposure by sector and by country before / after. “And without selling?” estimates how many months of contributions would be needed to get there without selling anything.', 'Starter templates: sell an ETF (the current strategy is kept without it), consolidate everything into one ETF (for example a MSCI World), or a free plan to set sales, deposit and target as you wish. You can duplicate plans to compare them side by side. “And on the past?” replays, over the available price history, today’s allocation and the after-plan one (performance, volatility, worst drop): it is indicative, over a short period.'],
        },
      },
      {
        id: 'plans-limites', tags: 'plans limites ventes journal impôt retrait frais plans limits sales journal tax withdrawal fees',
        q: { fr: 'Que ne font pas les plans ?', en: 'What do plans not do?' },
        a: {
          fr: ['Un plan ne passe aucun ordre : vous exécutez les ordres chez votre courtier. Ensuite, « Appliquer ce plan » enregistre d’un coup les ventes, achats, versement ou retrait dans le journal, datés d’aujourd’hui au dernier cours connu : vérifiez ensuite les montants exacts (Historique › Journal › Modifier). Les plans appartiennent au classeur Excel : changer de classeur change de plans.', 'Les ventes sont comptées avec les mêmes frais par ordre que les achats, au dernier cours connu. Les ETF du catalogue que vous ne suivez pas utilisent un cours indicatif à vérifier. Vendre et réinvestir à l’intérieur du PEA n’est pas imposé ; en sortir de l’argent peut l’être (et, avant 5 ans, clôture en principe le plan) : vérifiez les règles avant tout retrait.', 'C’est un calcul, pas un conseil en investissement.'],
          en: ['A plan places no orders and does not change your portfolio: you execute the orders with your broker. Afterwards, “Apply this plan” records the sales, purchases, deposit or withdrawal in the journal in one go, dated today at the last known price: then check the exact amounts (History › Journal › Edit). Plans belong to the Excel workbook: switching workbooks switches plans.', 'Sales are counted with the same fee per order as purchases, at the last known price. Catalogue ETFs you do not track use an indicative price to be checked. Selling and reinvesting inside the PEA is not taxed; taking money out can be (and, before 5 years, in principle closes the plan): check the rules before any withdrawal.', 'This is a calculation, not investment advice.'],
        },
      },
      {
        id: 'objectifs', tags: 'objectifs objectif capital date jauge versement mensuel requis goals target gauge',
        q: { fr: 'À quoi servent les objectifs ?', en: 'What are goals for?' },
        a: {
          fr: ['Simulateur › Objectifs : fixez un capital à atteindre à une date (un apport, un projet…). La jauge compare ce capital à la valeur actuelle de votre PEA, et l’app calcule le versement mensuel nécessaire, avec le rendement annuel du simulateur et sans aucun rendement. Elle indique aussi si votre rythme prévu (première phase du simulateur) suffirait.', 'C’est indicatif : la bourse peut faire mieux ou moins bien que le rendement supposé. Les objectifs sont rangés dans le classeur Excel (onglet « Objectifs »).'],
          en: ['Simulator › Goals: set a capital to reach on a date (a down payment, a project…). The gauge compares it with the current value of your PEA, and the app works out the monthly contribution needed, with the simulator’s annual return and with no return at all. It also tells you whether your planned pace (the simulator’s first phase) would be enough.', 'It is indicative: the market may do better or worse than the assumed return. Goals are stored in the Excel workbook (“Objectifs” sheet).'],
        },
      },
      {
        id: 'sim-options', tags: 'phases dca euros constants inflation progression réelle horizon 50 ans',
        q: { fr: 'Phases de versement, euros constants, progression réelle', en: 'Contribution phases, constant euros, actual progress' },
        a: {
          fr: ['- Phases de versement : changez le montant mensuel à partir d’une année donnée (par exemple 700 €/mois, puis 900 € à partir de l’année 20).', '- Euros constants : retire l’effet d’une inflation de 2 % par an, pour voir le pouvoir d’achat réel du capital.', '- Comparer à ma progression réelle : superpose la valeur réelle de votre PEA depuis son ouverture.', '- Déduire mes frais : retire du rendement les frais courants de vos ETF et, de vos versements, les frais de courtage de vos ordres des 12 derniers mois, pour voir l’effet des frais sur le capital final.', '- L’horizon va de 1 à 50 ans.'],
          en: ['- Contribution phases: change the monthly amount from a given year (for example €700/month, then €900 from year 20).', '- Constant euros: removes the effect of 2% annual inflation, to show the real purchasing power of the capital.', '- Compare with my actual progress: overlays the real value of your PEA since it was opened.', '- Deduct my fees: takes your ETFs’ ongoing charges off the return and the brokerage fees of your last 12 months of orders off your contributions, to show the effect of fees on the final capital.', '- The horizon ranges from 1 to 50 years.'],
        },
      },
    ],
  },
  {
    id: 'compte', icon: 'cloud', title: { fr: 'Compte, synchronisation et données', en: 'Account, sync and data' },
    items: [
      {
        id: 'google', tags: 'google connexion compte pourquoi sign in account why',
        q: { fr: 'Pourquoi se connecter avec Google ?', en: 'Why sign in with Google?' },
        a: {
          fr: ['La connexion sauvegarde vos données dans un espace privé et gratuit, et les synchronise entre votre téléphone et votre ordinateur en quelques secondes. Elle permet aussi au robot des cours de connaître vos ETF.', 'Sans compte, l’app fonctionne aussi, mais les données restent uniquement sur l’appareil utilisé (pensez à exporter une sauvegarde).'],
          en: ['Signing in backs up your data in a free private space and syncs it between your phone and your computer within seconds. It also lets the price robot know your ETFs.', 'Without an account the app still works, but the data stays only on the device you use (remember to export a backup).'],
        },
      },
      {
        id: 'connexion-bloquee', tags: 'connexion bloquée échec bouton google ne marche pas login stuck failed',
        q: { fr: 'La connexion Google échoue ou le bouton ne répond plus', en: 'Google sign-in fails or the button does not respond' },
        a: {
          fr: ['Si vous fermez la fenêtre Google ou revenez en arrière, l’app le détecte et le bouton redevient utilisable après quelques secondes : touchez-le à nouveau.', 'Si la fenêtre ne s’ouvre pas, autorisez les fenêtres pop-up pour le site, ou ouvrez l’app dans Chrome (Android) ou Safari (iPhone) plutôt que depuis une autre application.'],
          en: ['If you close the Google window or go back, the app detects it and the button becomes usable again after a few seconds: tap it again.', 'If the window does not open, allow pop-ups for the site, or open the app in Chrome (Android) or Safari (iPhone) rather than from another app.'],
        },
      },
      {
        id: 'confidentialite', tags: 'confidentialité données privées sécurité partage privacy data security',
        q: { fr: 'Mes données sont-elles privées ?', en: 'Is my data private?' },
        a: {
          fr: ['Oui. Vos opérations sont enregistrées sur votre appareil et, si vous êtes connecté, dans un espace accessible uniquement par votre compte Google. Personne d’autre, y compris les autres utilisateurs, ne peut les voir. Seule la liste anonyme de vos ETF suivis est transmise au robot des cours.'],
          en: ['Yes. Your operations are stored on your device and, if you are signed in, in a space accessible only by your Google account. Nobody else, including other users, can see them. Only the anonymous list of your tracked ETFs is passed to the price robot.'],
        },
      },
      {
        id: 'effacer', tags: 'effacer supprimer réinitialiser données delete reset erase',
        q: { fr: 'Comment tout effacer ?', en: 'How do I erase everything?' },
        a: {
          fr: ['Paramètres › À propos › « Effacer toutes mes données ». Si vous êtes connecté, l’effacement est aussi appliqué sur vos autres appareils. Un bouton « Annuler » permet de revenir en arrière pendant quelques secondes.'],
          en: ['Settings › About › “Delete all my data”. If you are signed in, the erasure also applies to your other devices. An “Cancel” button lets you revert for a few seconds.'],
        },
      },
    ],
  },
  {
    id: 'affichage', icon: 'settings', title: { fr: 'Installation et affichage', en: 'Installation and display' },
    items: [
      {
        id: 'installer', tags: 'installer application écran accueil android iphone pc install home screen',
        q: { fr: 'Comment installer l’app sur mon téléphone ou mon PC ?', en: 'How do I install the app on my phone or PC?' },
        a: {
          fr: ['- Android : ouvrez l’adresse dans Chrome › menu ⋮ › « Installer l’application ».', '- iPhone : ouvrez-la dans Safari › Partager › « Sur l’écran d’accueil ».', '- PC : dans Chrome ou Edge, icône d’installation à droite de la barre d’adresse.', 'L’app est gratuite et ne passe par aucun store.'],
          en: ['- Android: open the address in Chrome › ⋮ menu › “Install app”.', '- iPhone: open it in Safari › Share › “Add to Home Screen”.', '- PC: in Chrome or Edge, install icon on the right of the address bar.', 'The app is free and does not go through any store.'],
        },
      },
      {
        id: 'theme', tags: 'thème sombre dark mode clair yeux couleurs theme',
        q: { fr: 'Comment passer en thème sombre ?', en: 'How do I switch to dark mode?' },
        a: {
          fr: ['Paramètres › Thème : Clair, Sombre, ou Système (suit le réglage du téléphone ou de l’ordinateur).'],
          en: ['Settings › Theme: Light, Dark, or System (follows the phone or computer setting).'],
        },
      },
      {
        id: 'langue', tags: 'langue anglais français language english',
        q: { fr: 'Changer de langue', en: 'Changing the language' },
        a: {
          fr: ['Paramètres › Langue : Français ou English. Le classeur Excel exporté reste en français.'],
          en: ['Settings › Language: Français or English. The exported Excel workbook stays in French.'],
        },
      },
    ],
  },
];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function AnswerBody({ lines }: { lines: string[] }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={'u' + out.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>); list = []; } };
  for (const l of lines) {
    if (l.startsWith('- ')) list.push(l.slice(2));
    else { flush(); out.push(<p key={'p' + out.length}>{l}</p>); }
  }
  flush();
  return <div className="faq-a">{out}</div>;
}

export function HelpScreen() {
  const route = useRoute();
  const en = lang === 'en';
  const [q, setQ] = useState(route.query.get('q') || '');
  const nq = norm(q.trim());
  const cats = useMemo(() => FAQ.map((c) => ({
    ...c,
    items: nq ? c.items.filter((it) => norm([it.q.fr, it.q.en, ...it.a.fr, ...it.a.en, it.tags || ''].join(' ')).includes(nq)) : c.items,
  })).filter((c) => c.items.length), [nq]);
  const count = cats.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="screen" data-screen="T0-04">
      <SubHeader title={en ? 'Help & guide' : 'Aide et guide'} fallback="/parametres" />
      <main className="content form-narrow" style={{ gap: 'var(--space-20)' }}>
        <p className="c-neutral" style={{ margin: 0 }}>
          {en
            ? 'Everything you need to understand and use PEAnalyze. Search with a keyword or browse the topics.'
            : 'Tout pour comprendre et utiliser PEAnalyze. Cherchez un mot-clé ou parcourez les thèmes.'}
        </p>
        <label className="search help-search" data-component="TextField.search">
          <Icon name="search" size={20} style={{ color: 'var(--text-neutral)' }} />
          <span className="sr-only">{en ? 'Search the help' : 'Rechercher dans l’aide'}</span>
          <input type="search" placeholder={en ? 'e.g. fees, target, sign-in, dark mode' : 'ex. frais, cible, connexion, thème sombre'} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {nq && <span className="t-caption c-moderate">{en ? `${count} result(s)` : `${count} résultat${count > 1 ? 's' : ''}`}</span>}
        {cats.map((c) => (
          <section key={c.id} aria-labelledby={'help-' + c.id} className="stack-8">
            <h2 id={'help-' + c.id} className="row overline c-neutral" style={{ gap: 'var(--space-8)', padding: '0 var(--space-4)' }}>
              <Icon name={c.icon} size={18} style={{ color: 'var(--primary-fg)' }} />{en ? c.title.en : c.title.fr}
            </h2>
            <div className="card" style={{ borderRadius: 'var(--radius-12)', padding: '0 var(--space-16)', gap: 0 }}>
              {c.items.map((it) => (
                <details key={it.id} className="faq" open={!!nq && count <= 3}>
                  <summary>{en ? it.q.en : it.q.fr}<Icon name="down" size={20} /></summary>
                  <AnswerBody lines={en ? it.a.en : it.a.fr} />
                </details>
              ))}
            </div>
          </section>
        ))}
        {!cats.length && (
          <p className="center c-moderate" style={{ padding: 'var(--space-24) 0' }}>
            {en ? 'No answer found for this search. Try another word.' : 'Aucune réponse pour cette recherche. Essayez un autre mot.'}
          </p>
        )}
        <div className="note" role="note">
          <Icon name="info" size={20} />
          <span>{en
            ? 'PEAnalyze is a tracking tool: it does not give investment advice and is not connected to your bank or broker.'
            : 'PEAnalyze est un outil de suivi : il ne donne pas de conseil en investissement et n’est relié ni à votre banque ni à votre courtier.'}</span>
        </div>
        <button type="button" className="btn btn-secondary block" onClick={() => navigate('/parametres', { replace: true })}>{en ? 'Back to settings' : 'Retour aux paramètres'}</button>
      </main>
    </div>
  );
}
