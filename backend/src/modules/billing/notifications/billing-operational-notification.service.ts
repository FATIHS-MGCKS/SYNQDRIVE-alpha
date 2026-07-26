import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceType,
} from '@modules/notifications/notification.enums';
import { buildCandidateFromRegistry } from '@modules/notifications/registry/notification-event-registry';
import { BillingDomainEvent, BillingDomainEventType } from '../domain/billing-domain.events';

const OPEN_EVENT_MAP: Partial<Record<BillingDomainEventType, 'PAYMENT_FAILED' | 'INVOICE_OVERDUE'>> = {
  [BillingDomainEventType.PAYMENT_FAILED]: 'PAYMENT_FAILED',
  [BillingDomainEventType.INVOICE_OVERDUE]: 'INVOICE_OVERDUE',
};

const RESOLVE_EVENT_TYPES = new Set<BillingDomainEventType>([
  BillingDomainEventType.PAYMENT_SUCCEEDED,
]);

@Injectable()
export class BillingOperationalNotificationService {
  private readonly logger = new Logger(BillingOperationalNotificationService.name);

  constructor(
    private readonly notificationCore: NotificationCoreService,
    private readonly prisma: PrismaService,
  ) {}

  async handleDomainEvent(event: BillingDomainEvent): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;
    if (!event.organizationId) return;

    const invoiceId = this.resolveInvoiceId(event);
    if (!invoiceId) return;

    if (RESOLVE_EVENT_TYPES.has(event.type)) {
      await this.resolveInvoiceNotifications(event.organizationId, invoiceId, event);
      return;
    }

    const notificationEventType = OPEN_EVENT_MAP[event.type as BillingDomainEventType];
    if (!notificationEventType) return;

    await this.ingestOpen(
      event.organizationId,
      invoiceId,
      notificationEventType,
      event,
    );
  }

  private resolveInvoiceId(event: BillingDomainEvent): string | null {
    const fromPayload =
      typeof event.payload.invoiceId === 'string' ? event.payload.invoiceId.trim() : '';
    if (fromPayload) return fromPayload;
    return event.correlationId?.trim() || null;
  }

  private buildSourceEventId(
    event: BillingDomainEvent,
    invoiceId: string,
    notificationEventType: string,
  ): string {
    const stripeInvoiceId =
      typeof event.payload.stripeInvoiceId === 'string'
        ? event.payload.stripeInvoiceId.trim()
        : '';
    if (stripeInvoiceId) {
      return `billing:stripe:${notificationEventType}:${stripeInvoiceId}`;
    }
    return `billing:${event.type}:${invoiceId}`;
  }

  private async resolveInvoiceRef(organizationId: string, invoiceId: string): Promise<string> {
    const billing = await this.prisma.billingInvoice.findFirst({
      where: {
        id: invoiceId,
        subscription: { organizationId },
      },
      select: { invoiceNumber: true },
    });
    if (billing?.invoiceNumber?.trim()) {
      return billing.invoiceNumber.trim();
    }
    return `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
  }

  private async ingestOpen(
    organizationId: string,
    invoiceId: string,
    notificationEventType: 'PAYMENT_FAILED' | 'INVOICE_OVERDUE',
    event: BillingDomainEvent,
  ): Promise<void> {
    const invoiceRef = await this.resolveInvoiceRef(organizationId, invoiceId);
    const severity =
      notificationEventType === 'PAYMENT_FAILED'
        ? NotificationSeverity.CRITICAL
        : NotificationSeverity.WARNING;

    try {
      const candidate = buildCandidateFromRegistry({
        organizationId,
        eventType: notificationEventType,
        entityType: NotificationEntityType.INVOICE,
        entityId: invoiceId,
        sourceType: NotificationSourceType.SYSTEM,
        sourceEventId: this.buildSourceEventId(event, invoiceId, notificationEventType),
        sourceRef: `billing:${event.type}:${invoiceId}`,
        occurredAt: event.occurredAt,
        severity,
        templateParams: { invoiceRef },
        actionTargetContext: { invoiceId },
        metadata: {
          correlationId: event.type,
        },
      });
      await this.notificationCore.ingestCandidate(candidate);
    } catch (err: unknown) {
      this.logger.warn(
        `Billing notification ingest failed (${notificationEventType}/${invoiceId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async resolveInvoiceNotifications(
    organizationId: string,
    invoiceId: string,
    event: BillingDomainEvent,
  ): Promise<void> {
    const invoiceRef = await this.resolveInvoiceRef(organizationId, invoiceId);
    for (const notificationEventType of ['PAYMENT_FAILED', 'INVOICE_OVERDUE'] as const) {
      try {
        const candidate = buildCandidateFromRegistry({
          organizationId,
          eventType: notificationEventType,
          entityType: NotificationEntityType.INVOICE,
          entityId: invoiceId,
          sourceType: NotificationSourceType.SYSTEM,
          sourceEventId: this.buildSourceEventId(event, invoiceId, notificationEventType),
          sourceRef: `billing:resolve:${event.type}:${invoiceId}`,
          occurredAt: event.occurredAt,
          severity: NotificationSeverity.SUCCESS,
          templateParams: { invoiceRef },
          actionTargetContext: { invoiceId },
          metadata: {
            correlationId: event.type,
            cleared: true,
          },
        });
        await this.notificationCore.ingestCandidate(candidate);
      } catch (err: unknown) {
        this.logger.warn(
          `Billing notification resolve failed (${notificationEventType}/${invoiceId}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
