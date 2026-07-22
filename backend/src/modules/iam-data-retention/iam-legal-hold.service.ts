import { Injectable, NotFoundException } from '@nestjs/common';
import { IamDataCategory, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { UserAccessAuditAction } from '@modules/users/user-access-audit.service';

@Injectable()
export class IamLegalHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
  ) {}

  async isBlocked(input: {
    organizationId?: string | null;
    userId?: string | null;
    category?: IamDataCategory;
  }): Promise<boolean> {
    const hold = await this.prisma.iamLegalHold.findFirst({
      where: {
        releasedAt: null,
        OR: [
          ...(input.userId
            ? [{ userId: input.userId, organizationId: input.organizationId ?? undefined }]
            : []),
          ...(input.organizationId ? [{ organizationId: input.organizationId, userId: null }] : []),
          ...(input.category
            ? [{ category: input.category, organizationId: input.organizationId ?? undefined }]
            : []),
        ],
      },
    });
    return Boolean(hold);
  }

  async placeHold(input: {
    organizationId?: string | null;
    userId?: string | null;
    category?: IamDataCategory;
    reason: string;
    placedByUserId: string;
    metadata?: Record<string, unknown>;
    actor?: { route?: string; ipAddress?: string; userAgent?: string };
  }) {
    const outboxIds: string[] = [];
    const hold = await this.prisma.$transaction(async (tx) => {
      const created = await tx.iamLegalHold.create({
        data: {
          organizationId: input.organizationId ?? null,
          userId: input.userId ?? null,
          category: input.category ?? null,
          reason: input.reason.trim(),
          placedByUserId: input.placedByUserId,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      if (input.organizationId) {
        const outbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: input.organizationId,
          idempotencyKey: `legal-hold:place:${created.id}`,
          eventType: UserAccessAuditAction.IAM_LEGAL_HOLD_PLACED,
          actorUserId: input.placedByUserId,
          subjectUserId: input.userId ?? undefined,
          description: 'Legal Hold gesetzt',
          metadata: {
            holdId: created.id,
            category: input.category ?? null,
            reason: input.reason,
          },
          route: input.actor?.route,
          ipAddress: input.actor?.ipAddress,
          userAgent: input.actor?.userAgent,
          level: 'WARN',
        });
        outboxIds.push(outbox.id);
      }

      return created;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return hold;
  }

  async releaseHold(input: {
    holdId: string;
    organizationId: string;
    releasedByUserId: string;
    actor?: { route?: string; ipAddress?: string; userAgent?: string };
  }) {
    const existing = await this.prisma.iamLegalHold.findFirst({
      where: {
        id: input.holdId,
        organizationId: input.organizationId,
        releasedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException('Legal hold not found');
    }

    const outboxIds: string[] = [];
    const hold = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.iamLegalHold.update({
        where: { id: input.holdId },
        data: {
          releasedAt: new Date(),
          releasedByUserId: input.releasedByUserId,
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: `legal-hold:release:${input.holdId}`,
        eventType: UserAccessAuditAction.IAM_LEGAL_HOLD_RELEASED,
        actorUserId: input.releasedByUserId,
        subjectUserId: existing.userId ?? undefined,
        description: 'Legal Hold aufgehoben',
        metadata: { holdId: input.holdId },
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level: 'WARN',
      });
      outboxIds.push(outbox.id);
      return updated;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return hold;
  }

  listActiveHolds(organizationId: string) {
    return this.prisma.iamLegalHold.findMany({
      where: { organizationId, releasedAt: null },
      orderBy: { placedAt: 'desc' },
    });
  }
}
