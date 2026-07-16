import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import { DrivingEvidenceService } from '../driving-evidence/driving-evidence.service';
import { DrivingIntelligenceV2Config } from '../driving-intelligence-v2/driving-intelligence-v2.config';
import {
  compareMechanism,
  resolveDimoTripSegmentValidation,
} from './dimo-trip-segment-validation.comparator';
import {
  DIMO_SEGMENT_VALIDATION_MODEL_VERSION,
  DIMO_SEGMENT_VALIDATION_WINDOW_BUFFER_MS,
} from './dimo-trip-segment-validation.config';
import {
  DIMO_TRIP_SEGMENT_VALIDATION_MECHANISMS,
  type DimoTripSegmentValidationResult,
  type TripBoundarySnapshot,
  type ValidateTripSegmentInput,
} from './dimo-trip-segment-validation.types';

@Injectable()
export class DimoTripSegmentValidationService {
  private readonly logger = new Logger(DimoTripSegmentValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
    private readonly evidence: DrivingEvidenceService,
    private readonly v2Config: DrivingIntelligenceV2Config,
  ) {}

  isEnabled(): boolean {
    return this.v2Config.isDimoSegmentValidationEnabled();
  }

  async validateCompletedTrip(
    input: ValidateTripSegmentInput,
  ): Promise<DimoTripSegmentValidationResult> {
    const trip = await this.loadTripBoundarySnapshot(input.organizationId, input.tripId);
    if (trip.vehicleId !== input.vehicleId) {
      throw new NotFoundException('Trip vehicle mismatch for organization');
    }

    if (!this.isEnabled()) {
      return resolveDimoTripSegmentValidation({
        modelVersion: DIMO_SEGMENT_VALIDATION_MODEL_VERSION,
        trip,
        mechanisms: [],
        skipped: true,
        skipReason: 'DIMO_SEGMENT_VALIDATION_DISABLED',
      });
    }

    if (!input.dimoTokenId || input.dimoTokenId <= 0) {
      const mechanisms = DIMO_TRIP_SEGMENT_VALIDATION_MECHANISMS.map((mechanism) =>
        compareMechanism(trip, [], mechanism, 'DIMO_TOKEN_UNAVAILABLE'),
      );
      const result = resolveDimoTripSegmentValidation({
        modelVersion: DIMO_SEGMENT_VALIDATION_MODEL_VERSION,
        trip,
        mechanisms,
      });
      await this.persistDiagnosticEvidence(input, result);
      return result;
    }

    const windowFrom = new Date(trip.startTime.getTime() - DIMO_SEGMENT_VALIDATION_WINDOW_BUFFER_MS);
    const windowTo = new Date(
      (trip.endTime ?? trip.startTime).getTime() + DIMO_SEGMENT_VALIDATION_WINDOW_BUFFER_MS,
    );

    const mechanismResults = await Promise.all(
      DIMO_TRIP_SEGMENT_VALIDATION_MECHANISMS.map(async (mechanism) => {
        const fetch = await this.dimoSegments.fetchTripSegmentsForMechanism(
          input.dimoTokenId!,
          windowFrom,
          windowTo,
          mechanism,
        );
        return compareMechanism(trip, fetch.segments, mechanism, fetch.providerError);
      }),
    );

    const result = resolveDimoTripSegmentValidation({
      modelVersion: DIMO_SEGMENT_VALIDATION_MODEL_VERSION,
      trip,
      mechanisms: mechanismResults,
    });

    await this.persistDiagnosticEvidence(input, result);

    this.logger.debug(
      `Segment validation trip=${input.tripId} status=${result.overallStatus} ` +
        `primary=${result.primaryMechanism ?? 'none'}`,
    );

    return result;
  }

  private async loadTripBoundarySnapshot(
    organizationId: string,
    tripId: string,
  ): Promise<TripBoundarySnapshot> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: {
        id: true,
        vehicleId: true,
        dimoSegmentId: true,
        tripSource: true,
        startTime: true,
        endTime: true,
        durationMinutes: true,
        distanceKm: true,
        tripStatus: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }
    if (trip.tripStatus !== 'COMPLETED') {
      throw new NotFoundException('Segment validation requires COMPLETED trip');
    }

    return {
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      dimoSegmentId: trip.dimoSegmentId,
      tripSource: trip.tripSource,
      startTime: trip.startTime,
      endTime: trip.endTime,
      durationMinutes: trip.durationMinutes,
      distanceKm: trip.distanceKm,
    };
  }

  private async persistDiagnosticEvidence(
    input: ValidateTripSegmentInput,
    result: DimoTripSegmentValidationResult,
  ): Promise<void> {
    if (result.skipped) return;

    const primary = result.mechanisms.find((m) => m.mechanism === result.primaryMechanism);
    const strength =
      result.overallStatus === 'MATCHED'
        ? 'MEDIUM'
        : result.overallStatus === 'MINOR_BOUNDARY_DIFFERENCE'
          ? 'LOW'
          : 'NONE';

    await this.evidence.record({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      analysisRunId: input.analysisRunId,
      dimension: 'ASSESSABILITY',
      sourceType: 'CONTEXT_SIGNAL',
      strength,
      observedAt: result.trip.endTime ?? result.trip.startTime,
      providerSource: primary?.providerSource ?? 'dimo',
      capabilityVersion: 'dimo-segments',
      modelVersion: result.modelVersion,
      confidence:
        result.overallStatus === 'MATCHED'
          ? 0.85
          : result.overallStatus === 'MINOR_BOUNDARY_DIFFERENCE'
            ? 0.6
            : 0.3,
      sourceEntity: {
        table: 'vehicle_trips',
        id: input.tripId,
        kind: 'dimo_segment_validation',
      },
      context: {
        validationStatus: result.overallStatus ?? 'UNKNOWN',
        primaryMechanism: result.primaryMechanism,
        tripSource: result.trip.tripSource,
        tripDimoSegmentId: result.trip.dimoSegmentId,
        skipped: false,
        reasonCount: result.reasons.length,
        mechanismCount: result.mechanisms.length,
        startDeltaSec: primary?.deltas?.startDeltaSec ?? null,
        endDeltaSec: primary?.deltas?.endDeltaSec ?? null,
        durationDeltaSec: primary?.deltas?.durationDeltaSec ?? null,
        distanceDeltaKm: primary?.deltas?.distanceDeltaKm ?? null,
        segmentDataQuality: primary?.matchedSegment?.dataQuality ?? null,
      },
      idempotencyKey: `dimo-seg-validate:${input.tripId}:${result.modelVersion}`,
    });
  }
}
