import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseAnalysisHealthService } from '@modules/clickhouse/clickhouse-analysis-health.service';
import { buildTripAssessabilityClickHouseInput } from '@modules/clickhouse/clickhouse-assessability-bridge';
import { parseBehaviorSummaryJson } from '../trips/trip-analysis-status';
import type { TripAssessabilityPolicyInput } from './trip-assessability.types';

@Injectable()
export class TripAssessabilityInputLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickHouseHealth: ClickHouseAnalysisHealthService,
  ) {}

  async loadForTrip(
    organizationId: string,
    tripId: string,
  ): Promise<Omit<TripAssessabilityPolicyInput, 'capabilities' | 'detectorCapabilities'>> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        tripStatus: true,
        qualityStatus: true,
        dimoSegmentId: true,
        behaviorEnrichmentStatus: true,
        enrichedAt: true,
        distanceKm: true,
        durationMinutes: true,
        harshBrakeCount: true,
        hardBrakingEvents: true,
        brakingEventCount: true,
        harshCornerCount: true,
        corneringEvents: true,
        coldEngineAbuseCount: true,
        kickdownCount: true,
        abuseEvents: true,
        possibleImpactCount: true,
        avgEngineLoad: true,
        avgRpm: true,
        avgThrottlePosition: true,
        abuseScore: true,
        assignmentStatus: true,
        assignmentSubjectType: true,
        assignmentSubjectId: true,
        isPrivateTrip: true,
        behaviorSummaryJson: true,
        analysisStagesJson: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }

    const behaviorSummary = parseBehaviorSummaryJson(trip.behaviorSummaryJson);
    const stages =
      trip.analysisStagesJson && typeof trip.analysisStagesJson === 'object'
        ? (trip.analysisStagesJson as Record<string, string>)
        : {};

    const nativeEventCount = await this.prisma.drivingEvent.count({
      where: {
        organizationId,
        vehicleId: trip.vehicleId,
        tripId,
        source: 'TELEMETRY_EVENTS',
      },
    });

    const reconstructedEventCount = await this.prisma.drivingEvent.count({
      where: {
        organizationId,
        vehicleId: trip.vehicleId,
        tripId,
        source: 'HF_DERIVED',
      },
    });

    const misuseCaseCount = await this.prisma.misuseCase.count({
      where: { organizationId, tripId },
    });

    const waypointCount = await this.prisma.vehicleTripWaypoint.count({
      where: { tripId },
    });

    const tripImpact = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId },
      select: { id: true },
    });

    const clickHouse = buildTripAssessabilityClickHouseInput(
      this.clickHouseHealth.getAnalysisHealth(),
    );

    const calculatedAt = new Date();

    return {
      calculatedAt,
      inputWindowStart: trip.startTime,
      inputWindowEnd: trip.endTime,
      tripBoundary: {
        dimoSegmentId: trip.dimoSegmentId,
        startTime: trip.startTime,
        endTime: trip.endTime,
        tripStatus: trip.tripStatus,
        qualityStatus: trip.qualityStatus,
      },
      route: {
        enrichmentStatus: trip.enrichedAt ? 'COMPLETED' : null,
        waypointCount,
        coverage: typeof behaviorSummary.routeCoverage === 'number' ? behaviorSummary.routeCoverage : null,
        effectiveCadenceMs:
          typeof behaviorSummary.effectiveCadenceMs === 'number' ? behaviorSummary.effectiveCadenceMs : null,
        p95CadenceMs: typeof behaviorSummary.p95CadenceMs === 'number' ? behaviorSummary.p95CadenceMs : null,
        providerError: behaviorSummary.routeProviderError === true,
      },
      behavior: {
        enrichmentStatus: trip.behaviorEnrichmentStatus,
        nativeEventCount,
        nativeQuerySucceeded:
          behaviorSummary.nativeQuerySucceeded === true
            ? true
            : behaviorSummary.nativeQuerySucceeded === false
              ? false
              : nativeEventCount > 0,
        hfPointsTotal: Number(behaviorSummary.hfPointsTotal ?? 0),
        hfPointsCleaned: Number(behaviorSummary.hfPointsCleaned ?? 0),
        reconstructedEventCount,
        providerError: behaviorSummary.behaviorProviderError === true,
      },
      drivingImpact: {
        available: !!tripImpact,
        avgEngineLoad: trip.avgEngineLoad ?? null,
        avgRpm: trip.avgRpm ?? null,
        avgThrottlePosition: trip.avgThrottlePosition ?? null,
        abuseScore: trip.abuseScore ?? null,
        providerError: false,
      },
      misuse: {
        stageStatus: stages.misuse ?? null,
        misuseCaseCount,
        abuseEventCount: trip.abuseEvents ?? 0,
        possibleImpactCount: Number(behaviorSummary.possibleImpactCount ?? trip.possibleImpactCount ?? 0),
      },
      counters: {
        harshBrakeCount: trip.harshBrakeCount ?? 0,
        hardBrakingEvents: trip.hardBrakingEvents ?? 0,
        brakingEventCount: trip.brakingEventCount ?? 0,
        harshCornerCount: trip.harshCornerCount ?? 0,
        corneringEvents: trip.corneringEvents ?? 0,
        coldEngineAbuseCount: trip.coldEngineAbuseCount ?? 0,
        kickdownCount: trip.kickdownCount ?? 0,
        abuseEvents: trip.abuseEvents ?? 0,
      },
      attribution: {
        assignmentStatus: trip.assignmentStatus,
        assignmentSubjectType: trip.assignmentSubjectType,
        assignmentSubjectId: trip.assignmentSubjectId,
        isPrivateTrip: trip.isPrivateTrip ?? false,
      },
      tripMetrics: {
        distanceKm: trip.distanceKm,
        durationMinutes: trip.durationMinutes,
      },
      clickHouse,
    };
  }
}
