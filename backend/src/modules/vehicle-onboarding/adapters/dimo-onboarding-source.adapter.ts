import type { DimoVehicle } from '@prisma/client';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import { DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE } from './connection-scope.constants';
import { proposeDefaultConnectionModality } from '../connection-identity/vehicle-connection-identity.classifier';
import {
  applyVerifiedConnectionIdentityToSnapshot,
  mergeProposedOnly,
  verifyDimoConnectionFromMirrorEvidence,
} from '../connection-identity/connection-modality-verification';

export function buildDimoOnboardingSourceSnapshot(
  dimoVehicle: Pick<
    DimoVehicle,
    'id' | 'externalId' | 'vin' | 'make' | 'model' | 'year' | 'fuelType' | 'updatedAt' | 'rawJson'
  >,
  observedAt: Date = new Date(),
): OnboardingSourceSnapshotV1 {
  const externalVehicleIdentity = dimoVehicle.externalId?.trim() || dimoVehicle.id;
  const vin = dimoVehicle.vin?.trim() || null;

  const base: OnboardingSourceSnapshotV1 = {
    version: 1,
    providerType: 'DIMO',
    connectionScope: DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE,
    externalVehicleIdentity,
    sourceMirrorTable: 'dimo_vehicles',
    sourceMirrorId: dimoVehicle.id,
    observedAt: observedAt.toISOString(),
    vin,
    vinProvenance: vin ? 'PROVIDER' : null,
    vinVerificationState: vin ? 'UNVERIFIED' : null,
    make: dimoVehicle.make?.trim() || null,
    model: dimoVehicle.model?.trim() || null,
    year: dimoVehicle.year ?? null,
    fuelTypeHint: dimoVehicle.fuelType?.trim() || null,
    capabilityHints: ['telemetry', 'location', 'dtc', 'snapshot'],
    sourceEvidence: {
      dimoConnectionStatus: 'mirror_only',
      externalId: dimoVehicle.externalId,
    },
    bindingMetadata: {
      dimoVehicleId: dimoVehicle.id,
    },
  };
  const proposed = proposeDefaultConnectionModality(base);
  let snap = mergeProposedOnly(base, proposed, [
    'DIMO_MIRROR_SNAPSHOT',
    `externalId:${dimoVehicle.externalId}`,
  ]);
  const verified = verifyDimoConnectionFromMirrorEvidence(
    dimoVehicle.rawJson,
    externalVehicleIdentity,
  );
  if (verified.ok) {
    snap = applyVerifiedConnectionIdentityToSnapshot(snap, proposed, verified);
  }
  return snap;
}

export function identityDraftFromDimoSnapshot(
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
        provider: 'DIMO',
        sourceMirrorId: snapshot.sourceMirrorId,
      },
    ],
  };
}
