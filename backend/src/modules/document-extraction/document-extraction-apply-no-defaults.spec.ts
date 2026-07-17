import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { evaluateDocumentApplySafety } from './document-apply-safety.policy';
import { missingFieldsFromApplyReasons } from './document-apply-safety-fields.util';

describe('DocumentExtractionApplyService — no invented apply defaults', () => {
  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    vehicleServiceEvent: {
      create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    },
    vendor: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const finesService = { create: jest.fn().mockResolvedValue({ id: 'fine-1' }) };
  const invoicesService = { create: jest.fn().mockResolvedValue({ id: 'inv-1' }) };
  const damagesService = { create: jest.fn().mockResolvedValue({ id: 'dmg-1' }) };
  const brakeLifecycleService = {
    recordService: jest.fn().mockResolvedValue({ serviceEventId: 'evt-brake' }),
  };
  const brakeEvidenceService = { recordMany: jest.fn().mockResolvedValue({ count: 2 }) };

  const svc = new DocumentExtractionApplyService(
    prisma as any,
    brakeLifecycleService as any,
    brakeEvidenceService as any,
    {} as any,
    {} as any,
    {} as any,
    damagesService as any,
    invoicesService as any,
    finesService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ organizationId: 'org-1' });
    (prisma.vehicleServiceEvent.create as jest.Mock).mockResolvedValue({ id: 'evt-1' });
  });

  it('does not apply SERVICE with eventDate ?? now — missing date fails', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'SERVICE',
      sourceFileUrl: null,
      confirmedData: { odometerKm: 10000 },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('EVENT_DATE_REQUIRED');
    expect(prisma.vehicleServiceEvent.create).not.toHaveBeenCalled();
  });

  it('does not apply BRAKE with eventDate ?? now — missing date fails', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'BRAKE',
      sourceFileUrl: null,
      confirmedData: { serviceKind: 'full_brake_service' },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('EVENT_DATE_REQUIRED');
    expect(brakeLifecycleService.recordService).not.toHaveBeenCalled();
  });

  it('does not default BRAKE serviceKind to full_brake_service', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'BRAKE',
      sourceFileUrl: null,
      confirmedData: { eventDate: '2026-01-15' },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('BRAKE_SERVICE_KIND_REQUIRED');
    expect(brakeLifecycleService.recordService).not.toHaveBeenCalled();
  });

  it('does not apply INVOICE with invoiceDate ?? now', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'INVOICE',
      sourceFileUrl: null,
      confirmedData: {
        totalCents: 11900,
        lineItems: [{ description: 'Work', quantity: 1, unitPriceNetCents: 10000, taxRate: 19 }],
      },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('INVOICE_DATE_REQUIRED');
    expect(invoicesService.create).not.toHaveBeenCalled();
  });

  it('does not default FINE offenseType to Parkverstoß', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      sourceFileUrl: null,
      confirmedData: { eventDate: '2026-01-15', totalCents: 5000 },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('FINE_OFFENSE_TYPE_REQUIRED');
    expect(finesService.create).not.toHaveBeenCalled();
  });

  it('does not default FINE amountCents ?? 0', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      sourceFileUrl: null,
      confirmedData: { eventDate: '2026-01-15', offenseType: 'Geschwindigkeit' },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('FINE_POSITIVE_AMOUNT_REQUIRED');
    expect(finesService.create).not.toHaveBeenCalled();
  });

  it('does not default DAMAGE damageType to SCRATCH or severity to MODERATE', async () => {
    const missingType = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'DAMAGE',
      sourceFileUrl: null,
      confirmedData: { description: 'Kratzer', severity: 'MODERATE' },
    });
    expect(missingType.success).toBe(false);
    expect(missingType.errors).toContain('DAMAGE_TYPE_REQUIRED');

    const missingSeverity = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'DAMAGE',
      sourceFileUrl: null,
      confirmedData: { description: 'Kratzer', damageType: 'SCRATCH' },
    });
    expect(missingSeverity.success).toBe(false);
    expect(missingSeverity.errors).toContain('DAMAGE_SEVERITY_REQUIRED');
    expect(damagesService.create).not.toHaveBeenCalled();
  });

  it('does not synthesize invoice line items with taxRate = 19', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'INVOICE',
      sourceFileUrl: null,
      confirmedData: {
        invoiceDate: '2026-01-15',
        totalCents: 11900,
      },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('INVOICE_LINE_ITEMS_REQUIRED');
    expect(invoicesService.create).not.toHaveBeenCalled();
  });

  it('does not invent invoice line item description or quantity defaults', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'INVOICE',
      sourceFileUrl: null,
      confirmedData: {
        invoiceDate: '2026-01-15',
        totalCents: 11900,
        lineItems: [{ unitPriceNetCents: 10000, taxRate: 19 }],
      },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('INVOICE_LINE_ITEM_FIELDS_REQUIRED');
    expect(invoicesService.create).not.toHaveBeenCalled();
  });

  it('does not auto-extend TÜV validUntil when missing', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'TUV_REPORT',
      sourceFileUrl: null,
      confirmedData: { eventDate: '2026-01-15' },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('TUV_VALID_UNTIL_REQUIRED');
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('does not auto-extend BOKraft validUntil when missing', async () => {
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'BOKRAFT_REPORT',
      sourceFileUrl: null,
      confirmedData: { eventDate: '2026-01-15' },
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('BOKRAFT_VALID_UNTIL_REQUIRED');
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('uses confirmed validUntil for TÜV without year extension', async () => {
    (prisma.vehicle.update as jest.Mock).mockResolvedValue({});
    const result = await svc.apply({
      extractionId: 'ext-1',
      vehicleId: 'veh-1',
      documentType: 'TUV_REPORT',
      sourceFileUrl: null,
      confirmedData: { eventDate: '2026-01-15', validUntil: '2028-03-01' },
    });
    expect(result.success).toBe(true);
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastTuvDate: expect.any(Date),
          nextTuvDate: expect.any(Date),
        }),
      }),
    );
    const updateCall = (prisma.vehicle.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.nextTuvDate.toISOString()).toContain('2028-03-01');
  });
});

describe('evaluateDocumentApplySafety — missingFields for UI', () => {
  it('maps FINE offense type blocker to offenseType field', () => {
    const result = evaluateDocumentApplySafety({
      documentType: 'FINE',
      confirmedData: { eventDate: '2026-01-15', totalCents: 5000 },
      vehicleId: 'veh-1',
    });
    expect(result.decision).toBe('BLOCKED');
    expect(result.reasons).toContain('FINE_OFFENSE_TYPE_REQUIRED');
    expect(result.missingFields).toContain('offenseType');
  });

  it('maps TÜV validUntil blocker to validUntil field', () => {
    const result = evaluateDocumentApplySafety({
      documentType: 'TUV_REPORT',
      confirmedData: { eventDate: '2026-01-15' },
      vehicleId: 'veh-1',
    });
    expect(result.decision).toBe('DRAFT_ONLY');
    expect(result.missingFields).toContain('validUntil');
    expect(missingFieldsFromApplyReasons(result.reasons)).toContain('validUntil');
  });

  it('allows SERVICE without validUntil', () => {
    const result = evaluateDocumentApplySafety({
      documentType: 'SERVICE',
      confirmedData: { eventDate: '2026-01-15' },
      vehicleId: 'veh-1',
    });
    expect(result.decision).toBe('APPLY_ALLOWED');
  });
});
