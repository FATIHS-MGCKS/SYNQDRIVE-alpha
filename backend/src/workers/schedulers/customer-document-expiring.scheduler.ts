import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerDocumentsService } from '@modules/customers/customer-documents.service';

/** Daily scan for customer documents approaching expiry — workflow domain events. */
@Injectable()
export class CustomerDocumentExpiringScheduler {
  private readonly logger = new Logger(CustomerDocumentExpiringScheduler.name);

  constructor(private readonly customerDocuments: CustomerDocumentsService) {}

  @Cron('15 5 * * *')
  async scheduledRun(): Promise<void> {
    const expiredCount = await this.customerDocuments.markExpiredDocuments();
    const emitted = await this.customerDocuments.emitExpiringDocumentEvents();
    if (expiredCount > 0 || emitted > 0) {
      this.logger.log(
        `Customer document expiry cron — expired=${expiredCount} expiringEvents=${emitted}`,
      );
    }
  }
}
