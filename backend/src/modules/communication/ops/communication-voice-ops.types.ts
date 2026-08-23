import type { CommunicationVoiceTranscriptSegment } from './communication-voice-transcript.util';

export type CommunicationVoiceCallDirection = 'INBOUND' | 'OUTBOUND';

export type CommunicationVoiceCallStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED';

export type CommunicationVoiceCallOutcome =
  | 'PENDING'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'FAILED'
  | 'ABANDONED';

export type CommunicationVoiceCallFailureState = 'CALL_FAILED';

export interface CommunicationVoiceCallDetailDto {
  callId: string;
  conversationId: string;
  direction: CommunicationVoiceCallDirection;
  status: CommunicationVoiceCallStatus;
  outcome: CommunicationVoiceCallOutcome;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  summaryAvailable: boolean;
  escalationReason?: string | null;
  escalated: boolean;
  hasTranscript: boolean;
  transcriptAvailability: 'AVAILABLE' | 'TRANSCRIPT_UNAVAILABLE';
  failureState?: CommunicationVoiceCallFailureState | null;
  maskedCallerNumber?: string | null;
  linkedTaskId?: string | null;
}

export interface CommunicationVoiceCallTranscriptDto {
  callId: string;
  availability: 'AVAILABLE' | 'TRANSCRIPT_UNAVAILABLE';
  segments: CommunicationVoiceTranscriptSegment[];
}
