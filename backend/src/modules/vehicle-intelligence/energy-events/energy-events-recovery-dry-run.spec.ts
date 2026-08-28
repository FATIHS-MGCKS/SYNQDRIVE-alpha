import { EnergyEventConfidence } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  simulateRecoveryWindow,
  summarizeClassifications,
} from './energy-events-recovery-dry-run';
import { buildUpsertPayload, coalesceSegments, isMateriallyIdentical, isSegmentPersistable } from './energy-events.pipeline';
import { splitRecoveryQueryWindows } from './energy-events-window.util';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
  ENERGY_EVENTS_RECOVERY_WINDOW_MS,
  QUICK_ACCEPTANCE_WINDOWS,
} from './energy-events-recovery.constants';
import { reconcileRecoveryCandidates } from './energy-events-recovery-reconcile';
import { runEnergyEventsRecoveryDryRun } from './energy-events-recovery-runner';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
  mergeAuditedFleetIntoDbVehicles,
} from './energy-events-recovery-read.repository';
import { PrismaClient } from '@prisma/client';
import { assessPlausibilityFlags } from './energy-events-plausibility';
import {
  createDimoRequestAccounting,
  recordMechanismRequest,
} from './energy-events-recovery-accounting';

const VEHICLE_ID = 'clveh1234567890123456789012';

