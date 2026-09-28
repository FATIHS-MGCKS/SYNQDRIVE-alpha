import { computeGroundTruthSourceContentFingerprintV1 } from './ground-truth-fingerprint';
import { M3_3G_GROUND_TRUTH_FINGERPRINT_VERSION } from './ground-truth.constants';

describe('computeGroundTruthSourceContentFingerprintV1', () => {
  const base = {
    organizationId: 'org-11111111-1111-1111-1111-111111111111',
    vehicleId: 'veh-22222222-2222-2222-2222-222222222222',
    groundTruthType: 'WORKSHOP_MEASUREMENT' as const,
    batteryScope: 'LV' as const,
    effectiveAt: new Date('2026-06-01T12:00:00.000Z'),
    sourceAuthority: 'WORKSHOP' as const,
    sourceBatteryEvidenceId: 'ev-1',
    sourceIdentity: {
      batteryEvidence: {
        id: 'ev-1',
        scope: 'LV' as const,
        sourceType: 'WORKSHOP_MEASUREMENT' as const,
        valueType: 'VOLTAGE_V',
        observedAtIso: '2026-06-01T12:00:00.000Z',
      },
    },
  };

  it('N — produces stable golden fingerprint', () => {
    const fp = computeGroundTruthSourceContentFingerprintV1(base);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    expect(fp).toBe(computeGroundTruthSourceContentFingerprintV1(base));
    expect(fp).toBe('0dc27a0b9299fad9ad291058114926da22c008c31613a9d0da35b813b49ab7f0');
  });

  it('O — fingerprint changes on material source identity change', () => {
    const a = computeGroundTruthSourceContentFingerprintV1(base);
    const b = computeGroundTruthSourceContentFingerprintV1({
      ...base,
      sourceIdentity: {
        ...base.sourceIdentity,
        batteryEvidence: {
          ...base.sourceIdentity.batteryEvidence!,
          id: 'ev-2',
        },
      },
    });
    expect(a).not.toBe(b);
  });

  it('P — createdAt is not part of fingerprint payload', () => {
    expect(M3_3G_GROUND_TRUTH_FINGERPRINT_VERSION).toBe('M3_3G_GROUND_TRUTH_FINGERPRINT_V1');
    const withConfirm = computeGroundTruthSourceContentFingerprintV1({
      ...base,
      confirmedAt: new Date('2099-01-01T00:00:00.000Z'),
      confirmedByUserId: 'user-1',
    });
    const without = computeGroundTruthSourceContentFingerprintV1(base);
    expect(withConfirm).not.toBe(without);
  });
});
