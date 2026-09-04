import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import {
  computeCoordinateEvidenceFingerprint,
} from './physical-refuel-coordinate-evidence.util';
import {
  COORDINATE_HOLD_MISSING_DIMO_TOKEN,
  COORDINATE_PROVIDER_ERROR,
  COORDINATE_ROUTE_EVIDENCE_STABILIZING,
  COORDINATE_ROUTE_UNAVAILABLE,
} from './physical-refuel-coordinate-retry.policy';
import * as recoveryRepository from './physical-refuel-recovery.repository';
import { PhysicalRefuelReconciliationRuntimeService } from './physical-refuel-reconciliation-runtime.service';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';
import { PhysicalRefuelReconciliationRecoveryScheduler } from '@workers/schedulers/physical-refuel-reconciliation-recovery.scheduler';
import {
  FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS,
} from '../fuel-stations/enrichment/fuel-station-enrichment-stale.util';

describe('G2.1d final recovery execution closure', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const vehicleId = incidentA.vehicleId;
  const organizationId = 'org-g21d';
  const tokenId = 187336;
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const observationMs = Date.parse('2026-09-02T00:00:00.000Z');
  const v2Cutover = new Date('2026-09-01T00:00:00.000Z');
  const routeStabilizationMs = 2 * 60 * 60 * 1000;

  function toEnergyEvent(
    id: string,
    createdAtMs: number,
    overrides: Partial<VehicleEnergyEvent> = {},
  ): VehicleEnergyEvent {
    const createdAt = new Date(createdAtMs);
    return {
      id,
      vehicleId,
      kind: EnergyEventKind.REFUEL,
      detectionMechanism: 'refuel',
      dimoSegmentId: `seg-${id}`,
      startTime: new Date(incidentA.startTime),
      endTime: new Date(incidentA.endTime),
      durationSeconds: incidentA.durationSeconds ?? 300,
      startLatitude: 51.3305883,
      startLongitude: 9.5126383,
      endLatitude: 51.3305883,
      endLongitude: 9.5126383,
      fuelDeltaLiters: incidentA.fuelDeltaLiters ?? 10,
      fuelDeltaPercent: null,
      socDeltaPercent: null,
      energyDeltaKwh: null,
      odometerStartKm: null,
      odometerEndKm: incidentA.odometerEndKm ?? null,
      confidence: 'HIGH',
      rawDetectionMeta: {},
      fuelLevelRiseStart: new Date(incidentA.startTime),
      fuelLevelRiseEnd: new Date(incidentA.endTime),
      fuelLevelRiseDurationSeconds: 300,
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    } as VehicleEnergyEvent;
  }

  function createRuntimeHarness() {
    const energyEvents = new Map<string, VehicleEnergyEvent>();
    const reconciliations = new Map<string, VehicleEnergyEventRefuelReconciliation>();
    const enrichments = new Map<
      string,
      {
        processingStatus: string;
        lastAttemptAt: Date | null;
        resolutionStatus?: string;
        inputFingerprint?: string;
        resolverVersion?: string;
      }
    >();

    const findReconciliation = (energyEventId: string, include?: { energyEvent?: { include?: { fuelStationEnrichment?: boolean } } }) => {
      const row = reconciliations.get(energyEventId);
      if (!row) return null;
      if (!include?.energyEvent) return row;
      const event = energyEvents.get(energyEventId);
      const enrichment = enrichments.get(energyEventId) ?? null;
      return {
        ...row,
        energyEvent: {
          ...(event ?? ({} as VehicleEnergyEvent)),
          fuelStationEnrichment: enrichment,
        },
      };
    };

    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      vehicleEnergyEvent: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          energyEvents.get(where.id) ?? null,
        ),
        findMany: jest.fn(async ({ where }: { where: { vehicleId: string; kind?: EnergyEventKind; createdAt?: { gte?: Date; lte?: Date } } }) =>
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
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(async ({ where, include }: { where: { energyEventId?: string }; include?: { energyEvent?: { include?: { fuelStationEnrichment?: boolean } } } }) => {
          if (!where.energyEventId) return null;
          return findReconciliation(where.energyEventId, include);
        }),
        create: jest.fn(async ({ data }) => {
          const created = {
            id: `rec-${reconciliations.size + 1}`,
            reconciledAt: new Date(),
            updatedAt: new Date(),
            coordinateEvidenceFingerprint: null,
            routeEvidenceFingerprint: null,
            routeEvidenceStabilizationUntil: null,
            ...data,
          } as VehicleEnergyEventRefuelReconciliation;
          reconciliations.set(data.energyEventId, created);
          return created;
        }),
        update: jest.fn(async ({ where, data }) => {
          const existing = reconciliations.get(where.energyEventId)!;
          const updated = { ...existing, ...data, updatedAt: new Date() };
          reconciliations.set(where.energyEventId, updated);
          return updated;
        }),
      },
      vehicleEnergyEventFuelStationEnrichment: {
        update: jest.fn(async ({ where, data }: { where: { energyEventId: string }; data: { processingStatus?: string } }) => {
          const existing = enrichments.get(where.energyEventId);
          if (!existing) throw new Error('missing enrichment');
          const updated = { ...existing, ...data };
          enrichments.set(where.energyEventId, updated);
          return updated;
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId,
          dimoVehicle: { tokenId },
        }),
      },
      vehicleEnergyEvent: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      vehicleEnergyEventRefuelReconciliation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(async ({ where, include }: { where: { energyEventId: string }; include?: { energyEvent?: { include?: { fuelStationEnrichment?: boolean } } } }) =>
          findReconciliation(where.energyEventId, include),
        ),
        update: tx.vehicleEnergyEventRefuelReconciliation.update,
      },
      vehicleEnergyEventFuelStationEnrichment: tx.vehicleEnergyEventFuelStationEnrichment,
    };

    const fuelStationEnrichmentProducer = {
      enqueueAfterPersistOutcome: jest
        .fn()
        .mockResolvedValue({ status: 'enqueued', jobId: 'job-1' }),
    };

    const coordinateRuntime = {
      resolveCoordinateForEvent: jest.fn().mockResolvedValue({
        latitude: 51.32133585,
        longitude: 9.51465858,
        source: 'physical_refuel_forecourt_dwell_v2',
        selectorVersion: 'v2',
        status: 'SELECTED',
        routeEvidenceFingerprint: 'route-fp-selected',
      }),
    };

    const service = new PhysicalRefuelReconciliationRuntimeService(
      prisma as never,
      {
        enabled: true,
        candidateLookbackMs: 6 * 60 * 60 * 1000,
        candidateLookaheadMs: 60 * 60 * 1000,
        settlementHorizonMs: horizon,
        recoveryEnabled: true,
        recoveryIntervalMs: 60_000,
        recoveryBatchSize: 25,
        v2OwnershipCutoverAt: v2Cutover,
        recoveryOrphanLookbackMs: 7 * 24 * 60 * 60 * 1000,
        routeEvidenceStabilizationMs: routeStabilizationMs,
      } as never,
      { cutoverAt: v2Cutover, cutoverState: 'valid' } as never,
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
      enrichments,
      seedEvent(event: VehicleEnergyEvent) {
        energyEvents.set(event.id, event);
      },
      seedReconciliation(row: VehicleEnergyEventRefuelReconciliation) {
        reconciliations.set(row.energyEventId, row);
      },
      seedEnrichment(
        energyEventId: string,
        status: string,
        lastAttemptAt: Date | null = null,
        extras: Record<string, unknown> = {},
      ) {
        enrichments.set(energyEventId, {
          processingStatus: status,
          lastAttemptAt,
          inputFingerprint: 'fp-1',
          resolverVersion: 'v1',
          ...extras,
        });
      },
    };
  }

  function finalReconciliation(
    event: VehicleEnergyEvent,
    overrides: Partial<VehicleEnergyEventRefuelReconciliation> = {},
  ): VehicleEnergyEventRefuelReconciliation {
    return {
      id: `rec-${event.id}`,
      energyEventId: event.id,
      vehicleId,
      reconciliationGroupId: `${vehicleId}:${event.id}`,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      finalityState: PhysicalRefuelFinalityState.FINAL_DISTINCT,
      canonicalEventId: event.id,
      enrichmentEligible: true,
      settlementWindowOpen: false,
      lateSiblingConflict: false,
      reason: 'final',
      reasonCodes: [],
      coordinateLatitude: 51.32133585,
      coordinateLongitude: 9.51465858,
      coordinateSource: 'physical_refuel_forecourt_dwell_v2',
      coordinateSelectorVersion: 'v2',
      coordinateSelectionStatus: 'SELECTED',
      coordinateRetryCount: 0,
      nextCoordinateRetryAt: null,
      lastCoordinateAttemptAt: new Date(),
      coordinateEvidenceFingerprint: computeCoordinateEvidenceFingerprint(event),
      routeEvidenceFingerprint: 'route-fp-selected',
      routeEvidenceStabilizationUntil: null,
      nextReconciliationAt: null,
      enrichmentEnqueuedAt: new Date(observationMs),
      reconciledAt: new Date(observationMs),
      updatedAt: new Date(observationMs),
      ...overrides,
    } as VehicleEnergyEventRefuelReconciliation;
  }

  describe('stale enrichment end-to-end (SE1–SE5)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(false);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('SE1 FINAL_DISTINCT + PENDING enrichment → runRecoveryBatch enqueues once', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('se1-pending', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'PENDING', null);
      harness.seedReconciliation(finalReconciliation(event));

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
      ]);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);

      expect(result.enqueuedEventIds).toEqual([event.id]);
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalledTimes(1);
    });

    it('SE2 FINAL_CANONICAL + stale PROCESSING → recovery resets to PENDING and enqueues', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('se2-stale-proc', observationMs);
      harness.seedEvent(event);
      const staleAt = new Date(observationMs + horizon + 1 - FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS - 60_000);
      harness.seedEnrichment(event.id, 'PROCESSING', staleAt);
      harness.seedReconciliation(
        finalReconciliation(event, {
          finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
        }),
      );

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
      ]);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);

      expect(result.enqueuedEventIds).toEqual([event.id]);
      expect(harness.tx.vehicleEnergyEventFuelStationEnrichment.update).toHaveBeenCalledWith({
        where: { energyEventId: event.id },
        data: { processingStatus: 'PENDING' },
      });
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalledTimes(1);
    });

    it('SE3 active PROCESSING is not re-driven', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('se3-active', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'PROCESSING', new Date());
      harness.seedReconciliation(finalReconciliation(event));

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
      ]);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);

      expect(result.enqueuedEventIds).toEqual([]);
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).not.toHaveBeenCalled();
    });

    it('SE4 COMPLETED enrichment is not re-driven', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('se4-completed', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'COMPLETED', new Date(), { resolutionStatus: 'MATCHED' });
      harness.seedReconciliation(finalReconciliation(event));

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
      ]);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);

      expect(result.enqueuedEventIds).toEqual([]);
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).not.toHaveBeenCalled();
    });

    it('SE5 terminal FAILED enrichment is not automatically retried', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('se5-failed', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'FAILED', new Date(), { resolutionStatus: 'NO_MATCH' });
      harness.seedReconciliation(finalReconciliation(event));

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
      ]);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);

      expect(result.enqueuedEventIds).toEqual([]);
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).not.toHaveBeenCalled();
    });
  });

  describe('semantic recovery Redis-independent (SR1–SR5)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(false);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('SR1/SR2 scheduler runs without leader guard when Redis unavailable', async () => {
      const runtime = {
        emitRecoveryBacklogMetrics: jest.fn().mockResolvedValue(undefined),
        runRecoveryBatch: jest.fn().mockResolvedValue({
          processedVehicles: 1,
          enqueuedEventIds: [],
          recoveredReasons: { settlement_due: 1 },
        }),
      };
      const scheduler = new PhysicalRefuelReconciliationRecoveryScheduler(
        {
          enabled: true,
          recoveryEnabled: true,
          recoveryIntervalMs: 60_000,
        } as never,
        runtime as never,
      );

      const processed = await scheduler.runRecoveryTick();
      expect(processed).toBe(1);
      expect(runtime.runRecoveryBatch).toHaveBeenCalled();
    });

    it('SR3/SR5 settlement progresses with queue deferred', async () => {
      const harness = createRuntimeHarness();
      harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome.mockResolvedValue({
        status: 'deferred_queue_unavailable',
        jobId: null,
      });
      const event = toEnergyEvent('sr3-prov', observationMs);
      harness.seedEvent(event);
      dateNowSpy.mockReturnValue(observationMs);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });
      expect(harness.reconciliations.get(event.id)?.finalityState).toBe(
        PhysicalRefuelFinalityState.PROVISIONAL,
      );

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });
      expect(harness.reconciliations.get(event.id)?.finalityState).toBe(
        PhysicalRefuelFinalityState.FINAL_DISTINCT,
      );
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalled();
    });
  });

  describe('coordinate retry increment exactly once (RC1–RC5)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('RC1/RC2 provider failure increments retry count once per attempt', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('rc-provider', observationMs);
      harness.seedEvent(event);
      harness.coordinateRuntime.resolveCoordinateForEvent
        .mockResolvedValueOnce({
          latitude: null,
          longitude: null,
          source: null,
          selectorVersion: 'v2',
          status: COORDINATE_PROVIDER_ERROR,
          routeEvidenceFingerprint: null,
        })
        .mockResolvedValueOnce({
          latitude: null,
          longitude: null,
          source: null,
          selectorVersion: 'v2',
          status: COORDINATE_PROVIDER_ERROR,
          routeEvidenceFingerprint: null,
        });

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });
      const first = harness.reconciliations.get(event.id)!;
      expect(first.coordinateRetryCount).toBe(1);

      const delay = first.nextCoordinateRetryAt!.getTime() - (observationMs + horizon + 1);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1 + delay + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });
      expect(harness.reconciliations.get(event.id)?.coordinateRetryCount).toBe(2);
    });

    it('RC3/RC4 missing token increments retry count once per attempt', async () => {
      const harness = createRuntimeHarness();
      harness.prisma.vehicle.findUnique.mockResolvedValue({
        organizationId,
        dimoVehicle: null,
      });
      const event = toEnergyEvent('rc-token', observationMs);
      harness.seedEvent(event);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1);

      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
      });
      const first = harness.reconciliations.get(event.id)!;
      expect(first.coordinateSelectionStatus).toBe(COORDINATE_HOLD_MISSING_DIMO_TOKEN);
      expect(first.coordinateRetryCount).toBe(1);

      const delay = first.nextCoordinateRetryAt!.getTime() - (observationMs + horizon + 1);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1 + delay + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
      });
      expect(harness.reconciliations.get(event.id)?.coordinateRetryCount).toBe(2);
    });

    it('RC5 SELECTED does not increment coordinateRetryCount', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('rc-selected', observationMs);
      harness.seedEvent(event);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1);

      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.reconciliations.get(event.id)?.coordinateRetryCount ?? 0).toBe(0);
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalled();
    });
  });

  describe('route evidence stabilization runtime (RE4–RE6)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('RE4 stable terminal hold does not hot-loop', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('re4-stable', observationMs);
      harness.seedEvent(event);
      harness.seedReconciliation(
        finalReconciliation(event, {
          coordinateLatitude: null,
          coordinateLongitude: null,
          coordinateSource: null,
          coordinateSelectionStatus: 'NO_DWELL_FOUND_FOR_STABLE_EVIDENCE',
          enrichmentEnqueuedAt: null,
        }),
      );

      dateNowSpy.mockReturnValue(observationMs + routeStabilizationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.coordinateRuntime.resolveCoordinateForEvent).not.toHaveBeenCalled();
    });

    it('RE5 event evidence invalidation still reopens coordinate resolution', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('re5-evidence', observationMs);
      harness.seedEvent(event);
      harness.seedReconciliation(
        finalReconciliation(event, {
          coordinateLatitude: null,
          coordinateLongitude: null,
          coordinateSource: null,
          coordinateSelectionStatus: 'NO_DWELL_FOUND_FOR_STABLE_EVIDENCE',
          coordinateEvidenceFingerprint: computeCoordinateEvidenceFingerprint(
            toEnergyEvent('re5-evidence', observationMs, { fuelLevelRiseStart: null }),
          ),
          enrichmentEnqueuedAt: null,
        }),
      );

      dateNowSpy.mockReturnValue(observationMs + routeStabilizationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.coordinateRuntime.resolveCoordinateForEvent).toHaveBeenCalled();
    });

    it('RE6 provider ROUTE_UNAVAILABLE remains distinct from stabilization', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('re6-route', observationMs);
      harness.seedEvent(event);
      harness.coordinateRuntime.resolveCoordinateForEvent.mockResolvedValue({
        latitude: null,
        longitude: null,
        source: null,
        selectorVersion: 'v2',
        status: COORDINATE_ROUTE_UNAVAILABLE,
        routeEvidenceFingerprint: null,
      });

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      const row = harness.reconciliations.get(event.id)!;
      expect(row.coordinateSelectionStatus).toBe(COORDINATE_ROUTE_UNAVAILABLE);
      expect(row.coordinateSelectionStatus).not.toBe(COORDINATE_ROUTE_EVIDENCE_STABILIZING);
    });
  });

  describe('recovery error isolation (ERROR_ISOLATION)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(false);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('two work items for same vehicle both process without abort', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('iso-two', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'PENDING', null);
      harness.seedReconciliation(finalReconciliation(event));

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
        { vehicleId, triggerEventId: event.id, reason: 'stale_enrichment' },
      ]);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);
      expect(result.processedVehicles).toBe(2);
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalled();
    });

    it('first vehicle failure does not abort second vehicle recovery', async () => {
      const harness = createRuntimeHarness();
      const eventB = toEnergyEvent('iso-b', observationMs + 60_000);
      harness.seedEvent(eventB);
      harness.seedEnrichment(eventB.id, 'PENDING', null);
      harness.seedReconciliation(finalReconciliation(eventB));
      const errorSpy = jest.spyOn(harness.service['logger'], 'error');

      jest.spyOn(recoveryRepository, 'findPhysicalRefuelRecoveryWork').mockResolvedValue([
        { vehicleId, triggerEventId: eventB.id, reason: 'stale_enrichment' },
        { vehicleId, triggerEventId: eventB.id, reason: 'stale_enrichment' },
      ]);

      const prototype = PhysicalRefuelReconciliationRuntimeService.prototype as unknown as {
        reconcileVehicle: (...args: unknown[]) => Promise<unknown>;
      };
      const originalReconcile = prototype.reconcileVehicle;
      let reconcileCalls = 0;
      jest.spyOn(prototype, 'reconcileVehicle').mockImplementation(async function (
        this: PhysicalRefuelReconciliationRuntimeService,
        ...args: unknown[]
      ) {
        reconcileCalls += 1;
        if (reconcileCalls === 1) {
          throw new Error('simulated reconcile failure');
        }
        return originalReconcile.apply(this, args);
      });

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      const result = await harness.service.runRecoveryBatch(observationMs + horizon + 1);
      expect(reconcileCalls).toBe(2);
      expect(result.processedVehicles).toBe(2);
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
