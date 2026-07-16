/**
 * Read-only audit: tire setup odometer anchor backfill candidates (Prompt 7).
 *
 * NO writes. NO apply mode. NO recalculation. NO tire events.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts --fixtures-only
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts \
 *     --output-dir=../docs/audits/data --report=../docs/audits/tire-odometer-anchor-backfill-candidates-2026-07.md
 *
 * Environment:
 *   TIRE_ODOMETER_ANCHOR_AUDIT_ALLOW_REMOTE=1  allow non-local DATABASE_URL
 *   TIRE_ODOMETER_ANCHOR_AUDIT_ALLOW_PROD=1    supervised production read-only only
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  auditBackfillCandidates,
  buildSyntheticBackfillFixtures,
  renderBackfillAuditMarkdown,
} from '../../src/modules/vehicle-intelligence/tires/tire-odometer-anchor-backfill-audit';
import {
  buildSetupAuditInputFromRaw,
  type RawHandoverRow,
  type RawHmRow,
  type RawMeasurementRow,
  type RawSetupRow,
  type RawSiblingSetupRow,
  type RawSnapshotRow,
  type RawTripRow,
  type RawWorkshopDocRow,
} from '../../src/modules/vehicle-intelligence/tires/tire-odometer-anchor-backfill-audit.loader';
import { assertSafeTireOdometerAnchorAuditTarget } from '../../src/modules/vehicle-intelligence/tires/tire-odometer-anchor-backfill-audit.safety';

const AUDIT_ID = 'tire-odometer-anchor-backfill-2026-07';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function psqlUrl(): string {
  const url = process.env.DATABASE_URL?.split('?')[0];
  if (!url) throw new Error('DATABASE_URL required (or use --fixtures-only)');
  return url;
}

function runPsql(sql: string): string {
  return execFileSync('psql', [psqlUrl(), '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

function parseTsv<T extends string>(raw: string, columns: readonly T[]): Array<Record<T, string>> {
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const parts = line.split('\t');
    const row = {} as Record<T, string>;
    columns.forEach((col, i) => {
      row[col] = parts[i] ?? '';
    });
    return row;
  });
}

function loadSetups(limit?: number): RawSetupRow[] {
  const limitSql = limit ? `LIMIT ${Math.floor(limit)}` : '';
  const sql = `
    SELECT
      s.id::text,
      s.vehicle_id::text,
      s.organization_id::text,
      s.installed_at::text,
      s.status::text,
      s.installed_odometer_km::text,
      s.odometer_anchor_status::text,
      s.total_km_on_set::text
    FROM vehicle_tire_setups s
    WHERE s.installed_odometer_km IS NULL
       OR s.odometer_anchor_status IN ('ANCHOR_REQUIRED', 'MEASUREMENT_REQUIRED')
    ORDER BY s.created_at DESC
    ${limitSql}`;
  return parseTsv(runPsql(sql), [
    'setup_id',
    'vehicle_id',
    'organization_id',
    'installed_at',
    'status',
    'installed_odometer_km',
    'odometer_anchor_status',
    'total_km_on_set',
  ] as const);
}

function loadMeasurements(setupIds: string[]): RawMeasurementRow[] {
  if (setupIds.length === 0) return [];
  const inList = setupIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT tire_setup_id::text, id::text, measured_at::text, source, odometer_at_measurement::text
    FROM vehicle_tire_tread_measurements
    WHERE tire_setup_id IN (${inList})
      AND odometer_at_measurement IS NOT NULL`;
  return parseTsv(runPsql(sql), [
    'setup_id',
    'measurement_id',
    'measured_at',
    'source',
    'odometer_at_measurement',
  ] as const);
}

function loadHandovers(vehicleIds: string[]): RawHandoverRow[] {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT vehicle_id::text, id::text, performed_at::text, odometer_km::text
    FROM booking_handover_protocols
    WHERE vehicle_id IN (${inList})`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'protocol_id',
    'performed_at',
    'odometer_km',
  ] as const);
}

function loadSnapshots(vehicleIds: string[]): RawSnapshotRow[] {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT
      s.vehicle_id::text,
      s.id::text,
      s.snapshot_date::text,
      s.odometer_km::text,
      COALESCE(vls.provider_source, 'SNAPSHOT')::text
    FROM tire_health_snapshots s
    LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = s.vehicle_id
    WHERE s.vehicle_id IN (${inList})
      AND s.odometer_km IS NOT NULL`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'snapshot_id',
    'snapshot_date',
    'odometer_km',
    'provider_source',
  ] as const);
}

function loadTrips(vehicleIds: string[]): RawTripRow[] {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT vehicle_id::text, id::text, end_time::text, odometer_end_km::text
    FROM vehicle_energy_events
    WHERE vehicle_id IN (${inList})
      AND odometer_end_km IS NOT NULL
      AND end_time IS NOT NULL`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'trip_id',
    'end_time',
    'odometer_end_km',
  ] as const);
}

function loadWorkshopDocs(vehicleIds: string[]): RawWorkshopDocRow[] {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT
      e.vehicle_id::text,
      e.id::text,
      COALESCE(e.applied_at, e.processed_at, e.extraction_completed_at)::text,
      NULLIF(trim(both '"' from (COALESCE(e.confirmed_data, e.extracted_data)::jsonb->>'odometerKm')), '')::text
    FROM vehicle_document_extractions e
    WHERE e.vehicle_id IN (${inList})
      AND e.effective_document_type = 'TIRE'
      AND e.status IN ('CONFIRMED', 'APPLIED')
      AND (COALESCE(e.confirmed_data, e.extracted_data)::jsonb ? 'odometerKm')`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'extraction_id',
    'confirmed_at',
    'odometer_km',
  ] as const);
}

function loadHmRows(vehicleIds: string[]): RawHmRow[] {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT
      h.vehicle_id::text,
      COALESCE(h.last_success_at, h.last_fetched_at, h.updated_at)::text,
      NULLIF(
        trim(both '"' from (h.data_json->'signals'->'diagnostics.get.odometer'->>'value')),
        ''
      )::text
    FROM hm_signal_group_states h
    WHERE h.vehicle_id IN (${inList})
      AND h.signal_group = 'SERVICE'
      AND h.data_json->'signals'->'diagnostics.get.odometer'->>'value' IS NOT NULL`;
  return parseTsv(runPsql(sql), ['vehicle_id', 'fetched_at', 'odometer_km'] as const);
}

function loadSiblings(vehicleIds: string[]): RawSiblingSetupRow[] {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${id}'`).join(',');
  const sql = `
    SELECT vehicle_id::text, id::text, installed_at::text, installed_odometer_km::text, status::text
    FROM vehicle_tire_setups
    WHERE vehicle_id IN (${inList})`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'setup_id',
    'installed_at',
    'installed_odometer_km',
    'status',
  ] as const);
}

function loadTripsAfterInstallKm(setup: RawSetupRow): number | undefined {
  if (!setup.installed_at) return undefined;
  const sql = `
    SELECT COALESCE(SUM(distance_km), 0)::text
    FROM vehicle_trips
    WHERE vehicle_id = '${setup.vehicle_id}'
      AND end_time IS NOT NULL
      AND end_time >= '${setup.installed_at}'::timestamptz`;
  try {
    const raw = runPsql(sql);
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function writeOutputs(report: ReturnType<typeof auditBackfillCandidates>): void {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const outputDir = parseArg('--output-dir') ?? path.join(repoRoot, 'docs', 'audits', 'data');
  const reportPath =
    parseArg('--report') ??
    path.join(repoRoot, 'docs', 'audits', 'tire-odometer-anchor-backfill-candidates-2026-07.md');

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'tire-odometer-anchor-backfill-candidates-2026-07.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(reportPath, renderBackfillAuditMarkdown(report), 'utf8');

  console.log(JSON.stringify({ readOnly: true, jsonPath, reportPath, summary: report.summary }, null, 2));
}

function runFixturesAudit(): void {
  writeOutputs(
    auditBackfillCandidates(buildSyntheticBackfillFixtures(), {
      auditId: AUDIT_ID,
      mode: 'fixtures',
    }),
  );
}

function runDatabaseAudit(limit?: number): void {
  assertSafeTireOdometerAnchorAuditTarget({
    allowRemote: process.argv.includes('--allow-remote-db'),
    allowProd: process.env.TIRE_ODOMETER_ANCHOR_AUDIT_ALLOW_PROD === '1',
  });

  const setups = loadSetups(limit);
  const setupIds = setups.map((s) => s.setup_id);
  const vehicleIds = [...new Set(setups.map((s) => s.vehicle_id))];

  const inputs = setups.map((setup) =>
    buildSetupAuditInputFromRaw({
      setup,
      measurements: loadMeasurements(setupIds),
      handovers: loadHandovers(vehicleIds),
      snapshots: loadSnapshots(vehicleIds),
      trips: loadTrips(vehicleIds),
      workshopDocs: loadWorkshopDocs(vehicleIds),
      hmRows: loadHmRows(vehicleIds),
      siblings: loadSiblings(vehicleIds),
      tripsAfterInstallKm: loadTripsAfterInstallKm(setup),
    }),
  );

  writeOutputs(auditBackfillCandidates(inputs, { auditId: AUDIT_ID, mode: 'database' }));
}

function main(): void {
  loadEnv();

  if (process.argv.includes('--apply')) {
    throw new Error('Apply mode is intentionally unsupported — this audit is read-only.');
  }

  const limitRaw = parseArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive number');
  }

  if (process.argv.includes('--fixtures-only') || !process.env.DATABASE_URL) {
    runFixturesAudit();
    return;
  }

  runDatabaseAudit(limit);
}

main();
