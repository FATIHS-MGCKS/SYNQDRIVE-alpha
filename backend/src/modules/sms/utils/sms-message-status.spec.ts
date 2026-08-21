import { SmsMessageDeliveryStatus } from '@prisma/client';
import { mapSentDmLifecycleToNativeStatus, shouldApplyNativeDeliveryTransition } from './sms-message-status';

describe('sms-message-status', () => {
  it('maps sent.dm lifecycle names', () => {
    expect(mapSentDmLifecycleToNativeStatus('DELIVERED')).toBe(SmsMessageDeliveryStatus.DELIVERED);
    expect(mapSentDmLifecycleToNativeStatus('FAILED')).toBe(SmsMessageDeliveryStatus.FAILED);
  });

  it('does not downgrade DELIVERED to SENT', () => {
    expect(
      shouldApplyNativeDeliveryTransition(
        SmsMessageDeliveryStatus.DELIVERED,
        SmsMessageDeliveryStatus.SENT,
      ),
    ).toBe(false);
  });

  it('advances QUEUED to SENT', () => {
    expect(
      shouldApplyNativeDeliveryTransition(
        SmsMessageDeliveryStatus.QUEUED,
        SmsMessageDeliveryStatus.SENT,
      ),
    ).toBe(true);
  });
});
