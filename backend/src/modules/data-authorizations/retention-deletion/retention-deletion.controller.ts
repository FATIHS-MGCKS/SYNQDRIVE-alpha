import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { RetentionDeletionExecutorService } from './retention-deletion-executor.service';
import { RetentionPolicyService, RetentionRevocationAssessmentService } from './retention-policy.service';
import { RETENTION_DELETION_CONFIG } from './retention-deletion.config';
import {
  AssessRevocationRetentionDto,
  CreateRetentionExceptionDto,
  RunDeletionJobDto,
  UpsertRetentionPolicyDto,
} from './dto/retention-deletion.dto';
import { PrismaService } from '@shared/database/prisma.service';

@ApiTags('data-authorizations/retention-deletion')
@Controller('organizations/:orgId/processing-activities/:activityId/retention-deletion')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class RetentionDeletionController {
  constructor(
    private readonly policies: RetentionPolicyService,
    private readonly executor: RetentionDeletionExecutorService,
    private readonly revocation: RetentionRevocationAssessmentService,
    private readonly prisma: PrismaService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  @Get('config')
  async getConfig(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_view');
    return {
      ...RETENTION_DELETION_CONFIG,
      retentionClasses: [
        'OPERATIONAL',
        'TELEMETRY',
        'ANALYTICS',
        'AUDIT_EVIDENCE',
        'LEGAL_EVIDENCE',
        'CUSTOMER_DATA',
        'FINANCIAL',
      ],
      retentionStartEvents: [
        'PROCESSING_START',
        'PROCESSING_END',
        'CONSENT_WITHDRAWAL',
        'CONTRACT_END',
        'LAST_ACTIVITY',
        'MANUAL_ANCHOR',
      ],
      deletionMethods: ['HARD_DELETE', 'ANONYMIZE', 'REDACT', 'ARCHIVE_THEN_DELETE'],
      stepTargets: ['POSTGRESQL', 'CLICKHOUSE', 'OBJECT_STORAGE', 'REDIS_CACHE', 'DERIVED_DATA'],
    };
  }

  @Get('policies')
  async listPolicies(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_view');
    return this.policies.list(orgId, activityId);
  }

  @Post('policies')
  async upsertPolicy(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpsertRetentionPolicyDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_edit');
    return this.policies.upsert(orgId, activityId, dto, this.actor(req).id);
  }

  @Post('policies/:policyId/exceptions')
  async addException(
    @Param('orgId') orgId: string,
    @Param('policyId') policyId: string,
    @Body() dto: CreateRetentionExceptionDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_edit');
    return this.policies.addException(orgId, policyId, dto, this.actor(req).id);
  }

  @Patch('policies/:policyId/legal-hold')
  async setLegalHold(
    @Param('orgId') orgId: string,
    @Param('policyId') policyId: string,
    @Body() body: { active: boolean; reason: string },
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_legal_hold');
    return this.policies.setLegalHold(orgId, policyId, body.active, body.reason, this.actor(req).id!);
  }

  @Post('deletion-jobs')
  async runDeletionJob(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: RunDeletionJobDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_delete');
    return this.executor.runJob(orgId, activityId, dto, this.actor(req).id);
  }

  @Get('deletion-jobs')
  async listDeletionJobs(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_view');
    return this.prisma.processingActivityDeletionJob.findMany({
      where: { organizationId: orgId, processingActivityId: activityId },
      include: { steps: true, evidence: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Get('decisions')
  async listDecisions(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_view');
    return this.prisma.processingActivityDeletionDecision.findMany({
      where: { organizationId: orgId, processingActivityId: activityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('revocation-assessment')
  async assessRevocation(
    @Param('orgId') orgId: string,
    @Param('activityId') activityId: string,
    @Body() dto: AssessRevocationRetentionDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.retention_view');
    return this.revocation.assess(orgId, activityId, dto.reason, this.actor(req).id);
  }
}
