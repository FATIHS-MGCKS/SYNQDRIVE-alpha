import { EnergyEventConfidence, EnergyEventKind, BatteryCapabilityStatus } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import { KS_MX_2024_TOKEN_ID } from '@modules/dimo/fixtures/ks-mx-2024-refuel.fixture';
import {
  buildUpsertPayload,
  coalesceSegments,
  pruneStaleCoalescedSubSegments,
} from './energy-events.pipeline';
import {
  buildRemainingWriteSet,
  reconcileCanonicalRechargeWindowsFromReport,
  validatePostWriteCompletionReport,
} from './energy-events-recovery-write-backfill';
import type { EnergyRecoveryDryRunReport } from './energy-events-recovery.types';
import {
  buildCapabilityEvidenceAggregate,
  buildRecoveryVehicleInput,
} from './energy-events-recovery-capability';
import { createDimoRequestAccounting } from './energy-events-recovery-accounting';
import { SYNTHETIC_VEHICLE_ID } from './energy-events-recovery.test-fixtures';

const VEHICLE_ID = SYNTHETIC_VEHICLE_ID;
const TOKEN_ID = KS_MX_2024_TOKEN_ID;
const WINDOW_FROM = new Date('2026-08-22T00:00:00.000Z');
const WINDOW_TO = new Date('2026-08-24T00:00:00.000Z');

function buildRechargeSegment(startMs: number, socDelta = 10): DimoEnergyEventSegment {
  return {
    segmentId: `dimo-recharge-${TOKEN_ID}-${startMs}`,
    mechanism: 'recharge',
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(startMs + 3600_000).toISOString(),
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 3600,
    startLatitude: 51.3,
    startLongitude: 9.5,
    endLatitude: 51.3,
    endLongitude: 9.5,
    odometerStartKm: 10000,
    odometerEndKm: 10000,
    fuelStartLiters: null,
    fuelEndLiters: null,
    fuelDeltaLiters: null,
    fuelStartPercent: null,
    fuelEndPercent: null,
    fuelDeltaPercent: null,
    socStartPercent: 40,
    socEndPercent: 40 + socDelta,
    socDeltaPercent: socDelta,
    energyStartKwh: 20,
    energyEndKwh: 24,
    energyDeltaKwh: 4,
  };
}

function createPrismaMock(store: {
  energyEvents: Array<Record<string, unknown>>;
}) {
  return {
    vehicleEnergyEvent: {
      findUnique: jest.fn(async ({ where }: { where: { dimoSegmentId: string } }) =>
        store.energyEvents.find(
          (row) => row.dimoSegmentId === where.dimoSegmentId,
        ) ?? null,
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            vehicleId: string;
            startTime?: { gte?: Date; lte?: Date };
            dimoSegmentId?: { in: string[] };
          };
        }) =>
          store.energyEvents
            .filter((row) => {
              if (row.vehicleId !== where.vehicleId) return false;
              const startTime = new Date(row.startTime as string);
              if (where.startTime?.gte && startTime < where.startTime.gte) return false;
              if (where.startTime?.lte && startTime > where.startTime.lte) return false;
              if (
                where.dimoSegmentId?.in &&
                !where.dimoSegmentId.in.includes(row.dimoSegmentId as string)
              ) {
                return false;
              }
              return true;
            })
            .map((row) => ({ id: row.id, dimoSegmentId: row.dimoSegmentId })),
      ),
      deleteMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = store.energyEvents.length;
        store.energyEvents = store.energyEvents.filter(
          (row) => !where.id.in.includes(row.id as string),
        );
        return { count: before - store.energyEvents.length };
      }),
    },
  };
}

function buildCoalescedRechargeSession(subA: DimoEnergyEventSegment, subB: DimoEnergyEventSegment, subC: DimoEnergyEventSegment) {
  const coalesced = coalesceSegments([subA, subB, subC]);
  const parent = coalesced[0];
  const parentPayload = buildUpsertPayload(VEHICLE_ID, parent);
  return { coalesced, parent, parentPayload };
}

