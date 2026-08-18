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

export type SecurityAccessSection =
  | 'overview'
  | 'users'
  | 'master-admins'
  | 'roles'
  | 'audit'
  | 'security-events'
  | 'own-security';

export type OwnSecurityTab = 'mfa' | 'sessions' | 'recovery';

export type RoleScope = 'platform' | 'organization';

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

export interface GovernanceUserSessionDto {
  id: string;
  current: boolean;
  userAgent: string | null;
  browser: string;
  device: string;
  os: string;
  ipAddress: string;
  ipAddressFull?: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
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
  scope: RoleScope;
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

export interface AuditLogListItemDto {
  id: string;
  action: string;
  actionRaw?: string;
  entity: string;
  entityRaw?: string;
  entityId: string;
  description: string;
  userName: string;
  organizationName: string;
  organizationId?: string | null;
  createdAt: string;
  reason?: string | null;
  result: 'success' | 'failure' | string;
  auditDomain?: string | null;
  level?: string | null;
}

export interface AuditLogDetailDto extends AuditLogListItemDto {
  summary: string;
  immutable: boolean;
  auditAction?: string | null;
  actor?: {
    userId?: string | null;
    name?: string | null;
    email?: string | null;
    platformRole?: string | null;
  };
  target?: {
    entityType?: string;
    entityId?: string | null;
    organizationId?: string | null;
  };
  diff?: {
    before?: unknown;
    after?: unknown;
    changeSummary?: string | null;
  };
  trace?: {
    correlationId?: string | null;
    requestId?: string | null;
  };
  network?: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  recordedAt?: string;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}
