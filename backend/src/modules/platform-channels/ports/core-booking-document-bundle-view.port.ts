import type { DocumentType } from '@modules/documents/documents.constants';

/**
 * Core-owned platform-channel projection of booking document bundle completeness.
 * Delegates to Rental `BookingDocumentBundleService.getBundleView` (may persist via getOrCreateBundle).
 */
export const CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT = Symbol(
  'CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT',
);

export interface CoreBookingDocumentBundleView {
  bundleStatus: string;
  missingLegalDocuments: string[];
  legalMissing: DocumentType[];
  warnings: string[];
}

export interface CoreBookingDocumentBundleViewPort {
  getBundleView(organizationId: string, bookingId: string): Promise<CoreBookingDocumentBundleView>;
}