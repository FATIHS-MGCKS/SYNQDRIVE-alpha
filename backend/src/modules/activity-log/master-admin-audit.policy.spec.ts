import {
  deriveMasterAdminAuditAction,
  masterAdminReasonRequired,
} from './master-admin-audit.policy';
import { MasterAdminAuditAction } from './master-admin-audit.contract';

describe('master-admin-audit.policy', () => {
  it('requires reason for destructive admin routes', () => {
    expect(
      masterAdminReasonRequired('DELETE', '/api/v1/admin/organizations/org-1'),
    ).toBe(true);
    expect(masterAdminReasonRequired('POST', '/api/v1/admin/prune')).toBe(true);
    expect(masterAdminReasonRequired('PATCH', '/api/v1/admin/organizations/org-1')).toBe(false);
  });

  it('derives structured audit actions from route patterns', () => {
    expect(
      deriveMasterAdminAuditAction('DELETE', '/api/v1/admin/organizations/org-1'),
    ).toBe(MasterAdminAuditAction.ORG_DELETED);
    expect(
      deriveMasterAdminAuditAction('POST', '/api/v1/admin/billing/pricebooks'),
    ).toBe(MasterAdminAuditAction.BILLING_MUTATION);
    expect(
      deriveMasterAdminAuditAction(
        'POST',
        '/api/v1/admin/billing/organizations/org-1/subscription/activate',
      ),
    ).toBe(MasterAdminAuditAction.SUBSCRIPTION_MUTATION);
  });
});
