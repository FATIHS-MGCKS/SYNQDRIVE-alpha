import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

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
}
