import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingEvidenceService } from '../driving-evidence/driving-evidence.service';
import { DrivingDetectorCapabilityResolverService } from '../driving-detector-capability/driving-detector-capability.service';
import { DrivingIntelligenceV2Config } from '../driving-intelligence-v2/driving-intelligence-v2.config';
import { SHADOW_DETECTOR_IMPLEMENTATIONS } from './shadow-detector.registry';
import { ShadowDetectorPersistence } from './shadow-detector.persistence';
import { runShadowDetectorFramework } from './shadow-detector.runner';
import { SHADOW_DETECTOR_FRAMEWORK_VERSION } from './shadow-detector.types';

export type RunShadowDetectorsForTripInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId: string;
};

@Injectable()
export class ShadowDetectorOrchestratorService {
  private readonly logger = new Logger(ShadowDetectorOrchestratorService.name);
  private readonly persistence: ShadowDetectorPersistence;

  constructor(
    private readonly prisma: PrismaService,
    private readonly detectorCapabilities: DrivingDetectorCapabilityResolverService,
    private readonly evidence: DrivingEvidenceService,
    private readonly v2Config: DrivingIntelligenceV2Config,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {
    this.persistence = new ShadowDetectorPersistence(evidence);
  }

  isFrameworkEnabled(): boolean {
    return (
      this.v2Config.isMasterEnabled() &&
      (this.v2Config.isEngineDetectorShadowEnabled() ||
        this.v2Config.isHfDetectorShadowEnabled())
    );
  }

  async runForTrip(input: RunShadowDetectorsForTripInput) {
    if (!this.isFrameworkEnabled()) {
      this.tripMetrics?.shadowDetectorFrameworkSkipped.inc({ reason: 'flags_disabled' });
      return {
        skippedFramework: true,
        skipReason: 'shadow_flags_disabled',
        results: [],
      };
    }

    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: input.tripId, vehicle: { organizationId: input.organizationId } },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        tripStatus: true,
      },
    });

    if (!trip || trip.tripStatus !== 'COMPLETED') {
      this.tripMetrics?.shadowDetectorFrameworkSkipped.inc({ reason: 'trip_not_completed' });
      return {
        skippedFramework: true,
        skipReason: 'trip_not_completed',
        results: [],
      };
    }

    const [capabilityResult, nativeEvents] = await Promise.all([
      this.detectorCapabilities.resolveForVehicle(input.organizationId, input.vehicleId),
      this.prisma.drivingEvent.findMany({
        where: { tripId: input.tripId, vehicleId: input.vehicleId },
        select: { eventType: true, recordedAt: true },
      }),
    ]);

    const outcome = await runShadowDetectorFramework({
      trip: {
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        analysisRunId: input.analysisRunId,
        startTime: trip.startTime,
        endTime: trip.endTime,
        frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
        resolvedAt: capabilityResult.resolvedAt,
      },
      capabilities: capabilityResult.detectors,
      implementations: SHADOW_DETECTOR_IMPLEMENTATIONS,
      nativeEvents: nativeEvents.map((event) => ({
        eventType: event.eventType,
        occurredAt: event.recordedAt,
      })),
      engineShadowEnabled: this.v2Config.isEngineDetectorShadowEnabled(),
      hfShadowEnabled: this.v2Config.isHfDetectorShadowEnabled(),
    });

    if (outcome.skippedFramework) {
      this.tripMetrics?.shadowDetectorFrameworkSkipped.inc({
        reason: outcome.skipReason ?? 'unknown',
      });
      return outcome;
    }

    const observedAt = trip.endTime ?? trip.startTime;
    for (const result of outcome.results) {
      if (result.skipped) {
        this.tripMetrics?.shadowDetectorSkipped.inc({
          detector_id: result.detectorId,
          reason: result.skipReason ?? 'skipped',
        });
        continue;
      }

      await this.persistence.persistResult({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        analysisRunId: input.analysisRunId,
        observedAt,
        result,
      });

      this.tripMetrics?.shadowDetectorRun.inc({
        detector_id: result.detectorId,
        result: 'completed',
      });
      this.tripMetrics?.shadowDetectorCandidates.inc(
        { detector_id: result.detectorId },
        result.candidateEvents.length,
      );
    }

    this.logger.debug(
      `Shadow detectors trip=${input.tripId} run=${input.analysisRunId} ` +
        `results=${outcome.results.length}`,
    );

    return outcome;
  }
}