function seedCanonicalParentWithLegacySubs(
  subA: DimoEnergyEventSegment,
  subB: DimoEnergyEventSegment,
  subC: DimoEnergyEventSegment,
) {
  const { parent, parentPayload } = buildCoalescedRechargeSession(subA, subB, subC);
  const store = {
    energyEvents: [
      {
        id: 'canonical-parent',
        vehicleId: VEHICLE_ID,
        dimoSegmentId: parent.coalescedSegmentId,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'recharge',
        confidence: parentPayload.confidence,
        startTime: parentPayload.startTime,
        endTime: parentPayload.endTime,
        durationSeconds: parentPayload.durationSeconds,
        startLatitude: parentPayload.startLatitude,
        startLongitude: parentPayload.startLongitude,
        endLatitude: parentPayload.endLatitude,
        endLongitude: parentPayload.endLongitude,
        fuelDeltaLiters: parentPayload.fuelDeltaLiters,
        fuelDeltaPercent: parentPayload.fuelDeltaPercent,
        socDeltaPercent: parentPayload.socDeltaPercent,
        energyDeltaKwh: parentPayload.energyDeltaKwh,
        odometerStartKm: parentPayload.odometerStartKm,
        odometerEndKm: parentPayload.odometerEndKm,
        rawDetectionMeta: parentPayload.rawDetectionMeta,
      },
      {
        id: 'legacy-a',
        vehicleId: VEHICLE_ID,
        dimoSegmentId: subA.segmentId,
        kind: EnergyEventKind.RECHARGE,
        startTime: subA.startTime,
      },
      {
        id: 'legacy-b',
        vehicleId: VEHICLE_ID,
        dimoSegmentId: subB.segmentId,
        kind: EnergyEventKind.RECHARGE,
        startTime: subB.startTime,
      },
      {
        id: 'legacy-c',
        vehicleId: VEHICLE_ID,
        dimoSegmentId: subC.segmentId,
        kind: EnergyEventKind.RECHARGE,
        startTime: subC.startTime,
      },
    ],
  };
  return { store, parent, coalesced: coalesceSegments([subA, subB, subC]) };
}

async function pruneWithStore(
  store: { energyEvents: Array<Record<string, unknown>> },
  coalesced: ReturnType<typeof coalesceSegments>,
) {
  return pruneStaleCoalescedSubSegments({
    vehicleId: VEHICLE_ID,
    windowFrom: WINDOW_FROM,
    windowTo: WINDOW_TO,
    coalesced,
    mechanismOutcomes: [
      { mechanism: 'refuel', status: 'SUCCESS_EMPTY' },
      { mechanism: 'recharge', status: 'SUCCESS_WITH_EVENTS' },
    ],
    findEnergyEventByDimoSegmentId: (dimoSegmentId) =>
      Promise.resolve(
        (store.energyEvents.find((row) => row.dimoSegmentId === dimoSegmentId) ??
          null) as never,
      ),
    findStaleCandidates: (staleSubsegmentIds) =>
      Promise.resolve(
        store.energyEvents
          .filter(
            (row) =>
              row.vehicleId === VEHICLE_ID &&
              staleSubsegmentIds.includes(row.dimoSegmentId as string),
          )
          .map((row) => ({
            id: row.id as string,
            dimoSegmentId: row.dimoSegmentId as string,
          })),
      ),
    deleteEnergyEventsByIds: async (ids) => {
      const before = store.energyEvents.length;
      store.energyEvents = store.energyEvents.filter(
        (row) => !ids.includes(row.id as string),
      );
      return before - store.energyEvents.length;
    },
  });
}

