import {
  IamSessionRevocationScope,
  IamSessionRevocationStatus,
} from '@prisma/client';
import { IamSessionPolicyService } from './iam-session-policy.service';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '@shared/database/prisma.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import {
  IAM_SESSION_INVALIDATION_POLICY,
  IAM_SESSION_INVALIDATION_TRIGGERS,
  resolveSessionInvalidationScope,
} from '@modules/users/policies/iam-session-invalidation.policy';

describe('IamSessionPolicyService', () => {
  let prisma: {
    iamSessionRevocationIntent: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock };
    organizationMembership: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let refreshTokens: {
    revokeAllActiveForUser: jest.Mock;
    revokeForOrganizationMembership: jest.Mock;
    revokeFamily: jest.Mock;
    revokePrivilegedSessionsForUser: jest.Mock;
    revokeSessionById: jest.Mock;
  };
  let userAudit: { record: jest.Mock };
  let service: IamSessionPolicyService;

  beforeEach(() => {
    prisma = {
      iamSessionRevocationIntent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn().mockResolvedValue({ sessionVersion: 2 }) },
      organizationMembership: {
        update: jest.fn().mockResolvedValue({ membershipVersion: 2 }),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    refreshTokens = {
      revokeAllActiveForUser: jest.fn().mockResolvedValue(3),
      revokeForOrganizationMembership: jest.fn().mockResolvedValue(2),
      revokeFamily: jest.fn().mockResolvedValue(4),
      revokePrivilegedSessionsForUser: jest.fn().mockResolvedValue(1),
      revokeSessionById: jest.fn().mockResolvedValue(true),
    };
    userAudit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new IamSessionPolicyService(
      prisma as unknown as PrismaService,
      refreshTokens as unknown as RefreshTokenService,
      userAudit as unknown as UserAccessAuditService,
      { notifySessionInvalidation: jest.fn() } as never,
    );
  });

  it('defines deterministic scope for every policy trigger', () => {
    for (const trigger of IAM_SESSION_INVALIDATION_TRIGGERS) {
      expect(IAM_SESSION_INVALIDATION_POLICY[trigger]).toBeDefined();
    }
  });

  it('PASSWORD_CHANGED resolves to USER_ALL_SESSIONS', () => {
    expect(resolveSessionInvalidationScope('PASSWORD_CHANGED')).toEqual([
      'USER_ALL_SESSIONS',
    ]);
  });

  it('MEMBERSHIP_SUSPENDED resolves to ORGANIZATION_MEMBERSHIP_SESSIONS', () => {
    expect(resolveSessionInvalidationScope('MEMBERSHIP_SUSPENDED')).toEqual([
      'ORGANIZATION_MEMBERSHIP_SESSIONS',
    ]);
  });

  it('REFRESH_TOKEN_REUSE_DETECTED chains family + all sessions when high risk', () => {
    expect(
      resolveSessionInvalidationScope('REFRESH_TOKEN_REUSE_DETECTED', {
        highRiskReuse: true,
      }),
    ).toEqual(['TOKEN_FAMILY', 'USER_ALL_SESSIONS']);
  });

  it('enqueueInTransaction is idempotent on repeated idempotency key', async () => {
    prisma.iamSessionRevocationIntent.findUnique.mockResolvedValue({
      id: 'intent-1',
      status: IamSessionRevocationStatus.PENDING,
    });

    const result = await service.enqueueInTransaction(prisma as never, {
      eventType: 'MEMBERSHIP_SUSPENDED',
      userId: 'user-1',
      organizationId: 'org-a',
      membershipId: 'm-1',
    });

    expect(result.intentIds).toEqual(['intent-1']);
    expect(prisma.iamSessionRevocationIntent.create).not.toHaveBeenCalled();
  });

  it('executes USER_ALL_SESSIONS by revoking all active refresh tokens', async () => {
    prisma.iamSessionRevocationIntent.findUnique.mockResolvedValue({
      id: 'intent-1',
      eventType: 'PASSWORD_CHANGED',
      scope: IamSessionRevocationScope.USER_ALL_SESSIONS,
      userId: 'user-1',
      organizationId: null,
      membershipId: null,
      refreshTokenId: null,
      tokenFamily: null,
      actorUserId: 'user-1',
      status: IamSessionRevocationStatus.PENDING,
      revokedTokenCount: 0,
    });
    prisma.iamSessionRevocationIntent.updateMany.mockResolvedValue({ count: 1 });
    prisma.iamSessionRevocationIntent.update.mockResolvedValue({});

    const result = await service.executeIntent('intent-1');

    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith('user-1');
    expect(prisma.user.update).toHaveBeenCalled();
    expect(result.revokedTokenCount).toBe(3);
    expect(userAudit.record).toHaveBeenCalled();
  });

  it('executes ORGANIZATION_MEMBERSHIP_SESSIONS without touching other org tokens globally', async () => {
    prisma.iamSessionRevocationIntent.findUnique.mockResolvedValue({
      id: 'intent-2',
      eventType: 'MEMBERSHIP_SUSPENDED',
      scope: IamSessionRevocationScope.ORGANIZATION_MEMBERSHIP_SESSIONS,
      userId: 'user-multi',
      organizationId: 'org-a',
      membershipId: 'm-a',
      refreshTokenId: null,
      tokenFamily: null,
      actorUserId: 'admin-1',
      status: IamSessionRevocationStatus.PENDING,
      revokedTokenCount: 0,
    });
    prisma.iamSessionRevocationIntent.updateMany.mockResolvedValue({ count: 1 });
    prisma.iamSessionRevocationIntent.update.mockResolvedValue({});

    await service.executeIntent('intent-2');

    expect(refreshTokens.revokeForOrganizationMembership).toHaveBeenCalledWith(
      'user-multi',
      'org-a',
    );
    expect(refreshTokens.revokeAllActiveForUser).not.toHaveBeenCalled();
  });

  it('executeIntent is idempotent when already completed', async () => {
    prisma.iamSessionRevocationIntent.findUnique.mockResolvedValue({
      id: 'intent-done',
      scope: IamSessionRevocationScope.TOKEN_FAMILY,
      status: IamSessionRevocationStatus.COMPLETED,
      revokedTokenCount: 5,
    });

    const result = await service.executeIntent('intent-done');

    expect(result.idempotentReplay).toBe(true);
    expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
  });
});
