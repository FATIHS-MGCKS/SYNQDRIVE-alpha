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
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { AgentDeploymentService } from './agent-deployment.service';
import {
  DeployAgentDeploymentDto,
  RollbackAgentDeploymentDto,
  SaveAgentDeploymentDraftDto,
} from './dto/agent-deployment.dto';

@Controller('organizations/:orgId/voice-assistant/agent-deployment')
@UseGuards(OrgScopingGuard, RolesGuard)
@Roles('ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN')
export class AgentDeploymentController {
  constructor(private readonly deployments: AgentDeploymentService) {}

  @Get('draft')
  async getDraft(@Param('orgId') orgId: string) {
    return this.deployments.getDraft(orgId);
  }

  @Patch('draft')
  async saveDraft(
    @Param('orgId') orgId: string,
    @Body() body: SaveAgentDeploymentDraftDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.deployments.saveDraft(orgId, body, { userId: req.user?.id });
  }

  @Get('diff')
  async getDiff(@Param('orgId') orgId: string) {
    return this.deployments.getDiff(orgId);
  }

  @Post('deploy')
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
