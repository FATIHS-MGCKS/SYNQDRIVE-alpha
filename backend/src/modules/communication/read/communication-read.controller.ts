import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationReadService } from './communication-read.service';
import {
  CommunicationConversationListQueryDto,
  CommunicationEventListQueryDto,
} from './dto/communication-read-shared.dto';

@Controller('organizations/:orgId/communication')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationReadController {
  constructor(private readonly readService: CommunicationReadService) {}

  @Get('conversations/summary')
  @RequireCommunicationPermission('read')
  summarizeConversations(
    @Param('orgId') orgId: string,
    @Query() query: CommunicationConversationListQueryDto,
  ) {
    return this.readService.summarizeConversations(orgId, query);
  }

  @Get('conversations')
  @RequireCommunicationPermission('read')
  listConversations(
    @Param('orgId') orgId: string,
    @Query() query: CommunicationConversationListQueryDto,
  ) {
    return this.readService.listConversations(orgId, query);
  }

  @Get('conversations/:conversationId')
  @RequireCommunicationPermission('read')
  getConversation(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.readService.getConversation(orgId, conversationId);
  }

  @Get('conversations/:conversationId/events')
  @RequireCommunicationPermission('read')
  listConversationEvents(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: CommunicationEventListQueryDto,
  ) {
    return this.readService.listConversationEvents(orgId, conversationId, query);
  }
}
