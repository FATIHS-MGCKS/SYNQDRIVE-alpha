import { DtcKnowledgeService } from './dtc-knowledge.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const genericRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  code: 'P0675',
  normalizedCode: 'P0675',
  language: 'de',
  systemCategory: 'POWERTRAIN',
  standardType: 'GENERIC',
  title: 'Glühkerze Zylinder 5',
  shortDescription: 'Generische Bedeutung',
  possibleCauses: ['Defekte Glühkerze'],
  possibleEffects: ['Schlechter Kaltstart'],
  technicalUrgency: 'MEDIUM',
  rentalUrgency: 'MEDIUM',
  rentalRecommendation: 'CHECK_BEFORE_NEXT_RENTAL',
  recommendedAction: 'Prüfen',
  sourceType: 'MIXED',
  sources: [{ type: 'WEB', title: 't', url: 'https://x.test' }],
  enrichmentStatus: 'READY',
  aiGenerated: true,
  needsReview: false,
  lastVerifiedAt: new Date('2026-06-13T00:00:00Z'),
  ...overrides,
});

const vehicleRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  dtcKnowledgeId: 'g1',
  code: 'P0675',
  normalizedCode: 'P0675',
  language: 'de',
  make: 'BMW',
  model: '320d',
  year: 2019,
  fuelType: 'DIESEL',
  engineCode: null,
  vehicleSpecificTitle: 'BMW-spezifisch',
  vehicleSpecificDescription: 'Fahrzeugspezifische Bedeutung',
  vehicleSpecificEffects: ['Notlauf'],
  vehicleSpecificUrgency: 'HIGH',
  vehicleRentalRecommendation: 'BLOCK_UNTIL_INSPECTED',
  recommendedAction: 'Sofort prüfen',
  sourceType: 'MIXED',
  sources: [],
  enrichmentStatus: 'READY',
  aiGenerated: true,
  needsReview: false,
  lastVerifiedAt: new Date('2026-06-13T00:00:00Z'),
  ...overrides,
});

function makeHarness() {
  const prisma = {
    dtcKnowledge: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    dtcVehicleKnowledge: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new DtcKnowledgeService(prisma as any, queue as any);
  return { prisma, queue, service };
}

const NO_VEHICLE = {};
const FULL_VEHICLE = { make: 'BMW', model: '320d', year: 2019, fuelType: 'DIESEL' };

describe('DtcKnowledgeService', () => {
  it('does NOT enrich or enqueue for an invalid DTC code', async () => {
    const { prisma, queue, service } = makeHarness();
    const dto = await service.getOrQueueForActiveFault('NOT_A_CODE', NO_VEHICLE);
    expect(dto.status).toBe('MISSING');
    expect(dto.source).toBe('MISSING');
    expect(prisma.dtcKnowledge.create).not.toHaveBeenCalled();
    expect(prisma.dtcKnowledge.update).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates a placeholder and queues a GENERIC job when knowledge is missing', async () => {
    const { prisma, queue, service } = makeHarness();
    prisma.dtcKnowledge.findUnique
      .mockResolvedValueOnce(null) // placeholder lookup
      .mockResolvedValue(genericRow({ enrichmentStatus: 'QUEUED' })); // buildDto lookup
    prisma.dtcKnowledge.create.mockResolvedValue(genericRow({ enrichmentStatus: 'MISSING' }));

    const dto = await service.getOrQueueForActiveFault('p 0675', NO_VEHICLE);

    expect(prisma.dtcKnowledge.create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, , opts] = queue.add.mock.calls[0];
    expect(name).toBe('DTC_GENERIC_ENRICHMENT');
    expect(opts.jobId).toBe('generic:P0675:de');
    expect(dto.status).toBe('QUEUED');
    expect(dto.source).toBe('PENDING');
  });

  it('does NOT enqueue a duplicate when generic knowledge is already READY', async () => {
    const { prisma, queue, service } = makeHarness();
    prisma.dtcKnowledge.findUnique.mockResolvedValue(genericRow({ enrichmentStatus: 'READY' }));

    const dto = await service.getOrQueueForActiveFault('P0675', NO_VEHICLE);

    expect(prisma.dtcKnowledge.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(dto.status).toBe('READY');
    expect(dto.source).toBe('GENERIC');
  });

  it('does NOT auto-requeue a FAILED code on the active-fault path', async () => {
    const { prisma, queue, service } = makeHarness();
    prisma.dtcKnowledge.findUnique.mockResolvedValue(genericRow({ enrichmentStatus: 'FAILED' }));

    const dto = await service.getOrQueueForActiveFault('P0675', NO_VEHICLE);

    expect(queue.add).not.toHaveBeenCalled();
    expect(dto.status).toBe('FAILED');
    expect(dto.source).toBe('FAILED');
  });

  it('re-queues a FAILED code on explicit retry', async () => {
    const { prisma, queue, service } = makeHarness();
    prisma.dtcKnowledge.findUnique.mockResolvedValue(genericRow({ enrichmentStatus: 'FAILED' }));

    await service.retry('P0675', NO_VEHICLE);

    expect(prisma.dtcKnowledge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enrichmentStatus: 'QUEUED' }) }),
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][0]).toBe('DTC_GENERIC_ENRICHMENT');
  });

  it('prefers READY vehicle-specific knowledge over generic', async () => {
    const { prisma, service } = makeHarness();
    prisma.dtcKnowledge.findUnique.mockResolvedValue(genericRow({ enrichmentStatus: 'READY' }));
    prisma.dtcVehicleKnowledge.findFirst.mockResolvedValue(vehicleRow({ enrichmentStatus: 'READY' }));

    const dto = await service.getOrQueueForActiveFault('P0675', FULL_VEHICLE);

    expect(dto.status).toBe('READY');
    expect(dto.source).toBe('VEHICLE_SPECIFIC');
    expect(dto.title).toBe('BMW-spezifisch');
    // Causes only exist at the generic level → must fall back to generic.
    expect(dto.possibleCauses).toEqual(['Defekte Glühkerze']);
    expect(dto.rentalRecommendation).toBe('BLOCK_UNTIL_INSPECTED');
  });

  it('getReadyGenericByCodes returns only READY rows keyed by normalized code', async () => {
    const { prisma, service } = makeHarness();
    prisma.dtcKnowledge.findMany.mockResolvedValue([genericRow({ enrichmentStatus: 'READY' })]);

    const map = await service.getReadyGenericByCodes(['p 0675', 'not-a-code']);

    expect(map.size).toBe(1);
    expect(map.get('P0675')?.status).toBe('READY');
    // invalid codes are filtered before the DB query
    const whereArg = prisma.dtcKnowledge.findMany.mock.calls[0][0].where;
    expect(whereArg.normalizedCode.in).toEqual(['P0675']);
    expect(whereArg.enrichmentStatus).toBe('READY');
  });
});
