import { orgAdminMayMutateGlobalIdentity } from './iam-global-identity.policy';

describe('iam-global-identity.policy (pure domain)', () => {
  it('forbids org admin from setting global password hash (target)', () => {
    expect(orgAdminMayMutateGlobalIdentity('SET_PASSWORD_HASH')).toBe(false);
  });

  it('forbids org admin from changing global email (target)', () => {
    expect(orgAdminMayMutateGlobalIdentity('CHANGE_EMAIL')).toBe(false);
  });

  it('forbids org admin from changing global account status (target)', () => {
    expect(orgAdminMayMutateGlobalIdentity('CHANGE_GLOBAL_STATUS')).toBe(false);
  });
});
