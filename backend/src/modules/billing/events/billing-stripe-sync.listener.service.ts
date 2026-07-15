import { HttpException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingDomainEvent, BillingDomainEventType } from '../domain/billing-domain.events';
import { BillingEventPublisher } from './billing-event.publisher';
import { StripeSubscriptionOrchestratorService } from '../stripe-subscription-orchestrator.service';

const STRIPE_SYNC_LIFECYCLE_EVENT_TYPES = new Set<string>([
  BillingDomainEventType.SUBSCRIPTION_ACTIVATED,
  BillingDomainEventType.SUBSCRIPTION_CHANGED,
  BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED,
  BillingDomainEventType.SUBSCRIPTION_CANCELLED,
]);

@Injectable()
export class BillingStripeSyncListenerService implements OnModuleInit {
  private readonly logger = new Logger(BillingStripeSyncListenerService.name);

  constructor(
    private readonly publisher: BillingEventPublisher,
    private readonly orchestrator: StripeSubscriptionOrchestratorService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<boolean>('billingStripeSync.lifecycleEnabled') === false) {
      return;
    }
    this.publisher.registerListener((event) => this.handleDomainEvent(event));
  }

  async handleDomainEvent(event: BillingDomainEvent): Promise<void> {
    if (!STRIPE_SYNC_LIFECYCLE_EVENT_TYPES.has(event.type)) {
      return;
    }
    if (!event.organizationId) {
      return;
    }

    const subscriptionId =
      typeof event.payload.subscriptionId === 'string'
        ? event.payload.subscriptionId
        : event.correlationId;
    if (!subscriptionId) {
      this.logger.warn(
        `Skipping Stripe sync for ${event.type}: missing subscriptionId (org=${event.organizationId})`,
      );
      return;
    }

    try {
      await this.orchestrator.syncOrganizationSubscription({
        organizationId: event.organizationId,
        subscriptionId,
        actorUserId:
          typeof event.payload.actorUserId === 'string'
            ? event.payload.actorUserId
            : event.actorUserId ?? null,
      });
      this.logger.log(
        `Stripe subscription synced after ${event.type} (org=${event.organizationId}, sub=${subscriptionId})`,
      );
    } catch (error) {
      if (this.isStripeNotConfigured(error)) {
        this.logger.debug(
          `Stripe sync skipped after ${event.type}: Stripe not configured`,
        );
        return;
      }
      if (this.isExpectedSyncConflict(error)) {
        this.logger.warn(
          `Stripe sync deferred after ${event.type} (org=${event.organizationId}): ${this.readErrorMessage(error)}`,
        );
        return;
      }
      throw error;
    }
  }

  private isStripeNotConfigured(error: unknown): boolean {
    return error instanceof HttpException && error.getStatus() === 501;
  }

  private isExpectedSyncConflict(error: unknown): boolean {
    return error instanceof HttpException && error.getStatus() === 409;
  }

  private readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown';
  }
}
