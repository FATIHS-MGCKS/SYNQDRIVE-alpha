import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityReviewSnapshot,
} from './vehicle-identity-review.types';

export type VehicleIdentityConfirmValidationResult = {
  ok: boolean;
  errors: Array<{ code: string; fieldCode?: string; message: string }>;
  /** P3 handoff payload only — not persisted in P2. */
  confirmedFieldCodes: string[];
};

export function validateVehicleIdentityFieldConfirmations(input: {
  snapshot: VehicleIdentityReviewSnapshot;
  confirmations: VehicleIdentityFieldConfirmationInput[];
  vinMismatchAcknowledged: boolean;
  acceptP2AsSystemPower: boolean;
}): VehicleIdentityConfirmValidationResult {
  const errors: VehicleIdentityConfirmValidationResult['errors'] = [];
  const confirmedFieldCodes: string[] = [];

  if (input.snapshot.vinMismatchBlocked && !input.vinMismatchAcknowledged) {
    errors.push({
      code: 'VIN_MISMATCH_UNACKNOWLEDGED',
      fieldCode: 'eVin',
      message: 'FIN mismatch must be explicitly acknowledged before any field confirmation.',
    });
  }

  const byCode = new Map(input.confirmations.map((c) => [c.fieldCode, c]));

  for (const field of input.snapshot.fields) {
    const conf = byCode.get(field.fieldCode);
    if (!conf?.confirmed) continue;

    if (field.fieldCode === 'p2NominalPowerKw' && input.acceptP2AsSystemPower) {
      errors.push({
        code: 'P2_SYSTEM_POWER_NOT_ALLOWED',
        fieldCode: 'p2NominalPowerKw',
        message:
          'P.2 nominal power cannot be confirmed as hybrid/system power without variant review.',
      });
      continue;
    }

    if (field.conflict && conf.correctedValue == null) {
      errors.push({
        code: 'CONFLICT_REQUIRES_CORRECTION',
        fieldCode: field.fieldCode,
        message: `Field ${field.fieldCode} has conflicting sources; provide correctedValue when confirming.`,
      });
      continue;
    }

    confirmedFieldCodes.push(field.fieldCode);
  }

  return {
    ok: errors.length === 0,
    errors,
    confirmedFieldCodes,
  };
}
