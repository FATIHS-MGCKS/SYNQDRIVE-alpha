import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import {
  insertCoherentRevisionWithAckO2R1,
  insertIntegrityAttestationRowForTestO2R1,
} from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import {
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE,
  M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
  withPostgresRoleV1,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

describe('M3.3-HV-H4-A3.3-O2-R2 restricted role + SECURITY DEFINER invalidation', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    prisma = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(prisma);
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

  it('restricted app role: revision UPDATE invalidates attestation (SECURITY DEFINER)', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);

    await prisma.$transaction(async (tx) => {
      await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE, async () => {
        await tx.batteryHvChargeSessionEvidenceRevision.update({
          where: { id: revision.id },
          data: { qualityStatus: 'R2_TOUCH' },
        });
      });
    });

    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('restricted app role: ACK UPDATE invalidates attestation', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);

    await prisma.$transaction(async (tx) => {
      await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE, async () => {
        await tx.batteryHvChargeSessionEvidenceAck.update({
          where: { id: ackId! },
          data: { acknowledgedAt: new Date() },
        });
      });
    });

    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('direct attestation INSERT denied for restricted app role', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    const attestationId = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE, async () => {
          await tx.$executeRawUnsafe(`
            INSERT INTO public.battery_hv_charge_session_evidence_integrity_attestations (
              id, revision_id, durability_ack_id, organization_id, vehicle_id, segment_fingerprint,
              evidence_contract_version, source_revision_fingerprint, durability_ack_contract_version,
              integrity_attestation_contract_version, attested_at, created_at
            ) VALUES (
              '${attestationId}', '${revision.id}', '${ackId}', '${revision.organizationId}', '${revision.vehicleId}',
              '${revision.segmentFingerprint}', '${revision.evidenceContractVersion}', '${revision.sourceRevisionFingerprint}',
              'M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1', 'M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1',
              NOW(), NOW()
            );
          `);
        });
      }),
    ).rejects.toThrow();
  });

  it('direct attestation UPDATE and DELETE denied for restricted app role', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    const row = await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);

    await expect(
      prisma.$transaction(async (tx) => {
        await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE, async () => {
          await tx.$executeRawUnsafe(`
            UPDATE public.battery_hv_charge_session_evidence_integrity_attestations
            SET attested_at = NOW() WHERE id = '${row.id}';
          `);
        });
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE, async () => {
          await tx.$executeRawUnsafe(`
            DELETE FROM public.battery_hv_charge_session_evidence_integrity_attestations
            WHERE id = '${row.id}';
          `);
        });
      }),
    ).rejects.toThrow();
  });

  it('trusted issuer role can INSERT attestation only (no revision UPDATE)', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    const attestationId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE, async () => {
        await tx.$executeRawUnsafe(`
          INSERT INTO public.battery_hv_charge_session_evidence_integrity_attestations (
            id, revision_id, durability_ack_id, organization_id, vehicle_id, segment_fingerprint,
            evidence_contract_version, source_revision_fingerprint, durability_ack_contract_version,
            integrity_attestation_contract_version, attested_at, created_at
          ) VALUES (
            '${attestationId}', '${revision.id}', '${ackId}', '${revision.organizationId}', '${revision.vehicleId}',
            '${revision.segmentFingerprint}', '${revision.evidenceContractVersion}', '${revision.sourceRevisionFingerprint}',
            'M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1', 'M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1',
            NOW(), NOW()
          );
        `);
      });
    });

    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);

    await expect(
      prisma.$transaction(async (tx) => {
        await withPostgresRoleV1(tx as PrismaClient, M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE, async () => {
          await tx.batteryHvChargeSessionEvidenceRevision.update({
            where: { id: revision.id },
            data: { qualityStatus: 'DENIED' },
          });
        });
      }),
    ).rejects.toThrow();
  });
});
