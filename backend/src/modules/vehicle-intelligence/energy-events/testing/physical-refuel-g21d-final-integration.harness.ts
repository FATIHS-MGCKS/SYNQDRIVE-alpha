import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  PrismaClient,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FuelStationEnrichmentProducerService } from '../../fuel-stations/enrichment/fuel-station-enrichment-producer.service';
import { buildFuelStationEnrichmentInputFingerprint } from '../../fuel-stations/enrichment/fuel-station-enrichment-fingerprint.util';
import { FUEL_STATION_RESOLVER_VERSION } from '../../fuel-stations/fuel-station-location.types';
import { PHYSICAL_REFUEL_COORDINATE_SELECTED } from '../physical-refuel-coordinate.policy';
import { PhysicalRefuelReconciliationRuntimeService } from '../physical-refuel-reconciliation-runtime.service';

export const G21D_FINAL_POSTGRES_HOST = process.env.TEST_POSTGRES_HOST ?? '127.0.0.1';
export const G21D_FINAL_POSTGRES_PORT = Number.parseInt(
  process.env.TEST_POSTGRES_PORT ?? '5432',
  10,
);
export const G21D_FINAL_POSTGRES_DATABASE =
  process.env.TEST_POSTGRES_DATABASE ?? 'synqdrive_g21d_final_test';
export const G21D_FINAL_REDIS_HOST = process.env.TEST_REDIS_HOST ?? '127.0.0.1';
export const G21D_FINAL_REDIS_PORT = Number.parseInt(
  process.env.TEST_REDIS_PORT ?? '56379',
  10,
);
export const G21D_FINAL_REDIS_DB = Number.parseInt(
  process.env.G21D_FINAL_REDIS_DB ?? '14',
  10,
);
export const G21D_FINAL_V2_CUTOVER_ISO = '2026-09-01T00:00:00.000Z';

export function buildG21dFinalDatabaseUrl(): string {
  const user = process.env.G21D_FINAL_POSTGRES_USER ?? 'g21d_test';
  const password = process.env.G21D_FINAL_POSTGRES_PASSWORD ?? 'G21dFinalTest_9xK2m';
  return `postgresql://${user}:${password}@${G21D_FINAL_POSTGRES_HOST}:${G21D_FINAL_POSTGRES_PORT}/${G21D_FINAL_POSTGRES_DATABASE}?schema=public`;
}

export function redisConnectionOptions() {
  return {
    host: process.env.G21D_FINAL_REDIS_HOST ?? G21D_FINAL_REDIS_HOST,
    port: Number.parseInt(process.env.G21D_FINAL_REDIS_PORT ?? String(G21D_FINAL_REDIS_PORT), 10),
    password: process.env.G21D_FINAL_REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.G21D_FINAL_REDIS_DB ?? String(G21D_FINAL_REDIS_DB), 10),
    maxRetriesPerRequest: null as null,
  };
}

