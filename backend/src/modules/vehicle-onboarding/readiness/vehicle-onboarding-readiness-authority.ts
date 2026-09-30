import type { VehicleOnboardingCase } from '@prisma/client';
import type { VehicleOnboardingReadinessSnapshotV1 } from '../contracts/readiness-snapshot.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseValidatedReadinessSnapshot } from '../policy/persisted-contract.validation';

export interface VehicleOnboardingReadinessAuthority {
  assertReadyForActivation(caseRow: VehicleOnboardingCase): VehicleOnboardingReadinessSnapshotV1;
}

export class ProductionFailClosedReadinessAuthority implements VehicleOnboardingReadinessAuthority {
  assertReadyForActivation(caseRow: VehicleOnboardingCase): VehicleOnboardingReadinessSnapshotV1 {
    if (caseRow.status !== 'READY_FOR_ACTIVATION') {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'Case is not READY_FOR_ACTIVATION',
        { status: caseRow.status },
      );
    }
    const snap = parseValidatedReadinessSnapshot(caseRow);
    if (snap.attestationSource !== 'VO4_READINESS_ENGINE') {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'Production activation requires VO-4 readiness attestation',
      );
    }
    if (!snap.schemaRequiredFieldsMet) {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Schema-required fields not met');
    }
    return snap;
  }
}
