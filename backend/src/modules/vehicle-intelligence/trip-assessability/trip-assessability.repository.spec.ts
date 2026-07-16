import { TripAssessabilityRepository } from './trip-assessability.repository';
import {
  TRIP_ASSESSABILITY_POLICY_VERSION,
  type TripAssessabilityPolicyResult,
} from './trip-assessability.types';

function makePrisma() {
  return {
    vehicleTrip: { findFirst: jest.fn() },
    tripAssessability: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;
}

describe('TripAssessabilityRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: TripAssessabilityRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new TripAssessabilityRepository(prisma);
  });

  it('scopes findByTrip to organization + trip', async () => {
    prisma.tripAssessability.findMany.mockResolvedValue([]);
    await repository.findByTrip('org-1', 'trip-1');
    expect(prisma.tripAssessability.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', tripId: 'trip-1' },
      orderBy: { dimension: 'asc' },
    });
  });

  it('upserts dimension row with tenant trip check', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.tripAssessability.upsert.mockResolvedValue({ id: 'row-1' });

    await repository.upsertDimensionAssessment({
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
      dimension: 'ROUTE',
      status: 'ASSESSABLE',
      reasons: [],
      coverage: 0.9,
      effectiveCadenceMs: 5000,
      p95CadenceMs: 8000,
      capabilityVersion: 'cap-probe-v1',
      inputWindowStart: new Date('2026-07-16T08:00:00Z'),
      inputWindowEnd: new Date('2026-07-16T08:45:00Z'),
      calculatedAt: new Date('2026-07-16T09:00:00Z'),
      policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
    });

    expect(prisma.tripAssessability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_tripId_dimension: {
            organizationId: 'org-1',
            tripId: 'trip-1',
            dimension: 'ROUTE',
          },
        },
        create: expect.objectContaining({
          vehicleId: 'vehicle-1',
          status: 'ASSESSABLE',
          coverage: 0.9,
          policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
        }),
      }),
    );
  });

  it('bulk upserts all dimensions from policy result', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
    prisma.tripAssessability.upsert.mockResolvedValue({ id: 'row' });

    const result: TripAssessabilityPolicyResult = {
      policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
      calculatedAt: new Date('2026-07-16T09:00:00Z'),
      inputWindowStart: new Date('2026-07-16T08:00:00Z'),
      inputWindowEnd: new Date('2026-07-16T08:45:00Z'),
      dimensions: [
        {
          dimension: 'ROUTE',
          status: 'ASSESSABLE',
          reasons: [],
          coverage: 0.9,
          effectiveCadenceMs: 5000,
          p95CadenceMs: 8000,
          capabilityVersion: 'cap-probe-v1',
          inputWindowStart: new Date('2026-07-16T08:00:00Z'),
          inputWindowEnd: new Date('2026-07-16T08:45:00Z'),
          calculatedAt: new Date('2026-07-16T09:00:00Z'),
          policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
        },
        {
          dimension: 'NATIVE_BEHAVIOR',
          status: 'LIMITED',
          reasons: ['NO_NATIVE_EVENTS'],
          coverage: null,
          effectiveCadenceMs: null,
          p95CadenceMs: null,
          capabilityVersion: 'cap-probe-v1',
          inputWindowStart: new Date('2026-07-16T08:00:00Z'),
          inputWindowEnd: new Date('2026-07-16T08:45:00Z'),
          calculatedAt: new Date('2026-07-16T09:00:00Z'),
          policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
        },
      ],
    };

    const rows = await repository.upsertPolicyResult('org-1', 'vehicle-1', 'trip-1', result);
    expect(rows).toHaveLength(2);
    expect(prisma.tripAssessability.upsert).toHaveBeenCalledTimes(2);
  });
});
