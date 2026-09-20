import { PrismaClient } from '@prisma/client';
import { RawRefuelG2HandoffService } from './raw-refuel-g2-handoff.service';
import {
  assertBothForensicRowsRetained,
  seedCompletedFallbackEnrichment,
  assertIsolatedDatabaseUrl,
  backdateEnergyEventObservation,
  buildF5Pr3Stack,
  cleanupVehicle,
  countFallbackVee,
  countOperationalEnrichmentOwners,
  countPhysicalRefuelRecoveryBacklog,
  countPromoted,
  countReconciliationRows,
  F5_PR3_G2_CUTOVER,
  F5_PR3_SETTLED_OBSERVATION_AT,
  findPhysicalRefuelRecoveryWork,
  F7_RECOVERY_AS_OF_MS,
  isF7LiveIntegration,
  isF7PostgresRequired,
  nativeSameSiblingFromCandidate,
  persistReadyCandidate,
  promoteCandidateViaRuntime,
  RAW_FUEL_REFUEL_F7_INTEGRATION_ENV,
  RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED_ENV,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
} from './testing/f7-recovery-completeness.harness';
import { IRREVERSIBLE_CANONICAL_PINNED_REASON } from '../physical-refuel-late-sibling-authority.util';
import {
  assertFallbackCanonicalMetaConsistency,
  readPersistedFallbackMeta,
} from './testing/f6-g2-payload.harness';

const LIVE = isF7LiveIntegration();
const POSTGRES_REQUIRED = isF7PostgresRequired();

if (POSTGRES_REQUIRED && !LIVE) {
  throw new Error(`${RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED_ENV}=1 but integration flag is not 1`);
}

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  assertIsolatedDatabaseUrl();
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

