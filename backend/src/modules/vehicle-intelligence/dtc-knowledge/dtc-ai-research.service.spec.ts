import { DtcAiResearchService } from './dtc-ai-research.service';

function makeAgents(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    createAgent: jest.fn().mockResolvedValue({ success: true, agentId: 'a1' }),
    sendMessageStream: jest.fn(),
    ...overrides,
  };
}

const GENERIC_INPUT = {
  code: 'P0675',
  normalizedCode: 'P0675',
  language: 'de',
  mode: 'generic' as const,
};

describe('DtcAiResearchService', () => {
  it('reports disabled when DIMO agent is not configured', async () => {
    const agents = makeAgents({ isConfigured: jest.fn().mockReturnValue(false) });
    const service = new DtcAiResearchService(agents as any);
    expect(service.isEnabled()).toBe(false);
    const res = await service.research(GENERIC_INPUT);
    expect(res.success).toBe(false);
    expect(agents.createAgent).not.toHaveBeenCalled();
  });

  it('parses and sanitizes valid JSON (enum coercion, list cleanup, unsafe URLs)', async () => {
    const json = JSON.stringify({
      code: 'P0675',
      title: '  Glühkerze  ',
      standardType: 'generic',
      systemCategory: 'powertrain',
      shortDescription: 'Bedeutung',
      possibleCauses: ['a', 'b', '', 'c'],
      possibleEffects: ['x'],
      technicalUrgency: 'medium',
      rentalUrgency: 'weird-value',
      rentalRecommendation: 'check_before_next_rental',
      recommendedAction: 'tun',
      sourceType: 'mixed',
      sources: [
        { type: 'web', title: 'T', url: 'https://ok.test' },
        { title: 'bad', url: 'javascript:alert(1)' },
      ],
      needsReview: true,
    });
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response: `noise ${json} tail` }),
    });
    const service = new DtcAiResearchService(agents as any);

    const res = await service.research(GENERIC_INPUT);

    expect(res.success).toBe(true);
    const d = res.data!;
    expect(d.title).toBe('Glühkerze');
    expect(d.standardType).toBe('GENERIC');
    expect(d.systemCategory).toBe('POWERTRAIN');
    expect(d.possibleCauses).toEqual(['a', 'b', 'c']);
    expect(d.technicalUrgency).toBe('MEDIUM');
    expect(d.rentalUrgency).toBe('UNKNOWN'); // invalid → coerced
    expect(d.rentalRecommendation).toBe('CHECK_BEFORE_NEXT_RENTAL');
    expect(d.needsReview).toBe(true);
    // unsafe (non-http) URLs are dropped, https kept
    expect(d.sources?.find((s) => s.url === 'https://ok.test')).toBeTruthy();
    expect((d.sources ?? []).every((s) => !s.url || /^https?:\/\//.test(s.url))).toBe(true);
  });

  it('fails cleanly when the agent returns no JSON', async () => {
    const agents = makeAgents({
      sendMessageStream: jest.fn().mockResolvedValue({ success: true, response: 'sorry, no data' }),
    });
    const service = new DtcAiResearchService(agents as any);
    const res = await service.research(GENERIC_INPUT);
    expect(res.success).toBe(false);
  });

  it('recreates the agent once and retries on 404/410 expiry', async () => {
    const valid = JSON.stringify({ title: 'x', shortDescription: 'y', possibleCauses: ['c'] });
    const sendMessageStream = jest
      .fn()
      .mockResolvedValueOnce({ success: false, statusCode: 404 })
      .mockResolvedValueOnce({ success: true, response: valid });
    const createAgent = jest
      .fn()
      .mockResolvedValueOnce({ success: true, agentId: 'a1' })
      .mockResolvedValueOnce({ success: true, agentId: 'a2' });
    const agents = makeAgents({ sendMessageStream, createAgent });
    const service = new DtcAiResearchService(agents as any);

    const res = await service.research(GENERIC_INPUT);

    expect(res.success).toBe(true);
    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(sendMessageStream).toHaveBeenCalledTimes(2);
  });

  it('sanitizes secrets out of error messages', async () => {
    const agents = makeAgents({
      sendMessageStream: jest
        .fn()
        .mockResolvedValue({ success: false, error: 'auth failed Bearer abc.def.ghi' }),
    });
    const service = new DtcAiResearchService(agents as any);
    const res = await service.research(GENERIC_INPUT);
    expect(res.success).toBe(false);
    expect(res.error).toContain('[redacted]');
    expect(res.error).not.toContain('abc.def.ghi');
  });
});
