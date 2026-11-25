import { Injectable } from '@nestjs/common';
import { MasterAdminAuditOutboxStatus, MasterAdminAuditScope } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildMasterAdminSessionRevocationAuditIdempotencyKey,
} from '@modules/activity-log/master-admin-audit-delivery.contract';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditDelivery: MasterAdminAuditDeliveryService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async revokeTargetSessionWithAtomicAudit(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    sessionId: string;
    targetOrganizationId?: string | null;
    occurredAt?: Date;
  }): Promise<{ revoked: boolean }> {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);
    const occurredAt = input.occurredAt ?? new Date();
    let targetOrganizationId: string | null | undefined = input.targetOrganizationId;
    if (targetOrganizationId === undefined) {
      try {
        targetOrganizationId = await this.refreshTokens.findSessionOrganizationId(
          input.targetUserId,
          input.sessionId,
        );
      } catch {
        targetOrganizationId = null;
      }
    }

    const auditAction = MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED;
    const idempotencyKeyBuilder = (outcome: 'SUCCESS' | 'NO_OP') =>
      buildMasterAdminSessionRevocationAuditIdempotencyKey({
        auditAction,
        targetUserId: input.targetUserId,
        sessionId: input.sessionId,
        outcome,
      });

    try {
      const txn = await this.prisma.$transaction(async (tx) => {
        const ok = await this.refreshTokens.revokeSessionByIdInTransaction(
          tx,
          input.targetUserId,
          input.sessionId,
        );
        const outcome: 'SUCCESS' | 'NO_OP' = ok ? 'SUCCESS' : 'NO_OP';
        const record = this.buildSingleSessionRecord({
          req: input.req,
          mfa,
          correlationId,
          targetUserId: input.targetUserId,
          sessionId: input.sessionId,
          outcome,
          targetOrganizationId,
        });
        const auditScope = targetOrganizationId
          ? MasterAdminAuditScope.ORGANIZATION_CONTEXT
          : MasterAdminAuditScope.PLATFORM;
        const outboxId = await this.auditDelivery.persistAuthoritativeAuditIntent(
          record,
          {
            idempotencyKey: idempotencyKeyBuilder(outcome),
            occurredAt,
            auditScope,
            organizationContextId: targetOrganizationId,
          },
          tx,
        );
        return { ok, outboxId, outcome, record };
      });

      try {
        await this.auditDelivery.attemptImmediateDelivery(txn.outboxId);
      } catch {
        /* durable intent committed; scheduler will deliver */
      }
      return { revoked: txn.ok };
    } catch {
      return this.fallbackSingleSessionRevocation({
        req: input.req,
        mfa,
        correlationId,
        targetUserId: input.targetUserId,
        sessionId: input.sessionId,
        targetOrganizationId: targetOrganizationId ?? null,
        occurredAt,
        idempotencyKeyBuilder,
      });
    }
  }

  async revokeAllTargetSessionsWithAtomicAudit(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    occurredAt?: Date;
  }): Promise<{ revokedSessionCount: number }> {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);
    const occurredAt = input.occurredAt ?? new Date();
    const auditAction = MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL;
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey({
      auditAction,
      targetUserId: input.targetUserId,
      outcome: 'SUCCESS',
    });

    try {
      const txn = await this.prisma.$transaction(async (tx) => {
        const revokedSessionCount = await this.refreshTokens.revokeAllActiveForUserInTransaction(
          tx,
          input.targetUserId,
        );
        const record = this.buildRevokeAllRecord({
          req: input.req,
          mfa,
          correlationId,
          targetUserId: input.targetUserId,
          revokedSessionCount,
        });
        const outboxId = await this.auditDelivery.persistAuthoritativeAuditIntent(
          record,
          {
            idempotencyKey,
            occurredAt,
            auditScope: MasterAdminAuditScope.PLATFORM,
            organizationContextId: null,
          },
          tx,
        );
        return { revokedSessionCount, outboxId, record };
      });

      try {
        await this.auditDelivery.attemptImmediateDelivery(txn.outboxId);
      } catch {
        /* durable intent committed; scheduler will deliver */
      }
      return { revokedSessionCount: txn.revokedSessionCount };
    } catch {
      const activeCount = await this.prisma.refreshToken.count({
        where: {
          userId: input.targetUserId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      let revokedSessionCount = 0;
      if (activeCount > 0) {
        revokedSessionCount = await this.refreshTokens.revokeAllActiveForUser(input.targetUserId);
      } else {
        revokedSessionCount = await this.prisma.refreshToken.count({
          where: { userId: input.targetUserId, revokedAt: { not: null } },
        });
      }
      const existing = await this.prisma.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey },
      });
      if (existing?.status === MasterAdminAuditOutboxStatus.PROCESSED) {
        return { revokedSessionCount };
      }
      if (existing) {
        try {
          await this.auditDelivery.attemptImmediateDelivery(existing.id);
        } catch {
          /* intent durable */
        }
        return { revokedSessionCount };
      }
      const record = this.buildRevokeAllRecord({
        req: input.req,
        mfa,
        correlationId,
        targetUserId: input.targetUserId,
        revokedSessionCount,
      });
      await this.auditDelivery.commitAuditIntent(record, {
        idempotencyKey,
        organizationContextId: null,
        occurredAt,
      });
      return { revokedSessionCount };
    }
  }

  /** @deprecated use revokeTargetSessionWithAtomicAudit — kept for tests recording audit only */
  async recordSingleSessionRevocation(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    sessionId: string;
    outcome: 'SUCCESS' | 'NO_OP';
    targetOrganizationId?: string | null;
    occurredAt?: Date;
  }): Promise<void> {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);
    const occurredAt = input.occurredAt ?? new Date();
    const auditAction = MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED;
    const record = this.buildSingleSessionRecord({
      req: input.req,
      mfa,
      correlationId,
      targetUserId: input.targetUserId,
      sessionId: input.sessionId,
      outcome: input.outcome,
      targetOrganizationId: input.targetOrganizationId ?? null,
    });

    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey: buildMasterAdminSessionRevocationAuditIdempotencyKey({
        auditAction,
        targetUserId: input.targetUserId,
        sessionId: input.sessionId,
        outcome: input.outcome,
      }),
      organizationContextId: input.targetOrganizationId ?? null,
      occurredAt,
    });
  }

  async recordRevokeAllSessions(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    revokedSessionCount: number;
    targetOrganizationId?: string | null;
    occurredAt?: Date;
  }): Promise<void> {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);
    const occurredAt = input.occurredAt ?? new Date();
    const auditAction = MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL;
    const record = this.buildRevokeAllRecord({
      req: input.req,
      mfa,
      correlationId,
      targetUserId: input.targetUserId,
      revokedSessionCount: input.revokedSessionCount,
    });

    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey: buildMasterAdminSessionRevocationAuditIdempotencyKey({
        auditAction,
        targetUserId: input.targetUserId,
        outcome: 'SUCCESS',
      }),
      organizationContextId: null,
      occurredAt,
    });
  }

  private async fallbackSingleSessionRevocation(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    sessionId: string;
    targetOrganizationId: string | null;
    occurredAt: Date;
    idempotencyKeyBuilder: (outcome: 'SUCCESS' | 'NO_OP') => string;
  }): Promise<{ revoked: boolean }> {
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: input.sessionId, userId: input.targetUserId },
      select: { revokedAt: true },
    });
    const alreadyRevoked = Boolean(token?.revokedAt);
    let revoked = alreadyRevoked;
    if (token && !alreadyRevoked) {
      revoked = await this.refreshTokens.revokeSessionById(input.targetUserId, input.sessionId);
    }
    const outcome: 'SUCCESS' | 'NO_OP' = revoked ? 'SUCCESS' : 'NO_OP';
    const idempotencyKey = input.idempotencyKeyBuilder(outcome);
    const existing = await this.prisma.masterAdminAuditOutbox.findUnique({
      where: { idempotencyKey },
    });
    if (existing?.status === MasterAdminAuditOutboxStatus.PROCESSED) {
      return { revoked: alreadyRevoked || revoked };
    }
    if (existing) {
      try {
        await this.auditDelivery.attemptImmediateDelivery(existing.id);
      } catch {
        /* durable intent already present */
      }
      return { revoked: alreadyRevoked || revoked };
    }
    const record = this.buildSingleSessionRecord({
      req: input.req,
      mfa: input.mfa,
      correlationId: input.correlationId,
      targetUserId: input.targetUserId,
      sessionId: input.sessionId,
      outcome,
      targetOrganizationId: input.targetOrganizationId,
    });
    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey,
      organizationContextId: input.targetOrganizationId,
      occurredAt: input.occurredAt,
    });
    return { revoked: alreadyRevoked || revoked };
  }

  private buildSingleSessionRecord(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    sessionId: string;
    outcome: 'SUCCESS' | 'NO_OP';
    targetOrganizationId: string | null;
  }) {
    const description =
      input.outcome === 'SUCCESS'
        ? `Master admin revoked session for user ${input.targetUserId}`
        : `Master admin session revoke no-op (session not found) for user ${input.targetUserId}`;
  return {
    auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
    actorUserId: input.req.user?.id,
    actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
    actorPermissions: input.req.user?.platformPermissions ?? [],
    targetOrganizationId: input.targetOrganizationId,
    entityId: input.sessionId,
    description,
    correlationId: input.correlationId,
    route: buildPrivilegedRouteLabel(input.req as never),
    httpMethod: input.req.method ?? 'POST',
    httpStatus: 200,
    ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
    userAgent: input.req.headers?.['user-agent'] as string | undefined,
    mfaStepUpAction: input.mfa.mfaStepUpAction ?? STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS,
    mfaAssuranceLevel: input.mfa.mfaAssuranceLevel,
    mfaStepUpUsed: input.mfa.mfaStepUpUsed,
    permissionGranted: true,
    after: null,
    metadata: {
      domain: 'master_user_session',
      operation: 'REVOKE_ONE',
      outcome: input.outcome,
      targetUserId: input.targetUserId,
      sessionId: input.sessionId,
    },
  };
  }

  private buildRevokeAllRecord(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    revokedSessionCount: number;
  }) {
    return {
      auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
      actorUserId: input.req.user?.id,
      actorPlatformRole: input.req.user?.platformRole ?? 'MASTER_ADMIN',
      actorPermissions: input.req.user?.platformPermissions ?? [],
      targetOrganizationId: null,
      entityId: input.targetUserId,
      description: `Master admin revoked all sessions for user ${input.targetUserId}`,
      correlationId: input.correlationId,
      route: buildPrivilegedRouteLabel(input.req as never),
      httpMethod: input.req.method ?? 'POST',
      httpStatus: 200,
      ipAddress: input.req.ip ?? input.req.connection?.remoteAddress,
      userAgent: input.req.headers?.['user-agent'] as string | undefined,
      mfaStepUpAction: input.mfa.mfaStepUpAction ?? STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS,
      mfaAssuranceLevel: input.mfa.mfaAssuranceLevel,
      mfaStepUpUsed: input.mfa.mfaStepUpUsed,
      permissionGranted: true,
      after: null,
      metadata: {
        domain: 'master_user_session',
        operation: 'REVOKE_ALL',
        outcome: 'SUCCESS',
        targetUserId: input.targetUserId,
        revokedSessionCount: input.revokedSessionCount,
        auditScope: 'PLATFORM',
      },
    };
  }
}