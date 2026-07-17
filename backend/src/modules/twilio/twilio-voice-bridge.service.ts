import { Injectable } from '@nestjs/common';
import { VoiceAssistant } from '@prisma/client';
import { LEGACY_TWIML_SAY_MODE } from '@modules/voice-assistant/voice-conversation-lifecycle.util';
import { buildInboundVoiceTwiml, buildLegacyDiagnosticTwiml } from './twilio-voice-twiml.util';
import { VoiceCallOrchestrationService } from '@modules/voice-call-orchestration/voice-call-orchestration.service';
import { isLegacyDiagnosticCallsEnabled } from '@modules/voice-call-orchestration/voice-feature-flags.config';

export const NATIVE_ELEVENLABS_TWILIO_MODE = 'ELEVENLABS_NATIVE_TWILIO' as const;

/**
 * Bridges Twilio PSTN ingress to org voice assistant runtime paths.
 * Productive path: native ElevenLabs-Twilio (when imported + flagged).
 * Diagnostic path: LEGACY_TWIML_SAY (explicit flag only).
 */
@Injectable()
export class TwilioVoiceBridgeService {
  constructor(private readonly orchestration: VoiceCallOrchestrationService) {}

  async buildInboundTwiml(
    assistant: VoiceAssistant | null,
    organizationId?: string | null,
  ): Promise<string> {
    if (!assistant || !organizationId) {
      return buildInboundVoiceTwiml(assistant);
    }

    const route = await this.orchestration.resolveInboundRoute(organizationId);
    if (route === 'legacy_diagnostic' && isLegacyDiagnosticCallsEnabled()) {
      return buildLegacyDiagnosticTwiml(
        assistant.greetingMessage?.trim() || 'SynqDrive diagnostic connectivity test.',
      );
    }

    return this.orchestration.resolveInboundTwiml({ assistant, route });
  }

  async describeBridge(
    assistant: VoiceAssistant | null,
    organizationId?: string | null,
  ): Promise<{
    pstnProvider: 'twilio';
    telephonyMode: typeof LEGACY_TWIML_SAY_MODE | typeof NATIVE_ELEVENLABS_TWILIO_MODE;
    aiProvider: 'elevenlabs' | null;
    agentProvisioned: boolean;
    inboundReady: boolean;
  }> {
    const readiness = organizationId
      ? await this.orchestration.evaluateInboundReadiness(organizationId)
      : null;

    const native = readiness?.ready === true;
    return {
      pstnProvider: 'twilio',
      telephonyMode: native ? NATIVE_ELEVENLABS_TWILIO_MODE : LEGACY_TWIML_SAY_MODE,
      aiProvider: native ? 'elevenlabs' : null,
      agentProvisioned: Boolean(assistant?.elevenLabsAgentId),
      inboundReady: native,
    };
  }
}
