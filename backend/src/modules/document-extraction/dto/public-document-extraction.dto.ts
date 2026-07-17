import {
  DocumentExtractionClassificationMode,
  DocumentExtractionErrorPhase,
  DocumentExtractionStage,
  DocumentExtractionStatus,
  DocumentExtractionType,
} from '@prisma/client';
import { DocumentExtractionAction } from '../document-extraction-actions.util';
import type { PublicUploadDuplicateDto } from './public-upload-duplicate.dto';

export interface PublicVehicleDisplayDto {
  id: string;
  licensePlate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
}

export interface PublicActorDto {
  id: string;
  displayName: string | null;
}

export interface PublicDocumentExtractionAuditDto {
  createdBy: PublicActorDto | null;
  confirmedBy: PublicActorDto | null;
  appliedBy: PublicActorDto | null;
  cancelledBy: PublicActorDto | null;
  fileDeletedBy: PublicActorDto | null;
  fileDeletedAt: string | null;
  typeChanges: Array<{
    from: string | null;
    to: string;
    at: string;
    userId: string | null;
    reason: string;
  }>;
  actions: Array<{
    action: string;
    at: string;
    userId: string | null;
    details?: Record<string, unknown>;
  }>;
}

export interface PublicUploadContextDisplayDto {
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

export interface PublicVehicleCandidateDto {
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

/** API-safe document extraction projection — no storage keys or internal secrets. */
export interface PublicDocumentExtractionDto {
  id: string;
  vehicleId: string | null;
  organizationId: string | null;
  uploadContextType: string | null;
  uploadContextId: string | null;
  uploadContext: PublicUploadContextDisplayDto | null;
  vehicleCandidates: PublicVehicleCandidateDto[] | null;
  vehicle: PublicVehicleDisplayDto | null;
  status: DocumentExtractionStatus;
  processingStage: DocumentExtractionStage;
  sourceFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** User-selected or AUTO request at upload time. */
  requestedDocumentType: DocumentExtractionType | null;
  /** AI-detected type after classification (when available). */
  detectedDocumentType: DocumentExtractionType | null;
  /** Resolved business type used for extraction/apply. */
  effectiveDocumentType: DocumentExtractionType | null;
  /**
   * @deprecated Prefer `effectiveDocumentType` — kept for backward-compatible clients.
   */
  documentType: DocumentExtractionType | null;
  classificationMode: DocumentExtractionClassificationMode;
  classificationConfidence: number | null;
  errorPhase: DocumentExtractionErrorPhase | null;
  errorCode: string | null;
  errorMessage: string | null;
  processingAttempts: number;
  ocrProvider: string | null;
  ocrModel: string | null;
  extractionProvider: string | null;
  extractionModel: string | null;
  ocrPageCount: number | null;
  extractedData: unknown;
  plausibility: unknown;
  confirmedData: unknown;
  queuedAt: string | null;
  processedAt: string | null;
  appliedAt: string | null;
  processingStartedAt: string | null;
  ocrCompletedAt: string | null;
  classificationCompletedAt: string | null;
  extractionCompletedAt: string | null;
  processingCompletedAt: string | null;
  nextRetryAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  serviceEventId: string | null;
  hasStoredFile: boolean;
  allowedActions: DocumentExtractionAction[];
  audit: PublicDocumentExtractionAuditDto;
  uploadDuplicateStatus: string | null;
  relatedExtractionId: string | null;
  reuploadReason: string | null;
  uploadDuplicate: PublicUploadDuplicateDto | null;
}

/** List projection — omits heavy extracted/confirmed payloads by default. */
export type PublicDocumentExtractionSummaryDto = Omit<
  PublicDocumentExtractionDto,
  'extractedData' | 'confirmedData' | 'plausibility'
> & {
  extractedData: null;
  confirmedData: null;
  plausibility: null;
};
