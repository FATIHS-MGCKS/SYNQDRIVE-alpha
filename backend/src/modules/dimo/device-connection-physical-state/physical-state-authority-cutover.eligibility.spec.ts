import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { evaluatePhysicalStateCutoverEligibility } from './physical-state-authority-cutover.eligibility';
import { PhysicalStateCutoverEligibilityStatus } from './physical-state-authority-cutover.types';
import {
  PhysicalStateCutoverEvidenceVerificationStatus,
} from './physical-state-cutover-evidence.types';
import { verifyPhysicalStateCutoverEvidence } from './physical-state-cutover-evidence.verifier';
import {
  buildValidSignedCutoverEvidenceBundleForScope,
  configureP25TestEvidencePublicKeyring,
  disableP25CutoverRuntimeEnv,
  clearP25TestEvidencePublicKeyring,
  enableP25CutoverRuntimeEnv,
  P25_TEST_CUTOVER_BUILD,
} from './testing/physical-state-cutover-evidence.test-fixtures';

const scope = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  provider: 'DIMO',
};

describe('physical-state-authority-cutover.eligibility', () => {
  afterEach(() => {
    disableP25CutoverRuntimeEnv();
    clearP25TestEvidencePublicKeyring();
  });

  it('defaults to blocked when signed evidence bundle is absent', () => {
    enableP25CutoverRuntimeEnv(P25_TEST_CUTOVER_BUILD);
    configureP25TestEvidencePublicKeyring();
    const result = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      evidenceVerification: {
        status: PhysicalStateCutoverEvidenceVerificationStatus.MISSING_BUNDLE,
        details: ['signed_evidence_bundle_required'],
      },
    });
    expect(result.status).toBe(PhysicalStateCutoverEligibilityStatus.BLOCKED_EVIDENCE_PROVENANCE);
  });

  it('returns ELIGIBLE when signed evidence verifies VALID', () => {
    enableP25CutoverRuntimeEnv(P25_TEST_CUTOVER_BUILD);
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope);
    const verification = verifyPhysicalStateCutoverEvidence({ scope, bundle });
    expect(verification.status).toBe(PhysicalStateCutoverEvidenceVerificationStatus.VALID);

    const result = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      evidenceVerification: verification,
    });
    expect(result.status).toBe(PhysicalStateCutoverEligibilityStatus.ELIGIBLE);
  });

  it('returns ALREADY_PHYSICAL without blocking', () => {
    const result = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
      evidenceVerification: {
        status: PhysicalStateCutoverEvidenceVerificationStatus.MISSING_BUNDLE,
        details: ['signed_evidence_bundle_required'],
      },
    });
    expect(result.status).toBe(PhysicalStateCutoverEligibilityStatus.ALREADY_PHYSICAL);
  });
});
