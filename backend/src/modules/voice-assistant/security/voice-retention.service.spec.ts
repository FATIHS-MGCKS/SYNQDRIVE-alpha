import { VoiceRetentionService } from './voice-retention.service';

describe('VoiceRetentionService', () => {
  const prisma = {
    voiceAgentDeployment: { findFirst: jest.fn() },
    voiceConversation: { updateMany: jest.fn() },
    voiceProviderWebhookEvent: { updateMany: jest.fn() },
    organization: { findMany: jest.fn() },
  };

  let service: VoiceRetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VoiceRetentionService(prisma as never);
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
      configSnapshot: {
        privacyRetention: {
          retentionTranscriptDays: 30,
          retentionSummaryDays: 30,
          retentionProviderPayloadDays: 7,
        },
      },
    });
    prisma.voiceConversation.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.voiceProviderWebhookEvent.updateMany.mockResolvedValue({ count: 3 });
  });

  it('purges transcripts, summaries, and webhook payloads per org policy', async () => {
    const result = await service.purgeOrganization('org-1');

    expect(result).toEqual({
      transcriptsCleared: 2,
      summariesCleared: 1,
      webhookPayloadsCleared: 3,
    });
    expect(prisma.voiceConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', transcript: { not: null } }),
        data: { transcript: null },
      }),
    );
  });
});
