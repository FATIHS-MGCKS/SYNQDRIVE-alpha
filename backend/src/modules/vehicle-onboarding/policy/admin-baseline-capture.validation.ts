import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from '../contracts/vo-document-versions';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

function normalizeNullableString(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Invalid admin baseline field type');
  }
  const trimmed = val.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parseAdminBaselineCapturePayload(
  body: unknown,
): VehicleAdministrativeBaselineDraftV1 {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Admin baseline body must be an object');
  }
  const raw = body as Record<string, unknown>;
  if (raw.version !== VEHICLE_ADMIN_BASELINE_DRAFT_VERSION) {
    throw new VehicleOnboardingError(
      'UNSUPPORTED_CONTRACT_VERSION',
      'Admin baseline capture requires version 1',
    );
  }
  return {
    version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
    vehicleName: normalizeNullableString(raw.vehicleName),
    licensePlate: normalizeNullableString(raw.licensePlate),
    stationId: normalizeNullableString(raw.stationId),
    notes: normalizeNullableString(raw.notes),
  };
}

export function adminBaselineSemanticEquals(
  a: VehicleAdministrativeBaselineDraftV1,
  b: VehicleAdministrativeBaselineDraftV1,
): boolean {
  return (
    a.vehicleName === b.vehicleName &&
    a.licensePlate === b.licensePlate &&
    a.stationId === b.stationId &&
    a.notes === b.notes
  );
}
