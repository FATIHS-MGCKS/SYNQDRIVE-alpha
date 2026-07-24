/**
 * Controlled calendar features — no external holiday API.
 * Source: German federal public holidays (bundesweit), static table.
 */

export const CONTROLLED_HOLIDAY_SOURCE_VERSION = 'de-federal-holidays-v1';

/** Fixed-date federal holidays (month-day). Easter-based holidays computed separately. */
const FIXED_DE_FEDERAL: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: 'Neujahr' },
  { month: 5, day: 1, name: 'Tag der Arbeit' },
  { month: 10, day: 3, name: 'Tag der Deutschen Einheit' },
  { month: 12, day: 25, name: 'Erster Weihnachtstag' },
  { month: 12, day: 26, name: 'Zweiter Weihnachtstag' },
];

/** Anonymous Gregorian algorithm for Easter Sunday (valid 1900–2099). */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function buildHolidaySetForYear(year: number): Set<string> {
  const set = new Set<string>();
  for (const h of FIXED_DE_FEDERAL) {
    const mm = String(h.month).padStart(2, '0');
    const dd = String(h.day).padStart(2, '0');
    set.add(`${year}-${mm}-${dd}`);
  }
  const easter = easterSunday(year);
  set.add(addDays(year, easter.month, easter.day, -2)); // Karfreitag
  set.add(addDays(year, easter.month, easter.day, 1)); // Ostermontag
  set.add(addDays(year, easter.month, easter.day, 39)); // Christi Himmelfahrt
  set.add(addDays(year, easter.month, easter.day, 50)); // Pfingstmontag
  return set;
}

const HOLIDAY_CACHE = new Map<number, Set<string>>();

export function isControlledPublicHoliday(dateYmd: string): boolean {
  const year = Number(dateYmd.slice(0, 4));
  if (!HOLIDAY_CACHE.has(year)) {
    HOLIDAY_CACHE.set(year, buildHolidaySetForYear(year));
  }
  return HOLIDAY_CACHE.get(year)!.has(dateYmd);
}

export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'AUTUMN';

export function resolveSeason(month: number): Season {
  if (month === 12 || month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'AUTUMN';
}

export function parseObservationDateParts(dateYmd: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateYmd.split('-').map(Number);
  return { year, month, day };
}

export function resolveWeekday(dateYmd: string): number {
  const { year, month, day } = parseObservationDateParts(dateYmd);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
