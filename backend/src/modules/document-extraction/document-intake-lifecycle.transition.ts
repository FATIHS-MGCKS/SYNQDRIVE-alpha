import type {
  DocumentExtractionErrorPhase,
  DocumentExtractionStatus,
} from '@prisma/client';
import {
  DOCUMENT_INTAKE_CANONICAL_STATUSES,
  DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS,
  DocumentIntakeCanonicalStatus,
  DocumentIntakeErrorCategory,
  DocumentIntakeLifecycleTransitionError,
  DocumentIntakeStoredStatusContext,
  DocumentIntakeTransitionContext,
} from './document-intake-lifecycle.types';

/**
 * Canonical V2 transition table.
 *
 * Pipeline failures use FAILED; apply failures use APPLY_FAILED.
 * CONFIRMED is not in this table — it is a legacy stored alias for APPLYING.
 */
export const DOCUMENT_INTAKE_TRANSITIONS: Readonly<
  Record<DocumentIntakeCanonicalStatus, readonly DocumentIntakeCanonicalStatus[]>
> = {
  PENDING: ['QUEUED', 'PROCESSING', 'CANCELLED', 'FAILED'],
  QUEUED: ['PROCESSING', 'PENDING', 'CANCELLED', 'FAILED'],
  PROCESSING: [
    'QUEUED',
    'AWAITING_DOCUMENT_TYPE',
    'READY_FOR_REVIEW',
    'CANCELLED',
    'FAILED',
  ],
  AWAITING_DOCUMENT_TYPE: [
    'QUEUED',
    'PROCESSING',
    'READY_FOR_REVIEW',
    'CANCELLED',
    'FAILED',
  ],
  READY_FOR_REVIEW: [
    'READY_FOR_ACTION_PREVIEW',
    'READY_TO_APPLY',
    'APPLYING',
    'REJECTED',
    'CANCELLED',
  ],
  READY_FOR_ACTION_PREVIEW: [
    'READY_TO_APPLY',
    'READY_FOR_REVIEW',
    'REJECTED',
    'CANCELLED',
  ],
  READY_TO_APPLY: [
    'APPLYING',
    'READY_FOR_ACTION_PREVIEW',
    'READY_FOR_REVIEW',
    'CANCELLED',
  ],
  APPLYING: ['APPLIED', 'PARTIALLY_APPLIED', 'APPLY_FAILED'],
  PARTIALLY_APPLIED: ['APPLYING', 'APPLIED', 'CANCELLED'],
  APPLIED: [],
  APPLY_FAILED: ['READY_TO_APPLY', 'APPLYING', 'REJECTED', 'CANCELLED'],
  FAILED: ['QUEUED', 'PENDING', 'PROCESSING', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

export const DOCUMENT_INTAKE_TERMINAL_STATUSES: readonly DocumentIntakeCanonicalStatus[] =
  ['APPLIED', 'REJECTED', 'CANCELLED'];

export const DOCUMENT_INTAKE_ACTIVE_STATUSES: readonly DocumentIntakeCanonicalStatus[] =
  [
    'PENDING',
    'QUEUED',
    'PROCESSING',
    'AWAITING_DOCUMENT_TYPE',
    'READY_FOR_ACTION_PREVIEW',
    'READY_TO_APPLY',
    'APPLYING',
    'PARTIALLY_APPLIED',
  ];

const PIPELINE_ERROR_PHASES = new Set<DocumentExtractionErrorPhase>([
  'UPLOAD',
  'STORAGE',
  'QUEUE',
  'OCR',
  'CLASSIFICATION',
  'EXTRACTION',
  'VALIDATION',
  'UNKNOWN',
]);

export function isDocumentIntakeCanonicalStatus(
  value: string,
): value is DocumentIntakeCanonicalStatus {
  return (DOCUMENT_INTAKE_CANONICAL_STATUSES as readonly string[]).includes(value);
}

/** PARTIALLY_APPLIED is explicitly not a successful apply terminus. */
export function isSuccessfulApplyDocumentIntakeStatus(
  status: DocumentIntakeCanonicalStatus,
): boolean {
  return status === 'APPLIED';
}

export function isPartialApplyDocumentIntakeStatus(
  status: DocumentIntakeCanonicalStatus,
): boolean {
  return status === 'PARTIALLY_APPLIED';
}

export function isTerminalDocumentIntakeStatus(
  status: DocumentIntakeCanonicalStatus,
): boolean {
  return DOCUMENT_INTAKE_TERMINAL_STATUSES.includes(status);
}

export function isActiveDocumentIntakeStatus(
  status: DocumentIntakeCanonicalStatus,
): boolean {
  return DOCUMENT_INTAKE_ACTIVE_STATUSES.includes(status);
}

export function errorCategoryForStoredRecord(
  storedStatus: DocumentExtractionStatus,
  ctx: DocumentIntakeStoredStatusContext = {},
): DocumentIntakeErrorCategory {
  const canonical = normalizeStoredStatusToCanonical(storedStatus, ctx);
  return errorCategoryForCanonicalStatus(canonical, ctx);
}

export function errorCategoryForCanonicalStatus(
  status: DocumentIntakeCanonicalStatus,
  ctx: DocumentIntakeStoredStatusContext = {},
): DocumentIntakeErrorCategory {
  if (status === 'APPLY_FAILED') return 'apply';
  if (status === 'FAILED') {
    if (ctx.errorPhase === 'APPLY') return 'apply';
    if (ctx.errorPhase && PIPELINE_ERROR_PHASES.has(ctx.errorPhase)) {
      return 'pipeline';
    }
    return 'pipeline';
  }
  return 'none';
}

export function isPipelineFailureCanonicalStatus(
  status: DocumentIntakeCanonicalStatus,
  ctx: DocumentIntakeStoredStatusContext = {},
): boolean {
  return errorCategoryForCanonicalStatus(status, ctx) === 'pipeline';
}

export function isApplyFailureCanonicalStatus(
  status: DocumentIntakeCanonicalStatus,
  ctx: DocumentIntakeStoredStatusContext = {},
): boolean {
  return errorCategoryForCanonicalStatus(status, ctx) === 'apply';
}

/**
 * Read-compat: map persisted Prisma status (+ error context) to canonical V2.
 *
 * - CONFIRMED → APPLYING (legacy transition; not a canonical node)
 * - FAILED + errorPhase APPLY → APPLY_FAILED
 * - FAILED + pipeline phases → FAILED
 */
export function normalizeStoredStatusToCanonical(
  storedStatus: DocumentExtractionStatus,
  ctx: DocumentIntakeStoredStatusContext = {},
): DocumentIntakeCanonicalStatus {
  if (storedStatus === DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS) {
    return 'APPLYING';
  }
  if (storedStatus === 'FAILED' && ctx.errorPhase === 'APPLY') {
    return 'APPLY_FAILED';
  }
  if (isDocumentIntakeCanonicalStatus(storedStatus)) {
    return storedStatus;
  }
  return storedStatus as DocumentIntakeCanonicalStatus;
}

/**
 * Write-compat: map canonical V2 status to persistable Prisma status.
 *
 * V2-only nodes without enum backing collapse to the nearest legacy value
 * until schema migration (Prompt 14+).
 */
export function mapCanonicalStatusToStored(
  canonical: DocumentIntakeCanonicalStatus,
): {
  status: DocumentExtractionStatus;
  clearErrors: boolean;
  errorPhase?: DocumentExtractionErrorPhase | null;
} {
  switch (canonical) {
    case 'APPLYING':
      return {
        status: DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS,
        clearErrors: true,
      };
    case 'APPLY_FAILED':
      return {
        status: 'FAILED',
        clearErrors: false,
        errorPhase: 'APPLY',
      };
    case 'READY_FOR_ACTION_PREVIEW':
    case 'READY_TO_APPLY':
    case 'PARTIALLY_APPLIED':
      return { status: 'READY_FOR_REVIEW', clearErrors: true };
    case 'APPLIED':
    case 'FAILED':
    case 'PENDING':
    case 'QUEUED':
    case 'PROCESSING':
    case 'AWAITING_DOCUMENT_TYPE':
    case 'READY_FOR_REVIEW':
    case 'REJECTED':
    case 'CANCELLED':
      return { status: canonical, clearErrors: canonical !== 'FAILED' };
    default: {
      const exhaustive: never = canonical;
      return { status: exhaustive, clearErrors: true };
    }
  }
}

export function allowedDocumentIntakeStatusTargets(
  from: DocumentIntakeCanonicalStatus,
): DocumentIntakeCanonicalStatus[] {
  return [...(DOCUMENT_INTAKE_TRANSITIONS[from] ?? [])];
}

export function canTransitionDocumentIntakeStatus(
  from: DocumentIntakeCanonicalStatus,
  to: DocumentIntakeCanonicalStatus,
  _context: DocumentIntakeTransitionContext = {},
): boolean {
  if (from === to) return true;
  const baseAllowed = DOCUMENT_INTAKE_TRANSITIONS[from] ?? [];
  return baseAllowed.includes(to);
}

export function assertDocumentIntakeStatusTransition(
  from: DocumentIntakeCanonicalStatus,
  to: DocumentIntakeCanonicalStatus,
  context: DocumentIntakeTransitionContext = {},
): void {
  if (!canTransitionDocumentIntakeStatus(from, to, context)) {
    throw new DocumentIntakeLifecycleTransitionError(from, to);
  }
}

/**
 * Validate a transition from persisted DB state to a canonical target.
 * Normalizes legacy CONFIRMED before applying the FSM.
 */
export function assertStoredToCanonicalTransition(
  storedFrom: DocumentExtractionStatus,
  canonicalTo: DocumentIntakeCanonicalStatus,
  ctx: DocumentIntakeStoredStatusContext = {},
  transitionContext: DocumentIntakeTransitionContext = {},
): void {
  const canonicalFrom = normalizeStoredStatusToCanonical(storedFrom, ctx);
  assertDocumentIntakeStatusTransition(canonicalFrom, canonicalTo, transitionContext);
}
