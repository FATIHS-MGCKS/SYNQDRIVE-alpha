import type { BookingDetailDto } from '../../../lib/api';
import type { BookingEditBaseline, BookingEditFormState } from './booking-edit-form.types';

export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function bookingEditBaselineFromDetail(detail: BookingDetailDto): BookingEditBaseline {
  return {
    bookingId: detail.core.bookingId,
    updatedAt: detail.core.updatedAt,
    startDate: detail.core.startDate,
    endDate: detail.core.endDate,
    notes: detail.core.notes,
    kmIncluded: detail.core.kmIncluded,
    pickupStationId: detail.core.pickupStationId,
    returnStationId: detail.core.returnStationId,
    customerId: detail.customer.customerId,
    vehicleId: detail.vehicle.vehicleId,
    insuranceOptions: detail.core.insuranceOptions ?? [],
  };
}

export function bookingEditFormFromBaseline(baseline: BookingEditBaseline): BookingEditFormState {
  const sameReturn =
    !baseline.pickupStationId ||
    !baseline.returnStationId ||
    baseline.pickupStationId === baseline.returnStationId;

  return {
    startLocal: toLocalDateTimeInput(baseline.startDate),
    endLocal: toLocalDateTimeInput(baseline.endDate),
    notes: baseline.notes ?? '',
    kmIncluded: baseline.kmIncluded != null ? String(baseline.kmIncluded) : '',
    pickupStationId: baseline.pickupStationId ?? '',
    returnStationId: baseline.returnStationId ?? '',
    sameReturnStation: sameReturn,
    customerId: baseline.customerId ?? null,
    vehicleId: baseline.vehicleId ?? null,
    insuranceOptions: baseline.insuranceOptions ?? [],
    paymentIntentLabel: null,
  };
}

export function bookingEditFormFromDetail(detail: BookingDetailDto): BookingEditFormState {
  return bookingEditFormFromBaseline(bookingEditBaselineFromDetail(detail));
}
