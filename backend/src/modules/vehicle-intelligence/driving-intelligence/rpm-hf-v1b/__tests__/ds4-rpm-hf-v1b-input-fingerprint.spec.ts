import { computeDs4RpmHfV1bInputFingerprint } from '../ds4-rpm-hf-v1b-input-fingerprint';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';

function minimalTripInput(
  rpmPoints: Array<{ recordedAtIso: string; valueRpm: number }>,
): Ds4RpmHfV1aTripInputV1 {
  return {
    contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    tripId: 'trip-a',
    providerSourceLinkId: 'link-a',
    tripStartIso: '2026-01-01T10:00:00.000Z',
    tripEndIso: '2026-01-01T10:05:00.000Z',
    admission: {
      contractVersion: 'ds4-rpm-hf-admission-v1',
      iceRpmApplicability: 'APPLICABLE',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      processingStatus: 'ENABLED',
      processingAllowed: true,
      reasonCode: 'RPM_1HZ_WITH_HF_DATA',
      reasonSummary: 'ok',
    },
    dataQuality: {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: rpmPoints.length,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
      earliestRecordedAtIso: rpmPoints[0]?.recordedAtIso ?? null,
      latestRecordedAtIso: rpmPoints[rpmPoints.length - 1]?.recordedAtIso ?? null,
      observedIntervals: {
        intervalCount: 0,
        intervalMedianSeconds: null,
        intervalP95Seconds: null,
        minIntervalSeconds: null,
        maxIntervalSeconds: null,
      },
      identifiedGaps: [],
      completenessLabel: 'COMPLETE',
      totalMatchingCount: rpmPoints.length,
      returnedPointCount: rpmPoints.length,
      readLimit: 12000,
      readOffset: 0,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP',
    },
    clickHouseRead: {
      status: 'SUCCESS',
      available: true,
      degradedReason: null,
      tenantScopeViolation: false,
    },
    rpmPoints,
    vsiActiveRpmProfileSnapshot: {
      contractVersion: 'vsi-active-rpm-profile-v1',
      activeProfile: 'RPM_1HZ',
      evaluatedTripIds: ['trip-a'],
      qualifyingTripCount: 1,
      agreementRatio: 1,
      classificationDecisionCode: 'FAST',
      classificationDecisionSummary: 'fixture',
      tripClassifications: [
        {
          tripId: 'trip-a',
          endMs: Date.parse('2026-01-01T10:05:00.000Z'),
          profile: 'RPM_1HZ',
          intervalMedianSeconds: 1,
          intervalP95Seconds: 1,
          intervalCount: 2,
          rpmPointCount: 3,
          fractionIntervalsLe2s: 1,
          decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
        },
      ],
      profileSemanticFingerprint: 'vsi-fp-1',
    },
    readOnly: true,
    productionActivationForbidden: true,
  };
}

describe('ds4-rpm-hf-v1b-input-fingerprint', () => {
  it('is stable for identical inputs', () => {
    const points = [
      { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 900 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 910 },
    ];
    const a = computeDs4RpmHfV1bInputFingerprint(minimalTripInput(points));
    const b = computeDs4RpmHfV1bInputFingerprint(minimalTripInput(points));
    expect(a).toBe(b);
  });

  it('changes when RPM values differ with identical counts and bounds', () => {
    const base = [
      { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 900 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 910 },
    ];
    const altered = [
      { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 900 },
      { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 911 },
    ];
    const fpBase = computeDs4RpmHfV1bInputFingerprint(minimalTripInput(base));
    const fpAlt = computeDs4RpmHfV1bInputFingerprint(minimalTripInput(altered));
    expect(fpBase).not.toBe(fpAlt);
  });

  it('includes VSI provenance (not vehicle-level promotion alone)', () => {
    const points = [{ recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 800 }];
    const input = minimalTripInput(points);
    const fp1 = computeDs4RpmHfV1bInputFingerprint(input);
    input.vsiActiveRpmProfileSnapshot = {
      ...input.vsiActiveRpmProfileSnapshot!,
      profileSemanticFingerprint: 'vsi-fp-2',
    };
    const fp2 = computeDs4RpmHfV1bInputFingerprint(input);
    expect(fp1).not.toBe(fp2);
  });
});
