import { CommunicationChannel, CommunicationProviderIdentity } from '@prisma/client';
import { CommunicationNormalizationError, CommunicationNormalizationErrorCode } from './communication-normalization.errors';

/**
 * V1 enabled provider→channel capabilities.
 * Extensible registry — not a statement of all future provider capabilities.
 */
export const PROVIDER_CHANNEL_CAPABILITIES: Readonly<
  Record<CommunicationProviderIdentity, readonly CommunicationChannel[]>
> = {
  [CommunicationProviderIdentity.META_WHATSAPP]: [CommunicationChannel.WHATSAPP],
  [CommunicationProviderIdentity.SENT_DM]: [CommunicationChannel.SMS],
  [CommunicationProviderIdentity.TWILIO]: [CommunicationChannel.VOICE],
  [CommunicationProviderIdentity.ELEVENLABS]: [CommunicationChannel.VOICE],
  [CommunicationProviderIdentity.RESEND]: [CommunicationChannel.EMAIL],
};

export function getProviderChannels(
  providerIdentity: CommunicationProviderIdentity,
): readonly CommunicationChannel[] {
  return PROVIDER_CHANNEL_CAPABILITIES[providerIdentity] ?? [];
}

export function assertProviderSupportsChannel(
  providerIdentity: CommunicationProviderIdentity,
  channel: CommunicationChannel,
): void {
  const allowed = getProviderChannels(providerIdentity);
  if (!allowed.includes(channel)) {
    throw new CommunicationNormalizationError(
      CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT,
      `provider ${providerIdentity} does not support channel ${channel} in V1 capability registry`,
    );
  }
}

export function isEmailConversationProjectionDeferred(channel: CommunicationChannel): boolean {
  return channel === CommunicationChannel.EMAIL;
}
