import { sustainedHighLoadShadowDetector } from './sustained-high-load.shadow-detector';
import { baseShadowExecutionContext } from './shadow-detector-test-context';
import { SHADOW_DETECTOR_FRAMEWORK_VERSION } from '../shadow-detector.types';
import type {
  ShadowDetectorCapabilitySnapshot,
  ShadowDetectorExecutionContext,
  ShadowDetectorHfSample,
  ShadowDetectorResult,
} from '../shadow-detector.types';

function hf(
  offsetSec: number,
  over: Partial<ShadowDetectorHfSample> = {},
): ShadowDetectorHfSample {
  const base = new Date('2026-07-16T11:00:00.000Z');
  return {
    timestamp: new Date(base.getTime() + offsetSec * 1000).toISOString(),
    speedKmh: 120,
    coolantC: 90,
    rpm: 3400,
    throttlePct: 72,
    loadPct: 84,
    engineRuntimeSec: 800,
    torqueNm: null,
    torquePct: 75,
    exteriorTempC: 20,
    tractionBatteryPowerKw: null,
    altitudeM: 300,
    gear: null,
    ignitionOn: null,
    ...over,
  };
}

const capability: ShadowDetectorCapabilitySnapshot = {
  status: 'SHADOW',
  missingRequirements: [],
  effectiveCadenceMs: 4_000,
  p95CadenceMs: 6_000,
  coverage: 0.85,
};

function makeContext(
  over: Partial<ShadowDetectorExecutionContext> = {},
): ShadowDetectorExecutionContext {
  const hfSamples =
    over.hfSamples ??
    Array.from({ length: 25 }, (_, i) => hf(i));

  return baseShadowExecutionContext({
    hfSamples,
    coolantSampleCount: hfSamples.filter((s) => s.coolantC != null).length,
    exteriorTempSampleCount: 10,
    rpmSampleCount: hfSamples.filter((s) => s.rpm != null).length,
    speedSampleCount: hfSamples.filter((s) => s.speedKmh != null).length,
    ignitionSampleCount: hfSamples.filter((s) => s.ignitionOn != null).length,
    engineRuntimeSampleCount: hfSamples.filter((s) => s.engineRuntimeSec != null).length,
    ...over,
  });
}

const tripInput = {
  tripId: 'trip-1',
  vehicleId: 'veh-1',
  organizationId: 'org-1',
  analysisRunId: 'run-1',
  startTime: new Date('2026-07-16T11:00:00Z'),
  endTime: new Date('2026-07-16T11:30:00Z'),
  frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
  resolvedAt: new Date().toISOString(),
};

describe('sustainedHighLoadShadowDetector', () => {
  function run(
    ctx: ShadowDetectorExecutionContext,
    cap: ShadowDetectorCapabilitySnapshot = capability,
  ): ShadowDetectorResult {
    return sustainedHighLoadShadowDetector.detect({
      ...tripInput,
      executionContext: ctx,
      activeDetectorCapability: cap,
    }) as ShadowDetectorResult;
  }

  it('produces sustained load candidates for highway context', () => {
    const result = run(makeContext());
    expect(result.candidateEvents.length).toBeGreaterThan(0);
    expect(result.candidateEvents[0].eventType).toBe('SUSTAINED_HIGH_ENGINE_LOAD');
    expect(result.context.vehicleLoadContextOnly).toBe(true);
    expect(result.context.noCustomerJudgment).toBe(true);
    expect(result.context.noHealthImpact).toBe(true);
  });

  it('rejects evaluation without detector capability', () => {
    const result = sustainedHighLoadShadowDetector.detect({
      ...tripInput,
      executionContext: makeContext(),
      activeDetectorCapability: null,
    }) as ShadowDetectorResult;

    expect(result.candidateEvents).toHaveLength(0);
    expect(result.rejectionReasons).toContain('NO_DETECTOR_CAPABILITY');
  });

  it('returns no candidates for short peaks', () => {
    const shortSeries = Array.from({ length: 6 }, (_, i) => hf(i, { loadPct: 95 }));
    const result = run(makeContext({ hfSamples: shortSeries }));
    expect(result.candidateEvents).toHaveLength(0);
  });

  it('reduces confidence for uphill context vs highway', () => {
    const highway = run(
      makeContext({
        hfSamples: Array.from({ length: 25 }, (_, i) =>
          hf(i, { speedKmh: 130, altitudeM: 300 + i * 0.1 }),
        ),
      }),
    );
    const uphill = run(
      makeContext({
        hfSamples: Array.from({ length: 25 }, (_, i) =>
          hf(i, { speedKmh: 50, altitudeM: 400 + i * 1.5, loadPct: 80 }),
        ),
      }),
    );

    expect(highway.candidateEvents.length).toBeGreaterThan(0);
    expect(uphill.candidateEvents.length).toBeGreaterThan(0);
    expect(uphill.confidence).not.toBeNull();
    expect(highway.confidence).not.toBeNull();
    expect(uphill.confidence!).toBeLessThan(highway.confidence!);
    expect(uphill.context.uphillReducesConfidenceOnly).toBe(true);
  });
});
