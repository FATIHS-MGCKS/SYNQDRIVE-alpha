import { MasterAdminAuditService } from './master-admin-audit.service';
import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { ActivityAction, ActivityEntity } from '@prisma/client';

describe('MasterAdminAuditService', () => {
  it('records structured privileged audit metadata', async () => {
    const audit = { record: jest.fn().mockResolvedValue('log-1') };
    const service = new MasterAdminAuditService(audit as never);

    await service.record({
      auditAction: MasterAdminAuditAction.ORG_DELETED,
      actorUserId: 'actor-1',
      actorPlatformRole: 'MASTER_ADMIN',
      targetOrganizationId: 'org-1',
      entityId: 'org-1',
      description: 'Deleted organization org-1',
      reasonCode: 'customer churn',
      correlationId: 'corr-123',
      route: 'DELETE /admin/organizations/:id',
      httpMethod: 'DELETE',
      httpStatus: 200,
      mfaStepUpAction: 'MASTER_ORGANIZATION',
      mfaAssuranceLevel: 2,
      mfaStepUpUsed: true,
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'actor-1',
        actorOrganizationId: 'org-1',
        action: ActivityAction.DELETE,
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: 'org-1',
        level: 'CRITICAL',
        metaJson: expect.objectContaining({
          auditDomain: 'MASTER_ADMIN',
          auditAction: MasterAdminAuditAction.ORG_DELETED,
          correlationId: 'corr-123',
          actor: expect.objectContaining({ userId: 'actor-1' }),
          tenant: expect.objectContaining({ organizationId: 'org-1' }),
          trace: expect.objectContaining({ correlationId: 'corr-123' }),
          diff: expect.objectContaining({ changeSummary: null }),
          reasonCode: 'customer churn',
          mfaStepUpUsed: true,
        }),
      }),
    );
  });
});
