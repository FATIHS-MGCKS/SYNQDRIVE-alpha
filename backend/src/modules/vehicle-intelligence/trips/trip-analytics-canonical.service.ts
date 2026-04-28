import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripDrivingImpact,
  VehicleTrip,
} from '@prisma/client';
import { TripAssignmentResolution, TripAssignmentService } from './trip-assignment.service';
import {
  computeSafetyScore,
  hasSpeedingDataFromTrip,
  safetyDataConfidenceFromTrip,
} from '../driving-impact/driving-impact-scorer';

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
  /** True when the trip carries enriched speed-limit / route data. */
  hasSpeedingData: boolean;
  /** Per-trip safety-data confidence; subject aggregates have their own. */
  safetyDataConfidence: 'none' | 'low' | 'medium' | 'high';
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
  // V4.6.95 — nullable averages preserve "no data" semantics. Frontend
  // renders "—" / "Not enough data"; old `?? 0` callers were lying.
  avgDrivingScore: number | null;
  avgDrivingStyleScore: number | null;
  avgSafetyScore: number | null;
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
          // V4.6.95 — `ASSIGNED_USER` was removed alongside the unused
          // user-score feature. Canonical assignment statuses are
          // ASSIGNED_DRIVER and ASSIGNED_BOOKING_CUSTOMER.
          assignmentStatus: {
            in: [
              TripAssignmentStatus.ASSIGNED_DRIVER,
              TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
            ],
          },
        },
      }),
    ]);

    // V4.6.95 — preserve null when no impact rows exist for this vehicle.
    const styleAvg = impactAvg._avg.drivingStyleScore;
    const safetyAvg = impactAvg._avg.safetyScore;
    const avgDrivingStyleScore = styleAvg != null ? this.round2(styleAvg) : null;
    const avgSafetyScore = safetyAvg != null ? this.round2(safetyAvg) : null;
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
    // Safety score always goes through the canonical `computeSafetyScore` path
    // (shared with DrivingImpactService). This avoids two different numeric
    // definitions of "safety score" living in parallel. For trips without a
    // persisted TripDrivingImpact row we derive the score directly from the
    // canonical speeding inputs on VehicleTrip — never from a second formula.
    // V4.6.95 — `deriveSafetyScoreFromTrip` returns null when speed-data is
    // missing, so the chain below correctly yields null for un-enriched trips.
    const safetyScore =
      impact?.safetyScore ?? this.deriveSafetyScoreFromTrip(trip);
    const scoreSource: CanonicalTripScoreSummary['scoreSource'] =
      impactHasStyle ? 'trip_driving_impact' : drivingStyleScore != null ? 'vehicle_trip_compat' : 'derived';
    const hasSpeedingData = hasSpeedingDataFromTrip(trip);
    const safetyDataConfidence = safetyDataConfidenceFromTrip(trip);

    return {
      events,
      scores: {
        drivingStyleScore,
        safetyScore,
        scoreSource,
        hasSpeedingData,
        safetyDataConfidence,
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

  /**
   * Derive a Safety Score when no TripDrivingImpact row exists yet (legacy trip
   * or a trip below the impact minimum-distance threshold).
   *
   * V4.6.95 — Returns `null` when the underlying speed-limit / route-analysis
   * fields are genuinely missing on the VehicleTrip row. Coercing those nulls
   * to 0 (as the previous implementation did) produced safetyScore = 100,
   * incorrectly painting un-enriched trips as "perfectly safe". The pure
   * `computeSafetyScore` function is only called when speed-data is real.
   */
  private deriveSafetyScoreFromTrip(trip: TripProjection): number | null {
    if (!hasSpeedingDataFromTrip(trip)) {
      return null;
    }
    return computeSafetyScore({
      speedingExposurePct: trip.speedingExposurePct ?? 0,
      maxOverSpeedKmh: trip.maxOverSpeedKmh ?? 0,
      avgOverSpeedKmh: trip.avgOverSpeedKmh ?? 0,
      speedingSectionCount: trip.speedingSectionCount ?? 0,
    });
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

