import type { DocumentType } from './documents.constants';
import type { BookingDocumentPhase } from './booking-document-phase.util';

export type BookingDocumentTaskActionType = 'GENERATE' | 'UPLOAD_LEGAL' | 'RETRY' | 'REVIEW';

export type BookingDocumentMissingReason =
  | 'not_generated'
  | 'generation_failed'
  | 'configuration_problem';

export interface MissingBookingDocumentSlot {
  documentType: DocumentType;
  humanReadableLabel: string;
  reason: BookingDocumentMissingReason;
  actionType: BookingDocumentTaskActionType;
  canGenerateAutomatically: boolean;
  configurationProblem: boolean;
}

export interface SyncBookingDocumentPackageInput {
  bookingId: string;
  vehicleId: string;
  customerId: string;
  bookingStatus: string;
  phase: BookingDocumentPhase;
  missingDocuments: MissingBookingDocumentSlot[];
}
