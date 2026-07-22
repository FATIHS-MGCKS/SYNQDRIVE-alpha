import { BadRequestException } from '@nestjs/common';
import {
  assertOrgAdminUpdateDoesNotTouchGlobalIdentity,
  listForbiddenGlobalFieldsInUpdate,
  ORG_ADMIN_FORBIDDEN_GLOBAL_FIELDS,
  ORG_ADMIN_MEMBERSHIP_FIELDS,
} from './org-membership-admin.policy';

describe('org-membership-admin.policy', () => {
  it('defines disjoint global vs membership field sets', () => {
    const overlap = ORG_ADMIN_FORBIDDEN_GLOBAL_FIELDS.filter((f) =>
      (ORG_ADMIN_MEMBERSHIP_FIELDS as readonly string[]).includes(f),
    );
    expect(overlap).toEqual([]);
  });

  it('detects global identity fields in update DTO', () => {
    expect(
      listForbiddenGlobalFieldsInUpdate({ email: 'a@b.c', role: 'WORKER' }),
    ).toEqual(['email']);
  });

  it('throws when org admin update touches global identity', () => {
    expect(() =>
      assertOrgAdminUpdateDoesNotTouchGlobalIdentity({ firstName: 'Ada' }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertOrgAdminUpdateDoesNotTouchGlobalIdentity({ firstName: 'Ada' }),
    ).toThrow(/global identity/i);
  });

  it('allows membership-only updates', () => {
    expect(() =>
      assertOrgAdminUpdateDoesNotTouchGlobalIdentity({
        role: 'WORKER',
        status: 'SUSPENDED',
        department: 'Fleet',
      }),
    ).not.toThrow();
  });
});
