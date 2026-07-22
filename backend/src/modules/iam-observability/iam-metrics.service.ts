import { Injectable } from '@nestjs/common';
import { Counter, Gauge } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type IamLoginFailureReason =
  | 'unknown_email'
  | 'inactive_account'
  | 'invalid_password'
  | 'missing_credentials';

export type IamMembershipLifecycleAction =
  | 'join'
  | 'move'
  | 'suspend'
  | 'remove'
  | 'reactivate';

export type IamRoleChangeAction = 'assign' | 'update' | 'deactivate' | 'preview';

export type IamPermissionChangeAction = 'grant' | 'revoke' | 'replace';

export type IamInviteAction = 'create' | 'resend' | 'revoke' | 'accept';

export type IamPasswordResetAction = 'self_service' | 'admin_link' | 'forgot';

export type IamMfaChallengeAction = 'enroll' | 'verify' | 'step_up';

export type IamCrossTenantDenialSource =
  | 'org_scoping'
  | 'permissions'
  | 'membership'
  | 'invite'
  | 'access_review'
  | 'dsar'
  | 'other';

/**
 * Low-cardinality Prometheus metrics for IAM identity, access, and audit operations.
 * Never label with userId, organizationId, membershipId, or invite tokens.
 */
@Injectable()
export class IamMetricsService {
  readonly loginSuccessTotal: Counter<string>;
  readonly loginFailureTotal: Counter<string>;
  readonly sessionCreatedTotal: Counter<string>;
  readonly sessionRevokedTotal: Counter<string>;
  readonly sessionReuseDetectedTotal: Counter<string>;
  readonly membershipLifecycleTotal: Counter<string>;
  readonly roleChangeTotal: Counter<string>;
  readonly permissionChangeTotal: Counter<string>;
  readonly effectiveAccessDeniedTotal: Counter<string>;
  readonly inviteTotal: Counter<string>;
  readonly inviteDeliveryFailedTotal: Counter<string>;
  readonly passwordResetTotal: Counter<string>;
  readonly mfaChallengeTotal: Counter<string>;
  readonly stepUpDeniedTotal: Counter<string>;
  readonly auditOutboxFailedTotal: Counter<string>;
  readonly auditDeadLetterTotal: Counter<string>;
  readonly accessReviewOverdueTotal: Gauge<string>;
  readonly crossTenantDenialTotal: Counter<string>;
  readonly retentionJobFailedTotal: Counter<string>;
  readonly seedAdminEnabled: Gauge<string>;
  readonly organizationsWithoutAdminTotal: Gauge<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.loginSuccessTotal = new Counter({
      name: 'iam_login_success_total',
      help: 'Successful IAM password logins',
      labelNames: ['method'],
      registers: [register],
    });

    this.loginFailureTotal = new Counter({
      name: 'iam_login_failure_total',
      help: 'Failed IAM login attempts',
      labelNames: ['reason'],
      registers: [register],
    });

    this.sessionCreatedTotal = new Counter({
      name: 'iam_session_created_total',
      help: 'Refresh-token sessions created',
      labelNames: ['source'],
      registers: [register],
    });

    this.sessionRevokedTotal = new Counter({
      name: 'iam_session_revoked_total',
      help: 'Refresh-token sessions revoked',
      labelNames: ['scope'],
      registers: [register],
    });

    this.sessionReuseDetectedTotal = new Counter({
      name: 'iam_session_reuse_detected_total',
      help: 'Refresh-token reuse detections (family revocation)',
      registers: [register],
    });

    this.membershipLifecycleTotal = new Counter({
      name: 'iam_membership_lifecycle_total',
      help: 'Membership lifecycle transitions',
      labelNames: ['action', 'outcome'],
      registers: [register],
    });

    this.roleChangeTotal = new Counter({
      name: 'iam_role_change_total',
      help: 'Organization role definition or assignment changes',
      labelNames: ['action'],
      registers: [register],
    });

    this.permissionChangeTotal = new Counter({
      name: 'iam_permission_change_total',
      help: 'Membership permission mutations',
      labelNames: ['action'],
      registers: [register],
    });

    this.effectiveAccessDeniedTotal = new Counter({
      name: 'iam_effective_access_denied_total',
      help: 'Permission guard denials for effective access checks',
      labelNames: ['module', 'level'],
      registers: [register],
    });

    this.inviteTotal = new Counter({
      name: 'iam_invite_total',
      help: 'Organization invite lifecycle events',
      labelNames: ['action', 'outcome'],
      registers: [register],
    });

    this.inviteDeliveryFailedTotal = new Counter({
      name: 'iam_invite_delivery_failed_total',
      help: 'Invite email delivery failures',
      labelNames: ['reason'],
      registers: [register],
    });

    this.passwordResetTotal = new Counter({
      name: 'iam_password_reset_total',
      help: 'Password reset flows initiated or completed',
      labelNames: ['action', 'outcome'],
      registers: [register],
    });

