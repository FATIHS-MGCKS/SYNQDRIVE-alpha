/**
 * Phase 3A.3.1 — FAST GO for pre-armed DIMO LTE_R1 reference capture sessions.
 *
 * Production operational authority: authenticated HTTP API only — does NOT bootstrap AppModule.
 *
 * Required env:
 * - REFERENCE_CAPTURE_OPS_API_BASE_URL (e.g. https://app.synqdrive.eu/api/v1)
 * - REFERENCE_CAPTURE_OPS_BEARER_TOKEN (operator JWT with fleet-condition:write)
 */
import {
  assessFastGoReadiness,
  computeGoDeadlineMs,
  countSignalObservations,
  createFastGoTimestamps,
  isSessionCleanupComplete,
  normalizeFastGoTimeoutMs,
  remainingGoBudgetMs,
  runnerSnapshotFromSession,
  type FastGoCompensationStatus,
  FAST_GO_CLEANUP_TIMEOUT_MS,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-fast-go.policy';
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrearmMaxAgeMs(): number {
  const raw = process.env.REFERENCE_CAPTURE_PREARM_MAX_AGE_MS;
  if (!raw) return DEFAULT_PREARM_MAX_AGE_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PREARM_MAX_AGE_MS;
}

function httpOptions(goDeadlineAtMs: number) {
  return { goDeadlineAtMs, nowMs: Date.now() };
}

async function evaluateRecordingSession(
  client: ReferenceCaptureOpsHttpClient,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  goDeadlineAtMs: number,
): Promise<{
  ready: boolean;
  session: ReferenceCaptureSessionView | null;
  signalObservationCount: number;
  assessment: ReturnType<typeof assessFastGoReadiness>;
}> {
  const polled = await client.getSession(organizationId, vehicleId, sessionId, httpOptions(goDeadlineAtMs));
  if (polled.budgetExhausted || polled.timedOut || polled.status !== 200) {
    return {
      ready: false,
      session: null,
      signalObservationCount: 0,
      assessment: { ready: false, blockers: ['session_poll_failed'], runnerContinuityProven: false },
    };
  }

  const session = polled.data as ReferenceCaptureSessionView;
  const snapshot = runnerSnapshotFromSession(session);
  let signalObservationCount = 0;

  if (snapshot.cycleCount >= 1) {
    const obs = await client.listObservations(organizationId, vehicleId, sessionId, 200, httpOptions(goDeadlineAtMs));
    if (!obs.budgetExhausted && !obs.timedOut && obs.status === 200) {
      signalObservationCount = countSignalObservations(obs.data);
    }
  }

  const assessment = assessFastGoReadiness({ snapshot, signalObservationCount });
  return { ready: assessment.ready, session, signalObservationCount, assessment };
}

async function compensateAfterDeadline(
  client: ReferenceCaptureOpsHttpClient,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  reason: string,
): Promise<FastGoCompensationStatus> {
  const cleanupDeadlineAtMs = Date.now() + FAST_GO_CLEANUP_TIMEOUT_MS;
  const abort = await client.abortSession(organizationId, vehicleId, sessionId, reason, {
    goDeadlineAtMs: cleanupDeadlineAtMs,
  });

  if (abort.timedOut || abort.budgetExhausted) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  const verify = await client.getSession(organizationId, vehicleId, sessionId, {
    goDeadlineAtMs: cleanupDeadlineAtMs,
  });
  if (verify.timedOut || verify.budgetExhausted || verify.status !== 200) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  const snapshot = runnerSnapshotFromSession(verify.data as ReferenceCaptureSessionView);
  return isSessionCleanupComplete(snapshot)
    ? 'COMPENSATION_CONFIRMED'
    : 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
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
  const goRequestedAtMs = Date.now();
  const timeoutMs = normalizeFastGoTimeoutMs(process.env.REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS);
  const goDeadlineAtMs = computeGoDeadlineMs(goRequestedAtMs, timeoutMs);
  const timestamps = createFastGoTimestamps(goRequestedAtMs, timeoutMs);

  const initial = await client.getSession(organizationId, vehicleId, sessionId, httpOptions(goDeadlineAtMs));
  if (initial.budgetExhausted) {
    printReadyToDriveBanner(false, sessionId, 'go_budget_exhausted_before_initial_get');
    process.exitCode = 2;
    return;
  }
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
    const evaluated = await evaluateRecordingSession(client, organizationId, vehicleId, sessionId, goDeadlineAtMs);
    if (evaluated.ready && evaluated.session) {
      printReadyToDriveBanner(true, sessionId);
      timestamps.readyToDriveAt = new Date().toISOString();
      timestamps.runnerContinuityConfirmedAt = timestamps.readyToDriveAt;
      console.log(
        JSON.stringify(
          {
            authority: 'production_http_api',
            reason: 'already_recording_confirmed',
            runnerContinuityProven: true,
            timestamps,
          },
          null,
          2,
        ),
      );
      return;
    }
    printReadyToDriveBanner(false, sessionId, evaluated.assessment.blockers.join(','));
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
    nowMs: goRequestedAtMs,
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

  if (remainingGoBudgetMs(goDeadlineAtMs) <= 0) {
    printReadyToDriveBanner(false, sessionId, 'go_budget_exhausted_before_start');
    process.exitCode = 2;
    return;
  }

  timestamps.startRequestStartedAt = new Date().toISOString();
  const started = await client.startRecording(organizationId, vehicleId, sessionId, httpOptions(goDeadlineAtMs));
  if (started.budgetExhausted || started.timedOut) {
    printReadyToDriveBanner(false, sessionId, started.timedOut ? 'start_request_timeout' : 'go_budget_exhausted_during_start');
    process.exitCode = 2;
    return;
  }
  if (started.status !== 200 && started.status !== 201) {
    printReadyToDriveBanner(false, sessionId, `start_failed:${started.status}`);
    process.exitCode = 2;
    return;
  }
  timestamps.startAcceptedAt = new Date().toISOString();
  timestamps.recordingEnteredAt = new Date().toISOString();

  let lastBlockers: string[] = [];
  let lastCycleCount = 0;
  let lastSignalCount = 0;

  while (remainingGoBudgetMs(goDeadlineAtMs) > 0) {
    const evaluated = await evaluateRecordingSession(client, organizationId, vehicleId, sessionId, goDeadlineAtMs);
    if (!evaluated.session) {
      await sleep(100);
      continue;
    }

    lastBlockers = evaluated.assessment.blockers;
    lastCycleCount = evaluated.session.operational?.cycleCount ?? 0;
    lastSignalCount = evaluated.signalObservationCount;

    if (evaluated.session.status === 'FAILED' || evaluated.session.status === 'ABORTED') {
      printReadyToDriveBanner(false, sessionId, evaluated.session.failureReason ?? evaluated.session.status);
      process.exitCode = 2;
      return;
    }

    if (evaluated.ready) {
      timestamps.firstCycleCompletedAt = new Date().toISOString();
      timestamps.runnerContinuityConfirmedAt = new Date().toISOString();
      timestamps.readyToDriveAt = new Date().toISOString();
      printReadyToDriveBanner(true, sessionId);
      console.log(
        JSON.stringify(
          {
            authority: 'production_http_api',
            AUTH_MODEL: 'Bearer JWT via REFERENCE_CAPTURE_OPS_BEARER_TOKEN',
            FAST_GO_BOOTSTRAPS_FULL_NEST_CONTEXT: false,
            ABSOLUTE_GO_DEADLINE: timestamps.goDeadlineAt,
            MAX_OPERATOR_CRITICAL_BUDGET_SECONDS: timeoutMs / 1000,
            cycleCount: lastCycleCount,
            signalObservationCount: lastSignalCount,
            runnerContinuityProven: true,
            timestamps,
          },
          null,
          2,
        ),
      );
      return;
    }

    await sleep(Math.min(100, Math.max(0, remainingGoBudgetMs(goDeadlineAtMs))));
  }

  const compensationStatus = await compensateAfterDeadline(
    client,
    organizationId,
    vehicleId,
    sessionId,
    'fast_go_deadline_exceeded',
  );

  printReadyToDriveBanner(false, sessionId, lastBlockers[0] ?? 'go_deadline_exceeded');
  console.log(
    JSON.stringify(
      {
        compensationStatus,
        cycleCount: lastCycleCount,
        signalObservationCount: lastSignalCount,
        runnerContinuityProven: false,
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
