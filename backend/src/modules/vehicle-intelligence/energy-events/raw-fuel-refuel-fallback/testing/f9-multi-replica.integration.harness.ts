import { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelCandidateService } from '../../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawRefuelConvergenceService } from '../raw-refuel-convergence.service';
import { RawRefuelPromotionPreparationService } from '../raw-refuel-promotion-preparation.service';
import { RawRefuelPromotionService } from '../raw-refuel-promotion.service';
import { RawRefuelG2HandoffService } from '../raw-refuel-g2-handoff.service';
import { RawFuelRefuelFallbackRuntimeService } from '../raw-fuel-refuel-fallback-runtime.service';
import type { PhysicalRefuelReconciliationRuntimeService } from '../../physical-refuel-reconciliation-runtime.service';
import {
  createProducerService,
  createRuntimeService,
} from '../../testing/physical-refuel-g21d-final-integration.harness';
import {
  assertIsolatedDatabaseUrl,
  F5_PR3_DEFAULT_CUTOVER,
  setRfrfFlags,
  syntheticRiseSamples,
} from './f5-pr3-g2-handoff.harness';

export const RAW_FUEL_REFUEL_F9_INTEGRATION_ENV = 'RAW_FUEL_REFUEL_F9_INTEGRATION';
export const RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED';
export const RAW_FUEL_REFUEL_F9_REDIS_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F9_REDIS_REQUIRED';

export const F9_PROMOTION_CONTEXT = {
  capability: 'FUEL_CAPABLE' as const,
  absoluteDetectionAdmissibility: 'ADMISSIBLE' as const,
  absoluteSignalTrust: 'TRUSTED' as const,
};

export interface F9PromotionReplica {
  label: 'A' | 'B';
  prisma: PrismaClient;
  promotion: RawRefuelPromotionService;
  runtimeStack: RawFuelRefuelFallbackRuntimeService;
}

export interface F9G2HandoffReplica {
  label: 'A' | 'B';
  prisma: PrismaClient;
  g2Handoff: RawRefuelG2HandoffService;
  g2Runtime: PhysicalRefuelReconciliationRuntimeService;
}

export function isF9LiveIntegration(): boolean {
  return process.env[RAW_FUEL_REFUEL_F9_INTEGRATION_ENV] === '1';
}

export function isF9PostgresRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED_ENV] === '1';
}

export function isF9RedisRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F9_REDIS_REQUIRED_ENV] === '1';
}

export function setF9PromotionFlags(): () => void {
  return setRfrfFlags({
    master: true,
    persist: true,
    convergence: true,
    promotion: true,
    handoff: false,
    g2: false,
    cutoverAt: F5_PR3_DEFAULT_CUTOVER,
  });
}

export function setF9FullHandoffFlags(): () => void {
  return setRfrfFlags({
    master: true,
    persist: true,
    convergence: true,
    promotion: true,
    handoff: true,
    g2: true,
    cutoverAt: F5_PR3_DEFAULT_CUTOVER,
    g2CutoverAt: '2026-09-01T00:00:00.000Z',
  });
}

export function proveF9IsolatedNonProductionInfra(): {
  postgresIsProduction: false;
  redisIsProduction: false;
} {
  assertIsolatedDatabaseUrl();
  return { postgresIsProduction: false, redisIsProduction: false };
}

