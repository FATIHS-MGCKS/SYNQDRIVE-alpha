import {
  collectForbiddenPublicKeys,
  mapCommunicationEvent,
  mapConversationListItem,
  resolveConversationDisplayLabel,
  UNKNOWN_CONTACT_DISPLAY_LABEL,
} from './communication-read.mapper';

describe('communication-read.mapper', () => {
  const baseRow = {
    id: 'conv-1',
    channel: 'WHATSAPP' as const,
    status: 'AI_ACTIVE' as const,
    lastActivityAt: new Date('2026-08-21T12:00:00.000Z'),
    unreadCount: 2,
    createdAt: new Date('2026-08-21T10:00:00.000Z'),
    updatedAt: new Date('2026-08-21T12:00:00.000Z'),
    metadata: { intentCode: 'BOOKING' },
    customerId: 'cust-1',
    bookingId: null,
    vehicleId: null,
    stationId: null,
    assignedUserId: null,
    assignedAgentRef: null,
    assignedAgentType: null,
    customer: {
      id: 'cust-1',
      firstName: 'Max',
      lastName: 'Mustermann',
      company: null,
      archivedAt: null,
    },
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
  };

  it('maps list item with customer display label', () => {
    const dto = mapConversationListItem(baseRow);
    expect(dto.displayLabel).toBe('Max Mustermann');
    expect(dto.unreadCount).toBe(2);
  });

  it('falls back to unknown contact without leaking phone', () => {
    const dto = mapConversationListItem({
      ...baseRow,
      customer: null,
      customerId: null,
      metadata: { phone: '+491234', displayLabel: '+491234' } as never,
    });
    expect(dto.displayLabel).toBe(UNKNOWN_CONTACT_DISPLAY_LABEL);
    expect(resolveConversationDisplayLabel({ ...baseRow, customer: null })).toBe(
      UNKNOWN_CONTACT_DISPLAY_LABEL,
    );
  });

  it('allowlists event metadata and strips forbidden keys', () => {
    const dto = mapCommunicationEvent({
      id: 'evt-1',
      eventType: 'MESSAGE_RECEIVED',
      direction: 'INBOUND',
      actorType: 'CUSTOMER',
      occurredAt: new Date('2026-08-21T12:00:00.000Z'),
      providerIdentity: 'META_WHATSAPP',
      metadata: {
        intentCode: 'SUPPORT',
        phone: '+49123',
        transcript: 'secret',
        rawPayload: { a: 1 },
      },
    });
    expect(dto.metadata).toEqual({ intentCode: 'SUPPORT' });
    const forbidden = collectForbiddenPublicKeys(dto);
    expect(forbidden).toEqual([]);
  });

  it('clamps negative unread counts to zero', () => {
    const dto = mapConversationListItem({ ...baseRow, unreadCount: -1 });
    expect(dto.unreadCount).toBe(0);
  });
});
