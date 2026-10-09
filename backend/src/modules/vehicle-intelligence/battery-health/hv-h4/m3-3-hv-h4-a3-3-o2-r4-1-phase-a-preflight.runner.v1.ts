import { Prisma, PrismaClient } from '@prisma/client';
import {
  getApprovedPhaseAQuerySqlV1,
  assertSingleApprovedStatementV1,
  type M3_3HvH4A3PhaseAQueryManifestIdV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import { redactPostgresDatabaseTargetV1, assertNoSecretsInReportPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import {
  formatPhaseAPreflightPublicErrorV1,
  sanitizePhaseAPreflightErrorV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.errors.v1';
import { evaluatePhaseAPreflightDatabaseAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.admission.v1';
import {
  commitPhaseAProductionApprovalConsumptionV1,
  evaluatePhaseAPreflightProductionAdmissionV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import { verifyPhaseAProductionTlsNegotiationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-probe.v1';
import { parsePhaseAProductionTargetSpecFromEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';
import {
  capturePhaseAProductionSessionIdentityV1,
  validatePhaseAProductionSessionIdentityAgainstSpecV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-session-identity.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1,
  type M3_3HvH4A3PhaseAPreflightCheckResultV1,
  type M3_3HvH4A3PhaseAPreflightReportV1,
  type M3_3HvH4A3PhaseAPreflightRunnerInputV1,
  type M3_3HvH4A3PhaseAPreflightRunnerOutcomeV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1';

const ATTESTATION_TABLE = 'battery_hv_charge_session_evidence_integrity_attestations';
const REVISION_TABLE = 'battery_hv_charge_session_evidence_revisions';
const ACK_TABLE = 'battery_hv_charge_session_evidence_acks';

export const M3_3_HV_H4_A3_PHASE_A_TRUSTED_FUNCTION_REGPROC_V1 = [
  'public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text)',
  'public.m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1()',
  'public.m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1()',
] as const;

const LOCK_FUNCTION_REGPROC = M3_3_HV_H4_A3_PHASE_A_TRUSTED_FUNCTION_REGPROC_V1[0];

const PHASE_A_CHECK_ORDER_V1 = [
  'PHASE_A_SESSION_CONTEXT',
  'PHASE_A_PGCRYPTO_STATUS',
  'PHASE_A_ROLE_DISCOVERY',
  'PHASE_A_MIGRATION_HISTORY',
  'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT',
  'PHASE_A_FUNCTION_OWNERSHIP_SNAPSHOT',
  'PHASE_A_EFFECTIVE_PRIVILEGES_IF_ROLES_EXIST',
] as const;

function assertSafeRoleNameV1(roleName: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(roleName)) {
    throw new Error('PHASE_A_INVALID_ROLE_NAME');
  }
}

async function runApprovedQueryV1<T>(
  tx: Prisma.TransactionClient,
  manifestId: M3_3HvH4A3PhaseAQueryManifestIdV1,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = getApprovedPhaseAQuerySqlV1(manifestId);
  assertSingleApprovedStatementV1(sql);
  return tx.$queryRawUnsafe<T[]>(sql, ...params);
}

function pushCheck(
  checks: M3_3HvH4A3PhaseAPreflightCheckResultV1[],
  check: M3_3HvH4A3PhaseAPreflightCheckResultV1,
): void {
  checks.push(check);
}

function orderChecksV1(
  checks: M3_3HvH4A3PhaseAPreflightCheckResultV1[],
): M3_3HvH4A3PhaseAPreflightCheckResultV1[] {
  const rank = new Map<string, number>();
  PHASE_A_CHECK_ORDER_V1.forEach((id, index) => rank.set(id, index));
  return [...checks].sort((a, b) => {
    const ar = rank.get(a.checkId) ?? 999;
    const br = rank.get(b.checkId) ?? 999;
    if (ar !== br) return ar - br;
    return a.detail?.localeCompare(b.detail ?? '') ?? 0;
  });
}

class PhaseATransactionGuardV1 {
  private aborted = false;

  assertActive(): void {
    if (this.aborted) {
      throw new Error('PHASE_A_TRANSACTION_ABORTED');
    }
  }

  markAborted(): void {
    this.aborted = true;
  }

  isAborted(): boolean {
    return this.aborted;
  }
}

export async function runM3_3HvH4A3PhaseAPreflightV1(
  input: M3_3HvH4A3PhaseAPreflightRunnerInputV1,
): Promise<M3_3HvH4A3PhaseAPreflightRunnerOutcomeV1> {
  const admissionPolicy = input.admissionPolicy ?? 'ISOLATED_R4_1_DEFAULT';
  let productionAdmissionEvidence:
    | M3_3HvH4A3PhaseAPreflightReportV1['productionAdmissionEvidence']
    | undefined;

  let productionAdmissionReady:
    | Extract<ReturnType<typeof evaluatePhaseAPreflightProductionAdmissionV1>, { ok: true }>
    | undefined;

  if (admissionPolicy === 'PRODUCTION_AUTHORIZED_R4_2A') {
    const productionAdmission = evaluatePhaseAPreflightProductionAdmissionV1(
      input.databaseUrl,
      process.env,
      { consumeApproval: false },
    );
    if (!productionAdmission.ok) {
      return { ok: false, reasonCode: productionAdmission.reasonCode, status: 'BLOCKED' };
    }
    productionAdmissionReady = productionAdmission;
    productionAdmissionEvidence = {
      admissionChannel: productionAdmission.evidence.admissionChannel,
      approvalId: productionAdmission.evidence.approvalId,
      changeTicket: productionAdmission.evidence.changeTicket,
      approvingAuthority: productionAdmission.evidence.approvingAuthority,
      authenticationKind: productionAdmission.evidence.authenticationKind,
      cryptographicAuthentication: false,
      operationStatus: 'ATTEMPTED',
      tlsIdentityCertified: false,
    };
  } else {
    const admission = evaluatePhaseAPreflightDatabaseAdmissionV1(input.databaseUrl, process.env);
    if (!admission.ok) {
      return { ok: false, reasonCode: admission.reasonCode, status: 'BLOCKED' };
    }
  }

  const queryTelemetryEnabled =
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY_ENV] === '1';
  let approvedQueryInvocations = 0;

  const client = new PrismaClient({
    datasources: { db: { url: input.databaseUrl } },
  });

  const checks: M3_3HvH4A3PhaseAPreflightCheckResultV1[] = [];
  let sessionIdentity: { sessionUser: string; currentUser: string } | undefined;
  let hadError = false;
  const txGuard = new PhaseATransactionGuardV1();

  let blockedBeforeTransaction: M3_3HvH4A3PhaseAPreflightRunnerOutcomeV1 | undefined;

  try {
    await client.$connect();

    if (admissionPolicy === 'PRODUCTION_AUTHORIZED_R4_2A' && productionAdmissionReady) {
      const specParsed = parsePhaseAProductionTargetSpecFromEnvV1(process.env);
      if (!specParsed.ok) {
        blockedBeforeTransaction = {
          ok: false,
          reasonCode: specParsed.reasonCode,
          status: 'BLOCKED',
        };
      } else {
        const tlsProbe = await verifyPhaseAProductionTlsNegotiationV1(client);
        if (!tlsProbe.ok) {
          blockedBeforeTransaction = {
            ok: false,
            reasonCode: tlsProbe.reasonCode,
            status: 'BLOCKED',
          };
        } else {
          const identity = await capturePhaseAProductionSessionIdentityV1(client);
          const identityOk = validatePhaseAProductionSessionIdentityAgainstSpecV1(
            identity,
            specParsed.spec,
          );
          if (!identityOk.ok) {
            blockedBeforeTransaction = {
              ok: false,
              reasonCode: identityOk.reasonCode,
              status: 'BLOCKED',
            };
          } else {
            sessionIdentity = {
              sessionUser: identity.sessionUser,
              currentUser: identity.currentUser,
            };
            const consumed = commitPhaseAProductionApprovalConsumptionV1(
              productionAdmissionReady,
              new Date(),
            );
            if (!consumed.ok) {
              blockedBeforeTransaction = {
                ok: false,
                reasonCode: consumed.reasonCode,
                status: 'BLOCKED',
              };
            } else if (productionAdmissionEvidence) {
              productionAdmissionEvidence = {
                ...productionAdmissionEvidence,
                operationStatus: 'ADMITTED',
                tlsIdentityCertified: true,
                executeConsumedAt: consumed.executeConsumedAt,
              };
            }
          }
        }
      }
    }

    if (blockedBeforeTransaction) {
      return blockedBeforeTransaction;
    }

    await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

        const runQuery = async <T>(
          manifestId: M3_3HvH4A3PhaseAQueryManifestIdV1,
          params: unknown[] = [],
        ): Promise<T[]> => {
          txGuard.assertActive();
          try {
            const rows = await runApprovedQueryV1<T>(tx, manifestId, params);
            if (queryTelemetryEnabled) approvedQueryInvocations += 1;
            return rows;
          } catch (error) {
            if (queryTelemetryEnabled) approvedQueryInvocations += 1;
            txGuard.markAborted();
            throw error;
          }
        };

        const sessionRows = await runQuery<{
          session_user: string;
          current_user: string;
        }>('SESSION_CONTEXT');
        const sessionRow = sessionRows[0];
        if (!sessionRow?.session_user || !sessionRow.current_user) {
          hadError = true;
          pushCheck(checks, {
            checkId: 'PHASE_A_SESSION_CONTEXT',
            status: 'ERROR',
            detail: 'SESSION_IDENTITY_UNAVAILABLE',
          });
        } else {
          sessionIdentity = {
            sessionUser: sessionRow.session_user,
            currentUser: sessionRow.current_user,
          };
          pushCheck(checks, {
            checkId: 'PHASE_A_SESSION_CONTEXT',
            status: 'PASS',
            data: sessionIdentity,
          });
        }

        if (txGuard.isAborted()) return;

        const pgcryptoRows = await runQuery<{
          extname: string;
          extversion: string;
          extension_owner: string;
        }>('PGCRYPTO_STATUS');
        if (pgcryptoRows.length === 0) {
          pushCheck(checks, {
            checkId: 'PHASE_A_PGCRYPTO_STATUS',
            status: 'NOT_PRESENT',
            detail: 'PGCRYPTO_NOT_INSTALLED',
          });
        } else {
          pushCheck(checks, {
            checkId: 'PHASE_A_PGCRYPTO_STATUS',
            status: 'PASS',
            data: pgcryptoRows[0],
          });
        }

        for (const [roleKey, roleName] of Object.entries(input.roleNames)) {
          if (txGuard.isAborted()) return;
          assertSafeRoleNameV1(roleName);
          const roleRows = await runQuery<{
            rolname: string;
            rolcanlogin: boolean;
            rolsuper: boolean;
            rolcreaterole: boolean;
          }>('ROLE_BY_NAME', [roleName]);
          if (roleRows.length === 0) {
            pushCheck(checks, {
              checkId: 'PHASE_A_ROLE_DISCOVERY',
              status: 'NOT_PROVISIONED',
              detail: roleKey,
              data: { roleName },
            });
          } else {
            pushCheck(checks, {
              checkId: 'PHASE_A_ROLE_DISCOVERY',
              status: 'PASS',
              detail: roleKey,
              data: roleRows[0],
            });
          }
        }

        if (txGuard.isAborted()) return;

        const prismaMigrationsReg = await runQuery<{ regclass_name: string | null }>(
          'REGCLASS_PRISMA_MIGRATIONS',
        );
        const migrationsPresent = Boolean(prismaMigrationsReg[0]?.regclass_name);
        if (!migrationsPresent) {
          pushCheck(checks, {
            checkId: 'PHASE_A_MIGRATION_HISTORY',
            status: 'NOT_PRESENT',
            detail: '_prisma_migrations',
          });
        } else {
          try {
            const migrations = await runQuery<{ migration_name: string; applied: boolean }>(
              'MIGRATION_HISTORY_ATTESTATION',
            );
            pushCheck(checks, {
              checkId: 'PHASE_A_MIGRATION_HISTORY',
              status: 'PASS',
              data: { rows: migrations },
            });
          } catch (error) {
            hadError = true;
            const sanitized = sanitizePhaseAPreflightErrorV1(error);
            pushCheck(checks, {
              checkId: 'PHASE_A_MIGRATION_HISTORY',
              status: 'ERROR',
              detail: sanitized.reasonCode,
              data: sanitized.sqlState ? { sqlState: sanitized.sqlState } : undefined,
            });
            return;
          }
        }

        if (txGuard.isAborted()) return;

        for (const tableName of [ATTESTATION_TABLE, REVISION_TABLE, ACK_TABLE]) {
          if (txGuard.isAborted()) return;
          const manifestId =
            tableName === ATTESTATION_TABLE
              ? 'REGCLASS_ATTESTATION_TABLE'
              : tableName === REVISION_TABLE
                ? 'REGCLASS_REVISION_TABLE'
                : 'REGCLASS_ACK_TABLE';
          const reg = await runQuery<{ regclass_name: string | null }>(manifestId);
          if (!reg[0]?.regclass_name) {
            pushCheck(checks, {
              checkId: 'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT',
              status: 'NOT_PRESENT',
              data: { tableName },
            });
            continue;
          }
          const owners = await runQuery<{ table_name: string; owner: string }>('TABLE_OWNER', [
            'public',
            tableName,
          ]);
          pushCheck(checks, {
            checkId: 'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT',
            status: 'PASS',
            data: owners[0] ?? { tableName },
          });
        }

        if (txGuard.isAborted()) return;

        for (const regprocSignature of M3_3_HV_H4_A3_PHASE_A_TRUSTED_FUNCTION_REGPROC_V1) {
          if (txGuard.isAborted()) return;
          const ownerRows = await runQuery<{ regproc_signature: string; owner: string }>(
            'FUNCTION_OWNER_BY_REGPROC',
            [regprocSignature],
          );
          pushCheck(checks, {
            checkId: 'PHASE_A_FUNCTION_OWNERSHIP_SNAPSHOT',
            status: ownerRows.length ? 'PASS' : 'NOT_PRESENT',
            data: ownerRows[0] ?? { regprocSignature },
          });
        }

        if (txGuard.isAborted()) return;

        const appRole = input.roleNames.generalAppRuntime;
        assertSafeRoleNameV1(appRole);
        const appRoleRows = await runQuery('ROLE_BY_NAME', [appRole]);
        const attestationReg = await runQuery<{ regclass_name: string | null }>(
          'REGCLASS_ATTESTATION_TABLE',
        );
        if (appRoleRows.length === 0 || !attestationReg[0]?.regclass_name) {
          pushCheck(checks, {
            checkId: 'PHASE_A_EFFECTIVE_PRIVILEGES_IF_ROLES_EXIST',
            status: 'SKIPPED',
            detail: 'ROLE_OR_TABLE_NOT_PRESENT',
          });
        } else {
          const regclass = attestationReg[0].regclass_name!;
          const privileges: Record<string, boolean> = {};
          for (const priv of ['INSERT', 'UPDATE', 'DELETE'] as const) {
            const rows = await runQuery<{ allowed: boolean }>('HAS_TABLE_PRIVILEGE', [
              appRole,
              regclass,
              priv,
            ]);
            privileges[`app_${priv.toLowerCase()}_attestation`] = rows[0]?.allowed === true;
          }
          const lockExists = await runQuery<{ function_exists: boolean }>('FUNCTION_EXISTS', [
            LOCK_FUNCTION_REGPROC,
          ]);
          if (lockExists[0]?.function_exists) {
            const execRows = await runQuery<{ allowed: boolean }>('HAS_FUNCTION_PRIVILEGE', [
              appRole,
              LOCK_FUNCTION_REGPROC,
              'EXECUTE',
            ]);
            privileges.app_execute_lock = execRows[0]?.allowed === true;
          }
          pushCheck(checks, {
            checkId: 'PHASE_A_EFFECTIVE_PRIVILEGES_IF_ROLES_EXIST',
            status: 'PASS',
            data: privileges,
          });
        }
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    const sanitized = sanitizePhaseAPreflightErrorV1(error);
    return {
      ok: false,
      reasonCode: formatPhaseAPreflightPublicErrorV1(sanitized),
      status: 'ERROR',
    };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }

  const orderedChecks = orderChecksV1(checks);
  const discoveryComplete = !hadError && !checks.some((c) => c.status === 'ERROR');

  const summary: string[] = [];
  summary.push(`phase=PRE_PROVISION_READ_ONLY checks=${orderedChecks.length}`);
  summary.push('discovery_complete=' + (discoveryComplete ? 'YES' : 'NO'));
  summary.push('phase_b_certified=NOT_CERTIFIED');
  summary.push('security_certified=NOT_CERTIFIED');
  if (orderedChecks.some((c) => c.status === 'NOT_PROVISIONED')) {
    summary.push('roles=NOT_PROVISIONED_PRESENT');
  }
  if (orderedChecks.some((c) => c.status === 'NOT_PRESENT')) {
    summary.push('objects=NOT_PRESENT');
  }

  const report: M3_3HvH4A3PhaseAPreflightReportV1 = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1,
    phase: 'PRE_PROVISION_READ_ONLY',
    executedAt: new Date().toISOString(),
    databaseTargetRedacted: redactPostgresDatabaseTargetV1(input.databaseUrl),
    sessionIdentity,
    checks: orderedChecks,
    phaseADiscoveryComplete: discoveryComplete,
    phaseAExecutionComplete: discoveryComplete,
    phaseBCertified: false,
    phaseBCertificationStatus: 'NOT_CERTIFIED',
    productionCertification: 'NOT_CERTIFIED',
    securityCertification: 'NOT_CERTIFIED',
    summary,
    ...(queryTelemetryEnabled
      ? { testDiagnostics: { approvedQueryInvocations } }
      : {}),
    ...(productionAdmissionEvidence
      ? {
          productionAdmissionEvidence: {
            ...productionAdmissionEvidence,
            operationStatus: 'COMPLETED',
          },
        }
      : {}),
  };

  assertNoSecretsInReportPayloadV1(report);

  return { ok: true, report };
}

export const M3_3_HV_H4_A3_PHASE_A_READ_ONLY_MUTATION_SQLSTATE_V1 = '25006' as const;

export type M3_3HvH4A3PhaseAPreflightReadOnlyProbeResultV1 =
  | { ok: true; enforced: true; sqlState: typeof M3_3_HV_H4_A3_PHASE_A_READ_ONLY_MUTATION_SQLSTATE_V1 }
  | { ok: false; enforced: false; reasonCode: string; sqlState?: string };

/** Proves READ ONLY transaction rejects mutations with SQLSTATE 25006. */
export async function assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1(
  databaseUrl: string,
): Promise<M3_3HvH4A3PhaseAPreflightReadOnlyProbeResultV1> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await client.$connect();
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE phase_a_readonly_probe(id int)');
    });
    return { ok: false, enforced: false, reasonCode: 'PHASE_A_READ_ONLY_NOT_ENFORCED' };
  } catch (error) {
    const sanitized = sanitizePhaseAPreflightErrorV1(error);
    if (sanitized.sqlState === M3_3_HV_H4_A3_PHASE_A_READ_ONLY_MUTATION_SQLSTATE_V1) {
      return {
        ok: true,
        enforced: true,
        sqlState: M3_3_HV_H4_A3_PHASE_A_READ_ONLY_MUTATION_SQLSTATE_V1,
      };
    }
    return {
      ok: false,
      enforced: false,
      reasonCode: sanitized.reasonCode,
      sqlState: sanitized.sqlState,
    };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
