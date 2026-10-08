import { Prisma, PrismaClient } from '@prisma/client';
import {
  getApprovedPhaseAQuerySqlV1,
  assertSingleApprovedStatementV1,
  type M3_3HvH4A3PhaseAQueryManifestIdV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import { redactPostgresDatabaseTargetV1, assertNoSecretsInReportPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
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
const LOCK_FUNCTION_REGPROC = 'public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text)';
const TRUSTED_FUNCTION_NAMES = [
  'm3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1',
  'm3_3_hv_h4_a3_invalidate_attestations_for_revision_v1',
  'm3_3_hv_h4_a3_invalidate_attestations_for_ack_v1',
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

export async function runM3_3HvH4A3PhaseAPreflightV1(
  input: M3_3HvH4A3PhaseAPreflightRunnerInputV1,
): Promise<M3_3HvH4A3PhaseAPreflightRunnerOutcomeV1> {
  const client = new PrismaClient({
    datasources: { db: { url: input.databaseUrl } },
  });

  const checks: M3_3HvH4A3PhaseAPreflightCheckResultV1[] = [];
  let sessionIdentity: { sessionUser: string; currentUser: string } | undefined;
  let hadError = false;

  try {
    await client.$connect();
    await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

        const sessionRows = await runApprovedQueryV1<{
          session_user: string;
          current_user: string;
        }>(tx, 'SESSION_CONTEXT');
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

        const pgcryptoRows = await runApprovedQueryV1<{
          extname: string;
          extversion: string;
          extension_owner: string;
        }>(tx, 'PGCRYPTO_STATUS');
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
          assertSafeRoleNameV1(roleName);
          const roleRows = await runApprovedQueryV1<{
            rolname: string;
            rolcanlogin: boolean;
            rolsuper: boolean;
            rolcreaterole: boolean;
          }>(tx, 'ROLE_BY_NAME', [roleName]);
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

        const prismaMigrationsReg = await runApprovedQueryV1<{ regclass_name: string | null }>(
          tx,
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
            const migrations = await runApprovedQueryV1<{ migration_name: string; applied: boolean }>(
              tx,
              'MIGRATION_HISTORY_ATTESTATION',
            );
            pushCheck(checks, {
              checkId: 'PHASE_A_MIGRATION_HISTORY',
              status: 'PASS',
              data: { rows: migrations },
            });
          } catch (error) {
            hadError = true;
            pushCheck(checks, {
              checkId: 'PHASE_A_MIGRATION_HISTORY',
              status: 'ERROR',
              detail: error instanceof Error ? error.message : 'MIGRATION_QUERY_FAILED',
            });
          }
        }

        for (const tableName of [ATTESTATION_TABLE, REVISION_TABLE, ACK_TABLE]) {
          const manifestId =
            tableName === ATTESTATION_TABLE
              ? 'REGCLASS_ATTESTATION_TABLE'
              : tableName === REVISION_TABLE
                ? 'REGCLASS_REVISION_TABLE'
                : 'REGCLASS_ACK_TABLE';
          const reg = await runApprovedQueryV1<{ regclass_name: string | null }>(tx, manifestId);
          if (!reg[0]?.regclass_name) {
            pushCheck(checks, {
              checkId: 'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT',
              status: 'NOT_PRESENT',
              data: { tableName },
            });
            continue;
          }
          const owners = await runApprovedQueryV1<{ table_name: string; owner: string }>(
            tx,
            'TABLE_OWNER',
            ['public', tableName],
          );
          pushCheck(checks, {
            checkId: 'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT',
            status: 'PASS',
            data: owners[0] ?? { tableName },
          });
        }

        for (const functionName of TRUSTED_FUNCTION_NAMES) {
          const ownerRows = await runApprovedQueryV1<{ function_name: string; owner: string }>(
            tx,
            'FUNCTION_OWNER',
            ['public', functionName],
          );
          pushCheck(checks, {
            checkId: 'PHASE_A_FUNCTION_OWNERSHIP_SNAPSHOT',
            status: ownerRows.length ? 'PASS' : 'NOT_PRESENT',
            data: ownerRows[0] ?? { functionName },
          });
        }

        const appRole = input.roleNames.generalAppRuntime;
        assertSafeRoleNameV1(appRole);
        const appRoleRows = await runApprovedQueryV1(tx, 'ROLE_BY_NAME', [appRole]);
        const attestationReg = await runApprovedQueryV1<{ regclass_name: string | null }>(
          tx,
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
            const rows = await runApprovedQueryV1<{ allowed: boolean }>(tx, 'HAS_TABLE_PRIVILEGE', [
              appRole,
              regclass,
              priv,
            ]);
            privileges[`app_${priv.toLowerCase()}_attestation`] = rows[0]?.allowed === true;
          }
          const lockExists = await runApprovedQueryV1<{ function_exists: boolean }>(
            tx,
            'FUNCTION_EXISTS',
            [LOCK_FUNCTION_REGPROC],
          );
          if (lockExists[0]?.function_exists) {
            const execRows = await runApprovedQueryV1<{ allowed: boolean }>(
              tx,
              'HAS_FUNCTION_PRIVILEGE',
              [appRole, LOCK_FUNCTION_REGPROC, 'EXECUTE'],
            );
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
    await client.$disconnect().catch(() => undefined);
    return {
      ok: false,
      reasonCode: error instanceof Error ? error.message : 'PHASE_A_RUNNER_FAILED',
      status: 'ERROR',
    };
  }

  await client.$disconnect();

  const summary: string[] = [];
  summary.push(`phase=PRE_PROVISION_READ_ONLY checks=${checks.length}`);
  summary.push(`phase_b_certified=NOT_CERTIFIED`);
  if (checks.some((c) => c.status === 'NOT_PROVISIONED')) {
    summary.push('roles=NOT_PROVISIONED_PRESENT');
  }
  if (checks.some((c) => c.status === 'NOT_PRESENT')) {
    summary.push('objects=NOT_PRESENT');
  }

  const report: M3_3HvH4A3PhaseAPreflightReportV1 = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1,
    phase: 'PRE_PROVISION_READ_ONLY',
    executedAt: new Date().toISOString(),
    databaseTargetRedacted: redactPostgresDatabaseTargetV1(input.databaseUrl),
    sessionIdentity,
    checks,
    phaseAExecutionComplete: !hadError,
    phaseBCertified: false,
    phaseBCertificationStatus: 'NOT_CERTIFIED',
    productionCertification: 'NOT_CERTIFIED',
    summary,
  };

  assertNoSecretsInReportPayloadV1(report);

  return { ok: true, report };
}

/** Test helper — proves READ ONLY transaction rejects mutations. */
export async function assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1(
  databaseUrl: string,
): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await client.$connect();
  try {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE phase_a_readonly_probe(id int)');
    });
    throw new Error('PHASE_A_READ_ONLY_NOT_ENFORCED');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('PHASE_A_READ_ONLY_NOT_ENFORCED')) {
      throw error;
    }
    // expected: cannot execute CREATE in read-only transaction
  } finally {
    await client.$disconnect();
  }
}
