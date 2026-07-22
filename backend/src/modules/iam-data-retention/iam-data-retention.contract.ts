import { IamDataCategory, IamRetentionStrategy } from '@prisma/client';

export const IAM_DATA_RETENTION_VERSION = 1 as const;

export interface IamDataCategoryDefinition {
  category: IamDataCategory;
  label: string;
  description: string;
  defaultRetentionDays: number;
  defaultStrategy: IamRetentionStrategy;
  /** Requires explicit org policy approval before enforcement */
  requiresOrgApproval: boolean;
  /** Always eligible for immediate post-expiry cleanup regardless of master switch */
  immediateCleanup: boolean;
}

export const IAM_DATA_CATEGORY_DEFINITIONS: Record<IamDataCategory, IamDataCategoryDefinition> = {
  GLOBAL_USER_PROFILE: {
    category: IamDataCategory.GLOBAL_USER_PROFILE,
    label: 'Global user profile',
    description: 'Cross-tenant identity fields on User',
    defaultRetentionDays: 0,
    defaultStrategy: IamRetentionStrategy.ANONYMIZE,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  MEMBERSHIP: {
    category: IamDataCategory.MEMBERSHIP,
    label: 'Organization membership',
    description: 'Org-scoped membership rows (via JML lifecycle only)',
    defaultRetentionDays: 0,
    defaultStrategy: IamRetentionStrategy.NO_OP,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  SESSION_REFRESH_TOKEN: {
    category: IamDataCategory.SESSION_REFRESH_TOKEN,
    label: 'Sessions / refresh tokens',
    description: 'Expired or revoked refresh token rows',
    defaultRetentionDays: 30,
    defaultStrategy: IamRetentionStrategy.DELETE,
    requiresOrgApproval: false,
    immediateCleanup: true,
  },
  IP_USER_AGENT: {
    category: IamDataCategory.IP_USER_AGENT,
    label: 'IP / User-Agent',
    description: 'Network metadata on sessions and audit rows',
    defaultRetentionDays: 90,
    defaultStrategy: IamRetentionStrategy.PSEUDONYMIZE,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  LOGIN_FAILURE: {
    category: IamDataCategory.LOGIN_FAILURE,
    label: 'Login failures',
    description: 'AUTH_FAIL security events in activity log',
    defaultRetentionDays: 90,
    defaultStrategy: IamRetentionStrategy.DELETE,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  INVITE: {
    category: IamDataCategory.INVITE,
    label: 'Invites',
    description: 'Invite token hashes and delivery metadata after consumption',
    defaultRetentionDays: 180,
    defaultStrategy: IamRetentionStrategy.DELETE,
    requiresOrgApproval: true,
    immediateCleanup: true,
  },
  RESET_TOKEN: {
    category: IamDataCategory.RESET_TOKEN,
    label: 'Reset tokens',
    description: 'Password-reset delivery ciphertext / hashes after use',
    defaultRetentionDays: 7,
    defaultStrategy: IamRetentionStrategy.DELETE,
    requiresOrgApproval: false,
    immediateCleanup: true,
  },
  MFA_DATA: {
    category: IamDataCategory.MFA_DATA,
    label: 'MFA data',
    description: 'MFA factors and recovery codes for inactive users',
    defaultRetentionDays: 0,
    defaultStrategy: IamRetentionStrategy.DELETE,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  AUDIT_LOG: {
    category: IamDataCategory.AUDIT_LOG,
    label: 'Audit logs',
    description: 'IAM activity log rows',
    defaultRetentionDays: 0,
    defaultStrategy: IamRetentionStrategy.NO_OP,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  ACCESS_REVIEW: {
    category: IamDataCategory.ACCESS_REVIEW,
    label: 'Access reviews',
    description: 'Completed access review campaigns and snapshots',
    defaultRetentionDays: 0,
    defaultStrategy: IamRetentionStrategy.NO_OP,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
  SECURITY_EVENT: {
    category: IamDataCategory.SECURITY_EVENT,
    label: 'Security events',
    description: 'Processed IAM audit outbox dead-letter rows',
    defaultRetentionDays: 365,
    defaultStrategy: IamRetentionStrategy.DELETE,
    requiresOrgApproval: true,
    immediateCleanup: false,
  },
};

export const IAM_DATA_CATEGORIES = Object.values(IamDataCategory);
