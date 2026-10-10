import type { EnergyEvent } from '../../../../lib/api';

export function wob7503Refuel20261009(overrides: Partial<EnergyEvent> = {}): EnergyEvent {
  return {
    id: '412f17f7-7380-4dd0-8e24-6939be4809d6',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    dimoSegmentId: 'dimo-refuel-192922-1791567172000',
    kind: 'REFUEL',
    detectionMechanism: 'refuel',
    startTime: '2026-10-09T17:32:55.000Z',
    endTime: '2026-10-09T19:09:13.000Z',
    durationSeconds: 5780,
    startLatitude: 52.42,
    startLongitude: 10.79,
    endLatitude: 52.42,
    endLongitude: 10.79,
    fuelDeltaLiters: 18,
    fuelDeltaPercent: 32,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 10893,
    odometerEndKm: 10910,
    confidence: 'HIGH',
    fuelLevelRiseStart: '2026-10-09T18:48:52.000Z',
    fuelLevelRiseEnd: '2026-10-09T18:55:22.000Z',
    fuelLevelRiseDurationSeconds: 390,
    ...overrides,
  };
}
