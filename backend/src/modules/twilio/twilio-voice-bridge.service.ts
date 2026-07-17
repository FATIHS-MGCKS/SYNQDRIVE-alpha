import { Injectable } from '@nestjs/common';
import { VoiceAssistant } from '@prisma/client';
import { LEGACY_TWIML_SAY_MODE } from '@modules/voice-assistant/voice-conversation-lifecycle.util';
import { buildInboundVoiceTwiml } from './twilio-voice-twiml.util';

/**
 * Bridges Twilio PSTN ingress to the org Voice Assistant persona.
 * Current runtime path is LEGACY_TWIML_SAY (diagnostic Say only).
 */
@Injectable()
export class TwilioVoiceBridgeService {
  buildInboundTwiml(assistant: VoiceAssistant | null): string {
    return buildInboundVoiceTwiml(assistant);
  }

  describeBridge(assistant: VoiceAssistant | null): {
    pstnProvider: 'twilio';
    telephonyMode: typeof LEGACY_TWIML_SAY_MODE;
    aiProvider: null;
    agentProvisioned: boolean;
    inboundReady: boolean;
  } {
    return {
      pstnProvider: 'twilio',
      telephonyMode: LEGACY_TWIML_SAY_MODE,
      aiProvider: null,
      agentProvisioned: Boolean(assistant?.elevenLabsAgentId),
      inboundReady: false,
    };
  }
}
