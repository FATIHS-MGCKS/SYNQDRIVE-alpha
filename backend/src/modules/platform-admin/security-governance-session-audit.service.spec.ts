import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { SecurityGovernanceSessionAuditService } from './security-governance-session-audit.service';

describe('SecurityGovernanceSessionAuditService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: SecurityGovernanceSessionAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityGovernanceSessionAuditService(masterAdminAudit as never);
  });

  const req = {
    method: 'POST',
    originalUrl:
      '/api/v1/admin/security/users/target-user/sessions/sess-1/revoke',
    user: { id: 'actor-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    headers: { 'user-agent': 'jest' },
    requestId: 'corr-1',
  };

  it('records single session revocation with outcome metadata', () => {
    service.recordSingleSessionRevocation({
      req,
      targetUserId: 'target-user',
      sessionId: 'sess-1',
      outcome: 'SUCCESS',
      targetOrganizationId: 'org-1',
    });

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
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
    );
  });

  it('records revoke-all with session count', () => {
    service.recordRevokeAllSessions({
      req: {
        ...req,
        originalUrl: '/api/v1/admin/security/users/target-user/sessions/revoke-all',
      },
      targetUserId: 'target-user',
      revokedSessionCount: 3,
    });

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
        metadata: expect.objectContaining({
          operation: 'REVOKE_ALL',
          revokedSessionCount: 3,
        }),
      }),
    );
  });
});