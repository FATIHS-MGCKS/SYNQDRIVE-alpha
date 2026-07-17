import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  VoiceAssistant,
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoicePstnProvider,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TwilioTelephonyService } from '@modules/twilio/twilio-telephony.service';
import { TwilioControlPlaneTelephonyService } from '@modules/twilio/twilio-control-plane.telephony.service';
import { ElevenLabsService } from './elevenlabs.service';
import {
  UpdateVoiceAssistantDto,
  ListVoiceConversationsQueryDto,
  UpdateTelephonySettingsDto,
} from './dto';
import {
  buildPermissionsPromptSection,
  buildToolPolicyForAssistant,
  resolveToolPermissions,
  syncLegacyBooleansFromToolPermissions,
  validateToolPermissionsUpdate,
} from './voice-assistant-permissions';
import {
  buildAdminWarnings,
  readinessPercent,
  resolveProviderWarning,
  startOfToday,
} from './voice-assistant-admin.util';
import {
  buildConversationWhere,
  extractConversationLinks,
  hasConversationTranscript,
  isConversationEscalated,
  maskCallerNumber,
  minimalConversationMetadata,
} from './voice-conversation.util';
import {
  buildElevenLabsConversationMetadata,
  buildLegacyTwimlMetadata,
  isAnalyticsAnsweredConversation,
  isAnalyticsMissedConversation,
  resolveElevenLabsSyncOutcome,
  withCountersApplied,
} from './voice-conversation-lifecycle.util';
import {
  evaluateConfiguredProviderHealth,
  readinessCheckOkFromHealth,
  type ProviderVerificationLevel,
} from './voice-provider-health.util';
import {
  computeTelephonyStatus,
  hasPhoneNumberAssigned,
  isPstnProviderConfigured,
  isTelephonyLiveModeRequested,
  mapProviderPhoneNumbers,
  mapTwilioProviderPhoneNumbers,
  type ProviderPhoneNumberView,
  type TelephonyProviderConfig,
} from './voice-assistant-telephony.util';
import {
  buildTestSessionWarnings,
  isTestSessionBlocked,
  type VoiceTestSessionResponse,
} from './voice-assistant-test.util';
import { VoiceCallOrchestrationService } from '@modules/voice-call-orchestration/voice-call-orchestration.service';
import {
  isLegacyDiagnosticCallsEnabled,
  isVoiceNativeTwilioIntegrationEnabled,
} from '@modules/voice-call-orchestration/voice-feature-flags.config';

export { buildToolPolicyForAssistant } from './voice-assistant-permissions';
export type { VoiceToolPolicy, VoiceToolPermissionsMap } from './voice-assistant-permissions';

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  verification?: ProviderVerificationLevel;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
  missing: string[];
}

@Injectable()
export class VoiceAssistantService {
  private readonly logger = new Logger(VoiceAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elevenLabs: ElevenLabsService,
    private readonly twilioTelephony: TwilioTelephonyService,
    private readonly twilioControlPlaneTelephony: TwilioControlPlaneTelephonyService,
    private readonly callOrchestration: VoiceCallOrchestrationService,
  ) {}

  async getOrCreateAssistantForOrg(organizationId: string) {
    const existing = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (existing) return await this.formatAssistant(existing);

    const created = await this.prisma.voiceAssistant.create({
      data: {
        organizationId,
        connectionStatus: await this.deriveConnectionStatus(organizationId),
      },
    });
    return await this.formatAssistant(created);
  }

  async getAssistantForOrg(organizationId: string) {
    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    return assistant ? await this.formatAssistant(assistant) : null;
  }

