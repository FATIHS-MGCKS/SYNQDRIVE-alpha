import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { RevocationOrchestratorService } from './revocation-orchestrator.service';
import type { RevocationRetentionDecision } from './revocation-orchestrator.constants';

class ResumeRevocationWorkflowDto {
  retentionDecision?: RevocationRetentionDecision;
  resetAttempts?: boolean;
}

@ApiTags('data-authorizations/revocation-workflows')
@Controller('organizations/:orgId/data-authorizations/revocation-workflows')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class RevocationOrchestratorController {
  constructor(
    private readonly orchestrator: RevocationOrchestratorService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id ?? 'system', platformRole: user?.platformRole };
  }

  @Get(':workflowId')
  async getWorkflow(
    @Param('orgId') orgId: string,
    @Param('workflowId') workflowId: string,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.revocation_view');
    return this.orchestrator.getWorkflow(orgId, workflowId);
  }

  @Post(':workflowId/resume')
  async resumeWorkflow(
    @Param('orgId') orgId: string,
    @Param('workflowId') workflowId: string,
    @Body() body: ResumeRevocationWorkflowDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.revocation_resume');
    const user = (req as Request & { user?: { id?: string } }).user;
    return this.orchestrator.resumeWorkflow({
      organizationId: orgId,
      workflowId,
      actorUserId: user?.id ?? 'system',
      retentionDecision: body.retentionDecision,
      resetAttempts: body.resetAttempts,
    });
  }
}
