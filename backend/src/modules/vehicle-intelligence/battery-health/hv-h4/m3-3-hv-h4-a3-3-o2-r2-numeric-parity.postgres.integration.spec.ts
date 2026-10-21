import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1,
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildRandomizedBinary64ProjectionVectorsV1,
  M3_3_HV_H4_A3_O2_R2_DECIMAL_SAFE_NUMERIC_VECTORS_V1,
  M3_3_HV_H4_A3_O2_R2_EXPLICIT_NUMERIC_BOUNDARY_VECTORS_V1,
} from './m3-3-hv-h4-a3-3-o2-r2-numeric-parity.harness.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const RANDOMIZED_BINARY64_CASE_COUNT = 256;

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

function countMismatches(
  prisma: PrismaClient,
  vectors: Array<{ id: string; projection: unknown }>,
): Promise<number> {
  return (async () => {
    let mismatches = 0;
    for (const vector of vectors) {
      const tsUtf8 = buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(
        vector.projection as Parameters<typeof buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1>[0],
      );
      const tsSha = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(
        vector.projection as Parameters<typeof computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1>[0],
      );
      const { sqlUtf8, sqlSha } = await sqlCanonicalPair(prisma, vector.projection);
      const nodeSha = createHash('sha256').update(tsUtf8, 'utf8').digest('hex');
      if (sqlUtf8 !== tsUtf8 || sqlSha !== tsSha || sqlSha !== nodeSha) mismatches += 1;
    }
    return mismatches;
  })();
}

describe('M3.3-HV-H4-A3.3-O2-R2 SQL ↔ TS numeric parity measurement', () => {
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

  it('decimal-safe FINITE vectors: zero SQL/TS mismatches', async () => {
    if (!prisma) return;
    const mismatches = await countMismatches(prisma, M3_3_HV_H4_A3_O2_R2_DECIMAL_SAFE_NUMERIC_VECTORS_V1);
    expect(mismatches).toBe(0);
  });

  it('explicit exponent/boundary + randomized binary64: SQL diverges from TS (blocks SQL issuance)', async () => {
    if (!prisma) return;
    const randomized = buildRandomizedBinary64ProjectionVectorsV1(RANDOMIZED_BINARY64_CASE_COUNT);
    const combined = [...M3_3_HV_H4_A3_O2_R2_EXPLICIT_NUMERIC_BOUNDARY_VECTORS_V1, ...randomized];
    const mismatches = await countMismatches(prisma, combined);
    expect(mismatches).toBeGreaterThan(0);
  });
});
