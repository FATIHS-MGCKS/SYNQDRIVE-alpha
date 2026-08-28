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
import { reconcileRecoveryCandidates } from './energy-events-recovery-reconcile';
import { runEnergyEventsRecoveryDryRun } from './energy-events-recovery-runner';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
} from './energy-events-recovery-read.repository';
import { PrismaClient } from '@prisma/client';

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

  it('6. mechanism fetch failure emits FETCH_FAILED only for failed mechanism', () => {
    const refuel = buildRefuel();
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [refuel],
      mechanismOutcomes: [
        {
          mechanism: 'refuel',
          status: 'SUCCESS_WITH_EVENTS',
          segments: [refuel],
          windowFrom: baseInput.windowFrom.toISOString(),
          windowTo: baseInput.windowTo.toISOString(),
          tokenId: 187336,
        },
        {
          mechanism: 'recharge',
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
    expect(result.candidates.some((c) => c.classification === 'FETCH_FAILED')).toBe(true);
    expect(result.candidates.some((c) => c.classification === 'WOULD_CREATE')).toBe(true);
    expect(
      result.candidates.some((c) => c.classification === 'WOULD_REPLACE_LEGACY_SUBSEGMENTS'),
    ).toBe(false);
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

describe('energy-events recovery reconciliation', () => {
  it('5. cross-window duplicate same ID is deduplicated', () => {
    const candidate = {
      classification: 'WOULD_CREATE' as const,
      mechanism: 'refuel' as const,
      vehicleId: VEHICLE_ID,
      tokenId: 187336,
      label: 'KS MX 2024',
      dimoSegmentId: 'dimo-refuel-187336-1',
      coalescedFromSegmentIds: ['dimo-refuel-187336-1'],
      startTime: '2026-08-23T16:15:15.000Z',
      endTime: '2026-08-23T16:23:16.000Z',
      durationSeconds: 481,
      fuelDeltaLiters: 16,
      fuelDeltaPercent: 29,
      socDeltaPercent: null,
      energyDeltaKwh: null,
      startLatitude: null,
      startLongitude: null,
      confidence: EnergyEventConfidence.HIGH,
      detectorConfigVersion: 'e2-2026-08',
      manualReviewReasons: [],
      existingRowId: null,
      windowFrom: '2026-08-22T00:00:00.000Z',
      windowTo: '2026-08-23T00:00:00.000Z',
    };
    const result = reconcileRecoveryCandidates(
      [
        candidate,
        { ...candidate, windowFrom: '2026-08-23T00:00:00.000Z', windowTo: '2026-08-24T00:00:00.000Z' },
      ],
      new Map(),
    );
    expect(result.deduplicatedCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });

  it('6. overlapping different IDs → MANUAL_REVIEW_REQUIRED', () => {
    const left = {
      classification: 'WOULD_CREATE' as const,
      mechanism: 'refuel' as const,
      vehicleId: VEHICLE_ID,
      tokenId: 187336,
      label: 'KS MX 2024',
      dimoSegmentId: 'dimo-refuel-187336-left',
      coalescedFromSegmentIds: ['dimo-refuel-187336-left'],
      startTime: '2026-08-23T16:10:00.000Z',
      endTime: '2026-08-23T16:25:00.000Z',
      durationSeconds: 900,
      fuelDeltaLiters: 16,
      fuelDeltaPercent: 29,
      socDeltaPercent: null,
      energyDeltaKwh: null,
      startLatitude: null,
      startLongitude: null,
      confidence: EnergyEventConfidence.HIGH,
      detectorConfigVersion: 'e2-2026-08',
      manualReviewReasons: [],
      existingRowId: null,
      windowFrom: '2026-08-22T00:00:00.000Z',
      windowTo: '2026-08-23T00:00:00.000Z',
    };
    const right = {
      ...left,
      dimoSegmentId: 'dimo-refuel-187336-right',
      coalescedFromSegmentIds: ['dimo-refuel-187336-right'],
      startTime: '2026-08-23T16:12:00.000Z',
      endTime: '2026-08-23T16:30:00.000Z',
    };
    const result = reconcileRecoveryCandidates([left, right], new Map());
    expect(
      result.candidates.every((c) => c.classification === 'MANUAL_REVIEW_REQUIRED'),
    ).toBe(true);
  });

  it('7. existing DB overlap different ID → MANUAL_REVIEW_REQUIRED', () => {
    const candidate = {
      classification: 'WOULD_CREATE' as const,
      mechanism: 'refuel' as const,
      vehicleId: VEHICLE_ID,
      tokenId: 187336,
      label: 'KS MX 2024',
      dimoSegmentId: 'dimo-refuel-187336-new',
      coalescedFromSegmentIds: ['dimo-refuel-187336-new'],
      startTime: '2026-08-23T16:15:15.000Z',
      endTime: '2026-08-23T16:23:16.000Z',
      durationSeconds: 481,
      fuelDeltaLiters: 16,
      fuelDeltaPercent: 29,
      socDeltaPercent: null,
      energyDeltaKwh: null,
      startLatitude: null,
      startLongitude: null,
      confidence: EnergyEventConfidence.HIGH,
      detectorConfigVersion: 'e2-2026-08',
      manualReviewReasons: [],
      existingRowId: null,
      windowFrom: '2026-08-22T00:00:00.000Z',
      windowTo: '2026-08-24T00:00:00.000Z',
    };
    const existing = new Map([
      [
        VEHICLE_ID,
        [
          {
            id: 'db-1',
            dimoSegmentId: 'dimo-refuel-187336-old',
            kind: 'REFUEL',
            startTime: new Date('2026-08-23T16:16:00.000Z'),
            endTime: new Date('2026-08-23T16:22:00.000Z'),
          },
        ],
      ],
    ]);
    const result = reconcileRecoveryCandidates([candidate], existing);
    expect(result.candidates[0].classification).toBe('MANUAL_REVIEW_REQUIRED');
    expect(result.candidates[0].manualReviewReasons).toContain(
      'existing_db_overlap_different_id',
    );
  });
});

describe('energy-events recovery runner gates', () => {
  const refuel = buildRefuel();
  const vehicle = {
    vehicleId: VEHICLE_ID,
    label: 'KS MX 2024',
    tokenId: 187336,
    provider: 'LTE_R1',
    powertrain: 'ICE' as const,
    relativeFuelAvailable: true,
    absoluteFuelAvailable: true,
    rechargeSocAvailable: false,
    dimoAccessAvailable: true,
    existingEvents: [],
  };

  const fetchOk = async () => ({
    segments: [refuel],
    outcomes: [
      {
        mechanism: 'refuel' as const,
        status: 'SUCCESS_WITH_EVENTS' as const,
        segments: [refuel],
        windowFrom: '2026-08-22T00:00:00.000Z',
        windowTo: '2026-08-24T00:00:00.000Z',
        tokenId: 187336,
      },
    ],
    accounting: {
      telemetryGraphqlRequests: 1,
      tokenExchangeRequests: 1,
      mechanismRequests: 1,
      retries: 0,
    },
  });

  it('3. DB read failure in FULL mode → NOT READY even with manual-review candidates', async () => {
    const longRefuel = buildRefuel({
      startTime: '2026-07-18T08:20:45.000Z',
      endTime: '2026-07-18T20:20:45.000Z',
      durationSeconds: 12 * 60 * 60,
    });
    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: async () => ({
        segments: [longRefuel],
        outcomes: [
          {
            mechanism: 'refuel',
            status: 'SUCCESS_WITH_EVENTS',
            segments: [longRefuel],
            windowFrom: '2026-07-18T00:00:00.000Z',
            windowTo: '2026-07-19T00:00:00.000Z',
            tokenId: 187336,
          },
        ],
        accounting: {
          telemetryGraphqlRequests: 1,
          tokenExchangeRequests: 0,
          mechanismRequests: 1,
          retries: 0,
        },
      }),
      interRequestDelayMs: 0,
      windowsOverride: [{ from: new Date('2026-07-18T00:00:00.000Z'), to: new Date('2026-07-19T00:00:00.000Z') }],
      mode: 'full',
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    });
    expect(report.backfillGate).toBe('NOT READY');
    expect(report.gateBlockers).toContain('DB_COMPARISON_UNAVAILABLE');
    expect(report.manualReviewCount).toBeGreaterThan(0);
  });

  it('2. FULL mode without DB comparison → NOT READY', async () => {
    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: fetchOk,
      interRequestDelayMs: 0,
      windowsOverride: [{ from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') }],
      mode: 'full',
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    });
    expect(report.backfillGate).toBe('NOT READY');
    expect(report.gateBlockers).toContain('DB_COMPARISON_UNAVAILABLE');
  });

  it('4. QUICK mode never write-back ready', async () => {
    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: fetchOk,
      interRequestDelayMs: 0,
      windowsOverride: [{ from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') }],
      mode: 'quick',
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    });
    expect(report.backfillGate).not.toBe('READY FOR CONTROLLED WRITE BACKFILL');
  });

  it('8. ANY fetch failure in FULL mode → NOT READY', async () => {
    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: async () => ({
        segments: [],
        outcomes: [
          {
            mechanism: 'refuel',
            status: 'FAILED',
            segments: [],
            windowFrom: '2026-08-22T00:00:00.000Z',
            windowTo: '2026-08-24T00:00:00.000Z',
            tokenId: 187336,
            error: { httpStatus: 500, retryable: true, message: 'server' },
          },
        ],
        accounting: {
          telemetryGraphqlRequests: 1,
          tokenExchangeRequests: 0,
          mechanismRequests: 1,
          retries: 0,
        },
      }),
      interRequestDelayMs: 0,
      windowsOverride: [{ from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') }],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    });
    expect(report.backfillGate).toBe('NOT READY');
    expect(report.gateBlockers.some((b) => b.startsWith('UNRESOLVED_FETCH_FAILED'))).toBe(true);
  });

  it('10. mechanism-aware request accounting is tracked', async () => {
    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: fetchOk,
      interRequestDelayMs: 0,
      windowsOverride: [{ from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') }],
      mode: 'quick',
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    });
    expect(report.requestAccounting.telemetryGraphqlRequests).toBe(1);
    expect(report.requestAccounting.mechanismRequests).toBe(1);
    expect(report.trafficBudget.expectedTelemetryGraphqlRequests).toBe(1);
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

describe('read repository mutation guard', () => {
  it('9. repository path cannot mutate VehicleEnergyEvent', async () => {
    const prisma = createMutationGuardedPrismaClient(new PrismaClient());
    const repository = createPrismaRecoveryReadRepository(prisma);
    jest.spyOn(prisma.vehicle, 'findMany').mockResolvedValue([
      {
        id: VEHICLE_ID,
        licensePlate: 'KS MX 2024',
        vehicleName: null,
        hardwareType: 'LTE_R1',
        dimoVehicle: { tokenId: 187336 },
        energyEvents: [],
      },
    ] as never);

    const vehicles = await repository.loadVehiclesForRecovery({
      outageStart: new Date(ENERGY_EVENTS_OUTAGE_START_ISO),
      recoveryCutoff: new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO),
    });
    expect(vehicles).toHaveLength(1);

    expect(() =>
      prisma.vehicleEnergyEvent.create({ data: {} as never }),
    ).toThrow(/FORBIDDEN/);
  });
});
