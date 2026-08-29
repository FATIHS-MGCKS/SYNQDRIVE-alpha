import { TripRouteArtifactMaterializerService } from './trip-route-artifact-materializer.service';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import { VehicleTripRouteArtifactRepository } from './vehicle-trip-route-artifact.repository';

function makeRepository() {
  return {
    upsertRouteArtifact: jest.fn(),
  } as unknown as jest.Mocked<VehicleTripRouteArtifactRepository>;
}

const TENANT_POINTS = [
  { latitude: 52.52, longitude: 13.4, recordedAt: '2026-08-01T10:00:00.000Z' },
  { latitude: 52.53, longitude: 13.41, recordedAt: '2026-08-01T10:00:07.000Z' },
];

describe('TripRouteArtifactMaterializerService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let service: TripRouteArtifactMaterializerService;

  beforeEach(() => {
    repository = makeRepository();
    service = new TripRouteArtifactMaterializerService(repository);
  });

  it('Z — artifact upsert idempotency delegates to repository', async () => {
    repository.upsertRouteArtifact.mockResolvedValue({
      action: 'UNCHANGED',
      artifact: { id: 'art-1' } as any,
      previousFingerprint: 'fp',
    });

    const outcome = await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.action).toBe('UNCHANGED');
    expect(repository.upsertRouteArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        routeQuality: 'FILTERED',
        algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
        matchedGeometry: null,
      }),
      expect.objectContaining({ organizationId: 'org-1', tripId: 'trip-1' }),
    );
  });

  it('AA — tenant scope passed through repository', async () => {
    repository.upsertRouteArtifact.mockResolvedValue({
      action: 'CREATED',
      artifact: { id: 'art-1' } as any,
      previousFingerprint: null,
    });

    await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    expect(repository.upsertRouteArtifact).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleOrganizationId: 'org-1',
        vehicleId: 'veh-1',
        tripVehicleId: 'veh-1',
      }),
    );
  });

  it('AB — transient repository error does not throw; previous artifact preserved by repository', async () => {
    repository.upsertRouteArtifact.mockRejectedValue(new Error('db timeout'));

    const outcome = await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.retryable).toBe(true);
      expect(outcome.error).toMatch(/db timeout/);
    }
  });

  it('never writes MATCHED quality', async () => {
    repository.upsertRouteArtifact.mockResolvedValue({
      action: 'CREATED',
      artifact: { id: 'art-1' } as any,
      previousFingerprint: null,
    });

    await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    const writeArg = repository.upsertRouteArtifact.mock.calls[0][0];
    expect(writeArg.routeQuality).not.toBe('MATCHED');
  });
});
