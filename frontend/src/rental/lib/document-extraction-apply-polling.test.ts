import { describe, expect, it } from 'vitest';
import { isExtractionPollTerminal } from './document-extraction-apply-polling';
import { intakeFalseAppliedWhileApplying } from './document-intake-test-fixtures';

describe('document-extraction-apply-polling', () => {
  it('keeps polling while CONFIRMED and apply is in progress', () => {
    expect(
      isExtractionPollTerminal({
        status: 'CONFIRMED',
        applyResult: intakeFalseAppliedWhileApplying.applyResult,
      }),
    ).toBe(false);
  });

  it('stops polling for CONFIRMED while apply is still running', () => {
    expect(
      isExtractionPollTerminal({
        status: intakeFalseAppliedWhileApplying.status,
        applyResult: intakeFalseAppliedWhileApplying.applyResult,
      }),
    ).toBe(true);
    expect(
      isExtractionPollTerminal({
        status: 'CONFIRMED',
        applyResult: intakeFalseAppliedWhileApplying.applyResult,
      }),
    ).toBe(false);
  });

  it('stops polling when apply result is terminal', () => {
    expect(
      isExtractionPollTerminal({
        status: 'CONFIRMED',
        applyResult: {
          ...intakeFalseAppliedWhileApplying.applyResult,
          applyingInProgress: false,
          isTerminal: true,
          requiredActionsComplete: true,
        },
      }),
    ).toBe(true);
  });

  it('stops polling for PARTIALLY_APPLIED', () => {
    expect(
      isExtractionPollTerminal({
        status: 'PARTIALLY_APPLIED',
        applyResult: null,
      }),
    ).toBe(true);
  });
});
