import {
  resolveEvaluationsPiiTier,
  canAccessPersonLevel,
  canRevealPersonIdentity,
  pseudonymizePersonRef,
} from './evaluations-privacy.policy';

describe('E5B evaluations privacy policy', () => {
  const base = { platformRole: null, membershipRole: null, canReadInvoices: false, canReadCustomers: false };

  it('grants full tier to MASTER_ADMIN and ORG_ADMIN', () => {
    expect(resolveEvaluationsPiiTier({ ...base, platformRole: 'MASTER_ADMIN' })).toBe('full');
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'ORG_ADMIN' })).toBe('full');
  });

  it('grants full to SUB_ADMIN only with both invoice AND customer read', () => {
    expect(
      resolveEvaluationsPiiTier({ ...base, membershipRole: 'SUB_ADMIN', canReadInvoices: true, canReadCustomers: true }),
    ).toBe('full');
    expect(
      resolveEvaluationsPiiTier({ ...base, membershipRole: 'SUB_ADMIN', canReadInvoices: true, canReadCustomers: false }),
    ).toBe('pseudonymous');
  });

  it('grants pseudonymous when only invoice read is present', () => {
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'WORKER', canReadInvoices: true })).toBe('pseudonymous');
  });

  it('fails closed to none for DRIVER/CUSTOMER/no-membership/no-permissions', () => {
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'DRIVER' })).toBe('none');
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: null })).toBe('none');
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'WORKER' })).toBe('none');
  });

  it('exposes identity gates', () => {
    expect(canRevealPersonIdentity('full')).toBe(true);
    expect(canRevealPersonIdentity('pseudonymous')).toBe(false);
    expect(canAccessPersonLevel('pseudonymous')).toBe(true);
    expect(canAccessPersonLevel('none')).toBe(false);
  });

  it('pseudonymizes deterministically without leaking the raw id', () => {
    const a = pseudonymizePersonRef('cust-abcdef123456');
    expect(a).toBe(pseudonymizePersonRef('cust-abcdef123456'));
    expect(a).not.toContain('cust-abcdef123456');
    expect(a.startsWith('person-····')).toBe(true);
  });
});
