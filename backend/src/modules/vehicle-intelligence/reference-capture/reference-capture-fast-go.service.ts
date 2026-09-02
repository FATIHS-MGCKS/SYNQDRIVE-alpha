import { Injectable } from '@nestjs/common';
import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCaptureConfig } from './reference-capture.config';
import {
  assessFastGoReadiness,
  createFastGoTimestamps,
  isRunnerContinuityProven,
  isSessionCleanupComplete,
  remainingGoBudgetMs,
  runnerSnapshotFromDbSession,
  type FastGoCompensationStatus,
  type ReferenceCaptureFastGoTimestamps,
} from './reference-capture-fast-go.policy';
import {
  assessPrearmFreshness,
  describeFastGoStatusRejection,
} from './reference-capture-prearm.policy';
import { ReferenceCaptureObservationRepository } from './reference-capture-observation.repository';
import { ReferenceCaptureRuntimeHealthService } from './reference-capture-runtime-health.service';
import { parseAcquisitionState } from './reference-capture-session.repository';
import { ReferenceCaptureSessionRepository } from './reference-capture-session.repository';
import { ReferenceCaptureSessionService } from './reference-capture-session.service';
import type {
  ReferenceCapturePreflightResult,
  ReferenceCaptureReadinessReport,
  ReferenceCaptureSessionView,
} from './reference-capture.types';

export type { ReferenceCaptureFastGoTimestamps } from './reference-capture-fast-go.policy';

