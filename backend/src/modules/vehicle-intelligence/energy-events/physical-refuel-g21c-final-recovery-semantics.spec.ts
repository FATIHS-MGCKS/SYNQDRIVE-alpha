import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { PhysicalRefuelCoordinateRuntimeService } from './physical-refuel-coordinate-runtime.service';
import {
  computeCoordinateEvidenceFingerprint,
  hasCoordinateEvidenceChanged,
} from './physical-refuel-coordinate-evidence.util';
import { findPhysicalRefuelRecoveryWork } from './physical-refuel-recovery.repository';
import { RETRYABLE_COORDINATE_STATUS_LIST } from './physical-refuel-coordinate-retry.policy';
import { PhysicalRefuelReconciliationRuntimeService } from './physical-refuel-reconciliation-runtime.service';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';
import { FuelStationEnrichmentRecoveryScheduler } from '@workers/schedulers/fuel-station-enrichment-recovery.scheduler';
import { FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS } from '../fuel-stations/enrichment/fuel-station-enrichment-stale.util';
import {
  KS_MX_2024_SEPT04_EVENT_A,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';
import * as fs from 'fs';
import * as path from 'path';

describe('G2.1c final recovery semantics closure', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const vehicleId = incidentA.vehicleId;
  const organizationId = 'org-g21c';
  const tokenId = 187336;
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const observationMs = Date.parse('2026-09-02T00:00:00.000Z');
  const v2Cutover = new Date('2026-09-01T00:00:00.000Z');

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
      rawDetectionMeta: {
        fuelStartLiters: incidentA.fuelStartLiters ?? null,
        fuelEndLiters: incidentA.fuelEndLiters ?? null,
        fuelStartPercent: incidentA.fuelStartPercent ?? null,
        fuelEndPercent: incidentA.fuelEndPercent ?? null,
      },
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
    const enrichments = new Map<string, { processingStatus: string; lastAttemptAt: Date | null }>();

    const findReconciliation = (energyEventId: string) => {
      const row = reconciliations.get(energyEventId);
      if (!row) return null;
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
          const row = reconciliations.get(where.energyEventId);
          if (!row) return null;
          if (!include?.energyEvent) return row;
          const event = energyEvents.get(where.energyEventId);
          const enrichment = enrichments.get(where.energyEventId) ?? null;
          return {
            ...row,
            energyEvent: {
              ...(event ?? ({} as VehicleEnergyEvent)),
              fuelStationEnrichment: enrichment,
            },
          };
        }),
        create: jest.fn(async ({ data }) => {
          const created = {
            id: `rec-${reconciliations.size + 1}`,
            reconciledAt: new Date(),
            updatedAt: new Date(),
            coordinateEvidenceFingerprint: null,
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
        findUnique: jest.fn(async ({ where }: { where: { energyEventId: string } }) =>
          findReconciliation(where.energyEventId),
        ),
        update: tx.vehicleEnergyEventRefuelReconciliation.update,
      },
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
      } as never,
      { cutoverAt: v2Cutover, cutoverState: 'valid' } as never,
      fuelStationEnrichmentProducer as never,
      coordinateRuntime as never,
    );

    return {
      service,
      prisma,
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
      seedEnrichment(energyEventId: string, status: string, lastAttemptAt: Date | null = null) {
        enrichments.set(energyEventId, { processingStatus: status, lastAttemptAt });
      },
    };
  }

  describe('semantic recovery without Redis (S1–S2)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(false);
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('S1 PROVISIONAL due becomes FINAL_DISTINCT without queue', async () => {
      const harness = createRuntimeHarness();
      harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome.mockResolvedValue({
        status: 'deferred_queue_unavailable',
        jobId: null,
      });
      const event = toEnergyEvent('prov-1', observationMs);
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
      const result = await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(result.decisions[0]?.finalityState).toBe('FINAL_DISTINCT');
      expect(harness.reconciliations.get(event.id)?.finalityState).toBe(
        PhysicalRefuelFinalityState.FINAL_DISTINCT,
      );
      expect(harness.reconciliations.get(event.id)?.enrichmentEnqueuedAt ?? null).toBeNull();
    });

    it('S2 SETTLING due becomes FINAL_CANONICAL without queue', async () => {
      const harness = createRuntimeHarness();
      harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome.mockResolvedValue({
        status: 'deferred_queue_unavailable',
        jobId: null,
      });
      const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
      const eventA = toEnergyEvent(incidentA.id, observationMs);
      const eventB = toEnergyEvent(incidentB.id, observationMs + 20 * 60 * 1000, {
        startTime: new Date(incidentB.startTime),
        endTime: new Date(incidentB.endTime),
        fuelLevelRiseStart: new Date(incidentB.startTime),
        fuelLevelRiseEnd: new Date(incidentB.endTime),
        rawDetectionMeta: {
          fuelStartLiters: incidentB.fuelStartLiters ?? null,
          fuelEndLiters: incidentB.fuelEndLiters ?? null,
          fuelStartPercent: incidentB.fuelStartPercent ?? null,
          fuelEndPercent: incidentB.fuelEndPercent ?? null,
        },
        fuelDeltaLiters: incidentB.fuelDeltaLiters ?? 10,
      });
      harness.seedEvent(eventA);
      harness.seedEvent(eventB);
      dateNowSpy.mockReturnValue(observationMs + 20 * 60 * 1000);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: eventB.id,
        organizationId,
        tokenId,
      });
      expect(harness.reconciliations.get(eventA.id)?.finalityState).toBe(
        PhysicalRefuelFinalityState.SETTLING,
      );

      dateNowSpy.mockReturnValue(observationMs + 20 * 60 * 1000 + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: eventB.id,
        organizationId,
        tokenId,
      });

      expect(harness.reconciliations.get(eventA.id)?.finalityState).toBe(
        PhysicalRefuelFinalityState.FINAL_CANONICAL,
      );
      expect(harness.reconciliations.get(eventA.id)?.enrichmentEnqueuedAt ?? null).toBeNull();
    });
  });

  describe('enqueue deferral (S3–S4)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('S3 FINAL eligible + workers disabled keeps enrichmentEnqueuedAt null', async () => {
      const harness = createRuntimeHarness();
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(false);
      const event = toEnergyEvent('final-defer', observationMs);
      harness.seedEvent(event);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1);

      harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome.mockResolvedValue({
        status: 'deferred_queue_unavailable',
        jobId: null,
      });

      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.reconciliations.get(event.id)?.enrichmentEnqueuedAt ?? null).toBeNull();
      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalledTimes(
        1,
      );
    });

    it('S4 workers restored enqueues exactly once', async () => {
      const harness = createRuntimeHarness();
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
      const event = toEnergyEvent('final-retry', observationMs);
      harness.seedEvent(event);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1);

      harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome
        .mockResolvedValueOnce({ status: 'deferred_queue_unavailable', jobId: null })
        .mockResolvedValueOnce({ status: 'enqueued', jobId: 'job-1' });

      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });
      expect(harness.reconciliations.get(event.id)?.enrichmentEnqueuedAt ?? null).toBeNull();

      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).toHaveBeenCalledTimes(
        2,
      );
      expect(harness.reconciliations.get(event.id)?.enrichmentEnqueuedAt).not.toBeNull();
    });
  });

  describe('route evidence epistemics (D1–D4)', () => {
    const dimoSegments = { fetchRouteEnrichmentOutcome: jest.fn() };
    const service = new PhysicalRefuelCoordinateRuntimeService(dimoSegments as never);
    const fixturePath = path.join(
      __dirname,
      '../../dimo/fixtures/ks-mx-2024-sept04-route-fuel.fixture.json',
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
      routePoints: Array<{
        timestamp: string;
        latitude: number | null;
        longitude: number | null;
        speedKmh: number | null;
      }>;
    };
    const ctx = { organizationId, vehicleId, tokenId };

    it('D1 JWT unavailable → ROUTE_UNAVAILABLE retryable hold', async () => {
      const event = toEnergyEvent('route-evt-1', observationMs);
      dimoSegments.fetchRouteEnrichmentOutcome.mockResolvedValue({
        status: 'UNAVAILABLE',
        points: [],
        reason: 'missing_jwt',
      });
      const result = await service.resolveCoordinateForEvent(event, tokenId, ctx);
      expect(result.status).toBe('ROUTE_UNAVAILABLE');
    });

    it('D2 provider error → PROVIDER_ERROR retryable hold', async () => {
      const event = toEnergyEvent('route-evt-2', observationMs);
      dimoSegments.fetchRouteEnrichmentOutcome.mockResolvedValue({
        status: 'FAILED',
        points: [],
        reason: 'provider_error',
      });
      const result = await service.resolveCoordinateForEvent(event, tokenId, ctx);
      expect(result.status).toBe('PROVIDER_ERROR');
    });

    it('D3 successful empty route → NO_DWELL_FOUND terminal-for-evidence', async () => {
      const event = toEnergyEvent('route-evt-3', observationMs);
      dimoSegments.fetchRouteEnrichmentOutcome.mockResolvedValue({
        status: 'SUCCESS',
        points: [{ timestamp: event.startTime.toISOString(), latitude: 51.3, longitude: 9.5 }],
      });
      const result = await service.resolveCoordinateForEvent(event, tokenId, ctx);
      expect(result.status).toBe('NO_DWELL_FOUND');
    });

    it('D4 successful route with dwell → SELECTED', async () => {
      const event = toEnergyEvent('route-evt-4', observationMs, {
        startTime: new Date(KS_MX_2024_SEPT04_EVENT_A.startTime),
        endTime: new Date(KS_MX_2024_SEPT04_EVENT_A.endTime),
        fuelLevelRiseStart: new Date(KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart),
        fuelLevelRiseEnd: new Date(KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseEnd),
      });
      dimoSegments.fetchRouteEnrichmentOutcome.mockResolvedValue({
        status: 'SUCCESS',
        points: fixture.routePoints,
      });
      const result = await service.resolveCoordinateForEvent(event, tokenId, ctx);
      expect(result.status).toBe('SELECTED');
      expect(result.latitude).not.toBeNull();
    });
  });

  describe('missing token backoff (M1)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
    });

    it('M1 missing token increments retry count and increases delay', async () => {
      const harness = createRuntimeHarness();
      harness.prisma.vehicle.findUnique.mockResolvedValue({
        organizationId,
        dimoVehicle: null,
      });
      const event = toEnergyEvent('token-miss', observationMs);
      harness.seedEvent(event);
      dateNowSpy.mockReturnValue(observationMs + horizon + 1);

      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
      });

      const first = harness.reconciliations.get(event.id)!;
      expect(first.coordinateRetryCount).toBe(1);
      const firstDelay = first.nextCoordinateRetryAt!.getTime() - (observationMs + horizon + 1);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1 + firstDelay + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
      });

      const second = harness.reconciliations.get(event.id)!;
      expect(second.coordinateRetryCount).toBe(2);
      expect(second.nextCoordinateRetryAt!.getTime()).toBeGreaterThan(first.nextCoordinateRetryAt!.getTime());
    });
  });

  describe('coordinate recovery selection (H1–H4)', () => {
    const recoveryParams = {
      batchSize: 25,
      asOf: new Date('2026-09-04T18:00:00.000Z'),
      v2OwnershipCutoverAt: v2Cutover,
      orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
    };

    it('H1/H2 terminal holds are not selected by coordinate_retry query', async () => {
      const prisma = {
        vehicleEnergyEventRefuelReconciliation: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
        },
        vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };

      await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);

      const retryCall = prisma.vehicleEnergyEventRefuelReconciliation.findMany.mock.calls[4]?.[0];
      expect(retryCall.where.coordinateSelectionStatus.in).toEqual([
        ...RETRYABLE_COORDINATE_STATUS_LIST,
      ]);
      expect(retryCall.where.nextCoordinateRetryAt).toEqual({ lte: recoveryParams.asOf });
      expect(retryCall.where.coordinateSelectionStatus.in).not.toContain('NO_DWELL_FOUND');
      expect(retryCall.where.coordinateSelectionStatus.in).not.toContain('MISSING_FUEL_RISE_ONSET');
    });

    it('H3 retryable ROUTE_UNAVAILABLE due is returned', async () => {
      const prisma = {
        vehicleEnergyEventRefuelReconciliation: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ vehicleId, energyEventId: 'retry-1' }]),
        },
        vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);
      expect(work).toEqual([
        { vehicleId, triggerEventId: 'retry-1', reason: 'coordinate_retry' },
      ]);
    });

    it('H4 never-attempted FINAL row is coordinate_initial', async () => {
      const prisma = {
        vehicleEnergyEventRefuelReconciliation: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ vehicleId, energyEventId: 'initial-1' }])
            .mockResolvedValueOnce([]),
        },
        vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);
      expect(work).toEqual([
        { vehicleId, triggerEventId: 'initial-1', reason: 'coordinate_initial' },
      ]);
      const initialCall = prisma.vehicleEnergyEventRefuelReconciliation.findMany.mock.calls[3]?.[0];
      expect(initialCall.where.coordinateSelectionStatus).toBeNull();
    });
  });

  describe('evidence fingerprint invalidation (E1–E3)', () => {
    it('E1 terminal MISSING_FUEL_RISE_ONSET reopens when fuelLevelRiseStart appears', () => {
      const withoutRise = toEnergyEvent('ev-1', observationMs, { fuelLevelRiseStart: null });
      const withRise = toEnergyEvent('ev-1', observationMs);
      const persisted = computeCoordinateEvidenceFingerprint(withoutRise);
      const current = computeCoordinateEvidenceFingerprint(withRise);
      expect(hasCoordinateEvidenceChanged(persisted, current)).toBe(true);
    });

    it('E2 unrelated metadata update does not reopen hold', () => {
      const base = toEnergyEvent('ev-2', observationMs);
      const touched = toEnergyEvent('ev-2', observationMs, { confidence: 'MEDIUM' });
      const persisted = computeCoordinateEvidenceFingerprint(base);
      const current = computeCoordinateEvidenceFingerprint(touched);
      expect(hasCoordinateEvidenceChanged(persisted, current)).toBe(false);
    });

    it('E3 coordinate-relevant event evidence change is detected', () => {
      const base = toEnergyEvent('ev-3', observationMs);
      const moved = toEnergyEvent('ev-3', observationMs, { startLatitude: 51.4 });
      expect(
        hasCoordinateEvidenceChanged(
          computeCoordinateEvidenceFingerprint(base),
          computeCoordinateEvidenceFingerprint(moved),
        ),
      ).toBe(true);
    });
  });

  describe('V2 stale enrichment recovery (P1–P5)', () => {
    let dateNowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
      dateNowSpy = jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      dateNowSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('P1/P2 stale PENDING and PROCESSING rows are recovered via stale_enrichment work', async () => {
      const prisma = {
        vehicleEnergyEventRefuelReconciliation: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ vehicleId, energyEventId: 'stale-1' }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
        },
        vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const work = await findPhysicalRefuelRecoveryWork(prisma as never, {
        batchSize: 25,
        asOf: new Date('2026-09-04T18:00:00.000Z'),
        v2OwnershipCutoverAt: v2Cutover,
        orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
        staleProcessingMs: FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS,
      });

      expect(work).toEqual([
        { vehicleId, triggerEventId: 'stale-1', reason: 'stale_enrichment' },
      ]);
    });

    it('P3 active PROCESSING is not treated as stale in runtime enqueue path', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('active-proc', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'PROCESSING', new Date());
      harness.seedReconciliation({
        id: 'rec-active',
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
        nextReconciliationAt: null,
        enrichmentEnqueuedAt: new Date(),
        reconciledAt: new Date(),
        updatedAt: new Date(),
      } as VehicleEnergyEventRefuelReconciliation);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).not.toHaveBeenCalled();
    });

    it('P4 COMPLETED enrichment is not reprocessed', async () => {
      const harness = createRuntimeHarness();
      const event = toEnergyEvent('completed', observationMs);
      harness.seedEvent(event);
      harness.seedEnrichment(event.id, 'COMPLETED', new Date());
      harness.seedReconciliation({
        id: 'rec-done',
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
        nextReconciliationAt: null,
        enrichmentEnqueuedAt: new Date(),
        reconciledAt: new Date(),
        updatedAt: new Date(),
      } as VehicleEnergyEventRefuelReconciliation);

      dateNowSpy.mockReturnValue(observationMs + horizon + 1);
      await harness.service.reconcileAndEnqueueAfterPersist({
        vehicleId,
        triggerEventId: event.id,
        organizationId,
        tokenId,
      });

      expect(harness.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome).not.toHaveBeenCalled();
    });

    it('P5 legacy-owned stale row remains on legacy scheduler path', async () => {
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
      const event = {
        id: 'legacy-stale',
        kind: EnergyEventKind.REFUEL,
        startTime: new Date('2026-09-02T00:00:00.000Z'),
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        startLatitude: 51.3,
        startLongitude: 9.5,
      };
      const prisma = {
        vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([event]) },
        vehicleEnergyEventRefuelReconciliation: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const producer = { enqueueAfterPersistFromEvent: jest.fn().mockResolvedValue('job-legacy') };
      const scheduler = new FuelStationEnrichmentRecoveryScheduler(
        {
          enabled: true,
          recoveryEnabled: true,
          recoveryBatchSize: 10,
          cutoverAt: v2Cutover,
          cutoverState: 'valid',
        } as never,
        { enabled: true, v2OwnershipCutoverAt: v2Cutover } as never,
        prisma as never,
        producer as never,
        { shouldRun: () => true } as never,
        { isEnabled: () => true, resolveV2OwnershipCutoverAt: () => v2Cutover } as never,
      );

      const recovered = await scheduler.recoverMissedEnrichments();
      expect(recovered).toBe(1);
      expect(producer.enqueueAfterPersistFromEvent).toHaveBeenCalledWith(event);
    });
  });
});
