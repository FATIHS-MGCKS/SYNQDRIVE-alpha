import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { buildCanonicalIdempotencyKey } from './communication-idempotency';

describe('buildCanonicalIdempotencyKey', () => {
  const base = {
    organizationId: 'org-1',
    channel: CommunicationChannel.WHATSAPP,
    providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
    eventType: CommunicationEventType.MESSAGE_RECEIVED,
    nativeConversationId: 'wa-native-1',
  };

  it('is deterministic for the same input', () => {
    const a = buildCanonicalIdempotencyKey({
      ...base,
      providerMessageId: 'wamid-1',
    });
    const b = buildCanonicalIdempotencyKey({
      ...base,
      providerMessageId: 'wamid-1',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^cc1:[a-f0-9]{64}$/);
  });

  it('differs by event type when sharing providerMessageId', () => {
    const delivered = buildCanonicalIdempotencyKey({
      ...base,
      eventType: CommunicationEventType.MESSAGE_DELIVERED,
      providerMessageId: 'wamid-shared',
    });
    const read = buildCanonicalIdempotencyKey({
      ...base,
      eventType: CommunicationEventType.MESSAGE_READ,
      providerMessageId: 'wamid-shared',
    });
    expect(delivered).not.toBe(read);
  });

  it('differs by providerEventId', () => {
    const a = buildCanonicalIdempotencyKey({
      ...base,
      channel: CommunicationChannel.VOICE,
      providerIdentity: CommunicationProviderIdentity.TWILIO,
      eventType: CommunicationEventType.CALL_STARTED,
      providerEventId: 'CA111',
    });
    const b = buildCanonicalIdempotencyKey({
      ...base,
      channel: CommunicationChannel.VOICE,
      providerIdentity: CommunicationProviderIdentity.TWILIO,
      eventType: CommunicationEventType.CALL_STARTED,
      providerEventId: 'CA222',
    });
    expect(a).not.toBe(b);
  });

  it('treats colon-containing providerEventId as unambiguous via digest', () => {
    const withColons = buildCanonicalIdempotencyKey({
      ...base,
      channel: CommunicationChannel.VOICE,
      providerIdentity: CommunicationProviderIdentity.TWILIO,
      eventType: CommunicationEventType.CALL_CONNECTED,
      providerEventId: 'CA1:status:ringing',
    });
    const withoutColons = buildCanonicalIdempotencyKey({
      ...base,
      channel: CommunicationChannel.VOICE,
      providerIdentity: CommunicationProviderIdentity.TWILIO,
      eventType: CommunicationEventType.CALL_CONNECTED,
      providerEventId: 'CA1statusringing',
    });
    expect(withColons).toMatch(/^cc1:[a-f0-9]{64}$/);
    expect(withColons).not.toBe(withoutColons);
  });

  it('does not embed PII/content in key', () => {
    const key = buildCanonicalIdempotencyKey({
      ...base,
      providerMessageId: 'wamid-abc',
    });
    expect(key).not.toMatch(/hello|\+49|customer@/i);
    expect(key).not.toContain('wamid-abc');
  });
});
