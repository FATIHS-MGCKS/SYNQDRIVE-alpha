import { ChatService } from './chat.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    organizationChatAgent: {
      findUnique: jest.fn().mockResolvedValue({
        agentName: 'acme_chatagent',
        dimoAgentId: 'dimo-agent-1',
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

function makeAgents() {
  return {
    getOrCreateAgent: jest.fn().mockResolvedValue({ success: true, agentId: 'new-agent' }),
    sendMessageStream: jest.fn().mockResolvedValue({ success: true, response: 'Fleet answer' }),
    invalidateAgentCache: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ChatService — fleet_chat routing', () => {
  const orgId = 'org-uuid-1';

  it('ensureAgent uses fleet_chat useCase with orgId', async () => {
    const prisma = makePrisma({
      organizationChatAgent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          agentName: 'acme_chatagent',
          dimoAgentId: 'new-agent',
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ shortCode: 'acme', companyName: 'Acme GmbH' }),
        update: jest.fn(),
      },
    });
    const agents = makeAgents();
    const svc = new ChatService(prisma as any, agents as any);

    await svc.ensureAgent(orgId);

    expect(agents.getOrCreateAgent).toHaveBeenCalledWith({
      useCase: 'fleet_chat',
      orgId,
    });
  });

  it('sendMessage passes resolved vehicle tokenId to stream', async () => {
    const prisma = makePrisma();
    const agents = makeAgents();
    const svc = new ChatService(prisma as any, agents as any);

    await svc.sendMessage(orgId, 'What is the fuel level of B-XY 1234?');

    expect(agents.sendMessageStream).toHaveBeenCalledWith(
      'dimo-agent-1',
      expect.stringContaining('B-XY 1234'),
      [872],
      undefined,
      { useCase: 'fleet_chat', orgId },
    );
  });

  it('sendMessage without resolved vehicle sends no vehicleIds', async () => {
    const prisma = makePrisma();
    const agents = makeAgents();
    const svc = new ChatService(prisma as any, agents as any);

    await svc.sendMessage(orgId, 'How many vehicles are in the fleet?');

    expect(agents.sendMessageStream).toHaveBeenCalledWith(
      'dimo-agent-1',
      expect.any(String),
      undefined,
      undefined,
      { useCase: 'fleet_chat', orgId },
    );
  });

  it('sendMessage surfaces DNS failure with operator-friendly assistant text', async () => {
    const prisma = makePrisma();
    const agents = makeAgents();
    agents.sendMessageStream.mockResolvedValueOnce({
      success: false,
      errorKind: 'DNS_ERROR',
      errorCode: 'ENOTFOUND',
      error:
        'DIMO Agents DNS resolution failed for agents.dimo.zone. Check Docker/VPS DNS.',
    });
    const svc = new ChatService(prisma as any, agents as any);

    const result = await svc.sendMessage(orgId, 'Hello', 'en');

    expect(result.content).toContain('temporarily unavailable');
    expect(result.content).not.toContain('agents.dimo.zone');
    expect(result.content).not.toContain('ENOTFOUND');
    expect(result.content).not.toContain('getaddrinfo');
    expect(result.content).not.toContain('Docker');
  });

  it('sendMessage uses German operator copy when locale=de', async () => {
    const prisma = makePrisma();
    const agents = makeAgents();
    agents.sendMessageStream.mockResolvedValueOnce({
      success: false,
      errorKind: 'DNS_ERROR',
      errorCode: 'ENOTFOUND',
      error:
        'DIMO Agents DNS resolution failed for agents.dimo.zone. Check Docker/VPS DNS.',
    });
    const svc = new ChatService(prisma as any, agents as any);

    const result = await svc.sendMessage(orgId, 'Hallo', 'de');

    expect(result.content).toContain('vorübergehend nicht verfügbar');
    expect(result.content).not.toContain('agents.dimo.zone');
  });
});
