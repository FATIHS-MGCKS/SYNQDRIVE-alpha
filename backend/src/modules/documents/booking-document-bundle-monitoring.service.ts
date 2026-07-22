import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BookingDocumentBundleMonitoringService {
  private readonly logger = new Logger(BookingDocumentBundleMonitoringService.name);

  recordPointerMappingMissing(input: {
    organizationId: string;
    bookingId: string;
    documentType: string;
  }): void {
    this.logger.error(
      `ALERT: Booking bundle pointer mapping missing — org=${input.organizationId} booking=${input.bookingId} documentType=${input.documentType}`,
    );
  }

  recordResolverConflict(input: {
    organizationId: string;
    bookingId: string;
    conflicts: Array<{ documentType: string; code: string; message: string }>;
  }): void {
    this.logger.error(
      `ALERT: Booking bundle legal resolver conflict — org=${input.organizationId} booking=${input.bookingId} conflicts=${JSON.stringify(input.conflicts)}`,
    );
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
