import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { SecurityGovernanceSessionAuditService } from './security-governance-session-audit.service';

describe('SecurityGovernanceSessionAuditService', () => {
  const auditDelivery = { commitAuditIntent: jest.fn().mockResolvedValue('DELIVERED') };
  const refreshTokens = {
    revokeSessionByIdInTransaction: jest.fn(),
    findSessionOrganizationId: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
  };
  let service: SecurityGovernanceSessionAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityGovernanceSessionAuditService(
      prisma as never,
      auditDelivery as never,
      refreshTokens as never,
    );
  });

  const req = {
    method: 'POST',
    originalUrl:
      '/api/v1/admin/security/users/target-user/sessions/sess-1/revoke',
    user: { id: 'actor-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    headers: { 'user-agent': 'jest' },
    requestId: 'corr-1',
  };

  it('records single session revocation with outcome metadata', async () => {
    await service.recordSingleSessionRevocation({
      req,
      targetUserId: 'target-user',
      sessionId: 'sess-1',
      outcome: 'SUCCESS',
      targetOrganizationId: 'org-1',
    });

    expect(auditDelivery.commitAuditIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        actorUserId: 'actor-1',
        entityId: 'sess-1',
        targetOrganizationId: 'org-1',
        correlationId: 'corr-1',
        after: null,
        metadata: expect.objectContaining({
          targetUserId: 'target-user',
          outcome: 'SUCCESS',
          sessionId: 'sess-1',
        }),
      }),
      expect.objectContaining({
        organizationContextId: 'org-1',
        idempotencyKey: expect.stringContaining('ma-session-audit:'),
      }),
    );
  });

  it('records revoke-all with session count', async () => {
    await service.recordRevokeAllSessions({
      req: {
        ...req,
        originalUrl: '/api/v1/admin/security/users/target-user/sessions/revoke-all',
      },
      targetUserId: 'target-user',
      revokedSessionCount: 3,
    });

    expect(auditDelivery.commitAuditIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
        metadata: expect.objectContaining({
          operation: 'REVOKE_ALL',
          revokedSessionCount: 3,
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining(
          MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
        ),
      }),
    );
  });
});