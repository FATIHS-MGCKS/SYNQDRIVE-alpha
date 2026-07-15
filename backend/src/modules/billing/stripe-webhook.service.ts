import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StripeWebhookEventStatus } from '@prisma/client';
import Stripe from 'stripe';
import { createHash } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from './stripe-client.util';
import { StripeWebhookDispatcherService } from './stripe-webhook-dispatcher.service';
import {
  isSupportedStripeBillingWebhookEvent,
} from './domain/stripe-webhook-matrix';
import {
  buildSafeStripeWebhookPayload,
  extractStripeObjectId,
  sanitizeSafePayload,
} from './stripe-webhook.util';

export interface StripeWebhookIngestResult {
  received: boolean;
  duplicate: boolean;
  eventId: string;
  type: string;
  status:
    | 'processed'
    | 'ignored'
    | 'skipped_processed'
    | 'unresolved_mapping'
    | 'failed';
  organizationId?: string | null;
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dispatcher: StripeWebhookDispatcherService,
  ) {}

  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const stripe = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!stripe) {
      throw new BadRequestException('Stripe is not configured');
    }

    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid signature';
      throw new BadRequestException(`Stripe webhook signature verification failed: ${message}`);
    }
  }

  private hashPayload(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  private mapOutcomeToStatus(
    outcome: 'processed' | 'ignored' | 'unresolved_mapping',
  ): StripeWebhookEventStatus {
    switch (outcome) {
      case 'ignored':
        return StripeWebhookEventStatus.IGNORED;
      case 'unresolved_mapping':
        return StripeWebhookEventStatus.UNRESOLVED_MAPPING;
      default:
        return StripeWebhookEventStatus.PROCESSED;
    }
  }

  private mapOutcomeToResponseStatus(
    outcome: 'processed' | 'ignored' | 'unresolved_mapping',
  ): StripeWebhookIngestResult['status'] {
    switch (outcome) {
      case 'ignored':
        return 'ignored';
      case 'unresolved_mapping':
        return 'unresolved_mapping';
      default:
        return 'processed';
    }
  }

  async ingestRawWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<StripeWebhookIngestResult> {
    const event = this.constructEvent(rawBody, signature);
    const payloadHash = this.hashPayload(rawBody);
    const organizationId = await this.dispatcher.resolveOrganizationId(event);
    const safePayload = sanitizeSafePayload(
      buildSafeStripeWebhookPayload(event, organizationId),
    );

    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existing?.status === StripeWebhookEventStatus.PROCESSED) {
      return {
        received: true,
        duplicate: true,
        eventId: event.id,
        type: event.type,
        status: 'skipped_processed',
        organizationId: existing.organizationId,
      };
    }

    const isRetry = Boolean(existing);
    const stored = await this.ensureStoredEvent({
      event,
      payloadHash,
      safePayload,
      organizationId,
      isRetry,
      existingRetryCount: existing?.retryCount ?? 0,
    });

    if (!isSupportedStripeBillingWebhookEvent(event.type)) {
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: StripeWebhookEventStatus.IGNORED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
      return {
        received: true,
        duplicate: false,
        eventId: event.id,
        type: event.type,
        status: 'ignored',
        organizationId: stored.organizationId,
      };
    }

    try {
      const result = await this.dispatcher.dispatch({ event, organizationId });
      const status = this.mapOutcomeToStatus(result.outcome);

      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status,
          organizationId: result.organizationId ?? organizationId,
          processedAt: new Date(),
          errorMessage: result.message ?? null,
        },
      });

      return {
        received: true,
        duplicate: false,
        eventId: event.id,
        type: event.type,
        status: this.mapOutcomeToResponseStatus(result.outcome),
        organizationId: result.organizationId ?? organizationId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook processing failed';
      this.logger.warn(`Stripe webhook ${event.id} (${event.type}) failed: ${message}`);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: StripeWebhookEventStatus.FAILED,
          errorMessage: message.slice(0, 500),
          retryCount: (stored.retryCount ?? 0) + 1,
        },
      });
      throw err;
    }
  }

  private async ensureStoredEvent(input: {
    event: Stripe.Event;
    payloadHash: string;
    safePayload: Record<string, unknown>;
    organizationId: string | null;
    isRetry: boolean;
    existingRetryCount: number;
  }): Promise<{ retryCount: number; organizationId: string | null }> {
    if (input.isRetry) {
      return this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: input.event.id },
        data: {
          type: input.event.type,
          payloadHash: input.payloadHash,
          safePayload: input.safePayload as Prisma.InputJsonValue,
          organizationId: input.organizationId,
          stripeObjectId: extractStripeObjectId(input.event),
          eventCreatedAt: new Date(input.event.created * 1000),
          retryCount: input.existingRetryCount + 1,
          status: StripeWebhookEventStatus.RECEIVED,
          errorMessage: null,
        },
      });
    }

    try {
      return await this.prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: input.event.id,
          type: input.event.type,
          status: StripeWebhookEventStatus.RECEIVED,
          organizationId: input.organizationId,
          stripeObjectId: extractStripeObjectId(input.event),
          payloadHash: input.payloadHash,
          safePayload: input.safePayload as Prisma.InputJsonValue,
          eventCreatedAt: new Date(input.event.created * 1000),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.stripeWebhookEvent.findUnique({
          where: { stripeEventId: input.event.id },
        });
        if (raced?.status === StripeWebhookEventStatus.PROCESSED) {
          return raced;
        }
        return this.ensureStoredEvent({
          ...input,
          isRetry: true,
          existingRetryCount: raced?.retryCount ?? 0,
        });
      }
      throw error;
    }
  }
}
