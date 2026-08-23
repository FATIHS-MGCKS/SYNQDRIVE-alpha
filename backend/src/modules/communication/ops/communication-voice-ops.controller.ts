import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationVoiceOpsService } from './communication-voice-ops.service';
import { CommunicationVoiceCreateTaskDto } from './dto/communication-voice-create-task.dto';

interface AuthUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
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

  @Post('voice-call/create-task')
  @RequireCommunicationPermission('read')
  createTaskFromCall(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CommunicationVoiceCreateTaskDto,
  ) {
    return this.ops.createTaskFromCall(orgId, conversationId, this.actor(user), body);
  }

  private actor(user: AuthUser) {
    const displayName =
      user.name?.trim()
      || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
      || null;
    return {
      userId: String(user.id),
      displayName,
    };
  }
}
