import { CommunicationEventType } from '@prisma/client';
import {
  BACKFILL_BATCH_SIZE_MAX,
  BACKFILL_BATCH_SIZE_MIN,
  buildBackfillEventMatchOr,
  validateBackfillBatchSize,
} from './communication-content-backfill.util';

describe('communication-content-backfill.util', () => {
  it('validates batch size bounds', () => {
    expect(validateBackfillBatchSize(undefined)).toBe(100);
    expect(validateBackfillBatchSize(1)).toBe(1);
    expect(validateBackfillBatchSize(500)).toBe(500);
    expect(() => validateBackfillBatchSize(0)).toThrow();
    expect(() => validateBackfillBatchSize(-1)).toThrow();
    expect(() => validateBackfillBatchSize(501)).toThrow();
    expect(() => validateBackfillBatchSize(NaN)).toThrow();
    expect(() => validateBackfillBatchSize(1.5)).toThrow();
    expect(BACKFILL_BATCH_SIZE_MIN).toBe(1);
    expect(BACKFILL_BATCH_SIZE_MAX).toBe(500);
  });

  it('builds WhatsApp inbound match clauses', () => {
    const clauses = buildBackfillEventMatchOr({
      channel: 'WHATSAPP',
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      nativeMessageId: 'native-1',
      providerMessageId: 'wamid.abc',
    });
    expect(clauses).toEqual(
      expect.arrayContaining([
        { providerMessageId: 'wamid.abc' },
        { providerEventId: 'wa-msg:native-1' },
      ]),
    );
  });

  it('builds WhatsApp outbound match clauses', () => {
    const clauses = buildBackfillEventMatchOr({
      channel: 'WHATSAPP',
      eventType: CommunicationEventType.MESSAGE_SENT,
      nativeMessageId: 'native-2',
      providerMessageId: null,
    });
    expect(clauses).toEqual([{ providerEventId: 'wa-sent:native-2' }]);
  });

  it('builds SMS outbound match clauses', () => {
    const clauses = buildBackfillEventMatchOr({
      channel: 'SMS',
      eventType: CommunicationEventType.MESSAGE_SENT,
      nativeMessageId: 'sms-native-1',
      providerMessageId: 'prov-1',
    });
    expect(clauses).toEqual(
      expect.arrayContaining([
        { providerMessageId: 'prov-1' },
        { providerEventId: 'sms-sent:sms-native-1' },
      ]),
    );
  });

  it('SMS inbound without providerMessageId has no synthetic fallback', () => {
    const clauses = buildBackfillEventMatchOr({
      channel: 'SMS',
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      nativeMessageId: 'sms-native-2',
      providerMessageId: null,
    });
    expect(clauses).toHaveLength(0);
  });
});
