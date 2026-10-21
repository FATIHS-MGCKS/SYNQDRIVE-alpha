import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import {
  issueM3_3HvH4A3IntegrityAttestationIsolatedV1,
  M3_3HvH4A3IntegrityAttestationIssueVerificationError,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.v1';
import {
  createIssuerLoginPostgresClientV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE,
  readPostgresSessionIdentityV1,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

describe('M3.3-HV-H4-A3.3-O2-R2-H2 real issuer-login issuance (PostgreSQL)', () => {
  let admin: PrismaClient;
  let issuerDb: Awaited<ReturnType<typeof createIssuerLoginPostgresClientV1>>;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
    issuerDb = await createIssuerLoginPostgresClientV1();
    if (!issuerDb) {
      throw new Error('O2-R2-H2: issuer login client required');
    }
    const identity = await readPostgresSessionIdentityV1(issuerDb);
    if (identity.currentUser !== M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE) {
      throw new Error(`O2-R2-H2: expected issuer login, got ${identity.currentUser}`);
    }
  });

  afterAll(async () => {
    await issuerDb?.$disconnect();
    await admin?.$disconnect();
  });

  beforeEach(async () => {
    if (!admin) return;
    await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.deleteMany();
    await admin.batteryHvChargeSessionEvidenceAck.deleteMany();
    await admin.batteryHvChargeSessionEvidenceRevision.deleteMany();
  });

  it('REAL_ISSUER_LOGIN_ISSUANCE: lock → verify → INSERT on issuer-login session', async () => {
    if (!admin || !issuerDb) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    const result = await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id });
    expect(result.attestationId).toBeTruthy();
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('REAL_ISSUER_LOGIN_VERIFY_FAILURE: corrupted revision rolls back (no attestation)', async () => {
    if (!admin || !issuerDb) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    await admin.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { sourceRevisionFingerprint: 'd'.repeat(64) },
    });
    await expect(
      issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id }),
    ).rejects.toBeInstanceOf(M3_3HvH4A3IntegrityAttestationIssueVerificationError);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });
});
