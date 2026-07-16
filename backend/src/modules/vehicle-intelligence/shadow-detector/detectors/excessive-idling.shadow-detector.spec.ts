import { excessiveIdlingShadowDetector } from './excessive-idling.shadow-detector';
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
  const base = new Date('2026-07-16T12:00:00.000Z');
  return {
    timestamp: new Date(base.getTime() + offsetSec * 1000).toISOString(),
    speedKmh: 0,
    coolantC: 90,
    rpm: 800,
    throttlePct: 5,
    loadPct: 12,
    engineRuntimeSec: 100,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: 20,
    tractionBatteryPowerKw: null,
    altitudeM: null,
    gear: null,
    ignitionOn: true,
    ...over,
  };
}

const capability: ShadowDetectorCapabilitySnapshot = {
  status: 'CONTEXT_ONLY',
  missingRequirements: [],
  effectiveCadenceMs: 4_000,
  p95CadenceMs: 6_000,
  coverage: 0.85,
};

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

describe('excessiveIdlingShadowDetector', () => {
  function run(
    ctx: ShadowDetectorExecutionContext,
    cap: ShadowDetectorCapabilitySnapshot = capability,
  ): ShadowDetectorResult {
    return excessiveIdlingShadowDetector.detect({
      ...tripInput,
      executionContext: ctx,
      activeDetectorCapability: cap,
    }) as ShadowDetectorResult;
  }

  it('does not emit for short traffic-light stop', () => {
    const hfSamples = Array.from({ length: 75 }, (_, i) =>
      hf(i, { speedKmh: 0, rpm: 820 }),
    );
    const result = run(
      baseShadowExecutionContext({
        hfSamples,
        speedSampleCount: 75,
        rpmSampleCount: 75,
        ignitionSampleCount: 75,
      }),
    );
    expect(result.candidateEvents).toHaveLength(0);
  });

  it('emits EXCESSIVE_IDLING for long HF idle phase', () => {
    const hfSamples = Array.from({ length: 200 }, (_, i) =>
      hf(i, { speedKmh: 0, rpm: 850, engineRuntimeSec: 100 + i * 1 }),
    );
    const result = run(
      baseShadowExecutionContext({
        hfSamples,
        speedSampleCount: 200,
        rpmSampleCount: 200,
        engineRuntimeSampleCount: 200,
        ignitionSampleCount: 200,
      }),
    );
    expect(result.candidateEvents[0]?.eventType).toBe('EXCESSIVE_IDLING');
    expect(result.context.notConfirmedAbuse).toBe(true);
    expect(result.context.dimoIdlingSupplementaryOnly).toBe(true);
  });

  it('uses DIMO idling segment when HF cadence gate fails', () => {
    const result = run(
      baseShadowExecutionContext({
        hfSamples: [hf(0, { speedKmh: 0 })],
        speedSampleCount: 1,
        effectiveCadenceMs: 60_000,
        hfCoverage: 0.1,
        dimoIdlingSegments: [
          {
            segmentId: 'dimo-idle-1',
            startTime: '2026-01-01T09:55:00.000Z',
            endTime: '2026-01-01T10:05:00.000Z',
            durationSeconds: 600,
            maxSpeedKmh: 0,
          },
        ],
      }),
    );
    expect(result.candidateEvents).toHaveLength(1);
    expect(result.context.dimoIdlingSegmentCount).toBe(1);
    expect(String(result.context.clusterSummary)).toContain('dimo-idle-1');
  });
});
