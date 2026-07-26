/**
 * Cross-tenant acceptance — authentication & org scoping (CT-AUTH-*)
 */
import { ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  CROSS_TENANT_IDS,
  buildTenantUser,
  buildHttpContext,
  createGuardHarness,
  expectCrossOrgGuardDenied,
} from './cross-tenant-acceptance.harness';

describe('Cross-tenant acceptance — authentication (CT-AUTH)', () => {
  const { orgA, orgB, userA } = CROSS_TENANT_IDS;
  const { prisma, orgScopingGuard, permissionsGuard, reflector } = createGuardHarness();

  beforeEach(() => jest.clearAllMocks());

  it('CT-AUTH-01: rejects JWT org mismatch before membership lookup', async () => {
    await expectCrossOrgGuardDenied(orgScopingGuard, orgA, orgB, userA);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('CT-AUTH-02: rejects tenant user without active membership in path org', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    const user = buildTenantUser(orgA, userA);
    await expect(
      orgScopingGuard.canActivate(buildHttpContext({ orgId: orgA, user }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CT-AUTH-03: denies unauthenticated permission check', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ module: 'fleet', level: 'read' });
    await expect(
      permissionsGuard.canActivate(
        buildHttpContext({ orgId: orgA, permission: { module: 'fleet', level: 'read' } }) as never,
      ),
    ).rejects.toMatchObject({ response: { message: 'Authentication required' } });
  });

  it('CT-AUTH-04: allows tenant with matching org and active membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: CROSS_TENANT_IDS.membershipA,
      role: MembershipRole.ORG_ADMIN,
    });
    const user = buildTenantUser(orgA, userA);
    await expect(
      orgScopingGuard.canActivate(buildHttpContext({ orgId: orgA, user }) as never),
    ).resolves.toBe(true);
  });
});
