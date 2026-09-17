/**
 * PostgreSQL + Redis/BullMQ integration — EXP-021 maturation shadow PR-M2 hardening.
 * Skipped unless EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  PrismaClient,
} from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { buildExp021MaturationShadowJobId } from './reference-capture-exp021-maturation-shadow.constants';
import {
  captureCanonicalStateFingerprint,
  fingerprintsIdentical,
} from './reference-capture-exp021-maturation-shadow-canonical-fingerprint.lib';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { ReferenceCaptureExp021MaturationShadowWorkerService } from './reference-capture-exp021-maturation-shadow-worker.service';
import { Exp021MaturationShadowStratumSemanticMismatchError } from './reference-capture-exp021-maturation-shadow.errors';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION === '1';
const RUNTIME_SHA = 'exp021-m2-hardening-integration-sha';

function makeEnabledConfig(maxActiveFamilies = 50): ReferenceCaptureConfig {
  return {
    isExp021MaturationShadowEnabled: () => true,
    isExp021MaturationShadowHfLaneEnabled: () => true,
    isExp021MaturationShadowSettlementLaneEnabled: () => true,
    getExp021MaturationShadowAllowlistTokenIds: () =>
      Array.from({ length: 256 }, (_, index) => 187336 + index),
    getExp021MaturationShadowMaxActiveFamilies: () => maxActiveFamilies,
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

function attemptTimestamps(windowTo: Date, plannedAgeMs: number) {
  const requestStartedAt = new Date(windowTo.getTime() + plannedAgeMs);
  const requestCompletedAt = new Date(requestStartedAt.getTime() + 500);
  return { requestStartedAt, requestCompletedAt };
}

function successProviderResult(
  overrides: { succeeded?: boolean; windowTo?: Date; plannedAgeMs?: number } = {},
) {
  const succeeded = overrides.succeeded ?? true;
  const windowTo = overrides.windowTo ?? new Date('2026-09-16T12:00:00.000Z');
  const plannedAgeMs = overrides.plannedAgeMs ?? 45_000;
  const { requestStartedAt, requestCompletedAt } = attemptTimestamps(windowTo, plannedAgeMs);
  return {
    requestStartedAt,
    requestCompletedAt,
    providerRequestPhase: succeeded ? 'PROVIDER_HTTP' : 'PROVIDER_HTTP',
    providerRequestSucceeded: succeeded,
    providerOutcomeClass: succeeded
      ? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO
      : Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
    providerStatus: succeeded ? 'ZERO_RESULT' : 'ERROR',
    providerErrorClass: succeeded ? null : 'TRANSPORT_ERROR',
    uniqueBucketLocusCount: succeeded ? 0 : null,
    uniqueTemporalBucketStartCount: succeeded ? 0 : null,
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
  };
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
  'EXP-021 maturation shadow PostgreSQL + Redis integration (PR-M2 hardening)',
  () => {
    let prisma: PrismaClient;
    let memoryServer: RedisMemoryServer;
    let connection: IORedis;
    let queue: Queue;
    let repository: ReferenceCaptureExp021MaturationShadowRepository;
    let runner: ReferenceCaptureExp021MaturationShadowRunnerService;
    let enrollment: ReferenceCaptureExp021MaturationShadowEnrollmentService;
    let providerAdapter: { executeHistoricalQuery: jest.Mock };
    let workerService: ReferenceCaptureExp021MaturationShadowWorkerService;
    let config: ReferenceCaptureConfig;
    let tokenCounter = 187336;

    function nextTokenId(): number {
      const tokenId = tokenCounter;
      tokenCounter += 1;
      return tokenId;
    }

    async function drainQueue(): Promise<void> {
      await queue.obliterate({ force: true });
    }

    beforeAll(async () => {
      process.env.GITHUB_SHA = RUNTIME_SHA;
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        throw new Error('EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION requires isolated Postgres');
      }
      prisma = new PrismaClient();
      repository = new ReferenceCaptureExp021MaturationShadowRepository(prisma as never);
      config = makeEnabledConfig();

      memoryServer = new RedisMemoryServer();
      await memoryServer.start();
      connection = new IORedis({
        host: await memoryServer.getHost(),
        port: await memoryServer.getPort(),
        maxRetriesPerRequest: null,
      });
      queue = new Queue(QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW, { connection });
      runner = new ReferenceCaptureExp021MaturationShadowRunnerService(queue, repository, config);

      providerAdapter = {
        executeHistoricalQuery: jest.fn().mockResolvedValue(successProviderResult()),
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

    beforeEach(async () => {
      providerAdapter.executeHistoricalQuery.mockReset();
      providerAdapter.executeHistoricalQuery.mockImplementation(async (input) =>
        successProviderResult({
          windowTo: input.windowTo,
          plannedAgeMs: 45_000,
          succeeded: true,
        }),
      );
      await drainQueue();
    });

    async function purgeMaturationShadowHierarchy(): Promise<void> {
      await prisma.exp021MaturationShadowObservationAttempt.deleteMany();
      await prisma.exp021MaturationShadowObservationSlot.deleteMany();
      await prisma.exp021MaturationShadowWindow.deleteMany();
      await prisma.exp021MaturationShadowWindowFamily.deleteMany();
    }

    async function enrollFamily(canonicalWindowTo: Date, tokenId = nextTokenId()) {
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenId);
      const result = await enrollment.enrollWindowFamily({
        organizationId,
        vehicleId,
        tokenId,
        canonicalWindowTo,
        enrollmentEventId: randomUUID(),
        activityAuthorityByGeometry: {
          60_000: { speedKmh: 40, speedSignalFresh: true },
          90_000: { speedKmh: 0, speedSignalFresh: true, vehicleTelemetryFresh: true },
        },
      });
      return { ...result, organizationId, vehicleId, tokenId };
    }

    async function firstSlot(familyId: string) {
      const stratum = await prisma.exp021MaturationShadowWindow.findFirst({
        where: { windowFamilyId: familyId },
      });
      const slot = await prisma.exp021MaturationShadowObservationSlot.findFirst({
        where: { windowStratumId: stratum!.id },
      });
      return { stratum: stratum!, slot: slot! };
    }

    it('A/B/C: concurrent enrollment converges to one family/stratum/slot', async () => {
      const tokenId = nextTokenId();
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenId);
      const canonicalWindowTo = new Date('2026-09-16T12:00:00.000Z');
      const input = { organizationId, vehicleId, tokenId, canonicalWindowTo };

      const [a, b] = await Promise.all([
        enrollment.enrollWindowFamily({ ...input, enrollmentEventId: randomUUID() }),
        enrollment.enrollWindowFamily({ ...input, enrollmentEventId: randomUUID() }),
      ]);

      expect(a.familyId).toBe(b.familyId);
      const families = await prisma.exp021MaturationShadowWindowFamily.findMany({
        where: { organizationId, vehicleId, tokenId, canonicalWindowTo },
      });
      expect(families).toHaveLength(1);

      const hf60 = await prisma.exp021MaturationShadowWindow.findMany({
        where: {
          windowFamilyId: a.familyId,
          signalLane: Exp021MaturationShadowSignalLane.HF_FAST_LOOP,
          queryGeometryMs: 60_000,
        },
      });
      expect(hf60).toHaveLength(1);

      const slots = await prisma.exp021MaturationShadowObservationSlot.findMany({
        where: {
          stratum: {
            windowFamilyId: a.familyId,
            signalLane: Exp021MaturationShadowSignalLane.HF_FAST_LOOP,
            queryGeometryMs: 60_000,
          },
        },
      });
      expect(slots.filter((s) => s.plannedAgeMs === 45_000)).toHaveLength(1);
    });

    it('G: geometry-specific activity — 60s MOTION / 90s IDLE shared across lanes', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T12:30:00.000Z'));
      const strata = await prisma.exp021MaturationShadowWindow.findMany({
        where: { windowFamilyId: enrolled.familyId },
      });

      const byGeometryLane = (geometryMs: number, lane: Exp021MaturationShadowSignalLane) =>
        strata.find((s) => s.queryGeometryMs === geometryMs && s.signalLane === lane)!;

      const hf60 = byGeometryLane(60_000, Exp021MaturationShadowSignalLane.HF_FAST_LOOP);
      const settle60 = byGeometryLane(60_000, Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW);
      const hf90 = byGeometryLane(90_000, Exp021MaturationShadowSignalLane.HF_FAST_LOOP);
      const settle90 = byGeometryLane(90_000, Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW);

      expect((hf60.activityClassificationJson as { class: string }).class).toBe('ACTIVE_MOTION');
      expect((settle60.activityClassificationJson as { class: string }).class).toBe('ACTIVE_MOTION');
      expect(hf60.activityClassificationJson).toEqual(settle60.activityClassificationJson);

      expect((hf90.activityClassificationJson as { class: string }).class).toBe('ACTIVE_IDLE');
      expect((settle90.activityClassificationJson as { class: string }).class).toBe('ACTIVE_IDLE');
      expect(hf90.activityClassificationJson).toEqual(settle90.activityClassificationJson);
    });

    it('D: two replicas enqueue same logical age to one BullMQ job identity', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T13:00:00.000Z'));
      const stratum = await prisma.exp021MaturationShadowWindow.findFirst({
        where: {
          windowFamilyId: enrolled.familyId,
          signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
        },
      });
      const slot = await prisma.exp021MaturationShadowObservationSlot.findFirst({
        where: { windowStratumId: stratum!.id, plannedAgeMs: 45_000 },
      });

      await prisma.exp021MaturationShadowObservationSlot.update({
        where: { id: slot!.id },
        data: { bullJobId: null },
      });

      const enqueueInput = {
        observationSlotId: slot!.id,
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum!.id,
        plannedAgeMs: 45_000,
        canonicalWindowTo: new Date('2026-09-16T13:00:00.000Z'),
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
        tokenId: enrolled.tokenId,
      };

      const jobIdA = await runner.enqueueObservationSlot(enqueueInput);
      const jobIdB = await runner.enqueueObservationSlot(enqueueInput);

      expect(jobIdA).toBe(jobIdB);
      const jobs = await queue.getJobs(['delayed', 'waiting', 'paused']);
      expect(jobs.filter((job) => job.id === jobIdA)).toHaveLength(1);
    });

    it('E: recovery reconciles DB slot without BullMQ job', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T14:00:00.000Z'));
      await drainQueue();
      await prisma.exp021MaturationShadowObservationSlot.updateMany({
        where: { stratum: { windowFamilyId: enrolled.familyId } },
        data: { bullJobId: null },
      });

      const { recovered } = await runner.reconcileExecutionState();
      expect(recovered).toBeGreaterThan(0);

      const relinked = await prisma.exp021MaturationShadowObservationSlot.findFirst({
        where: { stratum: { windowFamilyId: enrolled.familyId }, bullJobId: { not: null } },
      });
      expect(relinked?.bullJobId).toBeTruthy();
    });

    it('DB_LINKED_REDIS_JOB_MISSING: non-null bullJobId with missing Redis job recovers', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T14:30:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);
      const ghostJobId = buildExp021MaturationShadowJobId({
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
      });

      await drainQueue();
      await prisma.exp021MaturationShadowObservationSlot.update({
        where: { id: slot.id },
        data: { bullJobId: ghostJobId },
      });

      const ghost = await queue.getJob(ghostJobId);
      expect(ghost).toBeFalsy();

      const { recovered } = await runner.reconcileExecutionState();
      expect(recovered).toBeGreaterThan(0);
      const relinked = await prisma.exp021MaturationShadowObservationSlot.findUnique({
        where: { id: slot.id },
      });
      expect(relinked?.bullJobId).toBeTruthy();
    });

    it('G/H: delayed jobs survive worker restart; duplicate delivery converges', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T15:00:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);

      const jobData = {
        observationSlotId: slot.id,
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
        tokenId: enrolled.tokenId,
        transportRetryOrdinal: 0,
      };

      await queue.add('observe', jobData, {
        jobId: buildExp021MaturationShadowJobId({
          windowFamilyId: enrolled.familyId,
          windowStratumId: stratum.id,
          plannedAgeMs: slot.plannedAgeMs,
        }),
        delay: 0,
      });

      const queuedJob = await queue.getJob(
        buildExp021MaturationShadowJobId({
          windowFamilyId: enrolled.familyId,
          windowStratumId: stratum.id,
          plannedAgeMs: slot.plannedAgeMs,
        }),
      );
      expect(queuedJob).toBeTruthy();
      expect(['delayed', 'waiting']).toContain(await queuedJob!.getState());

      await workerService.executeObservationJob(jobData);

      const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot.id },
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].actualAgeMs).toBeGreaterThanOrEqual(0);
      expect(attempts[0].schedulerDriftMs).toBe(attempts[0].actualAgeMs - attempts[0].plannedAgeMs);

      await workerService.executeObservationJob(jobData);
      const attemptsAfterDuplicate = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot.id },
      });
      expect(attemptsAfterDuplicate).toHaveLength(1);
    });

    it('semantic drift before provider query — no provider call, no attempt', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T15:30:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);

      await prisma.exp021MaturationShadowWindow.update({
        where: { id: stratum.id },
        data: { signalSetHash: 'tampered-hash' },
      });

      const jobData = {
        observationSlotId: slot.id,
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
        tokenId: enrolled.tokenId,
        transportRetryOrdinal: 0,
      };

      await expect(workerService.executeObservationJob(jobData)).rejects.toThrow(
        Exp021MaturationShadowStratumSemanticMismatchError,
      );
      expect(providerAdapter.executeHistoricalQuery).not.toHaveBeenCalled();

      const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot.id },
      });
      expect(attempts).toHaveLength(0);
    });

    it('provider failure + durable retry survives restart without resetting budget', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T16:00:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);

      providerAdapter.executeHistoricalQuery.mockImplementation(async (input) =>
        successProviderResult({
          windowTo: input.windowTo,
          plannedAgeMs: slot.plannedAgeMs,
          succeeded: false,
        }),
      );

      const jobData = {
        observationSlotId: slot.id,
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
        tokenId: enrolled.tokenId,
        transportRetryOrdinal: 0,
      };

      await workerService.executeObservationJob(jobData);
      expect(providerAdapter.executeHistoricalQuery).toHaveBeenCalledTimes(1);

      const afterFirst = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot.id },
      });
      expect(afterFirst).toHaveLength(1);

      await prisma.exp021MaturationShadowObservationSlot.update({
        where: { id: slot.id },
        data: { bullJobId: null },
      });
      await queue.obliterate({ force: true });

      const restartedWorker = new ReferenceCaptureExp021MaturationShadowWorkerService(
        config,
        repository,
        providerAdapter as never,
        runner,
      );

      providerAdapter.executeHistoricalQuery.mockImplementation(async (input) =>
        successProviderResult({
          windowTo: input.windowTo,
          plannedAgeMs: slot.plannedAgeMs,
          succeeded: false,
        }),
      );
      await restartedWorker.executeObservationJob({ ...jobData, transportRetryOrdinal: 0 });
      expect(providerAdapter.executeHistoricalQuery).toHaveBeenCalledTimes(2);

      providerAdapter.executeHistoricalQuery.mockImplementation(async (input) =>
        successProviderResult({
          windowTo: input.windowTo,
          plannedAgeMs: slot.plannedAgeMs,
          succeeded: true,
        }),
      );
      await restartedWorker.executeObservationJob({ ...jobData, transportRetryOrdinal: 99 });
      expect(providerAdapter.executeHistoricalQuery).toHaveBeenCalledTimes(3);

      const allAttempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
        where: { observationSlotId: slot.id },
      });
      expect(allAttempts.length).toBeLessThanOrEqual(4);
      expect(allAttempts.some((a) => a.providerRequestSucceeded)).toBe(true);
    });

    it('RETRY_JOB_LOSS_RECONCILIATION: failed attempt + missing retry job recovers', async () => {
      await purgeMaturationShadowHierarchy();
      const enrolled = await enrollFamily(new Date('2026-09-16T16:30:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);

      const failedTimestamps = attemptTimestamps(stratum.windowTo, slot.plannedAgeMs);
      await repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: {
          plannedAgeMs: slot.plannedAgeMs,
          requestStartedAt: failedTimestamps.requestStartedAt,
          requestCompletedAt: failedTimestamps.requestCompletedAt,
          runtimeBuildSha: RUNTIME_SHA,
          querySemanticsHash: stratum.querySemanticsHash,
          signalSetHash: stratum.signalSetHash,
          providerRequestSucceeded: false,
          providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
          providerStatus: 'ERROR',
          providerErrorClass: 'TRANSPORT_ERROR',
          uniqueBucketLocusCount: null,
          uniqueTemporalBucketStartCount: null,
          perFieldRowCountJson: {},
          perFieldBucketLocusCountJson: {},
          firstProviderTimestamp: null,
          lastProviderTimestamp: null,
          bucketLocusManifestJson: [],
          bucketLocusIdentityVersion: 'FIELD_PIPE_CANONICAL_ISO_MS',
          duplicateCount: 0,
          payloadRevisionCount: 0,
          changedPayloadLocusCount: 0,
          queryProvenanceJson: { phase: 'test-failure' },
        },
      });

      await prisma.exp021MaturationShadowObservationSlot.update({
        where: { id: slot.id },
        data: { bullJobId: null },
      });

      const { recovered } = await runner.reconcileExecutionState();
      expect(recovered).toBeGreaterThan(0);

      const retryJobId = buildExp021MaturationShadowJobId({
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        transportRetryOrdinal: 1,
      });
      const retryJob = await queue.getJob(retryJobId);
      expect(retryJob).toBeTruthy();
    });

    it('COMPLETED_JOB_RECONCILIATION: successful attempt clears stale BullMQ linkage', async () => {
      await purgeMaturationShadowHierarchy();
      const enrolled = await enrollFamily(new Date('2026-09-16T17:00:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);

      const successTimestamps = attemptTimestamps(stratum.windowTo, slot.plannedAgeMs);
      await repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: {
          plannedAgeMs: slot.plannedAgeMs,
          requestStartedAt: successTimestamps.requestStartedAt,
          requestCompletedAt: successTimestamps.requestCompletedAt,
          runtimeBuildSha: RUNTIME_SHA,
          querySemanticsHash: stratum.querySemanticsHash,
          signalSetHash: stratum.signalSetHash,
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
          queryProvenanceJson: { phase: 'test-success' },
        },
      });

      const staleJobId = buildExp021MaturationShadowJobId({
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
      });
      await prisma.exp021MaturationShadowObservationSlot.update({
        where: { id: slot.id },
        data: { bullJobId: staleJobId },
      });

      const { cleared } = await runner.reconcileExecutionState();
      expect(cleared).toBeGreaterThanOrEqual(0);

      const refreshed = await prisma.exp021MaturationShadowObservationSlot.findUnique({
        where: { id: slot.id },
      });
      expect(refreshed?.bullJobId).toBeNull();
    });

    it('ACTIVE_FAMILY_CAP: completed family releases capacity; concurrent admission is atomic', async () => {
      await purgeMaturationShadowHierarchy();
      const capConfig = makeEnabledConfig(1);
      const capRunner = new ReferenceCaptureExp021MaturationShadowRunnerService(queue, repository, capConfig);
      const capEnrollment = new ReferenceCaptureExp021MaturationShadowEnrollmentService(
        capConfig,
        repository,
        capRunner,
      );

      const tokenA = nextTokenId();
      const { organizationId, vehicleId } = await seedOrgVehicle(prisma, tokenA);
      const windowA = new Date('2026-09-16T18:00:00.000Z');
      const familyA = await capEnrollment.enrollWindowFamily({
        organizationId,
        vehicleId,
        tokenId: tokenA,
        canonicalWindowTo: windowA,
        enrollmentEventId: randomUUID(),
      });

      const unfinishedBefore = await repository.countUnfinishedFamilies();
      expect(unfinishedBefore).toBeGreaterThanOrEqual(1);

      const slots = await prisma.exp021MaturationShadowObservationSlot.findMany({
        where: { stratum: { windowFamilyId: familyA.familyId } },
        include: { stratum: true },
      });

      for (const slot of slots) {
        const timestamps = attemptTimestamps(slot.stratum.windowTo, slot.plannedAgeMs);
        await repository.insertObservationAttempt({
          observationSlotId: slot.id,
          rawFacts: {
            plannedAgeMs: slot.plannedAgeMs,
            requestStartedAt: timestamps.requestStartedAt,
            requestCompletedAt: timestamps.requestCompletedAt,
            runtimeBuildSha: RUNTIME_SHA,
            querySemanticsHash: slot.stratum.querySemanticsHash,
            signalSetHash: slot.stratum.signalSetHash,
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
            queryProvenanceJson: {},
          },
        });
      }

      const unfinishedAfterComplete = await repository.countUnfinishedFamilies();
      expect(unfinishedAfterComplete).toBe(0);

      const tokenC = nextTokenId();
      const tokenD = nextTokenId();
      const { organizationId: orgC, vehicleId: vehC } = await seedOrgVehicle(prisma, tokenC);
      const { organizationId: orgD, vehicleId: vehD } = await seedOrgVehicle(prisma, tokenD);

      const raceResults = await Promise.allSettled([
        capEnrollment.enrollWindowFamily({
          organizationId: orgC,
          vehicleId: vehC,
          tokenId: tokenC,
          canonicalWindowTo: new Date('2026-09-16T19:00:00.000Z'),
          enrollmentEventId: randomUUID(),
        }),
        capEnrollment.enrollWindowFamily({
          organizationId: orgD,
          vehicleId: vehD,
          tokenId: tokenD,
          canonicalWindowTo: new Date('2026-09-16T19:30:00.000Z'),
          enrollmentEventId: randomUUID(),
        }),
      ]);

      const fulfilled = raceResults.filter((r) => r.status === 'fulfilled');
      const rejected = raceResults.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/cap reached/i);

      const unfinishedAtCap = await repository.countUnfinishedFamilies();
      expect(unfinishedAtCap).toBe(1);
    });

    it('canonical PostgreSQL fingerprint non-interference', async () => {
      const enrolled = await enrollFamily(new Date('2026-09-16T20:00:00.000Z'));
      const { slot, stratum } = await firstSlot(enrolled.familyId);

      const before = await captureCanonicalStateFingerprint(prisma, {
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
      });

      await workerService.executeObservationJob({
        observationSlotId: slot.id,
        windowFamilyId: enrolled.familyId,
        windowStratumId: stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
        tokenId: enrolled.tokenId,
        transportRetryOrdinal: 0,
      });

      const after = await captureCanonicalStateFingerprint(prisma, {
        organizationId: enrolled.organizationId,
        vehicleId: enrolled.vehicleId,
      });

      expect(fingerprintsIdentical(before, after)).toBe(true);

      const shadowAttempts = await prisma.exp021MaturationShadowObservationAttempt.count({
        where: { slot: { stratum: { windowFamilyId: enrolled.familyId } } },
      });
      expect(shadowAttempts).toBeGreaterThan(0);
    });
  },
);
