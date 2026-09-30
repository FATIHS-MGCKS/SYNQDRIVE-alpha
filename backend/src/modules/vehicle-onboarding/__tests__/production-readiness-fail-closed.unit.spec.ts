import { ProductionFailClosedReadinessAuthority } from '../readiness/vehicle-onboarding-readiness-authority';
import { buildTestReadinessSnapshot } from '../readiness/test-readiness-authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { READINESS_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';

describe('Production readiness authority', () => {
  const authority = new ProductionFailClosedReadinessAuthority();

  it('rejects TEST_FIXTURE attestation', () => {
    const snap = buildTestReadinessSnapshot(null);
    expect(() =>
      authority.assertReadyForActivation({
        status: 'READY_FOR_ACTIVATION',
        readinessSnapshotVersion: READINESS_SNAPSHOT_VERSION,
        readinessSnapshotJson: snap,
      } as any),
    ).toThrow(VehicleOnboardingError);
  });
});
