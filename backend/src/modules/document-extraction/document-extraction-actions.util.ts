import { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import { resolveEffectiveDocumentType } from './document-extraction-lifecycle.util';
import { isMalwareScanDownloadAllowed } from './document-malware-scan.util';
import { isDocumentLegalHoldActive } from './document-pipeline-lifecycle.util';

export type DocumentExtractionAction =
  | 'retry'
  | 'set_document_type'
  | 'reextract'
  | 'confirm'
  | 'delete_file'
  | 'download'
  | 'cancel';

export function getAllowedDocumentExtractionActions(record: {
  status: DocumentExtractionStatus;
  objectKey?: string | null;
  effectiveDocumentType?: DocumentExtractionType | null;
  documentType?: DocumentExtractionType | null;
  plausibility?: unknown;
}): DocumentExtractionAction[] {
  const actions: DocumentExtractionAction[] = [];
  const hasFile = Boolean(record.objectKey);
  const effectiveType = resolveEffectiveDocumentType(record);
  const legalHoldActive = isDocumentLegalHoldActive(record.plausibility);

  if (hasFile && isMalwareScanDownloadAllowed(record.plausibility)) {
    actions.push('download');
  }

  switch (record.status) {
    case 'FAILED':
      if (hasFile && effectiveType) actions.push('retry');
      if (!effectiveType && hasFile) actions.push('set_document_type');
      if (hasFile && !legalHoldActive) actions.push('delete_file');
      if (hasFile) actions.push('cancel');
      break;
    case 'AWAITING_DOCUMENT_TYPE':
      if (hasFile) {
        actions.push('set_document_type', 'cancel');
        if (!legalHoldActive) actions.push('delete_file');
      }
      break;
    case 'READY_FOR_REVIEW':
      actions.push('set_document_type', 'reextract', 'confirm');
      if (hasFile) {
        actions.push('cancel');
        if (!legalHoldActive) actions.push('delete_file');
      }
      break;
    case 'PENDING':
    case 'QUEUED':
    case 'PROCESSING':
      actions.push('cancel');
      break;
    case 'REJECTED':
      if (hasFile && effectiveType) actions.push('retry');
      if (hasFile) {
        actions.push('cancel');
        if (!legalHoldActive) actions.push('delete_file');
      }
      break;
    default:
      break;
  }

  return Array.from(new Set(actions));
}
