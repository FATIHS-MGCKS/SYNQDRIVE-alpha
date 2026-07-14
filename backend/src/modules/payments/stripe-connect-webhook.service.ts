import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StripeConnectWebhookProcessingStatus } from '@prisma/client';
import Stripe from 'stripe';
import { createHash } from 'crypto';
import type { StripeConnectWebhookEvent } from '@prisma/client';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { StripeConnectWebhookProcessorService } from './stripe-connect-webhook.processor';
import { getStripeConnectClient, inferStripeLiveMode } from './stripe/stripe-connect-client.util';
import { StripeModeMismatchError } from './stripe/stripe-connect.errors';
import { PaymentMetricsService } from './observability/payment-metrics.service';
import { formatPaymentLogPayload } from './utils/payment-log.util';
import {
  buildSafeConnectWebhookEventData,
  extractConnectedAccountId,
  extractProviderObjectId,
  isMvpConnectWebhookEventType,
} from './stripe-connect-webhook.util';

export interface ConnectWebhookIngestResult {
  received: boolean;
  duplicate: boolean;
  eventId: string;
  type: string;
  status:
    | 'stored'
    | 'skipped_duplicate'
    | 'unresolved_account'
    | 'ignored_event_type';
  organizationId: string | null;
}

@Injectable()
export class StripeConnectWebhookService {
  private readonly logger = new Logger(StripeConnectWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookEventRepository: StripeConnectWebhookEventRepository,
    private readonly organizationPaymentAccountRepository: OrganizationPaymentAccountRepository,
    private readonly processorService: StripeConnectWebhookProcessorService,
    private readonly paymentMetrics: PaymentMetricsService,
  ) {}

  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const webhookSecret = this.configService.get<string>('stripe.connectWebhookSecret');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe Connect webhook secret is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const secretKey = this.configService.get<string>('stripe.secretKey') ?? '';
    const stripe = getStripeConnectClient(secretKey);
    if (!stripe) {
      throw new BadRequestException('Stripe is not configured');
    }

    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid signature';
      throw new BadRequestException(
        `Stripe Connect webhook signature verification failed: ${message}`,
      );
    }
  }

  private hashPayload(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  private assertLiveModeAllowed(event: Stripe.Event): void {
    const secretKey = this.configService.get<string>('stripe.secretKey') ?? '';
    const platformLiveMode = inferStripeLiveMode(secretKey);
    if (event.livemode !== platformLiveMode) {
      throw new StripeModeMismatchError();
    }
  }

  private resolveInitialProcessingStatus(params: {
    organizationId: string | null;
    eventType: string;
  }): StripeConnectWebhookProcessingStatus {
    if (!params.organizationId) {
      return StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT;
    }
    if (!isMvpConnectWebhookEventType(params.eventType)) {
      return StripeConnectWebhookProcessingStatus.IGNORED;
    }
    return StripeConnectWebhookProcessingStatus.RECEIVED;
  }

  async ingestRawWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<ConnectWebhookIngestResult> {
    const event = this.constructEvent(rawBody, signature);
    this.assertLiveModeAllowed(event);

    const existing = await this.webhookEventRepository.findByStripeEventId(event.id);
    if (existing) {
      return {
        received: true,
        duplicate: true,
        eventId: event.id,
        type: event.type,
        status: 'skipped_duplicate',
        organizationId: existing.organizationId,
      };
    }

    const stripeConnectedAccountId = extractConnectedAccountId(event);
    const paymentAccount = stripeConnectedAccountId
      ? await this.organizationPaymentAccountRepository.findByStripeConnectedAccountId(
          stripeConnectedAccountId,
        )
      : null;
    const organizationId = paymentAccount?.organizationId ?? null;

    const processingStatus = this.resolveInitialProcessingStatus({
      organizationId,
      eventType: event.type,
    });

    const payloadHash = this.hashPayload(rawBody);
    const safeEventData = buildSafeConnectWebhookEventData(event);

    let stored: StripeConnectWebhookEvent;
    try {
      stored = await this.webhookEventRepository.create({
        stripeEventId: event.id,
        eventType: event.type,
        livemode: event.livemode,
        stripeConnectedAccountId,
        organizationId,
        objectId: extractProviderObjectId(event),
        payloadHash,
        safeEventData,
        processingStatus,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const raced = await this.webhookEventRepository.findByStripeEventId(event.id);
        if (raced) {
          return {
            received: true,
            duplicate: true,
            eventId: event.id,
            type: event.type,
            status: 'skipped_duplicate',
            organizationId: raced.organizationId,
          };
        }
      }

      this.logger.error(
        `Failed to persist Connect webhook ${event.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('Temporary failure storing Connect webhook event');
    }

    if (processingStatus === StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT) {
      this.paymentMetrics.unknownConnectedAccount.inc();
      this.logger.warn(
        formatPaymentLogPayload(
          'CONNECT_WEBHOOK_UNRESOLVED_ACCOUNT',
          { connectedAccountId: stripeConnectedAccountId ?? undefined, stripeEventId: event.id },
        ),
      );
      return {
        received: true,
        duplicate: false,
        eventId: event.id,
        type: event.type,
        status: 'unresolved_account',
        organizationId: null,
      };
    }

    if (processingStatus === StripeConnectWebhookProcessingStatus.IGNORED) {
      return {
        received: true,
        duplicate: false,
        eventId: event.id,
        type: event.type,
        status: 'ignored_event_type',
        organizationId,
      };
    }

    await this.processorService.enqueueForProcessing(stored);

    return {
      received: true,
      duplicate: false,
      eventId: event.id,
      type: event.type,
      status: 'stored',
      organizationId,
    };
  }
}
