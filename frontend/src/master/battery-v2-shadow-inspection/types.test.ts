import { describe, expect, it } from 'vitest';
import { formatMillivolts, formatSlope, retentionPointsFromInputSummary } from './types';

describe('battery-v2-shadow-inspection presentation (C5B)', () => {
  it('reads C5A inputSummary.retentionPoints in payload order without recomputation', () => {
    const summary = {
      inputContractVersion: 'M3_3C_FEATURE_INPUT_V1',
      retentionPoints: [
        {
          observationId: 'obs-b',
          sourceMeasurementId: 'm1',
          evidenceClass: 'REST_WAKE_VOLTAGE',
          evidenceConfidence: 'HIGH',
          stateAlignmentClass: 'ALIGNED',
          actualRestAgeMs: 3600000,
          voltageMv: 121800,
          providerObservationAt: null,
          nominalRestIntervalIndex: 2,
        },
        {
          observationId: 'obs-a',
          sourceMeasurementId: 'm0',
          evidenceClass: 'REST_WAKE_VOLTAGE',
          evidenceConfidence: 'HIGH',
          stateAlignmentClass: 'ALIGNED',
          actualRestAgeMs: 1800000,
          voltageMv: 122100,
          providerObservationAt: null,
          nominalRestIntervalIndex: 1,
        },
      ],
    };
    const points = retentionPointsFromInputSummary(summary);
    expect(points).toHaveLength(2);
    expect(points[0].observationId).toBe('obs-b');
    expect(points[1].voltageMv).toBe(122100);
    expect(points[0].actualRestAgeMs).toBe(3600000);
  });

  it('returns empty array for missing or invalid retention evidence', () => {
    expect(retentionPointsFromInputSummary(null)).toEqual([]);
    expect(retentionPointsFromInputSummary({ retentionPoints: 'bad' })).toEqual([]);
    expect(retentionPointsFromInputSummary({ retentionPoints: [{ observationId: 'x' }] })).toEqual([]);
  });

  it('formats C5A numeric fields for display only', () => {
    expect(formatMillivolts(121500)).toBe('121.500 V');
    expect(formatSlope(-4.5)).toBe('-4.5 mV/h');
  });
});
