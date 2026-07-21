import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { UserAccessAuditAction } from '@modules/users/user-access-audit.service';
import { revokeUserRefreshTokens } from '@modules/users/iam-membership-lifecycle.side-effects';
import type { AdminMfaResetInput, MfaResetResult } from './iam-mfa.types';

@Injectable()
export class IamMfaResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly iamAudit: IamAuditService,
  ) {}

  async resetOwnMfa(input: {
    userId: string;
    organizationId: string | null;
    idempotencyKey: string;
  }): Promise<MfaResetResult> {
    return this.resetMfaForUser({
      organizationId: input.organizationId ?? 'platform',
      targetUserId: input.userId,
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      selfService: true,
    });
  }

  async resetMfaForUser(
    input: AdminMfaResetInput & { selfService?: boolean },
  ): Promise<MfaResetResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.targetUserId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const outboxIds: string[] = [];
    let factorsRemoved = 0;
    let recoveryCodesRemoved = 0;
    let sessionsRevoked = 0;

    await this.prisma.$transaction(async (tx) => {
      const factorResult = await tx.userMfaFactor.deleteMany({
        where: { userId: input.targetUserId },
      });
      factorsRemoved = factorResult.count;

      const recoveryResult = await tx.userMfaRecoveryCode.deleteMany({
        where: { userId: input.targetUserId },
      });
      recoveryCodesRemoved = recoveryResult.count;

      await tx.userMfaStepUpGrant.deleteMany({
        where: { userId: input.targetUserId },
      });

      await tx.user.update({
        where: { id: input.targetUserId },
        data: { securityVersion: { increment: 1 } },
      });

      sessionsRevoked = await revokeUserRefreshTokens(tx, input.targetUserId);

      const orgId =
        input.organizationId === 'platform'
          ? await this.resolveAuditOrgId(tx, input.targetUserId)
          : input.organizationId;

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: orgId,
        idempotencyKey: input.idempotencyKey,
        eventType: UserAccessAuditAction.MFA_CHANGED,
        actorUserId: input.actorUserId,
        subjectUserId: input.targetUserId,
        description: input.selfService
          ? 'MFA zurückgesetzt (Self-Service)'
          : `MFA für Benutzer zurückgesetzt${input.reason ? `: ${input.reason}` : ''}`,
        metadata: {
          resetByAdmin: !input.selfService,
          factorsRemoved,
          recoveryCodesRemoved,
          sessionsRevoked,
        },
      });
      outboxIds.push(outbox.id);
    });

    await this.iamAudit.processOutboxIds(outboxIds);

    return {
      reset: true,
      sessionsRevoked,
      factorsRemoved,
      recoveryCodesRemoved,
    };
  }

  private async resolveAuditOrgId(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<string> {
    const membership = await tx.organizationMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return membership?.organizationId ?? 'platform';
  }
}
