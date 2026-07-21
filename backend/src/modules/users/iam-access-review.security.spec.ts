import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AccessReviewCampaignScope,
  AccessReviewCampaignStatus,
  AccessReviewDecisionType,
  AccessReviewItemStatus,
  AccessReviewResultApplicationStatus,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { IamAccessReviewService } from './iam-access-review.service';
import { IamAccessReviewSnapshotService } from './iam-access-review-snapshot.service';
import { ACCESS_REVIEW_ERROR, ACCESS_REVIEW_RISK } from './iam-access-review.policy';
import { UserAccessAuditAction } from './user-access-audit.service';

describe('IAM access review (Prompt 19)', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const reviewerId = 'reviewer-1';
  const actorId = 'actor-1';
  const userId = 'user-target';
  const membershipId = 'mem-1';
  const campaignId = 'camp-1';
  const itemId = 'item-1';

  const baseSnapshot = {
    membershipId,
    userId,
    membershipStatus: MembershipStatus.ACTIVE,
    membershipVersion: 3,
    effectiveRole: MembershipRole.ORG_ADMIN,
    effectiveRoleId: 'role-1',
    effectiveRoleLabel: 'Org Admin',
    privilegedCapabilities: ['role:ORG_ADMIN'],
    stationScope: 'all',
    stationIds: null,
    permissions: { 'users-roles': { read: true, write: true, manage: true } },
    lastActivityAt: new Date().toISOString(),
    mfaEnrolled: true,
    activeSessionCount: 1,
    riskReasons: [ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT, ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN],
    platformRole: 'USER',
    userStatus: 'ACTIVE',
    userEmail: 'admin@example.com',
    roleIsActive: true,
  };

  function buildService(overrides: Record<string, unknown> = {}) {
    const iamAudit = {
      enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      processOutboxIds: jest.fn().mockResolvedValue(undefined),
      ...(overrides.iamAudit as object),
    };
    const snapshots = {
      buildSnapshotsForOrganization: jest
        .fn()
        .mockResolvedValue([baseSnapshot]),
      ...(overrides.snapshots as object),
    } as unknown as IamAccessReviewSnapshotService;
    const lifecycle = {
      move: jest.fn().mockResolvedValue({ membershipVersion: 4 }),
      suspend: jest.fn().mockResolvedValue({ status: MembershipStatus.SUSPENDED }),
      remove: jest.fn().mockResolvedValue({ status: MembershipStatus.REMOVED }),
      ...(overrides.lifecycle as object),
    };

    const prisma: Record<string, any> = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: membershipId,
          userId,
          organizationId: orgA,
          role: MembershipRole.ORG_ADMIN,
          status: MembershipStatus.ACTIVE,
          membershipVersion: 3,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      accessReviewCampaign: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.id === campaignId && where?.organizationId === orgA) {
            return Promise.resolve({
              id: campaignId,
              organizationId: orgA,
              scope: AccessReviewCampaignScope.PRIVILEGED_ACCOUNTS,
              reviewerUserId: reviewerId,
              dueAt: new Date(Date.now() + 86400000),
              status: AccessReviewCampaignStatus.DRAFT,
              createdByUserId: actorId,
              startedAt: null,
              completedAt: null,
              cancelledAt: null,
              snapshotVersion: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              metadata: { idempotencyKey: 'create-key-1' },
            });
          }
          if (where?.organizationId === orgB) return Promise.resolve(null);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: campaignId,
            organizationId: orgA,
            scope: data.scope,
            reviewerUserId: data.reviewerUserId,
            dueAt: data.dueAt,
            status: AccessReviewCampaignStatus.DRAFT,
            createdByUserId: data.createdByUserId,
            startedAt: null,
            completedAt: null,
            cancelledAt: null,
            snapshotVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: campaignId,
            organizationId: orgA,
            scope: AccessReviewCampaignScope.PRIVILEGED_ACCOUNTS,
            reviewerUserId: reviewerId,
            dueAt: new Date(),
            status: data.status ?? AccessReviewCampaignStatus.ACTIVE,
            createdByUserId: actorId,
            startedAt: data.startedAt ?? new Date(),
            completedAt: data.completedAt ?? null,
            cancelledAt: null,
            snapshotVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      accessReviewItem: {
        create: jest.fn().mockResolvedValue({ id: itemId }),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.id === itemId && where?.organizationId === orgA) {
            return Promise.resolve({
              id: itemId,
              campaignId,
              organizationId: orgA,
              membershipId,
              userId,
              status: AccessReviewItemStatus.PENDING,
              membershipVersion: 3,
              riskReasons: [
                ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT,
                ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN,
              ],
              campaign: {
                id: campaignId,
                reviewerUserId: reviewerId,
                status: AccessReviewCampaignStatus.ACTIVE,
              },
            });
          }
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      accessReviewDecision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'decision-1',
          itemId,
          campaignId,
          organizationId: orgA,
          reviewerUserId: reviewerId,
          decision: AccessReviewDecisionType.CONFIRM,
          reason: 'Still required',
          decidedAt: new Date(),
          resultApplicationStatus: AccessReviewResultApplicationStatus.PENDING,
          appliedAt: null,
          applicationError: null,
          membershipVersionAtDecision: 3,
          createdAt: new Date(),
        }),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'decision-1',
            itemId,
            campaignId,
            organizationId: orgA,
            reviewerUserId: reviewerId,
            decision: data.decision ?? AccessReviewDecisionType.CONFIRM,
            reason: 'Still required',
            decidedAt: new Date(),
            resultApplicationStatus:
              data.resultApplicationStatus ??
              AccessReviewResultApplicationStatus.NOT_APPLICABLE,
            appliedAt: data.appliedAt ?? null,
            applicationError: data.applicationError ?? null,
            membershipVersionAtDecision: 3,
            createdAt: new Date(),
          }),
        ),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          accessReviewCampaign: (prisma as any).accessReviewCampaign,
          accessReviewItem: (prisma as any).accessReviewItem,
          accessReviewDecision: (prisma as any).accessReviewDecision,
        };
        return fn(tx);
      }),
      ...(overrides.prisma as object),
    };

    const service = new IamAccessReviewService(
      prisma as never,
      iamAudit as never,
      snapshots,
      lifecycle as never,
    );

    return { service, prisma, iamAudit, snapshots, lifecycle };
  }

  it('creates a campaign with audit outbox entry', async () => {
    const { service, iamAudit } = buildService();
    const result = await service.createCampaign({
      organizationId: orgA,
      scope: AccessReviewCampaignScope.PRIVILEGED_ACCOUNTS,
      reviewerUserId: reviewerId,
      dueAt: new Date(Date.now() + 7 * 86400000),
      createdByUserId: actorId,
      idempotencyKey: 'create-key-1',
    });
    expect(result.id).toBe(campaignId);
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: UserAccessAuditAction.ACCESS_REVIEW_CAMPAIGN_CREATED,
      }),
    );
  });

  it('starts campaign and snapshots effective access items', async () => {
    const { service, snapshots, iamAudit } = buildService();
    const result = await service.startCampaign(orgA, campaignId, actorId);
    expect(result.status).toBe(AccessReviewCampaignStatus.ACTIVE);
    expect(snapshots.buildSnapshotsForOrganization).toHaveBeenCalled();
    expect(iamAudit.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: UserAccessAuditAction.ACCESS_REVIEW_CAMPAIGN_STARTED,
      }),
    );
  });

  it('records CONFIRM decision without lifecycle mutation', async () => {
    const { service, lifecycle } = buildService();
    const decision = await service.recordDecision({
      organizationId: orgA,
      itemId,
      reviewerUserId: reviewerId,
      decision: AccessReviewDecisionType.CONFIRM,
      reason: 'Access still required',
      idempotencyKey: 'decision-confirm-1',
    });
    expect(decision.resultApplicationStatus).toBe(
      AccessReviewResultApplicationStatus.NOT_APPLICABLE,
    );
    expect(lifecycle.move).not.toHaveBeenCalled();
    expect(lifecycle.suspend).not.toHaveBeenCalled();
    expect(lifecycle.remove).not.toHaveBeenCalled();
  });

  it('applies MODIFY via membership lifecycle move', async () => {
    const { service, lifecycle } = buildService();
    await service.recordDecision({
      organizationId: orgA,
      itemId,
      reviewerUserId: reviewerId,
      decision: AccessReviewDecisionType.MODIFY,
      reason: 'Reduce privileges',
      idempotencyKey: 'decision-modify-1',
      modifyPayload: {
        role: MembershipRole.WORKER,
        permissions: { fleet: { read: true, write: false } },
      },
    });
    expect(lifecycle.move).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgA,
        userId,
        role: MembershipRole.WORKER,
      }),
    );
  });

  it('applies SUSPEND via lifecycle for non-last-admin', async () => {
    const { service, lifecycle, prisma } = buildService();
    (prisma.accessReviewItem.findFirst as jest.Mock).mockResolvedValue({
      id: itemId,
      campaignId,
      organizationId: orgA,
      membershipId,
      userId,
      status: AccessReviewItemStatus.PENDING,
      membershipVersion: 3,
      riskReasons: [ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT],
      campaign: {
        reviewerUserId: reviewerId,
        status: AccessReviewCampaignStatus.ACTIVE,
      },
    });
    await service.recordDecision({
      organizationId: orgA,
      itemId,
      reviewerUserId: reviewerId,
      decision: AccessReviewDecisionType.SUSPEND,
      reason: 'Inactive account',
      idempotencyKey: 'decision-suspend-1',
    });
    expect(lifecycle.suspend).toHaveBeenCalled();
  });

  it('blocks SUSPEND for last org admin', async () => {
    const { service } = buildService();
    await expect(
      service.recordDecision({
        organizationId: orgA,
        itemId,
        reviewerUserId: reviewerId,
        decision: AccessReviewDecisionType.SUSPEND,
        reason: 'Should be blocked',
        idempotencyKey: 'decision-last-admin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks overdue campaigns on list', async () => {
    const { service, prisma } = buildService();
    await service.listCampaigns(orgA);
    expect(prisma.accessReviewCampaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgA }),
        data: { status: AccessReviewCampaignStatus.OVERDUE },
      }),
    );
  });

  it('allows a new campaign after a completed one (re-campaign)', async () => {
    const { service, prisma } = buildService();
    (prisma.accessReviewCampaign.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.createCampaign({
      organizationId: orgA,
      scope: AccessReviewCampaignScope.OVERDUE_REVIEWS,
      reviewerUserId: reviewerId,
      dueAt: new Date(Date.now() + 86400000),
      createdByUserId: actorId,
      idempotencyKey: 'create-key-2',
    });
    expect(result.scope).toBe(AccessReviewCampaignScope.OVERDUE_REVIEWS);
  });

  it('rejects cross-tenant item access', async () => {
    const { service } = buildService();
    await expect(
      service.recordDecision({
        organizationId: orgB,
        itemId,
        reviewerUserId: reviewerId,
        decision: AccessReviewDecisionType.CONFIRM,
        reason: 'Wrong org',
        idempotencyKey: 'cross-tenant-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects decisions on stale membership snapshot version', async () => {
    const { service, prisma } = buildService();
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({
      id: membershipId,
      userId,
      organizationId: orgA,
      membershipVersion: 99,
    });
    await expect(
      service.recordDecision({
        organizationId: orgA,
        itemId,
        reviewerUserId: reviewerId,
        decision: AccessReviewDecisionType.CONFIRM,
        reason: 'Stale',
        idempotencyKey: 'stale-1',
      }),
    ).rejects.toMatchObject({
      response: { code: ACCESS_REVIEW_ERROR.STALE_SNAPSHOT },
    });
  });

  it('rejects idempotent decision keys from another tenant', async () => {
    const { service, prisma } = buildService();
    (prisma.accessReviewDecision.findUnique as jest.Mock).mockResolvedValue({
      id: 'decision-x',
      organizationId: orgB,
      itemId,
      campaignId,
      reviewerUserId: reviewerId,
      decision: AccessReviewDecisionType.CONFIRM,
      reason: 'x',
      decidedAt: new Date(),
      resultApplicationStatus: AccessReviewResultApplicationStatus.NOT_APPLICABLE,
      appliedAt: null,
      applicationError: null,
      membershipVersionAtDecision: 3,
      createdAt: new Date(),
    });
    await expect(
      service.recordDecision({
        organizationId: orgA,
        itemId,
        reviewerUserId: reviewerId,
        decision: AccessReviewDecisionType.CONFIRM,
        reason: 'cross tenant idempotency',
        idempotencyKey: 'shared-key',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
