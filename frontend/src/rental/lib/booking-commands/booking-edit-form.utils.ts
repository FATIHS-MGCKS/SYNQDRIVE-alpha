import type { BookingDetailDto } from '../../../lib/api';
import {
  bookingInstantToDateTimeLocal,
  isSameOrgLocalInstant,
  parseOrgDateTimeLocalValue,
} from '../../../lib/datetime';
import type { BookingEditBaseline, BookingEditFormState } from './booking-edit-form.types';

export function toLocalDateTimeInput(iso: string, timeZone: string): string {
  return bookingInstantToDateTimeLocal(iso, timeZone);
}

export function localDateTimeToIso(local: string, timeZone: string): string | null {
  return parseOrgDateTimeLocalValue(local, timeZone);
}

/** Compare persisted ISO instant with org-local datetime-local value (minute precision). */
export function isSameLocalInstant(iso: string, local: string, timeZone: string): boolean {
  return isSameOrgLocalInstant(iso, local, timeZone);
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

export function bookingEditFormFromBaseline(
  baseline: BookingEditBaseline,
  timeZone: string,
): BookingEditFormState {
  const sameReturn =
    !baseline.pickupStationId ||
    !baseline.returnStationId ||
    baseline.pickupStationId === baseline.returnStationId;

  return {
    startLocal: toLocalDateTimeInput(baseline.startDate, timeZone),
    endLocal: toLocalDateTimeInput(baseline.endDate, timeZone),
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

export function bookingEditFormFromDetail(
  detail: BookingDetailDto,
  timeZone: string,
): BookingEditFormState {
  return bookingEditFormFromBaseline(bookingEditBaselineFromDetail(detail), timeZone);
}
