import { Prisma } from '@prisma/client';
import { BrakeLifecycleService, type BrakeLifecycleScope } from './brake-lifecycle.service';

describe('BrakeLifecycleService.applyFromDocumentExtraction', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-brake-1',
    documentActionIdempotencyKey: 'ext-brake-1:v1:fp:a1:APPLY_BRAKE_MEASUREMENT',
    measurementDate: new Date('2026-04-02'),
    serviceKind: 'inspection_only' as const,
    scope: ['front_pads', 'rear_pads'] as BrakeLifecycleScope[],
    thicknessUnit: 'mm' as const,
    odometerKm: 84210,
    workshopName: 'Werkstatt Nord',
    workshopFinding: null,
    notes: null,
    documentUrl: 'storage://brake.pdf',
    frontPadMm: 6.5,
    rearPadMm: 6.0,
    frontDiscMm: 24,
    rearDiscMm: 23,
    discCondition: null,
    brakeFluidStatus: null,
    immediateReplacement: null,
  };

  function createHarness() {
    const prisma = {
      vehicleServiceEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      brakeEvidence: {
        findMany: jest.fn(),
      },
    };
    const brakeHealth = {
      initializeFromService: jest.fn().mockResolvedValue({
        initialized: true,
        message: 'initialized',
      }),
    };
    const brakeEvidence = {
      recordForDocumentExtraction: jest.fn(),
    };
    const svc = new BrakeLifecycleService(prisma as any, brakeHealth as any, brakeEvidence as any);
    return { svc, prisma, brakeHealth, brakeEvidence };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing service event and evidence on retry', async () => {
    const { svc, prisma } = createHarness();
    prisma.vehicleServiceEvent.findUnique.mockResolvedValue({
      id: 'evt-existing',
      brakeLifecycleApplied: true,
      brakeLifecycleNote: 'done',
    });
    prisma.brakeEvidence.findMany.mockResolvedValue([
      { id: 'ev-front', axle: 'FRONT' },
      { id: 'ev-rear', axle: 'REAR' },
    ]);

    const result = await svc.applyFromDocumentExtraction(baseInput);

    expect(result.serviceEventId).toBe('evt-existing');
    expect(result.evidenceIds).toEqual(['ev-front', 'ev-rear']);
    expect(prisma.vehicleServiceEvent.create).not.toHaveBeenCalled();
  });

  it('creates service event and idempotent evidence rows for confirmed brake document', async () => {
    const { svc, prisma, brakeEvidence } = createHarness();
    prisma.vehicleServiceEvent.findUnique.mockResolvedValue(null);
    prisma.brakeEvidence.findMany.mockResolvedValue([]);
    prisma.vehicleServiceEvent.create.mockResolvedValue({
      id: 'evt-new',
      brakeLifecycleApplied: null,
      brakeLifecycleNote: null,
    });
    prisma.vehicleServiceEvent.update.mockResolvedValue({});
    brakeEvidence.recordForDocumentExtraction
      .mockResolvedValueOnce({ id: 'ev-front' })
      .mockResolvedValueOnce({ id: 'ev-rear' });

    const result = await svc.applyFromDocumentExtraction(baseInput);

    expect(result.serviceEventId).toBe('evt-new');
    expect(result.evidenceIds).toEqual(['ev-front', 'ev-rear']);
    expect(prisma.vehicleServiceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentExtractionId: 'ext-brake-1',
          organizationId: 'org-1',
          eventType: 'BRAKE_SERVICE',
        }),
      }),
    );
    expect(brakeEvidence.recordForDocumentExtraction).toHaveBeenCalledTimes(2);
  });

  it('recovers service event from unique race and still writes evidence', async () => {
    const { svc, prisma, brakeEvidence } = createHarness();
    prisma.vehicleServiceEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'evt-raced',
        brakeLifecycleApplied: false,
        brakeLifecycleNote: null,
      });
    prisma.brakeEvidence.findMany.mockResolvedValue([]);
    prisma.vehicleServiceEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.vehicleServiceEvent.update.mockResolvedValue({});
    brakeEvidence.recordForDocumentExtraction.mockResolvedValue({ id: 'ev-front' });

    const result = await svc.applyFromDocumentExtraction(baseInput);

    expect(result.serviceEventId).toBe('evt-raced');
    expect(brakeEvidence.recordForDocumentExtraction).toHaveBeenCalled();
  });
});
