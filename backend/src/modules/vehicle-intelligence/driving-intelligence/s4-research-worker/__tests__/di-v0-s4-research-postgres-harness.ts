import type { PrismaClient } from '@prisma/client';
import { setKillState, type S4aTenant } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

export type S4ResearchCompletedFixture = P2CompletedPrimaryFixture;

export async function seedS4ResearchCompletedPrimaryFixture(db: PrismaClient): Promise<S4ResearchCompletedFixture> {
  return seedP2CompletedPrimaryFixture(db);
}

/** Research worker enablement requires a readable GLOBAL NOT_KILLED control row (fail-closed otherwise). */
export async function ensureS4ResearchPostgresControlPlane(db: PrismaClient): Promise<void> {
  await setKillState(db, 'NOT_KILLED');
}

export async function cleanupS4ResearchTenant(db: PrismaClient, tenant: S4aTenant): Promise<void> {
  await db.$executeRaw`DELETE FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_s4_research_outbox_v1 WHERE trip_id = ${tenant.tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_s4_research_osm_cache_v1 WHERE osm_context_key LIKE ${`%${tenant.tripId}%`}`;
  await cleanupP2Tenant(db, tenant);
}

export const RESEARCH_ENV_KEYS = [
  'DI_V0_S4_RESEARCH_ENABLED',
  'DI_V0_S4_RESEARCH_WORKER_ENABLED',
  'DI_V0_S4_RESEARCH_ROAD_MATCHING_V2_ENABLED',
  'DI_V0_S4_RESEARCH_ENABLED_SINCE',
  'DI_V0_S4_RESEARCH_ORGANIZATION_ALLOWLIST',
  'DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST',
  'DI_V0_S4_RESEARCH_BATCH_LIMIT',
  'DI_V0_S4_MASTER_ENABLED',
  'DI_V0_S4_WORKER_ENABLED',
  'DI_V0_S4_POSITION_ENABLED',
  'DI_V0_S4_ORGANIZATION_ALLOWLIST',
  'DI_V0_S4_VEHICLE_ALLOWLIST',
] as const;

export function applyResearchTestEnv(scope: { organizationId: string; vehicleId: string }): Record<string, string | undefined> {
  const backup: Record<string, string | undefined> = {};
  for (const key of RESEARCH_ENV_KEYS) {
    backup[key] = process.env[key];
  }
  process.env.DI_V0_S4_RESEARCH_ENABLED = 'true';
  process.env.DI_V0_S4_RESEARCH_WORKER_ENABLED = 'true';
  process.env.DI_V0_S4_RESEARCH_ROAD_MATCHING_V2_ENABLED = 'true';
  process.env.DI_V0_S4_RESEARCH_ENABLED_SINCE = '2020-01-01T00:00:00.000Z';
  process.env.DI_V0_S4_RESEARCH_ORGANIZATION_ALLOWLIST = scope.organizationId;
  process.env.DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST = scope.vehicleId;
  process.env.DI_V0_S4_MASTER_ENABLED = 'true';
  process.env.DI_V0_S4_WORKER_ENABLED = 'true';
  process.env.DI_V0_S4_POSITION_ENABLED = 'true';
  process.env.DI_V0_S4_ORGANIZATION_ALLOWLIST = scope.organizationId;
  process.env.DI_V0_S4_VEHICLE_ALLOWLIST = scope.vehicleId;
  return backup;
}

export function restoreResearchTestEnv(backup: Record<string, string | undefined>): void {
  for (const key of RESEARCH_ENV_KEYS) {
    const value = backup[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
