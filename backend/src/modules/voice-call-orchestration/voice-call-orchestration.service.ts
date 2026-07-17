import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Prisma,
  VoiceAgentDeploymentStatus,
  VoiceAssistantStatus,
  VoiceControlPlaneProvider,
  VoiceConversationDirection,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ElevenLabsProviderAdapter } from '@modules/voice-assistant/elevenlabs-provider/elevenlabs-provider.adapter';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { buildElevenLabsConversationMetadata } from '@modules/voice-assistant/voice-conversation-lifecycle.util';
import { buildCanonicalVoiceMcpGatewayUrl } from '@modules/voice-mcp-gateway/voice-mcp-canonical-url';
import { VoiceMcpTokenService } from '@modules/voice-mcp-gateway/voice-mcp-token.service';
import { VoiceInternalEventIngestService } from '@modules/voice-webhook-ingestion/voice-internal-event-ingest.service';
import { buildInboundFallbackTwiml, buildLegacyDiagnosticTwiml } from '@modules/twilio/twilio-voice-twiml.util';
import { VoiceCallPolicyService } from './voice-call-policy.service';
import { VoiceBudgetEnforcementService } from '@modules/voice-protection/voice-budget-enforcement.service';
import { resolveAllowedMcpToolsForAssistant } from './voice-mcp-tools.util';
import {
  assertLiveProviderCallsAllowed,
  isLegacyDiagnosticCallsEnabled,
  isVoiceCallProviderStagingEnabled,
  isVoiceMcpGatewayFeatureEnabled,
  isVoiceNativeTwilioIntegrationEnabled,
} from './voice-feature-flags.config';
import type {
  VoiceInboundReadiness,
  VoiceInboundRoute,
  VoiceLegacyDiagnosticCallRequest,
  VoiceOutboundCallRequest,
  VoiceOutboundCallResult,
} from './voice-call-orchestration.types';

@Injectable()
export class VoiceCallOrchestrationService {
  private readonly logger = new Logger(VoiceCallOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elevenLabs: ElevenLabsProviderAdapter,
    private readonly deployments: VoiceAgentDeploymentRepository,
    private readonly phoneNumbers: VoicePhoneNumberRepository,
    private readonly policy: VoiceCallPolicyService,
    private readonly protection: VoiceBudgetEnforcementService,
    private readonly mcpTokens: VoiceMcpTokenService,
    private readonly internalEvents: VoiceInternalEventIngestService,
  ) {}

