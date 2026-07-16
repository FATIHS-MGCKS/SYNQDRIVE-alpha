#!/usr/bin/env ts-node
/**
 * Tire Health Production-Readiness Audit — read-only orchestrator.
 *
 * SAFETY: This script performs NO writes by default. It must not call
 * TireHealthService.recalculate(), TireLifecycleService mutations, or any
 * service method that persists tire/telemetry data.
 *
 * Phases 2–7 will add read-only replay and aggregation logic here.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/audits/audit-tire-health-production-readiness.ts
 *   npx ts-node -r tsconfig-paths/register scripts/audits/audit-tire-health-production-readiness.ts --phase=1
 *   npx ts-node -r tsconfig-paths/register scripts/audits/audit-tire-health-production-readiness.ts --phase=5 --output=docs/audits/data/tire-health-replay-sample.json
 *
 * Environment:
 *   TIRE_HEALTH_AUDIT_ALLOW_REMOTE=1   allow non-local DATABASE_URL (still blocks prod host patterns)
 *   TIRE_HEALTH_AUDIT_ALLOW_PROD=1     override production block (strongly discouraged)
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — configuration / runtime error
 *   2 — phase not implemented yet
 */
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_ID = 'tire-health-production-readiness-2026-07';
const ALLOWED_PHASES = new Set([1, 2, 3, 4, 5, 6, 7]);

// ── CLI helpers ───────────────────────────────────────────────────────────────

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function parsePhase(): number {
  const raw = parseArg('--phase') ?? '1';
  const phase = Number(raw);
  if (!Number.isInteger(phase) || !ALLOWED_PHASES.has(phase)) {
    throw new Error(`Invalid --phase=${raw}. Allowed: 1–7.`);
  }
  return phase;
}

// ── Safety guards ───────────────────────────────────────────────────────────

const PROD_HOST_PATTERNS = [
  /app\.synqdrive\.eu/i,
  /synqdrive\.eu/i,
  /mein-vps/i,
  /prod/i,
  /production/i,
];

function assertSafeDatabaseTarget(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    // Phase 1 can run without DB (architecture-only).
    return;
  }

  const allowRemote = process.env.TIRE_HEALTH_AUDIT_ALLOW_REMOTE === '1';
  const allowProd = process.env.TIRE_HEALTH_AUDIT_ALLOW_PROD === '1';

  let hostname = '';
  try {
    hostname = new URL(url.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local');

  if (!isLocal && !allowRemote) {
    throw new Error(
      `Refusing non-local DATABASE_URL host "${hostname}". Set TIRE_HEALTH_AUDIT_ALLOW_REMOTE=1 to override.`,
    );
  }

  const looksProd = PROD_HOST_PATTERNS.some((re) => re.test(url) || re.test(hostname));
  if (looksProd && !allowProd) {
    throw new Error(
      'DATABASE_URL appears to target production. Set TIRE_HEALTH_AUDIT_ALLOW_PROD=1 only for supervised read-only VPS audits.',
    );
  }
}

function redactSecrets(text: string): string {
  return text
    .replace(/postgresql:\/\/[^@\s]+@[^\s/]+/gi, 'postgresql://***@***')
    .replace(/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=***REDACTED***');
}

// ── Phase runners (read-only) ─────────────────────────────────────────────────

interface AuditPhaseResult {
  auditId: string;
  phase: number;
  completedAt: string;
  mode: 'read-only';
  writesPerformed: false;
  summary: string;
  artifacts: string[];
  notes: string[];
}

async function runPhase1(): Promise<AuditPhaseResult> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const reportPath = path.join(repoRoot, 'docs/audits/tire-health-production-readiness-2026-07.md');
  const csvPath = path.join(repoRoot, 'docs/audits/data/tire-health-code-map-2026-07.csv');

  const artifacts: string[] = [];
  const notes: string[] = [];

  if (fs.existsSync(reportPath)) {
    artifacts.push('docs/audits/tire-health-production-readiness-2026-07.md');
  } else {
    notes.push('Main audit report not found — run Phase 1 documentation step first.');
  }

  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
    artifacts.push(`docs/audits/data/tire-health-code-map-2026-07.csv (${Math.max(0, lines.length - 1)} rows)`);
  }

  notes.push('Phase 1 validates repository artifacts only; no database connection required.');
  notes.push('VPS runtime probe is documented in the main report (manual read-only SSH).');

  return {
    auditId: AUDIT_ID,
    phase: 1,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: 'Phase 1 architecture and code-map artifacts verified.',
    artifacts,
    notes,
  };
}

async function runPhaseStub(phase: number): Promise<AuditPhaseResult> {
  return {
    auditId: AUDIT_ID,
    phase,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: `Phase ${phase} not implemented in audit script yet.`,
    artifacts: [],
    notes: [
      `Implement read-only Phase ${phase} logic in scripts/audits/audit-tire-health-production-readiness.ts.`,
      'Do not call TireHealthService.recalculate() or lifecycle mutations from this script.',
    ],
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const phase = parsePhase();
  const outputPath = parseArg('--output');
  const dryRun = !process.argv.includes('--no-dry-run');

  assertSafeDatabaseTarget();

  if (!dryRun) {
    console.error('This audit script is always read-only; --no-dry-run is ignored.');
  }

  console.error(`[${AUDIT_ID}] Starting Phase ${phase} (read-only, writes=false)…`);

  let result: AuditPhaseResult;

  if (phase === 1) {
    result = await runPhase1();
  } else {
    result = await runPhaseStub(phase);
    if (!outputPath) {
      console.error(`Phase ${phase} is not implemented yet.`);
      process.exit(2);
    }
  }

  const json = JSON.stringify(result, null, 2);

  if (outputPath) {
    const abs = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, json, 'utf8');
    console.error(`Wrote ${abs}`);
  }

  console.log(redactSecrets(json));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(redactSecrets(message));
  process.exit(1);
});
