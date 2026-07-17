import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripDrivingImpact,
  VehicleTrip,
} from '@prisma/client';
import { TripAssignmentResolution, TripAssignmentService } from './trip-assignment.service';
import { TripAttributionService } from './trip-attribution.service';
import type { TripAttribution } from './trip-attribution.types';
import {
  classifyStressLevel,
  type StressLevel,
} from '../driving-impact/stress-level.util';
import {
  buildUnifiedBehaviorEvents,
  type UnifiedBehaviorEvent,
} from './unified-behavior-read-model';
import { buildTripAssessmentFromSignals } from './trip-assessment.builder';
import type { TripAssessment } from './trip-assessment.types';
import { deriveAnalysisAssessability } from './trip-analysis-status';
import { maxEvidenceLevelFromCases } from './trip-evidence-case.builder';
import type { TripEvidenceLevel } from './trip-evidence-level.types';
import {
  readTripDrivingImpactModelProfile,
} from '../driving-impact-model-profile/driving-impact-model-profile.reader';
import type { DrivingImpactModelProfileManifest } from '../driving-impact-model-profile/driving-impact-model-profile.types';
import {
  assertVehicleInOrganization,
  scopedVehicleTripWhere,
} from '../tenant/vehicle-intelligence-tenant.scope';

export interface CanonicalTripEventSummary {
  totalAccelerationEvents: number;
  hardAccelerationEvents: number;
  totalBrakingEvents: number;
  hardBrakingEvents: number;
  fullBrakingEvents: number;
  corneringEvents: number;
  abuseEvents: number;
  speedingEvents: number;
  /** Technical exposure metric — not a compliance/safety score. */
  speedingExposurePct: number | null;
}

export interface CanonicalTripScoreSummary {
  /** Composite vehicle stress 0–100. Higher = more load. */
  drivingStressScore: number | null;
  stressLevel: StressLevel | null;
  scoreSource: 'trip_driving_impact' | 'vehicle_trip_compat' | 'derived';
  /** @deprecated Use drivingStressScore */
  drivingStyleScore?: number | null;
}

export interface CanonicalTripAssignmentSummary extends TripAssignmentResolution {}

export interface CanonicalTripSummary {
  events: CanonicalTripEventSummary;
  scores: CanonicalTripScoreSummary;
  assignment: CanonicalTripAssignmentSummary;
  attribution?: TripAttribution;
  drivingImpactModelProfile?: DrivingImpactModelProfileManifest | null;
}

export interface CanonicalTripStats {
  totalTrips: number;
  totalDistanceKm: number;
  avgDrivingStressScore: number | null;
  stressLevel: StressLevel | null;
  /** @deprecated Mirror of avgDrivingStressScore */
  avgDrivingScore: number | null;
  avgDrivingStyleScore: number | null;
  totalAccelerationEvents: number;
  totalHardAccelerationEvents: number;
  totalBrakingEvents: number;
  totalHardBrakingEvents: number;
  totalAbuseEvents: number;
  totalSpeedingEvents: number;
  privateTripCount: number;
  assignedTripCount: number;
}

type TripProjection = Pick<
  VehicleTrip,
  | 'id'
  | 'vehicleId'
  | 'driverName'
  | 'startTime'
  | 'endTime'
  | 'drivingScore'
  | 'speedingSectionCount'
  | 'speedingSegments'
  | 'speedingExposurePct'
  | 'maxOverSpeedKmh'
  | 'avgOverSpeedKmh'
  | 'accelerationEventCount'
  | 'hardAccelerationCount'
  | 'brakingEventCount'
  | 'hardBrakingCount'
  | 'fullBrakingCount'
  | 'harshCornerCount'
  | 'abuseEventCount'
  | 'totalAccelerationEvents'
  | 'hardAccelerationEvents'
  | 'totalBrakingEvents'
  | 'hardBrakingEvents'
  | 'fullBrakingEvents'
  | 'corneringEvents'
  | 'abuseEvents'
  | 'speedingEvents'
  | 'assignmentStatus'
  | 'assignmentSubjectType'
  | 'assignmentSubjectId'
  | 'assignedBookingId'
  | 'bookingLinkSource'
  | 'bookingCustomerId'
  | 'assignedDriverId'
  | 'actualDriverId'
  | 'isPrivateTrip'
  | 'distanceKm'
  | 'durationMinutes'
  | 'behaviorSummaryJson'
  | 'behaviorEnrichmentStatus'
  | 'tripAnalysisStatus'
  | 'qualityStatus'
>;

