import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  SMS_WEBHOOK_PROCESSING_LEASE,
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
   * P2002 losers must call this instead of processing an unclaimed row.
   */
  async tryClaimProcessing(id: string): Promise<SmsWebhookProcessingClaimResult> {
    const row = await this.prisma.smsWebhookEvent.findUnique({ where: { id } });
    if (!row) {
      return { outcome: 'held_by_peer' };
    }
    if (row.processedAt) {
      return { outcome: 'already_processed' };
    }

    const claimed = await this.prisma.smsWebhookEvent.updateMany({
      where: {
        id,
        processedAt: null,
        OR: [
          { processingError: null },
          { processingError: 'processing_failed' },
          { processingError: SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE },
        ],
      },
      data: { processingError: SMS_WEBHOOK_PROCESSING_LEASE },
    });
    if (claimed.count === 1) {
      return { outcome: 'claimed' };
    }
    return { outcome: 'held_by_peer' };
  }

  markProcessed(id: string) {
    return this.prisma.smsWebhookEvent.update({
      where: { id },
      data: { processedAt: new Date(), processingError: null },
    });
  }

  markProcessingError(id: string) {
    return this.prisma.smsWebhookEvent.update({
      where: { id },
      data: { processingError: 'processing_failed' },
    });
  }

  markUnknownProviderMessage(id: string) {
    return this.prisma.smsWebhookEvent.updateMany({
      where: { id, processedAt: null },
      data: { processingError: SMS_WEBHOOK_UNKNOWN_PROVIDER_MESSAGE },
    });
  }

  releaseProcessingClaim(id: string) {
    return this.prisma.smsWebhookEvent.updateMany({
      where: {
        id,
        processedAt: null,
        processingError: SMS_WEBHOOK_PROCESSING_LEASE,
      },
      data: { processingError: null },
    });
  }
}
