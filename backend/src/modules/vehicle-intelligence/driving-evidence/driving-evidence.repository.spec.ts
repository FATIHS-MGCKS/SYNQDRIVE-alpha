import { BadRequestException } from '@nestjs/common';
import { DrivingEvidenceRepository } from './driving-evidence.repository';
import { DRIVING_EVIDENCE_CONTRACT_VERSION } from './driving-evidence.types';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleTrip: { findFirst: jest.fn() },
    drivingEvidence: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;
}

function baseInput() {
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    sourceType: 'RECONSTRUCTED_EVENT' as const,
    strength: 'MEDIUM' as const,
    observedAt: new Date('2026-07-16T10:00:00Z'),
    providerSource: 'HF_LOCAL',
    capabilityVersion: 'cap-v1',
    modelVersion: 'hf-detector-v2',
    sourceEntity: { table: 'trip_behavior_events', id: 'tbe-1' },
    context: { category: 'BRAKING', classification: 'HARD' },
    idempotencyKey: 'org-1:tbe-1',
  };
}

describe('DrivingEvidenceRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: DrivingEvidenceRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new DrivingEvidenceRepository(prisma);
  });

  it('scopes findByTrip to organization + trip', async () => {
    prisma.drivingEvidence.findMany.mockResolvedValue([]);
    await repository.findByTrip('org-1', 'trip-1');
    expect(prisma.drivingEvidence.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', tripId: 'trip-1' },
      orderBy: { observedAt: 'asc' },
    });
  });

  it('creates immutable evidence with tenant checks', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.drivingEvidence.findUnique.mockResolvedValue(null);
    prisma.drivingEvidence.create.mockResolvedValue({ id: 'ev-1' });

    const { row, created } = await repository.createImmutable(baseInput());
    expect(created).toBe(true);
    expect(row).toEqual({ id: 'ev-1' });
    expect(prisma.drivingEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          sourceType: 'RECONSTRUCTED_EVENT',
          misuseCaseEligible: true,
          contractVersion: DRIVING_EVIDENCE_CONTRACT_VERSION,
        }),
      }),
    );
  });

  it('returns existing row on idempotent replay without update', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.drivingEvidence.findUnique.mockResolvedValue({ id: 'ev-existing' });

    const { row, created } = await repository.createImmutable(baseInput());
    expect(created).toBe(false);
    expect(row).toEqual({ id: 'ev-existing' });
    expect(prisma.drivingEvidence.create).not.toHaveBeenCalled();
  });

  it('stores CONTEXT_SIGNAL with misuseCaseEligible false', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' });
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.drivingEvidence.findUnique.mockResolvedValue(null);
    prisma.drivingEvidence.create.mockResolvedValue({ id: 'ev-ctx' });

    await repository.createImmutable({
      ...baseInput(),
      sourceType: 'CONTEXT_SIGNAL',
      sourceEntity: { table: 'driving_events', id: 'ctx-1' },
      idempotencyKey: 'org-1:ctx-1',
      context: { assessment: 'RPM_SPIKE' },
    });

    expect(prisma.drivingEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'CONTEXT_SIGNAL',
          misuseCaseEligible: false,
        }),
      }),
    );
  });

  it('rejects invalid contract before persistence', async () => {
    await expect(
      repository.createImmutable({
        ...baseInput(),
        sourceType: 'MEASURED_SIGNAL',
        context: { isEstimated: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.drivingEvidence.create).not.toHaveBeenCalled();
  });
});