  async updateAssistant(organizationId: string, dto: UpdateVoiceAssistantDto) {
    const assistant = await this.requireAssistantRow(organizationId);
    const data = this.mapUpdateDto(dto, assistant);

    const updated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data,
    });
    return await this.formatAssistant(updated);
  }

  async activateAssistant(organizationId: string) {
    const assistant = await this.requireAssistantRow(organizationId);
    const readiness = await this.computeReadiness(assistant, { forActivation: true });

    if (!readiness.ready) {
      throw new BadRequestException({
        message: 'Voice assistant is not ready for activation',
        missing: readiness.missing,
        checks: readiness.checks.filter((c) => c.required && !c.ok),
      });
    }

    const prompt = this.buildFullPrompt(assistant);
    let agentId = assistant.elevenLabsAgentId;

    try {
      const result = await this.elevenLabs.createOrUpdateAgent(agentId, {
        name: assistant.name,
        systemPrompt: prompt,
        greetingMessage: assistant.greetingMessage ?? undefined,
        voiceId: assistant.voiceId ?? undefined,
        language: assistant.language,
      });
      agentId = result.agentId;

      if (assistant.telephonyEnabled && assistant.inboundEnabled && assistant.elevenLabsPhoneNumberId) {
        await this.elevenLabs.assignPhoneNumberToAgent(agentId, assistant.elevenLabsPhoneNumberId);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Activation failed for org ${organizationId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw err;
    }

    const activated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        status: VoiceAssistantStatus.ACTIVE,
        elevenLabsAgentId: agentId,
        connectionStatus: await this.deriveConnectionStatus(organizationId, {
          ...assistant,
          elevenLabsAgentId: agentId,
          status: VoiceAssistantStatus.ACTIVE,
        }),
        lastProvisionedAt: new Date(),
        activatedAt: new Date(),
        deactivatedAt: null,
      },
    });

    return await this.formatAssistant(activated);
  }

  async deactivateAssistant(organizationId: string) {
    const assistant = await this.requireAssistantRow(organizationId);
    const deactivated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        status: VoiceAssistantStatus.INACTIVE,
        deactivatedAt: new Date(),
      },
    });
    return await this.formatAssistant(deactivated);
  }

  async getTestSession(organizationId: string): Promise<VoiceTestSessionResponse> {
    const assistant = await this.requireAssistantRow(organizationId);
    const readiness = await this.computeReadiness(assistant, { forActivation: false });
    const warnings = buildTestSessionWarnings(assistant);

    if (!this.elevenLabs.isConfigured()) {
      throw new ServiceUnavailableException(
        'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
      );
    }

    if (!assistant.elevenLabsAgentId) {
      throw new BadRequestException({
        message: 'Agent not provisioned yet. Activate the assistant first.',
        warnings,
        readinessSummary: { ready: readiness.ready, missing: readiness.missing },
      });
    }

    const readinessSummary = {
      ready: readiness.ready,
      missing: readiness.missing,
    };

    if (isTestSessionBlocked(assistant)) {
      return {
        agentId: assistant.elevenLabsAgentId,
        provider: assistant.provider,
        status: 'blocked',
        instructions:
          'Complete voice and system prompt in Configuration before starting a live test session.',
        expiresAt: null,
        warnings,
        readinessSummary,
        developerDetails: null,
      };
    }

    const { expiresAt } = await this.elevenLabs.getSignedTestUrl(
      assistant.elevenLabsAgentId,
    );

    const fallbackExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return {
      agentId: assistant.elevenLabsAgentId,
      provider: assistant.provider,
      status: 'ready',
      instructions:
        'Start the test session and speak through your selected scenario. Live transcript integration is coming soon — use this session to validate tone, greeting, and escalation behavior.',
      expiresAt: expiresAt ?? fallbackExpiry,
      warnings,
      readinessSummary,
      developerDetails: null,
    };
  }

  async listVoices() {
    return this.elevenLabs.listVoices();
  }

  async listConversations(organizationId: string, query: ListVoiceConversationsQueryDto = {}) {
    const limit = query.limit ?? 50;
    const offset =
      query.page != null ? (query.page - 1) * limit : (query.offset ?? 0);
    const where = buildConversationWhere(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.voiceConversation.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.voiceConversation.count({ where }),
    ]);

    return {
      items: items.map((c) => this.formatConversation(c)),
      total,
      limit,
      offset,
      page: query.page ?? Math.floor(offset / limit) + 1,
    };
  }

  async getConversationAnalytics(organizationId: string) {
    const conversations = await this.prisma.voiceConversation.findMany({
      where: { organizationId },
      select: {
        outcome: true,
        status: true,
        durationSeconds: true,
        escalationReason: true,
        metadata: true,
        transcript: true,
      },
    });

    const totalCalls = conversations.length;
    const answeredCalls = conversations.filter((c) =>
      isAnalyticsAnsweredConversation(c),
    ).length;
    const missedCalls = conversations.filter((c) => isAnalyticsMissedConversation(c)).length;
    const escalatedCalls = conversations.filter((c) => isConversationEscalated(c)).length;

    const durations = conversations
      .filter((c) => isAnalyticsAnsweredConversation(c))
      .map((c) => c.durationSeconds)
      .filter((d): d is number => d != null && d > 0);
    const totalTalkTimeSeconds = durations.reduce((sum, d) => sum + d, 0);
    const avgDurationSeconds =
      durations.length > 0 ? Math.round(totalTalkTimeSeconds / durations.length) : 0;
    const escalationRate =
      totalCalls > 0 ? Math.round((escalatedCalls / totalCalls) * 1000) / 1000 : 0;

    const callsByOutcome: Record<string, number> = {};
    for (const outcome of Object.values(VoiceConversationOutcome)) {
      callsByOutcome[outcome] = conversations.filter((c) => c.outcome === outcome).length;
    }

    const reasonCounts = new Map<string, number>();
    for (const conv of conversations) {
      const reason = conv.escalationReason?.trim();
      if (!reason || !isConversationEscalated(conv)) continue;
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    const topEscalationReasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    const hasEscalationInsightData = escalatedCalls >= 3 && topEscalationReasons.length > 0;
    const topEscalationInsight = hasEscalationInsightData
      ? `Most conversations are escalated because of “${topEscalationReasons[0].reason}”.`
      : null;

    return {
      totalCalls,
      answeredCalls,
      missedCalls,
      escalatedCalls,
      escalationRate,
      avgDurationSeconds,
      totalTalkTimeSeconds,
      totalTalkMinutes: Math.round((totalTalkTimeSeconds / 60) * 10) / 10,
      callsByOutcome,
      topEscalationReasons,
      knowledgeGaps: {
        available: false,
        message:
          'Knowledge gap detection requires labeled training data — not enough structured call outcomes yet.',
      },
      insights: {
        hasEnoughData: hasEscalationInsightData,
        topEscalationInsight,
      },
    };
  }

  async syncConversations(organizationId: string) {
    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not found for organization');
    }
    if (!assistant.elevenLabsAgentId) {
      return { synced: 0, message: 'No ElevenLabs agent provisioned' };
    }

    let remote;
    try {
      remote = await this.elevenLabs.listConversations(assistant.elevenLabsAgentId);
    } catch (err: unknown) {
      this.logger.error(
        `Conversation sync failed for org ${organizationId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw err;
    }

    let synced = 0;
    for (const conv of remote) {
      const providerId = conv.conversation_id;
      const exists = await this.prisma.voiceConversation.findFirst({
        where: {
          organizationId,
          OR: [
            { providerConversationId: providerId },
            { elevenLabsConvId: providerId },
          ],
        },
      });
      if (exists) continue;

      const detail = await this.elevenLabs.getConversation(providerId);
      const durationSeconds =
        conv.end_time_unix_secs && conv.start_time_unix_secs
          ? conv.end_time_unix_secs - conv.start_time_unix_secs
          : null;

      const transcriptSource = detail?.transcript ?? conv.transcript;
      const transcript =
        typeof transcriptSource === 'string'
          ? transcriptSource
          : JSON.stringify(transcriptSource ?? '');

      const outcome = resolveElevenLabsSyncOutcome({
        remoteStatus: conv.status,
        transcript,
      });
      const metadata = buildElevenLabsConversationMetadata(
        detail?.metadata && typeof detail.metadata === 'object'
          ? (detail.metadata as Record<string, unknown>)
          : undefined,
      );
      const shouldIncrementCounters =
        outcome === VoiceConversationOutcome.RESOLVED &&
        durationSeconds != null &&
        durationSeconds > 0;

      await this.prisma.voiceConversation.create({
        data: {
          organizationId,
          voiceAssistantId: assistant.id,
          providerConversationId: providerId,
          elevenLabsConvId: providerId,
          providerAgentId: conv.agent_id,
          direction: VoiceConversationDirection.INBOUND,
          durationSeconds,
          status:
            conv.status === 'done'
              ? VoiceConversationStatus.COMPLETED
              : VoiceConversationStatus.FAILED,
          outcome,
          transcript,
          summary:
            typeof detail?.metadata?.summary === 'string'
              ? detail.metadata.summary
              : null,
          metadata: shouldIncrementCounters ? withCountersApplied(metadata) : metadata,
          startedAt: conv.start_time_unix_secs
            ? new Date(conv.start_time_unix_secs * 1000)
            : new Date(),
          endedAt: conv.end_time_unix_secs
            ? new Date(conv.end_time_unix_secs * 1000)
            : null,
        },
      });

      if (shouldIncrementCounters) {
        await this.prisma.voiceAssistant.update({
          where: { id: assistant.id },
          data: {
            totalCalls: { increment: 1 },
            answeredCalls: { increment: 1 },
            totalTalkTimeSeconds: { increment: durationSeconds },
            totalTalkMinutes: { increment: durationSeconds / 60 },
          },
        });
      }
      synced++;
    }

    await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: { lastSyncedAt: new Date() },
    });

    return { synced };
  }

  async listProviderPhoneNumbers(organizationId: string) {
    return this.buildPhoneNumberList(organizationId);
  }

  async assignPhoneNumber(
    organizationId: string,
    phoneNumberId: string,
    provider: 'elevenlabs' | 'twilio' = 'elevenlabs',
  ) {
    if (provider === 'twilio') {
      return this.assignTwilioPhoneNumber(organizationId, phoneNumberId);
    }
    return this.assignElevenLabsPhoneNumber(organizationId, phoneNumberId);
  }

  private async assignElevenLabsPhoneNumber(
    organizationId: string,
    phoneNumberId: string,
  ) {
    const assistant = await this.requireAssistantRow(organizationId);
    if (!assistant.elevenLabsAgentId) {
      throw new BadRequestException(
        'Agent not provisioned. Activate the assistant before assigning a phone number.',
      );
    }
    if (!this.elevenLabs.isConfigured()) {
      throw new ServiceUnavailableException('ElevenLabs is not configured on the server.');
    }

    const numbers = await this.elevenLabs.listPhoneNumbers();
    const selected = numbers.find((n) => n.phone_number_id === phoneNumberId);
    if (!selected) {
      throw new BadRequestException('Phone number not found in ElevenLabs account.');
    }

    await this.elevenLabs.assignPhoneNumberToAgent(
      assistant.elevenLabsAgentId,
      phoneNumberId,
    );

    const updated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        pstnProvider: VoicePstnProvider.ELEVENLABS,
        elevenLabsPhoneNumberId: phoneNumberId,
        phoneNumberId: phoneNumberId,
        phoneNumber: selected.phone_number ?? assistant.phoneNumber,
        twilioPhoneNumberSid: null,
        telephonyEnabled: true,
        connectionStatus: await this.deriveConnectionStatus(organizationId, {
          ...assistant,
          pstnProvider: VoicePstnProvider.ELEVENLABS,
          elevenLabsPhoneNumberId: phoneNumberId,
          phoneNumberId: phoneNumberId,
          phoneNumber: selected.phone_number ?? assistant.phoneNumber,
          twilioPhoneNumberSid: null,
          telephonyEnabled: true,
        }),
      },
    });

    return await this.formatAssistant(updated);
  }

  private async assignTwilioPhoneNumber(
    organizationId: string,
    phoneNumberSid: string,
  ) {
    const assistant = await this.requireAssistantRow(organizationId);
    if (!assistant.elevenLabsAgentId) {
      throw new BadRequestException(
        'Agent not provisioned. Activate the assistant before assigning a phone number.',
      );
    }
    if (!(await this.twilioTelephony.isConfiguredForOrganization(organizationId))) {
      throw new ServiceUnavailableException(
        'Twilio subaccount is not configured for this organization.',
      );
    }

    const numbers = await this.twilioTelephony.listPhoneNumbers(organizationId);
    const selected = numbers.find((n) => n.phoneNumberSid === phoneNumberSid);
    if (!selected) {
      throw new BadRequestException('Phone number not found in organization Twilio subaccount.');
    }

    await this.twilioTelephony.configureInboundWebhooks(organizationId, phoneNumberSid);

    const updated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        pstnProvider: VoicePstnProvider.TWILIO,
        twilioPhoneNumberSid: phoneNumberSid,
        phoneNumberId: phoneNumberSid,
        phoneNumber: selected.phoneNumber ?? assistant.phoneNumber,
        elevenLabsPhoneNumberId: null,
        telephonyEnabled: true,
        connectionStatus: await this.deriveConnectionStatus(organizationId, {
          ...assistant,
          pstnProvider: VoicePstnProvider.TWILIO,
          twilioPhoneNumberSid: phoneNumberSid,
          phoneNumberId: phoneNumberSid,
          phoneNumber: selected.phoneNumber ?? assistant.phoneNumber,
          elevenLabsPhoneNumberId: null,
          telephonyEnabled: true,
        }),
      },
    });

    return await this.formatAssistant(updated);
  }

  async unassignPhoneNumber(organizationId: string) {
    const assistant = await this.requireAssistantRow(organizationId);
    if (assistant.pstnProvider === VoicePstnProvider.TWILIO) {
      return this.unassignTwilioPhoneNumber(assistant);
    }
    return this.unassignElevenLabsPhoneNumber(assistant);
  }

  private async unassignElevenLabsPhoneNumber(assistant: VoiceAssistant) {
    const phoneNumberId =
      assistant.elevenLabsPhoneNumberId ?? assistant.phoneNumberId;
    if (!phoneNumberId) {
      throw new BadRequestException('No phone number is assigned to this assistant.');
    }
    if (!this.elevenLabs.isConfigured()) {
      throw new ServiceUnavailableException('ElevenLabs is not configured on the server.');
    }

    await this.elevenLabs.unassignPhoneNumberFromAgent(phoneNumberId);

    const updated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        elevenLabsPhoneNumberId: null,
        phoneNumberId: null,
        phoneNumber: null,
        inboundEnabled: false,
      },
    });

    return await this.formatAssistant(updated);
  }

  private async unassignTwilioPhoneNumber(assistant: VoiceAssistant) {
    const phoneNumberSid = assistant.twilioPhoneNumberSid ?? assistant.phoneNumberId;
    if (!phoneNumberSid) {
      throw new BadRequestException('No phone number is assigned to this assistant.');
    }
    if (!(await this.twilioTelephony.isConfiguredForOrganization(assistant.organizationId))) {
      throw new ServiceUnavailableException(
        'Twilio subaccount is not configured for this organization.',
      );
    }

    await this.twilioTelephony.clearInboundWebhooks(assistant.organizationId, phoneNumberSid);

    const updated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        twilioPhoneNumberSid: null,
        phoneNumberId: null,
        phoneNumber: null,
        inboundEnabled: false,
      },
    });

    return await this.formatAssistant(updated);
  }

  async refreshTelephonyStatus(organizationId: string) {
    const assistant = await this.requireAssistantRow(organizationId);
    const phoneNumbers = await this.buildPhoneNumberList(organizationId);

    let next = assistant;
    const providerConfig = await this.getTelephonyProviderConfig(organizationId);
    const assigned = phoneNumbers.find(
      (n) => n.assignedToThisAssistant && n.provider === (assistant.pstnProvider === VoicePstnProvider.TWILIO ? 'twilio' : 'elevenlabs'),
    );

    if (assigned) {
      const patch: Prisma.VoiceAssistantUpdateInput = {
        connectionStatus: isPstnProviderConfigured(assistant, providerConfig)
          ? VoiceConnectionStatus.CONNECTED
          : VoiceConnectionStatus.NOT_CONFIGURED,
        phoneNumberId: assigned.phoneNumberId,
        phoneNumber: assigned.phoneNumber,
      };
      if (assigned.provider === 'twilio') {
        patch.twilioPhoneNumberSid = assigned.phoneNumberId;
        patch.pstnProvider = VoicePstnProvider.TWILIO;
      } else {
        patch.elevenLabsPhoneNumberId = assigned.phoneNumberId;
        patch.pstnProvider = VoicePstnProvider.ELEVENLABS;
      }
      next = await this.prisma.voiceAssistant.update({
        where: { id: assistant.id },
        data: patch,
      });
    }

    const telephonyStatus = computeTelephonyStatus(next, providerConfig);
    return {
      assistant: await this.formatAssistant(next),
      phoneNumbers,
      telephonyStatus,
    };
  }

  async updateTelephonySettings(organizationId: string, dto: UpdateTelephonySettingsDto) {
    const assistant = await this.requireAssistantRow(organizationId);
    const telephonyEnabled = dto.telephonyEnabled ?? assistant.telephonyEnabled;
    const inboundEnabled = dto.inboundEnabled ?? assistant.inboundEnabled;
    const outboundEnabled = dto.outboundEnabled ?? assistant.outboundEnabled;

    const wantsLiveTelephony = telephonyEnabled || inboundEnabled;
    if (wantsLiveTelephony && !hasPhoneNumberAssigned(assistant)) {
      throw new BadRequestException(
        'Assign a phone number before enabling telephony or inbound calls.',
      );
    }

    if (outboundEnabled) {
      const providerConfig = await this.getTelephonyProviderConfig(organizationId);
      if (!isPstnProviderConfigured(assistant, providerConfig)) {
        throw new BadRequestException(
          'Telephony provider must be configured before enabling outbound calls.',
        );
      }
      if (!this.elevenLabs.isConfigured()) {
        throw new BadRequestException(
          'ElevenLabs must be configured before enabling outbound calls.',
        );
      }
    }

    const updated = await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: {
        telephonyEnabled,
        inboundEnabled,
        outboundEnabled,
      },
    });

    return await this.formatAssistant(updated);
  }

  async getInboundCallReadiness(organizationId: string) {
    return this.callOrchestration.evaluateInboundReadiness(organizationId);
  }

  async initiateOutboundCall(
    organizationId: string,
    params: { to: string; idempotencyKey: string; customerId?: string; bookingId?: string },
    initiatedByUserId?: string,
  ) {
    return this.callOrchestration.orchestrateOutboundCall({
      organizationId,
      toE164: params.to.trim(),
      idempotencyKey: params.idempotencyKey,
      customerId: params.customerId ?? null,
      bookingId: params.bookingId ?? null,
      initiatedByUserId: initiatedByUserId ?? null,
    });
  }

  async initiateTwilioOutboundCall(organizationId: string, to: string, initiatedByUserId?: string) {
    if (isVoiceNativeTwilioIntegrationEnabled()) {
      throw new BadRequestException(
        'Legacy Twilio Say outbound is disabled when native ElevenLabs-Twilio integration is enabled. Use POST .../calls/outbound.',
      );
    }

    if (!isLegacyDiagnosticCallsEnabled()) {
      throw new ForbiddenException(
        'Legacy Twilio Say diagnostic calls are disabled. Set VOICE_LEGACY_DIAGNOSTIC_CALLS=true for explicit diagnostic use.',
      );
    }

    const assistant = await this.requireAssistantRow(organizationId);
    if (initiatedByUserId) {
      await this.callOrchestration.assertLegacyDiagnosticCallAllowed({
        organizationId,
        toE164: to.trim(),
        initiatedByUserId,
      });
    }

    if (assistant.pstnProvider !== VoicePstnProvider.TWILIO) {
      throw new BadRequestException(
        'Outbound Twilio calls require a Twilio-assigned PSTN number.',
      );
    }
    if (!assistant.outboundEnabled) {
      throw new BadRequestException('Outbound calls are disabled for this assistant.');
    }
    if (!assistant.phoneNumber?.trim()) {
      throw new BadRequestException('No Twilio caller ID is assigned to this assistant.');
    }
    if (!(await this.twilioTelephony.isConfiguredForOrganization(organizationId))) {
      throw new ServiceUnavailableException(
        'Twilio subaccount is not configured for this organization.',
      );
    }

    const result = await this.twilioTelephony.initiateOutboundCall(organizationId, {
      from: assistant.phoneNumber,
      to: to.trim(),
      twimlMessage: assistant.greetingMessage?.trim() || 'Hello from SynqDrive.',
    });

    await this.prisma.voiceConversation.create({
      data: {
        organizationId,
        voiceAssistantId: assistant.id,
        twilioCallSid: result.callSid,
        providerConversationId: result.callSid,
        providerAgentId: assistant.elevenLabsAgentId,
        callerNumber: to.trim(),
        direction: VoiceConversationDirection.OUTBOUND,
        status: VoiceConversationStatus.ACTIVE,
        outcome: VoiceConversationOutcome.PENDING,
        metadata: buildLegacyTwimlMetadata({ direction: 'outbound' }),
      },
    });

    return {
      callSid: result.callSid,
      from: assistant.phoneNumber,
      to: to.trim(),
      status: 'queued',
    };
  }

  getReadiness(organizationId: string): Promise<ReadinessResult> {
    return this.prisma.voiceAssistant
      .findUnique({ where: { organizationId } })
      .then(async (assistant) => {
        if (!assistant) {
          return {
            ready: false,
            checks: [],
            missing: ['Voice assistant not configured'],
          };
        }
        return await this.computeReadiness(assistant, { forActivation: true });
      });
  }

  async getAdminOverview() {
    const elevenLabsConfigured = this.elevenLabs.isConfigured();
    const platformTwilioConfigured = this.twilioControlPlaneTelephony.isConfigured();
    const todayStart = startOfToday();

    const [organizations, assistants, callsTodayGroups, lastCallGroups] = await Promise.all([
      this.prisma.organization.findMany({
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      this.prisma.voiceAssistant.findMany(),
      this.prisma.voiceConversation.groupBy({
        by: ['organizationId'],
        where: { startedAt: { gte: todayStart } },
        _count: { _all: true },
      }),
      this.prisma.voiceConversation.groupBy({
        by: ['organizationId'],
        _max: { startedAt: true },
      }),
    ]);

    const assistantByOrg = new Map(assistants.map((a) => [a.organizationId, a]));
    const callsTodayMap = new Map(
      callsTodayGroups.map((g) => [g.organizationId, g._count._all]),
    );
    const lastCallMap = new Map(
      lastCallGroups.map((g) => [g.organizationId, g._max.startedAt]),
    );

    const rows = await Promise.all(
      organizations.map(async (org) => {
        const twilioConnected = await this.twilioTelephony.isConfiguredForOrganization(org.id);
        const providerConfig = {
          elevenLabsConfigured,
          twilioConfigured: twilioConnected,
        };
        const assistant = assistantByOrg.get(org.id);
        if (!assistant) {
          return {
            organizationId: org.id,
            organizationName: org.companyName,
            assistantStatus: 'NOT_CONFIGURED',
            readinessPercent: 0,
            missingReadinessItemsCount: 0,
            elevenLabsConnected: elevenLabsConfigured,
            twilioConnected,
            agentProvisioned: false,
            telephonyEnabled: false,
            phoneNumber: null,
            inboundEnabled: false,
            outboundEnabled: false,
            totalCalls: 0,
            callsToday: callsTodayMap.get(org.id) ?? 0,
            escalatedCalls: 0,
            missedCalls: 0,
            lastCallAt: lastCallMap.get(org.id)?.toISOString() ?? null,
            lastSyncedAt: null,
            providerWarning: resolveProviderWarning(elevenLabsConfigured, null, null),
            lastError: null,
            connectionStatus: null,
            telephonyLabel: 'Not configured',
          };
        }

        const readiness = await this.computeReadiness(assistant, { forActivation: false });
        const telephony = computeTelephonyStatus(assistant, providerConfig);

        return {
          organizationId: org.id,
          organizationName: org.companyName,
          assistantStatus: assistant.status,
          readinessPercent: readinessPercent(readiness),
          missingReadinessItemsCount: readiness.missing.length,
          elevenLabsConnected: elevenLabsConfigured,
          twilioConnected,
          agentProvisioned: Boolean(assistant.elevenLabsAgentId),
          telephonyEnabled: assistant.telephonyEnabled,
          phoneNumber: assistant.phoneNumber,
          inboundEnabled: assistant.inboundEnabled,
          outboundEnabled: assistant.outboundEnabled,
          totalCalls: assistant.totalCalls,
          callsToday: callsTodayMap.get(org.id) ?? 0,
          escalatedCalls: assistant.escalatedCalls,
          missedCalls: assistant.missedCalls,
          lastCallAt: lastCallMap.get(org.id)?.toISOString() ?? null,
          lastSyncedAt: assistant.lastSyncedAt?.toISOString() ?? null,
          providerWarning: resolveProviderWarning(elevenLabsConfigured, assistant, telephony),
          lastError:
            assistant.connectionStatus === VoiceConnectionStatus.ERROR
              ? 'Connection status: ERROR'
              : null,
          connectionStatus: assistant.connectionStatus,
          telephonyLabel: telephony.label,
        };
      }),
    );

    const configuredRows = rows.filter((r) => r.assistantStatus !== 'NOT_CONFIGURED');
    const activeCount = configuredRows.filter((r) => r.assistantStatus === VoiceAssistantStatus.ACTIVE).length;
    const totalCalls = configuredRows.reduce((s, r) => s + r.totalCalls, 0);
    const totalTalkTimeSeconds = assistants.reduce((s, a) => s + a.totalTalkTimeSeconds, 0);

    return {
      assistants: rows,
      summary: {
        totalOrgs: organizations.length,
        configuredOrgs: configuredRows.length,
        activeOrgs: activeCount,
        totalCalls,
        totalTalkTimeSeconds,
        totalMinutes: Math.round((totalTalkTimeSeconds / 60) * 10) / 10,
        costTrackingConnected: true,
        costTrackingMessage: 'Voice usage ledger and plan catalog connected',
      },
      providerConfigured: elevenLabsConfigured || platformTwilioConfigured,
      elevenLabsConfigured,
      twilioConfigured: platformTwilioConfigured,
    };
  }

  async adminSyncOrganization(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.syncConversations(orgId);
  }

  async getAdminOrgDetail(orgId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, companyName: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId: orgId },
    });
    if (!assistant) {
      return {
        exists: false,
        organization,
        warnings: [
          resolveProviderWarning(this.elevenLabs.isConfigured(), null, null) ??
            'No voice assistant configured for this organization.',
        ].filter(Boolean),
        costTracking: {
          connected: false,
          message: 'Cost tracking not connected yet',
        },
      };
    }

    const providerConfig = await this.getTelephonyProviderConfig(orgId);
    const readiness = await this.computeReadiness(assistant, { forActivation: false });
    const telephonyStatus = computeTelephonyStatus(assistant, providerConfig);
    const conversations = await this.listConversations(orgId, { limit: 10 });
    const providerConfigured =
      providerConfig.elevenLabsConfigured || providerConfig.twilioConfigured;
    const warnings = buildAdminWarnings(assistant, readiness, telephonyStatus, providerConfigured);

    return {
      exists: true,
      organization,
      assistant: this.formatAssistantSummary(assistant),
      readiness,
      telephonyStatus,
      warnings,
      providerConfigured,
      recentConversations: conversations.items.map((c) => this.stripConversationForAdmin(c)),
      costTracking: {
        connected: false,
        message: 'Cost tracking not connected yet',
      },
    };
  }

  assertOrgAccess(requestedOrgId: string, scopedOrgId: string | undefined) {
    if (scopedOrgId && scopedOrgId !== requestedOrgId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  private async requireAssistantRow(organizationId: string): Promise<VoiceAssistant> {
    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (!assistant) {
      return this.prisma.voiceAssistant.create({
        data: {
          organizationId,
          connectionStatus: await this.deriveConnectionStatus(organizationId),
        },
      });
    }
    return assistant;
  }

  private async deriveConnectionStatus(
    organizationId: string,
    assistant?: VoiceAssistant | null,
  ): Promise<VoiceConnectionStatus> {
    const config = await this.getTelephonyProviderConfig(organizationId);
    if (!config.elevenLabsConfigured) {
      return VoiceConnectionStatus.NOT_CONFIGURED;
    }
    if (assistant?.pstnProvider === VoicePstnProvider.TWILIO && !config.twilioConfigured) {
      return VoiceConnectionStatus.DEGRADED;
    }
    if (!assistant?.elevenLabsAgentId && assistant?.status === VoiceAssistantStatus.ACTIVE) {
      return VoiceConnectionStatus.DEGRADED;
    }
    return VoiceConnectionStatus.CONNECTED;
  }

  private async getTelephonyProviderConfig(organizationId: string): Promise<TelephonyProviderConfig> {
    return {
      elevenLabsConfigured: this.elevenLabs.isConfigured(),
      twilioConfigured: await this.twilioTelephony.isConfiguredForOrganization(organizationId),
    };
  }

  private hasEscalationConfigured(assistant: VoiceAssistant): boolean {
    if (assistant.escalationPhone?.trim() || assistant.escalationUserId) return true;
    return Boolean(assistant.fallbackMessage?.trim());
  }

  private async computeReadiness(
    assistant: VoiceAssistant,
    options: { forActivation: boolean },
  ): Promise<ReadinessResult> {
    const telephonyRequired =
      options.forActivation && isTelephonyLiveModeRequested(assistant);

    const providerConfig = await this.getTelephonyProviderConfig(assistant.organizationId);
    const elevenLabsHealth = evaluateConfiguredProviderHealth(
      providerConfig.elevenLabsConfigured,
      'ElevenLabs',
    );
    const twilioHealth = evaluateConfiguredProviderHealth(
      providerConfig.twilioConfigured,
      'Twilio',
    );

    const checks: ReadinessCheck[] = [
      { key: 'name', label: 'Assistant name', ok: Boolean(assistant.name?.trim()), required: true },
      {
        key: 'systemPrompt',
        label: 'System prompt',
        ok: Boolean(assistant.systemPrompt?.trim()),
        required: true,
      },
      { key: 'voice', label: 'Voice selected', ok: Boolean(assistant.voiceId?.trim()), required: true },
      {
        key: 'greeting',
        label: 'Greeting message',
        ok: Boolean(assistant.greetingMessage?.trim()),
        required: true,
      },
      {
        key: 'escalation',
        label: 'Escalation or fallback configured',
        ok: this.hasEscalationConfigured(assistant),
        required: true,
      },
      {
        key: 'elevenlabs',
        label: 'ElevenLabs connected',
        ok: readinessCheckOkFromHealth(elevenLabsHealth),
        required: true,
        verification: elevenLabsHealth.verification,
      },
      {
        key: 'twilio',
        label: 'Twilio connected',
        ok:
          assistant.pstnProvider !== VoicePstnProvider.TWILIO ||
          readinessCheckOkFromHealth(twilioHealth),
        required: assistant.pstnProvider === VoicePstnProvider.TWILIO,
        verification:
          assistant.pstnProvider === VoicePstnProvider.TWILIO
            ? twilioHealth.verification
            : 'unknown',
      },
      {
        key: 'agentProvisioned',
        label: 'Agent provisioned',
        ok: Boolean(assistant.elevenLabsAgentId) || options.forActivation,
        required: options.forActivation ? false : true,
      },
      {
        key: 'phoneConnected',
        label: 'Phone number assigned',
        ok: hasPhoneNumberAssigned(assistant),
        required: telephonyRequired,
      },
    ];

    const missing = checks.filter((c) => c.required && !c.ok).map((c) => c.label);
    const ready = missing.length === 0;

    return { ready, checks, missing };
  }

  private mapUpdateDto(
    dto: UpdateVoiceAssistantDto,
    assistant: VoiceAssistant,
  ): Prisma.VoiceAssistantUpdateInput {
    const {
      escalationTriggers,
      businessHours,
      permModifyRecords,
      toolPermissions,
      ...rest
    } = dto;

    const data: Prisma.VoiceAssistantUpdateInput = { ...rest };

    if (toolPermissions !== undefined) {
      const current = resolveToolPermissions(assistant);
      const merged = validateToolPermissionsUpdate(toolPermissions, current, assistant);
      data.toolPermissions = merged as Prisma.InputJsonValue;
      Object.assign(data, syncLegacyBooleansFromToolPermissions(merged));
    }

    if (escalationTriggers !== undefined) {
      data.escalationTriggers = escalationTriggers as Prisma.InputJsonValue;
    }
    if (businessHours !== undefined) {
      data.businessHours = businessHours as Prisma.InputJsonValue;
    }
    if (permModifyRecords !== undefined) {
      data.permModifyRecords = permModifyRecords;
      data.permCreateActions = permModifyRecords;
    }

    return data;
  }

  private async formatAssistant(assistant: VoiceAssistant) {
    const toolPermissions = resolveToolPermissions(assistant);
    const toolPolicy = buildToolPolicyForAssistant(assistant);
    const telephonyStatus = computeTelephonyStatus(
      assistant,
      await this.getTelephonyProviderConfig(assistant.organizationId),
    );
    return {
      ...assistant,
      toolPermissions,
      toolPolicy,
      telephonyStatus,
      totalTalkMinutes:
        assistant.totalTalkMinutes > 0
          ? assistant.totalTalkMinutes
          : assistant.totalTalkTimeSeconds / 60,
    };
  }

  private async buildPhoneNumberList(organizationId: string): Promise<ProviderPhoneNumberView[]> {
    const assistant = await this.requireAssistantRow(organizationId);
    const results: ProviderPhoneNumberView[] = [];

    if (this.elevenLabs.isConfigured()) {
      const numbers = await this.elevenLabs.listPhoneNumbers();
      results.push(...mapProviderPhoneNumbers(numbers, assistant.elevenLabsAgentId));
    }

    if (await this.twilioTelephony.isConfiguredForOrganization(organizationId)) {
      try {
        const twilioNumbers = await this.twilioTelephony.listPhoneNumbers(organizationId);
        results.push(...mapTwilioProviderPhoneNumbers(twilioNumbers, assistant));
      } catch (err) {
        this.logger.warn(
          `Twilio subaccount phone number list skipped: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    return results;
  }

  private formatAssistantSummary(assistant: VoiceAssistant) {
    return {
      id: assistant.id,
      organizationId: assistant.organizationId,
      name: assistant.name,
      role: assistant.role,
      language: assistant.language,
      voiceId: assistant.voiceId,
      voiceName: assistant.voiceName,
      status: assistant.status,
      telephonyEnabled: assistant.telephonyEnabled,
      inboundEnabled: assistant.inboundEnabled,
      outboundEnabled: assistant.outboundEnabled,
      phoneNumber: assistant.phoneNumber,
      elevenLabsAgentId: assistant.elevenLabsAgentId,
      connectionStatus: assistant.connectionStatus,
      provider: assistant.provider,
      hasAgent: Boolean(assistant.elevenLabsAgentId),
      totalCalls: assistant.totalCalls,
      answeredCalls: assistant.answeredCalls,
      missedCalls: assistant.missedCalls,
      escalatedCalls: assistant.escalatedCalls,
      totalTalkTimeSeconds: assistant.totalTalkTimeSeconds,
      totalTalkMinutes: assistant.totalTalkMinutes,
      activatedAt: assistant.activatedAt,
      deactivatedAt: assistant.deactivatedAt,
      updatedAt: assistant.updatedAt,
    };
  }

  private formatConversation(conv: {
    id: string;
    organizationId: string;
    voiceAssistantId: string | null;
    providerConversationId: string | null;
    elevenLabsConvId: string | null;
    callerNumber: string | null;
    direction: VoiceConversationDirection;
    durationSeconds: number | null;
    status: VoiceConversationStatus;
    outcome: VoiceConversationOutcome;
    transcript: string | null;
    summary: string | null;
    escalationReason: string | null;
    actionsPerformed: string[];
    errorMessage: string | null;
    metadata: Prisma.JsonValue | null;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const links = extractConversationLinks(conv.metadata);
    const escalated = isConversationEscalated(conv);
    const hasTranscript = hasConversationTranscript(conv.transcript);

    return {
      id: conv.id,
      startedAt: conv.startedAt,
      direction: conv.direction.toLowerCase(),
      callerNumber: maskCallerNumber(conv.callerNumber),
      durationSeconds: conv.durationSeconds,
      status: conv.status.toLowerCase(),
      outcome: conv.outcome,
      summary: conv.summary,
      transcript: hasTranscript ? conv.transcript : null,
      hasTranscript,
      escalated,
      escalationReason: conv.escalationReason,
      linkedBookingId: links.linkedBookingId,
      linkedCustomerId: links.linkedCustomerId,
      linkedVehicleId: links.linkedVehicleId,
      taskId: links.taskId,
      metadata: minimalConversationMetadata(conv.metadata),
      organizationId: conv.organizationId,
      voiceAssistantId: conv.voiceAssistantId,
      providerConversationId: conv.providerConversationId,
      elevenLabsConvId: conv.elevenLabsConvId,
      actionsPerformed: conv.actionsPerformed,
      errorMessage: conv.errorMessage,
      endedAt: conv.endedAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  private stripConversationForAdmin(conv: {
    id: string;
    startedAt: Date;
    direction: string;
    callerNumber: string | null;
    durationSeconds: number | null;
    status: string;
    outcome: VoiceConversationOutcome;
    summary: string | null;
    hasTranscript: boolean;
    escalated: boolean;
    escalationReason: string | null;
    transcript: string | null;
    metadata: Record<string, unknown> | null;
    actionsPerformed: string[];
    errorMessage: string | null;
    organizationId: string;
    voiceAssistantId: string | null;
    providerConversationId: string | null;
    elevenLabsConvId: string | null;
    linkedBookingId: string | null;
    linkedCustomerId: string | null;
    linkedVehicleId: string | null;
    taskId: string | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const {
      transcript: _transcript,
      metadata: _metadata,
      actionsPerformed: _actions,
      errorMessage: _error,
      organizationId: _org,
      voiceAssistantId: _assistant,
      providerConversationId: _provider,
      elevenLabsConvId: _eleven,
      linkedBookingId,
      linkedCustomerId,
      linkedVehicleId,
      taskId,
      ...rest
    } = conv;
    return {
      ...rest,
      linkedBookingId,
      linkedCustomerId,
      linkedVehicleId,
      taskId,
    };
  }

  private buildFullPrompt(assistant: VoiceAssistant): string {
    const parts: string[] = [];
    if (assistant.systemPrompt) parts.push(assistant.systemPrompt);
    if (assistant.companyContext) parts.push(`\n\nCompany Context:\n${assistant.companyContext}`);
    if (assistant.businessRules) parts.push(`\n\nBusiness Rules:\n${assistant.businessRules}`);
    if (assistant.forbiddenActions) parts.push(`\n\nForbidden Actions:\n${assistant.forbiddenActions}`);
    if (assistant.knowledgeSnippets) parts.push(`\n\nKnowledge Base:\n${assistant.knowledgeSnippets}`);
    parts.push(buildPermissionsPromptSection(assistant));

    if (assistant.escalateOnRequest || assistant.escalateOnLowConf || assistant.escalateOnSensitive) {
      const triggers: string[] = [];
      if (assistant.escalateOnRequest) triggers.push('when the caller requests a human');
      if (assistant.escalateOnLowConf) triggers.push('when you are not confident in your answer');
      if (assistant.escalateOnSensitive) triggers.push('for sensitive topics');
      parts.push(`\n\nEscalation: Transfer the call ${triggers.join(', ')}.`);
      if (assistant.fallbackMessage) {
        parts.push(`If no agent is available, say: "${assistant.fallbackMessage}"`);
      }
    }

    return parts.join('');
  }
}
