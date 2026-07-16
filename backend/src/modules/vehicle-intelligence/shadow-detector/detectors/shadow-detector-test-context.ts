import type { ShadowDetectorExecutionContext } from '../shadow-detector.types';

export function baseShadowExecutionContext(
  over: Partial<ShadowDetectorExecutionContext> = {},
): ShadowDetectorExecutionContext {
  return {
    fuelType: 'PETROL',
    isEvPowertrain: false,
    isPhev: false,
    iceOperationConfirmed: true,
    hfSamples: [],
    effectiveCadenceMs: 4_000,
    p95CadenceMs: 6_000,
    hfCoverage: 0.85,
    coolantSampleCount: 0,
    exteriorTempSampleCount: 0,
    misuseCases: [],
    tripContext: {
      tripStartTime: '2026-07-16T12:00:00.000Z',
      tripEndTime: '2026-07-16T13:00:00.000Z',
      tripDurationMs: 3_600_000,
    },
    dimoIdlingSegments: [],
    dimoIdlingProviderError: null,
    ignitionSampleCount: 0,
    rpmSampleCount: 0,
    speedSampleCount: 0,
    engineRuntimeSampleCount: 0,
    tractionBatteryPowerSampleCount: 0,
    socSampleCount: 0,
    tractionBatteryTemperatureSampleCount: 0,
    providerGaps: [],
    ...over,
  };
}
