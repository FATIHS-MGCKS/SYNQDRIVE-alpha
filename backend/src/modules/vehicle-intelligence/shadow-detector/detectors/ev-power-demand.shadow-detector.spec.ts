import { evPowerDemandShadowDetector } from './ev-power-demand.shadow-detector';
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
  const base = new Date('2026-07-16T14:00:00.000Z');
  return {
    timestamp: new Date(base.getTime() + offsetSec * 1000).toISOString(),
    speedKmh: 60,
    coolantC: null,
    rpm: null,
    throttlePct: null,
    loadPct: null,
    engineRuntimeSec: null,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: 20,
    tractionBatteryPowerKw: null,
    socPct: null,
    tractionBatteryTemperatureC: null,
    altitudeM: 250,
    gear: null,
    ignitionOn: null,
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

const tripInput = {
  tripId: 'trip-ev-1',
  vehicleId: 'veh-ev-1',
  organizationId: 'org-1',
  analysisRunId: 'run-1',
  startTime: new Date('2026-07-16T14:00:00Z'),
  endTime: new Date('2026-07-16T14:30:00Z'),
  frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
  resolvedAt: new Date().toISOString(),
};

describe('evPowerDemandShadowDetector', () => {
  function run(
    ctx: ShadowDetectorExecutionContext,
    cap: ShadowDetectorCapabilitySnapshot = capability,
  ): ShadowDetectorResult {
    return evPowerDemandShadowDetector.detect({
      ...tripInput,
      executionContext: ctx,
      activeDetectorCapability: cap,
    }) as ShadowDetectorResult;
  }

  it('rejects when traction battery power signal is missing', () => {
    const hfSamples = Array.from({ length: 20 }, (_, i) =>
      hf(i, { speedKmh: 70, tractionBatteryPowerKw: null }),
    );
    const result = run(
      baseShadowExecutionContext({
        fuelType: 'ELECTRIC',
        isEvPowertrain: true,
        hfSamples,
        speedSampleCount: 20,
        tractionBatteryPowerSampleCount: 0,
        providerGaps: ['MISSING_TRACTION_BATTERY_POWER'],
      }),
    );
    expect(result.candidateEvents).toHaveLength(0);
    expect(result.rejectionReasons).toContain('MISSING_TRACTION_BATTERY_POWER');
    expect(result.context.vehicleLoadContextOnly).toBe(true);
    expect(result.context.noCustomerJudgment).toBe(true);
    expect(result.context.noHealthImpact).toBe(true);
  });

  it('emits HIGH_EV_POWER_DEMAND when power signal is present', () => {
    const hfSamples = Array.from({ length: 20 }, (_, i) =>
      hf(i, {
        speedKmh: 35 + i * 3,
        tractionBatteryPowerKw: -95,
        socPct: 68,
        tractionBatteryTemperatureC: 30,
      }),
    );
    const result = run(
      baseShadowExecutionContext({
        fuelType: 'ELECTRIC',
        isEvPowertrain: true,
        hfSamples,
        effectiveCadenceMs: 3_000,
        hfCoverage: 0.9,
        speedSampleCount: 20,
        tractionBatteryPowerSampleCount: 20,
        socSampleCount: 20,
        tractionBatteryTemperatureSampleCount: 20,
        exteriorTempSampleCount: 20,
      }),
    );
    expect(result.candidateEvents[0]?.eventType).toBe('HIGH_EV_POWER_DEMAND');
    expect(result.context.notAggressiveDriverClaim).toBe(true);
    expect(result.context.signConvention).toBe('NEGATIVE_IS_DISCHARGE');
    expect(result.context.vehicleLoadContextOnly).toBe(true);
    expect(result.context.publicationBlocked).toBe(true);
  });

  it('skips non-EV powertrains', () => {
    const result = run(
      baseShadowExecutionContext({
        fuelType: 'PETROL',
        isEvPowertrain: false,
        hfSamples: [hf(0, { tractionBatteryPowerKw: -100 })],
        tractionBatteryPowerSampleCount: 1,
      }),
    );
    expect(result.rejectionReasons).toContain('POWERTRAIN_NOT_APPLICABLE');
  });
});
