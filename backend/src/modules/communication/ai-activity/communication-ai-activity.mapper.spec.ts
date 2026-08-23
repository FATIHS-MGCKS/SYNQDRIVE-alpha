import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
} from '@prisma/client';
import {
  buildAiActivitySummary,
  buildHandoffDto,
  mapAiActivityEventRow,
  mapAiActivityType,
  mapToolOutcome,
} from './communication-ai-activity.mapper';

describe('communication-ai-activity.mapper', () => {
  const conversation = {
    id: 'conv-1',
    channel: CommunicationChannel.WHATSAPP,
    status: CommunicationConversationStatus.HUMAN_REQUIRED,
    lastActivityAt: new Date('2026-08-23T10:00:00.000Z'),
    unreadCount: 1,
    lastContentAt: null,
    lastMessagePreview: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: null,
    customerId: null,
    bookingId: null,
    vehicleId: null,
    stationId: 'station-1',
    assignedUserId: null,
    assignedAgentRef: null,
    assignedAgentType: null,
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
  };

  it('maps handoff requested activity', () => {
    const item = mapAiActivityEventRow({
      id: 'evt-1',
      eventType: CommunicationEventType.HUMAN_REQUIRED,
      occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      providerIdentity: 'META_WHATSAPP',
      metadata: { handoffReasonCode: 'LOW_CONFIDENCE' },
      conversation,
    });

    expect(item.activityType).toBe('HANDOFF_REQUESTED');
    expect(item.handoff?.requested).toBe(true);
    expect(item.handoff?.reason).toBe('LOW_CONFIDENCE');
    expect(item.agent.displayName).toBe('WhatsApp AI');
  });

  it('maps tool failure outcome', () => {
    expect(mapToolOutcome(CommunicationEventType.AI_ACTION_FAILED)).toBe('FAILED');
    expect(mapAiActivityType(CommunicationEventType.AI_ACTION_COMPLETED)).toBe('AI_TOOL');
  });

  it('builds safe summaries without raw prompts', () => {
    const summary = buildAiActivitySummary(
      CommunicationEventType.AI_ACTION_FAILED,
      { toolName: 'vehicle_lookup' },
      CommunicationChannel.VOICE,
    );
    expect(summary).toContain('vehicle_lookup');
    expect(summary.toLowerCase()).not.toContain('prompt');
  });

  it('marks handoff resolved when conversation is human active', () => {
    const handoff = buildHandoffDto(
      CommunicationEventType.HUMAN_REQUIRED,
      { handoffReasonCode: 'CUSTOMER_REQUEST' },
      {
        ...conversation,
        status: CommunicationConversationStatus.HUMAN_ACTIVE,
        assignedUser: { id: 'u1', name: 'Alex Operator', firstName: null, lastName: null },
      },
    );
    expect(handoff?.resolved).toBe(true);
  });
});
