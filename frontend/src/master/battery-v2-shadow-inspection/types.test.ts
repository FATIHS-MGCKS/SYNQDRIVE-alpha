import { describe, expect, it } from 'vitest';
import { formatMillivolts, formatSlope, retentionPointsFromInputSummary } from './types';

describe('battery-v2-shadow-inspection presentation (C5B)', () => {
  it('does not recompute retention — only reads C5A array length', () => {
    expect(retentionPointsFromInputSummary({ eligibleRetentionPoints: [1, 2] })).toHaveLength(2);
    expect(retentionPointsFromInputSummary(null)).toHaveLength(0);
  });

  it('formats C5A numeric fields for display only', () => {
    expect(formatMillivolts(121500)).toBe('121.500 V');
    expect(formatSlope(-4.5)).toBe('-4.5 mV/h');
  });
});
