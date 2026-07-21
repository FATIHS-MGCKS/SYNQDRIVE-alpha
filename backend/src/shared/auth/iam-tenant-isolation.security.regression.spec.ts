import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrgScopingGuard } from './org-scoping.guard';

function buildContext(params: {
  orgId?: string;
  user?: {
    id: string;
    platformRole?: string;
    organizationId?: string;
    membershipRole?: string;
  };
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: params.orgId ? { orgId: params.orgId } : {},
        user: params.user,
      }),
    }),
  } as ExecutionContext;
}

describe('IAM tenant isolation — OrgScopingGuard', () => {
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

  it('rejects cross-org JWT vs path orgId for tenant users', async () => {
    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-foreign',
          user: { id: 'user-1', organizationId: 'org-home', platformRole: 'USER' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('rejects tenant user without active membership in requested org', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: { id: 'user-1', organizationId: 'org-a', platformRole: 'USER' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows tenant user with matching JWT org and active membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-1', role: 'WORKER' });

    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: { id: 'user-1', organizationId: 'org-a', platformRole: 'USER' },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('allows MASTER_ADMIN cross-org access without membership lookup', async () => {
    const request = {
      params: { orgId: 'org-foreign' },
      user: { id: 'master-1', platformRole: 'MASTER_ADMIN' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request).toHaveProperty('tenantId', 'org-foreign');
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
