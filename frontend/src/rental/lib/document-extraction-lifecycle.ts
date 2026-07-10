import type { DocumentExtractionStage, DocumentExtractionStatus, PublicDocumentExtraction } from './document-extraction.types';
import type { FlowStatus } from '../components/documents/document-extraction.shared';

const TERMINAL_STATUSES: DocumentExtractionStatus[] = [
  'APPLIED',
  'FAILED',
  'CANCELLED',
  'READY_FOR_REVIEW',
  'AWAITING_DOCUMENT_TYPE',
  'REJECTED',
];

const ACTIVE_STATUSES: DocumentExtractionStatus[] = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'CONFIRMED',
];

export function isTerminalExtractionStatus(status: DocumentExtractionStatus | undefined): boolean {
  return Boolean(status && TERMINAL_STATUSES.includes(status));
}

export function isActiveExtractionStatus(status: DocumentExtractionStatus | undefined): boolean {
  return Boolean(status && ACTIVE_STATUSES.includes(status));
}

export function resolveEffectiveType(record: Pick<PublicDocumentExtraction, 'effectiveDocumentType' | 'documentType' | 'detectedDocumentType'>): string {
  return record.effectiveDocumentType || record.documentType || record.detectedDocumentType || 'OTHER';
}

export function mapServerToFlowStatus(
  status: DocumentExtractionStatus | undefined,
  stage?: DocumentExtractionStage,
): FlowStatus {
  switch (status) {
    case 'PENDING':
    case 'QUEUED':
      return 'queued';
    case 'AWAITING_DOCUMENT_TYPE':
      return 'awaiting_type';
    case 'READY_FOR_REVIEW':
      return 'ready';
    case 'CONFIRMED':
      return 'applying';
    case 'APPLIED':
      return 'done';
    case 'FAILED':
    case 'REJECTED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'PROCESSING':
      switch (stage) {
        case 'OCR':
          return 'ocr';
        case 'CLASSIFICATION':
          return 'classifying';
        case 'EXTRACTION':
          return 'extracting';
        case 'VALIDATION':
          return 'validating_plausibility';
        case 'UPLOAD':
        case 'STORAGE':
          return 'stored';
        case 'QUEUE':
          return 'queued';
        default:
          return 'processing';
      }
    default:
      return 'processing';
  }
}

/** Four high-level stepper indices: upload → analyze → review → filed */
export function getStepperIndex(flow: FlowStatus): number {
  switch (flow) {
    case 'idle':
    case 'validating':
    case 'uploading':
    case 'stored':
      return 0;
    case 'queued':
    case 'retrying':
    case 'processing':
    case 'ocr':
    case 'classifying':
    case 'extracting':
    case 'validating_plausibility':
    case 'awaiting_type':
      return 1;
    case 'ready':
    case 'applying':
    case 'failed':
      return 2;
    case 'done':
    case 'cancelled':
      return 3;
    default:
      return 0;
  }
}

export function isBusyFlow(flow: FlowStatus): boolean {
  return [
    'validating',
    'uploading',
    'stored',
    'queued',
    'retrying',
    'processing',
    'ocr',
    'classifying',
    'extracting',
    'validating_plausibility',
    'awaiting_type',
  ].includes(flow);
}

export function formatConfidencePercent(confidence: number | null | undefined): string | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
  return `${Math.max(0, Math.min(100, pct))}%`;
}
