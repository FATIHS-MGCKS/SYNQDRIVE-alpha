import { Prisma } from '@prisma/client';
import { TireLifecycleService } from './tire-lifecycle.service';

describe('TireLifecycleService.applyMeasurementFromDocumentExtraction', () => {
  const baseInput = {
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-tire-1',
    documentActionIdempotencyKey: 'ext-tire-1:v1:fp:a1:APPLY_TIRE_MEASUREMENT',
    measurementDate: new Date('2026-03-10'),
    treadDepthUnit: 'mm' as const,
    pressureUnit: 'bar' as const,
    odometerKm: 84210,
    workshopName: 'Euromaster',
    frontLeftMm: 5.8,
    frontRightMm: 5.6,
    rearLeftMm: 6.1,
    rearRightMm: 6.0,
    documentUrl: 'storage://tire.pdf',
  };

  function createHarness() {
    const prisma = {
      vehicleTireTreadMeasurement: {
        findUnique: jest.fn(),
      },
    };
    const svc = new TireLifecycleService(
      prisma as any,
      {} as any,
      { recalculate: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(svc, 'recordMeasurement').mockResolvedValue({
      measurement: { id: 'meas-new' },
      kFactors: null,
      source: 'ai_confirmed',
    } as any);
    return { svc, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing measurement on retry', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicleTireTreadMeasurement.findUnique.mockResolvedValue({ id: 'meas-existing' });

    const result = await svc.applyMeasurementFromDocumentExtraction(baseInput);

    expect(result.measurementId).toBe('meas-existing');
    expect(result.reused).toBe(true);
    expect(svc.recordMeasurement).not.toHaveBeenCalled();
  });

  it('creates measurement linked to documentExtractionId', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicleTireTreadMeasurement.findUnique.mockResolvedValue(null);

    const result = await svc.applyMeasurementFromDocumentExtraction(baseInput);

    expect(result.measurementId).toBe('meas-new');
    expect(result.reused).toBe(false);
    expect(svc.recordMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        documentExtractionId: 'ext-tire-1',
        source: 'ai_confirmed',
      }),
    );
  });

  it('handles parallel create races via unique constraint', async () => {
    const { svc, prisma } = createHarness();
    let lookupCount = 0;
    prisma.vehicleTireTreadMeasurement.findUnique.mockImplementation(async () => {
      lookupCount += 1;
      if (lookupCount <= 2) return null;
      return { id: 'meas-raced' };
    });
    (svc.recordMeasurement as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const results = await Promise.all([
      svc.applyMeasurementFromDocumentExtraction(baseInput),
      svc.applyMeasurementFromDocumentExtraction(baseInput),
    ]);

    expect(results[0].measurementId).toBe('meas-raced');
    expect(results[1].measurementId).toBe('meas-raced');
  });
});
