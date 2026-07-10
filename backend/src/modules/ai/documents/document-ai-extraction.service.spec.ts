import { DocumentAiExtractionService } from './document-ai-extraction.service';
import { DocumentChunkingService } from './document-chunking.service';
import { DocumentExtractionMergeService } from './document-extraction-merge.service';

describe('DocumentAiExtractionService', () => {
  const fields = [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'odometerKm', label: 'Odometer', type: 'number' },
    { key: 'workshopName', label: 'Workshop', type: 'string' },
  ];

  const conf = {
    aiExtractionEnabled: true,
    chunkTargetChars: 6000,
    chunkMaxChars: 8000,
    chunkMaxPages: 200,
    chunkMaxChunks: 12,
    chunkOverlapChars: 0,
  };

  function makeService(llm: any) {
    return new DocumentAiExtractionService(
      llm,
      new DocumentChunkingService(),
      new DocumentExtractionMergeService(),
      conf as any,
    );
  }

  it('returns failure when AI extraction is disabled', async () => {
    const llm = { isConfigured: jest.fn().mockReturnValue(true), activeProviderId: 'mistral' };
    const svc = new DocumentAiExtractionService(
      llm as any,
      new DocumentChunkingService(),
      new DocumentExtractionMergeService(),
      { ...conf, aiExtractionEnabled: false } as any,
    );

    const res = await svc.extract({
      documentType: 'SERVICE',
      fields,
      rawText: 'invoice',
      dimoTokenId: 42,
    });

    expect(res.success).toBe(false);
    expect(res.dimoContextAvailable).toBe(true);
    expect(llm.isConfigured).not.toHaveBeenCalled();
  });

  it('returns failure when LLM gateway is not configured', async () => {
    const llm = { isConfigured: jest.fn().mockReturnValue(false) };
    const svc = makeService(llm as any);

    const res = await svc.extract({ documentType: 'SERVICE', fields, rawText: 'invoice' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not configured/i);
  });

  it('parses structured JSON from Mistral gateway', async () => {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson: jest.fn().mockResolvedValue({
        data: {
          documentType: 'SERVICE',
          fields: {
            eventDate: '2026-02-01',
            odometerKm: 12000,
            workshopName: 'Werkstatt Nord',
          },
          recommendedHumanReviewNotes: ['Check mileage'],
        },
        model: 'json-model',
      }),
    };
    const svc = makeService(llm as any);

    const res = await svc.extract({
      documentType: 'SERVICE',
      fields,
      rawText: 'Service invoice text',
    });

    expect(res.success).toBe(true);
    expect(res.providerId).toBe('mistral');
    expect(res.fields).toEqual({
      eventDate: '2026-02-01',
      odometerKm: 12000,
      workshopName: 'Werkstatt Nord',
    });
    expect(res.recommendedHumanReviewNotes).toEqual(['Check mileage']);
    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'json',
        schemaName: 'synqdrive_document_extraction',
      }),
    );
  });
});
