import type { OperatorBookingUpdatePayload } from '../../../lib/api';
import type {
  BookingEditBaseline,
  BookingEditFormState,
  BookingUpdateCommandResult,
} from './booking-edit-form.types';
import { validateBookingEditForm } from './booking-edit-form.validation';
import { isSameLocalInstant } from './booking-edit-form.utils';

function insuranceChanged(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = [...(a ?? [])].sort().join('|');
  const right = [...(b ?? [])].sort().join('|');
  return left !== right;
}

/**
 * Builds a diff-only PATCH payload from shared form state.
 * Never includes financial fields or status — those use dedicated commands.
 */
export function buildBookingUpdateCommand(
  baseline: BookingEditBaseline,
  form: BookingEditFormState,
  options?: {
    allowVehicleChange?: boolean;
    allowCustomerChange?: boolean;
    timeZone: string;
  },
): BookingUpdateCommandResult {
  const validation = validateBookingEditForm(form, options?.timeZone ?? 'Europe/Berlin');
  if (!validation.valid || !validation.startIso || !validation.endIso || !validation.effectiveReturnStationId) {
    return {
      ok: false,
      error: validation.error ?? 'Ungültige Eingabe',
      fieldErrors: validation.fieldErrors,
    };
  }

  const patch: OperatorBookingUpdatePayload = {};
  const changedFields: string[] = [];

  if (!isSameLocalInstant(baseline.startDate, form.startLocal, options?.timeZone ?? 'Europe/Berlin')) {
    patch.startDate = validation.startIso;
    changedFields.push('startDate');
  }
  if (!isSameLocalInstant(baseline.endDate, form.endLocal, options?.timeZone ?? 'Europe/Berlin')) {
    patch.endDate = validation.endIso;
    changedFields.push('endDate');
  }
  if (form.notes !== (baseline.notes ?? '')) {
    patch.notes = form.notes;
    changedFields.push('notes');
  }

  const km = form.kmIncluded.trim() ? Number(form.kmIncluded) : null;
  if (km != null && Number.isFinite(km) && km !== baseline.kmIncluded) {
    patch.kmIncluded = km;
    changedFields.push('kmIncluded');
  }

  if (options?.allowVehicleChange && form.vehicleId && form.vehicleId !== baseline.vehicleId) {
    patch.vehicle = { connect: { id: form.vehicleId } };
    changedFields.push('vehicleId');
  }

  if (options?.allowCustomerChange && form.customerId && form.customerId !== baseline.customerId) {
    patch.customer = { connect: { id: form.customerId } };
    changedFields.push('customerId');
  }

  if (form.pickupStationId && form.pickupStationId !== baseline.pickupStationId) {
    patch.pickupStationId = form.pickupStationId;
    changedFields.push('pickupStationId');
  }
  if (validation.effectiveReturnStationId !== baseline.returnStationId) {
    patch.returnStationId = validation.effectiveReturnStationId;
    changedFields.push('returnStationId');
  }

  if (form.insuranceOptions && insuranceChanged(form.insuranceOptions, baseline.insuranceOptions)) {
    patch.insuranceOptions = form.insuranceOptions;
    changedFields.push('insuranceOptions');
  }

  if (changedFields.length === 0) {
    return { ok: false, error: 'Keine Änderungen zum Speichern' };
  }

  return { ok: true, patch, changedFields };
}
