import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import { assessPlausibilityFlags } from './energy-events-plausibility';
import {
  assessRefuelMovementPlausibility,
  refuelImpliedMovementKmh,
  refuelOdometerDeltaKm,
} from './energy-events-refuel-plausibility';
import { simulateRecoveryWindow } from './energy-events-recovery-dry-run';
import { reconcileRecoveryCandidates } from './energy-events-recovery-reconcile';
import { EnergyEventConfidence } from '@prisma/client';

const VEHICLE_ID = 'clveh1234567890123456789012';

function buildRefuel(overrides: Partial<DimoEnergyEventSegment> = {}): DimoEnergyEventSegment {
  return {
    segmentId: 'dimo-refuel-187336-1724427315000',
    mechanism: 'refuel',
    startTime: '2026-08-23T16:15:15.000Z',
    endTime: '2026-08-23T16:23:16.000Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 481,
    startLatitude: 51.31,
    startLongitude: 9.49,
    endLatitude: 51.31,
    endLongitude: 9.49,
    odometerStartKm: 187423,
    odometerEndKm: 187429,
    fuelStartLiters: 8,
    fuelEndLiters: 26,
    fuelDeltaLiters: 16,
    fuelStartPercent: 13,
    fuelEndPercent: 42,
    fuelDeltaPercent: 29.41,
    socStartPercent: null,
    socEndPercent: null,
    socDeltaPercent: null,
    energyStartKwh: null,
    energyEndKwh: null,
    energyDeltaKwh: null,
    ...overrides,
  };
}

describe('energy-events refuel movement plausibility', () => {
  it('1. KS MX canonical refuel remains valid', () => {
    const ksMx = buildRefuel();
    expect(refuelOdometerDeltaKm(ksMx)).toBe(6);
    expect(refuelImpliedMovementKmh(ksMx)).toBeCloseTo(44.9, 0);
    expect(assessRefuelMovementPlausibility(ksMx)).toEqual([]);
    expect(assessPlausibilityFlags(ksMx)).toEqual([]);
  });

  it('2. +55 L / 73 min / +170 km → MANUAL_REVIEW_REQUIRED', () => {
    const falsePositive = buildRefuel({
      segmentId: 'dimo-refuel-187784-fp-aug8',
      startTime: '2026-08-08T06:59:08.000Z',
      endTime: '2026-08-08T08:12:00.000Z',
      durationSeconds: 73 * 60,
      fuelDeltaLiters: 55,
      fuelDeltaPercent: 83.14,
      odometerStartKm: 1000,
      odometerEndKm: 1170,
    });
    expect(assessPlausibilityFlags(falsePositive)).toContain(
      'refuel_high_odometer_movement',
    );
    const result = simulateRecoveryWindow({
      vehicleId: VEHICLE_ID,
      label: 'HMÜ C 215',
      tokenId: 187784,
      windowFrom: new Date('2026-08-08T00:00:00.000Z'),
      windowTo: new Date('2026-08-09T00:00:00.000Z'),
      segments: [falsePositive],
      mechanismOutcomes: [
        {
          mechanism: 'refuel',
          status: 'SUCCESS_WITH_EVENTS',
          segments: [falsePositive],
          windowFrom: '2026-08-08T00:00:00.000Z',
          windowTo: '2026-08-09T00:00:00.000Z',
          tokenId: 187784,
        },
      ],
      existingEvents: [],
      detectorConfigVersion: 'e2-2026-08',
    });
    expect(result.candidates[0].classification).toBe('MANUAL_REVIEW_REQUIRED');
  });

  it('3. +19 L / 68 min / +122 km → MANUAL_REVIEW_REQUIRED', () => {
    const falsePositive = buildRefuel({
      segmentId: 'dimo-refuel-192922-fp-jul18',
      startTime: '2026-07-18T16:04:54.000Z',
      endTime: '2026-07-18T17:12:54.000Z',
      durationSeconds: 68 * 60,
      fuelDeltaLiters: 19,
      fuelDeltaPercent: 31.76,
      odometerStartKm: 5000,
      odometerEndKm: 5122,
    });
    expect(assessPlausibilityFlags(falsePositive)).toContain(
      'refuel_high_odometer_movement',
    );
  });

  it('4. contradictory liters vs percent → MANUAL_REVIEW_REQUIRED', () => {
    const contradictory = buildRefuel({
      fuelDeltaLiters: 1.5,
      fuelDeltaPercent: 35,
      fuelStartLiters: 10,
      fuelEndLiters: 11.5,
      odometerStartKm: 100,
      odometerEndKm: 118,
      durationSeconds: 7 * 60,
    });
    expect(assessPlausibilityFlags(contradictory)).toContain('fuel_signal_contradiction');
  });

  it('5. stationary plausible refuel remains eligible', () => {
    const stationary = buildRefuel({
      odometerStartKm: 12000,
      odometerEndKm: 12001,
      fuelDeltaLiters: 25,
      fuelDeltaPercent: 40,
      durationSeconds: 15 * 60,
    });
    expect(assessPlausibilityFlags(stationary)).toEqual([]);
  });

  it('6. long sparse-signal rebound with high odometer → manual review', () => {
    const rebound = buildRefuel({
      startTime: '2026-07-18T08:20:45.000Z',
      endTime: '2026-07-18T13:00:00.000Z',
      durationSeconds: 4 * 60 * 60 + 39 * 60,
      fuelDeltaLiters: 36,
      fuelDeltaPercent: 52.94,
      odometerStartKm: 1000,
      odometerEndKm: 1152,
    });
    const flags = assessPlausibilityFlags(rebound);
    expect(flags).toContain('refuel_duration_very_long');
    expect(flags).toContain('refuel_high_odometer_movement');
  });
});

