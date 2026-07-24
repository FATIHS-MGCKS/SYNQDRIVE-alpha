import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  DataProcessingReviewDecisionOutcome,
  DataProcessingReviewEntityType,
  DataProcessingReviewStepType,
} from '@prisma/client';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DATA_AUTH_MODULE } from '../../data-authorization.constants';
import { ProcessingActivityLifecycleService } from '../policy-lifecycle/processing-activity-lifecycle.service';
import { RecordReviewDecisionDto } from './dto/review-workflow.dto';
import { DataProcessingReviewWorkflowService } from './review-workflow.service';
import { mapReviewWorkflowError } from './review-workflow.exceptions';

@ApiTags('data-authorizations/review-workflow')
@Controller('organizations/:orgId/data-authorizations/review-workflow')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DataProcessingReviewWorkflowController {
  constructor(
    private readonly reviewWorkflow: DataProcessingReviewWorkflowService,
    private readonly processingActivityLifecycle: ProcessingActivityLifecycleService,
  ) {}

  private actorUserId(req: Request): string {
    return (req as Request & { user?: { id?: string } }).user?.id ?? 'system';
  }

  @Post('processing-activities/:id/submit')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  async submitProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const actorUserId = this.actorUserId(req);
    const fingerprint = await this.reviewWorkflow.buildProcessingActivityFingerprint(orgId, id);
    const riskLevel = await this.reviewWorkflow.computeProcessingActivityRisk(orgId, id);
    const activity = await this.processingActivityLifecycle.findOrThrow(orgId, id);

    await this.reviewWorkflow.startReviewCycle({
      orgId,
      entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
      entityId: id,
      entityVersionNumber: activity.versionNumber,
      contentFingerprint: fingerprint,
      riskLevel,
      requesterUserId: actorUserId,
      processingActivityId: id,
    });

    return this.processingActivityLifecycle.submitForReview(orgId, id, actorUserId);
  }

  @Post('cycles/:cycleId/decisions')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async recordDecision(
    @Param('orgId') orgId: string,
    @Param('cycleId') cycleId: string,
    @Body() dto: RecordReviewDecisionDto,
    @Req() req: Request,
  ) {
    try {
      return await this.reviewWorkflow.recordDecision({
        orgId,
        cycleId,
        stepType: dto.stepType,
        outcome: dto.outcome,
        actorUserId: this.actorUserId(req),
        reason: dto.reason,
      });
    } catch (error) {
      mapReviewWorkflowError(error);
    }
  }

  @Get('cycles/:cycleId')
  @RequirePermission(DATA_AUTH_MODULE, 'read')
  async getCycle(@Param('orgId') orgId: string, @Param('cycleId') cycleId: string) {
    return this.reviewWorkflow.getCycleStatus(orgId, cycleId);
  }

  @Post('processing-activities/:id/reject')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  async rejectProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @Req() req: Request,
  ) {
    const activity = await this.processingActivityLifecycle.findOrThrow(orgId, id);
    if (!activity.activeReviewCycleId) {
      return this.processingActivityLifecycle.reject(orgId, id, this.actorUserId(req), dto.reason);
    }
    return this.reviewWorkflow.recordDecision({
      orgId,
      cycleId: activity.activeReviewCycleId,
      stepType: DataProcessingReviewStepType.FINAL_APPROVAL,
      outcome: DataProcessingReviewDecisionOutcome.REJECTED,
      actorUserId: this.actorUserId(req),
      reason: dto.reason,
    });
  }
}
