import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1,
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

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

  it('golden corpus UTF-8 and SHA-256 parity', async () => {
    if (!integrationEnabled || !prisma) return;

    const mismatches: string[] = [];

    for (const vector of M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1) {
      const tsUtf8 = buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(vector.projection);
      const tsSha = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(vector.projection);

      const rows = await prisma.$queryRaw<
        Array<{ sql_utf8: string; sql_sha: string }>
      >`
        SELECT
          m3_3_hv_h4_a3_canonical_utf8_from_projection_jsonb_v1(${vector.projection as unknown as Prisma.InputJsonValue}::jsonb) AS sql_utf8,
          m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(${vector.projection as unknown as Prisma.InputJsonValue}::jsonb) AS sql_sha
      `;

      const sqlUtf8 = rows[0]?.sql_utf8;
      const sqlSha = rows[0]?.sql_sha;
      const nodeSha = createHash('sha256').update(tsUtf8, 'utf8').digest('hex');

      if (sqlUtf8 !== tsUtf8) {
        mismatches.push(`${vector.id}:utf8`);
      }
      if (sqlSha !== tsSha || sqlSha !== nodeSha) {
        mismatches.push(`${vector.id}:sha256`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