function buildDimoSegments(fetchFuelLevelSamples: jest.Mock) {
  const fetchFuelLevelSamplesWithOutcome = jest.fn(async (...args: unknown[]) => {
    try {
      const result = await fetchFuelLevelSamples(...args);
      if (result && typeof result === 'object' && 'status' in (result as Record<string, unknown>)) {
        return result;
      }
      return { status: 'SUCCESS', samples: result };
    } catch (error) {
      return {
        status: 'ERROR',
        samples: [],
        errorClass: 'PROVIDER_QUERY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return {
    fetchFuelLevelSamples,
    fetchFuelLevelSamplesWithOutcome,
    fetchEnergyEventSegments: jest.fn(async () => ({
      segments: [],
      outcomes: [
        { mechanism: 'refuel', status: 'SUCCESS_EMPTY', segments: [] },
        { mechanism: 'recharge', status: 'SUCCESS_EMPTY', segments: [] },
      ],
    })),
  };
}

export function buildPromotionReplica(
  prisma: PrismaClient,
  label: 'A' | 'B',
): F9PromotionReplica {
  const dimoSegments = buildDimoSegments(jest.fn().mockResolvedValue(syntheticRiseSamples()));
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-06T10:00:00.000Z',
  );
  const promotionPreparation = new RawRefuelPromotionPreparationService(
    prisma as unknown as PrismaService,
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
  const runtimeStack = new RawFuelRefuelFallbackRuntimeService(
    dimoSegments as never,
    candidateService,
    promotionPreparation,
    convergence,
    promotion,
  );
  return { label, prisma, promotion, runtimeStack };
}

export function buildG2HandoffReplica(
  prisma: PrismaClient,
  queue: Queue,
  label: 'A' | 'B',
): F9G2HandoffReplica {
  const producer = createProducerService(queue, prisma);
  const g2Runtime = createRuntimeService(prisma, producer);
  const g2Handoff = new RawRefuelG2HandoffService(g2Runtime);
  return { label, prisma, g2Handoff, g2Runtime };
}

export function createIndependentPromotionReplicas(): {
  replicaA: F9PromotionReplica;
  replicaB: F9PromotionReplica;
} {
  const replicaA = buildPromotionReplica(new PrismaClient(), 'A');
  const replicaB = buildPromotionReplica(new PrismaClient(), 'B');
  assertIndependentPromotionReplicas(replicaA, replicaB);
  return { replicaA, replicaB };
}

export function createIndependentG2HandoffReplicas(queue: Queue): {
  replicaA: F9G2HandoffReplica;
  replicaB: F9G2HandoffReplica;
} {
  const replicaA = buildG2HandoffReplica(new PrismaClient(), queue, 'A');
  const replicaB = buildG2HandoffReplica(new PrismaClient(), queue, 'B');
  assertIndependentG2HandoffReplicas(replicaA, replicaB);
  return { replicaA, replicaB };
}

export function assertIndependentPromotionReplicas(
  replicaA: F9PromotionReplica,
  replicaB: F9PromotionReplica,
): void {
  expect(replicaA.prisma).not.toBe(replicaB.prisma);
  expect(replicaA.promotion).not.toBe(replicaB.promotion);
  expect(replicaA.runtimeStack).not.toBe(replicaB.runtimeStack);
}

export function assertIndependentG2HandoffReplicas(
  replicaA: F9G2HandoffReplica,
  replicaB: F9G2HandoffReplica,
): void {
  expect(replicaA.prisma).not.toBe(replicaB.prisma);
  expect(replicaA.g2Handoff).not.toBe(replicaB.g2Handoff);
  expect(replicaA.g2Runtime).not.toBe(replicaB.g2Runtime);
}

export interface F9PipelineInvariantExpectation {
  candidateCount?: number;
  fallbackVeeMax?: number;
  promotedMax?: number;
  convergedNativeMax?: number;
  operationalEnrichmentOwnerMax?: number;
  effectiveQueueJobMax?: number;
}

export async function assertF9PipelineInvariants(
  prisma: PrismaClient,
  vehicleId: string,
  expected: F9PipelineInvariantExpectation,
  queue?: Queue,
  fallbackVeeId?: string | null,
): Promise<void> {
  if (expected.candidateCount !== undefined) {
    expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId } })).toBe(
      expected.candidateCount,
    );
  }
  if (expected.fallbackVeeMax !== undefined) {
    const fallbackCount = await prisma.vehicleEnergyEvent.count({
      where: { vehicleId, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
    });
    expect(fallbackCount).toBeLessThanOrEqual(expected.fallbackVeeMax);
  }
  if (expected.promotedMax !== undefined) {
    const promotedCount = await prisma.rawRefuelCandidate.count({
      where: { vehicleId, lifecycleState: 'PROMOTED' },
    });
    expect(promotedCount).toBeLessThanOrEqual(expected.promotedMax);
  }
  if (expected.convergedNativeMax !== undefined) {
    const convergedCount = await prisma.rawRefuelCandidate.count({
      where: { vehicleId, lifecycleState: 'CONVERGED_NATIVE' },
    });
    expect(convergedCount).toBeLessThanOrEqual(expected.convergedNativeMax);
  }
  if (expected.promotedMax !== undefined && expected.convergedNativeMax !== undefined) {
    const dualOwnership = await prisma.rawRefuelCandidate.count({
      where: {
        vehicleId,
        lifecycleState: { in: ['PROMOTED', 'CONVERGED_NATIVE'] },
      },
    });
    expect(dualOwnership).toBeLessThanOrEqual(
      Math.max(expected.promotedMax, expected.convergedNativeMax),
    );
  }
  if (expected.operationalEnrichmentOwnerMax !== undefined) {
    const ownerCount = await prisma.vehicleEnergyEventRefuelReconciliation.count({
      where: { vehicleId, enrichmentEligible: true },
    });
    expect(ownerCount).toBeLessThanOrEqual(expected.operationalEnrichmentOwnerMax);
  }
  if (expected.effectiveQueueJobMax !== undefined && queue && fallbackVeeId) {
    const { countEffectiveQueueJobs } = await import('./f5-pr3-g2-handoff.harness');
    expect(await countEffectiveQueueJobs(queue, fallbackVeeId)).toBeLessThanOrEqual(
      expected.effectiveQueueJobMax,
    );
  }
}

export async function disconnectPromotionReplicas(replicas: F9PromotionReplica[]): Promise<void> {
  await Promise.all(replicas.map((replica) => replica.prisma.$disconnect().catch(() => undefined)));
}

export async function disconnectG2HandoffReplicas(replicas: F9G2HandoffReplica[]): Promise<void> {
  await Promise.all(replicas.map((replica) => replica.prisma.$disconnect().catch(() => undefined)));
}
