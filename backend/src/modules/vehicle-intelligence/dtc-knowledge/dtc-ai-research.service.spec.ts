import { DtcAiResearchService } from './dtc-ai-research.service';

describe('DtcAiResearchService', () => {
  const baseInput = {
    code: 'P0420',
    normalizedCode: 'P0420',
    language: 'de',
    mode: 'generic' as const,
  };

  it('returns failure when LLM is not configured', async () => {
    const llm = { isConfigured: jest.fn().mockReturnValue(false) };
    const service = new DtcAiResearchService(llm as any);

    const res = await service.research(baseInput);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not configured/i);
  });

  it('parses structured JSON from Mistral gateway', async () => {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      completeJson: jest.fn().mockResolvedValue({
        data: {
          code: 'P0420',
          title: 'Katalysator-Wirkungsgrad unter Schwellwert',
          shortDescription: 'Katalysator arbeitet nicht effizient genug.',
          possibleCauses: ['Defekter Katalysator'],
          possibleEffects: ['Erhöhter Schadstoffausstoß'],
          technicalUrgency: 'MEDIUM',
          rentalUrgency: 'MEDIUM',
          rentalRecommendation: 'CHECK_BEFORE_NEXT_RENTAL',
          recommendedAction: 'Diagnose in Werkstatt',
          sourceType: 'MIXED',
          sources: [],
          needsReview: false,
        },
      }),
    };
    const service = new DtcAiResearchService(llm as any);

    const res = await service.research(baseInput);
    expect(res.success).toBe(true);
    expect(res.data?.title).toContain('Katalysator');
    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: 'synqdrive_dtc_research' }),
    );
  });

  it('returns failure when structured output has no usable content', async () => {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      completeJson: jest.fn().mockResolvedValue({
        data: {
          code: 'P0420',
          possibleCauses: [],
          possibleEffects: [],
          sources: [],
          needsReview: true,
        },
      }),
    };
    const service = new DtcAiResearchService(llm as any);

    const res = await service.research(baseInput);
    expect(res.success).toBe(false);
  });
});
