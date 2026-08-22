import { Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationContentService } from './communication-content.service';
import type { CommunicationContentBackfillResult } from './communication-content.types';

type BackfillChannel = 'WHATSAPP' | 'SMS';

@Injectable()
export class CommunicationContentBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: CommunicationContentService,
  ) {}

  async backfillOrganization(options: {
    organizationId: string;
    channel?: BackfillChannel;
    batchSize?: number;
    dryRun?: boolean;
  }): Promise<CommunicationContentBackfillResult> {
    const batchSize = options.batchSize ?? 100;
    const dryRun = options.dryRun ?? true;
    const result: CommunicationContentBackfillResult = {
      scanned: 0,
      eligible: 0,
      wouldCreate: 0,
      alreadyProjected: 0,
      unsupported: 0,
      ambiguous: 0,
      missingCanonicalEvent: 0,
      failed: 0,
      applied: 0,
    };

    const channels: BackfillChannel[] = options.channel
      ? [options.channel]
      : ['WHATSAPP', 'SMS'];

    for (const channel of channels) {
      if (channel === 'WHATSAPP') {
        await this.backfillWhatsApp(options.organizationId, batchSize, dryRun, result);
      } else if (channel === 'SMS') {
        await this.backfillSms(options.organizationId, batchSize, dryRun, result);
      }
    }

    return result;
  }

  private async backfillWhatsApp(
    organizationId: string,
    batchSize: number,
    dryRun: boolean,
    result: CommunicationContentBackfillResult,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const messages = await this.prisma.whatsAppMessage.findMany({
        where: { organizationId },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (messages.length === 0) break;
      cursor = messages[messages.length - 1]!.id;

      for (const message of messages) {
        result.scanned += 1;
        const eventType =
          message.direction === 'incoming'
            ? CommunicationEventType.MESSAGE_RECEIVED
            : CommunicationEventType.MESSAGE_SENT;
        await this.processNativeMessage({
          organizationId,
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId: message.conversationId,
          nativeMessageId: message.id,
          providerMessageId: message.providerMessageId,
          eventType,
          occurredAt: message.createdAt,
          dryRun,
          result,
        });
      }
    }
  }

  private async backfillSms(
    organizationId: string,
    batchSize: number,
    dryRun: boolean,
    result: CommunicationContentBackfillResult,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const messages = await this.prisma.smsMessage.findMany({
        where: { organizationId },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (messages.length === 0) break;
      cursor = messages[messages.length - 1]!.id;

      for (const message of messages) {
        result.scanned += 1;
        const eventType =
          message.direction === 'incoming'
            ? CommunicationEventType.MESSAGE_RECEIVED
            : CommunicationEventType.MESSAGE_SENT;
        await this.processNativeMessage({
          organizationId,
          channel: CommunicationChannel.SMS,
          nativeConversationId: message.conversationId,
          nativeMessageId: message.id,
          providerMessageId: message.providerMessageId,
          eventType,
          occurredAt: message.createdAt,
          dryRun,
          result,
        });
      }
    }
  }

  private async processNativeMessage(input: {
    organizationId: string;
    channel: BackfillChannel;
    nativeConversationId: string;
    nativeMessageId: string;
    providerMessageId: string | null;
    eventType: CommunicationEventType;
    occurredAt: Date;
    dryRun: boolean;
    result: CommunicationContentBackfillResult;
  }): Promise<void> {
    const existingContent = await this.prisma.communicationMessageContent.findFirst({
      where: {
        organizationId: input.organizationId,
        channel: input.channel,
        nativeMessageId: input.nativeMessageId,
      },
      select: { id: true },
    });
    if (existingContent) {
      input.result.alreadyProjected += 1;
      return;
    }

    const canonicalConversation = await this.prisma.communicationConversation.findUnique({
      where: {
        communication_conversations_org_channel_native: {
          organizationId: input.organizationId,
          channel: input.channel,
          nativeConversationId: input.nativeConversationId,
        },
      },
      select: { id: true },
    });
    if (!canonicalConversation) {
      input.result.missingCanonicalEvent += 1;
      return;
    }

    const eventWhere: Prisma.CommunicationEventWhereInput = {
      organizationId: input.organizationId,
      conversationId: canonicalConversation.id,
      eventType: input.eventType,
      OR: [
        ...(input.providerMessageId
          ? [{ providerMessageId: input.providerMessageId }]
          : []),
        {
          providerEventId:
            input.channel === CommunicationChannel.WHATSAPP
              ? `wa-sent:${input.nativeMessageId}`
              : `sms-sent:${input.nativeMessageId}`,
        },
      ],
    };

    const matches = await this.prisma.communicationEvent.findMany({
      where: eventWhere,
      select: { id: true },
      take: 2,
    });

    if (matches.length === 0) {
      input.result.missingCanonicalEvent += 1;
      return;
    }
    if (matches.length > 1) {
      input.result.ambiguous += 1;
      return;
    }

    input.result.eligible += 1;
    if (input.dryRun) {
      input.result.wouldCreate += 1;
      return;
    }

    try {
      const projection = await this.contentService.repairMissingContentForEvent({
        organizationId: input.organizationId,
        communicationEventId: matches[0]!.id,
        channel: input.channel,
        nativeMessageId: input.nativeMessageId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
      });
      if (projection.created) {
        input.result.applied += 1;
      } else if (projection.skipped) {
        input.result.failed += 1;
      } else {
        input.result.alreadyProjected += 1;
      }
    } catch {
      input.result.failed += 1;
    }
  }
}
