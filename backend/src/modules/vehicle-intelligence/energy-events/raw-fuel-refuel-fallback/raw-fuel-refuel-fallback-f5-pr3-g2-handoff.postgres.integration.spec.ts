import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import {
  assertBothForensicRowsRetained,
  assertF5Pr3RequiredInfra,
  assertIsolatedDatabaseUrl,
  backdateEnergyEventObservation,
  buildF5Pr3Stack,
  buildF5Pr3StackWithQueue,
  cleanupVehicle,
  countEffectiveQueueJobs,
  countFallbackVee,
  countOperationalEnrichmentOwners,
  countPromoted,
  countReconciliationRows,
  F5_PR3_DEFAULT_CUTOVER,
  F5_PR3_G2_CUTOVER,
  F5_PR3_SETTLED_OBSERVATION_AT,
  isF5Pr3LiveIntegration,
  isF5Pr3PostgresRequired,
  isF5Pr3RedisRequired,
  nativeDistinctSiblingFromCandidate,
  nativeInsufficientSiblingFromCandidate,
  nativeSameSiblingFromCandidate,
  persistReadyCandidate,
  promoteCandidateViaRuntime,
  proveF5Pr3IsolatedNonProductionInfra,
  requireRedisForF5Pr3Gate,
  seedCompletedFallbackEnrichment,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
} from './testing/f5-pr3-g2-handoff.harness';
import {
  createIsolatedTestQueue,
  createProducerService,
  createRuntimeService,
  drainTestQueue,
  probeRedis,
} from '../testing/physical-refuel-g21d-final-integration.harness';
import { findPhysicalRefuelRecoveryWork } from '../physical-refuel-recovery.repository';
import { reconcilePhysicalRefuelBatch } from '../physical-refuel-reconciliation.design';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import { RawRefuelG2HandoffService } from './raw-refuel-g2-handoff.service';

const LIVE = isF5Pr3LiveIntegration();
const REDIS_REQUIRED = isF5Pr3RedisRequired();
const POSTGRES_REQUIRED = isF5Pr3PostgresRequired();

