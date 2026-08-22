import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  SMS_WEBHOOK_PROCESSING_LEASE,
  SMS_WEBHOOK_PROCESSING_LEASE_MS,
  SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE,
} from '../sms.constants';

export type SmsWebhookProcessingClaimResult =
  | { outcome: 'claimed' }
  | { outcome: 'already_processed' }
  | { outcome: 'held_by_peer' };

@Injectable()
export class SmsWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByExternalEventId(externalEventId: string) {
    return this.prisma.smsWebhookEvent.findUnique({ where: { externalEventId } });
  }

  async beginProcessing(input: {
    organizationId: string;
    webhookEndpointId?: string | null;
    externalEventId: string;
    eventType?: string | null;
    signatureValid: boolean;
  }) {
    try {
      return await this.prisma.smsWebhookEvent.create({
        data: {
          organizationId: input.organizationId,
          webhookEndpointId: input.webhookEndpointId ?? null,
          externalEventId: input.externalEventId,
          eventType: input.eventType ?? null,
          signatureValid: input.signatureValid,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.smsWebhookEvent.findUniqueOrThrow({
          where: { externalEventId: input.externalEventId },
        });
      }
      throw err;
    }
  }

  /**
   * Atomically acquire a single processing owner for one externalEventId.
   * Uses processingClaimedAt + SMS_WEBHOOK_PROCESSING_LEASE_MS for stale in_progress reclaim.
   */
  async tryClaimProcessing(id: string, now = new Date()): Promise<SmsWebhookProcessingClaimResult> {
    const staleBefore = new Date(now.getTime() - SMS_WEBHOOK_PROCESSING_LEASE_MS);

    const claimed = await this.prisma.smsWebhookEvent.updateMany({
      where: {
        id,
        processedAt: null,
        OR: [
          { processingError: null },
          { processingError: 'processing_failed' },
          { processingError: SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE },
          {
            processingError: SMS_WEBHOOK_PROCESSING_LEASE,
            OR: [{ processingClaimedAt: null }, { processingClaimedAt: { lt: staleBefore } }],
          },
        ],
      },
      data: {
        processingError: SMS_WEBHOOK_PROCESSING_LEASE,
        processingClaimedAt: now,
      },
    });
    if (claimed.count === 1) {
      return { outcome: 'claimed' };
    }

    const row = await this.prisma.smsWebhookEvent.findUnique({ where: { id } });
    if (!row) {
      return { outcome: 'held_by_peer' };
    }
    if (row.processedAt) {
      return { outcome: 'already_processed' };
    }
    return { outcome: 'held_by_peer' };
  }

  markProcessed(id: string) {
    return this.prisma.smsWebhookEvent.updateMany({
      where: { id, processedAt: null },
      data: {
        processedAt: new Date(),
        processingError: null,
        processingClaimedAt: null,
      },
    });
  }

  markProcessingError(id: string) {
    return this.prisma.smsWebhookEvent.updateMany({
      where: { id, processedAt: null },
      data: {
        processingError: 'processing_failed',
        processingClaimedAt: null,
      },
    });
  }

  markUnknownProviderMessage(id: string) {
    return this.prisma.smsWebhookEvent.updateMany({
      where: { id, processedAt: null },
      data: {
        processingError: SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE,
        processingClaimedAt: null,
      },
    });
  }
}
