import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';
import { WhatsAppLegacyHttpCompatibilityService } from './whatsapp-legacy-http-compatibility.service';
import { UpdateWhatsAppConfigDto } from './dto/update-whatsapp-config.dto';
import { ConnectWhatsAppDto } from './dto/connect-whatsapp.dto';
import { SimulateIncomingDto } from './dto/simulate-incoming.dto';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsAppQuickActionDto, WHATSAPP_QUICK_ACTION_IDS } from './dto/whatsapp-quick-action.dto';
import type { WhatsAppQuickActionId } from './whatsapp-conversation-context.types';

interface AuthUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

@Controller('organizations/:orgId/whatsapp')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly templateService: WhatsAppTemplateService,
    private readonly reminders: WhatsAppBookingReminderService,
    private readonly legacyHttp: WhatsAppLegacyHttpCompatibilityService,
  ) {}

  @Get('config')
  @RequireCommunicationPermission('read')
  async getConfig(@Param('orgId') orgId: string) {
    return this.whatsAppService.getConfig(orgId);
  }

  @Put('config')
  @RequireCommunicationPermission('manage')
  async updateConfig(@Param('orgId') orgId: string, @Body() body: UpdateWhatsAppConfigDto) {
    return this.whatsAppService.updateConfig(orgId, body);
  }

  @Post('connect')
  @RequirePermission('data-authorization', 'manage')
  async connect(@Param('orgId') orgId: string, @Body() body: ConnectWhatsAppDto) {
    return this.whatsAppService.connect(orgId, body);
  }

  @Post('disconnect')
  @RequirePermission('data-authorization', 'manage')
  async disconnect(@Param('orgId') orgId: string) {
    return this.whatsAppService.disconnect(orgId);
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `GET /organizations/:orgId/communication/conversations?channel=whatsapp`.
   * Retained for C13.6 route telemetry; not canonical authority.
   */
  @Get('conversations')
  @RequireCommunicationPermission('read')
  async getConversations(@Param('orgId') orgId: string) {
    return this.legacyHttp.getConversations(orgId);
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `GET /organizations/:orgId/communication/conversations/:id/events`.
   */
  @Get('conversations/:conversationId/context')
  @RequireCommunicationPermission('read')
  async getConversationContext(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.legacyHttp.getConversationContext(orgId, conversationId);
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `POST /organizations/:orgId/communication/conversations/:id/quick-actions/:actionId`.
   */
  @Post('conversations/:conversationId/actions/:actionId')
  @RequireCommunicationPermission('write')
  async executeQuickAction(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Param('actionId') actionId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: WhatsAppQuickActionDto,
  ) {
    if (!WHATSAPP_QUICK_ACTION_IDS.includes(actionId as WhatsAppQuickActionId)) {
      throw new BadRequestException(`Unknown quick action: ${actionId}`);
    }
    return this.legacyHttp.executeQuickAction(
      orgId,
      conversationId,
      actionId as WhatsAppQuickActionId,
      this.actor(user),
      body as Record<string, unknown>,
    );
  }

  @Post('reminders/bookings/:bookingId/confirmation')
  @RequirePermission('bookings', 'write')
  async sendBookingConfirmation(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendBookingConfirmationWhatsApp(orgId, bookingId);
  }

  @Post('reminders/bookings/:bookingId/pickup')
  @RequirePermission('bookings', 'write')
  async sendPickupReminder(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendPickupReminderWhatsApp(orgId, bookingId);
  }

  @Post('reminders/bookings/:bookingId/return')
  @RequirePermission('bookings', 'write')
  async sendReturnReminder(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendReturnReminderWhatsApp(orgId, bookingId);
  }

  @Post('reminders/bookings/:bookingId/missing-documents')
  @RequirePermission('bookings', 'write')
  async sendMissingDocumentsReminder(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendMissingDocumentsReminderWhatsApp(orgId, bookingId);
  }

  @Post('reminders/bookings/:bookingId/handover-link')
  @RequirePermission('bookings', 'write')
  async sendHandoverLinkReminder(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendHandoverLinkWhatsApp(orgId, bookingId);
  }

  @Post('reminders/bookings/:bookingId/return-link')
  @RequirePermission('bookings', 'write')
  async sendReturnLinkReminder(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendReturnLinkWhatsApp(orgId, bookingId);
  }

  @Post('reminders/bookings/:bookingId/payment-deposit')
  @RequirePermission('bookings', 'write')
  async sendPaymentDepositReminder(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.reminders.sendPaymentDepositReminderWhatsApp(orgId, bookingId);
  }

  @Post('reminders/damages/:damageId/followup')
  @RequirePermission('fleet-condition', 'write')
  async sendDamageFollowup(@Param('orgId') orgId: string, @Param('damageId') damageId: string) {
    return this.reminders.sendDamageFollowupWhatsApp(orgId, damageId);
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `GET /organizations/:orgId/communication/conversations/:id/events`.
   */
  @Get('conversations/:conversationId/messages')
  @RequireCommunicationPermission('read')
  async getMessages(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.legacyHttp.getMessages(orgId, conversationId);
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `POST /organizations/:orgId/communication/conversations/:id/reply` (ReplyCommand).
   * Adapter delegates to canonical Communication reply authority with derived idempotency key.
   */
  @Post('conversations/:conversationId/messages')
  @RequireCommunicationPermission('write')
  async sendMessage(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: SendWhatsAppMessageDto,
  ) {
    if (!body.content?.trim()) {
      throw new BadRequestException('Message content is required');
    }
    return this.legacyHttp.sendMessage(
      orgId,
      conversationId,
      body.content.trim(),
      this.actor(user),
      body.senderName,
    );
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `POST /organizations/:orgId/communication/conversations/:id/ai-suggestion`.
   */
  @Post('conversations/:conversationId/ai-suggestion')
  @RequireCommunicationPermission('write')
  async getAiSuggestion(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.legacyHttp.getAiSuggestion(orgId, conversationId, this.actor(user));
  }

  /**
   * @deprecated DEPRECATED_COMPATIBILITY_HTTP — use
   * `POST /organizations/:orgId/communication/conversations/:id/quick-actions/human_review`.
   */
  @Post('conversations/:conversationId/human-review')
  @RequireCommunicationPermission('write')
  async requestHumanReview(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { reason?: string },
  ) {
    return this.legacyHttp.requestHumanReview(
      orgId,
      conversationId,
      this.actor(user),
      body.reason ?? 'Manual human review requested from WhatsApp Operations Center',
    );
  }

  @Post('simulate-incoming')
  @RequireCommunicationPermission('write')
  async simulateIncoming(@Param('orgId') orgId: string, @Body() body: SimulateIncomingDto) {
    if (!body.contactPhone || !body.content) {
      throw new BadRequestException('contactPhone and content are required');
    }
    return this.whatsAppService.simulateIncoming(orgId, body);
  }

  @Get('stats')
  @RequireCommunicationPermission('read')
  async getStats(@Param('orgId') orgId: string) {
    return this.whatsAppService.getStats(orgId);
  }

  @Get('templates')
  @RequireCommunicationPermission('read')
  async listTemplates(@Param('orgId') orgId: string) {
    return this.templateService.listTemplates(orgId);
  }

  @Post('templates')
  @RequireCommunicationPermission('manage')
  async createTemplate(@Param('orgId') orgId: string, @Body() body: CreateWhatsAppTemplateDto) {
    return this.templateService.createDraft(orgId, body);
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
