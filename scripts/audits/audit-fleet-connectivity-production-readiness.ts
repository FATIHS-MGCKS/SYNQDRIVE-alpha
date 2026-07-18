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
