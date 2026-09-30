import type { VehicleOnboardingCase } from '@prisma/client';
import type { VehicleOnboardingReadinessSnapshotV1 } from '../contracts/readiness-snapshot.v1';
import {
  parseReadinessSnapshot,
  type VehicleOnboardingReadinessAuthority,
} from './vehicle-onboarding-readiness-authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/** Deterministic test fixture — accepts TEST_FIXTURE attestation on READY cases. */
export class TestVehicleOnboardingReadinessAuthority implements VehicleOnboardingReadinessAuthority {
  assertReadyForActivation(caseRow: VehicleOnboardingCase): VehicleOnboardingReadinessSnapshotV1 {
    if (caseRow.status !== 'READY_FOR_ACTIVATION') {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'Case is not READY_FOR_ACTIVATION',
        { status: caseRow.status },
      );
    }
    const snap = parseReadinessSnapshot(caseRow);
    if (!snap) {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Missing readiness snapshot');
    }
    if (snap.attestationSource !== 'TEST_FIXTURE' && snap.attestationSource !== 'VO4_READINESS_ENGINE') {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Invalid attestation source');
    }
    if (!snap.schemaRequiredFieldsMet) {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Schema-required fields not met');
    }
    return snap;
  }
}

export function buildTestReadinessSnapshot(
  actorUserId: string | null,
  profileVersion = 'vo3-test-profile-v1',
): VehicleOnboardingReadinessSnapshotV1 {
  return {
    version: 1,
    profileVersion,
    sealedAt: new Date().toISOString(),
    sealedByUserId: actorUserId,
    schemaRequiredFieldsMet: true,
    attestationSource: 'TEST_FIXTURE',
  };
}
