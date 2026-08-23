import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
} from '@prisma/client';
import { CommunicationAiActivityService } from './communication-ai-activity.service';
import type { CommunicationAiActivityEventRow } from './communication-ai-activity.mapper';

describe('CommunicationAiActivityService', () => {
  const organizationId = 'org-a';
  const actorUserId = 'user-a';

  const baseConversation = {
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
    stationId: 'station-a',
    assignedUserId: null,
    assignedAgentRef: null,
    assignedAgentType: null,
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
  };

  function makeRow(overrides: Partial<CommunicationAiActivityEventRow>): CommunicationAiActivityEventRow {
    return {
      id: 'evt-1',
      eventType: CommunicationEventType.AI_INTENT_DETECTED,
      occurredAt: new Date('2026-08-23T10:00:00.000Z'),
      providerIdentity: 'META_WHATSAPP',
      metadata: { intentCode: 'PICKUP_INFO' },
      conversation: baseConversation,
      ...overrides,
    };
  }

  const repository = {
    listAiActivity: jest.fn(),
    loadHandoffResolutionMap: jest.fn(),
  };

  const stationAccess = {
    resolve: jest.fn(),
  };

  let service: CommunicationAiActivityService;

  beforeEach(() => {
    jest.clearAllMocks();
    stationAccess.resolve.mockResolvedValue({
      bypassScope: false,
      allowedStationIds: ['station-a'],
    });
    repository.loadHandoffResolutionMap.mockResolvedValue(new Map());
    service = new CommunicationAiActivityService(repository as any, stationAccess as any);
  });

  it('requires station scope from StationAccessService', async () => {
    repository.listAiActivity.mockResolvedValue({
      items: [],
      meta: { limit: 40, nextCursor: null, hasMore: false },
    });

    await service.listAiActivity(organizationId, actorUserId, {});

    expect(stationAccess.resolve).toHaveBeenCalledWith(actorUserId, organizationId);
    expect(repository.listAiActivity).toHaveBeenCalledWith(
      organizationId,
      {},
      expect.objectContaining({
        OR: expect.arrayContaining([
          { stationId: null },
          { stationId: { in: ['station-a'] } },
        ]),
      }),
    );
  });

  it('applies handoffs filter via repository category', async () => {
    repository.listAiActivity.mockResolvedValue({
      items: [],
      meta: { limit: 40, nextCursor: null, hasMore: false },
    });

    await service.listAiActivity(organizationId, actorUserId, { category: 'handoffs' });

    expect(repository.listAiActivity).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ category: 'handoffs' }),
      expect.any(Object),
    );
  });

  it('redacts raw provider payloads from mapped items', async () => {
    repository.listAiActivity.mockResolvedValue({
      items: [
        makeRow({
          metadata: {
            intentCode: 'PICKUP_INFO',
            prompt: 'secret prompt',
            transcript: 'secret transcript',
            toolArgs: { secret: true },
          },
        }),
      ],
      meta: { limit: 40, nextCursor: null, hasMore: false },
    });

    const result = await service.listAiActivity(organizationId, actorUserId, {});

    expect(result.items[0]?.summary).toContain('PICKUP_INFO');
    expect(JSON.stringify(result.items[0])).not.toContain('secret prompt');
    expect(JSON.stringify(result.items[0])).not.toContain('secret transcript');
    expect(JSON.stringify(result.items[0])).not.toContain('toolArgs');
  });

  it('maps historical handoff resolution from repository chronology map', async () => {
    repository.listAiActivity.mockResolvedValue({
      items: [
        makeRow({
          id: 'handoff-a',
          eventType: CommunicationEventType.HUMAN_REQUIRED,
          metadata: { handoffReasonCode: 'LOW_CONFIDENCE' },
        }),
      ],
      meta: { limit: 40, nextCursor: null, hasMore: false },
    });
    repository.loadHandoffResolutionMap.mockResolvedValue(new Map([['handoff-a', true]]));

    const result = await service.listAiActivity(organizationId, actorUserId, {});

    expect(repository.loadHandoffResolutionMap).toHaveBeenCalled();
    expect(result.items[0]?.handoff?.resolved).toBe(true);
  });
});
