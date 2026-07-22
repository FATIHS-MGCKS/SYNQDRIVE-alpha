import { Controller, Get, Post, Put, Param, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppConversationContextService } from './whatsapp-conversation-context.service';
import { WhatsAppQuickActionsService } from './whatsapp-quick-actions.service';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';
import { UpdateWhatsAppConfigDto } from './dto/update-whatsapp-config.dto';
import { ConnectWhatsAppDto } from './dto/connect-whatsapp.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { SimulateIncomingDto } from './dto/simulate-incoming.dto';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';
import { WhatsAppQuickActionDto, WHATSAPP_QUICK_ACTION_IDS } from './dto/whatsapp-quick-action.dto';
import type { WhatsAppQuickActionId } from './whatsapp-conversation-context.types';
@Controller('organizations/:orgId/whatsapp')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly templateService: WhatsAppTemplateService,
    private readonly contextService: WhatsAppConversationContextService,
    private readonly quickActions: WhatsAppQuickActionsService,
    private readonly reminders: WhatsAppBookingReminderService,
  ) {}

  @Get('config')
  @RequirePermission('ai-assistant', 'read')
  async getConfig(@Param('orgId') orgId: string) {
    return this.whatsAppService.getConfig(orgId);
  }

  @Put('config')
  @RequirePermission('ai-assistant', 'write')
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

  @Get('conversations')
  @RequirePermission('ai-assistant', 'read')
  async getConversations(@Param('orgId') orgId: string) {
    return this.whatsAppService.getConversations(orgId);
  }

  @Get('conversations/:conversationId/context')
  @RequirePermission('ai-assistant', 'read')
  async getConversationContext(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.contextService.getContext(orgId, conversationId);
  }

  @Post('conversations/:conversationId/actions/:actionId')
  @RequirePermission('ai-assistant', 'write')
  async executeQuickAction(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Param('actionId') actionId: string,
    @Body() body: WhatsAppQuickActionDto,
  ) {
    if (!WHATSAPP_QUICK_ACTION_IDS.includes(actionId as WhatsAppQuickActionId)) {
      throw new BadRequestException(`Unknown quick action: ${actionId}`);
    }
    return this.quickActions.execute(orgId, conversationId, actionId as WhatsAppQuickActionId, body);
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

  @Get('conversations/:conversationId/messages')
  @RequirePermission('ai-assistant', 'read')
  async getMessages(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.whatsAppService.getMessages(orgId, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermission('ai-assistant', 'write')
  async sendMessage(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: SendWhatsAppMessageDto,
  ) {
    if (!body.content?.trim()) {
      throw new BadRequestException('Message content is required');
    }
    return this.whatsAppService.sendMessage(orgId, conversationId, body.content.trim(), body.senderName);
  }

  @Post('conversations/:conversationId/ai-suggestion')
  @RequirePermission('ai-assistant', 'write')
  async getAiSuggestion(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.whatsAppService.getAiSuggestion(orgId, conversationId);
  }

  @Post('conversations/:conversationId/human-review')
  @RequirePermission('ai-assistant', 'write')
  async requestHumanReview(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: { reason?: string },
  ) {
    return this.whatsAppService.requestHumanReview(
      orgId,
      conversationId,
      body.reason ?? 'Manual human review requested from WhatsApp Operations Center',
    );
  }

  @Post('conversations/:conversationId/ai-reply')
  @RequirePermission('ai-assistant', 'write')
  async sendAiReply(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: SendWhatsAppMessageDto,
  ) {
    if (!body.content?.trim()) {
      throw new BadRequestException('Content is required');
    }
    return this.whatsAppService.sendAiReply(orgId, conversationId, body.content.trim(), body.suggestionId);
  }

  @Post('simulate-incoming')
  @RequirePermission('ai-assistant', 'write')
  async simulateIncoming(@Param('orgId') orgId: string, @Body() body: SimulateIncomingDto) {
    if (!body.contactPhone || !body.content) {
      throw new BadRequestException('contactPhone and content are required');
    }
    return this.whatsAppService.simulateIncoming(orgId, body);
  }

  @Get('stats')
  @RequirePermission('ai-assistant', 'read')
  async getStats(@Param('orgId') orgId: string) {
    return this.whatsAppService.getStats(orgId);
  }

  @Get('templates')
  @RequirePermission('ai-assistant', 'read')
  async listTemplates(@Param('orgId') orgId: string) {
    return this.templateService.listTemplates(orgId);
  }

  @Post('templates')
  @RequirePermission('ai-assistant', 'write')
  async createTemplate(@Param('orgId') orgId: string, @Body() body: CreateWhatsAppTemplateDto) {
    return this.templateService.createDraft(orgId, body);
  }
}
