import type { BookingEditFormState } from './booking-edit-form.types';
import { localDateTimeToIso } from './booking-edit-form.utils';

export interface BookingEditValidationResult {
  valid: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof BookingEditFormState, string>>;
  startIso?: string;
  endIso?: string;
  effectiveReturnStationId?: string;
}

export function validateBookingEditForm(
  form: BookingEditFormState,
  timeZone: string,
): BookingEditValidationResult {
  const fieldErrors: Partial<Record<keyof BookingEditFormState, string>> = {};

  const startIso = localDateTimeToIso(form.startLocal, timeZone);
  const endIso = localDateTimeToIso(form.endLocal, timeZone);

  if (!startIso) fieldErrors.startLocal = 'Gültiger Abholzeitpunkt erforderlich';
  if (!endIso) fieldErrors.endLocal = 'Gültiger Rückgabezeitpunkt erforderlich';

  if (startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    fieldErrors.endLocal = 'Rückgabe muss nach der Abholung liegen';
  }

  const effectiveReturnStationId = form.sameReturnStation ? form.pickupStationId : form.returnStationId;
  if (!form.pickupStationId) fieldErrors.pickupStationId = 'Abholstation erforderlich';
  if (!effectiveReturnStationId) fieldErrors.returnStationId = 'Rückgabestation erforderlich';

  if (form.kmIncluded.trim()) {
    const km = Number(form.kmIncluded);
    if (!Number.isFinite(km) || km < 0) {
      fieldErrors.kmIncluded = 'Kilometer inklusive muss eine positive Zahl sein';
    }
  }

  const firstError = Object.values(fieldErrors)[0];
  if (firstError || !startIso || !endIso || !effectiveReturnStationId) {
    return {
      valid: false,
      error: firstError ?? 'Bitte alle Pflichtfelder prüfen',
      fieldErrors,
    };
  }

  return {
    valid: true,
    startIso,
    endIso,
    effectiveReturnStationId,
  };
}
