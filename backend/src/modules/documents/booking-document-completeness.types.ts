import type { BookingDocumentPhase } from './booking-document-phase.util';
import type { BundleCompletenessReasonCode, BundleCompletenessStatus } from './booking-document-completeness.constants';
import type { BundleStatus, DocumentType } from './documents.constants';
import type { MissingBookingDocumentSlot } from './booking-document-task.types';

export interface BundleCompletenessReason {
  code: BundleCompletenessReasonCode;
  message: string;
  documentType?: DocumentType;
  blocking: boolean;
}

export interface BundleCompletenessMissingItem {
  documentType: DocumentType;
  humanReadableLabel: string;
  reason: 'not_generated' | 'generation_failed' | 'configuration_problem' | 'integrity_failed' | 'scan_failed';
  blocking: boolean;
  scopeExempt: boolean;
}

export interface BundleLegalSlotCompleteness {
  documentType: DocumentType;
  required: boolean;
  present: boolean;
  scopeExempt: boolean;
  generatedDocumentId: string | null;
  legalDocumentId: string | null;
  integrityStatus: string | null;
  scanStatus: string | null;
}

export interface BundlePhaseCompleteness {
  phase: BookingDocumentPhase;
  requiredTypes: DocumentType[];
  presentTypes: DocumentType[];
  missingDocuments: MissingBookingDocumentSlot[];
}

export interface BundleCompletenessResult {
  status: BundleCompletenessStatus;
  /** Persisted bundle row status — derived from completeness, never computed elsewhere. */
  legacyBundleStatus: BundleStatus;
  missingItems: BundleCompletenessMissingItem[];
  blockingReasons: BundleCompletenessReason[];
  nonBlockingWarnings: BundleCompletenessReason[];
  evaluatedAt: string;
  resolverVersion: string | null;
  affectedDocumentTypes: DocumentType[];
  phases: BundlePhaseCompleteness[];
  legal: {
    terms: BundleLegalSlotCompleteness;
    consumer: BundleLegalSlotCompleteness;
    privacy: BundleLegalSlotCompleteness;
  };
  orgConfigurationGaps: DocumentType[];
  cumulativeRequiredTypes: DocumentType[];
  presentTypes: DocumentType[];
}

export interface GeneratedDocumentCompletenessRow {
  id: string;
  documentType: string;
  status: string;
  legalDocumentId: string | null;
  sentAt: Date | null;
}

export interface LegalDocumentCompletenessRow {
  id: string;
  documentType: string;
  integrityStatus: string | null;
  integrityUnavailable: boolean;
  scanStatus: string | null;
}

export interface HandoverCompletenessRow {
  kind: string;
  documentsAcknowledged: boolean;
}

export interface DeliveryProofRow {
  generatedDocumentId: string;
  emailStatus: string;
}

export interface BookingDocumentCompletenessContext {
  organizationId: string;
  bookingId: string;
  bookingStatus: string;
  bundle: {
    termsDocumentId: string | null;
    withdrawalDocumentId: string | null;
    privacyDocumentId: string | null;
    bookingInvoiceDocumentId: string | null;
    depositReceiptDocumentId: string | null;
    rentalContractDocumentId: string | null;
    pickupProtocolDocumentId: string | null;
    returnProtocolDocumentId: string | null;
    finalInvoiceDocumentId: string | null;
  } | null;
  generatedDocuments: GeneratedDocumentCompletenessRow[];
  legalDocumentsById: Map<string, LegalDocumentCompletenessRow>;
  resolverVersion: string | null;
  resolverConflicts: Array<{ documentType: string; reason: string }>;
  resolverMissingMandatory: Array<{ documentType: string; reason: string }>;
  resolverSelectedTypes: DocumentType[];
  handoverProtocols: HandoverCompletenessRow[];
  deliveryProofs: DeliveryProofRow[];
  generationError: string | null;
  evaluatedAt?: string;
  /** Document types with an active org legal template (for scope-exempt evaluation). */
  orgActiveLegalTypes: DocumentType[];
}
