import { Injectable } from '@nestjs/common';
import { BookingDocumentBundleService } from '../booking-document-bundle.service';
import type {
  CoreBookingDocumentBundleView,
  CoreBookingDocumentBundleViewPort,
} from '@modules/platform-channels/ports/core-booking-document-bundle-view.port';

@Injectable()
export class CoreBookingDocumentBundleViewAdapter implements CoreBookingDocumentBundleViewPort {
  constructor(private readonly bookingDocumentBundle: BookingDocumentBundleService) {}

  async getBundleView(
    organizationId: string,
    bookingId: string,
  ): Promise<CoreBookingDocumentBundleView> {
    const view = await this.bookingDocumentBundle.getBundleView(organizationId, bookingId);
    return {
      bundleStatus: view.bundle.status,
      missingLegalDocuments: view.missingLegalDocuments,
      legalMissing: view.legal.missing,
      warnings: view.warnings,
    };
  }
}