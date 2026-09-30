import { ProductionFailClosedReadinessAuthority } from '../readiness/vehicle-onboarding-readiness-authority';
import { buildTestReadinessSnapshot } from '../readiness/test-readiness-authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { READINESS_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';
import { VehicleOnboardingReadinessService } from '../services/vehicle-onboarding-readiness.service';

describe('Production readiness authority', () => {
  const readinessService = {
    computeCurrentInputFingerprint: () => 'fp',
  } as unknown as VehicleOnboardingReadinessService;
  const authority = new ProductionFailClosedReadinessAuthority(readinessService);

  it('rejects TEST_FIXTURE attestation (v1)', () => {
    const snap = buildTestReadinessSnapshot(null);
    expect(() =>
      authority.assertReadyForActivation(
        {
          status: 'READY_FOR_ACTIVATION',
          readinessSnapshotVersion: READINESS_SNAPSHOT_VERSION,
          readinessSnapshotJson: snap,
          organizationId: 'org',
        } as any,
        {
          sourceRefs: [],
          organization: { businessType: 'RENTAL', country: null, id: 'org', companyName: 'x' } as any,
        },
      ),
    ).toThrow(VehicleOnboardingError);
  });
});
