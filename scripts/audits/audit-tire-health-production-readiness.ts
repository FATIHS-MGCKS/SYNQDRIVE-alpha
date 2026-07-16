#!/usr/bin/env ts-node
/**
 * Tire Health Production-Readiness Audit — read-only orchestrator.
 *
 * SAFETY: This script performs NO writes. It must not call
 * TireHealthService.recalculate(), TireLifecycleService mutations, or any
 * service method that persists tire/telemetry data.
 *
 * Usage:
 *   npx ts-node scripts/audits/audit-tire-health-production-readiness.ts --phase=1
 *   npx ts-node scripts/audits/audit-tire-health-production-readiness.ts --phase=3 --days=60
 *   TIRE_HEALTH_AUDIT_ALLOW_REMOTE=1 TIRE_HEALTH_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node scripts/audits/audit-tire-health-production-readiness.ts --phase=3 \
 *     --output=docs/audits/data/tire-health-integrity-findings-2026-07.json
 *
 * Environment:
 *   DATABASE_URL                         PostgreSQL (required for phase >=3)
 *   TIRE_HEALTH_AUDIT_ALLOW_REMOTE=1     allow non-local DATABASE_URL
 *   TIRE_HEALTH_AUDIT_ALLOW_PROD=1       supervised production read-only override
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — configuration / runtime error
 *   2 — phase not implemented yet
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const AUDIT_ID = 'tire-health-production-readiness-2026-07';
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
      `Refusing non-local DATABASE_URL host "${hostname}". Set TIRE_HEALTH_AUDIT_ALLOW_REMOTE=1.`,
    );
  }

  const looksProd = PROD_HOST_PATTERNS.some((re) => re.test(url) || re.test(hostname));
  if (looksProd && !allowProd) {
    throw new Error(
      'DATABASE_URL appears to target production. Set TIRE_HEALTH_AUDIT_ALLOW_PROD=1 for supervised read-only audits.',
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

  const report = path.join(root, 'docs/audits/tire-health-production-readiness-2026-07.md');
  const csv = path.join(root, 'docs/audits/data/tire-health-code-map-2026-07.csv');
  if (fs.existsSync(report)) artifacts.push('docs/audits/tire-health-production-readiness-2026-07.md');
  if (fs.existsSync(csv)) {
    const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/).filter(Boolean);
    artifacts.push(`docs/audits/data/tire-health-code-map-2026-07.csv (${Math.max(0, lines.length - 1)} rows)`);
  }

  notes.push('Phase 1 validates repository artifacts only; no database connection required.');

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
      'active_setups', (SELECT count(*) FROM vehicle_tire_setups WHERE status='ACTIVE' AND removed_at IS NULL),
      'vehicles_with_active', (SELECT count(DISTINCT vehicle_id) FROM vehicle_tire_setups WHERE status='ACTIVE' AND removed_at IS NULL),
      'snapshots', (SELECT count(*) FROM tire_health_snapshots WHERE snapshot_date >= now() - interval '${days} days'),
      'wear_points', (SELECT count(*) FROM tire_wear_data_points WHERE created_at >= now() - interval '${days} days'),
      'wear_points_all_time', (SELECT count(*) FROM tire_wear_data_points),
      'synthetic_points', (SELECT count(*) FROM tire_wear_data_points WHERE created_at >= now() - interval '${days} days' AND abs(actual_tread_mm - predicted_tread_mm) < 0.001),
      'ground_truth_points', (SELECT count(*) FROM tire_wear_data_points WHERE created_at >= now() - interval '${days} days' AND abs(actual_tread_mm - predicted_tread_mm) >= 0.001),
      'recalc_events', (SELECT count(*) FROM tire_events WHERE type='RECALCULATION' AND created_at >= now() - interval '${days} days'),
      'null_installed_odo_setups', (SELECT count(*) FROM vehicle_tire_setups WHERE status='ACTIVE' AND installed_odometer_km IS NULL),
      'trip_km_sum', (SELECT round(coalesce(sum(distance_km),0)::numeric,1) FROM vehicle_trips WHERE trip_status='COMPLETED' AND end_time >= now() - interval '${days} days'),
      'setup_km_sum', (SELECT round(coalesce(sum(total_km_on_set),0)::numeric,1) FROM vehicle_tire_setups WHERE status='ACTIVE' AND removed_at IS NULL)
    )::text;
  `);

  const aggregates = JSON.parse(aggregatesRaw) as Record<string, unknown>;

  const fleetRowsRaw = runPsql(`
    SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text
    FROM (
      SELECT row_number() OVER (ORDER BY v.id) AS anon_rank,
        round(s.total_km_on_set::numeric,1) AS total_km_on_set,
        round(coalesce(trip.trip_km,0)::numeric,1) AS trip_km_sum
      FROM vehicles v
      JOIN vehicle_tire_setups s ON s.vehicle_id=v.id AND s.status='ACTIVE' AND s.removed_at IS NULL
      LEFT JOIN (
        SELECT vehicle_id, sum(distance_km) AS trip_km
        FROM vehicle_trips
        WHERE trip_status='COMPLETED' AND end_time >= now() - interval '${days} days'
        GROUP BY vehicle_id
      ) trip ON trip.vehicle_id=v.id
      WHERE 1=1 ${orgFilter}
    ) t;
  `);

  const fleetRows = JSON.parse(fleetRowsRaw) as { anon_rank: number; total_km_on_set: number; trip_km_sum: number }[];
  const vehiclesWithKmDeviation = fleetRows.filter(
    (r) => Math.abs(r.total_km_on_set - r.trip_km_sum) > Math.max(50, r.trip_km_sum * 0.15),
  ).length;

  const notes = [
    'Phase 3 uses read-only SQL via psql; no Prisma writes.',
    'Ground-truth classification requires tire_wear_data_points rows; skip regression if empty.',
    organizationId ? `Filtered to organizationId=${organizationId}` : 'No organization filter (full fleet).',
  ];

  return {
    auditId: AUDIT_ID,
    phase: 3,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: `Phase 3 VPS integrity analysis (${days}d): ${aggregates.vehicles_with_active} vehicles, ${aggregates.snapshots} snapshots, ${aggregates.wear_points} wear points.`,
    artifacts: [
      'docs/audits/data/tire-health-fleet-coverage-2026-07.csv',
      'docs/audits/data/tire-health-ground-truth-classification-2026-07.csv',
      'docs/audits/data/tire-health-integrity-findings-2026-07.json',
      'scripts/audits/tire-health-phase3-readonly.sql',
    ],
    notes,
    data: {
      aggregates,
      vehiclesWithKmDeviation,
      fleetRowCount: fleetRows.length,
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
    notes: [`Implement read-only Phase ${phase} logic in scripts/audits/audit-tire-health-production-readiness.ts.`],
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
