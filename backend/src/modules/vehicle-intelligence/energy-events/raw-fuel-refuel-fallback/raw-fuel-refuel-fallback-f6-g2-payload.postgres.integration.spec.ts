import { PrismaClient } from '@prisma/client';
import { classifyPhysicalRefuelSibling } from '../physical-refuel-identity.matcher';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import {
  assertIsolatedDatabaseUrl,
  backdateEnergyEventObservation,
  buildF5Pr3Stack,
  cleanupVehicle,
  countFallbackVee,
  countOperationalEnrichmentOwners,
  countPromoted,
  nativeDistinctSiblingFromCandidate,
  nativeInsufficientSiblingFromCandidate,
  nativeSameSiblingFromCandidate,
  persistReadyCandidate,
  promoteCandidateViaRuntime,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
} from './testing/f5-pr3-g2-handoff.harness';
import {
  assertFallbackCanonicalMetaConsistency,
  readPersistedFallbackMeta,
} from './testing/f6-g2-payload.harness';

export const RAW_FUEL_REFUEL_F6_INTEGRATION_ENV = 'RAW_FUEL_REFUEL_F6_INTEGRATION';
export const RAW_FUEL_REFUEL_F6_POSTGRES_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F6_POSTGRES_REQUIRED';

const LIVE = process.env[RAW_FUEL_REFUEL_F6_INTEGRATION_ENV] === '1';
const POSTGRES_REQUIRED = process.env[RAW_FUEL_REFUEL_F6_POSTGRES_REQUIRED_ENV] === '1';