    this.mfaChallengeTotal = new Counter({
      name: 'iam_mfa_challenge_total',
      help: 'MFA enrollment and verification challenges',
      labelNames: ['action', 'outcome'],
      registers: [register],
    });

    this.stepUpDeniedTotal = new Counter({
      name: 'iam_step_up_denied_total',
      help: 'Privileged step-up authentication denials',
      labelNames: ['reason'],
      registers: [register],
    });

    this.auditOutboxFailedTotal = new Counter({
      name: 'iam_audit_outbox_failed_total',
      help: 'IAM audit outbox processing failures scheduled for retry',
      labelNames: ['event_type'],
      registers: [register],
    });

    this.auditDeadLetterTotal = new Counter({
      name: 'iam_audit_dead_letter_total',
      help: 'IAM audit outbox events moved to dead letter',
      labelNames: ['event_type'],
      registers: [register],
    });

    this.accessReviewOverdueTotal = new Gauge({
      name: 'iam_access_review_overdue_total',
      help: 'Active access review campaigns past due date',
      registers: [register],
    });

    this.crossTenantDenialTotal = new Counter({
      name: 'iam_cross_tenant_denial_total',
      help: 'Cross-tenant access denials',
      labelNames: ['source'],
      registers: [register],
    });

    this.retentionJobFailedTotal = new Counter({
      name: 'iam_retention_job_failed_total',
      help: 'IAM data retention job phase failures',
      labelNames: ['phase'],
      registers: [register],
    });

    this.seedAdminEnabled = new Gauge({
      name: 'iam_seed_admin_enabled',
      help: '1 when ENABLE_SEED_ADMIN=true (should be 0 in production)',
      registers: [register],
    });

    this.organizationsWithoutAdminTotal = new Gauge({
      name: 'iam_organizations_without_admin_total',
      help: 'Organizations with zero active ORG_ADMIN memberships',
      registers: [register],
    });
  }

  recordLoginSuccess(method = 'password') {
    this.loginSuccessTotal.inc({ method });
  }

  recordLoginFailure(reason: IamLoginFailureReason) {
    this.loginFailureTotal.inc({ reason });
  }

  recordSessionCreated(source: 'login' | 'refresh' | 'switch' | 'invite_accept' = 'login') {
    this.sessionCreatedTotal.inc({ source });
  }

  recordSessionRevoked(scope: 'single' | 'all' | 'family' | 'membership' | 'password_reset') {
    this.sessionRevokedTotal.inc({ scope });
  }

  recordSessionReuseDetected() {
    this.sessionReuseDetectedTotal.inc();
  }

  recordMembershipLifecycle(action: IamMembershipLifecycleAction, outcome: 'success' | 'denied' = 'success') {
    this.membershipLifecycleTotal.inc({ action, outcome });
  }

  recordRoleChange(action: IamRoleChangeAction) {
    this.roleChangeTotal.inc({ action });
  }

  recordPermissionChange(action: IamPermissionChangeAction) {
    this.permissionChangeTotal.inc({ action });
  }

  recordEffectiveAccessDenied(module: string, level: string) {
    this.effectiveAccessDeniedTotal.inc({ module, level });
  }

  recordInvite(action: IamInviteAction, outcome: 'success' | 'denied' | 'failed' = 'success') {
    this.inviteTotal.inc({ action, outcome });
  }

  recordInviteDeliveryFailed(reason: 'smtp' | 'rate_limit' | 'invalid_recipient' | 'other') {
    this.inviteDeliveryFailedTotal.inc({ reason });
  }

  recordPasswordReset(action: IamPasswordResetAction, outcome: 'success' | 'denied' | 'failed' = 'success') {
    this.passwordResetTotal.inc({ action, outcome });
  }

  recordMfaChallenge(action: IamMfaChallengeAction, outcome: 'success' | 'failed' | 'denied' = 'success') {
    this.mfaChallengeTotal.inc({ action, outcome });
  }

  recordStepUpDenied(reason: 'required' | 'expired' | 'invalid') {
    this.stepUpDeniedTotal.inc({ reason });
  }

  recordAuditOutboxFailed(eventType: string) {
    this.auditOutboxFailedTotal.inc({ event_type: eventType });
  }

  recordAuditDeadLetter(eventType: string) {
    this.auditDeadLetterTotal.inc({ event_type: eventType });
  }

  recordCrossTenantDenial(source: IamCrossTenantDenialSource) {
    this.crossTenantDenialTotal.inc({ source });
  }

  recordRetentionJobFailed(phase: string) {
    this.retentionJobFailedTotal.inc({ phase });
  }

  setSeedAdminEnabled(enabled: boolean) {
    this.seedAdminEnabled.set(enabled ? 1 : 0);
  }

  setAccessReviewOverdue(count: number) {
    this.accessReviewOverdueTotal.set(count);
  }

  setOrganizationsWithoutAdmin(count: number) {
    this.organizationsWithoutAdminTotal.set(count);
  }
}
