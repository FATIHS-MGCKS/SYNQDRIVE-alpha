import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommunicationActorType,
  Prisma,
  SmsMessageDeliveryStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizePhoneNumber, toE164Phone } from '@modules/whatsapp/utils/whatsapp-phone.util';
import { SmsCommunicationProjectionIntegration } from '@modules/communication/adapters/sms/sms-communication-projection.integration';
import { SentDmSmsAdapter, SentDmSmsProviderError } from './providers/sentdm-sms.adapter';

export interface SmsSendOutboundInput {
  organizationId: string;
  recipientPhone: string;
  body: string;
  businessOperationId: string;
  actorType?: CommunicationActorType;
  actorUserId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  sandbox?: boolean;
}

export interface SmsSendOutboundResult {
  messageId: string;
  conversationId: string;
  providerMessageId: string;
  status: SmsMessageDeliveryStatus;
  replayed: boolean;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sentDmAdapter: SentDmSmsAdapter,
    private readonly projection: SmsCommunicationProjectionIntegration,
  ) {}

  isSendEnabled(): boolean {
    return this.configService.get<boolean>('sms.sendEnabled', false);
  }

  async sendOutbound(input: SmsSendOutboundInput): Promise<SmsSendOutboundResult> {
    if (!this.isSendEnabled()) {
      throw new ForbiddenException('SMS send is disabled');
    }

    const orgConfig = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId: input.organizationId },
    });
    if (!this.sentDmAdapter.isConfigured(orgConfig)) {
      throw new ServiceUnavailableException('SMS provider is not configured for organization');
    }

    const phoneNormalized = normalizePhoneNumber(input.recipientPhone);
    if (!phoneNormalized) {
      throw new BadRequestException('Invalid recipient phone number');
    }
    const recipientE164 = toE164Phone(phoneNormalized);

    const businessOperationId = input.businessOperationId.trim();
    if (!businessOperationId) {
      throw new BadRequestException('businessOperationId is required');
    }

    const existing = await this.prisma.smsMessage.findUnique({
      where: {
        sms_messages_org_business_operation: {
          organizationId: input.organizationId,
          businessOperationId,
        },
      },
      include: { conversation: true },
    });

    if (existing?.providerMessageId) {
      return {
        messageId: existing.id,
        conversationId: existing.conversationId,
        providerMessageId: existing.providerMessageId,
        status: existing.status,
        replayed: true,
      };
    }

    const conversation = await this.ensureConversation({
      organizationId: input.organizationId,
      contactPhone: recipientE164,
      contactPhoneNormalized: phoneNormalized,
      customerId: input.customerId,
      bookingId: input.bookingId,
      vehicleId: input.vehicleId,
    });

    let message = existing;
    if (!message) {
      try {
        message = await this.prisma.smsMessage.create({
          data: {
            organizationId: input.organizationId,
            conversationId: conversation.id,
            direction: 'outgoing',
            senderType: mapActorTypeToSenderType(input.actorType),
            content: input.body,
            businessOperationId,
            status: SmsMessageDeliveryStatus.PENDING,
          },
          include: { conversation: true },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const raced = await this.prisma.smsMessage.findUniqueOrThrow({
            where: {
              sms_messages_org_business_operation: {
                organizationId: input.organizationId,
                businessOperationId,
              },
            },
            include: { conversation: true },
          });
          if (raced.providerMessageId) {
            return {
              messageId: raced.id,
              conversationId: raced.conversationId,
              providerMessageId: raced.providerMessageId,
              status: raced.status,
              replayed: true,
            };
          }
          message = raced;
        } else {
          throw err;
        }
      }
    }

    if (message.providerMessageId) {
      return {
        messageId: message.id,
        conversationId: message.conversationId,
        providerMessageId: message.providerMessageId,
        status: message.status,
        replayed: true,
      };
    }

    const claimed = await this.claimProviderDispatch(message.id);
    if (!claimed) {
      const awaited = await this.awaitProviderAcceptance(
        input.organizationId,
        businessOperationId,
      );
      return {
        messageId: awaited.id,
        conversationId: awaited.conversationId,
        providerMessageId: awaited.providerMessageId!,
        status: awaited.status,
        replayed: true,
      };
    }

    let providerResult;
    try {
      providerResult = await this.sentDmAdapter.sendMessage({
        organizationId: input.organizationId,
        recipientE164,
        body: input.body,
        idempotencyKey: businessOperationId,
        senderProfileId: orgConfig?.senderProfileId,
        sandbox: input.sandbox,
      });
    } catch (err: unknown) {
      if (err instanceof SentDmSmsProviderError) {
        await this.prisma.smsMessage.update({
          where: { id: message.id },
          data: {
            status: SmsMessageDeliveryStatus.FAILED,
            failureCode: err.code,
            failureReason: 'provider_rejected',
            failedAt: new Date(),
          },
        });
        throw new BadRequestException('SMS provider rejected send request');
      }
      throw err;
    }

    const updated = await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.providerStatus,
        status: SmsMessageDeliveryStatus.QUEUED,
        acceptedAt: providerResult.acceptedAt,
      },
      include: { conversation: true },
    });

    await this.prisma.smsConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: providerResult.acceptedAt,
        lastMessagePreview: input.body.slice(0, 120),
      },
    });

    await this.projection.projectOutboundAccepted({
      conversation: updated.conversation,
      message: updated,
      occurredAt: providerResult.acceptedAt,
    });

    return {
      messageId: updated.id,
      conversationId: updated.conversationId,
      providerMessageId: updated.providerMessageId!,
      status: updated.status,
      replayed: false,
    };
  }

  private async claimProviderDispatch(messageId: string): Promise<boolean> {
    const result = await this.prisma.smsMessage.updateMany({
      where: {
        id: messageId,
        providerMessageId: null,
        status: SmsMessageDeliveryStatus.PENDING,
        providerStatus: null,
      },
      data: { providerStatus: 'DISPATCHING' },
    });
    return result.count === 1;
  }

  private async awaitProviderAcceptance(organizationId: string, businessOperationId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const message = await this.prisma.smsMessage.findUniqueOrThrow({
        where: {
          sms_messages_org_business_operation: {
            organizationId,
            businessOperationId,
          },
        },
      });
      if (message.providerMessageId) {
        return message;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new ServiceUnavailableException('SMS send is still in progress');
  }

  private async ensureConversation(input: {
    organizationId: string;
    contactPhone: string;
    contactPhoneNormalized: string;
    customerId?: string | null;
    bookingId?: string | null;
    vehicleId?: string | null;
  }) {
    const existing = await this.prisma.smsConversation.findUnique({
      where: {
        organizationId_contactPhoneNormalized: {
          organizationId: input.organizationId,
          contactPhoneNormalized: input.contactPhoneNormalized,
        },
      },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.smsConversation.create({
        data: {
          organizationId: input.organizationId,
          contactPhone: input.contactPhone,
          contactPhoneNormalized: input.contactPhoneNormalized,
          customerId: input.customerId ?? null,
          bookingId: input.bookingId ?? null,
          vehicleId: input.vehicleId ?? null,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.smsConversation.findUniqueOrThrow({
          where: {
            organizationId_contactPhoneNormalized: {
              organizationId: input.organizationId,
              contactPhoneNormalized: input.contactPhoneNormalized,
            },
          },
        });
      }
      throw err;
    }
  }
}

function mapActorTypeToSenderType(actorType?: CommunicationActorType): string {
  switch (actorType) {
    case CommunicationActorType.AI_AGENT:
      return 'ai_agent';
    case CommunicationActorType.USER:
      return 'user';
    case CommunicationActorType.SYSTEM:
    case CommunicationActorType.PROVIDER:
    default:
      return 'system';
  }
}
