import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/translations/de';
import {
  misuseCaseDecisionHint,
  misuseCaseStatusLabel,
} from './misuse-case-lifecycle.ui';

const tDe = (key: keyof typeof de) => de[key] as string;

describe('misuse-case-lifecycle.ui', () => {
  it('labels lifecycle statuses in German', () => {
    expect(misuseCaseStatusLabel(tDe, 'REVIEW_REQUIRED')).toBe('Prüfung erforderlich');
    expect(misuseCaseStatusLabel(tDe, 'CONFIRMED')).toBe('Bestätigt');
  });

  it('explains decision eligibility without auto-charge wording', () => {
    expect(misuseCaseDecisionHint(tDe, 'INFORMATIONAL_ONLY')).toContain('keine automatische');
    expect(misuseCaseDecisionHint(tDe, 'OPERATIONAL_ELIGIBLE')).toContain('keine automatische');
  });

  it('falls back to raw machine for unknown status', () => {
    expect(misuseCaseStatusLabel(tDe, 'PROVIDER_STATUS_X7')).toBe('PROVIDER_STATUS_X7');
  });
});
