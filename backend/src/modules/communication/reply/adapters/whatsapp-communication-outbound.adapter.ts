import { Inject, Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationReplySendState,
  WhatsAppMessageDeliveryStatus,
} from '@prisma/client';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppService } from '@modules/whatsapp/whatsapp.service';
import { WHATSAPP_ERROR_CODES } from '@modules/whatsapp/utils/whatsapp-errors';
import { CommunicationReplyError } from '../communication-reply.errors';
import { buildNativeWhatsAppIdempotencyKey } from '../communication-reply-idempotency';
import {
  classifyNativeWhatsAppFailureReason,
  CommunicationReplyOutcomeClass,
} from '../communication-reply-outcome';
import type {
  CommunicationOutboundChannelPort,
  CommunicationOutboundSendInput,
  CommunicationOutboundSendResult,
} from '../ports/communication-outbound-channel.port';

@Injectable()
export class WhatsAppCommunicationOutboundAdapter implements CommunicationOutboundChannelPort {
  readonly channel = CommunicationChannel.WHATSAPP;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async sendMediaReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult> {
    if (!input.attachmentId) {
      throw CommunicationReplyError.mediaNotSupported();
    }

    const nativeConversation = await this.prisma.whatsAppConversation.findFirst({
      where: {
        id: input.nativeConversationId,
        organizationId: input.organizationId,
      },
      select: { id: true, organizationId: true },
    });

    if (!nativeConversation) {
      throw CommunicationReplyError.notFound();
    }

    const attachment = await this.prisma.communicationAttachment.findFirst({
      where: {
        id: input.attachmentId,
        organizationId: input.organizationId,
        conversationId: input.conversation.id,
      },
    });
    if (!attachment) {
      throw CommunicationReplyError.notFound();
    }

    const scopedIdempotencyKey = buildNativeWhatsAppIdempotencyKey(
      input.organizationId,
      input.conversation.id,
      input.clientIdempotencyKey,
    );

    const buffer = await this.loadAttachmentBuffer(attachment.objectKey);

    try {
      const message = await this.whatsapp.sendMediaMessage(
        input.organizationId,
        nativeConversation.id,
        {
          mediaKind: attachment.mediaType === 'IMAGE' ? 'image' : 'document',
          caption: input.text || undefined,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          buffer,
          attachmentId: attachment.id,
        },
        input.actorDisplayName ?? undefined,
        { idempotencyKey: scopedIdempotencyKey },
      );

      await this.prisma.communicationReplyCommand.update({
        where: { id: input.commandId },
        data: { nativeMessageId: message.id },
      });

      await this.prisma.communicationAttachment.update({
        where: { id: attachment.id },
        data: { sealedAt: new Date(), nativeMessageId: message.id },
      });

      if (message.status === WhatsAppMessageDeliveryStatus.SENT) {
        const canonicalEvent = await this.waitForCanonicalEvent(
          input.organizationId,
          message.id,
        );
        return {
          sendState: CommunicationReplySendState.ACCEPTED,
          nativeMessageId: message.id,
          canonicalEventId: canonicalEvent?.id ?? null,
        };
      }

      const outcome = classifyNativeWhatsAppFailureReason(message.failureReason);
      if (outcome === CommunicationReplyOutcomeClass.UNKNOWN) {
        return {
          sendState: CommunicationReplySendState.UNKNOWN,
          nativeMessageId: message.id,
        };
      }

      return {
        sendState: CommunicationReplySendState.FAILED,
        nativeMessageId: message.id,
        failureCode: message.failureReason ?? 'SEND_FAILED',
      };
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  private async loadAttachmentBuffer(objectKey: string): Promise<Buffer> {
    return this.storage.getObject(objectKey);
  }

  async sendTextReply(input: CommunicationOutboundSendInput): Promise<CommunicationOutboundSendResult> {
    const nativeConversation = await this.prisma.whatsAppConversation.findFirst({
      where: {
        id: input.nativeConversationId,
        organizationId: input.organizationId,
      },
      select: { id: true, organizationId: true },
    });

    if (!nativeConversation) {
      throw CommunicationReplyError.notFound();
    }

    const scopedIdempotencyKey = buildNativeWhatsAppIdempotencyKey(
      input.organizationId,
      input.conversation.id,
      input.clientIdempotencyKey,
    );

    try {
      const message = await this.whatsapp.sendMessage(
        input.organizationId,
        nativeConversation.id,
        input.text,
        input.actorDisplayName ?? undefined,
        { idempotencyKey: scopedIdempotencyKey },
      );

      await this.prisma.communicationReplyCommand.update({
        where: { id: input.commandId },
        data: { nativeMessageId: message.id },
      });

      if (message.status === WhatsAppMessageDeliveryStatus.SENT) {
        const canonicalEvent = await this.waitForCanonicalEvent(
          input.organizationId,
          message.id,
        );
        return {
          sendState: CommunicationReplySendState.ACCEPTED,
          nativeMessageId: message.id,
          canonicalEventId: canonicalEvent?.id ?? null,
        };
      }

      const outcome = classifyNativeWhatsAppFailureReason(message.failureReason);
      if (outcome === CommunicationReplyOutcomeClass.UNKNOWN) {
        return {
          sendState: CommunicationReplySendState.UNKNOWN,
          nativeMessageId: message.id,
        };
      }

      return {
        sendState: CommunicationReplySendState.FAILED,
        nativeMessageId: message.id,
        failureCode: message.failureReason ?? 'SEND_FAILED',
      };
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  private async waitForCanonicalEvent(
    organizationId: string,
    nativeMessageId: string,
  ): Promise<{ id: string } | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const event = await this.findCanonicalEventForNativeMessage(organizationId, nativeMessageId);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return null;
  }

  private async findCanonicalEventForNativeMessage(
    organizationId: string,
    nativeMessageId: string,
  ): Promise<{ id: string } | null> {
    const providerEventId = `wa-sent:${nativeMessageId}`;
    return this.prisma.communicationEvent.findFirst({
      where: {
        organizationId,
        providerEventId,
        eventType: 'MESSAGE_SENT',
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mapProviderError(error: unknown): Error {
    const response = (error as { response?: { code?: string; message?: string } })?.response;
    const code = response?.code;

    switch (code) {
      case WHATSAPP_ERROR_CODES.PROVIDER_NOT_CONFIGURED:
        return CommunicationReplyError.channelNotConfigured();
      case WHATSAPP_ERROR_CODES.FREE_TEXT_BLOCKED:
        return CommunicationReplyError.templateRequired();
      case WHATSAPP_ERROR_CODES.CONSENT_OPTED_OUT:
      case WHATSAPP_ERROR_CODES.POLICY_BLOCKED:
        return CommunicationReplyError.sendFailed('Message blocked by policy');
      case 'WHATSAPP_SEND_AMBIGUOUS':
        return CommunicationReplyError.sendUnknown();
      default:
        if (code === 'RATE_LIMITED' || String(response?.message).toLowerCase().includes('rate')) {
          return CommunicationReplyError.rateLimited();
        }
        if (
          /timeout|timed out|econnreset|econnrefused|socket hang up|network|aborted|fetch failed|gateway timeout/i.test(
            String(response?.message ?? (error instanceof Error ? error.message : '')),
          )
        ) {
          return CommunicationReplyError.sendUnknown();
        }
        return CommunicationReplyError.sendFailed();
    }
  }
}
