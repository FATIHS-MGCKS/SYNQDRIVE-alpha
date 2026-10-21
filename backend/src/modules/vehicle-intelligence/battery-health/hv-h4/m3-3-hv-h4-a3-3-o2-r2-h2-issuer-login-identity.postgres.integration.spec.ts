import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  createIssuerLoginPostgresClientV1,
  createRestrictedAppLoginPostgresClientV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE,
  M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE,
  M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
  readPostgresSessionIdentityV1,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

const ATTESTATION_TABLE = 'public.battery_hv_charge_session_evidence_integrity_attestations';
const REVISION_TABLE = 'public.battery_hv_charge_session_evidence_revisions';
const ACK_TABLE = 'public.battery_hv_charge_session_evidence_acks';
const LOCK_FN = 'public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text)';

describe('M3.3-HV-H4-A3.3-O2-R2-H2 issuer/app login identity (PostgreSQL)', () => {
  let admin: PrismaClient;
  let appDb: PrismaClient | undefined;
  let issuerDb: Awaited<ReturnType<typeof createIssuerLoginPostgresClientV1>>;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
    appDb = await createRestrictedAppLoginPostgresClientV1();
    issuerDb = await createIssuerLoginPostgresClientV1();
    if (!appDb || !issuerDb) {
      throw new Error('O2-R2-H2: failed to create dedicated login PostgreSQL clients');
    }
  });

  afterAll(async () => {
    await issuerDb?.$disconnect();
    await appDb?.$disconnect();
    await admin?.$disconnect();
  });

  it('session identity: app and issuer logins are distinct non-superusers', async () => {
    if (!appDb || !issuerDb) return;
    const app = await readPostgresSessionIdentityV1(appDb);
    const issuer = await readPostgresSessionIdentityV1(issuerDb);
    expect(app.sessionUser).toBe(M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE);
    expect(app.currentUser).toBe(M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE);
    expect(issuer.sessionUser).toBe(M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE);
    expect(issuer.currentUser).toBe(M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE);
    expect(app.rolsuper).toBe(false);
    expect(issuer.rolsuper).toBe(false);
    expect(app.rolcreaterole).toBe(false);
    expect(issuer.rolcreaterole).toBe(false);
  });

  it('app login cannot SET ROLE to trusted issuer', async () => {
    if (!appDb) return;
    await expect(appDb.$executeRawUnsafe(`SET ROLE ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`)).rejects.toThrow();
  });

  it('app login is not a member of trusted issuer role', async () => {
    if (!admin) return;
    const rows = await admin.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_auth_members m
      JOIN pg_roles issuer ON issuer.oid = m.roleid
      JOIN pg_roles member ON member.oid = m.member
      WHERE issuer.rolname = ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}
        AND member.rolname = ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE}
    `;
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it('privileges: app denied attestation INSERT and lock EXECUTE; issuer allowed', async () => {
    if (!appDb || !issuerDb) return;
    const appInsert = await appDb.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_table_privilege(current_user, ${ATTESTATION_TABLE}, 'INSERT') AS ok
    `;
    const issuerInsert = await issuerDb.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_table_privilege(current_user, ${ATTESTATION_TABLE}, 'INSERT') AS ok
    `;
    const appLock = await appDb.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_function_privilege(current_user, ${LOCK_FN}, 'EXECUTE') AS ok
    `;
    const issuerLock = await issuerDb.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_function_privilege(current_user, ${LOCK_FN}, 'EXECUTE') AS ok
    `;
    expect(appInsert[0]?.ok).toBe(false);
    expect(issuerInsert[0]?.ok).toBe(true);
    expect(appLock[0]?.ok).toBe(false);
    expect(issuerLock[0]?.ok).toBe(true);
  });

  it('privileges: issuer cannot UPDATE revision or ACK directly', async () => {
    if (!issuerDb) return;
    const revisionUpdate = await issuerDb.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_table_privilege(current_user, ${REVISION_TABLE}, 'UPDATE') AS ok
    `;
    const ackUpdate = await issuerDb.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_table_privilege(current_user, ${ACK_TABLE}, 'UPDATE') AS ok
    `;
    expect(revisionUpdate[0]?.ok).toBe(false);
    expect(ackUpdate[0]?.ok).toBe(false);
  });

  it('H2-C8: generic app cannot issue via direct INSERT or lock function', async () => {
    if (!admin || !appDb) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    await expect(
      appDb.$queryRaw`
        SELECT public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(${revision.id}::text)
      `,
    ).rejects.toMatchObject({ code: 'P2010' });
    await expect(
      appDb.$executeRawUnsafe(`
        INSERT INTO ${ATTESTATION_TABLE} (id, revision_id, durability_ack_id, organization_id, vehicle_id, segment_fingerprint,
          evidence_contract_version, source_revision_fingerprint, durability_ack_contract_version,
          integrity_attestation_contract_version, attested_at, created_at)
        VALUES (gen_random_uuid()::text, '${revision.id}', '${ackId}', '${revision.organizationId}', '${revision.vehicleId}',
          '${revision.segmentFingerprint}', '${revision.evidenceContractVersion}', '${revision.sourceRevisionFingerprint}',
          'M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1', 'M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1', NOW(), NOW())
      `),
    ).rejects.toThrow();
  });
});
