import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildCanonicalContentIdempotencyKey } from './communication-content-idempotency';
import { buildMessagePreview, normalizeCanonicalText } from './communication-content.mapper';
import type { ProjectMessageContentInput } from './communication-content.types';

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
    tx?: Prisma.TransactionClient,
  ): Promise<{ contentId: string; created: boolean }> {
    const client = tx ?? this.prisma;
    const idempotencyKey = buildCanonicalContentIdempotencyKey({
      organizationId: input.organizationId,
      channel: input.channel,
      nativeMessageId: input.nativeMessageId,
    });

    const existing = await client.communicationMessageContent.findFirst({
      where: {
        organizationId: input.organizationId,
        idempotencyKey,
      },
      select: { id: true },
    });
    if (existing) {
      return { contentId: existing.id, created: false };
    }

    const { text, truncated } = normalizeCanonicalText(input.text);
    const preview = buildMessagePreview(input.contentType, text);

    const created = await client.communicationMessageContent.create({
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
      client,
    );

    return { contentId: created.id, created: true };
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
    if (!input.preview) return;

    await client.$executeRaw`
      UPDATE communication_conversations
      SET
        last_message_preview = CASE
          WHEN COALESCE(last_content_at, TIMESTAMP 'epoch') <= ${input.occurredAt}
            THEN ${input.preview}
          ELSE last_message_preview
        END,
        last_content_id = CASE
          WHEN COALESCE(last_content_at, TIMESTAMP 'epoch') <= ${input.occurredAt}
            THEN ${input.contentId}
          ELSE last_content_id
        END,
        last_content_at = GREATEST(COALESCE(last_content_at, TIMESTAMP 'epoch'), ${input.occurredAt}),
        updated_at = NOW()
      WHERE id = ${input.conversationId}
        AND organization_id = ${input.organizationId}
    `;
  }
}
