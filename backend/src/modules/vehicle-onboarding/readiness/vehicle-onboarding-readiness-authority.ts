import type { VehicleOnboardingCase } from '@prisma/client';
import type { VehicleOnboardingReadinessSnapshotV1 } from '../contracts/readiness-snapshot.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export interface VehicleOnboardingReadinessAuthority {
  /** Returns parsed readiness snapshot when case is sealed for activation. */
  assertReadyForActivation(caseRow: VehicleOnboardingCase): VehicleOnboardingReadinessSnapshotV1;
}

export function parseReadinessSnapshot(
  caseRow: VehicleOnboardingCase,
): VehicleOnboardingReadinessSnapshotV1 | null {
  const raw = caseRow.readinessSnapshotJson;
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as unknown as VehicleOnboardingReadinessSnapshotV1;
  if (snap.version !== 1) return null;
  return snap;
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
    const snap = parseReadinessSnapshot(caseRow);
    if (!snap || snap.attestationSource !== 'VO4_READINESS_ENGINE') {
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
