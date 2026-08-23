export type CommunicationVoiceTranscriptSpeaker =
  | 'CUSTOMER'
  | 'AI_AGENT'
  | 'HUMAN_OPERATOR'
  | 'UNKNOWN';

export interface CommunicationVoiceTranscriptSegment {
  id: string;
  speaker: CommunicationVoiceTranscriptSpeaker;
  text: string;
  occurredAt?: string;
}

export type CommunicationVoiceTranscriptAvailability =
  | 'AVAILABLE'
  | 'TRANSCRIPT_UNAVAILABLE';

export interface CommunicationVoiceTranscriptResult {
  callId: string;
  availability: CommunicationVoiceTranscriptAvailability;
  segments: CommunicationVoiceTranscriptSegment[];
}

const SPEAKER_ALIASES: Record<string, CommunicationVoiceTranscriptSpeaker> = {
  user: 'CUSTOMER',
  customer: 'CUSTOMER',
  caller: 'CUSTOMER',
  client: 'CUSTOMER',
  human: 'CUSTOMER',
  agent: 'AI_AGENT',
  assistant: 'AI_AGENT',
  ai: 'AI_AGENT',
  bot: 'AI_AGENT',
  system: 'AI_AGENT',
  operator: 'HUMAN_OPERATOR',
  staff: 'HUMAN_OPERATOR',
  employee: 'HUMAN_OPERATOR',
};

const REDACTED_FIELD_PATTERN =
  /(?:prompt|reasoning|tool|argument|payload|secret|token|authorization|api[_-]?key|signed[_-]?url|recording[_-]?url)/i;

export function normalizeVoiceTranscriptSpeaker(
  raw: unknown,
): CommunicationVoiceTranscriptSpeaker {
  if (typeof raw !== 'string' || !raw.trim()) return 'UNKNOWN';
  const key = raw.trim().toLowerCase();
  return SPEAKER_ALIASES[key] ?? 'UNKNOWN';
}

function isRedactedTranscriptField(key: string): boolean {
  return REDACTED_FIELD_PATTERN.test(key);
}

function sanitizeSegmentText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 8_000) {
    return `${trimmed.slice(0, 8_000)}…`;
  }
  return trimmed;
}

function segmentId(index: number): string {
  return `seg-${index + 1}`;
}

function parseTranscriptObjectArray(
  value: unknown[],
  callStartedAt?: Date | null,
): CommunicationVoiceTranscriptSegment[] {
  const segments: CommunicationVoiceTranscriptSegment[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    const record = entry as Record<string, unknown>;
    const text =
      sanitizeSegmentText(record.message)
      ?? sanitizeSegmentText(record.text)
      ?? sanitizeSegmentText(record.content);
    if (!text) continue;

    const speaker = normalizeVoiceTranscriptSpeaker(
      record.role ?? record.speaker ?? record.type,
    );

    let occurredAt: string | undefined;
    const timeInCall =
      typeof record.time_in_call_secs === 'number'
        ? record.time_in_call_secs
        : typeof record.timeInCallSecs === 'number'
          ? record.timeInCallSecs
          : null;
    if (callStartedAt && timeInCall != null && Number.isFinite(timeInCall)) {
      occurredAt = new Date(callStartedAt.getTime() + timeInCall * 1000).toISOString();
    } else if (typeof record.timestamp === 'string') {
      occurredAt = record.timestamp;
    } else if (typeof record.occurredAt === 'string') {
      occurredAt = record.occurredAt;
    }

    segments.push({
      id: segmentId(segments.length),
      speaker,
      text,
      ...(occurredAt ? { occurredAt } : {}),
    });
  }

  return segments;
}

function parsePlainTranscriptLines(text: string): CommunicationVoiceTranscriptSegment[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const segments: CommunicationVoiceTranscriptSegment[] = [];
  const linePattern = /^(user|customer|caller|agent|assistant|ai|operator|human)\s*:\s*(.+)$/i;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (match) {
      const textPart = sanitizeSegmentText(match[2]);
      if (!textPart) continue;
      segments.push({
        id: segmentId(segments.length),
        speaker: normalizeVoiceTranscriptSpeaker(match[1]),
        text: textPart,
      });
      continue;
    }

    const sanitized = sanitizeSegmentText(line);
    if (!sanitized) continue;
    segments.push({
      id: segmentId(segments.length),
      speaker: 'UNKNOWN',
      text: sanitized,
    });
  }

  return segments;
}

export function parseVoiceTranscript(
  callId: string,
  transcript: string | null | undefined,
  callStartedAt?: Date | null,
): CommunicationVoiceTranscriptResult {
  if (!transcript?.trim()) {
    return {
      callId,
      availability: 'TRANSCRIPT_UNAVAILABLE',
      segments: [],
    };
  }

  const trimmed = transcript.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const segments = parseTranscriptObjectArray(parsed, callStartedAt);
        if (segments.length > 0) {
          return { callId, availability: 'AVAILABLE', segments };
        }
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const messages = record.messages ?? record.turns ?? record.segments;
        if (Array.isArray(messages)) {
          const segments = parseTranscriptObjectArray(messages, callStartedAt);
          if (segments.length > 0) {
            return { callId, availability: 'AVAILABLE', segments };
          }
        }
      }
    } catch {
      // fall through to plain-text parsing
    }
  }

  const lineSegments = parsePlainTranscriptLines(trimmed);
  if (lineSegments.length > 0) {
    return { callId, availability: 'AVAILABLE', segments: lineSegments };
  }

  const fallback = sanitizeSegmentText(trimmed);
  if (!fallback) {
    return { callId, availability: 'TRANSCRIPT_UNAVAILABLE', segments: [] };
  }

  return {
    callId,
    availability: 'AVAILABLE',
    segments: [{ id: segmentId(0), speaker: 'UNKNOWN', text: fallback }],
  };
}

/** Test helper — ensures provider payload keys never leak into normalized segments. */
export function assertTranscriptRedaction(segments: CommunicationVoiceTranscriptSegment[]): void {
  for (const segment of segments) {
    const serialized = JSON.stringify(segment);
    for (const forbidden of ['tool_arguments', 'system_prompt', 'rawPayload', 'elevenLabs']) {
      if (serialized.toLowerCase().includes(forbidden.toLowerCase())) {
        throw new Error(`Transcript redaction leak: ${forbidden}`);
      }
    }
    if (isRedactedTranscriptField(segment.text)) {
      throw new Error('Transcript segment contains redacted field name');
    }
  }
}
