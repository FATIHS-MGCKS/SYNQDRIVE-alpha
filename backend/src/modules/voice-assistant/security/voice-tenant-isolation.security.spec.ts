import { VoiceWebhookCorrelationService } from '@modules/voice-webhook-ingestion/voice-webhook-correlation.service';

describe('Voice tenant isolation', () => {
  const prisma = {
    voiceConversation: { findFirst: jest.fn() },
    voiceAssistant: { findFirst: jest.fn() },
    voiceAgentDeployment: { findFirst: jest.fn() },
    voicePhoneNumber: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    voiceToolExecution: { findFirst: jest.fn() },
  };

  let correlation: VoiceWebhookCorrelationService;

  beforeEach(() => {
    correlation = new VoiceWebhookCorrelationService(prisma as never);
  });

  it('rejects cross-tenant correlation matches', () => {
    expect(() =>
      correlation.assertOrganizationMatch('org-a', { organizationId: 'org-b' }),
    ).toThrow('Cross-tenant correlation mismatch');
  });

  it('allows correlation when organization matches', () => {
    expect(() =>
      correlation.assertOrganizationMatch('org-a', { organizationId: 'org-a' }),
    ).not.toThrow();
  });

  it('does not resolve external IDs without organization scope', async () => {
    prisma.voiceConversation.findFirst.mockResolvedValue(null);
    prisma.voiceAssistant.findFirst.mockResolvedValue(null);

    const keys = await correlation.resolveFromTwilioForm(null, {
      CallSid: 'CA123',
      To: '+491701234567',
    });

    expect(keys.organizationId).toBeFalsy();
    expect(prisma.voiceConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ twilioCallSid: 'CA123' }),
      }),
    );
    const callArgs = prisma.voiceConversation.findFirst.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBeUndefined();
  });
});
