import { Injectable } from '@nestjs/common';
import { Prisma, TripAssignmentSubjectType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { classifyStressLevel } from '../driving-impact/stress-level.util';
import type { StressLevel } from '../driving-impact/stress-level.util';

/**
 * Distance-weighted vehicle stress row for subject/booking aggregation.
 * Higher `drivingStressScore` = higher vehicle load (not driver quality).
 */
export interface AggregationRow {
  drivingStressScore: number | null;
  distanceKm: number;
}

export type DataConfidence = 'none' | 'low' | 'medium' | 'high';

export interface DriverScoreSummary {
  subjectType: TripAssignmentSubjectType;
  subjectId: string;
  tripCount: number;
  /** Trips with a non-null drivingStressScore. */
  scoredTripCount: number;
  totalDistanceKm: number;
  drivingStressScore: number | null;
  stressLevel: StressLevel | null;
  assignmentCoveragePct: number;
  hasEnoughData: boolean;
  dataConfidence: DataConfidence;
}

const MIN_SCORED_TRIPS = 3;
const MIN_DISTANCE_KM = 50;

@Injectable()
export class DriverScoreService {
  constructor(private readonly prisma: PrismaService) {}

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
        drivingStressScore: impact?.drivingStressScore ?? null,
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
        drivingStressScore: impact?.drivingStressScore ?? null,
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

  aggregateRows(
    subjectType: TripAssignmentSubjectType,
    subjectId: string,
    rows: AggregationRow[],
  ): DriverScoreSummary {
    return this.aggregate(subjectType, subjectId, rows);
  }

  private aggregate(
    subjectType: TripAssignmentSubjectType,
    subjectId: string,
    rows: AggregationRow[],
  ): DriverScoreSummary {
    const tripCount = rows.length;
    const totalDistanceKm = this.round2(
      rows.reduce((sum, r) => sum + (r.distanceKm > 0 ? r.distanceKm : 0), 0),
    );
    const scoredTripCount = rows.filter((r) => r.drivingStressScore != null).length;

    const drivingStressScore = this.weightedAvg(
      rows
        .filter((r) => r.drivingStressScore != null)
        .map((r) => ({ value: r.drivingStressScore as number, weight: r.distanceKm })),
    );

    const hasEnoughData =
      scoredTripCount >= MIN_SCORED_TRIPS && totalDistanceKm >= MIN_DISTANCE_KM;
    const dataConfidence = this.computeConfidence(scoredTripCount, totalDistanceKm);

    return {
      subjectType,
      subjectId,
      tripCount,
      scoredTripCount,
      totalDistanceKm,
      drivingStressScore,
      stressLevel: classifyStressLevel(drivingStressScore),
      assignmentCoveragePct:
        tripCount > 0 ? this.round2((scoredTripCount / tripCount) * 100) : 0,
      hasEnoughData,
      dataConfidence,
    };
  }

  private weightedAvg(samples: { value: number; weight: number }[]): number | null {
    if (samples.length === 0) return null;
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
    Map<string, { drivingStressScore: number | null; distanceKm: number }>
  > {
    if (tripIds.length === 0) return new Map();
    const rows = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: tripIds } },
      select: {
        tripId: true,
        drivingStressScore: true,
        distanceKm: true,
      },
    });
    const out = new Map<
      string,
      { drivingStressScore: number | null; distanceKm: number }
    >();
    for (const row of rows) {
      out.set(row.tripId, {
        drivingStressScore: row.drivingStressScore,
        distanceKm: row.distanceKm ?? 0,
      });
    }
    return out;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
