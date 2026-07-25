import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import type { PermissionActor } from '@shared/auth/permission.util';
import { WorkflowShadowService } from './workflow-shadow.service';

const READ_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;
const WRITE_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;

@Controller('organizations/:orgId/workflows/shadow')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowShadowController {
  constructor(private readonly shadow: WorkflowShadowService) {}

  @Get('settings')
  @Roles(...READ_ROLES)
  getSettings(@Param('orgId') orgId: string) {
    return this.shadow.getSettings(orgId);
  }

  @Patch('settings')
  @Roles(...WRITE_ROLES)
  updateSettings(
    @Param('orgId') orgId: string,
    @Body()
    body: { enabled?: boolean; legacyCompareEnabled?: boolean; retentionDays?: number },
    @Req() req: { user?: PermissionActor },
  ) {
    return this.shadow.updateSettings(orgId, body, req.user?.id);
  }

  @Get('summary')
  @Roles(...READ_ROLES)
  getSummary(@Param('orgId') orgId: string) {
    return this.shadow.getDeviationSummary(orgId);
  }

  @Get('deviations')
  @Roles(...READ_ROLES)
  getDeviations(@Param('orgId') orgId: string) {
    return this.shadow.getDeviationSummary(orgId);
  }

  @Get('runs')
  @Roles(...READ_ROLES)
  listRuns(
    @Param('orgId') orgId: string,
    @Query('workflowId') workflowId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.shadow.listRuns(orgId, {
      workflowId,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('runs/:runId')
  @Roles(...READ_ROLES)
  getRun(@Param('orgId') orgId: string, @Param('runId') runId: string) {
    return this.shadow.getRun(orgId, runId);
  }

  @Patch('workflows/:workflowId')
  @Roles(...WRITE_ROLES)
  setWorkflowShadow(
    @Param('orgId') orgId: string,
    @Param('workflowId') workflowId: string,
    @Body() body: { shadowEnabled: boolean },
  ) {
    return this.shadow.setWorkflowShadowEnabled(orgId, workflowId, body.shadowEnabled === true);
  }
}
