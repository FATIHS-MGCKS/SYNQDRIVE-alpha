import { highRpmStationaryShadowDetector } from './high-rpm-stationary.shadow-detector';
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
    rpm: 2800,
    throttlePct: 10,
    loadPct: 15,
    engineRuntimeSec: 120,
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
  status: 'SHADOW',
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

describe('highRpmStationaryShadowDetector', () => {
  function run(
    ctx: ShadowDetectorExecutionContext,
    cap: ShadowDetectorCapabilitySnapshot = capability,
  ): ShadowDetectorResult {
    return highRpmStationaryShadowDetector.detect({
      ...tripInput,
      executionContext: ctx,
      activeDetectorCapability: cap,
    }) as ShadowDetectorResult;
  }

  it('rejects BEV powertrains without abuse classification', () => {
    const result = run(
      baseShadowExecutionContext({
        isEvPowertrain: true,
        fuelType: 'ELECTRIC',
        hfSamples: [hf(0, { rpm: 3000 })],
        rpmSampleCount: 1,
      }),
    );
    expect(result.candidateEvents).toHaveLength(0);
    expect(result.rejectionReasons).toContain('POWERTRAIN_NOT_APPLICABLE');
    expect(result.context.noMisuse).toBe(true);
  });

  it('emits HIGH_RPM_WHILE_STATIONARY_PROXY for parking revving', () => {
    const hfSamples = Array.from({ length: 6 }, (_, i) =>
      hf(i, { speedKmh: 0, rpm: 2800, engineRuntimeSec: 120 + i }),
    );
    const result = run(
      baseShadowExecutionContext({
        hfSamples,
        rpmSampleCount: 6,
        speedSampleCount: 6,
        engineRuntimeSampleCount: 6,
        ignitionSampleCount: 6,
      }),
    );
    expect(result.candidateEvents[0]?.eventType).toBe('HIGH_RPM_WHILE_STATIONARY_PROXY');
    expect(result.context.publicationBlocked).toBe(true);
    expect(result.context.notConfirmedAbuse).toBe(true);
  });
});
