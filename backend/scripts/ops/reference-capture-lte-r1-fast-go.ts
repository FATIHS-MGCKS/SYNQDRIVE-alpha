/**
 * Phase 3A.3.1 — FAST GO for pre-armed DIMO LTE_R1 reference capture sessions.
 *
 * Production operational authority: authenticated HTTP API only — does NOT bootstrap AppModule.
 */
import {
  computeGoDeadlineMs,
  createFastGoTimestamps,
  normalizeFastGoTimeoutMs,
  remainingGoBudgetMs,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-fast-go.policy';
import {
  assessPrearmFreshness,
  describeFastGoStatusRejection,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-prearm.policy';
import {
  evaluateRecordingSessionViaHttp,
  observeRecordingTimestamps,
  reconcileAmbiguousStartViaHttp,
  runBoundedSessionCleanup,
  shouldContinueFastGoWait,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-fast-go.workflow';
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

function httpOptions(goDeadlineAtMs: number, nowMs: () => number) {
  return { goDeadlineAtMs, nowMs: nowMs() };
}

async function pollUntilReadyOrDeadline(args: {
  client: ReferenceCaptureOpsHttpClient;
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  goDeadlineAtMs: number;
  timestamps: ReturnType<typeof createFastGoTimestamps>;
  nowMs: () => number;
}): Promise<{
  ready: boolean;
  lastBlockers: string[];
  lastCycleCount: number;
  lastSignalCount: number;
}> {
  let lastBlockers: string[] = [];
  let lastCycleCount = 0;
  let lastSignalCount = 0;

  while (remainingGoBudgetMs(args.goDeadlineAtMs, args.nowMs()) > 0) {
    const evaluated = await evaluateRecordingSessionViaHttp(
      args.client,
      args.organizationId,
      args.vehicleId,
      args.sessionId,
      args.goDeadlineAtMs,
      args.nowMs,
    );

    if (!evaluated.session) {
      await sleep(Math.min(100, Math.max(0, remainingGoBudgetMs(args.goDeadlineAtMs, args.nowMs()))));
      continue;
    }

    observeRecordingTimestamps(args.timestamps, evaluated.session, new Date(args.nowMs()).toISOString());
    lastBlockers = evaluated.assessment.blockers;
    lastCycleCount = evaluated.session.operational?.cycleCount ?? 0;
    lastSignalCount = evaluated.signalPointCount;

    if (evaluated.session.status === 'FAILED' || evaluated.session.status === 'ABORTED') {
      return {
        ready: false,
        lastBlockers: [evaluated.session.failureReason ?? evaluated.session.status],
        lastCycleCount,
        lastSignalCount,
      };
    }

    if (evaluated.ready) {
      return { ready: true, lastBlockers: [], lastCycleCount, lastSignalCount };
    }

    const snapshot = {
      status: evaluated.session.status,
      cycleCount: lastCycleCount,
      runnerJobId: evaluated.session.operational?.runnerJobId ?? null,
      pendingCycleJobId: evaluated.session.operational?.pendingCycleJobId ?? null,
      activeCycleJobId: evaluated.session.operational?.activeCycleJobId ?? null,
    };

    if (!shouldContinueFastGoWait(snapshot, evaluated.assessment)) {
      return { ready: false, lastBlockers, lastCycleCount, lastSignalCount };
    }

    await sleep(Math.min(100, Math.max(0, remainingGoBudgetMs(args.goDeadlineAtMs, args.nowMs()))));
  }

  return {
    ready: false,
    lastBlockers: lastBlockers.length ? lastBlockers : ['go_deadline_exceeded'],
    lastCycleCount,
    lastSignalCount,
  };
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
  const nowMs = () => Date.now();
  const timeoutMs = normalizeFastGoTimeoutMs(process.env.REFERENCE_CAPTURE_FAST_GO_FIRST_CYCLE_TIMEOUT_MS);
  const goDeadlineAtMs = computeGoDeadlineMs(goRequestedAtMs, timeoutMs);
  const timestamps = createFastGoTimestamps(goRequestedAtMs, timeoutMs);

  const initial = await client.getSession(organizationId, vehicleId, sessionId, httpOptions(goDeadlineAtMs, nowMs));
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
    const poll = await pollUntilReadyOrDeadline({
      client,
      organizationId,
      vehicleId,
      sessionId,
      goDeadlineAtMs,
      timestamps,
      nowMs,
    });
    if (poll.ready) {
      timestamps.runnerContinuityConfirmedAt = new Date(nowMs()).toISOString();
      timestamps.readyToDriveAt = timestamps.runnerContinuityConfirmedAt;
      printReadyToDriveBanner(true, sessionId);
      console.log(
        JSON.stringify(
          {
            authority: 'production_http_api',
            reason: 'already_recording_confirmed',
            runnerContinuityProven: true,
            signalPointCount: poll.lastSignalCount,
            timestamps,
          },
          null,
          2,
        ),
      );
      return;
    }
    printReadyToDriveBanner(false, sessionId, poll.lastBlockers.join(','));
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

  if (remainingGoBudgetMs(goDeadlineAtMs, nowMs()) <= 0) {
    printReadyToDriveBanner(false, sessionId, 'go_budget_exhausted_before_start');
    process.exitCode = 2;
    return;
  }

  timestamps.startRequestStartedAt = new Date(nowMs()).toISOString();
  const started = await client.startRecording(organizationId, vehicleId, sessionId, httpOptions(goDeadlineAtMs, nowMs));

  if (started.budgetExhausted || started.timedOut) {
    printReadyToDriveBanner(false, sessionId, 'ambiguous_start_requires_reconciliation');
    const compensationStatus = await reconcileAmbiguousStartViaHttp(client, organizationId, vehicleId, sessionId);
    console.log(
      JSON.stringify(
        {
          ambiguousStart: true,
          compensationStatus,
          timestamps,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  if (started.status !== 200 && started.status !== 201) {
    printReadyToDriveBanner(false, sessionId, `start_failed:${started.status}`);
    process.exitCode = 2;
    return;
  }

  timestamps.startAcceptedAt = new Date(nowMs()).toISOString();
  observeRecordingTimestamps(timestamps, started.data as ReferenceCaptureSessionView, timestamps.startAcceptedAt);

  const poll = await pollUntilReadyOrDeadline({
    client,
    organizationId,
    vehicleId,
    sessionId,
    goDeadlineAtMs,
    timestamps,
    nowMs,
  });

  if (poll.ready) {
    timestamps.runnerContinuityConfirmedAt = new Date(nowMs()).toISOString();
    timestamps.readyToDriveAt = timestamps.runnerContinuityConfirmedAt;
    printReadyToDriveBanner(true, sessionId);
    console.log(
      JSON.stringify(
        {
          authority: 'production_http_api',
          ABSOLUTE_GO_DEADLINE: timestamps.goDeadlineAt,
          MAX_OPERATOR_CRITICAL_BUDGET_SECONDS: timeoutMs / 1000,
          cycleCount: poll.lastCycleCount,
          signalPointCount: poll.lastSignalCount,
          runnerContinuityProven: true,
          timestamps,
        },
        null,
        2,
      ),
    );
    return;
  }

  const compensationStatus = await runBoundedSessionCleanup(
    client,
    organizationId,
    vehicleId,
    sessionId,
    'fast_go_deadline_exceeded',
  );

  printReadyToDriveBanner(false, sessionId, poll.lastBlockers[0] ?? 'go_deadline_exceeded');
  console.log(
    JSON.stringify(
      {
        compensationStatus,
        cycleCount: poll.lastCycleCount,
        signalPointCount: poll.lastSignalCount,
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
