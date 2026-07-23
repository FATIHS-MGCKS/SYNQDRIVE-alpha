import type { BookingDetailDto, CustomerApiRecord } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import { normalizeBookingStatus } from '../../rental/components/bookings/bookingStatus';
import {
  bookingInstantToDateTimeLocal,
  isSameOrgLocalInstant,
  parseOrgDateTimeLocalValue,
} from '../../lib/datetime';
import {
  buildBookingUpdateCommand,
  bookingEditBaselineFromDetail,
  formatBookingMutationError,
  type BookingEditFormState,
} from '../../rental/lib/booking-commands';

export function customerDisplayName(c: CustomerApiRecord): string {
  if (c.name?.trim()) return c.name.trim();
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.email || c.id;
}

export function vehicleDisplayLabel(v: VehicleData): string {
  const name = [v.make, v.model].filter(Boolean).join(' ').trim() || v.model;
  return `${v.license} · ${name}`;
}

export function toLocalDateTimeInput(iso: string, timeZone: string): string {
  return bookingInstantToDateTimeLocal(iso, timeZone);
}

export function splitLocalDateTime(local: string): { date: string; time: string } {
  if (!local) return { date: '', time: '10:00' };
  const [date, timePart] = local.split('T');
  return { date: date ?? '', time: (timePart ?? '10:00').slice(0, 5) };
}

export function localDateTimeToIso(local: string, timeZone: string): string | null {
  return parseOrgDateTimeLocalValue(local, timeZone);
}

/** Compare persisted ISO instant with org-local datetime-local value (minute precision). */
export function isSameLocalInstant(iso: string, local: string, timeZone: string): boolean {
  return isSameOrgLocalInstant(iso, local, timeZone);
}

export function formatOperatorBookingError(message: string): { title: string; description: string } {
  const view = formatBookingMutationError(new Error(message));
  return { title: view.title, description: view.description };
}

export function buildOperatorBookingUpdateFromDetail(
  detail: BookingDetailDto,
  form: BookingEditFormState,
  timeZone: string,
) {
  const baseline = bookingEditBaselineFromDetail(detail);
  return buildBookingUpdateCommand(baseline, form, { allowVehicleChange: true, timeZone });
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
  'mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground focus:border-[color:var(--brand)] outline-none';

const TEXTAREA_CLASS =
  'mt-1 min-h-[96px] w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground resize-none focus:border-[color:var(--brand)] outline-none';

export const operatorBookingFieldClass = INPUT_CLASS;
export const operatorBookingTextareaClass = TEXTAREA_CLASS;
