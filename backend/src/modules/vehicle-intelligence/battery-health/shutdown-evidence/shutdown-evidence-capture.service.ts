import { Injectable, Logger, Optional } from '@nestjs/common';
import { BatteryDriveProfile, BatteryShutdownEvidenceClass } from '@prisma/client';
import { isBatteryV2ShutdownEvidenceShadowEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import type { BatteryObservationClassifyPayload } from '../jobs/battery-v2-job.types';
import {
  SHUTDOWN_CAPTURE_POST_WINDOW_MS,
  SHUTDOWN_CAPTURE_PRE_WINDOW_MS,
  SHUTDOWN_EVIDENCE_SOURCE_KINDS,
} from './shutdown-evidence.constants';
import { classifyShutdownEvidence } from './shutdown-evidence-classification.policy';
import { buildShutdownEvidenceObservationIdempotencyKey } from './shutdown-evidence-idempotency.policy';
import {
  recordShutdownEvidenceDuplicateSuppressed,
  recordShutdownEvidenceObservationCreated,
  recordShutdownPostEngineOffCandidate,
} from './shutdown-evidence.metrics';
import { buildShutdownFieldBundleFromSnapshotIngest } from './shutdown-evidence-provenance.builder';
import { ShutdownEvidenceRepository } from './shutdown-evidence.repository';
import type { ShutdownEvidenceCaptureOutcome } from './shutdown-evidence.types';

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

@Injectable()
export class ShutdownEvidenceCaptureService {
  private readonly logger = new Logger(ShutdownEvidenceCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ShutdownEvidenceRepository,
    private readonly batteryPolicy: BatteryPolicyProfileService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async captureFromObservationClassify(
    payload: BatteryObservationClassifyPayload,
  ): Promise<ShutdownEvidenceCaptureOutcome> {
    if (!isBatteryV2ShutdownEvidenceShadowEnabled()) {
      return 'skipped_flag_off';
    }

    const ctx = payload.snapshotContext;
    if (!ctx || ctx.lvBatteryVoltage == null) {
      return 'skipped_no_voltage';
    }

    const policy = await this.batteryPolicy.resolveForVehicle(payload.vehicleId);
    if (policy.driveProfile !== BatteryDriveProfile.ICE) {
      return 'skipped_not_ice';
    }

    const ingestedAt = parseIso(ctx.providerFetchedAt) ?? new Date();
    const providerObservationAt =
      parseIso(ctx.lvBatteryObservedAt) ?? ingestedAt;

    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: payload.vehicleId },
      select: {
        latestState: {
          select: {
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryIsCharging: true,
            tractionBatteryChargingPowerKw: true,
            online: true,
            lastSeenAt: true,
            sourceTimestamp: true,
            providerFetchedAt: true,
            syncJobRef: true,
          },
        },
        tripDetectionState: {
          select: { activeTripId: true, lastActivityAt: true },
        },
      },
    });

    const trip = await this.repository.findLatestCompletedIceTripInCaptureWindow({
      vehicleId: payload.vehicleId,
      observationAt: providerObservationAt,
      preWindowMs: SHUTDOWN_CAPTURE_PRE_WINDOW_MS,
      postWindowMs: SHUTDOWN_CAPTURE_POST_WINDOW_MS,
    });

    if (!trip?.endTime) {
      return 'skipped_outside_window';
    }

    const relativeToTripEndMs =
      providerObservationAt.getTime() - trip.endTime.getTime();
    if (
      relativeToTripEndMs < -SHUTDOWN_CAPTURE_PRE_WINDOW_MS ||
      relativeToTripEndMs > SHUTDOWN_CAPTURE_POST_WINDOW_MS
    ) {
      return 'skipped_outside_window';
    }

    const { fields, sourceSnapshotId } = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: ctx,
      vls: vehicleRow?.latestState ?? null,
      tripDetection: vehicleRow?.tripDetectionState ?? null,
      ingestedAt,
    });

    const classification = classifyShutdownEvidence({
      fields,
      tripEndedAt: trip.endTime,
      tripStartedAt: trip.startTime,
      relativeToTripEndMs,
      referenceAt: providerObservationAt,
    });

    const idempotencyKey = buildShutdownEvidenceObservationIdempotencyKey({
      vehicleId: payload.vehicleId,
      provider: 'DIMO',
      providerObservationAtMs: providerObservationAt.getTime(),
      sourceKind: SHUTDOWN_EVIDENCE_SOURCE_KINDS.LIVE_VOLTAGE_CLASSIFY,
      sourceObservationId: payload.idempotencyKey,
      voltage: fields.voltage,
    });

    const result = await this.repository.createObservationIdempotent({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      tripId: trip.id,
      provider: 'DIMO',
      providerObservationAt,
      providerResponseAt: ingestedAt,
      ingestedAt,
      voltage: fields.voltage,
      voltageObservedAt: fields.voltageObservedAt,
      speedKmh: fields.speedKmh,
      speedObservedAt: fields.speedObservedAt,
      speedTimestampSource: fields.speedTimestampSource,
      ignitionOn: fields.ignitionOn,
      ignitionObservedAt: fields.ignitionObservedAt,
      ignitionTimestampSource: fields.ignitionTimestampSource,
      engineRunning: fields.engineRunning,
      engineRunningObservedAt: fields.engineRunningObservedAt,
      engineRunningTimestampSource: fields.engineRunningTimestampSource,
      isLvCharging: fields.isLvCharging,
      isHvCharging: fields.isHvCharging,
      chargingContextObservedAt: fields.chargingContextObservedAt,
      chargingContextTimestampSource: fields.chargingContextTimestampSource,
      activeTrip: fields.activeTrip,
      activeTripObservedAt: fields.activeTripObservedAt,
      activeTripTimestampSource: fields.activeTripTimestampSource,
      tripStartedAt: trip.startTime,
      tripEndedAt: trip.endTime,
      relativeToTripEndMs,
      vehicleOnline: fields.vehicleOnline,
      vehicleOnlineObservedAt: fields.vehicleOnlineObservedAt,
      providerLastSeenAt: fields.providerLastSeenAt,
      sourceObservationId: payload.idempotencyKey,
      sourceSnapshotId,
      sourceKind: SHUTDOWN_EVIDENCE_SOURCE_KINDS.LIVE_VOLTAGE_CLASSIFY,
      stateTimestampSkewMs: classification.stateTimestampSkewMs,
      maxFieldTimestampSkewMs: classification.maxFieldTimestampSkewMs,
      stateCompleteness: classification.stateCompleteness,
      stateAlignmentClass: classification.stateAlignmentClass,
      evidenceClass: classification.evidenceClass,
      confidenceClass: classification.confidenceClass,
      fieldProvenance: {
        voltageTimestampSource: fields.voltageTimestampSource,
        speedTimestampSource: fields.speedTimestampSource,
        ignitionTimestampSource: fields.ignitionTimestampSource,
        engineRunningTimestampSource: fields.engineRunningTimestampSource,
        chargingContextTimestampSource: fields.chargingContextTimestampSource,
        activeTripTimestampSource: fields.activeTripTimestampSource,
      },
      idempotencyKey,
    });

    if (result === 'duplicate') {
      recordShutdownEvidenceDuplicateSuppressed(this.metrics);
      return 'duplicate';
    }

    recordShutdownEvidenceObservationCreated(this.metrics, {
      evidenceClass: classification.evidenceClass,
      confidenceClass: classification.confidenceClass,
      stateAlignmentClass: classification.stateAlignmentClass,
    });

    if (
      classification.evidenceClass ===
      BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP
    ) {
      recordShutdownPostEngineOffCandidate(this.metrics, true);
    } else if (
      classification.evidenceClass ===
      BatteryShutdownEvidenceClass.SHUTDOWN_TRANSITION
    ) {
      recordShutdownPostEngineOffCandidate(this.metrics, false);
    }

    this.logger.debug(
      `shutdown evidence observation vehicle=${payload.vehicleId} trip=${trip.id} class=${classification.evidenceClass} relMs=${relativeToTripEndMs}`,
    );

    return 'created';
  }
}
