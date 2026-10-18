// Courtiers : grilles de frais indicatives (PEA, ordres sur Euronext Paris) et calcul du coût d'une suite d'ordres.
// Fonctions pures, testées dans tests/brokers.test.ts. Les grilles ci-dessous sont relevées sur des sites comparateurs
// (jamais sur les brochures officielles) : elles changent souvent et doivent être vérifiées chez le courtier.
import type { AppData, Settings } from './types';

/** Frais d'un ordre dont le montant est ≤ upTo : fixe + pct × montant. */
export interface FeeTier { upTo: number; fixed: number; pct: number }

export interface Broker {
  id: string;
  name: string;
  /** Date du relevé des tarifs (AAAA-MM-JJ). */
  checked: string;
  url: string;
  /** Particularités à connaître (clé de traduction : texte français). */
  note: string;
  tiers: FeeTier[];
  minFee?: number;
  /** Les frais ne dépassent pas pct × montant pour les ordres ≤ upTo (plafond sur petits montants). */
  cap?: { pct: number; upTo: number };
  /** Montant minimal d'un ordre accepté par le courtier. */
  minOrder?: number;
  /** Achats à 0 € pour les ETF d'un émetteur (nom contenant `issuer`), à partir de `minOrder`, jusqu'à `until`. */
  freeBuy?: { minOrder: number; issuer: string; until?: string };
  /** Le premier ordre du mois, s'il ne dépasse pas upTo, est gratuit. */
  freeFirstPerMonth?: { upTo: number };
  /** Frais d'un ordre passé par un plan d'investissement programmé. */
  scheduledFee?: number;
  /** Tenue de compte / droits de garde : fixe par an + pourcentage de la valeur du portefeuille. */
  annualFixed: number;
  annualPct: number;
  /** Frais d'inactivité : prélevés si moins de minOrders ordres dans l'année. */
  inactivity?: { fee: number; minOrders: number };
  /** Offre promotionnelle relevée (clé de traduction : texte français). Après `until`, elle est affichée comme terminée. */
  offer?: { text: string; until?: string };
  /** Frais de transfert entrant pris en charge par le courtier (€ au plus), tant que l'offre court. */
  transferRefund?: number;
  /** Catalogue d'ETF éligibles au PEA : `limited` = sélection restreinte, à vérifier ETF par ETF. */
  catalogue?: { limited: boolean; note: string };
}

const INF = Number.POSITIVE_INFINITY;
const CHECKED = '2026-10-18';

