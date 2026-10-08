import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  buildIssuerLoginDatabaseUrlForCiV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';
import {
  createInertM3_3HvH4A3AttestationIssuerDbV1,
  disconnectInertM3_3HvH4A3AttestationIssuerDbV1,
} from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

describe('M3.3-HV-H4-A3.3-O2-R3 inert issuer factory (PostgreSQL)', () => {
  it('verifies issuer-login identity via dedicated URL (not DATABASE_URL alias)', async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;

    const admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
    const issuerDatabaseUrl = buildIssuerLoginDatabaseUrlForCiV1();
    if (!issuerDatabaseUrl) {
      await admin.$disconnect();
      return;
    }

    const issuerDb = await createInertM3_3HvH4A3AttestationIssuerDbV1({
      issuerDatabaseUrl,
      forbidSameUrlAs: process.env.DATABASE_URL,
      expectedDbLogin: M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE,
    });

    const identity = await issuerDb.$queryRaw<Array<{ session_user: string }>>`
      SELECT session_user::text AS session_user
    `;
    expect(identity[0]?.session_user).toBe(M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE);

    await disconnectInertM3_3HvH4A3AttestationIssuerDbV1(issuerDb);
    await admin.$disconnect();
  });
});
