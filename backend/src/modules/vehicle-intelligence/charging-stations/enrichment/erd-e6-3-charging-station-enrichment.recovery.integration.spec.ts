import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION } from '../enrichment/charging-station-enrichment.constants';
import {
  buildChargingStationEnrichmentInputFingerprint,
} from '../enrichment/charging-station-enrichment-fingerprint.util';
import { deriveCanonicalChargingStationEnrichmentCoordinate } from '../enrichment/derive-canonical-charging-station-enrichment-coordinate';
import { CHARGING_STATION_ENRICHMENT_STALE_PROCESSING_MS } from '../enrichment/charging-station-enrichment-stale.util';
import {
  bootstrapE6_3PostgresOrchestrator,
  cleanupOrgVehicle,
  createCanonicalRechargeEvent,
  createE6_3EnrichmentConfig,
  createE6_3IsolatedQueue,
  createE6_3Processor,
  createE6_3Producer,
  createE6_3RecoveryScheduler,
  createE6_3Worker,
  deterministicRechargeJobId,
  drainQueue,
  E6_3_MATCH_LAT,
  E6_3_MATCH_LON,
  E6_3_POST_CUTOVER_END,
  E6_3_PRE_CUTOVER_END,
  enableWorkersForQueueTests,
  seedOrgVehicle,
  startE6_3RedisStack,
  waitForJobState,
  CHARGING_STATION_RESOLVER_VERSION,
} from '../testing/erd-e6-3-charging-enrichment.integration.harness';
import type { Worker } from 'bullmq';

