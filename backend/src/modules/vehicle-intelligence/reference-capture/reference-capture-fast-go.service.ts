import { Injectable } from '@nestjs/common';
import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCaptureConfig } from './reference-capture.config';
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

export type ReferenceCaptureFastGoTimestamps = {
  goRequestedAt: string;
  startAcceptedAt: string | null;
  runnerEnqueuedAt: string | null;
  recordingEnteredAt: string | null;
  firstCycleStartedAt: string | null;
  firstCycleCompletedAt: string | null;
  readyToDriveAt: string | null;
};

export type ReferenceCaptureFastGoResult = {
  readyToDrive: boolean;
  reason: string;
  sessionId: string;
  sessionStatus: ReferenceCaptureSessionStatus;
  cycleCount: number;
  signalObservationCount: number;
  nextCycleScheduled: boolean;
  timestamps: ReferenceCaptureFastGoTimestamps;
  blockers: string[];
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
  }): Promise<ReferenceCaptureFastGoResult> {
    const goRequestedAt = input.goRequestedAt ?? new Date();
    const timestamps: ReferenceCaptureFastGoTimestamps = {
      goRequestedAt: goRequestedAt.toISOString(),
      startAcceptedAt: null,
      runnerEnqueuedAt: null,
      recordingEnteredAt: null,
      firstCycleStartedAt: null,
      firstCycleCompletedAt: null,
      readyToDriveAt: null,
    };

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
      return this.handleAlreadyRecording(input.organizationId, session.id, timestamps);
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
      nowMs: goRequestedAt.getTime(),
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

    let startedView: ReferenceCaptureSessionView;
    try {
      timestamps.startAcceptedAt = new Date().toISOString();
      startedView = await this.sessionService.startRecording(input.organizationId, session.id);
      timestamps.runnerEnqueuedAt = timestamps.startAcceptedAt;
      timestamps.recordingEnteredAt = new Date().toISOString();
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

    const poll = await this.pollForFirstCycle({
      organizationId: input.organizationId,
      sessionId: session.id,
      timeoutMs: this.config.getFastGoFirstCycleTimeoutMs(),
      timestamps,
    });

    if (!poll.readyToDrive) {
      await this.compensateFailedGo(input.organizationId, session.id, poll.reason);
      return poll;
    }

    timestamps.readyToDriveAt = new Date().toISOString();
    return poll;
  }

  private async pollForFirstCycle(args: {
    organizationId: string;
    sessionId: string;
    timeoutMs: number;
    timestamps: ReferenceCaptureFastGoTimestamps;
  }): Promise<ReferenceCaptureFastGoResult> {
    const pollMs = 250;
    const deadline = Date.now() + args.timeoutMs;
    let lastCycleCount = 0;

    while (Date.now() < deadline) {
      const session = await this.sessionRepository.findById(args.organizationId, args.sessionId);
      if (!session) {
        return this.failure(args.sessionId, ReferenceCaptureSessionStatus.FAILED, 0, 0, false, args.timestamps, [
          'session_disappeared_during_go',
        ]);
      }

      const state = parseAcquisitionState(session.acquisitionStateJson);
      if (state.activeCycleJobId && !args.timestamps.firstCycleStartedAt) {
        args.timestamps.firstCycleStartedAt = new Date().toISOString();
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
        args.timestamps.firstCycleCompletedAt = new Date().toISOString();
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
        const nextCycleScheduled = Boolean(session.pendingCycleJobId);
        return {
          readyToDrive: signalCount > 0,
          reason: signalCount > 0 ? 'first_cycle_confirmed' : 'first_cycle_without_signal_observations',
          sessionId: args.sessionId,
          sessionStatus: session.status,
          cycleCount: state.cycleCount,
          signalObservationCount: signalCount,
          nextCycleScheduled,
          timestamps: args.timestamps,
          blockers: signalCount > 0 ? [] : ['no_signal_observations_after_first_cycle'],
        };
      }

      lastCycleCount = state.cycleCount;
      await sleep(pollMs);
    }

    return this.failure(
      args.sessionId,
      ReferenceCaptureSessionStatus.RECORDING,
      lastCycleCount,
      0,
      false,
      args.timestamps,
      ['first_cycle_timeout'],
    );
  }

  private async handleAlreadyRecording(
    organizationId: string,
    sessionId: string,
    timestamps: ReferenceCaptureFastGoTimestamps,
  ): Promise<ReferenceCaptureFastGoResult> {
    const session = await this.sessionRepository.findById(organizationId, sessionId);
    if (!session || session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      return this.failure(sessionId, session?.status ?? ReferenceCaptureSessionStatus.FAILED, 0, 0, false, timestamps, [
        'recording_state_changed_during_idempotent_go',
      ]);
    }

    const state = parseAcquisitionState(session.acquisitionStateJson);
    if (state.cycleCount < 1) {
      return this.failure(sessionId, session.status, state.cycleCount, 0, false, timestamps, [
        'recording_without_confirmed_first_cycle',
      ]);
    }

    const observations = await this.observationRepository.findBySession(organizationId, sessionId, {
      limit: 5000,
    });
    const signalCount = observations.filter(
      (o) =>
        o.observationKind !== ReferenceCaptureObservationKind.NATIVE_EVENT &&
        o.observationKind !== ReferenceCaptureObservationKind.SESSION_METADATA,
    ).length;

    timestamps.recordingEnteredAt = session.startedAt?.toISOString() ?? timestamps.goRequestedAt;
    timestamps.readyToDriveAt = new Date().toISOString();

    return {
      readyToDrive: true,
      reason: 'already_recording_confirmed',
      sessionId,
      sessionStatus: session.status,
      cycleCount: state.cycleCount,
      signalObservationCount: signalCount,
      nextCycleScheduled: Boolean(session.pendingCycleJobId),
      timestamps,
      blockers: [],
    };
  }

  private async compensateFailedGo(
    organizationId: string,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    const session = await this.sessionRepository.findById(organizationId, sessionId);
    if (!session) return;

    if (
      session.status === ReferenceCaptureSessionStatus.RECORDING ||
      session.status === ReferenceCaptureSessionStatus.STARTING
    ) {
      await this.sessionService.abortSession(
        organizationId,
        sessionId,
        `fast_go_compensation:${reason}`,
      );
    }
  }

  private failure(
    sessionId: string,
    status: ReferenceCaptureSessionStatus,
    cycleCount: number,
    signalObservationCount: number,
    nextCycleScheduled: boolean,
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
      nextCycleScheduled,
      timestamps,
      blockers,
    };
  }
}
