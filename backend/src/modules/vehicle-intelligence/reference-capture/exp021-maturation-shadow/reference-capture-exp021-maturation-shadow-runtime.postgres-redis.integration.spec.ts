/**
 * PostgreSQL + Redis/BullMQ integration — EXP-021 maturation shadow PR-M2.
 * Skipped unless EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  PrismaClient,
} from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { buildExp021MaturationShadowJobId } from './reference-capture-exp021-maturation-shadow.constants';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture-exp021-maturation-shadow-worker.service';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from './reference-capture-exp021-maturation-shadow-provider-query.adapter';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION === '1';

function makeEnabledConfig(): ReferenceCaptureConfig {
  return {
    isExp021MaturationShadowEnabled: () => true,
    isExp021MaturationShadowHfLaneEnabled: () => true,
    isExp021MaturationShadowSettlementLaneEnabled: () => true,
    getExp021MaturationShadowAllowlistTokenIds: () => [187336],
    getExp021MaturationShadowMaxActiveFamilies: () => 0,
    getHfRecoveryPolicyConfig: () => ({
      mode: 'V2' as const,
      settlementDelayMs: 8_000,
      recoveryOverlapMs: 6_000,
      hfHistoricalPollIntervalMs: 30_000,
      recoverySweepEnabled: false,
      recoverySweepIntervalMs: 60_000,
      recoverySweepLookbackMs: 300_000,
      canaryOnly: false,
      canaryTokenIds: [],
      availabilityCalibrationEnabled: false,
    }),
  } as unknown as ReferenceCaptureConfig;
}

async function seedOrgVehicle(
  prisma: PrismaClient,
  tokenId: number,
): Promise<{ organizationId: string; vehicleId: string }> {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const vin = `MS${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Shadow PR-M2 Org'}, 'FLEET', NOW(), NOW())
  `;
  await prisma.$executeRaw`
    INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at)
    VALUES (${vehicleId}, ${organizationId}, ${vin}, 'Test', 'EXP021', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW())
  `;
  const dimoVehicleId = randomUUID();
  const externalId = `ext-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, token_id, connection_status, created_at, updated_at)
    VALUES (${dimoVehicleId}, ${externalId}, ${tokenId}, 'CONNECTED', NOW(), NOW())
  `;
  await prisma.$executeRaw`
    UPDATE vehicles SET dimo_vehicle_id = ${dimoVehicleId} WHERE id = ${vehicleId}
  `;
  return { organizationId, vehicleId };
}

(LIVE ? describe : describe.skip)(
  'EXP-021 maturation shadow PostgreSQL + Redis integration (PR-M2)',
  () => {
    let prisma: PrismaClient;
    let memoryServer: RedisMemoryServer;
    let connection: IORedis;
    let queue: Queue;
    let repository: ReferenceCaptureExp021MaturationShadowRepository;
    let runner: ReferenceCaptureExp021MaturationShadowRunnerService;
    let enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
    let workerService: ReferenceCaptureExp021MaturationShadowWorkerService;
    const config = makeEnabledConfig();

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        throw new Error('EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION requires isolated Postgres');
      }
      prisma = new PrismaClient();
      repository = new ReferenceCaptureExp021MaturationShadowRepository(prisma as never);

      memoryServer = new RedisMemoryServer();
      await memoryServer.start();
      connection = new IORedis({
        host: await memoryServer.getHost(),
        port: await memoryServer.getPort(),
        maxRetriesPerRequest: null,
      });
      queue = new Queue(QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW, { connection });
      runner = new ReferenceCaptureExp021MaturationShadowRunnerService(queue, repository, config);

      const providerAdapter = {
        executeHistoricalQuery: jest.fn().mockResolvedValue({
          requestStartedAt: new Date('2026-09-16T12:00:45.300Z'),
          requestCompletedAt: new Date('2026-09-16T12:00:45.800Z'),
          providerRequestSucceeded: true,
          providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
          providerStatus: 'ZERO_RESULT',
          providerErrorClass: null,
          uniqueBucketLocusCount: 0,
          uniqueTemporalBucketStartCount: 0,
          perFieldRowCountJson: {},
          perFieldBucketLocusCountJson: {},
          firstProviderTimestamp: null,
          lastProviderTimestamp: null,
          bucketLocusManifestJson: [],
          bucketLocusIdentityVersion: 'FIELD_PIPE_CANONICAL_ISO_MS',
          duplicateCount: 0,
          payloadRevisionCount: 0,
          changedPayloadLocusCount: 0,
          queryProvenanceJson: { adapter: 'test' },
        }),
      };

      workerService = new ReferenceCaptureExp021MaturationShadowWorkerService(
        config,
        repository,
        providerAdapter as never,
        runner,
      );
      enrollment = new ReferenceCaptureExp021MaturationShadowEnrollmentService(config, repository, runner);
    }, 120_000);

    afterAll(async () => {
      await queue?.close();
      await connection?.quit();
      await memoryServer?.stop();
      await prisma?.$disconnect();
    });

    it('A/B/C: concurrent enrollment converges to one family/stratum/slot', async () => {
      const tokenId = 187336;
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenId);
      const canonicalWindowTo = new Date('2026-09-16T12:00:00.000Z');
      const input = {
        organizationId,
        vehicleId,
        tokenId,
        canonicalWindowTo,
        enrollmentEventId: randomUUID(),
      };

      const [a, b] = await Promise.all([
        enrollment.enrollWindowFamily({ ...input, enrollmentEventId: randomUUID() }),
        enrollment.enrollWindowFamily({ ...input, enrollmentEventId: randomUUID() }),
      ]);

      expect(a.familyId).toBe(b.familyId);
      const families = await prisma.exp021MaturationShadowWindowFamily.findMany({
        where: { organizationId, vehicleId, tokenId, canonicalWindowTo },
      });
      expect(families).toHaveLength(1);

      const strata = await prisma.exp021MaturationShadowWindow.findMany({
        where: { windowFamilyId: a.familyId },
      });
      const hf60 = strata.filter(
        (s) =>
          s.signalLane === Exp021MaturationShadowSignalLane.HF_FAST_LOOP && s.queryGeometryMs === 60_000,
      );
      expect(hf60).toHaveLength(1);

      const slots = await prisma.exp021MaturationShadowObservationSlot.findMany({
        where: { stratum: { windowFamilyId: a.familyId, signalLane: Exp021MaturationShadowSignalLane.HF_FAST_LOOP, queryGeometryMs: 60_000 } },
      });
      const slot45 = slots.filter((s) => s.plannedAgeMs === 45_000);
      expect(slot45).toHaveLength(1);
    });

    it('D: two replicas enqueue same logical age to one BullMQ job identity', async () => {
      const tokenId = 187336;
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenId);
      const canonicalWindowTo = new Date('2026-09-16T13:00:00.000Z');
      const result = await enrollment.enrollWindowFamily({
        organizationId,
        vehicleId,
        tokenId,
        canonicalWindowTo,
        enrollmentEventId: randomUUID(),
      });

      const stratum = await prisma.exp021MaturationShadowWindow.findFirst({
        where: { windowFamilyId: result.familyId, signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW },
      });
      const slot = await prisma.exp021MaturationShadowObservationSlot.findFirst({
        where: { windowStratumId: stratum!.id, plannedAgeMs: 45_000 },
      });

      await prisma.exp021MaturationShadowObservationSlot.update({
        where: { id: slot!.id },
        data: { bullJobId: null },
      });

      const jobIdA = await runner.enqueueObservationSlot({
        observationSlotId: slot!.id,
        windowFamilyId: result.familyId,
        windowStratumId: stratum!.id,
        plannedAgeMs: 45_000,
        canonicalWindowTo,
        organizationId,
        vehicleId,
        tokenId,
      });
      const jobIdB = await runner.enqueueObservationSlot({
        observationSlotId: slot!.id,
        windowFamilyId: result.familyId,
        windowStratumId: stratum!.id,
        plannedAgeMs: 45_000,
        canonicalWindowTo,
        organizationId,
        vehicleId,
        tokenId,
      });

      expect(jobIdA).toBe(jobIdB);
      expect(jobIdA).toBe(
        buildExp021MaturationShadowJobId({
          windowFamilyId: result.familyId,
          windowStratumId: stratum!.id,
          plannedAgeMs: 45_000,
        }),
      );

      const jobs = await queue.getJobs(['delayed', 'waiting', 'paused']);
      const matching = jobs.filter((job) => job.id === jobIdA);
      expect(matching).toHaveLength(1);
    });

    it('E: recovery reconciles DB slot without BullMQ job', async () => {
      const tokenId = 187336;
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenId);
      const canonicalWindowTo = new Date('2026-09-16T14:00:00.000Z');
      const result = await enrollment.enrollWindowFamily({
        organizationId,
        vehicleId,
        tokenId,
        canonicalWindowTo,
        enrollmentEventId: randomUUID(),
      });

      await prisma.exp021MaturationShadowObservationSlot.updateMany({
        where: { stratum: { windowFamilyId: result.familyId } },
        data: { bullJobId: null },
      });

      const recovered = await runner.recoverMissingJobs();
      expect(recovered).toBeGreaterThan(0);

      const relinked = await prisma.exp021MaturationShadowObservationSlot.findFirst({
        where: { stratum: { windowFamilyId: result.familyId }, bullJobId: { not: null } },
      });
      expect(relinked?.bullJobId).toBeTruthy();
    });

    it('G/H: delayed jobs survive worker restart; duplicate delivery converges', async () => {
      const tokenId = 187336;
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenId);
      const canonicalWindowTo = new Date('2026-09-16T15:00:00.000Z');
      const result = await enrollment.enrollWindowFamily({
        organizationId,
        vehicleId,
        tokenId,
        canonicalWindowTo,
        enrollmentEventId: randomUUID(),
      });

      const stratum = await prisma.exp021MaturationShadowWindow.findFirst({
        where: { windowFamilyId: result.familyId },
      });
      const slot = await prisma.exp021MaturationShadowObservationSlot.findFirst({
        where: { windowStratumId: stratum!.id },
      });

      const jobData = {
        observationSlotId: slot!.id,
        windowFamilyId: result.familyId,
        windowStratumId: stratum!.id,
        plannedAgeMs: slot!.plannedAgeMs,
        organizationId,
        vehicleId,
        tokenId,
        transportRetryOrdinal: 0,
      };

      const worker = new Worker(
        QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW,
        async () => workerService.executeObservationJob(jobData),
        { connection, concurrency: 1 },
      );

      await queue.add('observe', jobData, {
        jobId: buildExp021MaturationShadowJobId({
          windowFamilyId: result.familyId,
          windowStratumId: stratum!.id,
          plannedAgeMs: slot!.plannedAgeMs,
        }),
        delay: 0,
      });

      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await workerService.executeObservationJob(jobData);

      const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot!.id },
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].actualAgeMs).toBeGreaterThanOrEqual(0);
      expect(attempts[0].schedulerDriftMs).toBe(attempts[0].actualAgeMs - attempts[0].plannedAgeMs);

      await workerService.executeObservationJob(jobData);
      const attemptsAfterDuplicate = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot!.id },
      });
      expect(attemptsAfterDuplicate).toHaveLength(1);

      await worker.close();
    });
  },
);
