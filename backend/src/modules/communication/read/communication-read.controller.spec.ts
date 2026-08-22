import { CommunicationReadController } from './communication-read.controller';
import { CommunicationReadService } from './communication-read.service';

describe('CommunicationReadController', () => {
  const service = {
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    listConversationEvents: jest.fn(),
    summarizeConversations: jest.fn(),
    listAttentionPreview: jest.fn(),
  } as unknown as CommunicationReadService;

  const controller = new CommunicationReadController(service);

  it('delegates list to CommunicationReadService', async () => {
    (service.listConversations as jest.Mock).mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    await controller.listConversations('org-1', {});
    expect(service.listConversations).toHaveBeenCalledWith('org-1', {});
  });
});
