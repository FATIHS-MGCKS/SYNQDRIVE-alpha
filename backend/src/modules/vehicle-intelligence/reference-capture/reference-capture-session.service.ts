import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import {
  REFERENCE_CAPTURE_CONNECTION_PROFILE,
  REFERENCE_CAPTURE_RECORDER_SOFTWARE_VERSION,
} from './reference-capture.constants';
import { loadFrozenReferenceManifest } from './reference-capture-manifest.loader';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { ReferenceCaptureMassBindingService } from './reference-capture-mass-binding.service';
import { ReferenceCapturePreflightService } from './reference-capture-preflight.service';
import { ReferenceCaptureAcquisitionService } from './reference-capture-acquisition.service';
import {
  ReferenceCaptureObservationWriterService,
  ReferenceCapturePersistenceError,
} from './reference-capture-observation-writer.service';
import { ReferenceCaptureObservationRepository } from './reference-capture-observation.repository';
import { ReferenceCaptureSessionRepository, parseAcquisitionState } from './reference-capture-session.repository';
import { ReferenceCaptureReadinessService } from './reference-capture-readiness.service';
import { ReferenceCaptureRunnerService } from './reference-capture-runner.service';
import {
  isRecognizedCalibrationPollIntervalMs,
  switchHfCalibrationPhase,
} from './reference-capture-hf-calibration-phase.policy';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  CreateReferenceCaptureSessionInput,
  ReferenceCaptureOperationalSnapshot,
  ReferenceCapturePreflightResult,
  ReferenceCaptureReadinessReport,
  ReferenceCaptureSessionView,
  VehicleMassBinding,
} from './reference-capture.types';

const ACTIVE_STATUSES: ReferenceCaptureSessionStatus[] = [
  ReferenceCaptureSessionStatus.CREATED,
  ReferenceCaptureSessionStatus.PREFLIGHT,
  ReferenceCaptureSessionStatus.READY,
  ReferenceCaptureSessionStatus.STARTING,
  ReferenceCaptureSessionStatus.RECORDING,
  ReferenceCaptureSessionStatus.STOPPING,
];

