import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditService } from './master-admin-audit.service';
import {
  catalogMutationFieldNames,
  MasterCatalogAdminAuditService,
} from './master-catalog-admin-audit.service';

describe('MasterCatalogAdminAuditService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: MasterCatalogAdminAuditService;

  const req = {
    user: { id: 'admin-1', platformRole: 'MASTER_ADMIN', platformPermissions: [] },
    method: 'POST',
    originalUrl: '/api/v1/admin/prospects',
    headers: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterCatalogAdminAuditService(
      masterAdminAudit as unknown as MasterAdminAuditService,
    );
  });

  it('records prospect CREATE with entity id and HTTP 201', () => {
    service.recordMutation({
      req,
      domain: 'PROSPECT',
      operation: 'CREATE',
      resource: 'prospect',
      entityId: 'prospect-1',
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.MASTER_PROSPECT_CATALOG_MUTATION,
        entityId: 'prospect-1',
        httpStatus: 201,
        actorUserId: 'admin-1',
        metadata: expect.objectContaining({ operation: 'CREATE', outcome: 'SUCCESS' }),
      }),
    );
  });

  it('records connection test failure without sensitive payload', () => {
    service.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'CONNECTION_TEST',
      resource: 'insurance_partner',
      entityId: 'partner-1',
      outcome: 'TEST_FAILED',
    });
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'WARN',
        metadata: expect.objectContaining({ outcome: 'TEST_FAILED' }),
      }),
    );
    expect(JSON.stringify(masterAdminAudit.record.mock.calls)).not.toMatch(/password|secret/i);
  });

  it('lists mutation field names only', () => {
    expect(catalogMutationFieldNames({ enabled: true, name: undefined })).toEqual(['enabled']);
    expect(catalogMutationFieldNames(['x'])).toEqual([]);
  });
});