if (POSTGRES_REQUIRED && !LIVE) {
  throw new Error(`${RAW_FUEL_REFUEL_F6_POSTGRES_REQUIRED_ENV}=1 but integration flag is not 1`);
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

const promotionContext = {
  capability: 'FUEL_CAPABLE' as const,
  absoluteDetectionAdmissibility: 'ADMISSIBLE' as const,
  absoluteSignalTrust: 'TRUSTED' as const,
};

describe('RFRF F6 canonical G2 rawDetectionMeta payload compatibility (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = LIVE && (await probeDatabase());
    if (POSTGRES_REQUIRED && !dbAvailable) {
      throw new Error(`${RAW_FUEL_REFUEL_F6_POSTGRES_REQUIRED_ENV}=1 but isolated PostgreSQL is unavailable`);
    }
    if (!dbAvailable) return;
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  });

  (LIVE ? it : it.skip)('gate probe documents LIVE flag requirement', () => {
    expect(LIVE).toBe(true);
  });

  (LIVE ? it : it.skip)('F6-P1 absolute-only fallback promotion exposes canonical meta to G2 row mapper', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p1-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const vee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      assertFallbackCanonicalMetaConsistency(refreshed, vee);
      const row = vehicleEnergyEventToRefuelRow(vee);
      expect(row.fuelStartLiters).toBe(refreshed.preFuelAbsoluteLiters);
      expect(row.fuelEndLiters).toBe(refreshed.postFuelAbsoluteLiters);
      expect(row.fuelStartPercent).toBeNull();
      expect(row.fuelEndPercent).toBeNull();
      expect(row.fuelDeltaLiters).toBe(vee.fuelDeltaLiters);
      expect(row.startTime).toBe(vee.startTime.toISOString());
      expect(row.endTime).toBe(vee.endTime.toISOString());
      expect(row.durationSeconds).toBe(vee.durationSeconds);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P2 fallback + native SAME physical refuel via persisted rows', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p2-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, suffix),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      expect(classifyPhysicalRefuelSibling(fallbackRow, nativeRow).classification).toBe(
        'SAME_PHYSICAL_REFUEL',
      );
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P3 fallback + native DISTINCT physical refuels', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p3-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeDistinctSiblingFromCandidate(refreshed, suffix),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      expect(classifyPhysicalRefuelSibling(fallbackRow, nativeRow).classification).toBe(
        'DISTINCT_PHYSICAL_REFUEL',
      );
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P4 insufficient native evidence fails closed', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p4-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeInsufficientSiblingFromCandidate(refreshed, suffix),
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      expect(classifyPhysicalRefuelSibling(fallbackRow, nativeRow).classification).toBe(
        'INSUFFICIENT_EVIDENCE',
      );
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P5 fallback-first native-later SAME keeps one operational enrichment owner', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p5-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId, tokenId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: fallbackVeeId!,
        organizationId: org.id,
        tokenId,
      });
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      expect(fallbackRow.fuelStartLiters).toBe(refreshed.preFuelAbsoluteLiters);
      expect(fallbackRow.fuelEndLiters).toBe(refreshed.postFuelAbsoluteLiters);
      const native = await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, suffix),
      });
      await backdateEnergyEventObservation(prisma, native.id, new Date('2026-09-06T10:45:00.000Z'));
      await stack.g2Runtime.reconcileAndEnqueueAfterPersist({
        vehicleId: vehicle.id,
        triggerEventId: native.id,
        organizationId: org.id,
        tokenId,
      });
      expect(await countOperationalEnrichmentOwners(prisma, vehicle.id)).toBeLessThanOrEqual(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  }, 15000);

  (LIVE ? it : it.skip)('F6-P6 native-first convergence prevents duplicate fallback VEE', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: true,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: '2026-09-01T00:00:00.000Z',
    });
    const suffix = `f6p6-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(refreshed, suffix),
      });
      const convergence = await stack.convergence.evaluateAndApplyConvergence(
        refreshed,
        promotionContext,
        process.env,
      );
      expect(convergence.status).toBe('CONVERGED_NATIVE');
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(0);
      expect(await countPromoted(prisma, vehicle.id)).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P7 absolute-only fallback with native sibling lacking percent remains SAME', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p7-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const fallbackVee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          ...nativeSameSiblingFromCandidate(refreshed, suffix),
          rawDetectionMeta: {
            fuelStartLiters: refreshed.preFuelAbsoluteLiters,
            fuelEndLiters: refreshed.postFuelAbsoluteLiters,
          },
        },
      });
      const fallbackRow = vehicleEnergyEventToRefuelRow(fallbackVee);
      const nativeRow = vehicleEnergyEventToRefuelRow(native);
      expect(fallbackRow.fuelStartPercent).toBeNull();
      expect(nativeRow.fuelStartPercent).toBeNull();
      expect(classifyPhysicalRefuelSibling(fallbackRow, nativeRow).classification).toBe(
        'SAME_PHYSICAL_REFUEL',
      );
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P8 relative evidence maps start/end percent into canonical meta', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p8-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      await prisma.rawRefuelCandidate.update({
        where: { id: candidate.id },
        data: {
          preFuelRelativePercent: 18,
          postFuelRelativePercent: 72,
          relativeSignalAvailable: true,
        },
      });
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const vee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const meta = readPersistedFallbackMeta(vee);
      expect(meta.fuelStartPercent).toBe(18);
      expect(meta.fuelEndPercent).toBe(72);
      const row = vehicleEnergyEventToRefuelRow(vee);
      expect(row.fuelStartPercent).toBe(refreshed.preFuelRelativePercent);
      expect(row.fuelEndPercent).toBe(refreshed.postFuelRelativePercent);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P9 missing optional percent remains null without fabrication', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p9-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const { fallbackVeeId, candidate } = await promoteCandidateViaRuntime(stack, vehicle.id);
      const refreshed = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(refreshed.preFuelRelativePercent).toBeNull();
      expect(refreshed.postFuelRelativePercent).toBeNull();
      const vee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: fallbackVeeId! } });
      const meta = readPersistedFallbackMeta(vee);
      expect(meta.fuelStartPercent).toBeNull();
      expect(meta.fuelEndPercent).toBeNull();
      expect(meta.preFuelRelativePercent).toBeNull();
      expect(meta.postFuelRelativePercent).toBeNull();
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F6-P10 replay ALREADY_PROMOTED keeps rawDetectionMeta stable', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f6p10-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const stack = buildF5Pr3Stack(prisma, jest.fn().mockResolvedValue(syntheticRiseSamples()));
    try {
      const candidate = await persistReadyCandidate(stack, vehicle.id);
      const first = await stack.promotion.evaluateAndApplyPromotionById(
        candidate.id,
        promotionContext,
        process.env,
      );
      const second = await stack.promotion.evaluateAndApplyPromotionById(
        candidate.id,
        promotionContext,
        process.env,
      );
      expect(first.status).toBe('PROMOTED');
      expect(second.status).toBe('ALREADY_PROMOTED');
      expect(await countFallbackVee(prisma, vehicle.id)).toBe(1);
      const vee = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: first.fallbackVehicleEnergyEventId! },
      });
      const meta = readPersistedFallbackMeta(vee);
      expect(meta.candidateIdentityKey).toBe(candidate.candidateIdentityKey);
      expect(meta.fuelStartLiters).toBe(
        (await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: candidate.id } }))
          .preFuelAbsoluteLiters,
      );
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });
});
