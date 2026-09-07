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
  buildScheduleIdempotencyKey,
  buildWholeTripProbeId,
  computeActualAgeMs,
  computeScheduleDriftMs,
  EXP021_MANDATORY_AGES_MS,
  EXP021_PRIMARY_PROBE_DURATION_MS,
  EXP021_WHOLE_TRIP_AGES_MS,
} from './reference-capture-settlement-shadow.policy';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture-settlement-shadow-runner.service';
import {
  compareBucketSets,
  hashCanonicalShadowResponse,
  parseShadowSignalsResponse,
  SHADOW_AGGREGATION_INTERVAL,
} from './reference-capture-settlement-shadow-response.parser';

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

      const completed: HfCalibrationPhaseRecord[] = series.completedPhases ?? [];
      if (completed.length <= experiment.lastSyncedPhaseCount) return;

      const newPhases = completed.slice(experiment.lastSyncedPhaseCount);
      for (const phase of newPhases) {
        if (!phase.phaseEndedAt) continue;
        await this.scheduleFixedIntervalProbesForPhase({
          experiment,
          phase,
        });
      }

      await this.repository.updateLastSyncedPhaseCount(experiment.id, completed.length);
    } catch (error) {
      this.logger.warn(
        `Settlement shadow phase sync failed session=${args.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

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

    const scheduleRows = [];
    for (const probe of probes) {
      for (const ageMs of EXP021_MANDATORY_AGES_MS) {
        const sourceEnd = new Date(probe.sourceIntervalEndMs);
        scheduleRows.push({
          experimentId: args.experiment.id,
          sessionId: args.experiment.sessionId,
          organizationId: args.experiment.organizationId,
          vehicleId: args.experiment.vehicleId,
          tokenId: args.experiment.tokenId,
          probeId: probe.probeId,
          probeType: ReferenceCaptureSettlementShadowProbeType.FIXED_INTERVAL,
          phase: probe.phaseLabel,
          sourceIntervalStart: new Date(probe.sourceIntervalStartMs),
          sourceIntervalEnd: sourceEnd,
          queryFrom: new Date(probe.queryFromMs),
          queryTo: new Date(probe.queryToMs),
          aggregationInterval: SHADOW_AGGREGATION_INTERVAL,
          scheduledAgeMs: ageMs,
          scheduledAt: new Date(probe.sourceIntervalEndMs + ageMs),
          idempotencyKey: buildScheduleIdempotencyKey({
            experimentId: args.experiment.experimentId,
            probeId: probe.probeId,
            scheduledAgeMs: ageMs,
          }),
        });
      }
    }

    const { created } = await this.repository.createSchedulesIfAbsent(scheduleRows);
    if (created > 0) {
      await this.enqueuePendingSchedules(args.experiment.id);
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
  }): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const trip = await this.resolveCanonicalVehicleTrip({
        vehicleId: args.vehicleId,
        sessionStartedAt: args.sessionStartedAt,
        sessionStoppedAt: args.sessionStoppedAt,
      });
      if (!trip?.endTime) {
        this.logger.warn(
          `Whole-trip shadow skipped — no canonical VehicleTrip end for vehicle=${args.vehicleId} session=${args.sessionId}`,
        );
        return;
      }

      const experiment = await this.ensureExperiment({
        sessionId: args.sessionId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tokenId: args.tokenId,
      });
      if (!experiment) return;

      await this.repository.updateExperimentTripBinding(experiment.id, {
        vehicleTripId: trip.id,
        tripStartTime: trip.startTime,
        tripEndTime: trip.endTime,
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
    } catch (error) {
      this.logger.warn(
        `Whole-trip shadow scheduling failed session=${args.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async executeScheduledObservation(scheduleId: string): Promise<void> {
    const schedule = await this.repository.findScheduleById(scheduleId);
    if (!schedule) return;

    if (schedule.observation) {
      this.logger.debug(`Shadow observation already exists schedule=${scheduleId} — idempotent skip`);
      if (schedule.status !== 'COMPLETED') {
        await this.repository.markCompleted(scheduleId, schedule.observation.requestCompletedAt);
      }
      return;
    }

    await this.repository.markExecuting(scheduleId);

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
      await this.repository.markFailed(scheduleId, providerError);
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
    await this.repository.markCompleted(scheduleId, requestCompletedAt);
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

    const priorObservations = await this.prisma.referenceCaptureSettlementShadowObservation.findMany({
      where: {
        experimentId: args.schedule.experimentId,
        probeId: args.schedule.probeId,
        scheduledAgeMs: { lt: args.schedule.scheduledAgeMs },
      },
      orderBy: { scheduledAgeMs: 'desc' },
      take: 1,
    });
    const priorIdentities =
      (priorObservations[0]?.observationJson as { uniqueBucketIdentities?: string[] } | null)
        ?.uniqueBucketIdentities ?? [];
    const comparison = compareBucketSets(parsed.uniqueBucketIdentities, priorIdentities);

    const observationPayload = {
      channel: 'SETTLEMENT_SHADOW',
      probeId: args.schedule.probeId,
      probeType: args.schedule.probeType,
      phase: args.schedule.phase,
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
      await this.repository.createObservation({
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
  }) {
    const windowStart = args.sessionStartedAt ?? new Date(args.sessionStoppedAt.getTime() - 4 * 60 * 60 * 1000);
    const candidates = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: args.vehicleId,
        startTime: { lte: args.sessionStoppedAt },
        OR: [{ endTime: null }, { endTime: { gte: windowStart } }],
      },
      orderBy: { startTime: 'desc' },
      take: 5,
    });

    const completed = candidates.find(
      (trip) => trip.endTime && trip.endTime.getTime() >= windowStart.getTime(),
    );
    return completed ?? null;
  }
}
