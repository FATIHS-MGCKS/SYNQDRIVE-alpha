import { ReferenceCaptureSessionStatus } from '@prisma/client';
import type { ReferenceCaptureOperationalSnapshot, ReferenceCaptureSessionView } from './reference-capture.types';

/** Production target — hard operator-critical budget. */
export const DEFAULT_FAST_GO_TIMEOUT_MS = 15_000;
/** Reject/clamp absurd operator-critical budgets (30 minutes). */
export const MAX_FAST_GO_TIMEOUT_MS = 30 * 60 * 1000;
/** Default per-request HTTP cap for non-deadline ops usage. */
export const DEFAULT_OPS_HTTP_TIMEOUT_MS = 30_000;
/** Bounded cleanup budget after GO deadline expires (not part of operator GO window). */
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
};

export type FastGoCompensationStatus =
  | 'COMPENSATION_CONFIRMED'
  | 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED'
  | 'COMPENSATION_NOT_REQUIRED';

export type ReferenceCaptureFastGoTimestamps = {
  goRequestedAt: string;
  goDeadlineAt: string;
  startRequestStartedAt: string | null;
  startAcceptedAt: string | null;
  runnerEnqueuedAt: string | null;
  recordingEnteredAt: string | null;
  firstCycleStartedAt: string | null;
  firstCycleCompletedAt: string | null;
  runnerContinuityConfirmedAt: string | null;
  readyToDriveAt: string | null;
};

export function createFastGoTimestamps(goRequestedAtMs: number, timeoutMs: number): ReferenceCaptureFastGoTimestamps {
  return {
    goRequestedAt: new Date(goRequestedAtMs).toISOString(),
    goDeadlineAt: new Date(computeGoDeadlineMs(goRequestedAtMs, timeoutMs)).toISOString(),
    startRequestStartedAt: null,
    startAcceptedAt: null,
    runnerEnqueuedAt: null,
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

/**
 * Proves autonomous acquisition will continue beyond the first completed cycle.
 *
 * After cycle N completes, scheduleNextCycle normally sets pendingCycleJobId to N+1.
 * A legitimate transient exists when N+1 is already ACTIVE (activeCycleJobId set).
 */
export function isRunnerContinuityProven(snapshot: FastGoRunnerSnapshot): boolean {
  if (snapshot.status !== ReferenceCaptureSessionStatus.RECORDING) return false;
  if (snapshot.cycleCount < 1) return false;
  if (!snapshot.runnerJobId) return false;
  if (snapshot.pendingCycleJobId) return true;
  if (snapshot.activeCycleJobId) return true;
  return false;
}

export function assessFastGoReadiness(args: {
  snapshot: FastGoRunnerSnapshot;
  signalObservationCount: number;
}): FastGoReadinessAssessment {
  const blockers: string[] = [];
  const { snapshot, signalObservationCount } = args;

  if (snapshot.status !== ReferenceCaptureSessionStatus.RECORDING) {
    blockers.push(`session_status_not_recording:${snapshot.status}`);
  }
  if (snapshot.cycleCount < 1) {
    blockers.push('first_cycle_not_completed');
  }
  if (signalObservationCount <= 0) {
    blockers.push('no_signal_observations_after_first_cycle');
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
  };
}

export function isFastGoReadyToDrive(
  snapshot: FastGoRunnerSnapshot,
  signalObservationCount: number,
): boolean {
  return assessFastGoReadiness({ snapshot, signalObservationCount }).ready;
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

export function countSignalObservations(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const kind = (row as { observationKind?: string }).observationKind;
    return kind !== 'NATIVE_EVENT' && kind !== 'SESSION_METADATA';
  }).length;
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
