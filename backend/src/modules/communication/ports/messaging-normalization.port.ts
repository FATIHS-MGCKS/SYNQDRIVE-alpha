import type { NormalizedCommunicationInput } from '../normalization/communication-normalization.types';

/**
 * Messaging provider normalization port (Meta WhatsApp, future sent.dm WhatsApp if enabled).
 * C2 defines the contract only — concrete adapters arrive in C3/C5.
 */
export interface MessagingProviderNormalizationPort {
  normalizeInbound(source: unknown): NormalizedCommunicationInput;
  normalizeOutboundAccepted(source: unknown): NormalizedCommunicationInput;
  normalizeDeliveryUpdate(source: unknown): NormalizedCommunicationInput;
  normalizeFailure(source: unknown): NormalizedCommunicationInput;
}