@Injectable()
export class ReferenceCaptureSessionService {
  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
    private readonly observationRepository: ReferenceCaptureObservationRepository,
    private readonly massBindingService: ReferenceCaptureMassBindingService,
    private readonly preflightService: ReferenceCapturePreflightService,
    private readonly acquisitionService: ReferenceCaptureAcquisitionService,
    private readonly observationWriter: ReferenceCaptureObservationWriterService,
    private readonly readinessService: ReferenceCaptureReadinessService,
    private readonly runnerService: ReferenceCaptureRunnerService,
    private readonly prisma: PrismaService,
  ) {}

  private assertEnabled(): void {
    if (!this.config.isEnabled()) {
      throw new ForbiddenException('Reference capture is disabled (REFERENCE_CAPTURE_ENABLED=false)');
    }
  }

  async createSession(input: CreateReferenceCaptureSessionInput): Promise<ReferenceCaptureSessionView> {
    this.assertEnabled();

    const manifest = loadFrozenReferenceManifest();
    const massBinding = await this.massBindingService.resolveMassBinding(
      input.organizationId,
      input.vehicleId,
    );

    const session = await this.sessionRepository.create({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      connectionProfile: input.connectionProfile ?? REFERENCE_CAPTURE_CONNECTION_PROFILE,
      manifestId: manifest.manifestId,
      manifestVersion: manifest.manifestVersion,
      recorderSoftwareVersion: REFERENCE_CAPTURE_RECORDER_SOFTWARE_VERSION,
      massBindingJson: massBinding,
      groundTruthVideoRef: input.groundTruthVideoRef ?? null,
    });

    return this.toView(session, massBinding, null, null);
  }

  async runPreflight(organizationId: string, sessionId: string): Promise<ReferenceCaptureSessionView> {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);

    if (
      session.status !== ReferenceCaptureSessionStatus.CREATED &&
      session.status !== ReferenceCaptureSessionStatus.PREFLIGHT
    ) {
      throw new BadRequestException(`Cannot run preflight from status ${session.status}`);
    }

    await this.sessionRepository.updateStatus(organizationId, sessionId, ReferenceCaptureSessionStatus.PREFLIGHT);

    try {
      const preflight = await this.preflightService.runPreflight(organizationId, session.vehicleId);
      const massBinding = (session.massBindingJson ?? null) as VehicleMassBinding | null;

      const readiness = await this.readinessService.assessSessionReadiness({
        organizationId,
        vehicleId: session.vehicleId,
        preflight,
        massBinding,
      });

      await this.sessionRepository.updateReadiness(organizationId, sessionId, readiness);

      if (!readiness.deploymentPreflightReady) {
        const failed = await this.sessionRepository.updateStatus(
          organizationId,
          sessionId,
          ReferenceCaptureSessionStatus.FAILED,
          {
            preflightJson: preflight,
            broadObservationFieldCount: preflight.broadObservationFieldCount,
            failureReason: `preflight_readiness_blocked: ${readiness.blockers.join(', ')}`,
            powertrainProfile: preflight.powertrainProfile,
            hardwareProfile: preflight.hardwareProfile,
          },
        );
        return this.toView(failed, massBinding, preflight, readiness);
      }

      const updated = await this.sessionRepository.updateStatus(
        organizationId,
        sessionId,
        ReferenceCaptureSessionStatus.READY,
        {
          preflightJson: preflight,
          broadObservationFieldCount: preflight.broadObservationFieldCount,
          failureReason: null,
          powertrainProfile: preflight.powertrainProfile,
          hardwareProfile: preflight.hardwareProfile,
        },
      );

      await this.recordSessionMetadataObservation(organizationId, sessionId, updated.vehicleId, preflight, 'PREFLIGHT_COMPLETE');

      return this.toView(updated, massBinding, preflight, readiness);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.sessionRepository.updateStatus(
        organizationId,
        sessionId,
        ReferenceCaptureSessionStatus.FAILED,
        { failureReason: message },
      );
      return this.toView(failed, session.massBindingJson as never, null, null);
    }
  }

  async startRecording(organizationId: string, sessionId: string): Promise<ReferenceCaptureSessionView> {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);

    if (session.status !== ReferenceCaptureSessionStatus.READY) {
      throw new BadRequestException(`Cannot start recording from status ${session.status}`);
    }

    const readiness = session.readinessJson as ReferenceCaptureReadinessReport | null;
    if (!readiness?.deploymentPreflightReady) {
      throw new BadRequestException('Session is not deployment-preflight ready — re-run preflight');
    }

    const starting = await this.sessionRepository.updateStatusIfCurrent(
      organizationId,
      sessionId,
      ReferenceCaptureSessionStatus.READY,
      ReferenceCaptureSessionStatus.STARTING,
      { startedAt: new Date() },
    );
    if (!starting) {
      throw new BadRequestException('Concurrent start request — session no longer READY');
    }

    try {
      const runnerJobId = this.runnerService.sessionRunnerKey(sessionId);
      const recording = await this.sessionRepository.updateStatusIfCurrent(
        organizationId,
        sessionId,
        ReferenceCaptureSessionStatus.STARTING,
        ReferenceCaptureSessionStatus.RECORDING,
        {
          runnerJobId,
          pendingCycleJobId: null,
        },
      );

      if (!recording) {
        throw new BadRequestException('Failed to transition session to RECORDING before runner enqueue');
      }

      await this.runnerService.startRunner({
        organizationId,
        vehicleId: session.vehicleId,
        sessionId,
        manifestVersion: session.manifestVersion,
        powertrainProfile: session.powertrainProfile,
      });

      const refreshed = await this.sessionRepository.findById(organizationId, sessionId);
      if (!refreshed || refreshed.status !== ReferenceCaptureSessionStatus.RECORDING) {
        await this.runnerService.stopRunner(organizationId, sessionId);
        throw new BadRequestException('Session left RECORDING before runner start completed');
      }

      return this.toView(
        refreshed,
        session.massBindingJson as never,
        session.preflightJson as never,
        readiness,
      );
    } catch (error) {
      await this.runnerService.stopRunner(organizationId, sessionId);
      const failureReason =
        error instanceof Error ? error.message : 'runner_start_failed';

      const revertedFromRecording = await this.sessionRepository.updateStatusIfCurrent(
        organizationId,
        sessionId,
        ReferenceCaptureSessionStatus.RECORDING,
        ReferenceCaptureSessionStatus.READY,
        {
          failureReason,
          runnerJobId: null,
          pendingCycleJobId: null,
        },
      );

      if (revertedFromRecording) {
        throw error instanceof BadRequestException
          ? error
          : new BadRequestException(
              `Failed to start reference capture runner: ${failureReason}`,
            );
      }

      const revertedFromStarting = await this.sessionRepository.updateStatusIfCurrent(
        organizationId,
        sessionId,
        ReferenceCaptureSessionStatus.STARTING,
        ReferenceCaptureSessionStatus.READY,
        {
          failureReason,
          runnerJobId: null,
          pendingCycleJobId: null,
        },
      );

      if (revertedFromStarting) {
        throw error instanceof BadRequestException
          ? error
          : new BadRequestException(
              `Failed to start reference capture runner: ${failureReason}`,
            );
      }

      const latest = await this.sessionRepository.findById(organizationId, sessionId);
      const latestStatus = latest?.status ?? 'UNKNOWN';
      throw new BadRequestException(
        `runner start failed; compensation superseded by concurrent session transition to ${latestStatus}`,
      );
    }
  }

  async captureTick(organizationId: string, sessionId: string): Promise<{
    session: ReferenceCaptureSessionView;
    signalPoints: number;
    nativeEvents: number;
    flushed: number;
  }> {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);

    if (session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      throw new BadRequestException(`Cannot capture tick from status ${session.status}`);
    }

    const preflight = session.preflightJson as ReferenceCapturePreflightResult | null;
    if (!preflight) {
      throw new BadRequestException('Session preflight missing — run preflight first');
    }

    try {
      const result = await this.acquisitionService.captureTick({
        organizationId,
        vehicleId: session.vehicleId,
        sessionId,
        cycleJobId: `diagnostic-${sessionId}-${Date.now()}`,
        preflight,
        manifestVersion: session.manifestVersion,
        powertrainProfile: session.powertrainProfile,
        cycleIntervalMs: this.config.getCycleIntervalMs(),
        slowCycleEvery: this.config.getSlowCycleEvery(),
      });

      return {
        session: this.toView(
          session,
          session.massBindingJson as never,
          preflight,
          session.readinessJson as ReferenceCaptureReadinessReport | null,
        ),
        signalPoints: result.signalPoints,
        nativeEvents: result.nativeEvents,
        flushed: result.flushed,
      };
    } catch (error) {
      if (error instanceof ReferenceCapturePersistenceError) {
        await this.sessionRepository.updateStatus(organizationId, sessionId, ReferenceCaptureSessionStatus.FAILED, {
          failureReason: error.message,
          stoppedAt: new Date(),
          completedAt: new Date(),
        });
        await this.runnerService.stopRunner(organizationId, sessionId);
        this.observationWriter.clearSession(sessionId);
      }
      throw error;
    }
  }

  async stopRecording(organizationId: string, sessionId: string): Promise<ReferenceCaptureSessionView> {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);

    if (session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      throw new BadRequestException(`Cannot stop recording from status ${session.status}`);
    }

    await this.sessionRepository.updateStatus(
      organizationId,
      sessionId,
      ReferenceCaptureSessionStatus.STOPPING,
      { stoppedAt: new Date() },
    );

    await this.runnerService.cancelPendingCycleJob(organizationId, sessionId);
    await this.sessionRepository.updateRunnerJobId(organizationId, sessionId, null);

    try {
      await this.observationWriter.flush(sessionId);
    } catch (error) {
      if (error instanceof ReferenceCapturePersistenceError) {
        const failed = await this.sessionRepository.updateStatus(
          organizationId,
          sessionId,
          ReferenceCaptureSessionStatus.FAILED,
          { failureReason: error.message, completedAt: new Date() },
        );
        this.observationWriter.clearSession(sessionId);
        return this.toView(
          failed,
          session.massBindingJson as never,
          session.preflightJson as never,
          session.readinessJson as ReferenceCaptureReadinessReport | null,
        );
      }
      throw error;
    }

    const completed = await this.sessionRepository.updateStatus(
      organizationId,
      sessionId,
      ReferenceCaptureSessionStatus.COMPLETED,
      { completedAt: new Date() },
    );

    this.observationWriter.clearSession(sessionId);

    return this.toView(
      completed,
      session.massBindingJson as never,
      session.preflightJson as never,
      session.readinessJson as ReferenceCaptureReadinessReport | null,
    );
  }

  async abortSession(organizationId: string, sessionId: string, reason?: string): Promise<ReferenceCaptureSessionView> {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);

    if (!ACTIVE_STATUSES.includes(session.status)) {
      throw new BadRequestException(`Cannot abort from status ${session.status}`);
    }

    if (session.status === ReferenceCaptureSessionStatus.RECORDING) {
      await this.sessionRepository.updateStatus(
        organizationId,
        sessionId,
        ReferenceCaptureSessionStatus.STOPPING,
        { stoppedAt: new Date() },
      );
    }

    await this.runnerService.cancelPendingCycleJob(organizationId, sessionId);
    await this.sessionRepository.updateRunnerJobId(organizationId, sessionId, null);

    try {
      await this.observationWriter.flush(sessionId);
    } catch {
      // Best-effort flush on abort — runner already stopped.
    }
    this.observationWriter.clearSession(sessionId);

    const aborted = await this.sessionRepository.updateStatus(
      organizationId,
      sessionId,
      ReferenceCaptureSessionStatus.ABORTED,
      {
        failureReason: reason ?? 'aborted_by_operator',
        stoppedAt: new Date(),
        completedAt: new Date(),
      },
    );

    return this.toView(
      aborted,
      session.massBindingJson as never,
      session.preflightJson as never,
      session.readinessJson as ReferenceCaptureReadinessReport | null,
    );
  }

  async getSession(organizationId: string, sessionId: string): Promise<ReferenceCaptureSessionView> {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);
    return this.toView(
      session,
      session.massBindingJson as never,
      session.preflightJson as never,
      session.readinessJson as ReferenceCaptureReadinessReport | null,
    );
  }

  async listObservations(
    organizationId: string,
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ) {
    this.assertEnabled();
    await this.requireSession(organizationId, sessionId);
    return this.observationRepository.findBySession(organizationId, sessionId, options);
  }

  async switchHfCalibrationPhase(
    organizationId: string,
    sessionId: string,
    body: { effectivePollIntervalMs: number },
  ) {
    this.assertEnabled();
    const session = await this.requireSession(organizationId, sessionId);
    if (session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      throw new BadRequestException(
        `HF calibration phase switch requires RECORDING status (current: ${session.status})`,
      );
    }
    const intervalMs = body.effectivePollIntervalMs;
    if (!Number.isFinite(intervalMs)) {
      throw new BadRequestException('effectivePollIntervalMs must be a finite number');
    }
    if (!isRecognizedCalibrationPollIntervalMs(intervalMs)) {
      throw new BadRequestException(
        `effectivePollIntervalMs must be one of calibration candidates: 10000, 20000, 30000, 60000`,
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: session.vehicleId, organizationId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) {
      throw new BadRequestException('Vehicle has no DIMO tokenId for calibration');
    }

    const state = parseAcquisitionState(session.acquisitionStateJson);
    const transition = switchHfCalibrationPhase({
      existing: state.hfCalibrationSeries ?? null,
      vehicleId: session.vehicleId,
      tokenId,
      effectivePollIntervalMs: intervalMs,
      nowMs: Date.now(),
    });

    const updated = await this.sessionRepository.mergeAcquisitionState(
      organizationId,
      sessionId,
      (current) => ({
        ...current,
        hfCalibrationSeries: transition.series,
        ...(transition.resetLastHfHistoricalPollAt ? { lastHfHistoricalPollAt: null } : {}),
      }),
    );
    if (!updated) throw new NotFoundException(`Reference capture session ${sessionId} not found`);

    const active = transition.series.activePhase!;
    return {
      calibrationSeriesId: transition.series.calibrationSeriesId,
      calibrationPhaseId: active.calibrationPhaseId,
      phaseSequence: active.phaseSequence,
      effectivePollIntervalMs: active.effectivePollIntervalMs,
      phaseOrder: transition.series.phaseOrder,
      phaseStartedAt: active.phaseStartedAt,
      previousPhaseEndedAt: transition.previousPhaseEndedAt,
      vehicleId: session.vehicleId,
      tokenId,
      referenceCaptureSessionId: sessionId,
      lastPhaseBoundaryAt: transition.series.lastPhaseBoundaryAt,
    };
  }

  private async requireSession(organizationId: string, sessionId: string) {
    const session = await this.sessionRepository.findById(organizationId, sessionId);
    if (!session) throw new NotFoundException(`Reference capture session ${sessionId} not found`);
    return session;
  }

  private async recordSessionMetadataObservation(
    organizationId: string,
    sessionId: string,
    vehicleId: string,
    preflight: ReferenceCapturePreflightResult,
    phase: string,
  ): Promise<void> {
    const now = new Date();
    await this.observationWriter.enqueueAndMaybeFlush(sessionId, organizationId, vehicleId, {
      envelopeVersion: '1.0.0',
      observationKind: ReferenceCaptureObservationKind.SESSION_METADATA,
      provider: 'SYNQDRIVE',
      connectionProfile: preflight.connectionProfile,
      powertrainProfile: preflight.powertrainProfile,
      providerField: null,
      canonicalKey: null,
      rawIdentity: `SYNQDRIVE::session_metadata::${phase}`,
      acquisitionSurface: 'VALIDATION_FLIGHT_RECORDER',
      acquisitionTier: 'T7',
      temporalClass: 'SESSION_METADATA',
      rawValue: { phase, preflight },
      synqReceivedAt: now,
      requestStartedAt: now,
      requestCompletedAt: now,
      provenance: {
        manifestVersion: preflight.manifestVersion,
        captureSessionId: sessionId,
      },
    });
    await this.observationWriter.flush(sessionId);
  }

  private toView(
    session: Awaited<ReturnType<ReferenceCaptureSessionRepository['findById']>> & object,
    massBinding: ReferenceCaptureSessionView['massBinding'],
    preflight: ReferenceCapturePreflightResult | null,
    readiness: ReferenceCaptureReadinessReport | null,
  ): ReferenceCaptureSessionView {
    const acquisitionState = parseAcquisitionState(
      'acquisitionStateJson' in session ? session.acquisitionStateJson : null,
    );
    const operational: ReferenceCaptureOperationalSnapshot = {
      cycleCount: acquisitionState.cycleCount ?? 0,
      runnerJobId: 'runnerJobId' in session ? (session.runnerJobId as string | null) : null,
      pendingCycleJobId:
        'pendingCycleJobId' in session ? (session.pendingCycleJobId as string | null) : null,
      preflightAssessedAt: readiness?.assessedAt ?? null,
      activeCycleJobId: acquisitionState.activeCycleJobId ?? null,
    };

    return {
      id: session.id,
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      connectionProfile: session.connectionProfile,
      powertrainProfile: session.powertrainProfile,
      hardwareProfile: session.hardwareProfile,
      manifestId: session.manifestId,
      manifestVersion: session.manifestVersion,
      status: session.status,
      recorderSoftwareVersion: session.recorderSoftwareVersion,
      broadObservationFieldCount: session.broadObservationFieldCount,
      massBinding: massBinding ?? (session.massBindingJson as ReferenceCaptureSessionView['massBinding']),
      preflight: preflight ?? (session.preflightJson as ReferenceCapturePreflightResult | null),
      readiness: readiness ?? (session.readinessJson as ReferenceCaptureReadinessReport | null),
      failureReason: session.failureReason,
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      operational,
    };
  }
}
