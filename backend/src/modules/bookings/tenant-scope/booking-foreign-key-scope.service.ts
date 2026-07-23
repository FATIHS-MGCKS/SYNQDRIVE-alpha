import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BOOKING_TENANT_SCOPE_ERROR_CODE,
  BOOKING_TENANT_SCOPE_MESSAGE,
} from './booking-tenant-scope.constants';

export type BookingForeignKeyRefs = {
  customerId?: string | null;
  vehicleId?: string | null;
  stationIds?: Array<string | null | undefined>;
  assignedUserId?: string | null;
  invoiceId?: string | null;
  bookingId?: string | null;
};

@Injectable()
export class BookingForeignKeyScopeService {
  constructor(private readonly prisma: PrismaService) {}

  tenantNotFound(): never {
    throw new NotFoundException({
      message: BOOKING_TENANT_SCOPE_MESSAGE,
      code: BOOKING_TENANT_SCOPE_ERROR_CODE,
    });
  }

  async assertCustomer(organizationId: string, customerId: string): Promise<void> {
    const row = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!row) this.tenantNotFound();
  }

  async assertVehicle(organizationId: string, vehicleId: string): Promise<void> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!row) this.tenantNotFound();
  }

  async assertStation(organizationId: string, stationId: string): Promise<void> {
    const row = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    if (!row) this.tenantNotFound();
  }

  async assertStations(
    organizationId: string,
    stationIds: Array<string | null | undefined>,
  ): Promise<void> {
    const unique = [...new Set(stationIds.filter(Boolean) as string[])];
    if (!unique.length) return;
    const count = await this.prisma.station.count({
      where: { organizationId, id: { in: unique } },
    });
    if (count !== unique.length) this.tenantNotFound();
  }

  async assertBooking(organizationId: string, bookingId: string): Promise<void> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true },
    });
    if (!row) this.tenantNotFound();
  }

  async assertOrgMember(organizationId: string, userId: string): Promise<void> {
    const row = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId },
      select: { id: true },
    });
    if (!row) this.tenantNotFound();
  }

  async assertInvoice(organizationId: string, invoiceId: string): Promise<void> {
    const row = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { id: true },
    });
    if (!row) this.tenantNotFound();
  }

  async assertBookingForeignKeys(
    organizationId: string,
    refs: BookingForeignKeyRefs,
  ): Promise<void> {
    if (refs.customerId) {
      await this.assertCustomer(organizationId, refs.customerId);
    }
    if (refs.vehicleId) {
      await this.assertVehicle(organizationId, refs.vehicleId);
    }
    if (refs.stationIds?.length) {
      await this.assertStations(organizationId, refs.stationIds);
    }
    if (refs.assignedUserId) {
      await this.assertOrgMember(organizationId, refs.assignedUserId);
    }
    if (refs.invoiceId) {
      await this.assertInvoice(organizationId, refs.invoiceId);
    }
    if (refs.bookingId) {
      await this.assertBooking(organizationId, refs.bookingId);
    }
  }

  async loadStationNameMap(
    organizationId: string,
    stationIds: string[],
  ): Promise<Map<string, string>> {
    if (!stationIds.length) return new Map();
    const rows = await this.prisma.station.findMany({
      where: { organizationId, id: { in: stationIds } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((s) => [s.id, s.name]));
  }

  async updateBookingScoped<T extends Prisma.BookingUpdateManyMutationInput>(
    organizationId: string,
    bookingId: string,
    data: T,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const result = await client.booking.updateMany({
      where: { id: bookingId, organizationId },
      data,
    });
    if (result.count !== 1) this.tenantNotFound();
    return client.booking.findFirst({
      where: { id: bookingId, organizationId },
    });
  }

  async updateVehicleScoped(
    organizationId: string,
    vehicleId: string,
    data: Prisma.VehicleUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const result = await client.vehicle.updateMany({
      where: { id: vehicleId, organizationId },
      data,
    });
    if (result.count !== 1) this.tenantNotFound();
  }

  async linkVehicleDamagesForHandover(
    organizationId: string,
    params: {
      damageIds: string[];
      vehicleId: string;
      bookingId: string;
      customerId: string;
      handoverProtocolId: string;
      source: import('@prisma/client').DamageSource;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!params.damageIds.length) return;
    const result = await tx.vehicleDamage.updateMany({
      where: {
        id: { in: params.damageIds },
        vehicleId: params.vehicleId,
        organizationId,
      },
      data: {
        bookingId: params.bookingId,
        customerId: params.customerId,
        handoverProtocolId: params.handoverProtocolId,
        source: params.source,
      },
    });
    if (result.count !== params.damageIds.length) {
      this.tenantNotFound();
    }
  }
}
