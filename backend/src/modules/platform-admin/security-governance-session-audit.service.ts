import { Injectable } from '@nestjs/common';
import { MasterAdminAuditOutboxStatus, MasterAdminAuditScope } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildMasterAdminSessionRevocationAuditIdempotencyKey,
  generateMasterAdminSecurityOperationId,
} from '@modules/activity-log/master-admin-audit-delivery.contract';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { acquireSessionWriteLocks } from '@modules/auth/refresh-token-session-concurrency';
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
    /** Client-stable id for lost-ack retry (same idempotency envelope). */
    securityOperationId?: string;
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

    const operationId = input.securityOperationId ?? generateMasterAdminSecurityOperationId();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);

    try {
      const txn = await this.prisma.$transaction(async (tx) => {
        const sessionMeta = await tx.refreshToken.findFirst({
          where: { id: input.sessionId, userId: input.targetUserId },
          select: { organizationId: true },
        });
        await acquireSessionWriteLocks(tx, {
          userId: input.targetUserId,
          organizationId: sessionMeta?.organizationId ?? null,
        });

        const priorOutbox = await tx.masterAdminAuditOutbox.findUnique({
          where: { idempotencyKey },
        });
        if (priorOutbox) {
          if (!this.outboxSingleSessionMatchesOperation(priorOutbox, input)) {
            return {
              ok: false,
              outboxId: priorOutbox.id,
              outcome: 'NO_OP' as const,
              record: null,
              replay: false,
            };
          }
          const parsed = this.readOutboxRevokedFromSingleSession(priorOutbox);
          return {
            ok: parsed.revokedThisOperation,
            outboxId: priorOutbox.id,
            outcome: parsed.outcome,
            record: null,
            replay: true,
          };
        }
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
          operationId,
        });
        const auditScope = targetOrganizationId
          ? MasterAdminAuditScope.ORGANIZATION_CONTEXT
          : MasterAdminAuditScope.PLATFORM;
        const outboxId = await this.auditDelivery.persistAuthoritativeAuditIntent(
          record,
          {
            idempotencyKey,
            occurredAt,
            auditScope,
            organizationContextId: targetOrganizationId,
          },
          tx,
        );
        return { ok, outboxId, outcome, record, replay: false };
      });

      try {
        await this.auditDelivery.attemptImmediateDelivery(txn.outboxId);
      } catch {
        /* durable intent committed; scheduler will deliver */
      }
      const authoritative = await this.prisma.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey },
      });
      if (authoritative && this.outboxSingleSessionMatchesOperation(authoritative, input)) {
        return {
          revoked: this.readOutboxRevokedFromSingleSession(authoritative).revokedThisOperation,
        };
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
        operationId,
        idempotencyKey,
      });
    }
  }

  async revokeAllTargetSessionsWithAtomicAudit(input: {
    req: SessionRevocationAuditRequest;
    targetUserId: string;
    occurredAt?: Date;
    securityOperationId?: string;
  }): Promise<{ revokedSessionCount: number }> {
    const mfa = resolveMfaAuditFields(input.req as never);
    const correlationId = resolveCorrelationId(input.req as never);
    const occurredAt = input.occurredAt ?? new Date();
    const operationId = input.securityOperationId ?? generateMasterAdminSecurityOperationId();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);

    try {
      const txn = await this.prisma.$transaction(async (tx) => {
        await acquireSessionWriteLocks(tx, {
          userId: input.targetUserId,
          organizationId: null,
        });
        const priorOutbox = await tx.masterAdminAuditOutbox.findUnique({
          where: { idempotencyKey },
        });
        if (priorOutbox) {
          if (!this.outboxRevokeAllMatchesOperation(priorOutbox, input)) {
            return {
              revokedSessionCount: 0,
              outboxId: priorOutbox.id,
              record: null,
              replay: false,
            };
          }
          return {
            revokedSessionCount: this.readOutboxRevokedSessionCount(priorOutbox),
            outboxId: priorOutbox.id,
            record: null,
            replay: true,
          };
        }
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
          operationId,
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
        return { revokedSessionCount, outboxId, record, replay: false };
      });

      try {
        await this.auditDelivery.attemptImmediateDelivery(txn.outboxId);
      } catch {
        /* durable intent committed; scheduler will deliver */
      }
      const authoritative = await this.prisma.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey },
      });
      if (authoritative && this.outboxRevokeAllMatchesOperation(authoritative, input)) {
        return {
          revokedSessionCount: this.readOutboxRevokedSessionCount(authoritative),
        };
      }
      return { revokedSessionCount: txn.revokedSessionCount };
    } catch {
      return this.fallbackRevokeAllSessions({
        req: input.req,
        mfa,
        correlationId,
        targetUserId: input.targetUserId,
        occurredAt,
        operationId,
        idempotencyKey,
      });
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
    const operationId = generateMasterAdminSecurityOperationId();
    const record = this.buildSingleSessionRecord({
      req: input.req,
      mfa,
      correlationId,
      targetUserId: input.targetUserId,
      sessionId: input.sessionId,
      outcome: input.outcome,
      targetOrganizationId: input.targetOrganizationId ?? null,
      operationId,
    });

    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey: buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId),
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
    const operationId = generateMasterAdminSecurityOperationId();
    const record = this.buildRevokeAllRecord({
      req: input.req,
      mfa,
      correlationId,
      targetUserId: input.targetUserId,
      revokedSessionCount: input.revokedSessionCount,
      operationId,
    });

    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey: buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId),
      organizationContextId: null,
      occurredAt,
    });
  }

  private outboxMetadata(existing: { payload: unknown }): Record<string, unknown> | null {
    const payload = existing.payload as Record<string, unknown>;
    const raw = payload.masterAdminAuditEnvelope;
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const meta = (raw as { metadata?: Record<string, unknown> }).metadata;
    return meta && typeof meta === 'object' ? meta : null;
  }

  private outboxSingleSessionMatchesOperation(
    existing: { payload: unknown },
    input: { targetUserId: string; sessionId: string },
  ): boolean {
    const meta = this.outboxMetadata(existing);
    if (!meta) return false;
    return (
      meta.operation === 'REVOKE_ONE' &&
      meta.targetUserId === input.targetUserId &&
      meta.sessionId === input.sessionId
    );
  }

  private outboxRevokeAllMatchesOperation(
    existing: { payload: unknown },
    input: { targetUserId: string },
  ): boolean {
    const meta = this.outboxMetadata(existing);
    if (!meta) return false;
    return meta.operation === 'REVOKE_ALL' && meta.targetUserId === input.targetUserId;
  }

  private async sessionFamilyHasActiveHead(userId: string, sessionId: string): Promise<boolean> {
    const target = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { family: true },
    });
    if (!target?.family) {
      return false;
    }
    const active = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        family: target.family,
        revokedAt: null,
        replacedBy: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(active);
  }

  private readOutboxRevokedFromSingleSession(existing: {
    payload: unknown;
  }): { outcome: 'SUCCESS' | 'NO_OP'; revokedThisOperation: boolean } {
    const payload = existing.payload as Record<string, unknown>;
    const raw = payload.masterAdminAuditEnvelope;
    if (!raw || typeof raw !== 'object') {
      return { outcome: 'NO_OP', revokedThisOperation: false };
    }
    const meta = (raw as { metadata?: Record<string, unknown> }).metadata;
    const outcome =
      meta?.outcome === 'SUCCESS' ? 'SUCCESS' : meta?.outcome === 'NO_OP' ? 'NO_OP' : 'NO_OP';
    return { outcome, revokedThisOperation: outcome === 'SUCCESS' };
  }

  private readOutboxRevokedSessionCount(existing: { payload: unknown }): number {
    const payload = existing.payload as Record<string, unknown>;
    const raw = payload.masterAdminAuditEnvelope;
    if (!raw || typeof raw !== 'object') {
      return 0;
    }
    const meta = (raw as { metadata?: Record<string, unknown> }).metadata;
    const count = meta?.revokedSessionCount;
    return typeof count === 'number' && Number.isFinite(count) ? count : 0;
  }

  private async fallbackSingleSessionRevocation(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    sessionId: string;
    targetOrganizationId: string | null;
    occurredAt: Date;
    operationId: string;
    idempotencyKey: string;
  }): Promise<{ revoked: boolean }> {
    let existing = null;
    try {
      existing = await this.prisma.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
    } catch {
      /* audit read failure must not block security-critical session revocation */
    }
    if (existing) {
      if (
        !this.outboxSingleSessionMatchesOperation(existing, {
          targetUserId: input.targetUserId,
          sessionId: input.sessionId,
        })
      ) {
        return { revoked: false };
      }
      if (existing.status !== MasterAdminAuditOutboxStatus.PROCESSED) {
        try {
          await this.auditDelivery.attemptImmediateDelivery(existing.id);
        } catch {
          /* durable intent already present */
        }
      }
      const parsed = this.readOutboxRevokedFromSingleSession(existing);
      return { revoked: parsed.revokedThisOperation };
    }

    const hasActiveFamily = await this.sessionFamilyHasActiveHead(
      input.targetUserId,
      input.sessionId,
    );
    let revokedThisOperation = false;
    if (hasActiveFamily) {
      revokedThisOperation = await this.refreshTokens.revokeSessionById(
        input.targetUserId,
        input.sessionId,
      );
    }
    const outcome: 'SUCCESS' | 'NO_OP' = revokedThisOperation ? 'SUCCESS' : 'NO_OP';
    const record = this.buildSingleSessionRecord({
      req: input.req,
      mfa: input.mfa,
      correlationId: input.correlationId,
      targetUserId: input.targetUserId,
      sessionId: input.sessionId,
      outcome,
      targetOrganizationId: input.targetOrganizationId,
      operationId: input.operationId,
    });
    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey: input.idempotencyKey,
      organizationContextId: input.targetOrganizationId,
      occurredAt: input.occurredAt,
    });
    return { revoked: revokedThisOperation };
  }

  private async fallbackRevokeAllSessions(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    occurredAt: Date;
    operationId: string;
    idempotencyKey: string;
  }): Promise<{ revokedSessionCount: number }> {
    let existing = null;
    try {
      existing = await this.prisma.masterAdminAuditOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
    } catch {
      /* audit read failure must not block security-critical session revocation */
    }
    if (existing) {
      if (!this.outboxRevokeAllMatchesOperation(existing, { targetUserId: input.targetUserId })) {
        return { revokedSessionCount: 0 };
      }
      if (existing.status !== MasterAdminAuditOutboxStatus.PROCESSED) {
        try {
          await this.auditDelivery.attemptImmediateDelivery(existing.id);
        } catch {
          /* durable intent */
        }
      }
      return { revokedSessionCount: this.readOutboxRevokedSessionCount(existing) };
    }

    const revokedSessionCount = await this.refreshTokens.revokeAllActiveForUser(input.targetUserId);
    const record = this.buildRevokeAllRecord({
      req: input.req,
      mfa: input.mfa,
      correlationId: input.correlationId,
      targetUserId: input.targetUserId,
      revokedSessionCount,
      operationId: input.operationId,
    });
    await this.auditDelivery.commitAuditIntent(record, {
      idempotencyKey: input.idempotencyKey,
      organizationContextId: null,
      occurredAt: input.occurredAt,
    });
    return { revokedSessionCount };
  }

  private buildSingleSessionRecord(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    sessionId: string;
    outcome: 'SUCCESS' | 'NO_OP';
    targetOrganizationId: string | null;
    operationId: string;
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
      securityOperationId: input.operationId,
    },
  };
  }

  private buildRevokeAllRecord(input: {
    req: SessionRevocationAuditRequest;
    mfa: ReturnType<typeof resolveMfaAuditFields>;
    correlationId: string;
    targetUserId: string;
    revokedSessionCount: number;
    operationId: string;
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
        outcome: input.revokedSessionCount > 0 ? 'SUCCESS' : 'NO_OP',
        targetUserId: input.targetUserId,
        revokedSessionCount: input.revokedSessionCount,
        auditScope: 'PLATFORM',
        securityOperationId: input.operationId,
      },
    };
  }
}