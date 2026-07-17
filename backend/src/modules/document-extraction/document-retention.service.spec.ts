import { Prisma } from '@prisma/client';
import { DocumentRetentionService } from './document-retention.service';
import { PIPELINE_PLAUSIBILITY_KEY } from './document-content-cache.util';

describe('DocumentRetentionService', () => {
  const retentionConfig = {
    enabled: true,
    dryRun: true,
    batchSize: 100,
    maxBatchesPerRun: 200,
    policyVersion: '2026-07-17',
    days: {
      ocrCacheAfterSoftDelete: 90,
      sensitiveExtractedDataAfterSoftDelete: 180,
      extractionRowAfterSoftDelete: 365,
      rejectedWithoutFile: 30,
    },
  };

  function makeService(rowsByPhase: Record<string, unknown[]> = {}) {
    const findMany = jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.status === 'REJECTED') return rowsByPhase.rejected ?? [];
      if (where.extractedData) return rowsByPhase.sensitive ?? [];
      if (where.objectKey === null && where.fileDeletedAt) return rowsByPhase.final ?? [];
      if (where.plausibility) return rowsByPhase.ocr ?? [];
      return [];
    });
    const prisma = {
      vehicleDocumentExtraction: {
        findMany,
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const lifecycle = {
      hasDownstreamLinks: jest.fn().mockReturnValue(false),
      redactSensitiveExtractedData: jest.fn().mockReturnValue({ invoiceNumber: '[redacted]' }),
    };
    const svc = new DocumentRetentionService(
      prisma as any,
      retentionConfig as any,
      lifecycle as any,
    );
    return { svc, prisma, lifecycle, findMany };
  }

  const softDeletedRow = {
    id: 'ext-1',
    organizationId: 'org-1',
    fileDeletedAt: new Date('2025-01-01T00:00:00.000Z'),
    plausibility: {
      [PIPELINE_PLAUSIBILITY_KEY]: {
        contentCache: { pages: [{ text: 'ocr' }] },
        lifecycle: { legalHold: { active: false } },
      },
    },
  };

  it('returns empty report when retention is disabled', async () => {
    const { svc } = makeService();
    const disabled = new DocumentRetentionService(
      { vehicleDocumentExtraction: { findMany: jest.fn() } } as any,
      { ...retentionConfig, enabled: false } as any,
      { hasDownstreamLinks: jest.fn(), redactSensitiveExtractedData: jest.fn() } as any,
    );

    const report = await disabled.runOnce({ trigger: 'manual' });
    expect(report.phases).toHaveLength(0);
    expect(report.totals.affected).toBe(0);
  });

  it('dry-run counts OCR cache candidates without writing', async () => {
    const { svc, prisma } = makeService({ ocr: [softDeletedRow] });

    const report = await svc.runOnce({ trigger: 'manual', dryRun: true });

    const phase = report.phases.find((p) => p.phase === 'ocr_cache_after_soft_delete');
    expect(phase?.candidates).toBe(1);
    expect(phase?.affected).toBe(1);
    expect(phase?.dryRun).toBe(true);
    expect(prisma.vehicleDocumentExtraction.update).not.toHaveBeenCalled();
  });

  it('purges OCR cache when dry-run is false', async () => {
    const { svc, prisma } = makeService({ ocr: [softDeletedRow] });

    await svc.runOnce({ trigger: 'manual', dryRun: false });

    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalled();
    const plausibility = prisma.vehicleDocumentExtraction.update.mock.calls[0][0].data.plausibility;
    const pipeline = (plausibility as Record<string, unknown>)[PIPELINE_PLAUSIBILITY_KEY] as Record<
      string,
      unknown
    >;
    expect(pipeline.contentCache).toBeUndefined();
  });

  it('skips rows under legal hold', async () => {
    const { svc } = makeService({
      ocr: [
        {
          ...softDeletedRow,
          plausibility: {
            [PIPELINE_PLAUSIBILITY_KEY]: {
              contentCache: { pages: [{ text: 'ocr' }] },
              lifecycle: { legalHold: { active: true } },
            },
          },
        },
      ],
    });

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false });
    const phase = report.phases.find((p) => p.phase === 'ocr_cache_after_soft_delete');
    expect(phase?.skipped).toBe(1);
    expect(phase?.affected).toBe(0);
  });

  it('scopes queries by organizationId when provided', async () => {
    const { svc, findMany } = makeService({ ocr: [] });

    await svc.runOnce({ trigger: 'manual', organizationId: 'org-42' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-42' }),
      }),
    );
  });

  it('deletes final rows only when no downstream links exist', async () => {
    const { svc, prisma, lifecycle } = makeService({
      final: [
        {
          id: 'ext-final',
          organizationId: 'org-1',
          plausibility: { [PIPELINE_PLAUSIBILITY_KEY]: { lifecycle: { legalHold: { active: false } } } },
          _count: { fines: 0, orgInvoices: 0, damages: 0, serviceEvents: 0 },
        },
      ],
    });
    lifecycle.hasDownstreamLinks.mockReturnValueOnce(false);

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false });
    const phase = report.phases.find((p) => p.phase === 'final_row_after_soft_delete');
    expect(phase?.affected).toBe(1);
    expect(prisma.vehicleDocumentExtraction.delete).toHaveBeenCalledWith({ where: { id: 'ext-final' } });
  });

  it('redacts sensitive extracted data in apply mode', async () => {
    const { svc, prisma, lifecycle } = makeService({
      sensitive: [
        {
          id: 'ext-2',
          organizationId: 'org-1',
          extractedData: { invoiceNumber: 'INV-9' },
          plausibility: { [PIPELINE_PLAUSIBILITY_KEY]: { lifecycle: { legalHold: { active: false } } } },
        },
      ],
    });

    await svc.runOnce({ trigger: 'manual', dryRun: false });

    expect(lifecycle.redactSensitiveExtractedData).toHaveBeenCalled();
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extractedData: { invoiceNumber: '[redacted]' },
        }),
      }),
    );
  });

  it('reports disabled phase when retention days are zero', async () => {
    const { svc } = makeService();
    const zeroDays = new DocumentRetentionService(
      { vehicleDocumentExtraction: { findMany: jest.fn() } } as any,
      {
        ...retentionConfig,
        days: {
          ocrCacheAfterSoftDelete: 0,
          sensitiveExtractedDataAfterSoftDelete: 0,
          extractionRowAfterSoftDelete: 0,
          rejectedWithoutFile: 0,
        },
      } as any,
      { hasDownstreamLinks: jest.fn(), redactSensitiveExtractedData: jest.fn() } as any,
    );

    const report = await zeroDays.runOnce({ trigger: 'manual' });
    expect(report.phases.every((p) => p.notes === 'disabled (days=0)')).toBe(true);
    expect(report.totals.candidates).toBe(0);
  });
});