export function proveIsolatedNonProductionInfra(): {
  postgresIsProduction: false;
  redisIsProduction: false;
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  redisHost: string;
  redisPort: number;
} {
  const databaseUrl = process.env.DATABASE_URL ?? buildG21dFinalDatabaseUrl();
  const blockedHosts = ['srv1374778', 'app.synqdrive.eu', 'mein-vps', 'hstgr.cloud'];
  const blockedDbNames = ['synqdrive_prod', 'synqdrive_production'];
  const lowerUrl = databaseUrl.toLowerCase();

  for (const host of blockedHosts) {
    if (lowerUrl.includes(host)) {
      throw new Error(`Refusing non-isolated DATABASE_URL host match: ${host}`);
    }
  }
  for (const dbName of blockedDbNames) {
    if (lowerUrl.includes(`/${dbName}`) || lowerUrl.includes(`/${dbName}?`)) {
      throw new Error(`Refusing non-isolated DATABASE_URL database: ${dbName}`);
    }
  }
  const exactDbMatch = lowerUrl.match(/\/([^/?]+)(\?|$)/);
  if (exactDbMatch?.[1] === 'synqdrive') {
    throw new Error('Refusing non-isolated DATABASE_URL database: synqdrive');
  }
  const expectedDb = G21D_FINAL_POSTGRES_DATABASE.toLowerCase();
  if (!lowerUrl.includes(`/${expectedDb}`) && !lowerUrl.includes(`/${expectedDb}?`)) {
    throw new Error(`DATABASE_URL must target ${G21D_FINAL_POSTGRES_DATABASE}`);
  }

  const redisHost = redisConnectionOptions().host;
  if (blockedHosts.some((host) => redisHost.includes(host))) {
    throw new Error(`Refusing non-isolated REDIS host: ${redisHost}`);
  }

  return {
    postgresIsProduction: false,
    redisIsProduction: false,
    postgresHost: G21D_FINAL_POSTGRES_HOST,
    postgresPort: G21D_FINAL_POSTGRES_PORT,
    postgresDatabase: G21D_FINAL_POSTGRES_DATABASE,
    redisHost,
    redisPort: redisConnectionOptions().port,
  };
}

