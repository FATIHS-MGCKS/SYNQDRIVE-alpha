import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import type { ReferenceCaptureOperationalSnapshot, ReferenceCaptureSessionView } from './reference-capture.types';

/** Production target — hard operator-critical budget (RD002 freeze). */
export const DEFAULT_FAST_GO_TIMEOUT_MS = 15_000;
/** Production cap — env cannot extend FAST GO beyond approved RD002 operator window. */
export const MAX_FAST_GO_TIMEOUT_MS = 15_000;
/** Default per-request HTTP cap for non-deadline ops usage. */
export const DEFAULT_OPS_HTTP_TIMEOUT_MS = 30_000;
/** Bounded cleanup budget after GO deadline / ambiguous START (not part of operator GO window). */
export const FAST_GO_CLEANUP_TIMEOUT_MS = 3_000;

export type FastGoRunnerSnapshot = {
  status: ReferenceCaptureSessionStatus | string;
  cycleCount: number;
  runnerJobId: string | null;
  pendingCycleJobId: string | null;
  activeCycleJobId: string | null;
};

export type FastGoReadinessAssessment = {
  ready: boolean;
  blockers: string[];
  runnerContinuityProven: boolean;
  signalPointCount: number;
};

export type FastGoCompensationStatus =
  | 'COMPENSATION_CONFIRMED'
  | 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED'
  | 'COMPENSATION_NOT_REQUIRED';

export type ReferenceCaptureFastGoTimestamps = {
  goRequestedAt: string;
  goDeadlineAt: string;
  startRequestStartedAt: string | null;
  /** HTTP 200/201 on canonical POST /start — not set on ambiguous timeout. */
  startAcceptedAt: string | null;
  /** Observed when session.status becomes RECORDING (HTTP poll); null if unobserved. */
  recordingEnteredAt: string | null;
  /** Observed when operational.activeCycleJobId first seen; null if unobserved. */
  firstCycleStartedAt: string | null;
  /** Observed when cycleCount>=1 first seen; confirmation timestamp only. */
  firstCycleCompletedAt: string | null;
  /** Observed when runner continuity invariant first proven. */
  runnerContinuityConfirmedAt: string | null;
  readyToDriveAt: string | null;
};

export function createFastGoTimestamps(goRequestedAtMs: number, timeoutMs: number): ReferenceCaptureFastGoTimestamps {
  return {
    goRequestedAt: new Date(goRequestedAtMs).toISOString(),
    goDeadlineAt: new Date(computeGoDeadlineMs(goRequestedAtMs, timeoutMs)).toISOString(),
    startRequestStartedAt: null,
    startAcceptedAt: null,
    recordingEnteredAt: null,
    firstCycleStartedAt: null,
    firstCycleCompletedAt: null,
    runnerContinuityConfirmedAt: null,
    readyToDriveAt: null,
  };
}

export function normalizeFastGoTimeoutMs(
  raw?: string | number | null,
  defaultMs: number = DEFAULT_FAST_GO_TIMEOUT_MS,
): number {
  if (raw == null || raw === '') return defaultMs;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultMs;
  return Math.min(parsed, MAX_FAST_GO_TIMEOUT_MS);
}

export function computeGoDeadlineMs(goRequestedAtMs: number, timeoutMs: number): number {
  return goRequestedAtMs + normalizeFastGoTimeoutMs(timeoutMs);
}

export function remainingGoBudgetMs(goDeadlineAtMs: number, nowMs: number = Date.now()): number {
  return goDeadlineAtMs - nowMs;
}

export function clampHttpRequestTimeoutMs(
  remainingMs: number,
  configuredMaxMs: number = DEFAULT_OPS_HTTP_TIMEOUT_MS,
): number | null {
  if (remainingMs <= 0) return null;
  return Math.min(configuredMaxMs, remainingMs);
}

export function runnerSnapshotFromSession(
  session: Pick<ReferenceCaptureSessionView, 'status' | 'operational'>,
): FastGoRunnerSnapshot {
  return {
    status: session.status,
    cycleCount: session.operational?.cycleCount ?? 0,
    runnerJobId: session.operational?.runnerJobId ?? null,
    pendingCycleJobId: session.operational?.pendingCycleJobId ?? null,
    activeCycleJobId: session.operational?.activeCycleJobId ?? null,
  };
}

