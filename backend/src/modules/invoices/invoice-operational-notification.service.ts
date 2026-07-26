import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceType,
} from '@modules/notifications/notification.enums';
import { buildCandidateFromRegistry } from '@modules/notifications/registry/notification-event-registry';

@Injectable()
export class InvoiceOperationalNotificationService {
  private readonly logger = new Logger(InvoiceOperationalNotificationService.name);

  constructor(
    private readonly notificationCore: NotificationCoreService,
    private readonly prisma: PrismaService,
  ) {}

  async syncOverdueInvoice(organizationId: string, invoiceId: string): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: {
        id: true,
        invoiceNumberDisplay: true,
        status: true,
      },
    });
    if (!invoice || invoice.status !== 'OVERDUE') return;

    const invoiceRef = invoice.invoiceNumberDisplay?.trim() || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;

    try {
      const candidate = buildCandidateFromRegistry({
        organizationId,
        eventType: 'INVOICE_OVERDUE',
        entityType: NotificationEntityType.INVOICE,
        entityId: invoiceId,
        sourceType: NotificationSourceType.SYSTEM,
        sourceEventId: `rental-invoice:overdue:${invoiceId}`,
        sourceRef: `rental-invoice:overdue:${invoiceId}`,
        occurredAt: new Date(),
        severity: NotificationSeverity.WARNING,
        templateParams: { invoiceRef },
        actionTargetContext: { invoiceId },
        metadata: { correlationId: 'rental-invoice-overdue' },
      });
      await this.notificationCore.ingestCandidate(candidate);
    } catch (err: unknown) {
      this.logger.warn(
        `Rental invoice overdue notification failed (${invoiceId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async resolvePaidInvoice(organizationId: string, invoiceId: string): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { id: true, invoiceNumberDisplay: true },
    });
    if (!invoice) return;

    const invoiceRef = invoice.invoiceNumberDisplay?.trim() || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;

    try {
      const candidate = buildCandidateFromRegistry({
        organizationId,
        eventType: 'INVOICE_OVERDUE',
        entityType: NotificationEntityType.INVOICE,
        entityId: invoiceId,
        sourceType: NotificationSourceType.SYSTEM,
        sourceEventId: `rental-invoice:paid:${invoiceId}`,
        sourceRef: `rental-invoice:paid:${invoiceId}`,
        occurredAt: new Date(),
        severity: NotificationSeverity.SUCCESS,
        templateParams: { invoiceRef },
        actionTargetContext: { invoiceId },
        metadata: { correlationId: 'rental-invoice-paid', cleared: true },
      });
      await this.notificationCore.ingestCandidate(candidate);
    } catch (err: unknown) {
      this.logger.warn(
        `Rental invoice resolve notification failed (${invoiceId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
