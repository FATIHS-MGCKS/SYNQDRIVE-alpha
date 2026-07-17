import type {
  DocumentExtractionStatus,
  PublicDocumentApplyResult,
} from './document-extraction.types';
import type { FlowStatus } from '../components/documents/document-extraction.shared';
import { mapServerToFlowStatus } from './document-extraction-lifecycle';
import type { TranslationKey } from '../i18n/translations/en';

export function translateApplyErrorCode(
  code: string | null | undefined,
  t: (key: TranslationKey) => string,
  fallback?: string | null,
): string {
  if (code) {
    const key = `docUpload.applyResult.error.${code}` as TranslationKey;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  if (fallback?.trim()) return fallback.trim();
  return t('docUpload.applyResult.error.UNKNOWN');
}

export function resolveApplyEntityNavigationTarget(link: {
  entityType: string;
  entityId: string;
  targetModule: string;
}): { view: string; tab?: string; entityId: string } | null {
  switch (link.entityType) {
    case 'fine':
      return { view: 'financial-insights', tab: 'fines', entityId: link.entityId };
    case 'invoice':
      return { view: 'invoices', entityId: link.entityId };
    case 'damage':
      return { view: 'damages', entityId: link.entityId };
    case 'service_event':
      return { view: 'health-errors', entityId: link.entityId };
    case 'vehicle':
      return { view: 'overview', entityId: link.entityId };
    default:
      return null;
  }
}

export function isApplyTerminal(
  status: DocumentExtractionStatus | undefined,
  applyResult: PublicDocumentApplyResult | null | undefined,
): boolean {
  if (applyResult?.isTerminal) return true;
  if (status === 'APPLIED') return true;
  if (status === 'PARTIALLY_APPLIED') return true;
  if (status === 'CONFIRMED' && applyResult?.applyFailed) return true;
  return false;
}

export function canShowApplyDone(
  status: DocumentExtractionStatus | undefined,
  applyResult: PublicDocumentApplyResult | null | undefined,
): boolean {
  if (!applyResult) return status === 'APPLIED';
  if (applyResult.applyingInProgress) return false;
  if (applyResult.applyFailed) return false;
  if (applyResult.partiallyApplied) return applyResult.requiredActionsComplete;
  return applyResult.requiredActionsComplete && (status === 'APPLIED' || status === 'PARTIALLY_APPLIED');
}

export function mapApplyAwareFlowStatus(
  status: DocumentExtractionStatus | undefined,
  stage: Parameters<typeof mapServerToFlowStatus>[1],
  applyResult: PublicDocumentApplyResult | null | undefined,
): FlowStatus {
  if (status === 'PARTIALLY_APPLIED') return 'partially_done';
  if (status === 'CONFIRMED' && applyResult?.applyFailed) return 'apply_failed';
  if (status === 'CONFIRMED' && (applyResult?.applyingInProgress || !applyResult?.isTerminal)) {
    return 'applying';
  }
  return mapServerToFlowStatus(status, stage);
}

export function shouldPollApplyStatus(
  status: DocumentExtractionStatus | undefined,
  applyResult: PublicDocumentApplyResult | null | undefined,
): boolean {
  if (status === 'CONFIRMED') return true;
  if (applyResult?.applyingInProgress) return true;
  return false;
}
