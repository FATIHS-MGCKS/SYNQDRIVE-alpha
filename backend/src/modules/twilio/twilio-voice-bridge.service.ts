import { Injectable } from '@nestjs/common';
import { VoiceAssistant } from '@prisma/client';
import { buildInboundVoiceTwiml } from './twilio-voice-twiml.util';

/**
 * Bridges Twilio PSTN ingress to the org Voice Assistant persona.
 * ElevenLabs remains the AI agent provider; Twilio handles phone numbers and call control.
 */
@Injectable()
export class TwilioVoiceBridgeService {
  buildInboundTwiml(assistant: VoiceAssistant | null): string {
    return buildInboundVoiceTwiml(assistant);
  }

  describeBridge(assistant: VoiceAssistant | null): {
    pstnProvider: 'twilio';
    aiProvider: 'elevenlabs';
    agentProvisioned: boolean;
    inboundReady: boolean;
  } {
    const agentProvisioned = Boolean(assistant?.elevenLabsAgentId);
    return {
      pstnProvider: 'twilio',
      aiProvider: 'elevenlabs',
      agentProvisioned,
      inboundReady: Boolean(
        assistant?.telephonyEnabled || assistant?.inboundEnabled,
      ) && agentProvisioned,
    };
  }
}
