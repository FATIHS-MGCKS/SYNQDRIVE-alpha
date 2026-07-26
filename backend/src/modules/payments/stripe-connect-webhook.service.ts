import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StripeConnectWebhookProcessingStatus } from '@prisma/client';
import Stripe from 'stripe';
import type { StripeConnectWebhookEvent } from '@prisma/client';
import {
  constructVerifiedStripeEvent,
  formatStripeWebhookLog,
  hashStripeWebhookPayload,
  resolveConnectWebhookIngestAction,
  STRIPE_WEBHOOK_SECURITY_ERROR,
} from '@shared/stripe/stripe-webhook-security.util';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { StripeConnectWebhookProcessorService } from './stripe-connect-webhook.processor';
import { StripeEnvironmentService } from '@shared/stripe/stripe-environment.service';
import { getStripeConnectClient } from './stripe/stripe-connect-client.util';
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
    | 'skipped_terminal'
    | 'unresolved_account'
    | 'ignored_event_type'
    | 'processed';
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
    private readonly stripeEnvironment: StripeEnvironmentService,
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

    const toleranceSeconds = this.configService.get<number>('stripe.webhookToleranceSeconds');

    try {
      return constructVerifiedStripeEvent(
        stripe,
        rawBody,
        signature,
        webhookSecret,
        toleranceSeconds,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid signature';
      throw new BadRequestException(
        `Stripe Connect webhook signature verification failed: ${message}`,
      );
    }
  }

  private assertLiveModeAllowed(event: Stripe.Event): void {
    this.stripeEnvironment.assertWebhookLivemode(event.livemode);
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

    const payloadHash = hashStripeWebhookPayload(rawBody);
    const existing = await this.webhookEventRepository.findByStripeEventId(event.id);
    const ingestAction = resolveConnectWebhookIngestAction({
      existing,
      payloadHash,
    });

    if (ingestAction === 'payload_conflict') {
      this.logger.error(
        formatStripeWebhookLog('CONNECT_PAYLOAD_HASH_MISMATCH', {
          stripeEventId: event.id,
          type: event.type,
        }),
      );
      throw new BadRequestException(STRIPE_WEBHOOK_SECURITY_ERROR.PAYLOAD_HASH_MISMATCH);
    }

    if (ingestAction === 'skip_terminal') {
      this.logger.log(
        formatStripeWebhookLog('CONNECT_SKIP_TERMINAL', {
          stripeEventId: event.id,
          type: event.type,
          status: existing!.processingStatus,
        }),
      );
      return {
        received: true,
        duplicate: true,
        eventId: event.id,
        type: event.type,
        status:
          existing!.processingStatus === StripeConnectWebhookProcessingStatus.PROCESSED
            ? 'skipped_duplicate'
            : 'skipped_terminal',
        organizationId: existing!.organizationId,
      };
    }

    const isRetry = ingestAction === 'retry';
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

    const safeEventData = buildSafeConnectWebhookEventData(event);

    let stored: StripeConnectWebhookEvent;
    if (isRetry && existing) {
      stored = await this.webhookEventRepository.update(existing.id, {
        processingStatus:
          processingStatus === StripeConnectWebhookProcessingStatus.IGNORED
            ? StripeConnectWebhookProcessingStatus.IGNORED
            : StripeConnectWebhookProcessingStatus.RECEIVED,
        attempts: existing.attempts + 1,
        errorMessage: null,
        organizationId,
        payloadHash,
        safeEventData,
        stripeConnectedAccountId,
        objectId: extractProviderObjectId(event),
        eventType: event.type,
        livemode: event.livemode,
      });
    } else {
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
            const racedAction = resolveConnectWebhookIngestAction({
              existing: raced,
              payloadHash,
            });
            if (racedAction === 'skip_terminal') {
              return {
                received: true,
                duplicate: true,
                eventId: event.id,
                type: event.type,
                status: 'skipped_duplicate',
                organizationId: raced.organizationId,
              };
            }
            return this.ingestRawWebhook(rawBody, signature);
          }
        }

        this.logger.error(
          formatStripeWebhookLog('CONNECT_STORE_FAILED', {
            stripeEventId: event.id,
            type: event.type,
            error: error instanceof Error ? error.message : 'unknown',
          }),
        );
        throw new ServiceUnavailableException('Temporary failure storing Connect webhook event');
      }
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
        duplicate: isRetry,
        eventId: event.id,
        type: event.type,
        status: 'unresolved_account',
        organizationId: null,
      };
    }

    if (processingStatus === StripeConnectWebhookProcessingStatus.IGNORED) {
      return {
        received: true,
        duplicate: isRetry,
        eventId: event.id,
        type: event.type,
        status: 'ignored_event_type',
        organizationId,
      };
    }

    await this.processorService.enqueueForProcessing(stored);

    return {
      received: true,
      duplicate: isRetry,
      eventId: event.id,
      type: event.type,
      status: 'processed',
      organizationId,
    };
  }
}
