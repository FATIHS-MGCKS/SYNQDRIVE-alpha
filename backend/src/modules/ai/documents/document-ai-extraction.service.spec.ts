import { DocumentAiExtractionService } from './document-ai-extraction.service';

describe('DocumentAiExtractionService', () => {
  const fields = [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'odometerKm', label: 'Odometer', type: 'number' },
    { key: 'workshopName', label: 'Workshop', type: 'string' },
  ];

  it('returns failure when AI extraction is disabled', async () => {
    const llm = { isConfigured: jest.fn().mockReturnValue(true), activeProviderId: 'mistral' };
    const svc = new DocumentAiExtractionService(llm as any, { aiExtractionEnabled: false } as any);

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
    const svc = new DocumentAiExtractionService(llm as any, { aiExtractionEnabled: true } as any);

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
    const svc = new DocumentAiExtractionService(llm as any, { aiExtractionEnabled: true } as any);

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
