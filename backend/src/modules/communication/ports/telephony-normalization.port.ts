import type { NormalizedCommunicationInput } from '../normalization/communication-normalization.types';

/**
 * Telephony provider normalization port (Twilio voice lifecycle).
 */
export interface TelephonyProviderNormalizationPort {
  normalizeCallStarted(source: unknown): NormalizedCommunicationInput;
  normalizeCallConnected(source: unknown): NormalizedCommunicationInput;
  normalizeCallEnded(source: unknown): NormalizedCommunicationInput;
  normalizeCallFailed(source: unknown): NormalizedCommunicationInput;
}
