import type { BookingDetailDto, CustomerApiRecord } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { normalizeBookingStatus } from '../../rental/components/bookings/bookingStatus';

export function customerDisplayName(c: CustomerApiRecord): string {
  if (c.name?.trim()) return c.name.trim();
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.email || c.id;
}

export function vehicleDisplayLabel(v: VehicleData): string {
  const name = [v.make, v.model].filter(Boolean).join(' ').trim() || v.model;
  return `${v.license} · ${name}`;
}

export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function splitLocalDateTime(local: string): { date: string; time: string } {
  if (!local) return { date: '', time: '10:00' };
  const [date, timePart] = local.split('T');
  return { date: date ?? '', time: (timePart ?? '10:00').slice(0, 5) };
}

export function localDateTimeToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Compare persisted ISO instant with a datetime-local value (minute precision). */
export function isSameLocalInstant(iso: string, local: string): boolean {
  const next = localDateTimeToIso(local);
  if (!next) return false;
  const a = new Date(iso).getTime();
  const b = new Date(next).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) < 60_000;
}

export function formatOperatorBookingError(message: string): { title: string; description: string } {
  const lower = message.toLowerCase();
  if (lower.includes('bereits gebucht') || lower.includes('vehicle_booking_overlap')) {
    return { title: 'Fahrzeug bereits gebucht', description: message };
  }
  if (lower.includes('nicht vermietbar') || lower.includes('rental_blocked')) {
    return { title: 'Fahrzeug blockiert', description: message };
  }
  if (lower.includes('health') && (lower.includes('nicht verfügbar') || lower.includes('unavailable'))) {
    return { title: 'Health-Prüfung nicht verfügbar', description: message };
  }
  if (
    lower.includes('kunde') &&
    (lower.includes('nicht freigegeben') ||
      lower.includes('nicht berechtigt') ||
      lower.includes('booking_blocked') ||
      lower.includes('confirmation_blocked'))
  ) {
    return { title: 'Kunde nicht berechtigt', description: message };
  }
  if (lower.includes('enddate must be after') || lower.includes('ungültig') || lower.includes('invalid booking')) {
    return { title: 'Ungültiger Zeitraum', description: message };
  }
  if (lower.includes('no-show') || lower.includes('no_show')) {
    return { title: 'No-Show nicht möglich', description: message };
  }
  return { title: 'Aktion fehlgeschlagen', description: message };
}

export function canOperatorMarkNoShow(detail: BookingDetailDto): { allowed: boolean; reason?: string } {
  const status = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  if (status !== 'confirmed') {
    return { allowed: false, reason: 'No-Show nur bei bestätigten Buchungen möglich' };
  }
  if (detail.handover.pickup) {
    return { allowed: false, reason: 'Pickup bereits erfasst' };
  }
  const startMs = new Date(detail.core.startDate).getTime();
  if (Number.isNaN(startMs) || startMs > Date.now()) {
    return { allowed: false, reason: 'Geplanter Abholzeitpunkt liegt noch in der Zukunft' };
  }
  return { allowed: true };
}

const INPUT_CLASS =
  'mt-1 h-12 w-full rounded-xl border border-border bg-card px-3 text-base text-foreground focus:border-[color:var(--brand)] outline-none';

const TEXTAREA_CLASS =
  'mt-1 min-h-[96px] w-full rounded-xl border border-border bg-card px-3 py-3 text-base text-foreground resize-none focus:border-[color:var(--brand)] outline-none';

export const operatorBookingFieldClass = INPUT_CLASS;
export const operatorBookingTextareaClass = TEXTAREA_CLASS;
