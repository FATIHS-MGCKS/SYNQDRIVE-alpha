import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  IamSessionRevocationScope,
  IamSessionRevocationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  buildRevocationIdempotencyKey,
  type IamSessionInvalidationTrigger,
  resolveSessionInvalidationScope,
  type SessionInvalidationScope,
} from '@modules/users/policies/iam-session-invalidation.policy';
import { UserAccessAuditService, UserAccessAuditAction } from '@modules/users/user-access-audit.service';
import {
  acquireSessionWriteLocks,
  acquireUserSessionWriteLock,
} from './refresh-token-session-concurrency';
import { acquireCanonicalSecurityMutationLocks } from './iam-security-mutation-concurrency';

export interface IamSessionRevocationIntentInput {
  eventType: IamSessionInvalidationTrigger;
  userId: string;
  organizationId?: string | null;
  membershipId?: string | null;
  refreshTokenId?: string | null;
  tokenFamily?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  highRiskReuse?: boolean;
  mutationVersion?: number;
  idempotencyKey?: string;
}

export interface IamSessionRevocationResult {
  intentId: string;
  scopes: SessionInvalidationScope[];
  revokedTokenCount: number;
  idempotentReplay: boolean;
}

export interface IamSessionRevocationEnqueueResult {
  intentIds: string[];
  scopes: SessionInvalidationScope[];
  revokedTokenCount: number;
  idempotentReplay: boolean;
}

type TxClient = Prisma.TransactionClient;

@Injectable()
export class IamSessionNotificationService {
  notifySessionInvalidation(_input: {
    userId: string;
    eventType: string;
    scope: SessionInvalidationScope;
  }): void {
    // Notification channel (email/push) is decoupled — wired in a later remediation prompt.
  }
}

@Injectable()
export class IamSessionPolicyService {
  private readonly logger = new Logger(IamSessionPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    // RefreshTokenService and this service import each other, so whichever file
    // loads second sees an undefined class reference at decorator time.
    @Inject(forwardRef(() => RefreshTokenService))
    private readonly refreshTokens: RefreshTokenService,
    private readonly userAudit: UserAccessAuditService,
    private readonly notifications: IamSessionNotificationService,
  ) {}

  resolveScopes(
    eventType: IamSessionInvalidationTrigger,
    options?: { highRiskReuse?: boolean },
  ): SessionInvalidationScope[] {
    return resolveSessionInvalidationScope(eventType, options);
  }

