import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { VoiceAssistantService } from './voice-assistant.service';
import {
  UpdateVoiceAssistantDto,
  ListVoiceConversationsQueryDto,
  AssignPhoneNumberDto,
  UpdateTelephonySettingsDto,
  InitiateTwilioOutboundCallDto,
  InitiateOutboundCallDto,
} from './dto';
import { UpdateVoiceOnboardingStepDto } from './workspace/dto/update-voice-onboarding-step.dto';
import { VoiceWorkspaceService } from './workspace/voice-workspace.service';

@Controller('organizations/:orgId/voice-assistant')
@UseGuards(OrgScopingGuard, RolesGuard)
export class VoiceAssistantController {
  constructor(
    private readonly service: VoiceAssistantService,
    private readonly workspace: VoiceWorkspaceService,
  ) {}

  @Get()
  async get(@Param('orgId') orgId: string) {
    return this.service.getOrCreateAssistantForOrg(orgId);
  }

  @Patch()
  async update(@Param('orgId') orgId: string, @Body() body: UpdateVoiceAssistantDto) {
    return this.service.updateAssistant(orgId, body);
  }

  @Post('activate')
  async activate(@Param('orgId') orgId: string) {
    return this.service.activateAssistant(orgId);
  }

  @Post('deactivate')
  async deactivate(@Param('orgId') orgId: string) {
    return this.service.deactivateAssistant(orgId);
  }

  @Get('readiness')
  async readiness(@Param('orgId') orgId: string) {
    return this.service.getReadiness(orgId);
  }

  @Get('workspace')
  async workspace(@Param('orgId') orgId: string) {
    return this.workspace.getWorkspace(orgId);
  }

  @Patch('workspace/onboarding-step')
  async updateOnboardingStep(
    @Param('orgId') orgId: string,
    @Body() body: UpdateVoiceOnboardingStepDto,
  ) {
    return this.workspace.updateOnboardingStep(orgId, body);
  }

  @Get('voices')
  async voices() {
    return this.service.listVoices();
  }

  @Post('test-session')
  async testSession(@Param('orgId') orgId: string) {
    return this.service.getTestSession(orgId);
  }

  @Get('conversations')
  async conversations(
    @Param('orgId') orgId: string,
    @Query() query: ListVoiceConversationsQueryDto,
  ) {
    return this.service.listConversations(orgId, query);
  }

  @Get('analytics')
  async analytics(@Param('orgId') orgId: string) {
    return this.service.getConversationAnalytics(orgId);
  }

  @Post('conversations/sync')
  async syncConversations(@Param('orgId') orgId: string) {
    return this.service.syncConversations(orgId);
  }

  @Get('phone-numbers')
  async phoneNumbers(@Param('orgId') orgId: string) {
    return this.service.listProviderPhoneNumbers(orgId);
  }

  @Post('phone-number/assign')
  async assignPhoneNumber(
    @Param('orgId') orgId: string,
    @Body() body: AssignPhoneNumberDto,
  ) {
    return this.service.assignPhoneNumber(orgId, body.phoneNumberId, body.provider ?? 'elevenlabs');
  }

  @Post('phone-number/unassign')
  async unassignPhoneNumber(@Param('orgId') orgId: string) {
    return this.service.unassignPhoneNumber(orgId);
  }

  @Post('telephony/refresh')
  async refreshTelephony(@Param('orgId') orgId: string) {
    return this.service.refreshTelephonyStatus(orgId);
  }

  @Patch('telephony-settings')
  async telephonySettings(
    @Param('orgId') orgId: string,
    @Body() body: UpdateTelephonySettingsDto,
  ) {
    return this.service.updateTelephonySettings(orgId, body);
  }

  @Get('calls/inbound-readiness')
  inboundCallReadiness(@Param('orgId') orgId: string) {
    return this.service.getInboundCallReadiness(orgId);
  }

  @Post('calls/outbound')
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
