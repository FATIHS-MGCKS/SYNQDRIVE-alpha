import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityReviewFieldCode,
  VehicleIdentityReviewSnapshot,
  VehicleIdentityValueProvenance,
} from './vehicle-identity-review.types';
import type {
  RegistrationIdentityCanonicalField,
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityCanonicalIdentity,
} from './vehicle-identity-canonical.types';

const FIELD_CODE_TO_CANONICAL: Partial<
  Record<VehicleIdentityReviewFieldCode, RegistrationIdentityCanonicalFieldKey>
> = {
  d1Manufacturer: 'make',
  d3TradeName: 'model',
  eVin: 'vin',
  p1DisplacementCc: 'displacementCc',
  p2NominalPowerKw: 'nominalMotorPowerKw',
  p3FuelOrEnergy: 'fuelType',
  hsnCode21: 'hsn',
  tsnCode22: 'tsn',
  d2TypeVariantVersion: 'typeVariantVersion',
  manualPowerKind: 'powerKind',
  manualElectrificationGrade: 'electrificationGrade',
};

function resolveConfirmedValue(
  fieldCode: VehicleIdentityReviewFieldCode,
  snapshot: VehicleIdentityReviewSnapshot,
  confirmation: VehicleIdentityFieldConfirmationInput,
): string | number | null {
  if (confirmation.correctedValue !== undefined && confirmation.correctedValue !== null) {
    return confirmation.correctedValue;
  }
  const row = snapshot.fields.find((f) => f.fieldCode === fieldCode);
  if (!row) return null;
  if (row.manualValue != null) return row.manualValue;
  if (row.documentValue != null && row.extractionStatus === 'EXTRACTED') return row.documentValue;
  if (row.baselineValue != null && row.baselineProvenance !== 'UNCONFIRMED' && row.baselineProvenance !== 'UNAVAILABLE') {
    return row.baselineValue;
  }
  return row.value;
}

function provenanceForConfirmed(
  fieldCode: VehicleIdentityReviewFieldCode,
  snapshot: VehicleIdentityReviewSnapshot,
): VehicleIdentityValueProvenance {
  const row = snapshot.fields.find((f) => f.fieldCode === fieldCode);
  if (!row) return 'USER_CONFIRMED';
  if (row.manualValue != null) return 'MANUAL_ENTRY';
  if (row.documentValue != null && row.extractionStatus === 'EXTRACTED') return 'DOCUMENT_EXTRACTED';
  if (row.baselineProvenance === 'DIMO_PROVIDER') return 'DIMO_PROVIDER';
  return 'USER_CONFIRMED';
}

export function buildRegistrationIdentityCanonical(input: {
  snapshot: VehicleIdentityReviewSnapshot;
  confirmations: VehicleIdentityFieldConfirmationInput[];
  vehicleYear: number | null;
}): RegistrationIdentityCanonicalIdentity {
  const confirmed = new Map(
    input.confirmations.filter((c) => c.confirmed).map((c) => [c.fieldCode, c]),
  );
  const fields: RegistrationIdentityCanonicalField[] = [];

  for (const [fieldCode, canonicalKey] of Object.entries(FIELD_CODE_TO_CANONICAL) as Array<
    [VehicleIdentityReviewFieldCode, RegistrationIdentityCanonicalFieldKey]
  >) {
    const conf = confirmed.get(fieldCode);
    if (!conf) continue;
    const value = resolveConfirmedValue(fieldCode, input.snapshot, conf);
    fields.push({
      key: canonicalKey,
      value,
      provenance: provenanceForConfirmed(fieldCode, input.snapshot),
      confirmationStatus: 'USER_CONFIRMED',
      documentExtractionId: input.snapshot.documentExtractionId,
    });
  }

  if (input.vehicleYear != null && Number.isFinite(input.vehicleYear)) {
    fields.push({
      key: 'year',
      value: input.vehicleYear,
      provenance: 'USER_CONFIRMED',
      confirmationStatus: 'USER_CONFIRMED',
      documentExtractionId: input.snapshot.documentExtractionId,
    });
  }

  return {
    version: 1,
    documentExtractionId: input.snapshot.documentExtractionId,
    fields,
  };
}

export function canonicalToVehicleSpecContext(
  canonical: RegistrationIdentityCanonicalIdentity,
): {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  powertrainType?: string;
} {
  const byKey = new Map(canonical.fields.map((f) => [f.key, f.value]));
  const powerKind = byKey.get('powerKind');
  return {
    vin: (byKey.get('vin') as string | null) ?? undefined,
    make: (byKey.get('make') as string | null) ?? undefined,
    model: (byKey.get('model') as string | null) ?? undefined,
    year: (byKey.get('year') as number | null) ?? undefined,
    fuelType: (byKey.get('fuelType') as string | null) ?? undefined,
    powertrainType: powerKind != null ? String(powerKind) : undefined,
  };
}
