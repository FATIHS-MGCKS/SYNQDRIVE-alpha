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

describe('OrgScopingGuard voice route characterization', () => {
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

  it('rejects tenant user when JWT org does not match :orgId', async () => {
    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-b',
          user: { id: 'user-1', organizationId: 'org-a', platformRole: 'USER' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows tenant user with matching JWT org and active membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-1', role: 'ORG_ADMIN' });

    const ctx = buildContext({
      orgId: 'org-a',
      user: { id: 'user-1', organizationId: 'org-a', platformRole: 'USER' },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'org-a',
        status: 'ACTIVE',
      },
      select: { id: true, role: true },
    });
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

  it('allows MASTER_ADMIN to access any :orgId and stamps tenantId', async () => {
    const request = {
      params: { orgId: 'org-b' },
      user: { id: 'admin-1', platformRole: 'MASTER_ADMIN' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request).toHaveProperty('tenantId', 'org-b');
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('characterizes WORKER membership as allowed when JWT org matches (no role gate on controller)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-2', role: 'WORKER' });

    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: {
            id: 'worker-1',
            organizationId: 'org-a',
            platformRole: 'USER',
            membershipRole: 'WORKER',
          },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('characterizes DRIVER membership as allowed when JWT org matches (no role gate on controller)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-3', role: 'DRIVER' });

    await expect(
      guard.canActivate(
        buildContext({
          orgId: 'org-a',
          user: {
            id: 'driver-1',
            organizationId: 'org-a',
            platformRole: 'USER',
            membershipRole: 'DRIVER',
          },
        }),
      ),
    ).resolves.toBe(true);
  });
});
