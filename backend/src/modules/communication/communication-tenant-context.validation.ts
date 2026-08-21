import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { CommunicationTx } from './communication.types';

export interface CommunicationConversationContextInput {
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  stationId?: string | null;
  assignedUserId?: string | null;
}

/**
 * Reusable tenant ownership validation for Communication Center persistence.
 * Mirrors TasksService.assertLinksBelongToOrg conventions.
 */
@Injectable()
export class CommunicationTenantContextValidation {
  constructor(private readonly prisma: PrismaService) {}

  async assertConversationContextBelongsToOrg(
    organizationId: string,
    context: CommunicationConversationContextInput,
    tx?: CommunicationTx,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    if (context.assignedUserId) {
      const user = await client.user.findUnique({
        where: { id: context.assignedUserId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('assignedUserId does not reference an existing user');
      }

      const membership = await client.organizationMembership.findFirst({
        where: { organizationId, userId: context.assignedUserId },
        select: { id: true },
      });
      if (!membership) {
        throw new BadRequestException('assignedUserId is not a member of this organization');
      }
    }

    const checks: Array<[string | null | undefined, () => Promise<unknown>, string]> = [
      [
        context.customerId,
        () => client.customer.findFirst({
          where: { id: context.customerId!, organizationId },
          select: { id: true },
        }),
        'Customer',
      ],
      [
        context.bookingId,
        () => client.booking.findFirst({
          where: { id: context.bookingId!, organizationId },
          select: { id: true },
        }),
        'Booking',
      ],
      [
        context.vehicleId,
        () => client.vehicle.findFirst({
          where: { id: context.vehicleId!, organizationId },
          select: { id: true },
        }),
        'Vehicle',
      ],
      [
        context.stationId,
        () => client.station.findFirst({
          where: { id: context.stationId!, organizationId },
          select: { id: true },
        }),
        'Station',
      ],
    ];

    for (const [id, query, label] of checks) {
      if (!id) continue;
      const found = await query();
      if (!found) {
        throw new BadRequestException(`${label} not found in this organization`);
      }
    }
  }
}
