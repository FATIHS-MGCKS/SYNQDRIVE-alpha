import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { DpiaWorkflowService } from './dpia-workflow.service';
import { PrivacyRiskAssessmentService } from './privacy-risk-assessment.service';
import {
  AcceptResidualRiskDto,
  ApproveDpiaDto,
  CreateDpiaDto,
  DpiaReviewDecisionDto,
  RejectDpiaDto,
  SubmitPrivacyRiskAssessmentDto,
  UpdateDpiaDraftDto,
} from './dto/dpia-workflow.dto';
import { DPIA_RISK_CONFIG } from './dpia-risk.config';

@ApiTags('data-authorizations/dpia-workflow')
@Controller('organizations/:orgId/processing-activities/:activityId/dpia-workflow')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DpiaWorkflowController {
  constructor(
    private readonly riskAssessment: PrivacyRiskAssessmentService,
    private readonly dpia: DpiaWorkflowService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  @Get('risk-config')
  async getConfig(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_view');
    return {
      dpiaScoreThreshold: DPIA_RISK_CONFIG.dpiaScoreThreshold,
      reviewDueLeadDays: DPIA_RISK_CONFIG.reviewDueLeadDays,
      reviewDueSuspendEnabled: DPIA_RISK_CONFIG.reviewDueSuspendEnabled,
      disclaimer: DPIA_RISK_CONFIG.disclaimer,
    };
  }

  @Post('risk-assessment')
  async submitRiskAssessment(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: SubmitPrivacyRiskAssessmentDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_assess');
    return this.riskAssessment.assess(orgId, activityId, dto, this.actor(req).id);
  }

  @Get('risk-assessment/current')
  async getCurrentRisk(@Param('orgId') orgId: string, @Param('activityId') activityId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_view');
    return this.riskAssessment.getCurrent(orgId, activityId);
  }

  @Get('risk-assessment/material-change')
  async detectMaterialChange(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_view');
    const changed = await this.riskAssessment.detectMaterialChange(orgId, activityId);
    return { materialChangeDetected: changed };
  }

  @Get('dpia')
  async getDpia(@Param('orgId') orgId: string, @Param('activityId') activityId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_view');
    return this.dpia.getCurrent(orgId, activityId);
  }

  @Post('dpia')
  async createDpia(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: CreateDpiaDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_edit');
    return this.dpia.createOrUpdateDraft(orgId, activityId, dto, this.actor(req).id);
  }

  @Patch('dpia')
  async updateDpia(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateDpiaDraftDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_edit');
    return this.dpia.createOrUpdateDraft(orgId, activityId, dto, this.actor(req).id);
  }

  @Post('dpia/submit')
  async submitDpia(@Param('orgId') orgId: string, @Param('activityId') activityId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_edit');
    return this.dpia.submitForReview(orgId, activityId, this.actor(req).id!);
  }

  @Post('dpia/privacy-review')
  async privacyReview(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: DpiaReviewDecisionDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_review_privacy');
    return this.dpia.recordPrivacyReview(orgId, activityId, this.actor(req).id!, dto);
  }

  @Post('dpia/security-review')
  async securityReview(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: DpiaReviewDecisionDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_review_security');
    return this.dpia.recordSecurityReview(orgId, activityId, this.actor(req).id!, dto);
  }

  @Post('dpia/accept-residual-risk')
  async acceptResidualRisk(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: AcceptResidualRiskDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_approve');
    return this.dpia.acceptResidualRisk(orgId, activityId, this.actor(req).id!, dto);
  }

  @Post('dpia/approve')
  async approveDpia(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: ApproveDpiaDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_approve');
    return this.dpia.approve(orgId, activityId, this.actor(req).id!, dto);
  }

  @Post('dpia/reject')
  async rejectDpia(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: RejectDpiaDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpia_approve');
    return this.dpia.reject(orgId, activityId, this.actor(req).id!, dto);
  }
}
