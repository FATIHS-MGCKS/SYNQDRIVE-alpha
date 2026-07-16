import { coldEngineLoadShadowDetector } from './cold-engine-load.shadow-detector';
import { SHADOW_DETECTOR_FRAMEWORK_VERSION } from '../shadow-detector.types';
import type {
  ShadowDetectorExecutionContext,
  ShadowDetectorHfSample,
  ShadowDetectorResult,
} from '../shadow-detector.types';

function hf(
  offsetSec: number,
  over: Partial<ShadowDetectorHfSample> = {},
): ShadowDetectorHfSample {
  const base = new Date('2026-07-16T10:00:00.000Z');
  return {
    timestamp: new Date(base.getTime() + offsetSec * 1000).toISOString(),
    speedKmh: 35,
    coolantC: 40,
    rpm: 4000,
    throttlePct: 60,
    loadPct: 88,
    engineRuntimeSec: 90,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: 2,
    tractionBatteryPowerKw: null,
    ...over,
  };
}

function makeContext(
  over: Partial<ShadowDetectorExecutionContext> & {
    hfOverrides?: Partial<ShadowDetectorHfSample>;
  } = {},
): ShadowDetectorExecutionContext {
  const hfSamples =
    over.hfSamples ??
    Array.from({ length: 10 }, (_, i) => hf(i, over.hfOverrides ?? {}));

  return {
    fuelType: 'PETROL',
    isEvPowertrain: false,
    isPhev: false,
    iceOperationConfirmed: true,
    hfSamples,
    effectiveCadenceMs: 4_000,
    p95CadenceMs: 6_000,
    hfCoverage: 0.85,
    coolantSampleCount: hfSamples.filter((s) => s.coolantC != null).length,
    exteriorTempSampleCount: hfSamples.filter((s) => s.exteriorTempC != null).length,
    misuseCases: [],
    ...over,
  };
}

const tripInput = {
  tripId: 'trip-1',
  vehicleId: 'veh-1',
  organizationId: 'org-1',
  analysisRunId: 'run-1',
  startTime: new Date('2026-07-16T10:00:00Z'),
  endTime: new Date('2026-07-16T10:30:00Z'),
  frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
  resolvedAt: new Date().toISOString(),
};

describe('coldEngineLoadShadowDetector', () => {
  function run(ctx: ShadowDetectorExecutionContext): ShadowDetectorResult {
    return coldEngineLoadShadowDetector.detect({
      ...tripInput,
      executionContext: ctx,
    }) as ShadowDetectorResult;
  }

  it('produces candidate clusters for cold high engine load', () => {
    const result = run(makeContext());

    expect(result.skipped).toBe(false);
    expect(result.candidateEvents.length).toBeGreaterThan(0);
    expect(result.context.candidateNotConfirmedAbuse).toBe(true);
    expect(result.context.publicationBlocked).toBe(true);
    expect(result.modelVersion).toBe('cold-engine-shadow-v1');
  });

  it('returns no candidates for warm coolant', () => {
    const result = run(
      makeContext({
        hfSamples: Array.from({ length: 10 }, (_, i) =>
          hf(i, { coolantC: 90, loadPct: 95, rpm: 5000 }),
        ),
      }),
    );

    expect(result.candidateEvents).toHaveLength(0);
    expect(result.assessability).toBe('FULL');
  });

  it('rejects insufficient context without coolant even if exterior temp exists', () => {
    const samples = Array.from({ length: 10 }, (_, i) =>
      hf(i, { coolantC: null, exteriorTempC: -10, loadPct: 95 }),
    );
    const result = run(
      makeContext({
        hfSamples: samples,
        coolantSampleCount: 0,
        exteriorTempSampleCount: 10,
      }),
    );

    expect(result.candidateEvents).toHaveLength(0);
    expect(result.rejectionReasons).toContain('COOLANT_UNAVAILABLE');
    expect(result.context.exteriorTempNotUsedAsCoolantProxy).toBe(true);
  });

  it('blocks PHEV without confirmed ICE operation', () => {
    const result = run(
      makeContext({
        fuelType: 'PLUGIN_HYBRID',
        isPhev: true,
        iceOperationConfirmed: false,
        hfSamples: Array.from({ length: 10 }, (_, i) =>
          hf(i, { rpm: 0, loadPct: 0, tractionBatteryPowerKw: -20 }),
        ),
      }),
    );

    expect(result.candidateEvents).toHaveLength(0);
    expect(result.rejectionReasons).toContain('ICE_OPERATION_NOT_CONFIRMED');
  });
});
