import { Injectable } from '@nestjs/common';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildPrivilegedRouteLabel,
  resolveCorrelationId,
  resolveMfaAuditFields,
} from '@modules/activity-log/master-admin-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';

export type SessionRevocationAuditRequest = {
  user?: {
    id?: string;
    platformRole?: string;
    platformPermissions?: string[];
    sessionClaims?: { assuranceLevel?: number; mfaAuthenticatedAt?: string | null };
  };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  connection?: { remoteAddress?: string };
  requestId?: string;
  originalUrl?: string;
  url?: string;
  method?: string;
};

@Injectable()
export class SecurityGovernanceSessionAuditService {
  constructor(private readonly masterAdminAudit: MasterAdminAuditService) {}

  recordSingleSessionRevocation(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    sessionId: string;
    outcome: 'SUCCESS' | 'NO_OP';
    targetOrganizationId?: string | null;
  }): void {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);
    const description =
      input.outcome === 'SUCCESS'
        ? `Master admin revoked session for user ${input.targetUserId}`
        : `Master admin session revoke no-op (session not found) for user ${input.targetUserId}`;

    void this.masterAdminAudit
      .record({
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        actorUserId: input.req.user?.id,
        actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
        actorPermissions: input.req.user?.platformPermissions ?? [],
        targetOrganizationId: input.targetOrganizationId ?? null,
        entityId: input.sessionId,
        description,
        correlationId,
        route: buildPrivilegedRouteLabel(input.req as never),
        httpMethod: input.req.method ?? 'POST',
        httpStatus: 200,
        ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
        userAgent: input.req.headers?.['user-agent'] as string | undefined,
        mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS,
        mfaAssuranceLevel: mfa.mfaAssuranceLevel,
        mfaStepUpUsed: mfa.mfaStepUpUsed,
        permissionGranted: true,
        after: null,
        metadata: {
          domain: 'master_user_session',
          operation: 'REVOKE_ONE',
          outcome: input.outcome,
          targetUserId: input.targetUserId,
          sessionId: input.sessionId,
        },
      })
      .catch(() => undefined);
  }

  recordRevokeAllSessions(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    revokedSessionCount: number;
    targetOrganizationId?: string | null;
  }): void {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);

    void this.masterAdminAudit
      .record({
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
        actorUserId: input.req.user?.id,
        actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
        actorPermissions: input.req.user?.platformPermissions ?? [],
        targetOrganizationId: input.targetOrganizationId ?? null,
        entityId: input.targetUserId,
        description: `Master admin revoked all sessions for user ${input.targetUserId}`,
        correlationId,
        route: buildPrivilegedRouteLabel(input.req as never),
        httpMethod: input.req.method ?? 'POST',
        httpStatus: 200,
        ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
        userAgent: input.req.headers?.['user-agent'] as string | undefined,
        mfaStepUpAction: mfa.mfaStepUpAction ?? STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS,
        mfaAssuranceLevel: mfa.mfaAssuranceLevel,
        mfaStepUpUsed: mfa.mfaStepUpUsed,
        permissionGranted: true,
        after: null,
        metadata: {
          domain: 'master_user_session',
          operation: 'REVOKE_ALL',
          outcome: 'SUCCESS',
          targetUserId: input.targetUserId,
          revokedSessionCount: input.revokedSessionCount,
        },
      })
      .catch(() => undefined);
  }
}