@Injectable()
export class TripAnalyticsCanonicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripAssignmentService: TripAssignmentService,
    private readonly tripAttributionService: TripAttributionService,
  ) {}

  async hydrateTrips<T extends TripProjection>(
    organizationId: string,
    trips: T[],
  ): Promise<Array<T & { canonicalTripSummary: CanonicalTripSummary }>> {
    const impactMap = await this.loadImpactMap(trips.map((trip) => trip.id));
    const resolved: Array<T & { canonicalTripSummary: CanonicalTripSummary }> = [];
    for (const trip of trips) {
      const assignment = await this.tripAssignmentService.resolveForTrip(trip);
      const attribution = await this.tripAttributionService.resolveAttributionForTrip(
        organizationId,
        {
          isPrivateTrip: assignment.isPrivateTrip,
          assignmentStatus: assignment.assignmentStatus,
          assignedBookingId: assignment.assignedBookingId,
          assignmentSubjectId: assignment.assignmentSubjectId,
          assignmentSubjectType: assignment.assignmentSubjectType,
          bookingLinkSource: assignment.bookingLinkSource,
          bookingCustomerId: assignment.bookingCustomerId,
          assignedDriverId: assignment.assignedDriverId,
          actualDriverId: assignment.actualDriverId,
          vehicleId: trip.vehicleId,
          startTime: trip.startTime,
          endTime: trip.endTime,
        },
      );
      resolved.push({
        ...trip,
        canonicalTripSummary: this.buildSummary(trip, impactMap.get(trip.id) ?? null, assignment, attribution),
      });
    }
    return resolved;
  }

  async hydrateTrip<T extends TripProjection>(
    organizationId: string,
    trip: T,
  ): Promise<T & { canonicalTripSummary: CanonicalTripSummary }> {
    const impact = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId: trip.id },
      select: { drivingStressScore: true, sourceSummaryJson: true },
    });
    const assignment = await this.tripAssignmentService.resolveForTrip(trip);
    const attribution = await this.tripAttributionService.resolveAttributionForTrip(
      organizationId,
      {
        isPrivateTrip: assignment.isPrivateTrip,
        assignmentStatus: assignment.assignmentStatus,
        assignedBookingId: assignment.assignedBookingId,
        assignmentSubjectId: assignment.assignmentSubjectId,
        assignmentSubjectType: assignment.assignmentSubjectType,
        bookingLinkSource: assignment.bookingLinkSource,
        bookingCustomerId: assignment.bookingCustomerId,
        assignedDriverId: assignment.assignedDriverId,
        actualDriverId: assignment.actualDriverId,
        vehicleId: trip.vehicleId,
        startTime: trip.startTime,
        endTime: trip.endTime,
      },
    );
    return {
      ...trip,
      canonicalTripSummary: this.buildSummary(trip, impact, assignment, attribution),
    };
  }

  async buildTripAssessmentForTrip(
    organizationId: string,
    trip: TripProjection & {
      distanceKm?: number | null;
      durationMinutes?: number | null;
      behaviorSummaryJson?: unknown;
      behaviorEnrichmentStatus?: string | null;
      tripAnalysisStatus?: string | null;
      endTime?: Date | string | null;
      qualityStatus?: string | null;
    },
    canonicalSummary: CanonicalTripSummary,
  ): Promise<TripAssessment> {
    const [behaviorEvents, drivingEvents, misuseCases] = await Promise.all([
      this.prisma.tripBehaviorEvent.findMany({
        where: { tripId: trip.id, vehicleId: trip.vehicleId, vehicle: { organizationId } },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.drivingEvent.findMany({
        where: { tripId: trip.id, vehicleId: trip.vehicleId, vehicle: { organizationId } },
        orderBy: { recordedAt: 'asc' },
      }),
      this.prisma.misuseCase.findMany({
        where: { tripId: trip.id, vehicleId: trip.vehicleId, organizationId },
        select: { evidenceSummary: true },
      }),
    ]);

    const misuseCaseCount = misuseCases.length;
    const evidenceLevels = misuseCases
      .map((row) => {
        const summary = row.evidenceSummary as Record<string, unknown> | null;
        const evidenceCase = summary?.evidenceCase as { evidenceLevel?: TripEvidenceLevel } | undefined;
        return evidenceCase?.evidenceLevel;
      })
      .filter((level): level is TripEvidenceLevel => Boolean(level));
    const maxEvidenceLevel =
      evidenceLevels.length > 0 ? maxEvidenceLevelFromCases(evidenceLevels) : null;

    const unifiedEvents: UnifiedBehaviorEvent[] = buildUnifiedBehaviorEvents({
      behaviorEvents,
      drivingEvents,
      tripId: trip.id,
    });

    const assessability = deriveAnalysisAssessability(trip);

    return buildTripAssessmentFromSignals({
      unifiedEvents,
      scores: canonicalSummary.scores,
      misuseCaseCount,
      maxEvidenceLevel,
      distanceKm: trip.distanceKm ?? null,
      durationMinutes: trip.durationMinutes ?? null,
      assessability,
    });
  }

  async getVehicleStats(organizationId: string, vehicleId: string): Promise<CanonicalTripStats> {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);
    const where = scopedVehicleTripWhere(organizationId, vehicleId);
    const impactWhere = { vehicleId, vehicle: { organizationId } };

    const [tripSummary, impactAvg] = await Promise.all([
      this.prisma.vehicleTrip.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          distanceKm: true,
          totalAccelerationEvents: true,
          hardAccelerationEvents: true,
          totalBrakingEvents: true,
          hardBrakingEvents: true,
          abuseEvents: true,
          speedingEvents: true,
        },
      }),
      this.prisma.tripDrivingImpact.aggregate({
        where: impactWhere,
        _avg: { drivingStressScore: true },
      }),
    ]);

    const [privateTripCount, assignedTripCount] = await Promise.all([
      this.prisma.vehicleTrip.count({
        where: { ...where, isPrivateTrip: true },
      }),
      this.prisma.vehicleTrip.count({
        where: {
          ...where,
          isPrivateTrip: false,
          assignmentStatus: {
            in: [
              TripAssignmentStatus.ASSIGNED_DRIVER,
              TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
            ],
          },
        },
      }),
    ]);

    const stressAvg = impactAvg._avg.drivingStressScore;
    const avgDrivingStressScore = stressAvg != null ? this.round2(stressAvg) : null;
    return {
      totalTrips: tripSummary._count._all ?? 0,
      totalDistanceKm: this.round2(tripSummary._sum.distanceKm ?? 0),
      avgDrivingStressScore,
      stressLevel: classifyStressLevel(avgDrivingStressScore),
      avgDrivingScore: avgDrivingStressScore,
      avgDrivingStyleScore: avgDrivingStressScore,
      totalAccelerationEvents: tripSummary._sum.totalAccelerationEvents ?? 0,
      totalHardAccelerationEvents: tripSummary._sum.hardAccelerationEvents ?? 0,
      totalBrakingEvents: tripSummary._sum.totalBrakingEvents ?? 0,
      totalHardBrakingEvents: tripSummary._sum.hardBrakingEvents ?? 0,
      totalAbuseEvents: tripSummary._sum.abuseEvents ?? 0,
      totalSpeedingEvents: tripSummary._sum.speedingEvents ?? 0,
      privateTripCount,
      assignedTripCount,
    };
  }

  private buildSummary(
    trip: TripProjection,
    impact: Pick<TripDrivingImpact, 'drivingStressScore' | 'sourceSummaryJson'> | null,
    assignment: TripAssignmentResolution,
    attribution?: TripAttribution,
  ): CanonicalTripSummary {
    const events: CanonicalTripEventSummary = {
      totalAccelerationEvents: trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? 0,
      hardAccelerationEvents: trip.hardAccelerationEvents ?? trip.hardAccelerationCount ?? 0,
      totalBrakingEvents: trip.totalBrakingEvents ?? trip.brakingEventCount ?? 0,
      hardBrakingEvents: trip.hardBrakingEvents ?? trip.hardBrakingCount ?? 0,
      fullBrakingEvents: trip.fullBrakingEvents ?? trip.fullBrakingCount ?? 0,
      corneringEvents: trip.corneringEvents ?? trip.harshCornerCount ?? 0,
      abuseEvents: trip.abuseEvents ?? trip.abuseEventCount ?? 0,
      speedingEvents: trip.speedingEvents ?? trip.speedingSectionCount ?? trip.speedingSegments ?? 0,
      speedingExposurePct: trip.speedingExposurePct ?? null,
    };

    const impactHasStress = impact?.drivingStressScore != null;
    const drivingStressScore = impactHasStress
      ? impact!.drivingStressScore
      : (trip.drivingScore ?? null);
    const scoreSource: CanonicalTripScoreSummary['scoreSource'] =
      impactHasStress ? 'trip_driving_impact' : drivingStressScore != null ? 'vehicle_trip_compat' : 'derived';

    const drivingImpactModelProfile = impact?.sourceSummaryJson
      ? readTripDrivingImpactModelProfile(impact.sourceSummaryJson)
      : null;

    return {
      events,
      scores: {
        drivingStressScore,
        stressLevel: classifyStressLevel(drivingStressScore),
        scoreSource,
        drivingStyleScore: drivingStressScore,
      },
      assignment,
      attribution,
      drivingImpactModelProfile,
    };
  }

  private async loadImpactMap(
    tripIds: string[],
  ): Promise<Map<string, Pick<TripDrivingImpact, 'drivingStressScore' | 'sourceSummaryJson'>>> {
    if (tripIds.length === 0) return new Map();
    const rows = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, drivingStressScore: true, sourceSummaryJson: true },
    });
    const map = new Map<string, Pick<TripDrivingImpact, 'drivingStressScore' | 'sourceSummaryJson'>>();
    for (const row of rows) {
      map.set(row.tripId, {
        drivingStressScore: row.drivingStressScore,
        sourceSummaryJson: row.sourceSummaryJson,
      });
    }
    return map;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
