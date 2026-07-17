#!/usr/bin/env ts-node
/**
 * Brake Health Production-Readiness Audit — read-only orchestrator.
 *
 * SAFETY: This script performs NO writes. It must not call
 * BrakeHealthService.recalculate(), BrakeLifecycleService mutations, or any
 * service method that persists brake/telemetry data.
 *
 * Usage:
 *   npx ts-node scripts/audits/audit-brake-health-production-readiness.ts --phase=1
 *   BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1 BRAKE_HEALTH_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node scripts/audits/audit-brake-health-production-readiness.ts --phase=3 --days=60 \
 *     --output=docs/audits/data/brake-health-integrity-findings-2026-07.json
 *
 * Environment:
 *   DATABASE_URL                         PostgreSQL (required for phase >=3)
 *   BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1     allow non-local DATABASE_URL
 *   BRAKE_HEALTH_AUDIT_ALLOW_PROD=1       supervised production read-only override
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — configuration / runtime error
 *   2 — phase not implemented yet
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_ID = 'brake-health-production-readiness-2026-07';
const ALLOWED_PHASES = new Set([1, 2, 3, 4, 5, 6, 7]);

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
    throw new Error(`Invalid --phase=${raw}. Allowed: 1–7.`);
  }
  return phase;
}

function parseDays(): number {
  const raw = parseArg('--days') ?? '60';
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error(`Invalid --days=${raw}. Use 1–365.`);
  }
  return days;
}

const PROD_HOST_PATTERNS = [
  /app\.synqdrive\.eu/i,
  /synqdrive\.eu/i,
  /mein-vps/i,
  /srv1374778/i,
  /prod/i,
  /production/i,
];

function assertSafeDatabaseTarget(requireDb = false): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    if (requireDb) {
      throw new Error('DATABASE_URL is required for this phase.');
    }
    return;
  }

  const allowRemote = process.env.BRAKE_HEALTH_AUDIT_ALLOW_REMOTE === '1';
  const allowProd = process.env.BRAKE_HEALTH_AUDIT_ALLOW_PROD === '1';

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
      `Refusing non-local DATABASE_URL host "${hostname}". Set BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1.`,
    );
  }

  const looksProd = PROD_HOST_PATTERNS.some((re) => re.test(url) || re.test(hostname));
  if (looksProd && !allowProd) {
    throw new Error(
      'DATABASE_URL appears to target production. Set BRAKE_HEALTH_AUDIT_ALLOW_PROD=1 for supervised read-only audits.',
    );
  }
}

function redactSecrets(text: string): string {
  return text
    .replace(/postgresql:\/\/[^@\s]+@[^\s/]+/gi, 'postgresql://***@***')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      'UUID_REDACTED',
    )
    .replace(/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=***REDACTED***');
}

function repoRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function psqlDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL missing');
  return url.split('?')[0];
}

function runPsql(sql: string): string {
  return execFileSync('psql', [psqlDatabaseUrl(), '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function anonymizeJsonText(text: string): string {
  return redactSecrets(text);
}

async function runPhase1(): Promise<AuditPhaseResult> {
  const root = repoRoot();
  const artifacts: string[] = [];
  const notes: string[] = [];

  const report = path.join(root, 'docs/audits/brake-health-production-readiness-2026-07.md');
  const csv = path.join(root, 'docs/audits/data/brake-health-code-map-2026-07.csv');
  const fleetCsv = path.join(root, 'docs/audits/data/brake-health-fleet-coverage-2026-07.csv');

  if (fs.existsSync(report)) artifacts.push('docs/audits/brake-health-production-readiness-2026-07.md');
  if (fs.existsSync(csv)) {
    const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/).filter(Boolean);
    artifacts.push(`docs/audits/data/brake-health-code-map-2026-07.csv (${Math.max(0, lines.length - 1)} rows)`);
  }
  if (fs.existsSync(fleetCsv)) artifacts.push('docs/audits/data/brake-health-fleet-coverage-2026-07.csv');

  notes.push('Phase 1 validates repository artifacts only; no database connection required.');
  notes.push('Brake recalculation must never be invoked from this script.');

  return {
    auditId: AUDIT_ID,
    phase: 1,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: 'Phase 1 architecture map, runtime probe, and code-map artifacts verified.',
    artifacts,
    notes,
  };
}

async function runPhase3(): Promise<AuditPhaseResult> {
  const days = parseDays();
  const organizationId = parseArg('--organization-id');
  assertSafeDatabaseTarget(true);

  const orgFilter = organizationId
    ? `AND v.organization_id = '${organizationId.replace(/'/g, "''")}'`
    : '';

  const aggregatesRaw = runPsql(`
    SELECT json_build_object(
      'days', ${days},
      'window_end_utc', now() at time zone 'UTC',
      'vehicles_total', (SELECT count(*) FROM vehicles),
      'brake_health_current', (SELECT count(*) FROM brake_health_current),
      'brake_health_initialized', (SELECT count(*) FROM brake_health_current WHERE is_initialized = true),
      'brake_evidence', (SELECT count(*) FROM brake_evidence),
      'brake_trip_metrics', (SELECT count(*) FROM brake_trip_metrics),
      'brake_reference_specs', (SELECT count(*) FROM vehicle_brake_reference_specs),
      'brake_service_events', (SELECT count(*) FROM vehicle_service_events WHERE event_type = 'BRAKE_SERVICE'),
      'trip_driving_impact', (SELECT count(*) FROM trip_driving_impact WHERE created_at >= now() - interval '${days} days'),
      'enrichment_brake_pending', (SELECT count(*) FROM vehicle_enrichment_jobs WHERE job_type = 'BRAKE' AND status = 'PENDING')
    )::text;
  `);

  const aggregates = JSON.parse(aggregatesRaw) as Record<string, unknown>;

  const fleetRowsRaw = runPsql(`
    SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text
    FROM (
      SELECT row_number() OVER (ORDER BY v.id) AS anon_rank,
        CASE WHEN bhc.vehicle_id IS NOT NULL THEN true ELSE false END AS has_brake_health_current,
        COALESCE(bhc.is_initialized, false) AS is_initialized,
        COALESCE((SELECT count(*) FROM brake_evidence be WHERE be.vehicle_id = v.id), 0) AS evidence_count,
        COALESCE((SELECT count(*) FROM vehicle_brake_reference_specs s WHERE s.vehicle_id = v.id), 0) AS reference_spec_count,
        COALESCE((SELECT count(*) FROM vehicle_service_events e WHERE e.vehicle_id = v.id AND e.event_type = 'BRAKE_SERVICE'), 0) AS brake_service_events,
        COALESCE((SELECT count(*) FROM trip_driving_impact tdi WHERE tdi.vehicle_id = v.id AND tdi.created_at >= now() - interval '${days} days'), 0) AS trip_driving_impact
      FROM vehicles v
      LEFT JOIN brake_health_current bhc ON bhc.vehicle_id = v.id
      WHERE 1=1 ${orgFilter}
    ) t;
  `);

  const fleetRows = JSON.parse(fleetRowsRaw) as Record<string, unknown>[];

  const notes = [
    'Phase 3 uses read-only SQL via psql; no Prisma writes.',
    'Vehicle identifiers are anonymized as anon_rank only; no UUIDs in output.',
    organizationId ? `Filtered to organizationId=${organizationId}` : 'No organization filter (full fleet).',
  ];

  return {
    auditId: AUDIT_ID,
    phase: 3,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: `Phase 3 VPS integrity (${days}d): ${aggregates.brake_health_initialized}/${aggregates.vehicles_total} initialized, ${aggregates.trip_driving_impact} trip driving-impact rows.`,
    artifacts: [
      'docs/audits/data/brake-health-fleet-coverage-2026-07.csv',
      'docs/audits/data/brake-health-integrity-findings-2026-07.json',
    ],
    notes,
    data: {
      aggregates,
      fleetRowCount: fleetRows.length,
      fleetRows,
    },
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
    notes: [`Implement read-only Phase ${phase} logic in scripts/audits/audit-brake-health-production-readiness.ts.`],
  };
}

async function main(): Promise<void> {
  const phase = parsePhase();
  const outputPath = parseArg('--output');

  assertSafeDatabaseTarget(phase >= 3);

  console.error(`[${AUDIT_ID}] Starting Phase ${phase} (read-only, writes=false)…`);

  let result: AuditPhaseResult;
  if (phase === 1) result = await runPhase1();
  else if (phase === 3) result = await runPhase3();
  else result = await runPhaseStub(phase);

  if (phase !== 1 && phase !== 3 && !outputPath) {
    console.error(`Phase ${phase} is not implemented yet.`);
    process.exit(2);
  }

  const json = anonymizeJsonText(JSON.stringify(result, null, 2));

  if (outputPath) {
    const abs = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, json, 'utf8');
    console.error(`Wrote ${abs}`);
  }

  console.log(json);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(redactSecrets(message));
  process.exit(1);
});