export const BROKERS: Broker[] = [
  {
    id: 'boursobank', name: 'BoursoBank (offre Découverte)', checked: CHECKED, url: 'https://www.boursobank.com/bourse',
    note: 'Achats à 0 € sur une sélection d’ETF iShares (dont le WPEA) à partir de 100 € par ordre ; les ETF des autres émetteurs (Amundi, etc.) paient 0,5 %. Montant minimal : 200 € par ordre sur ETF. Aucun droit de garde.',
    tiers: [{ upTo: 500, fixed: 1.99, pct: 0 }, { upTo: INF, fixed: 0, pct: 0.005 }],
    cap: { pct: 0.005, upTo: 500 }, minOrder: 200, freeBuy: { minOrder: 100, issuer: 'ishares' }, annualFixed: 0, annualPct: 0,
    transferRefund: 3000,
    offer: { text: 'Frais de transfert remboursés (jusqu’à 3 000 € TTC) pour un premier transfert de PEA, à demander dans les 3 mois. La prime peut être reprise si le PEA est clôturé ou si vous passez moins de 5 ordres en 12 mois. Dates de validité non indiquées par le courtier.' },
  },
  {
    id: 'traderepublic', name: 'Trade Republic', checked: CHECKED, url: 'https://traderepublic.com/fr-fr/pea',
    note: '1 € par ordre (2 € si vous choisissez le lieu d’exécution), plafonné à 0,5 % sous 200 €. Plans d’investissement programmés gratuits. Pas de droit de garde. Parts entières seulement sur le PEA ; le PEA entier doit être transféré.',
    tiers: [{ upTo: INF, fixed: 1, pct: 0 }], cap: { pct: 0.005, upTo: 200 }, scheduledFee: 0, annualFixed: 0, annualPct: 0,
    offer: { text: 'Aucune offre de transfert relevée : les frais de sortie de l’ancien courtier ne sont pas remboursés systématiquement (des offres ponctuelles existent).' },
    catalogue: { limited: true, note: 'Environ 150 ETF éligibles au PEA seulement : vérifiez que les vôtres y sont.' },
  },
  {
    id: 'fortuneo', name: 'Fortuneo (formule Starter)', checked: CHECKED, url: 'https://www.fortuneo.fr/bourse',
    note: 'Premier ordre du mois gratuit jusqu’à 500 €, puis 0,35 %. Offre Amundi : courtage remboursé sur les achats d’ETF Amundi de 500 € à 100 000 € jusqu’au 31/12/2026.',
    tiers: [{ upTo: INF, fixed: 0, pct: 0.0035 }], freeFirstPerMonth: { upTo: 500 },
    freeBuy: { minOrder: 500, issuer: 'amundi', until: '2026-12-31' }, annualFixed: 0, annualPct: 0,
    offer: { text: 'Courtage remboursé sur les achats d’ETF Amundi de 500 € à 100 000 € (sélection d’ETF) ; 100 ordres offerts aux nouveaux clients PEA selon un comparateur, à vérifier. Aucune offre de transfert relevée.', until: '2026-12-31' },
    catalogue: { limited: true, note: 'L’offre Amundi ne porte que sur une sélection d’ETF.' },
  },
  {
    id: 'boursedirect', name: 'Bourse Direct', checked: CHECKED, url: 'https://www.boursedirect.fr/fr/tarifs',
    note: 'Barème par paliers, très bas sur les gros ordres. Montant minimal : 80 € par ordre. ETF du programme d’investissement programmé à 0 €. 6 € de frais à la clôture.',
    tiers: [{ upTo: 198, fixed: 0, pct: 0.005 }, { upTo: 500, fixed: 0.99, pct: 0 }, { upTo: 1000, fixed: 1.9, pct: 0 }, { upTo: 2000, fixed: 2.9, pct: 0 }, { upTo: 4400, fixed: 3.8, pct: 0 }, { upTo: INF, fixed: 0, pct: 0.0009 }],
    minOrder: 80, scheduledFee: 0, annualFixed: 0, annualPct: 0,
    offer: { text: 'Premier ordre du mois sur un ETF Amundi remboursé (de 200 € à 100 000 €) selon un comparateur de janvier 2026 ; frais plafonnés à 0,99 € sur l’iShares WPEA. Conditions et dates à vérifier. Aucune offre de transfert relevée.' },
  },
  {
    id: 'xtb', name: 'XTB', checked: CHECKED, url: 'https://www.xtb.com/fr/pea',
    note: '0 % de commission jusqu’à 100 000 € par mois sur le PEA. Montant minimal : 10 € par ordre. Vérifiez que vos ETF sont disponibles.',
    tiers: [{ upTo: INF, fixed: 0, pct: 0 }], minOrder: 10, annualFixed: 0, annualPct: 0,
    offer: { text: 'Aucune offre de transfert ni prime relevée sur les sites consultés.' },
    catalogue: { limited: true, note: 'Le catalogue ETF du PEA est à vérifier ETF par ETF.' },
  },
  {
    id: 'ca-initial', name: 'Crédit Agricole (InvestStore Initial)', checked: CHECKED, url: 'https://www.credit-agricole.fr/particulier/epargne/bourse.html',
    note: 'Courtage de 0,50 % par ordre en ligne, droits de garde d’environ 0,30 % de la valeur par an (0,20 % à 0,40 % selon les sources et la Caisse). Les 39 Caisses régionales ont chacune leur grille : saisissez la vôtre dans « Autre courtier / ma propre grille » si elle diffère. Transfert sortant : 15 € par ligne, 150 € au plus.',
    tiers: [{ upTo: INF, fixed: 0, pct: 0.005 }], annualFixed: 0, annualPct: 0.003,
  },
  {
    id: 'ca-integral', name: 'Crédit Agricole (InvestStore Intégral)', checked: CHECKED, url: 'https://www.credit-agricole.fr/particulier/epargne/bourse.html',
    note: 'Courtage dégressif : 0,48 % jusqu’à 500 €, 0,18 % de 501 à 1 000 €, 0,12 % au-delà. Abonnement d’environ 96 € par an, offert à partir de 12 ordres par an ; droits de garde offerts dans la plupart des Caisses, pas toutes. Chaque Caisse régionale a sa grille : vérifiez la vôtre.',
    tiers: [{ upTo: 500, fixed: 0, pct: 0.0048 }, { upTo: 1000, fixed: 0, pct: 0.0018 }, { upTo: INF, fixed: 0, pct: 0.0012 }],
    annualFixed: 0, annualPct: 0, inactivity: { fee: 96, minOrders: 12 },
  },
  {
    id: 'saxo', name: 'Saxo Banque (barème Classique)', checked: CHECKED, url: 'https://www.home.saxo/fr-fr/rates-and-conditions',
    note: '0,08 % par ordre, minimum 2 €.',
    tiers: [{ upTo: INF, fixed: 0, pct: 0.0008 }], minFee: 2, annualFixed: 0, annualPct: 0,
    transferRefund: 150,
    offer: { text: 'Transfert remboursé jusqu’à 150 € ; achats sans frais sur 150 ETF Amundi (comparateur de janvier 2026, conditions non détaillées : à vérifier).' },
  },
];

