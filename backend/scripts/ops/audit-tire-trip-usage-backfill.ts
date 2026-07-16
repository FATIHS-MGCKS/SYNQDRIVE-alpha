/**
 * Read-only dry-run + controlled apply for historical TireTripUsageLedger backfill (Prompts 12–13).
 *
 * Default: last 60 days, read-only audit report.
 * With --organization-id or --vehicle-id: outputs apply plan (DRY RUN unless --apply).
 *
 * Usage (fixtures — no DB):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts --fixtures-only
 *
 * Usage (dry-run apply plan):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts \
 *     --organization-id=<uuid> --days=60 --batch-size=50 --full-setup-history \
 *     --confirm-git-ref=$(git rev-parse HEAD) \
 *     --confirm-schema-version=20260716230000_tire_trip_usage_replay_safety \
 *     --operator=ops@example --reason=staging-validation --max-batch-size=25 \
 *     --expected-audit-version=tire-trip-usage-backfill-audit-2026-07-v1
 *
 * Usage (controlled apply — never run against production without explicit override):
 *   ...same flags... --confirm-backup --apply --expected-report-hash=<from-plan>
 *
 * Environment:
 *   TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_REMOTE=1
 *   TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_PROD=1
 *   TIRE_TRIP_USAGE_BACKFILL_APPLY_ALLOW_REMOTE=1
 *   TIRE_TRIP_USAGE_BACKFILL_APPLY_ALLOW_PROD=1
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import {
  auditTripBackfillCandidate,
  auditTripUsageBackfill,
  buildSetupKmRollups,
  buildSyntheticTripUsageBackfillFixtures,
  buildSyntheticTripUsageBackfillReport,
  DEFAULT_BACKFILL_LOOKBACK_DAYS,
  renderTripUsageBackfillAuditMarkdown,
  sanitizeTripUsageBackfillReportForExport,
  sumWaypointPlausibilityKm,
  TRIP_USAGE_BACKFILL_AUDIT_ID,
  TRIP_USAGE_BACKFILL_AUDIT_VERSION,
  TRIP_USAGE_BACKFILL_SCHEMA_VERSION,
  type TripBackfillAuditInput,
  type TripBackfillAuditResult,
} from '../../src/modules/vehicle-intelligence/tires/tire-trip-usage-backfill-audit';
import {
  DEFAULT_MAX_BACKFILL_BATCH_SIZE,
  type TripUsageBackfillApplyRequest,
} from '../../src/modules/vehicle-intelligence/tires/tire-trip-usage-backfill-apply';
import { assertSafeTireTripUsageBackfillAuditTarget } from '../../src/modules/vehicle-intelligence/tires/tire-trip-usage-backfill-audit.safety';
import { TireTripUsageBackfillService } from '../../src/modules/vehicle-intelligence/tires/tire-trip-usage-backfill.service';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function currentGitRef(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

function parseTripIds(): string[] {
  return process.argv
    .filter((a) => a.startsWith('--trip-id='))
    .map((a) => a.split('=').slice(1).join('=').trim())
    .filter(Boolean);
}

function hasApplyScope(): boolean {
  return Boolean(parseArg('--organization-id') || parseArg('--vehicle-id') || parseTripIds().length > 0);
}

function buildApplyRequest(): TripUsageBackfillApplyRequest {
  const maxBatchRaw = parseArg('--max-batch-size');
  const maxBatchSize = maxBatchRaw ? Number(maxBatchRaw) : DEFAULT_MAX_BACKFILL_BATCH_SIZE;
  const recalcMaxRaw = parseArg('--recalculate-max-setups');
  const tripIds = parseTripIds();

  return {
    apply: hasFlag('--apply'),
    organizationId: parseArg('--organization-id'),
    vehicleId: parseArg('--vehicle-id'),
    tripIds: tripIds.length > 0 ? tripIds : undefined,
    expectedAuditVersion: parseArg('--expected-audit-version') ?? TRIP_USAGE_BACKFILL_AUDIT_VERSION,
    expectedReportHash: parseArg('--expected-report-hash'),
    confirmGitRef: parseArg('--confirm-git-ref') ?? '',
    confirmSchemaVersion: parseArg('--confirm-schema-version') ?? TRIP_USAGE_BACKFILL_SCHEMA_VERSION,
    confirmBackup: hasFlag('--confirm-backup'),
    operator: parseArg('--operator') ?? '',
    reason: parseArg('--reason') ?? '',
    maxBatchSize,
    recalculate: hasFlag('--recalculate'),
    recalculateMaxSetups: recalcMaxRaw ? Number(recalcMaxRaw) : undefined,
  };
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
    maxBuffer: 80 * 1024 * 1024,
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

function sqlQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function resolveDateRange(): { from: Date; to: Date; lookbackDays: number } {
  const toIso = parseArg('--to');
  const fromIso = parseArg('--from');
  const days = Number(parseArg('--days') ?? DEFAULT_BACKFILL_LOOKBACK_DAYS);
  const lookbackDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_BACKFILL_LOOKBACK_DAYS;
  const to = toIso ? new Date(toIso) : new Date();
  const from = fromIso
    ? new Date(fromIso)
    : new Date(to.getTime() - lookbackDays * 86_400_000);
  return { from, to, lookbackDays };
}

function loadTrips(args: {
  organizationId?: string;
  vehicleId?: string;
  from: Date;
  to: Date;
  batchSize: number;
  offset: number;
}) {
  const filters: string[] = [
    `t.end_time IS NOT NULL`,
    `t.start_time >= '${args.from.toISOString()}'::timestamptz`,
    `t.start_time < '${args.to.toISOString()}'::timestamptz`,
  ];
  if (args.organizationId) {
    filters.push(`v.organization_id = '${sqlQuote(args.organizationId)}'`);
  }
  if (args.vehicleId) {
    filters.push(`t.vehicle_id = '${sqlQuote(args.vehicleId)}'`);
  }
  const sql = `
    SELECT
      t.id::text,
      t.vehicle_id::text,
      v.organization_id::text,
      t.trip_status::text,
      t.start_time::text,
      t.end_time::text,
      COALESCE(t.distance_km, 0)::text,
      COALESCE(t.city_share_percent, 0)::text,
      COALESCE(t.highway_share_percent, 0)::text,
      COALESCE(t.country_share_percent, 0)::text,
      COALESCE(t.harsh_accel_count, 0)::text,
      COALESCE(t.harsh_brake_count, 0)::text,
      COALESCE(t.harsh_corner_count, 0)::text,
      COALESCE(t.trip_analysis_status, '')::text,
      COALESCE(t.analysis_stages_json::text, '')::text,
      COALESCE(t.tire_usage_attribution_status, '')::text,
      COALESCE(t.merge_parent_trip_id::text, '')::text
    FROM vehicle_trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE ${filters.join(' AND ')}
    ORDER BY t.start_time ASC
    LIMIT ${Math.floor(args.batchSize)} OFFSET ${Math.floor(args.offset)}`;
  return parseTsv(runPsql(sql), [
    'trip_id',
    'vehicle_id',
    'organization_id',
    'trip_status',
    'start_time',
    'end_time',
    'distance_km',
    'city_share_percent',
    'highway_share_percent',
    'country_share_percent',
    'harsh_accel_count',
    'harsh_brake_count',
    'harsh_corner_count',
    'trip_analysis_status',
    'analysis_stages_json',
    'tire_usage_attribution_status',
    'merge_parent_trip_id',
  ] as const);
}

function loadMountPeriods(vehicleIds: string[], fullHistory: boolean, from: Date) {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${sqlQuote(id)}'`).join(',');
  const timeFilter = fullHistory
    ? ''
    : `AND (mp.removed_at IS NULL OR mp.removed_at >= '${from.toISOString()}'::timestamptz)`;
  const sql = `
    SELECT
      s.vehicle_id::text,
      mp.tire_setup_id::text,
      mp.installed_at::text,
      COALESCE(mp.removed_at::text, '')::text
    FROM vehicle_tire_setup_mount_periods mp
    JOIN vehicle_tire_setups s ON s.id = mp.tire_setup_id
    WHERE s.vehicle_id IN (${inList})
    ${timeFilter}
    ORDER BY mp.installed_at ASC`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'tire_setup_id',
    'installed_at',
    'removed_at',
  ] as const);
}

function loadSetupFallback(vehicleIds: string[]) {
  if (vehicleIds.length === 0) return [];
  const inList = vehicleIds.map((id) => `'${sqlQuote(id)}'`).join(',');
  const sql = `
    SELECT
      vehicle_id::text,
      id::text,
      COALESCE(installed_at::text, '')::text,
      COALESCE(removed_at::text, '')::text,
      status::text,
      COALESCE(total_km_on_set, 0)::text
    FROM vehicle_tire_setups
    WHERE vehicle_id IN (${inList})`;
  return parseTsv(runPsql(sql), [
    'vehicle_id',
    'setup_id',
    'installed_at',
    'removed_at',
    'status',
    'total_km_on_set',
  ] as const);
}

function loadLedgerRows(tripIds: string[]) {
  if (tripIds.length === 0) return [];
  const inList = tripIds.map((id) => `'${sqlQuote(id)}'`).join(',');
  const sql = `
    SELECT
      trip_id::text,
      tire_setup_id::text,
      source_fingerprint::text,
      distance_km::text,
      COALESCE(invalidated_at::text, '')::text
    FROM tire_trip_usage_ledger
    WHERE trip_id IN (${inList})`;
  return parseTsv(runPsql(sql), [
    'trip_id',
    'tire_setup_id',
    'source_fingerprint',
    'distance_km',
    'invalidated_at',
  ] as const);
}

function loadLedgerKmBySetup(setupIds: string[], from: Date, to: Date) {
  if (setupIds.length === 0) return [];
  const inList = setupIds.map((id) => `'${sqlQuote(id)}'`).join(',');
  const sql = `
    SELECT
      tire_setup_id::text,
      COALESCE(SUM(distance_km), 0)::text
    FROM tire_trip_usage_ledger
    WHERE tire_setup_id IN (${inList})
      AND invalidated_at IS NULL
      AND trip_started_at >= '${from.toISOString()}'::timestamptz
      AND trip_started_at < '${to.toISOString()}'::timestamptz
    GROUP BY tire_setup_id`;
  return parseTsv(runPsql(sql), ['tire_setup_id', 'ledger_km'] as const);
}

function loadOdometerEnvelope(tripIds: string[]) {
  if (tripIds.length === 0) return [];
  const inList = tripIds.map((id) => `'${sqlQuote(id)}'`).join(',');
  const sql = `
    SELECT
      t.id::text AS trip_id,
      MIN(e.odometer_start_km)::text AS odometer_start_km,
      MAX(e.odometer_end_km)::text AS odometer_end_km
    FROM vehicle_trips t
    JOIN vehicle_energy_events e
      ON e.vehicle_id = t.vehicle_id
     AND e.end_time > t.start_time
     AND e.start_time < t.end_time
    WHERE t.id IN (${inList})
      AND e.odometer_start_km IS NOT NULL
      AND e.odometer_end_km IS NOT NULL
    GROUP BY t.id`;
  try {
    return parseTsv(runPsql(sql), [
      'trip_id',
      'odometer_start_km',
      'odometer_end_km',
    ] as const);
  } catch {
    return [];
  }
}

function loadWaypointSummaries(tripIds: string[]) {
  if (tripIds.length === 0) return [];
  const inList = tripIds.map((id) => `'${sqlQuote(id)}'`).join(',');
  const sql = `
    SELECT trip_id::text, latitude::text, longitude::text, recorded_at::text
    FROM vehicle_trip_waypoints
    WHERE trip_id IN (${inList})
    ORDER BY trip_id, recorded_at ASC`;
  try {
    return parseTsv(runPsql(sql), [
      'trip_id',
      'latitude',
      'longitude',
      'recorded_at',
    ] as const);
  } catch {
    return [];
  }
}

function buildTripInputsFromDb(args: {
  organizationId?: string;
  vehicleId?: string;
  from: Date;
  to: Date;
  batchSize: number;
  fullSetupHistory: boolean;
}): TripBackfillAuditInput[] {
  const allTrips: ReturnType<typeof loadTrips> = [];
  let offset = 0;
  for (;;) {
    const batch = loadTrips({ ...args, offset });
    if (batch.length === 0) break;
    allTrips.push(...batch);
    if (batch.length < args.batchSize) break;
    offset += args.batchSize;
  }

  const vehicleIds = [...new Set(allTrips.map((t) => t.vehicle_id))];
  const tripIds = allTrips.map((t) => t.trip_id);

  const mountRows = loadMountPeriods(vehicleIds, args.fullSetupHistory, args.from);
  const setupRows = loadSetupFallback(vehicleIds);
  const ledgerRows = loadLedgerRows(tripIds);
  const odometerRows = loadOdometerEnvelope(tripIds);
  const waypointRows = loadWaypointSummaries(tripIds);

  const mountByVehicle = new Map<string, typeof mountRows>();
  for (const row of mountRows) {
    const list = mountByVehicle.get(row.vehicle_id) ?? [];
    list.push(row);
    mountByVehicle.set(row.vehicle_id, list);
  }

  const setupByVehicle = new Map<string, typeof setupRows>();
  for (const row of setupRows) {
    const list = setupByVehicle.get(row.vehicle_id) ?? [];
    list.push(row);
    setupByVehicle.set(row.vehicle_id, list);
  }

  const ledgerByTrip = new Map(ledgerRows.map((r) => [r.trip_id, r]));
  const odometerByTrip = new Map(odometerRows.map((r) => [r.trip_id, r]));

  const waypointsByTrip = new Map<string, Array<{ latitude: number; longitude: number }>>();
  for (const row of waypointRows) {
    const list = waypointsByTrip.get(row.trip_id) ?? [];
    list.push({ latitude: Number(row.latitude), longitude: Number(row.longitude) });
    waypointsByTrip.set(row.trip_id, list);
  }

  return allTrips.map((trip) => {
    const periods = (mountByVehicle.get(trip.vehicle_id) ?? []).map((p) => ({
      tireSetupId: p.tire_setup_id,
      installedAt: new Date(p.installed_at),
      removedAt: p.removed_at ? new Date(p.removed_at) : null,
    }));
    const setupFallback = (setupByVehicle.get(trip.vehicle_id) ?? []).map((s) => ({
      id: s.setup_id,
      installedAt: s.installed_at || null,
      removedAt: s.removed_at || null,
      status: s.status,
    }));
    const ledger = ledgerByTrip.get(trip.trip_id);
    const odo = odometerByTrip.get(trip.trip_id);
    const wpts = waypointsByTrip.get(trip.trip_id) ?? [];

    let analysisStagesJson: unknown = null;
    if (trip.analysis_stages_json) {
      try {
        analysisStagesJson = JSON.parse(trip.analysis_stages_json);
      } catch {
        analysisStagesJson = null;
      }
    }

    return {
      tripId: trip.trip_id,
      vehicleId: trip.vehicle_id,
      organizationId: trip.organization_id || null,
      tripStatus: trip.trip_status,
      startTime: trip.start_time,
      endTime: trip.end_time || null,
      distanceKm: Number(trip.distance_km),
      citySharePercent: Number(trip.city_share_percent),
      highwaySharePercent: Number(trip.highway_share_percent),
      countrySharePercent: Number(trip.country_share_percent),
      harshAccelCount: Number(trip.harsh_accel_count),
      harshBrakeCount: Number(trip.harsh_brake_count),
      harshCornerCount: Number(trip.harsh_corner_count),
      tripAnalysisStatus: trip.trip_analysis_status || null,
      analysisStagesJson,
      tireUsageAttributionStatus: trip.tire_usage_attribution_status || null,
      mergeParentTripId: trip.merge_parent_trip_id || null,
      mountPeriods: periods,
      setupFallback,
      existingLedger: ledger
        ? {
            tireSetupId: ledger.tire_setup_id,
            sourceFingerprint: ledger.source_fingerprint,
            distanceKm: Number(ledger.distance_km),
            invalidatedAt: ledger.invalidated_at || null,
          }
        : null,
      odometerStartKm: odo?.odometer_start_km ? Number(odo.odometer_start_km) : null,
      odometerEndKm: odo?.odometer_end_km ? Number(odo.odometer_end_km) : null,
      waypointCount: wpts.length,
      waypointPlausibilityKm: wpts.length >= 2 ? sumWaypointPlausibilityKm(wpts) : null,
    } satisfies TripBackfillAuditInput;
  });
}

function writeOutputs(report: ReturnType<typeof auditTripUsageBackfill>): void {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const outputDir = parseArg('--output-dir') ?? path.join(repoRoot, 'docs', 'audits', 'data');
  const reportPath =
    parseArg('--report') ??
    path.join(repoRoot, 'docs', 'audits', 'tire-trip-usage-backfill-dry-run-2026-07.md');

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'tire-trip-usage-backfill-dry-run-2026-07.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(sanitizeTripUsageBackfillReportForExport(report), null, 2),
    'utf8',
  );
  fs.writeFileSync(reportPath, renderTripUsageBackfillAuditMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        auditId: report.auditId,
        jsonPath,
        reportPath,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}

function runFixturesAuditOnly(): void {
  const report = buildSyntheticTripUsageBackfillReport(TRIP_USAGE_BACKFILL_AUDIT_ID);
  writeOutputs(report);
}

function auditTripsFromFixtures(): TripBackfillAuditResult[] {
  return buildSyntheticTripUsageBackfillFixtures().map((input) =>
    auditTripBackfillCandidate(input, TRIP_USAGE_BACKFILL_AUDIT_ID),
  );
}

function runDatabaseAudit(): TripBackfillAuditResult[] {
  assertSafeTireTripUsageBackfillAuditTarget({
    allowRemote: hasFlag('--allow-remote-db'),
    allowProd: hasFlag('--allow-prod-db'),
  });

  const { from, to, lookbackDays } = resolveDateRange();
  const batchSize = Number(parseArg('--batch-size') ?? 200);
  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  const fullSetupHistory = hasFlag('--full-setup-history');

  const inputs = buildTripInputsFromDb({
    organizationId,
    vehicleId,
    from,
    to,
    batchSize: Number.isFinite(batchSize) ? batchSize : 200,
    fullSetupHistory,
  });

  const tripAudits = inputs.map((input) =>
    auditTripBackfillCandidate(input, TRIP_USAGE_BACKFILL_AUDIT_ID),
  );

  const setupIds = [
    ...new Set(
      inputs.flatMap((t) => [
        ...(t.setupFallback?.map((s) => s.id) ?? []),
        ...t.mountPeriods.map((p) => p.tireSetupId),
      ]),
    ),
  ];

  const setupRows = loadSetupFallback([...new Set(inputs.map((t) => t.vehicleId))]);
  const ledgerKmRows = loadLedgerKmBySetup(setupIds, from, to);
  const ledgerKmBySetup = new Map(ledgerKmRows.map((r) => [r.tire_setup_id, Number(r.ledger_km)]));

  const setupRollups = buildSetupKmRollups({
    trips: tripAudits,
    setups: setupRows.map((s) => ({
      setupId: s.setup_id,
      vehicleId: s.vehicle_id,
      status: s.status,
      totalKmOnSet: Number(s.total_km_on_set),
      existingLedgerKm: ledgerKmBySetup.get(s.setup_id) ?? 0,
    })),
    auditSalt: TRIP_USAGE_BACKFILL_AUDIT_ID,
  });

  const report = auditTripUsageBackfill(inputs, {
    mode: 'database',
    auditSalt: TRIP_USAGE_BACKFILL_AUDIT_ID,
    filters: {
      organizationId: organizationId ?? null,
      vehicleId: vehicleId ?? null,
      from: from.toISOString(),
      to: to.toISOString(),
      batchSize: Number.isFinite(batchSize) ? batchSize : 200,
      fullSetupHistory,
      lookbackDays,
    },
    setupRollups,
  });

  writeOutputs(report);
  return tripAudits;
}

async function runBackfillWorkflow(auditTrips: TripBackfillAuditResult[]): Promise<void> {
  const request = buildApplyRequest();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(TireTripUsageBackfillService);
    const { plan, result } = await service.run({
      request,
      auditTrips,
      actualGitRef: currentGitRef(),
      allowRemote: hasFlag('--allow-remote-db'),
      allowProd: process.env.TIRE_TRIP_USAGE_BACKFILL_APPLY_ALLOW_PROD === '1',
    });

    console.log(
      JSON.stringify(
        {
          mode: request.apply ? 'apply' : 'dry-run',
          auditVersion: plan.auditVersion,
          reportHash: plan.reportHash,
          plan: {
            autoApplicable: plan.autoApplicable.length,
            manualReview: plan.manualReview.length,
            skipped: plan.skipped.length,
          },
          result,
          manualReviewTripIds: plan.manualReview.map((i) => i.tripId),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  loadEnv();

  if (hasFlag('--fixtures-only') && !hasApplyScope()) {
    runFixturesAuditOnly();
    return;
  }

  if (hasApplyScope()) {
    const auditTrips = hasFlag('--fixtures-only')
      ? auditTripsFromFixtures()
      : runDatabaseAudit();
    await runBackfillWorkflow(auditTrips);
    return;
  }

  runDatabaseAudit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
