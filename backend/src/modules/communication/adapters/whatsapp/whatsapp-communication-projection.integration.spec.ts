import { CommunicationContentService } from '../../content/communication-content.service';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
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

  let integration: WhatsAppCommunicationProjectionIntegration;

  const conversation = {
    id: 'wa-convo-1',
    organizationId: 'org-1',
    customerId: null,
    bookingId: null,
    vehicleId: null,
    assignedTo: null,
    status: WhatsAppConversationStatus.OPEN,
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
});
