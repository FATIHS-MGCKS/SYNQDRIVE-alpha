import {
  DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import {
  computeDs4AssessmentInputFingerprint,
  computeDs4AssessmentInputFingerprintFromMotionSource,
} from '../ds4-assessment-input-fingerprint';
import { DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT } from '../ds4-assessment-quality-policy.v1';

describe('ds4-assessment-input-fingerprint', () => {
  const base = {
    sourceMotionRunId: 'run-1',
    pinnedSnapshotHash: 'pin',
    combinedInputIdentity: 'ident',
    contentFingerprint: 'content-fp',
    qualityPolicyVersion: DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT.policyVersion,
  };

  it('hashes assessment version and event row contract from payload resolution', () => {
    const payload = {
      contract: { persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 },
      summary: { contentFingerprint: 'content-fp' },
    };
    const result = computeDs4AssessmentInputFingerprintFromMotionSource({
      ...base,
      summaryJson: {
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
      },
      payload: payload as never,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eventRowContract).toBe(DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract);
    expect(result.inputFingerprint).toBe(
      computeDs4AssessmentInputFingerprint({
        ...base,
        eventRowContract: result.eventRowContract,
      }),
    );
  });

  it('rejects summary event row contract mismatch with payload', () => {
    const payload = {
      contract: { persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 },
      summary: { contentFingerprint: 'content-fp' },
    };
    const result = computeDs4AssessmentInputFingerprintFromMotionSource({
      ...base,
      summaryJson: { eventRowContract: 'WRONG_CONTRACT' },
      payload: payload as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SOURCE_IDENTITY_MISMATCH');
  });

  it('rejects content fingerprint disagreement', () => {
    const result = computeDs4AssessmentInputFingerprintFromMotionSource({
      ...base,
      summaryJson: { contentFingerprint: 'other-fp' },
      payload: { summary: { contentFingerprint: 'other-fp' } } as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SOURCE_IDENTITY_MISMATCH');
  });

  it('includes quality policy version in assessment fingerprint', () => {
    const a = computeDs4AssessmentInputFingerprint({
      ...base,
      eventRowContract: null,
      qualityPolicyVersion: 'POLICY_A',
    });
    const b = computeDs4AssessmentInputFingerprint({
      ...base,
      eventRowContract: null,
      qualityPolicyVersion: 'POLICY_B',
    });
    expect(a).not.toBe(b);
  });
});
