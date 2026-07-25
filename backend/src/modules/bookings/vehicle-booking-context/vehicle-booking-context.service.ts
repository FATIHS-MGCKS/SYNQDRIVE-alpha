import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import {
  buildFleetBookingContextFromRows,
  resolveOrgTimezone,
} from '@modules/vehicles/operational/fleet-booking-context.util';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { buildVehicleBookingOperationalContext } from './vehicle-booking-context.util';
import type { VehicleBookingContextRow } from './vehicle-booking-context.types';

@Injectable()
export class VehicleBookingContextService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => VehiclesService))
    private readonly vehicles: VehiclesService,
  ) {}

  async getVehicleBookingOperationalContext(
    organizationId: string,
    vehicleId: string,
    input: {
      now?: Date;
      includeCustomerDisplayName?: boolean;
    } = {},
  ) {
    const now = input.now ?? new Date();
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        status: true,
        tankCapacityLiters: true,
        latestState: {
          select: {
            odometerKm: true,
            evSoc: true,
            fuelLevelRelative: true,
            fuelLevelAbsolute: true,
            rawPayloadJson: true,
          },
        },
      },
    });
    if (!vehicle) {
      return null;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = resolveOrgTimezone(org?.timezone ?? null);

    const rows = await this.prisma.booking.findMany({
      where: {
        organizationId,
        vehicleId,
        OR: [
          { status: 'ACTIVE' },
          {
            status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
            endDate: { gte: now },
          },
        ],
      },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        startDate: true,
        endDate: true,
        kmIncluded: true,
        kmDriven: true,
        pickupStationId: true,
        returnStationId: true,
        actualPickupStationId: true,
        actualReturnStationId: true,
        customer: { select: { firstName: true, lastName: true, company: true } },
        pricingQuote: { select: { returnAt: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    const bookingIds = rows.map((r) => r.id);
    const protocols =
      bookingIds.length > 0
        ? await this.prisma.bookingHandoverProtocol.findMany({
            where: { organizationId, bookingId: { in: bookingIds } },
            select: { bookingId: true, kind: true, performedAt: true },
          })
        : [];

    const pickupProtocolByBookingId = new Map<string, { performedAt: Date }>();
    const returnProtocolByBookingId = new Map<string, { performedAt: Date }>();
    for (const p of protocols) {
      if (p.kind === 'PICKUP') {
        pickupProtocolByBookingId.set(p.bookingId, { performedAt: p.performedAt });
      } else if (p.kind === 'RETURN') {
        returnProtocolByBookingId.set(p.bookingId, { performedAt: p.performedAt });
      }
    }

    const stationIds = [
      ...new Set(
        rows
          .flatMap((r) => [
            r.pickupStationId,
            r.returnStationId,
            r.actualPickupStationId,
            r.actualReturnStationId,
          ])
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const stationMap = new Map<string, string>();
    if (stationIds.length > 0) {
      const stations = await this.prisma.station.findMany({
        where: { id: { in: stationIds }, organizationId },
        select: { id: true, name: true },
      });
      for (const s of stations) {
        stationMap.set(s.id, s.name);
      }
    }

    const fmtCustomer = (c: {
      firstName: string;
      lastName: string;
      company: string | null;
    }): string => {
      const personal = `${c.firstName} ${c.lastName}`.trim();
      if (c.company && c.company.trim().length > 0) {
        return personal ? `${personal} · ${c.company}` : c.company;
      }
      return personal || c.company || '';
    };

    const contextRows: VehicleBookingContextRow[] = rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      kmIncluded: row.kmIncluded,
      kmDriven: row.kmDriven,
      pickupStationId: row.pickupStationId,
      returnStationId: row.returnStationId,
      actualPickupStationId: row.actualPickupStationId,
      actualReturnStationId: row.actualReturnStationId,
      customer: row.customer,
      originalScheduledReturnAt: row.pricingQuote?.returnAt ?? null,
    }));

    const fleetBuilt = buildFleetBookingContextFromRows({
      rows: contextRows,
      now,
      orgTimezone,
      stationMap,
      fmtCustomer,
    });

    const flat = fleetBuilt.map.get(vehicleId) ?? {
      reservedBookingId: null,
      reservedCustomerName: null,
      reservedPickupAt: null,
      reservedReturnAt: null,
      reservedPickupStationName: null,
      reservedIsOverdue: false,
      activeBookingId: null,
      activeCustomerName: null,
      activeStartAt: null,
      activeReturnAt: null,
      activeReturnStationName: null,
      activeKmIncluded: null,
      activeKmDriven: null,
      activeIsOverdue: false,
    };

    const supplement = fleetBuilt.supplements.get(vehicleId) ?? {
      nextBookingId: null,
      nextBookingCustomerName: null,
      nextBookingPickupAt: null,
      nextBookingReturnAt: null,
      nextBookingPickupStationName: null,
      futureBookingCount: 0,
    };

    const activeBookingIds = contextRows
      .filter((r) => r.status === 'ACTIVE')
      .map((r) => r.id);
    const pickupOdoByBooking = await this.loadPickupOdometerMap(activeBookingIds);

    const fleetCtx = this.vehicles.deriveFleetStatusContext({
      vehicle: {
        id: vehicle.id,
        status: vehicle.status,
        tankCapacityLiters: vehicle.tankCapacityLiters,
      },
      state: vehicle.latestState,
      bookingCtx: flat,
      pickupOdoByBooking,
      bookingContextLoadFailed: false,
    });

    return buildVehicleBookingOperationalContext({
      vehicleId,
      vehicleStatus: vehicle.status,
      operationalState: fleetCtx.operationalState,
      runtimeState: fleetCtx.status,
      rows: contextRows,
      pickupProtocolByBookingId,
      returnProtocolByBookingId,
      fleetFlat: flat,
      supplement,
      stationMap,
      fmtCustomer,
      orgTimezone,
      now,
      includeCustomerDisplayName: input.includeCustomerDisplayName === true,
      fleetContextLoadFailed: false,
    });
  }

  private async loadPickupOdometerMap(
    bookingIds: string[],
  ): Promise<Map<string, number>> {
    if (bookingIds.length === 0) return new Map();
    const rows = await this.prisma.bookingHandoverProtocol.findMany({
      where: { bookingId: { in: bookingIds }, kind: 'PICKUP' },
      select: { bookingId: true, odometerKm: true },
    });
    return new Map(rows.map((r) => [r.bookingId, r.odometerKm]));
  }
}
