import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import {
  insertCoherentRevisionWithAckO2R1,
  insertIntegrityAttestationRowForTestO2R1,
} from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import { verifyDurableEvidenceRevisionForModeALoaderV1 } from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';
const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

const TIMEZONES = ['UTC', 'Europe/Berlin', 'America/New_York'] as const;

async function sqlIssuanceFunctionDeployed(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'm3_3_hv_h4_a3_issue_integrity_attestation_v1'
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

describe('M3.3-HV-H4-A3.3-O2-R1 TS verifier vs deferred SQL issuance', () => {
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

  beforeEach(async () => {
    if (!prisma) return;
    await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.deleteMany();
    await prisma.batteryHvChargeSessionEvidenceAck.deleteMany();
    await prisma.batteryHvChargeSessionEvidenceRevision.deleteMany();
  });

  it('SQL issuance function is not deployed in R1 migration', async () => {
    if (!prisma) return;
    expect(await sqlIssuanceFunctionDeployed(prisma)).toBe(false);
  });

  it('JSON-type adversarial rows: TS verifier rejects every case', async () => {
    if (!prisma) return;
    const base = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ack } = await insertCoherentRevisionWithAckO2R1(prisma, base.projection);
    if (!ack) throw new Error('missing ack');

    const adversarialJsonPatches: Array<{ id: string; patch: Record<string, unknown> }> = [
      { id: 'A_isOngoing_string_false', patch: { isOngoing: 'false' } },
      { id: 'B_startedBeforeRange_string_false', patch: { startedBeforeRange: 'false' } },
      { id: 'C_energy_value_string', patch: { energyAddedKwh: { kind: 'FINITE', value: '12.5' } } },
      { id: 'D_source_numeric', patch: { source: 123 } },
      { id: 'E_organizationId_numeric', patch: { organizationId: 12345 } },
    ];

    for (const { id, patch } of adversarialJsonPatches) {
      const merged = {
        ...(revision.scientificEvidenceJson as object),
        ...patch,
      };
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: revision.id },
        data: { scientificEvidenceJson: merged as Prisma.InputJsonValue },
      });
      const loaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
        where: { id: revision.id },
      });
      expect(() =>
        verifyDurableEvidenceRevisionForModeALoaderV1({ revision: loaded, ack }),
      ).toThrow();
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: revision.id },
        data: { scientificEvidenceJson: revision.scientificEvidenceJson as Prisma.InputJsonValue },
      });
    }
  });

  it('timestamp literal parity: non-canonical ISO strings fail TS mirror verify', async () => {
    if (!prisma) return;
    const base = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ack } = await insertCoherentRevisionWithAckO2R1(prisma, base.projection);
    if (!ack) throw new Error('missing ack');

    const canonicalStart = (revision.scientificEvidenceJson as { startAt: string }).startAt;
    const equivalentNonCanonical = '2026-01-15T11:30:00.000+01:00';

    const patched = {
      ...(revision.scientificEvidenceJson as object),
      startAt: equivalentNonCanonical,
    };
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { scientificEvidenceJson: patched as Prisma.InputJsonValue },
    });
    const loaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
      where: { id: revision.id },
    });
    expect(canonicalStart).not.toBe(equivalentNonCanonical);
    expect(() =>
      verifyDurableEvidenceRevisionForModeALoaderV1({ revision: loaded, ack }),
    ).toThrow();
  });

  it('valid revision verifies under multiple session time zones', async () => {
    if (!prisma) return;
    const base = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ack } = await insertCoherentRevisionWithAckO2R1(prisma, base.projection);
    if (!ack) throw new Error('missing ack');

    for (const tz of TIMEZONES) {
      await prisma.$executeRawUnsafe(`SET TIME ZONE '${tz.replace(/'/g, "''")}'`);
      const loaded = await prisma.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
        where: { id: revision.id },
      });
      expect(() =>
        verifyDurableEvidenceRevisionForModeALoaderV1({ revision: loaded, ack }),
      ).not.toThrow();
      const fpRows = await prisma.$queryRaw<Array<{ sql_sha: string }>>`
        SELECT public.m3_3_hv_h4_a3_source_revision_fingerprint_from_projection_jsonb_v1(
          ${loaded.scientificEvidenceJson as Prisma.InputJsonValue}::jsonb
        ) AS sql_sha
      `;
      expect(fpRows[0]?.sql_sha).toBe(loaded.sourceRevisionFingerprint);
    }
    await prisma.$executeRaw`SET TIME ZONE 'UTC'`;
  });

  it('R1-C1 TS durable verifier accepts coherent revision+ACK', async () => {
    if (!prisma) return;
    const base = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ack } = await insertCoherentRevisionWithAckO2R1(prisma, base.projection);
    expect(() =>
      verifyDurableEvidenceRevisionForModeALoaderV1({ revision, ack: ack! }),
    ).not.toThrow();
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ack!.id);
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });
});
