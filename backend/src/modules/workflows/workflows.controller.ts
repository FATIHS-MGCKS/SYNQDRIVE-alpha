import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequireWorkflowPermission } from './permissions/require-workflow-permission.decorator';
import type { PermissionActor } from '@shared/auth/permission.util';
import {
  CreateWorkflowDto,
  PreviewWorkflowRiskDto,
  RejectWorkflowActionDto,
  TestWorkflowDto,
  UpdateWorkflowDto,
} from './dto';

@Controller('organizations/:orgId/workflows')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}

  @Get()
  @RequireWorkflowPermission('workflow.read')
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findByOrg(orgId, { status, category });
  }

  @Get('risk-registry')
  @RequireWorkflowPermission('workflow.read')
  async riskRegistry(@Param('orgId') orgId: string) {
    return this.service.getRiskRegistry(orgId);
  }

  @Post('risk/preview')
  @RequireWorkflowPermission('workflow.test_dry_run')
  async previewRisk(
    @Param('orgId') orgId: string,
    @Body() body: PreviewWorkflowRiskDto,
  ) {
    return this.service.previewWorkflowRisk(orgId, body);
  }

  @Get('stats')
  @RequireWorkflowPermission('workflow.read')
  async stats(@Param('orgId') orgId: string) {
    return this.service.getStats(orgId);
  }

  @Get('runs/:runId')
  @RequireWorkflowPermission('workflow.run.read')
  async getRun(@Param('orgId') orgId: string, @Param('runId') runId: string) {
    return this.service.getRun(orgId, runId);
  }

  @Post('action-runs/:actionRunId/approve')
  @RequireWorkflowPermission('workflow.approve')
  async approveAction(
    @Param('orgId') orgId: string,
    @Param('actionRunId') actionRunId: string,
    @Req() req: { user?: PermissionActor },
  ) {
    return this.service.approveActionRun(orgId, actionRunId, req.user?.id, req.user);
  }

  @Post('action-runs/:actionRunId/reject')
  @RequireWorkflowPermission('workflow.reject')
  async rejectAction(
    @Param('orgId') orgId: string,
    @Param('actionRunId') actionRunId: string,
    @Body() body: RejectWorkflowActionDto,
    @Req() req: { user?: PermissionActor },
  ) {
    return this.service.rejectActionRun(
      orgId,
      actionRunId,
      req.user?.id,
      body.reason,
      req.user,
    );
  }

  @Get(':id/runs')
  @RequireWorkflowPermission('workflow.run.read')
  async listRuns(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listRuns(orgId, id, limit ? Number(limit) : 25);
  }

  @Get(':id/risk')
  @RequireWorkflowPermission('workflow.read')
  async getWorkflowRisk(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.getWorkflowRisk(orgId, id);
  }

  @Get(':id')
  @RequireWorkflowPermission('workflow.read')
  async get(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.findById(orgId, id);
  }

  @Post()
  @RequireWorkflowPermission('workflow.create')
  async create(
    @Param('orgId') orgId: string,
    @Body() body: CreateWorkflowDto,
    @Req() req: { user?: PermissionActor & { name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.create(
      orgId,
      body,
      user.id,
      user.name || user.email || 'System',
      user,
    );
  }

  @Patch(':id')
  @RequireWorkflowPermission('workflow.edit_draft')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDto,
    @Req() req: { user?: PermissionActor & { name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.update(
      orgId,
      id,
      body,
      user.id,
      user.name || user.email || 'System',
      user,
    );
  }

  @Patch(':id/toggle')
  @RequireWorkflowPermission('workflow.enable')
  async toggle(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: PermissionActor & { name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.toggleStatus(
      orgId,
      id,
      user.id,
      user.name || user.email || 'System',
      user,
    );
  }

  @Post(':id/duplicate')
  @RequireWorkflowPermission('workflow.create')
  async duplicate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: PermissionActor & { name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.duplicate(
      orgId,
      id,
      user.id,
      user.name || user.email || 'System',
    );
  }

  @Post(':id/test')
  @RequireWorkflowPermission('workflow.test_external')
  async test(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: TestWorkflowDto,
    @Req() req: { user?: PermissionActor },
  ) {
    return this.service.testWorkflow(orgId, id, body, req.user);
  }

  @Delete(':id')
  @RequireWorkflowPermission('workflow.archive')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: PermissionActor },
  ) {
    return this.service.remove(orgId, id, req.user);
  }
}
