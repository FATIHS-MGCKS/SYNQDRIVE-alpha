import { BatteryMeasurementQuality } from '@prisma/client';
import type { HvMeasurementQualitySessionInput } from './hv-measurement-quality.types';

const M3_VALIDATION_NATIVE_PROVENANCE = 'TEMPORAL_BOUNDARY_V1';

export function qualifiedPartialSession(
  overrides: Partial<HvMeasurementQualitySessionInput> = {},
): HvMeasurementQualitySessionInput {
  return {
    sessionId: 'sess-qualified',
    startAt: new Date('2026-10-16T13:15:02.931Z'),
    endAt: new Date('2026-10-16T19:52:53.932Z'),
    source: 'DIMO_RECHARGE_SEGMENT',
    isOngoing: false,
    startSocPercent: 66.4,
    endSocPercent: 100,
    startEnergyKwh: 30,
    endEnergyKwh: 46.5,
    energyAddedKwh: 16.5,
    deltaSocPercent: 33.6,
    measurementQuality: BatteryMeasurementQuality.SHADOW,
    metadata: {
      durationSeconds: 20_000,
      qualityStatus: 'QUALIFIED',
      capacityValidationEligible: true,
      capacityShadowEligible: true,
      addedEnergyProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
      socProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
      qualityReasonCodes: ['soc_delta_qualified'],
      isChargingObservedAny: true,
    },
    ...overrides,
  };
}
