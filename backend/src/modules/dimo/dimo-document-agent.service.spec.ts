import { DimoDocumentAgentService, DocAgentField } from './dimo-document-agent.service';

type AgentsMock = {
  isConfigured: jest.Mock;
  createAgent: jest.Mock;
  sendMessageStream: jest.Mock;
};

function makeAgents(overrides: Partial<AgentsMock> = {}): AgentsMock {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    createAgent: jest.fn().mockResolvedValue({ success: true, agentId: 'agent-1' }),
    sendMessageStream: jest.fn().mockResolvedValue({ success: true, response: '{}' }),
    ...overrides,
  };
}

const SERVICE_FIELDS: DocAgentField[] = [
  { key: 'eventDate', label: 'Date', type: 'date' },
  { key: 'odometerKm', label: 'Odometer', type: 'number' },
  { key: 'workshopName', label: 'Workshop', type: 'string' },
  { key: 'description', label: 'Description', type: 'string' },
];

const TIRE_FIELDS: DocAgentField[] = [
  { key: 'treadDepthMm.fl', label: 'FL', type: 'number' },
  { key: 'treadDepthMm.fr', label: 'FR', type: 'number' },
  { key: 'treadDepthMm.rl', label: 'RL', type: 'number' },
  { key: 'treadDepthMm.rr', label: 'RR', type: 'number' },
];

describe('DimoDocumentAgentService', () => {
  it('returns a sanitized failure when the agent layer is disabled', async () => {
    const agents = makeAgents();
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: false } as any);

    const res = await svc.extract({
      documentType: 'SERVICE',
      fields: SERVICE_FIELDS,
      rawText: 'text',
      dimoTokenId: 123,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not configured/i);
    expect(res.dimoContextAvailable).toBe(true); // token was present
    expect(agents.createAgent).not.toHaveBeenCalled();
  });

  it('returns a failure when DIMO credentials are not configured', async () => {
    const agents = makeAgents({ isConfigured: jest.fn().mockReturnValue(false) });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    const res = await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 't' });
    expect(res.success).toBe(false);
    expect(res.dimoContextAvailable).toBe(false);
  });

  it('parses structured JSON, drops unknown keys, and keeps notes', async () => {
    const response = JSON.stringify({
      documentType: 'SERVICE',
      fields: {
        eventDate: '2026-01-10',
        odometerKm: 50000,
        workshopName: 'ABC Garage',
        injectedKey: 'should be dropped',
      },
      recommendedHumanReviewNotes: ['verify mileage', 42],
    });
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response }),
    });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    const res = await svc.extract({
      documentType: 'SERVICE',
      fields: SERVICE_FIELDS,
      rawText: 'raw doc text',
      dimoTokenId: 777,
    });

    expect(res.success).toBe(true);
    expect(res.fields).toEqual({
      eventDate: '2026-01-10',
      odometerKm: 50000,
      workshopName: 'ABC Garage',
      description: null,
    });
    expect(res.fields).not.toHaveProperty('injectedKey');
    expect(res.recommendedHumanReviewNotes).toEqual(['verify mileage']); // non-strings filtered
    expect(res.dimoContextAvailable).toBe(true);

    // The vehicle tokenId is forwarded to the agent for vehicle-aware context.
    expect(agents.sendMessageStream).toHaveBeenCalledWith('agent-1', expect.any(String), [777]);
  });

  it('builds a strict JSON-only prompt with no confidence fields', async () => {
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response: '{}' }),
    });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);
    await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 'doc' });

    const prompt = agents.sendMessageStream.mock.calls[0][1] as string;
    expect(prompt).toMatch(/Return only valid JSON/i);
    expect(prompt).toMatch(/no field-level confidence/i);
    expect(prompt).toMatch(/Do not invent values/i);
  });

  it('normalizes empty / "null" / "n/a" string values to null', async () => {
    const response = JSON.stringify({
      fields: { eventDate: '   ', workshopName: 'N/A', description: 'null', odometerKm: 10 },
    });
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response }),
    });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    const res = await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 't' });
    expect(res.fields).toEqual({
      eventDate: null,
      workshopName: null,
      description: null,
      odometerKm: 10,
    });
  });

  it('parses nested measurement objects (treadDepthMm)', async () => {
    const response = JSON.stringify({
      fields: { treadDepthMm: { fl: 5, fr: '6', rl: 'null', rr: null } },
    });
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response }),
    });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    const res = await svc.extract({ documentType: 'TIRE', fields: TIRE_FIELDS, rawText: 't' });
    expect(res.fields).toEqual({ treadDepthMm: { fl: 5, fr: '6', rl: null, rr: null } });
  });

  it('recreates the agent once when the cached agent has expired (404)', async () => {
    const sendMessageStream = jest
      .fn()
      .mockResolvedValueOnce({ success: false, statusCode: 404 })
      .mockResolvedValueOnce({ success: true, response: '{"fields":{}}' });
    const agents = makeAgents({ sendMessageStream });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    const res = await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 't' });
    expect(res.success).toBe(true);
    expect(agents.createAgent).toHaveBeenCalledTimes(2); // initial + recreate
    expect(sendMessageStream).toHaveBeenCalledTimes(2);
  });

  it('reuses a cached agentId across calls', async () => {
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response: '{"fields":{}}' }),
    });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 't' });
    await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 't2' });
    expect(agents.createAgent).toHaveBeenCalledTimes(1);
  });

  it('sanitizes thrown errors and never leaks bearer tokens', async () => {
    const agents = makeAgents({
      createAgent: jest.fn().mockRejectedValue(new Error('failed Bearer abc.def.ghi while creating')),
    });
    const svc = new DimoDocumentAgentService(agents as any, { dimoAgentEnabled: true } as any);

    const res = await svc.extract({ documentType: 'SERVICE', fields: SERVICE_FIELDS, rawText: 't' });
    expect(res.success).toBe(false);
    expect(res.error).not.toMatch(/abc\.def\.ghi/);
    expect(res.error).toMatch(/Bearer \[redacted\]/);
  });
});
