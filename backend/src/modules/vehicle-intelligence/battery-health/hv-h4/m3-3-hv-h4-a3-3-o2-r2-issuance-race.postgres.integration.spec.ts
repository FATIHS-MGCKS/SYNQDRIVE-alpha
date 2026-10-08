import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import {
  issueM3_3HvH4A3IntegrityAttestationIsolatedV1,
  M3_3HvH4A3IntegrityAttestationIssueVerificationError,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.v1';
import {
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
describe('M3.3-HV-H4-A3.3-O2-R2 isolated TS issuer concurrency', () => {
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

  async function seedRevision() {
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma!, vector.projection);
    return { revision, ackId: ackId! };
  }

  it('A) issuance then revision UPDATE leaves no stale attestation', async () => {
    if (!prisma) return;
    const { revision } = await seedRevision();
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
      revisionId: revision.id,
      trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
    });
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { qualityStatus: 'POST_ISSUE' },
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('B) revision UPDATE before issuance still allows valid issue', async () => {
    if (!prisma) return;
    const { revision } = await seedRevision();
    const scientific = revision.scientificEvidenceJson as Record<string, unknown>;
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: {
        qualityStatus: 'PRE_ISSUE',
        scientificEvidenceJson: { ...scientific, qualityStatus: 'PRE_ISSUE' },
      },
    });
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
      revisionId: revision.id,
      trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('C) issuance then ACK UPDATE leaves no stale attestation', async () => {
    if (!prisma) return;
    const { revision, ackId } = await seedRevision();
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
      revisionId: revision.id,
      trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
    });
    await prisma.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackId },
      data: { acknowledgedAt: new Date() },
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('D) ACK UPDATE before issuance still allows valid issue', async () => {
    if (!prisma) return;
    const { revision, ackId } = await seedRevision();
    await prisma.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackId },
      data: { acknowledgedAt: new Date('2026-02-01T00:00:00.000Z') },
    });
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
      revisionId: revision.id,
      trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('E) concurrent duplicate issuance: exactly one attestation survives', async () => {
    if (!prisma) return;
    const { revision } = await seedRevision();
    const results = await Promise.allSettled([
      issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
        revisionId: revision.id,
        trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
      }),
      issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
        revisionId: revision.id,
        trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('F) failed verification rolls back (no attestation row)', async () => {
    if (!prisma) return;
    const { revision } = await seedRevision();
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { sourceRevisionFingerprint: 'b'.repeat(64) },
    });
    await expect(
      issueM3_3HvH4A3IntegrityAttestationIsolatedV1(prisma, {
        revisionId: revision.id,
        trustedIssuerPostgresRole: M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
      }),
    ).rejects.toBeInstanceOf(M3_3HvH4A3IntegrityAttestationIssueVerificationError);
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

});
