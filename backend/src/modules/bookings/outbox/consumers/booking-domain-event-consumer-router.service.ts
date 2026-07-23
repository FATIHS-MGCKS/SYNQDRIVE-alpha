import { Injectable, Logger } from '@nestjs/common';
import type { BookingDomainEventOutbox } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BookingDomainEventOutboxRepository } from '../booking-domain-event-outbox.repository';
import { BookingDomainEventConsumerService } from '../booking-domain-event-consumer.service';
import {
  BookingDomainEventStaleError,
  classifyConsumerError,
} from './booking-domain-event-consumer.errors';
import type {
  BookingDomainEventConsumerContext,
  BookingDomainEventConsumerHandler,
  BookingDomainEventConsumerResult,
} from './booking-domain-event-consumer.types';
import { BookingInvoiceConsumer } from './booking-invoice.consumer';
import { BookingDocumentBundleConsumer } from './booking-document-bundle.consumer';
import { BookingRentalAgreementConsumer } from './booking-rental-agreement.consumer';
import { BookingPickupReturnTaskConsumer } from './booking-pickup-return-task.consumer';
import { BookingNotificationConsumer } from './booking-notification.consumer';
import { BookingCustomerEmailConsumer } from './booking-customer-email.consumer';
import { BookingInternalEmailConsumer } from './booking-internal-email.consumer';
import { BookingPaymentLinkConsumer } from './booking-payment-link.consumer';

@Injectable()
export class BookingDomainEventConsumerRouterService {
  private readonly logger = new Logger(BookingDomainEventConsumerRouterService.name);
  private readonly handlers: BookingDomainEventConsumerHandler[];

  constructor(
    private readonly outboxRepo: BookingDomainEventOutboxRepository,
    private readonly envelopeService: BookingDomainEventConsumerService,
    invoice: BookingInvoiceConsumer,
    documentBundle: BookingDocumentBundleConsumer,
    rentalAgreement: BookingRentalAgreementConsumer,
    pickupReturnTasks: BookingPickupReturnTaskConsumer,
    notifications: BookingNotificationConsumer,
    customerEmail: BookingCustomerEmailConsumer,
    internalEmail: BookingInternalEmailConsumer,
    paymentLink: BookingPaymentLinkConsumer,
  ) {
    this.handlers = [
      invoice,
      documentBundle,
      rentalAgreement,
      pickupReturnTasks,
      notifications,
      customerEmail,
      internalEmail,
      paymentLink,
    ];
  }

  getHandlersForEvent(eventType: string): BookingDomainEventConsumerHandler[] {
    return this.handlers.filter((handler) => handler.supportsEvent(eventType));
  }

  async processAllConsumers(row: BookingDomainEventOutbox): Promise<void> {
    const applicable = this.getHandlersForEvent(row.eventType);
    if (applicable.length === 0) {
      this.logger.debug(`No consumers for booking event ${row.eventType}`);
      return;
    }

    const envelope = this.envelopeService.toEnvelope(row);
    const ctx: BookingDomainEventConsumerContext = {
      row,
      envelope,
      actorUserId: row.causationId,
    };

    for (const handler of applicable) {
      const existing = await this.outboxRepo.findConsumerReceipt(row.id, handler.consumerId);
      if (existing && ['SUCCEEDED', 'SKIPPED', 'STALE', 'FAILED'].includes(existing.status)) {
        continue;
      }

      const businessKey = handler.buildBusinessKey(ctx);
      const duplicate = await this.outboxRepo.findConsumerReceiptByBusinessKey(
        handler.consumerId,
        businessKey,
      );
      if (duplicate && duplicate.outboxEventId !== row.id) {
        await this.outboxRepo.recordConsumerReceipt({
          outboxEventId: row.id,
          consumerId: handler.consumerId,
          businessKey,
          status: 'SUCCEEDED',
          aggregateVersion: row.aggregateVersion,
          metadata: { deduplicatedFrom: duplicate.outboxEventId },
        });
        continue;
      }

      try {
        const result = await handler.handle(ctx);
        await this.persistResult(row, handler.consumerId, result);
      } catch (err: unknown) {
        if (err instanceof BookingDomainEventStaleError) {
          await this.persistResult(row, handler.consumerId, {
            status: 'STALE',
            businessKey,
            lastError: err.message,
            metadata: err.metadata,
          });
          continue;
        }

        const classified = classifyConsumerError(err);
        if (!classified.retryable) {
          await this.persistResult(row, handler.consumerId, {
            status: 'FAILED',
            businessKey,
            lastError: classified.message,
            metadata: { code: classified.code, ...classified.metadata },
          });
          this.logger.error(
            `Non-retryable consumer failure ${handler.consumerId} event=${row.id}: ${classified.message}`,
          );
          continue;
        }

        throw classified;
      }
    }
  }

  private async persistResult(
    row: BookingDomainEventOutbox,
    consumerId: string,
    result: BookingDomainEventConsumerResult,
  ) {
    await this.outboxRepo.recordConsumerReceipt({
      outboxEventId: row.id,
      consumerId,
      businessKey: result.businessKey,
      status: result.status,
      aggregateVersion: row.aggregateVersion,
      lastError: result.lastError ?? null,
      metadata: (result.metadata ?? null) as Prisma.InputJsonValue | null,
    });
  }
}
