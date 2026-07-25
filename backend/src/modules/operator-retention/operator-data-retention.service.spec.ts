import { Prisma } from '@prisma/client';
import { PIPELINE_PLAUSIBILITY_KEY } from '@modules/document-extraction/document-content-cache.util';
import { OperatorDataRetentionService } from './operator-data-retention.service';

describe('OperatorDataRetentionService', () => {
  const retentionConfig = {
    enabled: true,
    dryRun: true,
    batchSize: 100,
    maxBatchesPerRun: 200,
    policyVersion: '2026-07-25',
    handoverDraftTtlHours: 72,
    days: {
      abandonedHandoverDraft: 7,
      handoverSignatureBitmap: 365,
      operatorOrphanExtraction: 30,
      operatorExtractionOcrCache: 90,
    },
    backup: { note: 'test' },
  };

  function makeService(overrides: {
    drafts?: unknown[];
    protocols?: unknown[];
    extractions?: unknown[];
    ocrRows?: unknown[];
    legalHoldActive?: boolean;
    hasDownstream?: boolean;
  } = {}) {
    const draftFindMany = jest.fn().mockResolvedValue(overrides.drafts ?? []);
    const draftDelete = jest.fn().mockResolvedValue({});
    const protocolFindMany = jest.fn().mockResolvedValue(overrides.protocols ?? []);
    const protocolUpdate = jest.fn().mockResolvedValue({});
    const extractionFindMany = jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.fileDeletedAt) return overrides.ocrRows ?? [];
        return overrides.extractions ?? [];
      });
    const extractionDelete = jest.fn().mockResolvedValue({});
    const extractionUpdate = jest.fn().mockResolvedValue({});

    const prisma = {
      operatorHandoverDraft: { findMany: draftFindMany, delete: draftDelete },
      bookingHandoverProtocol: { findMany: protocolFindMany, update: protocolUpdate },
      vehicleDocumentExtraction: {
        findMany: extractionFindMany,
        delete: extractionDelete,
        update: extractionUpdate,
      },
    };

    const legalHold = {
      isActive: jest.fn().mockResolvedValue(overrides.legalHoldActive ?? false),
    };

    const lifecycle = {
      hasDownstreamLinks: jest.fn().mockReturnValue(overrides.hasDownstream ?? false),
    };

    const svc = new OperatorDataRetentionService(
      prisma as any,
      retentionConfig as any,
      legalHold as any,
      lifecycle as any,
    );

    return {
      svc,
      prisma,
      legalHold,
      lifecycle,
      draftFindMany,
      draftDelete,
      protocolUpdate,
      extractionDelete,
      extractionUpdate,
    };
  }

  const operatorPlausibility = {
    [PIPELINE_PLAUSIBILITY_KEY]: {
      uploadContext: { candidate: { sourceSurface: 'operator_app' } },
      lifecycle: { legalHold: { active: false } },
      contentCache: { pages: [{ text: 'ocr' }] },
    },
  };

  it('returns empty report when retention is disabled', async () => {
    const { svc } = makeService();
    const disabled = new OperatorDataRetentionService(
      {} as any,
      { ...retentionConfig, enabled: false } as any,
      { isActive: jest.fn() } as any,
      { hasDownstreamLinks: jest.fn() } as any,
    );

    const report = await disabled.runOnce({ trigger: 'manual' });
    expect(report.phases).toHaveLength(0);
    expect(report.totals.affected).toBe(0);
  });

  it('deletes expired handover drafts when dry-run is false', async () => {
    const { svc, draftDelete } = makeService({
      drafts: [
        { id: 'draft-1', organizationId: 'org-1', bookingId: 'booking-1' },
      ],
    });

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false });
    const phase = report.phases.find((p) => p.phase === 'abandoned_handover_draft');
    expect(phase?.affected).toBe(1);
    expect(draftDelete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
  });

  it('skips handover drafts under booking evidence legal hold', async () => {
    const { svc, draftDelete } = makeService({
      drafts: [
        { id: 'draft-1', organizationId: 'org-1', bookingId: 'booking-1' },
      ],
      legalHoldActive: true,
    });

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false });
    const phase = report.phases.find((p) => p.phase === 'abandoned_handover_draft');
    expect(phase?.skipped).toBe(1);
    expect(phase?.affected).toBe(0);
    expect(draftDelete).not.toHaveBeenCalled();
  });

  it('redacts signature bitmaps on old handover protocols', async () => {
    const { svc, protocolUpdate } = makeService({
      protocols: [
        { id: 'proto-1', organizationId: 'org-1', bookingId: 'booking-1' },
      ],
    });

    await svc.runOnce({ trigger: 'manual', dryRun: false, organizationId: 'org-1' });
    expect(protocolUpdate).toHaveBeenCalledWith({
      where: { id: 'proto-1' },
      data: {
        customerSignatureDataUrl: null,
        staffSignatureDataUrl: null,
      },
    });
  });

  it('scopes draft cleanup by organizationId', async () => {
    const { svc, draftFindMany } = makeService();
    await svc.runOnce({ trigger: 'manual', organizationId: 'org-tenant' });
    expect(draftFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant' }),
      }),
    );
  });

  it('deletes orphan operator extractions without downstream links', async () => {
    const { svc, extractionDelete } = makeService({
      extractions: [
        {
          id: 'ext-1',
          organizationId: 'org-1',
          plausibility: operatorPlausibility,
          _count: {
            fines: 0,
            orgInvoices: 0,
            damages: 0,
            serviceEvents: 0,
            batteryEvidence: 0,
            brakeEvidence: 0,
            tireTreadMeasurements: 0,
          },
        },
      ],
    });

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false });
    const phase = report.phases.find((p) => p.phase === 'operator_orphan_extraction');
    expect(phase?.affected).toBe(1);
    expect(extractionDelete).toHaveBeenCalledWith({ where: { id: 'ext-1' } });
  });

  it('skips orphan extractions with downstream links', async () => {
    const { svc, extractionDelete } = makeService({
      extractions: [
        {
          id: 'ext-1',
          organizationId: 'org-1',
          plausibility: operatorPlausibility,
          _count: {
            fines: 0,
            orgInvoices: 0,
            damages: 1,
            serviceEvents: 0,
            batteryEvidence: 0,
            brakeEvidence: 0,
            tireTreadMeasurements: 0,
          },
        },
      ],
      hasDownstream: true,
    });

    const report = await svc.runOnce({ trigger: 'manual', dryRun: false });
    const phase = report.phases.find((p) => p.phase === 'operator_orphan_extraction');
    expect(phase?.skipped).toBe(1);
    expect(extractionDelete).not.toHaveBeenCalled();
  });

  it('strips OCR cache from soft-deleted operator extractions', async () => {
    const { svc, extractionUpdate } = makeService({
      ocrRows: [
        {
          id: 'ext-ocr',
          organizationId: 'org-1',
          plausibility: operatorPlausibility,
        },
      ],
    });

    await svc.runOnce({ trigger: 'manual', dryRun: false });
    expect(extractionUpdate).toHaveBeenCalled();
    const plausibility = extractionUpdate.mock.calls[0][0].data.plausibility;
    const pipeline = (plausibility as Record<string, unknown>)[PIPELINE_PLAUSIBILITY_KEY] as Record<
      string,
      unknown
    >;
    expect(pipeline.contentCache).toBeUndefined();
  });
});
