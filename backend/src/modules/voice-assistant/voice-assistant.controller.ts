import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req, Headers } from '@nestjs/common';
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
import { VoicePhoneOnboardingService } from './phone-onboarding/voice-phone-onboarding.service';
import { RunVoiceTestDto, RecordVoiceTestVerdictDto } from './test-center/dto/voice-test-center.dto';
import { VoiceTestCenterService } from './test-center/voice-test-center.service';
import { VoiceActivationSummaryService } from './activation/voice-activation-summary.service';
import {
  PurchasePhoneNumberDto,
  RecordForwardTestDto,
  RequestSipOnboardingDto,
  SearchPhoneNumbersDto,
  SelectPhoneOnboardingPathDto,
  UpdateForwardOnboardingDto,
  UpdatePortOnboardingDto,
} from './phone-onboarding/dto/voice-phone-onboarding.dto';

@Controller('organizations/:orgId/voice-assistant')
@UseGuards(OrgScopingGuard, RolesGuard)
export class VoiceAssistantController {
  constructor(
    private readonly service: VoiceAssistantService,
    private readonly workspaceService: VoiceWorkspaceService,
    private readonly phoneOnboarding: VoicePhoneOnboardingService,
    private readonly testCenter: VoiceTestCenterService,
    private readonly activationSummaryService: VoiceActivationSummaryService,
  ) {}

  @Get()
  async get(@Param('orgId') orgId: string) {
    return this.service.getOrCreateAssistantForOrg(orgId);
  }

  @Patch()
  async update(
    @Param('orgId') orgId: string,
    @Body() body: UpdateVoiceAssistantDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.service.updateAssistant(orgId, body, { actorUserId: req.user?.id });
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
    return this.workspaceService.getWorkspace(orgId);
  }

  @Patch('workspace/onboarding-step')
  async updateOnboardingStep(
    @Param('orgId') orgId: string,
    @Body() body: UpdateVoiceOnboardingStepDto,
  ) {
    return this.workspaceService.updateOnboardingStep(orgId, body);
  }

  @Get('voices')
  async voices() {
    return this.service.listVoices();
  }

  @Post('test-session')
  async testSession(@Param('orgId') orgId: string) {
    return this.service.getTestSession(orgId);
  }

  @Get('test-runs/summary')
  async testRunsSummary(@Param('orgId') orgId: string) {
    return this.testCenter.getSummary(orgId);
  }

  @Get('test-runs')
  async listTestRuns(@Param('orgId') orgId: string) {
    return this.testCenter.getSummary(orgId);
  }

  @Post('test-runs')
  async runTest(
    @Param('orgId') orgId: string,
    @Body() body: RunVoiceTestDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.testCenter.runScenario(orgId, body.scenarioId, body.mode ?? 'simulation', req.user?.id);
  }

  @Post('test-runs/:runId/verdict')
  async recordTestVerdict(
    @Param('orgId') orgId: string,
    @Param('runId') runId: string,
    @Body() body: RecordVoiceTestVerdictDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.testCenter.recordVerdict(
      orgId,
      runId,
      {
        verdict: body.verdict,
        reason: body.reason,
        operatorNotes: body.operatorNotes,
      },
      req.user?.id,
    );
  }

  @Get('activation-summary')
  async activationSummary(@Param('orgId') orgId: string) {
    return this.activationSummaryService.getSummary(orgId);
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

  @Get('phone-onboarding')
  async phoneOnboardingStatus(@Param('orgId') orgId: string) {
    return this.phoneOnboarding.getOnboarding(orgId);
  }

  @Post('phone-onboarding/path')
  async selectPhoneOnboardingPath(
    @Param('orgId') orgId: string,
    @Body() body: SelectPhoneOnboardingPathDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.phoneOnboarding.selectPath(orgId, body.path, req.user?.id);
  }

  @Post('phone-onboarding/search-numbers')
  async searchPhoneOnboardingNumbers(
    @Param('orgId') orgId: string,
    @Body() body: SearchPhoneNumbersDto,
  ) {
    return this.phoneOnboarding.searchNumbers(orgId, body);
  }

  @Post('phone-onboarding/purchase-preview')
  async previewPhoneOnboardingPurchase(
    @Param('orgId') orgId: string,
    @Body() body: PurchasePhoneNumberDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.phoneOnboarding.previewPurchase(orgId, body.selectionToken, req.user?.id);
  }

  @Post('phone-onboarding/purchase')
  async confirmPhoneOnboardingPurchase(
    @Param('orgId') orgId: string,
    @Body() body: PurchasePhoneNumberDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.phoneOnboarding.confirmPurchase(
      orgId,
      body.selectionToken,
      body.confirm,
      idempotencyKey ?? `purchase:${orgId}:${body.selectionToken}`,
      req.user?.id,
    );
  }

  @Patch('phone-onboarding/forward')
  async updatePhoneOnboardingForward(
    @Param('orgId') orgId: string,
    @Body() body: UpdateForwardOnboardingDto,
  ) {
    return this.phoneOnboarding.updateForward(orgId, body);
  }

  @Post('phone-onboarding/forward/test')
  async recordPhoneOnboardingForwardTest(
    @Param('orgId') orgId: string,
    @Body() body: RecordForwardTestDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.phoneOnboarding.recordForwardTest(orgId, body.result, req.user?.id);
  }

  @Patch('phone-onboarding/port')
  async updatePhoneOnboardingPort(
    @Param('orgId') orgId: string,
    @Body() body: UpdatePortOnboardingDto,
  ) {
    return this.phoneOnboarding.updatePort(orgId, body);
  }

  @Post('phone-onboarding/sip-request')
  async requestPhoneOnboardingSip(
    @Param('orgId') orgId: string,
    @Body() body: RequestSipOnboardingDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.phoneOnboarding.requestSip(orgId, body.contactEmail, req.user?.id);
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
