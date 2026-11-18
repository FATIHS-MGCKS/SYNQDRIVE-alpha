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

  describe('catalog semantic audit ActivityAction mapping', () => {
    const audit = { record: jest.fn().mockResolvedValue('log-1') };
    const service = new MasterAdminAuditService(audit as never);

    beforeEach(() => jest.clearAllMocks());

    async function recordCatalog(operation: string) {
      await service.record({
        auditAction: MasterAdminAuditAction.MASTER_PROSPECT_CATALOG_MUTATION,
        actorUserId: 'actor-1',
        actorPlatformRole: 'MASTER_ADMIN',
        correlationId: 'corr-cat',
        description: 'catalog mutation',
        metadata: { operation },
      });
    }

    it('maps CREATE to ActivityAction.CREATE', async () => {
      await recordCatalog('CREATE');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: ActivityAction.CREATE }),
      );
    });

    it('maps UPDATE to ActivityAction.UPDATE', async () => {
      await recordCatalog('UPDATE');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: ActivityAction.UPDATE }),
      );
    });

    it('maps DELETE to ActivityAction.DELETE', async () => {
      await recordCatalog('DELETE');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: ActivityAction.DELETE }),
      );
    });

    it('leaves ORG_DELETED classification unchanged', async () => {
      await service.record({
        auditAction: MasterAdminAuditAction.ORG_DELETED,
        actorUserId: 'actor-1',
        correlationId: 'corr-org',
        description: 'delete org',
        metadata: { operation: 'CREATE' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: ActivityAction.DELETE }),
      );
    });
  });
});
