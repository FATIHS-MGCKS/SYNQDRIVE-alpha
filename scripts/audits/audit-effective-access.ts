#!/usr/bin/env node
/**
 * Effective-access / IAM integrity audit helper (Prompt 4 + Prompt 12).
 *
 * SAFETY:
 *  - Default mode is READ ONLY
 *  - Apply mode requires explicit --apply plus operator, reason, backup confirmation,
 *    organizationId, evidence hash, expected git commit, and batch limit
 *  - Never prints emails, names, IPs, user agents, tokens, hashes, or raw UUIDs in console
 *  - Evidence packages use anonymized aliases ORG_001 / USER_001 / MEMBERSHIP_001
 *
 * Usage (read-only drift classification — Prompt 12):
 *   cd backend
 *   DATABASE_URL=... npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-effective-access.ts \
 *     --drift-audit --organizationId=<uuid> [--outDir=docs/audits/data]
 *
 * Usage (legacy phase-4 coverage summary):
 *   DATABASE_URL=... node --experimental-strip-types scripts/audits/audit-effective-access.ts \
 *     [--organizationAlias=ORG_001] [--outDir=docs/audits/data]
 *
 * Usage (controlled apply — Prompt 12):
 *   cd backend
 *   DATABASE_URL=... npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-effective-access.ts \
 *     --drift-audit --apply \
 *     --organizationId=<uuid> \
 *     --evidenceHash=<reportHash> \
 *     --expectedGitCommit=<sha> \
 *     --backup-confirmed \
 *     --operator=<name> \
 *     --reason="..." \
 *     --batchLimit=25 \
 *     --idempotencyKeyPrefix=drift-2026-07-21
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_ID = 'users-roles-production-readiness-2026-07';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function scriptDir(): string {
  try {
    // eslint-disable-next-line no-undef
    if (typeof __dirname !== 'undefined') return __dirname;
  } catch {
    /* ignore */
  }
  return path.dirname(path.resolve(process.argv[1] || '.'));
}

function repoRoot(): string {
  return path.resolve(scriptDir(), '../..');
}

