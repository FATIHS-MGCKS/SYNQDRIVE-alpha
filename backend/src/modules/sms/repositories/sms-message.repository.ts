import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SmsMessage, SmsMessageDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { SMS_DISPATCH_STALE_MS } from '../sms.constants';
import type { SmsMessageDirection, SmsSenderType } from '../sms.constants';

export interface CreateOutboundSmsMessageInput {
  organizationId: string;
  conversationId: string;
  content: string;
  businessOperationId: string;
  senderType: SmsSenderType;
}

export interface RecordProviderAcceptanceInput {
  messageId: string;
  organizationId: string;
  providerMessageId: string;
  providerStatus: string;
  acceptedAt: Date;
}

@Injectable()
export class SmsMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByBusinessOperation(organizationId: string, businessOperationId: string) {
    return this.prisma.smsMessage.findUnique({
      where: {
        sms_messages_org_business_operation: { organizationId, businessOperationId },
      },
      include: { conversation: true },
    });
  }

  findByProviderMessageId(providerMessageId: string, organizationId?: string) {
    return this.prisma.smsMessage.findFirst({
      where: {
        providerMessageId,
        ...(organizationId ? { organizationId } : {}),
      },
      include: { conversation: true },
    });
  }

  async createOutboundPending(input: CreateOutboundSmsMessageInput) {
    try {
      return await this.prisma.smsMessage.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          direction: 'outgoing' satisfies SmsMessageDirection,
          senderType: input.senderType,
          content: input.content,
          businessOperationId: input.businessOperationId,
          status: SmsMessageDeliveryStatus.PENDING,
        },
        include: { conversation: true },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.findByBusinessOperation(input.organizationId, input.businessOperationId);
      }
      throw err;
    }
  }

  /**
   * Claims provider dispatch lease. Returns null when another worker holds a fresh DISPATCHING lease.
   * Reclaims stale DISPATCHING rows for idempotent retry with the same businessOperationId.
   */
  async claimProviderDispatch(messageId: string, organizationId: string): Promise<SmsMessage | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - SMS_DISPATCH_STALE_MS);

    const freshClaim = await this.prisma.smsMessage.updateMany({
      where: {
        id: messageId,
        organizationId,
        providerMessageId: null,
        status: SmsMessageDeliveryStatus.PENDING,
      },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCHING,
        dispatchAttemptedAt: now,
      },
    });
    if (freshClaim.count === 1) {
      return this.prisma.smsMessage.findUniqueOrThrow({ where: { id: messageId } });
    }

    const staleReclaim = await this.prisma.smsMessage.updateMany({
      where: {
        id: messageId,
        organizationId,
        providerMessageId: null,
        status: SmsMessageDeliveryStatus.DISPATCHING,
        dispatchAttemptedAt: { lt: staleBefore },
      },
      data: {
        dispatchAttemptedAt: now,
      },
    });
    if (staleReclaim.count === 1) {
      return this.prisma.smsMessage.findUniqueOrThrow({ where: { id: messageId } });
    }

    return null;
  }

  async recordProviderAcceptance(input: RecordProviderAcceptanceInput) {
    const updated = await this.prisma.smsMessage.updateMany({
      where: {
        id: input.messageId,
        organizationId: input.organizationId,
        providerMessageId: null,
        status: { in: [SmsMessageDeliveryStatus.PENDING, SmsMessageDeliveryStatus.DISPATCHING] },
      },
      data: {
        providerMessageId: input.providerMessageId,
        providerStatus: input.providerStatus,
        status: SmsMessageDeliveryStatus.QUEUED,
        acceptedAt: input.acceptedAt,
      },
    });
    if (updated.count !== 1) {
      throw new BadRequestException('SMS message acceptance state conflict');
    }
    return this.prisma.smsMessage.findUniqueOrThrow({
      where: { id: input.messageId },
      include: { conversation: true },
    });
  }

  async recordTerminalProviderRejection(
    messageId: string,
    organizationId: string,
    failureCode: string,
  ) {
    await this.prisma.smsMessage.updateMany({
      where: {
        id: messageId,
        organizationId,
        providerMessageId: null,
        status: { in: [SmsMessageDeliveryStatus.PENDING, SmsMessageDeliveryStatus.DISPATCHING] },
      },
      data: {
        status: SmsMessageDeliveryStatus.FAILED,
        failureCode: failureCode.slice(0, 64),
        failureReason: 'provider_rejected',
        failedAt: new Date(),
      },
    });
  }

  async recordAmbiguousDispatchFailure(messageId: string, organizationId: string, failureCode: string) {
    await this.prisma.smsMessage.updateMany({
      where: {
        id: messageId,
        organizationId,
        providerMessageId: null,
        status: { in: [SmsMessageDeliveryStatus.PENDING, SmsMessageDeliveryStatus.DISPATCHING] },
      },
      data: {
        status: SmsMessageDeliveryStatus.DISPATCH_AMBIGUOUS,
        failureCode: failureCode.slice(0, 64),
        failureReason: 'dispatch_ambiguous',
        dispatchAttemptedAt: null,
      },
    });
  }

  async createInboundMessage(input: {
    organizationId: string;
    conversationId: string;
    content: string;
    providerMessageId: string;
    businessOperationId: string;
    deliveredAt: Date;
  }) {
    try {
      return await this.prisma.smsMessage.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          direction: 'incoming',
          senderType: 'customer',
          content: input.content,
          providerMessageId: input.providerMessageId,
          businessOperationId: input.businessOperationId,
          providerStatus: 'RECEIVED',
          status: SmsMessageDeliveryStatus.DELIVERED,
          deliveredAt: input.deliveredAt,
        },
        include: { conversation: true },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.findByProviderMessageId(input.providerMessageId, input.organizationId);
      }
      throw err;
    }
  }
}
