import type { PublicDocumentExtraction } from './document-extraction.types';
import { isTerminalExtractionStatus } from './document-extraction-lifecycle';

export function isExtractionPollTerminal(record: Pick<PublicDocumentExtraction, 'status' | 'applyResult'>): boolean {
  if (record.status === 'CONFIRMED') {
    if (record.applyResult?.applyingInProgress) return false;
    if (record.applyResult?.isTerminal) return true;
    if (record.applyResult?.applyFailed) return true;
    return false;
  }
  if (record.status === 'PARTIALLY_APPLIED') return true;
  return isTerminalExtractionStatus(record.status);
}
