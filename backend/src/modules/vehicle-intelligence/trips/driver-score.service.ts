import { Injectable } from '@nestjs/common';
import { Prisma, TripAssignmentSubjectType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface DriverScoreSummary {
  subjectType: TripAssignmentSubjectType;
  subjectId: string;
  tripCount: number;
  scoredTripCount: number;
  drivingStyleScore: number | null;
  safetyScore: number | null;
  assignmentCoveragePct: number;
}

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
      select: { id: true },
      orderBy: { startTime: 'desc' },
    });

    const scoreMap = await this.getImpactMap(trips.map((t) => t.id));
    const scored = trips
      .map((t) => scoreMap.get(t.id))
      .filter((impact): impact is { drivingStyleScore: number | null; safetyScore: number | null } => !!impact);

    const styleValues = scored
      .map((row) => row.drivingStyleScore)
      .filter((value): value is number => value != null);
    const safetyValues = scored
      .map((row) => row.safetyScore)
      .filter((value): value is number => value != null);

    const tripCount = trips.length;
    const scoredTripCount = scored.length;
    return {
      subjectType,
      subjectId,
      tripCount,
      scoredTripCount,
      drivingStyleScore: styleValues.length > 0 ? this.round2(this.avg(styleValues)) : null,
      safetyScore: safetyValues.length > 0 ? this.round2(this.avg(safetyValues)) : null,
      assignmentCoveragePct: tripCount > 0 ? this.round2((scoredTripCount / tripCount) * 100) : 0,
    };
  }

  async getScoresForSubjects(
    subjectType: TripAssignmentSubjectType,
    subjectIds: string[],
    options: { from?: Date; to?: Date; vehicleId?: string } = {},
  ): Promise<Map<string, DriverScoreSummary>> {
    const normalizedIds = Array.from(new Set(subjectIds.filter((v) => v.trim().length > 0)));
    const output = new Map<string, DriverScoreSummary>();
    if (normalizedIds.length === 0) return output;

    const trips = await this.prisma.vehicleTrip.findMany({
      where: this.buildTripWhere(subjectType, normalizedIds, options),
      select: { id: true, assignmentSubjectId: true },
      orderBy: { startTime: 'desc' },
    });

    const scoreMap = await this.getImpactMap(trips.map((t) => t.id));
    const grouped = new Map<string, Array<{ drivingStyleScore: number | null; safetyScore: number | null }>>();
    for (const trip of trips) {
      const key = trip.assignmentSubjectId ?? '';
      if (!key) continue;
      const impact = scoreMap.get(trip.id) ?? { drivingStyleScore: null, safetyScore: null };
      const arr = grouped.get(key) ?? [];
      arr.push(impact);
      grouped.set(key, arr);
    }

    for (const subjectId of normalizedIds) {
      const impacts = grouped.get(subjectId) ?? [];
      const styleValues = impacts
        .map((row) => row.drivingStyleScore)
        .filter((value): value is number => value != null);
      const safetyValues = impacts
        .map((row) => row.safetyScore)
        .filter((value): value is number => value != null);
      output.set(subjectId, {
        subjectType,
        subjectId,
        tripCount: impacts.length,
        scoredTripCount: impacts.length,
        drivingStyleScore: styleValues.length > 0 ? this.round2(this.avg(styleValues)) : null,
        safetyScore: safetyValues.length > 0 ? this.round2(this.avg(safetyValues)) : null,
        assignmentCoveragePct: impacts.length > 0 ? 100 : 0,
      });
    }

    return output;
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
  ): Promise<Map<string, { drivingStyleScore: number | null; safetyScore: number | null }>> {
    if (tripIds.length === 0) return new Map();
    const rows = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, drivingStyleScore: true, safetyScore: true },
    });
    const out = new Map<string, { drivingStyleScore: number | null; safetyScore: number | null }>();
    for (const row of rows) {
      out.set(row.tripId, {
        drivingStyleScore: row.drivingStyleScore,
        safetyScore: row.safetyScore,
      });
    }
    return out;
  }

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, current) => sum + current, 0) / values.length;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

