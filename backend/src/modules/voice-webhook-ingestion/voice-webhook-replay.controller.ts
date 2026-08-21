import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireVoiceAssistantPermission } from '@shared/decorators/require-voice-assistant-permission.decorator';
import { VoiceWebhookReplayService } from './voice-webhook-processing.service';

@Controller('organizations/:orgId/voice-assistant/webhook-events')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class VoiceWebhookReplayController {
  constructor(private readonly replayService: VoiceWebhookReplayService) {}

  @Post(':eventId/replay')
  @HttpCode(202)
  @RequireVoiceAssistantPermission('manage')
  async replayEvent(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.replayService.replayForOrganization(orgId, eventId);
  }
}
