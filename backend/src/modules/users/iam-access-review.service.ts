import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessReviewCampaignScope,
  AccessReviewCampaignStatus,
  AccessReviewDecisionType,
  AccessReviewItemStatus,
  AccessReviewResultApplicationStatus,
  MembershipRole,
  MembershipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { assertNotLastActiveOrgAdmin } from './org-admin-protection.util';
import { IamAuditService } from './iam-audit.service';
import { UserAccessAuditAction } from './user-access-audit.service';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { IamAccessReviewSnapshotService } from './iam-access-review-snapshot.service';
import {
  ACCESS_REVIEW_ERROR,
  ACCESS_REVIEW_RISK,
  AccessReviewRiskReason,
  assertDecisionAllowed,
  matchesCampaignScope,
} from './iam-access-review.policy';
import type {
  CreateAccessReviewCampaignInput,
  RecordAccessReviewDecisionInput,
} from './iam-access-review.types';

@Injectable()
export class IamAccessReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
    private readonly snapshots: IamAccessReviewSnapshotService,
    private readonly lifecycle: IamMembershipLifecycleService,
  ) {}

  async createCampaign(input: CreateAccessReviewCampaignInput) {
    await this.assertReviewerInOrg(input.organizationId, input.reviewerUserId);

    const existing = await this.prisma.accessReviewCampaign.findFirst({
      where: {
        organizationId: input.organizationId,
        metadata: {
          path: ['idempotencyKey'],
          equals: input.idempotencyKey,
        },
      },
    });
    if (existing) return this.mapCampaign(existing);

    const outboxIds: string[] = [];
    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accessReviewCampaign.create({
        data: {
          organizationId: input.organizationId,
          scope: input.scope,
          reviewerUserId: input.reviewerUserId,
          dueAt: input.dueAt,
          createdByUserId: input.createdByUserId,
          status: AccessReviewCampaignStatus.DRAFT,
          metadata: { idempotencyKey: input.idempotencyKey } as Prisma.InputJsonValue,
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: `access-review-campaign-created:${created.id}`,
        eventType: UserAccessAuditAction.ACCESS_REVIEW_CAMPAIGN_CREATED,
        actorUserId: input.createdByUserId,
        description: `Access-Review-Kampagne erstellt (${input.scope})`,
        after: { campaignId: created.id, scope: input.scope, dueAt: input.dueAt },
      });
      outboxIds.push(outbox.id);
      return created;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return this.mapCampaign(campaign);
  }

  async startCampaign(organizationId: string, campaignId: string, actorUserId: string) {
    const campaign = await this.findCampaignOrThrow(organizationId, campaignId);
    if (campaign.status !== AccessReviewCampaignStatus.DRAFT) {
      throw new BadRequestException({
        code: ACCESS_REVIEW_ERROR.INVALID_STATUS,
        message: 'Campaign can only be started from DRAFT status',
      });
    }

    const snapshots = await this.snapshots.buildSnapshotsForOrganization(
      organizationId,
      (_membership, ctx) =>
        matchesCampaignScope(campaign.scope as AccessReviewCampaignScope, ctx.flags),
    );

    const outboxIds: string[] = [];
    const started = await this.prisma.$transaction(async (tx) => {
      for (const snapshot of snapshots) {
        await tx.accessReviewItem.create({
          data: {
            campaignId: campaign.id,
            organizationId,
            membershipId: snapshot.membershipId,
            userId: snapshot.userId,
            membershipStatus: snapshot.membershipStatus,
            membershipVersion: snapshot.membershipVersion,
            effectiveRole: snapshot.effectiveRole,
            effectiveRoleId: snapshot.effectiveRoleId,
            effectiveRoleLabel: snapshot.effectiveRoleLabel,
            privilegedCapabilities: snapshot.privilegedCapabilities,
            stationScope: snapshot.stationScope,
            stationIds: snapshot.stationIds ?? Prisma.JsonNull,
            permissionsSnapshot: snapshot.permissions
              ? (snapshot.permissions as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            lastActivityAt: snapshot.lastActivityAt
              ? new Date(snapshot.lastActivityAt)
              : null,
            mfaEnrolled: snapshot.mfaEnrolled,
            activeSessionCount: snapshot.activeSessionCount,
            riskReasons: snapshot.riskReasons,
            accessSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            snapshotVersion: campaign.snapshotVersion,
          },
        });
      }

      const updated = await tx.accessReviewCampaign.update({
        where: { id: campaign.id },
        data: {
          status: AccessReviewCampaignStatus.ACTIVE,
          startedAt: new Date(),
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId,
        idempotencyKey: `access-review-campaign-started:${campaign.id}`,
        eventType: UserAccessAuditAction.ACCESS_REVIEW_CAMPAIGN_STARTED,
        actorUserId,
        description: `Access-Review-Kampagne gestartet (${snapshots.length} Items)`,
        after: { campaignId: campaign.id, itemCount: snapshots.length },
      });
      outboxIds.push(outbox.id);
      return updated;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    return this.mapCampaign(started);
  }

  async listCampaigns(organizationId: string) {
    await this.refreshOverdueCampaigns(organizationId);
    const campaigns = await this.prisma.accessReviewCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { items: true, decisions: true } },
      },
    });
    return campaigns.map((c) => ({
      ...this.mapCampaign(c),
      itemCount: c._count.items,
      decisionCount: c._count.decisions,
    }));
  }

  async getCampaign(organizationId: string, campaignId: string) {
    await this.refreshOverdueCampaigns(organizationId);
    const campaign = await this.findCampaignOrThrow(organizationId, campaignId);
    const counts = await this.prisma.accessReviewItem.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });
    return {
      ...this.mapCampaign(campaign),
      itemStatusCounts: Object.fromEntries(
        counts.map((c) => [c.status, c._count]),
      ),
    };
  }

  async listItems(organizationId: string, campaignId: string) {
    await this.findCampaignOrThrow(organizationId, campaignId);
    const items = await this.prisma.accessReviewItem.findMany({
      where: { organizationId, campaignId },
      orderBy: { createdAt: 'asc' },
      include: {
        decisions: { orderBy: { decidedAt: 'desc' }, take: 1 },
      },
    });
    return items.map((item) => this.mapItem(item));
  }

  async recordDecision(input: RecordAccessReviewDecisionInput) {
    const existing = await this.prisma.accessReviewDecision.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { item: true },
    });
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new ForbiddenException({
          code: ACCESS_REVIEW_ERROR.CROSS_TENANT,
          message: 'Decision idempotency key belongs to another organization',
        });
      }
      return this.mapDecision(existing);
    }

    const item = await this.prisma.accessReviewItem.findFirst({
      where: { id: input.itemId, organizationId: input.organizationId },
      include: { campaign: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: ACCESS_REVIEW_ERROR.ITEM_NOT_FOUND,
        message: 'Review item not found',
      });
    }
    if (item.campaign.reviewerUserId !== input.reviewerUserId) {
      throw new ForbiddenException('Only the assigned reviewer can record decisions');
    }
    if (
      item.campaign.status !== AccessReviewCampaignStatus.ACTIVE &&
      item.campaign.status !== AccessReviewCampaignStatus.OVERDUE
    ) {
      throw new BadRequestException({
        code: ACCESS_REVIEW_ERROR.INVALID_STATUS,
        message: 'Campaign is not open for decisions',
      });
    }
    if (item.status === AccessReviewItemStatus.DECIDED) {
      throw new BadRequestException({
        code: ACCESS_REVIEW_ERROR.DECISION_ALREADY_RECORDED,
        message: 'Item already has a decision',
      });
    }

    const riskReasons = item.riskReasons as AccessReviewRiskReason[];
    const isLastOrgAdmin = riskReasons.includes(ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN);

    try {
      assertDecisionAllowed({
        decision: input.decision,
        riskReasons,
        isLastOrgAdmin,
      });
    } catch (err: any) {
      throw new BadRequestException({ code: err.code, message: err.message });
    }

    if (input.decision === AccessReviewDecisionType.MODIFY && !input.modifyPayload) {
      throw new BadRequestException({
        code: ACCESS_REVIEW_ERROR.MODIFY_PAYLOAD_REQUIRED,
        message: 'MODIFY decision requires modifyPayload',
      });
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: item.membershipId, organizationId: input.organizationId },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.membershipVersion !== item.membershipVersion) {
      throw new BadRequestException({
        code: ACCESS_REVIEW_ERROR.STALE_SNAPSHOT,
        message: 'Review snapshot is stale — start a new campaign',
      });
    }

    const outboxIds: string[] = [];
    let applicationStatus: AccessReviewResultApplicationStatus =
      AccessReviewResultApplicationStatus.PENDING;
    let applicationError: string | null = null;

    const decision = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accessReviewDecision.create({
        data: {
          itemId: item.id,
          campaignId: item.campaignId,
          organizationId: input.organizationId,
          reviewerUserId: input.reviewerUserId,
          decision: input.decision,
          reason: input.reason.trim(),
          decidedAt: new Date(),
          modifyPayload: input.modifyPayload
            ? (input.modifyPayload as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          idempotencyKey: input.idempotencyKey,
          membershipVersionAtDecision: item.membershipVersion,
          resultApplicationStatus: AccessReviewResultApplicationStatus.PENDING,
        },
      });

      await tx.accessReviewItem.update({
        where: { id: item.id },
        data: { status: AccessReviewItemStatus.DECIDED },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: `access-review-decision:${created.id}`,
        eventType: UserAccessAuditAction.ACCESS_REVIEW_DECISION_RECORDED,
        actorUserId: input.reviewerUserId,
        subjectUserId: item.userId,
        membershipId: item.membershipId,
        description: `Access-Review-Entscheidung: ${input.decision}`,
        after: {
          decisionId: created.id,
          decision: input.decision,
          campaignId: item.campaignId,
        },
        reason: input.reason,
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level:
          input.decision === AccessReviewDecisionType.REMOVE ||
          input.decision === AccessReviewDecisionType.SUSPEND
            ? 'WARN'
            : 'INFO',
      });
      outboxIds.push(outbox.id);
      return created;
    });

    try {
      const applyResult = await this.applyDecisionViaLifecycle({
        organizationId: input.organizationId,
        item,
        decision: input.decision,
        reviewerUserId: input.reviewerUserId,
        reason: input.reason,
        modifyPayload: input.modifyPayload,
        membershipVersionAtDecision: item.membershipVersion,
        actor: input.actor,
        idempotencyKey: `${input.idempotencyKey}:apply`,
      });
      applicationStatus = applyResult.status;
      applicationError = applyResult.error ?? null;
    } catch (err: any) {
      applicationStatus = AccessReviewResultApplicationStatus.FAILED;
      applicationError = err?.message ?? 'Application failed';
    }

    const updatedDecision = await this.prisma.accessReviewDecision.update({
      where: { id: decision.id },
      data: {
        resultApplicationStatus: applicationStatus,
        appliedAt:
          applicationStatus === AccessReviewResultApplicationStatus.APPLIED
            ? new Date()
            : null,
        applicationError,
      },
    });

    if (applicationStatus === AccessReviewResultApplicationStatus.APPLIED) {
      const applyOutboxIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        const outbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: input.organizationId,
          idempotencyKey: `access-review-decision-applied:${decision.id}`,
          eventType: UserAccessAuditAction.ACCESS_REVIEW_DECISION_APPLIED,
          actorUserId: input.reviewerUserId,
          subjectUserId: item.userId,
          membershipId: item.membershipId,
          description: `Access-Review-Entscheidung angewendet: ${input.decision}`,
          after: { decisionId: decision.id, decision: input.decision },
          reason: input.reason,
        });
        applyOutboxIds.push(outbox.id);
      });
      await this.iamAudit.processOutboxIds(applyOutboxIds);
    }

    await this.iamAudit.processOutboxIds(outboxIds);
    await this.maybeCompleteCampaign(input.organizationId, item.campaignId);

    return this.mapDecision(updatedDecision);
  }

  private async applyDecisionViaLifecycle(input: {
    organizationId: string;
    item: { membershipId: string; userId: string; membershipVersion: number };
    decision: AccessReviewDecisionType;
    reviewerUserId: string;
    reason: string;
    modifyPayload?: RecordAccessReviewDecisionInput['modifyPayload'];
    membershipVersionAtDecision: number;
    actor?: RecordAccessReviewDecisionInput['actor'];
    idempotencyKey: string;
  }): Promise<{ status: AccessReviewResultApplicationStatus; error?: string }> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        id: input.item.membershipId,
        organizationId: input.organizationId,
      },
    });
    if (!membership) {
      return {
        status: AccessReviewResultApplicationStatus.FAILED,
        error: 'Membership not found',
      };
    }
    if (membership.membershipVersion !== input.membershipVersionAtDecision) {
      return {
        status: AccessReviewResultApplicationStatus.FAILED,
        error: ACCESS_REVIEW_ERROR.STALE_SNAPSHOT,
      };
    }

    const actor = {
      userId: input.reviewerUserId,
      route: input.actor?.route,
      ipAddress: input.actor?.ipAddress,
      userAgent: input.actor?.userAgent,
    };

    switch (input.decision) {
      case AccessReviewDecisionType.CONFIRM:
      case AccessReviewDecisionType.ESCALATE:
        return { status: AccessReviewResultApplicationStatus.NOT_APPLICABLE };

      case AccessReviewDecisionType.MODIFY: {
        if (!input.modifyPayload) {
          return {
            status: AccessReviewResultApplicationStatus.FAILED,
            error: ACCESS_REVIEW_ERROR.MODIFY_PAYLOAD_REQUIRED,
          };
        }
        await this.lifecycle.move({
          organizationId: input.organizationId,
          userId: input.item.userId,
          idempotencyKey: input.idempotencyKey,
          actor,
          reason: `Access review: ${input.reason}`,
          role: input.modifyPayload.role,
          organizationRoleId: input.modifyPayload.organizationRoleId,
          roleLabel: input.modifyPayload.roleLabel,
          permissions: input.modifyPayload.permissions,
          stationScope: input.modifyPayload.stationScope,
          stationIds: input.modifyPayload.stationIds,
          fieldAgentAccess: input.modifyPayload.fieldAgentAccess,
        });
        return { status: AccessReviewResultApplicationStatus.APPLIED };
      }

      case AccessReviewDecisionType.SUSPEND: {
        await assertNotLastActiveOrgAdmin(
          this.prisma,
          input.organizationId,
          input.item.userId,
        );
        await this.lifecycle.suspend({
          organizationId: input.organizationId,
          userId: input.item.userId,
          idempotencyKey: input.idempotencyKey,
          actor,
          reason: `Access review: ${input.reason}`,
        });
        return { status: AccessReviewResultApplicationStatus.APPLIED };
      }

      case AccessReviewDecisionType.REMOVE: {
        await assertNotLastActiveOrgAdmin(
          this.prisma,
          input.organizationId,
          input.item.userId,
        );
        await this.lifecycle.remove({
          organizationId: input.organizationId,
          userId: input.item.userId,
          idempotencyKey: input.idempotencyKey,
          actor,
          reason: `Access review: ${input.reason}`,
          force: false,
        });
        return { status: AccessReviewResultApplicationStatus.APPLIED };
      }

      default:
        return { status: AccessReviewResultApplicationStatus.SKIPPED };
    }
  }

  private async maybeCompleteCampaign(organizationId: string, campaignId: string) {
    const pending = await this.prisma.accessReviewItem.count({
      where: { organizationId, campaignId, status: AccessReviewItemStatus.PENDING },
    });
    if (pending > 0) return;

    await this.prisma.accessReviewCampaign.updateMany({
      where: {
        id: campaignId,
        organizationId,
        status: { in: [AccessReviewCampaignStatus.ACTIVE, AccessReviewCampaignStatus.OVERDUE] },
      },
      data: {
        status: AccessReviewCampaignStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  private async refreshOverdueCampaigns(organizationId: string) {
    const now = new Date();
    await this.prisma.accessReviewCampaign.updateMany({
      where: {
        organizationId,
        status: AccessReviewCampaignStatus.ACTIVE,
        dueAt: { lt: now },
      },
      data: { status: AccessReviewCampaignStatus.OVERDUE },
    });
  }

  private async assertReviewerInOrg(organizationId: string, reviewerUserId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: reviewerUserId,
        status: MembershipStatus.ACTIVE,
        role: { in: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN] },
      },
    });
    if (!membership) {
      throw new BadRequestException('Reviewer must be an active org admin or sub-admin');
    }
  }

  private async findCampaignOrThrow(organizationId: string, campaignId: string) {
    const campaign = await this.prisma.accessReviewCampaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) {
      throw new NotFoundException({
        code: ACCESS_REVIEW_ERROR.CAMPAIGN_NOT_FOUND,
        message: 'Campaign not found',
      });
    }
    return campaign;
  }

  private mapCampaign(campaign: {
    id: string;
    organizationId: string;
    scope: string;
    reviewerUserId: string;
    dueAt: Date;
    status: string;
    createdByUserId: string;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    snapshotVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: campaign.id,
      organizationId: campaign.organizationId,
      scope: campaign.scope,
      reviewerUserId: campaign.reviewerUserId,
      dueAt: campaign.dueAt.toISOString(),
      status: campaign.status,
      createdByUserId: campaign.createdByUserId,
      startedAt: campaign.startedAt?.toISOString() ?? null,
      completedAt: campaign.completedAt?.toISOString() ?? null,
      cancelledAt: campaign.cancelledAt?.toISOString() ?? null,
      snapshotVersion: campaign.snapshotVersion,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  private mapItem(item: {
    id: string;
    campaignId: string;
    organizationId: string;
    membershipId: string;
    userId: string;
    status: string;
    membershipStatus: string;
    membershipVersion: number;
    effectiveRole: string;
    effectiveRoleId: string | null;
    effectiveRoleLabel: string | null;
    privilegedCapabilities: unknown;
    stationScope: string | null;
    stationIds: unknown;
    permissionsSnapshot: unknown;
    lastActivityAt: Date | null;
    mfaEnrolled: boolean;
    activeSessionCount: number;
    riskReasons: unknown;
    accessSnapshot: unknown;
    snapshotVersion: number;
    decisions?: Array<{ id: string; decision: string; decidedAt: Date }>;
  }) {
    return {
      id: item.id,
      campaignId: item.campaignId,
      organizationId: item.organizationId,
      membershipId: item.membershipId,
      userId: item.userId,
      status: item.status,
      membershipStatus: item.membershipStatus,
      membershipVersion: item.membershipVersion,
      effectiveRole: item.effectiveRole,
      effectiveRoleId: item.effectiveRoleId,
      effectiveRoleLabel: item.effectiveRoleLabel,
      privilegedCapabilities: item.privilegedCapabilities,
      stationScope: item.stationScope,
      stationIds: item.stationIds,
      permissionsSnapshot: item.permissionsSnapshot,
      lastActivityAt: item.lastActivityAt?.toISOString() ?? null,
      mfaEnrolled: item.mfaEnrolled,
      activeSessionCount: item.activeSessionCount,
      riskReasons: item.riskReasons,
      accessSnapshot: item.accessSnapshot,
      snapshotVersion: item.snapshotVersion,
      latestDecision: item.decisions?.[0]
        ? {
            id: item.decisions[0].id,
            decision: item.decisions[0].decision,
            decidedAt: item.decisions[0].decidedAt.toISOString(),
          }
        : null,
    };
  }

  private mapDecision(decision: {
    id: string;
    itemId: string;
    campaignId: string;
    organizationId: string;
    reviewerUserId: string;
    decision: string;
    reason: string;
    decidedAt: Date;
    resultApplicationStatus: string;
    appliedAt: Date | null;
    applicationError: string | null;
    membershipVersionAtDecision: number;
    createdAt: Date;
  }) {
    return {
      id: decision.id,
      itemId: decision.itemId,
      campaignId: decision.campaignId,
      organizationId: decision.organizationId,
      reviewerUserId: decision.reviewerUserId,
      decision: decision.decision,
      reason: decision.reason,
      decidedAt: decision.decidedAt.toISOString(),
      resultApplicationStatus: decision.resultApplicationStatus,
      appliedAt: decision.appliedAt?.toISOString() ?? null,
      applicationError: decision.applicationError,
      membershipVersionAtDecision: decision.membershipVersionAtDecision,
      createdAt: decision.createdAt.toISOString(),
    };
  }
}
