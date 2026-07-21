import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessReviewCampaignScope } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { IamAccessReviewService } from './iam-access-review.service';
import { AccessReviewDecisionType } from '@prisma/client';
import type { RecordAccessReviewDecisionInput } from './iam-access-review.types';

interface AuthedRequest {
  user?: { id?: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

const USERS_MODULE = USERS_ROLES_MODULE;

@Controller('organizations/:orgId/access-reviews')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class IamAccessReviewController {
  constructor(private readonly accessReviews: IamAccessReviewService) {}

  private actor(req: AuthedRequest) {
    return {
      userId: req.user?.id,
      route: undefined as string | undefined,
      ipAddress: req.ip,
      userAgent: Array.isArray(req.headers?.['user-agent'])
        ? req.headers?.['user-agent'][0]
        : req.headers?.['user-agent'],
    };
  }

  @Get('campaigns')
  @RequirePermission(USERS_MODULE, 'read')
  listCampaigns(@Param('orgId') orgId: string) {
    return this.accessReviews.listCampaigns(orgId);
  }

  @Post('campaigns')
  @RequirePermission(USERS_MODULE, 'manage')
  createCampaign(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body()
    body: {
      scope: AccessReviewCampaignScope;
      reviewerUserId: string;
      dueAt: string;
      idempotencyKey: string;
    },
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.accessReviews.createCampaign({
      organizationId: orgId,
      scope: body.scope,
      reviewerUserId: body.reviewerUserId,
      dueAt: new Date(body.dueAt),
      createdByUserId: actorId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('campaigns/:campaignId')
  @RequirePermission(USERS_MODULE, 'read')
  getCampaign(@Param('orgId') orgId: string, @Param('campaignId') campaignId: string) {
    return this.accessReviews.getCampaign(orgId, campaignId);
  }

  @Post('campaigns/:campaignId/start')
  @RequirePermission(USERS_MODULE, 'manage')
  startCampaign(
    @Param('orgId') orgId: string,
    @Param('campaignId') campaignId: string,
    @Req() req: AuthedRequest,
  ) {
    const actorId = req.user?.id;
    if (!actorId) throw new Error('Authentication required');
    return this.accessReviews.startCampaign(orgId, campaignId, actorId);
  }

  @Get('campaigns/:campaignId/items')
  @RequirePermission(USERS_MODULE, 'read')
  listItems(@Param('orgId') orgId: string, @Param('campaignId') campaignId: string) {
    return this.accessReviews.listItems(orgId, campaignId);
  }

  @Post('items/:itemId/decisions')
  @RequirePermission(USERS_MODULE, 'manage')
  recordDecision(
    @Param('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthedRequest,
    @Body()
    body: {
      decision: AccessReviewDecisionType;
      reason: string;
      idempotencyKey: string;
      modifyPayload?: RecordAccessReviewDecisionInput['modifyPayload'];
    },
  ) {
    const reviewerUserId = req.user?.id;
    if (!reviewerUserId) throw new Error('Authentication required');
    const actor = this.actor(req);
    return this.accessReviews.recordDecision({
      organizationId: orgId,
      itemId,
      reviewerUserId,
      decision: body.decision,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      modifyPayload: body.modifyPayload,
      actor: {
        route: 'POST /organizations/:orgId/access-reviews/items/:itemId/decisions',
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
  }
}
