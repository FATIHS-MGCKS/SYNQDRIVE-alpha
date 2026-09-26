import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { ChargingStationCandidateRepository } from '../charging-station-candidate.repository';
import { ChargingStationLocationResolverService } from '../charging-station-location-resolver.service';
import { ChargingStationEnrichmentOrchestratorService } from '../enrichment/charging-station-enrichment-orchestrator.service';
import { ChargingStationEnrichmentProducerService } from '../enrichment/charging-station-enrichment-producer.service';
import { ChargingStationEnrichmentRecoveryScheduler } from '@workers/schedulers/charging-station-enrichment-recovery.scheduler';
import { RechargeStationEnrichmentProcessor } from '@workers/processors/recharge-station-enrichment.processor';
import {
  buildChargingStationEnrichmentInputFingerprint,
  buildChargingStationEnrichmentJobIdempotencyKey,
} from '../enrichment/charging-station-enrichment-fingerprint.util';
import { deriveCanonicalChargingStationEnrichmentCoordinate } from '../enrichment/derive-canonical-charging-station-enrichment-coordinate';
import {
  RECHARGE_STATION_ENRICHMENT_JOB_NAME,
  type RechargeStationEnrichmentJobData,
} from '../enrichment/charging-station-enrichment.types';
import { CHARGING_STATION_RESOLVER_VERSION } from '../charging-station-location.types';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../../energy-events/erd-recharge-projection/erd-recharge-projection.constants';
import {
  ensureChargingStationOsmSchema,
  probeChargingStationPostgresDatabase,
  seedSyntheticChargingDataset,
} from './charging-station-resolver-postgres.integration.harness';

export const E6_3_CUTOVER_ISO = '2026-09-01T00:00:00.000Z';
export const E6_3_POST_CUTOVER_END = new Date('2026-09-10T11:00:00.000Z');
export const E6_3_PRE_CUTOVER_END = new Date('2026-08-15T11:00:00.000Z');

export const E6_3_MATCH_LAT = 50.001;
export const E6_3_MATCH_LON = 8.001;
export const E6_3_AMBIGUOUS_LAT = 50.00108;
export const E6_3_AMBIGUOUS_LON = 8.00108;
export const E6_3_NOT_FOUND_LAT = 70.0;
export const E6_3_NOT_FOUND_LON = 70.0;

export type RedisStack = {
  connection: IORedis;
  stop: () => Promise<void>;
};

export async function startE6_3RedisStack(): Promise<RedisStack> {
  const portEnv = process.env.TEST_REDIS_PORT;
  if (portEnv) {
    const connection = new IORedis({
      host: '127.0.0.1',
      port: Number(portEnv),
      maxRetriesPerRequest: null,
    });
    await connection.ping();
    return {
      connection,
      stop: async () => {
        await connection.quit();
      },
    };
  }
  const memoryServer = new RedisMemoryServer();
  await memoryServer.start();
  const host = await memoryServer.getHost();
  const port = await memoryServer.getPort();
  const connection = new IORedis({ host, port, maxRetriesPerRequest: null });
  await connection.ping();
  return {
    connection,
    stop: async () => {
      await connection.quit();
      await memoryServer.stop();
    },
  };
}

export function createE6_3IsolatedQueue(connection: IORedis, suffix: string): Queue {
  const id = randomUUID().slice(0, 8);
  return new Queue(`e6-3-${suffix}-${id}`, {
    connection,
    prefix: `e6-3:${suffix}:${id}`,
  });
}

export function createE6_3EnrichmentConfig(
  overrides: Partial<{
    enabled: boolean;
    recoveryEnabled: boolean;
    cutoverAt: Date | null;
    cutoverState: 'valid' | 'missing' | 'invalid';
    recoveryBatchSize: number;
    jobAttempts: number;
    jobBackoffMs: number;
  }> = {},
) {
  return {
    enabled: true,
    recoveryEnabled: true,
    recoveryIntervalMs: 60_000,
    recoveryBatchSize: 50,
    jobAttempts: 3,
    jobBackoffMs: 500,
    cutoverAt: new Date(E6_3_CUTOVER_ISO),
    cutoverState: 'valid' as const,
    ...overrides,
  };
}

export function createE6_3Producer(
  queue: Queue,
  prisma: PrismaClient,
  config = createE6_3EnrichmentConfig(),
): ChargingStationEnrichmentProducerService {
  return new ChargingStationEnrichmentProducerService(
    queue as never,
    config as never,
    prisma as never,
  );
}