const LIVE = process.env.ERD_E6_3_RECOVERY_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('ERD E6.3 charging enrichment recovery (R1–R12)', () => {
  let prisma: PrismaClient;
  let orchestrator: Awaited<ReturnType<typeof bootstrapE6_3PostgresOrchestrator>>['orchestrator'];
  let redisStack: Awaited<ReturnType<typeof startE6_3RedisStack>>;
  let queue: ReturnType<typeof createE6_3IsolatedQueue>;
  let producer: ReturnType<typeof createE6_3Producer>;
  let processor: ReturnType<typeof createE6_3Processor>;
  let worker: Worker | undefined;
  let scheduler: ReturnType<typeof createE6_3RecoveryScheduler>;

  beforeAll(async () => {
    const boot = await bootstrapE6_3PostgresOrchestrator();
    prisma = boot.prisma;
    orchestrator = boot.orchestrator;
    redisStack = await startE6_3RedisStack();
    enableWorkersForQueueTests();
    queue = createE6_3IsolatedQueue(redisStack.connection, 'recovery-gate');
    producer = createE6_3Producer(queue, prisma);
    processor = createE6_3Processor(orchestrator);
    worker = createE6_3Worker(queue, processor);
    scheduler = createE6_3RecoveryScheduler({
      prisma,
      producer,
      leaderGuard: { shouldRun: () => true },
    });
  }, 180_000);

  afterAll(async () => {
    await worker?.close().catch(() => undefined);
    if (queue) await drainQueue(queue);
    await redisStack?.stop().catch(() => undefined);
    await prisma?.$disconnect().catch(() => undefined);
  });

  async function drainActiveQueueJobs(): Promise<void> {
    const states = ['waiting', 'delayed', 'active', 'completed', 'failed', 'prioritized'] as const;
    for (const state of states) {
      const jobs = await queue.getJobs([state]);
      for (const job of jobs) {
        await job.remove().catch(() => undefined);
      }
    }
  }

  async function jobCountForEventIds(eventIds: string[]): Promise<number> {
    let count = 0;
    for (const id of eventIds) {
      const event = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id } });
      if (await queue.getJob(deterministicRechargeJobId(event))) count += 1;
    }
    return count;
  }

  beforeEach(async () => {
    await drainActiveQueueJobs();
  });

  function fingerprintForEvent(event: { id: string; startLatitude: number | null; startLongitude: number | null; endLatitude: number | null; endLongitude: number | null }) {
    const coordinateOutcome = deriveCanonicalChargingStationEnrichmentCoordinate(event as never);
    return buildChargingStationEnrichmentInputFingerprint({
      energyEventId: event.id,
      coordinateOutcome,
    });
  }

  async function seedCanonicalEvent() {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    return { org, vehicle, event };
  }

  it('R1: post-cutover canonical event without enrichment is discovered and enqueued', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      const recovered = await scheduler.recoverMissedEnrichments();
      expect(recovered).toBeGreaterThanOrEqual(1);
      await waitForJobState(queue, jobId, 'completed', 25_000);
      const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      });
      expect(row?.resolutionStatus).toBe('MATCHED');
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R2: PENDING enrichment row is recoverable', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const fp = fingerprintForEvent(event);
    try {
      await prisma.vehicleEnergyEventChargingStationEnrichment.create({
        data: {
          energyEventId: event.id,
          processingStatus: 'PENDING',
          inputFingerprint: fp,
          resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        },
      });
      const recovered = await scheduler.recoverMissedEnrichments();
      expect(recovered).toBeGreaterThanOrEqual(1);
      await waitForJobState(queue, deterministicRechargeJobId(event), 'completed', 25_000);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R3: stale PROCESSING enrichment is recoverable', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const fp = fingerprintForEvent(event);
    const staleAt = new Date(Date.now() - CHARGING_STATION_ENRICHMENT_STALE_PROCESSING_MS - 60_000);
    try {
      await prisma.vehicleEnergyEventChargingStationEnrichment.create({
        data: {
          energyEventId: event.id,
          processingStatus: 'PROCESSING',
          inputFingerprint: fp,
          resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
          inputLatitude: E6_3_MATCH_LAT,
          inputLongitude: E6_3_MATCH_LON,
          inputCoordinateSource: 'start',
          inputCoordinateSelectorVersion: CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION,
          lastAttemptAt: staleAt,
        },
      });
      const recovered = await scheduler.recoverMissedEnrichments();
      expect(recovered).toBeGreaterThanOrEqual(1);
      await waitForJobState(queue, deterministicRechargeJobId(event), 'completed', 25_000);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R4: PROCESSING + ERROR resolution is recoverable', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const fp = fingerprintForEvent(event);
    try {
      await prisma.vehicleEnergyEventChargingStationEnrichment.create({
        data: {
          energyEventId: event.id,
          processingStatus: 'PROCESSING',
          resolutionStatus: 'ERROR',
          inputFingerprint: fp,
          resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
          lastAttemptAt: new Date(),
          errorMessage: 'resolver_error',
        },
      });
      const recovered = await scheduler.recoverMissedEnrichments();
      expect(recovered).toBeGreaterThanOrEqual(1);
      await waitForJobState(queue, deterministicRechargeJobId(event), 'completed', 25_000);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R5: non-stale active PROCESSING is not re-enqueued', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const fp = fingerprintForEvent(event);
    try {
      await prisma.vehicleEnergyEventChargingStationEnrichment.create({
        data: {
          energyEventId: event.id,
          processingStatus: 'PROCESSING',
          inputFingerprint: fp,
          resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
          lastAttemptAt: new Date(),
        },
      });
      const recovered = await scheduler.recoverMissedEnrichments();
      expect(recovered).toBe(0);
      expect(
        await prisma.vehicleEnergyEventChargingStationEnrichment.count({
          where: { energyEventId: event.id, processingStatus: 'PROCESSING' },
        }),
      ).toBe(1);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R6: terminal COMPLETED enrichment is not reprocessed without fingerprint change', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    try {
      await orchestrator.processEnergyEvent(event.id);
      await drainActiveQueueJobs();
      await scheduler.recoverMissedEnrichments();
      const refreshed = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: event.id },
        include: { chargingStationEnrichment: true },
      });
      const skip = await producer.enqueueForEventOutcome(refreshed);
      expect(skip.status).toBe('terminal_skip');
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R7: pre-cutover canonical event is excluded from recovery', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
      endTime: E6_3_PRE_CUTOVER_END,
    });
    try {
      await scheduler.recoverMissedEnrichments();
      expect(await queue.getJob(deterministicRechargeJobId(event))).toBeNull();
      expect(
        await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
          where: { energyEventId: event.id },
        }),
      ).toBeNull();
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R8/R9: REFUEL and legacy RECHARGE are excluded from recovery query', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const refuel = await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.REFUEL,
        detectionMechanism: 'test',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        confidence: EnergyEventConfidence.MEDIUM,
        startTime: new Date('2026-09-10T10:00:00.000Z'),
        endTime: E6_3_POST_CUTOVER_END,
        durationSeconds: 3600,
        startLatitude: E6_3_MATCH_LAT,
        startLongitude: E6_3_MATCH_LON,
      },
    });
    const legacy = await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'legacy',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        confidence: EnergyEventConfidence.MEDIUM,
        startTime: new Date('2026-09-10T10:00:00.000Z'),
        endTime: E6_3_POST_CUTOVER_END,
        durationSeconds: 3600,
        startLatitude: E6_3_MATCH_LAT,
        startLongitude: E6_3_MATCH_LON,
      },
    });
    try {
      await scheduler.recoverMissedEnrichments();
      expect(
        await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
          where: { energyEventId: refuel.id },
        }),
      ).toBeNull();
      expect(
        await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
          where: { energyEventId: legacy.id },
        }),
      ).toBeNull();
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [refuel.id, legacy.id]);
    }
  });

  it('R10: recovery batch bound is respected', async () => {
    const batchScheduler = createE6_3RecoveryScheduler({
      prisma,
      producer,
      leaderGuard: { shouldRun: () => true },
      config: createE6_3EnrichmentConfig({ recoveryBatchSize: 2 }),
    });
    const seeds: { orgId: string; vehicleId: string; eventId: string }[] = [];
    try {
      for (let i = 0; i < 3; i += 1) {
        const { org, vehicle, event } = await seedCanonicalEvent();
        seeds.push({ orgId: org.id, vehicleId: vehicle.id, eventId: event.id });
      }
      const eventIds = seeds.map((s) => s.eventId);
      const beforeJobs = await jobCountForEventIds(eventIds);
      await batchScheduler.recoverMissedEnrichments();
      const afterFirst = await jobCountForEventIds(eventIds);
      expect(afterFirst - beforeJobs).toBe(2);
      await batchScheduler.recoverMissedEnrichments();
      const afterSecond = await jobCountForEventIds(eventIds);
      expect(afterSecond - afterFirst).toBe(1);
    } finally {
      for (const seed of seeds) {
        await cleanupOrgVehicle(prisma, seed.orgId, seed.vehicleId, [seed.eventId]);
      }
    }
  });

  it('R11: leader guard prevents non-leader replica from recovering', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const follower = createE6_3RecoveryScheduler({
      prisma,
      producer,
      leaderGuard: { shouldRun: () => false },
    });
    try {
      expect(await follower.recoverMissedEnrichments()).toBe(0);
      const leader = createE6_3RecoveryScheduler({
        prisma,
        producer,
        leaderGuard: { shouldRun: () => true },
      });
      expect(await leader.recoverMissedEnrichments()).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R12: repeated recovery cycles converge without duplicate enrichment rows', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    try {
      const r1 = await scheduler.recoverMissedEnrichments();
      const r2 = await scheduler.recoverMissedEnrichments();
      expect(r1).toBeGreaterThanOrEqual(1);
      expect(r2).toBe(0);
      await waitForJobState(queue, deterministicRechargeJobId(event), 'completed', 25_000);
      expect(
        await prisma.vehicleEnergyEventChargingStationEnrichment.count({
          where: { energyEventId: event.id },
        }),
      ).toBe(1);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('R-MULTI-REPLICA: parallel leader schedulers dedupe to one BullMQ job', async () => {
    const { org, vehicle, event } = await seedCanonicalEvent();
    const jobId = deterministicRechargeJobId(event);
    const leaderA = createE6_3RecoveryScheduler({
      prisma,
      producer,
      leaderGuard: { shouldRun: () => true },
    });
    const leaderB = createE6_3RecoveryScheduler({
      prisma,
      producer,
      leaderGuard: { shouldRun: () => true },
    });
    try {
      await Promise.all([leaderA.recoverMissedEnrichments(), leaderB.recoverMissedEnrichments()]);
      const job = await queue.getJob(jobId);
      expect(job).not.toBeNull();
      const states = ['waiting', 'delayed', 'active', 'prioritized', 'completed'];
      const jobs = (await queue.getJobs(states as never)).filter((row) => row.id === jobId);
      expect(jobs.length).toBe(1);
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });
});