  /**
   * Record revocation intent inside the same DB transaction as the IAM mutation.
   */
  async enqueueInTransaction(
    tx: TxClient,
    input: IamSessionRevocationIntentInput,
  ): Promise<{ intentIds: string[]; scopes: SessionInvalidationScope[] }> {
    const scopes = this.resolveScopes(input.eventType, {
      highRiskReuse: input.highRiskReuse,
    });
    const intentIds: string[] = [];

    for (const scope of scopes) {
      const idempotencyKey =
        input.idempotencyKey ??
        buildRevocationIdempotencyKey({
          eventType: input.eventType,
          userId: input.userId,
          organizationId: input.organizationId,
          membershipId: input.membershipId,
          refreshTokenId: input.refreshTokenId,
          tokenFamily: input.tokenFamily,
          mutationVersion: input.mutationVersion,
        }) + `:${scope}`;

      const existing = await tx.iamSessionRevocationIntent.findUnique({
        where: { idempotencyKey },
        select: { id: true, status: true },
      });
      if (existing) {
        intentIds.push(existing.id);
        continue;
      }

      const created = await tx.iamSessionRevocationIntent.create({
        data: {
          idempotencyKey,
          eventType: input.eventType,
          scope: scope as IamSessionRevocationScope,
          userId: input.userId,
          organizationId: input.organizationId ?? null,
          membershipId: input.membershipId ?? null,
          refreshTokenId: input.refreshTokenId ?? null,
          tokenFamily: input.tokenFamily ?? null,
          actorUserId: input.actorUserId ?? null,
          metadata: input.metadata
            ? (input.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          status: IamSessionRevocationStatus.PENDING,
        },
      });
      intentIds.push(created.id);
    }

    return { intentIds, scopes };
  }

  /**
   * Enqueue intent and apply authoritative session invalidation in the same DB transaction
   * as the IAM mutation (USR-OWN-02 / GATE-1). Post-commit `processIntents` finalizes audit
   * state without re-applying revocation when `authoritativeAppliedInCommit` is set.
   */
  async enqueueInTransactionWithAuthoritativeInvalidation(
    tx: TxClient,
    input: IamSessionRevocationIntentInput,
  ): Promise<IamSessionRevocationEnqueueResult> {
    await acquireCanonicalSecurityMutationLocks(tx, {
      organizationIds: input.organizationId ? [input.organizationId] : [],
      userIds: [input.userId],
    });

    const resolved = await this.resolveSecurityMutationIdentity(tx, input);
    const { intentIds, scopes } = await this.enqueueInTransaction(tx, resolved);

    const priorRows = await Promise.all(
      intentIds.map((intentId) =>
        tx.iamSessionRevocationIntent.findUnique({
          where: { id: intentId },
          select: { metadata: true, revokedTokenCount: true, status: true },
        }),
      ),
    );

    const allAuthoritative = priorRows.every((row) => {
      if (!row) return false;
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      return meta?.authoritativeAppliedInCommit === true;
    });

    if (allAuthoritative) {
      const revokedTokenCount = Math.max(
        0,
        ...priorRows.map((row) => row?.revokedTokenCount ?? 0),
      );
      return { intentIds, scopes, revokedTokenCount, idempotentReplay: true };
    }

    const revokedTokenCount = await this.applyAuthoritativeScopesInTransaction(tx, scopes, {
      userId: resolved.userId,
      organizationId: resolved.organizationId ?? null,
      membershipId: resolved.membershipId ?? null,
      refreshTokenId: resolved.refreshTokenId ?? null,
      tokenFamily: resolved.tokenFamily ?? null,
    });

    const operationIdentity =
      resolved.idempotencyKey ??
      buildRevocationIdempotencyKey({
        eventType: resolved.eventType,
        userId: resolved.userId,
        organizationId: resolved.organizationId,
        membershipId: resolved.membershipId,
        refreshTokenId: resolved.refreshTokenId,
        tokenFamily: resolved.tokenFamily,
        mutationVersion: resolved.mutationVersion,
      });

    for (const intentId of intentIds) {
      const existing = priorRows[intentIds.indexOf(intentId)];
      const prior =
        existing?.metadata &&
        typeof existing.metadata === 'object' &&
        !Array.isArray(existing.metadata)
          ? (existing.metadata as Record<string, unknown>)
          : {};
      await tx.iamSessionRevocationIntent.update({
        where: { id: intentId },
        data: {
          revokedTokenCount,
          metadata: {
            ...prior,
            ...(resolved.metadata ?? {}),
            authoritativeAppliedInCommit: true,
            operationIdentity,
            mutationVersion: resolved.mutationVersion ?? 0,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return { intentIds, scopes, revokedTokenCount, idempotentReplay: false };
  }

  /**
   * Stable server-side operation identity for idempotency keys when callers omit explicit keys.
   * Distinct legitimate mutations must not share mutationVersion=0 forever (P2-R21).
   */
  private async resolveSecurityMutationIdentity(
    tx: TxClient,
    input: IamSessionRevocationIntentInput,
  ): Promise<IamSessionRevocationIntentInput> {
    if (input.idempotencyKey || (input.mutationVersion ?? 0) > 0) {
      return input;
    }

    const userRow = await tx.user.findUnique({
      where: { id: input.userId },
      select: { sessionVersion: true, securityVersion: true },
    });
    if (!userRow) {
      return input;
    }

    let mutationVersion = 0;
    if (input.eventType === 'MFA_RESET') {
      mutationVersion = userRow.securityVersion + 1;
    } else if (
      input.eventType === 'PASSWORD_CHANGED' ||
      input.eventType === 'PASSWORD_COMPROMISED'
    ) {
      mutationVersion = userRow.sessionVersion + 1;
    } else if (input.membershipId) {
      const membership = await tx.organizationMembership.findUnique({
        where: { id: input.membershipId },
        select: { membershipVersion: true },
      });
      mutationVersion = (membership?.membershipVersion ?? 0) + 1;
    } else {
      mutationVersion = userRow.sessionVersion + 1;
    }

    return { ...input, mutationVersion };
  }

  /** Process intents created in a transaction (call after commit). */
  async processIntents(intentIds: string[]): Promise<IamSessionRevocationResult[]> {
    const results: IamSessionRevocationResult[] = [];
    for (const intentId of intentIds) {
      results.push(await this.executeIntent(intentId));
    }
    return results;
  }

  /**
   * Convenience: enqueue + execute for callers without an outer transaction.
   */
  async recordAndExecute(
    input: IamSessionRevocationIntentInput,
  ): Promise<IamSessionRevocationResult> {
    const { intentIds } = await this.prisma.$transaction(async (tx) =>
      this.enqueueInTransactionWithAuthoritativeInvalidation(tx, input),
    );
    const results = await this.processIntents(intentIds);
    return results[results.length - 1]!;
  }

  async executeIntent(intentId: string): Promise<IamSessionRevocationResult> {
    const intent = await this.prisma.iamSessionRevocationIntent.findUnique({
      where: { id: intentId },
    });
    if (!intent) {
      throw new Error(`IamSessionRevocationIntent not found: ${intentId}`);
    }

    if (intent.status === IamSessionRevocationStatus.COMPLETED) {
      return {
        intentId: intent.id,
        scopes: [intent.scope as SessionInvalidationScope],
        revokedTokenCount: intent.revokedTokenCount,
        idempotentReplay: true,
      };
    }

    const claimed = await this.prisma.iamSessionRevocationIntent.updateMany({
      where: {
        id: intentId,
        status: {
          in: [
            IamSessionRevocationStatus.PENDING,
            IamSessionRevocationStatus.FAILED,
          ],
        },
      },
      data: { status: IamSessionRevocationStatus.PROCESSING },
    });

    if (claimed.count === 0) {
      const latest = await this.prisma.iamSessionRevocationIntent.findUnique({
        where: { id: intentId },
      });
      return {
        intentId,
        scopes: [latest!.scope as SessionInvalidationScope],
        revokedTokenCount: latest?.revokedTokenCount ?? 0,
        idempotentReplay: latest?.status === IamSessionRevocationStatus.COMPLETED,
      };
    }

    try {
      const metadata =
        intent.metadata && typeof intent.metadata === 'object' && !Array.isArray(intent.metadata)
          ? (intent.metadata as Record<string, unknown>)
          : null;
      const ctx = {
        userId: intent.userId,
        organizationId: intent.organizationId,
        membershipId: intent.membershipId,
        refreshTokenId: intent.refreshTokenId,
        tokenFamily: intent.tokenFamily,
      };
      const revokedTokenCount =
        metadata?.authoritativeAppliedInCommit === true
          ? intent.revokedTokenCount
          : await this.applyRevocationScope(intent.scope as SessionInvalidationScope, ctx);

      await this.prisma.iamSessionRevocationIntent.update({
        where: { id: intentId },
        data: {
          status: IamSessionRevocationStatus.COMPLETED,
          processedAt: new Date(),
          revokedTokenCount,
          failureReason: null,
        },
      });

      void this.userAudit.record({
        organizationId: intent.organizationId ?? undefined,
        actorUserId: intent.actorUserId ?? undefined,
        auditAction: UserAccessAuditAction.SESSION_INVALIDATION_EXECUTED,
        targetUserId: intent.userId,
        description: `Session invalidation ${intent.eventType} scope=${intent.scope}`,
        metadata: {
          intentId: intent.id,
          eventType: intent.eventType,
          scope: intent.scope,
          revokedTokenCount,
        },
      });

      this.notifications.notifySessionInvalidation({
        userId: intent.userId,
        eventType: intent.eventType,
        scope: intent.scope as SessionInvalidationScope,
      });

      return {
        intentId,
        scopes: [intent.scope as SessionInvalidationScope],
        revokedTokenCount,
        idempotentReplay: false,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Session revocation failed';
      this.logger.error(`Intent ${intentId} failed: ${message}`);
      await this.prisma.iamSessionRevocationIntent.update({
        where: { id: intentId },
        data: {
          status: IamSessionRevocationStatus.FAILED,
          failureReason: message,
        },
      });
      throw error;
    }
  }

  private async applyAuthoritativeScopesInTransaction(
    tx: TxClient,
    scopes: SessionInvalidationScope[],
    ctx: {
      userId: string;
      organizationId: string | null;
      membershipId: string | null;
      refreshTokenId: string | null;
      tokenFamily: string | null;
    },
  ): Promise<number> {
    let total = 0;
    for (const scope of scopes) {
      total += await this.applyRevocationScopeInTransaction(tx, scope, ctx);
    }
    return total;
  }

  private async applyRevocationScopeInTransaction(
    tx: TxClient,
    scope: SessionInvalidationScope,
    ctx: {
      userId: string;
      organizationId: string | null;
      membershipId: string | null;
      refreshTokenId: string | null;
      tokenFamily: string | null;
    },
  ): Promise<number> {
    const now = new Date();
    switch (scope) {
      case 'NO_IMMEDIATE_REVOCATION':
        return 0;
      case 'CURRENT_SESSION':
        if (!ctx.refreshTokenId) return 0;
        return (await this.refreshTokens.revokeSessionByIdInTransaction(
          tx,
          ctx.userId,
          ctx.refreshTokenId,
        ))
          ? 1
          : 0;
      case 'USER_ALL_SESSIONS':
        await acquireUserSessionWriteLock(tx, ctx.userId);
        await tx.$executeRaw`
          UPDATE users SET session_version = session_version + 1, updated_at = NOW()
          WHERE id = ${ctx.userId}
        `;
        return (
          await tx.refreshToken.updateMany({
            where: {
              userId: ctx.userId,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              revokedAt: now,
              revocationReason: 'USER_ALL_SESSIONS_REVOKED',
            },
          })
        ).count;
      case 'ORGANIZATION_MEMBERSHIP_SESSIONS':
        if (ctx.membershipId) {
          await tx.$executeRaw`
            UPDATE organization_memberships
            SET membership_version = membership_version + 1, updated_at = NOW()
            WHERE id = ${ctx.membershipId}
          `;
        }
        if (!ctx.organizationId) return 0;
        await acquireSessionWriteLocks(tx, {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
        });
        return (
          await tx.refreshToken.updateMany({
            where: {
              userId: ctx.userId,
              organizationId: ctx.organizationId,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              revokedAt: now,
              revocationReason: 'ORG_MEMBERSHIP_SESSIONS_REVOKED',
            },
          })
        ).count;
      case 'TOKEN_FAMILY': {
        if (!ctx.tokenFamily) return 0;
        const anchor = await tx.refreshToken.findFirst({
          where: { family: ctx.tokenFamily },
          select: { userId: true, organizationId: true },
          orderBy: { createdAt: 'desc' },
        });
        if (!anchor) return 0;
        await acquireSessionWriteLocks(tx, {
          userId: anchor.userId,
          organizationId: anchor.organizationId,
        });
        return (
          await tx.refreshToken.updateMany({
            where: { family: ctx.tokenFamily, revokedAt: null },
            data: {
              revokedAt: now,
              revocationReason: 'TOKEN_FAMILY_REVOKED',
            },
          })
        ).count;
      }
      case 'PRIVILEGED_SESSIONS':
        await acquireUserSessionWriteLock(tx, ctx.userId);
        await tx.$executeRaw`
          UPDATE users SET session_version = session_version + 1, updated_at = NOW()
          WHERE id = ${ctx.userId}
        `;
        return (
          await tx.refreshToken.updateMany({
            where: {
              userId: ctx.userId,
              privilegedSession: true,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              revokedAt: now,
              revocationReason: 'PRIVILEGED_SESSIONS_REVOKED',
            },
          })
        ).count;
      default:
        return 0;
    }
  }

  private async applyRevocationScope(
    scope: SessionInvalidationScope,
    ctx: {
      userId: string;
      organizationId: string | null;
      membershipId: string | null;
      refreshTokenId: string | null;
      tokenFamily: string | null;
    },
  ): Promise<number> {
    switch (scope) {
      case 'NO_IMMEDIATE_REVOCATION':
        return 0;
      case 'CURRENT_SESSION':
        if (!ctx.refreshTokenId) return 0;
        return (await this.refreshTokens.revokeSessionById(
          ctx.userId,
          ctx.refreshTokenId,
        ))
          ? 1
          : 0;
      case 'USER_ALL_SESSIONS':
        await this.bumpUserSessionVersion(ctx.userId);
        return await this.refreshTokens.revokeAllActiveForUser(ctx.userId);
      case 'ORGANIZATION_MEMBERSHIP_SESSIONS':
        if (ctx.membershipId) {
          await this.bumpMembershipVersion(ctx.membershipId);
        }
        if (!ctx.organizationId) return 0;
        return await this.refreshTokens.revokeForOrganizationMembership(
          ctx.userId,
          ctx.organizationId,
        );
      case 'TOKEN_FAMILY':
        if (!ctx.tokenFamily) return 0;
        return await this.refreshTokens.revokeFamily(ctx.tokenFamily);
      case 'PRIVILEGED_SESSIONS':
        await this.bumpUserSessionVersion(ctx.userId);
        return await this.refreshTokens.revokePrivilegedSessionsForUser(
          ctx.userId,
        );
      default:
        return 0;
    }
  }

  private async bumpUserSessionVersion(userId: string): Promise<number> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    return updated.sessionVersion;
  }

  private async bumpMembershipVersion(membershipId: string): Promise<number> {
    const updated = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: { membershipVersion: { increment: 1 } },
      select: { membershipVersion: true },
    });
    return updated.membershipVersion;
  }
}
