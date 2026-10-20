import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateHvChargingCounterQualityV2 } from './hv-charging-counter-evidence.counter-quality.v2';
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

describe('evaluateHvChargingCounterQualityV2', () => {
  it('preserves hv-r22-counter-quality-v1 numericCoverage semantics on returned rows', () => {
    const rows = [
      row('2026-10-12T13:06:00Z', 0.02),
      row('2026-10-12T13:07:00Z', 0.08),
      row('2026-10-12T13:08:00Z', null),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:55.314Z',
      sessionEndInclusive: '2026-10-12T15:10:30.313Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows,
    });
    expect(quality.schemaVersion).toBe('hv-r22-counter-quality-v2');
    expect(quality.numericCoverage).toEqual({
      bucketCount: 3,
      numericLastCount: 2,
      nullLastCount: 1,
      numericCoverageRatio: 2 / 3,
    });
    expect(quality.returnedRowNumericCoverage).toEqual({
      returnedRowCount: 3,
      numericLastCount: 2,
      nullLastCount: 1,
      returnedRowNumericCoverageRatio: 2 / 3,
    });
  });

  it('marks complete minute-grid coverage when every slot is returned', () => {
    const rows = [
      row('2026-10-12T13:06:00Z', 1),
      row('2026-10-12T13:07:00Z', 2),
      row('2026-10-12T13:08:00Z', 3),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows,
    });
    expect(quality.temporalCoverage).toMatchObject({
      expectedMinuteGridSlots: 3,
      observedMinuteGridSlots: 3,
      missingMinuteGridSlots: 0,
      temporalCoverageRatio: 1,
      longestTemporalGapMinutes: 0,
    });
    expect(quality.temporalCompletenessQuality).toBe('COMPLETE_MINUTE_GRID');
    expect(quality.monotonicityGapAware.maxGapAwareMonotonicRunLength).toBe(3);
  });

  it('detects sparse provider responses with high returned-row numeric ratio', () => {
    const rows = [
      row('2026-10-12T13:06:00Z', 1),
      row('2026-10-12T13:16:00Z', 5),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:16:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:16:00Z',
      rows,
    });
    expect(quality.returnedRowNumericCoverage.returnedRowNumericCoverageRatio).toBe(1);
    expect(quality.temporalCoverage.missingMinuteGridSlots).toBe(9);
    expect(quality.temporalCoverage.longestTemporalGapMinutes).toBe(10);
    expect(quality.monotonicityGapAware.maxConsecutiveReturnedRowMonotonicRunLength).toBe(
      2,
    );
    expect(quality.monotonicityGapAware.maxGapAwareMonotonicRunLength).toBe(1);
    expect(quality.temporalCompletenessQuality).toBe('SPARSE_MINUTE_GRID');
  });

  it('handles null-only buckets without conflating them with grid completeness', () => {
    const rows = [
      row('2026-10-12T13:06:00Z', null),
      row('2026-10-12T13:07:00Z', null),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:07:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:07:00Z',
      rows,
    });
    expect(quality.returnedRowNumericCoverage.returnedRowNumericCoverageRatio).toBe(0);
    expect(quality.temporalCoverage.observedMinuteGridSlots).toBe(2);
    expect(quality.energyDerivationQuality).toBe('UNRELIABLE');
  });

  it('classifies post-session negative corrections under padded queries without v1 energy downgrade alone', () => {
    const rows = [
      row('2026-10-12T13:06:00Z', 0.02),
      row('2026-10-12T13:07:00Z', 5.94),
      row('2026-10-12T13:12:00Z', 5.92),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:55.314Z',
      sessionEndInclusive: '2026-10-12T13:07:30.000Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:12:00Z',
      rows,
    });
    expect(quality.boundaryClassifications).not.toContain('IN_SESSION_MONOTONIC');
    expect(quality.monotonicity.negativeDeltas).toBe(1);
    expect(quality.energyDerivationQuality).not.toBe('RELIABLE_FIRST_LAST_IN_SESSION');
  });

  it('detects counter resets and pre-session reset candidates', () => {
    const rows = [
      row('2026-10-12T13:05:00Z', 12.16),
      row('2026-10-12T13:06:00Z', 0),
      row('2026-10-12T13:07:00Z', 0.02),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:55.314Z',
      sessionEndInclusive: '2026-10-12T15:10:30.313Z',
      queryFromInclusive: '2026-10-12T13:05:00Z',
      queryToInclusive: '2026-10-12T13:07:00Z',
      rows,
    });
    expect(quality.boundaryClassifications).toContain('PRE_SESSION_RESET_CANDIDATE');
    expect(quality.resetCandidates).toBeGreaterThan(0);
  });

  it('aligns session-boundary first/last delta with session window', () => {
    const rows = [
      row('2026-10-12T13:06:55.314Z', 0.02),
      row('2026-10-12T13:07:55.314Z', 0.08),
    ];
    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: '2026-10-12T13:06:55.314Z',
      sessionEndInclusive: '2026-10-12T13:08:30.000Z',
      queryFromInclusive: '2026-10-12T13:06:55.314Z',
      queryToInclusive: '2026-10-12T13:08:30.000Z',
      rows,
    });
    expect(quality.counterDeltaFirstLastInSessionKwh).toBeCloseTo(0.06, 8);
    expect(quality.boundaryClassifications).toContain('IN_SESSION_MONOTONIC');
  });

  it('replays sanitized P1D Tesla pilot sparse fixture (115 rows, 9 missing slots)', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, 'fixtures', 'p1d-research', 'p1d-tesla-pilot-sparse-115.json'),
        'utf8',
      ),
    ) as {
      sessionWindow: { from: string; to: string };
      queryWindow: { from: string; to: string };
      rows: HvChargingCounterDimoIntervalRowV1[];
    };

    const quality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: fixture.sessionWindow.from,
      sessionEndInclusive: fixture.sessionWindow.to,
      queryFromInclusive: fixture.queryWindow.from,
      queryToInclusive: fixture.queryWindow.to,
      rows: fixture.rows,
    });

    expect(fixture.rows).toHaveLength(115);
    expect(quality.numericCoverage.numericLastCount).toBe(115);
    expect(quality.numericCoverage.numericCoverageRatio).toBe(1);
    expect(quality.returnedRowNumericCoverage.returnedRowNumericCoverageRatio).toBe(1);
    expect(quality.temporalCoverage.missingMinuteGridSlots).toBe(9);
    expect(quality.temporalCoverage.longestTemporalGapMinutes).toBe(10);
    expect(quality.counterDeltaFirstLastInSessionKwh).toBeCloseTo(
      5.919999867677689,
      10,
    );
    expect(quality.energyDerivationQuality).toBe('RELIABLE_FIRST_LAST_IN_SESSION');
    expect(quality.reliableSessionCounterDelta).toBe(true);
    expect(quality.boundaryClassifications).toContain('IN_SESSION_MONOTONIC');
    expect(quality.temporalCompletenessQuality).toBe('PARTIAL_MINUTE_GRID');
    expect(quality.monotonicity.maxMonotonicRunLength).toBe(115);
    expect(quality.monotonicityGapAware.maxGapAwareMonotonicRunLength).toBeLessThan(
      115,
    );
  });
});
