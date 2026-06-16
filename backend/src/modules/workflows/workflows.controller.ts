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
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  CreateWorkflowDto,
  RejectWorkflowActionDto,
  TestWorkflowDto,
  UpdateWorkflowDto,
} from './dto';

const WORKFLOW_READ_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;
const WORKFLOW_WRITE_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;

@Controller('organizations/:orgId/workflows')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}

  @Get()
  @Roles(...WORKFLOW_READ_ROLES)
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findByOrg(orgId, { status, category });
  }

  @Get('stats')
  @Roles(...WORKFLOW_READ_ROLES)
  async stats(@Param('orgId') orgId: string) {
    return this.service.getStats(orgId);
  }

  @Get('runs/:runId')
  @Roles(...WORKFLOW_READ_ROLES)
  async getRun(@Param('orgId') orgId: string, @Param('runId') runId: string) {
    return this.service.getRun(orgId, runId);
  }

  @Post('action-runs/:actionRunId/approve')
  @Roles(...WORKFLOW_WRITE_ROLES)
  async approveAction(
    @Param('orgId') orgId: string,
    @Param('actionRunId') actionRunId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.service.approveActionRun(orgId, actionRunId, req.user?.id);
  }

  @Post('action-runs/:actionRunId/reject')
  @Roles(...WORKFLOW_WRITE_ROLES)
  async rejectAction(
    @Param('orgId') orgId: string,
    @Param('actionRunId') actionRunId: string,
    @Body() body: RejectWorkflowActionDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.service.rejectActionRun(orgId, actionRunId, req.user?.id, body.reason);
  }

  @Get(':id/runs')
  @Roles(...WORKFLOW_READ_ROLES)
  async listRuns(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listRuns(orgId, id, limit ? Number(limit) : 25);
  }

  @Get(':id')
  @Roles(...WORKFLOW_READ_ROLES)
  async get(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.findById(orgId, id);
  }

  @Post()
  @Roles(...WORKFLOW_WRITE_ROLES)
  async create(
    @Param('orgId') orgId: string,
    @Body() body: CreateWorkflowDto,
    @Req() req: { user?: { id?: string; name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.create(
      orgId,
      body,
      user.id,
      user.name || user.email || 'System',
    );
  }

  @Patch(':id')
  @Roles(...WORKFLOW_WRITE_ROLES)
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDto,
    @Req() req: { user?: { id?: string; name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.update(
      orgId,
      id,
      body,
      user.id,
      user.name || user.email || 'System',
    );
  }

  @Patch(':id/toggle')
  @Roles(...WORKFLOW_WRITE_ROLES)
  async toggle(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; name?: string; email?: string } },
  ) {
    const user = req.user || {};
    return this.service.toggleStatus(
      orgId,
      id,
      user.id,
      user.name || user.email || 'System',
    );
  }

  @Post(':id/duplicate')
  @Roles(...WORKFLOW_WRITE_ROLES)
  async duplicate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; name?: string; email?: string } },
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
  @Roles(...WORKFLOW_WRITE_ROLES)
  async test(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: TestWorkflowDto,
  ) {
    return this.service.testWorkflow(orgId, id, body);
  }

  @Delete(':id')
  @Roles(...WORKFLOW_WRITE_ROLES)
  async remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.remove(orgId, id);
  }
}
