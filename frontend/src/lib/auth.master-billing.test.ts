// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { getStoredUser, hasMasterBillingAccess } from './auth';

const USER_KEY = 'synqdrive_user';

describe('hasMasterBillingAccess', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('allows MASTER_ADMIN', () => {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ platformRole: 'MASTER_ADMIN' }),
    );
    expect(hasMasterBillingAccess()).toBe(true);
  });

  it('allows platform operators with master-billing permission', () => {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        platformRole: 'PLATFORM_OPERATOR',
        platformPermissions: ['master-billing'],
      }),
    );
    expect(hasMasterBillingAccess()).toBe(true);
  });

  it('denies tenant users without master billing permission', () => {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        platformRole: 'ORG_ADMIN',
        platformPermissions: [],
      }),
    );
    expect(hasMasterBillingAccess()).toBe(false);
  });
});

describe('getStoredUser platformPermissions', () => {
  it('preserves optional platformPermissions from stored auth payload', () => {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        id: 'u-1',
        email: 'ops@example.com',
        name: 'Ops',
        platformRole: 'PLATFORM_OPERATOR',
        platformPermissions: ['master-billing'],
        membershipRole: null,
        organizationId: null,
        organizationName: null,
        permissions: null,
      }),
    );
    expect(getStoredUser()?.platformPermissions).toEqual(['master-billing']);
  });
});
