import { analyzeHvChargingCounterBoundaryForensicsV1 } from './hv-charging-counter-boundary-forensics.v1';
import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

function row(
  timestamp: string,
  last: number | null,
): HvChargingCounterDimoIntervalRowV1 {
  return {
    timestamp,
    addedKwhLast: last,
    addedKwhMin: last,
    addedKwhMax: last,
  };
}

describe('analyzeHvChargingCounterBoundaryForensicsV1', () => {
  it('detects pre-session reset and in-session monotonic trend', () => {
    const rows: HvChargingCounterDimoIntervalRowV1[] = [
      row('2026-10-12T13:05:00Z', 12.16),
      row('2026-10-12T13:06:00Z', 0),
      row('2026-10-12T13:07:00Z', 0.02),
      row('2026-10-12T13:08:00Z', 0.08),
    ];
    const result = analyzeHvChargingCounterBoundaryForensicsV1({
      sessionStartInclusive: '2026-10-12T13:06:55.314Z',
      sessionEndInclusive: '2026-10-12T15:10:30.313Z',
      queryFromInclusive: '2026-10-12T13:01:55.314Z',
      queryToInclusive: '2026-10-12T13:09:00Z',
      rows,
    });
    expect(result.classifications).toContain('PRE_SESSION_RESET_CANDIDATE');
    expect(result.negativeDeltas).toBeGreaterThan(0);
    expect(result.firstNumericInSession).toBe(0);
  });
});
