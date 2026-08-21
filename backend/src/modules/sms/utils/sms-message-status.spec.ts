import { SmsMessageDeliveryStatus } from '@prisma/client';
import { mapSentDmLifecycleToNativeStatus, shouldApplyNativeDeliveryTransition, eligibleCurrentStatusesForDeliveryTransition } from './sms-message-status';

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

  it('eligible statuses for DELIVERED exclude DELIVERED itself', () => {
    const eligible = eligibleCurrentStatusesForDeliveryTransition(SmsMessageDeliveryStatus.DELIVERED);
    expect(eligible).toContain(SmsMessageDeliveryStatus.QUEUED);
    expect(eligible).toContain(SmsMessageDeliveryStatus.SENT);
    expect(eligible).not.toContain(SmsMessageDeliveryStatus.DELIVERED);
  });
});