function buildCompletionReport(
  overrides: Partial<EnergyRecoveryDryRunReport> = {},
): EnergyRecoveryDryRunReport {
  return {
    generatedAt: '2026-08-28T18:00:00.000Z',
    codeShaUnderTest: 'a'.repeat(40),
    baseMainSha: 'b'.repeat(40),
    detectorConfigVersion: 'e2-2026-08',
    refuelDetectorConfig: { minIncreasePercent: 5 },
    rechargeDetectorConfig: 'default',
    outageStart: '2026-07-16T00:00:00.000Z',
    recoveryCutoff: '2026-08-28T08:00:00.000Z',
    windowSizeHours: 24,
    windowSizesHours: [24],
    windowSemantics: 'test windows',
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    dbVehicleMappingFailures: 0,
    vehicles: [],
    capabilityEvidenceAggregate: buildCapabilityEvidenceAggregate([]),
    requestAccounting: createDimoRequestAccounting(),
    refuelDetections: 0,
    rechargeDetections: 0,
    deduplicatedCandidateCount: 0,
    summary: {
      WOULD_CREATE: 0,
      WOULD_UPDATE: 0,
      ALREADY_IDENTICAL: 0,
      WOULD_SKIP_NOT_PERSISTABLE: 0,
      WOULD_REPLACE_LEGACY_SUBSEGMENTS: 0,
      MANUAL_REVIEW_REQUIRED: 0,
      FETCH_FAILED: 0,
    },
    candidates: [],
    manualReviewReport: [],
    legacySubsegmentsWouldReplace: [],
    fetchFailures: [],
    trafficBudget: {
      eligibleVehicles: 0,
      inaccessibleVehicles: 0,
      capabilityUnknownVehicles: 0,
      windowsPerVehicle: 0,
      mechanismsPerWindowAverage: 0,
      expectedMechanismRequests: 0,
      expectedCapabilityProbeRequests: 0,
      expectedTelemetryGraphqlRequests: 0,
      worstCaseWithRetries: 0,
      proposedConcurrency: 1,
      interRequestDelayMs: 0,
      estimatedRuntimeMinutes: 0,
    },
    acceptance: {
      canonicalRefuel: { found: true, classification: 'ALREADY_IDENTICAL', segmentStart: null },
      canonicalEvRecharge: {
        detectedSessions: 0,
        wouldCreate: 0,
        alreadyIdentical: 0,
        manualReview: 0,
      },
    },
    dbWritesPerformed: false,
    backfillGate: 'READY',
    manualReviewCount: 0,
    gateBlockers: [],
    recoveryPlan: null,
    ...overrides,
  };
}

