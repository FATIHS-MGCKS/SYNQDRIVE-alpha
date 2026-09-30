import type { HighMobilityVehicle } from '@prisma/client';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import {
  HM_MIRROR_SURROGATE_PREFIX,
  hmConnectionScopeForOrganization,
} from './connection-scope.constants';

export function resolveHmExternalVehicleIdentity(
  hm: Pick<HighMobilityVehicle, 'id' | 'hmVehicleReference'>,
): string {
  const ref = hm.hmVehicleReference?.trim();
  if (ref) return ref;
  return `${HM_MIRROR_SURROGATE_PREFIX}${hm.id}`;
}

export function buildHmOnboardingSourceSnapshot(
  hm: Pick<
    HighMobilityVehicle,
    | 'id'
    | 'vin'
    | 'brand'
    | 'hmVehicleReference'
    | 'clearanceStatus'
    | 'sourceMode'
    | 'packageType'
    | 'appContainerType'
    | 'updatedAt'
  >,
  organizationId: string,
  observedAt: Date = new Date(),
): OnboardingSourceSnapshotV1 {
  const externalVehicleIdentity = resolveHmExternalVehicleIdentity(hm);
  const vin = hm.vin?.trim() || null;
  const isSurrogate = externalVehicleIdentity.startsWith(HM_MIRROR_SURROGATE_PREFIX);

  return {
    version: 1,
    providerType: 'HIGH_MOBILITY',
    connectionScope: hmConnectionScopeForOrganization(organizationId),
    externalVehicleIdentity,
    sourceMirrorTable: 'high_mobility_vehicles',
    sourceMirrorId: hm.id,
    observedAt: observedAt.toISOString(),
    vin,
    vinProvenance: vin ? 'PROVIDER' : null,
    vinVerificationState: vin ? 'UNVERIFIED' : null,
    make: hm.brand?.trim() || null,
    model: null,
    year: null,
    fuelTypeHint: null,
    capabilityHints: ['health', 'tire_pressure', 'service_info'],
    sourceEvidence: {
      clearanceStatus: hm.clearanceStatus,
      sourceMode: hm.sourceMode,
      packageType: hm.packageType,
      appContainerType: hm.appContainerType,
      identitySurrogate: isSurrogate,
    },
    bindingMetadata: {
      hmVehicleId: hm.id,
      hmVehicleReference: hm.hmVehicleReference,
    },
  };
}

export function identityDraftFromHmSnapshot(
  snapshot: OnboardingSourceSnapshotV1,
): import('../contracts/vehicle-identity-draft.v1').VehicleIdentityDraftV1 {
  return {
    version: 1,
    vin: snapshot.vin,
    vinProvenance: snapshot.vin ? 'PROVIDER' : null,
    vinVerificationState: snapshot.vin ? 'UNVERIFIED' : null,
    make: snapshot.make,
    model: snapshot.model,
    year: snapshot.year,
    fuelType: snapshot.fuelTypeHint,
    sourceEvidenceRefs: [
      {
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: snapshot.sourceMirrorId,
      },
    ],
  };
}
