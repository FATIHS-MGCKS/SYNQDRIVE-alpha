import { VehicleTripRouteArtifactRepository } from './vehicle-trip-route-artifact.repository';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import type { TripRouteArtifactTenantContext, TripRouteArtifactWriteInput } from './trip-route.types';

function makePrisma() {
  return {
    vehicleTrip: { findFirst: jest.fn() },
    vehicleTripRouteArtifact: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

const TENANT: TripRouteArtifactTenantContext = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  tripId: 'trip-1',
  tripVehicleId: 'veh-1',
  vehicleOrganizationId: 'org-1',
};

const MATCHED_LINE = [
  [13.4, 52.5],
  [13.41, 52.51],
  [13.42, 52.52],
] as TripRouteArtifactWriteInput['matchedGeometry'];

function writeInput(
  overrides: Partial<TripRouteArtifactWriteInput> = {},
): TripRouteArtifactWriteInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    routeQuality: 'MATCHED',
    matchedGeometry: MATCHED_LINE,
    algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
    inputFingerprint: 'fp-1',
    sourcePointCount: 100,
    filteredPointCount: 80,
    matchedPointCount: 240,
    chunkCount: 4,
    failedChunkCount: 0,
    matchConfidence: 0.9,
    matchCoverage: 0.95,
    provider: 'mapbox',
    processedAt: new Date('2026-08-29T12:00:00.000Z'),
    ...overrides,
  };
}

describe('VehicleTripRouteArtifactRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: VehicleTripRouteArtifactRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new VehicleTripRouteArtifactRepository(prisma);
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'veh-1' });
  });

  it('A — creates artifact for trip', async () => {
    prisma.vehicleTripRouteArtifact.findUnique.mockResolvedValue(null);
    prisma.vehicleTripRouteArtifact.create.mockResolvedValue({
      id: 'art-1',
      tripId: 'trip-1',
      inputFingerprint: 'fp-1',
    });

    const result = await repository.upsertRouteArtifact(writeInput(), TENANT);
    expect(result.action).toBe('CREATED');
    expect(prisma.vehicleTripRouteArtifact.create).toHaveBeenCalled();
  });

  it('B — enforces unique 1:1 via tripId upsert path', async () => {
    prisma.vehicleTripRouteArtifact.findUnique.mockResolvedValue({
      id: 'art-1',
      tripId: 'trip-1',
      inputFingerprint: 'fp-old',
      algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
    });
    prisma.vehicleTripRouteArtifact.update.mockResolvedValue({
      id: 'art-1',
      tripId: 'trip-1',
      inputFingerprint: 'fp-new',
    });

    const result = await repository.upsertRouteArtifact(
      writeInput({ inputFingerprint: 'fp-new' }),
      TENANT,
    );
    expect(result.action).toBe('UPDATED');
    expect(prisma.vehicleTripRouteArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: 'trip-1' } }),
    );
  });

  it('returns UNCHANGED when fingerprint and algorithm version match', async () => {
    prisma.vehicleTripRouteArtifact.findUnique.mockResolvedValue({
      id: 'art-1',
      tripId: 'trip-1',
      inputFingerprint: 'fp-1',
      algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
    });

    const result = await repository.upsertRouteArtifact(writeInput(), TENANT);
    expect(result.action).toBe('UNCHANGED');
    expect(prisma.vehicleTripRouteArtifact.update).not.toHaveBeenCalled();
    expect(prisma.vehicleTripRouteArtifact.create).not.toHaveBeenCalled();
  });

  it('Q — tenant-scoped retrieval uses organizationId filter', async () => {
    prisma.vehicleTripRouteArtifact.findFirst.mockResolvedValue(null);
    await repository.getRouteArtifact('org-1', 'trip-1');
    expect(prisma.vehicleTripRouteArtifact.findFirst).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', organizationId: 'org-1' },
    });
  });

  it('rejects tenant mismatch on upsert', async () => {
    await expect(
      repository.upsertRouteArtifact(
        writeInput({ vehicleId: 'veh-other' }),
        TENANT,
      ),
    ).rejects.toThrow(/tenant context/i);
  });
});

describe('TripsService list path does not include route artifact', () => {
  it('R — findByVehicle query has no routeArtifact include', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../trips.service.ts'),
      'utf8',
    );
    expect(src).toMatch(/findMany\(\{[\s\S]*?where,/);
    expect(src).not.toMatch(/routeArtifact/);
  });
});
