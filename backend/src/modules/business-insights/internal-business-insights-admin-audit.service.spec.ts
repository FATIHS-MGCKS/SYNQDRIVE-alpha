import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import {
  InternalBusinessInsightsAdminAuditService,
  policyUpdateFieldNames,
} from './internal-business-insights-admin-audit.service';

describe('InternalBusinessInsightsAdminAuditService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: InternalBusinessInsightsAdminAuditService;

  const postReq = {
    user: { id: 'admin-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    method: 'POST',
    originalUrl: '/api/v1/admin/business-insights/run-all',
    headers: { 'user-agent': 'jest' },
  };

  const patchReq = { ...postReq, method: 'PATCH' };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InternalBusinessInsightsAdminAuditService(
      masterAdminAudit as unknown as MasterAdminAuditService,
    );
  });

  it('records QUEUED outcome for debounced trigger with HTTP 201', () => {
    service.recordDebouncedTriggerQueued({
      req: postReq,
      targetOrganizationId: 'org-1',
      triggerSource: 'manual_debounced_trigger',
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_TRIGGER_QUEUED,
        httpStatus: 201,
        metadata: expect.objectContaining({ outcome: 'QUEUED' }),
      }),
    );
  });

  it('records FINISHED run-all with counts but not PARTIAL when some orgs published zero', () => {
    service.recordManualRunAll({
      req: postReq,
      organizationCount: 3,
      totalPublished: 2,
      orgsWithZeroPublished: 1,
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ALL,
        httpStatus: 201,
        metadata: expect.objectContaining({
          outcome: 'FINISHED',
          orgsWithZeroPublished: 1,
        }),
      }),
    );
    expect(masterAdminAudit.record.mock.calls[0][0].metadata.outcome).not.toBe('PARTIAL');
  });

  it('classifies runId with zero published as EXECUTION_UNCERTAIN', () => {
    service.recordManualRunOrg({
      req: postReq,
      targetOrganizationId: 'org-1',
      trigger: 'manual_admin_single',
      runId: 'run-err',
      published: 0,
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'EXECUTION_UNCERTAIN' }),
      }),
    );
  });

  it('classifies disabled org as INSIGHTS_DISABLED', () => {
    service.recordManualRunOrg({
      req: postReq,
      targetOrganizationId: 'org-1',
      trigger: 'manual_admin_single',
      runId: '',
      published: 0,
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'INSIGHTS_DISABLED' }),
      }),
    );
  });

  it('classifies positive published as EXECUTED', () => {
    service.recordManualRunOrg({
      req: postReq,
      targetOrganizationId: 'org-1',
      trigger: 'manual_admin_single',
      runId: 'run-ok',
      published: 2,
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'EXECUTED', publishedCount: 2 }),
      }),
    );
  });

  it('records policy patch audit with HTTP 200', () => {
    service.recordPolicyUpdate({
      req: patchReq,
      targetOrganizationId: 'org-1',
      updatedFieldNames: ['enabled'],
      enabledAfter: true,
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_POLICY_UPDATED,
        httpStatus: 200,
      }),
    );
  });

  it('lists policy field names only for audit sanitization helper', () => {
    expect(policyUpdateFieldNames({ enabled: true, refreshIntervalMin: undefined })).toEqual([
      'enabled',
    ]);
  });
});