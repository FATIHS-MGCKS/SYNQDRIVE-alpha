import { EnergyEventConfidence } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  simulateRecoveryWindow,
  summarizeClassifications,
} from './energy-events-recovery-dry-run';
import { isSegmentPersistable, coalesceSegments } from './energy-events.pipeline';
import { splitRecoveryQueryWindows } from './energy-events-window.util';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
  ENERGY_EVENTS_RECOVERY_WINDOW_MS,
} from './energy-events-recovery.constants';

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
    odometerStartKm: 12000,
    odometerEndKm: 12000,
    fuelStartLiters: 8,
    fuelEndLiters: 26,
    fuelDeltaLiters: 18,
    fuelStartPercent: 13,
    fuelEndPercent: 42,
    fuelDeltaPercent: 29,
    socStartPercent: null,
    socEndPercent: null,
    socDeltaPercent: null,
    energyStartKwh: null,
    energyEndKwh: null,
    energyDeltaKwh: null,
    ...overrides,
  };
}

describe('energy-events-recovery dry-run classification', () => {
  const baseInput = {
    vehicleId: VEHICLE_ID,
    label: 'KS MX 2024',
    tokenId: 187336,
    windowFrom: new Date('2026-08-22T00:00:00.000Z'),
    windowTo: new Date('2026-08-24T00:00:00.000Z'),
    detectorConfigVersion: 'e2-2026-08',
    mechanismOutcomes: [
      {
        mechanism: 'refuel' as const,
        status: 'SUCCESS_WITH_EVENTS' as const,
        segments: [],
        windowFrom: '2026-08-22T00:00:00.000Z',
        windowTo: '2026-08-24T00:00:00.000Z',
        tokenId: 187336,
      },
      {
        mechanism: 'recharge' as const,
        status: 'SUCCESS_EMPTY' as const,
        segments: [],
        windowFrom: '2026-08-22T00:00:00.000Z',
        windowTo: '2026-08-24T00:00:00.000Z',
        tokenId: 187336,
      },
    ],
    existingEvents: [] as never[],
  };

  it('1. missing event → WOULD_CREATE', () => {
    const refuel = buildRefuel();
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [refuel],
      existingEvents: [],
    });
    const created = result.candidates.find((c) => c.classification === 'WOULD_CREATE');
    expect(created).toBeDefined();
    expect(created?.dimoSegmentId).toBe(refuel.segmentId);
  });

  it('2. existing identical → ALREADY_IDENTICAL', () => {
    const refuel = buildRefuel();
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [refuel],
      existingEvents: [
        {
          id: 'evt-1',
          dimoSegmentId: refuel.segmentId,
          kind: 'REFUEL',
          startTime: new Date(refuel.startTime),
          endTime: new Date(refuel.endTime!),
          fuelDeltaLiters: 18,
          fuelDeltaPercent: 29,
          socDeltaPercent: null,
          energyDeltaKwh: null,
          confidence: EnergyEventConfidence.HIGH,
        },
      ],
    });
    expect(result.candidates.some((c) => c.classification === 'ALREADY_IDENTICAL')).toBe(true);
  });

  it('3. existing same ID with changed data → WOULD_UPDATE', () => {
    const refuel = buildRefuel();
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [refuel],
      existingEvents: [
        {
          id: 'evt-1',
          dimoSegmentId: refuel.segmentId,
          kind: 'REFUEL',
          startTime: new Date(refuel.startTime),
          endTime: new Date(refuel.endTime!),
          fuelDeltaLiters: 10,
          fuelDeltaPercent: 15,
          socDeltaPercent: null,
          energyDeltaKwh: null,
          confidence: EnergyEventConfidence.MEDIUM,
        },
      ],
    });
    expect(result.candidates.some((c) => c.classification === 'WOULD_UPDATE')).toBe(true);
  });

  it('4. not persistable → WOULD_SKIP_NOT_PERSISTABLE', () => {
    const noise = buildRefuel({ fuelDeltaLiters: 0.5, fuelDeltaPercent: 1 });
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [noise],
      existingEvents: [],
    });
    expect(result.candidates.some((c) => c.classification === 'WOULD_SKIP_NOT_PERSISTABLE')).toBe(true);
    expect(result.candidates.some((c) => c.classification === 'WOULD_CREATE')).toBe(false);
  });

  it('5. legacy subsegments → WOULD_REPLACE_LEGACY_SUBSEGMENTS without delete', () => {
    const sub1 = buildRefuel({
      segmentId: 'dimo-refuel-187336-111',
      startTime: '2026-08-23T16:10:00.000Z',
      endTime: '2026-08-23T16:12:00.000Z',
      durationSeconds: 120,
    });
    const sub2 = buildRefuel({
      segmentId: 'dimo-refuel-187336-222',
      startTime: '2026-08-23T16:13:00.000Z',
      endTime: '2026-08-23T16:23:16.000Z',
      durationSeconds: 616,
    });
    const coalesced = coalesceSegments([sub1, sub2]);
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0].coalescedFromSegmentIds.length).toBeGreaterThan(1);

    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [sub1, sub2],
      existingEvents: [
        {
          id: 'legacy-1',
          dimoSegmentId: 'dimo-refuel-187336-111',
          kind: 'REFUEL',
          startTime: new Date(sub1.startTime),
          endTime: new Date(sub1.endTime!),
          fuelDeltaLiters: 5,
          fuelDeltaPercent: 10,
          socDeltaPercent: null,
          energyDeltaKwh: null,
          confidence: EnergyEventConfidence.LOW,
        },
      ],
    });
    expect(
      result.candidates.some((c) => c.classification === 'WOULD_REPLACE_LEGACY_SUBSEGMENTS'),
    ).toBe(true);
  });

  it('6. mechanism fetch failure → FETCH_FAILED', () => {
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [],
      mechanismOutcomes: [
        {
          mechanism: 'refuel',
          status: 'FAILED',
          segments: [],
          windowFrom: baseInput.windowFrom.toISOString(),
          windowTo: baseInput.windowTo.toISOString(),
          tokenId: 187336,
          error: { httpStatus: 422, retryable: false, message: 'validation' },
        },
      ],
      existingEvents: [],
    });
    expect(result.fetchFailed).toBe(true);
    expect(result.candidates.every((c) => c.classification === 'FETCH_FAILED')).toBe(true);
  });

  it('7. suspicious candidate → MANUAL_REVIEW_REQUIRED', () => {
    const suspicious = buildRefuel({ fuelDeltaLiters: 150, fuelDeltaPercent: 95 });
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [suspicious],
      existingEvents: [],
    });
    expect(result.candidates.some((c) => c.classification === 'MANUAL_REVIEW_REQUIRED')).toBe(true);
  });
});

