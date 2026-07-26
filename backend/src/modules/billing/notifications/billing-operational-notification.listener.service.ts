import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BillingDomainEvent } from '../domain/billing-domain.events';
import { BillingEventPublisher } from '../events/billing-event.publisher';
import { BillingOperationalNotificationService } from './billing-operational-notification.service';

@Injectable()
export class BillingOperationalNotificationListenerService implements OnModuleInit {
  private readonly logger = new Logger(BillingOperationalNotificationListenerService.name);

  constructor(
    private readonly publisher: BillingEventPublisher,
    private readonly notifications: BillingOperationalNotificationService,
  ) {}

  onModuleInit(): void {
    this.publisher.registerListener((event) => this.handleDomainEvent(event));
  }

  async handleDomainEvent(event: BillingDomainEvent): Promise<void> {
    try {
      await this.notifications.handleDomainEvent(event);
    } catch (err: unknown) {
      this.logger.warn(
        `Billing operational notification listener failed for ${event.type}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
