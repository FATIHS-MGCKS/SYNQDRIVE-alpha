import { BadRequestException, Injectable } from '@nestjs/common';
import { CommunicationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '../communication-tenant-context.validation';
import { mapConversationDetail } from '../read/communication-read.mapper';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationReplyError } from '../reply/communication-reply.errors';
import { CommunicationWriteError } from '../write/communication-write.errors';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationContextResolutionSource } from './communication-context.types';

export interface LinkVehicleFromBookingInput {
  organizationId: string;
  canonicalConversationId: string;
  nativeConversationId: string;
  actorUserId: string;
}

export interface LinkVehicleFromBookingResult {
  vehicleId: string;
  changed: boolean;
  conversation: ReturnType<typeof mapConversationDetail>;
}

@Injectable()
export class CommunicationContextLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly writeScope: CommunicationWriteScopeService,
    private readonly tenantContext: CommunicationTenantContextValidation,
  ) {}

  /**
   * Operator-initiated vehicle link from the authoritative booking on the native
   * WhatsApp conversation. Updates canonical CommunicationConversation first, then
   * converges native WhatsAppConversation in the same transaction.
   */
  async linkVehicleFromBooking(
    input: LinkVehicleFromBookingInput,
  ): Promise<LinkVehicleFromBookingResult> {
    const row = await this.readRepository.findConversationById(
      input.organizationId,
      input.canonicalConversationId,
    );
    if (!row) throw CommunicationReplyError.notFound();
    if (row.channel !== CommunicationChannel.WHATSAPP) {
      throw new BadRequestException('Vehicle link is only supported for WhatsApp conversations');
    }

    await this.writeScope.assertConversationMutable(
      input.actorUserId,
      input.organizationId,
      row,
    );

    const native = await this.prisma.whatsAppConversation.findFirst({
      where: {
        id: input.nativeConversationId,
        organizationId: input.organizationId,
      },
    });
    if (!native) throw CommunicationReplyError.notFound();
    if (!native.bookingId) throw new BadRequestException('No booking linked');

    const booking = await this.prisma.booking.findFirst({
      where: { id: native.bookingId, organizationId: input.organizationId },
      select: { vehicleId: true },
    });
    if (!booking) throw new BadRequestException('Booking not found');
    if (!booking.vehicleId) throw new BadRequestException('Booking has no vehicle');

    await this.tenantContext.assertConversationContextBelongsToOrg(input.organizationId, {
      vehicleId: booking.vehicleId,
    });

    if (row.vehicleId && row.vehicleId !== booking.vehicleId) {
      throw CommunicationWriteError.conflict(
        'Conversation is already linked to a different vehicle',
      );
    }

    const alreadyConverged =
      row.vehicleId === booking.vehicleId && native.vehicleId === booking.vehicleId;

    if (alreadyConverged) {
      return {
        vehicleId: booking.vehicleId,
        changed: false,
        conversation: mapConversationDetail(row),
      };
    }

    await this.prisma.$transaction(async (tx) => {
      if (row.vehicleId !== booking.vehicleId) {
        await tx.communicationConversation.update({
          where: {
            id: input.canonicalConversationId,
            organizationId: input.organizationId,
          },
          data: {
            vehicleId: booking.vehicleId,
            metadata: mergeVehicleResolutionSource(
              row.metadata,
              CommunicationContextResolutionSource.BOOKING_RELATION,
            ) as Prisma.InputJsonValue,
          },
        });
      }

      if (native.vehicleId !== booking.vehicleId) {
        await tx.whatsAppConversation.update({
          where: {
            id: native.id,
            organizationId: input.organizationId,
          },
          data: { vehicleId: booking.vehicleId },
        });
      }
    });

    const updated = await this.readRepository.findConversationById(
      input.organizationId,
      input.canonicalConversationId,
    );
    if (!updated) throw CommunicationReplyError.notFound();

    return {
      vehicleId: booking.vehicleId,
      changed: true,
      conversation: mapConversationDetail(updated),
    };
  }
}

function mergeVehicleResolutionSource(
  metadata: unknown,
  source: CommunicationContextResolutionSource,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const existingSources =
    base.contextResolutionSources
    && typeof base.contextResolutionSources === 'object'
    && !Array.isArray(base.contextResolutionSources)
      ? { ...(base.contextResolutionSources as Record<string, unknown>) }
      : {};

  return {
    ...base,
    contextResolutionSources: {
      ...existingSources,
      vehicleId: source,
    },
  };
}
