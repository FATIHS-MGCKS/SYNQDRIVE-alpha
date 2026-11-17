import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { DrivingIntelligenceBookingResolutionPort } from '@modules/vehicle-intelligence/ports/driving-intelligence-booking-resolution.port';

@Injectable()
export class DrivingIntelligenceBookingResolutionPrismaAdapter
  implements DrivingIntelligenceBookingResolutionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async resolveBookingVehicleForOrganization(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<{ vehicleId: string | null }> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: { id: true, vehicleId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
    return { vehicleId: booking.vehicleId };
  }
}