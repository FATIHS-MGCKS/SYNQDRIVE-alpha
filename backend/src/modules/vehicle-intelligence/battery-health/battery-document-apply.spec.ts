import { BatteryEvidenceScope, BatteryEvidenceSourceType } from '@prisma/client';
import { BatteryHealthService } from './battery-health.service';

describe('BatteryHealthService.applyFromDocumentExtraction', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-battery-1',
    documentActionIdempotencyKey: 'ext-battery-1:v1:fp:a1:APPLY_BATTERY_MEASUREMENT',
    scope: BatteryEvidenceScope.HV,
    isReplacement: false,
    observedAt: new Date('2026-05-01'),
    odometerKm: 42000,
    workshopName: 'HV Werkstatt',
    notes: 'SOH report',
    documentUrl: 'storage://battery.pdf',
    costCents: null,
    measurementType: 'HV_BMS_REPORT',
    sohPercent: 87.5,
    voltageV: null,
    restingVoltage: null,
    crankingVoltage: null,
    chargingVoltage: null,
    temperatureC: 22,
  };

  function createHarness() {
    const prisma = {
      batteryEvidence: {
        findMany: jest.fn(),
      },
      batteryHealthSnapshot: {
        create: jest.fn(),
      },
    };
    const batteryEvidence = {
      recordMany: jest.fn().mockResolvedValue(undefined),
    };
    const serviceEvents = {
      findByDocumentExtractionId: jest.fn(),
      createFromDocumentExtraction: jest.fn(),
    };
    const svc = new BatteryHealthService(prisma as any, batteryEvidence as any, serviceEvents as any);
    return { svc, prisma, batteryEvidence, serviceEvents };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing evidence on retry without duplicate writes', async () => {
    const { svc, prisma, batteryEvidence, serviceEvents } = createHarness();
    prisma.batteryEvidence.findMany.mockResolvedValue([{ id: 'ev-1' }, { id: 'ev-2' }]);
    serviceEvents.findByDocumentExtractionId.mockResolvedValue(null);

    const result = await svc.applyFromDocumentExtraction(baseInput);

    expect(result.evidenceIds).toEqual(['ev-1', 'ev-2']);
    expect(batteryEvidence.recordMany).not.toHaveBeenCalled();
  });

  it('writes evidence with full provenance and no SOH override on LV snapshot path', async () => {
    const { svc, prisma, batteryEvidence } = createHarness();
    prisma.batteryEvidence.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'ev-soh' }]);
    prisma.batteryHealthSnapshot.create.mockResolvedValue({ id: 'snap-1' });

    const lvInput = {
      ...baseInput,
      scope: BatteryEvidenceScope.LV,
      sohPercent: null,
      voltageV: 12.6,
      restingVoltage: 12.6,
    };

    const result = await svc.applyFromDocumentExtraction(lvInput);

    expect(batteryEvidence.recordMany).toHaveBeenCalled();
    const rows = batteryEvidence.recordMany.mock.calls[0][0];
    expect(rows.every((row: { provider: string }) => row.provider === 'document_confirmed')).toBe(
      true,
    );
    expect(
      rows.some(
        (row: { sourceType: BatteryEvidenceSourceType }) =>
          row.sourceType === BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
      ),
    ).toBe(true);
    expect(prisma.batteryHealthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sohPercent: null,
          voltageV: 12.6,
        }),
      }),
    );
    expect(result.snapshotId).toBe('snap-1');
  });

  it('creates replacement service event idempotently before evidence', async () => {
    const { svc, prisma, serviceEvents } = createHarness();
    prisma.batteryEvidence.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'ev-1' }]);
    serviceEvents.createFromDocumentExtraction.mockResolvedValue({ id: 'evt-battery-1' });

    const result = await svc.applyFromDocumentExtraction({
      ...baseInput,
      isReplacement: true,
      costCents: 42000,
    });

    expect(serviceEvents.createFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BATTERY_REPLACEMENT',
        documentExtractionId: 'ext-battery-1',
      }),
    );
    expect(result.serviceEventId).toBe('evt-battery-1');
  });
});
