import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canShowApplyDone, mapApplyAwareFlowStatus, shouldPollApplyStatus } from './document-apply-result';
import { mapServerToFlowStatus } from './document-extraction-lifecycle';
import { intakeFalseAppliedWhileApplying, intakePartialApplyResult, intakeReadyForReview } from './document-intake-test-fixtures';

describe('Document Intake V2 apply truth contract', () => {
  it('never shows done for APPLIED status without confirmed apply result', () => {
    expect(canShowApplyDone('APPLIED', undefined)).toBe(true);
    expect(canShowApplyDone('APPLIED', intakeFalseAppliedWhileApplying.applyResult)).toBe(false);
  });

  it('maps CONFIRMED + applying to applying flow; APPLIED success gated separately', () => {
    expect(
      mapApplyAwareFlowStatus(
        'CONFIRMED',
        'APPLY',
        intakeFalseAppliedWhileApplying.applyResult,
      ),
    ).toBe('applying');
    expect(canShowApplyDone('APPLIED', intakeFalseAppliedWhileApplying.applyResult)).toBe(false);
  });

  it('allows partially applied done only when required actions complete', () => {
    expect(
      canShowApplyDone('PARTIALLY_APPLIED', {
        ...intakePartialApplyResult,
        requiredActionsComplete: false,
      }),
    ).toBe(false);
    expect(canShowApplyDone('PARTIALLY_APPLIED', intakePartialApplyResult)).toBe(true);
    expect(mapApplyAwareFlowStatus('PARTIALLY_APPLIED', 'APPLY', intakePartialApplyResult)).toBe(
      'partially_done',
    );
  });

  it('polls apply status until terminal apply result', () => {
    expect(shouldPollApplyStatus('CONFIRMED', intakeFalseAppliedWhileApplying.applyResult)).toBe(
      true,
    );
    expect(
      shouldPollApplyStatus('APPLIED', {
        ...intakeReadyForReview,
        applyingInProgress: false,
        requiredActionsComplete: true,
        isTerminal: true,
      } as never),
    ).toBe(false);
  });
});

describe('Document Intake V2 lifecycle surfaces', () => {
  it('maps processing substates for upload pipeline', () => {
    expect(mapServerToFlowStatus('QUEUED')).toBe('queued');
    expect(mapServerToFlowStatus('PROCESSING', 'OCR')).toBe('ocr');
    expect(mapServerToFlowStatus('PROCESSING', 'CLASSIFICATION')).toBe('classifying');
    expect(mapServerToFlowStatus('AWAITING_DOCUMENT_TYPE')).toBe('awaiting_type');
    expect(mapServerToFlowStatus('READY_FOR_REVIEW')).toBe('ready');
  });

  it('wires page and drawer to canShowApplyDone gate', () => {
    const page = readFileSync(resolve(__dirname, '../components/DocumentUploadView.tsx'), 'utf8');
    const drawer = readFileSync(
      resolve(__dirname, '../components/documents/VehicleDocumentUploadDrawer.tsx'),
      'utf8',
    );
    const intake = readFileSync(resolve(__dirname, '../hooks/useDocumentIntakeFlow.ts'), 'utf8');

    expect(page).toContain('canShowApplyDone');
    expect(page).toContain('showDone = showActiveFlow && page.flow === \'done\' && page.canShowApplyDone');
    expect(drawer).toContain('canShowApplyDone');
    expect(intake).toContain('if (mapped === \'done\' && !canShowApplyDone(next.status, next.applyResult))');
  });

  it('does not auto-send contact prepare drafts', () => {
    const modal = readFileSync(
      resolve(__dirname, '../components/documents/DocumentFollowUpContactPrepareModal.tsx'),
      'utf8',
    );
    expect(modal).toContain('documentExtraction.sendFollowUpContact');
    expect(modal).toContain('noAutoSendHint');
    expect(modal).not.toMatch(/sendOnOpen|autoSendOnOpen/i);
  });
});