  async evaluateInboundReadiness(organizationId: string): Promise<VoiceInboundReadiness> {
    const assistant = await this.prisma.voiceAssistant.findUnique({ where: { organizationId } });
    const blockers: VoiceInboundReadiness['blockers'] = [];

    if (!assistant) {
      return this.readinessResult(organizationId, null, null, null, 'rejected', [
        { code: 'assistant_missing', message: 'Voice assistant is not configured.' },
      ]);
    }

    if (!isVoiceNativeTwilioIntegrationEnabled()) {
      blockers.push({
        code: 'native_integration_disabled',
        message: 'VOICE_NATIVE_TWILIO_INTEGRATION is not enabled.',
      });
    }

    if (assistant.status !== VoiceAssistantStatus.ACTIVE) {
      blockers.push({ code: 'assistant_inactive', message: 'Voice assistant is not active.' });
    }

    const phone = await this.resolveAssignedPhoneNumber(organizationId, assistant.phoneNumberId);
    if (!phone) {
      blockers.push({ code: 'phone_missing', message: 'No org voice phone number is assigned.' });
    } else {
      if (phone.lifecycle !== VoicePhoneNumberLifecycle.ACTIVE) {
        blockers.push({ code: 'phone_inactive', message: 'Assigned phone number is not active.' });
      }
      if (phone.elevenLabsImportStatus !== VoiceElevenLabsImportStatus.ASSIGNED) {
        blockers.push({
          code: 'phone_not_imported',
          message: 'Twilio number is not imported and assigned in ElevenLabs.',
        });
      }
    }

    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        organizationId,
        status: VoiceAgentDeploymentStatus.ACTIVE,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
        archivedAt: null,
      },
      orderBy: { version: 'desc' },
    });
    if (!deployment) {
      blockers.push({ code: 'deployment_missing', message: 'No active ElevenLabs agent deployment.' });
    }

    const mcpGatewayConfigured =
      isVoiceMcpGatewayFeatureEnabled() && Boolean(buildCanonicalVoiceMcpGatewayUrl(organizationId));
    if (isVoiceMcpGatewayFeatureEnabled() && !mcpGatewayConfigured) {
      blockers.push({
        code: 'mcp_url_missing',
        message: 'MCP gateway public URL is not configured.',
      });
    }

    const budgetDegradation = await this.protection.evaluateInboundDegradation(organizationId);
    if (budgetDegradation.degraded) {
      blockers.push({
        code: budgetDegradation.reasonCode ?? 'inbound_budget_degraded',
        message: budgetDegradation.message ?? 'Inbound voice degraded due to budget limits.',
      });
    }

    const route: VoiceInboundRoute =
      blockers.length === 0 ? 'native_elevenlabs' : assistant.status !== VoiceAssistantStatus.ACTIVE
        ? 'assistant_fallback'
        : 'rejected';

    return this.readinessResult(
      organizationId,
      assistant.id,
      phone?.id ?? null,
      deployment?.id ?? null,
      route,
      blockers,
      mcpGatewayConfigured,
    );
  }

  resolveInboundTwiml(params: {
    assistant: {
      status: VoiceAssistantStatus;
      fallbackMessage: string | null;
      telephonyEnabled: boolean;
      inboundEnabled: boolean;
    } | null;
    route: VoiceInboundRoute;
  }): string {
    if (!params.assistant) {
      return buildInboundFallbackTwiml('This number is not available.');
    }

    if (params.route === 'native_elevenlabs') {
      return buildInboundFallbackTwiml(
        'This line is routed through ElevenLabs. If you hear this message, inbound routing is misconfigured.',
      );
    }

    if (params.route === 'assistant_fallback') {
      const message =
        params.assistant.fallbackMessage?.trim() ||
        'The voice assistant is currently unavailable. Please try again later.';
      return buildInboundFallbackTwiml(message);
    }

    if (params.route === 'legacy_diagnostic') {
      return buildLegacyDiagnosticTwiml(
        params.assistant.fallbackMessage?.trim() || 'SynqDrive diagnostic call test.',
      );
    }

    return buildInboundFallbackTwiml('This number is not available.');
  }

  async resolveInboundRoute(organizationId: string): Promise<VoiceInboundRoute> {
    const readiness = await this.evaluateInboundReadiness(organizationId);
    if (readiness.ready) {
      return 'native_elevenlabs';
    }
    const assistant = await this.prisma.voiceAssistant.findUnique({ where: { organizationId } });
    if (assistant && assistant.status !== VoiceAssistantStatus.ACTIVE) {
      return 'assistant_fallback';
    }
    if (isLegacyDiagnosticCallsEnabled()) {
      return 'legacy_diagnostic';
    }
    return 'rejected';
  }

  async orchestrateOutboundCall(request: VoiceOutboundCallRequest): Promise<VoiceOutboundCallResult> {
    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId: request.organizationId },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not found.');
    }

    const conversationId = randomUUID();

    await this.policy.assertOutboundCallAllowed({
      organizationId: request.organizationId,
      toE164: request.toE164,
      voiceAssistantId: assistant.id,
      conversationId,
    });

    const existing = await this.findIdempotentOutboundConversation(
      request.organizationId,
      request.idempotencyKey,
    );
    if (existing) {
      return {
        conversationId: existing.id,
        maskedConversationRef: existing.elevenLabsConvId,
        maskedCallRef: existing.twilioCallSid,
        status: 'already_requested',
        dryRun: false,
        idempotentReplay: true,
      };
    }

    const phone = await this.resolveAssignedPhoneNumber(request.organizationId, assistant.phoneNumberId);
    if (!phone) {
      throw new BadRequestException('Organization voice phone number is not configured.');
    }

    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        organizationId: request.organizationId,
        status: VoiceAgentDeploymentStatus.ACTIVE,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
        archivedAt: null,
      },
      orderBy: { version: 'desc' },
    });
    if (!deployment) {
      throw new BadRequestException('Active ElevenLabs agent deployment is required.');
    }

    const preparation = await this.elevenLabs.prepareOutboundCall({
      organizationId: request.organizationId,
      deploymentId: deployment.id,
      phoneNumberId: phone.id,
      toE164: request.toE164,
    });
    if (!preparation.ready) {
      throw new BadRequestException(preparation.blockers.join(' '));
    }

    const dryRun = !isVoiceCallProviderStagingEnabled();
    if (dryRun) {
      const conversation = await this.createOutboundConversation({
        conversationId,
        organizationId: request.organizationId,
        assistantId: assistant.id,
        deploymentId: deployment.id,
        phoneNumberId: phone.id,
        toE164: request.toE164,
        idempotencyKey: request.idempotencyKey,
        customerId: request.customerId,
        bookingId: request.bookingId,
        dryRun: true,
      });
      return {
        conversationId: conversation.id,
        maskedConversationRef: null,
        maskedCallRef: null,
        status: 'dry_run',
        dryRun: true,
        idempotentReplay: false,
      };
    }

    assertLiveProviderCallsAllowed();

    const providerResult = await this.elevenLabs.startOutboundCall({
      organizationId: request.organizationId,
      deploymentId: deployment.id,
      phoneNumberId: phone.id,
      toE164: request.toE164,
    });

    const conversation = await this.createOutboundConversation({
      conversationId,
      organizationId: request.organizationId,
      assistantId: assistant.id,
      deploymentId: deployment.id,
      phoneNumberId: phone.id,
      toE164: request.toE164,
      idempotencyKey: request.idempotencyKey,
      customerId: request.customerId,
      bookingId: request.bookingId,
      dryRun: false,
      providerConversationRef: providerResult.maskedConversationRef,
      providerCallRef: providerResult.maskedCallRef,
    });

    await this.bindConversationMcpIfEnabled({
      organizationId: request.organizationId,
      voiceAssistantId: assistant.id,
      agentDeploymentId: deployment.id,
      conversationId: conversation.id,
    });

    return {
      conversationId: conversation.id,
      maskedConversationRef: providerResult.maskedConversationRef,
      maskedCallRef: providerResult.maskedCallRef,
      status: providerResult.status,
      dryRun: false,
      idempotentReplay: false,
    };
  }

  async assertLegacyDiagnosticCallAllowed(
    request: VoiceLegacyDiagnosticCallRequest,
  ): Promise<void> {
    if (!isLegacyDiagnosticCallsEnabled()) {
      throw new ForbiddenException(
        'Legacy Twilio Say diagnostic calls are disabled. Set VOICE_LEGACY_DIAGNOSTIC_CALLS=true to enable.',
      );
    }

    await this.policy.assertLegacyDiagnosticAllowed(request);

    if (!isVoiceCallProviderStagingEnabled()) {
      throw new ForbiddenException(
        'Legacy diagnostic calls require VOICE_AI_PROVISIONING_STAGING_ENABLED=true.',
      );
    }
  }

  async bindConversationMcpIfEnabled(params: {
    organizationId: string;
    voiceAssistantId: string;
    agentDeploymentId: string;
    conversationId: string;
  }): Promise<void> {
    if (!isVoiceMcpGatewayFeatureEnabled()) {
      return;
    }

    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { id: params.voiceAssistantId, organizationId: params.organizationId },
    });
    if (!assistant) {
      return;
    }

    const allowedTools = resolveAllowedMcpToolsForAssistant(assistant);

    const { token, claims } = await this.mcpTokens.issue({
      organizationId: params.organizationId,
      voiceAssistantId: params.voiceAssistantId,
      agentDeploymentId: params.agentDeploymentId,
      conversationId: params.conversationId,
      allowedTools,
      scopes: ['voice:mcp:read', 'voice:mcp:write'],
    });

    await this.prisma.voiceConversation.update({
      where: { id: params.conversationId },
      data: {
        metadata: {
          mcpTokenIssuedAt: new Date().toISOString(),
          mcpTokenNonce: claims.nonce,
          mcpGatewayBound: true,
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'voice_mcp_token_issued',
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        tokenLength: token.length,
      }),
    );

    await this.internalEvents.recordConversationLifecycle({
      organizationId: params.organizationId,
      voiceConversationId: params.conversationId,
      lifecycleState: VoiceConversationLifecycleState.INITIATED,
      reason: 'mcp_token_issued',
    });
  }

  async syncAgentMcpConfiguration(organizationId: string, deploymentId: string): Promise<void> {
    if (!isVoiceMcpGatewayFeatureEnabled()) {
      return;
    }
    const mcpUrl = buildCanonicalVoiceMcpGatewayUrl(organizationId);
    if (!mcpUrl) {
      return;
    }
    await this.elevenLabs.updateToolsConfiguration({
      organizationId,
      deploymentId,
      mcpServerUrl: mcpUrl,
    });
  }

  private async resolveAssignedPhoneNumber(organizationId: string, phoneNumberId: string | null) {
    if (!phoneNumberId) {
      return this.prisma.voicePhoneNumber.findFirst({
        where: {
          organizationId,
          lifecycle: VoicePhoneNumberLifecycle.ACTIVE,
          elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
    return this.phoneNumbers.findById(organizationId, phoneNumberId);
  }

  private async findIdempotentOutboundConversation(organizationId: string, idempotencyKey: string) {
    return this.prisma.voiceConversation.findFirst({
      where: {
        organizationId,
        direction: VoiceConversationDirection.OUTBOUND,
        metadata: {
          path: ['outboundIdempotencyKey'],
          equals: idempotencyKey,
        },
      },
    });
  }

  private async createOutboundConversation(params: {
    conversationId?: string;
    organizationId: string;
    assistantId: string;
    deploymentId: string;
    phoneNumberId: string;
    toE164: string;
    idempotencyKey: string;
    customerId?: string | null;
    bookingId?: string | null;
    dryRun: boolean;
    providerConversationRef?: string | null;
    providerCallRef?: string | null;
  }) {
    return this.prisma.voiceConversation.create({
      data: {
        id: params.conversationId,
        organizationId: params.organizationId,
        voiceAssistantId: params.assistantId,
        callerNumber: params.toE164,
        direction: VoiceConversationDirection.OUTBOUND,
        status: VoiceConversationStatus.ACTIVE,
        lifecycleState: VoiceConversationLifecycleState.INITIATED,
        outcome: VoiceConversationOutcome.PENDING,
        metadata: buildElevenLabsConversationMetadata({
          telephonyMode: 'ELEVENLABS_NATIVE_TWILIO',
          runtimePath: 'elevenlabs_twilio_outbound',
          agentDeploymentId: params.deploymentId,
          phoneNumberId: params.phoneNumberId,
          outboundIdempotencyKey: params.idempotencyKey,
          dryRun: params.dryRun,
          customerId: params.customerId ?? null,
          bookingId: params.bookingId ?? null,
          providerConversationRef: params.providerConversationRef ?? null,
          providerCallRef: params.providerCallRef ?? null,
        }),
      },
    });
  }

  private readinessResult(
    organizationId: string,
    voiceAssistantId: string | null,
    phoneNumberId: string | null,
    agentDeploymentId: string | null,
    route: VoiceInboundRoute,
    blockers: VoiceInboundReadiness['blockers'],
    mcpGatewayConfigured = false,
  ): VoiceInboundReadiness {
    return {
      organizationId,
      voiceAssistantId,
      phoneNumberId,
      agentDeploymentId,
      route,
      blockers,
      ready: blockers.length === 0 && route === 'native_elevenlabs',
      mcpGatewayConfigured,
    };
  }
}