describe('energy-events window util', () => {
  it('splits outage range into deterministic 24h windows', () => {
    const windows = splitRecoveryQueryWindows(
      new Date(ENERGY_EVENTS_OUTAGE_START_ISO),
      new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO),
      ENERGY_EVENTS_RECOVERY_WINDOW_MS,
    );
    expect(windows.length).toBeGreaterThan(40);
    expect(windows[0].from.toISOString()).toBe(ENERGY_EVENTS_OUTAGE_START_ISO);
    expect(windows[windows.length - 1].to.toISOString()).toBe(
      ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
    );
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].from.getTime()).toBe(windows[i - 1].to.getTime());
    }
  });
});

describe('energy-events pipeline persist gate', () => {
  it('requires fuelDeltaLiters > 1 for refuel', () => {
    expect(isSegmentPersistable(buildRefuel())).toBe(true);
    expect(isSegmentPersistable(buildRefuel({ fuelDeltaLiters: 0.5 }))).toBe(false);
  });
});

describe('summarizeClassifications', () => {
  it('aggregates classification counts', () => {
    const summary = summarizeClassifications([
      { classification: 'WOULD_CREATE' } as never,
      { classification: 'WOULD_CREATE' } as never,
      { classification: 'FETCH_FAILED' } as never,
    ]);
    expect(summary.WOULD_CREATE).toBe(2);
    expect(summary.FETCH_FAILED).toBe(1);
  });
});
