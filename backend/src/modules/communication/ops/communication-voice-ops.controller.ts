import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationVoiceOpsService } from './communication-voice-ops.service';

interface AuthUser {
  id: string;
}

@Controller('organizations/:orgId/communication/conversations/:conversationId')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationVoiceOpsController {
  constructor(private readonly ops: CommunicationVoiceOpsService) {}

  @Get('voice-call')
  @RequireCommunicationPermission('read')
  getVoiceCallDetail(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.getVoiceCallDetail(orgId, conversationId, String(user.id));
  }

  @Get('voice-call/transcript')
  @RequireCommunicationPermission('read')
  getVoiceCallTranscript(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.getVoiceCallTranscript(orgId, conversationId, String(user.id));
  }
}
