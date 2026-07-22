import type { AccessReviewRiskReason } from './iam-access-review.policy';

export const IAM_TEAM_API_VERSION = 1 as const;

export type IamMfaState =
  | 'ENABLED'
  | 'DISABLED'
  | 'REQUIRED'
  | 'UNKNOWN'
  | 'NOT_SUPPORTED'
  | 'ACTION_REQUIRED';

export type IamRiskClassification = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IamReviewState = 'NONE' | 'PENDING' | 'OVERDUE' | 'COMPLETED';

export interface IamUserSummary {
  userId: string | null;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}

export interface IamTeamListItem {
  kind: 'MEMBER' | 'INVITE';
  membershipId: string | null;
  inviteId: string | null;
  userSummary: IamUserSummary;
  membershipStatus: string;
  effectiveRole: string;
  effectiveRoleLabel: string | null;
  riskClassification: IamRiskClassification;
  stationScopeSummary: string;
  mfaState: IamMfaState;
  activeSessionCount: number;
  lastActivityAt: string | null;
  reviewState: IamReviewState;
  requiresAction: boolean;
  reasonCodes: AccessReviewRiskReason[];
}

export interface IamTeamKpis {
  activeUsers: number;
  openInvites: number;
  privilegedAccounts: number;
  reviewRequired: number;
}

export interface IamEffectiveAccess {
  membershipId: string;
  membershipVersion: number;
  effectiveRole: string;
  effectiveRoleId: string | null;
  effectiveRoleLabel: string | null;
  privilegedCapabilities: string[];
  permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
  stationScope: string | null;
  stationIds: string[] | null;
  stationNames: string[];
  fieldAgentAccess: boolean;
  riskClassification: IamRiskClassification;
  reasonCodes: AccessReviewRiskReason[];
  isLastOrgAdmin: boolean;
}

export interface IamAvailableAction {
  enabled: boolean;
  requiresStepUp?: boolean;
  blockedReason?: string | null;
  impactPreview?: string | null;
}

export interface IamTeamMemberDetail {
  membershipId: string;
  userId: string;
  userSummary: IamUserSummary;
  membershipStatus: string;
  effectiveAccess: IamEffectiveAccess;
  inheritedPermissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
  overrides: {
    permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
    stationScope: string | null;
    stationIds: string[] | null;
    fieldAgentAccess: boolean;
  };
  roleVersion: string;
  scope: {
    stationScope: string | null;
    stationIds: string[] | null;
    stationNames: string[];
    fieldAgentAccess: boolean;
  };
  sessions: {
    activeSessionCount: number;
    items: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      ipAddress: string | null;
      userAgent: string | null;
      isCurrent: boolean;
    }>;
  };
  securityEvents: Array<{
    id: string;
    action: string;
    description: string;
    auditAction: string | null;
    createdAt: string;
    level: string;
  }>;
  inviteHistory: Array<{
    id: string;
    status: string;
    createdAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
  }>;
  accessReviews: Array<{
    id: string;
    campaignId: string;
    status: string;
    effectiveRole: string | null;
    riskReasons: string[];
    createdAt: string;
  }>;
  auditTimeline: Array<{
    id: string;
    action: string;
    description: string;
    auditAction: string | null;
    createdAt: string;
    level: string;
  }>;
  mfaState: IamMfaState;
  reviewState: IamReviewState;
  requiresAction: boolean;
  reasonCodes: AccessReviewRiskReason[];
  availableActions: {
    sendResetLink: IamAvailableAction;
    revokeSessions: IamAvailableAction;
    suspendMembership: IamAvailableAction;
    changeRole: IamAvailableAction;
    changeScope: IamAvailableAction;
    openAccessReview: IamAvailableAction;
  };
}

export interface IamRoleListItem {
  id: string;
  name: string;
  description: string | null;
  membershipRole: string;
  assignmentCount: number;
  riskClassification: IamRiskClassification;
  roleVersion: string;
  lastChangedAt: string;
  isSystemTemplate: boolean;
  isDefault: boolean;
  followsLatest: boolean;
  pinned: boolean;
  isActive: boolean;
}

export interface IamRoleDetail extends IamRoleListItem {
  effectivePermissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null;
  overrides: {
    stationScopeDefault: string | null;
    defaultStationIds: string[];
    fieldAgentAccessDefault: boolean;
  };
  impactPreview: {
    affectedMemberCount: number;
    privilegedCapabilities: string[];
    stationScopeImpact: string;
  };
  assignments: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    membershipStatus: string;
  }>;
}

export interface IamSecurityOverview {
  mfaSummary: Record<IamMfaState, number>;
  activeSessions: number;
  privilegedAccounts: number;
  reviewRequired: number;
  loginSecurityEvents: Array<{
    id: string;
    userId: string | null;
    description: string;
    createdAt: string;
    level: string;
  }>;
  iamAudit: Array<{
    id: string;
    auditAction: string | null;
    description: string;
    createdAt: string;
    level: string;
  }>;
  accessReviews: Array<{
    id: string;
    status: string;
    scope: string;
    dueAt: string;
    pendingItems: number;
  }>;
  privilegedMembers: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    riskClassification: IamRiskClassification;
    mfaState: IamMfaState;
  }>;
}
