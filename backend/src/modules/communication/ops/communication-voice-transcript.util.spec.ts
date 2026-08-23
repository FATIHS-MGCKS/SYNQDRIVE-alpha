import {
  assertTranscriptRedaction,
  normalizeVoiceTranscriptSpeaker,
  parseVoiceTranscript,
} from './communication-voice-transcript.util';

describe('communication-voice-transcript.util', () => {
  it('normalizes provider speaker aliases', () => {
    expect(normalizeVoiceTranscriptSpeaker('user')).toBe('CUSTOMER');
    expect(normalizeVoiceTranscriptSpeaker('agent')).toBe('AI_AGENT');
    expect(normalizeVoiceTranscriptSpeaker('operator')).toBe('HUMAN_OPERATOR');
    expect(normalizeVoiceTranscriptSpeaker('unknown-role')).toBe('UNKNOWN');
  });

  it('parses JSON transcript arrays without provider metadata', () => {
    const raw = JSON.stringify([
      {
        role: 'user',
        message: 'I need a car.',
        time_in_call_secs: 2,
        tool_arguments: { secret: 'hidden' },
        system_prompt: 'do not leak',
      },
      { role: 'agent', message: 'Happy to help.' },
    ]);

    const result = parseVoiceTranscript('call-1', raw, new Date('2026-08-23T10:00:00.000Z'));
    expect(result.availability).toBe('AVAILABLE');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      speaker: 'CUSTOMER',
      text: 'I need a car.',
    });
    expect(result.segments[1]).toMatchObject({
      speaker: 'AI_AGENT',
      text: 'Happy to help.',
    });
    expect(JSON.stringify(result)).not.toContain('tool_arguments');
    expect(JSON.stringify(result)).not.toContain('system_prompt');
    assertTranscriptRedaction(result.segments);
  });

  it('returns TRANSCRIPT_UNAVAILABLE for empty transcript', () => {
    const result = parseVoiceTranscript('call-1', null);
    expect(result).toEqual({
      callId: 'call-1',
      availability: 'TRANSCRIPT_UNAVAILABLE',
      segments: [],
    });
  });

  it('parses plain text lines with speaker prefixes', () => {
    const result = parseVoiceTranscript(
      'call-1',
      'Customer: Hello\nAgent: Hi there',
    );
    expect(result.segments).toEqual([
      { id: 'seg-1', speaker: 'CUSTOMER', text: 'Hello' },
      { id: 'seg-2', speaker: 'AI_AGENT', text: 'Hi there' },
    ]);
  });
});
