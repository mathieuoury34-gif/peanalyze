// Rappel mensuel « investir » : fonctions pures, testées dans tests/reminder.test.ts.
import type { AppData } from './types';

export interface ReminderState {
  day: number; // jour du mois choisi (1–28)
  dueDate: string; // date du rappel pour le mois en cours
  boughtThisMonth: boolean; // un achat est déjà enregistré ce mois-ci
  due: boolean; // à faire maintenant : jour atteint et aucun achat ce mois-ci
  nextDate: string; // prochain rappel (ce mois-ci s'il n'est pas encore passé, sinon le mois suivant)
  daysUntil: number; // jours avant le prochain rappel (0 = aujourd'hui)
}

const pad = (n: number) => String(n).padStart(2, '0');

/** null si le rappel est désactivé. `today` au format ISO (date locale). */
export function reminderState(data: AppData, today: string): ReminderState | null {
  const day = Math.round(data.settings.reminderDay || 0);
  if (day < 1 || day > 28) return null;
  const ym = today.slice(0, 7);
  const dueDate = `${ym}-${pad(day)}`;
  const bought = data.transactions.some((t) => t.quantity > 0 && t.date.startsWith(ym));
  const due = today >= dueDate && !bought;
  let nextDate = dueDate;
  if (today > dueDate || (today === dueDate && bought)) {
    let y = +today.slice(0, 4), m = +today.slice(5, 7) + 1;
    if (m > 12) { m = 1; y++; }
    nextDate = `${y}-${pad(m)}-${pad(day)}`;
  }
  const daysUntil = Math.round((Date.parse(nextDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
  return { day, dueDate, boughtThisMonth: bought, due, nextDate, daysUntil };
}
