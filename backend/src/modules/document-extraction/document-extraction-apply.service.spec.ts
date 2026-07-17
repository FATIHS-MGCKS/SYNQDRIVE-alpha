import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { BrakeEvidenceSource } from '@prisma/client';

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
    const result = await svc.apply({
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
    expect(result.success).toBe(true);
    expect(result.downstreamEntityType).toBe('brake_service');
    expect(result.downstreamEntityId).toBe('evt-1');
    expect(result.actionCount).toBe(2);
  });

  it('returns typed failure for FINE no-op when organization is missing', async () => {
    const finesSvc = {
      create: jest.fn(),
    };
    const fineApplySvc = new DocumentExtractionApplyService(
      {
        vehicle: {
          findUnique: jest.fn().mockResolvedValue({ organizationId: null }),
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      finesSvc as any,
    );

    const result = await fineApplySvc.apply({
      extractionId: 'ext-fine',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      sourceFileUrl: null,
      confirmedData: {
        eventDate: '2026-01-15',
        totalCents: 5000,
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('VEHICLE_ORGANIZATION_REQUIRED');
    expect(finesSvc.create).not.toHaveBeenCalled();
  });
});
