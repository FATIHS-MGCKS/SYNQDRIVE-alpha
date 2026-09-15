import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import {
  assertF9PipelineInvariants,
  assertIndependentG2HandoffReplicas,
  assertIndependentPromotionReplicas,
  createIndependentG2HandoffReplicas,
  createIndependentPromotionReplicas,
  disconnectG2HandoffReplicas,
  disconnectPromotionReplicas,
  F9_PROMOTION_CONTEXT,
  isF9LiveIntegration,
  isF9PostgresRequired,
  isF9RedisRequired,
  proveF9IsolatedNonProductionInfra,
  setF9FullHandoffFlags,
  setF9PromotionFlags,
} from './testing/f9-multi-replica.integration.harness';
import {
  assertIsolatedDatabaseUrl,
  backdateEnergyEventObservation,
  buildF5Pr3Stack,
  cleanupVehicle,
  countEffectiveQueueJobs,
  countFallbackVee,
  countOperationalEnrichmentOwners,
  countPromoted,
  F5_PR3_SETTLED_OBSERVATION_AT,
  nativeDistinctSiblingFromCandidate,
  nativeInsufficientSiblingFromCandidate,
  nativeSameSiblingFromCandidate,
  persistReadyCandidate,
  seedOrgVehicle,
  syntheticRiseSamples,
} from './testing/f5-pr3-g2-handoff.harness';
import {
  createIsolatedTestQueue,
  drainTestQueue,
  probeRedis,
} from '../testing/physical-refuel-g21d-final-integration.harness';

const LIVE = isF9LiveIntegration();
const POSTGRES_REQUIRED = isF9PostgresRequired();
const REDIS_REQUIRED = isF9RedisRequired();

if (POSTGRES_REQUIRED && !LIVE) {
  throw new Error('RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED=1 but RAW_FUEL_REFUEL_F9_INTEGRATION is not 1');
}
if (REDIS_REQUIRED && !LIVE) {
  throw new Error('RAW_FUEL_REFUEL_F9_REDIS_REQUIRED=1 but RAW_FUEL_REFUEL_F9_INTEGRATION is not 1');
}

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  assertIsolatedDatabaseUrl();
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function countConvergedNative(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.rawRefuelCandidate.count({
    where: { vehicleId, lifecycleState: 'CONVERGED_NATIVE' },
  });
}

async function promoteViaReplicaById(
  replica: ReturnType<typeof createIndependentPromotionReplicas>['replicaA'],
  candidateId: string,
) {
  return replica.promotion.evaluateAndApplyPromotionById(
    candidateId,
    F9_PROMOTION_CONTEXT,
    process.env,
  );
}

