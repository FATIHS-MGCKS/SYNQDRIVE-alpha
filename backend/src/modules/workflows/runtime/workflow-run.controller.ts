import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { WorkflowRunCancellationService } from './cancellation/workflow-run-cancellation.service';

const READ_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;
const WRITE_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;

class WorkflowRunCancelDto {
  reason?: string;
}

@Controller('organizations/:orgId/workflow-runs')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowRunController {
  constructor(private readonly cancellation: WorkflowRunCancellationService) {}

  @Get(':runId/status')
  @Roles(...READ_ROLES)
  async getStatus(@Param('orgId') orgId: string, @Param('runId') runId: string) {
    return this.cancellation.getRunStatusView(orgId, runId);
  }

  @Post(':runId/cancel')
  @Roles(...WRITE_ROLES)
  async cancel(
    @Param('orgId') orgId: string,
    @Param('runId') runId: string,
    @Body() body: WorkflowRunCancelDto,
    @Req() req: { user?: { id?: string; name?: string } },
  ) {
    return this.cancellation.cancelRun({
      organizationId: orgId,
      runId,
      userId: req.user?.id,
      actor: {
        type: 'USER',
        id: req.user?.id,
        source: 'workflow-run.cancel',
      },
      reason: body.reason?.trim() || 'Cancelled by user',
      source: 'USER_REQUEST',
    });
  }
}
