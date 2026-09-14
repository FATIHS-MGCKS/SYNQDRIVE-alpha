import { randomUUID } from 'crypto';
import { PrismaClient, FuelType, type RawRefuelCandidate } from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV } from '@config/physical-refuel-reconciliation.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelCandidateService } from '../../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawRefuelConvergenceService } from '../raw-refuel-convergence.service';
import { RawRefuelPromotionPreparationService } from '../raw-refuel-promotion-preparation.service';
import { RawRefuelPromotionService } from '../raw-refuel-promotion.service';
import { RawRefuelG2HandoffService } from '../raw-refuel-g2-handoff.service';
import { RawFuelRefuelFallbackRuntimeService } from '../raw-fuel-refuel-fallback-runtime.service';
import { PhysicalRefuelReconciliationRuntimeService } from '../../physical-refuel-reconciliation-runtime.service';
import { EnergyEventsService } from '../../energy-events.service';
import {
  linearRiseSamples,
  stablePlateauSamples,
} from '../../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import {
  createPhysicalRefuelConfig,
  createProducerService,
  createRuntimeService,
  probeRedis,
  redisConnectionOptions,
} from '../../testing/physical-refuel-g21d-final-integration.harness';
import type { Queue } from 'bullmq';
import {
  buildFuelStationEnrichmentInputFingerprint,
  buildFuelStationEnrichmentJobIdempotencyKey,
} from '../../../fuel-stations/enrichment/fuel-station-enrichment-fingerprint.util';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

export const RAW_FUEL_REFUEL_F5_PR3_INTEGRATION_ENV = 'RAW_FUEL_REFUEL_F5_PR3_INTEGRATION';
export const RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED';
export const RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED';

export async function backdateEnergyEventObservation(
  prisma: PrismaClient,
  energyEventId: string,
  observedAt: Date,
): Promise<void> {
  await prisma.vehicleEnergyEvent.update({
    where: { id: energyEventId },
    data: { createdAt: observedAt, updatedAt: observedAt },
  });
}

export const F5_PR3_SETTLED_OBSERVATION_AT = new Date('2026-09-06T10:00:00.000Z');
export const F5_PR3_DEFAULT_CUTOVER = '2026-09-06T08:00:00.000Z';
export const F5_PR3_G2_CUTOVER = '2026-09-01T00:00:00.000Z';

export function assertIsolatedDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (
    url.includes('app.synqdrive') ||
    url.includes('production') ||
    url.includes('srv1374778') ||
    url.includes('hstgr.cloud')
  ) {
    throw new Error('Refusing production-like DATABASE_URL for F5-PR3 gate');
  }
}

export function proveF5Pr3IsolatedNonProductionInfra(): {
  postgresIsProduction: false;
  redisIsProduction: false;
} {
  assertIsolatedDatabaseUrl();
  const redisHost = redisConnectionOptions().host;
  const blockedHosts = ['srv1374778', 'app.synqdrive.eu', 'mein-vps', 'hstgr.cloud'];
  if (blockedHosts.some((host) => redisHost.includes(host))) {
    throw new Error(`Refusing non-isolated REDIS host: ${redisHost}`);
  }
  if (!['127.0.0.1', 'localhost'].includes(redisHost)) {
    throw new Error(`F5-PR3 required Redis must be localhost (got ${redisHost})`);
  }
  return { postgresIsProduction: false, redisIsProduction: false };
}

export interface RfrfFlagOptions {
  master?: boolean;
  persist?: boolean;
  convergence?: boolean;
  promotion?: boolean;
  handoff?: boolean;
  g2?: boolean;
  cutoverAt?: string | null;
  g2CutoverAt?: string | null;
}

