import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingEventType } from '@prisma/client';

@Injectable()
export class DrivingEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(vehicleId: string, options?: { from?: Date; to?: Date; driverName?: string; limit?: number }) {
    const where: any = { vehicleId };
    if (options?.from || options?.to) {
      where.recordedAt = {};
      if (options.from) where.recordedAt.gte = options.from;
      if (options.to) where.recordedAt.lte = options.to;
    }
    if (options?.driverName) where.driverName = options.driverName;

    return this.prisma.drivingEvent.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: options?.limit ?? 100,
    });
  }

  async getInsights(vehicleId: string, from?: Date, to?: Date) {
    const where: any = { vehicleId };
    if (from || to) {
      where.recordedAt = {};
      if (from) where.recordedAt.gte = from;
      if (to) where.recordedAt.lte = to;
    }

    const events = await this.prisma.drivingEvent.findMany({ where });

    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.eventType] = (counts[e.eventType] || 0) + 1;
    }

    return {
      total: events.length,
      harshBraking: counts['HARSH_BRAKING'] || 0,
      extremeBraking: counts['EXTREME_BRAKING'] || 0,
      harshAcceleration: counts['HARSH_ACCELERATION'] || 0,
      harshCornering: counts['HARSH_CORNERING'] || 0,
      speeding: counts['SPEEDING'] || 0,
      byDriver: this.groupByDriver(events),
    };
  }

  private groupByDriver(events: any[]) {
    const map: Record<string, Record<string, number>> = {};
    for (const e of events) {
      const driver = e.driverName || 'Unknown';
      if (!map[driver]) map[driver] = {};
      map[driver][e.eventType] = (map[driver][e.eventType] || 0) + 1;
    }
    return Object.entries(map).map(([name, counts]) => ({ name, ...counts }));
  }

  async create(data: {
    vehicleId: string;
    eventType: DrivingEventType;
    severity?: number;
    latitude?: number;
    longitude?: number;
    speedKmh?: number;
    deltaKmh?: number;
    durationMs?: number;
    driverName?: string;
    tripId?: string;
    recordedAt: Date;
  }) {
    return this.prisma.drivingEvent.create({
      data: {
        vehicle: { connect: { id: data.vehicleId } },
        eventType: data.eventType,
        severity: data.severity ?? 0,
        latitude: data.latitude,
        longitude: data.longitude,
        speedKmh: data.speedKmh,
        deltaKmh: data.deltaKmh,
        durationMs: data.durationMs,
        driverName: data.driverName,
        ...(data.tripId ? { trip: { connect: { id: data.tripId } } } : {}),
        recordedAt: data.recordedAt,
      },
    });
  }
}
