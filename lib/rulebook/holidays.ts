/**
 * Court calendars, for s.4 of the Limitation Act.
 *
 * "Where the prescribed period for any suit, appeal or application expires on a
 * day when the court is closed, the suit, appeal or application may be
 * instituted on the day that the court reopens."
 *
 * A limitation tool that ignores s.4 will tell an advocate they are one day
 * late when they are not, or that they have a day in hand when the Registry
 * counter is shut. Both are damaging, so the calendar is real data, listed
 * below, and the UI states which calendar year it covers.
 *
 * These lists cover the gazetted closed days most likely to fall at the end of
 * a limitation period. They are NOT a complete court calendar — vacations,
 * local holidays and specially notified closures change year to year. Where the
 * expiry date is close to one of these, PARAM says so and tells the advocate to
 * confirm against the court's published calendar. It never treats its own list
 * as exhaustive.
 */

export const CALENDAR_YEARS = [2025, 2026];

/** Gazetted holidays common to the Supreme Court and the Delhi High Court. */
const COMMON_HOLIDAYS: string[] = [
  // 2025
  "2025-01-26", // Republic Day
  "2025-03-14", // Holi
  "2025-03-31", // Id-ul-Fitr
  "2025-04-10", // Mahavir Jayanti
  "2025-04-18", // Good Friday
  "2025-05-12", // Buddha Purnima
  "2025-06-07", // Id-ul-Zuha
  "2025-08-15", // Independence Day
  "2025-08-16", // Janmashtami
  "2025-10-02", // Gandhi Jayanti / Dussehra
  "2025-10-20", // Diwali
  "2025-11-05", // Guru Nanak Jayanti
  "2025-12-25", // Christmas
  // 2026
  "2026-01-26", // Republic Day
  "2026-03-04", // Holi
  "2026-03-21", // Id-ul-Fitr
  "2026-04-03", // Good Friday
  "2026-05-01", // Buddha Purnima
  "2026-05-27", // Id-ul-Zuha
  "2026-08-15", // Independence Day
  "2026-09-04", // Janmashtami
  "2026-10-02", // Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-11-08", // Diwali
  "2026-11-24", // Guru Nanak Jayanti
  "2026-12-25", // Christmas
];

const HOLIDAYS: Record<string, Set<string>> = {
  SUPREME_COURT: new Set(COMMON_HOLIDAYS),
  DELHI_HIGH_COURT: new Set(COMMON_HOLIDAYS),
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Saturday, Sunday, or a listed gazetted holiday. */
export function isCourtClosed(courtId: string, d: Date): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return true;
  return HOLIDAYS[courtId]?.has(iso(d)) ?? false;
}

export function nextWorkingDay(courtId: string, d: Date): Date {
  const next = new Date(d.getTime());
  // Bounded so a bad calendar can never spin forever.
  for (let i = 0; i < 30; i++) {
    next.setUTCDate(next.getUTCDate() + 1);
    if (!isCourtClosed(courtId, next)) return next;
  }
  return next;
}

/** True when our calendar does not cover the year in question. */
export function calendarCovers(d: Date): boolean {
  return CALENDAR_YEARS.includes(d.getUTCFullYear());
}
