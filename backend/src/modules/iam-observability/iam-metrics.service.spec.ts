import { Registry } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { IamMetricsService } from './iam-metrics.service';

describe('IamMetricsService', () => {
  let metrics: IamMetricsService;
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
    const tripMetrics = { registry } as TripMetricsService;
    metrics = new IamMetricsService(tripMetrics);
  });

  it('exposes all required IAM counters without high-cardinality labels', async () => {
    metrics.recordLoginSuccess();
    metrics.recordLoginFailure('invalid_password');
    metrics.recordSessionCreated('login');
    metrics.recordSessionRevoked('single');
    metrics.recordSessionReuseDetected();
    metrics.recordMembershipLifecycle('suspend');
    metrics.recordRoleChange('assign');
    metrics.recordPermissionChange('grant');
    metrics.recordEffectiveAccessDenied('users_roles', 'write');
    metrics.recordInvite('create');
    metrics.recordInviteDeliveryFailed('smtp');
    metrics.recordPasswordReset('self_service');
    metrics.recordMfaChallenge('verify', 'success');
    metrics.recordStepUpDenied('required');
    metrics.recordAuditOutboxFailed('USER_ROLE_CHANGED');
    metrics.recordAuditDeadLetter('USER_ROLE_CHANGED');
    metrics.recordCrossTenantDenial('org_scoping');
    metrics.recordRetentionJobFailed('sessions');
    metrics.setSeedAdminEnabled(false);
    metrics.setAccessReviewOverdue(2);
    metrics.setOrganizationsWithoutAdmin(0);

    const text = await registry.metrics();
    expect(text).toContain('iam_login_success_total');
    expect(text).toContain('iam_login_failure_total');
    expect(text).toContain('iam_session_created_total');
    expect(text).toContain('iam_session_revoked_total');
    expect(text).toContain('iam_session_reuse_detected_total');
    expect(text).toContain('iam_membership_lifecycle_total');
    expect(text).toContain('iam_role_change_total');
    expect(text).toContain('iam_permission_change_total');
    expect(text).toContain('iam_effective_access_denied_total');
    expect(text).toContain('iam_invite_total');
    expect(text).toContain('iam_invite_delivery_failed_total');
    expect(text).toContain('iam_password_reset_total');
    expect(text).toContain('iam_mfa_challenge_total');
    expect(text).toContain('iam_step_up_denied_total');
    expect(text).toContain('iam_audit_outbox_failed_total');
    expect(text).toContain('iam_audit_dead_letter_total');
    expect(text).toContain('iam_access_review_overdue_total');
    expect(text).toContain('iam_cross_tenant_denial_total');
    expect(text).toContain('iam_retention_job_failed_total');
    expect(text).toContain('iam_seed_admin_enabled');
    expect(text).not.toMatch(/userId|organizationId|membershipId/);
  });
});
