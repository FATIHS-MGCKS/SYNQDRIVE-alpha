import { CommunicationChannel } from '@prisma/client';
import { CommunicationHandoffNotificationAdapter } from './communication-handoff-notification.adapter';

describe('CommunicationHandoffNotificationAdapter', () => {
  const adapter = new CommunicationHandoffNotificationAdapter();

  it('builds deduped candidate per communication event occurrence', () => {
    const candidate = adapter.toCandidate(
      {
        conversationId: 'conv-1',
        communicationEventId: 'evt-1',
        channel: CommunicationChannel.WHATSAPP,
        stationId: 'station-1',
        contactDisplay: 'Customer A',
        handoffReasonCode: 'LOW_CONFIDENCE',
      },
      {
        organizationId: 'org-1',
        sourceRef: 'evt-1',
        occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      },
    );

    expect(candidate?.eventType).toBe('COMMUNICATION_HANDOFF_REQUIRED');
    expect(candidate?.sourceRef).toBe('evt-1');
    expect(candidate?.conditionCode).toBe('handoff_required:evt-1');
    expect(candidate?.actionTarget).toEqual(
      expect.objectContaining({
        type: 'OPEN_COMMUNICATION',
        conversationId: 'conv-1',
        stationId: 'station-1',
      }),
    );
    expect(candidate?.templateParams).toEqual(
      expect.objectContaining({
        contactDisplay: 'Customer A',
        channelLabel: 'WhatsApp',
      }),
    );
  });
});
