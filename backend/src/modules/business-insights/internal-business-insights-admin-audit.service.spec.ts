import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import {
  InternalBusinessInsightsAdminAuditService,
  policyUpdateFieldNames,
} from './internal-business-insights-admin-audit.service';

describe('InternalBusinessInsightsAdminAuditService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: InternalBusinessInsightsAdminAuditService;

  const req = {
    user: { id: 'admin-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    method: 'POST',
    originalUrl: '/api/v1/admin/business-insights/run-all',
    headers: { 'user-agent': 'jest' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InternalBusinessInsightsAdminAuditService(
      masterAdminAudit as unknown as MasterAdminAuditService,
    );
  });

  it('records QUEUED outcome for debounced trigger', () => {
    service.recordDebouncedTriggerQueued({
      req,
      targetOrganizationId: 'org-1',
      triggerSource: 'manual_debounced_trigger',
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_TRIGGER_QUEUED,
        metadata: expect.objectContaining({ outcome: 'QUEUED' }),
      }),
    );
  });

  it('records PARTIAL outcome for run-all when some orgs published zero', () => {
    service.recordManualRunAll({
      req,
      organizationCount: 3,
      totalPublished: 2,
      orgsWithZeroPublished: 1,
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_BUSINESS_INSIGHTS_RUN_ALL,
        metadata: expect.objectContaining({ outcome: 'PARTIAL' }),
        description: expect.stringContaining('partial'),
      }),
    );
  });

  it('lists policy field names only for audit sanitization helper', () => {
    expect(policyUpdateFieldNames({ enabled: true, refreshIntervalMin: undefined })).toEqual([
      'enabled',
    ]);
  });
});