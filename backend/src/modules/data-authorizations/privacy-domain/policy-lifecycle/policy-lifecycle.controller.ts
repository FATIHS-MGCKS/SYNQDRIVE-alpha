import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { EnforcementPolicyLifecycleService } from './enforcement-policy-lifecycle.service';
import { ProcessingActivityLifecycleService } from './processing-activity-lifecycle.service';
import { LegalBasisAssessmentService } from '../legal-basis-assessment/legal-basis-assessment.service';
import { DataProcessingPermissionService } from '../review-workflow/data-processing-permission.service';
import {
  PolicyLifecycleExtendDto,
  PolicyLifecycleRejectDto,
  PolicyLifecycleReasonDto,
  PolicyLifecycleScheduleDto,
} from './dto/policy-lifecycle.dto';
import { DATA_AUTH_MODULE } from '../../data-authorization.constants';

@ApiTags('data-authorizations/policy-lifecycle')
@Controller('organizations/:orgId/data-authorizations/policy-lifecycle')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class PolicyLifecycleController {
  constructor(
    private readonly processingActivityLifecycle: ProcessingActivityLifecycleService,
    private readonly enforcementPolicyLifecycle: EnforcementPolicyLifecycleService,
    private readonly legalBasisAssessment: LegalBasisAssessmentService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actorUserId(req: Request): string {
    return (req as Request & { user?: { id?: string } }).user?.id ?? 'system';
  }

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  @Post('processing-activities/:id/submit-for-review')
  @RequirePermission(DATA_AUTH_MODULE, 'write')
  submitProcessingActivity(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.processingActivityLifecycle.submitForReview(orgId, id, this.actorUserId(req));
  }

  @Post('processing-activities/:id/approve')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  approveProcessingActivity(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.processingActivityLifecycle.approve(orgId, id, this.actorUserId(req));
  }

  @Post('processing-activities/:id/reject')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  rejectProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleRejectDto,
    @Req() req: Request,
  ) {
    return this.processingActivityLifecycle.reject(orgId, id, this.actorUserId(req), dto.reason);
  }

  @Post('processing-activities/:id/schedule')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  scheduleProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleScheduleDto,
  ) {
    return this.processingActivityLifecycle.schedule(orgId, id, new Date(dto.validFrom));
  }

  @Post('processing-activities/:id/activate')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  activateProcessingActivity(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.processingActivityLifecycle.activate(orgId, id, { actorUserId: this.actorUserId(req) });
  }

  @Post('processing-activities/:id/suspend')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  suspendProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.processingActivityLifecycle.suspend(orgId, id, dto.reason);
  }

  @Post('processing-activities/:id/resume')
  async resumeProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.resume');
    return this.processingActivityLifecycle.resume(orgId, id, {
      actorUserId: this.actorUserId(req),
      reason: dto.reason,
    });
  }

  @Post('processing-activities/:id/extend')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  extendProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleExtendDto,
  ) {
    return this.processingActivityLifecycle.extendViaNewVersion(orgId, id, {
      validUntil: new Date(dto.validUntil),
      title: dto.title,
      description: dto.description,
    });
  }

  @Post('processing-activities/:id/revoke')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  revokeProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.processingActivityLifecycle.revoke(orgId, id, dto.reason);
  }

  @Post('legal-basis-assessments/:id/activate')
  @RequirePermission(DATA_AUTH_MODULE, 'manage')
  activateLegalBasis(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.legalBasisAssessment.activate(orgId, id, this.actorUserId(req));
  }

  @Post('enforcement-policies/:id/submit-for-review')
  submitEnforcementPolicy(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.enforcementPolicyLifecycle.submitForReview(orgId, id, this.actorUserId(req));
  }

  @Post('enforcement-policies/:id/approve')
  approveEnforcementPolicy(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.enforcementPolicyLifecycle.approve(orgId, id, this.actorUserId(req));
  }

  @Post('enforcement-policies/:id/schedule')
  scheduleEnforcementPolicy(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleScheduleDto,
  ) {
    return this.enforcementPolicyLifecycle.schedule(orgId, id, new Date(dto.validFrom));
  }

  @Post('enforcement-policies/:id/activate')
  activateEnforcementPolicy(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.enforcementPolicyLifecycle.activate(orgId, id, { actorUserId: this.actorUserId(req) });
  }

  @Post('enforcement-policies/:id/suspend')
  suspendEnforcementPolicy(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.enforcementPolicyLifecycle.suspend(orgId, id, dto.reason);
  }

  @Post('enforcement-policies/:id/resume')
  async resumeEnforcementPolicy(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.resume');
    return this.enforcementPolicyLifecycle.resume(orgId, id, {
      actorUserId: this.actorUserId(req),
      reason: dto.reason,
    });
  }

  @Post('enforcement-policies/:id/revoke')
  revokeEnforcementPolicy(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.enforcementPolicyLifecycle.revoke(orgId, id, dto.reason);
  }
}
