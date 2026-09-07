import { Injectable, Logger, Optional } from '@nestjs/common';
import { BatteryDriveProfile, Prisma } from '@prisma/client';
import { isBatteryV2ShutdownEvidenceShadowEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { resolveStateAlignment, resolveStateCompleteness } from './shutdown-evidence-classification.policy';
import { buildTripShutdownContextIdempotencyKey } from './shutdown-evidence-idempotency.policy';
import {
  recordShutdownContextCreated,
  recordShutdownContextMissingState,
} from './shutdown-evidence.metrics';
import {
  buildShutdownFieldBundleFromSnapshotIngest,
  buildTripShutdownContextSnapshotFields,
} from './shutdown-evidence-provenance.builder';
import { ShutdownEvidenceRepository } from './shutdown-evidence.repository';
import type { TripShutdownContextCaptureOutcome } from './shutdown-evidence.types';

export interface CaptureTripShutdownContextInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripEndedAt: Date;
}

@Injectable()
export class ShutdownEvidenceTripContextService {
  private readonly logger = new Logger(ShutdownEvidenceTripContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ShutdownEvidenceRepository,
    private readonly batteryPolicy: BatteryPolicyProfileService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async captureAtTripFinalization(
    input: CaptureTripShutdownContextInput,
  ): Promise<TripShutdownContextCaptureOutcome> {
    if (!isBatteryV2ShutdownEvidenceShadowEnabled()) {
      return 'skipped_flag_off';
    }

    const policy = await this.batteryPolicy.resolveForVehicle(input.vehicleId);
    if (policy.driveProfile !== BatteryDriveProfile.ICE) {
      return 'skipped_not_ice';
    }

    const capturedAt = new Date();
    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: {
        latestState: {
          select: {
            lvBatteryVoltage: true,
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

    if (!vehicleRow?.latestState) {
      recordShutdownContextMissingState(this.metrics);
    }

    const snapshot = buildTripShutdownContextSnapshotFields({
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      tripEndedAt: input.tripEndedAt,
      capturedAt,
      vls: vehicleRow?.latestState ?? null,
      tripDetection: vehicleRow?.tripDetectionState ?? null,
    });

    const bundle = buildShutdownFieldBundleFromSnapshotIngest({
      snapshotContext: {
        providerFetchedAt: capturedAt.toISOString(),
        lvBatteryVoltage: vehicleRow?.latestState?.lvBatteryVoltage ?? null,
        lvBatteryObservedAt: null,
      },
      vls: vehicleRow?.latestState ?? null,
      tripDetection: vehicleRow?.tripDetectionState ?? null,
      ingestedAt: capturedAt,
    }).fields;

    const stateCompleteness = resolveStateCompleteness(bundle);
    const alignment = resolveStateAlignment(bundle, capturedAt);

    const firstAfterAtCapture =
      await this.repository.findFirstObservationAfterTripEndAtCapture({
        vehicleId: input.vehicleId,
        tripEndedAt: input.tripEndedAt,
        capturedAt,
      });

    const idempotencyKey = buildTripShutdownContextIdempotencyKey({
      vehicleId: input.vehicleId,
      tripId: input.tripId,
    });

    const result = await this.repository.createTripContextIdempotent({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      tripEndedAt: input.tripEndedAt,
      snapshot: snapshot as Prisma.InputJsonValue,
      stateTimestampSkewMs: alignment.stateTimestampSkewMs,
      maxFieldTimestampSkewMs: alignment.maxFieldTimestampSkewMs,
      stateCompleteness,
      stateAlignmentClass: alignment.stateAlignmentClass,
      postTripObservationPresentAtCapture: firstAfterAtCapture != null,
      firstObservationAfterTripEndAtAtCapture: firstAfterAtCapture,
      idempotencyKey,
    });

    if (result === 'duplicate') {
      return 'duplicate';
    }

    recordShutdownContextCreated(this.metrics, {
      stateAlignmentClass: alignment.stateAlignmentClass,
      stateCompleteness,
    });

    if (stateCompleteness === 'MISSING') {
      recordShutdownContextMissingState(this.metrics);
    }

    this.logger.debug(
      `trip shutdown context vehicle=${input.vehicleId} trip=${input.tripId} completeness=${stateCompleteness}`,
    );

    return 'created';
  }
}
