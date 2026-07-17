import { describe, expect, it } from 'vitest';
import { canShowApplyDone } from './document-apply-result';
import type { DocumentExtractionStatus, PublicDocumentApplyResult } from './document-extraction.types';

describe('document-apply-result', () => {
  const base: PublicDocumentApplyResult = {
    lifecycleStatus: 'APPLIED',
    extractionStatus: 'APPLIED',
    summary: 'ok',
    detailSummary: null,
    isTerminal: true,
    applyingInProgress: false,
    nonCancellable: false,
    requiredActionsComplete: true,
    canRetryFailedActions: false,
    partiallyApplied: false,
    applyFailed: false,
    fingerprint: 'fp',
    actions: [],
  };

  it('does not show done before required actions complete', () => {
    expect(
      canShowApplyDone('APPLIED', {
        ...base,
        requiredActionsComplete: false,
      }),
    ).toBe(false);
  });

  it('allows done for fully applied required actions', () => {
    expect(canShowApplyDone('APPLIED', base)).toBe(true);
  });

  it('blocks done while apply is in progress', () => {
    expect(
      canShowApplyDone('CONFIRMED', {
        ...base,
        applyingInProgress: true,
        isTerminal: false,
        requiredActionsComplete: false,
      }),
    ).toBe(false);
  });

  it('allows partially applied completion when required actions are done', () => {
    expect(
      canShowApplyDone('PARTIALLY_APPLIED' as DocumentExtractionStatus, {
        ...base,
        partiallyApplied: true,
        extractionStatus: 'PARTIALLY_APPLIED',
      }),
    ).toBe(true);
  });
});