export function runnerSnapshotFromDbSession(session: {
  status: ReferenceCaptureSessionStatus;
  runnerJobId?: string | null;
  pendingCycleJobId?: string | null;
  acquisitionStateJson?: unknown;
  cycleCount?: number;
}): FastGoRunnerSnapshot {
  const acquisition =
    session.acquisitionStateJson && typeof session.acquisitionStateJson === 'object'
      ? (session.acquisitionStateJson as { cycleCount?: number; activeCycleJobId?: string | null })
      : {};
  return {
    status: session.status,
    cycleCount: session.cycleCount ?? acquisition.cycleCount ?? 0,
    runnerJobId: session.runnerJobId ?? null,
    pendingCycleJobId: session.pendingCycleJobId ?? null,
    activeCycleJobId: acquisition.activeCycleJobId ?? null,
  };
}

export function isRunnerContinuityProven(snapshot: FastGoRunnerSnapshot): boolean {
  if (snapshot.status !== ReferenceCaptureSessionStatus.RECORDING) return false;
  if (snapshot.cycleCount < 1) return false;
  if (!snapshot.runnerJobId) return false;
  if (snapshot.pendingCycleJobId) return true;
  if (snapshot.activeCycleJobId) return true;
  return false;
}

/** Canonical FAST GO signal persistence gate — SIGNAL_POINT observations only. */
export function countPersistedSignalPoints(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return (row as { observationKind?: string }).observationKind === ReferenceCaptureObservationKind.SIGNAL_POINT;
  }).length;
}

export function assessFastGoReadiness(args: {
  snapshot: FastGoRunnerSnapshot;
  signalPointCount: number;
}): FastGoReadinessAssessment {
  const blockers: string[] = [];
  const { snapshot, signalPointCount } = args;

  if (snapshot.status !== ReferenceCaptureSessionStatus.RECORDING) {
    blockers.push(`session_status_not_recording:${snapshot.status}`);
  }
  if (snapshot.cycleCount < 1) {
    blockers.push('first_cycle_not_completed');
  }
  if (signalPointCount <= 0) {
    blockers.push('no_signal_point_observations_after_first_cycle');
  }
  if (!snapshot.runnerJobId) {
    blockers.push('runner_identity_missing');
  }

  const runnerContinuityProven = isRunnerContinuityProven(snapshot);
  if (!runnerContinuityProven) {
    blockers.push('runner_continuity_not_proven');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    runnerContinuityProven,
    signalPointCount,
  };
}

export function isFastGoReadyToDrive(snapshot: FastGoRunnerSnapshot, signalPointCount: number): boolean {
  return assessFastGoReadiness({ snapshot, signalPointCount }).ready;
}

export function isSessionCleanupComplete(snapshot: FastGoRunnerSnapshot): boolean {
  if (
    snapshot.status === ReferenceCaptureSessionStatus.RECORDING ||
    snapshot.status === ReferenceCaptureSessionStatus.STARTING
  ) {
    return false;
  }
  if (snapshot.runnerJobId) return false;
  if (snapshot.pendingCycleJobId) return false;
  if (snapshot.activeCycleJobId) return false;
  return true;
}

export function isFastGoTerminalFailure(snapshot: FastGoRunnerSnapshot): boolean {
  if (
    snapshot.status === ReferenceCaptureSessionStatus.FAILED ||
    snapshot.status === ReferenceCaptureSessionStatus.ABORTED ||
    snapshot.status === ReferenceCaptureSessionStatus.COMPLETED
  ) {
    return true;
  }
  if (snapshot.status === ReferenceCaptureSessionStatus.RECORDING && !snapshot.runnerJobId && snapshot.cycleCount === 0) {
    return true;
  }
  return false;
}

/**
 * Whether bounded waiting within the absolute GO deadline may still resolve readiness.
 * Does not weaken safety — terminal/broken states return false immediately.
 */
