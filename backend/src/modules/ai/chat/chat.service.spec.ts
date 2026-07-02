import { ChatService } from './chat.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    organizationChatAgent: {
      findUnique: jest.fn().mockResolvedValue({
        agentName: 'acme_chatagent',
        dimoAgentId: 'mistral',
      }),
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      create: jest.fn().mockResolvedValue({
        id: 'msg-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    vehicle: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'veh-1',
          licensePlate: 'B-XY 1234',
          vehicleName: 'Golf 1',
          make: 'VW',
          model: 'Golf',
          year: 2020,
          vin: 'WVWZZZ1JZYW000001',
          fuelType: 'PETROL',
          dimoVehicle: { tokenId: 872 },
        },
      ]),
    },
  };
  return { ...base, ...overrides };
}

function makeLlm(overrides: Record<string, unknown> = {}) {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    isStreamingEnabled: jest.fn().mockReturnValue(false),
    activeProviderId: 'mistral',
    complete: jest.fn().mockResolvedValue({ content: 'Fleet answer' }),
    stream: jest.fn(),
    ...overrides,
  };
}

describe('ChatService — Mistral fleet chat', () => {
  const orgId = 'org-uuid-1';

  it('ensureAgent registers provider id in organizationChatAgent', async () => {
    const prisma = makePrisma({
      organizationChatAgent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          agentName: 'acme_chatagent',
          dimoAgentId: 'mistral',
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ shortCode: 'acme', companyName: 'Acme GmbH' }),
        update: jest.fn(),
      },
    });
    const llm = makeLlm();
    const svc = new ChatService(prisma as any, llm as any);

    const result = await svc.ensureAgent(orgId);

    expect(result.dimoAgentId).toBe('mistral');
    expect(prisma.organizationChatAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dimoAgentId: 'mistral' }),
      }),
    );
  });

  it('sendMessage enriches fleet context and calls Mistral complete', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const svc = new ChatService(prisma as any, llm as any);

    await svc.sendMessage(orgId, 'What is the fuel level of B-XY 1234?');

    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'chat',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: expect.stringContaining('B-XY 1234') }),
        ]),
      }),
    );
  });

  it('sendMessage returns config error when LLM is not configured', async () => {
    const prisma = makePrisma();
    const llm = makeLlm({ isConfigured: jest.fn().mockReturnValue(false) });
    const svc = new ChatService(prisma as any, llm as any);

    const result = await svc.sendMessage(orgId, 'Hello');

    expect(result.content).toMatch(/not configured/i);
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
