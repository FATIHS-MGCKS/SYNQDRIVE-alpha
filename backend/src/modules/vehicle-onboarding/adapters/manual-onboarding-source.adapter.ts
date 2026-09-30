import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';

export interface ManualOnboardingInput {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuelType?: string | null;
  vehicleName?: string | null;
  licensePlate?: string | null;
  stationId?: string | null;
  notes?: string | null;
}

export function buildManualOnboardingSourceSnapshot(
  input: ManualOnboardingInput,
  organizationId: string,
  stableExternalIdentity: string,
  observedAt: Date = new Date(),
): OnboardingSourceSnapshotV1 {
  const vin = input.vin?.trim() || null;
  return {
    version: 1,
    providerType: 'MANUAL',
    connectionScope: `ORG:${organizationId}`,
    externalVehicleIdentity: stableExternalIdentity,
    sourceMirrorTable: null,
    sourceMirrorId: null,
    observedAt: observedAt.toISOString(),
    vin,
    vinProvenance: vin ? 'MANUAL' : null,
    vinVerificationState: vin ? 'UNVERIFIED' : null,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    year: input.year ?? null,
    fuelTypeHint: input.fuelType?.trim() || null,
    capabilityHints: [],
    sourceEvidence: { entry: 'manual' },
    bindingMetadata: {},
  };
}

export function identityDraftFromManualInput(input: ManualOnboardingInput): VehicleIdentityDraftV1 {
  const vin = input.vin?.trim() || null;
  return {
    version: 1,
    vin,
    vinProvenance: vin ? 'MANUAL' : null,
    vinVerificationState: vin ? 'UNVERIFIED' : null,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    year: input.year ?? null,
    fuelType: input.fuelType?.trim() || null,
    sourceEvidenceRefs: [{ provider: 'MANUAL', sourceMirrorId: null }],
  };
}

export function adminDraftFromManualInput(
  input: ManualOnboardingInput,
): VehicleAdministrativeBaselineDraftV1 {
  return {
    version: 1,
    vehicleName: input.vehicleName?.trim() || null,
    licensePlate: input.licensePlate?.trim() || null,
    stationId: input.stationId?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}
