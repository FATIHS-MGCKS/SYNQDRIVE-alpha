import {
  createDimoAgentStreamParseState,
  finalizeDimoAgentStreamParse,
  isDimoAgentStreamKeepalive,
  processDimoAgentStreamPayload,
} from './dimo-agent-stream-parser.util';

describe('dimo-agent-stream-parser.util', () => {
  describe('processDimoAgentStreamPayload', () => {
    it('appends standard content token chunks', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload('{"content":"Hello "}', state);
      processDimoAgentStreamPayload('{"content":"World"}', state);
      expect(state.fullResponse).toBe('Hello World');
      expect(finalizeDimoAgentStreamParse(state)).toEqual({
        success: true,
        response: 'Hello World',
      });
    });

    it('appends message_type assistant_message content', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload('{"message_type":"assistant_message","content":"Hello"}', state);
      expect(state.fullResponse).toBe('Hello');
    });

    it('appends type assistant_message content', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload('{"type":"assistant_message","content":"Hello"}', state);
      expect(state.fullResponse).toBe('Hello');
    });

    it('stores done metadata without appending content', () => {
      const state = createDimoAgentStreamParseState();
      const result = processDimoAgentStreamPayload(
        '{"done":true,"agentId":"abc","vehiclesQueried":[872]}',
        state,
      );
      expect(state.fullResponse).toBe('');
      expect(state.metadata).toEqual({
        done: true,
        agentId: 'abc',
        vehiclesQueried: [872],
      });
      expect(result.progress).toBeUndefined();
      expect(finalizeDimoAgentStreamParse(state).success).toBe(false);
    });

    it('handles mixed content chunks followed by done', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload('{"content":"Hello "}', state);
      processDimoAgentStreamPayload('{"content":"World"}', state);
      processDimoAgentStreamPayload('{"done":true,"agentId":"abc","vehiclesQueried":[872]}', state);
      expect(state.fullResponse).toBe('Hello World');
      expect(state.metadata.done).toBe(true);
      expect(state.metadata.agentId).toBe('abc');
      expect(finalizeDimoAgentStreamParse(state)).toEqual({
        success: true,
        response: 'Hello World',
      });
    });

    it('does not append reasoning_message content to fullResponse', () => {
      const state = createDimoAgentStreamParseState();
      const result = processDimoAgentStreamPayload(
        '{"message_type":"reasoning_message","content":"thinking..."}',
        state,
      );
      expect(state.fullResponse).toBe('');
      expect(result.progress).toEqual({ type: 'reasoning_message', content: 'KI denkt nach...' });
    });

    it('ignores invalid JSON without crashing', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload('{"content":"Hi"}', state);
      processDimoAgentStreamPayload('not-json{{{', state);
      expect(state.fullResponse).toBe('Hi');
      expect(finalizeDimoAgentStreamParse(state).success).toBe(true);
    });

    it('captures error payloads', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload('{"error":"Agent unavailable"}', state);
      expect(state.streamError).toBe('Agent unavailable');
      expect(finalizeDimoAgentStreamParse(state)).toEqual({
        success: false,
        error: 'Agent unavailable',
      });
    });

    it('captures typed error events', () => {
      const state = createDimoAgentStreamParseState();
      processDimoAgentStreamPayload(
        '{"message_type":"error","content":"Rate limit exceeded"}',
        state,
      );
      expect(state.streamError).toBe('Rate limit exceeded');
    });
  });

  describe('isDimoAgentStreamKeepalive', () => {
    it('treats ping and empty payloads as keepalive', () => {
      expect(isDimoAgentStreamKeepalive('')).toBe(true);
      expect(isDimoAgentStreamKeepalive('[DONE]')).toBe(true);
      expect(isDimoAgentStreamKeepalive('ping')).toBe(true);
      expect(isDimoAgentStreamKeepalive('keepalive')).toBe(true);
      expect(isDimoAgentStreamKeepalive('{"content":"x"}')).toBe(false);
    });
  });

  describe('SSE line processing (simulated)', () => {
    function feedSseLines(
      state: ReturnType<typeof createDimoAgentStreamParseState>,
      lines: string[],
    ) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (isDimoAgentStreamKeepalive(payload)) continue;
        processDimoAgentStreamPayload(payload, state);
      }
    }

    it('ignores empty lines, comments, and keepalive payloads', () => {
      const state = createDimoAgentStreamParseState();
      feedSseLines(state, [
        '',
        '   ',
        ': sse comment',
        'data: ping',
        'data: keepalive',
        'data: {"content":"Hello "}',
        'data: {"content":"World"}',
      ]);
      expect(state.fullResponse).toBe('Hello World');
      expect(finalizeDimoAgentStreamParse(state)).toEqual({
        success: true,
        response: 'Hello World',
      });
    });

    it('invalid JSON line does not crash and preserves prior content', () => {
      const state = createDimoAgentStreamParseState();
      feedSseLines(state, ['data: {"content":"Hi"}', 'data: not-json']);
      expect(state.fullResponse).toBe('Hi');
      expect(state.streamError).toBeUndefined();
    });
  });
});
