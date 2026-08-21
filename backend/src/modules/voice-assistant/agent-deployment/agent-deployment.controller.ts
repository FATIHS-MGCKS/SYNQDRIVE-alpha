import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireVoiceAssistantPermission } from '@shared/decorators/require-voice-assistant-permission.decorator';
import { AgentDeploymentService } from './agent-deployment.service';
import {
  DeployAgentDeploymentDto,
  RollbackAgentDeploymentDto,
  SaveAgentDeploymentDraftDto,
} from './dto/agent-deployment.dto';

@Controller('organizations/:orgId/voice-assistant/agent-deployment')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class AgentDeploymentController {
  constructor(private readonly deployments: AgentDeploymentService) {}

  @Get('draft')
  @RequireVoiceAssistantPermission('read')
  async getDraft(@Param('orgId') orgId: string) {
    return this.deployments.getDraft(orgId);
  }

  @Patch('draft')
  @RequireVoiceAssistantPermission('write')
  async saveDraft(
    @Param('orgId') orgId: string,
    @Body() body: SaveAgentDeploymentDraftDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.deployments.saveDraft(orgId, body, { userId: req.user?.id });
  }

  @Get('readiness')
  @RequireVoiceAssistantPermission('read')
  async getReadiness(@Param('orgId') orgId: string) {
    return this.deployments.getReadiness(orgId);
  }

  @Get('diff')
  @RequireVoiceAssistantPermission('read')
  async getDiff(@Param('orgId') orgId: string) {
    return this.deployments.getDiff(orgId);
  }

  @Post('deploy')
  @RequireVoiceAssistantPermission('manage')
  async deploy(
    @Param('orgId') orgId: string,
    @Body() body: DeployAgentDeploymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.deployments.deploy(orgId, {
      userId: req.user?.id,
      idempotencyKey,
      confirm: body.confirm,
    });
  }

  @Post('rollback')
  @RequireVoiceAssistantPermission('manage')
  async rollback(
    @Param('orgId') orgId: string,
    @Body() body: RollbackAgentDeploymentDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.deployments.rollback(orgId, {
      userId: req.user?.id,
      confirm: body.confirm,
    });
  }
}
