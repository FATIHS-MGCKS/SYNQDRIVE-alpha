import { readFileSync } from 'fs';
import { resolve } from 'path';
import { evaluateHvChargingCounterCapabilityV1 } from './hv-charging-counter-evidence.capability-eval.v1';

describe('hv-charging-counter-evidence.capability-eval.v1', () => {
  it('does not treat all-null energy buckets as capability success', () => {
    const evalResult = evaluateHvChargingCounterCapabilityV1([
      { timestamp: '2026-10-12T12:37:00Z', addedKwhLast: null, addedKwhMin: null, addedKwhMax: null },
      { timestamp: '2026-10-12T12:38:00Z', addedKwhLast: null },
    ]);
    expect(evalResult.verdict).toBe('QUERY_SUCCESS_SIGNAL_UNAVAILABLE');
    expect(evalResult.bucketsWithNumericLast).toBe(0);
  });

  it('evaluates R15 fixture episode with numeric LAST and gaps', () => {
    const fixturePath = resolve(
      __dirname,
      '../hv-h4/fixtures/r15-dimo-added-energy-interval.v1.fixture.json',
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      episodes: Array<{ id: string; buckets: Array<Record<string, unknown>> }>;
    };
    const episode = fixture.episodes.find((row) => row.id === 'oct12_session_3e5fe028');
    expect(episode).toBeDefined();
    const rows = episode!.buckets.map((bucket) => ({
      timestamp: String(bucket.timestamp),
      addedKwhLast: bucket.addedKwhLast as number | null,
      addedKwhMin: bucket.addedKwhMin as number | null,
      addedKwhMax: bucket.addedKwhMax as number | null,
    }));

    const evalResult = evaluateHvChargingCounterCapabilityV1(rows);
    expect(evalResult.querySucceeded).toBe(true);
    expect(evalResult.bucketsWithNumericLast).toBeGreaterThan(0);
    expect(evalResult.bucketsWithMinMax).toBeGreaterThan(0);
    expect(evalResult.gapCount).toBeGreaterThan(0);
    expect([
      'QUERY_SUCCESS_SIGNAL_PLAUSIBLE',
      'QUERY_SUCCESS_SIGNAL_PRESENT_NOT_PLAUSIBLE',
    ]).toContain(evalResult.verdict);
  });
});
