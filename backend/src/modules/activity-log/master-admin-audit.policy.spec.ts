import {
  deriveMasterAdminAuditAction,
  masterAdminReasonRequired,
  shouldSkipGenericPrivilegedSuccessAudit,
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

  it('skips generic success audit for dedicated semantic privileged routes', () => {
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/security/users/u1/sessions/s1/revoke',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/security/users/u1/sessions/revoke-all',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit('POST', '/api/v1/admin/prospects'),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit('POST', '/api/v1/admin/billing/invoices'),
    ).toBe(false);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/business-insights/run-all',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'PATCH',
        '/api/v1/admin/business-insights/policy/org-1',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit('POST', '/api/v1/admin/prospects/import'),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit('PATCH', '/api/v1/admin/insurances/partners/p1'),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/parts-accessories/providers/p1/test',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/prospects/uninstrumented-action',
      ),
    ).toBe(false);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit('GET', '/api/v1/admin/prospects/p1/contacts'),
    ).toBe(false);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/voice-assistant/organizations/org-1/twilio/subaccount/provision',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/voice-assistant/organizations/org-1/sync',
      ),
    ).toBe(true);
    expect(
      shouldSkipGenericPrivilegedSuccessAudit(
        'POST',
        '/api/v1/admin/voice-assistant/organizations/org-1/twilio/provisioning/preview',
      ),
    ).toBe(false);
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
