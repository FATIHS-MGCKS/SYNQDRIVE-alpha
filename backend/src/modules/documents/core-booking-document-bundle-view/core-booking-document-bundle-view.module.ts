import { Module } from '@nestjs/common';
import { CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT } from '@modules/platform-channels/ports/core-booking-document-bundle-view.port';
import { DocumentsModule } from '../documents.module';
import { CoreBookingDocumentBundleViewAdapter } from './core-booking-document-bundle-view.adapter';

/**
 * Rental adapter binding for Core platform channels (Communication, WhatsApp).
 */
@Module({
  imports: [DocumentsModule],
  providers: [
    CoreBookingDocumentBundleViewAdapter,
    {
      provide: CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT,
      useExisting: CoreBookingDocumentBundleViewAdapter,
    },
  ],
  exports: [CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT],
})
export class CoreBookingDocumentBundleViewModule {}