export async function probePostgresDatabase(): Promise<boolean> {
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

export async function probeRedis(): Promise<boolean> {
  const queue = new Queue(`probe-${randomUUID().slice(0, 8)}`, {
    connection: redisConnectionOptions(),
  });
  try {
    await queue.waitUntilReady();
    return true;
  } catch {
    return false;
  } finally {
    await queue.close().catch(() => undefined);
  }
}

export function createIsolatedTestQueue(suffix: string): Queue {
  return new Queue(`g21d-final-${suffix}-${randomUUID().slice(0, 8)}`, {
    connection: redisConnectionOptions(),
    prefix: `g21d-final:${suffix}`,
  });
}

export function createFuelEnrichmentConfig() {
  return {
    enabled: true,
    cutoverAt: new Date(G21D_FINAL_V2_CUTOVER_ISO),
    cutoverState: 'valid' as const,
    recoveryEnabled: false,
    recoveryIntervalMs: 300_000,
    recoveryBatchSize: 50,
    jobAttempts: 3,
    jobBackoffMs: 1_000,
  };
}

export function createPhysicalRefuelConfig() {
  return {
    enabled: true,
    candidateLookbackMs: 6 * 60 * 60 * 1000,
    candidateLookaheadMs: 60 * 60 * 1000,
    settlementHorizonMs: 60 * 60 * 1000,
    recoveryEnabled: true,
    recoveryIntervalMs: 60_000,
    recoveryBatchSize: 25,
    v2OwnershipCutoverAt: new Date(G21D_FINAL_V2_CUTOVER_ISO),
    recoveryOrphanLookbackMs: 7 * 24 * 60 * 60 * 1000,
    routeEvidenceStabilizationMs: 2 * 60 * 60 * 1000,
  };
}

export function createProducerService(
  queue: Queue,
  prisma: PrismaClient,
): FuelStationEnrichmentProducerService {
  return new FuelStationEnrichmentProducerService(
    queue as never,
    createFuelEnrichmentConfig() as never,
    prisma as never,
  );
}

export function createRuntimeService(
  prisma: PrismaClient,
  producer: FuelStationEnrichmentProducerService,
): PhysicalRefuelReconciliationRuntimeService {
  return new PhysicalRefuelReconciliationRuntimeService(
    prisma as PrismaService,
    createPhysicalRefuelConfig() as never,
    createFuelEnrichmentConfig() as never,
    producer,
    undefined,
  );
}

export interface LostEnqueueSeed {
  organizationId: string;
  vehicleId: string;
  energyEventId: string;
  energyEvent: VehicleEnergyEvent;
}

export async function seedLostEnqueueScenario(
  prisma: PrismaClient,
  suffix: string,
): Promise<LostEnqueueSeed> {
  const organizationId = `org-g21d-${suffix}`;
  const vehicleId = `veh-g21d-${suffix}`;
  const energyEventId = `evt-g21d-${suffix}`;
  const observedAt = new Date('2026-09-02T12:00:00.000Z');

  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${`G21D Final Test Org ${suffix}`}, 'FLEET', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
    )
    VALUES (
      ${vehicleId},
      ${organizationId},
      ${`VIN${suffix}`.padEnd(17, '0').slice(0, 17)},
      'Test',
      'G21D',
      2024,
      'DIESEL',
      'AVAILABLE',
      'CLEAN',
      'GOOD',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `;

  const energyEvent = await prisma.vehicleEnergyEvent.create({
    data: {
      id: energyEventId,
      vehicleId,
      dimoSegmentId: `seg-${suffix}`,
      kind: EnergyEventKind.REFUEL,
      detectionMechanism: 'refuel',
      startTime: new Date('2026-09-02T11:55:00.000Z'),
      endTime: new Date('2026-09-02T12:05:00.000Z'),
      durationSeconds: 600,
      startLatitude: 51.3305883,
      startLongitude: 9.5126383,
      endLatitude: 51.3305883,
      endLongitude: 9.5126383,
      fuelDeltaLiters: 32.5,
      confidence: EnergyEventConfidence.HIGH,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
  });

  await prisma.vehicleEnergyEventRefuelReconciliation.create({
    data: {
      energyEventId,
      vehicleId,
      reconciliationGroupId: `grp-${suffix}`,
      classification: 'SINGLE_CANONICAL',
      finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
      canonicalEventId: energyEventId,
      enrichmentEligible: true,
      settlementWindowOpen: false,
      lateSiblingConflict: false,
      reason: 'single_canonical',
      reasonCodes: [],
      coordinateLatitude: 51.3305883,
      coordinateLongitude: 9.5126383,
      coordinateSource: PHYSICAL_REFUEL_COORDINATE_SELECTED,
      coordinateSelectionStatus: 'SELECTED',
      enrichmentEnqueuedAt: null,
      reconciledAt: observedAt,
    },
  });

  return { organizationId, vehicleId, energyEventId, energyEvent };
}

export async function seedStaleEnrichmentScenario(
  prisma: PrismaClient,
  suffix: string,
): Promise<LostEnqueueSeed & { fingerprint: string }> {
  const base = await seedLostEnqueueScenario(prisma, suffix);
  const fingerprint = buildFuelStationEnrichmentInputFingerprint({
    energyEventId: base.energyEventId,
    latitude: 51.3305883,
    longitude: 9.5126383,
  });

  await prisma.vehicleEnergyEventFuelStationEnrichment.create({
    data: {
      energyEventId: base.energyEventId,
      processingStatus: 'PROCESSING',
      lastAttemptAt: new Date('2026-09-01T00:00:00.000Z'),
      inputFingerprint: fingerprint,
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      inputLatitude: 51.3305883,
      inputLongitude: 9.5126383,
      inputCoordinateSource: PHYSICAL_REFUEL_COORDINATE_SELECTED,
    },
  });

  return { ...base, fingerprint };
}

export async function cleanupG21dFinalSeed(
  prisma: PrismaClient,
  vehicleId: string,
  organizationId: string,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM vehicle_energy_event_fuel_station_enrichments
    WHERE energy_event_id IN (SELECT id FROM vehicle_energy_events WHERE vehicle_id = ${vehicleId})
  `;
  await prisma.$executeRaw`
    DELETE FROM vehicle_energy_event_refuel_reconciliations WHERE vehicle_id = ${vehicleId}
  `;
  await prisma.$executeRaw`DELETE FROM vehicle_energy_events WHERE vehicle_id = ${vehicleId}`;
  await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
  await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
}

export async function drainTestQueue(queue: Queue): Promise<void> {
  await queue.obliterate({ force: true });
  await queue.close();
}
