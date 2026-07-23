import type {
  LegalAcknowledgmentMethod,
  LegalDeliveryChannel,
  LegalDeliveryStatus,
} from './legal-document-delivery-evidence.constants';

/**
 * Minimal recipient snapshot — data minimization; no document content.
 * Used to prove who received the legal text at presentation time.
 */
export interface LegalDocumentRecipientSnapshot {
  customerId: string;
  displayName?: string | null;
  email?: string | null;
  language?: string | null;
  country?: string | null;
}

export interface RecordLegalDocumentPresentationInput {
  organizationId: string;
  bookingId: string;
  customerId: string;
  legalDocumentId: string;
  generatedDocumentId: string;
  deliveryChannel: LegalDeliveryChannel;
  recipientSnapshot: LegalDocumentRecipientSnapshot;
  requestId?: string | null;
  outboundEmailId?: string | null;
}

export interface UpdateLegalDocumentDeliveryStatusInput {
  organizationId: string;
  evidenceId: string;
  deliveryStatus: LegalDeliveryStatus;
  deliveredAt?: Date | null;
  outboundEmailId?: string | null;
}

export interface RecordLegalDocumentAcknowledgmentInput {
  organizationId: string;
  evidenceId: string;
  acknowledgmentMethod: LegalAcknowledgmentMethod;
  signatureReference?: string | null;
}

export interface LegalDocumentDeliveryEvidenceActor {
  userId: string | null;
}
