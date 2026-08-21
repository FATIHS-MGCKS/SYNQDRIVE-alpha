import { CommunicationChannel, CommunicationProviderIdentity } from '@prisma/client';
import {
  assertProviderSupportsChannel,
  getProviderChannels,
} from './communication-provider-capability.registry';
import { CommunicationNormalizationErrorCode } from './communication-normalization.errors';

describe('communication provider capability registry', () => {
  it('maps META_WHATSAPP to WHATSAPP only', () => {
    expect(getProviderChannels(CommunicationProviderIdentity.META_WHATSAPP)).toEqual([
      CommunicationChannel.WHATSAPP,
    ]);
  });

  it('maps TWILIO and ELEVENLABS to VOICE', () => {
    expect(getProviderChannels(CommunicationProviderIdentity.TWILIO)).toEqual([
      CommunicationChannel.VOICE,
    ]);
    expect(getProviderChannels(CommunicationProviderIdentity.ELEVENLABS)).toEqual([
      CommunicationChannel.VOICE,
    ]);
  });

  it('rejects TWILIO on WHATSAPP channel', () => {
    try {
      assertProviderSupportsChannel(
        CommunicationProviderIdentity.TWILIO,
        CommunicationChannel.WHATSAPP,
      );
      fail('expected rejection');
    } catch (error: any) {
      expect(error.code).toBe(CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT);
    }
  });
});
