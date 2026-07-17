import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { toBookingReference, toCustomerReference } from './voice-mcp-privacy.util';

@Injectable()
export class VoiceMcpEntityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCustomerIdByRef(organizationId: string, customerRef: string): Promise<string | null> {
    const normalized = customerRef.trim().toUpperCase();
    const rows = await this.prisma.customer.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true },
      take: 5000,
    });
    const match = rows.find((row) => toCustomerReference(row.id) === normalized);
    return match?.id ?? null;
  }

  async resolveBookingIdByRef(organizationId: string, bookingRef: string): Promise<string | null> {
    const normalized = bookingRef.trim().toUpperCase();
    const rows = await this.prisma.booking.findMany({
      where: { organizationId },
      select: { id: true },
      take: 5000,
    });
    const match = rows.find((row) => toBookingReference(row.id) === normalized);
    return match?.id ?? null;
  }

  async resolveVehicleIdByLicensePlate(organizationId: string, licensePlate: string): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        organizationId,
        licensePlate: { equals: licensePlate.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
    return vehicle?.id ?? null;
  }
}
