import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationAssignmentDto } from './dto/communication-write-request.dto';
import type { CommunicationMutationResponseDto } from './dto/communication-write-response.dto';
import { CommunicationWriteService } from './communication-write.service';

interface AuthUser {
  id: string;
}

@Controller('organizations/:orgId/communication')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationWriteController {
  constructor(private readonly writeService: CommunicationWriteService) {}

  @Post('conversations/:conversationId/claim')
  @RequireCommunicationPermission('write')
  claimConversation(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CommunicationMutationResponseDto> {
    return this.writeService.claimConversation(orgId, conversationId, this.actor(user));
  }

  @Patch('conversations/:conversationId/assignment')
  @RequireCommunicationPermission('write')
  updateAssignment(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CommunicationAssignmentDto,
  ): Promise<CommunicationMutationResponseDto> {
    return this.writeService.assignConversation(
      orgId,
      conversationId,
      body.assignedUserId ?? null,
      this.actor(user),
    );
  }

  @Post('conversations/:conversationId/resolve')
  @RequireCommunicationPermission('write')
  resolveConversation(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CommunicationMutationResponseDto> {
    return this.writeService.resolveConversation(orgId, conversationId, this.actor(user));
  }

  @Post('conversations/:conversationId/reopen')
  @RequireCommunicationPermission('write')
  reopenConversation(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CommunicationMutationResponseDto> {
    return this.writeService.reopenConversation(orgId, conversationId, this.actor(user));
  }

  @Post('conversations/:conversationId/mark-read')
  @RequireCommunicationPermission('write')
  markConversationRead(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CommunicationMutationResponseDto> {
    return this.writeService.markConversationRead(orgId, conversationId, this.actor(user));
  }

  private actor(user: AuthUser) {
    return {
      userId: String(user.id),
    };
  }
}
