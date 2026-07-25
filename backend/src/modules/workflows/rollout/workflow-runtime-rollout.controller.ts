import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkflowRuntimeRolloutStage } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import type { PermissionActor } from '@shared/auth/permission.util';
import { WorkflowRuntimeRolloutService } from './workflow-runtime-rollout.service';

const READ_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;
const WRITE_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;

@Controller('organizations/:orgId/workflows/runtime-rollout')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowRuntimeRolloutController {
  constructor(private readonly rollout: WorkflowRuntimeRolloutService) {}

  @Get('settings')
  @Roles(...READ_ROLES)
  getSettings(@Param('orgId') orgId: string) {
    return this.rollout.getOrgSettings(orgId);
  }

  @Patch('settings')
  @Roles(...WRITE_ROLES)
  updateSettings(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      stage?: WorkflowRuntimeRolloutStage;
      workflowAllowlist?: string[];
      channelEmailEnabled?: boolean;
      channelWhatsappEnabled?: boolean;
      channelSmsEnabled?: boolean;
      channelVoiceEnabled?: boolean;
      channelAiEnabled?: boolean;
      criticalActionsEnabled?: boolean;
      monitoringAcknowledged?: boolean;
    },
    @Req() req: { user?: PermissionActor },
  ) {
    return this.rollout.updateOrgSettings(orgId, body, {
      userId: req.user?.id,
      userName: undefined,
    });
  }

  @Get('flags')
  @Roles(...READ_ROLES)
  getFlags(@Param('orgId') orgId: string, @Query('workflowId') workflowId?: string) {
    return this.rollout.getEffectiveFlagsApi(orgId, workflowId);
  }

  @Get('gates')
  @Roles(...READ_ROLES)
  getGates(@Param('orgId') orgId: string) {
    return this.rollout.evaluatePreDeploymentGates(orgId);
  }

  @Post('stage-promotion')
  @Roles(...WRITE_ROLES)
  requestPromotion(
    @Param('orgId') orgId: string,
    @Body() body: { stage: WorkflowRuntimeRolloutStage; reason: string },
    @Req() req: { user?: PermissionActor },
  ) {
    return this.rollout.requestStagePromotion(orgId, body.stage, body.reason, {
      userId: req.user?.id,
    });
  }

  @Post('stage-promotion/:requestId/decide')
  @Roles(...WRITE_ROLES)
  decidePromotion(
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED' },
    @Req() req: { user?: PermissionActor },
  ) {
    return this.rollout.decideStagePromotion(orgId, requestId, body.decision, {
      userId: req.user?.id,
    });
  }

  @Patch('kill-switch')
  @Roles(...WRITE_ROLES)
  setKillSwitch(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      enabled: boolean;
      email?: boolean;
      whatsapp?: boolean;
      sms?: boolean;
      voice?: boolean;
      ai?: boolean;
      critical?: boolean;
    },
    @Req() req: { user?: PermissionActor },
  ) {
    return this.rollout.setKillSwitch(orgId, body, { userId: req.user?.id });
  }
}
