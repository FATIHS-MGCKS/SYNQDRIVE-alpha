import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingEventType } from '@prisma/client';
import {
  assertVehicleInOrganization,
  buildTripDriverIdentityFilter,
  scopedDrivingEventWhere,
} from '../tenant/vehicle-intelligence-tenant.scope';

type DrivingEventWithTrip = {
  eventType: string;
  driverName: string | null;
  trip: {
    actualDriverId: string | null;
    assignedDriverId: string | null;
    driverName: string | null;
  } | null;
};

@Injectable()
export class DrivingEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(
    organizationId: string,
    vehicleId: string,
    options?: {
      from?: Date;
      to?: Date;
      driverCustomerId?: string;
      /** @deprecated Prefer driverCustomerId — legacy display-name filter only. */
      driverName?: string;
      limit?: number;
    },
  ) {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);

    const where = scopedDrivingEventWhere(organizationId, vehicleId);
    if (options?.from || options?.to) {
      where.recordedAt = {};
      if (options.from) where.recordedAt.gte = options.from;
      if (options.to) where.recordedAt.lte = options.to;
    }
    if (options?.driverCustomerId) {
      where.trip = buildTripDriverIdentityFilter({
        driverCustomerId: options.driverCustomerId,
      }) ?? undefined;
    } else if (options?.driverName) {
      where.driverName = options.driverName;
    }

    return this.prisma.drivingEvent.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: options?.limit ?? 100,
    });
  }

  async getInsights(organizationId: string, vehicleId: string, from?: Date, to?: Date) {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);

    const where = scopedDrivingEventWhere(organizationId, vehicleId);
    if (from || to) {
      where.recordedAt = {};
      if (from) where.recordedAt.gte = from;
      if (to) where.recordedAt.lte = to;
    }

    const events = await this.prisma.drivingEvent.findMany({
      where,
      include: {
        trip: {
          select: {
            actualDriverId: true,
            assignedDriverId: true,
            driverName: true,
          },
        },
      },
    });

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
      byDriver: this.groupByDriverIdentity(events),
    };
  }

  private groupByDriverIdentity(events: DrivingEventWithTrip[]) {
    const map = new Map<
      string,
      { driverCustomerId: string | null; name: string | null; counts: Record<string, number> }
    >();

    for (const event of events) {
      const driverCustomerId =
        event.trip?.actualDriverId ?? event.trip?.assignedDriverId ?? null;
      const key = driverCustomerId ?? 'unknown';
      const displayName =
        event.trip?.driverName ?? event.driverName ?? (driverCustomerId ? null : 'Unknown');

      const bucket =
        map.get(key) ??
        ({
          driverCustomerId,
          name: displayName,
          counts: {},
        } as const);
      const counts = { ...bucket.counts };
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
      map.set(key, { ...bucket, counts });
    }

    return [...map.values()].map(({ driverCustomerId, name, counts }) => ({
      driverCustomerId,
      name,
      ...counts,
    }));
  }

  async create(data: {
    organizationId: string;
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
    await assertVehicleInOrganization(this.prisma, data.organizationId, data.vehicleId);
    if (data.tripId) {
      const trip = await this.prisma.vehicleTrip.findFirst({
        where: {
          id: data.tripId,
          vehicleId: data.vehicleId,
          vehicle: { organizationId: data.organizationId },
        },
        select: { id: true },
      });
      if (!trip) {
        throw new Error('Trip not found for organization');
      }
    }

    return this.prisma.drivingEvent.create({
      data: {
        organizationId: data.organizationId,
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
