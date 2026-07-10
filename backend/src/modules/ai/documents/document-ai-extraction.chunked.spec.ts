import { DocumentAiExtractionService } from './document-ai-extraction.service';
import { DocumentChunkingService } from './document-chunking.service';
import { DocumentExtractionMergeService } from './document-extraction-merge.service';

describe('DocumentAiExtractionService chunked extraction', () => {
  const fields = [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'odometerKm', label: 'Odometer', type: 'number' },
  ];

  const conf = {
    aiExtractionEnabled: true,
    chunkTargetChars: 200,
    chunkMaxChars: 400,
    chunkMaxPages: 200,
    chunkMaxChunks: 12,
    chunkOverlapChars: 0,
  };

  it('extracts across multiple chunks and merges deterministically', async () => {
    const completeJson = jest.fn().mockImplementation(async ({ messages }) => {
      const user = messages.find((m: any) => m.role === 'user')?.content ?? '';
      if (user.includes('2026-01-10')) {
        return {
          data: {
            documentType: 'SERVICE',
            fields: { eventDate: '2026-01-10', odometerKm: null },
            recommendedHumanReviewNotes: [],
          },
          model: 'json-model',
        };
      }
      return {
        data: {
          documentType: 'SERVICE',
          fields: { eventDate: null, odometerKm: 88000 },
          recommendedHumanReviewNotes: ['late page mileage'],
        },
        model: 'json-model',
      };
    });

    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson,
    };

    const svc = new DocumentAiExtractionService(
      llm as any,
      new DocumentChunkingService(),
      new DocumentExtractionMergeService(),
      conf as any,
    );

    const page1 = 'Service date 2026-01-10. '.repeat(8);
    const page2 = 'Odometer reading 88000 km at end of document. '.repeat(8);

    const res = await svc.extract({
      documentType: 'SERVICE',
      fields,
      documentContent: {
        text: `${page1}\n${page2}`,
        pageBoundaryReliable: true,
        pages: [
          {
            pageNumber: 1,
            text: page1,
            sourceMethod: 'TEXT_LAYER',
            hasReliablePageBoundaries: true,
          },
          {
            pageNumber: 2,
            text: page2,
            sourceMethod: 'TEXT_LAYER',
            hasReliablePageBoundaries: true,
          },
        ],
      },
    });

    expect(res.success).toBe(true);
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(res.fields).toEqual({ eventDate: '2026-01-10', odometerKm: 88000 });
    expect(res.chunking?.chunkCount).toBe(2);
    expect(res.recommendedHumanReviewNotes).toEqual(
      expect.arrayContaining(['late page mileage']),
    );
  });

  it('propagates provider failure from a middle chunk without re-OCR', async () => {
    const completeJson = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          documentType: 'SERVICE',
          fields: { eventDate: '2026-01-10' },
          recommendedHumanReviewNotes: [],
        },
        model: 'json-model',
      })
      .mockRejectedValueOnce(new Error('HTTP 429 rate limit exceeded'));

    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson,
    };

    const svc = new DocumentAiExtractionService(
      llm as any,
      new DocumentChunkingService(),
      new DocumentExtractionMergeService(),
      conf as any,
    );

    const res = await svc.extract({
      documentType: 'SERVICE',
      fields,
      documentContent: {
        text: 'a\n\nb',
        pageBoundaryReliable: false,
        pages: [
          { pageNumber: null, text: 'a'.repeat(300), sourceMethod: 'TXT_DIRECT', hasReliablePageBoundaries: false },
          { pageNumber: null, text: 'b'.repeat(300), sourceMethod: 'TXT_DIRECT', hasReliablePageBoundaries: false },
        ],
      },
    });

    expect(res.success).toBe(false);
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(res.error).toMatch(/429|rate limit/i);
  });
});
