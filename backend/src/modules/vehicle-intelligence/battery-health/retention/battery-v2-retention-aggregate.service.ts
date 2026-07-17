import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryRetentionAggregateBucket,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  utcDayKey,
  type BatteryV2RetentionDaysConfig,
} from './battery-v2-retention.types';

export interface SessionAggregateSummary {
  sessionId: string;
  vehicleId: string;
  organizationId: string;
  scope: BatteryEvidenceScope;
  startedAt: string;
  endedAt: string | null;
  measurementCount: number;
  qualityCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface DailyAggregateSummary {
  day: string;
  vehicleId: string;
  organizationId: string;
  scope: BatteryEvidenceScope;
  measurementCount: number;
  qualityCounts: Record<string, number>;
  typeCounts: Record<string, number>;
}

@Injectable()
export class BatteryV2RetentionAggregateService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSessionAggregates(input: {
    sessionIds: string[];
    dryRun: boolean;
  }): Promise<{ aggregated: number; skipped: number }> {
    if (input.sessionIds.length === 0) return { aggregated: 0, skipped: 0 };

    const sessions = await this.prisma.batteryMeasurementSession.findMany({
      where: { id: { in: input.sessionIds } },
      include: {
        measurements: {
          select: {
            id: true,
            type: true,
            quality: true,
            observedAt: true,
          },
        },
      },
    });

    let aggregated = 0;
    let skipped = 0;

    for (const session of sessions) {
      if (session.measurements.length === 0) {
        skipped += 1;
        continue;
      }

      const existing = await this.prisma.batteryRetentionAggregate.findUnique({
        where: {
          vehicleId_bucketType_bucketKey: {
            vehicleId: session.vehicleId,
            bucketType: BatteryRetentionAggregateBucket.SESSION,
            bucketKey: session.id,
          },
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const summary = this.buildSessionSummary(session);
      if (input.dryRun) {
        aggregated += 1;
        continue;
      }

      await this.prisma.batteryRetentionAggregate.create({
        data: {
          organizationId: session.organizationId,
          vehicleId: session.vehicleId,
          scope: session.scope,
          bucketType: BatteryRetentionAggregateBucket.SESSION,
          bucketKey: session.id,
          bucketStartAt: session.startedAt,
          bucketEndAt: session.endedAt,
          summary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      aggregated += 1;
    }

    return { aggregated, skipped };
  }

  async ensureDailyAggregatesForMeasurements(input: {
    measurementIds: string[];
    dryRun: boolean;
  }): Promise<{ aggregated: number; skipped: number }> {
    if (input.measurementIds.length === 0) return { aggregated: 0, skipped: 0 };

    const measurements = await this.prisma.batteryMeasurement.findMany({
      where: { id: { in: input.measurementIds } },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        scope: true,
        type: true,
        quality: true,
        observedAt: true,
      },
    });

    const byBucket = new Map<string, typeof measurements>();
    for (const row of measurements) {
      const key = `${row.vehicleId}:${row.scope}:${utcDayKey(row.observedAt)}`;
      const bucket = byBucket.get(key) ?? [];
      bucket.push(row);
      byBucket.set(key, bucket);
    }

    let aggregated = 0;
    let skipped = 0;

    for (const [, rows] of byBucket) {
      const first = rows[0]!;
      const day = utcDayKey(first.observedAt);
      const existing = await this.prisma.batteryRetentionAggregate.findUnique({
        where: {
          vehicleId_bucketType_bucketKey: {
            vehicleId: first.vehicleId,
            bucketType: BatteryRetentionAggregateBucket.DAILY,
            bucketKey: `${first.scope}:${day}`,
          },
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const summary = this.buildDailySummary(rows, day);
      const bucketStartAt = new Date(`${day}T00:00:00.000Z`);
      const bucketEndAt = new Date(`${day}T23:59:59.999Z`);

      if (input.dryRun) {
        aggregated += 1;
        continue;
      }

      await this.prisma.batteryRetentionAggregate.create({
        data: {
          organizationId: first.organizationId,
          vehicleId: first.vehicleId,
          scope: first.scope,
          bucketType: BatteryRetentionAggregateBucket.DAILY,
          bucketKey: `${first.scope}:${day}`,
          bucketStartAt,
          bucketEndAt,
          summary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      aggregated += 1;
    }

    return { aggregated, skipped };
  }

  async sessionHasAggregate(sessionId: string, vehicleId: string): Promise<boolean> {
    const row = await this.prisma.batteryRetentionAggregate.findUnique({
      where: {
        vehicleId_bucketType_bucketKey: {
          vehicleId,
          bucketType: BatteryRetentionAggregateBucket.SESSION,
          bucketKey: sessionId,
        },
      },
      select: { id: true },
    });
    return row != null;
  }

  async dailyHasAggregate(
    vehicleId: string,
    scope: BatteryEvidenceScope,
    day: string,
  ): Promise<boolean> {
    const row = await this.prisma.batteryRetentionAggregate.findUnique({
      where: {
        vehicleId_bucketType_bucketKey: {
          vehicleId,
          bucketType: BatteryRetentionAggregateBucket.DAILY,
          bucketKey: `${scope}:${day}`,
        },
      },
      select: { id: true },
    });
    return row != null;
  }

  private buildSessionSummary(
    session: {
      id: string;
      organizationId: string;
      vehicleId: string;
      scope: BatteryEvidenceScope;
      startedAt: Date;
      endedAt: Date | null;
      measurements: Array<{
        type: string;
        quality: BatteryMeasurementQuality;
        observedAt: Date;
      }>;
    },
  ): SessionAggregateSummary {
    const qualityCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    let firstObservedAt: Date | null = null;
    let lastObservedAt: Date | null = null;

    for (const measurement of session.measurements) {
      qualityCounts[measurement.quality] = (qualityCounts[measurement.quality] ?? 0) + 1;
      typeCounts[measurement.type] = (typeCounts[measurement.type] ?? 0) + 1;
      if (!firstObservedAt || measurement.observedAt < firstObservedAt) {
        firstObservedAt = measurement.observedAt;
      }
      if (!lastObservedAt || measurement.observedAt > lastObservedAt) {
        lastObservedAt = measurement.observedAt;
      }
    }

    return {
      sessionId: session.id,
      vehicleId: session.vehicleId,
      organizationId: session.organizationId,
      scope: session.scope,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      measurementCount: session.measurements.length,
      qualityCounts,
      typeCounts,
      firstObservedAt: firstObservedAt?.toISOString() ?? null,
      lastObservedAt: lastObservedAt?.toISOString() ?? null,
    };
  }

  private buildDailySummary(
    rows: Array<{
      organizationId: string;
      vehicleId: string;
      scope: BatteryEvidenceScope;
      type: string;
      quality: BatteryMeasurementQuality;
      observedAt: Date;
    }>,
    day: string,
  ): DailyAggregateSummary {
    const first = rows[0]!;
    const qualityCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const row of rows) {
      qualityCounts[row.quality] = (qualityCounts[row.quality] ?? 0) + 1;
      typeCounts[row.type] = (typeCounts[row.type] ?? 0) + 1;
    }

    return {
      day,
      vehicleId: first.vehicleId,
      organizationId: first.organizationId,
      scope: first.scope,
      measurementCount: rows.length,
      qualityCounts,
      typeCounts,
    };
  }
}
