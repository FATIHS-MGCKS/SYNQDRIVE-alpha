import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StripeConnectWebhookEvent,
  StripeConnectWebhookProcessingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateStripeConnectWebhookEventInput {
  stripeEventId: string;
  eventType: string;
  livemode?: boolean;
  stripeConnectedAccountId?: string | null;
  organizationId?: string | null;
  objectId?: string | null;
  payloadHash?: string | null;
  safeEventData?: Prisma.InputJsonValue;
  processingStatus?: StripeConnectWebhookProcessingStatus;
}

export interface UpdateStripeConnectWebhookEventInput {
  processingStatus?: StripeConnectWebhookProcessingStatus;
  attempts?: number;
  processedAt?: Date | null;
  errorMessage?: string | null;
  organizationId?: string | null;
}

@Injectable()
export class StripeConnectWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByStripeEventId(stripeEventId: string): Promise<StripeConnectWebhookEvent | null> {
    return this.prisma.stripeConnectWebhookEvent.findUnique({
      where: { stripeEventId },
    });
  }

  findById(id: string): Promise<StripeConnectWebhookEvent | null> {
    return this.prisma.stripeConnectWebhookEvent.findUnique({
      where: { id },
    });
  }

  create(data: CreateStripeConnectWebhookEventInput): Promise<StripeConnectWebhookEvent> {
    return this.prisma.stripeConnectWebhookEvent.create({
      data: {
        stripeEventId: data.stripeEventId,
        eventType: data.eventType,
        livemode: data.livemode ?? false,
        stripeConnectedAccountId: data.stripeConnectedAccountId ?? null,
        organizationId: data.organizationId ?? null,
        objectId: data.objectId ?? null,
        payloadHash: data.payloadHash ?? null,
        safeEventData: data.safeEventData,
        processingStatus:
          data.processingStatus ?? StripeConnectWebhookProcessingStatus.RECEIVED,
      },
    });
  }

  update(
    id: string,
    data: UpdateStripeConnectWebhookEventInput,
  ): Promise<StripeConnectWebhookEvent> {
    return this.prisma.stripeConnectWebhookEvent.update({
      where: { id },
      data,
    });
  }

  findPendingForReconciliation(params: {
    limit: number;
    maxAttempts: number;
    olderThan?: Date;
  }): Promise<StripeConnectWebhookEvent[]> {
    return this.prisma.stripeConnectWebhookEvent.findMany({
      where: {
        processingStatus: {
          in: [
            StripeConnectWebhookProcessingStatus.RECEIVED,
            StripeConnectWebhookProcessingStatus.FAILED,
          ],
        },
        attempts: { lt: params.maxAttempts },
        ...(params.olderThan ? { receivedAt: { lte: params.olderThan } } : {}),
      },
      orderBy: { receivedAt: 'asc' },
      take: params.limit,
    });
  }

  countByProcessingStatus(): Promise<
    { processingStatus: StripeConnectWebhookProcessingStatus; count: number }[]
  > {
    return this.prisma.stripeConnectWebhookEvent.groupBy({
      by: ['processingStatus'],
      _count: { _all: true },
    }).then((rows) =>
      rows.map((row) => ({
        processingStatus: row.processingStatus,
        count: row._count._all,
      })),
    );
  }
}
