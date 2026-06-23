import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { resolveOrgScope } from './billing-scope.util';

describe('resolveOrgScope', () => {
  it('allows org user to access own org without query param', () => {
    expect(
      resolveOrgScope({ platformRole: 'USER', organizationId: 'org-a' }, undefined),
    ).toBe('org-a');
  });

  it('rejects org user spoofing another orgId', () => {
    expect(() =>
      resolveOrgScope({ platformRole: 'USER', organizationId: 'org-a' }, 'org-b'),
    ).toThrow(ForbiddenException);
  });

  it('requires orgId for master admin', () => {
    expect(() =>
      resolveOrgScope({ platformRole: 'MASTER_ADMIN', organizationId: null }, undefined),
    ).toThrow(NotFoundException);
  });

  it('allows master admin with explicit orgId', () => {
    expect(
      resolveOrgScope({ platformRole: 'MASTER_ADMIN' }, 'org-b'),
    ).toBe('org-b');
  });
});
