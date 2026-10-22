import { describe, expect, it } from 'vitest';
import { formatM2SummaryLines, formatM3ValidationLines } from './hv-battery-m2-m3-display.util';

describe('hv-battery-m2-m3-display.util', () => {
  it('formats M2 summary lines', () => {
    const lines = formatM2SummaryLines({
      status: 'STABLE_SHADOW',
      shadowGatePassed: true,
      stats: { medianCapacityKwh: 77.5, validSampleCount: 8 },
    });
    expect(lines.some((l) => l.includes('77.50'))).toBe(true);
  });

  it('formats M3 validation lines', () => {
    const lines = formatM3ValidationLines({
      gateEligible: false,
      gateReasonCodes: ['INSUFFICIENT_SOC_SPAN'],
      estimatedCapacityKwh: 76,
    });
    expect(lines.some((l) => l.includes('INSUFFICIENT_SOC_SPAN'))).toBe(true);
  });
});
