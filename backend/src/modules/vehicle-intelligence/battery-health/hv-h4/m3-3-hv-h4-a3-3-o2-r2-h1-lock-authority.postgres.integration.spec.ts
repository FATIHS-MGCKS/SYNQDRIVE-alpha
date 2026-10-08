import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  createDedicatedPostgresSessionClientV1,
  createRestrictedAppLoginPostgresClientV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE,
  M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

describe('M3.3-HV-H4-A3.3-O2-R2-H1 issuer lock authority (PostgreSQL)', () => {
  let admin: PrismaClient;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
  });

  afterAll(async () => {
    await admin?.$disconnect();
  });

  it('issuer SELECT-only: direct FOR UPDATE on revision is rejected', async () => {
    if (!admin) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    const issuer = await createDedicatedPostgresSessionClientV1(M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE);
    try {
      await expect(
        issuer.$queryRaw`
          SELECT 1
          FROM public.battery_hv_charge_session_evidence_revisions
          WHERE id = ${revision.id}::text
          FOR UPDATE
        `,
      ).rejects.toMatchObject({ code: 'P2010' });
    } finally {
      await issuer.$disconnect();
    }
  });

  it('issuer SELECT-only: SECURITY DEFINER lock function acquires row locks', async () => {
    if (!admin) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    const issuer = await createDedicatedPostgresSessionClientV1(M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE);
    try {
      await issuer.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(${revision.id}::text) AS ok
        `;
      });
    } finally {
      await issuer.$disconnect();
    }
  });

  it('CI admin session can SET ROLE (not production isolation proof)', async () => {
    if (!admin) return;
    await expect(admin.$executeRawUnsafe(`SET ROLE ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`)).resolves.toBeDefined();
    await admin.$executeRawUnsafe('RESET ROLE');
  });

  it('restricted app login cannot SET ROLE to issuer (non-superuser session)', async () => {
    if (!admin) return;
    const app = await createRestrictedAppLoginPostgresClientV1();
    if (!app) return;
    try {
      await expect(app.$executeRawUnsafe(`SET ROLE ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`)).rejects.toThrow();
    } finally {
      await app.$disconnect();
    }
  });

  it('issuer role is not granted to restricted app role (membership)', async () => {
    if (!admin) return;
    const rows = await admin.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_auth_members m
      JOIN pg_roles issuer ON issuer.oid = m.roleid
      JOIN pg_roles member ON member.oid = m.member
      WHERE issuer.rolname = ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}
        AND member.rolname = ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}
    `;
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it('restricted app cannot EXECUTE issuance lock function', async () => {
    if (!admin) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(admin, vector.projection);
    const app = await createDedicatedPostgresSessionClientV1(M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE);
    try {
      await expect(
        app.$queryRaw`
          SELECT public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(${revision.id}::text)
        `,
      ).rejects.toMatchObject({ code: 'P2010' });
    } finally {
      await app.$disconnect();
    }
  });
});
