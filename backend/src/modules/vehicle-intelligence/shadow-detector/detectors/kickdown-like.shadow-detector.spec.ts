import { kickdownLikeShadowDetector } from './kickdown-like.shadow-detector';
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
  const base = new Date('2026-07-16T12:00:00.000Z');
  return {
    timestamp: new Date(base.getTime() + offsetSec * 1000).toISOString(),
    speedKmh: 60,
    coolantC: 88,
    rpm: 2200,
    throttlePct: 30,
    loadPct: 45,
    engineRuntimeSec: 500,
    torqueNm: null,
    torquePct: 50,
    exteriorTempC: 18,
    tractionBatteryPowerKw: null,
    altitudeM: 150,
    gear: null,
    ...over,
  };
}

const capability: ShadowDetectorCapabilitySnapshot = {
  status: 'SHADOW',
  missingRequirements: [],
  effectiveCadenceMs: 3_000,
  p95CadenceMs: 5_000,
  coverage: 0.9,
};

function makeContext(
  over: Partial<ShadowDetectorExecutionContext> = {},
): ShadowDetectorExecutionContext {
  const hfSamples =
    over.hfSamples ??
    Array.from({ length: 12 }, (_, i) => {
      if (i <= 2) {
        return hf(i, {
          throttlePct: i === 0 ? 22 : i === 1 ? 58 : 93,
          rpm: 2000 + i * 550,
          speedKmh: 52 + i * 9,
          loadPct: 45 + i * 18,
          torquePct: 48 + i * 12,
        });
      }
      return hf(i, { throttlePct: 40, rpm: 2400, speedKmh: 72, loadPct: 50 });
    });

  return {
    fuelType: 'PETROL',
    isEvPowertrain: false,
    isPhev: false,
    iceOperationConfirmed: true,
    hfSamples,
    effectiveCadenceMs: 3_000,
    p95CadenceMs: 5_000,
    hfCoverage: 0.9,
    coolantSampleCount: hfSamples.length,
    exteriorTempSampleCount: hfSamples.length,
    misuseCases: [],
    ...over,
  };
}

const tripInput = {
  tripId: 'trip-1',
  vehicleId: 'veh-1',
  organizationId: 'org-1',
  analysisRunId: 'run-1',
  startTime: new Date('2026-07-16T12:00:00Z'),
  endTime: new Date('2026-07-16T12:30:00Z'),
  frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
  resolvedAt: new Date().toISOString(),
};

describe('kickdownLikeShadowDetector', () => {
  function run(
    ctx: ShadowDetectorExecutionContext,
    cap: ShadowDetectorCapabilitySnapshot = capability,
  ): ShadowDetectorResult {
    return kickdownLikeShadowDetector.detect({
      ...tripInput,
      executionContext: ctx,
      activeDetectorCapability: cap,
    }) as ShadowDetectorResult;
  }

  it('emits KICKDOWN_LIKE_PROXY without claiming real kickdown', () => {
    const result = run(makeContext());
    expect(result.candidateEvents.length).toBeGreaterThan(0);
    expect(result.candidateEvents[0].eventType).toBe('KICKDOWN_LIKE_PROXY');
    expect(result.context.notARealKickdown).toBe(true);
    expect(result.context.noMisuse).toBe(true);
    expect(result.context.noCustomerJudgment).toBe(true);
    expect(result.context.capabilityStatus).toBe('SHADOW');
    expect(result.capabilityStatus).toBe('SHADOW');
  });

  it('works without gear signal (proxy only)', () => {
    const result = run(makeContext());
    expect(result.context.gearSignalAvailable).toBe(false);
    expect(result.candidateEvents.every((e) => e.eventType === 'KICKDOWN_LIKE_PROXY')).toBe(
      true,
    );
  });

  it('documents gear context when gear signal is present', () => {
    const withGear = makeContext({
      hfSamples: [
        hf(0, { throttlePct: 18, rpm: 2100, speedKmh: 48, gear: 5, loadPct: 48 }),
        hf(1, { throttlePct: 62, rpm: 2900, speedKmh: 57, gear: 4, loadPct: 70 }),
        hf(2, { throttlePct: 95, rpm: 3600, speedKmh: 67, gear: 3, loadPct: 85 }),
        ...Array.from({ length: 9 }, (_, i) => hf(i + 3)),
      ],
    });
    const result = run(withGear);
    expect(result.context.gearSignalAvailable).toBe(true);
    expect(result.context.gearClusterCount).toBeGreaterThan(0);
    expect(typeof result.context.clusterSummary).toBe('string');
  });

  it('rejects without capability and ignores normal acceleration', () => {
    const noCap = kickdownLikeShadowDetector.detect({
      ...tripInput,
      executionContext: makeContext(),
      activeDetectorCapability: null,
    }) as ShadowDetectorResult;
    expect(noCap.rejectionReasons).toContain('NO_DETECTOR_CAPABILITY');

    const gradual = makeContext({
      hfSamples: Array.from({ length: 12 }, (_, i) =>
        hf(i, {
          throttlePct: 25 + i * 4,
          rpm: 2000 + i * 100,
          speedKmh: 45 + i * 2,
          loadPct: 35 + i * 3,
        }),
      ),
    });
    expect(run(gradual).candidateEvents).toHaveLength(0);
  });
});
