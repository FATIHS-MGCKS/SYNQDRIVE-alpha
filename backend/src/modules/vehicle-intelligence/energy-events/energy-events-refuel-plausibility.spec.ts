import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import { assessPlausibilityFlags } from './energy-events-plausibility';
import {
  assessRefuelMovementPlausibility,
  refuelImpliedMovementKmh,
  refuelOdometerDeltaKm,
} from './energy-events-refuel-plausibility';
import { simulateRecoveryWindow } from './energy-events-recovery-dry-run';
import { reconcileRecoveryCandidates } from './energy-events-recovery-reconcile';
import {
  SYNTHETIC_CANONICAL_REFUEL_DURATION_SECONDS,
  SYNTHETIC_CANONICAL_REFUEL_END,
  SYNTHETIC_CANONICAL_REFUEL_LITERS,
  SYNTHETIC_CANONICAL_REFUEL_ODOMETER_END_KM,
  SYNTHETIC_CANONICAL_REFUEL_ODOMETER_START_KM,
  SYNTHETIC_CANONICAL_REFUEL_SEGMENT_ID,
  SYNTHETIC_CANONICAL_REFUEL_START,
  SYNTHETIC_EV_RECHARGE_SEGMENT_ID,
  SYNTHETIC_EV_TOKEN_ID,
  SYNTHETIC_EXISTING_RECHARGE_ROW_ID,
  SYNTHETIC_ICE_A_TOKEN_ID,
  SYNTHETIC_LEGACY_SUBSEGMENT_ROW_ID,
  SYNTHETIC_VEHICLE_ID,
} from './energy-events-recovery.test-fixtures';
import { EnergyEventConfidence } from '@prisma/client';

function buildRefuel(overrides: Partial<DimoEnergyEventSegment> = {}): DimoEnergyEventSegment {
  return {
    segmentId: SYNTHETIC_CANONICAL_REFUEL_SEGMENT_ID,
    mechanism: 'refuel',
    startTime: SYNTHETIC_CANONICAL_REFUEL_START,
    endTime: SYNTHETIC_CANONICAL_REFUEL_END,
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: SYNTHETIC_CANONICAL_REFUEL_DURATION_SECONDS,
    startLatitude: 51.31,
    startLongitude: 9.49,
    endLatitude: 51.31,
    endLongitude: 9.49,
    odometerStartKm: SYNTHETIC_CANONICAL_REFUEL_ODOMETER_START_KM,
    odometerEndKm: SYNTHETIC_CANONICAL_REFUEL_ODOMETER_END_KM,
    fuelStartLiters: 8,
    fuelEndLiters: 24,
    fuelDeltaLiters: SYNTHETIC_CANONICAL_REFUEL_LITERS,
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
  it('1. canonical refuel remains valid', () => {
    const canonical = buildRefuel();
    expect(refuelOdometerDeltaKm(canonical)).toBe(6);
    expect(refuelImpliedMovementKmh(canonical)).toBeCloseTo(44.9, 0);
    expect(assessRefuelMovementPlausibility(canonical)).toEqual([]);
    expect(assessPlausibilityFlags(canonical)).toEqual([]);
  });

  it('2. +55 L / 73 min / +170 km → MANUAL_REVIEW_REQUIRED', () => {
    const falsePositive = buildRefuel({
      segmentId: 'dimo-refuel-100002-fp-aug8',
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
      vehicleId: SYNTHETIC_VEHICLE_ID,
      label: 'AUDIT_ICE_A',
      tokenId: SYNTHETIC_ICE_A_TOKEN_ID,
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
          tokenId: SYNTHETIC_ICE_A_TOKEN_ID,
        },
      ],
      existingEvents: [],
      detectorConfigVersion: 'e2-2026-08',
    });
    expect(result.candidates[0].classification).toBe('MANUAL_REVIEW_REQUIRED');
  });

  it('3. +19 L / 68 min / +122 km → MANUAL_REVIEW_REQUIRED', () => {
    const falsePositive = buildRefuel({
      segmentId: 'dimo-refuel-100004-fp-jul18',
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

describe('energy-events EV recharge sub-segment overlap', () => {
  it('7. subsumed existing sub-segment does not block WOULD_UPDATE parent', () => {
    const candidate = {
      classification: 'WOULD_UPDATE' as const,
      mechanism: 'recharge' as const,
      vehicleId: SYNTHETIC_VEHICLE_ID,
      tokenId: SYNTHETIC_EV_TOKEN_ID,
      label: 'AUDIT_EV_A',
      dimoSegmentId: SYNTHETIC_EV_RECHARGE_SEGMENT_ID,
      coalescedFromSegmentIds: [SYNTHETIC_EV_RECHARGE_SEGMENT_ID],
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
      existingRowId: SYNTHETIC_EXISTING_RECHARGE_ROW_ID,
      windowFrom: '2026-07-16T00:00:00.000Z',
      windowTo: '2026-07-17T00:00:00.000Z',
    };
    const existing = new Map([
      [
        SYNTHETIC_VEHICLE_ID,
        [
          {
            id: SYNTHETIC_LEGACY_SUBSEGMENT_ROW_ID,
            dimoSegmentId: 'dimo-recharge-100005-subsegment-a',
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

  it('7b. same dimoSegmentId update ignores overlapping legacy sub-segments', () => {
    const candidate = {
      classification: 'WOULD_UPDATE' as const,
      mechanism: 'recharge' as const,
      vehicleId: SYNTHETIC_VEHICLE_ID,
      tokenId: SYNTHETIC_EV_TOKEN_ID,
      label: 'AUDIT_EV_A',
      dimoSegmentId: SYNTHETIC_EV_RECHARGE_SEGMENT_ID,
      coalescedFromSegmentIds: [SYNTHETIC_EV_RECHARGE_SEGMENT_ID],
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
      existingRowId: SYNTHETIC_EXISTING_RECHARGE_ROW_ID,
      windowFrom: '2026-07-16T00:00:00.000Z',
      windowTo: '2026-07-17T00:00:00.000Z',
    };
    const existing = new Map([
      [
        SYNTHETIC_VEHICLE_ID,
        [
          {
            id: 'evt-existing-recharge-000000000003',
            dimoSegmentId: 'dimo-recharge-100005-subsegment-b',
            kind: 'RECHARGE',
            startTime: new Date('2026-07-16T22:00:00.000Z'),
            endTime: new Date('2026-07-16T23:00:00.000Z'),
            socDeltaPercent: 2,
            energyDeltaKwh: 1,
          },
        ],
      ],
    ]);
    const result = reconcileRecoveryCandidates([candidate], existing);
    expect(result.candidates[0].classification).toBe('WOULD_UPDATE');
  });
});
