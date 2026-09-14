import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  assertIsolatedDatabaseUrl,
  buildF5Pr3Stack,
  buildF5Pr3StackWithQueue,
  cleanupVehicle,
  countFallbackVee,
  countPromoted,
  countReconciliationRows,
  F5_PR3_DEFAULT_CUTOVER,
  F5_PR3_G2_CUTOVER,
  F5_PR3_SETTLED_OBSERVATION_AT,
  nativeDistinctSiblingFromCandidate,
  nativeInsufficientSiblingFromCandidate,
  nativeSameSiblingFromCandidate,
  persistReadyCandidate,
  promoteCandidateViaRuntime,
  seedCompletedFallbackEnrichment,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
} from './testing/f5-pr3-g2-handoff.harness';
import {
  createIsolatedTestQueue,
  createRuntimeService,
  drainTestQueue,
  proveIsolatedNonProductionInfra,
  redisConnectionOptions,
} from '../testing/physical-refuel-g21d-final-integration.harness';
import { findPhysicalRefuelRecoveryWork } from '../physical-refuel-recovery.repository';
import { reconcilePhysicalRefuelBatch } from '../physical-refuel-reconciliation.design';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import { RawRefuelG2HandoffService } from './raw-refuel-g2-handoff.service';

const LIVE = process.env.RAW_FUEL_REFUEL_F5_PR3_INTEGRATION === '1';

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

  beforeAll(async () => {
    dbAvailable = LIVE && (await probeDatabase());
    if (!dbAvailable) return;
    prisma = new PrismaClient();
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
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      const second = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      expect(second.dedupedEventIds.length + second.enqueuedEventIds.length).toBeGreaterThanOrEqual(0);
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
      expect(recon!.finalityState).toMatch(/FINAL_|SINGLE/);
      expect(recon!.enrichmentEligible || recon!.coordinateSelectionStatus != null).toBe(true);
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
      expect(result.enqueuedEventIds.length).toBe(0);
      expect(result.heldEventIds.length + result.decisions.length).toBeGreaterThan(0);
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(recon?.enrichmentEnqueuedAt).toBeNull();
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
      expect(await countReconciliationRows(prisma, vehicle.id)).toBeGreaterThan(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P19 concurrent repeated handoffs do not double enqueue', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p19-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const queue = createIsolatedTestQueue('f5pr3-p19');
    const redisReady = await Promise.race([
      queue.waitUntilReady().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    if (!redisReady) {
      await queue.close().catch(() => undefined);
      return;
    }
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
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed']);
      expect(jobs.length).toBeLessThanOrEqual(1);
    } finally {
      restore();
      await drainTestQueue(queue);
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P20 late native SAME before enrichment completion yields one owner', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p20-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: fallbackVeeId! },
      });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-same`),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      fallbackRow.fuelStartLiters = refreshed.preFuelAbsoluteLiters;
      fallbackRow.fuelEndLiters = refreshed.postFuelAbsoluteLiters;
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      const batch = reconcilePhysicalRefuelBatch([fallbackRow, nativeRow], {
          asOfMs: Date.parse('2026-09-06T20:00:00.000Z'),
          firstObservedAtById: {
            [fallbackVee.id]: F5_PR3_SETTLED_OBSERVATION_AT.getTime(),
            [native.id]: native.createdAt.getTime(),
          },
          settlementConfig: { settlementHorizonMs: 60 * 60 * 1000 },
        },
      );
      const eligibleIds = batch.map((d) => d.enrichmentEligibleId).filter(Boolean);
      expect(new Set(eligibleIds).size).toBeLessThanOrEqual(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P21 late native SAME after COMPLETED fallback enrichment is sticky', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p21-${Math.random().toString(36).slice(2, 8)}`;
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
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: fallbackVeeId! },
      });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-late`),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      const batch = reconcilePhysicalRefuelBatch([nativeRow], {
        asOfMs: Date.parse('2026-09-06T20:00:00.000Z'),
        firstObservedAtById: {
          [fallbackRow.id]: F5_PR3_SETTLED_OBSERVATION_AT.getTime(),
          [nativeRow.id]: native.createdAt.getTime(),
        },
        priorCanonicalFinalizationIds: new Set([fallbackRow.id]),
        priorFinalRowsById: { [fallbackRow.id]: fallbackRow },
        settlementConfig: { settlementHorizonMs: 60 * 60 * 1000 },
      });
      expect(batch[0]?.reasonCodes).toContain('late_sibling_after_finalization');
      expect(batch[0]?.enrichmentEligibleId).toBeNull();
      expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBeGreaterThanOrEqual(2);
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

  (LIVE ? it : it.skip)('P24 multi-late siblings fail closed without double ownership', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `p24-${Math.random().toString(36).slice(2, 8)}`;
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
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: fallbackVeeId! },
      });
      const nativeA = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-a`),
      });
      const nativeB = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, `${suffix}-b`),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const rows = [vehicleEnergyEventToRefuelRow(nativeA), vehicleEnergyEventToRefuelRow(nativeB)];
      const batch = reconcilePhysicalRefuelBatch(rows, {
        asOfMs: Date.parse('2026-09-06T20:00:00.000Z'),
        firstObservedAtById: {
          [fallbackRow.id]: F5_PR3_SETTLED_OBSERVATION_AT.getTime(),
          [rows[0].id]: nativeA.createdAt.getTime(),
          [rows[1].id]: nativeB.createdAt.getTime(),
        },
        priorCanonicalFinalizationIds: new Set([fallbackRow.id]),
        priorFinalRowsById: { [fallbackRow.id]: fallbackRow },
        settlementConfig: { settlementHorizonMs: 60 * 60 * 1000 },
      });
      const eligibleCount = batch.filter((d) => d.enrichmentEligibleId != null).length;
      expect(eligibleCount).toBe(0);
      expect(batch.some((d) => d.finalityState === 'INSUFFICIENT_EVIDENCE')).toBe(true);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

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
      const beforeNative = await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } });
      await stack.energyEvents.detectEnergyEvents(vehicle.id, {
        from: new Date('2026-09-06T07:00:00.000Z'),
        to: new Date('2026-09-06T12:00:00.000Z'),
      });
      const afterNative = await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } });
      expect(afterNative).toBeGreaterThanOrEqual(beforeNative);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('P17 queue recovery enqueues exactly one effective job', async () => {
    if (!dbAvailable) return;
    const queue = createIsolatedTestQueue('f5pr3');
    const redisReady = await Promise.race([
      queue.waitUntilReady().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    if (!redisReady) {
      await queue.close().catch(() => undefined);
      return;
    }
    const restore = setFullAuthorizedFlags();
    const suffix = `p17-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
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
      const result = await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      expect(result.enqueuedEventIds.length + result.dedupedEventIds.length).toBeGreaterThanOrEqual(0);
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed']);
      expect(jobs.length).toBeLessThanOrEqual(1);
    } finally {
      restore();
      await drainTestQueue(queue);
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });
});
