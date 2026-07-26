import {
  isNotificationV2EnabledForOrg,
  isOrgInNotificationV2Rollout,
  NOTIFICATIONS_V2_ORG_ALLOWLIST_ENV,
  parseNotificationV2OrgAllowlist,
} from './notification-rollout.util';

describe('notification-rollout.util', () => {
  it('parses comma-separated org allowlist', () => {
    const allowlist = parseNotificationV2OrgAllowlist({
      [NOTIFICATIONS_V2_ORG_ALLOWLIST_ENV]: 'org-a, org-b,org-c',
    });
    expect(allowlist).toEqual(new Set(['org-a', 'org-b', 'org-c']));
  });

  it('returns null when allowlist env is empty', () => {
    expect(parseNotificationV2OrgAllowlist({})).toBeNull();
    expect(parseNotificationV2OrgAllowlist({ [NOTIFICATIONS_V2_ORG_ALLOWLIST_ENV]: '' })).toBeNull();
  });

  it('scopes rollout to allowlisted orgs only', () => {
    const allowlist = new Set(['pilot-org']);
    expect(isOrgInNotificationV2Rollout('pilot-org', allowlist)).toBe(true);
    expect(isOrgInNotificationV2Rollout('other-org', allowlist)).toBe(false);
    expect(isOrgInNotificationV2Rollout('other-org', null)).toBe(true);
  });

  it('requires global flag and org membership', () => {
    const env = { [NOTIFICATIONS_V2_ORG_ALLOWLIST_ENV]: 'pilot-org' };
    expect(isNotificationV2EnabledForOrg(false, 'pilot-org', env)).toBe(false);
    expect(isNotificationV2EnabledForOrg(true, 'pilot-org', env)).toBe(true);
    expect(isNotificationV2EnabledForOrg(true, 'other-org', env)).toBe(false);
    expect(isNotificationV2EnabledForOrg(true, 'other-org', {})).toBe(true);
  });
});
