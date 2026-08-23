import { BadRequestException } from '@nestjs/common';
import { CommunicationChannel, VoiceConversationDirection } from '@prisma/client';
import {
  COMMUNICATION_VOICE_FILTER_NATIVE_ID_LIMIT,
  CommunicationReadRepository,
} from './communication-read.repository';

describe('CommunicationReadRepository voice filter bounds (C9.2)', () => {
  it('rejects voice filters that exceed the native ID safety bound', async () => {
    const prisma = {
      voiceConversation: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: COMMUNICATION_VOICE_FILTER_NATIVE_ID_LIMIT + 1 }, (_, index) => ({
            id: `voice-${index}`,
          })),
        ),
      },
    };
    const repository = new CommunicationReadRepository(prisma as never);

    await expect(
      repository.listConversations('org-1', {
        channel: [CommunicationChannel.VOICE],
        callDirection: VoiceConversationDirection.INBOUND,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
