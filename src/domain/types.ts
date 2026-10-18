// Modèle de données de PEAnalyze (brief §6 + HANDOFF.md)

export type Replication = 'Physique' | 'Synthétique' | 'Echantillonné';
export type Distribution = 'Capitalisant' | 'Distribuant';

export interface WeightItem {
  label: string;
  weight: number; // 0–1
}

/** Un point d'historique : [date ISO 'YYYY-MM-DD', cours de clôture] */
export type PricePoint = [string, number];

/** Origine d'une répartition sectorielle/géographique : fiche mensuelle de l'ETF, fiche d'un ETF suivant le même indice, ou justETF (indicatif). */
export interface CompMeta {
  kind: 'fiche' | 'indice' | 'justetf';
  date: string; // ISO, date des données
  from?: string; // ISIN de l'ETF dont provient la fiche
  fromName?: string; // nom de cet ETF (kind « indice »)
}

export interface Etf {
  id: string; // = ticker (ESE, PUST…)
  index: string; // nom court de l'indice (S&P 500)
  name: string; // nom complet de l'ETF
  isin: string;
  ticker: string;
  exchange: string;
  googleSymbol?: string;
  category: string;
  peaEligible: boolean;
  lastPrice: number;
  lastPriceDate?: string; // date ISO du dernier cours
  ter: number; // frais de gestion (0,0013 = 0,13 %)
  aumMEur: number;
  replication: Replication;
  distribution: Distribution;
  inStrategy: boolean;
  sectors: WeightItem[];
  countries: WeightItem[];
  comp?: CompMeta;
  priceHistory: PricePoint[];
}

export interface CatalogEtf {
  index: string;
  name: string;
  isin: string;
  ticker: string; // mnémonique Euronext Paris ('' si non coté à Paris)
  exchange: string;
  category: string;
  peaEligible: boolean;
  ter: number;
  aumMEur: number | null;
  inceptionYear: number | null;
  holdingsCount: number | null;
  esg: boolean;
  replication: Replication | null; // null = non renseigné
  distribution: Distribution | null;
  unitPrice: number | null; // cours indicatif (date : CATALOG_DATE)
  note?: string;
  sectors?: WeightItem[]; // secteurs de l'indice (GICS, fiche mensuelle de l'émetteur)
  countries?: WeightItem[];
  comp?: CompMeta;
}

export interface Deposit {
  id: string;
  date: string; // ISO
  amount: number; // négatif = retrait du PEA
}

/** Achat (quantité > 0) ou vente (quantité < 0, coût de revient sorti au PRU). */
export interface Transaction {
  id: string;
  date: string; // ISO
  etfId: string;
  unitPrice: number;
  quantity: number;
  grossAmount: number; // débit courtier, frais inclus (négatif pour une vente : somme créditée, frais déduits)
  fees: number; // grossAmount − unitPrice × quantity
  feeRefund: number;
}

export interface DcaPhase {
  fromYear: number;
  monthly: number;
}

export interface Simulation {
  initialCapital: number;
  horizonYears: number;
  annualRate: number; // 0,085 = 8,5 %
  dcaPhases: DcaPhase[];
}

/** Vente envisagée dans un plan : tout l'ETF, un nombre de parts ou une fraction des parts. */
export interface PlanSell {
  etfId: string;
  kind: 'all' | 'qty' | 'pct';
  value: number; // parts (qty) ou fraction 0–1 (pct) ; ignoré pour « all »
}

/** Scénario « et si… » : ventes, versement, retrait et stratégie visée. Ne modifie jamais le portefeuille réel. */
export interface Plan {
  id: string;
  name: string;
  createdAt: string; // ISO date-heure
  sells: PlanSell[];
  deposit: number; // nouveau versement prévu (€)
  withdraw: number; // somme que l'on retirerait du PEA (€)
  monthly: number; // versement mensuel habituel, pour estimer la convergence sans vendre
  targets: Record<string, number> | null; // clé ETF (identifiant ou ticker/ISIN du catalogue) → 0–1 ; null = stratégie actuelle de l'app
}

/** Objectif d'épargne : un capital à atteindre à une date. */
export interface Goal {
  id: string;
  name: string;
  target: number; // capital visé (€)
  date: string; // ISO, échéance
  createdAt: string; // ISO date-heure
}

export type PriceRefresh = 'open' | 'hour' | 'manual';

export interface Settings {
  apiKey: string;
  priceProvider: 'server' | 'csv';
  csvUrl: string;
  priceRefresh: PriceRefresh;
  priceFreq: 1 | 2; // actualisations par jour ouvré demandées au robot des cours
  peaOpeningDate: string; // ISO ou ''
  lastPriceUpdate: string; // ISO date-heure ou ''
  cashBalance: number | null; // null = calculé
  feePerOrder: number;
  etfColors?: Record<string, string>; // couleur choisie par ETF (hex sans #) ; sinon défaut selon l'ordre de Mes ETF
  reminderDay?: number; // rappel mensuel « investir » : jour du mois (1–28), 0/absent = désactivé
  benchmarkId?: string; // ETF de référence pour la comparaison (Analyse) ; absent = 1er ETF suivi
  brokerId?: string; // courtier choisi (grille de frais) ; absent ou 'custom' = grille saisie ci-dessous
  feePct?: number; // grille saisie : frais en % du montant de l'ordre (0,005 = 0,5 %)
  annualFee?: number; // grille saisie : tenue de compte / droits de garde fixes par an (€)
  brokerEtf?: Record<string, Record<string, 'yes' | 'no'>>; // courtier → ETF → disponible / absent, d'après la vérification de l'utilisateur ; absent = à vérifier
  annualPct?: number; // grille saisie : droits de garde en % de la valeur du portefeuille par an
}

export interface AppData {
  version: number;
  updatedAt: string; // ISO date-heure de la dernière modification
  etfs: Etf[];
  myEtfIds: string[]; // ordre de « Mes ETF »
  catalog: CatalogEtf[];
  deposits: Deposit[];
  transactions: Transaction[];
  targetAllocation: Record<string, number>; // 0–1
  simulation: Simulation;
  plans?: Plan[]; // scénarios du Simulateur › Plans
  goals?: Goal[]; // objectifs d'épargne
  settings: Settings;
}

export interface Position {
  etfId: string;
  quantity: number;
  costBasis: number; // Σ (gross − refund)
  pru: number;
  price: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number; // plus-value déjà réalisée par des ventes de cette ligne
  weightActual: number; // 0–1
  weightTarget: number; // 0–1
  gapPts: number; // (réel − cible) × 100
  targetValue: number;
  targetQuantity: number;
  toBuy: number;
  inStrategy: boolean;
}

export interface PortfolioSummary {
  totalDeposited: number;
  investedInSecurities: number;
  cashBalance: number;
  securitiesValue: number;
  totalValue: number;
  unrealizedPnl: number; // valorisation − montant net épargné : plus-value totale (latente + réalisée)
  realizedPnl: number; // part déjà réalisée par des ventes
  globalReturnPct: number;
  annualizedReturnXirr: number | null;
  feesPaid: number;
  feesRefunded: number;
  feesNet: number;
  avgFeePct: number;
  refundedShare: number;
  totalQuantity: number;
  lines: number;
  valuationDate: string;
}
