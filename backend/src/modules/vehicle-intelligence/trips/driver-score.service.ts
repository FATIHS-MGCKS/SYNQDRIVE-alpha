import { Injectable } from '@nestjs/common';
import { Prisma, TripAssignmentSubjectType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * Distance-weighted score row. The unified aggregation helper consumes these
 * rows once for both the per-subject and the booking aggregation paths.
 *
 * V4.6.95 — replaces the previous unweighted-arithmetic-mean implementation
 * that diverged from the rolling-vehicle aggregation in DrivingImpactService.
 * The whole platform now uses one numeric definition of subject/booking
 * Driving Style and Safety scores: distance-weighted average over scored
 * trips, ignoring null values per metric independently.
 */
export interface AggregationRow {
  drivingStyleScore: number | null;
  safetyScore: number | null;
  distanceKm: number;
}

export type DataConfidence = 'none' | 'low' | 'medium' | 'high';

export interface DriverScoreSummary {
  subjectType: TripAssignmentSubjectType;
  subjectId: string;
  /** Total eligible trips (completed, non-private, assigned to this subject). */
  tripCount: number;
  /** Trips with a non-null drivingStyleScore. Drives `hasEnoughData`. */
  scoredTripCount: number;
  /** Trips with a non-null safetyScore (route/speed-limit data was present). */
  safetyScoredTripCount: number;
  /** Sum of distanceKm across eligible trips. Drives `hasEnoughData`. */
  totalDistanceKm: number;
  drivingStyleScore: number | null;
  safetyScore: number | null;
  /** Share of eligible trips that produced a TripDrivingImpact row. */
  assignmentCoveragePct: number;
  /**
   * `true` when the aggregate is statistically meaningful enough to render
   * with full UI affordance. Default rule: `scoredTripCount >= 3` AND
   * `totalDistanceKm >= 50`. Booking analyses surface this honestly even when
   * confidence is low.
   */
  hasEnoughData: boolean;
  dataConfidence: DataConfidence;
}

const MIN_SCORED_TRIPS = 3;
const MIN_DISTANCE_KM = 50;

@Injectable()
export class DriverScoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async getScoreSummary(
    subjectType: TripAssignmentSubjectType,
    subjectId: string,
    options: { from?: Date; to?: Date; vehicleId?: string } = {},
  ): Promise<DriverScoreSummary> {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: this.buildTripWhere(subjectType, [subjectId], options),
      select: { id: true, distanceKm: true },
      orderBy: { startTime: 'desc' },
    });

    const scoreMap = await this.getImpactMap(trips.map((t) => t.id));
    const rows: AggregationRow[] = trips.map((trip) => {
      const impact = scoreMap.get(trip.id);
      return {
        drivingStyleScore: impact?.drivingStyleScore ?? null,
        safetyScore: impact?.safetyScore ?? null,
        // Prefer the impact row's snapshot (locks in distance at scoring
        // time); fall back to the live trip distance for legacy trips
        // where the impact row hasn't been written yet.
        distanceKm: impact?.distanceKm ?? trip.distanceKm ?? 0,
      };
    });

    return this.aggregate(subjectType, subjectId, rows);
  }

  async getScoresForSubjects(
    subjectType: TripAssignmentSubjectType,
    subjectIds: string[],
    options: { from?: Date; to?: Date; vehicleId?: string } = {},
  ): Promise<Map<string, DriverScoreSummary>> {
    const normalizedIds = Array.from(
      new Set(subjectIds.filter((v) => v.trim().length > 0)),
    );
    const output = new Map<string, DriverScoreSummary>();
    if (normalizedIds.length === 0) return output;

    const trips = await this.prisma.vehicleTrip.findMany({
      where: this.buildTripWhere(subjectType, normalizedIds, options),
      select: {
        id: true,
        assignmentSubjectId: true,
        distanceKm: true,
      },
      orderBy: { startTime: 'desc' },
    });

    const scoreMap = await this.getImpactMap(trips.map((t) => t.id));
    const grouped = new Map<string, AggregationRow[]>();
    for (const trip of trips) {
      const key = trip.assignmentSubjectId ?? '';
      if (!key) continue;
      const impact = scoreMap.get(trip.id);
      const row: AggregationRow = {
        drivingStyleScore: impact?.drivingStyleScore ?? null,
        safetyScore: impact?.safetyScore ?? null,
        distanceKm: impact?.distanceKm ?? trip.distanceKm ?? 0,
      };
      const arr = grouped.get(key) ?? [];
      arr.push(row);
      grouped.set(key, arr);
    }

    for (const subjectId of normalizedIds) {
      output.set(
        subjectId,
        this.aggregate(subjectType, subjectId, grouped.get(subjectId) ?? []),
      );
    }
    return output;
  }

  /**
   * Reusable aggregation entry point shared with `RentalDrivingAnalysisService`
   * so booking-level Driving Style + Safety follows the same rules as driver
   * and customer aggregates. Callers pass the rows they already loaded; no
   * Prisma queries happen here — this prevents accidental circular deps.
   */
  aggregateRows(
    subjectType: TripAssignmentSubjectType,
    subjectId: string,
    rows: AggregationRow[],
  ): DriverScoreSummary {
    return this.aggregate(subjectType, subjectId, rows);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private aggregate(
    subjectType: TripAssignmentSubjectType,
    subjectId: string,
    rows: AggregationRow[],
  ): DriverScoreSummary {
    const tripCount = rows.length;
    const totalDistanceKm = this.round2(
      rows.reduce((sum, r) => sum + (r.distanceKm > 0 ? r.distanceKm : 0), 0),
    );
    const scoredTripCount = rows.filter((r) => r.drivingStyleScore != null).length;
    const safetyScoredTripCount = rows.filter((r) => r.safetyScore != null).length;

    const drivingStyleScore = this.weightedAvg(
      rows
        .filter((r) => r.drivingStyleScore != null)
        .map((r) => ({ value: r.drivingStyleScore as number, weight: r.distanceKm })),
    );
    const safetyScore = this.weightedAvg(
      rows
        .filter((r) => r.safetyScore != null)
        .map((r) => ({ value: r.safetyScore as number, weight: r.distanceKm })),
    );

    const hasEnoughData =
      scoredTripCount >= MIN_SCORED_TRIPS && totalDistanceKm >= MIN_DISTANCE_KM;
    const dataConfidence = this.computeConfidence(scoredTripCount, totalDistanceKm);

    return {
      subjectType,
      subjectId,
      tripCount,
      scoredTripCount,
      safetyScoredTripCount,
      totalDistanceKm,
      drivingStyleScore,
      safetyScore,
      assignmentCoveragePct:
        tripCount > 0 ? this.round2((scoredTripCount / tripCount) * 100) : 0,
      hasEnoughData,
      dataConfidence,
    };
  }

  private weightedAvg(samples: { value: number; weight: number }[]): number | null {
    if (samples.length === 0) return null;
    // If all weights are zero/missing (e.g. legacy rows without distance),
    // gracefully degrade to an unweighted mean rather than dividing by zero.
    const totalWeight = samples.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
    if (totalWeight <= 0) {
      const unweighted =
        samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
      return this.round2(unweighted);
    }
    const weighted =
      samples.reduce((sum, s) => sum + s.value * Math.max(0, s.weight), 0) /
      totalWeight;
    return this.round2(weighted);
  }

  private computeConfidence(
    scoredTripCount: number,
    totalDistanceKm: number,
  ): DataConfidence {
    if (scoredTripCount === 0 || totalDistanceKm <= 0) return 'none';
    if (scoredTripCount >= 10 && totalDistanceKm >= 250) return 'high';
    if (scoredTripCount >= MIN_SCORED_TRIPS && totalDistanceKm >= MIN_DISTANCE_KM) {
      return 'medium';
    }
    return 'low';
  }

  private buildTripWhere(
    subjectType: TripAssignmentSubjectType,
    subjectIds: string[],
    options: { from?: Date; to?: Date; vehicleId?: string },
  ): Prisma.VehicleTripWhereInput {
    const where: Prisma.VehicleTripWhereInput = {
      tripStatus: TripStatus.COMPLETED,
      isPrivateTrip: false,
      assignmentSubjectType: subjectType,
      assignmentSubjectId: { in: subjectIds },
      endTime: { not: null },
    };

    if (options.vehicleId) where.vehicleId = options.vehicleId;
    if (options.from || options.to) {
      where.startTime = {};
      if (options.from) where.startTime.gte = options.from;
      if (options.to) where.startTime.lte = options.to;
    }
    return where;
  }

  private async getImpactMap(
    tripIds: string[],
  ): Promise<
    Map<
      string,
      { drivingStyleScore: number | null; safetyScore: number | null; distanceKm: number }
    >
  > {
    if (tripIds.length === 0) return new Map();
    const rows = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: tripIds } },
      select: {
        tripId: true,
        drivingStyleScore: true,
        safetyScore: true,
        distanceKm: true,
      },
    });
    const out = new Map<
      string,
      { drivingStyleScore: number | null; safetyScore: number | null; distanceKm: number }
    >();
    for (const row of rows) {
      out.set(row.tripId, {
        drivingStyleScore: row.drivingStyleScore,
        safetyScore: row.safetyScore,
        distanceKm: row.distanceKm ?? 0,
      });
    }
    return out;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
