import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { UserAccessAuditAction } from '@modules/users/user-access-audit.service';

export interface DsarExportResult {
  exportId: string;
  organizationId: string;
  subjectUserId: string;
  exportedAt: string;
  format: string;
  data: Record<string, unknown>;
}

@Injectable()
export class IamDsarExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
  ) {}

  async exportUserData(input: {
    organizationId: string;
    subjectUserId: string;
    requestedByUserId: string;
    idempotencyKey: string;
    actor?: { route?: string; ipAddress?: string; userAgent?: string };
  }): Promise<DsarExportResult> {
    const existing = await this.prisma.iamDsarExportLog.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new ForbiddenException('Export idempotency key belongs to another organization');
      }
      return this.rebuildFromLog(existing.id, input.organizationId, input.subjectUserId);
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.subjectUserId,
      },
      include: {
        organizationRole: { select: { id: true, name: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException('User has no membership in this organization');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.subjectUserId },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        phone: true,
        language: true,
        timezone: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [sessions, activityLogs, invites, mfaFactors, accessReviewItems] =
      await Promise.all([
        this.prisma.refreshToken.count({
          where: { userId: input.subjectUserId },
        }),
        this.prisma.activityLog.findMany({
          where: {
            organizationId: input.organizationId,
            userId: input.subjectUserId,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: {
            id: true,
            action: true,
            entity: true,
            description: true,
            createdAt: true,
            level: true,
          },
        }),
        this.prisma.organizationUserInvite.findMany({
          where: {
            organizationId: input.organizationId,
            OR: [
              { acceptedByUserId: input.subjectUserId },
              { email: user.email },
            ],
          },
          select: {
            id: true,
            email: true,
            status: true,
            membershipRole: true,
            createdAt: true,
            acceptedAt: true,
            revokedAt: true,
          },
        }),
        this.prisma.userMfaFactor.findMany({
          where: { userId: input.subjectUserId },
          select: {
            id: true,
            factorType: true,
            enabledAt: true,
            verifiedAt: true,
            lastUsedAt: true,
          },
        }),
        this.prisma.accessReviewItem.findMany({
          where: {
            organizationId: input.organizationId,
            userId: input.subjectUserId,
          },
          select: {
            id: true,
            campaignId: true,
            status: true,
            effectiveRole: true,
            riskReasons: true,
            createdAt: true,
          },
        }),
      ]);

    const payload: Record<string, unknown> = {
      schemaVersion: 1,
      organizationId: input.organizationId,
      subjectUserId: input.subjectUserId,
      profile: user,
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status,
        roleLabel: membership.roleLabel,
        permissions: membership.permissions,
        stationScope: membership.stationScope,
        stationIds: membership.stationIds,
        organizationRole: membership.organizationRole,
        membershipVersion: membership.membershipVersion,
        createdAt: membership.createdAt,
      },
      sessions: { activeOrStoredCount: sessions },
      activityLogs,
      invites,
      mfa: {
        enrolledFactors: mfaFactors,
        recoveryCodesCount: await this.prisma.userMfaRecoveryCode.count({
          where: { userId: input.subjectUserId, usedAt: null },
        }),
      },
      accessReviews: accessReviewItems,
    };

    const outboxIds: string[] = [];
    const exportLog = await this.prisma.$transaction(async (tx) => {
      const log = await tx.iamDsarExportLog.create({
        data: {
          organizationId: input.organizationId,
          subjectUserId: input.subjectUserId,
          requestedByUserId: input.requestedByUserId,
          idempotencyKey: input.idempotencyKey,
          exportFormat: 'json',
          status: 'COMPLETED',
          recordCount:
            activityLogs.length +
            invites.length +
            accessReviewItems.length +
            2,
          completedAt: new Date(),
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: `dsar-export:${log.id}`,
        eventType: UserAccessAuditAction.IAM_DSAR_EXPORT_REQUESTED,
        actorUserId: input.requestedByUserId,
        subjectUserId: input.subjectUserId,
        description: 'DSAR/Export für Benutzer angefordert',
        metadata: { exportId: log.id, recordCount: log.recordCount },
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level: 'WARN',
      });
      outboxIds.push(outbox.id);
      return log;
    });

    await this.iamAudit.processOutboxIds(outboxIds);

    return {
      exportId: exportLog.id,
      organizationId: input.organizationId,
      subjectUserId: input.subjectUserId,
      exportedAt: exportLog.completedAt?.toISOString() ?? new Date().toISOString(),
      format: 'json',
      data: payload,
    };
  }

  private async rebuildFromLog(
    exportId: string,
    organizationId: string,
    subjectUserId: string,
  ): Promise<DsarExportResult> {
    const log = await this.prisma.iamDsarExportLog.findUnique({ where: { id: exportId } });
    if (!log) throw new NotFoundException('Export log not found');
    return {
      exportId: log.id,
      organizationId,
      subjectUserId,
      exportedAt: log.completedAt?.toISOString() ?? log.createdAt.toISOString(),
      format: log.exportFormat,
      data: { idempotentReplay: true, exportId: log.id },
    };
  }
}
