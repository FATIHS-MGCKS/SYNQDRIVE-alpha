import { BatteryMeasurementQuality } from '@prisma/client';
import type { BatteryStartProxyCrankPoint } from './battery-start-proxy.policy';
import { evaluateStartProxyCadenceGate } from './battery-start-proxy-cadence-gate';

const TRIP_START = new Date('2026-07-16T12:00:00.000Z');
const EVAL_AT = new Date('2026-07-16T12:03:00.000Z');

function seriesEveryMs(
  startMs: number,
  stepMs: number,
  count: number,
  voltage = 12.4,
): BatteryStartProxyCrankPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const ms = startMs + index * stepMs;
    return {
      timestamp: new Date(ms).toISOString(),
      voltage,
      rpm: ms >= TRIP_START.getTime() ? 600 : 0,
    };
  });
}

describe('evaluateStartProxyCadenceGate', () => {
  const startMs = TRIP_START.getTime();

  it('classifies 5s cadence as VALID_PROXY with labeled recoveries', () => {
    const points = seriesEveryMs(startMs - 25_000, 5_000, 35, 12.4);
    points[7].voltage = 11.8;
    const result = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quality).toBe(BatteryMeasurementQuality.VALID_PROXY);
    expect(result.metrics.medianIntervalMs).toBe(5_000);
    expect(result.values?.recovery5sLabel).toBe('RECOVERY_5S');
    expect(result.values?.vRecovery5s).not.toBeNull();
  });

  it('classifies 1s cadence as VALID_PROXY when coverage is sufficient', () => {
    const points = seriesEveryMs(startMs - 20_000, 1_000, 170, 12.35);
    const result = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(true);
    expect(result.metrics.medianIntervalMs).toBe(1_000);
  });

  it('classifies 20s cadence as INSUFFICIENT_CADENCE', () => {
    const points = seriesEveryMs(startMs - 20_000, 20_000, 9, 12.3);
    const result = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.quality).toBe(BatteryMeasurementQuality.INSUFFICIENT_CADENCE);
    expect(result.values).toBeNull();
  });

  it('classifies sparse gaps as INSUFFICIENT_COVERAGE', () => {
    const points = [
      { timestamp: new Date(startMs - 10_000).toISOString(), voltage: 12.5, rpm: 0 },
      { timestamp: new Date(startMs - 5_000).toISOString(), voltage: 12.4, rpm: 0 },
      { timestamp: new Date(startMs).toISOString(), voltage: 12.1, rpm: 500 },
    ];
    const result = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.quality).toBe(BatteryMeasurementQuality.INSUFFICIENT_COVERAGE);
  });

  it('classifies empty input as NO_DATA', () => {
    const result = evaluateStartProxyCadenceGate({
      points: [],
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.quality).toBe(BatteryMeasurementQuality.NO_DATA);
  });

  it('uses RECOVERY_PROXY when recovery point is outside ±5s tolerance', () => {
    const points = seriesEveryMs(startMs - 25_000, 5_000, 35, 12.4).filter((point) => {
      const offset = new Date(point.timestamp).getTime() - startMs;
      return offset < 25_000 || offset > 35_000;
    });
    const result = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metrics.recovery30s?.label).toBe('RECOVERY_PROXY');
    expect(result.values?.vRecovery30s).toBeNull();
    expect(result.values?.recovery30sLabel).toBe('RECOVERY_PROXY');
  });

  it('classifies PROVIDER_DELAY when newest point is too old at evaluation', () => {
    const points = seriesEveryMs(startMs - 25_000, 5_000, 10, 12.4);
    const result = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: new Date(startMs + 400_000),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.quality).toBe(BatteryMeasurementQuality.PROVIDER_DELAY);
  });

  it('classifies high duplicate share as TIMESTAMP_INCONSISTENT', () => {
    const points = seriesEveryMs(startMs - 20_000, 5_000, 12, 12.4);
    const duplicated = [...points, ...points];
    const result = evaluateStartProxyCadenceGate({
      points: duplicated,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.quality).toBe(BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT);
  });
});
