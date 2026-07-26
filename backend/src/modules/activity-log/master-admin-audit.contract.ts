/** Structured privileged-action codes for master admin control plane audit. */
export const MasterAdminAuditAction = {
  ORG_CREATED: 'ORG_CREATED',
  ORG_UPDATED: 'ORG_UPDATED',
  ORG_DELETED: 'ORG_DELETED',
  ORG_ADMIN_CREATED: 'ORG_ADMIN_CREATED',
  ORG_PAYMENTS_TOGGLED: 'ORG_PAYMENTS_TOGGLED',
  PLATFORM_USER_CREATED: 'PLATFORM_USER_CREATED',
  PLATFORM_USER_UPDATED: 'PLATFORM_USER_UPDATED',
  PLATFORM_USER_DELETED: 'PLATFORM_USER_DELETED',
  PLATFORM_USER_PASSWORD_RESET: 'PLATFORM_USER_PASSWORD_RESET',
  PLATFORM_SETTINGS_UPDATED: 'PLATFORM_SETTINGS_UPDATED',
  PLATFORM_PRUNE: 'PLATFORM_PRUNE',
  BILLING_MUTATION: 'BILLING_MUTATION',
  SUBSCRIPTION_MUTATION: 'SUBSCRIPTION_MUTATION',
  INTEGRATION_MUTATION: 'INTEGRATION_MUTATION',
  MFA_STEP_UP_GRANTED: 'MFA_STEP_UP_GRANTED',
  MFA_STEP_UP_DENIED: 'MFA_STEP_UP_DENIED',
  PRIVILEGED_HTTP_MUTATION: 'PRIVILEGED_HTTP_MUTATION',
} as const;

export type MasterAdminAuditActionCode =
  (typeof MasterAdminAuditAction)[keyof typeof MasterAdminAuditAction];

export interface MasterAdminAuditRecordInput {
  auditAction: MasterAdminAuditActionCode;
  actorUserId?: string;
  actorPlatformRole?: string | null;
  actorPermissions?: string[];
  targetOrganizationId?: string | null;
  entityId?: string | null;
  description: string;
  reasonCode?: string | null;
  correlationId: string;
  route?: string;
  httpMethod?: string;
  httpStatus?: number;
  ipAddress?: string;
  userAgent?: string;
  mfaStepUpAction?: string | null;
  mfaAssuranceLevel?: number | null;
  mfaStepUpUsed?: boolean;
  permissionGranted?: boolean;
  metadata?: Record<string, unknown>;
  level?: 'INFO' | 'WARN' | 'CRITICAL';
}

export const MASTER_ADMIN_AUDIT_DOMAIN = 'MASTER_ADMIN' as const;
