import { CommunicationContentService } from '../../content/communication-content.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { createCommunicationHandoffNotificationMock } from '../../testing/communication-handoff-notification.mock';
import { MetaWhatsAppCommunicationAdapter } from './meta-whatsapp-communication.adapter';
import { WhatsAppCommunicationProjectionIntegration } from './whatsapp-communication-projection.integration';
import { WhatsAppConversationStatus, WhatsAppMessageDeliveryStatus } from '@prisma/client';

describe('WhatsAppCommunicationProjectionIntegration', () => {
  const featureFlags = {
    isWhatsAppProjectionEnabled: jest.fn(),
  } as unknown as jest.Mocked<CommunicationProjectionFeatureService>;
  const adapter = new MetaWhatsAppCommunicationAdapter();
  const projection = {
    projectNormalizedInput: jest.fn(),
  } as unknown as jest.Mocked<CommunicationProjectionService>;

  const contentService = {
    projectWhatsAppMessage: jest.fn().mockResolvedValue({ contentId: 'c-1', created: true, skipped: false }),
  } as unknown as jest.Mocked<CommunicationContentService>;

  const handoffNotifications = createCommunicationHandoffNotificationMock();

  let integration: WhatsAppCommunicationProjectionIntegration;

  const conversation = {
    id: 'wa-convo-1',
    organizationId: 'org-1',
    customerId: null,
    bookingId: null,
    vehicleId: null,
    assignedTo: null,
    status: WhatsAppConversationStatus.OPEN,
    updatedAt: new Date(),
  } as any;

  const inboundMessage = {
    id: 'wa-msg-1',
    organizationId: 'org-1',
    conversationId: 'wa-convo-1',
    direction: 'incoming',
    senderType: 'customer',
    providerMessageId: 'wamid.1',
    status: WhatsAppMessageDeliveryStatus.DELIVERED,
    aiGenerated: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    integration = new WhatsAppCommunicationProjectionIntegration(
      featureFlags,
      adapter,
      projection,
      contentService,
      handoffNotifications as any,
    );
  });

  it('does not call projection when feature flag is OFF', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(false);
    await integration.projectInbound({
      conversation,
      message: inboundMessage,
      webhookExternalEventId: 'msg:wamid.1',
    });
    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
  });

  it('calls projection when feature flag is ON', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'ev-1',
      conversationCreated: true,
      eventCreated: true,
    });
    await integration.projectInbound({
      conversation,
      message: inboundMessage,
      webhookExternalEventId: 'msg:wamid.1',
    });
    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(1);
    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });

  it('swallows projection failures for native-path resilience', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockRejectedValue(new Error('db down'));
    await expect(
      integration.projectInbound({
        conversation,
        message: inboundMessage,
        webhookExternalEventId: 'msg:wamid.1',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows adapter normalization failures without rejecting', async () => {
    const throwingAdapter = {
      fromInbound: jest.fn(() => {
        throw new Error('normalization failed with PII');
      }),
    } as unknown as MetaWhatsAppCommunicationAdapter;

    const unsafeIntegration = new WhatsAppCommunicationProjectionIntegration(
      featureFlags,
      throwingAdapter,
      projection,
      contentService,
      handoffNotifications as any,
    );

    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);

    await expect(
      unsafeIntegration.projectInbound({
        conversation,
        message: inboundMessage,
        webhookExternalEventId: 'msg:wamid.1',
      }),
    ).resolves.toBeUndefined();
    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
  });

  it('notifies once when HUMAN_REQUIRED is newly created', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-handoff-1',
      conversationCreated: false,
      eventCreated: true,
    });

    await integration.projectHumanRequired({
      conversation,
      handoffReasonCode: 'LOW_CONFIDENCE',
      occurredAt: new Date(),
    });

    expect(handoffNotifications.notifyHandoffRequired).toHaveBeenCalledTimes(1);
    expect(handoffNotifications.notifyHandoffRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'cc-1',
        communicationEventId: 'evt-handoff-1',
      }),
    );
  });

  it('does not notify on HUMAN_REQUIRED replay (eventCreated=false)', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-handoff-1',
      conversationCreated: false,
      eventCreated: false,
    });

    await integration.projectHumanRequired({
      conversation,
      handoffReasonCode: 'LOW_CONFIDENCE',
      occurredAt: new Date(),
    });

    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });

  it('does not notify on AI intent projection', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-ai-1',
      conversationCreated: false,
      eventCreated: true,
    });

    await integration.projectAiIntentDetected({
      conversation,
      suggestionId: 'sug-1',
      intentCode: 'PICKUP_INFO',
      confidence: 0.9,
      occurredAt: new Date(),
    });

    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });

  it('does not notify on outbound accepted projection', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-out-1',
      conversationCreated: false,
      eventCreated: true,
    });

    await integration.projectOutboundAccepted({
      conversation,
      message: {
        ...inboundMessage,
        direction: 'outgoing',
        senderType: 'human',
        status: WhatsAppMessageDeliveryStatus.SENT,
      },
      occurredAt: new Date(),
    });

    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });

  it('projects AI intent once per suggestion id on replay', async () => {
    featureFlags.isWhatsAppProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-ai-1',
      conversationCreated: false,
      eventCreated: true,
    });

    const source = {
      conversation,
      suggestionId: 'sug-dedupe-1',
      intentCode: 'PICKUP_INFO',
      confidence: 0.9,
      occurredAt: new Date(),
    };

    await integration.projectAiIntentDetected(source);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-ai-1',
      conversationCreated: false,
      eventCreated: false,
    });
    await integration.projectAiIntentDetected(source);

    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(2);
    expect(
      projection.projectNormalizedInput.mock.calls.every(
        (call) => call[0].event.providerEventId === 'wa-ai-intent:sug-dedupe-1',
      ),
    ).toBe(true);
  });
});
