import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripDrivingImpact,
  VehicleTrip,
} from '@prisma/client';
import { TripAssignmentResolution, TripAssignmentService } from './trip-assignment.service';

export interface CanonicalTripEventSummary {
  totalAccelerationEvents: number;
  hardAccelerationEvents: number;
  totalBrakingEvents: number;
  hardBrakingEvents: number;
  fullBrakingEvents: number;
  corneringEvents: number;
  abuseEvents: number;
  speedingEvents: number;
  speedingExposurePct: number | null;
}

export interface CanonicalTripScoreSummary {
  drivingStyleScore: number | null;
  safetyScore: number | null;
  scoreSource: 'trip_driving_impact' | 'vehicle_trip_compat' | 'derived';
}

export interface CanonicalTripAssignmentSummary extends TripAssignmentResolution {}

export interface CanonicalTripSummary {
  events: CanonicalTripEventSummary;
  scores: CanonicalTripScoreSummary;
  assignment: CanonicalTripAssignmentSummary;
}

export interface CanonicalTripStats {
  totalTrips: number;
  totalDistanceKm: number;
  avgDrivingScore: number;
  avgDrivingStyleScore: number;
  avgSafetyScore: number;
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
  | 'isPrivateTrip'
>;

@Injectable()
export class TripAnalyticsCanonicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripAssignmentService: TripAssignmentService,
  ) {}

  async hydrateTrips<T extends TripProjection>(trips: T[]): Promise<Array<T & { canonicalTripSummary: CanonicalTripSummary }>> {
    const impactMap = await this.loadImpactMap(trips.map((trip) => trip.id));
    const resolved: Array<T & { canonicalTripSummary: CanonicalTripSummary }> = [];
    for (const trip of trips) {
      const assignment = await this.tripAssignmentService.resolveForTrip(trip);
      resolved.push({
        ...trip,
        canonicalTripSummary: this.buildSummary(trip, impactMap.get(trip.id) ?? null, assignment),
      });
    }
    return resolved;
  }

  async hydrateTrip<T extends TripProjection>(trip: T): Promise<T & { canonicalTripSummary: CanonicalTripSummary }> {
    const impact = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId: trip.id },
      select: { drivingStyleScore: true, safetyScore: true },
    });
    const assignment = await this.tripAssignmentService.resolveForTrip(trip);
    return {
      ...trip,
      canonicalTripSummary: this.buildSummary(trip, impact, assignment),
    };
  }

  async getVehicleStats(vehicleId: string): Promise<CanonicalTripStats> {
    const [tripSummary, impactAvg] = await Promise.all([
      this.prisma.vehicleTrip.aggregate({
        where: { vehicleId },
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
        where: { vehicleId },
        _avg: { drivingStyleScore: true, safetyScore: true },
      }),
    ]);

    const [privateTripCount, assignedTripCount] = await Promise.all([
      this.prisma.vehicleTrip.count({
        where: { vehicleId, isPrivateTrip: true },
      }),
      this.prisma.vehicleTrip.count({
        where: {
          vehicleId,
          isPrivateTrip: false,
          assignmentStatus: {
            in: [
              TripAssignmentStatus.ASSIGNED_DRIVER,
              TripAssignmentStatus.ASSIGNED_USER,
              TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
            ],
          },
        },
      }),
    ]);

    const avgDrivingStyleScore = this.round2(impactAvg._avg.drivingStyleScore ?? 0);
    const avgSafetyScore = this.round2(impactAvg._avg.safetyScore ?? 0);
    return {
      totalTrips: tripSummary._count._all ?? 0,
      totalDistanceKm: this.round2(tripSummary._sum.distanceKm ?? 0),
      avgDrivingScore: avgDrivingStyleScore,
      avgDrivingStyleScore,
      avgSafetyScore,
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
    impact: Pick<TripDrivingImpact, 'drivingStyleScore' | 'safetyScore'> | null,
    assignment: TripAssignmentResolution,
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

    const impactHasStyle = impact?.drivingStyleScore != null;
    const drivingStyleScore = impactHasStyle
      ? impact!.drivingStyleScore
      : (trip.drivingScore ?? null);
    const safetyScore =
      impact?.safetyScore ??
      this.deriveSafetyScoreFromTrip({
        speedingExposurePct: trip.speedingExposurePct ?? null,
        maxOverSpeedKmh: trip.maxOverSpeedKmh ?? null,
        avgOverSpeedKmh: trip.avgOverSpeedKmh ?? null,
        speedingSectionCount: trip.speedingSectionCount ?? null,
      });
    const scoreSource: CanonicalTripScoreSummary['scoreSource'] =
      impactHasStyle ? 'trip_driving_impact' : drivingStyleScore != null ? 'vehicle_trip_compat' : 'derived';

    return {
      events,
      scores: {
        drivingStyleScore,
        safetyScore,
        scoreSource,
      },
      assignment,
    };
  }

  private async loadImpactMap(
    tripIds: string[],
  ): Promise<Map<string, Pick<TripDrivingImpact, 'drivingStyleScore' | 'safetyScore'>>> {
    if (tripIds.length === 0) return new Map();
    const rows = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, drivingStyleScore: true, safetyScore: true },
    });
    const map = new Map<string, Pick<TripDrivingImpact, 'drivingStyleScore' | 'safetyScore'>>();
    for (const row of rows) {
      map.set(row.tripId, {
        drivingStyleScore: row.drivingStyleScore,
        safetyScore: row.safetyScore,
      });
    }
    return map;
  }

  private deriveSafetyScoreFromTrip(input: {
    speedingExposurePct: number | null;
    maxOverSpeedKmh: number | null;
    avgOverSpeedKmh: number | null;
    speedingSectionCount: number | null;
  }): number {
    const exposure = input.speedingExposurePct ?? 0;
    const maxOver = input.maxOverSpeedKmh ?? 0;
    const avgOver = input.avgOverSpeedKmh ?? 0;
    const sectionCount = input.speedingSectionCount ?? 0;
    const exposurePenalty = Math.min(50, exposure * 0.9);
    const severityPenalty = Math.min(25, maxOver * 0.8);
    const avgOverPenalty = Math.min(15, avgOver * 0.7);
    const sectionPenalty = Math.min(10, sectionCount * 1.5);
    const score = Math.max(0, Math.min(100, 100 - exposurePenalty - severityPenalty - avgOverPenalty - sectionPenalty));
    return this.round2(score);
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

