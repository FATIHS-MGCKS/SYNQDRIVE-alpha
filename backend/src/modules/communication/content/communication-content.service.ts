import { Injectable, Logger } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationEventType,
  type SmsMessage,
  type WhatsAppMessage,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  mapSmsMessageToContentInput,
  mapWhatsAppMessageToContentInput,
} from './communication-content.mapper';
import { CommunicationContentRepository } from './communication-content.repository';
import type { ContentProjectionResult } from './communication-content.types';

@Injectable()
export class CommunicationContentService {
  private readonly logger = new Logger(CommunicationContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: CommunicationContentRepository,
  ) {}

  async projectWhatsAppMessage(input: {
    organizationId: string;
    conversationId: string;
    communicationEventId: string;
    eventType: CommunicationEventType;
    message: WhatsAppMessage;
    occurredAt: Date;
  }): Promise<ContentProjectionResult> {
    const contentInput = mapWhatsAppMessageToContentInput(input);
    if (!contentInput) {
      return { contentId: '', created: false, skipped: true };
    }
    return this.projectSafely(contentInput, CommunicationChannel.WHATSAPP);
  }

  async projectSmsMessage(input: {
    organizationId: string;
    conversationId: string;
    communicationEventId: string;
    eventType: CommunicationEventType;
    message: SmsMessage;
    occurredAt: Date;
  }): Promise<ContentProjectionResult> {
    const contentInput = mapSmsMessageToContentInput(input);
    if (!contentInput) {
      return { contentId: '', created: false, skipped: true };
    }
    return this.projectSafely(contentInput, CommunicationChannel.SMS);
  }

  async repairMissingContentForEvent(input: {
    organizationId: string;
    communicationEventId: string;
    channel: CommunicationChannel;
    nativeMessageId: string;
    eventType: CommunicationEventType;
    occurredAt: Date;
  }): Promise<ContentProjectionResult> {
    const event = await this.prisma.communicationEvent.findFirst({
      where: {
        id: input.communicationEventId,
        organizationId: input.organizationId,
      },
    });
    if (!event) {
      return { contentId: '', created: false, skipped: true };
    }

    if (input.channel === CommunicationChannel.WHATSAPP) {
      const message = await this.prisma.whatsAppMessage.findFirst({
        where: { id: input.nativeMessageId, organizationId: input.organizationId },
      });
      if (!message) return { contentId: '', created: false, skipped: true };
      return this.projectWhatsAppMessage({
        organizationId: input.organizationId,
        conversationId: event.conversationId,
        communicationEventId: event.id,
        eventType: input.eventType,
        message,
        occurredAt: input.occurredAt,
      });
    }

    if (input.channel === CommunicationChannel.SMS) {
      const message = await this.prisma.smsMessage.findFirst({
        where: { id: input.nativeMessageId, organizationId: input.organizationId },
      });
      if (!message) return { contentId: '', created: false, skipped: true };
      return this.projectSmsMessage({
        organizationId: input.organizationId,
        conversationId: event.conversationId,
        communicationEventId: event.id,
        eventType: input.eventType,
        message,
        occurredAt: input.occurredAt,
      });
    }

    return { contentId: '', created: false, skipped: true };
  }

  private async projectSafely(
    contentInput: Parameters<CommunicationContentRepository['projectMessageContentIdempotently']>[0],
    channel: CommunicationChannel,
  ): Promise<ContentProjectionResult> {
    try {
      const result = await this.repository.projectMessageContentIdempotently(contentInput);
      this.logger.log(
        JSON.stringify({
          msg: 'communication_content_projected',
          organizationId: contentInput.organizationId,
          conversationId: contentInput.conversationId,
          communicationEventId: contentInput.communicationEventId,
          contentId: result.contentId,
          channel,
          contentType: contentInput.contentType,
          projectionResult: result.created ? 'created' : 'existing',
        }),
      );
      return { contentId: result.contentId, created: result.created, skipped: false };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: 'communication_content_projection_failed',
          organizationId: contentInput.organizationId,
          conversationId: contentInput.conversationId,
          communicationEventId: contentInput.communicationEventId,
          channel,
          contentType: contentInput.contentType,
          errorCode: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      return { contentId: '', created: false, skipped: true };
    }
  }
}