export type ReferenceCaptureFastGoResult = {
  readyToDrive: boolean;
  reason: string;
  sessionId: string;
  sessionStatus: ReferenceCaptureSessionStatus;
  cycleCount: number;
  signalObservationCount: number;
  runnerContinuityProven: boolean;
  timestamps: ReferenceCaptureFastGoTimestamps;
  blockers: string[];
  compensationStatus?: FastGoCompensationStatus;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class ReferenceCaptureFastGoService {
  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly sessionService: ReferenceCaptureSessionService,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
    private readonly observationRepository: ReferenceCaptureObservationRepository,
    private readonly runtimeHealth: ReferenceCaptureRuntimeHealthService,
  ) {}

  async executeFastGo(input: {
    organizationId: string;
    vehicleId: string;
    sessionId: string;
    goRequestedAt?: Date;
    nowMs?: () => number;
  }): Promise<ReferenceCaptureFastGoResult> {
    const nowMs = input.nowMs ?? (() => Date.now());
    const goRequestedAtMs = (input.goRequestedAt ?? new Date(nowMs())).getTime();
    const timeoutMs = this.config.getFastGoFirstCycleTimeoutMs();
    const goDeadlineAtMs = goRequestedAtMs + timeoutMs;
    const timestamps = createFastGoTimestamps(goRequestedAtMs, timeoutMs);

    const session = await this.sessionRepository.findById(input.organizationId, input.sessionId);
    if (!session) {
      return this.failure(input.sessionId, ReferenceCaptureSessionStatus.FAILED, 0, 0, false, timestamps, [
        'session_not_found',
      ]);
    }

    if (session.vehicleId !== input.vehicleId) {
      return this.failure(session.id, session.status, 0, 0, false, timestamps, ['vehicle_session_mismatch']);
    }

    if (session.status === ReferenceCaptureSessionStatus.RECORDING) {
      return this.handleAlreadyRecording(input.organizationId, session.id, timestamps, goDeadlineAtMs, nowMs);
    }

    if (session.status !== ReferenceCaptureSessionStatus.READY) {
      return this.failure(
        session.id,
        session.status,
        0,
        0,
        false,
        timestamps,
        [describeFastGoStatusRejection(session.status)],
      );
    }

    const readiness = session.readinessJson as ReferenceCaptureReadinessReport | null;
    const preflight = session.preflightJson as ReferenceCapturePreflightResult | null;
    const freshness = assessPrearmFreshness({
      status: session.status,
      vehicleId: session.vehicleId,
      expectedVehicleId: input.vehicleId,
      readiness,
      preflight,
      manifestVersion: session.manifestVersion,
      featureEnabled: this.config.isEnabled(),
      preflightMaxAgeMs: this.config.getPrearmMaxAgeMs(),
      nowMs: goRequestedAtMs,
    });
    if (!freshness.fresh) {
      return this.failure(session.id, session.status, 0, 0, false, timestamps, freshness.blockers);
    }

    const runtime = await this.runtimeHealth.assessRuntimeHealth(preflight);
    const runtimeBlockers: string[] = [];
    if (!runtime.queueReachable) runtimeBlockers.push('redis_queue_unreachable');
    if (!runtime.storageReadable || !runtime.storageWritable) {
      runtimeBlockers.push('postgres_storage_unavailable');
    }
    if (!runtime.workerQueueRegistered) runtimeBlockers.push('reference_capture_queue_not_registered');
    if (runtimeBlockers.length) {
      return this.failure(session.id, session.status, 0, 0, false, timestamps, runtimeBlockers);
    }

    if (session.runnerJobId || session.pendingCycleJobId) {
      return this.failure(session.id, session.status, 0, 0, false, timestamps, [
        'unexpected_runner_state_on_ready_session',
      ]);
    }

    const stateBefore = parseAcquisitionState(session.acquisitionStateJson);
    if (stateBefore.cycleCount > 0) {
      return this.failure(session.id, session.status, stateBefore.cycleCount, 0, false, timestamps, [
        'acquisition_already_started_on_ready_session',
      ]);
    }

    if (remainingGoBudgetMs(goDeadlineAtMs, nowMs()) <= 0) {
      return this.failure(session.id, session.status, 0, 0, false, timestamps, ['go_budget_exhausted_before_start']);
    }

    let startedView: ReferenceCaptureSessionView;
    try {
      timestamps.startRequestStartedAt = new Date(nowMs()).toISOString();
      startedView = await this.sessionService.startRecording(input.organizationId, session.id);
      timestamps.startAcceptedAt = new Date(nowMs()).toISOString();
      timestamps.runnerEnqueuedAt = timestamps.startAcceptedAt;
      timestamps.recordingEnteredAt = new Date(nowMs()).toISOString();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(session.id, ReferenceCaptureSessionStatus.READY, 0, 0, false, timestamps, [
        `start_failed:${message}`,
      ]);
    }

    if (startedView.status !== ReferenceCaptureSessionStatus.RECORDING) {
      return this.failure(
        session.id,
        startedView.status,
        0,
        0,
        false,
        timestamps,
        [`unexpected_status_after_start:${startedView.status}`],
      );
    }

    const poll = await this.pollUntilReadyOrDeadline({
      organizationId: input.organizationId,
      sessionId: session.id,
      goDeadlineAtMs,
      timestamps,
      nowMs,
    });

    if (!poll.readyToDrive) {
      const compensationStatus = await this.compensateFailedGo(
        input.organizationId,
        session.id,
        poll.reason,
        nowMs,
      );
      return { ...poll, compensationStatus };
    }

    timestamps.readyToDriveAt = new Date(nowMs()).toISOString();
    return poll;
  }

  private async pollUntilReadyOrDeadline(args: {
    organizationId: string;
    sessionId: string;
    goDeadlineAtMs: number;
    timestamps: ReferenceCaptureFastGoTimestamps;
    nowMs: () => number;
  }): Promise<ReferenceCaptureFastGoResult> {
    const pollMs = 100;
    let lastCycleCount = 0;
    let lastSignalCount = 0;
    let lastContinuity = false;

    while (remainingGoBudgetMs(args.goDeadlineAtMs, args.nowMs()) > 0) {
      const session = await this.sessionRepository.findById(args.organizationId, args.sessionId);
      if (!session) {
        return this.failure(args.sessionId, ReferenceCaptureSessionStatus.FAILED, 0, 0, false, args.timestamps, [
          'session_disappeared_during_go',
        ]);
      }

      const state = parseAcquisitionState(session.acquisitionStateJson);
      if (state.activeCycleJobId && !args.timestamps.firstCycleStartedAt) {
        args.timestamps.firstCycleStartedAt = new Date(args.nowMs()).toISOString();
      }

      if (
        session.status === ReferenceCaptureSessionStatus.FAILED ||
        session.status === ReferenceCaptureSessionStatus.ABORTED
      ) {
        return this.failure(
          args.sessionId,
          session.status,
          state.cycleCount,
          0,
          false,
          args.timestamps,
          [session.failureReason ?? `session_terminal:${session.status}`],
        );
      }

      if (session.status === ReferenceCaptureSessionStatus.RECORDING && state.cycleCount >= 1) {
        if (!args.timestamps.firstCycleCompletedAt) {
          args.timestamps.firstCycleCompletedAt = new Date(args.nowMs()).toISOString();
        }

        const observations = await this.observationRepository.findBySession(
          args.organizationId,
          args.sessionId,
          { limit: 5000 },
        );
        const signalCount = observations.filter(
          (o) =>
            o.observationKind !== ReferenceCaptureObservationKind.NATIVE_EVENT &&
            o.observationKind !== ReferenceCaptureObservationKind.SESSION_METADATA,
        ).length;

        const snapshot = runnerSnapshotFromDbSession({
          status: session.status,
          runnerJobId: session.runnerJobId,
          pendingCycleJobId: session.pendingCycleJobId,
          acquisitionStateJson: session.acquisitionStateJson,
        });
        snapshot.cycleCount = state.cycleCount;

        const assessment = assessFastGoReadiness({ snapshot, signalObservationCount: signalCount });
        lastCycleCount = state.cycleCount;
        lastSignalCount = signalCount;
        lastContinuity = assessment.runnerContinuityProven;

        if (assessment.ready) {
          if (!args.timestamps.runnerContinuityConfirmedAt) {
            args.timestamps.runnerContinuityConfirmedAt = new Date(args.nowMs()).toISOString();
          }
          return {
            readyToDrive: true,
            reason: 'first_cycle_and_runner_continuity_confirmed',
            sessionId: args.sessionId,
            sessionStatus: session.status,
            cycleCount: state.cycleCount,
            signalObservationCount: signalCount,
            runnerContinuityProven: true,
            timestamps: args.timestamps,
            blockers: [],
          };
        }
      }

      lastCycleCount = state.cycleCount;
      await sleep(Math.min(pollMs, Math.max(0, remainingGoBudgetMs(args.goDeadlineAtMs, args.nowMs()))));
    }

    const blockers =
      lastCycleCount >= 1 && lastSignalCount > 0 && !lastContinuity
        ? ['runner_continuity_not_proven']
        : ['go_deadline_exceeded'];

    return this.failure(
      args.sessionId,
      ReferenceCaptureSessionStatus.RECORDING,
      lastCycleCount,
      lastSignalCount,
      lastContinuity,
      args.timestamps,
      blockers,
    );
  }

  private async handleAlreadyRecording(
    organizationId: string,
    sessionId: string,
    timestamps: ReferenceCaptureFastGoTimestamps,
    goDeadlineAtMs: number,
    nowMs: () => number,
  ): Promise<ReferenceCaptureFastGoResult> {
    while (remainingGoBudgetMs(goDeadlineAtMs, nowMs()) > 0) {
      const session = await this.sessionRepository.findById(organizationId, sessionId);
      if (!session || session.status !== ReferenceCaptureSessionStatus.RECORDING) {
        return this.failure(sessionId, session?.status ?? ReferenceCaptureSessionStatus.FAILED, 0, 0, false, timestamps, [
          'recording_state_changed_during_idempotent_go',
        ]);
      }

      const state = parseAcquisitionState(session.acquisitionStateJson);
      const observations = await this.observationRepository.findBySession(organizationId, sessionId, {
        limit: 5000,
      });
      const signalCount = observations.filter(
        (o) =>
          o.observationKind !== ReferenceCaptureObservationKind.NATIVE_EVENT &&
          o.observationKind !== ReferenceCaptureObservationKind.SESSION_METADATA,
      ).length;

      const snapshot = runnerSnapshotFromDbSession({
        status: session.status,
        runnerJobId: session.runnerJobId,
        pendingCycleJobId: session.pendingCycleJobId,
        acquisitionStateJson: session.acquisitionStateJson,
      });
      snapshot.cycleCount = state.cycleCount;

      const assessment = assessFastGoReadiness({ snapshot, signalObservationCount: signalCount });
      if (assessment.ready) {
        timestamps.recordingEnteredAt = session.startedAt?.toISOString() ?? timestamps.goRequestedAt;
        timestamps.runnerContinuityConfirmedAt = new Date(nowMs()).toISOString();
        timestamps.readyToDriveAt = new Date(nowMs()).toISOString();
        return {
          readyToDrive: true,
          reason: 'already_recording_confirmed',
          sessionId,
          sessionStatus: session.status,
          cycleCount: state.cycleCount,
          signalObservationCount: signalCount,
          runnerContinuityProven: true,
          timestamps,
          blockers: [],
        };
      }

      if (state.cycleCount < 1) {
        await sleep(100);
        continue;
      }

      return this.failure(
        sessionId,
        session.status,
        state.cycleCount,
        signalCount,
        assessment.runnerContinuityProven,
        timestamps,
        assessment.blockers,
      );
    }

    return this.failure(sessionId, ReferenceCaptureSessionStatus.RECORDING, 0, 0, false, timestamps, [
      'go_deadline_exceeded',
    ]);
  }

  private async compensateFailedGo(
    organizationId: string,
    sessionId: string,
    reason: string,
    nowMs: () => number,
  ): Promise<FastGoCompensationStatus> {
    const session = await this.sessionRepository.findById(organizationId, sessionId);
    if (!session) return 'COMPENSATION_NOT_REQUIRED';

    if (
      session.status !== ReferenceCaptureSessionStatus.RECORDING &&
      session.status !== ReferenceCaptureSessionStatus.STARTING
    ) {
      const snapshot = runnerSnapshotFromDbSession(session);
      return isSessionCleanupComplete(snapshot)
        ? 'COMPENSATION_CONFIRMED'
        : 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
    }

    try {
      await this.sessionService.abortSession(
        organizationId,
        sessionId,
        `fast_go_compensation:${reason}`,
      );
    } catch {
      return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
    }

    const deadline = nowMs() + 3_000;
    while (nowMs() < deadline) {
      const refreshed = await this.sessionRepository.findById(organizationId, sessionId);
      if (!refreshed) return 'COMPENSATION_CONFIRMED';
      const snapshot = runnerSnapshotFromDbSession(refreshed);
      if (isSessionCleanupComplete(snapshot)) return 'COMPENSATION_CONFIRMED';
      await sleep(100);
    }

    return 'COMPENSATION_UNCONFIRMED_MANUAL_CHECK_REQUIRED';
  }

  private failure(
    sessionId: string,
    status: ReferenceCaptureSessionStatus,
    cycleCount: number,
    signalObservationCount: number,
    runnerContinuityProven: boolean,
    timestamps: ReferenceCaptureFastGoTimestamps,
    blockers: string[],
  ): ReferenceCaptureFastGoResult {
    return {
      readyToDrive: false,
      reason: blockers[0] ?? 'fast_go_failed',
      sessionId,
      sessionStatus: status,
      cycleCount,
      signalObservationCount,
      runnerContinuityProven,
      timestamps,
      blockers,
    };
  }
}
