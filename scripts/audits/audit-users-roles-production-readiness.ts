#!/usr/bin/env ts-node
/**
 * Users & Roles / IAM Production-Readiness Audit — read-only orchestrator.
 *
 * SAFETY:
 *  - This script performs NO writes.
 *  - Do NOT call UsersService / OrganizationInviteService / RefreshTokenService
 *    mutation methods against production.
 *  - PostgreSQL access (later phases) must use SELECT-only SQL.
 *  - Never print emails, names, IPs, user agents, tokens, hashes, JWTs, or raw IDs.
 *  - Emit only anonymized aliases: ORG_001, USER_001, MEMBERSHIP_001, ROLE_001,
 *    INVITE_001, SESSION_GROUP_001.
 *
 * Usage:
 *   node --experimental-strip-types scripts/audits/audit-users-roles-production-readiness.ts --phase=1
 *
 * Environment (later phases only):
 *   DATABASE_URL                              PostgreSQL (SELECT-only)
 *   USERS_ROLES_AUDIT_ALLOW_REMOTE=1          allow non-local DATABASE_URL
 *   USERS_ROLES_AUDIT_ALLOW_PROD=1            supervised production read-only override
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — configuration / runtime error
 *   2 — phase not implemented yet
 */
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_ID = 'users-roles-production-readiness-2026-07';
const ALLOWED_PHASES = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

/** Works under CommonJS ts-node and Node --experimental-strip-types (ESM). */
function scriptDir(): string {
  try {
    // eslint-disable-next-line no-undef
    if (typeof __dirname !== 'undefined') return __dirname;
  } catch {
    /* ignore */
  }
  return path.dirname(path.resolve(process.argv[1] || '.'));
}

interface AuditPhaseResult {
  auditId: string;
  phase: number;
  completedAt: string;
  mode: 'read-only';
  writesPerformed: false;
  summary: string;
  artifacts: string[];
  notes: string[];
  data?: Record<string, unknown>;
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function parsePhase(): number {
  const raw = parseArg('--phase') ?? '1';
  const phase = Number(raw);
  if (!Number.isInteger(phase) || !ALLOWED_PHASES.has(phase)) {
    throw new Error(`Invalid --phase=${raw}. Allowed: 1–8.`);
  }
  return phase;
}

function repoRoot(): string {
  return path.resolve(scriptDir(), '../..');
}

function assertReadOnlyPosture(): void {
  const banned = [
    'USERS_ROLES_AUDIT_ALLOW_WRITE',
    'IAM_AUDIT_ALLOW_WRITE',
    'ALLOW_IAM_MUTATIONS',
  ];
  for (const key of banned) {
    if (process.env[key] === '1' || process.env[key] === 'true') {
      throw new Error(
        `${key} is set — refusing to run. This audit orchestrator is read-only only.`,
      );
    }
  }
}

function phase1StaticInventory(): AuditPhaseResult {
  const root = repoRoot();
  const required = [
    'docs/audits/users-roles-production-readiness-2026-07.md',
    'docs/audits/data/users-roles-code-map-2026-07.csv',
    'docs/audits/data/users-roles-runtime-snapshot-2026-07.json',
    'scripts/audits/audit-users-roles-production-readiness.ts',
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
  if (missing.length) {
    throw new Error(`Phase 1 required artifacts missing:\n- ${missing.join('\n- ')}`);
  }

  const csv = fs.readFileSync(
    path.join(root, 'docs/audits/data/users-roles-code-map-2026-07.csv'),
    'utf8',
  );
  const csvRows = csv.trim().split('\n').length - 1;

  const runtime = JSON.parse(
    fs.readFileSync(
      path.join(root, 'docs/audits/data/users-roles-runtime-snapshot-2026-07.json'),
      'utf8',
    ),
  ) as { writesPerformed?: boolean; preliminaryRuntimeSignals?: unknown[] };

  if (runtime.writesPerformed !== false) {
    throw new Error('Runtime snapshot must declare writesPerformed=false');
  }

  return {
    auditId: AUDIT_ID,
    phase: 1,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary:
      'Phase 1 complete: IAM code map, runtime snapshot, and main report outline present.',
    artifacts: required,
    notes: [
      'No production mutations performed by this script.',
      'Phases 2–8 are outlined in the main report and not executed here.',
      `Code map rows: ${csvRows}`,
      `Runtime preliminary signals: ${runtime.preliminaryRuntimeSignals?.length ?? 0}`,
    ],
    data: {
      codeMapRows: csvRows,
      runtimeSignalCount: runtime.preliminaryRuntimeSignals?.length ?? 0,
    },
  };
}

function main(): void {
  assertReadOnlyPosture();
  const phase = parsePhase();

  if (phase !== 1) {
    console.error(
      JSON.stringify(
        {
          auditId: AUDIT_ID,
          phase,
          mode: 'read-only',
          writesPerformed: false,
          error: `Phase ${phase} not implemented in this Prompt-1 skeleton.`,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const result = phase1StaticInventory();
  const outDir = path.join(repoRoot(), 'docs/audits/data');
  const outPath = path.join(outDir, 'users-roles-audit-phase-1-result-2026-07.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...result, resultArtifact: outPath }, null, 2));
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ auditId: AUDIT_ID, error: message, writesPerformed: false }));
  process.exit(1);
}
