import { Controller, Get, Post, Put, Param, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';
import { UpdateWhatsAppConfigDto } from './dto/update-whatsapp-config.dto';
import { ConnectWhatsAppDto } from './dto/connect-whatsapp.dto';
import { SimulateIncomingDto } from './dto/simulate-incoming.dto';
import { CreateWhatsAppTemplateDto } from './dto/create-whatsapp-template.dto';

@Controller('organizations/:orgId/whatsapp')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly templateService: WhatsAppTemplateService,
    private readonly reminders: WhatsAppBookingReminderService,
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
}
