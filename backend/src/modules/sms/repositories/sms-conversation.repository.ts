import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SmsConversation } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '@modules/communication/communication-tenant-context.validation';

export interface EnsureSmsConversationInput {
  organizationId: string;
  contactPhone: string;
  contactPhoneNormalized: string;
  contactName?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
}

export interface EnrichSmsConversationInput {
  contactName?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
}

@Injectable()
export class SmsConversationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantValidation: CommunicationTenantContextValidation,
  ) {}

  async ensureConversation(input: EnsureSmsConversationInput): Promise<SmsConversation> {
    await this.tenantValidation.assertConversationContextBelongsToOrg(input.organizationId, {
      customerId: input.customerId,
      bookingId: input.bookingId,
      vehicleId: input.vehicleId,
    });

    const existing = await this.prisma.smsConversation.findUnique({
      where: {
        organizationId_contactPhoneNormalized: {
          organizationId: input.organizationId,
          contactPhoneNormalized: input.contactPhoneNormalized,
        },
      },
    });

    if (existing) {
      return this.enrichConversation(existing, input);
    }

    try {
      return await this.prisma.smsConversation.create({
        data: {
          organizationId: input.organizationId,
          contactPhone: input.contactPhone,
          contactPhoneNormalized: input.contactPhoneNormalized,
          contactName: input.contactName ?? null,
          customerId: input.customerId ?? null,
          bookingId: input.bookingId ?? null,
          vehicleId: input.vehicleId ?? null,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.smsConversation.findUniqueOrThrow({
          where: {
            organizationId_contactPhoneNormalized: {
              organizationId: input.organizationId,
              contactPhoneNormalized: input.contactPhoneNormalized,
            },
          },
        });
        return this.enrichConversation(raced, input);
      }
      throw err;
    }
  }

  async enrichConversation(
    conversation: SmsConversation,
    input: EnrichSmsConversationInput,
  ): Promise<SmsConversation> {
    await this.tenantValidation.assertConversationContextBelongsToOrg(conversation.organizationId, {
      customerId: input.customerId,
      bookingId: input.bookingId,
      vehicleId: input.vehicleId,
    });

    const patch: Prisma.SmsConversationUpdateInput = {};
    if (input.contactName && !conversation.contactName) {
      patch.contactName = input.contactName;
    }
    if (input.customerId && !conversation.customerId) {
      patch.customer = { connect: { id: input.customerId } };
    }
    if (input.bookingId && !conversation.bookingId) {
      patch.booking = { connect: { id: input.bookingId } };
    }
    if (input.vehicleId && !conversation.vehicleId) {
      patch.vehicle = { connect: { id: input.vehicleId } };
    }

    if (Object.keys(patch).length === 0) {
      return conversation;
    }

    return this.prisma.smsConversation.update({
      where: { id: conversation.id },
      data: patch,
    });
  }

  async incrementUnreadCount(conversationId: string, organizationId: string, delta: number) {
    if (delta <= 0) {
      throw new BadRequestException('unread delta must be positive');
    }
    const result = await this.prisma.smsConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { unreadCount: { increment: delta } },
    });
    if (result.count !== 1) {
      throw new BadRequestException('SMS conversation not found in organization');
    }
  }

  async recordOutboundActivity(input: {
    conversationId: string;
    organizationId: string;
    preview: string;
    occurredAt: Date;
  }) {
    await this.prisma.smsConversation.updateMany({
      where: { id: input.conversationId, organizationId: input.organizationId },
      data: {
        lastMessageAt: input.occurredAt,
        lastMessagePreview: input.preview.slice(0, 120),
      },
    });
  }

  async recordInboundActivity(input: {
    conversationId: string;
    organizationId: string;
    preview: string;
    occurredAt: Date;
    unreadDelta: number;
  }) {
    await this.prisma.smsConversation.updateMany({
      where: { id: input.conversationId, organizationId: input.organizationId },
      data: {
        lastMessageAt: input.occurredAt,
        lastCustomerMessageAt: input.occurredAt,
        lastMessagePreview: input.preview.slice(0, 120),
        unreadCount: { increment: input.unreadDelta },
      },
    });
  }
}