describe('RFRF F7 recovery completeness + post-commit crash-window closure (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = LIVE && (await probeDatabase());
    if (POSTGRES_REQUIRED && !dbAvailable) {
      throw new Error(`${RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED_ENV}=1 but isolated PostgreSQL is unavailable`);
    }
    if (dbAvailable) {
      prisma = new PrismaClient();
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  });

  (LIVE ? it : it.skip)('gate probe documents LIVE flag requirement', () => {
    expect(process.env[RAW_FUEL_REFUEL_F7_INTEGRATION_ENV]).toBe('1');
  });

  (LIVE ? it : it.skip)('F7-P1 pre-handoff process-loss — orphan_refuel recovered via runRecoveryBatch', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p1-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(0);
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);

      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 10,
        asOf: new Date(F7_RECOVERY_AS_OF_MS),
        v2OwnershipCutoverAt: new Date(F5_PR3_G2_CUTOVER),
        orphanLookbackFrom: new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      });
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'orphan_refuel')).toBe(
        true,
      );

      const recovered = await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(recovered.recoveredReasons.orphan_refuel).toBeGreaterThanOrEqual(1);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);

      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const vee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      assertFallbackCanonicalMetaConsistency(refreshed, vee);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P2 thrown post-commit G2 handoff — PROMOTED fallback VEE survives and recovery reconciles', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p2-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const throwingRuntime = {
      isEnabled: () => true,
      resolveV2OwnershipCutoverAt: () => new Date(F5_PR3_G2_CUTOVER),
      emitRecoveryBacklogMetrics: jest.fn().mockResolvedValue(undefined),
      runRecoveryBatch: jest.fn(),
      reconcileAndEnqueueAfterPersist: jest.fn().mockRejectedValue(new Error('f7 post-commit g2 throw')),
    };
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()), {
      g2Runtime: throwingRuntime as never,
    });
    stack.g2Handoff = new RawRefuelG2HandoffService(throwingRuntime as never);
    const recoveryStack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const handoff = await stack.g2Handoff.handoffAfterPromotionCommit({
        vehicleId: vehicle.id,
        organizationId: org.id,
        tokenId,
        fallbackVehicleEnergyEventId: fallbackVeeId!,
        promotionStatus: 'PROMOTED',
      });
      expect(handoff.status).toBe('HANDOFF_FAILED');
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(0);

      const recovered = await recoveryStack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(recovered.recoveredReasons.orphan_refuel).toBeGreaterThanOrEqual(1);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P3 idempotent repeated recovery — no duplicate reconciliation or VEE', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p3-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBe(1);

      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P4 authority OFF — fallback orphan not processed into G2', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: false,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: F5_PR3_G2_CUTOVER,
    });
    const suffix = `f7p4-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const recovered = await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(recovered.recoveredReasons.orphan_refuel ?? 0).toBe(0);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(0);

      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 10,
        asOf: new Date(F7_RECOVERY_AS_OF_MS),
        v2OwnershipCutoverAt: new Date(F5_PR3_G2_CUTOVER),
        orphanLookbackFrom: new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      });
      expect(work.some((item) => item.triggerEventId === fallbackVeeId)).toBe(false);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P5 native orphan recovery unaffected when fallback authority OFF', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: false,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: F5_PR3_G2_CUTOVER,
    });
    const suffix = `f7p5-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-orphan-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: F5_PR3_SETTLED_OBSERVATION_AT,
        },
      });
      const recovered = await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(recovered.recoveredReasons.orphan_refuel).toBeGreaterThanOrEqual(1);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: native.id },
      });
      expect(recon).not.toBeNull();
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P6 orphan recovery leaves enrichment-eligible state recoverable for queue (BullMQ proof: F5-PR3 P17)', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p6-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(recon.enrichmentEligible).toBe(true);
      expect(recon.enrichmentEnqueuedAt).toBeNull();

      await prisma.vehicleEnergyEventFuelStationEnrichment.create({
        data: {
          energyEventId: fallbackVeeId!,
          processingStatus: 'PENDING',
          inputFingerprint: `f7-pending-${suffix}`,
          resolverVersion: 'v2',
        },
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 25,
        asOf: new Date(F7_RECOVERY_AS_OF_MS),
        v2OwnershipCutoverAt: new Date(F5_PR3_G2_CUTOVER),
        orphanLookbackFrom: new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      });
      expect(
        work.some(
          (item) =>
            item.triggerEventId === fallbackVeeId &&
            (item.reason === 'stale_enrichment' || item.reason === 'lost_enqueue'),
        ),
      ).toBe(true);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P7 concurrent recovery invocations — one logical G2 outcome', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p7-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      await Promise.all([
        stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS),
        stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS),
      ]);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
      expect(await countPromoted(prisma, vehicle.id)).toBe(1);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P8 recovery → COMPLETED enrichment → late native SAME sticky ownership', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p8-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(0);

      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      expect(await countReconciliationRows(prisma, vehicle.id)).toBe(1);

      await seedCompletedFallbackEnrichment(prisma, fallbackVeeId!, vehicle.id);

      const fallbackReconAfterCompleted =
        await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
          where: { energyEventId: fallbackVeeId! },
        });
      expect(fallbackReconAfterCompleted.enrichmentEligible).toBe(true);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBe(1);

      const pre = refreshed.preFuelAbsoluteLiters ?? 10;
      const post = refreshed.postFuelAbsoluteLiters ?? 30;
      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          ...nativeSameSiblingFromCandidate(refreshed, `${suffix}-late`),
          fuelDeltaLiters: post - pre - 0.2,
          rawDetectionMeta: {
            fuelStartLiters: pre + 0.15,
            fuelEndLiters: post,
            fuelStartPercent: refreshed.preFuelRelativePercent,
            fuelEndPercent: refreshed.postFuelRelativePercent,
          },
        },
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
      const fallbackReconAfterNative =
        await prisma.vehicleEnergyEventRefuelReconciliation.findUniqueOrThrow({
          where: { energyEventId: fallbackVeeId! },
        });

      expect(fallbackReconAfterNative.finalityState).toBe('FINAL_CANONICAL');
      expect(fallbackReconAfterNative.canonicalEventId).toBe(fallbackVeeId);
      expect(fallbackReconAfterNative.enrichmentEligible).toBe(true);

      expect(nativeRecon.finalityState).toBe('FINAL_CANONICAL');
      expect(nativeRecon.canonicalEventId).toBe(fallbackVeeId);
      expect(nativeRecon.enrichmentEligible).toBe(false);
      expect(nativeRecon.lateSiblingConflict).toBe(true);
      expect(nativeRecon.reason).toBe(IRREVERSIBLE_CANONICAL_PINNED_REASON);
      expect(nativeRecon.reasonCodes).toContain('late_sibling_after_finalization');

      const fallbackEnrichment = await prisma.vehicleEnergyEventFuelStationEnrichment.findUnique({
        where: { energyEventId: fallbackVeeId! },
      });
      expect(fallbackEnrichment?.processingStatus).toBe('COMPLETED');
      expect(
        await prisma.vehicleEnergyEventFuelStationEnrichment.count({
          where: {
            energyEvent: { vehicleId: vehicle.id },
            processingStatus: 'COMPLETED',
          },
        }),
      ).toBe(1);

      expect(nativeResult.enqueuedEventIds).toEqual([]);

      expect(fallbackReconAfterNative.enrichmentEnqueuedAt).not.toBeNull();
      expect(
        await prisma.vehicleEnergyEventFuelStationEnrichment.count({
          where: { energyEventId: fallbackVeeId!, processingStatus: 'COMPLETED' },
        }),
      ).toBe(1);
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBe(1);
      expect(
        await prisma.vehicleEnergyEventRefuelReconciliation.count({
          where: { vehicleId: vehicle.id, enrichmentEligible: true, energyEventId: fallbackVeeId! },
        }),
      ).toBeLessThanOrEqual(1);
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

  (LIVE ? it : it.skip)('F7-P9 forensic rows and identity fields retained after recovery', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p9-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const beforeVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const beforeMeta = readPersistedFallbackMeta(beforeVee);

      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);

      const afterVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const afterCandidate = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const afterMeta = readPersistedFallbackMeta(afterVee);

      expect(afterVee.detectionSource).toBe('SYNQDRIVE_RAW_FUEL_FALLBACK');
      expect(afterVee.sourceEventKey).toBe(beforeVee.sourceEventKey);
      expect(afterCandidate.lifecycleState).toBe('PROMOTED');
      expect(afterMeta.candidateIdentityKey).toBe(beforeMeta.candidateIdentityKey);
      expect(afterMeta.rawRefuelCandidateId).toBe(beforeMeta.rawRefuelCandidateId);
      expect(afterMeta.detectorVersion).toBe(beforeMeta.detectorVersion);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P11 bounded orphan scan — pre-cutover orphan excluded', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p11-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const preCutoverOrphan = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `precut-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-08-20T09:00:00.000Z'),
          endTime: new Date('2026-08-20T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-08-20T09:30:00.000Z'),
        },
      });
      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 50,
        asOf: new Date(F7_RECOVERY_AS_OF_MS),
        v2OwnershipCutoverAt: new Date(F5_PR3_G2_CUTOVER),
        orphanLookbackFrom: new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      });
      expect(work.some((item) => item.triggerEventId === preCutoverOrphan.id)).toBe(false);

      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      const recon = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
        where: { energyEventId: preCutoverOrphan.id },
      });
      expect(recon).toBeNull();
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F7-P12 backlog metrics represent orphan state before recovery', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f7p12-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      const before = await countPhysicalRefuelRecoveryBacklog(
        prisma,
        new Date(F7_RECOVERY_AS_OF_MS),
        new Date(F5_PR3_G2_CUTOVER),
        new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      );
      expect(before.orphanRefuels).toBeGreaterThanOrEqual(1);

      await stack.g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);

      const after = await countPhysicalRefuelRecoveryBacklog(
        prisma,
        new Date(F7_RECOVERY_AS_OF_MS),
        new Date(F5_PR3_G2_CUTOVER),
        new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      );
      expect(after.orphanRefuels).toBeLessThan(before.orphanRefuels);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });
});
