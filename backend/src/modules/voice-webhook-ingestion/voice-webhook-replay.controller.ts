import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { VoiceWebhookReplayService } from './voice-webhook-processing.service';

@Controller('organizations/:orgId/voice-assistant/webhook-events')
@UseGuards(OrgScopingGuard, RolesGuard)
@Roles('ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN')
export class VoiceWebhookReplayController {
  constructor(private readonly replayService: VoiceWebhookReplayService) {}

  @Post(':eventId/replay')
  @HttpCode(202)
  async replayEvent(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.replayService.replayForOrganization(orgId, eventId);
  }
}
