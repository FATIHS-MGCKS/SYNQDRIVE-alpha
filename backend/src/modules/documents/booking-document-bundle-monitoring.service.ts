import { Injectable, Logger } from '@nestjs/common';
import { LEGAL_NOTIFICATION_EVENT } from '../notifications/legal-document-operational-notification.constants';
import { LegalDocumentOperationalNotificationService } from '../notifications/legal-document-operational-notification.service';

@Injectable()
export class BookingDocumentBundleMonitoringService {
  private readonly logger = new Logger(BookingDocumentBundleMonitoringService.name);

  constructor(
    private readonly operationalNotifications: LegalDocumentOperationalNotificationService,
  ) {}

  recordPointerMappingMissing(input: {
    organizationId: string;
    bookingId: string;
    documentType: string;
  }): void {
    this.logger.error(
      `ALERT: Booking bundle pointer mapping missing — org=${input.organizationId} booking=${input.bookingId} documentType=${input.documentType}`,
    );
    void this.operationalNotifications
      .syncTechnicalAlert({
        organizationId: input.organizationId,
        eventType: LEGAL_NOTIFICATION_EVENT.TECH_UNMAPPED_DOCUMENT_TYPE,
        documentType: input.documentType,
        bookingId: input.bookingId,
        detail: 'Bundle pointer mapping missing for document type',
        sourceRef: `bundle-pointer:${input.bookingId}:${input.documentType}`,
      })
      .catch(() => undefined);
  }

  recordResolverConflict(input: {
    organizationId: string;
    bookingId: string;
    conflicts: Array<{ documentType: string; code: string; message: string }>;
  }): void {
    this.logger.error(
      `ALERT: Booking bundle legal resolver conflict — org=${input.organizationId} booking=${input.bookingId} conflicts=${JSON.stringify(input.conflicts)}`,
    );
    void this.operationalNotifications
      .syncTechnicalAlert({
        organizationId: input.organizationId,
        eventType: LEGAL_NOTIFICATION_EVENT.TECH_RESOLVER_CONFLICT_UNRESOLVABLE,
        bookingId: input.bookingId,
        detail: JSON.stringify(input.conflicts),
        sourceRef: `resolver-conflict:${input.bookingId}`,
      })
      .catch(() => undefined);
  }

  recordMissingMandatorySelection(input: {
    organizationId: string;
    bookingId: string;
    documentType: string;
    reason: string;
  }): void {
    this.logger.warn(
      `Booking bundle missing mandatory legal selection — org=${input.organizationId} booking=${input.bookingId} documentType=${input.documentType} reason=${input.reason}`,
    );
  }
}
