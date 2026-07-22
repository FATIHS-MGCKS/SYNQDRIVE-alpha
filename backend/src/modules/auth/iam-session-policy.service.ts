import { Injectable, Logger } from '@nestjs/common';
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
      this.enqueueInTransaction(tx, input),
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
      const revokedTokenCount = await this.applyRevocationScope(
        intent.scope as SessionInvalidationScope,
        {
          userId: intent.userId,
          organizationId: intent.organizationId,
          membershipId: intent.membershipId,
          refreshTokenId: intent.refreshTokenId,
          tokenFamily: intent.tokenFamily,
        },
      );

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
