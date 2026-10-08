import { PrismaClient } from '@prisma/client';

/** CI-only role names mirroring intended production separation (not production-certified). */
export const M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE = 'm3_3_hv_h4_a3_r2_app_restricted';
export const M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE = 'm3_3_hv_h4_a3_r2_attestation_issuer';

const ATTESTATION_TABLE = 'public.battery_hv_charge_session_evidence_integrity_attestations';
const REVISION_TABLE = 'public.battery_hv_charge_session_evidence_revisions';
const ACK_TABLE = 'public.battery_hv_charge_session_evidence_acks';

export async function ensureM3_3HvH4A3O2R2PostgresRolesV1(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE ROLE ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE} NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE ROLE ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE} NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`);

  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `REVOKE INSERT, UPDATE, DELETE ON ${ATTESTATION_TABLE} FROM ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT UPDATE ON ${REVISION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(`GRANT UPDATE ON ${ACK_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`);

  await prisma.$executeRawUnsafe(
    `GRANT SELECT ON ${REVISION_TABLE}, ${ACK_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
  );
  await prisma.$executeRawUnsafe(`GRANT INSERT ON ${ATTESTATION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`);
  await prisma.$executeRawUnsafe(
    `REVOKE INSERT, UPDATE, DELETE ON ${REVISION_TABLE}, ${ACK_TABLE} FROM ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
  );

  await prisma.$executeRawUnsafe(
    `GRANT ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE} TO CURRENT_USER`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE} TO CURRENT_USER`,
  );

  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) FROM ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
  );
}

/** CI/admin session may SET ROLE; production topology not certified. */
export async function createDedicatedPostgresSessionClientV1(role: string): Promise<PrismaClient> {
  const client = new PrismaClient();
  await client.$connect();
  await client.$executeRawUnsafe(`SET ROLE ${role}`);
  return client;
}

export async function withPostgresRoleV1<T>(
  prisma: PrismaClient,
  role: string,
  fn: () => Promise<T>,
): Promise<T> {
  await prisma.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`RESET ROLE`);
  }
}