(LIVE ? describe : describe.skip)(
  'RFRF F9 independent-replica promotion (RAW_FUEL_REFUEL_F9_INTEGRATION=1)',
  () => {
    let seedPrisma: PrismaClient;
    let dbAvailable = false;

    beforeAll(async () => {
      dbAvailable = LIVE && (await probeDatabase());
      if (POSTGRES_REQUIRED && !dbAvailable) {
        throw new Error('RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED=1 but isolated PostgreSQL is unavailable');
      }
      proveF9IsolatedNonProductionInfra();
      if (!dbAvailable) return;
      seedPrisma = new PrismaClient();
    }, 60_000);

    afterAll(async () => {
      await seedPrisma?.$disconnect().catch(() => undefined);
    });

    it('F9-P1 — same candidate, two independent promotion replicas => one fallback VEE', async () => {
      if (!dbAvailable) return;
      const restore = setF9PromotionFlags();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(seedPrisma, suffix);
      const { replicaA, replicaB } = createIndependentPromotionReplicas();
      try {
        assertIndependentPromotionReplicas(replicaA, replicaB);
        const stack = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidate = await persistReadyCandidate(stack, vehicle.id);
        const [resultA, resultB] = await Promise.all([
          promoteViaReplicaById(replicaA, candidate.id),
          promoteViaReplicaById(replicaB, candidate.id),
        ]);
        const statuses = new Set([resultA.status, resultB.status]);
        expect(statuses.has('PROMOTED') || statuses.has('ALREADY_PROMOTED')).toBe(true);
        expect(await countFallbackVee(seedPrisma, vehicle.id)).toBe(1);
        expect(await countPromoted(seedPrisma, vehicle.id)).toBe(1);
        const promotedResult = resultA.status === 'PROMOTED' ? resultA : resultB;
        expect(promotedResult.fallbackVehicleEnergyEventId).toBeTruthy();
        const terminal = await seedPrisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(terminal.lifecycleState).toBe('PROMOTED');
        const vee = await seedPrisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: { id: promotedResult.fallbackVehicleEnergyEventId! },
        });
        expect(vee.sourceEventKey).toBe(candidate.candidateIdentityKey);
        await assertF9PipelineInvariants(seedPrisma, vehicle.id, {
          candidateCount: 1,
          fallbackVeeMax: 1,
          promotedMax: 1,
          convergedNativeMax: 0,
        });
      } finally {
        restore();
        await disconnectPromotionReplicas([replicaA, replicaB]);
        await cleanupVehicle(seedPrisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F9-P2 — same native SAME sibling, two replicas => CONVERGED_NATIVE, zero fallback VEE', async () => {
      if (!dbAvailable) return;
      const restore = setF9PromotionFlags();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(seedPrisma, suffix);
      const { replicaA, replicaB } = createIndependentPromotionReplicas();
      try {
        const stack = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidate = await persistReadyCandidate(stack, vehicle.id);
        const native = await seedPrisma.vehicleEnergyEvent.create({
          data: nativeSameSiblingFromCandidate(candidate, suffix),
        });
        const [resultA, resultB] = await Promise.all([
          promoteViaReplicaById(replicaA, candidate.id),
          promoteViaReplicaById(replicaB, candidate.id),
        ]);
        const statuses = new Set([resultA.status, resultB.status]);
        expect(
          statuses.has('CONVERGED_NATIVE') || statuses.has('SKIPPED_CONVERGED_NATIVE'),
        ).toBe(true);
        expect(await countConvergedNative(seedPrisma, vehicle.id)).toBe(1);
        expect(await countFallbackVee(seedPrisma, vehicle.id)).toBe(0);
        expect(await countPromoted(seedPrisma, vehicle.id)).toBe(0);
        const convergedResult = [resultA, resultB].find((row) => row.convergedNativeEventId) ?? resultA;
        expect(convergedResult.convergedNativeEventId).toBe(native.id);
        await assertF9PipelineInvariants(seedPrisma, vehicle.id, {
          candidateCount: 1,
          fallbackVeeMax: 0,
          promotedMax: 0,
          convergedNativeMax: 1,
        });
      } finally {
        restore();
        await disconnectPromotionReplicas([replicaA, replicaB]);
        await cleanupVehicle(seedPrisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F9-P3 — DISTINCT native sibling, two replicas => one fallback VEE, both forensic rows', async () => {
      if (!dbAvailable) return;
      const restore = setF9PromotionFlags();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(seedPrisma, suffix);
      const { replicaA, replicaB } = createIndependentPromotionReplicas();
      try {
        const stack = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidate = await persistReadyCandidate(stack, vehicle.id);
        const native = await seedPrisma.vehicleEnergyEvent.create({
          data: nativeDistinctSiblingFromCandidate(candidate, suffix),
        });
        const [resultA, resultB] = await Promise.all([
          promoteViaReplicaById(replicaA, candidate.id),
          promoteViaReplicaById(replicaB, candidate.id),
        ]);
        const statuses = new Set([resultA.status, resultB.status]);
        expect(statuses.has('PROMOTED') || statuses.has('ALREADY_PROMOTED')).toBe(true);
        expect(await countFallbackVee(seedPrisma, vehicle.id)).toBe(1);
        expect(await countPromoted(seedPrisma, vehicle.id)).toBe(1);
        expect(
          await seedPrisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'DIMO_NATIVE' },
          }),
        ).toBe(1);
        expect(await seedPrisma.vehicleEnergyEvent.findUnique({ where: { id: native.id } })).not.toBeNull();
        await assertF9PipelineInvariants(seedPrisma, vehicle.id, {
          candidateCount: 1,
          fallbackVeeMax: 1,
          promotedMax: 1,
          convergedNativeMax: 0,
        });
      } finally {
        restore();
        await disconnectPromotionReplicas([replicaA, replicaB]);
        await cleanupVehicle(seedPrisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F9-P4 — INSUFFICIENT native sibling, two replicas => fail-closed, zero promotion', async () => {
      if (!dbAvailable) return;
      const restore = setF9PromotionFlags();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(seedPrisma, suffix);
      const { replicaA, replicaB } = createIndependentPromotionReplicas();
      try {
        const stack = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidate = await persistReadyCandidate(stack, vehicle.id);
        await seedPrisma.vehicleEnergyEvent.create({
          data: nativeInsufficientSiblingFromCandidate(candidate, suffix),
        });
        const [resultA, resultB] = await Promise.all([
          promoteViaReplicaById(replicaA, candidate.id),
          promoteViaReplicaById(replicaB, candidate.id),
        ]);
        expect(resultA.status).toBe('FAIL_CLOSED');
        expect(resultB.status).toBe('FAIL_CLOSED');
        expect(await countFallbackVee(seedPrisma, vehicle.id)).toBe(0);
        expect(await countPromoted(seedPrisma, vehicle.id)).toBe(0);
        expect(await countConvergedNative(seedPrisma, vehicle.id)).toBe(0);
        await assertF9PipelineInvariants(seedPrisma, vehicle.id, {
          candidateCount: 1,
          fallbackVeeMax: 0,
          promotedMax: 0,
          convergedNativeMax: 0,
        });
      } finally {
        restore();
        await disconnectPromotionReplicas([replicaA, replicaB]);
        await cleanupVehicle(seedPrisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('F9-P5 — different vehicles, two replicas in parallel => both promote independently', async () => {
      if (!dbAvailable) return;
      const restore = setF9PromotionFlags();
      const suffix = randomUUID().slice(0, 8);
      const vehicleA = await seedOrgVehicle(seedPrisma, `a-${suffix}`);
      const vehicleB = await seedOrgVehicle(seedPrisma, `b-${suffix}`);
      const { replicaA, replicaB } = createIndependentPromotionReplicas();
      try {
        const stackA = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const stackB = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidateA = await persistReadyCandidate(stackA, vehicleA.vehicle.id);
        const candidateB = await persistReadyCandidate(stackB, vehicleB.vehicle.id);
        const [resultA, resultB] = await Promise.all([
          promoteViaReplicaById(replicaA, candidateA.id),
          promoteViaReplicaById(replicaB, candidateB.id),
        ]);
        expect(resultA.status).toBe('PROMOTED');
        expect(resultB.status).toBe('PROMOTED');
        expect(await countFallbackVee(seedPrisma, vehicleA.vehicle.id)).toBe(1);
        expect(await countFallbackVee(seedPrisma, vehicleB.vehicle.id)).toBe(1);
        expect(await countPromoted(seedPrisma, vehicleA.vehicle.id)).toBe(1);
        expect(await countPromoted(seedPrisma, vehicleB.vehicle.id)).toBe(1);
        expect(candidateA.candidateIdentityKey).not.toBe(candidateB.candidateIdentityKey);
      } finally {
        restore();
        await disconnectPromotionReplicas([replicaA, replicaB]);
        await cleanupVehicle(seedPrisma, vehicleA.vehicle.id, vehicleA.org.id, vehicleA.dimoVehicleId);
        await cleanupVehicle(seedPrisma, vehicleB.vehicle.id, vehicleB.org.id, vehicleB.dimoVehicleId);
      }
    });

    it('F9-P10 — pipeline invariant audit helper on promoted fallback path', async () => {
      if (!dbAvailable) return;
      const restore = setF9PromotionFlags();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(seedPrisma, suffix);
      const { replicaA, replicaB } = createIndependentPromotionReplicas();
      try {
        const stack = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidate = await persistReadyCandidate(stack, vehicle.id);
        await Promise.all([
          promoteViaReplicaById(replicaA, candidate.id),
          promoteViaReplicaById(replicaB, candidate.id),
        ]);
        await assertF9PipelineInvariants(seedPrisma, vehicle.id, {
          candidateCount: 1,
          fallbackVeeMax: 1,
          promotedMax: 1,
          convergedNativeMax: 0,
          operationalEnrichmentOwnerMax: 0,
        });
      } finally {
        restore();
        await disconnectPromotionReplicas([replicaA, replicaB]);
        await cleanupVehicle(seedPrisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);

(LIVE ? describe : describe.skip)(
  'RFRF F9 independent-replica G2 handoff (RAW_FUEL_REFUEL_F9_INTEGRATION=1 + Redis)',
  () => {
    let seedPrisma: PrismaClient;
    let dbAvailable = false;
    let redisAvailable = false;
    let queue: Queue;

    beforeAll(async () => {
      dbAvailable = LIVE && (await probeDatabase());
      redisAvailable = LIVE ? await probeRedis() : false;
      if (POSTGRES_REQUIRED && !dbAvailable) {
        throw new Error('RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED=1 but isolated PostgreSQL is unavailable');
      }
      if (REDIS_REQUIRED && !redisAvailable) {
        throw new Error('RAW_FUEL_REFUEL_F9_REDIS_REQUIRED=1 but isolated Redis is unavailable');
      }
      proveF9IsolatedNonProductionInfra();
      if (!dbAvailable || !redisAvailable) return;
      RuntimeStatusRegistry.setWorkersEnabled(true);
      seedPrisma = new PrismaClient();
      queue = createIsolatedTestQueue('f9-p6');
      await queue.waitUntilReady();
    }, 60_000);

    afterAll(async () => {
      if (queue) {
        await drainTestQueue(queue).catch(() => undefined);
      }
      await seedPrisma?.$disconnect().catch(() => undefined);
    });

    it('F9-P6 — independent G2 handoff replicas => one reconciliation owner and one queue job', async () => {
      if (!dbAvailable || !redisAvailable) return;
      const restore = setF9FullHandoffFlags();
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(seedPrisma, suffix);
      const { replicaA: promoA } = createIndependentPromotionReplicas();
      const { replicaA: g2A, replicaB: g2B } = createIndependentG2HandoffReplicas(queue);
      try {
        assertIndependentG2HandoffReplicas(g2A, g2B);
        const stack = buildF5Pr3Stack(seedPrisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
        const candidate = await persistReadyCandidate(stack, vehicle.id);
        const promotion = await promoteViaReplicaById(promoA, candidate.id);
        expect(promotion.status).toBe('PROMOTED');
        const fallbackVeeId = promotion.fallbackVehicleEnergyEventId!;
        await backdateEnergyEventObservation(seedPrisma, fallbackVeeId, F5_PR3_SETTLED_OBSERVATION_AT);
        await seedPrisma.vehicleEnergyEventRefuelReconciliation.create({
          data: {
            energyEventId: fallbackVeeId,
            vehicleId: vehicle.id,
            reconciliationGroupId: `grp-${suffix}`,
            classification: 'SINGLE_CANONICAL',
            finalityState: 'FINAL_CANONICAL',
            canonicalEventId: fallbackVeeId,
            enrichmentEligible: true,
            settlementWindowOpen: false,
            lateSiblingConflict: false,
            reason: 'single_canonical',
            reasonCodes: [],
            coordinateLatitude: 51.3305883,
            coordinateLongitude: 9.5126383,
            coordinateSource: 'SELECTED',
            coordinateSelectionStatus: 'SELECTED',
          },
        });
        const params = {
          vehicleId: vehicle.id,
          organizationId: org.id,
          tokenId,
          fallbackVehicleEnergyEventId: fallbackVeeId,
          promotionStatus: 'ALREADY_PROMOTED' as const,
        };
        const [handoffA, handoffB] = await Promise.all([
          g2A.g2Handoff.handoffAfterPromotionCommit(params),
          g2B.g2Handoff.handoffAfterPromotionCommit(params),
        ]);
        expect(handoffA.status).not.toBe('SKIPPED_NOT_AUTHORIZED');
        expect(handoffB.status).not.toBe('SKIPPED_NOT_AUTHORIZED');
        expect(await countFallbackVee(seedPrisma, vehicle.id)).toBe(1);
        expect(await countPromoted(seedPrisma, vehicle.id)).toBe(1);
        expect(await countEffectiveQueueJobs(queue, fallbackVeeId)).toBe(1);
        expect(await countOperationalEnrichmentOwners(seedPrisma, vehicle.id)).toBeLessThanOrEqual(1);
        await assertF9PipelineInvariants(seedPrisma, vehicle.id, {
          candidateCount: 1,
          fallbackVeeMax: 1,
          promotedMax: 1,
          convergedNativeMax: 0,
          operationalEnrichmentOwnerMax: 1,
          effectiveQueueJobMax: 1,
        }, queue, fallbackVeeId);
      } finally {
        restore();
        await disconnectPromotionReplicas([promoA]);
        await disconnectG2HandoffReplicas([g2A, g2B]);
        await cleanupVehicle(seedPrisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);
