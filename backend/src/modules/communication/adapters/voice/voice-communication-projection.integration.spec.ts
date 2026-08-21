import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { TwilioVoiceCommunicationAdapter } from './twilio-voice-communication.adapter';
import { ElevenLabsVoiceCommunicationAdapter } from './elevenlabs-voice-communication.adapter';
import { VoiceCommunicationProjectionIntegration } from './voice-communication-projection.integration';
import { VoiceConversationDirection, VoiceConversationLifecycleState } from '@prisma/client';

describe('VoiceCommunicationProjectionIntegration', () => {
  const featureFlags = {
    isVoiceProjectionEnabled: jest.fn(),
  } as unknown as jest.Mocked<CommunicationProjectionFeatureService>;
  const twilioAdapter = new TwilioVoiceCommunicationAdapter();
  const elevenLabsAdapter = new ElevenLabsVoiceCommunicationAdapter();
  const projection = {
    projectNormalizedInput: jest.fn(),
  } as unknown as jest.Mocked<CommunicationProjectionService>;

  let integration: VoiceCommunicationProjectionIntegration;

  const conversation = {
    id: 'voice-native-1',
    organizationId: 'org-1',
    direction: VoiceConversationDirection.INBOUND,
    lifecycleState: VoiceConversationLifecycleState.INITIATED,
    outcome: 'PENDING',
    metadata: {},
    twilioCallSid: 'CA1',
    durationSeconds: null,
    startedAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    integration = new VoiceCommunicationProjectionIntegration(
      featureFlags,
      twilioAdapter,
      elevenLabsAdapter,
      projection,
    );
  });

  it('does not call projection when feature flag is OFF', async () => {
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(false);
    await integration.projectCallStarted({
      conversation,
      providerEventId: 'CA1:voice',
      occurredAt: new Date(),
    });
    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
  });

  it('swallows adapter normalization failures', async () => {
    const throwingTwilio = {
      fromCallStarted: jest.fn(() => {
        throw new Error('sensitive transcript leak');
      }),
    } as unknown as TwilioVoiceCommunicationAdapter;
    const unsafe = new VoiceCommunicationProjectionIntegration(
      featureFlags,
      throwingTwilio,
      elevenLabsAdapter,
      projection,
    );
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    await expect(
      unsafe.projectCallStarted({
        conversation,
        providerEventId: 'CA1:voice',
        occurredAt: new Date(),
      }),
    ).resolves.toBeUndefined();
    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
  });

  it('projects multi-provider webhook sequence when flag ON', async () => {
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'ev-1',
      conversationCreated: true,
      eventCreated: true,
    });

    await integration.projectFromProcessedWebhook({
      organizationId: 'org-1',
      eventType: 'twilio.voice.inbound',
      externalEventId: 'CA1:voice',
      provider: 'TWILIO',
      conversation,
      payload: {},
    });
    await integration.projectFromProcessedWebhook({
      organizationId: 'org-1',
      eventType: 'twilio.voice.status',
      externalEventId: 'CA1:status:in-progress',
      provider: 'TWILIO',
      conversation: { ...conversation, lifecycleState: VoiceConversationLifecycleState.CONNECTED },
      payload: { CallStatus: 'in-progress' },
    });
    await integration.projectFromProcessedWebhook({
      organizationId: 'org-1',
      eventType: 'elevenlabs.conversation',
      externalEventId: 'el:conv:1',
      provider: 'ELEVENLABS',
      conversation: { ...conversation, lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE },
      payload: { status: 'in_progress' },
    });

    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(3);
  });
});
