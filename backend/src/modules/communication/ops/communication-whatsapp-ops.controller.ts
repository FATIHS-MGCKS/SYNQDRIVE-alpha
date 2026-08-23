import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { WHATSAPP_QUICK_ACTION_IDS } from '@modules/whatsapp/dto/whatsapp-quick-action.dto';
import type { WhatsAppQuickActionId } from '@modules/whatsapp/whatsapp-conversation-context.types';
import { WhatsAppQuickActionDto } from '@modules/whatsapp/dto/whatsapp-quick-action.dto';
import { BadRequestException } from '@nestjs/common';
import { CommunicationWhatsAppOpsService } from './communication-whatsapp-ops.service';

interface AuthUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

@Controller('organizations/:orgId/communication/conversations/:conversationId')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationWhatsAppOpsController {
  constructor(private readonly ops: CommunicationWhatsAppOpsService) {}

  @Get('composer-capability')
  @RequireCommunicationPermission('write')
  getComposerCapability(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.getComposerCapability(orgId, conversationId, this.actor(user));
  }

  @Post('ai-suggestion')
  @RequireCommunicationPermission('write')
  getAiSuggestion(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.getAiSuggestion(orgId, conversationId, this.actor(user));
  }

  @Get('quick-actions')
  @RequireCommunicationPermission('read')
  getQuickActions(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.getQuickActions(orgId, conversationId, String(user.id));
  }

  @Post('quick-actions/:actionId')
  @RequireCommunicationPermission('write')
  executeQuickAction(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Param('actionId') actionId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: WhatsAppQuickActionDto,
  ) {
    if (!WHATSAPP_QUICK_ACTION_IDS.includes(actionId as WhatsAppQuickActionId)) {
      throw new BadRequestException(`Unknown quick action: ${actionId}`);
    }
    return this.ops.executeQuickAction(
      orgId,
      conversationId,
      actionId as WhatsAppQuickActionId,
      this.actor(user),
      body as Record<string, unknown>,
    );
  }

  @Get('sendable-templates')
  @RequireCommunicationPermission('write')
  listSendableTemplates(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ops.listSendableTemplates(orgId, conversationId);
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
