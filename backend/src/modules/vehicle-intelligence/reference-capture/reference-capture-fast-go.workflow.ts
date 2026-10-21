import { ReferenceCaptureSessionStatus } from '@prisma/client';
import type { ReferenceCaptureSessionView } from './reference-capture.types';
import {
  assessFastGoReadiness,
  ambiguousStartRequiresSessionFence,
  countPersistedSignalPoints,
  deriveAmbiguousStartCompensationStatus,
  deriveCleanupCompensationStatus,
  FAST_GO_CLEANUP_TIMEOUT_MS,
  isAmbiguousStartFenceComplete,
  isSessionCleanupComplete,
  runnerSnapshotFromSession,
  sessionRequiresAbort,
  shouldContinueFastGoWait,
  type FastGoCompensationStatus,
  type FastGoReadinessAssessment,
  type ReferenceCaptureFastGoTimestamps,
} from './reference-capture-fast-go.policy';

export type FastGoHttpClientLike = {
  getSession(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    options?: { goDeadlineAtMs?: number; nowMs?: number; timeoutMs?: number },
  ): Promise<{ status: number; data: unknown; timedOut?: boolean; budgetExhausted?: boolean }>;
  abortSession(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    reason: string,
    options?: { goDeadlineAtMs?: number; nowMs?: number; timeoutMs?: number },
  ): Promise<{ status: number; data: unknown; timedOut?: boolean; budgetExhausted?: boolean }>;
  listObservations(
    organizationId: string,
    vehicleId: string,
    sessionId: string,
    limit: number,
    options?: { goDeadlineAtMs?: number; nowMs?: number; timeoutMs?: number },
  ): Promise<{ status: number; data: unknown; timedOut?: boolean; budgetExhausted?: boolean }>;
};

export type EvaluateRecordingSessionResult = {
  ready: boolean;
  session: ReferenceCaptureSessionView | null;
  signalPointCount: number;
  assessment: FastGoReadinessAssessment;
};

export async function evaluateRecordingSessionViaHttp(
  client: FastGoHttpClientLike,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  goDeadlineAtMs: number,
  nowMs: () => number = () => Date.now(),
): Promise<EvaluateRecordingSessionResult> {
  const polled = await client.getSession(organizationId, vehicleId, sessionId, {
    goDeadlineAtMs,
    nowMs: nowMs(),
  });
  if (polled.budgetExhausted || polled.timedOut || polled.status !== 200) {
    return {
      ready: false,
      session: null,
      signalPointCount: 0,
      assessment: {
        ready: false,
        blockers: ['session_poll_failed'],
        runnerContinuityProven: false,
        signalPointCount: 0,
      },
    };
  }

  const session = polled.data as ReferenceCaptureSessionView;
  const snapshot = runnerSnapshotFromSession(session);
  let signalPointCount = 0;

  if (snapshot.cycleCount >= 1) {
    const obs = await client.listObservations(organizationId, vehicleId, sessionId, 200, {
      goDeadlineAtMs,
      nowMs: nowMs(),
    });
    if (!obs.budgetExhausted && !obs.timedOut && obs.status === 200) {
      signalPointCount = countPersistedSignalPoints(obs.data);
    }
  }

  const assessment = assessFastGoReadiness({ snapshot, signalPointCount });
  return { ready: assessment.ready, session, signalPointCount, assessment };
}

export async function runBoundedSessionCleanup(
  client: FastGoHttpClientLike,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  reason: string,
  cleanupStartedAtMs: number = Date.now(),
): Promise<FastGoCompensationStatus> {
  const cleanupDeadlineAtMs = cleanupStartedAtMs + FAST_GO_CLEANUP_TIMEOUT_MS;
  const nowMs = () => Date.now();

  const initial = await client.getSession(organizationId, vehicleId, sessionId, {
    goDeadlineAtMs: cleanupDeadlineAtMs,
    nowMs: nowMs(),
  });
  if (initial.budgetExhausted || initial.timedOut || initial.status !== 200) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  let snapshot = runnerSnapshotFromSession(initial.data as ReferenceCaptureSessionView);

  if (sessionRequiresAbort(snapshot)) {
    const abort = await client.abortSession(organizationId, vehicleId, sessionId, reason, {
      goDeadlineAtMs: cleanupDeadlineAtMs,
      nowMs: nowMs(),
    });
    if (abort.timedOut || abort.budgetExhausted) {
      return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
    }
  } else if (isSessionCleanupComplete(snapshot)) {
    return 'COMPENSATION_CONFIRMED';
  }

  const verify = await client.getSession(organizationId, vehicleId, sessionId, {
    goDeadlineAtMs: cleanupDeadlineAtMs,
    nowMs: nowMs(),
  });
  if (verify.budgetExhausted || verify.timedOut || verify.status !== 200) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  snapshot = runnerSnapshotFromSession(verify.data as ReferenceCaptureSessionView);
  return deriveCleanupCompensationStatus(snapshot, false);
}

export async function reconcileAmbiguousStartViaHttp(
  client: FastGoHttpClientLike,
  organizationId: string,
  vehicleId: string,
  sessionId: string,
  cleanupStartedAtMs: number = Date.now(),
): Promise<FastGoCompensationStatus> {
  const cleanupDeadlineAtMs = cleanupStartedAtMs + FAST_GO_CLEANUP_TIMEOUT_MS;
  const nowMs = () => Date.now();

  const initial = await client.getSession(organizationId, vehicleId, sessionId, {
    goDeadlineAtMs: cleanupDeadlineAtMs,
    nowMs: nowMs(),
  });
  if (initial.budgetExhausted || initial.timedOut || initial.status !== 200) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  let snapshot = runnerSnapshotFromSession(initial.data as ReferenceCaptureSessionView);

  if (ambiguousStartRequiresSessionFence(snapshot)) {
    const abort = await client.abortSession(
      organizationId,
      vehicleId,
      sessionId,
      'ambiguous_start_session_fencing',
      { goDeadlineAtMs: cleanupDeadlineAtMs, nowMs: nowMs() },
    );
    if (abort.timedOut || abort.budgetExhausted) {
      return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
    }
  } else if (isAmbiguousStartFenceComplete(snapshot)) {
    return 'COMPENSATION_CONFIRMED';
  }

  const verify = await client.getSession(organizationId, vehicleId, sessionId, {
    goDeadlineAtMs: cleanupDeadlineAtMs,
    nowMs: nowMs(),
  });
  if (verify.budgetExhausted || verify.timedOut || verify.status !== 200) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  snapshot = runnerSnapshotFromSession(verify.data as ReferenceCaptureSessionView);
  return deriveAmbiguousStartCompensationStatus(snapshot, false);
}

export function observeRecordingTimestamps(
  timestamps: ReferenceCaptureFastGoTimestamps,
  session: ReferenceCaptureSessionView,
  nowIso: string,
): void {
  if (session.status === ReferenceCaptureSessionStatus.RECORDING && !timestamps.recordingEnteredAt) {
    timestamps.recordingEnteredAt = nowIso;
  }
  const activeCycleJobId = session.operational?.activeCycleJobId;
  if (activeCycleJobId && !timestamps.firstCycleStartedAt) {
    timestamps.firstCycleStartedAt = nowIso;
  }
  const cycleCount = session.operational?.cycleCount ?? 0;
  if (cycleCount >= 1 && !timestamps.firstCycleCompletedAt) {
    timestamps.firstCycleCompletedAt = nowIso;
  }
}

export { shouldContinueFastGoWait };
