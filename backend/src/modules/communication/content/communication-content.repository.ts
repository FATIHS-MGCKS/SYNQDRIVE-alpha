import { Injectable } from '@nestjs/common';
import {
  CommunicationEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildCanonicalContentIdempotencyKey } from './communication-content-idempotency';
import { CommunicationContentIntegrityError } from './communication-content.errors';
import { buildMessagePreview, normalizeCanonicalText } from './communication-content.mapper';
import type { ProjectMessageContentInput } from './communication-content.types';

const MESSAGE_CONTENT_EVENT_TYPES = new Set<CommunicationEventType>([
  CommunicationEventType.MESSAGE_RECEIVED,
  CommunicationEventType.MESSAGE_SENT,
]);

type ContentRow = {
  id: string;
  organizationId: string;
  channel: ProjectMessageContentInput['channel'];
  nativeMessageId: string;
  communicationEventId: string;
  conversationId: string;
  occurredAt: Date;
};

function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function assertImmutableIdentity(
  existing: ContentRow,
  input: ProjectMessageContentInput,
): void {
  const mismatches: string[] = [];
  if (existing.organizationId !== input.organizationId) mismatches.push('organizationId');
  if (existing.channel !== input.channel) mismatches.push('channel');
  if (existing.nativeMessageId !== input.nativeMessageId) mismatches.push('nativeMessageId');
  if (existing.communicationEventId !== input.communicationEventId) {
    mismatches.push('communicationEventId');
  }
  if (existing.conversationId !== input.conversationId) mismatches.push('conversationId');

  if (mismatches.length > 0) {
    throw new CommunicationContentIntegrityError(
      'DATA_INTEGRITY_CONFLICT',
      `idempotency key replay identity mismatch: ${mismatches.join(',')}`,
    );
  }
}

