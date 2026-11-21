import { Injectable } from '@nestjs/common';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import type { MasterAdminAuditRecordInput } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from '@modules/activity-log/master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import type { SessionRevocationAuditRequest } from './security-governance-session-audit.service';

@Injectable()
export class SecurityGovernancePlatformPermissionAuditService {
  buildMasterBillingGrantAudit(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    grantId: string | null;
    idempotent: boolean;
  }): MasterAdminAuditRecordInput {
    const mfa = resolveMfaAuditFields(input.req as never);
    return {
      auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
      actorUserId: input.req.user?.id,
      actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
      actorPermissions: input.req.user?.platformPermissions ?? [],
      targetOrganizationId: null,
      entityId: input.targetUserId,
      description: input.idempotent
        ? `Master billing grant already active for user ${input.targetUserId}`
        : `Granted master-billing platform permission to user ${input.targetUserId}`,
      correlationId: resolveCorrelationId(input.req as never),
      route: buildPrivilegedRouteLabel(input.req as never),
      httpMethod: input.req.method ?? 'POST',
      httpStatus: 200,
      ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
      userAgent: input.req.headers?.['user-agent'] as string | undefined,
      mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
      mfaAssuranceLevel: mfa.mfaAssuranceLevel,
      mfaStepUpUsed: mfa.mfaStepUpUsed,
      permissionGranted: true,
      after: null,
      metadata: {
        domain: 'platform_permission',
        operation: 'GRANT_MASTER_BILLING',
        targetUserId: input.targetUserId,
        grantId: input.grantId,
        idempotent: input.idempotent,
      },
    };
  }

  buildMasterBillingRevokeAudit(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    grantId: string | null;
    idempotent: boolean;
  }): MasterAdminAuditRecordInput {
    const mfa = resolveMfaAuditFields(input.req as never);
    return {
      auditAction: MasterAdminAuditAction.PLATFORM_USER_UPDATED,
      actorUserId: input.req.user?.id,
      actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
      actorPermissions: input.req.user?.platformPermissions ?? [],
      targetOrganizationId: null,
      entityId: input.targetUserId,
      description: input.idempotent
        ? `No active master-billing grant for user ${input.targetUserId}`
        : `Revoked master-billing platform permission for user ${input.targetUserId}`,
      correlationId: resolveCorrelationId(input.req as never),
      route: buildPrivilegedRouteLabel(input.req as never),
      httpMethod: input.req.method ?? 'POST',
      httpStatus: 200,
      ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
      userAgent: input.req.headers?.['user-agent'] as string | undefined,
      mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.MASTER_USER_MANAGEMENT,
      mfaAssuranceLevel: mfa.mfaAssuranceLevel,
      mfaStepUpUsed: mfa.mfaStepUpUsed,
      permissionGranted: true,
      after: null,
      metadata: {
        domain: 'platform_permission',
        operation: 'REVOKE_MASTER_BILLING',
        targetUserId: input.targetUserId,
        grantId: input.grantId,
        idempotent: input.idempotent,
      },
    };
  }
}