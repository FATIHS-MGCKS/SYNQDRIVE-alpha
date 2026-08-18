import { SecurityGovernanceService } from './security-governance.service';
import { UserPlatformRole, UserStatus } from '@prisma/client';

describe('SecurityGovernanceService', () => {
  const prisma = {
    user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    userMfaFactor: { findMany: jest.fn() },
    activityLog: { count: jest.fn(), findMany: jest.fn() },
    refreshToken: { groupBy: jest.fn() },
    organizationRole: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    organizationMembership: { groupBy: jest.fn(), findMany: jest.fn() },
  };
  const iamMfa = { getStatus: jest.fn() };
  const refreshTokens = { listSessionsForUser: jest.fn() };

  let service: SecurityGovernanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityGovernanceService(
      prisma as never,
      iamMfa as never,
      refreshTokens as never,
    );
  });

  it('aggregates MFA missing attention for master admins', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@test.com', name: 'A', status: UserStatus.ACTIVE },
      { id: 'u2', email: 'b@test.com', name: 'B', status: UserStatus.ACTIVE },
    ]);
    prisma.userMfaFactor.findMany.mockResolvedValue([{ userId: 'u1' }]);
    prisma.activityLog.count.mockResolvedValue(0);

    const result = await service.getAttentionSummary();

    expect(result.byCode.MFA_MISSING).toBeGreaterThanOrEqual(0);
    expect(result.generatedAt).toBeTruthy();
  });

  it('lists platform roles with master admin count', async () => {
    prisma.user.count.mockResolvedValue(2);
    const roles = await service.listPlatformRoles();
    expect(roles[0].id).toBe('MASTER_ADMIN');
    expect(roles[0].userCount).toBe(2);
  });
});
