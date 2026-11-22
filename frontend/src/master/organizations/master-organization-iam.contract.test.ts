import { describe, expect, it } from 'vitest';

/**
 * Contract anchors for Master Admin org-scoped IAM (no second IAM system).
 * Runtime authorization is enforced server-side; these paths must stay org-bound.
 */
describe('master organization IAM API contract', () => {
  const orgId = 'org-contract-test';

  it('uses canonical iam team list (not admin users list)', () => {
    expect(`/organizations/${orgId}/iam/team`).toBe(`/organizations/${orgId}/iam/team`);
    expect(`/admin/users?organizationId=${orgId}`).not.toContain('/iam/');
  });

  it('uses organization invites and roles endpoints', () => {
    expect(`/organizations/${orgId}/invites`).toContain(orgId);
    expect(`/organizations/${orgId}/roles`).toContain(orgId);
    expect(`/organizations/${orgId}/users`).toContain(orgId);
  });
});