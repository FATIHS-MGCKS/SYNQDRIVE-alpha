import {
  classifyNativeWhatsAppFailureReason,
  classifyReplyError,
  CommunicationReplyOutcomeClass,
} from './communication-reply-outcome';
import { CommunicationReplyError } from './communication-reply.errors';

describe('communication-reply-outcome', () => {
  it('classifies transport timeout as UNKNOWN', () => {
    expect(
      classifyReplyError(new Error('socket hang up ECONNRESET')),
    ).toBe(CommunicationReplyOutcomeClass.UNKNOWN);
  });

  it('classifies provider not configured as NOT_CONFIGURED', () => {
    expect(
      classifyReplyError(CommunicationReplyError.channelNotConfigured()),
    ).toBe(CommunicationReplyOutcomeClass.NOT_CONFIGURED);
  });

  it('classifies template required as TEMPLATE_REQUIRED', () => {
    expect(
      classifyReplyError(CommunicationReplyError.templateRequired()),
    ).toBe(CommunicationReplyOutcomeClass.TEMPLATE_REQUIRED);
  });

  it('classifies definitive native failure reasons', () => {
    expect(
      classifyNativeWhatsAppFailureReason('WHATSAPP_PROVIDER_NOT_CONFIGURED'),
    ).toBe(CommunicationReplyOutcomeClass.NOT_CONFIGURED);
    expect(
      classifyNativeWhatsAppFailureReason('WHATSAPP_FREE_TEXT_BLOCKED'),
    ).toBe(CommunicationReplyOutcomeClass.TEMPLATE_REQUIRED);
  });

  it('classifies ambiguous native transport failure as UNKNOWN', () => {
    expect(
      classifyNativeWhatsAppFailureReason('fetch failed: timeout'),
    ).toBe(CommunicationReplyOutcomeClass.UNKNOWN);
  });
});
