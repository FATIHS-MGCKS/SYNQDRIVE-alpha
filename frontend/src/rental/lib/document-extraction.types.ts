/** Frontend mirrors of backend document-extraction public DTOs. */

export type DocumentExtractionStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'AWAITING_DOCUMENT_TYPE'
  | 'READY_FOR_REVIEW'
  | 'CONFIRMED'
  | 'APPLIED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED';

export type DocumentExtractionStage =
  | 'UPLOAD'
  | 'STORAGE'
  | 'QUEUE'
  | 'OCR'
  | 'CLASSIFICATION'
  | 'EXTRACTION'
  | 'VALIDATION'
  | 'REVIEW'
  | 'APPLY';

export type DocumentExtractionErrorPhase =
  | 'UPLOAD'
  | 'STORAGE'
  | 'QUEUE'
  | 'OCR'
  | 'CLASSIFICATION'
  | 'EXTRACTION'
  | 'VALIDATION'
  | 'APPLY'
  | 'UNKNOWN';

export type DocumentExtractionAction =
  | 'retry'
  | 'set_document_type'
  | 'reextract'
  | 'confirm'
  | 'delete_file'
  | 'download'
  | 'cancel';

export type DocumentUploadDuplicateStatus =
  | 'UNIQUE'
  | 'EXACT_DUPLICATE'
  | 'POSSIBLE_BUSINESS_DUPLICATE'
  | 'REUPLOAD_ALLOWED'
  | 'DUPLICATE_BLOCKED';

export type DocumentUploadRateLimitScope = 'organization' | 'user' | 'ip';

export type DocumentFileIdentificationStatus =
  | 'ACCEPTED'
  | 'REQUIRES_PASSWORD'
  | 'REJECTED_CORRUPT'
  | 'REJECTED_TOO_COMPLEX'
  | 'REJECTED_TOO_MANY_PAGES'
  | 'OCR_REQUIRED';

export interface UploadDuplicateEntityLinks {
  fineIds: string[];
  invoiceIds: string[];
  damageIds: string[];
  serviceEventIds: string[];
}

export interface UploadDuplicateExistingExtraction {
  id: string;
  vehicleId: string;
  organizationId: string | null;
  status: string;
  processingStage: string;
  sourceFileName: string | null;
  effectiveDocumentType: string | null;
  requestedDocumentType: string | null;
  contentSha256: string | null;
  createdAt: string;
  appliedAt: string | null;
  entityLinks: UploadDuplicateEntityLinks;
}

export interface PublicUploadDuplicate {
  status: DocumentUploadDuplicateStatus;
  relatedExtractionId: string | null;
  reuploadReason: string | null;
  existingExtraction: UploadDuplicateExistingExtraction | null;
  businessMatch: {
    matchedExtractionId: string;
    invoiceNumber?: string;
    referenceNumber?: string;
  } | null;
}

export interface DocumentExtractionMetadataOption {
  value: string;
  labelKey: string;
}

export interface DocumentExtractionMetadata {
  documentTypes: DocumentExtractionMetadataOption[];
  classificationOptions: DocumentExtractionMetadataOption[];
  mimeTypes: string[];
  extensions: string[];
  maxUploadBytes: number;
  maxUploadMb: number;
  statuses: DocumentExtractionMetadataOption[];
  stages: DocumentExtractionMetadataOption[];
  errorPhases: DocumentExtractionMetadataOption[];
  uploadDuplicateStatuses?: DocumentExtractionMetadataOption[];
}

export interface PublicVehicleDisplay {
  id: string;
  licensePlate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}

export interface PublicUploadContextDisplay {
  entityType: string;
  entityId: string;
  sourceSurface: string;
  providedAt: string;
  providedByUserId: string | null;
  confirmationStatus: 'CANDIDATE';
  label: string;
  resolverStatus: 'PENDING' | 'ALIGNED' | 'CONFLICT' | 'NO_SIGNAL';
  conflicts: Array<{
    field: string;
    message: string;
    contextValue: string | null;
    resolvedValue: string | null;
    severity: 'INFO' | 'WARNING';
  }>;
}

export interface PublicVehicleCandidate {
  vehicleId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  confirmationRequired: boolean;
}

export interface PublicBookingCandidate {
  bookingId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  temporalOverlap: boolean;
  rank: number;
  confirmationRequired: boolean;
}

export interface PublicCustomerCandidate {
  customerId: string;
  confidence: number;
  matchReasons: string[];
  conflicts: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'BLOCKER' | 'WARNING';
  }>;
  rank: number;
  confirmationRequired: boolean;
  displayLabel: string;
}

export interface PublicDocumentExtraction {
  id: string;
  vehicleId: string | null;
  organizationId: string | null;
  uploadContext: PublicUploadContextDisplay | null;
  vehicleCandidates: PublicVehicleCandidate[] | null;
  bookingCandidates: PublicBookingCandidate[] | null;
  customerCandidates: PublicCustomerCandidate[] | null;
  vehicle: PublicVehicleDisplay | null;
  status: DocumentExtractionStatus;
  processingStage: DocumentExtractionStage;
  sourceFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  requestedDocumentType: string | null;
  detectedDocumentType: string | null;
  effectiveDocumentType: string | null;
  documentType: string | null;
  classificationMode: 'MANUAL' | 'AUTO';
  classificationConfidence: number | null;
  errorPhase: DocumentExtractionErrorPhase | null;
  errorCode: string | null;
  errorMessage: string | null;
  processingAttempts: number;
  extractedData: Record<string, unknown> | null;
  plausibility: unknown;
  confirmedData: unknown;
  queuedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasStoredFile: boolean;
  allowedActions: DocumentExtractionAction[];
  uploadDuplicateStatus?: DocumentUploadDuplicateStatus | null;
  relatedExtractionId?: string | null;
  reuploadReason?: string | null;
  uploadDuplicate?: PublicUploadDuplicate | null;
}

export type PublicDocumentExtractionSummary = Omit<
  PublicDocumentExtraction,
  'extractedData' | 'confirmedData' | 'plausibility'
> & {
  extractedData: null;
  confirmedData: null;
  plausibility: null;
};

export interface DocumentExtractionListResponse {
  data: PublicDocumentExtractionSummary[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ActiveExtractionPointer {
  vehicleId: string;
  extractionId: string;
  updatedAt: string;
}
