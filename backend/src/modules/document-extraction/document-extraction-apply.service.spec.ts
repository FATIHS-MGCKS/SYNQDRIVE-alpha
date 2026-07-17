import { BadRequestException } from '@nestjs/common';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { BrakeEvidenceSource } from '@prisma/client';
import { FINE_HEARING_FORM_COMPLETE, FINE_PAYMENT_NOTICE_COMPLETE } from './__fixtures__/document-fine-fixtures';

describe('DocumentExtractionApplyService — brake AI upload', () => {
  const brakeLifecycleService = {
    recordService: jest.fn().mockResolvedValue({
      serviceEventId: 'evt-1',
      lifecycleApplied: true,
      initialized: true,
    }),
  };
  const brakeEvidenceService = {
    recordMany: jest.fn().mockResolvedValue({ count: 2 }),
  };

  const svc = new DocumentExtractionApplyService(
    {} as any,
    brakeLifecycleService as any,
    brakeEvidenceService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('creates BrakeEvidence with AI_UPLOAD after user-confirmed brake document apply', async () => {
    await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'BRAKE',
      sourceFileUrl: 'https://example.com/report.pdf',
      confirmedData: {
        eventDate: '2026-06-01',
        odometerKm: 45000,
        frontPadMm: 6.5,
        rearPadMm: 6.0,
        frontDiscMm: 24,
        rearDiscMm: 23,
        workshopName: 'Test Werkstatt',
      },
    });

    expect(brakeLifecycleService.recordService).toHaveBeenCalled();
    expect(brakeEvidenceService.recordMany).toHaveBeenCalledTimes(1);
    const rows = brakeEvidenceService.recordMany.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe(BrakeEvidenceSource.AI_UPLOAD);
    expect(rows[0].measuredPadMm).toBe(6.5);
    expect(rows[1].measuredPadMm).toBe(6);
  });
});

describe('DocumentExtractionApplyService — FINE apply gate', () => {
  const finesService = { create: jest.fn().mockResolvedValue({ id: 'fine-1' }) };
  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
  };

  const svc = new DocumentExtractionApplyService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    finesService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-1' });
  });

  it('applies a complete payment notice without default offense type', async () => {
    await svc.apply({
      extractionId: 'ext-fine-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      sourceFileUrl: 'https://example.com/fine.pdf',
      confirmedData: FINE_PAYMENT_NOTICE_COMPLETE,
    });

    expect(finesService.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        amountCents: 1750,
        offenseType: 'Parkverstoß',
        fineNumber: 'REF-2025-991',
      }),
    );
  });

  it('blocks Anhörungsbogen apply', async () => {
    await expect(
      svc.apply({
        extractionId: 'ext-hearing-1',
        vehicleId: 'veh-1',
        documentType: 'FINE',
        sourceFileUrl: null,
        confirmedData: FINE_HEARING_FORM_COMPLETE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(finesService.create).not.toHaveBeenCalled();
  });
});
