import { Injectable, Logger } from '@nestjs/common';
import { ReferenceCaptureSettlementShadowProbeType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { loadFrozenReferenceManifest } from './reference-capture-manifest.loader';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { buildBroadReferenceHistoricalSignalsQuery } from './reference-capture-query-builder';
import { parseAcquisitionState } from './reference-capture-session.repository';
import type { HfCalibrationPhaseRecord } from './reference-capture-hf-calibration-phase.policy';
import {
  buildExperimentId,
  buildFixedIntervalProbesForPhase,
  buildProspectiveProbeAForPhase,
  buildProspectiveProbeBForPhase,
  buildProbeBForCompletedPhase,
  buildScheduleIdempotencyKey,
  buildWholeTripProbeId,
  computeActualAgeMs,
  computeScheduleDriftMs,
  EXP021_MANDATORY_AGES_MS,
  EXP021_PHASE_STABILIZATION_MS,
  EXP021_PRIMARY_PROBE_DURATION_MS,
  EXP021_WHOLE_TRIP_AGES_MS,
  validatePhaseDurationForProbes,
  validateProspectiveProbeBAgainstCompletedPhase,
  type SettlementShadowProbePlan,
} from './reference-capture-settlement-shadow.policy';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture-settlement-shadow-runner.service';
import {
  buildSettlementShadowAbortSkipReason,
  REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS,
} from './reference-capture-settlement-shadow.constants';
import {
  compareBucketSets,
  hashCanonicalShadowResponse,
  parseShadowSignalsResponse,
  SHADOW_AGGREGATION_INTERVAL,
} from './reference-capture-settlement-shadow-response.parser';
import {
  buildPhysicalDriveIntervalProbeId,
  computePdiExecutedOnTime,
  computePdiProspectiveAtCreation,
  EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
  EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY,
  EXP021_PDI_CANDIDATES_METADATA_KEY,
  rankCanonicalVehicleTripCandidates,
  type Exp021PhysicalDriveIntervalAuthority,
  type PdiCandidateOverlayRecord,
  type PhysicalEndCandidateStatus,
} from './reference-capture-exp-021-motion.lib';

@Injectable()
export class ReferenceCaptureSettlementShadowService {
  private readonly logger = new Logger(ReferenceCaptureSettlementShadowService.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly repository: ReferenceCaptureSettlementShadowRepository,
    private readonly runner: ReferenceCaptureSettlementShadowRunnerService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly dimoAuth: DimoAuthService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.config.isSettlementShadowEnabled();
  }

  isExperimentActive(status: string | null | undefined): boolean {
    return status === REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE;
  }

  /**
   * Canonical RC abort path: terminalize settlement-shadow experiment, skip unobserved
   * schedules, preserve completed observations, and remove queued BullMQ jobs.
   */
  async cancelExperimentForAbortedSession(args: {
    sessionId: string;
    organizationId: string;
    abortReason: string;
  }): Promise<{
    cancelled: boolean;
    alreadyTerminal: boolean;
    cleanupFailed: boolean;
    experimentId?: string;
    schedulesSkipped: number;
    schedulesCompleted: number;
    jobsRemoved: number;
    error?: string;
  }> {
    try {
      const result = await this.cancelExperimentForAbortedSessionInternal(args);
      return { ...result, cleanupFailed: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Settlement shadow abort cleanup failed session=${args.sessionId}: ${message}`,
      );
      return {
        cancelled: false,
        alreadyTerminal: false,
        cleanupFailed: true,
        schedulesSkipped: 0,
        schedulesCompleted: 0,
        jobsRemoved: 0,
        error: message,
      };
    }
  }

  /**
   * Reconcile persisted orphans: ABORTED RC session + ACTIVE settlement experiment.
   * Runs regardless of settlement-shadow feature flag (cleanup is never feature-gated).
   */
  async reconcileAbortedSessionSettlementExperiments(limit = 50): Promise<number> {
    const orphans = await this.repository.findAbortedSessionsWithActiveExperiments(limit);
    let reconciled = 0;
    for (const row of orphans) {
      const result = await this.cancelExperimentForAbortedSession({
        sessionId: row.sessionId,
        organizationId: row.organizationId,
        abortReason: row.session?.failureReason ?? 'reconciled_aborted_session_active_experiment',
      });
      if (result.cleanupFailed) {
        this.logger.error(
          `Aborted-session settlement reconciliation failed session=${row.sessionId}`,
        );
        continue;
      }
      if (result.cancelled || result.alreadyTerminal) {
        reconciled += 1;
        this.logger.warn(
          `Reconciled aborted-session active settlement experiment session=${row.sessionId} experiment=${row.id}`,
        );
      }
    }
    return reconciled;
  }

  private async cancelExperimentForAbortedSessionInternal(args: {
    sessionId: string;
    organizationId: string;
    abortReason: string;
  }): Promise<{
    cancelled: boolean;
    alreadyTerminal: boolean;
    experimentId?: string;
    schedulesSkipped: number;
    schedulesCompleted: number;
    jobsRemoved: number;
  }> {
    const experiment = await this.repository.findExperimentBySessionId(args.sessionId);
    if (!experiment) {
      return {
        cancelled: false,
        alreadyTerminal: false,
        schedulesSkipped: 0,
        schedulesCompleted: 0,
        jobsRemoved: 0,
      };
    }

    if (experiment.status === REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED) {
      return {
        cancelled: true,
        alreadyTerminal: true,
        experimentId: experiment.id,
        schedulesSkipped: 0,
        schedulesCompleted: 0,
        jobsRemoved: 0,
      };
    }

    const queuedJobs = await this.repository.findActiveBullJobIdsForSession(args.sessionId);
    const bullJobIds = queuedJobs.map((row) => row.bullJobId);
    const skipReason = buildSettlementShadowAbortSkipReason(args.abortReason);
    const abortedAt = new Date().toISOString();

    const { schedulesSkipped, schedulesCompleted, terminalized } = await this.prisma.$transaction(
      async (tx) =>
        this.repository.terminalizeAbortedSessionInTransaction(tx, {
          sessionId: args.sessionId,
          experimentDbId: experiment.id,
          abortReason: args.abortReason,
          abortedAt,
          organizationId: args.organizationId,
          existingMetadata: experiment.metadataJson,
          skipReason,
        }),
    );

    const { removed: jobsRemoved } = await this.runner.cancelQueuedJobsForSession(bullJobIds);

    if (!terminalized) {
      const latest = await this.repository.findExperimentBySessionId(args.sessionId);
      if (latest?.status === REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED) {
        return {
          cancelled: true,
          alreadyTerminal: true,
          experimentId: experiment.id,
          schedulesSkipped,
          schedulesCompleted,
          jobsRemoved,
        };
      }
    }

    return {
      cancelled: terminalized,
      alreadyTerminal: false,
      experimentId: experiment.id,
      schedulesSkipped,
      schedulesCompleted,
      jobsRemoved,
    };
  }

  async ensureExperiment(args: {
    sessionId: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    calibrationSeriesId?: string | null;
  }) {
    if (!this.isEnabled()) return null;
    const existing = await this.repository.findExperimentBySessionId(args.sessionId);
    if (existing) return existing;

    return this.repository.createExperiment({
      experimentId: buildExperimentId(args.sessionId),
      sessionId: args.sessionId,
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tokenId: args.tokenId,
      calibrationSeriesId: args.calibrationSeriesId ?? null,
      metadataJson: {
        channel: 'SETTLEMENT_SHADOW',
        primaryProbeDurationMs: EXP021_PRIMARY_PROBE_DURATION_MS,
        mandatoryAgesMs: [...EXP021_MANDATORY_AGES_MS],
      },
    });
  }

  async syncCompletedPhasesFromSession(args: {
    sessionId: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    acquisitionStateJson: unknown;
  }): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const state = parseAcquisitionState(args.acquisitionStateJson);
      const series = state.hfCalibrationSeries;
      if (!series) return;

      const experiment = await this.ensureExperiment({
        sessionId: args.sessionId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tokenId: series.tokenId ?? args.tokenId,
        calibrationSeriesId: series.calibrationSeriesId,
      });
      if (!experiment) return;
      if (!this.isExperimentActive(experiment.status)) return;

      await this.syncProspectiveProbesForActivePhase({
        experiment,
        series,
      });

      const completed: HfCalibrationPhaseRecord[] = series.completedPhases ?? [];
      if (completed.length > experiment.lastSyncedPhaseCount) {
        const newPhases = completed.slice(experiment.lastSyncedPhaseCount);
        for (const phase of newPhases) {
          if (!phase.phaseEndedAt) continue;
          await this.validateCompletedPhaseProbeGeometry({
            experiment,
            phase,
          });
        }
        await this.repository.updateLastSyncedPhaseCount(experiment.id, completed.length);
      }
    } catch (error) {
      this.logger.warn(
        `Settlement shadow phase sync failed session=${args.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * EXP-021 timing integrity: probe A/B intervals are deterministic from phase start,
   * so schedule +30/+60 observations before phase completion.
   */
  private async syncProspectiveProbesForActivePhase(args: {
    experiment: { id: string; experimentId: string; sessionId: string; organizationId: string; vehicleId: string; tokenId: number };
    series: NonNullable<ReturnType<typeof parseAcquisitionState>['hfCalibrationSeries']>;
  }): Promise<void> {
    const active = args.series.activePhase;
    if (!active?.phaseStartedAt) return;

    const phaseStartedAtMs = Date.parse(active.phaseStartedAt);
    if (!Number.isFinite(phaseStartedAtMs)) return;

    const probeA = buildProspectiveProbeAForPhase({
      phasePollIntervalMs: active.effectivePollIntervalMs,
      phaseStartedAtMs,
    });
    const probeB = buildProspectiveProbeBForPhase({
      phasePollIntervalMs: active.effectivePollIntervalMs,
      phaseStartedAtMs,
    });

    if (probeA) {
      await this.scheduleProbeObservations({
        experiment: args.experiment,
        probe: probeA,
      });
    }
    if (probeB) {
      await this.scheduleProbeObservations({
        experiment: args.experiment,
        probe: probeB,
      });
    }
  }

  private async validateCompletedPhaseProbeGeometry(args: {
    experiment: { id: string; experimentId: string; sessionId: string; organizationId: string; vehicleId: string; tokenId: number };
    phase: HfCalibrationPhaseRecord;
  }) {
    const phaseStartedAtMs = Date.parse(args.phase.phaseStartedAt);
    const phaseEndedAtMs = Date.parse(args.phase.phaseEndedAt ?? '');
    if (!Number.isFinite(phaseStartedAtMs) || !Number.isFinite(phaseEndedAtMs)) return;

    const validation = validatePhaseDurationForProbes({
      phaseStartedAtMs,
      phaseEndedAtMs,
      probeDurationMs: EXP021_PRIMARY_PROBE_DURATION_MS,
      stabilizationMs: EXP021_PHASE_STABILIZATION_MS,
    });

    if (!validation.sufficient) {
      this.logger.warn(
        `Insufficient phase duration for settlement probes phase=${args.phase.calibrationPhaseId} poll=${args.phase.effectivePollIntervalMs}`,
      );
      return;
    }

    const prospectiveProbeB = buildProspectiveProbeBForPhase({
      phasePollIntervalMs: args.phase.effectivePollIntervalMs,
      phaseStartedAtMs,
    });
    if (!prospectiveProbeB) return;

    const geometryCheck = validateProspectiveProbeBAgainstCompletedPhase({
      phaseStartedAtMs,
      phaseEndedAtMs,
      prospectiveProbeB,
    });
    if (!geometryCheck.matchesCompletedGeometry) {
      this.logger.warn(
        `Prospective probe B geometry differs from completed-phase rule phase=${args.phase.calibrationPhaseId} deltaMs=${geometryCheck.startOffsetDeltaMs}`,
      );
    }

    const { probe: completedProbeB, validation: probeBValidation } = buildProbeBForCompletedPhase({
      phasePollIntervalMs: args.phase.effectivePollIntervalMs,
      phaseStartedAtMs,
      phaseEndedAtMs,
    });
    if (!probeBValidation.probeB.fits || !completedProbeB) {
      this.logger.warn(
        `Completed-phase probe B validation failed phase=${args.phase.calibrationPhaseId}`,
      );
    }
  }

  private async scheduleProbeObservations(args: {
    experiment: { id: string; experimentId: string; sessionId: string; organizationId: string; vehicleId: string; tokenId: number };
    probe: SettlementShadowProbePlan;
  }) {
    const scheduleRows = [];
    for (const ageMs of EXP021_MANDATORY_AGES_MS) {
      const sourceEnd = new Date(args.probe.sourceIntervalEndMs);
      scheduleRows.push({
        experimentId: args.experiment.id,
        sessionId: args.experiment.sessionId,
        organizationId: args.experiment.organizationId,
        vehicleId: args.experiment.vehicleId,
        tokenId: args.experiment.tokenId,
        probeId: args.probe.probeId,
        probeType: ReferenceCaptureSettlementShadowProbeType.FIXED_INTERVAL,
        phase: args.probe.phaseLabel,
        sourceIntervalStart: new Date(args.probe.sourceIntervalStartMs),
        sourceIntervalEnd: sourceEnd,
        queryFrom: new Date(args.probe.queryFromMs),
        queryTo: new Date(args.probe.queryToMs),
        aggregationInterval: SHADOW_AGGREGATION_INTERVAL,
        scheduledAgeMs: ageMs,
        scheduledAt: new Date(args.probe.sourceIntervalEndMs + ageMs),
        idempotencyKey: buildScheduleIdempotencyKey({
          experimentId: args.experiment.experimentId,
          probeId: args.probe.probeId,
          scheduledAgeMs: ageMs,
        }),
      });
    }

    const { created } = await this.repository.createSchedulesIfAbsent(scheduleRows);
    if (created > 0) {
      await this.enqueuePendingSchedules(args.experiment.id);
    }
  }

  /** @deprecated retained for backward compatibility in tests — prefer split probe A/B scheduling */
  private async scheduleFixedIntervalProbesForPhase(args: {
    experiment: { id: string; experimentId: string; sessionId: string; organizationId: string; vehicleId: string; tokenId: number };
    phase: HfCalibrationPhaseRecord;
  }) {
    const phaseStartedAtMs = Date.parse(args.phase.phaseStartedAt);
    const phaseEndedAtMs = Date.parse(args.phase.phaseEndedAt ?? '');
    if (!Number.isFinite(phaseStartedAtMs) || !Number.isFinite(phaseEndedAtMs)) return;

    const { probes, validation } = buildFixedIntervalProbesForPhase({
      phasePollIntervalMs: args.phase.effectivePollIntervalMs,
      phaseStartedAtMs,
      phaseEndedAtMs,
    });

    if (!validation.sufficient) {
      this.logger.warn(
        `Insufficient phase duration for settlement probes phase=${args.phase.calibrationPhaseId} poll=${args.phase.effectivePollIntervalMs}`,
      );
      return;
    }

    for (const probe of probes) {
      await this.scheduleProbeObservations({
        experiment: args.experiment,
        probe,
      });
    }
  }

  private async enqueuePendingSchedules(experimentDbId: string) {
    const rows = await this.prisma.referenceCaptureSettlementShadowSchedule.findMany({
      where: {
        experimentId: experimentDbId,
        status: 'PENDING',
        bullJobId: null,
      },
    });
    for (const schedule of rows) {
      await this.runner.enqueueSchedule({
        id: schedule.id,
        experimentId: schedule.experimentId,
        sessionId: schedule.sessionId,
        organizationId: schedule.organizationId,
        scheduledAt: schedule.scheduledAt,
      });
    }
  }

  async scheduleWholeTripShadowFromVehicleTrip(args: {
    sessionId: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    sessionStartedAt: Date | null;
    sessionStoppedAt: Date;
  }): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const experiment = await this.ensureExperiment({
        sessionId: args.sessionId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tokenId: args.tokenId,
      });
      if (!experiment) return false;

      const physicalAuthority = this.readPhysicalDriveIntervalAuthority(experiment.metadataJson);
      const trip = await this.resolveCanonicalVehicleTrip({
        vehicleId: args.vehicleId,
        sessionStartedAt: args.sessionStartedAt,
        sessionStoppedAt: args.sessionStoppedAt,
        physicalStartAt: physicalAuthority
          ? new Date(physicalAuthority.physicalStartAt)
          : null,
        physicalEndAt: physicalAuthority ? new Date(physicalAuthority.physicalEndAt) : null,
      });
      if (!trip?.endTime) {
        this.logger.warn(
          `Whole-trip shadow skipped — no canonical VehicleTrip end for vehicle=${args.vehicleId} session=${args.sessionId} intervalSource=${trip?.intervalSource ?? 'NOT_FOUND'}`,
        );
        return false;
      }

      await this.repository.updateExperimentTripBinding(experiment.id, {
        vehicleTripId: trip.id,
        tripStartTime: trip.startTime,
        tripEndTime: trip.endTime,
      });
      await this.repository.mergeExperimentMetadataJson(experiment.id, {
        canonicalTripBinding: {
          binding: trip.binding,
          intervalSource: trip.intervalSource,
          overlapMs: trip.overlapMs,
          physicalIntervalCoverage: trip.physicalIntervalCoverage,
        },
      });

      const tripEndTime = trip.endTime;
      const scheduleRows = EXP021_WHOLE_TRIP_AGES_MS.map((ageMs) => ({
        experimentId: experiment.id,
        sessionId: args.sessionId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tokenId: args.tokenId,
        probeId: buildWholeTripProbeId(ageMs),
        probeType: ReferenceCaptureSettlementShadowProbeType.WHOLE_TRIP,
        phase: null,
        sourceIntervalStart: trip.startTime,
        sourceIntervalEnd: tripEndTime,
        queryFrom: trip.startTime,
        queryTo: tripEndTime,
        aggregationInterval: SHADOW_AGGREGATION_INTERVAL,
        scheduledAgeMs: ageMs,
        scheduledAt: new Date(tripEndTime.getTime() + ageMs),
        idempotencyKey: buildScheduleIdempotencyKey({
          experimentId: experiment.experimentId,
          probeId: buildWholeTripProbeId(ageMs),
          scheduledAgeMs: ageMs,
        }),
      }));

      const { created } = await this.repository.createSchedulesIfAbsent(scheduleRows);
      if (created > 0) {
        await this.enqueuePendingSchedules(experiment.id);
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Whole-trip shadow scheduling failed session=${args.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Recovery path when stopRecording runs before canonical VehicleTrip.endTime is persisted.
   */
  /**
   * Prospective physical-drive interval shadow — schedules +30…+600 from detected drive end,
   * independent of Trip FSM completion latency. Canonical WHOLE_TRIP (VehicleTrip) remains separate.
   */
  async schedulePhysicalDriveIntervalShadow(args: {
    sessionId: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    driveStartedAt: Date;
    driveEndedAt: Date;
    candidateId: string;
    candidateBoundaryAt: Date;
    candidateStatus: PhysicalEndCandidateStatus;
    scheduleCreatedAt?: Date;
  }): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const experiment = await this.ensureExperiment({
        sessionId: args.sessionId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tokenId: args.tokenId,
      });
      if (!experiment) return false;

      const scheduleCreatedAt = args.scheduleCreatedAt ?? new Date();
      const boundaryMs = args.candidateBoundaryAt.getTime();
      const scheduleRows = EXP021_MANDATORY_AGES_MS.map((ageMs) => ({
        experimentId: experiment.id,
        sessionId: args.sessionId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tokenId: args.tokenId,
        probeId: buildPhysicalDriveIntervalProbeId(ageMs),
        probeType: ReferenceCaptureSettlementShadowProbeType.WHOLE_TRIP,
        phase: EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
        sourceIntervalStart: args.driveStartedAt,
        sourceIntervalEnd: args.candidateBoundaryAt,
        queryFrom: args.driveStartedAt,
        queryTo: args.candidateBoundaryAt,
        aggregationInterval: SHADOW_AGGREGATION_INTERVAL,
        scheduledAgeMs: ageMs,
        scheduledAt: new Date(boundaryMs + ageMs),
        idempotencyKey: `${experiment.experimentId}|${buildPhysicalDriveIntervalProbeId(ageMs)}|${args.candidateId}|${ageMs}`,
      }));

      const { created } = await this.repository.createSchedulesIfAbsent(scheduleRows);
      if (created > 0) {
        await this.registerPdiCandidateOverlay({
          experimentDbId: experiment.id,
          candidateId: args.candidateId,
          candidateBoundaryAt: args.candidateBoundaryAt,
          candidateStatus: args.candidateStatus,
          candidateDetectedAt: scheduleCreatedAt,
        });
        await this.enqueuePendingSchedules(experiment.id);
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Physical-drive interval shadow scheduling failed session=${args.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async invalidatePhysicalDriveIntervalCandidate(args: {
    sessionId: string;
    candidateId: string;
    reason: string;
  }): Promise<number> {
    const schedules = await this.prisma.referenceCaptureSettlementShadowSchedule.findMany({
      where: {
        sessionId: args.sessionId,
        phase: EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
        status: { in: ['PENDING', 'EXECUTING'] },
        idempotencyKey: { contains: args.candidateId },
      },
      select: { id: true, bullJobId: true },
    });
    const bullJobIds = schedules.map((s) => s.bullJobId).filter((id): id is string => Boolean(id));
    await this.runner.cancelQueuedJobsForSession(bullJobIds);
    let skipped = 0;
    for (const row of schedules) {
      await this.repository.markSkipped(row.id, args.reason);
      skipped += 1;
    }
    const overlayUpdated = await this.updatePdiCandidateOverlayStatus({
      sessionId: args.sessionId,
      candidateId: args.candidateId,
      candidateStatus: 'INVALIDATED_END_CANDIDATE',
      reason: args.reason,
    });
    return skipped + (overlayUpdated ? 1 : 0);
  }

  async persistPhysicalDriveIntervalAuthority(args: {
    sessionId: string;
    physicalStartAt: Date;
    physicalEndAt: Date;
    candidateId?: string;
    source?: Exp021PhysicalDriveIntervalAuthority['source'];
  }): Promise<boolean> {
    const experiment = await this.repository.findExperimentBySessionId(args.sessionId);
    if (!experiment) return false;
    const authority: Exp021PhysicalDriveIntervalAuthority = {
      physicalStartAt: args.physicalStartAt.toISOString(),
      physicalEndAt: args.physicalEndAt.toISOString(),
      source: args.source ?? (args.candidateId ? 'PDI_CANDIDATE' : 'ORCHESTRATOR_CONFIRMED'),
      candidateId: args.candidateId,
    };
    await this.repository.mergeExperimentMetadataJson(experiment.id, {
      [EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY]: authority,
    });
    return true;
  }

  private async registerPdiCandidateOverlay(args: {
    experimentDbId: string;
    candidateId: string;
    candidateBoundaryAt: Date;
    candidateStatus: PhysicalEndCandidateStatus;
    candidateDetectedAt: Date;
  }): Promise<void> {
    const experiment = await this.prisma.referenceCaptureSettlementShadowExperiment.findUnique({
      where: { id: args.experimentDbId },
      select: { metadataJson: true },
    });
    const prior =
      experiment?.metadataJson &&
      typeof experiment.metadataJson === 'object' &&
      !Array.isArray(experiment.metadataJson)
        ? (experiment.metadataJson as Record<string, unknown>)
        : {};
    const existingCandidates =
      prior[EXP021_PDI_CANDIDATES_METADATA_KEY] &&
      typeof prior[EXP021_PDI_CANDIDATES_METADATA_KEY] === 'object' &&
      !Array.isArray(prior[EXP021_PDI_CANDIDATES_METADATA_KEY])
        ? (prior[EXP021_PDI_CANDIDATES_METADATA_KEY] as Record<string, PdiCandidateOverlayRecord>)
        : {};
    const nextRecord: PdiCandidateOverlayRecord = {
      candidateId: args.candidateId,
      candidateBoundaryAt: args.candidateBoundaryAt.toISOString(),
      candidateStatus: args.candidateStatus,
      candidateDetectedAt: args.candidateDetectedAt.toISOString(),
    };
    await this.repository.mergeExperimentMetadataJson(args.experimentDbId, {
      [EXP021_PDI_CANDIDATES_METADATA_KEY]: {
        ...existingCandidates,
        [args.candidateId]: nextRecord,
      },
    });
  }

  private async updatePdiCandidateOverlayStatus(args: {
    sessionId: string;
    candidateId: string;
    candidateStatus: PdiCandidateOverlayRecord['candidateStatus'];
    reason?: string;
  }): Promise<boolean> {
    const experiment = await this.repository.findExperimentBySessionId(args.sessionId);
    if (!experiment) return false;
    const prior =
      experiment.metadataJson &&
      typeof experiment.metadataJson === 'object' &&
      !Array.isArray(experiment.metadataJson)
        ? (experiment.metadataJson as Record<string, unknown>)
        : {};
    const existingCandidates =
      prior[EXP021_PDI_CANDIDATES_METADATA_KEY] &&
      typeof prior[EXP021_PDI_CANDIDATES_METADATA_KEY] === 'object' &&
      !Array.isArray(prior[EXP021_PDI_CANDIDATES_METADATA_KEY])
        ? (prior[EXP021_PDI_CANDIDATES_METADATA_KEY] as Record<string, PdiCandidateOverlayRecord>)
        : {};
    const current = existingCandidates[args.candidateId];
    if (!current) return false;
    await this.repository.mergeExperimentMetadataJson(experiment.id, {
      [EXP021_PDI_CANDIDATES_METADATA_KEY]: {
        ...existingCandidates,
        [args.candidateId]: {
          ...current,
          candidateStatus: args.candidateStatus,
          invalidatedAt: new Date().toISOString(),
          invalidatedReason: args.reason,
        },
      },
    });
    return true;
  }

  private readPhysicalDriveIntervalAuthority(
    metadataJson: unknown,
  ): Exp021PhysicalDriveIntervalAuthority | null {
    if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) {
      return null;
    }
    const raw = (metadataJson as Record<string, unknown>)[EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const record = raw as Exp021PhysicalDriveIntervalAuthority;
    if (!record.physicalStartAt || !record.physicalEndAt) {
      return null;
    }
    return record;
  }

  async recoverWholeTripShadowForPendingExperiments(now = new Date()): Promise<number> {
    if (!this.isEnabled()) return 0;

    const pending = await this.repository.findExperimentsMissingWholeTripShadow();
    let recovered = 0;
    let examined = 0;
    for (const row of pending) {
      if (examined >= 20) break;
      if (!row.session) continue;

      const wholeTripCount = row.schedules?.length ?? 0;
      const needsTripBinding = !row.vehicleTripId || !row.tripEndTime;
      const needsMoreSchedules = wholeTripCount < EXP021_WHOLE_TRIP_AGES_MS.length;
      if (!needsTripBinding && !needsMoreSchedules) {
        continue;
      }
      examined += 1;
      const sessionStoppedAt =
        row.session.stoppedAt ?? row.session.completedAt ?? row.session.startedAt ?? now;
      const ok = await this.scheduleWholeTripShadowFromVehicleTrip({
        sessionId: row.sessionId,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tokenId: row.tokenId,
        sessionStartedAt: row.session.startedAt,
        sessionStoppedAt,
      });
      if (ok) recovered += 1;
    }
    return recovered;
  }

  private async guardScheduleObservationAllowed(
    scheduleId: string,
    experimentDbId: string,
    existingObservation: unknown,
  ): Promise<boolean> {
    if (existingObservation) {
      return false;
    }
    const experiment = await this.repository.findExperimentStatusById(experimentDbId);
    if (experiment && !this.isExperimentActive(experiment.status)) {
      await this.repository.markSkipped(
        scheduleId,
        buildSettlementShadowAbortSkipReason('experiment_not_active'),
      );
      return false;
    }
    const latest = await this.repository.findScheduleById(scheduleId);
    if (!latest) {
      return false;
    }
    if (latest.observation) {
      return false;
    }
    if (latest.status === 'SKIPPED' || latest.status === 'COMPLETED' || latest.status === 'FAILED') {
      return false;
    }
    return true;
  }

  async executeScheduledObservation(scheduleId: string): Promise<void> {
    const schedule = await this.repository.findScheduleById(scheduleId);
    if (!schedule) return;

    if (!(await this.guardScheduleObservationAllowed(scheduleId, schedule.experimentId, schedule.observation))) {
      if (schedule.observation && schedule.status !== 'COMPLETED') {
        await this.repository.markCompleted(scheduleId, schedule.observation.requestCompletedAt);
      }
      return;
    }

    if (schedule.observation) {
      this.logger.debug(`Shadow observation already exists schedule=${scheduleId} — idempotent skip`);
      if (schedule.status !== 'COMPLETED') {
        await this.repository.markCompleted(scheduleId, schedule.observation.requestCompletedAt);
      }
      return;
    }

    const claimed = await this.repository.markExecutingIfEligible(scheduleId, schedule.experimentId);
    if (!claimed) {
      return;
    }

    const requestStartedAt = new Date();
    const sourceIntervalEndMs = schedule.sourceIntervalEnd.getTime();
    const actualAgeMs = computeActualAgeMs(requestStartedAt.getTime(), sourceIntervalEndMs);
    const scheduleDriftMs = computeScheduleDriftMs(actualAgeMs, schedule.scheduledAgeMs);

    const manifest = loadFrozenReferenceManifest();
    const providerFields = manifest.canonicalSignals.map((s) => s.providerField);

    const query = buildBroadReferenceHistoricalSignalsQuery(
      schedule.tokenId,
      providerFields,
      schedule.queryFrom,
      schedule.queryTo,
      schedule.aggregationInterval,
    );

    let providerRequestStatus = 'ERROR';
    let providerError: string | null = null;
    let rows: Array<Record<string, unknown>> = [];
    let requestCompletedAt = new Date();

    try {
      if (!query) {
        providerRequestStatus = 'ZERO_RESULT';
        providerError = 'no_historical_fields_in_manifest';
      } else {
        const jwt = await this.dimoAuth.getVehicleJwt(schedule.tokenId);
        const timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
          jwt,
          query,
          undefined,
          undefined,
          'REFERENCE_CAPTURE',
        );
        requestCompletedAt = new Date();
        rows = (timed.result?.data?.signals ?? []) as Array<Record<string, unknown>>;
        providerRequestStatus = rows.length > 0 ? 'SUCCESS' : 'ZERO_RESULT';
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error);
      providerRequestStatus = 'ERROR';
      requestCompletedAt = new Date();
      await this.persistObservation({
        schedule,
        actualAgeMs,
        scheduleDriftMs,
        requestStartedAt,
        requestCompletedAt,
        providerRequestStatus,
        providerError,
        rows,
        providerFields,
      });
      return;
    }

    if (!(await this.guardScheduleObservationAllowed(scheduleId, schedule.experimentId, null))) {
      return;
    }

    await this.persistObservation({
      schedule,
      actualAgeMs,
      scheduleDriftMs,
      requestStartedAt,
      requestCompletedAt,
      providerRequestStatus,
      providerError,
      rows,
      providerFields,
    });
  }

  private extractPdiCandidateIdFromIdempotencyKey(idempotencyKey: string | null | undefined): string | null {
    if (!idempotencyKey) return null;
    const parts = idempotencyKey.split('|');
    if (parts.length < 4 || !parts[2]?.startsWith('pdi-')) {
      return null;
    }
    return parts[2];
  }

  private async persistObservation(args: {
    schedule: {
      id: string;
      experimentId: string;
      sessionId: string;
      organizationId: string;
      vehicleId: string;
      tokenId: number;
      probeId: string;
      probeType: ReferenceCaptureSettlementShadowProbeType;
      phase: string | null;
      sourceIntervalStart: Date;
      sourceIntervalEnd: Date;
      scheduledAgeMs: number;
      queryFrom: Date;
      queryTo: Date;
      aggregationInterval: string;
      idempotencyKey?: string | null;
      createdAt: Date;
      scheduledAt: Date;
    };
    actualAgeMs: number;
    scheduleDriftMs: number;
    requestStartedAt: Date;
    requestCompletedAt: Date;
    providerRequestStatus: string;
    providerError: string | null;
    rows: Array<Record<string, unknown>>;
    providerFields: string[];
  }) {
    const parsed = parseShadowSignalsResponse({
      rows: args.rows,
      providerFields: args.providerFields,
    });

    const isPdiChannel = args.schedule.phase === EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL;
    const pdiCandidateId = isPdiChannel
      ? this.extractPdiCandidateIdFromIdempotencyKey(args.schedule.idempotencyKey)
      : null;

    let priorIdentities: string[] = [];
    if (isPdiChannel && pdiCandidateId) {
      const priorObservations = await this.prisma.referenceCaptureSettlementShadowObservation.findMany({
        where: {
          experimentId: args.schedule.experimentId,
          probeId: args.schedule.probeId,
          scheduledAgeMs: { lt: args.schedule.scheduledAgeMs },
          phase: EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
        },
        orderBy: { scheduledAgeMs: 'desc' },
        take: 20,
      });
      const sameCandidate = priorObservations.find((row) => {
        const json = row.observationJson as { candidateId?: string } | null;
        return json?.candidateId === pdiCandidateId;
      });
      priorIdentities =
        (sameCandidate?.observationJson as { uniqueBucketIdentities?: string[] } | null)
          ?.uniqueBucketIdentities ?? [];
    } else if (!isPdiChannel) {
      const priorObservations = await this.prisma.referenceCaptureSettlementShadowObservation.findMany({
        where: {
          experimentId: args.schedule.experimentId,
          probeId: args.schedule.probeId,
          scheduledAgeMs: { lt: args.schedule.scheduledAgeMs },
        },
        orderBy: { scheduledAgeMs: 'desc' },
        take: 1,
      });
      priorIdentities =
        (priorObservations[0]?.observationJson as { uniqueBucketIdentities?: string[] } | null)
          ?.uniqueBucketIdentities ?? [];
    }
    const comparison = compareBucketSets(parsed.uniqueBucketIdentities, priorIdentities);

    const candidateBoundaryAt = args.schedule.sourceIntervalEnd;
    const prospectiveAtCreation =
      isPdiChannel &&
      computePdiProspectiveAtCreation({
        scheduleCreatedAt: args.schedule.createdAt,
        candidateBoundaryAt,
        scheduledAgeMs: args.schedule.scheduledAgeMs,
      });
    const executedOnTime =
      isPdiChannel && args.schedule.scheduledAt
        ? computePdiExecutedOnTime({
            requestStartedAt: args.requestStartedAt,
            scheduledAt: args.schedule.scheduledAt,
          })
        : undefined;

    const observationPayload = {
      channel:
        isPdiChannel ? EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL : 'SETTLEMENT_SHADOW',
      probeId: args.schedule.probeId,
      probeType: args.schedule.probeType,
      phase: args.schedule.phase,
      ...(isPdiChannel && pdiCandidateId
        ? {
            candidateId: pdiCandidateId,
            candidateBoundaryAt: candidateBoundaryAt.toISOString(),
            scheduleCreatedAt: args.schedule.createdAt.toISOString(),
            requestStartedAt: args.requestStartedAt.toISOString(),
            scheduledAt: args.schedule.scheduledAt.toISOString(),
            prospectiveAtCreation,
            executedOnTime,
          }
        : {}),
      sourceIntervalStart: args.schedule.sourceIntervalStart.toISOString(),
      sourceIntervalEnd: args.schedule.sourceIntervalEnd.toISOString(),
      scheduledAgeMs: args.schedule.scheduledAgeMs,
      actualAgeMs: args.actualAgeMs,
      scheduleDriftMs: args.scheduleDriftMs,
      queryFrom: args.schedule.queryFrom.toISOString(),
      queryTo: args.schedule.queryTo.toISOString(),
      aggregationInterval: args.schedule.aggregationInterval,
      providerRequestStatus: args.providerRequestStatus,
      providerError: args.providerError,
      rawRowCount: args.rows.length,
      fieldSampleCounts: parsed.fieldSampleCounts,
      uniqueBucketCount: parsed.uniqueBucketIdentities.length,
      uniqueBucketIdentities: parsed.uniqueBucketIdentities,
      uniqueTemporalStarts: parsed.uniqueTemporalStarts,
      newBucketIdentities: comparison.newBucketIdentities,
      missingBucketIdentities: comparison.missingBucketIdentities,
      revisionCount: comparison.revisionCount,
      canonicalBucketIdentity: 'FIELD_PIPE_CANONICAL_ISO_MS',
    };

    const responseHash = hashCanonicalShadowResponse(observationPayload);

    try {
      const persisted = await this.repository.createObservationIfEligible({
        scheduleId: args.schedule.id,
        experimentId: args.schedule.experimentId,
        sessionId: args.schedule.sessionId,
        organizationId: args.schedule.organizationId,
        vehicleId: args.schedule.vehicleId,
        tokenId: args.schedule.tokenId,
        probeId: args.schedule.probeId,
        probeType: args.schedule.probeType,
        phase: args.schedule.phase,
        sourceIntervalStart: args.schedule.sourceIntervalStart,
        sourceIntervalEnd: args.schedule.sourceIntervalEnd,
        scheduledAgeMs: args.schedule.scheduledAgeMs,
        actualAgeMs: args.actualAgeMs,
        scheduleDriftMs: args.scheduleDriftMs,
        requestStartedAt: args.requestStartedAt,
        requestCompletedAt: args.requestCompletedAt,
        queryFrom: args.schedule.queryFrom,
        queryTo: args.schedule.queryTo,
        aggregationInterval: args.schedule.aggregationInterval,
        providerRequestStatus: args.providerRequestStatus,
        providerError: args.providerError,
        rawRowCount: args.rows.length,
        responseHash,
        observationJson: observationPayload,
      });
      if (!persisted) {
        this.logger.debug(
          `Shadow observation persistence skipped schedule=${args.schedule.id} — eligibility lost`,
        );
        return;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        this.logger.debug(`Duplicate shadow observation schedule=${args.schedule.id} — idempotent`);
        return;
      }
      throw error;
    }
  }

  private async resolveCanonicalVehicleTrip(args: {
    vehicleId: string;
    sessionStartedAt: Date | null;
    sessionStoppedAt: Date;
    physicalStartAt?: Date | null;
    physicalEndAt?: Date | null;
  }) {
    const windowStart = args.sessionStartedAt ?? new Date(args.sessionStoppedAt.getTime() - 4 * 60 * 60 * 1000);
    const intervalSource =
      args.physicalStartAt && args.physicalEndAt
        ? 'PHYSICAL_INTERVAL_AUTHORITATIVE'
        : 'SESSION_ENVELOPE_FALLBACK';
    const candidates = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: args.vehicleId,
        startTime: { lte: args.sessionStoppedAt },
        OR: [{ endTime: null }, { endTime: { gte: windowStart } }],
      },
      orderBy: { startTime: 'desc' },
      take: 10,
    });

    const physicalStartMs = (args.physicalStartAt ?? windowStart).getTime();
    const physicalEndMs = (args.physicalEndAt ?? args.sessionStoppedAt).getTime();
    const ranked = rankCanonicalVehicleTripCandidates({
      trips: candidates,
      physicalStartMs,
      physicalEndMs,
    });

    if (ranked.binding === 'SINGLE_MATCH') {
      return {
        id: ranked.trip.id,
        startTime: ranked.trip.startTime,
        endTime: ranked.trip.endTime,
        binding: ranked.binding,
        intervalSource,
        overlapMs: ranked.trip.overlapMs,
        physicalIntervalCoverage: ranked.trip.physicalIntervalCoverage,
        startBoundaryDeltaMs: ranked.trip.startBoundaryDeltaMs,
        endBoundaryDeltaMs: ranked.trip.endBoundaryDeltaMs,
      };
    }

    if (ranked.binding === 'AMBIGUOUS_SPLIT') {
      this.logger.warn(
        `Canonical VehicleTrip binding AMBIGUOUS_SPLIT vehicle=${args.vehicleId} intervalSource=${intervalSource} candidates=${ranked.candidates
          .map((c) => c.id)
          .join(',')}`,
      );
    }

    return intervalSource === 'SESSION_ENVELOPE_FALLBACK'
      ? { intervalSource, binding: ranked.binding }
      : { intervalSource, binding: ranked.binding };
  }
}
