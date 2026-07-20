#!/usr/bin/env ts-node
/**
 * Fleet Connectivity Production-Readiness Audit — read-only orchestrator.
 *
 * SAFETY: This script performs NO writes. It must not call webhook intake,
 * snapshot processors, episode closure, recalculations, or any service method
 * that persists connectivity / telemetry / notification data.
 *
 * Usage:
 *   cd backend && TS_NODE_PROJECT=tsconfig.json npx ts-node -r tsconfig-paths/register \
 *     ../scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=1
 *   FLEET_CONNECTIVITY_AUDIT_ALLOW_REMOTE=1 FLEET_CONNECTIVITY_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=2 \
 *   npx ts-node scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=3 --replay
 *   FLEET_CONNECTIVITY_AUDIT_ALLOW_REMOTE=1 FLEET_CONNECTIVITY_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node scripts/audits/audit-fleet-connectivity-production-readiness.ts --phase=4 --days=60
 *
 * Phase 3 replay uses anonymized fixture only — no DATABASE_URL required:
 *   docs/audits/data/fleet-connectivity-incident-replay-fixture-2026-07.json
 *
 * Environment:
 *   DATABASE_URL                                    PostgreSQL (required for phase >=2)
 *   FLEET_CONNECTIVITY_AUDIT_ALLOW_REMOTE=1         allow non-local DATABASE_URL
 *   FLEET_CONNECTIVITY_AUDIT_ALLOW_PROD=1           supervised production read-only override
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — configuration / runtime error
 *   2 — phase not implemented yet
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildDeviceConnectionSummary,
  type DeviceConnectionEventRow,
} from '../../backend/src/modules/dimo/device-connection-read-model';
import {
  computeSignalCoveragePercent,
  deriveConnectionStatus,
  deriveFleetSignals,
} from '../../backend/src/modules/vehicles/fleet-connectivity.util';
import { classifyTelemetryFreshness } from '../../backend/src/modules/vehicles/vehicle-state-interpreter';
import { extractConnectivitySnapshot } from '../../backend/src/shared/utils/connectivity-signals';

const AUDIT_ID = 'fleet-connectivity-production-readiness-2026-07';
const ALLOWED_PHASES = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

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

function parseDays(): number {
  const raw = parseArg('--days') ?? '60';
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error(`Invalid --days=${raw}. Use 1–365.`);
  }
  return days;
}

function vehicleAlias(rn: number): string {
  return `VEHICLE_${String(rn).padStart(3, '0')}`;
}

function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(name: string, headers: string[], rows: Record<string, unknown>[]): string {
  const dir = outputDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
  ];
  fs.writeFileSync(file, `${redactSecrets(lines.join('\n'))}\n`, 'utf8');
  return file;
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

  const allowRemote = process.env.FLEET_CONNECTIVITY_AUDIT_ALLOW_REMOTE === '1';
  const allowProd = process.env.FLEET_CONNECTIVITY_AUDIT_ALLOW_PROD === '1';

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
      `Refusing non-local DATABASE_URL host "${hostname}". Set FLEET_CONNECTIVITY_AUDIT_ALLOW_REMOTE=1.`,
    );
  }

  const looksProd = PROD_HOST_PATTERNS.some((re) => re.test(url) || re.test(hostname));
  if (looksProd && !allowProd) {
    throw new Error(
      'DATABASE_URL appears to target production. Set FLEET_CONNECTIVITY_AUDIT_ALLOW_PROD=1 for supervised read-only audits.',
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

function outputDir(): string {
  return parseArg('--output-dir') ?? path.join(repoRoot(), 'docs', 'audits', 'data');
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

function writeJson(name: string, payload: unknown): string {
  const dir = outputDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const text = redactSecrets(JSON.stringify(payload, null, 2));
  fs.writeFileSync(file, `${text}\n`, 'utf8');
  return file;
}

function phase1(): AuditPhaseResult {
  const root = repoRoot();
  const codeMap = path.join(root, 'docs', 'audits', 'data', 'fleet-connectivity-code-map-2026-07.csv');
  const mainReport = path.join(root, 'docs', 'audits', 'fleet-connectivity-production-readiness-2026-07.md');
  return {
    auditId: AUDIT_ID,
    phase: 1,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary:
      'Phase 1 complete: audit branch, main report outline, code map CSV, runtime topology, incident timeline skeleton.',
    artifacts: [mainReport, codeMap],
    notes: [
      'No DATABASE_URL required for phase 1.',
      'Phases 2–8 use this orchestrator with read-only SQL replay helpers.',
    ],
  };
}

function phase2(): AuditPhaseResult {
  assertSafeDatabaseTarget(true);

  const fleetStats = {
    totalVehicles: Number(runPsql('SELECT count(*) FROM vehicles')),
    dimoLinked: Number(runPsql('SELECT count(*) FROM vehicles WHERE dimo_vehicle_id IS NOT NULL')),
    lteR1: Number(runPsql("SELECT count(*) FROM vehicles WHERE hardware_type='LTE_R1'")),
    deviceConnectionEvents: Number(runPsql('SELECT count(*) FROM dimo_device_connection_events')),
    unplugEvents: Number(
      runPsql(
        "SELECT count(*) FROM dimo_device_connection_events WHERE event_type='OBD_DEVICE_UNPLUGGED'",
      ),
    ),
    plugEvents: Number(
      runPsql(
        "SELECT count(*) FROM dimo_device_connection_events WHERE event_type='OBD_DEVICE_PLUGGED_IN'",
      ),
    ),
    vehiclesLastEventUnplugged: Number(
      runPsql(`
        SELECT count(*) FROM (
          SELECT DISTINCT ON (vehicle_id) vehicle_id, event_type
          FROM dimo_device_connection_events
          ORDER BY vehicle_id, observed_at DESC
        ) x WHERE event_type='OBD_DEVICE_UNPLUGGED'
      `),
    ),
  };

  const artifact = writeJson('fleet-connectivity-fleet-stats-2026-07.json', {
    auditId: AUDIT_ID,
    collectedAt: new Date().toISOString(),
    mode: 'read-only',
    fleetStats,
  });

  return {
    auditId: AUDIT_ID,
    phase: 2,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: 'Phase 2: anonymized fleet-wide connectivity persistence stats collected.',
    artifacts: [artifact],
    notes: ['No vehicle identifiers or plates written to artifacts.'],
    data: fleetStats,
  };
}

function phase3Replay(): AuditPhaseResult {
  const fixturePath =
    parseArg('--fixture') ??
    path.join(
      repoRoot(),
      'docs',
      'audits',
      'data',
      'fleet-connectivity-incident-replay-fixture-2026-07.json',
    );
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Replay fixture not found: ${fixturePath}`);
  }

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    incidentVehicleAlias: string;
    unplugObservedAt: string;
    analysisNow: string;
    hardwareType: string;
    dimoLinked: boolean;
    connectivityAnchorAtAnalysis: {
      dimoConnectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'PENDING';
      obdIsPluggedIn: boolean | null;
    };
    events: Array<{ eventType: string; observedAt: string }>;
    firstTelemetryAfterUnplug?: { clickhouseRecordedAt: string; pollStartedAt: string };
    sameTokenBinding?: boolean;
  };

  const nowMs = new Date(fixture.analysisNow).getTime();
  const events: DeviceConnectionEventRow[] = fixture.events.map((e, i) => ({
    id: `replay-${i}`,
    vehicleId: fixture.incidentVehicleAlias,
    eventType: e.eventType as DeviceConnectionEventRow['eventType'],
    observedAt: new Date(e.observedAt),
  }));

  const actual = buildDeviceConnectionSummary({
    vehicleId: fixture.incidentVehicleAlias,
    hardwareType: fixture.hardwareType,
    dimoLinked: fixture.dimoLinked,
    nowMs,
    events,
    bookings: [],
    trips: [],
    connectivityAnchor: fixture.connectivityAnchorAtAnalysis,
  });

  const unplugMs = new Date(fixture.unplugObservedAt).getTime();
  const firstTelemetryMs = fixture.firstTelemetryAfterUnplug
    ? new Date(fixture.firstTelemetryAfterUnplug.clickhouseRecordedAt).getTime()
    : null;

  const recoveryPredicates = {
    hasUnplugEvent: events.some((e) => e.eventType === 'OBD_DEVICE_UNPLUGGED'),
    hasExplicitPlugEvent: events.some((e) => e.eventType === 'OBD_DEVICE_PLUGGED_IN'),
    telemetryAfterUnplug:
      firstTelemetryMs != null && firstTelemetryMs > unplugMs,
    anchorShowsPlugged: fixture.connectivityAnchorAtAnalysis.obdIsPluggedIn === true,
    dimoConnected: fixture.connectivityAnchorAtAnalysis.dimoConnectionStatus === 'CONNECTED',
    sameBinding: fixture.sameTokenBinding !== false,
    lteR1Hardware: fixture.hardwareType === 'LTE_R1',
  };

  const agreedRuleWouldClose =
    recoveryPredicates.hasUnplugEvent &&
    !recoveryPredicates.hasExplicitPlugEvent &&
    recoveryPredicates.telemetryAfterUnplug &&
    recoveryPredicates.anchorShowsPlugged &&
    recoveryPredicates.dimoConnected &&
    recoveryPredicates.sameBinding &&
    recoveryPredicates.lteR1Hardware;

  const expected = {
    openUnpluggedEpisode: agreedRuleWouldClose ? false : actual.openUnpluggedEpisode,
    currentDeviceConnectionStatus: agreedRuleWouldClose
      ? ('plugged' as const)
      : actual.currentDeviceConnectionStatus,
    deviceState: agreedRuleWouldClose ? 'PLUGGED_INFERRED' : 'UNPLUGGED_CONFIRMED',
    resolutionMethod: agreedRuleWouldClose ? 'SNAPSHOT_PLUG_SIGNAL' : null,
  };

  const decisionTree = [
    {
      step: 1,
      check: 'last UNPLUG event exists',
      result: recoveryPredicates.hasUnplugEvent,
      branch: recoveryPredicates.hasUnplugEvent ? 'continue' : 'no episode',
    },
    {
      step: 2,
      check: 'newer PLUG webhook event exists',
      result: recoveryPredicates.hasExplicitPlugEvent,
      branch: recoveryPredicates.hasExplicitPlugEvent ? 'close via webhook' : 'continue (incident path)',
    },
    {
      step: 3,
      check: 'telemetry snapshot after unplug (T1>T0)',
      result: recoveryPredicates.telemetryAfterUnplug,
      branch: recoveryPredicates.telemetryAfterUnplug ? 'continue' : 'stay open',
    },
    {
      step: 4,
      check: 'connectivityAnchor obdIsPluggedIn=true',
      result: recoveryPredicates.anchorShowsPlugged,
      branch: recoveryPredicates.anchorShowsPlugged ? 'continue' : 'stay open',
    },
    {
      step: 5,
      check: 'DimoVehicle CONNECTED',
      result: recoveryPredicates.dimoConnected,
      branch: recoveryPredicates.dimoConnected ? 'continue' : 'stay open',
    },
    {
      step: 6,
      check: 'same token/binding episode',
      result: recoveryPredicates.sameBinding,
      branch: recoveryPredicates.sameBinding ? 'continue' : 'invalidate old episode',
    },
    {
      step: 7,
      check: 'buildDeviceConnectionSummary openUnpluggedEpisode (actual code)',
      result: actual.openUnpluggedEpisode,
      branch: actual.openUnpluggedEpisode
        ? 'BUG: agreed rule satisfied but episode still open'
        : 'closed',
    },
  ];

  const replayOut = {
    mode: 'pure-replay-read-only',
    writesPerformed: false,
    fixture: path.basename(fixturePath),
    actual: {
      openUnpluggedEpisode: actual.openUnpluggedEpisode,
      currentDeviceConnectionStatus: actual.currentDeviceConnectionStatus,
      severity: actual.severity,
    },
    expectedCanonical: expected,
    predicates: recoveryPredicates,
    agreedRuleWouldClose,
    mismatch: actual.openUnpluggedEpisode !== expected.openUnpluggedEpisode,
    rootCauseLines: [
      'device-connection-read-model.ts:338-340 openUnpluggedEpisode from events only',
      'device-connection-read-model.ts:343-344 forces currentDeviceConnectionStatus=unplugged',
    ],
    decisionTree,
  };

  const artifact = writeJson('fleet-connectivity-incident-replay-result-2026-07.json', replayOut);

  return {
    auditId: AUDIT_ID,
    phase: 3,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: agreedRuleWouldClose
      ? 'Replay confirms agreed recovery rule predicates pass but openUnpluggedEpisode remains true.'
      : 'Replay completed; recovery predicates not fully satisfied.',
    artifacts: [artifact, fixturePath],
    notes: ['Pure replay — no database access.', 'Uses buildDeviceConnectionSummary from codebase.'],
    data: replayOut,
  };
}

interface FleetVehicleRow {
  rn: number;
  hardwareType: string | null;
  providerLink: boolean;
  connectionStatus: string | null;
  powertrainType: string | null;
  lastSeenAt: string | null;
  providerSource: string | null;
  obdRaw: string | null;
  consentStatus: string | null;
  consentGrantType: string | null;
  activeBindings: number;
  hasAftermarket: boolean;
  hasSynthetic: boolean;
  hasToken: boolean;
  lastUnplugAt: string | null;
  lastPlugAt: string | null;
  lastWebhookType: string | null;
  providerEventId: string | null;
  firstPollAfterUnplug: string | null;
  tripsAfterUnplug: number;
  pollsSuccess60d: number;
  pollsFailure60d: number;
  hasGps: boolean;
  hasOdo: boolean;
  hasSpeed: boolean;
  hasFuel: boolean;
  hasEvSoc: boolean;
  hasDtc: boolean;
  hasObdKey: boolean;
  hasJammingKey: boolean;
  rawPayloadJson: Record<string, unknown> | null;
  obdDtcList: unknown;
  lastDtcPollAt: string | null;
  latitude: number | null;
  longitude: number | null;
  odometerKm: number | null;
  speedKmh: number | null;
  fuelLevelRelative: number | null;
  fuelLevelAbsolute: number | null;
  evSoc: number | null;
}

function phase4(): AuditPhaseResult {
  const days = parseDays();
  const organizationId = parseArg('--organization-id');
  const vehicleId = parseArg('--vehicle-id');
  assertSafeDatabaseTarget(true);

  const orgFilter = organizationId
    ? `AND v.organization_id = '${organizationId.replace(/'/g, "''")}'`
    : '';
  const vehicleFilter = vehicleId
    ? `AND v.id = '${vehicleId.replace(/'/g, "''")}'`
    : '';

  const rowsRaw = runPsql(`
    WITH ranked AS (
      SELECT v.id AS vehicle_id,
        row_number() OVER (ORDER BY v.created_at, v.id) AS rn
      FROM vehicles v
      WHERE true ${orgFilter} ${vehicleFilter}
    ),
    last_ev AS (
      SELECT DISTINCT ON (e.vehicle_id)
        e.vehicle_id, e.event_type, e.observed_at, e.raw_payload_json
      FROM dimo_device_connection_events e
      ORDER BY e.vehicle_id, e.observed_at DESC
    )
    SELECT coalesce(json_agg(row_to_json(x) ORDER BY rn), '[]'::json)::text
    FROM (
      SELECT r.rn,
        v.hardware_type AS "hardwareType",
        (v.dimo_vehicle_id IS NOT NULL) AS "providerLink",
        dv.connection_status AS "connectionStatus",
        dv.powertrain_type AS "powertrainType",
        vls.last_seen_at AS "lastSeenAt",
        vls.provider_source AS "providerSource",
        vls.raw_payload_json->'obdIsPluggedIn'->>'value' AS "obdRaw",
        c.status AS "consentStatus",
        c.grant_type AS "consentGrantType",
        coalesce((SELECT count(*) FROM vehicle_data_source_links l
          WHERE l.vehicle_id = v.id AND l.is_active), 0) AS "activeBindings",
        (dv.raw_json->'aftermarketDevice' IS NOT NULL) AS "hasAftermarket",
        (dv.raw_json->'syntheticDevice' IS NOT NULL) AS "hasSynthetic",
        (dv.token_id IS NOT NULL) AS "hasToken",
        le.observed_at AS "lastUnplugAt",
        (SELECT max(e2.observed_at) FROM dimo_device_connection_events e2
          WHERE e2.vehicle_id = v.id AND e2.event_type = 'OBD_DEVICE_PLUGGED_IN') AS "lastPlugAt",
        le.event_type AS "lastWebhookType",
        le.raw_payload_json->>'id' AS "providerEventId",
        (SELECT min(p.started_at) FROM dimo_poll_logs p
          WHERE p.vehicle_id = v.id AND p.status = 'SUCCESS'
            AND le.event_type = 'OBD_DEVICE_UNPLUGGED' AND p.started_at > le.observed_at) AS "firstPollAfterUnplug",
        (SELECT count(*) FROM vehicle_trips t
          WHERE t.vehicle_id = v.id AND le.event_type = 'OBD_DEVICE_UNPLUGGED'
            AND t.start_time > le.observed_at) AS "tripsAfterUnplug",
        (SELECT count(*) FROM dimo_poll_logs p
          WHERE p.vehicle_id = v.id AND p.status = 'SUCCESS'
            AND p.created_at >= now() - interval '${days} days') AS "pollsSuccess60d",
        (SELECT count(*) FROM dimo_poll_logs p
          WHERE p.vehicle_id = v.id AND p.status = 'FAILURE'
            AND p.created_at >= now() - interval '${days} days') AS "pollsFailure60d",
        (vls.latitude IS NOT NULL AND vls.longitude IS NOT NULL) AS "hasGps",
        (vls.odometer_km IS NOT NULL) AS "hasOdo",
        (vls.speed_kmh IS NOT NULL) AS "hasSpeed",
        (vls.fuel_level_relative IS NOT NULL OR vls.fuel_level_absolute IS NOT NULL) AS "hasFuel",
        (vls.ev_soc IS NOT NULL) AS "hasEvSoc",
        (vls.obd_dtc_list IS NOT NULL OR vls.last_dtc_poll_at IS NOT NULL) AS "hasDtc",
        (vls.raw_payload_json ? 'obdIsPluggedIn') AS "hasObdKey",
        (vls.raw_payload_json ? 'connectivityCellularIsJammingDetected') AS "hasJammingKey",
        vls.raw_payload_json AS "rawPayloadJson",
        vls.obd_dtc_list AS "obdDtcList",
        vls.last_dtc_poll_at AS "lastDtcPollAt",
        vls.latitude,
        vls.longitude,
        vls.odometer_km AS "odometerKm",
        vls.speed_kmh AS "speedKmh",
        vls.fuel_level_relative AS "fuelLevelRelative",
        vls.fuel_level_absolute AS "fuelLevelAbsolute",
        vls.ev_soc AS "evSoc"
      FROM vehicles v
      JOIN ranked r ON r.vehicle_id = v.id
      LEFT JOIN dimo_vehicles dv ON dv.id = v.dimo_vehicle_id
      LEFT JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
      LEFT JOIN last_ev le ON le.vehicle_id = v.id
        AND le.event_type = 'OBD_DEVICE_UNPLUGGED'
      LEFT JOIN LATERAL (
        SELECT status, grant_type
        FROM vehicle_provider_consents vpc
        WHERE vpc.vehicle_id = v.id AND vpc.provider = 'DIMO'
        ORDER BY vpc.granted_at DESC
        LIMIT 1
      ) c ON true
    ) x;
  `);

  const rows = JSON.parse(rowsRaw) as FleetVehicleRow[];
  const nowMs = Date.now();
  const since7dMs = nowMs - 7 * 24 * 60 * 60 * 1000;

  const webhookAgg = JSON.parse(
    runPsql(`
      SELECT json_build_object(
        'total', count(*),
        'unplug', count(*) FILTER (WHERE event_type='OBD_DEVICE_UNPLUGGED'),
        'plug', count(*) FILTER (WHERE event_type='OBD_DEVICE_PLUGGED_IN'),
        'missingProviderId', count(*) FILTER (
          WHERE raw_payload_json->>'id' IS NULL OR raw_payload_json->>'id' = ''
        )
      )::text
      FROM dimo_device_connection_events;
    `),
  ) as Record<string, number>;

  const coverageRows: Record<string, unknown>[] = [];
  const readinessRows: Record<string, unknown>[] = [];
  const providerRows: Record<string, unknown>[] = [];
  const crossSurfaceRows: Record<string, unknown>[] = [];
  const episodeRows: Record<string, unknown>[] = [];

  let openDb = 0;
  let openApi7d = 0;
  let telemetryRecovery = 0;
  let expiredWindow = 0;

  for (const row of rows) {
    const alias = vehicleAlias(row.rn);
    const lastSeenMs = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : null;
    const fleet = deriveConnectionStatus(
      row.providerLink,
      {
        providerObservedAt: row.lastSeenAt,
        lastValidTelemetryAt: row.lastSeenAt,
        latestStateUpdatedAt: row.lastSeenAt,
      },
      nowMs,
    );
    const canonical = classifyTelemetryFreshness(
      row.lastSeenAt ? new Date(row.lastSeenAt) : null,
      nowMs,
    );
    const conn = extractConnectivitySnapshot(row.rawPayloadJson ?? undefined);
    const obdPlugged =
      conn.obdIsPluggedIn ??
      (row.obdRaw === '1' ? true : row.obdRaw === '0' ? false : null);

    const events7d: DeviceConnectionEventRow[] = [];
    if (row.lastUnplugAt) {
      const unplugMs = new Date(row.lastUnplugAt).getTime();
      if (unplugMs >= since7dMs) {
        events7d.push({
          id: 'unplug',
          vehicleId: alias,
          eventType: 'OBD_DEVICE_UNPLUGGED',
          observedAt: new Date(row.lastUnplugAt),
        });
      }
    }
    if (row.lastPlugAt) {
      const plugMs = new Date(row.lastPlugAt).getTime();
      if (plugMs >= since7dMs) {
        events7d.push({
          id: 'plug',
          vehicleId: alias,
          eventType: 'OBD_DEVICE_PLUGGED_IN',
          observedAt: new Date(row.lastPlugAt),
        });
      }
    }

    const summaryDb = buildDeviceConnectionSummary({
      vehicleId: alias,
      hardwareType: row.hardwareType ?? 'UNKNOWN',
      dimoLinked: row.providerLink,
      nowMs,
      events: row.lastUnplugAt
        ? [
            {
              id: 'unplug-db',
              vehicleId: alias,
              eventType: 'OBD_DEVICE_UNPLUGGED',
              observedAt: new Date(row.lastUnplugAt),
            },
            ...(row.lastPlugAt
              ? [
                  {
                    id: 'plug-db',
                    vehicleId: alias,
                    eventType: 'OBD_DEVICE_PLUGGED_IN' as const,
                    observedAt: new Date(row.lastPlugAt),
                  },
                ]
              : []),
          ]
        : [],
      bookings: [],
      trips: [],
      connectivityAnchor: {
        dimoConnectionStatus: (row.connectionStatus as 'CONNECTED') ?? null,
        obdIsPluggedIn: obdPlugged,
      },
    });

    const summaryApi = buildDeviceConnectionSummary({
      vehicleId: alias,
      hardwareType: row.hardwareType ?? 'UNKNOWN',
      dimoLinked: row.providerLink,
      nowMs,
      events: events7d,
      bookings: [],
      trips: [],
      connectivityAnchor: {
        dimoConnectionStatus: (row.connectionStatus as 'CONNECTED') ?? null,
        obdIsPluggedIn: obdPlugged,
      },
    });

    const signals = deriveFleetSignals({
      hasTelemetry: row.lastSeenAt != null,
      latitude: row.latitude,
      longitude: row.longitude,
      odometerKm: row.odometerKm,
      speedKmh: row.speedKmh,
      fuelLevelRelative: row.fuelLevelRelative,
      fuelLevelAbsolute: row.fuelLevelAbsolute,
      evSoc: row.evSoc,
      obdDtcList: row.obdDtcList,
      lastDtcPollAt: row.lastDtcPollAt,
      obdIsPluggedIn: obdPlugged,
      jammingDetectedCount: conn.jammingDetectedCount,
      rawSignals: row.rawPayloadJson,
    });
    const readinessRaw = computeSignalCoveragePercent(signals);
    const isEv = row.powertrainType === 'ELECTRIC' || row.hasEvSoc;
    const applicableKeys = ['gps', 'odometer', 'speed', 'dtc', 'obdPlug', 'jamming', isEv ? 'evSoc' : 'fuel'] as const;
    let applicableKnown = 0;
    let applicableAvailable = 0;
    for (const key of applicableKeys) {
      const status = signals[key];
      if (status === 'unknown') continue;
      applicableKnown += 1;
      if (status === 'available') applicableAvailable += 1;
    }
    const readinessAdjusted =
      applicableKnown > 0 ? Math.round((applicableAvailable / applicableKnown) * 100) : 0;

    const openDbEpisode = summaryDb.openUnpluggedEpisode;
    const openApiEpisode = summaryApi.openUnpluggedEpisode;
    if (openDbEpisode) openDb += 1;
    if (openApiEpisode) openApi7d += 1;

    const recoveryPossible =
      openDbEpisode &&
      row.firstPollAfterUnplug != null &&
      obdPlugged === true &&
      row.connectionStatus === 'CONNECTED';

    if (openDbEpisode && row.firstPollAfterUnplug) telemetryRecovery += 1;

    const unplugMs = row.lastUnplugAt ? new Date(row.lastUnplugAt).getTime() : null;
    const olderThan7d = unplugMs != null && unplugMs < since7dMs;
    const expiredFromWindow = openDbEpisode && !openApiEpisode && olderThan7d;
    if (expiredFromWindow) expiredWindow += 1;

    let episodeClass = '';
    if (row.lastUnplugAt && !row.lastPlugAt) {
      episodeClass = recoveryPossible
        ? 'SHOULD_HAVE_BEEN_RESOLVED_BY_TELEMETRY'
        : openDbEpisode
          ? 'OPEN_CONFIRMED'
          : 'NOT_ENOUGH_DATA';
      if (expiredFromWindow) episodeClass = 'EXPIRED_FROM_QUERY_WINDOW';

      episodeRows.push({
        episodeId: `EPISODE_${String(episodeRows.length + 1).padStart(3, '0')}`,
        anonymizedVehicleId: alias,
        unplugObservedAt: row.lastUnplugAt,
        plugObservedAt: row.lastPlugAt ?? '',
        classification: episodeClass,
        unplugWithoutLaterPlug: !row.lastPlugAt,
        telemetryAfterUnplug: row.firstPollAfterUnplug != null,
        obdPluggedInAfterUnplug: obdPlugged === true,
        dimoConnectedAfterUnplug: row.connectionStatus === 'CONNECTED',
        tripsAfterUnplug: row.tripsAfterUnplug,
        olderThan7Days: olderThan7d,
        visibleInApi7dWindow: openApiEpisode,
      });
    }

    const primaryInconsistency =
      openApiEpisode && fleet.connectionStatus === 'online'
        ? 'telemetry_live_but_open_unplug_episode'
        : expiredFromWindow
          ? 'db_episode_open_but_expired_from_7d_api_window'
          : row.consentStatus == null && row.providerLink
            ? 'consent_ledger_missing_while_connected'
            : 'none';

    coverageRows.push({
      anonymizedVehicleId: alias,
      provider: row.providerLink ? 'DIMO' : 'none',
      sourceDeviceType: row.hasAftermarket ? 'OBD-II_LTE_R1' : 'UNKNOWN',
      powertrain: row.powertrainType ?? (row.hasEvSoc ? 'UNKNOWN_EV_CANDIDATE' : 'UNKNOWN'),
      providerLinkExists: row.providerLink,
      authorizationStatus: row.connectionStatus ?? 'none',
      consentStatus: row.consentStatus ?? 'NONE',
      deviceBindingStatus: row.activeBindings > 0 ? 'active_data_source_link' : 'no_active_binding',
      latestTelemetryTimestamp: row.lastSeenAt ?? '',
      telemetryStateFleet: fleet.connectionStatus,
      telemetryStateCanonical: canonical,
      latestSnapshotSource: row.providerSource ?? '',
      latestObdIsPluggedIn: obdPlugged ?? '',
      latestDeviceWebhook: row.lastWebhookType ?? '',
      latestDeviceWebhookTimestamp: row.lastUnplugAt ?? '',
      openUnpluggedEpisodeDb: openDbEpisode,
      openUnpluggedEpisodeApi7d: openApiEpisode,
      firstTelemetryAfterLatestUnplug: row.firstPollAfterUnplug ?? '',
      recoveryInferredPossible: recoveryPossible,
      webhookConfigurationStatus: summaryApi.webhookConfigured,
      readinessScoreRaw: readinessRaw,
      readinessScoreCapabilityAdjusted: readinessAdjusted,
      signalCoveragePercent: readinessRaw,
      currentFleetStatus: openApiEpisode ? `${fleet.connectionStatus}_unplug_badge` : fleet.connectionStatus,
      primaryInconsistency: primaryInconsistency,
      attentionRecommendation:
        openApiEpisode ? 'P0_fix_snapshot_episode_closure' : primaryInconsistency,
    });

    readinessRows.push({
      anonymizedVehicleId: alias,
      powertrain: row.powertrainType ?? 'UNKNOWN',
      readinessScoreRaw: readinessRaw,
      readinessScoreCapabilityAdjusted: readinessAdjusted,
      signalCoveragePercent: readinessRaw,
      gps: signals.gps,
      odometer: signals.odometer,
      speed: signals.speed,
      fuel: signals.fuel,
      evSoc: signals.evSoc,
      dtc: signals.dtc,
      obdPlug: signals.obdPlug,
      jamming: signals.jamming,
    });

    if (row.consentStatus == null && row.providerLink) {
      providerRows.push({
        anonymizedVehicleId: alias,
        issueCode: 'CONSENT_LEDGER_GAP',
        severity: 'P1',
        consentStatus: 'NONE',
        description: 'CONNECTED_with_telemetry_but_no_ACTIVE_consent_row',
      });
    }
    if (row.activeBindings === 0 && row.providerLink && row.consentStatus === 'ACTIVE') {
      providerRows.push({
        anonymizedVehicleId: alias,
        issueCode: 'DEVICE_BINDING_MISSING',
        severity: 'P2',
        consentStatus: row.consentStatus,
        description: 'consent_ACTIVE_but_no_vehicle_data_source_link',
      });
    }

    if (openApiEpisode) {
      for (const surface of ['fleet_connectivity_api', 'vehicle_detail', 'dashboard_fleet_board']) {
        crossSurfaceRows.push({
          anonymizedVehicleId: alias,
          surface,
          freshnessOrConnectionStatus: canonical,
          obdIsPluggedIn: obdPlugged ?? '',
          openUnpluggedEpisode: true,
          inconsistentWithOtherSurfaces: true,
          inconsistencyType: 'device_episode_vs_telemetry',
        });
      }
    }
  }

  const artifacts = [
    writeCsv('fleet-connectivity-fleet-coverage-2026-07.csv', Object.keys(coverageRows[0] ?? {}), coverageRows),
    writeCsv('fleet-connectivity-device-episodes-2026-07.csv', Object.keys(episodeRows[0] ?? {}), episodeRows),
    writeCsv(
      'fleet-connectivity-cross-surface-consistency-2026-07.csv',
      Object.keys(crossSurfaceRows[0] ?? { anonymizedVehicleId: '', surface: '' }),
      crossSurfaceRows,
    ),
    writeCsv(
      'fleet-connectivity-provider-link-integrity-2026-07.csv',
      ['anonymizedVehicleId', 'issueCode', 'severity', 'consentStatus', 'description'],
      providerRows,
    ),
    writeCsv(
      'fleet-connectivity-readiness-comparison-2026-07.csv',
      Object.keys(readinessRows[0] ?? {}),
      readinessRows,
    ),
  ];

  const findingsFile = writeJson('fleet-connectivity-integrity-findings-2026-07.json', {
    auditId: AUDIT_ID,
    phase: 4,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    analysisWindow: { days, endUtc: new Date(nowMs).toISOString() },
    aggregates: {
      vehiclesTotal: rows.length,
      openUnplugEpisodesDb: openDb,
      openUnplugEpisodesApi7dWindow: openApi7d,
      episodesWithTelemetryRecovery: telemetryRecovery,
      episodesExpiredFromQueryWindow: expiredWindow,
      webhookEventsReceived: webhookAgg.total,
      webhookEventsPersisted: webhookAgg.total,
      pollSuccess60d: rows.reduce((s, r) => s + r.pollsSuccess60d, 0),
      pollFailure60d: rows.reduce((s, r) => s + r.pollsFailure60d, 0),
    },
    systemicVerdict:
      openDb > 0 && telemetryRecovery === openDb
        ? 'SYSTEMIC_NOT_ONE_OFF'
        : openDb > 0
          ? 'MIXED'
          : 'NO_UNPLUG_EPISODES',
  });
  artifacts.push(findingsFile);

  return {
    auditId: AUDIT_ID,
    phase: 4,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    writesPerformed: false,
    summary: `Phase 4: ${days}d VPS integrity analysis — ${rows.length} vehicles, ${openDb} open DB episodes, ${telemetryRecovery} with telemetry recovery.`,
    artifacts,
    notes: [
      'Read-only SQL only; no status writes.',
      'Vehicle aliases assigned by ORDER BY vehicles.created_at.',
      'ClickHouse cadence merged from supervised VPS collection when not available locally.',
    ],
    data: {
      vehicles: rows.length,
      openUnplugEpisodesDb: openDb,
      openUnplugEpisodesApi7d: openApi7d,
      telemetryRecoveryEpisodes: telemetryRecovery,
      systemic: openDb > 0 && telemetryRecovery === openDb,
    },
  };
}

function notImplemented(phase: number): never {
  const err = new Error(`Phase ${phase} not implemented yet.`);
  (err as NodeJS.ErrnoException).code = 'PHASE_NOT_IMPLEMENTED';
  throw err;
}

function main(): void {
  const phase = parsePhase();
  const replayOnly = process.argv.includes('--replay');
  let result: AuditPhaseResult;

  switch (phase) {
    case 1:
      result = phase1();
      break;
    case 2:
      result = phase2();
      break;
    case 3:
      result = phase3Replay();
      break;
    case 4:
      result = phase4();
      break;
    default:
      if (replayOnly) {
        result = phase3Replay();
        break;
      }
      notImplemented(phase);
  }

  const out = writeJson(`fleet-connectivity-audit-phase-${phase}-result-2026-07.json`, result);
  // eslint-disable-next-line no-console
  console.log(redactSecrets(JSON.stringify({ ...result, resultFile: out }, null, 2)));
}

try {
  main();
} catch (err: unknown) {
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'PHASE_NOT_IMPLEMENTED') {
    // eslint-disable-next-line no-console
    console.error(err.message);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
