import { describe, expect, it } from 'vitest';
import {
  misuseCaseDecisionHint,
  misuseCaseStatusLabel,
} from './misuse-case-lifecycle.ui';

describe('misuse-case-lifecycle.ui', () => {
  it('labels lifecycle statuses in German', () => {
    expect(misuseCaseStatusLabel('REVIEW_REQUIRED')).toBe('Prüfung erforderlich');
    expect(misuseCaseStatusLabel('CONFIRMED')).toBe('Bestätigt');
  });

  it('explains decision eligibility without auto-charge wording', () => {
    expect(misuseCaseDecisionHint('INFORMATIONAL_ONLY')).toContain('keine automatische');
    expect(misuseCaseDecisionHint('OPERATIONAL_ELIGIBLE')).toContain('keine automatische');
  });
});