export async function bootstrapE6_3PostgresOrchestrator(): Promise<{
  prisma: PrismaClient;
  orchestrator: ChargingStationEnrichmentOrchestratorService;
  resolver: ChargingStationLocationResolverService;
}> {
  const ok = await probeChargingStationPostgresDatabase();
  if (!ok) {
    throw new Error('E6.3 integration requires DATABASE_URL with PostGIS');
  }
  const prisma = new PrismaClient();
  await ensureChargingStationOsmSchema(prisma);
  await seedSyntheticChargingDataset(prisma);
  const repo = new ChargingStationCandidateRepository(prisma as unknown as PrismaService);
  const resolver = new ChargingStationLocationResolverService(repo);
  const orchestrator = new ChargingStationEnrichmentOrchestratorService(
    prisma as unknown as PrismaService,
    resolver,
  );
  return { prisma, orchestrator, resolver };
}

export async function seedOrgVehicle(prisma: PrismaClient) {
  const suffix = randomUUID().slice(0, 8);
  const org = await prisma.organization.create({
    data: {
      companyName: `E6.3 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E63${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E63-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'EV',
      year: 2025,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle };
}

export async function createCanonicalRechargeEvent(
  prisma: PrismaClient,
  vehicleId: string,
  coords: {
    startLatitude?: number | null;
    startLongitude?: number | null;
    endLatitude?: number | null;
    endLongitude?: number | null;
    endTime?: Date;
  } = {},
): Promise<VehicleEnergyEvent> {
  return prisma.vehicleEnergyEvent.create({
    data: {
      vehicleId,
      kind: EnergyEventKind.RECHARGE,
      detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
      detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
      confidence: EnergyEventConfidence.HIGH,
      startTime: new Date('2026-09-10T10:00:00.000Z'),
      endTime: coords.endTime ?? E6_3_POST_CUTOVER_END,
      durationSeconds: 3600,
      startLatitude: coords.startLatitude ?? null,
      startLongitude: coords.startLongitude ?? null,
      endLatitude: coords.endLatitude ?? null,
      endLongitude: coords.endLongitude ?? null,
      energyDeltaKwh: 12,
    },
  });
}

export async function cleanupOrgVehicle(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
  eventIds: string[] = [],
): Promise<void> {
  if (eventIds.length > 0) {
    await prisma.vehicleEnergyEventChargingStationEnrichment
      .deleteMany({ where: { energyEventId: { in: eventIds } } })
      .catch(() => undefined);
    await prisma.vehicleEnergyEvent.deleteMany({ where: { id: { in: eventIds } } }).catch(() => undefined);
  }
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => undefined);
}

export function deterministicRechargeJobId(event: VehicleEnergyEvent): string {
  const outcome = deriveCanonicalChargingStationEnrichmentCoordinate(event);
  const fingerprint = buildChargingStationEnrichmentInputFingerprint({
    energyEventId: event.id,
    coordinateOutcome: outcome,
  });
  const key = buildChargingStationEnrichmentJobIdempotencyKey({
    energyEventId: event.id,
    inputFingerprint: fingerprint,
  });
  return sanitizeBullMqJobId({ namespace: 'recharge-station', key });
}

export async function drainQueue(queue: Queue): Promise<void> {
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close().catch(() => undefined);
}

export async function waitForJobState(
  queue: Queue,
  jobId: string,
  state: string,
  timeoutMs = 15_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await queue.getJob(jobId);
    if (job && (await job.getState()) === state) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Job ${jobId} did not reach state ${state}`);
}

export function createE6_3Worker(
  queue: Queue,
  processor: RechargeStationEnrichmentProcessor,
): Worker {
  return new Worker(
    queue.name,
    async (job: Job<RechargeStationEnrichmentJobData>) => {
      await processor.process(job);
    },
    { connection: queue.opts.connection as IORedis, prefix: queue.opts.prefix },
  );
}

export function createE6_3Processor(
  orchestrator: ChargingStationEnrichmentOrchestratorService,
  config = createE6_3EnrichmentConfig(),
): RechargeStationEnrichmentProcessor {
  return new RechargeStationEnrichmentProcessor(orchestrator, config as never);
}

export function createE6_3RecoveryScheduler(input: {
  prisma: PrismaClient;
  producer: ChargingStationEnrichmentProducerService;
  leaderGuard: { shouldRun: (name: string) => boolean };
  config?: ReturnType<typeof createE6_3EnrichmentConfig>;
}): ChargingStationEnrichmentRecoveryScheduler {
  return new ChargingStationEnrichmentRecoveryScheduler(
    (input.config ?? createE6_3EnrichmentConfig()) as never,
    input.prisma as never,
    input.producer,
    input.leaderGuard as never,
  );
}

export function enableWorkersForQueueTests(): void {
  RuntimeStatusRegistry.setWorkersEnabled(true);
}

export {
  buildChargingStationEnrichmentInputFingerprint,
  buildChargingStationEnrichmentJobIdempotencyKey,
} from '../enrichment/charging-station-enrichment-fingerprint.util';
export { deriveCanonicalChargingStationEnrichmentCoordinate } from '../enrichment/derive-canonical-charging-station-enrichment-coordinate';
export { CHARGING_STATION_RESOLVER_VERSION };
