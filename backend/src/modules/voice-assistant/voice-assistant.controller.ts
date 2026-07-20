import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireVoiceEntitlement } from '@modules/voice-entitlement/require-voice-entitlement.decorator';
import { VoiceEntitlementGuard } from '@modules/voice-entitlement/voice-entitlement.guard';
import { VoiceAssistantService } from './voice-assistant.service';
import {
  UpdateVoiceAssistantDto,
  ListVoiceConversationsQueryDto,
  AssignPhoneNumberDto,
  UpdateTelephonySettingsDto,
  InitiateTwilioOutboundCallDto,
  InitiateOutboundCallDto,
} from './dto';

@Controller('organizations/:orgId/voice-assistant')
@UseGuards(OrgScopingGuard, RolesGuard, VoiceEntitlementGuard)
export class VoiceAssistantController {
  constructor(private readonly service: VoiceAssistantService) {}

  @Get()
  @RequireVoiceEntitlement('assistant.config.read')
  async get(@Param('orgId') orgId: string) {
    return this.service.getOrCreateAssistantForOrg(orgId);
  }

  @Patch()
  @RequireVoiceEntitlement('assistant.config.write')
  async update(@Param('orgId') orgId: string, @Body() body: UpdateVoiceAssistantDto) {
    return this.service.updateAssistant(orgId, body);
  }

  @Post('activate')
  @RequireVoiceEntitlement('assistant.activate')
  async activate(@Param('orgId') orgId: string) {
    return this.service.activateAssistant(orgId);
  }

  @Post('deactivate')
  @RequireVoiceEntitlement('assistant.config.write')
  async deactivate(@Param('orgId') orgId: string) {
    return this.service.deactivateAssistant(orgId);
  }

  @Get('readiness')
  @RequireVoiceEntitlement('assistant.config.read')
  async readiness(@Param('orgId') orgId: string) {
    return this.service.getReadiness(orgId);
  }

  @Get('voices')
  @RequireVoiceEntitlement('assistant.config.read')
  async voices() {
    return this.service.listVoices();
  }

  @Post('test-session')
  @RequireVoiceEntitlement('test.center')
  async testSession(@Param('orgId') orgId: string) {
    return this.service.getTestSession(orgId);
  }

  @Get('conversations')
  @RequireVoiceEntitlement('history.read')
  async conversations(
    @Param('orgId') orgId: string,
    @Query() query: ListVoiceConversationsQueryDto,
  ) {
    return this.service.listConversations(orgId, query);
  }

  @Get('analytics')
  @RequireVoiceEntitlement('history.read')
  async analytics(@Param('orgId') orgId: string) {
    return this.service.getConversationAnalytics(orgId);
  }

  @Post('conversations/sync')
  @RequireVoiceEntitlement('history.read')
  async syncConversations(@Param('orgId') orgId: string) {
    return this.service.syncConversations(orgId);
  }

  @Get('phone-numbers')
  @RequireVoiceEntitlement('telephony.number.manage')
  async phoneNumbers(@Param('orgId') orgId: string) {
    return this.service.listProviderPhoneNumbers(orgId);
  }

  @Post('phone-number/assign')
  @RequireVoiceEntitlement('telephony.number.manage')
  async assignPhoneNumber(
    @Param('orgId') orgId: string,
    @Body() body: AssignPhoneNumberDto,
  ) {
    return this.service.assignPhoneNumber(orgId, body.phoneNumberId, body.provider ?? 'elevenlabs');
  }

  @Post('phone-number/unassign')
  @RequireVoiceEntitlement('telephony.number.manage')
  async unassignPhoneNumber(@Param('orgId') orgId: string) {
    return this.service.unassignPhoneNumber(orgId);
  }

  @Post('telephony/refresh')
  @RequireVoiceEntitlement('telephony.number.manage')
  async refreshTelephony(@Param('orgId') orgId: string) {
    return this.service.refreshTelephonyStatus(orgId);
  }

  @Patch('telephony-settings')
  @RequireVoiceEntitlement('telephony.settings.write')
  async telephonySettings(
    @Param('orgId') orgId: string,
    @Body() body: UpdateTelephonySettingsDto,
  ) {
    return this.service.updateTelephonySettings(orgId, body);
  }

  @Get('calls/inbound-readiness')
  @RequireVoiceEntitlement('calls.inbound')
  inboundCallReadiness(@Param('orgId') orgId: string) {
    return this.service.getInboundCallReadiness(orgId);
  }

  @Post('calls/outbound')
  @RequireVoiceEntitlement('calls.outbound')
  async outboundCall(
    @Param('orgId') orgId: string,
    @Body() body: InitiateOutboundCallDto,
    @Req() request: { user?: { id?: string } },
  ) {
    return this.service.initiateOutboundCall(
      orgId,
      {
        to: body.to,
        idempotencyKey: body.idempotencyKey,
        customerId: body.customerId,
        bookingId: body.bookingId,
      },
      request.user?.id,
    );
  }

  @Post('twilio/outbound-call')
  @Roles('ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN')
  @RequireVoiceEntitlement('calls.outbound')
  async twilioOutboundCall(
    @Param('orgId') orgId: string,
    @Body() body: InitiateTwilioOutboundCallDto,
    @Req() request: { user?: { id?: string } },
  ) {
    return this.service.initiateTwilioOutboundCall(orgId, body.to, request.user?.id);
  }
}

@Controller('admin/voice-assistant')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VoiceAssistantAdminController {
  constructor(private readonly service: VoiceAssistantService) {}

  @Get('overview')
  async overview() {
    return this.service.getAdminOverview();
  }

  @Get('organizations/:orgId')
  async orgDetail(@Param('orgId') orgId: string) {
    return this.service.getAdminOrgDetail(orgId);
  }

  @Post('organizations/:orgId/sync')
  async syncOrganization(@Param('orgId') orgId: string) {
    return this.service.adminSyncOrganization(orgId);
  }
}