describe('energy-events recovery write-backfill legacy recharge reconciliation', () => {
  it('A. parent UPDATED path: proven stale subsegments are reconciled when canonical parent is materialized', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const { parent, parentPayload, coalesced } = buildCoalescedRechargeSession(subA, subB, subC);

    const store: { energyEvents: Array<Record<string, unknown>> } = {
      energyEvents: [
        {
          id: 'legacy-a',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subA.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subA.startTime,
        },
        {
          id: 'legacy-b',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subB.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subB.startTime,
        },
        {
          id: 'legacy-c',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subC.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subC.startTime,
        },
      ],
    };

    store.energyEvents.push({
      id: 'canonical-parent',
      vehicleId: VEHICLE_ID,
      dimoSegmentId: parent.coalescedSegmentId,
      kind: EnergyEventKind.RECHARGE,
      detectionMechanism: 'recharge',
      confidence: parentPayload.confidence,
      startTime: parentPayload.startTime,
      endTime: parentPayload.endTime,
      durationSeconds: parentPayload.durationSeconds,
      startLatitude: parentPayload.startLatitude,
      startLongitude: parentPayload.startLongitude,
      endLatitude: parentPayload.endLatitude,
      endLongitude: parentPayload.endLongitude,
      fuelDeltaLiters: parentPayload.fuelDeltaLiters,
      fuelDeltaPercent: parentPayload.fuelDeltaPercent,
      socDeltaPercent: parentPayload.socDeltaPercent,
      energyDeltaKwh: parentPayload.energyDeltaKwh,
      odometerStartKm: parentPayload.odometerStartKm,
      odometerEndKm: parentPayload.odometerEndKm,
      rawDetectionMeta: parentPayload.rawDetectionMeta,
    });

    const result = await pruneWithStore(store, coalesced);
    expect(result.prunedCount).toBe(3);
    expect(store.energyEvents).toHaveLength(1);
    expect(store.energyEvents[0].dimoSegmentId).toBe(parent.coalescedSegmentId);
  });

  it('B. parent NO_OP_ALREADY_PRESENT: proven stale subsegments are still reconciled', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const { store, parent, coalesced } = seedCanonicalParentWithLegacySubs(subA, subB, subC);

    const result = await pruneWithStore(store, coalesced);
    expect(result.prunedCount).toBe(3);
    expect(store.energyEvents).toHaveLength(1);
    expect(store.energyEvents[0].dimoSegmentId).toBe(parent.coalescedSegmentId);
  });

  it('C. parent NO_OP_ALREADY_PRESENT with unrelated overlapping recharge: unrelated row is not deleted', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const unrelatedDId = `dimo-recharge-${TOKEN_ID}-9999999999000`;
    const { store, parent, coalesced } = seedCanonicalParentWithLegacySubs(subA, subB, subC);
    store.energyEvents.push({
      id: 'unrelated-d',
      vehicleId: VEHICLE_ID,
      dimoSegmentId: unrelatedDId,
      kind: EnergyEventKind.RECHARGE,
      startTime: '2026-08-23T18:00:00.000Z',
    });

    const result = await pruneWithStore(store, coalesced);
    expect(result.prunedCount).toBe(3);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === unrelatedDId)).toBe(true);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === parent.coalescedSegmentId)).toBe(
      true,
    );
  });

  it('D. incomplete replacement evidence: no delete when parent is not materially identical', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const { store, coalesced } = seedCanonicalParentWithLegacySubs(subA, subB, subC);
    store.energyEvents[0].socDeltaPercent = 1;

    const result = await pruneWithStore(store, coalesced);
    expect(result.prunedCount).toBe(0);
    expect(store.energyEvents).toHaveLength(4);
  });

  it('E. multiple physical sessions in nearby window: only canonical session subsegments are reconciled', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const sessionD = buildRechargeSegment(Date.parse('2026-08-23T18:00:00.000Z'), 15);
    const { store, parent, coalesced } = seedCanonicalParentWithLegacySubs(subA, subB, subC);
    store.energyEvents.push({
      id: 'session-d',
      vehicleId: VEHICLE_ID,
      dimoSegmentId: sessionD.segmentId,
      kind: EnergyEventKind.RECHARGE,
      startTime: sessionD.startTime,
    });

    const result = await pruneWithStore(store, coalesceSegments([subA, subB, subC, sessionD]));
    expect(result.prunedCount).toBe(3);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === sessionD.segmentId)).toBe(true);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === parent.coalescedSegmentId)).toBe(
      true,
    );
  });

  it('F. second execution performs zero additional mutations', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const { store, coalesced } = seedCanonicalParentWithLegacySubs(subA, subB, subC);

    const first = await pruneWithStore(store, coalesced);
    const second = await pruneWithStore(store, coalesced);
    expect(first.prunedCount).toBe(3);
    expect(second.prunedCount).toBe(0);
    expect(store.energyEvents).toHaveLength(1);
  });
});

