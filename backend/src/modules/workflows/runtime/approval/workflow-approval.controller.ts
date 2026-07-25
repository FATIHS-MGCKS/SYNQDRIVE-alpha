import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { WorkflowApprovalResumeService } from './workflow-approval-resume.service';
import { WorkflowApprovalLegacyBridgeService } from './workflow-approval-legacy.bridge';

const READ_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;
const WRITE_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;

class WorkflowApprovalDecisionDto {
  comment?: string;
  reason?: string;
}

@Controller('organizations/:orgId/workflow-approvals')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowApprovalController {
  constructor(
    private readonly resume: WorkflowApprovalResumeService,
    private readonly legacyBridge: WorkflowApprovalLegacyBridgeService,
  ) {}

  @Get()
  @Roles(...READ_ROLES)
  async listPending(@Param('orgId') orgId: string, @Query('limit') limit?: string) {
    return this.resume.listPendingSafe(orgId, limit ? parseInt(limit, 10) : 50);
  }

  @Post(':approvalId/approve')
  @Roles(...WRITE_ROLES)
  async approve(
    @Param('orgId') orgId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: WorkflowApprovalDecisionDto,
    @Req() req: { user?: { id?: string; name?: string } },
  ) {
    if (!req.user?.id) {
      return this.resume.approve({
        organizationId: orgId,
        approvalId,
        userId: 'unknown',
        userName: req.user?.name,
        comment: body.comment,
        reason: body.reason,
      });
    }
    return this.resume.approve({
      organizationId: orgId,
      approvalId,
      userId: req.user.id,
      userName: req.user.name,
      comment: body.comment,
      reason: body.reason,
    });
  }

  @Post(':approvalId/reject')
  @Roles(...WRITE_ROLES)
  async reject(
    @Param('orgId') orgId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: WorkflowApprovalDecisionDto,
    @Req() req: { user?: { id?: string; name?: string } },
  ) {
    return this.resume.reject({
      organizationId: orgId,
      approvalId,
      userId: req.user?.id ?? 'unknown',
      userName: req.user?.name,
      comment: body.comment,
      reason: body.reason,
    });
  }

  @Get('legacy/unbridged')
  @Roles(...READ_ROLES)
  async listLegacyUnbridged(@Param('orgId') orgId: string) {
    return this.legacyBridge.listUnbridgedLegacy(orgId);
  }
}
