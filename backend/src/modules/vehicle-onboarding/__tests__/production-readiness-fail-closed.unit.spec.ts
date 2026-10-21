import { ProductSlug } from '@prisma/client';
import { ProductionFailClosedReadinessAuthority } from '../readiness/vehicle-onboarding-readiness-authority';
import { buildTestReadinessSnapshot } from '../readiness/test-readiness-authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  READINESS_SNAPSHOT_VERSION,
  READINESS_SNAPSHOT_VERSION_V2,
} from '../contracts/vo-document-versions';
import { VehicleOnboardingReadinessService } from '../services/vehicle-onboarding-readiness.service';
import { RENTAL_ONBOARDING_PROFILE_V1 } from '../readiness/profiles/rental-onboarding.profile';

describe('Production readiness authority', () => {
  const readinessService = {
    computeCurrentInputFingerprint: () => 'fp-match',
  } as unknown as VehicleOnboardingReadinessService;

  const entitlementCandidateId = 'op-1';

  function createActivationTxMock() {
    return {
      organizationProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: entitlementCandidateId }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { id: entitlementCandidateId, status: 'ACTIVE', productId: 'prod-1' },
      ]),
    };
  }

  const authority = new ProductionFailClosedReadinessAuthority(readinessService);

  it('rejects TEST_FIXTURE attestation (v1)', async () => {
    const tx = createActivationTxMock();
    const snap = buildTestReadinessSnapshot(null);
    await expect(
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
          tx: tx as any,
        },
      ),
    ).rejects.toThrow(VehicleOnboardingError);
  });

  it('accepts v2 snapshot when fingerprint and entitlement match', async () => {
    const tx = createActivationTxMock();
    const snap = {
      version: READINESS_SNAPSHOT_VERSION_V2,
      profileId: RENTAL_ONBOARDING_PROFILE_V1.profileId,
      profileVersion: RENTAL_ONBOARDING_PROFILE_V1.profileVersion,
      evaluatedAt: new Date().toISOString(),
      sealedAt: new Date().toISOString(),
      sealedByUserId: null,
      decision: 'READY',
      attestationSource: 'VO4_READINESS_ENGINE',
      schemaRequiredFieldsMet: true,
      readinessInputFingerprint: 'fp-match',
      sourceSetFingerprint: 'ss',
      productContext: {
        selectedProductSlug: ProductSlug.RENTAL,
        productEntitlementStatus: 'ACTIVE',
        organizationBusinessType: 'RENTAL',
        profileId: RENTAL_ONBOARDING_PROFILE_V1.profileId,
        profileVersion: RENTAL_ONBOARDING_PROFILE_V1.profileVersion,
      },
      jurisdictionContext: { code: 'JURISDICTION_UNKNOWN', authority: 'UNKNOWN' },
      powertrainContext: { classification: 'ICE' },
      ruleResults: [],
      blockingFailureCount: 0,
      reviewRequiredCount: 0,
      deferredCount: 0,
      unknownAllowedCount: 0,
    };
    const result = await authority.assertReadyForActivation(
      {
        status: 'READY_FOR_ACTIVATION',
        readinessSnapshotVersion: READINESS_SNAPSHOT_VERSION_V2,
        readinessSnapshotJson: snap,
        organizationId: 'org',
      } as any,
      {
        sourceRefs: [],
        organization: { businessType: 'RENTAL', country: null, id: 'org', companyName: 'x' } as any,
        tx: tx as any,
      },
    );
    expect(result.version).toBe(READINESS_SNAPSHOT_VERSION_V2);
    expect(tx.organizationProduct.findFirst).toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalled();
  });
});
