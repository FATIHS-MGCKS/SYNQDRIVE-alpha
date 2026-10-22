import { describe, expect, it } from 'vitest';
import type { LvMeasuredVoltagePointV1 } from './lv-measured-intelligence.types';
import {
  LV_VOLTAGE_CHART_MAX_GAP_MS,
  chartPointsWithGapBreaks,
  countMeasurementGaps,
  defaultMeasuredHistoryFromDate,
  mapMeasuredPointsToChartPoints,
  parseDatetimeLocalInputValue,
  toDatetimeLocalInputValue,
} from './lv-measured-voltage-chart.util';

function point(
  iso: string,
  v: number,
  overrides: Partial<LvMeasuredVoltagePointV1> = {},
): LvMeasuredVoltagePointV1 {
  return {
    epistemicBand: 'MEASURED',
    observationId: `obs-${iso}`,
    sourceMeasurementId: `src-${iso}`,
    voltageV: v,
    voltageObservedAt: iso,
    providerObservationAt: null,
    providerTimestampSource: null,
    operationalContext: 'REST',
    evidenceClass: 'PARKED_REST_CANDIDATE',
    restSessionId: null,
    actualRestAgeHours: null,
    nominalLadderLabel: null,
    isLvCharging: false,
    engineRunning: false,
    ...overrides,
  };
}

describe('lv-measured-voltage-chart.util', () => {
  it('returns empty for zero points', () => {
    expect(mapMeasuredPointsToChartPoints([])).toEqual([]);
    expect(chartPointsWithGapBreaks([])).toEqual([]);
    expect(countMeasurementGaps([])).toBe(0);
  });

  it('maps a single point with visible chart metadata', () => {
    const rows = mapMeasuredPointsToChartPoints([point('2026-10-21T12:00:00.000Z', 12.6)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].v).toBe(12.6);
    expect(rows[0].segmentId).toBe(0);
  });

  it('maps two adjacent points into one segment', () => {
    const rows = mapMeasuredPointsToChartPoints([
      point('2026-10-21T12:00:00.000Z', 12.5),
      point('2026-10-21T13:00:00.000Z', 12.55),
    ]);
    expect(rows.every((r) => r.segmentId === 0)).toBe(true);
    expect(countMeasurementGaps(rows)).toBe(0);
  });

  it('splits segments and inserts null breaks across large gaps', () => {
    const t0 = Date.parse('2026-10-21T12:00:00.000Z');
    const t1 = new Date(t0 + LV_VOLTAGE_CHART_MAX_GAP_MS * 2).toISOString();
    const rows = mapMeasuredPointsToChartPoints([
      point('2026-10-21T12:00:00.000Z', 12.5),
      point(t1, 12.4),
    ]);
    expect(countMeasurementGaps(rows)).toBe(1);
    expect(rows[1].segmentId).toBe(1);
    const broken = chartPointsWithGapBreaks(rows);
    expect(broken.some((r) => r.v === null)).toBe(true);
  });

  it('handles many points in chronological order', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      point(new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 3600_000).toISOString(), 12 + i * 0.01),
    );
    const rows = mapMeasuredPointsToChartPoints(many);
    expect(rows).toHaveLength(40);
    expect(rows[0].t).toBeLessThan(rows[39].t);
  });

  it('parses datetime-local in local timezone for API ISO conversion', () => {
    const local = toDatetimeLocalInputValue(new Date('2026-10-21T15:30:00'));
    const parsed = parseDatetimeLocalInputValue(local);
    expect(parsed.toISOString()).toBe(new Date('2026-10-21T15:30:00').toISOString());
  });

  it('default history from is 14 days before now', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const from = defaultMeasuredHistoryFromDate(now);
    const diffDays = (now.getTime() - from.getTime()) / (24 * 3600_000);
    expect(diffDays).toBe(14);
  });
});
