/** Display ↔ storage formatting for document extraction review fields. */

export type ExtractionFieldType = 'text' | 'date' | 'currency' | 'multiline';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveDateLocale(locale?: string): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'en') return 'en-GB';
  return locale && locale.includes('-') ? locale : 'de-DE';
}

export function formatIsoDateForDisplay(iso: string | null | undefined, locale = 'de-DE'): string {
  if (!iso || !ISO_DATE.test(iso.trim())) return iso?.trim() ?? '';
  const [y, m, d] = iso.trim().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function parseDisplayDateToIso(display: string, locale = 'de-DE'): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  if (ISO_DATE.test(trimmed)) return trimmed;

  const deMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const [, d, m, y] = deMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  if (locale.startsWith('de')) {
    return null;
  }
  return trimmed;
}

export function formatCentsForDisplay(cents: unknown, locale = 'de-DE', currency = 'EUR'): string {
  if (cents == null || cents === '') return '';
  const raw = typeof cents === 'number' ? cents : Number(String(cents).replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (!Number.isFinite(raw)) return String(cents);
  const valueCents = raw >= 100 || Number.isInteger(raw) ? raw : Math.round(raw * 100);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(valueCents / 100);
  } catch {
    return `${(valueCents / 100).toFixed(2).replace('.', ',')} €`;
  }
}

export function parseCurrencyDisplayToCents(display: string): number | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/[€$£\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const major = Number(normalized);
  if (!Number.isFinite(major)) return null;
  return Math.round(major * 100);
}

export function normalizeLicensePlate(plate: string): string {
  return plate.toUpperCase().replace(/[-–—]/g, ' ').replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, '').trim();
}

export interface VehiclePlateOption {
  id: string;
  licensePlate?: string | null;
}

export function findVehicleIdByPlate<T extends VehiclePlateOption>(
  vehicles: T[],
  plate: string | null | undefined,
): string | null {
  if (!plate?.trim()) return null;
  const normalized = normalizeLicensePlate(plate);
  if (!normalized) return null;
  for (const v of vehicles) {
    if (v.licensePlate && normalizeLicensePlate(v.licensePlate) === normalized) {
      return v.id;
    }
  }
  for (const v of vehicles) {
    if (!v.licensePlate) continue;
    const stored = normalizeLicensePlate(v.licensePlate);
    if (stored && (normalized.includes(stored) || stored.includes(normalized)) && normalized.length >= 4) {
      return v.id;
    }
  }
  return null;
}
