import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import {
  issueM3_3HvH4A3IntegrityAttestationWithAdmissionV1,
  M3_3HvH4A3IssuerAdmissionScopeMismatchError,
} from './m3-3-hv-h4-a3-3-o2-r3-issuer-admission.authority.v1';
import {
  createIssuerLoginPostgresClientV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

describe('M3.3-HV-H4-A3.3-O2-R3 issuer admission (PostgreSQL)', () => {
  let admin: PrismaClient;
  let issuerDb: Awaited<ReturnType<typeof createIssuerLoginPostgresClientV1>>;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
    issuerDb = await createIssuerLoginPostgresClientV1();
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

  it('rejects admitted issuance when caller organization does not match revision', async () => {
    if (!admin || !issuerDb) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    await expect(
      issueM3_3HvH4A3IntegrityAttestationWithAdmissionV1(issuerDb, {
        organizationId: 'wrong-org',
        vehicleId: revision.vehicleId,
        revisionId: revision.id,
        requestedBy: 'test:admission',
        correlationId: 'admission-scope-1',
      }),
    ).rejects.toThrow(M3_3HvH4A3IssuerAdmissionScopeMismatchError);
  });

  it('issues when admission scope matches revision row', async () => {
    if (!admin || !issuerDb) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    const result = await issueM3_3HvH4A3IntegrityAttestationWithAdmissionV1(issuerDb, {
      organizationId: revision.organizationId,
      vehicleId: revision.vehicleId,
      revisionId: revision.id,
      requestedBy: 'test:admission',
      correlationId: 'admission-ok-1',
    });
    expect(result.attestationId).toBeTruthy();
  });
});
