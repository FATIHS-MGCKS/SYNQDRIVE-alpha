import {
  AccessReviewCampaignScope,
  AccessReviewDecisionType,
  MembershipRole,
  MembershipStatus,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { isPrivilegedAccount } from '@modules/iam-mfa/iam-mfa.policy';

export const ACCESS_REVIEW_RISK = {
  PRIVILEGED_ACCOUNT: 'PRIVILEGED_ACCOUNT',
  SINGLE_ORG_ADMIN: 'SINGLE_ORG_ADMIN',
  INACTIVE_USER: 'INACTIVE_USER',
  INVALID_ROLE: 'INVALID_ROLE',
  MFA_NOT_ENROLLED: 'MFA_NOT_ENROLLED',
  OVERDUE_REVIEW: 'OVERDUE_REVIEW',
  NO_RECENT_ACTIVITY: 'NO_RECENT_ACTIVITY',
  BREAK_GLASS_CANDIDATE: 'BREAK_GLASS_CANDIDATE',
} as const;

export type AccessReviewRiskReason =
  (typeof ACCESS_REVIEW_RISK)[keyof typeof ACCESS_REVIEW_RISK];

export const ACCESS_REVIEW_ERROR = {
  CAMPAIGN_NOT_FOUND: 'ACCESS_REVIEW_CAMPAIGN_NOT_FOUND',
  ITEM_NOT_FOUND: 'ACCESS_REVIEW_ITEM_NOT_FOUND',
  CROSS_TENANT: 'ACCESS_REVIEW_CROSS_TENANT',
  INVALID_STATUS: 'ACCESS_REVIEW_INVALID_STATUS',
  STALE_SNAPSHOT: 'ACCESS_REVIEW_STALE_SNAPSHOT',
  LAST_ADMIN: 'ACCESS_REVIEW_LAST_ADMIN_BLOCKED',
  BREAK_GLASS: 'ACCESS_REVIEW_BREAK_GLASS_BLOCKED',
  DECISION_ALREADY_RECORDED: 'ACCESS_REVIEW_DECISION_ALREADY_RECORDED',
  MODIFY_PAYLOAD_REQUIRED: 'ACCESS_REVIEW_MODIFY_PAYLOAD_REQUIRED',
} as const;

export const INACTIVE_USER_DAYS = 90;
export const NO_ACTIVITY_DAYS = 60;

export interface EffectiveAccessSnapshot {
  membershipId: string;
  userId: string;
  membershipStatus: MembershipStatus;
  membershipVersion: number;
  effectiveRole: MembershipRole;
  effectiveRoleId: string | null;
  effectiveRoleLabel: string | null;
  privilegedCapabilities: string[];
  stationScope: string | null;
  stationIds: string[] | null;
  permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
  lastActivityAt: string | null;
  mfaEnrolled: boolean;
  activeSessionCount: number;
  riskReasons: AccessReviewRiskReason[];
  platformRole: UserPlatformRole;
  userStatus: UserStatus;
  userEmail: string;
  roleIsActive: boolean;
}

export function extractPrivilegedCapabilities(permissions: unknown): string[] {
  const normalized = normalizeMembershipPermissions(permissions);
  if (!normalized) return [];
  return Object.entries(normalized)
    .filter(([, level]) => Boolean(level?.manage))
    .map(([module]) => `${module}:manage`);
}

export function computeRiskReasons(input: {
  platformRole: UserPlatformRole;
  userStatus: UserStatus;
  membershipRole: MembershipRole;
  permissions: unknown;
  mfaEnrolled: boolean;
  lastActivityAt: Date | null;
  roleIsActive: boolean;
  organizationRoleId: string | null;
  isSingleOrgAdmin: boolean;
  hasOverdueReview: boolean;
}): AccessReviewRiskReason[] {
  const reasons: AccessReviewRiskReason[] = [];

  if (input.platformRole === UserPlatformRole.MASTER_ADMIN) {
    reasons.push(ACCESS_REVIEW_RISK.BREAK_GLASS_CANDIDATE);
  }

  if (
    isPrivilegedAccount({
      platformRole: input.platformRole,
      membershipRole: input.membershipRole,
      permissions: input.permissions,
    })
  ) {
    reasons.push(ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT);
  }

  if (input.isSingleOrgAdmin) {
    reasons.push(ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN);
  }

  if (
    input.userStatus !== UserStatus.ACTIVE ||
    (input.lastActivityAt &&
      Date.now() - input.lastActivityAt.getTime() > INACTIVE_USER_DAYS * 24 * 60 * 60 * 1000)
  ) {
    reasons.push(ACCESS_REVIEW_RISK.INACTIVE_USER);
  }

  if (input.organizationRoleId && !input.roleIsActive) {
    reasons.push(ACCESS_REVIEW_RISK.INVALID_ROLE);
  }
  if (!input.organizationRoleId && input.membershipRole === MembershipRole.ORG_ADMIN) {
    // admin without template is still valid
  } else if (!input.organizationRoleId && input.membershipRole !== MembershipRole.DRIVER) {
    reasons.push(ACCESS_REVIEW_RISK.INVALID_ROLE);
  }

  if (
    isPrivilegedAccount({
      platformRole: input.platformRole,
      membershipRole: input.membershipRole,
      permissions: input.permissions,
    }) &&
    !input.mfaEnrolled
  ) {
    reasons.push(ACCESS_REVIEW_RISK.MFA_NOT_ENROLLED);
  }

  if (input.hasOverdueReview) {
    reasons.push(ACCESS_REVIEW_RISK.OVERDUE_REVIEW);
  }

  if (
    input.lastActivityAt &&
    Date.now() - input.lastActivityAt.getTime() > NO_ACTIVITY_DAYS * 24 * 60 * 60 * 1000
  ) {
    reasons.push(ACCESS_REVIEW_RISK.NO_RECENT_ACTIVITY);
  }

  return [...new Set(reasons)];
}

export function assertDecisionAllowed(input: {
  decision: AccessReviewDecisionType;
  riskReasons: AccessReviewRiskReason[];
  isLastOrgAdmin: boolean;
}): void {
  if (
    input.riskReasons.includes(ACCESS_REVIEW_RISK.BREAK_GLASS_CANDIDATE) &&
    (input.decision === AccessReviewDecisionType.SUSPEND ||
      input.decision === AccessReviewDecisionType.REMOVE)
  ) {
    throw Object.assign(new Error(ACCESS_REVIEW_ERROR.BREAK_GLASS), {
      code: ACCESS_REVIEW_ERROR.BREAK_GLASS,
    });
  }

  if (
    input.isLastOrgAdmin &&
    (input.decision === AccessReviewDecisionType.SUSPEND ||
      input.decision === AccessReviewDecisionType.REMOVE)
  ) {
    throw Object.assign(new Error(ACCESS_REVIEW_ERROR.LAST_ADMIN), {
      code: ACCESS_REVIEW_ERROR.LAST_ADMIN,
    });
  }
}

export function matchesCampaignScope(
  scope: AccessReviewCampaignScope,
  ctx: {
    privileged: boolean;
    isSingleOrgAdmin: boolean;
    inactive: boolean;
    invalidRole: boolean;
    overdueReview: boolean;
  },
): boolean {
  switch (scope) {
    case AccessReviewCampaignScope.PRIVILEGED_ACCOUNTS:
      return ctx.privileged;
    case AccessReviewCampaignScope.SINGLE_ADMIN:
      return ctx.isSingleOrgAdmin;
    case AccessReviewCampaignScope.INACTIVE_USERS:
      return ctx.inactive;
    case AccessReviewCampaignScope.INVALID_ROLE_MEMBERSHIP:
      return ctx.invalidRole;
    case AccessReviewCampaignScope.OVERDUE_REVIEWS:
      return ctx.overdueReview;
    default:
      return false;
  }
}