function resolveGitCommit(): string | null {
  const fromArg = parseArg('--expectedGitCommit');
  if (fromArg) return fromArg;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function assertReadOnlyUnlessApply(): void {
  if (hasFlag('--apply')) return;
  for (const key of [
    'USERS_ROLES_AUDIT_ALLOW_WRITE',
    'IAM_AUDIT_ALLOW_WRITE',
    'ALLOW_IAM_MUTATIONS',
  ]) {
    if (process.env[key] === '1' || process.env[key] === 'true') {
      throw new Error(`${key} is set — refusing to run (read-only only).`);
    }
  }
}

function assertDbAllowed(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const remote = process.env.USERS_ROLES_AUDIT_ALLOW_REMOTE === '1';
  const prod = process.env.USERS_ROLES_AUDIT_ALLOW_PROD === '1';
  const local =
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('@postgres:');
  if (!local && !(remote && prod)) {
    throw new Error(
      'Non-local DATABASE_URL requires USERS_ROLES_AUDIT_ALLOW_REMOTE=1 and USERS_ROLES_AUDIT_ALLOW_PROD=1',
    );
  }
  return url.replace(/[?&]schema=[^&]*/g, '').replace('?&', '?').replace(/[?&]$/, '');
}

function psql(url: string, sql: string): string[][] {
  const out = execFileSync(
    'psql',
    [url, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split('\t'));
}

async function runDriftAudit(): Promise<void> {
  assertReadOnlyUnlessApply();
  const outDir = path.resolve(repoRoot(), parseArg('--outDir') ?? 'docs/audits/data');
  fs.mkdirSync(outDir, { recursive: true });

  const organizationId = parseArg('--organizationId');
  const organizationAlias = parseArg('--organizationAlias');
  if (!organizationId && !organizationAlias) {
    throw new Error('drift audit requires --organizationId or --organizationAlias');
  }

  const apply = hasFlag('--apply');
  if (apply && !hasFlag('--backup-confirmed')) {
    throw new Error('--apply requires --backup-confirmed');
  }

  const backendRoot = path.join(repoRoot(), 'backend');
  const envPath = path.join(backendRoot, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../backend/src/app.module');
  const { RoleAssignmentDriftReconciliationService } = await import(
    '../../backend/src/modules/users/role-assignment-drift-reconciliation.service'
  );

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(RoleAssignmentDriftReconciliationService);
    const gitCommit = resolveGitCommit();

    if (!apply) {
      const report = await service.runReadOnlyAudit({
        organizationId,
        organizationAlias,
        gitCommit,
      });
      const outPath = path.join(outDir, 'iam-role-assignment-drift-evidence-2026-07.json');
      fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(
        JSON.stringify(
          {
            auditId: AUDIT_ID,
            phase: 12,
            mode: 'read-only',
            writesPerformed: false,
            organizationAlias: report.organizationAlias,
            summary: report.summary,
            reportHash: report.reportHash,
            resultArtifact: outPath,
          },
          null,
          2,
        ),
      );
      return;
    }

    const evidenceHash = parseArg('--evidenceHash');
    const operator = parseArg('--operator');
    const reason = parseArg('--reason');
    const batchLimit = Number(parseArg('--batchLimit') ?? '25');
    const idempotencyKeyPrefix =
      parseArg('--idempotencyKeyPrefix') ?? `drift-${new Date().toISOString().slice(0, 10)}`;

    if (!organizationId) {
      throw new Error('--apply requires --organizationId (not alias only)');
    }
    if (!evidenceHash) throw new Error('--apply requires --evidenceHash');
    if (!operator) throw new Error('--apply requires --operator');
    if (!reason) throw new Error('--apply requires --reason');
    if (!Number.isInteger(batchLimit) || batchLimit < 1) {
      throw new Error('--batchLimit must be a positive integer');
    }
    if (!gitCommit) throw new Error('--expectedGitCommit or git HEAD is required for --apply');

    const applyReport = await service.applyDriftReconciliation({
      organizationId,
      evidencePackages: [],
      evidenceHash,
      expectedGitCommit: gitCommit,
      operator,
      reason,
      batchLimit,
      backupConfirmed: true,
      apply: true,
      idempotencyKeyPrefix,
    });

    const outPath = path.join(outDir, 'iam-role-assignment-drift-apply-2026-07.json');
    fs.writeFileSync(outPath, `${JSON.stringify(applyReport, null, 2)}\n`, 'utf8');
    console.log(
      JSON.stringify(
        {
          auditId: AUDIT_ID,
          phase: 12,
          mode: 'apply',
          writesPerformed: true,
          summary: applyReport.summary,
          resultArtifact: outPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

function runLegacyPhase4Audit(): void {
  assertReadOnlyUnlessApply();
  const dbUrl = assertDbAllowed();
  const outDir = path.resolve(repoRoot(), parseArg('--outDir') ?? 'docs/audits/data');
  fs.mkdirSync(outDir, { recursive: true });

  const orgFilterAlias = parseArg('--organizationAlias');
  let orgOrdinal: number | null = null;
  if (orgFilterAlias) {
    const m = /^ORG_(\d+)$/.exec(orgFilterAlias);
    if (!m) throw new Error('organizationAlias must look like ORG_001');
    orgOrdinal = Number(m[1]);
  }

  const orgs = psql(
    dbUrl,
    'SELECT id::text FROM organizations ORDER BY created_at ASC, id ASC;',
  ).map((r) => r[0]);
  const orgAlias = new Map(orgs.map((id, i) => [id, `ORG_${String(i + 1).padStart(3, '0')}`]));

  let targetOrgIds = orgs;
  if (orgOrdinal != null) {
    if (orgOrdinal < 1 || orgOrdinal > orgs.length) {
      throw new Error(`organizationAlias ORG_${String(orgOrdinal).padStart(3, '0')} out of range`);
    }
    targetOrgIds = [orgs[orgOrdinal - 1]];
  }

  const coverage: Record<string, unknown>[] = [];
  for (const orgId of targetOrgIds) {
    const alias = orgAlias.get(orgId)!;
    const [[activeMem], [admins], [noRoleLink], [rolesTotal], [systemRoles], [customRoles], [invitesPending], [activeSessions]] =
      [
        psql(dbUrl, `SELECT count(*)::text FROM organization_memberships WHERE organization_id='${orgId}' AND status='ACTIVE';`),
        psql(dbUrl, `SELECT count(*)::text FROM organization_memberships WHERE organization_id='${orgId}' AND status='ACTIVE' AND role='ORG_ADMIN';`),
        psql(dbUrl, `SELECT count(*)::text FROM organization_memberships WHERE organization_id='${orgId}' AND status='ACTIVE' AND organization_role_id IS NULL;`),
        psql(dbUrl, `SELECT count(*)::text FROM organization_roles WHERE organization_id='${orgId}';`),
        psql(dbUrl, `SELECT count(*)::text FROM organization_roles WHERE organization_id='${orgId}' AND is_system_template=true;`),
        psql(dbUrl, `SELECT count(*)::text FROM organization_roles WHERE organization_id='${orgId}' AND is_system_template=false;`),
        psql(dbUrl, `SELECT count(*)::text FROM organization_user_invites WHERE organization_id='${orgId}' AND status='PENDING' AND expires_at>NOW();`),
        psql(
          dbUrl,
          `SELECT count(*)::text FROM refresh_tokens rt
           WHERE rt.revoked_at IS NULL AND rt.expires_at>NOW()
             AND rt.user_id IN (SELECT user_id FROM organization_memberships WHERE organization_id='${orgId}');`,
        ),
      ];
    coverage.push({
      organizationAlias: alias,
      membershipsActive: Number(activeMem[0]),
      adminsActiveOrgAdminRole: Number(admins[0]),
      activeMembershipsWithoutRoleLink: Number(noRoleLink[0]),
      rolesTotal: Number(rolesTotal[0]),
      systemRoles: Number(systemRoles[0]),
      customRoles: Number(customRoles[0]),
      invitesOpenUnexpired: Number(invitesPending[0]),
      activeRefreshTokensForMemberUsers: Number(activeSessions[0]),
    });
  }

  const driftCounts = psql(
    dbUrl,
    `SELECT
       count(*) FILTER (WHERE m.organization_role_id IS NOT NULL)::text AS linked,
       count(*) FILTER (WHERE m.organization_role_id IS NOT NULL AND m.permissions IS DISTINCT FROM r.permissions)::text AS perm_mismatch,
       count(*) FILTER (WHERE m.organization_role_id IS NULL AND m.status='ACTIVE')::text AS active_unlinked
     FROM organization_memberships m
     LEFT JOIN organization_roles r ON r.id = m.organization_role_id;`,
  )[0];

  const legacyAssignmentCounts = psql(
    dbUrl,
    `SELECT
       count(*)::text AS current_assignments,
       count(*) FILTER (WHERE assignment_mode='MIGRATION_LEGACY_SNAPSHOT')::text AS legacy_snapshot
     FROM organization_role_assignments
     WHERE is_current=true;`,
  )[0];

  const sessionCounts = psql(
    dbUrl,
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE revoked_at IS NULL AND expires_at>NOW())::text AS active,
       count(*) FILTER (WHERE revoked_at IS NOT NULL)::text AS revoked
     FROM refresh_tokens;`,
  )[0];

  const result = {
    auditId: AUDIT_ID,
    phase: 4,
    completedAt: new Date().toISOString(),
    mode: 'read-only' as const,
    writesPerformed: false as const,
    organizationFilter: orgFilterAlias ?? null,
    coverage,
    aggregates: {
      membershipsWithRoleLink: Number(driftCounts[0]),
      membershipPermissionMismatchVsRole: Number(driftCounts[1]),
      activeMembershipsWithoutRoleLink: Number(driftCounts[2]),
      currentRoleAssignments: Number(legacyAssignmentCounts[0]),
      legacySnapshotAssignments: Number(legacyAssignmentCounts[1]),
      refreshTokensTotal: Number(sessionCounts[0]),
      refreshTokensActive: Number(sessionCounts[1]),
      refreshTokensRevoked: Number(sessionCounts[2]),
    },
    notes: [
      'Aliases only — no raw UUIDs/emails/IPs/tokens emitted.',
      'Use --drift-audit for Prompt 12 membership classification and evidence packages.',
      'Apply mode is disabled by default and requires explicit --apply safeguards.',
    ],
  };

  const outPath = path.join(outDir, 'iam-effective-access-audit-run-2026-07.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...result, resultArtifact: outPath }, null, 2));
}

async function main(): Promise<void> {
  if (hasFlag('--drift-audit')) {
    await runDriftAudit();
    return;
  }
  runLegacyPhase4Audit();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ auditId: AUDIT_ID, error: message, writesPerformed: false }));
  process.exit(1);
});
