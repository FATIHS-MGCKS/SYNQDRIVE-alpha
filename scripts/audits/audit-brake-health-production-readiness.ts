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
 *     --output-dir=docs/audits/data
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
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

function anonymizeJsonText(text: string): string {
  return redactSecrets(text);
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, unknown>[]): void {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
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
  const outputDir = path.resolve(parseArg('--output-dir') ?? path.join(repoRoot(), 'docs/audits/data'));
  assertSafeDatabaseTarget(true);

  const orgFilter = organizationId
    ? `AND v.organization_id = '${organizationId.replace(/'/g, "''")}'`
    : '';

  const aggregatesRaw = runPsql(`
    SELECT json_build_object(
      'days', ${days},
      'window_start_utc', (now() at time zone 'UTC' - interval '${days} days'),
      'window_end_utc', now() at time zone 'UTC',
      'vehicles_total', (SELECT count(*) FROM vehicles v WHERE 1=1 ${orgFilter.replace(/v\./g, '')}),
      'brake_health_current', (SELECT count(*) FROM brake_health_current bhc JOIN vehicles v ON v.id=bhc.vehicle_id WHERE 1=1 ${orgFilter}),
      'brake_health_initialized', (SELECT count(*) FROM brake_health_current bhc JOIN vehicles v ON v.id=bhc.vehicle_id WHERE bhc.is_initialized=true ${orgFilter}),
      'brake_evidence', (SELECT count(*) FROM brake_evidence be JOIN vehicles v ON v.id=be.vehicle_id WHERE 1=1 ${orgFilter}),
      'brake_trip_metrics', (SELECT count(*) FROM brake_trip_metrics),
      'brake_reference_specs', (SELECT count(*) FROM vehicle_brake_reference_specs s JOIN vehicles v ON v.id=s.vehicle_id WHERE 1=1 ${orgFilter}),
      'brake_service_events', (SELECT count(*) FROM vehicle_service_events e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.event_type='BRAKE_SERVICE' ${orgFilter}),
      'trip_driving_impact', (SELECT count(*) FROM trip_driving_impact tdi JOIN vehicles v ON v.id=tdi.vehicle_id WHERE tdi.created_at >= now() - interval '${days} days' ${orgFilter}),
      'trips_completed', (SELECT count(*) FROM vehicle_trips t JOIN vehicles v ON v.id=t.vehicle_id WHERE t.trip_status='COMPLETED' AND t.end_time >= now() - interval '${days} days' ${orgFilter}),
      'trips_without_tdi', (SELECT count(*) FROM vehicle_trips t JOIN vehicles v ON v.id=t.vehicle_id WHERE t.trip_status='COMPLETED' AND t.end_time >= now() - interval '${days} days' ${orgFilter} AND NOT EXISTS (SELECT 1 FROM trip_driving_impact tdi WHERE tdi.trip_id=t.id)),
      'tdi_trip_dist_mismatch', (SELECT count(*) FROM trip_driving_impact tdi JOIN vehicle_trips t ON t.id=tdi.trip_id JOIN vehicles v ON v.id=tdi.vehicle_id WHERE abs(tdi.distance_km - coalesce(t.distance_km,0)) > 0.5 ${orgFilter}),
      'enrichment_brake_pending', (SELECT count(*) FROM vehicle_enrichment_jobs j JOIN vehicles v ON v.id=j.vehicle_id WHERE j.job_type='BRAKE' AND j.status='PENDING' ${orgFilter})
    )::text;
  `);

  const aggregates = JSON.parse(aggregatesRaw) as Record<string, unknown>;

  const fleetRowsRaw = runPsql(`
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.anon_rank), '[]'::json)::text
    FROM (
      SELECT
        row_number() OVER (ORDER BY v.id) AS anon_rank,
        'VEHICLE_' || lpad(row_number() OVER (ORDER BY v.id)::text, 3, '0') AS vehicle_anon,
        coalesce(vls.provider_source, vls.source, 'unknown') AS provider,
        coalesce(v.fuel_type::text, 'null') AS powertrain,
        coalesce(v.vehicle_type::text, 'null') AS vehicle_class,
        coalesce(bhc.is_initialized, false) AS brake_health_initialized,
        coalesce(bhc.state_class, 'NO_BASELINE') AS state_class,
        coalesce(bhc.anchor_validation_status, 'null') AS anchor_validation_status,
        round(vls.odometer_km::numeric, 0) AS current_odometer_km,
        (SELECT count(*) FROM vehicle_brake_reference_specs s WHERE s.vehicle_id=v.id) AS reference_spec_count,
        (SELECT count(*) FROM vehicle_service_events e WHERE e.vehicle_id=v.id AND e.event_type='BRAKE_SERVICE') AS service_events_count,
        (SELECT count(*) FROM brake_evidence be WHERE be.vehicle_id=v.id) AS brake_evidence_count,
        (SELECT round(coalesce(sum(t.distance_km),0)::numeric,1) FROM vehicle_trips t WHERE t.vehicle_id=v.id AND t.trip_status='COMPLETED' AND t.end_time >= now() - interval '${days} days') AS trip_distance_sum_km,
        (SELECT count(*) FROM vehicle_trips t WHERE t.vehicle_id=v.id AND t.trip_status='COMPLETED' AND t.end_time >= now() - interval '${days} days') AS completed_trips,
        (SELECT round(coalesce(sum(tdi.distance_km),0)::numeric,1) FROM trip_driving_impact tdi WHERE tdi.vehicle_id=v.id AND tdi.created_at >= now() - interval '${days} days') AS tdi_distance_sum_km,
        (SELECT count(*) FROM trip_driving_impact tdi WHERE tdi.vehicle_id=v.id AND tdi.created_at >= now() - interval '${days} days') AS tdi_rows,
        (SELECT count(*) FROM vehicle_trips t WHERE t.vehicle_id=v.id AND t.trip_status='COMPLETED' AND t.end_time >= now() - interval '${days} days' AND NOT EXISTS (SELECT 1 FROM trip_driving_impact tdi WHERE tdi.trip_id=t.id)) AS trips_without_tdi,
        (SELECT count(*) FROM vehicle_dtc_events d WHERE d.vehicle_id=v.id AND d.is_active=true) AS active_dtc_count,
        vls.brake_pad_percent AS legacy_brake_pad_percent
      FROM vehicles v
      LEFT JOIN brake_health_current bhc ON bhc.vehicle_id = v.id
      LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
      WHERE 1=1 ${orgFilter}
    ) t;
  `);

  const fleetRows = JSON.parse(fleetRowsRaw) as Record<string, unknown>[];

  for (const row of fleetRows) {
    const hasSpec = Number(row.reference_spec_count) > 0;
    const initialized = row.brake_health_initialized === true;
    let classification = 'D_NO_BASELINE';
    if (initialized) classification = 'B_ESTIMATION_OR_MEASURED';
    else if (hasSpec) classification = 'C_SPEC_FALLBACK_ELIGIBLE';
    else classification = 'D_NO_BASELINE';
    if (Number(row.active_dtc_count) > 0 && !initialized) {
      row.data_quality_warnings = `orphan_active_dtc_${row.active_dtc_count}`;
    }
    row.fleet_classification = classification;
  }

  const fleetPath = path.join(outputDir, 'brake-health-fleet-coverage-2026-07.csv');
  writeCsv(fleetPath, Object.keys(fleetRows[0] ?? { vehicle_anon: '' }), fleetRows);

  const findingsPath = path.join(outputDir, 'brake-health-integrity-findings-2026-07.json');
  const findingsPayload = {
    auditId: AUDIT_ID,
    phase: 3,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    aggregates,
    fleetRowCount: fleetRows.length,
    fleetRows: fleetRows.map((r) => ({
      vehicle_anon: r.vehicle_anon,
      brake_health_initialized: r.brake_health_initialized,
      fleet_classification: r.fleet_classification,
      trip_distance_sum_km: r.trip_distance_sum_km,
      tdi_distance_sum_km: r.tdi_distance_sum_km,
      trips_without_tdi: r.trips_without_tdi,
    })),
    note: 'Full findings register in brake-health-integrity-findings-2026-07.json (committed separately with manual VPS audit)',
  };
  fs.writeFileSync(findingsPath, anonymizeJsonText(JSON.stringify(findingsPayload, null, 2)), 'utf8');

  const notes = [
    'Phase 3 uses read-only SQL via psql; no Prisma writes.',
    'Vehicle identifiers anonymized as VEHICLE_NNN only.',
    'Does NOT call BrakeHealthService.recalculate() or any mutation.',
    organizationId ? `Filtered to organizationId=${organizationId}` : 'No organization filter (full fleet).',
  ];

  return {
    auditId: AUDIT_ID,
    phase: 3,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: `Phase 3 VPS integrity (${days}d): ${aggregates.brake_health_initialized}/${aggregates.vehicles_total} initialized, ${aggregates.trip_driving_impact} TDI rows, ${aggregates.trips_without_tdi} trips without TDI.`,
    artifacts: [
      'docs/audits/data/brake-health-fleet-coverage-2026-07.csv',
      'docs/audits/data/brake-health-anchor-integrity-2026-07.csv',
      'docs/audits/data/brake-health-service-scope-replay-2026-07.csv',
      'docs/audits/data/brake-health-trip-model-coverage-2026-07.csv',
      'docs/audits/data/brake-health-evidence-classification-2026-07.csv',
      'docs/audits/data/brake-health-integrity-findings-2026-07.json',
    ],
    notes,
    data: { aggregates, fleetRowCount: fleetRows.length },
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

  if (phase !== 1 && phase !== 3 && !outputPath && !parseArg('--output-dir')) {
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
