import { CommunicationProviderIdentity } from '@prisma/client';
import { CommunicationProjectionService } from '../../communication-projection.service';
import { CommunicationProjectionFeatureService } from '../../communication-projection-feature.service';
import { createCommunicationHandoffNotificationMock } from '../../testing/communication-handoff-notification.mock';
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
  const handoffNotifications = createCommunicationHandoffNotificationMock();

  let integration: VoiceCommunicationProjectionIntegration;
  let warnSpy: jest.SpyInstance;

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
      handoffNotifications as any,
    );
    warnSpy = jest.spyOn(integration['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
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

  it('swallows adapter normalization failures without leaking error text', async () => {
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
      handoffNotifications as any,
    );
    const unsafeWarn = jest.spyOn(unsafe['logger'], 'warn').mockImplementation(() => undefined);
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    await expect(
      unsafe.projectCallStarted({
        conversation,
        providerEventId: 'CA1:voice',
        occurredAt: new Date(),
      }),
    ).resolves.toBeUndefined();
    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
    const payload = JSON.parse(unsafeWarn.mock.calls[0]?.[0] as string);
    expect(payload.providerIdentity).toBe(CommunicationProviderIdentity.TWILIO);
    expect(JSON.stringify(payload)).not.toContain('transcript');
    unsafeWarn.mockRestore();
  });

  it('logs ElevenLabs provider identity on post-call projection failure', async () => {
    const throwingElevenLabs = {
      fromCallEnded: jest.fn(() => {
        throw new Error('elevenlabs normalization failed');
      }),
    } as unknown as ElevenLabsVoiceCommunicationAdapter;
    const unsafe = new VoiceCommunicationProjectionIntegration(
      featureFlags,
      twilioAdapter,
      throwingElevenLabs,
      projection,
      handoffNotifications as any,
    );
    const unsafeWarn = jest.spyOn(unsafe['logger'], 'warn').mockImplementation(() => undefined);
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    await unsafe.projectCallEnded({
      conversation,
      providerEventId: 'el:post:ended',
      occurredAt: new Date(),
    });
    const payload = JSON.parse(unsafeWarn.mock.calls[0]?.[0] as string);
    expect(payload.providerIdentity).toBe(CommunicationProviderIdentity.ELEVENLABS);
    expect(payload.eventType).toBe('CALL_ENDED');
    unsafeWarn.mockRestore();
  });

  it('projects Twilio inbound + connected without duplicate CALL_STARTED from ringing', async () => {
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
      externalEventId: 'CA1:status:ringing',
      provider: 'TWILIO',
      conversation,
      payload: { CallStatus: 'ringing' },
    });
    await integration.projectFromProcessedWebhook({
      organizationId: 'org-1',
      eventType: 'twilio.voice.status',
      externalEventId: 'CA1:status:in-progress',
      provider: 'TWILIO',
      conversation: { ...conversation, lifecycleState: VoiceConversationLifecycleState.CONNECTED },
      payload: { CallStatus: 'in-progress' },
    });

    const eventTypes = projection.projectNormalizedInput.mock.calls.map(
      (call) => call[0].event.eventType,
    );
    expect(eventTypes.filter((t) => t === 'CALL_STARTED')).toHaveLength(1);
    expect(eventTypes).toContain('CALL_CONNECTED');
    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });

  it('does not fabricate AI_INTENT_DETECTED from active ElevenLabs session alone', async () => {
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'ev-1',
      conversationCreated: false,
      eventCreated: false,
    });

    await integration.projectFromProcessedWebhook({
      organizationId: 'org-1',
      eventType: 'elevenlabs.conversation',
      externalEventId: 'el:conv:1',
      provider: 'ELEVENLABS',
      conversation: { ...conversation, lifecycleState: VoiceConversationLifecycleState.AI_ACTIVE },
      payload: { status: 'in_progress' },
    });

    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });

  it('notifies once when HUMAN_REQUIRED is newly created', async () => {
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-handoff-1',
      conversationCreated: false,
      eventCreated: true,
    });

    await integration.projectHumanRequired({
      conversation,
      providerEventId: 'voice-human:1',
      providerIdentity: 'ELEVENLABS',
      handoffReasonCode: 'ESCALATION',
      occurredAt: new Date(),
    });

    expect(handoffNotifications.notifyHandoffRequired).toHaveBeenCalledTimes(1);
  });

  it('does not notify on HUMAN_REQUIRED replay (eventCreated=false)', async () => {
    featureFlags.isVoiceProjectionEnabled.mockReturnValue(true);
    projection.projectNormalizedInput.mockResolvedValue({
      conversationId: 'cc-1',
      eventId: 'evt-handoff-1',
      conversationCreated: false,
      eventCreated: false,
    });

    await integration.projectHumanRequired({
      conversation,
      providerEventId: 'voice-human:1',
      providerIdentity: 'ELEVENLABS',
      handoffReasonCode: 'ESCALATION',
      occurredAt: new Date(),
    });

    expect(handoffNotifications.notifyHandoffRequired).not.toHaveBeenCalled();
  });
});
