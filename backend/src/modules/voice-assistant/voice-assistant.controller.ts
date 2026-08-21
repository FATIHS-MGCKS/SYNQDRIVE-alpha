import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { RequireVoiceAssistantPermission } from '@shared/decorators/require-voice-assistant-permission.decorator';
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
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class VoiceAssistantController {
  constructor(private readonly service: VoiceAssistantService) {}

  @Get()
  @RequireVoiceAssistantPermission('read')
  async get(@Param('orgId') orgId: string) {
    return this.service.getOrCreateAssistantForOrg(orgId);
  }

  @Patch()
  @RequireVoiceAssistantPermission('write')
  async update(@Param('orgId') orgId: string, @Body() body: UpdateVoiceAssistantDto) {
    return this.service.updateAssistant(orgId, body);
  }

  @Post('activate')
  @RequireVoiceAssistantPermission('write')
  async activate(@Param('orgId') orgId: string) {
    return this.service.activateAssistant(orgId);
  }

  @Post('deactivate')
  @RequireVoiceAssistantPermission('write')
  async deactivate(@Param('orgId') orgId: string) {
    return this.service.deactivateAssistant(orgId);
  }

  @Get('readiness')
  @RequireVoiceAssistantPermission('read')
  async readiness(@Param('orgId') orgId: string) {
    return this.service.getReadiness(orgId);
  }

  @Get('voices')
  @RequireVoiceAssistantPermission('read')
  async voices() {
    return this.service.listVoices();
  }

  @Post('test-session')
  @RequireVoiceAssistantPermission('write')
  async testSession(@Param('orgId') orgId: string) {
    return this.service.getTestSession(orgId);
  }

  @Get('conversations')
  @RequireCommunicationPermission('read', { voiceOperationalLegacy: true })
  async conversations(
    @Param('orgId') orgId: string,
    @Query() query: ListVoiceConversationsQueryDto,
  ) {
    return this.service.listConversations(orgId, query);
  }

  @Get('analytics')
  @RequireCommunicationPermission('read', { voiceOperationalLegacy: true })
  async analytics(@Param('orgId') orgId: string) {
    return this.service.getConversationAnalytics(orgId);
  }

  @Post('conversations/sync')
  @RequireCommunicationPermission('write', { voiceOperationalLegacy: true })
  async syncConversations(@Param('orgId') orgId: string) {
    return this.service.syncConversations(orgId);
  }

  @Get('phone-numbers')
  @RequireVoiceAssistantPermission('read')
  async phoneNumbers(@Param('orgId') orgId: string) {
    return this.service.listProviderPhoneNumbers(orgId);
  }

  @Post('phone-number/assign')
  @RequireVoiceAssistantPermission('manage')
  async assignPhoneNumber(
    @Param('orgId') orgId: string,
    @Body() body: AssignPhoneNumberDto,
  ) {
    return this.service.assignPhoneNumber(orgId, body.phoneNumberId, body.provider ?? 'elevenlabs');
  }

  @Post('phone-number/unassign')
  @RequireVoiceAssistantPermission('manage')
  async unassignPhoneNumber(@Param('orgId') orgId: string) {
    return this.service.unassignPhoneNumber(orgId);
  }

  @Post('telephony/refresh')
  @RequireVoiceAssistantPermission('manage')
  async refreshTelephony(@Param('orgId') orgId: string) {
    return this.service.refreshTelephonyStatus(orgId);
  }

  @Patch('telephony-settings')
  @RequireVoiceAssistantPermission('manage')
  async telephonySettings(
    @Param('orgId') orgId: string,
    @Body() body: UpdateTelephonySettingsDto,
  ) {
    return this.service.updateTelephonySettings(orgId, body);
  }

  @Get('calls/inbound-readiness')
  @RequireVoiceAssistantPermission('read')
  inboundCallReadiness(@Param('orgId') orgId: string) {
    return this.service.getInboundCallReadiness(orgId);
  }

  @Post('calls/outbound')
  @RequireCommunicationPermission('write', { voiceOperationalLegacy: true })
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
  @RequireVoiceAssistantPermission('manage')
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
