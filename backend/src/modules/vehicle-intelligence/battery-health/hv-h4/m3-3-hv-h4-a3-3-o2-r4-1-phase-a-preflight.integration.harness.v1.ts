import { PrismaClient } from '@prisma/client';
import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV,
  validateIsolatedPhaseADatabaseTargetV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';

export const M3_3_HV_H4_A3_PHASE_A_INTEGRATION_JOB_ENV = 'BATTERY_HV_H4_REPORT_INTEGRATION' as const;

export function isPhaseAPreflightPostgresIntegrationJobV1(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[M3_3_HV_H4_A3_PHASE_A_INTEGRATION_JOB_ENV] === '1';
}

/** Fail closed when the HV-H4 postgres integration job is active. */
export function resolvePhaseAPreflightIntegrationDatabaseUrlV1(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isPhaseAPreflightPostgresIntegrationJobV1(env)) {
    throw new Error('PHASE_A_INTEGRATION_JOB_NOT_ACTIVE');
  }

  const databaseUrl = env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) {
    throw new Error('PHASE_A_INTEGRATION_DATABASE_URL_REQUIRED');
  }

  const validated = validateIsolatedPhaseADatabaseTargetV1(databaseUrl, env, {
    requireExplicitApproval: true,
  });
  if (!validated.ok) {
    throw new Error(validated.reasonCode);
  }

  return databaseUrl;
}

export async function assertPhaseAPreflightIntegrationDatabaseReachableV1(databaseUrl: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await client.$queryRaw`SELECT 1`;
  } catch {
    throw new Error('PHASE_A_INTEGRATION_DATABASE_UNREACHABLE');
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
