import { ChatService } from './chat.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import { AiVehicleResolutionService } from '../vehicle-resolution/ai-vehicle-resolution.service';
import { VehicleStatus } from '@prisma/client';

const ORG_ID = 'org-uuid-1';
const VEHICLE_ID = 'veh-1';

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
          id: VEHICLE_ID,
          organizationId: ORG_ID,
          licensePlate: 'B-XY 1234',
          vehicleName: 'Golf 1',
          make: 'VW',
          model: 'Golf',
          year: 2020,
          vin: 'WVWZZZ1JZYW000001',
          fuelType: 'PETROL',
          status: VehicleStatus.AVAILABLE,
          currentStationId: 'station-1',
          dimoVehicle: { tokenId: 872 },
        },
      ]),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(null),
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
    const vehicleResolution = new AiVehicleResolutionService(prisma as any);
    const svc = new ChatService(prisma as any, llm as any, vehicleResolution);

    const result = await svc.ensureAgent(ORG_ID);

    expect(result.dimoAgentId).toBe('mistral');
    expect(prisma.organizationChatAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dimoAgentId: 'mistral' }),
      }),
    );
  });

  it('sendMessage enriches fleet context via structured vehicle resolver', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const vehicleResolution = new AiVehicleResolutionService(prisma as any);
    const svc = new ChatService(prisma as any, llm as any, vehicleResolution);

    await svc.sendMessage(ORG_ID, 'What is the fuel level of B-XY 1234?');

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID },
      }),
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'chat',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringMatching(/B-XY 1234/),
          }),
        ]),
      }),
    );
    const userMessage = (llm.complete as jest.Mock).mock.calls[0][0].messages.find(
      (message: { role: string }) => message.role === 'user',
    ).content as string;
    expect(userMessage).toContain('Resolved fleet vehicle');
    expect(userMessage).not.toContain('WVWZZZ');
    expect(userMessage).not.toContain(VEHICLE_ID);
  });

  it('sendMessage returns config error when LLM is not configured', async () => {
    const prisma = makePrisma();
    const llm = makeLlm({ isConfigured: jest.fn().mockReturnValue(false) });
    const vehicleResolution = new AiVehicleResolutionService(prisma as any);
    const svc = new ChatService(prisma as any, llm as any, vehicleResolution);

    const result = await svc.sendMessage(ORG_ID, 'Hello');

    expect(result.content).toMatch(/not configured/i);
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
