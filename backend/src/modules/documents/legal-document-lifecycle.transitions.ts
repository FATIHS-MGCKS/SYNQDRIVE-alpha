import { LEGAL_STATUS, type LegalStatus } from './documents.constants';

/**
 * Allowed status transitions for organization legal documents.
 *
 * System-only edges (e.g. ACTIVE → SUPERSEDED during activation of a successor)
 * are listed here but should only be invoked from LegalDocumentsService internals.
 */
export const LEGAL_STATUS_TRANSITIONS: Readonly<Record<LegalStatus, readonly LegalStatus[]>> = {
  [LEGAL_STATUS.DRAFT]: [LEGAL_STATUS.IN_REVIEW, LEGAL_STATUS.ARCHIVED],
  [LEGAL_STATUS.IN_REVIEW]: [
    LEGAL_STATUS.APPROVED,
    LEGAL_STATUS.DRAFT,
    LEGAL_STATUS.ARCHIVED,
  ],
  [LEGAL_STATUS.APPROVED]: [
    LEGAL_STATUS.SCHEDULED,
    LEGAL_STATUS.ACTIVE,
    LEGAL_STATUS.ARCHIVED,
  ],
  [LEGAL_STATUS.SCHEDULED]: [
    LEGAL_STATUS.ACTIVE,
    LEGAL_STATUS.APPROVED,
    LEGAL_STATUS.ARCHIVED,
  ],
  [LEGAL_STATUS.ACTIVE]: [LEGAL_STATUS.SUPERSEDED, LEGAL_STATUS.REVOKED],
  [LEGAL_STATUS.SUPERSEDED]: [LEGAL_STATUS.ARCHIVED],
  [LEGAL_STATUS.REVOKED]: [LEGAL_STATUS.ARCHIVED],
  [LEGAL_STATUS.ARCHIVED]: [],
};

/** Statuses from which activation (→ ACTIVE) is permitted. DRAFT is explicitly excluded. */
export const LEGAL_ACTIVATABLE_STATUSES: ReadonlySet<LegalStatus> = new Set([
  LEGAL_STATUS.APPROVED,
  LEGAL_STATUS.SCHEDULED,
]);

export function isLegalStatus(value: string): value is LegalStatus {
  return Object.values(LEGAL_STATUS).includes(value as LegalStatus);
}

export function isLegalStatusTransitionAllowed(from: string, to: string): boolean {
  if (!isLegalStatus(from) || !isLegalStatus(to)) return false;
  return LEGAL_STATUS_TRANSITIONS[from].includes(to);
}

export function assertLegalStatusTransition(from: string, to: string): void {
  if (!isLegalStatusTransitionAllowed(from, to)) {
    throw new LegalStatusTransitionError(from, to);
  }
}

export class LegalStatusTransitionError extends Error {
  readonly fromStatus: string;
  readonly toStatus: string;

  constructor(fromStatus: string, toStatus: string) {
    super(`Illegal legal document status transition: ${fromStatus} → ${toStatus}`);
    this.name = 'LegalStatusTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}
