/**
 * Phase 3A.3.1 — FAST GO for pre-armed DIMO LTE_R1 reference capture sessions.
 *
 * Uses authenticated production HTTP API only — does NOT bootstrap AppModule.
 *
 * Required env:
 * - REFERENCE_CAPTURE_OPS_API_BASE_URL (e.g. https://app.synqdrive.eu/api/v1)
 * - REFERENCE_CAPTURE_OPS_BEARER_TOKEN (operator JWT with fleet-condition:write)
 */
import {
  assessPrearmFreshness,
  describeFastGoStatusRejection,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-prearm.policy';
import type { ReferenceCaptureSessionView } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.types';
import { ReferenceCaptureOpsHttpClient } from './reference-capture-ops-http.client';
import {
  assertReferenceCaptureEnabled,
  loadOpsEnv,
  parseOpsArg,
  printReadyToDriveBanner,
} from './reference-capture-ops-shared';

const DEFAULT_PREARM_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_FIRST_CYCLE_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countSignalObservations(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const kind = (row as { observationKind?: string }).observationKind;
    return kind !== 'NATIVE_EVENT' && kind !== 'SESSION_METADATA';
  }).length;
}

function parsePrearmMaxAgeMs(): number {
  const raw = process.env.REFERENCE_CAPTURE_PREARM_MAX_AGE_MS;
  if (!raw) return DEFAULT_PREARM_MAX_AGE_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PREARM_MAX_AGE_MS;
}

function parseFirstCycleTimeoutMs(): number {
  const raw = process.env.REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS;
  if (!raw) return DEFAULT_FIRST_CYCLE_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_FIRST_CYCLE_TIMEOUT_MS;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-fast-go')) {
    throw new Error('Refusing to run without --confirm-fast-go');
  }

  loadOpsEnv();
  assertReferenceCaptureEnabled();

  const organizationId = parseOpsArg('--organization-id');
  const vehicleId = parseOpsArg('--vehicle-id');
  const sessionId = parseOpsArg('--session-id');
  if (!organizationId || !vehicleId || !sessionId) {
    throw new Error('--organization-id, --vehicle-id, and --session-id are required');
  }

  const client = ReferenceCaptureOpsHttpClient.fromEnv();
  const goRequestedAt = new Date();
  const timestamps = {
    goRequestedAt: goRequestedAt.toISOString(),
    startAcceptedAt: null as string | null,
    recordingEnteredAt: null as string | null,
    firstCycleCompletedAt: null as string | null,
    readyToDriveAt: null as string | null,
  };

  const initial = await client.getSession(organizationId, vehicleId, sessionId);
  if (initial.status === 401 || initial.status === 403) {
    printReadyToDriveBanner(false, sessionId, `http_auth_failed:${initial.status}`);
    process.exitCode = 2;
    return;
  }
  if (initial.status !== 200) {
    printReadyToDriveBanner(false, sessionId, `session_lookup_failed:${initial.status}`);
    process.exitCode = 2;
    return;
  }

  const session = initial.data as ReferenceCaptureSessionView;

  if (session.status === 'RECORDING') {
    const cycleCount = session.operational?.cycleCount ?? 0;
    if (cycleCount >= 1) {
      printReadyToDriveBanner(true, sessionId);
      timestamps.readyToDriveAt = new Date().toISOString();
      console.log(
        JSON.stringify({ authority: 'production_http_api', reason: 'already_recording_confirmed', timestamps }, null, 2),
      );
      return;
    }
    printReadyToDriveBanner(false, sessionId, 'recording_without_confirmed_first_cycle');
    process.exitCode = 2;
    return;
  }

  if (session.status !== 'READY') {
    printReadyToDriveBanner(false, sessionId, describeFastGoStatusRejection(session.status as never));
    process.exitCode = 2;
    return;
  }

  const freshness = assessPrearmFreshness({
    status: session.status as never,
    vehicleId: session.vehicleId,
    expectedVehicleId: vehicleId,
    readiness: session.readiness,
    preflight: session.preflight,
    manifestVersion: session.manifestVersion,
    featureEnabled: true,
    preflightMaxAgeMs: parsePrearmMaxAgeMs(),
    nowMs: goRequestedAt.getTime(),
  });
  if (!freshness.fresh) {
    printReadyToDriveBanner(false, sessionId, freshness.blockers.join(','));
    process.exitCode = 2;
    return;
  }

  if (session.operational?.runnerJobId || session.operational?.pendingCycleJobId) {
    printReadyToDriveBanner(false, sessionId, 'unexpected_runner_state_on_ready_session');
    process.exitCode = 2;
    return;
  }

  timestamps.startAcceptedAt = new Date().toISOString();
  const started = await client.startRecording(organizationId, vehicleId, sessionId);
  if (started.status !== 200 && started.status !== 201) {
    printReadyToDriveBanner(false, sessionId, `start_failed:${started.status}`);
    process.exitCode = 2;
    return;
  }
  timestamps.recordingEnteredAt = new Date().toISOString();

  const timeoutMs = parseFirstCycleTimeoutMs();
  const deadline = Date.now() + timeoutMs;
  let cycleCount = 0;
  let signalObservationCount = 0;
  let nextCycleScheduled = false;

  while (Date.now() < deadline) {
    const polled = await client.getSession(organizationId, vehicleId, sessionId);
    if (polled.status !== 200) {
      await sleep(250);
      continue;
    }
    const current = polled.data as ReferenceCaptureSessionView;
    cycleCount = current.operational?.cycleCount ?? 0;
    nextCycleScheduled = Boolean(current.operational?.pendingCycleJobId);

    if (current.status === 'FAILED' || current.status === 'ABORTED') {
      printReadyToDriveBanner(false, sessionId, current.failureReason ?? current.status);
      process.exitCode = 2;
      return;
    }

    if (current.status === 'RECORDING' && cycleCount >= 1) {
      const obs = await client.listObservations(organizationId, vehicleId, sessionId, 200);
      signalObservationCount = countSignalObservations(obs.data);
      if (signalObservationCount > 0) {
        timestamps.firstCycleCompletedAt = new Date().toISOString();
        timestamps.readyToDriveAt = new Date().toISOString();
        printReadyToDriveBanner(true, sessionId);
        console.log(
          JSON.stringify(
            {
              authority: 'production_http_api',
              AUTH_MODEL: 'Bearer JWT via REFERENCE_CAPTURE_OPS_BEARER_TOKEN',
              FAST_GO_BOOTSTRAPS_FULL_NEST_CONTEXT: false,
              FAST_GO_HARD_TIMEOUT_SECONDS: timeoutMs / 1000,
              cycleCount,
              signalObservationCount,
              nextCycleScheduled,
              timestamps,
            },
            null,
            2,
          ),
        );
        return;
      }
    }
    await sleep(250);
  }

  await client.abortSession(organizationId, vehicleId, sessionId, 'fast_go_first_cycle_timeout');
  printReadyToDriveBanner(false, sessionId, 'first_cycle_timeout');
  console.log(
    JSON.stringify(
      {
        compensated: true,
        cycleCount,
        signalObservationCount,
        timestamps,
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
}

main().catch((error) => {
  const sessionId = parseOpsArg('--session-id') ?? 'unknown';
  printReadyToDriveBanner(false, sessionId, error instanceof Error ? error.message : String(error));
  process.exit(1);
});