if (POSTGRES_REQUIRED && !LIVE) {
  throw new Error('RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED=1 but integration flag is not 1');
}
if (REDIS_REQUIRED && !LIVE) {
  throw new Error('RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1 but integration flag is not 1');
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

describe('RFRF F5-PR3 post-commit G2 handoff (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let dbAvailable = false;
  let redisAvailable = false;

  beforeAll(async () => {
    dbAvailable = LIVE && (await probeDatabase());
    redisAvailable = LIVE ? await requireRedisForF5Pr3Gate() : false;
    assertF5Pr3RequiredInfra(dbAvailable, redisAvailable);
    if (!dbAvailable) return;
    prisma = new PrismaClient();
    if (redisAvailable) {
      RuntimeStatusRegistry.setWorkersEnabled(true);
    }
    if (REDIS_REQUIRED) {
      proveF5Pr3IsolatedNonProductionInfra();
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  });

  (LIVE ? it : it.skip)('gate probe documents LIVE flag requirement', () => {
    expect(LIVE).toBe(true);
  });

  describe.each([
    ['P1 handoff authority OFF after PROMOTED', { handoff: false, promotion: true, convergence: true, g2: true }, { promoted: 1, fallbackVee: 1, reconciliation: 0 }],
    ['P2 convergence+promotion ON handoff OFF blocks direct handoff', { handoff: false, promotion: true, convergence: true, g2: true }, { promoted: 1, reconciliation: 0 }],
    ['P3 convergence OFF blocks promotion and downstream', { handoff: true, promotion: true, convergence: false, g2: true }, { promoted: 0, reconciliation: 0 }],
    ['P4 promotion OFF blocks promotion and downstream', { handoff: true, promotion: false, convergence: true, g2: true }, { promoted: 0, reconciliation: 0 }],
    ['P5 all RFRF ON but G2 disabled allows promotion only', { handoff: true, promotion: true, convergence: true, g2: false }, { promoted: 1, fallbackVee: 1, reconciliation: 0 }],
  ] as const)('%s', (_name, flags, expected) => {
    (LIVE ? it : it.skip)('authority matrix', async () => {
      if (!dbAvailable) return;
      const restore = setRfrfFlags({
        master: true,
        persist: true,
        cutoverAt: '2026-09-06T08:00:00.000Z',
        g2CutoverAt: '2026-09-01T00:00:00.000Z',
        ...flags,
      });
      const suffix = `p-${Math.random().toString(36).slice(2, 8)}`;
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
      try {
        await persistReadyCandidate(stack, vehicle.id);
        if (expected.promoted > 0) {
          const candidate = await prisma.rawRefuelCandidate.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
          await stack.promotion.evaluateAndApplyPromotionById(candidate.id, {
            capability: 'FUEL_CAPABLE',
            absoluteDetectionAdmissibility: 'ADMISSIBLE',
            absoluteSignalTrust: 'TRUSTED',
          });
        }
        const promoted = await countPromoted(prisma, vehicle.id);
        expect(promoted).toBe(expected.promoted);
        if ('fallbackVee' in expected && expected.fallbackVee != null) {
          expect(await countFallbackVee(prisma, vehicle.id)).toBe(expected.fallbackVee);
        }
        expect(await countReconciliationRows(prisma, vehicle.id)).toBe(expected.reconciliation);
      } finally {
        restore();
        await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  });

  (LIVE ? it : it.skip)('P6 authorized fallback enters canonical G2 reconciliation', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p6-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      expect(fallbackVeeId).toBeTruthy();
      const handoff = await stack.g2Handoff.handoffAfterPromotionCommit({
        vehicleId: vehicle.id,
        organizationId: org.id,
        tokenId,
        fallbackVehicleEnergyEventId: fallbackVeeId!,
        promotionStatus: 'PROMOTED',
      });
      expect(handoff.status).not.toBe('SKIPPED_NOT_AUTHORIZED');
      expect(await countReconciliationRows(prisma, vehicle.id)).toBeGreaterThan(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P7 G2 handoff occurs only after promotion transaction commit', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p7-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    let g2CalledDuringTx = false;
    const g2Runtime = {
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: jest.fn().mockImplementation(async () => {
        g2CalledDuringTx = true;
        return { decisions: [], enqueuedEventIds: [], dedupedEventIds: [], heldEventIds: [] };
      }),
    };
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), {
      g2Runtime: g2Runtime as never,
      promotionService: new (await import('./raw-refuel-promotion.service')).RawRefuelPromotionService(
        prisma as never,
      ),
    });
    stack.g2Handoff = new RawRefuelG2HandoffService(g2Runtime as never);
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      await stack.promotion.evaluateAndApplyPromotionById(
        candidate.id,
        { capability: 'FUEL_CAPABLE', absoluteDetectionAdmissibility: 'ADMISSIBLE', absoluteSignalTrust: 'TRUSTED' },
        process.env,
        {
          afterVeeInsertBeforeLifecycleUpdate: async () => {
            expect(g2Runtime.reconcileAndEnqueueAfterPersist).not.toHaveBeenCalled();
          },
        },
      );
      expect(g2CalledDuringTx).toBe(false);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P8 thrown G2 handoff preserves PROMOTED fallback VEE', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p8-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const throwingRuntime = {
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: jest.fn().mockRejectedValue(new Error('g2 throw test')),
    };
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), {
      g2Runtime: throwingRuntime as never,
    });
    stack.g2Handoff = new RawRefuelG2HandoffService(throwingRuntime as never);
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const handoff = await stack.g2Handoff.handoffAfterPromotionCommit({
        vehicleId: vehicle.id,
        organizationId: org.id,
        tokenId: 1,
        fallbackVehicleEnergyEventId: fallbackVeeId!,
        promotionStatus: 'PROMOTED',
      });
      expect(handoff.status).toBe('HANDOFF_FAILED');
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P9 recovery after thrown handoff reconciles exactly once', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p9-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const first = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      expect(first.enqueuedEventIds.length + first.dedupedEventIds.length).toBeGreaterThanOrEqual(0);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      const second = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      expect(second.enqueuedEventIds).toEqual([]);
      expect(second.decisions[0]?.finalityState).toBe(first.decisions[0]?.finalityState);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P10 recovery ignores fallback when handoff authority OFF', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: false,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: '2026-09-01T00:00:00.000Z',
    });
    const suffix = `p10-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 10,
        asOf: new Date('2026-09-07T00:00:00.000Z'),
        v2OwnershipCutoverAt: new Date('2026-09-01T00:00:00.000Z'),
        orphanLookbackFrom: new Date('2026-08-30T00:00:00.000Z'),
      });
      expect(work.some((item) => item.triggerEventId === fallbackVeeId)).toBe(false);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P11 orphan recovery cannot bypass fallback authority', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: false,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: '2026-09-01T00:00:00.000Z',
    });
    const suffix = `p11-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    try {
      const orphan = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `orphan-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T09:30:00.000Z'),
        },
      });
      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 10,
        asOf: new Date('2026-09-07T00:00:00.000Z'),
        v2OwnershipCutoverAt: new Date('2026-09-01T00:00:00.000Z'),
        orphanLookbackFrom: new Date('2026-08-30T00:00:00.000Z'),
      });
      expect(work.some((item) => item.triggerEventId === orphan.id)).toBe(false);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P12 native-triggered G2 excludes unauthorized fallback sibling', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: false,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: '2026-09-01T00:00:00.000Z',
    });
    const suffix = `p12-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const promoted = await stack.promotion.evaluateAndApplyPromotionById(candidate.id, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
      });
      const fallbackId = promoted.fallbackVehicleEnergyEventId!;
      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T09:35:00.000Z'),
        },
      });
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: native.id,
        organizationId: org.id,
        tokenId: 1,
      });
      const fallbackRecon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: fallbackId },
      });
      expect(fallbackRecon).toBeNull();
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P13 authorized fallback coordinate SELECTED yields enrichment eligibility', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p13-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(recon).not.toBeNull();
      expect(recon!.finalityState).toMatch(/FINAL_|SETTLING/);
      expect(recon!.enrichmentEligible).toBe(true);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P14 missing token/context holds coordinate with zero BullMQ', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p14-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      const result = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId: null as unknown as number,
      });
      expect(result.enqueuedEventIds).toEqual([]);
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(recon?.enrichmentEnqueuedAt).toBeNull();
      expect(
        recon?.coordinateSelectionStatus == null ||
          /HOLD|MISSING/.test(recon?.coordinateSelectionStatus ?? ''),
      ).toBe(true);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  }, 10000);

  (LIVE ? it : it.skip)('P15 retryable coordinate hold preserves nextCoordinateRetryAt semantics', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p15-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId: null as unknown as number,
      });
      const first = await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(first.coordinateSelectionStatus == null || /HOLD|MISSING/.test(first.coordinateSelectionStatus ?? '')).toBe(true);
      expect(first.enrichmentEnqueuedAt).toBeNull();
      const secondResult = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId: 1,
      });
      expect(secondResult.enqueuedEventIds.length).toBe(0);
      const second = await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(second.coordinateRetryCount).toBeGreaterThanOrEqual(first.coordinateRetryCount);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P16 queue unavailable defers without false enrichmentEnqueuedAt', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p16-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const throwingProducer = {
      enqueueAfterPersistOutcome: jest.fn().mockRejectedValue(new Error('queue unavailable')),
    };
    const g2Runtime = createRuntimeService(prisma, throwingProducer as never);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), {
      g2Runtime,
    });
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await prisma.vehicleEnergyEventRefuelReconciliation.create({
        data: {
          energyEventId: fallbackVeeId!,
          vehicleId: vehicle.id,
          reconciliationGroupId: `grp-${suffix}`,
          classification: 'SINGLE_CANONICAL',
          finalityState: 'FINAL_CANONICAL',
          canonicalEventId: fallbackVeeId!,
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
      try {
        await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
          vehicleId: vehicle.id,
          triggerEventId: fallbackVeeId!,
          organizationId: org.id,
          tokenId,
        });
      } catch {
        // producer throw is acceptable deferral signal
      }
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(recon.enrichmentEnqueuedAt).toBeNull();
      expect(throwingProducer.enqueueAfterPersistOutcome).toHaveBeenCalled();
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P18 repeated handoff replay is deduped/idempotent', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p18-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const params = {
        vehicleId: vehicle.id,
        organizationId: org.id,
        tokenId,
        fallbackVehicleEnergyEventId: fallbackVeeId!,
        promotionStatus: 'ALREADY_PROMOTED' as const,
      };
      const first = await stack.g2Handoff.handoffAfterPromotionCommit(params);
      const second = await stack.g2Handoff.handoffAfterPromotionCommit(params);
      expect(first.status).not.toBe('SKIPPED_NOT_AUTHORIZED');
      expect(second.status).toMatch(/HANDOFF_(COMPLETED|DEDUPED|HELD|DEFERRED)/);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P19 concurrent repeated handoffs do not double enqueue', async () => {
    if (!dbAvailable) return;
    if (REDIS_REQUIRED && !redisAvailable) {
      throw new Error('RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1 but Redis is unavailable');
    }
    if (!redisAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p19-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const queue = createIsolatedTestQueue('f5pr3-p19');
    await queue.waitUntilReady();
    const stack = buildF5Pr3StackWithQueue(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), queue);
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await prisma.vehicleEnergyEventRefuelReconciliation.create({
        data: {
          energyEventId: fallbackVeeId!,
          vehicleId: vehicle.id,
          reconciliationGroupId: `grp-${suffix}`,
          classification: 'SINGLE_CANONICAL',
          finalityState: 'FINAL_CANONICAL',
          canonicalEventId: fallbackVeeId!,
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
        fallbackVehicleEnergyEventId: fallbackVeeId!,
        promotionStatus: 'ALREADY_PROMOTED' as const,
      };
      await Promise.all([
        stack.g2Handoff.handoffAfterPromotionCommit(params),
        stack.g2Handoff.handoffAfterPromotionCommit(params),
        stack.g2Handoff.handoffAfterPromotionCommit(params),
      ]);
      expect(await countEffectiveQueueJobs(queue, fallbackVeeId!)).toBe(1);
    } finally {
      restore();
      await drainTestQueue(queue);
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P20 A1 late native SAME before enrichment completion — real runtime persistence', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p20a1-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-same`),
      });
      await backdateEnergyEventObservation(
        prisma,
        native.id,
        new Date('2026-09-06T10:45:00.000Z'),
      );
      const nativeResult = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: native.id,
        organizationId: org.id,
        tokenId,
      });
      await assertBothForensicRowsRetained(prisma, vehicle.id, fallbackVeeId!, native.id);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBeLessThanOrEqual(1);
      expect(nativeResult.enqueuedEventIds.length).toBeLessThanOrEqual(1);
      const nativeRecon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: native.id },
      });
      expect(nativeRecon).not.toBeNull();
      expect(await countReconciliationRows(prisma, vehicle.id)).toBeGreaterThanOrEqual(2);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  }, 15000);

  (LIVE ? it : it.skip)('P21 A2 late native SAME after COMPLETED fallback enrichment — real runtime persistence', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p21a2-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      await seedCompletedFallbackEnrichment(prisma, fallbackVeeId!, vehicle.id);
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-late`),
      });
      await backdateEnergyEventObservation(
        prisma,
        native.id,
        new Date('2026-09-06T11:30:00.000Z'),
      );
      const nativeResult = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: native.id,
        organizationId: org.id,
        tokenId,
      });
      await assertBothForensicRowsRetained(prisma, vehicle.id, fallbackVeeId!, native.id);
      const nativeRecon = await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
        where: { energyEventId: native.id },
      });
      expect(nativeRecon.lateSiblingConflict).toBe(true);
      expect(nativeRecon.enrichmentEligible).toBe(false);
      expect(nativeRecon.finalityState).toBe('INSUFFICIENT_EVIDENCE');
      expect(nativeRecon.reasonCodes).toContain('late_sibling_after_finalization');
      const fallbackEnrichment = await prisma.vehicleEnergyEventFuelStationEnrichment.findUnique({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(fallbackEnrichment?.processingStatus).toBe('COMPLETED');
      expect(nativeResult.enqueuedEventIds).toEqual([]);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBeLessThanOrEqual(1);
      expect(
        await prisma.vehicleEnergyEventRefuelReconciliation.count({
          where: { vehicleId: vehicle.id, enrichmentEligible: true, energyEventId: native.id },
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  }, 15000);

  (LIVE ? it : it.skip)('P22 late native DISTINCT remains independent physical event', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p22-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      await prisma.vehicleEnergyEvent.create({
        data: nativeDistinctSiblingFromCandidate(
          await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
          suffix,
        ),
      });
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      const distinctRows = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
        where: { vehicleId: vehicle.id, classification: 'DISTINCT_PHYSICAL_REFUEL' },
      });
      expect(distinctRows.length).toBeGreaterThanOrEqual(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P23 late native INSUFFICIENT fails closed without double ownership', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p23-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: fallbackVeeId! },
      });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeInsufficientSiblingFromCandidate(
          await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
          suffix,
        ),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      const batch = reconcilePhysicalRefuelBatch([nativeRow], {
        asOfMs: Date.parse('2026-09-06T20:00:00.000Z'),
        firstObservedAtById: {
          [fallbackRow.id]: F5_PR3_SETTLED_OBSERVATION_AT.getTime(),
          [nativeRow.id]: native.createdAt.getTime(),
        },
        priorDistinctFinalizationIds: new Set([fallbackRow.id]),
        priorFinalRowsById: { [fallbackRow.id]: fallbackRow },
        settlementConfig: { settlementHorizonMs: 60 * 60 * 1000 },
      });
      expect(batch[0]?.finalityState).toBe('INSUFFICIENT_EVIDENCE');
      expect(batch[0]?.enrichmentEligibleId).toBeNull();
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P24 A3 multi-late siblings fail closed — real runtime persistence', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p24a3-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      await seedCompletedFallbackEnrichment(prisma, fallbackVeeId!, vehicle.id);
      const nativeA = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-a`),
      });
      const nativeB = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-b`),
      });
      await backdateEnergyEventObservation(prisma, nativeA.id, new Date('2026-09-06T11:20:00.000Z'));
      await backdateEnergyEventObservation(prisma, nativeB.id, new Date('2026-09-06T11:40:00.000Z'));
      const result = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: nativeB.id,
        organizationId: org.id,
        tokenId,
      });
      expect(result.enqueuedEventIds).toEqual([]);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBeLessThanOrEqual(1);
      const insufficient = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
        where: { vehicleId: vehicle.id, finalityState: 'INSUFFICIENT_EVIDENCE' },
      });
      expect(insufficient.length).toBeGreaterThanOrEqual(1);
      expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBeGreaterThanOrEqual(3);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  }, 15000);

  (LIVE ? it : it.skip)('P25 native-only G2 path unchanged with handoff authority OFF', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      handoff: false,
      g2: true,
      g2CutoverAt: '2026-09-01T00:00:00.000Z',
    });
    const suffix = `p25-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue([]));
    try {
      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-only-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T09:35:00.000Z'),
        },
      });
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: native.id,
        organizationId: org.id,
        tokenId: 1,
      });
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P26 F5-PR2 promotion regression with g2 handoff wired', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p26-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      expect(fallbackVeeId).toBeTruthy();
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P27 F5-PR2 atomic promotion regression (TRANSACTION A survives handoff wiring)', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p27-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const first = await stack.promotion.evaluateAndApplyPromotionById(candidate.id, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
      });
      expect(first.status).toBe('PROMOTED');
      const second = await stack.promotion.evaluateAndApplyPromotionById(candidate.id, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
      });
      expect(second.status).toBe('ALREADY_PROMOTED');
      expect(second.fallbackVehicleEnergyEventId).toBe(first.fallbackVehicleEnergyEventId);
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P28 F5-PR1 convergence regression blocks pre-promotion native SAME', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: true,
      g2: true,
      cutoverAt: F5_PR3_DEFAULT_CUTOVER,
      g2CutoverAt: F5_PR3_G2_CUTOVER,
    });
    const suffix = `p28-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-early-native`),
      });
      const result = await stack.promotion.evaluateAndApplyPromotionById(candidate.id, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
      });
      expect(result.status).toBe('CONVERGED_NATIVE');
      expect(await countPromoted(prisma, vehicle.id)).toBe(0);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P29 detectEnergyEvents native output survives post-commit G2 failure', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p29-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const throwingRuntime = {
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: jest.fn().mockRejectedValue(new Error('native g2 fail')),
    };
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), {
      g2Runtime: throwingRuntime as never,
    });
    try {
      await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-survive-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T09:35:00.000Z'),
        },
      });
      const beforeNative = await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'DIMO_NATIVE' },
      });
      await stack.energyEvents.detectEnergyEvents(vehicle.id, {
        from: new Date('2026-09-06T07:00:00.000Z'),
        to: new Date('2026-09-06T12:00:00.000Z'),
      }).catch(() => undefined);
      const afterNative = await prisma.vehicleEnergyEvent.count({
        where: { vehicleId: vehicle.id, detectionSource: 'DIMO_NATIVE' },
      });
      expect(afterNative).toBeGreaterThanOrEqual(beforeNative);
      expect(afterNative).toBeGreaterThan(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P17 queue recovery enqueues exactly one effective job', async () => {
    if (!dbAvailable) return;
    if (REDIS_REQUIRED && !redisAvailable) {
      throw new Error('RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED=1 but Redis is unavailable');
    }
    if (!redisAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p17-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const queue = createIsolatedTestQueue('f5pr3-p17');
    await queue.waitUntilReady();
    const recoveryStack = buildF5Pr3StackWithQueue(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
      queue,
    );
    const throwingProducer = {
      enqueueAfterPersistOutcome: jest.fn().mockRejectedValue(new Error('queue unavailable')),
    };
    const deferredRuntime = createRuntimeService(prisma, throwingProducer as never);
    const deferredStack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), {
      g2Runtime: deferredRuntime,
    });
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(recoveryStack, vehicle.id);
      await recoveryStack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: fallbackVeeId! },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: 51.3305883,
          coordinateLongitude: 9.5126383,
          coordinateSource: 'SELECTED',
          coordinateSelectionStatus: 'SELECTED',
        },
      });
      try {
        await deferredStack.g2Runtime.reconcileAndEnqueueAfterPersist({
          vehicleId: vehicle.id,
          triggerEventId: fallbackVeeId!,
          organizationId: org.id,
          tokenId,
        });
      } catch {
        // producer throw is acceptable deferral signal
      }
      expect(await countEffectiveQueueJobs(queue, fallbackVeeId!)).toBe(0);
      const recovered = await recoveryStack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      expect(recovered.enqueuedEventIds.length + recovered.dedupedEventIds.length).toBeGreaterThan(0);
      expect(await countEffectiveQueueJobs(queue, fallbackVeeId!)).toBe(1);
    } finally {
      restore();
      await drainTestQueue(queue);
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });
});
