import { BadRequestException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { CommunicationProjectionService } from './communication-projection.service';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';
import { buildCanonicalIdempotencyKey } from './normalization/communication-idempotency';
import { CommunicationNormalizationErrorCode } from './normalization/communication-normalization.errors';
import type { NormalizedCommunicationInput } from './normalization/communication-normalization.types';

function makePrisma() {
  const tx = {};
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as any;
}

function baseConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cc-1',
    organizationId: 'org-1',
    channel: CommunicationChannel.WHATSAPP,
    nativeConversationId: 'wa-1',
    lastActivityAt: new Date('2026-08-21T10:00:00Z'),
    unreadCount: 0,
    customerId: null,
    bookingId: null,
    vehicleId: null,
    stationId: null,
    assignedUserId: null,
    assignedAgentRef: null,
    assignedAgentType: null,
    ...overrides,
  } as any;
}

function whatsappEvent(
  providerEventId: string,
  eventType: CommunicationEventType = CommunicationEventType.MESSAGE_RECEIVED,
): NormalizedCommunicationInput['event'] {
  return {
    eventType,
    occurredAt: new Date('2026-08-21T10:00:00Z'),
    providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
    providerEventId,
    idempotencyKey: buildCanonicalIdempotencyKey({
      organizationId: 'org-1',
      channel: CommunicationChannel.WHATSAPP,
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
      eventType,
      nativeConversationId: 'wa-1',
      providerEventId,
    }),
  };
}

function voiceInput(
  provider: CommunicationProviderIdentity,
  eventType: CommunicationEventType,
  providerEventId: string,
  nativeConversationId = 'voice-native-1',
): NormalizedCommunicationInput {
  return {
    envelope: {
      organizationId: 'org-1',
      channel: CommunicationChannel.VOICE,
      nativeConversationId,
    },
    event: {
      eventType,
      occurredAt: new Date('2026-08-21T12:00:00Z'),
      providerIdentity: provider,
      providerEventId,
      idempotencyKey: buildCanonicalIdempotencyKey({
        organizationId: 'org-1',
        channel: CommunicationChannel.VOICE,
        providerIdentity: provider,
        eventType,
        nativeConversationId,
        providerEventId,
      }),
    },
  };
}