describe('reconcileCanonicalRechargeWindowsFromReport', () => {
  it('reconciles legacy subsegments from report windows without requiring parent UPDATE', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const { store, parent } = seedCanonicalParentWithLegacySubs(subA, subB, subC);
    const prisma = createPrismaMock(store);

    const report = buildCompletionReport({
      candidates: [
        {
          classification: 'WOULD_UPDATE',
          mechanism: 'recharge',
          vehicleId: VEHICLE_ID,
          tokenId: TOKEN_ID,
          label: 'TEST_EV',
          dimoSegmentId: parent.coalescedSegmentId,
          coalescedFromSegmentIds: parent.coalescedFromSegmentIds,
          startTime: parent.startTime as string,
          endTime: parent.endTime as string,
          durationSeconds: parent.durationSeconds,
          fuelDeltaLiters: null,
          fuelDeltaPercent: null,
          socDeltaPercent: 30,
          energyDeltaKwh: 12,
          odometerStartKm: 10000,
          odometerEndKm: 10000,
          confidence: EnergyEventConfidence.HIGH,
          detectorConfigVersion: 'e2-2026-08',
          manualReviewReasons: [],
          existingRowId: 'canonical-parent',
          windowFrom: WINDOW_FROM.toISOString(),
          windowTo: WINDOW_TO.toISOString(),
        },
      ],
      vehicles: [
        {
          vehicleId: VEHICLE_ID,
          label: 'TEST_EV',
          tokenId: TOKEN_ID,
          provider: 'LTE_R1',
          powertrain: 'EV',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          refuelApplicability: 'NOT_APPLICABLE',
          rechargeApplicability: 'APPLICABLE',
          relativeFuelAvailable: false,
          absoluteFuelAvailable: false,
          rechargeSocAvailable: true,
          capabilityLookupStatus: 'ok',
          existingEventCountInWindow: 4,
          energyClass: 'RECHARGE_CANDIDATE',
        },
      ],
      summary: {
        WOULD_CREATE: 0,
        WOULD_UPDATE: 1,
        ALREADY_IDENTICAL: 0,
        WOULD_SKIP_NOT_PERSISTABLE: 0,
        WOULD_REPLACE_LEGACY_SUBSEGMENTS: 3,
        MANUAL_REVIEW_REQUIRED: 0,
        FETCH_FAILED: 0,
      },
      legacySubsegmentsWouldReplace: [subA.segmentId, subB.segmentId, subC.segmentId],
    });

    const recoveryVehicle = buildRecoveryVehicleInput(
      {
        vehicleId: VEHICLE_ID,
        label: 'TEST_EV',
        tokenId: TOKEN_ID,
        provider: 'LTE_R1',
        fuelType: 'ELECTRIC',
        dimoAccessAvailable: true,
        existingEvents: [],
        batteryCapabilities: [
          {
            signalKey: 'powertrainTractionBatteryStateOfChargeCurrent',
            status: BatteryCapabilityStatus.AVAILABLE,
          },
        ],
      },
      ['powertrainTractionBatteryStateOfChargeCurrent'],
      'full',
    );

    const reconciled = await reconcileCanonicalRechargeWindowsFromReport({
      prisma: prisma as never,
      report,
      vehiclesById: new Map([[VEHICLE_ID, recoveryVehicle]]),
      fetchSegments: async () => ({
        segments: [subA, subB, subC],
        outcomes: [
          {
            mechanism: 'refuel',
            status: 'SUCCESS_EMPTY',
            segments: [],
            windowFrom: WINDOW_FROM.toISOString(),
            windowTo: WINDOW_TO.toISOString(),
            tokenId: TOKEN_ID,
          },
          {
            mechanism: 'recharge',
            status: 'SUCCESS_WITH_EVENTS',
            segments: [subA, subB, subC],
            windowFrom: WINDOW_FROM.toISOString(),
            windowTo: WINDOW_TO.toISOString(),
            tokenId: TOKEN_ID,
          },
        ],
        accounting: createDimoRequestAccounting(),
      }),
    });

    expect(reconciled).toBe(3);
    expect(store.energyEvents).toHaveLength(1);
    expect(store.energyEvents[0].dimoSegmentId).toBe(parent.coalescedSegmentId);
  });
});

