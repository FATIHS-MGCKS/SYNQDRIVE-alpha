import type { NormalizedCommunicationInput } from '../normalization/communication-normalization.types';

/**
 * Conversational AI voice provider normalization port (ElevenLabs agent events).
 */
export interface ConversationalVoiceProviderNormalizationPort {
  normalizeAiIntent(source: unknown): NormalizedCommunicationInput;
  normalizeAiAction(source: unknown): NormalizedCommunicationInput;
  normalizeEscalationSignal(source: unknown): NormalizedCommunicationInput;
  normalizeAgentLifecycle(source: unknown): NormalizedCommunicationInput;
}
