import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { validatePhaseAProductionTlsUrlPolicyV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';

function parseDatabaseUrlV1(databaseUrl: string): URL {
  return new URL(databaseUrl.trim().replace(/^postgresql:/, 'postgres:'));
}

export function throwPhaseAProductionPrismaClientConfigurationErrorV1(reasonCode: string): never {
  throw new Error(reasonCode);
}

/**
 * Production Phase-A verify-full URLs use @prisma/adapter-pg with explicit pg TLS
 * (CA file + hostname verification). Default Prisma engine TLS is not used for production admission.
 */
export function createPhaseAProductionPrismaClientV1(databaseUrl: string): PrismaClient {
  const tlsPolicy = validatePhaseAProductionTlsUrlPolicyV1(databaseUrl);
  if (!tlsPolicy.ok) {
    throwPhaseAProductionPrismaClientConfigurationErrorV1(tlsPolicy.reasonCode);
  }

  const parsed = parseDatabaseUrlV1(databaseUrl);
  const sslrootcert = parsed.searchParams.get('sslrootcert')?.trim();
  if (!sslrootcert) {
    throwPhaseAProductionPrismaClientConfigurationErrorV1(
      'PHASE_A_PRODUCTION_TLS_SSLROOTCERT_REQUIRED',
    );
  }

  let ca: string;
  try {
    ca = readFileSync(sslrootcert, 'utf8');
  } catch {
    throwPhaseAProductionPrismaClientConfigurationErrorV1(
      'PHASE_A_PRODUCTION_TLS_SSLROOTCERT_UNREADABLE',
    );
  }

  const pool = new Pool({
    host: parsed.hostname,
    port: Number(parsed.port || '5432'),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '').split('/')[0],
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: parsed.hostname,
    },
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