export function setRfrfFlags(opts: RfrfFlagOptions): () => void {
  const prev = {
    master: process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    persist: process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    convergence: process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
    promotion: process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
    handoff: process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV],
    g2: process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV],
    cutover: process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
    g2Cutover: process.env.PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV,
  };

  if (opts.master !== undefined) {
    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = opts.master ? '1' : '0';
  }
  if (opts.persist !== undefined) {
    process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = opts.persist ? '1' : '0';
  }
  if (opts.convergence !== undefined) {
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = opts.convergence ? 'true' : 'false';
  }
  if (opts.promotion !== undefined) {
    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = opts.promotion ? 'true' : 'false';
  }
  if (opts.handoff !== undefined) {
    process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV] = opts.handoff ? 'true' : 'false';
  }
  if (opts.g2 !== undefined) {
    process.env[PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV] = opts.g2 ? 'true' : 'false';
  }
  if (opts.cutoverAt !== undefined) {
    if (opts.cutoverAt === null) delete process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV];
    else process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = opts.cutoverAt;
  }
  if (opts.g2CutoverAt !== undefined) {
    if (opts.g2CutoverAt === null) delete process.env.PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV;
    else process.env.PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV = opts.g2CutoverAt;
  }

  return () => {
    for (const [key, envKey] of [
      ['master', RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
      ['persist', RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
      ['convergence', RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
      ['promotion', RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
      ['handoff', RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV],
      ['g2', PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED_ENV],
      ['cutover', RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
      ['g2Cutover', 'PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV'],
    ] as const) {
      const value = prev[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  };
}

export function setFullAuthorizedFlags(): () => void {
  return setRfrfFlags({
    master: true,
    persist: true,
    convergence: true,
    promotion: true,
    handoff: true,
    g2: true,
    cutoverAt: F5_PR3_DEFAULT_CUTOVER,
    g2CutoverAt: F5_PR3_G2_CUTOVER,
  });
}

export function mapSamples(
  samples: ReturnType<typeof stablePlateauSamples>,
): Array<{ timestamp: Date; absoluteLiters: number | null; relativePercent: number | null }> {
  return samples.map((s) => ({
    timestamp: s.timestamp,
    absoluteLiters: s.absoluteLiters ?? null,
    relativePercent: s.relativePercent ?? null,
  }));
}

export function syntheticRiseSamples() {
  return mapSamples([
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ]);
}

export async function seedOrgVehicle(
  prisma: PrismaClient,
  suffix: string,
  tokenId = 940000 + Math.floor(Math.random() * 10000),
) {
  const org = await prisma.organization.create({
    data: { companyName: `RFRF F5PR3 ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `dimo-f5pr3-${suffix}`,
      tokenId,
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `P3${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `P3-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, tokenId, dimoVehicleId: dimoVehicle.id };
}

export async function cleanupVehicle(
  prisma: PrismaClient,
  vehicleId: string,
  orgId: string,
  dimoVehicleId: string,
) {
  await prisma.vehicleEnergyEventFuelStationEnrichment.deleteMany({
    where: { energyEvent: { vehicleId } },
  });
  await prisma.vehicleEnergyEventRefuelReconciliation.deleteMany({ where: { vehicleId } });
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

export interface F5Pr3Stack {
  energyEvents: EnergyEventsService;
  promotion: RawRefuelPromotionService;
  g2Handoff: RawRefuelG2HandoffService;
  g2Runtime: PhysicalRefuelReconciliationRuntimeService;
  prisma: PrismaClient;
}

export function buildF5Pr3Stack(
  prisma: PrismaClient,
  fetchFuelLevelSamples: jest.Mock,
  options?: {
    g2Runtime?: PhysicalRefuelReconciliationRuntimeService;
    promotionService?: RawRefuelPromotionService;
  },
): F5Pr3Stack {
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

  const dimoSegments = {
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

  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    '2026-09-06T10:00:00.000Z',
  );
  const promotionPreparation = new RawRefuelPromotionPreparationService(
    prisma as unknown as PrismaService,
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  const promotion =
    options?.promotionService ?? new RawRefuelPromotionService(prisma as unknown as PrismaService);
  const g2Runtime =
    options?.g2Runtime ??
    new PhysicalRefuelReconciliationRuntimeService(
      prisma as unknown as PrismaService,
      createPhysicalRefuelConfig() as never,
      { cutoverAt: new Date(F5_PR3_G2_CUTOVER), enabled: true } as never,
      undefined,
      undefined,
    );
  const g2Handoff = new RawRefuelG2HandoffService(g2Runtime);
  const rawRuntime = new RawFuelRefuelFallbackRuntimeService(
    dimoSegments as never,
    candidateService,
    promotionPreparation,
    convergence,
    promotion,
    g2Handoff,
  );
  const energyEvents = new EnergyEventsService(
    prisma as unknown as PrismaService,
    dimoSegments as never,
    undefined,
    undefined,
    g2Runtime,
    rawRuntime,
  );

  return { energyEvents, promotion, g2Handoff, g2Runtime, prisma };
}

export function buildF5Pr3StackWithQueue(
  prisma: PrismaClient,
  fetchFuelLevelSamples: jest.Mock,
  queue: Queue,
): F5Pr3Stack {
  const producer = createProducerService(queue, prisma);
  const g2Runtime = createRuntimeService(prisma, producer);
  return buildF5Pr3Stack(prisma, fetchFuelLevelSamples, { g2Runtime });
}

export async function persistReadyCandidate(
  stack: F5Pr3Stack,
  vehicleId: string,
): Promise<RawRefuelCandidate> {
  await stack.energyEvents.detectEnergyEvents(vehicleId, {
    from: new Date('2026-09-06T07:00:00.000Z'),
    to: new Date('2026-09-06T12:00:00.000Z'),
  });
  const persisted = await stack.prisma.rawRefuelCandidate.findFirst({ where: { vehicleId } });
  if (!persisted) throw new Error('expected candidate');
  return persisted;
}

export async function promoteCandidateViaRuntime(
  stack: F5Pr3Stack,
  vehicleId: string,
): Promise<{ candidate: RawRefuelCandidate; fallbackVeeId: string | null }> {
  const candidate = await persistReadyCandidate(stack, vehicleId);
  const result = await stack.promotion.evaluateAndApplyPromotionById(candidate.id, {
    capability: 'FUEL_CAPABLE',
    absoluteDetectionAdmissibility: 'ADMISSIBLE',
    absoluteSignalTrust: 'TRUSTED',
  });
  if (result.status !== 'PROMOTED' && result.status !== 'ALREADY_PROMOTED') {
    throw new Error(`expected promotion, got ${result.status}`);
  }
  if (result.fallbackVehicleEnergyEventId) {
    await backdateEnergyEventObservation(
      stack.prisma,
      result.fallbackVehicleEnergyEventId,
      F5_PR3_SETTLED_OBSERVATION_AT,
    );
  }
  return { candidate, fallbackVeeId: result.fallbackVehicleEnergyEventId };
}

export function candidateMatcherWindow(candidate: RawRefuelCandidate): { start: Date; end: Date } {
  const start =
    candidate.riseOnsetAt ??
    candidate.physicalEvidenceStart ??
    candidate.firstObservedAt;
  const end =
    candidate.riseEndAt ??
    candidate.physicalEvidenceEnd ??
    (candidate.postFuelAbsoluteLiters != null || candidate.postFuelRelativePercent != null
      ? candidate.lastObservedAt
      : candidate.firstObservedAt);
  return { start, end };
}

export function nativeSameSiblingFromCandidate(candidate: RawRefuelCandidate, suffix: string = randomUUID()) {
  const { start, end } = candidateMatcherWindow(candidate);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-same-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    fuelDeltaLiters: candidate.deltaAbsoluteLiters,
    rawDetectionMeta: {
      fuelStartLiters: candidate.preFuelAbsoluteLiters,
      fuelEndLiters: candidate.postFuelAbsoluteLiters,
      fuelStartPercent: candidate.preFuelRelativePercent,
      fuelEndPercent: candidate.postFuelRelativePercent,
    },
    createdAt: new Date('2026-09-06T09:00:00.000Z'),
  };
}

export function nativeDistinctSiblingFromCandidate(
  candidate: RawRefuelCandidate,
  suffix: string = randomUUID(),
) {
  const { start } = candidateMatcherWindow(candidate);
  const distinctStart = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  const distinctEnd = new Date(distinctStart.getTime() + 30 * 60 * 1000);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-distinct-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: distinctStart,
    endTime: distinctEnd,
    durationSeconds: 1800,
    fuelDeltaLiters: 18,
    rawDetectionMeta: {
      fuelStartLiters: 12,
      fuelEndLiters: 30,
    },
    createdAt: new Date(distinctEnd.getTime() + 60_000),
  };
}

export function nativeInsufficientSiblingFromCandidate(
  candidate: RawRefuelCandidate,
  suffix: string = randomUUID(),
) {
  const { start, end } = candidateMatcherWindow(candidate);
  return {
    vehicleId: candidate.vehicleId,
    dimoSegmentId: `dimo-insufficient-${suffix}`,
    detectionSource: 'DIMO_NATIVE' as const,
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    createdAt: new Date(end.getTime() + 60_000),
  };
}

export async function seedCompletedFallbackEnrichment(
  prisma: PrismaClient,
  energyEventId: string,
  vehicleId: string,
): Promise<void> {
  const observedAt = new Date('2026-09-06T10:30:00.000Z');
  await prisma.vehicleEnergyEventFuelStationEnrichment.upsert({
    where: { energyEventId },
    create: {
      energyEventId,
      processingStatus: 'COMPLETED',
      lastAttemptAt: observedAt,
      inputFingerprint: `fp-${energyEventId}`,
      resolverVersion: 'v2',
      inputLatitude: 51.3305883,
      inputLongitude: 9.5126383,
      inputCoordinateSource: 'SELECTED',
    },
    update: {
      processingStatus: 'COMPLETED',
      lastAttemptAt: observedAt,
    },
  });
  await prisma.vehicleEnergyEventRefuelReconciliation.updateMany({
    where: { energyEventId, vehicleId },
    data: {
      enrichmentEnqueuedAt: observedAt,
      finalityState: 'FINAL_CANONICAL',
      enrichmentEligible: true,
      coordinateSelectionStatus: 'SELECTED',
      coordinateLatitude: 51.3305883,
      coordinateLongitude: 9.5126383,
    },
  });
}

export async function countReconciliationRows(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEventRefuelReconciliation.count({ where: { vehicleId } });
}

export async function countFallbackVee(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.vehicleEnergyEvent.count({
    where: { vehicleId, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
  });
}

export async function countPromoted(prisma: PrismaClient, vehicleId: string): Promise<number> {
  return prisma.rawRefuelCandidate.count({
    where: { vehicleId, lifecycleState: 'PROMOTED' },
  });
}

export function isF5Pr3LiveIntegration(): boolean {
  return process.env[RAW_FUEL_REFUEL_F5_PR3_INTEGRATION_ENV] === '1';
}

export function isF5Pr3RedisRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED_ENV] === '1';
}

export function isF5Pr3PostgresRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED_ENV] === '1';
}

export function assertF5Pr3RequiredInfra(dbAvailable: boolean, redisAvailable: boolean): void {
  if (isF5Pr3PostgresRequired() && !dbAvailable) {
    throw new Error(
      `${RAW_FUEL_REFUEL_F5_PR3_POSTGRES_REQUIRED_ENV}=1 but isolated PostgreSQL is unavailable`,
    );
  }
  if (isF5Pr3RedisRequired()) {
    if (!isF5Pr3LiveIntegration()) {
      throw new Error(
        `${RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED_ENV}=1 but ${RAW_FUEL_REFUEL_F5_PR3_INTEGRATION_ENV} is not 1`,
      );
    }
    if (!redisAvailable) {
      throw new Error(
        `${RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED_ENV}=1 but isolated Redis is unavailable`,
      );
    }
    proveF5Pr3IsolatedNonProductionInfra();
  }
}

export async function requireRedisForF5Pr3Gate(): Promise<boolean> {
  if (!isF5Pr3RedisRequired()) {
    return await probeRedis();
  }
  const ready = await probeRedis();
  if (!ready) {
    throw new Error(`${RAW_FUEL_REFUEL_F5_PR3_REDIS_REQUIRED_ENV}=1 but Redis probe failed`);
  }
  return true;
}

export function buildFuelEnrichmentDeterministicJobId(energyEventId: string): string {
  const fingerprint = buildFuelStationEnrichmentInputFingerprint({
    energyEventId,
    latitude: 51.3305883,
    longitude: 9.5126383,
  });
  const idempotencyKey = buildFuelStationEnrichmentJobIdempotencyKey({
    energyEventId,
    inputFingerprint: fingerprint,
  });
  return sanitizeBullMqJobId({ namespace: 'refuel-station', key: idempotencyKey });
}

export async function countEffectiveQueueJobs(
  queue: Queue,
  energyEventId: string,
): Promise<number> {
  const jobId = buildFuelEnrichmentDeterministicJobId(energyEventId);
  const job = await queue.getJob(jobId);
  if (job) return 1;
  const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'prioritized', 'completed']);
  return jobs.filter((row) => row.id === jobId).length;
}

export async function countOperationalEnrichmentOwners(
  prisma: PrismaClient,
  vehicleId: string,
): Promise<number> {
  const rows = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: { vehicleId, enrichmentEligible: true },
    select: { energyEventId: true },
  });
  return rows.length;
}

export async function assertBothForensicRowsRetained(
  prisma: PrismaClient,
  vehicleId: string,
  fallbackVeeId: string,
  nativeVeeId: string,
): Promise<void> {
  const fallback = await prisma.vehicleEnergyEvent.findUnique({ where: { id: fallbackVeeId } });
  const native = await prisma.vehicleEnergyEvent.findUnique({ where: { id: nativeVeeId } });
  expect(fallback).not.toBeNull();
  expect(native).not.toBeNull();
  expect(fallback!.detectionSource).toBe('SYNQDRIVE_RAW_FUEL_FALLBACK');
  expect(native!.detectionSource).toBe('DIMO_NATIVE');
}
