import {
  BatteryEvidenceSourceType,
  BatteryEvidenceScope,
} from '@prisma/client';
import {
  isQualifiedBatteryEvidence,
  isShadowOnlyBatteryEvidence,
  measurementRetentionDays,
  retentionCutoff,
  utcDayKey,
} from './battery-v2-retention.types';

describe('battery-v2-retention.types', () => {
  it('computes retention cutoff from days', () => {
    const now = Date.parse('2026-07-01T12:00:00.000Z');
    const cutoff = retentionCutoff(30, now);
    expect(cutoff?.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    expect(retentionCutoff(0, now)).toBeNull();
  });

  it('formats UTC day keys', () => {
    expect(utcDayKey(new Date('2026-07-16T23:59:00.000Z'))).toBe('2026-07-16');
  });

  it('classifies qualified evidence', () => {
    expect(
      isQualifiedBatteryEvidence({
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        documentExtractionId: null,
        serviceEventId: null,
      }),
    ).toBe(true);
    expect(
      isQualifiedBatteryEvidence({
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
        documentExtractionId: 'doc-1',
        serviceEventId: null,
      }),
    ).toBe(true);
    expect(
      isQualifiedBatteryEvidence({
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
        documentExtractionId: null,
        serviceEventId: null,
      }),
    ).toBe(false);
  });

  it('classifies shadow-only evidence', () => {
    expect(
      isShadowOnlyBatteryEvidence({
        sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
        documentExtractionId: null,
        serviceEventId: null,
        quality: 'SHADOW',
      }),
    ).toBe(true);
    expect(
      isShadowOnlyBatteryEvidence({
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        documentExtractionId: null,
        serviceEventId: null,
        quality: null,
      }),
    ).toBe(false);
  });

  it('selects scope-specific measurement retention days', () => {
    const days = {
      measurementsLv: 730,
      measurementsHv: 1095,
    } as Parameters<typeof measurementRetentionDays>[1];

    expect(measurementRetentionDays(BatteryEvidenceScope.LV, days)).toBe(730);
    expect(measurementRetentionDays(BatteryEvidenceScope.HV, days)).toBe(1095);
  });
});
