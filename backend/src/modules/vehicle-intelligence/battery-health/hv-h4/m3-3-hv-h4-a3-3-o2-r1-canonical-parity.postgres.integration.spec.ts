import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1,
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1,
  M3_3_HV_H4_A3_O2_R1_NUMERIC_EXPONENT_GOLDEN_VECTORS_V1,
} from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

async function sqlCanonicalPair(
  prisma: PrismaClient,
  projection: unknown,
): Promise<{ sqlUtf8: string; sqlSha: string }> {
  const rows = await prisma.$queryRaw<Array<{ sql_utf8: string; sql_sha: string }>>`
    SELECT
      public.m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(${projection as Prisma.InputJsonValue}::jsonb) AS sql_utf8,
      public.m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(${projection as Prisma.InputJsonValue}::jsonb) AS sql_sha
  `;
  return { sqlUtf8: rows[0]?.sql_utf8 ?? '', sqlSha: rows[0]?.sql_sha ?? '' };
}

function recordMismatch(
  mismatches: string[],
  id: string,
  sqlUtf8: string,
  sqlSha: string,
  tsUtf8: string,
  tsSha: string,
) {
  const nodeSha = createHash('sha256').update(tsUtf8, 'utf8').digest('hex');
  if (sqlUtf8 !== tsUtf8) mismatches.push(`${id}:utf8`);
  if (sqlSha !== tsSha || sqlSha !== nodeSha) mismatches.push(`${id}:sha256`);
}

describe('M3.3-HV-H4-A3.3-O2-R1 SQL ↔ TS canonical parity', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('decimal-safe golden corpus UTF-8 and SHA-256 parity', async () => {
    if (!integrationEnabled || !prisma) return;

    const mismatches: string[] = [];

    for (const vector of M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1) {
      const tsUtf8 = buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(vector.projection);
      const tsSha = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(vector.projection);
      const { sqlUtf8, sqlSha } = await sqlCanonicalPair(prisma, vector.projection);
      recordMismatch(mismatches, vector.id, sqlUtf8, sqlSha, tsUtf8, tsSha);
    }

    expect(mismatches).toEqual([]);
  });

  it('documents exponent / boundary numeric divergence (SQL issuance blocked)', async () => {
    if (!integrationEnabled || !prisma) return;

    const mismatches: string[] = [];

    for (const vector of M3_3_HV_H4_A3_O2_R1_NUMERIC_EXPONENT_GOLDEN_VECTORS_V1) {
      const tsUtf8 = buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(vector.projection);
      const tsSha = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(vector.projection);
      const { sqlUtf8, sqlSha } = await sqlCanonicalPair(prisma, vector.projection);
      if (sqlUtf8 !== tsUtf8) mismatches.push(`${vector.id}:utf8`);
      if (sqlSha !== tsSha) mismatches.push(`${vector.id}:sha256`);
    }

    expect(mismatches.length).toBeGreaterThan(0);
  });
});
