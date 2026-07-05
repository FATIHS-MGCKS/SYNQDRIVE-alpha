import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildDeviceConnectionSummary,
  buildTripDeviceConnectionFlags,
  filterCanonicalDeviceConnectionEvents,
  mapDeviceConnectionEventView,
  type DeviceConnectionBookingWindow,
  type DeviceConnectionEventRow,
  type DeviceConnectionSummary,
  type DeviceConnectionTripWindow,
  type TripDeviceConnectionFlags,
} from './device-connection-read-model';

const BOOKING_STATUSES = ['ACTIVE', 'CONFIRMED', 'COMPLETED'] as const;

@Injectable()
export class DeviceConnectionQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getVehicleSummary(
    organizationId: string,
    vehicleId: string,
    opts?: { includeRawPayload?: boolean; eventLimit?: number },
  ): Promise<DeviceConnectionSummary & { rawEvents?: unknown[] }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        hardwareType: true,
        dimoVehicleId: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const nowMs = Date.now();
    const since7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

    const [events, bookings, trips] = await Promise.all([
      this.loadEvents(organizationId, vehicleId, since7d, opts?.includeRawPayload),
      this.loadBookings(vehicleId, since7d),
      this.loadTrips(vehicleId, since7d),
    ]);

    const summary = buildDeviceConnectionSummary({
      vehicleId,
      hardwareType: vehicle.hardwareType,
      dimoLinked: vehicle.dimoVehicleId != null,
      nowMs,
      events: events.rows,
      bookings,
      trips,
      recentLimit: opts?.eventLimit ?? 20,
    });

    if (opts?.includeRawPayload) {
      return { ...summary, rawEvents: events.rawPayloads };
    }
    return summary;
  }

  async getFleetSummariesForVehicles(
    organizationId: string,
    vehicleIds: string[],
    hardwareById: Map<string, string | null>,
    dimoLinkedById: Map<string, boolean>,
  ): Promise<Map<string, ReturnType<typeof buildDeviceConnectionSummary>>> {
    if (vehicleIds.length === 0) return new Map();

    const nowMs = Date.now();
    const since7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

    const [events, bookings, trips] = await Promise.all([
      this.prisma.dimoDeviceConnectionEvent.findMany({
        where: {
          organizationId,
          vehicleId: { in: vehicleIds },
          observedAt: { gte: since7d },
        },
        select: {
          id: true,
          vehicleId: true,
          eventType: true,
          observedAt: true,
        },
        orderBy: { observedAt: 'desc' },
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId,
          vehicleId: { in: vehicleIds },
          status: { in: [...BOOKING_STATUSES] },
          endDate: { gte: since7d },
        },
        select: {
          id: true,
          vehicleId: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      }),
      this.prisma.vehicleTrip.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          startTime: { gte: since7d },
        },
        select: {
          id: true,
          vehicleId: true,
          startTime: true,
          endTime: true,
          assignedBookingId: true,
        },
      }),
    ]);

    const eventsByVehicle = new Map<string, DeviceConnectionEventRow[]>();
    for (const e of events) {
      const list = eventsByVehicle.get(e.vehicleId) ?? [];
      list.push(e);
      eventsByVehicle.set(e.vehicleId, list);
    }

    const bookingsByVehicle = new Map<string, DeviceConnectionBookingWindow[]>();
    for (const b of bookings) {
      const list = bookingsByVehicle.get(b.vehicleId) ?? [];
      list.push(b);
      bookingsByVehicle.set(b.vehicleId, list);
    }

    const tripsByVehicle = new Map<string, DeviceConnectionTripWindow[]>();
    for (const t of trips) {
      const list = tripsByVehicle.get(t.vehicleId) ?? [];
      list.push(t);
      tripsByVehicle.set(t.vehicleId, list);
    }

    const out = new Map<string, ReturnType<typeof buildDeviceConnectionSummary>>();
    for (const vehicleId of vehicleIds) {
      out.set(
        vehicleId,
        buildDeviceConnectionSummary({
          vehicleId,
          hardwareType: hardwareById.get(vehicleId) ?? null,
          dimoLinked: dimoLinkedById.get(vehicleId) ?? false,
          nowMs,
          events: eventsByVehicle.get(vehicleId) ?? [],
          bookings: bookingsByVehicle.get(vehicleId) ?? [],
          trips: tripsByVehicle.get(vehicleId) ?? [],
          recentLimit: 5,
        }),
      );
    }
    return out;
  }

  async getDeviceConnectionFlagsForTrips(
    organizationId: string,
    vehicleId: string,
    trips: DeviceConnectionTripWindow[],
  ): Promise<Map<string, TripDeviceConnectionFlags>> {
    const out = new Map<string, TripDeviceConnectionFlags>();
    if (trips.length === 0) return out;

    const nowMs = Date.now();
    const minStart = trips.reduce(
      (min, t) => Math.min(min, t.startTime.getTime()),
      Number.POSITIVE_INFINITY,
    );
    const maxEnd = trips.reduce((max, t) => {
      const end = t.endTime?.getTime() ?? nowMs;
      return Math.max(max, end);
    }, 0);

    const [events, bookings] = await Promise.all([
      this.prisma.dimoDeviceConnectionEvent.findMany({
        where: {
          organizationId,
          vehicleId,
          observedAt: {
            gte: new Date(minStart),
            lte: new Date(maxEnd),
          },
        },
        select: {
          id: true,
          vehicleId: true,
          eventType: true,
          observedAt: true,
        },
        orderBy: { observedAt: 'asc' },
      }),
      this.loadBookings(vehicleId, new Date(minStart)),
    ]);

    for (const trip of trips) {
      out.set(
        trip.id,
        buildTripDeviceConnectionFlags(trip, events, bookings, nowMs),
      );
    }
    return out;
  }

  async getTripEvidence(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ) {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicleId },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        assignedBookingId: true,
        vehicle: { select: { organizationId: true } },
      },
    });
    if (!trip || trip.vehicle.organizationId !== organizationId) {
      return { events: [] };
    }

    const end = trip.endTime ?? new Date();
    const events = await this.prisma.dimoDeviceConnectionEvent.findMany({
      where: {
        organizationId,
        vehicleId,
        observedAt: { gte: trip.startTime, lte: end },
      },
      orderBy: { observedAt: 'asc' },
      select: { id: true, vehicleId: true, eventType: true, observedAt: true },
    });

    if (events.length === 0) {
      return { events: [] };
    }

    const collapsed = filterCanonicalDeviceConnectionEvents(events);
    const bookings = await this.loadBookings(vehicleId, trip.startTime);
    const trips = [trip];

    const mapped = collapsed.map((event, index) => {
      const view = mapDeviceConnectionEventView(event, bookings, trips);

      if (event.eventType !== 'OBD_DEVICE_UNPLUGGED') {
        return {
          ...view,
          recoveryAt: null,
          recoveryDurationMs: null,
          source: 'DIMO Vehicle Trigger' as const,
          evidenceStatus: null,
        };
      }

      const recovery = collapsed
        .slice(index + 1)
        .find((e) => e.eventType === 'OBD_DEVICE_PLUGGED_IN');

      return {
        ...view,
        recoveryAt: recovery?.observedAt.toISOString() ?? null,
        recoveryDurationMs: recovery
          ? recovery.observedAt.getTime() - event.observedAt.getTime()
          : null,
        source: 'DIMO Vehicle Trigger' as const,
        evidenceStatus: recovery ? ('recovered' as const) : ('open' as const),
      };
    });

    return { events: mapped };
  }

  private async loadEvents(
    organizationId: string,
    vehicleId: string,
    since: Date,
    includeRaw?: boolean,
  ): Promise<{ rows: DeviceConnectionEventRow[]; rawPayloads?: unknown[] }> {
    const rows = await this.prisma.dimoDeviceConnectionEvent.findMany({
      where: { organizationId, vehicleId, observedAt: { gte: since } },
      orderBy: { observedAt: 'desc' },
      select: {
        id: true,
        vehicleId: true,
        eventType: true,
        observedAt: true,
        ...(includeRaw ? { rawPayloadJson: true } : {}),
      },
    });
    if (!includeRaw) {
      return { rows };
    }
    return {
      rows,
      rawPayloads: rows.map((r) => (r as { rawPayloadJson?: unknown }).rawPayloadJson),
    };
  }

  private async loadBookings(
    vehicleId: string,
    since: Date,
  ): Promise<DeviceConnectionBookingWindow[]> {
    return this.prisma.booking.findMany({
      where: {
        vehicleId,
        status: { in: [...BOOKING_STATUSES] },
        endDate: { gte: since },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
  }

  private async loadTrips(
    vehicleId: string,
    since: Date,
  ): Promise<DeviceConnectionTripWindow[]> {
    return this.prisma.vehicleTrip.findMany({
      where: { vehicleId, startTime: { gte: since } },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        assignedBookingId: true,
      },
    });
  }
}
