import type { M3_3HvH4A3PhaseAProductionTargetSpecV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import type { PhaseAProductionSqlQueryableV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-identity.v1';

export type PhaseAProductionSessionIdentitySnapshotV1 = {
  sessionUser: string;
  currentUser: string;
  currentDatabase: string;
  serverAddr: string | null;
  serverPort: number | null;
  isSuperuser: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolbypassrls: boolean;
};

export async function capturePhaseAProductionSessionIdentityV1(
  client: PhaseAProductionSqlQueryableV1,
): Promise<PhaseAProductionSessionIdentitySnapshotV1> {
  const rows = await client.$queryRawUnsafe<
    Array<{
      session_user: string;
      current_user: string;
      current_database: string;
      server_addr: string | null;
      server_port: number | null;
    }>
  >(
    `SELECT session_user::text, current_user::text, current_database()::text,
            inet_server_addr()::text AS server_addr,
            inet_server_port() AS server_port`,
  );

  const row = rows[0];
  const currentUser = row?.current_user ?? '';

  const roleRows = await client.$queryRawUnsafe<
    Array<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean }>
  >(
    `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );
  const role = roleRows[0];

  return {
    sessionUser: row?.session_user ?? '',
    currentUser,
    currentDatabase: row?.current_database ?? '',
    serverAddr: row?.server_addr,
    serverPort: row?.server_port ?? null,
    isSuperuser: Boolean(role?.rolsuper),
    rolcreaterole: Boolean(role?.rolcreaterole),
    rolcreatedb: Boolean(role?.rolcreatedb),
    rolbypassrls: Boolean(role?.rolbypassrls),
  };
}

export function validatePhaseAProductionSessionIdentityAgainstSpecV1(
  identity: PhaseAProductionSessionIdentitySnapshotV1,
  spec: M3_3HvH4A3PhaseAProductionTargetSpecV1,
): { ok: true } | { ok: false; reasonCode: string } {
  if (identity.currentUser !== spec.expectedAuditLogin) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_LOGIN_MISMATCH' };
  }
  if (identity.sessionUser !== spec.expectedAuditLogin) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_USER_MISMATCH' };
  }
  if (identity.currentDatabase !== spec.database) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SESSION_DATABASE_MISMATCH' };
  }
  if (spec.forbidSuperuserSession !== true) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_FORBID_SUPERUSER_REQUIRED' };
  }
  if (identity.isSuperuser) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_SUPERUSER_SESSION_FORBIDDEN' };
  }
  if (identity.rolcreaterole || identity.rolcreatedb || identity.rolbypassrls) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_ADMIN_PRIVILEGE_FORBIDDEN' };
  }
  return { ok: true };
}
