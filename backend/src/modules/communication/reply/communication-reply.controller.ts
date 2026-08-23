import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationReplyRequestDto } from './dto/communication-reply-request.dto';
import type { CommunicationReplyResponseDto } from './dto/communication-reply-response.dto';
import { CommunicationReplyService } from './communication-reply.service';

interface AuthUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

@Controller('organizations/:orgId/communication')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationReplyController {
  constructor(private readonly replyService: CommunicationReplyService) {}

  @Post('conversations/:conversationId/reply')
  @RequireCommunicationPermission('write')
  replyConversation(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CommunicationReplyRequestDto,
  ): Promise<CommunicationReplyResponseDto> {
    return this.replyService.replyConversation(orgId, conversationId, this.actor(user), {
      text: body.text,
      attachmentId: body.attachmentId,
      contentType: body.contentType,
      idempotencyKey: body.idempotencyKey,
    });
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
