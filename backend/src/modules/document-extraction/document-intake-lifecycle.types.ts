import type {
  DocumentExtractionErrorPhase,
  DocumentExtractionStatus,
} from '@prisma/client';

/**
 * Canonical Document Intake V2 lifecycle statuses.
 *
 * These are the domain truth for transition validation. Persisted Prisma
 * `DocumentExtractionStatus` values are a legacy subset — use the compat
 * helpers to read/write across the migration window.
 */
export const DOCUMENT_INTAKE_CANONICAL_STATUSES = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'AWAITING_DOCUMENT_TYPE',
  'READY_FOR_REVIEW',
  'READY_FOR_ACTION_PREVIEW',
  'READY_TO_APPLY',
  'APPLYING',
  'PARTIALLY_APPLIED',
  'APPLIED',
  'APPLY_FAILED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
] as const;

export type DocumentIntakeCanonicalStatus =
  (typeof DOCUMENT_INTAKE_CANONICAL_STATUSES)[number];

/** Legacy stored status kept during V2 migration — not part of canonical FSM. */
export const DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS = 'CONFIRMED' as const;
export type DocumentIntakeLegacyConfirmedStatus =
  typeof DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS;

export type DocumentIntakeStoredStatus =
  | DocumentExtractionStatus
  | DocumentIntakeLegacyConfirmedStatus;

export type DocumentIntakeErrorCategory = 'pipeline' | 'apply' | 'none';

export interface DocumentIntakeStoredStatusContext {
  errorPhase?: DocumentExtractionErrorPhase | null;
  errorCode?: string | null;
}

export interface DocumentIntakeTransitionContext {
  /** Manual operator retry after a pipeline failure. */
  manualPipelineRetry?: boolean;
  /** Recovery scheduler retry after an apply failure. */
  applyRecoveryRetry?: boolean;
  /** User rejected the extraction during review. */
  userRejected?: boolean;
}

export class DocumentIntakeLifecycleTransitionError extends Error {
  readonly code = 'DOCUMENT_INTAKE_STATUS_TRANSITION_FORBIDDEN';

  constructor(
    readonly from: DocumentIntakeCanonicalStatus,
    readonly to: DocumentIntakeCanonicalStatus,
    message?: string,
  ) {
    super(
      message ??
        `Document intake status transition ${from} → ${to} is not allowed`,
    );
    this.name = 'DocumentIntakeLifecycleTransitionError';
  }
}
