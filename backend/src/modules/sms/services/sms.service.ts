import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SmsMessage, SmsMessageDeliveryStatus } from '@prisma/client';
import { SmsCommunicationProjectionIntegration } from '@modules/communication/adapters/sms/sms-communication-projection.integration';
import { SmsConversationRepository } from '../repositories/sms-conversation.repository';
import { SmsMessageRepository } from '../repositories/sms-message.repository';
import { buildSentDmIdempotencyKey } from '../providers/sentdm-idempotency-key';
import { SentDmSmsAdapter } from '../providers/sentdm-sms.adapter';
import type { SentDmSendFailure } from '../providers/sentdm-sms.types';
import { SmsConfigService } from './sms-config.service';
import { normalizePhoneNumber, toE164Phone } from '../utils/sms-phone.util';
import { detectSmsIdempotencyPayloadMismatch } from '../utils/sms-idempotency';

export interface SmsSendOutboundInput {
  organizationId: string;
  recipient: string;
  content: string;
  businessOperationId: string;
  actorUserId: string;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
}

export type SmsSendOutboundResult =
  | {
      status: 'accepted';
      message: SmsMessage & { conversation: { id: string } };
      providerMessageId: string;
      projectionAttempted: boolean;
    }
  | { status: 'in_progress'; messageId: string }
  | { status: 'idempotency_expired'; messageId: string; businessOperationId: string }
  | { status: 'already_terminal'; messageId: string; deliveryStatus: SmsMessageDeliveryStatus }
  | { status: 'blocked'; messageId: string }
  | {
      status: 'idempotency_conflict';
      messageId: string;
      businessOperationId: string;
      mismatch: 'recipient' | 'content' | 'recipient_and_content';
    };

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly configService: SmsConfigService,
    private readonly conversations: SmsConversationRepository,
    private readonly messages: SmsMessageRepository,
    private readonly provider: SentDmSmsAdapter,
    private readonly projection: SmsCommunicationProjectionIntegration,
  ) {}

  async sendOutbound(input: SmsSendOutboundInput): Promise<SmsSendOutboundResult> {
    const orgConfig = await this.configService.getOrgConfig(input.organizationId);
    this.configService.assertOutboundReady(orgConfig);

    const phoneNormalized = normalizePhoneNumber(input.recipient);
    if (!phoneNormalized) {
      throw new BadRequestException('Invalid recipient phone number');
    }
    const recipientE164 = toE164Phone(phoneNormalized);

    let existing = await this.messages.findByBusinessOperation(
      input.organizationId,
      input.businessOperationId,
    );
    if (existing) {
      this.assertIdempotentPayloadOrThrow(existing, phoneNormalized, input);
      const replay = await this.handleExistingBusinessOperation(existing, input, recipientE164, orgConfig!);
      if (replay) {
        return replay;
      }
    }

    const conversation = await this.conversations.ensureConversation({
      organizationId: input.organizationId,
      contactPhone: recipientE164,
      contactPhoneNormalized: phoneNormalized,
      customerId: input.customerId,
      bookingId: input.bookingId,
      vehicleId: input.vehicleId,
    });

    const pending =
      existing ??
      (await this.messages.createOutboundPending({
        organizationId: input.organizationId,
        conversationId: conversation.id,
        content: input.content,
        businessOperationId: input.businessOperationId,
        senderType: 'user',
      }));
    if (!pending) {
      throw new BadRequestException('Failed to create outbound SMS message');
    }

    if (!existing) {
      existing = pending;
    }
    this.assertIdempotentPayloadOrThrow(existing, phoneNormalized, input);

    const claim = await this.messages.claimProviderDispatch(pending.id, input.organizationId);
    if (claim.outcome === 'held_by_peer') {
      return { status: 'in_progress', messageId: pending.id };
    }
    if (claim.outcome === 'idempotency_expired') {
      return {
        status: 'idempotency_expired',
        messageId: pending.id,
        businessOperationId: input.businessOperationId,
      };
    }
    if (claim.outcome === 'not_claimable') {
      const row = claim.message ?? pending;
      if (row.status === SmsMessageDeliveryStatus.FAILED) {
        return { status: 'already_terminal', messageId: row.id, deliveryStatus: row.status };
      }
      if (row.status === SmsMessageDeliveryStatus.BLOCKED) {
        return { status: 'blocked', messageId: row.id };
      }
      if (row.providerMessageId) {
        return {
          status: 'accepted',
          message: row as SmsMessage & { conversation: { id: string } },
          providerMessageId: row.providerMessageId,
          projectionAttempted: false,
        };
      }
      throw new ConflictException('SMS dispatch is not claimable');
    }

    const idempotencyKey = buildSentDmIdempotencyKey(
      input.organizationId,
      input.businessOperationId,
    );

    const apiKey = this.configService.resolveApiKey(input.organizationId, orgConfig)!;
    const providerResult = await this.provider.executeSend(
      {
        organizationId: input.organizationId,
        recipientE164,
        body: input.content,
        idempotencyKey,
        senderProfileId: orgConfig!.senderProfileId!.trim(),
      },
      apiKey,
    );

    if (!providerResult.ok) {
      return this.handleProviderFailure(pending.id, input.organizationId, input.businessOperationId, providerResult);
    }

    const accepted = await this.messages.recordProviderAcceptance({
      messageId: pending.id,
      organizationId: input.organizationId,
      providerMessageId: providerResult.providerMessageId,
      providerStatus: providerResult.providerStatus,
      acceptedAt: providerResult.acceptedAt,
    });

    await this.conversations.recordOutboundActivity({
      conversationId: conversation.id,
      organizationId: input.organizationId,
      preview: input.content,
      occurredAt: providerResult.acceptedAt,
    });

    let projectionAttempted = false;
    try {
      await this.projection.projectOutboundAccepted({
        conversation: accepted.conversation,
        message: accepted,
        occurredAt: providerResult.acceptedAt,
      });
      projectionAttempted = true;
    } catch (err: unknown) {
      this.logger.error({
        msg: 'SMS canonical projection failed after provider acceptance',
        organizationId: input.organizationId,
        messageId: accepted.id,
        providerMessageId: accepted.providerMessageId,
      });
    }

    return {
      status: 'accepted',
      message: accepted,
      providerMessageId: providerResult.providerMessageId,
      projectionAttempted,
    };
  }

  private assertIdempotentPayloadOrThrow(
    existing: SmsMessage & { conversation?: { contactPhoneNormalized: string } | null },
    recipientNormalized: string,
    input: SmsSendOutboundInput,
  ): void {
    if (!existing.conversation) {
      throw new BadRequestException('SMS idempotency row missing conversation context');
    }
    const mismatch = detectSmsIdempotencyPayloadMismatch({
      existing: existing as SmsMessage & { conversation: { contactPhoneNormalized: string } },
      recipientNormalized,
      content: input.content,
    });
    if (!mismatch) {
      return;
    }
    throw new ConflictException({
      status: 'idempotency_conflict',
      code: 'IDEMPOTENCY_CONFLICT',
      messageId: existing.id,
      businessOperationId: input.businessOperationId,
      mismatch,
    });
  }

  private async handleProviderFailure(
    messageId: string,
    organizationId: string,
    businessOperationId: string,
    failure: SentDmSendFailure,
  ): Promise<never> {
    if (failure.retryable) {
      await this.messages.recordAmbiguousDispatchFailure(messageId, organizationId, failure.failureCode);
      throw new ConflictException('SMS dispatch outcome is ambiguous; retry with same idempotency key');
    }
    await this.messages.recordTerminalProviderRejection(messageId, organizationId, failure.failureCode);
    throw new ConflictException({
      status: 'already_terminal',
      messageId,
      businessOperationId,
      deliveryStatus: SmsMessageDeliveryStatus.FAILED,
    });
  }

  private async handleExistingBusinessOperation(
    existing: SmsMessage & { conversation?: { id: string } },
    input: SmsSendOutboundInput,
    recipientE164: string,
    orgConfig: NonNullable<Awaited<ReturnType<SmsConfigService['getOrgConfig']>>>,
  ): Promise<SmsSendOutboundResult | null> {
    if (
      existing.status === SmsMessageDeliveryStatus.QUEUED
      || existing.status === SmsMessageDeliveryStatus.SENT
      || existing.status === SmsMessageDeliveryStatus.DELIVERED
    ) {
      if (!existing.providerMessageId) {
        return null;
      }
      return {
        status: 'accepted',
        message: existing as SmsMessage & { conversation: { id: string } },
        providerMessageId: existing.providerMessageId,
        projectionAttempted: false,
      };
    }
    if (existing.status === SmsMessageDeliveryStatus.FAILED) {
      return {
        status: 'already_terminal',
        messageId: existing.id,
        deliveryStatus: existing.status,
      };
    }
    if (existing.status === SmsMessageDeliveryStatus.BLOCKED) {
      return { status: 'blocked', messageId: existing.id };
    }

    // Retry path for PENDING / DISPATCHING / DISPATCH_AMBIGUOUS continues in main flow.
    void recipientE164;
    void orgConfig;
    void input;
    return null;
  }
}
