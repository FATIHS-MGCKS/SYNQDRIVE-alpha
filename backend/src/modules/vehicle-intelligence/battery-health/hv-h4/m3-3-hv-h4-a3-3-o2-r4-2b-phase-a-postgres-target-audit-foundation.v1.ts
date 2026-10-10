import {
  parsePostgresTargetEvidenceV1,
  verifyPostgresTargetEvidenceOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-postgres-target-evidence.v1';
import type { M3_3HvH4A3GovernanceTrustStoreV1, M3_3HvH4A3PostgresTargetEvidenceV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

export const M3_3_HV_H4_A3_POSTGRES_CATALOG_AUDIT_SNAPSHOT_CONTRACT_V1 =
  'M3_3_HV_H4_A3_POSTGRES_CATALOG_AUDIT_SNAPSHOT_V1' as const;

export type M3_3HvH4A3PostgresRoleCatalogRowV1 = {
  rolname: string;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
};

export type M3_3HvH4A3PostgresCatalogAuditSnapshotV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_POSTGRES_CATALOG_AUDIT_SNAPSHOT_CONTRACT_V1;
  hostname: string;
  port: number;
  database: string;
  tlsMode: 'verify-full';
  trustedCaConfigured: true;
  auditRoleLogin: string;
  applicationRoleLogin: string;
  migrationOwnerRoleLogin: string;
  issuerCredentialDistinctFromApplication: true;
  roles: M3_3HvH4A3PostgresRoleCatalogRowV1[];
  roleMemberships: Array<{ role: string; member: string }>;
  schemaOwners: Array<{ schema: string; owner: string }>;
};

export type M3_3HvH4A3PostgresTargetAuditFoundationResultV1 =
  | {
      ok: true;
      verificationStatus: 'TARGET_CONFIGURATION_MATCHED';
      liveDatabaseRoleVerified: false;
      catalogAuditPassed: true;
      productionConnectionAttempted: false;
    }
  | { ok: false; reasonCode: string; liveDatabaseRoleVerified: false; productionConnectionAttempted: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePostgresCatalogAuditSnapshotV1(
  parsed: unknown,
): { ok: true; snapshot: M3_3HvH4A3PostgresCatalogAuditSnapshotV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_POSTGRES_CATALOG_AUDIT_SNAPSHOT_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_CATALOG_SNAPSHOT_INVALID' };
  }
  if (parsed.tlsMode !== 'verify-full' || parsed.trustedCaConfigured !== true) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TLS_POLICY_MISMATCH' };
  }
  if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_CATALOG_SNAPSHOT_INVALID' };
  }
  return { ok: true, snapshot: parsed as M3_3HvH4A3PostgresCatalogAuditSnapshotV1 };
}

function auditRoleHasForbiddenPrivileges(role: M3_3HvH4A3PostgresRoleCatalogRowV1): boolean {
  return role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls;
}

export function verifyPostgresTargetAuditFromMockCatalogV1(input: {
  trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
  evidence: M3_3HvH4A3PostgresTargetEvidenceV1;
  catalogSnapshot: M3_3HvH4A3PostgresCatalogAuditSnapshotV1;
  now: Date;
  seenEvidenceNonces?: Set<string>;
}): M3_3HvH4A3PostgresTargetAuditFoundationResultV1 {
  const snap = input.catalogSnapshot;
  if (
    snap.hostname !== input.evidence.hostname ||
    snap.port !== input.evidence.port ||
    snap.database !== input.evidence.database ||
    snap.auditRoleLogin !== input.evidence.auditRoleLogin
  ) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_IMPERSONATION_REJECTED', liveDatabaseRoleVerified: false, productionConnectionAttempted: false };
  }

  const auditRole = snap.roles.find((r) => r.rolname === snap.auditRoleLogin);
  if (!auditRole) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_AUDIT_ROLE_NOT_IN_CATALOG', liveDatabaseRoleVerified: false, productionConnectionAttempted: false };
  }
  if (auditRoleHasForbiddenPrivileges(auditRole)) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_AUDIT_ROLE_PRIVILEGED', liveDatabaseRoleVerified: false, productionConnectionAttempted: false };
  }

  const escalations = snap.roleMemberships.filter((m) => m.member === snap.auditRoleLogin);
  for (const membership of escalations) {
    const inherited = snap.roles.find((r) => r.rolname === membership.role);
    if (inherited && auditRoleHasForbiddenPrivileges(inherited)) {
      return { ok: false, reasonCode: 'PHASE_A_POSTGRES_AUDIT_ROLE_MEMBERSHIP_ESCALATION', liveDatabaseRoleVerified: false, productionConnectionAttempted: false };
    }
  }

  const offline = verifyPostgresTargetEvidenceOfflineV1({
    trustStore: input.trustStore,
    evidence: input.evidence,
    expected: {
      hostname: snap.hostname,
      port: snap.port,
      database: snap.database,
      auditRoleLogin: snap.auditRoleLogin,
    },
    now: input.now,
    seenEvidenceNonces: input.seenEvidenceNonces,
  });
  if (!offline.ok) {
    return { ok: false, reasonCode: offline.reasonCode, liveDatabaseRoleVerified: false, productionConnectionAttempted: false };
  }

  return {
    ok: true,
    verificationStatus: 'TARGET_CONFIGURATION_MATCHED',
    liveDatabaseRoleVerified: false,
    catalogAuditPassed: true,
    productionConnectionAttempted: false,
  };
}

export { parsePostgresTargetEvidenceV1 };
