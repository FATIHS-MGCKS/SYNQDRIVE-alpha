import {
  allowedDocumentIntakeStatusTargets,
  assertDocumentIntakeStatusTransition,
  assertStoredToCanonicalTransition,
  canTransitionDocumentIntakeStatus,
  DOCUMENT_INTAKE_TRANSITIONS,
  errorCategoryForCanonicalStatus,
  errorCategoryForStoredRecord,
  isApplyFailureCanonicalStatus,
  isPartialApplyDocumentIntakeStatus,
  isPipelineFailureCanonicalStatus,
  isSuccessfulApplyDocumentIntakeStatus,
  isTerminalDocumentIntakeStatus,
  mapCanonicalStatusToStored,
  normalizeStoredStatusToCanonical,
} from './document-intake-lifecycle.transition';
import {
  DOCUMENT_INTAKE_CANONICAL_STATUSES,
  DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS,
  DocumentIntakeCanonicalStatus,
  DocumentIntakeLifecycleTransitionError,
} from './document-intake-lifecycle.types';

describe('Document Intake V2 lifecycle — canonical statuses', () => {
  it('defines all 14 canonical statuses from the V2 contract', () => {
    expect([...DOCUMENT_INTAKE_CANONICAL_STATUSES]).toEqual([
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
    ]);
  });

  it('has a transition entry for every canonical status', () => {
    for (const status of DOCUMENT_INTAKE_CANONICAL_STATUSES) {
      expect(DOCUMENT_INTAKE_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('Document Intake V2 lifecycle — legacy read compat', () => {
  it('maps CONFIRMED to APPLYING', () => {
    expect(
      normalizeStoredStatusToCanonical(DOCUMENT_INTAKE_LEGACY_CONFIRMED_STATUS),
    ).toBe('APPLYING');
  });

  it('maps FAILED + errorPhase APPLY to APPLY_FAILED', () => {
    expect(
      normalizeStoredStatusToCanonical('FAILED', { errorPhase: 'APPLY' }),
    ).toBe('APPLY_FAILED');
  });

  it('maps FAILED + pipeline errorPhase to FAILED', () => {
    expect(
      normalizeStoredStatusToCanonical('FAILED', { errorPhase: 'OCR' }),
    ).toBe('FAILED');
    expect(isPipelineFailureCanonicalStatus('FAILED', { errorPhase: 'OCR' })).toBe(
      true,
    );
  });

  it('passes through statuses that already match canonical names', () => {
    expect(normalizeStoredStatusToCanonical('READY_FOR_REVIEW')).toBe(
      'READY_FOR_REVIEW',
    );
    expect(normalizeStoredStatusToCanonical('APPLIED')).toBe('APPLIED');
  });
});

describe('Document Intake V2 lifecycle — legacy write compat', () => {
  it('maps APPLYING to stored CONFIRMED', () => {
    expect(mapCanonicalStatusToStored('APPLYING')).toEqual({
      status: 'CONFIRMED',
      clearErrors: true,
    });
  });

  it('maps APPLY_FAILED to stored FAILED with APPLY error phase', () => {
    expect(mapCanonicalStatusToStored('APPLY_FAILED')).toEqual({
      status: 'FAILED',
      clearErrors: false,
      errorPhase: 'APPLY',
    });
  });

  it('collapses V2-only pre-apply nodes to READY_FOR_REVIEW until enum migration', () => {
    for (const status of [
      'READY_FOR_ACTION_PREVIEW',
      'READY_TO_APPLY',
      'PARTIALLY_APPLIED',
    ] as const) {
      expect(mapCanonicalStatusToStored(status)).toEqual({
        status: 'READY_FOR_REVIEW',
        clearErrors: true,
      });
    }
  });
});

describe('Document Intake V2 lifecycle — error category split', () => {
  it('treats APPLY_FAILED as apply error, not pipeline error', () => {
    expect(errorCategoryForCanonicalStatus('APPLY_FAILED')).toBe('apply');
    expect(isApplyFailureCanonicalStatus('APPLY_FAILED')).toBe(true);
    expect(isPipelineFailureCanonicalStatus('APPLY_FAILED')).toBe(false);
  });

  it('treats FAILED with OCR phase as pipeline error', () => {
    expect(errorCategoryForStoredRecord('FAILED', { errorPhase: 'OCR' })).toBe(
      'pipeline',
    );
  });

  it('treats stored FAILED + APPLY phase as apply error via normalization', () => {
    expect(
      errorCategoryForStoredRecord('FAILED', {
        errorPhase: 'APPLY',
        errorCode: 'APPLY_FAILED',
      }),
    ).toBe('apply');
  });
});

describe('Document Intake V2 lifecycle — apply success semantics', () => {
  it('counts only APPLIED as successful apply terminus', () => {
    expect(isSuccessfulApplyDocumentIntakeStatus('APPLIED')).toBe(true);
    expect(isSuccessfulApplyDocumentIntakeStatus('PARTIALLY_APPLIED')).toBe(false);
    expect(isSuccessfulApplyDocumentIntakeStatus('APPLYING')).toBe(false);
    expect(isSuccessfulApplyDocumentIntakeStatus('APPLY_FAILED')).toBe(false);
  });

  it('identifies PARTIALLY_APPLIED separately from APPLIED', () => {
    expect(isPartialApplyDocumentIntakeStatus('PARTIALLY_APPLIED')).toBe(true);
    expect(isPartialApplyDocumentIntakeStatus('APPLIED')).toBe(false);
    expect(isTerminalDocumentIntakeStatus('PARTIALLY_APPLIED')).toBe(false);
    expect(isTerminalDocumentIntakeStatus('APPLIED')).toBe(true);
  });
});

describe('Document Intake V2 lifecycle — allowed transitions', () => {
  const cases: Array<{
    from: DocumentIntakeCanonicalStatus;
    to: DocumentIntakeCanonicalStatus;
  }> = [
    { from: 'PENDING', to: 'QUEUED' },
    { from: 'PENDING', to: 'PROCESSING' },
    { from: 'QUEUED', to: 'PROCESSING' },
    { from: 'PROCESSING', to: 'READY_FOR_REVIEW' },
    { from: 'PROCESSING', to: 'AWAITING_DOCUMENT_TYPE' },
    { from: 'PROCESSING', to: 'QUEUED' },
    { from: 'PROCESSING', to: 'FAILED' },
    { from: 'AWAITING_DOCUMENT_TYPE', to: 'QUEUED' },
    { from: 'READY_FOR_REVIEW', to: 'READY_FOR_ACTION_PREVIEW' },
    { from: 'READY_FOR_REVIEW', to: 'READY_TO_APPLY' },
    { from: 'READY_FOR_REVIEW', to: 'APPLYING' },
    { from: 'READY_FOR_ACTION_PREVIEW', to: 'READY_TO_APPLY' },
    { from: 'READY_TO_APPLY', to: 'APPLYING' },
    { from: 'APPLYING', to: 'APPLIED' },
    { from: 'APPLYING', to: 'PARTIALLY_APPLIED' },
    { from: 'APPLYING', to: 'APPLY_FAILED' },
    { from: 'PARTIALLY_APPLIED', to: 'APPLYING' },
    { from: 'PARTIALLY_APPLIED', to: 'APPLIED' },
    { from: 'APPLY_FAILED', to: 'READY_TO_APPLY' },
    { from: 'APPLY_FAILED', to: 'APPLYING' },
    { from: 'FAILED', to: 'QUEUED' },
    { from: 'FAILED', to: 'PROCESSING' },
    { from: 'READY_FOR_REVIEW', to: 'REJECTED' },
    { from: 'READY_FOR_REVIEW', to: 'CANCELLED' },
  ];

  it.each(cases)('allows $from → $to', ({ from, to }) => {
    expect(canTransitionDocumentIntakeStatus(from, to)).toBe(true);
    expect(() => assertDocumentIntakeStatusTransition(from, to)).not.toThrow();
  });
});

describe('Document Intake V2 lifecycle — rejected transitions', () => {
  const invalid: Array<{
    from: DocumentIntakeCanonicalStatus;
    to: DocumentIntakeCanonicalStatus;
  }> = [
    { from: 'APPLIED', to: 'READY_FOR_REVIEW' },
    { from: 'APPLIED', to: 'APPLYING' },
    { from: 'CANCELLED', to: 'QUEUED' },
    { from: 'REJECTED', to: 'READY_FOR_REVIEW' },
    { from: 'PENDING', to: 'APPLIED' },
    { from: 'PENDING', to: 'APPLYING' },
    { from: 'READY_FOR_REVIEW', to: 'APPLIED' },
    { from: 'PARTIALLY_APPLIED', to: 'FAILED' },
    { from: 'APPLY_FAILED', to: 'APPLIED' },
    { from: 'FAILED', to: 'APPLIED' },
    { from: 'FAILED', to: 'APPLY_FAILED' },
    { from: 'APPLYING', to: 'FAILED' },
    { from: 'PROCESSING', to: 'APPLYING' },
  ];

  it.each(invalid)('rejects $from → $to', ({ from, to }) => {
    expect(canTransitionDocumentIntakeStatus(from, to)).toBe(false);
    expect(() => assertDocumentIntakeStatusTransition(from, to)).toThrow(
      DocumentIntakeLifecycleTransitionError,
    );
  });
});

describe('Document Intake V2 lifecycle — legacy stored transition gate', () => {
  it('allows CONFIRMED (→ APPLYING) to APPLIED', () => {
    expect(() =>
      assertStoredToCanonicalTransition('CONFIRMED', 'APPLIED'),
    ).not.toThrow();
  });

  it('allows CONFIRMED (→ APPLYING) to APPLY_FAILED', () => {
    expect(() =>
      assertStoredToCanonicalTransition('CONFIRMED', 'APPLY_FAILED'),
    ).not.toThrow();
  });

  it('rejects CONFIRMED (→ APPLYING) jumping back to pipeline states', () => {
    expect(() =>
      assertStoredToCanonicalTransition('CONFIRMED', 'PROCESSING'),
    ).toThrow(DocumentIntakeLifecycleTransitionError);
  });

  it('allows FAILED+APPLY to retry apply via APPLYING', () => {
    expect(() =>
      assertStoredToCanonicalTransition('FAILED', 'APPLYING', {
        errorPhase: 'APPLY',
      }),
    ).not.toThrow();
  });
});

describe('Document Intake V2 lifecycle — terminal states', () => {
  it('exposes no outbound transitions from terminal states', () => {
    for (const status of ['APPLIED', 'REJECTED', 'CANCELLED'] as const) {
      expect(allowedDocumentIntakeStatusTargets(status)).toEqual([]);
      expect(isTerminalDocumentIntakeStatus(status)).toBe(true);
    }
  });
});

describe('Document Intake V2 lifecycle — self transitions', () => {
  it('allows idempotent self-transitions for correction saves', () => {
    expect(canTransitionDocumentIntakeStatus('READY_FOR_REVIEW', 'READY_FOR_REVIEW')).toBe(
      true,
    );
    expect(canTransitionDocumentIntakeStatus('APPLYING', 'APPLYING')).toBe(true);
  });
});
