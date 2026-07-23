import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EnforcementPolicyLifecycleService } from './enforcement-policy-lifecycle.service';
import { ProcessingActivityLifecycleService } from './processing-activity-lifecycle.service';
import { LegalBasisAssessmentService } from '../legal-basis-assessment/legal-basis-assessment.service';
import {
  PolicyLifecycleRejectDto,
  PolicyLifecycleReasonDto,
  PolicyLifecycleScheduleDto,
} from './dto/policy-lifecycle.dto';

@ApiTags('data-authorizations/policy-lifecycle')
@Controller('organizations/:orgId/data-authorizations/policy-lifecycle')
export class PolicyLifecycleController {
  constructor(
    private readonly processingActivityLifecycle: ProcessingActivityLifecycleService,
    private readonly enforcementPolicyLifecycle: EnforcementPolicyLifecycleService,
    private readonly legalBasisAssessment: LegalBasisAssessmentService,
  ) {}

  private actorUserId(req: Request): string {
    return (req as Request & { user?: { id?: string } }).user?.id ?? 'system';
  }

  @Post('processing-activities/:id/submit-for-review')
  submitProcessingActivity(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.processingActivityLifecycle.submitForReview(orgId, id, this.actorUserId(req));
  }

  @Post('processing-activities/:id/approve')
  approveProcessingActivity(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.processingActivityLifecycle.approve(orgId, id, this.actorUserId(req));
  }

  @Post('processing-activities/:id/reject')
  rejectProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleRejectDto,
    @Req() req: Request,
  ) {
    return this.processingActivityLifecycle.reject(orgId, id, this.actorUserId(req), dto.reason);
  }

  @Post('processing-activities/:id/schedule')
  scheduleProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleScheduleDto,
  ) {
    return this.processingActivityLifecycle.schedule(orgId, id, new Date(dto.validFrom));
  }

  @Post('processing-activities/:id/activate')
  activateProcessingActivity(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    return this.processingActivityLifecycle.activate(orgId, id, { actorUserId: this.actorUserId(req) });
  }

  @Post('processing-activities/:id/suspend')
  suspendProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.processingActivityLifecycle.suspend(orgId, id, dto.reason);
  }

  @Post('processing-activities/:id/revoke')
  revokeProcessingActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.processingActivityLifecycle.revoke(orgId, id, dto.reason);
  }

  @Post('legal-basis-assessments/:id/activate')
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

  @Post('enforcement-policies/:id/revoke')
  revokeEnforcementPolicy(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: PolicyLifecycleReasonDto,
  ) {
    return this.enforcementPolicyLifecycle.revoke(orgId, id, dto.reason);
  }
}
