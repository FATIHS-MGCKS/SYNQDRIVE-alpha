import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { PhysicalRefuelReconciliationRuntimeService } from './physical-refuel-reconciliation-runtime.service';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import {
  classifyPhysicalRefuelSibling,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';
import { pairKey } from './physical-refuel-identity-component.design';
import * as identityMatcher from './physical-refuel-identity.matcher';

jest.mock('@shared/database/pg-advisory-lock.util', () => ({
  acquirePgAdvisoryXactLock64: jest.fn().mockResolvedValue(undefined),
}));

describe('PhysicalRefuelReconciliationRuntimeService (G2.1 runtime R1–R14)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const vehicleId = incidentA.vehicleId;
  const organizationId = 'org-g21-runtime';
  const tokenId = 187336;
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const t0 = 1_700_000_000_000;

  const config = {
    enabled: true,
    candidateLookbackMs: 6 * 60 * 60 * 1000,
    candidateLookaheadMs: 60 * 60 * 1000,
    settlementHorizonMs: horizon,
  };

  function row(
    id: string,
    fuelStart: number,
    fuelEnd: number,
    startTime: string,
    overrides: Partial<RefuelRowForMatcher> = {},
  ): RefuelRowForMatcher {
    return {
      id,
      vehicleId,
      kind: 'REFUEL',
      startTime,
      endTime: incidentA.endTime,
      fuelStartLiters: fuelStart,
      fuelEndLiters: fuelEnd,
      fuelStartPercent: fuelStart,
      fuelEndPercent: fuelEnd,
      fuelDeltaLiters: fuelEnd - fuelStart,
      durationSeconds: 300,
      dimoSegmentId: `seg-${id}`,
      ...overrides,
    };
  }

  function toEnergyEvent(
    matcherRow: RefuelRowForMatcher,
    createdAtMs: number,
    overrides: Partial<VehicleEnergyEvent> = {},
  ): VehicleEnergyEvent {
    const createdAt = new Date(createdAtMs);
    return {
      id: matcherRow.id,
      vehicleId: matcherRow.vehicleId,
      kind: EnergyEventKind.REFUEL,
      detectionMechanism: 'refuel',
      dimoSegmentId: matcherRow.dimoSegmentId ?? `seg-${matcherRow.id}`,
      startTime: new Date(matcherRow.startTime),
      endTime: new Date(matcherRow.endTime),
      durationSeconds: matcherRow.durationSeconds ?? 300,
      startLatitude: 51.3305883,
      startLongitude: 9.5126383,
      endLatitude: 51.3305883,
      endLongitude: 9.5126383,
      fuelDeltaLiters: matcherRow.fuelDeltaLiters ?? null,
      fuelDeltaPercent: matcherRow.fuelDeltaPercent ?? null,
      socDeltaPercent: null,
      energyDeltaKwh: null,
      odometerStartKm: null,
      odometerEndKm: matcherRow.odometerEndKm ?? null,
      confidence: 'HIGH',
      rawDetectionMeta: {
        fuelStartLiters: matcherRow.fuelStartLiters ?? null,
        fuelEndLiters: matcherRow.fuelEndLiters ?? null,
        fuelStartPercent: matcherRow.fuelStartPercent ?? null,
        fuelEndPercent: matcherRow.fuelEndPercent ?? null,
      },
      fuelLevelRiseStart: new Date(matcherRow.startTime),
      fuelLevelRiseEnd: new Date(matcherRow.endTime),
      fuelLevelRiseDurationSeconds: 300,
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    } as VehicleEnergyEvent;
  }

  type Harness = ReturnType<typeof createHarness>;

  function createHarness(options?: {
    enabled?: boolean;
    serializeTransactions?: boolean;
    transactionError?: Error;
  }) {
    const energyEvents = new Map<string, VehicleEnergyEvent>();
    const reconciliations = new Map<string, VehicleEnergyEventRefuelReconciliation>();
    let txLocked = false;

    const findEnergyEvent = (where: { id?: string; dimoSegmentId?: string }) => {
      if (where.id) return energyEvents.get(where.id) ?? null;
      if (where.dimoSegmentId) {
        return [...energyEvents.values()].find((e) => e.dimoSegmentId === where.dimoSegmentId) ?? null;
      }
      return null;
    };

    const findReconciliation = (
      where: { energyEventId: string },
      include?: { energyEvent?: { include?: { fuelStationEnrichment?: boolean } } },
    ) => {
      const row = reconciliations.get(where.energyEventId);
      if (!row) return null;
      if (!include?.energyEvent) return row;
      const event = energyEvents.get(where.energyEventId);
      return {
        ...row,
        energyEvent: {
          ...(event ?? ({} as VehicleEnergyEvent)),
          fuelStationEnrichment: null,
        },
      };
    };

    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      vehicleEnergyEvent: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => findEnergyEvent(where)),
        findMany: jest.fn(
          async ({
            where,
          }: {
            where: {
              vehicleId: string;
              kind?: EnergyEventKind;
              createdAt?: { gte?: Date; lte?: Date };
            };
          }) =>
            [...energyEvents.values()].filter((event) => {
              if (event.vehicleId !== where.vehicleId) return false;
              if (where.kind && event.kind !== where.kind) return false;
              if (where.createdAt?.gte && event.createdAt < where.createdAt.gte) return false;
              if (where.createdAt?.lte && event.createdAt > where.createdAt.lte) return false;
              return true;
            }),
        ),
      },
      vehicleEnergyEventRefuelReconciliation: {
        findMany: jest.fn(
          async ({
            where,
          }: {
            where: {
              vehicleId: string;
              finalityState?: { in: PhysicalRefuelFinalityState[] };
              enrichmentEligible?: boolean;
            };
          }) =>
            [...reconciliations.values()].filter((rec) => {
              if (rec.vehicleId !== where.vehicleId) return false;
              if (
                where.finalityState?.in &&
                !where.finalityState.in.includes(rec.finalityState)
              ) {
                return false;
              }
              if (
                where.enrichmentEligible != null &&
                rec.enrichmentEligible !== where.enrichmentEligible
              ) {
                return false;
              }
              return true;
            }),
        ),
        findUnique: jest.fn(
          async ({
            where,
            include,
          }: {
            where: { energyEventId: string };
            include?: { energyEvent?: { include?: { fuelStationEnrichment?: boolean } } };
          }) => findReconciliation(where, include),
        ),
        create: jest.fn(
          async ({
            data,
          }: {
            data: Omit<VehicleEnergyEventRefuelReconciliation, 'id' | 'reconciledAt' | 'updatedAt'>;
          }) => {
            const created = {
              id: `rec-${reconciliations.size + 1}`,
              reconciledAt: new Date(),
              updatedAt: new Date(),
              ...data,
            } as VehicleEnergyEventRefuelReconciliation;
            reconciliations.set(data.energyEventId, created);
            return created;
          },
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { energyEventId: string };
            data: Partial<VehicleEnergyEventRefuelReconciliation>;
          }) => {
            const existing = reconciliations.get(where.energyEventId);
            if (!existing) throw new Error(`missing reconciliation ${where.energyEventId}`);
            const updated = { ...existing, ...data, updatedAt: new Date() };
            reconciliations.set(where.energyEventId, updated);
            return updated;
          },
        ),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
        if (options?.transactionError) {
          throw options.transactionError;
        }
        if (options?.serializeTransactions) {
          while (txLocked) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          txLocked = true;
          try {
            return await fn(tx);
          } finally {
            txLocked = false;
          }
        }
        return fn(tx);
      }),
      vehicleEnergyEventRefuelReconciliation: {
        findUnique: jest.fn(
          async ({
            where,
            include,
          }: {
            where: { energyEventId: string };
            include?: { energyEvent?: { include?: { fuelStationEnrichment?: boolean } } };
          }) => findReconciliation(where, include),
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { energyEventId: string };
            data: Partial<VehicleEnergyEventRefuelReconciliation>;
          }) => {
            const existing = reconciliations.get(where.energyEventId);
            if (!existing) throw new Error(`missing reconciliation ${where.energyEventId}`);
            const updated = { ...existing, ...data, updatedAt: new Date() };
            reconciliations.set(where.energyEventId, updated);
            return updated;
          },
        ),
      },
    };

    const fuelStationEnrichmentProducer = {
      enqueueAfterPersist: jest.fn().mockResolvedValue('job-1'),
    };

    const coordinateRuntime = {
      resolveCoordinateForEvent: jest.fn().mockResolvedValue({
        latitude: 51.32133585,
        longitude: 9.51465858,
        source: 'physical_refuel_forecourt_dwell_v2',
        selectorVersion: 'v2',
        status: 'SELECTED',
      }),
    };

    const service = new PhysicalRefuelReconciliationRuntimeService(
      prisma as never,
      { ...config, enabled: options?.enabled ?? config.enabled },
      fuelStationEnrichmentProducer as never,
      coordinateRuntime as never,
    );

    return {
      service,
      prisma,
      tx,
      fuelStationEnrichmentProducer,
      coordinateRuntime,
      energyEvents,
      reconciliations,
      seedEvents(events: VehicleEnergyEvent[]) {
        for (const event of events) energyEvents.set(event.id, event);
      },
      seedReconciliations(rows: VehicleEnergyEventRefuelReconciliation[]) {
        for (const row of rows) reconciliations.set(row.energyEventId, row);
      },
    };
  }

  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    dateNowSpy = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function mockAsOf(ms: number) {
    dateNowSpy.mockReturnValue(ms);
  }

  async function reconcile(
    harness: Harness,
    triggerId: string,
    events: VehicleEnergyEvent[],
    reconcileVehicleId: string = vehicleId,
  ) {
    harness.seedEvents(events);
    return harness.service.reconcileAndEnqueueAfterPersist({
      vehicleId: reconcileVehicleId,
      triggerEventId: triggerId,
      organizationId,
      tokenId,
    });
  }

  it('R1 — disabled flag returns empty without touching persistence', async () => {
    const harness = createHarness({ enabled: false });
    const event = toEnergyEvent(incidentA, t0);
    const result = await reconcile(harness, event.id, [event]);

    expect(result).toEqual({
      decisions: [],
      enqueuedEventIds: [],
      dedupedEventIds: [],
    });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersist).not.toHaveBeenCalled();
  });

  it('R2 — non-REFUEL trigger short-circuits inside transaction', async () => {
    const harness = createHarness();
    const recharge = toEnergyEvent(incidentA, t0, {
      id: 'recharge-trigger',
      kind: EnergyEventKind.RECHARGE,
    });
    const result = await reconcile(harness, recharge.id, [recharge]);

    expect(result.decisions).toEqual([]);
    expect(harness.reconciliations.size).toBe(0);
    expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersist).not.toHaveBeenCalled();
  });

  it('R3 — singleton inside horizon → PROVISIONAL persisted, no enqueue', async () => {
    const harness = createHarness();
    const event = toEnergyEvent(incidentA, t0);
    mockAsOf(t0 + 30 * 60 * 1000);

    const result = await reconcile(harness, event.id, [event]);

    expect(result.decisions[0]?.finalityState).toBe('PROVISIONAL');
    expect(result.enqueuedEventIds).toEqual([]);
    expect(harness.reconciliations.get(event.id)?.finalityState).toBe(
      PhysicalRefuelFinalityState.PROVISIONAL,
    );
    expect(harness.tx.vehicleEnergyEventRefuelReconciliation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { energyEventId: event.id } }),
    );
  });

  it('R4 — two SAME siblings inside horizon → SETTLING, no enqueue', async () => {
    const harness = createHarness();
    const eventA = toEnergyEvent(incidentA, t0);
    const eventB = toEnergyEvent(incidentB, t0 + 20 * 60 * 1000);
    mockAsOf(t0 + 25 * 60 * 1000);

    const result = await reconcile(harness, eventB.id, [eventA, eventB]);

    expect(result.decisions[0]?.finalityState).toBe('SETTLING');
    expect(result.enqueuedEventIds).toEqual([]);
    expect(harness.reconciliations.get(eventA.id)?.finalityState).toBe(
      PhysicalRefuelFinalityState.SETTLING,
    );
  });

  it('R5 — three SAME siblings inside horizon → SETTLING, no enqueue', async () => {
    const harness = createHarness();
    const c = row('c-sib', 15, 28, '2026-09-04T03:46:00.000Z', {
      fuelStartPercent: 34.51,
      fuelEndPercent: 43.14,
      odometerEndKm: 187740,
    });
    const eventA = toEnergyEvent(incidentA, t0);
    const eventB = toEnergyEvent(incidentB, t0 + 20 * 60 * 1000);
    const eventC = toEnergyEvent(c, t0 + 40 * 60 * 1000);
    mockAsOf(t0 + 45 * 60 * 1000);

    const result = await reconcile(harness, eventC.id, [eventA, eventB, eventC]);

    expect(result.decisions[0]?.finalityState).toBe('SETTLING');
    expect(result.enqueuedEventIds).toEqual([]);
  });

  it('R6 — after horizon → FINAL_CANONICAL with exactly one enrichment enqueue', async () => {
    const harness = createHarness();
    const eventA = toEnergyEvent(incidentA, t0);
    const eventB = toEnergyEvent(incidentB, t0 + 20 * 60 * 1000);
    mockAsOf(t0 + 40 * 60 * 1000 + horizon + 1);

    const result = await reconcile(harness, eventB.id, [eventA, eventB]);

    expect(result.decisions[0]?.finalityState).toBe('FINAL_CANONICAL');
    expect(result.decisions[0]?.enrichmentEligibleId).toBe(incidentA.id);
    expect(result.enqueuedEventIds).toEqual([incidentA.id]);
    expect(harness.tx.vehicleEnergyEventRefuelReconciliation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { energyEventId: incidentA.id },
        include: { energyEvent: { include: { fuelStationEnrichment: true } } },
      }),
    );
    expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        energyEventId: incidentA.id,
        physicalRefuelReconciliationV2: true,
      }),
    );
  });

  it('R7 — singleton after horizon → FINAL_DISTINCT with enqueue', async () => {
    const harness = createHarness();
    const event = toEnergyEvent(incidentA, t0);
    mockAsOf(t0 + horizon + 1);

    const result = await reconcile(harness, event.id, [event]);

    expect(result.decisions[0]?.finalityState).toBe('FINAL_DISTINCT');
    expect(result.enqueuedEventIds).toEqual([incidentA.id]);
  });

  it('R8 — A+B visible while settlement window open must NOT enqueue', async () => {
    const harness = createHarness();
    const eventA = toEnergyEvent(incidentA, t0);
    const eventB = toEnergyEvent(incidentB, t0 + 20 * 60 * 1000);
    mockAsOf(t0 + 30 * 60 * 1000);

    const result = await reconcile(harness, eventB.id, [eventA, eventB]);

    expect(result.decisions[0]?.finalityState).toBe('SETTLING');
    expect(result.decisions[0]?.finalityState).not.toBe('FINAL_CANONICAL');
    expect(result.enqueuedEventIds).toEqual([]);
  });

  it('R9 — non-transitive ambiguity → INSUFFICIENT_EVIDENCE, zero enqueue', async () => {
    jest.spyOn(identityMatcher, 'classifyPhysicalRefuelSibling').mockImplementation((a, b) => {
      const pair = pairKey(a.id, b.id);
      if (pair === 'a-nt|b-nt' || pair === 'b-nt|c-nt') {
        return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'mock_same' };
      }
      if (pair === 'a-nt|c-nt') {
        return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'mock_distinct' };
      }
      return classifyPhysicalRefuelSibling(a, b);
    });

    const harness = createHarness();
    const rowA = row('a-nt', 5, 28, '2026-09-04T03:40:00.000Z');
    const rowB = row('b-nt', 21, 28, '2026-09-04T03:45:00.000Z');
    const rowC = row('c-nt', 10, 25, '2026-09-04T03:42:00.000Z');
    const events = [rowA, rowB, rowC].map((matcherRow, index) =>
      toEnergyEvent(matcherRow, t0 + index),
    );
    mockAsOf(t0 + horizon + 1);

    const result = await reconcile(harness, events[2].id, events);

    expect(result.decisions[0]?.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.enqueuedEventIds).toEqual([]);
    expect(result.decisions[0]?.reasonCodes).toContain('non_transitive_identity_component');
  });

  it('R10 — A~B canonical group + distinct C → two final enrichments', async () => {
    const harness = createHarness();
    const rowA = row('a-d', 5, 28, '2026-09-04T03:40:00.000Z');
    const rowB = row('b-d', 21, 28, '2026-09-04T03:45:00.000Z');
    const rowC = row('c-d', 5, 20, '2026-09-02T10:00:00.000Z', {
      endTime: '2026-09-02T10:10:00.000Z',
    });
    const eventA = toEnergyEvent(rowA, t0);
    const eventB = toEnergyEvent(rowB, t0);
    const eventC = toEnergyEvent(rowC, t0);
    mockAsOf(t0 + horizon + 1);

    const result = await reconcile(harness, eventC.id, [eventA, eventB, eventC]);

    const sibling = result.decisions.find((d) => d.classification === 'SAME_PHYSICAL_REFUEL');
    const distinct = result.decisions.find((d) => d.classification === 'DISTINCT_PHYSICAL_REFUEL');
    expect(sibling?.finalityState).toBe('FINAL_CANONICAL');
    expect(distinct?.finalityState).toBe('FINAL_DISTINCT');
    expect(result.enqueuedEventIds.sort()).toEqual(
      [sibling?.enrichmentEligibleId, distinct?.enrichmentEligibleId].sort(),
    );
  });

  it('R11 — late sibling after FINAL_DISTINCT finalization fails closed with no enqueue', async () => {
    const harness = createHarness();
    const eventA = toEnergyEvent(incidentA, t0);
    const eventB = toEnergyEvent(incidentB, t0 + horizon + 60_000);
    harness.seedReconciliations([
      {
        id: 'prior-a',
        energyEventId: incidentA.id,
        vehicleId,
        reconciliationGroupId: `${vehicleId}:${incidentA.id}`,
        classification: 'DISTINCT_PHYSICAL_REFUEL',
        finalityState: PhysicalRefuelFinalityState.FINAL_DISTINCT,
        canonicalEventId: incidentA.id,
        enrichmentEligible: true,
        settlementWindowOpen: false,
        lateSiblingConflict: false,
        reason: 'prior',
        reasonCodes: [],
        coordinateLatitude: null,
        coordinateLongitude: null,
        coordinateSource: null,
        coordinateSelectorVersion: null,
        enrichmentEnqueuedAt: new Date(t0),
        reconciledAt: new Date(t0),
        updatedAt: new Date(t0),
      },
    ]);
    mockAsOf(t0 + horizon + 120_000);

    const result = await reconcile(harness, eventB.id, [eventA, eventB]);

    expect(result.decisions[0]?.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.decisions[0]?.reasonCodes).toContain('late_sibling_after_finalization');
    expect(result.enqueuedEventIds).toEqual([]);
  });

  it('R12 — concurrent reconcile calls serialize on advisory lock and converge', async () => {
    const harness = createHarness();
    let concurrentTx = 0;
    let maxConcurrentTx = 0;
    let txLocked = false;
    harness.prisma.$transaction.mockImplementation(async (fn: (client: typeof harness.tx) => Promise<unknown>) => {
      while (txLocked) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      txLocked = true;
      concurrentTx += 1;
      maxConcurrentTx = Math.max(maxConcurrentTx, concurrentTx);
      try {
        return await fn(harness.tx);
      } finally {
        concurrentTx -= 1;
        txLocked = false;
      }
    });

    const event = toEnergyEvent(incidentA, t0);
    mockAsOf(t0 + horizon + 1);
    harness.seedEvents([event]);

    const params = {
      vehicleId,
      triggerEventId: event.id,
      organizationId,
      tokenId,
    };

    const [first, second] = await Promise.all([
      harness.service.reconcileAndEnqueueAfterPersist(params),
      harness.service.reconcileAndEnqueueAfterPersist(params),
    ]);

    expect(acquirePgAdvisoryXactLock64).toHaveBeenCalledTimes(2);
    expect(maxConcurrentTx).toBe(1);
    expect(first.decisions[0]?.finalityState).toBe('FINAL_DISTINCT');
    expect(second.decisions[0]?.finalityState).toBe('FINAL_DISTINCT');
    expect(harness.reconciliations.get(incidentA.id)?.finalityState).toBe(
      PhysicalRefuelFinalityState.FINAL_DISTINCT,
    );
    expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersist).toHaveBeenCalledTimes(1);
  });

  it('R13 — transaction failure returns empty and performs no post-tx enqueue', async () => {
    const harness = createHarness({
      transactionError: new Error('serialization failure'),
    });
    const event = toEnergyEvent(incidentA, t0);
    mockAsOf(t0 + horizon + 1);

    const result = await reconcile(harness, event.id, [event]);

    expect(result).toEqual({
      decisions: [],
      enqueuedEventIds: [],
      dedupedEventIds: [],
    });
    expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersist).not.toHaveBeenCalled();
  });

  it('R14 — unrelated same-vehicle refuels remain FINAL_DISTINCT with enrichment', async () => {
    const harness = createHarness();
    const sep = HISTORICAL_REFUEL_CALIBRATION_ROWS[4];
    const other = HISTORICAL_REFUEL_CALIBRATION_ROWS[5];
    const eventSep = toEnergyEvent(sep, t0);
    const eventOther = toEnergyEvent(other, t0);
    mockAsOf(t0 + horizon + 1);

    const result = await reconcile(
      harness,
      eventOther.id,
      [eventSep, eventOther],
      sep.vehicleId,
    );

    expect(result.decisions).toHaveLength(2);
    expect(result.decisions.every((d) => d.finalityState === 'FINAL_DISTINCT')).toBe(true);
    expect(result.enqueuedEventIds.sort()).toEqual([sep.id, other.id].sort());
    expect(
      result.decisions.every((d) => !d.reasonCodes.includes('late_sibling_after_finalization')),
    ).toBe(true);
  });
});
