import type { NormalizedCommunicationInput } from '../normalization/communication-normalization.types';

/**
 * Email provider normalization port (Resend lifecycle).
 * Conversation projection remains deferred for Email V1.
 */
export interface EmailProviderNormalizationPort {
  normalizeDeliveryLifecycle(source: unknown): NormalizedCommunicationInput;
}