describe('energy-events Tesla recharge sub-segment overlap', () => {
  it('7. subsumed existing sub-segment does not block WOULD_UPDATE parent', () => {
    const candidate = {
      classification: 'WOULD_UPDATE' as const,
      mechanism: 'recharge' as const,
      vehicleId: VEHICLE_ID,
      tokenId: 186946,
      label: 'KS FH 660E',
      dimoSegmentId: 'dimo-recharge-186946-1784220138893',
      coalescedFromSegmentIds: ['dimo-recharge-186946-1784220138893'],
      startTime: '2026-07-16T16:42:18.893Z',
      endTime: '2026-07-16T23:54:02.926Z',
      durationSeconds: 25904,
      fuelDeltaLiters: null,
      fuelDeltaPercent: null,
      socDeltaPercent: 23.6,
      energyDeltaKwh: 11.88,
      odometerStartKm: 179360.33,
      odometerEndKm: 179360.33,
      confidence: EnergyEventConfidence.HIGH,
      detectorConfigVersion: 'e2-2026-08',
      manualReviewReasons: [],
      existingRowId: 'ddb44b81-c475-4c2a-9c70-950470f60f93',
      windowFrom: '2026-07-16T00:00:00.000Z',
      windowTo: '2026-07-17T00:00:00.000Z',
    };
    const existing = new Map([
      [
        VEHICLE_ID,
        [
          {
            id: 'd68012c0-f6e8-4397-b96e-4dc9263df5bb',
            dimoSegmentId: 'dimo-recharge-186946-1784227838927',
            kind: 'RECHARGE',
            startTime: new Date('2026-07-16T18:50:38.927Z'),
            endTime: new Date('2026-07-16T19:22:06.926Z'),
            socDeltaPercent: 1.26,
            energyDeltaKwh: 0.64,
          },
        ],
      ],
    ]);
    const result = reconcileRecoveryCandidates([candidate], existing);
    expect(result.candidates[0].classification).toBe('WOULD_UPDATE');
    expect(result.candidates[0].manualReviewReasons).toEqual([]);
  });
});