describe('CommunicationProjectionService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let conversations: jest.Mocked<CommunicationConversationRepository>;
  let events: jest.Mocked<CommunicationEventRepository>;
  let tenantContext: jest.Mocked<CommunicationTenantContextValidation>;
  let service: CommunicationProjectionService;

  beforeEach(() => {
    prisma = makePrisma();
    conversations = {
      ensureConversationEnvelope: jest.fn(),
      updateConversationProjection: jest.fn(),
      bumpLastActivityAt: jest.fn(),
      incrementUnreadCount: jest.fn(),
    } as unknown as jest.Mocked<CommunicationConversationRepository>;
    events = {
      appendEventIdempotently: jest.fn(),
    } as unknown as jest.Mocked<CommunicationEventRepository>;
    tenantContext = {
      assertConversationContextBelongsToOrg: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CommunicationTenantContextValidation>;
    conversations.updateConversationProjection.mockImplementation(
      async (_org, id, patch) => ({ ...baseConversation({ id }), ...patch }) as any,
    );
    conversations.bumpLastActivityAt.mockImplementation(
      async (_org, id, candidate) =>
        ({ ...baseConversation({ id }), lastActivityAt: candidate }) as any,
    );
    conversations.incrementUnreadCount.mockImplementation(
      async (_org, id, delta) =>
        ({ ...baseConversation({ id }), unreadCount: delta }) as any,
    );
    service = new CommunicationProjectionService(prisma, conversations, events, tenantContext);
  });

  it('uses atomic incrementUnreadCount for unreadDelta on newly-created events', async () => {
    const conversation = baseConversation();
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation,
      created: true,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });
    conversations.incrementUnreadCount.mockResolvedValue({
      ...conversation,
      unreadCount: 1,
    });

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: whatsappEvent('evt-wa-1'),
      projection: { unreadDelta: 1 },
    });

    expect(conversations.incrementUnreadCount).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      1,
      expect.anything(),
    );
    expect(conversations.updateConversationProjection).not.toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ unreadCount: expect.anything() }),
      expect.anything(),
    );
  });

  it('replay does not call incrementUnreadCount', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation({ unreadCount: 3 }),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-existing' } as any,
      created: false,
    });

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: whatsappEvent('evt-replay'),
      projection: { unreadDelta: 1 },
    });

    expect(conversations.incrementUnreadCount).not.toHaveBeenCalled();
  });

  it('enriches existing envelope when initialContext supplies customerId', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation(),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });
    conversations.updateConversationProjection.mockResolvedValue(
      baseConversation({ customerId: 'cust-1' }),
    );

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        initialContext: { customerId: 'cust-1' },
      },
      event: whatsappEvent('evt-context-1'),
    });

    expect(tenantContext.assertConversationContextBelongsToOrg).toHaveBeenCalledWith(
      'org-1',
      { customerId: 'cust-1' },
      expect.anything(),
    );
    expect(conversations.updateConversationProjection).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ customerId: 'cust-1' }),
      expect.anything(),
    );
  });

  it('snapshots resolved context on the event before projection update', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation(),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });
    conversations.updateConversationProjection.mockResolvedValue(
      baseConversation({ customerId: 'cust-1', bookingId: 'book-1' }),
    );

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        initialContext: { customerId: 'cust-1', bookingId: 'book-1' },
      },
      event: whatsappEvent('evt-snapshot-1'),
    });

    expect(events.appendEventIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        bookingId: 'book-1',
      }),
      expect.anything(),
    );
  });

  it('undefined initialContext does not clear existing customerId', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation({ customerId: 'cust-existing' }),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        initialContext: { bookingId: 'book-1' },
      },
      event: whatsappEvent('evt-partial-1'),
    });

    expect(events.appendEventIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-existing',
        bookingId: 'book-1',
      }),
      expect.anything(),
    );
    expect(conversations.updateConversationProjection).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ bookingId: 'book-1' }),
      expect.anything(),
    );
    expect(conversations.updateConversationProjection).not.toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ customerId: null }),
      expect.anything(),
    );
  });

  it('explicit null in initialContext clears existing customerId', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation({ customerId: 'cust-existing' }),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });
    conversations.updateConversationProjection.mockResolvedValue(
      baseConversation({ customerId: null }),
    );

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        initialContext: { customerId: null },
      },
      event: whatsappEvent('evt-clear-1'),
    });

    expect(events.appendEventIdempotently).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null }),
      expect.anything(),
    );
    expect(conversations.updateConversationProjection).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ customerId: null }),
      expect.anything(),
    );
  });

  it('rejects cross-org context at tenant validation boundary', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation(),
      created: false,
    });
    tenantContext.assertConversationContextBelongsToOrg.mockRejectedValue(
      new BadRequestException('Customer not found in this organization'),
    );

    await expect(
      service.projectNormalizedInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId: 'wa-1',
          initialContext: { customerId: 'cust-foreign' },
        },
        event: whatsappEvent('evt-bad-tenant'),
      }),
    ).rejects.toMatchObject({
      code: CommunicationNormalizationErrorCode.TENANT_CONTEXT_REJECTED,
    });
    expect(events.appendEventIdempotently).not.toHaveBeenCalled();
  });

  it('bumps lastActivityAt atomically via repository', async () => {
    const newer = new Date('2026-08-21T12:00:00Z');
    const older = new Date('2026-08-21T11:00:00Z');
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation({
        id: 'cc-voice',
        channel: CommunicationChannel.VOICE,
        nativeConversationId: 'voice-native-1',
        lastActivityAt: newer,
      }),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-old' } as any,
      created: true,
    });

    await service.projectNormalizedInput({
      ...voiceInput(
        CommunicationProviderIdentity.TWILIO,
        CommunicationEventType.CALL_CONNECTED,
        'CA-old',
      ),
      event: {
        ...voiceInput(
          CommunicationProviderIdentity.TWILIO,
          CommunicationEventType.CALL_CONNECTED,
          'CA-old',
        ).event,
        occurredAt: older,
      },
    });

    expect(conversations.bumpLastActivityAt).toHaveBeenCalledWith(
      'org-1',
      'cc-voice',
      older,
      expect.anything(),
    );
    for (const [, , patch] of conversations.updateConversationProjection.mock.calls) {
      expect(patch.lastActivityAt).toBeUndefined();
    }
  });

  it('accepts TWILIO then ELEVENLABS events on same Voice conversation', async () => {
    const conversation = baseConversation({
      id: 'cc-voice',
      channel: CommunicationChannel.VOICE,
      nativeConversationId: 'voice-native-1',
      customerId: 'cust-1',
    });

    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation,
      created: false,
    });
    events.appendEventIdempotently
      .mockResolvedValueOnce({ event: { id: 'ev-twilio' } as any, created: true })
      .mockResolvedValueOnce({ event: { id: 'ev-el' } as any, created: true });

    const twilio = await service.projectNormalizedInput(
      voiceInput(
        CommunicationProviderIdentity.TWILIO,
        CommunicationEventType.CALL_STARTED,
        'CA123',
      ),
    );
    const eleven = await service.projectNormalizedInput(
      voiceInput(
        CommunicationProviderIdentity.ELEVENLABS,
        CommunicationEventType.AI_INTENT_DETECTED,
        'el-evt-1',
      ),
    );

    expect(twilio.conversationId).toBe('cc-voice');
    expect(eleven.conversationId).toBe('cc-voice');
    expect(events.appendEventIdempotently).toHaveBeenCalledTimes(2);
  });

  it('wraps transaction failures as PROJECTION_FAILURE', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(
      service.projectNormalizedInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId: 'wa-1',
        },
        event: whatsappEvent('evt-fail'),
      }),
    ).rejects.toMatchObject({
      code: CommunicationNormalizationErrorCode.PROJECTION_FAILURE,
    });
  });

  it('does not persist when persist=false after validation', async () => {
    const result = await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.EMAIL,
        nativeConversationId: 'outbound-1',
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_DELIVERED,
        occurredAt: new Date(),
        providerIdentity: CommunicationProviderIdentity.RESEND,
        providerEventId: 'resend-1',
        idempotencyKey: buildCanonicalIdempotencyKey({
          organizationId: 'org-1',
          channel: CommunicationChannel.EMAIL,
          providerIdentity: CommunicationProviderIdentity.RESEND,
          eventType: CommunicationEventType.MESSAGE_DELIVERED,
          nativeConversationId: 'outbound-1',
          providerEventId: 'resend-1',
        }),
      },
      persist: false,
    });

    expect(result.eventCreated).toBe(false);
    expect(conversations.ensureConversationEnvelope).not.toHaveBeenCalled();
  });

  it('forwards convergent status on replay', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation(),
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-existing' } as any,
      created: false,
    });

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: whatsappEvent('evt-hr', CommunicationEventType.HUMAN_REQUIRED),
      projection: { status: CommunicationConversationStatus.HUMAN_REQUIRED },
    });

    expect(conversations.updateConversationProjection).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ status: CommunicationConversationStatus.HUMAN_REQUIRED }),
      expect.anything(),
    );
  });

  it('still returns projection result when context enrichment throws', async () => {
    const enrichment = {
      enrichAfterProjection: jest.fn().mockRejectedValue(new Error('resolver down')),
    };
    const serviceWithEnrichment = new CommunicationProjectionService(
      prisma,
      conversations,
      events,
      tenantContext,
      enrichment as any,
    );

    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: baseConversation(),
      created: true,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });
    conversations.bumpLastActivityAt.mockResolvedValue(baseConversation());
    conversations.incrementUnreadCount.mockResolvedValue(baseConversation());

    const result = await serviceWithEnrichment.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: whatsappEvent('evt-enrich-fail'),
      projection: { unreadDelta: 1 },
    });

    expect(result.conversationId).toBe('cc-1');
    expect(enrichment.enrichAfterProjection).toHaveBeenCalled();
  });
});
