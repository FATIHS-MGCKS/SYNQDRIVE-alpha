/**
 * Pure helpers for parsing DIMO Agents API SSE `data:` payloads.
 * Supports token chunks (`{"content":"..."}`), typed assistant messages, done
 * metadata, errors, and keepalive lines — without coupling to HTTP/stream I/O.
 */

export interface DimoAgentStreamMetadata {
  done?: boolean;
  agentId?: string;
  vehiclesQueried?: number[];
}

export interface DimoAgentStreamParseState {
  fullResponse: string;
  metadata: DimoAgentStreamMetadata;
  streamError?: string;
}

export interface DimoAgentStreamProgressEvent {
  type: string;
  content: string;
}

export function createDimoAgentStreamParseState(): DimoAgentStreamParseState {
  return { fullResponse: '', metadata: {} };
}

/** Returns true when the payload is a no-op keepalive / ping line. */
export function isDimoAgentStreamKeepalive(payload: string): boolean {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === '[DONE]') return true;
  const lower = trimmed.toLowerCase();
  return lower === 'ping' || lower === 'keepalive' || lower === 'keep-alive';
}

/**
 * Process one SSE `data:` payload (without the `data:` prefix).
 * Mutates `state` in place and optionally returns a progress event for UI hooks.
 */
export function processDimoAgentStreamPayload(
  payload: string,
  state: DimoAgentStreamParseState,
): { progress?: DimoAgentStreamProgressEvent } {
  if (isDimoAgentStreamKeepalive(payload)) return {};

  try {
    const parsed = JSON.parse(payload.trim()) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const streamErr = extractStreamError(parsed);
    if (streamErr) {
      state.streamError = streamErr;
      return {};
    }

    if (parsed.done === true) {
      state.metadata.done = true;
      if (typeof parsed.agentId === 'string' && parsed.agentId) {
        state.metadata.agentId = parsed.agentId;
      }
      if (Array.isArray(parsed.vehiclesQueried)) {
        state.metadata.vehiclesQueried = parsed.vehiclesQueried.filter(
          (v): v is number => typeof v === 'number',
        );
      }
      return {};
    }

    const msgType = String(parsed.message_type || parsed.type || '');
    const content = extractStreamContent(parsed);

    if (shouldAppendStreamContent(msgType, content)) {
      state.fullResponse += content;
    }

    const progress = buildStreamProgressEvent(msgType, parsed);
    return progress ? { progress } : {};
  } catch {
    // Non-JSON payloads are ignored — do not corrupt accumulated response text.
    return {};
  }
}

export function finalizeDimoAgentStreamParse(state: DimoAgentStreamParseState): {
  success: boolean;
  response?: string;
  error?: string;
} {
  if (state.streamError) {
    return { success: false, error: state.streamError };
  }
  if (state.fullResponse) {
    return { success: true, response: state.fullResponse };
  }
  return { success: false, error: 'Empty stream — no content received from agent' };
}

function extractStreamContent(parsed: Record<string, unknown>): string {
  for (const key of ['content', 'text', 'message'] as const) {
    const v = parsed[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function shouldAppendStreamContent(msgType: string, content: string): boolean {
  if (!content) return false;
  // Standard DIMO token chunks have no message_type / type.
  if (!msgType) return true;
  return msgType === 'assistant_message';
}

function extractStreamError(parsed: Record<string, unknown>): string | undefined {
  const msgType = String(parsed.message_type || parsed.type || '');
  if (msgType === 'error') {
    const fromContent = extractStreamContent(parsed);
    if (fromContent) return fromContent;
  }

  const err = parsed.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }

  if (typeof parsed.message === 'string' && msgType === 'error') {
    return parsed.message.trim() || undefined;
  }

  return undefined;
}

function buildStreamProgressEvent(
  msgType: string,
  parsed: Record<string, unknown>,
): DimoAgentStreamProgressEvent | undefined {
  const label =
    msgType === 'reasoning_message'
      ? 'KI denkt nach...'
      : msgType === 'tool_call_message'
        ? `Tool: ${(parsed.tool_call as Record<string, unknown> | undefined)?.name || 'Datenabfrage'}`
        : msgType === 'tool_return_message'
          ? 'Daten empfangen'
          : msgType === 'assistant_message'
            ? ''
            : msgType;

  if (!label) return undefined;
  return { type: msgType, content: label };
}
