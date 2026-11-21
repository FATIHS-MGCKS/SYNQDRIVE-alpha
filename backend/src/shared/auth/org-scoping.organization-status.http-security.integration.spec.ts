import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { OrgScopingGuard } from './org-scoping.guard';
import { ORGANIZATION_LIFECYCLE_DENIED_CODE } from './organization-lifecycle-access.policy';

function buildContext(input: {
  orgId?: string;
  user?: Record<string, unknown>;
  method?: string;
  url?: string;
}): ExecutionContext {
  const request = {
    params: input.orgId ? { orgId: input.orgId } : {},
    user: input.user,
    method: input.method ?? 'GET',
    url: input.url ?? `/api/v1/organizations/${input.orgId}/vehicles`,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('OrgScopingGuard — organization lifecycle status', () => {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };
  let guard: OrgScopingGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OrgScopingGuard(prisma as never);
  });

  const tenantUser = { id: 'u-1', platformRole: 'USER', organizationId: 'org-a' };

  it('ACTIVE membership + ACTIVE org allows operational route', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      role: 'WORKER',
      organization: { status: OrganizationStatus.ACTIVE },
    });
    await expect(
      guard.canActivate(buildContext({ orgId: 'org-a', user: tenantUser })),
    ).resolves.toBe(true);
  });

  it('SUSPENDED org denies operational route', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      role: 'WORKER',
      organization: { status: OrganizationStatus.SUSPENDED },
    });
    await expect(
      guard.canActivate(buildContext({ orgId: 'org-a', user: tenantUser })),
    ).rejects.toMatchObject({
      response: { code: ORGANIZATION_LIFECYCLE_DENIED_CODE },
    });
  });

  it('PENDING org allows profile onboarding route', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      role: 'ORG_ADMIN',
      organization: { status: OrganizationStatus.PENDING },
    });
    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: tenantUser,
          method: 'PATCH',
          url: '/api/v1/organizations/org-a/profile',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('PENDING org denies bookings operational route', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'm-1',
      role: 'WORKER',
      organization: { status: OrganizationStatus.PENDING },
    });
    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: tenantUser,
          url: '/api/v1/organizations/org-a/bookings',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MASTER_ADMIN bypasses lifecycle check', async () => {
    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: { id: 'ma-1', platformRole: 'MASTER_ADMIN' },
        }),
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('cross-tenant JWT still denied before lifecycle check', async () => {
    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-b',
          user: { id: 'u-1', organizationId: 'org-a', platformRole: 'USER' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});