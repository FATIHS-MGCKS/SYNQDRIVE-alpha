import { MembershipRole, MembershipStatus } from '@prisma/client';
import {
  mapMembershipsToOrganizationOptions,
  resolveSuggestedOrganizationId,
  validateOrganizationSwitchTarget,
} from './organization-switch.policy';

describe('organization-switch.policy', () => {
  const orgA = '00000000-0000-4000-8000-0000000000a1';
  const orgB = '00000000-0000-4000-8000-0000000000b1';

  const membership = (
    overrides: Partial<{
      id: string;
      organizationId: string;
      role: MembershipRole;
      status: MembershipStatus;
    }> = {},
  ) => ({
    id: 'm-1',
    userId: 'u-1',
    organizationId: orgA,
    role: MembershipRole.WORKER,
    status: MembershipStatus.ACTIVE,
    membershipVersion: 0,
    permissions: null,
    organizationRoleId: null,
    organization: { companyName: 'Org A', logoUrl: null },
    ...overrides,
  });

  it('suggested organization only applies when membership still active', () => {
    const active = [
      membership(),
      membership({
        id: 'm-2',
        organizationId: orgB,
        role: MembershipRole.ORG_ADMIN,
      }),
    ];
    expect(resolveSuggestedOrganizationId(active, orgB)).toBe(orgB);
    expect(resolveSuggestedOrganizationId(active, 'missing-org')).toBeNull();
  });

  it('maps active memberships to organization options', () => {
    const options = mapMembershipsToOrganizationOptions([
      membership(),
      membership({ id: 'm-2', organizationId: orgB, status: MembershipStatus.SUSPENDED }),
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]?.organizationId).toBe(orgA);
  });

  it('rejects switch to inaccessible organization', () => {
    const result = validateOrganizationSwitchTarget(orgB, orgA, null);
    expect(result).toMatchObject({ ok: false, code: 'ORGANIZATION_NOT_ACCESSIBLE' });
  });

  it('rejects switch when already on target organization', () => {
    const result = validateOrganizationSwitchTarget(orgA, orgA, membership());
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_ACTIVE_ORGANIZATION' });
  });

  it('rejects suspended membership', () => {
    const result = validateOrganizationSwitchTarget(
      orgA,
      orgB,
      membership({ status: MembershipStatus.SUSPENDED }),
    );
    expect(result).toMatchObject({ ok: false, code: 'MEMBERSHIP_INACTIVE' });
  });

  it('rejects removed membership', () => {
    const result = validateOrganizationSwitchTarget(
      orgA,
      orgB,
      membership({ status: MembershipStatus.REMOVED }),
    );
    expect(result).toMatchObject({ ok: false, code: 'MEMBERSHIP_REMOVED' });
  });

  it('rejects cross-tenant binding mismatch', () => {
    const result = validateOrganizationSwitchTarget(
      orgB,
      orgA,
      membership({ organizationId: orgA }),
    );
    expect(result).toMatchObject({ ok: false, code: 'CROSS_TENANT_BINDING' });
  });
});