@Injectable()
export class CommunicationContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEventId(
    organizationId: string,
    communicationEventId: string,
  ) {
    return this.prisma.communicationMessageContent.findFirst({
      where: { organizationId, communicationEventId },
    });
  }

  async findByNativeMessage(
    organizationId: string,
    channel: ProjectMessageContentInput['channel'],
    nativeMessageId: string,
  ) {
    return this.prisma.communicationMessageContent.findFirst({
      where: { organizationId, channel, nativeMessageId },
    });
  }

  async projectMessageContentIdempotently(
    input: ProjectMessageContentInput,
  ): Promise<{ contentId: string; created: boolean }> {
    await this.validateProjectionContext(input);

    const idempotencyKey = buildCanonicalContentIdempotencyKey({
      organizationId: input.organizationId,
      channel: input.channel,
      nativeMessageId: input.nativeMessageId,
    });

    const existing = await this.prisma.communicationMessageContent.findFirst({
      where: {
        organizationId: input.organizationId,
        idempotencyKey,
      },
      select: {
        id: true,
        organizationId: true,
        channel: true,
        nativeMessageId: true,
        communicationEventId: true,
        conversationId: true,
        occurredAt: true,
        contentType: true,
        text: true,
      },
    });

    if (existing) {
      assertImmutableIdentity(existing, input);
      await this.convergeConversationPreviewFromRow(existing);
      return { contentId: existing.id, created: false };
    }

    const { text, truncated } = normalizeCanonicalText(input.text);
    const preview = buildMessagePreview(input.contentType, text);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.communicationMessageContent.create({
          data: {
            organizationId: input.organizationId,
            conversationId: input.conversationId,
            communicationEventId: input.communicationEventId,
            channel: input.channel,
            direction: input.direction,
            providerIdentity: input.providerIdentity ?? undefined,
            providerMessageId: input.providerMessageId ?? undefined,
            nativeMessageId: input.nativeMessageId,
            contentType: input.contentType,
            text: text ?? undefined,
            truncated,
            hasAttachments: input.hasAttachments ?? false,
            attachmentCount: input.attachmentCount ?? 0,
            occurredAt: input.occurredAt,
            idempotencyKey,
          },
          select: { id: true },
        });

        await this.bumpConversationPreview(
          {
            organizationId: input.organizationId,
            conversationId: input.conversationId,
            contentId: created.id,
            occurredAt: input.occurredAt,
            preview,
          },
          tx,
        );

        return { contentId: created.id, created: true };
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        const winner = await this.prisma.communicationMessageContent.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey },
          select: {
            id: true,
            organizationId: true,
            channel: true,
            nativeMessageId: true,
            communicationEventId: true,
            conversationId: true,
            occurredAt: true,
            contentType: true,
            text: true,
          },
        });
        if (winner) {
          assertImmutableIdentity(winner, input);
          await this.convergeConversationPreviewFromRow(winner);
          return { contentId: winner.id, created: false };
        }
      }
      throw error;
    }
  }

  async convergeConversationPreviewFromRow(
    row: ContentRow & {
      contentType: ProjectMessageContentInput['contentType'];
      text: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const preview = buildMessagePreview(row.contentType, row.text);

    await this.bumpConversationPreview(
      {
        organizationId: row.organizationId,
        conversationId: row.conversationId,
        contentId: row.id,
        occurredAt: row.occurredAt,
        preview,
      },
      tx,
    );
  }

  async bumpConversationPreview(
    input: {
      organizationId: string;
      conversationId: string;
      contentId: string;
      occurredAt: Date;
      preview: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    await client.$executeRaw`
      UPDATE communication_conversations
      SET
        last_content_at = CASE
          WHEN COALESCE(last_content_at, TIMESTAMP 'epoch') < ${input.occurredAt}
            OR (last_content_at = ${input.occurredAt} AND COALESCE(last_content_id, '') < ${input.contentId})
            THEN ${input.occurredAt}
          ELSE last_content_at
        END,
        last_content_id = CASE
          WHEN COALESCE(last_content_at, TIMESTAMP 'epoch') < ${input.occurredAt}
            OR (last_content_at = ${input.occurredAt} AND COALESCE(last_content_id, '') < ${input.contentId})
            THEN ${input.contentId}
          ELSE last_content_id
        END,
        last_message_preview = CASE
          WHEN (
            COALESCE(last_content_at, TIMESTAMP 'epoch') < ${input.occurredAt}
            OR (last_content_at = ${input.occurredAt} AND COALESCE(last_content_id, '') < ${input.contentId})
          ) AND ${input.preview} IS NOT NULL
            THEN ${input.preview}
          ELSE last_message_preview
        END,
        updated_at = NOW()
      WHERE id = ${input.conversationId}
        AND organization_id = ${input.organizationId}
    `;
  }

  private async validateProjectionContext(input: ProjectMessageContentInput): Promise<void> {
    if (!MESSAGE_CONTENT_EVENT_TYPES.has(input.eventType)) {
      throw new CommunicationContentIntegrityError(
        'INTEGRITY_REJECTED',
        'content projection requires MESSAGE_RECEIVED or MESSAGE_SENT',
      );
    }

    const event = await this.prisma.communicationEvent.findFirst({
      where: {
        id: input.communicationEventId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        conversationId: true,
        channel: true,
        eventType: true,
      },
    });

    if (!event) {
      throw new CommunicationContentIntegrityError(
        'INTEGRITY_REJECTED',
        'communication event not found for content projection',
      );
    }

    if (
      event.conversationId !== input.conversationId
      || event.channel !== input.channel
      || event.eventType !== input.eventType
    ) {
      throw new CommunicationContentIntegrityError(
        'INTEGRITY_REJECTED',
        'communication event does not match projection input',
      );
    }

    if (!MESSAGE_CONTENT_EVENT_TYPES.has(event.eventType)) {
      throw new CommunicationContentIntegrityError(
        'INTEGRITY_REJECTED',
        'communication event type cannot receive message content',
      );
    }

    const conversation = await this.prisma.communicationConversation.findFirst({
      where: {
        id: event.conversationId,
        organizationId: input.organizationId,
      },
      select: { id: true, channel: true },
    });

    if (!conversation || conversation.channel !== input.channel) {
      throw new CommunicationContentIntegrityError(
        'INTEGRITY_REJECTED',
        'conversation not found or channel mismatch',
      );
    }
  }
}
