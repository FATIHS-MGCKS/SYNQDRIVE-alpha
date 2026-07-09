import type { GeneratedDocumentDto } from '../../../lib/api';

export type SendDocumentsSourceContext =
  | 'BOOKING_DOCUMENTS'
  | 'INVOICE'
  | 'HANDOVER_PICKUP'
  | 'HANDOVER_RETURN';

export interface SendDocumentsEmailCustomer {
  email?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface SendDocumentsEmailBooking {
  bookingNumber?: string | null;
  id?: string;
}

export type DocumentSendAvailability =
  | 'available'
  | 'missing'
  | 'void'
  | 'failed'
  | 'sent'
  | 'regenerate_recommended';

export interface SendDocumentRowModel {
  documentType: string;
  label: string;
  doc: GeneratedDocumentDto | null;
  availability: DocumentSendAvailability;
  selectable: boolean;
}

export interface SendDocumentsEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  bookingId: string;
  customer?: SendDocumentsEmailCustomer | null;
  booking?: SendDocumentsEmailBooking | null;
  documents: GeneratedDocumentDto[];
  /** When set, only these document types are shown as selectable rows (incl. missing). */
  documentTypes?: string[];
  initiallySelectedDocumentIds?: string[];
  sourceContext: SendDocumentsSourceContext;
  onSent?: () => void | Promise<void>;
}
