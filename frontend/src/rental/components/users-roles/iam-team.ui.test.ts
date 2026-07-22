import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { IAM_TABS, MFA_STATE_LABEL, RISK_LABEL, getInitials } from './iam-team.utils';

const IAM_KEYS: TranslationKey[] = [
  'iam.title',
  'iam.tab.team',
  'iam.tab.roles',
  'iam.tab.security',
  'iam.kpi.activeUsers',
  'iam.kpi.openInvites',
  'iam.kpi.privileged',
  'iam.kpi.reviewRequired',
  'iam.mfa.unknown',
  'iam.mfa.notSupported',
  'iam.a11y.mainTabs',
];

describe('IAM team i18n', () => {
  it('defines DE and EN keys', () => {
    for (const key of IAM_KEYS) {
      expect(de[key], `missing de ${key}`).toBeTruthy();
      expect(en[key], `missing en ${key}`).toBeTruthy();
    }
  });
});

describe('IAM team utils', () => {
  it('exposes three canonical tabs', () => {
    expect(IAM_TABS.map((t) => t.id)).toEqual(['team', 'roles', 'security']);
  });

  it('maps MFA and risk labels', () => {
    expect(MFA_STATE_LABEL.UNKNOWN).toBe('iam.mfa.unknown');
    expect(RISK_LABEL.HIGH).toBe('iam.risk.high');
  });

  it('builds initials', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
    expect(getInitials('plato')).toBe('PL');
  });
});
