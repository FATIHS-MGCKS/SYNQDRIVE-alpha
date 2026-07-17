import {
  DocumentExtractionClassificationMode,
  DocumentExtractionErrorPhase,
  DocumentExtractionStage,
  DocumentExtractionStatus,
  DocumentExtractionType,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import {
  ApplyDocumentExtractionType,
  AUTO_CLASSIFICATION_REQUEST,
  isApplyDocumentType,
} from './document-extraction.schemas';

/** Machine-readable extraction error codes surfaced to clients (never raw stack traces). */
export const DOCUMENT_EXTRACTION_ERROR_CODES = {
  NO_STORED_FILE: 'NO_STORED_FILE',
  FILE_EMPTY: 'FILE_EMPTY',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  MIME_UNSUPPORTED: 'MIME_UNSUPPORTED',
  MIME_MISMATCH: 'MIME_MISMATCH',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  PDF_TEXT_EXTRACTION_FAILED: 'PDF_TEXT_EXTRACTION_FAILED',
  OCR_FAILED: 'OCR_FAILED',
  OCR_EMPTY_RESULT: 'OCR_EMPTY_RESULT',
  OCR_NOT_CONFIGURED: 'OCR_NOT_CONFIGURED',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  CLASSIFICATION_REQUIRED: 'CLASSIFICATION_REQUIRED',
  CLASSIFICATION_FAILED: 'CLASSIFICATION_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  QUEUE_UNAVAILABLE: 'QUEUE_UNAVAILABLE',
  APPLY_FAILED: 'APPLY_FAILED',
  MALWARE_DETECTED: 'MALWARE_DETECTED',
  MALWARE_SCAN_FAILED: 'MALWARE_SCAN_FAILED',
  MALWARE_SCAN_PENDING: 'MALWARE_SCAN_PENDING',
  UNKNOWN: 'UNKNOWN',
} as const;

export type DocumentExtractionErrorCode =
  (typeof DOCUMENT_EXTRACTION_ERROR_CODES)[keyof typeof DOCUMENT_EXTRACTION_ERROR_CODES];

export function isAutoClassificationRequest(
  value: DocumentExtractionType | string | null | undefined,
): boolean {
  return value === AUTO_CLASSIFICATION_REQUEST;
}

/** Effective business document type — never AUTO. */
export function resolveEffectiveDocumentType(record: {
  effectiveDocumentType?: DocumentExtractionType | null;
  documentType?: DocumentExtractionType | null;
}): ApplyDocumentExtractionType | null {
  const candidate = record.effectiveDocumentType ?? record.documentType ?? null;
  if (!candidate || isAutoClassificationRequest(candidate)) {
    return null;
  }
  return candidate as ApplyDocumentExtractionType;
}

/** Throws when the record has no resolved apply-safe document type. */
export function requireApplyDocumentType(record: {
  effectiveDocumentType?: DocumentExtractionType | null;
  documentType?: DocumentExtractionType | null;
}): ApplyDocumentExtractionType {
  const effective = resolveEffectiveDocumentType(record);
  if (!effective || !isApplyDocumentType(effective)) {
    throw new BadRequestException(
      'Document type is not resolved — select a document type before continuing',
    );
  }
  return effective;
}

export function deriveClassificationMode(
  requestedType: DocumentExtractionType | string,
): DocumentExtractionClassificationMode {
  return isAutoClassificationRequest(requestedType) ? 'AUTO' : 'MANUAL';
}

export function mapStatusToDefaultStage(status: DocumentExtractionStatus): DocumentExtractionStage {
  switch (status) {
    case 'APPLIED':
    case 'PARTIALLY_APPLIED':
      return 'APPLY';
    case 'CONFIRMED':
    case 'READY_FOR_REVIEW':
    case 'REJECTED':
      return 'REVIEW';
    case 'AWAITING_DOCUMENT_TYPE':
      return 'CLASSIFICATION';
    case 'FAILED':
      return 'EXTRACTION';
    case 'CANCELLED':
      return 'REVIEW';
    case 'PROCESSING':
      return 'EXTRACTION';
    case 'QUEUED':
    case 'PENDING':
      return 'QUEUE';
    default:
      return 'UPLOAD';
  }
}

export function errorPhaseForStage(stage: DocumentExtractionStage): DocumentExtractionErrorPhase {
  if (stage === 'UPLOAD') return 'UPLOAD';
  if (stage === 'STORAGE') return 'STORAGE';
  if (stage === 'QUEUE') return 'QUEUE';
  if (stage === 'OCR') return 'OCR';
  if (stage === 'CLASSIFICATION') return 'CLASSIFICATION';
  if (stage === 'EXTRACTION') return 'EXTRACTION';
  if (stage === 'VALIDATION') return 'VALIDATION';
  if (stage === 'APPLY') return 'APPLY';
  return 'UNKNOWN';
}

export function processingStageForErrorPhase(
  phase: DocumentExtractionErrorPhase,
): DocumentExtractionStage {
  if (phase === 'UPLOAD' || phase === 'STORAGE') return 'UPLOAD';
  if (phase === 'QUEUE') return 'QUEUE';
  if (phase === 'OCR') return 'OCR';
  if (phase === 'CLASSIFICATION') return 'CLASSIFICATION';
  if (phase === 'EXTRACTION' || phase === 'VALIDATION') return 'EXTRACTION';
  if (phase === 'APPLY') return 'APPLY';
  return 'EXTRACTION';
}
