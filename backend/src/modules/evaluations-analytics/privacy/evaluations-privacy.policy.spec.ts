import {
  resolveEvaluationsPiiTier,
  canAccessPersonLevel,
  canRevealPersonIdentity,
  pseudonymizePersonRef,
} from './evaluations-privacy.policy';

describe('E5B/E5.1B evaluations privacy policy', () => {
  const base = {
    platformRole: null,
    membershipRole: null,
    canReadCustomers: false,
    canReadEvaluations: false,
  };

  it('grants full tier to MASTER_ADMIN and ORG_ADMIN', () => {
    expect(resolveEvaluationsPiiTier({ ...base, platformRole: 'MASTER_ADMIN' })).toBe('full');
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'ORG_ADMIN' })).toBe('full');
  });

  it('grants full only with the person-identity authority (customers.read)', () => {
    expect(
      resolveEvaluationsPiiTier({ ...base, membershipRole: 'SUB_ADMIN', canReadCustomers: true }),
    ).toBe('full');
  });

  it('grants pseudonymous with the evaluations analytics authority only', () => {
    expect(
      resolveEvaluationsPiiTier({ ...base, membershipRole: 'WORKER', canReadEvaluations: true }),
    ).toBe('pseudonymous');
  });

  it('does NOT grant person-level access from an unrelated invoices/analytics-less permission', () => {
    // A role with neither customers.read nor evaluations.read fails closed.
    expect(
      resolveEvaluationsPiiTier({ ...base, membershipRole: 'WORKER' }),
    ).toBe('none');
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: null })).toBe('none');
    // Defensive: an unknown/synthetic role string (NOT a real MembershipRole —
    // the enum is ORG_ADMIN|SUB_ADMIN|WORKER|DRIVER) fails closed. 'CUSTOMER' is
    // used here purely as an arbitrary unknown-role input, not a runtime authority.
    expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'UNKNOWN_SYNTHETIC_ROLE' })).toBe('none');
  });

  describe('E5.2.1 DRIVER person-level hard deny (MembershipRole DRIVER → none)', () => {
    // DRIVER is a real MembershipRole and a person-level data subject — never a
    // person-level viewer, regardless of module permissions.
    it('A: DRIVER + evaluations.read only → none', () => {
      expect(
        resolveEvaluationsPiiTier({ ...base, membershipRole: 'DRIVER', canReadEvaluations: true }),
      ).toBe('none');
    });
    it('B: DRIVER + customers.read only → none', () => {
      expect(
        resolveEvaluationsPiiTier({ ...base, membershipRole: 'DRIVER', canReadCustomers: true }),
      ).toBe('none');
    });
    it('C: DRIVER + evaluations.read + customers.read → none', () => {
      expect(
        resolveEvaluationsPiiTier({
          ...base,
          membershipRole: 'DRIVER',
          canReadEvaluations: true,
          canReadCustomers: true,
        }),
      ).toBe('none');
    });
    it('DRIVER with no relevant permission → none', () => {
      expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'DRIVER' })).toBe('none');
    });
    it('D/E: non-DRIVER lower roles retain their proven access (WORKER/SUB_ADMIN)', () => {
      expect(
        resolveEvaluationsPiiTier({ ...base, membershipRole: 'WORKER', canReadEvaluations: true }),
      ).toBe('pseudonymous');
      expect(
        resolveEvaluationsPiiTier({ ...base, membershipRole: 'SUB_ADMIN', canReadEvaluations: true }),
      ).toBe('pseudonymous');
      expect(
        resolveEvaluationsPiiTier({ ...base, membershipRole: 'SUB_ADMIN', canReadCustomers: true }),
      ).toBe('full');
    });
    it('F: ORG_ADMIN → full (unchanged)', () => {
      expect(resolveEvaluationsPiiTier({ ...base, membershipRole: 'ORG_ADMIN' })).toBe('full');
    });
  });

  it('exposes identity gates', () => {
    expect(canRevealPersonIdentity('full')).toBe(true);
    expect(canRevealPersonIdentity('pseudonymous')).toBe(false);
    expect(canAccessPersonLevel('pseudonymous')).toBe(true);
    expect(canAccessPersonLevel('none')).toBe(false);
  });

  describe('keyed pseudonymization (E5.1B)', () => {
    const secret = 'unit-test-secret';
    const org = 'org-a';

    it('is stable for same tenant + person + version', () => {
      const a = pseudonymizePersonRef({ organizationId: org, personId: 'cust-abcdef123456', secret });
      const b = pseudonymizePersonRef({ organizationId: org, personId: 'cust-abcdef123456', secret });
      expect(a).toBe(b);
    });

    it('contains no original-ID substring and uses a versioned digest form', () => {
      const p = pseudonymizePersonRef({ organizationId: org, personId: 'cust-abcdef123456', secret });
      expect(p).toMatch(/^person-v1-[0-9a-f]{16}$/);
      expect(p).not.toContain('cust-abcdef123456');
      expect(p).not.toContain('abcdef');
      expect(p).not.toContain('123456');
    });

    it('yields different pseudonyms for different persons', () => {
      const a = pseudonymizePersonRef({ organizationId: org, personId: 'cust-1', secret });
      const b = pseudonymizePersonRef({ organizationId: org, personId: 'cust-2', secret });
      expect(a).not.toBe(b);
    });

    it('yields different pseudonyms for the same person id across tenants', () => {
      const a = pseudonymizePersonRef({ organizationId: 'org-a', personId: 'cust-1', secret });
      const b = pseudonymizePersonRef({ organizationId: 'org-b', personId: 'cust-1', secret });
      expect(a).not.toBe(b);
    });

    it('is keyed: different secrets produce different pseudonyms (non-reversible without key)', () => {
      const a = pseudonymizePersonRef({ organizationId: org, personId: 'cust-1', secret: 'k1' });
      const b = pseudonymizePersonRef({ organizationId: org, personId: 'cust-1', secret: 'k2' });
      expect(a).not.toBe(b);
    });
  });
});
