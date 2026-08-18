export type SecurityAttentionCode =
  | 'MFA_MISSING'
  | 'MFA_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'PRIVILEGE_CHANGED';

export type GovernanceMfaState =
  | 'ENABLED'
  | 'DISABLED'
  | 'REQUIRED'
  | 'UNKNOWN'
  | 'NOT_SUPPORTED'
  | 'ACTION_REQUIRED';

export interface SecurityAttentionItem {
  code: SecurityAttentionCode;
  userId: string;
  displayName: string;
  email: string;
  message: string;
}

export interface SecurityAttentionSummaryDto {
  total: number;
  byCode: Record<SecurityAttentionCode, number>;
  topItems: SecurityAttentionItem[];
  generatedAt: string;
  mfaMasterAdminPolicyEnabled: boolean;
}

export interface GovernanceUserListItemDto {
  id: string;
  name: string;
  email: string;
  role: string;
  platformRole: string | null;
  organizationId: string;
  organizationName: string;
  accountState: string;
  status: string;
  mfaState: GovernanceMfaState;
  attentionCodes: SecurityAttentionCode[];
  lastActive: string | null;
  activeSessionCount: number;
}

export interface GovernanceUserMembershipDto {
  organizationId: string;
  organizationName: string;
  role: string;
  roleLabel: string;
  status: string;
}

export interface GovernanceUserDetailDto extends GovernanceUserListItemDto {
  createdAt: string;
  memberships: GovernanceUserMembershipDto[];
  mfa: {
    enrolled: boolean;
    factorTypes: string[];
    recoveryCodesRemaining: number;
    enrollmentRequired: boolean;
    stepUpEnforced: boolean;
  };
  recentPrivilegedActivity: Array<{
    id: string;
    action: string;
    description: string;
    createdAt: string;
    result: string;
  }>;
}

export interface PlatformRoleSummaryDto {
  id: string;
  name: string;
  scope: 'platform';
  type: 'system';
  userCount: number;
  criticalCapabilities: string[];
  description: string;
  lastModified: string | null;
}

export interface OrgRoleSummaryDto {
  id: string;
  name: string;
  scope: 'organization';
  organizationId: string;
  organizationName: string;
  type: 'system' | 'custom';
  userCount: number;
  criticalCapabilities: string[];
  description: string | null;
  lastModified: string | null;
}

export interface GovernanceRoleDetailDto {
  id: string;
  name: string;
  scope: 'platform' | 'organization';
  organizationId: string | null;
  organizationName: string | null;
  type: 'system' | 'custom';
  description: string;
  userCount: number;
  criticalCapabilities: string[];
  permissionGroups: Array<{
    domain: string;
    capabilities: Array<{
      key: string;
      label: string;
      level: 'read' | 'write' | 'manage';
      critical: boolean;
    }>;
  }>;
  assignedUserIds: string[];
  lastModified: string | null;
  modifiedBy: string | null;
}
