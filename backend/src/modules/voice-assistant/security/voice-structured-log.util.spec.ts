import { buildVoiceLogPayload, redactVoiceLogString } from './voice-structured-log.util';

describe('voice-structured-log.util', () => {
  it('masks conversation and call identifiers in structured logs', () => {
    const payload = buildVoiceLogPayload({
      event: 'voice_webhook_processed',
      correlationId: 'corr-123',
      organizationId: 'org-1',
      voiceConversationId: 'conv-abcdef123456',
      twilioCallSid: 'CA1234567890abcdef',
    });

    expect(payload.voiceConversationId).toBe('conv…3456');
    expect(payload.twilioCallSid).toBe('CA12…cdef');
    expect(JSON.stringify(payload)).not.toContain('abcdef123456');
  });

  it('redacts phone numbers and long transcript-like strings', () => {
    expect(redactVoiceLogString('+491701234567')).toMatch(/\*/);
    expect(redactVoiceLogString('a'.repeat(250))).toBe('[redacted:250chars]');
  });
});
