import type { DocumentExtractionStatus } from '@prisma/client';

export const DOCUMENT_UPLOAD_DUPLICATE_STATUSES = [
  'UNIQUE',
  'EXACT_DUPLICATE',
  'POSSIBLE_BUSINESS_DUPLICATE',
  'REUPLOAD_ALLOWED',
  'DUPLICATE_BLOCKED',
] as const;

export type DocumentUploadDuplicateStatus = (typeof DOCUMENT_UPLOAD_DUPLICATE_STATUSES)[number];

export const ACTIVE_UPLOAD_DUPLICATE_STATUSES: DocumentExtractionStatus[] = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'AWAITING_DOCUMENT_TYPE',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
  'PARTIALLY_APPLIED',
];

export interface UploadDuplicateEntityLinks {
  fineIds: string[];
  invoiceIds: string[];
  damageIds: string[];
  serviceEventIds: string[];
}

export interface UploadDuplicateExistingExtraction {
  id: string;
  vehicleId: string | null;
  organizationId: string | null;
  status: DocumentExtractionStatus;
  processingStage: string;
  sourceFileName: string | null;
  effectiveDocumentType: string | null;
  requestedDocumentType: string | null;
  contentSha256: string | null;
  createdAt: string;
  appliedAt: string | null;
  entityLinks: UploadDuplicateEntityLinks;
}

export interface UploadDuplicateBusinessMatch {
  matchedExtractionId: string;
  invoiceNumber?: string;
  referenceNumber?: string;
}

export interface AssessUploadDuplicateInput {
  organizationId: string;
  contentSha256: string;
  reuploadReason?: string | null;
  relatedExtractionId?: string | null;
  invoiceNumberHint?: string | null;
  referenceNumberHint?: string | null;
}

export interface UploadDuplicateAssessment {
  status: DocumentUploadDuplicateStatus;
  blocked: boolean;
  relatedExtractionId?: string | null;
  reuploadReason?: string | null;
  existingExtraction?: UploadDuplicateExistingExtraction | null;
  businessMatch?: UploadDuplicateBusinessMatch | null;
}

export interface PublicUploadDuplicateDto {
  status: DocumentUploadDuplicateStatus;
  relatedExtractionId: string | null;
  reuploadReason: string | null;
  existingExtraction: UploadDuplicateExistingExtraction | null;
  businessMatch: UploadDuplicateBusinessMatch | null;
}

export interface PipelineUploadDuplicatePayload {
  status: DocumentUploadDuplicateStatus;
  relatedExtractionId?: string | null;
  businessMatch?: UploadDuplicateBusinessMatch | null;
  existingExtraction?: UploadDuplicateExistingExtraction | null;
}
