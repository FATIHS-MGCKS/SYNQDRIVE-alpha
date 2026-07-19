import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { DeviceConnectionWebhookReplayService } from './device-connection-webhook-processing.service';

@Controller('organizations/:orgId/fleet-connectivity/webhook-inbox')
@UseGuards(OrgScopingGuard, RolesGuard)
@Roles('ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN')
export class DeviceConnectionWebhookReplayController {
  constructor(private readonly replayService: DeviceConnectionWebhookReplayService) {}

  @Post(':inboxId/replay')
  @HttpCode(202)
  async replayInbox(
    @Param('orgId') orgId: string,
    @Param('inboxId') inboxId: string,
  ) {
    return this.replayService.replayForOrganization(orgId, inboxId);
  }
}
