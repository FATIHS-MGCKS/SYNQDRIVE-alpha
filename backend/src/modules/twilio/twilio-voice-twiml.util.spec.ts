import { VoiceAssistantStatus } from '@prisma/client';
import { buildInboundVoiceTwiml, LEGACY_TWIML_DIAGNOSTIC_COMMENT } from './twilio-voice-twiml.util';

describe('twilio-voice-twiml.util', () => {
  it('returns unavailable TwiML when assistant is missing', () => {
    const xml = buildInboundVoiceTwiml(null);
    expect(xml).toContain('<Response>');
    expect(xml).toContain('not available');
  });

  it('uses assistant greeting for active assistants', () => {
    const xml = buildInboundVoiceTwiml({
      status: VoiceAssistantStatus.ACTIVE,
      greetingMessage: 'Willkommen bei SynqDrive',
      fallbackMessage: null,
      escalationPhone: null,
      elevenLabsAgentId: 'agent-1',
      language: 'de',
    } as never);

    expect(xml).toContain('Willkommen bei SynqDrive');
    expect(xml).toContain('language="de-DE"');
    expect(xml).toContain(LEGACY_TWIML_DIAGNOSTIC_COMMENT);
    expect(xml).not.toContain('ElevenLabs agent provisioned');
  });
});