export function shouldContinueFastGoWait(
  snapshot: FastGoRunnerSnapshot,
  assessment: FastGoReadinessAssessment,
): boolean {
  if (assessment.ready) return false;
  if (isFastGoTerminalFailure(snapshot)) return false;
  if (snapshot.status !== ReferenceCaptureSessionStatus.RECORDING) return false;

  if (snapshot.cycleCount === 0) {
    return Boolean(snapshot.runnerJobId && (snapshot.pendingCycleJobId || snapshot.activeCycleJobId));
  }

  if (snapshot.cycleCount >= 1 && snapshot.runnerJobId) {
    if (!assessment.runnerContinuityProven) return false;
    return true;
  }

  return false;
}

export function sessionRequiresAbort(snapshot: FastGoRunnerSnapshot): boolean {
  return (
    snapshot.status === ReferenceCaptureSessionStatus.STARTING ||
    snapshot.status === ReferenceCaptureSessionStatus.RECORDING
  );
}

/** Ambiguous mutating POST /start — fence READY/STARTING/RECORDING to block delayed CAS. */
export function ambiguousStartRequiresSessionFence(snapshot: FastGoRunnerSnapshot): boolean {
  return (
    snapshot.status === ReferenceCaptureSessionStatus.READY ||
    snapshot.status === ReferenceCaptureSessionStatus.STARTING ||
    snapshot.status === ReferenceCaptureSessionStatus.RECORDING
  );
}

/** Compensation confirmed only when session is terminal/non-active and cannot restart. */
export function isAmbiguousStartFenceComplete(snapshot: FastGoRunnerSnapshot): boolean {
  if (ambiguousStartRequiresSessionFence(snapshot)) return false;
  if (snapshot.runnerJobId) return false;
  if (snapshot.pendingCycleJobId) return false;
  if (snapshot.activeCycleJobId) return false;
  return true;
}

export function deriveAmbiguousStartCompensationStatus(
  snapshot: FastGoRunnerSnapshot | null,
  verifyFailed: boolean,
): FastGoCompensationStatus {
  if (verifyFailed || !snapshot) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }
  return isAmbiguousStartFenceComplete(snapshot)
    ? 'COMPENSATION_CONFIRMED'
    : 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
}

/**
 * Whether a mutating POST /start HTTP outcome requires ambiguous-start reconciliation.
 * 401/403 are definitive auth failures — not ambiguous mutation.
 */
export function isAmbiguousMutatingStartHttpOutcome(
  httpStatus: number,
  opts: { timedOut?: boolean; budgetExhausted?: boolean } = {},
): boolean {
  if (opts.timedOut || opts.budgetExhausted) return true;
  if (httpStatus >= 500 && httpStatus < 600) return true;
  return false;
}

export function deriveCleanupCompensationStatus(
  snapshot: FastGoRunnerSnapshot | null,
  verifyFailed: boolean,
): FastGoCompensationStatus {
  if (verifyFailed || !snapshot) {
    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }
  return isSessionCleanupComplete(snapshot)
    ? 'COMPENSATION_CONFIRMED'
    : 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
}

export function operationalFromDbSession(session: {
  runnerJobId?: string | null;
  pendingCycleJobId?: string | null;
  acquisitionStateJson?: unknown;
}): ReferenceCaptureOperationalSnapshot {
  const acquisition =
    session.acquisitionStateJson && typeof session.acquisitionStateJson === 'object'
      ? (session.acquisitionStateJson as { cycleCount?: number; activeCycleJobId?: string | null })
      : {};
  return {
    cycleCount: acquisition.cycleCount ?? 0,
    runnerJobId: session.runnerJobId ?? null,
    pendingCycleJobId: session.pendingCycleJobId ?? null,
    preflightAssessedAt: null,
    activeCycleJobId: acquisition.activeCycleJobId ?? null,
  };
}

/** @deprecated Use countPersistedSignalPoints — SIGNAL_POINT only. */
export function countSignalObservations(rows: unknown): number {
  return countPersistedSignalPoints(rows);
}
