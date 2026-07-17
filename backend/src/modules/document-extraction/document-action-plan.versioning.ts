import type { DocumentActionPlanStatus } from '@prisma/client';
import {
  DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS,
  type DocumentActionPlanInvalidationReason,
  type DocumentActionPlanVersionRow,
} from './document-action-plan.types';

const TERMINAL_PLAN_STATUSES = new Set<DocumentActionPlanStatus>([
  'APPLIED',
  'SUPERSEDED',
  'INVALIDATED',
  'ARCHIVE_ONLY',
]);

export function isTerminalDocumentActionPlanStatus(status: DocumentActionPlanStatus): boolean {
  return TERMINAL_PLAN_STATUSES.has(status);
}

export function resolveInvalidationReasonForFingerprintChange(
  previousFingerprint: string,
  nextFingerprint: string,
): DocumentActionPlanInvalidationReason {
  if (previousFingerprint === nextFingerprint) {
    throw new Error('Invalidation reason requested without fingerprint change');
  }
  return DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS.INPUT_FINGERPRINT_CHANGED;
}

export function nextDocumentActionPlanVersion(
  rows: Array<Pick<DocumentActionPlanVersionRow, 'planVersion'>>,
): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((row) => row.planVersion)) + 1;
}

export function pickCurrentDocumentActionPlan<T extends { invalidatedAt: Date | null; planVersion: number }>(
  plans: T[],
): T | null {
  const current = plans.filter((plan) => plan.invalidatedAt == null);
  if (current.length === 0) return null;
  return current.sort((a, b) => b.planVersion - a.planVersion)[0] ?? null;
}

export function shouldInvalidateCurrentPlanForFingerprintChange(
  current: Pick<DocumentActionPlanVersionRow, 'inputFingerprint' | 'invalidatedAt'> | null,
  nextFingerprint: string,
): boolean {
  if (!current || current.invalidatedAt != null) return false;
  return current.inputFingerprint !== nextFingerprint;
}