function buildRefuel(overrides: Partial<DimoEnergyEventSegment> = {}): DimoEnergyEventSegment {
  return {
    segmentId: 'dimo-refuel-100001-1724427315000',
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

function buildMatchingExistingEvent(
  refuel: DimoEnergyEventSegment,
  overrides: Record<string, unknown> = {},
) {
  const coalesced = coalesceSegments([refuel])[0];
  const payload = buildUpsertPayload(VEHICLE_ID, coalesced);
  return {
    id: 'evt-1',
    dimoSegmentId: payload.dimoSegmentId,
    kind: payload.kind,
    detectionMechanism: payload.detectionMechanism,
    startTime: payload.startTime,
    endTime: payload.endTime,
    durationSeconds: payload.durationSeconds,
    startLatitude: payload.startLatitude,
    startLongitude: payload.startLongitude,
    endLatitude: payload.endLatitude,
    endLongitude: payload.endLongitude,
    fuelDeltaLiters: payload.fuelDeltaLiters,
    fuelDeltaPercent: payload.fuelDeltaPercent,
    socDeltaPercent: payload.socDeltaPercent,
    energyDeltaKwh: payload.energyDeltaKwh,
    odometerStartKm: payload.odometerStartKm,
    odometerEndKm: payload.odometerEndKm,
    confidence: payload.confidence,
    rawDetectionMeta: payload.rawDetectionMeta,
    ...overrides,
  };
}

function buildRecoveryCandidate(
  overrides: Partial<import('./energy-events-recovery.types').EnergyRecoveryCandidate> = {},
) {
  return {
    classification: 'WOULD_CREATE' as const,
    mechanism: 'refuel' as const,
    vehicleId: VEHICLE_ID,
    tokenId: 100001,
    label: 'AUDIT_CANONICAL_REFUEL',
    dimoSegmentId: 'dimo-refuel-100001-1',
    coalescedFromSegmentIds: ['dimo-refuel-100001-1'],
    startTime: '2026-08-23T16:15:15.000Z',
    endTime: '2026-08-23T16:23:16.000Z',
    durationSeconds: 481,
    fuelDeltaLiters: 16,
    fuelDeltaPercent: 29,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    confidence: EnergyEventConfidence.HIGH,
    detectorConfigVersion: 'e2-2026-08',
    manualReviewReasons: [],
    existingRowId: null,
    windowFrom: '2026-08-22T00:00:00.000Z',
    windowTo: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('energy-events-recovery dry-run classification', () => {
  const baseInput = {
    vehicleId: VEHICLE_ID,
    label: 'AUDIT_CANONICAL_REFUEL',
    tokenId: 100001,
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
        tokenId: 100001,
      },
      {
        mechanism: 'recharge' as const,
        status: 'SUCCESS_EMPTY' as const,
        segments: [],
        windowFrom: '2026-08-22T00:00:00.000Z',
        windowTo: '2026-08-24T00:00:00.000Z',
        tokenId: 100001,
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
      existingEvents: [buildMatchingExistingEvent(refuel)],
    });
    expect(result.candidates.some((c) => c.classification === 'ALREADY_IDENTICAL')).toBe(true);
  });

  it('2b. same ID changed odometer → WOULD_UPDATE', () => {
    const refuel = buildRefuel();
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [refuel],
      existingEvents: [
        buildMatchingExistingEvent(refuel, { odometerEndKm: 99999 }),
      ],
    });
    expect(result.candidates.some((c) => c.classification === 'WOULD_UPDATE')).toBe(true);
  });

  it('3. existing same ID with changed data → WOULD_UPDATE', () => {
    const refuel = buildRefuel();
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [refuel],
      existingEvents: [
        buildMatchingExistingEvent(refuel, {
          fuelDeltaLiters: 10,
          fuelDeltaPercent: 15,
          confidence: EnergyEventConfidence.MEDIUM,
        }),
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
      segmentId: 'dimo-refuel-100001-111',
      startTime: '2026-08-23T16:10:00.000Z',
      endTime: '2026-08-23T16:12:00.000Z',
      durationSeconds: 120,
    });
    const sub2 = buildRefuel({
      segmentId: 'dimo-refuel-100001-222',
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
        buildMatchingExistingEvent(sub1, {
          id: 'legacy-1',
          dimoSegmentId: 'dimo-refuel-100001-111',
          confidence: EnergyEventConfidence.LOW,
        }),
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
          tokenId: 100001,
        },
        {
          mechanism: 'recharge',
          status: 'FAILED',
          segments: [],
          windowFrom: baseInput.windowFrom.toISOString(),
          windowTo: baseInput.windowTo.toISOString(),
          tokenId: 100001,
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

  it('7b. fuel signal contradiction → MANUAL_REVIEW_REQUIRED', () => {
    const contradictory = buildRefuel({
      fuelDeltaLiters: 1.5,
      fuelDeltaPercent: 35,
      fuelStartLiters: 10,
      fuelEndLiters: 11.5,
    });
    expect(assessPlausibilityFlags(contradictory)).toContain('fuel_signal_contradiction');
    const result = simulateRecoveryWindow({
      ...baseInput,
      segments: [contradictory],
      existingEvents: [],
    });
    expect(result.candidates.some((c) => c.classification === 'MANUAL_REVIEW_REQUIRED')).toBe(true);
    expect(
      result.candidates.some((c) =>
        c.manualReviewReasons.includes('fuel_signal_contradiction'),
      ),
    ).toBe(true);
  });
});

describe('energy-events recovery reconciliation', () => {
  it('5. cross-window duplicate same ID is deduplicated', () => {
    const candidate = buildRecoveryCandidate();
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

  it('5b. conservative dedup keeps MANUAL_REVIEW_REQUIRED over WOULD_CREATE', () => {
    const create = buildRecoveryCandidate({ classification: 'WOULD_CREATE' });
    const manual = buildRecoveryCandidate({
      classification: 'MANUAL_REVIEW_REQUIRED',
      manualReviewReasons: ['refuel_duration_very_long'],
    });
    const result = reconcileRecoveryCandidates(
      [
        create,
        { ...manual, windowFrom: '2026-08-23T00:00:00.000Z', windowTo: '2026-08-24T00:00:00.000Z' },
      ],
      new Map(),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].classification).toBe('MANUAL_REVIEW_REQUIRED');
    expect(result.candidates[0].manualReviewReasons).toContain('refuel_duration_very_long');
  });

  it('5c. same ID material payload mismatch → MANUAL_REVIEW_REQUIRED', () => {
    const left = buildRecoveryCandidate({ classification: 'WOULD_CREATE', fuelDeltaLiters: 16 });
    const right = buildRecoveryCandidate({
      classification: 'WOULD_CREATE',
      fuelDeltaLiters: 22,
      windowFrom: '2026-08-23T00:00:00.000Z',
      windowTo: '2026-08-24T00:00:00.000Z',
    });
    const result = reconcileRecoveryCandidates([left, right], new Map());
    expect(result.candidates[0].classification).toBe('MANUAL_REVIEW_REQUIRED');
    expect(result.candidates[0].manualReviewReasons).toContain(
      'same_id_material_payload_mismatch',
    );
  });

  it('6. overlapping different IDs → MANUAL_REVIEW_REQUIRED', () => {
    const left = buildRecoveryCandidate({
      dimoSegmentId: 'dimo-refuel-100001-left',
      coalescedFromSegmentIds: ['dimo-refuel-100001-left'],
      startTime: '2026-08-23T16:10:00.000Z',
      endTime: '2026-08-23T16:25:00.000Z',
      durationSeconds: 900,
    });
    const right = {
      ...left,
      dimoSegmentId: 'dimo-refuel-100001-right',
      coalescedFromSegmentIds: ['dimo-refuel-100001-right'],
      startTime: '2026-08-23T16:12:00.000Z',
      endTime: '2026-08-23T16:30:00.000Z',
    };
    const result = reconcileRecoveryCandidates([left, right], new Map());
    expect(
      result.candidates.every((c) => c.classification === 'MANUAL_REVIEW_REQUIRED'),
    ).toBe(true);
  });

  it('7. existing DB overlap different ID → MANUAL_REVIEW_REQUIRED', () => {
    const candidate = buildRecoveryCandidate({
      dimoSegmentId: 'dimo-refuel-100001-new',
      coalescedFromSegmentIds: ['dimo-refuel-100001-new'],
      windowTo: '2026-08-24T00:00:00.000Z',
    });
    const existing = new Map([
      [
        VEHICLE_ID,
        [
          {
            id: 'db-1',
            dimoSegmentId: 'dimo-refuel-100001-old',
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
    label: 'AUDIT_CANONICAL_REFUEL',
    tokenId: 100001,
    provider: 'LTE_R1',
    powertrain: 'ICE' as const,
    relativeFuelAvailable: true,
    absoluteFuelAvailable: true,
    rechargeSocAvailable: false,
    capabilityLookupStatus: 'ok' as const,
    dimoAccessAvailable: true,
    dbVehicleMapped: true,
    existingEvents: [],
  };

  const fetchOk = async () => {
    const accounting = createDimoRequestAccounting();
    recordMechanismRequest('refuel', accounting);
    return {
      segments: [refuel],
      outcomes: [
        {
          mechanism: 'refuel' as const,
          status: 'SUCCESS_WITH_EVENTS' as const,
          segments: [refuel],
          windowFrom: '2026-08-22T00:00:00.000Z',
          windowTo: '2026-08-24T00:00:00.000Z',
          tokenId: 100001,
        },
      ],
      accounting,
    };
  };

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
            tokenId: 100001,
          },
        ],
        accounting: createDimoRequestAccounting(),
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
            tokenId: 100001,
            error: { httpStatus: 500, retryable: true, message: 'server' },
          },
        ],
        accounting: createDimoRequestAccounting(),
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
    expect(report.requestAccounting.refuelSegmentRequests).toBe(1);
    expect(report.requestAccounting.capabilityProbeRequests).toBe(0);
    expect(report.trafficBudget.expectedMechanismRequests).toBe(1);
    expect(report.trafficBudget.expectedCapabilityProbeRequests).toBe(0);
    expect(report.trafficBudget.expectedTelemetryGraphqlRequests).toBe(1);
  });

  it('11. FULL mode unmapped vehicle → DB_VEHICLE_MAPPING_MISSING gate', async () => {
    const unmapped = {
      vehicleId: 'dry-run-token-100001',
      label: 'AUDIT_CANONICAL_REFUEL',
      tokenId: 100001,
      provider: 'LTE_R1',
      powertrain: 'ICE' as const,
      relativeFuelAvailable: true,
      absoluteFuelAvailable: true,
      rechargeSocAvailable: false,
      capabilityLookupStatus: 'ok' as const,
      dimoAccessAvailable: true,
      dbVehicleMapped: false,
      existingEvents: [],
    };
    expect(unmapped.dbVehicleMapped).toBe(false);

    const report = await runEnergyEventsRecoveryDryRun([unmapped], {
      fetchSegments: fetchOk,
      interRequestDelayMs: 0,
      windowsOverride: [{ from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') }],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    });
    expect(report.backfillGate).toBe('NOT READY');
    expect(report.gateBlockers).toContain('DB_VEHICLE_MAPPING_MISSING:1');
    expect(report.summary.WOULD_CREATE).toBe(0);
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

  it('quick acceptance windows are each <= 24h', () => {
    for (const window of QUICK_ACCEPTANCE_WINDOWS) {
      const hours =
        (new Date(window.to).getTime() - new Date(window.from).getTime()) /
        (60 * 60 * 1000);
      expect(hours).toBeLessThanOrEqual(24);
    }
  });
});

describe('energy-events pipeline material identity', () => {
  it('matches production upsert payload for identical persisted row', () => {
    const refuel = buildRefuel();
    const payload = buildUpsertPayload(VEHICLE_ID, coalesceSegments([refuel])[0]);
    const existing = buildMatchingExistingEvent(refuel);
    expect(isMateriallyIdentical(existing, payload)).toBe(true);
  });

  it('detects coordinate drift as material change', () => {
    const refuel = buildRefuel();
    const payload = buildUpsertPayload(VEHICLE_ID, coalesceSegments([refuel])[0]);
    const existing = buildMatchingExistingEvent(refuel, { startLatitude: 0.1 });
    expect(isMateriallyIdentical(existing, payload)).toBe(false);
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
        licensePlate: 'AUDIT_CANONICAL_REFUEL',
        vehicleName: null,
        hardwareType: 'LTE_R1',
        fuelType: 'GASOLINE',
        dimoVehicle: { tokenId: 100001 },
        energyEvents: [],
        vehicleBatteryCapabilities: [],
      },
    ] as never);

    const rows = await repository.loadRecoveryVehicleDbRows({
      outageStart: new Date(ENERGY_EVENTS_OUTAGE_START_ISO),
      recoveryCutoff: new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO),
    });
    expect(rows).toHaveLength(1);

    expect(() =>
      prisma.vehicleEnergyEvent.create({ data: {} as never }),
    ).toThrow(/FORBIDDEN/);
  });
});