/** Identifiant du courtier « personnalisé » : grille saisie dans les réglages (par défaut, frais fixes par ordre). */
export const CUSTOM_BROKER = 'custom';

export function customBroker(s: Pick<Settings, 'feePerOrder' | 'feePct' | 'annualFee' | 'annualPct'>): Broker {
  return {
    id: CUSTOM_BROKER, name: 'Mon courtier (grille saisie)', checked: '', url: '',
    note: 'Grille saisie dans les réglages : chaque banque, et même chaque Caisse régionale, a la sienne.',
    tiers: [{ upTo: INF, fixed: Math.max(0, s.feePerOrder || 0), pct: Math.max(0, s.feePct || 0) }],
    annualFixed: Math.max(0, s.annualFee || 0), annualPct: Math.max(0, s.annualPct || 0),
  };
}

export function brokerOf(s: Settings): Broker {
  return BROKERS.find((b) => b.id === s.brokerId) ?? customBroker(s);
}

export interface FeeOpts { side?: 'buy' | 'sell'; etfName?: string; scheduled?: boolean; today?: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Frais de courtage d'un ordre de `amount` euros (montant brut hors frais). */
export function orderFee(b: Broker, amount: number, o: FeeOpts = {}): number {
  if (!(amount > 0)) return 0;
  const side = o.side ?? 'buy';
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const fb = b.freeBuy;
  if (side === 'buy' && fb && amount >= fb.minOrder && (!fb.until || today <= fb.until) && (o.etfName ?? '').toLowerCase().includes(fb.issuer)) return 0;
  if (o.scheduled && b.scheduledFee !== undefined) return b.scheduledFee;
  const tier = b.tiers.find((x) => amount <= x.upTo) ?? b.tiers[b.tiers.length - 1];
  let f = tier.fixed + tier.pct * amount;
  if (b.minFee !== undefined) f = Math.max(f, b.minFee);
  if (b.cap && amount <= b.cap.upTo) f = Math.min(f, b.cap.pct * amount);
  return round2(f);
}

/** Fonction de frais du courtier choisi dans les réglages ; l'ETF (id) sert aux offres propres à un émetteur. */
export type FeeFn = (amount: number, o?: { etfId?: string; side?: 'buy' | 'sell'; scheduled?: boolean }) => number;

export function feeFnOf(data: AppData): FeeFn {
  const b = brokerOf(data.settings);
  const name = (id?: string) => {
    if (!id) return '';
    const e = data.etfs.find((x) => x.id === id);
    if (e) return e.name;
    const c = data.catalog.find((x) => x.ticker === id);
    return c?.name ?? '';
  };
  return (amount, o = {}) => orderFee(b, amount, { side: o.side, scheduled: o.scheduled, etfName: name(o.etfId) });
}

export interface CostOrder { date: string; amount: number; side: 'buy' | 'sell'; etfName?: string; scheduled?: boolean }

/**
 * Frais de chaque ordre, dans l'ordre reçu. Le « premier ordre du mois gratuit » s'applique au plus ancien ordre du mois.
 * `byDate` : une offre à date limite est jugée à la date de chaque ordre (audit du journal) plutôt qu'à `today`.
 */
export function orderFees(b: Broker, orders: CostOrder[], opts: { today?: string; byDate?: boolean } = {}): number[] {
  const idx = orders.map((_, i) => i).sort((x, y) => (orders[x].date < orders[y].date ? -1 : orders[x].date > orders[y].date ? 1 : x - y));
  const out = new Array<number>(orders.length).fill(0);
  const usedMonth = new Set<string>();
  for (const i of idx) {
    const o = orders[i];
    let f = orderFee(b, o.amount, { side: o.side, etfName: o.etfName, scheduled: o.scheduled, today: opts.byDate ? o.date : opts.today });
    const m = o.date.slice(0, 7);
    if (b.freeFirstPerMonth && o.side === 'buy' && o.amount <= b.freeFirstPerMonth.upTo && !usedMonth.has(m)) { usedMonth.add(m); f = 0; }
    out[i] = f;
  }
  return out;
}

export interface YearCost {
  brokerage: number;
  custody: number;
  inactivity: number;
  total: number;
  orders: number;
  freeOrders: number;
  /** Ordres inférieurs au montant minimal accepté par le courtier. */
  belowMin: number;
}

/** Coût annuel d'un courtier pour une suite d'ordres représentant une année, et un portefeuille de `portfolioValue` euros. */
export function yearCost(b: Broker, orders: CostOrder[], portfolioValue: number, today?: string): YearCost {
  const fees = orderFees(b, orders, { today });
  let brokerage = 0, freeOrders = 0, belowMin = 0;
  orders.forEach((o, i) => {
    if (fees[i] === 0) freeOrders++;
    if (b.minOrder && o.amount < b.minOrder) belowMin++;
    brokerage += fees[i];
  });
  const custody = b.annualFixed + b.annualPct * Math.max(0, portfolioValue);
  const inactivity = b.inactivity && orders.length < b.inactivity.minOrders ? b.inactivity.fee : 0;
  return { brokerage: round2(brokerage), custody: round2(custody), inactivity, total: round2(brokerage + custody + inactivity), orders: orders.length, freeOrders, belowMin };
}

/** Une offre à date limite est-elle encore valable ? */
export const offerActive = (b: Broker, today = new Date().toISOString().slice(0, 10)) => !!b.offer && (!b.offer.until || today <= b.offer.until);
/** Frais de transfert que le courtier prend en charge aujourd'hui (€). */
export const transferRefundOf = (b: Broker, today?: string) => (b.transferRefund && (!b.offer?.until || offerActive(b, today)) ? b.transferRefund : 0);

// ---- fraîcheur des tarifs
export const STALE_DAYS = 183;
export interface WatchItem { checkedAt?: string; changedAt?: string; error?: string }
export interface TariffAlert {
  /** Âge du relevé en jours ; null pour une grille saisie à la main. */
  days: number | null;
  stale: boolean;
  /** Le robot a vu la page tarifaire changer après la date du relevé. */
  changedOn?: string;
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export function tariffAlert(b: Broker, watch?: WatchItem, today = new Date().toISOString().slice(0, 10)): TariffAlert {
  if (!b.checked) return { days: null, stale: false };
  const days = Math.max(0, dayDiff(b.checked, today));
  const changedOn = watch?.changedAt && watch.changedAt > b.checked ? watch.changedAt : undefined;
  return { days, stale: days > STALE_DAYS, changedOn };
}

/** Frais de transfert sortant d'un PEA : environ 15 € par ligne, 150 € au plus (plafonds indiqués par les sources consultées). */
export function transferOutCost(lines: number): number {
  return Math.min(150, 15 * Math.max(0, lines));
}