describe('buildRemainingWriteSet', () => {
  it('excludes only proven stale recharge WOULD_UPDATE rows from completion write set', () => {
    const report = buildCompletionReport({
      legacySubsegmentsWouldReplace: ['legacy-sub-a'],
      vehicles: [
        {
          vehicleId: VEHICLE_ID,
          label: 'TEST_EV',
          tokenId: TOKEN_ID,
          provider: 'LTE_R1',
          powertrain: 'EV',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          refuelApplicability: 'APPLICABLE',
          rechargeApplicability: 'APPLICABLE',
          relativeFuelAvailable: false,
          absoluteFuelAvailable: false,
          rechargeSocAvailable: true,
          capabilityLookupStatus: 'ok',
          existingEventCountInWindow: 2,
          energyClass: 'BOTH',
        },
      ],
      candidates: [
        {
          classification: 'WOULD_UPDATE',
          mechanism: 'recharge',
          vehicleId: VEHICLE_ID,
          tokenId: TOKEN_ID,
          label: 'TEST_EV',
          dimoSegmentId: 'legacy-sub-a',
          coalescedFromSegmentIds: ['legacy-sub-a'],
          startTime: '2026-07-16T08:00:00.000Z',
          endTime: '2026-07-16T18:00:00.000Z',
          durationSeconds: 36000,
          fuelDeltaLiters: null,
          fuelDeltaPercent: null,
          socDeltaPercent: 10,
          energyDeltaKwh: 5,
          odometerStartKm: 1000,
          odometerEndKm: 1000,
          confidence: EnergyEventConfidence.HIGH,
          detectorConfigVersion: 'e2-2026-08',
          manualReviewReasons: [],
          existingRowId: 'legacy-row',
          windowFrom: WINDOW_FROM.toISOString(),
          windowTo: WINDOW_TO.toISOString(),
        },
        {
          classification: 'WOULD_UPDATE',
          mechanism: 'refuel',
          vehicleId: VEHICLE_ID,
          tokenId: TOKEN_ID,
          label: 'TEST_EV',
          dimoSegmentId: 'canonical-refuel',
          coalescedFromSegmentIds: ['canonical-refuel'],
          startTime: '2026-08-23T16:15:15.000Z',
          endTime: '2026-08-23T16:23:16.000Z',
          durationSeconds: 481,
          fuelDeltaLiters: 16,
          fuelDeltaPercent: 29,
          socDeltaPercent: null,
          energyDeltaKwh: null,
          odometerStartKm: 1000,
          odometerEndKm: 1000,
          confidence: EnergyEventConfidence.HIGH,
          detectorConfigVersion: 'e2-2026-08',
          manualReviewReasons: [],
          existingRowId: 'refuel-row',
          windowFrom: WINDOW_FROM.toISOString(),
          windowTo: WINDOW_TO.toISOString(),
        },
      ],
    });

    const writeSet = buildRemainingWriteSet(report, new Set(['legacy-sub-a']));
    expect(writeSet).toHaveLength(1);
    expect(writeSet[0].mechanism).toBe('refuel');
  });

  it('keeps canonical recharge parent WOULD_UPDATE when it is not a proven stale subsegment', () => {
    const report = buildCompletionReport({
      vehicles: [
        {
          vehicleId: VEHICLE_ID,
          label: 'TEST_EV',
          tokenId: TOKEN_ID,
          provider: 'LTE_R1',
          powertrain: 'EV',
          dimoAccessAvailable: true,
          dbVehicleMapped: true,
          refuelApplicability: 'NOT_APPLICABLE',
          rechargeApplicability: 'APPLICABLE',
          relativeFuelAvailable: false,
          absoluteFuelAvailable: false,
          rechargeSocAvailable: true,
          capabilityLookupStatus: 'ok',
          existingEventCountInWindow: 2,
          energyClass: 'RECHARGE_CANDIDATE',
        },
      ],
      candidates: [
        {
          classification: 'WOULD_UPDATE',
          mechanism: 'recharge',
          vehicleId: VEHICLE_ID,
          tokenId: TOKEN_ID,
          label: 'TEST_EV',
          dimoSegmentId: 'canonical-parent',
          coalescedFromSegmentIds: ['canonical-parent'],
          startTime: '2026-07-16T08:00:00.000Z',
          endTime: '2026-07-16T18:00:00.000Z',
          durationSeconds: 36000,
          fuelDeltaLiters: null,
          fuelDeltaPercent: null,
          socDeltaPercent: 20,
          energyDeltaKwh: 10,
          odometerStartKm: 1000,
          odometerEndKm: 1000,
          confidence: EnergyEventConfidence.HIGH,
          detectorConfigVersion: 'e2-2026-08',
          manualReviewReasons: [],
          existingRowId: 'parent-row',
          windowFrom: WINDOW_FROM.toISOString(),
          windowTo: WINDOW_TO.toISOString(),
        },
      ],
    });

    const writeSet = buildRemainingWriteSet(report, new Set(['legacy-sub-a']));
    expect(writeSet).toHaveLength(1);
    expect(writeSet[0].mechanism).toBe('recharge');
  });
});

describe('validatePostWriteCompletionReport', () => {
  it('accepts clean completion state with empty gate blockers', () => {
    expect(() => validatePostWriteCompletionReport(buildCompletionReport())).not.toThrow();
  });

  it('rejects stale gate blockers after successful recovery', () => {
    expect(() =>
      validatePostWriteCompletionReport(
        buildCompletionReport({
          gateBlockers: ['CANONICAL_REFUEL_CASE_MISSING'],
        }),
      ),
    ).toThrow(/gate blockers/i);
  });
});
